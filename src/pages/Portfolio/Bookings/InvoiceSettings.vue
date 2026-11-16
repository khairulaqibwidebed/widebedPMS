<template>
  <main class="content">
    <div class="loading-bar" v-show="loading || busy"></div>
    <div class="page-head">
      <div>
        <h1>Invoice settings</h1>
        <div class="sub"><RouterLink to="/Portfolio/bookings">Portfolio › Bookings</RouterLink> › Invoice settings · what every booking invoice starts with.</div>
      </div>
      <div class="head-tools">
        <RouterLink class="btn" to="/Portfolio/bookings">Back</RouterLink>
        <button type="button" class="btn btn-primary" @click="save()" :disabled="busy || !dirty">{{ busy ? 'Saving…' : 'Save settings' }}</button>
      </div>
    </div>

    <div class="is-grid" v-if="!loading">
      <section class="card" v-for="box in BOXES" :key="box.key" :class="{ tall: box.key === 'terms' }">
        <div class="card-head"><h2>{{ box.title }}</h2><button type="button" class="link" v-if="f[box.key] !== DEF[box.key]" @click="f[box.key] = DEF[box.key]">Reset to the original</button></div>
        <p class="help" style="margin:0 0 10px">{{ box.help }}</p>
        <textarea class="input is-text" v-model="f[box.key]" :rows="box.rows" :aria-label="box.title"></textarea>
      </section>
    </div>
    <p class="muted" v-if="!loading" style="margin-top:12px">{{ updatedText }}</p>
  </main>
</template>

<script>
// Portfolio > Bookings > Invoice settings (/Portfolio/bookings/invoice-settings), 16 Nov 2026. Directors only.
// The header, T&Cs and bank details on every booking invoice (config/invoiceDefaults, Firestore rules 0.71).
// The T&Cs can still be changed for one invoice when it is downloaded.
import { loadInvoiceDefaults, saveInvoiceDefaults, INVOICE_DEFAULTS as DEF } from '@/lib/booking-invoice.js';
import { askConfirm } from '@/lib/confirm.js';

const BOXES = [
  { key: 'header', title: 'Header', rows: 5, help: 'One item per line. The first line is the company name in bold; the rest show small underneath.' },
  { key: 'bank', title: 'Bank details', rows: 6, help: 'One item per line. Each line gets a bullet on the invoice.' },
  { key: 'terms', title: 'Terms & conditions', rows: 22, help: 'One line each. A section title (e.g. "A. INTERPRETATION" or all capitals) is printed in bold; lines starting with 1., 2. hang under their number.' }
];
const snap = f => JSON.stringify([f.header.trim(), f.terms.trim(), f.bank.trim()]);

export default {
  data() { return { BOXES, DEF, f: { header: '', terms: '', bank: '' }, start: '', meta: null, loading: true, busy: false, error: '', okMsg: '' }; },
  computed: {
    dirty() { return !this.loading && snap(this.f) !== this.start; },
    updatedText() {
      const m = this.meta; if (!m?.saved) return 'Using the original text (nothing saved yet).';
      const at = m.updatedAt?.toDate ? m.updatedAt.toDate().toLocaleString('en-MY', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
      return `Last saved${m.updatedByName ? ' by ' + m.updatedByName : ''}${at ? ', ' + at : ''}.`;
    }
  },
  async mounted() {
    window.addEventListener('beforeunload', this.warn);
    try { this.meta = await loadInvoiceDefaults(true); this.f = { header: this.meta.header, terms: this.meta.terms, bank: this.meta.bank }; }
    catch { this.error = 'Could not load the invoice settings.'; this.f = { ...DEF }; }
    this.start = snap(this.f); this.loading = false;
  },
  unmounted() { window.removeEventListener('beforeunload', this.warn); },
  async beforeRouteLeave() {
    if (!this.dirty) return true;
    return askConfirm({ title: 'Leave without saving?', message: 'Your changes to the invoice settings will be lost.', confirmText: 'Leave', danger: true });
  },
  methods: {
    warn(e) { if (!this.dirty) return; e.preventDefault(); e.returnValue = ''; },
    async save() {
      this.error = ''; this.okMsg = '';
      if (!this.f.header.trim()) { this.error = 'Keep at least the company name in the header.'; return; }
      this.busy = true;
      try {
        await saveInvoiceDefaults(this.f);
        this.meta = await loadInvoiceDefaults(true); this.f = { header: this.meta.header, terms: this.meta.terms, bank: this.meta.bank }; this.start = snap(this.f);
        this.okMsg = 'Saved. New invoices use these.';
      } catch (e) { this.error = e.code === 'permission-denied' ? 'Saving was refused. Only Directors can change these (Firestore rules 0.71 must be published).' : `Could not save: ${e.message || e}`; }
      this.busy = false;
    }
  }
};
</script>

<style scoped>
.head-tools { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.is-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; align-items: start; }
.is-grid .tall { grid-column: 1 / -1; }
@media (max-width: 960px) { .is-grid { grid-template-columns: minmax(0, 1fr); } }
.is-text { width: 100%; font-size: 13px; line-height: 1.5; resize: vertical; }
</style>
