<template>
  <div>
    <!-- Fees & rates: fee arrangements by stay length, saved per property (lib/fee-types.js has the types and their maths) -->
    <template v-if="mode === 'rates'">
      <div class="fees-intro"><p class="card-intro">Fee arrangements for this property, split by stay length. A unit can still have its own rate on the Units tab. Changes start from the month you pick and are kept in the Audit log.</p>
        <button class="btn info-btn" type="button" @click="howOpen = true" aria-label="How each fee type is worked out" title="How each fee type is worked out"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg></button></div>

      <!-- How each fee type is worked out: same look as Staff accounts > What each role can do. Text from FEE_TYPES (formula, example). -->
      <div class="modal-back" v-if="howOpen" @click.self="howOpen = false" v-esc="() => { howOpen = false }">
        <div class="modal" role="dialog" aria-label="How each fee type is worked out" style="max-width:760px;width:calc(100% - 32px)">
          <h2>How each fee type is worked out</h2>
          <p class="help" style="margin:4px 0 0">Gross Rental is the unit's bookings for the month after OTA commission. Total % = Service % + Utility %. A unit's own rate on the Units tab wins over the arrangement.</p>
          <div class="how-list">
            <template v-for="t in Object.values(FEE_TYPES)" :key="t.id">
              <div class="how-card">
                <div class="how-side"><b>{{ t.label }}</b>
                  <span class="how-tags"><template v-for="k in t.sections" :key="k"><span class="how-tag">{{ sectionLabel(k) }}</span></template></span></div>
                <div class="how-main">
                  <p class="how-explain">{{ t.explain }}</p>
                  <ol class="how-steps"><template v-for="(f, i) in t.formula" :key="i"><li>
                    <template v-if="f.includes(' = ')"><b>{{ f.split(' = ')[0] }}</b><span class="how-eq">=</span>{{ f.split(' = ').slice(1).join(' = ') }}</template>
                    <template v-else>{{ f }}</template></li></template></ol>
                  <div class="how-ex" v-if="t.example"><span class="how-ex-head">Example</span>
                    <template v-for="(e, i) in t.example" :key="i"><span class="how-arrow" v-if="i" aria-hidden="true">→</span>
                      <span class="how-chip" :class="{ last: i === t.example.length - 1 }"><small>{{ e[0] }}</small>{{ e[1] }}</span></template></div>
                </div>
              </div>
            </template>
          </div>
          <div class="modal-foot"><button class="btn" @click="howOpen = false">Close</button></div>
        </div>
      </div>
      <template v-for="sec in SECTIONS" :key="sec.key">
        <section class="card fee-card">
          <div class="card-head"><div><h2>{{ sec.label }}</h2><div class="help">{{ sec.hint }}</div></div>
            <button class="btn btn-sm" v-if="canEdit" @click="openAdd(sec.key)" :disabled="busy">+ Add</button></div>
          <div class="table-wrap" v-if="inSection(sec.key).length">
            <table class="table">
              <thead><tr><th>Name</th><th>Type</th><th class="num">Service %</th><th class="num">Utility %</th><th class="num">Total %</th><th class="num">SST</th><th class="num">Units here</th><th></th></tr></thead>
              <tbody>
                <template v-for="[id, a] in inSection(sec.key)" :key="id">
                  <tr><td class="strong">{{ a.name }}</td>
                    <td>{{ typeLabel(a.type) }}</td>
                    <td class="num">{{ pctTxt(a.servicePct) }}</td>
                    <td class="num">{{ pctTxt(a.utilityPct) }}</td>
                    <td class="num">{{ pctTxt(Number(a.servicePct || 0) + Number(a.utilityPct || 0)) }}</td>
                    <td class="num">{{ Number(a.sstPct) > 0 ? pctTxt(a.sstPct) : '—' }}</td>
                    <td class="num">{{ unitsUsing(id) }}</td>
                    <td class="num"><button class="editlink" v-if="canEdit" @click="openEdit(id, a)" :disabled="busy">Edit</button></td></tr>
                </template>
              </tbody>
            </table>
          </div>
          <div class="fee-empty" v-else>{{ `No ${sec.label.toLowerCase().replace(' ', '-')} arrangements yet.${canEdit ? ' Press Add to make one.' : ''}` }}</div>
        </section>
      </template>

      <!-- Add / Edit arrangement: a centred popup (not a side panel) -->
      <div class="modal-back" v-if="form" @click.self="form = null" v-esc="() => { form = null }">
        <form class="modal fee-modal" role="dialog" aria-modal="true" :aria-label="form.isNew ? 'Add arrangement' : 'Edit arrangement'" @submit.prevent="saveArr()">
          <div class="fee-modal-head"><h2>{{ form.isNew ? `Add ${sectionLabel(form.section).toLowerCase().replace(' ', '-')} arrangement` : `Edit ${form.old?.name || 'arrangement'}` }}</h2>
            <button type="button" class="icon-btn" @click="form = null" aria-label="Close">×</button></div>
          <div class="fee-modal-body">
            <div class="notice error" v-show="form.error">{{ form.error }}</div>
            <div class="field"><label for="faName" class="req">Name</label><input class="input" id="faName" v-model="form.name" placeholder="e.g. Revenue share 40%"></div>
            <div class="field"><label for="faType" class="req">Type</label><FeeTypePicker id="faType" :section="form.section" v-model="form.type" /></div>
            <div class="grid-3">
              <div class="field"><label for="faSvc">Service %</label><input class="input" id="faSvc" type="number" step="0.01" min="0" max="100" v-model="form.service"></div>
              <div class="field"><label for="faUtil">Utility %</label><input class="input" id="faUtil" type="number" step="0.01" min="0" max="100" v-model="form.utility"></div>
              <div class="field"><label for="faTot">Total %</label><input class="input" id="faTot" :value="totalPct" readonly tabindex="-1"></div>
            </div>
            <p class="help" style="margin:-6px 0 12px">Total adds itself up.</p>
            <div class="field fee-pool" v-if="FEE_TYPES[form.type]?.netRental"><label for="faNet" class="req">Net Rental # %</label>
              <input class="input" id="faNet" type="number" step="0.01" min="0" max="100" v-model="form.netRental">
              <span class="help">of the pot goes to owners. Every unit in the property needs a purchase price (Units tab) before pool statements can be made.</span></div>
            <div class="field"><label for="faSst">SST on fee %</label><input class="input" id="faSst" type="number" step="0.01" min="0" max="100" v-model="form.sst">
              <span class="help">0 means no SST. Shows as — in the list.</span></div>
            <div class="field"><label for="faFrom" class="req">Effective from</label>
              <select class="input" id="faFrom" v-model="form.effectiveFrom"><template v-for="m in months" :key="m"><option :value="m" :selected="m === form.effectiveFrom">{{ monthName(m) }}</option></template></select>
              <span class="help">Months before this keep the old numbers.</span></div>
            <div class="field"><label for="faWhy" class="req">Reason</label><textarea class="input" id="faWhy" v-model="form.reason" placeholder="e.g. New owner agreement from December"></textarea></div>
            <div class="fee-delete" v-if="!form.isNew">
              <button type="button" class="btn btn-danger-outline" @click="removeArr()" :disabled="busy || unitsUsing(form.id) > 0">Delete arrangement</button>
              <span class="help" v-if="unitsUsing(form.id) > 0">{{ `${unitsUsing(form.id)} unit${unitsUsing(form.id) === 1 ? ' uses' : 's use'} this. Move them to another arrangement on the Units tab first.` }}</span>
            </div>
          </div>
          <div class="modal-foot fee-modal-foot"><button type="button" class="btn" @click="form = null" :disabled="busy">Cancel</button>
            <button type="submit" class="btn btn-primary" :disabled="busy">{{ busy ? 'Saving…' : 'Save' }}</button></div>
        </form>
      </div>

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
        <div class="actions"><button class="btn btn-primary" @click="save()" :disabled="busy">Save property rules</button></div>
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
// Fees & rates: the property's fee arrangements in three cards (short, mid, long term), added, edited and deleted in a
// popup by Accounting and Directors (saveArrangement), plus the property rules (early check-in, Tourism Tax).
import { FEE_TYPES, SECTIONS, DEFAULT_NET_RENTAL_PCT, newArrangementId } from '@/lib/fee-types.js';
import { monthName, pct } from '@/lib/format.js';
import { friendlyError } from '@/lib/finance-data.js';
import { useSession } from '@/stores/session.js';
import { askConfirm } from '@/lib/confirm.js';
import FeeTypePicker from '@/components/FeeTypePicker.vue';
import { loadRates, saveRates, saveArrangement, forgetUnits } from '@/lib/portfolio-data.js';

const me = useSession();
const pctNum = v => (v == null || v === '' ? 0 : Number(v));
const toPct = f => +(Number(f || 0) * 100).toFixed(4);

export default {
  components: { FeeTypePicker },
  props: {
    mode: { type: String, required: true },        // 'rates' or 'ota'
    propertyId: { type: String, required: true },
    units: { type: Array, required: true },
    asOf: { type: String, required: true },
    months: { type: Array, required: true }
  },
  emits: ['saved', 'error', 'busy'],
  data() {
    return { FEE_TYPES, SECTIONS, busy: false, form: null, howOpen: false,
      rates: { form: {}, effectiveFrom: this.asOf, reason: '', earlyToOwner: true, tourismTax: 10, current: null, arrangements: {} } };
  },
  async created() { await this.load(); },
  computed: {
    canEdit() { return ['director', 'finance'].includes(me.role); },   // Accounting and Directors add, edit and delete arrangements
    totalPct() { const f = this.form; return f ? +(pctNum(f.service) + pctNum(f.utility)).toFixed(4) : 0; }
  },
  methods: {
    monthName, pct,
    pctTxt(f) { return `${+(Number(f || 0) * 100).toFixed(2)}%`; },
    typeLabel(t) { return FEE_TYPES[t]?.label || t || '—'; },
    sectionLabel(k) { return SECTIONS.find(x => x.key === k)?.label || ''; },
    inSection(key) {
      return Object.entries(this.rates.arrangements || {}).filter(([, a]) => (a.section || 'short') === key)
        .sort((a, b) => String(a[1].name).localeCompare(String(b[1].name), 'en', { numeric: true }));
    },
    // Units on this arrangement in the month shown (their terms for that month)
    unitsUsing(id) { return this.units.filter(x => x.terms?.arrangement === id).length; },
    async load() {
      try { this.rates = await loadRates(this.propertyId, this.asOf); }
      catch (e) { this.$emit('error', friendlyError(e, 'load the portfolio')); }
    },
    openAdd(section) {
      const type = Object.values(FEE_TYPES).find(t => t.sections.includes(section))?.id || '';
      this.form = { isNew: true, id: newArrangementId(), section, name: '', type, service: 0, utility: 0, sst: 0, netRental: toPct(DEFAULT_NET_RENTAL_PCT),
        effectiveFrom: this.asOf, reason: '', error: '', old: null };
    },
    openEdit(id, a) {
      this.form = { isNew: false, id, section: a.section || 'short', name: a.name || '', type: a.type || '', service: toPct(a.servicePct), utility: toPct(a.utilityPct),
        sst: toPct(a.sstPct), netRental: toPct(a.netRentalPct ?? DEFAULT_NET_RENTAL_PCT), effectiveFrom: this.asOf, reason: '', error: '', old: a };
    },
    async saveArr() {
      const f = this.form; f.error = '';
      const name = f.name.trim().replace(/\s+/g, ' ');
      if (!name) { f.error = 'Type a name.'; return; }
      if (Object.entries(this.rates.arrangements || {}).some(([id, a]) => id !== f.id && String(a.name).trim().toLowerCase() === name.toLowerCase())) { f.error = 'Another arrangement already has that name.'; return; }
      const t = FEE_TYPES[f.type];
      if (!t || !t.sections.includes(f.section)) { f.error = 'Choose a type.'; return; }
      const svc = pctNum(f.service), util = pctNum(f.utility), sst = pctNum(f.sst), net = pctNum(f.netRental);
      for (const [v, lbl] of [[svc, 'Service %'], [util, 'Utility %'], [sst, 'SST on fee %']]) if (!(v >= 0 && v <= 100)) { f.error = `${lbl} must be between 0 and 100.`; return; }
      if (svc + util > 100) { f.error = 'Total % can\'t be more than 100.'; return; }
      if (t.netRental && !(net > 0 && net <= 100)) { f.error = 'Net Rental # % must be more than 0 and at most 100.'; return; }
      if (!f.reason.trim()) { f.error = 'Add a reason. It goes in the audit log.'; return; }
      const arr = { name, type: f.type, section: f.section, servicePct: svc / 100, utilityPct: util / 100, sstPct: sst / 100,
        netRentalPct: t.netRental ? net / 100 : (f.old?.netRentalPct ?? DEFAULT_NET_RENTAL_PCT) };
      // Audit lines: "<name>: Service % 20% → 25%"
      const o = f.old || {}, changes = [];
      const label = { name: 'Name', type: 'Type', servicePct: 'Service %', utilityPct: 'Utility %', sstPct: 'SST on fee %', netRentalPct: 'Net Rental # %' };
      const show = (k, x) => (k === 'name' ? x : k === 'type' ? (FEE_TYPES[x]?.label || x) : this.pctTxt(x));
      for (const k of Object.keys(label)) {
        if (k === 'netRentalPct' && !t.netRental) continue;
        const was = o[k] == null ? null : o[k];
        if (f.isNew || String(was ?? '') !== String(arr[k])) changes.push({ field: `${name}: ${label[k]}`, old: f.isNew || was == null ? null : show(k, was), new: show(k, arr[k]) });
      }
      if (!f.isNew && !changes.length) { this.form = null; return; }
      await this.write({ id: f.id, arr, effectiveFrom: f.effectiveFrom, reason: f.reason.trim(), changes, isNew: f.isNew },
        `${name} ${f.isNew ? 'added' : 'saved'}, applying from ${monthName(f.effectiveFrom)}.`);
    },
    async removeArr() {
      const f = this.form; f.error = '';
      if (this.unitsUsing(f.id) > 0) return;
      if (!f.reason.trim()) { f.error = 'Add a reason first. It goes in the audit log.'; return; }
      if (!await askConfirm({ title: `Delete ${f.old?.name || 'this arrangement'}?`, message: `It is removed from ${monthName(f.effectiveFrom)} on. Months before keep it.`, confirmText: 'Delete arrangement', danger: true })) return;
      await this.write({ id: f.id, arr: null, effectiveFrom: f.effectiveFrom, reason: f.reason.trim(), changes: [{ field: 'Arrangement', old: f.old?.name || f.id, new: null }] },
        `${f.old?.name || 'Arrangement'} deleted from ${monthName(f.effectiveFrom)}.`);
    },
    async write(args, msg) {
      this.busy = true; this.$emit('busy', true);
      try {
        await saveArrangement(me, this.propertyId, args);
        await forgetUnits(this.propertyId);
        this.form = null;
        this.$emit('saved', msg);
        await this.load();
      } catch (e) {
        if (this.form) this.form.error = friendlyError(e, 'save the arrangement');
        else this.$emit('error', friendlyError(e, 'save the arrangement'));
      }
      this.busy = false; this.$emit('busy', false);
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

<style scoped>
.info-btn { padding: 8px 10px; color: var(--accent); border: 1.5px solid var(--accent); flex: none; }
.info-btn:hover { background: var(--accent-soft); }
.how-list { display: grid; gap: 10px; margin: 14px 0 6px; max-height: 64vh; overflow: auto; }
.how-card { display: grid; grid-template-columns: 140px minmax(0, 1fr); gap: 16px; align-items: start; padding: 14px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); }
.how-side b { display: block; font-size: 13px; color: var(--accent); }
.how-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
.how-tag { font-size: 11px; padding: 2px 8px; border-radius: 999px; background: var(--accent-soft); color: var(--accent); white-space: nowrap; }
.how-explain { margin: 0 0 8px; font-size: 14px; line-height: 1.5; color: var(--text); }
.how-steps { margin: 0; padding: 10px 12px 10px 30px; border-radius: 8px; background: var(--bg, rgba(0, 0, 0, .03)); font-size: 13px; line-height: 1.55; }
.how-steps li { margin: 2px 0; }
.how-steps b { font-weight: 600; }
.how-eq { margin: 0 6px; color: var(--accent); font-weight: 700; }
.how-ex { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 10px; }
.how-ex-head { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); margin-right: 4px; }
.how-chip { display: inline-flex; flex-direction: column; padding: 5px 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 13px; font-weight: 600; white-space: nowrap; }
.how-chip small { font-size: 11px; font-weight: 400; color: var(--muted); }
.how-chip.last { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
.how-arrow { color: var(--muted); }
@media (max-width: 560px) { .how-card { grid-template-columns: minmax(0, 1fr); gap: 6px; } .fees-intro { align-items: flex-start; } }
.fees-intro { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin: 0 0 16px; }
.fees-intro .card-intro { margin: 0; }
.fee-card + .fee-card { margin-top: 20px; }
.fee-card .card-head { align-items: flex-start; }
.fee-empty { border: 1.5px dashed var(--border); border-radius: 10px; padding: 18px; text-align: center; color: var(--muted); font-size: 13px; }
.fee-modal { max-width: 560px !important; width: calc(100% - 32px); padding: 0; display: flex; flex-direction: column; max-height: 84vh; }
.fee-modal-head { display: flex; justify-content: space-between; align-items: center; padding: 18px 24px; border-bottom: 1px solid var(--border); }
.fee-modal-head h2 { margin: 0; }
.fee-modal-body { padding: 18px 24px; overflow-y: auto; flex: 1 1 auto; }
.fee-modal-foot { margin: 0; padding: 14px 24px; border-top: 1px solid var(--border); }
.fee-pool { background: var(--hover); border-radius: 10px; padding: 12px; }
.fee-delete { display: grid; gap: 6px; justify-items: start; margin-top: 8px; padding-top: 14px; border-top: 1px solid var(--border); }
.btn-danger-outline { color: var(--red, #c0392b); border-color: currentColor; }
</style>
