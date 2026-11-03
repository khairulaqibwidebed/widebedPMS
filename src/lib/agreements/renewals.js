// lib/agreements/renewals.js — agreement end dates, renewal status and reminders.
//
// A form turns tracking on in Agreement Setup → Forms → Renewal:
//   form.renewal = { on: true, endFieldId, roles: ['operations'], people: [{ uid, name }] }
//                  roles / people = whole departments and named staff who get every reminder for this form
//                  (older forms may still have role: 'operations'; rolesOf() reads both)
// Each record keeps:
//   endDate   'YYYY-MM-DD' or ''      copied from the end-date field when saved (so the daily check can read it)
//   inCharge  [{ uid, name }]         the people looking after this agreement (older records: one { uid, name })
//   renewal   { state, note, renewedTo, renewedFrom, sent: [60, 30, 7, 0] }
//             state: '' (running) | 'renewing' | 'renewed' | 'notRenewing'
// The daily Apps Script (dailyRenewals in Code.gs) sends the PMS notification and email 60, 30 and 7 days before
// the end date and on the day itself, to the record's maker, the people in charge, and the form's roles and people.
import { computeValues, ISO_DATE } from './formula.js';
import { valueType } from './format.js';

export const REMIND_DAYS = [60, 30, 7, 0];
export const SOON_DAYS = 60;

// Fields that can hold the end date: date fields, and formulas that give a date.
export const endFieldsOf = form => (form?.fields || []).filter(f => valueType(f) === 'date' && f.type !== 'section');
// Fields that can hold a unit/room number: text and dropdown fields.
export const unitFieldsOf = form => (form?.fields || []).filter(f => ['text', 'dropdown'].includes(f.type));

export const tracked = form => !!(form?.renewal?.on && form.renewal.endFieldId);

// Lists, whatever shape was saved.
export const inChargeOf = rec => (Array.isArray(rec?.inCharge) ? rec.inCharge : rec?.inCharge?.uid ? [rec.inCharge] : []);
export const rolesOf = renewal => (Array.isArray(renewal?.roles) ? renewal.roles : renewal?.role ? [renewal.role] : []);
export const peopleOf = renewal => (Array.isArray(renewal?.people) ? renewal.people : []);

// The record's end date worked out from its answers (formulas included). '' when blank or not tracked.
export function endDateOf(form, values) {
  if (!tracked(form)) return '';
  const v = computeValues(form.fields, values || {})[form.renewal.endFieldId];
  return typeof v === 'string' && ISO_DATE.test(v) ? v : '';
}

// The record's unit number, if the form has a unit field chosen in Renewal settings. '' if not set.
export function unitOf(form, values) {
  const fieldId = form?.renewal?.unitFieldId;
  if (!fieldId) return '';
  const v = computeValues(form.fields, values || {})[fieldId];
  return typeof v === 'string' ? v.trim() : '';
}

// Today in Malaysia as YYYY-MM-DD, and whole days from today to a date (negative = already ended).
export function todayKL() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
export function daysLeft(iso, today = todayKL()) {
  if (!ISO_DATE.test(iso || '')) return null;
  const d = s => { const [y, m, dd] = s.split('-').map(Number); return Date.UTC(y, m - 1, dd); };
  return Math.round((d(iso) - d(today)) / 86400000);
}

// Where an agreement stands, for the tracker and the record page.
export function trackState(record, today) {
  const st = record.renewal?.state || '';
  const days = daysLeft(record.endDate, today);
  if (st === 'renewed') return { key: 'renewed', label: 'Renewed', pill: 'green', days };
  if (st === 'notRenewing') return { key: 'notRenewing', label: 'Not renewing', pill: 'grey', days };
  if (st === 'renewing') return { key: 'renewing', label: 'Renewing', pill: 'blue', days };
  if (days === null) return { key: 'noDate', label: 'No end date', pill: 'grey', days };
  if (days < 0) return { key: 'ended', label: 'Ended', pill: 'red', days };
  if (days <= SOON_DAYS) return { key: 'soon', label: 'Ending soon', pill: 'amber', days };
  return { key: 'active', label: 'Running', pill: 'green', days };
}

// "in 12 days", "today", "5 days ago".
export function daysText(days) {
  if (days === null || days === undefined) return '—';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days > 0) return `in ${days} days`;
  return days === -1 ? 'yesterday' : `${-days} days ago`;
}
