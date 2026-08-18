import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  chunkMarkdown,
  escapeHtml,
  renderInline,
  renderMarkdown,
  renderToMessages,
  toPlainText,
} from '../lib/markdown.js';

test('escapes the characters that break Telegram HTML', () => {
  assert.equal(escapeHtml('a < b & c > d'), 'a &lt; b &amp; c &gt; d');
});

test('renders bold, italic, strike and spoiler', () => {
  assert.equal(renderInline('**bold**'), '<b>bold</b>');
  assert.equal(renderInline('*italic*'), '<i>italic</i>');
  assert.equal(renderInline('***both***'), '<b><i>both</i></b>');
  assert.equal(renderInline('~~gone~~'), '<s>gone</s>');
  assert.equal(renderInline('||secret||'), '<tg-spoiler>secret</tg-spoiler>');
  assert.equal(renderInline('__under__'), '<u>under</u>');
});

test('does not italicise snake_case identifiers', () => {
  assert.equal(renderInline('call some_long_name now'), 'call some_long_name now');
});

test('code spans are escaped and never emphasised', () => {
  assert.equal(renderInline('`a < b`'), '<code>a &lt; b</code>');
  assert.equal(renderInline('`**not bold**`'), '<code>**not bold**</code>');
});

test('links render as anchors with escaped urls', () => {
  assert.equal(
    renderInline('[docs](https://example.com/a?b=1&c=2)'),
    '<a href="https://example.com/a?b=1&amp;c=2">docs</a>',
  );
});

test('links with unsupported schemes degrade to plain text', () => {
  assert.equal(renderInline('[bad](javascript:alert(1))'), 'bad');
});

test('an injected tag cannot escape escaping', () => {
  const html = renderInline('<script>alert("x")</script>');
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('headings become bold lines', () => {
  assert.equal(renderMarkdown('# Title'), '<b>Title</b>');
  assert.equal(renderMarkdown('### Deep **bold**'), '<b>Deep <b>bold</b></b>');
});

test('fenced code keeps its language class', () => {
  const html = renderMarkdown('```js\nconst a = 1 < 2;\n```');
  assert.equal(html, '<pre><code class="language-js">const a = 1 &lt; 2;</code></pre>');
});

test('bullet lists render with depth markers', () => {
  const html = renderMarkdown('- one\n- two\n  - nested');
  assert.equal(html, '• one\n• two\n  ◦ nested');
});

test('task list markers become checkboxes', () => {
  assert.equal(renderMarkdown('- [ ] todo\n- [x] done'), '• ☐ todo\n• ☑ done');
});

test('tables render as aligned monospace blocks', () => {
  const html = renderMarkdown(['| Name | Qty |', '| --- | ---: |', '| Apple | 3 |', '| Watermelon | 12 |'].join('\n'));
  assert.ok(html.startsWith('<pre>'));
  assert.ok(html.includes('Name'));
  assert.ok(html.includes('Watermelon'));
  const lines = html.replace(/^<pre>|<\/pre>$/g, '').split('\n');
  // Header, separator and both body rows share one column layout.
  assert.equal(lines.length, 4);
  assert.ok(lines[1].includes('─'));
});

test('table cells keep their text when they contain markup', () => {
  const html = renderMarkdown(['| A | B |', '| --- | --- |', '| **x** | `y` |'].join('\n'));
  assert.ok(html.includes('x'));
  assert.ok(html.includes('y'));
  assert.ok(!html.includes('**'));
});

/*
 * Wide tables.
 *
 * Telegram rejects `<table>` outright ("Unsupported start tag"), so an aligned
 * `<pre>` grid is a drawing of a table and obeys text-wrapping rules. A real
 * product table rendered 64 columns wide; a phone shows about 34, so the client
 * soft-wrapped every row and the columns sheared apart. These pin the width
 * decision so that layout cannot silently return.
 */

/** The table from the live incident, verbatim. */
const WIDE_TABLE = [
  '| Sản phẩm | Giá | Mã |',
  '|---|---|---|',
  '| Bình xịt diệt khuẩn Baby Fresh — 300ml | 374.000 đ | 805473 |',
  '| Bình xịt thay thế (REFILL) Baby Fresh — 300ml | 272.000 đ | 805474 |',
].join('\n');

test('a table too wide for a phone is not drawn as a grid', () => {
  const html = renderMarkdown(WIDE_TABLE);

  assert.ok(
    !html.includes('<pre>'),
    'a 64-column grid soft-wraps on a phone and shears — it must not be emitted',
  );
});

test('a wide table keeps every value attached to its column name', () => {
  const html = renderMarkdown(WIDE_TABLE);

  assert.match(html, /<b>Bình xịt diệt khuẩn Baby Fresh — 300ml<\/b>/);
  assert.match(html, /Giá: 374\.000 đ/);
  assert.match(html, /Mã: 805473/);
  // The second record must be present and separately labelled.
  assert.match(html, /Giá: 272\.000 đ/);
  assert.match(html, /Mã: 805474/);
});

test('no rendered line exceeds the width a narrow phone can show', () => {
  const html = renderMarkdown(WIDE_TABLE);
  const monospace = html.match(/<pre>([\s\S]*?)<\/pre>/);

  // Only monospace blocks must fit: prose wraps harmlessly, a grid does not.
  if (monospace) {
    for (const line of monospace[1].split('\n')) {
      assert.ok(line.length <= 34, `monospace line is ${line.length} columns wide: ${line}`);
    }
  }
});

test('a narrow table still renders as an aligned grid', () => {
  const html = renderMarkdown(
    ['| Mã | Giá |', '|---|---|', '| 805473 | 374.000 |', '| 805474 | 272.000 |'].join('\n'),
  );

  assert.ok(html.startsWith('<pre>'), 'a table that fits should keep the more scannable grid');
  assert.match(html, /─/);
});

test('links inside a wide table survive the record layout', () => {
  const html = renderMarkdown(
    [
      '| Sản phẩm rất dài để vượt quá chiều ngang | Nguồn |',
      '|---|---|',
      '| Một tên sản phẩm dài dằng dặc ở đây | [Shopee](https://shopee.vn/x) |',
    ].join('\n'),
  );

  assert.match(
    html,
    /<a href="https:\/\/shopee\.vn\/x">Shopee<\/a>/,
    'the monospace path strips markup to measure width; the record path must not',
  );
});

test('blockquotes wrap their rendered content', () => {
  const html = renderMarkdown('> quoted **text**');
  assert.equal(html, '<blockquote>quoted <b>text</b></blockquote>');
});

test('chunking keeps every chunk under the cap', () => {
  const long = Array.from({ length: 400 }, (_, i) => `line ${i} with some filler text`).join('\n');
  const messages = renderToMessages(long, 4096);
  assert.ok(messages.length > 1);
  for (const message of messages) assert.ok(message.length <= 4096);
});

test('chunking reopens a fence that spans a boundary', () => {
  const body = Array.from({ length: 300 }, (_, i) => `const x${i} = ${i};`).join('\n');
  const chunks = chunkMarkdown('```js\n' + body + '\n```', 2000);
  assert.ok(chunks.length > 1);
  for (const chunk of chunks) {
    const fences = (chunk.match(/^```/gm) ?? []).length;
    assert.equal(fences % 2, 0, 'each chunk closes every fence it opens');
  }
});

test('rendered chunks are always balanced html', () => {
  const source = ['# Title', '', 'Some **bold** text.', '', '```py', 'print(1)', '```', '', '| a | b |', '| - | - |', '| 1 | 2 |'].join('\n');
  for (const message of renderToMessages(source, 4096)) {
    const open = (message.match(/<pre>/g) ?? []).length;
    const close = (message.match(/<\/pre>/g) ?? []).length;
    assert.equal(open, close);
  }
});

test('plain-text fallback strips markup', () => {
  assert.equal(toPlainText('# T\n\n**b** and `c`'), 'T\n\nb and c');
});

test('reasoning blocks never reach the chat', () => {
  // Balanced pair around the answer.
  assert.equal(renderMarkdown('<think>nội bộ</think>Xin chào'), 'Xin chào');
  // Empty pair, the shape this model emits most often.
  assert.equal(renderMarkdown('<think></think>Chào bạn'), 'Chào bạn');
  // Repeated pairs across a single message.
  assert.equal(renderMarkdown('<think></think><think></think>Ba'), 'Ba');
  // A truncated stream leaves an unterminated tag; it must still drop.
  assert.equal(renderMarkdown('<think>đang nghĩ'), '');
  // Alternate spellings used by other providers.
  assert.equal(renderMarkdown('<thinking>x</thinking>Y'), 'Y');
  assert.equal(renderMarkdown('<reasoning>x</reasoning>Z'), 'Z');
});

test('reasoning is stripped from the plain-text fallback too', () => {
  assert.equal(toPlainText('<think>nội bộ</think>**Đậm**'), 'Đậm');
});

test('escaped angle brackets in real content still survive', () => {
  // Only reasoning tags are removed; ordinary angle brackets stay escaped.
  assert.equal(renderMarkdown('a < b và c > d'), 'a &lt; b và c &gt; d');
  assert.equal(renderMarkdown('dùng <div> trong HTML'), 'dùng &lt;div&gt; trong HTML');
});
