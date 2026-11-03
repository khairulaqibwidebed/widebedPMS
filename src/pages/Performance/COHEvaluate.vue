<template>
  <main class="content">
    <div class="loading-bar" v-show="loading"></div>

    <div class="pills" role="group" style="margin-bottom:12px;" v-if="canManageQuestions">
      <button class="pill-btn" :class="{ on: tab === 'evaluate' }" @click="tab = 'evaluate'">Evaluate</button>
      <button class="pill-btn" :class="{ on: tab === 'monitor' }" @click="tab = 'monitor'">Team overview</button>
      <button class="pill-btn" :class="{ on: tab === 'questions' }" @click="tab = 'questions'">Manage questions</button>
    </div>

    <div class="notice error" v-if="error">{{ error }}</div>

    <template v-if="tab === 'evaluate'">
      <div class="coh-panel">
        <h2 class="sr-only">Code of conduct peer evaluation</h2>

        <div class="coh-card" v-if="!loading && !quarter">
          <p class="coh-muted">No COH evaluation period is currently open.</p>
        </div>

        <div class="coh-card" v-else-if="!loading && !amParticipant">
          <p class="coh-strong">You are not included in this quarter's performance evaluation.</p>
        </div>

        <!-- ===================== Screen 1: colleague dashboard ===================== -->
        <template v-else-if="!loading && !activeEvaluatee">
          <div class="coh-header">
            <div>
              <div class="coh-greeting">Hello, {{ session.name }} <span aria-hidden="true">👋</span></div>
              <div class="coh-sub">Quarter {{ quarter.name }}</div>
            </div>
          </div>

          <div class="coh-standing">
            <div class="coh-standing-item">
              <div class="coh-standing-value">{{ evaluatedMeCount }}</div>
              <div class="coh-muted">evaluated you</div>
            </div>
            <div class="coh-standing-item">
              <div class="coh-standing-value">{{ notYetEvaluatedMeCount }}</div>
              <div class="coh-muted">haven't yet</div>
            </div>
            <div class="coh-standing-item">
              <div class="coh-standing-value">{{ myAverageRating != null ? myAverageRating.toFixed(2) : '—' }}<small v-if="myAverageRating != null"> / 5</small></div>
              <div class="coh-muted">your average · {{ totalCount }} eligible this quarter</div>
            </div>
          </div>

          <div class="coh-progress-card">
            <div class="coh-progress-top">
              <div>
                <div class="coh-progress-count">{{ evaluatedCount }} <span class="coh-muted">of {{ totalCount }} evaluated</span></div>
                <div class="coh-muted" style="font-size:13px;">{{ remaining }} remaining</div>
              </div>
              <div class="coh-progress-pct">{{ pct }}%</div>
            </div>
            <div class="coh-bar"><div class="coh-bar-fill" :style="{ width: pct + '%' }"></div></div>
          </div>

          <div class="coh-toolbar">
            <div class="coh-search">
              <svg viewBox="0 0 24 24" aria-hidden="true" v-html="NAV_ICONS.search"></svg>
              <input v-model="search" type="text" placeholder="Search colleagues…" aria-label="Search colleagues">
            </div>
            <div class="coh-filters" role="group" aria-label="Filter by status">
              <button v-for="f in FILTERS" :key="f.key" class="coh-filter-btn" :class="{ on: statusFilter === f.key }" @click="statusFilter = f.key">{{ f.label }}</button>
            </div>
            <select class="coh-sort" v-model="sortBy" aria-label="Sort colleagues">
              <option value="name">Sort: name</option>
              <option value="status">Sort: status</option>
            </select>
          </div>

          <div class="coh-list">
            <button v-for="p in filteredEvaluatees" :key="p.employeeId" class="coh-colleague-card" @click="openEvaluatee(p)">
              <div class="coh-avatar">{{ initials(p.employeeName) }}</div>
              <div class="coh-colleague-info">
                <div class="coh-colleague-name">{{ p.employeeName }}</div>
                <div class="coh-status-row">
                  <span class="coh-status-dot" :class="{ done: given(p.employeeId) }"></span>
                  <span class="coh-muted">{{ given(p.employeeId) ? 'Completed' : 'Pending' }}</span>
                </div>
              </div>
              <svg class="coh-chevron" viewBox="0 0 24 24" aria-hidden="true" v-html="NAV_ICONS.chevronRight"></svg>
            </button>
            <div class="coh-card" v-if="!filteredEvaluatees.length">
              <p class="coh-muted">{{ evaluatees.length ? 'No colleagues match your search.' : 'No colleagues to evaluate this quarter.' }}</p>
            </div>
          </div>

          <div class="coh-received" v-if="received.length">
            <div class="coh-received-title">Evaluations you've received this quarter</div>
            <div class="coh-received-row" v-for="e in received" :key="e.id">
              <span>{{ e.evaluatorNameSnapshot }}</span>
              <span class="coh-strong">{{ e.averageRating.toFixed(2) }} / 5</span>
              <span class="coh-muted">{{ formatWhen(e.submittedAt) }}</span>
            </div>
          </div>
        </template>

        <!-- ===================== Screen 2: questionnaire ===================== -->
        <template v-else-if="activeEvaluatee">
          <div class="coh-header">
            <button class="coh-icon-btn" @click="backToDashboard" aria-label="Back to colleague list">
              <svg viewBox="0 0 24 24" aria-hidden="true" v-html="NAV_ICONS.arrowLeft"></svg>
              <span>Back</span>
            </button>
            <div class="coh-q-title">
              <div class="coh-greeting" style="font-size:18px;">{{ activeEvaluatee.employeeName }}</div>
              <div class="coh-sub">Quarter {{ quarter.name }} · COH Evaluation</div>
            </div>
            <span class="coh-badge" :class="{ submitted: readOnly }">{{ readOnly ? 'Submitted' : 'Draft' }}</span>
          </div>

          <div class="coh-progress-card">
            <div class="coh-progress-top">
              <div>
                <div class="coh-progress-count">{{ answeredCount }} <span class="coh-muted">of {{ questions.length }} answered</span></div>
                <div class="coh-muted" style="font-size:13px;">{{ remainingQuestions }} remaining</div>
              </div>
            </div>
            <div class="coh-bar"><div class="coh-bar-fill" :style="{ width: (questions.length ? answeredCount / questions.length * 100 : 0) + '%' }"></div></div>
          </div>

          <div class="coh-legend">
            <span v-for="l in LEGEND" :key="l.n" class="coh-legend-item"><b>{{ l.n }}</b> {{ l.label }}</span>
          </div>

          <div class="coh-card" v-if="!questions.length">
            <p class="coh-muted">No COH questions have been configured for this quarter yet.</p>
          </div>

          <div class="coh-questions">
            <div v-for="(q, i) in questions" :key="q.id" ref="questionRefs" class="coh-q-card" :class="{ unanswered: scores[i] == null }">
              <div class="coh-q-head">
                <div class="coh-q-title-row">{{ String(i + 1).padStart(2, '0') }}. {{ q.title }}</div>
                <span class="coh-q-status" :class="{ answered: scores[i] != null }">{{ scores[i] != null ? 'Answered' : 'Not answered' }}</span>
              </div>
              <p class="coh-q-desc" v-if="q.description">{{ q.description }}</p>
              <RatingPicker variant="buttons" :model-value="scores[i]" :disabled="readOnly" :label="q.title" @update:model-value="n => selectScore(i, n)" />
            </div>
          </div>

          <div class="coh-sticky-bar">
            <div class="coh-sticky-counts">
              <span class="coh-strong">{{ answeredCount }}</span> answered · <span class="coh-muted">{{ remainingQuestions }} remaining</span>
            </div>
            <div class="coh-sticky-actions">
              <button class="coh-btn-ghost" :disabled="currentIndex <= 0" @click="goTo(currentIndex - 1)">Previous</button>
              <button class="coh-btn-ghost" :disabled="currentIndex >= questions.length - 1" @click="goTo(currentIndex + 1)">Next</button>
              <button v-if="!readOnly" class="coh-btn-primary" :disabled="!canSubmit || submitting" @click="showConfirm = true">Submit evaluation</button>
            </div>
          </div>
        </template>

        <!-- Confirm submit -->
        <div class="coh-overlay" v-if="showConfirm" @click.self="showConfirm = false">
          <div class="coh-dialog">
            <h3>Submit this evaluation?</h3>
            <p class="coh-muted">You rated {{ activeEvaluatee?.employeeName }} on all {{ questions.length }} questions. Your name and ratings will be visible to them, and this cannot be edited once HR/Director reviews it.</p>
            <div class="coh-dialog-actions">
              <button class="coh-btn-ghost" @click="showConfirm = false">Cancel</button>
              <button class="coh-btn-primary" :disabled="submitting" @click="doSubmit">Confirm &amp; submit</button>
            </div>
          </div>
        </div>

        <!-- Success -->
        <div class="coh-overlay" v-if="showSuccess">
          <div class="coh-dialog coh-success">
            <svg viewBox="0 0 24 24" aria-hidden="true" v-html="NAV_ICONS.check"></svg>
            <h3>Evaluation submitted</h3>
            <p class="coh-muted">Thanks — {{ activeEvaluatee?.employeeName }} will be able to see your rating.</p>
          </div>
        </div>
      </div>
    </template>

    <template v-else-if="tab === 'monitor' && canManageQuestions">
      <div class="card">
        <h3 style="margin-top:0;">Team COH overview — {{ quarter ? quarter.name : 'no evaluation period open' }}</h3>
        <p class="sub" style="margin:0 0 14px;">Per employee: how many colleagues have rated them, how many haven't yet, and their average rating so far this quarter.</p>
        <div class="table-wrap" v-if="quarter">
          <table class="table hover-rows">
            <thead><tr><th>Employee</th><th>Evaluated by</th><th>Not yet</th><th>Average</th></tr></thead>
            <tbody>
              <tr v-for="r in monitorRows" :key="r.employeeId">
                <td>{{ r.employeeName }}</td>
                <td>{{ r.evaluatedBy }}</td>
                <td>
                  <span class="pill" :class="r.notYet === 0 ? 'green' : 'amber'">{{ r.notYet }}</span>
                </td>
                <td>{{ r.average != null ? r.average.toFixed(2) + ' / 5' : '—' }}</td>
              </tr>
              <tr v-if="!monitorRows.length"><td colspan="4" class="muted">No participants in this quarter.</td></tr>
            </tbody>
          </table>
        </div>
        <p class="muted" v-else>No COH evaluation period is currently open.</p>
      </div>
    </template>

    <template v-else-if="tab === 'questions' && canManageQuestions">
      <div class="card" style="margin-bottom:16px;">
        <h3 style="margin-top:0;">Add a question</h3>
        <FormField label="Title" req v-model="newQ.title" placeholder="Demonstrates responsibility and accountability" />
        <FormField label="Description (optional)" v-model="newQ.description" />
        <button class="btn btn-primary" :disabled="saving || !newQ.title" @click="addQuestion">Add question</button>
      </div>

      <div class="card">
        <h3 style="margin-top:0;">All questions</h3>
        <div class="table-wrap">
          <table class="table hover-rows">
            <thead><tr><th>Order</th><th>Title</th><th>Description</th><th>Active</th><th></th></tr></thead>
            <tbody>
              <tr v-for="(q, i) in allQuestions" :key="q.id">
                <td>
                  <button class="act-pill" :disabled="i === 0" @click="moveQuestion(i, -1)">↑</button>
                  <button class="act-pill" :disabled="i === allQuestions.length - 1" @click="moveQuestion(i, 1)">↓</button>
                </td>
                <td><input class="input" v-model="q.title" @change="saveEdit(q, { title: q.title })"></td>
                <td><input class="input" v-model="q.description" @change="saveEdit(q, { description: q.description })"></td>
                <td><input type="checkbox" :checked="q.active !== false" @change="saveEdit(q, { active: $event.target.checked })"></td>
                <td></td>
              </tr>
              <tr v-if="!allQuestions.length"><td colspan="5" class="muted">No questions configured yet.</td></tr>
            </tbody>
          </table>
        </div>
        <p class="note">Disabling a question (unticking Active) keeps its history intact but stops it appearing in new evaluations.</p>
      </div>
    </template>
  </main>
</template>

<script setup>
import { ref, reactive, computed, onMounted, nextTick } from 'vue';
import RatingPicker from '@/components/RatingPicker.vue';
import FormField from '@/components/FormField.vue';
import { NAV_ICONS } from '@/components/NavIcons.js';
import { useSession } from '@/stores/session.js';
import { listQuarters, listParticipants } from '@/lib/performance/quarters.js';
import {
  listQuestions, listAllQuestions, createQuestion, saveQuestion,
  listEvaluatees, listGiven, listReceived, listAllForQuarter, getEvaluation, submitEvaluation
} from '@/lib/performance/coh.js';

const session = useSession();
// Confirmed business rule: only Director and HR may configure COH questions — not whoever happens to hold the
// generic performance.edit tick (that tick still governs Quarters/KPI/TMS admin elsewhere).
const canManageQuestions = computed(() => session.role === 'director' || session.role === 'hr');
const tab = ref('evaluate');

const loading = ref(true);
const saving = ref(false);
const submitting = ref(false);
const error = ref('');

const quarter = ref(null);
const amParticipant = ref(false);
const evaluatees = ref([]);
const givenList = ref([]);
const received = ref([]);
const allQuestions = ref([]);
const newQ = ref({ title: '', description: '' });

// ---- Screen 1: dashboard ----
const search = ref('');
const statusFilter = ref('all');
const sortBy = ref('name');
const FILTERS = [{ key: 'all', label: 'All' }, { key: 'pending', label: 'Pending' }, { key: 'completed', label: 'Completed' }];

const given = uid => givenList.value.some(g => g.evaluateeId === uid);
const evaluatedCount = computed(() => evaluatees.value.filter(p => given(p.employeeId)).length);
const totalCount = computed(() => evaluatees.value.length);
const remaining = computed(() => totalCount.value - evaluatedCount.value);
const pct = computed(() => totalCount.value ? Math.round((evaluatedCount.value / totalCount.value) * 1000) / 10 : 0);

const filteredEvaluatees = computed(() => {
  const q = search.value.trim().toLowerCase();
  let list = evaluatees.value.filter(p => {
    if (q && !p.employeeName.toLowerCase().includes(q)) return false;
    if (statusFilter.value === 'pending') return !given(p.employeeId);
    if (statusFilter.value === 'completed') return given(p.employeeId);
    return true;
  });
  list = [...list];
  if (sortBy.value === 'name') list.sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  else list.sort((a, b) => Number(given(a.employeeId)) - Number(given(b.employeeId)) || a.employeeName.localeCompare(b.employeeName));
  return list;
});

const initials = name => (name || '?').split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
const formatWhen = ts => ts?.toDate ? ts.toDate().toLocaleDateString() : '—';

// "How many people evaluated me" is scoped to THIS quarter's own participant roster (totalCount, computed
// above from listParticipants(quarterId)) — if only 10 people are in Q3, the denominator is 10, not however
// many employees exist company-wide. received.length never exceeds totalCount since evaluatorId/evaluateeId
// are both drawn from that same roster.
const evaluatedMeCount = computed(() => received.value.length);
const notYetEvaluatedMeCount = computed(() => Math.max(0, totalCount.value - evaluatedMeCount.value));
const myAverageRating = computed(() => evaluatedMeCount.value
  ? Math.round((received.value.reduce((s, e) => s + e.averageRating, 0) / evaluatedMeCount.value) * 100) / 100
  : null);

// ---- Director/HR: team overview (every employee's received-evaluation count and average, not just your own) ----
const monitorParticipants = ref([]);
const allEvaluations = ref([]);
const monitorRows = computed(() => {
  const total = monitorParticipants.value.length;
  return monitorParticipants.value.map(p => {
    const theirs = allEvaluations.value.filter(e => e.evaluateeId === p.employeeId && (e.status === 'submitted' || e.status === 'approved'));
    return {
      employeeId: p.employeeId, employeeName: p.employeeName,
      evaluatedBy: theirs.length,
      notYet: Math.max(0, total - 1 - theirs.length),
      average: theirs.length ? Math.round((theirs.reduce((s, e) => s + e.averageRating, 0) / theirs.length) * 100) / 100 : null
    };
  }).sort((a, b) => a.employeeName.localeCompare(b.employeeName));
});

// ---- Screen 2: questionnaire ----
const activeEvaluatee = ref(null);
const questions = ref([]);
const scores = ref([]);
const readOnly = ref(false);
const currentIndex = ref(0);
const showConfirm = ref(false);
const showSuccess = ref(false);
const questionRefs = ref([]);

const LEGEND = [{ n: 1, label: 'Attention' }, { n: 2, label: 'Fair' }, { n: 3, label: 'Good' }, { n: 4, label: 'Very Good' }, { n: 5, label: 'Excellent' }];

const answeredCount = computed(() => scores.value.filter(s => s != null).length);
const remainingQuestions = computed(() => questions.value.length - answeredCount.value);
const canSubmit = computed(() => !readOnly.value && questions.value.length > 0 && answeredCount.value === questions.value.length);

const draftKey = uid => `coh-draft-${quarter.value.id}-${session.user.uid}-${uid}`;
function loadDraft(uid) {
  try { return JSON.parse(localStorage.getItem(draftKey(uid)) || 'null'); } catch { return null; }
}
function saveDraft(uid) {
  try { localStorage.setItem(draftKey(uid), JSON.stringify({ scores: scores.value, savedAt: Date.now() })); } catch { /* storage unavailable, autosave is best-effort */ }
}
function clearDraft(uid) {
  try { localStorage.removeItem(draftKey(uid)); } catch { /* ignore */ }
}

async function load() {
  loading.value = true;
  try {
    const quarters = await listQuarters();
    quarter.value = quarters.find(q => q.status === 'evaluation') || null;
    if (canManageQuestions.value) allQuestions.value = await listAllQuestions();
    if (!quarter.value) return;
    const parts = await listParticipants(quarter.value.id);
    const activeParts = parts.filter(p => p.participationStatus === 'active');
    if (canManageQuestions.value) {
      monitorParticipants.value = activeParts;
      allEvaluations.value = await listAllForQuarter(quarter.value.id);
    }
    amParticipant.value = activeParts.some(p => p.employeeId === session.user.uid);
    if (!amParticipant.value) return;
    evaluatees.value = await listEvaluatees(quarter.value.id, session.user.uid);
    givenList.value = await listGiven(quarter.value.id, session.user.uid);
    received.value = await listReceived(quarter.value.id, session.user.uid);
  } catch (e) { error.value = e.message; } finally { loading.value = false; }
}
onMounted(load);

async function openEvaluatee(p) {
  error.value = '';
  activeEvaluatee.value = p;
  currentIndex.value = 0;
  questions.value = await listQuestions(quarter.value.id);
  const existing = await getEvaluation(quarter.value.id, session.user.uid, p.employeeId);
  readOnly.value = !!existing;
  if (existing) {
    // Submitted already: show exactly what was sent, never a silent default. (Fixes a pre-existing bug where
    // every question defaulted to a rating of 3 instead of being genuinely unanswered until chosen.)
    scores.value = questions.value.map(q => existing.ratings.find(r => r.questionId === q.id)?.score ?? null);
  } else {
    const draft = loadDraft(p.employeeId);
    scores.value = questions.value.map((q, i) => draft?.scores?.[i] ?? null);
  }
}

function selectScore(i, n) {
  if (readOnly.value) return;
  scores.value[i] = n;
  saveDraft(activeEvaluatee.value.employeeId);
}

function backToDashboard() { activeEvaluatee.value = null; }

async function goTo(i) {
  if (i < 0 || i >= questions.value.length) return;
  currentIndex.value = i;
  await nextTick();
  questionRefs.value[i]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function doSubmit() {
  if (!canSubmit.value || submitting.value) return;
  submitting.value = true; error.value = '';
  try {
    const ratings = questions.value.map((q, i) => ({ questionId: q.id, questionTextSnapshot: q.title, score: scores.value[i] }));
    await submitEvaluation(quarter.value.id, activeEvaluatee.value.employeeId, activeEvaluatee.value.employeeName, ratings);
    clearDraft(activeEvaluatee.value.employeeId);
    showConfirm.value = false;
    showSuccess.value = true;
    givenList.value = await listGiven(quarter.value.id, session.user.uid);
    setTimeout(() => { showSuccess.value = false; activeEvaluatee.value = null; }, 1400);
  } catch (e) { error.value = e.message; showConfirm.value = false; } finally { submitting.value = false; }
}

// ---- Admin: question management (unchanged from the previous implementation) ----
async function addQuestion() {
  saving.value = true; error.value = '';
  try {
    await createQuestion({ title: newQ.value.title, description: newQ.value.description, order: allQuestions.value.length });
    newQ.value = { title: '', description: '' }; allQuestions.value = await listAllQuestions();
  } catch (e) { error.value = e.message; } finally { saving.value = false; }
}
async function saveEdit(q, patch) {
  try { await saveQuestion(q.id, patch); } catch (e) { error.value = e.message; }
}
async function moveQuestion(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= allQuestions.value.length) return;
  const a = allQuestions.value[i], b = allQuestions.value[j];
  [a.order, b.order] = [b.order ?? j, a.order ?? i];
  try {
    await Promise.all([saveQuestion(a.id, { order: a.order }), saveQuestion(b.id, { order: b.order })]);
    allQuestions.value = [...allQuestions.value].sort((x, y) => (x.order ?? 0) - (y.order ?? 0));
  } catch (e) { error.value = e.message; }
}
</script>

<style scoped>
/* Follows the account's selected theme (Settings > Appearance) throughout — var(--bg)/var(--surface)/
   var(--accent) etc. already flip for light/dark mode and brand colour, so nothing here is a fixed palette. */
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.coh-panel { position: relative; }
.coh-muted { color: var(--muted); }
.coh-strong { color: var(--text); font-weight: 600; }
.coh-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 18px; }

.coh-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 18px; flex-wrap: wrap; }
.coh-greeting { font-size: 20px; font-weight: 600; color: var(--text); }
.coh-sub { color: var(--text-2); font-size: 13px; margin-top: 2px; }
.coh-q-title { flex: 1; min-width: 0; text-align: center; }
.coh-icon-btn {
  display: inline-flex; align-items: center; gap: 6px; background: var(--surface); color: var(--text);
  border: 1px solid var(--border); border-radius: 10px; padding: 8px 12px; font-size: 13px; font-weight: 500;
  cursor: pointer; transition: border-color .18s ease, background .18s ease;
}
.coh-icon-btn:hover { border-color: var(--accent); background: var(--hover); }
.coh-icon-btn svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.coh-badge { font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 999px; background: var(--chip); color: var(--text-2); border: 1px solid var(--border); }
.coh-badge.submitted { background: var(--green-soft); color: var(--green); border-color: var(--green); }

.coh-standing { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 16px; }
.coh-standing-item { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 16px; text-align: center; }
.coh-standing-value { font-size: 24px; font-weight: 700; color: var(--text); }
.coh-standing-value small { font-size: 13px; font-weight: 500; color: var(--text-2); }
.coh-standing .coh-muted { font-size: 12px; margin-top: 2px; }

.coh-progress-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px 18px; margin-bottom: 16px; }
.coh-progress-top { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 10px; }
.coh-progress-count { font-size: 22px; font-weight: 700; color: var(--text); }
.coh-progress-pct { font-size: 22px; font-weight: 700; color: var(--accent); }
.coh-bar { height: 8px; border-radius: 999px; background: var(--chip); overflow: hidden; }
.coh-bar-fill { height: 100%; background: var(--accent); border-radius: 999px; transition: width .3s var(--ease, ease); }

.coh-toolbar { display: flex; gap: 10px; margin-bottom: 14px; flex-wrap: wrap; align-items: center; }
.coh-search { flex: 1; min-width: 180px; display: flex; align-items: center; gap: 8px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 0 12px; height: 38px; }
.coh-search svg { width: 16px; height: 16px; flex-shrink: 0; fill: none; stroke: var(--muted); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.coh-search input { flex: 1; background: transparent; border: none; outline: none; color: var(--text); font-size: 13px; height: 100%; }
.coh-filters { display: flex; gap: 6px; }
.coh-filter-btn { background: var(--surface); color: var(--text-2); border: 1px solid var(--border); border-radius: 999px; padding: 7px 14px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all .18s ease; }
.coh-filter-btn.on { background: var(--accent); color: #fff; border-color: var(--accent); }
.coh-sort { background: var(--surface); color: var(--text-2); border: 1px solid var(--border); border-radius: 10px; height: 38px; padding: 0 10px; font-size: 12px; }

.coh-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px; }
.coh-colleague-card {
  display: flex; align-items: center; gap: 12px; width: 100%; text-align: left;
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px 14px;
  cursor: pointer; transition: border-color .18s ease, background .18s ease, transform .1s ease; color: inherit;
}
.coh-colleague-card:hover { border-color: var(--accent); background: var(--hover); }
.coh-colleague-card:active { transform: scale(.995); }
.coh-avatar { width: 36px; height: 36px; border-radius: 50%; background: var(--chip); color: var(--accent); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; flex-shrink: 0; }
.coh-colleague-info { flex: 1; min-width: 0; }
.coh-colleague-name { font-weight: 600; font-size: 14px; color: var(--text); }
.coh-status-row { display: flex; align-items: center; gap: 6px; font-size: 12px; margin-top: 2px; }
.coh-status-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--muted); flex-shrink: 0; }
.coh-status-dot.done { background: var(--green); }
.coh-chevron { width: 18px; height: 18px; flex-shrink: 0; color: var(--muted); fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }

.coh-received { border-top: 1px solid var(--border); padding-top: 14px; }
.coh-received-title { font-size: 13px; font-weight: 600; color: var(--text-2); margin-bottom: 8px; }
.coh-received-row { display: flex; justify-content: space-between; gap: 10px; font-size: 13px; padding: 6px 0; border-top: 1px solid var(--border); color: var(--text); }
.coh-received-row:first-of-type { border-top: none; }

.coh-legend { display: flex; gap: 14px; flex-wrap: wrap; font-size: 12px; color: var(--text-2); margin-bottom: 16px; padding: 10px 14px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; }
.coh-legend-item b { color: var(--accent); margin-right: 4px; }

.coh-questions { display: flex; flex-direction: column; gap: 10px; padding-bottom: 90px; }
.coh-q-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px; transition: border-color .18s ease; }
.coh-q-head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; margin-bottom: 4px; }
.coh-q-title-row { font-weight: 600; font-size: 14px; color: var(--text); }
.coh-q-status { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 999px; background: var(--chip); color: var(--muted); white-space: nowrap; }
.coh-q-status.answered { background: var(--green-soft); color: var(--green); }
.coh-q-desc { font-size: 12.5px; color: var(--text-2); margin: 0 0 10px; }

.coh-sticky-bar {
  position: sticky; bottom: 12px; display: flex; align-items: center; justify-content: space-between; gap: 12px;
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px 16px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, .18); flex-wrap: wrap;
}
.coh-sticky-counts { font-size: 13px; color: var(--text-2); }
.coh-sticky-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.coh-btn-ghost { background: transparent; color: var(--text); border: 1px solid var(--border); border-radius: 10px; padding: 8px 14px; font-size: 13px; font-weight: 600; cursor: pointer; }
.coh-btn-ghost:disabled { opacity: .4; cursor: not-allowed; }
.coh-btn-ghost:hover:not(:disabled) { border-color: var(--accent); }
.coh-btn-primary { background: var(--accent); color: #fff; border: 1px solid var(--accent); border-radius: 10px; padding: 8px 16px; font-size: 13px; font-weight: 700; cursor: pointer; transition: filter .15s ease; }
.coh-btn-primary:hover:not(:disabled) { filter: brightness(1.1); }
.coh-btn-primary:disabled { opacity: .45; cursor: not-allowed; }

.coh-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, .45); display: flex; align-items: center; justify-content: center; z-index: 90; padding: 16px; }
.coh-dialog { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 22px; max-width: 420px; width: 100%; color: var(--text); }
.coh-dialog h3 { margin: 0 0 8px; font-size: 16px; }
.coh-dialog-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
.coh-success { text-align: center; }
.coh-success svg { width: 42px; height: 42px; color: var(--green); fill: none; stroke: currentColor; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; margin-bottom: 8px; }

@media (max-width: 640px) {
  .coh-standing { grid-template-columns: 1fr; }
  .coh-header { flex-direction: column; align-items: flex-start; }
  .coh-q-title { text-align: left; }
  .coh-toolbar { flex-direction: column; align-items: stretch; }
  .coh-sticky-bar { flex-direction: column; align-items: stretch; }
  .coh-sticky-actions { justify-content: space-between; }
  .coh-sticky-actions button { flex: 1; }
}
</style>
