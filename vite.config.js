import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// npm run build: vite deja dist-single/index.html con JS y CSS en línea; tools/build_single.py
// genera dist/ (index.html + data/*.js) que funciona con doble clic, sin servidor.
export default defineConfig(({ mode }) => ({
  base: './',
  server: { port: 5173 },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    copyPublicDir: mode !== 'single',
    assetsInlineLimit: mode === 'single' ? 100000000 : 4096,
  },
  plugins: mode === 'single' ? [viteSingleFile()] : [],
}));
