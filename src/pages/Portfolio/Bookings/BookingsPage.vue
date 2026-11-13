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
        <PropertyPicker v-model="propertyId" :properties="properties" :before="[{ value: 'all', label: 'All properties' }]" @change="reload()" />
        <MonthPicker :ahead="1" multiple all-label="All months" v-model="monthsModel" v-if="!acc.viewOnly" />
        <RefreshButton v-if="propertyId === 'all'" @refresh="go()" />
        <LiveStatus v-else :status="liveStatus.bookings?.status || 'live'" />
      </div>
    </div>

    <div class="notice error" v-show="error">{{ error }}</div>
    <div class="notice ok" v-show="okMsg">{{ okMsg }}</div>

    <section class="kpis">
      <button type="button" class="card kpi kpi-link" :class="{ on: bookingKind === 'all' }" @click="bookingKind = 'all'; toList()"><div class="label">Offline bookings</div><div class="value">{{ active.length }}</div><div class="hint">Made from Tenant leads</div></button>
      <button type="button" class="card kpi kpi-link" :class="{ on: bookingKind === 'long' }" @click="bookingKind = 'long'; toList()"><div class="label">Long-term tenants</div><div class="value">{{ active.filter(x => x.longTerm).length }}</div><div class="hint">30 nights or more</div></button>
      <button type="button" class="card kpi kpi-link" :class="{ on: bookingKind === 'short' }" @click="bookingKind = 'short'; toList()"><div class="label">Short stays</div><div class="value">{{ active.filter(x => !x.longTerm).length }}</div><div class="hint">29 nights or less</div></button>
      <button type="button" class="card kpi kpi-link" :class="{ on: bookingKind === 'noEzee' }" @click="bookingKind = 'noEzee'; toList()"><div class="label">Not in eZee yet</div><div class="value" :class="{ alert: active.filter(x => !x.ezeeReservationNo).length }">{{ active.filter(x => !x.ezeeReservationNo).length }}</div><div class="hint">No eZee reservation no. linked</div></button>
    </section>
    <section class="card">
      <div class="card-head"><h2>Offline bookings</h2>
        <!-- 13 Nov 2026: cards (one full-width card per booking, as a list) or the table; the choice is remembered on this browser -->
        <div class="seg view-seg" role="radiogroup" aria-label="Show bookings as">
          <button type="button" role="radio" :aria-checked="view === 'table'" :class="{ on: view === 'table' }" @click="setView('table')">Table</button>
          <button type="button" role="radio" :aria-checked="view === 'cards'" :class="{ on: view === 'cards' }" @click="setView('cards')">Cards</button>
        </div></div>
      <p class="card-intro">Stays made outside eZee, such as long-term tenants.</p>
      <div class="toolbar" ref="bookList">
        <input class="input" type="search" placeholder="Search booking no., unit, tenant name or ID" v-model="search" aria-label="Search booking">
        <span class="mm-wrap"><button type="button" class="select" @click="drOpen = !drOpen" aria-haspopup="dialog" :aria-expanded="drOpen">{{ dateLabel }}</button>
          <template v-if="drOpen"><div class="mm-back" @click="drOpen = false"></div>
            <div class="mm-pop dr-pop" role="dialog" aria-label="Stay dates">
              <label class="dr-f">Stays from<input class="input" type="date" v-model="bkFrom"></label>
              <label class="dr-f">Stays to<input class="input" type="date" v-model="bkTo"></label>
              <div class="mm-foot"><button type="button" class="link" @click="bkFrom = ''; bkTo = ''">Clear</button><button type="button" class="btn btn-primary" @click="drOpen = false">Done</button></div>
            </div></template></span>
        <button type="button" class="btn" :class="{ 'btn-primary': bookingKind === 'cancelled' }" v-if="cancelledCount || bookingKind === 'cancelled'" @click="bookingKind = bookingKind === 'cancelled' ? 'all' : 'cancelled'">{{ bookingKind === 'cancelled' ? 'Back to active bookings' : `Cancelled (${cancelledCount})` }}</button>
        <span class="help" v-if="search.trim()">Searching shows every month and date.</span>
        <!-- 6 Nov 2026: a new booking opens the Reservation Lodgment Form (Booking Forms tick), right-aligned like + Add owner -->
        <RouterLink class="btn btn-primary new-bk" style="margin-left:auto" v-if="canForms" to="/Operations/booking-forms/reservation" title="Opens the Reservation Lodgment Form">+ New booking</RouterLink>
      </div>
      <Paged :items="shown" v-slot="{ pageRows }">
      <div class="bk-list" v-if="view === 'cards'">
        <div class="bk-card" :class="{ cancelled: row.status === 'cancelled' }" v-for="row in pageRows" :key="row.id" role="button" tabindex="0"
          @click="open = row" @keydown.enter.prevent="open = row" @keydown.space.prevent="open = row" :aria-label="`Open booking ${row.bookingNo || row.id}`">
          <!-- 13 Nov 2026 hierarchy (same as Offline Payments cards): who, then where, then the stay, then the small print; money and payment status on the right -->
          <div class="bk-main">
            <div class="bk-name">{{ guestName(row) }}</div>
            <div class="bk-place"><span>{{ [row.propertyName, row.unitCode || row.unitId].filter(Boolean).join(' · ') || 'No unit' }}</span>
              <span class="pill red" v-if="row.status === 'cancelled'">Cancelled</span>
              <span class="pill amber" v-else-if="!row.ezeeReservationNo" title="No eZee reservation no. linked">Not in eZee</span></div>
            <div class="bk-stay"><span class="bk-k">Stay</span>{{ `${niceDate(row.arrival) || '—'} to ${niceDate(row.departure) || '—'}` }}</div>
            <div class="bk-meta">{{ [row.longTerm ? 'Long-term lease' : 'Short stay', nights(row) ? `${nights(row)} ${nights(row) === 1 ? 'night' : 'nights'}` : '', row.ezeeReservationNo ? `eZee ${row.ezeeReservationNo}` : ''].filter(Boolean).join(' · ') }}</div>
          </div>
          <div class="bk-side" v-if="!acc.viewOnly">
            <b class="bk-amt">{{ row.longTerm ? `RM ${amt(row.monthlyRent)}` : (paidOf(row) === '—' ? '—' : `RM ${paidOf(row)}`) }}<small>{{ row.longTerm ? ' /month' : ' paid' }}</small></b>
            <div class="mp-list"><template v-for="m in payMonths" :key="m"><span class="pill" :class="MONTH_PAY[monthStatus(row, m)].cls" v-if="monthStatus(row, m)" :title="monthPayTip(row, m)">{{ `${payMonths.length > 1 || monthSel !== null && !monthSel.length ? payTag(m) + ' · ' : ''}${MONTH_PAY[monthStatus(row, m)].label}` }}</span></template></div>
          </div>
          <span v-else></span>
          <button type="button" class="eye-btn" title="View booking" aria-label="View booking" @click.stop="open = row"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5C7 5 2.7 8.1 1 12c1.7 3.9 6 7 11 7s9.3-3.100 11-7c-1.700-3.900-6-7-11-7zm0 11.500A4.500 4.500 0 1112 7.500a4.500 4.500 0 010 9zm0-7.200a2.700 2.700 0 100 5.400 2.700 2.700 0 000-5.400z"/></svg></button>
        </div>
        <p class="muted bk-empty" v-show="!shown.length">{{ emptyMsg }}</p>
      </div>
      <div class="table-wrap" v-else>
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
                <td class="nw">{{ row.longTerm ? 'Long-term lease' : 'Short stay' }} <span class="pill red" v-if="row.status === 'cancelled'">Cancelled</span></td>
                <td class="num nw" v-if="!acc.viewOnly">{{ row.longTerm ? `${amt(row.monthlyRent)} /M` : paidOf(row) }}</td>
                <td v-if="!acc.viewOnly"><div class="mp-list"><template v-for="m in payMonths" :key="m"><span class="pill" :class="MONTH_PAY[monthStatus(row, m)].cls" v-if="monthStatus(row, m)" :title="monthPayTip(row, m)">{{ `${payMonths.length > 1 || monthSel !== null && !monthSel.length ? payTag(m) + ' · ' : ''}${MONTH_PAY[monthStatus(row, m)].label}` }}</span></template><span class="muted" v-if="!payMonths.some(m => monthStatus(row, m))">—</span></div></td>
                <td class="num"><button type="button" class="eye-btn" title="View booking" aria-label="View booking" @click.stop="open = row"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5C7 5 2.7 8.1 1 12c1.7 3.9 6 7 11 7s9.3-3.100 11-7c-1.700-3.900-6-7-11-7zm0 11.500A4.500 4.500 0 1112 7.500a4.500 4.500 0 010 9zm0-7.200a2.700 2.700 0 100 5.400 2.700 2.700 0 000-5.400z"/></svg></button></td>
              </tr>
            </template>
            <tr v-show="!shown.length"><td :colspan="9 - (acc.viewOnly ? 2 : 0)" class="muted">{{ emptyMsg }}</td></tr>
          </tbody>
        </table>
      </div>
      </Paged>
      <div class="card-foot" v-if="!acc.viewOnly"><span>Invoice and receipt PDFs are made from a booking, approved by Accounting, saved to the company Google Drive and listed on Accounting › Invoices & Receipts. Nothing is sent automatically.</span></div>
    </section>

    <BookingDrawer v-if="open" :key="open.id" :booking="open" :acc="acc" @close="open = null" @saved="onSaved" @deleted="onDeleted" />
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
import { can } from '@/lib/access.js';
import { MONTH_PAY, shortName, loadOfflineBookings, watchOfflineBookings, loadGuestName } from '@/lib/portfolio-data.js';
import { liveMixin } from '@/lib/use-live.js';
import LiveStatus from '@/components/LiveStatus.vue';
import OptionPicker from '@/components/OptionPicker.vue';
import PropertyPicker from '@/components/PropertyPicker.vue';
import MonthPicker from '@/components/MonthPicker.vue';
import RefreshButton from '@/components/RefreshButton.vue';
import BookingDrawer from './BookingDrawer.vue';

const me = useSession();
// Cards or table, remembered on this browser only (table when nothing is saved)
const VIEW_KEY = 'bookings:view';
const savedView = () => { try { return localStorage.getItem(VIEW_KEY) === 'cards' ? 'cards' : 'table'; } catch { return 'table'; } };

export default {
  mixins: [liveMixin],
  components: { PropertyPicker, OptionPicker, MonthPicker, RefreshButton, BookingDrawer, LiveStatus },
  data() {
    const q = this.$route.query;
    return {
      MONTH_PAY, acc: portfolioAccess(me.role, me), canForms: can(me, 'bookingForms.view'),
      // ?id=offline_BK-0001 (the link after a Reservation form is saved) opens that booking once the list is loaded
      openId: q.id || '',
      propertyId: q.property || lastProperty(true) || 'all', asOf: q.month || monthOffset(0),
      properties: [], bookings: [], paid: null, pays: null, names: {}, asked: new Set(),
      loading: true, bookingsLoading: false, error: '', okMsg: '',
      search: '', bookingKind: 'all', monthSel: null, bkFrom: '', bkTo: '', drOpen: false,
      open: null,   // the booking open in the drawer
      view: savedView()   // 'cards' or 'table'
    };
  },
  computed: {
    emptyMsg() {
      return this.bookingsLoading ? 'Loading offline bookings…' : this.search.trim() ? 'No bookings match.' : this.bookings.length ? 'No bookings stay in the months and dates picked. Pick All months, or clear the dates.'
        : 'No offline bookings yet. They are made from Tenant leads with Create booking, or with + New booking.';
    },
    // Cancelled bookings are kept but left out of the counts and the list (the Cancelled button shows them)
    active() { return this.bookings.filter(x => x.status !== 'cancelled'); },
    cancelledCount() { return this.bookings.length - this.active.length; },
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
      const list = k === 'cancelled' ? this.bookings.filter(x => x.status === 'cancelled') : this.active;
      return list.filter(x => (q || this.inPicked(x)) && (k === 'all' || k === 'cancelled' || (k === 'long' && x.longTerm) || (k === 'short' && !x.longTerm) || (k === 'noEzee' && !x.ezeeReservationNo))
        && (!q || [x.id, x.unitCode, x.tenantId, x.ezeeReservationNo, this.names[x.id]].some(v => (v || '').toLowerCase().includes(q))));
    }
  },
  // Remember the property for the next page (see lib/last-property.js)
  watch: {
    propertyId(v) { rememberProperty(v); },
    // A name search needs every booking's tenant name, not just the rows on screen: fetch the missing ones once.
    search(v) { if (v.trim()) this.loadAllNames(); },
    bookings() { if (this.search.trim()) this.loadAllNames(); }
  },
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
    setView(v) { this.view = v; try { localStorage.setItem(VIEW_KEY, v); } catch { /* not remembered */ } },
    niceDate(d) { if (!d) return ''; const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']; return `${+d.slice(8, 10)} ${M[+d.slice(5, 7) - 1] || ''} ${d.slice(0, 4)}`; },
    nights(r) { if (!r.arrival || !r.departure) return 0; const n = Math.round((new Date(r.departure) - new Date(r.arrival)) / 864e5); return n > 0 ? n : 0; },
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
        this.stopLive('bookings');
        const show = r => {
          // Keep the same objects for bookings already shown, so an open booking updates in place
          const old = new Map(this.bookings.map(b => [b.id, b]));
          this.bookings = r.bookings.map(b => { const o = old.get(b.id); return o ? Object.assign(o, b) : b; });
          this.paid = r.paid; this.pays = r.pays;
          if (this.openId) { this.open = this.bookings.find(x => x.id === this.openId) || null; this.openId = ''; }
          this.bookingsLoading = false;
        };
        if (this.propertyId === 'all') {
          // All properties: read once (refresh button), too many bookings to keep live
          try { show(await loadOfflineBookings('all')); } catch (e) { this.error = friendlyError(e, 'load the offline bookings'); this.bookingsLoading = false; }
        } else {
          // One property: live (6 Nov 2026), a booking or payment added or changed elsewhere shows without a refresh
          const pid = this.propertyId;
          await new Promise(resolve => {
            this.liveUse('bookings', watchOfflineBookings(pid, r => { if (pid === this.propertyId) show(r); resolve(); },
              e => { this.error = friendlyError(e, 'load the offline bookings'); this.bookingsLoading = false; resolve(); }));
          });
        }
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
    async loadAllNames() {
      if (!this.acc.guestNames) return;
      const todo = this.bookings.filter(r => !this.names[r.id] && !this.asked.has(r.id));
      if (!todo.length) return;
      todo.forEach(r => this.asked.add(r.id));
      const got = await Promise.all(todo.map(r => loadGuestName(r)));
      const add = {}; todo.forEach((r, i) => { if (got[i]) add[r.id] = got[i]; });
      this.names = { ...this.names, ...add };
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
    },
    // Deleted for good in the drawer: drop the row.
    onDeleted() {
      this.bookings = this.bookings.filter(x => x.id !== this.open.id);
      this.open = null;
    }
  }
};
</script>

<style scoped>
.card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.view-seg { margin: 0; width: 180px; }
.bk-list { display: flex; flex-direction: column; gap: 10px; margin-top: 4px; }
.bk-card { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 20px;
  border: 1px solid var(--border); border-radius: 12px; padding: 14px 18px; cursor: pointer; background: var(--surface); transition: border-color var(--fast), box-shadow var(--fast); }
.bk-card:hover, .bk-card:focus-visible { border-color: var(--accent); box-shadow: 0 2px 8px rgba(0, 0, 0, .06); outline: none; }
.bk-card.cancelled { opacity: .7; }
/* Level 1: tenant and amount. Level 2: booking no. and place. Level 3: stay dates. Level 4: type, nights, eZee no. */
.bk-main { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.bk-name { font-size: 16px; font-weight: 700; color: var(--text); line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bk-place { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 13px; font-weight: 500; color: var(--text-2); }
.bk-stay { font-size: 13px; color: var(--text); margin-top: 2px; }
.bk-k { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); margin-right: 6px; }
.bk-meta { font-size: 12px; color: var(--muted); margin-top: 2px; }
.bk-side { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
.bk-amt { font-size: 18px; font-weight: 700; color: var(--text); white-space: nowrap; font-variant-numeric: tabular-nums; }
.bk-amt small { font-size: 12px; font-weight: 500; color: var(--muted); }
.bk-side .mp-list { justify-content: flex-end; }
.bk-empty { padding: 12px 4px; }
@media (max-width: 640px) {
  .bk-card { grid-template-columns: minmax(0, 1fr) auto; gap: 12px; }
  .bk-card .eye-btn { grid-column: 1 / -1; justify-self: start; }
}
</style>
