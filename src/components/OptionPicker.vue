<template>
  <div class="op" ref="root">
    <button type="button" class="select op-btn" :disabled="disabled" :aria-expanded="String(open)" aria-haspopup="listbox" :aria-label="label" @click="toggle" @keydown.down.prevent="move(1)" @keydown.up.prevent="move(-1)" @keydown.enter.prevent="open ? pick(options[hot].value) : toggle()">
      <span class="op-val">{{ current }}</span>
    </button>
    <ul class="op-pop" v-if="open" role="listbox" :aria-label="label" @keydown.esc="open = false">
      <template v-for="(o, i) in options" :key="o.value">
        <li role="option" :aria-selected="String(o.value === modelValue)" class="op-item" :class="{ on: o.value === modelValue, hot: i === hot }"
          @mouseenter="hot = i" @click="pick(o.value)">
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
  props: { modelValue: { type: String, required: true }, options: { type: Array, required: true }, label: { type: String, default: '' }, disabled: { type: Boolean, default: false } },
  emits: ['update:modelValue', 'change'],
  data() { return { open: false, hot: 0 }; },
  computed: { current() { return this.options.find(o => o.value === this.modelValue)?.label || ''; } },
  mounted() { document.addEventListener('mousedown', this.away); },
  beforeUnmount() { document.removeEventListener('mousedown', this.away); },
  methods: {
    toggle() { this.open = !this.open; if (this.open) this.hot = Math.max(0, this.options.findIndex(o => o.value === this.modelValue)); },
    away(e) { if (this.open && !this.$refs.root.contains(e.target)) this.open = false; },
    move(d) {
      if (!this.open) { this.toggle(); return; }
      this.hot = (this.hot + d + this.options.length) % this.options.length;
    },
    pick(v) {
      this.open = false;
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
.op-item { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 9px 12px; border-radius: 8px; font-size: 13px; font-weight: 500; color: var(--text); cursor: pointer; }
.op-item.hot { background: var(--accent-soft); color: var(--accent); }
.op-item.on { color: var(--accent); font-weight: 700; }
</style>
