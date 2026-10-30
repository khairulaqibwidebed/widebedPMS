<template>
  <form class="util" @submit.prevent="save(false)" novalidate>
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
      <p class="help" v-else-if="!bookings.length">No bookings are waiting for a utility bill.</p>
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
      <button type="button" class="btn" @click="$emit('close')">Cancel</button>
      <button type="submit" class="btn" :class="{ 'btn-primary': !tenant.email }" :disabled="busy">{{ busy ? 'Saving…' : 'Commit utility adjustments' }}</button>
      <button type="button" class="btn btn-primary" v-if="tenant.email" :disabled="busy" @click="save(true)">Save and email tenant</button>
    </div>
  </form>
</template>

<script>
import { collection, doc, getDoc, getDocs, limit, query, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase.js';
import { useSession } from '@/stores/session.js';
import OptionPicker from '@/components/OptionPicker.vue';
import DriveFiles from '@/components/DriveFiles.vue';
import { audit, friendlyError } from '@/lib/finance-data.js';

const KINDS = [{ key: 'electricity', label: 'Electricity' }, { key: 'water', label: 'Water' }, { key: 'sewerage', label: 'Sewerage' }];
const blank = () => ({ from: '', to: '', electricity: '', water: '', sewerage: '', invoiceLink: '' });
const cents = v => Math.round((+v || 0) * 100) / 100;

export default {
  components: { OptionPicker, DriveFiles },
  emits: ['close', 'saved'],
  data() { return { KINDS, f: blank(), bookings: [], bookingId: '', details: false, loading: true, tenant: {}, tenantLoaded: false, busy: false, error: '', done: '' }; },
  computed: {
    bookingOptions() {
      return [{ value: '', label: 'Choose booking ID…' }, ...this.bookings.map(b => ({ value: b.id, label: `${b.id} · ${b.unitCode || 'unit'} · ${b.arrival || ''} to ${b.departure || ''}` }))];
    },
    picked() { return this.bookings.find(b => b.id === this.bookingId) || null; },
    total() { return cents(this.f.electricity) + cents(this.f.water) + cents(this.f.sewerage); }
  },
  watch: {
    // The tenant's name and email come from their tenant record (private details)
    async bookingId() {
      this.tenant = {}; this.tenantLoaded = false;
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
    // Bookings that have no utility bill yet (a booking drops out of the list once its bill is saved)
    async load() {
      this.loading = true;
      try {
        const [bs, us] = await Promise.all([getDocs(query(collection(db, 'offlineBookings'), limit(300))), getDocs(query(collection(db, 'utilityBills'), limit(500)))]);
        const done = new Set(us.docs.map(d => d.id));
        this.bookings = bs.docs.filter(d => !done.has(d.id) && d.data().status !== 'cancelled').map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => String(b.arrival || '').localeCompare(String(a.arrival || '')));
      } catch (e) { this.error = friendlyError(e, 'load the bookings'); }
      this.loading = false;
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
    async save(email = false) {
      this.error = this.check(); this.done = '';
      if (this.error) return;
      const f = this.f, me = useSession(), b = this.picked;
      // Open the tab now, while the click still counts (browsers block tabs opened after a wait), and point it at Gmail once the bill is saved
      const tab = email && this.tenant.email ? window.open('about:blank', '_blank') : null;
      this.busy = true;
      try {
        const batch = writeBatch(db);
        batch.set(doc(db, 'utilityBills', b.id), {
          bookingId: b.id, propertyId: b.propertyId || '', propertyName: b.propertyName || '', unitCode: b.unitCode || '',
          periodFrom: f.from, periodTo: f.to, electricity: cents(f.electricity), water: cents(f.water), sewerage: cents(f.sewerage),
          total: this.total, invoiceLink: f.invoiceLink.trim(), utilityStatus: 'Ready_to_Send',
          createdAt: serverTimestamp(), createdBy: me.user.uid, createdByName: me.name });
        audit(batch, me, { action: 'utilityBill.create', entity: `utilityBills/${b.id}`, propertyId: b.propertyId || null,
          changes: [{ field: 'total', old: null, new: this.total }] });
        const link = email && this.tenant.email ? this.mailLink(b, f) : '';
        await batch.commit();
        this.done = `Utility bill saved for ${b.id}: ${this.rm(this.total)}.` + (link ? ' Gmail is open in a new tab with the message ready to send.' : '');
        this.bookings = this.bookings.filter(x => x.id !== b.id);
        this.bookingId = ''; this.f = blank(); this.details = false;
        this.$emit('saved');
        if (link && tab) tab.location.href = link;
      } catch (e) { if (tab) tab.close(); this.error = e.code === 'permission-denied' ? 'Firestore refused this. The latest security rules (utilityBills) need to be published first.' : friendlyError(e, 'save the utility bill'); }
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
.warn { color: var(--danger, #c0392b); }
.total { margin: 12px 0 0; font-size: 14px; }
.fld-pick { display: block; width: 100%; }
.fld-pick :deep(.op-btn), .fld-pick :deep(.op-input) { width: 100%; min-height: 40px; }
.fld-pick :deep(.op-pop) { max-width: none; width: 100%; }
.bottom-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 8px; padding: 14px 0 20px; }
@media (max-width: 640px) { .rows { grid-template-columns: minmax(0, 1fr); } }
</style>
