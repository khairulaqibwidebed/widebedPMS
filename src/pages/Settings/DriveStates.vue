<template>
  <main class="content">
    <div class="page-head">
      <div class="head-text">
        <h1>States</h1>
        <div class="sub">Each state's Google Drive folder (e.g. Owner Files). A property can only be added in a state set up here. Issue photos and videos go to the unit's Maintenance folder inside it.</div>
      </div>
      <div class="head-acts">
        <button class="btn info-btn" type="button" @click="infoOpen = true" aria-label="How the Drive folders work" title="How the Drive folders work">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
        </button>
        <button class="btn btn-primary" v-if="canEdit && others.length" @click="openForm('')">＋ Add state</button>
      </div>
    </div>

    <div class="loading-bar" v-show="loading" style="margin-bottom:12px"></div>
    <div class="notice error" v-show="error">{{ error }}</div>
    <!-- How it works (the info button) -->
    <div class="modal-back" v-if="infoOpen" @click.self="infoOpen = false" v-esc="() => { infoOpen = false }">
      <div class="modal" role="dialog" aria-label="How the Drive folders work" style="max-width:520px">
        <h2>How the Drive folders work</h2>
        <ul class="info-list">
          <li>Share each state's folder with support@widebed.com as Editor first.</li>
          <li>Inside it the PMS looks for &lt;Property&gt; / Owner / &lt;Unit&gt; / Maintenance, matching names without spaces, dashes or capitals ("DM 1311" = "DM 13-11").</li>
          <li>Issue photos and videos go to the unit's Maintenance folder, in a folder per ticket. Missing folders are made then.</li>
          <li>The lists below only read the Drive. To link one that shows Not found, rename the property or unit in the PMS (or the folder in Drive) so the names match.</li>
        </ul>
        <div class="modal-foot"><button class="btn" @click="infoOpen = false">Close</button></div>
      </div>
    </div>

    <div class="table-wrap">
      <!-- Fixed column widths, so nothing shifts while the lists load -->
      <table class="table fixed">
        <colgroup><col style="width:42%"><col style="width:24%"><col style="width:20%"><col style="width:14%"></colgroup>
        <thead><tr><th>State</th><th>Drive folder</th><th>Set by</th><th></th></tr></thead>
        <tbody>
          <template v-for="st in shown" :key="st">
            <!-- Click a set-up state to open its list. The list checks itself (on open, when properties change, every 2 minutes). -->
            <tr :class="{ clickable: map[st] }" @click="map[st] && toggle(st)">
              <td><span class="chev" v-if="map[st]">{{ open[st] ? '▾' : '▸' }}</span><b>{{ st }}</b>
                <div class="help" v-if="map[st]">{{ results[st] ? summary(st) : 'Checking…' }}</div></td>
              <td>
                <template v-if="map[st]"><a class="ext" :href="map[st].link" target="_blank" rel="noopener" title="Open in Google Drive" @click.stop>{{ map[st].folderName }}<svg class="ext-ico" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg></a></template>
                <span class="help" v-else>Not set up</span>
              </td>
              <td class="help">{{ map[st] ? `${map[st].byName || '—'} · ${(map[st].at || '').slice(0, 10)}` : '' }}</td>
              <td class="acts">
                <button class="btn btn-sm" v-if="canEdit" @click.stop="openForm(st)">Edit state</button>
              </td>
            </tr>
            <tr class="inner-row" v-if="map[st] && open[st] && results[st]">
              <td colspan="4" class="inner-cell">
                <!-- Green: has its folder now. Orange: had a folder before, not found now (renamed or moved). Red: never found. -->
                <table class="table inner fixed">
                  <colgroup><col style="width:72px"><col style="width:38%"><col style="width:38%"><col></colgroup>
                  <thead><tr><th>Status</th><th>Property</th><th>File name</th><th>Units linked</th></tr></thead>
                  <tbody>
                    <template v-for="p in results[st]" :key="p.id">
                      <tr :class="{ clickable: p.link && p.ownerLink }" @click="p.link && p.ownerLink && toggleUnits(p.id)">
                        <td><span class="dot" :class="p.status" :title="statusText(p)"></span></td>
                        <td><b>{{ p.name }}</b><div class="help" v-if="p.status === 'orange'">{{ wasText(p) }}</div></td>
                        <td><a class="ext" v-if="p.link" :href="p.link" target="_blank" rel="noopener" title="Open in Google Drive" @click.stop>{{ p.folderName }}<svg class="ext-ico" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg></a><span class="help" v-else>—</span></td>
                        <td><template v-if="p.link">{{ p.ownerLink ? `${p.unitsLinked} of ${p.units.length}` : 'No Owner folder yet' }}<span class="chev" v-if="p.ownerLink && p.units.length">{{ unitsOpen[p.id] ? ' ▾' : ' ▸' }}</span></template><span class="help" v-else>—</span></td>
                      </tr>
                      <tr class="inner-row" v-if="unitsOpen[p.id] && p.link && p.ownerLink">
                        <td></td>
                        <td colspan="3"><div class="units">
                          <template v-for="u in p.units" :key="u.code">
                            <span class="unit" :class="{ miss: !u.link }" :title="u.link ? `${u.code}: linked` : `${u.code}: no folder found under Owner`"><span class="dot" :class="u.link ? 'green' : 'red'"></span><a v-if="u.link" :href="u.link" target="_blank" rel="noopener">{{ u.code }}</a><span v-else>{{ u.code }}</span></span>
                          </template>
                          <span class="help" v-if="!p.units.length">No units in the PMS yet.</span>
                        </div></td>
                      </tr>
                    </template>
                    <tr v-if="!results[st].length"><td colspan="4" class="help">{{ `No PMS properties in ${st} yet.` }}</td></tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
    <!-- 17 Nov 2026: only Kuala Lumpur, Johor and the states set up are listed; Add state (top right) brings in another one -->

    <!-- Add state / Edit state popup: the state and its Google Drive folder -->
    <div class="modal-back" v-show="form" @click.self="closeForm()" v-esc="() => closeForm()">
      <template v-if="form">
        <form class="modal" role="dialog" :aria-label="form.isNew ? 'Add state' : 'Edit state'" @submit.prevent="save()" style="max-width:520px">
          <h2>{{ form.isNew ? 'Add state' : `Edit state · ${form.state}` }}</h2>
          <div class="notice error" v-show="form.error">{{ form.error }}</div>
          <div class="field" v-if="form.isNew"><label for="dsState" class="req">State</label>
            <select class="input" id="dsState" v-model="form.state"><option value="">Choose a state</option>
              <template v-for="s in others" :key="s"><option :value="s">{{ s }}</option></template></select></div>
          <div class="field"><label for="dsLink" class="req">Google Drive folder link</label>
            <input class="input" id="dsLink" v-model="form.paste" placeholder="https://drive.google.com/drive/folders/...">
            <span class="help" v-if="map[form.state]">{{ `Now: ${map[form.state].folderName}` }}</span>
            <span class="help" v-else>e.g. the state's Owner Files folder. Share it with support@widebed.com as Editor first.</span></div>
          <div class="modal-foot">
            <button type="button" class="btn" v-if="!form.isNew && map[form.state]" :disabled="busy" @click="remove(form.state)">Remove folder</button>
            <span style="flex:1"></span>
            <button type="button" class="btn" @click="closeForm()">Cancel</button>
            <button class="btn btn-primary" :disabled="busy">{{ busy ? 'Checking…' : 'Check and save' }}</button>
          </div>
        </form>
      </template>
    </div>
  </main>
</template>

<script>
// Settings > States (17 Nov 2026): set each state's Drive folder, and check which properties and units have a folder.
// Directors and Operations edit; the link is checked through /api/drive (support@widebed.com must be able to add to it).
import { useSession } from '@/stores/session.js';
import { STATES, stateOf } from '@/lib/states.js';
import { loadDriveStates, saveDriveState, canSetUpStates, loadDriveSeen, saveDriveSeen } from '@/lib/drive-states.js';
import { folderIdOf, checkFolder, linkCheck } from '@/lib/drive.js';
import { watchProperties, loadUnits, friendlyError } from '@/lib/finance-data.js';
import { forgetUnits } from '@/lib/portfolio-data.js';
import { liveMixin } from '@/lib/use-live.js';
import { askConfirm } from '@/lib/confirm.js';
import { toast } from '@/lib/toast.js';

const me = useSession();
const BASE = ['W.P. Kuala Lumpur', 'Johor'];

export default {
  mixins: [liveMixin],
  data() { return { map: {}, seen: {}, props: [], open: {}, unitsOpen: {}, form: null, infoOpen: false, loading: true, busy: false, error: '', results: {} }; },
  computed: {
    canEdit() { return canSetUpStates(me.role); },
    // Kuala Lumpur and Johor always; any other state once Add state has saved its folder
    shown() { return STATES.filter(s => BASE.includes(s) || this.map[s]); },
    others() { return STATES.filter(s => !this.shown.includes(s)); }
  },
  async mounted() {
    this.map = { ...(await loadDriveStates(true)) };
    this.seen = await loadDriveSeen();
    this.loading = false;
    // Live: the properties as they change (added, renamed, moved state) re-check the lists; every 2 minutes (only while
    // the tab is open and showing) the states, units and Drive folders are read again too.
    this.liveUse('props', watchProperties(rows => { this.props = rows; this.checkAll(); }, e => { this.error = e.friendly || friendlyError(e, 'load the properties'); }));
    this.livePoll('drive', async () => { this.map = { ...(await loadDriveStates(true)) }; await this.checkAll(true); }, 120000, { immediate: false });
  },
  methods: {
    // The popup: '' = Add state (choose one not listed yet), else Edit state for that state
    openForm(st) { this.form = { isNew: !st, state: st, paste: this.map[st]?.link || '', error: '' }; },
    closeForm() { if (!this.busy) this.form = null; },
    async save() {
      const f = this.form, st = f.state;
      if (!st) return f.error = 'Choose the state.';
      const id = folderIdOf(f.paste);
      if (!id) return f.error = 'Paste a Google Drive folder link (it has /folders/ in it).';
      this.busy = true; f.error = '';
      try {
        const got = await checkFolder(id);
        this.map = { ...(await saveDriveState(me, st, got)) };
        delete this.results[st];
        this.check(st);
        this.busy = false; this.form = null;
        toast.ok(`${st} now uses "${got.name}".`);
        return;
      } catch (e) { f.error = e.code ? friendlyError(e, 'save the state') : e.message; }
      this.busy = false;
    },
    async remove(st) {
      if (!(await askConfirm({ title: `Remove the Drive folder for ${st}?`, message: `New properties can't be added in ${st} until it is set up again, and its issue files go to Widebed PMS Files. Nothing in Drive is deleted.`, confirmText: 'Remove', danger: true }))) return;
      this.busy = true;
      try { this.map = { ...(await saveDriveState(me, st, null)) }; delete this.results[st]; this.form = null; }
      catch (e) { this.error = friendlyError(e, 'remove it'); }
      this.busy = false;
    },
    toggle(st) { this.open = { ...this.open, [st]: !this.open[st] }; },
    toggleUnits(id) { this.unitsOpen = { ...this.unitsOpen, [id]: !this.unitsOpen[id] }; },
    wasText(p) { return `Was linked to "${p.was}". Not found now.`; },
    statusText(p) {
      return p.status === 'green' ? 'Linked to its Drive folder' : p.status === 'orange' ? `Was linked to "${p.was}", not found now (renamed or moved?)` : 'No Drive folder found with this name';
    },
    // Every set-up state, one after another; a call while one is running is done once it finishes
    async checkAll(fresh = false) {
      if (this.running) { this.again = true; return; }
      this.running = true;
      try { for (const st of this.shown.filter(x => this.map[x])) await this.check(st, fresh); }
      finally { this.running = false; }
      if (this.again) { this.again = false; this.checkAll(fresh); }
    },
    // Read-only: every PMS property in this state, and its units, against the folders in Drive. fresh: read units again.
    async check(st, fresh = false) {
      try {
        const props = this.props.filter(p => stateOf(p) === st);
        if (fresh) await Promise.all(props.map(p => forgetUnits(p.id)));
        const withUnits = await Promise.all(props.map(async p => ({ id: p.id, name: p.name, units: (await loadUnits(p.id)).map(u => u.unitCode).filter(Boolean) })));
        const got = (await linkCheck(st, withUnits)).properties || [];
        const byId = Object.fromEntries(got.map(r => [r.id, r]));
        const ORDER = { red: 0, orange: 1, green: 2 }, newSeen = {};
        this.results = { ...this.results, [st]: withUnits.map(p => {
          const r = byId[p.id] || {}, units = p.units.map(code => ({ code, link: r.units?.[code] || '' })), was = this.seen[p.id];
          // Remember each linked property's folder, so a later "not found" shows orange (it used to be linked)
          if (r.link && (!was || was.link !== r.link || was.folderName !== r.folderName)) newSeen[p.id] = { link: r.link, folderName: r.folderName || '', at: new Date().toISOString() };
          const status = r.link ? 'green' : was ? 'orange' : 'red';
          return { ...p, link: r.link || '', folderName: r.folderName || '', ownerLink: r.ownerLink || '', units, unitsLinked: units.filter(u => u.link).length, status, was: was?.folderName || '' };
        }).sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.name.localeCompare(b.name)) };
        if (Object.keys(newSeen).length && this.canEdit) {
          this.seen = { ...this.seen, ...newSeen };
          try { await saveDriveSeen(me, newSeen); } catch (e) { console.error('Drive seen:', e); }
        }
        this.error = '';
      } catch (e) { this.error = e.code ? friendlyError(e, 'check the links') : e.message; }
    },
    summary(st) {
      const list = this.results[st] || [], linked = list.filter(p => p.link);
      const units = linked.flatMap(p => p.units), unitsLinked = units.filter(u => u.link).length, lost = list.filter(p => p.status === 'orange').length;
      return `${linked.length} of ${list.length} properties linked${lost ? ` · ${lost} no longer linked` : ''} · ${unitsLinked} of ${units.length} units in linked properties linked`;
    }
  }
};
</script>

<style scoped>
.head-text { flex: 1 1 320px; min-width: 0; }
.head-acts { display: flex; gap: 8px; align-items: center; margin-left: auto; }
.info-btn { display: inline-grid; place-items: center; width: 40px; height: 40px; padding: 0; border-radius: 50%; color: var(--accent); }
.info-list { margin: 8px 0 4px; padding-left: 18px; display: grid; gap: 8px; font-size: 14px; }
.clickable { cursor: pointer; }
/* The row that holds a whole list is not a row to hover: only the rows inside it light up */
.table tbody tr.inner-row:hover > td { background: transparent; box-shadow: none; }
/* The app tints every cell under a hovered row, which reached into the whole inner list. Inner cells stay plain;
   only the property row under the pointer lights up. */
.table.inner tbody td { background: transparent; box-shadow: none; }
.table.inner tbody tr:not(.inner-row):hover > td { background: color-mix(in srgb, var(--accent-soft) 55%, transparent); }
.table.inner tbody tr.clickable:hover > td { background: var(--accent-soft); }
.table.inner tbody tr.clickable:hover > td:first-child { box-shadow: inset 4px 0 0 var(--accent); }
/* Links that open Google Drive: accent colour, underline on hover, an open-in-new icon */
.ext { color: var(--accent); font-weight: 500; text-decoration: none; display: inline-flex; align-items: center; gap: 4px; }
.ext:hover { text-decoration: underline; }
.ext-ico { flex: none; opacity: .8; }
.chev { display: inline-block; width: 16px; color: var(--muted); }
.acts { white-space: nowrap; text-align: right; }
.acts .btn { margin-left: 6px; }
.inner-cell { padding: 0 !important; }
.table.fixed { table-layout: fixed; width: 100%; }
.table.fixed td, .table.fixed th { overflow-wrap: anywhere; }
.table.inner { margin: 0; width: 100%; box-shadow: none; border: 0; border-radius: 0; }
.dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; vertical-align: middle; margin-right: 6px; }
.dot.green { background: var(--success, #2e9e5b); }
.dot.orange { background: #e8912d; }
.dot.red { background: var(--danger, #c0392b); }
/* Units: an even grid, one cell per unit, so the codes line up in columns */
.units { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 6px 12px; padding: 6px 0 8px; }
.unit.miss { color: var(--danger, #c0392b); border-color: currentColor; }
.unit { display: flex; align-items: center; gap: 2px; padding: 4px 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); font-size: 13px; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
