<template>
  <main class="content">
    <div class="loading-bar" v-show="loading"></div>
    <div class="page-head">
      <div>
        <h1>KPI management</h1>
        <div class="sub">Self-assessment, review and discussion. Each employee's KPI weightages must total 100% before activation.</div>
      </div>
      <div class="head-tools">
        <select class="select" v-model="quarterId" v-if="quarters.length">
          <option v-for="q in quarters" :key="q.id" :value="q.id">{{ q.name }}</option>
        </select>
      </div>
    </div>

    <div class="notice error" v-if="error">{{ error }}</div>
    <div class="notice ok" v-if="okMsg">{{ okMsg }}</div>

    <div class="pills" role="group" style="margin-bottom:12px;" v-if="canManageKpi">
      <button class="pill-btn" :class="{ on: tab === 'mine' }" @click="tab = 'mine'">My KPIs</button>
      <button class="pill-btn" :class="{ on: tab === 'admin' }" @click="tab = 'admin'">All employees</button>
    </div>

    <template v-if="!loading && tab === 'mine'">
      <div class="card" v-for="a in myAssignments" :key="a.id" style="margin-bottom:12px;">
        <div style="display:flex; justify-content:space-between; align-items:baseline;">
          <h3 style="margin:0;">{{ a.title }}</h3>
          <span class="pill" :class="statusPill(mySub(a.id)?.status)">{{ statusLabel(mySub(a.id)?.status) }}</span>
        </div>
        <p class="muted" style="margin:6px 0;">{{ a.description }}</p>
        <p style="font-size:13px; margin:0 0 10px;">Weight {{ a.weightage }}% · Target: {{ a.target || '—' }} · Deadline {{ a.deadline || 'none' }}</p>

        <template v-if="!['approved', 'rejected'].includes(mySub(a.id)?.status)">
          <div class="field"><label>Completion date</label><input class="input" type="date" v-model="drafts[a.id].completionTimestamp"></div>
          <div class="field"><label>Self-rating (1–5)</label>
            <RatingPicker v-model="drafts[a.id].selfRating" label="Self-rating" />
            <span class="muted" style="margin-left:8px; font-size:12px;" v-if="suggestion(a) != null">suggested {{ suggestion(a) }} based on deadline</span>
          </div>
          <div class="field"><label>Comments</label><textarea class="input" v-model="drafts[a.id].selfComments"></textarea></div>
          <div class="field"><label>Evidence link</label><input class="input" v-model="drafts[a.id].evidenceLink" placeholder="https://…"></div>
          <button class="btn btn-primary" :disabled="saving" @click="submitMine(a)">Submit self-assessment</button>
        </template>
        <template v-else>
          <p style="font-size:13px;">Final rating: <b>{{ mySub(a.id)?.finalApprovedRating }}</b> / 5
            <span class="muted" v-if="mySub(a.id)?.selfRating !== mySub(a.id)?.finalApprovedRating">(you self-rated {{ mySub(a.id)?.selfRating }})</span></p>
          <p class="muted" style="font-size:13px;" v-if="mySub(a.id)?.reviewerComments">Reviewer: {{ mySub(a.id)?.reviewerComments }}</p>
          <button class="act-pill" @click="askDiscussion(a)" v-if="mySub(a.id)?.discussionStatus === 'none'">Request discussion</button>
          <span class="pill amber" v-else-if="mySub(a.id)?.discussionStatus !== 'resolved'">Discussion {{ mySub(a.id)?.discussionStatus }}</span>
        </template>
      </div>
      <div class="card" v-if="!myAssignments.length"><p class="muted">No KPIs assigned to you this quarter.</p></div>
    </template>

    <template v-if="!loading && tab === 'admin' && canManageKpi">
      <div class="card" style="margin-bottom:16px;">
        <h3 style="margin-top:0;">All employees — {{ participants.length }}</h3>
        <p class="sub" style="margin:0 0 12px;">Click an employee to see their assigned KPIs, add a new one, or edit an existing one.</p>
        <div class="table-wrap">
          <table class="table hover-rows">
            <thead><tr><th>Employee</th><th>KPIs assigned</th><th>Weightage</th><th>Pending review</th><th></th></tr></thead>
            <tbody>
              <tr v-for="p in participants" :key="p.employeeId" style="cursor:pointer;" @click="openEmployeeKpis(p)">
                <td>{{ p.employeeName }}</td>
                <td>{{ kpisFor(p.employeeId).length }}</td>
                <td>
                  <span class="pill" :class="totalWeightage(kpisFor(p.employeeId)) === 100 ? 'green' : 'amber'">{{ totalWeightage(kpisFor(p.employeeId)) }}%</span>
                </td>
                <td>{{ kpisFor(p.employeeId).filter(a => subOf(a.id)?.status === 'submitted').length }}</td>
                <td><button class="act-pill" @click.stop="openEmployeeKpis(p)">View KPIs</button></td>
              </tr>
              <tr v-if="!participants.length"><td colspan="5" class="muted">No participants in this quarter yet.</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <h3 style="margin-top:0;">Submissions awaiting review</h3>
        <div class="table-wrap">
          <table class="table hover-rows">
            <thead><tr><th>Employee</th><th>KPI</th><th>Self-rating</th><th>Status</th><th></th></tr></thead>
            <tbody>
              <tr v-for="row in allRows.filter(r => r.submission?.status === 'submitted')" :key="row.assignment.id">
                <td>{{ row.assignment.employeeName }}</td>
                <td>{{ row.assignment.title }}</td>
                <td>{{ row.submission.selfRating }}</td>
                <td><span class="pill amber">Submitted</span></td>
                <td><button class="act-pill" @click="openReview(row)">Review</button></td>
              </tr>
              <tr v-if="!allRows.some(r => r.submission?.status === 'submitted')"><td colspan="5" class="muted">Nothing pending.</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <!-- One employee's assigned KPIs: view, add, edit -->
    <div class="modal-back" v-if="employeeKpis" @click.self="employeeKpis = null">
      <div class="modal" style="max-width: 680px;">
        <h2>{{ employeeKpis.employeeName }}'s KPIs</h2>
        <div class="table-wrap">
          <table class="table hover-rows">
            <thead><tr><th>KPI</th><th>Weight</th><th>Deadline</th><th>Self-rating</th><th>Status</th><th></th></tr></thead>
            <tbody>
              <tr v-for="a in kpisFor(employeeKpis.employeeId)" :key="a.id" :class="{ 'row-selected': editingId === a.id }">
                <td>{{ a.title }}</td>
                <td>{{ a.weightage }}%</td>
                <td>{{ a.deadline || '—' }}</td>
                <td>{{ subOf(a.id)?.selfRating ?? '—' }}</td>
                <td><span class="pill" :class="statusPill(subOf(a.id)?.status)">{{ statusLabel(subOf(a.id)?.status) }}</span></td>
                <td style="display:flex; gap:6px;">
                  <button class="act-pill" @click="startEdit(a)">Edit</button>
                  <button class="act-pill" v-if="subOf(a.id)?.status === 'submitted'" @click="openReview({ assignment: a, submission: subOf(a.id) }); employeeKpis = null">Review</button>
                </td>
              </tr>
              <tr v-if="!kpisFor(employeeKpis.employeeId).length"><td colspan="6" class="muted">No KPIs assigned yet.</td></tr>
            </tbody>
          </table>
        </div>

        <div style="border-top:1px solid var(--border); margin-top:16px; padding-top:14px;">
          <h3 style="margin:0 0 10px;">{{ editingId ? 'Edit KPI' : 'Add a KPI' }}</h3>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <FormField label="Title" req v-model="assignForm.title" />
            <FormField label="Weightage %" req type="number" min="0" max="100" v-model="assignForm.weightage" />
            <FormField label="Target" v-model="assignForm.target" />
            <FormField label="Deadline" type="date" v-model="assignForm.deadline" />
          </div>
          <FormField label="Description" v-model="assignForm.description" />
          <FormField label="Completion criteria" v-model="assignForm.completionCriteria" />
          <p class="note">
            Weightage so far (excluding this one): {{ otherWeightage }}% + {{ assignForm.weightage || 0 }}% here
            = {{ Number(otherWeightage) + Number(assignForm.weightage || 0) }}% (must reach exactly 100%)
          </p>
          <div style="display:flex; gap:8px;">
            <button class="btn btn-primary" :disabled="saving" @click="saveAssignForm">{{ editingId ? 'Save changes' : 'Add KPI' }}</button>
            <button class="btn" v-if="editingId" @click="startAdd">Cancel edit</button>
          </div>
        </div>

        <div class="modal-foot">
          <button class="btn" @click="employeeKpis = null">Close</button>
        </div>
      </div>
    </div>

    <!-- Review modal -->
    <div class="modal-back" v-if="reviewing" @click.self="reviewing = null">
      <div class="modal">
        <h2>Review — {{ reviewing.assignment.title }}</h2>
        <p class="muted">{{ reviewing.assignment.employeeName }} self-rated {{ reviewing.submission.selfRating }} / 5.</p>
        <div class="field"><label>Revised rating (only used if you choose "Revise")</label>
          <RatingPicker v-model="reviewRating" label="Revised rating" />
        </div>
        <FormField label="Reviewer comments" v-model="reviewComments" />
        <FormField label="Reason (required if revising or rejecting)" v-model="reviewReason" />
        <div class="modal-foot">
          <button class="btn" @click="reviewing = null">Cancel</button>
          <button class="btn" @click="doReview('requestEvidence')">Request evidence</button>
          <button class="btn" @click="doReview('reject')">Reject</button>
          <button class="btn" @click="doReview('revise')">Revise</button>
          <button class="btn btn-primary" @click="doReview('accept')">Accept self-rating</button>
        </div>
      </div>
    </div>
  </main>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue';
import FormField from '@/components/FormField.vue';
import RatingPicker from '@/components/RatingPicker.vue';
import { useSession } from '@/stores/session.js';
import { listQuarters, listParticipants } from '@/lib/performance/quarters.js';
import {
  listAssignmentsFor, listAllAssignments, listSubmissionsFor, totalWeightage,
  createAssignment, updateAssignment, submitSelfAssessment, reviewSubmission, requestDiscussion, suggestDeadlineRating
} from '@/lib/performance/kpi.js';

const session = useSession();
// Confirmed business rule: KPI management (assign/edit/review) is Director-only — narrower than COH, which
// also allows HR. can('performance.edit') no longer grants this; firestore.rules enforces the same boundary.
const canManageKpi = computed(() => session.role === 'director');

const loading = ref(true);
const saving = ref(false);
const error = ref('');
const okMsg = ref('');
// Director lands on the employee list by default; everyone else only ever sees their own KPIs.
const tab = ref(session.role === 'director' ? 'admin' : 'mine');

const quarters = ref([]);
const quarterId = ref('');
const myAssignments = ref([]);
const mySubs = ref({});
const allRows = ref([]);
const participants = ref([]);
const employeeKpis = ref(null);
const drafts = reactive({});

const editingId = ref(null);
const assignForm = ref({ title: '', description: '', target: '', weightage: '', deadline: '', completionCriteria: '' });
const otherWeightage = computed(() => {
  if (!employeeKpis.value) return 0;
  return totalWeightage(kpisFor(employeeKpis.value.employeeId).filter(a => a.id !== editingId.value));
});

const reviewing = ref(null);
const reviewRating = ref(3);
const reviewComments = ref('');
const reviewReason = ref('');

const mySub = id => mySubs.value[id] || null;
const suggestion = a => suggestDeadlineRating(a.deadline, drafts[a.id]?.completionTimestamp || null);

const STATUS_LABELS = { notStarted: 'Not started', inProgress: 'In progress', submitted: 'Submitted', underReview: 'Under review', revisionRequested: 'Revision requested', approved: 'Approved', rejected: 'Rejected' };
const statusLabel = s => STATUS_LABELS[s] || 'Not started';
const statusPill = s => ({ approved: 'green', rejected: 'red', submitted: 'amber', revisionRequested: 'amber' }[s] || 'grey');

async function load() {
  loading.value = true;
  try {
    quarters.value = (await listQuarters()).filter(q => q.status !== 'draft' && q.status !== 'archived');
    if (!quarterId.value && quarters.value.length) quarterId.value = quarters.value[0].id;
    if (!quarterId.value) return;
    myAssignments.value = await listAssignmentsFor(quarterId.value, session.user.uid);
    for (const a of myAssignments.value) if (!drafts[a.id]) drafts[a.id] = { selfRating: 3, selfComments: '', completionTimestamp: '', evidenceLink: '' };
    const subRows = await listSubmissionsFor(myAssignments.value);
    mySubs.value = Object.fromEntries(subRows.map(r => [r.assignment.id, r.submission]));
    if (canManageKpi.value) {
      participants.value = (await listParticipants(quarterId.value)).filter(p => p.participationStatus === 'active');
      const all = await listAllAssignments(quarterId.value);
      allRows.value = await listSubmissionsFor(all);
    }
  } catch (e) { error.value = e.message; } finally { loading.value = false; }
}
onMounted(load);
watch(quarterId, load);

const kpisFor = uid => allRows.value.filter(r => r.assignment.employeeId === uid).map(r => r.assignment);
const subOf = assignmentId => allRows.value.find(r => r.assignment.id === assignmentId)?.submission || null;
function openEmployeeKpis(p) { employeeKpis.value = p; startAdd(); }

function startAdd() {
  editingId.value = null;
  assignForm.value = { title: '', description: '', target: '', weightage: '', deadline: '', completionCriteria: '' };
}
function startEdit(a) {
  editingId.value = a.id;
  assignForm.value = { title: a.title, description: a.description || '', target: a.target || '', weightage: a.weightage, deadline: a.deadline || '', completionCriteria: a.completionCriteria || '' };
}
async function saveAssignForm() {
  if (!assignForm.value.title || !assignForm.value.weightage) { error.value = 'Title and weightage are required.'; return; }
  saving.value = true; error.value = '';
  try {
    if (editingId.value) {
      await updateAssignment(editingId.value, {
        title: assignForm.value.title, description: assignForm.value.description, target: assignForm.value.target,
        weightage: Number(assignForm.value.weightage), deadline: assignForm.value.deadline, completionCriteria: assignForm.value.completionCriteria
      });
      okMsg.value = 'KPI updated.';
    } else {
      await createAssignment({ ...assignForm.value, quarterId: quarterId.value, employeeId: employeeKpis.value.employeeId, employeeName: employeeKpis.value.employeeName });
      okMsg.value = 'KPI added.';
    }
    const keepOpenFor = employeeKpis.value;
    await load();
    employeeKpis.value = keepOpenFor;
    startAdd();
  } catch (e) { error.value = e.message; } finally { saving.value = false; }
}

async function submitMine(a) {
  saving.value = true; error.value = '';
  try {
    const d = drafts[a.id];
    const evidence = d.evidenceLink ? [{ type: 'link', url: d.evidenceLink }] : [];
    await submitSelfAssessment(a, { selfRating: d.selfRating, selfComments: d.selfComments, evidence, completionTimestamp: d.completionTimestamp });
    okMsg.value = 'Self-assessment submitted.'; await load();
  } catch (e) { error.value = e.message; } finally { saving.value = false; }
}

function openReview(row) { reviewing.value = row; reviewRating.value = row.submission.selfRating; reviewComments.value = ''; reviewReason.value = ''; }
async function doReview(decision) {
  if (['revise', 'reject'].includes(decision) && !reviewReason.value) { error.value = 'A reason is required for that decision.'; return; }
  saving.value = true; error.value = '';
  try {
    await reviewSubmission(reviewing.value.assignment.id, { decision, rating: reviewRating.value, reviewerComments: reviewComments.value, reviewReason: reviewReason.value });
    okMsg.value = 'Review saved.'; reviewing.value = null; await load();
  } catch (e) { error.value = e.message; } finally { saving.value = false; }
}

async function askDiscussion(a) {
  const reason = window.prompt('Why would you like to discuss this KPI rating?');
  if (!reason) return;
  try { await requestDiscussion(quarterId.value, a.id, reason); okMsg.value = 'Discussion requested.'; await load(); } catch (e) { error.value = e.message; }
}
</script>

<style scoped>
.row-selected { background: var(--hover); }
</style>
