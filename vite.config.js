import { defineConfig } from 'vite';
import { createHash } from 'node:crypto';

// Inline only the entry module; avoid glob-parsing dependencies in the build.
function inlineEntryWithCsp() {
  return {
    name: 'snappie-inline-entry-and-csp', enforce: 'post',
    generateBundle(_options, bundle) {
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
      const hashes = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
        .map(([, code]) => "'sha256-" + createHash('sha256').update(code).digest('base64') + "'");
      const policy = [
        "default-src 'self'", "script-src 'self' " + hashes.join(' '),
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com", "img-src 'self' data: blob:",
        "media-src 'self' blob:", "connect-src 'self'", "worker-src 'self' blob:",
        "object-src 'none'", "base-uri 'self'", "form-action 'self'",
      ].join('; ');
      page.source = html.replace('<head>', '<head>\n<meta http-equiv="Content-Security-Policy" content="' + policy + '">');
    },
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
