<template>
  <div class="sip" role="radiogroup" :aria-label="label">
    <button v-for="n in SOP_ICONS" :key="n" type="button" class="sip-btn" :class="{ on: n === modelValue }" role="radio"
      :aria-checked="n === modelValue" :aria-label="n":disabled="disabled" @click="$emit('update:modelValue', n)">
      <SopIcon :name="n" />
    </button>
  </div>
</template>

<script>
// Icon picker for an SOP: a grid of the SOP_ICONS. Used in "+ New SOP" and on the SOP page (HR and Directors).
import SopIcon from './SopIcon.vue';
import { SOP_ICONS } from '@/pages/HR/sops-data.js';

export default {
  components: { SopIcon },
  props: { modelValue: { type: String, default: 'fileText' }, disabled: Boolean, label: { type: String, default: 'SOP icon' } },
  emits: ['update:modelValue'],
  data() { return { SOP_ICONS }; }
};
</script>

<style scoped>
.sip { display: grid; grid-template-columns: repeat(auto-fill, minmax(38px, 1fr)); gap: 6px; }
.sip-btn { height: 38px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); color: var(--text-2);
  display: grid; place-items: center; cursor: pointer; padding: 0; transition: border-color .15s, background .15s, color .15s, transform .15s; }
.sip-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
.sip-btn.on { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
.sip-btn:active:not(:disabled) { transform: scale(.94); }
.sip-btn:disabled { opacity: .5; cursor: default; }
.sip-btn :deep(.sop-icon) { width: 18px; height: 18px; }
@media (prefers-reduced-motion: reduce) { .sip-btn { transition: none; } }
</style>
