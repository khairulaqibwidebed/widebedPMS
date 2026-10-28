<template>
  <div class="cb" ref="root">
    <input :id="id" class="input" type="text" autocomplete="off" :placeholder="placeholder" :value="modelValue"
      role="combobox" :aria-expanded="String(open && shown.length > 0)" aria-autocomplete="list"
      @input="onInput" @focus="open = true" @keydown.down.prevent="move(1)" @keydown.up.prevent="move(-1)"
      @keydown.enter="enter" @keydown.esc="open = false">
    <ul class="cb-pop" v-if="open && modelValue.trim() && !shown.length" role="status"><li class="cb-more">No unit matches. What you typed is kept as it is.</li></ul>
    <ul class="cb-pop" v-if="open && shown.length" role="listbox">
      <template v-for="(o, i) in shown" :key="o.value">
        <li role="option" class="cb-item" :class="{ hot: i === hot }" @mousedown.prevent="pick(o.value)" @mouseenter="hot = i">
          <b>{{ o.value }}</b><small v-if="o.hint">{{ o.hint }}</small>
        </li>
      </template>
      <li class="cb-more" v-if="matches.length > shown.length">{{ `… ${matches.length - shown.length} more, keep typing` }}</li>
    </ul>
  </div>
</template>

<script>
// A text box that suggests matches in the theme colour (a native <datalist> can't be styled).
// The typed text is kept as it is, so a value that isn't in the list is still allowed.
//   <ComboInput v-model="unit" :options="[{ value: 'A-09-23A', hint: 'Property name' }, ...]" placeholder="..." id="rUnit" />
export default {
  props: { modelValue: { type: String, default: '' }, options: { type: Array, default: () => [] }, placeholder: { type: String, default: '' }, id: { type: String, default: undefined }, max: { type: Number, default: 8 } },
  emits: ['update:modelValue'],
  data() { return { open: false, hot: -1 }; },
  computed: {
    matches() { const q = this.modelValue.trim().toLowerCase(); return this.options.filter(o => !q || o.value.toLowerCase().includes(q) || (o.hint || '').toLowerCase().includes(q)); },
    shown() { return this.matches.slice(0, this.max); }
  },
  mounted() { document.addEventListener('mousedown', this.away); },
  beforeUnmount() { document.removeEventListener('mousedown', this.away); },
  methods: {
    away(e) { if (this.open && !this.$refs.root.contains(e.target)) this.open = false; },
    onInput(e) { this.$emit('update:modelValue', e.target.value); this.open = true; this.hot = -1; },
    move(d) { this.open = true; if (this.shown.length) this.hot = (this.hot + d + this.shown.length) % this.shown.length; },
    enter(e) { if (this.open && this.hot >= 0 && this.shown[this.hot]) { e.preventDefault(); this.pick(this.shown[this.hot].value); } },
    pick(v) { this.$emit('update:modelValue', v); this.open = false; this.hot = -1; }
  }
};
</script>

<style scoped>
.cb { position: relative; }
.cb-pop { position: absolute; left: 0; right: 0; top: calc(100% + 6px); z-index: 30; max-height: 300px; overflow: auto; margin: 0; padding: 6px; list-style: none;
  background: var(--surface); border: 1px solid var(--border); border-radius: 12px; box-shadow: 0 10px 30px rgba(0, 0, 0, .12); }
.cb-item { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 9px 12px; border-radius: 8px; font-size: 13px; color: var(--text); cursor: pointer; }
.cb-item b { font-weight: 600; }
.cb-item small { color: var(--muted); font-size: 12px; }
.cb-item.hot { background: var(--accent-soft); color: var(--accent); }
.cb-item.hot small { color: var(--accent); }
.cb-more { padding: 8px 12px 4px; font-size: 12px; color: var(--muted); }
</style>
