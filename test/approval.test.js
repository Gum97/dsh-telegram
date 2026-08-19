/**
 * Approval routing.
 *
 * An approval is not a question. A question that goes astray stalls a turn; an
 * approval that goes astray either strands the agent forever or grants a
 * permission the user never saw. So these tests are weighted almost entirely
 * toward the ways this code must NOT succeed:
 *
 * - `allowed-once` must be unreachable without a human pressing Allow.
 * - anything this module cannot handle must reach the rest of the waterfall,
 *   because that is where the browser is listening.
 * - nothing may stay pending forever, since a pending approval is a blocked
 *   tool call.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { TelegramApprovals, installApprovalRouting } from '../lib/approval.js';

const quiet = { warn() {}, info() {} };

/** A Telegram API double that records calls and can be made to fail. */
function apiDouble({ sendFails = false } = {}) {
  const sent = [];
  const answered = [];
  const edits = [];
  let nextId = 100;
  return {
    sent,
    answered,
    edits,
    async sendHtml(chatId, html, options) {
      if (sendFails) throw new Error('network down');
      sent.push({ chatId, html, options });
      return { message_id: (nextId += 1) };
    },
    async answerCallback(id, payload) {
      answered.push({ id, payload });
    },
    async editKeyboard(chatId, messageId, keyboard) {
      edits.push({ chatId, messageId, keyboard });
    },
  };
}

/** Read the callback token out of the keyboard the prompt posted. */
function tokenOf(api) {
  const data = api.sent[0].options.keyboard[0][0].callback_data;
  return data.split(':')[1];
}

const target = { chatId: 42 };

/* ---------------- the decision itself ---------------- */

test('pressing Allow is the only path to a grant', async () => {
  const api = apiDouble();
  const approvals = new TelegramApprovals({ api, logger: quiet });

  const decision = approvals.ask(target, { toolName: 'bash', reason: 'needs ~/.dsh' });
  await Promise.resolve();

  await approvals.handleCallback({ id: 'cb1', data: `a:${tokenOf(api)}:allow` });
  assert.equal(await decision, 'allowed-once');
});

test('pressing Deny rejects, and rejection is not cancellation', async () => {
  // The vocabulary is load-bearing: `rejected` records a human refusal in the
  // audit log, while `cancelled` says the question went away. Collapsing them
  // would misreport what the user did.
  const api = apiDouble();
  const approvals = new TelegramApprovals({ api, logger: quiet });

  const decision = approvals.ask(target, { toolName: 'bash' });
  await Promise.resolve();

  await approvals.handleCallback({ id: 'cb1', data: `a:${tokenOf(api)}:deny` });
  assert.equal(await decision, 'rejected');
});

test('a decided prompt cannot be decided again', async () => {
  // Telegram redelivers callbacks, and a second press must not re-answer a
  // settled request — the first decision is the one the audit log recorded.
  const api = apiDouble();
  const approvals = new TelegramApprovals({ api, logger: quiet });

  const decision = approvals.ask(target, { toolName: 'bash' });
  await Promise.resolve();
  const token = tokenOf(api);

  await approvals.handleCallback({ id: 'cb1', data: `a:${token}:deny` });
  await approvals.handleCallback({ id: 'cb2', data: `a:${token}:allow` });

  assert.equal(await decision, 'rejected');
  assert.equal(approvals.pending.size, 0);
});

test('the decision replaces the keyboard, so no stale button survives', async () => {
  const api = apiDouble();
  const approvals = new TelegramApprovals({ api, logger: quiet });

  const decision = approvals.ask(target, { toolName: 'bash' });
  await Promise.resolve();
  await approvals.handleCallback({ id: 'cb1', data: `a:${tokenOf(api)}:allow` });
  await decision;

  assert.equal(api.edits.length, 1);
  assert.match(api.edits[0].keyboard[0][0].text, /cho phép/i);
});

/* ---------------- the ways it must fail ---------------- */

test('an undeliverable prompt fails closed as unavailable', async () => {
  // Nobody saw the prompt, so nobody decided. `unavailable` is the seam's
  // fail-closed answer; `rejected` would log a refusal that never happened.
  const api = apiDouble({ sendFails: true });
  const approvals = new TelegramApprovals({ api, logger: quiet });

  assert.equal(await approvals.ask(target, { toolName: 'bash' }), 'unavailable');
  assert.equal(approvals.pending.size, 0);
});

test('an already-aborted request never posts a keyboard nobody can answer', async () => {
  const api = apiDouble();
  const approvals = new TelegramApprovals({ api, logger: quiet });
  const controller = new AbortController();
  controller.abort();

  assert.equal(
    await approvals.ask(target, { toolName: 'bash' }, controller.signal),
    'cancelled',
  );
  assert.equal(api.sent.length, 0);
});

test('aborting a live prompt cancels it rather than granting', async () => {
  const api = apiDouble();
  const approvals = new TelegramApprovals({ api, logger: quiet });
  const controller = new AbortController();

  const decision = approvals.ask(target, { toolName: 'bash' }, controller.signal);
  await Promise.resolve();
  controller.abort();

  assert.equal(await decision, 'cancelled');
});

test('unloading the channel settles every pending prompt', async () => {
  // A pending approval is a blocked tool call. Leaving one unsettled at unload
  // hangs the agent forever with nothing left to answer it.
  const api = apiDouble();
  const approvals = new TelegramApprovals({ api, logger: quiet });

  const first = approvals.ask(target, { toolName: 'bash' });
  const second = approvals.ask({ chatId: 43 }, { toolName: 'write' });
  await Promise.resolve();
  await Promise.resolve();

  approvals.disposeAll();

  assert.deepEqual(await Promise.all([first, second]), ['cancelled', 'cancelled']);
});

test('a callback for an unknown token is answered, never guessed at', async () => {
  const api = apiDouble();
  const approvals = new TelegramApprovals({ api, logger: quiet });

  assert.equal(await approvals.handleCallback({ id: 'cb', data: 'a:gone:allow' }), true);
  assert.match(api.answered[0].payload.text, /kết thúc/i);
});

test('an unknown action leaves the prompt open instead of deciding it', async () => {
  // A build that learns a new action must not have its presses read as a
  // decision by an older one.
  const api = apiDouble();
  const approvals = new TelegramApprovals({ api, logger: quiet });

  const decision = approvals.ask(target, { toolName: 'bash' });
  await Promise.resolve();
  const token = tokenOf(api);

  await approvals.handleCallback({ id: 'cb', data: `a:${token}:maybe` });
  assert.equal(approvals.pending.size, 1);

  await approvals.handleCallback({ id: 'cb2', data: `a:${token}:deny` });
  assert.equal(await decision, 'rejected');
});

test('callbacks belonging to other features are declined', async () => {
  // `q:` is the questions module. Claiming it here would swallow a press that
  // another handler understands.
  const api = apiDouble();
  const approvals = new TelegramApprovals({ api, logger: quiet });

  assert.equal(await approvals.handleCallback({ id: 'cb', data: 'q:abc:o:0' }), false);
  assert.equal(await approvals.handleCallback({ id: 'cb', data: undefined }), false);
});

/* ---------------- routing ---------------- */

/** A context double that records the listener and its options. */
function ctxDouble() {
  const listeners = [];
  return {
    listeners,
    on(name, listener, options) {
      listeners.push({ name, listener, options });
      return () => {
        const index = listeners.findIndex((entry) => entry.listener === listener);
        if (index >= 0) listeners.splice(index, 1);
      };
    },
  };
}

test('a session with no Telegram binding defers to the rest of the waterfall', async () => {
  // This is where the browser lives. Answering here would remove the surface
  // every non-Telegram session depends on.
  const ctx = ctxDouble();
  const api = apiDouble();
  const approvals = new TelegramApprovals({ api, logger: quiet });

  installApprovalRouting({ ctx, approvals, resolveTarget: () => undefined, logger: quiet });

  const outcome = await ctx.listeners[0].listener(
    { agent: { session: { id: 'web-1' } }, toolName: 'bash' },
    async () => 'from-next',
  );

  assert.equal(outcome, 'from-next');
  assert.equal(api.sent.length, 0, 'a non-Telegram session must not be prompted in Telegram');
});

test('a lookup failure defers rather than stranding the decision', async () => {
  const ctx = ctxDouble();
  const approvals = new TelegramApprovals({ api: apiDouble(), logger: quiet });

  installApprovalRouting({
    ctx,
    approvals,
    resolveTarget: () => {
      throw new Error('binding store exploded');
    },
    logger: quiet,
  });

  const outcome = await ctx.listeners[0].listener(
    { agent: { session: { id: 'tg-1' } } },
    async () => 'from-next',
  );

  assert.equal(outcome, 'from-next');
});

test('a Telegram session is prompted in Telegram', async () => {
  const ctx = ctxDouble();
  const api = apiDouble();
  const approvals = new TelegramApprovals({ api, logger: quiet });

  installApprovalRouting({ ctx, approvals, resolveTarget: () => target, logger: quiet });

  const outcome = ctx.listeners[0].listener(
    { agent: { session: { id: 'tg-1' } }, toolName: 'bash', reason: 'needs ~/.dsh' },
    async () => 'from-next',
  );
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(api.sent.length, 1);
  assert.match(api.sent[0].html, /bash/);
  assert.match(api.sent[0].html, /needs ~\/\.dsh/);

  await approvals.handleCallback({ id: 'cb', data: `a:${tokenOf(api)}:allow` });
  assert.equal(await outcome, 'allowed-once');
});

test('the listener is prepended, or the Web bridge would shadow it', async () => {
  // A waterfall runs outermost-first and a listener that never calls `next()`
  // vetoes the rest of the chain. The Web bridge answers unconditionally for
  // any session it can match, so appending would make this code unreachable in
  // exactly the profile that needs it.
  const ctx = ctxDouble();
  const approvals = new TelegramApprovals({ api: apiDouble(), logger: quiet });

  installApprovalRouting({ ctx, approvals, resolveTarget: () => target, logger: quiet });

  assert.equal(ctx.listeners[0].name, 'approval/request');
  assert.equal(ctx.listeners[0].options?.prepend, true);
});

test('a host that refuses the listener leaves the channel running', async () => {
  const approvals = new TelegramApprovals({ api: apiDouble(), logger: quiet });
  const hostile = {
    on() {
      throw new Error('approval/request is not dispatchable here');
    },
  };

  const routing = installApprovalRouting({
    ctx: hostile,
    approvals,
    resolveTarget: () => target,
    logger: quiet,
  });

  assert.equal(routing.ok, false);
  assert.doesNotThrow(() => routing.dispose());
});

test('a composition with no context at all is a quiet no-op', () => {
  const routing = installApprovalRouting({ ctx: undefined, approvals: undefined });
  assert.equal(routing.ok, false);
  assert.doesNotThrow(() => routing.dispose());
});

test('disposal unregisters the listener and settles what was pending', async () => {
  const ctx = ctxDouble();
  const api = apiDouble();
  const approvals = new TelegramApprovals({ api, logger: quiet });

  const routing = installApprovalRouting({
    ctx,
    approvals,
    resolveTarget: () => target,
    logger: quiet,
  });

  const outcome = ctx.listeners[0].listener({ agent: { session: { id: 'tg-1' } } }, async () => 'x');
  await Promise.resolve();
  await Promise.resolve();

  routing.dispose();

  assert.equal(ctx.listeners.length, 0);
  assert.equal(await outcome, 'cancelled');
});

test('disposing twice cannot unregister a listener that replaced ours', () => {
  // Cordis can unwind a fiber more than once, and a second dispose would evict
  // whichever listener legitimately holds the slot by then.
  const ctx = ctxDouble();
  const approvals = new TelegramApprovals({ api: apiDouble(), logger: quiet });

  const routing = installApprovalRouting({
    ctx,
    approvals,
    resolveTarget: () => target,
    logger: quiet,
  });

  routing.dispose();
  const replacement = () => 'someone else';
  ctx.on('approval/request', replacement, {});

  routing.dispose();

  assert.deepEqual(
    ctx.listeners.map((entry) => entry.listener),
    [replacement],
  );
});

test('an outcome is always one the host understands', async () => {
  // The host normalizes anything outside its vocabulary to `unavailable`, so a
  // rogue value would not be dangerous — but it would be silently misread.
  const OUTCOMES = new Set(['allowed-once', 'rejected', 'cancelled', 'unavailable']);
  const api = apiDouble();
  const approvals = new TelegramApprovals({ api, logger: quiet });

  const controller = new AbortController();
  const decision = approvals.ask(target, { toolName: 'bash' }, controller.signal);
  await Promise.resolve();
  controller.abort();

  assert.ok(OUTCOMES.has(await decision));
  assert.ok(OUTCOMES.has(await approvals.ask(target, {}, AbortSignal.abort())));
});
