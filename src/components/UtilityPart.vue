<template>
  <div class="up">
    <p class="help" v-if="u.bills === null">Loading the booking's utility bills…</p>
    <p class="help" v-else-if="u.bills === false">This booking's utility bills can't be read.</p>
    <p class="help" v-else-if="!u.bills.length && !u.add.on">No unpaid utility bills on this booking.</p>
    <div class="up-list" v-if="u.bills && u.bills.length">
      <label class="up-bill" v-for="b in u.bills" :key="b.id" :class="{ on: u.ticks[b.id] }">
        <input type="checkbox" :checked="!!u.ticks[b.id]" :disabled="readonly" @change="tick(b, $event.target.checked)">
        <span class="up-main"><b>{{ datesText(b) }}</b><small>{{ linesText(b) }}</small></span>
        <span class="up-left">{{ `${money(availOf(u, b))} left` }}<small>{{ `of ${money(b.total)}` }}</small></span>
        <span class="pill" :class="PILL[b.status]">{{ STATUS_TEXT[b.status] }}</span>
      </label>
    </div>

    <!-- A bill not lodged yet: saved as a new bill on the booking (lodgedFrom 'payment') in the same save -->
    <template v-if="allowAdd && !readonly">
      <button type="button" class="link-btn up-addbtn" v-if="!u.add.on" @click="u.add.on = true; refill()">+ Add bill not lodged yet</button>
      <div class="up-add" v-else>
        <div class="up-add-head"><b>New bill</b><button type="button" class="link-btn" @click="u.add.on = false; refill()">Remove</button></div>
        <div class="up-line" v-for="k in KINDS" :key="k.key" @wheel.capture="noWheel">
          <span class="up-kind">{{ k.label }}</span>
          <input class="input" type="date" v-model="u.add[k.key + 'From']" :aria-label="`${k.label} from`">
          <input class="input" type="date" v-model="u.add[k.key + 'To']" :aria-label="`${k.label} to`">
          <input class="input up-amt" type="number" min="0" step="0.01" placeholder="0.00" v-model="u.add[k.key]" :aria-label="`${k.label} amount (RM)`" @input="refill">
        </div>
        <div class="field"><label>Bill photo <span class="muted">(optional, goes to the bill's Drive folder, not the payment receipts)</span></label>
          <DriveFiles :key="u.add.id" kind="utility-bills" :record-id="u.add.id" :list-on-load="false" :label="label" @folder="l => u.add.driveFolder = l" /></div>
      </div>
    </template>

    <div class="up-amount" v-if="(u.bills && u.bills.length) || u.add.on">
      <div class="field"><label for="upAmt">Utilities amount (RM)</label>
        <input class="input" id="upAmt" type="number" min="0" step="0.01" :disabled="readonly" v-model="u.amount" :placeholder="utilMax(u).toFixed(2)" @input="u.touched = true" @wheel.capture="noWheel"></div>
      <p class="help" v-if="r2(u.amount) > utilMax(u) + 0.005">{{ `More than the ticked bills have left (${money(utilMax(u))}).` }}</p>
      <p class="help" v-else-if="alloc.length">{{ 'Pays ' + alloc.map(a => `${a.name} ${money(a.amount)}${a.short ? ' (part)' : ''}`).join(', ') + '. Oldest first; lower the amount for a part payment.' }}</p>
      <p class="help" v-else>Tick the bills this payment pays.</p>
    </div>
  </div>
</template>

<script>
// The Utilities part of an offline payment (23 Nov 2026, Khairul): the booking's unpaid / partly paid bills as tick boxes,
// the amount (filled from the ticked bills, oldest first, can be lowered), and "+ Add bill not lodged yet".
// It changes the `u` object it is given (lib/utility-bills.js blankUtil); the page saves it.
import DriveFiles from '@/components/DriveFiles.vue';
import { KINDS, PILL, STATUS_TEXT, money, r2, datesText, linesText, availOf, utilMax, utilPool, utilAlloc, refillUtil } from '@/lib/utility-bills.js';

export default {
  components: { DriveFiles },
  props: { u: { type: Object, required: true }, label: { type: String, default: '' }, allowAdd: { type: Boolean, default: true }, readonly: { type: Boolean, default: false } },
  data() { return { KINDS, PILL, STATUS_TEXT }; },
  computed: {
    alloc() {
      const pool = utilPool(this.u);
      return utilAlloc(this.u).map(a => { const b = pool.find(x => x.id === a.billId); return { ...a, name: b?.isNew ? 'the new bill' : datesText(b), short: a.amount < (b?.left || 0) - 0.005 }; });
    }
  },
  methods: {
    money, r2, datesText, linesText, availOf, utilMax,
    noWheel(e) { if (e.target.type === 'number' && e.target === document.activeElement) e.target.blur(); },
    refill() { refillUtil(this.u); },
    tick(b, on) { this.u.ticks = { ...this.u.ticks, [b.id]: on }; if (!on) delete this.u.ticks[b.id]; this.u.touched = false; this.refill(); }
  }
};
</script>

<style scoped>
.up-list { border: 1px solid var(--border); border-radius: 10px; overflow: hidden; margin-bottom: 10px; }
.up-bill { display: grid; grid-template-columns: 22px minmax(0, 1fr) auto auto; gap: 10px; align-items: center; padding: 8px 12px; border-top: 1px solid var(--border); cursor: pointer; font-size: 14px; }
.up-bill:first-child { border-top: 0; }
.up-bill.on { background: var(--accent-soft); }
.up-main, .up-left { display: grid; gap: 1px; }
.up-main small, .up-left small { color: var(--muted); font-size: 12px; }
.up-left { text-align: right; white-space: nowrap; }
.up-bill .pill { white-space: nowrap; }
.link-btn { background: none; border: 0; padding: 0; color: var(--accent); font: inherit; font-size: 13px; cursor: pointer; text-decoration: underline; }
.up-addbtn { margin: 2px 0 10px; }
.up-add { border: 1px dashed var(--border); border-radius: 10px; padding: 10px 12px; margin-bottom: 10px; }
.up-add-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-size: 14px; }
.up-line { display: grid; grid-template-columns: 90px minmax(0, 1fr) minmax(0, 1fr) 120px; gap: 8px; align-items: center; margin-bottom: 6px; }
.up-kind { font-size: 13px; color: var(--text-2); }
.up-amt, .up-amount input { -moz-appearance: textfield; appearance: textfield; }
.up-amount .field { max-width: 260px; margin-bottom: 4px; }
.up-add .field { margin-top: 8px; }
.field label { display: block; font-size: 13px; color: var(--text-2); margin-bottom: 4px; }
@media (max-width: 640px) { .up-line { grid-template-columns: 1fr 1fr; } .up-bill { grid-template-columns: 22px 1fr auto; } .up-bill .pill { display: none; } }
</style>
