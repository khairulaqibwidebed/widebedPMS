<template>
  <div class="modal-back" @click.self="emit('close')" @keydown.esc="emit('close')">
    <div class="modal" role="alertdialog" :aria-label="title" style="max-width: 480px">
      <h2>{{ title }}</h2>
      <p class="confirm-text">{{ text }}</p>
      <ul v-if="items && items.length" class="confirm-list"><li v-for="i in items" :key="i">{{ i }}</li></ul>
      <div class="modal-foot">
        <button type="button" class="btn" @click="emit('close')">Cancel</button>
        <button type="button" ref="ok" class="btn" :class="danger ? 'btn-danger' : 'btn-primary'" @click="emit('ok')">{{ confirm }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
// "Are you sure?" box.
import { ref, onMounted } from 'vue';
defineProps({ title: String, text: String, items: Array, confirm: { type: String, default: 'OK' }, danger: Boolean });
const emit = defineEmits(['close', 'ok']);
const ok = ref(null);
onMounted(() => ok.value?.focus());
</script>

<style scoped>
.confirm-text { color: var(--text-2); margin: 0 0 8px; }
.confirm-list { margin: 0 0 8px; padding-left: 18px; color: var(--text-2); font-size: 13px; }
</style>
