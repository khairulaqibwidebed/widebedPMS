// Busy buttons (11 Nov 2026). No page changes needed.
// Any button whose label turns into "Saving…", "Sending…", "Deleting…", "Preparing…" (a word ending in -ing, then …)
// gets the class is-busy, which draws a spinner in front of the label (app.css). When the label goes back, the class goes.
// If a success toast ("Changes saved", "SOP saved." …) shows up within 2 seconds of a button finishing,
// that button flashes green with a tick. No toast, or an error message, means no tick.
const BUSY = /^\s*[A-Z][a-z]+ing\b[^…]{0,40}…\s*$/;
const OK = /\b(saved|added|sent|approved|updated|done|created|removed|deleted|downloaded|exported|made|submitted|uploaded)\b/i;
const SEL = 'button, .btn';

let lastDone = null;

function check(btn) {
  const busy = BUSY.test(btn.textContent || '');
  const was = btn.classList.contains('is-busy');
  if (busy && !was) { btn.classList.add('is-busy'); btn.setAttribute('aria-busy', 'true'); }
  else if (!busy && was) { btn.classList.remove('is-busy'); btn.removeAttribute('aria-busy'); lastDone = { btn, at: Date.now() }; }
}

function flash(btn) {
  btn.classList.add('is-done');
  setTimeout(() => btn.classList.remove('is-done'), 1400);
}

export function okMessage(msg) { return OK.test(msg || ''); }

export function startBusyButtons() {
  const scan = el => { if (el.matches?.(SEL)) check(el); el.querySelectorAll?.(SEL).forEach(check); };
  new MutationObserver(list => {
    for (const m of list) {
      const el = m.target.nodeType === 3 ? m.target.parentElement : m.target;
      const btn = el?.closest?.(SEL);
      if (btn) check(btn);
      m.addedNodes.forEach(n => { if (n.nodeType === 1) scan(n); });
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true });
  scan(document.body);

  // lib/toast.js sends this event with the message
  window.addEventListener('pms:toast', e => {
    const d = lastDone; lastDone = null;
    if (!d || Date.now() - d.at > 2000 || !d.btn.isConnected || !okMessage(e.detail)) return;
    flash(d.btn);
  });
}
