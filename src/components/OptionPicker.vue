<template>
  <div class="op" ref="root">
    <input v-if="searchable && open" ref="q" type="text" class="select op-input" v-model="q" :placeholder="current || 'Type to search'" :aria-label="label" aria-expanded="true" autocomplete="off" @input="hot = 0" @keydown.down.prevent="move(1)" @keydown.up.prevent="move(-1)" @keydown.enter.prevent="enter" @keydown.esc.stop.prevent="open = false">
    <button type="button" class="select op-btn" :class="{ searching: searchable && open }" :disabled="disabled" :aria-expanded="String(open)" aria-haspopup="listbox" :aria-label="label" @click="toggle" @keydown.down.prevent="move(1)" @keydown.up.prevent="move(-1)" @keydown.enter.prevent="enter" @keydown="typeAhead">
      <span class="op-val">{{ current }}</span>
    </button>
    <ul class="op-pop" :class="{ up }" ref="pop" v-if="open" role="listbox" :aria-label="label" @keydown.esc="open = false">
      <li v-if="!list.length" class="op-none" role="presentation">No match</li>
      <template v-for="(o, i) in list" :key="o.value">
        <li role="option" :aria-selected="String(o.value === modelValue)" class="op-item" :class="{ on: o.value === modelValue, hot: i === hot && !o.disabled, off: o.disabled }" :aria-disabled="String(!!o.disabled)"
          @mouseenter="hot = i" @click="!o.disabled && pick(o.value)">
          <span>{{ o.label }}</span>
          <svg v-if="o.value === modelValue" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
        </li>
      </template>
    </ul>
  </div>
</template>

<script>
// A drop-down in the theme colour (a native <select> list can't be styled).
//   <OptionPicker v-model="propertyId" :options="[{ value: 'all', label: 'All properties' }, ...]" label="Property" @change="load()" />
export default {
  props: { modelValue: { type: String, required: true }, options: { type: Array, required: true }, label: { type: String, default: '' }, disabled: { type: Boolean, default: false }, searchable: { type: Boolean, default: false } },
  emits: ['update:modelValue', 'change'],
  data() { return { open: false, hot: 0, q: '', up: false }; },
  computed: {
    list() {
      const k = this.norm(this.q);
      return k ? this.options.filter(o => this.norm(o.label).includes(k)) : this.options;
    },
    current() { return this.options.find(o => o.value === this.modelValue)?.label || ''; }
  },
  mounted() { document.addEventListener('mousedown', this.away); },
  beforeUnmount() { document.removeEventListener('mousedown', this.away); },
  methods: {
    norm(t) { return String(t || '').toLowerCase().replace(/[^a-z0-9]/g, ''); },
    toggle() {
      this.open = !this.open; this.q = ''; this.up = false;
      if (this.open) this.$nextTick(() => this.place());
      if (this.open) { this.hot = Math.max(0, this.options.findIndex(o => o.value === this.modelValue)); if (this.searchable) this.$nextTick(() => this.$refs.q?.focus()); }
    },
    // Opens upward when the list would run off the bottom of the screen and there is more room above
    place() {
      const pop = this.$refs.pop, root = this.$refs.root;
      if (!pop || !root) return;
      const r = root.getBoundingClientRect(), h = Math.min(pop.scrollHeight + 14, 340);
      this.up = r.bottom + 6 + h > window.innerHeight - 8 && r.top > window.innerHeight - r.bottom;
    },
    enter() { if (!this.open) { this.toggle(); return; } const o = this.list[this.hot]; if (o && !o.disabled) this.pick(o.value); },
    typeAhead(e) {
      if (!this.searchable || e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1 || e.key === ' ' && !this.open) return;
      e.preventDefault();
      if (!this.open) { this.open = true; this.q = ''; this.up = false; this.$nextTick(() => this.place()); }
      this.q += e.key; this.hot = 0;
      this.$nextTick(() => this.$refs.q?.focus());
    },
    away(e) { if (this.open && !this.$refs.root.contains(e.target)) this.open = false; },
    move(d) {
      if (!this.open) { this.toggle(); return; }
      if (!this.list.length) return;
      this.hot = (this.hot + d + this.list.length) % this.list.length;
    },
    pick(v) {
      this.open = false; this.q = '';
      if (v === this.modelValue) return;
      this.$emit('update:modelValue', v);
      this.$nextTick(() => this.$emit('change', v));
    }
  }
};
</script>

<style scoped>
.op { position: relative; display: inline-block; }
.op-btn { display: block; text-align: left; white-space: nowrap; }
.op-val { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.op-pop { position: absolute; left: 0; top: calc(100% + 6px); z-index: 30; min-width: 100%; width: max-content; max-width: 320px; max-height: 340px; overflow: auto;
  margin: 0; padding: 6px; list-style: none; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; box-shadow: 0 10px 30px rgba(0, 0, 0, .12); }
.op-pop.up { top: auto; bottom: calc(100% + 6px); }
.op-item { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 9px 12px; border-radius: 8px; font-size: 13px; font-weight: 500; color: var(--text); cursor: pointer; }
.op-input { z-index: 1; position: absolute; inset: 0; width: 100%; height: 100%; box-sizing: border-box; margin: 0; font: inherit; font-weight: 600; font-size: 13px; outline: 0; border-color: var(--accent); background-color: var(--surface); }
.op-btn.searching .op-val { visibility: hidden; }
.op-input::placeholder { color: var(--text); opacity: 1; font-weight: 600; }
.op-none { padding: 9px 12px; font-size: 13px; color: var(--muted); }
.op-item.off { color: var(--muted); opacity: .6; cursor: not-allowed; }
.op-item.hot { background: var(--accent-soft); color: var(--accent); }
.op-item.on { color: var(--accent); font-weight: 700; }
</style>
