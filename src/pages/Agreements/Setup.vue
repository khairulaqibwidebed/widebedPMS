<template>
  <main class="content">
    <div class="loading-bar" v-show="loading || busy"></div>
    <div class="page-head">
      <div>
        <h1>Agreement Setup</h1>
        <div class="sub">Build the forms staff fill in, upload agreement templates (PDF) and place the fields on them.</div>
      </div>
      <div class="head-tools"><RouterLink class="btn" to="/Agreements">Go to Agreements</RouterLink></div>
    </div>

    <div class="notice warn" v-if="!driveReady()">Google Drive isn't connected yet, so templates and files can't be uploaded. Follow apps-script/SETUP.md, then add VITE_AGREEMENTS_DRIVE_URL.</div>
    <div class="notice error" v-if="error">{{ error }}</div>
    <div class="notice ok" v-if="okMsg">{{ okMsg }}</div>

    <section class="card setup-card">
      <div class="card-head">
        <h2>1. Master files <small class="muted">Word / Google Docs</small></h2>
        <button class="btn btn-primary btn-sm" :disabled="!driveReady()" @click="addMaster = { source: 'word', name: '', file: null, url: '', error: '' }">+ Add master file</button>
      </div>
      <p class="card-intro">Your original agreements, kept in the Drive folder "Master File (DO NOT EDIT)". Edit them through a working copy in Google Docs, then turn them into templates.</p>
      <div class="table-wrap">
        <table class="table hover-rows">
          <thead><tr><th>Master file</th><th class="num">Templates</th><th>Status</th><th>Last changed</th><th></th></tr></thead>
          <tbody>
            <tr v-for="m in masters" :key="m.id">
              <td><RouterLink class="setup-name" :to="'/Agreements/setup/master/' + m.id">{{ m.name }}</RouterLink></td>
              <td class="num">{{ templates.filter(t => t.masterId === m.id).length }}</td>
              <td><span class="pill" :class="m.editing ? 'amber' : 'green'">{{ m.editing ? 'Being edited by ' + m.editing.byName : 'Ready' }}</span></td>
              <td class="muted">{{ when(m.updatedAt) }}</td>
              <td class="setup-acts">
                <RouterLink class="act-pill" :to="'/Agreements/setup/master/' + m.id">Open / edit</RouterLink>
                <button class="act-pill danger" @click="archive('master', m)">Archive</button>
              </td>
            </tr>
            <tr v-if="!loading && !masters.length"><td colspan="5" class="muted">No master files yet. Add a Word file or a Google Docs link.</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="card setup-card">
      <div class="card-head">
        <h2>2. Forms</h2>
        <button class="btn btn-primary btn-sm" @click="ask = { kind: 'newForm', starter: '' }">+ New form</button>
      </div>
      <p class="card-intro">The questions staff answer. Each form has its own records table and can have several templates.</p>
      <div class="table-wrap">
        <table class="table hover-rows">
          <thead><tr><th>Form</th><th class="num">Fields</th><th class="num">Formulas</th><th class="num">Templates</th><th>Last changed</th><th></th></tr></thead>
          <tbody>
            <tr v-for="f in forms" :key="f.id">
              <td><RouterLink class="setup-name" :to="'/Agreements/setup/form/' + f.id">{{ f.name }}</RouterLink></td>
              <td class="num">{{ f.fields.filter(x => x.type !== 'section').length }}</td>
              <td class="num">{{ f.fields.filter(x => x.type === 'formula').length }}</td>
              <td class="num">{{ templates.filter(t => t.formId === f.id).length }}</td>
              <td class="muted">{{ when(f.updatedAt) }}</td>
              <td class="setup-acts">
                <RouterLink class="act-pill" :to="'/Agreements/setup/form/' + f.id">Edit fields</RouterLink>
                <button class="act-pill" @click="ask = { kind: 'renameForm', item: f }">Rename</button>
                <button class="act-pill" @click="copyForm(f)">Duplicate</button>
                <button class="act-pill danger" @click="archive('form', f)">Archive</button>
              </td>
            </tr>
            <tr v-if="!loading && !forms.length"><td colspan="6" class="muted">No forms yet. Start from the tenancy forms in your sheet or a blank one.</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="card setup-card">
      <div class="card-head">
        <h2>3. Agreement templates</h2>
        <button class="btn btn-primary btn-sm" :disabled="!forms.length || !driveReady()" @click="upload = { source: masters.length ? 'master' : 'pdf', masterId: masters[0]?.id || '', name: masters[0]?.name || '', formId: forms[0]?.id, file: null, error: '' }">+ New template</button>
      </div>
      <p class="card-intro">The agreement as a PDF (from a master file or an uploaded PDF). Open it and drag the form's fields onto the page.</p>
      <div class="table-wrap">
        <table class="table hover-rows">
          <thead><tr><th>Template</th><th>Form</th><th>File</th><th class="num">Pages</th><th class="num">Fields placed</th><th>Last changed</th><th></th></tr></thead>
          <tbody>
            <tr v-for="t in templates" :key="t.id">
              <td><RouterLink class="setup-name" :to="'/Agreements/setup/template/' + t.id">{{ t.name }}</RouterLink></td>
              <td>{{ formName(t.formId) }}</td>
              <td class="muted">{{ t.masterId ? '📄 ' + masterName(t.masterId) : t.fileName }} <span class="tag">v{{ t.version }}</span></td>
              <td class="num">{{ t.pages.length }}</td>
              <td class="num">{{ (t.mappings || []).length }}</td>
              <td class="muted">{{ when(t.updatedAt) }}</td>
              <td class="setup-acts">
                <RouterLink class="act-pill" :to="'/Agreements/setup/template/' + t.id">Place fields</RouterLink>
                <button class="act-pill" @click="ask = { kind: 'renameTemplate', item: t }">Rename</button>
                <button class="act-pill" @click="copyTemplate(t)">Duplicate</button>
                <button class="act-pill danger" @click="archive('template', t)">Archive</button>
              </td>
            </tr>
            <tr v-if="!loading && !templates.length"><td colspan="7" class="muted">No templates yet.</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="card setup-card setup-help">
      <h2>How it works</h2>
      <ol>
        <li><b>Form:</b> add the questions (text, money, dates, dropdowns, signatures…) and formulas such as <code>[Monthly Rental] * 2</code>.</li>
        <li><b>Master file:</b> add your Word / Google Docs agreement. Edit its wording any time in Google Docs.</li>
        <li><b>Template:</b> make a template from the master file (or upload a PDF) and link it to the form.</li>
        <li><b>Place fields:</b> drag each field onto the page where its answer should print. Formula answers can be placed too.</li>
        <li><b>Fill in:</b> staff fill the form under Agreements, or send a fill-in link so tenants and landlords fill in and sign it themselves.</li>
        <li><b>Generate:</b> pick a record and a template to download the finished PDF. A copy is kept in Google Drive.</li>
      </ol>
    </section>

    <!-- New form -->
    <NameDialog v-if="ask && ask.kind === 'newForm'" title="New form" label="Form name" :value="starterName(ask.starter)" confirm="Create form" @close="ask = null" @done="makeForm">
      <div class="field">
        <label for="starter">Start from</label>
        <select id="starter" class="input select" v-model="ask.starter">
          <option value="">A blank form</option>
          <option v-for="s in STARTERS" :key="s.key" :value="s.key">{{ s.name }} ({{ s.fields.filter(x => x.type !== 'section').length }} fields from your sheet)</option>
        </select>
      </div>
    </NameDialog>
    <NameDialog v-if="ask && ask.kind === 'renameForm'" title="Rename form" label="Form name" :value="ask.item.name" @close="ask = null" @done="n => rename('form', ask.item, n)" />
    <NameDialog v-if="ask && ask.kind === 'renameTemplate'" title="Rename template" label="Template name" :value="ask.item.name" @close="ask = null" @done="n => rename('template', ask.item, n)" />
    <ConfirmDialog v-if="ask && ask.kind === 'confirm'" :title="ask.title" :text="ask.text" :confirm="ask.confirm" danger @close="ask = null" @ok="ask.run(); ask = null" />

    <!-- Upload a template -->
    <div class="modal-back" v-if="upload" @click.self="!busy && (upload = null)">
      <form class="modal" role="dialog" aria-label="Upload template" @submit.prevent="doUpload">
        <h2>New agreement template</h2>
        <div class="notice error" v-if="upload.error">{{ upload.error }}</div>
        <div class="seg" role="radiogroup" aria-label="Where the template comes from">
          <button type="button" :class="{ on: upload.source === 'master' }" @click="upload.source = 'master'">Use a master file</button>
          <button type="button" :class="{ on: upload.source === 'pdf' }" @click="upload.source = 'pdf'">Upload a PDF</button>
        </div>
        <div class="field" v-if="upload.source === 'master'">
          <label for="tplMaster">Master file</label>
          <select id="tplMaster" class="input select" v-model="upload.masterId" required>
            <option v-for="m in masters" :key="m.id" :value="m.id">{{ m.name }}</option>
          </select>
          <span class="help" v-if="!masters.length">No master files yet. Add one in section 1 first.</span>
          <span class="help" v-else>The master's current wording is turned into a PDF. Update it later from the master file page.</span>
        </div>
        <div class="field" v-else>
          <label for="tplFile">PDF file</label>
          <input id="tplFile" class="input" type="file" accept="application/pdf,.pdf" @change="pickFile" required>
          <span class="help">Up to 15 MB. For a Word file, add it as a master file instead.</span>
        </div>
        <div class="field">
          <label for="tplName">Template name</label>
          <input id="tplName" class="input" v-model="upload.name" required placeholder="e.g. General Tenancy Agreement 2026">
        </div>
        <div class="field">
          <label for="tplForm">Form it uses</label>
          <select id="tplForm" class="input select" v-model="upload.formId"><option v-for="f in forms" :key="f.id" :value="f.id">{{ f.name }}</option></select>
        </div>
        <div class="modal-foot">
          <button type="button" class="btn" :disabled="busy" @click="upload = null">Cancel</button>
          <button type="submit" class="btn btn-primary" :disabled="busy || (upload.source === 'pdf' ? !upload.file : !upload.masterId) || !upload.name.trim()">{{ busy ? 'Preparing…' : 'Create and place fields' }}</button>
        </div>
      </form>
    </div>

    <!-- Add a master file -->
    <div class="modal-back" v-if="addMaster" @click.self="!busy && (addMaster = null)">
      <form class="modal" role="dialog" aria-label="Add master file" @submit.prevent="doAddMaster">
        <h2>Add a master file</h2>
        <div class="notice error" v-if="addMaster.error">{{ addMaster.error }}</div>
        <div class="seg" role="radiogroup" aria-label="Source">
          <button type="button" :class="{ on: addMaster.source === 'word' }" @click="addMaster.source = 'word'">Upload a Word file</button>
          <button type="button" :class="{ on: addMaster.source === 'gdoc' }" @click="addMaster.source = 'gdoc'">Google Docs link</button>
        </div>
        <div class="field" v-if="addMaster.source === 'word'">
          <label for="mWord">Word file (.docx)</label>
          <input id="mWord" class="input" type="file" accept=".docx,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword" @change="pickWord" required>
          <span class="help">It becomes a Google Doc so it can be edited online. Up to 15 MB.</span>
        </div>
        <div class="field" v-else>
          <label for="mUrl">Google Docs link</label>
          <input id="mUrl" class="input" v-model="addMaster.url" placeholder="https://docs.google.com/document/d/…" required>
          <span class="help">Share the document with the company Google account first. A copy is made; the original stays where it is.</span>
        </div>
        <div class="field">
          <label for="mName">Name</label>
          <input id="mName" class="input" v-model="addMaster.name" required placeholder="e.g. General Tenancy Agreement">
        </div>
        <div class="modal-foot">
          <button type="button" class="btn" :disabled="busy" @click="addMaster = null">Cancel</button>
          <button type="submit" class="btn btn-primary" :disabled="busy || !addMaster.name.trim() || (addMaster.source === 'word' ? !addMaster.file : !addMaster.url.trim())">{{ busy ? 'Adding…' : 'Add master file' }}</button>
        </div>
      </form>
    </div>
  </main>
</template>

<script setup>
// Agreement setup: forms and templates. Needs the "Agreement setup" tick (Directors always have it).
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import NameDialog from '@/components/agreements/NameDialog.vue';
import ConfirmDialog from '@/components/agreements/ConfirmDialog.vue';
import { listForms, listTemplates, createForm, saveForm, createTemplate, saveTemplate, audit, millis, listMasters, createMaster, saveMaster } from '@/lib/agreements/data.js';
import { STARTERS, starterFields } from '@/lib/agreements/starters.js';
import { uploadTemplateFile, templateFromMaster } from '@/lib/agreements/templates.js';
import { driveReady, importMaster } from '@/lib/agreements/drive.js';
import { newId } from '@/lib/agreements/fields.js';
import './agreements.css';

const router = useRouter();
const loading = ref(true), busy = ref(false), error = ref(''), okMsg = ref('');
const forms = ref([]), templates = ref([]), masters = ref([]), ask = ref(null), upload = ref(null), addMaster = ref(null);
const masterName = id => masters.value.find(m => m.id === id)?.name || 'Master file';
const when = t => { const ms = millis(t); return ms ? new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'; };
const formName = id => forms.value.find(f => f.id === id)?.name || 'Archived form';
const starterName = key => STARTERS.find(s => s.key === key)?.name || 'New form';
const flash = m => { okMsg.value = m; error.value = ''; setTimeout(() => { if (okMsg.value === m) okMsg.value = ''; }, 4000); };
const fail = (e, what) => { console.error(e); error.value = e.code === 'permission-denied' ? `You don't have permission to ${what}.` : `Could not ${what}: ${e.message}`; };

async function load() {
  try { [forms.value, templates.value, masters.value] = await Promise.all([listForms(), listTemplates(), listMasters()]); }
  catch (e) { fail(e, 'load the setup'); }
  loading.value = false;
}
onMounted(load);

async function makeForm(name) {
  const starter = ask.value.starter;
  ask.value = null; busy.value = true;
  try { const id = await createForm(name, starter ? starterFields(starter) : []); router.push('/Agreements/setup/form/' + id); }
  catch (e) { fail(e, 'create the form'); busy.value = false; }
}
async function copyForm(f) {
  busy.value = true;
  try { await createForm(f.name + ' (copy)', JSON.parse(JSON.stringify(f.fields))); await load(); flash('Form copied. Its templates were not copied.'); }
  catch (e) { fail(e, 'copy the form'); }
  busy.value = false;
}
async function copyTemplate(t) {
  busy.value = true;
  try {
    const mappings = (t.mappings || []).map(m => ({ ...m, id: newId('m_') }));
    await createTemplate({ name: t.name + ' (copy)', formId: t.formId, file: { id: t.fileId, name: t.fileName, pages: t.pages }, mappings });
    await load(); flash('Template copied with all its placed fields.');
  } catch (e) { fail(e, 'copy the template'); }
  busy.value = false;
}
async function rename(kind, item, name) {
  ask.value = null;
  try {
    await (kind === 'form' ? saveForm(item.id, { name }) : saveTemplate(item.id, { name }));
    item.name = name; flash('Renamed.');
  } catch (e) { fail(e, 'rename'); }
}
function archive(kind, item) {
  const records = kind === 'form' ? ' Its records and templates are kept but hidden.' : kind === 'master' ? ' The Google Doc stays in Drive and templates made from it keep working.' : ' Agreements already made from it are kept.';
  const col = { form: 'agreementForms', template: 'agreementTemplates', master: 'agreementMasters' }[kind];
  const save = { form: saveForm, template: saveTemplate, master: saveMaster }[kind];
  ask.value = { kind: 'confirm', title: `Archive "${item.name}"?`, text: 'It disappears from the lists.' + records, confirm: 'Archive',
    run: async () => {
      try {
        await save(item.id, { archived: true });
        audit(`agreement.${kind}.archive`, `${col}/${item.id}`, item.name);
        await load(); flash('Archived.');
      } catch (e) { fail(e, 'archive'); }
    } };
}

function pickFile(e) {
  const file = e.target.files[0];
  upload.value.file = file || null; upload.value.error = '';
  if (file && !upload.value.name.trim()) upload.value.name = file.name.replace(/\.[^.]+$/, '');
}
function pickWord(e) {
  const file = e.target.files[0];
  addMaster.value.file = file || null; addMaster.value.error = '';
  if (file && !addMaster.value.name.trim()) addMaster.value.name = file.name.replace(/\.[^.]+$/, '');
}
async function doAddMaster() {
  const a = addMaster.value;
  busy.value = true; a.error = '';
  try {
    let r;
    if (a.source === 'word') {
      if (!/\.docx?$/i.test(a.file.name)) throw new Error('Choose a Word file (.docx).');
      const bytes = new Uint8Array(await a.file.arrayBuffer());
      const mime = /\.doc$/i.test(a.file.name) ? 'application/msword' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      r = await importMaster({ name: a.name.trim(), bytes, mime });
    } else r = await importMaster({ name: a.name.trim(), docUrl: a.url.trim() });
    const id = await createMaster({ name: a.name.trim(), docId: r.docId, url: r.url, source: a.source === 'word' ? a.file.name : 'Google Docs link' });
    router.push('/Agreements/setup/master/' + id);
  } catch (e) { a.error = e.message; busy.value = false; }
}
async function doUpload() {
  const u = upload.value;
  busy.value = true; u.error = '';
  try {
    const master = u.source === 'master' ? masters.value.find(m => m.id === u.masterId) : null;
    const file = master ? await templateFromMaster(master) : await uploadTemplateFile(u.file);
    const id = await createTemplate({ name: u.name.trim(), formId: u.formId, file, masterId: master?.id || '' });
    router.push('/Agreements/setup/template/' + id);
  } catch (e) { u.error = e.message; busy.value = false; }
}
</script>

<style scoped>
.setup-card { margin-bottom: 20px; }
.setup-name { font-weight: 600; color: var(--text); }
.setup-name:hover { color: var(--accent); }
.setup-acts { display: flex; gap: 6px; justify-content: flex-end; flex-wrap: wrap; white-space: nowrap; }
.setup-help h2 { font-size: 15px; margin: 0 0 8px; }
.setup-help ol { margin: 0; padding-left: 20px; display: grid; gap: 6px; color: var(--text-2); }
.setup-help code { background: var(--chip); padding: 1px 5px; border-radius: 4px; font-size: 12px; }
</style>
