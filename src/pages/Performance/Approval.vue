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
        <button class="btn" :disabled="busy || quarter?.status === 'finalized'" @click="recompute">Recalculate</button>
        <button class="btn" :disabled="busy || !results.length" @click="exportExcel">Export Excel</button>
      </div>
    </div>

    <div class="notice error" v-if="error">{{ error }}</div>
    <div class="notice ok" v-if="okMsg">{{ okMsg }}</div>

    <div class="card" v-if="!loading">
      <div class="table-wrap">
        <table class="table hover-rows">
          <thead><tr><th>Employee</th><th>COH</th><th>KPI</th><th>TMS</th><th>Total</th><th>Ready</th><th></th></tr></thead>
          <tbody>
            <tr v-for="r in results" :key="r.employeeId">
              <td>{{ nameOf(r.employeeId) }}</td>
              <td>{{ cell(r.cohScore, r.componentStatuses.coh) }}</td>
              <td>{{ cell(r.kpiScore, r.componentStatuses.kpi) }}</td>
              <td>{{ cell(r.tmsScore, r.componentStatuses.tms) }}</td>
              <td><b>{{ r.finalScore != null ? r.finalScore.toFixed(2) : '—' }}</b></td>
              <td><span class="pill" :class="r.finalScore != null ? 'green' : 'amber'">{{ r.finalScore != null ? 'Ready' : 'Pending' }}</span></td>
              <td><button class="act-pill" v-if="(r.revisionNumber || 1) > 1" @click="openHistory(r)">History</button></td>
            </tr>
            <tr v-if="!results.length"><td colspan="7" class="muted">No participants, or nothing calculated yet — click Recalculate.</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="card" style="margin-top:16px;" v-if="!loading">
      <h3 style="margin-top:0;">Before you finalize</h3>
      <ul style="font-size:13px; color:var(--text-2); margin:0 0 14px; padding-left:18px;">
        <li>{{ pendingCount }} of {{ results.length }} participant(s) have an incomplete component.</li>
        <li>Quarter status: {{ quarter?.status }}.</li>
      </ul>
      <button class="btn btn-primary" v-if="quarter?.status !== 'finalized'" :disabled="busy || !canFinalize" @click="finalize">Finalize quarter</button>
      <button class="btn" v-else :disabled="busy" @click="requestCorrectionNow">Request correction</button>
      <p class="note" v-if="quarter?.status === 'finalized'">This quarter is finalized and locked. Requesting a correction snapshots every current result into its revision history, then reopens the quarter so you can fix the underlying COH/KPI/TMS data and re-finalize.</p>
      <p class="note" v-else-if="!canFinalize">Finalize is disabled until every participant's COH, KPI and TMS components are ready.</p>
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
import { listQuarters, getQuarter } from '@/lib/performance/quarters.js';
import { listResults, recomputeAll, readyToFinalize, finalizeQuarter, exportResultsReport, requestCorrection, listRevisions } from '@/lib/performance/results.js';

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
const revisions = ref([]);

const nameOf = uid => staff.value.find(e => e.uid === uid)?.name || uid;
const cell = (score, status) => status === 'insufficientData' ? 'Insufficient data' : status === 'pending' ? 'Pending' : status === 'n/a' ? 'N/A' : score != null ? score.toFixed(2) : '—';
const formatWhen = ts => ts?.toDate ? ts.toDate().toLocaleString() : '—';
const pendingCount = computed(() => results.value.filter(r => r.finalScore == null).length);
const canFinalize = computed(() => readyToFinalize(results.value) && quarter.value?.status !== 'finalized');

async function load() {
  loading.value = true;
  try {
    quarters.value = (await listQuarters()).filter(q => ['pendingApproval', 'finalized'].includes(q.status));
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
  try { await exportResultsReport(quarter.value, results.value, nameOf); } catch (e) { error.value = e.message; }
}
async function finalize() {
  if (!window.confirm('Finalize this quarter? Results become read-only and corrections will need an authorized revision.')) return;
  busy.value = true; error.value = '';
  try { await finalizeQuarter(quarterId.value); okMsg.value = 'Quarter finalized.'; await load(); } catch (e) { error.value = e.message; } finally { busy.value = false; }
}

async function requestCorrectionNow() {
  const reason = window.prompt('Why does this finalized quarter need to be reopened for correction? (Required — recorded on every result\'s revision history.)');
  if (!reason) return;
  busy.value = true; error.value = '';
  try {
    const count = await requestCorrection(quarterId.value, reason);
    okMsg.value = `Reopened for correction — ${count} result(s) snapshotted. Fix the underlying data, then Recalculate and Finalize again.`;
    await load();
  } catch (e) { error.value = e.message; } finally { busy.value = false; }
}

async function openHistory(r) {
  historyFor.value = r;
  revisions.value = await listRevisions(quarterId.value, r.employeeId);
}
</script>
