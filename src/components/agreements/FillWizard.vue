<template>
  <div class="wz">
    <div class="wz-head">
      <div class="wz-title">{{ title }}</div>
      <div class="wz-sub">{{ onReview ? 'Last step · Check and submit' : `Step ${index + 1} of ${steps.length + 1} · ${current?.title || ''}` }}</div>
      <div class="wz-bar" role="progressbar" :aria-valuenow="progress" aria-valuemin="0" aria-valuemax="100"><span :style="{ width: progress + '%' }"></span></div>
      <ol class="wz-steps">
        <li v-for="(s, i) in steps" :key="s.title + i" :class="{ on: i === index, done: i < index }">
          <button type="button" :disabled="i > furthest" @click="go(i)"><span class="wz-num">{{ i < index ? '✓' : i + 1 }}</span><span class="wz-name">{{ s.title }}</span></button>
        </li>
        <li :class="{ on: onReview }"><button type="button" :disabled="steps.length > furthest" @click="go(steps.length)"><span class="wz-num">{{ steps.length + 1 }}</span><span class="wz-name">Review</span></button></li>
      </ol>
    </div>

    <section class="wz-body card" ref="body">
      <template v-if="!onReview && current">
        <h2>{{ current.title }}</h2>
        <p class="wz-intro" v-if="index === 0 && intro">{{ intro }}</p>
        <div class="notice warn" v-if="stepErrors">Please check the {{ stepErrors }} highlighted field{{ stepErrors > 1 ? 's' : '' }}.</div>
        <div class="ag-form">
          <template v-for="f in current.shown" :key="f.id">
            <FieldInput :field="f" :uploader="uploader" :disabled="busy || isLocked(f)"
              :model-value="f.type === 'formula' ? computed_[f.id] : modelValue[f.id]" :error="errors[f.id] || ''"
              @update:model-value="v => set(f, v)" />
          </template>
        </div>
        <p class="wz-locked" v-if="current.shown.some(isLocked)">🔒 Greyed-out answers were filled in by Widebed and can't be changed here.</p>
      </template>

      <template v-else>
        <h2>Check your answers</h2>
        <p class="wz-intro">Make sure everything is right. Use "Change" to go back to a section.</p>
        <div v-for="(s, i) in steps" :key="s.title + i" class="wz-review">
          <div class="wz-review-head"><b>{{ s.title }}</b><button type="button" class="link" @click="go(i)">Change</button></div>
          <dl>
            <template v-for="f in s.shown" :key="f.id">
              <dt>{{ f.label }}</dt>
              <dd>
                <img v-if="f.type === 'signature' && modelValue[f.id]" :src="modelValue[f.id]" alt="Signature" class="wz-sig">
                <span v-else :class="{ empty: !answer(f) }">{{ answer(f) || '—' }}</span>
                <span class="ag-error" v-if="errors[f.id]"> {{ errors[f.id] }}</span>
              </dd>
            </template>
          </dl>
        </div>
        <label class="wz-agree" v-if="consent">
          <input type="checkbox" v-model="agreed">
          <span>{{ consent }}</span>
        </label>
      </template>
    </section>

    <div class="wz-foot">
      <button type="button" class="btn" v-if="index > 0" :disabled="busy" @click="go(index - 1)">← Back</button>
      <span class="grow"></span>
      <button type="button" class="btn" v-if="draftLabel" :disabled="busy" @click="emit('draft')">{{ draftLabel }}</button>
      <button v-if="!onReview" type="button" class="btn btn-primary" :disabled="busy" @click="next">{{ index === steps.length - 1 ? 'Review' : 'Next' }} →</button>
      <button v-else type="button" class="btn btn-primary wz-submit" :disabled="busy || (consent && !agreed)" @click="submit">{{ busy ? 'Sending…' : submitLabel }}</button>
    </div>
  </div>
</template>

<script setup>
// Step-by-step form: one section per step, then a review page. Used inside the PMS (new records) and on the
// public fill-in page. Sections come from the form's "Section heading" fields.
import { ref, computed, nextTick } from 'vue';
import FieldInput from './FieldInput.vue';
import { computeValues } from '@/lib/agreements/formula.js';
import { isShown, validate } from '@/lib/agreements/fields.js';
import { formatValue } from '@/lib/agreements/format.js';

const props = defineProps({
  fields: { type: Array, required: true },
  modelValue: { type: Object, required: true },
  title: { type: String, default: '' },
  intro: { type: String, default: '' },
  uploader: { type: Function, default: null },
  locked: { type: Array, default: () => [] },     // field ids that can't be changed (filled in by staff)
  consent: { type: String, default: '' },          // a tick box shown before submitting
  draftLabel: { type: String, default: '' },
  submitLabel: { type: String, default: 'Submit' },
  busy: Boolean
});
const emit = defineEmits(['update:modelValue', 'submit', 'draft']);

const index = ref(0), furthest = ref(0), errors = ref({}), agreed = ref(false), body = ref(null);
const computed_ = computed(() => computeValues(props.fields, props.modelValue));
const steps = computed(() => {
  const out = []; let cur = { title: 'Details', fields: [] };
  for (const f of props.fields) {
    if (f.type === 'section') { if (cur.fields.length) out.push(cur); cur = { title: f.label, fields: [] }; continue; }
    cur.fields.push(f);
  }
  if (cur.fields.length) out.push(cur);
  return out.map(s => ({ ...s, shown: s.fields.filter(f => isShown(f, props.modelValue)) })).filter(s => s.shown.length);
});
const onReview = computed(() => index.value >= steps.value.length);
const current = computed(() => steps.value[index.value]);
const progress = computed(() => Math.round(((index.value + 1) / (steps.value.length + 1)) * 100));
const stepErrors = computed(() => (current.value ? current.value.shown.filter(f => errors.value[f.id]).length : 0));
const isLocked = f => props.locked.includes(f.id);

function set(f, v) {
  emit('update:modelValue', { ...props.modelValue, [f.id]: v });
  if (errors.value[f.id]) { const e = { ...errors.value }; delete e[f.id]; errors.value = e; }
}
function answer(f) {
  const v = f.type === 'formula' ? computed_.value[f.id] : props.modelValue[f.id];
  return f.type === 'signature' ? (v ? 'Signed' : '') : formatValue(f, v);
}
async function go(i) {
  index.value = Math.max(0, Math.min(i, steps.value.length));
  furthest.value = Math.max(furthest.value, index.value);
  await nextTick();
  body.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function next() {
  const errs = validate(current.value.shown, props.modelValue);
  errors.value = { ...errors.value, ...errs };
  if (Object.keys(errs).length) {
    nextTick(() => document.getElementById('fld-' + Object.keys(errs)[0])?.focus());
    return;
  }
  go(index.value + 1);
}
function submit() {
  const errs = validate(props.fields, props.modelValue);
  errors.value = errs;
  const bad = steps.value.findIndex(s => s.shown.some(f => errs[f.id]));
  if (bad >= 0) { go(bad); return; }
  emit('submit');
}
defineExpose({ go });
</script>

<style scoped>
.wz { max-width: 860px; margin: 0 auto; display: grid; gap: 16px; }
.wz-head { display: grid; gap: 6px; }
.wz-title { font-size: 26px; font-weight: 700; letter-spacing: -.01em; }
.wz-sub { color: var(--muted); font-size: 13px; }
.wz-bar { height: 6px; border-radius: 999px; background: var(--line); overflow: hidden; margin-top: 4px; }
.wz-bar span { display: block; height: 100%; background: var(--accent); border-radius: 999px; transition: width .35s cubic-bezier(.2,.7,.3,1); }
.wz-steps { list-style: none; display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0 0; padding: 0; }
.wz-steps button { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--border); background: var(--surface); border-radius: 999px;
  padding: 4px 10px 4px 4px; font: inherit; font-size: 12px; color: var(--text-2); cursor: pointer; }
.wz-steps button:disabled { cursor: default; opacity: .55; }
.wz-num { width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; background: var(--chip); font-size: 11px; font-weight: 700; }
.wz-steps .done .wz-num { background: var(--green); color: #fff; }
.wz-steps .on button { border-color: var(--accent); color: var(--accent); font-weight: 600; }
.wz-steps .on .wz-num { background: var(--accent); color: #fff; }
@media (max-width: 640px) { .wz-name { display: none; } .wz-steps button { padding: 4px; } .wz-title { font-size: 22px; } }
.wz-body { padding: 24px; scroll-margin-top: 80px; }
.wz-body h2 { margin: 0 0 6px; font-size: 18px; }
.wz-intro { color: var(--text-2); margin: 0 0 16px; white-space: pre-line; }
.wz-locked { color: var(--muted); font-size: 12px; margin: 8px 0 0; }
.wz-review { border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; margin-bottom: 10px; }
.wz-review-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.wz-review dl { display: grid; grid-template-columns: minmax(120px, 38%) 1fr; gap: 6px 14px; margin: 0; font-size: 13px; }
.wz-review dt { color: var(--muted); }
.wz-review dd { margin: 0; overflow-wrap: anywhere; white-space: pre-line; }
.wz-review .empty { color: var(--muted); }
.wz-sig { height: 44px; background: #fff; border: 1px solid var(--line); border-radius: 6px; }
@media (max-width: 520px) { .wz-review dl { grid-template-columns: minmax(0, 1fr); gap: 2px; } .wz-review dd { margin-bottom: 6px; } }
.wz-agree { display: flex; gap: 10px; align-items: flex-start; margin-top: 16px; padding: 12px 14px; border-radius: 10px; background: var(--accent-soft); cursor: pointer; font-size: 14px; }
.wz-agree input { width: 18px; height: 18px; margin-top: 2px; accent-color: var(--accent); flex: none; }
.wz-foot { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; position: sticky; bottom: 0; padding: 12px 0; background: linear-gradient(transparent, var(--bg) 30%); }
.wz-foot .grow { flex: 1; }
.wz-foot .btn { height: 44px; padding: 0 20px; }
.wz-submit { min-width: 160px; }
</style>
