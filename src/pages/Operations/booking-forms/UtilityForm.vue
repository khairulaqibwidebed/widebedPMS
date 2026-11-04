<template>
  <form class="util" @submit.prevent="save()" novalidate>
    <div class="form-title">
      <h2>Utility Lodgment Form</h2>
      <p class="sub">Log utility invoices to an active booking.</p>
    </div>
    <div class="notice error" v-show="error">{{ error }}</div>

    <FormSaved v-if="saved" :message="done" @again="startAgain()">
      <p class="saved-note" v-if="tenant.email">You can still email the bill to the tenant.</p>
      <div class="saved-tools" v-if="tenant.email"><button type="button" class="btn mail-btn" @click="emailTenant()"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>Email tenant</button></div>
    </FormSaved>

    <template v-else>
      <StepStrip v-model="step" :steps="steps" label="Utility steps" />

      <section class="card util-body">
        <!-- 1. Booking -->
        <div v-show="step === 0">
          <h3>Booking</h3>
          <div class="field"><label class="req">Booking ID</label>
            <OptionPicker class="fld-pick" v-model="bookingId" :options="bookingOptions" label="Booking ID" searchable /></div>
          <p class="help" v-if="loading">Loading bookings…</p>
          <p class="help" v-else-if="!bookings.length">No bookings found.</p>
          <p class="help ok-note" v-else-if="existing">A bill is already saved for this booking and has been filled in on the Bills step. Change anything and press Save to update it.</p>
          <div class="kvs" v-if="picked">
            <div class="kv"><span>Property</span><span>{{ picked.propertyName || '—' }}</span></div>
            <div class="kv"><span>Unit</span><span>{{ picked.unitCode || '—' }}</span></div>
            <div class="kv"><span>Check-in</span><span>{{ picked.arrival || '—' }}</span></div>
            <div class="kv"><span>Check-out</span><span>{{ picked.departure || '—' }}</span></div>
            <div class="kv"><span>Tenant</span><span>{{ tenant.name || '—' }}</span></div>
            <div class="kv"><span>Tenant email</span><span>{{ tenant.email || 'None on file' }}</span></div>
          </div>
          <p class="help warn" v-if="picked && tenantLoaded && !tenant.email">This tenant has no email address saved. Add it to their tenant details before emailing.</p>
        </div>

        <!-- 2. Bills -->
        <div v-show="step === 1">
          <h3>Bills</h3>
          <div class="field month-row"><label class="req">Bill period <span class="muted">(one period for all three bills)</span></label>
            <div class="period"><input class="input" type="date" v-model="f.from" aria-label="Bill period from"><span>to</span><input class="input" type="date" v-model="f.to" aria-label="Bill period to"></div></div>
          <div class="bills">
            <div class="bill" v-for="u in shownKinds" :key="u.key" :class="{ has: +f[u.key] > 0 }">
              <div class="bill-head"><b>{{ u.label }}</b><button type="button" class="editlink" @click="removeBill(u.key)">Remove</button></div>
              <FormField :id="'u' + u.key" :label="`Amount (RM)`" type="number" min="0" step="0.01" v-model="f[u.key]" placeholder="0.00" />
              <p class="help bill-period">{{ f.from && f.to ? `Period: ${f.from} to ${f.to}` : 'Period: set below' }}</p>
            </div>
          </div>
          <div class="add-bills" v-if="hiddenKinds.length">
            <button type="button" class="btn" v-for="u in hiddenKinds" :key="u.key" @click="addBill(u.key)">{{ `+ Add ${u.label.toLowerCase()} bill` }}</button>
          </div>
          <p class="help">Add at least one amount. The bill period and the bill photos below are shared by all the bills on this booking.</p>
          <div class="field"><label>Utility bills <span class="muted">(photos or PDFs, saved to Google Drive)</span></label>
            <p class="help" v-if="!bookingId">Choose a booking first (step 1).</p>
            <DriveFiles v-else :key="bookingId" kind="utility-bills" :record-id="bookingId" :label="`${picked?.unitCode || ''} ${bookingId}`" @folder="l => f.invoiceLink = l" /></div>
          <p class="total">Total utility amount: <b>{{ rm(total) }}</b></p>
        </div>

        <!-- 3. Review & save -->
        <div v-show="step === 2">
          <h3>Review &amp; save</h3>
          <div class="notice warn" v-if="missing.length">
            <b>Still missing</b>
            <ul class="miss"><li v-for="m in missing" :key="m.index"><button type="button" class="editlink" @click="step = m.index">{{ `${m.index + 1}. ${m.label}` }}</button>: {{ m.items.join(', ') }}</li></ul>
          </div>
          <div class="notice ok" v-else-if="!done">Everything needed is filled in. Check the details and press Save.</div>
          <div class="notice ok" v-show="done">{{ done }}</div>
          <div class="rev">
            <div class="card-head"><h4>1. Booking</h4><button type="button" class="editlink" @click="step = 0">Edit</button></div>
            <div class="kv"><span>Booking ID</span><span>{{ bookingId || '—' }}</span></div>
            <div class="kv"><span>Unit</span><span>{{ picked ? `${picked.unitCode || '—'}${picked.propertyName ? ', ' + picked.propertyName : ''}` : '—' }}</span></div>
            <div class="kv"><span>Tenant</span><span>{{ tenant.name || '—' }}</span></div>
          </div>
          <div class="rev">
            <div class="card-head"><h4>2. Bills</h4><button type="button" class="editlink" @click="step = 1">Edit</button></div>
            <div class="kv"><span>Bill period</span><span>{{ f.from && f.to ? `${f.from} to ${f.to}` : '—' }}</span></div>
            <div class="kv" v-for="u in shownKinds" :key="u.key"><span>{{ u.label }}</span><span>{{ +f[u.key] > 0 ? rm(f[u.key]) : '—' }}</span></div>
            <div class="kv"><span>Total</span><span>{{ rm(total) }}</span></div>
            <div class="kv"><span>Bill files</span><span>{{ f.invoiceLink ? 'Saved to Google Drive' : 'None' }}</span></div>
          </div>
        </div>
      </section>

      <div class="bottom-actions">
        <button type="button" class="btn" v-if="step > 0" @click="move(-1)">Back</button>
        <span class="spacer"></span>
        <template v-if="step === steps.length - 1">
          <button type="button" class="btn mail-btn" :disabled="busy || !tenant.email" :title="tenant.email ? 'Opens Gmail with the bill filled in' : 'This tenant has no email on file'" @click="emailTenant()"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>Email tenant</button>
          <button type="submit" class="btn btn-primary" :disabled="busy || !complete" :title="complete ? '' : 'Finish the steps listed above first'">{{ busy ? 'Saving…' : 'Save' }}</button>
        </template>
        <button type="button" class="btn btn-primary" v-else @click="move(1)">Next</button>
      </div>
    </template>
  </form>
</template>

<script>
// Utility Lodgment Form (Operations > Booking forms > Utility). Moved from components/UtilityForm.vue on 4 Nov 2026 and split into steps;
// what is saved is unchanged: utilityBills/{bookingId} (one bill per booking, updated in place), an audit entry, the files in Google Drive.
import { reactive } from 'vue';
import { collection, doc, getDoc, getDocs, limit, query, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase.js';
import { useSession } from '@/stores/session.js';
import OptionPicker from '@/components/OptionPicker.vue';
import FormField from '@/components/FormField.vue';
import DriveFiles from '@/components/DriveFiles.vue';
import StepStrip from '@/components/StepStrip.vue';
import FormSaved from '@/components/FormSaved.vue';
import { audit, friendlyError } from '@/lib/finance-data.js';
import { allDone, stillMissing } from '@/lib/steps.js';
import { askConfirm } from '@/lib/confirm.js';
import { toast } from '@/lib/toast.js';

const KINDS = [{ key: 'electricity', label: 'Electricity' }, { key: 'water', label: 'Water' }, { key: 'sewerage', label: 'Sewerage' }];
const blank = () => ({ from: '', to: '', electricity: '', water: '', sewerage: '', invoiceLink: '' });
// Tenant names for the list, read once per visit (they sit in each tenant's private record)
const nameCache = reactive({});
const cents = v => Math.round((+v || 0) * 100) / 100;

export default {
  components: { FormField, OptionPicker, DriveFiles, StepStrip, FormSaved },
  emits: ['dirty'],
  data() { return { KINDS, f: blank(), start: JSON.stringify(blank()), bookings: [], bills: {}, names: nameCache, bookingId: '', loading: true, tenant: {}, tenantLoaded: false,
    step: 0, saved: false, busy: false, error: '', done: '', shown: ['electricity'] }; },
  computed: {
    // Bill cards on the Bills step: one per bill type (electricity, water, sewerage), added and removed by hand
    shownKinds() { return KINDS.filter(u => this.shown.includes(u.key)); },
    hiddenKinds() { return KINDS.filter(u => !this.shown.includes(u.key)); },
    bookingOptions() {
      return [{ value: '', label: 'Choose booking ID…' }, ...this.bookings.map(b => ({ value: b.id, label: `${this.names[b.tenantId || b.id] || b.id} | ${b.unitCode || 'unit'} | ${b.arrival || ''} to ${b.departure || ''}${this.bills[b.id] ? ' · bill saved' : ''}` }))];
    },
    existing() { return this.bookingId ? this.bills[this.bookingId] || null : null; },
    picked() { return this.bookings.find(b => b.id === this.bookingId) || null; },
    total() { return cents(this.f.electricity) + cents(this.f.water) + cents(this.f.sewerage); },
    // Something typed on the Bills step (picking a booking alone doesn't count)
    dirty() { return !this.saved && JSON.stringify(this.f) !== this.start; },
    // The steps and what each needs, taken from check() (which still runs on Save)
    steps() {
      const f = this.f;
      return [
        { key: 'booking', label: 'Booking', required: [{ label: 'Booking ID', filled: !!this.bookingId }] },
        { key: 'bills', label: 'Bills', problem: f.from && f.to && f.to < f.from ? 'The bill period ends before it starts.' : '', required: [
          { label: 'At least one amount', filled: this.total > 0 }, { label: 'Period from', filled: !!f.from }, { label: 'Period to', filled: !!f.to }] },
        { key: 'review', label: 'Review & save', review: true }
      ];
    },
    complete() { return allDone(this.steps); },
    missing() { return stillMissing(this.steps); }
  },
  watch: {
    dirty: { handler(v) { this.$emit('dirty', v); }, immediate: true },
    // The tenant's name and email come from their tenant record (private details)
    async bookingId() {
      this.tenant = {}; this.tenantLoaded = false; this.error = ''; this.done = '';
      // A saved bill fills the form; a booking with none starts empty
      const old = this.existing;
      this.f = old ? { from: old.periodFrom || '', to: old.periodTo || '', electricity: old.electricity || '', water: old.water || '', sewerage: old.sewerage || '', invoiceLink: old.invoiceLink || '' } : { ...blank(), from: this.picked?.arrival || '', to: this.picked?.departure || '' };   // a new bill starts with the stay dates
      this.start = JSON.stringify(this.f);
      // A saved bill shows a card for each amount it has; a new one starts with Electricity
      const has = KINDS.filter(u => +this.f[u.key] > 0).map(u => u.key);
      this.shown = has.length ? has : ['electricity'];
      const b = this.picked;
      if (!b) return;
      try {
        // A booking made from an inquiry has a tenant record; an imported one keeps the guest details on the booking itself
        const snap = await getDoc(b.tenantId ? doc(db, 'tenants', b.tenantId, 'private', 'main') : doc(db, 'offlineBookings', b.id, 'private', 'main'));
        if (this.picked?.id === b.id) this.tenant = snap.exists() ? { name: snap.data().name || '', email: snap.data().email || '' } : {};
      } catch (e) { /* the warning covers it */ }
      this.tenantLoaded = true;
    }
  },
  async mounted() { await this.load(); },
  methods: {
    rm(n) { return `RM ${Number(n || 0).toFixed(2)}`; },
    move(by) { this.step = Math.min(this.steps.length - 1, Math.max(0, this.step + by)); window.scrollTo({ top: 0, behavior: 'smooth' }); },
    addBill(key) { if (!this.shown.includes(key)) this.shown = [...this.shown, key]; },
    // Removing a card clears its amount (a removed bill is saved as 0, as an empty amount always was)
    removeBill(key) { this.shown = this.shown.filter(k => k !== key); this.f[key] = ''; },
    startAgain() { this.saved = false; this.done = ''; this.error = ''; this.step = 0; this.bookingId = ''; window.scrollTo(0, 0); },
    // Every booking is listed; ones with a saved bill are marked and fill the form when picked
    async load() {
      this.loading = true;
      try {
        const [bs, us] = await Promise.all([getDocs(query(collection(db, 'offlineBookings'), limit(300))), getDocs(query(collection(db, 'utilityBills'), limit(500)))]);
        this.bills = Object.fromEntries(us.docs.map(d => [d.id, d.data()]));
        this.bookings = bs.docs.filter(d => d.data().status !== 'cancelled').map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => String(b.arrival || '').localeCompare(String(a.arrival || '')));
      } catch (e) { this.error = friendlyError(e, 'load the bookings'); }
      this.loading = false;
      // Names fill in as they arrive; the list shows the booking ID until then
      const need = [...new Set(this.bookings.map(b => b.tenantId || b.id).filter(t => t && !(t in nameCache)))];
      await Promise.all(need.map(async id => {
        const tenant = this.bookings.find(b => (b.tenantId || b.id) === id)?.tenantId;
        try { const sn = await getDoc(tenant ? doc(db, 'tenants', id, 'private', 'main') : doc(db, 'offlineBookings', id, 'private', 'main')); nameCache[id] = sn.exists() ? sn.data().name || '' : ''; } catch { /* keep the ID */ }
      }));
    },
    check() {
      const f = this.f;
      if (!this.bookingId) return 'Choose the booking this bill belongs to.';
      if (!(this.total > 0)) return 'Add at least one utility amount.';
      if (!f.from || !f.to) return 'Choose the bill period (from and to).';
      if (f.to < f.from) return 'The bill period ends before it starts.';
      if (f.invoiceLink.trim() && !/^https?:\/\//i.test(f.invoiceLink.trim())) return 'The invoice link should start with https://';
      return '';
    },
    // Opens the step a check message is about
    showStep(msg) { this.step = /^Choose the booking/.test(msg) ? 0 : 1; },
    // A Gmail compose window in a new tab with the message filled in; they check it and press send themselves.
    mailLink(b, f) {
      const line = (label, key) => cents(f[key]) > 0 ? `- ${label}: ${this.rm(f[key])}\n` : '';
      const body = `Dear ${this.tenant.name || 'Tenant'},\n\nPlease find your utility bill for ${b.unitCode || 'your unit'}${b.propertyName ? ', ' + b.propertyName : ''} for ${f.from} to ${f.to}:\n\n`
        + line('Electricity', 'electricity') + line('Water', 'water') + line('Sewerage', 'sewerage')
        + `\nTotal: ${this.rm(this.total)}\n` + (f.invoiceLink.trim() ? `\nInvoice: ${f.invoiceLink.trim()}\n` : '') + '\nThank you.\nWidebed';
      return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(this.tenant.email)}&su=${encodeURIComponent(`Utility bill - ${b.unitCode || ''}`.trim())}&body=${encodeURIComponent(body)}`;
    },
    emailTenant() {
      this.error = this.check();
      if (this.error) { if (!this.saved) this.showStep(this.error); return; }
      if (!this.tenant.email) { this.error = 'This tenant has no email address saved.'; return; }
      window.open(this.mailLink(this.picked, this.f), '_blank');
    },
    async save() {
      this.error = this.check(); this.done = '';
      if (this.error) { this.showStep(this.error); return; }
      const f = this.f, me = useSession(), b = this.picked, old = this.existing;
      const data = { periodFrom: f.from, periodTo: f.to, electricity: cents(f.electricity), water: cents(f.water), sewerage: cents(f.sewerage), total: this.total, invoiceLink: f.invoiceLink.trim() };
      const changes = old ? Object.keys(data).filter(k => (old[k] ?? '') !== data[k]).map(k => ({ field: k, old: old[k] ?? '', new: data[k] })) : [];
      if (old) {
        if (!changes.length) { this.done = 'Nothing has changed.'; return; }
        const yes = await askConfirm({ title: 'Update this utility bill?', message: `${b.id} already has a saved bill. Saving replaces it with the new amounts (${this.rm(this.total)} in total). The change is recorded in the audit log.`, confirmText: 'Yes, update' });
        if (!yes) return;
      }
      this.busy = true;
      try {
        const batch = writeBatch(db);
        if (old) {
          batch.update(doc(db, 'utilityBills', b.id), { ...data, updatedAt: serverTimestamp(), updatedBy: me.user.uid, updatedByName: me.name });
          audit(batch, me, { action: 'utilityBill.update', entity: `utilityBills/${b.id}`, propertyId: b.propertyId || null, changes });
        } else {
          batch.set(doc(db, 'utilityBills', b.id), {
            bookingId: b.id, propertyId: b.propertyId || '', propertyName: b.propertyName || '', unitCode: b.unitCode || '', ...data,
            utilityStatus: 'Ready_to_Send', createdAt: serverTimestamp(), createdBy: me.user.uid, createdByName: me.name });
          audit(batch, me, { action: 'utilityBill.create', entity: `utilityBills/${b.id}`, propertyId: b.propertyId || null,
            changes: [{ field: 'total', old: null, new: this.total }] });
        }
        await batch.commit();
        this.bills = { ...this.bills, [b.id]: { ...(old || {}), ...data } };   // picking this booking again shows the saved bill
        toast('Changes saved');
        this.done = `Utility bill ${old ? 'updated' : 'saved'} for ${b.id}: ${this.rm(this.total)}.`;
        this.start = JSON.stringify(this.f); this.saved = true; window.scrollTo(0, 0);
      } catch (e) { this.error = e.code === 'permission-denied' ? (old ? 'Only Accounting or a Director can change a saved bill.' : 'Firestore refused this. The latest security rules (utilityBills) need to be published first.') : friendlyError(e, 'save the utility bill'); }
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
.bills { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-bottom: 8px; }
.bill { border: 1px solid var(--border); border-radius: 10px; padding: 12px 12px 0; }
.bill.has { border-color: var(--accent); }
.bill-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-size: 14px; }
.bill-period { margin: -6px 0 12px; }
.add-bills { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
.month-row { margin-bottom: 12px; }
.period { display: flex; align-items: center; gap: 8px; max-width: 420px; }
.period .input { flex: 1; min-width: 0; }
.field label { display: block; font-size: 13px; color: var(--text-2); margin-bottom: 6px; }
.kvs { margin-top: 12px; }
.ok-note { color: var(--accent); }
.warn { color: var(--danger, #c0392b); }
.total { margin: 12px 0 0; font-size: 14px; }
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
@media (max-width: 640px) { .bills { grid-template-columns: minmax(0, 1fr); } }
</style>
