<template>
  <div class="pp" :class="{ compact }">
    <span class="pp-chip" v-for="p in modelValue" :key="p.uid">
      {{ p.name }}
      <button type="button" class="pp-x" :aria-label="'Remove ' + p.name" :disabled="disabled" @click="remove(p.uid)">×</button>
    </span>
    <span class="pp-none" v-if="!modelValue.length && compact">Nobody</span>
    <label class="sr-only" :for="uid">{{ label }}</label>
    <select :id="uid" class="pp-add" :class="compact ? 'select' : 'input select'" :disabled="disabled || !left.length" @change="add($event)">
      <option value="">{{ left.length ? '+ Add person' : 'Everyone added' }}</option>
      <optgroup v-for="g in groups" :key="g.role" :label="ROLE_LABEL[g.role] || g.role">
        <option v-for="p in g.people" :key="p.uid" :value="p.uid">{{ p.name }}</option>
      </optgroup>
    </select>
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
  label: { type: String, default: 'Add a person' }
});
const emit = defineEmits(['update:modelValue']);
const uid = 'pp-' + Math.random().toString(36).slice(2, 7);
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
.compact .pp-chip { height: 26px; font-size: 12px; }
</style>