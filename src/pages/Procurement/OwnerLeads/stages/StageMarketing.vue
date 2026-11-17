<template>
  <section class="card" aria-label="Marketing">
    <div class="card-head"><h2>{{ `${n}. Marketing` }}</h2><span class="pill" :class="d.marketing.taskId || d.marketing.notifiedAt ? 'green' : 'grey'">{{ d.marketing.taskId ? 'Sent to Marketing' : d.marketing.notifiedAt ? 'Marketing notified' : 'Not notified' }}</span></div>
    <div class="notice warn" v-if="!mkReadyOf(d) && !d.marketing.taskId">Marketing is notified once the payment (or the deposit) is in and every Operations Setup row is ticked.</div>
    <div class="kv" v-if="d.marketing.notifiedAt"><span>Notified</span><span>{{ `By ${d.marketing.notifiedByName}, ${stamp(d.marketing.notifiedAt)}` }}</span></div>
    <!-- 16 Nov 2026 (Khairul): grouped in folding sections (groups set on Owner Leads > Defaults), slim rows two across -->
    <div class="mk-head" v-if="d.marketing.items.length">
      <div class="mk-prog">
        <span class="mk-count">{{ `${onCount} of ${d.marketing.items.length} done` }}</span>
        <span class="mk-bar"><span :style="{ width: (d.marketing.items.length ? onCount / d.marketing.items.length * 100 : 0) + '%' }"></span></span>
      </div>
      <label class="tick mk-all" v-if="editing"><input type="checkbox" :checked="onCount === d.marketing.items.length" :indeterminate.prop="onCount > 0 && onCount < d.marketing.items.length" @change="d.marketing.items.forEach(m => { m.on = $event.target.checked })"> Select all</label>
    </div>
    <div class="mg-list">
      <section class="mg" v-for="g in groups" :key="g.name">
        <div class="mg-top">
          <button type="button" class="mg-head" :aria-expanded="String(!closed[g.name])" @click="closed[g.name] = !closed[g.name]">
            <svg class="mg-chev" :class="{ shut: closed[g.name] }" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
            <b>{{ g.name }}</b>
            <span class="pill" :class="g.on === g.items.length ? 'green' : g.on ? 'amber' : 'grey'">{{ `${g.on}/${g.items.length}` }}</span>
          </button>
          <button type="button" class="editlink mg-all" v-if="editing && !closed[g.name]" @click="tickGroup(g)">{{ g.on === g.items.length ? 'Untick all' : 'Tick all' }}</button>
        </div>
        <div class="mg-rows" v-show="!closed[g.name]">
          <div class="mg-row" :class="{ on: m.on }" v-for="m in g.items" :key="m.title">
            <div class="mg-line">
              <label class="mg-tick"><input type="checkbox" v-model="m.on" :disabled="!editing"><span>{{ m.title }}</span></label>
              <button type="button" class="editlink mg-note-btn" v-if="editing && !m.note && !noteOpen[m.title]" @click="noteOpen[m.title] = true">+ Note</button>
              <button type="button" class="mk-x" v-if="editing" @click="remove(m)" :aria-label="`Remove ${m.title}`" title="Remove">×</button>
            </div>
            <input class="input mg-note" v-if="editing && (m.note || noteOpen[m.title])" v-model="m.note" placeholder="Note (optional)" :aria-label="`${m.title} note`">
            <small class="muted mg-note-ro" v-else-if="!editing && m.note">{{ m.note }}</small>
          </div>
        </div>
      </section>
      <p class="muted" v-if="!groups.length" style="margin:0">{{ editing ? 'No items. Add one below.' : 'Nothing chosen yet.' }}</p>
    </div>
    <div class="mk-add" v-if="editing">
      <input class="input" v-model="mkAdd" placeholder="Add another item, e.g. Listing photos shoot" aria-label="New marketing item" @keyup.enter="addMk()">
      <input class="input mk-add-grp" v-model="mkGroup" list="mkStageGroups" placeholder="Group" aria-label="Group of the new item" @keyup.enter="addMk()">
      <datalist id="mkStageGroups"><option v-for="g in groups" :key="g.name" :value="g.name"></option></datalist>
      <button class="btn" @click="addMk()" :disabled="!mkAdd.trim()">+ Add</button>
    </div>
    <template v-if="d.marketing.taskId">
      <div class="kv"><span>Sent</span><span>{{ `${d.marketing.sentByName}, ${stamp(d.marketing.sentAt)}` }}</span></div>
      <div class="kv mk-progress"><span>Marketing task</span><span>{{ mkTask ? `${mkTask.subtasksDone} of ${mkTask.subtasksTotal} done · ${mkTask.completed ? 'Completed' : mkTask.status || 'Open'}` : (tasksError ? 'Could not read the task system' : 'Checking…') }}</span></div>
      <button class="btn" @click="$emit('refresh-tasks')" :disabled="tasksLoading">{{ tasksLoading ? 'Checking…' : 'Refresh' }}</button>
    </template>
    <div class="actions" v-if="canEdit && !d.live.live">
      <button class="btn btn-primary" @click="$emit('go-live')" :disabled="busy || !stageDoneOf(d, 'marketing')" :title="!mkReadyOf(d) ? 'Payment and Operations Setup come first' :stageDoneOf(d, 'marketing') ? '' : 'Tick every marketing item first'">Go Live</button>
    </div>
    <p class="help" v-if="d.live.live">{{ `Live since ${stamp(d.live.at)}. Handover to Operations is in the Live stage.` }}</p>
  </section>
</template>

<script>
// Stage: Marketing (the checklist; Go Live is done by the page: save, then notify Operations).
import { stamp, stageDoneOf, mkReadyOf, mkGroupOf } from '@/lib/owner-leads.js';

export default {
  props: { d: { type: Object, required: true }, canEdit: Boolean, busy: Boolean, mkTask: { type: Object, default: null },
    tasksError: { type: String, default: '' }, tasksLoading: Boolean, n: { type: Number, default: 5 } },
  emits: ['go-live', 'refresh-tasks'],
  data() { return { mkAdd: '', mkGroup: '', closed: {}, noteOpen: {} }; },
  computed: {
    // Ticking, notes and adding/removing rows: before the task is sent and before Go Live
    editing() { return !this.d.marketing.taskId && this.canEdit && !this.d.live.live; },
    onCount() { return this.d.marketing.items.filter(m => m.on).length; },
    // Sections in the order their first item comes; "Other" last. Read-only: only the ticked items.
    groups() {
      const out = new Map();
      for (const m of this.d.marketing.items) {
        if (!this.editing && !m.on) continue;
        const g = mkGroupOf(m);
        if (!out.has(g)) out.set(g, []);
        out.get(g).push(m);
      }
      return [...out].map(([name, items]) => ({ name, items, on: items.filter(m => m.on).length }))
        .sort((a, b) => (a.name === 'Other') - (b.name === 'Other'));
    }
  },
  methods: {
    stamp, stageDoneOf, mkReadyOf,
    addMk() {
      const t = this.mkAdd.trim();
      if (!t) return;
      if (!this.d.marketing.items.some(m => m.title.toLowerCase() === t.toLowerCase())) this.d.marketing.items.push({ title: t, group: this.mkGroup.trim(), on: false, note: '' });
      this.mkAdd = '';
    },
    remove(m) { const i = this.d.marketing.items.indexOf(m); if (i >= 0) this.d.marketing.items.splice(i, 1); },
    tickGroup(g) { const v = g.on !== g.items.length; g.items.forEach(m => { m.on = v; }); }
  }
};
</script>

<style scoped>
/* 16 Nov 2026: folding sections, slim rows two across */
.mk-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin: 12px 0 10px; }
.mk-prog { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; }
.mk-count { font-size: 12px; font-weight: 600; color: var(--text-2); white-space: nowrap; }
.mk-bar { flex: 1; max-width: 240px; height: 6px; border-radius: 3px; background: var(--border); overflow: hidden; }
.mk-bar span { display: block; height: 100%; background: var(--green); transition: width .25s; }
.mk-all { font-weight: 600; margin: 0; white-space: nowrap; }
.mg-list { display: grid; gap: 8px; }
.mg { border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
.mg-top { display: flex; align-items: center; padding-right: 12px; background: var(--surface); }
.mg-head { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; padding: 10px 12px; border: 0; background: var(--surface); font: inherit; color: var(--text); cursor: pointer; text-align: left; }
.mg-head b { font-size: 14px; }
.mg-chev { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; transition: transform .15s; flex: none; color: var(--muted); }
.mg-chev.shut { transform: rotate(-90deg); }
.mg-all { font-size: 12px; font-weight: 600; white-space: nowrap; }
.mg-rows { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 16px; padding: 0 12px 8px; border-top: 1px solid var(--border); }
@media (max-width: 720px) { .mg-rows { grid-template-columns: minmax(0, 1fr); } }
.mg-row { padding: 6px 0; border-bottom: 1px solid var(--line, var(--border)); }
.mg-row.on .mg-tick span { color: var(--green); font-weight: 600; }
.mg-line { display: flex; align-items: center; gap: 8px; min-height: 30px; }
.mg-tick { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; font-size: 13px; cursor: pointer; margin: 0; }
.mg-tick input { width: 16px; height: 16px; flex: none; accent-color: var(--green); }
.mg-tick span { overflow-wrap: anywhere; }
.mg-note-btn { font-size: 12px; white-space: nowrap; }
.mg-note { height: 32px; font-size: 13px; margin: 4px 0 2px 24px; width: calc(100% - 24px); }
.mg-note-ro { display: block; margin: 0 0 2px 24px; }
.mk-x { border: 0; background: none; color: var(--muted); font-size: 18px; cursor: pointer; line-height: 1; padding: 2px; flex: none; }
.mk-x:hover { color: var(--red); }
.mk-add { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
.mk-add .input { flex: 1 1 220px; max-width: 420px; }
.mk-add .mk-add-grp { flex: 0 1 170px; }
</style>
