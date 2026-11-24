<template>
  <!-- The properties a staff member may see (data access by property, 12 Nov 2026). Settings > Staff and Staff HR.
       23 Nov 2026 (Khairul): Branch first, then property. Pick the person's branches; the property list then shows those
       branches' properties to tick (access is still the ticked properties: users/{uid}.properties). With no branches set
       up yet, it works as before (every property, "All in <state>" buttons). -->
  <div class="field spf">
    <template v-if="activeBranches.length">
      <label class="req">Branches</label>
      <OptionPicker class="fit-picker" multiple searchable picked-first :model-value="branchIds" @update:model-value="setBranches"
        :options="branchOptions" label="Branches" placeholder="Choose one or more branches" :disabled="disabled" />
      <span class="help spf-gap">Picking a branch gives none of its properties yet: tick them below (or "All in …"). Removing a branch removes its properties.</span>
    </template>

    <label class="req">Properties</label>
    <div class="spf-chips" v-if="groups.length && !disabled">
      <button v-for="g in groups" :key="g.key" type="button" class="chip" :class="{ on: allIn(g) }" @click="toggleGroup(g)"
        :title="allIn(g) ? `Remove every ${g.label} property` : `Add every ${g.label} property`">
        {{ allIn(g) ? '✓ ' : '+ ' }}All in {{ g.label }} ({{ g.ids.length }})
      </button>
      <button type="button" class="chip" v-show="modelValue.length" @click="$emit('update:modelValue', [])">Clear</button>
    </div>
    <p class="help" v-if="activeBranches.length && !branchIds.length && !modelValue.length">Choose a branch first.</p>
    <OptionPicker v-else class="fit-picker" multiple searchable picked-first :model-value="modelValue" @update:model-value="v => $emit('update:modelValue', v)"
      :options="options" label="Properties" placeholder="Choose one or more properties" :disabled="disabled" />
    <span class="help">{{ modelValue.length ? `${modelValue.length} ${modelValue.length === 1 ? 'property' : 'properties'}. ` : '' }}They see and change only these properties and their units, bookings, owners, payments and statements.</span>
  </div>
</template>

<script>
import OptionPicker from '@/components/OptionPicker.vue';
import { stateOf, shortState } from '@/lib/states.js';

export default {
  components: { OptionPicker },
  props: { modelValue: { type: Array, default: () => [] }, properties: { type: Array, default: () => [] }, disabled: Boolean,
    branches: { type: Array, default: () => [] }, branchIds: { type: Array, default: () => [] } },
  emits: ['update:modelValue', 'update:branchIds'],
  computed: {
    activeBranches() { return this.branches.filter(b => b.active || this.branchIds.includes(b.id)); },
    branchOptions() {
      const known = new Set(this.branches.map(b => b.id));
      return [...this.activeBranches.map(b => ({ value: b.id, label: `${b.name}${b.active ? '' : ' (archived)'} · ${b.propertyIds.length} ${b.propertyIds.length === 1 ? 'property' : 'properties'}` })),
        ...this.branchIds.filter(id => !known.has(id)).map(id => ({ value: id, label: `${id} (not found)` }))];
    },
    // Property ids the list offers: the picked branches' properties (no branches set up: all), plus any already ticked
    offered() {
      if (!this.activeBranches.length) return new Set(this.properties.map(p => p.id));
      return new Set([...this.branches.filter(b => this.branchIds.includes(b.id)).flatMap(b => b.propertyIds), ...this.modelValue]);
    },
    options() {
      const known = new Set(this.properties.map(p => p.id)), inBranch = id => this.branches.find(b => this.branchIds.includes(b.id) && b.propertyIds.includes(id));
      return [
        ...this.properties.filter(p => this.offered.has(p.id)).map(p => {
          const b = inBranch(p.id), extra = this.activeBranches.length && !b;
          return { value: p.id, label: `${p.name} (${p.code || p.id})${b ? ` · ${b.name}` : stateOf(p) ? ` · ${shortState(stateOf(p))}` : ''}${extra ? ' · not in their branches' : ''}` };
        }),
        // An id saved earlier whose property is switched off or gone: still shown so it can be removed
        ...this.modelValue.filter(id => !known.has(id)).map(id => ({ value: id, label: `${id} (not found)` }))
      ];
    },
    // "All in …" buttons: per picked branch (branches set up), else per state (as before)
    groups() {
      const visible = new Set(this.properties.map(p => p.id));
      if (this.activeBranches.length) {
        return this.branches.filter(b => this.branchIds.includes(b.id)).map(b => ({ key: b.id, label: b.name, ids: b.propertyIds.filter(id => visible.has(id)) })).filter(g => g.ids.length);
      }
      const map = new Map();
      for (const p of this.properties) { const s = stateOf(p) || 'No state'; if (!map.has(s)) map.set(s, []); map.get(s).push(p.id); }
      return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([state, ids]) => ({ key: state, label: state === 'No state' ? 'no state' : shortState(state), ids }));
    }
  },
  methods: {
    allIn(g) { return g.ids.every(id => this.modelValue.includes(id)); },
    toggleGroup(g) {
      const set = new Set(this.modelValue);
      if (this.allIn(g)) g.ids.forEach(id => set.delete(id)); else g.ids.forEach(id => set.add(id));
      this.$emit('update:modelValue', [...set]);
    },
    // A branch taken off also takes its properties off (unless another picked branch still has them)
    setBranches(ids) {
      const gone = this.branchIds.filter(id => !ids.includes(id));
      if (gone.length) {
        const keep = new Set(this.branches.filter(b => ids.includes(b.id)).flatMap(b => b.propertyIds));
        const drop = new Set(this.branches.filter(b => gone.includes(b.id)).flatMap(b => b.propertyIds).filter(id => !keep.has(id)));
        if (drop.size) this.$emit('update:modelValue', this.modelValue.filter(id => !drop.has(id)));
      }
      this.$emit('update:branchIds', ids);
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
.spf-gap { margin-bottom: 14px; }
.fit-picker :deep(.op) { display: block; width: 100%; }
/* The picker's own root carries .fit-picker (the rule above only reaches inner .op), so it is sized here (13 Nov 2026) */
.fit-picker { display: block; width: 100%; min-width: 0; max-width: 100%; }
/* 23 Nov 2026 (Khairul): the closed bar is full width too, so it doesn't jump when clicked; long lists end in … */
.fit-picker :deep(.op-btn) { width: 100%; max-width: 100%; min-width: 0; overflow: hidden; }
.fit-picker :deep(.op-val) { display: block; max-width: none; min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left; }
</style>
