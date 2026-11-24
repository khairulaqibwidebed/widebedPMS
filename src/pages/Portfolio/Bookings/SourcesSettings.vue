<template>
  <div class="is-panel">
    <div class="loading-bar" v-show="loading || busy"></div>
    <div class="is-head">
      <div>
        <h2>Booking sources</h2>
        <p class="help" style="margin:4px 0 0">The sources offered on the booking forms and the booking popup, in this order. Renaming a source changes new bookings only: bookings already saved keep the name they were saved with.</p>
      </div>
    </div>
    <div class="notice error" v-show="error">{{ error }}</div>
    <div class="notice ok" v-show="okMsg">{{ okMsg }}</div>

    <section class="card src-card" v-if="!loading">
      <div class="src-head" aria-hidden="true"><span></span><span>Name</span><span>Active</span><span>Bookings</span><span></span></div>
      <div class="src-row" v-for="(s, i) in list" :key="s.id" :class="{ over: overAt === i, hidden: !s.active }"
        draggable="true" @dragstart="dragFrom = i" @dragover.prevent="overAt = i" @dragleave="overAt = -1" @drop.prevent="drop(i)" @dragend="dragFrom = -1; overAt = -1">
        <span class="src-move">
          <span class="grip" title="Drag to move" aria-hidden="true">⋮⋮</span>
          <button type="button" class="mv" :disabled="i === 0" @click="move(i, -1)" :aria-label="`Move ${s.label || 'source'} up`">▲</button>
          <button type="button" class="mv" :disabled="i === list.length - 1" @click="move(i, 1)" :aria-label="`Move ${s.label || 'source'} down`">▼</button>
        </span>
        <span class="src-name">
          <input class="input" v-model="s.label" :maxlength="LABEL_MAX" :disabled="s.id === AGENT_ID" :aria-label="`Name of source ${i + 1}`" :class="{ bad: problemOf(s) }" placeholder="Source name">
          <small class="help" v-if="s.id === AGENT_ID">Opens the agent list on the booking form. Can't be renamed or hidden.</small>
          <small class="help" v-else-if="renamedFrom(s)">{{ `Was "${renamedFrom(s)}". Bookings saved before keep "${renamedFrom(s)}".` }}</small>
          <small class="bad-text" v-if="problemOf(s)">{{ problemOf(s) }}</small>
        </span>
        <span><button type="button" class="toggle" :class="{ on: s.active }" role="switch" :aria-checked="String(s.active)" :disabled="s.id === AGENT_ID"
          :aria-label="`${s.label || 'Source'} active`" @click="s.active = !s.active"></button></span>
        <span class="muted src-n">{{ usedText(s) }}</span>
        <span>
          <button type="button" class="link rm" v-if="canRemove(s)" @click="remove(i)">Remove</button>
          <span class="muted src-keep" v-else-if="!s.builtIn && !isNew(s)" :title="'A source used on bookings can only be hidden.'">Hide only</span>
        </span>
      </div>
      <div class="src-foot">
        <button type="button" class="btn" @click="add()" :disabled="list.length >= MAX_ITEMS">+ Add source</button>
        <span class="help">{{ list.length >= MAX_ITEMS ? `${MAX_ITEMS} sources at most.` : 'Hidden sources stay on the bookings that have them. A source used on bookings can be hidden, not removed.' }}</span>
      </div>
    </section>
    <!-- 23 Nov 2026 (Khairul): Save at the bottom right -->
    <div class="is-foot">
      <p class="muted">{{ loading ? '' : updatedText }}</p>
      <button type="button" class="btn btn-primary" @click="save()" :disabled="loading || busy || !dirty">{{ busy ? 'Saving…' : 'Save settings' }}</button>
    </div>
  </div>
</template>

<script>
// Booking settings > Booking sources (/Portfolio/bookings/settings/sources), 23 Nov 2026 (Khairul). config/bookingSources
// (lib/booking-settings.js, Firestore rules 1.02), the 'bookingSettings.edit' tick. Used by the Reservation form, the Lodgment
// form and the booking popup; Bulk Upload keeps the source as typed text. "Used on N bookings" is counted once when the tab
// opens (one count per source). Agent works by its id 'agent' (opens the agent list), so its name is fixed.
import { loadBookingSources, saveBookingSources, countSourceUse, normSources, AGENT_ID, LABEL_MAX, MAX_ITEMS } from '@/lib/booking-settings.js';
import { askConfirm } from '@/lib/confirm.js';

const snap = l => JSON.stringify(l.map(s => [s.id, s.label.trim(), s.active]));
const newId = () => 'src_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export default {
  emits: ['dirty'],
  data() { return { AGENT_ID, LABEL_MAX, MAX_ITEMS, list: [], before: [], start: '', meta: null, used: {}, loading: true, busy: false, error: '', okMsg: '', dragFrom: -1, overAt: -1 }; },
  computed: {
    dirty() { return !this.loading && snap(this.list) !== this.start; },
    updatedText() {
      const m = this.meta; if (!m?.saved) return 'Using the built-in list (nothing saved yet).';
      const at = m.updatedAt?.toDate ? m.updatedAt.toDate().toLocaleString('en-MY', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
      return `Last saved${m.updatedByName ? ' by ' + m.updatedByName : ''}${at ? ', ' + at : ''}.`;
    }
  },
  watch: { dirty(v) { this.$emit('dirty', v); if (v) this.okMsg = ''; } },
  async mounted() { await this.load(); },
  methods: {
    async load() {
      this.loading = true;
      try { this.meta = await loadBookingSources(true); }
      catch { this.error = 'Could not load the booking sources. Showing the built-in list.'; this.meta = { list: normSources(null), saved: false }; }
      this.before = this.meta.list.map(s => ({ ...s, was: [...s.was] }));
      this.list = this.meta.list.map(s => ({ ...s, was: [...s.was] }));
      this.start = snap(this.list); this.loading = false;
      this.countAll();
    },
    // Once per visit: one count per source (its name now and older names)
    countAll() {
      this.used = {};
      this.list.forEach(s => {
        this.used = { ...this.used, [s.id]: 'counting' };
        countSourceUse(s).then(n => { this.used = { ...this.used, [s.id]: n }; }).catch(() => { this.used = { ...this.used, [s.id]: 'unknown' }; });
      });
    },
    isNew(s) { return !this.before.some(b => b.id === s.id); },
    usedText(s) {
      const n = this.used[s.id];
      if (this.isNew(s)) return 'New';
      if (n === 'counting' || n == null) return 'Counting…';
      if (n === 'unknown') return "Couldn't count";
      return `Used on ${n} booking${n === 1 ? '' : 's'}`;
    },
    // A new row not saved yet can go; a saved custom source only when no booking has it (and the count worked)
    canRemove(s) { return !s.builtIn && (this.isNew(s) || this.used[s.id] === 0); },
    renamedFrom(s) { const b = this.before.find(x => x.id === s.id); return b && b.label !== s.label.trim() && s.label.trim() ? b.label : ''; },
    problemOf(s) {
      const l = s.label.trim().toLowerCase();
      if (!l) return 'Type a name.';
      if (this.list.some(o => o !== s && o.label.trim().toLowerCase() === l)) return 'Another source has this name.';
      const other = this.list.find(o => o !== s && (o.was || []).some(w => w.toLowerCase() === l));
      if (other) return `"${s.label.trim()}" was the old name of ${other.label}; its bookings still say it. Pick another name.`;
      return '';
    },
    add() { this.list.push({ id: newId(), label: '', active: true, order: this.list.length, builtIn: false, was: [] }); this.$nextTick(() => { const els = this.$el.querySelectorAll('.src-name input'); els[els.length - 1]?.focus(); }); },
    async remove(i) {
      const s = this.list[i];
      if (!this.isNew(s) && !(await askConfirm({ title: `Remove ${s.label}?`, message: 'No booking uses it. It goes from the list when you save.', confirmText: 'Remove', danger: true }))) return;
      this.list.splice(i, 1);
    },
    move(i, by) { const j = i + by; if (j < 0 || j >= this.list.length) return; const l = [...this.list]; [l[i], l[j]] = [l[j], l[i]]; this.list = l; },
    drop(i) {
      const from = this.dragFrom; this.overAt = -1; this.dragFrom = -1;
      if (from < 0 || from === i) return;
      const l = [...this.list], [x] = l.splice(from, 1); l.splice(i, 0, x); this.list = l;
    },
    async save() {
      this.error = ''; this.okMsg = '';
      const bad = this.list.find(s => this.problemOf(s));
      if (bad) { this.error = `Fix the names first: ${this.problemOf(bad)}`; return; }
      // A renamed source keeps its older names, so its old bookings are still counted and shown under it
      const list = this.list.map(s => { const was = this.renamedFrom(s); return { ...s, label: s.label.trim(), was: was && !s.was.includes(was) ? [...s.was, was] : s.was }; });
      this.busy = true;
      try {
        await saveBookingSources(list, this.before);
        await this.load();
        this.okMsg = 'Saved. The booking forms use the new list from the next time they open.';
      } catch (e) { this.error = e.code === 'permission-denied' ? 'Saving was refused. You need the "Booking settings" access, and Firestore rules 1.02 must be published.' : `Could not save: ${e.message || e}`; }
      this.busy = false;
    }
  }
};
</script>

<style scoped>
.is-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
.is-head h2 { margin: 0; font-size: 17px; }
.is-foot { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 14px; }
.is-foot p { margin: 0; }
.src-head, .src-row { display: grid; grid-template-columns: 92px minmax(0, 1fr) 64px 150px 84px; gap: 12px; align-items: start; }
.src-head { font-size: 12px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; padding: 0 0 8px; border-bottom: 1px solid var(--line); }
.src-row { padding: 10px 0; border-bottom: 1px solid var(--line); border-top: 2px solid transparent; }
.src-row > span { min-height: 38px; display: flex; align-items: center; }
.src-row .src-name { flex-direction: column; align-items: stretch; gap: 4px; justify-content: center; }
.src-row.over { border-top-color: var(--accent); }
.src-row.hidden .src-name input { color: var(--muted); }
.src-move { gap: 2px; }
.grip { cursor: grab; color: var(--muted); font-size: 14px; letter-spacing: -2px; padding: 0 6px 0 2px; user-select: none; }
.mv { border: 1px solid var(--border); background: var(--surface); color: var(--text-2); width: 26px; height: 26px; border-radius: 6px; font-size: 10px; line-height: 1; }
.mv:hover:not(:disabled) { color: var(--accent); border-color: var(--accent); }
.mv:disabled { opacity: .35; }
.toggle { border: 0; cursor: pointer; }
.toggle:disabled { opacity: .5; cursor: default; }
.src-n { font-size: 13px; }
.src-keep { font-size: 12px; }
.rm { color: var(--danger); }
.input.bad { border-color: var(--danger); }
.bad-text { color: var(--danger); font-size: 12px; }
.src-foot { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding-top: 14px; }
/* Rows follow the card's own width, not the window's (24 Nov 2026: was @media 760px, too wide beside the sidebar) */
.src-card { container-type: inline-size; }
@container (max-width: 620px) {
  .src-head { display: none; }
  .src-row { grid-template-columns: 92px minmax(0, 1fr); }
  .src-row > span:nth-child(n+3) { grid-column: 2; min-height: 0; }
}
</style>
