import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { classify, extractMedia, groupForDelivery, resolveInsideWorkspace } from '../lib/media.js';

async function workspace() {
  const root = await mkdtemp(path.join(tmpdir(), 'dsh-tg-'));
  await writeFile(path.join(root, 'chart.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]));
  await writeFile(path.join(root, 'data.csv'), 'a,b\n1,2\n');
  await mkdir(path.join(root, 'out'), { recursive: true });
  await writeFile(path.join(root, 'out', 'second.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 9]));
  return root;
}

test('classifies by extension', () => {
  assert.equal(classify('a/b/c.png'), 'image');
  assert.equal(classify('x.mp4'), 'video');
  assert.equal(classify('x.mp3'), 'audio');
  assert.equal(classify('x.csv'), 'document');
  assert.equal(classify('x.unknownext'), undefined);
});

test('refuses paths outside the workspace', async () => {
  const root = await workspace();
  assert.equal(resolveInsideWorkspace('../../etc/passwd', root), undefined);
  assert.equal(resolveInsideWorkspace('/etc/passwd', root), undefined);
  assert.ok(resolveInsideWorkspace('chart.png', root));
});

test('extracts an explicit image embed and removes it from the text', async () => {
  const root = await workspace();
  const { items, text } = await extractMedia('Đây là biểu đồ:\n\n![Biểu đồ](chart.png)\n\nXong.', {
    workspaceRoot: root,
  });
  assert.equal(items.length, 1);
  assert.equal(items[0].kind, 'image');
  assert.equal(items[0].filename, 'chart.png');
  assert.ok(items[0].data.length > 0);
  assert.ok(!text.includes('chart.png'));
  assert.ok(text.includes('Đây là biểu đồ'));
});

test('extracts a bare path on its own line', async () => {
  const root = await workspace();
  const { items } = await extractMedia('Kết quả đã lưu tại\nout/second.png', { workspaceRoot: root });
  assert.equal(items.length, 1);
  assert.equal(items[0].filename, 'second.png');
});

test('extracts a linked document', async () => {
  const root = await workspace();
  const { items } = await extractMedia('Tải [bảng dữ liệu](data.csv) về máy.', { workspaceRoot: root });
  assert.equal(items.length, 1);
  assert.equal(items[0].kind, 'document');
  assert.equal(items[0].mimeType, 'text/csv');
});

test('keeps remote urls as urls without downloading', async () => {
  const root = await workspace();
  const { items } = await extractMedia('![remote](https://example.com/pic.png)', { workspaceRoot: root });
  assert.equal(items.length, 1);
  assert.equal(items[0].source, 'url');
  assert.equal(items[0].url, 'https://example.com/pic.png');
});

test('ignores a path that escapes the workspace', async () => {
  const root = await workspace();
  const { items, text } = await extractMedia('![x](../../../etc/hosts.png)', { workspaceRoot: root });
  assert.equal(items.length, 0);
  assert.ok(text.includes('etc/hosts.png'));
});

test('deduplicates repeated references', async () => {
  const root = await workspace();
  const { items } = await extractMedia('![a](chart.png)\n\nvà lại ![b](chart.png)', {
    workspaceRoot: root,
  });
  assert.equal(items.length, 1);
});

test('honours the item cap', async () => {
  const root = await workspace();
  const many = Array.from({ length: 20 }, () => '![x](chart.png)').join('\n');
  const { items } = await extractMedia(many, { workspaceRoot: root, maxItems: 3 });
  assert.ok(items.length <= 3);
});

test('groups consecutive images into albums', () => {
  const image = (n) => ({ kind: 'image', filename: `${n}.png` });
  const doc = { kind: 'document', filename: 'a.csv' };
  const groups = groupForDelivery([image(1), image(2), doc, image(3)]);
  assert.equal(groups.length, 3);
  assert.equal(groups[0].kind, 'album');
  assert.equal(groups[0].items.length, 2);
  assert.equal(groups[1].kind, 'single');
  assert.equal(groups[2].kind, 'single');
});

test('splits albums larger than ten items', () => {
  const items = Array.from({ length: 12 }, (_, i) => ({ kind: 'image', filename: `${i}.png` }));
  const groups = groupForDelivery(items);
  assert.equal(groups[0].kind, 'album');
  assert.equal(groups[0].items.length, 10);
});
