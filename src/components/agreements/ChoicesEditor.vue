<template>
  <div class="ce">
    <div v-for="(o, i) in modelValue" :key="i" class="ce-row">
      <input :ref="el => (inputs[i] = el)" class="input ce-input" :class="{ bad: dup(i) }" :value="o" :placeholder="'Choice ' + (i + 1)" :aria-label="'Choice ' + (i + 1)"
        maxlength="200" @focus="editing = { i, from: o }" @blur="commit(i)" @input="setText(i, $event.target.value)" @keydown="onKey($event, i)" @paste="onPaste($event, i)">
      <button type="button" class="icon-btn ce-btn" title="Move up (Alt+↑)" aria-label="Move up" :disabled="i === 0" @click="move(i, -1)">↑</button>
      <button type="button" class="icon-btn ce-btn" title="Move down (Alt+↓)" aria-label="Move down" :disabled="i === modelValue.length - 1" @click="move(i, 1)">↓</button>
      <button type="button" class="icon-btn ce-btn" title="Remove" aria-label="Remove" :disabled="modelValue.length < 2" @click="remove(i)">✕</button>
      <span class="ag-error ce-err" v-if="dup(i)">Same as another choice</span>
    </div>
    <div class="ce-links">
      <button type="button" class="link" @click="add(modelValue.length - 1)">+ Add choice</button>
      <button type="button" class="link" @click="pasting = !pasting">Paste a list</button>
    </div>
    <div v-if="pasting" class="ce-paste">
      <textarea class="input" rows="4" v-model="pasteText" placeholder="One choice per line" aria-label="Choices, one per line"></textarea>
      <button type="button" class="btn btn-sm" :disabled="!pasteText.trim()" @click="addMany(pasteText.split('\n'), modelValue.length); pasteText = ''; pasting = false">Add these</button>
      <button type="button" class="btn btn-sm" @click="pasting = false">Cancel</button>
    </div>
    <span class="ag-error" v-if="!modelValue.some(o => o.trim())">Add at least one choice.</span>
    <span class="help" v-else>Enter adds the next choice. Backspace on an empty one removes it.</span>
  </div>
</template>

<script setup>
// The choices of a dropdown / choice buttons field: one box per choice (12 Nov 2026; before, one text box with a line each).
// While typing, the list is kept exactly as typed (spaces, an empty new row); cleanOptions() tidies it for saving and the form.
//   rename { from, to }  a choice's text changed (sent when you leave the box), so the form builder can update rules that use it
//   remove i             asks the form builder to remove choice i (it may confirm first when a rule uses it)
import { ref, nextTick } from 'vue';

const props = defineProps({ modelValue: { type: Array, required: true } });
const emit = defineEmits(['update:modelValue', 'rename', 'remove']);
const inputs = ref([]), pasting = ref(false), pasteText = ref('');
let editing = null;   // { i, from }: the box being typed in and what it said before

const low = s => String(s).trim().toLowerCase();
const dup = i => !!low(props.modelValue[i]) && props.modelValue.findIndex(o => low(o) === low(props.modelValue[i])) !== i;
const set = list => emit('update:modelValue', list);
const focus = i => nextTick(() => { const el = inputs.value[i]; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } });

function setText(i, text) { const list = [...props.modelValue]; list[i] = text; set(list); }
// Leaving a box (or before moving rows around): tell the builder if the choice was renamed.
function commit(i) {
  if (!editing || editing.i !== i) return;
  const from = editing.from.trim(), to = String(props.modelValue[i] ?? '').trim();
  editing = null;
  if (from && to && from !== to) emit('rename', { from, to });
}
function add(i) { commit(i); const list = [...props.modelValue]; list.splice(i + 1, 0, ''); set(list); focus(i + 1); }
function addMany(lines, at) {
  const extra = lines.map(s => s.trim()).filter(Boolean);
  if (!extra.length) return;
  const list = [...props.modelValue]; list.splice(at, 0, ...extra);
  set(list.filter((o, k) => o.trim() || (k >= at && k < at + extra.length)));   // empty rows go once a list is pasted
}
function move(i, step) {
  const j = i + step;
  if (j < 0 || j >= props.modelValue.length) return;
  commit(i);
  const list = [...props.modelValue]; [list[i], list[j]] = [list[j], list[i]]; set(list); focus(j);
}
function remove(i, thenFocus) {
  if (props.modelValue.length < 2) return;
  if (editing?.i === i) editing = null;
  emit('remove', i);
  if (thenFocus !== undefined) focus(thenFocus);
}
function onKey(e, i) {
  if (e.isComposing) return;
  if (e.key === 'Enter') { e.preventDefault(); add(i); }
  else if (e.key === 'Backspace' && e.target.value === '' && props.modelValue.length > 1) { e.preventDefault(); remove(i, Math.max(0, i - 1)); }
  else if (e.altKey && e.key === 'ArrowUp') { e.preventDefault(); move(i, -1); }
  else if (e.altKey && e.key === 'ArrowDown') { e.preventDefault(); move(i, 1); }
  else if (!e.altKey && e.key === 'ArrowUp' && i > 0) { e.preventDefault(); focus(i - 1); }
  else if (!e.altKey && e.key === 'ArrowDown' && i < props.modelValue.length - 1) { e.preventDefault(); focus(i + 1); }
}
// Pasting several lines into a box makes one choice per line.
function onPaste(e, i) {
  const text = e.clipboardData?.getData('text') || '';
  if (!/[\r\n]/.test(text.trim())) return;
  e.preventDefault(); commit(i);
  addMany(text.split(/\r?\n/), props.modelValue[i].trim() ? i + 1 : i);
}
</script>

<style scoped>
.ce { display: grid; gap: 4px; }
.ce-row { display: grid; grid-template-columns: minmax(0, 1fr) 26px 26px 26px; align-items: center; gap: 2px; }
.ce-input { height: 34px; }
.ce-input.bad { border-color: var(--red); }
.ce-btn { width: 26px; height: 26px; font-size: 13px; }
.ce-btn:disabled { opacity: .3; cursor: default; }
.ce-err { grid-column: 1 / -1; }
.ce-links { display: flex; gap: 14px; margin: 2px 0; }
.ce-links .link { font-size: 12px; }
.ce-paste { display: flex; flex-wrap: wrap; gap: 6px; }
.ce-paste textarea { flex-basis: 100%; }
</style>
