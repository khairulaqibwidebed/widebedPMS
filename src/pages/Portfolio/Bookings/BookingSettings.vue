<template>
  <main class="content">
    <div class="page-head">
      <div>
        <h1>Booking settings</h1>
        <div class="sub"><RouterLink to="/Portfolio/bookings">Portfolio › Bookings</RouterLink> › Booking settings</div>
      </div>
      <div class="head-tools">
        <RouterLink class="btn" to="/Portfolio/bookings">← Back to Bookings</RouterLink>
      </div>
    </div>

    <div class="bs-layout">
      <nav class="bs-tabs" role="tablist" aria-label="Booking settings" aria-orientation="vertical">
        <button v-for="t in TABS" :key="t.key" type="button" role="tab" class="bs-tab" :class="{ on: tab === t.key }"
          :aria-selected="String(tab === t.key)" :aria-controls="`bs-${t.key}`" @click="open(t.key)">
          <span>{{ t.label }}</span>
        </button>
      </nav>
      <section class="bs-body" role="tabpanel" :id="`bs-${tab}`">
        <InvoiceSettings v-if="tab === 'invoice'" @dirty="v => dirty = v" />
        <SourcesSettings v-else-if="tab === 'sources'" @dirty="v => dirty = v" />
        <FeesSettings v-else-if="tab === 'fees'" @dirty="v => dirty = v" />
      </section>
    </div>
  </main>
</template>

<script>
// Portfolio > Bookings > Booking settings (23 Nov 2026, Khairul): the gear on Bookings opens this page.
// One address per tab: /Portfolio/bookings/settings/invoice | sources | fees. The old /Portfolio/bookings/invoice-settings
// redirects to the Invoice & T&Cs tab (router.js). Opens with the 'bookingSettings.edit' tick (lib/access.js).
// Unsaved changes ask before leaving the page or switching tab (switching tab drops them).
import { askConfirm } from '@/lib/confirm.js';
import InvoiceSettings from './InvoiceSettings.vue';
import SourcesSettings from './SourcesSettings.vue';
import FeesSettings from './FeesSettings.vue';

// 23 Nov 2026 (Khairul): Booking sources and Other fees built (were "Soon"); config/bookingSources and config/bookingFees
const TABS = [
  { key: 'invoice', label: 'Invoice & T&Cs' },
  { key: 'sources', label: 'Booking sources' },
  { key: 'fees', label: 'Other fees' }
];
const BASE = '/Portfolio/bookings/settings';
const tabOf = route => (TABS.some(t => t.key === route.params.tab) ? route.params.tab : TABS[0].key);
const leaveMsg = { title: 'Leave without saving?', message: 'Your changes to the booking settings will be lost.', confirmText: 'Leave', danger: true };

export default {
  components: { InvoiceSettings, SourcesSettings, FeesSettings },
  data() { return { TABS, tab: tabOf(this.$route), dirty: false }; },
  computed: { current() { return TABS.find(t => t.key === this.tab) || TABS[0]; } },
  created() {
    // /Portfolio/bookings/settings (no tab) opens the first tab
    if (!this.$route.params.tab) this.$router.replace({ path: `${BASE}/${this.tab}`, query: this.$route.query });
  },
  mounted() { window.addEventListener('beforeunload', this.warn); },
  unmounted() { window.removeEventListener('beforeunload', this.warn); },
  async beforeRouteUpdate(to) {
    const next = tabOf(to);
    if (next === this.tab) return true;
    if (this.dirty && !(await askConfirm(leaveMsg))) return false;
    this.dirty = false; this.tab = next;
    return true;
  },
  async beforeRouteLeave() {
    if (!this.dirty) return true;
    return askConfirm(leaveMsg);
  },
  methods: {
    open(key) { if (key !== this.tab) this.$router.push({ path: `${BASE}/${key}` }); },
    warn(e) { if (!this.dirty) return; e.preventDefault(); e.returnValue = ''; }
  }
};
</script>

<style scoped>
.head-tools { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.bs-layout { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 24px; align-items: start; }
.bs-tabs { display: flex; flex-direction: column; gap: 2px; position: sticky; top: 16px; }
.bs-tab { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; border: 0; background: none; text-align: left;
  padding: 10px 12px; border-radius: 8px; border-left: 3px solid transparent; font: inherit; font-size: 14px; font-weight: 500; color: var(--text-2); cursor: pointer; }
.bs-tab:hover { color: var(--accent); background: var(--accent-soft); }
.bs-tab.on { color: var(--accent); font-weight: 600; background: var(--accent-soft); border-left-color: var(--accent); }
/* Phone: the tabs stack above the settings */
/* Also 1025–1180px: with the sidebar open the settings body is too narrow for a side menu, so the menu goes on top (24 Nov 2026) */
@media (max-width: 760px), (min-width: 1025px) and (max-width: 1180px) {
  .bs-layout { grid-template-columns: minmax(0, 1fr); gap: 16px; }
  .bs-tabs { position: static; border: 1px solid var(--border); border-radius: 12px; padding: 4px; background: var(--surface); }
}
</style>
