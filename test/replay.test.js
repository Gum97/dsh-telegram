/**
 * Replay a REAL session log through the reply router.
 *
 * The fixture is the exact event log of a live Telegram conversation in which
 * the agent answered but nothing reached the chat. Replaying it against a fake
 * API reproduces the delivery bug without a bot, a network, or a restart — and
 * pins it so it cannot come back.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { ReplyRouter } from '../lib/reply.js';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Load the recorded events for one session. */
function loadEvents() {
  return readFileSync(path.join(here, 'real-session.jsonl'), 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

/** Minimal API double recording what the router tried to send. */
function fakeApi() {
  const calls = { sent: [], edited: [], media: [], deleted: [], actions: [] };
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

/** Build a router wired to a fixed chat, plus its recording API. */
function build({ streaming = false } = {}) {
  const api = fakeApi();
  const router = new ReplyRouter({
    api,
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    bindings: { cache: {} },
    resolveTarget: () => ({ chatId: 339028172, key: 'tg:339028172' }),
    streaming,
    workspaceRootFor: () => here,
  });
  return { api, router };
}

/** Drive every recorded event through the router, as the live listener would. */
async function replay(router, events, sessionId) {
  const session = { id: sessionId };
  for (const event of events) {
    router.onEvent(session, event);
  }
  // Let the queued finalize() promises settle.
  await new Promise((resolve) => setTimeout(resolve, 50));
}

const SESSION_ID = 'tg-dd1132ed-ba51-49f2-8215-898748cff480';

test('a claimed session delivers the assistant reply to the chat', async () => {
  const events = loadEvents();
  const { api, router } = build();

  router.claimSession(SESSION_ID);
  await replay(router, events, SESSION_ID);

  const delivered = [...api.calls.sent, ...api.calls.edited];
  assert.ok(
    delivered.length > 0,
    'the router produced no Telegram call at all — the reply never left the harness',
  );
});

test('an unclaimed session stays silent so Web-driven turns are not duplicated', async () => {
  const events = loadEvents();
  const { api, router } = build();

  // No claimSession() call: this session was never driven from Telegram.
  await replay(router, events, SESSION_ID);

  assert.equal(api.calls.sent.length, 0);
  assert.equal(api.calls.edited.length, 0);
});

test('claiming once delivers every later turn, not only the first', async () => {
  const events = loadEvents();
  const { api, router } = build();

  router.claimSession(SESSION_ID);
  await replay(router, events, SESSION_ID);

  const turns = new Set(
    events.filter((event) => event.type === 'turn/end').map((event) => event.data.turn),
  );
  const delivered = api.calls.sent.length + api.calls.edited.length;

  assert.ok(
    delivered >= turns.size,
    `log holds ${turns.size} finished turns but only ${delivered} were delivered — ` +
      'later turns are being dropped after the first claim is consumed',
  );
});
