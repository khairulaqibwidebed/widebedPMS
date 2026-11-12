// Small message at the bottom of the screen, gone after a few seconds.
// Success messages ("Changes saved", "Photo removed" …) get a tick in front (app.css .toast.ok),
// and the button that just finished saving flashes green (lib/busy-buttons.js listens for pms:toast).
import { okMessage } from './busy-buttons.js';

export function toast(msg) {
  document.querySelector('.toast')?.remove();
  const t = document.createElement('div');
  t.className = 'toast' + (okMessage(msg) ? ' ok' : ''); t.textContent = msg;
  document.body.appendChild(t);
  window.dispatchEvent(new CustomEvent('pms:toast', { detail: msg }));
  setTimeout(() => t.remove(), 2600);
}
export const notBuilt = label => toast(`${label} is not built yet.`);
