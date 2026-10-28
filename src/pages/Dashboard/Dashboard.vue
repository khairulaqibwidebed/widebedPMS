<template>
  <main class="content">
    <div class="loading-bar" v-show="loading"></div>

    <div class="page-head dash-head">
      <div>
        <h1>{{ view === 'director' ? 'Director dashboard' : 'Finance dashboard' }}</h1>
        <div class="sub">{{ subtitle() }}</div>
      </div>
      <div class="head-tools">
        <div class="head-row">
        <OptionPicker v-model="propertyId" :options="propertyOptions" label="Property" @change="load()" />
        <MonthPicker v-model="month" @change="load()" />
        </div>
      </div>
    </div>

    <div class="notice error" v-show="error">{{ error }}</div>

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

        <!-- DIRECTOR -->
        <template v-if="view === 'director'">
          <div class="grid-2 fill">
            <div class="stack">
              <section class="card" ref="attn">
                <div class="card-head"><h2>Waiting on Director</h2></div>
                <div class="rows hold-5-wait">
                  <Capped :items="directorItems()" :size="5" :fixed="true" v-slot="{ capRows }">
                  <template v-for="(a, i) in capRows" :key="i">
                    <div class="row"><span>{{ a.text }}</span><RouterLink class="btn" to="/Portfolio/properties">Set up</RouterLink></div>
                  </template>
                  </Capped>
                  <div class="empty" v-show="!directorItems().length">Nothing is waiting on you.</div>
                </div>
              </section>
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
            </div>
            <div class="stack">
              <section class="card">
                <div class="card-head"><h2>Open tickets</h2><RouterLink class="link" to="/Operations/issues">Open Issues ›</RouterLink></div>
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
              </section>
              <section class="card">
                <div class="card-head"><h2>Quick actions</h2></div>
                <div class="dq-grid col">
                  <RouterLink class="dq-tile dq-main" to="/Portfolio/properties?add=1">
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
import { loadProperties, loadMonth, loadTeamActivity, loadOpenIssues } from '@/lib/dashboard-data.js';
import { rm, signed, monthName, shortMonth, ddmm, monthOffset, when, stamp } from '@/lib/format.js';
import { useSession } from '@/stores/session.js';
import { lastProperty, rememberProperty } from '@/lib/last-property.js';
import { ROLE_LABEL } from '@/lib/firebase.js';

const me = useSession();

export default {
  components: { MonthPicker, OptionPicker },
  data() {
    return {
      role: me.role,
      view: me.role === 'director' && this.$route.query.as === 'finance' ? 'finance' : me.role,   // Director can "View as" Finance (or another role)
      month: monthOffset(-1),             // month-end work is for last month
      months: Array.from({ length: 12 }, (_, i) => monthOffset(-i)),
      propertyId: lastProperty(true) || 'all',
      properties: [],
      data: null, team: [], issues: null, issuesError: '', loading: true, error: '',
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
    await this.load();
  },
  computed: {
    propertyOptions() { return [{ value: 'all', label: 'All properties' }, ...this.properties.map(p => ({ value: p.id, label: p.name }))]; }
  },
  methods: {
    jump(name) { this.$refs[name]?.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
    // Director and Finance switch in place; another role's dashboard is a different page (?as=role).
    async load() {
      this.loading = true; this.error = '';
      try {
        this.data = await loadMonth({ properties: this.properties, propertyId: this.propertyId, month: this.month, me });
        if (this.view === 'director') {
          this.team = await loadTeamActivity();
          // Tickets don't change with the property or month, so they are read once.
          if (!this.issues) this.issues = await loadOpenIssues().catch(e => { console.error(e); this.issuesError = 'Could not load the tickets.'; return null; });
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
