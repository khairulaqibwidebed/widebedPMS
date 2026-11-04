<template>
  <section class="form-saved" role="status">
    <span class="fs-tick" aria-hidden="true"></span>
    <div class="fs-body">
      <h2>{{ title }}</h2>
      <p>{{ message }}</p>
      <slot></slot>
      <div class="fs-actions"><button type="button" class="btn btn-primary" @click="$emit('again')">{{ againText }}</button></div>
    </div>
  </section>
</template>

<script>
// Shown in place of a form after it is saved: what was saved and a "Start another" button.
//   <FormSaved :message="okMsg" @again="startAgain()" />
export default {
  props: { title: { type: String, default: 'Saved' }, message: { type: String, default: '' }, againText: { type: String, default: 'Start another' } },
  emits: ['again']
};
</script>

<style scoped>
.form-saved { display: flex; gap: 14px; align-items: flex-start; padding: 20px; border: 1px solid var(--green); border-radius: var(--radius); background: var(--green-soft); }
.fs-tick { width: 32px; height: 32px; border-radius: 50%; background: var(--green); flex: none; display: grid; place-items: center; }
.fs-tick::after { content: '✓'; color: #fff; font-size: 17px; font-weight: 700; }
.fs-body h2 { margin: 2px 0 6px; font-size: 17px; color: var(--green); }
.fs-body p { margin: 0 0 14px; font-size: 14px; line-height: 1.5; color: var(--text); }
.fs-actions { display: flex; gap: 10px; flex-wrap: wrap; }
</style>
