<template>
  <div class="field">
    <label :class="{ req }" :for="id">Property</label>
    <select class="select" :id="id" :value="choice" @change="pick($event.target.value)">
      <option value="">Choose a property…</option>
      <template v-for="p in properties" :key="p.id"><option :value="p.name">{{ p.name }}</option></template>
      <option value="__new">New property (not in Portfolio yet)…</option>
    </select>
    <input class="input prop-new" v-if="choice === '__new'" v-model="o.property" placeholder="Name of the new property" aria-label="New property name">
  </div>
</template>

<script>
// Property dropdown for a listing (o = the new-listing form or the listing draft; o.property and o.unit change in place):
// the Portfolio's properties, or "New property" with a typed name for one not added yet.
export default {
  props: { o: { type: Object, required: true }, properties: { type: Array, default: () => [] }, id: { type: String, default: 'olProp' }, req: Boolean },
  data() { return { typing: false }; },
  computed: {
    choice() {
      const v = (this.o.property || '').trim();
      return this.typing || (v && !this.properties.some(p => p.name === v)) ? '__new' : v;
    }
  },
  methods: {
    pick(value) {
      const o = this.o;
      const old = this.properties.find(p => p.name === o.property), pick = this.properties.find(p => p.name === value);
      this.typing = value === '__new';
      o.property = value === '__new' ? '' : value;
      // Unit codes start with the property's short code (e.g. "DM 07-19"): fill it in when the unit is blank or
      // still starts with the previous property's code.
      const unit = (o.unit || '').trim(), oldCode = old?.code ? old.code + ' ' : null;
      if (pick?.code && (!unit || (oldCode && (unit + ' ').startsWith(oldCode)))) o.unit = pick.code + ' ' + (oldCode && unit.startsWith(oldCode) ? unit.slice(oldCode.length) : '');
    }
  }
};
</script>

<style scoped>
.prop-new { margin-top: 8px; }
.field > .select { width: 100%; height: 40px; font-weight: 400; font-size: 14px; padding-left: 12px; background-position: calc(100% - 17px) 18px, calc(100% - 13px) 18px; }
</style>
