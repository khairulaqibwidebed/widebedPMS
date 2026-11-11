<template>
  <section class="card" aria-label="Types of service">
    <div class="card-head"><h2>{{ `${n}. Types of service` }}</h2>
      <span class="pill" :class="sv.rentType ? 'green' : sv.legacy ? 'amber' : 'grey'">{{ sv.rentType ? `${rentLabel(sv.rentType)} rent` : sv.legacy ? 'Not set (older listing)' : 'Not set' }}</span></div>
    <p class="help" v-if="sv.legacy && !sv.rentType">This listing was started before Types of service. Renovation and amenities are ticked so its stages stay as they were; choose the rent type when you know it.</p>

    <div class="form-sec">Rent type</div>
    <div class="ag-opts sv-rent" role="group" aria-label="Rent type">
      <template v-for="r in RENT_TYPES" :key="r.key">
        <button type="button" class="ag-opt" :class="{ sel: sv.rentType === r.key }" :aria-pressed="sv.rentType === r.key" :disabled="!canEdit" @click="pickRent(r.key)">
          <span class="ag-radio"></span><span><b>{{ r.label }}</b><small>{{ `${r.hint} · service fee ${SERVICE_FEE[r.key]}%` }}</small></span>
        </button>
      </template>
    </div>
    <p class="help" v-if="sv.rentType">{{ `Service fee: ${SERVICE_FEE[sv.rentType]}% of the net receivable rental. At Live it can be filled in as the unit's fee in Portfolio.` }}</p>

    <div class="form-sec">Services</div>
    <div class="mk-grid sv-grid">
      <template v-for="x in shownServices" :key="x.key">
        <label class="mk-tile" :class="{ on: sv.items[x.key] }">
          <input type="checkbox" :checked="sv.items[x.key]" :disabled="!canEdit" @change="toggle(x, $event)">
          <span><b>{{ x.label }}</b><small>{{ hintOf(x) }}</small></span>
        </label>
      </template>
    </div>
    <p class="help" v-if="sv.rentType === 'yearly'">Short-term rent amenities are not offered for Yearly rent, so there is no Furniture stage.</p>
    <p class="help" v-if="kept.length">{{ `Kept but left out of the quotation (unticked): ${kept.join(', ')}.` }}</p>

    <div class="form-sec">Yearly maintenance package</div>
    <div class="sv-pk" role="group" aria-label="Maintenance package">
      <template v-for="p in PACKAGES" :key="p.key">
        <label class="tick"><input type="radio" name="svPkg" :value="p.key" v-model="sv.maintenance" :disabled="!canEdit"> {{ p.price ? `${p.label} · ${rm(p.price)} a year` : p.label }}</label>
      </template>
    </div>
    <p class="help">The package is added to the final quotation.</p>

    <div class="field" style="margin-top:12px"><label for="svNotes">Notes</label>
      <textarea class="input" id="svNotes" v-if="canEdit" v-model="sv.notes" placeholder="e.g. Owner wants advertising only from January"></textarea>
      <p class="pre" v-else>{{ sv.notes || '—' }}</p></div>
  </section>
</template>

<script>
// Stage: Types of service (rent type, the services the owner takes, the yearly maintenance package). Ticking
// "Renovation & interior design" shows the Renovation stage, "Short-term rent amenities" the Furniture stage. Unticking
// one whose stage has something in it asks first; its items are kept but left out of the quotation.
import { RENT_TYPES, SERVICES, SERVICE_FEE, PACKAGES, rentLabel, serviceOn, stageHasContent, rm } from '@/lib/owner-leads.js';
import { askConfirm } from '@/lib/confirm.js';

export default {
  props: { d: { type: Object, required: true }, canEdit: Boolean, n: { type: Number, default: 2 } },
  data() { return { RENT_TYPES, SERVICE_FEE, PACKAGES }; },
  computed: {
    sv() { return this.d.services; },
    shownServices() { return SERVICES.filter(x => !(x.notFor || []).includes(this.sv.rentType)); },
    // Stages with content whose service is off now
    kept() { return SERVICES.filter(x => x.stage && !serviceOn(this.d, x.key) && stageHasContent(this.d, x.stage)).map(x => x.label); }
  },
  methods: {
    rentLabel, rm,
    hintOf(x) { return typeof x.hint === 'string' ? x.hint : x.hint[this.sv.rentType || '']; },
    // Losing a stage that has content: ask first. Resolves true to go ahead.
    async okToHide(x) {
      if (!x.stage || !serviceOn(this.d, x.key) || !stageHasContent(this.d, x.stage)) return true;
      return askConfirm({ title: `Hide the ${x.stage === 'renovation' ? 'Renovation' : 'Furniture'} stage?`,
        message: `${x.label} has items in its stage. They are kept, but left out of the quotation until it is ticked again.`, confirmText: 'Untick' });
    },
    async toggle(x, e) {
      const want = e.target.checked;
      if (!want && !(await this.okToHide(x))) { e.target.checked = true; return; }
      this.sv.items[x.key] = want;
    },
    async pickRent(key) {
      if (key === this.sv.rentType) return;
      // Yearly: no short-term amenities (and so no Furniture stage)
      const lost = SERVICES.filter(x => (x.notFor || []).includes(key));
      for (const x of lost) if (!(await this.okToHide(x))) return;
      this.sv.rentType = key;
    }
  }
};
</script>

<style scoped>
.ag-opts.sv-rent { grid-template-columns: repeat(3, minmax(0, 1fr)); }
@media (max-width: 600px) { .ag-opts.sv-rent { grid-template-columns: minmax(0, 1fr); } }
.sv-grid { grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }
.sv-grid .mk-tile span { display: grid; gap: 2px; text-align: left; }
.sv-grid .mk-tile small { font-weight: 400; color: var(--muted); font-size: 12px; }
.sv-pk { display: flex; flex-wrap: wrap; }
</style>
