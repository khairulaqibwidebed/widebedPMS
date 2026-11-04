<template>
  <main class="content">
    <div class="loading-bar" v-show="loading"></div>
    <div class="page-head">
      <div>
        <h1>Quarterly management</h1>
        <div class="sub">Create and configure performance evaluation quarters. Each quarter goes Draft → Active → Finalized.</div>
      </div>
      <div class="head-tools">
        <button class="act-pill" @click="showStatusHelp = true">What does each status mean?</button>
        <button class="btn btn-primary" v-if="canEdit" @click="openCreate">+ New quarter</button>
      </div>
    </div>

    <div class="notice error" v-if="error">{{ error }}</div>
    <div class="notice ok" v-if="okMsg">{{ okMsg }}</div>

    <div class="card" v-if="!loading">
      <div class="table-wrap">
        <table class="table hover-rows">
          <thead><tr><th>Quarter</th><th>Dates</th><th>Participants</th><th>Status</th><th></th></tr></thead>
          <tbody>
            <tr v-for="q in quarters" :key="q.id" @dblclick="openDetails(q)" style="cursor: pointer;">
              <td><b>{{ q.name }}</b></td>
              <td>{{ q.startDate }} – {{ q.endDate }}</td>
              <td>{{ countFor(q.id) }}</td>
              <td @click.stop>
                <select v-if="canEdit" class="select" :value="normalizeStatus(q.status)" :title="STATUS_HELP[normalizeStatus(q.status)]" @change="changeStatus(q, $event.target.value)">
                  <option v-for="s in STATUSES" :key="s" :value="s" :title="STATUS_HELP[s]">{{ statusLabel(s) }}</option>
                </select>
                <span v-else class="pill" :class="pillClass(q.status)">{{ statusLabel(q.status) }}</span>
              </td>
              <td>
                <div style="display:flex; gap:6px; flex-wrap:wrap;" @click.stop>
                  <button class="act-pill" @click="openDetails(q)">Details</button>
                  <button class="act-pill" @click="openParticipants(q)">Participants</button>
                  <button class="act-pill danger" v-if="canEdit" @click="deleting = q">Delete</button>
                </div>
              </td>
            </tr>
            <tr v-if="!quarters.length"><td colspan="5" class="muted">No quarters yet.</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Create / view / edit quarter -->
    <div class="modal-back" v-if="form" @click.self="form = null">
      <div class="modal" style="max-width: 640px;">
        <div style="display:flex; justify-content:space-between; align-items:baseline;">
          <h2 style="margin:0;">{{ form.id ? (viewOnly ? 'Quarter details' : 'Edit quarter') : 'New quarter' }}</h2>
          <button class="act-pill" v-if="form.id && viewOnly && canEdit" @click="viewOnly = false">Edit</button>
        </div>
        <FormField label="Name" req v-model="form.name" placeholder="Q3 2026" :disabled="fieldsDisabled" />
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <FormField label="Start date" req type="date" v-model="form.startDate" :disabled="fieldsDisabled" />
          <FormField label="End date" req type="date" v-model="form.endDate" :disabled="fieldsDisabled" />
          <FormField label="Evaluation opens" type="date" v-model="form.evaluationStart" :disabled="fieldsDisabled" />
          <FormField label="Evaluation closes" type="date" v-model="form.evaluationEnd" :disabled="fieldsDisabled" />
          <FormField label="COH deadline" type="date" v-model="form.cohDeadline" :disabled="fieldsDisabled" />
          <FormField label="KPI deadline" type="date" v-model="form.kpiDeadline" :disabled="fieldsDisabled" />
          <FormField label="Review deadline" type="date" v-model="form.reviewDeadline" :disabled="fieldsDisabled" />
          <FormField label="Finalization date" type="date" v-model="form.finalizationDate" :disabled="fieldsDisabled" />
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
          <FormField label="COH weight" type="number" min="0" max="100" v-model="form.weights.coh" :disabled="fieldsDisabled" />
          <FormField label="KPI weight" type="number" min="0" max="100" v-model="form.weights.kpi" :disabled="fieldsDisabled" />
          <FormField label="TMS weight" type="number" min="0" max="100" v-model="form.weights.tms" :disabled="fieldsDisabled" />
        </div>
        <p class="note" :class="{ error: weightTotal !== 100 }">Weights add up to {{ weightTotal }} (must be 100).</p>
        <FormField label="Minimum valid COH evaluations" type="number" min="1" v-model="form.minCohEvaluations" :disabled="fieldsDisabled" />
        <p class="note" v-if="!fieldsDisabled && normalizeStatus(form.status) !== 'draft'">This quarter is {{ statusLabel(form.status).toLowerCase() }} — changing dates or weights now can affect scores already calculated against it.</p>
        <div class="modal-foot">
          <button class="btn" @click="form = null">{{ fieldsDisabled ? 'Close' : 'Cancel' }}</button>
          <button class="btn btn-primary" v-if="!fieldsDisabled" :disabled="saving" @click="save">Save</button>
        </div>
      </div>
    </div>

    <!-- Participants -->
    <div class="modal-back" v-if="partsFor" @click.self="partsFor = null">
      <div class="modal" style="max-width: 520px;">
        <h2>Participants — {{ partsFor.name }}</h2>
        <p class="note">Only ticked employees are included in this quarter's evaluation. Everyone else sees
          "You are not included in this quarter's performance evaluation."</p>
        <div style="max-height: 360px; overflow-y: auto; border: 1px solid var(--border); border-radius: 8px; padding: 8px;">
          <label v-for="e in staff" :key="e.uid" style="display:flex; align-items:center; gap:8px; padding:6px 4px;">
            <input type="checkbox" :value="e.uid" v-model="selectedUids">
            {{ e.name }} <small class="muted">({{ e.role }})</small>
          </label>
        </div>
        <div class="modal-foot">
          <button class="btn" @click="partsFor = null">Cancel</button>
          <button class="btn btn-primary" :disabled="saving" @click="saveParticipants">Save participants</button>
        </div>
      </div>
    </div>

    <!-- Confirm delete (in-page: the browser's own confirm() pop-up is blocked in this app) -->
    <div class="modal-back" v-if="deleting" @click.self="deleting = null">
      <div class="modal" style="max-width: 460px;">
        <h2 style="margin-top:0;">Delete "{{ deleting.name }}"?</h2>
        <p class="muted" v-if="normalizeStatus(deleting.status) !== 'draft'">It's {{ statusLabel(deleting.status).toLowerCase() }} — its participants, evaluations and results stay in Firestore, but you won't be able to reach them from this page anymore.</p>
        <div class="modal-foot">
          <button class="btn" @click="deleting = null">Cancel</button>
          <button class="btn btn-primary" :disabled="saving" @click="remove(deleting)">Delete quarter</button>
        </div>
      </div>
    </div>

    <!-- What does each status mean? -->
    <div class="modal-back" v-if="showStatusHelp" @click.self="showStatusHelp = false">
      <div class="modal" style="max-width: 560px;">
        <h2>Quarter statuses</h2>
        <ul class="status-help-list">
          <li v-for="s in STATUSES" :key="s">
            <span class="pill status-help-pill" :class="pillClass(s)">{{ statusLabel(s) }}</span>
            <span class="status-help-desc">{{ STATUS_HELP[s] }}</span>
          </li>
        </ul>
        <div class="modal-foot">
          <button class="btn" @click="showStatusHelp = false">Close</button>
        </div>
      </div>
    </div>
  </main>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import FormField from '@/components/FormField.vue';
import { useSession } from '@/stores/session.js';
import { can } from '@/lib/access.js';
import { listStaff } from '@/lib/agreements/data.js';
import {
  listQuarters, createQuarter, updateQuarter, deleteQuarter, setStatus,
  listParticipants, setParticipants, DEFAULT_WEIGHTS
} from '@/lib/performance/quarters.js';
import { STATUSES, STATUS_LABELS, STATUS_HELP, normalizeStatus } from '@/lib/performance/quarterStatus.js';

const session = useSession();
const canEdit = computed(() => session.role === 'director' || can(session, 'performance.edit'));

const loading = ref(true);
const saving = ref(false);
const error = ref('');
const okMsg = ref('');
const quarters = ref([]);
const staff = ref([]);
const participantCounts = reactive({});

const form = ref(null);
const viewOnly = ref(false);
const partsFor = ref(null);
const selectedUids = ref([]);
// A quarter can be edited at any status (business rule) — view mode (opened by double-clicking a row, or the
// Details button) just starts read-only, with an "Edit" button to unlock the fields regardless of status.
const fieldsDisabled = computed(() => viewOnly.value);
const weightTotal = computed(() => !form.value ? 0 : Number(form.value.weights.coh) + Number(form.value.weights.kpi) + Number(form.value.weights.tms));

// Old quarters saved with a previous status (upcoming, evaluation, pendingApproval, archived) show as the nearest of the three.
const statusLabel = s => STATUS_LABELS[normalizeStatus(s)];
const pillClass = s => ({ draft: 'grey', active: 'amber', finalized: 'green' }[normalizeStatus(s)]);
const showStatusHelp = ref(false);
const deleting = ref(null);
const countFor = id => participantCounts[id] ?? '—';

async function load() {
  loading.value = true;
  try {
    quarters.value = await listQuarters();
    staff.value = await listStaff();
    await Promise.all(quarters.value.map(async q => { participantCounts[q.id] = (await listParticipants(q.id)).filter(p => p.participationStatus === 'active').length; }));
  } catch (e) { error.value = e.message; } finally { loading.value = false; }
}
onMounted(load);

function openCreate() {
  viewOnly.value = false;
  form.value = { status: 'draft', name: '', startDate: '', endDate: '', evaluationStart: '', evaluationEnd: '', cohDeadline: '', kpiDeadline: '', reviewDeadline: '', finalizationDate: '', minCohEvaluations: 1, weights: { ...DEFAULT_WEIGHTS } };
}
// Double-click a row (or the Details button): opens read-only, with an inline Edit button.
function openDetails(q) {
  viewOnly.value = true;
  form.value = { ...q, weights: { ...DEFAULT_WEIGHTS, ...q.weights } };
}

async function save() {
  if (weightTotal.value !== 100) { error.value = 'COH, KPI and TMS weights must add up to 100.'; return; }
  saving.value = true; error.value = '';
  try {
    const { id, ...data } = form.value;
    if (id) await updateQuarter(id, data); else await createQuarter(data);
    okMsg.value = 'Saved.'; form.value = null; await load();
  } catch (e) { error.value = e.message; } finally { saving.value = false; }
}

// The dropdown can jump to any of the three statuses, same "change at any status" business rule as the config.
async function changeStatus(q, newStatus) {
  if (newStatus === normalizeStatus(q.status) && newStatus === q.status) return;
  saving.value = true; error.value = '';
  try { await setStatus(q.id, newStatus); okMsg.value = `"${q.name}" is now ${statusLabel(newStatus).toLowerCase()}.`; await load(); }
  catch (e) { error.value = e.message; } finally { saving.value = false; }
}

async function remove(q) {
  saving.value = true; error.value = '';
  try { await deleteQuarter(q.id); okMsg.value = 'Quarter deleted.'; deleting.value = null; await load(); }
  catch (e) { error.value = e.message; deleting.value = null; } finally { saving.value = false; }
}

async function openParticipants(q) {
  partsFor.value = q;
  const existing = await listParticipants(q.id);
  selectedUids.value = existing.filter(p => p.participationStatus === 'active').map(p => p.employeeId);
}
async function saveParticipants() {
  saving.value = true; error.value = '';
  try {
    await setParticipants(partsFor.value.id, selectedUids.value, staff.value);
    okMsg.value = 'Participants saved.'; partsFor.value = null; await load();
  } catch (e) { error.value = e.message; } finally { saving.value = false; }
}
</script>

<style scoped>
.status-help-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
.status-help-list li { display: grid; grid-template-columns: 130px 1fr; gap: 14px; align-items: start; }
.status-help-pill { justify-self: start; white-space: nowrap; }
.status-help-desc { font-size: 13px; color: var(--text-2); line-height: 1.5; }
@media (max-width: 480px) {
  .status-help-list li { grid-template-columns: 1fr; gap: 4px; }
}
</style>