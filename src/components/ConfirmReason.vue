<template>
  <div class="confirm-box">
    <b>{{ title }}</b>
    <p class="help" style="margin:4px 0 10px" v-if="text">{{ text }}</p>
    <FormField :id="id" :label="label" req :model-value="modelValue" @update:model-value="v => $emit('update:modelValue', v)" :placeholder="placeholder" @keydown.enter.prevent="ok()" />
    <div class="cr-actions">
      <button class="btn" :class="danger ? 'btn-danger' : 'btn-primary'" @click="ok()" :disabled="busy || !String(modelValue || '').trim()">{{ busy ? 'Saving…' : confirmText }}</button>
      <button class="btn" @click="$emit('cancel')" :disabled="busy">Cancel</button>
    </div>
  </div>
</template>

<script>
// A yes/no box that needs a reason (for the audit log): Pull back, Reopen and similar.
//   <ConfirmReason v-if="pulling" title="Pull DM 1706 back?" text="..." v-model="pullReason" confirm-text="Pull back" :busy="busy" @confirm="pullBack()" @cancel="pulling = false" />
import FormField from '@/components/FormField.vue';
let n = 0;
export default {
  components: { FormField },
  props: { modelValue: { type: String, default: '' }, title: { type: String, required: true }, text: { type: String, default: '' }, label: { type: String, default: 'Reason (audit log)' },
    placeholder: { type: String, default: '' }, confirmText: { type: String, default: 'Confirm' }, busy: { type: Boolean, default: false }, danger: { type: Boolean, default: false } },
  emits: ['update:modelValue', 'confirm', 'cancel'],
  data() { return { id: `cr${++n}` }; },
  methods: { ok() { if (!this.busy && String(this.modelValue || '').trim()) this.$emit('confirm'); } }
};
</script>

<style scoped>
.cr-actions { display: flex; gap: 8px; flex-wrap: wrap; }
</style>
