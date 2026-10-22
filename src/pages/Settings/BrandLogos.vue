<template>
  <main class="content">
    <div class="page-head">
      <div>
        <h1>Brand logos</h1>
        <div class="sub">Director only. The logo shown in the sidebar and printed on statements, invoices and receipts.</div>
      </div>
    </div>

    <div class="notice error" v-show="error">{{ error }}</div>
    <div class="notice ok" v-show="okMsg">{{ okMsg }}</div>
    <div class="loading-bar" v-show="loading" style="margin-bottom:12px"></div>

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
            <template v-if="canEdit"><label class="btn" :for="'up-' + slot.key">Upload new</label>
            <input type="file" :id="'up-' + slot.key" accept=".png,.svg,image/png,image/svg+xml" hidden @change="pick(slot.key, $event)">
            <span class="help">PNG or SVG, at least 400 px wide. Resized to 512 px.</span></template>
            <span class="chip" v-if="!canEdit">View only</span>
          </div>
          <template v-if="draft[slot.key]">
            <div>
              <div class="pending">{{ 'Not saved yet: ' + draft[slot.key].name }}</div>
              <div class="logo-acts" style="margin-top:8px">
                <button class="btn btn-primary btn-sm" :disabled="busy" @click="save(slot.key)">{{ busy ? 'Saving…' : 'Save logo' }}</button>
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

    <div class="callout">A new logo only appears on PDFs made after you save it. Completed statements, invoices and receipts keep the logo they were made with. PDFs always use Widebed company colours, whatever theme staff pick. Logos are resized in your browser to at most 512 px and saved with the PMS (each up to 200 KB).</div>

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
// Each logo is one small document, brandLogos/{light|dark}: the picture as a data URL (resized in the browser to
// at most 512 px and 200 KB, since file storage needs the paid plan), its file name and a short version list.
// Director edits; everyone signed in reads (the app may show the logo).
import { doc, getDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase.js';
import { audit, friendlyError } from '@/lib/finance-data.js';
import { toast } from '@/lib/toast.js';
import { useSession } from '@/stores/session.js';

const me = useSession();

// The built-in wordmark counts as version 1 until a logo is saved.
const START = slot => ({ src: null, name: null, versions: [{ n: 1, file: slot === 'dark' ? 'widebed_logo_dark.svg' : 'widebed_logo.svg', by: 'Director', on: '2 Jan 2026' }], n: 1 });
const MAX_IN = 5 * 1024 * 1024, MAX_OUT = 200 * 1024, SIDE = 512;
const today = () => new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const bytesOf = url => Math.ceil((url.length - url.indexOf(',') - 1) * 3 / 4);

// Draws the picture at most 512 px on its longest side and returns the smaller of WebP and PNG (both keep transparency).
function shrink(img) {
  const w0 = img.naturalWidth || SIDE, h0 = img.naturalHeight || Math.round(SIDE / 3);
  const k = Math.min(1, SIDE / Math.max(w0, h0));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w0 * k)); c.height = Math.max(1, Math.round(h0 * k));
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const webp = c.toDataURL('image/webp', 0.9), png = c.toDataURL('image/png');
  return webp.startsWith('data:image/webp') && webp.length < png.length ? webp : png;
}

export default {
  data() {
    return {
      slots: [{ key: 'light', title: 'Logo on light background', use: 'used on PDFs and light theme' },
              { key: 'dark', title: 'Logo on dark background', use: 'used in dark mode' }],
      saved: { light: START('light'), dark: START('dark') },
      draft: { light: null, dark: null },
      canEdit: me.role === 'director', loading: true, busy: false, error: '', okMsg: ''
    };
  },
  async mounted() {
    try {
      const snaps = await Promise.all(this.slots.map(sl => getDoc(doc(db, 'brandLogos', sl.key))));
      snaps.forEach((d, i) => { if (d.exists()) this.saved[this.slots[i].key] = { ...START(this.slots[i].key), ...d.data() }; });
    } catch (e) { this.error = friendlyError(e, 'load the logos'); }
    this.loading = false;
  },
  computed: {
    versions() {
      return ['light', 'dark'].flatMap(slot => this.saved[slot].versions.map(v => ({ ...v, slot, inUse: v.n === this.saved[slot].n })))
        .sort((a, b) => b.n - a.n || a.slot.localeCompare(b.slot));
    }
  },
  methods: {
    shownSrc(k) { return this.draft[k]?.src || this.saved[k]?.src || null; },
    fileLine(slot) {
      const cur = this.saved[slot.key].versions.find(v => v.n === this.saved[slot.key].n);
      return `${cur ? cur.file : 'widebed_logo.svg'} · ${slot.use}`;
    },
    pick(k, e) {
      this.error = ''; this.okMsg = '';
      const f = e.target.files[0]; e.target.value = '';
      if (!f) return;
      if (!/\.(png|svg)$/i.test(f.name)) return this.error = 'Choose a PNG or SVG file.';
      if (f.size > MAX_IN) return this.error = 'That file is over 5 MB. Export a smaller PNG or use SVG.';
      const r = new FileReader();
      r.onload = () => {
        const img = new Image();
        img.onload = () => {
          const isPng = f.name.toLowerCase().endsWith('.png');
          if (isPng && img.naturalWidth < 400) return this.error = `This PNG is ${img.naturalWidth} px wide. Use one at least 400 px wide so PDFs stay sharp.`;
          let src;
          try { src = shrink(img); } catch { return this.error = 'This picture could not be read. Try exporting it again as PNG.'; }
          const kb = Math.round(bytesOf(src) / 1024);
          if (kb > MAX_OUT / 1024) return this.error = `Even at 512 px this logo is ${kb} KB; the limit is 200 KB. Use a simpler picture or fewer colours.`;
          this.draft[k] = { name: f.name, src };
        };
        img.onerror = () => { this.error = 'This picture could not be read. Try exporting it again as PNG.'; };
        img.src = r.result;
      };
      r.readAsDataURL(f);
    },
    async save(k) {
      const d = this.draft[k]; if (!d || this.busy) return;
      const cur = this.saved[k];
      const n = Math.max(0, ...cur.versions.map(v => v.n)) + 1;
      // Keep the last 20 versions (names only; the picture is kept just for the logo in use).
      const versions = [...cur.versions, { n, file: d.name, by: me.name, on: today() }].slice(-20);
      this.busy = true; this.error = ''; this.okMsg = '';
      try {
        const batch = writeBatch(db);
        batch.set(doc(db, 'brandLogos', k), { src: d.src, name: d.name, n, versions, updatedAt: serverTimestamp(), updatedBy: me.name, updatedByUid: me.user.uid });
        audit(batch, me, { action: 'brandLogo.update', entity: `brandLogos/${k}`, changes: [{ field: 'file', old: cur.name || null, new: d.name }] });
        await batch.commit();
        this.saved[k] = { ...cur, src: d.src, name: d.name, n, versions };
        this.draft[k] = null;
        this.okMsg = `Saved. New PDFs will use ${d.name}.`;
        toast('Logo saved');
      } catch (e) { this.error = friendlyError(e, 'save the logo'); }
      this.busy = false;
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
