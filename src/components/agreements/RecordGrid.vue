<template>
  <div class="grid-tools">
    <input class="input grid-search" type="search" :value="view.search || ''" placeholder="Search records" aria-label="Search records" @input="patch({ search: $event.target.value })">
    <template v-for="(f, i) in view.filters || []" :key="i">
      <span class="chip grid-chip">{{ labelOf(f.key) }} {{ OPS[f.op] }} {{ ['empty', 'notEmpty'].includes(f.op) ? '' : '"' + f.value + '"' }}
        <button type="button" aria-label="Remove filter" @click="removeFilter(i)">×</button></span>
    </template>
    <div class="grid-menu-wrap">
      <button type="button" class="btn btn-sm" @click="colsOpen = !colsOpen" :aria-expanded="String(colsOpen)">Columns</button>
      <div class="grid-pop" v-if="colsOpen" @keydown.esc="colsOpen = false">
        <label v-for="c in ordered" :key="c.key" class="grid-pop-check"><input type="checkbox" :checked="!isHidden(c.key)" @change="toggleHidden(c.key)"> {{ c.label }}</label>
        <div class="grid-pop-foot"><button type="button" class="link" @click="patch({ hidden: [] })">Show all</button><button type="button" class="link" @click="colsOpen = false">Done</button></div>
      </div>
    </div>
    <span class="note">{{ shown.length }} of {{ rows.length }} rows</span>
  </div>

  <div class="table-wrap grid-wrap">
    <table class="table grid" :style="{ width: totalWidth + 'px' }">
      <colgroup><col style="width: 84px"><col v-for="c in cols" :key="c.key" :style="{ width: c.width + 'px' }"><col v-if="canEditColumns" style="width: 48px"></colgroup>
      <thead>
        <tr>
          <th class="grid-sel">
            <input type="checkbox" aria-label="Select all shown rows" :checked="allSelected" :indeterminate.prop="someSelected" @change="selectAll($event.target.checked)">
          </th>
          <th v-for="c in cols" :key="c.key" :class="{ dragover: dragOver === c.key }" draggable="true"
            @dragstart="dragKey = c.key" @dragend="dragKey = null; dragOver = null" @dragover.prevent="dragOver = c.key" @dragleave="dragOver = null" @drop.prevent="dropOn(c.key)">
            <div class="grid-th">
              <button type="button" class="grid-th-label" :title="'Sort by ' + c.label" @click="cycleSort(c.key)">
                {{ c.label }}<span class="grid-sort" v-if="view.sort?.key === c.key">{{ view.sort.dir === 'asc' ? '▲' : '▼' }}</span>
                <span class="grid-fx" v-if="c.field?.type === 'formula'" title="Formula">ƒ</span>
              </button>
              <button type="button" class="grid-th-menu" :aria-label="'Column options: ' + c.label" @click="openMenu(c)">⋮</button>
            </div>
            <span class="grid-resize" @pointerdown.stop.prevent="startResize($event, c)" @click.stop @dragstart.prevent></span>
          </th>
          <th v-if="canEditColumns" class="grid-add"><button type="button" class="btn btn-sm" title="Add a column" aria-label="Add a column" @click="emit('column', { action: 'add' })">+</button></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in shown" :key="r.id" :class="{ picked: selected.includes(r.id) }">
          <td class="grid-sel">
            <input type="checkbox" :aria-label="'Select ' + r.record.title" :checked="selected.includes(r.id)" @change="toggleRow(r.id, $event.target.checked)">
            <button type="button" class="link grid-open" @click="emit('open', r.id)">Open</button>
          </td>
          <td v-for="c in cols" :key="c.key" :class="cellClass(r, c)" :tabindex="editable(c) ? 0 : -1"
            @dblclick="editable(c) ? begin(r, c) : emit('open', r.id)" @keydown.enter.prevent="editable(c) && begin(r, c)">
            <template v-if="isEditing(r, c)">
              <select v-if="c.key === '_status'" ref="editor" class="input grid-edit" :value="draft" @change="draft = $event.target.value; commit()" @blur="commit" @keydown.esc="cancel">
                <option v-for="(l, k) in STATUS" :key="k" :value="k">{{ l }}</option>
              </select>
              <select v-else-if="hasOptions(c.field)" ref="editor" class="input grid-edit" :value="draft" @change="draft = $event.target.value; commit()" @blur="commit" @keydown.esc="cancel">
                <option value="">—</option>
                <option v-for="o in optionsWith(c.field, draft)" :key="o" :value="o">{{ o }}</option>
              </select>
              <input v-else ref="editor" class="input grid-edit" :type="inputType(c.field)" :step="['number', 'currency'].includes(c.field.type) ? 'any' : null" :value="draft"
                @input="draft = $event.target.value" @keydown.enter.prevent="commit" @keydown.esc="cancel" @blur="commit">
            </template>
            <button v-else-if="c.field?.type === 'checkbox'" type="button" class="grid-tick" :aria-pressed="String(!!r.values[c.key])" :aria-label="c.label"
              @click="emit('edit', r.id, c.key, !(r.values[c.key] === true || r.values[c.key] === 'true'))">{{ r.values[c.key] === true || r.values[c.key] === 'true' ? '✓' : '' }}</button>
            <span v-else-if="c.key === '_status'" class="pill" :class="STATUS_PILL[r.record.status]">{{ STATUS[r.record.status] || r.record.status }}</span>
            <span v-else :title="titleOf(r, c)">{{ textOf(r, c) }}</span>
          </td>
          <td v-if="canEditColumns"></td>
        </tr>
      </tbody>
    </table>
    <p v-if="!shown.length" class="grid-empty">{{ rows.length ? 'No records match the search or filters.' : 'No records yet. Use "+ New" above or import a CSV / Excel file.' }}</p>
  </div>

  <!-- Column options -->
  <div class="modal-back" v-if="menu" @click.self="menu = null" @keydown.esc="menu = null">
    <div class="modal grid-col-modal" role="dialog" :aria-label="'Column: ' + menu.label">
      <h2>{{ menu.label }}</h2>
      <div class="grid-col-row">
        <button type="button" class="btn btn-sm" @click="setSort(menu.key, 'asc')">Sort A → Z / small → big</button>
        <button type="button" class="btn btn-sm" @click="setSort(menu.key, 'desc')">Sort Z → A / big → small</button>
        <button type="button" class="btn btn-sm" @click="toggleHidden(menu.key); menu = null">Hide column</button>
      </div>
      <div class="field">
        <label>Filter</label>
        <div class="grid-col-row">
          <select class="input select" v-model="menu.op" aria-label="Filter type"><option v-for="(l, k) in OPS" :key="k" :value="k">{{ l }}</option></select>
          <input v-if="!['empty', 'notEmpty'].includes(menu.op)" class="input" :type="menu.field && valueType(menu.field) === 'date' ? 'date' : 'text'" v-model="menu.value" aria-label="Filter value" @keydown.enter="addFilter">
          <button type="button" class="btn btn-sm btn-primary" @click="addFilter">Add filter</button>
        </div>
      </div>
      <template v-if="canEditColumns && menu.field">
        <hr class="divider">
        <div class="field">
          <label for="colName">Column name</label>
          <div class="grid-col-row">
            <input id="colName" class="input" v-model="menu.label2" @keydown.enter="rename">
            <button type="button" class="btn btn-sm" :disabled="menu.label2.trim() === menu.label" @click="rename">Rename</button>
          </div>
          <span class="help">Formulas and placed fields keep working after a rename.</span>
        </div>
        <div class="field" v-if="CHANGEABLE.includes(menu.field.type)">
          <label for="colType">Type</label>
          <select id="colType" class="input select" :value="menu.field.type" @change="emit('column', { action: 'type', key: menu.key, type: $event.target.value }); menu = null">
            <option v-for="t in CHANGEABLE" :key="t" :value="t">{{ TYPE_LABEL[t] }}</option>
          </select>
        </div>
        <p class="help" v-else>Change this column's settings in the form builder.</p>
      </template>
      <div class="modal-foot">
        <button v-if="canEditColumns && menu.field" type="button" class="btn btn-danger" @click="emit('column', { action: 'delete', key: menu.key }); menu = null">Delete column</button>
        <button type="button" class="btn" @click="menu = null">Close</button>
      </div>
    </div>
  </div>
</template>

<script setup>
// The spreadsheet of records: search, filters, sort, resize, drag to reorder, hide columns, edit cells in place.
// Column layout lives in `view` (saved as a table view); rows are { id, record, values } with formulas worked out.
import { ref, computed, nextTick } from 'vue';
import { formatValue, valueType, parseInput } from '@/lib/agreements/format.js';
import { hasValue, hasOptions, isEditableInGrid, TYPE_LABEL } from '@/lib/agreements/fields.js';
import { millis } from '@/lib/agreements/data.js';

const props = defineProps({
  fields: { type: Array, required: true },
  rows: { type: Array, required: true },
  view: { type: Object, required: true },
  selected: { type: Array, default: () => [] },
  canEditColumns: Boolean
});
const emit = defineEmits(['update:view', 'update:selected', 'edit', 'open', 'column']);

const STATUS = { draft: 'Draft', completed: 'Completed', archived: 'Archived' };
const STATUS_PILL = { draft: 'amber', completed: 'green', archived: 'grey' };
const OPS = { contains: 'contains', equals: 'is', notEquals: 'is not', gt: 'more than', lt: 'less than', empty: 'is empty', notEmpty: 'is not empty' };
const CHANGEABLE = ['text', 'textarea', 'email', 'phone', 'number', 'currency', 'date', 'dropdown', 'radio', 'checkbox'];
const BUILTIN = [{ key: '_status', label: 'Status' }, { key: '_updated', label: 'Last updated' }];

const patch = p => emit('update:view', { ...props.view, ...p });

// ---- Columns ----
const allCols = computed(() => [...props.fields.filter(hasValue).map(f => ({ key: f.id, label: f.label, field: f })), ...BUILTIN]);
const ordered = computed(() => {
  const byKey = new Map(allCols.value.map(c => [c.key, c]));
  const order = (props.view.order || []).filter(k => byKey.has(k));
  return [...order.map(k => byKey.get(k)), ...allCols.value.filter(c => !order.includes(c.key))];
});
const isHidden = k => (props.view.hidden || []).includes(k);
const defaultWidth = c => (c.key === '_updated' ? 170 : c.key === '_status' ? 120 : ['textarea', 'signature'].includes(c.field?.type) ? 220 : ['checkbox'].includes(c.field?.type) ? 90 : 160);
const cols = computed(() => ordered.value.filter(c => !isHidden(c.key)).map(c => ({ ...c, width: props.view.widths?.[c.key] || defaultWidth(c) })));
const totalWidth = computed(() => 84 + cols.value.reduce((s, c) => s + c.width, 0) + (props.canEditColumns ? 48 : 0));
const labelOf = k => allCols.value.find(c => c.key === k)?.label || 'Deleted column';
function toggleHidden(k) { const h = new Set(props.view.hidden || []); h.has(k) ? h.delete(k) : h.add(k); patch({ hidden: [...h] }); }

// ---- Cell text ----
const when = t => { const ms = millis(t); return ms ? new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''; };
function textOf(r, c) {
  if (c.key === '_updated') return when(r.record.updatedAt) + (r.record.updatedByName ? ' · ' + r.record.updatedByName : '');
  if (c.key === '_status') return STATUS[r.record.status] || r.record.status;
  return formatValue(c.field, r.values[c.key]);
}
const titleOf = (r, c) => { const v = r.values[c.key]; return v && v.error ? v.message : textOf(r, c); };
const cellClass = (r, c) => ({
  num: c.field && ['number', 'currency'].includes(valueType(c.field)),
  err: !!r.values[c.key]?.error,
  fx: c.field?.type === 'formula',
  editing: isEditing(r, c)
});

// ---- Search, filters, sort ----
function sortKey(r, c) {
  if (c.key === '_updated') return millis(r.record.updatedAt);
  if (c.key === '_status') return r.record.status || '';
  const v = r.values[c.key];
  if (v === '' || v === null || v === undefined || v?.error) return null;
  const t = valueType(c.field);
  if (t === 'number' || t === 'currency') return Number(v);
  if (t === 'date') return String(v);
  return textOf(r, c).toLowerCase();
}
function passes(r, f) {
  const c = allCols.value.find(x => x.key === f.key);
  if (!c) return true;
  const key = sortKey(r, c), text = textOf(r, c).toLowerCase(), want = String(f.value ?? '').toLowerCase();
  switch (f.op) {
    case 'empty': return key === null || text === '';
    case 'notEmpty': return !(key === null || text === '');
    case 'equals': return text === want || String(r.values[f.key] ?? '').toLowerCase() === want;
    case 'notEquals': return !(text === want || String(r.values[f.key] ?? '').toLowerCase() === want);
    case 'gt': case 'lt': {
      if (key === null) return false;
      const b = typeof key === 'number' ? Number(String(f.value).replace(/[^\d.-]/g, '')) : want;
      return f.op === 'gt' ? key > b : key < b;
    }
    default: return text.includes(want);
  }
}
const shown = computed(() => {
  const q = String(props.view.search || '').trim().toLowerCase();
  let list = props.rows.filter(r => (props.view.filters || []).every(f => passes(r, f)));
  if (q) list = list.filter(r => cols.value.some(c => textOf(r, c).toLowerCase().includes(q)));
  const s = props.view.sort, col = s && allCols.value.find(c => c.key === s.key);
  if (col) {
    const dir = s.dir === 'desc' ? -1 : 1;
    list = [...list].sort((a, b) => {
      const x = sortKey(a, col), y = sortKey(b, col);
      if (x === null && y === null) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
  }
  return list;
});
function cycleSort(key) {
  const s = props.view.sort;
  patch({ sort: s?.key !== key ? { key, dir: 'asc' } : s.dir === 'asc' ? { key, dir: 'desc' } : null });
}
const setSort = (key, dir) => { patch({ sort: { key, dir } }); menu.value = null; };

// ---- Column menu ----
const menu = ref(null), colsOpen = ref(false);
const openMenu = c => { menu.value = { key: c.key, label: c.label, label2: c.label, field: c.field || null, op: 'contains', value: '' }; };
function addFilter() {
  const m = menu.value;
  if (!['empty', 'notEmpty'].includes(m.op) && String(m.value).trim() === '') return;
  patch({ filters: [...(props.view.filters || []), { key: m.key, op: m.op, value: m.value }] });
  menu.value = null;
}
const removeFilter = i => patch({ filters: (props.view.filters || []).filter((_, j) => j !== i) });
function rename() {
  const label = menu.value.label2.trim();
  if (!label || label === menu.value.label) return;
  emit('column', { action: 'rename', key: menu.value.key, label });
  menu.value = null;
}

// ---- Resize and reorder ----
function startResize(e, c) {
  const startX = e.clientX, startW = c.width;
  let w = startW;
  const move = ev => { w = Math.max(70, Math.min(700, startW + ev.clientX - startX)); e.target.closest('table').querySelectorAll('col')[cols.value.indexOf(c) + 1].style.width = w + 'px'; };
  const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); patch({ widths: { ...(props.view.widths || {}), [c.key]: w } }); };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}
const dragKey = ref(null), dragOver = ref(null);
function dropOn(target) {
  const from = dragKey.value;
  dragKey.value = null; dragOver.value = null;
  if (!from || from === target) return;
  const keys = ordered.value.map(c => c.key).filter(k => k !== from);
  keys.splice(keys.indexOf(target), 0, from);
  patch({ order: keys });
}

// ---- Selecting rows ----
const allSelected = computed(() => shown.value.length > 0 && shown.value.every(r => props.selected.includes(r.id)));
const someSelected = computed(() => !allSelected.value && shown.value.some(r => props.selected.includes(r.id)));
const selectAll = on => emit('update:selected', on ? shown.value.map(r => r.id) : []);
const toggleRow = (id, on) => emit('update:selected', on ? [...props.selected, id] : props.selected.filter(x => x !== id));

// ---- Editing a cell ----
const editing = ref(null), draft = ref(''), editor = ref(null);
const editable = c => c.key === '_status' || (c.field && isEditableInGrid(c.field) && c.field.type !== 'checkbox');
const isEditing = (r, c) => editing.value && editing.value.id === r.id && editing.value.key === c.key;
const inputType = f => ({ number: 'number', currency: 'number', date: 'date', email: 'email', phone: 'tel' }[f.type] || 'text');
const optionsWith = (f, v) => (v && !f.options.includes(v) ? [...f.options, v] : f.options);
async function begin(r, c) {
  editing.value = { id: r.id, key: c.key, field: c.field };
  draft.value = c.key === '_status' ? r.record.status : r.values[c.key] ?? '';
  await nextTick();
  const el = Array.isArray(editor.value) ? editor.value[0] : editor.value;
  el?.focus();
}
function commit() {
  const e = editing.value;
  if (!e) return;
  editing.value = null;
  const row = props.rows.find(r => r.id === e.id);
  if (e.key === '_status') { if (draft.value !== row.record.status) emit('edit', e.id, '_status', draft.value); return; }
  const v = parseInput(e.field, draft.value);
  if (v === undefined) return;
  if (v !== (row.values[e.key] ?? '')) emit('edit', e.id, e.key, v);
}
const cancel = () => { editing.value = null; };

// Records.vue exports exactly what is on screen: these columns, in this order, with search/filters/sort applied.
defineExpose({ exportRows: () => ({ cols: cols.value, rows: shown.value }) });
</script>

<style scoped>
.grid-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 10px; }
.grid-search { max-width: 260px; height: 34px; }
.grid-chip { display: inline-flex; align-items: center; gap: 6px; }
.grid-chip button { border: 0; background: none; color: var(--muted); font-size: 15px; line-height: 1; padding: 0; }
.grid-menu-wrap { position: relative; }
.grid-pop { position: absolute; z-index: 30; top: calc(100% + 6px); left: 0; width: 240px; max-height: 340px; overflow-y: auto; padding: 8px; background: var(--surface);
  border: 1px solid var(--border); border-radius: 10px; box-shadow: 0 12px 28px rgba(0,0,0,.14); }
.grid-pop-check { display: flex; gap: 8px; align-items: center; padding: 5px 4px; font-size: 13px; }
.grid-pop-foot { display: flex; justify-content: space-between; border-top: 1px solid var(--line); margin-top: 6px; padding-top: 8px; }
.grid-wrap { max-height: calc(100vh - 280px); min-height: 220px; overflow: auto; }
.grid { table-layout: fixed; }
.grid th { position: sticky; top: 0; z-index: 2; padding: 0; user-select: none; }
.grid th.dragover { box-shadow: inset 3px 0 0 var(--accent); }
.grid-th { display: flex; align-items: center; height: 38px; }
.grid-th-label { flex: 1; min-width: 0; height: 100%; border: 0; background: none; text-align: left; padding: 0 4px 0 12px; font: inherit; font-size: 12px; font-weight: 600; color: var(--text-2);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
.grid-th-label:hover { color: var(--accent); }
.grid-sort { margin-left: 4px; font-size: 9px; color: var(--accent); }
.grid-fx { margin-left: 6px; font-style: italic; color: var(--accent); font-weight: 700; }
.grid-th-menu { flex: none; width: 24px; height: 28px; border: 0; background: none; color: var(--muted); border-radius: 6px; margin-right: 6px; }
.grid-th-menu:hover { background: var(--accent-soft); color: var(--accent); }
.grid-resize { position: absolute; top: 0; right: -3px; width: 7px; height: 100%; cursor: col-resize; z-index: 3; }
.grid-resize:hover { background: color-mix(in srgb, var(--accent) 35%, transparent); }
.grid td { padding: 8px 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; height: 40px; }
.grid td.num { text-align: right; font-variant-numeric: tabular-nums; }
.grid td.fx { background: color-mix(in srgb, var(--accent-soft) 35%, transparent); }
.grid td.err { color: var(--red); }
.grid td.editing { padding: 2px; overflow: visible; }
.grid td:focus { outline: 2px solid var(--accent); outline-offset: -2px; }
.grid-sel { position: sticky; left: 0; z-index: 1; background: var(--surface); white-space: nowrap; }
th.grid-sel { z-index: 3; background: var(--head); padding: 0 12px !important; }
.grid-sel input { vertical-align: middle; margin-right: 8px; }
.grid-open { font-size: 12px; }
.grid-add { text-align: center; }
.grid-edit { height: 34px; width: 100%; }
.grid-tick { width: 100%; height: 24px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); color: var(--accent); font-weight: 700; }
.grid-empty { position: sticky; left: 0; max-width: 100vw; margin: 0; padding: 32px 16px; text-align: center; color: var(--muted); font-size: 13px; }
.grid-col-modal { max-width: 520px; }
.grid-col-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 12px; }
.grid-col-row .input { flex: 1; min-width: 140px; height: 34px; }
</style>
