<template>
  <RouterLink v-if="item.to" class="nav-item" :class="{ active: item.label === active, collapsed }" :to="item.to" :title="collapsed ? item.label : null">
    <svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true" v-html="svg"></svg>
    <span class="nav-label">{{ item.label }}</span>
  </RouterLink>
  <a v-else class="nav-item" :class="{ collapsed }" href="#" :title="collapsed ? item.label : null" @click.prevent="$emit('soon', item.label)">
    <svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true" v-html="svg"></svg>
    <span class="nav-label">{{ item.label }}</span>
  </a>
</template>

<script>
import { NAV_ICONS } from './NavIcons.js';

export default {
  props: { item: Object, active: String, collapsed: Boolean },
  emits: ['soon'],
  computed: {
    svg() { return NAV_ICONS[this.item.icon] || NAV_ICONS.dot; }
  }
};
</script>

<style scoped>
/* One easing curve for every sidebar movement, so hover, active and collapse all feel the same. */
.nav-item {
  --nav-ease: cubic-bezier(.4, 0, .2, 1);
  display: flex; align-items: center; gap: 10px;
  transition: gap .28s var(--nav-ease), background-color .18s ease, color .18s ease, padding .28s var(--nav-ease);
}
.nav-icon {
  width: 18px; height: 18px; flex-shrink: 0;
  fill: none; stroke: currentColor; stroke-width: 2;
  stroke-linecap: round; stroke-linejoin: round;
  opacity: .75;
  transition: opacity .18s ease, transform .2s var(--nav-ease);
}
.nav-item:hover .nav-icon { opacity: 1; transform: translateX(2px); }
.nav-item.active .nav-icon { opacity: 1; transform: none; }
.nav-item:active .nav-icon { transform: scale(.92); }

/* The label slides and fades instead of just being cut off when the sidebar collapses. */
.nav-label {
  white-space: nowrap; overflow: hidden;
  max-width: 220px; opacity: 1; transform: translateX(0);
  transition: max-width .28s var(--nav-ease), opacity .2s ease .06s, transform .28s var(--nav-ease);
}
.nav-item.collapsed { gap: 0; justify-content: center; }
.nav-item.collapsed .nav-label {
  max-width: 0; opacity: 0; transform: translateX(-6px);
  transition: max-width .28s var(--nav-ease), opacity .12s ease, transform .2s var(--nav-ease);
}
.nav-item.collapsed:hover .nav-icon { transform: scale(1.08); }

@media (prefers-reduced-motion: reduce) {
  .nav-item, .nav-icon, .nav-label { transition: none !important; }
  .nav-item:hover .nav-icon, .nav-item.collapsed:hover .nav-icon { transform: none; }
}
</style>