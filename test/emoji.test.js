import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { EMOJI_CATALOG, EMOJI_CATEGORIES, findEmojiStickers } from '../src/emoji-catalog.js';
import { EMOJI_STICKERS } from '../src/data.js';
import {
  emojiArtwork, emojiStickerUrl, emojiArtMarkup, emojiSourceRect,
  splitEmojiRuns, loadEmojiImgs, drawEmojiArt, drawStickerText,
} from '../src/emoji.js';

test('120 unique sticker emoji have local transparent artwork, including every previous emoji', () => {
  assert.equal(EMOJI_CATALOG.length, 120);
  assert.equal(new Set(EMOJI_CATALOG.map(entry => entry.value)).size, 120);
  for (const category of EMOJI_CATEGORIES) {
    const entries = EMOJI_CATALOG.filter(entry => entry.category === category.id);
    assert.equal(entries.length, 20);
    assert.deepEqual(entries.map(entry => entry.index), Array.from({ length: 20 }, (_, i) => i));
    const png = fs.readFileSync(new URL('../public/emoji/iphone-inspired/' + category.id + '.png', import.meta.url));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.equal(png.readUInt32BE(16), 1402);
    assert.equal(png.readUInt32BE(20), 1122);
    assert.equal(png[25], 6, 'RGBA preserves transparent backgrounds');
    for (const entry of entries) {
      const rect = emojiSourceRect(entry);
      assert.ok(rect.x >= 0 && rect.y >= 0);
      assert.ok(rect.x + rect.width <= 1402.001 && rect.y + rect.height <= 1122);
    }
  }
  for (const value of EMOJI_STICKERS) assert.ok(emojiStickerUrl(value), value);
});

test('search supports Indonesian, English, pasted emoji and category intersection', () => {
  assert.ok(findEmojiStickers('  HATI MERAH ').some(entry => entry.value === '❤️'));
  assert.equal(findEmojiStickers('bubble tea')[0].value, '🧋');
  assert.equal(findEmojiStickers('📷')[0].value, '📷');
  assert.equal(findEmojiStickers('', 'hands').length, 20);
  assert.deepEqual(findEmojiStickers('pizza', 'hearts'), []);
  assert.deepEqual(findEmojiStickers('zzzzzz'), []);
});

test('typed emoji keep whole graphemes and unsupported skin tones/ZWJ sequences remain native', () => {
  assert.deepEqual(splitEmojiRuns('Hi ❤👍🏽👩‍💻 & <3'), [
    { value: 'Hi ', emoji: null },
    { value: '❤', emoji: '❤️' },
    { value: '👍🏽👩‍💻 & <3', emoji: null },
  ]);
  assert.deepEqual(splitEmojiRuns(''), []);
  assert.equal(emojiArtwork('❤️').value, '❤️');
  assert.equal(emojiArtwork('👍🏽'), null);
  assert.equal(emojiArtMarkup('<img onerror=alert(1)>'), '');
});

test('SVG preview and Canvas export share the same crop and preserve the artwork aspect ratio', () => {
  const entry = emojiArtwork('🐱');
  const rect = emojiSourceRect(entry);
  const markup = emojiArtMarkup(entry.value);
  const viewBox = markup.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
  assert.deepEqual(viewBox, [rect.x, rect.y, rect.width, rect.height]);
  assert.ok(markup.includes(emojiStickerUrl(entry.value)));
  const image = { naturalWidth: 1402, naturalHeight: 1122 };
  let args;
  drawEmojiArt({ drawImage: (...values) => { args = values; } }, { image, entry }, 10, 20, 44);
  assert.deepEqual(args.slice(0, 5), [image, ...viewBox]);
  const [x, y, width, height] = args.slice(5);
  assert.ok(Math.abs(width / height - rect.width / rect.height) < 1e-10);
  assert.ok(Math.abs(x + width / 2 - 32) < 1e-10);
  assert.ok(Math.abs(y + height / 2 - 42) < 1e-10);
});

test('mixed text exports supported emoji as artwork and unsupported emoji as text, with optional outline', () => {
  const image = { naturalWidth: 1402, naturalHeight: 1122 };
  const artwork = { '❤️': { image, entry: emojiArtwork('❤️') } };
  const fills = [], strokes = [], drawings = [];
  const context = {
    measureText: value => ({ width: value === 'A' ? 10 : 20 }),
    drawImage: (...args) => drawings.push(args),
    strokeText: (...args) => strokes.push(args),
    fillText: (...args) => fills.push(args),
  };
  drawStickerText(context, 'A❤️B👍🏽', artwork, 28);
  assert.equal(drawings.length, 1);
  assert.deepEqual(fills.map(args => args[0]), ['A', 'B👍🏽']);
  assert.deepEqual(strokes.map(args => args[0]), ['A', 'B👍🏽']);
  assert.equal(fills[0][1], -29);
  assert.equal(fills[1][1], 9);
  strokes.length = 0;
  drawStickerText(context, 'A❤️B👍🏽', artwork, 28, false);
  assert.equal(strokes.length, 0);
});

test('concurrent emoji loads share one decoded atlas and failed loads can be retried', async t => {
  const previous = globalThis.Image;
  t.after(() => { globalThis.Image = previous; });
  const created = [];
  let finish, failParty = true;
  globalThis.Image = class {
    constructor() { created.push(this); }
    decode() {
      if (this.src.includes('faces')) return new Promise(resolve => { finish = resolve; });
      if (failParty) { failParty = false; return Promise.reject(new Error('decode failed')); }
      return Promise.resolve();
    }
  };
  const first = loadEmojiImgs(['😀', '😃', '😀']);
  const second = loadEmojiImgs(['😄']);
  assert.equal(created.length, 1);
  finish();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a['😀'].image, a['😃'].image);
  assert.equal(a['😀'].image, b['😄'].image);
  assert.equal(a['😃'].entry.index, 1);
  await assert.rejects(loadEmojiImgs(['🧸']), /decode failed/);
  assert.ok((await loadEmojiImgs(['🧸']))['🧸'].image);
  assert.equal(created.length, 3);
  assert.equal((await loadEmojiImgs(['☃️']))['☃️'], null);
});
