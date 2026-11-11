<template>
  <span class="fi" v-if="list.length" @mouseenter="show" @mouseleave="open = false">
    <button type="button" class="fi-btn" ref="btn" :aria-label="`How ${title} is worked out`" :aria-expanded="String(open)"
      @click.stop="open ? (open = false) : show()" @focus="show" @blur="open = false" @keydown.esc.stop="open = false">
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
    </button>
    <Teleport to="body">
      <div class="fi-pop" ref="pop" v-if="open" role="tooltip" :style="pos">
        <template v-for="t in list" :key="t.id">
          <div class="fi-title">{{ `${t.label}: how it is worked out` }}</div>
          <ol class="fi-steps"><template v-for="(f, i) in t.formula" :key="i"><li>{{ f }}</li></template></ol>
        </template>
        <div class="fi-note">Total % = Service % + Utility %. A unit's own rate on the Units tab wins over the arrangement.</div>
      </div>
    </Teleport>
  </span>
</template>

<script>
// A small (i) icon that shows a fee type's formula (FEE_TYPES[type].formula in lib/fee-types.js) on hover, focus or tap.
// With section instead of type it shows every type of that stay length (Fees & rates card heads).
// The box is placed on <body> so table and popup edges can't cut it off.
//   <FormulaInfo type="revenue" />   or   <FormulaInfo section="short" />
import { FEE_TYPES, typesFor } from '@/lib/fee-types.js';

export default {
  props: { type: { type: String, default: '' }, section: { type: String, default: '' } },
  data() { return { open: false, pos: {} }; },
  computed: {
    list() { return (this.section ? typesFor(this.section) : [FEE_TYPES[this.type]]).filter(t => t && t.formula); },
    title() { return this.list.map(t => t.label).join(', '); }
  },
  mounted() { document.addEventListener('mousedown', this.away); window.addEventListener('scroll', this.hide, true); },
  beforeUnmount() { document.removeEventListener('mousedown', this.away); window.removeEventListener('scroll', this.hide, true); },
  methods: {
    show() {
      const r = this.$refs.btn?.getBoundingClientRect(); if (!r) return;
      const w = Math.min(this.list.length > 1 ? 380 : 340, window.innerWidth - 24);
      const left = Math.max(12, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 12));
      const below = window.innerHeight - r.bottom > (this.list.length > 1 ? 420 : 220);
      this.pos = { left: `${left}px`, width: `${w}px`, ...(below ? { top: `${r.bottom + 8}px` } : { bottom: `${window.innerHeight - r.top + 8}px` }) };
      this.open = true;
    },
    hide(e) { if (!this.$refs.pop?.contains(e?.target)) this.open = false; },
    away(e) { if (this.open && !this.$el.contains(e.target)) this.open = false; }
  }
};
</script>

<style scoped>
.fi { display: inline-flex; vertical-align: middle; margin-left: 6px; }
.fi-btn { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; padding: 0; border: 0; border-radius: 50%;
  background: transparent; color: var(--muted); cursor: help; }
.fi-btn:hover, .fi-btn:focus-visible, .fi-btn[aria-expanded="true"] { color: var(--accent); background: var(--accent-soft); outline: none; }
.fi-pop { position: fixed; z-index: 1000; box-sizing: border-box; padding: 12px 14px; background: var(--surface); color: var(--text);
  border: 1px solid var(--border); border-radius: 12px; box-shadow: 0 10px 30px rgba(0, 0, 0, .14); font-size: 12.5px; line-height: 1.45; text-align: left; white-space: normal; }
.fi-title { font-weight: 700; margin-bottom: 6px; color: var(--accent); }
.fi-steps + .fi-title { margin-top: 10px; }
.fi-pop { max-height: calc(100vh - 24px); overflow: auto; }
.fi-steps { margin: 0; padding-left: 18px; }
.fi-steps li { margin: 2px 0; }
.fi-note { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--line); color: var(--muted); font-size: 12px; }
</style>
