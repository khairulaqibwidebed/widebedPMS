// lib/agreements/drag-scroll.js — scrolls the page while something is dragged near its top or bottom edge.
// The browser's own drag scrolling can't scroll up here: the sticky top bar covers the edge it looks at.
// Call startDragScroll(el) in dragstart (el = the dragged element, or anything inside the page); it stops by itself
// on drop / dragend. Returns a stop() function too.

// The nearest ancestor that really scrolls up and down (the app's .main), else the window's own scroller.
export function scrollParent(el) {
  for (let n = el?.parentElement; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
    const o = getComputedStyle(n).overflowY;
    if ((o === 'auto' || o === 'scroll') && n.scrollHeight > n.clientHeight + 1) return n;
  }
  return document.scrollingElement || document.documentElement;
}

// How fast to scroll, in pixels a second: negative = up. [y] is the pointer, top/bottom the visible edges of the scroller.
// Faster the closer the pointer is to (or past) the edge; nothing in the middle.
export function scrollSpeed(y, top, bottom, zone = 90, max = 1300) {
  if (y < top + zone) return -Math.ceil(max * Math.min(1, (top + zone - y) / zone));
  if (y > bottom - zone) return Math.ceil(max * Math.min(1, (y - (bottom - zone)) / zone));
  return 0;
}

export function startDragScroll(el, { zone = 90, max = 1300 } = {}) {
  const box = scrollParent(el);
  const isPage = box === document.scrollingElement || box === document.documentElement;
  // A sticky bar at the top of the scroller (the PMS top bar) hides that part: the "top edge" starts under it.
  const bar = isPage ? null : box.querySelector(':scope > .topbar, :scope > header');
  let y = null, seen = 0, frame = 0, stopped = false, last = performance.now(), carry = 0;
  const onOver = e => { y = e.clientY; seen = performance.now(); };
  const tick = now => {
    if (stopped) return;
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));   // seconds since the last frame: same speed on any screen
    last = now;
    // Browsers send dragover several times a second while dragging, even when the pointer is still. None for a while =
    // the pointer left the window or the drag ended without telling us: don't keep scrolling.
    if (y !== null && performance.now() - seen < 300) {
      const r = isPage ? { top: 0, bottom: window.innerHeight } : box.getBoundingClientRect();
      const top = r.top + (bar ? bar.offsetHeight : 0);
      carry += scrollSpeed(y, top, r.bottom, zone, max) * dt;
      const by = Math.trunc(carry);   // whole pixels only; the rest waits for the next frame
      if (by) { box.scrollTop += by; carry -= by; }
    } else carry = 0;
    frame = requestAnimationFrame(tick);
  };
  const stop = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frame);
    document.removeEventListener('dragover', onOver, true);
    document.removeEventListener('drop', stop, true);
    document.removeEventListener('dragend', stop, true);
  };
  document.addEventListener('dragover', onOver, true);
  document.addEventListener('drop', stop, true);
  document.addEventListener('dragend', stop, true);
  frame = requestAnimationFrame(tick);
  return stop;
}
