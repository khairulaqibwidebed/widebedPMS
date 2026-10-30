<template>
  <div class="ty card">
    <div class="ty-icon" aria-hidden="true">
      <svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24" /><path d="M15 27l7 7 15-16" /></svg>
    </div>
    <h1>{{ title }}</h1>
    <p class="ty-msg">{{ message }}</p>
    <p class="ty-ref" v-if="reference">Reference <b>{{ reference }}</b></p>
    <div class="ty-actions"><slot /></div>
    <p class="ty-note" v-if="note">{{ note }}</p>
  </div>
</template>

<script setup>
// "Thank you" screen after a form is sent (inside the PMS and on the public fill-in page).
defineProps({ title: { type: String, default: 'Thank you!' }, message: String, reference: String, note: String });
</script>

<style scoped>
.ty { max-width: 560px; margin: 24px auto; padding: 36px 28px; text-align: center; display: grid; justify-items: center; gap: 10px; }
.ty h1 { margin: 6px 0 0; font-size: 26px; letter-spacing: -.01em; }
.ty-msg { color: var(--text-2); margin: 0; max-width: 440px; line-height: 1.55; }
.ty-ref { margin: 4px 0 0; font-size: 13px; color: var(--muted); }
.ty-ref b { color: var(--text); letter-spacing: .04em; }
.ty-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: 12px; }
.ty-actions :deep(.btn) { height: 44px; padding: 0 20px; }
.ty-note { color: var(--muted); font-size: 12px; margin: 8px 0 0; }
.ty-icon svg { width: 76px; height: 76px; }
.ty-icon circle { fill: var(--green-soft); stroke: var(--green); stroke-width: 2; stroke-dasharray: 151; stroke-dashoffset: 151; animation: ty-draw .5s ease-out forwards; }
.ty-icon path { fill: none; stroke: var(--green); stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 40; stroke-dashoffset: 40; animation: ty-draw .35s .4s ease-out forwards; }
@keyframes ty-draw { to { stroke-dashoffset: 0; } }
@media (prefers-reduced-motion: reduce) { .ty-icon circle, .ty-icon path { animation: none; stroke-dashoffset: 0; } }
</style>
