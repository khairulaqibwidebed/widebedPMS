// Small message at the bottom of the screen, gone after a few seconds.
export function toast(msg) {
  document.querySelector('.toast')?.remove();
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}
export const notBuilt = label => toast(`${label} is not built yet.`);
