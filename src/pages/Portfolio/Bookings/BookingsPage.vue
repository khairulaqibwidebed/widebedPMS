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
        <!-- 20 Nov 2026: months up to 5 years ahead can be picked, so future leases (e.g. a Yearly Rental from Feb 2027) can be found -->
        <MonthPicker :ahead="60" multiple all-label="All months" v-model="monthsModel" v-if="acc.bkView" />
        <RefreshButton v-if="propertyId === 'all'" @refresh="go()" />
        <LiveStatus v-else :status="liveStatus.bookings?.status || 'live'" />
      </div>
    </div>


    <section class="kpis kpis-5">
      <button type="button" class="card kpi kpi-link" :class="{ on: bookingKind === 'all' }" @click="bookingKind = 'all'; toList()"><div class="label">Offline bookings</div><div class="value">{{ inView.length }}</div><div class="hint">Made from Tenant leads</div></button>
      <!-- 19 Nov 2026 (Khairul): three lease terms by nights (lib/lease-term.js) -->
      <button type="button" class="card kpi kpi-link" :class="{ on: bookingKind === 'long' }" @click="bookingKind = 'long'; toList()"><div class="label">Yearly Lease</div><div class="value">{{ inView.filter(x => termOfRow(x) === 'long').length }}</div><div class="hint">365 nights or more</div></button>
      <button type="button" class="card kpi kpi-link" :class="{ on: bookingKind === 'monthly' }" @click="bookingKind = 'monthly'; toList()"><div class="label">Monthly Lease</div><div class="value">{{ inView.filter(x => termOfRow(x) === 'monthly').length }}</div><div class="hint">30 to 364 nights</div></button>
      <button type="button" class="card kpi kpi-link" :class="{ on: bookingKind === 'short' }" @click="bookingKind = 'short'; toList()"><div class="label">Daily Lease</div><div class="value">{{ inView.filter(x => termOfRow(x) === 'short').length }}</div><div class="hint">29 nights or less</div></button>
      <button type="button" class="card kpi kpi-link" :class="{ on: bookingKind === 'noEzee' }" @click="bookingKind = 'noEzee'; toList()"><div class="label">Not in eZee yet</div><div class="value" :class="{ alert: notInEzee }">{{ notInEzee }}</div><div class="hint">No eZee reservation no. linked</div></button>
    </section>
    <section class="card list-card">
      <div class="card-head"><h2>Offline bookings</h2>
        <!-- 20 Nov 2026 (Khairul): + New booking and the gear sit together at the top right -->
        <div class="head-acts">
        <RouterLink class="btn btn-primary new-bk" v-if="canForms" to="/Portfolio/bookings/new" title="Opens the Reservation Lodgment Form">+ New booking</RouterLink>
        <!-- 20 Nov 2026 (Khairul): a gear Settings menu holds the list's view (Table or Cards) and rows per page; both are remembered on this browser -->
        <span class="mm-wrap set-wrap"><button type="button" class="btn icon-btn" @click="setOpen = !setOpen" aria-haspopup="dialog" :aria-expanded="setOpen" title="List settings" aria-label="List settings">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></button>
          <template v-if="setOpen"><div class="mm-back" @click="setOpen = false"></div>
            <div class="mm-pop set-pop" role="dialog" aria-label="List settings">
              <div class="flt-h">View</div>
              <div class="seg slide view-seg" role="radiogroup" aria-label="Show bookings as">
                <button type="button" role="radio" :aria-checked="view === 'table'" :class="{ on: view === 'table' }" @click="setView('table')">Table</button>
                <button type="button" role="radio" :aria-checked="view === 'cards'" :class="{ on: view === 'cards' }" @click="setView('cards')">Cards</button>
              </div>
              <div class="flt-h">Rows per page</div>
              <div class="seg slide view-seg" role="radiogroup" aria-label="Rows per page">
                <button type="button" role="radio" v-for="n in [10, 25, 50]" :key="n" :aria-checked="pageSize === n" :class="{ on: pageSize === n }" @click="setPageSize(n)">{{ n }}</button>
              </div>
              <!-- 20 Nov 2026 (Khairul): booking form settings, placeholders only; the functions come later (ToDo.md) -->
              <div class="flt-h">Booking form</div>
              <button type="button" class="flt-opt" disabled v-for="t in ['T&C defaults', 'Booking sources', 'Other fees on/off']" :key="t"><span>{{ t }}</span><span class="soon">Coming soon</span></button>
            </div></template></span></div></div>
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
        <!-- 20 Nov 2026 (Khairul): one Filters drop-down holds the list filters (lease type, eZee, awaiting payment, cancelled, terminated early) -->
        <span class="mm-wrap"><button type="button" class="select flt-btn" :class="{ on: bookingKind !== 'all' }" @click="fltOpen = !fltOpen" aria-haspopup="menu" :aria-expanded="fltOpen" title="Filter bookings">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/></svg>
            {{ bookingKind === 'all' ? 'Filters' : kindLabel }}</button>
          <template v-if="fltOpen"><div class="mm-back" @click="fltOpen = false"></div>
            <div class="mm-pop flt-pop" role="menu" aria-label="Filter bookings">
              <template v-for="g in kindGroups" :key="g.title">
                <div class="flt-h">{{ g.title }}</div>
                <button type="button" role="menuitemradio" class="flt-opt" v-for="o in g.opts" :key="o.k" :aria-checked="bookingKind === o.k" :class="{ on: bookingKind === o.k }" @click="bookingKind = o.k; fltOpen = false">
                  <span>{{ o.label }}</span><span class="flt-n">{{ o.n }}</span></button>
              </template>
            </div></template></span>
      </div>
      <Paged :items="shown" :size="pageSize" v-slot="{ pageRows }">
      <div class="bk-list" v-if="view === 'cards'">
        <div class="bk-card" :class="{ cancelled: row.status === 'cancelled' }" v-for="row in pageRows" :key="row.id" role="button" tabindex="0"
          @click="open = row" @keydown.enter.prevent="open = row" @keydown.space.prevent="open = row" :aria-label="`Open booking ${row.bookingNo || row.id}`">
          <!-- 13 Nov 2026 hierarchy (same as Offline Payments cards): who, then where, then the stay, then the small print; money and payment status on the right -->
          <div class="bk-main">
            <!-- 20 Nov 2026 (Khairul): two-line cards. Left = who + booking no., then where + status; middle = stay + lease type; right = rate, then payment -->
            <div class="bk-name">{{ guestName(row) }} <span class="bk-no">{{ row.bookingNo || row.id }}</span></div>
            <div class="bk-place"><span>{{ [row.propertyName, row.unitCode || row.unitId].filter(Boolean).join(' · ') || 'No unit' }}</span>
              <span class="pill red" v-if="row.status === 'cancelled'">Cancelled</span>
              <span class="pill amber" v-else-if="row.status === 'pending'" title="Saved before payment; open it to download the invoice or finish it">Awaiting payment</span>
              <span class="pill amber" v-else-if="row.earlyTermination?.date" :title="`Check-out was ${dmy(row.earlyTermination.originalDeparture)}`">Terminated early</span>
              <span class="pill amber" v-else-if="!row.ezeeReservationNo" title="No eZee reservation no. linked">Not in eZee</span></div>
          </div>
          <div class="bk-mid">
            <div class="bk-stay"><span class="bk-k">Stay</span>{{ `${niceDate(row.arrival) || '—'} to ${niceDate(row.departure) || '—'}` }}</div>
            <div class="bk-meta">{{ [leaseLabel(bookingNights(row)), nights(row) ? `${nights(row)} ${nights(row) === 1 ? 'night' : 'nights'}` : '', row.ezeeReservationNo ? `eZee ${row.ezeeReservationNo}` : ''].filter(Boolean).join(' · ') }}</div>
          </div>
          <div class="bk-side" v-if="acc.bkView">
            <b class="bk-amt">{{ rateOf(row) ? `RM ${amt(rateOf(row))}` : '—' }}<small>{{ row.longTerm ? ' /month' : ' total' }}</small></b>
            <div class="mp-list" v-if="row.status !== 'pending' && row.status !== 'cancelled'"><template v-for="m in payMonths" :key="m"><span class="pill" :class="MONTH_PAY[monthStatus(row, m)].cls" v-if="monthStatus(row, m)" :title="monthPayTip(row, m)">{{ `${payMonths.length > 1 || monthSel !== null && !monthSel.length || wholeYear ? payTag(m) + ' · ' : ''}${MONTH_PAY[monthStatus(row, m)].label}` }}</span></template></div>
          </div>
          <span v-else></span>
          <button type="button" class="eye-btn" title="View booking" aria-label="View booking" @click.stop="open = row"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5C7 5 2.7 8.1 1 12c1.7 3.9 6 7 11 7s9.3-3.100 11-7c-1.700-3.900-6-7-11-7zm0 11.500A4.500 4.500 0 1112 7.500a4.500 4.500 0 010 9zm0-7.200a2.700 2.700 0 100 5.400 2.700 2.700 0 000-5.400z"/></svg></button>
        </div>
        <p class="muted bk-empty" v-show="!shown.length">{{ emptyMsg }}</p>
      </div>
      <div class="table-wrap" v-else>
        <table class="table">
          <thead><tr><th>Booking no.</th><th>Unit</th><th>Tenant</th><th>Check-in</th><th>Check-out</th><th>Type</th><th class="num" v-if="acc.bkView">Amount (RM)</th><th v-if="acc.bkView" title="Paid, part paid or unpaid for each month picked">Payment by month</th><th></th></tr></thead>
          <tbody>
            <template v-for="row in pageRows" :key="row.id">
              <tr class="clickable" @click="open = row">
                <td class="strong nw">{{ row.bookingNo || row.id }}</td>
                <td class="nw">{{ row.unitCode || row.unitId || '—' }}</td>
                <td class="nw">{{ guestName(row) }}</td>
                <td class="nw">{{ dmy(row.arrival) }}</td>
                <td class="nw">{{ dmy(row.departure) }}</td>
                <td class="nw">{{ leaseLabel(bookingNights(row)) }} <span class="pill red" v-if="row.status === 'cancelled'">Cancelled</span><span class="pill amber" v-else-if="row.status === 'pending'">Awaiting payment</span><span class="pill amber" v-else-if="row.earlyTermination?.date" :title="`Check-out was ${dmy(row.earlyTermination.originalDeparture)}`">Terminated early</span></td>
                <td class="num nw" v-if="acc.bkView">{{ row.longTerm ? `${amt(row.monthlyRent)} /M` : paidOf(row) }}</td>
                <td v-if="acc.bkView"><div class="mp-list"><template v-for="m in payMonths" :key="m"><span class="pill" :class="MONTH_PAY[monthStatus(row, m)].cls" v-if="monthStatus(row, m)" :title="monthPayTip(row, m)">{{ `${payMonths.length > 1 || monthSel !== null && !monthSel.length || wholeYear ? payTag(m) + ' · ' : ''}${MONTH_PAY[monthStatus(row, m)].label}` }}</span></template><span class="muted" v-if="!payMonths.some(m => monthStatus(row, m))">—</span></div></td>
                <td class="num"><button type="button" class="eye-btn" title="View booking" aria-label="View booking" @click.stop="open = row"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5C7 5 2.7 8.1 1 12c1.7 3.9 6 7 11 7s9.3-3.100 11-7c-1.700-3.900-6-7-11-7zm0 11.500A4.500 4.500 0 1112 7.500a4.500 4.500 0 010 9zm0-7.200a2.700 2.700 0 100 5.400 2.700 2.700 0 000-5.400z"/></svg></button></td>
              </tr>
            </template>
            <tr v-show="!shown.length"><td :colspan="9 - (!acc.bkView ? 2 : 0)" class="muted">{{ emptyMsg }}</td></tr>
          </tbody>
        </table>
      </div>
      </Paged>
      <div class="card-foot" v-if="acc.bkView"><span>Invoice and receipt PDFs are made from a booking, approved by Accounting, saved to the company Google Drive and listed on Accounting › Invoices & Receipts. Nothing is sent automatically.</span></div>
    </section>

    <BookingDrawer v-if="open" :key="open.id" :booking="open" :acc="acc" @close="open = null" @saved="onSaved" @patched="onPatched" @deleted="onDeleted" />
  </main>
</template>

<script>
import { leaseLabel, leaseTerm, bookingNights } from '@/lib/lease-term.js';
// Portfolio › Bookings: offline bookings (stays made outside eZee), for every property or the one picked, with
// the month payment status of each and the booking drawer.
const isTerminated = x => !!x.earlyTermination?.date;   // 20 Nov 2026: Terminated early filter
const yearOf = m => Array.from({ length: 12 }, (_, i) => `${m.slice(0, 4)}-${String(i + 1).padStart(2, '0')}`);
import '../portfolio.css';
import { amt, dmy, monthName, monthOffset } from '@/lib/format.js';
import { loadProperties, friendlyError } from '@/lib/finance-data.js';
import { useSession } from '@/stores/session.js';
import { lastProperty, rememberProperty } from '@/lib/last-property.js';
import { portfolioAccess } from '@/lib/portfolio-access.js';
import { can } from '@/lib/access.js';
import { MONTH_PAY, shortName, loadOfflineBookings, watchOfflineBookings, loadGuestName } from '@/lib/portfolio-data.js';
import { termLastDue } from '@/lib/booking-invoice.js';
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
const SIZE_KEY = 'bookings:pageSize';
const savedSize = () => { try { const n = Number(localStorage.getItem(SIZE_KEY)); return [10, 25, 50].includes(n) ? n : 10; } catch { return 10; } };
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
      search: '', bookingKind: 'all', monthSel: null, bkFrom: '', bkTo: '', drOpen: false, fltOpen: false, setOpen: false, pageSize: savedSize(),
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
    active() { return this.bookings.filter(x => x.status !== 'cancelled' && !isTerminated(x)); },
    terminatedCount() { return this.bookings.filter(x => x.status !== 'cancelled' && isTerminated(x) && this.inPicked(x)).length; },
    // 16 Nov 2026 (Khairul): the cards and counts follow the months and dates picked: any booking whose stay touches them
    inView() { return this.active.filter(x => this.inPicked(x)); },
    cancelledCount() { return this.bookings.filter(x => x.status === 'cancelled' && this.inPicked(x)).length; },
    // Awaiting payment (16 Nov 2026): held units, not keyed into eZee until paid
    pendingCount() { return this.inView.filter(x => x.status === 'pending').length; },
    notInEzee() { return this.inView.filter(x => !x.ezeeReservationNo && x.status !== 'pending').length; },
    // 20 Nov 2026 (Khairul): options in the Filters drop-down, with counts
    kindGroups() {
      const t = k => this.inView.filter(x => this.termOfRow(x) === k).length;
      return [
        { title: 'Show', opts: [{ k: 'all', label: 'All active bookings', n: this.inView.length }] },
        { title: 'Lease type', opts: [{ k: 'long', label: 'Yearly Lease', n: t('long') }, { k: 'monthly', label: 'Monthly Lease', n: t('monthly') }, { k: 'short', label: 'Daily Lease', n: t('short') }] },
        { title: 'Status', opts: [{ k: 'noEzee', label: 'Not in eZee yet', n: this.notInEzee }, { k: 'pending', label: 'Awaiting payment', n: this.pendingCount },
          { k: 'cancelled', label: 'Cancelled', n: this.cancelledCount }, { k: 'terminated', label: 'Terminated early', n: this.terminatedCount }] }
      ];
    },
    kindLabel() { for (const g of this.kindGroups) for (const o of g.opts) if (o.k === this.bookingKind) return o.label; return 'Filters'; },
    propertyOptions() { return [{ value: 'all', label: 'All properties' }, ...this.properties.map(p => ({ value: p.id, label: p.name }))]; },
    // The month picker: several months (none ticked = every month). Left alone it follows the month in the address.
    monthsModel: { get() { return this.selMonths; }, set(v) { this.monthSel = v; } },
    // 16 Nov 2026 (Khairul): starts on the whole year (the month's year); a link with ?month= starts on that month
    // 20 Nov 2026 (Khairul): opens on All months (every booking, any year); a month in the address still picks just that month
    selMonths() { return this.monthSel !== null ? this.monthSel : this.$route.query.month ? [this.asOf] : []; },
    wholeYear() { const s = this.selMonths; return s.length === 12 && new Set(s.map(m => m.slice(0, 4))).size === 1; },
    // Payment pills: the whole year shows the current month only (not 12 pills per long-term tenant)
    payMonths() { const s = this.selMonths; return this.wholeYear ? [s.includes(monthOffset(0)) ? monthOffset(0) : this.asOf] : s.length ? [...s].sort() : [this.asOf]; },
    dateLabel() { return !this.bkFrom && !this.bkTo ? 'Any dates' : `${this.bkFrom ? dmy(this.bkFrom) : 'Start'} to ${this.bkTo ? dmy(this.bkTo) : 'any'}`; },
    // Typing in the search box ignores the month and date filters, so a unit search shows all of its bookings.
    shown() {
      const q = this.search.trim().toLowerCase();
      const k = this.bookingKind;
      // 20 Nov 2026 (Khairul): a search looks through every booking, cancelled and terminated early too (their tags show)
      const list = q && k === 'all' ? this.bookings : k === 'cancelled' ? this.bookings.filter(x => x.status === 'cancelled')
        : k === 'terminated' ? this.bookings.filter(x => x.status !== 'cancelled' && isTerminated(x)) : this.active;
      return list.filter(x => (q || this.inPicked(x)) && (k === 'all' || k === 'cancelled' || k === 'terminated' || (['long', 'monthly', 'short'].includes(k) && this.termOfRow(x) === k) || (k === 'noEzee' && !x.ezeeReservationNo && x.status !== 'pending') || (k === 'pending' && x.status === 'pending'))
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
    leaseLabel, bookingNights,
    termOfRow(x) { return leaseTerm(bookingNights(x)); },
    amt, dmy,
    setPageSize(n) { this.pageSize = n; try { localStorage.setItem(SIZE_KEY, String(n)); } catch { /* not remembered */ } },
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
    // 20 Nov 2026: the card's rate: monthly rent for leases, the stay's rental for short stays
    rateOf(r) { return Number(r.longTerm ? r.monthlyRent : r.rental) || 0; },
    paidOf(r) {
      if (this.paid && r.id in this.paid) return amt(this.paid[r.id]);
      return r.amount ? amt(r.amount) : '—';   // older bookings made before payments moved to Offline Payments
    },
    // A stay counts in a month when it overlaps it.
    stays(b, m) { return (b.arrival || '') <= m + '-31' && (b.departure || '9999') >= m + '-01'; },
    // 'Nov' when one month is shown, 'Nov 26' once the picked months span years
    payTag(m) { const y = new Set(this.payMonths.map(x => x.slice(0, 4))).size > 1; return y ? `${shortName(m).split(' ')[0]} ${m.slice(2, 4)}` : shortName(m).split(' ')[0]; },
    // Paid, part paid or unpaid for one month. Long-term: that month's rent against the Checked payments for that month.
    // Short stay: the whole rental against everything paid. null = not in that month, or no access to payments.
    monthStatus(b, m) {
      if (!this.pays || !this.stays(b, m)) return null;
      const paid = this.paidIn(b, m), due = this.dueIn(b, m);
      if (due > 0) return paid >= due - 0.005 ? 'paid' : paid > 0 ? 'part' : 'unpaid';
      return paid > 0 ? 'paid' : 'unpaid';
    },
    paidIn(b, m) { const list = this.pays?.[b.id] || []; return (b.longTerm ? list.filter(x => x.month === m) : list).reduce((s, x) => s + x.amount, 0); },   // Checked only, by For month
    // What is due in a month; the last part month of an early termination with notice is by days (20 Nov 2026)
    dueIn(b, m) { const t = termLastDue(b); return t && t.m === m ? t.due : b.longTerm ? Number(b.monthlyRent) || 0 : Number(b.rental) || 0; },
    monthPayTip(b, m) {
      const due = this.dueIn(b, m);
      return `${monthName(m)}: paid RM ${amt(this.paidIn(b, m))}${due > 0 ? ` of RM ${amt(due)}` : ''}${b.longTerm ? ' (Checked payments for this month)' : ''}`;
    },
    inPicked(x) {
      const sel = this.selMonths;
      if (sel.length && !sel.some(m => this.stays(x, m))) return false;
      if (this.bkFrom && (x.departure || '9999') < this.bkFrom) return false;
      if (this.bkTo && (x.arrival || '') > this.bkTo) return false;
      return true;
    },
    // Saved in the drawer: update that row only (no reload).
    // 20 Nov 2026: a change that keeps the popup open (early termination refund or notice image)
    onPatched(p) {
      const i = this.bookings.findIndex(x => x.id === this.open?.id);
      if (i >= 0) this.bookings.splice(i, 1, { ...this.bookings[i], ...p });
    },
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
.kpis-5 { grid-template-columns: repeat(5, minmax(0, 1fr)); }   /* 19 Nov 2026: five cards (three lease terms) */
@media (max-width: 1000px) { .kpis-5 { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 520px) { .kpis-5 { grid-template-columns: minmax(0, 1fr); } }
.card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.view-seg { margin: 0; width: 100%; }
.set-pop { left: auto; right: 0; width: 260px; max-height: none; padding: 6px 10px 12px; }
.set-pop .seg { margin-bottom: 4px; }
.set-pop .flt-opt:disabled { cursor: default; color: var(--text-2); }
.set-pop .flt-opt:disabled:hover { background: none; }
.soon { font-size: 11px; color: var(--muted); background: var(--chip); border-radius: 999px; padding: 2px 8px; }
.icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 40px; padding: 0; }
/* 20 Nov 2026 (Khairul): more room in the list header (title, intro line, filters) */
.list-card > .card-head { margin-bottom: 8px; }
.list-card > .card-head h2 { font-size: 17px; }
.list-card > .card-intro { font-size: 13px; margin: 0 0 20px; }
.list-card > .toolbar { gap: 12px; margin-bottom: 24px; }
.flt-btn { display: inline-flex; align-items: center; gap: 8px; }
.head-acts { display: flex; align-items: center; gap: 10px; }
.list-card > .toolbar .input[type=search] { flex: 1 1 320px; max-width: 460px; }
.flt-btn.on { border-color: var(--accent); color: var(--accent); }
.flt-pop { width: 250px; }
.flt-h { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); padding: 8px 10px 4px; }
.flt-opt { display: flex; width: 100%; justify-content: space-between; align-items: center; gap: 8px; padding: 8px 10px; border: 0; background: none; border-radius: 8px; font: inherit; font-size: 13px; color: var(--text); cursor: pointer; text-align: left; }
.flt-opt:hover { background: var(--bg, #f5f5f7); }
.flt-opt.on { background: color-mix(in srgb, var(--accent) 12%, transparent); color: var(--accent); font-weight: 600; }
.flt-n { font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
.bk-list { display: flex; flex-direction: column; gap: 10px; margin-top: 4px; }
/* 20 Nov 2026 (Khairul): the stay column has a fixed width with equal space each side, so it sits centred and lines up on every card */
.bk-card { display: grid; grid-template-columns: minmax(0, 1fr) 290px minmax(0, 1fr) auto; align-items: center; gap: 20px;
  border: 1px solid var(--border); border-radius: 12px; padding: 14px 18px; cursor: pointer; background: var(--surface); transition: border-color var(--fast), box-shadow var(--fast); }
/* 20 Nov 2026 (Khairul): hover is a softer magenta border + light shadow, so it reads differently from a selected (solid) card */
.bk-card:hover, .bk-card:focus-visible { border-color: color-mix(in srgb, var(--accent) 45%, transparent); box-shadow: 0 4px 14px rgba(0, 0, 0, .07); outline: none; }
/* The eye is grey until the card is hovered or focused */
.bk-card .eye-btn svg { fill: var(--muted); transition: fill var(--fast); }
.bk-card:hover .eye-btn svg, .bk-card:focus-visible .eye-btn svg { fill: var(--accent); }
.bk-card.cancelled { opacity: .7; }
/* Level 1: tenant and amount. Level 2: booking no. and place. Level 3: stay dates. Level 4: type, nights, eZee no. */
.bk-main { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.bk-name { font-size: 16px; font-weight: 700; color: var(--text); line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bk-place { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 13px; font-weight: 500; color: var(--text-2); }
.bk-stay { font-size: 13px; color: var(--text); }
.bk-mid { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.bk-no { font-size: 12px; font-weight: 500; color: var(--muted); margin-left: 6px; }
.bk-k { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); margin-right: 6px; }
.bk-meta { font-size: 12px; color: var(--muted); }
.bk-side { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
.bk-amt { font-size: 18px; font-weight: 700; color: var(--text); white-space: nowrap; font-variant-numeric: tabular-nums; }
.bk-amt small { font-size: 12px; font-weight: 500; color: var(--muted); }
.bk-side .mp-list { justify-content: flex-end; }
.bk-empty { padding: 12px 4px; }
@media (max-width: 640px) {
  .bk-card { grid-template-columns: minmax(0, 1fr) auto; gap: 12px; }
  .bk-card .bk-main, .bk-card .bk-mid { grid-column: 1; }
  .bk-card .bk-side { grid-column: 2; grid-row: 1 / span 2; }
  .bk-card .eye-btn { grid-column: 1 / -1; justify-self: start; }
}
</style>
