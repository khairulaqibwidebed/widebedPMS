// Type of rent (16 Nov 2026, Khairul). Saved on offline bookings as Daily / Monthly / Yearly (unchanged, so older
// bookings still read right); shown everywhere as Short term / Mid term / Long term.
export const RENT_TERMS = [
  { value: 'Daily', key: 'short', label: 'Short term' },
  { value: 'Monthly', key: 'mid', label: 'Mid term' },
  { value: 'Yearly', key: 'long', label: 'Long term' }
];
export const rentTermLabel = v => RENT_TERMS.find(x => x.value === v)?.label || v || '';
// A booking's term: its Type of rent; eZee bookings have none, so their nights decide (under 30 short, under 365 mid)
export function termOf(b) {
  const t = RENT_TERMS.find(x => x.value === b?.rentType);
  if (t) return t.key;
  const n = Number(b?.nights) || (b?.arrival && b?.departure ? Math.round((Date.parse(b.departure) - Date.parse(b.arrival)) / 864e5) : 0);
  return n < 30 ? 'short' : n < 365 ? 'mid' : 'long';
}
