<template>
  <div class="op" ref="root">
    <input v-if="searchable && open" ref="q" type="text" class="select op-input" v-model="q" :placeholder="current || placeholder || 'Type to search'" :aria-label="label" aria-expanded="true" autocomplete="off" @mousedown.prevent="open = false" @input="hot = 0" @keydown.down.prevent="move(1)" @keydown.up.prevent="move(-1)" @keydown.enter.prevent="enter" @keydown.esc.stop.prevent="open = false">
    <button type="button" class="select op-btn" :class="{ searching: searchable && open }" :disabled="disabled" :aria-expanded="String(open)" aria-haspopup="listbox" :aria-label="label" @click="toggle" @keydown.down.prevent="move(1)" @keydown.up.prevent="move(-1)" @keydown.enter.prevent="enter" @keydown="typeAhead">
      <span class="op-val" :class="{ ph: (!current && placeholder) || /^choose\b/i.test(current || '') }">{{ current || placeholder }}</span>
    </button>
    <ul class="op-pop" :class="{ up }" ref="pop" v-if="open" role="listbox" :aria-label="label" :aria-multiselectable="multiple ? 'true' : null" @keydown.esc="open = false">
      <li v-if="!list.length" class="op-none" role="presentation">No match</li>
      <!-- 20 Nov 2026: column-heads = a header row for column lists; it stays pinned while the list scrolls -->
      <li v-else-if="columns && columnHeads.length" class="op-head" role="presentation"><span class="op-cols" :style="{ gridTemplateColumns: columns }"><span v-for="(h, j) in columnHeads" :key="j">{{ h }}</span></span><span class="op-tick-sp"></span></li>
      <template v-for="(o, i) in list" :key="o.value">
        <li role="option" :aria-selected="String(isOn(o.value))" class="op-item" :class="{ on: isOn(o.value), hot: i === hot && !o.disabled, off: o.disabled, dim: o.dim }" :aria-disabled="String(!!o.disabled)"
          @mouseenter="hot = i" @click="!o.disabled && pick(o.value)">
          <span class="op-cols" v-if="columns && o.cols" :style="{ gridTemplateColumns: columns }"><template v-for="(c, j) in o.cols" :key="j">
            <!-- A column can be an icon: { icon: 'fileCheck', title: 'Bill saved' } (title shows on hover) -->
            <span v-if="c && typeof c === 'object'" class="op-ico" :title="c.title" :aria-label="c.title" role="img">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="m9 15 2 2 4-4" /></svg></span>
            <span v-else :title="c" :class="columnClasses[j]">{{ c }}</span>
          </template></span>
          <span v-else>{{ o.label }}</span>
          <!-- 23 Nov 2026 (Khairul): in column lists the tick space is always kept, so the picked row lines up with the others -->
          <svg v-if="isOn(o.value) || (columns && o.cols)" :class="{ 'op-tick-off': !isOn(o.value) }" viewBox="0 0 24 24" width="16" height="16" class="op-tick" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
        </li>
      </template>
      <li v-if="addLabel" class="op-addrow" role="presentation" @mousedown.stop>
        <div class="op-addform" v-if="adding">
          <input ref="addq" class="input" type="text" maxlength="60" v-model="newText" :placeholder="`Name of the new ${addLabel.toLowerCase()}`" @keydown.enter.prevent="submitAdd" @keydown.esc.stop.prevent="adding = false">
          <button type="button" class="btn btn-primary" @click="submitAdd">Add</button>
        </div>
        <button type="button" class="op-addbtn" v-else @click="startAdd">+ Add {{ addLabel.toLowerCase() }}</button>
      </li>
    </ul>
  </div>
</template>

<script>
// A drop-down in the theme colour (a native <select> list can't be styled).
//   <OptionPicker v-model="propertyId" :options="[{ value: 'all', label: 'All properties' }, ...]" label="Property" @change="load()" />
// Add `multiple` to pick several: v-model is then an array, the list stays open and each click ticks or unticks.
// Add `picked-first` (with multiple): each time the list opens, the ticked ones are listed first. While it is open nothing
// moves, so a row just ticked or unticked stays where it is until the list is opened again.
export default {
  props: { modelValue: { type: [String, Array], required: true }, multiple: { type: Boolean, default: false }, options: { type: Array, required: true }, label: { type: String, default: '' }, disabled: { type: Boolean, default: false }, searchable: { type: Boolean, default: false }, pickedFirst: { type: Boolean, default: false }, down: { type: Boolean, default: false }, display: { type: String, default: '' }, addLabel: { type: String, default: '' }, placeholder: { type: String, default: '' },
    // 16 Nov 2026: columns = a CSS grid-template-columns; an option with cols: [...] is shown as lined-up columns (search and the button still use label)
    columns: { type: String, default: '' },
    // 20 Nov 2026: header labels for the columns, and a class per column ('strong' = bold, 'muted' = grey)
    columnHeads: { type: Array, default: () => [] }, columnClasses: { type: Array, default: () => [] } },
  emits: ['update:modelValue', 'change', 'add'],
  data() { return { open: false, hot: 0, q: '', up: false, adding: false, newText: '', order: null }; },
  computed: {
    // The options in the order fixed when the list opened (picked-first), else as given
    sorted() {
      if (!this.order) return this.options;
      const at = new Map(this.order.map((v, i) => [v, i]));
      return [...this.options].sort((a, b) => (at.has(a.value) ? at.get(a.value) : 1e9) - (at.has(b.value) ? at.get(b.value) : 1e9));
    },
    list() {
      const k = this.norm(this.q);
      return k ? this.sorted.filter(o => this.norm(o.label).includes(k)) : this.sorted;
    },
    current() {
      if (this.display) return this.display;   // 20 Nov 2026: fixed text on the bar (e.g. "9 people chosen"), the page lists the picks itself
      if (this.multiple) return this.options.filter(o => this.isOn(o.value)).map(o => o.label).join(', ');
      return this.options.find(o => o.value === this.modelValue)?.label || '';
    }
  },
  mounted() { document.addEventListener('mousedown', this.away); },
  beforeUnmount() { document.removeEventListener('mousedown', this.away); },
  methods: {
    isOn(v) { return this.multiple ? (this.modelValue || []).includes(v) : v === this.modelValue; },
    norm(t) { return String(t || '').toLowerCase().replace(/[^a-z0-9]/g, ''); },
    toggle() {
      this.open = !this.open; this.q = ''; this.up = false; this.adding = false;
      if (this.open) { this.fixOrder(); this.$nextTick(() => this.place()); }
      if (this.open) { this.hot = Math.max(0, this.list.findIndex(o => this.isOn(o.value))); if (this.searchable) this.$nextTick(() => this.$refs.q?.focus()); }
    },
    // Opens upward when the list would run off the bottom of the screen and there is more room above
    place() {
      const pop = this.$refs.pop, root = this.$refs.root;
      if (!pop || !root) return;
      // 20 Nov 2026: `down` always opens below (the page scrolls to show it)
      if (this.down) { this.up = false; pop.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); return; }
      const r = root.getBoundingClientRect(), h = Math.min(pop.scrollHeight + 14, 340);
      // Any ancestor that clips (a table, a form card) would cut the list off, so only flip up when it fits inside that ancestor
      let clipTop = 0;
      for (let el = root.parentElement; el && el !== document.body; el = el.parentElement) {
        const o = getComputedStyle(el);
        if (/hidden|auto|scroll|clip/.test(o.overflowY)) { clipTop = el.getBoundingClientRect().top; break; }
      }
      const above = r.top - clipTop;
      this.up = r.bottom + 6 + h > window.innerHeight - 8 && r.top > window.innerHeight - r.bottom && above >= h;
    },
    enter() { if (!this.open) { this.toggle(); return; } const o = this.list[this.hot]; if (o && !o.disabled) this.pick(o.value); },
    typeAhead(e) {
      if (!this.searchable || e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1 || e.key === ' ' && !this.open) return;
      e.preventDefault();
      if (!this.open) { this.open = true; this.q = ''; this.up = false; this.fixOrder(); this.$nextTick(() => this.place()); }
      this.q += e.key; this.hot = 0;
      this.$nextTick(() => this.$refs.q?.focus());
    },
    startAdd() { this.adding = true; this.newText = this.q.trim(); this.$nextTick(() => this.$refs.addq?.focus()); },
    submitAdd() { const t = this.newText.trim(); if (!t) return; this.$emit('add', t); this.adding = false; this.open = false; this.q = ''; },
    // A click on the search box of an open list closes it, like a second click on the closed box opens it (13 Nov 2026)
    // picked-first: ticked options first, the rest after, each keeping the given order. Fixed until the list opens again.
    fixOrder() {
      if (!this.pickedFirst || !this.multiple) { this.order = null; return; }
      const on = this.options.filter(o => this.isOn(o.value)), off = this.options.filter(o => !this.isOn(o.value));
      this.order = [...on, ...off].map(o => o.value);
    },
    away(e) { if (this.open && !this.$refs.root.contains(e.target)) this.open = false; },
    move(d) {
      if (!this.open) { this.toggle(); return; }
      if (!this.list.length) return;
      this.hot = (this.hot + d + this.list.length) % this.list.length;
    },
    pick(v) {
      if (this.multiple) {
        const now = this.modelValue || [], next = now.includes(v) ? now.filter(x => x !== v) : [...now, v];
        this.$emit('update:modelValue', next);
        this.$nextTick(() => this.$emit('change', next));
        return;
      }
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
.op-addrow { position: sticky; bottom: -6px; background: var(--surface); border-top: 1px solid var(--line); margin-top: 4px; padding: 6px 0 2px; }
.op-addbtn { width: 100%; text-align: left; background: none; border: 0; padding: 9px 12px; border-radius: 8px; font-size: 13px; font-weight: 600; color: var(--accent); cursor: pointer; }
.op-addbtn:hover { background: var(--accent-soft); }
.op-addform { display: flex; gap: 8px; padding: 2px 4px; }
.op-addform .input { flex: 1; min-width: 0; height: 36px; }
.op-addform .btn { height: 36px; }
.op-val.ph { color: var(--muted); font-weight: 400; }
.op-none { padding: 9px 12px; font-size: 13px; color: var(--muted); }
.op-head { position: sticky; top: -6px; z-index: 1; display: flex; padding: 10px 12px 8px; margin: -6px -6px 4px; background: var(--surface); border-bottom: 1px solid var(--border);
  font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); }
.op-head .op-cols { padding: 0 6px; }
.op-cols > .strong { font-weight: 600; }
.op-cols > .muted { color: var(--muted); }
.op-item.on .op-cols > .muted, .op-item.hot .op-cols > .muted { color: inherit; }
.op-cols { flex: 1; min-width: 0; display: grid; gap: 14px; }
.op-cols > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* A thin line between columns, and between rows */
.op-cols > span + span { border-left: 1px solid var(--border); padding-left: 14px; }
.op-cols > span:empty { border-left: 0; }
.op-cols > .op-ico { display: flex; align-items: center; justify-content: center; color: var(--green); overflow: visible; }
.op-item:has(.op-cols) + .op-item:has(.op-cols) { box-shadow: inset 0 1px 0 var(--border); }
.op-item.hot:has(.op-cols), .op-item.hot:has(.op-cols) + .op-item { box-shadow: none; }
.op-item.off { color: var(--muted); opacity: .6; cursor: not-allowed; }
.op-item.dim { color: var(--muted); opacity: .6; }   /* 23 Nov 2026: shown but greyed (a cancelled booking), still pickable */
.op-item.hot { background: var(--accent-soft); color: var(--accent); }
.op-item.on { color: var(--accent); font-weight: 700; }
.op-tick { flex: none; }
.op-tick-off { visibility: hidden; }
.op-tick-sp { flex: none; width: 16px; margin-left: 16px; }
</style>
