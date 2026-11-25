<template>
  <main class="content">
    <div class="loading-bar" v-show="loading"></div>

    <div class="page-head dash-head">
      <div>
        <h1>{{ view === 'director' ? (isBD ? 'Branch Director dashboard' : 'Director dashboard') : 'Accounting dashboard' }}</h1>
        <div class="sub">{{ subtitle() }}</div>
      </div>
      <div class="head-tools">
        <div class="head-row">
        <PropertyPicker v-model="propertyId" :properties="properties" :before="[{ value: 'all', label: 'All properties' }]" @change="load()" />
        <MonthPicker v-model="month" @change="load()" />
        </div>
      </div>
    </div>


    <template v-if="data">
      <div>
        <!-- KPI cards -->
        <section class="kpis">
          <RouterLink class="card kpi kpi-link" to="/Reports" title="Open Reports">
            <div class="label">Rental income</div>
            <div class="value">{{ rm(data.rentalIncome) }}</div>
            <div class="hint">{{ `From eZee, checked out in ${shortMonth(month)}` }}</div>
          </RouterLink>
          <RouterLink class="card kpi kpi-link" :to="`/Finance/month-end?property=${propertyId === 'all' ? '' : propertyId}&month=${month}`" title="Open Month-end payout">
            <div class="label">Owner payouts</div>
            <div class="value">{{ data.statementsDone ? rm(data.balToPay) : '—' }}</div>
            <div class="hint">{{ data.statementsDone ? 'To pay, from completed statements' : 'Shown once statements are completed' }}</div>
          </RouterLink>
          <template v-if="view === 'finance'">
            <RouterLink class="card kpi kpi-link" :to="`/Finance/month-end?property=${propertyId === 'all' ? '' : propertyId}&month=${month}`" title="Open Month-end payout">
              <div class="label">Statements completed</div>
              <div class="value">{{ `${data.statementsDone} of ${data.unitCount}` }}</div>
              <div class="hint">{{ data.statementsDone < data.unitCount ? 'Approve & complete not done yet' : 'All done' }}</div>
            </RouterLink>
          </template>
          <template v-if="view === 'director'">
            <RouterLink class="card kpi kpi-link" to="/Operations/issues" title="Open Issues">
              <div class="label">Open tickets</div>
              <div class="value">{{ issues ? issues.total : '—' }}</div>
              <div class="hint">{{ issues ? (issues.total ? `${issues.notStarted} not started yet` : 'Nothing open on Issues') : (issuesError || 'Loading…') }}</div>
            </RouterLink>
          </template>
          <button type="button" class="card kpi kpi-link" @click="jump('attn')" title="Show the list below">
            <div class="label">{{ view === 'director' ? 'Waiting on Director' : 'Needs attention' }}</div>
            <div class="value" :class="attentionCount() ? 'alert' : ''">{{ attentionCount() }}</div>
            <div class="hint">{{ view === 'director' ? 'Approvals only a Director can give' : 'Ctrip amounts, negatives, set-up' }}</div>
          </button>
        </section>

        <!-- DIRECTOR: today (24 Nov 2026, Khairul). Malaysia time; units and moves follow the property picker. -->
        <section class="kpis" v-if="view === 'director'">
          <RouterLink class="card kpi kpi-link" :to="propertyId === 'all' ? '/Portfolio/properties' : `/Portfolio/properties?property=${propertyId}`" title="Open Properties">
            <div class="label">Total No of Units</div>
            <div class="value">{{ unitTotal() ?? '—' }}</div>
            <div class="hint">{{ unitCounts ? (propertyId === 'all' ? `Active units in ${properties.length} properties` : 'Active units in this property') : (todayError.units || 'Loading…') }}</div>
          </RouterLink>
          <button type="button" class="card kpi kpi-link" @click="jump('today')" title="Show the list below">
            <div class="label">Today's Move-in</div>
            <div class="value">{{ moves ? movesOf('in').length : '—' }}</div>
            <div class="hint">{{ moves ? 'Checking in today, from Bookings' : (todayError.moves || 'Loading…') }}</div>
          </button>
          <button type="button" class="card kpi kpi-link" @click="jump('today')" title="Show the list below">
            <div class="label">Today's Move-out</div>
            <div class="value">{{ moves ? movesOf('out').length : '—' }}</div>
            <div class="hint">{{ moves ? 'Checking out today, from Bookings' : (todayError.moves || 'Loading…') }}</div>
          </button>
          <button type="button" class="card kpi kpi-link" @click="jump('duty')" title="Show the list below">
            <div class="label">Today's Duty Staff</div>
            <div class="value">{{ duty ? duty.length : '—' }}</div>
            <div class="hint">{{ duty ? (duty.length ? `${duty.filter(d => d.open).length} still clocked in` : 'Nobody has clocked in yet') : (todayError.duty || 'Loading…') }}</div>
          </button>
        </section>

        <!-- FINANCE -->
        <template v-if="view === 'finance'">
          <div class="grid-2 fill">
            <div class="stack">
              <section class="card">
                <div class="card-head"><h2>Month-end progress</h2><RouterLink :to="`/Finance/month-end?property=${propertyId === 'all' ? '' : propertyId}&month=${month}`" class="link">Open Month-end payout ›</RouterLink></div>
                <div class="steps">
                  <template v-for="s in data.steps" :key="s.n">
                    <div class="step" :class="{ done: s.done, current: s.current }">
                      <span class="dot">{{ s.done ? '✓' : s.n }}</span><span>{{ s.label }}</span>
                    </div>
                  </template>
                </div>
                <div class="note">{{ data.progressNote }}</div>
              </section>
              <section class="card">
              <div class="card-head"><h2>Quick actions</h2></div>
              <div class="dq-grid col">
                <RouterLink class="dq-tile dq-main" :to="'/Finance/upload'">
                  <span class="dq-ic"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" /></svg></span>
                  <span class="dq-txt"><b>Upload eZee report</b><small>Start the month with the latest bookings</small></span>
                  <span class="dq-go">&rsaquo;</span>
                </RouterLink>
                <RouterLink class="dq-tile" :to="`/Finance/expenses?month=${month}&add=1`">
                  <span class="dq-ic"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14" /></svg></span>
                  <span class="dq-txt"><b>Add expense</b><small>Repairs, bills and reimbursements</small></span>
                  <span class="dq-go">&rsaquo;</span>
                </RouterLink>
                <RouterLink class="dq-tile" :to="`/Finance/month-end?month=${month}`">
                  <span class="dq-ic"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg></span>
                  <span class="dq-txt"><b>Open Month-end payout</b><small>Check, edit and complete statements</small></span>
                  <span class="dq-go">&rsaquo;</span>
                </RouterLink>
                <RouterLink class="dq-tile" :to="'/Finance/upload#daily'">
                  <span class="dq-ic"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg></span>
                  <span class="dq-txt"><b>Download daily export</b><small>Yesterday's check-outs as CSV</small></span>
                  <span class="dq-go">&rsaquo;</span>
                </RouterLink>
              </div>
                </section>
            </div>
            <div class="stack">
              <section class="card" ref="attn">
                <div class="card-head"><h2>Needs attention</h2></div>
                <div class="rows">
                  <Capped :items="data.attention" :size="7" v-slot="{ capRows }">
                  <template v-for="(a, i) in capRows" :key="i">
                    <div class="row"><span>{{ a.text }}</span><span class="r">{{ a.tag }}</span></div>
                  </template>
                  </Capped>
                  <div class="empty" v-show="!data.attentionCount">Nothing needs attention for this month.</div>
                </div>
              </section>
            </div>
          </div>
                  </template>

        <!-- DIRECTOR (layout 24 Nov 2026, Khairul): row 1 moves + Waiting on Director; row 2 duty staff, full width, every
             name; row 3 Team activity, Open tickets, Quick actions -->
        <template v-if="view === 'director'">
          <div class="grid-2 fill dir-row">
            <section class="card" ref="today">
              <div class="card-head"><h2>Today's move-in and move-out</h2><RouterLink class="link" :to="propertyId === 'all' ? '/Portfolio/bookings' : `/Portfolio/bookings?property=${propertyId}`">Bookings ›</RouterLink></div>
              <div class="rows">
                <template v-if="moves">
                  <Capped :items="moves.filter(inProperty)" :size="6" v-slot="{ capRows }">
                  <template v-for="m in capRows" :key="m.key">
                    <RouterLink class="row tk-ticket" :to="`/Portfolio/bookings?property=${m.propertyId}&id=${m.id}`" title="Open this booking">
                      <span>{{ m.unit }}<span class="note" v-if="propertyId === 'all' && m.propertyName">{{ ' · ' + m.propertyName }}</span><span class="note">{{ ' · ' + m.bookingNo }}</span></span>
                      <span class="r"><span class="pill amber" v-if="m.pending">Awaiting payment</span><span class="pill amber" v-else-if="m.ended">Terminated early</span>{{ ' ' }}<span class="pill" :class="m.dir === 'in' ? 'green' : 'blue'">{{ m.dir === 'in' ? 'In' : 'Out' }}</span>{{ ' ' + m.lease }}</span>
                    </RouterLink>
                  </template>
                  </Capped>
                  <div class="empty" v-show="!moves.filter(inProperty).length">No move-ins or move-outs today.</div>
                </template>
                <div class="empty" v-else>{{ todayError.moves || 'Loading…' }}</div>
                <div class="note">From the Bookings page: check-in or check-out date is today. Cancelled bookings are left out.</div>
              </div>
            </section>
            <section class="card" ref="attn">
              <div class="card-head"><h2>Waiting on Director</h2></div>
              <div class="rows hold-5-wait">
                <Capped :items="directorItems()" :size="5" :fixed="true" v-slot="{ capRows }">
                <template v-for="(a, i) in capRows" :key="i">
                  <div class="row"><span>{{ noFee(a.text) || a.text }}<span class="nofee-cap" v-if="noFee(a.text)">No Fee</span></span><RouterLink class="btn" to="/Portfolio/properties">Set up</RouterLink></div>
                </template>
                </Capped>
                <div class="empty" v-show="!directorItems().length">Nothing is waiting on you.</div>
              </div>
            </section>
          </div>
            <section class="card dir-row" ref="duty">
              <div class="card-head"><h2>{{ duty ? `Today's duty staff (${duty.length})` : "Today's duty staff" }}</h2><RouterLink class="link" to="/HR/attendance">Attendance ›</RouterLink></div>
              <div class="rows">
                <template v-if="duty">
                  <div class="tk-summary duty-summary">
                    <span><b>{{ duty.length }}</b> on duty</span>
                    <span><span class="tk-dot green"></span>{{ duty.filter(d => d.open).length }} still clocked in</span>
                    <span><span class="tk-dot grey"></span>{{ duty.filter(d => !d.open).length }} clocked out</span>
                    <!-- 24 Nov 2026 (Khairul): how many have not clocked in; hover (or tab to it) lists the names -->
                    <span class="duty-missing" v-if="missing && !missing.error" :tabindex="missing.list.length ? 0 : -1">
                      <span class="tk-dot red"></span>{{ missing.offDay ? 'Not a work day, nobody missing' : `${missing.list.length} missing` }}
                      <span class="duty-pop" v-if="missing.list.length">
                        <span class="duty-pop-head">{{ `Not clocked in today (${missing.list.length})` }}</span>
                        <span class="duty-pop-row" v-for="u in missing.list" :key="u.uid"><b>{{ u.name }}</b><small>{{ ROLE_LABEL[u.role] || u.role }}</small></span>
                      </span>
                    </span>
                    <span>{{ dutyGroups().length }} {{ dutyGroups().length === 1 ? 'place' : 'places' }}</span>
                  </div>
                  <!-- 24 Nov 2026 (Khairul): grouped by where they clocked in, columns split by lines -->
                  <div class="duty-group" v-for="g in dutyGroups()" :key="g.place">
                    <div class="tk-sub duty-place">{{ `${g.place} · ${g.list.length}` }}</div>
                    <div class="duty-grid">
                      <div class="duty-person" v-for="u in g.list" :key="u.uid">
                        <span class="duty-who"><b>{{ u.name }}</b><small>{{ ROLE_LABEL[u.role] || u.role || '—' }}</small></span>
                        <span class="duty-time"><span>{{ `In ${u.inAt}` }}</span><small :class="u.open ? 'on' : ''">{{ u.open ? 'On duty' : `Out ${u.outAt}` }}</small></span>
                      </div>
                    </div>
                  </div>
                  <div class="empty" v-show="!duty.length">Nobody has clocked in today yet.</div>
                </template>
                <div class="empty" v-else>{{ todayError.duty || 'Loading…' }}</div>
                <div class="note">Everyone who clocked in today on the Staff Attendance app counts as on duty.</div>
              </div>
            </section>
          <div class="dir-row-3">
            <section class="card">
              <div class="card-head"><h2>Team activity</h2><RouterLink to="/Settings/staff" class="link">Staff accounts ›</RouterLink></div>
              <div class="rows hold-5-team">
                <Capped :items="team" :size="5" :fixed="true" v-slot="{ capRows }">
                <template v-for="u in capRows" :key="u.id">
                  <div class="row"><span>{{ u.displayName || u.email }}</span><span class="r">{{ when(u.lastLoginAt) }}</span></div>
                </template>
                </Capped>
                <div class="empty" v-show="!team.length">No sign-ins recorded yet.</div>
              </div>
            </section>
            <section class="card">
              <div class="card-head"><h2>Open tickets</h2><RouterLink class="link" to="/Operations/issues">Open Issues ›</RouterLink></div>
              <div class="tk-body">
              <template v-if="issues">
                <div class="empty" v-show="!issues.total">No open tickets.</div>
                <template v-if="issues.total">
                  <div class="tk-summary">
                    <span><b>{{ issues.total }}</b> open</span>
                    <span><span class="tk-dot amber"></span>{{ issues.notStarted }} not started</span>
                    <span><span class="tk-dot blue"></span>{{ issues.total - issues.notStarted }} in progress</span>
                  </div>
                  <div class="tk-sub">Newest</div>
                  <div class="rows hold-4-tickets">
                    <template v-for="t in issues.recent" :key="t.id">
                      <RouterLink class="row tk-ticket" :to="`/Operations/issues?id=${t.id}`">
                        <span class="tk-main"><span class="tk-title">{{ t.title }}</span><span class="note">{{ [t.id, when(t.createdAt)].filter(Boolean).join(' · ') }}</span></span>
                        <span class="pill" :class="t.status === 'progress' ? 'blue' : 'amber'">{{ t.status === 'progress' ? 'In progress' : 'Open' }}</span>
                      </RouterLink>
                    </template>
                  </div>
                  <RouterLink class="link tk-all" to="/Operations/issues?filter=active" v-show="issues.total > issues.recent.length">{{ `See all ${issues.total} open tickets ›` }}</RouterLink>
                </template>
              </template>
              <div class="empty" v-else>{{ issuesError || 'Loading…' }}</div>
              </div>
            </section>
            <section class="card">
              <div class="card-head"><h2>Quick actions</h2></div>
              <div class="dq-grid col">
                <RouterLink class="dq-tile dq-main" to="/Finance/statement-approvals">
                  <span class="dq-ic"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg></span>
                  <span class="dq-txt"><b>Statement Approvals</b><small>{{ approvalsWaiting == null ? 'Check what Accounting has sent' : approvalsWaiting ? `${approvalsWaiting} waiting for you` : 'Nothing waiting' }}</small></span>
                  <span class="dq-go">&rsaquo;</span>
                </RouterLink>
                <RouterLink class="dq-tile" to="/Portfolio/properties?add=1">
                  <span class="dq-ic"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14" /></svg></span>
                  <span class="dq-txt"><b>Add property</b><small>Set up a new building and its units</small></span>
                  <span class="dq-go">&rsaquo;</span>
                </RouterLink>
                <RouterLink class="dq-tile" to="/Settings/staff?add=1">
                  <span class="dq-ic"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8v6M22 11h-6" /></svg></span>
                  <span class="dq-txt"><b>Invite staff</b><small>Create a login and give it a role</small></span>
                  <span class="dq-go">&rsaquo;</span>
                </RouterLink>
                <RouterLink class="dq-tile" to="/Settings/AuditLog">
                  <span class="dq-ic"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8" /></svg></span>
                  <span class="dq-txt"><b>Open Audit log</b><small>See who changed what, and when</small></span>
                  <span class="dq-go">&rsaquo;</span>
                </RouterLink>
              </div>
            </section>
          </div>
        </template>

      </div>
    </template>
  </main>
</template>

<script>
import { notBuilt } from '@/lib/toast.js';
import MonthPicker from '@/components/MonthPicker.vue';
import OptionPicker from '@/components/OptionPicker.vue';
import PropertyPicker from '@/components/PropertyPicker.vue';
import { loadProperties, loadMonth, loadTeamActivity, loadOpenIssues, loadApprovalsWaiting, loadUnitCounts, loadMoves, loadDutyStaff, loadMissingStaff } from '@/lib/dashboard-data.js';
import { rm, signed, monthName, shortMonth, ddmm, monthOffset, when, stamp } from '@/lib/format.js';
import { useSession } from '@/stores/session.js';
import { lastProperty, rememberProperty } from '@/lib/last-property.js';
import { ROLE_LABEL } from '@/lib/firebase.js';
import { noteQuotaError } from '@/lib/quota.js';

const me = useSession();

export default {
  popups: true,   // 16 Nov 2026: its messages show as corner popups (lib/page-popups.js)
  components: { PropertyPicker, MonthPicker, OptionPicker },
  data() {
    return {
      role: me.role,
      view: me.role === 'director' && this.$route.query.as === 'finance' ? 'finance' : me.role === 'branchDirector' ? 'director' : me.role, isBD: me.role === 'branchDirector',   // Director can "View as" Finance (or another role)
      month: monthOffset(-1),             // month-end work is for last month
      months: Array.from({ length: 12 }, (_, i) => monthOffset(-i)),
      propertyId: lastProperty(true) || 'all',
      properties: [],
      unitCounts: null, moves: null, duty: null, missing: null, todayError: {},   // Director 'today' tiles (24 Nov 2026)
      data: null, team: [], approvalsWaiting: null, issues: null, issuesError: '', loading: true, error: '',
      rm, signed, monthName, shortMonth, ddmm, when, stamp, ROLE_LABEL,
      soon: notBuilt
    };
  },
  // Remember the property for the next page (see lib/last-property.js)
  watch: { propertyId(v) { rememberProperty(v); } },
  async mounted() {
    try {
      this.properties = await loadProperties();
      if (me.role === 'finance' && this.properties.length === 1) this.propertyId = this.properties[0].id;
      if (this.propertyId !== 'all' && !this.properties.some(p => p.id === this.propertyId)) this.propertyId = 'all';
    } catch (e) { this.fail(e); }
    if (this.view === 'director') this.loadToday();   // not tied to the month, so read once
    await this.load();
  },
  computed: {
    propertyOptions() { return [{ value: 'all', label: 'All properties' }, ...this.properties.map(p => ({ value: p.id, label: p.name }))]; }
  },
  methods: {
    // ---- Today tiles (24 Nov 2026): each part loads on its own, so one refused read doesn't hide the others ----
    loadToday() {
      const why = (e, what) => { console.error(e); return e.code === 'permission-denied' ? `Firestore refused reading ${what} (rules not published?).` : noteQuotaError(e) ? 'The free daily limit is used up.' : `Could not load ${what} (${e.code || e.message}).`; };
      loadUnitCounts(this.properties).then(c => { this.unitCounts = c; }).catch(e => { this.todayError = { ...this.todayError, units: why(e, 'units') }; });
      loadMoves(this.properties).then(m => { this.moves = m; }).catch(e => { this.todayError = { ...this.todayError, moves: why(e, 'bookings') }; });
      loadDutyStaff().then(d => { this.duty = d; loadMissingStaff(d.map(x => x.uid)).then(m => { this.missing = m; }).catch(e => { console.error(e); this.missing = { error: true, list: [] }; }); }).catch(e => { this.todayError = { ...this.todayError, duty: why(e, 'attendance') }; });
    },
    // Duty staff grouped by where they clocked in: the main office first, then the most people (24 Nov 2026)
    dutyGroups() {
      const m = new Map();
      for (const u of this.duty || []) { const k = u.place || 'Place not recorded'; if (!m.has(k)) m.set(k, []); m.get(k).push(u); }
      return [...m].map(([place, list]) => ({ place, list })).sort((a, b) => (b.place === 'WIDEBED') - (a.place === 'WIDEBED') || b.list.length - a.list.length || a.place.localeCompare(b.place));
    },
    inProperty(m) { return this.propertyId === 'all' || m.propertyId === this.propertyId; },
    movesOf(dir) { return (this.moves || []).filter(m => m.dir === dir && this.inProperty(m)); },
    unitTotal() {
      if (!this.unitCounts) return null;
      const ids = this.propertyId === 'all' ? this.properties.map(p => p.id) : [this.propertyId];
      return ids.reduce((n, id) => n + (this.unitCounts[id] || 0), 0);
    },
    noFee(t) { const x = ' · no fee % set up'; return typeof t === 'string' && t.endsWith(x) ? t.slice(0, -x.length) : ''; },
    jump(name) { this.$refs[name]?.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
    // Director and Finance switch in place; another role's dashboard is a different page (?as=role).
    async load() {
      this.loading = true; this.error = '';
      try {
        this.data = await loadMonth({ properties: this.properties, propertyId: this.propertyId, month: this.month, me });
        if (this.view === 'director') {
          this.team = await loadTeamActivity();
          loadApprovalsWaiting().then(n => { this.approvalsWaiting = n; }).catch(() => {});
          // Tickets don't change with the property or month, so they are read once.
          if (!this.issues) this.issues = await loadOpenIssues().catch(e => { console.error(e); this.issuesError = noteQuotaError(e) ? 'The free daily limit is used up, so tickets can\'t load until it resets.' : `Could not load the tickets (${e.code || e.message}).`; return null; });
        }
      } catch (e) { this.fail(e); }
      this.loading = false;
    },
    fail(e) {
      console.error(e);
      this.error = e.code === 'permission-denied'
        ? 'Firestore refused the read. Check the security rules are deployed and your role is set.'
        : e.code === 'failed-precondition'
          ? 'Firestore needs an index for this view. Open the browser console (F12) and click the link it gives.'
          : 'Could not load the dashboard: ' + (e.message || e);
    },
    subtitle() {
      const p = this.propertyId === 'all' ? 'All properties' : (this.properties.find(x => x.id === this.propertyId)?.name || '');
      return `${monthName(this.month)} · ${p} · ${this.view === 'director' ? 'the whole business at a glance' : 'month-end and owner payouts'}`;
    },
    directorItems() { return this.data ? this.data.setupItems : []; },
    attentionCount() { return this.view === 'director' ? this.directorItems().length : (this.data ? this.data.attentionCount : 0); }
  }
};
</script>
