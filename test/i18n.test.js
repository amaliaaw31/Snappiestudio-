import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LANGS, translations, setLang, t } from '../src/i18n.js';
import { EMOJI_CATALOG, findEmojiStickers } from '../src/emoji-catalog.js';
import { EMOJI_LOCALES } from '../src/emoji-locales.js';

test('all 16 languages define every interface key and preserve interpolation fields', () => {
  const keys = Object.keys(translations.en).sort();
  const fields = value => [...value.matchAll(/\{\w+\}/g)].map(match => match[0]).sort();
  assert.equal(LANGS.length, 16);
  for (const { code } of LANGS) {
    assert.deepEqual(Object.keys(translations[code]).sort(), keys, code);
    for (const key of keys) {
      const value = translations[code][key];
      assert.ok(typeof value === 'string' && value.trim(), `${code}: ${key}`);
      assert.deepEqual(fields(value), fields(translations.en[key]), `${code}: ${key}`);
    }
  }
});

test('all HTML translation bindings resolve in every language', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const keys = [...html.matchAll(/data-i18n(?:-html|-ph|-aria|-title)?="([^"]+)"/g)].map(match => match[1]);
  for (const { code } of LANGS) {
    for (const key of keys) assert.ok(translations[code][key], `${code}: ${key}`);
  }
});

test('photo labels interpolate numbers and unknown languages leave selection unchanged', () => {
  try {
    setLang('ja');
    assert.equal(t('photo.alt', { number: 3 }), '写真 3');
    setLang('unsupported');
    assert.equal(t('photo.alt', { number: 3 }), '写真 3');
    assert.equal(t('missing.key'), 'missing.key');
  } finally { setLang('id'); }
});

test('all emoji have localized names and searchable native keywords in every language', () => {
  for (const { code } of LANGS) {
    for (const { value } of EMOJI_CATALOG) {
      const entry = EMOJI_LOCALES[code][value];
      assert.ok(entry?.name && entry.keywords, `${code}: ${value}`);
      assert.ok(findEmojiStickers(entry.name, 'all', code).some(item => item.value === value), `${code}: ${entry.name}`);
    }
  }
  assert.ok(findEmojiStickers('熊猫', 'nature', 'zh').some(item => item.value === '🐼'));
  assert.ok(findEmojiStickers('パンダ', 'nature', 'ja').some(item => item.value === '🐼'));
});
