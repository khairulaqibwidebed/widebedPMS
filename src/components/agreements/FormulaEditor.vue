<template>
  <div class="fx">
    <div class="fx-box">
      <textarea ref="box" class="input fx-input" rows="3" spellcheck="false" :value="text" :disabled="disabled"
        placeholder="e.g. [Monthly Rental] * 2" aria-label="Formula"
        @input="onInput" @keydown="onKey" @click="refresh" @keyup="onKeyUp" @blur="hideSoon"></textarea>
      <ul class="fx-suggest" v-if="open && sug && sug.items.length" role="listbox">
        <li v-for="(it, i) in sug.items" :key="it.insert + i" :class="{ sel: i === sel }" role="option" :aria-selected="i === sel" @mousedown.prevent="apply(it)">
          <b>{{ it.label }}</b><small>{{ it.hint }}</small>
        </li>
      </ul>
    </div>
    <div class="fx-status" :class="status.kind">{{ status.text }}</div>
    <p class="help">Type <b>[</b> to pick a field. Use + − * / and functions such as ROUND, IF, SUM or ADD_MONTHS. <b>10%</b> means 0.10.</p>
    <details class="fx-help">
      <summary>All functions</summary>
      <dl><template v-for="f in FUNCTION_LIST" :key="f.name"><dt>{{ f.usage }}</dt><dd>{{ f.help }}</dd></template></dl>
    </details>
  </div>
</template>

<script setup>
// Formula box with field and function suggestions, error messages and a live answer.
// Shows field names; saves the formula with field ids (so renaming a field never breaks it).
import { ref, computed, watch, nextTick } from 'vue';
import { toStored, toDisplay, parse, computeValues, suggest, FUNCTION_LIST, FormulaError } from '@/lib/agreements/formula.js';
import { formatValue } from '@/lib/agreements/format.js';

const props = defineProps({
  modelValue: { type: String, default: '' },   // stored formula
  fields: { type: Array, required: true },
  field: { type: Object, required: true },      // the formula field being edited
  sample: { type: Object, default: () => ({}) }, // values to show the answer with
  disabled: Boolean
});
const emit = defineEmits(['update:modelValue']);

const box = ref(null), text = ref(toDisplay(props.modelValue, props.fields)), problem = ref('');
const sug = ref(null), sel = ref(0), open = ref(false);

// Undo or a renamed field changes the saved formula: show it again with the current names.
watch(() => [props.modelValue, props.fields.map(f => f.label).join('\u0001')], () => {
  let current = null;
  try { current = toStored(text.value, props.fields); } catch (_) {}
  if (current !== props.modelValue) { text.value = toDisplay(props.modelValue, props.fields); problem.value = ''; }
});

function check(value) {
  if (!value.trim()) { problem.value = ''; emit('update:modelValue', ''); return; }
  try {
    const stored = toStored(value, props.fields);
    parse(stored);
    problem.value = '';
    if (stored !== props.modelValue) emit('update:modelValue', stored);
  } catch (e) {
    if (!(e instanceof FormulaError)) throw e;
    problem.value = e.message;
  }
}
function onInput(e) { text.value = e.target.value; check(text.value); refresh(); }

const status = computed(() => {
  if (problem.value) return { kind: 'bad', text: problem.value + ' (not saved yet)' };
  if (!props.modelValue) return { kind: '', text: 'No formula yet.' };
  const fields = props.fields.map(f => (f.id === props.field.id ? { ...props.field, expr: props.modelValue } : f));
  const v = computeValues(fields, props.sample)[props.field.id];
  if (v && v.error) return { kind: 'bad', text: `${v.error} ${v.message}` };
  const shown = formatValue({ ...props.field, expr: props.modelValue }, v);
  return { kind: 'ok', text: '= ' + (shown === '' ? '(blank)' : shown) + '  with the sample data' };
});

// ---- Suggestions ----
function refresh() {
  const el = box.value;
  if (!el) return;
  sug.value = suggest(el.value.slice(0, el.selectionStart), props.fields.filter(f => f.id !== props.field.id));
  sel.value = 0;
  open.value = !!sug.value;
}
function onKeyUp(e) { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) refresh(); }
function onKey(e) {
  if (!open.value || !sug.value?.items.length) return;
  if (e.key === 'ArrowDown') { e.preventDefault(); sel.value = (sel.value + 1) % sug.value.items.length; }
  else if (e.key === 'ArrowUp') { e.preventDefault(); sel.value = (sel.value - 1 + sug.value.items.length) % sug.value.items.length; }
  else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); apply(sug.value.items[sel.value]); }
  else if (e.key === 'Escape') { open.value = false; }
}
async function apply(item) {
  const el = box.value, caret = el.selectionStart;
  let end = caret;
  if (item.insert.startsWith('[')) { const close = el.value.indexOf(']', caret); const nextOpen = el.value.indexOf('[', caret); if (close >= 0 && (nextOpen < 0 || close < nextOpen)) end = close + 1; }
  text.value = el.value.slice(0, sug.value.from) + item.insert + el.value.slice(end);
  const pos = sug.value.from + item.insert.length;
  open.value = false;
  check(text.value);
  await nextTick();
  el.focus(); el.setSelectionRange(pos, pos);
}
let blurTimer = null;
function hideSoon() { clearTimeout(blurTimer); blurTimer = setTimeout(() => { open.value = false; }, 150); }
</script>

<style scoped>
.fx { display: grid; gap: 6px; }
.fx-box { position: relative; }
.fx-input { height: auto; min-height: 72px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 13px; }
.fx-suggest { position: absolute; left: 0; right: 0; top: calc(100% + 4px); z-index: 20; list-style: none; margin: 0; padding: 4px; max-height: 240px; overflow-y: auto;
  background: var(--surface); border: 1px solid var(--border); border-radius: 10px; box-shadow: 0 12px 28px rgba(0,0,0,.14); }
.fx-suggest li { display: grid; gap: 1px; padding: 6px 8px; border-radius: 6px; cursor: pointer; }
.fx-suggest li b { font-size: 13px; font-weight: 600; }
.fx-suggest li small { color: var(--muted); font-size: 11px; }
.fx-suggest li.sel { background: var(--accent-soft); color: var(--accent); }
.fx-status { font-size: 12px; padding: 6px 10px; border-radius: 8px; background: var(--hover); color: var(--text-2); font-variant-numeric: tabular-nums; }
.fx-status.ok { background: var(--green-soft); color: var(--green); }
.fx-status.bad { background: var(--red-soft); color: var(--red); }
.fx-help summary { cursor: pointer; font-size: 12px; color: var(--accent); font-weight: 600; }
.fx-help dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; margin: 8px 0 0; font-size: 12px; }
.fx-help dt { font-family: ui-monospace, Menlo, Consolas, monospace; color: var(--text); }
.fx-help dd { margin: 0; color: var(--muted); }
</style>
