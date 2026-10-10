import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// base './' so the built files also work when opened directly (file://)
// or served from any sub-path.
// viteSingleFile() inlines JS+CSS into dist/index.html → one portable file.
export default defineConfig({
  base: './',
  server: {
    proxy: { '/api': 'http://127.0.0.1:3001' },
  },
  build: {
    // Inline semua aset (gambar/JS/CSS) KECUALI font dan foto, supaya
    // dist/index.html tetap ringan. Butuh useRecommendedBuildConfig:false
    // supaya pengaturan ini tidak ditimpa plugin.
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
  plugins: [viteSingleFile({ useRecommendedBuildConfig: false, inlinePattern: ['index-*.js', 'index-*.css'] })],
});
