<template>
  <div>
    <section class="kpis">
      <button type="button" class="card kpi kpi-link" @click="$emit('units', 'all')"><div class="label">Units</div><div class="value">{{ units.length }}</div><div class="hint">{{ acc.viewOnly ? typeText(units) || 'None yet' : mixText(units) || 'None yet' }}</div></button>
      <button type="button" class="card kpi kpi-link" v-if="acc.viewOnly" @click="$emit('tab', 'owners')"><div class="label">Owners</div><div class="value">{{ new Set(units.map(x => x.ownerId).filter(Boolean)).size }}</div><div class="hint">Linked to these units</div></button>
      <template v-else>
        <button type="button" class="card kpi kpi-link" @click="$emit('units', 'fixed')"><div class="label">Fixed rent a month</div><div class="value small">{{ `RM ${amt(fixedTotal)}` }}</div><div class="hint">{{ `${units.filter(x => isFixedTerms(x.terms)).length} fixed-rent units` }}</div></button>
        <RouterLink class="card kpi kpi-link" :to="`/Finance/month-end?property=${property.id}&month=${asOf}`" title="Open Month-end payout"><div class="label">{{ `${monthOnly(asOf)} statements` }}</div><div class="value small">{{ done ? 'Completed' : 'Open' }}</div><div class="hint">Month-end payout</div></RouterLink>
        <button type="button" class="card kpi kpi-link" @click="$emit('units', 'none')"><div class="label">Needs attention</div><div class="value" :class="{ alert: units.filter(x => !x.terms).length }">{{ units.filter(x => !x.terms).length }}</div><div class="hint">Units not set up</div></button>
      </template>
    </section>
    <section class="card">
      <div class="card-head"><h2>Property details</h2><button class="editlink" @click="$emit('edit')" v-if="!acc.viewOnly || acc.canEdit">Edit ›</button></div>
      <div class="info-grid">
        <div>
          <div class="kv"><span>Property name</span><span>{{ property.name }}</span></div>
          <div class="kv"><span>Short code</span><span>{{ property.code || '—' }}</span></div>
          <div class="kv"><span>Address</span><span>{{ info.address || '—' }}</span></div>
          <div class="kv"><span>City · State</span><span>{{ `${info.city || '—'} · ${info.state || '—'}` }}</span></div>
        </div>
        <div>
          <div class="kv"><span>eZee account number</span><span>{{ info.ezeeAccount || '—' }}</span></div>
          <div class="kv"><span>Name in the eZee report</span><span>{{ info.ezeeName || '—' }}</span></div>
          <!-- 17 Nov 2026: the property's folder in its state's Drive folder (Settings > States). Read-only. -->
          <div class="kv"><span>Google Drive folder</span><span><a v-if="driveLink" :href="driveLink" target="_blank" rel="noopener">Open folder</a><template v-else>{{ driveMsg }}</template></span></div>
          <!-- 17 Nov 2026: where this property's unit folders are (issue photos go to <units folder>/<unit>/Maintenance).
               Usually <property>/Owner; a property can have its own (e.g. D Majestic: Profit Sharing). Directors and Operations change it. -->
          <div class="kv"><span>Units folder</span><span>
            <a v-if="own" :href="own.link" target="_blank" rel="noopener">{{ own.folderName || 'Open folder' }}</a>
            <template v-else>Owner (usual)</template>
            <button type="button" class="link uf-btn" v-if="canSetUnits && !unitsEdit" @click="openUnits()">Change</button>
          </span></div>
          <div class="uf-edit" v-if="unitsEdit">
            <input class="input" v-model.trim="unitsPaste" placeholder="Paste the Google Drive folder link" aria-label="Units folder link" @keydown.enter.prevent="saveUnits()">
            <div class="uf-row">
              <button type="button" class="btn btn-primary" @click="saveUnits()" :disabled="unitsBusy || !unitsPaste">{{ unitsBusy ? 'Checking…' : 'Save' }}</button>
              <button type="button" class="btn" v-if="own" @click="saveUnits(true)" :disabled="unitsBusy">Use Owner again</button>
              <button type="button" class="btn" @click="unitsEdit = false" :disabled="unitsBusy">Cancel</button>
            </div>
            <span class="help">The folder that holds this property's unit folders (e.g. "DM 13-11"). Share it with support@widebed.com as Editor.</span>
            <div class="notice error" v-if="unitsErr">{{ unitsErr }}</div>
          </div>
          <p class="help">{{ acc.viewOnly ? 'Each unit\'s owner, type and rooms are on the Units tab.' : 'Unit details (owner, type, rooms, size, car parks, bill accounts, JMB) are on each unit: Units tab, Edit.' }}</p>
        </div>
      </div>
    </section>
  </div>
</template>

<script>
// A property's Overview tab: summary cards (each opens the Units tab with a filter) and the property's details.
import { amt } from '@/lib/format.js';
import { mixText, typeText, monthOnly, isFixedTerms } from '@/lib/portfolio-data.js';
import { propertyFolder, folderIdOf, checkFolder } from '@/lib/drive.js';
import { loadDriveUnits, saveDriveUnits, canSetUpStates } from '@/lib/drive-states.js';
import { useSession } from '@/stores/session.js';

export default {
  props: {
    property: { type: Object, required: true },
    units: { type: Array, required: true },
    asOf: { type: String, required: true },
    done: { type: Boolean, default: false },   // the month's statements are completed
    acc: { type: Object, required: true }
  },
  emits: ['units', 'tab', 'edit'],
  data() { return { driveLink: '', driveMsg: 'Checking…', own: null, unitsEdit: false, unitsPaste: '', unitsBusy: false, unitsErr: '' }; },
  watch: { 'property.id': { immediate: true, handler() { this.findDrive(); } } },
  computed: {
    info() { return this.property.info || {}; },
    canSetUnits() { return canSetUpStates(useSession().role); },
    fixedTotal() { return this.units.filter(x => isFixedTerms(x.terms)).reduce((s, x) => s + (Number(x.terms.fixedRentAmount) || 0), 0); }
  },
  methods: {
    amt, mixText, typeText, monthOnly, isFixedTerms,
    async findDrive() {
      this.driveLink = ''; this.driveMsg = 'Checking…';
      try {
        loadDriveUnits().then(m => { this.own = m[this.property.id] || null; });
        const f = await propertyFolder(this.property.id);
        this.driveLink = f.link || '';
        this.driveMsg = f.link ? '' : f.why === 'state' ? `${this.info.state || 'Its state'} has no Drive folder yet (Settings > States)` : 'Not found in Drive';
      } catch (e) { this.driveMsg = 'Could not check'; }
    },
    openUnits() { this.unitsEdit = true; this.unitsPaste = this.own?.link || ''; this.unitsErr = ''; },
    // Save a pasted folder link (checked first: the PMS's Drive account must be able to add to it), or go back to Owner
    async saveUnits(reset = false) {
      this.unitsErr = '';
      let folder = null;
      if (!reset) {
        const id = folderIdOf(this.unitsPaste);
        if (!id) return this.unitsErr = 'That is not a Google Drive folder link.';
        this.unitsBusy = true;
        try { folder = await checkFolder(id); } catch (e) { this.unitsBusy = false; return this.unitsErr = e.message; }
      }
      this.unitsBusy = true;
      try {
        this.own = await saveDriveUnits(useSession(), this.property.id, this.property.name, folder);
        this.unitsEdit = false;
      } catch (e) {
        this.unitsErr = e.code === 'permission-denied' ? 'Firestore refused this. The latest security rules (Draft 0.79) may not be published yet.' : (e.message || String(e));
      }
      this.unitsBusy = false;
    }
  }
};
</script>

<style scoped>
.uf-btn { margin-left: 8px; font-size: 13px; }
.uf-edit { display: grid; gap: 8px; margin: 4px 0 12px; }
.uf-row { display: flex; gap: 8px; flex-wrap: wrap; }
</style>
