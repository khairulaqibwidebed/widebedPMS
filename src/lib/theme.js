// Appearance (Settings > Appearance): colour theme and light/dark, per person. Kept in this browser for now;
// moves to the user's account doc when the rules allow it. PDFs always use Widebed's own colours.
export const DEFAULT_CUSTOM = '#7C5CD6';
const CUSTOM_VARS = ['--brand', '--accent', '--accent-soft'];

const BRANDS = ['widebed', 'blue', 'custom'];   // Teal and Neutral grey removed 27 Oct; anyone on them goes back to Widebed

export function readTheme() {
  try {
    const b = localStorage.getItem('wb.brand');
    return { brand: BRANDS.includes(b) ? b : 'widebed', mode: localStorage.getItem('wb.mode') || 'light',
      custom: localStorage.getItem('wb.custom') || DEFAULT_CUSTOM };
  } catch { return { brand: 'widebed', mode: 'light', custom: DEFAULT_CUSTOM }; }
}

const hexToRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const rgbToHex = c => '#' + c.map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('').toUpperCase();
const mix = (a, b, w) => a.map((v, i) => v * w + b[i] * (1 - w));   // w of a, rest of b
const lum = c => {
  const [r, g, b] = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrastWithWhite = c => 1.05 / (lum(c) + 0.05);
export const isHex = h => /^#[0-9a-f]{6}$/i.test(h || '');

// One picked colour -> the three theme colours. The accent is darkened until white button text
// on it is readable (4.5:1), so any colour the person picks still gives usable buttons and links.
export function customPalette(hex, dark = false) {
  const brand = hexToRgb(isHex(hex) ? hex : DEFAULT_CUSTOM);
  let accent = brand;
  for (let i = 0; i < 40 && contrastWithWhite(accent) < 4.5; i++) accent = mix(accent, [0, 0, 0], 0.94);
  const soft = dark ? mix(brand, [26, 32, 41], 0.22) : mix(brand, [255, 255, 255], 0.14);
  return { brand: rgbToHex(brand), accent: rgbToHex(accent), soft: rgbToHex(soft) };
}

export function applyTheme(t = readTheme()) {
  const r = document.documentElement;
  if (t.brand && t.brand !== 'widebed') r.dataset.brand = t.brand; else delete r.dataset.brand;
  const dark = t.mode === 'dark' || (t.mode === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  if (dark) r.dataset.mode = 'dark'; else delete r.dataset.mode;
  if (t.brand === 'custom') {
    const p = customPalette(t.custom, dark);
    r.style.setProperty('--brand', p.brand); r.style.setProperty('--accent', p.accent); r.style.setProperty('--accent-soft', p.soft);
  } else CUSTOM_VARS.forEach(v => r.style.removeProperty(v));
}
export function saveTheme(t) {
  try {
    localStorage.setItem('wb.brand', t.brand); localStorage.setItem('wb.mode', t.mode);
    if (isHex(t.custom)) localStorage.setItem('wb.custom', t.custom);
  } catch {}
  applyTheme(t);
}
