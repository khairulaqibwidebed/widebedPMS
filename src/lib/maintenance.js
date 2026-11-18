// lib/maintenance.js (18 Nov 2026): customer maintenance tickets.
//   Issues page: who can be tagged as People (Maintenance staff with the ticket's property), the Area list.
//   Expenses > Maintenance tab: completed customer tickets, charging the owner (one expense line per ticket).
//   Master Record: the yearly Excel file (one sheet per month + Owner list).
// Ticket fields: assigneeUids [uid], assignees [{ uid, name }], area, driveFolderUrl, driveFolderId,
//   completion { actionDate, solution, costRemarks, cost, fixedByUid, fixedByName, completedByUid, completedByName,
//     completedAt, month 'YYYY-MM' (Malaysia time), driveFolderUrl },
//   billing { status 'pending' } or { status 'charged', wbCharge, profit, invoiceNo, expenseId, chargedAt, chargedByUid, chargedByName }.
import { collection, doc, getDoc, getDocs, query, where, writeBatch, serverTimestamp, arrayUnion } from 'firebase/firestore';
import { db, CUSTOM_ROLES, loadRoleRegistry } from '@/lib/firebase.js';
import { canSee, scoped, getScoped } from '@/lib/property-scope.js';
import { can } from '@/lib/access.js';
import { completedUnitIds, audit, loadXlsxLib, download } from '@/lib/finance-data.js';
import { markDirty } from '@/lib/summary-data.js';
import { withState, stateOf } from '@/lib/states.js';
import { ownerPrivLevel, readOwnerPriv } from '@/lib/portfolio-data.js';

export const AREAS = ['Bedroom', 'Bathroom / Toilet', 'Kitchen', 'Living room', 'Balcony', 'All areas', 'Other'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
const r3 = v => Math.round((Number(v) || 0) * 1000) / 1000;
export { r2, r3 };

// 'YYYY-MM' / 'YYYY-MM-DD' in Malaysia time (UTC+8), whatever the computer's clock zone
export const myMonth = (d = new Date()) => new Date(d.getTime() + 8 * 3600e3).toISOString().slice(0, 7);
export const myDay = (d = new Date()) => new Date(d.getTime() + 8 * 3600e3).toISOString().slice(0, 10);
export const monShort = ym => (ym ? `${MON[+ym.slice(5, 7) - 1]} ${ym.slice(2, 4)}` : '');
export const nextMonth = ym => { const [y, m] = ym.split('-').map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`; };

// Accounting (the Expenses Edit tick) and Directors: the Maintenance tab, charging, the Master Record. Same as the rules' billingWriter().
export const canBill = me => !!me?.role && (me.role === 'director' || can(me, 'expenses.edit'));

// The custom role named "Maintenance" (Settings > Roles), found by name whatever the capitals. null when there is none.
export async function maintenanceRoleId() {
  await loadRoleRegistry();
  return Object.keys(CUSTOM_ROLES).find(id => (CUSTOM_ROLES[id].name || '').trim().toLowerCase() === 'maintenance') || null;
}
// Active Maintenance staff who have this property (same test as lib/property-scope.js canSee). Directors are never listed.
// [{ uid, name, role }] sorted by name. Kept 5 minutes per role in this tab.
export async function maintenanceStaff(propertyId) {
  const roleId = await maintenanceRoleId();
  return roleId ? roleStaff(roleId, propertyId) : [];
}
// 18 Nov 2026: the same list for any sign-in role (e.g. 'operations' for the Change to Customer popup on Issues).
const staffCache = {};
export async function roleStaff(roleId, propertyId) {
  if (!roleId) return [];
  const c = staffCache[roleId];
  if (!c || Date.now() - c.at > 300000) {
    const snap = await getDocs(query(collection(db, 'users'), where('role', '==', roleId)));
    staffCache[roleId] = { at: Date.now(), rows: snap.docs.map(d => ({ uid: d.id, ...d.data() })) };
  }
  return staffCache[roleId].rows
    .filter(u => u.active !== false && u.role === roleId && propertyId && canSee(propertyId, { role: u.role, properties: Array.isArray(u.properties) ? u.properties : [] }))
    .map(u => ({ uid: u.uid, name: u.displayName || u.email || 'Staff', role: u.role }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---------- Expenses > Maintenance ----------
// Completed customer tickets of one month (completion.month), for my properties (or one property). Only tickets with a
// completion record (older completed tickets have none and are left out).
export async function loadMaintenance(month, propertyId = '') {
  const base = query(collection(db, 'issues'), where('type', '==', 'customer'), where('status', '==', 'done'), where('completion.month', '==', month));
  const snap = propertyId ? await getDocs(query(base, where('propertyId', '==', propertyId))) : await getScoped(scoped(base));
  return snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(t => t.completion && t.status === 'done')
    .sort((a, b) => a.id.localeCompare(b.id));
}

// The first month from `month` on where this unit's statement is still open (not completed, not sent to the Director).
export async function openMonthFor(propertyId, unitId, month) {
  let m = month;
  for (let i = 0; i < 24; i++) {
    if (!(await completedUnitIds(propertyId, m)).has(unitId)) return m;
    m = nextMonth(m);
  }
  throw new Error(`No open statement month found for this unit after ${month}.`);
}

// Invoice numbers are unique across maintenance charges (ignoring capitals and spaces). Checked when saving.
export const invoiceKey = s => String(s || '').replace(/\s+/g, '').toUpperCase();
export async function invoiceTaken(no, exceptExpenseId = '') {
  const snap = await getDocs(query(collection(db, 'expenses'), where('invoiceKey', '==', invoiceKey(no))));
  return snap.docs.some(d => d.id !== exceptExpenseId && !d.data().deleted);
}

const shortText = (s, n = 80) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

// Charge the owner: ONE expense line on the unit (amount = WB Charge; cost = the ticket's cost, never shown to the owner),
// in the ticket's completion month or the next open month, and billing on the ticket. One batch with the audit lines.
export async function chargeTicket(me, t, { wbCharge, invoiceNo }) {
  const wb = r2(wbCharge), cost = r2(t.completion.cost), no = String(invoiceNo).trim();
  if (await invoiceTaken(no)) throw Object.assign(new Error(`Invoice No. ${no} is already used on another maintenance charge.`), { plain: true });
  const month = await openMonthFor(t.propertyId, t.unitId, t.completion.month);
  const moved = month !== t.completion.month;
  const description = `${t.id} · ${shortText(t.completion.solution)}` + (moved ? ` · from ${MON[+t.completion.month.slice(5, 7) - 1]} ticket ${t.id}` : '');
  const b = writeBatch(db), eRef = doc(collection(db, 'expenses'));
  const date = moved ? `${month}-01` : (t.completion.actionDate || `${month}-01`);
  b.set(eRef, await withState(t.propertyId, { propertyId: t.propertyId, unitId: t.unitId, date, month, kind: 'expense', type: 'maintenance',
    description, amount: wb, cost, marginType: 'rm', marginValue: r2(wb - cost), source: { issueId: t.id }, invoiceNo: no, invoiceKey: invoiceKey(no),
    ...(moved ? { note: `from ${monShort(t.completion.month)} ticket ${t.id}` } : {}),
    auto: false, sourceStatementId: null, files: [], deleted: false, createdBy: me.user.uid, createdByName: me.name, createdAt: serverTimestamp() }));
  audit(b, me, { action: 'expense.create', entity: `expenses/${eRef.id}`, propertyId: t.propertyId, month, changes: [{ field: 'amount', old: null, new: wb }], reason: `Maintenance charge, ticket ${t.id}` });
  markDirty(b, t.propertyId, month, [t.unitId]);
  const billing = { status: 'charged', wbCharge: wb, profit: r2(wb - cost), invoiceNo: no, expenseId: eRef.id, expenseMonth: month,
    chargedAt: myDay(), chargedByUid: me.user.uid, chargedByName: me.name };
  const line = { at: localNow(), by: me.name, role: me.role, text: `charged the owner RM ${wb.toFixed(2)} (invoice ${no}, cost RM ${cost.toFixed(2)})${moved ? `, on the ${monShort(month)} statement` : ''}` };
  b.update(doc(db, 'issues', t.id), { billing, audit: arrayUnion(line), updatedAt: serverTimestamp() });
  audit(b, me, { action: 'issue.charge', entity: `issues/${t.id}`, propertyId: t.propertyId, month, changes: [{ field: 'billing', old: 'pending', new: 'charged' }] });
  await b.commit();
  return { billing, month, moved };
}

// Edit a charged row (WB Charge, Invoice No., the ticket's Cost) with a reason, until that line's statement is completed.
export async function editCharge(me, t, { wbCharge, invoiceNo, cost }, reason) {
  const bl = t.billing, wb = r2(wbCharge), c = r2(cost), no = String(invoiceNo).trim();
  if ((await completedUnitIds(t.propertyId, bl.expenseMonth)).has(t.unitId))
    throw Object.assign(new Error(`The unit's statement for ${monShort(bl.expenseMonth)} is completed (or sent to the Director), so this charge is locked.`), { plain: true });
  if (invoiceKey(no) !== invoiceKey(bl.invoiceNo) && await invoiceTaken(no, bl.expenseId))
    throw Object.assign(new Error(`Invoice No. ${no} is already used on another maintenance charge.`), { plain: true });
  const changes = [];
  if (wb !== r2(bl.wbCharge)) changes.push({ field: 'wbCharge', old: bl.wbCharge, new: wb });
  if (no !== bl.invoiceNo) changes.push({ field: 'invoiceNo', old: bl.invoiceNo, new: no });
  if (c !== r2(t.completion.cost)) changes.push({ field: 'cost', old: t.completion.cost, new: c });
  if (!changes.length) return null;
  const b = writeBatch(db);
  b.update(doc(db, 'expenses', bl.expenseId), { amount: wb, cost: c, marginType: 'rm', marginValue: r2(wb - c), invoiceNo: no, invoiceKey: invoiceKey(no),
    updatedBy: me.user.uid, updatedByName: me.name, updatedAt: serverTimestamp() });
  audit(b, me, { action: 'expense.update', entity: `expenses/${bl.expenseId}`, propertyId: t.propertyId, month: bl.expenseMonth, changes, reason });
  markDirty(b, t.propertyId, bl.expenseMonth, [t.unitId]);
  const billing = { ...bl, wbCharge: wb, profit: r2(wb - c), invoiceNo: no };
  const text = 'changed the charge: ' + changes.map(x => `${x.field} ${x.old} → ${x.new}`).join(', ') + ` · reason: "${reason}"`;
  b.update(doc(db, 'issues', t.id), { billing, ...(c !== r2(t.completion.cost) ? { 'completion.cost': c } : {}),
    audit: arrayUnion({ at: localNow(), by: me.name, role: me.role, text }), updatedAt: serverTimestamp() });
  audit(b, me, { action: 'issue.chargeEdit', entity: `issues/${t.id}`, propertyId: t.propertyId, month: bl.expenseMonth, changes, reason });
  await b.commit();
  return { billing, cost: c };
}

// Remove a charge (with a reason) while its statement is open: the expense line is marked removed and the ticket goes back
// to Pending. Needed before a Director can reopen a charged ticket.
export async function removeCharge(me, t, reason) {
  const bl = t.billing;
  if ((await completedUnitIds(t.propertyId, bl.expenseMonth)).has(t.unitId))
    throw Object.assign(new Error(`The unit's statement for ${monShort(bl.expenseMonth)} is completed (or sent to the Director), so this charge is locked.`), { plain: true });
  const b = writeBatch(db);
  b.update(doc(db, 'expenses', bl.expenseId), { deleted: true, deletedReason: reason, updatedBy: me.user.uid, updatedByName: me.name, updatedAt: serverTimestamp() });
  audit(b, me, { action: 'expense.remove', entity: `expenses/${bl.expenseId}`, propertyId: t.propertyId, month: bl.expenseMonth, changes: [{ field: 'deleted', old: false, new: true }], reason });
  markDirty(b, t.propertyId, bl.expenseMonth, [t.unitId]);
  b.update(doc(db, 'issues', t.id), { billing: { status: 'pending' },
    audit: arrayUnion({ at: localNow(), by: me.name, role: me.role, text: `removed the owner charge (RM ${Number(bl.wbCharge).toFixed(2)}, invoice ${bl.invoiceNo}) · reason: "${reason}"` }), updatedAt: serverTimestamp() });
  audit(b, me, { action: 'issue.chargeRemove', entity: `issues/${t.id}`, propertyId: t.propertyId, month: bl.expenseMonth, changes: [{ field: 'billing', old: 'charged', new: 'pending' }], reason });
  await b.commit();
}

const pad = n => String(n).padStart(2, '0');
export function localNow() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; }

// ---------- Master Record (yearly Excel) ----------
export const MASTER_HEADERS = ['ID', "Owner's Name", "Owner's Email Address1", "Owner's Email Address2", 'Property_Name', 'Unit No', 'Report Date',
  'Google Drive Link', 'Area', 'Description', 'Raised by', 'Status_One', 'Email_Status_One', 'Raise_Date_Time', 'Action Date',
  'Solution/Action Taken', 'Cost Remarks', 'Status_Two', 'Email_Status_Two', 'Fixed by', 'Action_Date_Time', 'Update_By',
  'Cost (RM)', 'WB Charge (RM)', 'Profit (RM)', 'Cost On', 'Invoice No.', 'Charged owner'];
const COL = n => { let s = ''; for (n++; n; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
const C_COST = MASTER_HEADERS.indexOf('Cost (RM)'), C_WB = MASTER_HEADERS.indexOf('WB Charge (RM)'), C_PROFIT = MASTER_HEADERS.indexOf('Profit (RM)');
const tsDate = v => (v?.toDate ? v.toDate() : typeof v === 'string' && v ? new Date(v.length === 10 ? v + 'T00:00:00' : v) : null);
// Real Excel dates, written as Excel day numbers (Malaysia wall-clock time), so the computer's time zone never shifts them
const EPOCH = Date.UTC(1899, 11, 30);
const myDate = v => { const d = tsDate(v); return !d || isNaN(d) ? '' : Math.round((d.getTime() + 8 * 3600e3 - EPOCH) / 1000) / 86400; };
const dayDate = s => (/^\d{4}-\d{2}-\d{2}$/.test(s || '') ? (Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) - EPOCH) / 86400000 : '');

// Property names, units and owners for a list of tickets (owner details only for people allowed to read them; others get
// blanks). Shared by the Master Record download and the Google Sheet sync (lib/maintenance-sheet.js).
export async function masterContext(tickets) {
  const propIds = [...new Set(tickets.map(t => t.propertyId).filter(Boolean))];
  const props = {}, units = {}, propState = {};
  await Promise.all(propIds.map(async pid => {   // all properties at once (18 Nov: faster Sheet sync)
    const [ps, us] = await Promise.all([
      getDoc(doc(db, 'properties', pid)).catch(() => null),
      getDocs(query(collection(db, 'units'), where('propertyId', '==', pid))).catch(() => ({ docs: [] }))]);
    props[pid] = ps?.exists() ? ps.data().name || '' : '';
    propState[pid] = ps?.exists() ? stateOf(ps.data()) : '';
    for (const d of us.docs) units[d.id] = { id: d.id, ...d.data() };
  }));
  const lvl = ownerPrivLevel(), owners = {};
  if (lvl) await Promise.all([...new Set(Object.values(units).map(u => u.ownerId).filter(Boolean))].map(async oid => {
    const p = await readOwnerPriv(oid, lvl).catch(() => ({}));
    owners[oid] = { name: [p.fullName, ...(p.coOwners || []).map(c => c.fullName)].filter(Boolean).join(' & '), email1: p.email || '', email2: (p.coOwners || []).map(c => c.email).find(Boolean) || '' };
  }));
  const ownerOf = t => owners[units[t.unitId]?.ownerId] || { name: '', email1: '', email2: '' };
  return { props, units, owners, ownerOf, propState };
}

// Builds <year>_Master_Record.xlsx fresh every time: a sheet per month with completed customer tickets (up to now), plus Owner list.
export async function downloadMasterRecord(year, onStep = () => {}) {
  const X = await loadXlsxLib();
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${pad(i + 1)}`).filter(m => m <= myMonth());
  const byMonth = {};
  for (const m of months) { onStep(`Reading ${monShort(m)}…`); const rows = await loadMaintenance(m); if (rows.length) byMonth[m] = rows; }
  const tickets = Object.values(byMonth).flat();
  // Units and owners (private details only for people allowed to read them; others get blanks)
  onStep('Reading units and owners…');
  const { props, units, owners, ownerOf } = await masterContext(tickets);

  const wb = X.utils.book_new();
  const bold = { font: { bold: true } };
  const money = { numFmt: '#,##0.00' }, dFmt = 'dd/mm/yyyy', dtFmt = 'dd/mm/yyyy hh:mm';
  for (const m of months.filter(x => byMonth[x])) {
    const rows = byMonth[m];
    const aoa = [new Array(MASTER_HEADERS.length).fill(''), MASTER_HEADERS];
    for (const t of rows) {
      const c = t.completion || {}, bl = t.billing || {}, o = ownerOf(t), charged = bl.status === 'charged';
      aoa.push([t.id, o.name, o.email1, o.email2, t.property || props[t.propertyId] || '', t.unit || '', myDate(t.createdAt),
        t.driveFolderUrl || c.driveFolderUrl || '', t.area || '', t.body || t.title || '', t.raisedBy || '', '', '', myDate(t.createdAt), dayDate(c.actionDate),
        c.solution || '', c.costRemarks || '', '', '', c.fixedByName || '', myDate(c.completedAt), '',
        r2(c.cost), charged ? r2(bl.wbCharge) : '', '', '', charged ? bl.invoiceNo || '' : '', charged ? dayDate(bl.chargedAt) : '']);
    }
    const ws = X.utils.aoa_to_sheet(aoa);
    const last = aoa.length;   // Excel row number of the last ticket
    // Row 1: totals over Cost, WB Charge and Profit. Profit per row = WB Charge - Cost (a formula, like the team's sheet)
    for (const ci of [C_COST, C_WB, C_PROFIT]) ws[COL(ci) + '1'] = { t: 'n', f: `SUM(${COL(ci)}3:${COL(ci)}${Math.max(3, last)})`, s: { ...bold, ...money } };
    for (let r = 3; r <= last; r++) {
      ws[COL(C_PROFIT) + r] = { t: 'n', f: `IF(${COL(C_WB)}${r}="","",${COL(C_WB)}${r}-${COL(C_COST)}${r})`, s: money };
      for (const ci of [C_COST, C_WB]) { const a = COL(ci) + r; if (ws[a]?.t === 'n') ws[a].s = money; }
      for (const [ci, f] of [[6, dFmt], [13, dtFmt], [14, dFmt], [20, dtFmt], [27, dFmt]]) { const a = COL(ci) + r; if (ws[a]?.t === 'n') { ws[a].z = f; ws[a].s = { numFmt: f }; } }
    }
    MASTER_HEADERS.forEach((_, ci) => { const a = COL(ci) + '2'; ws[a].s = bold; });
    ws['!cols'] = MASTER_HEADERS.map(h => ({ wch: /Description|Solution|Drive/.test(h) ? 36 : /Email/.test(h) ? 28 : Math.max(12, h.length + 2) }));
    X.utils.book_append_sheet(wb, ws, monShort(m));
  }
  // Owner list: every unit with a ticket this year (unit, property, owner name, email 1, email 2)
  const seen = [...new Set(tickets.map(t => t.unitId).filter(Boolean))].map(id => units[id]).filter(Boolean)
    .sort((a, b) => (props[a.propertyId] || '').localeCompare(props[b.propertyId] || '') || (a.unitCode || '').localeCompare(b.unitCode || '', 'en', { numeric: true }));
  const ol = X.utils.aoa_to_sheet([['Unit', 'Property', "Owner's Name", "Owner's Email Address1", "Owner's Email Address2"],
    ...seen.map(u => { const o = owners[u.ownerId] || {}; return [u.unitCode || '', props[u.propertyId] || '', o.name || '', o.email1 || '', o.email2 || '']; })]);
  ['A1', 'B1', 'C1', 'D1', 'E1'].forEach(a => { ol[a].s = bold; });
  ol['!cols'] = [{ wch: 14 }, { wch: 24 }, { wch: 30 }, { wch: 30 }, { wch: 30 }];
  X.utils.book_append_sheet(wb, ol, 'Owner list');

  // Freeze panes at G3 on the month sheets (rows 1-2 and columns A-F stay put). SheetJS doesn't write panes, so the
  // sheet XML is patched in the zip.
  const out = X.write(wb, { type: 'array', bookType: 'xlsx' });
  const cfb = X.CFB.read(new Uint8Array(out), { type: 'array' });
  const monthCount = months.filter(x => byMonth[x]).length;
  for (let i = 1; i <= monthCount; i++) {
    const at = cfb.FullPaths.findIndex(p => p.endsWith(`xl/worksheets/sheet${i}.xml`));
    if (at < 0) continue;
    const f = cfb.FileIndex[at];
    const xml = new TextDecoder().decode(f.content).replace('<sheetView workbookViewId="0"/>',
      '<sheetView workbookViewId="0"><pane xSplit="6" ySplit="2" topLeftCell="G3" activePane="bottomRight" state="frozen"/></sheetView>');
    f.content = new TextEncoder().encode(xml); f.size = f.content.length;
  }
  const zip = X.CFB.write(cfb, { fileType: 'zip', type: 'array' });
  download(`${year}_Master_Record.xlsx`, new Blob([new Uint8Array(zip)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  return { months: monthCount, tickets: tickets.length };
}
