<template>
  <form class="util" @submit.prevent="save()" novalidate>
    <div class="notice error" v-show="error">{{ error }}</div>
    <div class="notice ok" v-show="done">{{ done }}</div>

    <section class="card">
      <h2>Select booking reference</h2>
      <div class="pick-row">
        <div class="field grow"><label>Booking ID</label>
          <OptionPicker class="fld-pick" v-model="bookingId" :options="bookingOptions" label="Booking ID" searchable /></div>
        <button type="button" class="btn" :disabled="!picked" @click="details = !details">{{ details ? 'Hide booking details' : 'View booking details' }}</button>
      </div>
      <p class="help" v-if="loading">Loading bookings…</p>
      <p class="help" v-else-if="!bookings.length">No bookings found.</p>
      <p class="help ok-note" v-else-if="existing">A bill is already saved for this booking and has been filled in below. Change anything and press Save to update it.</p>
      <div class="kvs" v-if="details && picked">
        <div class="kv"><span>Property</span><span>{{ picked.propertyName || '—' }}</span></div>
        <div class="kv"><span>Unit</span><span>{{ picked.unitCode || '—' }}</span></div>
        <div class="kv"><span>Check-in</span><span>{{ picked.arrival || '—' }}</span></div>
        <div class="kv"><span>Check-out</span><span>{{ picked.departure || '—' }}</span></div>
        <div class="kv"><span>Tenant</span><span>{{ tenant.name || '—' }}</span></div>
        <div class="kv"><span>Tenant email</span><span>{{ tenant.email || 'None on file' }}</span></div>
      </div>
      <p class="help warn" v-if="picked && tenantLoaded && !tenant.email">This tenant has no email address saved. Add it to their tenant details before emailing.</p>
    </section>

    <section class="card">
      <h2>Utility bill details</h2>
      <div class="field month-row"><label>Bill period <span class="muted">(one period for all three bills)</span></label>
        <div class="period"><input class="input" type="date" v-model="f.from" aria-label="Bill period from"><span>to</span><input class="input" type="date" v-model="f.to" aria-label="Bill period to"></div></div>
      <div class="rows">
        <div class="field" v-for="u in KINDS" :key="u.key"><label :for="'u' + u.key">{{ u.label }} (RM)</label><input class="input" :id="'u' + u.key" type="number" min="0" step="0.01" v-model="f[u.key]" placeholder="0.00"></div>
      </div>
      <div class="field"><label>Utility bills <span class="muted">(photos or PDFs, saved to Google Drive)</span></label>
        <p class="help" v-if="!bookingId">Choose a booking first.</p>
        <DriveFiles v-else :key="bookingId" kind="utility-bills" :record-id="bookingId" :label="`${picked?.unitCode || ''} ${bookingId}`" @folder="l => f.invoiceLink = l" /></div>
      <p class="total">Total utility amount: <b>{{ rm(total) }}</b></p>
    </section>

    <div class="bottom-actions">
      <button type="button" class="btn mail-btn" :disabled="busy || !tenant.email" :title="tenant.email ? 'Opens Gmail with the bill filled in' : 'This tenant has no email on file'" @click="emailTenant()"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>Email tenant</button>
      <span class="spacer"></span>
      <button type="button" class="btn" @click="$emit('close')">Cancel</button>
      <button type="submit" class="btn btn-primary" :disabled="busy">{{ busy ? 'Saving…' : 'Save' }}</button>
    </div>
  </form>
</template>

<script>
import { reactive } from 'vue';
import { collection, doc, getDoc, getDocs, limit, query, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase.js';
import { useSession } from '@/stores/session.js';
import OptionPicker from '@/components/OptionPicker.vue';
import DriveFiles from '@/components/DriveFiles.vue';
import { audit, friendlyError } from '@/lib/finance-data.js';
import { askConfirm } from '@/lib/confirm.js';
import { toast } from '@/lib/toast.js';

const KINDS = [{ key: 'electricity', label: 'Electricity' }, { key: 'water', label: 'Water' }, { key: 'sewerage', label: 'Sewerage' }];
const blank = () => ({ from: '', to: '', electricity: '', water: '', sewerage: '', invoiceLink: '' });
// Tenant names for the list, read once per visit (they sit in each tenant's private record)
const nameCache = reactive({});
const cents = v => Math.round((+v || 0) * 100) / 100;

export default {
  components: { OptionPicker, DriveFiles },
  emits: ['close', 'saved'],
  data() { return { KINDS, f: blank(), bookings: [], bills: {}, names: nameCache, bookingId: '', details: false, loading: true, tenant: {}, tenantLoaded: false, busy: false, error: '', done: '' }; },
  computed: {
    bookingOptions() {
      return [{ value: '', label: 'Choose booking ID…' }, ...this.bookings.map(b => ({ value: b.id, label: `${this.names[b.tenantId] || b.id} - ${b.unitCode || 'unit'} - ${b.arrival || ''} to ${b.departure || ''}${this.bills[b.id] ? ' · bill saved' : ''}` }))];
    },
    existing() { return this.bookingId ? this.bills[this.bookingId] || null : null; },
    picked() { return this.bookings.find(b => b.id === this.bookingId) || null; },
    total() { return cents(this.f.electricity) + cents(this.f.water) + cents(this.f.sewerage); }
  },
  watch: {
    // The tenant's name and email come from their tenant record (private details)
    async bookingId() {
      this.tenant = {}; this.tenantLoaded = false; this.error = ''; this.done = '';
      // A saved bill fills the form; a booking with none starts empty
      const old = this.existing;
      this.f = old ? { from: old.periodFrom || '', to: old.periodTo || '', electricity: old.electricity || '', water: old.water || '', sewerage: old.sewerage || '', invoiceLink: old.invoiceLink || '' } : blank();
      const b = this.picked;
      if (!b || !b.tenantId) { this.tenantLoaded = !!b; return; }
      try {
        const snap = await getDoc(doc(db, 'tenants', b.tenantId, 'private', 'main'));
        if (this.picked?.id === b.id) this.tenant = snap.exists() ? { name: snap.data().name || '', email: snap.data().email || '' } : {};
      } catch (e) { /* the warning below covers it */ }
      this.tenantLoaded = true;
    }
  },
  async mounted() { await this.load(); },
  methods: {
    rm(n) { return `RM ${Number(n || 0).toFixed(2)}`; },
    // Every booking is listed; ones with a saved bill are marked and fill the form when picked
    async load() {
      this.loading = true;
      try {
        const [bs, us] = await Promise.all([getDocs(query(collection(db, 'offlineBookings'), limit(100))), getDocs(query(collection(db, 'utilityBills'), limit(500)))]);
        this.bills = Object.fromEntries(us.docs.map(d => [d.id, d.data()]));
        this.bookings = bs.docs.filter(d => d.data().status !== 'cancelled').map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => String(b.arrival || '').localeCompare(String(a.arrival || '')));
      } catch (e) { this.error = friendlyError(e, 'load the bookings'); }
      this.loading = false;
      // Names fill in as they arrive; the list shows the booking ID until then
      const need = [...new Set(this.bookings.map(b => b.tenantId).filter(t => t && !(t in nameCache)))];
      await Promise.all(need.map(async id => {
        try { const sn = await getDoc(doc(db, 'tenants', id, 'private', 'main')); nameCache[id] = sn.exists() ? sn.data().name || '' : ''; } catch { /* keep the ID */ }
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
    // A Gmail compose window in a new tab with the message filled in; they check it and press send themselves.
    mailLink(b, f) {
      const line = (label, key) => cents(f[key]) > 0 ? `- ${label}: ${this.rm(f[key])}\n` : '';
      const body = `Dear ${this.tenant.name || 'Tenant'},\n\nPlease find your utility bill for ${b.unitCode || 'your unit'}${b.propertyName ? ', ' + b.propertyName : ''} for ${f.from} to ${f.to}:\n\n`
        + line('Electricity', 'electricity') + line('Water', 'water') + line('Sewerage', 'sewerage')
        + `\nTotal: ${this.rm(this.total)}\n` + (f.invoiceLink.trim() ? `\nInvoice: ${f.invoiceLink.trim()}\n` : '') + '\nThank you.\nWidebed';
      return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(this.tenant.email)}&su=${encodeURIComponent(`Utility bill - ${b.unitCode || ''}`.trim())}&body=${encodeURIComponent(body)}`;
    },
    emailTenant() {
      this.error = this.check(); this.done = '';
      if (this.error) return;
      if (!this.tenant.email) { this.error = 'This tenant has no email address saved.'; return; }
      window.open(this.mailLink(this.picked, this.f), '_blank');
    },
    async save() {
      this.error = this.check(); this.done = '';
      if (this.error) return;
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
        this.bills = { ...this.bills, [b.id]: { ...(old || {}), ...data } };   // the form stays on this booking, now in "saved" mode
        toast('Changes saved');
        this.done = `Utility bill ${old ? 'updated' : 'saved'} for ${b.id}: ${this.rm(this.total)}.`;
        this.$emit('saved');
      } catch (e) { this.error = e.code === 'permission-denied' ? (old ? 'Only Finance or a Director can change a saved bill.' : 'Firestore refused this. The latest security rules (utilityBills) need to be published first.') : friendlyError(e, 'save the utility bill'); }
      this.busy = false;
    }
  }
};
</script>

<style scoped>
.util { display: grid; gap: 14px; padding: 14px; }
.util .card { margin: 0; }
.util h2 { font-size: 15px; margin: 0 0 12px; }
.pick-row { display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap; }
.grow { flex: 1; min-width: 220px; }
.pick-row .field { margin-bottom: 0; }
.pick-row > .btn { height: 40px; white-space: nowrap; }
.pick-row > .btn:disabled { opacity: .5; cursor: not-allowed; }
.rows { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px 16px; margin-bottom: 12px; }
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
.spacer { flex: 1; }
.bottom-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 8px; padding: 14px 0 20px; }
@media (max-width: 640px) { .rows { grid-template-columns: minmax(0, 1fr); } }
</style>
