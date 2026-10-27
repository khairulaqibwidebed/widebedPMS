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
        <select class="select" v-model="propertyId" @change="load()" aria-label="Property">
          <option value="all">All properties</option>
          <template v-for="p in properties" :key="p.id"><option :value="p.id" :selected="p.id === propertyId">{{ p.name }}</option></template>
        </select>
        <select class="select" v-model="month" @change="load()" aria-label="Month">
          <template v-for="m in months" :key="m"><option :value="m" :selected="m === month">{{ monthName(m) }}</option></template>
        </select>
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
          <div class="grid-2">
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
                <div class="card-head"><h2>Statements by status</h2><RouterLink :to="`/Finance/month-end?property=${propertyId === 'all' ? '' : propertyId}&month=${month}`" class="link">View all ›</RouterLink></div>
                <div class="rows">
                  <div class="row"><span>Fixed rent</span><span class="pill blue">{{ data.byStatus.fixedRent }}</span></div>
                  <div class="row"><span>Draft</span><span class="pill grey">{{ data.byStatus.draft }}</span></div>
                  <div class="row"><span>Negative</span><span class="pill red">{{ data.byStatus.negative }}</span></div>
                  <div class="row"><span>Estimated</span><span class="pill amber">{{ data.byStatus.estimated }}</span></div>
                  <div class="row"><span>Completed</span><span class="pill green">{{ data.byStatus.completed }}</span></div>
                </div>
              </section>
              <section class="card">
                <div class="card-head"><h2>Quick actions</h2></div>
                <div class="actions">
                  <RouterLink class="btn btn-primary" to="/Finance/upload">Upload eZee report</RouterLink>
                  <RouterLink class="btn" :to="`/Finance/expenses?month=${month}&add=1`">Add expense</RouterLink>
                  <RouterLink class="btn" :to="`/Finance/month-end?month=${month}`">Open Month-end payout</RouterLink>
                  <RouterLink class="btn" to="/Finance/upload#daily">Download daily export</RouterLink>
                </div>
              </section>
            </div>
            <div class="stack">
              <section class="card" ref="attn">
                <div class="card-head"><h2>Needs attention</h2></div>
                <div class="rows">
                  <Capped :items="data.attention" v-slot="{ capRows }">
                  <template v-for="(a, i) in capRows" :key="i">
                    <div class="row"><span>{{ a.text }}</span><span class="r">{{ a.tag }}</span></div>
                  </template>
                  </Capped>
                  <div class="empty" v-show="!data.attentionCount">Nothing needs attention for this month.</div>
                </div>
              </section>
              <section class="card">
                <div class="card-head"><h2>Expenses added this month</h2><RouterLink :to="`/Finance/expenses?property=${propertyId === 'all' ? '' : propertyId}&month=${month}`" class="link">Expenses ›</RouterLink></div>
                <div class="rows">
                  <Capped :items="data.recentExpenses" v-slot="{ capRows }">
                  <template v-for="e in capRows" :key="e.id">
                    <div class="row">
                      <span>{{ `${ddmm(e.date)} · ${e.unitCode} · ${e.description || e.type}` }}</span>
                      <span class="r" :class="e.signedAmount < 0 ? '' : 'pos'">{{ signed(e.signedAmount) }}</span>
                    </div>
                  </template>
                  </Capped>
                  <div class="empty" v-show="!data.recentExpenses.length">No expenses added for this month yet.</div>
                </div>
              </section>
            </div>
          </div>
        </template>

        <!-- DIRECTOR -->
        <template v-if="view === 'director'">
          <div class="grid-2">
            <div class="stack">
              <section class="card" ref="attn">
                <div class="card-head"><h2>Waiting on Director</h2></div>
                <div class="rows">
                  <Capped :items="directorItems()" v-slot="{ capRows }">
                  <template v-for="(a, i) in capRows" :key="i">
                    <div class="row"><span>{{ a.text }}</span><RouterLink class="btn" to="/Portfolio/properties">Set up</RouterLink></div>
                  </template>
                  </Capped>
                  <div class="empty" v-show="!directorItems().length">Nothing is waiting on you.</div>
                </div>
              </section>
              <section class="card">
                <div class="card-head"><h2>Month-end at a glance</h2><RouterLink :to="`/Finance/month-end?property=${propertyId === 'all' ? '' : propertyId}&month=${month}`" class="link">Month-end payout ›</RouterLink></div>
                <div class="steps">
                  <template v-for="s in data.steps" :key="s.n">
                    <div class="step" :class="{ done: s.done, current: s.current }">
                      <span class="dot">{{ s.done ? '✓' : s.n }}</span><span>{{ s.label }}</span>
                    </div>
                  </template>
                </div>
                <div class="note">Read-only here. Finance completes the month.</div>
              </section>
              <section class="card">
                <div class="card-head"><h2>Quick actions</h2></div>
                <div class="actions">
                  <RouterLink class="btn btn-primary" to="/Portfolio/properties?add=1">Add property</RouterLink>
                  <RouterLink class="btn" to="/Settings/staff?add=1">Invite staff</RouterLink>
                  <RouterLink class="btn" to="/Settings/AuditLog">Open Audit log</RouterLink>
                </div>
              </section>
            </div>
            <div class="stack">
              <section class="card">
                <div class="card-head"><h2>Open tickets by role</h2><RouterLink class="link" to="/Operations/issues">Open Issues ›</RouterLink></div>
                <div class="rows" v-if="issues">
                  <template v-for="r in issues.byTag" :key="r.tag">
                    <div class="row"><span>{{ r.tag }}</span><span class="pill amber">{{ r.count }}</span></div>
                  </template>
                  <Capped :items="issues.recent" v-slot="{ capRows }">
                  <template v-for="t in capRows" :key="t.id">
                    <div class="row"><RouterLink class="link" :to="`/Operations/issues?id=${t.id}`">{{ `${t.id} · ${t.title}` }}</RouterLink><span class="r">{{ t.status === 'progress' ? 'In progress' : 'Open' }}</span></div>
                  </template>
                  </Capped>
                  <div class="empty" v-show="!issues.total">No open tickets.</div>
                  <div class="note" v-show="issues.total > issues.recent.length">{{ `Newest ${issues.recent.length} of ${issues.total} open tickets. A ticket tagged to two roles counts once for each.` }}</div>
                </div>
                <div class="empty" v-else>{{ issuesError || 'Loading…' }}</div>
              </section>
              <section class="card">
                <div class="card-head"><h2>Team activity</h2><RouterLink to="/Settings/staff" class="link">Staff accounts ›</RouterLink></div>
                <div class="rows">
                  <Capped :items="team" v-slot="{ capRows }">
                  <template v-for="u in capRows" :key="u.id">
                    <div class="row"><span>{{ u.displayName || u.email }}</span><span class="r">{{ when(u.lastLoginAt) }}</span></div>
                  </template>
                  </Capped>
                  <div class="empty" v-show="!team.length">No sign-ins recorded yet.</div>
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
import { loadProperties, loadMonth, loadTeamActivity, loadOpenIssues } from '@/lib/dashboard-data.js';
import { rm, signed, monthName, shortMonth, ddmm, monthOffset, when, stamp } from '@/lib/format.js';
import { useSession } from '@/stores/session.js';
import { lastProperty, rememberProperty } from '@/lib/last-property.js';
import { ROLE_LABEL } from '@/lib/firebase.js';

const me = useSession();

export default {
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
