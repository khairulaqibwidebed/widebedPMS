<template>
  <main class="content">
    <div class="loading-bar" v-show="loading"></div>

    <div class="page-head">
      <div>
        <h1>Reports</h1>
        <div class="sub">Property and unit figures for any dates you pick · from bookings, settings and expenses in the PMS</div>
      </div>
      <div class="head-tools">
        <OptionPicker v-model="propertyId" :options="propertyOptions" label="Property" @change="changeProperty()" />
      </div>
    </div>

    <div class="notice error" v-show="error">{{ error }}</div>
    <div class="notice warn" v-show="!loading && !properties.length">No properties yet. Upload an eZee report first; it creates the property and its units.</div>

    <section class="card" style="margin-bottom:20px">
      <div class="card-head"><h2>What to report</h2></div>
      <div class="seg" style="max-width:420px" role="tablist" aria-label="Report type">
        <button type="button" :class="{ on: kind === 'property' }" @click="kind = 'property'; run()">Property report</button>
        <button type="button" :class="{ on: kind === 'unit' }" @click="kind = 'unit'; run()">Unit report</button>
      </div>
      <div class="rep-form">
        <div class="field"><label for="rFrom">From</label><input class="input" id="rFrom" type="date" v-model="from" @change="run()"></div>
        <div class="field"><label for="rTo">To</label><input class="input" id="rTo" type="date" v-model="to" @change="run()"></div>
        <div class="field" v-show="kind === 'unit'">
          <label for="rUnit">Unit</label>
          <select class="input" id="rUnit" v-model="unitId" @change="run()">
            <template v-for="uu in units" :key="uu.id"><option :value="uu.id" :selected="uu.id === unitId">{{ uu.unitCode }}</option></template>
          </select>
        </div>
      </div>
      <div class="quick">
        <template v-for="q in QUICK" :key="q.key">
          <button type="button" class="pill-btn" :class="{ on: quickOn === q.key }" @click="pick(q.key)">{{ q.label }}</button>
        </template>
      </div>
      <p class="note" style="margin:10px 0 0" v-show="from && to && from > to">The From date is after the To date.</p>
    </section>

    <section class="card" v-show="propertyId">
      <div class="card-head">
        <h2>{{ title() }}</h2>
        <div class="head-tools">
          <button class="btn" @click="downloadCSV()" :disabled="!report || !report.rows.length">Download CSV</button>
          <button class="btn btn-primary" @click="downloadXlsx()" :disabled="!report || !report.rows.length || busy">{{ busy ? 'Preparing…' : 'Download .xlsx' }}</button>
        </div>
      </div>
      <div class="rep-head">
        <div>Dates<b>{{ rangeText() }}</b></div>
        <div>Property<b>{{ propertyName() }}</b></div>
        <div v-show="kind === 'unit'">Unit<b>{{ unitCode() }}</b></div>
        <div>Downloaded by<b>{{ me.name }}</b></div>
      </div>

      <Paged :items="(report ? report.rows : [])" v-slot="{ pageRows }">
      <div class="table-wrap">
        <table class="table">
          <thead><tr>
            <th>{{ kind === 'property' ? 'Unit' : 'Period' }}</th>
            <th class="num">Bookings</th>
            <th class="num">Gross Rental</th><th class="num">Service Fees</th><th class="num">Utility Fees</th>
            <th class="num">Expenses</th><th class="num">SST %</th><th class="num">SST (RM)</th><th class="num">Nett Total for Owner</th>
          </tr></thead>
          <tbody>
            <template v-for="(row, i) in pageRows" :key="i">
              <tr>
                <td class="unitcell"><b>{{ kind === 'property' ? row.unitCode : row.label }}</b>
                  <small>{{ kind === 'property' ? row.arrangements.map(a => ARR[a] || 'Not set up').join(', ') : (ARR[row.arrangement] || 'Not set up') }}</small>
                  <span class="est" v-show="row.estimated"> · Ctrip estimate</span></td>
                <td class="num">{{ row.bookings }}</td>
                <td class="num">{{ amt(row.gross) }}</td>
                <td class="num">{{ amt(row.service) }}</td>
                <td class="num">{{ amt(row.utility) }}</td>
                <td class="num" :class="row.expenses > 0 ? 'neg-amt' : ''">{{ (row.expenses < 0 ? '+' : '') + amt(-row.expenses) }}</td>
                <td class="num">{{ rates(row) }}</td>
                <td class="num">{{ amt(row.sst) }}</td>
                <td class="num" :class="row.nett < 0 ? 'neg-amt' : ''" style="font-weight:600">{{ amt(row.nett) }}</td>
              </tr>
            </template>
            <tr class="total" v-show="report && report.rows.length">
              <td>{{ kind === 'property' ? 'Grand total' : 'Total for the dates' }}</td>
              <td class="num">{{ report?.total.bookings }}</td>
              <td class="num">{{ amt(report?.total.gross) }}</td>
              <td class="num">{{ amt(report?.total.service) }}</td>
              <td class="num">{{ amt(report?.total.utility) }}</td>
              <td class="num">{{ ((report?.total.expenses || 0) < 0 ? '+' : '') + amt(-(report?.total.expenses || 0)) }}</td>
              <td class="num">{{ report ? rates(report.total) : '' }}</td>
              <td class="num">{{ amt(report?.total.sst) }}</td>
              <td class="num">{{ amt(report?.total.nett) }}</td>
            </tr>
            <tr v-show="!loading && report && !report.rows.length"><td colspan="9" class="muted">{{ emptyText() }}</td></tr>
          </tbody>
        </table>
      </div>
      </Paged>
      <div class="card-foot" style="display:block">
        <p style="margin:0 0 4px">How the dates are worked out: bookings count by their check-out date; fees use the unit's settings for each booking's month; expenses and reimbursements count by their own date (Expenses shows the net, reimbursements as plus); fixed rent is shared by days (for example 15-28 Feb = 14 of 28 days).</p>
        <p style="margin:0">Figures are not rounded to RM 0.05 like a payout, so a full-month report can differ from the completed statement by a few sen. Gross Rental is the owner's share of each booking after OTA commission and the 8% SST (the same base the fees are worked out on). SST is the SST on Widebed's fee (long-term tenants); to be revisited.</p>
      </div>
    </section>
  </main>
</template>

<script>
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase.js';
import { ARRANGEMENTS } from '@/lib/engine.js';
import { loadProperties, loadSetup, loadBookings, loadExpenses, friendlyError, download, toCSV, loadXlsxLib } from '@/lib/finance-data.js';
import { amt, dmy, dayOffset } from '@/lib/format.js';
import { propertyReport, unitReport, monthsToLoad, monthPieces } from '@/lib/reports.js';
import { useSession } from '@/stores/session.js';
import { lastProperty, rememberProperty } from '@/lib/last-property.js';

const me = useSession();

const ARR = Object.fromEntries(Object.entries(ARRANGEMENTS).map(([k, v]) => [k, v.label]));
const QUICK = [{ key: 'thisMonth', label: 'This month' }, { key: 'lastMonth', label: 'Last month' }, { key: 'last3', label: 'Last 3 months' }, { key: 'thisYear', label: 'This year' }, { key: 'lastYear', label: 'Last year' }];
const pad = n => String(n).padStart(2, '0');
const lastDay = (y, m) => new Date(y, m, 0).getDate();
const r2 = x => Math.round((Number(x) || 0) * 100) / 100;
const nice = d => { const [y, m, dd] = d.split('-'); return `${+dd} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+m - 1]} ${y}`; };
let params = new URLSearchParams(location.search);

function quickRange(key) {
  const t = dayOffset(0), y = +t.slice(0, 4), m = +t.slice(5, 7);
  if (key === 'thisMonth') return [`${y}-${pad(m)}-01`, `${y}-${pad(m)}-${pad(lastDay(y, m))}`];
  if (key === 'lastMonth') { const ly = m === 1 ? y - 1 : y, lm = m === 1 ? 12 : m - 1; return [`${ly}-${pad(lm)}-01`, `${ly}-${pad(lm)}-${pad(lastDay(ly, lm))}`]; }
  if (key === 'last3') { const sm = m - 3 <= 0 ? m + 9 : m - 3, sy = m - 3 <= 0 ? y - 1 : y; const em = m === 1 ? 12 : m - 1, ey = m === 1 ? y - 1 : y; return [`${sy}-${pad(sm)}-01`, `${ey}-${pad(em)}-${pad(lastDay(ey, em))}`]; }
  if (key === 'lastYear') return [`${y - 1}-01-01`, `${y - 1}-12-31`];
  return [`${y}-01-01`, `${y}-12-31`];
}

import OptionPicker from '@/components/OptionPicker.vue';
export default {
  components: { OptionPicker },
  beforeCreate() { params = new URLSearchParams(location.search); },
  data() {
    return {
      ARR, QUICK, amt, me,
      properties: [], propertyId: params.get('property') || lastProperty(), units: [], unitId: '', rateVersions: [],
      kind: params.get('kind') === 'unit' ? 'unit' : 'property',
      from: params.get('from') || quickRange('lastMonth')[0], to: params.get('to') || quickRange('lastMonth')[1],
      cache: { bookings: {}, expenses: {} },
      report: null, loading: true, busy: false, error: ''
    };
  },
  computed: {
    propertyOptions() { return [...this.properties.map(p => ({ value: p.id, label: p.name }))]; },
    quickOn() { return QUICK.find(q => { const [a, b] = quickRange(q.key); return a === this.from && b === this.to; })?.key || ''; }
  },
  // Remember the property for the next page (see lib/last-property.js)
  watch: { propertyId(v) { rememberProperty(v); } },
  async mounted() {
    try {
      this.properties = await loadProperties();
      if (!this.properties.some(p => p.id === this.propertyId)) this.propertyId = this.properties[0]?.id || '';
      await this.changeProperty();
    } catch (e) { this.error = friendlyError(e, 'load the page'); this.loading = false; }
  },
  methods: {
    async changeProperty() {
      if (!this.propertyId) { this.loading = false; return; }
      this.loading = true; this.error = ''; this.cache = { bookings: {}, expenses: {} };
      try {
        const [setup, rv] = await Promise.all([loadSetup(this.propertyId, '9999-12'), getDocs(collection(db, 'properties', this.propertyId, 'rateVersions'))]);
        this.units = setup.units; this.rateVersions = rv.docs.map(d => ({ id: d.id, ...d.data() }));
        const want = params.get('unit');
        this.unitId = this.units.some(u => u.id === want) ? want : (this.units.some(u => u.id === this.unitId) ? this.unitId : this.units[0]?.id || '');
      } catch (e) { this.error = friendlyError(e, 'load the units'); }
      await this.run();
    },
    pick(key) { [this.from, this.to] = quickRange(key); this.run(); },
    // Bookings and expenses are read month by month (the same queries the statements use), then cut to the dates
    async run() {
      if (!this.propertyId || !this.from || !this.to || this.from > this.to) { this.report = null; this.loading = false; return; }
      this.loading = true; this.error = '';
      try {
        const months = monthsToLoad(this.from, this.to);
        const pid = this.propertyId;
        await Promise.all(months.map(async m => {
          if (!this.cache.bookings[m]) this.cache.bookings[m] = await loadBookings(pid, m);
          if (!this.cache.expenses[m]) this.cache.expenses[m] = await loadExpenses(pid, m);
        }));
        const bookings = months.flatMap(m => this.cache.bookings[m]);
        const expenses = [...new Map(months.flatMap(m => this.cache.expenses[m]).map(e => [e.id, e])).values()];
        const args = { rateVersions: this.rateVersions, bookings, expenses, from: this.from, to: this.to };
        if (this.kind === 'property') this.report = propertyReport({ units: this.units, ...args });
        else { const unit = this.units.find(u => u.id === this.unitId); this.report = unit ? unitReport({ unit, ...args }) : { rows: [], total: {} }; }
        // A unit report always lists every period; with nothing in any of them it counts as empty
        if (this.kind === 'unit' && this.report.rows.every(r => !r.bookings && !r.lines && !r.gross)) this.report.rows = [];
      } catch (e) { this.error = friendlyError(e, 'build the report'); this.report = null; }
      this.loading = false;
    },
    propertyName() { return this.properties.find(p => p.id === this.propertyId)?.name || ''; },
    unitCode() { return this.units.find(u => u.id === this.unitId)?.unitCode || ''; },
    rangeText() { return this.from && this.to ? `${nice(this.from)} to ${nice(this.to)}` : ''; },
    title() { return this.kind === 'property' ? `Property report · ${this.propertyName()}` : `Unit report · ${this.unitCode()}`; },
    rates(row) { return row.sstRates?.length ? row.sstRates.map(x => `${+(x * 100).toFixed(2)}%`).join(', ') : '—'; },
    emptyText() {
      if (this.kind === 'unit' && !this.units.length) return 'This property has no units yet.';
      return `Nothing for ${this.kind === 'unit' ? this.unitCode() : this.propertyName()} between ${this.rangeText()}: no bookings checking out, no expenses and no fixed rent.`;
    },

    // ---- Downloads: same table, with a header saying what it is, who downloaded it and when ----
    sheet() {
      const now = new Date().toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
      const head = [this.kind === 'property' ? 'Unit' : 'Period', 'Arrangement', 'Bookings', 'Gross Rental (RM)', 'Service Fees (RM)', 'Utility Fees (RM)', 'Expenses (RM)', 'SST %', 'SST (RM)', 'Nett Total for Owner (RM)'];
      const line = (label, arr, r) => [label, arr, r.bookings, r2(r.gross), r2(r.service), r2(r.utility), r2(-r.expenses), this.rates(r), r2(r.sst), r2(r.nett)];
      const rows = this.report.rows.map(r => this.kind === 'property'
        ? line(r.unitCode, r.arrangements.map(a => ARR[a] || 'Not set up').join(', '), r)
        : line(r.label, ARR[r.arrangement] || 'Not set up', r));
      return {
        meta: [
          [`Widebed · ${this.kind === 'property' ? 'Property report' : 'Unit report'}`],
          ['Property', this.propertyName()],
          ...(this.kind === 'unit' ? [['Unit', this.unitCode()]] : []),
          ['Dates', this.rangeText()],
          ['Downloaded by', `${me.name} on ${now}`],
          []
        ],
        head, rows,
        total: line(this.kind === 'property' ? 'Grand total' : 'Total for the dates', '', this.report.total),
        notes: [[], ['Bookings count by check-out date; expenses by their own date; fixed rent shared by days. Not rounded to RM 0.05, so a full month can differ from the completed statement by a few sen.']]
      };
    },
    fileName(ext) {
      const who = this.kind === 'property' ? this.propertyName() : `${this.propertyName()} ${this.unitCode()}`;
      return `Widebed ${this.kind === 'property' ? 'Property' : 'Unit'} report ${who} ${this.from} to ${this.to}.${ext}`.replace(/[\\/:*?"<>|']/g, '');
    },
    downloadCSV() {
      const s = this.sheet();
      download(this.fileName('csv'), toCSV([...s.meta, s.head, ...s.rows, s.total, ...s.notes]));
    },
    async downloadXlsx() {
      this.busy = true;
      try {
        const X = await loadXlsxLib();
        const s = this.sheet();
        const aoa = [...s.meta, s.head, ...s.rows, s.total, ...s.notes];
        const ws = X.utils.aoa_to_sheet(aoa);
        const hr = s.meta.length, tr = hr + 1 + s.rows.length;
        const bold = { font: { bold: true } };
        if (ws.A1) ws.A1.s = { font: { bold: true, sz: 14 } };
        for (let c = 0; c < s.head.length; c++) {
          const h = X.utils.encode_cell({ r: hr, c }), t = X.utils.encode_cell({ r: tr, c });
          if (ws[h]) ws[h].s = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '15293D' } }, alignment: { wrapText: true, vertical: 'center' } };
          if (ws[t]) ws[t].s = { ...bold, fill: { fgColor: { rgb: 'F7F8FA' } }, border: { top: { style: 'thin', color: { rgb: '999999' } } } };
          for (let r = hr + 1; r <= tr; r++) { const a = X.utils.encode_cell({ r, c }); if (ws[a] && typeof ws[a].v === 'number' && c >= 3 && c !== 7) ws[a].z = '#,##0.00;-#,##0.00'; }
        }
        ws['!cols'] = [{ wch: 18 }, { wch: 22 }, { wch: 9 }, ...Array(7).fill({ wch: 15 })];
        const wb = X.utils.book_new();
        X.utils.book_append_sheet(wb, ws, this.kind === 'property' ? 'Property report' : 'Unit report');
        download(this.fileName('xlsx'), new Blob([X.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      } catch (e) { this.error = friendlyError(e, 'make the xlsx'); }
      this.busy = false;
    }
  }
};
</script>

<style scoped>
    .rep-form { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; align-items: end; }
    .rep-form .field { margin: 0; }
    .rep-form .input, .rep-form select.input { height: 38px; }
    .quick { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 12px; }
    .rep-head { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }
    .rep-head div { font-size: 12px; color: var(--muted); }
    .rep-head b { display: block; color: var(--text); font-size: 13px; font-weight: 600; margin-top: 2px; }
    .table tr.total td { font-weight: 700; background: var(--head); border-top: 1px solid var(--border); }
    .table td.unitcell b { display: block; white-space: nowrap; }
    .table td.unitcell small { white-space: nowrap; }
    .card-head { flex-wrap: wrap; gap: 10px; }
    .table td.unitcell small { color: var(--muted); font-size: 11px; }
    .est { font-size: 11px; color: var(--amber); font-weight: 600; }
    @media (max-width: 900px) { .rep-form, .rep-head { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } }
    @media (max-width: 520px) { .rep-form, .rep-head { grid-template-columns: minmax(0, 1fr); } }
</style>
