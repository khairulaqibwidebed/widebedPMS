// Page messages as popups (16 Nov 2026, Khairul). A page (the component a route opens) that keeps its result in
// okMsg (success) or error (a failed load or save) gets it shown as a popup in the corner (lib/toast.js) instead of
// the banner at the top of the page; those banners are removed from the pages.
// Errors inside forms and popups (formError, u.error, …) stay next to their fields. A page can opt out with popups: false.
// A page shown inside a wrapper (PropertiesRoute) or a part of a page opts in with popups: true, or names its own
// fields: popups: { ok: 'done', error: 'err' } (okMsg and error are always watched too).
// A page can add a button to the popup with a method popupAction(kind) that returns { label, run } or null.
import { toast } from './toast.js';

const list = v => (Array.isArray(v) ? v : v ? [v] : []);

export const pagePopups = {
  created() {
    const opt = this.$options.popups;
    if (opt === false) return;
    const type = this.$.type;
    if (!opt && !this.$route?.matched?.some(r => Object.values(r.components || {}).includes(type))) return;
    const data = this.$data || {};
    const names = { ok: ['okMsg', ...list(opt?.ok)], error: ['error', ...list(opt?.error)] };
    for (const kind of ['ok', 'error'])
      for (const k of new Set(names[kind])) {
        if (!(k in data)) continue;
        this.$watch(k, v => {
          if (typeof v !== 'string' || !v.trim()) return;
          const action = typeof this.popupAction === 'function' ? this.popupAction(kind) : null;
          toast[kind](v, action ? { action } : undefined);
        }, { immediate: true });
      }
  }
};
