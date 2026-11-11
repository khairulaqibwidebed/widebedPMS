<template>
  <section class="card" aria-label="Final quotation and payment">
    <div class="card-head"><h2>{{ `${n}. Final quotation & payment` }}</h2><span class="pill" :class="pill[1]">{{ pill[0] }}</span></div>
    <template v-for="k in DOC_LINKS" :key="k[0]">
      <div class="field" v-if="canEdit"><label :for="'pay_' + k[0]">{{ `${k[1]} (Google Drive link)` }}</label><input class="input" :id="'pay_' + k[0]" v-model="d.payment[k[0]]" placeholder="https://drive.google.com/…">
        <div style="margin-top:6px"><UploadFile kind="listings" :record-id="listingId" :folder-label="`${d.property} ${d.unit}`" :multiple="false" accept="image/*,application/pdf" @done="f => d.payment[k[0]] = f[0].url" /></div></div>
      <div class="kv" v-else><span>{{ k[1] }}</span><span><a v-if="d.payment[k[0]]" :href="d.payment[k[0]]" target="_blank" rel="noopener" @click.prevent="$refs.viewer.open({ name: k[1], url: d.payment[k[0]], kind: 'listings' })">Open</a><template v-else>—</template></span></div>
    </template>
    <div class="totals quote">
      <template v-for="p in quoteParts(d)" :key="p[0]"><div class="kv"><span>{{ p[0] }}</span><span>{{ rm(p[1]) }}</span></div></template>
      <p class="muted" v-if="!quoteParts(d).length">Nothing to quote: no renovation, furniture or maintenance package chosen in Types of service.</p>
      <div class="kv total"><span>Quotation total</span><span>{{ rm(quoteTotal(d)) }}</span></div>
    </div>
    <div class="quote-dl"><button type="button" class="btn" @click="$emit('download-quote')" :disabled="pdfBusy">{{ pdfBusy ? 'Making the PDF…' : 'Download quotation (PDF)' }}</button></div>

    <div class="form-sec">Payment</div>
    <div class="pay-types" role="group" aria-label="Payment type" v-if="canEdit && !typeLocked">
      <template v-for="t in PAY_TYPES" :key="t.key">
        <button type="button" class="pay-type" :class="{ sel: d.payment.type === t.key }" :aria-pressed="d.payment.type === t.key" @click="d.payment.type = t.key">
          <span class="pt-radio"></span><span><b>{{ t.label }}</b><small>{{ t.hint }}</small></span>
        </button>
      </template>
    </div>
    <div class="kv" v-else><span>Payment type</span><span>{{ payTypeLabel(d.payment.type) }}</span></div>

    <div class="field" v-if="canEdit && !d.payment.confirmed" style="max-width:320px"><label for="payAmt">Final amount (RM)</label>
      <div class="amt-row"><input class="input" id="payAmt" v-model="d.payment.amount" inputmode="decimal" :placeholder="quoteTotal(d).toFixed(2)">
        <button type="button" class="editlink" v-show="money(d.payment.amount) !== quoteTotal(d)" @click="d.payment.amount = quoteTotal(d).toFixed(2)">Use total</button></div></div>
    <div class="kv" v-else><span>Final amount</span><span>{{ d.payment.amount === '' ? '—' : rm(d.payment.amount) }}</span></div>

    <!-- Full payment: as before -->
    <template v-if="!isDeposit(d)">
      <ProofLink :d="d" path="proofUrl" label="Payment proof" :listing-id="listingId" :can-edit="canEdit" @open="openFile" />
      <div class="kv" v-if="d.payment.confirmed"><span>Confirmed</span><span>{{ `${d.payment.confirmedByName}, ${stamp(d.payment.confirmedAt)}` }}</span></div>
      <p class="help">Payment confirmed saves the listing and sends the Marketing team a notification about it.</p>
      <div class="actions" v-if="canEdit && !d.payment.confirmed">
        <button class="btn btn-primary" @click="$emit('confirm-payment', 'full')" :disabled="busy">Payment confirmed</button>
      </div>
    </template>

    <!-- Deposit + balance: each part with its own proof and its own received -->
    <template v-else>
      <div class="part">
        <div class="part-head"><h3>Deposit</h3><span class="pill" :class="d.payment.deposit.received ? 'green' : 'grey'">{{ d.payment.deposit.received ? 'Received' : 'Waiting' }}</span></div>
        <div class="field" v-if="canEdit && !d.payment.deposit.received" style="max-width:320px"><label for="payDep">Deposit (RM)</label>
          <input class="input" id="payDep" v-model="d.payment.deposit.amount" inputmode="decimal" placeholder="e.g. 2000"></div>
        <div class="kv" v-else><span>Deposit</span><span>{{ d.payment.deposit.amount === '' ? '—' : rm(d.payment.deposit.amount) }}</span></div>
        <ProofLink :d="d" path="deposit.proofUrl" label="Deposit proof" :listing-id="listingId" :can-edit="canEdit" @open="openFile" />
        <div class="kv" v-if="d.payment.deposit.received"><span>Received</span><span>{{ `Confirmed by ${d.payment.deposit.receivedByName}, ${stamp(d.payment.deposit.receivedAt)}` }}</span></div>
        <div class="actions" v-if="canEdit && !d.payment.deposit.received">
          <button class="btn btn-primary" @click="$emit('confirm-payment', 'deposit')" :disabled="busy">Deposit received</button>
        </div>
      </div>
      <div class="part">
        <div class="part-head"><h3>Balance</h3><span class="pill" :class="d.payment.balance.received ? 'green' : 'grey'">{{ d.payment.balance.received ? 'Received' : 'Waiting' }}</span></div>
        <div class="kv"><span>Balance (final amount less deposit)</span><span>{{ money(d.payment.amount) > 0 ? rm(balanceOf(d)) : '—' }}</span></div>
        <ProofLink :d="d" path="balance.proofUrl" label="Balance proof" :listing-id="listingId" :can-edit="canEdit" @open="openFile" />
        <div class="kv" v-if="d.payment.balance.received"><span>Received</span><span>{{ `Confirmed by ${d.payment.balance.receivedByName}, ${stamp(d.payment.balance.receivedAt)}` }}</span></div>
        <div class="actions" v-if="canEdit && !d.payment.balance.received">
          <button class="btn btn-primary" @click="$emit('confirm-payment', 'balance')" :disabled="busy || !d.payment.deposit.received" :title="d.payment.deposit.received ? '' : 'Confirm the deposit first'">Balance received</button>
        </div>
      </div>
      <p class="help">Marketing starts once the deposit is received: Deposit received saves the listing and sends the Marketing team a notification. Balance received marks the listing paid in full.</p>
    </template>
    <FileViewer ref="viewer" />
  </section>
</template>

<script>
// Stage: Final quotation & payment. The quotation counts only the stages in use plus the maintenance package.
// Payment type: Full payment (Payment confirmed) or Deposit + balance (Deposit received, then Balance received; each part
// has its own proof link; Marketing starts on Deposit received). Edits the draft (d) in place; the confirms and the PDF are done by the page (save + notify).
import { h } from 'vue';
import { PAY_LINKS, PAY_TYPES, payTypeLabel, isDeposit, balanceOf, linkAt, money, rm, stamp, quoteParts, quoteTotal } from '@/lib/owner-leads.js';
import UploadFile from '@/components/UploadFile.vue';
import FileViewer from '@/components/FileViewer.vue';

// One proof link (Google Drive link, or an upload) at d.payment.<path>
const ProofLink = {
  props: { d: Object, path: String, label: String, listingId: String, canEdit: Boolean },
  emits: ['open'],
  methods: {
    set(v) { const keys = this.path.split('.'), last = keys.pop(); keys.reduce((o, k) => o[k], this.d.payment)[last] = v; }
  },
  render() {
    const url = linkAt(this.d, this.path), id = 'pay_' + this.path.replace('.', '_');
    if (!this.canEdit) {
      return h('div', { class: 'kv' }, [h('span', this.label), h('span', url
        ? h('a', { href: url, target: '_blank', rel: 'noopener', onClick: e => { e.preventDefault(); this.$emit('open', this.label, url); } }, 'Open') : '—')]);
    }
    return h('div', { class: 'field' }, [
      h('label', { for: id }, [`${this.label} (Google Drive link) `, h('span', { class: 'muted' }, 'optional')]),
      h('input', { class: 'input', id, value: url, placeholder: 'https://drive.google.com/…', onInput: e => this.set(e.target.value) }),
      h('div', { style: 'margin-top:6px' }, [h(UploadFile, { kind: 'listings', recordId: this.listingId, folderLabel: `${this.d.property} ${this.d.unit}`, multiple: false,
        accept: 'image/*,application/pdf', onDone: f => this.set(f[0].url) })])
    ]);
  }
};

export default {
  components: { UploadFile, FileViewer, ProofLink },
  props: { d: { type: Object, required: true }, listingId: { type: String, required: true }, canEdit: Boolean, busy: Boolean, pdfBusy: Boolean, n: { type: Number, default: 4 } },
  emits: ['confirm-payment', 'download-quote'],
  // The Payment proof link sits with the payment type now; the other two links stay on top
  data() { return { DOC_LINKS: PAY_LINKS.filter(([k]) => k !== 'proofUrl'), PAY_TYPES }; },
  computed: {
    // The type can't change once money is recorded as received
    typeLocked() { return this.d.payment.confirmed || this.d.payment.deposit.received; },
    pill() {
      const p = this.d.payment;
      if (p.confirmed) return [isDeposit(this.d) ? 'Paid in full' : 'Payment confirmed', 'green'];
      if (isDeposit(this.d) && p.deposit.received) return ['Deposit received, balance due', 'amber'];
      return ['Waiting for payment', 'grey'];
    }
  },
  methods: {
    money, rm, stamp, quoteParts, quoteTotal, isDeposit, balanceOf, payTypeLabel,
    openFile(name, url) { this.$refs.viewer.open({ name, url, kind: 'listings' }); }
  }
};
</script>

<style scoped>
.form-sec { font-weight: 600; font-size: 13px; margin: 18px 0 8px; color: var(--text-2); }
.quote-dl { display: flex; justify-content: flex-end; margin: -6px 0 4px; }
.pay-types { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-bottom: 12px; }
.pay-type { display: flex; gap: 12px; align-items: flex-start; text-align: left; padding: 12px 14px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); color: var(--text); cursor: pointer; font: inherit; }
.pay-type:hover { border-color: var(--accent); }
.pay-type b { display: block; font-size: 14px; font-weight: 600; }
.pay-type small { display: block; font-size: 12px; color: var(--muted); margin-top: 2px; }
.pt-radio { flex: 0 0 18px; width: 18px; height: 18px; margin-top: 1px; border-radius: 50%; border: 2px solid var(--border); background: var(--surface); }
.pay-type.sel { border-color: var(--accent); background: var(--accent-soft); }
.pay-type.sel .pt-radio { border-color: var(--accent); background: radial-gradient(var(--accent) 0 4px, var(--surface) 5px); }
.part { border-top: 1px solid var(--line); padding-top: 12px; margin-top: 12px; }
.part-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 8px; }
.part-head h3 { font-size: 14px; margin: 0; }
@media (max-width: 600px) { .pay-types { grid-template-columns: minmax(0, 1fr); } }
</style>
