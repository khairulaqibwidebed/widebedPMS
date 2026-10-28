<template>
  <button type="button" class="btn refresh-btn" :disabled="busy" :title="'Saved copies of properties, units and owners are used for up to 30 minutes. Click to read everything fresh.'" @click="refresh">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" :class="{ spin: busy }"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/></svg>
    <span>{{ busy ? 'Refreshing…' : 'Refresh' }}</span>
    <small v-if="ago">{{ ago }}</small>
  </button>
</template>

<script>
// "Refresh" for pages that use saved copies (lib/cache.js). The page passes what it does next: @refresh="reload()".
import { cacheState, clearCache } from '@/lib/cache.js';
export default {
  emits: ['refresh'],
  data() { return { busy: false, now: Date.now(), timer: null }; },
  computed: {
    ago() {
      const at = cacheState.loadedAt;
      if (!at) return '';
      const m = Math.floor((this.now - at) / 60000);
      return m < 1 ? 'just now' : `${m} min ago`;
    }
  },
  mounted() { this.timer = setInterval(() => { this.now = Date.now(); }, 30000); },
  beforeUnmount() { clearInterval(this.timer); },
  methods: {
    async refresh() {
      this.busy = true;
      await clearCache();
      this.$emit('refresh');
      setTimeout(() => { this.busy = false; this.now = Date.now(); }, 600);
    }
  }
};
</script>

<style scoped>
.refresh-btn { display: inline-flex; align-items: center; gap: 6px; }
.refresh-btn small { color: var(--muted); font-size: 12px; }
.spin { animation: rb-spin .8s linear infinite; }
@keyframes rb-spin { to { transform: rotate(360deg); } }
</style>
