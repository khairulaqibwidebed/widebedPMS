<template>
  <div>
    <div class="notice warn" v-show="!acc.viewOnly && notSetUp && (property.code || '').toUpperCase() === 'DM'">
      <span>{{ `${notSetUp} units aren't set up yet.` }}</span> <button class="link" style="margin-left:8px" @click="$emit('starter')" :disabled="busy">{{ `Load D'Majestic starter settings from ${monthName(asOf)}` }}</button>
    </div>
    <section class="card">
      <h2 class="t">{{ `Units · ${units.length}` }}</h2>
      <p class="card-intro" v-if="acc.viewOnly">{{ `Every unit in this property with its owner code, type and rooms. ${acc.canAdd ? 'You can add a unit; changes to' : 'Changes to'} units, fees and rent are made by Accounting and Directors.` }}</p>
      <p class="card-intro" v-else>Who is in each unit today: the booking source and what the tenant pays us, from the bookings. Click a unit to change its settings (arrangement, owner, fixed rent, eZee name, status); every change goes in the audit log below.</p>
      <div class="toolbar">
        <input class="input" type="search" placeholder="Search unit or owner" v-model="search" aria-label="Search unit">
        <!-- 16 Nov 2026 (Khairul): filter by the term of today's booking (Type of rent on the booking form), or vacant -->
        <OptionPicker class="uf-pick" v-if="!acc.viewOnly" v-model="term" :options="termOptions" label="Filter units" />
      </div>
      <Paged :items="shown" v-slot="{ pageRows }">
      <div class="table-wrap">
        <table class="table">
          <thead v-if="acc.viewOnly"><tr><th>Unit</th><th>Owner</th><th>Type</th><th class="num">Bedrooms</th><th class="num">Bathrooms</th><th class="num">Size (sq ft)</th></tr></thead>
          <thead v-else><tr><th>Unit</th><th>Booking source</th><th class="num">Rental amount (RM)</th><th>Rent status</th><th>Next move-out</th><th>Next move-in</th><th>Vacant since</th><th></th></tr></thead>
          <tbody>
            <template v-for="row in pageRows" :key="row.id">
              <tr v-if="acc.viewOnly" :class="{ clickable: acc.canEdit }" @click="acc.canEdit && $emit('open', row)">
                <td class="strong">{{ row.unitCode }}</td>
                <td>{{ labelOf(row.ownerId) || '—' }}</td>
                <td>{{ row.info?.type || '—' }}</td>
                <td class="num">{{ row.info?.bedrooms ?? '—' }}</td>
                <td class="num">{{ row.info?.bathrooms ?? '—' }}</td>
                <td class="num">{{ row.info?.sizeSqft ?? '—' }}</td>
              </tr>
              <tr class="clickable" :class="{ future: futureOf(row) }" @click="$emit('open', row)" v-else>
                <!-- 20 Nov 2026 (Khairul): owner muted under the unit code (search finds owners too); empty cells show a light-grey dash -->
                <td class="strong">{{ row.unitCode }}<div class="owner-sub" v-if="labelOf(row.ownerId)">{{ labelOf(row.ownerId) }}</div></td>
                <td><span class="muted" v-if="!occReady">…</span><template v-else-if="sourceOf(occOf(row).now)">{{ sourceOf(occOf(row).now) }}</template><span class="dash" v-else>—</span></td>
                <td class="num nw"><span class="muted" v-if="!occReady">…</span><template v-else-if="rentOf(occOf(row).now)">{{ amt(rentOf(occOf(row).now).amount) }}<small class="muted">{{ rentOf(occOf(row).now).per }}</small></template><span v-else class="dash">—</span></td>
                <td><span class="muted" v-if="!occReady">…</span><template v-else><span class="pill" :class="occOf(row).now ? 'green' : 'grey'">{{ occOf(row).now ? 'Tenanted' : 'Vacant' }}</span><small class="muted term-tag" v-if="occOf(row).now">{{ TERM_LABEL[termOf(occOf(row).now)] }}</small></template></td>
                <td class="nw"><template v-if="occReady && occOf(row).now?.departure">{{ dayName(occOf(row).now.departure) }}</template><span class="dash" v-else-if="occReady">—</span></td>
                <td class="nw"><template v-if="occReady && occOf(row).next?.arrival">{{ dayName(occOf(row).next.arrival) }}</template><span class="dash" v-else-if="occReady">—</span><span class="muted" v-if="occReady && occOf(row).next?.status === 'pending'" title="Saved before payment; the unit is held"> (awaiting payment)</span></td>
                <td class="nw"><template v-if="occReady"><span class="dash" v-if="occOf(row).now">—</span><template v-else>{{ occOf(row).last ? dayName(occOf(row).last.departure) : 'Never booked' }}</template></template></td>
                <td class="num"><button class="editlink" @click.stop="$emit('open', row)">Edit ›</button></td>
              </tr>
            </template>
            <SkeletonRows v-if="loading && !shown.length" table :cols="acc.viewOnly ? 6 : 8" />
            <tr v-show="!loading && !shown.length"><td :colspan="acc.viewOnly ? 6 : 8" class="muted">No units match.</td></tr>
          </tbody>
        </table>
      </div>
      </Paged>
      <p class="help occ-note" v-if="!acc.viewOnly">{{ occError || `Rent status and move dates as of today (${dayName(today)}), from eZee bookings (as of the last eZee upload) and offline bookings. Cancelled bookings are left out.` }}</p>
      <div class="card-foot"><span>{{ acc.viewOnly ? `Showing ${shown.length} of ${units.length} units` : `Showing ${shown.length} of ${units.length} units · ${tenanted} tenanted · ${units.length - tenanted} vacant` }}</span></div>
    </section>

    <section class="card" style="margin-top:20px" v-if="!acc.viewOnly">
      <h2 class="t">Audit log · unit settings</h2>
      <p class="card-intro">Every change is recorded with who, when, old and new value, effective month and reason. Saving asks for the reason. Entries can't be edited or deleted.</p>
      <Paged :items="unitAudits" keep-page @page="$emit('audit-page', $event)" v-slot="{ pageRows }">
      <div class="table-wrap">
        <table class="table audit-tbl hover-rows">
          <colgroup><col style="width:170px"><col style="width:130px"><col style="width:110px"><col><col style="width:120px"><col style="width:22%"></colgroup>
          <thead><tr><th>When</th><th>Who</th><th>Unit</th><th>Change</th><th>Effective from</th><th>Reason</th></tr></thead>
          <tbody>
            <template v-for="a in pageRows" :key="a.id">
              <tr><td class="nw">{{ stamp(a.at) }}</td><td class="nw">{{ a.userName || '' }}</td><td class="nw">{{ unitCodeOf(a.entity) }}</td>
                <td><div class="chg" v-for="(c, i) in changeList(a)" :key="i">{{ c }}</div></td><td>{{ a.month ? shortName(a.month) : '—' }}</td><td>{{ a.reason || '—' }}</td></tr>
            </template>
            <tr v-show="!unitAudits.length"><td colspan="6" class="muted">No unit changes recorded yet.</td></tr>
          </tbody>
        </table>
      </div>
      </Paged>
      <div class="more-row" v-show="auditMore && unitAudits.length <= 10"><button type="button" class="btn" @click="$emit('more-audits')" :disabled="auditBusy">Load 30 more changes</button></div>
    </section>
  </div>
</template>

<script>
// A property's Units tab: the units table with search and arrangement filters, and the unit settings audit log.
// Clicking a unit asks the page to open the unit drawer.
// 16 Nov 2026: Purchase price and Last changed columns replaced by Rent status (Tenanted / Vacant), Next move-out and Next move-in,
// worked out from this property's eZee bookings (propertyId + departureMonth in the next 30 months, no new index) and offline bookings.
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase.js';
import { amt, monthName, stamp, dayOffset } from '@/lib/format.js';
import OptionPicker from '@/components/OptionPicker.vue';
import { termOf } from '@/lib/rent-term.js';
const TERM_LABEL = { short: 'Daily Lease', mid: 'Monthly Lease', long: 'Yearly Lease' };   // 20 Nov 2026 (Khairul)
import { UNIT_FILTERS, matchArrangement, arrLabel, isFixedTerms, shortName, prevMonth, changeList, ownerLabel } from '@/lib/portfolio-data.js';

export default {
  components: { OptionPicker },
  props: {
    property: { type: Object, required: true },
    units: { type: Array, required: true },
    owners: { type: Array, required: true },
    audits: { type: Array, required: true },
    auditMore: { type: Boolean, default: false },
    auditBusy: { type: Boolean, default: false },
    filter: { type: String, default: 'all' },   // set by the page, so the Overview cards can open the tab filtered
    asOf: { type: String, required: true },
    busy: { type: Boolean, default: false },
    loading: { type: Boolean, default: false },
    acc: { type: Object, required: true }
  },
  emits: ['open', 'starter', 'update:filter', 'audit-page', 'more-audits'],
  data() { return { UNIT_FILTERS, TERM_LABEL, search: '', term: 'all', today: dayOffset(0), occ: {}, occReady: false, occError: '', occSeq: 0 }; },
  watch: { 'property.id': { immediate: true, handler() { if (!this.acc.viewOnly) this.loadOcc(); } } },
  computed: {
    // All · Short / Mid / Long term (today's booking) · Vacant only, with counts once the bookings are read
    termOptions() {
      // Not set up (16 Nov 2026): units with no arrangement/fee yet; counted straight away (doesn't need the bookings)
      const n = k => (this.occReady || k === 'notset' || k === 'all' ? ` · ${this.units.filter(x => this.termMatch(x, k)).length}` : '');
      return [['all', 'All units'], ['short', 'Short term'], ['mid', 'Mid term'], ['long', 'Long term'], ['vacant', 'Vacant only'], ['notset', 'Not set up']].map(([value, label]) => ({ value, label: label + n(value) }));
    },
    tenanted() { return this.units.filter(x => this.occOf(x).now).length; },
    notSetUp() { return this.units.filter(x => !x.terms).length; },
    fixedTotal() { return this.units.filter(x => isFixedTerms(x.terms)).reduce((s, x) => s + (Number(x.terms.fixedRentAmount) || 0), 0); },
    shown() {
      const q = this.search.trim().toLowerCase();
      return this.units.filter(x => (this.acc.viewOnly || this.termMatch(x, this.term)) && (!q || x.unitCode.toLowerCase().includes(q) || this.labelOf(x.ownerId).toLowerCase().includes(q)));
    },
    unitAudits() { return this.audits.filter(x => /^unit/.test(x.action || '')); }
  },
  methods: {
    // Each unit's booking today (now) and the next one after today (next): eZee and offline, cancelled left out
    async loadOcc() {
      const pid = this.property?.id, seq = ++this.occSeq;
      this.occReady = false; this.occError = ''; this.today = dayOffset(0);
      if (!pid) return;
      const months = []; let y = +this.today.slice(0, 4), m = +this.today.slice(5, 7);
      for (let i = 0; i < 30; i++) { months.push(`${y}-${String(m).padStart(2, '0')}`); m++; if (m > 12) { m = 1; y++; } }
      const read = q => getDocs(q).then(s => s.docs.map(d => d.data())).catch(e => { console.warn('Rent status:', e.code || e.message); this.occError = 'Some bookings could not be read, so rent status may be incomplete.'; return []; });
      // 16 Nov 2026: and the 12 months before, for "Vacant since" (the last stay that ended)
      const past = []; y = +this.today.slice(0, 4); m = +this.today.slice(5, 7);
      for (let i = 0; i < 12; i++) { m--; if (m < 1) { m = 12; y--; } past.push(`${y}-${String(m).padStart(2, '0')}`); }
      const [ez, ezPast, off] = await Promise.all([
        read(query(collection(db, 'bookings'), where('propertyId', '==', pid), where('departureMonth', 'in', months))),
        read(query(collection(db, 'bookings'), where('propertyId', '==', pid), where('departureMonth', 'in', past))),
        read(query(collection(db, 'offlineBookings'), where('propertyId', '==', pid)))]);
      if (seq !== this.occSeq) return;
      const t = this.today, occ = {};
      for (const b of [...ez, ...ezPast, ...off]) {
        if (!b.unitId || b.status === 'cancelled' || b.removedByHand || !b.arrival || !b.departure) continue;
        const o = occ[b.unitId] || (occ[b.unitId] = { now: null, next: null, last: null });
        if (b.departure <= t) { if (b.status !== 'pending' && (!o.last || b.departure > o.last.departure)) o.last = b; continue; }
        if (b.arrival <= t) { if (!o.now || b.departure > o.now.departure) o.now = b; }
        else if (!o.next || b.arrival < o.next.arrival) o.next = b;
      }
      this.occ = occ; this.occReady = true;
    },
    occOf(row) { return this.occ[row.id] || { now: null, next: null, last: null }; },
    termOf,
    termMatch(x, k) { if (k === 'notset') return !x.terms; const now = this.occOf(x).now; return k === 'all' || (k === 'vacant' ? !now : !!now && termOf(now) === k); },
    // Where today's booking came from: the offline booking form's source, or eZee's Source
    sourceOf(b) { return b ? (b.bookingSource || b.source && !['direct', 'import'].includes(b.source) && b.source || (b.reservationNo ? 'eZee' : 'Offline')) : ''; },
    // What the tenant pays us: offline monthly rent (or the stay's rental), eZee room charges for the stay (before tax)
    rentOf(b) {
      if (!b) return null;
      if (b.longTerm && +b.monthlyRent > 0) return { amount: +b.monthlyRent, per: ' /month' };
      const v = b.reservationNo ? +b.allRoomCharges : +b.rental;
      return v > 0 ? { amount: v, per: ' total' } : null;
    },
    dayName(iso) { if (!iso) return '—'; const [y, m, d] = iso.slice(0, 10).split('-'); return `${+d} ${monthName(`${y}-${m}`).slice(0, 3)} ${y}`; },
    amt, monthName, stamp, arrLabel, shortName, changeList, matchArrangement, isFixedTerms,
    labelOf(id) { return ownerLabel(this.owners, id, this.acc.viewOnly); },
    unitCodeOf(e) { const id = (e || '').split('/')[1]; return this.units.find(x => x.id === id)?.unitCode || '—'; },
    futureOf(row) { return (row.termHistory || []).filter(h => h.effectiveFrom > this.asOf).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))[0] || null; },
    futureText(row) {
      const f = this.futureOf(row); if (!f) return '';
      const now = row.terms;
      const from = `${arrLabel(f.arrangement)}${f.fixedRentAmount ? ' RM ' + amt(f.fixedRentAmount) : ''} from ${shortName(f.effectiveFrom)}`;
      return isFixedTerms(now) ? `RM ${amt(now.fixedRentAmount)} until ${shortName(prevMonth(f.effectiveFrom))} · then ${from}` : `Changes to ${from}`;
    }
  }
};
</script>

<style scoped>
.dash { color: #cbd5e1; }   /* 20 Nov 2026: empty cells fade back */
.owner-sub { font-size: 12px; font-weight: 400; color: var(--muted); margin-top: 2px; }
/* 16 Nov 2026: Vacant only tick box beside the filter drop-down; the drop-down button and its list are the same width */
.uf-pick { width: 220px; flex: none; }
.term-tag { display: block; margin-top: 2px; font-size: 11px; }
.uf-pick :deep(.op-btn) { width: 100%; min-height: 40px; }
.uf-pick :deep(.op-pop) { width: 100%; max-width: none; min-width: 0; }
.uf-vacant { height: 40px; display: inline-flex; align-items: center; gap: 8px; padding: 0 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); font-size: 13px; cursor: pointer; white-space: nowrap; }
.uf-vacant:hover { border-color: var(--accent); }
.uf-vacant input { width: 16px; height: 16px; margin: 0; accent-color: var(--accent); cursor: pointer; }
</style>
