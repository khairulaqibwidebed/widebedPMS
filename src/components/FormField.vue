<template>
  <div class="field">
    <label :class="{ req }" :for="id">{{ label }}</label>
    <input class="input" :id="id" v-bind="inputAttrs()" :value="modelValue" @input="onInput">
  </div>
</template>

<script>
// One labelled text/number/date input with the red star. Extra attributes (type, placeholder, min, step, inputmode, @change) go to the input.
//   <FormField id="bName" label="Name" req v-model="bk.name" />
export default {
  inheritAttrs: false,
  props: { modelValue: { default: '' }, label: { type: String, default: '' }, req: { type: Boolean, default: false }, id: { type: String, default: undefined } },
  emits: ['update:modelValue'],
  methods: {
    // Everything but @input goes straight to the input; the parent's @input runs after the new value is saved
    // (otherwise it would see the previous value, e.g. Owner share worked out from the last digit typed)
    inputAttrs() { const { onInput, ...rest } = this.$attrs; return rest; },
    onInput(e) {
      const v = e.target.value;
      if (this.$attrs.type === 'number') { const n = parseFloat(v); this.$emit('update:modelValue', Number.isNaN(n) ? v : n); }
      else this.$emit('update:modelValue', v);
      const h = this.$attrs.onInput; (Array.isArray(h) ? h : h ? [h] : []).forEach(f => f(e));
    }
  }
};
</script>
