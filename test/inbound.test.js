/**
 * Inbound message construction.
 *
 * A user message must carry the stable id that `createUserMessage` mints. A
 * hand-built object literal looks correct, type-checks against nothing, and is
 * dropped by the agent inbox WITHOUT an error — the symptom is a session that
 * exists but holds no `user/message` event, so the model never answers.
 *
 * This pins the shape so that failure cannot return silently.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

// `@deepseek-ai/dsh-llm` is a peer dependency: it is present when the plugin is
// installed into a profile, absent in this bare source tree. Skip rather than
// fail, so a red suite always means a real defect.
let createUserMessage;
try {
  ({ createUserMessage } = await import('@deepseek-ai/dsh-llm'));
} catch {
  createUserMessage = undefined;
}

/** Runs the case only where the peer dependency is resolvable. */
const scenario = (name, fn) =>
  test(name, { skip: createUserMessage === undefined && 'requires @deepseek-ai/dsh-llm' }, fn);

/** The builder used by the channel (mirrors `userMessage` in lib/index.js). */
function userMessage(content) {
  const blocks = typeof content === 'string' ? [{ type: 'text', text: content }] : content;
  return createUserMessage({
    content: blocks.length > 0 ? blocks : [{ type: 'text', text: '' }],
    source: { kind: 'user' },
  });
}

scenario('an inbound message carries the identity the inbox requires', () => {
  const message = userMessage('xin chào');

  assert.equal(typeof message.id, 'string');
  assert.ok(message.id.length > 0, 'a message without an id is dropped silently');
  assert.equal(message.role, 'user');
  assert.deepEqual(message.source, { kind: 'user' });
});

scenario('every message gets a distinct identity', () => {
  const first = userMessage('a');
  const second = userMessage('a');

  assert.notEqual(first.id, second.id, 'reused ids would collapse two turns into one');
});

scenario('image blocks survive alongside text', () => {
  const message = userMessage([
    { type: 'text', text: 'ảnh này là gì?' },
    { type: 'image', attachment: { id: 'att-1', mediaType: 'image/png' } },
  ]);

  assert.equal(message.content.length, 2);
  assert.equal(message.content[1].type, 'image');
  assert.ok(message.id, 'an image message needs an id just as much as a text one');
});

scenario('a photo sent with no caption still produces a valid message', () => {
  // Telegram sends no `text` for a bare photo; the channel must not build an
  // empty-content message, which the inbox also rejects.
  const message = userMessage([
    { type: 'image', attachment: { id: 'att-2', mediaType: 'image/jpeg' } },
  ]);

  assert.ok(message.id);
  assert.equal(message.content.length, 1);
});

scenario('an empty block list degrades to an empty text block, never to nothing', () => {
  const message = userMessage([]);

  assert.ok(message.id);
  assert.equal(message.content.length, 1);
  assert.equal(message.content[0].type, 'text');
});

scenario('the message is frozen, so no later mutation can corrupt the log', () => {
  const message = userMessage('x');

  assert.ok(Object.isFrozen(message));
});
