// Page messages as popups (16 Nov 2026, Khairul). A page (the component a route opens) that keeps its result in
// okMsg (success) or error (a failed load or save) gets it shown as a popup in the corner (lib/toast.js) instead of
// the banner at the top of the page; those banners are removed from the pages.
// Errors inside forms and popups (formError, u.error, …) stay next to their fields. A page can opt out with popups: false,
// and a page shown inside a route wrapper (PropertiesRoute) opts in with popups: true.
import { toast } from './toast.js';

export const pagePopups = {
  created() {
    if (this.$options.popups === false) return;
    const type = this.$.type;
    if (this.$options.popups !== true && !this.$route?.matched?.some(r => Object.values(r.components || {}).includes(type))) return;
    const data = this.$data || {};
    if ('okMsg' in data) this.$watch('okMsg', v => { if (typeof v === 'string' && v.trim()) toast.ok(v); }, { immediate: true });
    if ('error' in data) this.$watch('error', v => { if (typeof v === 'string' && v.trim()) toast.error(v); }, { immediate: true });
  }
};
