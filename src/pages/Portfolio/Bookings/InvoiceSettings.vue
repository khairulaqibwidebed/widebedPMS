<template>
  <div class="is-panel">
    <div class="loading-bar" v-show="loading || busy"></div>
    <div class="is-head">
      <div>
        <h2>Invoice &amp; T&amp;Cs</h2>
        <p class="help" style="margin:4px 0 0">What every booking invoice starts with. A booking keeps the T&amp;Cs it was first invoiced with; changing them here does not change those.</p>
      </div>
    </div>
    <div class="notice error" v-show="error">{{ error }}</div>
    <div class="notice ok" v-show="okMsg">{{ okMsg }}</div>

    <div class="is-grid" v-if="!loading">
      <section class="card" v-for="box in BOXES" :key="box.key" :class="{ tall: box.key === 'terms' }">
        <div class="card-head"><h3>{{ box.title }}</h3><button type="button" class="link" v-if="f[box.key] !== DEF[box.key]" @click="f[box.key] = DEF[box.key]">Reset to the original</button></div>
        <p class="help" style="margin:0 0 10px">{{ box.help }}</p>
        <textarea class="input is-text" :class="`h-${box.key}`" v-model="f[box.key]" :rows="box.rows" :aria-label="box.title" :maxlength="box.max"></textarea>
      </section>
    </div>
    <!-- 23 Nov 2026 (Khairul): Save at the bottom right -->
    <div class="is-foot">
      <p class="muted">{{ loading ? '' : updatedText }}</p>
      <button type="button" class="btn btn-primary" @click="save()" :disabled="loading || busy || !dirty">{{ busy ? 'Saving…' : 'Save settings' }}</button>
    </div>
  </div>
</template>

<script>
// Booking settings > Invoice & T&Cs (/Portfolio/bookings/settings/invoice). Was its own page "Invoice settings", Directors
// only (16 Nov 2026); since 23 Nov 2026 a tab of Booking settings for the 'bookingSettings.edit' tick.
// The header, T&Cs and bank details on every booking invoice (config/invoiceDefaults, Firestore rules 1.01).
// The T&Cs box is the default each booking's invoice starts with; the booking keeps its own copy once invoiced.
// Emits 'dirty' (true/false) so the settings page can warn before leaving or switching tab.
import { loadInvoiceDefaults, saveInvoiceDefaults, INVOICE_DEFAULTS as DEF } from '@/lib/booking-invoice.js';

const BOXES = [
  { key: 'header', title: 'Header', rows: 5, max: 1000, help: "Each invoice starts with the booking's property name ('<property> By Widebed') and that property's address, then the Phone, Email and URL lines from here. The name and address lines here are used only when a booking has no property." },
  { key: 'bank', title: 'Bank details', rows: 6, max: 2000, help: 'One item per line. Each line gets a bullet on the invoice.' },
  { key: 'terms', title: 'Terms & conditions (default)', rows: 22, max: 20000, help: 'One line each. A section title (e.g. "A. INTERPRETATION" or all capitals) is printed in bold; lines starting with 1., 2. hang under their number.' }
];
const snap = f => JSON.stringify([f.header.trim(), f.terms.trim(), f.bank.trim()]);

export default {
  emits: ['dirty'],
  data() { return { BOXES, DEF, f: { header: '', terms: '', bank: '' }, start: '', meta: null, loading: true, busy: false, error: '', okMsg: '' }; },
  computed: {
    dirty() { return !this.loading && snap(this.f) !== this.start; },
    updatedText() {
      const m = this.meta; if (!m?.saved) return 'Using the original text (nothing saved yet).';
      const at = m.updatedAt?.toDate ? m.updatedAt.toDate().toLocaleString('en-MY', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
      return `Last saved${m.updatedByName ? ' by ' + m.updatedByName : ''}${at ? ', ' + at : ''}.`;
    }
  },
  watch: { dirty(v) { this.$emit('dirty', v); if (v) this.okMsg = ''; } },
  async mounted() {
    try { this.meta = await loadInvoiceDefaults(true); this.f = { header: this.meta.header, terms: this.meta.terms, bank: this.meta.bank }; }
    catch { this.error = 'Could not load the invoice settings.'; this.f = { ...DEF }; }
    this.start = snap(this.f); this.loading = false;
  },
  methods: {
    async save() {
      this.error = ''; this.okMsg = '';
      if (!this.f.header.trim()) { this.error = 'Keep at least the company name in the header.'; return; }
      this.busy = true;
      try {
        await saveInvoiceDefaults(this.f, this.meta);
        this.meta = await loadInvoiceDefaults(true); this.f = { header: this.meta.header, terms: this.meta.terms, bank: this.meta.bank }; this.start = snap(this.f);
        this.okMsg = 'Saved. New invoices use these. Bookings already invoiced keep their own T&Cs.';
      } catch (e) { this.error = e.code === 'permission-denied' ? 'Saving was refused. You need the "Booking settings" access, and Firestore rules 1.01 must be published.' : `Could not save: ${e.message || e}`; }
      this.busy = false;
    }
  }
};
</script>

<style scoped>
.is-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
.is-head h2 { margin: 0; font-size: 17px; }
.is-foot { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 14px; }
.is-foot p { margin: 0; }
.card-head h3 { margin: 0; font-size: 15px; }
.is-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; align-items: stretch; }
/* 23 Nov 2026 (Khairul): Header and Bank details cards the same height; the boxes fill the card down to the bottom */
.is-grid > .card { display: flex; flex-direction: column; }
.is-grid > .card .is-text { flex: 1 1 auto; }
.is-grid .tall { grid-column: 1 / -1; }
@media (max-width: 960px) { .is-grid { grid-template-columns: minmax(0, 1fr); } }
.is-text { width: 100%; font-size: 13px; line-height: 1.5; resize: vertical; height: auto; }
/* 23 Nov 2026 (Khairul): big boxes (app.css fixes textareas at 72px, which hid the rows setting) */
.is-text.h-header, .is-text.h-bank { height: auto; min-height: 150px; }
.is-text.h-terms { height: 520px; }
</style>
