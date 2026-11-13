<template>
  <div class="lb">
    <section class="kpis lb-kpis">
      <template v-for="k in LEAD_KEYS" :key="k">
        <button type="button" class="card kpi kpi-link" :class="{ on: status === k }" @click="status = status === k ? 'all' : k">
          <div class="label">{{ LEAD_STATUS[k].label }}</div><div class="value">{{ count(k) }}</div><div class="hint">{{ HINTS[k] }}</div></button>
      </template>
    </section>

    <div class="toolbar lb-tools">
      <input class="input" type="search" placeholder="Search NL no., subject, property, unit, owner or remarks" v-model="search" aria-label="Search owner leads">
      <OptionPicker v-model="status" :options="[{ value: 'all', label: `All statuses · ${rows.length}` }, ...LEAD_KEYS.map(k => ({ value: k, label: `${LEAD_STATUS[k].label} · ${count(k)}` }))]" label="Status" />
      <OptionPicker v-model="source" :options="[{ value: 'all', label: 'All sources' }, ...SOURCES.map(s => ({ value: s, label: s }))]" label="Source" />
      <OptionPicker v-model="property" :options="[{ value: 'all', label: 'All properties' }, ...propertyList.map(p => ({ value: p, label: p }))]" label="Property" searchable />
      <span class="lb-fill"></span>
      <div class="seg lb-view" role="group" aria-label="View">
        <button type="button" :class="{ on: view === 'table' }" :aria-pressed="view === 'table'" @click="setView('table')">Table</button>
        <button type="button" :class="{ on: view === 'cards' }" :aria-pressed="view === 'cards'" @click="setView('cards')">Cards</button>
      </div>
    </div>

    <!-- Table (default) -->
    <section class="card" v-if="view === 'table'">
      <Paged :items="shown" v-slot="{ pageRows }">
        <div class="table-wrap">
          <table class="table lb-table">
            <thead><tr><th>Listing</th><th>Subject</th><th>Property</th><th>Unit</th><th>Type</th><th class="num">Size (sq ft)</th><th>Owner</th><th>Contact number</th><th>Email</th><th>Source</th><th>Date</th><th>Stage</th><th>Status</th><th>Remarks</th><th class="num">Aging</th></tr></thead>
            <tbody>
              <template v-for="r in pageRows" :key="r.key">
                <tr :class="{ clickable: !!r.listingId }" @click="open(r)">
                  <td><b>{{ r.listingId || '—' }}</b><button v-if="!r.listingId && canStart && r.status === 'new'" class="btn btn-primary btn-sm lb-start" @click.stop="$emit('start', r.lead)" :disabled="busy">Start</button></td>
                  <td class="wrap">{{ r.subject || '—' }}</td>
                  <td>{{ r.property || '—' }}</td>
                  <td>{{ r.unit || '—' }}</td>
                  <td>{{ r.unitType || '—' }}</td>
                  <td class="num">{{ r.sizeSqft || '—' }}</td>
                  <td>{{ r.ownerName || '—' }}</td>
                  <td><span v-if="!canSeeContact" class="muted">Restricted</span><template v-else>{{ r.listingId ? contactOf(r.listingId).ownerPhone || '—' : '—' }}</template></td>
                  <td class="wrap"><span v-if="!canSeeContact" class="muted">Restricted</span><template v-else>{{ r.listingId ? contactOf(r.listingId).ownerEmail || '—' : '—' }}</template></td>
                  <td>{{ r.source || '—' }}</td>
                  <td>{{ full(r.date) || '—' }}</td>
                  <td class="nowrap">{{ r.listing ? stageText(r.listing) : '—' }}</td>
                  <td><span class="pill" :class="LEAD_STATUS[r.status].pill">{{ LEAD_STATUS[r.status].label }}</span></td>
                  <td class="wrap remarks">{{ r.remarks || '—' }}</td>
                  <td class="num nowrap">{{ r.aging.text }}</td>
                </tr>
              </template>
              <SkeletonRows v-if="loading && !shown.length" table :cols="15" />
              <tr v-show="!loading && !shown.length"><td colspan="15" class="muted">No owner leads here.</td></tr>
            </tbody>
          </table>
        </div>
      </Paged>
    </section>

    <!-- Cards -->
    <template v-else>
      <Paged :items="shown" :size="9" v-slot="{ pageRows }">
        <div class="lb-cards">
          <template v-for="r in pageRows" :key="r.key">
            <article class="card lb-card" :class="{ clickable: !!r.listingId }" @click="open(r)">
              <div class="lb-card-top"><b class="lb-id">{{ r.listingId || 'New lead' }}</b><span class="pill" :class="LEAD_STATUS[r.status].pill">{{ LEAD_STATUS[r.status].label }}</span></div>
              <!-- 1. What it is: subject, then the property and unit -->
              <h3 class="lb-head">{{ r.subject || [r.property, r.unit].filter(Boolean).join(' · ') || 'Property not set' }}</h3>
              <div class="lb-place" v-if="r.subject && (r.property || r.unit)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6" /></svg>
                <span>{{ [r.property, r.unit].filter(Boolean).join(' · ') }}</span>
              </div>
              <div class="lb-place none" v-else-if="r.subject">Property not set</div>
              <!-- 2. Details as small tags -->
              <div class="lb-tags" v-if="r.ownerName || r.unitType || r.sizeSqft || r.source">
                <span class="lb-tag owner" v-if="r.ownerName">{{ r.ownerName }}</span>
                <span class="lb-tag" v-if="r.unitType">{{ r.unitType }}</span>
                <span class="lb-tag" v-if="r.sizeSqft">{{ `${r.sizeSqft} sq ft` }}</span>
                <span class="lb-tag" v-if="r.source">{{ r.source }}</span>
              </div>
              <!-- 3. Progress -->
              <div class="lb-progbox" v-if="r.listing">
                <div class="lb-progline"><b>{{ `Stage ${stageText(r.listing)}` }}</b><span>{{ `${progressOf(r.listing).done} of ${progressOf(r.listing).total} done` }}</span></div>
                <div class="lb-prog" aria-hidden="true"><span :style="{ width: progressOf(r.listing).pct + '%' }"></span></div>
              </div>
              <!-- 4. Remarks -->
              <div class="lb-rem" v-if="r.remarks"><span>Remarks</span><p>{{ r.remarks }}</p></div>
              <div class="lb-card-foot"><span class="muted">{{ [full(r.date), r.aging.text].filter(Boolean).join(' · ') }}</span>
                <button v-if="!r.listingId && canStart && r.status === 'new'" class="btn btn-primary btn-sm" @click.stop="$emit('start', r.lead)" :disabled="busy">Start listing</button></div>
            </article>
          </template>
        </div>
      </Paged>
      <SkeletonRows v-if="loading && !shown.length" :rows="3" />
      <div class="card muted lb-none" v-show="!loading && !shown.length">No owner leads here.</div>
    </template>
  </div>
</template>

<script>
// Owner Leads list (13 Nov 2026, Khairul: Owner Leads and Listing Flow are one page). Every lead: the TMS Owner Leads
// board cards not started yet (New, with Start) and every listing. Table by default, or Cards; the choice is remembered
// in this browser (wb.ownerLeadsView). Every status shows; the status cards and filters narrow the list.
import { LEAD_STATUS, LEAD_KEYS, SOURCES, matches, full, listingLink, loadContact, stageText, stagesFor, stageDoneOf } from '@/lib/owner-leads.js';
import OptionPicker from '@/components/OptionPicker.vue';

const HINTS = { new: 'On the board, not started', progress: 'Owner interested', signed: 'Agreement signed', live: 'Handed over to Operations', cancelled: 'Owner not going ahead' };
const VIEW_KEY = 'wb.ownerLeadsView';
const readView = () => { try { return localStorage.getItem(VIEW_KEY) === 'cards' ? 'cards' : 'table'; } catch (_) { return 'table'; } };

export default {
  components: { OptionPicker },
  // rows = leadRows(listings, leads); listings = the rows (toRow) for the stage column and progress
  props: { rows: { type: Array, default: () => [] }, listings: { type: Array, default: () => [] }, loading: Boolean, busy: Boolean, canSeeContact: Boolean, canStart: Boolean },
  emits: ['start'],
  data() { return { LEAD_STATUS, LEAD_KEYS, SOURCES, HINTS, view: readView(), search: '', status: 'all', source: 'all', property: 'all', contacts: {} }; },
  computed: {
    byId() { return new Map(this.listings.map(l => [l.id, l])); },
    withListing() { return this.rows.map(r => ({ ...r, listing: r.listingId ? this.byId.get(r.listingId) || null : null })); },
    propertyList() { return [...new Set(this.rows.map(r => r.property).filter(Boolean))].sort(); },
    shown() {
      const s = this.search.trim().toLowerCase();
      return this.withListing.filter(r => (this.status === 'all' || r.status === this.status) && (this.source === 'all' || r.source === this.source)
        && (this.property === 'all' || r.property === this.property)
        && (!s || matches({ id: r.listingId, property: r.property, unit: r.unit, ownerName: r.ownerName, title: r.subject, remarks: r.remarks }, s)))
        .sort((a, b) => (b.date || '').localeCompare(a.date || '') || String(b.listingId || '').localeCompare(String(a.listingId || '')));
    }
  },
  methods: {
    full, stageText,
    setView(v) { this.view = v; try { localStorage.setItem(VIEW_KEY, v); } catch (_) { /* private window: not remembered */ } },
    count(k) { return this.rows.filter(r => r.status === k).length; },
    open(r) { if (r.listingId) this.$router.push(listingLink(r.listingId)); },
    progressOf(l) { const keys = stagesFor(l), done = keys.filter(k => stageDoneOf(l, k)).length; return { done, total: keys.length, pct: keys.length ? Math.round(done / keys.length * 100) : 0 }; },
    // Owner phone and email, read once per listing as its row is shown (Directors, Procurement and Operations)
    contactOf(id) {
      if (!(id in this.contacts)) {
        this.contacts[id] = { ownerPhone: '…', ownerEmail: '…' };
        queueMicrotask(() => loadContact(id).then(c => { this.contacts[id] = c; }));
      }
      return this.contacts[id];
    }
  }
};
</script>

<style scoped>
.lb-kpis { grid-template-columns: repeat(5, minmax(0, 1fr)); }
@media (max-width: 900px) { .lb-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.lb-tools { flex-wrap: wrap; align-items: center; }
.lb-tools .input { flex: 0 1 340px; max-width: 340px; min-width: 220px; }
.lb-fill { flex: 1; }
.lb-view { display: inline-flex; border: 1px solid var(--border); border-radius: 10px; padding: 3px; gap: 2px; }
.lb-view button { border: 0; background: none; padding: 6px 14px; border-radius: 8px; font: inherit; font-size: 13px; cursor: pointer; color: var(--muted); }
.lb-view button.on { background: var(--accent-soft); color: var(--accent); font-weight: 600; }
.lb-table td { font-size: 13px; }
.lb-start { margin-left: 8px; }
.wrap { overflow-wrap: anywhere; min-width: 120px; }
.remarks { max-width: 220px; }
.nowrap { white-space: nowrap; }
.lb-cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
@media (max-width: 1000px) { .lb-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 640px) { .lb-cards { grid-template-columns: 1fr; } }
.lb-card { display: flex; flex-direction: column; gap: 8px; transition: border-color .15s, transform .15s; }
.lb-card.clickable { cursor: pointer; }
.lb-card.clickable:hover { border-color: var(--accent); transform: translateY(-1px); }
.lb-card-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.lb-id { color: var(--accent); letter-spacing: .02em; }
.lb-card h3 { margin: 0; font-size: 16px; line-height: 1.3; overflow-wrap: anywhere; }
.lb-meta { color: var(--muted); font-size: 13px; overflow-wrap: anywhere; }
/* Header: the TMS card's subject, up to 3 lines; then the property and unit */
.lb-card h3.lb-head { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.lb-card h3.lb-head { margin-top: 2px; }
.lb-place { display: flex; align-items: flex-start; gap: 6px; margin-top: -4px; font-size: 14px; font-weight: 600; color: var(--text-2); overflow-wrap: anywhere; }
.lb-place svg { flex: none; margin-top: 2px; color: var(--accent); }
.lb-place.none { font-weight: 400; font-style: italic; color: var(--muted); }
/* Owner, unit type, size, source: small grey tags; the owner slightly stronger */
.lb-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.lb-tag { padding: 2px 8px; border-radius: 6px; background: var(--chip); color: var(--text-2); font-size: 12px; }
.lb-tag.owner { background: var(--accent-soft); color: var(--accent); font-weight: 600; }
/* Progress in its own soft box */
.lb-progbox { display: grid; gap: 6px; padding: 10px 12px; border-radius: 10px; background: var(--hover); }
.lb-progline { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; font-size: 12px; }
.lb-progline b { color: var(--text); font-weight: 600; }
.lb-progline span { flex: none; color: var(--muted); }
.lb-prog { height: 6px; border-radius: 99px; background: var(--surface); overflow: hidden; }
.lb-prog span { display: block; height: 100%; background: var(--accent); border-radius: 99px; }
/* Remarks: a quote with a coloured edge */
.lb-rem { padding-left: 10px; border-left: 3px solid var(--border); }
.lb-rem span { display: block; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); }
.lb-rem p { margin: 1px 0 0; font-size: 13px; color: var(--text); overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
/* Date and age at the bottom of every card, under a line, so the cards in a row line up */
.lb-card-foot { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: auto; padding-top: 10px; border-top: 1px solid var(--line); font-size: 12px; }
.lb-none { padding: 16px; }
</style>
