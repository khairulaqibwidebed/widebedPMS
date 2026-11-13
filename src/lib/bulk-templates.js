// Bulk Upload templates: the columns each kind of file needs, in the template's order (13 Nov 2026).
// Used by the Converter page (Portfolio > Bulk Upload > Converter) to turn any Excel or CSV into the template layout,
// and by Bulk Upload for the unit type match.
//
// KEEP IN STEP WITH BulkUpload.vue: each `header` is the column name Bulk Upload reads first (mapOwnerRow, mapPropertyRow,
// mapBookingRow), and FILE_LAYOUT there finds the header row by the first column below. When a header changes there,
// change it here too (and in public/templates/*.xlsx).
//
// Column fields:
//   header  the exact template header (written into the converted file)
//   alias   other names the Converter matches automatically (case, spaces and symbols are ignored)
//   req     Bulk Upload needs it on every row
//   type    'text' (default), 'date' (written yyyy-mm-dd), 'money' (number, 2 decimals), 'pct', 'email',
//           'state' (written as the full state name), 'unitType' (matched to the unit type list), 'id' (kept as text: IC, phone, account no.)

import { UNIT_TYPES } from '@/lib/portfolio-data.js';
import { normState } from '@/lib/states.js';

export const TEMPLATES = {
  properties: {
    label: 'Properties',
    sheet: 'Properties',
    file: 'Widebed_Property_List_Template.xlsx',
    // Same rows as the template: three title rows, a blank row 4, the green header in row 5, data from row 6
    titles: ['Widebed PMS · Property list (one property per row)',
      'Made with the Converter. Check it, then upload it on Portfolio > Bulk Upload > Properties.'],
    headerRow: 5,
    cols: [
      { header: 'Property Name', alias: ['Property', 'Name', 'Property Name Full', 'Building', 'Project'], req: true },
      { header: 'Short Code', alias: ['Code', 'Property Code', 'Prefix', 'Short Name'], req: true },
      { header: 'Address', alias: ['Full Address', 'Street', 'Location'] },
      { header: 'City', alias: ['Town', 'Area'] },
      { header: 'State', alias: ['Negeri', 'Region'], req: true, type: 'state' },
      { header: 'eZee Account No', alias: ['eZee Account', 'eZee ID', 'Hotel Code'], type: 'id' },
      { header: 'Name in eZee Report', alias: ['eZee Name', 'eZee Property Name'] }
    ]
  },
  owners: {
    label: 'Unit owners',
    sheet: 'Owners',
    file: 'Widebed_Owner_List_Template.xlsx',
    // Row 4: "Property (name or code)" in A4, the property in B4 (Bulk Upload picks the property from it)
    titles: ['Widebed PMS · Unit owner list (one unit per row)',
      'Made with the Converter. Check it, then upload it on Portfolio > Bulk Upload > Unit owners.'],
    propertyRow: 4,
    headerRow: 5,
    // Rows from a cell saying this onwards are left out (Finance's Owner List lists past owners below it)
    stopAt: 'TERMINATED UNIT',
    cols: [
      { header: 'Room Type/Unit List', alias: ['Unit', 'Unit No', 'Unit Number', 'Unit Code', 'Room', 'Room No', 'Lot', 'Lot No'], req: true },
      { header: 'Owner Name 1', alias: ['Owner Name', 'Owner', 'Name', 'Full Name', 'Owner Full Name', 'Landlord', 'Landlord Name'], req: true },
      { header: 'IC / Passport No', alias: ['IC', 'IC No', 'NRIC', 'Passport', 'Passport No', 'IC Passport', 'BRN', 'IC 1', 'IC / Passport No 1'], type: 'id' },
      { header: 'Contact No 1', alias: ['Contact No', 'Contact', 'Phone', 'Phone No', 'Mobile', 'HP', 'H/P', 'Tel', 'WhatsApp'], type: 'id' },
      { header: 'Email Address 1', alias: ['Email', 'Email Address', 'E-mail', 'Owner Email'], type: 'email' },
      { header: 'Bank Name', alias: ['Bank'] },
      { header: 'Account Holder Name', alias: ['Account Holder', 'Account Name', 'Name of Account Holder', 'Beneficiary'] },
      { header: 'Bank Account No', alias: ['Bank Account', 'Bank Account Number', 'Account No', 'Account Number', 'Acc No'], type: 'id' },
      { header: 'Service Fees%', alias: ['Service Fee', 'Service Fees', 'Percentage %', 'Percentage', 'Profit Sharing', 'Management Fee'], type: 'pct' },
      { header: 'Utilities %', alias: ['Utilities Sharing', 'Utility %', 'Utility Fee', 'Utilities'], type: 'pct' },
      { header: 'Remark', alias: ['Remarks', 'Notes', 'Note', 'Comment'] },
      { header: 'Unit Type', alias: ['Room Type', 'Type of Unit', 'Unit Layout', 'Layout', 'Bedrooms'], type: 'unitType' },
      { header: 'Owner Name 2', alias: ['Joint Owner', 'Joint Owner Name', 'Co-owner', 'Co Owner', 'Second Owner', 'Owner 2'] },
      { header: 'IC / Passport No 2', alias: ['IC 2', 'IC No 2', 'NRIC 2', 'Joint Owner IC', 'Passport No 2'], type: 'id' },
      { header: 'Contact No 2', alias: ['Phone 2', 'Contact 2', 'Mobile 2', 'Joint Owner Phone', 'Joint Owner Contact'], type: 'id' },
      { header: 'Email Address 2', alias: ['Email 2', 'Joint Owner Email'], type: 'email' },
      // One per unit (Finance's Owner List column G, e.g. 300-C013); saved on the unit as autocountAcc
      { header: 'Acc No. in Autocount', alias: ['Autocount', 'Autocount Acc No', 'Autocount Account', 'Autocount No', 'Creditor Code', 'Creditor Account'], type: 'id' }
    ]
  },
  bookings: {
    label: 'Booking details',
    sheet: 'Booking Details',
    file: '',
    // Willow's Booking Details sheet: the header is the first row
    titles: [],
    headerRow: 1,
    cols: [
      { header: 'ID', alias: ['Booking ID', 'Booking No', 'Reservation No'] },
      { header: 'Name', alias: ['Guest', 'Guest Name', 'Tenant', 'Tenant Name', 'Full Name'], req: true },
      { header: 'IC/passport number', alias: ['IC', 'IC / Passport', 'Passport', 'NRIC', 'IC No'], type: 'id' },
      { header: 'Phone/WhatsApp', alias: ['Phone', 'Contact', 'Contact No', 'Mobile', 'WhatsApp', 'HP'], type: 'id' },
      { header: 'Email', alias: ['Email Address', 'E-mail', 'Guest Email'], type: 'email' },
      { header: 'Booking source', alias: ['Source', 'Channel', 'OTA'] },
      { header: 'Property Name', alias: ['Property', 'Building', 'Project'], req: true },
      { header: 'Unit Number', alias: ['Unit', 'Unit No', 'Room', 'Room No', 'Unit Code'], req: true },
      { header: 'Check in', alias: ['Check-in', 'Check In Date', 'Arrival', 'Start Date', 'Move In', 'From'], req: true, type: 'date' },
      { header: 'Check out', alias: ['Check-out', 'Check Out Date', 'Departure', 'End Date', 'Move Out', 'To'], req: true, type: 'date' },
      { header: 'Rental amount', alias: ['Rental', 'Rent', 'Amount', 'Monthly Rent', 'Price', 'Total'], type: 'money' },
      { header: 'Renewal Date', alias: ['Renewal'], type: 'date' },
      { header: 'Rental Status', alias: ['Status'] },
      { header: 'Amount of deposit', alias: ['Deposit', 'Deposit Amount', 'Security Deposit'], type: 'money' },
      { header: 'Owner Email', alias: ['Landlord Email'], type: 'email' },
      { header: 'Move_In_Status', alias: ['Move In Status'] },
      { header: 'Move_Out_Status', alias: ['Move Out Status'] },
      { header: 'Main Door Passcode', alias: ['Passcode', 'Door Passcode', 'Door Code'], type: 'id' },
      { header: 'Current Expiry Date', alias: ['Passcode Expiry', 'Expiry Date'], type: 'date' },
      { header: 'Next Door Passcode', alias: ['Next Passcode'], type: 'id' },
      { header: 'Next Expiry Date', alias: ['Next Expiry'], type: 'date' },
      { header: 'Password Status', alias: ['Passcode Status'] },
      { header: 'Whatsapp Group Link', alias: ['WhatsApp Group', 'Group Link'] },
      { header: 'Remark', alias: ['Remarks', 'Notes', 'Note'] },
      { header: 'Electricity', alias: ['Electric', 'TNB', 'Electricity Bill'], type: 'money' },
      { header: 'Water', alias: ['Water Bill'], type: 'money' },
      { header: 'Sewerage', alias: ['IWK', 'Indah Water', 'Sewerage Bill'], type: 'money' },
      { header: 'Electric Bill Period', alias: ['Bill Period', 'Utility Period'] },
      { header: 'Invoice Bill', alias: ['Invoice', 'Invoice Link'] }
    ]
  }
};

// Same as Bulk Upload: case, spaces and symbols are ignored
export const normKey = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

// A date cell -> 'yyyy-mm-dd' ('' when it can't be read). Same reading as Bulk Upload's toIso: typed text is day first (Malaysia).
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
export function toIsoDate(v) {
  const t = String(v ?? '').trim(); if (!t) return '';
  const pad = n => String(n).padStart(2, '0'), year = y => (y < 100 ? 2000 + y : y);
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = t.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
  if (m) return `${year(+m[3])}-${pad(m[2])}-${pad(m[1])}`;
  m = t.match(/^(\d{1,2})[ -]([A-Za-z]{3})[a-z]*[ -,]*(\d{2,4})/);
  if (m && MONTHS.includes(m[2].toLowerCase())) return `${year(+m[3])}-${pad(MONTHS.indexOf(m[2].toLowerCase()) + 1)}-${pad(m[1])}`;
  return '';
}

// "RM 1,300.50" -> 1300.5; null when there is no number
export function toMoney(v) {
  const t = String(v ?? '').replace(/[^0-9.\-]/g, '');
  if (!t || isNaN(Number(t))) return null;
  return Math.round(Number(t) * 1000) / 1000;
}

export const toState = v => normState(v);

// Unit type text from a file -> one of the unit types ('' when nothing fits).
// `list` = UNIT_TYPES plus the types added on Portfolio (loadUnitTypes). "2BR", "2 Bedroom", "2-bed" -> "2 bedrooms";
// "studio unit" -> "Studio"; "Dual-Key" -> "Dual key". "Other" is only taken when written as it is.
// Only plain spellings are bent onto a list type: "Superior Studio King" or "Single Room" are room types of their own
// (Finance's Owner List headings, eZee's names) and stay as written; they are added to the list on saving.
export function matchUnitType(text, list = UNIT_TYPES) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim(); if (!t) return '';
  const all = [...new Set([...UNIT_TYPES, ...(list || [])].filter(Boolean))];
  const k = normKey(t);
  const exact = all.find(x => normKey(x) === k); if (exact) return exact;
  const rest = '(\\s*(unit|apartment|apt|type))?';
  if (new RegExp(`^studio${rest}$`, 'i').test(t)) return 'Studio';
  if (new RegExp(`^dual\\s*-?\\s*key${rest}$`, 'i').test(t)) return 'Dual key';
  if (new RegExp(`^pent\\s*house${rest}$`, 'i').test(t)) return 'Penthouse';
  const words = { one: 1, two: 2, three: 3, four: 4, five: 5 };
  const m = new RegExp(`^(\\d+|one|two|three|four|five)\\s*-?\\s*(b|br|bd|bed|beds|bedroom|bedrooms|bedrm|rooms?)${rest}$`, 'i').exec(t);
  if (m) {
    const n = Number(m[1]) || words[m[1].toLowerCase()];
    const want = normKey(n === 1 ? '1 bedroom' : `${n} bedrooms`);
    const hit = all.find(x => normKey(x) === want); if (hit) return hit;
  }
  return '';
}

// A unit type that is not on the list yet, as it will be saved ("double  room" -> "double room"; capitals kept as written)
export const newUnitType = text => String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);

// Finance's Owner List groups units under heading rows ("Double Room", "Twin Room", "Superior Studio King"): a row with
// one cell filled, some letters and no unit code. Returns the heading text, '' for a heading that is the property's name
// (e.g. "D'Majestic Place by Widebed", not a type), or null for an ordinary row.
// skipNames: property names (and the sheet name) that make a heading the property's title.
export function sectionHeading(cells, skipNames = []) {
  const filled = (cells || []).map(c => String(c ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (filled.length !== 1) return null;
  const t = filled[0];
  if (!/[a-z]/i.test(t) || t.length > 40) return null;
  if (/\d+\s*-\s*\d+/.test(t)) return null;   // a unit code like DM 07-10
  const k = normKey(t);
  if (skipNames.some(n => { const m = normKey(n); return m.length >= 3 && k.includes(m); })) return '';
  return t;
}
