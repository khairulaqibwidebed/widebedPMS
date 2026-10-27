<template>
  <main class="content">
    <div class="page-head">
      <div>
        <h1>Offline payments</h1>
        <div class="sub">Cash and bank transfers received outside the booking sites. These are handled in Fillout; the PMS only links to them.</div>
      </div>
    </div>
    <section class="card form-card">
      <div class="card-head"><h2>Fillout forms</h2></div>
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
import { toast } from '@/lib/toast.js';


const LINKS = [
  { name: "Offline Payment Check Dashboard", about: "Monitor, reconcile and verify offline sales payments.", url: 'https://bromwaw5jj.zite.so/' },
  { name: "Offline Payment Submission Form", about: "Submit sales statements for offline payments.", url: 'https://script.google.com/a/macros/widebed.com/s/AKfycby7c9rK4pQq2m0WbWfTejlT8a2Q5n6p3TrEdSM4UtfzvQ5sE90UQl507ungKS1sQBpo/exec' }
];

export default {
  data() { return { LINKS }; },
  methods: {
    open(e, f) {
      if (f.url === '#') { e.preventDefault(); toast('Link not added yet'); }
    }
  }
};
</script>

<style scoped>
    /* Form rows: shared .form-list / .form-row styles in app.css */
    .page-note { color: var(--muted); font-size: 12px; margin-top: 14px; }
</style>
