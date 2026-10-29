<template>
  <Teleport to="body">
    <div class="modal-back" v-if="file" @click.self="close" v-esc="close">
      <div class="modal vwr" role="dialog" :aria-label="file.name">
        <div class="vwr-head"><b>{{ file.name }}</b><span><a class="btn" v-if="file.url" :href="file.url" target="_blank" rel="noopener">Open in Drive</a> <button type="button" class="btn" @click="close">Close</button></span></div>
        <div class="vwr-body">
          <p class="help" v-if="loading">Loading…</p>
          <div class="notice error" v-else-if="error">{{ error }}</div>
          <img v-else-if="type === 'image'" :src="src" :alt="file.name">
          <video v-else-if="type === 'video'" :src="src" controls></video>
          <iframe v-else-if="type === 'pdf'" :src="src" title="PDF"></iframe>
          <p class="help" v-else>This file type can't be previewed here. Use Open in Drive.</p>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script>
import { fileBlob, driveId } from '@/lib/drive.js';

// One in-site viewer for a page. Put <FileViewer ref="viewer" /> on the page and call
//   this.$refs.viewer.open({ name, url, kind })   // kind = the Drive area the file was uploaded to ('expenses', 'issues', …)
// Links that aren't uploaded Drive files just open in a new tab.
export default {
  data() { return { file: null, src: '', loading: false, error: '', type: '' }; },
  methods: {
    async open(f) {
      const id = f.id || driveId(f.url);
      if (!id || !f.kind) { window.open(f.url, '_blank', 'noopener'); return; }
      this.file = f; this.src = ''; this.error = ''; this.type = this.guess(f.name); this.loading = true;
      try {
        const u = await fileBlob(f.kind, id);
        if (this.file !== f) { URL.revokeObjectURL(u); return; }
        this.src = u;
        const blob = await (await fetch(u)).blob();
        this.type = blob.type.startsWith('image/') ? 'image' : blob.type.startsWith('video/') ? 'video' : blob.type === 'application/pdf' ? 'pdf' : 'other';
      } catch (e) { this.error = `${e.message} Use Open in Drive.`; }
      this.loading = false;
    },
    guess(n = '') { return /\.(png|jpe?g|gif|webp|heic)$/i.test(n) ? 'image' : /\.(mp4|mov|webm|m4v)$/i.test(n) ? 'video' : /\.pdf$/i.test(n) ? 'pdf' : 'other'; },
    close() { if (this.src) URL.revokeObjectURL(this.src); this.file = null; this.src = ''; }
  }
};
</script>

<style scoped>
.vwr { max-width: 960px; width: 100%; padding: 14px 18px; }
.vwr-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 10px; }
.vwr-body { display: flex; justify-content: center; align-items: center; min-height: 200px; }
.vwr-body img, .vwr-body video { max-width: 100%; max-height: 72vh; border-radius: 8px; }
.vwr-body iframe { width: 100%; height: 72vh; border: 0; border-radius: 8px; }
</style>
