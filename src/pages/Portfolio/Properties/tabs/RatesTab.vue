<template>
  <div>
    <!-- Fees & rates -->
    <template v-if="mode === 'rates'">
      <section class="card">
        <h2 class="t">Fees by arrangement</h2>
        <p class="card-intro">Normal rates for each owner arrangement. A unit can have its own rate on the Units tab. Fees are taken from the unit's monthly total after OTA commission; unit costs come off after the fee.</p>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Arrangement</th><th class="num">Service fee</th><th class="num">Utility fee</th><th class="num">SST on fee</th><th class="num">Units here</th></tr></thead>
            <tbody>
              <template v-for="(a, k) in ARRANGEMENTS" :key="k">
                <tr><td class="strong">{{ a.label }}</td>
                  <td class="num">{{ k === 'fixedRent' ? '—' : pct(a.serviceFeePct) }}</td>
                  <td class="num">{{ k === 'fixedRent' ? '—' : pct(a.utilityFeePct) }}</td>
                  <td class="num">{{ k === 'fixedRent' ? '—' : pct(a.sstOnFeePct) }}</td>
                  <td class="num">{{ units.filter(x => x.terms?.arrangement === k).length }}</td></tr>
              </template>
            </tbody>
          </table>
        </div>
      </section>
      <section class="card" style="margin-top:20px">
        <div class="card-head"><h2>Rules for this property</h2><span class="help">{{ rates.current ? `In force for ${monthName(asOf)}: from ${rates.current.effectiveFrom === '2000-01' ? 'the start' : monthName(rates.current.effectiveFrom)}` : '' }}</span></div>
        <div class="switch" style="border-top:0;margin-top:0"><div><b>Early check-in money goes to the owner</b><div class="help">After SST. Other incidentals stay with Widebed.</div></div>
          <input type="checkbox" v-model="rates.earlyToOwner" aria-label="Early check-in money to owner"></div>
        <div class="grid-fields">
          <div class="field"><label for="rTT">Tourism Tax per unit per night (RM)</label><input class="input" id="rTT" type="number" step="0.01" v-model="rates.tourismTax"><span class="help">Non-Malaysian guests only. Kept apart in the exports.</span></div>
          <div></div>
          <div class="field"><label>Applies from</label>
            <select class="input" v-model="rates.effectiveFrom"><template v-for="m in months" :key="m"><option :value="m" :selected="m === rates.effectiveFrom">{{ monthName(m) }}</option></template></select></div>
          <div class="field"><label for="rWhy1">Reason (audit log)</label><input class="input" id="rWhy1" v-model="rates.reason" placeholder="e.g. Owner agreement changed"></div>
        </div>
        <div class="actions"><button class="btn btn-primary" @click="save()" :disabled="busy">Save fees & rates</button></div>
      </section>
    </template>

    <!-- OTA commissions -->
    <section class="card" v-else>
      <div class="card-head"><h2>OTA commission and payout type</h2><span class="help">{{ rates.current ? `In force for ${monthName(asOf)}` : '' }}</span></div>
      <p class="card-intro">Net: the site pays Widebed after taking its commission. Gross: the site invoices its commission separately. Ctrip uses its rate only as an estimate until Accounting types the Trip.com amount.</p>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Channel</th><th>Payout</th><th class="num">Commission %</th><th class="num">Payment fee %</th><th>How the guest price is worked out</th></tr></thead>
          <tbody>
            <template v-for="k in Object.keys(rates.form)" :key="k">
              <tr>
                <td class="strong">{{ rates.form[k].label }}</td>
                <td><select class="input" style="height:34px;min-width:150px" v-model="rates.form[k].payout"><option value="net">Net</option><option value="gross">Gross</option></select></td>
                <td class="num"><input class="input inline-input" type="number" step="0.01" v-model="rates.form[k].commission" :aria-label="`${rates.form[k].label} commission`"></td>
                <td class="num"><input class="input inline-input" type="number" step="0.01" v-model="rates.form[k].paymentFee" v-show="rates.form[k].payout === 'gross'" :aria-label="`${rates.form[k].label} payment fee`"><span class="muted" v-show="rates.form[k].payout !== 'gross'">—</span></td>
                <td class="help">{{ rates.form[k].payout === 'net' ? `(room + SST) ÷ ${(100 - Number(rates.form[k].commission || 0)).toFixed(2)}%` : 'room + SST, less commission, payment fee and 8% SST on each' }}</td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
      <div class="grid-fields" style="margin-top:16px">
        <div class="field"><label>Applies from</label>
          <select class="input" v-model="rates.effectiveFrom"><template v-for="m in months" :key="m"><option :value="m" :selected="m === rates.effectiveFrom">{{ monthName(m) }}</option></template></select></div>
        <div class="field"><label for="rWhy2">Reason (audit log)</label><input class="input" id="rWhy2" v-model="rates.reason" placeholder="e.g. Agoda raised commission from October"></div>
      </div>
      <div class="actions"><button class="btn btn-primary" @click="save()" :disabled="busy">Save OTA commissions</button></div>
    </section>
  </div>
</template>

<script>
// A property's Fees & rates tab (mode "rates") and OTA commissions tab (mode "ota"). Both edit the same rate
// version, read fresh each time the tab opens. Saving adds a new version from the month picked.
import { ARRANGEMENTS } from '@/lib/engine.js';
import { monthName, pct } from '@/lib/format.js';
import { friendlyError } from '@/lib/finance-data.js';
import { useSession } from '@/stores/session.js';
import { loadRates, saveRates, forgetUnits } from '@/lib/portfolio-data.js';

const me = useSession();

export default {
  props: {
    mode: { type: String, required: true },        // 'rates' or 'ota'
    propertyId: { type: String, required: true },
    units: { type: Array, required: true },
    asOf: { type: String, required: true },
    months: { type: Array, required: true }
  },
  emits: ['saved', 'error', 'busy'],
  data() { return { ARRANGEMENTS, busy: false, rates: { form: {}, effectiveFrom: this.asOf, reason: '', earlyToOwner: true, tourismTax: 10, current: null } }; },
  async created() { await this.load(); },
  methods: {
    monthName, pct,
    async load() {
      try { this.rates = await loadRates(this.propertyId, this.asOf); }
      catch (e) { this.$emit('error', friendlyError(e, 'load the portfolio')); }
    },
    async save() {
      const r = this.rates; this.$emit('error', '');
      if (!r.reason.trim()) { this.$emit('error', 'Add a reason for the change (audit log).'); return; }
      const ota = {};
      for (const [k, f] of Object.entries(r.form)) {
        const c = Number(f.commission);
        if (!(c >= 0 && c < 100)) { this.$emit('error', `${f.label}: commission must be between 0 and 100%.`); return; }
        ota[k] = { label: f.label, payout: f.payout, commissionPct: c / 100, ...(f.payout === 'gross' ? { paymentFeePct: Number(f.paymentFee || 0) / 100, sstPct: f.sstPct } : {}) };
      }
      const tt = Number(r.tourismTax);
      if (!(tt >= 0)) { this.$emit('error', 'Tourism Tax must be 0 or more.'); return; }
      this.busy = true; this.$emit('busy', true);
      try {
        await saveRates(me, this.propertyId, { effectiveFrom: r.effectiveFrom, ota, earlyToOwner: r.earlyToOwner, tourismTax: tt, reason: r.reason.trim() });
        await forgetUnits(this.propertyId);
        this.$emit('saved', `Saved, applying from ${monthName(r.effectiveFrom)}.`);
        await this.load();
      } catch (e) { this.$emit('error', friendlyError(e, 'save the rates')); }
      this.busy = false; this.$emit('busy', false);
    }
  }
};
</script>
