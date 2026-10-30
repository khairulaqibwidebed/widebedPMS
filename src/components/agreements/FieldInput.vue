<template>
  <h3 v-if="field.type === 'section'" class="ag-section">{{ field.label }}</h3>

  <div v-else class="field ag-field" :class="{ 'has-error': error, wide: wide }">
    <label v-if="field.type !== 'checkbox'" :for="id">{{ field.label }}<span class="req" v-if="field.required" aria-hidden="true"> *</span></label>

    <input v-if="['text', 'email', 'phone'].includes(field.type)" class="input" :id="id" :type="field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text'"
      :value="modelValue ?? ''" :placeholder="field.placeholder" :disabled="disabled" :autocomplete="field.type === 'email' ? 'email' : 'off'"
      @input="set($event.target.value)">

    <textarea v-else-if="field.type === 'textarea'" class="input" :id="id" rows="3" :value="modelValue ?? ''" :placeholder="field.placeholder" :disabled="disabled"
      @input="set($event.target.value)"></textarea>

    <div v-else-if="field.type === 'number' || field.type === 'currency'" class="ag-num">
      <span v-if="field.type === 'currency'" class="ag-prefix">{{ (field.format?.prefix ?? 'RM ').trim() || 'RM' }}</span>
      <input class="input" :id="id" type="number" step="any" inputmode="decimal" :value="modelValue ?? ''" :placeholder="field.placeholder" :disabled="disabled"
        @input="set($event.target.value === '' ? '' : Number($event.target.value))">
    </div>

    <input v-else-if="field.type === 'date'" class="input" :id="id" type="date" :value="modelValue || ''" :disabled="disabled" @input="set($event.target.value)">

    <template v-else-if="field.type === 'dropdown'">
      <select class="input select" :id="id" :value="otherMode ? '__other' : (modelValue ?? '')" :disabled="disabled" @change="pick($event.target.value)">
        <option value="">— Choose —</option>
        <option v-for="o in field.options" :key="o" :value="o">{{ o }}</option>
        <option v-if="field.allowOther" value="__other">Other…</option>
      </select>
      <input v-if="otherMode" class="input ag-other" :value="modelValue ?? ''" placeholder="Type the other value" :disabled="disabled" @input="set($event.target.value)">
    </template>

    <div v-else-if="field.type === 'radio'" class="ag-radios" role="radiogroup" :aria-label="field.label">
      <label v-for="o in field.options" :key="o" class="ag-radio"><input type="radio" :name="id" :checked="!otherMode && modelValue === o" :disabled="disabled" @change="pick(o)"> {{ o }}</label>
      <label v-if="field.allowOther" class="ag-radio"><input type="radio" :name="id" :checked="otherMode" :disabled="disabled" @change="pick('__other')"> Other</label>
      <input v-if="otherMode" class="input ag-other" :value="modelValue ?? ''" placeholder="Type the other value" :disabled="disabled" @input="set($event.target.value)">
    </div>

    <label v-else-if="field.type === 'checkbox'" class="ag-check">
      <input type="checkbox" :id="id" :checked="modelValue === true || modelValue === 'true'" :disabled="disabled" @change="set($event.target.checked)">
      <span>{{ field.label }}<span class="req" v-if="field.required" aria-hidden="true"> *</span></span>
    </label>

    <SignaturePad v-else-if="field.type === 'signature'" :model-value="modelValue || ''" :label="field.label" :disabled="disabled" @update:model-value="set" />

    <div v-else-if="field.type === 'image' || field.type === 'file'" class="ag-upload">
      <template v-if="modelValue && modelValue.id">
        <button v-if="!uploader" type="button" class="link" @click="download">{{ modelValue.name }}</button>
        <span v-else class="ag-file">📎 {{ modelValue.name }}</span>
        <button type="button" class="btn btn-sm" :disabled="disabled" @click="set('')">Remove</button>
      </template>
      <label v-else class="filedrop" :class="{ off: disabled || busy }">
        <input type="file" hidden :accept="field.type === 'image' ? 'image/*' : 'application/pdf,image/*'" :disabled="disabled || busy" @change="upload">
        <b>{{ busy ? 'Uploading…' : field.type === 'image' ? 'Choose a photo' : 'Choose a PDF or photo' }}</b>
        <span>Up to 15 MB</span>
      </label>
    </div>

    <div v-else-if="field.type === 'formula'" class="ag-formula" :class="{ err: modelValue && modelValue.error }" :id="id" role="status">
      {{ shown || '—' }}<small v-if="modelValue && modelValue.error"> {{ modelValue.message }}</small>
    </div>

    <span class="help" v-if="field.help">{{ field.help }}</span>
    <span class="ag-error" v-if="error || upErr">{{ error || upErr }}</span>
  </div>
</template>

<script setup>
// One form field of any type. Uploads go straight to Drive; the value becomes { id, name, mime }.
import { ref, computed, watch } from 'vue';
import SignaturePad from './SignaturePad.vue';
import { formatValue } from '@/lib/agreements/format.js';
import { normaliseImage, sniff, safeFileName, downloadBytes } from '@/lib/agreements/bytes.js';
import { uploadBytes, loadFile } from '@/lib/agreements/drive.js';

const props = defineProps({
  field: { type: Object, required: true },
  modelValue: { default: '' },
  error: { type: String, default: '' },
  disabled: Boolean,
  // The public fill-in page uploads through its link instead of a staff sign-in: (bytes, name, mime) => { id, name, mime }.
  uploader: { type: Function, default: null }
});
const emit = defineEmits(['update:modelValue']);
const id = computed(() => 'fld-' + props.field.id);
const wide = computed(() => ['textarea', 'signature', 'radio'].includes(props.field.type));
const shown = computed(() => formatValue(props.field, props.modelValue));
const set = v => emit('update:modelValue', v);

// "Other…": shown when the value isn't one of the options.
const otherMode = ref(false);
watch(() => [props.modelValue, props.field.options], () => {
  const v = props.modelValue;
  if (v !== '' && v !== null && v !== undefined && !(props.field.options || []).includes(v)) otherMode.value = !!props.field.allowOther;
}, { immediate: true });
function pick(v) {
  if (v === '__other') { otherMode.value = true; set(''); return; }
  otherMode.value = false; set(v);
}

const busy = ref(false), upErr = ref('');
async function upload(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  upErr.value = ''; busy.value = true;
  try {
    let bytes, mime;
    if (file.type.startsWith('image/')) ({ bytes, mime } = await normaliseImage(file));
    else {
      bytes = new Uint8Array(await file.arrayBuffer()); mime = sniff(bytes);
      if (mime !== 'application/pdf') throw new Error('Choose a PDF or a photo.');
    }
    const name = safeFileName(file.name.replace(/\.[^.]+$/, '') + (mime === 'application/pdf' ? '.pdf' : mime === 'image/png' ? '.png' : '.jpg'));
    set(await (props.uploader ? props.uploader(bytes, name, mime) : uploadBytes('attachments', bytes, name, mime)));
  } catch (err) { upErr.value = err.message; }
  busy.value = false;
}
async function download() {
  try { const f = await loadFile(props.modelValue.id); downloadBytes(f.bytes, props.modelValue.name, f.mime); }
  catch (err) { upErr.value = err.message; }
}
</script>
