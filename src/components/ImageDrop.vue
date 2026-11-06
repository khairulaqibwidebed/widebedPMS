<template>
  <div class="img-drop" :class="{ over, has: !!modelValue, off: disabled, plain: !paste }" :tabindex="paste ? 0 : null"
    :aria-label="paste ? `${label}: paste a screenshot, drag a file here, or choose a file` : null"
    @paste="onPaste" @dragover.prevent="over = !disabled" @dragleave="over = false" @drop.prevent="onDrop">
    <template v-if="modelValue">
      <div class="pdf-card" v-if="isPdf"><span class="pdf-ic">PDF</span><span>{{ modelValue.name || label }}<small>{{ kb(modelValue.size) }}</small></span></div>
      <img v-else :src="modelValue.data" :alt="label">
      <div class="bar">
        <span class="help">{{ paste ? 'Paste again (Ctrl+V) to replace' : label }}</span>
        <span class="acts">
          <button type="button" class="btn btn-sm" :disabled="disabled" @click.stop="choose()">Replace</button>
          <button type="button" class="btn btn-sm" :disabled="disabled" @click.stop="$emit('update:modelValue', null)">Remove</button>
        </span>
      </div>
    </template>
    <!-- Screenshot box (payment): paste anywhere in the window, drag, or choose -->
    <div class="empty" v-else-if="paste">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.5-3.5L9 20"/></svg>
      <b>{{ working ? 'Reading the image…' : 'Paste a screenshot (Ctrl+V)' }}</b>
      <span>or drag a file here, or <a href="#" @click.prevent.stop="choose()">choose a file</a></span>
      <small v-if="hint">{{ hint }}</small>
    </div>
    <!-- Normal document upload -->
    <div class="file-row" v-else>
      <button type="button" class="btn" :disabled="disabled || working" @click="choose()">{{ working ? 'Reading…' : 'Choose file' }}</button>
      <span class="help">{{ hint || (pdfOnly ? 'PDF only. You can also drag the file here.' : pdf ? 'PDF, JPG or PNG. You can also drag the file here.' : 'JPG or PNG. You can also drag the file here.') }}</span>
    </div>
    <input ref="file" type="file" :accept="pdfOnly ? 'application/pdf' : pdf ? 'image/*,application/pdf' : 'image/*'" hidden @change="onFile">
  </div>
</template>

<script>
// One image upload (5 Nov 2026, Salary Advance). Default: a normal "Choose file" upload (drag also works).
// With `paste` (the payment screenshot from the bank page): a paste anywhere on the page lands here too.
// v-model holds the shrunk image { data, w, h, size } from lib/image-shrink.js. With `pdf` (documents), a PDF is also taken
// as it is: { data: 'data:application/pdf;base64,...', w: 0, h: 0, size, name }, up to about 500 KB (Firestore doc limit,
// the rules allow under 700,000 characters). Errors go out as an `error` event.
import { shrinkImage } from '@/lib/image-shrink.js';
const PDF_MAX = 690000;   // characters of the data URL (rules: under 700,000)
const readUrl = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error(`${f.name} can't be read.`)); r.readAsDataURL(f); });

export default {
  props: {
    modelValue: { type: Object, default: null },
    label: { type: String, default: 'Image' },
    hint: { type: String, default: '' },
    disabled: { type: Boolean, default: false },
    paste: { type: Boolean, default: false },
    pdf: { type: Boolean, default: false },
    // pdfOnly (5 Nov 2026): signed documents take a PDF only, no photos.
    pdfOnly: { type: Boolean, default: false }
  },
  emits: ['update:modelValue', 'error'],
  data() { return { over: false, working: false }; },
  computed: { isPdf() { return String(this.modelValue?.data || '').startsWith('data:application/pdf'); } },
  mounted() { if (this.paste) document.addEventListener('paste', this.onPaste); },
  beforeUnmount() { document.removeEventListener('paste', this.onPaste); },
  methods: {
    kb(n) { return n ? `${Math.max(1, Math.round(n / 1024))} KB` : ''; },
    choose() { if (!this.disabled) this.$refs.file.click(); },
    onPaste(ev) {
      if (!this.paste || this.disabled || ev.__imgTaken) return;
      const f = [...(ev.clipboardData?.files || [])].find(x => x.type?.startsWith('image/'));
      if (!f) return;
      ev.__imgTaken = true; ev.preventDefault();
      this.take(f, 'screenshot.png');
    },
    onDrop(ev) {
      this.over = false;
      if (this.disabled) return;
      const f = ev.dataTransfer?.files?.[0];
      if (f) this.take(f, f.name);
    },
    onFile(ev) { const f = ev.target.files?.[0]; ev.target.value = ''; if (f) this.take(f, f.name); },
    async take(f, name) {
      this.working = true;
      try {
        const file = f.name ? f : new File([f], name, { type: f.type });
        if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
          if (!this.pdf && !this.pdfOnly) throw new Error('Upload a JPG or PNG here, not a PDF.');
          const data = await readUrl(file);
          if (data.length > PDF_MAX) throw new Error(`${file.name} is too big (about 500 KB at most). ${this.pdfOnly ? 'Save it smaller (lower scan quality).' : 'Save it smaller, or upload a photo instead.'}`);
          this.$emit('update:modelValue', { data: data.replace(/^data:[^;]*;/, 'data:application/pdf;'), w: 0, h: 0, size: file.size, name: file.name });
        } else if (this.pdfOnly) throw new Error('Upload the signed document as a PDF.');
        else this.$emit('update:modelValue', await shrinkImage(file));
        this.$emit('error', '');
      } catch (e) { this.$emit('error', e.message); }
      this.working = false;
    }
  }
};
</script>

<style scoped>
.img-drop { border: 1.5px dashed var(--line, #ccc); border-radius: 10px; background: var(--chip, #f6f6f6); outline: none; transition: border-color .15s, background .15s; margin: 6px 0 10px; }
.img-drop:focus, .img-drop.over { border-color: var(--accent); border-style: solid; background: color-mix(in srgb, var(--accent) 6%, transparent); }
.img-drop.plain { border: 0; background: none; }
.img-drop.plain.over { border: 1.5px dashed var(--accent); border-radius: 10px; }
.img-drop.off { opacity: .6; pointer-events: none; }
.empty { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 18px 14px; text-align: center; color: var(--muted); font-size: 13px; }
.empty b { color: var(--text); font-weight: 600; }
.empty a { color: var(--accent); }
.empty small { font-size: 12px; }
.file-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.img-drop.has { border: 1px solid var(--border); background: var(--card, #fff); }
.img-drop img { display: block; max-width: 100%; max-height: 260px; margin: 10px auto 0; border-radius: 6px; }
.bar { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; padding: 8px 10px; }
.acts { display: flex; gap: 6px; }
.pdf-card { display: flex; align-items: center; gap: 10px; padding: 12px 12px 0; font-size: 13px; }
.pdf-card small { display: block; font-size: 11px; color: var(--muted); }
.pdf-ic { flex: none; font-size: 10px; font-weight: 700; color: var(--accent); background: var(--accent-soft); padding: 3px 6px; border-radius: 6px; }
</style>
