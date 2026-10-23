import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { createVisitorServer } from '../server/visitor-counter.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = await mkdtemp('/tmp/snappie-cms-layout-');
let now = Date.parse('2026-10-01T05:00:00Z');
let backend;
let failReport = false;
const web = createServer(async (request, response) => {
  if (failReport && request.url.startsWith('/api/admin/report?')) {
    response.writeHead(503, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ error: 'Uji layanan tidak tersedia' })); return;
  }
  if (request.url.startsWith('/api/') || ['/cms', '/cms/dashboard'].includes(request.url)) {
    backend.emit('request', request, response);
    return;
  }
  const file = request.url.slice(1);
  if (!/^[\w.-]+$/.test(file) && !/^icons\/[\w.-]+$/.test(file)) { response.writeHead(404); response.end(); return; }
  try {
    const body = await readFile(root + 'dist/' + file);
    response.writeHead(200, { 'Content-Type': file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' });
    response.end(body);
  } catch { response.writeHead(404); response.end(); }
});
web.listen(0, '127.0.0.1');
await once(web, 'listening');
const base = `http://127.0.0.1:${web.address().port}`;
backend = createVisitorServer({ dbPath: directory + '/visitors.sqlite', now: () => now,
  publicDirectory: new URL('../public/', import.meta.url),
  admin: { passwordHash: bcrypt.hashSync('layout-test-only', 4), allowedOrigins: [base] },
  locate: () => ({ countryCode: 'ID', country: 'Indonesia', province: 'West Java', city: 'Bandung' }),
});
const visit = visitorId => fetch(base + '/api/visitors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visitorId }) });
await visit('ca7c9a39-dc55-46c5-a091-09f2a1b6a8bb');
now = Date.parse('2026-10-23T05:00:00Z');
await visit('ca7c9a39-dc55-46c5-a091-09f2a1b6a8bb');
await visit('ca7c9a39-dc55-46c5-a091-09f2a1b6a8bc');
const debuggerUrl = process.env.CMS_BROWSER_URL || 'http://127.0.0.1:9337';
const target = await (await fetch(debuggerUrl + '/json/new?about:blank', { method: 'PUT' })).json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await once(socket, 'open');
let serial = 0;
const pending = new Map(), exceptions = [];
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const call = pending.get(message.id); pending.delete(message.id);
    if (message.error) call.reject(Error(message.error.message)); else call.resolve(message.result);
  }
  if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.text);
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++serial; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }));
});
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
async function waitFor(expression) {
  for (let index = 0; index < 100; index++) {
    if (await evaluate(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw Error('Timeout: ' + expression);
}
async function check(expression, label) {
  assert.equal(await evaluate(expression), true, label);
  console.log('PASS ' + label);
}
try {
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate', { url: base + '/cms' });
  await waitFor("!!document.querySelector('#login')");
  await evaluate("document.querySelector('#username').value='admin';document.querySelector('#password').value='layout-test-only';document.querySelector('#login').requestSubmit()");
  await waitFor("document.querySelector('#status')?.textContent.startsWith('Diperbarui')");
  await evaluate("document.querySelector('.filter-disclosure').open=true;document.querySelector('#from').value='2026-10-23';document.querySelector('#to').value='2026-10-23';document.querySelector('#filters').requestSubmit()");
  await waitFor("document.querySelector('#new-share').textContent==='50%'");
  await check("document.querySelector('#returning-share').textContent==='50%' && document.querySelector('#donut-total').textContent==='2' && document.querySelector('#donut-new').getAttribute('stroke-dasharray')==='50 50'", 'donut matches new and returning browser report');
  await evaluate("document.querySelector('.filter-disclosure').open=false");
  const panels = ['overview', 'trends', 'regions', 'visits', 'usage', 'settings'];
  for (const width of [320, 390, 768, 1440]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 720 });
    for (const theme of ['light', 'dark']) {
      await evaluate(`if(document.documentElement.dataset.theme!=='${theme}')document.querySelector('#theme-toggle').click()`);
      await check(`(()=>{const luminance=color=>{const rgb=color.match(/[\\d.]+/g).slice(0,3).map(Number).map(value=>{value/=255;return value<=.04045?value/12.92:((value+.055)/1.055)**2.4});return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722};const ratio=(a,b)=>(Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);return ratio(getComputedStyle(document.querySelector('#donut-new')).stroke,getComputedStyle(document.querySelector('#donut-returning')).stroke)>=3&&ratio(getComputedStyle(document.querySelector('.chart-description')).color,getComputedStyle(document.querySelector('main')).backgroundColor)>=4.5;})()`, `${width}px ${theme}: donut segments and muted text meet contrast`);
      for (const view of panels) {
        await evaluate(`document.querySelector('[data-view="${view}"]').click()`);
        await check(`document.documentElement.scrollWidth<=innerWidth && ${JSON.stringify(panels)}.every(view=>document.querySelector('#'+view+'-panel').hidden===(view!=='${view}'))`, `${width}px ${theme}: ${view} fits and shows only selected panel`);
      }
    }
  }
  const count = await evaluate("document.querySelector('#settings-menu').options.length");
  for (let index = 0; index < count; index++) {
    await evaluate(`document.querySelector('#settings-menu').value='${index}';document.querySelector('#settings-menu').dispatchEvent(new Event('change'))`);
    await check("[...document.querySelectorAll('#settings-panel > details')].filter(node=>!node.hidden&&node.open).length===1 && document.documentElement.scrollWidth<=innerWidth", 'setting ' + index + ' opens alone');
  }
  await evaluate("document.querySelector('#settings-menu').value=String([...document.querySelectorAll('#settings-panel > details')].indexOf(document.querySelector('#reset-settings')));document.querySelector('#settings-menu').dispatchEvent(new Event('change'));document.querySelector('#reset').click()");
  await check("document.querySelector('#reset-dialog').open", 'reset confirmation opens from settings');
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await check("!document.querySelector('#reset-dialog').open && document.querySelector('#total').textContent==='2'", 'Escape cancels reset without changing data');
  await evaluate("document.querySelector('[data-view=overview]').focus()");
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', windowsVirtualKeyCode: 13 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await check("!document.querySelector('#overview-panel').hidden && getComputedStyle(document.activeElement).outlineStyle!=='none'", 'keyboard navigation has visible focus');
  for (const body of [{ event: 'png', theme: 'pastel', filter: 'normal' }, { event: 'support_shown' }, { event: 'support_kofi' }]) {
    await fetch(base + '/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }
  await evaluate("Date.now = () => Date.parse('2026-10-23T05:00:00Z'); document.querySelector('[data-view=usage]').click()");
  await waitFor("document.querySelector('#usage-png').textContent==='1'");
  await check("document.querySelector('#usage-shown').textContent==='1' && document.querySelector('#usage-clicks').textContent==='1' && document.querySelector('#usage-themes').textContent.includes('pastel: 1') && document.querySelector('#usage-support').textContent.includes('100%') && !document.querySelector('#usage-panel').hidden", 'usage view shows anonymous counts, top theme and support click rate');
  const openSetting = id => evaluate(`document.querySelector('[data-view=settings]').click();document.querySelector('#settings-menu').value=String([...document.querySelectorAll('#settings-panel > details')].indexOf(document.querySelector('#${id}')));document.querySelector('#settings-menu').dispatchEvent(new Event('change'))`);
  await openSetting('seasons-settings');
  await waitFor("document.querySelector('#seasons-status').textContent.includes('sudah dimuat')");
  await check("document.querySelectorAll('.season-row').length===10 && document.documentElement.scrollWidth<=innerWidth", 'season settings list all ten seasons without overflow');
  await evaluate("document.querySelector('#season-mode-natal').value='on';document.querySelector('#seasons-form').requestSubmit()");
  await waitFor("document.querySelector('#seasons-status').textContent.startsWith('Musim tersimpan')");
  assert.equal((await (await fetch(base + '/api/site-config')).json()).seasons.natal.mode, 'on');
  console.log('PASS saving seasons updates the public site config');
  await openSetting('support-settings');
  await waitFor("document.querySelector('#support-status').textContent.includes('sudah dimuat')");
  await evaluate("document.querySelector('#support-trakteer-url').value='https://evil.example/x';document.querySelector('#support-form').requestSubmit()");
  await waitFor("document.querySelector('#support-status').textContent.startsWith('Gagal menyimpan')");
  await evaluate("document.querySelector('#support-trakteer-url').value='https://trakteer.id/snappiestudio/gift';document.querySelector('#support-form').requestSubmit()");
  await waitFor("document.querySelector('#support-status').textContent.startsWith('Tautan dukungan tersimpan')");
  console.log('PASS support links reject other hosts and save valid ones');
  await openSetting('content-settings');
  await check("document.querySelector('#notice-starts').type==='datetime-local' && document.querySelector('#notice-ends').type==='datetime-local' && document.documentElement.scrollWidth<=innerWidth", 'announcement form has schedule fields');
  await evaluate("document.querySelector('.filter-disclosure').open=true;document.querySelector('#from').value='2099-01-01';document.querySelector('#to').value='2099-01-02';document.querySelector('#filters').requestSubmit()");
  await waitFor("!document.querySelector('#audience-empty').hidden");
  await check("document.querySelector('#donut-total').textContent==='0' && document.querySelector('#donut-new').getAttribute('stroke-dasharray')==='0 100'", 'empty report has no fabricated donut segments');
  await evaluate("document.querySelector('#clear-filters').click()");
  await waitFor("document.querySelector('#donut-total').textContent==='2'");
  failReport = true;
  await evaluate("document.querySelector('#refresh').click()");
  await waitFor("document.querySelector('#status').textContent.startsWith('Tidak dapat memuat statistik')");
  await check("document.querySelector('#status').textContent.includes('Tekan Muat ulang') && document.querySelector('#donut-total').textContent==='2'", 'report error explains retry and preserves last report');
  failReport = false;
  await evaluate("document.querySelector('#refresh').click()");
  await waitFor("document.querySelector('#status').textContent.startsWith('Diperbarui')");
  await send('Emulation.setEmulatedMedia', { media: 'print' });
  await evaluate("window.dispatchEvent(new Event('beforeprint'))");
  await check("['overview','trends','regions'].every(view=>getComputedStyle(document.querySelector('#'+view+'-panel')).display!=='none') && document.querySelector('#trend-chart').width>300", 'print includes overview, trends, regions and rendered charts');
  await send('Emulation.setEmulatedMedia', { media: '' });
  await evaluate("window.dispatchEvent(new Event('afterprint'));document.querySelector('[data-view=trends]').click()");
  const lightChart = await evaluate("document.querySelector('#trend-chart').toDataURL()");
  await evaluate("document.querySelector('#theme-toggle').click()");
  assert.notEqual(await evaluate("document.querySelector('#trend-chart').toDataURL()"), lightChart);
  console.log('PASS trend chart redraws on theme change');
  await evaluate("document.querySelector('[data-view=overview]').click()");
  await evaluate("document.querySelector('.filter-disclosure').open=false");
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await evaluate("if(document.documentElement.dataset.theme!=='light')document.querySelector('#theme-toggle').click()");
  const screenshot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile('/tmp/snappie-cms-layout.png', Buffer.from(screenshot.data, 'base64'));
  assert.deepEqual(exceptions, []);
  console.log('PASS no unhandled browser exceptions; screenshot /tmp/snappie-cms-layout.png');
} finally {
  await fetch(debuggerUrl + '/json/close/' + target.id); socket.close();
  await new Promise(resolve => web.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
