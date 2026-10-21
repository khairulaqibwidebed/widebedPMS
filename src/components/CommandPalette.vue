<!-- Ctrl K: type part of a page name, Enter to go. -->
<template>
  <div class="palette-back" @click.self="$emit('close')">
    <div class="palette" role="dialog" aria-label="Jump to page">
      <input ref="input" v-model="q" placeholder="Jump to a page…" aria-label="Page name" @input="sel = 0" @keydown="key">
      <ul>
        <li v-for="(it, i) in shown" :key="it.group + it.label" :class="{ sel: i === sel }" @click="go(it)">{{ it.label }}<small>{{ it.group }}{{ it.to ? '' : ' · not built' }}</small></li>
        <li v-if="!shown.length"><small>No page matches</small></li>
      </ul>
    </div>
  </div>
</template>

<script>
import { notBuilt } from '../lib/toast.js';

export default {
  props: { groups: Array },
  emits: ['close'],
  data: () => ({ q: '', sel: 0 }),
  computed: {
    all() { return this.groups.flatMap(g => g.items.map(it => ({ ...it, group: g.label || '' }))); },
    shown() {
      const q = this.q.trim().toLowerCase();
      return this.all.filter(it => it.label.toLowerCase().includes(q) || it.group.toLowerCase().includes(q));
    }
  },
  mounted() { this.$refs.input.focus(); },
  methods: {
    go(it) { this.$emit('close'); if (it.to) this.$router.push(it.to); else notBuilt(it.label); },
    key(e) {
      if (e.key === 'ArrowDown') { this.sel = Math.min(this.sel + 1, this.shown.length - 1); e.preventDefault(); }
      if (e.key === 'ArrowUp') { this.sel = Math.max(this.sel - 1, 0); e.preventDefault(); }
      if (e.key === 'Enter' && this.shown[this.sel]) this.go(this.shown[this.sel]);
      if (e.key === 'Escape') this.$emit('close');
    }
  }
};
</script>
