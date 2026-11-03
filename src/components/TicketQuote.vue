<template>
  <div class="card tq" v-if="show">
    <div class="card-head">
      <h2>Quote & invoice</h2>
      <span class="pill" :class="q ? STATUS[q.status].cls : 'grey'">{{ q ? STATUS[q.status].label : 'No quote' }}</span>
    </div>
    <div class="notice error" v-show="error">{{ error }}</div>
    <div class="loading-bar" v-show="loading"></div>

    <template v-if="!loading && !ticket.unitId">
      <p class="help">Office ticket: there is no owner or unit to charge, so it has no quote.</p>
    </template>

    <template v-else-if="!loading && !q">
      <p class="help">{{ `Add the vendor's quote here. The cost is charged to the owner of ${ticket.unit}: Finance approves it and adds the invoice to the unit's expenses.` }}</p>
      <button class="btn btn-primary tq-wide" v-if="canQuote" @click="openEdit()">+ Add quote</button>
    </template>

    <template v-else-if="q">
      <div class="kv"><span>Vendor</span><span>{{ q.vendor }}</span></div>
      <div class="tq-lines">
        <div class="tq-line" v-for="(l, i) in q.items" :key="i"><span>{{ l.desc }}<small v-if="l.qty !== 1"> × {{ l.qty }}</small></span><span>{{ amt(l.qty * l.price) }}</span></div>
        <div class="tq-line tq-total"><span>Total (RM)</span><span>{{ amt(q.total) }}</span></div>
      </div>
      <div class="kv" v-if="q.notes"><span>Notes</span><span class="tq-note">{{ q.notes }}</span></div>
      <div class="kv"><span>Charge to</span><span>{{ 'Owner · ' + ticket.unit }}</span></div>
      <template v-if="q.expenseId">
        <div class="kv"><span>Invoice</span><span>{{ (q.invoiceNo || '—') + ' · RM ' + amt(q.invoiceAmount) }}</span></div>
        <div class="kv"><span>On statement</span><span>{{ monthName(q.expenseMonth) }}</span></div>
        <div class="files" v-show="(q.invoiceFiles || []).length">
          <a class="file-chip" v-for="f in q.invoiceFiles" :key="f.link" :href="f.link" target="_blank" rel="noopener" @click.prevent="$emit('view', { name: f.name, url: f.link, kind: 'expenses' })">{{ '📄 ' + f.name }}</a>
        </div>
      </template>
      <div class="kv" v-if="q.status === 'paid'"><span>Vendor paid</span><span>{{ dmy(q.paidDate) + (q.paidRef ? ' · ' + q.paidRef : '') }}</span></div>
      <div class="kv" v-if="q.status === 'rejected'"><span>Rejected</span><span class="tq-note">{{ q.rejectReason }}</span></div>

      <!-- Same Actions menu as the ticket's own -->
      <div class="acts" v-if="actions.length && !rej">
        <button class="btn btn-primary" @click="menuOpen = !menuOpen" aria-haspopup="menu" :aria-expanded="String(menuOpen)">Actions
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></button>
        <div class="acts-back" v-if="menuOpen" @click="menuOpen = false"></div>
        <div class="acts-menu" v-if="menuOpen" role="menu">
          <button role="menuitem" v-for="a in actions" :key="a.key" :class="{ danger: a.danger }" :disabled="busy" @click="menuOpen = false; a.run()">{{ a.label }}</button>
        </div>
      </div>
      <div class="tq-rej" v-if="rej">
        <div class="notice error" v-show="rej.error">{{ rej.error }}</div>
        <ConfirmReason title="Reject this quote?" text="It stays on the ticket as Rejected. You can revise it later." label="Reason" placeholder="e.g. Too expensive, get another quote"
          v-model="rej.reason" confirm-text="Reject quote" danger :busy="busy" @confirm="reject()" @cancel="rej = null" />
      </div>
      <details class="tq-hist" v-if="(q.history || []).length">
        <summary>History</summary>
        <div v-for="(h, i) in [...q.history].reverse()" :key="i"><span class="when">{{ stamp(h.at) }}</span> <b>{{ h.by }}</b> {{ h.text }}</div>
      </details>
    </template>

    <!-- Add / edit quote -->
    <div class="modal-back" v-if="edit" @click.self="edit = null" v-esc="() => { edit = null }">
      <form class="modal" role="dialog" aria-label="Quote" style="max-width:560px" @submit.prevent="saveQuote()">
        <h2>{{ (q ? 'Edit quote' : 'Add quote') + ' · ' + ticket.id }}</h2>
        <div class="notice error" v-show="edit.error">{{ edit.error }}</div>
        <FormField id="tqVendor" label="Vendor" req v-model="edit.vendor" placeholder="e.g. ABC Aircond Services" />
        <div class="field">
          <label class="req">Items</label>
          <div class="tq-row tq-head"><span>Description</span><span>Qty</span><span>Price (RM)</span><span class="num">Amount</span><span></span></div>
          <div class="tq-row" v-for="(l, i) in edit.items" :key="i">
            <input class="input" v-model="l.desc" placeholder="e.g. Gas top-up" :aria-label="'Item ' + (i + 1)">
            <input class="input" type="number" min="1" step="1" v-model="l.qty" aria-label="Quantity">
            <input class="input" type="number" min="0" step="0.01" v-model="l.price" aria-label="Price">
            <span class="num">{{ amt(lineAmt(l)) }}</span>
            <button type="button" class="icon-btn" :disabled="edit.items.length === 1" @click="edit.items.splice(i, 1)" aria-label="Remove item">×</button>
          </div>
          <button type="button" class="btn" @click="edit.items.push(newItem())" :disabled="edit.items.length >= 20">+ Add item</button>
        </div>
        <div class="tq-sum"><span>Total</span><b>{{ 'RM ' + amt(itemsTotal(edit.items)) }}</b></div>
        <div class="field"><label for="tqNotes">Notes</label><textarea class="input" id="tqNotes" v-model="edit.notes" placeholder="e.g. Quote valid 14 days, parts included"></textarea></div>
        <div class="modal-foot"><button type="button" class="btn" @click="edit = null">Cancel</button><button class="btn btn-primary" :disabled="busy">Save quote</button></div>
      </form>
    </div>

    <!-- Invoice: becomes an expense on the owner's unit -->
    <div class="modal-back" v-if="inv" @click.self="inv = null" v-esc="() => { inv = null }">
      <form class="modal" role="dialog" aria-label="Add invoice" style="max-width:500px" @submit.prevent="saveInvoice()">
        <h2>Add invoice to owner statement</h2>
        <p class="help" style="font-size:13px">{{ `Adds an expense line on ${ticket.unit} for the month you pick. It is deducted from the owner's payout. Finance can still edit it on Expenses & Reimbursements until the unit's statement is completed.` }}</p>
        <div class="notice error" v-show="inv.error">{{ inv.error }}</div>
        <div class="grid-fields">
          <FormField id="tqInvNo" label="Invoice no." v-model="inv.no" placeholder="e.g. INV-2041" />
          <FormField id="tqInvDate" label="Invoice date" req type="date" v-model="inv.date" />
        </div>
        <div class="grid-fields">
          <FormField id="tqInvAmt" label="Invoice amount (RM)" req type="number" step="0.01" min="0.01" v-model="inv.amount" />
          <div class="field"><label class="req">Statement month</label>
            <OptionPicker class="tq-pick" v-model="inv.month" :options="months.map(m => ({ value: m, label: monthName(m) }))" label="Statement month" /></div>
        </div>
        <div class="help" v-if="Number(inv.amount) && Math.abs(Number(inv.amount) - q.total) > 0.004">{{ `Differs from the approved quote (RM ${amt(q.total)}). Say why in the description.` }}</div>
        <FormField id="tqDesc" label="Description on the statement" req v-model="inv.desc" />
        <div class="field"><label class="req">Invoice file</label>
          <div class="files" v-show="inv.files.length"><span class="file-chip" v-for="(f, i) in inv.files" :key="f.link">{{ '📄 ' + f.name }}<button type="button" @click="inv.files.splice(i, 1)" aria-label="Remove">×</button></span></div>
          <UploadFile kind="expenses" :record-id="ticket.id + '-invoice'" :folder-label="ticket.id + ' ' + ticket.unit" :label="inv.files.length ? '＋ Add another file' : '⬆ Upload invoice'" @done="addFiles" />
        </div>
        <div class="modal-foot"><button type="button" class="btn" @click="inv = null">Cancel</button><button class="btn btn-primary" :disabled="busy">{{ busy ? 'Saving…' : 'Add to statement' }}</button></div>
      </form>
    </div>

    <!-- Vendor paid -->
    <div class="modal-back" v-if="paid" @click.self="paid = null" v-esc="() => { paid = null }">
      <form class="modal" role="dialog" aria-label="Mark vendor paid" style="max-width:420px" @submit.prevent="savePaid()">
        <h2>Mark vendor paid</h2>
        <div class="notice error" v-show="paid.error">{{ paid.error }}</div>
        <FormField id="tqPaidDate" label="Paid on" req type="date" v-model="paid.date" />
        <FormField id="tqPaidRef" label="Payment reference" v-model="paid.ref" placeholder="e.g. bank transfer ref" />
        <div class="modal-foot"><button type="button" class="btn" @click="paid = null">Cancel</button><button class="btn btn-primary" :disabled="busy">Mark paid</button></div>
      </form>
    </div>

  </div>
</template>

<script>
// Quote and invoice for a ticket, in issueQuotes/{ticketId}. Anyone who can open the ticket adds, edits and sees the quote
// (Khairul, 3 Nov 2026). Director and Finance (Expenses Edit tick) approve, reject, add the invoice and mark it paid; the
// rules check that too. The cost is always charged to the unit's owner: "Add invoice to owner statement" writes an
// expense line on that unit and month.
// Status: quoted -> approved -> invoiced -> paid, or rejected (can be revised back to quoted).
import { doc, getDoc, collection, writeBatch, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase.js';
import { audit, friendlyError, completedUnitIds } from '@/lib/finance-data.js';
import { markDirty } from '@/lib/summary-data.js';
import { can } from '@/lib/access.js';
import { amt, dmy, monthName, monthOffset, dayOffset } from '@/lib/format.js';
import { useSession } from '@/stores/session.js';
import { notifyRole, notifyUser } from '@/services/notificationService.js';
import FormField from '@/components/FormField.vue';
import OptionPicker from '@/components/OptionPicker.vue';
import UploadFile from '@/components/UploadFile.vue';
import ConfirmReason from '@/components/ConfirmReason.vue';

const STATUS = { quoted: { label: 'Quoted', cls: 'amber' }, approved: { label: 'Approved', cls: 'blue' }, invoiced: { label: 'Invoiced', cls: 'blue' },
  paid: { label: 'Paid', cls: 'green' }, rejected: { label: 'Rejected', cls: 'red' } };
const r3 = n => Math.round((Number(n) || 0) * 1000) / 1000;   // formulas keep 3 decimals
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;     // money saved on an expense line
const pad = n => String(n).padStart(2, '0');
const nowIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };

export default {
  props: { ticket: { type: Object, required: true } },
  emits: ['view'],
  components: { FormField, OptionPicker, UploadFile, ConfirmReason },
  data() {
    const me = useSession();
    return { me, STATUS, q: null, loading: true, busy: false, error: '', edit: null, inv: null, paid: null, rej: null, menuOpen: false,
      months: [monthOffset(-1), monthOffset(0), monthOffset(1)] };
  },
  computed: {
    // Director, or anyone with the Expenses Edit tick (Finance by default). Same check as the rules.
    canFinance() { return can(this.me, 'expenses.edit'); },
    canQuote() { return !!this.me.role; },
    show() { return this.ticket.status !== 'deleted'; },
    // What this person can do next, in the Actions menu
    actions() {
      const q = this.q, st = q?.status, f = this.canFinance, list = [];
      if (!q || st === 'paid') return list;
      if (f && st === 'quoted') list.push({ key: 'approve', label: 'Approve', run: () => this.approve() });
      if (f && st === 'approved') list.push({ key: 'invoice', label: 'Add invoice to owner statement', run: () => this.openInvoice() });
      if (f && st === 'invoiced') list.push({ key: 'paid', label: 'Mark vendor paid', run: () => this.openPaid() });
      if (this.canQuote && ['quoted', 'rejected'].includes(st)) list.push({ key: 'edit', label: st === 'rejected' ? 'Revise quote' : 'Edit quote', run: () => this.openEdit() });
      if (f && ['quoted', 'approved'].includes(st)) list.push({ key: 'reject', label: 'Reject', danger: true, run: () => this.openReject() });
      return list;
    },
    qRef() { return doc(db, 'issueQuotes', this.ticket.id); }
  },
  async mounted() {
    if (!this.show) return;
    try { const s = await getDoc(this.qRef); this.q = s.exists() ? s.data() : null; }
    catch (e) { this.error = friendlyError(e, 'load the quote'); }
    this.loading = false;
  },
  methods: {
    amt, dmy, monthName,
    stamp(iso) { return iso ? `${dmy(iso.slice(0, 10))} ${iso.slice(11, 16)}` : ''; },
    newItem() { return { desc: '', qty: 1, price: '' }; },
    lineAmt(l) { return r3((Number(l.qty) || 0) * (Number(l.price) || 0)); },
    itemsTotal(items) { return r3(items.reduce((s, l) => s + this.lineAmt(l), 0)); },
    hist(text) { return { at: nowIso(), by: this.me.name, uid: this.me.user.uid, text }; },
    // One batch: the quote change plus its audit log entry (and, for the invoice, the expense line).
    async write(b, fields, text, action, changes = [], reason = '') {
      const h = this.hist(text);
      b.set(this.qRef, { ...fields, history: arrayUnion(h), updatedAt: serverTimestamp(), updatedBy: this.me.user.uid }, { merge: true });
      audit(b, this.me, { action, entity: `issueQuotes/${this.ticket.id}`, propertyId: this.ticket.propertyId || null, changes, reason });
      await b.commit();
      this.q = { ...this.q, ...fields, history: [...(this.q?.history || []), h] };
    },
    // The person who added the quote hears what happened to it (3 Nov 2026), unless they did it themselves
    tellQuoter(title, message) {
      const uid = this.q?.createdBy;
      if (!uid || uid === this.me.user.uid) return;
      notifyUser({ recipientUid: uid, type: 'issue', refId: this.ticket.id, link: `/Operations/issues?id=${this.ticket.id}`, title, message })
        .catch(e => console.error('Notification failed:', e));
    },
    tell(role, title, message) {
      if (role === this.me.role) return;
      notifyRole({ recipientRole: role, type: 'issue', refId: this.ticket.id, link: `/Operations/issues?id=${this.ticket.id}`, title, message })
        .catch(e => console.error('Notification failed:', e));
    },

    openEdit() {
      const q = this.q;
      this.edit = { vendor: q?.vendor || '', notes: q?.notes || '', error: '',
        items: q?.items?.length ? q.items.map(l => ({ ...l })) : [this.newItem()] };
    },
    async saveQuote() {
      const e = this.edit, t = this.ticket;
      const items = e.items.filter(l => l.desc.trim() || Number(l.price)).map(l => ({ desc: l.desc.trim(), qty: Math.max(1, Math.round(Number(l.qty) || 1)), price: r3(l.price) }));
      if (!e.vendor.trim()) return e.error = 'Add the vendor.';
      if (!items.length) return e.error = 'Add at least one item.';
      if (items.some(l => !l.desc)) return e.error = 'Every item needs a description.';
      if (items.some(l => !(l.price > 0))) return e.error = 'Every item needs a price above zero.';
      const total = this.itemsTotal(items), fresh = !this.q, revised = this.q?.status === 'rejected';
      const fields = { issueId: t.id, propertyId: t.propertyId || null, unitId: t.unitId, unitCode: t.unit || '', chargeTo: 'owner',
        vendor: e.vendor.trim(), items, total, notes: e.notes.trim(), status: 'quoted', rejectReason: '',
        ...(fresh ? { createdAt: serverTimestamp(), createdBy: this.me.user.uid, createdByName: this.me.name } : {}) };
      this.busy = true; e.error = '';
      try {
        await this.write(writeBatch(db), fields, `${fresh ? 'added' : revised ? 'revised' : 'edited'} the quote: ${fields.vendor}, RM ${amt(total)}`,
          fresh ? 'issueQuote.create' : 'issueQuote.update', [{ field: 'status', old: this.q?.status ?? null, new: 'quoted' }]);
        this.edit = null;
        const msg = `${this.me.name} ${fresh ? 'added' : 'updated'} a quote of RM ${amt(total)} from ${fields.vendor} for ${t.unit} ("${t.title}").`;
        this.tell('finance', `Quote on ${t.id} waits for approval`, msg);
        this.tell('director', `Quote on ${t.id} waits for approval`, msg);
      } catch (err) { e.error = friendlyError(err, 'save the quote'); }
      this.busy = false;
    },
    async approve() {
      this.busy = true; this.error = '';
      try {
        await this.write(writeBatch(db), { status: 'approved', approvedBy: this.me.name, approvedAt: serverTimestamp() },
          `approved the quote (RM ${amt(this.q.total)})`, 'issueQuote.approve', [{ field: 'status', old: 'quoted', new: 'approved' }]);
        this.tell('finance', `Quote on ${this.ticket.id} approved`, `${this.me.name} approved RM ${amt(this.q.total)} from ${this.q.vendor} for ${this.ticket.unit}. Add the invoice when it comes in.`);
        this.tellQuoter(`Your quote on ${this.ticket.id} was approved`, `${this.me.name} approved RM ${amt(this.q.total)} from ${this.q.vendor} for ${this.ticket.unit}.`);
      } catch (e) { this.error = friendlyError(e, 'approve the quote'); }
      this.busy = false;
    },
    openReject() { this.rej = { reason: '', error: '' }; },
    async reject() {
      const reason = this.rej.reason.trim(), old = this.q.status; this.busy = true; this.rej.error = '';
      try {
        await this.write(writeBatch(db), { status: 'rejected', rejectReason: reason }, `rejected the quote · reason: "${reason}"`,
          'issueQuote.reject', [{ field: 'status', old, new: 'rejected' }], reason);
        this.rej = null;
        this.tell('finance', `Quote on ${this.ticket.id} rejected`, `${this.me.name} rejected the quote from ${this.q.vendor}. Reason: ${reason}`);
        this.tellQuoter(`Your quote on ${this.ticket.id} was rejected`, `${this.me.name} rejected the quote from ${this.q.vendor}. Reason: ${reason}`);
      } catch (e) { this.rej.error = friendlyError(e, 'reject the quote'); }
      this.busy = false;
    },

    openInvoice() {
      const today = dayOffset(0), t = this.ticket;
      this.inv = { no: '', date: today, amount: String(r2(this.q.total)), month: this.months.includes(today.slice(0, 7)) ? today.slice(0, 7) : this.months[1],
        desc: `${t.id} · ${t.title} · ${this.q.vendor}`.slice(0, 120), files: [], error: '' };
    },
    addFiles(list) { for (const f of list) if (!this.inv.files.some(x => x.link === f.url)) this.inv.files.push({ name: f.name, link: f.url }); },
    async saveInvoice() {
      const v = this.inv, t = this.ticket, amount = r2(v.amount);
      if (!v.date) return v.error = 'Add the invoice date.';
      if (!(amount > 0)) return v.error = 'Enter the invoice amount (above zero).';
      if (!v.desc.trim()) return v.error = 'Add a description for the statement.';
      if (!v.files.length) return v.error = 'Upload the invoice first.';
      this.busy = true; v.error = '';
      try {
        if ((await completedUnitIds(t.propertyId, v.month)).has(t.unitId)) { this.busy = false; return v.error = `${t.unit} is completed or sent to the Director for ${monthName(v.month)}. Pick another month.`; }
        const b = writeBatch(db), eRef = doc(collection(db, 'expenses'));
        const files = v.files.map(f => ({ name: f.name || 'Invoice', link: f.link, addedBy: this.me.name, addedAt: dayOffset(0) }));
        b.set(eRef, { propertyId: t.propertyId, unitId: t.unitId, date: v.date, month: v.month, kind: 'expense', type: 'maintenance',
          description: v.desc.trim(), amount, cost: amount, marginType: 'pct', marginValue: 0, issueId: t.id,
          auto: false, sourceStatementId: null, files, deleted: false, createdBy: this.me.user.uid, createdByName: this.me.name, createdAt: serverTimestamp() });
        audit(b, this.me, { action: 'expense.create', entity: `expenses/${eRef.id}`, propertyId: t.propertyId, month: v.month, changes: [{ field: 'amount', old: null, new: amount }], reason: `From ticket ${t.id}` });
        markDirty(b, t.propertyId, v.month, [t.unitId]);
        await this.write(b, { status: 'invoiced', invoiceNo: v.no.trim(), invoiceDate: v.date, invoiceAmount: amount, invoiceFiles: v.files, expenseId: eRef.id, expenseMonth: v.month },
          `added invoice ${v.no.trim() || ''} RM ${amt(amount)} to ${t.unit}, ${monthName(v.month)} statement`.replace('  ', ' '), 'issueQuote.invoice',
          [{ field: 'status', old: 'approved', new: 'invoiced' }, { field: 'expenseId', old: null, new: eRef.id }]);
        this.inv = null;
        this.tell('finance', `Invoice for ${t.id} added to ${t.unit}`, `RM ${amt(amount)} is now an expense on ${t.unit} for ${monthName(v.month)}.`);
        this.tellQuoter(`Invoice for ${t.id} added`, `RM ${amt(amount)} from ${this.q.vendor} is on ${t.unit}'s ${monthName(v.month)} statement.`);
      } catch (e) { v.error = friendlyError(e, 'add the invoice'); }
      this.busy = false;
    },
    openPaid() { this.paid = { date: dayOffset(0), ref: '', error: '' }; },
    async savePaid() {
      const p = this.paid;
      if (!p.date) return p.error = 'Add the date it was paid.';
      this.busy = true; p.error = '';
      try {
        await this.write(writeBatch(db), { status: 'paid', paidDate: p.date, paidRef: p.ref.trim(), paidBy: this.me.name },
          `marked the vendor paid on ${dmy(p.date)}`, 'issueQuote.paid', [{ field: 'status', old: 'invoiced', new: 'paid' }]);
        this.paid = null;
        this.tellQuoter(`Vendor paid for ${this.ticket.id}`, `${this.me.name} marked ${this.q.vendor} paid on ${dmy(p.date)}.`);
      } catch (e) { p.error = friendlyError(e, 'mark it paid'); }
      this.busy = false;
    }
  }
};
</script>

<style scoped>
.tq-wide { width: 100%; margin-top: 8px; }
.tq-lines { border: 1px solid var(--border); border-radius: 10px; padding: 6px 10px; margin: 8px 0; font-size: 13px; }
.tq-line { display: flex; justify-content: space-between; gap: 10px; padding: 5px 0; }
.tq-line + .tq-line { border-top: 1px solid var(--line, var(--border)); }
.tq-line small { color: var(--muted); }
.tq-total { font-weight: 700; }
.tq-note { white-space: pre-wrap; overflow-wrap: anywhere; }
.tq-rej { margin-top: 12px; }
.acts { position: relative; margin-top: 14px; }
.acts > .btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; width: 100%; }
.acts-back { position: fixed; inset: 0; z-index: 20; }
.acts-menu { position: absolute; left: 0; right: 0; bottom: calc(100% + 6px); z-index: 21; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,.12); padding: 6px; display: grid; }
.acts-menu button { text-align: left; background: none; border: 0; padding: 9px 12px; border-radius: 8px; font: inherit; font-size: 14px; color: var(--text); cursor: pointer; }
.acts-menu button:hover:not(:disabled) { background: var(--accent-soft); color: var(--accent); }
.acts-menu button.danger { color: var(--danger); }
.acts-menu button.danger:hover { background: color-mix(in srgb, var(--danger) 12%, transparent); color: var(--danger); }
.tq-hist { margin-top: 12px; font-size: 12px; color: var(--text-2); }
.tq-hist summary { cursor: pointer; font-weight: 600; }
.tq-hist div { padding: 4px 0; }
.tq-hist .when { color: var(--muted); }
.files { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
.file-chip { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--border); border-radius: 6px; padding: 4px 8px; font-size: 12px; background: var(--surface); }
.file-chip button { border: 0; background: none; color: var(--muted); padding: 0 0 0 2px; cursor: pointer; }
a.file-chip { color: var(--accent); text-decoration: none; overflow-wrap: anywhere; }
.tq-row { display: grid; grid-template-columns: minmax(0, 1fr) 64px 100px 80px 28px; gap: 6px; align-items: center; margin-bottom: 6px; }
.tq-row .input { height: 34px; min-width: 0; }
.tq-head { font-size: 12px; color: var(--muted); margin-bottom: 4px; }
.tq-row .num { text-align: right; font-size: 13px; }
.tq-sum { display: flex; justify-content: space-between; padding: 8px 0 12px; font-size: 14px; }
.tq-pick { display: block; }
.tq-pick :deep(.op-btn) { width: 100%; }
.modal .field { margin-bottom: 12px; }
@media (max-width: 560px) { .tq-row { grid-template-columns: minmax(0, 1fr) 52px 80px 28px; } .tq-row .num { display: none; } }
</style>
