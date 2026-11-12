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
          <!-- State (12 Nov 2026): required; staff only see properties in their states. Once set, only a Director changes it. -->
          <div class="field"><label for="pState" class="req">State</label>
            <select class="input" id="pState" v-model="np.info.state" :disabled="stateLocked"><option value="">Select state</option>
              <template v-for="st in stateOptions" :key="st"><option :value="st" :selected="st === np.info.state">{{ st }}</option></template></select>
            <span class="help" v-if="stateLocked">{{ np.id && oldState ? 'Only a Director can move a property to another state.' : 'A Director sets the state of this property.' }}</span>
            <span class="help" v-else-if="np.id && oldState && np.info.state !== oldState">{{ `Moves ${np.name || 'this property'} from ${oldState} to ${np.info.state}. Staff in ${oldState} stop seeing it.` }}</span>
            <span class="help" v-else-if="!np.id && !stateOptions.length">Your account has no state yet. Ask HR or a Director to set one on Staff accounts.</span></div>
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
import { PROP_INFO, noteOnListing, updateProperty, createProperty, forgetProperties, forgetUnits } from '@/lib/portfolio-data.js';
import { normState, stateOf, stateChoices, clashIn, newPropertyId } from '@/lib/states.js';
import { stampProperty, STAMP_STATES } from '@/lib/state-stamp.js';

const me = useSession();

export default {
  props: {
    property: { type: Object, default: null },     // the property to edit, or null to add one
    prefill: { type: Object, default: null },      // fields from a new owner listing (Create property)
    properties: { type: Array, required: true },   // to stop a second property with the same name or code in the same state
    acc: { type: Object, required: true }
  },
  emits: ['close', 'saved', 'created', 'busy'],
  data() {
    const p = this.property, i = p?.info || {}, mine = stateChoices(me);
    // A new property starts in my state when I have only one
    const start = p ? stateOf(p) : (mine.length === 1 ? mine[0] : '');
    return {
      busy: false, oldState: p ? stateOf(p) : '',
      np: { id: p?.id || null, name: p?.name || '', code: p?.code || '', reason: '', error: '', original: p,
        info: { address: '', city: '', ezeeAccount: '', ezeeName: '', ...i, state: start }, ...(this.prefill || {}) }
    };
  },
  computed: {
    isDirector() { return me.role === 'director'; },
    // Editing: only a Director sets or changes the state. Adding: anyone, from their own states.
    stateLocked() { return !!this.np.id && !this.isDirector; },
    stateOptions() {
      const list = [...stateChoices(me)];
      if (this.np.info.state && !list.includes(this.np.info.state)) list.push(this.np.info.state);
      return list;
    }
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
      info.state = normState(info.state);
      if (!info.state && !(p.id && !this.isDirector)) return p.error = 'Choose the state.';
      if (p.id && !this.isDirector) info.state = this.oldState;   // the rules refuse anyone else's change anyway
      const clash = clashIn(this.properties, { name, code, state: info.state }, p.id);
      if (clash && (!p.id || name !== p.original.name || info.state !== this.oldState)) return p.error = clash;
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
          // A Director moved the property to another state: its records follow (units, bookings, statements ...)
          let moved = '';
          if (STAMP_STATES && this.isDirector && info.state && info.state !== stateOf(p.original)) {   // off: access is by property (12 Nov 2026)
            try {
              const n = await stampProperty(me, p.id, info.state);
              moved = n ? ` ${n} of its records now show ${info.state}.` : '';
            } catch (e) { moved = ` Its records were not all moved to ${info.state} (${friendlyError(e, 'update them')}). Run Stamp states to finish.`; }
          }
          this.$emit('saved', `${name} saved.${moved}`);
        } catch (e) { p.error = friendlyError(e, 'save the property'); }
        this.setBusy(false);
        return;
      }
      this.setBusy(true);
      try {
        // New id: the name, or name-state when another state already has it (existing ids never change)
        const id = await newPropertyId(name, info.state);
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
