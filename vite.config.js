import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// base './' so the built files also work when opened directly (file://)
// or served from any sub-path.
// viteSingleFile() inlines JS+CSS into dist/index.html → one portable file.
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
});
