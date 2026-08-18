/**
 * Inline-keyboard question flow.
 *
 * This module owns every button the user touches, and it had no tests at all:
 * routing questions into Telegram is worthless if the keyboard they arrive on
 * cannot be operated. These drive the real callback handler with the update
 * shapes Telegram actually sends.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { TelegramQuestions } from '../lib/questions.js';

/** Records what was sent and lets a test replay callbacks against it. */
function apiDouble() {
  const calls = { sent: [], keyboards: [], answers: [] };
  return {
    calls,
    sendHtml: async (chatId, html, options) => {
      calls.sent.push({ chatId, html, options });
      return { message_id: 100 + calls.sent.length };
    },
    editKeyboard: async (chatId, messageId, keyboard) => {
      calls.keyboards.push({ chatId, messageId, keyboard });
    },
    answerCallback: async (id, payload) => {
      calls.answers.push({ id, ...payload });
    },
  };
}

/** The last keyboard pushed to Telegram, flattened to its button labels. */
function lastLabels(api) {
  const last = api.calls.keyboards.at(-1);
  return last.keyboard.map((row) => row.map((b) => b.text));
}

/** `callback_data` for option `index` of the question that was just asked. */
function optionData(api, index) {
  return api.calls.sent.at(-1).options.keyboard[index][0].callback_data;
}

const MULTI = {
  id: 'support',
  question: 'Bạn muốn tôi giúp việc gì?',
  multiSelect: true,
  options: [
    { label: 'Viết & sửa code' },
    { label: 'Tra cứu thông tin' },
    { label: 'Sắp xếp ghi chú' },
  ],
};

const SINGLE = {
  id: 'style',
  question: 'Bạn thích tôi trả lời kiểu nào?',
  options: [{ label: 'Ngắn gọn' }, { label: 'Chi tiết' }],
};

/**
 * Ask a question and guarantee the pending promise is settled.
 *
 * `askOne` resolves only when the user answers, so a test that leaves one
 * hanging keeps the runner alive forever. `t.after` rejects any leftover the
 * same way unloading the plugin would, and the rejection is absorbed here so
 * an intentionally-unanswered question is not reported as an unhandled error.
 */
async function ask(t, api, question) {
  const q = new TelegramQuestions({ api, logger: { warn() {} } });
  const answer = q.askOne({ chatId: '1' }, question);
  answer.catch(() => {});
  t.after(() => q.disposeAll('test finished'));
  // `askOne` awaits the send before it registers the pending question, so the
  // keyboard is not observable until that turn completes.
  await new Promise((resolve) => setImmediate(resolve));
  return { q, answer };
}

test('a multi-select question starts with every box unchecked', async (t) => {
  const api = apiDouble();
  await ask(t, api, MULTI);

  const rows = api.calls.sent[0].options.keyboard;
  assert.deepEqual(
    rows.slice(0, 3).map((r) => r[0].text),
    ['☐ Viết & sửa code', '☐ Tra cứu thông tin', '☐ Sắp xếp ghi chú'],
  );
  assert.ok(
    rows.at(-1).some((b) => b.text.includes('Xong')),
    'multi-select needs a Done button to commit with',
  );
});

test('tapping an option ticks only that box, and the rest stay tappable', async (t) => {
  // The reported symptom was every box appearing ticked at once, which would
  // make a multi-select impossible to use.
  const api = apiDouble();
  const { q } = await ask(t, api, MULTI);

  await q.handleCallback({ id: 'cb1', data: optionData(api, 0) });

  assert.deepEqual(lastLabels(api).slice(0, 3), [
    ['☑ Viết & sửa code'],
    ['☐ Tra cứu thông tin'],
    ['☐ Sắp xếp ghi chú'],
  ]);
});

test('a second tap ticks a second box rather than replacing the first', async (t) => {
  const api = apiDouble();
  const { q } = await ask(t, api, MULTI);

  await q.handleCallback({ id: 'cb1', data: optionData(api, 0) });
  await q.handleCallback({ id: 'cb2', data: optionData(api, 2) });

  assert.deepEqual(lastLabels(api).slice(0, 3), [
    ['☑ Viết & sửa code'],
    ['☐ Tra cứu thông tin'],
    ['☑ Sắp xếp ghi chú'],
  ]);
});

test('tapping a ticked option unticks it', async (t) => {
  const api = apiDouble();
  const { q } = await ask(t, api, MULTI);

  await q.handleCallback({ id: 'cb1', data: optionData(api, 1) });
  await q.handleCallback({ id: 'cb2', data: optionData(api, 1) });

  assert.deepEqual(lastLabels(api).slice(0, 3), [
    ['☐ Viết & sửa code'],
    ['☐ Tra cứu thông tin'],
    ['☐ Sắp xếp ghi chú'],
  ]);
});

test('a multi-select stays open until Done is pressed', async (t) => {
  const api = apiDouble();
  const { q, answer } = await ask(t, api, MULTI);

  let settled = false;
  answer.then(() => {
    settled = true;
  });

  await q.handleCallback({ id: 'cb1', data: optionData(api, 0) });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, false, 'picking an option must not end the question');

  const done = api.calls.sent[0].options.keyboard.at(-1).find((b) => b.text.includes('Xong'));
  await q.handleCallback({ id: 'cb2', data: done.callback_data });

  assert.deepEqual((await answer).selected, ['Viết & sửa code']);
});

test('Done returns the labels in the order they are listed, not tapped', async (t) => {
  const api = apiDouble();
  const { q, answer } = await ask(t, api, MULTI);

  await q.handleCallback({ id: 'cb1', data: optionData(api, 2) });
  await q.handleCallback({ id: 'cb2', data: optionData(api, 0) });

  const done = api.calls.sent[0].options.keyboard.at(-1).find((b) => b.text.includes('Xong'));
  await q.handleCallback({ id: 'cb3', data: done.callback_data });

  assert.deepEqual((await answer).selected, ['Viết & sửa code', 'Sắp xếp ghi chú']);
});

test('Done with nothing ticked asks for a choice instead of answering empty', async (t) => {
  const api = apiDouble();
  const { q } = await ask(t, api, MULTI);

  const done = api.calls.sent[0].options.keyboard.at(-1).find((b) => b.text.includes('Xong'));
  await q.handleCallback({ id: 'cb1', data: done.callback_data });

  assert.match(api.calls.answers.at(-1).text, /ít nhất một/i);
});

test('a single-select question answers on the first tap', async (t) => {
  const api = apiDouble();
  const { q, answer } = await ask(t, api, SINGLE);

  const rows = api.calls.sent[0].options.keyboard;
  assert.equal(rows[0][0].text, 'Ngắn gọn', 'single-select shows no checkbox');
  assert.ok(!rows.at(-1).some((b) => b.text.includes('Xong')), 'and needs no Done button');

  await q.handleCallback({ id: 'cb1', data: optionData(api, 1) });
  assert.deepEqual((await answer).selected, ['Chi tiết']);
});

test('an answered question is frozen to a single summary button', async (t) => {
  // This is what the screenshot showed: every settled question collapses to one
  // ✅ row. It is the finished state, not a stuck keyboard.
  const api = apiDouble();
  const { q, answer } = await ask(t, api, SINGLE);

  await q.handleCallback({ id: 'cb1', data: optionData(api, 0) });
  await answer;

  const frozen = api.calls.keyboards.at(-1).keyboard;
  assert.equal(frozen.length, 1);
  assert.equal(frozen[0].length, 1);
  assert.match(frozen[0][0].text, /^✅ Ngắn gọn/);
});

test('a callback for an unknown token is ignored, not crashed on', async (t) => {
  const api = apiDouble();
  const { q } = await ask(t, api, SINGLE);

  const handled = await q.handleCallback({ id: 'cb1', data: 'q:deadbeef:o:0' });
  assert.equal(handled, true, 'it is still a question callback');
});

test('a callback that is not ours is declined so other plugins can handle it', async (t) => {
  const api = apiDouble();
  const { q } = await ask(t, api, SINGLE);

  assert.equal(await q.handleCallback({ id: 'cb1', data: 'model:combo' }), false);
});
