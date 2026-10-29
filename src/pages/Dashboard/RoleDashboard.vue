<template>
  <main class="content">
    <div class="loading-bar" v-show="loading"></div>

    <div class="page-head dash-head">
      <div>
        <h1>{{ `${ROLE_LABEL[view]} dashboard` }}</h1>
        <div class="sub">{{ SUBTITLE[view] }}</div>
      </div>
      <div class="head-tools">
        <div class="head-row" v-if="isDirector">
        <select class="select" v-model="pick" @change="viewAs()" aria-label="View as">
          <template v-for="r in VIEW_AS" :key="r"><option :value="r" :selected="r === pick">{{ `View as: ${ROLE_LABEL[r]}` }}</option></template>
        </select>
        </div>
      </div>
    </div>

    <div class="notice error" v-show="error">{{ error }}</div>

    <template v-if="ready">
      <!-- KPI cards: each opens the page that shows it, or (when this role has no such page) the panel below -->
      <section class="kpis">
        <template v-for="k in kpis()" :key="k.label">
          <RouterLink v-if="k.to" class="card kpi kpi-link" :to="k.to">
            <div class="label">{{ k.label }}<span class="sample-tag" v-if="k.sample">Sample</span></div>
            <div class="value" :class="k.alert ? 'alert' : ''">{{ k.value }}</div>
            <div class="hint">{{ k.hint }}</div>
          </RouterLink>
          <button v-else type="button" class="card kpi kpi-link" @click="jump(k.panel)">
            <div class="label">{{ k.label }}</div>
            <div class="value" :class="k.alert ? 'alert' : ''">{{ k.value }}</div>
            <div class="hint">{{ k.hint }}</div>
          </button>
        </template>
      </section>

      <!-- OPERATIONS -->
      <div class="grid-2 fill" v-if="view === 'operations'">
        <div class="stack">
          <section class="card" ref="today">
            <div class="card-head"><h2>Today's arrivals and departures</h2><RouterLink class="link" to="/Portfolio/bookings">Offline bookings ›</RouterLink></div>
            <div class="rows hold">
              <Capped :items="d.moves" :size="4" :fixed="true" v-slot="{ capRows }">
              <template v-for="m in capRows" :key="m.key">
                <div class="row">
                  <RouterLink class="cell link" :to="m.ezee ? propertyPage(m.propertyId) : bookingsPage(m.propertyId)">{{ m.unit }}</RouterLink>
                  <span class="r"><span class="pill" :class="m.dir === 'in' ? 'green' : 'blue'">{{ m.dir === 'in' ? 'In' : 'Out' }}</span>{{ ' ' + m.source }}</span>
                </div>
              </template>
              </Capped>
              <div class="empty" v-show="!d.moves.length">No check-ins or check-outs today.</div>
              <div class="note">{{ `${dmy(d.today)}. eZee bookings as of the last upload, plus offline bookings. eZee rows open the property's units; offline rows open Bookings.` }}</div>
            </div>
          </section>
          <section class="card" ref="leases">
            <div class="card-head"><h2>Leases ending soon</h2><RouterLink class="link" to="/Portfolio/bookings">Bookings ›</RouterLink></div>
            <div class="rows hold">
              <Capped :items="d.leases" :size="4" :fixed="true" v-slot="{ capRows }">
              <template v-for="l in capRows" :key="l.id">
                <div class="row"><RouterLink class="cell link" :to="bookingsPage(l.propertyId)">{{ `${l.unit} · ${l.id.replace('offline_', '')}` }}</RouterLink><span class="r">{{ `Ends ${dmy(l.departure)} · ${daysTo(l.departure)}` }}</span></div>
              </template>
              </Capped>
              <div class="empty" v-show="!d.leases.length">No long-term lease ends in the next 30 days.</div>
            </div>
          </section>
        </div>
        <div class="stack">
          <section class="card">
            <div class="card-head"><h2>Quick actions</h2></div>
            <div class="qa-grid col">
              <RouterLink v-for="(a, i) in quickFor(view)" :key="a.label" class="qa-tile" :class="{ 'qa-main': i === 0 }" :to="a.to">
                <span class="qa-ic"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path :d="a.icon" /></svg></span>
                <span class="qa-txt"><b>{{ a.label }}</b><small>{{ a.desc }}</small></span>
                <span class="qa-go">&rsaquo;</span>
              </RouterLink>
            </div>
          </section>
          <section class="card" ref="inquiries">
            <div class="card-head"><h2>My offline inquiries</h2><RouterLink class="link" to="/Operations/offline-inquiries">Offline inquiries ›</RouterLink></div>
            <div class="rows">
              <template v-for="s in inquiryStatuses()" :key="s.key">
                <div class="row"><RouterLink class="cell link" to="/Operations/offline-inquiries">{{ s.label }}</RouterLink><span class="pill" :class="s.cls">{{ s.count }}</span></div>
              </template>
              <div class="empty" v-show="!d.inquiries.length">No offline inquiries are assigned to you.</div>
            </div>
          </section>
        </div>
      </div>

      <!-- IT -->
      <div class="grid-2 fill" v-if="view === 'it'">
        <div class="stack">
          <section class="card" ref="tickets">
            <div class="card-head"><h2>IT tickets</h2><RouterLink class="link" to="/Operations/issues">Open Issues ›</RouterLink></div>
            <div class="rows hold">
              <Capped :items="d.tickets" :size="4" :fixed="true" v-slot="{ capRows }">
              <template v-for="t in capRows" :key="t.id">
                <div class="row"><RouterLink class="cell link" :to="`/Operations/issues?id=${t.id}`">{{ `${t.id} · ${t.title}` }}</RouterLink><span class="r">{{ `${statusOf(t)} · ${when(t.createdAt)}` }}</span></div>
              </template>
              </Capped>
              <div class="empty" v-show="!d.tickets.length">No open tickets tagged IT.</div>
            </div>
          </section>
          <section class="card" ref="staff">
            <div class="card-head"><h2>Staff accounts</h2></div>
            <!-- One list at a time (pills), 7 a page -->
            <div class="pills brand staff-tabs">
              <template v-for="t in STAFF_TABS" :key="t.key">
                <button class="pill-btn" type="button" :class="staffTab === t.key && 'on'" @click="staffTab = t.key">{{ t.label + ' · ' + d[t.key].length }}</button>
              </template>
            </div>
            <div class="rows">
              <Paged :items="d[staffTab]" :size="7" :key="staffTab" v-slot="{ pageRows }">
              <template v-for="u in pageRows" :key="u.id"><div class="row"><span class="cell">{{ who(u) }}</span><span class="r">{{ staffWhen(u) }}</span></div></template>
              </Paged>
              <div class="empty" v-show="!d[staffTab].length">{{ STAFF_TABS.find(t => t.key === staffTab).empty }}</div>
            </div>
            <div class="note">Directors and HR manage accounts on Staff accounts.</div>
          </section>
        </div>
        <div class="stack">
          <section class="card" ref="uploads">
            <div class="card-head"><h2>Upload history</h2></div>
            <div class="rows hold hold3">
              <Capped :items="d.uploads" :size="3" :fixed="true" v-slot="{ capRows }">
              <template v-for="u in capRows" :key="u.id">
                <div class="row">
                  <span class="cell">{{ `${stamp(u.uploadedAt)} · ${u.uploadedByName || 'Unknown'}` }}</span>
                  <span class="r">{{ uploadRows(u) + ' ' }}<span class="pill" :class="u.result === 'ok' ? 'green' : 'red'">{{ u.result === 'ok' ? 'Completed' : 'Refused' }}</span></span>
                </div>
              </template>
              </Capped>
              <div class="empty" v-show="!d.uploads.length">No eZee report uploaded yet.</div>
              <div class="note" v-show="d.uploads.length">Last 5 uploads. Finance uploads on Upload eZee report.</div>
            </div>
          </section>
          <section class="card" ref="changes">
            <div class="card-head"><h2>Recent changes by IT</h2></div>
            <div class="rows hold">
              <Capped :items="d.audits" :size="4" :fixed="true" v-slot="{ capRows }">
              <template v-for="a in capRows" :key="a.id">
                <div class="row">
                  <RouterLink v-if="ticketOf(a)" class="cell link" :to="`/Operations/issues?id=${ticketOf(a)}`">{{ change(a) }}</RouterLink>
                  <span v-else class="cell">{{ change(a) }}</span>
                  <span class="r">{{ when(a.at) }}</span>
                </div>
              </template>
              </Capped>
              <div class="empty" v-show="!d.audits.length">No changes by IT recorded yet.</div>
            </div>
          </section>
          <section class="card">
            <div class="card-head"><h2>Quick actions</h2></div>
            <div class="qa-grid col">
              <RouterLink v-for="(a, i) in quickFor(view)" :key="a.label" class="qa-tile" :class="{ 'qa-main': i === 0 }" :to="a.to">
                <span class="qa-ic"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path :d="a.icon" /></svg></span>
                <span class="qa-txt"><b>{{ a.label }}</b><small>{{ a.desc }}</small></span>
                <span class="qa-go">&rsaquo;</span>
              </RouterLink>
            </div>
          </section>
        </div>
      </div>

      <!-- HR -->
      <div class="grid-2 fill" v-if="view === 'hr'">
        <div class="stack">
          <section class="card" ref="complaints">
            <div class="card-head"><h2>Staff complaints</h2><RouterLink class="link" to="/HR/staff-complaints">View all ›</RouterLink></div>
            <div class="rows">
              <Capped :items="d.staffComplaints" v-slot="{ capRows }">
              <template v-for="c in capRows" :key="c.id">
                <div class="row">
                  <RouterLink class="cell link" to="/HR/staff-complaints">{{ `${c.ref} · ${c.subject || '(no subject)'}` }}</RouterLink>
                  <span class="r">{{ c.date + ' ' }}<span class="pill" :class="(COMPLAINT[c.status] || COMPLAINT.new)[1]">{{ (COMPLAINT[c.status] || COMPLAINT.new)[0] }}</span></span>
                </div>
              </template>
              </Capped>
              <div class="empty" v-show="!d.staffComplaints.length">No staff complaints yet.</div>
            </div>
          </section>
          <section class="card" ref="dir">
            <div class="card-head"><h2>Complaints sent to Directors</h2><RouterLink class="link" to="/HR/director-complaints">Director complaints ›</RouterLink></div>
            <div class="rows">
              <Capped :items="d.dirComplaints" v-slot="{ capRows }">
              <template v-for="c in capRows" :key="c.id">
                <div class="row">
                  <RouterLink class="cell link" to="/HR/director-complaints">{{ `${c.ref} · ${c.subject || '(no subject)'}` }}</RouterLink>
                  <span class="r">{{ c.date + ' ' }}<span class="pill" :class="c.read ? 'green' : 'amber'">{{ c.read ? 'Read' : 'Unread' }}</span></span>
                </div>
              </template>
              </Capped>
              <div class="empty" v-show="!d.dirComplaints.length">No complaints sent to the Directors yet.</div>
            </div>
          </section>
        </div>
        <div class="stack">
          <section class="card" ref="sops">
            <div class="card-head"><h2>Recent SOP edits</h2><RouterLink class="link" to="/HR/attendance-sop">SOPs ›</RouterLink></div>
            <div class="rows">
              <Capped :items="d.sopEdits" v-slot="{ capRows }">
              <template v-for="s in capRows" :key="s.key">
                <div class="row"><RouterLink class="cell link" :to="s.to">{{ s.label }}</RouterLink><span class="r">{{ `${s.by || 'Unknown'} · ${day(s.at)}` }}</span></div>
              </template>
              </Capped>
              <div class="empty" v-show="!d.sopEdits.length">No SOP has been edited yet. The starter text is showing.</div>
            </div>
          </section>
          <section class="card" ref="onboarding">
            <div class="card-head"><h2>Onboarding in progress</h2><RouterLink class="link" to="/Playbook/onboarding">Onboarding ›</RouterLink></div>
            <div class="rows">
              <Capped :items="d.onboarding" v-slot="{ capRows }">
              <template v-for="n in capRows" :key="n.uid">
                <div class="row"><RouterLink class="cell link" to="/Playbook/onboarding">{{ n.role ? `${n.name} · ${n.role}` : n.name }}</RouterLink><span class="r">{{ `${n.done} of ${d.total}` }}</span></div>
              </template>
              </Capped>
              <div class="empty" v-show="!d.onboarding.length">No one is part-way through onboarding.</div>
            </div>
          </section>
        <section class="card">
          <div class="card-head"><h2>Quick actions</h2></div>
          <div class="qa-grid col">
            <RouterLink v-for="(a, i) in quickFor(view)" :key="a.label" class="qa-tile" :class="{ 'qa-main': i === 0 }" :to="a.to">
              <span class="qa-ic"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path :d="a.icon" /></svg></span>
              <span class="qa-txt"><b>{{ a.label }}</b><small>{{ a.desc }}</small></span>
              <span class="qa-go">&rsaquo;</span>
            </RouterLink>
          </div>
        </section>
        </div>
      </div>

      <!-- PROCUREMENT and MARKETING -->
      <div class="grid-2 fill" v-if="view === 'procurement' || view === 'marketing'">
        <div class="stack">
          <section class="card" ref="tickets">
            <div class="card-head"><h2>My tickets</h2><RouterLink class="link" to="/Operations/issues">Open Issues ›</RouterLink></div>
            <div class="rows">
              <Capped :items="newestTickets()" v-slot="{ capRows }">
              <template v-for="t in capRows" :key="t.id">
                <div class="row"><RouterLink class="cell link" :to="`/Operations/issues?id=${t.id}`">{{ `${t.id} · ${t.title}` }}</RouterLink><span class="r">{{ statusOf(t) }}</span></div>
              </template>
              </Capped>
              <div class="empty" v-show="!tickets.length">{{ `No open tickets tagged ${ROLE_LABEL[view]} or raised by you.` }}</div>
            </div>
          </section>
          <section class="card">
            <div class="card-head"><h2>Quick actions</h2></div>
            <div class="qa-grid col">
              <RouterLink v-for="(a, i) in quickFor(view)" :key="a.label" class="qa-tile" :class="{ 'qa-main': i === 0 }" :to="a.to">
                <span class="qa-ic"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path :d="a.icon" /></svg></span>
                <span class="qa-txt"><b>{{ a.label }}</b><small>{{ a.desc }}</small></span>
                <span class="qa-go">&rsaquo;</span>
              </RouterLink>
            </div>
          </section>
        </div>
        <div class="stack">
          <section class="card" v-if="view === 'procurement'">
            <div class="card-head"><h2>Forms</h2><RouterLink class="link" to="/Procurement/forms">Forms ›</RouterLink></div>
            <div class="rows">
              <Capped :items="LINKS" :size="50" v-slot="{ capRows }">
              <template v-for="f in capRows" :key="f.name">
                <div class="row"><a class="cell link" :href="f.url" target="_blank" rel="noopener" @click="openForm($event, f)">{{ f.name }}</a><span class="r">Open ↗</span></div>
              </template>
              </Capped>
            </div>
          </section>
          <section class="card" v-if="view === 'marketing'">
            <div class="card-head"><h2>Properties</h2><RouterLink class="link" to="/Portfolio/properties">Portfolio ›</RouterLink></div>
            <div class="rows">
              <Capped :items="pf.properties" :size="50" v-slot="{ capRows }">
              <template v-for="p in capRows" :key="p.id">
                <div class="row"><RouterLink class="cell link" :to="propertyPage(p.id)">{{ p.name }}</RouterLink><span class="r">{{ `${p.units} unit${p.units === 1 ? '' : 's'}` }}</span></div>
              </template>
              </Capped>
              <div class="empty" v-show="!pf.properties.length">No properties in Portfolio yet.</div>
            </div>
          </section>
        </div>
      </div>

    </template>
  </main>
</template>

<script>
// Dashboards for IT, HR, Operations, Procurement and Marketing (Director and Finance keep Dashboard.vue).
// Shown on /Dashboard by DashboardHome.vue; a Director sees one with "View as" (?as=role).
// Reads only what the role's rules allow (lib/role-dashboard-data.js); no amounts or guest names on the Operations one.
import { ROLE_LABEL } from '@/lib/firebase.js';
import { loadMyTickets, loadPortfolioCounts, loadOps, loadIT, loadHR, loadListingCounts } from '@/lib/role-dashboard-data.js';
import { friendlyError } from '@/lib/finance-data.js';
import { when, stamp, dmy, dayOffset } from '@/lib/format.js';
import { toast } from '@/lib/toast.js';
import { LINKS } from '@/pages/Procurement/forms-links.js';
import { STATUS as COMPLAINT } from '@/pages/HR/complaints.js';
import { useSession } from '@/stores/session.js';

const me = useSession();
export const VIEW_AS = ['director', 'finance', 'it', 'hr', 'operations', 'procurement', 'marketing'];
const SUBTITLE = {
  operations: "Today's check-ins and check-outs, your tickets, leases and inquiries",
  it: 'IT tickets, staff accounts, eZee uploads and changes made by IT',
  hr: 'Staff complaints, SOPs and onboarding',
  procurement: 'Your tickets, the portfolio and the Fillout forms',
  marketing: 'Your tickets, the portfolio and new owner listings'
};
// Offline inquiry statuses, as on the Offline inquiries page.
const INQUIRY = [['new', 'New', 'blue'], ['interested', 'Interested (Pending payment)', 'green'], ['considering', 'Considering', 'amber'],
  ['uninterested', 'Uninterested', 'grey'], ['booked', 'Paid · Booked', 'green']];
// Staff accounts card on the IT dashboard
const STAFF_TABS = [{ key: 'signIns', label: 'Last sign-ins', empty: 'No sign-ins recorded yet.' },
  { key: 'joiners', label: 'Newest joiners', empty: 'No accounts added in the PMS yet.' },
  { key: 'turnedOff', label: 'Turned off', empty: 'No accounts are turned off.' }];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dateOf = t => (t?.toDate ? t.toDate() : t ? new Date(t) : null);
const ms = t => dateOf(t)?.getTime() || 0;

// Quick actions per role dashboard; the first is the main button. Shown at the bottom of the left column (IT: right; HR: full width under both).
const QUICK = {
  operations: [{ label: 'Raise a ticket', to: '/Operations/issues', desc: 'Report a problem or ask a team', icon: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' },
    { label: 'New booking', to: '/Operations/offline-inquiries?newBooking=1', desc: 'Save an offline booking from an inquiry', icon: 'M12 5v14M5 12h14' },
    { label: 'Open Portfolio', to: '/Portfolio/properties', desc: 'Browse properties, units and owners', icon: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 22V12h6v10' }],
  it: [{ label: 'Open Issues', to: '/Operations/issues', desc: 'See every ticket tagged IT', icon: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01' },
    { label: 'Raise a ticket', to: '/Operations/issues', desc: 'Report a problem or ask a team', icon: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' }],
  hr: [{ label: 'Open staff complaints', to: '/HR/staff-complaints', desc: 'Review and reply to what staff raised',
      icon: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' },
    { label: 'Send complaint to Directors', to: '/HR/director-complaints', desc: 'Pass a case up, HR only',
      icon: 'M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z' },
    { label: 'Open Staff accounts', to: '/Settings/staff', desc: 'Add logins, roles and access',
      icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75' },
    { label: 'Edit an SOP', to: '/HR/attendance-sop', desc: 'Attendance, advance, allowance, SOCSO',
      icon: 'M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z' }],
  procurement: [{ label: 'Raise a ticket', to: '/Operations/issues', desc: 'Report a problem or ask a team', icon: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' },
    { label: 'Open Portfolio', to: '/Portfolio/properties', desc: 'Browse properties, units and owners', icon: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 22V12h6v10' }],
  marketing: [{ label: 'Raise a ticket', to: '/Operations/issues', desc: 'Report a problem or ask a team', icon: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' },
    { label: 'Open Portfolio', to: '/Portfolio/properties', desc: 'Browse properties, units and owners', icon: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 22V12h6v10' },
    { label: 'Open New owner listings', to: '/Procurement/new-owner-listings', desc: 'Tick the Marketing checklist', icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8' }]
};

export default {
  props: { role: { type: String, required: true } },
  data() {
    return {
      ROLE_LABEL, SUBTITLE, VIEW_AS, LINKS, COMPLAINT, STAFF_TABS, staffTab: 'signIns',
      isDirector: me.role === 'director',
      view: this.role, pick: this.role,   // pick: the View as select; the page reloads for it
      d: null, tickets: [], pf: { properties: [], unitCount: 0 }, listings: null,
      ready: false, loading: true, error: '',
      when, stamp, dmy
    };
  },
  async mounted() {
    const uid = me.user.uid;
    try {
      if (this.view === 'operations') [this.d, this.tickets] = await Promise.all([loadOps(uid), loadMyTickets('operations', uid)]);
      else if (this.view === 'it') this.d = await loadIT(uid);
      else if (this.view === 'hr') this.d = await loadHR();
      else {
        [this.tickets, this.pf] = await Promise.all([loadMyTickets(this.view, uid), loadPortfolioCounts()]);
        this.listings = await loadListingCounts();
      }
      this.ready = true;
    } catch (e) { this.error = friendlyError(e, 'load the dashboard'); }
    this.loading = false;
  },
  methods: {
    quickFor(v) { return QUICK[v] || []; },
    // Director "View as": the address carries the view, so Back works and the page reloads its data.
    viewAs() { this.$router.replace({ path: '/Dashboard', query: this.pick === 'director' ? {} : { as: this.pick } }); },
    jump(name) { const el = this.$refs[name]; (el?.$el || el)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
    kpis() {
      const d = this.d, open = this.tickets.length;
      const ticketKpi = tag => ({ label: 'Open tickets', value: open, to: '/Operations/issues',
        hint: open ? `${this.tickets.filter(t => t.status === 'open').length} not started yet` : `Nothing tagged ${tag} or raised by you` });
      if (this.view === 'operations') return [
        { label: 'Check-ins today', value: d.checkIns, hint: 'eZee and offline bookings', panel: 'today' },
        { label: 'Check-outs today', value: d.checkOuts, hint: 'eZee and offline bookings', panel: 'today' },
        ticketKpi('Operations'),
        { label: 'Offline bookings not in eZee', value: d.notInEzee, alert: d.notInEzee > 0, to: '/Portfolio/bookings', hint: 'No eZee reservation no. linked yet' }
      ];
      if (this.view === 'it') {
        const last = d.uploads[0];
        return [
          { label: 'Open tickets tagged IT', value: d.tickets.length, to: '/Operations/issues',
            hint: d.tickets.length ? `${d.tickets.filter(t => t.status === 'open').length} not started yet` : 'Nothing open for IT' },
          { label: 'Staff accounts active', value: d.activeCount, hint: `${d.offCount} turned off`, panel: 'staff' },
          { label: 'Last eZee upload', value: last ? this.day(last.uploadedAt) : '—', panel: 'uploads',
            hint: last ? `${this.time(last.uploadedAt)} · ${last.result === 'ok' ? 'Completed' : 'Refused'}` : 'No upload yet' },
          { label: 'Changes by IT this week', value: d.changesThisWeek + (d.changesCapped ? '+' : ''), hint: 'From the audit log, since Monday', panel: 'changes' }
        ];
      }
      if (this.view === 'hr') return [
        { label: 'New staff complaints', value: d.newCount, alert: d.newCount > 0, to: '/HR/staff-complaints', hint: d.newCount ? 'Not looked at yet' : 'Nothing new' },
        { label: 'Staff complaints open', value: d.openCount, to: '/HR/staff-complaints', hint: 'New or in review' },
        { label: 'SOPs updated this month', value: d.sopsThisMonth, hint: 'Of 4 SOP pages', panel: 'sops' },
        { label: 'Onboarding in progress', value: d.onboarding.length, to: '/Playbook/onboarding', hint: `Some of the ${d.total} items ticked` }
      ];
      const list = [
        ticketKpi(ROLE_LABEL[this.view]),
        { label: 'Properties', value: this.pf.properties.length, to: '/Portfolio/properties', hint: 'Active in Portfolio' },
        { label: 'Units', value: this.pf.unitCount, to: '/Portfolio/properties', hint: 'Across all properties' }
      ];
      if (this.view === 'procurement') list.push({ label: 'New owner listings', value: this.listings.notLive, to: '/Procurement/new-owner-listings',
        hint: `Not live yet · ${this.listings.unsigned} agreement not signed · ${this.listings.count - this.listings.notLive} live` });
      if (this.view === 'marketing') list.push({ label: 'Listings for Marketing', value: this.listings.forMarketing, alert: this.listings.forMarketing > 0,
        to: '/Procurement/new-owner-listings', hint: `Payment confirmed, not live yet · ${this.listings.notLive} of ${this.listings.count} not live` });
      return list;
    },
    newestTickets() { return [...this.tickets].sort((a, b) => ms(b.createdAt) - ms(a.createdAt)); },
    statusOf(t) { return t.status === 'progress' ? 'In progress' : 'Open'; },
    inquiryStatuses() {
      return INQUIRY.map(([key, label, cls]) => ({ key, label, cls, count: this.d.inquiries.filter(i => i.status === key).length })).filter(s => s.count);
    },
    propertyPage(id) { return id ? `/Portfolio/properties?property=${id}` : '/Portfolio/properties'; },
    bookingsPage(id) { return id ? `/Portfolio/bookings?property=${id}` : '/Portfolio/bookings'; },
    daysTo(iso) {
      const n = Math.round((new Date(iso + 'T00:00:00') - new Date(dayOffset(0) + 'T00:00:00')) / 86400000);
      return n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`;
    },
    day(t) { const d = dateOf(t); return d ? `${d.getDate()} ${MON[d.getMonth()]}` : ''; },
    time(t) { const d = dateOf(t); return d ? d.toLocaleTimeString('en-MY', { hour: 'numeric', minute: '2-digit', hour12: true }) : ''; },
    staffWhen(u) {
      if (this.staffTab === 'signIns') return when(u.lastLoginAt);
      if (this.staffTab === 'joiners') return 'Added ' + this.day(u.createdAt);
      return u.updatedAt ? 'Off since ' + this.day(u.updatedAt) : 'Turned off';
    },
    who(u) { return `${u.displayName || u.email || 'Staff member'}${u.role ? ' · ' + (ROLE_LABEL[u.role] || u.role) : ''}`; },
    uploadRows(u) {
      const [n, what] = u.kind === 'financeStatement' ? [u.counts?.units ?? 0, 'unit'] : [u.counts?.rows ?? u.counts?.bookings ?? 0, 'row'];
      return `${n} ${what}${n === 1 ? '' : 's'}`;
    },
    ticketOf(a) { return (a.entity || '').startsWith('issues/') ? a.entity.slice(7) : ''; },
    change(a) {
      const what = { 'issue.create': 'raised', 'issue.comment': 'commented on', 'issue.progress': 'started', 'issue.complete': 'completed', 'issue.tags': 'retagged' }[a.action];
      const target = this.ticketOf(a) || a.entity || '';
      return `${a.userName || 'IT'} ${what ? `${what} ${target}` : `${a.action}${target ? ' · ' + target : ''}`}`;
    },
    openForm(e, f) { if (f.url === '#') { e.preventDefault(); toast('Link not added yet'); } }
  }
};
</script>

<style scoped>
    .rows { grid-template-columns: minmax(0, 1fr); }
    .row > .cell { flex: 1 1 auto; min-width: 0; max-width: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .row .r { flex: none; display: flex; align-items: center; gap: 6px; }
    .staff-tabs { margin-bottom: 8px; }
    .staff-tabs .pill-btn { height: 28px; font-size: 12px; padding: 0 10px; }
    .sub-h { color: var(--text-2); font-size: 12px; font-weight: 600; margin-top: 8px; }
    .sub-h:first-of-type { margin-top: 0; }
    .qa-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
    .qa-tile { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border: 1px solid var(--border); border-radius: var(--radius);
      background: var(--surface); color: var(--text); text-decoration: none; transition: border-color .15s, background .15s; }
    .qa-tile:hover, .qa-tile:focus-visible { border-color: var(--accent); background: var(--accent-soft); }
    .qa-ic { flex: none; width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; background: var(--accent-soft); color: var(--accent); }
    .qa-tile.qa-main .qa-ic { background: var(--accent); color: #fff; }
    .qa-txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .qa-txt b { font-size: 13px; font-weight: 600; }
    .qa-txt small { font-size: 12px; color: var(--text-2); }
    .qa-tile:hover .qa-txt b { color: var(--accent); }
    .qa-go { flex: none; font-size: 20px; color: var(--muted); }
    .qa-tile:hover .qa-go { color: var(--accent); }
    .rows.hold.hold3 { min-height: 135px; }
    .grid-2.fill .stack > .card:last-child:has(.qa-grid) { display: flex; flex-direction: column; }
    .grid-2.fill .stack > .card:last-child .qa-grid.col { flex: 1; grid-auto-rows: 1fr; }
    .rows.hold { min-height: 180px; align-content: start; }
    .qa-grid.col { grid-template-columns: minmax(0, 1fr); gap: 8px; }
    @media (max-width: 1100px) { .qa-grid:not(.col) { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 600px) { .qa-grid { grid-template-columns: minmax(0, 1fr); } }
</style>
