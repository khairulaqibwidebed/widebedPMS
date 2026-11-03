<template>
  <div class="stmt-lines">
    <template v-if="!sel.fixed">
      <div>
        <div class="row"><span>Total receivable</span><span>{{ amt(sel.totals.totalReceivable) }}</span></div>
        <div class="row sub"><span>{{ `Service fee (${pct(sel.rates.serviceFeePct)})` }}</span><span>{{ amt(-sel.totals.serviceFee) }}</span></div>
        <div class="row sub" v-show="sel.rates.utilityFeePct"><span>{{ `Utilities (${pct(sel.rates.utilityFeePct)})` }}</span><span>{{ amt(-sel.totals.utilityFee) }}</span></div>
        <div class="row sub" v-show="sel.rates.sstOnFeePct"><span>{{ `SST on fee (${pct(sel.rates.sstOnFeePct)})` }}</span><span>{{ amt(-sel.totals.sstOnFee) }}</span></div>
        <div class="row"><span>Owner's entitlement</span><span>{{ amt(sel.totals.entitlement) }}</span></div>
      </div>
    </template>
    <template v-if="sel.fixed">
      <div class="row"><span>Fixed rent</span><span>{{ amt(sel.totals.totalReceivable) }}</span></div>
    </template>
    <div class="stmt-label"><span>Expenses & reimbursements</span><RouterLink class="navlink" :to="{ path: '/Finance/expenses', query: { property: propertyId, month } }">View all →</RouterLink></div>
    <template v-for="e in sel.expenseLines" :key="e.expenseId">
      <div class="row sub"><span>{{ `${dmy(e.date)} · ${e.description}` }}</span><span>{{ amt(e.amount) }}</span></div>
    </template>
    <div class="row sub" v-show="!sel.expenseLines.length"><span>No expenses or reimbursements</span><span></span></div>
    <template v-if="!sel.fixed">
      <div>
        <div class="row"><span>Nett receivable</span><span>{{ amt(sel.totals.netReceivable) }}</span></div>
        <div class="row sub"><span>Rounding adjust (to RM 0.05)</span><span>{{ amt(sel.totals.roundingAdjust) }}</span></div>
      </div>
    </template>
    <div class="row total" :class="{ 'neg-amt': sel.totals.payout < 0 }"><span>{{ sel.totals.payout < 0 ? 'Payout (negative, carried forward)' : 'Payout to owner' }}</span><span>{{ 'RM ' + amt(sel.totals.payout) }}</span></div>
  </div>
</template>

<script>
// The statement summary lines of one unit (Month-end unit page): receivable, fees, expenses, rounding, payout.
//   <StatementLines :sel="sel" :property-id="propertyId" :month="month" />   (sel = the unit's statement record, lib/summaries.js)
import { amt, pct, dmy } from '@/lib/format.js';

export default {
  props: { sel: { type: Object, required: true }, propertyId: { type: String, required: true }, month: { type: String, required: true } },
  data() { return { amt, pct, dmy }; }
};
</script>

<style scoped>
.stmt-label { display: flex; justify-content: space-between; font-size: 11px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--muted); padding: 14px 0 4px; }
.stmt-label .navlink { text-transform: none; letter-spacing: 0; font-size: 12px; }
</style>
