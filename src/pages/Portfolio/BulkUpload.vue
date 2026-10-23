<template>
  <main class="content">
    <div class="page-head">
      <div>
        <h1>Bulk Upload</h1>
        <div class="sub">Add many properties or owners at once from an Excel or CSV file. Check the preview, then save.</div>
      </div>
    </div>

    <!-- What kind of file -->
    <div class="seg kind-seg" role="tablist" aria-label="What are you uploading">
      <button type="button" :class="{ on: kind === 'properties' }" :disabled="saving" @click="setKind('properties')">Properties</button>
      <button type="button" :class="{ on: kind === 'owners' }" :disabled="saving" @click="setKind('owners')">Unit owners</button>
    </div>

    <!-- Unit owners: which property the units belong to (one property per upload) -->
    <section class="card prop-card" v-show="kind === 'owners'">
      <div class="prop-row">
        <div class="field">
          <label for="buProp">Save units under</label>
          <select class="select" id="buProp" v-model="propertyId" :disabled="saving" @change="recheck()">
            <option value="" disabled>Choose a property</option>
            <template v-for="p in properties" :key="p.id"><option :value="p.id">{{ `${p.name} (${p.code || p.id})` }}</option></template>
            <option value="__new">New property…</option>
          </select>
        </div>
        <template v-if="propertyId === '__new'">
          <div class="field"><label for="buName">Property name</label><input class="input" id="buName" v-model="newProp.name" :disabled="saving" placeholder="e.g. D'Majestic Place"></div>
          <div class="field code"><label for="buCode">Short code</label><input class="input" id="buCode" v-model="newProp.code" :disabled="saving" placeholder="e.g. DM" @change="recheck()"></div>
        </template>
        <div class="field" v-show="sheets.length > 1">
          <label for="buSheet">Sheet</label>
          <select class="select" id="buSheet" v-model="sheet" :disabled="saving" @change="recheck()">
            <template v-for="n in sheets" :key="n"><option :value="n">{{ n }}</option></template>
          </select>
        </div>
      </div>
      <p class="help" style="margin:8px 0 0">Each row saves its unit under this property and links it to the owner. An owner already in the PMS (same IC, else email, else name when the row has neither) is reused, never added twice.</p>
    </section>

    <div class="notice error" v-show="error">{{ error }}</div>
    <div class="notice ok" v-show="done">{{ done }}</div>

    <!-- Drop zone -->
    <label class="dropzone" :class="{ over: dragging }" v-show="!rows.length && !loading"
           @dragover.prevent="dragging = true" @dragleave.prevent="dragging = false" @drop.prevent="dragging = false; pick($event.dataTransfer.files[0])">
      <svg class="dz-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4l7 7h-4.5v6h-5v-6H5z"/></svg>
      <b>{{ `Drag the ${kind === 'properties' ? 'properties' : 'unit owners'} file here, or` }}</b>
      <span class="btn">Choose file</span>
      <small>{{ kind === 'properties' ? '.xlsx or .csv · one property per row' : '.xlsx or .csv · one unit per row · Finance\'s Owner List works as it is (pick the sheet after)' }}</small>
      <input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden @change="pick($event.target.files[0]); $event.target.value = ''">
    </label>

    <section class="card" v-show="loading"><p class="muted" style="margin:0">Reading the file…</p></section>

    <!-- Preview -->
    <section class="card" v-show="rows.length">
      <div class="card-head">
        <h2>{{ `Preview · ${fileName}` }}</h2>
        <button type="button" class="link" :disabled="saving" @click="clear()">Choose another file</button>
      </div>

      <div class="counts">
        <span class="pill green">{{ `${count('ok')} ready` }}</span>
        <span class="pill amber" v-show="count('skip')">{{ `${count('skip')} already in the PMS` }}</span>
        <span class="pill blue" v-show="kind === 'owners' && rows.length">{{ `${newOwners} new ${newOwners === 1 ? 'owner' : 'owners'} · ${newUnits} new ${newUnits === 1 ? 'unit' : 'units'}` }}</span>
        <span class="pill red" v-show="count('error')">{{ `${count('error')} with problems` }}</span>
      </div>

      <p class="help sheets" v-show="sheetsNote">{{ sheetsNote }}</p>

      <!-- Helps when filling in the column names in the mapping functions below -->
      <details class="cols">
        <summary>{{ `Columns found in the file (${columns.length})` }}</summary>
        <p class="help">{{ columns.join(' · ') || 'None' }}</p>
      </details>

      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th class="num">Row</th>
              <template v-for="c in previewCols" :key="c.key"><th>{{ c.label }}</th></template>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="r in rows" :key="r.line">
              <tr :class="{ dim: r.status !== 'ok' }">
                <td class="num">{{ r.line }}</td>
                <template v-for="c in previewCols" :key="c.key"><td>{{ show(r, c.key) }}</td></template>
                <td>
                  <span class="pill" :class="{ ok: 'green', skip: 'amber', error: 'red' }[r.status]">{{ r.status === 'ok' ? (r.ownerId || r.id || 'New') : { skip: 'Skipped', error: 'Problem' }[r.status] }}</span>
                  <div class="help" v-show="r.note">{{ r.note }}</div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>

      <div class="actions">
        <span class="help">{{ blocker || (count('ok') ? `Only the ${count('ok')} ready ${count('ok') === 1 ? 'row is' : 'rows are'} saved. Skipped rows and rows with problems are left out.` : 'Nothing to save.') }}</span>
        <button type="button" class="btn btn-primary" :disabled="saving || !count('ok') || !!blocker" :title="blocker" @click="save()">{{ saving ? `Saving… ${savedSoFar} of ${count('ok')}` : 'Confirm & Upload to Database' }}</button>
      </div>
    </section>
  </main>
</template>

<script>
import { markRaw } from 'vue';
import { collection, doc, getDoc, getDocs, query, where, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase.js';
import { DEFAULT_OTA, unitIdOf } from '@/lib/engine.js';
import { markFrom } from '@/lib/summary-data.js';
import { ALL_MONTHS } from '@/lib/summaries.js';
import { audit, friendlyError, loadXlsxLib, loadProperties } from '@/lib/finance-data.js';
import { useSession } from '@/stores/session.js';

const me = useSession();

// =====================================================================================================
//  COLUMN MAPPING. This is the only part to change for a new file layout.
//
//  col(row, 'Header A', 'Header B', ...) returns the first of those columns that has a value.
//  Case, spaces and symbols are ignored, so 'Property Name', 'property name' and 'PROPERTY_NAME' all match.
//  Put the exact header from the file first; keep the others as fallbacks or delete them.
//  The preview's "Columns found in the file" list shows every header the file has.
//  A map function can return null to ignore a row (blank lines, section titles like "Double Room").
// =====================================================================================================

// Where the data starts and stops in each kind of file.
//   headerHas: the header row is the first row with a cell matching this (blank = the first row).
//              When the header row has blanks under a merged title (e.g. "Room Type/Unit List" in the row above),
//              the title from the row above is used.
//   stopAt:    rows from the first cell matching this onwards are ignored (blank = read to the end).
const FILE_LAYOUT = {
  properties: { headerHas: '', stopAt: '' },                          // TODO when the properties file arrives
  // Finance's "LATEST Owner List 2022 - 2026" (one sheet per property, e.g. DM).
  // Terminated units are listed below "TERMINATED UNIT"; their owners are past owners, so they are left out.
  owners: { headerHas: 'Owner Name 1', stopAt: 'TERMINATED UNIT' }
};

// One row of the Properties file -> the fields saved on properties/{id}.
function mapPropertyRow(row) {
  return {
    name:    col(row, 'Property Name', 'Property', 'Name'),          // TODO: real header for the property name
    code:    col(row, 'Short Code', 'Code', 'Property Code'),         // TODO: real header for the short code (e.g. DM)
    address: col(row, 'Address', 'Full Address'),                     // TODO
    city:    col(row, 'City', 'Town'),                                // TODO
    state:   col(row, 'State'),                                       // TODO
    // Optional. Portfolio's property form has these too; leave as they are if the file doesn't have them.
    ezeeAccount: col(row, 'eZee Account No', 'eZee Account'),         // TODO
    ezeeName:    col(row, 'Name in eZee Report', 'eZee Name')         // TODO
  };
}

// One row of the Owners file -> the fields saved in owners/{id}/private/main (personal data, PDPA).
// Mapped to the Owner List: "Owner Name 1", "Contact No 1", "IC / Passport No", "Email Address 1".
// Cells listing an old and a new owner on separate lines keep the "(new owner)" line (see ownerCell below).
function mapOwnerRow(row) {
  const fullName = ownerCell(col(row, 'Owner Name 1'));
  if (!fullName) return null;                                         // section titles and blank lines
  return {
    unit:     unitCodeFromList(ownerCell(col(row, 'Room Type/Unit List'))),   // saved as the unit code (see below)
    fullName,
    email:    firstEmail(ownerCell(col(row, 'Email Address 1'))),
    phone:    ownerCell(col(row, 'Contact No 1')),
    ic:       ownerCell(col(row, 'IC / Passport No', 'BRN'))          // BRN = company registration no. (183 Ampang sheet)
  };
}

// Finance's sheet sometimes has two owners in one cell, one per line, marked "(old owner)" / "(new owner)".
// Keeps the new owner's line; a cell with only old-owner lines counts as empty. "-" and "Not Provided" count as empty.
function ownerCell(v) {
  const lines = String(v || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const isNew = x => /\(\s*new(\s+owner)?\s*\)/i.test(x), isOld = x => /\(\s*old(\s+owner)?\s*\)/i.test(x);
  const line = lines.find(isNew) || lines.find(x => !isOld(x)) || '';
  const out = line.replace(/\(\s*(new|old)(\s+owner)?\s*\)/ig, '').trim();
  return /^(-+|not provided|n\/?a|nil)$/i.test(out) ? '' : out;
}
// "DM 07-10" -> "DM 0710" and "DM 14-08-2" -> "DM 1408-2", the same unit code the eZee upload makes from "DM 07-10-Double Room".
// Notes after the code are dropped: "CS B-13-07 (Queen)" -> "CS B-13-07", "DM 07-08 (Termination date: ...)" -> "DM 07-08" -> "DM 0708".
// Codes in other shapes are kept as written; if eZee names a unit differently, add the eZee name as an alias on Portfolio.
function unitCodeFromList(v) {
  const t = String(v || '').split(/\s+\(|\s+\*/)[0].replace(/\s+/g, ' ').trim();
  const m = /^(\S+) (\d{2})-(\d{2}[A-Z]?)(-\d+)?$/i.exec(t);
  return m ? `${m[1].toUpperCase()} ${m[2]}${m[3].toUpperCase()}${m[4] || ''}` : t;
}
const firstEmail = v => (String(v).match(/[^\s\/,;]+@[^\s\/,;]+\.[^\s\/,;]+/) || [''])[0];

// ---- helpers (no need to change) ----
const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
function col(row, ...names) {
  for (const n of names) { const v = row.__byKey[norm(n)]; if (v != null && String(v).trim() !== '') return String(v).trim(); }
  return '';
}
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '');   // same as Portfolio, so ids match
const icKey = s => String(s || '').replace(/[^0-9a-z]/gi, '').toUpperCase();
const ROWS_PER_BATCH = 60;   // up to 7 writes per unit-owner row (owner, private, unit, summary mark, 2 audits) stays under Firestore's 500 per batch

const COLS = {
  properties: [{ key: 'name', label: 'Name' }, { key: 'code', label: 'Code' }, { key: 'address', label: 'Address' }, { key: 'city', label: 'City' }, { key: 'state', label: 'State' }],
  owners: [{ key: 'unit', label: 'Unit' }, { key: 'fullName', label: 'Full name' }, { key: 'ic', label: 'IC' }, { key: 'email', label: 'Email' }, { key: 'phone', label: 'Phone' }]
};

export default {
  data() {
    return { kind: 'properties', dragging: false, loading: false, saving: false, savedSoFar: 0, error: '', done: '', fileName: '', columns: [], rows: [], sheetsNote: '',
      properties: [], propertyId: '', newProp: { name: '', code: '' }, sheets: [], sheet: '', parsed: markRaw({}) };
  },
  computed: {
    previewCols() { return COLS[this.kind]; },
    newOwners() { return this.rows.filter(r => r.status === 'ok' && r.newOwner).length; },
    newUnits() { return this.rows.filter(r => r.status === 'ok' && r.newUnit).length; },
    // Why saving is not possible yet (unit owners need a property)
    blocker() {
      if (this.kind !== 'owners' || !this.rows.length) return '';
      if (!this.propertyId) return 'Choose the property these units belong to.';
      if (this.propertyId === '__new') {
        const name = this.newProp.name.trim(), code = this.newProp.code.trim().toUpperCase();
        if (!name || !code) return 'Enter the new property\'s name and short code.';
        if (this.properties.some(p => p.id === slug(name) || (p.code || '').toUpperCase() === code)) return 'A property with this name or code already exists. Choose it from the list instead.';
      }
      return '';
    }
  },
  async mounted() {
    try { this.properties = await loadProperties(); } catch (e) { this.error = friendlyError(e, 'load the properties'); }
  },
  methods: {
    setKind(k) { if (k !== this.kind) { this.kind = k; this.clear(); this.done = ''; } },
    clear() { Object.assign(this, { rows: [], columns: [], fileName: '', error: '', sheetsNote: '', sheets: [], sheet: '', parsed: markRaw({}) }); },
    count(s) { return this.rows.filter(r => r.status === s).length; },
    show(r, key) { return r.data[key] || '—'; },

    // 1. Read the file and build the preview
    async pick(file) {
      if (!file || this.loading || this.saving) return;
      this.clear(); this.done = '';
      if (!/\.(csv|xlsx)$/i.test(file.name)) { this.error = 'Choose an .xlsx or .csv file.'; return; }
      this.loading = true; this.fileName = file.name;
      try {
        const X = await loadXlsxLib();
        const wb = /\.csv$/i.test(file.name) ? X.read(await file.text(), { type: 'string', raw: true }) : X.read(await file.arrayBuffer(), { type: 'array' });
        // Every sheet with the header row is read (the Owner List has one sheet per property); others are left out.
        const { headerHas, stopAt } = FILE_LAYOUT[this.kind];
        const hasCell = (r, text) => r.some(c => norm(c) === norm(text));
        const lines = [], used = [], unused = [], cols = new Set();
        for (const sheet of wb.SheetNames) {
          const grid = X.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: '', raw: false, blankrows: true });
          const h = headerHas ? grid.findIndex(r => hasCell(r, headerHas)) : (grid.length ? 0 : -1);
          if (h < 0) { unused.push(sheet); continue; }
          used.push(sheet);
          const above = h > 0 ? grid[h - 1] : [];
          const width = Math.max(...grid.map(r => r.length));
          const names = Array.from({ length: width }, (_, j) => String(grid[h][j] || above[j] || '').replace(/\s+/g, ' ').trim() || `Column ${j + 1}`);
          names.filter(n => !/^Column \d+$/.test(n)).forEach(n => cols.add(n));
          let end = stopAt ? grid.findIndex((r, i) => i > h && hasCell(r, stopAt)) : -1;
          if (end < 0) end = grid.length;
          for (let i = h + 1; i < end; i++) {
            const cells = grid[i] || [];
            if (!cells.some(c => String(c).trim())) continue;
            const r = {}; names.forEach((n, j) => { if (!(n in r) || String(r[n]).trim() === '') r[n] = cells[j] ?? ''; });
            Object.defineProperty(r, '__byKey', { value: Object.fromEntries(Object.entries(r).map(([k, v]) => [norm(k), v])) });
            lines.push({ r, sheet, line: i + 1 });   // row number as in the spreadsheet
            (this.parsed[sheet] ||= []).push({ r, sheet, line: String(i + 1) });
          }
        }
        if (!used.length) throw new Error(headerHas ? `This doesn't look like the ${this.kind} file: no sheet has a "${headerHas}" column.` : 'The file is empty.');
        // Row label: "DM 13" when the file has several sheets, "13" for a single sheet or a CSV
        const many = used.length > 1;
        lines.forEach(l => { l.line = many ? `${l.sheet} ${l.line}` : String(l.line); });
        this.columns = [...cols];
        this.sheetsNote = many || unused.length ? `Read ${used.length} ${used.length === 1 ? 'sheet' : 'sheets'}: ${used.join(', ')}.` + (unused.length ? ` Left out (no "${headerHas}" column): ${unused.join(', ')}.` : '') : '';
        if (!lines.length) throw new Error('The file has no rows under the header row.');
        if (this.kind === 'properties') this.rows = await this.checkProperties(lines);
        else {
          // Unit owners: one sheet = one property. Start on the sheet named like the property's code, else the first.
          this.sheets = used;
          const code = this.propCode().toLowerCase();
          this.sheet = used.find(n => n.toLowerCase() === code) || used[0];
          this.sheetsNote = used.length > 1 ? `This file has ${used.length} sheets. Pick the one for this property above.` + (unused.length ? ` Left out: ${unused.join(', ')}.` : '') : '';
          this.rows = await this.checkOwners(this.parsed[this.sheet] || []);
        }
      } catch (e) { this.error = e.message && !e.code ? e.message : friendlyError(e, 'read the file'); this.rows = []; }
      this.loading = false;
    },

    async checkProperties(lines) {
      const snap = await getDocs(collection(db, 'properties'));
      const ids = new Set(snap.docs.map(d => d.id)), codes = new Set(snap.docs.map(d => String(d.data().code || '').toUpperCase()));
      const seenIds = new Set(), seenCodes = new Set();
      return lines.map(({ r, line }) => ({ line, data: mapPropertyRow(r) })).filter(x => x.data).map(({ data, line }) => {
        data.code = data.code.toUpperCase();
        const id = data.name ? slug(data.name) : '';
        let status = 'ok', note = '';
        if (!data.name || !data.code) [status, note] = ['error', 'Needs a property name and a short code.'];
        else if (!id) [status, note] = ['error', 'The name has no letters or numbers.'];
        else if (ids.has(id) || codes.has(data.code)) [status, note] = ['skip', 'A property with this name or code is already in the PMS.'];
        else if (seenIds.has(id) || seenCodes.has(data.code)) [status, note] = ['skip', 'Same name or code as an earlier row in this file.'];
        if (status === 'ok') { seenIds.add(id); seenCodes.add(data.code); }
        return { line, data, id: status === 'ok' ? id : '', status, note };
      });
    },

    propCode() {
      if (this.propertyId === '__new') return this.newProp.code.trim().toUpperCase();
      return (this.properties.find(p => p.id === this.propertyId)?.code || '').toUpperCase();
    },
    // Build (or rebuild, when the property or sheet changes) the unit-owner preview
    async recheck() {
      if (this.kind !== 'owners' || !this.sheet || this.loading) return;
      this.loading = true; this.error = '';
      try { this.rows = await this.checkOwners(this.parsed[this.sheet] || []); }
      catch (e) { this.error = friendlyError(e, 'check the file'); this.rows = []; }
      this.loading = false;
    },

    async checkOwners(lines) {
      const snap = await getDocs(collection(db, 'owners'));
      // New owner codes continue from the highest existing OWN-nnn
      let n = Math.max(0, ...snap.docs.map(d => Number(String(d.data().code || d.id).replace(/\D/g, '')) || 0));
      // An owner is the same person when the IC matches, else the email, else (no IC or email in the row) the full name.
      // Read from each owner's private part.
      const privs = await Promise.all(snap.docs.map(d => getDoc(doc(db, 'owners', d.id, 'private', 'main')).catch(() => null)));
      const ics = new Map(), emails = new Map(), names = new Map();   // key -> { id, where }
      privs.forEach((p, i) => { const v = p?.data?.() || {}, o = { id: snap.docs[i].id, where: 'in the PMS' };
        if (v.ic) ics.set(icKey(v.ic), o); if (v.email) emails.set(v.email.toLowerCase(), o); if (v.fullName) names.set(norm(v.fullName), o); });
      // Units already under this property (a new property has none)
      const pid = this.propertyId && this.propertyId !== '__new' ? this.propertyId : '';
      const units = new Map();
      if (pid) (await getDocs(query(collection(db, 'units'), where('propertyId', '==', pid)))).docs.forEach(d => {
        const u = { id: d.id, ...d.data() };
        for (const c of [u.unitCode, u.ezeeRoomMatch, ...(u.aliases || [])]) if (c) units.set(norm(c), u);
      });
      const seenUnits = new Map();
      return lines.map(({ r, line }) => ({ line, data: mapOwnerRow(r) })).filter(x => x.data).map(({ data, line }) => {
        data.email = data.email.toLowerCase();
        const ic = icKey(data.ic);
        const row = { line, data, status: 'ok', note: '', ownerId: '', newOwner: false, unitId: '', newUnit: false };
        const fail = note => Object.assign(row, { status: 'error', note });
        if (!data.unit) return fail('No unit in this row.');
        if (!data.fullName) return fail('Needs the owner\'s full name.');
        if (data.email && !/^\S+@\S+\.\S+$/.test(data.email)) return fail('The email doesn\'t look right.');
        if (seenUnits.has(norm(data.unit))) return fail(`Unit ${data.unit} is listed twice (also row ${seenUnits.get(norm(data.unit))}).`);
        seenUnits.set(norm(data.unit), line);
        // Owner: reuse when the IC or email is known, else a new code
        const known = (ic && ics.get(ic)) || (data.email && emails.get(data.email)) || (!ic && !data.email && names.get(norm(data.fullName))) || null;
        const notes = [];
        if (known) { row.ownerId = known.id; notes.push(known.where === 'in the PMS' ? `Owner already in the PMS (${known.id}).` : `Same owner as row ${known.where}.`); }
        else {
          row.ownerId = `OWN-${String(++n).padStart(3, '0')}`; row.newOwner = true;
          const o = { id: row.ownerId, where: line }; if (ic) ics.set(ic, o); if (data.email) emails.set(data.email, o); names.set(norm(data.fullName), o);
          notes.push('New owner.');
        }
        // Unit: existing one under this property, or a new unit
        const u = units.get(norm(data.unit));
        if (u) {
          row.unitId = u.id;
          if (u.ownerId === row.ownerId) return Object.assign(row, { status: 'skip', note: `${u.unitCode} is already linked to ${row.ownerId}.` });
          notes.push(u.ownerId ? `${u.unitCode}: owner changes from ${u.ownerId}.` : `${u.unitCode}: linked to this owner.`);
        } else { row.newUnit = true; notes.push(`New unit ${data.unit}.`); }
        row.note = notes.join(' ');
        return row;
      });
    },

    // 2. Save the ready rows
    async save() {
      const ready = this.rows.filter(r => r.status === 'ok');
      if (!ready.length || this.saving) return;
      this.saving = true; this.savedSoFar = 0; this.error = ''; this.done = '';
      try {
        if (this.kind === 'owners') await this.ensureProperty();
        const made = new Set();   // owners created in this upload (a later row of the same owner only links its unit)
        for (let i = 0; i < ready.length; i += ROWS_PER_BATCH) {
          const b = writeBatch(db);
          for (const r of ready.slice(i, i + ROWS_PER_BATCH)) this.kind === 'properties' ? this.writeProperty(b, r) : this.writeUnitOwner(b, r, made);
          await b.commit();
          this.savedSoFar = Math.min(i + ROWS_PER_BATCH, ready.length);
        }
        if (this.kind === 'properties') this.done = `Saved ${ready.length} ${ready.length === 1 ? 'property' : 'properties'} from ${this.fileName}. Add their units on Portfolio, or upload their eZee report.`;
        else {
          const p = this.properties.find(x => x.id === this.propertyId);
          this.done = `Saved ${ready.length} ${ready.length === 1 ? 'unit' : 'units'} under ${p?.name || 'the property'} (${this.newUnits} new units, ${this.newOwners} new owners). Set each unit's arrangement and fees on Portfolio.`;
        }
        this.clear();
      } catch (e) {
        // Batches before the failing one are already saved; reading the file again marks those rows as skipped.
        this.error = friendlyError(e, 'save') + (this.savedSoFar ? ` ${this.savedSoFar} rows were saved before this. Choose the file again to save the rest.` : '');
      }
      this.saving = false;
    },
    writeProperty(b, r) {
      const d = r.data;
      b.set(doc(db, 'properties', r.id), {
        name: d.name, code: d.code, info: { address: d.address, city: d.city, state: d.state, ezeeAccount: d.ezeeAccount, ezeeName: d.ezeeName },
        active: true, createdAt: serverTimestamp(), createdBy: me.user.uid
      });
      // Same starting OTA settings Portfolio gives a new property
      b.set(doc(db, 'properties', r.id, 'rateVersions', '2000-01_default'), { effectiveFrom: '2000-01', ota: DEFAULT_OTA, earlyCheckInToOwner: true, tourismTaxPerNight: 10,
        reason: 'Default OTA settings', createdBy: me.user.uid, createdByName: me.name, createdAt: serverTimestamp() });
      audit(b, me, { action: 'property.create', entity: `properties/${r.id}`, propertyId: r.id, reason: `Bulk upload (${this.fileName})` });
    },
    // A new property is created once, before the units (same fields and starting OTA settings as Portfolio)
    async ensureProperty() {
      if (this.propertyId !== '__new') return;
      const name = this.newProp.name.trim(), code = this.newProp.code.trim().toUpperCase(), id = slug(name);
      const b = writeBatch(db);
      b.set(doc(db, 'properties', id), { name, code, info: { address: '', city: '', state: '', ezeeAccount: '', ezeeName: '' }, active: true, createdAt: serverTimestamp(), createdBy: me.user.uid });
      b.set(doc(db, 'properties', id, 'rateVersions', '2000-01_default'), { effectiveFrom: '2000-01', ota: DEFAULT_OTA, earlyCheckInToOwner: true, tourismTaxPerNight: 10,
        reason: 'Default OTA settings', createdBy: me.user.uid, createdByName: me.name, createdAt: serverTimestamp() });
      audit(b, me, { action: 'property.create', entity: `properties/${id}`, propertyId: id, reason: `Bulk upload (${this.fileName})` });
      await b.commit();
      this.properties = await loadProperties();
      this.propertyId = id; this.newProp = { name: '', code: '' };
    },
    writeUnitOwner(b, r, made) {
      const d = r.data, pid = this.propertyId, why = `Bulk upload (${this.fileName})`;
      if (r.newOwner && !made.has(r.ownerId)) {
        made.add(r.ownerId);
        b.set(doc(db, 'owners', r.ownerId), { code: r.ownerId, active: true, createdAt: serverTimestamp(), createdBy: me.user.uid });
        b.set(doc(db, 'owners', r.ownerId, 'private', 'main'), { fullName: d.fullName, email: d.email, phone: d.phone, ic: d.ic, updatedAt: serverTimestamp(), updatedBy: me.user.uid });
        // Audit names the owner code only, never the personal values
        audit(b, me, { action: 'owner.create', entity: `owners/${r.ownerId}`, propertyId: pid, reason: why });
      }
      const unitId = r.unitId || unitIdOf(pid, d.unit);
      if (r.newUnit) b.set(doc(db, 'units', unitId), { propertyId: pid, unitCode: d.unit, ezeeRoomMatch: d.unit, aliases: [], ownerId: r.ownerId, active: true,
        createdAt: serverTimestamp(), createdBy: me.user.uid });
      else b.set(doc(db, 'units', unitId), { ownerId: r.ownerId, updatedAt: serverTimestamp(), updatedBy: me.user.uid }, { merge: true });
      markFrom(b, pid, ALL_MONTHS, unitId);   // the unit's month summaries are worked out again (new unit or new owner)
      audit(b, me, { action: r.newUnit ? 'unit.create' : 'unit.update', entity: `units/${unitId}`, propertyId: pid,
        changes: [{ field: 'ownerId', old: null, new: r.ownerId }], reason: why });
    }
  }
};
</script>

<style scoped>
    .kind-seg { max-width: 320px; }
    .prop-card { margin-bottom: 16px; }
    .prop-row { display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-end; }
    .prop-row .field { margin: 0; min-width: 0; flex: 1 1 220px; }
    .prop-row .field.code { flex: 0 1 120px; }
    .counts { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
    .cols { margin-bottom: 12px; font-size: 13px; }
    .sheets { margin: 0 0 8px; }
    .cols summary { cursor: pointer; color: var(--text-2); }
    .cols .help { margin: 6px 0 0; word-break: break-word; }
    tr.dim td { color: var(--muted); }
    .actions { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 16px; }
</style>
