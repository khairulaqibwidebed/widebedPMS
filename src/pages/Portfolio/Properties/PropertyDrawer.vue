<template>
  <div>
    <div class="drawer-back" @click="$emit('close')"></div>
    <aside class="drawer wide" role="dialog" aria-label="Property" v-esc="() => $emit('close')">
      <div class="drawer-head"><h2>{{ np.id ? `Edit property · ${np.name}` : 'Add property' }}</h2><button class="icon-btn" @click="$emit('close')" aria-label="Close">×</button></div>
      <form class="drawer-body" id="propForm" @submit.prevent="save()">
        <div class="notice error" v-show="np.error">{{ np.error }}</div>
        <p class="help from-listing" v-if="np.fromListing">{{ `Filled in from new owner listing ${np.fromListing.listingId}. Add the short code and the rest, then Add property.` }}</p>
        <div class="form-sec">Property details</div>
        <div class="grid-fields">
          <div class="field"><label for="pName" class="req">Property name</label><input class="input" id="pName" v-model="np.name" placeholder="e.g. D'Majestic"></div>
          <div class="field"><label for="pCode" class="req">Short code</label><input class="input" id="pCode" v-model="np.code" :readonly="!!np.id" placeholder="e.g. DM">
            <span class="help">Starts every unit number in this property, e.g. DM 07-19.</span></div>
          <div class="field" style="grid-column:1/-1"><label for="pAddr">Address</label><input class="input" id="pAddr" v-model="np.info.address" placeholder="Street address"></div>
          <div class="field"><label for="pCity">City</label><input class="input" id="pCity" v-model="np.info.city" placeholder="e.g. Kuala Lumpur"></div>
          <div class="field"><label for="pState">State</label>
            <select class="input" id="pState" v-model="np.info.state"><option value="">Select state</option>
              <template v-for="st in STATES" :key="st"><option :value="st" :selected="st === np.info.state">{{ st }}</option></template></select></div>
        </div>
        <div class="form-sec">eZee link</div>
        <p class="help" style="margin:-4px 0 10px">Tells the upload which eZee rows belong to this property.</p>
        <div class="grid-fields">
          <div class="field"><label for="pEzAcc">eZee account number</label><input class="input" id="pEzAcc" v-model="np.info.ezeeAccount" placeholder="e.g. 9979">
            <span class="help">Several buildings can share one eZee account.</span></div>
          <div class="field"><label for="pEzName">Name in the eZee report</label><input class="input" id="pEzName" v-model="np.info.ezeeName" placeholder="As it appears in the export"></div>
        </div>
        <div class="field" v-show="np.id"><label for="pWhy" class="req">Reason (audit log)</label><input class="input" id="pWhy" v-model="np.reason" placeholder="e.g. New TNB account number"></div>
        <p class="help" v-show="!np.id">{{ acc.viewOnly ? 'After saving, add its units from the Units tab. It starts with the standard OTA rates; Accounting or a Director can change them. The change is recorded in the audit log.'
          : 'After saving, add its units from the Units tab. It starts with the standard OTA rates (change them under OTA commissions). The change is recorded in the audit log.' }}</p>
      </form>
      <div class="drawer-foot"><button class="btn" @click="$emit('close')">Cancel</button><button class="btn btn-primary" type="submit" form="propForm" :disabled="busy">{{ np.id ? 'Save property' : 'Add property' }}</button></div>
    </aside>
  </div>
</template>

<script>
// Property drawer: add a property (Properties list) or edit one (a property's Overview). Tells the page "saved"
// (edited) or "created" with the new property's id, plus the message to show.
import { friendlyError } from '@/lib/finance-data.js';
import { useSession } from '@/stores/session.js';
import { STATES, PROP_INFO, slug, noteOnListing, updateProperty, createProperty, forgetProperties, forgetUnits } from '@/lib/portfolio-data.js';

const me = useSession();

export default {
  props: {
    property: { type: Object, default: null },     // the property to edit, or null to add one
    prefill: { type: Object, default: null },      // fields from a new owner listing (Create property)
    properties: { type: Array, required: true },   // to stop a second property with the same name or code
    acc: { type: Object, required: true }
  },
  emits: ['close', 'saved', 'created', 'busy'],
  data() {
    const p = this.property, i = p?.info || {};
    return {
      STATES, busy: false,
      np: { id: p?.id || null, name: p?.name || '', code: p?.code || '', reason: '', error: '', original: p,
        info: { address: '', city: '', state: '', ezeeAccount: '', ezeeName: '', ...i }, ...(this.prefill || {}) }
    };
  },
  methods: {
    setBusy(v) { this.busy = v; this.$emit('busy', v); },
    async save() {
      const p = this.np; p.error = '';
      const name = p.name.trim(), code = p.code.trim().toUpperCase();
      if (!name || !code) return p.error = 'Enter the property name and the short code.';
      // Property keeps only these (Khairul 20 Oct); owner, rooms, size and bill accounts are on each unit.
      const info = {};
      for (const k of PROP_INFO) info[k] = String(p.info[k] || '').trim();
      if (p.id) {
        const before = { name: p.original.name, ...(p.original.info || {}) };
        const norm = v => (v == null ? '' : v);
        const changes = Object.entries({ name, ...info }).filter(([k, v]) => norm(before[k]) !== norm(v)).map(([k, v]) => ({ field: k, old: before[k] ?? null, new: v }));
        if (!changes.length) { this.$emit('close'); return; }
        if (!p.reason.trim()) return p.error = 'Add a short reason. It goes in the audit log.';
        this.setBusy(true);
        try {
          await updateProperty(me, p.id, { name, info, changes, reason: p.reason.trim() });
          await forgetProperties(); await forgetUnits(p.id);
          this.$emit('saved', `${name} saved.`);
        } catch (e) { p.error = friendlyError(e, 'save the property'); }
        this.setBusy(false);
        return;
      }
      const id = slug(name);
      if (this.properties.some(x => x.id === id || (x.code || '').toUpperCase() === code)) return p.error = 'A property with this name or code already exists.';
      this.setBusy(true);
      try {
        await createProperty(me, id, { name, code, info });
        const noted = await noteOnListing(me, p.fromListing, 'propertyId', id, 'property');
        await forgetProperties();
        this.$emit('created', id, `${name} added. Upload its eZee report to bring in units, or add them here.${noted}`);
      } catch (e) { p.error = friendlyError(e, 'add the property'); }
      this.setBusy(false);
    }
  }
};
</script>
