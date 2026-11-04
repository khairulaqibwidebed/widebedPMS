<template>
  <div class="pi">
    <div class="form-title">
      <h2>Property Inspection Form</h2>
      <p class="sub">Record the condition of the property during an inspection.</p>
    </div>
    <section class="card uc">
      <span class="uc-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 20h20"/><path d="M5 20V9l7-5 7 5v11"/><path d="M9 20v-6h6v6"/></svg>
      </span>
      <h3>Under Construction</h3>
      <p>This form is not built in the PMS yet.</p>
    </section>
  </div>
</template>

<script>
// Property Inspection Form (Operations > Booking forms > Property Inspection, /Operations/booking-forms/property).
// Placeholder until the form is built; when it is, it uses components/StepStrip.vue (with a sub-strip per room) like the other forms.
export default {
  emits: ['dirty']
};
</script>

<style scoped>
.form-title { margin-bottom: 14px; }
.form-title h2 { font-size: 18px; margin: 0; }
.form-title .sub { color: var(--muted); margin: 4px 0 0; font-size: 13px; }
.uc { display: grid; justify-items: center; text-align: center; gap: 6px; padding: 40px 20px; }
.uc-icon { width: 56px; height: 56px; border-radius: 50%; display: grid; place-items: center; background: var(--amber-soft); color: var(--amber); margin-bottom: 6px; }
.uc h3 { margin: 0; font-size: 17px; }
.uc p { margin: 0; color: var(--muted); font-size: 14px; }
</style>
