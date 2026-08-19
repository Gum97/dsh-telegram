/**
 * Telegram-backed approval answerer.
 *
 * `ctx.approval.request()` blocks a tool call until a human decides. It is a
 * different seam from `userQuestions`, and that difference is the whole reason
 * this file exists: questions use a single exclusive provider slot, while
 * approvals are a `ctx.waterfall('approval/request', …)` any number of
 * listeners may answer. `question-routing.js` therefore cannot help here, and
 * without this module a Telegram user is asked for permission in a browser
 * they may not have open.
 *
 * Getting that wrong is worse than getting a question wrong. A misrouted
 * question stalls a turn; a misrouted approval either strands the agent or —
 * far worse — grants a permission the user never saw. Every decision below is
 * shaped by that asymmetry:
 *
 * - **`allowed-once` is only ever returned after a human pressed Allow.**
 *   Nothing else in this file can produce it: not a timeout, not a Telegram
 *   API failure, not an unparseable callback. Every other path resolves to
 *   `unavailable` (fail closed) or `cancelled`, which is exactly the vocabulary
 *   the host normalizes unknown answers into anyway.
 * - **A session that is not ours calls `next()`.** That hands the request to
 *   whoever else is listening — in a web profile, the browser — so installing
 *   this channel never removes an existing surface. Uncertainty routes away
 *   from Telegram, never to a silent drop.
 * - **The listener is prepended.** A waterfall runs outermost-first and a
 *   listener that does not call `next()` vetoes the rest of the chain. The Web
 *   bridge answers unconditionally for any session it can match, so appending
 *   would leave this code unreachable in precisely the profile that needs it.
 * - **Disposal settles every pending prompt.** An approval left hanging at
 *   unload blocks the tool call forever; resolving `cancelled` unblocks the
 *   agent with the one outcome that grants nothing.
 */

import { escapeHtml } from './markdown.js';

const TOKEN_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** Short opaque token; `callback_data` is capped at 64 bytes. */
function shortId(length = 6) {
  let id = '';
  for (let i = 0; i < length; i += 1) {
    id += TOKEN_ALPHABET[Math.floor(Math.random() * TOKEN_ALPHABET.length)];
  }
  return id;
}

/** Truncate to Telegram's practical button width. */
function buttonLabel(text, max = 60) {
  const clean = String(text).replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

/**
 * Pending-prompt registry and `approval/request` answerer.
 *
 * Split from the listener wiring so the decision logic can be tested against
 * a fake Telegram API, with no cordis context in sight.
 */
export class TelegramApprovals {
  /**
   * @param {{ api: any, logger?: any }} options
   */
  constructor(options) {
    this.api = options.api;
    this.logger = options.logger ?? console;
    /** approvalToken -> pending prompt state */
    this.pending = new Map();
  }

  /**
   * Ask one chat to decide, and resolve with the host's outcome vocabulary.
   *
   * @param {{ chatId: string|number, threadId?: string }} target
   * @param {{ toolName?: string, reason?: string }} request
   * @param {AbortSignal} [signal]
   * @returns {Promise<'allowed-once'|'rejected'|'cancelled'|'unavailable'>}
   */
  async ask(target, request, signal) {
    // An already-aborted request must not post a keyboard nobody can answer.
    if (signal?.aborted) return 'cancelled';

    const token = shortId();
    const html = this.renderPrompt(request);

    let sent;
    try {
      sent = await this.api.sendHtml(target.chatId, html, {
        threadId: target.threadId,
        keyboard: [
          [
            { text: '✅ Cho phép một lần', callback_data: `a:${token}:allow` },
            { text: '⛔️ Từ chối', callback_data: `a:${token}:deny` },
          ],
        ],
      });
    } catch (error) {
      // The prompt never reached the user, so no human can possibly decide.
      // `unavailable` is the fail-closed answer the seam documents for exactly
      // this case; inventing `rejected` would misreport a delivery fault as a
      // deliberate refusal in the session's audit log.
      this.logger.warn?.('[dsh-telegram] could not deliver an approval prompt', String(error));
      return 'unavailable';
    }

    return new Promise((resolve) => {
      const state = {
        token,
        chatId: String(target.chatId),
        messageId: sent?.message_id,
        settled: false,
      };

      const settle = (outcome, decision) => {
        if (state.settled) return;
        state.settled = true;
        this.pending.delete(token);
        signal?.removeEventListener('abort', onAbort);
        if (decision) void this.freeze(state, decision);
        resolve(outcome);
      };

      state.settle = settle;

      const onAbort = () => settle('cancelled', '⏹ Đã huỷ');
      signal?.addEventListener('abort', onAbort, { once: true });

      this.pending.set(token, state);
    });
  }

  /** The prompt body: what is being asked, and why. */
  renderPrompt(request) {
    const parts = ['🔐 <b>Yêu cầu quyền</b>'];
    if (request?.toolName) parts.push('', `Công cụ: <code>${escapeHtml(request.toolName)}</code>`);
    if (request?.reason) parts.push('', escapeHtml(request.reason));
    parts.push('', '<i>Chỉ áp dụng một lần cho thao tác này.</i>');
    return parts.join('\n');
  }

  /**
   * Handle one `callback_query`. Returns true when it belonged to an approval.
   *
   * Returning true for a token this process no longer knows is deliberate: the
   * press did address an approval, and reporting it as unhandled would let the
   * caller fall through to another handler that understands it even less.
   */
  async handleCallback(query) {
    const data = String(query?.data ?? '');
    if (!data.startsWith('a:')) return false;

    const [, token, action] = data.split(':');
    const state = this.pending.get(token);

    if (!state) {
      await this.api.answerCallback(query.id, { text: 'Yêu cầu này đã kết thúc.' });
      return true;
    }

    if (action === 'allow') {
      await this.api.answerCallback(query.id, { text: 'Đã cho phép' });
      state.settle('allowed-once', '✅ Đã cho phép một lần');
      return true;
    }

    if (action === 'deny') {
      await this.api.answerCallback(query.id, { text: 'Đã từ chối' });
      state.settle('rejected', '⛔️ Đã từ chối');
      return true;
    }

    // A token that parses but carries an action this build does not know:
    // leave the prompt open rather than guessing at the user's intent.
    await this.api.answerCallback(query.id);
    return true;
  }

  /** Replace a settled prompt's keyboard with the decision it recorded. */
  async freeze(state, decision) {
    if (state.messageId === undefined) return;
    try {
      await this.api.editKeyboard(state.chatId, state.messageId, [
        [{ text: buttonLabel(decision, 64), callback_data: 'a:done:noop' }],
      ]);
    } catch (error) {
      this.logger.warn?.('[dsh-telegram] failed to freeze an approval keyboard', String(error));
    }
  }

  /**
   * Settle every pending prompt — used on plugin unload.
   *
   * `cancelled` rather than `rejected`: the user did not refuse anything, the
   * channel went away. Both are safe (neither grants), but only one is true.
   */
  disposeAll() {
    for (const state of [...this.pending.values()]) {
      state.settle('cancelled', '⏹ Kênh đã dừng');
    }
    this.pending.clear();
  }
}

/**
 * Install the `approval/request` answerer for Telegram-bound sessions.
 *
 * @param {object} params
 * @param {any} params.ctx the plugin context (needs `.on`)
 * @param {TelegramApprovals} params.approvals
 * @param {(sessionId: string) => unknown} params.resolveTarget
 *   returns a Telegram target for a session id, or a falsy value when the
 *   session belongs to another surface
 * @param {{ warn: Function, info: Function }} [params.logger]
 * @returns {{ ok: boolean, reason?: string, dispose: () => void }}
 */
export function installApprovalRouting({ ctx, approvals, resolveTarget, logger }) {
  const noop = { ok: false, reason: 'unavailable', dispose: () => {} };
  if (!ctx?.on || !approvals) return noop;

  // Prepended: a waterfall runs outermost-first, and the Web bridge answers
  // without calling `next()` for any session it can match. Appending would
  // make this listener unreachable in a web profile — the only profile where
  // it matters.
  let dispose;
  try {
    dispose = ctx.on(
      'approval/request',
      (request, next) => {
        let target;
        try {
          const sessionId = request?.agent?.session?.id ?? request?.agent?.id;
          target = sessionId ? resolveTarget(String(sessionId)) : undefined;
        } catch (error) {
          // A lookup fault must not strand the decision: defer to the rest of
          // the chain, which is where it would have gone without this plugin.
          logger?.warn?.('[dsh-telegram] approval routing failed; deferring', String(error));
          return next();
        }

        if (!target) return next();
        return approvals.ask(target, request, request?.signal);
      },
      { prepend: true },
    );
  } catch (error) {
    logger?.warn?.(
      '[dsh-telegram] approval routing could not register; permission prompts for Telegram ' +
        'sessions will appear in the Web UI.',
      String(error),
    );
    return { ok: false, reason: String(error), dispose: () => {} };
  }

  logger?.info?.(
    '[dsh-telegram] approval routing active: Telegram sessions approve in Telegram, ' +
      'every other session keeps approving in the Web UI',
  );

  // Cordis can unwind a fiber more than once, and a second dispose would
  // unregister whatever legitimately holds the slot by then.
  let disposed = false;
  return {
    ok: true,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      try {
        dispose();
      } finally {
        approvals.disposeAll();
      }
    },
  };
}
