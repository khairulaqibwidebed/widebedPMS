<template>
  <!-- 24 Nov 2026 (Khairul): the lines of one offline payment, like "+ Add another owner". Each line picks its type:
       Rental (amount + For month), Utilities (the booking's bills, one line only) or Charges (amount + what for, kept apart
       from the rent). One receipt and one status cover the whole payment. Used by the new payment form and its Edit. -->
  <div class="pl">
    <div class="pl-line" v-for="(ln, i) in lines" :key="ln.id">
      <!-- 24 Nov 2026 (Khairul): no cards; from the second line a plain heading with Remove, like the owner form -->
      <div class="pl-head" v-if="lines.length > 1"><b>{{ `Payment ${i + 1}` }}</b>
        <button type="button" class="pl-x" @click="lines.splice(i, 1)" :aria-label="`Remove payment ${i + 1}`">Remove</button></div>
      <div class="pl-grid">
        <div class="field"><label class="req">Payment for</label>
          <OptionPicker class="fld-pick" v-model="ln.type" :options="typeOptions(ln)" label="Payment for" /></div>
        <template v-if="ln.type === 'rental'">
          <FormField label="Amount (RM)" req type="number" min="0" step="0.01" v-model="ln.amount" placeholder="0.00" />
          <div class="field" v-if="booked"><label class="req">For month</label>
            <OptionPicker class="fld-pick" v-model="ln.forMonth" :options="monthOpts" label="For month" /></div>
        </template>
        <template v-else-if="ln.type === 'charges'">
          <FormField label="Amount (RM)" req type="number" min="0" step="0.01" v-model="ln.amount" placeholder="0.00" />
          <div class="field pl-wide"><label class="req">What for</label>
            <input class="input" v-model="ln.note" maxlength="200" placeholder="e.g. Damage: broken lamp in the bedroom" aria-label="What the charge is for"></div>
          <p class="help pl-wide" :class="{ 'pl-off': !booked }">{{ booked ? "Kept apart from the rent: it shows under Charges on the booking's Payments tab." : 'Pick a booking in Guest / tenant name. A charge goes on its booking.' }}</p>
        </template>
        <template v-else>
          <!-- 25 Nov 2026 (Khairul): read-only total of the ticked bills beside the type, so the two columns stay even -->
          <div class="field"><label>Amount (RM)</label>
            <input class="input pl-ro" readonly tabindex="-1" :value="booked && u && r2(u.amount) > 0 ? r2(u.amount).toFixed(2) : ''" placeholder="From the bills below" aria-label="Utilities amount (RM), from the bills below"></div>
          <div class="field pl-wide"><label class="req">Utility bills</label>
            <p class="help pl-off" v-if="!booked">Pick a booking in Guest / tenant name to see its bills.</p>
            <UtilityPart v-else class="pl-util" :u="u" :label="label" :allow-add="allowAdd" /></div>
        </template>
      </div>
    </div>
    <div class="pl-foot">
      <button v-if="canEdit && lines.length < 8" type="button" class="btn" @click="addLine">+ Add another payment type</button>
      <span class="pl-total">Total <b>{{ money(total) }}</b></span>
    </div>
  </div>
</template>

<script>
import FormField from '@/components/FormField.vue';
import OptionPicker from '@/components/OptionPicker.vue';
import UtilityPart from '@/components/UtilityPart.vue';
import { r2, money, newPayLine } from '@/lib/utility-bills.js';

const TYPES = [{ value: 'rental', label: 'Rental' }, { value: 'utilities', label: 'Utilities' }, { value: 'charges', label: 'Charges' }];

export default {
  components: { FormField, OptionPicker, UtilityPart },
  // lines: [{ id, type, amount, forMonth, note }] (changed in place); u: the Utilities state (lib/utility-bills.js blankUtil)
  props: { lines: { type: Array, required: true }, u: { type: Object, default: null }, booked: { type: Boolean, default: false },
    monthOpts: { type: Array, default: () => [] }, canEdit: { type: Boolean, default: true }, allowAdd: { type: Boolean, default: true }, label: { type: String, default: '' } },
  computed: {
    total() {
      return r2(this.lines.reduce((a, x) => a + (x.type === 'utilities' ? (this.booked && this.u ? r2(this.u.amount) : 0) : r2(x.amount)), 0));
    }
  },
  methods: {
    money, r2,
    // Without the Offline Payments Edit tick: Utilities only. Utilities is offered on one line only.
    typeOptions(ln) {
      if (!this.canEdit) return TYPES.filter(t => t.value === 'utilities');
      const utilTaken = this.lines.some(x => x !== ln && x.type === 'utilities');
      return TYPES.filter(t => !(t.value === 'utilities' && utilTaken));
    },
    // The next line starts on a type not used yet (Rental, then Utilities, then Charges); Charges may repeat
    addLine() {
      const used = new Set(this.lines.map(x => x.type));
      this.lines.push(newPayLine(['rental', 'utilities', 'charges'].find(t => !used.has(t)) || 'charges'));
    }
  }
};
</script>

<style scoped>
.pl { grid-column: 1 / -1; margin-bottom: 14px; }
.pl-line + .pl-line { border-top: 1px solid var(--border); padding-top: 12px; }
.pl-head { display: flex; justify-content: space-between; align-items: center; font-size: 13px; margin-bottom: 8px; }
/* 25 Nov 2026 (Khairul): Remove is a quiet grey action, red on hover */
.pl-x { background: none; border: 0; padding: 0; color: var(--muted); font: inherit; font-size: 12px; cursor: pointer; }
.pl-x:hover, .pl-x:focus-visible { color: var(--danger); }
.pl-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 20px; }
.pl-wide { grid-column: 1 / -1; }
.pl-grid > .help { margin: 4px 0 14px; }
/* 25 Nov 2026 (Khairul): booking notes are notes in the theme colour with an info mark, not dashed like the upload box */
.pl-off { display: flex; align-items: flex-start; gap: 8px; padding: 10px 12px; background: var(--accent-soft); border-radius: 8px; color: var(--text-2); }
.pl-off::before { content: 'i'; flex: none; width: 16px; height: 16px; margin-top: 1px; border-radius: 50%; background: var(--accent); color: #fff;
  font: 700 11px/16px Georgia, serif; text-align: center; }
.pl-ro { background: var(--hover); color: var(--text); cursor: default; }
.pl-util :deep(.up-amount) { margin-top: 12px; }
.fld-pick { display: block; width: 100%; }
.fld-pick :deep(.op) { display: block; width: 100%; }
.fld-pick :deep(.op-btn), .fld-pick :deep(.op-input) { width: 100%; min-height: 44px; font-size: 15px; }
.fld-pick :deep(.op-pop) { max-width: none; width: 100%; }
.pl-foot { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--border); } /* 25 Nov 2026: space and a line above Add / Total */
.pl-total { font-size: 14px; color: var(--text-2); }
.pl-total b { color: var(--text); font-size: 16px; margin-left: 6px; }
@media (max-width: 640px) { .pl-grid { grid-template-columns: minmax(0, 1fr); } }
</style>
