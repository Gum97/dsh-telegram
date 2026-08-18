/**
 * Rich block rendering.
 *
 * Telegram's `sendMessage` cannot express a table: `<table>` is rejected with
 * "Unsupported start tag", so the HTML path draws one in monospace, and that
 * drawing shears when a phone soft-wraps it. `sendRichMessage` takes a
 * structured document instead and renders a real table.
 *
 * Every payload shape below was accepted by the live Bot API before being
 * pinned here, so a failure means this module drifted from a real contract.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { parseBlocks, parseInline, renderToBlocks, splitBlocks } from '../lib/rich.js';
import { ReplyRouter } from '../lib/reply.js';

/* ----------------------------- inline text ----------------------------- */

test('plain text stays a bare string, not a wrapper object', () => {
  // The API accepts a string wherever RichText is expected; wrapping it would
  // bloat every payload for no gain.
  assert.equal(parseInline('xin chào'), 'xin chào');
});

test('bold, italic and code become typed nodes', () => {
  assert.deepEqual(parseInline('**đậm**'), { type: 'bold', text: 'đậm' });
  assert.deepEqual(parseInline('*nghiêng*'), { type: 'italic', text: 'nghiêng' });
  assert.deepEqual(parseInline('`mã`'), { type: 'code', text: 'mã' });
});

test('a link carries its url alongside the visible text', () => {
  assert.deepEqual(parseInline('[Shopee](https://shopee.vn/x)'), {
    type: 'url',
    text: 'Shopee',
    url: 'https://shopee.vn/x',
  });
});

test('markup inside code is left literal', () => {
  // Re-parsing code content would turn `a**b**c` into bold inside a code span.
  assert.deepEqual(parseInline('`a**b**c`'), { type: 'code', text: 'a**b**c' });
});

test('underscores inside an identifier are not emphasis', () => {
  const result = parseInline('snake_case_name');
  assert.equal(result, 'snake_case_name');
});

test('text is NOT html-escaped, because it travels as json', () => {
  // Escaping here would show the user a literal "&amp;".
  const result = parseInline('a < b && c > d');
  assert.equal(result, 'a < b && c > d');
});

/* -------------------------------- blocks -------------------------------- */

const WIDE_TABLE = [
  '| Sản phẩm | Giá | Mã |',
  '|---|---:|---|',
  '| Bình xịt diệt khuẩn Baby Fresh — 300ml | 374.000 đ | 805473 |',
  '| Bình xịt thay thế (REFILL) Baby Fresh — 300ml | 272.000 đ | 805474 |',
].join('\n');

test('a table becomes a real table block, never monospace text', () => {
  const [block] = parseBlocks(WIDE_TABLE);

  assert.equal(block.type, 'table');
  assert.equal(block.is_bordered, true);
  assert.equal(block.cells.length, 3, 'one header row plus two body rows');
});

test('header cells are marked and column alignment is preserved', () => {
  const [table] = parseBlocks(WIDE_TABLE);
  const [header, firstRow] = table.cells;

  assert.equal(header[0].is_header, true);
  assert.equal(header[1].align, 'right', 'the ---: separator means right-aligned');
  assert.equal(firstRow[1].align, 'right', 'alignment applies to body cells too');
  assert.equal(firstRow[0].is_header, undefined);
});

test('a ragged row is padded with invisible cells rather than breaking the grid', () => {
  const [table] = parseBlocks(
    ['| A | B | C |', '|---|---|---|', '| chỉ một |', '| x | y | z |'].join('\n'),
  );

  for (const row of table.cells) {
    assert.equal(row.length, 3, 'every row must have the same cell count');
  }
  // An omitted `text` is the documented way to render an empty cell.
  assert.equal(table.cells[1][1].text, undefined);
});

test('headings keep their level', () => {
  assert.deepEqual(parseBlocks('## Báo giá'), [
    { type: 'heading', text: 'Báo giá', size: 2 },
  ]);
});

test('a list becomes one list block, not several paragraphs', () => {
  const blocks = parseBlocks('- một\n- hai\n- ba');

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, 'list');
  assert.equal(blocks[0].items.length, 3);
});

test('a task list carries real checkbox state', () => {
  const [list] = parseBlocks('- [x] xong\n- [ ] chưa');

  assert.equal(list.items[0].has_checkbox, true);
  assert.equal(list.items[0].is_checked, true);
  assert.equal(list.items[1].has_checkbox, true);
  assert.equal(list.items[1].is_checked, undefined);
});

test('a fenced code block keeps its language', () => {
  const [block] = parseBlocks('```js\nconst x = 1;\n```');

  assert.equal(block.type, 'pre');
  assert.equal(block.language, 'js');
  assert.equal(block.text, 'const x = 1;');
});

test('reasoning never reaches a rich block', () => {
  const blocks = parseBlocks('<think>bí mật</think>Câu trả lời');
  const serialized = JSON.stringify(blocks);

  assert.doesNotMatch(serialized, /bí mật/);
  assert.match(serialized, /Câu trả lời/);
});

test('an empty document produces no blocks, which the api would reject', () => {
  assert.deepEqual(parseBlocks('   \n\n  '), []);
  assert.deepEqual(renderToBlocks(''), []);
});

/* ------------------------------- splitting ------------------------------- */

test('splitting happens on block boundaries so a table is never cut in half', () => {
  const table = parseBlocks(WIDE_TABLE)[0];
  const blocks = Array.from({ length: 12 }, () => table);
  const groups = splitBlocks(blocks, 600);

  assert.ok(groups.length > 1, 'this input must actually split');
  for (const group of groups) {
    for (const block of group) {
      assert.equal(block.type, 'table', 'a fragment of a table is not a table');
    }
  }
});

test('every block survives a split', () => {
  const blocks = parseBlocks(
    Array.from({ length: 40 }, (_, i) => `Đoạn văn số ${i} với một ít nội dung.`).join('\n\n'),
  );
  const total = splitBlocks(blocks, 500).reduce((sum, group) => sum + group.length, 0);

  assert.equal(total, blocks.length, 'splitting must not drop or duplicate blocks');
});

/* ------------------------------- delivery ------------------------------- */

function apiDouble({ rich = true } = {}) {
  const calls = { rich: [], sent: [], edited: [], deleted: [] };
  let nextId = 200;
  const api = {
    calls,
    async sendHtml(chatId, html) {
      calls.sent.push({ chatId, html });
      return { message_id: nextId++ };
    },
    async editHtml(chatId, messageId, html) {
      calls.edited.push({ chatId, messageId, html });
      return { message_id: messageId };
    },
    async deleteMessage(chatId, messageId) {
      calls.deleted.push({ chatId, messageId });
    },
    async sendChatAction() {},
    async sendMedia() {
      return { message_id: nextId++ };
    },
    async sendMediaGroup() {
      return [];
    },
  };
  if (rich) {
    api.sendRich = async (chatId, blocks) => {
      calls.rich.push({ chatId, blocks });
      return { message_id: nextId++ };
    };
  }
  return api;
}

function routerFor(api) {
  return new ReplyRouter({
    api,
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    bindings: { cache: {} },
    resolveTarget: () => ({ chatId: 1, key: 'tg:1' }),
    streaming: false,
  });
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

async function runTurn(router, text) {
  const session = { id: 's1' };
  router.claimSession('s1');
  router.onEvent(session, {
    type: 'assistant/chunk',
    data: { turn: 1, step: 1, chunk: { type: 'text-delta', text } },
  });
  router.onEvent(session, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } });
  await settle();
}

test('a reply is delivered as a rich message when the server supports it', async () => {
  const api = apiDouble();
  await runTurn(routerFor(api), `Bảng giá:\n\n${WIDE_TABLE}`);

  assert.equal(api.calls.rich.length, 1);
  assert.equal(api.calls.sent.length, 0, 'the html path must not also fire');

  const types = api.calls.rich[0].blocks.map((block) => block.type);
  assert.ok(types.includes('table'), 'the table must arrive as a real table');
});

test('an api without rich support still delivers, via html', async () => {
  // A deployment may run against an older Bot API server.
  const api = apiDouble({ rich: false });
  await runTurn(routerFor(api), `Bảng giá:\n\n${WIDE_TABLE}`);

  assert.equal(api.calls.sent.length, 1, 'the answer must not be lost');
  assert.match(api.calls.sent[0].html, /Bảng giá/);
});

test('a rejected rich send falls back instead of dropping the answer', async () => {
  const api = apiDouble();
  api.sendRich = async () => undefined; // server declined

  await runTurn(routerFor(api), 'Xin chào');

  assert.equal(api.calls.sent.length, 1, 'html must take over when rich declines');
  assert.match(api.calls.sent[0].html, /Xin chào/);
});

test('rich delivery can be turned off by configuration', async () => {
  const api = apiDouble();
  const router = routerFor(api);
  router.rich = false;

  await runTurn(router, 'Xin chào');

  assert.equal(api.calls.rich.length, 0);
  assert.equal(api.calls.sent.length, 1);
});
