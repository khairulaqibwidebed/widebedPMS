// Small helpers for things Alpine did with .window and .outside.
//   v-esc="close"            Escape anywhere on the page runs close() while this element is shown
//   v-click-outside="close"  a click outside this element runs close()
const handlers = new WeakMap();
export const esc = {
  mounted(el, b) { const h = e => { if (e.key === 'Escape') b.value(e); }; handlers.set(el, h); window.addEventListener('keydown', h); },
  unmounted(el) { window.removeEventListener('keydown', handlers.get(el)); }
};
export const clickOutside = {
  mounted(el, b) { const h = e => { if (!el.contains(e.target)) b.value(e); }; handlers.set(el, h); setTimeout(() => document.addEventListener('click', h)); },
  unmounted(el) { document.removeEventListener('click', handlers.get(el)); }
};
