<template>
  <main class="content">
    <div class="page-head">
      <div>
        <h1>States</h1>
        <div class="sub">Each state's Google Drive folder (e.g. Owner Files). A property can only be added in a state set up here. Issue photos and videos go to the unit's Maintenance folder inside it.</div>
      </div>
    </div>

    <div class="loading-bar" v-show="loading" style="margin-bottom:12px"></div>
    <div class="notice error" v-show="error">{{ error }}</div>
    <div class="callout">Share each folder with support@widebed.com as Editor first. Inside it the PMS looks for &lt;Property&gt; / Owner / &lt;Unit&gt; / Maintenance, matching names without spaces, dashes or capitals ("DM 1311" = "DM 13-11").</div>

    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>State</th><th>Drive folder</th><th>Set by</th><th></th></tr></thead>
        <tbody>
          <template v-for="st in STATES" :key="st">
            <tr>
              <td><b>{{ st }}</b></td>
              <td>
                <template v-if="map[st]"><a :href="map[st].link" target="_blank" rel="noopener">{{ map[st].folderName }}</a></template>
                <span class="help" v-else>Not set up</span>
                <div class="link-row" v-if="edit === st">
                  <input class="input" v-model="paste" placeholder="Paste the Google Drive folder link" :aria-label="`Drive folder link for ${st}`" @keydown.enter.prevent="save(st)">
                  <button class="btn btn-primary btn-sm" :disabled="busy" @click="save(st)">{{ busy ? 'Checking…' : 'Check and save' }}</button>
                  <button class="btn btn-sm" :disabled="busy" @click="edit = ''">Cancel</button>
                </div>
                <div class="notice error" v-if="edit === st && editErr">{{ editErr }}</div>
              </td>
              <td class="help">{{ map[st] ? `${map[st].byName || '—'} · ${(map[st].at || '').slice(0, 10)}` : '' }}</td>
              <td class="acts">
                <template v-if="canEdit && edit !== st">
                  <button class="btn btn-sm" @click="startEdit(st)">{{ map[st] ? 'Change' : 'Set up' }}</button>
                  <button class="btn btn-sm" v-if="map[st]" :disabled="busy" @click="remove(st)">Remove</button>
                </template>
                <button class="btn btn-sm" v-if="map[st] && canEdit" :disabled="checking === st" @click="check(st)">{{ checking === st ? 'Checking…' : 'Check links' }}</button>
              </td>
            </tr>
            <tr v-if="results[st]">
              <td colspan="4">
                <div class="check">
                  <div class="help">{{ summary(st) }}</div>
                  <template v-for="p in results[st]" :key="p.id">
                    <details class="prop">
                      <summary>
                        <span class="pill" :class="p.link ? 'green' : 'grey'">{{ p.link ? 'Linked' : 'Not found' }}</span>
                        <b>{{ p.name }}</b>
                        <a v-if="p.link" :href="p.link" target="_blank" rel="noopener" @click.stop>{{ p.folderName }}</a>
                        <span class="help" v-if="p.link">{{ p.ownerLink ? `${p.unitsLinked} of ${p.units.length} units linked` : 'No Owner folder yet' }}</span>
                      </summary>
                      <div class="units" v-if="p.link && p.ownerLink">
                        <template v-for="u in p.units" :key="u.code">
                          <span class="unit"><span class="pill" :class="u.link ? 'green' : 'grey'">{{ u.link ? 'Linked' : 'Not found' }}</span>
                            <a v-if="u.link" :href="u.link" target="_blank" rel="noopener">{{ u.code }}</a><span v-else>{{ u.code }}</span></span>
                        </template>
                        <span class="help" v-if="!p.units.length">No units in the PMS yet.</span>
                      </div>
                    </details>
                  </template>
                  <div class="help" v-if="!results[st].length">No PMS properties in {{ st }} yet.</div>
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
    <p class="help">Check links only reads the Drive: nothing is made or renamed. To link one that shows Not found, rename the property or unit in the PMS (or the folder in Drive) so the names match.</p>
  </main>
</template>

<script>
// Settings > States (17 Nov 2026): set each state's Drive folder, and check which properties and units have a folder.
// Directors and Operations edit; the link is checked through /api/drive (support@widebed.com must be able to add to it).
import { useSession } from '@/stores/session.js';
import { STATES, stateOf } from '@/lib/states.js';
import { loadDriveStates, saveDriveState, canSetUpStates } from '@/lib/drive-states.js';
import { folderIdOf, checkFolder, linkCheck } from '@/lib/drive.js';
import { loadProperties, loadUnits, friendlyError } from '@/lib/finance-data.js';
import { askConfirm } from '@/lib/confirm.js';
import { toast } from '@/lib/toast.js';

const me = useSession();

export default {
  data() { return { STATES, map: {}, loading: true, busy: false, error: '', edit: '', paste: '', editErr: '', checking: '', results: {} }; },
  computed: { canEdit() { return canSetUpStates(me.role); } },
  async mounted() {
    this.map = { ...(await loadDriveStates(true)) };
    this.loading = false;
  },
  methods: {
    startEdit(st) { this.edit = st; this.paste = this.map[st]?.link || ''; this.editErr = ''; },
    async save(st) {
      const id = folderIdOf(this.paste);
      if (!id) return this.editErr = 'Paste a Google Drive folder link (it has /folders/ in it).';
      this.busy = true; this.editErr = '';
      try {
        const f = await checkFolder(id);
        this.map = { ...(await saveDriveState(me, st, f)) };
        this.edit = ''; delete this.results[st];
        toast.ok(`${st} now uses "${f.name}".`);
      } catch (e) { this.editErr = e.code ? friendlyError(e, 'save the state') : e.message; }
      this.busy = false;
    },
    async remove(st) {
      if (!(await askConfirm({ title: `Remove the Drive folder for ${st}?`, message: `New properties can't be added in ${st} until it is set up again, and its issue files go to Widebed PMS Files. Nothing in Drive is deleted.`, confirmText: 'Remove', danger: true }))) return;
      this.busy = true;
      try { this.map = { ...(await saveDriveState(me, st, null)) }; delete this.results[st]; }
      catch (e) { this.error = friendlyError(e, 'remove it'); }
      this.busy = false;
    },
    // Read-only: every PMS property in this state, and its units, against the folders in Drive
    async check(st) {
      this.checking = st; this.error = '';
      try {
        const props = (await loadProperties()).filter(p => stateOf(p) === st);
        const withUnits = await Promise.all(props.map(async p => ({ id: p.id, name: p.name, units: (await loadUnits(p.id)).map(u => u.unitCode).filter(Boolean) })));
        const got = (await linkCheck(st, withUnits)).properties || [];
        const byId = Object.fromEntries(got.map(r => [r.id, r]));
        this.results = { ...this.results, [st]: withUnits.map(p => {
          const r = byId[p.id] || {}, units = p.units.map(code => ({ code, link: r.units?.[code] || '' }));
          return { ...p, link: r.link || '', folderName: r.folderName || '', ownerLink: r.ownerLink || '', units, unitsLinked: units.filter(u => u.link).length };
        }).sort((a, b) => Number(!!a.link) - Number(!!b.link) || a.name.localeCompare(b.name)) };
      } catch (e) { this.error = e.code ? friendlyError(e, 'check the links') : e.message; }
      this.checking = '';
    },
    summary(st) {
      const list = this.results[st] || [], linked = list.filter(p => p.link);
      const units = linked.flatMap(p => p.units), unitsLinked = units.filter(u => u.link).length;
      return `${linked.length} of ${list.length} properties linked · ${unitsLinked} of ${units.length} units in linked properties linked`;
    }
  }
};
</script>

<style scoped>
.link-row { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
.link-row .input { flex: 1 1 280px; }
.acts { white-space: nowrap; text-align: right; }
.acts .btn { margin-left: 6px; }
.check { display: grid; gap: 6px; padding: 4px 0; }
.prop summary { cursor: pointer; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; padding: 4px 0; }
.units { display: flex; flex-wrap: wrap; gap: 6px 14px; padding: 6px 0 10px 22px; }
.unit { display: inline-flex; gap: 6px; align-items: center; }
</style>
