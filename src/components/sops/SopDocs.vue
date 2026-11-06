<template>
  <section class="card">
    <div class="card-head"><h2>Documents</h2><span class="chip">{{ `${docs.length} file${docs.length === 1 ? '' : 's'}` }}</span></div>
    <div class="doc-list">
      <div class="doc-row" v-for="(d, i) in docs" :key="d.name + i">
        <span class="doc-badge">{{ ext(d.name) }}</span>
        <div class="doc-name"><b>{{ d.name }}</b><small>{{ `Added by ${d.by} · ${d.on}` }}</small></div>
        <div class="act" @keydown.esc="menu = -1">
          <button class="ico-btn" type="button" title="Actions" aria-label="Actions" :aria-expanded="menu === i" @click.stop="menu = menu === i ? -1 : i"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg></button>
          <div class="act-menu" v-if="menu === i" @click.stop>
            <button type="button" v-if="d.fileId" @click="menu = -1; $refs.viewer.open({ name: d.name, id: d.fileId, url: d.url, kind: 'sops' })"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>View</button>
            <button type="button" @click="menu = -1; download(d)"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 20h16"/></svg>Download</button>
            <button type="button" class="danger" v-show="canEdit" :disabled="busy" @click="menu = -1; $emit('remove', i)"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>Remove</button>
          </div>
        </div>
      </div>
      <div class="empty" v-show="!docs.length">No documents yet.</div>
    </div>
    <template v-if="canEdit">
      <div class="sop-prog" v-if="up.on"><div class="sop-prog-top"><b>{{ up.pct < 100 ? 'Uploading' : 'Saving' }} {{ up.name }}</b><span>{{ up.pct }}%</span></div><div class="sop-bar"><span :style="{ width: up.pct + '%' }"></span></div><small>Please keep this page open until it finishes.</small></div>
      <label v-else class="filedrop sop-drop" :class="{ drag: up.drag }" @dragover.prevent="up.drag = true" @dragleave.self="up.drag = false" @drop.prevent="up.drag = false; upload($event.dataTransfer.files[0])"><input type="file" hidden @change="pick($event)"><b>Upload document</b>PDF, Word, Excel or images, up to 4 MB · drop a file here or click · staff can download</label>
    </template>
    <p class="help" style="margin:10px 0 0">Files are saved to the company Google Drive (up to 4 MB each); the PMS keeps only the link.</p>
    <FileViewer ref="viewer" />
  </section>
</template>

<script>
// The documents card: View / Download for everyone; upload and remove for HR and Directors.
// The file goes to Google Drive here; the parent (SopView) saves the new list on the SOP.
import FileViewer from '@/components/FileViewer.vue';
import { uploadForLink, downloadFile } from '@/lib/drive.js';
import { toast } from '@/lib/toast.js';
import { fmt } from '@/pages/HR/sops-data.js';

export default {
  components: { FileViewer },
  props: { docs: { type: Array, required: true }, sopKey: { type: String, required: true }, title: { type: String, default: '' }, canEdit: Boolean, busy: Boolean, me: { type: Object, required: true } },
  emits: ['add', 'remove'],
  data() { return { menu: -1, up: { on: false, pct: 0, name: '', drag: false } }; },
  mounted() { document.addEventListener('click', this.closeMenu); },
  beforeUnmount() { document.removeEventListener('click', this.closeMenu); },
  methods: {
    closeMenu() { this.menu = -1; },
    ext(n) { return (n.split('.').pop() || '').toUpperCase().slice(0, 4); },
    pick(e) { const f = e.target.files[0]; e.target.value = ''; this.upload(f); },
    async upload(f) {
      if (!f || this.busy || this.up.on) return;
      if (f.size > 4 * 1024 * 1024) return toast('Files must be 4 MB or less.');
      this.up = { on: true, pct: 0, name: f.name, drag: false };
      try {
        const [u] = await uploadForLink('sops', [f], p => { this.up.pct = Math.round(p * 100); }, this.sopKey, this.title);
        this.up.pct = 100;
        await new Promise(done => this.$emit('add', { name: f.name, on: fmt(new Date()), by: this.me.name, fileId: u.id, url: u.url }, done));
      } catch (err) { toast(err.message); }
      this.up.on = false;
    },
    async download(d) {
      if (!d.fileId) return toast('This starter file has no upload yet. HR can upload it below.');
      try { await downloadFile('sops', d.fileId, d.name); } catch (err) { toast(err.message); }
    }
  }
};
</script>

<style scoped>
.ico-btn { width: 32px; height: 32px; display: grid; place-items: center; border-radius: 8px; border: 1px solid var(--border); background: var(--surface); color: var(--accent); cursor: pointer; flex: none; }
.act { position: relative; flex: none; }
.act-menu { position: absolute; right: 0; top: 38px; z-index: 20; min-width: 140px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; box-shadow: 0 12px 32px rgba(0,0,0,.14); padding: 6px; display: flex; flex-direction: column; }
.act-menu button { display: flex; align-items: center; gap: 10px; text-align: left; background: none; border: 0; border-radius: 6px; padding: 8px 10px; font-size: 13px; font-weight: 500; color: var(--text); cursor: pointer; }
.act-menu button.danger { color: #c0392b; }
@media (hover: hover) { .act-menu button:hover:not(:disabled) { background: var(--accent-soft); color: var(--accent); } .act-menu button.danger:hover:not(:disabled) { background: #fdecea; color: #c0392b; } .ico-btn:hover:not(:disabled) { background: var(--accent-soft); border-color: var(--accent); } }
.sop-prog { margin-top: 12px; border: 1px solid var(--border); border-radius: 12px; padding: 14px 16px; background: var(--accent-soft); font-size: 13px; }
.sop-prog-top { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 8px; overflow-wrap: anywhere; }
.sop-bar { height: 8px; border-radius: 8px; background: var(--surface); overflow: hidden; }
.sop-bar span { display: block; height: 100%; background: var(--accent); transition: width .2s; }
.sop-prog small { display: block; margin-top: 8px; color: var(--muted); }
.sop-drop { margin-top: 12px; } .sop-drop b { color: var(--accent); }
.sop-drop.drag { border-color: var(--accent); background: var(--accent-soft); }
.doc-list { display: grid; }
.doc-row { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--line); }
.doc-badge { flex: none; width: 34px; height: 34px; border-radius: 6px; background: var(--accent-soft); color: var(--accent); font-size: 9px; font-weight: 700; display: grid; place-items: center; }
.doc-name { flex: 1; min-width: 0; font-size: 13px; overflow-wrap: anywhere; } .doc-name b { font-weight: 500; display: block; } .doc-name small { color: var(--muted); font-size: 11px; }
</style>
