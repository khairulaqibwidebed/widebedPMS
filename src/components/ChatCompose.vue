<template>
  <div class="cc">
    <!-- Photos waiting to be sent, above the bar (click to enlarge, × to remove) -->
    <div class="cc-pics" v-if="photos.length">
      <div class="cc-pic" v-for="(p, i) in photos" :key="i">
        <button type="button" class="cc-open" :aria-label="'Enlarge photo ' + (i + 1)" @click="at = i"><img :src="p.data" alt=""></button>
        <button type="button" class="cc-x" :aria-label="'Remove photo ' + (i + 1)" @click="removePhoto(i)">×</button>
      </div>
    </div>
    <div class="cc-bar">
      <PhotoPicker v-if="allowPhotos" class="cc-clip" compact :previews="false" :model-value="photos" @update:model-value="v => $emit('update:photos', v)" />
      <textarea ref="box" class="cc-input" rows="1" maxlength="2000" :placeholder="placeholder" :aria-label="placeholder" :value="modelValue"
        @input="onInput" @keydown.enter.exact.prevent="send" @paste="onPaste" />
      <button type="button" class="cc-send" :disabled="!canSend" aria-label="Send" title="Send (Enter)" @click="send">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3.4 20.4 21 12 3.4 3.6 3.4 10.2 15 12 3.4 13.8z"/></svg>
      </button>
    </div>
    <div class="cc-err" v-show="pasteErr">{{ pasteErr }}</div>
    <PhotoViewer :images="photos" v-model="at" />
  </div>
</template>

<script>
// Message bar like a messaging app (WhatsApp): paperclip for photos, a box that grows as you type, a round Send button.
// Enter sends, Shift+Enter adds a new line. Photos wait above the bar until sent.
//   <ChatCompose v-model="text" v-model:photos="pics" :busy="busy" placeholder="Reply to HR" @send="reply" />
import PhotoPicker from '@/components/PhotoPicker.vue';
import PhotoViewer from '@/components/PhotoViewer.vue';
import { shrinkImage, keepOriginal } from '@/lib/image-shrink.js';
const MAX_PICS = 5;

export default {
  components: { PhotoPicker, PhotoViewer },
  props: { modelValue: { type: String, default: '' }, photos: { type: Array, default: () => [] }, busy: { type: Boolean, default: false },
    placeholder: { type: String, default: 'Type a message' },
    allowPhotos: { type: Boolean, default: true } },   // false: no paperclip (KPI chat, 6 Nov 2026)
  emits: ['update:modelValue', 'update:photos', 'send'],
  data() { return { at: null, pasteErr: '' }; },
  computed: { canSend() { return !this.busy && (!!this.modelValue.trim() || this.photos.length > 0); } },
  watch: { modelValue() { this.$nextTick(this.grow); } },   // also shrinks back after sending
  methods: {
    onInput(e) { this.$emit('update:modelValue', e.target.value); this.grow(); },
    grow() { const b = this.$refs.box; if (!b) return; b.style.height = 'auto'; b.style.height = Math.min(b.scrollHeight, 140) + 'px'; },
    send() { if (this.canSend) this.$emit('send'); },
    // 11 Nov 2026: a screenshot or copied image pasted into the box joins the photos waiting above the bar (same as the paperclip)
    async onPaste(e) {
      if (!this.allowPhotos) return;
      const files = [...(e.clipboardData?.items || [])].filter(it => it.kind === 'file' && it.type.startsWith('image/')).map(it => it.getAsFile()).filter(Boolean);
      if (!files.length) return;   // plain text pastes as normal
      e.preventDefault();
      this.pasteErr = '';
      const out = [...this.photos], room = MAX_PICS - out.length;
      if (room <= 0) { this.pasteErr = `Only ${MAX_PICS} photos per message.`; return; }
      if (files.length > room) this.pasteErr = `Only ${MAX_PICS} photos per message; the first ${room} were added.`;
      for (const f of files.slice(0, room)) {
        const name = f.name && f.name !== 'image.png' ? f.name : `Pasted image ${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.${(f.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`;
        try { out.push(keepOriginal(await shrinkImage(f), new File([f], name, { type: f.type }))); } catch (err) { this.pasteErr = err.message; }
      }
      this.$emit('update:photos', out);
    },
    removePhoto(i) { const out = [...this.photos]; out.splice(i, 1); this.at = null; this.$emit('update:photos', out); }
  }
};
</script>

<style scoped>
.cc { display: grid; gap: 8px; }
.cc-err { font-size: 12px; color: var(--danger, #c0392b); }
.cc-pics { display: flex; gap: 8px; flex-wrap: wrap; }
.cc-pic { position: relative; width: 64px; height: 64px; border-radius: 8px; overflow: hidden; border: 1px solid var(--border); background: var(--hover); }
.cc-open { display: block; width: 100%; height: 100%; padding: 0; border: 0; background: none; cursor: zoom-in; }
.cc-open img { width: 100%; height: 100%; object-fit: cover; display: block; }
.cc-x { position: absolute; top: 2px; right: 2px; width: 20px; height: 20px; border: 0; border-radius: 50%; background: rgba(0, 0, 0, .6); color: #fff; font-size: 14px; line-height: 1; cursor: pointer; }
.cc-bar { display: flex; align-items: flex-end; gap: 8px; padding: 6px; border: 1px solid var(--border); border-radius: 24px; background: var(--surface); }
.cc-bar:focus-within { border-color: var(--accent); }
.cc-clip :deep(.pp-btn.clip) { border: 0; border-radius: 50%; background: none; color: var(--text-2); }
.cc-clip :deep(.pp-btn.clip:hover) { background: var(--hover); color: var(--accent); }
.cc-clip :deep(.pp-err) { position: absolute; }
.cc-input { flex: 1 1 auto; min-width: 0; border: 0; outline: none; resize: none; background: none; font: inherit; font-size: 14px; line-height: 20px;
  padding: 10px 4px; max-height: 140px; color: var(--text); }
.cc-send { flex: none; width: 40px; height: 40px; border: 0; border-radius: 50%; background: var(--accent); color: #fff; display: grid; place-items: center; cursor: pointer; }
.cc-send:disabled { background: var(--chip); color: var(--muted); cursor: default; }
.cc-send:not(:disabled):hover { filter: brightness(.95); }
@media (max-width: 860px) { .cc-input { font-size: 16px; } }   /* phones: no zoom on tap */
</style>
