<template>
  <div>
    <div class="notice warn" v-show="!acc.viewOnly && notSetUp && (property.code || '').toUpperCase() === 'DM'">
      <span>{{ `${notSetUp} units aren't set up yet.` }}</span> <button class="link" style="margin-left:8px" @click="$emit('starter')" :disabled="busy">{{ `Load D'Majestic starter settings from ${monthName(asOf)}` }}</button>
    </div>
    <section class="card">
      <h2 class="t">{{ `Units · ${units.length}` }}</h2>
      <p class="card-intro" v-if="acc.viewOnly">{{ `Every unit in this property with its owner code, type and rooms. ${acc.canAdd ? 'You can add a unit; changes to' : 'Changes to'} units, fees and rent are made by Accounting and Directors.` }}</p>
      <p class="card-intro" v-else>Click a unit to change its settings (arrangement, owner, fixed rent, eZee name, status). Saving asks which month the change starts from and why, so completed months never change. Every change goes in the audit log below.</p>
      <div class="toolbar">
        <input class="input" type="search" placeholder="Search unit or owner" v-model="search" aria-label="Search unit">
        <div class="pills" v-if="!acc.viewOnly">
          <template v-for="f in UNIT_FILTERS" :key="f.key">
            <button class="pill-btn" :class="{ on: filter === f.key }" @click="$emit('update:filter', f.key)">{{ `${f.label} (${units.filter(x => matchArrangement(x, f.key)).length})` }}</button>
          </template>
        </div>
      </div>
      <Paged :items="shown" v-slot="{ pageRows }">
      <div class="table-wrap">
        <table class="table">
          <thead v-if="acc.viewOnly"><tr><th>Unit</th><th>Owner</th><th>Type</th><th class="num">Bedrooms</th><th class="num">Bathrooms</th><th class="num">Size (sq ft)</th></tr></thead>
          <thead v-else><tr><th>Unit</th><th>Arrangement</th><th>Fixed rent</th><th class="num">Monthly amount (RM)</th><th class="num">Purchase price (RM)</th><th>Effective from</th><th>Last changed</th><th></th></tr></thead>
          <tbody>
            <template v-for="row in pageRows" :key="row.id">
              <tr v-if="acc.viewOnly" :class="{ clickable: acc.canEdit }" @click="acc.canEdit && $emit('open', row)">
                <td class="strong">{{ row.unitCode }}</td>
                <td>{{ labelOf(row.ownerId) || '—' }}</td>
                <td>{{ row.info?.type || '—' }}</td>
                <td class="num">{{ row.info?.bedrooms ?? '—' }}</td>
                <td class="num">{{ row.info?.bathrooms ?? '—' }}</td>
                <td class="num">{{ row.info?.sizeSqft ?? '—' }}</td>
              </tr>
              <tr class="clickable" :class="{ future: futureOf(row) }" @click="$emit('open', row)" v-else>
                <td class="strong">{{ row.unitCode }}</td>
                <td><span v-show="row.terms">{{ arrLabel(row.terms?.arrangement) }}</span><span class="pill amber" v-show="!row.terms">Not set up</span></td>
                <td><span class="toggle" :class="{ on: isFixedTerms(row.terms) }" role="img" :aria-label="isFixedTerms(row.terms) ? 'Fixed rent on' : 'Fixed rent off'"></span></td>
                <td class="num">{{ isFixedTerms(row.terms) ? amt(row.terms.fixedRentAmount) : '—' }}</td>
                <td class="num">{{ row.purchasePrice != null && row.purchasePrice !== '' ? amt(row.purchasePrice) : '—' }}</td>
                <td>{{ row.terms ? shortName(row.terms.effectiveFrom === '2000-01' ? asOf : row.terms.effectiveFrom) : '—' }}</td>
                <td>
                  <span>{{ lastChanged(row) }}</span>
                  <span class="sub-line" v-show="futureOf(row)">{{ futureText(row) }}</span>
                </td>
                <td class="num"><button class="editlink" @click.stop="$emit('open', row)">Edit ›</button></td>
              </tr>
            </template>
            <tr v-show="!loading && !shown.length"><td :colspan="acc.viewOnly ? 6 : 8" class="muted">No units match.</td></tr>
          </tbody>
        </table>
      </div>
      </Paged>
      <div class="card-foot"><span>{{ acc.viewOnly ? `Showing ${shown.length} of ${units.length} units` : `Showing ${shown.length} of ${units.length} units · ${units.filter(x => isFixedTerms(x.terms)).length} on fixed rent · RM ${amt(fixedTotal)} a month` }}</span></div>
    </section>

    <section class="card" style="margin-top:20px" v-if="!acc.viewOnly">
      <h2 class="t">Audit log · unit settings</h2>
      <p class="card-intro">Every change is recorded with who, when, old and new value, effective month and reason. Saving asks for the reason. Entries can't be edited or deleted.</p>
      <Paged :items="unitAudits" keep-page @page="$emit('audit-page', $event)" v-slot="{ pageRows }">
      <div class="table-wrap">
        <table class="table audit-tbl hover-rows">
          <colgroup><col style="width:170px"><col style="width:130px"><col style="width:110px"><col><col style="width:120px"><col style="width:22%"></colgroup>
          <thead><tr><th>When</th><th>Who</th><th>Unit</th><th>Change</th><th>Effective from</th><th>Reason</th></tr></thead>
          <tbody>
            <template v-for="a in pageRows" :key="a.id">
              <tr><td class="nw">{{ stamp(a.at) }}</td><td class="nw">{{ a.userName || '' }}</td><td class="nw">{{ unitCodeOf(a.entity) }}</td>
                <td><div class="chg" v-for="(c, i) in changeList(a)" :key="i">{{ c }}</div></td><td>{{ a.month ? shortName(a.month) : '—' }}</td><td>{{ a.reason || '—' }}</td></tr>
            </template>
            <tr v-show="!unitAudits.length"><td colspan="6" class="muted">No unit changes recorded yet.</td></tr>
          </tbody>
        </table>
      </div>
      </Paged>
      <div class="more-row" v-show="auditMore && unitAudits.length <= 10"><button type="button" class="btn" @click="$emit('more-audits')" :disabled="auditBusy">Load 30 more changes</button></div>
    </section>
  </div>
</template>

<script>
// A property's Units tab: the units table with search and arrangement filters, and the unit settings audit log.
// Clicking a unit asks the page to open the unit drawer.
import { amt, monthName, stamp } from '@/lib/format.js';
import { UNIT_FILTERS, matchArrangement, arrLabel, isFixedTerms, shortName, dateOnly, prevMonth, msOf, changeList, ownerLabel } from '@/lib/portfolio-data.js';

export default {
  props: {
    property: { type: Object, required: true },
    units: { type: Array, required: true },
    owners: { type: Array, required: true },
    audits: { type: Array, required: true },
    auditMore: { type: Boolean, default: false },
    auditBusy: { type: Boolean, default: false },
    filter: { type: String, default: 'all' },   // set by the page, so the Overview cards can open the tab filtered
    asOf: { type: String, required: true },
    busy: { type: Boolean, default: false },
    loading: { type: Boolean, default: false },
    acc: { type: Object, required: true }
  },
  emits: ['open', 'starter', 'update:filter', 'audit-page', 'more-audits'],
  data() { return { UNIT_FILTERS, search: '' }; },
  computed: {
    notSetUp() { return this.units.filter(x => !x.terms).length; },
    fixedTotal() { return this.units.filter(x => isFixedTerms(x.terms)).reduce((s, x) => s + (Number(x.terms.fixedRentAmount) || 0), 0); },
    shown() {
      const q = this.search.trim().toLowerCase();
      return this.units.filter(x => matchArrangement(x, this.filter) && (!q || x.unitCode.toLowerCase().includes(q) || this.labelOf(x.ownerId).toLowerCase().includes(q)));
    },
    unitAudits() { return this.audits.filter(x => /^unit/.test(x.action || '')); }
  },
  methods: {
    amt, monthName, stamp, arrLabel, shortName, changeList, matchArrangement, isFixedTerms,
    labelOf(id) { return ownerLabel(this.owners, id, this.acc.viewOnly); },
    unitCodeOf(e) { const id = (e || '').split('/')[1]; return this.units.find(x => x.id === id)?.unitCode || '—'; },
    newest(row) { return [...(row.termHistory || [])].sort((a, b) => msOf(b.createdAt) - msOf(a.createdAt))[0]; },
    lastChanged(row) { const h = this.newest(row); return h ? `${dateOnly(h.createdAt)}${h.createdByName ? ' · ' + h.createdByName : ''}` : '—'; },
    futureOf(row) { return (row.termHistory || []).filter(h => h.effectiveFrom > this.asOf).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))[0] || null; },
    futureText(row) {
      const f = this.futureOf(row); if (!f) return '';
      const now = row.terms;
      const from = `${arrLabel(f.arrangement)}${f.fixedRentAmount ? ' RM ' + amt(f.fixedRentAmount) : ''} from ${shortName(f.effectiveFrom)}`;
      return isFixedTerms(now) ? `RM ${amt(now.fixedRentAmount)} until ${shortName(prevMonth(f.effectiveFrom))} · then ${from}` : `Changes to ${from}`;
    }
  }
};
</script>
