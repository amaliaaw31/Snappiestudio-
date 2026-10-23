import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FILTERS, THEMES, CAPTIONS, CHARS, CHAR_SVG, CHAR_NAMES, EMOJI_STICKERS, dateLine, filterCss, SEASONS, seasonsFor,
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

test('character ids are unique and every character has a name', () => {
  assert.equal(new Set(CHARS).size, CHARS.length);
  for (const c of CHARS) assert.ok(CHAR_NAMES[c], `character "${c}" has no name`);
});

test('character svg fragments have balanced tags', () => {
  for (const c of CHARS) {
    const art = CHAR_SVG[c];
    const opens = (art.match(/<(g|text)[\s>]/g) || []).length;
    const closes = (art.match(/<\/(g|text)>/g) || []).length;
    assert.equal(opens, closes, `character "${c}" has unbalanced tags`);
    assert.ok(!/<(?!\/?(g|path|circle|ellipse|rect|text|polygon)[\s>\/])/.test(art), `character "${c}" has an unexpected tag`);
  }
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

test('seasonal stickers exist and the active season is listed first', () => {
  for (const season of SEASONS) for (const c of season.chars) assert.ok(CHAR_SVG[c], `season sticker "${c}" has no art`);
  const now = date => seasonsFor(new Date(date + 'T12:00')).filter(s => s.now).map(s => s.id);
  assert.deepEqual(now('2026-10-23'), ['halloween']);
  assert.deepEqual(now('2026-12-31'), ['newyear']);
  assert.deepEqual(now('2027-01-05'), ['newyear']);
  assert.deepEqual(now('2026-12-20'), ['natal']);
  assert.deepEqual(now('2027-03-01').sort(), ['lebaran', 'ramadan']);
  assert.deepEqual(now('2028-02-01').sort(), ['imlek', 'lebaran', 'ramadan', 'valentine']);
  assert.deepEqual(now('2026-07-01'), []);
  assert.equal(seasonsFor(new Date('2026-12-20T12:00'))[0].id, 'natal');
});

test('Independence Day stickers show in August', () => {
  assert.deepEqual(seasonsFor(new Date('2026-08-17T12:00')).filter(s => s.now).map(s => s.id), ['merdeka']);
});

test('every season sticker group is active in some part of the year', () => {
  const ids = new Set();
  for (let day = 0; day < 366 * 5; day++) {
    const date = new Date(2026, 0, 1 + day, 12);
    seasonsFor(date).filter(s => s.now).forEach(s => ids.add(s.id));
  }
  assert.deepEqual([...ids].sort(), SEASONS.map(s => s.id).sort());
});

test('CMS overrides hide, force or re-date a season', () => {
  const day = new Date('2026-07-01T12:00');
  const now = overrides => seasonsFor(day, overrides).filter(s => s.now).map(s => s.id);
  assert.deepEqual(now({}), []);
  assert.deepEqual(now({ natal: { mode: 'on' } }), ['natal']);
  assert.equal(seasonsFor(day, { natal: { mode: 'on' } })[0].id, 'natal');
  assert.deepEqual(now({ paskah: { mode: 'auto', from: '2026-06-28', to: '2026-07-02' } }), ['paskah']);
  assert.deepEqual(now({ paskah: { mode: 'auto', from: '2026-07-02', to: '2026-07-09' } }), []);
  assert.ok(!seasonsFor(new Date('2026-10-23T12:00'), { halloween: { mode: 'off' } }).some(s => s.id === 'halloween'));
  assert.equal(seasonsFor(new Date('2026-10-23T12:00'), { halloween: { mode: 'off' } }).length, SEASONS.length - 1);
});

test('theme and filter ids are safe for usage events', () => {
  for (const item of [...THEMES, ...FILTERS]) assert.match(item.id, /^[a-z0-9]{1,24}$/);
});
