<template>
  <main class="content">
    <div class="loading-bar" v-show="loading"></div>

    <div class="page-head">
      <div>
        <h1>Expenses & Reimbursements</h1>
        <div class="sub">{{ `${propName()} · ${monthName(month)} · add them as they happen; each line goes onto its unit's statement` }}</div>
      </div>
      <div class="head-tools">
        <select class="select" v-model="propertyId" @change="load()" aria-label="Property">
          <template v-for="p in properties" :key="p.id"><option :value="p.id" :selected="p.id === propertyId">{{ p.name }}</option></template>
        </select>
        <select class="select" v-model="month" @change="load()" aria-label="Statement month">
          <template v-for="m in months" :key="m"><option :value="m" :selected="m === month">{{ monthName(m) }}</option></template>
        </select>
      </div>
    </div>

    <div class="notice error" v-show="error">{{ error }}</div>
    <div class="notice ok" v-show="okMsg">{{ okMsg }}</div>
    <div class="notice warn" v-show="completed">This month is completed, so its lines are read-only. Add new costs to the next open month.</div>
    <div class="notice warn" v-show="!completed && doneUnits.length">{{ `${doneUnits.map(unitCode).join(', ')} ${doneUnits.length === 1 ? 'is' : 'are'} completed for ${monthName(month)}, so ${doneUnits.length === 1 ? 'its' : 'their'} lines are read-only. Other units stay open.` }}</div>
    <div class="notice warn" v-show="!loading && !properties.length">No properties yet. Upload an eZee report first; it creates the property and its units.</div>

    <section class="card">
      <div class="card-head">
        <h2>{{ `${monthName(month)} · ${live().length} line${live().length === 1 ? '' : 's'}` }}</h2>
        <button class="btn btn-primary" @click="openAdd()" :disabled="completed || !units.length">+ Add line</button>
      </div>
      <p class="card-intro">Add an expense or reimbursement on the day it happens, for any unit, fixed rent included. Expenses are deducted on the unit's statement; reimbursements are money back to the owner and are added. Lines can be edited with a reason until that unit's statement for the month is completed.</p>
      <div class="toolbar">
        <input class="input" type="search" placeholder="Search unit, e.g. DM 14-02" v-model="search" aria-label="Search" style="max-width:220px">
        <div class="pills">
          <template v-for="f in filters" :key="f.key">
            <button class="pill-btn" :class="{ on: filter === f.key }" @click="filter = f.key">{{ f.label }}</button>
          </template>
        </div>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Date</th><th>Unit</th><th>Type</th><th>Description</th><th>Added by</th><th class="num">Amount (RM)</th><th></th></tr></thead>
          <tbody>
            <template v-for="e in shown()" :key="e.id">
              <tr :class="{ bf: e.kind === 'broughtForward' }">
                <td>{{ ddmm(e.date) }}</td>
                <td>{{ unitCode(e.unitId) }}</td>
                <td>{{ typeLabel(e.type) }}</td>
                <td>{{ e.description }}</td>
                <td class="muted">{{ e.auto ? 'System' : (e.createdByName || '') }}</td>
                <td class="num" :class="e.kind === 'reimburse' ? 'pos-amt' : 'neg-amt'">{{ (e.kind === 'reimburse' ? '+' : '-') + amt(e.amount) }}</td>
                <td class="row-end">
                  <span class="auto-chip" v-show="e.auto">{{ `Auto · from ${prevShort()}` }}</span>
                  <span class="clip" v-show="(e.files || []).length" title="Files">{{ (e.files || []).length }}</span>
                  <button class="editlink" v-show="canEdit(e)" @click="openEdit(e)">Edit</button>
                </td>
              </tr>
            </template>
            <tr v-show="!loading && !shown().length"><td colspan="7" class="muted">No lines for this month yet.</td></tr>
          </tbody>
          <tfoot v-show="live().length">
            <tr><td colspan="2"></td><td colspan="3">Total expenses</td><td class="num neg-amt">{{ '-' + amt(total('expense') + total('broughtForward')) }}</td><td></td></tr>
            <tr><td colspan="2"></td><td colspan="3">Total reimbursements</td><td class="num pos-amt">{{ '+' + amt(total('reimburse')) }}</td><td></td></tr>
          </tfoot>
        </table>
      </div>
      <p class="card-foot" style="display:block">Brought forward is added by the PMS when a unit's statement is completed with a negative balance, so nobody types it and it can't be edited here. For fixed-rent units, expense lines make up the Deduction and reimbursements make up Reimburse on Month-end payout.</p>
    </section>

    <!-- Add / Edit panel -->
    <template v-if="panelOpen">
      <div>
        <div class="drawer-back" @click="close()"></div>
        <aside class="drawer" role="dialog" :aria-label="panel.id ? 'Edit line' : 'Add line'" v-esc="() => { close() }">
          <div class="drawer-head">
            <div><h2>{{ panel.id ? 'Edit line' : 'Add line' }}</h2>
              <div class="help" style="margin-top:6px">Goes onto the unit's statement for the statement month, as its own line.</div></div>
            <button class="icon-btn" @click="close()" aria-label="Close">×</button>
          </div>
          <form class="drawer-body" id="expForm" @submit.prevent="save()">
            <div class="notice error" v-show="panel.error">{{ panel.error }}</div>
            <div class="seg">
              <button type="button" :class="{ on: panel.kind === 'expense' }" @click="panel.kind = 'expense'">Expense (deduct)</button>
              <button type="button" :class="{ on: panel.kind === 'reimburse' }" @click="panel.kind = 'reimburse'">Reimbursement (add)</button>
            </div>
            <div class="field">
              <label for="eUnit">Unit</label>
              <select class="input" id="eUnit" v-model="panel.unitId" required>
                <option value="">Choose a unit</option>
                <template v-for="opt in units" :key="opt.id"><option :value="opt.id" :selected="opt.id === panel.unitId" :disabled="panel.month === month && unitDone(opt.id)">{{ opt.unitCode + (panel.month === month && unitDone(opt.id) ? ' (completed)' : '') }}</option></template>
              </select>
            </div>
            <div class="grid-fields">
              <div class="field"><label for="eDate">Date</label><input class="input" id="eDate" type="date" v-model="panel.date" required></div>
              <div class="field">
                <label for="eMonth">Statement month</label>
                <select class="input" id="eMonth" v-model="panel.month" :disabled="!!panel.id">
                  <template v-for="m in months" :key="m"><option :value="m" :selected="m === panel.month">{{ monthName(m) }}</option></template>
                </select>
              </div>
            </div>
            <div class="field">
              <label for="eType">Type</label>
              <select class="input" id="eType" v-model="panel.type">
                <template v-for="t in TYPES" :key="t[0]"><option :value="t[0]" :selected="t[0] === panel.type">{{ t[1] }}</option></template>
              </select>
            </div>
            <div class="field"><label for="eDesc">Description</label><input class="input" id="eDesc" v-model="panel.description" placeholder="e.g. Replace bathroom tap" required></div>
            <div class="grid-fields">
              <div class="field"><label for="eCost">Cost (RM)</label><input class="input" id="eCost" type="number" step="0.01" min="0.01" v-model="panel.cost" placeholder="What it actually cost" required></div>
              <div class="field">
                <label for="eMargin">Margin</label>
                <div class="margin-row">
                  <div class="seg mini">
                    <button type="button" :class="{ on: panel.marginType === 'pct' }" @click="panel.marginType = 'pct'">%</button>
                    <button type="button" :class="{ on: panel.marginType === 'rm' }" @click="panel.marginType = 'rm'">RM</button>
                  </div>
                  <input class="input" id="eMargin" type="number" step="0.01" min="0" v-model="panel.marginValue" placeholder="0">
                </div>
              </div>
            </div>
            <div class="field">
              <label for="eAmt">Amount (RM)</label>
              <input class="input readonly" id="eAmt" :value="amountOf(panel) ? amt(amountOf(panel)) : ''" readonly tabindex="-1" placeholder="Cost + Margin">
              <div class="help">{{ amountOf(panel) ? `Cost ${amt(panel.cost)} + margin ${panel.marginType === 'pct' ? (Number(panel.marginValue) || 0) + '%' : 'RM ' + amt(panel.marginValue || 0)}. Shown on the statement as ${panel.kind === 'reimburse' ? '+' : '-'}${amt(amountOf(panel))}.` : 'Worked out from Cost + Margin; it can\'t be typed.' }}</div>
            </div>
            <div class="field">
              <label for="eFile">Receipt (optional)</label>
              <input class="input" id="eFile" v-model="panel.fileLink" placeholder="Paste the Google Drive link of the receipt">
              <div class="help">Receipts are kept in the company Google Drive; the PMS keeps only the link.</div>
            </div>
            <template v-if="panel.id">
              <div class="field"><label for="eReason">Reason for the change (audit log)</label>
                <textarea class="input" id="eReason" v-model="panel.reason" placeholder="e.g. Wrong amount typed, receipt says 543.40"></textarea></div>
            </template>
          </form>
          <div class="drawer-foot">
            <button class="btn" v-show="panel.id" @click="remove()" :disabled="panel.busy" style="margin-right:auto">Remove</button>
            <button class="btn" @click="close()">Cancel</button>
            <button class="btn btn-primary" type="submit" form="expForm" :disabled="panel.busy">{{ panel.busy ? 'Saving…' : 'Save line' }}</button>
          </div>
        </aside>
      </div>
    </template>
  </main>
</template>

<script>
import { collection, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase.js';
import { loadProperties, loadUnits, loadExpenses, monthDoc, completedUnitIds, audit, friendlyError } from '@/lib/finance-data.js';
import { rm, amt, dmy, ddmm, monthName, shortMonth, monthOffset, dayOffset } from '@/lib/format.js';
import { useSession } from '@/stores/session.js';

const me = useSession();

const KINDS = { expense: 'Expense', reimburse: 'Reimburse', broughtForward: 'Brought forward' };
const TYPES = [['maintenance', 'Maintenance (repair work)'], ['sewerage', 'Sewerage (IWK)'], ['internet', 'Internet'], ['mfsf', 'Maintenance fee & sinking fund (MFSF)'],
  ['insurance', 'Fire & general insurance'], ['electricity', 'Electricity (TNB)'], ['water', 'Water'], ['ownerInvoice', 'Owner invoice (OWSS)'],
  ['procurement', 'Item bought for owner'], ['reimburse', 'Reimbursement'], ['broughtForward', 'Brought forward'], ['other', 'Other']];
let params = new URLSearchParams(location.search);

export default {
  beforeCreate() { params = new URLSearchParams(location.search); },
  data() {
    return {
      KINDS, TYPES, rm, amt, dmy, ddmm, monthName,
      properties: [], units: [], expenses: [],
      propertyId: params.get('property') || '', month: params.get('month') || monthOffset(-1),
      months: Array.from({ length: 13 }, (_, i) => monthOffset(1 - i)),
      completed: false, doneUnits: [], loading: true, error: '', okMsg: '',
      search: '', filter: 'all',
      filters: [{ key: 'all', label: 'All' }, { key: 'expense', label: 'Expenses' }, { key: 'reimburse', label: 'Reimbursements' }, { key: 'broughtForward', label: 'Brought forward' }],
      panel: {}, panelOpen: false
    };
  },
  async mounted() {
    try {
      this.properties = await loadProperties();
      if (!this.properties.some(p => p.id === this.propertyId)) this.propertyId = this.properties[0]?.id || '';
      if (!this.months.includes(this.month)) this.months.push(this.month);
      await this.load();
      if (params.has('add')) this.openAdd();
    } catch (e) { this.error = friendlyError(e, 'load the page'); this.loading = false; }
  },
  methods: {
    async load() {
      if (!this.propertyId) { this.loading = false; return; }
      this.loading = true; this.error = '';
      try {
        const [units, expenses, m, done] = await Promise.all([loadUnits(this.propertyId), loadExpenses(this.propertyId, this.month), monthDoc(this.propertyId, this.month),
          completedUnitIds(this.propertyId, this.month)]);
        this.units = units; this.expenses = expenses; this.completed = m.status === 'completed'; this.doneUnits = [...done];
      } catch (e) { this.error = friendlyError(e, 'load expenses'); }
      this.loading = false;
    },
    propName() { return this.properties.find(p => p.id === this.propertyId)?.name || ''; },
    prevShort() { const [y, m] = this.month.split('-').map(Number); return shortMonth(m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`); },
    // Amount is never typed: Cost + Margin (% of cost, or RM), rounded to the sen.
    amountOf(p) {
      const cost = Number(p.cost) || 0, mv = Number(p.marginValue) || 0;
      if (!(cost > 0)) return 0;
      return Math.round((p.marginType === 'pct' ? cost * (1 + mv / 100) : cost + mv) * 100) / 100;
    },
    unitCode(id) { return this.units.find(u => u.id === id)?.unitCode || id; },
    typeLabel(t) { return (TYPES.find(x => x[0] === t) || [, t])[1]; },
    live() { return this.expenses.filter(e => !e.deleted); },
    total(kind) { return this.live().filter(e => e.kind === kind).reduce((s, e) => s + Number(e.amount || 0), 0); },
    shown() {
      const q = this.search.trim().toLowerCase();
      return this.live()
        .filter(e => this.filter === 'all' || e.kind === this.filter)
        .filter(e => !q || this.unitCode(e.unitId).toLowerCase().includes(q) || (e.description || '').toLowerCase().includes(q))
        .sort((a, b) => this.unitCode(a.unitId).localeCompare(this.unitCode(b.unitId), 'en', { numeric: true }) || (a.date || '').localeCompare(b.date || ''));
    },
    // Completion is per unit: a completed unit's lines for this month are read-only, other units stay open.
    unitDone(id) { return this.doneUnits.includes(id); },
    canEdit(e) { return !this.completed && !this.unitDone(e.unitId) && !e.auto; },

    openAdd() {
      this.okMsg = '';
      const today = dayOffset(0);
      this.panel = { id: null, kind: 'expense', unitId: '', date: today.slice(0, 7) === this.month ? today : `${this.month}-01`, month: this.month,
        type: 'maintenance', description: '', cost: '', marginType: 'pct', marginValue: '', fileLink: '', reason: '', busy: false, error: '' };
      this.panelOpen = true;
    },
    openEdit(e) {
      this.okMsg = '';
      this.panel = { id: e.id, original: e, kind: e.kind, unitId: e.unitId, date: e.date, month: e.month, type: e.type, description: e.description || '',
        cost: e.cost ?? e.amount, marginType: e.marginType || 'pct', marginValue: e.marginValue ?? '', fileLink: e.files?.[0]?.link || '', reason: '', busy: false, error: '' };
      this.panelOpen = true;
    },
    close() { if (!this.panel.busy) this.panelOpen = false; },

    async save() {
      const p = this.panel; p.error = '';
      const amount = this.amountOf(p);
      if (!p.unitId) return p.error = 'Choose the unit.';
      if (!(amount > 0)) return p.error = 'Enter the cost (above zero). Pick Reimbursement for money paid back to the owner.';
      if ((Number(p.marginValue) || 0) < 0) return p.error = 'The margin can\'t be below zero.';
      if (!p.description.trim()) return p.error = 'Add a description, e.g. the invoice number.';
      if (p.month === this.month ? this.unitDone(p.unitId) : (await completedUnitIds(this.propertyId, p.month)).has(p.unitId))
        return p.error = `${this.unitCode(p.unitId)} is completed for ${monthName(p.month)}. Pick an open month.`;
      const data = { propertyId: this.propertyId, unitId: p.unitId, date: p.date, month: p.month, kind: p.kind, type: p.type,
        description: p.description.trim(), amount,
        cost: Math.round(Number(p.cost) * 100) / 100, marginType: p.marginType, marginValue: Number(p.marginValue) || 0 };
      const link = p.fileLink.trim();
      p.busy = true;
      try {
        const b = writeBatch(db);
        if (!p.id) {
          const ref = doc(collection(db, 'expenses'));
          b.set(ref, { ...data, auto: false, sourceStatementId: null, files: link ? [{ name: 'Receipt', link, addedBy: me.name, addedAt: dayOffset(0) }] : [], deleted: false,
            createdBy: me.user.uid, createdByName: me.name, createdAt: serverTimestamp() });
          audit(b, me, { action: 'expense.create', entity: `expenses/${ref.id}`, propertyId: this.propertyId, month: p.month,
            changes: [{ field: 'amount', old: null, new: amount }] });
        } else {
          const o = { ...p.original, cost: p.original.cost ?? p.original.amount, marginType: p.original.marginType || 'pct', marginValue: p.original.marginValue ?? 0 };
          const changes = Object.keys(data).filter(k => String(o[k] ?? '') !== String(data[k] ?? '')).map(k => ({ field: k, old: o[k] ?? null, new: data[k] }));
          const oldLink = o.files?.[0]?.link || '';
          if (link !== oldLink) { data.files = link ? [{ name: 'Receipt', link, addedBy: me.name, addedAt: dayOffset(0) }] : []; changes.push({ field: 'files', old: oldLink || null, new: link || null }); }
          if (!changes.length) { p.busy = false; this.panelOpen = false; return; }
          if (!p.reason.trim()) { p.busy = false; return p.error = 'Add a short reason. It goes in the audit log.'; }
          b.update(doc(db, 'expenses', p.id), { ...data, updatedBy: me.user.uid, updatedByName: me.name, updatedAt: serverTimestamp() });
          audit(b, me, { action: 'expense.update', entity: `expenses/${p.id}`, propertyId: this.propertyId, month: p.month, changes, reason: p.reason.trim() });
        }
        await b.commit();
        this.okMsg = `${p.id ? 'Updated' : 'Added'}: ${this.unitCode(p.unitId)}, ${p.description.trim()}, RM ${amt(amount)}` + (p.month !== this.month ? ` (on ${monthName(p.month)})` : '') + '.';
        p.busy = false; this.panelOpen = false;
        await this.load();
      } catch (e) { p.busy = false; p.error = friendlyError(e, 'save'); }
    },

    // Nothing is hard-deleted: the line is marked removed, with a reason.
    async remove() {
      const p = this.panel; p.error = '';
      if (!p.reason.trim()) return p.error = 'Type the reason for removing it first.';
      p.busy = true;
      try {
        const b = writeBatch(db);
        b.update(doc(db, 'expenses', p.id), { deleted: true, deletedReason: p.reason.trim(), updatedBy: me.user.uid, updatedByName: me.name, updatedAt: serverTimestamp() });
        audit(b, me, { action: 'expense.remove', entity: `expenses/${p.id}`, propertyId: this.propertyId, month: p.original.month,
          changes: [{ field: 'deleted', old: false, new: true }], reason: p.reason.trim() });
        await b.commit();
        this.okMsg = 'Line removed.';
        p.busy = false; this.panelOpen = false;
        await this.load();
      } catch (e) { p.busy = false; p.error = friendlyError(e, 'remove'); }
    }
  }
};
</script>

<style scoped>
    .table tr.bf td { background: color-mix(in srgb, var(--amber-soft) 45%, var(--surface)); }
    .pos-amt { color: var(--green); }
    .table tfoot td { font-weight: 600; }
    .row-end { text-align: right; white-space: nowrap; }
    .row-end > * { margin-left: 10px; vertical-align: middle; }
    .auto-chip { font-size: 11px; font-weight: 500; color: var(--accent); background: var(--accent-soft); border-radius: 6px; padding: 3px 8px; }
    .clip { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 600; color: var(--accent); background: var(--accent-soft); border-radius: 6px; padding: 3px 8px; }
    .clip::before { content: "\1F4CE"; font-size: 11px; }
    .margin-row { display: flex; gap: 8px; }
    .seg.mini { margin: 0; flex: none; padding: 3px; }
    .seg.mini button { height: 34px; width: 40px; }
    .input.readonly { background: var(--chip); color: var(--text); font-weight: 600; cursor: default; }
    .drawer .seg { margin-bottom: 18px; }
</style>
