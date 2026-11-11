// Sliding bar at the very top of the window while a page is opening (11 Nov 2026).
// Pages are loaded on demand and the sign-in check runs first, so a slow phone can sit for a moment after a click.
// The bar only appears if opening takes longer than 150 ms, so fast clicks don't flicker.
export function startRouteProgress(router) {
  let bar = null, timer = null;
  const show = () => {
    if (bar) return;
    bar = document.createElement('div');
    bar.className = 'loading-bar route-bar';
    bar.setAttribute('role', 'progressbar'); bar.setAttribute('aria-label', 'Opening page');
    document.body.appendChild(bar);
  };
  const hide = () => { clearTimeout(timer); timer = null; bar?.remove(); bar = null; };
  router.beforeEach(() => { clearTimeout(timer); timer = setTimeout(show, 150); });
  router.afterEach(hide);
  router.onError(hide);
}
