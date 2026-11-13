<template>
  <!-- One property drop-down for every page (data access by property, 12 Nov 2026).
       Lists only the properties passed in (pages load "my properties" through lib/property-scope.js; Directors get all).
       Labels "Name (CODE)", plus " · State" when the same code is used in another state.
       13 Nov 2026 (Khairul): the state chips (Johor, KL...) are removed; access by property already narrows the list. -->
  <span class="pp" :class="{ 'pp-block': block }">
    <OptionPicker :class="pickerClass" :model-value="modelValue" :options="options" :label="label" :disabled="disabled" :placeholder="placeholder" searchable
      @update:model-value="v => $emit('update:modelValue', v)" @change="v => $emit('change', v)" />
  </span>
</template>

<script>
import OptionPicker from '@/components/OptionPicker.vue';
import { propertyLabel } from '@/lib/states.js';

// The old chips choice (wb.stateChips) is no longer read; clear it so no hidden filter is left behind
try { localStorage.removeItem('wb.stateChips'); } catch (_) { /* private mode */ }

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
  computed: {
    options() {
      const list = this.properties.map(p => ({ value: p.id, label: propertyLabel(p, this.properties) }));
      return [...this.before, ...list, ...this.after];
    }
  }
};
</script>

<style scoped>
.pp { display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.pp.pp-block { display: flex; width: 100%; }
.pp.pp-block > :last-child { flex: 1; min-width: 0; }
</style>
