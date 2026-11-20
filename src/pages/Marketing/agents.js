// Marketing > Agent Database (20 Nov 2026, Khairul): every read and write for /Marketing/agents.
// agents/{id}: name, company, agency, contact, address, the bank's name and the account's last 4 digits (for the list),
// and the business card files (cardFront / cardBack: { name, fileId, mimeType }, kept in Google Drive > Agent Business Cards).
// agents/{id}/private/bank: holder and full account number, read only with Agent Database Full (and Accounting).
// Firestore rules Draft 0.94. Every save and delete writes an audit log line.
import { collection, doc, getDoc, getDocs, writeBatch, serverTimestamp } from 'firebase/firestore';
// Commission (20 Nov 2026): commDaily / commMonthly (% of a daily or monthly rental, null = not set) and commRev on the agent;
// every change is also saved as agents/{id}/commission/{commRev} (add-only, rules Draft 0.95), the history table.
import { db } from '@/lib/firebase.js';
import { audit } from '@/lib/finance-data.js';

export const AGENCIES = [
  { id: 'property', label: 'Property agent', color: 'blue' },
  { id: 'travel', label: 'Travel agent', color: 'amber' },
  { id: 'mm2h', label: 'MM2H', color: 'green' },
  { id: 'other', label: 'Others', color: 'grey' }
];
export const BANKS = ['Maybank', 'CIMB Bank', 'Public Bank', 'RHB Bank', 'Hong Leong Bank', 'AmBank', 'Bank Islam', 'Bank Rakyat',
  'BSN', 'OCBC Bank', 'UOB', 'HSBC', 'Standard Chartered', 'Alliance Bank', 'Affin Bank', 'Agrobank', 'Other'];

// "Others · Relocation" when an Others agent has a description
export function agencyLabel(a) {
  const t = AGENCIES.find(x => x.id === a.agency);
  if (!t) return '—';
  return a.agency === 'other' && a.agencyOther ? `Others · ${a.agencyOther}` : t.label;
}
export const agencyColor = a => (AGENCIES.find(x => x.id === a.agency) || {}).color || 'grey';

const ref = id => doc(db, 'agents', id);
const bankRef = id => doc(db, 'agents', id, 'private', 'bank');

// A new agent's id, made before saving so the business card can be uploaded into its own Drive folder first
export const newAgentId = () => doc(collection(db, 'agents')).id;

export async function loadAgents() {
  const snap = await getDocs(collection(db, 'agents'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

// Holder and full account number (Agent Database Full and Accounting). null when nothing is saved.
// Commission change history, newest first.
export async function loadCommissionHistory(id) {
  const snap = await getDocs(collection(db, 'agents', id, 'commission'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.rev || 0) - (a.rev || 0));
}

// '' -> null; '10' -> 10; '7.5' -> 7.5 (two decimals at most)
export function pct(v) {
  const t = String(v ?? '').trim();
  return t === '' ? null : Math.round(Number(t) * 100) / 100;
}
export const pctText = v => (v === null || v === undefined || v === '' ? '—' : `${v}%`);

export async function loadBank(id) {
  const s = await getDoc(bankRef(id));
  return s.exists() ? s.data() : null;
}

const digits = v => String(v || '').replace(/\D/g, '');
const card = c => (c && c.fileId ? { name: String(c.name || '').slice(0, 200), fileId: c.fileId, mimeType: c.mimeType || '' } : null);

// f = the form: { name, company, agency, agencyOther, mobile, email, address, bankName, holder, accountNo, cardFront, cardBack, active }
// existing = the saved agent (null when adding). id = the agent's id (newAgentId() when adding).
export async function saveAgent(me, id, f, existing) {
  const acct = digits(f.accountNo);
  const data = {
    name: f.name.trim(), company: (f.company || '').trim(), agency: f.agency,
    agencyOther: f.agency === 'other' ? (f.agencyOther || '').trim() : '',
    mobile: f.mobile.trim(), email: (f.email || '').trim(), address: (f.address || '').trim(),
    bankName: f.bankName || '', acctLast4: acct.slice(-4),
    cardFront: card(f.cardFront), cardBack: card(f.cardBack),
    active: f.active !== false,
    commDaily: pct(f.commDaily), commMonthly: pct(f.commMonthly),
    commRev: existing ? (existing.commRev || 0) : 0,
    createdAt: existing ? existing.createdAt : serverTimestamp(),
    createdBy: existing ? existing.createdBy : me.user.uid,
    createdByName: existing ? (existing.createdByName || '') : me.name,
    updatedAt: serverTimestamp(), updatedBy: me.user.uid, updatedByName: me.name
  };
  const b = writeBatch(db);
  // Commission changed (or set on a new agent): a new history line in the same save, numbered by commRev
  const oldD = existing ? existing.commDaily ?? null : null, oldM = existing ? existing.commMonthly ?? null : null;
  const commChanged = data.commDaily !== oldD || data.commMonthly !== oldM;
  if (commChanged) {
    data.commRev += 1;
    b.set(doc(db, 'agents', id, 'commission', String(data.commRev)), {
      rev: data.commRev, daily: data.commDaily, monthly: data.commMonthly, prevDaily: oldD, prevMonthly: oldM,
      effectiveFrom: f.commFrom || '', note: (f.commNote || '').trim().slice(0, 200),
      at: serverTimestamp(), by: me.user.uid, byName: me.name
    });
  }
  b.set(ref(id), data);
  b.set(bankRef(id), { bank: data.bankName, holder: (f.holder || '').trim(), accountNo: acct, updatedAt: serverTimestamp(), updatedBy: me.user.uid });
  const changes = existing ? ['name', 'company', 'agency', 'agencyOther', 'mobile', 'email', 'address', 'bankName', 'acctLast4']
    .filter(k => (existing[k] || '') !== (data[k] || '')).map(k => ({ field: k, from: k === 'acctLast4' ? '' : existing[k] || '', to: k === 'acctLast4' ? 'changed' : data[k] || '' })) : [];
  if (existing && (existing.cardFront?.fileId || '') !== (data.cardFront?.fileId || '')) changes.push({ field: 'cardFront', from: '', to: 'changed' });
  if (existing && commChanged) changes.push({ field: 'commission', from: `daily ${pctText(oldD)}, monthly ${pctText(oldM)}`, to: `daily ${pctText(data.commDaily)}, monthly ${pctText(data.commMonthly)}` });
  if (existing && (existing.cardBack?.fileId || '') !== (data.cardBack?.fileId || '')) changes.push({ field: 'cardBack', from: '', to: 'changed' });
  audit(b, me, { action: existing ? 'agent.update' : 'agent.create', entity: `agents/${id}`, changes, reason: data.name });
  await b.commit();
  return { id, ...data };
}

// Directors only, with its commission history. The business card files stay in Drive.
export async function deleteAgent(me, a) {
  const hist = await getDocs(collection(db, 'agents', a.id, 'commission'));
  const b = writeBatch(db);
  hist.docs.forEach(d => b.delete(d.ref));
  b.delete(bankRef(a.id));
  b.delete(ref(a.id));
  audit(b, me, { action: 'agent.delete', entity: `agents/${a.id}`, reason: a.name || '' });
  await b.commit();
}
