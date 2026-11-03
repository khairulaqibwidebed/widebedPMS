<template>
  <div class="rating-picker" :class="'variant-' + variant" role="radiogroup" :aria-label="label">
    <label v-for="n in max" :key="n" class="rating-opt" :class="{ on: modelValue === n, off: disabled }">
      <input type="radio" :name="name" :value="n" :checked="modelValue === n" :disabled="disabled" @change="$emit('update:modelValue', n)">
      {{ n }}
    </label>
  </div>
</template>

<script setup>
defineProps({
  modelValue: { type: Number, default: null },
  max: { type: Number, default: 5 },
  disabled: { type: Boolean, default: false },
  label: { type: String, default: 'Rating' },
  name: { type: String, default: () => 'rating-' + Math.random().toString(36).slice(2) },
  // 'circle' (default, used on the KPI page): small round numbered chips.
  // 'buttons' (used on the COH questionnaire): five equal-width touch-friendly buttons.
  variant: { type: String, default: 'circle' }
});
defineEmits(['update:modelValue']);
</script>

<style scoped>
.rating-picker.variant-circle { display: inline-flex; gap: 6px; }
.variant-circle .rating-opt {
  position: relative; display: inline-flex; align-items: center; justify-content: center;
  width: 32px; height: 32px; border-radius: 999px; border: 1px solid var(--border);
  font-size: 13px; font-weight: 600; cursor: pointer; user-select: none;
}
.variant-circle .rating-opt.on { background: var(--accent); border-color: var(--accent); color: #fff; }

.rating-picker.variant-buttons { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; width: 100%; }
.variant-buttons .rating-opt {
  position: relative; display: flex; align-items: center; justify-content: center;
  min-height: 40px; border-radius: 10px; border: 1px solid var(--coh-border, var(--border));
  background: var(--coh-surface, transparent); color: var(--coh-text, var(--text));
  font-size: 14px; font-weight: 600; cursor: pointer; user-select: none;
  transition: background .18s var(--ease, ease), border-color .18s var(--ease, ease), color .18s var(--ease, ease), transform .1s ease;
}
.variant-buttons .rating-opt:hover:not(.off) { border-color: var(--coh-accent, var(--accent)); }
.variant-buttons .rating-opt:active:not(.off) { transform: scale(.97); }
.variant-buttons .rating-opt.on { background: var(--coh-accent, var(--accent)); border-color: var(--coh-accent, var(--accent)); color: #fff; }

.rating-opt input { position: absolute; opacity: 0; width: 100%; height: 100%; margin: 0; cursor: pointer; }
.rating-opt.off { opacity: .6; cursor: default; }
.rating-opt.off input { cursor: default; }
</style>
