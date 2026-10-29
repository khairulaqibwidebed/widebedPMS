<template>
  <div class="drive">
    <div class="d-head">
      <span class="d-title">Files <span class="muted">(photos, PDFs, videos)</span></span>
      <label class="btn" :class="{ off: busy }">{{ busy ? `Uploading ${pct}%` : '+ Upload' }}
        <input type="file" multiple hidden :disabled="busy" accept="image/*,application/pdf,video/*" @change="pick"></label>
    </div>
    <div class="notice error" v-show="error">{{ error }}</div>
    <p class="help" v-if="loading">Loading files…</p>
    <ul class="d-list" v-else-if="files.length">
      <li v-for="f in files" :key="f.id"><span class="d-name">{{ icon(f) }} {{ f.name }}</span><span class="muted">{{ size(f.size) }}</span>
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
    <a class="help" v-if="folderLink" :href="folderLink" target="_blank" rel="noopener">Open the Drive folder</a>
  </div>
</template>

<script>
import { listFiles, uploadFile, fileBlob } from '@/lib/drive.js';

// Lists a record's Drive folder and uploads into it. The folder is created on the first upload.
export default {
  props: { kind: { type: String, required: true }, recordId: { type: String, required: true }, listOnLoad: { type: Boolean, default: true } },
  emits: ['folder'],
  data() { return { files: [], folderLink: '', loading: false, viewing: null, url: '', vLoading: false, vError: '', busy: false, pct: 0, error: '' }; },
  mounted() { if (this.listOnLoad) this.load(); },
  methods: {
    kindOf(f) { const m = f.mimeType || ''; return m.startsWith('image/') ? 'image' : m.startsWith('video/') ? 'video' : m === 'application/pdf' ? 'pdf' : 'other'; },
    async view(f) {
      this.viewing = f; this.url = ''; this.vError = ''; this.vLoading = this.kindOf(f) !== 'other';
      if (!this.vLoading) return;
      try { const u = await fileBlob(this.kind, this.recordId, f.id); if (this.viewing === f) this.url = u; else URL.revokeObjectURL(u); }
      catch (e) { this.vError = e.message; }
      this.vLoading = false;
    },
    close() { if (this.url) URL.revokeObjectURL(this.url); this.viewing = null; this.url = ''; },
    icon(f) { return f.mimeType?.startsWith('image/') ? '🖼️' : f.mimeType?.startsWith('video/') ? '🎬' : '📄'; },
    size(n) { return !n ? '' : n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`; },
    async load() {
      this.loading = true; this.error = '';
      try { const r = await listFiles(this.kind, this.recordId); this.files = r.files; this.folderLink = r.folderLink; }
      catch (e) { this.error = e.message; }
      this.loading = false;
    },
    async pick(e) {
      const list = [...e.target.files]; e.target.value = '';
      if (!list.length) return;
      this.busy = true; this.error = '';
      try {
        for (const [i, file] of list.entries()) this.folderLink = await uploadFile(this.kind, this.recordId, file, p => { this.pct = Math.round(((i + p) / list.length) * 100); });
        this.$emit('folder', this.folderLink);
        await this.load();
      } catch (err) { this.error = err.message; }
      this.busy = false; this.pct = 0;
    }
  }
};
</script>

<style scoped>
.drive { border: 1px dashed var(--border); border-radius: 12px; padding: 12px 14px; }
.d-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 8px; }
.d-title { font-size: 14px; font-weight: 600; }
.btn.off { opacity: .6; pointer-events: none; }
.d-list { list-style: none; margin: 0 0 6px; padding: 0; }
.d-list li { display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; border-bottom: 1px solid var(--line); font-size: 13px; }
.d-list li { align-items: center; }
.d-name { flex: 1; overflow-wrap: anywhere; }
.vwr { max-width: 960px; width: 100%; padding: 14px 18px; }
.vwr-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 10px; }
.vwr-body { display: flex; justify-content: center; align-items: center; min-height: 200px; }
.vwr-body img, .vwr-body video { max-width: 100%; max-height: 72vh; border-radius: 8px; }
.vwr-body iframe { width: 100%; height: 72vh; border: 0; border-radius: 8px; }
</style>
