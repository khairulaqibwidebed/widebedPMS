<template>
  <div class="mp" ref="root">
    <button type="button" class="select mp-btn" :disabled="disabled" :aria-expanded="String(open)" aria-haspopup="dialog" @click="toggle">
      {{ label }}
    </button>
    <div class="mp-pop" v-if="open" role="dialog" aria-label="Pick a month" @keydown.esc="open = false">
      <div class="mp-year">
        <button type="button" class="mp-nav" :disabled="year <= minYear" @click="year--" aria-label="Previous year">&lsaquo;</button>
        <b>{{ year }}</b>
        <button type="button" class="mp-nav" :disabled="year >= maxYear" @click="year++" aria-label="Next year">&rsaquo;</button>
      </div>
      <div class="mp-grid">
        <template v-for="(name, i) in MON" :key="name">
          <button type="button" class="mp-m" :class="{ on: shown(i), now: key(i) === thisMonth }"
            :disabled="key(i) > maxMonth" @click="onClick(i, $event)" @mousedown="multiple && $event.preventDefault(); down(i)" @mouseenter="over(i)">{{ name }}</button>
        </template>
      </div>
      <div class="mp-quick" :class="{ both: allLabel }">
        <button type="button" class="link" v-if="allLabel" @click="set('')">{{ allLabel }}</button>
        <button type="button" class="link" @click="set(thisMonth)">This month</button>
        <button type="button" class="link" v-if="multiple" @click="open = false">Done</button>
      </div>
    </div>
  </div>
</template>

<script>
import { monthName, monthOffset } from '@/lib/format.js';

// A month picker: one button, then a year with a 12-month grid. v-model is 'YYYY-MM'; 'change' fires after a pick.
//   <MonthPicker v-model="month" @change="load()" />
// multiple: v-model is an array of 'YYYY-MM' (empty = every month; allLabel names that), and the grid stays open while ticking.
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export default {
  props: { modelValue: { type: [String, Array], required: true }, multiple: { type: Boolean, default: false }, minYear: { type: Number, default: 2024 }, disabled: { type: Boolean, default: false }, ahead: { type: Number, default: 0 }, allLabel: { type: String, default: '' } },
  emits: ['update:modelValue', 'change'],
  data() { return { drag: null, open: false, year: +(this.first() || monthOffset(0)).slice(0, 4), MON, thisMonth: monthOffset(0) }; },
  computed: {
    label() {
      if (this.multiple) { const n = this.modelValue.length; return !n ? (this.allLabel || 'All months') : n === 1 ? monthName(this.modelValue[0]) : `${n} months`; }
      return this.modelValue ? monthName(this.modelValue) : (this.allLabel || monthName(monthOffset(0)));
    },
    maxMonth() { return monthOffset(this.ahead); },
    maxYear() { return +this.maxMonth.slice(0, 4); }
  },
  mounted() { document.addEventListener('mousedown', this.away); document.addEventListener('mouseup', this.up); },
  beforeUnmount() { this.drag = null; document.removeEventListener('mousedown', this.away); document.removeEventListener('mouseup', this.up); },
  methods: {
    key(i) { return `${this.year}-${String(i + 1).padStart(2, '0')}`; },
    first() { return this.multiple ? [...this.modelValue].sort()[0] : this.modelValue; },
    // Several months: press on a month and drag across others to tick (or untick) the whole run; a plain click toggles one.
    shown(i) {
      const d = this.drag;
      if (this.multiple && d && d.moved && i >= Math.min(d.a, d.b) && i <= Math.max(d.a, d.b)) return d.mode;
      return this.isOn(this.key(i));
    },
    down(i) { if (this.multiple && this.key(i) <= this.maxMonth) this.drag = { a: i, b: i, moved: false, mode: !this.isOn(this.key(i)) }; },
    over(i) { const d = this.drag; if (d && d.b !== i) { d.b = i; d.moved = true; } },
    up() {
      const d = this.drag; if (!d) return;
      this.drag = null;
      if (!d.moved) return this.pick(d.a);
      const s = new Set(this.modelValue);
      for (let i = Math.min(d.a, d.b); i <= Math.max(d.a, d.b); i++) { const k = this.key(i); if (k > this.maxMonth) continue; d.mode ? s.add(k) : s.delete(k); }
      const next = [...s].sort(); this.$emit('update:modelValue', next); this.$nextTick(() => this.$emit('change', next));
    },
    // A mouse press is handled by down/up; a click from the keyboard (detail 0) still works
    onClick(i, e) { if (this.multiple && e.detail > 0) return; this.pick(i); },
    isOn(k) { return this.multiple ? this.modelValue.includes(k) : k === this.modelValue; },
    toggle() { this.open = !this.open; if (this.open) this.year = +(this.first() || monthOffset(0)).slice(0, 4); },
    away(e) { if (this.open && !this.$refs.root.contains(e.target)) this.open = false; },
    pick(i) {
      if (!this.multiple) return this.set(this.key(i));
      // several months: a pick ticks or unticks the month and the grid stays open
      const k = this.key(i), s = new Set(this.modelValue); s.has(k) ? s.delete(k) : s.add(k);
      const next = [...s].sort(); this.$emit('update:modelValue', next); this.$nextTick(() => this.$emit('change', next));
    },
    set(m) {
      if (this.multiple) {
        // 'This month' picks only the current month; the all label clears the list (every month)
        const next = m ? [m] : []; this.open = false; this.$emit('update:modelValue', next); this.$nextTick(() => this.$emit('change', next)); return;
      }
      this.open = false;
      if (m === this.modelValue) return;
      this.$emit('update:modelValue', m);
      this.$nextTick(() => this.$emit('change', m));
    }
  }
};
</script>

<style scoped>
.mp { position: relative; display: inline-block; }
.mp-btn { display: block; text-align: left; white-space: nowrap; }
.mp-pop { position: absolute; right: 0; top: calc(100% + 6px); z-index: 30; width: 268px; padding: 12px; background: var(--surface);
  border: 1px solid var(--border); border-radius: 12px; box-shadow: 0 10px 30px rgba(0, 0, 0, .12); }
.mp-year { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; font-size: 15px; }
.mp-nav { width: 30px; height: 30px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); color: var(--text); font-size: 18px; cursor: pointer; }
.mp-nav:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
.mp-nav:disabled { opacity: .35; cursor: default; }
.mp-grid { user-select: none; display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.mp-m { height: 38px; border: 1px solid transparent; border-radius: 8px; background: none; color: var(--text); font: inherit; font-size: 13px; font-weight: 500; cursor: pointer; }
.mp-m:hover:not(:disabled) { background: var(--accent-soft); color: var(--accent); }
.mp-m.now { border-color: var(--border); }
.mp-m.on { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 700; }
.mp-m:disabled { opacity: .3; cursor: default; }
.mp-quick { display: flex; justify-content: flex-end; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--line); }
.mp-quick .link { background: none; border: 0; cursor: pointer; padding: 0; font: inherit; font-size: 13px; font-weight: 600; color: var(--accent); }
.mp-quick.both { display: flex; justify-content: space-between; }
</style>
