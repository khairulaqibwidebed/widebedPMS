<template>
  <div class="fee-type-picker">
    <OptionPicker class="ftp-pick" :id="id" :model-value="modelValue" :options="options" :disabled="disabled" label="Fee type"
      placeholder="Choose a type" @update:model-value="$emit('update:modelValue', $event)" />
    <p class="help explain" v-if="current">{{ current.explain }}<FormulaInfo :type="current.id" /></p>
  </div>
</template>

<script>
// Fee type drop-down (the app's themed OptionPicker, not a native select). Shows only the types for one stay length
// (section) from FEE_TYPES (lib/fee-types.js), with the chosen type's explain line under it. A new type added to
// FEE_TYPES shows here by itself.
import { FEE_TYPES, typesFor } from '@/lib/fee-types.js';
import OptionPicker from '@/components/OptionPicker.vue';
import FormulaInfo from '@/components/FormulaInfo.vue';

export default {
  components: { OptionPicker, FormulaInfo },
  props: {
    section: { type: String, default: '' },        // 'short' | 'mid' | 'long'; empty = every type
    modelValue: { type: String, default: '' },
    disabled: { type: Boolean, default: false },
    id: { type: String, default: 'feeType' },
    // 13 Nov 2026: only = offer just these type ids; exclude = leave these out (a type already chosen still shows)
    only: { type: Array, default: null },
    exclude: { type: Array, default: () => [] }
  },
  emits: ['update:modelValue'],
  computed: {
    types() {
      const all = this.section ? typesFor(this.section) : Object.values(FEE_TYPES);
      return all.filter(t => (!this.only || this.only.includes(t.id)) && (!this.exclude.includes(t.id) || t.id === this.modelValue));
    },
    options() { return this.types.map(t => ({ value: t.id, label: t.label })); },
    current() { return FEE_TYPES[this.modelValue] || null; }
  }
};
</script>

<style scoped>
.ftp-pick { display: block; width: 100%; }
.ftp-pick :deep(.op-btn) { width: 100%; min-height: 40px; }
.ftp-pick :deep(.op-pop) { max-width: none; width: 100%; }
.explain { margin: 6px 0 0; }
</style>
