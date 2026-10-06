import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FILTERS, THEMES, CAPTIONS, CHARS, CHAR_SVG, EMOJI_STICKERS, dateLine, filterCss,
} from '../src/data.js';

test('filters: unique ids, name + css present', () => {
  const ids = FILTERS.map(f => f.id);
  assert.equal(new Set(ids).size, ids.length, 'filter ids must be unique');
  for (const f of FILTERS) {
    assert.ok(f.id && f.name, 'filter needs id and name');
    assert.equal(typeof f.css, 'string', `filter "${f.id}" needs a css string`);
  }
});

test('filter ids are valid CSS-safe slugs', () => {
  for (const f of FILTERS) assert.match(f.id, /^[a-z0-9]+$/, `bad filter id "${f.id}"`);
});

test('themes: unique ids, name present', () => {
  const ids = THEMES.map(t => t.id);
  assert.equal(new Set(ids).size, ids.length, 'theme ids must be unique');
  for (const t of THEMES) {
    assert.ok(t.id && t.name, 'theme needs id and name');
    assert.match(t.id, /^[a-z0-9]+$/, `bad theme id "${t.id}"`);
  }
});

test('every theme has a caption with main text', () => {
  for (const t of THEMES) {
    const cap = CAPTIONS[t.id];
    assert.ok(cap, `missing caption for theme "${t.id}"`);
    assert.ok(cap.main, `caption "${t.id}" needs main text`);
  }
});

test('no orphan captions', () => {
  const themeIds = new Set(THEMES.map(t => t.id));
  for (const key of Object.keys(CAPTIONS)) {
    assert.ok(themeIds.has(key), `caption "${key}" has no matching theme`);
  }
});

test('character list matches the svg map', () => {
  assert.deepEqual([...CHARS].sort(), Object.keys(CHAR_SVG).sort());
});

test('emoji stickers are non-empty and unique', () => {
  assert.ok(EMOJI_STICKERS.length > 0);
  assert.equal(new Set(EMOJI_STICKERS).size, EMOJI_STICKERS.length);
});

test('dateLine format is DD·MM·YYYY', () => {
  assert.match(dateLine(), /^\d{2}·\d{2}·\d{4}$/);
});

test('filterCss resolves ids and falls back to none', () => {
  const first = FILTERS[0].id;
  assert.equal(filterCss(first), FILTERS[0].css);
  const bw = FILTERS.find(f => f.id === 'bw');
  if (bw) assert.equal(filterCss('bw'), bw.css);
  assert.equal(filterCss('tidak-ada'), 'none');
  assert.equal(filterCss(undefined), 'none');
});
