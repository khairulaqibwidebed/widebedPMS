// Appearance (Settings > Appearance): colour theme and light/dark, per person. Kept in this browser for now;
// moves to the user's account doc when the rules allow it. PDFs always use Widebed's own colours.
export function readTheme() {
  try { return { brand: localStorage.getItem('wb.brand') || 'widebed', mode: localStorage.getItem('wb.mode') || 'light' }; }
  catch { return { brand: 'widebed', mode: 'light' }; }
}
export function applyTheme(t = readTheme()) {
  const r = document.documentElement;
  if (t.brand && t.brand !== 'widebed') r.dataset.brand = t.brand; else delete r.dataset.brand;
  const dark = t.mode === 'dark' || (t.mode === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  if (dark) r.dataset.mode = 'dark'; else delete r.dataset.mode;
}
export function saveTheme(t) {
  try { localStorage.setItem('wb.brand', t.brand); localStorage.setItem('wb.mode', t.mode); } catch {}
  applyTheme(t);
}
