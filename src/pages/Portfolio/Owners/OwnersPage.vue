<template>
  <main class="content pf">
    <div class="loading-bar" v-show="loading || busy"></div>

    <div class="page-head">
      <div>
        <h1>Owners</h1>
        <div class="sub">
          <span>Portfolio › Owners · </span>
          <span>{{ acc.ownerFull && !acc.viewOnly ? 'who owns each unit and how they are paid' : 'who owns each unit' }}</span>
        </div>
      </div>
      <div class="head-tools">
        <PropertyPicker v-model="propertyId" :properties="properties" :before="[{ value: 'all', label: 'All properties' }]" @change="reload()" />
        <MonthPicker :ahead="1" v-model="asOf" @change="reload()" v-if="!acc.viewOnly" />
        <RefreshButton @refresh="go()" />
        <!-- 16 Nov 2026: one-off for Directors, so Owners Base can read names and contact (private/contact) -->
        <button class="btn" v-if="acc.isDirector && splitTodo" @click="splitContacts()" :disabled="busy" title="Copies names and contact details (owners, tenants, booking guests) into the part Owners Base and the AI Agent can read. IC, passport, address and bank details stay where they are.">Set up contact details</button>
      </div>
    </div>


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
import { loadOwners, watchOwners, loadUnitsOf, loadBroughtForward, contactSplitDone, copyContacts } from '@/lib/portfolio-data.js';
import { askConfirm } from '@/lib/confirm.js';
import { liveMixin } from '@/lib/use-live.js';
import OptionPicker from '@/components/OptionPicker.vue';
import PropertyPicker from '@/components/PropertyPicker.vue';
import MonthPicker from '@/components/MonthPicker.vue';
import RefreshButton from '@/components/RefreshButton.vue';
import OwnersList from '../shared/OwnersList.vue';
import OwnerDrawer from '../shared/OwnerDrawer.vue';

const me = useSession();

export default {
  mixins: [liveMixin],
  components: { PropertyPicker, OptionPicker, MonthPicker, RefreshButton, OwnersList, OwnerDrawer },
  data() {
    const q = this.$route.query;
    return {
      acc: portfolioAccess(me.role, me),
      propertyId: q.property || lastProperty(true) || 'all', asOf: q.month || monthOffset(0),
      properties: [], owners: [], units: [], bfLines: [],
      loading: true, busy: false, error: '', okMsg: '',
      drawer: null,   // { owner, prefill } while the owner drawer is open
      splitTodo: false   // Directors: owner contact details not yet copied for Owners Base (copyOwnerContacts)
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
    if (this.acc.isDirector) this.splitTodo = !(await contactSplitDone());
    // Live (6 Nov 2026): owners added or changed elsewhere show without a refresh (units and balances stay as loaded)
    let first = true;
    this.liveUse('owners', watchOwners(this.acc.viewOnly, this.acc.ownerNames, rows => {
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
          loadOwners(view, this.acc.ownerNames),
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
      // Owners Base open an owner read-only (names and contact); no Owners access, nothing to open
      if (own && this.acc.ownerLevel === 'none') return;
      this.drawer = { owner: own, prefill };
    },
    // The live owners list shows the saved owner by itself; units may have changed, so read the page again
    async onSaved(msg) {
      this.drawer = null;
      this.okMsg = msg;
      await this.go();
    },
    // One-off (Directors): copy owners', tenants' and booking guests' names and contact into private/contact
    async splitContacts() {
      if (!await askConfirm({ title: 'Set up contact details?', message: "Copies each owner's name, email, phone, WhatsApp and WeChat, and each tenant's and offline booking guest's name, phone and email, into the part that Owners Base and the AI Agent can read. IC, passport, date of birth, address, bank details and door passcodes stay where they are. Nothing is deleted. Run it once, after the new security rules are published.", confirmText: 'Copy contact details' })) return;
      this.busy = true; this.error = ''; this.okMsg = '';
      try {
        const n = await copyContacts(me);
        this.splitTodo = false;
        this.okMsg = `Contact details set up: ${n.owners} owners, ${n.tenants} tenants, ${n.offlineBookings} bookings.`;
        await this.go();
      } catch (e) { this.error = friendlyError(e, 'copy the owner contact details'); }
      this.busy = false;
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
