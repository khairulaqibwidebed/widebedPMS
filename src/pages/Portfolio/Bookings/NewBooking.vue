<template>
  <main class="content">
    <div class="page-head">
      <div>
        <h1>{{ resumeId ? 'Finish booking' : 'New booking' }}</h1>
        <div class="sub"><RouterLink to="/Portfolio/bookings">Portfolio › Bookings</RouterLink> › New booking</div>
      </div>
      <RouterLink class="btn" to="/Portfolio/bookings">‹ Back to Bookings</RouterLink>
    </div>
    <!-- A new key per inquiry (?lead=), so "Start a booking without an inquiry" starts a fresh form -->
    <ReservationForm :key="'r' + leadId + resumeId" :lead-id="leadId" :resume-id="resumeId" @dirty="v => dirty = v" />
  </main>
</template>

<script>
// Portfolio > Bookings > New booking (/Portfolio/bookings/new), 16 Nov 2026.
// The Reservation Lodgment Form, moved off Operations > Booking forms onto its own page under Bookings.
// The form itself is unchanged (pages/Operations/booking-forms/ReservationForm.vue); this page only holds it
// and warns before leaving with something typed. ?lead=<id> opens it from a Tenant lead (Create booking).
// Access: still the Booking Forms tick for now (the access system is being redone).
import { defineAsyncComponent } from 'vue';
import { askConfirm } from '@/lib/confirm.js';

export default {
  components: { ReservationForm: defineAsyncComponent(() => import('../../Operations/booking-forms/ReservationForm.vue')) },
  data() { return { dirty: false }; },
  // ?resume=<booking id> (16 Nov 2026): finish a booking saved as Awaiting payment
  computed: { leadId() { return String(this.$route.query.lead || ''); }, resumeId() { return String(this.$route.query.resume || ''); } },
  mounted() { window.addEventListener('beforeunload', this.warn); },
  unmounted() { window.removeEventListener('beforeunload', this.warn); },
  // Leaving the page with something typed: ask first
  async beforeRouteLeave() {
    if (!this.dirty) return true;
    return askConfirm({ title: 'Leave?', message: "What you've entered will be lost.", confirmText: 'Leave', danger: true });
  },
  methods: {
    // Closing or reloading the browser tab: the browser's own "Leave site?" warning
    warn(e) { if (!this.dirty) return; e.preventDefault(); e.returnValue = ''; }
  }
};
</script>
