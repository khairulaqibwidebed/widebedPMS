import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Local Drive uploads: runs api/drive.js inside `npm run dev` the way Vercel runs it on the live site.
// Put the same variables Vercel has (GOOGLE_OAUTH_*, DRIVE_ROOT_FOLDER_ID, FIREBASE_API_KEY ...) in vercel-drive.env.local
// next to package.json. That file is never committed (*.local is ignored).
function localDriveApi() {
  return {
    name: 'local-drive-api',
    apply: 'serve',
    configureServer(server) {
      const file = resolve(process.cwd(), 'vercel-drive.env.local');
      if (existsSync(file)) {
        for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
          const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
          if (m && !line.trim().startsWith('#')) process.env[m[1]] = m[2].replace(/^(['"])([\s\S]*)\1$/, '$2');
        }
        // Names and lengths only, never the values, so it is safe to paste into a chat
        const keys = ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_OAUTH_REFRESH_TOKEN', 'GOOGLE_SERVICE_ACCOUNT_JSON', 'DRIVE_ROOT_FOLDER_ID', 'FIREBASE_API_KEY'];
        console.log('[drive] ' + keys.map(k => `${k}: ${process.env[k] ? process.env[k].length + ' chars' : 'MISSING'}`).join(' | '));
      } else console.warn('[drive] vercel-drive.env.local not found next to package.json: uploads will say the Drive settings are missing.');
      server.middlewares.use('/api/drive', (req, res) => {
        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end', async () => {
          try {
            req.body = Buffer.concat(chunks).toString('utf8');
            res.status = code => { res.statusCode = code; return res; };
            res.json = obj => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); return res; };
            res.send = data => { res.end(Buffer.isBuffer(data) ? data : typeof data === 'string' ? data : Buffer.from(data)); return res; };
            const mod = await server.ssrLoadModule('/api/drive.js');   // reloaded when the file changes
            await mod.default(req, res);
          } catch (e) { res.statusCode = 500; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: e.message || 'Local drive function failed.' })); }
        });
      });
    }
  };
}

// WB_STUB=1 swaps Firebase for the in-browser test stubs (automated checks only).
const stub = process.env.WB_STUB;
const alias = [{ find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) }];
if (stub) alias.unshift(
  { find: 'firebase/app', replacement: stub + '/stub-app.js' }, { find: 'firebase/auth', replacement: stub + '/stub-auth.js' },
  { find: 'firebase/firestore', replacement: stub + '/stub-fs3.js' }, { find: /^(\.\.|@)\/firebase-config\.js$/, replacement: stub + '/cfg.js' });

export default defineConfig({
  // Keep spaces between inline elements, the way plain HTML (and the old prototype) does.
  plugins: [vue({ template: { compilerOptions: { whitespace: 'preserve' } } }), localDriveApi()],
  resolve: { alias },
  // Firebase (main file) and the Excel reader (loaded only when needed) are big on their own; that's expected.
  build: { chunkSizeWarningLimit: 1000 },
  server: { port: 5173 }
});
