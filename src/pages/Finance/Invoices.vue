<template>
  <main class="content">
    <div class="loading-bar" v-show="loading"></div>

    <div class="page-head">
      <div>
        <h1>Invoices & Receipts</h1>
        <div class="sub">Completed documents · owner payments are marked Paid here with the pay slip</div>
      </div>
      <div class="head-tools">
        <OptionPicker v-model="propertyId" :options="propertyOptions" label="Property" @change="load()" />
        <MonthPicker :ahead="1" v-model="month" @change="load()" />
      </div>
    </div>

    <div class="notice error" v-show="error">{{ error }}</div>
    <div class="notice ok" v-show="ok">{{ ok }}</div>
    <div class="notice warn" v-show="!loading && !properties.length">No properties yet. Upload an eZee report first; it creates the property and its units.</div>

    <section class="kpis">
      <button type="button" class="card kpi kpi-link" :class="{ on: filter === 'statement' }" @click="kpiGo('statement')"><div class="label">Owner statements</div><div class="value">{{ count('statement') }}</div>
        <div class="hint">{{ count('statement') ? `${shortName(month)} · completed` : `None completed for ${shortName(month)} yet` }}</div></button>
      <button type="button" class="card kpi kpi-link" :class="{ on: filter === 'invoice' }" @click="kpiGo('invoice')"><div class="label">Tenant invoices</div><div class="value">{{ count('invoice') }}</div><div class="hint">None yet. Rent invoices come with leases</div></button>
      <button type="button" class="card kpi kpi-link" :class="{ on: filter === 'receipt' }" @click="kpiGo('receipt')"><div class="label">Receipts</div><div class="value">{{ count('receipt') }}</div><div class="hint">None yet. Rent receipts come with leases</div></button>
      <button type="button" class="card kpi kpi-link" :class="{ on: payFilter === 'pending' }" @click="payFilter = 'pending'; kpiGo('statement')"><div class="label">Paid to owners</div><div class="value">{{ rm(paidToOwners()) }}</div><div class="hint">{{ waiting() ? `${waiting()} waiting for payment` : `${shortName(month)} · nothing waiting` }}</div></button>
    </section>

    <div class="toolbar" ref="list">
      <input class="input" type="search" placeholder="Search document no. or unit…" v-model="search" aria-label="Search">
      <OptionPicker v-model="filter" :options="FILTERS.map(f => ({ value: f.key, label: f.label }))" label="Document type" />
      <OptionPicker v-model="payFilter" :options="PAY_FILTERS" label="Payment status" />
    </div>

    <section class="card">
      <div class="card-head"><h2>{{ `Documents · ${monthName(month)}` }}</h2></div>
      <p class="card-intro">Only documents Accounting has approved and completed appear here. Drafts stay on Month-end payout and the unit statement. To correct a completed owner statement, a Director reopens it on the unit statement: a new revision is made and the old one is kept. Tenant invoices, receipts and folios will appear here once leases and rent invoices are built.</p>

      <div class="selbar" v-show="picked.length">
        <b>{{ `${picked.length} selected` }}</b>
        <button class="btn" @click="downloadDocs(pickedDocs())">{{ `↓ Download PDFs (${picked.length})` }}</button>
        <button class="btn btn-primary" @click="openPreview(pickedDocs())">{{ `Export list (.xlsx) (${picked.length})` }}</button>
        <button class="clear" @click="picked = []">Clear</button>
      </div>

      <div class="dl-panel" v-show="dl.open" role="status">
        <div class="dl-row">
          <b>{{ dl.done ? `Downloaded · ${dl.count} document${dl.count === 1 ? '' : 's'}` : `Preparing ${dl.count} document${dl.count === 1 ? '' : 's'}…` }}</b>
          <div class="head-tools">
            <button class="btn btn-sm" v-show="dl.done" @click="openFile()">Open file</button>
            <button class="btn btn-sm" v-show="dl.done" @click="dl.open = false">Close</button>
          </div>
        </div>
        <div class="progress"><div :style="`width:${dl.pct}%`"></div></div>
        <span class="help">{{ dl.done ? (dl.file.endsWith('.pdf') ? `${dl.file} · Saved as PDF.` : `${dl.file} · This one is a read-only web page (PDF is for owner statements). Open it and print to PDF if needed.`) : 'Keep this page open.' }}</span>
      </div>

      <Paged :items="shown()" v-slot="{ pageRows }">
      <div class="table-wrap">
        <table class="table docs-table">
          <thead><tr>
            <th><input type="checkbox" aria-label="Tick all shown" :checked="allPicked()" @change="toggleAll($event.target.checked)"></th>
            <th>Document no.</th><th>Type</th><th>Unit</th><th>Period</th><th>Completed on</th><th class="num">Amount (RM)</th><th>Payment</th><th></th>
          </tr></thead>
          <tbody>
            <template v-for="d in pageRows" :key="d.id">
              <tr :class="{ picked: picked.includes(d.id) }">
                <td><input type="checkbox" :aria-label="`Tick ${d.no}`" :checked="picked.includes(d.id)" @change="toggle(d.id)"></td>
                <td><b>{{ d.no }}</b></td>
                <td>{{ TYPE[d.type] }}</td>
                <td>{{ d.unitCode }}</td>
                <td>{{ shortName(d.month) }}</td>
                <td>{{ d.completedOn }}</td>
                <td class="num" :class="d.amount < 0 ? 'neg-amt' : ''">{{ amt(d.amount) }}</td>
                <td><span class="pill" :class="PAY[payOf(d)].cls">{{ PAY[payOf(d)].label }}</span></td>
                <td class="acts"><div class="acts-in">
                  <button class="icon-act" @click="view(d)" title="View" aria-label="View"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5C7 5 2.7 8.1 1 12c1.7 3.9 6 7 11 7s9.3-3.1 11-7c-1.7-3.9-6-7-11-7zm0 11.5A4.5 4.5 0 1112 7.5a4.5 4.5 0 010 9zm0-7.2a2.7 2.7 0 100 5.4 2.7 2.7 0 000-5.4z"/></svg></button>
                  <button class="icon-act" @click="downloadDocs([d])" title="Download PDF" aria-label="Download PDF"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 3h2v9.6l3.3-3.3 1.4 1.4L12 16.4l-5.7-5.7 1.4-1.4 3.3 3.3V3zM4 18h16v2H4z"/></svg></button>
                  <button class="act-pill" v-if="rowActions(d).length" @click="openMenu(d, $event)" aria-haspopup="menu" :aria-expanded="String(menu && menu.id === d.id)">Actions ▾</button>
                </div></td>
              </tr>
            </template>
            <tr v-show="!loading && !shown().length"><td colspan="9" class="muted">No documents match.</td></tr>
          </tbody>
        </table>
      </div>
      </Paged>
      <div class="card-foot">
        <span>{{ `Showing ${shown().length} of ${docs.length} documents · tick documents to download or export only those; with nothing ticked the buttons use the whole list` }}</span>
        <div class="head-tools">
          <button class="btn" @click="downloadDocs(shown())" :disabled="!shown().length">Download all PDFs (ZIP)</button>
          <button class="btn" @click="openPreview(shown())" :disabled="!shown().length">Export all (.xlsx)</button>
        </div>
      </div>
      <p class="help" v-show="!loading && !count('statement')" style="margin:10px 0 0">{{ `No owner statements for ${monthName(month)} yet. Each one appears here once its unit's statement is completed on Month-end payout (Approve & complete).` }}</p>
    </section>

    <!-- Row Actions menu: floats above the page so the table doesn't cut it off -->
    <Teleport to="body"><template v-if="menu">
      <div class="am-back" @click="menu = null" v-esc="() => { menu = null }"></div>
      <div class="am-pop" role="menu" :style="{ top: menu.y + 'px', left: menu.x + 'px' }">
        <template v-for="a in rowActions(menu.d)" :key="a.key">
          <button type="button" role="menuitem" :class="a.key" @click="pick(a, menu.d)">{{ a.label }}</button>
        </template>
      </div>
    </template></Teleport>

    <OwnerPaymentModal v-if="paying" :doc="paying" @close="paying = null" @saved="m => { paying = null; ok = m; load(); }" />

    <!-- View one document (read-only) -->
    <template v-if="viewing">
      <div class="modal-back" @click.self="viewing = null" v-esc="() => { viewing = null }">
        <div class="modal doc" role="dialog" :aria-label="viewing.no">
          <div class="card-head"><h2 style="margin:0">{{ viewing.no }}</h2><span class="ro-tag">Read-only</span></div>
          <div class="doc-paper" v-html="docHTML(viewing)"></div>
          <div class="modal-foot">
            <button class="btn" @click="viewing = null">Close</button>
            <button class="btn btn-primary" @click="downloadDocs([viewing])">↓ Download</button>
          </div>
        </div>
      </div>
    </template>

    <!-- Export list: preview of the sheet before it downloads -->
    <template v-if="preview">
      <div class="modal-back" @click.self="preview = null" v-esc="() => { preview = null }">
        <div class="modal doc" role="dialog" aria-label="Export list preview">
          <h2>Export list · preview</h2>
          <p class="help" style="margin:-8px 0 12px">{{ `${preview.length} row${preview.length === 1 ? '' : 's'} · ${fileName('xlsx')}` }}</p>
          <div class="preview-wrap">
            <table class="table">
              <thead><tr><template v-for="h in HEAD" :key="h"><th>{{ h }}</th></template></tr></thead>
              <tbody>
                <template v-for="(cells, i) in preview.map(listRow)" :key="i">
                  <tr><template v-for="(c, j) in cells" :key="j"><td :class="j === 6 ? 'num' : ''">{{ j === 6 ? amt(c) : c }}</td></template></tr>
                </template>
              </tbody>
            </table>
          </div>
          <div class="modal-foot">
            <button class="btn" @click="preview = null">Cancel</button>
            <button class="btn btn-primary" @click="exportXlsx()" :disabled="busy">{{ busy ? 'Preparing…' : 'Download .xlsx' }}</button>
          </div>
        </div>
      </div>
    </template>
  </main>
</template>

<script>
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase.js';
import { toast } from '@/lib/toast.js';
import { byUnit } from '@/lib/engine.js';
import { loadProperties, friendlyError, download, loadXlsxLib } from '@/lib/finance-data.js';
import { buildStatementPdf, loadPdfKit } from '@/lib/statement-pdf.js';
import { rm, amt, dmy, monthName, monthOffset } from '@/lib/format.js';
import { useSession } from '@/stores/session.js';
import { lastProperty, rememberProperty } from '@/lib/last-property.js';

const me = useSession();

const TYPE = { statement: 'Owner statement', invoice: 'Tenant invoice', receipt: 'Receipt', folio: 'Folio' };
const FILTERS = [{ key: 'all', label: 'All' }, { key: 'statement', label: 'Owner statements' }, { key: 'invoice', label: 'Tenant invoices' }, { key: 'receipt', label: 'Receipts' }, { key: 'folio', label: 'Folios' }];
const HEAD = ['Document no.', 'Type', 'Unit', 'Period', 'Completed on', 'Status', 'Amount (RM)'];
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortName = ym => ym ? `${SHORT[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}` : '';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const dayText = ts => { if (!ts) return ''; const d = ts.toDate ? ts.toDate() : new Date(ts); return `${d.getDate()} ${SHORT[d.getMonth()]} ${d.getFullYear()}`; };
let params = new URLSearchParams(location.search);
const digits = code => String(code || '').replace(/^[A-Z]+\s*/i, '').replace(/[^0-9A-Z]/gi, '');
const yymm = ym => ym.slice(2, 4) + ym.slice(5, 7);

import OptionPicker from '@/components/OptionPicker.vue';
import MonthPicker from '@/components/MonthPicker.vue';
import OwnerPaymentModal, { PAY, payStatusOf } from '@/components/OwnerPaymentModal.vue';
const PAY_FILTERS = [{ value: 'all', label: 'Any payment status' }, { value: 'pending', label: 'Pending Payment' }, { value: 'paid', label: 'Paid' }, { value: 'none', label: 'Nothing to pay' }];
export default {
  components: { OptionPicker, MonthPicker, OwnerPaymentModal },
  beforeCreate() { params = new URLSearchParams(location.search); },
  data() {
    return {
      TYPE, FILTERS, HEAD, rm, amt, monthName, shortName, PAY, PAY_FILTERS, payFilter: 'all', paying: null, ok: '', menu: null,
      isDirector: me.role === 'director', canPay: me.role === 'director' || me.role === 'finance' || (me.perms || []).includes('invoices.edit'),
      properties: [], propertyId: params.get('property') || lastProperty(), month: params.get('month') || monthOffset(-1),
      months: Array.from({ length: 13 }, (_, i) => monthOffset(1 - i)),
      docs: [], picked: [], search: '', filter: 'all',
      viewing: null, preview: null, dl: { open: false, done: false, pct: 0, count: 0, file: '', url: '' },
      loading: true, busy: false, error: ''
    };
  },
  // Remember the property for the next page (see lib/last-property.js)
  watch: { propertyId(v) { rememberProperty(v); } },
  async mounted() {
    try {
      this.properties = await loadProperties();
      if (!this.properties.some(p => p.id === this.propertyId)) this.propertyId = this.properties[0]?.id || '';
      if (!this.months.includes(this.month)) this.months.push(this.month);
      await this.load();
    } catch (e) { this.error = friendlyError(e, 'load the page'); this.loading = false; }
  },
  computed: {
    propertyOptions() { return [...this.properties.map(p => ({ value: p.id, label: p.name }))]; }
  },
  methods: {
    // Summary cards: set the list's filter (if any) and scroll to it.
    kpiGo(key, ref = 'list') { if (key) this.filter = key; this.$nextTick(() => this.$refs[ref]?.scrollIntoView({ behavior: 'smooth', block: 'start' })); },
    property() { return this.properties.find(p => p.id === this.propertyId) || {}; },
    code() { return (this.property().code || this.property().name || 'WB').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4) || 'WB'; },

    async load() {
      if (!this.propertyId) { this.loading = false; return; }
      this.loading = true; this.error = ''; this.picked = []; this.dl.open = false;
      if (this.paying) this.paying = null;
      try {
        const snap = await getDocs(query(collection(db, 'statements'), where('propertyId', '==', this.propertyId), where('month', '==', this.month)));
        const code = this.code();
        const st = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => s.status === 'completed')
          .sort((a, b) => byUnit(a.unitCode, b.unitCode))
          .map(s => ({ id: s.id, type: 'statement', no: `OS-${code}-${yymm(this.month)}-${digits(s.unitCode)}`, unitCode: s.unitCode, month: s.month,
            amount: s.totals?.payout ?? 0, completedOn: dayText(s.completedAt), completedBy: s.completedByName || '', revision: s.revision || 1, statement: s }));
        this.docs = st;
      } catch (e) { this.error = friendlyError(e, 'load the documents'); }
      this.loading = false;
    },
    count(t) { return this.docs.filter(d => d.type === t).length; },
    // Owner payment status of a row (statements only); older completed statements without one count as waiting
    payOf(d) { return d.type === 'statement' ? payStatusOf(d.statement) : 'none'; },
    paidToOwners() { return this.docs.filter(d => d.type === 'statement' && this.payOf(d) === 'paid').reduce((s, d) => s + (Number(d.statement.paidAmount) || 0), 0); },
    waiting() { return this.docs.filter(d => d.type === 'statement' && ['pending', 'untracked'].includes(this.payOf(d))).length; },
    // Row Actions drop-down: Mark paid (or Payment once paid) and Recall (Director, not once paid)
    rowActions(d) {
      if (d.type !== 'statement') return [];
      const p = this.payOf(d), list = [];
      if (this.canPay && p !== 'none') list.push({ key: 'pay', label: p === 'paid' ? 'View payment' : 'Mark as paid' });
      if (this.isDirector && p !== 'paid') list.push({ key: 'recall', label: 'Recall statement' });
      return list;
    },
    openMenu(d, e) {
      if (this.menu?.id === d.id) { this.menu = null; return; }
      const r = e.currentTarget.getBoundingClientRect(), w = 180, h = 12 + this.rowActions(d).length * 38;
      const below = r.bottom + 6 + h <= window.innerHeight;
      this.menu = { id: d.id, d, x: Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)), y: below ? r.bottom + 6 : r.top - 6 - h };
    },
    pick(a, d) { this.menu = null; if (a.key === 'pay') this.paying = d; else this.$router.push(this.recallLink(d)); },
    recallLink(d) { return { path: '/Finance/month-end', query: { property: this.propertyId, month: d.month, unit: d.statement.unitId, recall: 1 } }; },
    shown() {
      const q = this.search.trim().toLowerCase();
      const pf = this.payFilter, payOk = d => pf === 'all' || (pf === 'pending' ? ['pending', 'untracked'].includes(this.payOf(d)) : this.payOf(d) === pf);
      return this.docs.filter(d => (this.filter === 'all' || d.type === this.filter) && payOk(d) && (!q || d.no.toLowerCase().includes(q) || d.unitCode.toLowerCase().includes(q)));
    },
    toggle(id) { this.picked = this.picked.includes(id) ? this.picked.filter(x => x !== id) : [...this.picked, id]; },
    allPicked() { const s = this.shown(); return s.length > 0 && s.every(d => this.picked.includes(d.id)); },
    toggleAll(on) { const ids = this.shown().map(d => d.id); this.picked = on ? [...new Set([...this.picked, ...ids])] : this.picked.filter(id => !ids.includes(id)); },
    pickedDocs() { return this.docs.filter(d => this.picked.includes(d.id)); },
    view(d) { this.viewing = d; },

    // ---- One document as read-only HTML (used by View and by the download) ----
    docHTML(d) {
      const prop = esc(this.property().name || '');
      const money = n => `RM ${amt(n)}`;
      const head = `<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;border-bottom:2px solid #F26D4D;padding-bottom:12px;margin-bottom:16px">
          <div style="font-weight:700;letter-spacing:.12em;color:#F26D4D;font-size:20px">WIDEBED</div>
          <div style="text-align:right;font-size:12px;color:#4B5260"><b style="color:#1A1D23;font-size:13px">${esc(TYPE[d.type]).toUpperCase()}</b><br>${esc(d.no)}<br>${prop} · ${esc(d.unitCode)} · ${esc(monthName(d.month))}</div></div>`;
      const tbl = (rows, foot) => `<table style="width:100%;border-collapse:collapse;font-size:12px">${rows.map(r => `<tr>${r.map((c, i) =>
        `<td style="padding:6px 4px;border-bottom:1px solid #EEF0F3;${i === r.length - 1 ? 'text-align:right;white-space:nowrap' : ''}">${c}</td>`).join('')}</tr>`).join('')}
        ${foot ? `<tr>${foot.map((c, i) => `<td style="padding:8px 4px;font-weight:700;border-top:1px solid #999;${i === foot.length - 1 ? 'text-align:right;white-space:nowrap' : ''}">${c}</td>`).join('')}</tr>` : ''}</table>`;
      if (d.type !== 'statement') {
        return head + `<p style="font-size:12px;margin:0 0 12px">${d.type === 'folio' ? 'Guest' : 'Tenant'}: ${esc(d.party)}<br>Date: ${esc(d.completedOn)}</p>`
          + tbl(d.items.map(([k, v]) => [esc(k), money(v)]), [d.type === 'receipt' ? 'Amount received' : 'Total', money(d.amount)]);
      }
      const s = d.statement, t = s.totals || {};
      const bk = (s.lines || []).map(l => [esc(l.reservationNo), esc(l.source || ''), `${esc(dmy(l.arrival))} – ${esc(dmy(l.departure))}`, money(l.pto)]);
      const ex = (s.expenseLines || []).map(e => [esc(dmy(e.date)), esc(e.description || ''), money(e.amount)]);
      const sum = s.fixed
        ? [['Fixed rent', money(t.totalReceivable)], ['Deductions', money(-(t.deduction || 0))], ['Reimbursements', money(t.reimburse || 0)]]
        : [['Total receivable', money(t.totalReceivable)], ['Service fee', money(-(t.serviceFee || 0))], ['Utilities', money(-(t.utilityFee || 0))],
           ...(t.sstOnFee ? [['SST on fee', money(-t.sstOnFee)]] : []), ["Owner's entitlement", money(t.entitlement)],
           ['Expenses & reimbursements', money(t.totalExpenses || 0)], ['Rounding to 5 sen', money(t.roundingAdjust || 0)]];
      return head + `<p style="font-size:12px;margin:0 0 12px">${esc(s.arrangementLabel || '')} · completed ${esc(d.completedOn)}${d.completedBy ? ` by ${esc(d.completedBy)}` : ''} · revision ${d.revision}</p>`
        + (bk.length ? `<h4 style="margin:0 0 6px;font-size:13px">Bookings</h4>` + tbl(bk) + '<br>' : '')
        + (ex.length ? `<h4 style="margin:0 0 6px;font-size:13px">Expenses & reimbursements</h4>` + tbl(ex) + '<br>' : '')
        + `<h4 style="margin:0 0 6px;font-size:13px">Statement summary</h4>` + tbl(sum, ['Payout to owner', money(t.payout)]);
    },

    // ---- Downloads. PDF files come later: for now one read-only HTML page holding the documents ----
    // Owner statements download as real PDFs (Finance's layout, from the frozen statement); several are merged into one PDF.
    async downloadPdfs(list) {
      this.viewing = null;
      this.dl = { open: true, done: false, pct: 0, count: list.length, file: this.fileName('pdf', list.length === 1 ? list[0].no : null), url: '' };
      const X = await loadPdfKit();
      const out = [];
      for (let i = 0; i < list.length; i++) {
        const s = list[i].statement;
        out.push(await buildStatementPdf(X.lib, X.fontkit, X.fonts, {
          unitCode: s.unitCode, month: s.month, rates: s.rates, payout: s.totals?.payout ?? 0, payouts: {},
          lines: (s.lines || []).map(l => ({ source: l.source, arrival: l.arrival, departure: l.departure, nights: l.nights, amount: l.pto })),
          expenses: (s.expenseLines || []).map(e => ({ description: e.description, amount: e.amount })), nextBooking: null }));
        this.dl.pct = Math.round(((i + 1) / list.length) * 100);
      }
      let bytes = out[0];
      if (out.length > 1) {
        const merged = await X.lib.PDFDocument.create();
        for (const b of out) { const src = await X.lib.PDFDocument.load(b); (await merged.copyPages(src, src.getPageIndices())).forEach(pg => merged.addPage(pg)); }
        bytes = await merged.save();
      }
      const blob = new Blob([bytes], { type: 'application/pdf' });
      this.dl.url = URL.createObjectURL(blob);
      download(this.dl.file, blob);
      this.dl.done = true;
    },
    async downloadDocs(list) {
      if (!list.length) return;
      if (this.dl.url) URL.revokeObjectURL(this.dl.url);
      if (list.every(d => d.type === 'statement' && !d.statement?.fixed)) {
        try { await this.downloadPdfs(list); return; } catch (e) { this.dl.open = false; this.error = e.code ? friendlyError(e, 'make the PDF') : e.message; return; }
      }
      if (this.dl.url) URL.revokeObjectURL(this.dl.url);
      this.viewing = null;
      this.dl = { open: true, done: false, pct: 0, count: list.length, file: this.fileName('html', list.length === 1 ? list[0].no : null), url: '' };
      const parts = [];
      for (let i = 0; i < list.length; i++) {
        parts.push(`<section style="page-break-after:always;max-width:760px;margin:24px auto;padding:24px;border:1px solid #E5E7EB;border-radius:10px">${this.docHTML(list[i])}</section>`);
        this.dl.pct = Math.round(((i + 1) / list.length) * 100);
        await new Promise(r => setTimeout(r, Math.max(30, 400 / list.length)));
      }
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(this.dl.file)}</title></head><body style="font-family:Inter,system-ui,sans-serif;color:#1A1D23;background:#F5F6F8;margin:0;padding:8px">${parts.join('')}</body></html>`;
      const blob = new Blob([html], { type: 'text/html' });
      this.dl.url = URL.createObjectURL(blob);
      download(this.dl.file, blob);
      this.dl.done = true;
    },
    openFile() { if (this.dl.url) window.open(this.dl.url, '_blank'); },
    fileName(ext, one = null) {
      return `${one || `Widebed ${this.property().name || ''} documents ${shortName(this.month)}`}.${ext}`.replace(/[\\/:*?"<>|']/g, '');
    },

    // ---- Export list (.xlsx), after a preview ----
    listRow(d) { return [d.no, TYPE[d.type], d.unitCode, shortName(d.month), d.completedOn, 'Completed', Math.round(d.amount * 100) / 100]; },
    openPreview(list) { if (list.length) this.preview = list; },
    async exportXlsx() {
      this.busy = true;
      try {
        const X = await loadXlsxLib();
        const meta = [[`Widebed · Invoices & Receipts · ${this.property().name || ''} · ${monthName(this.month)}`], [`Exported by ${me.name} on ${new Date().toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' })}`], []];
        const ws = X.utils.aoa_to_sheet([...meta, HEAD, ...this.preview.map(d => this.listRow(d))]);
        if (ws.A1) ws.A1.s = { font: { bold: true, sz: 13 } };
        HEAD.forEach((_, c) => { const a = X.utils.encode_cell({ r: meta.length, c }); if (ws[a]) ws[a].s = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '15293D' } } }; });
        this.preview.forEach((_, i) => { const a = X.utils.encode_cell({ r: meta.length + 1 + i, c: 6 }); if (ws[a]) ws[a].z = '#,##0.00;-#,##0.00'; });
        ws['!cols'] = [{ wch: 22 }, { wch: 16 }, { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 11 }, { wch: 14 }, { wch: 8 }];
        const wb = X.utils.book_new();
        X.utils.book_append_sheet(wb, ws, 'Documents');
        download(this.fileName('xlsx'), new Blob([X.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
        toast(`Exported ${this.preview.length} rows.`);
        this.preview = null;
      } catch (e) { this.error = friendlyError(e, 'make the xlsx'); }
      this.busy = false;
    }
  }
};
</script>

<style scoped>
    .docs-table td:first-child, .docs-table th:first-child { width: 36px; padding-right: 0; }
    .docs-table .acts { white-space: nowrap; text-align: right; }
    .docs-table .acts-in { display: inline-flex; align-items: center; justify-content: flex-end; gap: 6px; }
    .icon-act { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border: 0; border-radius: 8px; background: none; cursor: pointer; }
    .icon-act svg { width: 18px; height: 18px; fill: var(--accent); }
    .icon-act:hover { background: var(--accent-soft); }
    .am-back { position: fixed; inset: 0; z-index: 60; }
    .am-pop { position: fixed; z-index: 61; width: 180px; padding: 6px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,.14); }
    .am-pop button { display: block; width: 100%; text-align: left; padding: 9px 10px; border: 0; border-radius: 6px; background: none; font: inherit; font-size: 13px; color: var(--text); cursor: pointer; }
    .am-pop button:hover { background: var(--accent-soft); color: var(--accent); }
    .am-pop button.recall { color: var(--danger); }
    .dl-panel { border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; margin-bottom: 12px; background: var(--hover); display: grid; gap: 6px; }
    .dl-panel .progress { margin: 4px 0 0; }
    .dl-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
    .modal.doc { max-width: 760px; }
    .doc-paper { border: 1px solid var(--border); border-radius: 10px; padding: 24px; background: #fff; color: #1A1D23; max-height: 62vh; overflow: auto; }
    .preview-wrap { max-height: 56vh; overflow: auto; border: 1px solid var(--border); border-radius: 10px; }
    .preview-wrap table { font-size: 12px; }
    .ro-tag { font-size: 11px; font-weight: 600; color: var(--muted); background: var(--chip); border-radius: 999px; padding: 2px 8px; }
</style>
