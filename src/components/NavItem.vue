<template>
  <RouterLink v-if="item.to" class="nav-item" :class="{ active: item.label === active }" :to="item.to">
    <svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true" v-html="svg"></svg>
    <span class="nav-label">{{ item.label }}</span>
  </RouterLink>
  <a v-else class="nav-item" href="#" @click.prevent="$emit('soon', item.label)">
    <svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true" v-html="svg"></svg>
    <span class="nav-label">{{ item.label }}</span>
  </a>
</template>

<script>
import { NAV_ICONS } from './NavIcons.js';

export default {
  props: { item: Object, active: String },
  emits: ['soon'],
  computed: {
    svg() { return NAV_ICONS[this.item.icon] || NAV_ICONS.dot; }
  }
};
</script>

<style scoped>
.nav-item { display: flex; align-items: center; gap: 10px; }
.nav-icon {
  width: 18px; height: 18px; flex-shrink: 0;
  fill: none; stroke: currentColor; stroke-width: 2;
  stroke-linecap: round; stroke-linejoin: round;
  opacity: .75;
}
.nav-item.active .nav-icon, .nav-item:hover .nav-icon { opacity: 1; }
</style>