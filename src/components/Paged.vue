<template>
  <slot :pageRows="pageRows" />
  <nav class="pager" v-if="list.length > minSize" aria-label="Pages">
    <span class="pager-left"><span class="pager-info">{{ `Showing ${from}–${to} of ${list.length}` }}</span>
      <!-- sizes (23 Nov 2026): a rows-per-page choice beside the page numbers; the page emits update:size and remembers it -->
      <span class="pg-size" v-if="sizes.length" role="radiogroup" aria-label="Rows per page"><span class="pager-info">Rows</span>
        <button class="pg" type="button" role="radio" v-for="n in sizes" :key="n" :class="{ on: n === size }" :aria-checked="n === size" @click="$emit('update:size', n)">{{ n }}</button></span></span>
    <span class="pager-btns">
      <button class="pg" type="button" :disabled="cur === 1" @click="go(cur - 1)" aria-label="Previous page">‹ Prev</button>
      <template v-for="(p, i) in nums" :key="i">
        <span class="pg-gap" v-if="p === '…'">…</span>
        <button class="pg" type="button" v-else :class="{ on: p === cur }" :aria-current="p === cur ? 'page' : null" @click="go(p)">{{ p }}</button>
      </template>
      <button class="pg" type="button" :disabled="cur === last" @click="go(cur + 1)" aria-label="Next page">Next ›</button>
    </span>
  </nav>
</template>

<script>
// Shows a list 10 rows at a time with a pager underneath. Wrap the table:
//   <Paged :items="shown()" v-slot="{ pageRows }"> ... v-for="x in pageRows" ... </Paged>
// Goes back to page 1 when the list changes size (a new search or filter), unless keep-page is set.
// Emits 'page' ({ page, last }) when the user changes page, so a list can fetch more as its end is reached.
// sizes = e.g. [10, 25, 50]: shows a rows-per-page choice in the pager (emits 'update:size'); the pager then shows once the
// list is longer than the smallest size, so the choice can be changed back.
export default {
  props: { items: { type: Array, default: () => [] }, size: { type: Number, default: 10 }, keepPage: { type: Boolean, default: false }, sizes: { type: Array, default: () => [] } },
  emits: ['page', 'update:size'],
  data() { return { page: 1 }; },
  computed: {
    list() { return this.items || []; },
    minSize() { return this.sizes.length ? Math.min(this.size, ...this.sizes) : this.size; },
    last() { return Math.max(1, Math.ceil(this.list.length / this.size)); },
    cur() { return Math.min(this.page, this.last); },
    from() { return this.list.length ? (this.cur - 1) * this.size + 1 : 0; },
    to() { return Math.min(this.cur * this.size, this.list.length); },
    pageRows() { return this.list.slice((this.cur - 1) * this.size, this.cur * this.size); },
    // 1 … 4 5 6 … 12: first, last and the pages next to the current one
    nums() {
      const L = this.last, c = this.cur, show = p => p === 1 || p === L || Math.abs(p - c) <= 1;
      const out = [];
      for (let p = 1; p <= L; p++) {
        // a gap of just one page shows that page instead of "…"
        if (show(p) || (show(p - 1) && show(p + 1))) out.push(p);
        else if (out[out.length - 1] !== '…') out.push('…');
      }
      return out;
    }
  },
  watch: { 'list.length'() { if (!this.keepPage) this.page = 1; }, size() { this.page = 1; } },
  methods: { go(p) { this.page = Math.min(Math.max(1, p), this.last); this.$emit('page', { page: this.page, last: this.last }); } }
};
</script>

<style scoped>
.pager-left { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.pg-size { display: inline-flex; align-items: center; gap: 4px; }
.pg-size .pager-info { margin-right: 4px; }
.pg-size .pg.on { cursor: pointer; }
</style>
