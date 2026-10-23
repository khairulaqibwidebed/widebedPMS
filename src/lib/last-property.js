// The property last picked in any page's property switcher, so the next page opens on it.
// Kept in this browser only. 'all' (All properties) is remembered for pages that offer it;
// pages that need one property use the last single property picked.
const ANY = 'wb.property', ONE = 'wb.property.one';

export function lastProperty(allowAll = false) {
  try { return (allowAll ? localStorage.getItem(ANY) : localStorage.getItem(ONE)) || ''; } catch (_) { return ''; }
}

export function rememberProperty(id) {
  if (!id || id.startsWith('__')) return;   // "New property…" and similar choices are not properties
  try {
    localStorage.setItem(ANY, id);
    if (id !== 'all') localStorage.setItem(ONE, id);
  } catch (_) {}
}
