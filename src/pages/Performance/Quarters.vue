<template>
  <main class="content">
    <div class="loading-bar" v-show="loading"></div>
    <div class="page-head">
      <div>
        <h1>Quarterly management</h1>
        <div class="sub">Create and configure performance evaluation quarters. Each quarter goes Draft → Active → Finalized.</div>
      </div>
      <div class="head-tools">
        <!-- 6 Nov 2026: an info icon instead of the pill; the question shows on hover and is read out by screen readers -->
        <button type="button" class="info-btn" @click="showStatusHelp = true" title="What does each status mean?" aria-label="What does each status mean?">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg></button>
        <button class="btn btn-primary" v-if="canEdit" @click="openCreate">+ New quarter</button>
      </div>
    </div>


    <!-- 25 Nov 2026 (Khairul): no outer card (the table has its own frame); readable quarter and dates; status as a tinted pill;
         actions: neutral Details button + trash icon (Option B, Khairul); "23 people" theme link opens Participants -->
    <div v-if="!loading">
      <div class="table-wrap">
        <table class="table hover-rows">
          <thead><tr><th>Quarter</th><th>Dates</th><th>Participants</th><th>Status</th><th class="q-acts-th">Actions</th></tr></thead>
          <tbody>
            <tr v-for="q in quarters" :key="q.id" @dblclick="openDetails(q)" style="cursor: pointer;">
              <td class="nw"><b>{{ quarterLabel(q) }}</b></td>
              <td class="nw">{{ dateRange(q.startDate, q.endDate) }}</td>
              <td @click.stop><button type="button" class="q-people" :title="`Participants in ${quarterLabel(q)}`" @click="openParticipants(q)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg><span>{{ peopleText(q.id) }}</span></button></td>
              <td @click.stop>
                <select v-if="canEdit" class="select q-status" :class="pillClass(q.status)" :value="normalizeStatus(q.status)" :title="STATUS_HELP[normalizeStatus(q.status)]" :aria-label="`Status of ${quarterLabel(q)}`" @change="changeStatus(q, $event.target.value)">
                  <option v-for="s in STATUSES" :key="s" :value="s" :title="STATUS_HELP[s]">{{ statusLabel(s) }}</option>
                </select>
                <span v-else class="pill" :class="pillClass(q.status)">{{ statusLabel(q.status) }}</span>
              </td>
              <td class="q-acts-td"><div class="q-acts" @click.stop>
                <button type="button" class="q-btn" @click="openDetails(q)">Details</button>
                <button type="button" class="q-del" v-if="canEdit" :title="`Delete ${quarterLabel(q)}`" :aria-label="`Delete ${quarterLabel(q)}`" @click="deleting = q"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/></svg></button>
              </div></td>
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

    <!-- Participants. 25 Nov 2026 (Khairul): title like the table, × close, live search, Select all docked in the list header,
         whole row clickable, theme-coloured ticks, department as a grey pill on the right -->
    <div class="modal-back" v-if="partsFor" @click.self="partsFor = null">
      <div class="modal" role="dialog" :aria-label="`Participants — ${quarterLabel(partsFor)}`" style="max-width: 560px;" v-esc="() => partsFor = null">
        <div class="pt-head">
          <h2>{{ `Participants — ${quarterLabel(partsFor)}` }}</h2>
          <button type="button" class="pt-x" aria-label="Close" title="Close" @click="partsFor = null">×</button>
        </div>
        <p class="note">Only ticked employees are included in this quarter's evaluation. Everyone else sees
          "You are not included in this quarter's performance evaluation."</p>
        <input class="input pt-search" type="search" v-model="partsSearch" placeholder="Search by name or department..." aria-label="Search by name or department">
        <div class="pt-box">
          <div class="pt-bar">
            <label class="pt-all">
              <input type="checkbox" :checked="allSelected" :indeterminate.prop="someSelected" @change="toggleAll($event.target.checked)">
              {{ partsSearch.trim() ? 'Select all shown' : 'Select all' }}
            </label>
            <span class="muted">{{ `${selectedUids.length} of ${staff.length} selected` }}</span>
          </div>
          <div class="pt-list">
            <label v-for="e in shownStaff" :key="e.uid" class="pt-row">
              <input type="checkbox" :value="e.uid" v-model="selectedUids">
              <span class="pt-name">{{ e.name }}</span>
              <span class="pt-dept" v-if="e.role">{{ deptLabel(e.role) }}</span>
            </label>
            <p class="muted pt-none" v-if="!shownStaff.length">No one matches this search.</p>
          </div>
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
      <!-- Same look as Staff accounts > What each role can do (6 Nov 2026): one bordered row per status -->
      <div class="modal" role="dialog" aria-label="Quarter statuses" style="max-width:720px;width:calc(100% - 32px)">
        <h2>Quarter statuses</h2>
        <div class="status-help-list">
          <div v-for="s in STATUSES" :key="s"><b>{{ statusLabel(s) }}</b><span>{{ STATUS_HELP[s] }}</span></div>
        </div>
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
import { ROLE_LABEL } from '@/lib/firebase.js';
import { can } from '@/lib/access.js';
import { listStaff } from '@/lib/agreements/data.js';
import {
  listQuarters, createQuarter, updateQuarter, deleteQuarter, setStatus,
  listParticipants, setParticipants, DEFAULT_WEIGHTS
} from '@/lib/performance/quarters.js';
import { STATUSES, STATUS_LABELS, STATUS_HELP, normalizeStatus } from '@/lib/performance/quarterStatus.js';

const session = useSession();
const canEdit = computed(() => can(session, 'performance.edit'));   // Directors and Branch Directors: can() is true

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
// "Select all" ticks every staff member shown in the Participants list; unticking it clears them all.
// 25 Nov 2026 (Khairul): live search by name or department; Select all acts on the rows shown (all of them when the search is empty)
const partsSearch = ref('');
const deptLabel = r => ROLE_LABEL[r] || String(r || '').replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const shownStaff = computed(() => {
  const k = partsSearch.value.trim().toLowerCase();
  return !k ? staff.value : staff.value.filter(e => `${e.name || ''} ${deptLabel(e.role)} ${e.role || ''}`.toLowerCase().includes(k));
});
const allSelected = computed(() => shownStaff.value.length > 0 && shownStaff.value.every(e => selectedUids.value.includes(e.uid)));
const someSelected = computed(() => shownStaff.value.some(e => selectedUids.value.includes(e.uid)) && !allSelected.value);
function toggleAll(on) {
  const ids = new Set(shownStaff.value.map(e => e.uid));
  selectedUids.value = on ? [...new Set([...selectedUids.value, ...ids])] : selectedUids.value.filter(id => !ids.has(id));
}
// A quarter can be edited at any status (business rule) — view mode (opened by double-clicking a row, or the
// Details button) just starts read-only, with an "Edit" button to unlock the fields regardless of status.
const fieldsDisabled = computed(() => viewOnly.value);
const weightTotal = computed(() => !form.value ? 0 : Number(form.value.weights.coh) + Number(form.value.weights.kpi) + Number(form.value.weights.tms));

// Old quarters saved with a previous status (upcoming, evaluation, pendingApproval, archived) show as the nearest of the three.
const statusLabel = s => STATUS_LABELS[normalizeStatus(s)];
// 25 Nov 2026 (Khairul): green Active, grey Draft, blue Finalized
const pillClass = s => ({ draft: 'grey', active: 'green', finalized: 'blue' }[normalizeStatus(s)]);
// 25 Nov 2026 (Khairul): "Q 3" shows as "Q3 2026" (year from the start date when the name has none); dates as "1 Jul – 30 Sep 2026"
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function quarterLabel(q) {
  const name = String(q.name || '').trim().replace(/^Q\s+(\d)/i, 'Q$1');
  const yr = /^\d{4}/.test(q.startDate || '') ? q.startDate.slice(0, 4) : '';
  return yr && !/\b\d{4}\b/.test(name) ? `${name} ${yr}` : name || '—';
}
const parts = d => /^(\d{4})-(\d{2})-(\d{2})/.exec(d || '');
function dateRange(a, b) {
  const x = parts(a), y = parts(b);
  if (!x || !y) return [a, b].filter(Boolean).join(' – ') || '—';
  const d = m => `${Number(m[3])} ${MON[Number(m[2]) - 1]}`;
  return x[1] === y[1] ? `${d(x)} – ${d(y)} ${y[1]}` : `${d(x)} ${x[1]} – ${d(y)} ${y[1]}`;
}
const peopleText = id => { const n = participantCounts[id]; return n == null ? '—' : `${n} ${n === 1 ? 'person' : 'people'}`; };
const showStatusHelp = ref(false);
const deleting = ref(null);

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
  form.value = { status: 'draft', name: '', startDate: '', endDate: '', minCohEvaluations: 1, weights: { ...DEFAULT_WEIGHTS } };
}
// Double-click a row (or the Details button): opens read-only, with an inline Edit button.
function openDetails(q) {
  viewOnly.value = true;
  form.value = { ...q, weights: { ...DEFAULT_WEIGHTS, ...q.weights } };
}

async function save() {
  if (!form.value.name?.trim()) { error.value = 'Give the quarter a name.'; return; }
  if (!form.value.startDate || !form.value.endDate) { error.value = 'Start date and end date are required.'; return; }
  if (form.value.endDate < form.value.startDate) { error.value = 'End date must be on or after the start date.'; return; }
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
  partsSearch.value = '';
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
/* 25 Nov 2026 (Khairul): row actions, status pill, people link */
.nw { white-space: nowrap; }
.q-acts-td { width: 1%; }
.q-acts { display: flex; align-items: center; justify-content: flex-end; gap: 8px; white-space: nowrap; }
.q-btn { display: inline-flex; align-items: center; height: 30px; padding: 0 12px; border-radius: 8px; background: #fff; border: 1px solid var(--border);
  color: var(--text); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; transition: background .15s, border-color .15s, color .15s; }
.q-btn:hover { background: color-mix(in srgb, var(--accent) 6%, #fff); border-color: color-mix(in srgb, var(--accent) 45%, var(--border)); color: var(--accent); }
.q-acts-th { text-align: right; }
/* 25 Nov 2026 (Khairul): trash as a line icon (the emoji came out white and vanished): grey at rest, red with a soft red tint on hover */
.q-del { display: inline-grid; place-items: center; width: 30px; height: 30px; padding: 0; border: 0; border-radius: 8px; background: none; color: var(--muted); cursor: pointer; transition: background .15s, color .15s; }
.q-del svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.q-del:hover, .q-del:focus-visible { background: var(--red-soft); color: var(--danger); }
.q-people { display: inline-flex; align-items: center; gap: 6px; padding: 0; border: 0; background: none; font: inherit; color: var(--accent); cursor: pointer; }
.q-people svg { width: 16px; height: 16px; flex: none; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.q-people span { text-decoration: underline; text-underline-offset: 3px; }
.q-people:hover span { text-decoration-thickness: 2px; }
/* Status: a compact tinted pill with a small caret, coloured like the pills (green Active, grey Draft, blue Finalized) */
.select.q-status { height: 26px; padding: 0 24px 0 10px; border: 0; border-radius: 999px; font-size: 12px; font-weight: 600;
  background-image: linear-gradient(45deg, transparent 50%, currentColor 50%), linear-gradient(135deg, currentColor 50%, transparent 50%);
  background-position: calc(100% - 13px) 11px, calc(100% - 9px) 11px; background-size: 4px 4px, 4px 4px; background-repeat: no-repeat; }
.select.q-status.green { background-color: var(--green-soft); color: var(--green); }
.select.q-status.grey { background-color: var(--chip); color: var(--text-2); }
.select.q-status.blue { background-color: var(--blue-soft); color: var(--blue); }
.select.q-status:hover:not(:disabled) { filter: brightness(.96); }
.info-btn { display: inline-grid; place-items: center; width: 40px; height: 40px; padding: 0; border-radius: 50%; border: 1px solid var(--border); background: var(--surface); color: var(--accent); cursor: pointer; transition: background .15s, border-color .15s; }
.info-btn:hover { background: var(--accent-soft); border-color: var(--accent); }
.info-btn svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.pt-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.pt-head h2 { margin: 0 0 6px; }
.pt-x { flex: none; width: 32px; height: 32px; margin: -4px -8px 0 0; border: 0; border-radius: 8px; background: none; color: var(--muted); font-size: 22px; line-height: 1; cursor: pointer; }
.pt-x:hover { background: var(--chip); color: var(--text); }
.pt-search { width: 100%; height: 36px; margin: 4px 0 10px; font-size: 13px; }
.pt-box { border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
.pt-bar { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 10px 14px; background: var(--head); border-bottom: 1px solid var(--border); font-size: 13px; }
.pt-all { display: inline-flex; align-items: center; gap: 10px; font-weight: 600; cursor: pointer; }
.pt-list { max-height: 340px; overflow-y: auto; }
.pt-row { display: flex; align-items: center; gap: 10px; padding: 9px 14px; font-size: 14px; cursor: pointer; transition: background .12s; }
.pt-row + .pt-row { border-top: 1px solid var(--chip); }
.pt-row:hover { background: var(--head); }
.pt-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pt-dept { flex: none; padding: 2px 8px; border-radius: 999px; background: var(--chip); color: #64748b; font-size: 12px; font-weight: 500; }
.pt-none { margin: 0; padding: 16px 14px; text-align: center; }
.pt-box input[type="checkbox"] { width: 16px; height: 16px; margin: 0; flex: none; accent-color: var(--theme-color, var(--brand)); cursor: pointer; }
.status-help-list { display: grid; gap: 8px; margin: 14px 0 6px; max-height: 60vh; overflow: auto; }
.status-help-list > div { display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: 16px; align-items: start; padding: 12px 14px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); }
.status-help-list b { font-size: 13px; color: var(--accent); }
.status-help-list span { font-size: 14px; line-height: 1.5; color: var(--text); }
@media (max-width: 520px) { .status-help-list > div { grid-template-columns: minmax(0, 1fr); gap: 4px; } }
</style>