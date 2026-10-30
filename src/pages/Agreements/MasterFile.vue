<template>
  <main class="content">
    <div class="loading-bar" v-show="loading || busy"></div>
    <div class="ag-crumb"><RouterLink to="/Agreements/setup">← Agreement Setup</RouterLink></div>
    <div class="notice error" v-if="error">{{ error }}</div>
    <div class="notice ok" v-if="okMsg">{{ okMsg }}</div>

    <template v-if="m">
      <div class="page-head">
        <div>
          <h1>{{ m.name }}</h1>
          <div class="sub">Master file · Google Docs · kept in "Master File (DO NOT EDIT)"</div>
        </div>
        <div class="head-tools">
          <button class="btn" @click="router.push('/Agreements/setup')">← Back</button>
          <button class="btn" :disabled="busy" @click="ask = { kind: 'rename' }">Rename</button>
          <button class="btn" :disabled="busy" @click="downloadWord">Download as Word</button>
          <button class="btn btn-primary" :disabled="busy || !!m.editing" @click="startEdit">Edit in Google Docs</button>
        </div>
      </div>

      <!-- Editing in progress -->
      <section class="card mf-edit" v-if="m.editing">
        <div class="mf-edit-head">
          <span class="mf-dot" aria-hidden="true"></span>
          <div>
            <b>Editing a working copy</b>
            <small>Started by {{ m.editing.byName }} · {{ when(m.editing.at) }}. The master file is not changed until you save.</small>
          </div>
        </div>
        <ol class="mf-steps">
          <li><a class="btn btn-sm" :href="m.editing.url" target="_blank" rel="noopener">Open the working copy in Google Docs ↗</a> Change, add or delete any wording. Google Docs saves as you type.</li>
          <li>When you're done, come back here and choose what to do with your changes:</li>
        </ol>
        <p class="help" v-if="m.editing.shared === 'link'">Your email is not a Google account, so the working copy opens for anyone with its link until you finish. Finish soon.</p>
        <div class="mf-choices">
          <button class="mf-choice" :disabled="busy" @click="ask = { kind: 'copy', name: m.name + ' (new)' }">
            <b>Save as a copy</b><small>Keep this master as it is and add your version as a new master file.</small>
          </button>
          <button class="mf-choice primary" :disabled="busy" @click="ask = { kind: 'replace' }">
            <b>Replace the master</b><small>Your version becomes the master. The old one is kept in "Old versions".</small>
          </button>
          <button class="mf-choice danger" :disabled="busy" @click="ask = { kind: 'discard' }">
            <b>Discard changes</b><small>Throw the working copy away. Nothing changes.</small>
          </button>
        </div>
      </section>

      <div class="mf-grid">
        <section class="card">
          <div class="card-head"><h2>Templates made from it</h2><button class="btn btn-sm btn-primary" :disabled="busy || !forms.length" @click="ask = { kind: 'template', name: m.name, formId: forms[0]?.id }">+ Make a template</button></div>
          <p class="card-intro">A template is the master turned into a PDF so fields can be placed on it. After you change the master, update its templates.</p>
          <div class="rows">
            <div class="row" v-for="t in made" :key="t.id">
              <span><RouterLink :to="'/Agreements/setup/template/' + t.id"><b>{{ t.name }}</b></RouterLink> <small class="muted">v{{ t.version }} · {{ formName(t.formId) }}</small></span>
              <button class="btn btn-sm" :disabled="busy" @click="refresh(t)">Update from master</button>
            </div>
            <p class="empty" v-if="!made.length">No templates yet.</p>
          </div>
        </section>
        <section class="card">
          <h2 class="mf-h2">Earlier versions</h2>
          <div class="rows">
            <div class="row" v-for="v in [...(m.versions || [])].reverse()" :key="v.docId">
              <span>{{ new Date(v.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }}<br><small class="muted">replaced by {{ v.byName }}</small></span>
              <span class="muted">In "Old versions"</span>
            </div>
            <p class="empty" v-if="!(m.versions || []).length">Not replaced yet.</p>
          </div>
        </section>
      </div>
    </template>

    <NameDialog v-if="ask && ask.kind === 'rename'" title="Rename master file" label="Name" :value="m.name" @close="ask = null" @done="rename" />
    <NameDialog v-if="ask && ask.kind === 'copy'" title="Save as a copy" label="Name of the new master file" :value="ask.name" confirm="Save as a copy" @close="ask = null" @done="n => finish('copy', n)" />
    <ConfirmDialog v-if="ask && ask.kind === 'replace'" title="Replace the master file?" confirm="Replace master"
      text="Your edited version becomes the master. The current one moves to &quot;Old versions&quot; in Drive. Templates keep using their PDF until you click &quot;Update from master&quot;." @close="ask = null" @ok="finish('replace')" />
    <ConfirmDialog v-if="ask && ask.kind === 'discard'" title="Discard your changes?" confirm="Discard" danger
      text="The working copy is moved to the Drive bin. The master file stays as it is." @close="ask = null" @ok="finish('discard')" />
    <NameDialog v-if="ask && ask.kind === 'template'" title="Make a template from this master" label="Template name" :value="ask.name" confirm="Make template" @close="ask = null" @done="makeTemplate">
      <div class="field">
        <label for="mfForm">Form it uses</label>
        <select id="mfForm" class="input select" v-model="ask.formId"><option v-for="f in forms" :key="f.id" :value="f.id">{{ f.name }}</option></select>
      </div>
    </NameDialog>
  </main>
</template>

<script setup>
// A master file (Word / Google Doc). Editing happens in a working copy in Google Docs; the master changes only
// with "Replace the master". Templates are made from it as PDFs.
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import NameDialog from '@/components/agreements/NameDialog.vue';
import ConfirmDialog from '@/components/agreements/ConfirmDialog.vue';
import { getMaster, saveMaster, createMaster, listTemplates, listForms, createTemplate, addTemplateVersion, audit, millis } from '@/lib/agreements/data.js';
import { editMaster, finishMaster, masterAsWord } from '@/lib/agreements/drive.js';
import { templateFromMaster, offPage } from '@/lib/agreements/templates.js';
import { downloadBytes } from '@/lib/agreements/bytes.js';
import { useSession } from '@/stores/session.js';
import './agreements.css';

const route = useRoute(), router = useRouter(), session = useSession();
const loading = ref(true), busy = ref(false), error = ref(''), okMsg = ref('');
const m = ref(null), templates = ref([]), forms = ref([]), ask = ref(null);
const made = computed(() => templates.value.filter(t => t.masterId === m.value?.id));
const formName = id => forms.value.find(f => f.id === id)?.name || 'Archived form';
const when = t => { const ms = millis(t) || (typeof t === 'number' ? t : 0); return ms ? new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''; };
const flash = msg => { okMsg.value = msg; error.value = ''; setTimeout(() => { if (okMsg.value === msg) okMsg.value = ''; }, 5000); };
async function run(what, fn) {
  busy.value = true; error.value = '';
  try { await fn(); } catch (e) { console.error(e); error.value = `Could not ${what}: ${e.message}`; }
  busy.value = false;
}

onMounted(async () => {
  try {
    m.value = await getMaster(route.params.id);
    if (!m.value) throw new Error('This master file no longer exists.');
    [templates.value, forms.value] = await Promise.all([listTemplates(), listForms()]);
  } catch (e) { error.value = e.message; }
  loading.value = false;
});

const startEdit = () => run('open a working copy', async () => {
  const win = window.open('', '_blank');   // opened now so the browser doesn't block it
  const r = await editMaster(m.value.docId);
  const editing = { copyId: r.copyId, url: r.url, shared: r.shared, by: session.user.uid, byName: session.name, at: Date.now() };
  await saveMaster(m.value.id, { editing });
  m.value.editing = editing;
  if (win) win.location.href = r.url; else window.open(r.url, '_blank');
});

function finish(mode, name) {
  ask.value = null;
  return run('save your changes', async () => {
    const e = m.value.editing;
    const r = await finishMaster(mode, { docId: m.value.docId, copyId: e.copyId, name: mode === 'copy' ? name : m.value.name });
    if (mode === 'discard') { await saveMaster(m.value.id, { editing: null }); m.value.editing = null; flash('Changes discarded. The master file is unchanged.'); return; }
    if (mode === 'copy') {
      await saveMaster(m.value.id, { editing: null });
      const id = await createMaster({ name: r.name, docId: r.docId, url: r.url, source: 'Copy of ' + m.value.name });
      m.value.editing = null;
      flash(`Saved as a new master file "${r.name}".`);
      router.push('/Agreements/setup/master/' + id);
      return;
    }
    const versions = [...(m.value.versions || []), { docId: r.oldDocId, at: Date.now(), byName: session.name }];
    await saveMaster(m.value.id, { docId: r.docId, url: r.url, versions, editing: null });
    audit('agreement.master.replace', `agreementMasters/${m.value.id}`, m.value.name);
    Object.assign(m.value, { docId: r.docId, url: r.url, versions, editing: null });
    flash(made.value.length ? 'Master replaced. Click "Update from master" on its templates to use the new wording.' : 'Master replaced.');
  });
}

const rename = n => { ask.value = null; return run('rename', async () => { await saveMaster(m.value.id, { name: n }); m.value.name = n; }); };
const downloadWord = () => run('download', async () => { const f = await masterAsWord(m.value.docId); downloadBytes(f.bytes, f.name, f.mime); });

function makeTemplate(name) {
  const formId = ask.value.formId;
  ask.value = null;
  return run('make the template', async () => {
    const file = await templateFromMaster(m.value);
    const id = await createTemplate({ name, formId, file, masterId: m.value.id });
    router.push('/Agreements/setup/template/' + id);
  });
}
const refresh = t => run('update the template', async () => {
  const file = await templateFromMaster(m.value);
  const updated = await addTemplateVersion(t, file);
  Object.assign(t, updated);
  const off = offPage(t.mappings || [], file.pages).length;
  flash(`"${t.name}" now uses the latest master (v${updated.version}). Open it to check the fields still sit in the right place${off ? `; ${off} field(s) are on pages that no longer exist` : ''}.`);
});
</script>

<style scoped>
.mf-edit { border-color: var(--accent); margin-bottom: 20px; box-shadow: 0 6px 20px color-mix(in srgb, var(--accent) 12%, transparent); }
.mf-edit-head { display: flex; gap: 12px; align-items: flex-start; }
.mf-edit-head div { display: grid; gap: 2px; }
.mf-edit-head small { color: var(--muted); }
.mf-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--accent); margin-top: 6px; animation: mf-pulse 1.6s ease-in-out infinite; }
@keyframes mf-pulse { 50% { opacity: .3; } }
.mf-steps { margin: 14px 0 10px; padding-left: 20px; display: grid; gap: 10px; color: var(--text-2); }
.mf-steps .btn { margin-right: 8px; }
.mf-choices { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
@media (max-width: 760px) { .mf-choices { grid-template-columns: minmax(0, 1fr); } }
.mf-choice { display: grid; gap: 4px; text-align: left; padding: 14px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); font: inherit; cursor: pointer;
  transition: border-color var(--fast, .15s), background var(--fast, .15s); }
.mf-choice b { font-size: 14px; }
.mf-choice small { color: var(--muted); font-size: 12px; line-height: 1.4; }
.mf-choice:hover:not(:disabled) { border-color: var(--accent); background: var(--accent-soft); }
.mf-choice.primary { border-color: var(--accent); }
.mf-choice.primary b { color: var(--accent); }
.mf-choice.danger:hover:not(:disabled) { border-color: var(--danger); background: color-mix(in srgb, var(--danger) 8%, var(--surface)); }
.mf-choice.danger b { color: var(--danger); }
.mf-choice:disabled { opacity: .55; cursor: not-allowed; }
.mf-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 20px; align-items: start; }
@media (max-width: 900px) { .mf-grid { grid-template-columns: minmax(0, 1fr); } }
.mf-h2 { font-size: 15px; margin: 0 0 12px; }
</style>
