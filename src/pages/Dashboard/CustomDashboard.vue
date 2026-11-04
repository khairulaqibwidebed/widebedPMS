<template>
  <main class="content">
    <div class="page-head dash-head">
      <div>
        <h1>{{ `${roleName} dashboard` }}</h1>
        <div class="sub">{{ greeting }}</div>
      </div>
    </div>
    <div class="notice error" v-show="error">{{ error }}</div>

    <!-- Top numbers: the main count of each card this role has -->
    <div class="kpis cd-kpis">
      <RouterLink class="card kpi kpi-link" to="/Operations/issues"><div class="label">Waiting on you</div>
        <div class="value" :class="{ alert: issues && issues.waiting.length }">{{ issues ? issues.waiting.length : '…' }}</div><div class="hint">Tickets where the last word wasn't yours</div></RouterLink>
      <RouterLink class="card kpi kpi-link" to="/Operations/issues"><div class="label">Open tickets</div>
        <div class="value">{{ issues ? issues.open : '…' }}</div><div class="hint">{{ issues ? `${issues.progress} in progress` : '' }}</div></RouterLink>
      <RouterLink class="card kpi kpi-link" v-if="showPayments" to="/Finance/offline-payments"><div class="label">Unknown payments</div>
        <div class="value" :class="{ alert: payments && payments.count }">{{ payments ? payments.count : '…' }}</div><div class="hint">Need who paid and for what</div></RouterLink>
      <RouterLink class="card kpi kpi-link" to="/Agreements/renewals"><div class="label">Renewals due</div>
        <div class="value">{{ renewals ? renewals.count : '…' }}</div><div class="hint">{{ renewals ? `Next 30 days · ${renewals.mine.length} yours` : '' }}</div></RouterLink>
    </div>

    <!-- Needs you now: everything where the next step is this person's -->
    <section class="card cd-now">
      <div class="card-head"><h2>Needs you now</h2><span class="help" v-if="!loading">{{ now.length ? `${now.length} to do` : '' }}</span></div>
      <div class="loading-bar" v-show="loading"></div>
      <p class="cd-empty" v-if="!loading && !now.length">Nothing needs you right now.</p>
      <ul class="cd-list" v-else>
        <li v-for="x in now.slice(0, 8)" :key="x.key">
          <RouterLink :to="x.to" class="cd-item">
            <span class="pill" :class="x.pill">{{ x.kind }}</span>
            <span class="cd-main"><b>{{ x.title }}</b><small>{{ x.sub }}</small></span>
            <span class="cd-go">&rsaquo;</span>
          </RouterLink>
        </li>
      </ul>
    </section>

    <!-- One card per ticked page. Cards with something in them come first; empty ones shrink to one line. -->
    <template v-for="c in cards" :key="c.key">
      <section class="card cd-card" :class="{ quiet: !c.count }">
        <div class="card-head"><h2>{{ c.title }}</h2><RouterLink class="navlink" :to="c.to">{{ c.link }} &rarr;</RouterLink></div>
        <p class="cd-empty" v-if="!c.count">{{ c.empty }}</p>
        <ul class="cd-list" v-else>
          <li v-for="x in c.items" :key="x.key">
            <RouterLink :to="x.to" class="cd-item">
              <span class="pill" :class="x.pill" v-if="x.kind">{{ x.kind }}</span>
              <span class="cd-main"><b>{{ x.title }}</b><small>{{ x.sub }}</small></span>
              <span class="cd-go">&rsaquo;</span>
            </RouterLink>
          </li>
        </ul>
      </section>
    </template>

    <!-- Every page this person can open (as before), smaller -->
    <section class="card cd-links">
      <div class="card-head"><h2>All your pages</h2></div>
      <div class="cd-groups">
        <div v-for="g in groups" :key="g.label" class="cd-group">
          <div class="cd-glabel">{{ g.label }}</div>
          <RouterLink v-for="it in g.items" :key="it.to" class="cd-link" :to="it.to">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" v-html="icon(it)"></svg>{{ it.label }}
          </RouterLink>
        </div>
      </div>
    </section>
  </main>
</template>

<script>
// /Dashboard for roles made on the Roles page (4 Nov 2026, option A): cards picked automatically from the role's ticks.
// Every role: Needs you now + Issues + Renewals (everyone can open those). Offline Payments only with its tick.
// Busy cards first, empty ones shrink to a line; all the role's pages are listed at the bottom.
// Built-in roles keep their own dashboards (RoleDashboard.vue).
import { useSession } from '@/stores/session.js';
import { navFor } from '@/nav.js';
import { NAV_ICONS } from '@/components/NavIcons.js';
import { ROLE_LABEL, issueTagOf } from '@/lib/firebase.js';
import { can } from '@/lib/access.js';
import { dmy } from '@/lib/format.js';
import { daysLeft, daysText } from '@/lib/agreements/renewals.js';
import { loadIssueCard, loadUnknownPayments, loadRenewalsDue } from '@/lib/role-dashboard-data.js';

const STATUS = { open: ['Open', 'amber'], progress: ['In progress', 'blue'] };

export default {
  data() {
    const me = useSession();
    // Dashboard and My Account are left out: they are one click away in the sidebar.
    const groups = navFor(me).filter(g => g.label !== 'My Account')
      .map(g => ({ label: g.label || 'Pages', items: g.items.filter(it => it.to && it.to !== '/Dashboard') })).filter(g => g.items.length);
    return { me, groups, roleName: ROLE_LABEL[me.role] || me.role, loading: true, error: '', issues: null, payments: null, renewals: null };
  },
  computed: {
    greeting() { const h = new Date().getHours(); return `${h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'}${this.me.name ? ', ' + this.me.name.split(' ')[0] : ''}. Here's what's waiting for you.`; },
    showPayments() { return can(this.me, 'offlinePayments.view') || can(this.me, 'offlinePayments.edit'); },
    ticketItem() {
      return t => ({ key: 't' + t.id, to: `/Operations/issues?id=${t.id}`, kind: (STATUS[t.status] || STATUS.open)[0], pill: (STATUS[t.status] || STATUS.open)[1],
        title: `${t.id} · ${t.title || ''}`, sub: [t.unit, t.raisedBy ? 'raised by ' + t.raisedBy : ''].filter(Boolean).join(' · ') });
    },
    renewalItem() {
      return r => { const d = daysLeft(r.endDate);
        return { key: 'r' + r.id, to: `/Agreements/record/${r.id}`, kind: d <= 7 ? 'Ending soon' : 'Renewal', pill: d <= 7 ? 'red' : 'amber',
          title: r.title || 'Agreement', sub: `Ends ${dmy(r.endDate)} (${daysText(d)})${r.mine ? ' · you are in charge' : ''}` }; };
    },
    paymentItem() {
      return p => ({ key: 'p' + p.id, to: '/Finance/offline-payments', kind: 'Unknown', pill: 'red',
        title: `RM ${Number(p.amount || 0).toFixed(2)}${p.date ? ' · ' + dmy(p.date) : ''}`, sub: p.unitCode || p.guest || 'Fill in who paid and for what' });
    },
    // The next step is mine: tickets waiting on me, renewals I'm in charge of, Unknown payments if I can fill them in
    now() {
      const out = [];
      for (const t of this.issues?.waiting || []) out.push({ ...this.ticketItem(t), kind: 'Reply', pill: 'amber', sort: 0 });
      for (const r of this.renewals?.mine || []) out.push({ ...this.renewalItem(r), sort: 1 });
      if (can(this.me, 'offlinePayments.edit')) for (const p of this.payments?.latest || []) out.push({ ...this.paymentItem(p), sort: 2 });
      return out.sort((a, b) => a.sort - b.sort);
    },
    cards() {
      const list = [];
      if (this.issues) list.push({ key: 'issues', title: 'Your tickets', to: '/Operations/issues', link: 'Open Issues',
        count: this.issues.open + this.issues.progress, items: this.issues.latest.map(this.ticketItem),
        empty: `No open tickets tagged ${this.roleName} or raised by you.` });
      if (this.showPayments && this.payments) list.push({ key: 'pay', title: 'Unknown offline payments', to: '/Finance/offline-payments', link: 'Offline Payments',
        count: this.payments.count, items: this.payments.latest.map(this.paymentItem), empty: 'No Unknown payments.' });
      if (this.renewals) list.push({ key: 'ren', title: 'Renewals due in 30 days', to: '/Agreements/renewals', link: 'Renewals',
        count: this.renewals.count, items: this.renewals.latest.map(this.renewalItem), empty: 'No agreements end in the next 30 days.' });
      return list.sort((a, b) => (b.count > 0) - (a.count > 0));   // busy cards first
    }
  },
  async mounted() {
    const me = this.me, myLabel = me.name || `${issueTagOf(me.role)} user`;
    const jobs = [
      loadIssueCard(me.role, me.user.uid, myLabel).then(r => { this.issues = r; }),
      loadRenewalsDue(me.user.uid).then(r => { this.renewals = r; }),
      this.showPayments ? loadUnknownPayments().then(r => { this.payments = r; }) : null
    ].filter(Boolean);
    const res = await Promise.allSettled(jobs);
    const bad = res.filter(r => r.status === 'rejected');
    if (bad.length) { console.warn('Dashboard card not loaded:', bad.map(b => b.reason?.code || b.reason?.message)); this.error = 'Some cards could not load. Reload the page, or check the security rules are up to date.'; }
    this.loading = false;
  },
  methods: { icon(it) { return NAV_ICONS[it.icon] || NAV_ICONS.dot; } }
};
</script>

<style scoped>
.cd-kpis { grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); }
.cd-now, .cd-card, .cd-links { margin-bottom: 16px; }
.cd-empty { margin: 0; color: var(--muted); font-size: 13px; }
.cd-list { list-style: none; margin: 0; padding: 0; }
.cd-list li + li { border-top: 1px solid var(--line); }
.cd-item { display: flex; align-items: center; gap: 12px; padding: 10px 6px; color: inherit; text-decoration: none; border-radius: 8px; }
.cd-item:hover { background: var(--accent-soft); }
.cd-item .pill { flex: none; }
.cd-main { flex: 1 1 auto; min-width: 0; display: grid; gap: 2px; }
.cd-main b { font-size: 14px; font-weight: 600; overflow-wrap: anywhere; }
.cd-main small { font-size: 12px; color: var(--muted); overflow-wrap: anywhere; }
.cd-go { color: var(--muted); font-size: 18px; }
/* Empty card: one line, no big padding */
.cd-card.quiet { padding-top: 12px; padding-bottom: 12px; }
.cd-card.quiet .card-head { margin-bottom: 4px; }
.cd-card.quiet .card-head h2 { font-size: 14px; color: var(--text-2); }
.cd-groups { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 14px 24px; }
.cd-glabel { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); margin-bottom: 6px; }
.cd-link { display: flex; align-items: center; gap: 8px; padding: 6px 4px; color: var(--text); text-decoration: none; font-size: 13px; border-radius: 6px; }
.cd-link:hover { background: var(--accent-soft); color: var(--accent); }
.cd-link svg { color: var(--muted); flex: none; }
</style>
