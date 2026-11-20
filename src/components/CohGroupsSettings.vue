<template>
  <div class="card">
    <div class="gs-head">
      <div>
        <h3 style="margin:0">Rater groups</h3>
        <p class="sub" style="margin:4px 0 0">Groups for quick picking on Assigned raters: choose a group under "+ Add group" to add all its members at once. One person can be in several groups. Groups are for every quarter.</p>
      </div>
      <button type="button" class="btn btn-primary" :disabled="loading || !!busy" @click="addNew">New group</button>
    </div>
    <p class="help" v-if="loading">Loading…</p>
    <p class="help error-text" v-else-if="error">{{ error }}</p>
    <p class="muted" v-else-if="!list.length">No groups yet. Click New group.</p>
    <div class="gs-group" v-for="g in list" :key="g.key">
      <div class="gs-row">
        <input class="input gs-name" v-model="g.name" maxlength="60" placeholder="Group name, e.g. Operations team" :disabled="busy === g.key" @input="g.dirty = true">
        <span class="pill amber" v-if="g.dirty">Not saved yet</span>
        <span class="gs-count">{{ g.members.length }} {{ g.members.length === 1 ? 'person' : 'people' }}</span>
        <span class="push"></span>
        <button type="button" class="btn btn-primary" :disabled="busy === g.key || !g.dirty" @click="save(g)">{{ busy === g.key ? 'Saving…' : 'Save' }}</button>
        <button type="button" class="btn del-btn" :disabled="busy === g.key" @click="remove(g)">Delete</button>
      </div>
      <!-- 20 Nov 2026: one multi-select dropdown (tick several, type to search; the ticked ones are listed first) -->
      <OptionPicker class="gs-pick" multiple searchable picked-first down :model-value="g.members" :options="optionsFor(g)" label="People in this group" placeholder="Choose people"
        :display="g.members.length ? 'Choose people' : ''" :disabled="busy === g.key" @update:model-value="list => { g.members = list; g.dirty = true; }" />
      <!-- 20 Nov 2026: the picks are listed under the dropdown, folded away until opened -->
      <div class="gs-list" v-if="g.members.length">
        <button type="button" class="gs-toggle" :aria-expanded="String(!!g.showList)" @click="g.showList = !g.showList">
          {{ g.showList ? 'Hide' : 'Show' }} {{ g.members.length }} {{ g.members.length === 1 ? 'person' : 'people' }} <span aria-hidden="true">{{ g.showList ? '▴' : '▾' }}</span></button>
        <div class="gs-chips" v-if="g.showList">
          <span class="gs-chip" v-for="o in pickedOf(g)" :key="o.value">{{ o.label }}
            <button type="button" class="gs-x" :aria-label="'Remove ' + o.label" :disabled="busy === g.key" @click="g.members = g.members.filter(u => u !== o.value); g.dirty = true">×</button></span>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
// 20 Nov 2026 (Khairul): COH Evaluations > Settings > Rater groups (HR and Directors). Named lists of staff
// (cohGroups/{id}, firestore.rules Draft 0.93) used as quick picks on Assigned raters. A person can be in several groups.
import OptionPicker from '@/components/OptionPicker.vue';
import { ROLE_LABEL } from '@/lib/firebase.js';
import { listStaff } from '@/lib/agreements/data.js';
import { listGroups, saveGroup, deleteGroup } from '@/lib/performance/coh.js';
import { askConfirm, showNotice } from '@/lib/confirm.js';
import { toast } from '@/lib/toast.js';

let seq = 0;
export default {
  components: { OptionPicker },
  data() { return { list: [], staff: [], loading: true, error: '', busy: '' }; },
  async mounted() {
    try {
      const [groups, staff] = await Promise.all([listGroups(), listStaff()]);
      this.staff = staff;
      this.list = groups.map(g => ({ key: 'k' + seq++, id: g.id, name: g.name, members: [...(g.members || [])], dirty: false, showList: false }));
    } catch (e) { this.error = e.code === 'permission-denied' ? 'Firestore refused this. Publish security rules Draft 0.93 first.' : 'Could not load the groups.'; }
    this.loading = false;
  },
  methods: {
    // Everyone active, A to Z, plus anyone still in the group who is no longer on the staff list
    optionsFor(g) {
      const opts = this.staff.map(p => ({ value: p.uid, label: `${p.name} (${ROLE_LABEL[p.role] || p.role})` }));
      for (const uid of g.members) if (!this.staff.some(p => p.uid === uid)) opts.push({ value: uid, label: 'Former staff' });
      return opts;
    },
    pickedOf(g) { const opts = this.optionsFor(g); return g.members.map(u => opts.find(o => o.value === u)).filter(Boolean).sort((a, b) => a.label.localeCompare(b.label)); },
    addNew() { this.list.unshift({ key: 'k' + seq++, id: '', name: '', members: [], dirty: true, showList: true }); },
    async save(g) {
      const name = g.name.trim();
      if (!name) return showNotice('Name needed', 'Give the group a name.');
      if (this.list.some(x => x !== g && x.name.trim().toLowerCase() === name.toLowerCase())) return showNotice('Name taken', `There is already a group called ${name}.`);
      this.busy = g.key;
      try {
        g.id = await saveGroup(g.id, name, g.members);
        g.name = name; g.dirty = false; toast('Group saved');
      } catch (e) { showNotice("Couldn't save", e.code === 'permission-denied' ? 'Firestore refused this. Publish security rules Draft 0.93 first.' : (e.message || 'Try again.')); }
      this.busy = '';
    },
    async remove(g) {
      if (g.id && !(await askConfirm({ title: 'Delete this group?', danger: true, confirmText: 'Delete group',
        message: `${g.name || 'This group'} is removed from the quick picks. People already picked as raters stay as they are.` }))) return;
      this.busy = g.key;
      try {
        if (g.id) await deleteGroup(g.id, g.name);
        this.list = this.list.filter(x => x !== g);
      } catch (e) { showNotice("Couldn't delete", e.code === 'permission-denied' ? 'Firestore refused this. Publish security rules Draft 0.93 first.' : (e.message || 'Try again.')); }
      this.busy = '';
    }
  }
};
</script>

<style scoped>
.gs-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
.gs-group { border: 1px solid var(--border); border-radius: 10px; padding: 12px; margin-top: 12px; }
.gs-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
.gs-name { flex: 0 1 320px; min-width: 200px; }
.gs-pick { width: 100%; display: block; }
.gs-pick :deep(.op-btn), .gs-pick :deep(.op-input) { width: 100%; }
.gs-pick :deep(.op-val) { max-width: none; display: block; overflow: hidden; text-overflow: ellipsis; }
.gs-list { margin-top: 8px; }
.gs-toggle { background: none; border: 0; padding: 4px 0; font: inherit; font-size: 13px; font-weight: 600; color: var(--accent); cursor: pointer; }
.gs-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.gs-chip { display: inline-flex; align-items: center; gap: 4px; height: 28px; padding: 0 4px 0 10px; border-radius: 999px; background: var(--accent-soft); color: var(--accent); font-size: 13px; font-weight: 600; }
.gs-x { border: 0; background: none; color: inherit; font-size: 16px; line-height: 1; width: 20px; height: 20px; border-radius: 50%; cursor: pointer; }
.gs-x:hover:not(:disabled) { background: color-mix(in srgb, var(--accent) 18%, transparent); }
.gs-count { font-size: 13px; color: var(--muted); }
.push { flex: 1; }
.del-btn { color: var(--danger); }
.error-text { color: var(--danger); }
</style>
