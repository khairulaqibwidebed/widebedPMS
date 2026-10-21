<template>
  <main class="content">
    <div class="page-head">
      <div>
        <h1>Brand logos <span class="sample-tag">Saved in this browser for now</span></h1>
        <div class="sub">Director only. The logo shown in the sidebar and printed on statements, invoices and receipts.</div>
      </div>
    </div>

    <div class="notice error" v-show="error">{{ error }}</div>
    <div class="notice ok" v-show="okMsg">{{ okMsg }}</div>

    <div class="logo-grid">
      <template v-for="slot in slots" :key="slot.key">
        <section class="card">
          <div class="card-head"><h2>{{ slot.title }}</h2></div>
          <div class="logo-box" :class="slot.key">
            <template v-if="shownSrc(slot.key)"><img :src="shownSrc(slot.key)" :alt="slot.title"></template>
            <template v-if="!shownSrc(slot.key)"><span class="wordmark">WIDEBED</span></template>
          </div>
          <div class="logo-file">{{ fileLine(slot) }}</div>
          <div class="logo-acts">
            <label class="btn" :for="'up-' + slot.key">Upload new</label>
            <input type="file" :id="'up-' + slot.key" accept=".png,.svg,image/png,image/svg+xml" hidden @change="pick(slot.key, $event)">
            <span class="help">PNG or SVG, at least 400 px wide</span>
          </div>
          <template v-if="draft[slot.key]">
            <div>
              <div class="pending">{{ 'Not saved yet: ' + draft[slot.key].name }}</div>
              <div class="logo-acts" style="margin-top:8px">
                <button class="btn btn-primary btn-sm" @click="save(slot.key)">Save logo</button>
                <button class="btn btn-sm" @click="draft[slot.key] = null">Discard</button>
              </div>
            </div>
          </template>
        </section>
      </template>
    </div>

    <section class="card">
      <div class="card-head"><h2>How it looks on a statement PDF</h2></div>
      <div class="pdf-head">
        <template v-if="shownSrc('light')"><img :src="shownSrc('light')" alt="Logo on the statement"></template>
        <template v-if="!shownSrc('light')"><span class="wordmark">WIDEBED</span></template>
        <b>MONTHLY STATEMENT · DM 07-19 · September 2026</b>
        <span class="pg">Page 1 of 2</span>
      </div>
    </section>

    <div class="callout">A new logo only appears on PDFs made after you save it. Completed statements, invoices and receipts keep the logo they were made with. PDFs always use Widebed company colours, whatever theme staff pick. When the Drive link is set up, logo files are kept in the company Google Drive and the PMS stores only the link.</div>

    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>Version</th><th>Background</th><th>File</th><th>Uploaded by</th><th>Uploaded on</th><th>Status</th></tr></thead>
        <tbody>
          <template v-for="v in versions" :key="v.n + v.slot">
            <tr>
              <td>{{ v.n }}</td>
              <td>{{ v.slot === 'dark' ? 'Dark' : 'Light' }}</td>
              <td>{{ v.file }}</td>
              <td>{{ v.by }}</td>
              <td>{{ v.on }}</td>
              <td><span class="pill" :class="v.inUse ? 'green' : 'grey'">{{ v.inUse ? 'In use' : 'Replaced' }}</span></td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </main>
</template>

<script>
import { toast } from '@/lib/toast.js';
import { useSession } from '@/stores/session.js';

const me = useSession();

// No storage collection yet: the chosen logos live in this browser only (localStorage).
// Later: the file goes to the company Google Drive, the PMS keeps the link + version list in Firestore.
const KEY = 'wb.logos';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } };
const START = {
  light: null, dark: null,
  versions: [
    { n: 1, slot: 'light', file: 'widebed_logo.svg', by: 'Director', on: '2 Jan 2026', inUse: true },
    { n: 1, slot: 'dark', file: 'widebed_logo_dark.svg', by: 'Director', on: '2 Jan 2026', inUse: true }
  ]
};
const MAX = 1024 * 1024;

export default {
  data() {
    return {
      slots: [{ key: 'light', title: 'Logo on light background', use: 'used on PDFs and light theme' },
              { key: 'dark', title: 'Logo on dark background', use: 'used in dark mode' }],
      saved: read() || structuredClone(START),
      draft: { light: null, dark: null },
      error: '', okMsg: ''
    };
  },
  computed: {
    versions() { return [...this.saved.versions].sort((a, b) => b.n - a.n || a.slot.localeCompare(b.slot)); }
  },
  methods: {
    shownSrc(k) { return this.draft[k]?.src || this.saved[k]?.src || null; },
    fileLine(slot) {
      const cur = this.saved.versions.find(v => v.slot === slot.key && v.inUse);
      return `${cur ? cur.file : 'widebed_logo.svg'} · ${slot.use}`;
    },
    pick(k, e) {
      this.error = ''; this.okMsg = '';
      const f = e.target.files[0]; e.target.value = '';
      if (!f) return;
      if (!/\.(png|svg)$/i.test(f.name)) return this.error = 'Choose a PNG or SVG file.';
      if (f.size > MAX) return this.error = 'That file is over 1 MB. Export a smaller PNG or use SVG.';
      const r = new FileReader();
      r.onload = () => {
        const src = r.result;
        if (f.name.toLowerCase().endsWith('.png')) {
          const img = new Image();
          img.onload = () => {
            if (img.naturalWidth < 400) this.error = `This PNG is ${img.naturalWidth} px wide. Use one at least 400 px wide so PDFs stay sharp.`;
            else this.draft[k] = { name: f.name, src };
          };
          img.src = src;
        } else this.draft[k] = { name: f.name, src };
      };
      r.readAsDataURL(f);
    },
    save(k) {
      const d = this.draft[k]; if (!d) return;
      const n = Math.max(0, ...this.saved.versions.filter(v => v.slot === k).map(v => v.n)) + 1;
      this.saved.versions.forEach(v => { if (v.slot === k) v.inUse = false; });
      this.saved.versions.push({ n, slot: k, file: d.name, by: me.name, on: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }), inUse: true });
      this.saved[k] = { src: d.src, name: d.name };
      try { localStorage.setItem(KEY, JSON.stringify(this.saved)); }
      catch { this.error = 'This browser could not keep the file (storage full). It shows until you leave the page.'; }
      this.draft[k] = null;
      this.okMsg = `Saved. New PDFs will use ${d.name}.`;
      toast('Logo saved');
    }
  }
};
</script>

<style scoped>
    .logo-grid { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 20px; margin-bottom: 20px; }
    .logo-box { height: 120px; border: 1px solid var(--border); border-radius: 10px; display: grid; place-items: center; padding: 16px; overflow: hidden; }
    /* The previews show the logo as it prints, so they keep Widebed's own colours whatever theme is picked. */
    .logo-box.light { background: #FFFFFF; }
    .logo-box.dark { background: #18212B; border-color: #18212B; }
    .logo-box img { max-height: 72px; max-width: 100%; object-fit: contain; }
    .wordmark { font-weight: 700; letter-spacing: .14em; font-size: 24px; color: #F26D4D; }
    .logo-file { color: var(--muted); font-size: 12px; margin: 10px 0 12px; overflow-wrap: anywhere; }
    .logo-acts { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .logo-acts .help { margin: 0; }
    .pending { margin-top: 10px; font-size: 12px; color: var(--amber); }
    .pdf-head { display: flex; align-items: center; gap: 20px; border: 1px solid var(--border); border-radius: 8px; padding: 14px 18px; background: #FFFFFF; color: #1A1D23; flex-wrap: wrap; }
    .pdf-head img { max-height: 30px; max-width: 160px; }
    .pdf-head .wordmark { font-size: 17px; }
    .pdf-head b { font-size: 12px; }
    .pdf-head .pg { margin-left: auto; color: #7A8190; font-size: 11px; }
    .callout { margin: 20px 0; }
    @media (max-width: 760px) { .logo-grid { grid-template-columns: minmax(0,1fr); } }
</style>
