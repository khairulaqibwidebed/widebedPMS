<template>
  <main class="content">
    <div class="page-head">
      <div>
        <h1>Forms</h1>
        <div class="sub">Procurement forms in Fillout. Each button opens the form in a new tab; nothing is saved in the PMS.</div>
      </div>
    </div>
    <template v-for="g in GROUPS" :key="g.key">
      <section class="card form-card form-group">
        <button class="group-head" type="button" @click="toggle(g.key)" :aria-expanded="String(isOpen(g.key))">
          <span class="chev" :class="{ open: isOpen(g.key) }">›</span>
          <b>{{ g.label }}</b>
          <span class="count">{{ inGroup(g.key).length }}</span>
        </button>
        <div class="form-list" v-show="isOpen(g.key)">
          <a class="form-row" v-for="f in inGroup(g.key)" :key="f.name" :href="f.url" target="_blank" rel="noopener" @click="open($event, f)">
            <div><b>{{ f.name }}</b><span>{{ f.about }}</span></div>
            <span class="open-btn">Open form <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8"/></svg></span>
          </a>
          <p class="muted empty-group" v-show="!inGroup(g.key).length">No forms here yet.</p>
        </div>
      </section>
    </template>
    <p class="page-note">Redirect Links to the Fill Out Forms!</p>
  </main>
</template>

<script>
import { LINKS } from './forms-links.js';

import { toast } from '@/lib/toast.js';

const GROUPS = [{ key: 'standard', label: 'Standard' }, { key: 'chinese', label: 'Chinese' }, { key: 'special', label: 'Special' }];
const KEY = 'wb.procFormsOpen';

export default {
  data() {
    let open = ['standard'];
    try { const v = JSON.parse(localStorage.getItem(KEY)); if (Array.isArray(v)) open = v; } catch {}
    return { LINKS, GROUPS, opened: open };
  },
  methods: {
    inGroup(k) { return LINKS.filter(f => (GROUPS.some(g => g.key === f.group) ? f.group : 'standard') === k); },
    isOpen(k) { return this.opened.includes(k); },
    // Which drop-downs are open is remembered in this browser
    toggle(k) {
      this.opened = this.isOpen(k) ? this.opened.filter(x => x !== k) : [...this.opened, k];
      try { localStorage.setItem(KEY, JSON.stringify(this.opened)); } catch {}
    },
    open(e, f) { if (f.url === '#') { e.preventDefault(); toast('Link not added yet'); } }
  }
};
</script>

<style scoped>
    /* Form rows: shared .form-list / .form-row styles in app.css */
    .page-note { color: var(--muted); font-size: 12px; margin-top: 14px; }
    .form-group + .form-group { margin-top: 14px; }
    .group-head { display: flex; align-items: center; gap: 10px; width: 100%; padding: 2px 4px; border: 0; background: none; color: var(--text); font: inherit; font-size: 15px; cursor: pointer; text-align: left; }
    .group-head:hover b { color: var(--accent); }
    /* Pointing at a drop-down's header lights up the whole box in the theme colour */
    .form-group { transition: background .15s, border-color .15s, box-shadow .15s; }
    .form-group:has(.group-head:hover), .form-group:has(.group-head:focus-visible) { background: var(--accent-soft); border-color: color-mix(in srgb, var(--accent) 55%, transparent); box-shadow: inset 4px 0 0 var(--accent); }
    .group-head:hover .chev, .group-head:focus-visible .chev { color: var(--accent); }
    .group-head:focus-visible { outline: none; }
    /* The count badge would blend into the tinted box, so it fills solid on hover */
    .group-head .count { transition: background .15s, color .15s; }
    .group-head:hover .count, .group-head:focus-visible .count { background: var(--accent); color: #fff; }
    .group-head .chev { display: inline-block; width: 14px; font-size: 18px; line-height: 1; color: var(--muted); transition: transform .2s; }
    .group-head .chev.open { transform: rotate(90deg); color: var(--accent); }
    .group-head .count { margin-left: auto; min-width: 24px; padding: 1px 8px; border-radius: 999px; background: var(--accent-soft); color: var(--accent); font-size: 12px; font-weight: 600; text-align: center; }
    .form-group .form-list { margin-top: 14px; }
    .empty-group { margin: 0; font-size: 13px; }
</style>
