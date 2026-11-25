// What counts as paid on a booking (19 Nov 2026, Khairul): only offline payments Finance has Checked.
// Long-term months take the payment's "For month" (forMonth, YYYY-MM); older payments without one count in their Payment Date's month.
export const payCounts = p => p?.status === 'Checked';
export const payMonth = p => (/^\d{4}-\d{2}$/.test(p?.forMonth || '') ? p.forMonth : String(p?.date || '').slice(0, 7));

// Carry forward (23 Nov 2026, Khairul): a lease's months in order; once a month's total is reached, what is paid over it goes to
// the next month (and on). Nothing is saved: it is worked out from the Checked payments each time.
// months: [{ m, paid, due }] (paid = that month's own Checked payments, due = rent + that month's charges)
// returns the same rows plus carryIn, carryOut, have (paid + carryIn) and status ('paid' | 'part' | 'unpaid').
// A month with nothing due passes everything on. The last month's carryOut is what was paid over the whole stay.
export function withCarry(months) {
  let carry = 0;
  return months.map(x => {
    const carryIn = carry, have = Math.round((x.paid + carryIn) * 1000) / 1000;
    const out = x.due > 0 ? Math.max(0, have - x.due) : have;
    carry = Math.round(out * 1000) / 1000;
    const status = x.due > 0 ? (have >= x.due - 0.005 ? 'paid' : have > 0 ? 'part' : 'unpaid') : (x.paid > 0 ? 'paid' : 'unpaid');
    return { ...x, carryIn, carryOut: carry, have, status };
  });
}
// Rental / Utilities (23 Nov 2026, Khairul): a payment may pay rent and utility bills in one transfer (parts, lib/utility-bills.js).
// Only its Rental part counts towards the rent; a payment with no parts is all Rental (older payments, no data change).
// Several payment types in one payment (24 Nov 2026, Khairul): a payment may hold several Rental lines, each for its own month.
// The Rental part(s) as [{ m, amount }]; a Rental line with no month, or a payment with no parts, counts in payMonth.
export function rentalParts(p) {
  if (!Array.isArray(p?.parts) || !p.parts.length) return [{ m: payMonth(p), amount: Number(p?.amount) || 0 }];
  return p.parts.filter(x => x.type === 'rental').map(x => ({ m: /^\d{4}-\d{2}$/.test(x.forMonth || '') ? x.forMonth : payMonth(p), amount: Number(x.amount) || 0 }));
}
export const rentalOf = p => (Array.isArray(p?.parts) && p.parts.length
  ? Math.round(p.parts.filter(x => x.type === 'rental').reduce((a, x) => a + (Number(x.amount) || 0), 0) * 1000) / 1000
  : Number(p?.amount) || 0);
