<template>
  <main class="content">
    <div class="page-head">
      <div>
        <h1>Booking forms</h1>
        <div class="sub">Operations forms in Fillout. Each button opens the form in a new tab; nothing is saved in the PMS.</div>
      </div>
    </div>
    <section class="card">
      <div class="form-list">
        <div class="form-row" v-for="f in LINKS" :key="f.name">
          <div><b>{{ f.name }}</b><span>{{ f.about }}</span></div>
          <a class="btn open-btn" :href="f.url" target="_blank" rel="noopener" @click="open($event, f)">Open ↗</a>
        </div>
      </div>
    </section>
    <p class="page-note">Fillout links are added during coding (placeholder: Internal Portal WB).</p>
  </main>
</template>

<script>
// Fillout links: Khairul pastes each real Fillout link here in place of '#'.
// While a link is '#', its Open button says "Link not added yet".
const LINKS = [
  { name: "Reservation Lodgment Form", about: "Log a verified customer check-in record.", url: '#' },
  { name: "Utility Lodgment Form", about: "Log utility invoices to an active property.", url: '#' },
  { name: "General Tenancy Agreement Form", about: "Complete the details needed to prepare a tenancy agreement.", url: '#' },
  { name: "Property Inspection Form", about: "Record the condition of the property during an inspection.", url: '#' }
];

import { toast } from '@/lib/toast.js';

export default {
  data() { return { LINKS }; },
  methods: {
    open(e, f) { if (f.url === '#') { e.preventDefault(); toast('Link not added yet'); } }
  }
};
</script>

<style scoped>
    .form-list { display: grid; }
    .form-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 0; border-top: 1px solid var(--line); }
    .form-row:first-child { border-top: 0; }
    .form-row b { display: block; font-size: 14px; font-weight: 600; }
    .form-row span { color: var(--muted); font-size: 12px; }
    .form-row > div { min-width: 0; }
    .open-btn { height: 34px; flex: none; }
    .page-note { color: var(--muted); font-size: 12px; margin-top: 14px; }
</style>
