// Widebed PMS - Maintenance Master Record <-> Google Sheet (18 Nov 2026, Khairul).
// Attach to the team's Master Record Google Sheet (Extensions > Apps Script) and deploy as a web app:
//   Execute as: Me (the company account)   Who has access: Anyone
// The PMS (src/lib/maintenance-sheet.js) calls doPost with the signed-in person's Firebase sign-in (idToken). That sign-in
// must be able to read maintenanceSheet/settings in Firebase, which only Accounting and Directors can. No keys or
// passwords are kept here.
//
// One file per year (Khairul, 18 Nov 2026). This script lives in the 2026 file; it remembers each year's file in the
// script properties (YEAR_2026 = this file, set by authorize). The first sync of a new year makes that year's file by
// itself: a copy of the latest year's file, named with the new year, in the same Drive folder, with its month tabs
// emptied down to one blank template (headers, formats, totals kept). The copy carries this script, so editing it stamps
// "Sheet edited at" the same way. Nobody sets anything up at New Year.
//
// Layout = the team's sheet (and the PMS Master Record download): one tab per month ("Nov 26"), totals in row 1, headers in
// row 2 (found by the "ID" header in the first 5 rows), one row per ticket. The PMS only touches rows whose ID is a PMS
// ticket (IS-0001); every other row, the totals and the team's own columns are left alone. Columns are found by header name.
// - push: the PMS writes its columns on its rows (new tickets go at the bottom). "PMS synced at" is stamped and
//   "Sheet edited at" cleared (both added at the end of the header row if missing). Profit stays a formula.
// - pull: the PMS reads the year's PMS rows and saves edits to Area / Action Date / Solution/Action Taken / Cost Remarks.
// - onEdit: editing one of those 4 columns on a PMS row stamps "Sheet edited at". A single-cell edit to another PMS column
//   on a PMS row is put back (the PMS owns it).

var PROJECT = 'widebed-pmsdashboard';
var TZ = 'Asia/Kuala_Lumpur';
var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
var EDITABLE = ['Area', 'Action Date', 'Solution/Action Taken', 'Cost Remarks'];
var TEAM = ['Status_One', 'Email_Status_One', 'Status_Two', 'Email_Status_Two', 'Update_By', 'Cost On', 'Sheet edited at', 'Profit (RM)'];
var DATES = ['Report Date', 'Action Date', 'Charged owner'];
var DATETIMES = ['Raise_Date_Time', 'Action_Date_Time'];
var MONEY = ['Cost (RM)', 'WB Charge (RM)', 'Profit (RM)'];
var PMS_ID = /^IS-\d+$/;

var VERSION = '18 Nov 2026 3:35 PM (Make next year file button; new-year file keeps the newest layout)';
// Open the /exec link in a browser to see which version is live and which Sheet it belongs to.
function doGet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return ContentService.createTextOutput('Widebed PMS Sheet sync. Version: ' + VERSION + '. Sheet: ' + (ss ? ss.getName() : '?'));
}

function doPost(e) {
  var out;
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    checkAccess(body.idToken);
    var year = String(body.year || '');
    if (!/^\d{4}$/.test(year)) throw new Error('Year missing.');
    if (body.action === 'pull') { var b = book(year, false), got = b ? pull(b, year, body.headers || [], body.months || null) : { rows: [], computed: [] }; out = { ok: true, url: b ? b.getUrl() : '', rows: got.rows, computed: got.computed }; }
    else if (body.action === 'push') {
      var lock = LockService.getScriptLock();
      lock.waitLock(30000);
      try { var bk = book(year, true); out = { ok: true, url: bk.getUrl(), written: push(bk, body.headers || [], body.synced || [], (body.rows || []).filter(function (r) { return String(r.Month || '').slice(0, 4) === year; })) }; }
      finally { lock.releaseLock(); }
    } else if (body.action === 'year') {   // make that year's file now (Sheet settings > "Make <year> file now")
      var lk = LockService.getScriptLock();
      lk.waitLock(30000);
      try { var by = book(year, true); out = { ok: true, url: by.getUrl(), name: by.getName(), tabs: by.getSheets().map(function (x) { return x.getName(); }) }; }
      finally { lk.releaseLock(); }
    } else throw new Error('Unknown action.');
  } catch (err) {
    out = { ok: false, error: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

// Firebase checks the sign-in and the rules decide: only Accounting and Directors can read maintenanceSheet/settings.
// A sign-in that passed is remembered for 5 minutes (by a hash of the whole token).
function checkAccess(idToken) {
  if (!idToken || String(idToken).length < 100) throw new Error('Sign in again.');
  var hash = Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(idToken)));
  var cache = CacheService.getScriptCache();
  if (cache.get('ok_' + hash)) return;
  var r = UrlFetchApp.fetch('https://firestore.googleapis.com/v1/projects/' + PROJECT + '/databases/(default)/documents/maintenanceSheet/settings',
    { headers: { Authorization: 'Bearer ' + idToken }, muteHttpExceptions: true });
  var code = r.getResponseCode();
  if (code === 401) throw new Error('Sign in again.');
  if (code !== 200) throw new Error('Only Accounting and Directors can sync the Maintenance sheet (' + code + ').');
  cache.put('ok_' + hash, '1', 300);
}

// ---------- one file per year ----------
function book(year, create) {
  var props = PropertiesService.getScriptProperties(), id = props.getProperty('YEAR_' + year);
  if (id) return SpreadsheetApp.openById(id);
  var known = props.getKeys().filter(function (k) { return /^YEAR_\d{4}$/.test(k); }).map(function (k) { return Number(k.slice(5)); }).sort();
  if (!known.length) {   // never set up: this script's own file is that year's file
    var own = SpreadsheetApp.getActiveSpreadsheet();
    if (!own) throw new Error('Run "authorize" once in the script editor first.');
    props.setProperty('YEAR_' + year, own.getId());
    return own;
  }
  if (!create) return null;
  var from = known.filter(function (y) { return y < Number(year); }).pop() || known[known.length - 1];
  var src = DriveApp.getFileById(props.getProperty('YEAR_' + from));
  var name = src.getName().indexOf(String(from)) >= 0 ? src.getName().replace(String(from), year) : year + ' ' + src.getName();
  var parents = src.getParents(), copy = parents.hasNext() ? src.makeCopy(name, parents.next()) : src.makeCopy(name);
  var ss = SpreadsheetApp.openById(copy.getId());
  emptyBook(ss);
  props.setProperty('YEAR_' + year, ss.getId());
  return ss;
}
// A fresh year's file: every month tab goes. A "Template" tab, if there is one, is the pattern for the new months;
// otherwise the LATEST month tab (the newest layout, e.g. December) is kept, emptied, as "Template".
function emptyBook(ss) {
  var months = ss.getSheets().filter(function (sh) { return isMonthTab(sh.getName()); });
  if (!months.length) return;
  var tpl = ss.getSheetByName('Template'), keep = null;
  if (!tpl) {
    keep = months.slice().sort(function (a, b) { return monthIndex(a.getName()) - monthIndex(b.getName()); }).pop();
    tpl = keep;
  }
  months.forEach(function (sh) { if (sh !== keep) ss.deleteSheet(sh); });
  var L = layout(tpl, null);
  if (tpl.getLastRow() > L.row) tpl.getRange(L.row + 1, 1, tpl.getLastRow() - L.row, tpl.getLastColumn()).clearContent();
  tpl.setName('Template');
  stretchTotals(tpl, L, L.row + 1);
}
// "Dec 26" / "December 2026" -> 11; -1 when not a month tab
function monthIndex(name) {
  var k = key(name);
  for (var m = 0; m < 12; m++) {
    var full = Utilities.formatDate(new Date(2000, m, 1), TZ, 'MMMM').toLowerCase();
    if (new RegExp('^(' + MON[m].toLowerCase() + '|' + full + ')(\\d{2}|\\d{4})$').test(k)) return m;
  }
  return -1;
}

// ---------- testing the new-year file (run from the editor; use on the TEST copy) ----------
// Makes next year's file now, as the first sync of next year would. Check it in Drive, then run forgetNextYearTest.
function testNextYearFile() {
  var y = String(new Date().getFullYear() + 1), ss = book(y, true);
  Logger.log('Next year file: ' + ss.getName() + '  ' + ss.getUrl() + '  tabs: ' + ss.getSheets().map(function (s) { return s.getName(); }).join(', '));
}
// Writes a pretend ticket IS-9999 into December's tab (Dec 26), the way the PMS would. Delete the row afterwards.
function testDecemberRow() {
  var y = String(new Date().getFullYear()), ss = book(y, true);
  var row = { ID: 'IS-9999', Month: y + '-12', "Owner's Name": 'Test owner', Property_Name: 'Test property', 'Unit No': 'TEST 1',
    'Report Date': y + '-12-01', Area: 'Test area', Description: 'Pretend December ticket (delete this row)', 'Cost (RM)': 10, 'WB Charge (RM)': 25 };
  var synced = Object.keys(row).filter(function (h) { return h !== 'Month'; });
  push(ss, synced, synced, [row]);
  Logger.log('Written to ' + ss.getName() + ' > ' + monthTab(ss, y + '-12', false).getName() + '. Delete the IS-9999 row when done.');
}
// Undo the test: the script forgets next year's file (move the file itself to the Bin in Drive).
function forgetNextYearTest() {
  var y = String(new Date().getFullYear() + 1);
  PropertiesService.getScriptProperties().deleteProperty('YEAR_' + y);
  Logger.log('Forgot the ' + y + ' file. Move it to the Bin in Drive.');
}

function isMonthTab(name) {
  var k = key(name);
  return MON.some(function (m, i) {
    var full = Utilities.formatDate(new Date(2000, i, 1), TZ, 'MMMM').toLowerCase();
    return new RegExp('^(' + m.toLowerCase() + '|' + full + ')(\\d{2}|\\d{4})$').test(k);
  });
}

// ---------- tabs and headers ----------
var key = function (s) { return String(s || '').toLowerCase().replace(/[\s_]/g, ''); };
// 'YYYY-MM' -> the month's tab ("Nov 26", "Nov 2026", "November 2026", "NOV26" all match). create: make "Nov 26" if missing.
function monthTab(ss, ym, create, headers) {
  var y = ym.slice(0, 4), m = Number(ym.slice(5, 7)) - 1, mon = MON[m].toLowerCase();
  var full = Utilities.formatDate(new Date(Number(y), m, 1), TZ, 'MMMM').toLowerCase();
  var ok = [mon + y.slice(2), mon + y, full + y.slice(2), full + y];
  var found = ss.getSheets().filter(function (s) { return ok.indexOf(key(s.getName())) >= 0; })[0];
  if (found || !create) return found || null;
  var name = MON[m] + ' ' + y.slice(2);
  // A new month: a copy of the "Template" tab or the latest month tab (same headers, widths, formats, totals), emptied
  var tpl = ss.getSheetByName('Template') || ss.getSheets().filter(function (s) { return isMonthTab(s.getName()); }).pop();
  if (tpl) {
    var sh = tpl.copyTo(ss).setName(name), L = layout(sh, null);
    if (sh.getLastRow() > L.row) sh.getRange(L.row + 1, 1, sh.getLastRow() - L.row, sh.getLastColumn()).clearContent();
    stretchTotals(sh, L, L.row + 1);
    sh.showSheet();
    return sh;
  }
  var sh2 = ss.insertSheet(name);
  sh2.getRange(2, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  sh2.setFrozenRows(2);
  return sh2;
}
function monthOfTab(name, year) {
  var k = key(name);
  for (var m = 0; m < 12; m++) {
    var mon = MON[m].toLowerCase(), full = Utilities.formatDate(new Date(Number(year), m, 1), TZ, 'MMMM').toLowerCase();
    if ([mon + year.slice(2), mon + year, full + year.slice(2), full + year].indexOf(k) >= 0) return year + '-' + ('0' + (m + 1)).slice(-2);
  }
  return '';
}
// { row: header row number, col: { 'Header': column number } }, matched without spaces / underscores / capitals.
function layout(sh, add) {
  var lastCol = Math.max(1, sh.getLastColumn()), top = sh.getRange(1, 1, Math.min(5, Math.max(1, sh.getLastRow())), lastCol).getValues();
  var hr = 0;
  for (var i = 0; i < top.length && !hr; i++) if (top[i].some(function (v) { return key(v) === 'id'; })) hr = i + 1;
  if (!hr) hr = 2;
  var head = sh.getRange(hr, 1, 1, lastCol).getValues()[0], byKey = {};
  head.forEach(function (h, i) { if (String(h).trim() && !byKey[key(h)]) byKey[key(h)] = i + 1; });   // the first column of a name wins
  var col = {}, missing = [];
  (add || []).forEach(function (h) { if (byKey[key(h)]) col[h] = byKey[key(h)]; else missing.push(h); });
  if (missing.length) {
    var start = sh.getLastColumn() + 1;
    sh.getRange(hr, start, 1, missing.length).setValues([missing]).setFontWeight('bold');
    missing.forEach(function (h, i) { col[h] = start + i; });
  }
  return { row: hr, col: col, head: head.map(function (h) { return String(h).trim(); }), byKey: byKey };
}

function cellOut(v) {
  if (v instanceof Date) {
    var hm = Utilities.formatDate(v, TZ, 'HH:mm');
    return hm === '00:00' ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd') : Utilities.formatDate(v, TZ, 'dd/MM/yyyy HH:mm');
  }
  return v;
}
function cellIn(h, v) {
  var s = String(v == null ? '' : v);
  var d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (DATES.indexOf(h) >= 0 && d) return new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3]));
  var t = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/.exec(s);
  if (DATETIMES.indexOf(h) >= 0 && t) return new Date(Number(t[3]), Number(t[2]) - 1, Number(t[1]), Number(t[4]), Number(t[5]));
  return v == null ? '' : v;
}
function colLetter(n) { var s = ''; for (; n; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; }

// ---------- pull: the year's PMS rows ----------
function pull(ss, year, headers, months) {
  var out = [], canon = {}, calc = [];
  headers.concat(['PMS synced at', 'Sheet edited at']).forEach(function (h) { canon[key(h)] = h; });   // the Sheet's header text -> the PMS name
  ss.getSheets().forEach(function (sh) {
    var month = monthOfTab(sh.getName(), year);
    if (!month || (months && months.length && months.indexOf(month) < 0)) return;
    var last = sh.getLastRow();
    if (last < 2) return;
    var L = layout(sh, null), idCol = L.byKey['id'];
    if (!idCol || last <= L.row) return;
    // Fast: read the ID column first, then only the rows between the first and last PMS ticket
    var ids = sh.getRange(L.row + 1, idCol, last - L.row, 1).getValues().map(function (x) { return String(x[0]).trim(); });
    var at = [];
    ids.forEach(function (id, i) { if (PMS_ID.test(id)) at.push(i); });
    if (!at.length) return;
    computedHeaders(sh, L).forEach(function (h) { h = canon[key(h)] || h; if (calc.indexOf(h) < 0) calc.push(h); });
    var lo = at[0], data = sh.getRange(L.row + 1 + lo, 1, at[at.length - 1] - lo + 1, sh.getLastColumn()).getValues();
    at.forEach(function (i) {
      var line = data[i - lo], row = { Month: month };
      L.head.forEach(function (h, c) { h = canon[key(h)] || h; if (h && (TEAM.indexOf(h) < 0 || h === 'Sheet edited at')) row[h] = cellOut(line[c]); });
      out.push(row);
    });
  });
  return { rows: out, computed: calc };
}

// ---------- push: write the PMS columns on PMS rows ----------
// Reads each month tab once, changes the rows in memory and writes each run of touched rows in one go (fast even for a
// whole year). Dropdowns (data validation) are kept: a PMS value that isn't in a list is still written (Sheets marks it).
function push(ss, headers, synced, rows) {
  var byMonth = {};
  rows.forEach(function (r) { if (PMS_ID.test(String(r.ID || '')) && /^\d{4}-\d{2}$/.test(String(r.Month || ''))) (byMonth[r.Month] = byMonth[r.Month] || []).push(r); });
  var now = new Date().toISOString(), n = 0;
  Object.keys(byMonth).forEach(function (ym) {
    var sh = monthTab(ss, ym, true, headers);
    var L = layout(sh, synced.concat(['PMS synced at', 'Sheet edited at']));
    var width = sh.getLastColumn(), first = L.row + 1, last = sh.getLastRow();
    var ids = last >= first ? sh.getRange(first, L.col['ID'], last - first + 1, 1).getValues().map(function (x) { return String(x[0]).trim(); }) : [];
    // The last row with an ID: the team's sheet has dropdowns / formulas filled far down, so getLastRow() is no guide
    var lastId = ids.length; while (lastId && !ids[lastId - 1]) lastId--;
    var target = {};   // ticket id -> sheet row
    byMonth[ym].forEach(function (row) {
      var at = ids.indexOf(row.ID);
      if (at < 0) { at = lastId++; while (ids.length <= at) ids.push(''); ids[at] = row.ID; }   // new: under the last ticket
      target[row.ID] = first + at;
    });
    var rowsAt = Object.keys(target).map(function (id) { return target[id]; });
    var lo = Math.min.apply(null, rowsAt), hi = Math.max.apply(null, rowsAt);
    var block = sh.getRange(lo, 1, hi - lo + 1, width);
    var vals = block.getValues(), forms = block.getFormulas(), rules = block.getDataValidations();
    var profit = L.byKey[key('Profit (RM)')], wb = L.col['WB Charge (RM)'], cost = L.col['Cost (RM)'];
    var calc = computedCols(sh, L, width);   // columns the Sheet fills with one formula (e.g. lookups by Unit No): never written
    byMonth[ym].forEach(function (row) {
      var r = target[row.ID], line = vals[r - lo], formulas = forms[r - lo], set = {};
      synced.forEach(function (h) { if (L.col[h] && h in row) { line[L.col[h] - 1] = cellIn(h, row[h]); set[L.col[h]] = 1; } });
      line[L.col['PMS synced at'] - 1] = now; set[L.col['PMS synced at']] = 1;
      line[L.col['Sheet edited at'] - 1] = ''; set[L.col['Sheet edited at']] = 1;
      // The team's own formulas on the row stay formulas (not frozen into values)
      formulas.forEach(function (f, i) { if (f && !set[i + 1]) line[i] = f; });
      calc.forEach(function (c) { line[c - 1] = formulas[c - 1] || ''; });   // '' = left empty so the column formula fills it
      if (profit && wb && cost && !formulas[profit - 1] && line[profit - 1] === '') line[profit - 1] = '=IF(' + colLetter(wb) + r + '="","",' + colLetter(wb) + r + '-' + colLetter(cost) + r + ')';
      n++;
    });
    // Write each run of consecutive touched rows at once
    rowsAt.sort(function (a, b) { return a - b; });
    var runs = [];
    rowsAt.forEach(function (r) { var cur = runs[runs.length - 1]; if (cur && r === cur[1] + 1) cur[1] = r; else runs.push([r, r]); });
    runs.forEach(function (run) {
      var a = run[0] - lo, k = run[1] - run[0] + 1, rg = sh.getRange(run[0], 1, k, width);
      var keep = rules.slice(a, a + k);
      rg.clearDataValidations();
      try { rg.setValues(vals.slice(a, a + k)); } finally { rg.setDataValidations(keep); }
    });
    // Formats: one call per kind
    var cells = function (list, byKeyOnly) {
      var out = [];
      list.forEach(function (h) { var c = byKeyOnly ? L.byKey[key(h)] : L.col[h]; if (c) runs.forEach(function (run) { out.push(colLetter(c) + run[0] + ':' + colLetter(c) + run[1]); }); });
      return out;
    };
    var d = cells(DATES, false), t = cells(DATETIMES, false), m = cells(MONEY, true);
    if (d.length) sh.getRangeList(d).setNumberFormat('dd/mm/yyyy');
    if (t.length) sh.getRangeList(t).setNumberFormat('dd/mm/yyyy hh:mm');
    if (m.length) sh.getRangeList(m).setNumberFormat('#,##0.00');
    stretchTotals(sh, L, first + lastId - 1);
  });
  return n;
}
// Columns filled by one formula from the header row or the first row (={"Owner's Name"; ARRAYFORMULA(XLOOKUP(F3:F, ...))}):
// writing a value into them breaks the whole column (#REF!), so the PMS leaves them to the Sheet.
var COLUMN_FORMULA = /ARRAYFORMULA|^=\s*\{|\b(MAP|BYROW|QUERY|FILTER|IMPORTRANGE)\s*\(/i;
function computedCols(sh, L, width) {
  var f = sh.getRange(L.row, 1, 2, width).getFormulas(), out = [];
  for (var c = 0; c < width; c++) if (COLUMN_FORMULA.test(f[0][c] || '') || COLUMN_FORMULA.test(f[1][c] || '')) out.push(c + 1);
  return out;
}
function computedHeaders(sh, L) {
  return computedCols(sh, L, Math.max(1, sh.getLastColumn())).map(function (c) { return L.head[c - 1]; }).filter(String);
}

// Row 1 totals like =SUM(W3:W40): set the end row to `last` (the last ticket row; grows only, except for a fresh tab).
function stretchTotals(sh, L, last) {
  if (L.row < 2) return;
  last = Math.max(last, L.row + 1);
  var fresh = last === L.row + 1;
  var f = sh.getRange(1, 1, 1, sh.getLastColumn()).getFormulas()[0], changed = false;
  f = f.map(function (x) {
    var m = /^=SUM\(([A-Z]+)(\d+):([A-Z]+)(\d+)\)$/i.exec(x || '');
    if (m && (fresh ? Number(m[4]) !== last : Number(m[4]) < last)) { changed = true; return '=SUM(' + m[1] + m[2] + ':' + m[3] + last + ')'; }
    return x;
  });
  if (changed) f.forEach(function (x, i) { if (/^=SUM\(/i.test(x || '')) sh.getRange(1, i + 1).setFormula(x); });
}

// Simple trigger: runs when a person edits the Sheet (not when the PMS writes it).
function onEdit(e) {
  if (!e || !e.range) return;
  var sh = e.range.getSheet();
  if (!isMonthTab(sh.getName())) return;   // month tabs only
  var L = layout(sh, null), idCol = L.byKey['id'];
  var r0 = e.range.getRow(), m = e.range.getNumRows(), c0 = e.range.getColumn(), n = e.range.getNumColumns();
  if (!idCol || r0 <= L.row) return;
  var ids = sh.getRange(r0, idCol, m, 1).getValues().map(function (x) { return String(x[0]).trim(); });
  if (!ids.some(function (id) { return PMS_ID.test(id); })) return;   // the team's own rows: nothing to do
  var inList = function (list, h) { return list.some(function (x) { return key(x) === key(h); }); };
  var touched = L.head.slice(c0 - 1, c0 - 1 + n);
  var pmsOwned = touched.filter(function (h) { return h && !inList(EDITABLE, h) && !inList(TEAM, h); });
  if (pmsOwned.length) {
    if (n === 1 && m === 1) {
      e.range.setValue(e.oldValue === undefined ? '' : e.oldValue);
      SpreadsheetApp.getActive().toast('"' + pmsOwned[0] + '" comes from the PMS, so it was put back. Change it in the PMS.', 'Widebed PMS', 6);
    } else {
      SpreadsheetApp.getActive().toast('PMS columns (' + pmsOwned.join(', ') + ') are rewritten from the PMS at the next sync.', 'Widebed PMS', 8);
    }
  }
  var col = L.byKey[key('Sheet edited at')];
  if (col && touched.some(function (h) { return inList(EDITABLE, h); })) {
    var stamp = new Date().toISOString();
    sh.getRange(r0, col, m, 1).setValues(ids.map(function (id) { return [PMS_ID.test(id) ? stamp : '']; }));
  }
}

// Run once from the editor (pick "authorize" at the top, press Run) so Google asks for the permissions.
function authorize() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), props = PropertiesService.getScriptProperties();
  var y = (/20\d{2}/.exec(ss.getName()) || [String(new Date().getFullYear())])[0];
  if (!props.getProperty('YEAR_' + y)) props.setProperty('YEAR_' + y, ss.getId());
  Logger.log('Sheet: ' + ss.getName() + ' = the ' + y + ' file. Next years get their own file by themselves.');
  DriveApp.getFileById(ss.getId());
  UrlFetchApp.fetch('https://firestore.googleapis.com/', { muteHttpExceptions: true });
  Logger.log('OK. Now Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone).');
}
