<template>
  <svg class="sop-icon" :class="{ 'nudge-r': name === 'wallet' }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true" v-html="NAV_ICONS[name] || NAV_ICONS.fileText"></svg>
</template>

<script>
// One SOP icon (a NavIcons.js name). Size it from the parent with width/height.
import { NAV_ICONS } from '@/components/NavIcons.js';
export default { props: { name: { type: String, default: 'fileText' } }, data() { return { NAV_ICONS }; } };
</script>

<style scoped>
/* The wallet drawing is lopsided (body left, clasp right), so it looks off-centre; shift it 1px right. */
.nudge-r { transform: translateX(1px); }
</style>
