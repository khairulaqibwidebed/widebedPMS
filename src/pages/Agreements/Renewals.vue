<template>
  <main class="content">
    <div class="loading-bar" v-show="loading"></div>
    <div class="page-head">
      <div>
        <h1>Agreement renewals</h1>
        <div class="sub">Every agreement with an end date. Reminders go out {{ REMIND_DAYS.slice(0, -1).join(', ') }} days before it ends and on the day.</div>
      </div>
      <div class="head-tools">
        <RouterLink class="btn" to="/Agreements">All agreements</RouterLink>
        <RouterLink v-if="isAdmin" class="btn" to="/Agreements/setup">Reminder settings</RouterLink>
      </div>
    </div>

    <div class="notice error" v-if="error">{{ error }}</div>
    <div class="notice ok" v-if="okMsg">{{ okMsg }}</div>

    <div v-if="!loading && !trackedForms.length" class="card ag-empty">
      <b>No agreements are tracked yet</b>
      {{ isAdmin ? 'In Agreement Setup → Forms, click "Renewal" on a form and choose its end date field.' : 'Ask a Director to turn on renewal reminders in Agreement Setup.' }}
    </div>

    <template v-else-if="!loading">
      <div class="kpis">
        <button v-for="k in KPIS" :key="k.key" class="card kpi kpi-link" :class="{ on: tab === k.key }" @click="tab = k.key">
          <div class="label">{{ k.label }}</div>
          <div class="value" :class="{ alert: k.key === 'ended' && count(k.key) }">{{ count(k.key) }}</div>
          <div class="hint">{{ k.hint }}</div>
        </button>
      </div>

      <div class="card">
        <div class="ag-bar rn-bar">
          <div class="pills" role="group" aria-label="Show">
            <button v-for="t in TABS" :key="t.key" class="pill-btn" :class="{ on: tab === t.key }" @click="tab = t.key">{{ t.label }} ({{ count(t.key) }})</button>
          </div>
        </div>
        <div class="ag-bar rn-bar">
          <label class="sr-only" for="rnSearch">Search</label>
          <input id="rnSearch" class="input rn-search" v-model="search" placeholder="Search agreement or person…">
          <label class="sr-only" for="rnForm">Form</label>
          <select id="rnForm" class="select" v-model="formFilter">
            <option value="">All forms</option>
            <option v-for="f in trackedForms" :key="f.id" :value="f.id">{{ f.name }}</option>
          </select>
          <label class="ag-check-row rn-mine"><input type="checkbox" v-model="onlyMine"> Only mine</label>
        </div>

        <div class="table-wrap">
          <table class="table hover-rows">
            <thead><tr><th>Agreement</th><th>Ends</th><th>Status</th><th>In charge</th><th></th></tr></thead>
            <tbody>
              <tr v-for="r in shown" :key="r.id">
                <td>
                  <RouterLink class="rn-name" :to="'/Agreements/record/' + r.id">{{ r.title || 'Untitled' }}</RouterLink>
                  <br><small class="muted">{{ formName(r.formId) }}<template v-if="r.renewal?.renewedFrom"> · renewal</template></small>
                </td>
                <td>
                  <b>{{ r.endDate ? formatDate(r.endDate, 'DD MMM YYYY') : '—' }}</b>
                  <br><small :class="dayClass(r)">{{ daysText(r.state.days) }}</small>
                </td>
                <td>
                  <span class="pill" :class="r.state.pill">{{ r.state.label }}</span>
                  <br v-if="r.renewal?.note"><small class="muted" v-if="r.renewal?.note">{{ r.renewal.note }}</small>
                </td>
                <td class="rn-ic">
                  <PeoplePicker compact :model-value="inChargeOf(r)" :staff="staff" :disabled="r.busy" :label="'Add a person in charge of ' + r.title"
                    @update:model-value="list => setInCharge(r, list)" />
                </td>
                <td><div class="rn-acts">
                  <template v-if="['soon', 'ended', 'active', 'noDate'].includes(r.state.key)">
                    <button class="act-pill" :disabled="r.busy" @click="setState(r, 'renewing')">Start renewal</button>
                    <button class="act-pill good" :disabled="r.busy" @click="renew(r)">Renew</button>
                    <button class="act-pill danger" :disabled="r.busy" @click="askNot(r)">Not renewing</button>
                  </template>
                  <template v-else-if="r.state.key === 'renewing'">
                    <button class="act-pill good" :disabled="r.busy" @click="renew(r)">Renew now</button>
                    <button class="act-pill danger" :disabled="r.busy" @click="askNot(r)">Not renewing</button>
                    <button class="act-pill" :disabled="r.busy" @click="setState(r, '')">Undo</button>
                  </template>
                  <template v-else-if="r.state.key === 'renewed'">
                    <RouterLink v-if="r.renewal?.renewedTo" class="act-pill" :to="'/Agreements/record/' + r.renewal.renewedTo">Open new term</RouterLink>
                  </template>
                  <button v-else class="act-pill" :disabled="r.busy" @click="setState(r, '')">Undo</button>
                </div></td>
              </tr>
              <tr v-if="!shown.length"><td colspan="5" class="muted">Nothing here.</td></tr>
            </tbody>
          </table>
        </div>
        <p class="note rn-note">Renew makes a new record for the next term with the same answers (signatures and end date cleared) and opens it, so you can set the new dates.
          The old one is kept and marked Renewed.</p>
      </div>
    </template>

    <NameDialog v-if="notFor" :title="'Not renewing: ' + notFor.title" label="Why not?" confirm="Mark not renewing"
      help="e.g. Tenant moving out on 30 Nov. Reminders stop for this agreement." @close="notFor = null" @done="n => { setState(notFor, 'notRenewing', n.trim()); notFor = null; }" />
  </main>
</template>

<script setup>
// Agreement renewals: every tracked agreement by end date, with who is in charge and where the renewal stands.
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import NameDialog from '@/components/agreements/NameDialog.vue';
import { listForms, listRecords, createRecord, updateRecord, setEndDate, listStaff, notifyPerson, audit } from '@/lib/agreements/data.js';
import { tracked, endDateOf, trackState, daysText, todayKL, inChargeOf, REMIND_DAYS } from '@/lib/agreements/renewals.js';
import PeoplePicker from '@/components/agreements/PeoplePicker.vue';
import { formatDate } from '@/lib/agreements/format.js';
import { can } from '@/lib/access.js';
import { useSession } from '@/stores/session.js';
import './agreements.css';

const router = useRouter(), session = useSession();
const isAdmin = computed(() => can(session, 'agreementSetup.view'));
const loading = ref(true), error = ref(''), okMsg = ref('');
const forms = ref([]), records = ref([]), staff = ref([]);
const tab = ref('action'), search = ref(''), formFilter = ref(''), onlyMine = ref(false), notFor = ref(null);
const today = todayKL();

const KPIS = [
  { key: 'soon', label: 'Ending in 60 days', hint: 'Not renewed yet' },
  { key: 'ended', label: 'Ended, not renewed', hint: 'Past the end date' },
  { key: 'renewing', label: 'Renewing', hint: 'Renewal started' },
  { key: 'renewed', label: 'Renewed', hint: 'New term made' }
];
const TABS = [
  { key: 'action', label: 'Needs action' }, { key: 'soon', label: 'Ending soon' }, { key: 'ended', label: 'Ended' },
  { key: 'renewing', label: 'Renewing' }, { key: 'active', label: 'Running' }, { key: 'renewed', label: 'Renewed' },
  { key: 'notRenewing', label: 'Not renewing' }, { key: 'noDate', label: 'No end date' }, { key: 'all', label: 'All' }
];
const inTab = (r, t) => t === 'all' || (t === 'action' ? ['soon', 'ended', 'renewing'].includes(r.state.key) : r.state.key === t);

const trackedForms = computed(() => forms.value.filter(tracked));
const formName = id => forms.value.find(f => f.id === id)?.name || '';
const me = () => session.user?.uid;
const mine = r => inChargeOf(r).some(p => p.uid === me()) || r.createdBy === me();

// Filters except the tab, so the counts on the tabs match what is searched.
const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  return records.value.filter(r => (!formFilter.value || r.formId === formFilter.value) && (!onlyMine.value || mine(r))
    && (!q || [r.title, ...inChargeOf(r).map(p => p.name), r.createdByName, formName(r.formId)].some(s => String(s || '').toLowerCase().includes(q))));
});
const count = t => filtered.value.filter(r => inTab(r, t)).length;
// Soonest end date first; agreements with no end date last.
const shown = computed(() => filtered.value.filter(r => inTab(r, tab.value))
  .sort((a, b) => (a.endDate || '9999').localeCompare(b.endDate || '9999')));
const dayClass = r => (r.state.key === 'ended' ? 'rn-late' : r.state.key === 'soon' ? 'rn-soon' : 'muted');

onMounted(load);
async function load() {
  loading.value = true;
  try {
    forms.value = await listForms();
    const lists = await Promise.all(trackedForms.value.map(f => listRecords(f.id).then(rs => rs.map(r => ({ ...r, form: f })))));
    records.value = lists.flat().filter(r => r.status !== 'archived').map(r => {
      // The saved end date follows the answers (a changed formula or a grid edit may have moved it).
      const end = endDateOf(r.form, r.values);
      if (end !== (r.endDate || '')) setEndDate(r.id, end).catch(() => {});
      const rec = { ...r, endDate: end, busy: false };
      rec.state = trackState(rec, today);
      return rec;
    });
    staff.value = await listStaff().catch(() => []);
  } catch (e) { error.value = 'Could not load the agreements: ' + e.message; }
  loading.value = false;
}

const flash = m => { okMsg.value = m; setTimeout(() => { if (okMsg.value === m) okMsg.value = ''; }, 3500); };
const fail = (e, what) => { error.value = e.code === 'permission-denied' ? `You don't have permission to ${what}.` : `Could not ${what}: ${e.message}`; };

async function setState(r, state, note = '') {
  r.busy = true; error.value = '';
  try {
    const renewal = { ...(r.renewal || {}), state, note: state === 'notRenewing' ? note : (state ? r.renewal?.note || '' : '') };
    await updateRecord(r.id, { renewal });
    r.renewal = renewal; r.state = trackState(r, today);
    audit('agreement.renewal.' + (state || 'reopen'), `agreementRecords/${r.id}`, `${r.title}${note ? ': ' + note : ''}`);
    flash({ renewing: 'Renewal started.', notRenewing: 'Marked as not renewing. No more reminders for it.', '': 'Back to running.' }[state]);
  } catch (e) { fail(e, 'change this agreement'); }
  r.busy = false;
}
function askNot(r) { notFor.value = r; }

// In charge: several people. Anyone newly added gets a bell notification.
async function setInCharge(r, list) {
  const before = inChargeOf(r);
  r.busy = true; error.value = '';
  try {
    await updateRecord(r.id, { inCharge: list });
    r.inCharge = list;
    const added = list.filter(p => !before.some(b => b.uid === p.uid));
    added.forEach(p => notifyPerson(p.uid, 'You are in charge of an agreement: ' + r.title,
      `${formName(r.formId)}${r.endDate ? ', ending ' + formatDate(r.endDate, 'DD MMM YYYY') : ''}. You will get its renewal reminders.`, '/Agreements/record/' + r.id, r.id));
    flash(added.length ? `${added.map(p => p.name).join(', ')} added to ${r.title}.` : `In charge of ${r.title}: ${list.map(p => p.name).join(', ') || 'nobody'}.`);
  } catch (e) { fail(e, 'change who is in charge'); }
  r.busy = false;
}

// Renew: a new record for the next term (same answers, signatures cleared), linked both ways. Opens it to change the dates.
async function renew(r) {
  r.busy = true; error.value = '';
  try {
    const values = { ...(r.values || {}) };
    r.form.fields.filter(f => f.type === 'signature').forEach(f => { values[f.id] = ''; });
    // The new term needs its own end date (a formula end date works itself out from the new start date).
    const endField = r.form.fields.find(f => f.id === r.form.renewal.endFieldId);
    if (endField?.type === 'date') values[endField.id] = '';
    const id = await createRecord(r.formId, values, { title: r.title, endDate: '', inCharge: inChargeOf(r), renewal: { state: '', renewedFrom: r.id, sent: [] } });
    await updateRecord(r.id, { renewal: { ...(r.renewal || {}), state: 'renewed', renewedTo: id } });
    audit('agreement.renewal.renewed', `agreementRecords/${r.id}`, `${r.title} → new term ${id}`);
    router.push('/Agreements/record/' + id);
  } catch (e) { fail(e, 'renew this agreement'); r.busy = false; }
}
</script>

<style scoped>
.rn-bar { margin-bottom: 12px; }
.rn-search { max-width: 280px; }
.rn-mine { margin: 0; }
.rn-name { font-weight: 600; color: var(--text); }
.rn-name:hover { color: var(--accent); }
.rn-ic { min-width: 200px; max-width: 280px; }
.rn-acts { display: flex; gap: 6px; justify-content: flex-end; flex-wrap: wrap; }
.rn-late { color: var(--red); font-weight: 600; }
.rn-soon { color: var(--amber, #B45309); font-weight: 600; }
.rn-note { margin-top: 12px; }
@media (max-width: 900px) { .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
