<template>
  <div>
    <div class="page-head">
      <div>
        <h1>New listing</h1>
        <div class="sub">For a new unit that has no task in the task system. Listings that start as a task are started from "From task system" instead.</div>
      </div>
      <div class="head-tools">
        <button class="btn" @click="$emit('cancel')">Cancel</button>
        <button class="btn btn-primary" @click="save()" :disabled="busy">Save listing</button>
      </div>
    </div>
    <div class="notice error" v-show="formError">{{ formError }}</div>
    <section class="card" style="max-width:760px">
      <div class="grid-fields">
        <PropertyField :o="form" :properties="properties" id="nProp" req />
        <FormField id="nUnit" label="Unit" req v-model="form.unit" placeholder="e.g. DM 12-03" />
        <FormField id="nOwner" label="Owner name" req v-model="form.ownerName" placeholder="e.g. Owner A" />
        <FormField id="nDue" label="Due date" type="date" v-model="form.dueDate" />
        <template v-if="canSeeContact">
          <FormField id="nPhone" label="Owner phone" v-model="form.ownerPhone" inputmode="tel" placeholder="e.g. 012-345 6789" />
          <FormField id="nEmail" label="Owner email" type="email" v-model="form.ownerEmail" placeholder="e.g. owner@example.com" />
        </template>
        <div class="field"><label for="nType">Unit type</label><select class="select" id="nType" v-model="form.unitType"><option value="">Not set</option><template v-for="t in UNIT_TYPES" :key="t"><option :value="t">{{ t }}</option></template></select></div>
        <FormField id="nSize" label="Size (sq ft)" v-model="form.sizeSqft" inputmode="numeric" placeholder="e.g. 850" />
        <div class="field"><label for="nSrc">Source</label><select class="select" id="nSrc" v-model="form.source"><option value="">Not set</option><template v-for="t in SOURCES" :key="t"><option :value="t">{{ t }}</option></template></select></div>
      </div>
      <div class="field"><label for="nRem">Remarks</label><textarea class="input" id="nRem" v-model="form.remarks" placeholder="e.g. Owner prefers WhatsApp after 6 pm"></textarea></div>
      <div class="field"><label for="nDesc">Description</label><textarea class="input" id="nDesc" v-model="form.description" placeholder="e.g. 2-bedroom unit, owner wants it live before December"></textarea></div>
    </section>
  </div>
</template>

<script>
// + New listing (no task in the task system). Emits saved(id, message) once saved, or cancel.
import { createListing, emailOk, errText, UNIT_TYPES, SOURCES, CONTACT_READERS } from '@/lib/owner-leads.js';
import { useSession } from '@/stores/session.js';
import FormField from '@/components/FormField.vue';
import PropertyField from './PropertyField.vue';

const empty = () => ({ property: '', unit: '', ownerName: '', ownerPhone: '', ownerEmail: '', dueDate: '', description: '', unitType: '', sizeSqft: '', source: '', remarks: '' });

export default {
  components: { FormField, PropertyField },
  props: { properties: { type: Array, default: () => [] } },
  emits: ['cancel', 'saved', 'dirty'],
  data() { return { UNIT_TYPES, SOURCES, canSeeContact: CONTACT_READERS.includes(useSession().role), form: empty(), busy: false, formError: '' }; },
  watch: { form: { deep: true, handler(f) { this.$emit('dirty', JSON.stringify(f) !== JSON.stringify(empty())); } } },
  methods: {
    async save() {
      const f = this.form;
      if (!f.property.trim() && !f.unit.trim()) { this.formError = 'Add the property or the unit.'; return; }
      if (!emailOk(f.ownerEmail.trim())) { this.formError = 'That owner email doesn\'t look right.'; return; }
      this.busy = true; this.formError = '';
      try {
        const id = await createListing({ property: f.property.trim(), unit: f.unit.trim(), ownerName: f.ownerName.trim(), title: '', description: f.description.trim(), dueDate: f.dueDate,
          unitType: f.unitType, sizeSqft: String(f.sizeSqft || '').trim(), source: f.source, remarks: f.remarks.trim() },
          { ownerPhone: f.ownerPhone.trim(), ownerEmail: f.ownerEmail.trim() }, null);
        this.$emit('dirty', false);
        this.$emit('saved', id, `${id} started.`);
      } catch (e) { this.formError = errText(e, 'save the listing'); }
      this.busy = false;
    }
  }
};
</script>

<style scoped>
.head-tools { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.grid-fields { align-items: start; }
textarea.input { height: 80px; padding: 10px 12px; }
.field > .select { width: 100%; height: 40px; font-weight: 400; font-size: 14px; padding-left: 12px; }
</style>
