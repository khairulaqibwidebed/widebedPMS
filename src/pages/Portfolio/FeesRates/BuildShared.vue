<template>
  <!-- Build shared set from properties (Directors, one time, 12 Nov 2026). Reads every property's own Fees & rates and OTA
       commissions for the month, lists every arrangement once, and asks for a pick wherever properties differ.
       Nothing is saved until Save. lib/shared-rates.js planShared() does the comparing. -->
  <div class="modal-back" @click.self="close()" v-esc="close">
    <div class="modal bs-modal" role="dialog" aria-modal="true" aria-label="Build shared set from properties">
      <div class="bs-head"><h2>Build shared set from properties</h2><button type="button" class="icon-btn" @click="close()" aria-label="Close">×</button></div>
      <div class="bs-body">
        <p class="help" style="margin-top:0">Every property's own settings for the month below, merged into one set for every property. Where properties differ, pick the one to keep.
          "Leave on each property" keeps that arrangement off the shared list, so each property goes on using its own numbers. Pool Sharing's Net Rental # % always stays per property.</p>
        <div class="grid-fields">
          <div class="field"><label for="bsFrom" class="req">Shared set starts from</label>
            <select class="input" id="bsFrom" v-model="month" @change="load()" :disabled="busy"><template v-for="m in months" :key="m"><option :value="m" :selected="m === month">{{ monthName(m) }}</option></template></select>
            <span class="help">Months before this keep each property's own settings. Every property's summaries from this month are worked out again.</span></div>
          <div></div>
        </div>
        <div class="notice" v-if="hasShared">A shared set already exists. Saving adds a new one from the month picked, replacing its whole list from then on.</div>
        <div class="notice error" v-show="error">{{ error }}</div>
        <div class="help" v-if="loading">Reading every property's settings…</div>

        <template v-if="plan && !loading">
          <p class="bs-count">{{ `${sources.length} properties read. ${conflicts} ${conflicts === 1 ? 'thing differs' : 'things differ'} between them.` }}</p>

          <h3>Arrangements</h3>
          <div class="bs-list">
            <div class="bs-item" v-for="r in plan.arrangements" :key="r.id" :class="{ diff: r.variants.length > 1, off: pick.arr[r.id] === 'own' }">
              <div class="bs-top">
                <input class="input bs-name" v-model="names[r.id]" :disabled="pick.arr[r.id] === 'own'" :aria-label="`Name of ${r.id}`">
                <span class="help">{{ `${typeLabel(r)} · ${sectionLabel(r)}` }}</span>
                <span class="bs-clash" v-if="clashes.has(r.id)">Same name as another one. Change one of the names.</span>
              </div>
              <label class="bs-opt" v-for="(v, i) in r.variants" :key="i">
                <input type="radio" :name="`arr-${r.id}`" :value="i" v-model="pick.arr[r.id]" v-if="r.variants.length > 1" @change="names[r.id] = v.value.name">
                <span><b>{{ arrText(v.value) }}</b><span class="help">{{ ` · ${v.value.name} · ` + propsText(v.props) }}</span></span>
              </label>
              <label class="bs-opt" v-if="r.variants.length > 1">
                <input type="radio" :name="`arr-${r.id}`" value="own" v-model="pick.arr[r.id]">
                <span><b>Leave on each property</b><span class="help"> · not shared; each property keeps its own numbers</span></span>
              </label>
            </div>
          </div>

          <h3>OTA commissions</h3>
          <div class="bs-list">
            <div class="bs-item" v-for="o in plan.ota" :key="o.key" :class="{ diff: o.variants.length > 1 }">
              <div class="bs-top"><b>{{ o.label }}</b></div>
              <label class="bs-opt" v-for="(v, i) in o.variants" :key="i">
                <input type="radio" :name="`ota-${o.key}`" :value="i" v-model="pick.ota[o.key]" v-if="o.variants.length > 1">
                <span><b>{{ otaText(v.value) }}</b><span class="help">{{ ' · ' + propsText(v.props) }}</span></span>
              </label>
            </div>
          </div>

          <h3>Rules</h3>
          <div class="bs-list">
            <div class="bs-item" :class="{ diff: plan.tax.length > 1 }">
              <div class="bs-top"><b>Tourism Tax per unit per night</b></div>
              <label class="bs-opt" v-for="(v, i) in plan.tax" :key="i">
                <input type="radio" name="bs-tax" :value="i" v-model="pick.tax" v-if="plan.tax.length > 1">
                <span><b>{{ `RM ${v.value.toFixed(2)}` }}</b><span class="help">{{ ' · ' + propsText(v.props) }}</span></span>
              </label>
            </div>
          </div>

          <div class="field" style="margin-top:16px"><label for="bsWhy" class="req">Reason (audit log)</label>
            <textarea class="input" id="bsWhy" v-model="reason"></textarea></div>
        </template>
      </div>
      <div class="modal-foot bs-foot">
        <button type="button" class="btn" @click="close()" :disabled="busy">Cancel</button>
        <button type="button" class="btn btn-primary" @click="save()" :disabled="busy || loading || !plan || clashes.size > 0">{{ busy ? 'Saving…' : 'Save shared set' }}</button>
      </div>
    </div>
  </div>
</template>

<script>
import { FEE_TYPES, SECTIONS } from '@/lib/fee-types.js';
import { DEFAULT_OTA } from '@/lib/engine.js';
import { monthName } from '@/lib/format.js';
import { friendlyError } from '@/lib/finance-data.js';
import { askConfirm } from '@/lib/confirm.js';
import { useSession } from '@/stores/session.js';
import { planShared } from '@/lib/shared-rates.js';
import { loadBuildSources, saveSharedBuild } from '@/lib/portfolio-data.js';

const me = useSession();
const pctTxt = f => `${+(Number(f || 0) * 100).toFixed(2)}%`;

export default {
  props: { months: { type: Array, required: true }, asOf: { type: String, required: true }, hasShared: Boolean },
  emits: ['close', 'saved'],
  data() {
    return { month: this.asOf, sources: [], plan: null, pick: { arr: {}, ota: {}, early: 0, tax: 0 }, names: {},
      reason: 'Shared set built from every property\'s own Fees & rates.', loading: false, busy: false, error: '' };
  },
  created() { this.load(); },
  computed: {
    conflicts() {
      const p = this.plan; if (!p) return 0;
      return [...p.arrangements, ...p.ota].filter(x => x.variants.length > 1).length + (p.tax.length > 1);
    },
    // Arrangements kept on the shared list whose names are the same (names must be unique, as on Fees & rates)
    clashes() {
      const seen = new Map(), out = new Set();
      for (const r of this.plan?.arrangements || []) {
        if (this.pick.arr[r.id] === 'own') continue;
        const n = String(this.names[r.id] || '').trim().toLowerCase();
        if (!n) { out.add(r.id); continue; }
        if (seen.has(n)) { out.add(r.id); out.add(seen.get(n)); } else seen.set(n, r.id);
      }
      return out;
    }
  },
  methods: {
    monthName,
    close() { if (!this.busy) this.$emit('close'); },
    typeLabel(r) { const a = r.variants[0].value; return FEE_TYPES[a.type]?.label || a.type || '—'; },
    sectionLabel(r) { return SECTIONS.find(s => s.key === (r.variants[0].value.section || 'short'))?.label || ''; },
    arrText(a) {
      const pool = FEE_TYPES[a.type]?.netRental;
      return `Service ${pctTxt(a.servicePct)} + Utility ${pctTxt(a.utilityPct)} = ${pctTxt(Number(a.servicePct || 0) + Number(a.utilityPct || 0))}`
        + (Number(a.sstPct) > 0 ? `, SST ${pctTxt(a.sstPct)}` : '') + (pool ? ' (Net Rental # % per property)' : '');
    },
    otaText(v) { return `${v.payout === 'gross' ? 'Gross' : 'Net'} ${pctTxt(v.commissionPct)}` + (v.payout === 'gross' ? `, payment fee ${pctTxt(v.paymentFeePct)}` : ''); },
    propsText(list) {
      const names = list.map(p => p.code + (p.active ? '' : ' (off)'));
      return `${list.length} ${list.length === 1 ? 'property' : 'properties'}: ${names.slice(0, 8).join(', ')}${names.length > 8 ? ` +${names.length - 8} more` : ''}`;
    },
    async load() {
      this.loading = true; this.error = ''; this.plan = null;
      try {
        this.sources = await loadBuildSources(this.month);
        const plan = planShared(this.sources, DEFAULT_OTA);
        this.pick = { arr: Object.fromEntries(plan.arrangements.map(r => [r.id, 0])), ota: Object.fromEntries(plan.ota.map(o => [o.key, 0])), early: 0, tax: 0 };
        this.names = Object.fromEntries(plan.arrangements.map(r => [r.id, r.variants[0].value.name || '']));
        this.plan = plan;
      } catch (e) { this.error = friendlyError(e, 'read every property\'s settings'); }
      this.loading = false;
    },
    async save() {
      const p = this.plan; this.error = '';
      if (!this.reason.trim()) { this.error = 'Add a reason. It goes in the audit log.'; return; }
      if (this.clashes.size) return;
      const arrangements = {}, changes = [];
      for (const r of p.arrangements) {
        const k = this.pick.arr[r.id];
        if (k === 'own') { changes.push({ field: `${r.variants[0].value.name}`, old: `${r.variants.length} versions`, new: 'Left on each property' }); continue; }
        const { effectiveFrom: _f, reason: _r, ...a } = r.variants[k].value;
        arrangements[r.id] = { ...a, name: this.names[r.id].trim().replace(/\s+/g, ' '), effectiveFrom: this.month, reason: this.reason.trim() };
        if (r.variants.length > 1) changes.push({ field: arrangements[r.id].name, old: `${r.variants.length} versions`, new: this.arrText(a) });
      }
      const ota = {};
      for (const o of p.ota) {
        const v = o.variants[this.pick.ota[o.key]].value;
        ota[o.key] = { label: v.label || DEFAULT_OTA[o.key].label, payout: v.payout, commissionPct: v.commissionPct,
          ...(v.payout === 'gross' ? { paymentFeePct: v.paymentFeePct || 0, sstPct: v.sstPct ?? 0.08 } : {}) };
        if (o.variants.length > 1) changes.push({ field: o.label, old: `${o.variants.length} versions`, new: this.otaText(v) });
      }
      // Early check-in: not asked (Khairul 12 Nov 2026); kept as most properties have it (Yes on every property today)
      const earlyToOwner = p.early[0]?.value ?? true, tourismTax = p.tax[this.pick.tax].value;
      const n = Object.keys(arrangements).length;
      if (!await askConfirm({ title: 'Save the shared set?', confirmText: 'Save shared set',
        message: `${n} arrangement${n === 1 ? '' : 's'}, the OTA commissions and the rules apply to every property from ${monthName(this.month)}. Every property's summaries from then are worked out again. Months before keep their own settings.` })) return;
      this.busy = true;
      try {
        await saveSharedBuild(me, { effectiveFrom: this.month, ota, earlyToOwner, tourismTax, arrangements, reason: this.reason.trim(),
          changes: [{ field: 'Shared set', old: null, new: `${n} arrangements from ${this.sources.length} properties` }, ...changes] });
        this.busy = false;
        this.$emit('saved', `Shared set saved. Every property uses it from ${monthName(this.month)}.`);
      } catch (e) { this.error = friendlyError(e, 'save the shared set'); this.busy = false; }
    }
  }
};
</script>

<style scoped>
.bs-modal { max-width: 820px !important; width: calc(100% - 32px); padding: 0; display: flex; flex-direction: column; max-height: 88vh; }
.bs-head { display: flex; justify-content: space-between; align-items: center; padding: 18px 24px; border-bottom: 1px solid var(--border); }
.bs-head h2 { margin: 0; }
.bs-body { padding: 18px 24px; overflow-y: auto; flex: 1 1 auto; }
.bs-body h3 { margin: 18px 0 8px; font-size: 15px; }
.bs-foot { margin: 0; padding: 14px 24px; border-top: 1px solid var(--border); }
.bs-count { font-weight: 600; margin: 12px 0 0; }
.bs-list { display: grid; gap: 8px; }
.bs-item { border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; background: var(--surface); }
.bs-item.diff { border-color: var(--accent); }
.bs-item.off { opacity: .75; }
.bs-top { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin-bottom: 4px; }
.bs-name { max-width: 280px; height: 34px; }
.bs-clash { color: var(--red, #c0392b); font-size: 12.5px; }
.bs-opt { display: flex; align-items: flex-start; gap: 8px; padding: 3px 0; font-size: 13.5px; cursor: pointer; }
.bs-opt input { margin-top: 3px; }
</style>
