<template>
  <main class="content">
    <div class="loading-bar" v-show="loading"></div>

    <div class="page-head">
      <div>
        <h1>Invoices & Receipts</h1>
        <div class="sub">Completed, final documents only · read-only</div>
      </div>
      <div class="head-tools">
        <select class="select" v-model="propertyId" @change="load()" aria-label="Property">
          <template v-for="p in properties" :key="p.id"><option :value="p.id" :selected="p.id === propertyId">{{ p.name }}</option></template>
        </select>
        <select class="select" v-model="month" @change="load()" aria-label="Month">
          <template v-for="m in months" :key="m"><option :value="m" :selected="m === month">{{ monthName(m) }}</option></template>
        </select>
      </div>
    </div>

    <div class="notice error" v-show="error">{{ error }}</div>
    <div class="notice warn" v-show="!loading && !properties.length">No properties yet. Upload an eZee report first; it creates the property and its units.</div>

    <section class="kpis">
      <button type="button" class="card kpi kpi-link" :class="{ on: filter === 'statement' }" @click="kpiGo('statement')"><div class="label">Owner statements</div><div class="value">{{ count('statement') }}</div>
        <div class="hint">{{ count('statement') ? `${shortName(month)} · completed` : `None completed for ${shortName(month)} yet` }}</div></button>
      <button type="button" class="card kpi kpi-link" :class="{ on: filter === 'invoice' }" @click="kpiGo('invoice')"><div class="label">Tenant invoices</div><div class="value">{{ count('invoice') }}</div><div class="hint">None yet. Rent invoices come with leases</div></button>
      <button type="button" class="card kpi kpi-link" :class="{ on: filter === 'receipt' }" @click="kpiGo('receipt')"><div class="label">Receipts</div><div class="value">{{ count('receipt') }}</div><div class="hint">None yet. Rent receipts come with leases</div></button>
      <button type="button" class="card kpi kpi-link" @click="kpiGo('statement')"><div class="label">Paid to owners</div><div class="value">{{ rm(paidToOwners()) }}</div><div class="hint">{{ `${shortName(month)} total` }}</div></button>
    </section>

    <div class="toolbar" ref="list">
      <input class="input" type="search" placeholder="Search document no. or unit…" v-model="search" aria-label="Search">
      <div class="pills">
        <template v-for="f in FILTERS" :key="f.key">
          <button class="pill-btn" :class="{ on: filter === f.key }" @click="filter = f.key">{{ f.label }}</button>
        </template>
      </div>
    </div>

    <section class="card">
      <div class="card-head"><h2>{{ `Documents · ${monthName(month)}` }}</h2></div>
      <p class="card-intro">Only documents Finance has approved and completed appear here. Drafts stay on Month-end payout and the unit statement. To correct a completed owner statement, a Director reopens it on the unit statement: a new revision is made and the old one is kept. Tenant invoices, receipts and folios will appear here once leases and rent invoices are built.</p>

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
        <span class="help">{{ dl.done ? `${dl.file} · PDF files come later: for now this is one read-only page holding every document. Open it and print to PDF if needed.` : 'Keep this page open.' }}</span>
      </div>

      <Paged :items="shown()" v-slot="{ pageRows }">
      <div class="table-wrap">
        <table class="table docs-table">
          <thead><tr>
            <th><input type="checkbox" aria-label="Tick all shown" :checked="allPicked()" @change="toggleAll($event.target.checked)"></th>
            <th>Document no.</th><th>Type</th><th>Unit</th><th>Period</th><th>Completed on</th><th class="num">Amount (RM)</th><th>Status</th><th></th>
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
                <td><span class="pill green">Completed</span></td>
                <td class="acts"><button class="editlink" @click="view(d)">View</button><button class="navlink" @click="downloadDocs([d])">↓ PDF</button></td>
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

export default {
  beforeCreate() { params = new URLSearchParams(location.search); },
  data() {
    return {
      TYPE, FILTERS, HEAD, rm, amt, monthName, shortName,
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
  methods: {
    // Summary cards: set the list's filter (if any) and scroll to it.
    kpiGo(key, ref = 'list') { if (key) this.filter = key; this.$nextTick(() => this.$refs[ref]?.scrollIntoView({ behavior: 'smooth', block: 'start' })); },
    property() { return this.properties.find(p => p.id === this.propertyId) || {}; },
    code() { return (this.property().code || this.property().name || 'WB').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4) || 'WB'; },

    async load() {
      if (!this.propertyId) { this.loading = false; return; }
      this.loading = true; this.error = ''; this.picked = []; this.dl.open = false;
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
    paidToOwners() { return this.docs.filter(d => d.type === 'statement').reduce((s, d) => s + Math.max(0, d.amount), 0); },
    shown() {
      const q = this.search.trim().toLowerCase();
      return this.docs.filter(d => (this.filter === 'all' || d.type === this.filter) && (!q || d.no.toLowerCase().includes(q) || d.unitCode.toLowerCase().includes(q)));
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
    async downloadDocs(list) {
      if (!list.length) return;
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
    .docs-table .acts button { margin-left: 10px; }
    .dl-panel { border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; margin-bottom: 12px; background: var(--hover); display: grid; gap: 6px; }
    .dl-panel .progress { margin: 4px 0 0; }
    .dl-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
    .modal.doc { max-width: 760px; }
    .doc-paper { border: 1px solid var(--border); border-radius: 10px; padding: 24px; background: #fff; color: #1A1D23; max-height: 62vh; overflow: auto; }
    .preview-wrap { max-height: 56vh; overflow: auto; border: 1px solid var(--border); border-radius: 10px; }
    .preview-wrap table { font-size: 12px; }
    .ro-tag { font-size: 11px; font-weight: 600; color: var(--muted); background: var(--chip); border-radius: 999px; padding: 2px 8px; }
</style>
