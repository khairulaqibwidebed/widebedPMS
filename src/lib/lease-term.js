// Lease terms by nights (19 Nov 2026, Khairul): 29 nights or less = short term, 30 to 364 = monthly lease, 365 or more = long-term lease.
// Same cut-offs as termOf in rent-term.js (Type of rent); this one goes by nights only.
// Labels only: the money side (monthly rent, 2-month deposit, month-by-month paid status) still applies from 30 nights (booking.longTerm).
export const leaseTerm = n => (Number(n) >= 365 ? 'long' : Number(n) >= 30 ? 'monthly' : 'short');
// 20 Nov 2026 (Khairul): named Daily / Monthly / Yearly Lease, the same as Type of rent (lib/rent-term.js)
export const LEASE_LABEL = { short: 'Daily Lease', monthly: 'Monthly Lease', long: 'Yearly Lease' };
export const LEASE_HINT = { short: '29 nights or less', monthly: '30 to 364 nights', long: '365 nights or more' };
export const leaseLabel = n => LEASE_LABEL[leaseTerm(n)];
// A booking's nights: its saved nights, else from its dates
export const bookingNights = b => {
  if (Number(b?.nights) > 0) return Number(b.nights);
  if (!b?.arrival || !b?.departure) return 0;
  const n = Math.round((new Date(b.departure) - new Date(b.arrival)) / 864e5); return n > 0 ? n : 0;
};
