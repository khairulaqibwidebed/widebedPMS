<template>
  <div class="modal-back" @click.self="$emit('close')" v-esc="() => $emit('close')">
    <div class="modal inv-modal" role="dialog" aria-label="Invoice">
      <div class="card-head"><h2 style="margin:0">Invoice</h2><button type="button" class="icon-btn" @click="$emit('close')" aria-label="Close">×</button></div>
      <p class="help" style="margin:0 0 12px">{{ intro || 'Download the invoice and send it to the prospect. Empty fields are left out.' }}</p>
      <div class="notice error" v-show="error">{{ error }}</div>
      <div class="notice warn" v-show="warnMsg">{{ warnMsg }}</div>
      <!-- 20 Nov 2026: a stay over one month: the full invoice (summary + every month) or one month's page -->
      <div class="field" v-if="parts.length > 1">
        <label for="invPart">What to download</label>
        <OptionPicker id="invPart" v-model="part" :options="parts" label="What to download" />
      </div>
      <div class="field">
        <div class="inv-top">
          <label for="invTerms">Terms &amp; conditions</label>
          <button type="button" class="link" v-if="defs && terms !== defs.terms" @click="resetTerms()" :disabled="busy">Reset to default</button>
        </div>
        <textarea class="input inv-terms" id="invTerms" v-model="terms" :disabled="!defs || busy" rows="12" :maxlength="TERMS_MAX"></textarea>
        <!-- 23 Nov 2026 (Khairul): the T&Cs are kept on the booking when the invoice is downloaded -->
        <span class="help">{{ sourceText }}<template v-if="canSettings"> The default is set on <RouterLink to="/Portfolio/bookings/settings/invoice">Booking settings</RouterLink>.</template></span>
      </div>
      <div class="modal-foot">
        <button type="button" class="btn" @click="$emit('close')">Close</button>
        <button type="button" class="btn btn-primary" @click="download()" :disabled="busy || !defs">{{ busy ? 'Making PDF…' : 'Download invoice' }}</button>
      </div>
    </div>
  </div>
</template>

<script>
// Invoice popup (16 Nov 2026). invoice = invoiceOf() from lib/booking-invoice.js.
// 23 Nov 2026 (Khairul): the T&Cs start from the BOOKING's own copy (offlineBookings/{id}.invoiceTerms) when it has one,
// else from the default (Booking settings > Invoice & T&Cs). They can be changed before downloading; on download the text
// used is saved on the booking (only when new or changed), so a later change to the default never changes this booking.
// "Reset to default" (asks first) puts the current default back for this booking.
import { loadInvoiceDefaults, loadBookingTerms, saveBookingTerms, TERMS_MAX, buildInvoicePdf, invoiceFileName } from '@/lib/booking-invoice.js';
import { downloadBytes } from '@/lib/agreements/bytes.js';
import { useSession } from '@/stores/session.js';
import { can } from '@/lib/access.js';
import { askConfirm } from '@/lib/confirm.js';
import OptionPicker from '@/components/OptionPicker.vue';

export default {
  // bookingId = the offlineBookings id (e.g. offline_BK-0001); without it nothing is saved on a booking
  props: { invoice: { type: Object, required: true }, bookingNo: { type: String, default: '' }, bookingId: { type: String, default: '' }, intro: { type: String, default: '' } },
  components: { OptionPicker },
  emits: ['close', 'downloaded'],
  data() { return { TERMS_MAX, defs: null, saved: null, terms: '', busy: false, error: '', warnMsg: '', part: 'all', canSettings: can(useSession(), 'bookingSettings.edit') }; },
  computed: {
    parts() {
      const ms = this.invoice.months || [];
      if (ms.length < 2) return [];
      const d = iso => new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      return [{ value: 'all', label: `Full invoice (summary + ${ms.length} months)` }, ...ms.map((m, i) => ({ value: String(i), label: `${m.label} only (${d(m.from)} – ${d(m.to)})` }))];
    },
    only() { return this.part === 'all' || !this.parts.length ? null : Number(this.part); },
    sourceText() {
      if (!this.bookingId) return 'Changes here are for this invoice only.';
      const s = this.saved;
      if (!s) return 'Starts from the default. The T&Cs used are saved with this booking when you download.';
      const at = s.savedAt?.toDate ? s.savedAt.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
      return `This booking's own T&Cs (saved${s.savedByName ? ' by ' + s.savedByName : ''}${at ? ', ' + at : ''}). Changes are saved with the booking when you download.`;
    }
  },
  async mounted() {
    try { this.defs = await loadInvoiceDefaults(true); } catch { this.error = 'Could not load the invoice settings. Check your connection and try again.'; return; }
    try { this.saved = await loadBookingTerms(this.bookingId); } catch { this.saved = null; }
    this.terms = this.saved ? this.saved.text : this.defs.terms;
  },
  methods: {
    async download() {
      this.busy = true; this.error = ''; this.warnMsg = '';
      if (this.terms.length > TERMS_MAX) { this.error = `The T&Cs are too long (${TERMS_MAX} characters at most).`; this.busy = false; return; }
      try {
        const bytes = await buildInvoicePdf(this.invoice, { header: this.defs.header, terms: this.terms, bank: this.defs.bank, folio: this.bookingNo, only: this.only });
        downloadBytes(bytes, invoiceFileName(this.invoice, this.bookingNo, this.only));
        this.$emit('downloaded');
      } catch (e) { this.error = `Could not make the invoice PDF: ${e.message || e}`; this.busy = false; return; }
      // Keep the T&Cs used on the booking: only when there is no copy yet or the text changed
      if (this.bookingId && (!this.saved || this.saved.text !== this.terms)) {
        try { await this.keep(this.terms === this.defs.terms, false); }
        catch (e) { this.warnMsg = `The invoice was downloaded, but its T&Cs could not be saved on the booking (${e.code === 'permission-denied' ? 'refused: Firestore rules 1.01 must be published' : e.message || e}).`; }
      }
      this.busy = false;
    },
    async keep(fromDefault, reset) {
      await saveBookingTerms(this.bookingId, this.bookingNo, this.terms, fromDefault, reset);
      this.saved = { text: this.terms, fromDefault, savedByName: useSession().name || '', savedAt: { toDate: () => new Date() } };
    },
    async resetTerms() {
      const ok = await askConfirm({ title: 'Reset to default?', message: this.saved ? 'This booking\'s own T&Cs are replaced by the current default, and saved on the booking now.' : 'The T&Cs box goes back to the current default.', confirmText: 'Reset' });
      if (!ok) return;
      this.terms = this.defs.terms; this.error = ''; this.warnMsg = '';
      if (!this.bookingId || !this.saved || this.saved.text === this.defs.terms) return;   // nothing to change on the booking: the box only
      this.busy = true;
      try { await this.keep(true, true); }
      catch (e) { this.error = e.code === 'permission-denied' ? 'Saving the reset was refused (Firestore rules 1.01 must be published).' : `Could not save the reset: ${e.message || e}`; }
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
