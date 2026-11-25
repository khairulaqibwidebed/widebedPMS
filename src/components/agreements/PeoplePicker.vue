<template>
  <!-- 25 Nov 2026 (Khairul): in a table row (compact): overlapping initials (3 at most, then +N) and a small + circle; either opens
       a list to tick or untick people. Hover an initial for the name. -->
  <div class="pp pp-avs" ref="root" v-if="compact" v-click-outside="() => (open = false)" @keydown.esc="open = false">
    <button type="button" class="pp-stack" v-if="modelValue.length" :disabled="disabled" :title="modelValue.map(p => p.name).join(', ')"
      :aria-label="'In charge: ' + modelValue.map(p => p.name).join(', ')" @click="toggleOpen">
      <span class="pp-av" v-for="p in modelValue.slice(0, 3)" :key="p.uid" :title="p.name" :style="{ background: tint(p.uid) }">{{ initials(p.name) }}</span>
      <span class="pp-av pp-more" v-if="modelValue.length > 3" :title="modelValue.slice(3).map(p => p.name).join(', ')">{{ `+${modelValue.length - 3}` }}</span>
    </button>
    <span class="pp-none" v-else>Nobody</span>
    <button type="button" class="pp-plus" v-if="!disabled" :aria-label="label" :title="label" :aria-expanded="String(open)" @click="toggleOpen">+</button>
    <div class="pp-pop" v-if="open" role="dialog" :aria-label="label" :style="popAt">
      <div class="pp-qwrap"><input class="input pp-q" type="search" v-model="q" placeholder="Find a person" aria-label="Find a person" ref="qBox"></div>
      <div class="pp-list">
        <template v-for="g in allGroups" :key="g.role">
          <div class="pp-grp">{{ ROLE_LABEL[g.role] || g.role }}</div>
          <label class="pp-row" v-for="p in g.people" :key="p.uid"><input type="checkbox" :checked="isOn(p.uid)" @change="flip(p)"><span class="pp-av sm" :style="{ background: tint(p.uid) }">{{ initials(p.name) }}</span><span class="pp-nm">{{ p.name }}</span></label>
        </template>
        <p class="pp-none pp-empty" v-if="!allGroups.length">No one matches.</p>
      </div>
    </div>
  </div>
  <div class="pp" :class="{ compact }" v-else>
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
import { computed, ref, nextTick } from 'vue';
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

// Compact (table row): avatar stack and a tick list
const open = ref(false), q = ref(''), qBox = ref(null), root = ref(null), popAt = ref({});
// the list is placed on the screen (fixed), so a table's scroll area can't cut it off; it opens upwards near the bottom
function place() {
  const r = root.value?.getBoundingClientRect(); if (!r) return;
  const below = window.innerHeight - r.bottom, up = below < 300 && r.top > below;
  // never taller than the space it has, so the search box at the top always stays on screen
  const room = Math.max(160, Math.min(360, (up ? r.top : below) - 18));
  popAt.value = { left: Math.max(8, Math.min(r.left, window.innerWidth - 276)) + 'px', maxHeight: room + 'px',
    ...(up ? { bottom: (window.innerHeight - r.top + 6) + 'px' } : { top: (r.bottom + 6) + 'px' }) };
}
const isOn = uid => props.modelValue.some(x => x.uid === uid);
function flip(p) { emit('update:modelValue', isOn(p.uid) ? props.modelValue.filter(x => x.uid !== p.uid) : [...props.modelValue, { uid: p.uid, name: p.name }]); }
async function toggleOpen() { if (props.disabled) return; place(); open.value = !open.value; q.value = ''; if (open.value) { await nextTick(); qBox.value?.focus(); } }
const allGroups = computed(() => {
  const t = q.value.trim().toLowerCase(), by = {};
  for (const p of props.staff) if (!t || (p.name || '').toLowerCase().includes(t)) (by[p.role] ||= []).push(p);
  return Object.keys(by).sort().map(role => ({ role, people: by[role] }));
});
const initials = n => (n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
// a steady soft colour per person (same person, same colour)
const TINTS = ['#e0e7ff', '#fce7f3', '#dcfce7', '#fef3c7', '#e0f2fe', '#ede9fe', '#ffe4e6', '#ccfbf1'];
const tint = uid => TINTS[[...String(uid)].reduce((a, ch) => a + ch.charCodeAt(0), 0) % TINTS.length];
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
.pp-avs { position: relative; flex-wrap: nowrap; gap: 6px; }
.pp-stack { display: inline-flex; align-items: center; border: 0; background: none; padding: 0; cursor: pointer; }
.pp-stack:disabled { cursor: default; }
.pp-av { width: 28px; height: 28px; border-radius: 50%; display: inline-grid; place-items: center; font-size: 11px; font-weight: 700; color: #1f2937;
  box-shadow: 0 0 0 2px var(--surface); flex: none; }
.pp-av + .pp-av { margin-left: -6px; }
.pp-av.pp-more { background: var(--chip); color: var(--text-2); }
.pp-av.sm { width: 24px; height: 24px; font-size: 10px; box-shadow: none; }
.pp-plus { width: 28px; height: 28px; border-radius: 50%; border: 1.5px dashed var(--border); background: var(--surface); color: var(--muted); font-size: 16px; line-height: 1;
  cursor: pointer; flex: none; padding: 0; }
.pp-plus:hover { border-color: var(--accent); color: var(--accent); }
.pp-pop { position: fixed; z-index: 60; width: 260px; display: flex; flex-direction: column; max-height: min(360px, 55vh);
  background: var(--surface); border: 1px solid var(--border); border-radius: 12px; box-shadow: 0 12px 28px rgba(0,0,0,.14); overflow: hidden; }
.pp-qwrap { flex: none; padding: 8px; border-bottom: 1px solid var(--line); background: var(--surface); }
.pp-q { display: block; width: 100%; height: 36px; box-sizing: border-box; margin: 0; }
.pp-list { flex: 1; min-height: 0; overflow-y: auto; padding: 0 6px 6px; }
.pp-grp { padding: 8px 8px 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); }
.pp-row { display: flex; align-items: center; gap: 10px; padding: 6px 8px; border-radius: 8px; font-size: 13px; cursor: pointer; }
.pp-row:hover { background: var(--hover); }
.pp-row input { margin: 0; width: 16px; height: 16px; accent-color: var(--accent); flex: none; }
.pp-nm { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pp-empty { padding: 8px; margin: 0; }
</style>