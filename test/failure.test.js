/**
 * A failed turn must reach the user.
 *
 * These cases come from a real incident: a photo was sent to a model whose
 * declared modalities were text-only. The turn ended with
 * `reason.kind === 'error'` having emitted no text delta, so the router — which
 * only ever finalized turns it had built state for — dropped the failure and
 * the chat simply never answered. Silence is the worst possible rendering of an
 * error, because the user cannot tell it from a slow reply.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { ReplyRouter } from '../lib/reply.js';

function fakeApi() {
  const calls = { sent: [], edited: [], deleted: [], actions: [], media: [] };
  let nextId = 100;
  return {
    calls,
    async sendHtml(chatId, html) {
      calls.sent.push({ chatId, html });
      return { message_id: nextId++ };
    },
    async editHtml(chatId, messageId, html) {
      calls.edited.push({ chatId, messageId, html });
      return { message_id: messageId };
    },
    async sendMedia(chatId, kind, source, opts) {
      calls.media.push({ chatId, kind, source, opts });
      return { message_id: nextId++ };
    },
    async sendMediaGroup(chatId, items) {
      calls.media.push({ chatId, kind: 'album', items });
      return [];
    },
    async deleteMessage(chatId, messageId) {
      calls.deleted.push({ chatId, messageId });
    },
    async sendChatAction(chatId, action) {
      calls.actions.push({ chatId, action });
    },
  };
}

function build({ streaming = false } = {}) {
  const api = fakeApi();
  const router = new ReplyRouter({
    api,
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    bindings: { cache: {} },
    resolveTarget: () => ({ chatId: 339028172, key: 'tg:339028172' }),
    streaming,
  });
  return { api, router };
}

const SESSION = 'tg-3e143cff-730e-4325-a75a-8ed6b507b37a';

/** Settle the void-returning async handlers the router queues. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

/** The exact failure recorded in the live session log. */
const IMAGE_REFUSAL = {
  type: 'turn/end',
  data: {
    turn: 2,
    reason: {
      kind: 'error',
      error: {
        message: 'pi-ai model "combo" does not support image input',
        code: 'UNSUPPORTED_CONTENT',
      },
    },
  },
};

test('a turn that fails before emitting any text still reports to the chat', async () => {
  const { api, router } = build();
  router.claimSession(SESSION);

  // No assistant/chunk at all — exactly what the live log shows for turn 2.
  router.onEvent({ id: SESSION }, IMAGE_REFUSAL);
  await settle();

  assert.equal(
    api.calls.sent.length,
    1,
    'the failed turn produced no message — the user was left with silence',
  );
});

test('the image refusal is explained with the action that fixes it', async () => {
  const { api, router } = build();
  router.claimSession(SESSION);

  router.onEvent({ id: SESSION }, IMAGE_REFUSAL);
  await settle();

  const html = api.calls.sent[0].html;
  assert.match(html, /không nhận ảnh/i, 'the notice must say what went wrong in plain language');
  assert.match(html, /\/model/, 'the notice must name the command that resolves it');
  assert.match(
    html,
    /does not support image input/,
    'the underlying engine message must remain visible for diagnosis',
  );
});

test('an unclaimed session does not receive failure notices', async () => {
  const { api, router } = build();

  // Never claimed: this turn belongs to a Web-driven conversation.
  router.onEvent({ id: SESSION }, IMAGE_REFUSAL);
  await settle();

  assert.equal(api.calls.sent.length, 0);
});

test('text streamed before a failure is delivered, not discarded', async () => {
  const { api, router } = build();
  router.claimSession(SESSION);

  router.onEvent(
    { id: SESSION },
    {
      type: 'assistant/chunk',
      data: { turn: 1, step: 1, chunk: { type: 'text-delta', text: 'Phần trả lời dở dang' } },
    },
  );
  router.onEvent(
    { id: SESSION },
    {
      type: 'turn/end',
      data: {
        turn: 1,
        reason: { kind: 'error', error: { message: 'connection reset', code: 'NETWORK' } },
      },
    },
  );
  await settle();

  const all = [...api.calls.sent, ...api.calls.edited].map((call) => call.html).join('\n');
  assert.match(all, /dở dang/, 'partial output must survive the failure');
  assert.match(all, /thất bại/i, 'the failure must still be reported');
});

test('a normal completed turn is unaffected', async () => {
  const { api, router } = build();
  router.claimSession(SESSION);

  router.onEvent(
    { id: SESSION },
    {
      type: 'assistant/chunk',
      data: { turn: 1, step: 1, chunk: { type: 'text-delta', text: 'Xin chào' } },
    },
  );
  router.onEvent(
    { id: SESSION },
    { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
  );
  await settle();

  const all = [...api.calls.sent, ...api.calls.edited].map((call) => call.html).join('\n');
  assert.match(all, /Xin chào/);
  assert.doesNotMatch(all, /⚠️/, 'a successful turn must not carry a warning');
});
