<template>
  <div class="pp" ref="root">
    <!-- One box: picked people as chips (× takes one off), then the search typed in the same box (18 Nov: was two boxes) -->
    <div class="pp-box" :class="{ off: disabled }" @mousedown="focusInput">
      <template v-for="p in picked" :key="p.uid">
        <span class="pp-chip"><Avatar :uid="p.uid" :name="p.name" :role="p.role" :size="20" />{{ p.name }}<button type="button" v-if="!disabled" @mousedown.stop @click="toggle(p.uid)" :aria-label="'Remove ' + p.name">×</button></span>
      </template>
      <input v-if="people.length && !disabled" ref="input" class="pp-input" type="search" v-model="q" :placeholder="picked.length ? 'Add more' : placeholder" :aria-label="placeholder"
        @focus="open = true" @input="open = true" @keydown.esc.stop.prevent="open = false" @keydown.enter.prevent="enter()" @keydown.backspace="dropLast">
      <span class="help" v-else-if="!picked.length">{{ people.length ? 'Nobody picked yet' : emptyText }}</span>
    </div>
    <div class="pp-add" v-if="people.length && !disabled">
      <ul class="pp-pop" v-if="open" role="listbox" :aria-label="placeholder" aria-multiselectable="true">
        <li v-if="!list.length" class="pp-none">No match</li>
        <template v-for="p in list" :key="p.uid">
          <li role="option" class="pp-item" :class="{ on: isOn(p.uid) }" :aria-selected="String(isOn(p.uid))" @mousedown.prevent="toggle(p.uid)">
            <Avatar :uid="p.uid" :name="p.name" :role="p.role" :size="24" /><span class="pp-name">{{ p.name }}</span>
            <svg v-if="isOn(p.uid)" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          </li>
        </template>
      </ul>
    </div>
  </div>
</template>

<script>
// Pick several staff members (18 Nov 2026, Issues "People"). v-model = list of uids. people = [{ uid, name, role }].
// Someone already picked who is no longer in `people` (e.g. lost access) still shows as a chip and can be taken off.
import Avatar from '@/components/Avatar.vue';
export default {
  components: { Avatar },
  props: { modelValue: { type: Array, required: true }, people: { type: Array, required: true }, known: { type: Array, default: () => [] },
    disabled: { type: Boolean, default: false }, placeholder: { type: String, default: 'Search people' }, emptyText: { type: String, default: 'Nobody to pick' } },
  emits: ['update:modelValue'],
  data() { return { q: '', open: false }; },
  computed: {
    picked() {
      const all = [...this.people, ...this.known];
      return this.modelValue.map(uid => all.find(p => p.uid === uid) || { uid, name: 'Unknown', role: '' });
    },
    list() {
      const k = this.q.trim().toLowerCase();
      return this.people.filter(p => !k || (p.name || '').toLowerCase().includes(k));
    }
  },
  mounted() { document.addEventListener('mousedown', this.away); },
  beforeUnmount() { document.removeEventListener('mousedown', this.away); },
  methods: {
    isOn(uid) { return this.modelValue.includes(uid); },
    toggle(uid) { this.$emit('update:modelValue', this.isOn(uid) ? this.modelValue.filter(x => x !== uid) : [...this.modelValue, uid]); },
    enter() { const p = this.list[0]; if (p) { this.toggle(p.uid); this.q = ''; } },
    focusInput(e) { if (this.$refs.input && e.target !== this.$refs.input) { e.preventDefault(); this.$refs.input.focus(); this.open = true; } },
    // Backspace in an empty search takes off the last person picked
    dropLast() { if (!this.q && this.modelValue.length) this.$emit('update:modelValue', this.modelValue.slice(0, -1)); },
    away(e) { if (this.open && !this.$refs.root.contains(e.target)) this.open = false; }
  }
};
</script>

<style scoped>
.pp { position: relative; }
.pp-box { display: flex; flex-wrap: wrap; gap: 6px 8px; align-items: center; min-height: 44px; padding: 6px 10px;
  border: 1px solid var(--border); border-radius: 10px; background: var(--surface); cursor: text; }
.pp-box:focus-within { outline: 2px solid var(--brand); outline-offset: -1px; border-color: transparent; }
.pp-box.off { background: var(--chip); cursor: default; }
.pp-input { flex: 1; min-width: 140px; height: 30px; padding: 0 4px; border: 0; outline: 0; background: transparent; color: var(--text); font: inherit; font-size: 14px; }
.pp-chip { display: inline-flex; align-items: center; gap: 6px; padding: 3px 6px 3px 4px; border-radius: 999px; background: var(--accent-soft); color: var(--accent);
  border: 1px solid color-mix(in srgb, var(--accent) 25%, transparent); font-size: 12.5px; font-weight: 600; }
.pp-chip button { display: inline-grid; place-items: center; width: 18px; height: 18px; padding: 0; border: 0; border-radius: 50%; background: transparent; color: inherit; font-size: 14px; cursor: pointer; }
.pp-chip button:hover { background: var(--accent); color: #fff; }
.pp-add { position: relative; }
.pp-pop { position: absolute; left: 0; right: 0; top: calc(100% + 6px); z-index: 30; max-height: 260px; overflow: auto; margin: 0; padding: 6px; list-style: none;
  background: var(--surface); border: 1px solid var(--border); border-radius: 12px; box-shadow: 0 10px 30px rgba(0, 0, 0, .12); }
.pp-item { display: flex; align-items: center; gap: 10px; padding: 7px 10px; border-radius: 8px; font-size: 13px; font-weight: 500; color: var(--text); cursor: pointer; }
.pp-item:hover { background: var(--accent-soft); color: var(--accent); }
.pp-item.on { color: var(--accent); font-weight: 700; }
.pp-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pp-none { padding: 9px 12px; font-size: 13px; color: var(--muted); }
</style>
