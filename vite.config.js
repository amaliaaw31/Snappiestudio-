import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// base './' so the built files also work when opened directly (file://)
// or served from any sub-path.
// viteSingleFile() inlines JS+CSS into dist/index.html → one portable file.
export default defineConfig({
  base: './',
  build: {
    // Inline semua aset (gambar/JS/CSS) KECUALI font → font jadi file terpisah
    // agar dist/index.html tetap ringan. Butuh useRecommendedBuildConfig:false
    // supaya pengaturan ini tidak ditimpa plugin.
    assetsInlineLimit: (file) => !/\.(ttf|otf|woff2?|eot)$/i.test(file),
    chunkSizeWarningLimit: 100000000,
    cssCodeSplit: false,
    assetsDir: '',
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
  plugins: [viteSingleFile({ useRecommendedBuildConfig: false })],
});
