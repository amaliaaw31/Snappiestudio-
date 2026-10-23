// Run with Chrome's --remote-debugging-port=9337, then: node scripts/verify-ui.mjs [site URL]
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { LANGS, translations } from '../src/i18n.js';
import { EMOJI_LOCALES } from '../src/emoji-locales.js';

const url = process.argv[2] || 'http://127.0.0.1:5173/';
const endpoint = 'http://127.0.0.1:9337';
const target = await (await fetch(`${endpoint}/json/new?about:blank`, { method: 'PUT' })).json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
let nextId = 0;
let acceptDialogs = true;
const nativeDialogs = [];
const fileChoosers = [];
const pending = new Map(), exceptions = [];
const apiEvents = [];
let siteConfigBody = '{"total":0}';
socket.addEventListener('message', async event => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const task = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) task.reject(new Error(message.error.message));
    else task.resolve(message.result);
  } else if (message.method === 'Page.fileChooserOpened') {
    fileChoosers.push(message.params);
  } else if (message.method === 'Page.javascriptDialogOpening') {
    nativeDialogs.push(message.params);
    await send('Page.handleJavaScriptDialog', { accept: acceptDialogs });
  } else if (message.method === 'Runtime.exceptionThrown') {
    exceptions.push(message.params.exceptionDetails.text);
  } else if (message.method === 'Fetch.requestPaused') {
    const requestUrl = message.params.request.url;
    if (requestUrl.endsWith('/api/events')) apiEvents.push(message.params.request.postData || '');
    await send('Fetch.fulfillRequest', {
      requestId: message.params.requestId, responseCode: 200,
      responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
      body: Buffer.from(requestUrl.endsWith('/api/site-config') ? siteConfigBody : '{"total":0}').toString('base64'),
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
async function tap(selector) {
  const point = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.scrollIntoView({ block: 'center' }); const box = el.getBoundingClientRect(); return { x: box.x + box.width / 2, y: box.y + box.height / 2 }; })()`);
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
async function screenshot(name) {
  await evaluate('document.fonts.ready');
  await new Promise(resolve => setTimeout(resolve, 200));
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(`/tmp/snappie-${name}.png`, Buffer.from(data, 'base64'));
}
async function checkHeader() {
  await evaluate("window.scrollTo(0, 0)");
  await check(`(() => {
    const screen = document.querySelector('.screen.active');
    const header = screen.querySelector('.mini-header'), slogan = header.querySelector('.mh-tag');
    const box = slogan.getBoundingClientRect(), bounds = header.getBoundingClientRect();
    return slogan.textContent === 'your little photo moment' && slogan.lang === 'en'
      && box.width > 0 && box.height > 0 && box.left >= bounds.left && box.right <= bounds.right
      && box.bottom <= bounds.bottom && bounds.bottom <= screen.querySelector('.workflow').getBoundingClientRect().top;
  })()`, 'active header displays exact slogan without overlapping navigation');
}
async function importPhotos(count) {
  await evaluate(`(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
    const context = canvas.getContext('2d');
    const colors = ['#d22f27', '#239b56', '#2874a6', '#f1c40f', '#a569bd', '#17a589', '#e67e22', '#795548'];
    const transfer = new DataTransfer();
    for (let i = 0; i < ${count}; i++) {
      context.fillStyle = colors[i]; context.fillRect(0, 0, 640, 480);
      context.fillStyle = '#fff'; context.fillRect(40, 40, 160, 120);
      const blob = await new Promise(resolve => canvas.toBlob(resolve));
      transfer.items.add(new File([blob], 'test-photo-' + i + '.png', { type: 'image/png' }));
    }
    document.querySelector('#file-input').files = transfer.files;
    document.querySelector('#btn-gallery-start').click();
    await document.querySelector('#file-input').onchange();
  })()`);
  await waitFor("document.querySelector('#scr-preview').classList.contains('active')");
}
async function checkExport(label) {
  if (!await evaluate("document.querySelector('#download-options').matches(':popover-open')")) await click('#btn-download-menu');
  await evaluate("document.querySelector('#btn-download').onclick()");
  const png = await evaluate('window.lastDownload');
  assert.ok(png.width > 0 && png.height > 0 && png.type === 'image/png', label);
  await check("document.querySelector('#support-modal').classList.contains('open') && !document.querySelector('#again-modal').classList.contains('open')", `${label}: PNG download opens the support popup first`);
  await check(`(() => { const links = [...document.querySelectorAll('#support-modal .support-links a')]; return links.length === 2 && links[0].href === 'https://trakteer.id/snappiestudio/gift' && links[1].href === 'https://ko-fi.com/snappiestudio' && links.every(a => a.target === '_blank' && a.rel.includes('noopener') && a.rel.includes('noreferrer') && a.getBoundingClientRect().height >= 44 && a.getBoundingClientRect().right <= innerWidth + 1); })()`, `${label}: support links are correct, tappable and not clipped`);
  for (let attempt = 0; attempt < 40 && !apiEvents.some(body => body.includes('"png"')); attempt++) await new Promise(resolve => setTimeout(resolve, 50));
  assert.ok(apiEvents.some(body => { const value = JSON.parse(body); return value.event === 'png' && /^[a-z0-9]{1,24}$/.test(value.theme) && /^[a-z0-9]{1,24}$/.test(value.filter); }), `${label}: PNG download sends an anonymous event with theme and filter`);
  assert.ok(apiEvents.every(body => Object.keys(JSON.parse(body)).every(key => ['event', 'theme', 'filter'].includes(key))), `${label}: usage events carry no photo, text or browser identifiers`);
  console.log(`PASS ${label}: usage events are anonymous`);
  await click('#btn-support-next');
  await check("document.querySelector('#again-modal').classList.contains('open') && !document.querySelector('#support-modal').classList.contains('open')", `${label}: support popup continues to the next-session dialog`);
  await click('#btn-close-again');
  await check("window.dispatchEvent(new Event('beforeunload', { cancelable: true }))", `${label}: downloaded output no longer triggers exit warning`);
  return png;
}
async function dragOrder(from, to, touch = false) {
  await evaluate("document.querySelector('#photo-order').scrollIntoView({ block: 'center' })");
  const points = await evaluate(`[${from}, ${to}].map(index => { const box = document.querySelector('.order-photo[data-index="' + index + '"]').getBoundingClientRect(); return { x: box.x + box.width / 2, y: box.y + box.height / 2 }; })`);
  const [start, end] = points;
  if (touch) {
    await send('Emulation.setTouchEmulationEnabled', { enabled: true });
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 1 }] });
  } else {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...start });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...start, button: 'left', buttons: 1, clickCount: 1 });
  }
  for (let step = 1; step <= 8; step++) {
    const point = { x: start.x + (end.x - start.x) * step / 8, y: start.y + (end.y - start.y) * step / 8 };
    if (touch) await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...point, id: 1 }] });
    else await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point, button: 'left', buttons: 1 });
  }
  if (touch) {
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await send('Emulation.setTouchEmulationEnabled', { enabled: false });
  } else await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...end, button: 'left', buttons: 0, clickCount: 1 });
}
async function checkPhotoLayout(holder, count) {
  await check(`(() => {
    const cols = ${count >= 6 ? 2 : 1};
    const slots = [...document.querySelectorAll('${holder} .slot')].map(el => el.getBoundingClientRect());
    return slots.length === ${count} && slots.every((box, i) => {
      const rowStart = Math.floor(i / cols) * cols;
      return box.width > 0 && Math.abs(box.top - slots[rowStart].top) < 1
        && (i % cols === 0 || box.left > slots[i - 1].right)
        && (i < cols || box.top > slots[i - cols].bottom)
        && Math.abs(box.left - slots[i % cols].left) < 1;
    });
  })()`, `${count} photos keep ${count >= 6 ? 'two columns and ' + (count / 2) + ' rows' : 'one vertical column'} in ${holder}`);
}

try {
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Fetch.enable', { patterns: [{ urlPattern: '*/api/visitors' }, { urlPattern: '*/api/site-config' }, { urlPattern: '*/api/events' }] });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: "localStorage.setItem('snappie-lang', 'id'); localStorage.removeItem('snappie-prefs-v1');" });
  await send('Page.navigate', { url });
  await waitFor("document.querySelector('#btn-start')?.onclick != null");
  await check("document.querySelector('#btn-lang .ms').textContent === 'translate' && document.querySelector('#lang-title .ms').textContent === 'translate'", 'language control and dialog use translation icon');
  await evaluate(`window.languageMessages = ${JSON.stringify(translations)}; window.emojiNames = ${JSON.stringify(Object.fromEntries(LANGS.map(({ code }) => [code, EMOJI_LOCALES[code]['😀'].name])))};`);
  await evaluate(`navigator.mediaDevices.getUserMedia = async () => {
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
    window.testCameraCanvas = canvas;
    return canvas.captureStream(10);
  }`);
  for (const { code } of LANGS) {
    await click('#btn-lang');
    await click(`#lang-grid [data-code=${code}]`);
    await check(`document.documentElement.lang === '${code}' && document.documentElement.dir === '${code === 'ar' ? 'rtl' : 'ltr'}'`, `${code}: language and text direction update`);
    await check(`(() => {
      const messages = window.languageMessages['${code}'];
      const bindings = [['data-i18n', 'textContent'], ['data-i18n-aria', 'aria-label'], ['data-i18n-title', 'title'], ['data-i18n-ph', 'placeholder']];
      return bindings.every(([binding, attribute]) => [...document.querySelectorAll('[' + binding + ']')].every(el => {
        const value = attribute === 'textContent' ? el.textContent : el.getAttribute(attribute);
        return value === messages[el.getAttribute(binding)];
      })) && document.querySelector('#emoji-sticker-grid button').title === window.emojiNames['${code}']
        && document.title === messages['page.title'];
    })()`, `${code}: menu text, tooltips, accessible labels and emoji names use selected language`);
    for (const width of [320, 390, 720, 1440]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 720 });
      await check('document.documentElement.scrollWidth <= innerWidth', `${code}: homepage fits ${width}px`);
    }
    await click('#demo-filter');
    await check(`document.querySelector('#btn-apply-filter').textContent === window.languageMessages['${code}']['filter.apply']`, `${code}: effect confirmation is translated`);
    await click('#filter-grid [data-id=bw]');
    await click('#btn-apply-filter');
    await click('#btn-start');
    await waitFor("document.querySelector('#scr-cam').classList.contains('active')");
    await check(`document.querySelector('#btn-switch-cam').title === window.languageMessages['${code}']['cam.switch'] && document.querySelector('#countdown-val').textContent === window.languageMessages['${code}']['cam.s3'] && document.querySelector('#scr-cam .mini-header').getAttribute('aria-label') === window.languageMessages['${code}']['hdr.home']`, `${code}: camera settings and home control update`);
    await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 900, deviceScaleFactor: 1, mobile: true });
    await check("(() => { const bounds = document.querySelector('#layoutseg').getBoundingClientRect(); return [...document.querySelectorAll('#layoutseg button')].length === 5 && [...document.querySelectorAll('#layoutseg button')].every(button => { const box = button.getBoundingClientRect(); return box.width >= 44 && box.height >= 44 && box.left >= bounds.left && box.right <= bounds.right + 1; }); })()", `${code}: all five photo counts fit a phone with usable touch targets`);
    await click('#scr-cam .mini-header');
    await importPhotos(3);
    await check(`document.querySelector('#preview-holder img').alt === window.languageMessages['${code}']['photo.alt'].replace('{number}', new Intl.NumberFormat('${code}', { useGrouping: false }).format(1))`, `${code}: photo description is localized`);
    await click('#btn-preview-fix');
    for (const width of [320, 390, 720, 1440]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 720 });
      await check('document.documentElement.scrollWidth <= innerWidth', `${code}: editor fits ${width}px`);
    }
    if (['ar', 'ja'].includes(code)) {
      await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 900, deviceScaleFactor: 1, mobile: true });
      await screenshot(`result-${code}-390`);
    }
    await check("[...document.querySelectorAll('.tagline, .mh-tag')].every(el => el.textContent === 'your little photo moment')", `${code}: brand slogan stays unchanged`);
    await click('#scr-result .mini-header');
  }
  await send('Page.navigate', { url });
  await waitFor("document.documentElement?.lang === 'id' && document.querySelector('#btn-start')?.onclick != null");
  await check("[...document.querySelectorAll('[role=dialog]')].every(m => m.getAttribute('aria-label') || document.getElementById(m.getAttribute('aria-labelledby'))?.textContent.trim())", 'all dialogs have accessible names');
  await check("[...document.querySelectorAll('.modal-overlay')].every(m => m.inert)", 'closed dialogs cannot receive focus');
  await check("[...document.querySelectorAll('.tagline, .mh-tag')].length === 4 && [...document.querySelectorAll('.tagline, .mh-tag')].every(el => el.textContent === 'your little photo moment' && el.lang === 'en')", 'all four main screens use the exact English brand slogan');
  await check("document.querySelector('#demo-compare').disabled", 'comparison explains that an effect must be selected first');
  await evaluate("window.initialDemoTheme = document.querySelector('[data-demo-theme][aria-pressed=true]').dataset.demoTheme");
  await click('#demo-shuffle');
  await check("!document.querySelector('#demo-compare').disabled && document.querySelector('#demo-compare').value === '65' && !document.querySelector('#demo-frame .frame-outer').classList.contains('th-' + window.initialDemoTheme) && document.querySelector('#demo-style').textContent.includes(document.querySelector('#demo-filter').textContent)", 'shuffle changes theme and effect and exposes comparison');
  await click('#demo-filter');
  await click('#filter-grid [data-id=normal]');
  await click('#btn-apply-filter');
  await click('[data-demo-theme=film]');
  await check("document.querySelector('#demo-frame .frame-outer').classList.contains('th-film') && document.querySelector('[data-demo-theme=film]').getAttribute('aria-pressed') === 'true'", 'demo switches real frame styles and selected state');
  await check("!document.querySelector('.demo-theme-preview, .demo-preset-effect, #demo-prev, #demo-next, .demo-gallery-nav') && [...document.querySelectorAll('.demo-themes button')].every(button => button.textContent.replace('check', '').trim() === button.querySelector('[data-i18n^=\"theme.\"]').textContent.trim()) && [...document.querySelectorAll('#demo-frame .demo-effect')].every(image => image.style.filter === 'none')", 'style chips show only the frame name, change only the frame and keep the chosen effect');
  await key('ArrowRight');
  await check("document.querySelector('[data-demo-theme=minimal]').getAttribute('aria-pressed') === 'true' && getComputedStyle(document.querySelector('[data-demo-theme=minimal] .demo-selected')).visibility === 'visible'", 'gallery keyboard selects a style with a visible check mark');
  await key('ArrowLeft');
  await check("(() => { const card = document.activeElement, gallery = document.querySelector('.demo-themes').getBoundingClientRect(), box = card.getBoundingClientRect(), style = getComputedStyle(card); return card.matches(':focus-visible') && parseFloat(style.outlineWidth) >= 2 && box.left - 5 >= gallery.left - 1 && box.right + 5 <= gallery.right + 1; })()", 'gallery focus ring stays visible inside scroll container');
  await check("(() => { document.querySelector('[data-demo-theme=film]').click(); return document.querySelector('#demo-frame .frame-outer').getAnimations().some(animation => animation.effect.getKeyframes().some(frame => frame.clipPath)); })()", 'style selection triggers one print reveal');
  await click('#demo-filter');
  await click('#filter-grid [data-id=normal]');
  await click('#btn-apply-filter');
  await check("document.querySelector('.start-demo .demo-caption').textContent.includes('foto')", 'example is labelled as photo example');
  await waitFor("[...document.querySelectorAll('#demo-frame img, #theme-grid img')].every(img => img.complete && img.naturalWidth > 0)");
  await check("[...document.querySelectorAll('#demo-frame img, #theme-grid img')].every(img => img.naturalWidth === 588 && img.naturalHeight === 393)", 'frame examples use the supplied group photo');
  await check("getComputedStyle(document.querySelector('.filter-sample')).backgroundImage.includes('sample-group')", 'filter examples use the supplied group photo');
  await click('#demo-filter');
  await check("document.querySelector('#filter-modal').classList.contains('open') && document.querySelector('#scr-start').inert", 'homepage effects open an accessible modal');
  await click('#filter-grid [data-id=bw]');
  await check("document.querySelector('#filter-modal').classList.contains('open') && document.querySelector('#filter-preview-photo').style.filter === 'grayscale(1)' && document.querySelector('#filter-grid [data-id=bw]').getAttribute('aria-pressed') === 'true'", 'effect can be tried inside modal with accessible selected state');
  await check("[...document.querySelectorAll('#demo-frame .demo-effect')].every(img => img.style.filter === 'none')", 'trying an effect leaves committed homepage photos unchanged');
  await click('#filter-grid [data-id=sepia]');
  await check("document.querySelector('#filter-grid [data-id=sepia]').getAttribute('aria-pressed') === 'true' && document.querySelector('#filter-grid [data-id=bw]').getAttribute('aria-pressed') === 'false'", 'multiple effects can be compared before applying');
  await click('#filter-grid [data-id=bw]');
  await click('#btn-apply-filter');
  await check("[...document.querySelectorAll('#demo-frame .demo-effect')].every(img => img.style.filter === 'grayscale(1)')", 'homepage effect picker updates every demo photo');
  await check("document.activeElement.id === 'demo-filter' && !document.querySelector('#filter-modal').classList.contains('open')", 'effect selection closes modal and restores focus');
  for (const value of [0, 50, 100]) {
    await evaluate(`document.querySelector('#demo-compare').value = ${value}; document.querySelector('#demo-compare').dispatchEvent(new Event('input', { bubbles: true }))`);
    await check(`document.querySelector('#demo-frame').style.getPropertyValue('--demo-reveal') === '${value}%' && document.querySelector('#demo-frame').classList.contains('is-comparing') === ${value === 50} && [...document.querySelectorAll('#demo-frame .demo-original')].every(image => !image.style.filter)`, `comparison slider reveals ${value}% effect without changing originals`);
  }
  await evaluate("document.querySelector('#demo-compare').focus()");
  await key('ArrowLeft');
  await check("document.querySelector('#demo-compare').value === '99'", 'comparison supports keyboard arrows');

  await click('#demo-filter');
  await click('#filter-grid [data-id=sepia]');
  await key('Escape');
  await check("document.activeElement.id === 'demo-filter' && !document.querySelector('#filter-modal').classList.contains('open')", 'homepage effects support Escape and focus restoration');
  await check("[...document.querySelectorAll('#demo-frame .demo-effect')].every(img => img.style.filter === 'grayscale(1)')", 'Escape discards unconfirmed effect');
  await click('#demo-filter');
  await check("document.querySelector('#filter-grid [data-id=bw]').getAttribute('aria-pressed') === 'true'", 'reopening effects restores committed selection');
  await evaluate("document.querySelector('#btn-close-filter').focus()");
  await key('Tab', 8);
  await check("document.activeElement.id === 'btn-apply-filter'", 'backward Tab includes modal apply action');
  await key('Tab');
  await check("document.activeElement.id === 'btn-close-filter'", 'forward Tab remains inside effect modal');
  await click('#filter-grid [data-id=normal]');
  await click('#btn-apply-filter');
  await check("getComputedStyle(document.body, '::before').maskImage.includes('start-lines') && performance.getEntriesByType('resource').every(entry => !/\\/bac[.-]/.test(entry.name))", 'homepage restores static background without runtime image processing');
  await evaluate(`window.frameDimensions = root => {
    const outer = root.querySelector('.frame-outer'), frame = root.querySelector('.frame');
    const slot = root.querySelector('.slot'), captions = root.querySelector('.frame-captions');
    return [outer.offsetWidth, outer.offsetHeight, frame.offsetWidth, frame.offsetHeight,
      slot.offsetWidth, slot.offsetHeight, getComputedStyle(root.querySelector('.photos-strip')).gap,
      captions.offsetHeight];
  }; window.demoDimensions = {};`);
  for (const width of [320, 390, 720, 1000, 1440]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 720 });
    // Urutan sama di semua lebar: gaya foto, contoh bingkai, coba efek, lalu bandingkan efek.
    await check(`(() => { const rect = selector => document.querySelector(selector).getBoundingClientRect(); const themes = rect('.demo-themes'), frame = rect('#demo-frame'), filter = rect('#demo-filter'), compare = rect('#demo-compare');
      return themes.bottom <= frame.top && frame.bottom <= filter.top && filter.bottom <= compare.top; })()`, `homepage order is styles, frame, effect, comparison at ${width}px`);
    await check("(() => { const button = document.querySelector('#btn-faq').getBoundingClientRect(), theme = document.querySelector('#toggle-dark').getBoundingClientRect(), lang = document.querySelector('#btn-lang').getBoundingClientRect(); return button.width >= 44 && button.height >= 44 && button.right <= theme.left && button.left >= lang.right && Math.abs((button.top + button.height / 2) - (theme.top + theme.height / 2)) < 6; })()", `FAQ icon sits beside the theme toggle and is tappable at ${width}px`);
    await evaluate("window.installHidden = document.getElementById('btn-install-top').hidden; document.getElementById('btn-install-top').hidden = false");
    await check(`(() => { const button = document.querySelector('#btn-install-top'), faq = document.querySelector('#btn-faq').getBoundingClientRect(), lang = document.querySelector('#btn-lang').getBoundingClientRect(), box = button.getBoundingClientRect();
      const label = [...button.children].find(node => node.matches('[data-i18n]')).getBoundingClientRect(); const icons = [...button.querySelectorAll('.ms')].filter(node => getComputedStyle(node).display !== 'none');
      const wide = ${width >= 720};
      return !document.querySelector('#btn-install') && getComputedStyle(button).position === 'fixed' && box.width >= 44 && box.height >= 44 && box.right <= faq.left && box.left > lang.right && Math.abs((box.top + box.height / 2) - (faq.top + faq.height / 2)) < 6
        && icons.length === 1 && icons[0].textContent === (wide ? 'install_desktop' : 'install_mobile') && (wide ? label.width > 40 : label.width <= 1) && button.textContent.includes(button.querySelector('[data-i18n]').textContent); })()`, `install button is fixed beside the FAQ icon with ${width >= 720 ? 'icon and label' : 'icon only'} at ${width}px`);
    await check(`(() => { const buttons = ['#btn-lang', '#btn-install-top', '#btn-faq', '#toggle-dark'].map(selector => document.querySelector(selector));
      const icons = buttons.map(button => [...button.querySelectorAll('.ms')].find(node => getComputedStyle(node).display !== 'none'));
      const style = (node, name) => getComputedStyle(node)[name]; const box = button => button.getBoundingClientRect();
      return buttons.every(button => style(button, 'position') === 'fixed' && style(button, 'borderTopStyle') === 'none' && style(button, 'backgroundColor') === 'rgba(0, 0, 0, 0)' && box(button).height === 44 && Math.round(box(button).top) === 11 && box(button).width >= 44)
        && new Set(icons.map(icon => style(icon, 'fontSize'))).size === 1 && style(icons[0], 'fontSize') === '28px' && new Set(icons.map(icon => style(icon, 'color'))).size === 1
        && new Set(icons.map(icon => style(icon, 'fontVariationSettings'))).size === 1; })()`, `corner icons share size, colour, style and alignment at ${width}px`);
    await evaluate("document.getElementById('btn-install-top').hidden = window.installHidden");
    await click('#btn-faq');
    await check("(() => { const modal = document.querySelector('#faq-modal'); const card = modal.querySelector('.modal-card').getBoundingClientRect(); const items = [...modal.querySelectorAll('details')]; return modal.classList.contains('open') && items.length === 5 && card.right <= innerWidth + 1 && card.left >= -1 && items.every(item => item.querySelector('summary').getBoundingClientRect().height >= 44); })()", `FAQ popup opens with five tappable questions at ${width}px`);
    await evaluate("document.querySelectorAll('#faq-modal details')[4].open = true");
    await check("(() => { const modal = document.querySelector('#faq-modal .modal-body'); return document.documentElement.scrollWidth <= innerWidth && modal.scrollWidth <= modal.clientWidth + 1; })()", `FAQ answers fit without horizontal scrolling at ${width}px`);
    await key('Escape');
    await check("!document.querySelector('#faq-modal').classList.contains('open') && document.activeElement.id === 'btn-faq'", `Escape closes the FAQ popup and returns focus to its icon at ${width}px`);
    await check("(() => { const gallery = document.querySelector('.demo-themes'); return [...gallery.querySelectorAll('button')].every(button => button.getBoundingClientRect().height >= 44 && button.getBoundingClientRect().width >= 44) && gallery.offsetHeight === gallery.clientHeight && getComputedStyle(gallery).scrollbarWidth === 'none'; })()", `style chips are tappable and the gallery shows no scrollbar at ${width}px`);
    await evaluate("window.themeButtonBounds = [...document.querySelectorAll('[data-demo-theme]')].map(button => { const box = button.getBoundingClientRect(); return [box.width, box.height]; })");
    for (const theme of ['pastel', 'minimal', 'film']) {
      await click(`[data-demo-theme=${theme}]`);
      await check("JSON.stringify(window.themeButtonBounds) === JSON.stringify([...document.querySelectorAll('[data-demo-theme]')].map(button => { const box = button.getBoundingClientRect(); return [box.width, box.height]; }))", `gallery card sizes stay stable when selecting ${theme} at ${width}px`);
      await evaluate(`window.demoDimensions['${width}-${theme}'] = window.frameDimensions(document.querySelector('#demo-frame'))`);
      await check(`(() => { const frame = document.querySelector('#demo-frame .frame'); const bounds = frame.getBoundingClientRect(); return getComputedStyle(frame).display === 'block' && frame.querySelectorAll('.slot').length === 3 && [...frame.querySelectorAll('.slot')].every(slot => { const box = slot.getBoundingClientRect(); return box.width > 0 && box.left >= bounds.left && box.right <= bounds.right + 1 && box.top >= bounds.top && box.bottom <= bounds.bottom + 1; }); })()`, `homepage ${theme} frame contains photos at ${width}px`);
    }
  }
  for (const width of [390, 1440]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 720 });
    await screenshot(`start-${width}`);
  }
  for (const [width, height] of [[390, 844], [412, 915], [844, 390]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
    await send('Emulation.setTouchEmulationEnabled', { enabled: true });
    await tap('#demo-filter');
    await waitFor("document.querySelector('#filter-modal').classList.contains('open')");
    await check("(() => { const apply = document.querySelector('#btn-apply-filter').getBoundingClientRect(); const modal = document.querySelector('#filter-modal .modal-card').getBoundingClientRect(); return apply.height >= 44 && apply.bottom <= innerHeight && modal.top >= 0 && modal.bottom <= innerHeight && document.documentElement.scrollWidth <= innerWidth; })()", `effect modal fits mobile viewport ${width}x${height}`);
    if (width === 390) await screenshot('filter-390');
    await tap('#filter-grid [data-id=bw]');
    await waitFor("document.querySelector('#filter-grid [data-id=bw]').getAttribute('aria-pressed') === 'true'");
    await tap('#btn-apply-filter');
    await waitFor("!document.querySelector('#filter-modal').classList.contains('open')");
    await check("[...document.querySelectorAll('#demo-frame .demo-effect')].every(img => img.style.filter === 'grayscale(1)')", `touch applies effect at ${width}x${height}`);
  }
  await send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 900, deviceScaleFactor: 1, mobile: true });
  await evaluate('window.scrollTo(0, 0)');
  await waitFor("document.querySelector('#home-actions').hidden");
  await evaluate("window.scrollTo(0, document.scrollingElement.scrollHeight)");
  await waitFor("!document.querySelector('#home-actions').hidden");
  await check("(() => { const bar = document.querySelector('#home-actions').getBoundingClientRect(); return bar.bottom <= innerHeight && bar.height <= 110 && [...document.querySelectorAll('#home-actions button')].every(button => { const box = button.getBoundingClientRect(); return box.width >= 44 && box.height >= 44; }) && document.querySelector('.visitor-count').getBoundingClientRect().bottom <= bar.top; })()", 'mobile start actions stay compact and do not cover final content');
  await send('Emulation.setDeviceMetricsOverride', { width: 640, height: 900, deviceScaleFactor: 1, mobile: true });
  await evaluate("document.documentElement.style.zoom = '2'; window.dispatchEvent(new Event('resize')); window.scrollTo(0, document.scrollingElement.scrollHeight)");
  await waitFor("!document.querySelector('#home-actions').hidden");
  await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  await evaluate("window.scrollTo(0, document.scrollingElement.scrollHeight)");
  await check("(() => { const bar = document.querySelector('#home-actions').getBoundingClientRect(); return document.body.getBoundingClientRect().width <= innerWidth + 1 && bar.right <= innerWidth + 1 && document.querySelector('.visitor-count').getBoundingClientRect().bottom <= bar.top + 1; })()", '200 percent zoom preserves content and mobile actions');
  await evaluate("document.documentElement.style.zoom = ''; window.dispatchEvent(new Event('resize'))");
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 900, deviceScaleFactor: 1, mobile: true });
  await waitFor("!document.querySelector('#home-actions').hidden");
  await send('Page.setInterceptFileChooserDialog', { enabled: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true });
  const chooserCount = fileChoosers.length;
  await tap('#home-gallery');
  for (let attempt = 0; attempt < 100 && fileChoosers.length === chooserCount; attempt++) await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(fileChoosers.length, chooserCount + 1, 'mobile gallery action opens actual image picker');
  await send('Page.setInterceptFileChooserDialog', { enabled: false });
  await send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await evaluate("navigator.mediaDevices.getUserMedia = () => new Promise((resolve, reject) => { window.rejectCamera = reject; })");
  await click('#home-camera');
  await waitFor("document.querySelector('#home-camera').disabled");
  await check("document.querySelector('#home-camera').disabled && document.querySelector('#home-camera').getAttribute('aria-busy') === 'true'", 'mobile camera action shares busy state and prevents duplicate requests');
  await check("document.querySelector('#btn-start').disabled && document.querySelector('#start-cam-status').textContent.includes('Menunggu')", 'pending camera request has visible status and prevents duplicate requests');
  await evaluate("window.rejectCamera(new DOMException('Denied for test', 'NotAllowedError'))");
  await waitFor("!document.querySelector('#btn-start').disabled");
  await check("document.querySelector('#scr-start').classList.contains('active') && document.querySelector('#start-cam-status').getClientRects().length > 0 && document.querySelector('#start-cam-status').textContent.includes('ditolak') && document.querySelector('#btn-start').textContent.includes('Lagi')", 'denied camera shows visible recovery on start screen');
  await check("!document.querySelector('#home-camera').disabled && document.querySelector('#home-camera-label').textContent === document.querySelector('#btn-start').textContent && !document.querySelector('#home-camera-status').hidden && document.querySelector('#home-camera-status').textContent.includes('ditolak')", 'mobile action exposes permission error and retry');
  await evaluate(`navigator.mediaDevices.getUserMedia = async () => {
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
    window.testCameraCanvas = canvas;
    return canvas.captureStream(10);
  }`);
  await click('#home-camera');
  await waitFor("document.querySelector('#scr-cam').classList.contains('active')");
  await check("document.querySelector('#home-actions').hidden", 'home action bar stays confined to homepage');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await check("getComputedStyle(document.body, '::before').content === 'none' && getComputedStyle(document.body, '::before').maskImage === 'none'", 'restored background appears only on homepage');
  await check("document.querySelector('#video').srcObject.active && [...document.querySelectorAll('[data-camera-status]')].every(el => el.style.display === 'none') && !document.querySelector('#btn-start').disabled", 'retry succeeds and clears camera status');
  await click('#layoutseg [data-layout="8"]');
  await check("document.querySelector('#layoutseg [data-layout=\"8\"]').classList.contains('sel') && document.querySelector('#shot-count').textContent === '0 / 8' && JSON.parse(localStorage.getItem('snappie-prefs-v1')).layout === 8", 'camera selects eight photos and remembers the preference');
  await click('#layoutseg [data-layout="3"]');
  for (const width of [320, 390, 600, 719, 720, 1000, 1440]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 720 });
    await checkHeader();
    if (width === 390) await screenshot('camera-header-390');
  }
  await click('#filter-strip [data-id=bw]');
  await check("document.querySelector('#video').style.filter === 'grayscale(1)' && document.querySelector('#filter-strip [data-id=bw]').getAttribute('aria-pressed') === 'true' && document.querySelector('#filter-strip [data-id=normal]').getAttribute('aria-pressed') === 'false'", 'camera strip applies effects immediately and exposes selected filter');
  await click('#filter-strip [data-id=normal]');
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
          && ratio(getComputedStyle(input, '::placeholder').color, getComputedStyle(input).backgroundColor) >= 4.5
          && [...document.querySelectorAll('.demo-themes button')].every(button => ratio(getComputedStyle(button).color, getComputedStyle(button).backgroundColor) >= 4.5);
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
  await check("document.querySelector('#photo-order').hidden && !window.dispatchEvent(new Event('beforeunload', { cancelable: true }))", 'single photo hides reorder tools and unsaved photos enable exit warning');
  for (const width of [320, 390, 600, 719, 720, 1000, 1440]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 720 });
    await checkHeader();
  }
  await check("document.querySelector('#preview-holder .frame-outer').classList.contains('th-film')", 'chosen demo theme carries into a new session');
  await evaluate("document.querySelector('#preview-holder .slot-img').focus()");
  await key('+');
  await check("document.querySelector('#preview-holder .slot-img').style.transform.includes('scale(1.1)')", 'photo zoom works with keyboard');
  await check("document.querySelector('#scr-preview .workflow [aria-current]').dataset.screen === 'scr-preview'", 'workflow reflects review step');
  await click('#btn-preview-fix');
  await check("!document.querySelector('#scr-result .history-controls, #scr-result .undo-btn, #scr-result .redo-btn') && document.querySelectorAll('#scr-preview .history-controls button').length === 2", 'result omits Undo/Redo while preview retains history controls');
  await check("document.querySelector('#text-tools').open === false && document.querySelectorAll('.editor-group').length === 3", 'editor groups frame, text, stickers and folds advanced text controls');
  await click('#text-tools summary');
  await check("document.querySelector('#date-controls').hidden && !document.querySelector('#date-edit-btn').getClientRects().length", 'date controls stay hidden while date toggle is off');
  await click('#toggle-date');
  await check("!document.querySelector('#date-controls').hidden && !document.querySelector('#date-edit-btn').disabled && document.querySelector('#date-color').getClientRects().length > 0", 'date toggle reveals date picker, font and color');
  await click('#date-edit-btn');
  await check("document.querySelector('#date-modal').classList.contains('open')", 'revealed date control opens date picker');
  await key('Escape');
  await evaluate("document.querySelector('#date-font').value = 'Quicksand'; document.querySelector('#date-font').dispatchEvent(new Event('change', { bubbles: true }))");
  await click('#toggle-date');
  await check("document.querySelector('#date-controls').hidden && document.querySelector('#date-font').value === 'Quicksand'", 'turning dates off hides controls and retains session settings');

  await evaluate("document.querySelector('#custom-text').value = 'UI verification'; document.querySelector('#custom-text').dispatchEvent(new Event('input', { bubbles: true }))");
  await waitFor("document.querySelector('#result-holder .frame-date')?.textContent === 'UI verification'");
  await new Promise(resolve => setTimeout(resolve, 300));
  await click('#scr-result .workflow [data-screen=scr-preview]');
  await click('#scr-preview .undo-btn');
  await check("document.querySelector('#custom-text').value === ''", 'visible Undo restores previous caption');
  await click('#scr-preview .redo-btn');
  await check("document.querySelector('#custom-text').value === 'UI verification'", 'visible Redo restores edited caption');
  await click('#btn-preview-fix');
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
  await check("getComputedStyle(document.querySelector('.start-intro')).animationName === 'none' && getComputedStyle(document.querySelector('#demo-frame .frame-outer')).animationName === 'none' && document.querySelector('#demo-frame .frame-outer').getAnimations().length === 0", 'homepage motion respects reduced motion');
  await send('Emulation.setEmulatedMedia', { features: [] });
  await click('#btn-add-sticker');
  await click('#btn-close-sticker');
  await check("document.activeElement.id === 'btn-add-sticker'", 'close button restores sticker trigger');
  await evaluate(`(() => {
    const original = HTMLAnchorElement.prototype.click;
    const createUrl = URL.createObjectURL.bind(URL);
    const blobs = new Map();
    window.downloadBlobs = blobs;
    URL.createObjectURL = blob => { const value = createUrl(blob); blobs.set(value, blob); return value; };
    HTMLAnchorElement.prototype.click = function() {
      if (!this.download) return original.call(this);
      window.lastDownload = (async () => {
        const blob = blobs.get(this.href);
        const image = await createImageBitmap(blob);
        const result = { type: blob.type, width: image.width, height: image.height };
        if (window.exportLayoutSpec) {
          const { cols, rows } = window.exportLayoutSpec;
          const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
          const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
          const gapX = cols > 1 ? (image.width - cols * 640) / (cols - 1) : 0;
          const gapY = rows > 1 ? (image.height - rows * 480) / (rows - 1) : 0;
          result.samples = Array.from({ length: cols * rows }, (_, i) => [...context.getImageData(
            Math.round(320 + (i % cols) * (640 + gapX)),
            Math.round(240 + Math.floor(i / cols) * (480 + gapY)), 1, 1).data].slice(0, 3));
        }
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
    await checkHeader();
    await check("[...document.querySelectorAll('.result-actions button')].filter(el => el.getClientRects().length).every(el => el.getBoundingClientRect().width >= 40)", 'save and share controls retain usable touch width');
    await check("(() => { const download = document.querySelector('#btn-download-menu').getBoundingClientRect(), share = document.querySelector('#btn-share').getBoundingClientRect(); return Math.abs(download.top - share.top) < 2 && document.querySelector('.result-actions').getBoundingClientRect().height <= 76; })()", 'download footer is compact and inline');
    await click('#btn-download-menu');
    await check("document.querySelector('#download-options').matches(':popover-open') && document.querySelector('#download-options #output-format') && document.querySelector('#download-options #btn-download') && !!document.querySelector('#download-options #btn-gif')", 'download menu combines format, PNG and GIF');
    await check("(() => { const box = document.querySelector('#download-options').getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight; })()", 'download menu fits screen');
    if (width === 390) await screenshot('download-menu-390');
    await key('Escape');
    await check("!document.querySelector('#download-options').matches(':popover-open') && document.activeElement.id === 'btn-download-menu'", 'Escape closes download menu and restores focus');
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
  for (const count of [3, 4, 6, 8]) {
    await click('#scr-result .mini-header');
    await importPhotos(count);
    await check(`document.querySelectorAll('#preview-holder .slot').length === ${count}`, `${count}-photo layout preserves every imported photo`);
    await checkPhotoLayout('#preview-holder', count);
    if (count >= 4) {
      await waitFor("[...document.querySelectorAll('#photo-order-list img')].every(image => image.complete && image.naturalWidth > 0)");
      await evaluate("window.initialPhotoOrder = [...document.querySelectorAll('#photo-order-list img')].map(image => image.src)");
      await new Promise(resolve => setTimeout(resolve, 300));
      await dragOrder(0, count - 1, count === 6);
      await check("JSON.stringify([...document.querySelectorAll('#photo-order-list img')].map(image => image.src)) === JSON.stringify([...window.initialPhotoOrder.slice(1), window.initialPhotoOrder[0]])", `${count} photos reorder by ${count === 6 ? 'touch' : 'mouse'} drag`);
      await check("JSON.stringify([...document.querySelectorAll('#preview-holder .slot-img')].map(image => image.src)) === JSON.stringify([...document.querySelectorAll('#photo-order-list img')].map(image => image.src))", 'frame preview follows thumbnail order');
      await new Promise(resolve => setTimeout(resolve, 300));
      await click('#scr-preview .undo-btn');
      await check("JSON.stringify([...document.querySelectorAll('#photo-order-list img')].map(image => image.src)) === JSON.stringify(window.initialPhotoOrder)", 'Undo restores photo order');
      await click('#scr-preview .redo-btn');
      await dragOrder(count - 1, 0, count === 6);
      await click('#order-next');
      await key('ArrowLeft');
      await check("JSON.stringify([...document.querySelectorAll('#photo-order-list img')].map(image => image.src)) === JSON.stringify(window.initialPhotoOrder)", 'move button and keyboard preserve original photo objects');
      if (count === 8) {
        await click('#scr-preview .workflow [data-screen=scr-cam]');
        const before = nativeDialogs.length;
        acceptDialogs = false;
        await click('#layoutseg [data-layout="1"]');
        acceptDialogs = true;
        assert.equal(nativeDialogs.length, before + 1, 'layout reset requests confirmation');
        await check(`document.querySelector('#layoutseg [data-layout="8"]').classList.contains('sel') && document.querySelector('#shot-count').textContent === '8 / 8'`, 'canceling layout reset preserves all eight photos');
        await click('#scr-cam .workflow [data-screen=scr-preview]');
        const beforeReload = nativeDialogs.length;
        await evaluate('window.orderReloadMarker = true');
        acceptDialogs = false;
        await send('Page.reload');
        for (let attempt = 0; attempt < 100 && nativeDialogs.length === beforeReload; attempt++) await new Promise(resolve => setTimeout(resolve, 50));
        acceptDialogs = true;
        assert.equal(nativeDialogs.at(-1).type, 'beforeunload', 'browser warns before reload with unsaved photos');
        await check("window.orderReloadMarker === true && document.querySelectorAll('#preview-holder .slot').length === 8", 'canceling reload retains the photo session');
      }
    }

    if (count === 3) {
      await check("JSON.stringify(window.frameDimensions(document.querySelector('#preview-holder'))) === JSON.stringify(window.demoDimensions['1440-film'])", 'homepage frame dimensions match three-photo preview');
    }
    await click('#btn-preview-fix');
    await checkPhotoLayout('#result-holder', count);
    if (count === 3) {
      await check("JSON.stringify(window.frameDimensions(document.querySelector('#result-holder'))) === JSON.stringify(window.demoDimensions['1440-film'])", 'homepage frame dimensions match three-photo result');
    }
    await checkExport(`${count}-photo layout`);
    if (count >= 4) {
      for (const width of [320, 390, 720, 1000, 1440]) {
        await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 720 });
        await checkPhotoLayout('#result-holder', count);
        await check('document.documentElement.scrollWidth <= innerWidth', `${count}-photo result fits ${width}px`);
        if (width === 390) await screenshot(`layout-${count}-390`);
      }
      await click('#scr-result .workflow [data-screen=scr-preview]');
      await click('#toggle-frame');
      await click('#btn-preview-fix');
      await evaluate(`window.exportLayoutSpec = { cols: ${count >= 6 ? 2 : 1}, rows: ${count >= 6 ? count / 2 : 4} }`);
      const png = await checkExport(`${count}-photo layout without frame`);
      assert.deepEqual(png.samples, [[210,47,39], [35,155,86], [40,116,166], [241,196,15], [165,105,189], [23,165,137], [230,126,34], [121,85,72]].slice(0, count), `${count}: PNG preserves every photo in intended order`);
      assert.ok(count === 4 ? png.height > png.width * 3 : png.height > png.width, `${count}: PNG orientation matches requested layout`);
      await evaluate('window.exportLayoutSpec = null');
    }
  }
  await click('#themepick2');
  await check("document.querySelector('#theme-modal #frame-favorites') === null && document.querySelector('#scr-result #favorite-name') === null", 'favorites stay out of theme picker and result panel');
  await click('#theme-grid [data-id=custom]');
  await click('#frame-favorites summary');
  await evaluate("localStorage.removeItem('snappie-favorites-v1'); document.querySelector('#favorite-name').value = 'Browser test'");
  await click('#favorite-save');
  await check("JSON.parse(localStorage.getItem('snappie-favorites-v1'))[0].name === 'Browser test' && !/photos|stickers|customText|customDate/.test(localStorage.getItem('snappie-favorites-v1'))", 'favorites persist settings without personal content');
  await click('#cf-done');
  await click('#themepick2');
  await click('#theme-grid [data-id=pastel]');
  await click('#themepick2');
  await click('#theme-grid [data-id=custom]');
  await click('#favorite-use');
  await check("!document.querySelector('#theme-modal').classList.contains('open')", 'applying favorite closes theme modal to show result');
  await check("(() => { const saved = JSON.parse(localStorage.getItem('snappie-favorites-v1'))[0].settings; return document.querySelector('#result-holder .frame-outer').classList.contains(saved.frame ? 'th-' + saved.theme : 'noframe'); })()", 'saved favorite restores theme and frame visibility');
  await click('#themepick2');
  await click('#theme-grid [data-id=custom]');
  await check("document.querySelector('#customframe-modal #frame-favorites') !== null && document.querySelectorAll('#favorite-name').length === 1", 'favorites live inside custom frame modal without duplicate IDs');
  for (const width of [320, 390, 1440]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 720 });
    await check("(() => { const panel = document.querySelector('#frame-favorites').getBoundingClientRect(); return panel.width > 0 && panel.left >= 0 && panel.right <= innerWidth && document.querySelector('#favorite-save').getBoundingClientRect().width >= 44 && document.documentElement.scrollWidth <= innerWidth; })()", `custom frame favorites fit ${width}px`);
  }
  await evaluate("document.querySelector('#favorite-name').value='Custom test'");
  await click('#favorite-save');
  await check("JSON.parse(localStorage.getItem('snappie-favorites-v1')).find(entry=>entry.name==='Custom test').settings.theme==='custom'", 'custom frame favorite saves current custom settings');
  await click('#favorite-delete');
  await evaluate("document.querySelector('#favorite-list').value='Browser test'");
  await click('#favorite-use');
  await check("!document.querySelector('#customframe-modal').classList.contains('open')", 'applying favorite closes custom frame modal');
  for (const [format, width, height] of [['story', 1080, 1920], ['post', 1080, 1350]]) {
    await evaluate(`document.querySelector('#output-format').value = '${format}'; document.querySelector('#output-format').dispatchEvent(new Event('change'))`);
    await check(`(() => { const holder = document.querySelector('#result-holder').getBoundingClientRect(); return Math.abs(holder.width / holder.height - ${width / height}) < .01; })()`, `${format}: preview matches output ratio`);
    const png = await checkExport(format);
    assert.deepEqual([png.width, png.height], [width, height], `${format}: exported PNG dimensions`);
    await check(`(() => { const frame = document.querySelector('#result-holder .frame-outer').getBoundingClientRect(), holder = document.querySelector('#result-holder').getBoundingClientRect(); return frame.left >= holder.left - 1 && frame.right <= holder.right + 1 && frame.top >= holder.top - 1 && frame.bottom <= holder.bottom + 1; })()`, `${format}: entire frame stays inside output`);
  }
  await evaluate("document.querySelector('#output-format').value = 'original'; document.querySelector('#output-format').dispatchEvent(new Event('change'))");
  await click('#btn-add-sticker');
  await evaluate(`(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 200; canvas.height = 100;
    const context = canvas.getContext('2d'); context.fillStyle = '#ff00ff'; context.fillRect(50, 25, 100, 50);
    const blob = await new Promise(resolve => canvas.toBlob(resolve));
    const transfer = new DataTransfer(); transfer.items.add(new File([blob], 'logo.png', { type: 'image/png' }));
    const input = document.querySelector('#sticker-file'); input.files = transfer.files;
    await input.onchange({ target: input });
  })()`);
  await waitFor("document.querySelector('.image-inner img')?.complete && document.querySelector('.image-inner img')?.naturalWidth > 0");
  await check(`(async () => { const image = document.querySelector('.image-inner img'); const canvas = document.createElement('canvas'); canvas.width = 200; canvas.height = 100; const context = canvas.getContext('2d'); context.drawImage(image, 0, 0); return context.getImageData(0, 0, 1, 1).data[3] === 0 && context.getImageData(100, 50, 1, 1).data[3] === 255; })()`, 'uploaded sticker preserves PNG transparency');
  await checkExport('uploaded image sticker');
  await check(`(async () => { const blob = [...window.downloadBlobs.values()].filter(blob => blob.type === 'image/png').at(-1); const image = await createImageBitmap(blob); const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height; const context = canvas.getContext('2d'); context.drawImage(image, 0, 0); const data = context.getImageData(0, 0, canvas.width, canvas.height).data; image.close(); for (let i = 0; i < data.length; i += 4) { if (data[i] === 255 && data[i + 1] === 0 && data[i + 2] === 255) return true; } return false; })()`, 'uploaded logo appears in exported PNG');
  await evaluate(`(() => {
    const original = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function() {
      const blob = window.downloadBlobs.get(this.href);
      if (blob?.type !== 'image/gif') return original.call(this);
      window.gifDownload = (async () => {
        const data = await blob.arrayBuffer();
        const decoder = new ImageDecoder({ data, type: 'image/gif' });
        await decoder.tracks.ready;
        const count = decoder.tracks.selectedTrack.frameCount;
        const samples = [], durations = []; let width, height;
        for (let index = 0; index < count; index++) {
          const { image } = await decoder.decode({ frameIndex: index });
          width = image.displayWidth; height = image.displayHeight; durations.push(image.duration);
          const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
          const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
          samples.push([...context.getImageData(width / 2, height / 2, 1, 1).data].slice(0, 3));
          image.close();
        }
        decoder.close(); return { count, width, height, samples, durations, header: new TextDecoder().decode(data.slice(0, 6)) };
      })();
    };
  })()`);
  await evaluate("document.querySelector('#btn-gif').onclick()");
  const gif = await evaluate('window.gifDownload');
  assert.equal(gif.count, 8, 'GIF contains all eight photos');
  assert.equal(gif.header, 'GIF89a');
  assert.ok(gif.durations.every(value => value === 800000), 'GIF keeps 0.8-second frame timing');
  assert.ok(Math.max(gif.width, gif.height) <= 720, 'GIF stays within 720 px');
  const expectedColors = [[210,47,39], [35,155,86], [40,116,166], [241,196,15], [165,105,189], [23,165,137], [230,126,34], [121,85,72]];
  gif.samples.forEach((color, i) => color.forEach((channel, j) => assert.ok(Math.abs(channel - expectedColors[i][j]) <= 12, `GIF frame ${i} photo order`)));
  console.log('PASS GIF decodes all eight photos in order');
  await evaluate("document.querySelector('#output-format').value = 'story'; document.querySelector('#output-format').dispatchEvent(new Event('change')); document.querySelector('#btn-gif').onclick()");
  const storyGif = await evaluate('window.gifDownload');
  assert.deepEqual([storyGif.width, storyGif.height, storyGif.count], [405, 720, 8], 'GIF respects selected Story format');
  console.log('PASS GIF Story format is 405 × 720 with eight frames');
  await check("window.dispatchEvent(new Event('beforeunload', { cancelable: true }))", 'GIF download clears exit warning');
  await click('#themepick2');
  await click('#theme-grid [data-id=custom]');
  await click('#favorite-delete');
  await check("JSON.parse(localStorage.getItem('snappie-favorites-v1')).length === 0 && document.querySelector('#favorite-use').disabled", 'favorite deletion updates storage and controls');
  await click('#cf-done');
  await click('#scr-result .workflow [data-screen=scr-cam]');
  await waitFor("[...document.querySelectorAll('.filter-sample')].every(el => el.style.backgroundImage.startsWith('url(\"blob:'))");
  await check("document.querySelector('.filter-sample').style.backgroundImage.includes('blob:')", 'filter thumbnails use user photo locally');
  await click('#scr-cam .workflow [data-screen=scr-preview]');
  await check("document.querySelector('#scr-preview').classList.contains('active')", 'workflow returns from camera to photo review');
  await check('document.documentElement.scrollWidth <= innerWidth', 'result editor has no horizontal overflow');
  await click('#btn-preview-fix');
  await click('#themepick2');
  await click('#theme-grid [data-id=custom]');
  await evaluate("document.querySelector('#favorite-name').value = 'Reload test'; document.querySelector('#favorite-save').click()");
  await evaluate('window.beforeVerificationReload = true');
  await send('Page.reload');
  await waitFor("!window.beforeVerificationReload && document.querySelector('#btn-start')?.onclick != null && document.querySelector('#favorite-list')?.value === 'Reload test'");
  await check("document.querySelector('#favorite-list').value === 'Reload test' && document.querySelector('#scr-start').classList.contains('active') && document.querySelectorAll('#preview-holder .slot').length === 0", 'favorites survive reload without restoring private photos');
  await evaluate("document.querySelector('#favorite-delete').click()");
  siteConfigBody = JSON.stringify({ seasons: { natal: { mode: 'on' }, halloween: { mode: 'off' } }, support: { enabled: false, trakteerUrl: '', kofiUrl: '' } });
  await evaluate('window.beforeConfigReload = true');
  await send('Page.reload');
  await waitFor("!window.beforeConfigReload && document.querySelector('#btn-start')?.onclick != null");
  await evaluate("document.querySelector('#btn-add-sticker').click()");
  await waitFor("document.querySelectorAll('#sticker-season-panel .season-group').length === 9");
  await check("document.querySelector('#sticker-season-panel .season-group h3').textContent.includes('Natal') && !!document.querySelector('#sticker-season-panel .season-now') && ![...document.querySelectorAll('#sticker-season-panel h3')].some(heading => heading.textContent.includes('Halloween'))", 'CMS season settings reorder and hide sticker groups');
  await click('#btn-close-sticker');
  assert.ok(nativeDialogs.every(dialog => ['confirm', 'beforeunload'].includes(dialog.type)), 'no unexpected alert dialogs');
  assert.deepEqual(exceptions, [], 'no uncaught browser exceptions');
  console.log('PASS no uncaught browser exceptions');
} finally {
  socket.close();
  await fetch(`${endpoint}/json/close/${target.id}`);
}
