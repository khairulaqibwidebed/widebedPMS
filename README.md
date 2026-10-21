# Widebed PMS (Vue 3)

The web app for the Widebed Property Management System. It replaces the Alpine.js prototype in `Build\web`
(kept as it is, for reference).

## What it is made of
- **Vue 3** for the pages, **Vue Router** for page addresses, **Pinia** for who is signed in.
- **Vite** builds the site (turns the `.vue` files into plain HTML/JS/CSS in `dist`).
- **Firebase** (Firestore + Authentication) from npm, same project and rules as before.
- **xlsx-js-style** for reading and writing Excel files.

## Folders
```
src/
  main.js            starts the app
  router.js          every page address, who may open it, sidebar label
  nav.js             sidebar items per role
  firebase-config.js Firebase web config (not secret)
  app.css            shared styles (Figma theme, light/dark)
  directives.js      v-esc and v-click-outside
  stores/session.js  signed-in user and role
  lib/               engine.js (payout maths), finance-data.js, finance-import.js, reports.js, format.js, ...
  components/        AppShell (sidebar + top bar), CommandPalette (Ctrl K)
  pages/<Group>/     one .vue file per page, folders follow the sidebar groups
public/.htaccess     lets Hostinger open any page address directly
tools/               alpine2vue.py (used once for the move from Alpine)
```

## Run it on your PC
```
npm install        (first time, and after package.json changes)
npm run dev        then open http://localhost:5173
```
The page refreshes by itself when you save a file.

## Build for the web
```
npm run build      makes the dist folder
npm run preview    shows the built dist on http://localhost:4173
```
Only the `dist` folder goes on Hostinger, never `src` or `node_modules`.

## Deploying to Hostinger
`.github/workflows/deploy.yml` builds the site on GitHub on every push to `main` and puts `dist` on a branch called `deploy`.
In Hostinger hPanel > Git, point the deployment at the **deploy** branch (not main), folder `public_html`.
Also add the website's domain in Firebase console > Authentication > Settings > Authorized domains.

## Page addresses
Same as the prototype without `.html`, e.g. `/Finance/upload`, `/Portfolio/properties`, `/Settings/staff`.
Dashboard is `/Dashboard`, Reports is `/Reports`. Old `.html` addresses still redirect.

## Never commit
`serviceAccount.json` (in `Build\tools`, PC only). `node_modules` and `dist` are ignored by `.gitignore`.
