// lib/select-menu.js — every plain <select> opens the same list as OptionPicker (13 Nov 2026): the theme colour, rounded,
// a tick on the chosen one. A browser's own <select> list can't be styled, so its opening is taken over here, in one
// place, for the whole PMS. Nothing changes in the pages: the <select> stays the real control (v-model, @change,
// labels, forms and screen readers work as before); only the list you see is ours.
//   startSelectMenus() once in main.js.
//   <select data-native> keeps the browser's own list. Phones and tablets keep theirs too (the system picker is better there),
//   and so do <select multiple> / <select size="…">.
// Keys while open: ↑ ↓ Home End move, Enter or Space picks, Esc or Tab closes, typing filters the list (Backspace undoes).
import './select-menu.css';

const TICK = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>';
const norm = t => String(t || '').toLowerCase().replace(/[^a-z0-9]/g, '');
// The rows of a <select>: its options, with a heading row before each <optgroup>.
export function rowsOf(select) {
  const rows = [];
  for (const el of select.children) {
    if (el.tagName === 'OPTGROUP') {
      rows.push({ group: el.label });
      for (const o of el.children) if (o.tagName === 'OPTION' && !o.hidden) rows.push({ option: o, label: o.label || o.text, off: o.disabled || el.disabled, inGroup: true });
    } else if (el.tagName === 'OPTION' && !el.hidden) rows.push({ option: el, label: el.label || el.text, off: el.disabled });
  }
  return rows;
}
// Rows left after typing: options whose text contains what was typed (letters and digits only), and the headings that still have one.
export function filterRows(rows, typed) {
  const k = norm(typed);
  if (!k) return rows;
  const kept = rows.filter(r => r.group !== undefined || norm(r.label).includes(k));
  return kept.filter((r, i) => r.group === undefined || (kept[i + 1] && kept[i + 1].group === undefined && kept[i + 1].inGroup));
}
const usable = s => s && s.tagName === 'SELECT' && !s.multiple && s.size <= 1 && !s.disabled && !s.hasAttribute('data-native');

let state = null;   // { select, pop, rows, shown, hot, typed }

function close(focusBack) {
  if (!state) return;
  const { select, pop, timer } = state;
  state = null;
  clearInterval(timer);
  pop.remove();
  select.classList.remove('sm-open');
  select.removeAttribute('aria-expanded');
  if (focusBack && select.isConnected) select.focus({ preventScroll: true });
}

function place() {
  const { select, pop } = state, r = select.getBoundingClientRect();
  pop.style.minWidth = `${Math.round(r.width)}px`;
  pop.style.maxHeight = '340px';
  const h = Math.min(pop.scrollHeight + 2, 340), below = window.innerHeight - r.bottom - 12, above = r.top - 12;
  const up = below < Math.min(h, 200) && above > below;
  pop.style.maxHeight = `${Math.max(120, Math.min(340, up ? above : below))}px`;
  pop.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - pop.offsetWidth - 8))}px`;
  if (up) { pop.style.top = ''; pop.style.bottom = `${Math.round(window.innerHeight - r.top + 6)}px`; }
  else { pop.style.bottom = ''; pop.style.top = `${Math.round(r.bottom + 6)}px`; }
}

function draw() {
  const { pop, select, typed } = state;
  state.shown = filterRows(state.rows, typed);
  const picks = state.shown.filter(r => r.option && !r.off);
  if (!picks.includes(state.hot)) state.hot = picks.find(r => r.option.selected) || picks[0] || null;
  pop.textContent = '';
  if (typed) { const f = document.createElement('li'); f.className = 'sm-find'; f.setAttribute('role', 'presentation'); f.innerHTML = 'Showing: <b></b>'; f.querySelector('b').textContent = typed; pop.appendChild(f); }
  for (const r of state.shown) {
    const li = document.createElement('li');
    if (r.group !== undefined) { li.className = 'sm-group'; li.setAttribute('role', 'presentation'); li.textContent = r.group; }
    else {
      const on = r.option.selected && r.option.value === select.value;
      li.className = `sm-item${on ? ' on' : ''}${r === state.hot ? ' hot' : ''}${r.off ? ' off' : ''}${r.inGroup ? ' in-group' : ''}`;
      li.setAttribute('role', 'option'); li.setAttribute('aria-selected', String(on));
      if (r.off) li.setAttribute('aria-disabled', 'true');
      const span = document.createElement('span'); span.textContent = r.label || ' '; li.appendChild(span);
      if (on) li.insertAdjacentHTML('beforeend', TICK);
      li.addEventListener('mouseenter', () => { if (!r.off && state && state.hot !== r) { state.hot = r; mark(); } });
      li.addEventListener('click', () => { if (!r.off) pick(r); });
      r.el = li;
    }
    pop.appendChild(li);
  }
  if (!state.shown.some(r => r.option)) { const li = document.createElement('li'); li.className = 'sm-none'; li.setAttribute('role', 'presentation'); li.textContent = 'No match'; pop.appendChild(li); }
  place();
  state.hot?.el?.scrollIntoView({ block: 'nearest' });
}
// Only the highlight moved: no need to rebuild the list.
function mark() {
  for (const r of state.shown) if (r.el) r.el.classList.toggle('hot', r === state.hot);
}

function pick(row) {
  const { select } = state, changed = select.value !== row.option.value || !row.option.selected;
  close(true);
  if (!changed) return;
  row.option.selected = true;
  select.dispatchEvent(new Event('input', { bubbles: true }));
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

function open(select) {
  if (state) close(false);
  const pop = document.createElement('ul');
  pop.className = 'sm-pop'; pop.setAttribute('role', 'listbox');
  const label = select.getAttribute('aria-label') || select.labels?.[0]?.textContent?.trim();
  if (label) pop.setAttribute('aria-label', label);
  pop.addEventListener('mousedown', e => e.preventDefault());   // keeps the focus on the <select>
  document.body.appendChild(pop);
  select.classList.add('sm-open'); select.setAttribute('aria-expanded', 'true');
  // The page can take the <select> away while its list is open (a tab change, a dialog closing).
  const timer = setInterval(() => { if (state && (!state.select.isConnected || state.select.disabled || !state.select.getClientRects().length)) close(false); }, 250);
  state = { select, pop, rows: rowsOf(select), shown: [], hot: null, typed: '', timer };
  draw();
}

function move(step) {
  const picks = state.shown.filter(r => r.option && !r.off);
  if (!picks.length) return;
  const i = picks.indexOf(state.hot);
  state.hot = step === 'first' ? picks[0] : step === 'last' ? picks[picks.length - 1] : picks[Math.max(0, Math.min(picks.length - 1, (i < 0 ? 0 : i + step)))];
  mark();
  state.hot.el?.scrollIntoView({ block: 'nearest' });
}

function onKeydown(e) {
  if (e.isComposing) return;
  if (state) {
    if (e.target !== state.select) { if (e.key === 'Escape') close(false); return; }
    const k = e.key;
    if (k === 'Tab') { close(false); return; }
    e.preventDefault(); e.stopPropagation();
    if (k === 'Escape') close(true);
    else if (k === 'ArrowDown') move(1);
    else if (k === 'ArrowUp') move(-1);
    else if (k === 'PageDown') move(8);
    else if (k === 'PageUp') move(-8);
    else if (k === 'Home') move('first');
    else if (k === 'End') move('last');
    else if (k === 'Enter' || (k === ' ' && !state.typed)) { if (state.hot) pick(state.hot); else close(true); }
    else if (k === 'Backspace') { if (state.typed) { state.typed = state.typed.slice(0, -1); draw(); } }
    else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { state.typed += k; draw(); }
    return;
  }
  // Closed: the keys that would open the browser's own list open ours.
  if (!usable(e.target) || e.ctrlKey || e.metaKey) return;
  if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'F4') { e.preventDefault(); open(e.target); }
}

function onMousedown(e) {
  if (e.button !== 0) return;
  if (state && state.pop.contains(e.target)) return;
  const select = e.target.closest ? e.target.closest('select') : null;
  if (state) { const same = state.select === select; close(false); if (same) { e.preventDefault(); select.focus({ preventScroll: true }); return; } }
  if (!usable(select)) return;
  e.preventDefault();   // stops the browser's own list
  select.focus({ preventScroll: true });
  open(select);
}

export function startSelectMenus() {
  if (typeof window === 'undefined' || !window.matchMedia) return;
  // Touch screens keep the system picker.
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  document.addEventListener('mousedown', onMousedown, true);
  document.addEventListener('keydown', onKeydown, true);
  window.addEventListener('resize', () => close(false));
  window.addEventListener('blur', () => close(false));
  // Scrolling the page under an open list would leave it floating; scrolling inside the list is fine.
  document.addEventListener('scroll', e => { if (state && e.target !== state.pop && !state.pop.contains(e.target)) close(false); }, true);
  document.addEventListener('focusin', e => { if (state && e.target !== state.select) close(false); });
}
