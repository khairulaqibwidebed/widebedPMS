<template>
  <!-- HR > Leave (26 Nov 2026, Crane). One page for everyone:
       - My leave (MyLeave.vue): every staff member's own balance, apply form and requests. Staff see only this.
       - HR, Directors and Branch Directors (their own branches' staff) also get Requests, Add leave for someone, Leave days and
         Leave types. ?tab=mine|requests|add|days|types opens a tab. Logic: leave.js. -->
  <main class="content">
    <div class="loading-bar" v-show="loading"></div>
    <div class="page-head">
      <div>
        <h1>Leave</h1>
        <div class="sub">{{ manager ? 'Your own leave, plus everyone\'s requests and leave days. Nobody answers or sets their own.' : 'Your leave and MC.' }}</div>
      </div>
    </div>

    <!-- Staff: only My leave, no tabs. HR / Directors: My leave plus the HR tabs. -->
    <div class="tabs" role="tablist" v-if="manager">
      <button type="button" role="tab" :aria-selected="String(tab === 'mine')" :class="{ on: tab === 'mine' }" @click="tab = 'mine'">My leave</button>
      <button type="button" role="tab" :aria-selected="String(tab === 'requests')" :class="{ on: tab === 'requests' }" @click="tab = 'requests'">
        Requests <span class="lv-count" v-if="waitingCount">{{ waitingCount }}</span></button>
      <button type="button" role="tab" :aria-selected="String(tab === 'add')" :class="{ on: tab === 'add' }" @click="tab = 'add'">Add leave for someone</button>
      <button type="button" role="tab" :aria-selected="String(tab === 'days')" :class="{ on: tab === 'days' }" @click="tab = 'days'">Leave days</button>
      <button type="button" role="tab" :aria-selected="String(tab === 'types')" :class="{ on: tab === 'types' }" @click="openTypes()">Leave types</button>
    </div>

    <MyLeave v-if="tab === 'mine'" @changed="manager && loadYear()" />

    <template v-if="manager && tab !== 'mine'">
    <div class="notice error" v-if="error">{{ error }}</div>
    <div class="notice ok" v-if="okMsg">{{ okMsg }}</div>
    <div class="notice warn" v-if="!enabled">Leave is turned off in the attendance app (Attendance › Office settings). Leave already approved still counts, and this page keeps working.</div>

    <!-- ================= Requests ================= -->
    <section class="card" v-if="tab === 'requests'">
      <div class="lv-toolbar">
        <label class="lv-f"><span>Status</span>
          <select class="select" v-model="fStatus"><option value="">All</option><option v-for="(s, k) in STATUS" :key="k" :value="k">{{ s.label }}</option></select></label>
        <label class="lv-f"><span>Year</span>
          <select class="select" v-model.number="year" @change="loadYear()"><option v-for="y in years" :key="y" :value="y">{{ y }}</option></select></label>
        <label class="lv-f"><span>Month</span>
          <select class="select" v-model="fMonth"><option value="">All months</option><option v-for="(m, i) in MONTHS" :key="m" :value="pad(i + 1)">{{ m }}</option></select></label>
        <label class="lv-f"><span>Person</span>
          <select class="select" v-model="fPerson"><option value="">Everyone</option><option v-for="p in personOptions" :key="p.uid" :value="p.uid">{{ p.name }}</option></select></label>
        <label class="lv-f"><span>Type</span>
          <select class="select" v-model="fType"><option value="">All types</option><option v-for="t in types" :key="t.key" :value="t.key">{{ t.label }}{{ t.active ? '' : ' (off)' }}</option></select></label>
      </div>
      <div class="table-wrap">
        <table class="table lv-table">
          <thead><tr><th>Staff</th><th>Type</th><th>Dates</th><th class="num">Days</th><th>Note</th><th>Status</th><th>Answered</th><th></th></tr></thead>
          <tbody>
            <template v-for="r in shownRequests" :key="r.id">
              <tr :class="{ 'lv-wait': r.status === 'pending' }">
                <td><b>{{ r.name }}</b><small class="muted lv-block">{{ r.department }}</small></td>
                <td>{{ typeLabel(r.type) }}<small class="muted lv-block" v-if="r.byHR">added by HR</small></td>
                <td class="nowrap">{{ rangeText(r) }}</td>
                <td class="num">{{ r.days }}</td>
                <td class="lv-note">{{ r.note || '—' }}</td>
                <td>
                  <span class="pill" :class="(STATUS[r.status] || {}).pill">{{ (STATUS[r.status] || { label: r.status }).label }}</span>
                  <small class="lv-block" :class="overOf(r) ? 'lv-over' : 'muted'" v-if="r.status === 'pending' && balLine(r)">{{ balLine(r) }}</small>
                </td>
                <td><span v-if="r.resolvedByName">{{ r.resolvedByName }}</span><small class="muted lv-block" v-if="r.resolveNote">{{ r.resolveNote }}</small></td>
                <td class="lv-acts">
                  <span class="muted" v-if="r.uid === myUid && ['pending', 'approved'].includes(r.status)">Your own</span>
                  <template v-else-if="answering?.id !== r.id">
                    <template v-if="r.status === 'pending'">
                      <button type="button" class="btn btn-sm btn-primary" :disabled="busy" @click="answer(r, 'approved')">Approve</button>
                      <button type="button" class="btn btn-sm" :disabled="busy" @click="openAnswer(r, 'declined')">Decline</button>
                    </template>
                    <button v-if="r.status === 'approved'" type="button" class="btn btn-sm" :disabled="busy" @click="openAnswer(r, 'cancelled')">Cancel leave</button>
                  </template>
                </td>
              </tr>
              <!-- Decline or cancel: the reason (3 to 300 characters) goes to the staff member -->
              <tr v-if="answering?.id === r.id" class="lv-answer">
                <td colspan="8">
                  <form @submit.prevent="answer(r, answering.status, answering.note)">
                    <label :for="'why' + r.id">{{ answering.status === 'declined' ? 'Why is it declined?' : 'Why is it cancelled?' }} <span class="muted">(the staff member sees this)</span></label>
                    <div class="lv-answer-row">
                      <input :id="'why' + r.id" class="input" v-model="answering.note" maxlength="300" :placeholder="answering.status === 'declined' ? 'Too many people off that week' : 'The plan changed'">
                      <button type="submit" class="btn btn-danger" :disabled="busy || answering.note.trim().length < 3">{{ busy ? 'Saving…' : answering.status === 'declined' ? 'Decline' : 'Cancel the leave' }}</button>
                      <button type="button" class="btn" :disabled="busy" @click="answering = null">Back</button>
                    </div>
                  </form>
                </td>
              </tr>
            </template>
            <tr v-if="!loading && !shownRequests.length"><td colspan="8" class="muted">No requests match these filters.</td></tr>
          </tbody>
        </table>
      </div>
      <p class="help">Waiting requests come first, oldest first. "Left" counts approved leave of that type whose first day is in that year; going over is allowed, you decide.</p>
    </section>

    <!-- ================= Add leave for someone ================= -->
    <div class="grid-2" v-if="tab === 'add'">
      <section class="card">
        <div class="card-head"><h2>Add leave for someone</h2></div>
        <form @submit.prevent="addFor()">
          <div class="field"><label for="aWho" class="req">Staff member</label>
            <select id="aWho" class="select" v-model="add.uid" required>
              <option value="">Pick a person</option>
              <option v-for="p in staffNotMe" :key="p.uid" :value="p.uid">{{ p.name }}</option>
            </select></div>
          <div class="field"><label for="aType" class="req">Type</label>
            <select id="aType" class="select" v-model="add.type"><option v-for="t in activeT" :key="t.key" :value="t.key">{{ t.label }}</option></select></div>
          <div class="grid-fields">
            <div class="field"><label for="aFrom" class="req">From</label><input id="aFrom" class="input" type="date" v-model="add.from" required @change="add.to = (!add.to || add.to < add.from) ? add.from : add.to"></div>
            <div class="field"><label for="aTo" class="req">To</label><input id="aTo" class="input" type="date" v-model="add.to" :min="add.from" required></div>
          </div>
          <label class="check"><input type="checkbox" v-model="add.halfDay" :disabled="add.from !== add.to"><span>Half day <small>One day only</small></span></label>
          <div class="field"><label for="aNote">Note</label><input id="aNote" class="input" v-model="add.note" maxlength="300" placeholder="Called in sick, MC to follow"></div>
          <p class="help"><b>{{ daysText(addDays) }}</b> of working days (rest days and public holidays don't count). Saved as approved, and the staff member is told.</p>
          <p class="notice warn" v-if="addOver">{{ `That is ${addOver} day${addOver === 1 ? '' : 's'} more than ${addPerson?.name} has left for ${typeLabel(add.type)}. You can still add it.` }}</p>
          <button class="btn btn-primary" type="submit" :disabled="busy || !add.uid || !add.from || !add.to">{{ busy ? 'Saving…' : 'Add leave' }}</button>
        </form>
      </section>
      <section class="card" v-if="addPerson">
        <div class="card-head"><h2>{{ `${addPerson.name} · ${addYear}` }}</h2></div>
        <div class="lv-bal">
          <div class="lv-bal-row" v-for="b in addBalance.filter(x => x.active || x.used || x.waiting)" :key="b.key">
            <b>{{ b.label }}</b>
            <span>{{ b.given == null ? 'No limit' : `${b.left} left of ${b.given}` }}</span>
            <small class="muted">{{ `${b.used} used · ${b.waiting} waiting` }}</small>
          </div>
        </div>
        <p class="help" v-if="addYear !== year">{{ `Leave days for ${addYear} are shown on Leave days when you pick that year.` }}</p>
      </section>
    </div>

    <!-- ================= Leave days (entitlements) ================= -->
    <section class="card" v-if="tab === 'days'">
      <div class="lv-toolbar">
        <label class="lv-f"><span>Year</span>
          <select class="select" v-model.number="year" @change="loadYear()"><option v-for="y in years" :key="y" :value="y">{{ y }}</option></select></label>
        <label class="lv-f lv-grow"><span>Search</span><input class="input" type="search" v-model="dSearch" placeholder="Search a name"></label>
        <button type="button" class="btn" :disabled="busy" @click="copyLastYear()">{{ `Copy from ${year - 1}` }}</button>
        <span class="lv-fill">
          <span>Set for everyone</span>
          <select class="select" v-model="fill.type" aria-label="Type"><option v-for="t in activeT" :key="t.key" :value="t.key">{{ t.label }}</option></select>
          <input class="input" type="number" min="0" max="365" step="0.5" v-model="fill.value" placeholder="14" aria-label="Days">
          <button type="button" class="btn" :disabled="busy || fill.value === ''" @click="fillAll()">Fill empty boxes</button>
        </span>
      </div>
      <div class="lv-savebar" v-if="dirtyUids.length">
        <span>{{ `${dirtyUids.length} ${dirtyUids.length === 1 ? 'person' : 'people'} changed, not saved yet` }}</span>
        <button type="button" class="btn btn-primary" :disabled="busy" @click="saveDays()">{{ busy ? 'Saving…' : 'Save changes' }}</button>
        <button type="button" class="btn" :disabled="busy" @click="resetDraft()">Discard</button>
      </div>
      <div class="table-wrap">
        <table class="table lv-days">
          <thead><tr><th>Staff</th><th v-for="t in activeT" :key="t.key">{{ t.label }}</th></tr></thead>
          <tbody>
            <tr v-for="s in daysStaff" :key="s.uid" :class="{ 'lv-dirty': dirtyUids.includes(s.uid) }">
              <td><b>{{ s.name }}</b><small class="muted lv-block">{{ s.uid === myUid ? 'Yours: another HR person or a Director sets it' : deptName(s.role) }}</small></td>
              <td v-for="b in balanceOf(s.uid).filter(x => x.active)" :key="b.key">
                <input class="input lv-in" type="number" min="0" max="365" step="0.5" placeholder="No limit" :disabled="s.uid === myUid || busy"
                  :value="draft[s.uid]?.[b.key] ?? ''" @input="setCell(s.uid, b.key, $event.target.value)" :aria-label="`${s.name}, ${b.label} days`">
                <small class="lv-used" :class="{ 'lv-over': b.left != null && b.left < 0 }">{{ `${b.used} used · ${b.waiting} waiting${b.left == null ? '' : ` · ${b.left} left`}` }}</small>
              </td>
            </tr>
            <tr v-if="!loading && !daysStaff.length"><td :colspan="activeT.length + 1" class="muted">No staff match.</td></tr>
          </tbody>
        </table>
      </div>
      <p class="help">Days per type for {{ year }}. Halves are allowed (12.5). An empty box means no limit for that type (Unpaid and Other usually stay empty).
        "Copy from {{ year - 1 }}" fills only people with nothing set for {{ year }}; "Fill empty boxes" never overwrites a number. Nothing is saved until you click Save changes.
        Add or turn off leave types on the Leave types tab.</p>
    </section>


    <!-- ================= Leave types (26 Nov 2026, rules Draft 1.16): the built-in five + HR's own ================= -->
    <section class="card lv-types" v-if="tab === 'types'">
      <div class="card-head"><h2>Leave types</h2><span class="muted">{{ `${typeDraft.length} of ${MAX_TYPES}` }}</span></div>
      <p class="help">The types staff can pick in My Leave and the attendance app, and the columns on Leave days. A saved type is never deleted,
        only turned off: nobody can pick it for new leave, and leave already taken under it keeps its name.</p>
      <div class="lv-type" v-for="(t, i) in typeDraft" :key="t.key" :class="{ off: !t.active }">
        <input class="input" v-model="t.label" maxlength="40" :aria-label="`Name of ${t.label || 'the new type'}`">
        <span class="pill" :class="t.builtIn ? 'grey' : 'blue'">{{ t.builtIn ? 'Built-in' : t.saved ? 'Added by HR' : 'New' }}</span>
        <label class="check lv-on"><input type="checkbox" v-model="t.active"><span>{{ t.active ? 'On' : 'Off' }}</span></label>
        <button type="button" class="btn btn-sm" v-if="!t.saved && !t.builtIn" @click="typeDraft.splice(i, 1)">Remove</button>
      </div>
      <form class="lv-type-add" @submit.prevent="addType()">
        <input class="input" v-model="newType" maxlength="40" placeholder="Maternity, Paternity, Compassionate, Hospitalisation…" aria-label="New leave type">
        <button class="btn" type="submit" :disabled="!newType.trim() || typeDraft.length >= MAX_TYPES">+ Add type</button>
      </form>
      <div class="lv-type-save">
        <button type="button" class="btn btn-primary" :disabled="busy || !typesDirty" @click="saveTypes()">{{ busy ? 'Saving…' : 'Save leave types' }}</button>
        <button type="button" class="btn" :disabled="busy || !typesDirty" @click="openTypes()">Discard</button>
        <span class="muted" v-if="typesDirty">Not saved yet</span>
      </div>
      <p class="help">The attendance app shows the types you add here once it reads this list (an app update). Until then it shows only the built-in five.</p>
    </section>
    </template>
  </main>
</template>

<script>
import { ROLE_LABEL } from '@/lib/firebase.js';
import { friendlyError } from '@/lib/finance-data.js';
import { useSession } from '@/stores/session.js';
import MyLeave from './MyLeave.vue';
import { loadConfig, loadStaff, loadHolidays, pad, dayKey } from './attendance.js';
import {
  STATUS, rangeText, daysText, workingDays, balanceFor, overBy, cleanDays, daysInput, sortForHR, leaveEnabled,
  typeLabel, loadLeaveTypes, saveLeaveTypes, keyFor, MAX_TYPES, loadLeaveForYear, loadEntitlements, answerLeave, addLeaveFor, saveEntitlements, copyDraft, fillDraft
} from './leave.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const emptyAdd = () => ({ uid: '', type: 'annual', from: '', to: '', halfDay: false, note: '' });

const TABS = ['mine', 'requests', 'add', 'days', 'types'];
const MANAGERS = ['hr', 'director', 'branchDirector'];   // the rules' hrOrDir()

export default {
  components: { MyLeave },
  data() {
    const y = +dayKey().slice(0, 4);
    return {
      STATUS, MONTHS, MAX_TYPES,
      types: [], typeDraft: [], newType: '',   // leave types in use; the Leave types tab's working copy
      tab: 'mine', loading: false, busy: false, error: '', okMsg: '',
      cfg: {}, staff: [], holidays: {}, list: [], ents: {}, year: y,
      fStatus: '', fMonth: '', fPerson: '', fType: '', answering: null,
      add: emptyAdd(),
      draft: {}, dSearch: '', fill: { type: 'annual', value: '' }
    };
  },
  computed: {
    me() { return useSession(); },
    // HR, Directors and Branch Directors see the HR tabs; everyone else only My leave
    manager() { return MANAGERS.includes(this.me.role); },
    myUid() { return this.me.user?.uid; },
    enabled() { return leaveEnabled(this.cfg); },
    years() { const y = +dayKey().slice(0, 4); return [y - 2, y - 1, y, y + 1]; },
    staffUids() { return new Set(this.staff.map(s => s.uid)); },
    // Branch Directors: only staff in their own branches (loadStaff is already limited); everyone else sees former staff too
    visible() { return this.me.role === 'branchDirector' ? this.list.filter(r => this.staffUids.has(r.uid)) : this.list; },
    waitingCount() { return this.visible.filter(r => r.status === 'pending' && r.uid !== this.myUid).length; },
    personOptions() {
      const m = new Map(this.staff.map(s => [s.uid, s.name]));
      for (const r of this.visible) if (!m.has(r.uid)) m.set(r.uid, r.name || 'Former staff');
      return [...m].map(([uid, name]) => ({ uid, name })).sort((a, b) => a.name.localeCompare(b.name));
    },
    shownRequests() {
      const ym = this.fMonth ? `${this.year}-${this.fMonth}` : '';
      return sortForHR(this.visible.filter(r => (!this.fStatus || r.status === this.fStatus) && (!this.fPerson || r.uid === this.fPerson)
        && (!this.fType || r.type === this.fType)
        // Month: the leave touches that month (waiting ones from other years still show when no month is picked)
        && (!ym ? (r.status === 'pending' || r.from.slice(0, 4) <= String(this.year) && r.to.slice(0, 4) >= String(this.year)) : (r.from.slice(0, 7) <= ym && r.to.slice(0, 7) >= ym))));
    },
    activeT() { return this.types.filter(t => t.active); },
    typesDirty() {
      const strip = l => JSON.stringify(l.map(t => [t.key, t.label.trim(), !!t.active]));
      return strip(this.typeDraft) !== strip(this.types);
    },
    staffNotMe() { return this.staff.filter(s => s.uid !== this.myUid); },
    addPerson() { return this.staff.find(s => s.uid === this.add.uid) || null; },
    addDays() {
      return workingDays({ from: this.add.from, to: this.add.to, halfDay: this.add.halfDay && this.add.from === this.add.to, cfg: this.cfg, holidays: this.holidays, uid: this.add.uid });
    },
    addYear() { return this.add.from ? +this.add.from.slice(0, 4) : this.year; },
    addBalance() { return this.addPerson ? balanceFor(this.addYear === this.year ? this.ents[this.add.uid] : null, this.list, this.add.uid, this.addYear) : []; },
    addOver() { return this.addPerson && this.addYear === this.year ? overBy(this.addBalance, this.add.type, this.addDays) : 0; },
    daysStaff() {
      const q = this.dSearch.trim().toLowerCase();
      return this.staff.filter(s => !q || s.name.toLowerCase().includes(q));
    },
    dirtyUids() {
      return this.staff.filter(s => s.uid !== this.myUid && this.types.some(t => (this.draft[s.uid]?.[t.key] ?? '') !== (daysInput(this.ents[s.uid]?.days)[t.key] ?? ''))).map(s => s.uid);
    }
  },
  watch: {
    // A notification clicked while already on this page (?tab=…) switches the tab
    '$route.query.tab'(t) { if (this.manager && TABS.includes(t)) { if (t === 'types') this.openTypes(); else this.tab = t; } }
  },
  async mounted() {
    const want = String(this.$route.query.tab || '');
    if (!this.manager) { this.tab = 'mine'; return; }   // staff: nothing else to load (and they can't read others' leave)
    this.tab = TABS.includes(want) ? want : 'requests';
    this.loading = true;
    try {
      const [cfg, staff, hol, types] = await Promise.all([loadConfig(), loadStaff(), loadHolidays(), loadLeaveTypes()]);
      this.cfg = cfg; this.staff = staff; this.holidays = hol; this.types = [...types];
    } catch (e) { this.error = friendlyError(e, 'load the staff list'); }
    if (this.tab === 'types') this.openTypes();   // after the saved types are loaded
    await this.loadYear();
  },
  methods: {
    pad, rangeText, daysText, typeLabel,
    deptName(role) { return ROLE_LABEL[role] || role || ''; },
    flash(msg) { this.okMsg = msg; setTimeout(() => { if (this.okMsg === msg) this.okMsg = ''; }, 5000); },
    async loadYear() {
      this.loading = true; this.error = '';
      try {
        const [list, ents] = await Promise.all([loadLeaveForYear(this.year), loadEntitlements(this.year)]);
        this.list = list; this.ents = ents; this.resetDraft();
      } catch (e) { this.error = friendlyError(e, 'load leave'); }
      this.loading = false;
    },
    resetDraft() { this.draft = Object.fromEntries(this.staff.map(s => [s.uid, daysInput(this.ents[s.uid]?.days)])); },
    balanceOf(uid) { return balanceFor(this.ents[uid], this.list, uid, this.year); },
    // "3 left of 14 Annual in 2026", for a waiting request
    balLine(r) {
      const y = +r.from.slice(0, 4);
      if (y !== this.year) return '';
      const b = balanceFor(this.ents[r.uid], this.list, r.uid, y).find(x => x.key === r.type);
      return b && b.given != null ? `${b.left} left of ${b.given} (${b.waiting} waiting)` : '';
    },
    overOf(r) {
      const y = +r.from.slice(0, 4);
      if (y !== this.year) return 0;
      const b = balanceFor(this.ents[r.uid], this.list, r.uid, y).find(x => x.key === r.type);
      return b && b.given != null && r.days > b.left ? 1 : 0;
    },

    // ---- Leave types ----
    openTypes() { this.tab = 'types'; this.newType = ''; this.typeDraft = this.types.map(t => ({ ...t, saved: true })); },
    addType() {
      const label = this.newType.trim();
      if (!label) return;
      if (this.typeDraft.some(t => t.label.trim().toLowerCase() === label.toLowerCase())) { this.error = `"${label}" is already on the list.`; return; }
      this.error = '';
      this.typeDraft.push({ key: keyFor(label, this.typeDraft.map(t => t.key)), label, active: true, builtIn: false, saved: false });
      this.newType = '';
    },
    async saveTypes() {
      this.busy = true; this.error = '';
      try {
        this.types = [...await saveLeaveTypes(this.typeDraft, this.me)];
        this.typeDraft = this.types.map(t => ({ ...t, saved: true }));
        this.resetDraft();
        this.flash('Leave types saved.');
      } catch (e) { this.error = e.code ? friendlyError(e, 'save the leave types') : e.message; }
      this.busy = false;
    },

    // ---- Requests ----
    openAnswer(r, status) { this.answering = { id: r.id, status, note: '' }; },
    async answer(r, status, note = '') {
      this.busy = true; this.error = '';
      try {
        await answerLeave(r, status, note, this.me);
        const word = { approved: 'approved', declined: 'declined', cancelled: 'cancelled' }[status];
        this.answering = null;
        this.flash(`${r.name}'s leave ${word}. They have been told.`);
        await this.loadYear();
      } catch (e) { this.error = e.code ? friendlyError(e, 'save the answer') : e.message; }
      this.busy = false;
    },

    // ---- Add leave for someone ----
    async addFor() {
      this.busy = true; this.error = '';
      try {
        const a = this.add;
        await addLeaveFor({ person: this.addPerson, type: a.type, from: a.from, to: a.to, halfDay: a.halfDay && a.from === a.to, note: a.note, days: this.addDays, me: this.me });
        this.flash(`Leave added for ${this.addPerson.name}. They have been told.`);
        this.add = emptyAdd();
        await this.loadYear();
      } catch (e) { this.error = e.code ? friendlyError(e, 'add the leave') : e.message; }
      this.busy = false;
    },

    // ---- Leave days ----
    setCell(uid, key, value) { this.draft = { ...this.draft, [uid]: { ...(this.draft[uid] || daysInput({})), [key]: value } }; },
    async copyLastYear() {
      this.busy = true; this.error = '';
      try {
        const last = await loadEntitlements(this.year - 1);
        const others = this.staff.filter(s => s.uid !== this.myUid);
        const { draft, count } = copyDraft(this.draft, last, others, this.ents);
        this.draft = draft;
        this.flash(count ? `${count} ${count === 1 ? 'person' : 'people'} filled from ${this.year - 1}. Check them, then Save changes.` : `Nothing to copy: everyone already has ${this.year} days, or nobody had ${this.year - 1} days.`);
      } catch (e) { this.error = friendlyError(e, `read ${this.year - 1}`); }
      this.busy = false;
    },
    fillAll() {
      const { error } = cleanDays({ [this.fill.type]: this.fill.value });
      if (error) { this.error = error; return; }
      const { draft, count } = fillDraft(this.draft, this.daysStaff, this.fill.type, this.fill.value, this.myUid);
      this.draft = draft; this.error = '';
      this.flash(count ? `${count} empty ${typeLabel(this.fill.type)} box${count === 1 ? '' : 'es'} filled with ${this.fill.value}. Save changes to keep them.` : 'No empty boxes to fill.');
    },
    async saveDays() {
      const changes = [];
      for (const uid of this.dirtyUids) {
        const s = this.staff.find(x => x.uid === uid);
        const { days, error } = cleanDays(this.draft[uid]);
        if (error) { this.error = `${s.name}: ${error}`; return; }
        changes.push({ uid, name: s.name, days, note: this.ents[uid]?.note || '' });
      }
      this.busy = true; this.error = '';
      try {
        await saveEntitlements(changes, this.year, this.me);
        this.flash(`Leave days saved for ${changes.length} ${changes.length === 1 ? 'person' : 'people'}.`);
        this.ents = await loadEntitlements(this.year); this.resetDraft();
      } catch (e) { this.error = e.code ? friendlyError(e, 'save the leave days') : e.message; }
      this.busy = false;
    }
  }
};
</script>

<style scoped>
.lv-count { display: inline-grid; place-items: center; min-width: 18px; height: 18px; padding: 0 5px; margin-left: 4px; border-radius: 999px; background: var(--accent); color: #fff; font-size: 11px; font-weight: 700; }
.lv-toolbar { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; margin-bottom: 14px; }
.lv-f { display: grid; gap: 4px; font-size: 12px; font-weight: 600; color: var(--text-2); }
.lv-f .select, .lv-f .input { height: 38px; min-width: 130px; }
.lv-grow { flex: 1; min-width: 180px; }
.lv-fill { display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 13px; color: var(--text-2); }
.lv-fill .select { height: 38px; }
.lv-fill .input { width: 80px; height: 38px; }
.lv-block { display: block; }
.lv-table td { vertical-align: top; }
.lv-note { max-width: 260px; overflow-wrap: anywhere; font-size: 13px; }
.lv-wait td { background: #fffbf0; }
.lv-acts { white-space: nowrap; text-align: right; }
.lv-acts .btn + .btn { margin-left: 6px; }
.lv-answer td { background: var(--accent-soft); }
.lv-answer label { font-size: 13px; font-weight: 600; }
.lv-answer-row { display: flex; gap: 8px; margin-top: 6px; flex-wrap: wrap; }
.lv-answer-row .input { flex: 1; min-width: 240px; }
.lv-over { color: var(--red); font-weight: 600; }
.lv-bal { display: grid; gap: 8px; }
.lv-bal-row { display: grid; grid-template-columns: 130px 1fr; gap: 2px 10px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; }
.lv-bal-row small { grid-column: 2; }
.lv-savebar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 10px 12px; margin-bottom: 12px; border-radius: 10px; background: var(--amber-soft); color: var(--amber); font-weight: 600; font-size: 13px; }
.lv-savebar span { flex: 1; }
.lv-days { min-width: 900px; }
.lv-days td { vertical-align: top; }
.lv-in { width: 100%; max-width: 120px; height: 38px; text-align: center; font-weight: 600; }
.lv-used { display: block; font-size: 11px; color: var(--muted); margin-top: 4px; white-space: nowrap; }
.lv-dirty td { background: #fffbf0; }
.lv-types { max-width: 760px; }
.lv-type { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--line, var(--border)); }
.lv-type .input { flex: 1; height: 38px; }
.lv-type.off .input { color: var(--muted); }
.lv-on { margin: 0; min-width: 60px; }
.lv-type-add { display: flex; gap: 8px; margin: 14px 0; }
.lv-type-add .input { flex: 1; height: 38px; }
.lv-type-save { display: flex; align-items: center; gap: 10px; }
.nowrap { white-space: nowrap; }
.num { text-align: right; font-variant-numeric: tabular-nums; }
</style>
