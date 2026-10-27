<template>
  <main class="content">
    <div class="page-head">
      <div>
        <h1>Booking forms</h1>
        <div class="sub">Operations forms in Fillout. Each button opens the form in a new tab; nothing is saved in the PMS.</div>
      </div>
    </div>
    <section class="card form-card">
      <div class="form-list">
        <a class="form-row" v-for="f in LINKS" :key="f.name" :href="f.url" target="_blank" rel="noopener" @click="open($event, f)">
          <div><b>{{ f.name }}</b><span>{{ f.about }}</span></div>
          <span class="open-btn">Open form <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8"/></svg></span>
        </a>
      </div>
    </section>
    <p class="page-note">Redirect Links to the Fill Out Forms!</p>
  </main>
</template>

<script>
const LINKS = [
  { name: "Reservation Lodgment Form", about: "Log a verified customer check-in record.", url: 'https://script.google.com/a/macros/widebed.com/s/AKfycbzNXjXJVSjh3c0HX49qEq0rsUmjjZdpawB5hnl1P2HV8k3UWp7fI3CBhA0iEOphUO-L/exec' },
  { name: "Utility Lodgment Form", about: "Log utility invoices to an active property.", url: 'https://script.google.com/a/macros/widebed.com/s/AKfycbzNXjXJVSjh3c0HX49qEq0rsUmjjZdpawB5hnl1P2HV8k3UWp7fI3CBhA0iEOphUO-L/exec?page=utility' },
  { name: "General Tenancy Agreement Form", about: "Complete the details needed to prepare a tenancy agreement.", url: 'https://widebed.fillout.com/t/bk9L7uVgSdus' },
  { name: "Property Inspection Form", about: "Record the condition of the property during an inspection.", url: 'https://widebed.fillout.com/t/jMKvwZhJ7Pus' }
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
    /* Form rows: shared .form-list / .form-row styles in app.css */
    .page-note { color: var(--muted); font-size: 12px; margin-top: 14px; }
</style>
