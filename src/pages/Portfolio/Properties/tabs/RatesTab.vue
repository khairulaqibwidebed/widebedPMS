<template>
  <div>
    <!-- Fees & rates: fee arrangements by stay length (lib/fee-types.js has the types and their maths). Saved per property,
         or (no propertyId) the shared set for every property on Portfolio > Fees & Rates (lib/shared-rates.js). -->
    <div class="notice" v-if="!isShared">Fee arrangements, OTA commissions and rules are set once for every property on Portfolio › Fees & Rates. Pool Sharing is set here, for this property only.
      <router-link to="/Portfolio/fees-rates">Open Fees & Rates</router-link></div>
    <div class="notice" v-if="isShared && !rates.hasShared && loaded">There is no shared set yet, so every property still uses the settings it had. A Director builds the shared set once from every property's settings (Build shared set, top right).</div>
    <div class="notice" v-else-if="isShared && rates.sharedStart && asOf < rates.sharedStart">{{ `The shared set starts in ${monthName(rates.sharedStart)}. Before that each property's own settings apply. Pick ${monthName(rates.sharedStart)} or later to see it.` }}</div>
    <template v-if="mode === 'rates'">
      <div class="fees-intro"><p class="card-intro">{{ isShared
        ? 'One set of fee arrangements for every property, split by stay length. Each unit picks one on its property\'s Units tab, and a unit can still have its own rate there. Pool Sharing is set on each property (its Pool sharing tab). Changes start from the month you pick and are kept in the Audit log.'
        : 'This property\'s own Pool Sharing arrangements. The pot is only this property\'s Pool units: no other property shares it. Units pick an arrangement on the Units tab.' }}</p>
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
      <template v-for="sec in shownSections" :key="sec.key">
        <section class="card fee-card">
          <div class="card-head"><div><h2>{{ isShared ? sec.label : 'Pool Sharing' }}</h2><div class="help">{{ secHint(sec) }}</div></div>
            <button class="btn btn-sm" v-if="canEditHere" @click="openAdd(sec.key)" :disabled="busy">+ Add</button></div>
          <div class="table-wrap" v-if="inSection(sec.key).length">
            <table class="table">
              <thead><tr><th>Name</th><th>Type</th><th class="num">Service %</th><th class="num">Utility %</th><th class="num">Total %</th><th class="num">SST</th><th class="num" v-if="!isShared">Net Rental # %</th><th class="num">Units here</th><th></th></tr></thead>
              <tbody>
                <template v-for="[id, a] in inSection(sec.key)" :key="id">
                  <tr><td class="strong">{{ a.name }} <span class="shared-tag" v-if="isSharedArr(id)" title="From Portfolio › Fees & Rates">Shared</span></td>
                    <td>{{ typeLabel(a.type) }}</td>
                    <td class="num">{{ pctTxt(a.servicePct) }}</td>
                    <td class="num">{{ pctTxt(a.utilityPct) }}</td>
                    <td class="num">{{ pctTxt(Number(a.servicePct || 0) + Number(a.utilityPct || 0)) }}</td>
                    <td class="num">{{ Number(a.sstPct) > 0 ? pctTxt(a.sstPct) : '—' }}</td>
                    <td class="num" v-if="!isShared">{{ pctTxt(a.netRentalPct ?? 0.5625) }}</td>
                    <td class="num">{{ unitsUsing(id) }}</td>
                    <td class="num"><button class="editlink" v-if="canEditHere" @click="openEdit(id, a)" :disabled="busy">{{ isSharedArr(id) ? 'Net Rental %' : 'Edit' }}</button></td></tr>
                </template>
              </tbody>
            </table>
          </div>
          <div class="fee-empty" v-else>{{ `No ${isShared ? sec.label.toLowerCase().replace(' ', '-') : 'Pool Sharing'} arrangements ${isShared ? 'yet' : 'for this property in ' + monthName(asOf)}.${canEditHere ? ' Press Add to make one.' : ''}` }}</div>
        </section>
      </template>

      <!-- Add / Edit arrangement: a centred popup (not a side panel) -->
      <div class="modal-back" v-if="form" @click.self="form = null" v-esc="() => { form = null }">
        <form class="modal fee-modal" role="dialog" aria-modal="true" :aria-label="form.isNew ? 'Add arrangement' : 'Edit arrangement'" @submit.prevent="saveArr()">
          <div class="fee-modal-head"><h2>{{ form.isNew ? `Add ${sectionLabel(form.section).toLowerCase().replace(' ', '-')} arrangement` : `Edit ${form.old?.name || 'arrangement'}` }}</h2>
            <button type="button" class="icon-btn" @click="form = null" aria-label="Close">×</button></div>
          <div class="fee-modal-body">
            <div class="notice error" v-show="form.error">{{ form.error }}</div>
            <div class="field"><label for="faName" class="req">Name</label><input class="input" id="faName" v-model="form.name" placeholder="e.g. Revenue share 40%" :disabled="form.poolOnly"></div>
            <div class="field"><label for="faType" class="req">Type</label><FeeTypePicker id="faType" :section="form.section" v-model="form.type" :disabled="form.poolOnly" :only="isShared ? null : ['pool']" :exclude="isShared ? ['pool'] : []" /></div>
            <div class="grid-3">
              <div class="field"><label for="faSvc">Service %</label><input class="input" id="faSvc" type="number" step="0.01" min="0" max="100" v-model="form.service" :disabled="form.poolOnly"></div>
              <div class="field"><label for="faUtil">Utility %</label><input class="input" id="faUtil" type="number" step="0.01" min="0" max="100" v-model="form.utility" :disabled="form.poolOnly"></div>
              <div class="field"><label for="faTot">Total %</label><input class="input" id="faTot" :value="totalPct" readonly tabindex="-1"></div>
            </div>
            <p class="help" style="margin:-6px 0 12px">Total adds itself up.</p>
            <div class="field fee-pool" v-if="FEE_TYPES[form.type]?.netRental"><label for="faNet" class="req">Net Rental # %</label>
              <input class="input" id="faNet" type="number" step="0.01" min="0" max="100" v-model="form.netRental">
              <span class="help">{{ isShared ? 'of the pot goes to owners. A property that sets its own Net Rental # % (its property page, Pool sharing tab) keeps its own; the others use this one.'
                : form.poolOnly ? 'of the pot goes to owners, for this property only. Everything else on this arrangement is set on Portfolio › Fees & Rates.'
                : 'of the pot goes to owners. Every unit in the property needs a purchase price (Units tab) before pool statements can be made.' }}</span></div>
            <div class="field"><label for="faSst">SST on fee %</label><input class="input" id="faSst" type="number" step="0.01" min="0" max="100" v-model="form.sst" :disabled="form.poolOnly">
              <span class="help">0 means no SST. Shows as — in the list.</span></div>
            <div class="field"><label for="faFrom" class="req">Effective from (MM/DD/YYYY)</label>
              <input class="input" id="faFrom" type="date" :value="form.effectiveDate" :min="dateMin" :max="dateMax" @input="setDate(form, $event.target.value)">
              <span class="help">{{ dateHint(form.effectiveFrom) }}</span></div>
            <div class="field"><label for="faWhy">Remarks</label><textarea class="input" id="faWhy" v-model="form.reason" placeholder="e.g. New owner agreement from December"></textarea></div>
            <div class="fee-delete" v-if="!form.isNew && !form.poolOnly">
              <button type="button" class="btn btn-danger-outline" @click="removeArr()" :disabled="busy || inUse(form.id)">Delete arrangement</button>
              <span class="help" v-if="units == null">Counting the units on it…</span>
              <span class="help" v-else-if="unitsUsing(form.id) > 0">{{ `${unitsUsing(form.id)} unit${unitsUsing(form.id) === 1 ? ' uses' : 's use'} this${isShared ? ' across the properties' : ''}. Move them to another arrangement on the Units tab first.` }}</span>
            </div>
          </div>
          <div class="modal-foot fee-modal-foot"><button type="button" class="btn" @click="form = null" :disabled="busy">Cancel</button>
            <button type="submit" class="btn btn-primary" :disabled="busy">{{ busy ? 'Saving…' : 'Save' }}</button></div>
        </form>
      </div>

      <!-- Fees & Rates: Pool Sharing by property, view only (13 Nov 2026). Added and edited on each property's Pool sharing tab. -->
      <section class="card fee-card" v-if="isShared">
        <div class="card-head"><div><h2>Pool Sharing</h2><div class="help">View only. Set on each property's Pool sharing tab; each property's pot is only its own Pool units.</div></div></div>
        <div class="fee-empty" v-if="pool == null">Reading each property's Pool Sharing…</div>
        <div class="fee-empty" v-else-if="!pool.length">{{ `No property has a Pool Sharing arrangement in ${monthName(asOf)}.` }}</div>
        <div class="table-wrap" v-else>
          <table class="table">
            <thead><tr><th>Name</th><th>Type</th><th class="num">Service %</th><th class="num">Utility %</th><th class="num">Total %</th><th class="num">SST</th><th class="num">Net Rental # %</th><th class="num">Units here</th></tr></thead>
            <tbody>
              <template v-for="p in pool" :key="p.id">
                <tr class="pool-prop"><td colspan="8"><router-link :to="`/Portfolio/properties?property=${encodeURIComponent(p.id)}&ptab=rates`">{{ p.name }}</router-link></td></tr>
                <tr v-for="[id, a] in p.list" :key="id"><td class="strong pool-name">{{ a.name }}</td>
                  <td>{{ typeLabel(a.type) }}</td>
                  <td class="num">{{ pctTxt(a.servicePct) }}</td>
                  <td class="num">{{ pctTxt(a.utilityPct) }}</td>
                  <td class="num">{{ pctTxt(Number(a.servicePct || 0) + Number(a.utilityPct || 0)) }}</td>
                  <td class="num">{{ Number(a.sstPct) > 0 ? pctTxt(a.sstPct) : '—' }}</td>
                  <td class="num">{{ pctTxt(a.netRentalPct ?? 0.5625) }}</td>
                  <td class="num">{{ unitsUsing(id) }}</td></tr>
              </template>
            </tbody>
          </table>
        </div>
      </section>

      <section class="card" style="margin-top:20px" v-if="isShared">
        <div class="card-head"><h2>Rules for every property</h2><span class="help">{{ rates.current ? `In force for ${monthName(asOf)}: from ${rates.current.effectiveFrom === '2000-01' ? 'the start' : monthName(rates.current.effectiveFrom)}` : '' }}</span></div>
        <!-- Early check-in switch removed (Khairul 12 Nov 2026): not needed. Saves keep the value already saved (Yes everywhere). -->
        <div class="grid-fields">
          <div class="field"><label for="rTT">Tourism Tax per unit per night (RM)</label><input class="input" id="rTT" type="number" step="0.01" v-model="rates.tourismTax" :disabled="!rulesEditable"><span class="help">Non-Malaysian guests only. Kept apart in the exports.</span></div>
          <div></div>
          <template v-if="rulesEditable">
          <div class="field"><label>Applies from</label>
            <input class="input" type="date" :value="rates.effectiveDate" :min="dateMin" :max="dateMax" @input="setDate(rates, $event.target.value)" aria-label="Applies from">
            <span class="help">{{ dateHint(rates.effectiveFrom) }}</span></div>
          <div class="field"><label for="rWhy1">Reason (audit log)</label><input class="input" id="rWhy1" v-model="rates.reason" placeholder="e.g. Owner agreement changed"></div>
          </template>
        </div>
        <div class="actions" v-if="rulesEditable"><button class="btn btn-primary" @click="save()" :disabled="busy">{{ isShared ? 'Save rules' : 'Save property rules' }}</button></div>
      </section>
    </template>

    <!-- OTA commissions -->
    <section class="card" v-else>
      <div class="card-head"><h2>OTA commission and payout type</h2><span class="help">{{ rates.current ? `In force for ${monthName(asOf)}` : '' }}</span></div>
      <p class="card-intro">{{ isShared ? 'One set for every property. ' : '' }}Net: the site pays Widebed after taking its commission. Gross: the site invoices its commission separately. Ctrip uses its rate only as an estimate until Accounting types the Trip.com amount.</p>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Channel</th><th>Payout</th><th class="num">Commission %</th><th class="num">Payment fee %</th><th>How the guest price is worked out</th></tr></thead>
          <tbody>
            <template v-for="k in Object.keys(rates.form)" :key="k">
              <tr>
                <td class="strong">{{ rates.form[k].label }}</td>
                <td><select class="input" style="height:34px;min-width:150px" v-model="rates.form[k].payout" :disabled="!rulesEditable"><option value="net">Net</option><option value="gross">Gross</option></select></td>
                <td class="num"><input class="input inline-input" type="number" step="0.01" v-model="rates.form[k].commission" :disabled="!rulesEditable" :aria-label="`${rates.form[k].label} commission`"></td>
                <td class="num"><input class="input inline-input" type="number" step="0.01" v-model="rates.form[k].paymentFee" :disabled="!rulesEditable" v-show="rates.form[k].payout === 'gross'" :aria-label="`${rates.form[k].label} payment fee`"><span class="muted" v-show="rates.form[k].payout !== 'gross'">—</span></td>
                <td class="help">{{ rates.form[k].payout === 'net' ? `(room + SST) ÷ ${(100 - Number(rates.form[k].commission || 0)).toFixed(2)}%` : 'room + SST, less commission, payment fee and 8% SST on each' }}</td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
      <div class="grid-fields" style="margin-top:16px" v-if="rulesEditable">
        <div class="field"><label>Applies from</label>
          <input class="input" type="date" :value="rates.effectiveDate" :min="dateMin" :max="dateMax" @input="setDate(rates, $event.target.value)" aria-label="Applies from">
            <span class="help">{{ dateHint(rates.effectiveFrom) }}</span></div>
        <div class="field"><label for="rWhy2">Reason (audit log)</label><input class="input" id="rWhy2" v-model="rates.reason" placeholder="e.g. Agoda raised commission from October"></div>
      </div>
      <div class="actions" v-if="rulesEditable"><button class="btn btn-primary" @click="save()" :disabled="busy">Save OTA commissions</button></div>
    </section>
  </div>
</template>

<script>
// 13 Nov 2026 (Khairul): Pool Sharing is now each property's own. The property's Pool sharing tab adds, edits and deletes
// Pool arrangements on the property's rate versions (saveArrangement with propertyId); Fees & Rates no longer offers Pool.
// The pot was already per property (engine.poolShares); only Pool units of that property count.
// 12 Nov 2026 (later): the property page keeps only a "Pool sharing" tab (mode "rates" with a propertyId): it lists the Pool
// arrangements that apply and sets only their Net Rental # % for that property. Everything else is on Portfolio > Fees & Rates.
// Before that: A property's Fees & rates tab (mode "rates") and OTA commissions tab (mode "ota"). Both edit the same rate
// version, read fresh each time the tab opens. Saving adds a new version from the month picked.
// No propertyId (12 Nov 2026): the same two screens for the shared set on Portfolio > Fees & Rates (lib/shared-rates.js);
// units = every unit the person can see (null while they load), for the Units here column.
// On a property once a shared set is in force: OTA and rules show the shared values read-only, the list shows what really
// applies (shared ones tagged Shared, only their Pool Net Rental # % can be set here), and own arrangements work as before.
// Fees & rates: the property's fee arrangements in three cards (short, mid, long term), added, edited and deleted in a
// popup by Accounting and Directors (saveArrangement), plus the property rules (early check-in, Tourism Tax).
import { FEE_TYPES, SECTIONS, DEFAULT_NET_RENTAL_PCT, newArrangementId } from '@/lib/fee-types.js';
import { monthName, pct, dmy } from '@/lib/format.js';
import { friendlyError } from '@/lib/finance-data.js';
import { useSession } from '@/stores/session.js';
import { askConfirm } from '@/lib/confirm.js';
import { can } from '@/lib/access.js';
import FeeTypePicker from '@/components/FeeTypePicker.vue';
import { loadRates, saveRates, saveArrangement, forgetUnits } from '@/lib/portfolio-data.js';

const me = useSession();
const pctNum = v => (v == null || v === '' ? 0 : Number(v));
const toPct = f => +(Number(f || 0) * 100).toFixed(4);

export default {
  components: { FeeTypePicker },
  props: {
    mode: { type: String, required: true },        // 'rates' or 'ota'
    propertyId: { type: String, default: null },   // null = the shared set
    units: { type: Array, default: null },
    pool: { type: Array, default: null },          // Fees & Rates only: [{ id, name, list }] each property's own Pool arrangements (null while they load)
    asOf: { type: String, required: true },
    months: { type: Array, required: true }
  },
  emits: ['saved', 'error', 'busy'],
  data() {
    return { FEE_TYPES, SECTIONS, busy: false, form: null, howOpen: false,
      loaded: false,
      rates: { form: {}, effectiveFrom: this.asOf, reason: '', earlyToOwner: true, tourismTax: 10, current: null, arrangements: {}, sharedCur: null, merged: null, sharedIds: [] } };
  },
  async created() { await this.load(); },
  computed: {
    canEdit() { return ['director', 'finance'].includes(me.role) || can(me, 'portfolio.edit'); },   // Accounting, Directors and anyone with Portfolio Edit (12 Nov) add, edit and delete arrangements
    isShared() { return !this.propertyId; },
    sharedOn() { return !this.isShared && !!this.rates.sharedCur; },               // a property, with a shared set in force this month
    canEditHere() { return this.canEdit && this.loaded && (!this.isShared || !!this.rates.hasShared); },
    rulesEditable() { return this.canEditHere && !this.sharedOn; },
    // Months a change can start from: the shared set only from its first month (before that each property's own applies)
    editMonths() {
      const start = this.isShared ? this.rates.sharedStart : null;
      if (!start) return this.months;
      const list = this.months.filter(m => m >= start);
      return list.length ? list : [start];
    },
    dateMin() { return `${[...this.editMonths].sort()[0]}-01`; },
    dateMax() { const m = [...this.editMonths].sort().pop(), [y, mo] = m.split('-').map(Number); return `${m}-${String(new Date(y, mo, 0).getDate()).padStart(2, '0')}`; },
    // A property shows one Pool Sharing card (Pool is short term only). 13 Nov 2026: Pool is added here, per property.
    shownSections() { return this.isShared ? SECTIONS : SECTIONS.filter(sec => sec.key === 'short'); },
    shownList() { return (this.sharedOn ? this.rates.merged : this.rates.arrangements) || {}; },
    totalPct() { const f = this.form; return f ? +(pctNum(f.service) + pctNum(f.utility)).toFixed(4) : 0; }
  },
  methods: {
    monthName, pct,
    // Effective from is a calendar date (Khairul 12 Nov 2026). The date is saved (effectiveDate) and shown; fees and
    // statements are worked out per month, so the numbers change for the whole month of that date (effectiveFrom, YYYY-MM).
    setDate(o, v) { o.effectiveDate = v; if (/^\d{4}-\d{2}-\d{2}$/.test(v)) o.effectiveFrom = v.slice(0, 7); },
    dateHint(m) { return `Fees are worked out per month, so all of ${monthName(m)} uses the new numbers. Months before keep the old ones.`; },
    dateOk(o) { return /^\d{4}-\d{2}-\d{2}$/.test(o.effectiveDate || '') && o.effectiveDate >= this.dateMin && o.effectiveDate <= this.dateMax; },
    pctTxt(f) { return `${+(Number(f || 0) * 100).toFixed(2)}%`; },
    typeLabel(t) { return FEE_TYPES[t]?.label || t || '—'; },
    secHint(sec) {
      if (!this.isShared) return 'Pot = Gross Rental of this property\'s Pool units. Net Rental # % of it goes to owners, split by purchase price.';
      return sec.key === 'short' ? 'Revenue Sharing or Profit Sharing. Pool Sharing is set on each property.' : sec.hint;
    },
    sectionLabel(k) { return SECTIONS.find(x => x.key === k)?.label || ''; },
    inSection(key) {
      return Object.entries(this.shownList).filter(([, a]) => (a.section || 'short') === key && (this.isShared || this.isPool(a)))
        .sort((a, b) => String(a[1].name).localeCompare(String(b[1].name), 'en', { numeric: true }));
    },
    // Units on this arrangement in the month shown (their terms for that month)
    unitsUsing(id) { return this.units ? this.units.filter(x => x.terms?.arrangement === id).length : '…'; },
    inUse(id) { return this.units == null || this.unitsUsing(id) > 0; },
    isSharedArr(id) { return this.sharedOn && this.rates.sharedIds.includes(id); },
    isPool(a) { return !!FEE_TYPES[a?.type]?.netRental; },
    fromMonth() { return this.editMonths.includes(this.asOf) ? this.asOf : (this.rates.sharedStart || this.asOf); },   // the shared set: never before its first month
    async load() {
      try { const r = await loadRates(this.propertyId, this.asOf); r.effectiveDate = `${r.effectiveFrom}-01`; this.rates = r; this.loaded = true; }
      catch (e) { this.$emit('error', friendlyError(e, 'load the portfolio')); }
    },
    openAdd(section) {
      // Fees & Rates never offers Pool (13 Nov 2026); a property adds only Pool
      const type = this.isShared ? (Object.values(FEE_TYPES).find(t => t.sections.includes(section) && t.id !== 'pool')?.id || '') : 'pool';
      this.form = { isNew: true, id: newArrangementId(), section, name: '', type, service: 0, utility: 0, sst: 0, netRental: toPct(DEFAULT_NET_RENTAL_PCT),
        effectiveFrom: this.fromMonth(), effectiveDate: `${this.fromMonth()}-01`, reason: '', error: '', old: null, poolOnly: false };
    },
    openEdit(id, a) {
      this.form = { isNew: false, id, section: a.section || 'short', name: a.name || '', type: a.type || '', service: toPct(a.servicePct), utility: toPct(a.utilityPct),
        sst: toPct(a.sstPct), netRental: toPct(a.netRentalPct ?? DEFAULT_NET_RENTAL_PCT), effectiveFrom: this.fromMonth(), effectiveDate: `${this.fromMonth()}-01`, reason: '', error: '', old: a,
        poolOnly: this.isSharedArr(id) };   // an old shared Pool arrangement on a property: only its Net Rental # % is set here; the property's own is edited in full
    },
    async saveArr() {
      const f = this.form; f.error = '';
      const name = f.name.trim().replace(/\s+/g, ' ');
      if (!name) { f.error = 'Type a name.'; return; }
      if (Object.entries(this.shownList).some(([id, a]) => id !== f.id && String(a.name).trim().toLowerCase() === name.toLowerCase())) { f.error = 'Another arrangement already has that name.'; return; }
      if (!this.dateOk(f)) { f.error = `Pick an Effective from date between ${dmy(this.dateMin)} and ${dmy(this.dateMax)}.`; return; }
      const t = FEE_TYPES[f.type];
      if (!t || !t.sections.includes(f.section)) { f.error = 'Choose a type.'; return; }
      if (f.isNew && (this.isShared ? t.id === 'pool' : t.id !== 'pool')) { f.error = this.isShared ? 'Pool Sharing is added on each property (its Pool sharing tab).' : 'Only Pool Sharing is added here.'; return; }
      const svc = pctNum(f.service), util = pctNum(f.utility), sst = pctNum(f.sst), net = pctNum(f.netRental);
      for (const [v, lbl] of [[svc, 'Service %'], [util, 'Utility %'], [sst, 'SST on fee %']]) if (!(v >= 0 && v <= 100)) { f.error = `${lbl} must be between 0 and 100.`; return; }
      if (svc + util > 100) { f.error = 'Total % can\'t be more than 100.'; return; }
      if (t.netRental && !(net > 0 && net <= 100)) { f.error = 'Net Rental # % must be more than 0 and at most 100.'; return; }
      // Remarks are optional (Khairul 12 Nov 2026); what changed is in the audit lines either way
      const arr = { effectiveDate: f.effectiveDate, name, type: f.type, section: f.section, servicePct: svc / 100, utilityPct: util / 100, sstPct: sst / 100,
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
        `${name} ${f.isNew ? 'added' : 'saved'}, effective ${dmy(f.effectiveDate)} (all of ${monthName(f.effectiveFrom)} on).`);
    },
    async removeArr() {
      const f = this.form; f.error = '';
      if (this.unitsUsing(f.id) > 0) return;
      if (!await askConfirm({ title: `Delete ${f.old?.name || 'this arrangement'}?`, message: `It is removed from ${monthName(f.effectiveFrom)} on. Months before keep it.`, confirmText: 'Delete arrangement', danger: true })) return;
      await this.write({ id: f.id, arr: null, effectiveFrom: f.effectiveFrom, reason: f.reason.trim(), changes: [{ field: 'Arrangement', old: f.old?.name || f.id, new: null }] },
        `${f.old?.name || 'Arrangement'} deleted from ${monthName(f.effectiveFrom)}.`);
    },
    async write(args, msg) {
      this.busy = true; this.$emit('busy', true);
      try {
        await saveArrangement(me, this.propertyId, args);   // the shared set marks every property itself
        if (this.propertyId) await forgetUnits(this.propertyId);
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
      if (!this.dateOk(r)) { this.$emit('error', `Pick an Applies from date between ${dmy(this.dateMin)} and ${dmy(this.dateMax)}.`); return; }
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
        await saveRates(me, this.propertyId, { effectiveFrom: r.effectiveFrom, effectiveDate: r.effectiveDate, ota, earlyToOwner: r.earlyToOwner, tourismTax: tt, reason: r.reason.trim() });
        if (this.propertyId) await forgetUnits(this.propertyId);
        this.$emit('saved', `Saved, effective ${dmy(r.effectiveDate)} (all of ${monthName(r.effectiveFrom)} on).`);
        await this.load();
      } catch (e) { this.$emit('error', friendlyError(e, 'save the rates')); }
      this.busy = false; this.$emit('busy', false);
    }
  }
};
</script>

<style scoped>
/* A field with a help line under it (Applies from) makes its row taller; keep the field next to it at the top, not spread down */
.grid-fields { align-items: start; }
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
.pool-prop td { background: var(--hover); font-weight: 700; font-size: 13px; }
.pool-prop a { color: var(--accent); text-decoration: none; }
.pool-prop a:hover { text-decoration: underline; }
.pool-name { padding-left: 28px !important; }
.shared-tag { display: inline-block; margin-left: 6px; font-size: 11px; font-weight: 600; padding: 1px 8px; border-radius: 999px; background: var(--accent-soft); color: var(--accent); vertical-align: middle; }
</style>
