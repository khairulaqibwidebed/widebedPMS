<template>
  <main class="content pf">
    <div class="loading-bar" v-show="loading || busy"></div>

    <div class="page-head">
      <div>
        <h1>{{ property.name || '' }}</h1>
        <div class="sub crumb"><a href="/Portfolio/properties" @click.prevent="toList()">Portfolio</a> › <a href="/Portfolio/properties" @click.prevent="toList()">Properties</a>
          <span>{{ ` › ${property.name || ''}` + (acc.viewOnly ? ' · view only' : '') }}</span></div>
      </div>
      <div class="head-tools">
        <OptionPicker v-model="propertyId" :options="propertyOptions" label="Property" @change="switchProperty()" />
        <MonthPicker :ahead="1" v-model="asOf" @change="reload()" v-if="!acc.viewOnly" />
        <RefreshButton @refresh="go()" />
        <button class="btn btn-primary" v-show="ptab === 'units'" @click="openUnit(null)" v-if="acc.canAdd">+ Add unit</button>
        <button class="btn" v-show="ptab === 'overview'" @click="openPropertyEdit()" v-if="!acc.viewOnly || acc.canEdit">Edit property</button>
      </div>
    </div>

    <nav class="tabs" aria-label="Property sections">
      <template v-for="t in acc.PTABS" :key="t.key"><button :class="{ on: ptab === t.key }" @click="setPtab(t.key)">{{ t.label }}</button></template>
    </nav>

    <div class="notice error" v-show="error">{{ error }}</div>
    <div class="notice ok" v-show="okMsg">{{ okMsg }}</div>

    <template v-if="property.id">
      <OverviewTab v-show="ptab === 'overview'" :property="property" :units="units" :as-of="asOf" :done="monthDocs[property.id]?.status === 'completed'" :acc="acc"
        @units="f => { filter = f; setPtab('units'); }" @tab="setPtab" @edit="openPropertyEdit()" />

      <UnitsTab v-show="ptab === 'units'" :property="property" :units="units" :owners="owners" :audits="audits" :audit-more="auditMore" :audit-busy="auditBusy"
        v-model:filter="filter" :as-of="asOf" :busy="busy" :loading="loading" :acc="acc"
        @open="openUnit" @starter="runStarter()" @audit-page="onAuditPage" @more-audits="loadAudits(true)" />

      <div v-show="ptab === 'owners'">
        <OwnersList :owners="owners" :units="units" :properties="properties" :bf-lines="bfLines" :property-id="property.id" :acc="acc" :loading="loading"
          @open="openOwner" @add="openOwner(null)" />
      </div>

      <template v-if="!acc.viewOnly">
        <!-- Fees & rates and OTA commissions read the rate version each time the tab opens (and on Refresh) -->
        <RatesTab v-if="ptab === 'rates' || ptab === 'ota'" :key="`${ptab}:${loadNo}`" :mode="ptab" :property-id="property.id" :units="units" :as-of="asOf" :months="months"
          @saved="onRatesSaved" @error="error = $event" @busy="busy = $event" />
        <AuditTab v-show="ptab === 'audit'" :audits="audits" :audit-more="auditMore" :audit-busy="auditBusy" @audit-page="onAuditPage" @more-audits="loadAudits(true)" />
      </template>
    </template>

    <UnitDrawer v-if="unitDrawer && (!acc.viewOnly || acc.canEdit || (acc.canAdd && !unitDrawer.unit))" :unit="unitDrawer.unit" :prefill="unitDrawer.prefill"
      :property="property" :units="units" :owners="owners" :custom-types="customTypes" :as-of="asOf" :months="months" :acc="acc"
      @close="unitDrawer = null" @busy="busy = $event" @saved="onSaved" @type-added="t => customTypes = [...customTypes, t]" />

    <PropertyDrawer v-if="propDrawer && (!acc.viewOnly || acc.canEdit)" :property="property" :properties="properties" :acc="acc"
      @close="propDrawer = false" @busy="busy = $event" @saved="onSaved" />

    <OwnerDrawer v-if="ownerDrawer" :owner="ownerDrawer.owner" :owners="owners" :units="units" :properties="properties" :bf-lines="bfLines"
      :as-of="asOf" :property-id="property.id || 'all'" :acc="acc" @close="ownerDrawer = null" @busy="busy = $event" @saved="onSaved" />
  </main>
</template>

<script>
// Portfolio › Properties › one property: tabs Overview, Units, Owners and, for Accounting and Directors, Fees & rates,
// OTA commissions and Audit log. Address /Portfolio/properties?property=<id>&ptab=<tab>&month=<YYYY-MM>.
// Switching tab only updates the address (no reload).
import '../portfolio.css';
import { monthName, monthOffset } from '@/lib/format.js';
import { loadProperties, friendlyError } from '@/lib/finance-data.js';
import { useSession } from '@/stores/session.js';
import { rememberProperty } from '@/lib/last-property.js';
import { peekHandoff, takeHandoff } from '@/lib/handoff.js';
import { portfolioAccess } from '@/lib/portfolio-access.js';
import { loadOwners, loadUnitsOf, loadMonthDocs, loadBroughtForward, loadAuditPage, loadUnitTypes, loadStarter, forgetUnits,
  handoffProperty } from '@/lib/portfolio-data.js';
import OptionPicker from '@/components/OptionPicker.vue';
import MonthPicker from '@/components/MonthPicker.vue';
import RefreshButton from '@/components/RefreshButton.vue';
import OwnersList from '../shared/OwnersList.vue';
import OwnerDrawer from '../shared/OwnerDrawer.vue';
import PropertyDrawer from './PropertyDrawer.vue';
import UnitDrawer from './UnitDrawer.vue';
import OverviewTab from './tabs/OverviewTab.vue';
import UnitsTab from './tabs/UnitsTab.vue';
import RatesTab from './tabs/RatesTab.vue';
import AuditTab from './tabs/AuditTab.vue';

const me = useSession();

export default {
  components: { OptionPicker, MonthPicker, RefreshButton, OwnersList, OwnerDrawer, PropertyDrawer, UnitDrawer, OverviewTab, UnitsTab, RatesTab, AuditTab },
  data() {
    const q = this.$route.query, acc = portfolioAccess(me.role);
    const asOf = q.month || monthOffset(0);
    const months = Array.from({ length: 25 }, (_, i) => monthOffset(1 - i));
    if (!months.includes(asOf)) months.push(asOf);
    return {
      acc, months,
      propertyId: q.property, asOf,
      ptab: acc.PTABS.some(t => t.key === q.ptab) ? q.ptab : 'units',
      properties: [], owners: [], units: [], monthDocs: {}, bfLines: [], customTypes: [],
      audits: [], auditLast: null, auditMore: false, auditBusy: false,
      filter: 'all', loadNo: 0,
      loading: true, busy: false, error: '', okMsg: '',
      unitDrawer: null,    // { unit, prefill } while the unit drawer is open
      propDrawer: false,   // the edit property drawer
      ownerDrawer: null    // { owner } while the owner drawer is open
    };
  },
  computed: {
    property() { return this.properties.find(p => p.id === this.propertyId) || {}; },
    propertyOptions() { return this.properties.map(p => ({ value: p.id, label: p.name })); }
  },
  async mounted() {
    // Unit types people added with "+ Add type" (shared by everyone)
    loadUnitTypes().then(list => { this.customTypes = list; });
    await this.go();
    this.pickUpHandoff();
  },
  methods: {
    // This page's address: property, tab (left out for Units) and month (left out when it is the current one).
    url(propertyId = this.propertyId, ptab = this.ptab) {
      const q = new URLSearchParams();
      q.set('property', propertyId);
      if (ptab !== 'units') q.set('ptab', ptab);
      if (this.asOf !== monthOffset(0)) q.set('month', this.asOf);
      return '/Portfolio/properties?' + q;
    },
    syncUrl() {
      const url = this.url();
      if (url !== location.pathname + location.search) history.replaceState(history.state, '', url);
    },
    // Back to the list means All properties: the remembered single property is forgotten so other pages open on All.
    toList() {
      this.okMsg = ''; rememberProperty('all');
      const q = this.asOf !== monthOffset(0) ? `?month=${this.asOf}` : '';
      this.$router.push('/Portfolio/properties' + q);
    },
    // Property or month picked: new address; the router opens the page again and it loads.
    switchProperty() { rememberProperty(this.propertyId); this.reload(); },
    reload() {
      this.okMsg = '';
      const url = this.url();
      if (url === this.$route.fullPath) this.go(); else this.$router.replace(url);
    },
    async setPtab(k) {
      this.ptab = k; this.okMsg = ''; this.syncUrl();
      if (k === 'audit' && !this.acc.viewOnly) await this.loadAudits();
    },
    async go() {
      this.loading = true; this.error = '';
      this.loadNo++;   // an open Fees & rates / OTA tab reads its rate version again
      try {
        this.properties = await loadProperties();
        const p = this.properties.find(x => x.id === this.propertyId);
        if (!p) { this.loading = false; this.$router.replace('/Portfolio/properties'); return; }
        this.syncUrl();
        // View-only roles read units without their terms, and no months, expenses or owner private docs.
        const view = this.acc.viewOnly;
        const [owners, units, monthDocs, bf] = await Promise.all([
          loadOwners(view, this.acc.canEdit),
          loadUnitsOf([p], this.asOf, view),
          view ? {} : loadMonthDocs([p], this.asOf),
          view ? [] : loadBroughtForward(p.id, this.asOf)
        ]);
        this.owners = owners; this.units = units; this.monthDocs = monthDocs; this.bfLines = bf;
        if (!view) {
          if (this.ptab === 'audit') await this.loadAuditsNow(); else this.resetAudits();
        }
      } catch (e) { this.error = friendlyError(e, 'load the portfolio'); }
      this.loading = false;
    },

    // ---- audit log (30 at a time; the Units tab's unit settings log uses the same list) ----
    resetAudits() { this.audits = []; this.auditLast = null; this.auditMore = false; },
    // The audit tables fetch the next 30 on their own when the user reaches the last loaded page
    onAuditPage({ page, last }) { if (page >= last && this.auditMore && !this.auditBusy) this.loadAudits(true); },
    async loadAudits(more = false) {
      if (this.auditBusy) return;
      this.auditBusy = true;
      try { await this.loadAuditsNow(more); } catch (e) { this.error = friendlyError(e, 'load the portfolio'); }
      this.auditBusy = false;
    },
    async loadAuditsNow(more = false) {
      const r = await loadAuditPage(this.propertyId, more ? this.auditLast : null);
      this.audits = more ? [...this.audits, ...r.rows] : r.rows;
      if (!r.all && r.last) this.auditLast = r.last;
      this.auditMore = r.more;
    },

    // ---- drawers ----
    openUnit(unit, prefill = null) { this.okMsg = ''; this.unitDrawer = { unit, prefill }; },
    openPropertyEdit() { this.okMsg = ''; this.propDrawer = true; },
    openOwner(own) {
      this.okMsg = '';
      // View-only roles open an owner only to add one (or Marketing, to edit)
      if (!own && !this.acc.canAdd) return;
      if (own && this.acc.viewOnly && !this.acc.canEdit) return;
      this.ownerDrawer = { owner: own };
    },
    async onSaved(msg) {
      this.unitDrawer = null; this.propDrawer = false; this.ownerDrawer = null;
      this.okMsg = msg;
      await this.go();
    },
    onRatesSaved(msg) {
      this.okMsg = msg;
      if (this.ptab !== 'audit') this.resetAudits();
    },
    async runStarter() {
      this.busy = true; this.error = '';
      try {
        const n = await loadStarter(me, this.propertyId, this.asOf, this.units);
        this.okMsg = `Starter settings loaded for ${n} units from ${monthName(this.asOf)}. Fixed rents are Sep 2026 amounts: check them.`;
        await forgetUnits(this.propertyId);
        await this.go();
      } catch (e) { this.error = friendlyError(e, 'load the starter settings'); }
      this.busy = false;
    },
    // Create unit on a new owner listing (lib/handoff.js): open the add unit drawer filled in from it. The listing's
    // property may be another one: the page moves there first, and that page opens the drawer.
    pickUpHandoff() {
      const h = peekHandoff();
      if (!h || h.kind !== 'unit' || !this.acc.canAdd || this.error || !this.property.id) return;
      const p = handoffProperty(h, this.properties);
      if (!p) {
        takeHandoff();
        this.error = `No property called "${h.property || '(not set on the listing)'}" in Portfolio yet. Create the property first (Create property on ${h.listingId}), then Create unit.`;
        return;
      }
      if (p.id !== this.propertyId) { this.$router.replace(this.url(p.id, 'units')); return; }
      takeHandoff();
      if (this.ptab !== 'units') { this.ptab = 'units'; this.syncUrl(); }
      this.openUnit(null, { unitCode: [p.code, h.unit].filter(Boolean).join(' '), reason: `New owner listing ${h.listingId}`, fromListing: h,
        ownerId: this.owners.some(x => x.id === h.portfolio?.ownerId && x.active !== false) ? h.portfolio.ownerId : '' });
    }
  }
};
</script>
