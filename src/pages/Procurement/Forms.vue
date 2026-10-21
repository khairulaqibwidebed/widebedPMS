<template>
  <main class="content">
    <div class="page-head">
      <div>
        <h1>Forms</h1>
        <div class="sub">Procurement forms in Fillout. Each button opens the form in a new tab; nothing is saved in the PMS.</div>
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
    <p class="page-note">Placeholder link (Internal Portal WB) until each form link is added.</p>
  </main>
</template>

<script>
// Fillout links: Khairul pastes each real Fillout link here in place of '#'.
// While a link is '#', its Open button says "Link not added yet".
const LINKS = [
  { name: "Service Agreement 25", about: "Fill in the Service Agreement 25 form.", url: '#' },
  { name: "WIDEBED Property Quotation (Essentials)", about: "Fill in the WIDEBED Property Quotation form.", url: '#' },
  { name: "Service Agreement 20", about: "Fill in the Service Agreement 20 form.", url: '#' },
  { name: "(CN) Service Agreement", about: "Fill in the Service Agreement in Chinese.", url: '#' },
  { name: "Service Agreement (Custom Fee)", about: "Fill in the Service Agreement with a custom service fee.", url: '#' },
  { name: "Service Agreement (SPECIAL)", about: "Fill in the Service Agreement (SPECIAL).", url: '#' },
  { name: "(CN) Quotation Essentials", about: "Fill in the Quotation Essentials in Chinese.", url: '#' },
  { name: "Service Agreement (Megan)", about: "Fill in the Service Agreement (Megan).", url: '#' },
  { name: "(CN) Renovation Quotation", about: "Fill in the Renovation Quotation in Chinese.", url: '#' },
  { name: "Widebed Tenancy Agreement", about: "Fill in the Widebed Tenancy Agreement.", url: '#' }
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
