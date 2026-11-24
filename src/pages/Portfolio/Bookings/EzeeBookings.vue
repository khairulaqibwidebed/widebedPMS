<template>
  <!-- 24 Nov 2026: Portfolio > Bookings > eZee bookings. The bookings uploaded from eZee (Bulk Upload > New bookings, Cancel
       bookings, Monthly check, and Finance > Upload eZee report): the same records Accounting pays from on Month-End,
       shown here read only, so Operations and the Booking team see them too. A clash (two bookings in one room on the
       same night, with another eZee booking or an offline booking) is flagged; Accounting settles it with a Monthly check. -->
  <div>
    <section class="kpis kpis-4">
      <button type="button" class="card kpi kpi-link" :class="{ on: show === 'active' }" @click="show = 'active'"><div class="label">eZee bookings</div><div class="value">{{ active.length }}</div><div class="hint">{{ monthsHint }}</div></button>
      <button type="button" class="card kpi kpi-link" :class="{ on: show === 'clash' }" @click="show = 'clash'"><div class="label">Clashes</div><div class="value" :class="{ alert: clashCount }">{{ clashCount }}</div><div class="hint">same room, same night</div></button>
      <button type="button" class="card kpi kpi-link" :class="{ on: show === 'month' }" @click="show = 'month'"><div class="label">Found by Monthly check</div><div class="value">{{ rows.filter(fromMonth).length }}</div><div class="hint">missed by the daily upload</div></button>
      <button type="button" class="card kpi kpi-link" :class="{ on: show === 'cancelled' }" @click="show = 'cancelled'"><div class="label">Cancelled</div><div class="value">{{ cancelled.length }}</div><div class="hint">kept, not counted</div></button>
    </section>

    <section class="card list-card">
      <div class="card-head"><h2>eZee bookings</h2>
        <RouterLink v-if="canUpload" class="btn" to="/Portfolio/bulk-upload" title="Bulk Upload > New bookings, Cancel bookings or Monthly check">Upload from eZee</RouterLink></div>
      <p class="card-intro">Uploaded from eZee every day, checked by Accounting each month. Read only here: a change is made in eZee, then uploaded.</p>
      <div class="notice error" v-if="error">{{ error }}</div>
      <div class="toolbar">
        <input class="input ez-search" type="search" placeholder="Search reservation no., unit, folio, source or guest" v-model="q" aria-label="Search eZee bookings">
        <div class="seg slide ez-seg" role="radiogroup" aria-label="Show">
          <button v-for="o in SHOWS" :key="o.k" type="button" role="radio" :aria-checked="show === o.k" :class="{ on: show === o.k }" @click="show = o.k">{{ o.label }}</button>
        </div>
      </div>
      <Paged :items="shown" :size="pageSize" :sizes="[10, 25, 50]" @update:size="pageSize = $event" v-slot="{ pageRows }">
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Reservation</th><th>Unit</th><th>Guest</th><th>Check-in</th><th>Check-out</th><th class="num">Nights</th><th>Source</th><th class="num" v-if="showAmounts">Total (RM)</th><th>Status</th><th></th></tr></thead>
            <tbody>
              <tr v-for="b in pageRows" :key="b.id" class="clickable" :class="{ dim: b.status === 'cancelled' }" @click="open = b">
                <td class="strong nw">{{ b.reservationNo || b.id }}<div class="muted small" v-if="propertyId === 'all'">{{ propName(b.propertyId) }}</div></td>
                <td class="nw">{{ b.unitCode || '—' }}</td>
                <td class="nw">{{ guest(b) }}</td>
                <td class="nw">{{ dmy(b.arrival) }}</td>
                <td class="nw">{{ dmy(b.departure) }}</td>
                <td class="num">{{ b.nights || '—' }}</td>
                <td class="nw">{{ b.source || '—' }}</td>
                <td class="num nw" v-if="showAmounts">{{ amt(b.totalInclTax) }}</td>
                <td class="nw">
                  <span class="pill red" v-if="b.status === 'cancelled'" :title="b.cancel?.remark || ''">Cancelled</span>
                  <span class="pill red" v-else-if="clashes.get(b.id)" :title="clashText(b)">Clash</span>
                  <span class="pill green" v-else>Booked</span>
                  <span class="pill blue ez-via" v-if="fromMonth(b)" title="Added or changed by Accounting's Monthly check">Monthly check</span>
                </td>
                <td class="num"><button type="button" class="eye-btn" title="View booking" aria-label="View booking" @click.stop="open = b"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5C7 5 2.7 8.1 1 12c1.7 3.9 6 7 11 7s9.3-3.1 11-7c-1.7-3.9-6-7-11-7zm0 11.5A4.5 4.5 0 1112 7.5a4.5 4.5 0 010 9zm0-7.2a2.7 2.7 0 100 5.4 2.7 2.7 0 000-5.4z"/></svg></button></td>
              </tr>
              <tr v-show="!shown.length"><td :colspan="showAmounts ? 10 : 9" class="muted">{{ loading ? 'Loading eZee bookings…' : emptyMsg }}</td></tr>
            </tbody>
          </table>
        </div>
      </Paged>
    </section>

    <!-- One booking, read only -->
    <div class="modal-back" v-if="open" @click.self="open = null">
      <div class="modal ez-modal" role="dialog" aria-modal="true" aria-labelledby="ezTitle">
        <h2 id="ezTitle">{{ `eZee booking ${open.reservationNo || open.id}` }}</h2>
        <div class="notice error" v-if="open.status !== 'cancelled' && clashes.get(open.id)">{{ `Clash: ${clashText(open)}. Accounting settles it with Bulk Upload › Monthly check (Skip, Replace or edit the row).` }}</div>
        <div class="notice warn" v-if="open.status === 'cancelled'">{{ `Cancelled${open.cancel?.date ? ` on ${dmy(String(open.cancel.date).slice(0, 10))}` : ''}${open.cancel?.source ? ` · ${open.cancel.source}` : ''}${open.cancel?.remark ? ` · ${open.cancel.remark}` : ''}` }}</div>
        <dl class="ez-dl">
          <div v-for="f in details(open)" :key="f[0]"><dt>{{ f[0] }}</dt><dd>{{ f[1] }}</dd></div>
        </dl>
        <div class="modal-foot"><button type="button" class="btn" @click="open = null">Close</button></div>
      </div>
    </div>
  </div>
</template>

<script>
import { amt, dmy, monthName } from '@/lib/format.js';
import { friendlyError } from '@/lib/finance-data.js';
import { loadEzeeBookings, loadEzeeGuest, defaultEzeeMonths, findClashes, viaLabel } from '@/lib/ezee-bookings.js';
import Paged from '@/components/Paged.vue';

const SHOWS = [{ k: 'active', label: 'Booked' }, { k: 'clash', label: 'Clashes' }, { k: 'month', label: 'Monthly check' }, { k: 'cancelled', label: 'Cancelled' }, { k: 'all', label: 'All' }];

export default {
  components: { Paged },
  props: {
    propertyId: { type: String, required: true },
    properties: { type: Array, default: () => [] },
    months: { type: Array, default: () => [] },          // check-out months picked on the page (none = the default six)
    search: { type: String, default: '' },
    offline: { type: Array, default: () => [] },         // the page's offline bookings, for clashes with them
    showAmounts: { type: Boolean, default: false },
    guestNames: { type: Boolean, default: false },
    canUpload: { type: Boolean, default: false }
  },
  data() { return { q: '', SHOWS, rows: [], names: {}, asked: new Set(), loading: false, error: '', show: 'active', open: null, pageSize: 10 }; },
  computed: {
    readMonths() { return this.months.length ? [...this.months].sort() : defaultEzeeMonths(); },
    monthsHint() { const m = this.readMonths; return m.length === 1 ? `checking out ${monthName(m[0])}` : `check-outs ${monthName(m[0])} – ${monthName(m[m.length - 1])}`; },
    active() { return this.rows.filter(b => b.status !== 'cancelled'); },
    cancelled() { return this.rows.filter(b => b.status === 'cancelled'); },
    clashes() { return findClashes(this.rows, this.offline); },
    clashCount() { return this.active.filter(b => this.clashes.get(b.id)).length; },
    shown() {
      const q = (this.q || this.search).trim().toLowerCase(), k = this.show;
      return this.rows.filter(b => (k === 'all' || (k === 'cancelled' ? b.status === 'cancelled' : b.status !== 'cancelled'))
        && (k !== 'clash' || this.clashes.get(b.id)) && (k !== 'month' || this.fromMonth(b))
        && (!q || [b.reservationNo, b.unitCode, b.folioNo, b.source, this.names[b.id]].some(v => String(v || '').toLowerCase().includes(q))));
    },
    emptyMsg() { return (this.q || this.search).trim() ? 'No eZee bookings match.' : `No eZee bookings here for ${this.monthsHint.replace(/^check(ing)?-?outs? ?/, '')}. Pick other months at the top.`; }
  },
  watch: {
    propertyId() { this.load(); },
    readMonths(a, b) { if (a.join() !== b.join()) this.load(); },
    q(v) { if (v.trim()) this.rows.forEach(b => this.guest(b)); }
  },
  mounted() { this.load(); },
  methods: {
    amt, dmy,
    fromMonth(b) { return b.uploadedVia === 'month' || b.cancel?.source?.startsWith('Monthly check'); },
    propName(id) { return this.properties.find(p => p.id === id)?.name || id; },
    async load() {
      this.loading = true; this.error = '';
      const pid = this.propertyId, key = this.readMonths.join();
      try {
        const list = await loadEzeeBookings(pid, this.readMonths);
        if (pid === this.propertyId && key === this.readMonths.join()) this.rows = list;
      } catch (e) { this.error = friendlyError(e, 'load the eZee bookings'); this.rows = []; }
      this.loading = false;
    },
    // Guest names are private: read one at a time, only for those allowed (Accounting, Directors, Bookings Full)
    guest(b) {
      if (this.names[b.id] !== undefined) return this.names[b.id] || '—';
      if (this.guestNames && !this.asked.has(b.id)) {
        this.asked.add(b.id);
        loadEzeeGuest(b.id).then(n => { this.names = { ...this.names, [b.id]: n }; });
      }
      return '—';
    },
    clashText(b) { return (this.clashes.get(b.id) || []).map(w => `${w.kind === 'offline' ? 'offline booking' : 'eZee'} ${w.ref}`).join(', '); },
    details(b) {
      return [['Property', this.propName(b.propertyId)], ['Unit', b.unitCode || '—'], ['Guest', this.names[b.id] || '—'], ['Check-in', dmy(b.arrival) || '—'], ['Check-out', dmy(b.departure) || '—'],
        ['Nights', b.nights || '—'], ['Source', b.source || '—'], ['Rate type', b.rateType || '—'], ['Folio no.', b.folioNo || '—'], ['Invoice no.', b.invoiceNo || '—'],
        ...(this.showAmounts ? [['Total (RM)', amt(b.totalInclTax)]] : []), ['Added by', viaLabel(b)], ['Owner statement month', b.departureMonth ? monthName(b.departureMonth) : '—']];
    }
  }
};
</script>

<style scoped>
.kpis-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
@media (max-width: 1000px) { .kpis-4 { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 520px) { .kpis-4 { grid-template-columns: minmax(0, 1fr); } }
.card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 8px; }
.card-head h2 { font-size: 17px; }
.card-intro { font-size: 13px; margin: 0 0 20px; }
.toolbar { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-bottom: 20px; }
.ez-search { flex: 1 1 300px; max-width: 420px; }
.ez-seg { width: min(480px, 100%); margin: 0 0 0 auto; }
.ez-via { margin-left: 6px; }
tr.dim td { opacity: .65; }
.small { font-size: 12px; font-weight: 400; }
table.table .eye-btn svg { fill: var(--muted); transition: fill var(--fast); }
table.table tr:hover .eye-btn svg { fill: var(--accent); }
.ez-modal { max-width: 560px; }
.ez-dl { margin: 0; } .ez-dl > div { display: flex; justify-content: space-between; gap: 12px; padding: 7px 0; border-top: 1px solid var(--border); font-size: 14px; }
.ez-dl dt { color: var(--muted); } .ez-dl dd { margin: 0; text-align: right; }
</style>
