// lib/agreements/starters.js — ready-made forms from the "Form Name / Info need to Fill up" sheet.
// They are only a starting point: once created, every field can be changed in the form builder.
import { newField } from './fields.js';
import { toStored } from './formula.js';

const S = label => ({ type: 'section', label });
const T = (label, extra) => ({ type: 'text', label, ...extra });
const tenant = [
  S('Tenant Details'),
  T('Name of Tenant', { required: true }),
  { type: 'email', label: 'Tenant Email' },
  { type: 'phone', label: 'Tenant Phone' },
  { type: 'textarea', label: 'Tenant Correspondence Address' },
  T('Tenant NRIC/Passport No', { required: true }),
  { type: 'file', label: 'Tenant IC/Passport Copy' }
];
const landlord = [
  S('Landlord Details'),
  T('Name of Landlord', { required: true }),
  { type: 'phone', label: 'Landlord Phone' },
  { type: 'email', label: 'Landlord Email' },
  { type: 'textarea', label: 'Landlord Correspondence Address' },
  T('Landlord NRIC/Registration No'),
  { type: 'file', label: 'Landlord IC/Registration Document' }
];
const property = [
  S('Property Details'),
  { type: 'textarea', label: 'Demised Premises', required: true },
  { type: 'dropdown', label: 'Tenancy Period', options: ['1 year', '2 years'], allowOther: true },
  { type: 'dropdown', label: 'Option to Renew', options: ['1 year', 'Non-renewable', 'To be mutually agreed before expiration'] },
  { type: 'dropdown', label: 'Period of Renewal Notice', options: ['1 month in advance'], allowOther: true },
  { type: 'date', label: 'Commencement Date', required: true },
  { type: 'date', label: 'Completion Date', required: true },
  { type: 'currency', label: 'Monthly Rental', required: true },
  { type: 'currency', label: 'Advance Rental' },
  { type: 'formula', label: 'Security Deposit (Rent)', expr: '[Monthly Rental] * 2', resultType: 'currency', help: '2 months of rent' },
  { type: 'currency', label: 'Security Deposit (Utilities)' },
  { type: 'currency', label: 'Security Deposit (Access Card)' },
  { type: 'formula', label: 'Total Payable on Signing', resultType: 'currency',
    expr: '[Advance Rental] + [Security Deposit (Rent)] + [Security Deposit (Utilities)] + [Security Deposit (Access Card)]' },
  S('Payment'),
  T('Account Name'), T('Account No'), T('Bank Name'),
  { type: 'dropdown', label: 'Manner of Payment', options: ['On or before the 1st of every month', 'On or before the 7th of every month', '7 days before the upcoming month'] },
  { type: 'radio', label: 'Carpark', options: ['Yes', 'No'] },
  { type: 'dropdown', label: 'Permitted Use', options: ['Residential', 'Mixed-Use', 'Short-Term Stay'] }
];
const special = [S('Special Conditions'), ...[1, 2, 3, 4, 5].map(n => ({ type: 'textarea', label: `Special Condition ${n}` }))];

export const STARTERS = [
  { key: 'general', name: 'General Tenancy', fields: [...tenant, ...landlord, ...property, ...special,
    S('Signing'), { type: 'date', label: 'Date of Agreement', default: 'TODAY' }, { type: 'signature', label: 'Landlord Signature' }] },
  { key: 'widebed', name: 'Widebed Tenancy Agreement', fields: [...tenant, ...property,
    S('Signing'), { type: 'date', label: 'Date of Agreement', default: 'TODAY' }, { type: 'signature', label: 'Company Signature' }] }
];

// Real fields (with ids) from a starter; formulas are saved with ids like any other.
export function starterFields(key) {
  const starter = STARTERS.find(s => s.key === key);
  if (!starter) return [];
  const fields = [];
  for (const spec of starter.fields) {
    const { expr, ...rest } = spec;
    fields.push({ ...newField(spec.type, fields, spec.label), ...rest, _expr: expr });
  }
  for (const f of fields) { if (f._expr) f.expr = toStored(f._expr, fields); delete f._expr; }
  return fields;
}
