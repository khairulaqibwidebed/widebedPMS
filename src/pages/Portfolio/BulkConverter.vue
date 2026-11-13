<template>
  <main class="content">
    <div class="page-head">
      <div>
        <h1>Bulk Upload Converter</h1>
        <div class="sub">Turn any Excel or CSV file into the Bulk Upload template. Match the columns, check the preview, download, then upload it on Bulk Upload. Nothing is saved here.</div>
      </div>
      <router-link class="btn" to="/Portfolio/bulk-upload">Back to Bulk Upload</router-link>
    </div>

    <ol class="steps cv-steps" aria-label="Steps">
      <li class="step" :class="{ current: !grid.length, done: grid.length }"><span class="dot">1</span>Choose the type and file</li>
      <li class="step" :class="{ current: grid.length && !rows.length, done: rows.length }"><span class="dot">2</span>Match the columns</li>
      <li class="step" :class="{ current: rows.length, done: false }"><span class="dot">3</span>Check and download</li>
    </ol>

    <!-- 1. What the file becomes -->
    <div class="cv-kinds" role="tablist" aria-label="What are you converting to">
      <button type="button" class="cv-kind" v-for="(t, k) in TEMPLATES" :key="k" :class="{ on: kind === k }" @click="setKind(k)">
        <b>{{ t.label }}</b><small>{{ `${t.cols.length} columns · ${t.cols.filter(c => c.req).length} needed` }}</small>
      </button>
    </div>

    <div class="notice error" v-show="error">{{ error }}</div>

    <label class="dropzone" :class="{ over: dragging }" v-show="!grid.length && !loading"
           @dragover.prevent="dragging = true" @dragleave.prevent="dragging = false" @drop.prevent="dragging = false; pick($event.dataTransfer.files)">
      <svg class="dz-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4l7 7h-4.5v6h-5v-6H5z"/></svg>
      <b>{{ `Drag your ${tpl.label.toLowerCase()} file here, or` }}</b>
      <span class="btn">Choose file</span>
      <small>.xlsx, .xls or .csv · any layout · the header row can be anywhere</small>
      <input type="file" accept=".csv,.xlsx,.xls,text/csv" hidden @change="pick($event.target.files); $event.target.value = ''">
    </label>

    <section class="card" v-show="loading"><p class="muted" style="margin:0">Reading the file…</p></section>

    <!-- 2. Sheet, header row and column matches -->
    <section class="card" v-if="grid.length">
      <div class="card-head">
        <h2><span class="file-badge">{{ (fileName.split('.').pop() || '').toUpperCase() }}</span> {{ fileName }}</h2>
        <button type="button" class="link" @click="clear()">Choose another file</button>
      </div>
      <div class="cv-row">
        <div class="field" v-show="sheetNames.length > 1">
          <label for="cvSheet">Sheet</label>
          <select class="select" id="cvSheet" v-model="sheet" @change="loadSheet(true)"><option v-for="n in sheetNames" :key="n" :value="n">{{ n }}</option></select>
        </div>
        <div class="field">
          <label for="cvHead">Header row (the row with the column names)</label>
          <select class="select" id="cvHead" v-model.number="headerRow" @change="autoMatch()"><option v-for="o in headerChoices" :key="o.value" :value="o.value">{{ o.label }}</option></select>
        </div>
        <div class="field" v-if="kind === 'owners'">
          <label for="cvProp">Property (goes in B4)</label>
          <input class="input" id="cvProp" v-model.trim="propHint" list="cvProps" placeholder="Name or short code, e.g. DM">
          <datalist id="cvProps"><option v-for="p in properties" :key="p.id" :value="p.code || p.name">{{ p.name }}</option></datalist>
        </div>
      </div>
      <p class="help" v-if="kind === 'owners'" style="margin:8px 0 0">One property per file. For a workbook with one sheet per property (like Finance's Owner List), convert one sheet at a time.</p>

      <h3 class="cv-h3">Match the columns</h3>
      <p class="help" style="margin:0 0 10px">{{ `Matched ${matchedCount} of ${tpl.cols.length} template columns by name. Fix any wrong match; leave a column empty when your file doesn't have it.` }}</p>
      <div class="table-wrap">
        <table class="table cv-map">
          <thead><tr><th>Template column</th><th>From your file</th><th>First value</th></tr></thead>
          <tbody>
            <tr v-for="c in tpl.cols" :key="c.header" :class="{ miss: c.req && map[c.header] === '' }">
              <td><b>{{ c.header }}</b><span class="pill red" v-if="c.req" style="margin-left:6px">Needed</span></td>
              <td>
                <select class="select" v-model="map[c.header]" :aria-label="`Column for ${c.header}`">
                  <option value="">(leave empty)</option>
                  <option v-for="f in fileCols" :key="f.idx" :value="String(f.idx)">{{ f.name }}{{ usedBy(f.idx, c.header) ? ` (also ${usedBy(f.idx, c.header)})` : '' }}</option>
                </select>
              </td>
              <td class="muted">{{ sample(c) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="help" v-show="unusedCols.length" style="margin:10px 0 0">{{ `Not used from your file: ${unusedCols.join(' · ')}` }}</p>
    </section>

    <!-- 3. Preview and download -->
    <section class="card" v-if="grid.length">
      <div class="card-head"><h2>Preview</h2></div>
      <div class="notice error" v-show="missingReq.length">{{ `Not matched yet: ${missingReq.join(', ')}. Bulk Upload needs ${missingReq.length === 1 ? 'it' : 'them'}.` }}</div>
      <div class="cv-stats">
        <div class="cv-stat ok"><b>{{ rows.filter(r => !r.errors.length).length }}</b><span>Rows ready</span></div>
        <div class="cv-stat skip"><b>{{ rows.filter(r => !r.errors.length && r.warnings.length).length }}</b><span>Ready, with a note</span></div>
        <div class="cv-stat bad"><b>{{ rows.filter(r => r.errors.length).length }}</b><span>With problems</span></div>
      </div>
      <p class="help" v-show="stopNote">{{ stopNote }}</p>
      <Paged :items="rows" v-slot="{ pageRows }">
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th class="num">Row</th><th v-for="c in shownCols" :key="c.header">{{ c.header }}</th><th>Check</th></tr></thead>
            <tbody>
              <tr v-for="r in pageRows" :key="r.line" :class="{ bad: r.errors.length }">
                <td class="num">{{ r.line }}</td>
                <td v-for="c in shownCols" :key="c.header">{{ showVal(r.out[c.header], c) }}</td>
                <td>
                  <span class="pill" :class="r.errors.length ? 'red' : r.warnings.length ? 'amber' : 'green'">{{ r.errors.length ? 'Problem' : r.warnings.length ? 'Note' : 'OK' }}</span>
                  <div class="help" v-show="r.errors.length || r.warnings.length">{{ [...r.errors, ...r.warnings].join(' ') }}</div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Paged>
      <div class="actions cv-actions">
        <label class="check"><input type="checkbox" v-model="leaveOutBad"> Leave out rows with problems</label>
        <span class="help">{{ `${outRows.length} ${outRows.length === 1 ? 'row' : 'rows'} in the file.` }}{{ kind === 'owners' && !propHint ? ' B4 is empty: write the property above, or choose it on Bulk Upload.' : '' }}</span>
        <button type="button" class="btn btn-primary" :disabled="!outRows.length" @click="download()">Download template file</button>
      </div>
    </section>
  </main>
</template>

<script>
// Bulk Upload Converter (13 Nov 2026): any Excel/CSV -> the Bulk Upload template layout, for the one-time move of old data.
// Columns are matched by name (lib/bulk-templates.js), each match can be changed, and the file is written in the
// template's exact column order. The page only reads the file and writes a download: nothing goes to Firestore.
import { markRaw } from 'vue';
import { TEMPLATES, normKey, toIsoDate, toMoney, toState, matchUnitType, newUnitType, sectionHeading } from '@/lib/bulk-templates.js';
import { friendlyError, loadXlsxLib, loadProperties } from '@/lib/finance-data.js';
import { loadUnitTypes } from '@/lib/portfolio-data.js';

const GREEN = '22695C';
const words = s => String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
// How well a column name in the file fits a template column (0 = not at all)
// "Utilities" is not "Utilities %": the % counts for an exact match, so Finance's "Payment To > Utilities" column
// doesn't beat "Utilities Sharing". Part matches need 5+ letters ("Type" alone never matches "Type of Tenancy").
const pctKey = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9%]/g, '');
function fit(name, c) {
  const n = normKey(name); if (!n) return 0;
  if (n === normKey(c.header)) return pctKey(name) === pctKey(c.header) ? 100 : 70;
  const alias = (c.alias || []).map(normKey);
  if (alias.includes(n)) return 90;
  const h = normKey(c.header);
  if (n.length >= 5 && (n.includes(h) || h.includes(n))) return 60;
  if (alias.some(a => a.length >= 5 && n.length >= 5 && (n.includes(a) || a.includes(n)))) return 50;
  const a = new Set(words(name)); let best = 0;
  for (const t of [c.header, ...(c.alias || [])]) {
    const b = new Set(words(t)), both = [...a].filter(x => b.has(x)).length;
    if (both) best = Math.max(best, (both / new Set([...a, ...b]).size) * 50);
  }
  return best;
}

export default {
  data() {
    return { TEMPLATES, kind: 'owners', dragging: false, loading: false, error: '', fileName: '', wb: null, sheetNames: [], sheet: '',
      grid: [], rawGrid: [], headerRow: 1, map: {}, propHint: '', propAuto: '', properties: [], unitTypes: [], leaveOutBad: false };
  },
  computed: {
    tpl() { return TEMPLATES[this.kind]; },
    headerChoices() {
      const n = Math.min(this.grid.length, 40), out = [];
      for (let i = 0; i < n; i++) {
        const cells = (this.grid[i] || []).map(c => String(c).trim()).filter(Boolean);
        if (cells.length) out.push({ value: i + 1, label: `Row ${i + 1}: ${cells.slice(0, 4).join(' | ').slice(0, 70)}` });
      }
      return out;
    },
    // Column names: the header row, else the row above (a merged title over several columns)
    fileCols() {
      const h = this.headerRow - 1, row = this.grid[h] || [], above = h > 0 ? this.grid[h - 1] || [] : [];
      const width = Math.max(0, ...this.grid.map(r => r.length));
      const out = [];
      for (let j = 0; j < width; j++) {
        const name = String(row[j] || '').replace(/\s+/g, ' ').trim() || String(above[j] || '').replace(/\s+/g, ' ').trim();
        if (name || this.grid.slice(h + 1).some(r => String(r[j] ?? '').trim())) out.push({ idx: j, name: name || `Column ${j + 1}` });
      }
      return out;
    },
    matchedCount() { return this.tpl.cols.filter(c => this.map[c.header] !== '' && this.map[c.header] != null).length; },
    missingReq() { return this.tpl.cols.filter(c => c.req && !this.map[c.header]).map(c => c.header); },
    unusedCols() { const used = new Set(Object.values(this.map).filter(v => v !== '')); return this.fileCols.filter(f => !used.has(String(f.idx))).map(f => f.name); },
    // Data rows under the header (blank rows left out; Owner List rows from "TERMINATED UNIT" on left out)
    dataRange() {
      const h = this.headerRow - 1, stop = this.tpl.stopAt ? normKey(this.tpl.stopAt) : '';
      let end = this.grid.length;
      if (stop) { const i = this.grid.findIndex((r, k) => k > h && r.some(c => normKey(c) === stop)); if (i >= 0) end = i; }
      return { from: h + 1, to: end };
    },
    stopNote() {
      const { to } = this.dataRange;
      return to < this.grid.length ? `Rows from row ${to + 1} ("${this.tpl.stopAt}") on are left out, as Bulk Upload does.` : '';
    },
    rows() {
      if (!this.grid.length) return [];
      const { from, to } = this.dataRange, out = [];
      // Heading rows ("Double Room", "Twin Room" in Finance's Owner List) are left out and give the unit type of the
      // rows under them, unless the row has its own Unit Type. A heading that is the property's name is not a type.
      const typeCol = this.tpl.cols.find(c => c.type === 'unitType');
      const skipNames = [...this.properties.map(p => p.name), this.propHint, this.sheet].filter(Boolean);
      let section = '';
      for (let i = from; i < to; i++) {
        const cells = this.grid[i] || [], raw = this.rawGrid[i] || [];
        if (!cells.some(c => String(c).trim())) continue;
        if (typeCol) { const head = sectionHeading(cells, skipNames); if (head !== null) { section = head; continue; } }
        const r = { line: i + 1, out: {}, errors: [], warnings: [] };
        for (const c of this.tpl.cols) {
          const j = this.map[c.header];
          const has = j !== '' && j != null && String(cells[+j] ?? '').trim();
          if (c === typeCol && !has && section) { r.out[c.header] = this.convert(c, section, section, r); continue; }
          r.out[c.header] = j === '' || j == null ? '' : this.convert(c, cells[+j], raw[+j], r);
          if (c.req && (r.out[c.header] === '' || r.out[c.header] == null)) r.errors.push(`${c.header} is empty.`);
        }
        // A row with nothing in any matched column (e.g. a section title in another column) is left out
        if (this.tpl.cols.every(c => r.out[c.header] === '' || r.out[c.header] == null)) continue;
        out.push(r);
      }
      return out;
    },
    outRows() { return this.leaveOutBad ? this.rows.filter(r => !r.errors.length) : this.rows; },
    // The preview shows matched columns only (all of them when nothing is matched yet)
    shownCols() { const m = this.tpl.cols.filter(c => this.map[c.header]); return m.length ? m : this.tpl.cols.filter(c => c.req); }
  },
  async mounted() {
    try { [this.properties, this.unitTypes] = await Promise.all([loadProperties(), loadUnitTypes()]); }
    catch (e) { this.error = friendlyError(e, 'load the properties'); }
  },
  methods: {
    setKind(k) {
      if (k === this.kind) return;
      this.kind = k;
      if (this.grid.length) { this.headerRow = this.guessHeader(); this.autoMatch(); }
      else this.map = {};
    },
    clear() { Object.assign(this, { error: '', fileName: '', wb: null, sheetNames: [], sheet: '', grid: [], rawGrid: [], map: {}, headerRow: 1 }); if (this.propHint === this.propAuto) this.propHint = ''; },

    async pick(files) {
      const file = [...(files || [])][0];
      if (!file || this.loading) return;
      this.clear();
      if (!/\.(csv|xlsx|xls)$/i.test(file.name)) { this.error = 'Choose an .xlsx, .xls or .csv file.'; return; }
      this.loading = true; this.fileName = file.name;
      try {
        const X = await loadXlsxLib();
        const csv = /\.csv$/i.test(file.name);
        // CSV as text so leading zeros (IC, phone, account no.) stay
        this.wb = markRaw(csv ? X.read(await file.text(), { type: 'string', raw: true }) : X.read(await file.arrayBuffer(), { type: 'array' }));
        this.sheetNames = this.wb.SheetNames.filter(n => this.wb.Sheets[n]?.['!ref']);
        if (!this.sheetNames.length) throw new Error('The file is empty.');
        // Start on the sheet with the best header match
        let best = this.sheetNames[0], bestScore = -1;
        for (const n of this.sheetNames) { this.sheet = n; await this.loadSheet(false); const s = this.headerScore(this.grid[this.guessHeader() - 1] || []); if (s > bestScore) [best, bestScore] = [n, s]; }
        this.sheet = best; await this.loadSheet(true);
      } catch (e) { this.error = e.message && !e.code ? e.message : friendlyError(e, 'read the file'); this.grid = []; }
      this.loading = false;
    },
    async loadSheet(match) {
      const X = await loadXlsxLib(), ws = this.wb.Sheets[this.sheet];
      // Shown text (dates as yyyy-mm-dd, percentages as "20%") and the raw values (long numbers in full)
      this.grid = markRaw(X.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false, blankrows: true, dateNF: 'yyyy-mm-dd' }));
      this.rawGrid = markRaw(X.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true, blankrows: true }));
      if (!match) return;
      this.headerRow = this.guessHeader();
      this.autoMatch();
      // Owners: a sheet named like a property's code (DM, FLEXUS) fills B4, unless something was typed
      if (this.kind === 'owners' && (!this.propHint || this.propHint === this.propAuto)) {
        const k = normKey(this.sheet), p = this.properties.find(x => normKey(x.code) === k) || this.properties.find(x => normKey(x.name) === k);
        const hint = this.fileProperty() || (p ? p.code || p.name : '');
        this.propHint = this.propAuto = hint;
      }
    },
    // The owner template's own "Property (name or code)" cell above the header, if the file has one
    fileProperty() {
      for (const r of this.grid.slice(0, this.headerRow - 1)) {
        const j = r.findIndex(c => normKey(c).startsWith('property'));
        if (j >= 0 && String(r[j + 1] ?? '').trim() && !/^e\.?g\.?/i.test(String(r[j + 1]).trim())) return String(r[j + 1]).trim();
      }
      return '';
    },
    headerScore(row) { return row.reduce((s, c) => s + (String(c).trim() ? Math.max(0, ...this.tpl.cols.map(t => fit(c, t))) : 0), 0); },
    // The header row: the one among the first 40 whose cells best fit the template's column names
    guessHeader() {
      let best = 0, score = -1;
      for (let i = 0; i < Math.min(this.grid.length, 40); i++) {
        const s = this.headerScore(this.grid[i] || []);
        if (s > score) [best, score] = [i, s];
      }
      if (score <= 0) best = Math.max(0, this.grid.findIndex(r => r.some(c => String(c).trim())));
      return best + 1;
    },
    // Each template column gets the file column that fits it best; a file column is used once
    autoMatch() {
      const pairs = [];
      for (const c of this.tpl.cols) for (const f of this.fileCols) { const s = fit(f.name, c); if (s >= 45) pairs.push({ c: c.header, f: String(f.idx), s }); }
      pairs.sort((a, b) => b.s - a.s);
      const map = Object.fromEntries(this.tpl.cols.map(c => [c.header, ''])), usedF = new Set();
      for (const p of pairs) if (!map[p.c] && !usedF.has(p.f)) { map[p.c] = p.f; usedF.add(p.f); }
      this.map = map;
    },
    usedBy(idx, self) { return this.tpl.cols.filter(c => c.header !== self && this.map[c.header] === String(idx)).map(c => c.header).join(', '); },
    sample(c) {
      const j = this.map[c.header]; if (j === '' || j == null) return '';
      const { from, to } = this.dataRange;
      for (let i = from; i < to; i++) { const v = String(this.grid[i]?.[+j] ?? '').trim(); if (v) return v.length > 40 ? v.slice(0, 40) + '…' : v; }
      return '(empty)';
    },

    // One cell -> the value written in the template. Problems Bulk Upload would reject go in r.errors; things it leaves out in r.warnings.
    convert(c, shown, raw, r) {
      const text = String(shown ?? '').trim();
      if (!text && (raw === '' || raw == null)) return '';
      switch (c.type) {
        case 'id': {
          // Long numbers (account no., IC) in full, never 1.23E+11; text as it is
          if (typeof raw === 'number') return Number.isInteger(raw) ? raw.toFixed(0) : String(raw);
          if (/e\+?\d/i.test(text) && /^[\d.]+e/i.test(text)) r.warnings.push(`${c.header} reads "${text}": type it in the file as text.`);
          return text;
        }
        case 'date': {
          let iso = toIsoDate(text);
          if (!iso && typeof raw === 'number' && raw > 20000 && raw < 80000) { const d = new Date(Math.round((raw - 25569) * 86400000)); iso = d.toISOString().slice(0, 10); }
          if (!iso) { r.errors.push(`${c.header} "${text}" is not a date.`); return text; }
          return iso;
        }
        case 'money': {
          const n = typeof raw === 'number' ? raw : toMoney(text);
          if (n == null) { r.errors.push(`${c.header} "${text}" is not an amount.`); return text; }
          return Math.round(n * 100) / 100;
        }
        case 'email': {
          const e = text.toLowerCase();
          if (!/^\S+@\S+\.\S+$/.test(e)) r.warnings.push(`${c.header} "${text}" doesn't look like an email.`);
          return e;
        }
        case 'state': {
          const s = toState(text);
          if (!s) { r.errors.push(`State "${text}" is not a Malaysian state.`); return text; }
          return s;
        }
        case 'unitType': {
          // Not on the list yet: kept as written; Bulk Upload adds it to the list when saving
          const t = matchUnitType(text, this.unitTypes);
          if (!t) { r.warnings.push(`Unit type "${newUnitType(text)}" is new: Bulk Upload adds it to the unit type list.`); return newUnitType(text); }
          return t;
        }
        default: return text;   // 'pct' too: Bulk Upload reads "20", "20%", "45%/20%/10%" itself
      }
    },
    showVal(v, c) { return v === '' || v == null ? '—' : c.type === 'money' && typeof v === 'number' ? v.toFixed(2) : v; },

    // Writes the template layout: title rows, B4 property (owners), the green header row, then the rows
    async download() {
      try {
        const X = await loadXlsxLib(), t = this.tpl, cols = t.cols;
        const aoa = [];
        for (let i = 1; i < t.headerRow; i++) aoa.push([]);
        t.titles.forEach((s, i) => { aoa[i] = [s]; });
        if (t.propertyRow) aoa[t.propertyRow - 1] = ['Property (name or code)', this.propHint || ''];
        aoa.push(cols.map(c => c.header));
        for (const r of this.outRows) aoa.push(cols.map(c => r.out[c.header] ?? ''));
        const ws = X.utils.aoa_to_sheet(aoa);
        const border = { style: 'thin', color: { rgb: 'CDD2D8' } };
        const h = t.headerRow - 1;
        cols.forEach((c, j) => {
          const hc = ws[X.utils.encode_cell({ r: h, c: j })];
          hc.s = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { patternType: 'solid', fgColor: { rgb: GREEN } }, alignment: { vertical: 'center', wrapText: true },
            border: { top: border, bottom: border, left: border, right: border } };
          for (let i = h + 1; i < aoa.length; i++) {
            const ref = X.utils.encode_cell({ r: i, c: j });
            const cell = ws[ref] || (ws[ref] = { t: 's', v: '' });
            if (c.type === 'money' && typeof cell.v === 'number') cell.z = '0.00';
            else { cell.t = 's'; cell.v = String(cell.v ?? ''); cell.z = '@'; }   // text, so IC, phone and account numbers stay as typed
          }
        });
        if (t.titles[0]) ws.A1.s = { font: { bold: true, sz: 14, color: { rgb: GREEN } } };
        if (t.titles[1]) ws.A2.s = { font: { italic: true, color: { rgb: '5F6670' } } };
        if (t.propertyRow) ws[`A${t.propertyRow}`].s = { font: { bold: true, color: { rgb: GREEN } } };
        ws['!cols'] = cols.map(c => ({ wch: Math.min(40, Math.max(14, c.header.length + 4)) }));
        const wb = X.utils.book_new();
        X.utils.book_append_sheet(wb, ws, t.sheet);
        const base = this.fileName.replace(/\.(csv|xlsx|xls)$/i, '').replace(/[\\/:*?"<>|]+/g, ' ').trim();
        X.writeFile(wb, `${base}${this.sheetNames.length > 1 ? ` - ${this.sheet}` : ''} (${t.label} template).xlsx`);
      } catch (e) { this.error = friendlyError(e, 'make the file'); }
    }
  }
};
</script>

<style scoped>
    .cv-steps { margin: 0 0 16px; padding: 0; list-style: none; }
    .cv-kinds { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 16px; }
    .cv-kind { text-align: left; padding: 14px 16px; border: 1.5px solid var(--border); border-radius: var(--radius); background: var(--surface); color: var(--text); cursor: pointer; }
    .cv-kind b { display: block; font-size: 15px; }
    .cv-kind small { color: var(--muted); font-size: 12.5px; }
    .cv-kind:hover, .cv-kind.on { border-color: var(--accent); }
    .cv-kind.on { background: var(--accent-soft); }
    .card { margin-bottom: 16px; }
    .card-head h2 { display: flex; align-items: center; gap: 10px; }
    .file-badge { font-size: 11px; font-weight: 700; padding: 3px 7px; border-radius: 6px; background: var(--accent-soft); color: var(--accent); }
    .cv-row { display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-end; }
    .cv-row .field { margin: 0; flex: 1 1 220px; min-width: 0; }
    .cv-row .select, .cv-row .input { width: 100%; }
    .cv-h3 { font-size: 15px; margin: 18px 0 4px; }
    .cv-map .select { min-width: 200px; width: 100%; }
    .cv-map tr.miss td { background: var(--red-soft); }
    .cv-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-bottom: 10px; }
    .cv-stat { padding: 12px 14px; border-radius: 10px; background: var(--chip); }
    .cv-stat b { display: block; font-size: 24px; line-height: 1.1; }
    .cv-stat span { font-size: 12.5px; color: var(--text-2); }
    .cv-stat.ok { background: var(--green-soft); } .cv-stat.ok b { color: var(--green); }
    .cv-stat.skip { background: var(--amber-soft); } .cv-stat.skip b { color: var(--amber); }
    .cv-stat.bad { background: var(--red-soft); } .cv-stat.bad b { color: var(--red); }
    tr.bad td { color: var(--muted); }
    .actions { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 16px; }
    .cv-actions { position: sticky; bottom: 0; background: var(--surface); padding: 12px 0 0; border-top: 1px solid var(--line); }
    .check { display: flex; align-items: center; gap: 6px; font-size: 13px; }
</style>
