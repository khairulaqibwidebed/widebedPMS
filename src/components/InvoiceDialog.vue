<template>
  <div class="modal-back" @click.self="$emit('close')" v-esc="() => $emit('close')">
    <div class="modal inv-modal" role="dialog" aria-label="Invoice">
      <div class="card-head"><h2 style="margin:0">Invoice</h2><button type="button" class="icon-btn" @click="$emit('close')" aria-label="Close">×</button></div>
      <p class="help" style="margin:0 0 12px">{{ intro || 'Download the invoice and send it to the prospect. Empty fields are left out.' }}</p>
      <div class="notice error" v-show="error">{{ error }}</div>
      <!-- 20 Nov 2026: a stay over one month: the full invoice (summary + every month) or one month's page -->
      <div class="field" v-if="parts.length > 1">
        <label for="invPart">What to download</label>
        <OptionPicker id="invPart" v-model="part" :options="parts" label="What to download" />
      </div>
      <div class="field">
        <div class="inv-top">
          <label for="invTerms">Terms &amp; conditions</label>
          <button type="button" class="link" v-if="defs && terms !== defs.terms" @click="terms = defs.terms">Reset to default</button>
        </div>
        <textarea class="input inv-terms" id="invTerms" v-model="terms" :disabled="!defs" rows="12"></textarea>
        <span class="help">Changes here are for this invoice only.<template v-if="isDirector"> The default is set on <RouterLink to="/Portfolio/bookings/invoice-settings">Invoice settings</RouterLink>.</template></span>
      </div>
      <div class="modal-foot">
        <button type="button" class="btn" @click="$emit('close')">Close</button>
        <button type="button" class="btn btn-primary" @click="download()" :disabled="busy || !defs">{{ busy ? 'Making PDF…' : 'Download invoice' }}</button>
      </div>
    </div>
  </div>
</template>

<script>
// Invoice popup (16 Nov 2026): the T&Cs start as the default (Invoice settings) and can be changed for this one invoice.
// invoice = invoiceOf() from lib/booking-invoice.js.
import { loadInvoiceDefaults, buildInvoicePdf, invoiceFileName } from '@/lib/booking-invoice.js';
import { downloadBytes } from '@/lib/agreements/bytes.js';
import { useSession } from '@/stores/session.js';
import OptionPicker from '@/components/OptionPicker.vue';

export default {
  props: { invoice: { type: Object, required: true }, bookingNo: { type: String, default: '' }, intro: { type: String, default: '' } },
  components: { OptionPicker },
  emits: ['close', 'downloaded'],
  data() { return { defs: null, terms: '', busy: false, error: '', part: 'all', isDirector: useSession().role === 'director' }; },
  computed: {
    parts() {
      const ms = this.invoice.months || [];
      if (ms.length < 2) return [];
      const d = iso => new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      return [{ value: 'all', label: `Full invoice (summary + ${ms.length} months)` }, ...ms.map((m, i) => ({ value: String(i), label: `${m.label} only (${d(m.from)} – ${d(m.to)})` }))];
    },
    only() { return this.part === 'all' || !this.parts.length ? null : Number(this.part); }
  },
  async mounted() {
    try { this.defs = await loadInvoiceDefaults(true); this.terms = this.defs.terms; } catch { this.error = 'Could not load the invoice settings. Check your connection and try again.'; }
  },
  methods: {
    async download() {
      this.busy = true; this.error = '';
      try {
        const bytes = await buildInvoicePdf(this.invoice, { header: this.defs.header, terms: this.terms, bank: this.defs.bank, folio: this.bookingNo, only: this.only });
        downloadBytes(bytes, invoiceFileName(this.invoice, this.bookingNo, this.only));
        this.$emit('downloaded');
      } catch (e) { this.error = `Could not make the invoice PDF: ${e.message || e}`; }
      this.busy = false;
    }
  }
};
</script>

<style scoped>
.inv-modal { max-width: 760px; }
.inv-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.inv-terms { font-size: 13px; line-height: 1.5; resize: vertical; min-height: 220px; }
</style>
