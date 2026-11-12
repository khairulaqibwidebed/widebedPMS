<template>
  <section class="card">
    <div class="card-head"><h2>{{ `Owners · ${shownOwners.length}` }}</h2>
      <div class="pills"><button class="pill-btn" :class="{ on: !showInactive }" @click="showInactive = false">Active</button><button class="pill-btn" :class="{ on: showInactive }" @click="showInactive = true">Deactivated</button></div></div>
    <p class="card-intro" v-if="acc.canEdit">Owner names and contact details are personal data (PDPA): Accounting, Directors and Marketing see them. Click an owner to edit. Bank details stay with Accounting.</p>
    <p class="card-intro" v-else-if="acc.viewOnly && acc.ownerNames">Owner contact and bank details are personal data (PDPA), seen only by Accounting and Directors. This list shows each owner's name and units.</p>
    <p class="card-intro" v-else-if="acc.viewOnly">Owner names, contact and bank details are personal data (PDPA), seen only by Accounting and Directors. This list shows each owner's units only.</p>
    <p class="card-intro" v-else>Owner names and bank details are personal data (PDPA). Only Accounting and Directors can see the full details; this list shows the owner's name and the last 4 digits of the bank account.
      Owner details can later come from the Google Sheet staff already keep (cached copy plus Sync now).</p>
    <div class="toolbar tb-split"><input class="input" type="search" placeholder="Search owner name or unit" v-model="ownerSearch" aria-label="Search owner"><button class="btn btn-primary" @click="$emit('add')" v-if="acc.canAdd">+ Add owner</button></div>
    <Paged :items="shownOwners" v-slot="{ pageRows }">
    <div class="table-wrap">
      <table class="table">
        <thead v-if="acc.viewOnly"><tr><th v-if="acc.ownerNames">Owner</th><th>Units</th><th>Status</th></tr></thead>
        <thead v-else><tr><th>Owner</th><th>Units</th><th>Arrangement</th><th>Paid to</th><th class="num">Carried forward (RM)</th><th></th></tr></thead>
        <tbody>
          <template v-for="own in pageRows" :key="own.id">
            <tr v-if="acc.viewOnly" :class="{ clickable: acc.canEdit }" @click="acc.canEdit && $emit('open', own)">
              <td class="strong" v-if="acc.ownerNames">{{ nameOf(own.id) || 'No name saved' }}</td>
              <td>{{ unitsOf(own.id).map(x => propertyId === 'all' ? `${x.unitCode} · ${propertyNameOf(x.propertyId)}` : x.unitCode).join(', ') || '—' }}</td>
              <td><span class="pill" :class="own.active === false ? 'grey' : 'green'">{{ own.active === false ? 'Deactivated' : 'Active' }}</span></td>
            </tr>
            <tr class="clickable" @click="$emit('open', own)" v-else>
              <td class="strong">{{ nameOf(own.id) || 'No name saved' }}</td>
              <td>{{ unitsOf(own.id).map(x => x.unitCode).join(', ') || '—' }}</td>
              <td>{{ [...new Set(unitsOf(own.id).map(x => arrLabel(x.terms?.arrangement)))].join(', ') || '—' }}</td>
              <td>{{ own.bankLast4 ? `Bank transfer ···${own.bankLast4}` : '—' }}</td>
              <td class="num" :class="{ 'neg-amt': carriedOf(own.id) < 0 }">{{ amt(carriedOf(own.id)) }}</td>
              <td class="num"><button class="navlink" @click.stop="$emit('open', own)">View</button></td>
            </tr>
          </template>
          <SkeletonRows v-if="loading && !shownOwners.length" table :cols="acc.viewOnly ? (acc.ownerNames ? 3 : 2) : 6" />
          <tr v-show="!loading && !shownOwners.length"><td :colspan="acc.viewOnly ? (acc.ownerNames ? 3 : 2) : 6" class="muted">{{ acc.viewOnly ? 'No owners here.' : 'No owners here yet. Add one, then link their units on the Units tab.' }}</td></tr>
        </tbody>
      </table>
    </div>
    </Paged>
    <div class="card-foot"><span>{{ `Showing ${shownOwners.length} of ${owners.length} owners` }}</span></div>
  </section>
</template>

<script>
// The owners table with its search and Active / Deactivated pills. Used by the Owners page (every owner, or the
// owners of the property picked there) and a property's Owners tab. Clicking a row asks the page to open the drawer.
import { amt } from '@/lib/format.js';
import { arrLabel, ownerName, ownerUnits, carried } from '@/lib/portfolio-data.js';

export default {
  props: {
    owners: { type: Array, required: true },
    units: { type: Array, required: true },
    properties: { type: Array, required: true },
    bfLines: { type: Array, required: true },
    propertyId: { type: String, required: true },   // 'all' or one property
    acc: { type: Object, required: true },
    loading: { type: Boolean, default: false }
  },
  emits: ['open', 'add'],
  data() { return { ownerSearch: '', showInactive: false }; },
  computed: {
    property() { return this.properties.find(p => p.id === this.propertyId) || {}; },
    shownOwners() {
      const q = this.ownerSearch.trim().toLowerCase();
      const pid = this.propertyId;
      return this.owners.filter(x => (this.showInactive ? x.active === false : x.active !== false)
        && (pid === 'all' || this.unitsOf(x.id).some(y => y.propertyId === pid) || (pid !== 'all' && this.property.info?.ownerId === x.id))
        && (!q || (x.code || x.id).toLowerCase().includes(q) || this.nameOf(x.id).toLowerCase().includes(q) || this.unitsOf(x.id).some(y => y.unitCode.toLowerCase().includes(q))));
    }
  },
  methods: {
    amt, arrLabel,
    nameOf(id) { return ownerName(this.owners, id); },
    unitsOf(id) { return ownerUnits(this.units, id); },
    carriedOf(id) { return carried(this.units, this.bfLines, id); },
    propertyNameOf(id) { return this.properties.find(p => p.id === id)?.name || ''; }
  }
};
</script>
