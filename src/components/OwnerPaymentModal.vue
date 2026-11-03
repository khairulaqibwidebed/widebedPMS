<template>
  <div class="modal-back" @click.self="close()" v-esc="close">
    <div class="modal" role="dialog" aria-modal="true" :aria-label="`Owner payment ${doc.no}`" style="max-width:600px;width:calc(100% - 32px)">
      <div class="card-head"><h2 style="margin:0">{{ `Owner payment · ${doc.unitCode}` }}</h2><span class="pill" :class="PAY[status].cls">{{ PAY[status].label }}</span></div>
      <p class="help" style="margin:6px 0 14px">{{ `${doc.no} · ${monthName(doc.month)} · payout RM ${amt(payout)}` }}</p>
      <div class="notice error" v-if="error" style="margin-bottom:10px">{{ error }}</div>

      <!-- Paid: what was recorded, the pay slip, and Undo for a Director -->
      <template v-if="status === 'paid'">
        <div class="rows">
          <div class="row"><span>Paid on</span><span class="r">{{ dmy(st.paidDate) }}</span></div>
          <div class="row"><span>Amount</span><span class="r">{{ `RM ${amt(st.paidAmount)}` }}</span></div>
          <div class="row"><span>Bank reference</span><span class="r">{{ st.paidRef || '—' }}</span></div>
          <div class="row"><span>Marked paid by</span><span class="r">{{ st.paidByName || '—' }}</span></div>
        </div>
        <DriveFiles kind="owner-payments" :record-id="doc.id" :label="`${doc.unitCode} ${doc.month}`" readonly style="margin-top:12px" />
        <template v-if="isDirector">
          <div class="confirm-box" v-if="undoing" style="margin-top:12px">
            <b>Undo this payment?</b>
            <p class="help" style="margin:4px 0 10px">It goes back to Pending Payment. The pay slip stays in Drive. After that a Director can recall the statement.</p>
            <div class="field"><label for="undoWhy" class="req">Reason</label><input class="input" id="undoWhy" v-model="undoReason" placeholder="e.g. Paid to the wrong account"></div>
          </div>
        </template>
      </template>

      <!-- Not paid yet: the form -->
      <template v-else-if="status !== 'none'">
        <div class="grid-fields">
          <FormField id="payDate" label="Paid on" req type="date" v-model="f.date" />
          <FormField id="payAmt" label="Amount (RM)" req type="number" step="0.01" min="0" v-model="f.amount" />
        </div>
        <FormField id="payRef" label="Bank reference" v-model="f.ref" placeholder="e.g. transfer reference" />
        <div class="field"><label class="req">Pay slip</label>
          <DriveFiles kind="owner-payments" :record-id="doc.id" :label="`${doc.unitCode} ${doc.month}`" /></div>
      </template>
      <p class="help" v-else>The payout is zero or negative, so nothing is paid this month (a negative balance is carried forward).</p>

      <div class="modal-foot">
        <button class="btn" @click="close()" :disabled="busy">Close</button>
        <template v-if="status === 'paid' && isDirector">
          <button class="btn" v-if="!undoing" @click="undoing = true">Undo payment</button>
          <button class="btn btn-danger" v-else @click="undo()" :disabled="busy || !undoReason.trim()">{{ busy ? 'Saving…' : 'Undo payment' }}</button>
        </template>
        <button class="btn btn-primary" v-if="status !== 'paid' && status !== 'none'" @click="markPaid()" :disabled="busy">{{ busy ? 'Saving…' : 'Mark as paid' }}</button>
      </div>
    </div>
  </div>
</template>

<script>
// Invoices & Receipts: pay an owner for one completed statement. Finance (or a Director) records the date, amount, reference
// and the pay slip (Google Drive, folder Owner Payments/<statement>) and the status becomes Paid. A Director can undo it with a reason.
//   <OwnerPaymentModal v-if="paying" :doc="d" @close @saved="load()" />   (d = Invoices row: { id, no, unitCode, month, amount, statement })
import { doc as docRef, writeBatch, serverTimestamp, deleteField } from 'firebase/firestore';
import { db } from '@/lib/firebase.js';
import { audit, friendlyError } from '@/lib/finance-data.js';
import { listFiles } from '@/lib/drive.js';
import { notifyRole } from '@/services/notificationService.js';
import { amt, dmy, monthName } from '@/lib/format.js';
import { useSession } from '@/stores/session.js';
import FormField from '@/components/FormField.vue';
import DriveFiles from '@/components/DriveFiles.vue';

const me = useSession();
export const PAY = { pending: { label: 'Pending Payment', cls: 'amber' }, paid: { label: 'Paid', cls: 'green' }, none: { label: 'Nothing to pay', cls: 'grey' },
  untracked: { label: 'Completed', cls: 'grey' } };
// Statements completed before this flow have no paymentStatus: shown as Completed, and can still be marked Paid
export const payStatusOf = s => s.paymentStatus || ((s.totals?.payout ?? 0) > 0.004 ? 'untracked' : 'none');
const today = () => { const d = new Date(Date.now() + 8 * 3600e3); return d.toISOString().slice(0, 10); };

export default {
  components: { FormField, DriveFiles },
  props: { doc: { type: Object, required: true } },
  emits: ['close', 'saved'],
  data() {
    const s = this.doc.statement;
    return { PAY, amt, dmy, monthName, busy: false, error: '', undoing: false, undoReason: '', isDirector: me.role === 'director',
      f: { date: today(), amount: s.totals?.payout ?? '', ref: '' } };
  },
  computed: {
    st() { return this.doc.statement; },
    status() { return payStatusOf(this.st); },
    payout() { return this.st.totals?.payout ?? 0; }
  },
  methods: {
    close() { if (!this.busy) this.$emit('close'); },
    async markPaid() {
      const f = this.f; this.error = '';
      if (!f.date) return (this.error = 'Pick the date it was paid.');
      if (!(Number(f.amount) > 0)) return (this.error = 'Type the amount paid.');
      this.busy = true;
      try {
        // The pay slip is required: at least one file in this statement's Owner Payments folder
        const files = (await listFiles('owner-payments', this.doc.id, `${this.doc.unitCode} ${this.doc.month}`)).files || [];
        if (!files.length) { this.error = 'Upload the pay slip first.'; return; }
        const amount = Math.round(Number(f.amount) * 100) / 100, ref = String(f.ref || '').trim();
        const b = writeBatch(db);
        b.update(docRef(db, 'statements', this.doc.id), { paymentStatus: 'paid', paidDate: f.date, paidAmount: amount, paidRef: ref,
          paidBy: me.user.uid, paidByName: me.name, paidAt: serverTimestamp() });
        audit(b, me, { action: 'statement.paid', entity: `statements/${this.doc.id}`, propertyId: this.st.propertyId || null, month: this.doc.month,
          changes: [{ field: 'paymentStatus', old: this.status, new: 'paid' }, { field: 'paidAmount', old: null, new: amount }],
          reason: `Paid ${dmy(f.date)}${ref ? ' · ' + ref : ''}` });
        await b.commit();
        if (me.role !== 'director')
          notifyRole({ recipientRole: 'director', title: 'Owner paid', message: `${this.doc.unitCode} · ${monthName(this.doc.month)} · RM ${amt(amount)}`,
            type: 'statement', link: '/Finance/invoices', refId: this.doc.id }).catch(e => console.warn('Director notification not sent:', e));
        this.$emit('saved', `${this.doc.unitCode} marked Paid.`);
      } catch (e) { this.error = friendlyError(e, 'mark the payment'); }
      finally { this.busy = false; }
    },
    async undo() {
      const why = this.undoReason.trim(); if (!why || !this.isDirector) return;
      this.busy = true; this.error = '';
      try {
        const b = writeBatch(db);
        b.update(docRef(db, 'statements', this.doc.id), { paymentStatus: 'pending', paidDate: deleteField(), paidAmount: deleteField(), paidRef: deleteField(),
          paidBy: deleteField(), paidByName: deleteField(), paidAt: deleteField(), payUndoReason: why, payUndoBy: me.user.uid, payUndoByName: me.name, payUndoAt: serverTimestamp() });
        audit(b, me, { action: 'statement.unpaid', entity: `statements/${this.doc.id}`, propertyId: this.st.propertyId || null, month: this.doc.month,
          changes: [{ field: 'paymentStatus', old: 'paid', new: 'pending' }], reason: why });
        await b.commit();
        this.$emit('saved', `Payment for ${this.doc.unitCode} undone. It is Pending Payment again.`);
      } catch (e) { this.error = friendlyError(e, 'undo the payment'); }
      finally { this.busy = false; }
    }
  }
};
</script>

<style scoped>
.confirm-box { padding: 12px 14px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface-2, var(--chip)); }
</style>
