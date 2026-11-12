<template>
  <!-- One property drop-down for every page (data access by property, 12 Nov 2026).
       Lists only the properties passed in (pages load "my properties" through lib/property-scope.js; Directors get all).
       Labels "Name (CODE)", plus " · State" when the same code is used in another state.
       State chips (only when the list spans more than one state) narrow the list; the choice is remembered app-wide. -->
  <span class="pp" :class="{ 'pp-block': block }">
    <span class="pp-chips" v-if="states.length > 1 && !disabled">
      <button v-for="s in states" :key="s" type="button" class="pp-chip" :class="{ on: chips.includes(s) }" :aria-pressed="chips.includes(s)" @click="toggle(s)">{{ shortState(s) }}</button>
    </span>
    <OptionPicker :class="pickerClass" :model-value="modelValue" :options="options" :label="label" :disabled="disabled" :placeholder="placeholder" searchable
      @update:model-value="v => $emit('update:modelValue', v)" @change="v => $emit('change', v)" />
  </span>
</template>

<script>
import OptionPicker from '@/components/OptionPicker.vue';
import { stateOf, shortState, propertyLabel } from '@/lib/states.js';

const KEY = 'wb.stateChips';
const NO_STATE = 'No state';
// The chosen state chips are shared by every picker on every page (kept in this browser only)
const shared = { list: null, subs: new Set() };
function readChips() {
  if (shared.list) return shared.list;
  try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); shared.list = Array.isArray(v) ? v.filter(x => typeof x === 'string') : []; }
  catch (_) { shared.list = []; }
  return shared.list;
}
function writeChips(list) {
  shared.list = list;
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (_) { /* private mode: kept for this visit only */ }
  shared.subs.forEach(fn => fn(list));
}

export default {
  components: { OptionPicker },
  props: {
    modelValue: { type: String, default: '' },
    properties: { type: Array, default: () => [] },
    before: { type: Array, default: () => [] },   // choices above the properties, e.g. [{ value: 'all', label: 'All properties' }]
    after: { type: Array, default: () => [] },    // choices below, e.g. [{ value: '__new', label: 'New property…' }]
    label: { type: String, default: 'Property' },
    placeholder: { type: String, default: '' },
    pickerClass: { type: String, default: '' },
    disabled: Boolean,
    block: Boolean
  },
  emits: ['update:modelValue', 'change'],
  data() { return { chips: [...readChips()] }; },
  created() { this.onChips = list => { this.chips = [...list]; }; shared.subs.add(this.onChips); },
  beforeUnmount() { shared.subs.delete(this.onChips); },
  computed: {
    states() { return [...new Set(this.properties.map(p => stateOf(p) || NO_STATE))].sort((a, b) => (a === NO_STATE) - (b === NO_STATE) || a.localeCompare(b)); },
    // Chips that still match a state in this list; none picked = every state
    active() { return this.chips.filter(s => this.states.includes(s)); },
    options() {
      const on = this.active, cur = this.modelValue;
      const list = this.properties
        .filter(p => !on.length || on.includes(stateOf(p) || NO_STATE) || p.id === cur)   // the current one always stays
        .map(p => ({ value: p.id, label: propertyLabel(p, this.properties) }));
      return [...this.before, ...list, ...this.after];
    }
  },
  methods: {
    shortState(s) { return s === NO_STATE ? s : shortState(s); },
    toggle(s) {
      const next = this.active.includes(s) ? this.active.filter(x => x !== s) : [...this.active, s];
      writeChips(next);
    }
  }
};
</script>

<style scoped>
.pp { display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.pp.pp-block { display: flex; width: 100%; }
.pp.pp-block > :last-child { flex: 1; min-width: 0; }
.pp-chips { display: inline-flex; gap: 4px; flex-wrap: wrap; }
.pp-chip { border: 1px solid var(--line, #e3e3e8); background: var(--card, #fff); color: inherit; border-radius: 999px; padding: 3px 10px; font-size: 12.5px; cursor: pointer; }
.pp-chip.on { background: var(--accent-soft, #fde7f6); border-color: var(--brand, #c33fa6); font-weight: 600; }
</style>
