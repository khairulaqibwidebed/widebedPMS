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
.nav-item { display: flex; align-items: center; gap: 10px; transition: gap .25s ease; }
.nav-icon {
  width: 18px; height: 18px; flex-shrink: 0;
  fill: none; stroke: currentColor; stroke-width: 2;
  stroke-linecap: round; stroke-linejoin: round;
  opacity: .75;
}
.nav-item.active .nav-icon, .nav-item:hover .nav-icon { opacity: 1; }

.nav-label {
  white-space: nowrap; overflow: hidden;
  max-width: 220px; opacity: 1;
  transition: max-width .25s ease, opacity .2s ease;
}
.nav-item.collapsed { gap: 0; justify-content: center; }
.nav-item.collapsed .nav-label { max-width: 0; opacity: 0; }
</style>
