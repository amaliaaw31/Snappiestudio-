import { defineConfig } from 'vite';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// Inline only the entry module; avoid glob-parsing dependencies in the build.
export function inlineEntryWithCsp() {
  return {
    name: 'snappie-inline-entry-and-csp', enforce: 'post',
    generateBundle: { order: 'post', handler(_options, bundle) {
      const page = bundle['index.html'];
      if (!page) throw new Error('Missing index.html');
      let html = String(page.source);
      for (const [name, chunk] of Object.entries(bundle)) {
        if (chunk.type !== 'chunk' || !chunk.isEntry) continue;
        const tag = `<script type="module" crossorigin src="./${name}"></script>`;
        if (!html.includes(tag)) throw new Error('Entry script was not found in HTML');
        const code = chunk.code.replace(/<(\/script>|!--)/gi, '\\x3C$1').trim();
        html = html.replace(tag, () => `<script type="module" crossorigin>${code}</script>`);
        delete bundle[name];
      }
      html = html.replace('</head>', '<link rel="stylesheet" href="./site-notice.css"><script type="module" src="./site-notice.js"></script></head>');
      const hashes = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
        .map(([, code]) => "'sha256-" + createHash('sha256').update(code).digest('base64') + "'");
      const policy = [
        "default-src 'self'", "script-src 'self' " + hashes.join(' '),
        "script-src-attr 'none'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com", "img-src 'self' data: blob:",
        "media-src 'self' blob:", "connect-src 'self'", "worker-src 'self' blob:",
        "object-src 'none'", "base-uri 'self'", "form-action 'self'",
      ].join('; ');
      page.source = html.replace('<head>', '<head>\n<meta http-equiv="Content-Security-Policy" content="' + policy + '">');
      this.emitFile({ type: 'asset', fileName: 'snappie-app-csp.caddy',
        source: `header Content-Security-Policy "${policy}; frame-ancestors 'none'"\n` });
      const brandFonts = [['The Magic Cookie', 'the-magic-cookie-'], ['Orange Lovely', 'orange-lovely-']];
      const brandCss = brandFonts.map(([family, prefix]) => {
        const file = Object.keys(bundle).find(name => name.startsWith(prefix) && /\.(ttf|otf)$/.test(name));
        if (!file) throw new Error(`Missing shared brand font: ${family}`);
        return `@font-face { font-family: '${family}'; src: url('/${file}'); font-weight: 400; font-style: normal; font-display: swap; }`;
      }).join('\n');
      this.emitFile({ type: 'asset', fileName: 'cms-brand.css', source: brandCss });
      // Service worker: aset inti disimpan saat pemasangan agar aplikasi terbuka tanpa internet.
      const core = /^(style-.*\.css|start-lines-.*\.png|sample-group-.*\.jpe?g|gif-export-.*\.js|(the-magic-cookie|orange-lovely|matcha-iced)-.*\.(ttf|otf))$/;
      const precache = ['./', './manifest.webmanifest', './icons/icon-192.png', './icons/apple-touch-icon.png', './site-notice.css', './site-notice.js',
        ...Object.keys(bundle).filter(name => core.test(name)).map(name => './' + name)].sort();
      const build = createHash('sha256').update(html).update(JSON.stringify(precache)).digest('hex').slice(0, 12);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: readFileSync(new URL('./src/sw.template.js', import.meta.url), 'utf8')
        .replace('__BUILD__', build).replace('__PRECACHE__', JSON.stringify(precache)) });
    } },
  };
}

// base './' so the built files also work when opened directly (file://)
// or served from any sub-path.
// The entry module stays inline; fonts, CSS, images and HEIC remain separate assets.
export default defineConfig({
  base: './',
  server: {
    proxy: { '/api': 'http://127.0.0.1:3001' },
  },
  build: {
    // Inline semua aset (gambar/JS/CSS) KECUALI font dan foto, supaya
    // dist/index.html tetap ringan. Butuh useRecommendedBuildConfig:false
    // agar ukuran index.html tetap kecil.
    assetsInlineLimit: (file) => !/\.(ttf|otf|woff2?|eot|jpe?g|png)$/i.test(file),
    chunkSizeWarningLimit: 100000000,
    cssCodeSplit: false,
    assetsDir: '',
    rollupOptions: {
      // heic2any dimuat lewat import() dan tidak dipakai sebagian besar
      // pengguna, jadi biarkan chunk-nya terpisah agar tidak ikut di index.html.
      output: { inlineDynamicImports: false },
    },
  },
  // Hanya entry (index-*) yang di-inline; chunk heic2any tetap file terpisah.
  plugins: [inlineEntryWithCsp()],
});
