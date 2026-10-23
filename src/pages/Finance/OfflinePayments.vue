<template>
  <main class="content">
    <div class="page-head">
      <div>
        <h1>Offline payments</h1>
        <div class="sub">Cash and bank transfers received outside the booking sites. These are handled in Fillout; the PMS only links to them.</div>
      </div>
    </div>
    <section class="card">
      <div class="card-head"><h2>Fillout forms</h2></div>
      <div class="form-list">
        <div class="form-row" v-for="f in LINKS" :key="f.name">
          <div><b>{{ f.name }}</b><span>{{ f.about }}</span></div>
          <a class="btn open-btn" :href="f.url" target="_blank" rel="noopener" @click="open($event, f)">Open ↗</a>
        </div>
      </div>
    </section>
    <p class="page-note">Each button opens the Fillout form in a new tab. Nothing is saved in the PMS. (Placeholder link: Internal Portal WB until the form links are added.)</p>
  </main>
</template>

<script>
import { toast } from '@/lib/toast.js';

// Fillout links: Khairul pastes each real Fillout link here in place of '#'.
// While a link is '#', its Open button says "Link not added yet".
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
    .form-list { display: grid; }
    .form-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 0; border-top: 1px solid var(--line); }
    .form-row:first-child { border-top: 0; }
    .form-row b { display: block; font-size: 14px; font-weight: 600; }
    .form-row span { color: var(--muted); font-size: 12px; }
    .form-row > div { min-width: 0; }
    .open-btn { height: 34px; flex: none; }
    .page-note { color: var(--muted); font-size: 12px; margin-top: 14px; }
</style>
