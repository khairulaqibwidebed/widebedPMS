<template>
  <div class="lp" :class="{ home }">
    <div class="lp-head" v-if="!home">
      <h2>Owner listings</h2>
      <button v-if="closable" type="button" class="lp-close" aria-label="Close" @click="$emit('close')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
      </button>
    </div>

    <div class="seg lp-tabs lp-slide" :class="{ second: tab === 'list' }" role="tablist" aria-label="What to show" v-if="hasInbox && !home">
      <span class="lp-thumb" aria-hidden="true"></span>
      <button type="button" role="tab" :class="{ on: tab === 'inbox' }" :aria-selected="tab === 'inbox'" @click="$emit('update:tab', 'inbox')">{{ `From task system · ${leads.length}` }}</button>
      <button type="button" role="tab" :class="{ on: tab === 'list' }" :aria-selected="tab === 'list'" @click="$emit('update:tab', 'list')">{{ `Listings · ${rows.length}` }}</button>
    </div>

    <div class="lp-cols" :class="{ solo: !hasInbox }">
      <!-- From task system: cards on the Owner Leads board not started yet -->
      <section class="lp-col" v-if="hasInbox && (home || tab === 'inbox')" aria-label="From task system">
        <div class="lp-col-head" v-if="home"><h2>From task system</h2><span class="lp-count" :class="{ amber: leads.length }">{{ leads.length }}</span></div>
        <div class="lp-body">
          <div class="lp-note"><LiveStatus :status="status?.status" :last-updated="status?.lastUpdated" time /><span>New cards on the Owner Leads board, not started yet</span></div>
          <div class="notice warn" v-show="error">{{ error }}</div>
          <div class="lp-empty" v-show="loaded && !error && !leads.length">No new owner leads on the board.</div>
          <template v-for="t in leads" :key="t.taskId">
            <div class="lp-card">
              <div class="lp-card-top"><b>{{ t.title }}</b><span>{{ `${leadAging(t).text} old` }}</span></div>
              <small>{{ [t.column || 'New', t.dueDate ? `Due ${full(tmsDate(t.dueDate))}` : '', t.createdByName ? `from ${t.createdByName}` : ''].filter(Boolean).join(' · ') }}</small>
              <p v-if="t.description" class="lp-desc">{{ t.description }}</p>
              <div class="lp-card-foot"><button class="btn btn-primary btn-sm" @click="$emit('start', t)" :disabled="busy">Start listing</button></div>
            </div>
          </template>
        </div>
      </section>

      <!-- Listings in progress -->
      <section class="lp-col" v-if="home || !hasInbox || tab === 'list'" aria-label="Listings in progress">
        <div class="lp-col-head" v-if="home"><h2>Listings in progress</h2><span class="lp-count">{{ rows.length }}</span></div>
        <div class="lp-body">
          <div class="seg lp-whose lp-slide" :class="{ second: whose === 'everyone' }" role="group" aria-label="Whose listings">
            <span class="lp-thumb" aria-hidden="true"></span>
            <button type="button" :class="{ on: whose === 'mine' }" :aria-pressed="whose === 'mine'" @click="$emit('update:whose', 'mine')">Mine</button>
            <button type="button" :class="{ on: whose === 'everyone' }" :aria-pressed="whose === 'everyone'" @click="$emit('update:whose', 'everyone')">Everyone</button>
          </div>
          <TransitionGroup tag="div" name="lp-list" class="lp-rows">
              <router-link v-for="r in rows" :key="r.id" class="lp-row" :class="{ on: currentId === r.id }" :to="listingLink(r.id)">
                <span class="lp-row-top"><b>{{ r.id }}</b><span class="pill amber" v-if="r.tmsTaskId && r.tmsSync?.pending">Not sent</span></span>
                <span class="lp-row-place">{{ placeOf(r) }}</span>
                <span class="lp-prog" aria-hidden="true"><span :style="{ width: progressOf(r).pct + '%' }"></span></span>
                <small>{{ `Stage ${stageText(r)} · ${progressOf(r).done} of ${progressOf(r).total} done` }}</small>
              </router-link>
          </TransitionGroup>
          <SkeletonRows v-if="loading && !rows.length" :rows="3" />
          <div class="lp-empty" v-show="!loading && !rows.length">
            <template v-if="whose === 'mine'">None started by you. <button type="button" class="editlink" @click="$emit('update:whose', 'everyone')">Show everyone's</button></template>
            <template v-else>No listings in progress.</template>
          </div>
          <p class="help">Live and Not proceeding listings are in the Owner Leads list (close this panel and the listing).</p>
        </div>
      </section>
    </div>

    <div class="lp-foot" v-if="canEdit && !home"><router-link class="btn lp-new" :to="listingLink('new')">+ New listing</router-link></div>
  </div>
</template>

<script>
// Listing Flow's listings and "From task system" inbox (redesign 11 Nov 2026). Two ways to show it:
//   home: the start page (no listing open): the inbox and the listings side by side, no tabs;
//   else: the panel that slides in from the right while a listing is open, with tabs.
// Everything it shows comes from ListingFlow.vue.
import { full, tmsDate, leadAging, placeOf, stageText, listingLink, stagesFor, stageDoneOf } from '@/lib/owner-leads.js';
import LiveStatus from '@/components/LiveStatus.vue';

export default {
  components: { LiveStatus },
  props: {
    tab: { type: String, default: 'list' }, hasInbox: Boolean, canEdit: Boolean, closable: Boolean, busy: Boolean, home: Boolean,
    leads: { type: Array, default: () => [] }, status: { type: Object, default: null }, error: { type: String, default: '' }, loaded: Boolean,
    rows: { type: Array, default: () => [] }, whose: { type: String, default: 'mine' }, loading: Boolean, currentId: { type: String, default: '' }
  },
  emits: ['update:tab', 'update:whose', 'start', 'close'],
  methods: {
    full, tmsDate, leadAging, placeOf, stageText, listingLink,
    // How far the listing is: stages done out of the stages it shows
    progressOf(r) {
      const keys = stagesFor(r), done = keys.filter(k => stageDoneOf(r, k)).length;
      return { done, total: keys.length, pct: keys.length ? Math.round(done / keys.length * 100) : 0 };
    }
  }
};
</script>

<style scoped>
.lp { display: flex; flex-direction: column; min-height: 0; height: 100%; }
.lp-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 18px 20px 12px; }
.lp-head h2 { margin: 0; font-size: 18px; }
.lp-close { width: 40px; height: 40px; border: 0; border-radius: 10px; background: var(--chip); color: var(--text); display: grid; place-items: center; cursor: pointer; }
.lp-close:hover { background: var(--hover); }
.lp-tabs { margin: 0 20px 4px; }
.lp-tabs button, .lp-whose button { cursor: pointer; font: inherit; font-size: 13px; }
.lp-whose { margin: 0 0 4px; }
.lp-cols { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.lp-col { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.lp-body { flex: 1; min-height: 0; overflow-y: auto; padding: 8px 20px 16px; display: flex; flex-direction: column; gap: 10px; }
.lp-note { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; font-size: 12px; color: var(--muted); }
.lp-empty { padding: 18px; border: 1px dashed var(--border); border-radius: 12px; text-align: center; font-size: 13px; color: var(--muted); }
.lp-card { border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; display: flex; flex-direction: column; gap: 4px; background: var(--surface); }
.lp-card-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
.lp-card-top b { font-size: 14px; overflow-wrap: anywhere; }
.lp-card-top span { flex: none; font-size: 12px; color: var(--muted); }
.lp-card small { font-size: 12px; color: var(--muted); }
.lp-desc { margin: 2px 0 0; font-size: 13px; color: var(--text-2); overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.lp-card-foot { display: flex; justify-content: flex-end; margin-top: 4px; }
.lp-rows { display: flex; flex-direction: column; gap: 8px; }
.lp-row { display: flex; flex-direction: column; gap: 4px; padding: 12px 14px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); color: var(--text); text-decoration: none; font-size: 13px; }
.lp-row:hover { border-color: var(--accent); }
.lp-row.on { border-color: var(--accent); background: var(--accent-soft); }
.lp-row-top { display: flex; justify-content: space-between; gap: 8px; align-items: center; }
.lp-row-top b { color: var(--accent); }
.lp-row-place { font-weight: 600; font-size: 14px; overflow-wrap: anywhere; }
.lp-prog { display: block; height: 4px; border-radius: 2px; background: var(--chip); overflow: hidden; margin-top: 4px; }
.lp-prog span { display: block; height: 100%; border-radius: 2px; background: var(--green); transition: width .5s var(--ease); }
/* Mine / Everyone and the tabs: the coloured pill slides to the chosen side */
.lp-slide { position: relative; isolation: isolate; }
.lp-slide .lp-thumb { position: absolute; top: 4px; bottom: 4px; left: 4px; width: calc((100% - 8px) / 2); border-radius: 7px; background: var(--accent); box-shadow: 0 1px 2px rgba(0,0,0,.08); z-index: -1; transition: transform .28s var(--ease); }
.lp-slide.second .lp-thumb { transform: translateX(100%); }
.lp-slide button, .lp-slide button.on { background: none; box-shadow: none; transition: color .2s; }
.lp-slide button.on { color: #fff; }
/* Listing cards fade and slide in, and the others glide into place */
.lp-list-enter-active, .lp-list-leave-active { transition: opacity .25s var(--ease), transform .25s var(--ease); }
.lp-list-enter-from, .lp-list-leave-to { opacity: 0; transform: translateY(6px); }
.lp-list-leave-active { position: absolute; left: 0; right: 0; }
.lp-list-move { transition: transform .3s var(--ease); }
.lp-rows { position: relative; }
@media (prefers-reduced-motion: reduce) { .lp-slide .lp-thumb, .lp-prog span, .lp-list-enter-active, .lp-list-leave-active, .lp-list-move { transition: none; } }
.lp-row small { color: var(--muted); font-size: 12px; }
.lp-body > .help { margin: 4px 0 0; }
.lp-foot { border-top: 1px solid var(--line); padding: 14px 20px; }
.lp-new { display: flex; justify-content: center; align-items: center; width: 100%; height: 44px; box-sizing: border-box; }

/* Start page: two columns side by side (new leads, listings), each its own card; stacked on a narrow screen */
.home .lp-cols { flex-direction: row; flex-wrap: wrap; gap: 16px; align-items: flex-start; }
.home .lp-col { flex: 1 1 380px; min-width: 0; background: var(--surface); border: 1px solid var(--border); border-radius: 14px; }
.home .lp-col-head { display: flex; align-items: center; gap: 8px; padding: 18px 20px 4px; }
.home .lp-col-head h2 { margin: 0; font-size: 16px; }
.home .lp-body { overflow: visible; padding: 8px 20px 20px; }
.lp-count { min-width: 22px; height: 22px; padding: 0 7px; border-radius: 11px; background: var(--chip); color: var(--text-2); font-size: 12px; font-weight: 600; display: inline-grid; place-items: center; box-sizing: border-box; }
.lp-count.amber { background: var(--amber); color: #fff; }
/* No inbox (Marketing, Operations): the listings as a grid of cards */
.home .lp-cols.solo .lp-rows { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
</style>
