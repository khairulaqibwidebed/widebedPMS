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
// Fillout links: in forms-links.js (the Procurement dashboard lists them too).
import { LINKS } from './forms-links.js';

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
