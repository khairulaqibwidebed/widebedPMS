<template>
  <main class="content">
    <div class="loading-bar" v-show="loading"></div>
    <div class="ag-crumb"><button class="link" @click="back">← {{ form ? form.name : 'Agreements' }}</button></div>
    <div class="notice error" v-if="error">{{ error }}</div>

    <!-- New record: step by step, then a thank-you page -->
    <template v-if="form && isNew">
      <ThankYou v-if="done" :title="done.status === 'completed' ? 'Saved and completed' : 'Draft saved'" :reference="'AGR-' + done.id.slice(0, 6).toUpperCase()"
        :message="`${done.title} is saved in ${form.name}. What would you like to do next?`">
        <button class="btn btn-primary" @click="router.replace('/Agreements/record/' + done.id + '?then=generate')" :disabled="!templates.length">Generate agreement</button>
        <button class="btn" @click="router.replace('/Agreements/record/' + done.id + '?then=link')">Send to fill in & sign</button>
        <button class="btn" @click="again">Fill in another</button>
        <button class="btn" @click="back">Back to the list</button>
      </ThankYou>
      <FillWizard v-else v-model="values" :fields="form.fields" :title="'New ' + form.name" :busy="busy"
        draft-label="Save draft" submit-label="Save as completed" @draft="saveNew('draft')" @submit="saveNew('completed')" />
    </template>

    <!-- An existing record: everything on one page -->
    <template v-else-if="form">
      <div class="page-head">
        <div>
          <h1>{{ title }}</h1>
          <div class="sub">
            <span class="pill" :class="STATUS_PILL[status]">{{ STATUS[status] }}</span>
            <span class="ag-save" :class="{ error: autosave.status.value === 'error' }"> · {{ autosave.label.value }}</span>
          </div>
        </div>
        <div class="head-tools">
          <button class="btn" :disabled="busy" @click="saveNow">Save</button>
          <button class="btn" :disabled="busy" @click="links = true">Send to fill in & sign</button>
          <button class="btn" :disabled="busy" @click="duplicate">Duplicate</button>
          <button class="btn" v-if="status === 'archived'" :disabled="busy" @click="changeStatus('draft')">Restore</button>
          <button class="btn" v-else :disabled="busy" @click="changeStatus('archived')">Archive</button>
          <button class="btn" v-if="status === 'completed'" :disabled="busy" @click="changeStatus('draft')">Back to draft</button>
          <button class="btn" v-else :disabled="busy" @click="changeStatus('completed')">{{ status === 'submitted' ? 'Checked: mark completed' : 'Mark completed' }}</button>
          <button class="btn btn-primary" :disabled="busy" @click="openGenerate">Generate agreement</button>
        </div>
      </div>

      <div class="notice ok" v-if="okMsg">{{ okMsg }}</div>
      <div class="notice warn" v-if="errorCount">{{ errorCount }} field{{ errorCount > 1 ? 's need' : ' needs' }} attention before this can be completed.</div>
      <div class="notice info rec-ext" v-if="record.source === 'external'">
        Sent in through the fill-in link <b>/f/{{ record.linkSlug }}</b>{{ record.submittedAt ? ' on ' + when(record.submittedAt) : '' }}.
        {{ status === 'submitted' ? 'Check the answers, then mark it completed.' : '' }}
      </div>

      <div class="rec-layout">
        <div class="card">
          <form class="ag-form" @submit.prevent novalidate>
            <FieldInput v-for="f in shownFields" :key="f.id" :field="f" :disabled="busy"
              :model-value="f.type === 'formula' ? computed_[f.id] : values[f.id]" :error="errors[f.id] || ''"
              @update:model-value="v => setValue(f, v)" />
          </form>
          <p class="empty" v-if="!shownFields.length">This form has no fields yet.</p>
        </div>

        <aside class="card rec-side">
          <h2>Agreement history</h2>
          <p class="help" v-if="!history.length">PDFs made with "Generate agreement" or sent in through a link are kept here.</p>
          <div class="rows">
            <div class="row" v-for="h in history" :key="h.id">
              <span><b>{{ h.templateName || 'Agreement' }}</b> <small class="muted" v-if="h.templateVersion">v{{ h.templateVersion }}</small><br><small class="muted">{{ when(h.at) }} · {{ h.byName }}</small></span>
              <button class="btn btn-sm" :disabled="h.loading" @click="download(h)">{{ h.loading ? '…' : 'Download' }}</button>
            </div>
          </div>
          <hr class="divider">
          <div class="kv"><span>Created</span><span>{{ when(record.createdAt) }} · {{ record.createdByName }}</span></div>
          <div class="kv"><span>Last changed</span><span>{{ when(record.updatedAt) }} · {{ record.updatedByName }}</span></div>
        </aside>
      </div>
    </template>

    <GenerateDialog v-if="gen" :form="form" :record="gen" :templates="templates" @close="gen = null" @generated="loadHistory" />
    <LinksDialog v-if="links" :form="form" :templates="templates" :record="{ id: record.id, title }" :is-admin="isAdmin" @close="links = false" />
  </main>
</template>

<script setup>
// One agreement record. New: step-by-step form and a thank-you page. Existing: one page with auto-save,
// completing, sending a fill-in link, and its PDF history.
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router';
import FieldInput from '@/components/agreements/FieldInput.vue';
import FillWizard from '@/components/agreements/FillWizard.vue';
import ThankYou from '@/components/agreements/ThankYou.vue';
import GenerateDialog from '@/components/agreements/GenerateDialog.vue';
import LinksDialog from '@/components/agreements/LinksDialog.vue';
import { getForm, getRecord, createRecord, updateRecord, listTemplates, listGenerated, audit, millis } from '@/lib/agreements/data.js';
import { computeValues } from '@/lib/agreements/formula.js';
import { defaultValues, isShown, validate, recordTitle, hasValue, STATUS, STATUS_PILL } from '@/lib/agreements/fields.js';
import { useAutosave } from '@/lib/agreements/history.js';
import { loadFile } from '@/lib/agreements/drive.js';
import { downloadBytes } from '@/lib/agreements/bytes.js';
import { can } from '@/lib/access.js';
import { useSession } from '@/stores/session.js';
import './agreements.css';

const route = useRoute(), router = useRouter(), session = useSession();
const isAdmin = computed(() => can(session, 'agreementSetup.view'));
const isNew = computed(() => route.params.id === 'new');

const loading = ref(true), busy = ref(false), error = ref(''), okMsg = ref('');
const form = ref(null), record = ref({}), values = ref({}), status = ref('draft');
const templates = ref([]), history = ref([]), errors = ref({}), gen = ref(null), links = ref(false), done = ref(null), touched = ref(false);

const computed_ = computed(() => (form.value ? computeValues(form.value.fields, values.value) : {}));
const title = computed(() => (form.value ? recordTitle(form.value.fields, values.value) : ''));
const errorCount = computed(() => Object.keys(errors.value).length);
const when = t => { const ms = millis(t) || (typeof t === 'string' ? Date.parse(t) : 0); return ms ? new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'; };
const back = () => router.push({ path: '/Agreements', query: form.value ? { form: form.value.id } : {} });

// Fields that show right now; a section heading shows only when something under it does.
const shownFields = computed(() => {
  if (!form.value) return [];
  const out = []; let section = null;
  for (const f of form.value.fields) {
    if (f.type === 'section') { section = f.onForm === false ? null : f; continue; }
    if (!isShown(f, values.value)) continue;
    if (section) { out.push(section); section = null; }
    out.push(f);
  }
  return out;
});

onMounted(async () => {
  try {
    if (isNew.value) {
      form.value = await getForm(route.query.form);
      if (!form.value) throw new Error('This form no longer exists.');
      values.value = defaultValues(form.value.fields);
    } else {
      record.value = await getRecord(route.params.id);
      if (!record.value) throw new Error('This record no longer exists.');
      form.value = await getForm(record.value.formId);
      values.value = { ...defaultValues(form.value.fields), ...(record.value.values || {}) };
      status.value = record.value.status || 'draft';
      loadHistory();
    }
    templates.value = await listTemplates(form.value.id);
    if (route.query.then === 'generate') openGenerate();
    if (route.query.then === 'link') links.value = true;
  } catch (e) { error.value = e.message; }
  loading.value = false;
});
async function loadHistory() {
  try { history.value = await listGenerated(record.value.id); } catch (e) { console.warn(e); }
}

// ---- New record ----
watch(values, () => { if (isNew.value && !loading.value) touched.value = true; }, { deep: true });
async function saveNew(s) {
  busy.value = true; error.value = '';
  try {
    const clean = Object.fromEntries(form.value.fields.filter(f => hasValue(f) && f.type !== 'formula').map(f => [f.id, values.value[f.id] ?? '']));
    const id = await createRecord(form.value.id, clean, { status: s, title: title.value });
    audit('agreement.record.create', `agreementRecords/${id}`, `${form.value.name}: ${title.value}`);
    touched.value = false;
    done.value = { id, status: s, title: title.value };
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (e) { error.value = 'Could not save: ' + e.message; }
  busy.value = false;
}
function again() { done.value = null; values.value = defaultValues(form.value.fields); touched.value = false; }

// ---- Existing record ----
const autosave = useAutosave(async () => {
  await updateRecord(record.value.id, { values: values.value, title: title.value });
  record.value.updatedAt = Date.now();
}, 1200);
function setValue(f, v) {
  values.value = { ...values.value, [f.id]: v };
  if (errors.value[f.id]) { const e = { ...errors.value }; delete e[f.id]; errors.value = e; }
  autosave.touch();
}
async function saveNow() { await autosave.flush(); if (autosave.status.value === 'saved') { okMsg.value = 'Saved.'; } }
function check() {
  errors.value = validate(form.value.fields, values.value);
  if (errorCount.value) {
    const first = form.value.fields.find(f => errors.value[f.id]);
    document.getElementById('fld-' + first.id)?.focus();
    return false;
  }
  return true;
}
async function changeStatus(s) {
  if (s === 'completed' && !check()) return;
  busy.value = true; error.value = '';
  try {
    await autosave.flush();
    await updateRecord(record.value.id, { status: s, values: values.value, title: title.value });
    status.value = s;
    if (s === 'completed') audit('agreement.record.complete', `agreementRecords/${record.value.id}`, `${form.value.name}: ${title.value}`);
    okMsg.value = { completed: 'Marked as completed.', draft: 'Back to draft.', archived: 'Archived.' }[s];
  } catch (e) { error.value = 'Could not change the status: ' + e.message; }
  busy.value = false;
}
async function duplicate() {
  busy.value = true;
  try {
    await autosave.flush();
    const copy = { ...values.value };
    form.value.fields.filter(f => f.type === 'signature').forEach(f => { copy[f.id] = ''; });   // a copy must be signed again
    const id = await createRecord(form.value.id, copy, { title: title.value + ' (copy)' });
    router.push('/Agreements/record/' + id);
  } catch (e) { error.value = 'Could not copy: ' + e.message; busy.value = false; }
}
async function openGenerate() {
  await autosave.flush();
  gen.value = { id: record.value.id, title: title.value, values: values.value };
}
async function download(h) {
  h.loading = true;
  try { const f = await loadFile(h.fileId); downloadBytes(f.bytes, h.fileName); }
  catch (e) { error.value = 'Could not download: ' + e.message; }
  h.loading = false;
}

watch(okMsg, m => { if (m) setTimeout(() => { if (okMsg.value === m) okMsg.value = ''; }, 3500); });
onBeforeRouteLeave(async () => {
  if (isNew.value && touched.value && !busy.value && !done.value) return window.confirm('Leave without saving this new record?');
  await autosave.flush();
  return true;
});
</script>

<style scoped>
.rec-layout { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 20px; align-items: start; }
.rec-side { position: sticky; top: 76px; }
.rec-side h2 { font-size: 15px; margin: 0 0 10px; }
.rec-ext { background: var(--blue-soft); color: var(--blue); }
.page-head .sub { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
@media (max-width: 1000px) { .rec-layout { grid-template-columns: minmax(0, 1fr); } .rec-side { position: static; } }
</style>
