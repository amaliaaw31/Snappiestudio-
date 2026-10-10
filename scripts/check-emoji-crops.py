"""Browser regression for atlas bleed. Requires Python Playwright + Chromium.
Run: python3 scripts/check-emoji-crops.py [emoji ...]
"""
import base64, json, pathlib, sys, threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        if path.startswith('/emoji/'):
            self.directory = str(ROOT / 'public')
        else:
            self.directory = str(ROOT)
        return super().translate_path(path)
    def log_message(self, *args): pass
server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 240, 'height': 240})
    page.goto(f'http://127.0.0.1:{server.server_port}/')
    values = sys.argv[1:] or page.evaluate("async () => (await import('/src/emoji-catalog.js')).EMOJI_CATALOG.map(entry => entry.value)")
    failures = []
    for value in values:
        bounds = page.evaluate("""async value => {
          const module = await import('/src/emoji.js');
          const entry = module.emojiArtwork(value), rect = module.emojiSourceRect(entry);
          const image = new Image(); image.src = module.emojiStickerUrl(value); await image.decode();
          document.body.innerHTML = '<div id="probe" style="width:200px;height:200px;background:white">' +
            module.emojiArtMarkup(value) + '</div>';
          const svg = document.querySelector('svg'); svg.style.cssText = 'width:200px;height:200px;overflow:hidden;display:block';
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const fit = Math.min(200/rect.width, 200/rect.height);
          return { left: (200-rect.width*fit)/2, top: (200-rect.height*fit)/2 };
        }""", value)
        screenshot = page.locator('#probe').screenshot()
        count = page.evaluate("""async ({base64, bounds}) => {
          const image = new Image(); image.src = 'data:image/png;base64,' + base64; await image.decode();
          const canvas = document.createElement('canvas'); canvas.width=200; canvas.height=200;
          const context = canvas.getContext('2d'); context.drawImage(image,0,0);
          const pixels=context.getImageData(0,0,200,200).data;
          let foreign=0;
          for(let y=0;y<200;y++) for(let x=0;x<200;x++) {
            if(x >= Math.floor(bounds.left)-1 && x < Math.ceil(200-bounds.left)+1 &&
               y >= Math.floor(bounds.top)-1 && y < Math.ceil(200-bounds.top)+1) continue;
            const index=(y*200+x)*4;
            if(Math.min(pixels[index],pixels[index+1],pixels[index+2]) < 225) foreign++;
          }
          return foreign;
        }""", {'base64': base64.b64encode(screenshot).decode(), 'bounds': bounds})
        if count:
            print(json.dumps({'emoji': value, 'foreignPixelsOutsideCrop': count}), flush=True)
            failures.append(value)
    browser.close()
server.shutdown()
assert not failures, 'Neighboring artwork leaked outside crop: ' + ', '.join(failures)
print(f'PASS: {len(values)} emoji render without neighboring pixels in their SVG padding.')
