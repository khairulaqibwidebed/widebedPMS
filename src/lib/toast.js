// Popups in the top-right corner (16 Nov 2026, Khairul: replaces the green/red banners at the top of pages and the old
// small message at the bottom). One system for every message:
//   toast('Changes saved')                       - old call, still works: a success tick when it reads like one, else info
//   toast.ok('Booking saved')                    - green tick, goes after 4 s
//   toast.error('Could not save: …')             - red, stays until closed (or 12 s)
//   toast.warn('Key it into eZee')               - amber, 7 s
//   toast.info('Nothing to export')              - neutral, 4 s
//   toast.ok('Saved', { action: { label: 'Open booking', run: () => router.push(...) } })   - a button in the popup
// Up to 3 at once; the same message twice is shown once. The button that just finished saving still flashes green
// (lib/busy-buttons.js listens for pms:toast).
import { okMessage } from './busy-buttons.js';

const TIME = { ok: 4000, info: 4000, warn: 7000, error: 12000 };
const ICON = { ok: '✓', error: '!', warn: '!', info: 'i' };
const LABEL = { ok: 'Success', error: 'Error', warn: 'Warning', info: 'Info' };

function host() {
  let h = document.querySelector('.toasts');
  if (!h) {
    h = document.createElement('div');
    h.className = 'toasts'; h.setAttribute('aria-live', 'polite');
    document.body.appendChild(h);
  }
  return h;
}

function close(el) {
  if (!el.isConnected || el.classList.contains('out')) return;
  el.classList.add('out');
  setTimeout(() => el.remove(), 200);
}

function show(kind, msg, { action = null, time } = {}) {
  const text = String(msg ?? '').trim();
  if (!text) return;
  const h = host();
  // the same message again: restart that one instead of stacking a copy
  const same = [...h.children].find(x => x.dataset.text === text && !x.classList.contains('out'));
  if (same) close(same);
  while (h.querySelectorAll('.toast:not(.out)').length >= 3) close(h.querySelector('.toast:not(.out)'));

  const t = document.createElement('div');
  t.className = `toast ${kind}`; t.dataset.text = text;
  t.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  const icon = document.createElement('span'); icon.className = 'toast-icon'; icon.textContent = ICON[kind]; icon.setAttribute('aria-hidden', 'true');
  const body = document.createElement('div'); body.className = 'toast-body';
  const p = document.createElement('p'); p.textContent = text; p.setAttribute('aria-label', `${LABEL[kind]}: ${text}`);
  body.appendChild(p);
  if (action?.label && typeof action.run === 'function') {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'toast-act'; b.textContent = action.label;
    b.addEventListener('click', () => { close(t); action.run(); });
    body.appendChild(b);
  }
  const x = document.createElement('button'); x.type = 'button'; x.className = 'toast-x'; x.textContent = '×'; x.setAttribute('aria-label', 'Close');
  x.addEventListener('click', () => close(t));
  t.append(icon, body, x);
  h.appendChild(t);

  // stays while the mouse is over it
  let timer = null;
  const start = () => { timer = setTimeout(() => close(t), time ?? TIME[kind]); };
  t.addEventListener('mouseenter', () => clearTimeout(timer));
  t.addEventListener('mouseleave', start);
  start();
  window.dispatchEvent(new CustomEvent('pms:toast', { detail: text }));
  return t;
}

export function toast(msg, opts) { return show(okMessage(msg) ? 'ok' : 'info', msg, opts); }
toast.ok = (msg, opts) => show('ok', msg, opts);
toast.error = (msg, opts) => show('error', msg, opts);
toast.warn = (msg, opts) => show('warn', msg, opts);
toast.info = (msg, opts) => show('info', msg, opts);
toast.clear = () => document.querySelectorAll('.toasts .toast').forEach(close);

export const notBuilt = label => toast.info(`${label} is not built yet.`);
