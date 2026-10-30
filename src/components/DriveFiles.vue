<template>
  <div class="drive" :class="{ drag }" @dragover.prevent="drag = true" @dragleave.self="drag = false" @drop.prevent="drop">
    <div class="d-head">
      <span class="d-title">Files <span class="muted">(photos, PDFs, videos) · drop files here</span></span>
      <label class="btn" :class="{ off: busy }">{{ busy ? `Uploading ${pct}%` : '+ Upload' }}
        <input type="file" multiple hidden :disabled="busy" accept="image/*,application/pdf,video/*" @change="pick"></label>
    </div>
    <div class="d-prog" v-if="busy"><span :style="{ width: pct + '%' }"></span></div>
    <div class="notice error" v-show="error">{{ error }}</div>
    <p class="help" v-if="loading">Loading files…</p>
    <ul class="d-list" v-else-if="files.length">
      <li v-for="f in files" :key="f.id"><span class="d-ico">{{ icon(f) }}</span><span class="d-name">{{ f.name }}</span><span class="muted">{{ size(f.size) }}</span>
        <button type="button" class="btn" @click="view(f)">View</button></li>
    </ul>
    <p class="help" v-else>No files yet.</p>
    <Teleport to="body">
      <div class="modal-back" v-if="viewing" @click.self="close" v-esc="close">
        <div class="modal vwr" role="dialog" :aria-label="viewing.name">
          <div class="vwr-head"><b>{{ viewing.name }}</b><span><a class="btn" :href="viewing.link" target="_blank" rel="noopener">Open in Drive</a> <button type="button" class="btn" @click="close">Close</button></span></div>
          <div class="vwr-body">
            <p class="help" v-if="vLoading">Loading…</p>
            <div class="notice error" v-else-if="vError">{{ vError }} <a :href="viewing.link" target="_blank" rel="noopener">Open in Drive</a></div>
            <img v-else-if="kindOf(viewing) === 'image'" :src="url" :alt="viewing.name">
            <video v-else-if="kindOf(viewing) === 'video'" :src="url" controls></video>
            <iframe v-else-if="kindOf(viewing) === 'pdf'" :src="url" title="PDF"></iframe>
            <p class="help" v-else>This file type can't be previewed. <a :href="viewing.link" target="_blank" rel="noopener">Open in Drive</a></p>
          </div>
        </div>
      </div>
    </Teleport>
    <a class="d-folder" v-if="folderLink" :href="folderLink" target="_blank" rel="noopener">Open the Drive folder</a>
  </div>
</template>

<script>
import { ensureFolders, listFiles, uploadFile, fileBlob } from '@/lib/drive.js';

// Lists a record's Drive folder and uploads into it. The folder is created on the first upload.
export default {
  props: { kind: { type: String, required: true }, recordId: { type: String, required: true }, label: { type: String, default: '' }, listOnLoad: { type: Boolean, default: true } },
  emits: ['folder'],
  data() { return { drag: false, files: [], folderLink: '', loading: false, viewing: null, url: '', vLoading: false, vError: '', busy: false, pct: 0, error: '' }; },
  mounted() { ensureFolders(); if (this.listOnLoad) this.load(); },
  methods: {
    kindOf(f) { const m = f.mimeType || ''; return m.startsWith('image/') ? 'image' : m.startsWith('video/') ? 'video' : m === 'application/pdf' ? 'pdf' : 'other'; },
    async view(f) {
      this.viewing = f; this.url = ''; this.vError = ''; this.vLoading = this.kindOf(f) !== 'other';
      if (!this.vLoading) return;
      try { const u = await fileBlob(this.kind, f.id); if (this.viewing === f) this.url = u; else URL.revokeObjectURL(u); }
      catch (e) { this.vError = e.message; }
      this.vLoading = false;
    },
    close() { if (this.url) URL.revokeObjectURL(this.url); this.viewing = null; this.url = ''; },
    icon(f) { return f.mimeType?.startsWith('image/') ? '🖼️' : f.mimeType?.startsWith('video/') ? '🎬' : '📄'; },
    size(n) { return !n ? '' : n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`; },
    async load() {
      this.loading = true; this.error = '';
      try { const r = await listFiles(this.kind, this.recordId, this.label); this.files = r.files; this.folderLink = r.folderLink; }
      catch (e) { this.error = e.message; }
      this.loading = false;
    },
    pick(e) { const l = [...e.target.files]; e.target.value = ''; return this.send(l); },
    drop(e) { this.drag = false; return this.send([...e.dataTransfer.files]); },
    async send(list) {
      if (!list.length || this.busy) return;
      this.busy = true; this.error = '';
      try {
        for (const [i, file] of list.entries()) this.folderLink = String(await uploadFile(this.kind, this.recordId, file, p => { this.pct = Math.round(((i + p) / list.length) * 100); }, this.label));
        this.$emit('folder', this.folderLink);
        await this.load();
      } catch (err) { this.error = err.message; }
      this.busy = false; this.pct = 0;
    }
  }
};
</script>

<style scoped>
.drive { border: 1.5px dashed var(--border); border-radius: 12px; padding: 12px 14px; background: color-mix(in srgb, var(--accent-soft) 25%, var(--surface)); transition: border-color .15s, background .15s; }
.drive.drag { border-color: var(--accent); background: var(--accent-soft); }
.d-prog { height: 4px; border-radius: 4px; background: var(--line); margin-bottom: 8px; overflow: hidden; }
.d-prog span { display: block; height: 100%; background: var(--accent); transition: width .2s; }
.d-folder { display: inline-block; margin-top: 4px; color: var(--accent); font-size: 13px; font-weight: 600; text-decoration: underline; text-underline-offset: 3px; }
.d-ico { width: 28px; height: 28px; border-radius: 8px; background: var(--accent-soft); display: grid; place-items: center; flex: none; }
.d-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 8px; }
.d-title { font-size: 14px; font-weight: 600; }
.btn.off { opacity: .6; pointer-events: none; }
.d-list { list-style: none; margin: 0 0 6px; padding: 0; }
.d-list li { display: flex; gap: 10px; padding: 8px 10px; margin-bottom: 6px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); font-size: 13px; }
.d-list li { align-items: center; }
.d-name { flex: 1; overflow-wrap: anywhere; }
.vwr { max-width: 960px; width: 100%; padding: 14px 18px; }
.vwr-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 10px; }
.vwr-body { display: flex; justify-content: center; align-items: center; min-height: 200px; }
.vwr-body img, .vwr-body video { max-width: 100%; max-height: 72vh; border-radius: 8px; }
.vwr-body iframe { width: 100%; height: 72vh; border: 0; border-radius: 8px; }
</style>
