// Approve & complete one unit's statement. Shared by Month-end payout (a Director completing a unit directly) and
// Statement Approvals (a Director approving what Finance sent). Finance never completes: it sends (approvals/{id}).
// This is the money step: the statement is saved frozen, the payout goes to the history, a negative balance carries forward
// into next month, and the month summary is updated. It runs in ONE batch, so it all happens or none of it does.
import { collection, doc, getDoc, getDocs, writeBatch, serverTimestamp, query, where } from 'firebase/firestore';
import { db } from './firebase.js';
import { nextMonth, r2 } from './engine.js';
import { audit, statementId, monthSummary } from './finance-data.js';
import { markDirty } from './summary-data.js';
import { monthName } from './format.js';

// This unit's expense lines for another month (the brought-forward line lives there).
async function unitExpenses(propertyId, unitId, month) {
  const snap = await getDocs(query(collection(db, 'expenses'), where('unitId', '==', unitId), where('month', '==', month)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(e => e.propertyId === propertyId);
}

// The month document is a summary: open, partial (some units completed) or completed (every unit with a statement).
export function monthSummaryDoc({ propertyId, month, unitIds, doneIds, summary, me }) {
  const sum = monthSummary(unitIds, doneIds);
  return { propertyId, month, ...sum,
    totals: { fixedRent: r2(summary.fixed), profitSharing: r2(summary.share), balToPay: r2(summary.balToPay), carried: r2(summary.carried) },
    updatedBy: me.user.uid, updatedByName: me.name, updatedAt: serverTimestamp(),
    ...(sum.status === 'completed' ? { completedBy: me.user.uid, completedByName: me.name, completedAt: serverTimestamp() } : {}) };
}

// r = the unit's statement row (a draft worked out by the engine, or the frozen copy Finance sent).
// unitIds = every unit of the month; doneIds = the units already completed; summary = paymentSummary of all rows.
// approval = the approvals/{id} document when a Director is approving something Finance sent.
// Throws an Error with a message for the person; Firestore errors pass through. Returns { monthDoc, again }.
export async function completeStatement({ r, propertyId, month, me, unitIds, doneIds, summary, overrideReason = '', approval = null }) {
  const next = nextMonth(month), id = statementId(r.unitId, month);
  const [stSnap, nextSnap] = await Promise.all([getDoc(doc(db, 'statements', id)), getDoc(doc(db, 'statements', statementId(r.unitId, next)))]);
  const prev = stSnap.exists() ? stSnap.data() : null;
  const again = prev?.status === 'reopened';
  if (r.status === 'completed' || prev?.status === 'completed') throw new Error(`${r.unitCode} is already completed.`);
  if (me.role !== 'director') throw new Error('Only a Director approves a statement.');
  if (again && !overrideReason.trim()) throw new Error('Add the reason for the new revision.');
  if (nextSnap.exists() && nextSnap.data().status === 'completed') throw new Error(`${r.unitCode} is already completed for ${monthName(next)}, so its balance can't carry forward into it.`);

  // Next month's unit is frozen (sent to the Director): its brought-forward line can't be added or removed until it is decided.
  const nextSent = await getDoc(doc(db, 'approvals', statementId(r.unitId, next)));
  const nextFrozen = nextSent.exists() && nextSent.data().status === 'submitted';

  const b = writeBatch(db);
  let nextChanged = r.totals.payout < 0;
  // A Brought Forward line made earlier (from Finance's statement for this month) goes if the PMS payout is no longer negative
  for (const e of (await unitExpenses(propertyId, r.unitId, next)).filter(e => e.auto && e.sourceMonth === month && !e.deleted))
    if (!(r.totals.payout < 0)) {
      if (nextFrozen) throw new Error(`${r.unitCode} is sent to the Director for ${monthName(next)}. Approve or send back ${monthName(next)} first.`);
      b.update(doc(db, 'expenses', e.id), { deleted: true, auto: true, deletedReason: `${r.unitCode} ${monthName(month)} completed in the PMS` });
      nextChanged = true;
    }
  b.set(doc(db, 'payoutHistory', id), { propertyId, unitId: r.unitId, unitCode: r.unitCode, month, year: month.slice(0, 4),
    source: 'pms', totalIncome: r.totals.totalReceivable, charges: r2(r.totals.totalReceivable - r.totals.payout), payout: r.totals.payout, fixed: r.fixed, remark: '',
    fileName: null, importedBy: me.user.uid, importedByName: me.name, importedAt: serverTimestamp() });
  // The old revision was saved when the unit was reopened (the rules check it exists before allowing the new revision)
  b.set(doc(db, 'statements', id), { ...r, status: 'completed', revision: (prev?.revision || 0) + 1,
    ...(again ? { overrideReason: overrideReason.trim() } : {}),
    ...(approval ? { sentBy: approval.submittedBy || null, sentByName: approval.submittedByName || '', sentAt: approval.submittedAt || null } : {}),
    completedBy: me.user.uid, completedByName: me.name, completedAt: serverTimestamp() });
  if (r.totals.payout < 0 && nextFrozen) throw new Error(`${r.unitCode} is sent to the Director for ${monthName(next)}, so its negative balance can't carry forward yet. Approve or send back ${monthName(next)} first.`);
  if (r.totals.payout < 0)   // ARR-18: negative balance carried forward automatically
    b.set(doc(db, 'expenses', `bf_${r.unitId}_${next}`), { propertyId, unitId: r.unitId, date: `${next}-01`, month: next,
      kind: 'broughtForward', type: 'broughtForward', description: `Brought forward from ${monthName(month)}`, amount: r2(-r.totals.payout),
      auto: true, sourceStatementId: id, sourceMonth: month, files: [], deleted: false,
      createdBy: me.user.uid, createdByName: me.name, createdAt: serverTimestamp() });
  const monthDoc = monthSummaryDoc({ propertyId, month, unitIds, doneIds: new Set([...doneIds, r.unitId]), summary, me });
  b.set(doc(db, 'months', `${propertyId}_${month}`), monthDoc, { merge: true });
  // The unit's summary now comes from the completed statement; the next month's changes with its brought-forward line
  markDirty(b, propertyId, month, [r.unitId]);
  if (nextChanged) markDirty(b, propertyId, next, [r.unitId]);
  if (approval) b.update(doc(db, 'approvals', id), { status: 'approved', approvedBy: me.user.uid, approvedByName: me.name, approvedAt: serverTimestamp() });
  audit(b, me, { action: again ? 'statement.override' : 'statement.complete', entity: `statements/${id}`,
    propertyId, month, changes: [{ field: 'status', old: again ? 'reopened' : approval ? 'sent' : 'open', new: 'completed' }], reason: overrideReason.trim() });
  await b.commit();
  return { monthDoc, again };
}
