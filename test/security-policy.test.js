import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { inlineEntryWithCsp } from '../vite.config.js';

test('build emits the same script hashes in HTML CSP and the deployable HTTP policy', () => {
  const source = "console.log('trusted entry');";
  const bundle = {
    'index.html': { source: '<head></head><body><script type="module" crossorigin src="./entry.js"></script></body>' },
    'entry.js': { type: 'chunk', isEntry: true, code: source },
    'the-magic-cookie-test.ttf': { type: 'asset' },
    'orange-lovely-test.otf': { type: 'asset' },
  };
  const assets = [];
  inlineEntryWithCsp().generateBundle.call({ emitFile: asset => assets.push(asset) }, {}, bundle);
  const hash = createHash('sha256').update(source).digest('base64');
  const http = assets.find(asset => asset.fileName === 'snappie-app-csp.caddy').source;
  assert.ok(bundle['index.html'].source.includes(`'sha256-${hash}'`));
  assert.ok(http.includes(`'sha256-${hash}'`));
  assert.match(http, /frame-ancestors 'none'/);
  assert.match(http, /script-src-attr 'none'/);
  assert.match(http, /connect-src 'self'/);
  assert.match(http, /worker-src 'self' blob:/);
  assert.doesNotMatch(http.match(/script-src [^;]+/)[0], /unsafe-inline|unsafe-eval/);
  assert.equal(bundle['entry.js'], undefined);
  const brand = assets.find(asset => asset.fileName === 'cms-brand.css').source;
  assert.match(brand, /url\('\/the-magic-cookie-test.ttf'\)/);
  assert.match(brand, /url\('\/orange-lovely-test.otf'\)/);
});
