// Run with Chrome's --remote-debugging-port=9337, then: node scripts/verify-ui.mjs [site URL]
import assert from 'node:assert/strict';

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
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key, modifiers });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key, modifiers });
}
async function waitFor(expression) {
  for (let i = 0; i < 100; i++) {
    if (await evaluate(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out: ${expression}`);
}
async function click(selector) {
  await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el || el.closest('[inert]')) throw new Error('Unavailable control: ' + ${JSON.stringify(selector)}); el.focus(); el.click(); })()`);
}

try {
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Fetch.enable', { patterns: [{ urlPattern: '*/api/visitors' }] });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: "localStorage.setItem('snappie-lang', 'id')" });
  await send('Page.navigate', { url });
  await waitFor("document.querySelector('#btn-start')?.onclick != null");
  await check("[...document.querySelectorAll('[role=dialog]')].every(m => m.getAttribute('aria-label') || document.getElementById(m.getAttribute('aria-labelledby'))?.textContent.trim())", 'all dialogs have accessible names');
  await check("[...document.querySelectorAll('.modal-overlay')].every(m => m.inert)", 'closed dialogs cannot receive focus');

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

  for (const width of [320, 390, 1440]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 720 });
    await check('document.documentElement.scrollWidth <= innerWidth', `start screen fits ${width}px`);
    for (const dark of [false, true]) {
      await evaluate(`document.body.classList.toggle('dark-mode', ${dark})`);
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

  await evaluate(`(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
    const context = canvas.getContext('2d'); context.fillStyle = '#64748b'; context.fillRect(0, 0, 640, 480);
    const blob = await new Promise(resolve => canvas.toBlob(resolve));
    const transfer = new DataTransfer(); transfer.items.add(new File([blob], 'test-photo.png', { type: 'image/png' }));
    document.querySelector('#file-input').files = transfer.files;
    document.querySelector('#btn-gallery-start').click();
    await document.querySelector('#file-input').onchange();
  })()`);
  await waitFor("document.querySelector('#scr-preview').classList.contains('active')");
  await click('#btn-preview-fix');
  await click('#themepick2');
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
  await click('#btn-close-sticker');
  await check("document.activeElement.id === 'btn-add-sticker'", 'close button restores sticker trigger');
  await check('document.documentElement.scrollWidth <= innerWidth', 'result editor has no horizontal overflow');
  assert.deepEqual(exceptions, [], 'no uncaught browser exceptions');
  console.log('PASS no uncaught browser exceptions');
} finally {
  socket.close();
  await fetch(`${endpoint}/json/close/${target.id}`);
}
