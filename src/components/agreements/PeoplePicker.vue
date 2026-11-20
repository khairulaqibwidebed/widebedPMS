<template>
  <div class="pp" :class="{ compact }">
    <span class="pp-chip" v-for="p in modelValue" :key="p.uid">
      {{ p.name }}
      <button type="button" class="pp-x" :aria-label="'Remove ' + p.name" :disabled="disabled" @click="remove(p.uid)">×</button>
    </span>
    <span class="pp-none" v-if="!modelValue.length && compact">Nobody</span>
    <span class="pp-adds">
      <select class="pp-add" :class="compact ? 'select' : 'input select'" :aria-label="label" :disabled="disabled || !left.length" @change="add($event)">
        <option value="">{{ left.length ? (compact ? '+ Add' : '+ Add person') : (compact ? 'All added' : 'Everyone added') }}</option>
        <optgroup v-for="g in groups" :key="g.role" :label="ROLE_LABEL[g.role] || g.role">
          <option v-for="p in g.people" :key="p.uid" :value="p.uid">{{ p.name }}</option>
        </optgroup>
      </select>
      <!-- 20 Nov 2026: presets (e.g. COH rater groups) add everyone in the group who is on the staff list at once -->
      <select v-if="presets.length" class="pp-add" :class="compact ? 'select' : 'input select'" :aria-label="label + ': add a group'" :disabled="disabled || !presetLeft.length" @change="addPreset($event)">
        <option value="">{{ presetLeft.length ? '+ Add group' : 'Groups added' }}</option>
        <option v-for="g in presetLeft" :key="g.id" :value="g.id">{{ g.name }} ({{ g.adds.length }})</option>
      </select>
    </span>
  </div>
</template>

<script setup>
// Pick several staff: chips with × to remove, and a "+ Add person" list grouped by department.
// v-model = [{ uid, name }]. staff = listStaff() result. compact = inside a table row.
import { computed } from 'vue';
import { ROLE_LABEL } from '@/lib/firebase.js';

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  staff: { type: Array, default: () => [] },
  disabled: Boolean,
  compact: Boolean,
  label: { type: String, default: 'Add a person' },
  presets: { type: Array, default: () => [] }   // [{ id, name, members: [uid] }]
});
const emit = defineEmits(['update:modelValue']);
const left = computed(() => props.staff.filter(p => !props.modelValue.some(x => x.uid === p.uid)));
const groups = computed(() => {
  const by = {};
  for (const p of left.value) (by[p.role] ||= []).push(p);
  return Object.keys(by).sort().map(role => ({ role, people: by[role] }));
});
function add(e) {
  const p = props.staff.find(x => x.uid === e.target.value);
  e.target.value = '';
  if (p) emit('update:modelValue', [...props.modelValue, { uid: p.uid, name: p.name }]);
}
// Groups that would still add someone: members on the staff list and not picked yet
const presetLeft = computed(() => props.presets
  .map(g => ({ ...g, adds: left.value.filter(p => (g.members || []).includes(p.uid)) }))
  .filter(g => g.adds.length));
function addPreset(e) {
  const g = presetLeft.value.find(x => x.id === e.target.value);
  e.target.value = '';
  if (g) emit('update:modelValue', [...props.modelValue, ...g.adds.map(p => ({ uid: p.uid, name: p.name }))]);
}
const remove = id => emit('update:modelValue', props.modelValue.filter(p => p.uid !== id));
</script>

<style scoped>
.pp { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.pp-chip { display: inline-flex; align-items: center; gap: 4px; height: 28px; padding: 0 4px 0 10px; border-radius: 999px;
  background: var(--accent-soft); color: var(--accent); font-size: 13px; font-weight: 600; }
.pp-x { border: 0; background: none; color: inherit; font-size: 16px; line-height: 1; width: 20px; height: 20px; border-radius: 50%; cursor: pointer; }
.pp-x:hover:not(:disabled) { background: color-mix(in srgb, var(--accent) 18%, transparent); }
.pp-none { color: var(--muted); font-size: 13px; }
/* The list uses the app's own dropdown (.input.select on forms, .select in tables), so it matches every other dropdown. */
.pp-add { width: auto; min-width: 160px; }
.pp-adds { display: inline-flex; gap: 6px; flex-wrap: wrap; }
.compact .pp-chip { height: 26px; font-size: 12px; }
/* 20 Nov 2026: the label is for screen readers only (it showed as text on pages without a global .sr-only) */
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
</style>