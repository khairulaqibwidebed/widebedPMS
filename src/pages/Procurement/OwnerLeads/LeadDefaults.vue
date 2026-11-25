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

    <!-- 16 Nov 2026 (Khairul): tabs to swap between the two lists instead of side by side -->
    <div class="tabs" role="tablist" aria-label="Defaults" v-if="!loading">
      <button type="button" role="tab" v-for="box in BOXES" :key="box.key" :aria-selected="String(tab === box.key)" :class="{ on: tab === box.key }" @click="tab = box.key">{{ box.title }} ({{ lists[box.key].length }})</button>
    </div>
    <div class="df-grid" v-if="!loading">
      <section class="card" v-for="box in BOXES" :key="box.key" v-show="tab === box.key">
        <div class="card-head"><h2>{{ box.title }}</h2><button type="button" class="link" @click="reset(box.key)">Reset to the original list</button></div>
        <p class="help" style="margin:0 0 12px">{{ box.help }}</p>
        <!-- 25 Nov 2026 (Khairul): Marketing checklist grouped by category; categories can be added, renamed, moved and deleted -->
        <template v-if="box.key === 'marketing'">
          <!-- 25 Nov 2026 (Khairul): drag and drop instead of arrows. Drag a category by its handle to reorder categories;
               drag an item by its handle within or into another category (dropping on a category's empty space puts it at the end) -->
          <div class="mk-cat" v-for="cat in mkCats" :key="cat.id" :class="{ dragging: drag && drag.item === cat, 'drop-before': isOver(cat, true), 'drop-after': isOver(cat, false), 'drop-in': drag && drag.kind === 'mk' && over && over.target === cat }"
            @dragover="overCat($event, cat)" @drop.prevent="dropCat(cat)">
            <div class="mk-cat-head">
              <span class="grip" draggable="true" @dragstart="startDrag($event, 'cat', cat)" @dragend="endDrag" title="Drag to move this category"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg></span>
              <input class="input mk-cat-name" :value="cat.name" @change="renameCat(cat, $event.target.value)" :aria-label="`Category ${cat.name} name`">
              <span class="muted mk-cat-n">{{ `${rowsIn(cat).length} item${rowsIn(cat).length === 1 ? '' : 's'}` }}</span>
              <button type="button" class="mk-del" @click="deleteCat(cat)" :aria-label="`Delete category ${cat.name}`" :title="`Delete category ${cat.name}`"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/></svg></button>
            </div>
            <div class="df-list">
              <div class="df-row" v-for="(r, i) in rowsIn(cat)" :key="r.id" :class="{ dragging: drag && drag.item === r, 'drop-before': isOver(r, true), 'drop-after': isOver(r, false) }"
                @dragover="overRow($event, 'mk', r)" @drop.prevent.stop="drag && drag.kind === 'cat' ? dropCat(cat) : dropRow('mk', r)">
                <span class="grip" draggable="true" @dragstart="startDrag($event, 'mk', r)" @dragend="endDrag" title="Drag to move"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg></span>
                <span class="df-n">{{ i + 1 }}</span>
                <input class="input" v-model="r.title" :aria-label="`${cat.name} item ${i + 1}`">
                <button type="button" class="icon-btn" @click="removeRow(r)" aria-label="Remove" title="Remove">×</button>
              </div>
              <p class="muted mk-empty" v-if="!rowsIn(cat).length">No items yet. Add one below, or delete this category.</p>
            </div>
            <form class="df-add mk-add" @submit.prevent="addTo(cat)">
              <input class="input" v-model="cat.adding" :placeholder="`Add to ${cat.name}, e.g. Listing photos shoot`" :aria-label="`Add to ${cat.name}`">
              <button type="submit" class="btn btn-sm" :disabled="!cat.adding.trim()">+ Add</button>
            </form>
          </div>
          <form class="mk-new" @submit.prevent="newCat()">
            <input class="input" v-model="catName" placeholder="New category name, e.g. Print" aria-label="New category name">
            <button type="submit" class="btn" :disabled="!catName.trim()">+ New category</button>
          </form>
          <p class="help" style="margin:8px 0 0">A category with no items is not kept when you save.</p>
        </template>
        <template v-else>
        <div class="df-list">
          <div class="df-row" v-for="(r, i) in lists[box.key]" :key="r.id" :class="{ dragging: drag && drag.item === r, 'drop-before': isOver(r, true), 'drop-after': isOver(r, false) }"
            @dragover="overRow($event, 'setup', r)" @drop.prevent.stop="dropRow('setup', r)">
            <span class="grip" draggable="true" @dragstart="startDrag($event, 'setup', r)" @dragend="endDrag" title="Drag to move"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg></span>
            <span class="df-n">{{ i + 1 }}</span>
            <input class="input" v-model="r.title" :aria-label="`${box.title} row ${i + 1}`">
            <span class="pill grey" v-if="r.kind === 'wifi'" title="Shows a Wifi name and password field">Wifi</span>
            <span class="pill grey" v-else-if="r.kind === 'link'" title="Shows a link field">Link</span>
            <button type="button" class="icon-btn" @click="lists[box.key].splice(i, 1)" aria-label="Remove" title="Remove">×</button>
          </div>
          <p class="muted" v-if="!lists[box.key].length" style="margin:0">No rows. Add at least one.</p>
        </div>
        <form class="df-add" @submit.prevent="add(box.key)">
          <input class="input" v-model="adding[box.key]" :placeholder="box.placeholder" :aria-label="`Add to ${box.title}`">
          <button type="submit" class="btn" :disabled="!adding[box.key].trim()">+ Add</button>
        </form>
        </template>
      </section>
    </div>
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
  data() { return { BOXES, tab: 'setup', lists: { setup: [], marketing: [] }, adding: { setup: '', marketing: '' }, mkCats: [], catName: '', drag: null, over: null, start: '', loading: true, busy: false, error: '', okMsg: '', meta: null }; },
  computed: {
    dirty() { return !this.loading && snap(this.lists) !== this.start; },
    updatedText() {
      const m = this.meta; if (!m?.saved) return 'Using the original lists (no defaults saved yet).';
      const at = m.updatedAt?.toDate ? m.updatedAt.toDate().toLocaleString('en-MY', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
      return `Last saved${m.updatedByName ? ' by ' + m.updatedByName : ''}${at ? ', ' + at : ''}.`;
    }
  },
  async mounted() {
    window.addEventListener('beforeunload', this.warn);
    try { this.meta = await loadLeadDefaults(true); this.lists = rowsOf(this.meta); this.catsFromRows(); } catch (e) { this.error = errText(e, 'load the defaults'); }
    this.start = snap(this.lists); this.loading = false;
  },
  unmounted() { window.removeEventListener('beforeunload', this.warn); },
  async beforeRouteLeave() {
    if (!this.dirty) return true;
    return askConfirm({ title: 'Leave without saving?', message: 'Your changes to the defaults will be lost.', confirmText: 'Leave', danger: true });
  },
  methods: {
    warn(e) { if (!this.dirty) return; e.preventDefault(); e.returnValue = ''; },
    add(k) { const t = this.adding[k].trim(); if (!t) return; this.lists[k].push({ id: lineId(), title: t, kind: '' }); this.adding[k] = ''; },
    reset(k) {
      this.lists[k] = k === 'setup' ? SETUP_DEFAULT.map(x => ({ id: lineId(), key: x.key, title: x.title, kind: x.kind || '' })) : MK_DEFAULT.map(t => ({ id: lineId(), title: t, group: mkGroupOf({ title: t }), kind: '' }));
      if (k === 'marketing') this.catsFromRows();
    },
    // ---- Marketing categories (25 Nov 2026). The rows stay one flat list (saved as { title, group }), always kept in category order.
    catsFromRows() {
      const names = [...new Set(this.lists.marketing.map(r => (r.group || '').trim() || 'Other'))];
      this.lists.marketing.forEach(r => { r.group = (r.group || '').trim() || 'Other'; });
      this.mkCats = names.map(name => ({ id: lineId(), name, adding: '' }));
      this.reflow();
    },
    reflow() { const order = this.mkCats.map(c => c.name); this.lists.marketing = [...this.lists.marketing].sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group)); },
    rowsIn(cat) { return this.lists.marketing.filter(r => r.group === cat.name); },
    // ---- Drag and drop (25 Nov 2026). kind: 'mk' (marketing item), 'cat' (marketing category), 'setup' (Operations Setup row).
    startDrag(e, kind, item) {
      this.drag = { kind, item }; this.over = null;
      e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', '');
      const box = e.target.closest(kind === 'cat' ? '.mk-cat' : '.df-row'); if (box) e.dataTransfer.setDragImage(box, 16, 16);
    },
    endDrag() { this.drag = null; this.over = null; },
    isOver(t, before) { return !!this.over && this.over.target === t && this.over.before === before && this.drag?.item !== t; },
    half(e) { const r = e.currentTarget.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; },
    overRow(e, kind, r) { if (this.drag?.kind !== kind) return; e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move'; this.over = { target: r, before: this.half(e) }; },
    overCat(e, cat) {
      if (this.drag?.kind === 'cat') { e.preventDefault(); this.over = { target: cat, before: this.half(e) }; }
      else if (this.drag?.kind === 'mk') { e.preventDefault(); this.over = { target: cat }; }   // empty space of a category: add to its end
    },
    dropRow(kind, target) {
      const d = this.drag, before = this.over?.before; this.endDrag();
      if (!d || d.kind !== kind || d.item === target) return;
      const key = kind === 'mk' ? 'marketing' : 'setup', l = this.lists[key].filter(x => x !== d.item);
      l.splice(l.indexOf(target) + (before ? 0 : 1), 0, d.item);
      if (kind === 'mk') d.item.group = target.group;
      this.lists[key] = l; if (kind === 'mk') this.reflow();
    },
    dropCat(cat) {
      const d = this.drag, before = this.over?.before; this.endDrag();
      if (!d) return;
      if (d.kind === 'mk') { d.item.group = cat.name; this.lists.marketing = [...this.lists.marketing.filter(x => x !== d.item), d.item]; this.reflow(); return; }
      if (d.kind !== 'cat' || d.item === cat) return;
      const c = this.mkCats.filter(x => x !== d.item); c.splice(c.indexOf(cat) + (before ? 0 : 1), 0, d.item); this.mkCats = c; this.reflow();
    },
    removeRow(r) { this.lists.marketing = this.lists.marketing.filter(x => x !== r); },
    addTo(cat) { const t = cat.adding.trim(); if (!t) return; this.lists.marketing.push({ id: lineId(), title: t, group: cat.name, kind: '' }); cat.adding = ''; this.reflow(); },
    renameCat(cat, v) {
      const name = v.trim();
      if (!name || name === cat.name) return;
      if (this.mkCats.some(c => c !== cat && c.name.toLowerCase() === name.toLowerCase())) { this.error = `There is already a category called ${name}.`; return; }
      this.lists.marketing.forEach(r => { if (r.group === cat.name) r.group = name; });
      cat.name = name; this.error = '';
    },
    newCat() {
      const name = this.catName.trim(); if (!name) return;
      if (this.mkCats.some(c => c.name.toLowerCase() === name.toLowerCase())) { this.error = `There is already a category called ${name}.`; return; }
      this.mkCats.push({ id: lineId(), name, adding: '' }); this.catName = ''; this.error = '';
    },
    async deleteCat(cat) {
      const n = this.rowsIn(cat).length;
      if (n && !(await askConfirm({ title: `Delete ${cat.name}?`, message: `Its ${n} item${n === 1 ? '' : 's'} will be removed from the checklist too. Nothing changes until you press Save defaults.`, confirmText: 'Delete category', danger: true }))) return;
      this.lists.marketing = this.lists.marketing.filter(r => r.group !== cat.name);
      this.mkCats = this.mkCats.filter(c => c !== cat);
    },
    async save() {
      this.error = ''; this.okMsg = '';
      const empty = ['setup', 'marketing'].find(k => !this.lists[k].some(r => r.title.trim()));
      if (empty) { this.tab = empty; this.error = 'Keep at least one row in each list.'; return; }
      this.busy = true;
      try {
        await saveLeadDefaults({ setup: this.lists.setup.map(r => ({ key: r.key, title: r.title, kind: r.kind })), marketing: this.lists.marketing.map(r => ({ title: r.title, group: (r.group || '').trim() })) });
        this.meta = await loadLeadDefaults(true); this.lists = rowsOf(this.meta); this.catsFromRows(); this.start = snap(this.lists);
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
.grip { display: inline-grid; place-items: center; flex: none; width: 20px; height: 32px; color: #94a3b8; cursor: grab; border-radius: 6px; }
.grip:hover { color: var(--text); background: #f1f5f9; }
.grip:active { cursor: grabbing; }
.grip svg { width: 16px; height: 16px; fill: currentColor; }
.dragging { opacity: .4; }
.df-row.drop-before { box-shadow: 0 -2px 0 var(--accent); }
.df-row.drop-after { box-shadow: 0 2px 0 var(--accent); }
.mk-cat.drop-before { box-shadow: 0 -3px 0 var(--accent); }
.mk-cat.drop-after { box-shadow: 0 3px 0 var(--accent); }
.mk-cat.drop-in { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 4%, transparent); }
.mk-cat { border: 1px solid var(--border); border-radius: 10px; padding: 12px; margin-bottom: 12px; }
.mk-cat-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.mk-cat-name { flex: 1; min-width: 0; height: 36px; font-weight: 700; background: #f8fafc; }
.mk-cat-n { font-size: 12px; white-space: nowrap; }
.mk-cat-head .icon-btn:disabled { opacity: .35; cursor: default; }
.mk-del { display: inline-grid; place-items: center; width: 32px; height: 32px; padding: 0; border: 0; border-radius: 8px; background: none; color: var(--muted); cursor: pointer; transition: background .15s, color .15s; }
.mk-del svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.mk-del:hover, .mk-del:focus-visible { background: #fef2f2; color: #ef4444; }
.mk-empty { margin: 0; font-size: 13px; }
.mk-add { margin-top: 10px; }
.mk-add .input { height: 34px; }
.mk-new { display: flex; gap: 8px; margin-top: 4px; }
.mk-new .input { flex: 1; min-width: 0; height: 38px; }
</style>
