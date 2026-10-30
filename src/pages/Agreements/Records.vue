<template>
  <main class="content">
    <div class="loading-bar" v-show="loading"></div>
    <div class="page-head">
      <div>
        <h1>Agreements</h1>
        <div class="sub">Fill in agreement forms, keep every record in one table, and make the finished PDF.</div>
      </div>
      <div class="head-tools">
        <RouterLink v-if="isAdmin" class="btn" to="/Agreements/setup">Setup</RouterLink>
        <button class="btn btn-primary" :disabled="!form" @click="newRecord">+ New {{ form ? form.name : 'record' }}</button>
      </div>
    </div>

    <div class="notice error" v-if="error">{{ error }}</div>
    <div class="notice ok" v-if="okMsg">{{ okMsg }}</div>

    <div v-if="!loading && !forms.length" class="card ag-empty">
      <b>No agreement forms yet</b>
      {{ isAdmin ? 'Create a form and upload its agreement template in Setup.' : 'Ask a Director to set up the agreement forms.' }}
      <div v-if="isAdmin" style="margin-top: 14px"><RouterLink class="btn btn-primary" to="/Agreements/setup">Open Setup</RouterLink></div>
    </div>

    <template v-else-if="form">
      <div class="pills brand ag-tabs" role="tablist" aria-label="Forms">
        <button v-for="f in forms" :key="f.id" class="pill-btn" role="tab" :aria-selected="String(f.id === formId)" :class="{ on: f.id === formId }" @click="formId = f.id">{{ f.name }}</button>
      </div>

      <div class="card rec-card">
        <div class="ag-bar rec-bar">
          <div class="pills" role="group" aria-label="Status">
            <button v-for="s in STATUS_TABS" :key="s.key" class="pill-btn" :class="{ on: status === s.key }" @click="status = s.key">{{ s.label }} ({{ countOf(s.key) }})</button>
          </div>
          <span class="grow"></span>
          <label class="sr-only" for="viewPick">Table view</label>
          <select id="viewPick" class="select" :value="viewId" @change="pickView($event.target.value)">
            <option value="">Default view</option>
            <option v-for="v in views" :key="v.id" :value="v.id">{{ v.name }}</option>
          </select>
          <button class="btn btn-sm" :disabled="!viewChanged" @click="saveCurrentView">{{ viewId ? 'Save view' : 'Save as view' }}</button>
          <button class="btn btn-sm" v-if="viewId" @click="ask = { kind: 'viewName', title: 'Save as a new view', value: currentViewName + ' copy' }">Save as new</button>
          <button class="btn btn-sm" v-if="viewId" @click="removeView">Delete view</button>
        </div>

        <div class="ag-bar rec-bar">
          <span class="note" v-if="selected.length">{{ selected.length }} selected</span>
          <button class="btn btn-sm btn-primary" :disabled="selected.length !== 1" @click="openGenerate" title="Pick one record">Generate agreement</button>
          <button class="btn btn-sm" :disabled="!selected.length || busy" @click="duplicate">Duplicate</button>
          <button class="btn btn-sm" v-if="status !== 'archived'" :disabled="!selected.length || busy" @click="setStatus('archived')">Archive</button>
          <button class="btn btn-sm" v-else :disabled="!selected.length || busy" @click="setStatus('draft')">Restore</button>
          <span class="grow"></span>
          <label class="btn btn-sm" :class="{ disabled: busy }">Import CSV / Excel<input type="file" hidden accept=".csv,.xlsx,.xls" @change="importFile"></label>
          <button class="btn btn-sm" @click="exportAs('csv')">Export CSV</button>
          <button class="btn btn-sm" @click="exportAs('xlsx')">Export Excel</button>
        </div>

        <RecordGrid ref="grid" :fields="form.fields" :rows="rows" v-model:view="view" v-model:selected="selected" :can-edit-columns="isAdmin"
          @edit="onEdit" @open="id => router.push('/Agreements/record/' + id)" @column="onColumn" />
        <p class="note rec-note">Double-click a cell to edit it (formula columns work themselves out). Drag a column title to move it, drag its edge to resize. Changes save straight away.</p>
      </div>
    </template>

    <GenerateDialog v-if="gen" :form="form" :record="gen" :templates="templates" @close="gen = null" />

    <NameDialog v-if="ask && ask.kind === 'viewName'" :title="ask.title" label="View name" :value="ask.value" confirm="Save view" @close="ask = null" @done="createView" />
    <NameDialog v-if="ask && ask.kind === 'addColumn'" title="Add a column" label="Column name" :value="ask.value" confirm="Add column"
      help="A column only shows in this table. Turn on 'Show on form' in the form builder to ask for it on the form too." @close="ask = null" @done="addColumn">
      <div class="field">
        <label for="newColType">Type</label>
        <select id="newColType" class="input select" v-model="ask.type">
          <option v-for="t in COLUMN_TYPES" :key="t.type" :value="t.type">{{ t.label }}</option>
        </select>
      </div>
    </NameDialog>
    <ConfirmDialog v-if="ask && ask.kind === 'confirm'" :title="ask.title" :text="ask.text" :items="ask.items" :confirm="ask.confirm" :danger="ask.danger" @close="ask = null" @ok="ask.run(); ask = null" />

    <div class="modal-back" v-if="importing" @click.self="importing = null">
      <div class="modal" role="dialog" aria-label="Import records">
        <h2>Import {{ importing.records.length }} rows into {{ form.name }}</h2>
        <p class="help">Columns are matched to fields by name. Formula, signature and file columns are skipped.</p>
        <div class="kv"><span>Matched columns</span><span>{{ importing.matched.join(', ') || 'none' }}</span></div>
        <div class="kv" v-if="importing.ignored.length"><span>Skipped columns</span><span>{{ importing.ignored.join(', ') }}</span></div>
        <div class="notice warn" v-if="importing.problems.length" style="margin-top: 12px">
          {{ importing.problems.length }} cells couldn't be read and were left empty:
          <ul><li v-for="p in importing.problems.slice(0, 6)" :key="p">{{ p }}</li></ul>
        </div>
        <div class="modal-foot">
          <button class="btn" @click="importing = null">Cancel</button>
          <button class="btn btn-primary" :disabled="!importing.matched.length || busy" @click="runImport">{{ busy ? 'Importing…' : 'Import' }}</button>
        </div>
      </div>
    </div>
  </main>
</template>

<script setup>
// Agreements: one table per form. Everyone can fill forms and see records; column changes need Agreement setup.
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import RecordGrid from '@/components/agreements/RecordGrid.vue';
import GenerateDialog from '@/components/agreements/GenerateDialog.vue';
import NameDialog from '@/components/agreements/NameDialog.vue';
import ConfirmDialog from '@/components/agreements/ConfirmDialog.vue';
import { listForms, listRecords, listTemplates, listViews, saveView, deleteView, updateRecord, createRecord, createRecords, saveForm, audit, millis } from '@/lib/agreements/data.js';
import { computeValues, refsIn } from '@/lib/agreements/formula.js';
import { FIELD_TYPES, newField, recordTitle, labelProblem, hasOptions } from '@/lib/agreements/fields.js';
import { tableRows, exportFile, readTableFile, importPlan } from '@/lib/agreements/table-io.js';
import { can } from '@/lib/access.js';
import { useSession } from '@/stores/session.js';
import './agreements.css';

const route = useRoute(), router = useRouter(), session = useSession();
const isAdmin = computed(() => can(session, 'agreementSetup.view'));
const STATUS_TABS = [{ key: 'active', label: 'Open' }, { key: 'draft', label: 'Draft' }, { key: 'completed', label: 'Completed' }, { key: 'archived', label: 'Archived' }];
const COLUMN_TYPES = FIELD_TYPES.filter(t => ['text', 'textarea', 'number', 'currency', 'date', 'dropdown', 'checkbox', 'email', 'phone'].includes(t.type));
const blankView = () => ({ order: [], hidden: [], widths: {}, sort: null, filters: [], search: '' });

const loading = ref(true), busy = ref(false), error = ref(''), okMsg = ref('');
const forms = ref([]), formId = ref(''), records = ref([]), templates = ref([]), views = ref([]);
const viewId = ref(''), view = ref(blankView()), selected = ref([]), status = ref('active');
const gen = ref(null), ask = ref(null), importing = ref(null), grid = ref(null);
const form = computed(() => forms.value.find(f => f.id === formId.value) || null);

const flash = msg => { okMsg.value = msg; error.value = ''; setTimeout(() => { if (okMsg.value === msg) okMsg.value = ''; }, 4000); };
const fail = (e, what) => { console.error(e); error.value = e.code === 'permission-denied' ? `You don't have permission to ${what}.` : `Could not ${what}: ${e.message || e}`; };

// ---- Loading ----
onMounted(async () => {
  try {
    forms.value = await listForms();
    formId.value = forms.value.some(f => f.id === route.query.form) ? route.query.form : forms.value[0]?.id || '';
    if (!formId.value) loading.value = false;
  } catch (e) { fail(e, 'load the forms'); loading.value = false; }
});
watch(formId, async id => {
  if (!id) return;
  if (route.query.form !== id) router.replace({ query: { ...route.query, form: id } });
  loading.value = true; selected.value = [];
  try {
    [records.value, templates.value, views.value] = await Promise.all([listRecords(id), listTemplates(id), listViews(id)]);
    let last = '';
    try { last = localStorage.getItem('wb.agreementView.' + id) || ''; } catch (_) {}
    pickView(views.value.some(v => v.id === last) ? last : '');
  } catch (e) { fail(e, 'load the records'); }
  loading.value = false;
});

// ---- Rows (formulas worked out) ----
const inStatus = (r, s) => (s === 'active' ? r.status !== 'archived' : r.status === s);
const countOf = s => records.value.filter(r => inStatus(r, s)).length;
const rows = computed(() => !form.value ? [] : records.value.filter(r => inStatus(r, status.value))
  .map(r => ({ id: r.id, record: r, values: computeValues(form.value.fields, r.values || {}) })));

// ---- Editing cells ----
async function onEdit(id, key, value) {
  const r = records.value.find(x => x.id === id);
  if (key === '_status') {
    const old = r.status; r.status = value;
    try { await updateRecord(id, { status: value }); } catch (e) { r.status = old; fail(e, 'change the status'); }
    return;
  }
  const old = r.values?.[key];
  r.values = { ...(r.values || {}), [key]: value };
  const title = recordTitle(form.value.fields, r.values);
  try {
    await updateRecord(id, { ['values.' + key]: value, title });
    Object.assign(r, { title, updatedAt: Date.now(), updatedByName: session.name });
  } catch (e) { r.values = { ...r.values, [key]: old }; fail(e, 'save the change'); }
}

// ---- Columns (Agreement setup only) ----
async function saveFields(fields, what) {
  const before = form.value.fields;
  form.value.fields = fields;
  try { await saveForm(form.value.id, { fields }); } catch (e) { form.value.fields = before; fail(e, what); throw e; }
}
function onColumn(c) {
  const fields = form.value.fields;
  const f = fields.find(x => x.id === c.key);
  if (c.action === 'add') { ask.value = { kind: 'addColumn', value: 'New column', type: 'text' }; return; }
  if (c.action === 'rename') {
    const problem = labelProblem(c.label, fields, c.key);
    if (problem) { error.value = problem; return; }
    saveFields(fields.map(x => (x.id === c.key ? { ...x, label: c.label } : x)), 'rename the column').then(() => flash('Column renamed.')).catch(() => {});
    return;
  }
  if (c.action === 'type') {
    const patch = { type: c.type, ...(hasOptions({ type: c.type }) && !f.options?.length ? { options: ['Option 1', 'Option 2'] } : {}) };
    saveFields(fields.map(x => (x.id === c.key ? { ...x, ...patch } : x)), 'change the type').then(() => flash('Column type changed.')).catch(() => {});
    return;
  }
  if (c.action === 'delete') {
    const usedBy = fields.filter(x => x.type === 'formula' && refsIn(x.expr).includes(c.key)).map(x => `Formula "${x.label}" uses it`);
    const placed = templates.value.filter(t => (t.mappings || []).some(m => m.fieldId === c.key)).map(t => `Placed on template "${t.name}"`);
    ask.value = {
      kind: 'confirm', title: `Delete "${f.label}"?`, danger: true, confirm: 'Delete column', items: [...usedBy, ...placed],
      text: 'The column is removed from the form and the table. Values already typed stay in the saved records but are no longer shown.' + (usedBy.length || placed.length ? ' It is still used here:' : ''),
      run: () => saveFields(fields.filter(x => x.id !== c.key), 'delete the column').then(() => { audit('agreement.form.column.delete', `agreementForms/${form.value.id}`, f.label); flash('Column deleted.'); }).catch(() => {})
    };
  }
}
async function addColumn(label) {
  const problem = labelProblem(label, form.value.fields);
  if (problem) { error.value = problem; return; }
  const f = { ...newField(ask.value.type, form.value.fields, label), onForm: false };
  ask.value = null;
  try {
    await saveFields([...form.value.fields, f], 'add the column');
    if (view.value.order?.length) { const order = [...view.value.order]; const at = order.indexOf('_status'); order.splice(at < 0 ? order.length : at, 0, f.id); view.value = { ...view.value, order }; }
    flash(`Column "${label}" added.`);
  } catch (_) {}
}

// ---- Saved views ----
const savedView = computed(() => views.value.find(v => v.id === viewId.value));
const currentViewName = computed(() => savedView.value?.name || 'View');
const viewChanged = computed(() => JSON.stringify(view.value) !== JSON.stringify(savedView.value?.view || blankView()));
function pickView(id) {
  viewId.value = id;
  view.value = JSON.parse(JSON.stringify(views.value.find(v => v.id === id)?.view || blankView()));
  try { localStorage.setItem('wb.agreementView.' + formId.value, id); } catch (_) {}
}
async function saveCurrentView() {
  if (!viewId.value) { ask.value = { kind: 'viewName', title: 'Save this table view', value: 'My view' }; return; }
  try { await saveView(viewId.value, { formId: formId.value, name: savedView.value.name, view: view.value }); savedView.value.view = JSON.parse(JSON.stringify(view.value)); flash('View saved.'); }
  catch (e) { fail(e, 'save the view'); }
}
async function createView(name) {
  ask.value = null;
  try {
    const id = await saveView(null, { formId: formId.value, name, view: view.value });
    views.value = [...views.value, { id, formId: formId.value, name, view: JSON.parse(JSON.stringify(view.value)) }];
    pickView(id); flash(`View "${name}" saved. Everyone can use it.`);
  } catch (e) { fail(e, 'save the view'); }
}
function removeView() {
  const v = savedView.value;
  ask.value = { kind: 'confirm', title: `Delete the view "${v.name}"?`, text: 'Only the column layout is deleted. Records stay.', confirm: 'Delete view', danger: true,
    run: async () => { try { await deleteView(v.id); views.value = views.value.filter(x => x.id !== v.id); pickView(''); } catch (e) { fail(e, 'delete the view'); } } };
}

// ---- Record actions ----
const newRecord = () => router.push({ path: '/Agreements/record/new', query: { form: formId.value } });
function openGenerate() {
  const r = records.value.find(x => x.id === selected.value[0]);
  gen.value = { id: r.id, title: r.title, values: r.values || {} };
}
async function duplicate() {
  busy.value = true;
  try {
    const signatures = form.value.fields.filter(f => f.type === 'signature').map(f => f.id);
    for (const id of selected.value) {
      const r = records.value.find(x => x.id === id);
      const values = { ...(r.values || {}) };
      signatures.forEach(k => { values[k] = ''; });   // a copy must be signed again
      await createRecord(formId.value, values, { title: (r.title || 'Untitled') + ' (copy)' });
    }
    records.value = await listRecords(formId.value);
    flash(`${selected.value.length} record(s) copied as drafts. Signatures were not copied.`);
    selected.value = [];
  } catch (e) { fail(e, 'copy the records'); }
  busy.value = false;
}
async function setStatus(s) {
  busy.value = true;
  try {
    for (const id of selected.value) { await updateRecord(id, { status: s }); records.value.find(x => x.id === id).status = s; }
    flash(s === 'archived' ? 'Archived. Find them under Archived.' : 'Restored as drafts.');
    selected.value = [];
  } catch (e) { fail(e, 'change the status'); }
  busy.value = false;
}

// ---- Import / export ----
async function importFile(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const table = await readTableFile(file);
    if (table.length < 2) { error.value = 'The file has no rows under the header row.'; return; }
    importing.value = importPlan(table, form.value.fields);
  } catch (err) { fail(err, 'read the file'); }
}
async function runImport() {
  busy.value = true;
  try {
    const list = importing.value.records.map(r => ({ values: r.values, status: r.status, title: recordTitle(form.value.fields, r.values) }));
    await createRecords(formId.value, list);
    records.value = await listRecords(formId.value);
    flash(`${list.length} records imported.`);
    importing.value = null;
  } catch (e) { fail(e, 'import'); }
  busy.value = false;
}
const STATUS = { draft: 'Draft', completed: 'Completed', archived: 'Archived' };
async function exportAs(kind) {
  const { cols, rows: list } = grid.value.exportRows();
  const columns = cols.map(c => (c.field ? c : { ...c, plain: r => (c.key === '_status' ? STATUS[r.record.status] : millis(r.record.updatedAt) ? new Date(millis(r.record.updatedAt)).toLocaleString('en-GB') : '') }));
  try { await exportFile(kind, `${form.value.name} ${new Date().toISOString().slice(0, 10)}`, tableRows(columns, list, r => r.values)); }
  catch (e) { fail(e, 'export'); }
}
</script>

<style scoped>
.rec-card { padding: 16px; }
.rec-bar { margin-bottom: 10px; }
.rec-note { margin: 10px 0 0; }
label.btn.disabled { opacity: .55; pointer-events: none; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.notice ul { margin: 6px 0 0; padding-left: 18px; }
</style>
