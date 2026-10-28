// When a form shows a red error, jump to the field it is about (best match between the message and the field labels),
// or to the message itself when no field matches. Runs for every page and drawer.
const SEL = '.notice.error, .nf-error, p.err';
const words = t => (t.toLowerCase().match(/[a-z]{4,}/g) || []).filter(w => !['please', 'enter', 'this', 'that', 'short', 'goes', 'audit', 'before', 'with', 'from', 'your', 'have', 'must'].includes(w));
const visible = el => el.offsetParent !== null;

function labelOf(f) {
  const l = (f.id && document.querySelector(`label[for="${CSS.escape(f.id)}"]`)) || f.closest('.field')?.querySelector('label');
  return `${l?.textContent || ''} ${f.placeholder || ''} ${f.getAttribute('aria-label') || ''}`;
}

function jump(note) {
  const box = note.closest('.drawer, form, .card, .page') || document.body;
  const ws = words(note.textContent);
  let best = null, score = 0;
  for (const f of box.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea')) {
    if (f.disabled || !visible(f) || (f.value || '').trim()) continue;
    const lab = labelOf(f).toLowerCase();
    const s = ws.filter(w => lab.includes(w) || lab.includes(w.replace(/s$/, ''))).length;
    if (s > score) { best = f; score = s; }
  }
  const target = best || note;
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  if (best) {
    best.focus({ preventScroll: true });
    best.animate([{ boxShadow: '0 0 0 3px rgba(217,45,32,.55)' }, { boxShadow: '0 0 0 0 rgba(217,45,32,0)' }], { duration: 1400 });
  }
}

export function watchErrors() {
  const seen = new WeakMap();
  let queued = false;
  const check = (force) => {
    queued = false;
    for (const el of document.querySelectorAll(SEL)) {
      const text = visible(el) ? el.textContent.trim() : '';
      if (text && (force || seen.get(el) !== text)) jump(el);
      seen.set(el, text);
    }
  };
  new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(() => check(false)); } })
    .observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['style', 'class'] });
  // The same message shown again on a second press changes nothing in the page, so look again after each button press.
  document.addEventListener('click', e => { if (e.target.closest('button[type=submit], .btn-primary')) setTimeout(() => check(true), 250); }, true);
}
