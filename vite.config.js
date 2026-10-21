import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';

// WB_STUB=1 swaps Firebase for the in-browser test stubs (automated checks only).
const stub = process.env.WB_STUB;
const alias = [{ find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) }];
if (stub) alias.unshift(
  { find: 'firebase/app', replacement: stub + '/stub-app.js' }, { find: 'firebase/auth', replacement: stub + '/stub-auth.js' },
  { find: 'firebase/firestore', replacement: stub + '/stub-fs3.js' }, { find: /^(\.\.|@)\/firebase-config\.js$/, replacement: stub + '/cfg.js' });

export default defineConfig({
  // Keep spaces between inline elements, the way plain HTML (and the old prototype) does.
  plugins: [vue({ template: { compilerOptions: { whitespace: 'preserve' } } })],
  resolve: { alias },
  // Firebase (main file) and the Excel reader (loaded only when needed) are big on their own; that's expected.
  build: { chunkSizeWarningLimit: 1000 },
  server: { port: 5173 }
});
