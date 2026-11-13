<template>
  <section class="card" aria-label="Service Agreement Signed">
    <div class="card-head"><h2>{{ `${n}. Service Agreement Signed` }}</h2><span class="pill" :class="done ? (d.agreement.signed ? 'green' : 'amber') : 'grey'">{{ d.agreement.signed ? 'Signed' : d.agreement.skipped ? 'Skipped for now' : 'Not yet' }}</span></div>

    <!-- Property and owners (13 Nov 2026): needed for Signed (not for Skip); Signed makes them in Portfolio -->
    <div class="form-sec">Property &amp; owners</div>
    <div class="notice ok ag-in" v-if="allIn">{{ `In Portfolio: property ${pf.propertyId} · owner ${pf.ownerId} · unit ${pf.unitId}. Change them in Portfolio from now on.` }}</div>
    <div class="ag-grid">
      <div class="field"><label for="agProp" :class="{ req: !locked }">Property</label>
        <OptionPicker class="full-pick" :model-value="d.party.propertyId" @update:model-value="pickProperty" :options="propertyOptions" label="Property" searchable :disabled="!canEdit || locked" /></div>
      <template v-if="!d.party.propertyId">
        <FormField id="agPName" label="New property name" :req="!locked" v-model="d.property" placeholder="e.g. D'Majestic" :disabled="!canEdit || locked" />
        <FormField id="agPCode" label="Property code" :req="!locked" v-model="d.party.propertyCode" placeholder="e.g. DM" :disabled="!canEdit || locked" />
      </template>
      <div class="field"><label for="agState" :class="{ req: !locked }">State</label>
        <OptionPicker class="full-pick" v-model="d.state" :options="[{ value: '', label: 'Choose the state' }, ...STATES.map(s => ({ value: s, label: s }))]" label="State" :disabled="!canEdit || locked || !!d.party.propertyId" /></div>
      <FormField id="agUnit" label="Unit code" :req="!locked" v-model="d.unit" placeholder="e.g. DM 12-03" :disabled="!canEdit || locked" />
      <div class="field"><label for="agUType">Unit type</label><select class="select" id="agUType" v-model="d.unitType" :disabled="!canEdit || locked"><option value="">Not set</option><template v-for="t in UNIT_TYPES" :key="t"><option :value="t">{{ t }}</option></template></select></div>
      <FormField id="agSize" label="Size (sq ft)" v-model="d.sizeSqft" inputmode="numeric" placeholder="e.g. 850" :disabled="!canEdit || locked" />
    </div>

    <div class="ag-grid">
      <div class="field ag-span"><label for="agOwner" :class="{ req: !locked }">Owner</label>
        <OptionPicker class="full-pick" :model-value="d.party.ownerId" @update:model-value="pickOwner" :options="ownerOptions" label="Owner" searchable :disabled="!canEdit || locked" /></div>
      <template v-if="!d.party.ownerId">
        <FormField id="agOName" label="Owner full name" :req="!locked" v-model="d.ownerName" placeholder="As on the IC" :disabled="!canEdit || locked" />
        <template v-if="canSeeContact">
          <FormField id="agOIc" label="IC" :req="!locked" v-model="c.ownerIc" placeholder="e.g. 800101-14-5555" :disabled="!canEdit || locked" />
          <FormField id="agOPhone" label="Phone" :req="!locked" v-model="c.ownerPhone" inputmode="tel" placeholder="e.g. 012-345 6789" :disabled="!canEdit || locked" />
          <FormField id="agOEmail" label="Email" type="email" v-model="c.ownerEmail" placeholder="e.g. owner@example.com" :disabled="!canEdit || locked" />
        </template>
      </template>
    </div>
    <template v-if="!d.party.ownerId && canSeeContact">
      <template v-for="(co, i) in c.coOwners" :key="i">
        <div class="ag-co">
          <div class="ag-co-head"><b>{{ `Joint owner ${i + 1}` }}</b><button type="button" class="editlink" v-if="canEdit && !locked" @click="c.coOwners.splice(i, 1)">Remove</button></div>
          <div class="ag-grid">
            <FormField :id="`agCoN${i}`" label="Full name" :req="!locked" v-model="co.fullName" :disabled="!canEdit || locked" />
            <FormField :id="`agCoI${i}`" label="IC" v-model="co.ic" :disabled="!canEdit || locked" />
            <FormField :id="`agCoP${i}`" label="Phone" v-model="co.phone" inputmode="tel" :disabled="!canEdit || locked" />
            <FormField :id="`agCoE${i}`" label="Email" type="email" v-model="co.email" :disabled="!canEdit || locked" />
          </div>
        </div>
      </template>
      <button type="button" class="editlink" v-if="canEdit && !locked" @click="c.coOwners.push({ fullName: '', ic: '', phone: '', email: '' })">+ Add joint owner</button>
    </template>
    <p class="help" v-if="!canSeeContact && !d.party.ownerId">The owner's IC, phone, email and joint owners are filled in by Directors, Procurement or Operations.</p>
    <p class="help" v-if="!locked">Bank details are added later by Accounting in Portfolio. Skip for now needs none of this.</p>

    <!-- Signed on the saved listing but not (all) in Portfolio yet: make the rest -->
    <div class="notice warn ag-in" v-if="saved.agreement.signed && !allIn">
      <span>{{ inPortfolio ? 'Part of it is in Portfolio; the rest is not made yet.' : 'Signed, but the property, owner and unit are not in Portfolio yet.' }}</span>
      <button class="btn" v-if="canEdit && canAddPortfolio" @click="$emit('create-portfolio')" :disabled="busy || dirty || missing.length > 0" :title="dirty ? 'Save first' : missing.length ? 'Fill in what is missing first' : ''">Create in Portfolio</button>
    </div>

    <div class="form-sec">Agreement</div>
    <template v-if="canEdit">
      <div class="ag-opts" role="group" aria-label="Service agreement">
        <button type="button" class="ag-opt" :class="{ sel: d.agreement.signed }" :aria-pressed="d.agreement.signed" @click="toggleSigned()" :disabled="!d.agreement.signed && missing.length > 0">
          <span class="ag-radio"></span><span><b>Signed</b><small>{{ allIn || saved.agreement.signed ? 'The owner has signed the service agreement.' : 'The owner has signed. Saving makes the property, owner and unit in Portfolio.' }}</small></span>
        </button>
        <button type="button" class="ag-opt amber" :class="{ sel: d.agreement.skipped && !d.agreement.signed }" :aria-pressed="d.agreement.skipped && !d.agreement.signed" @click="toggleSkip()">
          <span class="ag-radio"></span><span><b>Skip for now</b><small>Start renovation first; record the signing later. Nothing is made in Portfolio.</small></span>
        </button>
      </div>
      <p class="help ag-miss" v-if="!d.agreement.signed && missing.length">{{ `Before Signed, add ${missing.join(', ')}.` }}</p>
      <div class="ag-more" v-if="d.agreement.signed">
        <div class="field" style="margin:0;max-width:220px"><label for="agDate">Date signed</label><input class="input" id="agDate" type="date" v-model="d.agreement.date"></div>
        <p class="help" style="margin:8px 0 0" v-if="saved.agreement.skipped && !saved.agreement.signed">{{ `It will be recorded as signed during ${STAGES[currentKeyOf(saved)].label}.` }}</p>
      </div>
      <div class="ag-more amber" v-else-if="d.agreement.skipped">
        <div class="field" style="margin:0"><label for="agNote">Why is it skipped for now? (required)</label>
          <textarea class="input" id="agNote" v-model="d.agreement.skipNote" placeholder="e.g. Owner signs when back from overseas; renovation can start"></textarea></div>
      </div>
    </template>
    <template v-else>
      <div class="kv"><span>Signed</span><span>{{ d.agreement.signed ? `Yes, ${full(d.agreement.date)}` : 'No' }}</span></div>
      <div class="kv" v-if="d.agreement.skipped && !d.agreement.signed"><span>Skipped for now</span><span>{{ d.agreement.skipNote }}</span></div>
    </template>
    <div class="kv" v-if="d.agreement.signed && d.agreement.signedDuringStage"><span>Recorded</span><span>{{ `Signed during ${d.agreement.signedDuringStage}` }}</span></div>
    <p class="help" v-if="d.agreement.signed && d.agreement.skipNote">{{ `Earlier skipped: ${d.agreement.skipNote}` }}</p>
  </section>
</template>

<script>
// Stage: Service Agreement Signed. Edits the draft (d) and the private part (c) in place; the page's Save bar saves them.
// 13 Nov 2026 (Khairul): the property and owners come first. Pick an existing property / owner, or type a new one (owner:
// full name, IC and phone required; joint owners optional; bank details stay with Accounting). One listing = one unit.
// Signed needs all of it (partyMissing); saving it makes the property, owner and unit in Portfolio (the page calls
// createInPortfolio). Skip for now needs none of it and makes nothing.
import { STAGES, UNIT_TYPES, currentKeyOf, stageDoneOf, full, partyMissing, portfolioOf } from '@/lib/owner-leads.js';
import { STATES, stateOf, propertyLabel } from '@/lib/states.js';
import { jointName } from '@/lib/portfolio-data.js';
import OptionPicker from '@/components/OptionPicker.vue';
import FormField from '@/components/FormField.vue';

export default {
  components: { OptionPicker, FormField },
  props: { d: { type: Object, required: true }, c: { type: Object, required: true }, saved: { type: Object, required: true }, portfolio: { type: Object, default: null },
    properties: { type: Array, default: () => [] }, owners: { type: Array, default: () => [] }, canEdit: Boolean, canSeeContact: Boolean, canAddPortfolio: Boolean,
    busy: Boolean, dirty: Boolean, n: { type: Number, default: 1 } },
  emits: ['create-portfolio'],
  data() { return { STAGES, STATES, UNIT_TYPES }; },
  computed: {
    done() { return stageDoneOf(this.d, 'agreement'); },
    pf() { return this.portfolio || {}; },
    inPortfolio() { return !!(this.pf.propertyId || this.pf.ownerId || this.pf.unitId); },
    allIn() { return !!(this.pf.propertyId && this.pf.ownerId && this.pf.unitId); },
    // Once anything is made in Portfolio the property and owner are fixed here (changed in Portfolio)
    locked() { return this.inPortfolio; },
    missing() { return partyMissing(this.d, this.c); },
    propertyOptions() {
      const list = this.properties.map(p => ({ value: p.id, label: propertyLabel(p, this.properties) }));
      if (this.d.party.propertyId && !list.some(o => o.value === this.d.party.propertyId)) list.push({ value: this.d.party.propertyId, label: `${this.d.property || this.d.party.propertyId}` });
      return [{ value: '', label: 'New property (not in Portfolio yet)' }, ...list];
    },
    ownerOptions() {
      const name = o => jointName(o.private?.fullName || o.name || '', o.private?.coOwners) || o.code || o.id;
      const list = this.owners.filter(o => o.active !== false).map(o => ({ value: o.id, label: `${name(o)} (${o.code || o.id})` }));
      if (this.d.party.ownerId && !list.some(o => o.value === this.d.party.ownerId)) list.push({ value: this.d.party.ownerId, label: `${this.d.ownerName || ''} (${this.d.party.ownerId})` });
      return [{ value: '', label: 'New owner' }, ...list];
    }
  },
  methods: {
    currentKeyOf, full, portfolioOf,
    pickProperty(id) {
      const d = this.d, p = this.properties.find(x => x.id === id);
      d.party.propertyId = id || '';
      if (p) {
        d.property = p.name; d.party.propertyCode = p.code || '';
        const st = stateOf(p); if (st) d.state = st;
        // Unit codes start with the property's short code (e.g. "DM 07-19")
        if (p.code && !String(d.unit || '').trim()) d.unit = `${p.code} `;
      }
    },
    pickOwner(id) {
      const d = this.d, o = this.owners.find(x => x.id === id);
      d.party.ownerId = id || '';
      if (o) d.ownerName = jointName(o.private?.fullName || o.name || '', o.private?.coOwners) || d.ownerName;
    },
    toggleSigned() {
      const a = this.d.agreement;
      a.signed = !a.signed;
    },
    toggleSkip() {
      const a = this.d.agreement;
      if (a.signed || !a.skipped) { a.signed = false; a.skipped = true; } else { a.skipped = false; a.skipNote = ''; }
    }
  }
};
</script>

<style scoped>
.ag-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0 14px; }
@media (max-width: 800px) { .ag-grid { grid-template-columns: minmax(0, 1fr); } }
.ag-span { grid-column: 1 / -1; max-width: 520px; }
.ag-grid .field > .select { width: 100%; height: 40px; font-weight: 400; font-size: 14px; padding-left: 12px; }
.ag-co { border: 1px dashed var(--border); border-radius: 10px; padding: 10px 12px; margin: 8px 0; }
.ag-co-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.ag-in { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
.ag-miss { color: var(--amber); }
.ag-opt:disabled { opacity: .55; cursor: not-allowed; }
</style>
