<template>
  <main class="content">
    <div class="loading-bar" v-show="loading"></div>
    <div class="page-head">
      <div>
        <h1>My performance</h1>
        <div class="sub">Your quarterly score, broken down by COH, KPI and TMS.</div>
      </div>
      <div class="head-tools">
        <select class="select" v-model="quarterId" v-if="quarters.length">
          <option v-for="q in quarters" :key="q.id" :value="q.id">{{ q.name }}</option>
        </select>
      </div>
    </div>

    <div class="notice error" v-if="error">{{ error }}</div>

    <div class="card" v-if="!loading && quarter && !amParticipant">
      <p><b>You are not included in this quarter's performance evaluation.</b></p>
    </div>

    <template v-else-if="!loading && quarter">
      <div class="kpis" style="margin-bottom:16px;">
        <div class="card kpi">
          <div class="label">Overall</div>
          <div class="value">{{ fmt(result?.finalScore) }}<small> / 100</small></div>
          <div class="hint">{{ result?.approvalStatus === 'finalized' ? 'Finalized' : 'Provisional' }}</div>
        </div>
        <div class="card kpi">
          <div class="label">COH</div>
          <div class="value">{{ fmt(result?.cohScore) }}<small> / {{ quarter.weights.coh }}</small></div>
          <div class="hint">{{ statusText(result?.componentStatuses?.coh) }}</div>
        </div>
        <div class="card kpi">
          <div class="label">KPI</div>
          <div class="value">{{ fmt(result?.kpiScore) }}<small> / {{ quarter.weights.kpi }}</small></div>
          <div class="hint">{{ statusText(result?.componentStatuses?.kpi) }}</div>
        </div>
        <div class="card kpi">
          <div class="label">TMS</div>
          <div class="value">{{ fmt(result?.tmsScore) }}<small> / {{ quarter.weights.tms }}</small></div>
          <div class="hint">{{ statusText(result?.componentStatuses?.tms) }}</div>
        </div>
      </div>

      <div class="card" style="margin-bottom:16px;">
        <h3 style="margin-top:0;">Jump to</h3>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <RouterLink class="btn" to="/Performance/coh">COH evaluations</RouterLink>
          <RouterLink class="btn" to="/Performance/kpi">KPI management</RouterLink>
          <RouterLink class="btn" to="/Performance/tms">TMS performance</RouterLink>
        </div>
      </div>

      <div class="card">
        <h3 style="margin-top:0;">Finalized quarters</h3>
        <div class="table-wrap">
          <table class="table hover-rows">
            <thead><tr><th>Quarter</th><th>COH</th><th>KPI</th><th>TMS</th><th>Final</th></tr></thead>
            <tbody>
              <tr v-for="h in history" :key="h.quarterId">
                <td>{{ quarterName(h.quarterId) }}</td>
                <td>{{ fmt(h.cohScore) }}</td>
                <td>{{ fmt(h.kpiScore) }}</td>
                <td>{{ fmt(h.tmsScore) }}</td>
                <td><b>{{ fmt(h.finalScore) }}</b></td>
              </tr>
              <tr v-if="!history.length"><td colspan="5" class="muted">No finalized quarters yet.</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <div class="card" v-else-if="!loading">
      <p class="muted">No performance quarter is open right now.</p>
    </div>
  </main>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useSession } from '@/stores/session.js';
import { listQuarters, listParticipants } from '@/lib/performance/quarters.js';
import { getResult } from '@/lib/performance/results.js';

const session = useSession();
const loading = ref(true);
const error = ref('');

const quarters = ref([]);
const quarterId = ref('');
const quarter = computed(() => quarters.value.find(q => q.id === quarterId.value) || null);
const amParticipant = ref(true);
const result = ref(null);
const history = ref([]);

const fmt = n => n == null ? '—' : n.toFixed(2);
const statusText = s => ({ insufficientData: 'Insufficient data', pending: 'Pending review', 'n/a': 'No eligible tasks', ok: 'Calculated' }[s] || 'Not started');
const quarterName = id => quarters.value.find(q => q.id === id)?.name || id;

async function load() {
  loading.value = true;
  try {
    const all = await listQuarters();
    quarters.value = all.filter(q => q.status !== 'draft');
    if (!quarterId.value && quarters.value.length) quarterId.value = quarters.value.find(q => q.status !== 'finalized' && q.status !== 'archived')?.id || quarters.value[0].id;
    if (quarterId.value) {
      const parts = await listParticipants(quarterId.value);
      amParticipant.value = parts.some(p => p.employeeId === session.user.uid && p.participationStatus === 'active');
      result.value = amParticipant.value ? await getResult(quarterId.value, session.user.uid) : null;
    }
    const finalized = all.filter(q => q.status === 'finalized' || q.status === 'archived');
    history.value = (await Promise.all(finalized.map(q => getResult(q.id, session.user.uid)))).filter(Boolean);
  } catch (e) { error.value = e.message; } finally { loading.value = false; }
}
onMounted(load);
watch(quarterId, load);
</script>
