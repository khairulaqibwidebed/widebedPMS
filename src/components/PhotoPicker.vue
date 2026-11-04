<template>
  <div class="pp">
    <div class="pp-grid" v-if="previews && modelValue.length">
      <div class="pp-item" v-for="(p, i) in modelValue" :key="i">
        <button type="button" class="pp-open" :aria-label="'Enlarge photo ' + (i + 1)" @click="at = i"><img :src="p.data" alt=""></button>
        <button type="button" class="pp-x" :aria-label="'Remove photo ' + (i + 1)" @click="remove(i)">×</button>
      </div>
    </div>
    <!-- compact: a paperclip icon button (chat reply boxes); otherwise a labelled button (the complaint form) -->
    <label class="btn pp-btn" :class="{ off: busy || modelValue.length >= max, clip: compact }" :title="compact ? (busy ? 'Preparing…' : `Attach photos (${modelValue.length}/${max})`) : null"
      :aria-label="compact ? 'Attach photos' : null">
      <svg v-if="compact" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
      <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="m21 17-5-5-8 7"/></svg>
      <template v-if="compact"><span class="pp-n" v-if="busy">…</span><span class="pp-n" v-else-if="modelValue.length">{{ modelValue.length }}</span></template>
      <template v-else>{{ busy ? 'Preparing…' : modelValue.length ? `Add photo (${modelValue.length}/${max})` : label }}</template>
      <input type="file" accept="image/*" multiple hidden :disabled="busy || modelValue.length >= max" @change="pick">
    </label>
    <span class="pp-err" v-if="error">{{ error }}</span>
    <PhotoViewer :images="modelValue" v-model="at" />
  </div>
</template>

<script>
// Pick photos to send with a complaint or a reply. They are shrunk in the browser (lib/image-shrink.js) and kept as
// data URLs in v-model until the form saves them. Up to `max` photos.
//   <PhotoPicker v-model="photos" :max="5" />
import { shrinkImage } from '@/lib/image-shrink.js';
import PhotoViewer from '@/components/PhotoViewer.vue';

export default {
  props: { modelValue: { type: Array, required: true }, max: { type: Number, default: 5 }, label: { type: String, default: 'Add photos' }, compact: { type: Boolean, default: false }, previews: { type: Boolean, default: true } },
  components: { PhotoViewer },
  emits: ['update:modelValue'],
  data() { return { busy: false, error: '', at: null }; },
  methods: {
    async pick(e) {
      const files = [...e.target.files]; e.target.value = '';
      if (!files.length) return;
      this.busy = true; this.error = '';
      const room = this.max - this.modelValue.length, out = [...this.modelValue];
      if (files.length > room) this.error = `Only ${this.max} photos per message; the first ${room} were added.`;
      for (const f of files.slice(0, room)) {
        try { out.push(await shrinkImage(f)); } catch (err) { this.error = err.message; }
      }
      this.$emit('update:modelValue', out);
      this.busy = false;
    },
    remove(i) { const out = [...this.modelValue]; out.splice(i, 1); this.at = null; this.$emit('update:modelValue', out); }
  }
};
</script>

<style scoped>
.pp { display: grid; gap: 8px; justify-items: start; }
.pp-grid { display: flex; flex-wrap: wrap; gap: 8px; }
.pp-item { position: relative; width: 76px; height: 76px; border-radius: 8px; overflow: hidden; border: 1px solid var(--border); background: var(--hover); }
.pp-open { display: block; width: 100%; height: 100%; padding: 0; border: 0; background: none; cursor: zoom-in; }
.pp-item img { width: 100%; height: 100%; object-fit: cover; display: block; }
.pp-item:hover { border-color: var(--accent); }
.pp-x { position: absolute; top: 3px; right: 3px; width: 22px; height: 22px; border: 0; border-radius: 50%; background: rgba(0, 0, 0, .6); color: #fff; font-size: 15px; line-height: 1; cursor: pointer; }
.pp-btn { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
.pp-btn.off { opacity: .55; pointer-events: none; }
.pp-btn.clip { width: 40px; height: 40px; padding: 0; justify-content: center; position: relative; border-radius: 10px; }
.pp-n { position: absolute; top: -6px; right: -6px; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px; background: var(--accent); color: #fff; font-size: 11px; font-weight: 700; line-height: 18px; text-align: center; }
.pp-err { font-size: 12px; color: var(--red, #b42318); }
</style>
