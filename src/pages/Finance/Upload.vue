<template>
  <main class="content">
    <div class="page-head">
      <div>
        <h1>Upload eZee report</h1>
        <div class="sub">Bring in the month's bookings from eZee, or a past month's completed Finance statement as reference</div>
      </div>
      <div class="head-tools">
        <OptionPicker v-model="propertyId" :options="propertyOptions" label="Property" @change="reset()" :disabled="working" />
        <MonthPicker :ahead="1" v-model="month" @change="reset()" :disabled="working" />
      </div>
    </div>

    <div class="notice error" v-show="error"><span>{{ error }}</span> <button class="link" style="margin-left:8px" v-show="suggestMonth" @click="month = suggestMonth; pick(lastFile)">{{ suggestMonth ? `Use ${monthName(suggestMonth)} instead` : '' }}</button></div>

    <!-- Drop zone -->
    <label class="dropzone" :class="{ over: dragging }" v-show="stage === 0"
           @dragover.prevent="dragging = true" @dragleave.prevent="dragging = false" @drop.prevent="dragging = false; pick($event.dataTransfer.files[0])">
      <svg class="dz-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4l7 7h-4.5v6h-5v-6H5z"/></svg>
      <b>Drag the eZee report or a completed Finance statement here, or</b>
      <span class="btn">Choose file</span>
      <small>.csv or .xlsx · the full eZee report, or Finance's Rental Income Statement for a past month · the page tells which it is</small>
      <input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden @change="pick($event.target.files[0]); $event.target.value = ''">
    </label>

    <!-- Reading / check / saving -->
    <section class="card read-card" v-show="stage > 0">
      <div class="card-head"><h2>{{ saving ? 'Saving to the PMS' : (stage < 4 ? 'Reading your file' : (done ? 'Upload complete' : 'Ready to check')) }}</h2></div>
      <div class="file-line">
        <span class="file-badge">{{ fileKind }}</span>
        <div><b>{{ fileName }}</b><div class="help">{{ `${fileSize} · uploaded just now` }}</div></div>
        <span class="file-pct">{{ `${percent}%` }}</span>
      </div>
      <div class="progress big"><div :style="`width:${percent}%`"></div></div>
      <div class="stages">
        <template v-for="(s, i) in stages" :key="i">
          <div class="stage" :class="{ done: stage > i + 1 || (i === 3 && stage === 4), now: stage === i + 1 && i < 3 }">
            <span class="stage-dot"></span>
            <div><b>{{ `${i + 1}. ${s.title}` }}</b><div>{{ s.note }}</div></div>
          </div>
        </template>
      </div>
      <p class="help" v-show="stage < 4 || saving">Please keep this page open. This usually takes under a minute.</p>

      <!-- Multi-Properties-->
      <template v-if="stage === 4 && auto && !done">
        <div>
          <div class="notice" style="margin-top:0">{{ `This file has ${auto.groups.length} building${auto.groups.length === 1 ? '' : 's'}. Check where each one goes, then press Check.` }}</div>
          <div class="table-wrap" :style="checks.length ? null : { minHeight: Math.min(360, 150 + targetOptions(auto.groups[0]).length * 38) + 'px' }">
            <table class="table">
              <thead><tr><th>Building in the file</th><th class="num">Bookings</th><th class="num">Units</th><th>Goes to</th><th v-show="checks.length">Result</th></tr></thead>
              <tbody>
                <template v-for="(g, gi) in auto.groups" :key="g.code">
                  <tr>
                    <td><b>{{ g.building }}</b><div class="help">{{ g.code }}</div></td>
                    <td class="num">{{ g.bookings }}</td><td class="num">{{ g.units }}</td>
                    <td>
                      <OptionPicker v-model="g.target" :options="targetOptions(g)" :label="`Property for ${g.building}`" :disabled="working || !!checks.length" />
                      <input class="input" style="height:34px;margin-top:6px;max-width:260px" v-show="g.target === '__new'" v-model="g.newName" :disabled="!!checks.length" placeholder="New property name" :aria-label="`Name for ${g.building}`">
                    </td>
                    <td v-show="checks.length"><span v-if="checks[gi]" class="r wrap">{{ checks[gi].note }}</span></td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
          <div class="rows" style="margin-top:12px" v-show="auto.noRoom || auto.otherMonths.length">
            <div class="row" v-show="auto.noRoom"><span class="neg-amt">No room in the row (saved as cancelled, not sorted)</span><span class="r wrap">{{ auto.noRoom }}</span></div>
            <div class="row" v-show="auto.otherMonths.length"><span>Other months in the file (left out)</span><span class="r wrap">{{ auto.otherMonths.map(m => `${shortName(m.month)} (${m.count})`).join(', ') }}</span></div>
          </div>
          <div v-if="checks.length">
            <h3 class="prev-h">{{ `Preview: ${previewRows.length} rows to be saved` }}</h3>
            <Paged :items="previewRows" v-slot="{ pageRows }">
              <div class="table-wrap">
                <table class="table">
                  <thead><tr><th>Property</th><th>Unit</th><th>Reservation</th><th>Source</th><th>Check-in</th><th>Check-out</th><th class="num">Nights</th><th class="num">Total (RM)</th><th>Result</th></tr></thead>
                  <tbody>
                    <template v-for="r in pageRows" :key="r.key">
                      <tr>
                        <td>{{ r.property }}</td><td>{{ r.unit || '—' }}</td><td>{{ r.reservationNo }}</td><td>{{ r.source }}</td>
                        <td>{{ dmy(r.arrival) }}</td><td>{{ dmy(r.departure) }}</td><td class="num">{{ r.nights }}</td><td class="num">{{ amt(r.total) }}</td>
                        <td><span class="pill" :class="r.cancelled ? 'grey' : (r.isNew ? 'green' : 'blue')">{{ r.cancelled ? 'Cancelled' : (r.isNew ? 'New' : 'Update') }}</span></td>
                      </tr>
                    </template>
                  </tbody>
                </table>
              </div>
            </Paged>
          </div>
          <div class="actions" style="margin-top:16px">
            <button class="btn btn-primary" v-show="!checks.length" @click="checkAuto()" :disabled="working || auto.groups.some(g => g.target === '__new' && !g.newName.trim())">Check</button>
            <button class="btn btn-primary" v-show="checks.length" @click="saveAll()" :disabled="working || !checks.some(c => c.check && c.check.records.length)">{{ `Save ${checks.filter(c => c.check && c.check.records.length).length} properties to the PMS` }}</button>
            <button class="btn" v-show="checks.length" @click="checks = []" :disabled="working">Change where they go</button>
            <button class="btn" @click="reset()">Cancel</button>
          </div>
        </div>
      </template>

      <!-- Check summary -->
      <template v-if="stage === 4 && check && !done && check.kind === 'ezee'">
        <div>
          <div class="summary-grid">
            <div><b>{{ check.active }}</b><span>{{ `bookings checking out in ${shortName(month)}` }}</span></div>
            <div><b>{{ check.newCount }}</b><span>new to the PMS</span></div>
            <div><b>{{ check.active - check.newCount }}</b><span>already in the PMS (updated)</span></div>
            <div><b>{{ check.cancelled }}</b><span>cancelled (no room number)</span></div>
            <div><b>{{ check.ctrip }}</b><span>Ctrip needing an amount</span></div>
          </div>
          <div class="rows">
            <template v-if="check.property.isNew">
              <div class="row"><span>{{ `New property: rooms starting with ${check.property.code}` }}</span>
                <span class="name-cell"><input class="input" style="height:34px;width:220px" v-model="check.property.name" placeholder="Property name, e.g. D'Majestic"></span></div>
            </template>
            <div class="row" v-show="check.newUnits.length"><span>New units (added as "not set up")</span><span class="r wrap">{{ check.newUnits.join(', ') }}</span></div>
            <div class="row" v-show="check.lockedUnits.length"><span>Completed units (left out)</span><span class="r wrap">{{ check.lockedUnits.join(', ') }}</span></div>
            <div class="row" v-show="check.otherMonths.length"><span>Other months in the file (left out)</span>
              <span class="r wrap">{{ check.otherMonths.map(m => `${shortName(m.month)} (${m.count})`).join(', ') }}</span></div>
            <div class="row" v-show="check.noUnit.length"><span class="neg-amt">Room name not recognised (saved as cancelled)</span><span class="r wrap">{{ check.noUnit.join(', ') }}</span></div>
          </div>
          <div v-if="check.records.length">
            <h3 class="prev-h">{{ `Preview: ${previewRows.length} rows to be saved` }}</h3>
            <Paged :items="previewRows" v-slot="{ pageRows }">
              <div class="table-wrap">
                <table class="table">
                  <thead><tr><th>Property</th><th>Unit</th><th>Reservation</th><th>Source</th><th>Check-in</th><th>Check-out</th><th class="num">Nights</th><th class="num">Total (RM)</th><th>Result</th></tr></thead>
                  <tbody>
                    <template v-for="r in pageRows" :key="r.key">
                      <tr>
                        <td>{{ r.property }}</td><td>{{ r.unit || '—' }}</td><td>{{ r.reservationNo }}</td><td>{{ r.source }}</td>
                        <td>{{ dmy(r.arrival) }}</td><td>{{ dmy(r.departure) }}</td><td class="num">{{ r.nights }}</td><td class="num">{{ amt(r.total) }}</td>
                        <td><span class="pill" :class="r.cancelled ? 'grey' : (r.isNew ? 'green' : 'blue')">{{ r.cancelled ? 'Cancelled' : (r.isNew ? 'New' : 'Update') }}</span></td>
                      </tr>
                    </template>
                  </tbody>
                </table>
              </div>
            </Paged>
          </div>
          <div class="actions" style="margin-top:16px">
            <button class="btn btn-primary" @click="save()" :disabled="working || !check.records.length || (check.property.isNew && !check.property.name.trim())">Save to the PMS</button>
            <button class="btn" @click="reset()">Cancel</button>
          </div>
        </div>
      </template>

      <!-- Check summary: Finance's completed statement (kept as reference, no bookings change) -->
      <template v-if="stage === 4 && check && !done && check.kind === 'statement'">
        <div>
          <div class="notice" style="margin-top:0">Finance's completed statement for <b>{{ monthName(check.month) }}</b>. It is kept as reference: what each owner was paid, that month's daily rental bookings with Finance's amount for each, the payout history, and negative balances to carry into <span>{{ monthName(check.next) }}</span>.</div>
          <div class="summary-grid">
            <div><b>{{ check.units.length }}</b><span>units on Payment To Owner</span></div>
            <div><b>{{ amt(check.balToPay) }}</b><span>paid to owners (RM)</span></div>
            <div><b>{{ check.negatives.length }}</b><span>{{ `negative, carried into ${shortName(check.next)}` }}</span></div>
            <div><b>{{ check.historyCount }}</b><span>past months from the unit sheets</span></div>
            <div><b>{{ check.bookings ? check.bookings.active : 0 }}</b><span>daily rental bookings (from the eZee sheet)</span></div>
            <div><b>{{ check.replacing }}</b><span>months already imported (replaced)</span></div>
          </div>
          <div class="rows">
            <template v-if="check.property.isNew">
              <div class="row"><span>{{ `New property: units starting with ${check.property.code}` }}</span>
                <span class="name-cell"><input class="input" style="height:34px;width:220px" v-model="check.property.name" placeholder="Property name, e.g. D'Majestic"></span></div>
            </template>
            <div class="row" v-show="check.negatives.length"><span>Brought forward into <span>{{ shortName(check.next) }}</span></span>
              <span class="r wrap">{{ check.negatives.map(u => `${u.unitCode} RM ${amt(-u.payout)}`).join(', ') }}</span></div>
            <div class="row" v-show="check.nextCompleted.length"><span class="neg-amt">Not carried forward</span><span class="r wrap">{{ `${check.nextCompleted.join(', ')}: already completed for ${monthName(check.next)} in the PMS.` }}</span></div>
            <div class="row" v-show="check.lockedUnits.length"><span>Completed in the PMS (kept as is)</span><span class="r wrap">{{ check.lockedUnits.join(', ') }}</span></div>
            <div class="row" v-show="check.bookings"><span>Bookings with Finance's amount (from the unit sheets)</span>
              <span class="r wrap">{{ check.bookings ? `${check.bookings.matched} of ${check.bookings.active} matched; the rest are fixed-rent or long-term units` : '' }}</span></div>
            <div class="row" v-show="check.bookings?.ctripFinal"><span>Ctrip amounts taken as final</span><span class="r wrap">{{ `${check.bookings?.ctripFinal} Ctrip bookings use Finance's amount; nothing to type on Month-end` }}</span></div>
            <div class="row" v-show="!check.bookings"><span class="neg-amt">Daily rental</span><span class="r wrap">No eZee sheet found in this file, so only the payouts are kept.</span></div>
            <div class="row" v-show="check.termChanges.length"><span>{{ `Unit settings from ${shortName(check.month)} (applied from that month)` }}</span>
              <span class="r wrap">{{ check.termChanges.map(t => t.label).join(', ') }}</span></div>
            <div class="row" v-show="!check.termChanges.length"><span>Unit settings</span><span class="r wrap">Already match this file</span></div>
            <div class="row" v-show="check.historyMonths.length"><span>Payout history found</span><span class="r wrap">{{ check.historyMonths.map(shortName).join(', ') }}</span></div>
            <div class="row" v-show="check.newUnits.length"><span>New units (added as "not set up")</span><span class="r wrap">{{ check.newUnits.join(', ') }}</span></div>
            <template v-for="w in check.warnings" :key="w"><div class="row"><span class="neg-amt">Check</span><span class="r wrap">{{ w }}</span></div></template>
          </div>
          <div class="actions" style="margin-top:16px">
            <button class="btn btn-primary" @click="saveStatement()" :disabled="working || (check.property.isNew && !check.property.name.trim())">Save as reference</button>
            <button class="btn" @click="reset()">Cancel</button>
          </div>
        </div>
      </template>

      <template v-if="done">
        <div>
          <div class="notice ok">{{ done }}</div>
          <div class="actions">
            <RouterLink class="btn btn-primary" :to="{ path: '/Finance/month-end', query: { property: propertyId, month } }">{{ `Open Month-end payout · ${shortName(month)}` }}</RouterLink>
            <RouterLink class="btn" :to="{ path: '/Portfolio/properties', query: { property: propertyId } }" v-show="newUnitsSaved">Set up the new units</RouterLink>
            <button class="btn" @click="reset()">Upload another file</button>
          </div>
        </div>
      </template>
    </section>

    <!-- Switched to fit the file -->
    <div class="modal-back" v-if="switched.length" @click.self="switched = []" v-esc="() => { switched = [] }">
      <div class="modal" role="dialog" aria-modal="true" aria-label="Changed to fit the file" style="max-width:480px">
        <h2>Changed to fit your file</h2>
        <p class="help" style="margin:0 0 12px">The file did not match what was selected, so the page switched for you.</p>
        <div class="rows">
          <template v-for="c in switched" :key="c.what"><div class="row"><span>{{ c.what }}</span><span class="r wrap">{{ `${c.from} → ${c.to}` }}</span></div></template>
        </div>
        <div class="modal-foot"><button class="btn btn-primary" @click="switched = []">OK</button></div>
      </div>
    </div>

    <!-- Previous uploads -->
    <section class="card" style="margin-top:20px">
      <div class="card-head"><h2>Previous uploads</h2></div>
      <Paged :items="history" v-slot="{ pageRows }">
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Uploaded</th><th>File</th><th>Month</th><th class="num">Bookings / units</th><th>By</th><th style="text-align:right">Result</th></tr></thead>
          <tbody>
            <template v-for="h in pageRows" :key="h.id">
              <tr>
                <td>{{ stamp(h.uploadedAt) }}</td>
                <td><span>{{ h.fileName }}</span><div class="help">{{ h.kind === 'financeStatement' ? 'Finance statement (reference)' : 'eZee report' }}</div></td>
                <td>{{ (h.months || []).map(shortName).join(', ') }}</td>
                <td class="num">{{ h.kind === 'financeStatement' ? `${h.counts?.bookings ?? 0} / ${h.counts?.units ?? ''} units` : (h.counts?.bookings ?? '') }}</td>
                <td>{{ h.uploadedByName || '' }}</td>
                <td style="text-align:right"><span class="pill" :class="h.result === 'ok' ? 'green' : 'red'">{{ h.result === 'ok' ? 'Completed' : 'Refused' }}</span></td>
              </tr>
            </template>
            <tr v-show="!history.length"><td colspan="6" class="muted">No uploads yet for this property.</td></tr>
          </tbody>
        </table>
      </div>
      </Paged>
    </section>
  </main>
</template>

<script>
import { collection, doc, getDocs, query, where, writeBatch, serverTimestamp }
  from 'firebase/firestore';
import { db } from '@/lib/firebase.js';
import { clearCache } from '@/lib/cache.js';
import { parseCSV, readEzee, bookingPTO, effectiveRates, DEFAULT_OTA, DM_STARTER, ARRANGEMENTS, unitIdOf, byUnit, r2, nextMonth } from '@/lib/engine.js';
import { parseFinanceStatement, sheetText, rowHash } from '@/lib/finance-import.js';
import { markDirty, markFrom } from '@/lib/summary-data.js';
import { ALL_MONTHS } from '@/lib/summaries.js';
import { loadProperties, loadUnits, loadSetup, latestVersion, monthDoc, completedUnitIds, audit, friendlyError, download, toCSV, loadXlsxLib } from '@/lib/finance-data.js';
import { monthName, monthOffset, stamp, dayOffset, amt, dmy } from '@/lib/format.js';
import { useSession } from '@/stores/session.js';
import { lastProperty, rememberProperty } from '@/lib/last-property.js';

const me = useSession();

const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
const pause = ms => new Promise(r => setTimeout(r, ms));
const CHUNK = 120;   // bookings per batch: 2 writes each, plus up to 2 summary marks each, under Firestore's 500 limit
let params = new URLSearchParams(location.search);
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortName = ym => { const [y, m] = ym.split('-'); return `${SHORT[+m - 1]} ${y}`; };

// Reads a .csv or .xlsx. Finance's completed Rental Income Statement has a "Payment To Owner" sheet;
// anything else is treated as the eZee report (rows of text cells from the first sheet).
async function readFile(file) {
  if (/\.csv$/i.test(file.name)) return { kind: 'ezee', rows: parseCSV(await file.text()) };
  const X = await loadXlsxLib();
  const wb = X.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  if (wb.SheetNames.some(n => /^payment to owner$/i.test(n.trim()))) return { kind: 'statement', statement: parseFinanceStatement(X, wb) };
  const ws = wb.Sheets[wb.SheetNames[0]];
  return { kind: 'ezee', rows: sheetText(X, ws) };
}

import OptionPicker from '@/components/OptionPicker.vue';
import MonthPicker from '@/components/MonthPicker.vue';
export default {
  components: { OptionPicker, MonthPicker },
  beforeCreate() { params = new URLSearchParams(location.search); },
  data() {
    return {
      monthName, shortName, stamp, amt, dmy,
      properties: [], propertyId: params.get('property') || lastProperty(), month: params.get('month') || monthOffset(-1),
      months: Array.from({ length: 13 }, (_, i) => monthOffset(1 - i)),
      dragging: false, working: false, saving: false, error: '', suggestMonth: '',
      stage: 0, percent: 0, stages: [], fileName: '', fileSize: '', fileKind: '', lastFile: null,
      check: null, auto: null, checks: [], switched: [], done: '', newUnitsSaved: false, history: []
    };
  },
  // Remember the property for the next page (see lib/last-property.js)
  watch: { propertyId(v) { if (v !== '__auto') rememberProperty(v); } },
  async mounted() {
    try {
      this.properties = await loadProperties();
      if (!this.properties.some(p => p.id === this.propertyId)) this.propertyId = this.properties[0]?.id || '__new';
      await this.loadHistory();
    } catch (e) { this.error = friendlyError(e, 'load the page'); }
  },
  computed: {
    previewRows() { return this.previewRowsFn(); },
    propertyOptions() { return [{ value: '__auto', label: 'Multi-Property' }, ...this.properties.map(p => ({ value: p.id, label: p.name })), ...(this.properties.length ? [] : [{ value: '__new', label: 'New property (from the file)' }])]; }
  },
  methods: {
    property() { return this.properties.find(p => p.id === this.propertyId) || null; },
    async loadHistory() {
      if (this.propertyId === '__new' || this.propertyId === '__auto') { this.history = []; return; }
      const snap = await getDocs(query(collection(db, 'importBatches'), where('propertyIds', 'array-contains', this.propertyId)));
      this.history = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.uploadedAt?.toMillis?.() || 0) - (a.uploadedAt?.toMillis?.() || 0)).slice(0, 10);
    },
    freshStages() {
      return [{ title: 'Reading document', note: 'Opening the file' }, { title: 'Extracting numbers', note: 'Bookings, amounts, SST and OTA cuts' },
        { title: 'Sorting', note: 'By unit, then check-out date' }, { title: 'Finished', note: 'Ready to check' }];
    },
    reset() {
      Object.assign(this, { stage: 0, percent: 0, check: null, auto: null, checks: [], switched: [], done: '', error: '', suggestMonth: '', saving: false, newUnitsSaved: false });
      this.loadHistory().catch(() => {});
    },

    async pick(file) {
      if (!file || this.working) return;
      this.reset();
      if (!/\.(csv|xlsx)$/i.test(file.name)) { this.error = 'Choose the eZee report or Finance statement as .csv or .xlsx.'; return; }
      this.lastFile = file;
      this.fileName = file.name; this.fileKind = /\.xlsx$/i.test(file.name) ? 'XLSX' : 'CSV';
      this.fileSize = file.size > 1048576 ? `${(file.size / 1048576).toFixed(1)} MB` : `${Math.ceil(file.size / 1024)} KB`;
      this.stages = this.freshStages(); this.working = true;
      try {
        // 1. Reading document
        this.stage = 1; this.percent = 8;
        const read = await readFile(file);
        if (read.kind === 'statement') { await this.readStatement(read.statement); this.working = false; return; }
        const parsed = readEzee(read.rows);
        this.stages[0].note = `Opened the file, ${parsed.header.length} columns found`;
        this.percent = 30; await pause(250);
        const changes = [];
        if (this.propertyId === '__auto') {
          // Multi-Property picked but the file has one building we know: go straight to that property
          const fileCodes = [...new Set(parsed.records.map(r => r.propertyCode).filter(Boolean))];
          const nk = v => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          const hit = fileCodes.length === 1 ? this.properties.find(p => nk(p.code) === nk(fileCodes[0])) : null;
          if (hit) { changes.push({ what: 'Property', from: 'Multi-Properties', to: hit.name }); this.propertyId = hit.id; }
          else { await this.startAuto(parsed, changes); this.working = false; return; }
        }
        // 2. Extracting numbers
        this.stage = 2;
        let prop = this.property();
        const codes = {}; parsed.records.forEach(r => { if (r.propertyCode) codes[r.propertyCode] = (codes[r.propertyCode] || 0) + 1; });
        let code = prop ? prop.code : Object.keys(codes).sort((a, b) => codes[b] - codes[a])[0];
        if (prop && (!codes[prop.code] || Object.keys(codes).length > 1)) {   // not this property's file, or a file with several buildings
          // Not this property's file: switch to sorting by building instead of refusing
          if (!Object.keys(codes).length) throw new Error(`This file has no ${prop.name} rooms (rooms starting with ${prop.code}) and no recognisable rooms. Pick the right property.`);
          // One building in the file that we already know: go straight to that property
          const only = Object.keys(codes).length === 1 ? this.properties.find(p => String(p.code).toUpperCase() === Object.keys(codes)[0].toUpperCase()) : null;
          if (only) {
            changes.push({ what: 'Property', from: prop.name, to: only.name });
            this.propertyId = only.id; prop = only; code = only.code;
          } else {
            changes.push({ what: 'Property', from: prop.name, to: 'Multi-Properties' });
            this.propertyId = '__auto';
            await this.startAuto(parsed, changes); this.working = false; return;
          }
        }
        const mine = parsed.records.filter(r => !r.propertyCode || r.propertyCode === code);
        let inMonth = mine.filter(r => r.departureMonth === this.month);
        const byMonth = {}; mine.forEach(r => { if (r.departureMonth) byMonth[r.departureMonth] = (byMonth[r.departureMonth] || 0) + 1; });
        if (!inMonth.length) {
          const top = Object.keys(byMonth).sort((a, b) => byMonth[b] - byMonth[a])[0];
          if (top && this.months.includes(top)) {
            changes.push({ what: 'Month', from: monthName(this.month), to: monthName(top) });
            this.month = top; inMonth = mine.filter(r => r.departureMonth === this.month);
          }
        }
        if (!inMonth.length) {
          const best = Object.keys(byMonth).sort((a, b) => byMonth[b] - byMonth[a])[0];
          this.suggestMonth = best && this.months.includes(best) ? best : '';
          throw new Error(`No checkouts in ${monthName(this.month)} in this file.` + (best ? ` It has ${monthName(best)} (${byMonth[best]} bookings).` : ''));
        }
        if (prop && (await monthDoc(prop.id, this.month)).status === 'completed')
          throw new Error(`${monthName(this.month)} is completed for ${prop.name}, so it can't be uploaded again. A Director can reopen a unit on Month-end payout.`);
        this.stages[1].note = `${inMonth.filter(r => r.status === 'active').length} bookings, amounts, SST and OTA cuts`;
        this.percent = 55; await pause(250);
        // 3. Sorting: match units, mark new vs already saved
        this.stage = 3;
        this.check = await this.buildCheck(inMonth, code, byMonth);
        if (!this.check.records.length && this.check.lockedUnits.length)
          throw new Error(`Every unit in this file is completed for ${monthName(this.month)}, so nothing can be uploaded. A Director can reopen a unit on Month-end payout.`);
        this.percent = 85; await pause(250);
        // 4. Finished
        this.stage = 4; this.percent = 100;
        this.switched = changes;
      } catch (e) {
        this.error = e.code ? friendlyError(e, 'read the file') : e.message;
        this.stage = 0;
      }
      this.working = false;
    },

    async buildCheck(recs, code, byMonth, over) {
      const prop = over ? over.prop : this.property();
      const property = prop ? { code, id: prop.id, name: prop.name, isNew: false }
        : over ? { code, id: slug(over.newName), name: over.newName.trim(), isNew: true }
        : { code, id: slug(code === 'DM' ? "D'Majestic" : code), name: code === 'DM' ? "D'Majestic" : '', isNew: true };
      const units = prop ? await loadUnits(prop.id) : [];
      const nk = t => String(t || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const unitFor = unitCode => {
        // Sorting by building: an existing unit may be saved as "N-27-12" or "Novo N-27-12", so the code without the building prefix is tried too
        const bare = over ? nk(unitCode.slice(code.length)) : null;
        const u = units.find(u => u.unitCode === unitCode || (u.aliases || []).includes(unitCode) || (over && (nk(u.unitCode) === nk(unitCode) || nk(u.unitCode) === bare || nk(u.unitCode).endsWith(nk(code) + bare))));
        if (u) return u.unitCode;
        if (code === 'DM') for (const [main, al] of Object.entries(DM_STARTER.aliases)) if (al.includes(unitCode)) return main;
        return unitCode;
      };
      const existing = new Set(), savedUnit = {}, savedHash = {};
      // This read was already here; it also brings each saved booking's rawHash, so unchanged rows can be skipped
      if (prop) (await getDocs(query(collection(db, 'bookings'), where('propertyId', '==', prop.id), where('departureMonth', '==', this.month)))).docs.forEach(d => { existing.add(d.id); savedUnit[d.id] = d.data().unitId; savedHash[d.id] = d.data().rawHash || null; });
      const noUnit = [];
      // A multi-room reservation is several eZee rows with ONE reservation number but different folio numbers. Each row is its
      // own booking: its document is "<reservation>-<folio>" (a single-room booking keeps the plain reservation number).
      const perRes = {};
      recs.forEach(r => { perRes[r.reservationNo] = (perRes[r.reservationNo] || 0) + 1; });
      for (const r of recs) r.docId = perRes[r.reservationNo] > 1 && r.folioNo ? `${r.reservationNo}-${r.folioNo}` : r.reservationNo;
      for (const r of recs) {
        r.propertyId = property.id;
        if (r.unitCode) { r.unitCode = unitFor(r.unitCode); r.unitId = unitIdOf(property.id, r.unitCode); }
        else { r.unitId = null; if (r.roomRaw) noUnit.push(r.reservationNo); }
        r.isNew = !existing.has(r.docId);
      }
      // Completion is per unit: bookings of a unit whose statement is completed for the month are left out,
      // and so is a booking already saved on a completed unit (a room move must not take it off that statement)
      const done = prop ? await completedUnitIds(prop.id, this.month) : new Set();
      const locked = r => (r.unitId && done.has(r.unitId)) || done.has(savedUnit[r.docId]);
      const lockedUnits = [...new Set(recs.filter(r => r.unitId && done.has(r.unitId)).map(r => r.unitCode))].sort(byUnit);
      recs = recs.filter(r => !locked(r));
      recs.sort((a, b) => byUnit(a.unitCode || '', b.unitCode || '') || (a.departure || '').localeCompare(b.departure || ''));
      const known = new Set(units.map(u => u.id));
      const newUnitRecs = [...new Map(recs.filter(r => r.unitId && r.status === 'active' && !known.has(r.unitId)).map(r => [r.unitId, r])).values()];
      const active = recs.filter(r => r.status === 'active');
      return {
        kind: 'ezee', property, records: recs, noUnit, active: active.length, lockedUnits, savedUnit, savedHash, month: this.month,
        newCount: active.filter(r => r.isNew).length,
        cancelled: recs.length - active.length,
        ctrip: active.filter(r => r.otaKey === 'ctrip').length,
        newUnits: newUnitRecs.map(r => r.unitCode).sort(byUnit), newUnitRecs,
        otherMonths: Object.entries(byMonth).filter(([m]) => m !== this.month).sort().map(([month, count]) => ({ month, count }))
      };
    },

    // Bookings: raw row kept as uploaded; names go to private/main (IT never sees them).
    // A booking whose rawHash matches the saved one is not written again (and its unit's summary stays as it is);
    // every booking that is written marks its unit's month summary stale in the same batch (and the unit it moved from).
    async saveBookings(list, batchRef, from, to, check) {
      const month = check.month, pid = check.property.id;
      const tally = { created: 0, changed: 0, unchanged: 0, writes: 0 };
      const retired = new Set();
      let rows = list.map(r => {
        const { private: priv, propertyCode, isNew, ...data } = r;
        return { r, priv, data, isNew, hash: rowHash(data, priv) };
      });
      // Rows of one document (a plain reservation number) are fingerprinted together; multi-room rows have a document each.
      const groups = new Map();
      for (const x of rows) { const k = x.r.docId; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x.hash); }
      rows = rows.map(x => {
        const hs = groups.get(x.r.docId);
        const hash = hs.length === 1 ? x.hash : rowHash({ rows: hs }, null);
        return { ...x, hash, same: !x.isNew && check.savedHash?.[x.r.docId] === hash };
      });
      // A booking new to this month may be saved under another month (its check-out moved): that month's summary is stale too.
      // Only the new ones are looked up, 30 at a time (a missing one costs nothing; at least one read per lookup).
      const moved = {};
      const fresh = [...new Set(rows.filter(x => x.isNew).map(x => x.r.reservationNo))];
      for (let i = 0; i < fresh.length; i += 30) {
        const snap = await getDocs(query(collection(db, 'bookings'), where('reservationNo', 'in', fresh.slice(i, i + 30))));
        snap.docs.forEach(d => { const o = d.data(); if (o.departureMonth && (o.departureMonth !== month || o.propertyId !== pid)) moved[d.id] = o; });
      }
      for (const x of rows) if (x.r.status === 'active') tally[x.isNew ? 'created' : x.same ? 'unchanged' : 'changed']++;
      const write = rows.filter(x => !x.same);
      for (let i = 0; i < write.length; i += CHUNK) {
        const b = writeBatch(db);
        const dirty = new Map();   // "propertyId|month" -> unit ids
        const touch = (p, m, u) => { const k = `${p}|${m}`; if (!dirty.has(k)) dirty.set(k, []); dirty.get(k).push(u); };
        for (const { r, priv, data, isNew, hash } of write.slice(i, i + CHUNK)) {
          data.importBatchId = batchRef.id; data.lastImportedAt = serverTimestamp(); data.rawHash = hash;
          if (isNew) data.firstImportedAt = serverTimestamp();
          b.set(doc(db, 'bookings', r.docId), data, { merge: true });
          b.set(doc(db, 'bookings', r.docId, 'private', 'main'), priv, { merge: true });
          // The same reservation saved earlier as ONE document (before rows were kept apart): retire it so it is not counted twice
          if (r.docId !== r.reservationNo && check.savedUnit && r.reservationNo in check.savedUnit && !retired.has(r.reservationNo)) {
            retired.add(r.reservationNo);
            b.set(doc(db, 'bookings', r.reservationNo), { status: 'cancelled', supersededBy: 'split rows', lastImportedAt: serverTimestamp() }, { merge: true });
            touch(pid, month, check.savedUnit[r.reservationNo] || null);
          }
          touch(pid, month, r.unitId || null);
          if (!isNew && check.savedUnit?.[r.docId] !== r.unitId) touch(pid, month, check.savedUnit[r.docId] || null);   // room move
          const o = moved[r.docId];
          if (o) touch(o.propertyId, o.departureMonth, o.unitId || null);
        }
        for (const [k, ids] of dirty) { const [p, m] = k.split('|'); markDirty(b, p, m, ids); }
        await b.commit();
        tally.writes += 2 * Math.min(CHUNK, write.length - i);
        this.percent = Math.round(from + (to - from) * Math.min(1, (i + CHUNK) / write.length));
      }
      return tally;
    },

    // ---- Finance's completed statement for a past month (reference only) ----
    async readStatement(st) {
      this.stages[0].note = `Finance's completed statement for ${monthName(st.month)}`;
      this.percent = 30; await pause(250);
      this.stage = 2;
      let prop = this.property();
      // The statement's "Property" cell can be a code (DM) or a name (Windmill); unit codes ("WM B1906") carry the code too
      const nk = v => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const unitPrefix = (st.units[0]?.unitCode || '').split(' ')[0];
      const isIt = p => [p.code, p.name, p.ezeeName].some(v => nk(v) && nk(v) === nk(st.propertyCode)) || (unitPrefix && nk(p.code) === nk(unitPrefix));
      if (prop && st.propertyCode && !isIt(prop)) {
        const other = this.properties.find(isIt);
        if (!other) throw new Error(`This statement is for property ${st.propertyCode}, not ${prop.name}. Pick the right property.`);
        this.propertyId = other.id; prop = other;
      }
      if (this.month !== st.month) { if (!this.months.includes(st.month)) this.months.push(st.month); this.month = st.month; }
      if (prop && (await monthDoc(prop.id, st.month)).status === 'completed')
        throw new Error(`${monthName(st.month)} is already completed in the PMS for ${prop.name}. Its own statements are the record, so this file isn't needed.`);
      this.stages[1].note = `${st.units.length} units, payouts and negative balances`;
      this.percent = 55; await pause(250);
      this.stage = 3;
      const code = prop?.code || st.propertyCode || 'DM';
      const property = prop ? { code: prop.code, id: prop.id, name: prop.name, isNew: false }
        : { code, id: slug(code === 'DM' ? "D'Majestic" : code), name: code === 'DM' ? "D'Majestic" : '', isNew: true };
      const units = prop ? await loadUnits(prop.id) : [];
      const bare = c => c.replace(/^[A-Z]{2,4} (?=[A-Z]\d)/, '');   // "WM B1906" is "B1906" in the Portfolio
      const unitFor = c => units.find(u => u.unitCode === c || (u.aliases || []).includes(c) || u.unitCode === bare(c))?.unitCode || c;
      const existing = {};
      if (prop) (await getDocs(query(collection(db, 'payoutHistory'), where('propertyId', '==', prop.id)))).docs.forEach(d => existing[d.id] = d.data());
      // Month rows: this month from Payment To Owner; earlier months from each unit sheet's Monthly Payout Summary.
      // Priority when the same unit and month comes twice: PMS statement > Payment To Owner > a unit sheet's summary.
      const rank = { pms: 3, finance: 2, summary: 1 };
      const docs = new Map();
      const put = (unitCode, month, data) => {
        const unitId = unitIdOf(property.id, unitCode), id = `${unitId}_${month}`;
        const old = existing[id], have = docs.get(id);
        if (old && rank[old.source] > rank[data.source]) return;
        if (have && rank[have.source] >= rank[data.source]) return;
        docs.set(id, { id, propertyId: property.id, unitId, unitCode, month, year: month.slice(0, 4), ...data });
      };
      for (const u of st.units) put(unitFor(u.unitCode), st.month, { source: 'finance', totalIncome: u.totalIncome, charges: u.charges, payout: u.payout, fixed: u.fixed, remark: u.remark || '' });
      for (const s of st.summaries) for (const [m, v] of Object.entries(s.values))
        if (m !== st.month) put(unitFor(s.unitCode), m, { source: 'summary', totalIncome: null, charges: null, payout: v, fixed: null, remark: '' });
      const next = nextMonth(st.month);
      // Completion is per unit: units completed in the PMS for this month keep their own statement (and their own
      // brought-forward line); a negative balance can't carry into a unit already completed for the next month.
      const [thisDone, nextDone] = prop ? await Promise.all([completedUnitIds(prop.id, st.month), completedUnitIds(prop.id, next)]) : [new Set(), new Set()];
      const idOf = c => unitIdOf(property.id, c);
      const known = new Set(units.map(u => u.unitCode));
      const allCodes = [...new Set([...docs.values()].map(d => d.unitCode))];
      const historyMonths = [...new Set([...docs.values()].filter(d => d.source === 'summary').map(d => d.month))].sort();
      this.stages[2].note = historyMonths.length ? `Payout history ${shortName(historyMonths[0])} to ${shortName(st.month)}` : 'By unit';
      this.percent = 85; await pause(250);
      const mine = st.units.map(u => ({ ...u, unitCode: unitFor(u.unitCode) }));
      // Unit settings for this month, read from the file: fixed rent from FIXED RENT / Payment To Owner,
      // profit share or long-term from the fee labels on each unit sheet ("Service Fees (20%)", "Utilities (20%)", "SST (8%)")
      const fromFile = new Map();
      for (const u of mine.filter(u => u.fixed && u.totalIncome > 0)) fromFile.set(u.unitCode, { arrangement: 'fixedRent', fixedRentAmount: r2(u.totalIncome), serviceFeePct: null, utilityFeePct: null, sstOnFeePct: null });
      for (const sm of st.summaries) {
        const code2 = unitFor(sm.unitCode);
        if (!sm.terms || fromFile.has(code2)) continue;
        const d = ARRANGEMENTS[sm.terms.arrangement], own = k => (Math.abs(sm.terms[k] - d[k]) < 1e-9 ? null : sm.terms[k]);
        fromFile.set(code2, { arrangement: sm.terms.arrangement, fixedRentAmount: null, serviceFeePct: own('serviceFeePct'), utilityFeePct: own('utilityFeePct'), sstOnFeePct: own('sstOnFeePct') });
      }
      const setupNow = prop ? await loadSetup(prop.id, st.month) : { units: [] };
      const val = (t, k) => (t[k] ?? ARRANGEMENTS[t.arrangement]?.[k] ?? 0);
      const same = (a, b) => a && b && a.arrangement === b.arrangement && Math.abs((a.fixedRentAmount || 0) - (b.fixedRentAmount || 0)) < 0.005 &&
        ['serviceFeePct', 'utilityFeePct', 'sstOnFeePct'].every(k => Math.abs(val(a, k) - val(b, k)) < 1e-9);
      const termChanges = [];
      for (const [unitCode, t] of fromFile) {
        if (thisDone.has(idOf(unitCode))) continue;
        const cur = setupNow.units.find(u => u.unitCode === unitCode);
        const latest = cur ? latestVersion(cur.termHistory || [], st.month) : null;
        if (same(latest, t)) continue;
        termChanges.push({ unitCode, unitId: unitIdOf(property.id, unitCode), terms: t, isNew: !latest,
          label: `${unitCode}: ${ARRANGEMENTS[t.arrangement].label}${t.fixedRentAmount ? ` RM ${amt(t.fixedRentAmount)}` : ''}` +
            (latest ? ` (was ${ARRANGEMENTS[latest.arrangement]?.label || latest.arrangement}${latest.fixedRentAmount ? ` RM ${amt(latest.fixedRentAmount)}` : ''})` : '') });
      }
      termChanges.sort((a, b) => byUnit(a.unitCode, b.unitCode));
      // Daily rental bookings: the eZee report Finance pasted into the file, with Finance's own amount per booking from the unit sheets
      let bk = null;
      if (st.ezeeRows) {
        const parsed = readEzee(st.ezeeRows);
        const recs = parsed.records.filter(r => (!r.propertyCode || r.propertyCode === code) && r.departureMonth === st.month);
        if (recs.length) {
          bk = await this.buildCheck(recs, code, {});
          const lines = st.summaries.flatMap(s => s.lines.map(l => ({ ...l, unitCode: unitFor(s.unitCode) })));
          for (const r of bk.records.filter(r => r.status === 'active')) {
            const l = lines.find(l => !l.used && l.unitCode === r.unitCode && l.departure === r.departure && (!l.arrival || l.arrival === r.arrival));
            if (l) {
              l.used = true; r.financeAmount = l.amount;
              // Reference file: Finance's Ctrip amount is final, so Month-end won't ask for the Trip.com amount
              if (r.otaKey === 'ctrip') r.ctrip = { finalPto: l.amount, source: 'financeStatement', enteredBy: me.user.uid, enteredByName: me.name };
            }
          }
          bk.matched = bk.records.filter(r => r.financeAmount != null).length;
          bk.ctripFinal = bk.records.filter(r => r.ctrip?.finalPto != null).length;
          bk.financeLines = lines.length;
        }
      }
      this.check = {
        kind: 'statement', property, month: st.month, next, units: mine,
        nextCompleted: mine.filter(u => u.payout < 0 && !thisDone.has(idOf(u.unitCode)) && nextDone.has(idOf(u.unitCode))).map(u => u.unitCode),
        lockedUnits: mine.filter(u => thisDone.has(idOf(u.unitCode))).map(u => u.unitCode),
        balToPay: r2(mine.filter(u => u.payout > 0).reduce((s, u) => s + u.payout, 0)),
        negatives: mine.filter(u => u.payout < 0 && !thisDone.has(idOf(u.unitCode)) && !nextDone.has(idOf(u.unitCode))),
        docs: [...docs.values()], historyMonths, historyCount: historyMonths.length,
        replacing: [...new Set([...docs.values()].filter(d => existing[d.id]).map(d => d.month))].length,
        newUnits: [...new Set([...allCodes, ...(bk ? bk.newUnits : [])])].filter(c => !known.has(c)).sort(byUnit),
        bookings: bk, termChanges, warnings: st.warnings
      };
      this.stage = 4; this.percent = 100;
    },
    async saveStatement() {
      const c = this.check, p = c.property;
      this.working = true; this.saving = true; this.error = ''; this.percent = 0;
      try {
        const batchRef = doc(collection(db, 'importBatches'));
        let b = writeBatch(db);
        if (p.isNew) {
          b.set(doc(db, 'properties', p.id), { name: p.name.trim(), code: p.code, active: true, createdAt: serverTimestamp(), createdBy: me.user.uid });
          b.set(doc(db, 'properties', p.id, 'rateVersions', '2000-01_default'), {
            effectiveFrom: '2000-01', ota: DEFAULT_OTA, earlyCheckInToOwner: true, tourismTaxPerNight: 10,
            reason: 'Default OTA settings, created on first upload', createdBy: me.user.uid, createdByName: me.name, createdAt: serverTimestamp()
          });
          audit(b, me, { action: 'property.create', entity: `properties/${p.id}`, propertyId: p.id, reason: 'New property found in Finance statement' });
        }
        for (const code of c.newUnits) {
          b.set(doc(db, 'units', unitIdOf(p.id, code)), { propertyId: p.id, unitCode: code, ezeeRoomMatch: code,
            aliases: p.code === 'DM' ? (DM_STARTER.aliases[code] || []) : [], ownerId: null, active: true, createdAt: serverTimestamp(), createdBy: me.user.uid });
          markFrom(b, p.id, ALL_MONTHS, unitIdOf(p.id, code));   // a new unit counts in every month's summary
        }
        // Unit settings read from the file, effective from the file's month (later months keep their own versions)
        const stamp = Date.now();
        for (const t of c.termChanges)
          b.set(doc(db, 'units', t.unitId, 'terms', `${c.month}_${stamp}`), { ...t.terms, otaOverrides: null, effectiveFrom: c.month,
            reason: `From Finance statement ${this.fileName}`, createdBy: me.user.uid, createdByName: me.name, createdAt: serverTimestamp() });
        for (const t of c.termChanges) markFrom(b, p.id, c.month, t.unitId);
        if (c.termChanges.length)
          audit(b, me, { action: 'unitTerms.fromStatement', entity: `properties/${p.id}`, propertyId: p.id, month: c.month,
            changes: c.termChanges.map(t => ({ field: t.unitCode, old: null, new: t.terms.arrangement })), reason: this.fileName });
        // ARR-18: negative balances in the file carry into the next month as Brought Forward lines
        for (const u of c.negatives) {
          const unitId = unitIdOf(p.id, u.unitCode);
          b.set(doc(db, 'expenses', `bf_${unitId}_${c.next}`), { propertyId: p.id, unitId, date: `${c.next}-01`, month: c.next,
            kind: 'broughtForward', type: 'broughtForward', description: `Brought forward from ${monthName(c.month)} (Finance statement)`, amount: r2(-u.payout),
            auto: true, sourceStatementId: null, sourceMonth: c.month, sourceImportId: batchRef.id, files: [], deleted: false,
            createdBy: me.user.uid, createdByName: me.name, createdAt: serverTimestamp() });
        }
        if (c.negatives.length) markDirty(b, p.id, c.next, c.negatives.map(u => unitIdOf(p.id, u.unitCode)));
        await b.commit(); clearCache();
        this.percent = 10;
        for (let i = 0; i < c.docs.length; i += 400) {
          b = writeBatch(db);
          for (const { id, ...d } of c.docs.slice(i, i + 400))
            b.set(doc(db, 'payoutHistory', id), { ...d, fileName: this.fileName, importBatchId: batchRef.id,
              importedBy: me.user.uid, importedByName: me.name, importedAt: serverTimestamp() });
          await b.commit(); clearCache();
          this.percent = Math.round(10 + 45 * Math.min(1, (i + 400) / c.docs.length));
        }
        const tally = c.bookings ? await this.saveBookings(c.bookings.records, batchRef, 55, 95, c.bookings) : null;
        b = writeBatch(db);
        const counts = { units: c.units.length, bookings: c.bookings?.active || 0, financeAmounts: c.bookings?.matched || 0, historyRows: c.docs.length, historyMonths: c.historyCount, negatives: c.negatives.length, balToPay: c.balToPay,
          ...(tally ? { created: tally.created, changed: tally.changed, unchanged: tally.unchanged } : {}) };
        b.set(batchRef, { kind: 'financeStatement', fileName: this.fileName, filePath: null, months: [c.month], propertyIds: [p.id], counts, result: 'ok',
          uploadedBy: me.user.uid, uploadedByName: me.name, uploadedAt: serverTimestamp() });
        audit(b, me, { action: 'financeStatement.import', entity: `importBatches/${batchRef.id}`, propertyId: p.id, month: c.month,
          changes: [{ field: 'payoutHistory', old: null, new: c.docs.length }], reason: this.fileName });
        await b.commit(); clearCache();
        this.percent = 100;
        this.newUnitsSaved = c.newUnits.length > 0;
        this.done = `Saved ${monthName(c.month)} as reference: ${c.units.length} owner payouts` +
          (c.bookings ? `, ${c.bookings.active} daily rental bookings (${tally.created} new, ${tally.changed} changed, ${tally.unchanged} unchanged)` : '') +
          (c.historyCount ? ` and payout history back to ${monthName(c.historyMonths[0])}` : '') + '.' +
          (c.termChanges.length ? ` ${c.termChanges.length} units set up from the file, from ${monthName(c.month)}.` : '') +
          (c.negatives.length ? ` ${c.negatives.length} negative ${c.negatives.length === 1 ? 'balance' : 'balances'} carried into ${monthName(c.next)}.` : '');
        if (p.isNew) { this.properties = await loadProperties(); this.propertyId = p.id; }
        this.month = c.next; if (!this.months.includes(c.next)) this.months.push(c.next);
        await this.loadHistory();
      } catch (e) {
        this.error = friendlyError(e, 'save the statement') + ' Saving the same file again is safe: it replaces what was saved.';
      }
      this.saving = false; this.working = false;
    },

    async save() {
      const c = this.check, p = c.property;
      this.working = true; this.saving = true; this.error = ''; this.percent = 0;
      try {
        const r = await this.saveOne(c, 0, 100);
        this.newUnitsSaved = c.newUnits.length > 0;
        this.done = r.msg;
        if (p.isNew) { this.properties = await loadProperties(); this.propertyId = p.id; }
        await this.loadHistory();
      } catch (e) {
        this.error = friendlyError(e, 'save the upload') + ' Nothing is lost: upload the same file again and it picks up where it stopped.';
      }
      this.saving = false; this.working = false;
    },
    // One property's part of the file: new property + units, bookings, the import record. lo..hi is its share of the progress bar.
    async saveOne(c, lo, hi) {
      const p = c.property, at = f => Math.round(lo + (hi - lo) * f);
      const batchRef = doc(collection(db, 'importBatches'));
      let b = writeBatch(db);
      if (p.isNew) {
        b.set(doc(db, 'properties', p.id), { name: p.name.trim(), code: p.code, ...(c.ezeeName ? { ezeeName: c.ezeeName } : {}), active: true, createdAt: serverTimestamp(), createdBy: me.user.uid });
        b.set(doc(db, 'properties', p.id, 'rateVersions', '2000-01_default'), {
          effectiveFrom: '2000-01', ota: DEFAULT_OTA, earlyCheckInToOwner: true, tourismTaxPerNight: 10,
          reason: 'Default OTA settings, created on first eZee upload', createdBy: me.user.uid, createdByName: me.name, createdAt: serverTimestamp()
        });
        audit(b, me, { action: 'property.create', entity: `properties/${p.id}`, propertyId: p.id, reason: 'New property found in eZee upload' });
      }
      for (const r of c.newUnitRecs) {
        b.set(doc(db, 'units', r.unitId), { propertyId: p.id, unitCode: r.unitCode, ezeeRoomMatch: r.unitCode,
          aliases: p.code === 'DM' ? (DM_STARTER.aliases[r.unitCode] || []) : [], ownerId: null, active: true, createdAt: serverTimestamp(), createdBy: me.user.uid });
        markFrom(b, p.id, ALL_MONTHS, r.unitId);   // a new unit counts in every month's summary
      }
      await b.commit(); clearCache();
      this.percent = at(0.05);
      const list = c.records;
      const tally = await this.saveBookings(list, batchRef, at(0.05), at(0.95), c);
      b = writeBatch(db);
      const counts = { rows: list.length, bookings: c.active, cancelled: c.cancelled, noUnit: c.noUnit.length, ctripNeedingAmount: c.ctrip,
        created: c.newCount, updated: c.active - c.newCount, otherMonthsLeftOut: c.otherMonths.reduce((s, m) => s + m.count, 0),
        changed: tally.changed, unchanged: tally.unchanged, bookingWrites: tally.writes };
      b.set(batchRef, { kind: 'ezee', fileName: this.fileName, filePath: null, months: [this.month], propertyIds: [p.id], counts, result: 'ok',
        uploadedBy: me.user.uid, uploadedByName: me.name, uploadedAt: serverTimestamp() });
      audit(b, me, { action: 'ezee.upload', entity: `importBatches/${batchRef.id}`, propertyId: p.id, month: this.month,
        changes: [{ field: 'bookings', old: null, new: c.active }], reason: this.fileName });
      await b.commit(); clearCache();
      this.percent = at(1);
      const msg = `Saved ${c.active} bookings for ${monthName(this.month)} (${tally.created} new, ${tally.changed} changed, ${tally.unchanged} unchanged).` +
        (c.newUnits.length ? ` ${c.newUnits.length} new units need setting up in Portfolio.` : '') +
        (c.ctrip ? ` ${c.ctrip} Ctrip bookings need their Trip.com amount on Month-end payout.` : '');
      return { msg, tally };
    },

    // ---- Many-Properties: one eZee file with many properties ----
    // Each building (read from the Room column) goes to an existing property (matched by its eZee name, name or code) or becomes a new one.
    async startAuto(parsed, changes = []) {
      const nk = t => String(t || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const recs = parsed.records;
      let inMonth = recs.filter(r => r.departureMonth === this.month);
      const byMonth = {}; recs.forEach(r => { if (r.departureMonth) byMonth[r.departureMonth] = (byMonth[r.departureMonth] || 0) + 1; });
      if (!inMonth.length) {
        const top = Object.keys(byMonth).sort((a, b) => byMonth[b] - byMonth[a])[0];
        if (top && this.months.includes(top)) {
          changes.push({ what: 'Month', from: monthName(this.month), to: monthName(top) });
          this.month = top; inMonth = recs.filter(r => r.departureMonth === this.month);
        }
      }
      if (!inMonth.length) {
        const best = Object.keys(byMonth).sort((a, b) => byMonth[b] - byMonth[a])[0];
        this.suggestMonth = best && this.months.includes(best) ? best : '';
        throw new Error(`No checkouts in ${monthName(this.month)} in this file.` + (best ? ` It has ${monthName(best)} (${byMonth[best]} bookings).` : ''));
      }
      const groups = new Map();
      for (const r of inMonth) {
        if (!r.propertyCode) continue;
        if (!groups.has(r.propertyCode)) groups.set(r.propertyCode, { code: r.propertyCode, names: {}, bookings: 0, units: new Set(), recs: [] });
        const g = groups.get(r.propertyCode);
        g.recs.push(r); if (r.status === 'active') g.bookings++; g.units.add(r.unitCode);
        const n = r.building || r.propertyCode; g.names[n] = (g.names[n] || 0) + 1;
      }
      const titleCase = n => (n === n.toUpperCase() && n.length > 4 ? n.charAt(0) + n.slice(1).toLowerCase() : n);
      const list = [...groups.values()].sort((a, b) => a.code.localeCompare(b.code)).map(g => {
        const building = titleCase(Object.keys(g.names).sort((a, b) => g.names[b] - g.names[a])[0]);
        const hit = this.properties.find(p => nk(p.ezeeName) === nk(building) || nk(p.name) === nk(building) || nk(p.code) === nk(g.code));
        return { code: g.code, building, bookings: g.bookings, units: g.units.size, recs: g.recs, target: hit ? hit.id : '__new', newName: building };
      });
      if (!list.length) throw new Error('No rooms in this file could be matched to a building. The Room column should read like "Novo N-27-12 - type E-Novo 1 Bedroom Suite".');
      this.stages[1].note = `${inMonth.filter(r => r.status === 'active').length} bookings in ${list.length} buildings`;
      this.percent = 70; await pause(250);
      this.stage = 3; this.stages[2].note = 'Matching each building to a property'; await pause(250);
      this.stage = 4; this.percent = 100;
      this.auto = { groups: list, byMonth, noRoom: inMonth.filter(r => !r.propertyCode).length,
        otherMonths: Object.entries(byMonth).filter(([m]) => m !== this.month).sort().map(([month, count]) => ({ month, count })) };
      this.checks = []; this.switched = changes;
    },
    // What the check found, one line per booking (shown 10 a page before anything is saved)
    previewRowsFn() {
      const lines = c => (c ? c.records.map(r => ({ key: `${c.property.id}|${r.docId}`, property: c.property.name, unit: r.unitCode, reservationNo: r.reservationNo, source: r.source,
        arrival: r.arrival, departure: r.departure, nights: r.nights, total: r.totalInclTax, isNew: r.isNew, cancelled: r.status !== 'active' })) : []);
      const all = this.auto ? this.checks.flatMap(x => lines(x.check)) : lines(this.check);
      return all.sort((a, b) => a.property.localeCompare(b.property) || (a.unit || '').localeCompare(b.unit || '', undefined, { numeric: true }) || (a.departure || '').localeCompare(b.departure || ''));
    },
    targetOptions(g) {
      return [{ value: '__new', label: 'Create new property' }, ...this.properties.map(p => ({ value: p.id, label: p.name }))];
    },
    async checkAuto() {
      this.working = true; this.error = '';
      try {
        const out = [];
        for (const g of this.auto.groups) {
          const prop = g.target === '__new' ? null : this.properties.find(p => p.id === g.target);
          if (prop && (await monthDoc(prop.id, this.month)).status === 'completed') { out.push({ note: `${monthName(this.month)} is completed for ${prop.name}; left out`, check: null }); continue; }
          const c = await this.buildCheck(g.recs, g.code, this.auto.byMonth, { prop, newName: g.newName || g.building });
          c.ezeeName = g.building;
          const bits = [`${c.active} bookings`, c.newUnits.length ? `${c.newUnits.length} new units` : '', c.lockedUnits.length ? `${c.lockedUnits.length} completed (left out)` : '', c.property.isNew ? 'new property' : ''].filter(Boolean);
          out.push({ note: bits.join(' · '), check: c });
        }
        this.checks = out;
      } catch (e) { this.error = e.code ? friendlyError(e, 'check the file') : e.message; }
      this.working = false;
    },
    async saveAll() {
      const todo = this.checks.filter(x => x.check && x.check.records.length);
      this.working = true; this.saving = true; this.error = ''; this.percent = 0;
      const notes = [];
      try {
        for (let i = 0; i < todo.length; i++) {
          const c = todo[i].check;
          const r = await this.saveOne(c, Math.round(100 * i / todo.length), Math.round(100 * (i + 1) / todo.length));
          notes.push(`${c.property.name}: ${c.active} bookings (${r.tally.created} new, ${r.tally.changed} changed)${c.newUnits.length ? `, ${c.newUnits.length} new units` : ''}`);
          todo[i].saved = true;
        }
        this.newUnitsSaved = todo.some(x => x.check.newUnits.length);
        this.done = `Saved ${monthName(this.month)} for ${todo.length} properties. ${notes.join('. ')}.`;
        this.properties = await loadProperties();
        this.propertyId = this.properties.find(p => p.id === todo[0].check.property.id)?.id || this.propertyId;
      } catch (e) {
        this.error = friendlyError(e, 'save the upload') + (notes.length ? ` Saved so far: ${notes.join('; ')}.` : '') + ' Nothing is lost: upload the same file again and it picks up where it stopped.';
      }
      this.saving = false; this.working = false;
    },  }
};
</script>

<style scoped>
    /* Property name box shrinks on a phone instead of pushing the page sideways */
    .prev-h { margin: 18px 0 8px; font-size: 15px; }
    .name-cell { min-width: 0; }
    .name-cell .input { max-width: 100%; }
</style>
