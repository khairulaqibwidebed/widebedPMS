<template>
  <main class="content">
    <div class="loading-bar" v-show="loading"></div>
    <div class="page-head">
      <div>
        <h1>Final performance approval</h1>
        <div class="sub">Review every component before locking the quarter. Finalizing is permanent — corrections after this are auditable revisions.</div>
      </div>
      <div class="head-tools">
        <select class="select" v-model="quarterId" v-if="quarters.length">
          <option v-for="q in quarters" :key="q.id" :value="q.id">{{ q.name }}</option>
        </select>
        <button class="btn" :disabled="busy || isFinal" @click="recompute">Recalculate</button>
        <button class="btn" :disabled="busy || !shown.length" @click="exportExcel">Export Excel</button>
      </div>
    </div>


    <div class="notice error" v-if="error" style="margin-bottom:12px;">{{ error }}</div>

    <!-- 26 Nov 2026: search by name + Interns / Staff filter (intern = users/{uid}.intern, the HR details tick). Export Excel exports these rows. -->
    <div class="toolbar" v-if="!loading && results.length">
      <div class="search-box">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <input class="input" type="search" v-model="search" placeholder="Search employee name" aria-label="Search employee name">
      </div>
      <OptionPicker v-model="group" :options="GROUPS" label="Employee group" />
      <span class="muted shown-count" v-if="shown.length !== results.length">Showing {{ shown.length }} of {{ results.length }}</span>
    </div>

    <div class="card" v-if="!loading">
      <div class="table-wrap">
        <table class="table hover-rows">
          <thead><tr><th>Employee</th><th>COH</th><th>KPI</th><th>TMS</th><th>Total</th><th>Ready</th><th>Scored on</th><th></th></tr></thead>
          <tbody>
            <tr v-for="r in shown" :key="r.employeeId">
              <td>{{ nameOf(r.employeeId) }} <small class="muted" v-if="scoredOf(r) === 'none'">· COH only</small></td>
              <td>{{ cell(r.cohScore, r.componentStatuses.coh) }}</td>
              <td>{{ cell(r.kpiScore, r.componentStatuses.kpi) }}</td>
              <td>{{ cell(r.tmsScore, r.componentStatuses.tms) }}</td>
              <td><b>{{ r.finalScore != null ? r.finalScore.toFixed(2) : '—' }}</b></td>
              <td><span class="pill" :class="r.finalScore != null ? 'green' : 'amber'">{{ r.finalScore != null ? 'Ready' : 'Pending' }}</span></td>
              <!-- 23 Nov 2026: which of KPI and TMS count for this person (COH always does); changing it recalculates the total -->
              <td>
                <select class="select scored-on" :value="scoredOf(r)" :disabled="busy || isFinal || savingFor === r.employeeId"
                  :aria-label="'Scored on for ' + nameOf(r.employeeId)" @change="changeScoredOn(r, $event.target)">
                  <option v-for="(label, key) in SCORED_ON" :key="key" :value="key">{{ label }}</option>
                </select>
                <div class="scored-err" v-if="rowError[r.employeeId]">{{ rowError[r.employeeId] }}</div>
              </td>
              <td><button class="act-pill" v-if="(r.revisionNumber || 1) > 1" @click="openHistory(r)">History</button></td>
            </tr>
            <tr v-if="!results.length"><td colspan="8" class="muted">No participants, or nothing calculated yet — click Recalculate.</td></tr>
            <tr v-else-if="!shown.length"><td colspan="8" class="muted">No employees match this search or filter.</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="card" style="margin-top:16px;" v-if="!loading">
      <h3 style="margin-top:0;">Before you finalize</h3>
      <ul style="font-size:13px; color:var(--text-2); margin:0 0 14px; padding-left:18px;">
        <li>{{ pendingCount }} of {{ results.length }} participant(s) have an incomplete component.</li>
        <li>Quarter status: {{ quarterStatusLabel }}.</li>
        <li>Scored on picks what counts besides COH: KPI + TMS, KPI only, TMS only or None. The total is the counted marks
          scaled to 100 (e.g. COH 25 of 30 + KPI 32 of 40 = 57 of 70 = 81.43). Directors start on None (COH only).</li>
      </ul>
      <button class="btn btn-primary" v-if="!isFinal" :disabled="busy || !canFinalize" @click="dialog = 'finalize'">Finalize quarter</button>
      <button class="btn" v-else :disabled="busy" @click="correctionReason = ''; dialog = 'correction'">Request correction</button>
      <p class="note" v-if="isFinal">This quarter is finalized and locked. Requesting a correction snapshots every current result into its revision history, then reopens the quarter so you can fix the underlying COH/KPI/TMS data and re-finalize.</p>
      <p class="note" v-else-if="!canFinalize">Finalize is disabled until every participant's COH, KPI and TMS components are ready.</p>
    </div>

    <!-- Confirm finalize (in-page: the browser's own confirm() pop-up is blocked in this app) -->
    <div class="modal-back" v-if="dialog === 'finalize'" @click.self="dialog = null">
      <div class="modal" style="max-width: 460px;">
        <h2 style="margin-top:0;">Finalize {{ quarter?.name }}?</h2>
        <p class="muted">Results become read-only and are released to employees. Any change after this needs an authorized correction.</p>
        <div class="modal-foot">
          <button class="btn" @click="dialog = null">Cancel</button>
          <button class="btn btn-primary" :disabled="busy" @click="finalize">Finalize quarter</button>
        </div>
      </div>
    </div>

    <!-- Request correction: reason is required (in-page: prompt() is blocked in this app) -->
    <div class="modal-back" v-if="dialog === 'correction'" @click.self="dialog = null">
      <div class="modal" style="max-width: 500px;">
        <h2 style="margin-top:0;">Reopen {{ quarter?.name }} for correction</h2>
        <p class="muted">Every current result is saved to its revision history first. The reason is recorded on each one.</p>
        <div class="field"><label>Reason (required)</label>
          <textarea class="input" v-model="correctionReason" style="min-height: 90px;" placeholder="e.g. KPI rating for one employee was entered wrongly"></textarea>
        </div>
        <div class="modal-foot">
          <button class="btn" @click="dialog = null">Cancel</button>
          <button class="btn btn-primary" :disabled="busy || !correctionReason.trim()" @click="requestCorrectionNow">Reopen for correction</button>
        </div>
      </div>
    </div>

    <!-- Revision history for one employee's result -->
    <div class="modal-back" v-if="historyFor" @click.self="historyFor = null">
      <div class="modal" style="max-width: 600px;">
        <h2>Revision history — {{ nameOf(historyFor.employeeId) }}</h2>
        <div class="table-wrap">
          <table class="table hover-rows">
            <thead><tr><th>Rev</th><th>Final score</th><th>Reason</th><th>Corrected by</th><th>When</th></tr></thead>
            <tbody>
              <tr v-for="rev in revisions" :key="rev.id">
                <td>{{ rev.revision }}</td>
                <td>{{ rev.finalScore != null ? rev.finalScore.toFixed(2) : '—' }}</td>
                <td>{{ rev.revisionReason }}</td>
                <td>{{ rev.correctedByName }}</td>
                <td>{{ formatWhen(rev.correctedAt) }}</td>
              </tr>
              <tr v-if="!revisions.length"><td colspan="5" class="muted">No prior revisions.</td></tr>
            </tbody>
          </table>
        </div>
        <p class="note">Current (revision {{ historyFor.revisionNumber || 1 }}): {{ historyFor.finalScore != null ? historyFor.finalScore.toFixed(2) : '—' }}.</p>
        <div class="modal-foot">
          <button class="btn" @click="historyFor = null">Close</button>
        </div>
      </div>
    </div>
  </main>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { listStaff } from '@/lib/agreements/data.js';
import OptionPicker from '@/components/OptionPicker.vue';
import { listQuarters, getQuarter } from '@/lib/performance/quarters.js';
import { normalizeStatus, STATUS_LABELS } from '@/lib/performance/quarterStatus.js';
import { listResults, recomputeAll, readyToFinalize, finalizeQuarter, exportResultsReport, requestCorrection, listRevisions,
  SCORED_ON, setScoredOn } from '@/lib/performance/results.js';

const loading = ref(true);
const busy = ref(false);
const error = ref('');
const okMsg = ref('');

const quarters = ref([]);
const quarterId = ref('');
const quarter = ref(null);
const staff = ref([]);
const results = ref([]);
const historyFor = ref(null);
const dialog = ref(null);          // 'finalize' | 'correction' | null
const correctionReason = ref('');
const revisions = ref([]);

const nameOf = uid => staff.value.find(e => e.uid === uid)?.name || uid;

// 26 Nov 2026: search + group filter. Interns = the Intern tick on Staff accounts > HR details (users/{uid}.intern);
// anyone not ticked (or no longer an active account) counts as Staff. "Before you finalize" still counts everyone.
const GROUPS = [{ value: 'all', label: 'All Employees' }, { value: 'interns', label: 'Interns' }, { value: 'staff', label: 'Staff (Non-interns)' }];
const search = ref('');
const group = ref('all');
const isIntern = uid => staff.value.find(e => e.uid === uid)?.intern === true;
const shown = computed(() => {
  const q = search.value.trim().toLowerCase();
  return results.value.filter(r => (group.value === 'all' || (group.value === 'interns') === isIntern(r.employeeId))
    && (!q || String(nameOf(r.employeeId)).toLowerCase().includes(q)));
});
const cell = (score, status) => status === 'insufficientData' ? 'Insufficient data' : status === 'pending' ? 'Pending'
  : status === 'n/a' ? 'N/A' : status === 'notApplicable' ? 'Not scored' : score != null ? score.toFixed(2) : '—';
const formatWhen = ts => ts?.toDate ? ts.toDate().toLocaleString() : '—';
const pendingCount = computed(() => results.value.filter(r => r.finalScore == null).length);
// Quarters only have draft / active / finalized now; older saved statuses are mapped by normalizeStatus().
const isFinal = computed(() => normalizeStatus(quarter.value?.status) === 'finalized');
const quarterStatusLabel = computed(() => quarter.value ? STATUS_LABELS[normalizeStatus(quarter.value.status)] : '—');
const canFinalize = computed(() => readyToFinalize(results.value) && !isFinal.value);

async function load() {
  loading.value = true;
  try {
    quarters.value = (await listQuarters()).filter(q => ['active', 'finalized'].includes(normalizeStatus(q.status)));
    if (!quarterId.value && quarters.value.length) quarterId.value = quarters.value[0].id;
    if (!quarterId.value) return;
    quarter.value = await getQuarter(quarterId.value);
    if (!staff.value.length) staff.value = await listStaff();
    results.value = await listResults(quarterId.value);
  } catch (e) { error.value = e.message; } finally { loading.value = false; }
}
onMounted(load);
watch(quarterId, load);

async function recompute() {
  busy.value = true; error.value = '';
  try { results.value = await recomputeAll(quarterId.value); okMsg.value = 'Recalculated.'; } catch (e) { error.value = e.message; } finally { busy.value = false; }
}
async function exportExcel() {
  // 26 Nov 2026: exports what is on screen (search + filter)
  try { await exportResultsReport(quarter.value, shown.value, nameOf); } catch (e) { error.value = e.message; }
}
async function finalize() {
  busy.value = true; error.value = '';
  try { await finalizeQuarter(quarterId.value); okMsg.value = 'Quarter finalized.'; dialog.value = null; await load(); }
  catch (e) { error.value = e.message; dialog.value = null; } finally { busy.value = false; }
}

async function requestCorrectionNow() {
  const reason = correctionReason.value.trim();
  if (!reason) return;
  busy.value = true; error.value = '';
  try {
    const count = await requestCorrection(quarterId.value, reason);
    okMsg.value = `Reopened for correction — ${count} result(s) snapshotted. Fix the underlying data, then Recalculate and Finalize again.`;
    dialog.value = null;
    await load();
  } catch (e) { error.value = e.message; dialog.value = null; } finally { busy.value = false; }
}

// 23 Nov 2026: Scored on. Results saved before this have no scoredOn: COH-only ones show None, the rest KPI + TMS.
const savingFor = ref('');
const rowError = ref({});   // a failed save, shown under that person's dropdown
const scoredOf = r => SCORED_ON[r.scoredOn] ? r.scoredOn : (r.cohOnly ? 'none' : 'both');
async function changeScoredOn(r, el) {
  const value = el.value;
  if (value === scoredOf(r)) return;
  savingFor.value = r.employeeId; error.value = '';
  rowError.value = { ...rowError.value, [r.employeeId]: '' };
  try {
    const updated = await setScoredOn(quarterId.value, r.employeeId, value);
    results.value = results.value.map(x => x.employeeId === r.employeeId ? { ...x, ...updated } : x);
    okMsg.value = `${nameOf(r.employeeId)}: scored on ${SCORED_ON[value]}, total recalculated.`;
  } catch (e) {
    const msg = e.code === 'permission-denied' ? 'Firestore refused the save (only Directors, or the Performance Edit tick, can change results).' : (e.message || String(e));
    error.value = msg;
    rowError.value = { ...rowError.value, [r.employeeId]: msg };
    console.error('Scored on', e);
    el.value = scoredOf(r);   // puts the dropdown back to the saved choice
  } finally { savingFor.value = ''; }
}

async function openHistory(r) {
  historyFor.value = r;
  revisions.value = await listRevisions(quarterId.value, r.employeeId);
}
</script>

<style scoped>
.search-box { position: relative; flex: 1 1 260px; max-width: 380px; }
.search-box svg { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--muted); pointer-events: none; }
.search-box .input { width: 100%; max-width: none; padding-left: 36px; }
.shown-count { font-size: 13px; }
.scored-err { margin-top: 4px; max-width: 220px; font-size: 11.5px; line-height: 1.35; color: var(--red); }
</style>