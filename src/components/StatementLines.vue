<template>
  <div class="stmt-lines">
    <template v-if="!sel.fixed">
      <div>
        <!-- Pool Sharing: the property pot and this unit's share of it -->
        <template v-if="sel.pool">
          <div class="row sub"><span>{{ `Pool: Gross Rental of ${sel.pool.units || ''} pool units` }}</span><span>{{ amt(sel.pool.pot) }}</span></div>
          <div class="row sub"><span>{{ `Net Rental # (${pct(sel.pool.netRentalPct)} of the pot)` }}</span><span>{{ amt(sel.pool.netRental) }}</span></div>
          <div class="row sub"><span>{{ `This unit: ${(sel.pool.unitPct * 100).toFixed(3)}% by purchase price` }}</span><span></span></div>
        </template>
        <div class="row"><span>{{ sel.pool ? 'Unit share' : 'Total receivable' }}</span><span>{{ amt(sel.totals.totalReceivable) }}</span></div>
        <!-- Profit Sharing: unit expenses come off first -->
        <template v-if="sel.totals.netRental != null">
          <div class="row sub"><span>Unit expenses (before fees)</span><span>{{ amt(sel.totals.netRental - sel.totals.totalReceivable) }}</span></div>
          <div class="row"><span>Net Rental</span><span>{{ amt(sel.totals.netRental) }}</span></div>
        </template>
        <div class="row sub"><span>{{ `Service fee (${pct(sel.rates.serviceFeePct)})` }}</span><span>{{ amt(-sel.totals.serviceFee) }}</span></div>
        <div class="row sub" v-show="sel.rates.utilityFeePct"><span>{{ `Utilities (${pct(sel.rates.utilityFeePct)})` }}</span><span>{{ amt(-sel.totals.utilityFee) }}</span></div>
        <div class="row sub" v-show="sel.rates.sstOnFeePct"><span>{{ `SST on fee (${pct(sel.rates.sstOnFeePct)})` }}</span><span>{{ amt(-sel.totals.sstOnFee) }}</span></div>
        <div class="row"><span>Owner's entitlement</span><span>{{ amt(sel.totals.entitlement) }}</span></div>
      </div>
    </template>
    <template v-if="sel.fixed">
      <div class="row"><span>Fixed rent</span><span>{{ amt(sel.totals.totalReceivable) }}</span></div>
      <template v-if="sel.totals.serviceFee || sel.totals.utilityFee || sel.totals.sstOnFee">
        <div class="row sub" v-show="sel.totals.serviceFee"><span>{{ `Service fee (${pct(sel.rates.serviceFeePct)})` }}</span><span>{{ amt(-sel.totals.serviceFee) }}</span></div>
        <div class="row sub" v-show="sel.totals.utilityFee"><span>{{ `Utilities (${pct(sel.rates.utilityFeePct)})` }}</span><span>{{ amt(-sel.totals.utilityFee) }}</span></div>
        <div class="row sub" v-show="sel.totals.sstOnFee"><span>{{ `SST on fee (${pct(sel.rates.sstOnFeePct)})` }}</span><span>{{ amt(-sel.totals.sstOnFee) }}</span></div>
      </template>
    </template>
    <div class="stmt-label"><span>Expenses & reimbursements</span><RouterLink class="navlink" :to="{ path: '/Finance/expenses', query: { property: propertyId, month } }">View all →</RouterLink></div>
    <template v-for="e in afterLines" :key="e.expenseId">
      <div class="row sub"><span>{{ e.description }}</span><span>{{ amt(e.amount) }}</span></div>
    </template>
    <div class="row sub" v-show="!afterLines.length"><span>{{ sel.pool ? 'No reimbursements (Pool Sharing takes no expenses off)' : 'No expenses or reimbursements' }}</span><span></span></div>
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
// Profit Sharing shows the unit's expenses above the fees (Net Rental); Pool Sharing shows the pot and the unit's share.
import { amt, pct, dmy } from '@/lib/format.js';

export default {
  props: { sel: { type: Object, required: true }, propertyId: { type: String, required: true }, month: { type: String, required: true } },
  data() { return { amt, pct, dmy }; },
  computed: {
    // Expense lines that come in after the fees (Profit Sharing's unit expenses are shown above as one line)
    afterLines() { const list = this.sel.expenseLines || []; return this.sel.totals?.netRental != null ? list.filter(e => e.kind !== 'expense') : list; }
  }
};
</script>
