<template>
  <main class="content pf">
    <div class="loading-bar" v-show="loading || busy"></div>

    <div class="page-head">
      <div>
        <h1>Properties</h1>
        <div class="sub">
          <span>Portfolio › Properties · </span>
          <span>every property you have access to</span>
        </div>
      </div>
      <div class="head-tools">
        <MonthPicker :ahead="1" v-model="asOf" @change="reload()" v-if="!acc.viewOnly" />
        <RefreshButton @refresh="go()" />
      </div>
    </div>

    <div class="notice error" v-show="error">{{ error }}</div>
    <div class="notice ok" v-show="okMsg">{{ okMsg }}</div>

    <section class="kpis">
      <button type="button" class="card kpi kpi-link" :class="{ on: !propAttn }" @click="propAttn = false; toList()"><div class="label">Properties</div><div class="value">{{ properties.length }}</div><div class="hint">Widebed manages</div></button>
      <button type="button" class="card kpi kpi-link" @click="propAttn = false; toList()"><div class="label">Units</div><div class="value">{{ allUnits.length }}</div><div class="hint">Across all properties</div></button>
      <template v-if="!acc.viewOnly">
        <RouterLink class="card kpi kpi-link" :to="`/Finance/month-end?month=${asOf}`" title="Open Month-end payout"><div class="label">{{ `${monthOnly(asOf)} statements` }}</div>
          <div class="value small">{{ `${completedUnits} of ${allUnits.length} completed` }}</div>
          <div class="hint">{{ `${stillOpen} ${stillOpen === 1 ? 'property' : 'properties'} still open` }}</div></RouterLink>
        <button type="button" class="card kpi kpi-link" :class="{ on: propAttn }" @click="propAttn = !propAttn; toList()" title="Show only properties with units not set up"><div class="label">Needs attention</div><div class="value" :class="{ alert: notSetUp }">{{ notSetUp }}</div><div class="hint">{{ propAttn ? 'Showing these properties · click to show all' : 'Units not set up yet' }}</div></button>
      </template>
    </section>
    <div class="pf-bar">
      <input class="input" type="search" placeholder="Search property..." v-model="propSearch" aria-label="Search property">
      <button class="btn btn-primary" @click="openAdd(null)" v-if="acc.canAdd">+ Add property</button>
    </div>
    <section class="card" ref="propList">
      <h2 class="t">{{ acc.viewOnly ? 'Properties' : `Properties · ${monthName(asOf)}` }}</h2>
      <Paged :items="shownProperties" v-slot="{ pageRows }">
      <div class="table-wrap">
        <table class="table">
          <thead v-if="acc.viewOnly"><tr><th>Property</th><th>Short code</th><th class="num">Units</th><th>City · State</th><th></th></tr></thead>
          <thead v-else><tr><th>Property</th><th class="num">Units</th><th>Arrangement mix</th><th>{{ `${monthOnly(asOf)} statements` }}</th><th>Status</th><th>Needs attention</th><th></th></tr></thead>
          <tbody>
            <template v-for="p in pageRows" :key="p.id">
              <tr class="clickable" @click="openPropertyPage(p.id)" v-if="acc.viewOnly">
                <td class="strong">{{ p.name }}</td>
                <td>{{ p.code || '—' }}</td>
                <td class="num">{{ unitsOf(p.id).length }}</td>
                <td>{{ [p.info?.city, p.info?.state].filter(Boolean).join(' · ') || '—' }}</td>
                <td class="num"><button class="navlink" @click.stop="openPropertyPage(p.id)">Open →</button></td>
              </tr>
              <tr class="clickable" @click="openPropertyPage(p.id)" v-else>
                <td class="strong">{{ p.name }}</td>
                <td class="num">{{ unitsOf(p.id).length }}</td>
                <td>{{ mixText(unitsOf(p.id)) }}</td>
                <td>{{ !unitsOf(p.id).length ? 'Not started' : `${isDone(p.id) ? unitsOf(p.id).length : (monthDocs[p.id]?.completedUnits || 0)} of ${unitsOf(p.id).length} completed` }}</td>
                <td><span class="pill" :class="isDone(p.id) ? 'green' : 'grey'">{{ isDone(p.id) ? 'Completed' : 'Draft' }}</span></td>
                <td :class="attentionText(p.id) === '—' ? 'muted' : 'att'">{{ attentionText(p.id) }}</td>
                <td class="num"><button class="navlink" @click.stop="openPropertyPage(p.id)">Open →</button></td>
              </tr>
            </template>
            <SkeletonRows v-if="loading && !shownProperties.length" table :cols="acc.viewOnly ? 5 : 7" />
            <tr v-show="!loading && !shownProperties.length"><td :colspan="acc.viewOnly ? 5 : 7" class="muted">{{ acc.viewOnly ? 'No properties yet.' : 'No properties yet. Add one, or upload an eZee report and it is created for you.' }}</td></tr>
          </tbody>
        </table>
      </div>
      </Paged>
      <div class="card-foot"><span>{{ `Click a property to open its tabs (${acc.PTABS.map(t => t.label).join(', ')}).` }}</span></div>
    </section>

    <PropertyDrawer v-if="adding" :prefill="adding.prefill" :properties="properties" :acc="acc"
      @close="adding = null" @busy="busy = $event" @created="onCreated" />
  </main>
</template>

<script>
// Portfolio › Properties: the list of every property, with the month's statement progress (Accounting and Directors)
// and "+ Add property". Opening a property goes to /Portfolio/properties?property=<id> (PropertyPage).
import '../portfolio.css';
import { monthName, monthOffset } from '@/lib/format.js';
import { loadProperties, watchProperties, friendlyError } from '@/lib/finance-data.js';
import { liveMixin } from '@/lib/use-live.js';
import { useSession } from '@/stores/session.js';
import { peekHandoff, takeHandoff } from '@/lib/handoff.js';
import { portfolioAccess } from '@/lib/portfolio-access.js';
import { monthOnly, mixText, loadUnitsOf, loadPropertiesSummary, handoffProperty } from '@/lib/portfolio-data.js';
import MonthPicker from '@/components/MonthPicker.vue';
import RefreshButton from '@/components/RefreshButton.vue';
import PropertyDrawer from './PropertyDrawer.vue';

const me = useSession();

export default {
  mixins: [liveMixin],
  components: { MonthPicker, RefreshButton, PropertyDrawer },
  data() {
    return {
      acc: portfolioAccess(me.role),
      asOf: this.$route.query.month || monthOffset(0),
      properties: [], allUnits: [], monthDocs: {},
      propSearch: '', propAttn: false,
      loading: true, busy: false, error: '', okMsg: '',
      adding: null   // { prefill } while the add property drawer is open
    };
  },
  computed: {
    notSetUp() { return this.allUnits.filter(x => !x.terms).length; },
    stillOpen() { return this.properties.filter(p => !this.isDone(p.id)).length; },
    // Completion is per unit: a 'partial' month document counts its completed units
    completedUnits() { return this.properties.reduce((n, p) => n + (this.isDone(p.id) ? this.unitsOf(p.id).length : (this.monthDocs[p.id]?.completedUnits || 0)), 0); },
    shownProperties() {
      const q = this.propSearch.trim().toLowerCase();
      const attn = this.propAttn ? new Set(this.allUnits.filter(x => !x.terms).map(x => x.propertyId)) : null;
      return this.properties.filter(p => (!q || p.name.toLowerCase().includes(q) || (p.code || '').toLowerCase().includes(q)) && (!attn || attn.has(p.id)));
    }
  },
  async mounted() {
    await this.go();
    this.pickUpHandoff();
    // Live (6 Nov 2026): properties added, renamed or switched off elsewhere show without a refresh. The unit counts
    // and month status are read again only when a property is added or removed (they are many reads).
    const ids = list => list.map(p => p.id).sort().join('|');
    this.liveUse('props', watchProperties(rows => {
      const added = ids(rows) !== ids(this.properties);
      this.properties = rows;
      if (added) this.loadSummary().catch(e => { this.error = friendlyError(e, 'load the portfolio'); });
    }, e => { this.error = e.friendly || friendlyError(e, 'load the properties'); }));
  },
  methods: {
    monthName, monthOnly, mixText,
    // This page's address with the month (left out when it is the current one).
    url(propertyId = null) {
      const q = new URLSearchParams();
      if (propertyId) q.set('property', propertyId);
      if (this.asOf !== monthOffset(0)) q.set('month', this.asOf);
      return '/Portfolio/properties' + (q.toString() ? '?' + q : '');
    },
    // Month picked: new address; the router opens the page again and it loads.
    reload() {
      this.okMsg = '';
      const url = this.url();
      if (url === this.$route.fullPath) this.go(); else this.$router.replace(url);
    },
    openPropertyPage(id) { this.okMsg = ''; this.$router.push(this.url(id)); },
    async go() {
      this.loading = true; this.error = '';
      try {
        this.properties = await loadProperties();
        const url = this.url();
        if (url !== location.pathname + location.search) history.replaceState(history.state, '', url);
        await this.loadSummary();
      } catch (e) { this.error = friendlyError(e, 'load the portfolio'); }
      this.loading = false;
    },
    async loadSummary() {
      if (this.acc.viewOnly) {
        // View-only roles: unit counts only (units read without their terms).
        this.allUnits = await loadUnitsOf(this.properties, this.asOf, true);
        this.monthDocs = {};
      } else {
        // The month summaries hold each property's units and arrangements, so units, terms, owners and expenses are not read.
        const s = await loadPropertiesSummary(this.properties, this.asOf, me);
        this.monthDocs = s.monthDocs; this.allUnits = s.units;
      }
    },
    unitsOf(pid) { return this.allUnits.filter(x => x.propertyId === pid); },
    isDone(pid) { return this.monthDocs[pid]?.status === 'completed'; },
    attentionText(pid) {
      const list = this.unitsOf(pid);
      if (!list.length) return 'Upload eZee report';
      const none = list.filter(x => !x.terms).length;
      return none ? `${none} to set up` : '—';
    },
    // Summary cards: scroll to the list they filter.
    toList() { this.$nextTick(() => this.$refs.propList?.scrollIntoView({ behavior: 'smooth', block: 'start' })); },
    openAdd(prefill) { this.okMsg = ''; this.adding = { prefill }; },
    onCreated(id) {
      this.adding = null;
      this.openPropertyPage(id);
    },
    // Create property / Create unit on a new owner listing (lib/handoff.js). A property opens the add drawer filled in;
    // a unit moves to its property's Units tab, where PropertyPage opens the unit drawer.
    pickUpHandoff() {
      const h = peekHandoff();
      if (!h || !this.acc.canAdd || this.error) return;
      if (h.kind === 'property') {
        takeHandoff();
        this.openAdd({ name: h.property || '', fromListing: h });
      } else if (h.kind === 'unit') {
        const p = handoffProperty(h, this.properties);
        if (!p) {
          takeHandoff();
          this.error = `No property called "${h.property || '(not set on the listing)'}" in Portfolio yet. Create the property first (Create property on ${h.listingId}), then Create unit.`;
          return;
        }
        this.$router.replace(this.url(p.id));
      }
    }
  }
};
</script>
