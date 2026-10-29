<template>
  <main class="content">
    <div class="page-head">
      <div>
        <h1>Booking forms</h1>
        <div class="sub">Operations forms. Open one to fill it in here. Reservation bookings are now made in Portfolio > Bookings > Create booking.</div>
      </div>
    </div>
    <section class="card form-card">
      <div class="form-list">
        <button type="button" class="form-row" :aria-expanded="String(bookingOpen)" @click="bookingOpen = !bookingOpen">
          <div><b>Booking Form</b><span>Log a booking: tenant, stay, rental and deposit, payment and door passcodes. Replaces the Reservation Lodgment form.</span></div>
          <span class="open-btn">{{ bookingOpen ? 'Hide form' : 'Show form' }} <svg class="chev" :class="{ up: bookingOpen }" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></span>
        </button>
        <div class="form-frame booking-embed" v-if="bookingOpen">
          <div class="notice ok" v-show="bookedMsg">{{ bookedMsg }}</div>
          <BookingForm embedded @close="bookingOpen = false" @saved="m => bookedMsg = m" />
        </div>
        <button type="button" class="form-row" :aria-expanded="String(utilityOpen)" @click="utilityOpen = !utilityOpen">
          <div><b>Utility Lodgment Form</b><span>Log utility invoices to an active booking.</span></div>
          <span class="open-btn">{{ utilityOpen ? 'Hide form' : 'Show form' }} <svg class="chev" :class="{ up: utilityOpen }" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></span>
        </button>
        <div class="form-frame" v-if="utilityOpen"><UtilityForm @close="utilityOpen = false" /></div>
        <template v-for="f in LINKS" :key="f.name">
          <button type="button" class="form-row" :aria-expanded="String(openName === f.name)" @click="toggle(f)">
            <div><b>{{ f.name }}</b><span>{{ f.about }}</span></div>
            <span class="open-btn">{{ openName === f.name ? 'Hide form' : 'Show form' }} <svg class="chev" :class="{ up: openName === f.name }" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></span>
          </button>
          <div class="form-frame soon" v-if="openName === f.name">
            <p class="muted">{{ f.note }}</p>
          </div>
        </template>
      </div>
    </section>
  </main>
</template>

<script>
const LINKS = [
  { name: "General Tenancy Agreement Form", about: "Complete the details needed to prepare a tenancy agreement.", note: 'Not built in the PMS yet. This one is Neo\'s part.' },
  { name: "Property Inspection Form", about: "Record the condition of the property during an inspection.", note: 'Not built in the PMS yet.' }
];

import { defineAsyncComponent } from 'vue';

import UtilityForm from '@/components/UtilityForm.vue';
const BookingForm = defineAsyncComponent(() => import('./SalesLeads.vue'));

export default {
  components: { BookingForm, UtilityForm },
  data() { return { LINKS, openName: '', bookingOpen: false, utilityOpen: false, bookedMsg: '' }; },
  methods: {
    toggle(f) {
      this.openName = this.openName === f.name ? '' : f.name;
    }
  }
};
</script>

<style scoped>
    /* Form rows: shared .form-list / .form-row styles in app.css */
    .form-row { width: 100%; text-align: left; font: inherit; cursor: pointer; }
    .chev { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; transition: transform .15s; }
    .chev.up { transform: rotate(180deg); }
    .form-frame { border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); margin: 2px 0 10px; overflow: hidden; }
    .frame-tools { display: flex; justify-content: space-between; gap: 12px; padding: 8px 14px; font-size: 12px; border-bottom: 1px solid var(--border); }
    .form-frame iframe { display: block; width: 100%; height: 1100px; border: 0; background: #fff; }
.soon { padding: 14px 16px; }
    .booking-embed { padding: 14px; }
    .booking-embed :deep(.content) { padding: 0; max-width: none; }
    .page-note { color: var(--muted); font-size: 12px; margin-top: 14px; }
</style>
