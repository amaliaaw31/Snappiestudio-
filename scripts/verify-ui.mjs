// Run with Chrome's --remote-debugging-port=9337, then: node scripts/verify-ui.mjs [site URL]
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';

const url = process.argv[2] || 'http://127.0.0.1:5173/';
const endpoint = 'http://127.0.0.1:9337';
const target = await (await fetch(`${endpoint}/json/new?about:blank`, { method: 'PUT' })).json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
let nextId = 0;
const pending = new Map(), exceptions = [];
socket.addEventListener('message', async event => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const task = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) task.reject(new Error(message.error.message));
    else task.resolve(message.result);
  } else if (message.method === 'Runtime.exceptionThrown') {
    exceptions.push(message.params.exceptionDetails.text);
  } else if (message.method === 'Fetch.requestPaused') {
    await send('Fetch.fulfillRequest', {
      requestId: message.params.requestId, responseCode: 200,
      responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
      body: Buffer.from('{"total":0}').toString('base64'),
    });
  }
});
function send(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
async function check(expression, description) {
  assert.equal(await evaluate(expression), true, description);
  console.log(`PASS ${description}`);
}
async function key(key, modifiers = 0) {
  const windowsVirtualKeyCode = { Escape: 27, Tab: 9 }[key];
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key, modifiers, windowsVirtualKeyCode });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key, modifiers, windowsVirtualKeyCode });
}
async function waitFor(expression) {
  for (let i = 0; i < 100; i++) {
    if (await evaluate(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out: ${expression}`);
}
async function click(selector) {
  await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el || el.disabled || !el.getClientRects().length || el.closest('[inert]')) throw new Error('Unavailable control: ' + ${JSON.stringify(selector)}); el.focus(); el.click(); })()`);
}
async function screenshot(name) {
  await evaluate('document.fonts.ready');
  await new Promise(resolve => setTimeout(resolve, 200));
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(`/tmp/snappie-${name}.png`, Buffer.from(data, 'base64'));
}
async function importPhotos(count) {
  await evaluate(`(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
    const context = canvas.getContext('2d'); context.fillStyle = '#64748b'; context.fillRect(0, 0, 640, 480);
    context.fillStyle = '#fff'; context.fillRect(40, 40, 160, 120);
    const blob = await new Promise(resolve => canvas.toBlob(resolve));
    const transfer = new DataTransfer();
    for (let i = 0; i < ${count}; i++) transfer.items.add(new File([blob], 'test-photo-' + i + '.png', { type: 'image/png' }));
    document.querySelector('#file-input').files = transfer.files;
    document.querySelector('#btn-gallery-start').click();
    await document.querySelector('#file-input').onchange();
  })()`);
  await waitFor("document.querySelector('#scr-preview').classList.contains('active')");
}
async function checkExport(label) {
  await evaluate("document.querySelector('#btn-download').onclick()");
  const png = await evaluate('window.lastDownload');
  assert.ok(png.width > 0 && png.height > 0 && png.type === 'image/png', label);
  await check("document.querySelector('#again-modal').classList.contains('open')", `${label}: PNG ready with next-session dialog`);
  await click('#btn-close-again');
}

try {
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Fetch.enable', { patterns: [{ urlPattern: '*/api/visitors' }] });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: "localStorage.setItem('snappie-lang', 'id'); localStorage.removeItem('snappie-prefs-v1');" });
  await send('Page.navigate', { url });
  await waitFor("document.querySelector('#btn-start')?.onclick != null");
  await check("[...document.querySelectorAll('[role=dialog]')].every(m => m.getAttribute('aria-label') || document.getElementById(m.getAttribute('aria-labelledby'))?.textContent.trim())", 'all dialogs have accessible names');
  await check("[...document.querySelectorAll('.modal-overlay')].every(m => m.inert)", 'closed dialogs cannot receive focus');
  await click('[data-demo-theme=film]');
  await check("document.querySelector('#demo-frame .frame-outer').classList.contains('th-film') && document.querySelector('[data-demo-theme=film]').getAttribute('aria-pressed') === 'true'", 'demo switches real frame styles and selected state');
  await check("document.querySelector('.start-demo figcaption').textContent.includes('foto')", 'example is labelled as photo example');
  await waitFor("[...document.querySelectorAll('#demo-frame img, #theme-grid img')].every(img => img.complete && img.naturalWidth > 0)");
  await check("[...document.querySelectorAll('#demo-frame img, #theme-grid img')].every(img => img.naturalWidth === 588 && img.naturalHeight === 393)", 'frame examples use the supplied group photo');
  await check("getComputedStyle(document.querySelector('.filter-sample')).backgroundImage.includes('sample-group')", 'filter examples use the supplied group photo');
  await evaluate("document.querySelector('#demo-filter').value = 'bw'; document.querySelector('#demo-filter').dispatchEvent(new Event('change'))");
  await check("[...document.querySelectorAll('#demo-frame img')].every(img => img.style.filter === 'grayscale(1)')", 'homepage effect picker updates every demo photo');
  await evaluate("document.querySelector('#demo-filter').value = 'normal'; document.querySelector('#demo-filter').dispatchEvent(new Event('change'))");
  await check("!document.querySelector('#bg-lines') && performance.getEntriesByType('resource').every(entry => !/\\/bac[.-]/.test(entry.name))", 'homepage does not load or generate the old image background');
  for (const width of [390, 1440]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 720 });
    await screenshot(`start-${width}`);
  }

  await evaluate("navigator.mediaDevices.getUserMedia = () => new Promise((resolve, reject) => { window.rejectCamera = reject; })");
  await click('#btn-start');
  await check("document.querySelector('#btn-start').disabled && document.querySelector('#start-cam-status').textContent.includes('Menunggu')", 'pending camera request has visible status and prevents duplicate requests');
  await evaluate("window.rejectCamera(new DOMException('Denied for test', 'NotAllowedError'))");
  await waitFor("!document.querySelector('#btn-start').disabled");
  await check("document.querySelector('#scr-start').classList.contains('active') && document.querySelector('#start-cam-status').getClientRects().length > 0 && document.querySelector('#start-cam-status').textContent.includes('ditolak') && document.querySelector('#btn-start').textContent.includes('Lagi')", 'denied camera shows visible recovery on start screen');
  await evaluate(`navigator.mediaDevices.getUserMedia = async () => {
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
    window.testCameraCanvas = canvas;
    return canvas.captureStream(10);
  }`);
  await click('#btn-start');
  await waitFor("document.querySelector('#scr-cam').classList.contains('active')");
  await check("document.querySelector('#video').srcObject.active && [...document.querySelectorAll('[data-camera-status]')].every(el => el.style.display === 'none') && !document.querySelector('#btn-start').disabled", 'retry succeeds and clears camera status');
  await evaluate("navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('No camera for test', 'NotFoundError'); }");
  await click('#btn-switch-cam');
  await waitFor("!document.querySelector('#btn-switch-cam').disabled");
  await check("document.querySelector('#camerr').getClientRects().length > 0 && document.querySelector('#camerr').textContent.includes('tidak ditemukan')", 'camera screen shows device-not-found error');
  await click('#scr-cam .mini-header');

  for (const width of [320, 390, 720, 1000, 1440]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 720 });
    await check('document.documentElement.scrollWidth <= innerWidth', `start screen fits ${width}px`);
    for (const dark of [false, true]) {
      await evaluate(`document.body.classList.toggle('dark-mode', ${dark})`);
      await check("(() => { const style = getComputedStyle(document.querySelector('.start-intro')); return style.backgroundColor === 'rgba(0, 0, 0, 0)' && style.borderRadius === '0px' && style.boxShadow === 'none'; })()", 'intro has no surrounding panel in either mode');
      await check(`(() => {
        const luminance = color => { const rgb = color.match(/[\\d.]+/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722; };
        const ratio = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
        const background = getComputedStyle(document.body).backgroundColor;
        const desc = [...document.querySelectorAll('#scr-start .desc')];
        const input = document.querySelector('#custom-text');
        return desc.every(el => ratio(getComputedStyle(el).color, background) >= 4.5)
          && ratio(getComputedStyle(input, '::placeholder').color, getComputedStyle(input).backgroundColor) >= 4.5;
      })()`, `description and placeholder contrast pass in ${dark ? 'dark' : 'light'} mode at ${width}px`);
      await click('#btn-lang');
      await check(`(() => {
        const luminance = color => { const rgb = color.match(/[\\d.]+/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722; };
        const heading = document.querySelector('#lang-title');
        const a = luminance(getComputedStyle(heading).color), b = luminance(getComputedStyle(heading.parentElement).backgroundColor);
        return (Math.max(a, b) + .05) / (Math.min(a, b) + .05) >= 4.5;
      })()`, 'dialog heading contrast passes');
      await check("document.querySelector('#scr-start').inert && document.activeElement.id === 'btn-close-lang'", 'opening dialog focuses close and makes background inert');
      await key('Tab', 8);
      await check("document.activeElement.closest('#lang-modal') !== null && document.activeElement.id !== 'btn-close-lang'", 'Shift+Tab wraps to final dialog control');
      await key('Tab');
      await check("document.activeElement.id === 'btn-close-lang'", 'Tab wraps to first dialog control');
      await key('Escape');
      await check("!document.querySelector('#scr-start').inert && document.activeElement.id === 'btn-lang'", 'Escape closes dialog and restores trigger focus');
    }
  }

  await importPhotos(1);
  await check("document.querySelector('#preview-holder .frame-outer').classList.contains('th-film')", 'chosen demo theme carries into a new session');
  await evaluate("document.querySelector('#preview-holder .slot-img').focus()");
  await key('+');
  await check("document.querySelector('#preview-holder .slot-img').style.transform.includes('scale(1.1)')", 'photo zoom works with keyboard');
  await check("document.querySelector('#scr-preview .workflow [aria-current]').dataset.screen === 'scr-preview'", 'workflow reflects review step');
  await click('#btn-preview-fix');
  await check("document.querySelector('#text-tools').open === false && document.querySelectorAll('.editor-group').length === 3", 'editor groups frame, text, stickers and folds advanced text controls');
  await click('#text-tools summary');
  await evaluate("document.querySelector('#custom-text').value = 'UI verification'; document.querySelector('#custom-text').dispatchEvent(new Event('input', { bubbles: true }))");
  await waitFor("document.querySelector('#result-holder .frame-date')?.textContent === 'UI verification' && !document.querySelector('#scr-result .undo-btn').disabled");
  await new Promise(resolve => setTimeout(resolve, 300));
  await click('#scr-result .undo-btn');
  await check("document.querySelector('#custom-text').value === ''", 'visible Undo restores previous caption');
  await click('#scr-result .redo-btn');
  await check("document.querySelector('#custom-text').value === 'UI verification'", 'visible Redo restores edited caption');
  await check("document.querySelector('#result-holder .frame-outer').style.transform.startsWith('scale(')", 'rerendered frame keeps fitted scale');
  await click('#themepick2');
  await waitFor("[...document.querySelectorAll('#theme-grid img')].every(img => img.complete && img.naturalWidth > 0)");
  await check("document.querySelector('#theme-grid img')?.src.startsWith('blob:')", 'theme thumbnails use local user-photo URLs');
  await evaluate("document.querySelector('#theme-category').value = 'occasion'; document.querySelector('#theme-category').dispatchEvent(new Event('change'))");
  await check("[...document.querySelectorAll('#theme-grid .theme-option')].filter(el => !el.hidden).length === 6", 'theme category filters actual special-occasion themes');
  await evaluate("document.querySelector('#theme-category').value = 'all'; document.querySelector('#theme-category').dispatchEvent(new Event('change'))");
  await click('#theme-grid [data-id=custom]');
  await click('#cf-bg');
  await check("document.querySelector('#color-modal').classList.contains('open') && !document.querySelector('#color-modal').inert && document.querySelector('#customframe-modal').inert", 'nested color dialog disables parent dialog');
  await key('Escape');
  await check("!document.querySelector('#customframe-modal').inert && document.activeElement.id === 'cf-bg'", 'closing nested dialog restores parent control');
  await key('Escape');
  await check("document.activeElement.id === 'themepick2' && !document.querySelector('#scr-result').inert", 'closing custom frame restores result editor');
  await click('#themepick2');
  await click('#theme-grid [data-id=custom]');
  await click('#cf-bg');
  await evaluate('history.back()');
  await waitFor("!document.querySelector('.modal-overlay.open')");
  await check("document.activeElement.id === 'themepick2' && !document.querySelector('#scr-result').inert", 'browser Back closes nested dialogs in stack order and restores editor focus');
  await click('#btn-add-sticker');
  await click('#sticker-emoji-panel .sticker-item');
  await check("!document.querySelector('#scr-result .sticker-hint').hidden && getComputedStyle(document.querySelector('.screen.active .user-sticker')).animationName === 'none'", 'sticker hint appears and selection has no looping animation');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await check("getComputedStyle(document.querySelector('#btn-add-sticker')).transitionDuration.split(',').every(value => parseFloat(value) <= .001)", 'reduced motion disables decorative transitions');
  await send('Emulation.setEmulatedMedia', { features: [] });
  await click('#btn-add-sticker');
  await click('#btn-close-sticker');
  await check("document.activeElement.id === 'btn-add-sticker'", 'close button restores sticker trigger');
  await evaluate(`(() => {
    const original = HTMLAnchorElement.prototype.click;
    const createUrl = URL.createObjectURL.bind(URL);
    const blobs = new Map();
    URL.createObjectURL = blob => { const value = createUrl(blob); blobs.set(value, blob); return value; };
    HTMLAnchorElement.prototype.click = function() {
      if (!this.download) return original.call(this);
      window.lastDownload = (async () => {
        const blob = blobs.get(this.href);
        const image = await createImageBitmap(blob);
        const result = { type: blob.type, width: image.width, height: image.height };
        image.close(); return result;
      })();
    };
  })()`);
  const themes = await evaluate("[...document.querySelectorAll('#theme-grid .theme-option')].map(el => el.dataset.id)");
  for (const theme of themes) {
    await click('#themepick2');
    await click(`#theme-grid [data-id=${theme}]`);
    if (theme === 'custom') await click('#btn-close-customframe');
    await check(`document.querySelector('#result-holder .frame-outer').classList.contains('th-${theme}')`, `${theme}: preview applies chosen theme`);
    await checkExport(theme);
  }
  for (const width of [320, 390, 720, 1000, 1440]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 720 });
    await new Promise(resolve => setTimeout(resolve, 50));
    await check('document.documentElement.scrollWidth <= innerWidth', `result editor fits ${width}px`);
    await check("[...document.querySelectorAll('.result-actions button')].filter(el => el.getClientRects().length).every(el => el.getBoundingClientRect().width >= 40)", 'save and share controls retain usable touch width');
    await check("(() => { const download = document.querySelector('#btn-download').getBoundingClientRect(), share = document.querySelector('#btn-share').getBoundingClientRect(); return Math.abs(download.top - share.top) < 2 && document.querySelector('.result-actions').getBoundingClientRect().height <= 76; })()", 'download footer is compact and inline');
    await click('#btn-share');
    await check("document.querySelector('#share-options').matches(':popover-open') && [...document.querySelectorAll('#share-options button')].every(button => button.getBoundingClientRect().width >= 44)", 'Share reveals touch-friendly social controls');
    await key('Escape');
    await check("!document.querySelector('#share-options').matches(':popover-open') && document.activeElement.id === 'btn-share'", 'Escape closes Share and restores focus');
    await evaluate("document.body.classList.remove('dark-mode'); window.scrollTo(0, 0)");
    if ([390, 1440].includes(width)) await screenshot(`result-${width}`);
  }
  await click('#btn-share');
  await click('#share-ig');
  await check("document.querySelector('#ig-modal').classList.contains('open') && !document.querySelector('#share-options').matches(':popover-open')", 'social action closes Share and opens its existing dialog');
  await key('Escape');
  for (const count of [3, 4, 6]) {
    await click('#scr-result .mini-header');
    await importPhotos(count);
    await check(`document.querySelectorAll('#preview-holder .slot').length === ${count}`, `${count}-photo layout preserves every imported photo`);
    await click('#btn-preview-fix');
    await checkExport(`${count}-photo layout`);
  }
  await click('#scr-result .workflow [data-screen=scr-cam]');
  await waitFor("[...document.querySelectorAll('.filter-sample')].every(el => el.style.backgroundImage.startsWith('url(\"blob:'))");
  await check("document.querySelector('.filter-sample').style.backgroundImage.includes('blob:')", 'filter thumbnails use user photo locally');
  await click('#scr-cam .workflow [data-screen=scr-preview]');
  await check("document.querySelector('#scr-preview').classList.contains('active')", 'workflow returns from camera to photo review');
  await check('document.documentElement.scrollWidth <= innerWidth', 'result editor has no horizontal overflow');
  assert.deepEqual(exceptions, [], 'no uncaught browser exceptions');
  console.log('PASS no uncaught browser exceptions');
} finally {
  socket.close();
  await fetch(`${endpoint}/json/close/${target.id}`);
}
