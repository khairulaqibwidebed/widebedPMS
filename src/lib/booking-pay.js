// What counts as paid on a booking (19 Nov 2026, Khairul): only offline payments Finance has Checked.
// Long-term months take the payment's "For month" (forMonth, YYYY-MM); older payments without one count in their Payment Date's month.
export const payCounts = p => p?.status === 'Checked';
export const payMonth = p => (/^\d{4}-\d{2}$/.test(p?.forMonth || '') ? p.forMonth : String(p?.date || '').slice(0, 7));
