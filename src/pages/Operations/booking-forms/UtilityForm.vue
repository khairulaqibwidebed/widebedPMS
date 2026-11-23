<template>
  <form class="util" @submit.prevent="save(false)" novalidate>
    <div class="form-title">
      <h2>Utility Lodgment Form</h2>
      <p class="sub">Log a utility bill to a booking. Each save adds a new bill; tick "already paid" to record the payment too.</p>
    </div>

    <FormSaved v-if="saved" :message="done" @again="startAgain()">
      <p class="saved-note" v-if="tenant.email">You can still email the bill to the tenant.</p>
      <div class="saved-tools" v-if="tenant.email"><button type="button" class="btn mail-btn" @click="emailSaved()"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>Email tenant</button></div>
    </FormSaved>

    <template v-else>
      <StepStrip v-model="step" :steps="steps" label="Utility steps" />

      <section class="card util-body">
        <!-- 1. Booking -->
        <div v-show="step === 0">
          <h3>Booking</h3>
          <!-- 23 Nov 2026 (Khairul): every booking this person may see (past, current, upcoming, Awaiting payment; cancelled greyed) -->
          <div class="field"><label class="req">Booking</label>
            <OptionPicker class="fld-pick" :model-value="bookingId" :options="bookingOptions" label="Booking" placeholder="Search tenant, booking no. or unit…" searchable columns="minmax(0, 1.4fr) minmax(0, .7fr) minmax(0, 1.2fr) minmax(0, .8fr) minmax(0, 1.5fr) minmax(0, .9fr)"
              :column-heads="['Tenant', 'Booking no.', 'Property', 'Unit', 'Stay', 'Status']" :column-classes="['', 'muted', '', '', '', 'muted']" @update:modelValue="pickBooking" /></div>
          <p class="help loading-line" v-if="loading">Loading bookings…</p>
          <p class="help" v-else-if="!bookings.length">No bookings found.</p>
          <div class="kvs" v-if="picked">
            <div class="kv"><span>Property</span><span>{{ picked.propertyName || '—' }}</span></div>
            <div class="kv"><span>Unit</span><span>{{ picked.unitCode || picked.unitId || '—' }}</span></div>
            <div class="kv"><span>Check-in</span><span>{{ picked.arrival || '—' }}</span></div>
            <div class="kv"><span>Check-out</span><span>{{ picked.departure || '—' }}</span></div>
            <div class="kv"><span>Status</span><span>{{ picked.stay }}</span></div>
            <div class="kv"><span>Tenant</span><span>{{ tenant.name || '—' }}</span></div>
            <div class="kv"><span>Tenant email</span><span>{{ tenant.email || 'None on file' }}</span></div>
          </div>
          <p class="help warn" v-if="picked && tenantLoaded && !tenant.email">This tenant has no email address saved. Add it to their tenant details before emailing.</p>
          <!-- The booking's earlier bills; saving always adds a new one -->
          <div class="earlier" v-if="picked">
            <h4>{{ earlier === null ? 'Earlier bills' : `Earlier bills · ${earlier.length}` }}</h4>
            <p class="help" v-if="earlier === null">Loading…</p>
            <p class="help" v-else-if="!earlier.length">No bills on this booking yet.</p>
            <!-- 23 Nov 2026 (Khairul): View opens the bill's lines, paid amount and photos (read-only) -->
            <template v-for="x in earlier || []" :key="x.id">
              <div class="eb-row">
                <span>{{ datesText(x) }}</span><span class="muted">{{ lodgedText(x) }}</span><b>{{ money(x.total) }}</b>
                <span class="pill" :class="PILL[x.status]">{{ statusPill(x) }}</span>
                <button type="button" class="btn btn-sm" @click="ebOpen = ebOpen === x.id ? '' : x.id">{{ ebOpen === x.id ? 'Close' : 'View' }}</button>
              </div>
              <div class="eb-view" v-if="ebOpen === x.id">
                <div class="eb-line" v-for="(l, i) in x.lines" :key="i"><span>{{ `${kindLabel(l.kind)} · ${dmyOf(l.from)} to ${dmyOf(l.to)}` }}</span><b>{{ money(l.amount) }}</b></div>
                <div class="eb-line eb-tot"><span>Total</span><b>{{ money(x.total) }}</b></div>
                <div class="eb-line"><span>Paid</span><b>{{ money(x.paid) }}</b></div>
                <div class="field"><label>Bill photos</label>
                  <DriveFiles :key="'eb' + x.id" kind="utility-bills" :record-id="x.id" readonly :label="billLabel" /></div>
              </div>
            </template>
            <p class="help" v-if="earlier && earlier.length">Saving adds a new bill; these stay as they are. Edit a bill from the booking (Portfolio › Bookings › Invoice &amp; utility).</p>
          </div>
        </div>

        <!-- 2. Bills -->
        <div v-show="step === 1">
          <h3>Bill</h3>
          <!-- 20 Nov 2026 (Khairul): cards wrap to fit the screen; amount boxes have no spinner and ignore the mouse wheel -->
          <div class="bills" @wheel.capture="noWheel">
            <div class="bill" v-for="u in KINDS" :key="u.key" :class="{ has: +f[u.key] > 0 }">
              <div class="bill-head"><b>{{ u.label }}</b></div>
              <FormField :id="'u' + u.key" :label="`Amount (RM)`" type="number" min="0" step="0.01" v-model="f[u.key]" placeholder="0.00" />
              <div class="field"><label :class="{ req: +f[u.key] > 0 }">Bill period</label>
                <div class="period"><input class="input" type="date" v-model="f[u.key + 'From']" :aria-label="`${u.label} bill period from`"><span>to</span><input class="input" type="date" v-model="f[u.key + 'To']" :aria-label="`${u.label} bill period to`"></div></div>
            </div>
          </div>
          <p class="help">Add at least one amount. Each line with an amount needs its own dates. Lines left at 0 are not saved.</p>
          <div class="field"><label>Bill photos <span class="muted">(photos, PDFs or videos, saved to this bill's Google Drive folder)</span></label>
            <p class="help" v-if="!bookingId">Choose a booking first (step 1).</p>
            <DriveFiles v-else :key="billId" kind="utility-bills" :record-id="billId" :list-on-load="false" :label="billLabel" @folder="l => f.driveFolder = l" /></div>
          <p class="total">Total utility amount: <b>{{ money(total) }}</b></p>
        </div>

        <!-- 3. Review & save -->
        <div v-show="step === 2">
          <h3>Review &amp; save</h3>
          <div class="notice warn" v-if="missing.length">
            <b>Still missing</b>
            <ul class="miss"><li v-for="m in missing" :key="m.index"><button type="button" class="editlink" @click="step = m.index">{{ `${m.index + 1}. ${m.label}` }}</button>: {{ m.items.join(', ') }}</li></ul>
          </div>
          <div class="notice ok" v-else-if="!done">Everything needed is filled in. Check the details and press Save.</div>
          <div class="rev">
            <div class="card-head"><h4>1. Booking</h4><button type="button" class="editlink" @click="step = 0">Edit</button></div>
            <div class="kv"><span>Booking</span><span>{{ picked ? picked.bookingNo || picked.id : '—' }}</span></div>
            <div class="kv"><span>Unit</span><span>{{ picked ? `${picked.unitCode || picked.unitId || '—'}${picked.propertyName ? ', ' + picked.propertyName : ''}` : '—' }}</span></div>
            <div class="kv"><span>Tenant</span><span>{{ tenant.name || '—' }}</span></div>
          </div>
          <div class="rev">
            <div class="card-head"><h4>2. Bill</h4><button type="button" class="editlink" @click="step = 1">Edit</button></div>
            <div class="kv" v-for="u in KINDS" :key="u.key"><span>{{ u.label }}</span><span>{{ +f[u.key] > 0 ? `${money(f[u.key])}, ${periodText(u.key)}` : '—' }}</span></div>
            <div class="kv"><span>Total</span><span>{{ money(total) }}</span></div>
            <div class="kv"><span>Bill files</span><span>{{ f.driveFolder ? 'Saved to Google Drive' : 'None' }}</span></div>
          </div>
          <!-- 23 Nov 2026 (Khairul): lodge and pay in one go -->
          <div class="rev">
            <label class="paid-tick"><input type="checkbox" v-model="pay.on"> <b>Tenant has already paid this bill</b></label>
            <div class="pay-grid" v-if="pay.on">
              <FormField label="Payment Date" req type="date" v-model="pay.date" />
              <FormField label="Amount paid (RM)" req type="number" min="0" step="0.01" v-model="pay.amount" :placeholder="total.toFixed(2)" />
              <div class="field"><label class="req">Payment method</label>
                <OptionPicker class="fld-pick" v-model="pay.mode" :options="MODES" label="Payment method" /></div>
              <FormField label="Bank reference" v-model="pay.bankRef" placeholder="Reference no. on the bank slip" />
              <div class="field wide"><label class="req">Payment receipt</label>
                <DriveFiles :key="payId" kind="offline-payments" :record-id="payId" :list-on-load="false" :label="payLabel" @folder="l => pay.docsLink = l" /></div>
              <p class="help wide" v-if="+pay.amount > 0 && +pay.amount < total - 0.005">{{ `Part payment: the bill stays Partly paid with ${money(total - +pay.amount)} left.` }}</p>
              <p class="help wide">The payment is saved as Pending for Accounting to check, linked to this bill.</p>
            </div>
          </div>
        </div>
      </section>

      <div class="bottom-actions">
        <button type="button" class="btn" v-if="step > 0" @click="move(-1)">Back</button>
        <span class="spacer"></span>
        <template v-if="step === steps.length - 1">
          <button type="button" class="btn mail-btn" :disabled="busy || !complete || !tenant.email" :title="tenant.email ? 'Saves, then opens Gmail with the bill filled in' : 'This tenant has no email on file'" @click="save(true)"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>Save &amp; email tenant</button>
          <button type="submit" class="btn btn-primary" :disabled="busy || !complete" :title="complete ? '' : 'Finish the steps listed above first'">{{ busy ? 'Saving…' : pay.on ? 'Save bill & payment' : 'Save bill' }}</button>
        </template>
        <button type="button" class="btn btn-primary" v-else @click="move(1)">Next</button>
      </div>
    </template>
  </form>
</template>

<script>
// Utility Lodgment Form (Operations > Booking forms > Utility). Moved from components/UtilityForm.vue on 4 Nov 2026 and split into steps.
// 23 Nov 2026 (Khairul): a booking holds many bills. Every save adds a NEW bill, utilityBills/{autoId} (lib/utility-bills.js),
// with an audit entry and the bill photos in the bill's own Drive folder. "Tenant has already paid this bill" also saves an
// offline payment (Pending, Utilities part linked to this bill) in the same batch. The booking list is every booking this
// person may see (lib/booking-search.js), cancelled greyed with a confirm. ?booking=<id> opens with that booking picked.
import { collection, doc, getDoc, writeBatch, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase.js';
import { useSession } from '@/stores/session.js';
import { withState } from '@/lib/states.js';
import OptionPicker from '@/components/OptionPicker.vue';
import FormField from '@/components/FormField.vue';
import DriveFiles from '@/components/DriveFiles.vue';
import StepStrip from '@/components/StepStrip.vue';
import FormSaved from '@/components/FormSaved.vue';
import { audit, friendlyError } from '@/lib/finance-data.js';
import { allDone, stillMissing } from '@/lib/steps.js';
import { askConfirm } from '@/lib/confirm.js';
import { toast } from '@/lib/toast.js';
import { monthName } from '@/lib/format.js';
import { loadAllBookings, guestNames } from '@/lib/booking-search.js';
import { kindLabel, KINDS, PILL, PAY_MODES, money, r2, datesText, statusPill, loadBills, newBill, linesProblem, linkBills, purposeText, billMailLink, billOf } from '@/lib/utility-bills.js';

const MODES = [{ value: '', label: 'Choose method' }, ...PAY_MODES.map(x => ({ value: x, label: x }))];
// Each line has its own period (13 Nov 2026): electricityFrom/electricityTo, waterFrom/waterTo, sewerageFrom/sewerageTo
const blank = (from = '', to = '') => ({ electricity: '', electricityFrom: from, electricityTo: to, water: '', waterFrom: from, waterTo: to,
  sewerage: '', sewerageFrom: from, sewerageTo: to, driveFolder: '' });
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const blankPay = () => ({ on: false, date: today(), amount: '', mode: '', bankRef: '', docsLink: '' });
const newId = c => doc(collection(db, c)).id;

export default {
  popups: { ok: 'done' },   // 16 Nov 2026: its messages show as corner popups (lib/page-popups.js)
  components: { FormField, OptionPicker, DriveFiles, StepStrip, FormSaved },
  emits: ['dirty'],
  data() { return { KINDS, PILL, MODES, f: blank(), start: JSON.stringify(blank()), bookings: [], names: guestNames, bookingId: '', loading: true, tenant: {}, tenantLoaded: false,
    earlier: null, ebOpen: '', billId: newId('utilityBills'), payId: newId('offlinePayments'), pay: blankPay(), savedBill: null,
    step: 0, saved: false, busy: false, error: '', done: '' }; },
  computed: {
    bookingOptions() {
      return this.bookings.map(b => {
        const cols = [this.names[b.id] || b.id, b.bookingNo || '—', b.propertyName || '—', b.unitCode || b.unitId || '—', `${b.arrival || ''} to ${b.departure || ''}`, b.stay];
        // label is what the picker searches: name, booking no., unit, property
        return { value: b.id, cols, dim: b.stay === 'Cancelled', label: `${cols[0]} · ${b.bookingNo || ''} | ${cols[2]} | ${cols[3]} | ${cols[4]} | ${b.stay}` };
      });
    },
    billed() { return KINDS.filter(u => r2(this.f[u.key]) > 0); },
    picked() { return this.bookings.find(b => b.id === this.bookingId) || null; },
    total() { return r2(r2(this.f.electricity) + r2(this.f.water) + r2(this.f.sewerage)); },
    lines() { return KINDS.map(u => ({ kind: u.key, from: this.f[u.key + 'From'], to: this.f[u.key + 'To'], amount: this.f[u.key] })); },
    billLabel() { const b = this.picked; return [b?.unitCode || b?.unitId, b?.bookingNo || b?.id, 'utility'].filter(Boolean).join(' '); },
    payLabel() { const b = this.picked; return [this.pay.date, b?.unitCode || b?.unitId, this.tenant.name || this.names[b?.id] || '', 'utilities'].filter(Boolean).join(' '); },
    dirty() { return !this.saved && JSON.stringify(this.f) !== this.start; },
    steps() {
      const f = this.f, p = this.pay;
      const backwards = this.billed.find(u => f[u.key + 'From'] && f[u.key + 'To'] && f[u.key + 'To'] < f[u.key + 'From']);
      return [
        { key: 'booking', label: 'Booking', required: [{ label: 'Booking', filled: !!this.bookingId }] },
        { key: 'bills', label: 'Bill', problem: backwards ? `The ${backwards.label.toLowerCase()} bill period ends before it starts.` : '', required: [
          { label: 'At least one amount', filled: this.total > 0 },
          ...this.billed.flatMap(u => [{ label: `${u.label} period from`, filled: !!f[u.key + 'From'] }, { label: `${u.label} period to`, filled: !!f[u.key + 'To'] }])] },
        { key: 'review', label: 'Review & save', review: true, problem: p.on && +p.amount > this.total + 0.005 ? 'The amount paid is more than the bill total.' : '',
          required: p.on ? [{ label: 'Payment Date', filled: !!p.date }, { label: 'Amount paid', filled: +p.amount > 0 }, { label: 'Payment method', filled: !!p.mode }, { label: 'Payment receipt', filled: !!p.docsLink }] : [] }
      ];
    },
    complete() { return allDone(this.steps); },
    missing() { return stillMissing(this.steps); }
  },
  watch: {
    dirty: { handler(v) { this.$emit('dirty', v); }, immediate: true },
    'pay.on'(v) { if (v && !(+this.pay.amount > 0)) this.pay.amount = this.total ? this.total.toFixed(2) : ''; },
    total(v, was) { if (this.pay.on && (!this.pay.amount || Math.abs(+this.pay.amount - was) < 0.005)) this.pay.amount = v ? v.toFixed(2) : ''; },
    async bookingId() {
      this.tenant = {}; this.tenantLoaded = false; this.error = ''; this.done = ''; this.earlier = null;
      this.f = blank(this.picked?.arrival || '', this.picked?.departure || '');   // a new bill starts with the stay dates
      this.start = JSON.stringify(this.f);
      const b = this.picked;
      if (!b) return;
      loadBills(b).then(list => { if (this.picked?.id === b.id) this.earlier = list || []; });
      try {
        // A booking made from an inquiry has a tenant record; an imported one keeps the guest details on the booking itself
        const snap = await getDoc(b.tenantId ? doc(db, 'tenants', b.tenantId, 'private', 'main') : doc(db, 'offlineBookings', b.id, 'private', 'main'));
        if (this.picked?.id === b.id) this.tenant = snap.exists() ? { name: snap.data().name || '', email: snap.data().email || '' } : {};
      } catch (e) { /* the warning covers it */ }
      this.tenantLoaded = true;
    }
  },
  async mounted() {
    await this.load();
    const want = this.$route?.query?.booking;
    if (want && this.bookings.some(b => b.id === want)) this.bookingId = String(want);
  },
  methods: {
    dmyOf(d) { return d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—'; },
    money, datesText, statusPill, kindLabel,
    noWheel(e) { if (e.target.type === 'number' && e.target === document.activeElement) e.target.blur(); },
    move(by) { this.step = Math.min(this.steps.length - 1, Math.max(0, this.step + by)); window.scrollTo({ top: 0, behavior: 'smooth' }); },
    periodText(key) { const a = this.f[key + 'From'], z = this.f[key + 'To']; return a && z ? `${a} to ${z}` : 'no period'; },
    lodgedText(x) { const t = x.lodgedAt?.toDate?.() || x.createdAt?.toDate?.(); return t ? `lodged ${t.toLocaleDateString('en-GB')}` : ''; },
    startAgain() {
      this.saved = false; this.done = ''; this.error = ''; this.step = 0; this.savedBill = null;
      this.billId = newId('utilityBills'); this.payId = newId('offlinePayments'); this.pay = blankPay();
      const keep = this.bookingId; this.bookingId = ''; window.scrollTo(0, 0);
      if (keep) this.$nextTick(() => { this.bookingId = keep; });   // the same booking again, with its bills read fresh
    },
    async pickBooking(id) {
      const b = this.bookings.find(x => x.id === id);
      if (b?.stay === 'Cancelled' && !await askConfirm({ title: 'This booking is cancelled', message: `${b.bookingNo || b.id} was cancelled${b.cancelledReason ? ` (${b.cancelledReason})` : ''}. Lodge a bill on it anyway?`, confirmText: 'Use this booking' })) return;
      this.bookingId = id;
    },
    async load() {
      this.loading = true;
      try { this.bookings = await loadAllBookings(); }
      catch (e) { this.error = friendlyError(e, 'load the bookings'); }
      this.loading = false;
    },
    check() {
      if (!this.bookingId) return 'Choose the booking this bill belongs to.';
      const bad = linesProblem(this.lines); if (bad) return bad;
      const p = this.pay;
      if (p.on) {
        if (!p.date) return 'Choose the payment date.';
        if (!(+p.amount > 0)) return 'Enter the amount paid.';
        if (+p.amount > this.total + 0.005) return 'The amount paid is more than the bill total.';
        if (!p.mode) return 'Choose the payment method.';
        if (!p.docsLink) return 'Upload the payment receipt.';
      }
      return '';
    },
    showStep(msg) { this.step = /^Choose the booking/.test(msg) ? 0 : /payment|amount paid|receipt/i.test(msg) ? 2 : 1; },
    // Opens Gmail for the saved bill and notes on the bill that it was emailed
    async emailSaved(win = null) {
      const x = this.savedBill; if (!x || !this.tenant.email) { win?.close(); return; }
      const link = billMailLink(x, this.picked || x, this.tenant);
      if (win) win.location.href = link; else window.open(link, '_blank');
      try { const me = useSession(); await updateDoc(doc(db, 'utilityBills', x.id), { emailedAt: serverTimestamp(), emailedByName: me.name || '' }); }
      catch (e) { console.warn('Could not note the email on the bill', e.code || e.message); }
    },
    async save(andEmail) {
      this.error = this.check(); this.done = '';
      if (this.error) { this.showStep(this.error); return; }
      const win = andEmail ? window.open('', '_blank') : null;   // opened now, so the browser doesn't block it after saving
      const me = useSession(), b = this.picked, p = this.pay, billId = this.billId;
      this.busy = true;
      try {
        const batch = writeBatch(db);
        const data = await withState(b.propertyId, newBill(b, this.lines, 'lodgment', me, { driveFolder: this.f.driveFolder || '' }));
        const fresh = { [billId]: { total: data.total, data } };
        let payAmount = 0;
        if (p.on) {
          payAmount = r2(p.amount);
          await linkBills(batch, this.payId, {}, { [billId]: payAmount }, fresh);   // sets paid / status / paymentIds on the new bill
          const bill = billOf(billId, data);
          const guest = this.tenant.name || this.names[b.id] || b.bookingNo || b.id;
          const purpose = purposeText({ rental: 0, utilities: payAmount, bills: [bill] }, monthName);
          batch.set(doc(db, 'offlinePayments', this.payId), await withState(b.propertyId, {
            date: p.date, amount: payAmount, propertyId: b.propertyId || '', propertyName: b.propertyName || '', unitCode: b.unitCode || b.unitId || '',
            guest, purpose, mode: p.mode, bankRef: p.bankRef.trim(), docsLink: p.docsLink, remarks: '', status: 'Pending', verifiedByName: '', verifiedDate: '',
            createdAt: serverTimestamp(), createdBy: me.user.uid, submittedByName: me.name, bookingId: b.id, bookingNo: b.bookingNo || b.id,
            parts: [{ type: 'utilities', amount: payAmount, bills: [{ billId, amount: payAmount }] }], billIds: [billId], billsAt: serverTimestamp() }));
          audit(batch, me, { action: 'offlinePayment.create', entity: `offlinePayments/${this.payId}`, propertyId: b.propertyId || null,
            changes: [['amount', payAmount], ['date', p.date], ['guest', guest], ['purpose', purpose], ['status', 'Pending'], ['bookingNo', b.bookingNo || b.id], ['utilities', `${bill.id} ${payAmount.toFixed(2)}`]].map(([field, v]) => ({ field, old: null, new: v })) });
        }
        batch.set(doc(db, 'utilityBills', billId), data);
        audit(batch, me, { action: 'utilityBill.create', entity: `utilityBills/${billId}`, propertyId: b.propertyId || null,
          changes: [{ field: 'total', old: null, new: data.total }, { field: 'dates', old: null, new: datesText(data) }, ...(p.on ? [{ field: 'paid', old: null, new: payAmount }] : [])] });
        await batch.commit();
        this.savedBill = billOf(billId, data);
        toast('Changes saved');
        this.done = `Utility bill saved for ${b.bookingNo || b.id}: ${money(data.total)}${p.on ? `, with a payment of ${money(payAmount)} (Pending)` : ''}.`;
        this.start = JSON.stringify(this.f); this.saved = true; window.scrollTo(0, 0);
        if (andEmail) await this.emailSaved(win);
      } catch (e) {
        win?.close();
        this.error = e.code === 'permission-denied' ? 'Firestore refused this. The latest security rules (Draft 1.03, utility bills) need to be published first.' : friendlyError(e, 'save the utility bill');
      }
      this.busy = false;
    }
  }
};
</script>

<style scoped>
.form-title { margin-bottom: 14px; }
.form-title h2 { font-size: 18px; margin: 0; }
.form-title .sub { color: var(--muted); margin: 4px 0 0; font-size: 13px; }
.util-body { margin-top: 14px; }
.util-body h3 { font-size: 15px; margin: 0 0 12px; }
.util-body h4 { font-size: 14px; margin: 0; }
.bills { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; margin-bottom: 8px; }
.bill { border: 1px solid var(--border); border-radius: 10px; padding: 12px 12px 0; min-width: 0; }
.bill :deep(input[type=number]), .pay-grid :deep(input[type=number]) { -moz-appearance: textfield; appearance: textfield; }
.bill :deep(input[type=number]::-webkit-outer-spin-button), .bill :deep(input[type=number]::-webkit-inner-spin-button) { -webkit-appearance: none; margin: 0; }
.bill.has { border-color: var(--accent); }
.bill-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-size: 14px; }
.bill .field { margin-bottom: 12px; }
.period { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.period .input { flex: 1 1 120px; min-width: 0; width: 100%; }
.field label { display: block; font-size: 13px; color: var(--text-2); margin-bottom: 6px; }
.kvs { margin-top: 12px; }
.warn { color: var(--danger, #c0392b); }
.total { margin: 16px 0 0; padding-top: 14px; border-top: 1px solid var(--border); font-size: 14px; }
.fld-pick { display: block; width: 100%; }
.fld-pick :deep(.op-btn), .fld-pick :deep(.op-input) { width: 100%; min-height: 40px; }
.fld-pick :deep(.op-pop) { max-width: none; width: 100%; }
.mail-btn { display: inline-flex; align-items: center; gap: 8px; }
.miss { margin: 6px 0 0; padding-left: 18px; }
.miss li { margin: 2px 0; }
.miss .editlink { font-weight: 600; }
.rev { border-top: 1px solid var(--border); padding: 12px 0; }
.rev .card-head { margin-bottom: 4px; }
.saved-note { font-size: 13px !important; color: var(--text-2) !important; }
.saved-tools { margin-bottom: 12px; }
.spacer { flex: 1; }
.bottom-actions { display: flex; gap: 10px; margin-top: 8px; padding: 14px 0 20px; flex-wrap: wrap; }
.bottom-actions .btn:disabled { opacity: .5; cursor: not-allowed; }
.earlier { margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border); }
.earlier h4 { margin-bottom: 8px !important; }
.eb-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto auto; gap: 10px; align-items: center; padding: 6px 0; border-bottom: 1px solid var(--border); font-size: 13px; }
.eb-row .pill { white-space: nowrap; }
.eb-row { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto auto auto; }
.eb-view { display: grid; gap: 6px; padding: 10px 12px 14px; margin: 0 0 6px; background: var(--surface-2, #f8fafc); border-bottom: 1px solid var(--border); font-size: 13px; }
.eb-line { display: flex; justify-content: space-between; gap: 10px; }
.eb-tot { border-top: 1px solid var(--border); padding-top: 6px; }
.eb-view .field { margin: 6px 0 0; }
.paid-tick { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 14px; }
.pay-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 16px; margin-top: 12px; }
.pay-grid .wide { grid-column: 1 / -1; }
@media (max-width: 900px) { .bills, .pay-grid { grid-template-columns: minmax(0, 1fr); } .eb-row { grid-template-columns: 1fr auto; } }
</style>
