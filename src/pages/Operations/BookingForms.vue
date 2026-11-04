<template>
  <main class="content">
    <div class="page-head">
      <div>
        <h1>Booking forms</h1>
        <div class="sub">Operations forms. Pick a form below and fill it in step by step.</div>
      </div>
    </div>
    <div class="bf-bar">
      <div class="bf-tabs" role="tablist" aria-label="Forms">
        <button v-for="t in TABS" :key="t.key" type="button" role="tab" class="bf-tab" :class="{ on: tab === t.key }" :aria-selected="String(tab === t.key)" @click="open(t.key)">{{ t.label }}</button>
      </div>
    </div>
    <!-- Each form stays loaded once opened, so switching tabs keeps what was typed (nothing is saved as a draft) -->
    <div v-for="t in TABS" :key="t.key" v-show="tab === t.key" role="tabpanel">
      <component :is="t.form" v-if="seen[t.key]" :key="t.key === 'reservation' ? 'r' + leadId : t.key" v-bind="t.key === 'reservation' ? { leadId } : {}" @dirty="v => dirty[t.key] = v" />
    </div>
  </main>
</template>

<script>
// Operations > Booking forms: one tab per form, each with its own address (/Operations/booking-forms/reservation, /utility).
// The forms are their own files in ./booking-forms/; this page only shows the tabs and warns before leaving with something typed.
// Add a form: a file in ./booking-forms/ that emits 'dirty', a line in TABS, and its name in the route in router.js.
import { defineAsyncComponent, markRaw } from 'vue';
import { askConfirm } from '@/lib/confirm.js';

const TABS = [
  { key: 'reservation', label: 'Reservation Lodgment Form', form: markRaw(defineAsyncComponent(() => import('./booking-forms/ReservationForm.vue'))) },
  { key: 'utility', label: 'Utility Lodgment Form', form: markRaw(defineAsyncComponent(() => import('./booking-forms/UtilityForm.vue'))) },
  { key: 'property', label: 'Property Inspection Form', form: markRaw(defineAsyncComponent(() => import('./booking-forms/PropertyInspectionForm.vue'))) }
];
const BASE = '/Operations/booking-forms';

export default {
  data() {
    const tab = this.tabOf(this.$route);
    return { TABS, tab, seen: { [tab]: true }, dirty: {}, leadId: this.$route.query.lead || '' };
  },
  computed: { anyDirty() { return Object.values(this.dirty).some(Boolean); } },
  created() {
    // The old address (no form in it) opens the Reservation tab
    if (!this.$route.params.form) this.$router.replace({ path: `${BASE}/${this.tab}`, query: this.$route.query });
  },
  mounted() { window.addEventListener('beforeunload', this.warn); },
  unmounted() { window.removeEventListener('beforeunload', this.warn); },
  watch: {
    $route(to) {
      if (!to.path.startsWith(BASE)) return;
      this.tab = this.tabOf(to);
      this.seen[this.tab] = true;
      // The inquiry (?lead=) belongs to the Reservation tab: switching to Utility and back keeps it
      if (this.tab === 'reservation') this.leadId = to.query.lead || '';
    }
  },
  // Leaving the page (sidebar, back button, another page) with something typed: ask first. Switching tabs doesn't ask.
  async beforeRouteLeave() {
    if (!this.anyDirty) return true;
    return askConfirm({ title: 'Leave?', message: "What you've entered will be lost.", confirmText: 'Leave', danger: true });
  },
  methods: {
    tabOf(route) { return TABS.some(t => t.key === route.params.form) ? route.params.form : 'reservation'; },
    open(key) {
      if (key === this.tab) return;
      this.$router.push({ path: `${BASE}/${key}`, query: key === 'reservation' && this.leadId ? { lead: this.leadId } : {} });
    },
    // Closing or reloading the browser tab: the browser's own "Leave site?" warning
    warn(e) { if (!this.anyDirty) return; e.preventDefault(); e.returnValue = ''; }
  }
};
</script>

<style scoped>
/* Same tabs as the Notifications page (All / Unread / Starred) */
.bf-bar { border-bottom: 1px solid var(--border); margin-bottom: 18px; }
.bf-tabs { display: flex; gap: 4px; overflow-x: auto; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
.bf-tabs::-webkit-scrollbar { display: none; }
.bf-tab { display: inline-flex; align-items: center; gap: 6px; border: 0; background: none; padding: 10px 14px; margin-bottom: -1px; font: inherit; font-size: 14px; font-weight: 500;
  color: var(--text-2); border-bottom: 2px solid transparent; cursor: pointer; white-space: nowrap; flex: none; }
.bf-tab:hover { color: var(--accent); }
.bf-tab.on { color: var(--accent); font-weight: 600; border-bottom-color: var(--accent); }
</style>
