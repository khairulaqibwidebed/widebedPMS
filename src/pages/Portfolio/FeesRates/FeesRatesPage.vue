<template>
  <main class="content pf">
    <div class="loading-bar" v-show="loading || busy"></div>

    <div class="page-head">
      <div>
        <h1>Fees &amp; Rates</h1>
        <div class="sub crumb">Portfolio › Fees &amp; Rates · one set for every property</div>
      </div>
      <div class="head-tools" v-if="!acc.viewOnly">
        <MonthPicker :ahead="1" v-model="asOf" @change="reload()" />
        <RefreshButton @refresh="go()" />
        <button class="btn" v-if="acc.isDirector" @click="okMsg = ''; buildOpen = true" :disabled="busy">Build shared set</button>
      </div>
    </div>

    <template v-if="acc.viewOnly">
      <div class="notice">Fees and rates are for Accounting, Directors and staff with Portfolio Edit.</div>
    </template>
    <template v-else>
      <nav class="tabs" aria-label="Fees & Rates sections">
        <button :class="{ on: tab === 'rates' }" @click="setTab('rates')">Fees &amp; rates</button>
        <button :class="{ on: tab === 'ota' }" @click="setTab('ota')">OTA commissions</button>
      </nav>

      <div class="notice error" v-show="error">{{ error }}</div>
      <div class="notice ok" v-show="okMsg">{{ okMsg }}</div>

      <!-- The same screens as a property's Fees & rates and OTA commissions tabs, for the shared set (no property) -->
      <RatesTab :key="`${tab}:${loadNo}`" :mode="tab" :property-id="null" :units="units" :pool="pool" :as-of="asOf" :months="months"
        @saved="onSaved" @error="error = $event" @busy="busy = $event" />
    </template>

    <BuildShared v-if="buildOpen" :months="months" :as-of="asOf" :has-shared="hasShared" @close="buildOpen = false" @saved="onBuilt" />
  </main>
</template>

<script>
// Portfolio › Fees & Rates (12 Nov 2026, Khairul): one set of fee arrangements, OTA commissions and rules for every
// property (lib/shared-rates.js). Each unit still picks one arrangement on its property's Units tab; Pool Sharing's
// Net Rental # % stays per property. Directors build the set once from every property's settings (BuildShared).
// The property tabs stay for now. Address /Portfolio/fees-rates?tab=ota&month=YYYY-MM.
import '../portfolio.css';
import { monthOffset } from '@/lib/format.js';
import { loadProperties, friendlyError } from '@/lib/finance-data.js';
import { useSession } from '@/stores/session.js';
import { portfolioAccess } from '@/lib/portfolio-access.js';
import { loadUnitsOf, loadPoolByProperty } from '@/lib/portfolio-data.js';
import { loadSharedVersions } from '@/lib/shared-rates.js';
import MonthPicker from '@/components/MonthPicker.vue';
import RefreshButton from '@/components/RefreshButton.vue';
import RatesTab from '../Properties/tabs/RatesTab.vue';
import BuildShared from './BuildShared.vue';

const me = useSession();

export default {
  components: { MonthPicker, RefreshButton, RatesTab, BuildShared },
  data() {
    const q = this.$route.query;
    const asOf = /^\d{4}-\d{2}$/.test(q.month || '') ? q.month : monthOffset(0);
    const months = Array.from({ length: 25 }, (_, i) => monthOffset(1 - i));
    if (!months.includes(asOf)) months.push(asOf);
    return { acc: portfolioAccess(me.role, me), months, asOf, tab: q.tab === 'ota' ? 'ota' : 'rates',
      units: null, pool: null, hasShared: false, loadNo: 0, loading: false, busy: false, error: '', okMsg: '', buildOpen: false };
  },
  mounted() { if (!this.acc.viewOnly) this.go(); },
  methods: {
    syncUrl() {
      const q = new URLSearchParams();
      if (this.tab !== 'rates') q.set('tab', this.tab);
      if (this.asOf !== monthOffset(0)) q.set('month', this.asOf);
      const url = '/Portfolio/fees-rates' + (q.toString() ? `?${q}` : '');
      if (url !== location.pathname + location.search) history.replaceState(history.state, '', url);
    },
    setTab(k) { this.tab = k; this.okMsg = ''; this.syncUrl(); },
    reload() { this.okMsg = ''; this.syncUrl(); this.go(); },
    // The tab reads the shared set itself. Here: whether one exists (for the Build popup) and every unit I can see with
    // its terms for the month, for the Units here column (read after the page shows).
    async go(redrawTab = true) {
      this.loading = true; this.error = ''; this.units = null; this.pool = null;
      if (redrawTab) this.loadNo++;
      try {
        this.hasShared = (await loadSharedVersions()).length > 0;
        const properties = await loadProperties();
        this.units = await loadUnitsOf(properties, this.asOf, false);
        // Pool Sharing is set on each property (13 Nov 2026); the Fees & rates tab lists it by property, view only
        this.pool = await loadPoolByProperty(properties, this.asOf);
      } catch (e) { this.error = friendlyError(e, 'load the units'); }
      this.loading = false;
    },
    onSaved(msg) { this.okMsg = msg; this.go(false); },   // the tab reads itself again after a save
    onBuilt(msg) { this.buildOpen = false; this.okMsg = msg; this.go(); }
  }
};
</script>
