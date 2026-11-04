<template>
  <main class="content">
    <div class="loading-bar" v-show="loading"></div>
    <div class="page-head">
      <div>
        <h1>TMS performance</h1>
        <div class="sub">Task completion from the task system, equally weighted per task. The Director chooses which workspace and which tasks count for each person this quarter.</div>
      </div>
      <div class="head-tools">
        <select class="select" v-model="quarterId" v-if="quarters.length">
          <option v-for="q in quarters" :key="q.id" :value="q.id">{{ q.name }}</option>
        </select>
        <button class="btn" v-if="canManage && snapshots.length" :disabled="busy" @click="refreshAll">Refresh all from TMS</button>
      </div>
    </div>

    <div class="notice error" v-if="error">{{ error }}</div>
    <div class="notice ok" v-if="okMsg">{{ okMsg }}</div>

    <!-- ===== Everyone: my own TMS score and the tasks it's based on ===== -->
    <div class="card" style="margin-bottom:16px;" v-if="!loading">
      <h3 style="margin-top:0;">Your TMS score</h3>
      <template v-if="mySnapshot">
        <p style="font-size:13px; margin:0 0 8px;">
          {{ mySnapshot.completedTasks }} of {{ mySnapshot.totalTasks }} counted tasks completed
          <template v-if="mySnapshot.completionRate != null">({{ mySnapshot.completionRate }}%)</template>
          · {{ (mySnapshot.workspaceNames || []).join(', ') || '—' }} · last updated {{ formatWhen(mySnapshot.syncedAt) }}
        </p>
        <div class="tms-score-row">
          <div class="tms-bar"><div class="tms-bar-fill" :style="{ width: (mySnapshot.completionRate || 0) + '%' }"></div></div>
          <b>{{ mySnapshot.score != null ? mySnapshot.score.toFixed(2) : 'N/A' }} / {{ quarterWeight }}</b>
        </div>
        <p class="muted" style="font-size:12px;">{{ mySnapshot.approvedAt ? 'Approved by the Director.' : 'Estimated — not yet approved by the Director.' }}</p>

        <details class="tms-mine" v-if="(mySnapshot.tasks || []).length">
          <summary>Tasks counted this quarter ({{ mySnapshot.tasks.length }})</summary>
          <ul class="tms-task-list">
            <li v-for="t in mySnapshot.tasks" :key="t.id">
              <span class="tms-dot" :class="taskState(t)"></span>
              <span class="tms-task-title">{{ t.title }}</span>
              <span class="muted">{{ t.workspaceName }}<template v-if="t.dueDate"> · due {{ formatDay(t.dueDate) }}</template></span>
              <span class="pill" :class="statePill(t)">{{ stateLabel(t) }}</span>
            </li>
          </ul>
        </details>
      </template>
      <p class="muted" v-else>Your Director hasn't chosen which TMS tasks count for you this quarter yet.</p>
    </div>

    <!-- ===== Director: every participant ===== -->
    <div class="card" v-if="!loading && canManage">
      <h3 style="margin-top:0;">All employees</h3>
      <div class="table-wrap">
        <table class="table hover-rows">
          <thead><tr><th>Employee</th><th>Workspace</th><th>Counted</th><th>Done</th><th>Score</th><th>Approved</th><th></th></tr></thead>
          <tbody>
            <tr v-for="p in participants" :key="p.employeeId">
              <td>{{ p.employeeName }}</td>
              <td>{{ (snapOf(p.employeeId)?.workspaceNames || []).join(', ') || '—' }}</td>
              <td>{{ snapOf(p.employeeId)?.totalTasks ?? '—' }}</td>
              <td>{{ snapOf(p.employeeId)?.completedTasks ?? '—' }}</td>
              <td>{{ snapOf(p.employeeId) ? (snapOf(p.employeeId).score != null ? snapOf(p.employeeId).score.toFixed(2) : 'N/A') : '—' }}</td>
              <td>
                <span class="pill" :class="snapOf(p.employeeId)?.approvedAt ? 'green' : 'grey'">{{ snapOf(p.employeeId)?.approvedAt ? 'Yes' : 'No' }}</span>
              </td>
              <td>
                <div style="display:flex; gap:6px; flex-wrap:wrap;">
                  <button class="act-pill" :disabled="busy || isLocked" @click="openPicker(p)">{{ snapOf(p.employeeId) ? 'Edit tasks' : 'Choose tasks' }}</button>
                  <button class="act-pill" v-if="snapOf(p.employeeId)" :disabled="busy || isLocked" @click="refreshOne(p)">Refresh</button>
                  <button class="act-pill" v-if="snapOf(p.employeeId) && !snapOf(p.employeeId).approvedAt" :disabled="busy || isLocked" @click="approve(p)">Approve</button>
                </div>
              </td>
            </tr>
            <tr v-if="!participants.length"><td colspan="7" class="muted">No participants in this quarter yet.</td></tr>
          </tbody>
        </table>
      </div>
      <p class="note">Only tasks from workspaces that aren't Super Private are ever read from the task system. "Refresh" re-checks
        which of the ticked tasks have been completed since, without changing the selection.</p>
    </div>

    <!-- ===== Director: pick workspace(s) and tick tasks for one employee ===== -->
    <div class="modal-back" v-if="picker" @click.self="closePicker">
      <div class="modal tms-picker">
        <h2 style="margin-top:0;">{{ picker.employeeName }} — TMS tasks for {{ quarter?.name }}</h2>
        <p class="muted" style="margin-top:-6px;">Quarter {{ quarter?.startDate }} to {{ quarter?.endDate }}. Tick the tasks that count for this quarter.</p>

        <p class="muted" v-if="picker.loading">Loading tasks from the task system…</p>
        <div class="notice error" v-else-if="picker.error">{{ picker.error }}</div>

        <template v-else>
          <div class="tms-section-label">1. Workspace(s) that count for {{ picker.employeeName }}</div>
          <div class="tms-ws-list" v-if="pickerWorkspaces.length">
            <label v-for="w in pickerWorkspaces" :key="w.id" class="tms-ws" :class="{ on: picker.workspaceIds.has(w.id) }">
              <input type="checkbox" :checked="picker.workspaceIds.has(w.id)" @change="toggleWorkspace(w.id)">
              {{ w.name }} <small class="muted">{{ w.count }} task{{ w.count === 1 ? '' : 's' }}</small>
            </label>
          </div>
          <p class="muted" v-else>No tasks assigned to {{ picker.employeeName }} in the task system (Super Private workspaces are never shown).</p>

          <template v-if="picker.workspaceIds.size">
            <div class="tms-section-label" style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
              <span>2. Tasks that count this quarter</span>
              <span style="display:flex; gap:6px; flex-wrap:wrap; font-weight:400;">
                <label class="tms-filter"><input type="checkbox" v-model="picker.onlyQuarter"> Only due this quarter</label>
                <button class="act-pill" @click="tickDueInQuarter">Tick all due this quarter</button>
                <button class="act-pill" @click="picker.ticked = new Set()">Clear</button>
              </span>
            </div>

            <div class="tms-pick-list">
              <label v-for="t in visibleTasks" :key="t.id" class="tms-pick" :class="{ on: picker.ticked.has(t.id), off: t.cancelled }">
                <input type="checkbox" :checked="picker.ticked.has(t.id)" @change="toggleTask(t.id)">
                <span class="tms-pick-main">
                  <span class="tms-task-title">{{ t.title }}</span>
                  <span class="muted">
                    {{ t.workspaceName }} · {{ t.boardName }}
                    · {{ t.dueDate ? 'due ' + formatDay(t.dueDate) : 'no due date' }}
                  </span>
                </span>
                <span class="tms-tags">
                  <span class="pill blue" v-if="dueInQuarter(t, quarter)">This quarter</span>
                  <span class="pill amber" v-if="picker.elsewhere.has(t.id)" :title="'Already counted in ' + quarterName(picker.elsewhere.get(t.id))">Counted in {{ quarterName(picker.elsewhere.get(t.id)) }}</span>
                  <span class="pill" :class="statePill(t)">{{ stateLabel(t) }}</span>
                </span>
              </label>
              <p class="muted" v-if="!visibleTasks.length" style="padding:10px;">No tasks match — untick "Only due this quarter" to see the rest.</p>
            </div>
          </template>

          <div class="tms-preview">
            <span><b>{{ preview.total }}</b> counted</span>
            <span><b>{{ preview.done }}</b> done</span>
            <span v-if="preview.cancelled"><b>{{ preview.cancelled }}</b> cancelled (not scored)</span>
            <span>Score <b>{{ preview.score != null ? preview.score.toFixed(2) : 'N/A' }}</b> / {{ quarterWeight }}</span>
          </div>
          <p class="note" v-if="tickedOutsideWorkspaces">{{ tickedOutsideWorkspaces }} ticked task(s) sit in a workspace you've unticked — they won't be saved.</p>
        </template>

        <div class="modal-foot">
          <button class="btn" @click="closePicker">Cancel</button>
          <button class="btn btn-primary" :disabled="busy || picker.loading || !!picker.error || !picker.workspaceIds.size" @click="savePicker">Save selection</button>
        </div>
      </div>
    </div>
  </main>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useSession } from '@/stores/session.js';
import { listQuarters, listParticipants } from '@/lib/performance/quarters.js';
import { listStaff } from '@/lib/agreements/data.js';
import { isCohOnly } from '@/lib/performance/calc.js';
import {
  fetchEmployeeTasks, workspacesOf, dueInQuarter, localDay, countedElsewhere,
  saveSelection, refreshSnapshot, approveSnapshot, getSnapshot, listSnapshots, tmsScoreFromCounts
} from '@/lib/performance/tms.js';

const session = useSession();
// Choosing and approving TMS tasks is Director-only (the task system itself also refuses anyone else), same as KPI.
const canManage = computed(() => session.role === 'director');

const loading = ref(true);
const busy = ref(false);
const error = ref('');
const okMsg = ref('');

const quarters = ref([]);
const quarterId = ref('');
const quarter = computed(() => quarters.value.find(q => q.id === quarterId.value) || null);
const quarterWeight = computed(() => quarter.value?.weights?.tms ?? 30);
const isLocked = computed(() => ['finalized', 'archived'].includes(quarter.value?.status));
const quarterName = id => quarters.value.find(q => q.id === id)?.name || id;

const participants = ref([]);
const staffRoles = ref(null);
const snapshots = ref([]);
const mySnapshot = ref(null);
const snapOf = uid => snapshots.value.find(s => s.employeeId === uid) || null;

const formatWhen = ts => ts?.toDate ? ts.toDate().toLocaleString() : '—';
const formatDay = iso => { const d = localDay(iso); return d ? new Date(d + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'; };
const taskState = t => t.missing ? 'missing' : t.cancelled ? 'cancelled' : t.completed ? 'done' : 'open';
const stateLabel = t => ({ missing: 'Removed', cancelled: 'Cancelled', done: 'Done', open: t.status || 'Open' }[taskState(t)]);
const statePill = t => ({ missing: 'grey', cancelled: 'grey', done: 'green', open: 'amber' }[taskState(t)]);

async function load() {
  loading.value = true; error.value = '';
  try {
    quarters.value = (await listQuarters()).filter(q => q.status !== 'draft');
    if (!quarterId.value && quarters.value.length) {
      quarterId.value = (quarters.value.find(q => !['finalized', 'archived'].includes(q.status)) || quarters.value[0]).id;
    }
    if (!quarterId.value) return;
    mySnapshot.value = await getSnapshot(quarterId.value, session.user.uid);
    if (canManage.value) {
      // Directors are scored on COH only, so they have no KPIs / TMS tasks to set and are left out of this list.
      // Role comes from the participant record, or the staff list for participants saved before roles were stored.
      if (!staffRoles.value) { try { staffRoles.value = new Map((await listStaff()).map(e => [e.uid, e.role])); } catch (_) { staffRoles.value = new Map(); } }
      participants.value = (await listParticipants(quarterId.value))
        .filter(p => p.participationStatus === 'active' && !isCohOnly(p.role || staffRoles.value.get(p.employeeId)));
      snapshots.value = await listSnapshots(quarterId.value);
    }
  } catch (e) { error.value = e.message; } finally { loading.value = false; }
}
onMounted(load);
watch(quarterId, load);

// ---- Director: choose workspace(s) + tick tasks ----
const picker = ref(null);
const pickerWorkspaces = computed(() => picker.value ? workspacesOf(picker.value.tasks) : []);

async function openPicker(p) {
  error.value = ''; okMsg.value = '';
  picker.value = {
    employeeId: p.employeeId, employeeName: p.employeeName, loading: true, error: '',
    tasks: [], workspaceIds: new Set(), ticked: new Set(), elsewhere: new Map(), onlyQuarter: false
  };
  try {
    const [tasks, elsewhere] = await Promise.all([fetchEmployeeTasks(p.employeeId), countedElsewhere(p.employeeId, quarterId.value)]);
    const prior = snapOf(p.employeeId);
    const ws = workspacesOf(tasks);
    picker.value.tasks = tasks;
    picker.value.elsewhere = elsewhere;
    // Start from what was saved before; with nothing saved and only one workspace, pre-select that workspace.
    picker.value.workspaceIds = new Set(prior?.workspaceIds?.length ? prior.workspaceIds : (ws.length === 1 ? [ws[0].id] : []));
    picker.value.ticked = new Set((prior?.tasks || []).map(t => t.id));
  } catch (e) { picker.value.error = e.message; } finally { picker.value.loading = false; }
}
function closePicker() { picker.value = null; }

function toggleWorkspace(id) {
  const s = new Set(picker.value.workspaceIds);
  s.has(id) ? s.delete(id) : s.add(id);
  picker.value.workspaceIds = s;
}
function toggleTask(id) {
  const s = new Set(picker.value.ticked);
  s.has(id) ? s.delete(id) : s.add(id);
  picker.value.ticked = s;
}

// Tasks in the chosen workspaces; this quarter's first, then newest due date first.
const visibleTasks = computed(() => {
  if (!picker.value) return [];
  const { tasks, workspaceIds, onlyQuarter } = picker.value;
  return tasks
    .filter(t => workspaceIds.has(t.workspaceId) && (!onlyQuarter || dueInQuarter(t, quarter.value)))
    .sort((a, b) => Number(dueInQuarter(b, quarter.value)) - Number(dueInQuarter(a, quarter.value))
      || String(b.dueDate || '').localeCompare(String(a.dueDate || '')));
});

function tickDueInQuarter() {
  const s = new Set(picker.value.ticked);
  for (const t of picker.value.tasks) {
    if (picker.value.workspaceIds.has(t.workspaceId) && dueInQuarter(t, quarter.value) && !t.cancelled) s.add(t.id);
  }
  picker.value.ticked = s;
}

const tickedInScope = computed(() => picker.value
  ? picker.value.tasks.filter(t => picker.value.ticked.has(t.id) && picker.value.workspaceIds.has(t.workspaceId)) : []);
const tickedOutsideWorkspaces = computed(() => picker.value
  ? picker.value.tasks.filter(t => picker.value.ticked.has(t.id) && !picker.value.workspaceIds.has(t.workspaceId)).length : 0);
const preview = computed(() => {
  const scored = tickedInScope.value.filter(t => !t.cancelled);
  const done = scored.filter(t => t.completed).length;
  return {
    total: scored.length, done, cancelled: tickedInScope.value.length - scored.length,
    score: tmsScoreFromCounts(scored.length, done, quarterWeight.value).score
  };
});

async function savePicker() {
  busy.value = true; error.value = '';
  try {
    const ws = pickerWorkspaces.value.filter(w => picker.value.workspaceIds.has(w.id));
    await saveSelection(quarter.value, picker.value.employeeId, {
      workspaceIds: ws.map(w => w.id), workspaceNames: ws.map(w => w.name), tickedTasks: tickedInScope.value
    });
    okMsg.value = `Saved ${picker.value.employeeName}'s TMS tasks.`;
    picker.value = null;
    await load();
  } catch (e) { error.value = e.message; } finally { busy.value = false; }
}

// ---- Director: refresh / approve ----
async function refreshOne(p) {
  busy.value = true; error.value = ''; okMsg.value = '';
  try { await refreshSnapshot(quarter.value, p.employeeId); okMsg.value = `Refreshed ${p.employeeName}.`; await load(); }
  catch (e) { error.value = e.message; } finally { busy.value = false; }
}
async function refreshAll() {
  busy.value = true; error.value = ''; okMsg.value = '';
  const failed = [];
  let done = 0;
  for (const p of participants.value) {
    if (!snapOf(p.employeeId)) continue;
    try { await refreshSnapshot(quarter.value, p.employeeId); done++; } catch (e) { failed.push(`${p.employeeName}: ${e.message}`); }
  }
  okMsg.value = `Refreshed ${done} employee(s) from the task system.`;
  if (failed.length) error.value = failed.join(' · ');
  await load();
  busy.value = false;
}
async function approve(p) {
  busy.value = true; error.value = '';
  try { await approveSnapshot(quarterId.value, p.employeeId); await load(); } catch (e) { error.value = e.message; } finally { busy.value = false; }
}
</script>

<style scoped>
.tms-score-row { display: flex; align-items: center; gap: 10px; margin: 8px 0; }
.tms-bar { flex: 1; max-width: 300px; height: 8px; border-radius: 4px; background: var(--chip); overflow: hidden; }
.tms-bar-fill { height: 100%; background: var(--accent); }

.tms-mine summary { cursor: pointer; font-size: 13px; font-weight: 600; color: var(--text); margin-top: 6px; }
.tms-task-list { list-style: none; margin: 10px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.tms-task-list li { display: flex; align-items: center; gap: 8px; font-size: 13px; flex-wrap: wrap; }
.tms-task-title { color: var(--text); font-weight: 500; }
.tms-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--amber); flex-shrink: 0; }
.tms-dot.done { background: var(--green); }
.tms-dot.cancelled, .tms-dot.missing { background: var(--muted, var(--text-2)); }

.tms-picker { max-width: 820px; width: 100%; max-height: 90vh; overflow-y: auto; }
.tms-section-label { font-size: 13px; font-weight: 600; color: var(--text); margin: 16px 0 8px; }
.tms-ws-list { display: flex; flex-wrap: wrap; gap: 8px; }
.tms-ws {
  display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px; font-size: 13px; cursor: pointer;
  border: 1px solid var(--border); border-radius: 999px; background: var(--surface); color: var(--text);
}
.tms-ws.on { border-color: var(--accent); background: var(--hover); }
.tms-filter { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-2); }

.tms-pick-list { border: 1px solid var(--border); border-radius: var(--radius); max-height: 380px; overflow-y: auto; }
.tms-pick { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-top: 1px solid var(--border); cursor: pointer; }
.tms-pick:first-child { border-top: none; }
.tms-pick.on { background: var(--hover); }
.tms-pick.off .tms-task-title { text-decoration: line-through; color: var(--text-2); }
.tms-pick-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; font-size: 13px; }
.tms-pick-main .muted { font-size: 12px; }
.tms-tags { display: flex; gap: 4px; flex-wrap: wrap; justify-content: flex-end; }

.tms-preview {
  display: flex; gap: 18px; flex-wrap: wrap; font-size: 13px; color: var(--text-2);
  margin-top: 12px; padding: 10px 12px; background: var(--chip); border-radius: var(--radius);
}
.tms-preview b { color: var(--text); }

@media (max-width: 640px) {
  .tms-pick { flex-wrap: wrap; }
  .tms-tags { justify-content: flex-start; }
}
</style>