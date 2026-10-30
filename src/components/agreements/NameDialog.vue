<template>
  <div class="modal-back" @click.self="emit('close')" @keydown.esc="emit('close')">
    <form class="modal" role="dialog" :aria-label="title" style="max-width: 460px" @submit.prevent="done">
      <h2>{{ title }}</h2>
      <div class="field">
        <label :for="uid">{{ label }}</label>
        <input :id="uid" ref="box" class="input" v-model="text" maxlength="120" required>
        <span class="help" v-if="help">{{ help }}</span>
      </div>
      <slot />
      <div class="modal-foot">
        <button type="button" class="btn" @click="emit('close')">Cancel</button>
        <button type="submit" class="btn btn-primary" :disabled="!text.trim()">{{ confirm }}</button>
      </div>
    </form>
  </div>
</template>

<script setup>
// A small "type a name" box (new form, rename, add column…).
import { ref, onMounted } from 'vue';
const props = defineProps({ title: String, label: { type: String, default: 'Name' }, value: { type: String, default: '' }, confirm: { type: String, default: 'Save' }, help: String });
const emit = defineEmits(['close', 'done']);
const text = ref(props.value), box = ref(null), uid = 'nd-' + Math.random().toString(36).slice(2, 7);
onMounted(() => { box.value?.focus(); box.value?.select(); });
const done = () => { if (text.value.trim()) emit('done', text.value.trim()); };
</script>
