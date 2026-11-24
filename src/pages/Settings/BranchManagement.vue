<template>
  <main class="content">
    <!-- 23 Nov 2026 (Khairul): the first page lists the branches; clicking one opens that branch on its own (?b=id) -->
    <a class="bm-back" href="#" v-if="form" @click.prevent="back()">← All branches</a>
    <div class="page-head" v-else>
      <div>
        <h1>Branch Management</h1>
        <div class="sub">Each branch, its properties and its outside links (Google Drive, Google Sheets and others). Who works in a branch is set on Staff accounts.</div>
      </div>
      <div class="bm-head-acts">

      </div>
    </div>

    <div class="loading-bar" v-show="loading" style="margin-bottom:12px"></div>
    <div class="notice error" v-show="error">{{ error }}</div>

    <!-- First set-up: one branch per state, with its properties and Drive folder -->
    <section class="card bm-setup" v-if="!form && !loading && !branches.length && canEdit && !isBD">
      <h2>No branches yet</h2>
      <p class="help">Start with one branch per state: each gets the properties in that state and the state's Google Drive folder. You can rename, split and move properties afterwards.</p>
      <button class="btn btn-primary" type="button" :disabled="busy || !seedCount" @click="seed()">{{ busy ? 'Creating…' : `Create ${seedCount} branch${seedCount === 1 ? '' : 'es'} from states` }}</button>
    </section>
    <p class="muted" v-else-if="!form && !loading && !branches.length">No branches yet.</p>

    <BranchGuide v-if="guideOpen" @close="guideOpen = false" />

    <!-- Move a property to another branch: saved straight away (both branches), the rest of the open form is kept -->
    <div class="modal-back" v-if="mv" @click.self="mv.busy || (mv = null)" v-esc="() => { if (!mv.busy) mv = null; }">
      <form class="modal bm-mv" role="dialog" :aria-label="`Move ${mv.p.name}`" @submit.prevent="doMove()">
        <h2>Move property</h2>
        <p class="help">{{ `${mv.p.name} moves from ${form.name || 'this branch'} to the branch you pick. This is saved straight away.` }}</p>
        <div class="notice error" v-show="mv.error">{{ mv.error }}</div>
        <div class="field"><label class="req">Move to</label>
          <OptionPicker class="bm-pick" v-model="mv.to" :options="moveOptions" label="Move to" placeholder="Choose a branch" /></div>
        <p class="help">Staff access doesn't change by itself: on Staff accounts, untick it for people who should lose it and tick it for the new branch's staff.</p>
        <div class="modal-foot">
          <span style="flex:1"></span>
          <button type="button" class="btn" :disabled="mv.busy" @click="mv = null">Cancel</button>
          <button class="btn btn-primary" :disabled="mv.busy || !mv.to">{{ mv.busy ? 'Moving…' : 'Move' }}</button>
        </div>
      </form>
    </div>

    <!-- Skeletons while loading (23 Nov 2026): the list, or the branch opened from the address -->
    <div class="card table-wrap bm-overview" v-if="loading && !branches.length && !$route.query.b">
      <table class="table bm-table"><thead><tr><th>Branch</th><th>State</th><th>Drive folder</th><th class="num">Links</th><th class="num">Properties</th><th>Staff</th><th></th></tr></thead>
        <tbody><SkeletonRows table :cols="7" :rows="3" /></tbody></table>
    </div>
    <section class="card bm-detail bm-skel" v-if="loading && !form && $route.query.b">
      <div class="bm-top"><div class="bm-title"><span class="bm-av"></span><div class="bm-skcol"><span class="sk" style="width:180px;height:18px"></span><span class="sk" style="width:120px;height:10px"></span></div></div></div>
      <div class="bm-tabs"><span class="sk" v-for="n in 5" :key="n" style="width:80px;height:10px;margin:16px 0"></span></div>
      <div class="bm-body"><SkeletonRows :rows="4" :avatar="false" :cols="2" /></div>
    </section>

    <!-- Branch list -->
    <div class="bm-toolbar" v-if="!form && branches.length">
      <span class="muted">{{ `${branches.length} ${branches.length === 1 ? 'branch' : 'branches'}` }}</span>
      <div class="bm-tool-acts">
        <button class="btn bm-info" type="button" @click="guideOpen = true" aria-label="How Branch Management works" title="How Branch Management works">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
        </button>
        <button class="btn btn-primary" type="button" v-if="canEdit && !isBD" @click="startNew()">+ New branch</button>
      </div>
    </div>
    <div class="card table-wrap bm-overview" v-if="!form && branches.length">
      <table class="table bm-table">
        <thead><tr><th>Branch</th><th>State</th><th>Drive folder</th><th class="num">Links</th><th class="num">Properties</th><th>Staff</th><th></th></tr></thead>
        <tbody>
          <tr v-for="(b, i) in branches" :key="b.id" class="bm-row" :style="{ animationDelay: `${Math.min(i, 10) * 40}ms` }" :class="{ off: !b.active }" @click="open(b)">
            <!-- 24 Nov 2026 (Khairul): fuller rows: property names under the branch, Drive folder, links, staff initials -->
            <td><span class="bm-cell-name"><span class="bm-av md">{{ initials(b.name) }}</span>
              <span class="bm-name-col"><span><b>{{ b.name }}</b><span class="tag bm-arch" v-if="!b.active">Archived</span></span>
                <span class="bm-sub">{{ propSummary(b) }}</span></span></span></td>
            <td><span class="bm-pill" v-if="b.state">{{ b.state }}</span><span class="muted" v-else>—</span></td>
            <td><span class="bm-pill" :class="b.driveLink ? 'on' : 'warn'">{{ b.driveLink ? 'Linked' : 'Not linked' }}</span></td>
            <td class="num">{{ b.links.length }}</td>
            <td class="num">{{ b.propertyIds.length }}</td>
            <td><span class="bm-faces" v-if="staffIn(b.id).length" :title="staffIn(b.id).map(u => u.displayName || u.email).join(', ')">
                <span class="bm-face" v-for="u in staffIn(b.id).slice(0, 3)" :key="u.id">{{ initials(u.displayName || u.email) }}</span>
                <span class="bm-face more" v-if="staffIn(b.id).length > 3">{{ `+${staffIn(b.id).length - 3}` }}</span></span>
              <span class="muted" v-else>None</span></td>
            <td class="bm-rmcell"><button type="button" class="btn btn-sm" @click.stop="open(b)">{{ canEdit ? 'Edit' : 'View' }}</button></td>
          </tr>
        </tbody>
      </table>
    </div>

      <section class="card bm-detail bm-enter" v-if="form" :key="form.id">
        <div class="bm-top">
          <div class="bm-title">
            <span class="bm-av">{{ initials(form.name || 'New') }}</span>
            <div>
              <h2>{{ form.isNew ? (form.name || 'New branch') : form.name || 'Branch' }}</h2>
              <div class="bm-meta"><span class="bm-pill">{{ form.state || 'No state' }}</span>
                <span class="muted" v-if="!form.isNew">{{ `${form.propertyIds.length + hidden.length} properties · ${staffIn(form.id).length} staff` }}</span></div>
            </div>
          </div>
          <label class="bm-switch" :class="{ dis: !canEdit }" :title="form.active ? 'Active' : 'Archived (hidden on Staff accounts)'">
            <span>{{ form.active ? 'Active' : 'Archived' }}</span>
            <input type="checkbox" v-model="form.active" :disabled="!canEdit || isBD"><i aria-hidden="true"></i>
          </label>
        </div>

        <div class="bm-tabs" role="tablist">
          <button v-for="t in tabs" :key="t.key" type="button" role="tab" class="bm-tab" :class="{ on: tab === t.key }" :aria-selected="String(tab === t.key)" @click="tab = t.key">
            <svg class="bm-ti" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path v-for="(d, k) in ICONS[t.key]" :key="k" :d="d" /></svg>
            {{ t.label }}<span class="bm-cnt" v-if="t.count !== undefined">{{ t.count }}</span>
          </button>
        </div>

        <div class="bm-body bm-pane" :key="tab">
          <div class="notice error" v-show="formError">{{ formError }}</div>

          <!-- Details -->
          <div v-if="tab === 'details'" class="bm-grid">
            <div class="field"><label class="req" for="bmName">Name</label><input class="input" id="bmName" v-model="form.name" maxlength="60" :disabled="!canEdit" placeholder="e.g. KL Central"></div>
            <div class="field"><label>State</label><OptionPicker class="bm-pick" v-model="form.state" :options="stateOptions" label="State" :disabled="!canEdit" searchable /></div>
            <p class="help bm-full">Archived branches are hidden on Staff accounts. Use the switch at the top right.</p>
            <div class="bm-tiles bm-full" v-if="!form.isNew">
              <button type="button" class="bm-tile" v-for="(t, i) in tiles" :key="t.key" :style="{ animationDelay: `${60 + i * 50}ms` }" @click="tab = t.key">
                <span class="bm-tile-ico" :class="t.tone"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path v-for="(d, k) in ICONS[t.key]" :key="k" :d="d" /></svg></span>
                <span><span class="bm-tile-k">{{ t.label }}</span><b class="bm-tile-v" :class="{ txt: typeof t.value === 'string' }" :title="String(t.value)">{{ t.value }}</b></span>
              </button>
            </div>
          </div>

          <!-- Properties -->
          <template v-else-if="tab === 'properties'">
            <div class="bm-bar">
              <input class="input bm-search" type="search" v-model="q" placeholder="Search properties…" aria-label="Search properties">
              <OptionPicker v-if="canEdit" class="bm-add" multiple searchable picked-first v-model="form.propertyIds" :options="propertyOptions" label="Add properties" display="+ Add properties" />
            </div>
            <Paged :items="shownProps" v-slot="{ pageRows }" v-if="shownProps.length">
              <div class="table-wrap">
                <table class="table bm-table">
                  <thead><tr><th>Property</th><th>Code</th><th>State</th><th v-if="canEdit && !isBD"></th></tr></thead>
                  <tbody>
                    <tr v-for="p in pageRows" :key="p.id">
                      <td class="strong">{{ p.name }}<span class="tag bm-move" v-if="movingFrom(p.id)">{{ `moves from ${movingFrom(p.id)}` }}</span></td>
                      <td><span class="bm-code">{{ p.code || '—' }}</span></td>
                      <td class="muted">{{ shortState(p.state) || '—' }}</td>
                      <td v-if="canEdit && !isBD" class="bm-rmcell"><button type="button" class="bm-dots" :aria-label="`More for ${p.name}`" aria-haspopup="menu" :aria-expanded="String(menu && menu.id === p.id)" @click="openMenu($event, p)">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg></button></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Paged>
            <p class="muted bm-none" v-else>{{ q ? 'No property matches.' : 'No properties in this branch yet.' }}</p>
            <p class="help">A property is in one branch. Adding one from another branch moves it here when you save.<template v-if="hidden.length">{{ ` ${hidden.length} more ${hidden.length === 1 ? 'property is' : 'properties are'} in this branch that you can't see; they stay.` }}</template></p>
          </template>

          <!-- Links -->
          <template v-else-if="tab === 'links'">
            <!-- 24 Nov 2026 (Khairul): the "Maintenance Google Sheet" link box was removed. Open Sheet on the Maintenance page uses
                 the address the Apps Script sends back on each sync (right file every year); a link already saved stays as a fallback. -->
            <!-- 23 Nov 2026 (Khairul): each branch its own Maintenance Master Record Sheet (Directors). lib/maintenance-sheet.js -->
            <div class="bm-sync" v-if="isDirector && !form.isNew">
              <div class="bm-sync-head"><b>Sheet sync</b>
                <span class="bm-pill" :class="syncState.cls" v-if="sync && !sync.loading">{{ syncState.label }}</span></div>
              <p class="help">Keeps this branch's Maintenance Master Record Sheet in step with the PMS: only this branch's properties' tickets go to it. Sheet edits to Area, Action Date, Solution and Cost Remarks come back; money always comes from the PMS. Set-up steps: apps-script-maintenance-sheet/SETUP.md (one Apps Script per Sheet).</p>
              <SkeletonRows v-if="!sync || sync.loading" :rows="2" :avatar="false" :cols="1" />
              <template v-else>
                <div class="notice warn" v-if="sync.legacy">This branch's tickets sync through the old single Sheet settings for now. Press Save to move them here. Nothing changes in the Sheet.</div>
                <div class="notice error" v-show="sync.error">{{ sync.error }}</div>
                <div class="notice ok" v-show="sync.ok">{{ sync.ok }}</div>
                <div class="field"><label for="bmScript">Apps Script web app URL</label>
                  <input class="input" id="bmScript" v-model="sync.scriptUrl" placeholder="https://script.google.com/macros/s/…/exec"></div>
                <p class="help">"Open Sheet" on the Maintenance page goes to this script's Sheet for the year shown.</p>
                <div class="bm-sync-acts">
                  <button type="button" class="btn" v-if="sync.saved" :disabled="sync.busy" @click="makeYear()">{{ `Make ${nextYear} file now` }}</button>
                  <span style="flex:1"></span>
                  <button type="button" class="link rm" v-if="sync.saved" :disabled="sync.busy" @click="saveSync(true)">Turn off</button>
                  <button type="button" class="btn btn-primary" :disabled="sync.busy || !sync.scriptUrl.trim()" @click="saveSync(false)">{{ sync.busy ? 'Saving…' : 'Save Sheet sync' }}</button>
                </div>
                <p class="help" v-if="sync.yearMade">Ready: <a :href="sync.yearMade.url" target="_blank" rel="noopener">{{ sync.yearMade.name }}</a></p>
              </template>
            </div>
            <div class="bm-links">
              <div class="bm-k">Other links</div>
              <p class="help" v-if="!form.links.length">None yet.</p>
              <div class="bm-link" v-for="(l, i) in form.links" :key="i">
                <input class="input" v-model="l.label" maxlength="60" placeholder="Name, e.g. Housekeeping roster" :disabled="!canEdit" :aria-label="`Link ${i + 1} name`">
                <div class="bm-url"><input class="input" v-model="l.url" placeholder="https://…" :disabled="!canEdit" :aria-label="`Link ${i + 1} address`"><a v-if="isUrl(l.url)" :href="l.url" target="_blank" rel="noopener" class="bm-open">Open ↗</a></div>
                <button type="button" class="link rm" v-if="canEdit" @click="form.links.splice(i, 1)">Remove</button>
              </div>
              <button type="button" class="btn btn-sm" v-if="canEdit && form.links.length < MAX_LINKS" @click="form.links.push({ label: '', url: '' })">+ Add link</button>
            </div>
          </template>

          <!-- Drive folder: the state's folder (the Google Drive Folders page, for this branch's state only) -->
          <template v-else-if="tab === 'drive'">
            <DriveStates v-if="form.state" embedded :only-state="form.state" :key="form.state" />
            <p class="muted bm-none" v-else>Choose the branch's state on Details first.</p>
          </template>

          <!-- Staff (read-only; set on Staff accounts) -->
          <template v-else-if="tab === 'staff'">
            <p class="help">Who is in a branch is set on Settings › Staff accounts (their branches, then their properties).</p>
            <div class="table-wrap" v-if="staffIn(form.id).length">
              <table class="table bm-table">
                <thead><tr><th>Name</th><th>Role</th><th>Properties in this branch</th></tr></thead>
                <tbody>
                  <tr v-for="u in staffIn(form.id)" :key="u.id">
                    <td class="strong"><RouterLink v-if="canStaff" :to="{ path: '/Settings/staff', query: { open: u.id } }">{{ u.displayName || u.email }}</RouterLink><template v-else>{{ u.displayName || u.email }}</template></td>
                    <td>{{ ROLE_LABEL[u.role] || u.role }}</td>
                    <td>{{ u.role === 'director' ? 'All' : u.role === 'branchDirector' ? 'All in branch' : `${(u.properties || []).filter(p => allIds(form).includes(p)).length} of ${allIds(form).length}` }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p class="muted bm-none" v-else>Nobody is set to this branch yet.</p>
          </template>
        </div>

        <!-- 3-dots menu on a property row (23 Nov 2026, Khairul): Move to another branch, or Remove from this one -->
        <template v-if="menu">
          <div class="bm-menu-back" @click="menu = null"></div>
          <div class="bm-menu" role="menu" :style="{ top: menu.y + 'px', left: menu.x + 'px' }" @keydown.esc="menu = null">
            <button type="button" role="menuitem" :disabled="form.isNew" :title="form.isNew ? 'Save the new branch first' : ''" @click="startMove(menu.p)">Move to another branch…</button>
            <button type="button" role="menuitem" class="rm" @click="removeProp(menu.p.id); menu = null">Remove from this branch</button>
          </div>
        </template>

        <div class="bm-foot">
          <span class="muted bm-upd">{{ !form.isNew && form.updatedByName ? `Last changed by ${form.updatedByName}` : form.isNew ? 'Not saved yet' : '' }}</span>
          <div class="bm-foot-btns" v-if="canEdit">
            <button type="button" class="btn" @click="back()">Cancel</button>
            <button type="button" class="btn btn-primary" :disabled="busy" @click="save()">{{ busy ? 'Saving…' : form.isNew ? 'Create branch' : 'Save' }}</button>
          </div>
        </div>
      </section>
  </main>
</template>

<script>
// Settings > Branch Management (23 Nov 2026, Khairul). Replaces "Google Drive Folders" in the sidebar; the per-state Drive
// folders page is still there (Drive folders by state) because uploads use it. Access: the Google Drive Folders tick
// (Base: see; Full: change). Data: lib/branches.js. Staff are set to branches on Staff accounts, not here.
import { collection, getDocs } from 'firebase/firestore';
import { db, ROLE_LABEL } from '@/lib/firebase.js';
import { useSession } from '@/stores/session.js';
import { STATES, stateOf, shortState } from '@/lib/states.js';
import { loadProperties, friendlyError } from '@/lib/finance-data.js';
import { loadDriveStates } from '@/lib/drive-states.js';
import { loadBranches, saveBranch, branchesFromStates, branchProblem, canEditBranches, newBranchId, MAX_LINKS } from '@/lib/branches.js';
import OptionPicker from '@/components/OptionPicker.vue';
import Paged from '@/components/Paged.vue';
import DriveStates from '@/pages/Settings/DriveStates.vue';
import BranchGuide from '@/components/BranchGuide.vue';
import { loadBranchSheet, loadSheetSettings, saveBranchSheet, makeYearFile } from '@/lib/maintenance-sheet.js';
import { normState } from '@/lib/states.js';
import { toast } from '@/lib/toast.js';

// Tab and tile icons (stroke paths)
const ICONS = {
  details: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z'],
  properties: ['M3 21h18', 'M5 21V7l7-4 7 4v14', 'M9 9h1', 'M14 9h1', 'M9 13h1', 'M14 13h1', 'M10 21v-4h4v4'],
  links: ['M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7', 'M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7'],
  drive: ['M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z'],
  staff: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M9 7a4 4 0 1 0 0 .01', 'M22 21v-2a4 4 0 0 0-3-3.9', 'M16 3.1a4 4 0 0 1 0 7.8']
};
const copy = b => ({ ...b, propertyIds: [...b.propertyIds], links: b.links.map(l => ({ ...l })) });

export default {
  components: { OptionPicker, Paged, DriveStates, BranchGuide },
  data() {
    const me = useSession();
    return { ROLE_LABEL, MAX_LINKS, ICONS, loading: true, busy: false, error: '', formError: '', branches: [], properties: [], users: [], driveStates: {},
      form: null, guideOpen: false, menu: null, mv: null, sync: null, isDirector: ['director', 'branchDirector'].includes(me.role), isBD: me.role === 'branchDirector', nextYear: String(new Date().getFullYear() + 1), tab: 'details', q: '', canEdit: canEditBranches(me), canStaff: ['director', 'branchDirector', 'hr'].includes(me.role) };
  },
  computed: {
    stateOptions() { return [{ value: '', label: 'No state' }, ...STATES.map(s => ({ value: s, label: s }))]; },
    visibleIds() { return new Set(this.properties.map(p => p.id)); },
    // Property ids on the open branch that this person can't see (kept on save)
    hidden() { if (!this.form || this.form.isNew) return []; const b = this.branches.find(x => x.id === this.form.id); return b ? b.propertyIds.filter(id => !this.visibleIds.has(id)) : []; },
    propertyOptions() {
      return this.properties.map(p => {
        const other = this.branches.find(b => b.id !== this.form?.id && b.propertyIds.includes(p.id));
        return { value: p.id, label: `${p.name} (${p.code || p.id})${other ? ` · in ${other.name}` : ''}` };
      });
    },
    tabs() {
      const f = this.form; if (!f) return [];
      const t = [{ key: 'details', label: 'Details' }, { key: 'properties', label: 'Properties', count: f.propertyIds.length + this.hidden.length },
        { key: 'links', label: 'Links', count: (f.sheetLink ? 1 : 0) + f.links.filter(l => l.url).length }];
      if (!f.isNew) t.push({ key: 'drive', label: 'Drive folder' }, { key: 'staff', label: 'Staff', count: this.staffIn(f.id).length });
      return t;
    },
    // Details tab: a quick look at the other tabs (click to open)
    tiles() {
      const f = this.form; if (!f) return [];
      const links = (f.sheetLink ? 1 : 0) + f.links.filter(l => l.url).length;   // the Drive folder is on its own tab (the state's folder)
      return [
        { key: 'properties', label: 'Properties', value: f.propertyIds.length + this.hidden.length, tone: 't1' },
        { key: 'staff', label: 'Staff', value: this.staffIn(f.id).length, tone: 't2' },
        { key: 'links', label: 'Links', value: links, tone: 't3' },
        { key: 'drive', label: 'State Drive folder', value: f.state && this.driveStates[f.state] ? (this.driveStates[f.state].folderName || 'Set up') : 'Not set up', tone: 't4' }
      ];
    },
    // The branch's properties as rows (A to Z), filtered by the search box
    shownProps() {
      if (!this.form) return [];
      const q = this.q.trim().toLowerCase();
      return this.form.propertyIds.map(id => { const p = this.properties.find(x => x.id === id) || { id, name: id }; return { id, name: p.name || id, code: p.code || '', state: stateOf(p) }; })
        .filter(p => !q || `${p.name} ${p.code}`.toLowerCase().includes(q))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    syncState() {
      const x = this.sync || {};
      return x.saved ? { label: 'Connected', cls: 'on' } : x.legacy ? { label: 'Old settings', cls: 'warn' } : { label: 'Not connected', cls: '' };
    },
    moveOptions() { return this.branches.filter(b => b.id !== this.form?.id).map(b => ({ value: b.id, label: `${b.name}${b.active ? '' : ' (archived)'} · ${b.propertyIds.length} properties` })); },
    seedCount() {
      const s = new Set(Object.keys(this.driveStates)); this.properties.forEach(p => { if (stateOf(p)) s.add(stateOf(p)); }); return s.size;
    }
  },
  async created() { await this.load(); this.fromRoute(); },
  watch: { '$route.query.b'() { this.fromRoute(); }, tab(t) { if (t === 'links') this.loadSync(); } },
  methods: {
    shortState(s) { return s ? shortState(s) : ''; },
    isUrl(v) { return /^https?:\/\/\S+$/i.test(String(v || '').trim()); },
    initials(n) { const w = String(n || '').trim().split(/\s+/).filter(Boolean); return ((w[0] || '?')[0] + (w[1] ? w[1][0] : (w[0] || '').slice(1, 2))).toUpperCase(); },
    openMenu(e, p) {
      if (this.menu && this.menu.id === p.id) { this.menu = null; return; }
      const r = e.currentTarget.getBoundingClientRect();
      this.menu = { id: p.id, p, x: Math.max(8, r.right - 220), y: Math.min(window.innerHeight - 110, r.bottom + 6) };
    },
    startMove(p) { this.menu = null; this.mv = { p, to: '', busy: false, error: '' }; },
    // Adds the property to the chosen branch (lib saveBranch takes it out of this one in the same batch)
    async doMove() {
      const m = this.mv, to = this.branches.find(b => b.id === m.to);
      if (!to) return m.error = 'Choose a branch.';
      m.busy = true; m.error = '';
      try {
        await saveBranch(useSession(), { ...copy(to), propertyIds: [...new Set([...to.propertyIds, m.p.id])] }, { all: this.branches });
        this.branches = (await loadBranches(true)).filter(b => !this.isBD || (useSession().branches || []).includes(b.id));
        this.form.propertyIds = this.form.propertyIds.filter(x => x !== m.p.id);   // unsaved edits on this branch are kept
        toast(`${m.p.name} moved to ${to.name}.`);
        this.mv = null;
      } catch (e) { m.error = friendlyError(e, 'move the property'); m.busy = false; }
    },
    // Links tab (Directors): this branch's Sheet sync, or the old single-Sheet settings when they cover its state
    async loadSync() {
      const f = this.form;
      if (!this.isDirector || !f || f.isNew || this.sync?.id === f.id) return;
      this.sync = { id: f.id, loading: true };
      const [own, old] = await Promise.all([loadBranchSheet(f.id), loadSheetSettings()]);
      const st = (old?.states || []).map(normState);
      const legacy = !own?.scriptUrl && !!old?.scriptUrl && (!st.length || st.includes(normState(f.state)));
      if (this.form?.id !== f.id) return;
      this.sync = { id: f.id, loading: false, saved: own?.scriptUrl || '', legacy, scriptUrl: own?.scriptUrl || (legacy ? old.scriptUrl : ''), error: '', ok: '', busy: false, yearMade: null };
      if (legacy && !f.sheetLink && old.sheetUrl) f.sheetLink = old.sheetUrl;   // shown; saved with the branch
    },
    async saveSync(off) {
      const x = this.sync, f = this.form; x.error = ''; x.ok = ''; x.busy = true;
      try {
        await saveBranchSheet(useSession(), { id: f.id, state: f.state }, { scriptUrl: off ? '' : x.scriptUrl, sheetUrl: f.sheetLink });
        x.saved = off ? '' : x.scriptUrl.trim(); x.legacy = false; if (off) x.scriptUrl = '';
        x.ok = off ? 'Sheet sync turned off for this branch.' : 'Saved. The Maintenance page syncs this Sheet next time it opens.';
      } catch (e) { x.error = e.plain ? e.message : friendlyError(e, 'save the Sheet sync'); }
      x.busy = false;
    },
    async makeYear() {
      const x = this.sync; x.error = ''; x.busy = true;
      try { x.yearMade = await makeYearFile(x.saved, this.nextYear); } catch (e) { x.error = e.plain ? e.message : friendlyError(e, 'make the file'); }
      x.busy = false;
    },
    removeProp(id) { this.form.propertyIds = this.form.propertyIds.filter(x => x !== id); },
    // Name of the other (saved) branch a newly added property comes from
    movingFrom(id) { const b = this.branches.find(x => x.id !== this.form.id && x.propertyIds.includes(id)); return b ? b.name : ''; },
    propName(id) { const p = this.properties.find(x => x.id === id); return p ? p.name : id; },
    allIds(f) { return [...f.propertyIds, ...this.hidden]; },
    // Branch list: the first property names, then "+N more" (24 Nov 2026)
    propSummary(b) {
      const names = b.propertyIds.map(id => this.properties.find(p => p.id === id)?.name).filter(Boolean);
      if (!b.propertyIds.length) return 'No properties yet';
      const more = b.propertyIds.length - Math.min(names.length, 3);
      return names.slice(0, 3).join(', ') + (more > 0 ? ` +${more} more` : '');
    },
    staffIn(id) { return this.users.filter(u => u.active !== false && Array.isArray(u.branches) && u.branches.includes(id)).sort((a, b) => (a.displayName || '').localeCompare(b.displayName || '')); },
    async load() {
      this.loading = true; this.error = '';
      try {
        const [branches, properties, users, driveStates] = await Promise.all([
          loadBranches(true), loadProperties().catch(() => []),
          getDocs(collection(db, 'users')).then(s => s.docs.map(d => ({ id: d.id, ...d.data() }))).catch(() => []),
          loadDriveStates().catch(() => ({}))
        ]);
        Object.assign(this, { branches: this.isBD ? branches.filter(b => (useSession().branches || []).includes(b.id)) : branches, properties, users, driveStates });   // Branch Directors: their own branches only (24 Nov 2026)
        if (this.form && !this.form.isNew) { const b = branches.find(x => x.id === this.form.id); this.form = b ? copy(b) : null; }
      } catch (e) { this.error = friendlyError(e, 'load the branches'); }
      this.loading = false;
    },
    // The open branch follows the address (?b=id, ?b=new), so Back and refresh work
    fromRoute() {
      const id = this.$route.query.b;
      if (!id) { this.form = null; this.formError = ''; return; }
      if (id === 'new') { if (!this.form?.isNew && this.canEdit && !this.isBD) this.newForm(); return; }
      const b = this.branches.find(x => x.id === id);
      if (b && this.form?.id !== id) this.setForm(b);
    },
    back() { this.$router.push({ query: {} }); },
    open(b) { if (this.$route.query.b === b.id) this.setForm(b); else this.$router.push({ query: { b: b.id } }); },
    startNew() { this.$router.push({ query: { b: 'new' } }); },
    setForm(b) { const same = this.form && this.form.id === b.id; this.form = copy(b); this.formError = ''; if (!same) { this.tab = 'details'; this.q = ''; } },
    newForm() { this.form = { id: newBranchId(), isNew: true, name: '', state: '', active: true, propertyIds: [], driveLink: '', sheetLink: '', links: [] }; this.formError = ''; this.tab = 'details'; this.q = ''; },
    async save() {
      const f = this.form, me = useSession();
      this.formError = branchProblem(f, this.branches);
      if (this.formError) { this.tab = /link/i.test(this.formError) ? 'links' : 'details'; return; }
      const moving = f.propertyIds.filter(id => this.branches.some(b => b.id !== f.id && b.propertyIds.includes(id)));
      this.busy = true;
      try {
        await saveBranch(me, f, { all: this.branches, isNew: !!f.isNew, hidden: this.hidden });
        toast(`${f.name.trim()} saved.${moving.length ? ` ${moving.length} ${moving.length === 1 ? 'property' : 'properties'} moved here.` : ''}`);
        const id = f.id, keepTab = this.tab; this.form = null; await this.load();
        const b = this.branches.find(x => x.id === id);
        if (b) { this.setForm(b); this.tab = keepTab; if (this.$route.query.b !== id) this.$router.replace({ query: { b: id } }); }
      } catch (e) { this.formError = friendlyError(e, 'save the branch'); }
      this.busy = false;
    },
    async seed() {
      this.busy = true; this.error = '';
      try {
        const made = await branchesFromStates(useSession(), { driveStates: this.driveStates, properties: this.properties, stateOf, shortState });
        toast(made.length ? `Created ${made.join(', ')}.` : 'Nothing to create.');
        await this.load();
      } catch (e) { this.error = friendlyError(e, 'create the branches'); }
      this.busy = false;
    }
  }
};
</script>

<style scoped>
.bm-head-acts { display: flex; gap: 8px; flex-wrap: wrap; }
.bm-setup { max-width: 640px; display: grid; gap: 10px; justify-items: start; }
.bm-setup h2 { margin: 0; font-size: 16px; }
.bm-setup .help { margin: 0; }
/* 23 Nov 2026: mockup B (tabs). No sideways scroll: every column may shrink. */
.bm-name { font-weight: 600; font-size: 13px; display: flex; align-items: center; gap: 8px; min-width: 0; }
.bm-arch { background: var(--chip); color: var(--muted); margin-left: 8px; }
.bm-info { display: inline-grid; place-items: center; width: 40px; height: 40px; padding: 0; border-radius: 50%; color: var(--accent); }
.bm-tool-acts { display: flex; align-items: center; gap: 8px; }
.bm-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 12px; font-size: 13px; }
.bm-skcol { display: grid; gap: 10px; }
/* 23 Nov 2026 (Khairul): same back link as Issues ("← All tickets") */
.bm-back { display: inline-block; margin-bottom: 8px; font-size: 13px; font-weight: 600; color: var(--accent); text-decoration: none; }
.bm-back:hover { text-decoration: underline; }
.bm-overview { padding: 0; overflow-x: auto; }
.bm-row { cursor: pointer; }
.bm-row:hover td { background: var(--accent-soft); }
.bm-row.off td { color: var(--muted); }
.bm-table .num { text-align: right; width: 1%; white-space: nowrap; }
.bm-cell-name { display: inline-flex; align-items: center; gap: 10px; }
.bm-av { width: 48px; height: 48px; border-radius: 12px; display: grid; place-items: center; flex: none; font-weight: 700; font-size: 16px; background: var(--accent-soft); color: var(--accent); }
.bm-av.sm { width: 32px; height: 32px; border-radius: 9px; font-size: 12px; }
.bm-av.md { width: 40px; height: 40px; border-radius: 11px; font-size: 13px; }
.bm-name-col { display: grid; gap: 3px; min-width: 0; }
.bm-sub { font-size: 12.5px; color: var(--muted); max-width: 420px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bm-faces { display: inline-flex; align-items: center; }
.bm-face { width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; font-size: 10.5px; font-weight: 700; background: var(--accent-soft); color: var(--accent); border: 2px solid var(--surface); margin-left: -6px; }
.bm-face:first-child { margin-left: 0; }
.bm-face.more { background: var(--chip, #f3f4f6); color: var(--text-2); }
.bm-overview .bm-table td { padding-top: 14px; padding-bottom: 14px; }
.bm-pill { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; background: var(--chip, #f3f4f6); color: var(--text-2); }
.bm-meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 6px; font-size: 13px; }
.bm-ti { flex: none; }
.bm-tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-top: 8px; }
.bm-tile { display: flex; align-items: flex-start; gap: 12px; text-align: left; padding: 14px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); font: inherit; cursor: pointer; min-width: 0; transition: border-color .15s, box-shadow .15s; }
.bm-tile:hover { border-color: var(--accent); box-shadow: 0 2px 8px rgba(0,0,0,.05); }
.bm-tile > span:last-child { display: grid; min-width: 0; }
.bm-tile-ico { width: 38px; height: 38px; border-radius: 10px; display: grid; place-items: center; flex: none; }
.bm-tile-ico { background: var(--chip, #f3f4f6); color: var(--text-2); }   /* 23 Nov 2026 (Khairul): plain, not coloured */
.bm-tile:hover .bm-tile-ico { color: var(--accent); }
.bm-tile-k { font-size: 12px; color: var(--muted); }
.bm-tile-v { font-size: 18px; overflow-wrap: anywhere; line-height: 1.25; }
.bm-tile-v.txt { font-size: 14px; }   /* a folder name wraps instead of being cut off */
.bm-detail { padding: 0; min-width: 0; overflow: visible; }
.bm-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 22px 24px 0; }
.bm-title { display: flex; align-items: center; gap: 14px; min-width: 0; }
.bm-title h2 { margin: 0; font-size: 22px; }
.bm-state { font-size: 13px; margin-top: 4px; }
.bm-switch { display: inline-flex; align-items: center; gap: 10px; font-size: 13px; cursor: pointer; user-select: none; }
.bm-switch.dis { cursor: default; opacity: .7; }
.bm-switch input { position: absolute; opacity: 0; pointer-events: none; }
.bm-switch i { width: 38px; height: 22px; border-radius: 999px; background: #d1d5db; position: relative; transition: background .15s; }
.bm-switch i::after { content: ''; position: absolute; left: 3px; top: 3px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: left .15s; box-shadow: 0 1px 2px rgba(0,0,0,.2); }
.bm-switch input:checked + i { background: var(--accent); }
.bm-switch input:checked + i::after { left: 19px; }
.bm-switch input:focus-visible + i { outline: 2px solid var(--accent); outline-offset: 2px; }
.bm-tabs { display: flex; gap: 24px; padding: 0 24px; margin-top: 18px; border-bottom: 1px solid var(--border); overflow-x: auto; overflow-y: hidden; scrollbar-width: none; }
.bm-tabs::-webkit-scrollbar { display: none; }
.bm-tab { background: none; border: 0; border-bottom: 2px solid transparent; padding: 12px 0; font: inherit; font-weight: 600; color: var(--text-2); cursor: pointer; white-space: nowrap; display: inline-flex; align-items: center; gap: 7px; }
.bm-tab:hover { color: var(--text); }
.bm-tab.on { color: var(--accent); border-bottom-color: var(--accent); }
.bm-cnt { display: inline-block; margin-left: 6px; padding: 1px 8px; border-radius: 999px; background: var(--chip, #f3f4f6); color: var(--text-2); font-size: 12px; font-weight: 600; }
.bm-body { padding: 18px 24px; display: grid; gap: 12px; min-height: 260px; align-content: start; }
.bm-body > * { min-width: 0; }
.bm-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 20px; align-items: end; }
.bm-grid .field { margin: 0; }
.bm-stack { display: grid; gap: 12px; max-width: 720px; }
.bm-stack .field { margin: 0; }
.bm-full { grid-column: 1 / -1; margin: 0; }
.bm-pick { display: block; width: 100%; }
.bm-pick :deep(.op-btn) { width: 100%; max-width: 100%; min-height: 42px; overflow: hidden; }
.bm-pick :deep(.op-val) { max-width: none; min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bm-bar { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.bm-search { max-width: 320px; flex: 1; min-width: 180px; }
.bm-add :deep(.op-btn) { font-weight: 600; min-height: 40px; }
.bm-add :deep(.op-val) { max-width: none; color: var(--text); }
.bm-add :deep(.op-pop) { right: 0; left: auto; min-width: 360px; max-width: 440px; }
.bm-table td, .bm-table th { padding: 11px 14px; }
.bm-table .strong { font-weight: 600; }
.bm-code { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px; background: var(--chip, #f3f4f6); padding: 2px 7px; border-radius: 6px; }
.bm-move { margin-left: 8px; background: #fef3c7; color: #92400e; font-weight: 600; }
.bm-sync { display: grid; gap: 10px; max-width: 720px; padding: 16px; border: 1px solid var(--border); border-radius: 12px; margin-top: 4px; }
.bm-sync .help, .bm-sync .notice { margin: 0; }
.bm-sync .field { margin: 0; }
.bm-sync-head { display: flex; align-items: center; gap: 10px; font-size: 15px; }
.bm-pill.on { background: #ecfdf3; color: #047857; }
.bm-pill.warn { background: #fef3c7; color: #92400e; }
.bm-sync-acts { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.bm-dots { display: inline-grid; place-items: center; width: 32px; height: 32px; padding: 0; border: 1px solid transparent; border-radius: 8px; background: none; color: var(--text-2); cursor: pointer; }
.bm-dots:hover, .bm-dots[aria-expanded="true"] { background: var(--accent-soft); color: var(--accent); }
.bm-menu-back { position: fixed; inset: 0; z-index: 30; }
.bm-menu { position: fixed; z-index: 31; width: 220px; display: grid; padding: 6px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,.12); }
.bm-menu button { text-align: left; background: none; border: 0; padding: 9px 12px; border-radius: 8px; font: inherit; font-size: 14px; color: var(--text); cursor: pointer; }
.bm-menu button:hover:not(:disabled) { background: var(--accent-soft); color: var(--accent); }
.bm-menu button.rm { color: var(--danger); }
.bm-menu button.rm:hover { background: #fef2f2; color: var(--danger); }
.bm-menu button:disabled { opacity: .55; cursor: default; }
.bm-mv { max-width: 480px; }
.bm-rmcell { text-align: right; width: 1%; white-space: nowrap; }
.bm-none { margin: 6px 0; }
.bm-url { display: flex; align-items: center; gap: 10px; }
.bm-url .input { flex: 1; min-width: 0; }
.bm-open { white-space: nowrap; font-size: 13px; font-weight: 600; color: var(--accent); }
.bm-links { display: grid; gap: 8px; justify-items: start; margin-top: 6px; max-width: 720px; }
.bm-k { font-size: 14px; color: var(--text-2); }
.bm-link { display: grid; grid-template-columns: minmax(160px, .8fr) minmax(0, 1.6fr) auto; gap: 10px; align-items: center; width: 100%; }
.rm { color: var(--danger); }
.bm-foot { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 14px 24px; border-top: 1px solid var(--border); }
.bm-foot-btns { display: flex; gap: 8px; margin-left: auto; }
.bm-upd { font-size: 13px; }
.bm-empty { min-height: 200px; display: grid; place-items: center; padding: 24px; }
/* Animations (23 Nov 2026, Khairul). Off for people who ask their device for less motion. */
@keyframes bm-rise { from { opacity: 0; transform: translateY(8px); } }
@keyframes bm-fade { from { opacity: 0; } }
.bm-enter { animation: bm-rise .28s cubic-bezier(.2,.7,.3,1) both; }
.bm-overview { animation: bm-rise .28s cubic-bezier(.2,.7,.3,1) both; }
.bm-row { animation: bm-rise .3s cubic-bezier(.2,.7,.3,1) both; }
.bm-row td { transition: background-color .15s; }
.bm-pane { animation: bm-fade .22s ease-out both, bm-rise .22s cubic-bezier(.2,.7,.3,1) both; }
.bm-tile { animation: bm-rise .3s cubic-bezier(.2,.7,.3,1) both; }
.bm-tile:hover { transform: translateY(-2px); }
.bm-tile { transition: border-color .15s, box-shadow .15s, transform .15s; }
.bm-tab { position: relative; border-bottom-color: transparent !important; transition: color .15s; }
.bm-tab::after { content: ''; position: absolute; left: 0; right: 0; bottom: -1px; height: 2px; background: var(--accent); transform: scaleX(0); transition: transform .22s cubic-bezier(.2,.7,.3,1); }
.bm-tab.on::after { transform: scaleX(1); }
.bm-tab .bm-ti { transition: transform .2s; }
.bm-tab:hover .bm-ti { transform: translateY(-1px); }
.bm-menu { animation: bm-pop .14s ease-out both; transform-origin: top right; }
@keyframes bm-pop { from { opacity: 0; transform: translateY(-4px) scale(.97); } }
.bm-dots svg { transition: transform .15s; }
.bm-dots[aria-expanded="true"] svg { transform: rotate(90deg); }
.bm-back { transition: transform .15s; }
.bm-back:hover { transform: translateX(-2px); }
@media (prefers-reduced-motion: reduce) {
  .bm-enter, .bm-overview, .bm-row, .bm-pane, .bm-tile, .bm-menu { animation: none; }
  .bm-tile:hover, .bm-back:hover, .bm-tab:hover .bm-ti { transform: none; }
  .bm-tab::after { transition: none; }
}
@media (max-width: 900px) { .bm-tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); } .bm-grid, .bm-link { grid-template-columns: minmax(0, 1fr); } }
</style>
