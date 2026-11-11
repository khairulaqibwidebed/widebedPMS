<template>
  <main class="content pf">
    <div class="loading-bar" v-show="loading || busy"></div>

    <div class="page-head">
      <div>
        <h1>Owners</h1>
        <div class="sub">
          <span>Portfolio › Owners · </span>
          <span>{{ acc.viewOnly ? 'who owns each unit' : 'who owns each unit and how they are paid' }}</span>
        </div>
      </div>
      <div class="head-tools">
        <OptionPicker v-model="propertyId" :options="propertyOptions" label="Property" @change="reload()" />
        <MonthPicker :ahead="1" v-model="asOf" @change="reload()" v-if="!acc.viewOnly" />
        <RefreshButton @refresh="go()" />
      </div>
    </div>

    <div class="notice error" v-show="error">{{ error }}</div>
    <div class="notice ok" v-show="okMsg">{{ okMsg }}</div>

    <OwnersList :owners="owners" :units="units" :properties="properties" :bf-lines="bfLines" :property-id="propertyId" :acc="acc" :loading="loading"
      @open="openOwner" @add="openOwner(null)" />

    <OwnerDrawer v-if="drawer" :owner="drawer.owner" :prefill="drawer.prefill" :owners="owners" :units="units" :properties="properties" :bf-lines="bfLines"
      :as-of="asOf" :property-id="propertyId" :acc="acc" @close="drawer = null" @busy="busy = $event" @saved="onSaved" />
  </main>
</template>

<script>
// Portfolio › Owners: every owner (or the owners of the property picked), with the owner drawer.
import '../portfolio.css';
import { monthOffset } from '@/lib/format.js';
import { loadProperties, friendlyError } from '@/lib/finance-data.js';
import { useSession } from '@/stores/session.js';
import { lastProperty, rememberProperty } from '@/lib/last-property.js';
import { peekHandoff, takeHandoff } from '@/lib/handoff.js';
import { portfolioAccess } from '@/lib/portfolio-access.js';
import { loadOwners, watchOwners, loadUnitsOf, loadBroughtForward } from '@/lib/portfolio-data.js';
import { liveMixin } from '@/lib/use-live.js';
import OptionPicker from '@/components/OptionPicker.vue';
import MonthPicker from '@/components/MonthPicker.vue';
import RefreshButton from '@/components/RefreshButton.vue';
import OwnersList from '../shared/OwnersList.vue';
import OwnerDrawer from '../shared/OwnerDrawer.vue';

const me = useSession();

export default {
  mixins: [liveMixin],
  components: { OptionPicker, MonthPicker, RefreshButton, OwnersList, OwnerDrawer },
  data() {
    const q = this.$route.query;
    return {
      acc: portfolioAccess(me.role),
      propertyId: q.property || lastProperty(true) || 'all', asOf: q.month || monthOffset(0),
      properties: [], owners: [], units: [], bfLines: [],
      loading: true, busy: false, error: '', okMsg: '',
      drawer: null   // { owner, prefill } while the owner drawer is open
    };
  },
  computed: {
    propertyOptions() { return [{ value: 'all', label: 'All properties' }, ...this.properties.map(p => ({ value: p.id, label: p.name }))]; }
  },
  // Remember the property for the next page (see lib/last-property.js)
  watch: { propertyId(v) { rememberProperty(v); } },
  async mounted() {
    await this.go();
    this.pickUpHandoff();
    // Live (6 Nov 2026): owners added or changed elsewhere show without a refresh (units and balances stay as loaded)
    let first = true;
    this.liveUse('owners', watchOwners(this.acc.viewOnly, this.acc.canEdit, rows => {
      if (first) { first = false; return; }   // the first answer is what go() just showed
      this.owners = rows;
    }, e => { this.error = e.friendly || friendlyError(e, 'load the owners'); }, this.owners));
  },
  methods: {
    // This page's address with the property and month (month left out when it is the current one).
    url() {
      const q = new URLSearchParams();
      if (this.propertyId !== 'all') q.set('property', this.propertyId);
      if (this.asOf !== monthOffset(0)) q.set('month', this.asOf);
      return '/Portfolio/owners' + (q.toString() ? '?' + q : '');
    },
    // Property or month picked: new address; the router opens the page again and it loads.
    reload() {
      this.okMsg = '';
      const url = this.url();
      if (url === this.$route.fullPath) this.go(); else this.$router.replace(url);
    },
    async go() {
      this.loading = true; this.error = '';
      try {
        this.properties = await loadProperties();
        if (this.propertyId !== 'all' && !this.properties.some(p => p.id === this.propertyId)) this.propertyId = 'all';
        const url = this.url();
        if (url !== location.pathname + location.search) history.replaceState(history.state, '', url);
        // Each owner's units across every property; the carried forward balances only for Accounting and Directors.
        const view = this.acc.viewOnly;
        const [owners, units, bf] = await Promise.all([
          loadOwners(view, this.acc.canEdit),
          loadUnitsOf(this.properties, this.asOf, view),
          view ? [] : loadBroughtForward(this.properties.length === 1 ? this.properties[0].id : null, this.asOf)
        ]);
        this.owners = owners; this.units = units; this.bfLines = bf;
      } catch (e) { this.error = friendlyError(e, 'load the portfolio'); }
      this.loading = false;
    },
    openOwner(own, prefill = null) {
      this.okMsg = '';
      // View-only roles open an owner only to add one (or Marketing, to edit)
      if (!own && !this.acc.canAdd) return;
      if (own && this.acc.viewOnly && !this.acc.canEdit) return;
      this.drawer = { owner: own, prefill };
    },
    // The live owners list shows the saved owner by itself; units may have changed, so read the page again
    async onSaved(msg) {
      this.drawer = null;
      this.okMsg = msg;
      await this.go();
    },
    // Create owner on a new owner listing: open the add form filled in from it (lib/handoff.js). The person checks it and saves.
    pickUpHandoff() {
      const h = peekHandoff();
      if (!h || h.kind !== 'owner' || !this.acc.canAdd || this.error) return;
      takeHandoff();
      this.openOwner(null, { fullName: h.ownerName || '', phone: h.ownerPhone || '', email: h.ownerEmail || '', fromListing: h });
    }
  }
};
</script>
