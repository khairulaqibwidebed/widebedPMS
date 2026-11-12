<template>
  <!-- Round progress for uploads. Takes the colour of the text around it.
         <ProgressRing :value="pct" />          0–100
         <ProgressRing spinning />              no number known yet (keeps turning) -->
  <svg class="p-ring" :class="{ spinning }" :width="size" :height="size" viewBox="0 0 20 20" role="progressbar"
    :aria-valuenow="spinning ? null : Math.round(value)" aria-valuemin="0" aria-valuemax="100">
    <circle class="track" cx="10" cy="10" r="8" />
    <circle class="fill" cx="10" cy="10" r="8" :stroke-dasharray="C" :stroke-dashoffset="offset" />
  </svg>
</template>

<script>
const C = 2 * Math.PI * 8;
export default {
  props: { value: { type: Number, default: 0 }, size: { type: Number, default: 16 }, spinning: { type: Boolean, default: false } },
  data() { return { C }; },
  computed: { offset() { return this.spinning ? C * 0.7 : C * (1 - Math.min(100, Math.max(0, this.value)) / 100); } }
};
</script>
