<template>
  <div>
    <section class="kpis">
      <button type="button" class="card kpi kpi-link" @click="$emit('units', 'all')"><div class="label">Units</div><div class="value">{{ units.length }}</div><div class="hint">{{ acc.viewOnly ? typeText(units) || 'None yet' : mixText(units) || 'None yet' }}</div></button>
      <button type="button" class="card kpi kpi-link" v-if="acc.viewOnly" @click="$emit('tab', 'owners')"><div class="label">Owners</div><div class="value">{{ new Set(units.map(x => x.ownerId).filter(Boolean)).size }}</div><div class="hint">Linked to these units</div></button>
      <template v-else>
        <button type="button" class="card kpi kpi-link" @click="$emit('units', 'fixed')"><div class="label">Fixed rent a month</div><div class="value small">{{ `RM ${amt(fixedTotal)}` }}</div><div class="hint">{{ `${units.filter(x => isFixedTerms(x.terms)).length} fixed-rent units` }}</div></button>
        <RouterLink class="card kpi kpi-link" :to="`/Finance/month-end?property=${property.id}&month=${asOf}`" title="Open Month-end payout"><div class="label">{{ `${monthOnly(asOf)} statements` }}</div><div class="value small">{{ done ? 'Completed' : 'Open' }}</div><div class="hint">Month-end payout</div></RouterLink>
        <button type="button" class="card kpi kpi-link" @click="$emit('units', 'none')"><div class="label">Needs attention</div><div class="value" :class="{ alert: units.filter(x => !x.terms).length }">{{ units.filter(x => !x.terms).length }}</div><div class="hint">Units not set up</div></button>
      </template>
    </section>
    <section class="card">
      <div class="card-head"><h2>Property details</h2><button class="editlink" @click="$emit('edit')" v-if="!acc.viewOnly || acc.canEdit">Edit ›</button></div>
      <div class="info-grid">
        <div>
          <div class="kv"><span>Property name</span><span>{{ property.name }}</span></div>
          <div class="kv"><span>Short code</span><span>{{ property.code || '—' }}</span></div>
          <div class="kv"><span>Address</span><span>{{ info.address || '—' }}</span></div>
          <div class="kv"><span>City · State</span><span>{{ `${info.city || '—'} · ${info.state || '—'}` }}</span></div>
        </div>
        <div>
          <div class="kv"><span>eZee account number</span><span>{{ info.ezeeAccount || '—' }}</span></div>
          <div class="kv"><span>Name in the eZee report</span><span>{{ info.ezeeName || '—' }}</span></div>
          <p class="help">{{ acc.viewOnly ? 'Each unit\'s owner, type and rooms are on the Units tab.' : 'Unit details (owner, type, rooms, size, car parks, bill accounts, JMB) are on each unit: Units tab, Edit.' }}</p>
        </div>
      </div>
    </section>
  </div>
</template>

<script>
// A property's Overview tab: summary cards (each opens the Units tab with a filter) and the property's details.
import { amt } from '@/lib/format.js';
import { mixText, typeText, monthOnly, isFixedTerms } from '@/lib/portfolio-data.js';

export default {
  props: {
    property: { type: Object, required: true },
    units: { type: Array, required: true },
    asOf: { type: String, required: true },
    done: { type: Boolean, default: false },   // the month's statements are completed
    acc: { type: Object, required: true }
  },
  emits: ['units', 'tab', 'edit'],
  computed: {
    info() { return this.property.info || {}; },
    fixedTotal() { return this.units.filter(x => isFixedTerms(x.terms)).reduce((s, x) => s + (Number(x.terms.fixedRentAmount) || 0), 0); }
  },
  methods: { amt, mixText, typeText, monthOnly, isFixedTerms }
};
</script>
