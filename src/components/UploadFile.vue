<template>
  <span class="up">
    <label class="btn" :class="{ off: busy }">{{ busy ? `Uploading ${pct}%` : label }}
      <input type="file" :multiple="multiple" hidden :disabled="busy" :accept="accept" @change="pick"></label>
    <span class="up-err" v-if="error">{{ error }}</span>
  </span>
</template>

<script>
import { uploadForLink } from '@/lib/drive.js';

// An Upload button for pages that keep links. Sends the files to the company Google Drive and emits 'done' with [{ name, url }].
//   <UploadFile kind="issues" @done="files => ..." />
export default {
  props: { kind: { type: String, required: true }, label: { type: String, default: '⬆ Upload file' }, multiple: { type: Boolean, default: true }, accept: { type: String, default: 'image/*,application/pdf,video/*' } },
  emits: ['done'],
  data() { return { busy: false, pct: 0, error: '' }; },
  methods: {
    async pick(e) {
      const list = [...e.target.files]; e.target.value = '';
      if (!list.length) return;
      this.busy = true; this.error = '';
      try { this.$emit('done', await uploadForLink(this.kind, list, p => { this.pct = Math.round(p * 100); })); }
      catch (err) { this.error = err.message; }
      this.busy = false; this.pct = 0;
    }
  }
};
</script>

<style scoped>
.btn.off { opacity: .6; pointer-events: none; }
.up-err { color: var(--danger, #c0392b); font-size: 12px; margin-left: 8px; }
</style>
