// Maintenance Master Record <-> Google Sheet (18 Nov 2026, Khairul). No Vercel and no keys: everything goes through one
// Apps Script attached to the Sheet (apps-script-maintenance-sheet/Code.gs), deployed as a web app under the company account.
//
// - The browser sends the signed-in person's Firebase ID token with each call. The script uses it to read
//   maintenanceSheet/settings, which the rules let only Accounting (Expenses Edit tick) and Directors read, so nobody
//   else can read or write the Sheet through it. Nothing secret is stored in the PMS, the Sheet or the script.
// - One file per year: the script makes next year's file by itself (a copy of this year's, emptied) on its first sync.
// - Writes into the team's own Master Record Sheet (Khairul, 18 Nov 2026): month tabs ("Nov 26"), totals row 1, headers
//   row 2, columns found by header name. Only rows whose ID is a PMS ticket (IS-0001) are touched; "PMS synced at" and
//   "Sheet edited at" are added at the end of the header row. Profit stays the Sheet's formula.
// - PMS -> Sheet: every synced column is rewritten from the PMS whenever it differs (money columns included).
// - Sheet -> PMS: only Area, Action Date, Solution/Action Taken and Cost Remarks. The script stamps "Sheet edited at" when
//   someone edits them; the next sync saves them on the ticket with the viewer's own login (rules Draft 0.84) and an
//   audit line "updated from Google Sheet". Edits to other synced columns are put back by the script / the next sync.
// - Columns the PMS leaves blank (Status_One, Email_Status_One, Status_Two, Email_Status_Two, Update_By, Cost On) are the
//   team's own: never written or read by the PMS.
import { doc, getDoc, setDoc, writeBatch, serverTimestamp, arrayUnion } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase.js';
import { audit } from '@/lib/finance-data.js';
import { normState } from '@/lib/states.js';
import { loadMaintenance, masterContext, MASTER_HEADERS, r2, myMonth, localNow, ticketMonth, maintStatus, MAINT_STATUS } from '@/lib/maintenance.js';

export const SHEET_EDITABLE = ['Area', 'Action Date', 'Solution/Action Taken', 'Cost Remarks'];
const TEAM_COLS = ['Status_One', 'Email_Status_One', 'Status_Two', 'Email_Status_Two', 'Update_By', 'Cost On'];
const EXTRA = ['PMS synced at', 'Sheet edited at'];
// 18 Nov 2026: every Customer ticket is on the Sheet; "PMS Status" (Pending / Charged / In progress / Cancelled) is added at
// the end of the header row the first time (the script adds missing synced columns)
const STATUS_COL = 'PMS Status';
export const SHEET_HEADERS = [...MASTER_HEADERS, STATUS_COL, ...EXTRA];
const SYNCED = [...MASTER_HEADERS.filter(h => !TEAM_COLS.includes(h) && h !== 'Profit (RM)'), STATUS_COL];   // + Month (picks the tab, not written)
const MONEY = ['Cost (RM)', 'WB Charge (RM)', 'Profit (RM)'];

// ---------- settings (maintenanceSheet/settings: Directors write, Accounting and Directors read) ----------
const URL_OK = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/;
export async function loadSheetSettings() {
  try { const s = await getDoc(doc(db, 'maintenanceSheet', 'settings')); return s.exists() ? s.data() : null; }
  catch { return null; }   // not allowed to read (not Accounting / Director): no sync
}
export async function saveSheetSettings(me, { scriptUrl, sheetUrl, states = [] }) {
  scriptUrl = String(scriptUrl || '').trim(); sheetUrl = String(sheetUrl || '').trim();
  if (!URL_OK.test(scriptUrl)) throw Object.assign(new Error('Paste the web app URL from Deploy > Manage deployments (it starts with https://script.google.com/macros/s/ and ends with /exec).'), { plain: true });
  if (sheetUrl && !/^https:\/\/docs\.google\.com\/spreadsheets\//.test(sheetUrl)) throw Object.assign(new Error('The Sheet link should start with https://docs.google.com/spreadsheets/'), { plain: true });
  states = (states || []).map(normState).filter(Boolean);   // only these properties' tickets go to the Sheet ([] = all)
  const data = { scriptUrl, sheetUrl, states, updatedBy: me.user.uid, updatedByName: me.name, updatedAt: serverTimestamp() };
  await setDoc(doc(db, 'maintenanceSheet', 'settings'), data);
  return data;
}

// ---------- the script ----------
async function call(url, payload) {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw Object.assign(new Error('Sign in again.'), { plain: true });
  let j;
  try {
    // text/plain keeps it a "simple" request (no CORS preflight, which Apps Script can't answer)
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ...payload, idToken }) });
    j = await r.json();
  } catch { throw Object.assign(new Error('Could not reach the Google Sheet script. Check its web app URL and that it is deployed for "Anyone".'), { plain: true }); }
  if (!j.ok) throw Object.assign(new Error(`Google Sheet: ${j.error || 'no answer'}`), { plain: true });
  return j;
}

// ---------- values ----------
const pad = n => String(n).padStart(2, '0');
const toDate = v => (v?.toDate ? v.toDate() : typeof v === 'string' && v ? new Date(v.length === 10 ? v + 'T00:00:00+08:00' : v) : null);
const my = v => { const d = toDate(v); return !d || isNaN(d) ? null : new Date(d.getTime() + 8 * 3600e3); };   // Malaysia wall clock (UTC fields)
const ymd = v => { const d = my(v); return d ? d.toISOString().slice(0, 10) : ''; };
const dmyHm = v => { const d = my(v); return d ? `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` : ''; };
const day = s => (/^\d{4}-\d{2}-\d{2}$/.test(s || '') ? s : '');

// One Sheet row (synced columns only). Not completed yet (In progress / Cancelled): the completion and money columns are empty.
export function sheetRow(t, ctx) {
  const c = t.completion || {}, bl = t.billing || {}, o = ctx.ownerOf(t), charged = bl.status === 'charged', cost = t.completion ? r2(c.cost) : '';
  return {
    ID: t.id, "Owner's Name": o.name, "Owner's Email Address1": o.email1, "Owner's Email Address2": o.email2,
    Property_Name: t.property || ctx.props[t.propertyId] || '', 'Unit No': t.unit || '', 'Report Date': ymd(t.createdAt),
    'Google Drive Link': t.driveFolderUrl || c.driveFolderUrl || '', Area: t.area || '', Description: t.body || t.title || '',
    'Raised by': t.raisedBy || '', Raise_Date_Time: dmyHm(t.createdAt), 'Action Date': day(c.actionDate),
    'Solution/Action Taken': c.solution || '', 'Cost Remarks': c.costRemarks || '', 'Fixed by': c.fixedByName || '',
    Action_Date_Time: dmyHm(c.completedAt), 'Cost (RM)': cost, 'WB Charge (RM)': charged ? r2(bl.wbCharge) : '',
    'Profit (RM)': charged ? r2(r2(bl.wbCharge) - cost) : '', 'Invoice No.': charged ? bl.invoiceNo || '' : '',
    'Charged owner': charged ? day(bl.chargedAt) : '', [STATUS_COL]: MAINT_STATUS[maintStatus(t)], Month: ticketMonth(t)
  };
}
const norm = (h, v) => (v === '' || v == null ? '' : MONEY.includes(h) ? (Number(v) || 0).toFixed(2) : String(v).trim());
// skip: columns the Sheet fills itself with a column formula (the script leaves them alone, so they never match)
const differs = (row, sheet, skip = []) => !sheet || SYNCED.some(h => !skip.includes(h) && norm(h, row[h]) !== norm(h, sheet[h]));
const pendingEdit = r => !!r?.['Sheet edited at'] && (!r['PMS synced at'] || String(r['Sheet edited at']) > String(r['PMS synced at']));

// Sheet edits (the 4 editable columns) for one ticket: [{ header, field, old, new }]. Bad dates / empty solutions are skipped.
function editsFor(t, r) {
  const c = t.completion || {}, out = [];
  const take = (header, field, now, raw, ok, max) => { const v = String(raw ?? '').trim().slice(0, max); if (ok(v) && v !== String(now || '')) out.push({ header, field, old: now || '', new: v }); };
  take('Area', 'area', t.area, r.Area, () => true, 60);
  take('Action Date', 'completion.actionDate', c.actionDate, r['Action Date'], v => /^\d{4}-\d{2}-\d{2}$/.test(v), 10);
  take('Solution/Action Taken', 'completion.solution', c.solution, r['Solution/Action Taken'], v => v.length > 0, 2000);
  take('Cost Remarks', 'completion.costRemarks', c.costRemarks, r['Cost Remarks'], () => true, 500);
  return out;
}
async function applyEdits(me, t, edits) {
  const b = writeBatch(db), fields = {};
  for (const e of edits) fields[e.field] = e.new;
  const text = 'updated from Google Sheet: ' + edits.map(e => `${e.header} "${String(e.old).slice(0, 60)}" → "${String(e.new).slice(0, 60)}"`).join(', ');
  b.update(doc(db, 'issues', t.id), { ...fields, audit: arrayUnion({ at: localNow(), by: me.name, role: me.role, text }), updatedAt: serverTimestamp() });
  audit(b, me, { action: 'issue.sheetEdit', entity: `issues/${t.id}`, propertyId: t.propertyId || null, month: t.completion?.month || null,
    changes: edits.map(e => ({ field: e.field, old: e.old, new: e.new })), reason: 'Edited in the Maintenance Google Sheet' });
  await b.commit();
  // the local copy follows
  for (const e of edits) { if (e.field === 'area') t.area = e.new; else t.completion[e.field.split('.')[1]] = e.new; }
}

// Sync these tickets (all from one year) with the Sheet: Sheet edits first, then rewrite rows that differ.
// sheetRows: what pull returned (re-pulled when not given). Returns { fromSheet, toSheet }.
async function syncTickets(me, url, year, tickets, sheetRows, link = '', computed = [], months = null, states = []) {
  const [ctx, j] = await Promise.all([   // units/owners and the Sheet at the same time
    tickets.length ? masterContext(tickets) : null,
    sheetRows ? null : call(url, { action: 'pull', year, headers: SHEET_HEADERS, months })]);
  if (j) { sheetRows = j.rows || []; link = j.url || ''; computed = j.computed || []; }
  if (states.length && ctx) tickets = tickets.filter(t => states.includes(ctx.propState[t.propertyId]));   // e.g. the KL Sheet: KL properties only
  const byId = Object.fromEntries(sheetRows.map(r => [String(r.ID || '').trim(), r]));
  let fromSheet = 0;
  for (const t of tickets) {
    const r = byId[t.id];
    if (!pendingEdit(r)) continue;
    const edits = editsFor(t, r);
    if (edits.length) { await applyEdits(me, t, edits); fromSheet++; }
  }
  const rows = tickets.map(t => sheetRow(t, ctx)).filter(row => differs(row, byId[row.ID], computed) || pendingEdit(byId[row.ID]));
  if (rows.length) link = (await call(url, { action: 'push', year, headers: SHEET_HEADERS, editable: SHEET_EDITABLE, synced: SYNCED, rows })).url || link;
  return { fromSheet, toSheet: rows.length, year, link };   // link: that year's file (the script makes a new year's file itself)
}

// Full sync of some months of one year (Maintenance page load: its month; "Sync Google Sheet": the whole year so far)
export async function syncMonths(me, url, months, onStep = () => {}, states = []) {
  const year = months[0].slice(0, 4), tickets = [];
  const want = months.filter(x => x <= myMonth());
  onStep('Reading tickets…');
  (await Promise.all(want.map(m => loadMaintenance(m)))).forEach(list => tickets.push(...list));   // all months at once
  onStep('Syncing with Google Sheet…');
  return syncTickets(me, url, year, tickets, null, '', [], want, states);   // the script reads only these month tabs
}
// Sheet settings (Director): make a year's file now instead of at its first sync. Returns { url, name, tabs }.
export async function makeYearFile(url, year) {
  const j = await call(url, { action: 'year', year: String(year) });
  return { url: j.url || '', name: j.name || '', tabs: j.tabs || [] };
}
export const yearMonths = year => Array.from({ length: 12 }, (_, i) => `${year}-${pad(i + 1)}`);

// Quick check (every 2 minutes while the page is open): only tickets the Sheet has new edits for. Costs no Firestore
// reads when nothing was edited.
export async function syncSheetEdits(me, url, year, states = []) {
  const j = await call(url, { action: 'pull', year, headers: SHEET_HEADERS }), sheetRows = j.rows || [];
  const ids = [...new Set(sheetRows.filter(pendingEdit).map(r => String(r.ID || '').trim()).filter(id => /^IS-\d+$/.test(id)))];
  if (!ids.length) return { fromSheet: 0, toSheet: 0, year, link: j.url || '' };
  const tickets = [];
  for (const id of ids) {
    const s = await getDoc(doc(db, 'issues', id)).catch(() => null);
    const t = s?.exists() ? { id, ...s.data() } : null;
    if (t && t.status === 'done' && t.type === 'customer' && t.completion) tickets.push(t);
  }
  return syncTickets(me, url, year, tickets, sheetRows, j.url || '', j.computed || [], null, states);
}

// A ticket removed for good (18 Nov 2026): its row goes from every month tab of that year's file
export async function removeSheetRows(url, year, ids) {
  return (await call(url, { action: 'remove', year: String(year), ids })).removed || 0;
}
