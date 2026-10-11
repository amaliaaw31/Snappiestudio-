import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const shareCode = source.slice(source.indexOf('/* Teks bagikan:'), source.indexOf('/* ============ tawaran lanjut sesi baru'));
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function setup({ clipboardFails = false } = {}) {
  const nodes = Object.fromEntries([...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => [id, {
    disabled: false, value: '', textContent: '', addEventListener() {},
    select() { this.selected = true; },
  }]));
  let finishCopy;
  let copiedText;
  let payload;
  const file = { name: 'photo.png', type: 'image/png' };
  const context = vm.createContext({
    $: id => nodes[id],
    navigator: {
      clipboard: { writeText: text => {
        copiedText = text;
        return new Promise((resolve, reject) => { finishCopy = () => clipboardFails ? reject(new Error('denied')) : resolve(); });
      } },
      canShare: () => true,
      // Simulate a receiving app that consumes the PNG and drops the text.
      share: async data => { payload = data; },
    },
    window: { location: { href: 'https://snappiestudio.com/' }, open() {} },
    tr: key => key === 'share.caption' ? 'Foto di Snappie Studio' : key,
    showToast() {}, openModal() {}, closeModal() {}, offerAnotherSession() {},
    getWatermarkedFile: async () => file,
  });
  vm.runInContext(shareCode, context);
  return { nodes, finishCopy: () => finishCopy(), copiedText: () => copiedText, payload: () => payload, file };
}

for (const [platform, photo] of [['fb', 'fb-feed'], ['th', 'th-photo']]) {
  test(`${platform}: caption and website are ready before opening a photo-only receiving app`, async () => {
    const app = setup();
    app.nodes[`share-${platform}`].onclick();
    assert.equal(app.nodes[`${platform}-caption`]?.value, 'Foto di Snappie Studio\nhttps://snappiestudio.com/');
    assert.equal(app.nodes[photo].disabled, true, 'wait for the clipboard before allowing photo share');
    app.finishCopy();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(app.nodes[photo].disabled, false);
    assert.equal(app.nodes[`${platform}-caption-status`].textContent, 'sh.captionReady');
    await app.nodes[photo].onclick();
    assert.equal(app.payload().files[0], app.file);
    assert.equal(app.payload().text, 'Foto di Snappie Studio');
    assert.equal(app.payload().url, 'https://snappiestudio.com/');
    assert.equal(app.copiedText(), 'Foto di Snappie Studio\nhttps://snappiestudio.com/');
  });

  test(`${platform}: denied clipboard leaves selectable caption and manual instructions`, async () => {
    const app = setup({ clipboardFails: true });
    app.nodes[`share-${platform}`].onclick();
    assert.ok(app.nodes[`${platform}-caption`]?.value.includes('https://snappiestudio.com/'));
    app.finishCopy();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(app.nodes[`${platform}-caption-status`].textContent, 'sh.captionManual');
    assert.equal(app.nodes[`${platform}-copy-caption`].disabled, false);
    assert.equal(app.nodes[photo].disabled, false);
    app.nodes[`${platform}-caption`].onclick();
    assert.equal(app.nodes[`${platform}-caption`].selected, true);
  });
}
