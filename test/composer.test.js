import test from 'node:test';
import assert from 'node:assert/strict';
import { compose } from '../src/composer.js';
import { FILTERS, THEMES } from '../src/data.js';

test('compose is an async function', () => {
  assert.equal(typeof compose, 'function');
  assert.equal(compose.constructor.name, 'AsyncFunction');
});

test('compose declares its expected parameters', () => {
  // (photos, layout, theme, stickers = [], showDate = false, customText = '')
  assert.ok(compose.length >= 3);
});

test('every theme id is a valid CSS class slug used by the frame', () => {
  for (const t of THEMES) assert.match(t.id, /^[a-z0-9]+$/);
});

test('filters expose non-empty css values', () => {
  for (const f of FILTERS) assert.ok(f.css && f.css.length > 0);
});
