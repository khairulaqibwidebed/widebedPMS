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


    <!-- 18 Nov 2026: saved / error messages (they were set but never shown) -->
    <div class="notice ok" v-if="okMsg" role="status">{{ okMsg }}</div>
    <div class="notice error" v-if="error" role="alert">{{ error }}</div>

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
          <div class="tk-head tk-grid tk-grid-mine"><span>Task</span><span>Status</span><span class="tk-r">Due</span></div>
          <div v-for="t in mySnapshot.tasks" :key="t.id" class="tk-card tk-grid tk-grid-mine">
            <div class="tk-main">
              <div class="tk-title">{{ t.title }}</div>
              <div class="tk-meta">{{ placeOf(t) }}</div>
              <DueHistory :list="t.dueHistory" />
            </div>
            <div class="tk-status"><span class="tk-tag" :class="statePill(t)">{{ stateLabel(t) }}</span></div>
            <div class="tk-due"><b>{{ t.dueDate ? formatDay(t.dueDate) : 'No due date' }}</b><small>{{ changedText(t) }}</small></div>
          </div>
        </details>
      </template>
      <p class="muted" v-else>Your Director hasn't chosen which TMS tasks count for you this quarter yet.</p>
    </div>

    <!-- ===== Director: every participant ===== -->
    <div class="card" v-if="!loading && canManage">
      <h3 style="margin-top:0;">All employees</h3>
      <div class="table-wrap">
        <table class="table hover-rows">
          <thead><tr><th>Employee</th><th>Workspace</th><th>Counted</th><th>Done</th><th>Score</th><th>Approved</th><th class="tms-acts-h"><span class="sr-only">Actions</span></th></tr></thead>
          <tbody>
            <tr v-for="p in participants" :key="p.employeeId">
              <td>{{ p.employeeName }}</td>
              <td>{{ (snapOf(p.employeeId)?.workspaceNames || []).join(', ') || '—' }}</td>
              <td>{{ snapOf(p.employeeId)?.totalTasks ?? '—' }}</td>
              <td>{{ snapOf(p.employeeId)?.completedTasks ?? '—' }}</td>
              <td>{{ snapOf(p.employeeId) ? (snapOf(p.employeeId).score != null ? snapOf(p.employeeId).score.toFixed(2) : 'N/A') : '—' }}</td>
              <!-- 18 Nov 2026: nothing chosen (or a workspace with no task) shows a dash, never "No" / "Yes" -->
              <td>
                <span v-if="!snapOf(p.employeeId)" class="muted">—</span>
                <span v-else class="pill" :class="snapOf(p.employeeId).approvedAt ? 'green' : 'grey'"
                  :title="snapOf(p.employeeId).approvedAt ? 'Approved ' + formatWhen(snapOf(p.employeeId).approvedAt) : 'Estimated, not approved yet'">{{ snapOf(p.employeeId).approvedAt ? 'Yes' : 'No' }}</span>
              </td>
              <td>
                <div class="tms-acts">
                  <button class="act-pill" :disabled="busy || isLocked" @click="openPicker(p)">{{ snapOf(p.employeeId) ? 'Edit tasks' : 'Choose tasks' }}</button>
                  <button class="act-pill" v-if="snapOf(p.employeeId)" :disabled="busy || isLocked" @click="refreshOne(p)">Refresh</button>
                  <button class="act-pill good" v-if="snapOf(p.employeeId) && !snapOf(p.employeeId).approvedAt" :disabled="busy || isLocked" @click="approve(p)">Approve</button>
                  <button class="act-pill" v-if="snapOf(p.employeeId)?.approvedAt" :disabled="busy || isLocked" @click="unapprove(p)" title="Back to Estimated until you approve again">Undo approval</button>
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

    <!-- ===== Director: pick workspace(s), done columns and tasks for one employee (redesigned 18 Nov 2026) ===== -->
    <div class="modal-back" v-if="picker" @click.self="closePicker">
      <div class="modal tms-picker">
        <div class="tp-head">
          <span class="tp-av" aria-hidden="true">{{ initials(picker.employeeName) }}</span>
          <div class="tp-who">
            <h2>{{ picker.employeeName }} — TMS tasks</h2>
            <div class="muted">{{ quarter?.name }} · {{ formatDay(quarter?.startDate) }} to {{ formatDay(quarter?.endDate) }}</div>
          </div>
          <span class="tk-tag" :class="picker.approved ? 'green' : 'grey'">{{ picker.approved ? 'Approved' : 'Not approved yet' }}</span>
        </div>

        <p class="muted loading-line" v-if="picker.loading">Loading tasks from the task system…</p>
        <div class="notice error" v-else-if="picker.error">{{ picker.error }}</div>

        <template v-else>
          <!-- 1. Workspaces -->
          <section class="tp-sec">
            <div class="tp-sh"><span class="tp-st"><span class="tp-num">1</span>Workspaces that count for {{ picker.employeeName }}</span></div>
            <div class="tms-ws-list" v-if="pickerWorkspaces.length">
              <label v-for="w in pickerWorkspaces" :key="w.id" class="tms-ws" :class="{ on: picker.workspaceIds.has(w.id) }">
                <input type="checkbox" :checked="picker.workspaceIds.has(w.id)" @change="toggleWorkspace(w.id)">
                {{ w.name }} <small class="muted">{{ w.count }} task{{ w.count === 1 ? '' : 's' }}</small>
              </label>
            </div>
            <p class="muted" v-else>No tasks assigned to {{ picker.employeeName }} in the task system (Super Private workspaces are never shown).</p>
          </section>

          <template v-if="picker.workspaceIds.size">
            <!-- 2. Columns that count as done, per board -->
            <section class="tp-sec">
              <div class="tp-sh">
                <span class="tp-st"><span class="tp-num">2</span>Columns that count as done</span>
                <select class="select tp-board" v-model="picker.boardId" v-if="pickerBoards.length > 1" aria-label="Board">
                  <option v-for="b in pickerBoards" :key="b.id" :value="b.id">{{ b.name }}<template v-if="b.workspaceName && b.workspaceName !== b.name"> · {{ b.workspaceName }}</template></option>
                </select>
                <b class="tp-board-one" v-else-if="pickerBoards.length">{{ pickerBoards[0].name }}</b>
              </div>
              <template v-if="activeBoard">
                <div class="tp-cols" v-if="activeBoard.columns.length">
                  <button type="button" v-for="c in activeBoard.columns" :key="c.id" class="tp-col" :class="{ on: isDoneCol(activeBoard.id, c) }"
                    :aria-pressed="String(isDoneCol(activeBoard.id, c))" @click="toggleDoneCol(activeBoard, c)">
                    <span class="tp-col-tick" aria-hidden="true">✓</span>{{ c.name }}<small v-if="c.archived" class="muted"> (archived)</small>
                  </button>
                </div>
                <p class="muted" v-else>This board's columns couldn't be read. Update the task system to the 18 Nov 2026 version.</p>
                <p class="tp-hint" v-if="!boardSet(activeBoard.id)">Not set yet: the task system's own done column{{ tmsDoneNames(activeBoard).length === 1 ? '' : 's' }} ({{ tmsDoneNames(activeBoard).join(', ') || 'none' }}) count{{ tmsDoneNames(activeBoard).length === 1 ? 's' : '' }} until you tick here.</p>
                <p class="tp-hint" v-else>Saved for this board with "Save selection". Everyone with tasks on {{ activeBoard.name }} is scored the same way.</p>
              </template>
            </section>

            <!-- 3. Tasks -->
            <section class="tp-sec">
              <div class="tp-sh">
                <span class="tp-st"><span class="tp-num">3</span>Tasks that count this quarter</span>
                <span class="tp-tools">
                  <label class="tms-filter"><input type="checkbox" v-model="picker.onlyQuarter"> Only due this quarter</label>
                  <label class="tms-filter"><input type="checkbox" v-model="picker.hideUsed"> Hide tasks used in another quarter</label>
                  <button class="act-pill" @click="tickDueInQuarter">Tick all due this quarter</button>
                  <button class="act-pill" @click="picker.ticked = new Set()">Clear</button>
                </span>
              </div>

              <div class="tk-head tk-grid"><span></span><span>Task</span><span>Status</span><span class="tk-r">Due</span></div>
              <div class="tk-list">
                <label v-for="t in visibleTasks" :key="t.id" class="tk-card tk-grid" :class="{ on: picker.ticked.has(t.id), off: t.cancelled }">
                  <input type="checkbox" :checked="picker.ticked.has(t.id)" @change="toggleTask(t.id)" :aria-label="'Count ' + t.title">
                  <div class="tk-main">
                    <div class="tk-title">{{ t.title }}</div>
                    <div class="tk-meta">{{ placeOf(t) }}</div>
                    <DueHistory :list="t.dueHistory" @click.stop.prevent />
                  </div>
                  <div class="tk-status">
                    <span class="tk-tag" :class="statePill(liveTask(t))">{{ stateLabel(liveTask(t)) }}</span>
                    <span class="tk-tag red" v-if="picker.elsewhere.has(t.id)" :title="'Already counted in ' + quarterName(picker.elsewhere.get(t.id))">Used in {{ quarterName(picker.elsewhere.get(t.id)) }}</span>
                    <span class="tk-tag blue" v-if="dueInQuarter(t, quarter)">This quarter</span>
                  </div>
                  <div class="tk-due"><b>{{ t.dueDate ? formatDay(t.dueDate) : 'No due date' }}</b><small>{{ changedText(t) }}</small></div>
                </label>
                <p class="muted tk-empty" v-if="!visibleTasks.length">No tasks match. Untick "Only due this quarter" or "Hide tasks used in another quarter" to see the rest.</p>
              </div>
            </section>
          </template>

          <div class="tp-sum">
            <div class="tp-mc"><span>Counted</span><b>{{ preview.total }}</b></div>
            <div class="tp-mc"><span>Done</span><b>{{ preview.done }}</b></div>
            <div class="tp-mc"><span>Score</span><b>{{ preview.score != null ? preview.score.toFixed(2) : 'N/A' }}<small> / {{ quarterWeight }}</small></b></div>
          </div>
          <div class="tp-bar"><div class="tp-bar-fill" :style="{ width: (preview.total ? preview.done / preview.total * 100 : 0) + '%' }"></div></div>
          <p class="note" v-if="preview.cancelled">{{ preview.cancelled }} cancelled task{{ preview.cancelled === 1 ? ' is' : 's are' }} ticked but not scored.</p>
          <!-- Remove the selection (12 Nov 2026): untick every workspace, then "Remove selection" -->
          <p class="note" v-if="picker.hadSelection && !picker.workspaceIds.size">No workspace is ticked. "Remove selection" takes every task off {{ picker.employeeName }}'s TMS score for this quarter.</p>
          <p class="note" v-if="tickedOutsideWorkspaces">{{ tickedOutsideWorkspaces }} ticked task(s) sit in a workspace you've unticked — they won't be saved.</p>
        </template>

        <div class="modal-foot">
          <button class="btn tms-remove-link" v-if="picker.hadSelection && !picker.loading && !picker.error && picker.workspaceIds.size" :disabled="busy" @click="untickAll">Remove selection…</button>
          <button class="btn" @click="closePicker">Cancel</button>
          <template v-if="removing">
            <template v-if="picker.confirmRemove">
              <span class="muted">Remove {{ picker.employeeName }}'s tasks for this quarter?</span>
              <button class="btn btn-danger" :disabled="busy" @click="removePicker">Yes, remove</button>
              <button class="btn" :disabled="busy" @click="picker.confirmRemove = false">No</button>
            </template>
            <button v-else class="btn btn-danger" :disabled="busy" @click="picker.confirmRemove = true">Remove selection</button>
          </template>
          <span class="muted tp-need" v-if="!removing && !picker.loading && !picker.error && picker.workspaceIds.size && !tickedInScope.length">Tick at least one task to save.</span>
          <button v-else-if="picker.approved && !removing && !picker.loading && !picker.error" class="btn" :disabled="busy" @click="unapproveFromPicker" title="Back to Estimated until you approve again">Undo approval</button>
          <button v-if="!removing" class="btn btn-primary" :disabled="busy || picker.loading || !!picker.error || !picker.workspaceIds.size || !tickedInScope.length" @click="savePicker">Save selection</button>
        </div>
      </div>
    </div>
  </main>
</template>

<script setup>
import { ref, computed, watch, onMounted, h } from 'vue';
import { useSession } from '@/stores/session.js';
import { listQuarters, listParticipants } from '@/lib/performance/quarters.js';
import { listStaff } from '@/lib/agreements/data.js';
import { isCohOnly } from '@/lib/performance/calc.js';
import {
  fetchEmployeeTaskData, workspacesOf, dueInQuarter, localDay, countedElsewhere, loadDoneColumns, saveDoneColumns, withDone,
  saveSelection, clearSelection, hasSelection, refreshSnapshot, approveSnapshot, unapproveSnapshot, getSnapshot, listSnapshots, tmsScoreFromCounts
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
// A selection that was removed (no workspace left) counts as nothing chosen.
const snapOf = uid => snapshots.value.find(s => s.employeeId === uid && hasSelection(s)) || null;

const formatWhen = ts => ts?.toDate ? ts.toDate().toLocaleString() : '—';
const formatDay = iso => { const d = localDay(iso); return d ? new Date(d + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'; };
const taskState = t => t.missing ? 'missing' : t.cancelled ? 'cancelled' : t.completed ? 'done' : 'open';
const stateLabel = t => ({ missing: 'Removed', cancelled: 'Cancelled', done: 'Done', open: 'Not done' }[taskState(t)]);
const statePill = t => ({ missing: 'grey', cancelled: 'grey', done: 'green', open: 'amber' }[taskState(t)]);
// 18 Nov 2026: where a task sits, its due date changes, initials for the picker header
const titleCase = s => String(s || '').toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());
const placeOf = t => [t.boardName || t.workspaceName, t.column || titleCase(t.status)].filter(Boolean).join(' · ');
const changedText = t => { const n = (t.dueHistory || []).length; return n ? `Changed ${n}×` : (t.dueDate ? 'Never changed' : ''); };
const initials = name => String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();

// "Due date changed 2× · show history" and the timeline under it (who moved it, from, to, when)
const DueHistory = {
  props: { list: { type: Array, default: () => [] } },
  setup(props) {
    const open = ref(false);
    const when = iso => { if (!iso) return ''; const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }); };
    return () => {
      const list = props.list || [];
      if (!list.length) return null;
      return h('div', { class: 'dh' }, [
        h('button', { type: 'button', class: 'dh-btn', 'aria-expanded': String(open.value), onClick: e => { e.preventDefault(); e.stopPropagation(); open.value = !open.value; } },
          `Due date changed ${list.length}× · ${open.value ? 'hide' : 'show'} history`),
        open.value ? h('ol', { class: 'dh-list' }, [...list].reverse().map((x, i) => h('li', { key: i }, [
          h('span', null, `${x.from ? formatDay(x.from) : 'No date'} → `), h('b', null, x.to ? formatDay(x.to) : 'No date'),
          h('small', null, `by ${x.byName || 'Someone'} · ${when(x.at)}`)
        ]))) : null
      ]);
    };
  }
};

async function load() {
  loading.value = true; error.value = '';
  try {
    quarters.value = (await listQuarters()).filter(q => q.status !== 'draft');
    if (!quarterId.value && quarters.value.length) {
      quarterId.value = (quarters.value.find(q => !['finalized', 'archived'].includes(q.status)) || quarters.value[0]).id;
    }
    if (!quarterId.value) return;
    const mine = await getSnapshot(quarterId.value, session.user.uid);
    mySnapshot.value = hasSelection(mine) ? mine : null;   // a removed selection counts as none
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

// ---- Done columns per board (18 Nov 2026) ----
// Boards of the ticked workspaces. The TMS sends each board with all its columns; an older TMS sends none, so the
// columns are then pieced together from the tasks.
const pickerBoards = computed(() => {
  if (!picker.value) return [];
  const { tasks, boards, workspaceIds } = picker.value;
  const map = new Map(boards.map(b => [b.id, { ...b, columns: [...(b.columns || [])] }]));
  for (const t of tasks) {
    const id = t.boardId || 'main';
    if (!map.has(id)) map.set(id, { id, name: t.boardName || 'Board', workspaceId: t.workspaceId, workspaceName: t.workspaceName, columns: [], guessed: true });
    const b = map.get(id);
    if (b.guessed && t.columnId && !b.columns.some(c => c.id === t.columnId)) b.columns.push({ id: t.columnId, name: t.column || titleCase(t.status), isDone: !!t.completed });
  }
  return [...map.values()].filter(b => workspaceIds.has(b.workspaceId)).sort((a, b) => a.name.localeCompare(b.name));
});
const activeBoard = computed(() => pickerBoards.value.find(b => b.id === picker.value?.boardId) || pickerBoards.value[0] || null);
watch(pickerBoards, list => { if (picker.value && !list.some(b => b.id === picker.value.boardId)) picker.value.boardId = list[0]?.id || ''; });
const boardSet = id => Array.isArray(picker.value?.doneCfg[id]?.doneColumnIds);
const tmsDoneNames = b => b.columns.filter(c => c.isDone).map(c => c.name);
// Ticked, or (not set yet) the task system's own done column
const isDoneCol = (boardId, c) => boardSet(boardId) ? picker.value.doneCfg[boardId].doneColumnIds.includes(c.id) : !!c.isDone;
function toggleDoneCol(board, c) {
  const cur = boardSet(board.id) ? picker.value.doneCfg[board.id].doneColumnIds : board.columns.filter(x => x.isDone).map(x => x.id);
  const ids = cur.includes(c.id) ? cur.filter(x => x !== c.id) : [...cur, c.id];
  picker.value.doneCfg = { ...picker.value.doneCfg, [board.id]: {
    boardName: board.name, workspaceName: board.workspaceName || '',
    doneColumnIds: ids, doneColumnNames: board.columns.filter(x => ids.includes(x.id)).map(x => x.name)
  } };
  picker.value.doneDirty = true;
}
// The task as it will be scored with the columns ticked now
const liveTask = t => picker.value ? withDone(t, picker.value.doneCfg) : t;

async function openPicker(p) {
  error.value = ''; okMsg.value = '';
  picker.value = {
    employeeId: p.employeeId, employeeName: p.employeeName, loading: true, error: '',
    tasks: [], boards: [], workspaceIds: new Set(), ticked: new Set(), elsewhere: new Map(), onlyQuarter: false, hideUsed: false,
    doneCfg: {}, doneDirty: false, boardId: '', approved: !!snapOf(p.employeeId)?.approvedAt,
    hadSelection: !!snapOf(p.employeeId), confirmRemove: false   // something is saved for this person: it can be removed
  };
  try {
    const [{ tasks, boards }, elsewhere, doneCfg] = await Promise.all([fetchEmployeeTaskData(p.employeeId),
      countedElsewhere(p.employeeId, quarterId.value), loadDoneColumns().catch(() => ({}))]);
    const prior = snapOf(p.employeeId);
    const ws = workspacesOf(tasks);
    picker.value.tasks = tasks;
    picker.value.boards = boards;
    picker.value.doneCfg = doneCfg;
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
  const { tasks, workspaceIds, onlyQuarter, hideUsed, elsewhere } = picker.value;
  return tasks
    .filter(t => workspaceIds.has(t.workspaceId) && (!onlyQuarter || dueInQuarter(t, quarter.value)) && !(hideUsed && elsewhere.has(t.id)))
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
  const done = scored.filter(t => liveTask(t).completed).length;
  return {
    total: scored.length, done, cancelled: tickedInScope.value.length - scored.length,
    score: tmsScoreFromCounts(scored.length, done, quarterWeight.value).score
  };
});

async function savePicker() {
  busy.value = true; error.value = '';
  try {
    const ws = pickerWorkspaces.value.filter(w => picker.value.workspaceIds.has(w.id));
    // Done columns first (shared by everyone on those boards), then this person's tasks scored with them
    if (picker.value.doneDirty) await saveDoneColumns(picker.value.doneCfg);
    await saveSelection(quarter.value, picker.value.employeeId, {
      workspaceIds: ws.map(w => w.id), workspaceNames: ws.map(w => w.name), tickedTasks: tickedInScope.value, doneCfg: picker.value.doneCfg
    });
    okMsg.value = picker.value.doneDirty
      ? `Saved ${picker.value.employeeName}'s TMS tasks and the done columns. Others on those boards follow the new columns at their next Refresh.`
      : `Saved ${picker.value.employeeName}'s TMS tasks.`;
    picker.value = null;
    await load();
  } catch (e) { error.value = e.message; } finally { busy.value = false; }
}

// Removing: something is saved for this person and no workspace is ticked any more.
const removing = computed(() => !!picker.value && picker.value.hadSelection && !picker.value.loading && !picker.value.error && !picker.value.workspaceIds.size);
function untickAll() { picker.value.workspaceIds = new Set(); picker.value.ticked = new Set(); picker.value.confirmRemove = true; }
async function removePicker() {
  busy.value = true; error.value = '';
  try {
    await clearSelection(quarter.value, picker.value.employeeId);
    okMsg.value = `Removed ${picker.value.employeeName}'s TMS tasks for this quarter.`;
    picker.value = null;
    await load();
  } catch (e) { error.value = e.message; picker.value = null; } finally { busy.value = false; }
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
async function unapprove(p) {
  busy.value = true; error.value = ''; okMsg.value = '';
  try { await unapproveSnapshot(quarterId.value, p.employeeId); okMsg.value = `${p.employeeName}'s TMS score is back to Estimated.`; await load(); }
  catch (e) { error.value = e.message; } finally { busy.value = false; }
}
async function unapproveFromPicker() {
  const p = { employeeId: picker.value.employeeId, employeeName: picker.value.employeeName };
  await unapprove(p);
  if (picker.value) picker.value.approved = false;
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
.tms-mine summary { cursor: pointer; font-size: 13px; font-weight: 600; color: var(--text); margin: 6px 0 10px; }
.tms-remove-link { margin-right: auto; }
.tms-acts { display: flex; gap: 6px; flex-wrap: nowrap; justify-content: flex-end; }
.tms-acts-h { width: 1%; }
.act-pill.good { color: var(--green); border-color: color-mix(in srgb, var(--green) 45%, var(--border)); }
.tp-need { font-size: 12px; align-self: center; }

/* ---- Task picker (18 Nov 2026) ---- */
.tms-picker { max-width: 900px; width: 100%; padding: 0; overflow: hidden; }
.tp-head { display: flex; align-items: center; gap: 12px; padding: 18px 22px; border-bottom: 1px solid var(--border); }
.tp-av { width: 40px; height: 40px; border-radius: 50%; flex: none; display: flex; align-items: center; justify-content: center;
  background: var(--accent-soft); color: var(--accent); font-size: 14px; font-weight: 700; }
.tp-who { flex: 1; min-width: 0; }
.tp-who h2 { margin: 0; font-size: 17px; }
.tp-who .muted { font-size: 12px; margin-top: 2px; }
.tms-picker > .loading-line, .tms-picker > .notice { margin: 18px 22px; }
.tp-sec { padding: 16px 22px; border-bottom: 1px solid var(--border); }
.tp-sh { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
.tp-st { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; color: var(--text); }
.tp-num { width: 22px; height: 22px; border-radius: 50%; background: var(--chip); color: var(--text-2); font-size: 11px; display: inline-flex; align-items: center; justify-content: center; }
.tp-tools { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; font-weight: 400; }
.tp-board { height: 32px; font-size: 13px; width: auto; min-width: 180px; }
.tp-board-one { font-size: 13px; }
.tp-hint { font-size: 12px; color: var(--muted); margin: 4px 0 0; }

.tms-ws-list { display: flex; flex-wrap: wrap; gap: 8px; }
.tms-ws { display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px; font-size: 13px; cursor: pointer;
  border: 1px solid var(--border); border-radius: 999px; background: var(--surface); color: var(--text); }
.tms-ws.on { border-color: var(--accent); background: var(--accent-soft); }
.tms-filter { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-2); cursor: pointer; }

.tp-cols { display: flex; flex-wrap: wrap; gap: 8px; }
.tp-col { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 13px; border: 1px solid var(--border); border-radius: 999px;
  background: var(--surface); color: var(--text-2); font: inherit; font-size: 13px; cursor: pointer; transition: background .18s ease, color .18s ease, border-color .18s ease; }
.tp-col:hover { border-color: var(--green); }
.tp-col-tick { width: 0; overflow: hidden; opacity: 0; transition: width .18s ease, opacity .18s ease; font-weight: 700; }
.tp-col.on { background: var(--green-soft); border-color: var(--green); color: var(--green); font-weight: 600; }
.tp-col.on .tp-col-tick { width: 12px; opacity: 1; }

/* Task rows: tick | task | status | due, the same columns in every row */
.tk-grid { display: grid; grid-template-columns: 22px minmax(0, 1fr) 132px 118px; gap: 14px; align-items: start; }
.tk-grid-mine { grid-template-columns: minmax(0, 1fr) 132px 118px; }
.tk-head { padding: 0 14px 6px; font-size: 11px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
.tk-r { text-align: right; }
.tk-list { max-height: 440px; overflow-y: auto; padding-right: 2px; }
.tk-card { padding: 12px 14px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); margin-bottom: 8px; cursor: pointer;
  transition: border-color .15s ease, background .15s ease; }
.tk-card:hover { border-color: color-mix(in srgb, var(--accent) 40%, var(--border)); }
.tk-card.on { border-color: var(--accent); background: color-mix(in srgb, var(--accent-soft) 45%, var(--surface)); }
.tk-card input[type=checkbox] { margin: 3px 0 0; width: 16px; height: 16px; accent-color: var(--accent); }
.tk-card.off .tk-title { text-decoration: line-through; color: var(--text-2); }
.tms-mine .tk-card { cursor: default; }
.tk-main { min-width: 0; }
.tk-title { font-size: 14px; font-weight: 600; color: var(--text); line-height: 1.35; overflow-wrap: anywhere; }
.tk-meta { font-size: 12px; color: var(--muted); margin-top: 3px; overflow-wrap: anywhere; }
.tk-status { display: flex; flex-direction: column; gap: 5px; }
.tk-tag { display: inline-flex; align-items: center; justify-content: center; min-height: 22px; padding: 2px 10px; border-radius: 999px;
  font-size: 11.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tk-status .tk-tag { width: 100%; box-sizing: border-box; }
.tk-tag.green { background: var(--green-soft); color: var(--green); }
.tk-tag.amber { background: var(--amber-soft); color: var(--amber); }
.tk-tag.red { background: var(--red-soft); color: var(--red); }
.tk-tag.blue { background: var(--blue-soft); color: var(--blue); }
.tk-tag.grey { background: var(--chip); color: var(--text-2); }
.tk-due { text-align: right; }
.tk-due b { display: block; font-size: 13px; color: var(--text); white-space: nowrap; }
.tk-due small { display: block; font-size: 11px; color: var(--muted); margin-top: 2px; }
.tk-empty { padding: 12px 4px; }

.tk-main :deep(.dh-btn) { margin-top: 6px; padding: 0; border: 0; background: none; font: inherit; font-size: 12px; font-weight: 600; color: var(--accent); cursor: pointer; }
.tk-main :deep(.dh-btn:hover) { text-decoration: underline; }
.tk-main :deep(.dh-list) { list-style: none; margin: 8px 0 2px; padding: 0 0 0 12px; border-left: 2px solid var(--border); display: grid; gap: 7px; }
.tk-main :deep(.dh-list li) { font-size: 12px; color: var(--text-2); line-height: 1.45; }
.tk-main :deep(.dh-list b) { color: var(--text); }
.tk-main :deep(.dh-list small) { display: block; color: var(--muted); font-size: 11px; }

.tp-sum { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; padding: 16px 22px 10px; }
.tp-mc { background: var(--chip); border-radius: 10px; padding: 10px 14px; display: flex; flex-direction: column; gap: 2px; }
.tp-mc span { font-size: 12px; color: var(--text-2); }
.tp-mc b { font-size: 20px; color: var(--text); }
.tp-mc small { font-size: 13px; font-weight: 400; color: var(--muted); }
.tp-bar { height: 6px; margin: 0 22px 12px; border-radius: 999px; background: var(--chip); overflow: hidden; }
.tp-bar-fill { height: 100%; border-radius: 999px; background: var(--green); transition: width .3s ease; }
.tms-picker > .note { margin: 0 22px 8px; }
.tms-picker .modal-foot { padding: 14px 22px 18px; margin: 0; border-top: 1px solid var(--border); flex-wrap: wrap; }

@media (max-width: 680px) {
  .tk-grid { grid-template-columns: 22px minmax(0, 1fr); }
  .tk-grid-mine { grid-template-columns: minmax(0, 1fr); }
  .tk-head { display: none; }
  .tk-status { grid-column: 2; flex-direction: row; flex-wrap: wrap; }
  .tk-grid-mine .tk-status, .tk-grid-mine .tk-due { grid-column: 1; }
  .tk-status .tk-tag { width: auto; }
  .tk-due { grid-column: 2; text-align: left; }
  .tp-sum { grid-template-columns: 1fr 1fr 1fr; gap: 6px; }
  .tp-mc b { font-size: 16px; }
}
</style>
