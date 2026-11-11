<template>
  <main class="content">
    <div class="loading-bar" v-show="loading || busy"></div>
    <div class="notice ok" v-show="okMsg">{{ okMsg }}</div>
    <div class="notice error" v-show="error">{{ error }}</div>
    <div class="notice warn" v-show="leadsError">{{ leadsError }}</div>
    <div class="notice warn" v-if="syncNotes.length"><template v-for="(n, i) in syncNotes" :key="i"><div>{{ n }}</div></template></div>
    <div class="page-head">
      <div>
        <h1>Owner Leads</h1>
        <div class="sub">Every owner lead from the task system's Owner Leads board, from New to Live. Click a row to open its listing.</div>
        <div class="ov-live"><LiveStatus :status="liveStatus.list?.status" :last-updated="liveStatus.list?.lastUpdated" />
          <LiveStatus v-if="readsLeads" :status="liveStatus.leads?.status" :last-updated="liveStatus.leads?.lastUpdated" time /></div>
      </div>
      <div class="head-tools">
        <button class="btn" v-if="isDirector && plan.length" @click="migrateOpen = true">{{ `Update older listings (${plan.length})` }}</button>
        <router-link class="btn btn-primary" v-if="canEdit" to="/Procurement/listing-flow">Open Listing Flow</router-link>
      </div>
    </div>

    <section class="kpis ov-kpis">
      <template v-for="k in LEAD_KEYS" :key="k">
        <button type="button" class="card kpi kpi-link" :class="{ on: status === k }" @click="kpiGo(k)">
          <div class="label">{{ LEAD_STATUS[k].label }}</div><div class="value">{{ count(k) }}</div><div class="hint">{{ HINTS[k] }}</div></button>
      </template>
    </section>

    <div class="toolbar ov-tools" ref="list">
      <input class="input" type="search" placeholder="Search NL no., subject, property, unit, owner or remarks" v-model="search" aria-label="Search owner leads">
      <OptionPicker v-model="status" :options="[{ value: 'all', label: `All statuses · ${rows.length}` }, ...LEAD_KEYS.map(k => ({ value: k, label: `${LEAD_STATUS[k].label} · ${count(k)}` }))]" label="Status" />
      <OptionPicker v-model="source" :options="[{ value: 'all', label: 'All sources' }, ...SOURCES.map(s => ({ value: s, label: s }))]" label="Source" />
      <OptionPicker v-model="property" :options="[{ value: 'all', label: 'All properties' }, ...propertyList.map(p => ({ value: p, label: p }))]" label="Property" searchable />
    </div>
    <section class="card">
      <Paged :items="shown" v-slot="{ pageRows }">
        <div class="table-wrap">
          <table class="table ov-table">
            <thead><tr><th>Listing</th><th>Subject</th><th>Property</th><th>Unit</th><th>Type</th><th class="num">Size (sq ft)</th><th>Owner</th><th>Contact number</th><th>Email</th><th>Source</th><th>Date</th><th>Status</th><th>Remarks</th><th class="num">Aging</th></tr></thead>
            <tbody>
              <template v-for="r in pageRows" :key="r.key">
                <tr :class="{ clickable: !!r.listingId }" @click="open(r)">
                  <td><b>{{ r.listingId || '—' }}</b></td>
                  <td class="wrap">{{ r.subject || '—' }}</td>
                  <td>{{ r.property || '—' }}</td>
                  <td>{{ r.unit || '—' }}</td>
                  <td>{{ r.unitType || '—' }}</td>
                  <td class="num">{{ r.sizeSqft || '—' }}</td>
                  <td>{{ r.ownerName || '—' }}</td>
                  <td><span v-if="!canSeeContact" class="muted">Restricted</span><template v-else>{{ r.listingId ? contactOf(r.listingId).ownerPhone || '—' : '—' }}</template></td>
                  <td class="wrap"><span v-if="!canSeeContact" class="muted">Restricted</span><template v-else>{{ r.listingId ? contactOf(r.listingId).ownerEmail || '—' : '—' }}</template></td>
                  <td>{{ r.source || '—' }}</td>
                  <td>{{ full(r.date) || '—' }}</td>
                  <td><span class="pill" :class="LEAD_STATUS[r.status].pill">{{ LEAD_STATUS[r.status].label }}</span></td>
                  <td class="wrap remarks">{{ r.remarks || '—' }}</td>
                  <td class="num nowrap">{{ r.aging.text }}</td>
                </tr>
              </template>
              <SkeletonRows v-if="loading && !shown.length" table :cols="14" />
              <tr v-show="!loading && !shown.length"><td colspan="14" class="muted">No owner leads here.</td></tr>
            </tbody>
          </table>
        </div>
      </Paged>
    </section>
    <p class="page-note">New leads are cards in the task system's Owner Leads board (Business Development &amp; Procurement) that nobody has started yet: start them in the Listing Flow. Owner phone numbers and emails are shown only to Procurement and the Directors.</p>

    <!-- Director: older listings get the new statuses (preview first) -->
    <div class="modal-back" v-if="migrateOpen" @click.self="migrateOpen = false" v-esc="() => { migrateOpen = false }">
      <div class="modal" role="dialog" aria-label="Update older listings" style="max-width:720px;width:calc(100% - 32px)">
        <div class="card-head"><h2>Update older listings</h2></div>
        <p class="help">These listings were made before the lead statuses. Each gets the status below (agreement signed = Signed, Live = Live, else In progress), and the signed and live dates from its history for the aging counter. Their cards on the Owner Leads board are moved to match.</p>
        <div class="table-wrap" style="max-height:360px;overflow:auto">
          <table class="table">
            <thead><tr><th>Listing</th><th>Property / unit</th><th>Now</th><th>Becomes</th><th>Signed</th><th>Live</th></tr></thead>
            <tbody><template v-for="p in plan" :key="p.id"><tr><td><b>{{ p.id }}</b></td><td>{{ p.place }}</td><td>{{ p.from }}</td><td>{{ LEAD_STATUS[p.to].label }}</td><td>{{ full(p.signedIso) || '—' }}</td><td>{{ full(p.liveIso) || '—' }}</td></tr></template></tbody>
          </table>
        </div>
        <div class="modal-foot"><button class="btn" @click="migrateOpen = false">Cancel</button><button class="btn btn-primary" @click="migrate()" :disabled="busy">{{ `Update ${plan.length} listings` }}</button></div>
      </div>
    </div>
  </main>
</template>

<script>
// Leads & Agreements > Owner Leads (Phase 3, 11 Nov 2026): every owner lead, read-only. The TMS board "Owner Leads"
// (polled every 60 s through use-live.js) plus the listings (live, newest 300). Cards nobody has started are New with
// Listing "—"; a row with a listing opens it in the Listing Flow. Directors and Procurement also bring the listings in line
// with the cards after each poll (lib/owner-leads.js reconcile: the task system wins). Director: Update older listings.
import { collection, query, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase.js';
import { useSession } from '@/stores/session.js';
import { can } from '@/lib/access.js';
import { liveMixin } from '@/lib/use-live.js';
import { ownerLeads } from '@/lib/tms.js';
import { LEAD_STATUS, LEAD_KEYS, SOURCES, LIST_LIMIT, CONTACT_READERS, LEAD_READERS, toRow, leadRows, matches, full, listingLink,
  loadContact, reconcile, migrationPlan, runMigration, errText } from '@/lib/owner-leads.js';
import OptionPicker from '@/components/OptionPicker.vue';
import LiveStatus from '@/components/LiveStatus.vue';

const HINTS = { new: 'On the board, not started', progress: 'Owner interested', signed: 'Agreement signed', live: 'Handed over to Operations', cancelled: 'Owner not going ahead' };

export default {
  components: { OptionPicker, LiveStatus },
  mixins: [liveMixin],
  data() {
    const me = useSession();
    return { LEAD_STATUS, LEAD_KEYS, SOURCES, HINTS,
      canEdit: can(me, 'newOwnerListings.edit'), canSeeContact: CONTACT_READERS.includes(me.role), isDirector: me.role === 'director', readsLeads: LEAD_READERS.includes(me.role),
      listings: [], leads: [], contacts: {}, search: '', status: 'all', source: 'all', property: 'all',
      loading: true, busy: false, error: '', leadsError: '', okMsg: '', syncNotes: [], leadsIn: false, syncing: false, migrateOpen: false, now: Date.now() };
  },
  computed: {
    rows() { return leadRows(this.listings, this.leads, this.now); },
    propertyList() { return [...new Set(this.rows.map(r => r.property).filter(Boolean))].sort(); },
    shown() {
      const s = this.search.trim().toLowerCase();
      return this.rows.filter(r => (this.status === 'all' || r.status === this.status) && (this.source === 'all' || r.source === this.source)
        && (this.property === 'all' || r.property === this.property)
        && (!s || matches({ id: r.listingId, property: r.property, unit: r.unit, ownerName: r.ownerName, title: r.subject, remarks: r.remarks }, s)))
        .sort((a, b) => (b.date || '').localeCompare(a.date || '') || String(b.listingId || '').localeCompare(String(a.listingId || '')));
    },
    plan() { return this.isDirector ? migrationPlan(this.listings) : []; }
  },
  mounted() {
    this.live('list', query(collection(db, 'newOwnerListings'), orderBy('createdAt', 'desc'), limit(LIST_LIMIT)),
      rows => { const first = this.loading; this.listings = rows.map(toRow); this.loading = false; if (first) this.sync(); },
      { onError: e => { this.error = e.friendly; this.loading = false; } });
    if (this.readsLeads) this.livePoll('leads', () => this.pollLeads(), 60000, { onError: e => { this.leadsError = `Task system: ${e.message} New leads can't be shown right now; it tries again by itself.`; } });
  },
  methods: {
    full,
    async pollLeads() {
      this.leads = await ownerLeads(); this.leadsError = ''; this.leadsIn = true; this.now = Date.now();
      await this.sync();
    },
    listLoadingNow() { return this.loading; },
    // Bring the listings in line with the cards (Directors and Procurement), once the list and the board are both in.
    async sync() {
      if (this.syncing || this.listLoadingNow() || !this.leadsIn) return;
      this.syncing = true;
      try { this.syncNotes = await reconcile(this.leads, this.listings); } finally { this.syncing = false; }
    },
    count(k) { return this.rows.filter(r => r.status === k).length; },
    kpiGo(key) { this.status = this.status === key ? 'all' : key; this.$nextTick(() => this.$refs.list?.scrollIntoView({ behavior: 'smooth', block: 'start' })); },
    open(r) { if (r.listingId) this.$router.push(listingLink(r.listingId)); },
    // Owner phone and email, read once per listing as its row is shown (Directors and Procurement).
    contactOf(id) {
      if (!(id in this.contacts)) {
        this.contacts[id] = { ownerPhone: '…', ownerEmail: '…' };
        queueMicrotask(() => loadContact(id).then(c => { this.contacts[id] = c; }));
      }
      return this.contacts[id];
    },
    async migrate() {
      this.busy = true; this.error = '';
      try {
        const n = this.plan.length;
        const notes = await runMigration(this.plan, new Set(this.leads.map(x => x.taskId)));
        this.okMsg = `${n} older listings updated.` + (notes.length ? ` ${notes.join(' ')}` : '');
        this.migrateOpen = false;
      } catch (e) { this.error = errText(e, 'update the older listings'); }
      this.busy = false;
    }
  }
};
</script>

<style scoped>
.page-note { color: var(--muted); font-size: 12px; margin-top: 14px; }
.head-tools { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.ov-live { display: flex; gap: 14px; margin-top: 4px; }
.ov-kpis { grid-template-columns: repeat(5, minmax(0, 1fr)); }
@media (max-width: 900px) { .ov-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.ov-tools { flex-wrap: wrap; }
.ov-tools .input { flex: 0 1 360px; max-width: 360px; min-width: 240px; }
.ov-table td { font-size: 13px; }
.wrap { overflow-wrap: anywhere; min-width: 120px; }
.remarks { max-width: 220px; }
.nowrap { white-space: nowrap; }
</style>
