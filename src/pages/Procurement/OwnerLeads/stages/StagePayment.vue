<template>
  <section class="card" aria-label="Final quotation and payment">
    <div class="card-head"><h2>{{ `${n}. Final quotation & payment` }}</h2><span class="pill" :class="d.payment.confirmed ? 'green' : 'grey'">{{ d.payment.confirmed ? 'Payment confirmed' : 'Waiting for payment' }}</span></div>
    <template v-for="k in PAY_LINKS" :key="k[0]">
      <div class="field" v-if="canEdit"><label :for="'pay_' + k[0]">{{ `${k[1]} (Google Drive link)` }}</label><input class="input" :id="'pay_' + k[0]" v-model="d.payment[k[0]]" placeholder="https://drive.google.com/…">
        <div style="margin-top:6px"><UploadFile kind="listings" :record-id="listingId" :folder-label="`${d.property} ${d.unit}`" :multiple="false" accept="image/*,application/pdf" @done="f => d.payment[k[0]] = f[0].url" /></div></div>
      <div class="kv" v-else><span>{{ k[1] }}</span><span><a v-if="d.payment[k[0]]" :href="d.payment[k[0]]" target="_blank" rel="noopener" @click.prevent="$refs.viewer.open({ name: k[1], url: d.payment[k[0]], kind: 'listings' })">Open</a><template v-else>—</template></span></div>
    </template>
    <div class="totals quote">
      <template v-for="p in quoteParts(d)" :key="p[0]"><div class="kv"><span>{{ p[0] }}</span><span>{{ rm(p[1]) }}</span></div></template>
      <p class="muted" v-if="!quoteParts(d).length">Nothing to quote: no renovation, furniture or maintenance package chosen in Types of service.</p>
      <div class="kv total"><span>Quotation total</span><span>{{ rm(quoteTotal(d)) }}</span></div>
    </div>
    <div class="field" v-if="canEdit && !d.payment.confirmed" style="max-width:320px"><label for="payAmt">Final amount (RM)</label>
      <div class="amt-row"><input class="input" id="payAmt" v-model="d.payment.amount" inputmode="decimal" :placeholder="quoteTotal(d).toFixed(2)">
        <button type="button" class="editlink" v-show="money(d.payment.amount) !== quoteTotal(d)" @click="d.payment.amount = quoteTotal(d).toFixed(2)">Use total</button></div></div>
    <div class="kv" v-else><span>Final amount</span><span>{{ d.payment.amount === '' ? '—' : rm(d.payment.amount) }}</span></div>
    <div class="kv" v-if="d.payment.confirmed"><span>Confirmed</span><span>{{ `${d.payment.confirmedByName}, ${stamp(d.payment.confirmedAt)}` }}</span></div>
    <p class="help">Payment confirmed saves the listing and sends the Marketing team a notification about it.</p>
    <div class="actions" v-if="canEdit && !d.payment.confirmed">
      <button class="btn btn-primary" @click="$emit('confirm-payment')" :disabled="busy">Payment confirmed</button>
    </div>
    <FileViewer ref="viewer" />
  </section>
</template>

<script>
// Stage: Final quotation & payment. The quotation counts only the stages in use plus the maintenance package. Edits the draft (d) in place; Payment confirmed is done by the page (save + notify).
import { PAY_LINKS, money, rm, stamp, quoteParts, quoteTotal } from '@/lib/owner-leads.js';
import UploadFile from '@/components/UploadFile.vue';
import FileViewer from '@/components/FileViewer.vue';

export default {
  components: { UploadFile, FileViewer },
  props: { d: { type: Object, required: true }, listingId: { type: String, required: true }, canEdit: Boolean, busy: Boolean, n: { type: Number, default: 4 } },
  emits: ['confirm-payment'],
  data() { return { PAY_LINKS }; },
  methods: { money, rm, stamp, quoteParts, quoteTotal }
};
</script>
