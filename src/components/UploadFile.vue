<template>
  <span class="up">
    <label class="btn up-btn" :class="{ off: busy }"><span class="up-bar" v-if="busy" :style="{ width: pct + '%' }"></span><span class="up-txt">{{ busy ? `Uploading ${pct}%` : label }}</span>
      <input type="file" :multiple="multiple" hidden :disabled="busy" :accept="accept" @change="pick"></label>
    <span class="up-err" v-if="error">{{ error }}</span>
  </span>
</template>

<script>
import { ensureFolders, uploadForLink } from '@/lib/drive.js';

// An Upload button for pages that keep links. Sends the files to the company Google Drive and emits 'done' with [{ name, url }].
//   <UploadFile kind="issues" @done="files => ..." />
export default {
  props: { kind: { type: String, required: true }, label: { type: String, default: '⬆ Upload file' }, recordId: { type: String, default: '' }, folderLabel: { type: String, default: '' }, multiple: { type: Boolean, default: true }, accept: { type: String, default: 'image/*,application/pdf,video/*' } },
  emits: ['done'],
  data() { return { busy: false, pct: 0, error: '' }; },
  mounted() { ensureFolders(); },
  methods: {
    async pick(e) {
      const list = [...e.target.files]; e.target.value = '';
      if (!list.length) return;
      this.busy = true; this.error = '';
      try { this.$emit('done', await uploadForLink(this.kind, list, p => { this.pct = Math.round(p * 100); }, this.recordId, this.folderLabel)); }
      catch (err) { this.error = err.message; }
      this.busy = false; this.pct = 0;
    }
  }
};
</script>

<style scoped>
.btn.off { pointer-events: none; }
.up-btn { position: relative; overflow: hidden; }
.up-bar { position: absolute; inset: 0 auto 0 0; background: var(--accent-soft); transition: width .2s; }
.up-txt { position: relative; }
.up-err { color: var(--danger, #c0392b); font-size: 12px; margin-left: 8px; }
</style>
