<template>
  <section class="card" aria-label="Types of service">
    <div class="card-head"><h2>{{ `${n}. Types of service` }}</h2>
      <span class="pill" :class="done ? 'green' : sv.legacy ? 'amber' : 'grey'">{{ sv.rentType ? rentLabel(sv.rentType) : sv.legacy ? 'Not set (older listing)' : 'Not set' }}</span></div>
    <p class="help" v-if="sv.legacy && !sv.rentType">This listing was started before Types of service. Renovation and amenities are ticked so its stages stay as they were; choose the rental type when you know it.</p>

    <!-- Rental type and arrangement (Portfolio > Fees & Rates) -->
    <div class="form-sec">Rental type</div>
    <div class="ag-opts sv-rent" role="group" aria-label="Rental type">
      <template v-for="r in RENT_TYPES" :key="r.key">
        <button type="button" class="ag-opt" :class="{ sel: sv.rentType === r.key }" :aria-pressed="sv.rentType === r.key" :disabled="!canEdit" @click="pickRent(r.key)">
          <span class="ag-radio"></span><span><b>{{ r.label }}</b><small>{{ `${r.hint} · ${r.unit}` }}</small></span>
        </button>
      </template>
    </div>
    <template v-if="sv.rentType">
      <div class="sv-arr">
        <div class="field"><label for="svArr">Arrangement</label>
          <OptionPicker class="full-pick" v-model="arrPick" :options="arrOptions" label="Arrangement" :disabled="!canEdit" placeholder="Pick an arrangement" /></div>
        <FormField v-if="chosen && isFixedArr(chosen)" id="svFixed" label="Fixed rent (RM a month)" v-model="sv.fixedRent" inputmode="decimal" placeholder="e.g. 2000" :disabled="!canEdit" />
        <FormField v-else id="svPct" :label="sv.arrangementId === 'custom' ? 'Custom %' : 'Custom % (optional)'" v-model="sv.customPct" inputmode="decimal"
          :placeholder="chosen ? `Leave blank for ${totalPct(chosen)}%` : 'e.g. 35'" :disabled="!canEdit" />
      </div>
      <p class="help">{{ `${feeText(d)}. ` }}{{ arrNote }}</p>
    </template>

    <!-- Services: Service | Amount | Select -->
    <div class="form-sec">Services</div>
    <div class="table-wrap">
      <table class="table sv-table">
        <thead><tr><th>Service</th><th class="num sv-amt">Amount (RM)</th><th class="sv-sel">Select</th></tr></thead>
        <tbody>
          <template v-for="(x, i) in shownServices" :key="x.key">
            <tr :class="{ off: !sv.items[x.key] }">
              <td><span class="sv-no">{{ i + 1 }}</span><b>{{ x.label }}</b><small class="sv-hint" v-if="hintOf(x)">{{ hintOf(x) }}</small>
                <OptionPicker v-if="x.pkg && sv.items[x.key]" class="sv-pkg" :model-value="sv.maintenance" @update:model-value="pickPkg" :options="pkgOptions" label="Maintenance package" :disabled="!canEdit" /></td>
              <td class="num sv-amt">
                <template v-if="x.total"><span v-if="sv.items[x.key]">{{ rm(rowAmount(d, x.key)) }}</span><span class="muted" v-else>—</span>
                  <small class="sv-hint" v-if="sv.items[x.key]">{{ x.key === 'renovation' ? (serviceOn(d, 'amenities') ? 'Renovation stage' : 'Renovation + Furniture & Amenities') : 'Furniture & Amenities stage' }}</small></template>
                <template v-else-if="sv.items[x.key]">
                  <input class="input cost" v-if="canEdit" v-model="sv.amounts[x.key]" inputmode="decimal" placeholder="0" :aria-label="`Amount for ${x.label}`">
                  <span v-else>{{ rm(sv.amounts[x.key]) }}</span></template>
                <span class="muted" v-else>—</span>
              </td>
              <td class="sv-sel"><input type="checkbox" :checked="sv.items[x.key]" :disabled="!canEdit" @change="toggle(x, $event)" :aria-label="`Select ${x.label}`"></td>
            </tr>
          </template>
        </tbody>
        <tfoot>
          <tr><td>Services total</td><td class="num">{{ rm(servicesSubtotal(d)) }}</td><td></td></tr>
          <tr class="sv-disc"><td>
              <span>Discount</span>
              <input class="input sv-dnote" v-if="canEdit" v-model="sv.discountNote" placeholder="Note, e.g. Returning owner" aria-label="Discount note">
              <small class="sv-hint" v-else-if="sv.discountNote">{{ sv.discountNote }}</small></td>
            <td class="num"><input class="input cost" v-if="canEdit" v-model="sv.discount" inputmode="decimal" placeholder="0" aria-label="Discount (RM)"><span v-else>{{ discountOf(d) ? `- ${rm(sv.discount)}` : '—' }}</span></td><td></td></tr>
          <tr><td><b>Services after discount</b></td><td class="num"><b>{{ rm(servicesTotal(d)) }}</b></td><td></td></tr>
          <tr><td>Renovation &amp; Furniture</td><td class="num">{{ rm(renoFurnTotal(d)) }}</td><td></td></tr>
          <tr class="sv-grand"><td><b>Grand total</b></td><td class="num"><b>{{ rm(quoteTotal(d)) }}</b></td><td></td></tr>
        </tfoot>
      </table>
    </div>
    <p class="help" v-if="sv.rentType === 'yearly'">Purchase Short Term Amenities is not offered for Long-term: the Furniture &amp; Amenities stage shows only with Renovation.</p>
    <p class="help" v-if="kept.length">{{ `Kept but left out of the quotation (unticked): ${kept.join(', ')}.` }}</p>

    <div class="field" style="margin-top:12px"><label for="svNotes">Notes</label>
      <textarea class="input" id="svNotes" v-if="canEdit" v-model="sv.notes" placeholder="e.g. Owner wants advertising only from January"></textarea>
      <p class="pre" v-else>{{ sv.notes || '—' }}</p></div>
  </section>
</template>

<script>
// Stage: Types of service (13 Nov 2026, Khairul). The rental type (Short / Mid / Long term) and an arrangement from
// Portfolio > Fees & Rates, picked by name with its % showing (anyone may type a custom %; Fixed rent takes an RM amount).
// Then the services table (Service | Amount | Select, RM amounts typed per listing) with a discount line and the totals.
// Renovation shows the Renovation and Furniture & Amenities stages, Purchase Short Term Amenities the Furniture &
// Amenities stage; their rows show those stages' totals. Unticking one whose stage has something in it asks first.
import { RENT_TYPES, SERVICES, PACKAGES, STAGE_LABEL, rentLabel, stageOn, stageHasContent, rm, serviceOn, rowAmount, servicesSubtotal, discountOf,
  servicesTotal, renoFurnTotal, quoteTotal, loadArrangements, arrangementText, isFixedArr, feeText, packageOf, clone } from '@/lib/owner-leads.js';
import { askConfirm } from '@/lib/confirm.js';
import OptionPicker from '@/components/OptionPicker.vue';
import FormField from '@/components/FormField.vue';

const pct3 = v => Math.round(v * 100000) / 1000;

export default {
  components: { OptionPicker, FormField },
  props: { d: { type: Object, required: true }, canEdit: Boolean, n: { type: Number, default: 2 } },
  data() { return { RENT_TYPES, arrangements: [], arrError: '' }; },
  computed: {
    sv() { return this.d.services; },
    done() { return !!this.sv.rentType && (!!this.sv.older || !!this.sv.arrangementId); },
    pkgOptions() { return PACKAGES.filter(p => p.key !== 'none').map(p => ({ value: p.key, label: `${p.label} · usually ${rm(p.price)} a year` })).concat([{ value: 'none', label: 'Choose the package' }]); },
    shownServices() { return SERVICES.filter(x => !(x.notFor || []).includes(this.sv.rentType)); },
    section() { return RENT_TYPES.find(r => r.key === this.sv.rentType)?.section || ''; },
    // The arrangements of the rental type's group; the picked one stays listed even if Fees & Rates changed since
    arrOptions() {
      const list = this.arrangements.filter(a => a.section === this.section).map(a => ({ value: a.id, label: arrangementText(a) }));
      const a = this.sv.arrangement;
      if (a && this.sv.arrangementId && !list.some(o => o.value === this.sv.arrangementId)) list.push({ value: this.sv.arrangementId, label: `${arrangementText(a)} (as picked)` });
      return [{ value: '', label: 'Pick an arrangement' }, ...list, { value: 'custom', label: 'Custom % (type it)' }];
    },
    arrPick: {
      get() { return this.sv.arrangementId || ''; },
      set(v) {
        const a = this.arrangements.find(x => x.id === v) || (v === this.sv.arrangementId ? this.sv.arrangement : null);
        this.sv.arrangementId = v;
        this.sv.arrangement = a && v !== 'custom' ? clone(a) : null;
        if (!a || !isFixedArr(a)) this.sv.fixedRent = '';
      }
    },
    chosen() { return this.sv.arrangement; },
    arrNote() {
      if (this.arrError) return this.arrError;
      if (!this.arrangements.some(a => a.section === this.section)) return 'Fees & Rates has no arrangement for this rental type yet: type a custom %.';
      return 'From Portfolio > Fees & Rates. Accounting or a Director puts it on the unit in Portfolio.';
    },
    // Stages with content whose service is off now
    kept() { return Object.keys(STAGE_LABEL).filter(k => !stageOn(this.d, k) && stageHasContent(this.d, k)).map(k => `${STAGE_LABEL[k]} items`); }
  },
  async mounted() {
    try { this.arrangements = await loadArrangements(); }
    catch (e) { this.arrError = `Could not read Fees & Rates (${e.message || e}): type a custom %.`; }
  },
  methods: {
    rentLabel, rm, serviceOn, rowAmount, servicesSubtotal, discountOf, servicesTotal, renoFurnTotal, quoteTotal, isFixedArr, feeText,
    totalPct(a) { return pct3(a.servicePct + a.utilityPct); },
    hintOf(x) { return !x.hint ? '' : typeof x.hint === 'string' ? x.hint : x.hint[this.sv.rentType || '']; },
    // Package picked: its usual price goes in the amount when the amount is still blank
    pickPkg(v) {
      this.sv.maintenance = v;
      const p = packageOf(v);
      if (p.price && !String(this.sv.amounts.maintenance ?? '').trim()) this.sv.amounts.maintenance = String(p.price);
    },
    // Losing a stage that has content: ask first. Resolves true to go ahead.
    async okToHide(x) {
      const after = { ...this.d, services: { ...this.sv, items: { ...this.sv.items, [x.key]: false } } };
      const gone = Object.keys(STAGE_LABEL).filter(k => stageOn(this.d, k) && !stageOn(after, k) && stageHasContent(this.d, k)).map(k => STAGE_LABEL[k]);
      if (!gone.length) return true;
      return askConfirm({ title: `Hide the ${gone.join(' and ')} stage${gone.length > 1 ? 's' : ''}?`,
        message: `${gone.join(' and ')} ${gone.length > 1 ? 'have' : 'has'} items. They are kept, but left out of the quotation until shown again.`, confirmText: 'Untick' });
    },
    async toggle(x, e) {
      const want = e.target.checked;
      if (!want && !(await this.okToHide(x))) { e.target.checked = true; return; }
      this.sv.items[x.key] = want;
      if (x.pkg && !want) this.sv.maintenance = 'none';
    },
    async pickRent(key) {
      if (key === this.sv.rentType) return;
      // Long-term: no short-term amenities (and so no Furniture & Amenities stage without Renovation)
      const lost = SERVICES.filter(x => (x.notFor || []).includes(key));
      for (const x of lost) if (!(await this.okToHide(x))) return;
      this.sv.rentType = key;
      // An arrangement of another group no longer fits
      const sec = RENT_TYPES.find(r => r.key === key)?.section;
      if (this.sv.arrangement && this.sv.arrangement.section !== sec) { this.sv.arrangementId = ''; this.sv.arrangement = null; this.sv.fixedRent = ''; }
    }
  }
};
</script>

<style scoped>
.ag-opts.sv-rent { grid-template-columns: repeat(3, minmax(0, 1fr)); }
@media (max-width: 600px) { .ag-opts.sv-rent { grid-template-columns: minmax(0, 1fr); } }
.sv-arr { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 12px; margin-top: 12px; align-items: end; }
@media (max-width: 700px) { .sv-arr { grid-template-columns: minmax(0, 1fr); } }
.sv-arr .field { margin: 0; }
.sv-table td { vertical-align: top; }
.sv-table tbody td:first-child { display: grid; grid-template-columns: 26px minmax(0, 1fr); column-gap: 6px; }
.sv-table tbody td:first-child > *:not(.sv-no) { grid-column: 2; }
.sv-no { color: var(--muted); font-size: 12px; padding-top: 2px; grid-row: 1 / span 3; }
.sv-hint { display: block; color: var(--muted); font-size: 12px; font-weight: 400; }
.sv-table tr.off b { color: var(--muted); font-weight: 500; }
.sv-amt { width: 170px; }
.sv-sel { width: 70px; text-align: center; }
.sv-table .cost { width: 130px; text-align: right; }
.sv-pkg { margin-top: 6px; max-width: 300px; }
.sv-disc td:first-child { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.sv-dnote { max-width: 260px; height: 34px; }
.sv-table tfoot td { border-top: 1px solid var(--border); }
.sv-grand td { font-size: 15px; }
</style>
