<template>
  <main class="content">
    <div class="page-head">
      <div>
        <h1>Bulk Upload</h1>
        <div class="sub">Add many properties or owners at once from an Excel or CSV file. Check the preview, then save.</div>
      </div>
    </div>

    <ol class="steps bu-steps" aria-label="Steps">
      <li class="step" :class="{ current: !rows.length && !loading, done: rows.length || loading }"><span class="dot">1</span>Choose what and where</li>
      <li class="step" :class="{ current: loading, done: rows.length }"><span class="dot">2</span>Add the file</li>
      <li class="step" :class="{ current: rows.length && !done, done }"><span class="dot">3</span>Check and save</li>
    </ol>

    <!-- What kind of file -->
    <div class="bu-kinds" role="tablist" aria-label="What are you uploading">
      <button type="button" class="bu-kind" :class="{ on: kind === 'properties' }" :disabled="saving" @click="setKind('properties')">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 21V5l8-3 8 3v16h-6v-6h-4v6z"/></svg>
        <span><b>Properties</b><small>One property per row</small></span>
      </button>
      <button type="button" class="bu-kind" :class="{ on: kind === 'owners' }" :disabled="saving" @click="setKind('owners')">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 100-8 4 4 0 000 8zm0 2c-4 0-8 2-8 5v1h16v-1c0-3-4-5-8-5z"/></svg>
        <span><b>Unit owners</b><small>Owners with their units, one unit per row</small></span>
      </button>
      <button type="button" class="bu-kind" :class="{ on: kind === 'bookings' }" :disabled="saving" @click="setKind('bookings')">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 2v2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2h-2V2h-2v2H9V2zm-2 8h14v10H5z"/></svg>
        <span><b>Booking details</b><small>Willow "Booking Details" sheet · saved as Offline bookings</small></span>
      </button>
    </div>

    <!-- Unit owners: which property the units belong to (one property per upload) -->
    <section class="card prop-card" v-show="kind === 'owners'">
      <div class="prop-row">
        <div class="field">
          <label for="buProp">Save units under</label>
          <OptionPicker v-model="propertyId" :options="propertyChoices(true)" label="Save units under" :disabled="saving" @change="recheck()" />
        </div>
        <template v-if="propertyId === '__new'">
          <div class="field"><label for="buName">Property name</label><input class="input" id="buName" v-model="newProp.name" :disabled="saving" placeholder="e.g. D'Majestic Place"></div>
          <div class="field code"><label for="buCode">Short code</label><input class="input" id="buCode" v-model="newProp.code" :disabled="saving" placeholder="e.g. DM" @change="recheck()"></div>
        </template>
        <div class="field" v-show="sheets.length > 1 && !allMode">
          <label for="buSheet">Sheet</label>
          <OptionPicker v-model="sheet" :options="sheets.map(n => ({ value: n, label: n }))" label="Sheet" :disabled="saving" @change="recheck()" />
        </div>
      </div>
      <p class="help" style="margin:8px 0 0">{{ allMode
        ? 'Choose every property\'s file at once (or the whole Owner List workbook). Each file or sheet is matched to the property with the same code or name; check the matches below the preview.'
        : 'Each row saves its unit under this property and links it to the owner.' }} An owner already in the PMS (same IC, else email, else name when the row has neither) is reused, never added twice.</p>

      <!-- All properties: which property each sheet (or CSV file) goes to -->
      <div class="table-wrap sheet-map" v-show="allMode && sheets.length">
        <table class="table">
          <thead><tr><th>File or sheet</th><th>Save under</th><th>New property name</th><th>Code</th></tr></thead>
          <tbody>
            <template v-for="n in sheets" :key="n">
              <tr v-if="sheetMap[n]">
                <td>{{ n }}</td>
                <td>
                  <OptionPicker v-model="sheetMap[n].pid" :options="propertyChoices(false)" :label="`Property for ${n}`" :disabled="saving" @change="recheck()" />
                </td>
                <td><input class="input" v-show="sheetMap[n].pid === '__new'" v-model="sheetMap[n].name" :disabled="saving" :aria-label="`New property name for ${n}`"></td>
                <td><input class="input code-in" v-show="sheetMap[n].pid === '__new'" v-model="sheetMap[n].code" :disabled="saving" :aria-label="`Code for ${n}`"></td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </section>

    <div class="notice error" v-show="error">{{ error }}</div>
    <div class="notice ok" v-show="done">{{ done }}</div>

    <!-- Drop zone -->
    <label class="dropzone" :class="{ over: dragging }" v-show="!rows.length && !loading"
           @dragover.prevent="dragging = true" @dragleave.prevent="dragging = false" @drop.prevent="dragging = false; pick($event.dataTransfer.files)">
      <svg class="dz-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4l7 7h-4.5v6h-5v-6H5z"/></svg>
      <b>{{ allMode ? 'Drag all the property files here, or' : `Drag the ${{ properties: 'properties', owners: 'unit owners', bookings: 'booking details' }[kind]} file here, or` }}</b>
      <span class="btn">{{ allMode ? 'Choose files' : 'Choose file' }}</span>
      <small>{{ kind === 'bookings' ? '.xlsx or .csv · Willow Booking Details sheet · one booking per row (leave ID empty for a new one)' : kind === 'properties' ? '.xlsx or .csv · one property per row' : allMode ? '.xlsx or .csv · select several files at once (Ctrl+A in the folder) · one property per file or sheet' : '.xlsx or .csv · one unit per row · Finance\'s Owner List works as it is (pick the sheet after)' }}</small>
      <input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" :multiple="allMode" hidden @change="pick($event.target.files); $event.target.value = ''">
    </label>

    <section class="card" v-show="loading"><p class="muted" style="margin:0">Reading the file…</p></section>

    <!-- Preview -->
    <section class="card" v-show="rows.length">
      <div class="card-head">
        <h2><span class="file-badge">{{ /\.xlsx$/i.test(fileName) ? 'XLSX' : 'CSV' }}</span> {{ fileName }}</h2>
        <button type="button" class="link" :disabled="saving" @click="clear()">{{ allMode ? 'Choose other files' : 'Choose another file' }}</button>
      </div>

      <div class="bu-stats">
        <div class="bu-stat ok"><b>{{ count('ok') }}</b><span>Ready to save</span></div>
        <div class="bu-stat skip"><b>{{ count('skip') }}</b><span>Already in the PMS</span></div>
        <div class="bu-stat bad"><b>{{ count('error') }}</b><span>With problems</span></div>
      </div>
      <p class="bu-note" v-show="kind === 'owners' && rows.length">{{ `This will add ${newOwners} new ${newOwners === 1 ? 'owner' : 'owners'}, ${newUnits} new ${newUnits === 1 ? 'unit' : 'units'} and set up ${newFees} ${newFees === 1 ? 'fee' : 'fees'}.` }}</p>

      <p class="help sheets" v-show="sheetsNote">{{ sheetsNote }}</p>

      <!-- Helps when filling in the column names in the mapping functions below -->
      <details class="cols">
        <summary>{{ `Columns found in the file (${columns.length})` }}</summary>
        <p class="help">{{ columns.join(' · ') || 'None' }}</p>
      </details>

      <Paged :items="rows" v-slot="{ pageRows }">
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
            <template v-for="r in pageRows" :key="r.line">
              <tr :class="{ dim: r.status !== 'ok' }">
                <td class="num">{{ r.line }}</td>
                <template v-for="c in previewCols" :key="c.key"><td>{{ show(r, c.key) }}</td></template>
                <td>
                  <span class="pill" :class="{ ok: 'green', skip: 'amber', error: 'red' }[r.status]">{{ r.status === 'ok' ? (kind === 'owners' ? (r.newOwner ? 'New owner' : 'Existing owner') : kind === 'bookings' ? r.id : 'New') : { skip: 'Skipped', error: 'Problem' }[r.status] }}</span>
                  <div class="help" v-show="r.note">{{ r.note }}</div>
                  <button type="button" class="btn btn-sm fix-btn" v-if="r.fixable && !saving" @click="openFix(r)">Fix this</button>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
      </Paged>

      <div class="actions bu-actions">
        <span class="help">{{ blocker || (count('ok') ? `Only the ${count('ok')} ready ${count('ok') === 1 ? 'row is' : 'rows are'} saved. Skipped rows and rows with problems are left out.` : 'Nothing to save.') }}</span>
        <button type="button" class="btn btn-primary" :disabled="saving || !count('ok') || !!blocker" :title="blocker" @click="save()">{{ saving ? `Saving… ${savedSoFar} of ${count('ok')}` : 'Confirm & Upload to Database' }}</button>
      </div>
    </section>

    <!-- Fix a booking row that has a problem -->
    <div class="modal-back" v-if="fix" @click.self="fix = null">
      <div class="modal" role="dialog" aria-label="Fix this row">
        <h2 style="margin:0 0 4px">{{ `Fix row ${fix.row.line}` }}</h2>
        <p class="help" style="margin:0 0 14px">{{ fix.row.note }}</p>
        <div class="fix-grid">
          <div class="field"><label>Guest name</label><input class="input" v-model="fix.d.name"></div>
          <div class="field"><label>Email</label><input class="input" v-model="fix.d.email"></div>
          <div class="field"><label>Property</label><OptionPicker v-model="fix.d.propertyId" :options="propertyChoices(false).filter(o => !o.value.startsWith('__'))" label="Property" searchable @change="fixProperty()" /></div>
          <div class="field"><label>Unit</label><OptionPicker v-model="fix.d.unitNumber" :options="fix.unitOptions" label="Unit" searchable placeholder="Choose a unit" /></div>
          <div class="field"><label>Check in</label><input class="input" type="date" v-model="fix.d.checkIn"></div>
          <div class="field"><label>Check out</label><input class="input" type="date" v-model="fix.d.checkOut"></div>
        </div>
        <p class="help" v-if="fix.error" style="color:var(--red)">{{ fix.error }}</p>
        <div class="actions"><button type="button" class="btn" @click="fix = null">Cancel</button><button type="button" class="btn btn-primary" :disabled="fix.busy" @click="applyFix()">Apply fix</button></div>
      </div>
    </div>
  </main>
</template>

<script>
import { markRaw } from 'vue';
import OptionPicker from '@/components/OptionPicker.vue';
import { collection, doc, getDoc, getDocs, query, where, writeBatch, serverTimestamp } from 'firebase/firestore';
import { idPrefix } from '@/lib/lodgment.js';
import { db } from '@/lib/firebase.js';
import { clearCache } from '@/lib/cache.js';
import { ARRANGEMENTS, DEFAULT_OTA, unitIdOf } from '@/lib/engine.js';
import { markFrom } from '@/lib/summary-data.js';
import { ALL_MONTHS } from '@/lib/summaries.js';
import { audit, friendlyError, loadXlsxLib, loadProperties, loadUnits } from '@/lib/finance-data.js';
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
  owners: { headerHas: 'Owner Name 1', stopAt: 'TERMINATED UNIT' },
  // Willow 4.0 (N8N) "Booking Details" sheet; the header row is the first row
  bookings: { headerHas: 'Unit Number', stopAt: '' }
};

// A date cell -> 'yyyy-mm-dd' ('' when it can't be read). The file is read with dateNF yyyy-mm-dd, so real dates arrive in that form;
// typed text like 3/1/2026 or 3-Jan-2026 is read day first (Malaysia).
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
function toIso(v) {
  const t = String(v ?? '').trim(); if (!t) return '';
  const pad = n => String(n).padStart(2, '0'), year = y => (y < 100 ? 2000 + y : y);
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = t.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
  if (m) return `${year(+m[3])}-${pad(m[2])}-${pad(m[1])}`;
  m = t.match(/^(\d{1,2})[ -]([A-Za-z]{3})[a-z]*[ -,]*(\d{2,4})/);
  if (m && MONTHS.includes(m[2].toLowerCase())) return `${year(+m[3])}-${pad(MONTHS.indexOf(m[2].toLowerCase()) + 1)}-${pad(m[1])}`;
  return '';
}
const money = v => { const n = parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; };

// One row of the Booking Details sheet -> a reservationLodgments record (same field names as the Reservation Lodgment form).
function mapBookingRow(row) {
  const unit = col(row, 'Unit Number'), property = col(row, 'Property Name');
  if (!unit && !property && !col(row, 'Name')) return null;           // blank lines
  const checkIn = toIso(col(row, 'Check in')), checkOut = toIso(col(row, 'Check out'));
  return {
    bookingId: col(row, 'ID').toUpperCase(),
    name: col(row, 'Name'), icPassport: col(row, 'IC/passport number', 'IC / Passport'), phone: col(row, 'Phone/WhatsApp', 'Phone'), email: col(row, 'Email'),
    bookingSource: col(row, 'Booking source'), propertyName: property, unitNumber: unit,
    checkIn, checkOut, rawIn: col(row, 'Check in'), rawOut: col(row, 'Check out'),
    rentalAmount: money(col(row, 'Rental amount')), renewalDate: toIso(col(row, 'Renewal Date')) || checkOut, rentalStatus: col(row, 'Rental Status'),
    depositAmount: money(col(row, 'Amount of deposit')), ownerEmail: col(row, 'Owner Email'),
    moveInStatus: col(row, 'Move_In_Status') || 'Ready_to_Send', moveOutStatus: col(row, 'Move_Out_Status') || 'Ready_to_Send',
    mainDoorPasscode: col(row, 'Main Door Passcode'), currentExpiryDate: toIso(col(row, 'Current Expiry Date')),
    nextDoorPasscode: col(row, 'Next Door Passcode'), nextExpiryDate: toIso(col(row, 'Next Expiry Date')),
    passwordStatus: col(row, 'Password Status'), whatsappGroupLink: col(row, 'Whatsapp Group Link'), remark: col(row, 'Remark'),
    electricity: money(col(row, 'Electricity')), water: money(col(row, 'Water')), sewerage: money(col(row, 'Sewerage')),
    billPeriod: col(row, 'Electric Bill Period', 'Water Bill Period', 'Sewerage Bill Period'), invoiceBill: col(row, 'Invoice Bill')
  };
}

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
    ic:       ownerCell(col(row, 'IC / Passport No', 'BRN')),         // BRN = company registration no. (183 Ampang sheet)
    // Fee columns, read by feeTerms below. Saved only for units that have no fee set up yet.
    feeText:  col(row, 'Service Fees%', 'Percentage %'),              // "40", "20%", "25%"; "45%/20%/10%" = tiered, left out
    utilText: col(row, 'Utilities %', 'Utilities Sharing'),           // "20%" or "25" = utility fee; "1WSS"/"Owner" = no %
    remark:   col(row, 'Remark', 'Remarks')                           // "Fixed Rental - RM 1,300" = fixed rent
  };
}

// The Owner List's fee columns -> the unit's arrangement (same settings as Portfolio's Edit unit panel).
//   Remark "Fixed Rental - RM 1,300"   -> Fixed rent RM 1,300
//   Percentage 40                      -> Profit share 40% (20% service + 20% utilities)
//   Percentage 20 / 25%, no utility %  -> Profit share 20% (at that service fee)
//   Service fee + a utility % column   -> Profit share 40% at those two rates (e.g. 25% + 20%)
//   "20 Change to 40 start on Jan 24"  -> the new rate (40)
//   Tiered "45%/20%/10%" or blank      -> left out; set it on Portfolio
// Returns { terms, label } or { terms: null, label: why not }.
function feeTerms(d) {
  const fixed = /fixed\s*rental?\s*-?\s*RM\s*([\d,]+(?:\.\d+)?)/i.exec(d.remark || '');
  if (fixed) {
    const amount = Number(fixed[1].replace(/,/g, ''));
    return { terms: { arrangement: 'fixedRent', fixedRentAmount: amount, serviceFeePct: null, utilityFeePct: null, sstOnFeePct: null }, label: `Fixed rent RM ${amount.toLocaleString('en-MY')}` };
  }
  const t = String(d.feeText || '').trim();
  if (!t) return { terms: null, label: 'No fee in file' };
  if (/\d\s*%?\s*\/\s*\d/.test(t)) return { terms: null, label: `Tiered fee (${t}), set on Portfolio` };
  const changed = /change\s*to\s*(\d+(?:\.\d+)?)/i.exec(t);
  const fee = Number(changed ? changed[1] : (/(\d+(?:\.\d+)?)/.exec(t) || [])[1]);
  if (!(fee > 0 && fee < 100)) return { terms: null, label: `Fee "${t}" not understood, set on Portfolio` };
  const um = /^\s*(\d+(?:\.\d+)?)\s*%*\s*$/.exec(d.utilText || '');
  let service = fee / 100, utility = um ? Number(um[1]) / 100 : 0;
  if (!um && fee === 40) { service = 0.2; utility = 0.2; }
  const arrangement = utility > 0 ? 'profitShare40' : 'profitShare20', def = ARRANGEMENTS[arrangement];
  const own = (v, k) => (Math.abs(v - def[k]) < 1e-9 ? null : v);   // null = the arrangement's normal rate
  const p = v => `${Math.round(v * 1000) / 10}%`;
  return { terms: { arrangement, fixedRentAmount: null, serviceFeePct: own(service, 'serviceFeePct'), utilityFeePct: own(utility, 'utilityFeePct'), sstOnFeePct: null },
    label: utility > 0 ? `${p(service)} + ${p(utility)} utilities` : `${p(service)} service fee` };
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
const ROWS_PER_BATCH = 50;   // up to 8 writes per unit-owner row (owner, private, unit, fee, summary mark, 2 audits) stays under Firestore's 500 per batch

const COLS = {
  properties: [{ key: 'name', label: 'Name' }, { key: 'code', label: 'Code' }, { key: 'address', label: 'Address' }, { key: 'city', label: 'City' }, { key: 'state', label: 'State' }],
  owners: [{ key: 'unit', label: 'Unit' }, { key: 'fullName', label: 'Full name' }, { key: 'ic', label: 'IC' }, { key: 'email', label: 'Email' }, { key: 'phone', label: 'Phone' }, { key: 'feeLabel', label: 'Fee' }],
  bookings: [{ key: 'name', label: 'Name' }, { key: 'propertyName', label: 'Property' }, { key: 'unitNumber', label: 'Unit' }, { key: 'checkIn', label: 'Check in' }, { key: 'checkOut', label: 'Check out' }, { key: 'rentalAmount', label: 'Rental' }]
};

export default {
  components: { OptionPicker },
  data() {
    return { kind: 'properties', dragging: false, loading: false, saving: false, savedSoFar: 0, error: '', done: '', fileName: '', columns: [], rows: [], sheetsNote: '',
      properties: [], propertyId: '', newProp: { name: '', code: '' }, sheets: [], sheet: '', parsed: markRaw({}), sheetMap: {}, fix: null, bkCtx: null };
  },
  computed: {
    previewCols() { return COLS[this.kind]; },
    // Unit owners for every property at once: each sheet (or CSV file) goes to its own property
    allMode() { return this.kind === 'owners' && this.propertyId === '__all'; },
    newOwners() { return this.rows.filter(r => r.status === 'ok' && r.newOwner).length; },
    newUnits() { return this.rows.filter(r => r.status === 'ok' && r.newUnit).length; },
    newFees() { return this.rows.filter(r => r.status === 'ok' && r.terms).length; },
    // Why saving is not possible yet (unit owners need a property)
    blocker() {
      if (this.kind !== 'owners' || !this.rows.length) return '';
      if (!this.propertyId) return 'Choose the property these units belong to.';
      if (this.allMode) {
        const used = this.sheets.map(n => [n, this.sheetMap[n]]).filter(([, m]) => m && m.pid !== '__skip');
        if (!used.length) return 'Every file is left out. Choose a property for at least one.';
        const fresh = used.filter(([, m]) => m.pid === '__new');
        for (const [n, m] of fresh) {
          if (!m.name.trim() || !m.code.trim()) return `Enter a name and short code for the new property from ${n}.`;
          if (this.properties.some(p => p.id === slug(m.name.trim()) || (p.code || '').toUpperCase() === m.code.trim().toUpperCase())) return `A property named or coded like ${m.name.trim()} already exists. Choose it from the list for ${n}.`;
        }
        const keys = fresh.flatMap(([, m]) => [slug(m.name.trim()), 'code:' + m.code.trim().toUpperCase()]);
        if (new Set(keys).size < keys.length) return 'Two new properties have the same name or code.';
        return '';
      }
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
    // Choices for the property picker. `top` = the main picker (with "All properties"); otherwise the per-sheet one ("Leave out").
    propertyChoices(top) {
      const list = this.properties.map(p => ({ value: p.id, label: `${p.name} (${p.code || p.id})` }));
      return top
        ? [{ value: '', label: 'Choose a property' }, { value: '__all', label: 'All properties (one sheet or file each)' }, ...list, { value: '__new', label: 'New property…' }]
        : [{ value: '__skip', label: 'Leave out' }, { value: '__new', label: 'New property…' }, ...list];
    },
    setKind(k) { if (k !== this.kind) { this.kind = k; this.clear(); this.done = ''; } },
    clear() { Object.assign(this, { rows: [], columns: [], fileName: '', error: '', sheetsNote: '', sheets: [], sheet: '', parsed: markRaw({}), sheetMap: {} }); },
    count(s) { return this.rows.filter(r => r.status === s).length; },
    show(r, key) { const v = r.data[key]; return v || v === 0 ? v : '—'; },

    // 1. Read the file and build the preview
    // files: a FileList or array. Several files only in "All properties" mode; otherwise the first is read.
    async pick(files) {
      let list = [...(files || [])];
      if (!list.length || this.loading || this.saving) return;
      if (!this.allMode) list = list.slice(0, 1);
      this.clear(); this.done = '';
      if (list.some(f => !/\.(csv|xlsx)$/i.test(f.name))) { this.error = 'Choose .xlsx or .csv files only.'; return; }
      this.loading = true; this.fileName = list.length > 1 ? `${list.length} files` : list[0].name;
      try {
        const X = await loadXlsxLib();
        // Every sheet with the header row is read (the Owner List has one sheet per property); others are left out.
        // A CSV is one sheet, named from the file: "(LATEST) Owner List 2022 - 2026.xlsx - DM.csv" -> "DM".
        const { headerHas, stopAt } = FILE_LAYOUT[this.kind];
        const hasCell = (r, text) => r.some(c => norm(c) === norm(text));
        const lines = [], used = [], unused = [], cols = new Set();
        const sheetsIn = [];
        for (const file of list) {
          const csv = /\.csv$/i.test(file.name);
          const wb = csv ? X.read(await file.text(), { type: 'string', raw: true }) : X.read(await file.arrayBuffer(), { type: 'array' });
          const base = file.name.replace(/\.(csv|xlsx)$/i, '').split(' - ').pop().trim() || file.name;
          for (const s of wb.SheetNames) sheetsIn.push({ ws: wb.Sheets[s], label: csv || list.length === 1 ? (csv ? base : s) : `${base} · ${s}` });
        }
        for (const { ws, label: sheet } of sheetsIn) {
          if (this.parsed[sheet]) { unused.push(`${sheet} (same name twice)`); continue; }
          const grid = X.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false, blankrows: true, dateNF: 'yyyy-mm-dd' });
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
        else if (this.kind === 'bookings') this.rows = await this.checkBookings(lines);
        else if (this.allMode) {
          this.sheets = used; this.sheet = used[0]; this.matchSheets();
          this.sheetsNote = `Read ${used.length} ${used.length === 1 ? 'file or sheet' : 'files or sheets'}.` + (unused.length ? ` Left out (no "${headerHas}" column): ${unused.join(', ')}.` : '');
          this.rows = await this.checkOwners(this.groups());
        } else {
          // Unit owners: one sheet = one property. Start on the sheet named like the property's code, else the first.
          this.sheets = used;
          const code = this.propCode().toLowerCase();
          this.sheet = used.find(n => n.toLowerCase() === code) || used[0];
          this.sheetsNote = used.length > 1 ? `This file has ${used.length} sheets. Pick the one for this property above.` + (unused.length ? ` Left out: ${unused.join(', ')}.` : '') : '';
          this.rows = await this.checkOwners(this.groups());
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

    // Booking details (Willow) are saved as Offline bookings: guest details in the private part, utility amounts as a utility bill.
    // An ID already in the PMS is skipped; a row with no ID gets the next one for its property (DM-012 ...), shared with the lodgment form.
    async checkBookings(lines) {
      const [snap, cSnap] = await Promise.all([getDocs(collection(db, 'offlineBookings')), getDocs(collection(db, 'lodgmentCounters'))]);
      const have = new Set(snap.docs.map(d => String(d.data().bookingNo || d.id.replace(/^offline_/, '')).toUpperCase()));
      const next = {}; cSnap.docs.forEach(d => { next[d.id] = d.data().next || 1; });
      const rows = lines.map(({ r, line }) => ({ line, data: mapBookingRow(r) })).filter(x => x.data)
        .map(({ line, data }) => ({ line, data, id: '', status: 'ok', note: '', fixable: false }));
      const used = {};   // typed IDs move the counter on, so new IDs never clash with them
      for (const r of rows) { const m = r.data.bookingId.match(/^(.*)-(\d+)$/); if (m) used[m[1]] = Math.max(used[m[1]] || 0, +m[2]); }
      this.bkCtx = markRaw({ have, next, used, seen: new Map(), units: {} });
      for (const r of rows) await this.checkBookingRow(r);
      return rows;
    },
    async unitsOf(pid) {
      const c = this.bkCtx;
      if (!c.units[pid]) {
        const m = new Map();
        for (const u of await loadUnits(pid)) for (const k of [u.unitCode, u.ezeeRoomMatch, ...(u.aliases || [])]) if (k) m.set(norm(k), u);
        c.units[pid] = m;
      }
      return c.units[pid];
    },
    // Checks one booking row. A problem that can be corrected in the row itself is marked fixable (the Fix this button).
    async checkBookingRow(row) {
      const c = this.bkCtx, d = row.data;
      const bad = (note, fixable = true) => Object.assign(row, { status: 'error', note, fixable });
      row.fixable = false;
      if (!d.name) return bad('Needs the guest\'s name.');
      if (!d.propertyName && !d.propertyId) return bad('Needs the property name.');
      if (!d.checkIn || !d.checkOut) return bad(`Check-in or check-out date can't be read (${d.rawIn || 'empty'} / ${d.rawOut || 'empty'}).`);
      if (d.checkOut < d.checkIn) return bad('Check-out is before check-in.');   // same day is allowed (1 day stay)
      if (d.email && !/^\S+@\S+\.\S+$/.test(d.email)) return bad('The email doesn\'t look right.');
      // Property: the one picked in Fix, else the one named like the file's Property Name
      const k = norm(d.propertyName);
      const prop = d.propertyId ? this.properties.find(p => p.id === d.propertyId)
        : this.properties.find(p => norm(p.name) === k) || this.properties.find(p => k.length >= 3 && (norm(p.name).includes(k) || k.includes(norm(p.name)))) || null;
      if (!prop) return bad(`"${d.propertyName}" isn't a property in the PMS. Pick the right one, or add it on Portfolio first.`);
      d.propertyId = prop.id;
      if (!d.unitNumber) return bad('Needs the unit number.');
      const unit = (await this.unitsOf(prop.id)).get(norm(d.unitNumber));
      if (!unit) return bad(`Unit ${d.unitNumber} isn't under ${prop.name}. Pick the right unit, or add it on Portfolio first.`);
      Object.assign(row, { pid: prop.id, propertyName: prop.name, unitId: unit.id, unitCode: unit.unitCode });
      // ID
      if (d.bookingId) {
        if (c.have.has(d.bookingId)) return Object.assign(row, { id: d.bookingId, status: 'skip', note: `${d.bookingId} is already in the PMS.`, fixable: false });
        if (c.seen.has(d.bookingId) && c.seen.get(d.bookingId) !== row.line) return Object.assign(row, { id: d.bookingId, status: 'skip', note: `${d.bookingId} is listed twice in this file.`, fixable: false });
        row.id = d.bookingId;
      } else if (!row.id) {
        const prefix = idPrefix(prop.name), n = Math.max(c.next[prefix] || 1, (c.used[prefix] || 0) + 1);
        c.used[prefix] = n; row.id = `${prefix}-${String(n).padStart(3, '0')}`;
      }
      c.seen.set(row.id, row.line);
      d.nights = Math.max(1, Math.round((new Date(d.checkOut) - new Date(d.checkIn)) / 86400000));
      Object.assign(row, { status: 'ok', note: d.bookingId ? '' : 'New booking no.' });
      return row;
    },
    async openFix(r) {
      const d = { ...r.data };
      this.fix = { row: r, d, unitOptions: [], error: '', busy: false };
      if (!d.propertyId) { const k = norm(d.propertyName); const p = this.properties.find(x => norm(x.name) === k); if (p) d.propertyId = p.id; }
      await this.fixProperty(true);
    },
    async fixProperty(keep) {
      const f = this.fix; if (!f) return;
      if (!keep) f.d.unitNumber = '';
      if (!f.d.propertyId) { f.unitOptions = []; return; }
      const list = await loadUnits(f.d.propertyId);
      f.unitOptions = list.map(u => ({ value: u.unitCode, label: u.unitCode }));
    },
    async applyFix() {
      const f = this.fix; f.busy = true; f.error = '';
      try {
        const r = f.row; Object.assign(r.data, f.d, { propertyName: this.properties.find(p => p.id === f.d.propertyId)?.name || f.d.propertyName });
        await this.checkBookingRow(r);
        if (r.status === 'error') f.error = r.note; else this.fix = null;
      } catch (e) { f.error = friendlyError(e, 'check the row'); }
      if (this.fix) f.busy = false;
    },

    propCode() {
      if (this.propertyId === '__new') return this.newProp.code.trim().toUpperCase();
      return (this.properties.find(p => p.id === this.propertyId)?.code || '').toUpperCase();
    },
    // Build (or rebuild, when the property or sheet changes) the unit-owner preview
    async recheck() {
      if (this.kind !== 'owners' || !this.sheet || this.loading) return;
      this.loading = true; this.error = '';
      try { if (this.allMode) this.matchSheets(); this.rows = await this.checkOwners(this.groups()); }
      catch (e) { this.error = friendlyError(e, 'check the file'); this.rows = []; }
      this.loading = false;
    },

    // "All properties": match each sheet to the property whose code or name is the sheet's name (e.g. DM, FLEXUS),
    // else to a new property named after the sheet. Choices already made on the page are kept.
    matchSheets() {
      const map = { ...this.sheetMap };
      for (const n of this.sheets) {
        if (map[n]) continue;
        const k = norm(n), byCode = this.properties.filter(p => norm(p.code) === k), byName = this.properties.filter(p => norm(p.name) === k),
          inName = this.properties.filter(p => k.length >= 3 && norm(p.name).includes(k));
        const hit = byCode.length === 1 ? byCode[0] : byName.length === 1 ? byName[0] : inName.length === 1 ? inName[0] : null;
        map[n] = hit ? { pid: hit.id, name: '', code: '' } : { pid: '__new', name: n.trim(), code: n.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) };
      }
      this.sheetMap = map;
    },
    // Property id a sheet's units are saved under ('' = a new property not created yet)
    pidFor(sheet) {
      if (!this.allMode) return this.propertyId && this.propertyId !== '__new' ? this.propertyId : '';
      const m = this.sheetMap[sheet];
      return m && m.pid !== '__new' && m.pid !== '__skip' ? m.pid : '';
    },
    groups() {
      if (!this.allMode) return [{ sheet: this.sheet, pid: this.pidFor(this.sheet), lines: this.parsed[this.sheet] || [] }];
      return this.sheets.filter(n => this.sheetMap[n] && this.sheetMap[n].pid !== '__skip').map(n => ({ sheet: n, pid: this.pidFor(n), lines: this.parsed[n] || [] }));
    },

    async checkOwners(groups) {
      const snap = await getDocs(collection(db, 'owners'));
      // New owner codes continue from the highest existing OWN-nnn
      let n = Math.max(0, ...snap.docs.map(d => Number(String(d.data().code || d.id).replace(/\D/g, '')) || 0));
      // An owner is the same person when the IC matches, else the email, else (no IC or email in the row) the full name.
      // Read from each owner's private part.
      const privs = await Promise.all(snap.docs.map(d => getDoc(doc(db, 'owners', d.id, 'private', 'main')).catch(() => null)));
      const ics = new Map(), emails = new Map(), names = new Map();   // key -> { id, where }
      const nameOf = {};   // owner id -> name, for the notes (owner codes are never shown)
      privs.forEach((p, i) => { const v = p?.data?.() || {}, o = { id: snap.docs[i].id, where: 'in the PMS' }; nameOf[o.id] = v.fullName || '';
        if (v.ic) ics.set(icKey(v.ic), o); if (v.email) emails.set(v.email.toLowerCase(), o); if (v.fullName) names.set(norm(v.fullName), o); });
      // Units already under each property (a new property has none)
      const unitsOf = {};
      for (const pid of new Set(groups.map(g => g.pid).filter(Boolean))) {
        const units = unitsOf[pid] = new Map();
        const docs = (await getDocs(query(collection(db, 'units'), where('propertyId', '==', pid)))).docs;
        // Whether each unit already has a fee set up (then the file's fee is left alone)
        const termSnaps = await Promise.all(docs.map(d => getDocs(collection(db, 'units', d.id, 'terms')).catch(() => null)));
        docs.forEach((d, i) => {
          const u = { id: d.id, ...d.data(), hasTerms: !!termSnaps[i]?.size };
          for (const c of [u.unitCode, u.ezeeRoomMatch, ...(u.aliases || [])]) if (c) units.set(norm(c), u);
        });
      }
      return groups.flatMap(({ sheet, pid, lines }) => { const units = unitsOf[pid] || new Map(), seenUnits = new Map();
      // Row label: "DM 13" when several files or sheets are saved together
      return lines.map(({ r, line }) => ({ line: groups.length > 1 ? `${sheet} ${line}` : line, data: mapOwnerRow(r) })).filter(x => x.data).map(({ data, line }) => {
        data.email = data.email.toLowerCase();
        const ic = icKey(data.ic);
        const row = { line, sheet, data, status: 'ok', note: '', ownerId: '', newOwner: false, unitId: '', newUnit: false, linkOwner: true, terms: null };
        const fee = feeTerms(data);
        data.feeLabel = fee.label;
        const fail = note => Object.assign(row, { status: 'error', note });
        if (!data.unit) return fail('No unit in this row.');
        if (!data.fullName) return fail('Needs the owner\'s full name.');
        if (data.email && !/^\S+@\S+\.\S+$/.test(data.email)) return fail('The email doesn\'t look right.');
        if (seenUnits.has(norm(data.unit))) return fail(`Unit ${data.unit} is listed twice (also row ${seenUnits.get(norm(data.unit))}).`);
        seenUnits.set(norm(data.unit), line);
        // Owner: reuse when the IC or email is known, else a new code
        const known = (ic && ics.get(ic)) || (data.email && emails.get(data.email)) || (!ic && !data.email && names.get(norm(data.fullName))) || null;
        const notes = [];
        if (known) { row.ownerId = known.id; notes.push(known.where === 'in the PMS' ? `Owner already in the PMS${nameOf[known.id] ? ` (${nameOf[known.id]})` : ''}.` : `Same owner as row ${known.where}.`); }
        else {
          row.ownerId = `OWN-${String(++n).padStart(3, '0')}`; row.newOwner = true; nameOf[row.ownerId] = data.fullName;
          const o = { id: row.ownerId, where: line }; if (ic) ics.set(ic, o); if (data.email) emails.set(data.email, o); names.set(norm(data.fullName), o);
        }
        // Unit: existing one under this property, or a new unit
        const u = units.get(norm(data.unit));
        if (u) {
          row.unitId = u.id;
          row.terms = u.hasTerms ? null : fee.terms;
          if (u.hasTerms && fee.terms) data.feeLabel = 'Already set up';
          if (u.ownerId === row.ownerId) {
            if (!row.terms) return Object.assign(row, { status: 'skip', note: `${u.unitCode} is already linked to this owner${u.hasTerms ? ' and has its fee set up' : ''}.` });
            row.linkOwner = false; notes.length = 0; notes.push(`${u.unitCode}: owner already linked, fee added.`);
          } else notes.push(u.ownerId ? `${u.unitCode}: owner changes from ${nameOf[u.ownerId] || 'another owner'}.` : `${u.unitCode}: linked to this owner.`);
        } else { row.newUnit = true; row.terms = fee.terms; notes.push(`New unit ${data.unit}.`); }
        row.note = notes.join(' ');
        return row;
      }); });
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
          for (const r of ready.slice(i, i + ROWS_PER_BATCH)) this.kind === 'properties' ? this.writeProperty(b, r) : this.kind === 'bookings' ? this.writeBooking(b, r) : this.writeUnitOwner(b, r, made);
          await b.commit(); clearCache();
          this.savedSoFar = Math.min(i + ROWS_PER_BATCH, ready.length);
        }
        if (this.kind === 'bookings') {
          // Move each property's counter past the highest number now in use
          const top = {};
          for (const r of ready) { const m = r.id.match(/^(.*)-(\d+)$/); if (m) top[m[1]] = Math.max(top[m[1]] || 0, +m[2]); }
          const cur = await getDocs(collection(db, 'lodgmentCounters'));
          const now = Object.fromEntries(cur.docs.map(d => [d.id, d.data().next || 1]));
          const cb = writeBatch(db);
          for (const [p, n] of Object.entries(top)) if (n + 1 > (now[p] || 1)) cb.set(doc(db, 'lodgmentCounters', p), { next: n + 1 });
          await cb.commit();
          // Utility bills go in after the bookings (the rules need the booking to exist first)
          const bills = ready.filter(r => r.data.electricity || r.data.water || r.data.sewerage);
          for (let i = 0; i < bills.length; i += 200) {
            const ub = writeBatch(db);
            for (const r of bills.slice(i, i + 200)) this.writeBill(ub, r);
            await ub.commit();
          }
          this.done = `Saved ${ready.length} ${ready.length === 1 ? 'booking' : 'bookings'} from ${this.fileName} as Offline bookings (see Portfolio > Bookings)` + (bills.length ? `, with ${bills.length} utility ${bills.length === 1 ? 'bill' : 'bills'}.` : '.');
        } else if (this.kind === 'properties') this.done = `Saved ${ready.length} ${ready.length === 1 ? 'property' : 'properties'} from ${this.fileName}. Add their units on Portfolio, or upload their eZee report.`;
        else if (this.allMode) {
          const n = new Set(ready.map(r => r.sheet)).size;
          this.done = `Saved ${ready.length} ${ready.length === 1 ? 'unit' : 'units'} under ${n} ${n === 1 ? 'property' : 'properties'} (${this.newUnits} new units, ${this.newOwners} new owners, ${this.newFees} fees). Units the file had no clear fee for still need theirs set on Portfolio.`;
        } else {
          const p = this.properties.find(x => x.id === this.propertyId);
          this.done = `Saved ${ready.length} ${ready.length === 1 ? 'unit' : 'units'} under ${p?.name || 'the property'} (${this.newUnits} new units, ${this.newOwners} new owners, ${this.newFees} fees). Units the file had no clear fee for still need theirs set on Portfolio.`;
        }
        this.clear();
      } catch (e) {
        // Batches before the failing one are already saved; reading the file again marks those rows as skipped.
        this.error = friendlyError(e, 'save') + (this.savedSoFar ? ` ${this.savedSoFar} rows were saved before this. Choose the file again to save the rest.` : '');
      }
      this.saving = false;
    },
    writeBooking(b, r) {
      const d = r.data, id = `offline_${r.id}`, ref = doc(db, 'offlineBookings', id), c = x => Math.round((Number(x) || 0) * 100) / 100;
      const longTerm = d.nights >= 30;
      b.set(ref, { source: 'import', inquiryId: null, bookingNo: r.id, tenantId: null,
        propertyId: r.pid, propertyName: r.propertyName, unitId: r.unitId, unitCode: r.unitCode,
        arrival: d.checkIn, departure: d.checkOut, nights: d.nights, longTerm,
        amount: longTerm ? 0 : c(d.rentalAmount), monthlyRent: longTerm ? c(d.rentalAmount) : 0, deposit: c(d.depositAmount),
        paymentRef: '', ezeeReservationNo: '', status: 'active',
        bookingSource: d.bookingSource, rentalStatus: d.rentalStatus, renewalDate: d.renewalDate, ownerEmail: d.ownerEmail,
        moveInStatus: d.moveInStatus, moveOutStatus: d.moveOutStatus, passwordStatus: d.passwordStatus,
        whatsappGroupLink: d.whatsappGroupLink, remark: d.remark, importedFrom: this.fileName,
        createdAt: serverTimestamp(), createdBy: me.user.uid, createdByName: me.name });
      b.set(doc(ref, 'private', 'main'), { name: d.name, icPassport: d.icPassport, phone: d.phone, email: d.email,
        mainDoorPasscode: d.mainDoorPasscode, currentExpiryDate: d.currentExpiryDate, nextDoorPasscode: d.nextDoorPasscode, nextExpiryDate: d.nextExpiryDate });
      audit(b, me, { action: 'offlineBooking.create', entity: `offlineBookings/${id}`, propertyId: r.pid, reason: `Bulk upload (${this.fileName})` });
    },
    writeBill(b, r) {
      const d = r.data, id = `offline_${r.id}`, c = x => Math.round((Number(x) || 0) * 100) / 100;
      const dates = [...String(d.billPeriod).matchAll(/\d{4}-\d{2}-\d{2}|\d{1,2}[\/.]\d{1,2}[\/.]\d{2,4}/g)].map(m => toIso(m[0])).filter(Boolean);
      const total = c(d.electricity) + c(d.water) + c(d.sewerage);
      b.set(doc(db, 'utilityBills', id), { bookingId: id, propertyId: r.pid, propertyName: r.propertyName, unitCode: r.unitCode,
        periodFrom: dates[0] || d.checkIn, periodTo: dates[1] || d.checkOut, electricity: c(d.electricity), water: c(d.water), sewerage: c(d.sewerage), total,
        invoiceLink: /^https?:/i.test(d.invoiceBill) ? d.invoiceBill : '', utilityStatus: 'Ready_to_Send',
        createdAt: serverTimestamp(), createdBy: me.user.uid, createdByName: me.name });
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
      if (this.allMode) return this.ensureSheetProperties();
      if (this.propertyId !== '__new') return;
      const name = this.newProp.name.trim(), code = this.newProp.code.trim().toUpperCase(), id = slug(name);
      const b = writeBatch(db);
      b.set(doc(db, 'properties', id), { name, code, info: { address: '', city: '', state: '', ezeeAccount: '', ezeeName: '' }, active: true, createdAt: serverTimestamp(), createdBy: me.user.uid });
      b.set(doc(db, 'properties', id, 'rateVersions', '2000-01_default'), { effectiveFrom: '2000-01', ota: DEFAULT_OTA, earlyCheckInToOwner: true, tourismTaxPerNight: 10,
        reason: 'Default OTA settings', createdBy: me.user.uid, createdByName: me.name, createdAt: serverTimestamp() });
      audit(b, me, { action: 'property.create', entity: `properties/${id}`, propertyId: id, reason: `Bulk upload (${this.fileName})` });
      await b.commit(); clearCache();
      this.properties = await loadProperties();
      this.propertyId = id; this.newProp = { name: '', code: '' };
    },
    // "All properties": create every new property once, then point its sheet at it
    async ensureSheetProperties() {
      const fresh = this.sheets.filter(n => this.sheetMap[n]?.pid === '__new' && this.rows.some(r => r.sheet === n && r.status === 'ok'));
      if (!fresh.length) return;
      const b = writeBatch(db), made = {};
      for (const n of fresh) {
        const m = this.sheetMap[n], name = m.name.trim(), code = m.code.trim().toUpperCase(), id = slug(name);
        b.set(doc(db, 'properties', id), { name, code, info: { address: '', city: '', state: '', ezeeAccount: '', ezeeName: '' }, active: true, createdAt: serverTimestamp(), createdBy: me.user.uid });
        b.set(doc(db, 'properties', id, 'rateVersions', '2000-01_default'), { effectiveFrom: '2000-01', ota: DEFAULT_OTA, earlyCheckInToOwner: true, tourismTaxPerNight: 10,
          reason: 'Default OTA settings', createdBy: me.user.uid, createdByName: me.name, createdAt: serverTimestamp() });
        audit(b, me, { action: 'property.create', entity: `properties/${id}`, propertyId: id, reason: `Bulk upload (${n})` });
        made[n] = id;
      }
      await b.commit(); clearCache();
      this.properties = await loadProperties();
      for (const [n, id] of Object.entries(made)) this.sheetMap[n] = { pid: id, name: '', code: '' };
    },
    writeUnitOwner(b, r, made) {
      const d = r.data, pid = this.allMode ? this.pidFor(r.sheet) : this.propertyId, why = `Bulk upload (${this.allMode ? r.sheet : this.fileName})`;
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
      else if (r.linkOwner) b.set(doc(db, 'units', unitId), { ownerId: r.ownerId, updatedAt: serverTimestamp(), updatedBy: me.user.uid }, { merge: true });
      // Fee from the Owner List, for a unit with none yet. 2000-01 = applies to every month until a later version is added on Portfolio.
      if (r.terms) b.set(doc(db, 'units', unitId, 'terms', `2000-01_${Date.now()}`), { ...r.terms, otaOverrides: null, effectiveFrom: '2000-01',
        reason: why, createdBy: me.user.uid, createdByName: me.name, createdAt: serverTimestamp() });
      markFrom(b, pid, ALL_MONTHS, unitId);   // the unit's month summaries are worked out again (new unit, new owner or fee)
      const changes = [];
      if (r.linkOwner) changes.push({ field: 'ownerId', old: null, new: r.ownerId });
      if (r.terms) changes.push({ field: 'arrangement', old: null, new: r.terms.arrangement });
      audit(b, me, { action: r.newUnit ? 'unit.create' : 'unit.update', entity: `units/${unitId}`, propertyId: pid, changes, reason: why });
    }
  }
};
</script>

<style scoped>
    .bu-steps { margin: 0 0 16px; padding: 0; list-style: none; }
    .bu-kinds { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; margin-bottom: 16px; }
    .bu-kind { display: flex; align-items: center; gap: 14px; text-align: left; padding: 16px; border: 1.5px solid var(--border); border-radius: var(--radius); background: var(--surface); color: var(--text); cursor: pointer; }
    .bu-kind svg { width: 40px; height: 40px; padding: 9px; border-radius: 10px; background: var(--chip); fill: var(--text-2); flex: none; }
    .bu-kind b { display: block; font-size: 15px; }
    .bu-kind small { color: var(--muted); font-size: 12.5px; }
    .bu-kind:hover { border-color: var(--accent); }
    .bu-kind.on { border-color: var(--accent); background: var(--accent-soft); }
    .bu-kind.on svg { background: var(--accent); fill: #fff; }
    .bu-kind:disabled { opacity: .6; cursor: default; }
    .bu-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-bottom: 10px; }
    .bu-stat { padding: 12px 14px; border-radius: 10px; background: var(--chip); }
    .bu-stat b { display: block; font-size: 24px; line-height: 1.1; }
    .bu-stat span { font-size: 12.5px; color: var(--text-2); }
    .bu-stat.ok { background: var(--green-soft); } .bu-stat.ok b { color: var(--green); }
    .bu-stat.skip { background: var(--amber-soft); } .bu-stat.skip b { color: var(--amber); }
    .bu-stat.bad { background: var(--red-soft); } .bu-stat.bad b { color: var(--red); }
    .bu-note { margin: 0 0 12px; font-size: 13px; color: var(--text-2); }
    .card-head h2 { display: flex; align-items: center; gap: 10px; }
    .file-badge { font-size: 11px; font-weight: 700; padding: 3px 7px; border-radius: 6px; background: var(--accent-soft); color: var(--accent); }
    .bu-actions { position: sticky; bottom: 0; background: var(--surface); padding: 12px 0 0; border-top: 1px solid var(--line); }
    .prop-card { margin-bottom: 16px; }
    .prop-row { display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-end; }
    .prop-row .field { margin: 0; min-width: 0; flex: 1 1 220px; }
    .prop-row :deep(.op), .sheet-map :deep(.op) { display: block; }
    .prop-row :deep(.op-btn), .sheet-map :deep(.op-btn) { width: 100%; }
    .prop-row :deep(.op-val), .sheet-map :deep(.op-val) { max-width: none; }
    .prop-row .field.code { flex: 0 1 120px; }
    .sheet-map { margin-top: 12px; }
    .sheet-map .select, .sheet-map .input { min-width: 160px; }
    .sheet-map .code-in { min-width: 110px; width: 120px; }
    .counts { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
    .cols { margin-bottom: 12px; font-size: 13px; }
    .sheets { margin: 0 0 8px; }
    .cols summary { cursor: pointer; color: var(--text-2); }
    .cols .help { margin: 6px 0 0; word-break: break-word; }
    tr.dim td { color: var(--muted); }
    .fix-btn { margin-top: 6px; }
    .fix-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 16px; }
    .fix-grid :deep(.op), .fix-grid :deep(.op-btn) { display: block; width: 100%; }
    .actions { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 16px; }
</style>
