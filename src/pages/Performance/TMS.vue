<template>
  <main class="content">
    <div class="loading-bar" v-show="loading"></div>
    <div class="page-head">
      <div>
        <h1>TMS performance</h1>
        <div class="sub">Task completion, equally weighted per task. Scores here are estimated until a quarter is finalized.</div>
      </div>
      <div class="head-tools">
        <select class="select" v-model="quarterId" v-if="quarters.length">
          <option v-for="q in quarters" :key="q.id" :value="q.id">{{ q.name }}</option>
        </select>
        <button class="btn" v-if="canEdit" :disabled="syncing" @click="syncAll">Sync now</button>
      </div>
    </div>

    <div class="notice error" v-if="error">{{ error }}</div>
    <div class="notice ok" v-if="okMsg">{{ okMsg }}</div>

    <div class="card" style="margin-bottom:16px;" v-if="!loading">
      <h3 style="margin-top:0;">Your TMS score</h3>
      <template v-if="mySnapshot">
        <p style="font-size:13px;">{{ mySnapshot.completedTasks }} of {{ mySnapshot.totalTasks }} eligible tasks completed
          ({{ mySnapshot.completionRate }}%) · last synced {{ formatWhen(mySnapshot.syncedAt) }}</p>
        <div style="display:flex; align-items:center; gap:10px; margin:8px 0;">
          <div style="flex:1; max-width:300px; height:8px; border-radius:4px; background:var(--chip); overflow:hidden;">
            <div :style="{ width: (mySnapshot.completionRate || 0) + '%', height: '100%', background: 'var(--accent)' }"></div>
          </div>
          <b>{{ mySnapshot.score != null ? mySnapshot.score.toFixed(2) : 'N/A' }} / {{ quarterWeight }}</b>
        </div>
        <p class="muted" style="font-size:12px;">Estimated score, not yet approved by HR/Director, unless this quarter is finalized.</p>
      </template>
      <p class="muted" v-else>No synced TMS data for you this quarter yet.</p>
    </div>

    <div class="card" v-if="!loading && canEdit">
      <h3 style="margin-top:0;">All employees</h3>
      <div class="table-wrap">
        <table class="table hover-rows">
          <thead><tr><th>Employee</th><th>Completed</th><th>Eligible</th><th>Score</th><th>Approved</th><th></th></tr></thead>
          <tbody>
            <tr v-for="s in allSnapshots" :key="s.id">
              <td>{{ nameOf(s.employeeId) }}</td>
              <td>{{ s.completedTasks }}</td>
              <td>{{ s.totalTasks }}</td>
              <td>{{ s.score != null ? s.score.toFixed(2) : 'N/A' }}</td>
              <td>{{ s.approvedAt ? 'Yes' : 'No' }}</td>
              <td><button class="act-pill" v-if="!s.approvedAt" @click="approve(s)">Approve</button></td>
            </tr>
            <tr v-if="!allSnapshots.length"><td colspan="6" class="muted">No TMS snapshots yet for this quarter. Sync now to try fetching from the task system.</td></tr>
          </tbody>
        </table>
      </div>
      <p class="note">Sync calls the TMS task system directly. If the TMS hasn't added the performanceTasks
        endpoint yet, this will fail with "The task system refused this" — that's expected until it ships there.</p>
    </div>
  </main>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useSession } from '@/stores/session.js';
import { can } from '@/lib/access.js';
import { listStaff } from '@/lib/agreements/data.js';
import { listQuarters, listParticipants } from '@/lib/performance/quarters.js';
import { fetchEmployeeTasks, syncSnapshot, approveSnapshot, getSnapshot, listSnapshots } from '@/lib/performance/tms.js';

const session = useSession();
const canEdit = computed(() => session.role === 'director' || can(session, 'performance.edit'));

const loading = ref(true);
const syncing = ref(false);
const error = ref('');
const okMsg = ref('');

const quarters = ref([]);
const quarterId = ref('');
const staff = ref([]);
const mySnapshot = ref(null);
const allSnapshots = ref([]);
const quarterWeight = computed(() => quarters.value.find(q => q.id === quarterId.value)?.weights?.tms ?? 30);

const nameOf = uid => staff.value.find(e => e.uid === uid)?.name || uid;
const formatWhen = ts => ts?.toDate ? ts.toDate().toLocaleString() : '—';

async function load() {
  loading.value = true;
  try {
    quarters.value = (await listQuarters()).filter(q => q.status !== 'draft');
    if (!quarterId.value && quarters.value.length) quarterId.value = quarters.value[0].id;
    if (!quarterId.value) return;
    staff.value = await listStaff();
    mySnapshot.value = await getSnapshot(quarterId.value, session.user.uid);
    if (canEdit.value) allSnapshots.value = await listSnapshots(quarterId.value);
  } catch (e) { error.value = e.message; } finally { loading.value = false; }
}
onMounted(load);
watch(quarterId, load);

async function syncAll() {
  syncing.value = true; error.value = ''; okMsg.value = '';
  try {
    const parts = (await listParticipants(quarterId.value)).filter(p => p.participationStatus === 'active');
    const q = quarters.value.find(x => x.id === quarterId.value);
    const uids = parts.map(p => p.employeeId);
    const tasks = await fetchEmployeeTasks(uids, q.startDate, q.endDate);
    for (const uid of uids) await syncSnapshot(quarterId.value, uid, tasks, q.weights?.tms ?? 30);
    okMsg.value = `Synced ${uids.length} employee(s).`; await load();
  } catch (e) { error.value = e.message; } finally { syncing.value = false; }
}

async function approve(s) {
  try { await approveSnapshot(quarterId.value, s.employeeId); await load(); } catch (e) { error.value = e.message; }
}
</script>
