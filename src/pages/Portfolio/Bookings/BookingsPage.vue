<template>
  <main class="content pf">
    <div class="loading-bar" v-show="loading"></div>

    <div class="page-head">
      <div>
        <h1>Bookings</h1>
        <div class="sub">
          <span>Portfolio › Bookings · </span>
          <span>stays made outside eZee, such as long-term tenants</span>
        </div>
      </div>
      <div class="head-tools">
        <OptionPicker v-model="propertyId" :options="propertyOptions" label="Property" @change="reload()" />
        <MonthPicker :ahead="1" multiple all-label="All months" v-model="monthsModel" v-if="!acc.viewOnly" />
        <RefreshButton @refresh="go()" />
      </div>
    </div>

    <div class="notice error" v-show="error">{{ error }}</div>
    <div class="notice ok" v-show="okMsg">{{ okMsg }}</div>

    <section class="kpis">
      <button type="button" class="card kpi kpi-link" :class="{ on: bookingKind === 'all' }" @click="bookingKind = 'all'; toList()"><div class="label">Offline bookings</div><div class="value">{{ bookings.length }}</div><div class="hint">Made from Offline inquiries</div></button>
      <button type="button" class="card kpi kpi-link" :class="{ on: bookingKind === 'long' }" @click="bookingKind = 'long'; toList()"><div class="label">Long-term tenants</div><div class="value">{{ bookings.filter(x => x.longTerm).length }}</div><div class="hint">30 nights or more</div></button>
      <button type="button" class="card kpi kpi-link" :class="{ on: bookingKind === 'short' }" @click="bookingKind = 'short'; toList()"><div class="label">Short stays</div><div class="value">{{ bookings.filter(x => !x.longTerm).length }}</div><div class="hint">29 nights or less</div></button>
      <button type="button" class="card kpi kpi-link" :class="{ on: bookingKind === 'noEzee' }" @click="bookingKind = 'noEzee'; toList()"><div class="label">Not in eZee yet</div><div class="value" :class="{ alert: bookings.filter(x => !x.ezeeReservationNo).length }">{{ bookings.filter(x => !x.ezeeReservationNo).length }}</div><div class="hint">No eZee reservation no. linked</div></button>
    </section>
    <section class="card">
      <div class="card-head"><h2>Offline bookings</h2></div>
      <p class="card-intro">Stays made outside eZee, such as long-term tenants.</p>
      <div class="toolbar" ref="bookList">
        <input class="input" type="search" placeholder="Search booking no., unit or tenant ID" v-model="search" aria-label="Search booking">
        <span class="mm-wrap"><button type="button" class="select" @click="drOpen = !drOpen" aria-haspopup="dialog" :aria-expanded="drOpen">{{ dateLabel }}</button>
          <template v-if="drOpen"><div class="mm-back" @click="drOpen = false"></div>
            <div class="mm-pop dr-pop" role="dialog" aria-label="Stay dates">
              <label class="dr-f">Stays from<input class="input" type="date" v-model="bkFrom"></label>
              <label class="dr-f">Stays to<input class="input" type="date" v-model="bkTo"></label>
              <div class="mm-foot"><button type="button" class="link" @click="bkFrom = ''; bkTo = ''">Clear</button><button type="button" class="btn btn-primary" @click="drOpen = false">Done</button></div>
            </div></template></span>
        <span class="help" v-if="search.trim()">Searching shows every month and date.</span>
      </div>
      <Paged :items="shown" v-slot="{ pageRows }">
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Booking no.</th><th>Unit</th><th>Tenant</th><th>Check-in</th><th>Check-out</th><th>Type</th><th class="num" v-if="!acc.viewOnly">Amount (RM)</th><th v-if="!acc.viewOnly" title="Paid, part paid or unpaid for each month picked">Payment by month</th><th></th></tr></thead>
          <tbody>
            <template v-for="row in pageRows" :key="row.id">
              <tr class="clickable" @click="open = row">
                <td class="strong nw">{{ row.bookingNo || row.id }}</td>
                <td class="nw">{{ row.unitCode || row.unitId || '—' }}</td>
                <td class="nw">{{ guestName(row) }}</td>
                <td class="nw">{{ dmy(row.arrival) }}</td>
                <td class="nw">{{ dmy(row.departure) }}</td>
                <td class="nw">{{ row.longTerm ? 'Long-term lease' : 'Short stay' }}</td>
                <td class="num nw" v-if="!acc.viewOnly">{{ row.longTerm ? `${amt(row.monthlyRent)} /M` : paidOf(row) }}</td>
                <td v-if="!acc.viewOnly"><div class="mp-list"><template v-for="m in payMonths" :key="m"><span class="pill" :class="MONTH_PAY[monthStatus(row, m)].cls" v-if="monthStatus(row, m)" :title="monthPayTip(row, m)">{{ `${payMonths.length > 1 || monthSel !== null && !monthSel.length ? payTag(m) + ' · ' : ''}${MONTH_PAY[monthStatus(row, m)].label}` }}</span></template><span class="muted" v-if="!payMonths.some(m => monthStatus(row, m))">—</span></div></td>
                <td class="num"><button type="button" class="eye-btn" title="View booking" aria-label="View booking" @click.stop="open = row"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5C7 5 2.7 8.1 1 12c1.7 3.9 6 7 11 7s9.3-3.100 11-7c-1.700-3.900-6-7-11-7zm0 11.500A4.500 4.500 0 1112 7.500a4.500 4.500 0 010 9zm0-7.200a2.700 2.700 0 100 5.400 2.700 2.700 0 000-5.400z"/></svg></button></td>
              </tr>
            </template>
            <tr v-show="!shown.length"><td :colspan="9 - (acc.viewOnly ? 2 : 0)" class="muted">{{ bookingsLoading ? 'Loading offline bookings…' : search.trim() ? 'No bookings match.' : bookings.length ? 'No bookings stay in the months and dates picked. Pick All months, or clear the dates.' : 'No offline bookings yet. They are made from Offline inquiries with Create booking, or with + New booking.' }}</td></tr>
          </tbody>
        </table>
      </div>
      </Paged>
      <div class="card-foot" v-if="!acc.viewOnly"><span>Invoice and receipt PDFs are made from a booking, approved by Accounting, saved to the company Google Drive and listed on Accounting › Invoices & Receipts. Nothing is sent automatically.</span></div>
    </section>

    <BookingDrawer v-if="open" :key="open.id" :booking="open" :acc="acc" @close="open = null" @saved="onSaved" />
  </main>
</template>

<script>
// Portfolio › Bookings: offline bookings (stays made outside eZee), for every property or the one picked, with
// the month payment status of each and the booking drawer.
import '../portfolio.css';
import { amt, dmy, monthName, monthOffset } from '@/lib/format.js';
import { loadProperties, friendlyError } from '@/lib/finance-data.js';
import { useSession } from '@/stores/session.js';
import { lastProperty, rememberProperty } from '@/lib/last-property.js';
import { portfolioAccess } from '@/lib/portfolio-access.js';
import { MONTH_PAY, shortName, loadOfflineBookings, loadGuestName } from '@/lib/portfolio-data.js';
import OptionPicker from '@/components/OptionPicker.vue';
import MonthPicker from '@/components/MonthPicker.vue';
import RefreshButton from '@/components/RefreshButton.vue';
import BookingDrawer from './BookingDrawer.vue';

const me = useSession();

export default {
  components: { OptionPicker, MonthPicker, RefreshButton, BookingDrawer },
  data() {
    const q = this.$route.query;
    return {
      MONTH_PAY, acc: portfolioAccess(me.role),
      propertyId: q.property || lastProperty(true) || 'all', asOf: q.month || monthOffset(0),
      properties: [], bookings: [], paid: null, pays: null, names: {}, asked: new Set(),
      loading: true, bookingsLoading: false, error: '', okMsg: '',
      search: '', bookingKind: 'all', monthSel: null, bkFrom: '', bkTo: '', drOpen: false,
      open: null   // the booking open in the drawer
    };
  },
  computed: {
    propertyOptions() { return [{ value: 'all', label: 'All properties' }, ...this.properties.map(p => ({ value: p.id, label: p.name }))]; },
    // The month picker: several months (none ticked = every month). Left alone it follows the month in the address.
    monthsModel: { get() { return this.selMonths; }, set(v) { this.monthSel = v; } },
    selMonths() { return this.monthSel === null ? [this.asOf] : this.monthSel; },
    payMonths() { const s = this.selMonths; return s.length ? [...s].sort() : [this.asOf]; },
    dateLabel() { return !this.bkFrom && !this.bkTo ? 'Any dates' : `${this.bkFrom ? dmy(this.bkFrom) : 'Start'} to ${this.bkTo ? dmy(this.bkTo) : 'any'}`; },
    // Typing in the search box ignores the month and date filters, so a unit search shows all of its bookings.
    shown() {
      const q = this.search.trim().toLowerCase();
      const k = this.bookingKind;
      return this.bookings.filter(x => (q || this.inPicked(x)) && (k === 'all' || (k === 'long' && x.longTerm) || (k === 'short' && !x.longTerm) || (k === 'noEzee' && !x.ezeeReservationNo))
        && (!q || [x.id, x.unitCode, x.tenantId, x.ezeeReservationNo].some(v => (v || '').toLowerCase().includes(q))));
    }
  },
  // Remember the property for the next page (see lib/last-property.js)
  watch: { propertyId(v) { rememberProperty(v); } },
  created() {
    // A direct booking saved on Offline inquiries comes back here with its message.
    if (history.state?.okMsg) {
      this.okMsg = history.state.okMsg;
      history.replaceState({ ...history.state, okMsg: undefined }, '');
    }
  },
  mounted() { this.go(); },
  methods: {
    amt, dmy,
    url() {
      const q = new URLSearchParams();
      if (this.propertyId !== 'all') q.set('property', this.propertyId);
      if (this.asOf !== monthOffset(0)) q.set('month', this.asOf);
      return '/Portfolio/bookings' + (q.toString() ? '?' + q : '');
    },
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
        this.bookingsLoading = true;
        try {
          const r = await loadOfflineBookings(this.propertyId);
          this.bookings = r.bookings; this.paid = r.paid; this.pays = r.pays;
        } catch (e) { this.error = friendlyError(e, 'load the offline bookings'); }
        this.bookingsLoading = false;
      } catch (e) { this.error = friendlyError(e, 'load the portfolio'); }
      this.loading = false;
    },
    // Summary cards: scroll to the list they filter.
    toList() { this.$nextTick(() => this.$refs.bookList?.scrollIntoView({ behavior: 'smooth', block: 'start' })); },
    // The Tenant column shows the guest's name (private data, so only Accounting, Directors and Operations load it), else the tenant id
    guestName(r) {
      if (this.names[r.id]) return this.names[r.id];
      if (this.acc.guestNames && !this.asked.has(r.id)) {
        this.asked.add(r.id);
        queueMicrotask(async () => { const n = await loadGuestName(r); if (n) this.names = { ...this.names, [r.id]: n }; });
      }
      return r.tenantId || '—';
    },
    paidOf(r) {
      if (this.paid && r.id in this.paid) return amt(this.paid[r.id]);
      return r.amount ? amt(r.amount) : '—';   // older bookings made before payments moved to Offline Payments
    },
    // A stay counts in a month when it overlaps it.
    stays(b, m) { return (b.arrival || '') <= m + '-31' && (b.departure || '9999') >= m + '-01'; },
    // 'Nov' when one month is shown, 'Nov 26' once the picked months span years
    payTag(m) { const y = new Set(this.payMonths.map(x => x.slice(0, 4))).size > 1; return y ? `${shortName(m).split(' ')[0]} ${m.slice(2, 4)}` : shortName(m).split(' ')[0]; },
    // Paid, part paid or unpaid for one month. Long-term: that month's rent against payments dated in the month.
    // Short stay: the whole rental against everything paid. null = not in that month, or no access to payments.
    monthStatus(b, m) {
      if (!this.pays || !this.stays(b, m)) return null;
      const paid = this.paidIn(b, m), due = b.longTerm ? Number(b.monthlyRent) || 0 : Number(b.rental) || 0;
      if (due > 0) return paid >= due - 0.005 ? 'paid' : paid > 0 ? 'part' : 'unpaid';
      return paid > 0 ? 'paid' : 'unpaid';
    },
    paidIn(b, m) { const list = this.pays?.[b.id] || []; return (b.longTerm ? list.filter(x => (x.date || '').slice(0, 7) === m) : list).reduce((s, x) => s + x.amount, 0); },
    monthPayTip(b, m) {
      const due = b.longTerm ? Number(b.monthlyRent) || 0 : Number(b.rental) || 0;
      return `${monthName(m)}: paid RM ${amt(this.paidIn(b, m))}${due > 0 ? ` of RM ${amt(due)}` : ''}${b.longTerm ? ' (payments dated in this month)' : ''}`;
    },
    inPicked(x) {
      const sel = this.selMonths;
      if (sel.length && !sel.some(m => this.stays(x, m))) return false;
      if (this.bkFrom && (x.departure || '9999') < this.bkFrom) return false;
      if (this.bkTo && (x.arrival || '') > this.bkTo) return false;
      return true;
    },
    // Saved in the drawer: update that row only (no reload).
    onSaved(main) {
      const i = this.bookings.findIndex(x => x.id === this.open.id);
      if (i >= 0) this.bookings.splice(i, 1, { ...this.bookings[i], ...main });
      this.open = null;
    }
  }
};
</script>
