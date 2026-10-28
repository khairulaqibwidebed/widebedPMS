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
          <button type="button" class="mp-m" :class="{ on: key(i) === modelValue, now: key(i) === thisMonth }"
            :disabled="key(i) > maxMonth" @click="pick(i)">{{ name }}</button>
        </template>
      </div>
      <div class="mp-quick">
        <button type="button" class="link" @click="set(thisMonth)">This month</button>
      </div>
    </div>
  </div>
</template>

<script>
import { monthName, monthOffset } from '@/lib/format.js';

// A month picker: one button, then a year with a 12-month grid. v-model is 'YYYY-MM'; 'change' fires after a pick.
//   <MonthPicker v-model="month" @change="load()" />
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export default {
  props: { modelValue: { type: String, required: true }, minYear: { type: Number, default: 2024 }, disabled: { type: Boolean, default: false }, ahead: { type: Number, default: 0 } },
  emits: ['update:modelValue', 'change'],
  data() { return { open: false, year: +this.modelValue.slice(0, 4), MON, thisMonth: monthOffset(0) }; },
  computed: {
    label() { return monthName(this.modelValue); },
    maxMonth() { return monthOffset(this.ahead); },
    maxYear() { return +this.maxMonth.slice(0, 4); }
  },
  mounted() { document.addEventListener('mousedown', this.away); },
  beforeUnmount() { document.removeEventListener('mousedown', this.away); },
  methods: {
    key(i) { return `${this.year}-${String(i + 1).padStart(2, '0')}`; },
    toggle() { this.open = !this.open; if (this.open) this.year = +this.modelValue.slice(0, 4); },
    away(e) { if (this.open && !this.$refs.root.contains(e.target)) this.open = false; },
    pick(i) { this.set(this.key(i)); },
    set(m) {
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
.mp-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.mp-m { height: 38px; border: 1px solid transparent; border-radius: 8px; background: none; color: var(--text); font: inherit; font-size: 13px; font-weight: 500; cursor: pointer; }
.mp-m:hover:not(:disabled) { background: var(--accent-soft); color: var(--accent); }
.mp-m.now { border-color: var(--border); }
.mp-m.on { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 700; }
.mp-m:disabled { opacity: .3; cursor: default; }
.mp-quick { display: flex; justify-content: flex-end; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--line); }
.mp-quick .link { background: none; border: 0; cursor: pointer; padding: 0; font: inherit; font-size: 13px; font-weight: 600; color: var(--accent); }
</style>
