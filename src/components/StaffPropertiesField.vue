<template>
  <!-- The properties a staff member may see (data access by property, 12 Nov 2026). Settings > Staff and Staff HR. -->
  <div class="field spf">
    <label class="req">Properties</label>
    <div class="spf-chips" v-if="byState.length && !disabled">
      <button v-for="g in byState" :key="g.state" type="button" class="chip" :class="{ on: allIn(g) }" @click="toggleState(g)"
        :title="allIn(g) ? `Remove every ${g.state} property` : `Add every ${g.state} property`">
        {{ allIn(g) ? '✓ ' : '+ ' }}All in {{ g.label }} ({{ g.ids.length }})
      </button>
      <button type="button" class="chip" v-show="modelValue.length" @click="$emit('update:modelValue', [])">Clear</button>
    </div>
    <OptionPicker class="fit-picker" multiple searchable picked-first :model-value="modelValue" @update:model-value="v => $emit('update:modelValue', v)"
      :options="options" label="Properties" placeholder="Choose one or more properties" :disabled="disabled" />
    <span class="help">{{ modelValue.length ? `${modelValue.length} ${modelValue.length === 1 ? 'property' : 'properties'}. ` : '' }}They see and change only these properties and their units, bookings, owners, payments and statements. A property they add themselves is added for them.</span>
  </div>
</template>

<script>
import OptionPicker from '@/components/OptionPicker.vue';
import { stateOf, shortState } from '@/lib/states.js';

export default {
  components: { OptionPicker },
  props: { modelValue: { type: Array, default: () => [] }, properties: { type: Array, default: () => [] }, disabled: Boolean },
  emits: ['update:modelValue'],
  computed: {
    options() {
      const known = new Set(this.properties.map(p => p.id));
      return [
        ...this.properties.map(p => ({ value: p.id, label: `${p.name} (${p.code || p.id})${stateOf(p) ? ` · ${shortState(stateOf(p))}` : ''}` })),
        // An id saved earlier whose property is switched off or gone: still shown so it can be removed
        ...this.modelValue.filter(id => !known.has(id)).map(id => ({ value: id, label: `${id} (not found)` }))
      ];
    },
    byState() {
      const map = new Map();
      for (const p of this.properties) { const s = stateOf(p) || 'No state'; if (!map.has(s)) map.set(s, []); map.get(s).push(p.id); }
      return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([state, ids]) => ({ state, label: state === 'No state' ? 'no state' : shortState(state), ids }));
    }
  },
  methods: {
    allIn(g) { return g.ids.every(id => this.modelValue.includes(id)); },
    toggleState(g) {
      const set = new Set(this.modelValue);
      if (this.allIn(g)) g.ids.forEach(id => set.delete(id)); else g.ids.forEach(id => set.add(id));
      this.$emit('update:modelValue', [...set]);
    }
  }
};
</script>

<style scoped>
.spf-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.spf-chips .chip { border: 1px solid var(--line, #e3e3e8); background: var(--card, #fff); border-radius: 999px; padding: 4px 10px; font-size: 13px; cursor: pointer; }
/* The picker fills the panel and cuts its one-line summary off with "…" instead of widening the panel */
.spf { min-width: 0; max-width: 100%; }
.spf .help { display: block; overflow-wrap: anywhere; }
.fit-picker :deep(.op) { display: block; width: 100%; }
/* The picker's own root carries .fit-picker (the rule above only reaches inner .op), so it is sized here (13 Nov 2026) */
.fit-picker { display: block; width: 100%; min-width: 0; max-width: 100%; }
.fit-picker :deep(.op-btn) { width: 100%; min-width: 0; overflow: hidden; }
.fit-picker :deep(.op-val) { display: block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fit-picker :deep(.op-pop) { width: 100%; max-width: none; }
.fit-picker :deep(.op-item) { white-space: normal; }
.spf-chips .chip.on { background: var(--accent-soft, #fde7f6); border-color: var(--accent, #c2452b); }
</style>
