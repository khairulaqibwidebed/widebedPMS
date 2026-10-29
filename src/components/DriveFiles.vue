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
      <li v-for="f in files" :key="f.id"><a :href="f.link" target="_blank" rel="noopener">{{ icon(f) }} {{ f.name }}</a><span class="muted">{{ size(f.size) }}</span></li>
    </ul>
    <p class="help" v-else>No files yet.</p>
    <a class="help" v-if="folderLink" :href="folderLink" target="_blank" rel="noopener">Open the Drive folder</a>
  </div>
</template>

<script>
import { listFiles, uploadFile } from '@/lib/drive.js';

// Lists a record's Drive folder and uploads into it. The folder is created on the first upload.
export default {
  props: { kind: { type: String, required: true }, recordId: { type: String, required: true }, listOnLoad: { type: Boolean, default: true } },
  emits: ['folder'],
  data() { return { files: [], folderLink: '', loading: false, busy: false, pct: 0, error: '' }; },
  mounted() { if (this.listOnLoad) this.load(); },
  methods: {
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
.d-list a { overflow-wrap: anywhere; }
</style>
