import test from 'node:test';
import assert from 'node:assert/strict';
import { containRect, OUTPUT_FORMATS } from '../src/output.js';
import { favoriteSettings, readFavorites } from '../src/favorites.js';

test('output contains portrait strips and wide photos without cropping or distortion', () => {
  for (const [width, height] of [[640, 480], [640, 4000], [1500, 2100]]) {
    for (const [targetWidth, targetHeight] of Object.values(OUTPUT_FORMATS)) {
      const rect = containRect(width, height, targetWidth, targetHeight);
      assert.ok(rect.x >= 0 && rect.y >= 0);
      assert.ok(rect.x + rect.width <= targetWidth + 1e-8);
      assert.ok(rect.y + rect.height <= targetHeight + 1e-8);
      assert.ok(Math.abs(rect.width / rect.height - width / height) < 1e-8);
      assert.ok(Math.abs(rect.x * 2 + rect.width - targetWidth) < 1e-8);
    }
  }
});

test('favorites exclude photos, personal text, dates and sticker canvases', () => {
  const settings = favoriteSettings({ theme: 'film', filter: 'normal', photos: ['private'], stickers: ['private'],
    customText: 'private name', customDate: '2000-01-01', captionFont: 'Quicksand', captionColor: '#abcdef',
    customFrame: { bg: '#ff0000', pattern: 'dots' } });
  assert.equal(settings.theme, 'film');
  assert.equal(settings.captionFont, 'Quicksand');
  assert.equal(settings.customFrame.bg, '#ff0000');
  assert.equal(settings.captionColor, '#abcdef');
  assert.doesNotMatch(JSON.stringify(settings), /private|2000-01-01/);
  for (const key of ['photos', 'stickers', 'customText', 'customDate']) assert.ok(!Object.hasOwn(settings, key));
});

test('favorites tolerate blocked storage, invalid JSON and untrusted settings', () => {
  assert.deepEqual(readFavorites({ getItem() { throw new Error('Blocked'); } }), []);
  assert.deepEqual(readFavorites({ getItem: () => '{' }), []);
  assert.deepEqual(readFavorites({ getItem: () => '{}' }), []);
  assert.equal(favoriteSettings({ theme: 'bogus', filter: 'normal' }), null);
  const value = JSON.stringify([null, { name: 'bad', settings: { theme: 'film', filter: 'bogus' } },
    { name: '  ' + 'x'.repeat(50), settings: { theme: 'film', filter: 'normal',
      captionFont: 'evil', captionColor: 'url(evil)', customFrame: { bg: 'url(evil)', pattern: 'evil' } } }]);
  const [entry] = readFavorites({ getItem: () => value });
  assert.equal(entry.name.length, 32);
  assert.equal(entry.settings.captionFont, 'Matcha Iced');
  assert.equal(entry.settings.captionColor, '');
  assert.equal(entry.settings.customFrame.bg, undefined);
  assert.equal(entry.settings.customFrame.pattern, 'none');
});
