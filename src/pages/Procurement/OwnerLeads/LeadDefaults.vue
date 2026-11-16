<template>
  <main class="content">
    <div class="loading-bar" v-show="loading || busy"></div>
    <div class="page-head">
      <div>
        <h1>Owner Leads defaults</h1>
        <div class="sub"><RouterLink to="/Procurement/listing-flow">Owner Leads</RouterLink> › Defaults · the rows every new listing starts with. Listings already started keep their own rows.</div>
      </div>
      <div class="head-tools">
        <RouterLink class="btn" to="/Procurement/listing-flow">Back</RouterLink>
        <button type="button" class="btn btn-primary" @click="save()" :disabled="busy || !dirty">{{ busy ? 'Saving…' : 'Save defaults' }}</button>
      </div>
    </div>
    <div class="notice ok" v-show="okMsg">{{ okMsg }}</div>
    <div class="notice error" v-show="error">{{ error }}</div>

    <!-- 16 Nov 2026 (Khairul): tabs to swap between the two lists instead of side by side -->
    <div class="tabs" role="tablist" aria-label="Defaults" v-if="!loading">
      <button type="button" role="tab" v-for="box in BOXES" :key="box.key" :aria-selected="String(tab === box.key)" :class="{ on: tab === box.key }" @click="tab = box.key">{{ box.title }} ({{ lists[box.key].length }})</button>
    </div>
    <div class="df-grid" v-if="!loading">
      <section class="card" v-for="box in BOXES" :key="box.key" v-show="tab === box.key">
        <div class="card-head"><h2>{{ box.title }}</h2><button type="button" class="link" @click="reset(box.key)">Reset to the original list</button></div>
        <p class="help" style="margin:0 0 12px">{{ box.help }}</p>
        <div class="df-list">
          <div class="df-row" v-for="(r, i) in lists[box.key]" :key="r.id">
            <span class="df-n">{{ i + 1 }}</span>
            <input class="input" v-model="r.title" :aria-label="`${box.title} row ${i + 1}`">
            <!-- 16 Nov 2026: Marketing rows have a group (the folding sections on the Marketing stage) -->
            <input class="input df-grp" v-if="box.key === 'marketing'" v-model="r.group" list="mkGroups" placeholder="Group, e.g. Social media" :aria-label="`Group of row ${i + 1}`">
            <span class="pill grey" v-if="r.kind === 'wifi'" title="Shows a Wifi name and password field">Wifi</span>
            <span class="pill grey" v-else-if="r.kind === 'link'" title="Shows a link field">Link</span>
            <button type="button" class="icon-btn" :disabled="i === 0" @click="move(box.key, i, -1)" aria-label="Move up" title="Move up">↑</button>
            <button type="button" class="icon-btn" :disabled="i === lists[box.key].length - 1" @click="move(box.key, i, 1)" aria-label="Move down" title="Move down">↓</button>
            <button type="button" class="icon-btn" @click="lists[box.key].splice(i, 1)" aria-label="Remove" title="Remove">×</button>
          </div>
          <p class="muted" v-if="!lists[box.key].length" style="margin:0">No rows. Add at least one.</p>
        </div>
        <form class="df-add" @submit.prevent="add(box.key)">
          <input class="input" v-model="adding[box.key]" :placeholder="box.placeholder" :aria-label="`Add to ${box.title}`">
          <input class="input df-grp" v-if="box.key === 'marketing'" v-model="addGroup" list="mkGroups" placeholder="Group" aria-label="Group of the new row">
          <button type="submit" class="btn" :disabled="!adding[box.key].trim()">+ Add</button>
        </form>
      </section>
    </div>
    <datalist id="mkGroups"><option v-for="g in groups" :key="g" :value="g"></option></datalist>
    <p class="muted" v-if="!loading && updatedText" style="margin-top:12px">{{ updatedText }}</p>
  </main>
</template>

<script>
// Owner Leads > Defaults (/Procurement/listing-flow/defaults), 16 Nov 2026. Directors only.
// The Operations Setup rows and the Marketing checklist that every NEW listing starts with (config/ownerLeadDefaults,
// read by createListing in lib/owner-leads.js). Listings already started keep their own rows.
import { loadLeadDefaults, saveLeadDefaults, SETUP_DEFAULT, MK_DEFAULT, mkGroupOf, lineId, errText } from '@/lib/owner-leads.js';
import { askConfirm } from '@/lib/confirm.js';

const BOXES = [
  { key: 'setup', title: 'Operations Setup', help: 'Operations tick each row before Marketing starts.', placeholder: 'e.g. Smart lock set up' },
  { key: 'marketing', title: 'Marketing checklist', help: 'Marketing ticks these once the unit is ready.', placeholder: 'e.g. Listing photos shoot' }
];
const rowsOf = d => ({
  setup: d.setup.map(x => ({ id: lineId(), key: x.key, title: x.title, kind: x.kind || '' })),
  marketing: d.marketing.map(x => ({ id: lineId(), title: x.title, group: x.group || '', kind: '' }))
});
const snap = l => JSON.stringify({ s: l.setup.map(x => [x.key, x.title.trim(), x.kind]), m: l.marketing.map(x => [x.title.trim(), (x.group || '').trim()]) });

export default {
  data() { return { BOXES, tab: 'setup', lists: { setup: [], marketing: [] }, adding: { setup: '', marketing: '' }, addGroup: '', start: '', loading: true, busy: false, error: '', okMsg: '', meta: null }; },
  computed: {
    // Groups already used, offered when typing a group
    groups() { return [...new Set(['Branding', 'Online', 'Social media', 'Print', ...this.lists.marketing.map(r => (r.group || '').trim()).filter(Boolean)])]; },
    dirty() { return !this.loading && snap(this.lists) !== this.start; },
    updatedText() {
      const m = this.meta; if (!m?.saved) return 'Using the original lists (no defaults saved yet).';
      const at = m.updatedAt?.toDate ? m.updatedAt.toDate().toLocaleString('en-MY', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
      return `Last saved${m.updatedByName ? ' by ' + m.updatedByName : ''}${at ? ', ' + at : ''}.`;
    }
  },
  async mounted() {
    window.addEventListener('beforeunload', this.warn);
    try { this.meta = await loadLeadDefaults(true); this.lists = rowsOf(this.meta); } catch (e) { this.error = errText(e, 'load the defaults'); }
    this.start = snap(this.lists); this.loading = false;
  },
  unmounted() { window.removeEventListener('beforeunload', this.warn); },
  async beforeRouteLeave() {
    if (!this.dirty) return true;
    return askConfirm({ title: 'Leave without saving?', message: 'Your changes to the defaults will be lost.', confirmText: 'Leave', danger: true });
  },
  methods: {
    warn(e) { if (!this.dirty) return; e.preventDefault(); e.returnValue = ''; },
    move(k, i, by) { const l = this.lists[k], [r] = l.splice(i, 1); l.splice(i + by, 0, r); },
    add(k) { const t = this.adding[k].trim(); if (!t) return; this.lists[k].push({ id: lineId(), title: t, kind: '', ...(k === 'marketing' ? { group: this.addGroup.trim() } : {}) }); this.adding[k] = ''; },
    reset(k) {
      this.lists[k] = k === 'setup' ? SETUP_DEFAULT.map(x => ({ id: lineId(), key: x.key, title: x.title, kind: x.kind || '' })) : MK_DEFAULT.map(t => ({ id: lineId(), title: t, group: mkGroupOf({ title: t }), kind: '' }));
    },
    async save() {
      this.error = ''; this.okMsg = '';
      const empty = ['setup', 'marketing'].find(k => !this.lists[k].some(r => r.title.trim()));
      if (empty) { this.tab = empty; this.error = 'Keep at least one row in each list.'; return; }
      this.busy = true;
      try {
        await saveLeadDefaults({ setup: this.lists.setup.map(r => ({ key: r.key, title: r.title, kind: r.kind })), marketing: this.lists.marketing.map(r => ({ title: r.title, group: (r.group || '').trim() })) });
        this.meta = await loadLeadDefaults(true); this.lists = rowsOf(this.meta); this.start = snap(this.lists);
        this.okMsg = 'Defaults saved. New listings start with these rows.';
      } catch (e) { this.error = errText(e, 'save the defaults'); }
      this.busy = false;
    }
  }
};
</script>

<style scoped>
.head-tools { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.df-grid { max-width: 760px; }
.df-list { display: grid; gap: 8px; }
.df-row { display: flex; align-items: center; gap: 8px; }
.df-row .input { flex: 1; min-width: 0; height: 38px; }
.df-row .df-grp, .df-add .df-grp { flex: 0 0 170px; }
@media (max-width: 600px) { .df-row .df-grp, .df-add .df-grp { flex-basis: 110px; } }
.df-n { width: 22px; flex: none; text-align: right; color: var(--muted); font-size: 12px; }
.df-row .icon-btn:disabled { opacity: .35; cursor: default; }
.df-add { display: flex; gap: 8px; margin-top: 14px; }
.df-add .input { flex: 1; min-width: 0; height: 38px; }
</style>
