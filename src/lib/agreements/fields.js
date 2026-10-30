// lib/agreements/fields.js — the field types a form can have, and helpers for values, visibility and checks.
import { todayISO } from './formula.js';

export const FIELD_TYPES = [
  { type: 'section', label: 'Section heading', hint: 'A title between groups of fields' },
  { type: 'text', label: 'Text' },
  { type: 'textarea', label: 'Long text' },
  { type: 'email', label: 'Email' },
  { type: 'phone', label: 'Phone' },
  { type: 'number', label: 'Number' },
  { type: 'currency', label: 'Money (RM)' },
  { type: 'date', label: 'Date' },
  { type: 'dropdown', label: 'Dropdown' },
  { type: 'radio', label: 'Choice buttons' },
  { type: 'checkbox', label: 'Tick box' },
  { type: 'signature', label: 'Signature' },
  { type: 'image', label: 'Image' },
  { type: 'file', label: 'File attachment', hint: 'PDF or photo, e.g. IC copy. Kept with the record, not printed.' },
  { type: 'formula', label: 'Formula', hint: 'Worked out from other fields' }
];
export const TYPE_LABEL = Object.fromEntries(FIELD_TYPES.map(t => [t.type, t.label]));
export const RESULT_TYPES = [
  { value: 'number', label: 'Number' }, { value: 'currency', label: 'Money (RM)' }, { value: 'date', label: 'Date' },
  { value: 'text', label: 'Text' }, { value: 'boolean', label: 'Yes / No' }
];

// Record statuses. "submitted" = sent in through a fill-in link, waiting for staff to check.
export const STATUS = { draft: 'Draft', submitted: 'To check', completed: 'Completed', archived: 'Archived' };
export const STATUS_PILL = { draft: 'amber', submitted: 'blue', completed: 'green', archived: 'grey' };

export const hasValue = f => f.type !== 'section';
// Can be placed on an agreement page (attachments are kept with the record, not printed).
export const placeable = f => hasValue(f) && f.type !== 'file';
export const hasOptions = f => f.type === 'dropdown' || f.type === 'radio';
export const isEditableInGrid = f => !['section', 'formula', 'signature', 'image', 'file'].includes(f.type);
export const onForm = f => f.onForm !== false;

export function newId(prefix = 'f_') {
  return prefix + Math.random().toString(36).slice(2, 7) + Date.now().toString(36).slice(-4);
}

// Labels must be unique (formulas refer to them by name) and can't contain [ or ].
export function labelProblem(label, fields, selfId) {
  const l = String(label || '').trim();
  if (!l) return 'Give the field a name.';
  if (/[[\]]/.test(l)) return 'A name can\'t contain [ or ].';
  if (fields.some(f => f.id !== selfId && String(f.label).trim().toLowerCase() === l.toLowerCase())) return 'Another field already has this name.';
  return '';
}

export function newField(type, fields = [], label) {
  const base = label || TYPE_LABEL[type] || 'Field';
  let name = base, n = 2;
  while (fields.some(f => String(f.label).toLowerCase() === name.toLowerCase())) name = `${base} ${n++}`;
  return {
    id: newId(), type, label: name, placeholder: '', default: '', help: '', required: false, onForm: true,
    options: hasOptions({ type }) ? ['Option 1', 'Option 2'] : [], allowOther: false,
    showIf: null, format: {}, expr: '', resultType: 'number'
  };
}

// Starting values for a new record (a date default of TODAY becomes today's date).
export function defaultValues(fields) {
  const out = {};
  for (const f of fields) {
    if (!hasValue(f) || f.type === 'formula') continue;
    let v = f.default ?? '';
    if (f.type === 'date' && String(v).toUpperCase() === 'TODAY') v = todayISO();
    else if (f.type === 'number' || f.type === 'currency') v = v === '' ? '' : Number(v);
    else if (f.type === 'checkbox') v = v === true || v === 'true';
    else if (['signature', 'image', 'file'].includes(f.type)) v = '';
    out[f.id] = v;
  }
  return out;
}

// Believable values for the designer preview when no record is picked.
export function sampleValues(fields) {
  const out = {};
  for (const f of fields) {
    if (!hasValue(f) || f.type === 'formula') continue;
    if (f.default !== '' && f.default !== undefined) { Object.assign(out, defaultValues([f])); continue; }
    out[f.id] = {
      number: 12, currency: 1500, date: todayISO(), checkbox: true, email: 'name@example.com', phone: '012-345 6789',
      dropdown: f.options?.[0] || '', radio: f.options?.[0] || '', signature: '', image: '', file: ''
    }[f.type] ?? f.label;
  }
  return out;
}

// Whether a field shows on the form right now (its "Show only when" rule).
export function isShown(f, values) {
  if (!onForm(f)) return false;
  const c = f.showIf;
  if (!c || !c.fieldId) return true;
  const v = values[c.fieldId];
  const s = v === true ? 'true' : v === false ? 'false' : String(v ?? '');
  if (c.op === 'filled') return s !== '' && s !== 'false';
  if (c.op === 'notEquals') return s !== String(c.value ?? '');
  return s === String(c.value ?? '');
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[\d\s()-]{7,20}$/;
// Problems that stop a record being marked completed: { fieldId: message }.
export function validate(fields, values) {
  const errors = {};
  for (const f of fields) {
    if (!hasValue(f) || f.type === 'formula' || !isShown(f, values)) continue;
    const v = values[f.id];
    const empty = v === '' || v === null || v === undefined || (f.type === 'checkbox' && !v);
    if (empty) { if (f.required) errors[f.id] = 'This is required.'; continue; }
    if (f.type === 'email' && !EMAIL.test(v)) errors[f.id] = 'This email address doesn\'t look right.';
    if (f.type === 'phone' && !PHONE.test(v)) errors[f.id] = 'This phone number doesn\'t look right.';
    if ((f.type === 'number' || f.type === 'currency') && !Number.isFinite(Number(v))) errors[f.id] = 'Enter a number.';
  }
  return errors;
}

// The name a record shows under: the first filled text field.
export function recordTitle(fields, values) {
  for (const f of fields) if (['text', 'email'].includes(f.type) && String(values[f.id] ?? '').trim()) return String(values[f.id]).trim().slice(0, 80);
  return 'Untitled';
}
