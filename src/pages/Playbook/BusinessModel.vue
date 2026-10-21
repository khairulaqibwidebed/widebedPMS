<template>
  <main class="content">
    <div class="page-head">
      <div>
        <h1>Business Model brief</h1>
        <div class="sub">What Widebed does and how it earns money. Read this in your first week.</div>
      </div>
      <div class="head-tools">
        <span class="chip">{{ `Last updated by ${page.updatedBy} · ${page.updatedOn}` }}</span>
        <button class="btn" v-show="isDirector && !editing" @click="startEdit()">Edit page</button>
      </div>
    </div>

    <div class="edit-bar" v-show="editing">
      <span>Editing. Everyone else sees the page read-only. Saved in this browser for now; saving for all staff comes later.</span>
      <button class="btn" @click="cancel()">Cancel</button>
      <button class="btn btn-primary" @click="save()">Save page</button>
    </div>
    <div class="notice ok" v-show="okMsg">{{ okMsg }}</div>

    <div class="side-grid">
      <div class="stack" style="gap:16px">
        <template v-for="(sec, i) in view().sections" :key="i">
          <div class="card brief">
            <template v-if="!editing"><div><h2>{{ sec.title }}</h2><div class="body">{{ sec.body }}</div></div></template>
            <template v-if="editing"><div>
              <input class="input" v-model="draft.sections[i].title" :aria-label="'Section ' + (i + 1) + ' title'">
              <textarea class="input" v-model="draft.sections[i].body" :aria-label="'Section ' + (i + 1) + ' text'" rows="7"></textarea>
              <div style="text-align:right;margin-top:6px"><button class="editlink" @click="draft.sections.splice(i, 1)">Remove section</button></div>
            </div></template>
          </div>
        </template>
        <button class="btn" v-show="editing" @click="draft.sections.push({ title: 'New section', body: '' })">+ Add section</button>
      </div>

      <div class="stack" style="gap:16px">
        <div class="card">
          <div class="card-head"><h2>Key terms</h2></div>
          <div class="terms" v-show="!editing"><template v-for="tm in page.terms" :key="tm.term"><div><b>{{ tm.term }}</b><span>{{ tm.meaning }}</span></div></template></div>
          <div v-show="editing">
            <template v-for="(tm, i) in draft.terms" :key="i">
              <div class="term-edit"><input class="input" v-model="tm.term" aria-label="Term"><input class="input" v-model="tm.meaning" aria-label="Meaning"><button class="icon-btn" @click="draft.terms.splice(i, 1)" aria-label="Remove term">×</button></div>
            </template>
            <button class="btn btn-sm" @click="draft.terms.push({ term: '', meaning: '' })">+ Add term</button>
          </div>
        </div>
        <div class="callout">HR keeps this page up to date. Suggest a change by raising a ticket tagged HR in <RouterLink class="navlink" to="/Operations/issues">Issues</RouterLink>.</div>
      </div>
    </div>
  </main>
</template>

<script>
import { useSession } from '@/stores/session.js';

const me = useSession();

const DEFAULT = {
  updatedBy: 'HR', updatedOn: '17 Oct 2026',
  sections: [
    { title: 'What Widebed does', body: 'Widebed manages serviced apartments on behalf of unit owners in Malaysia.\nEach unit is rented out either as short stays (29 nights or less, sold through booking sites) or as a monthly or yearly tenancy (30 nights or more).\nWidebed handles guests, cleaning, repairs and payments, and pays the owner every month.' },
    { title: 'How Widebed earns money', body: 'Each owner signs one of four arrangements:\n• Fixed rent: Widebed pays the owner a fixed amount every month and keeps the rest.\n• Profit share 40% (daily stays): 20% service fee + 20% utilities, taken from the monthly total.\n• Profit share 20% (monthly stays).\n• Long-term tenant: 10% fee plus SST on the fee.' },
    { title: 'Who pays what', body: '• Booking sites (OTAs) take their commission before Widebed is paid; the commission is set per unit.\n• Short stays: utilities are in the booking price and Widebed pays them. Long-term tenants pay utilities directly; on vacant or blocked days the owner pays.\n• Owner expenses (repairs, bills) are taken off the owner\'s statement after Widebed\'s fee.\n• SST 8% is paid by Widebed. Tourism Tax is RM 10 per unit per night for non-Malaysian guests.' },
    { title: 'Where bookings come from', body: 'Booking.com, Agoda, Trip.com, Traveloka, Tiket, Expedia, and direct bookings. Each site takes a commission before Widebed gets paid, and that commission is set per unit.' },
    { title: 'One month of money', body: '1. Guests book; eZee records every stay.\n2. Finance uploads the eZee report into the PMS.\n3. The PMS works out each unit\'s statement.\n4. Finance checks it and clicks Approve & complete.\n5. The owner is paid and gets a PDF statement.' }
  ],
  terms: [
    { term: 'eZee', meaning: 'The booking system Widebed uses for every stay' },
    { term: 'OTA', meaning: 'Online travel agency, e.g. Booking.com' },
    { term: 'PTO', meaning: 'Payment to owner before Widebed\'s fee' },
    { term: 'SST', meaning: 'Sales and service tax, 8%' },
    { term: 'Tourism Tax', meaning: 'RM 10 per unit per night for non-Malaysian guests' },
    { term: 'Deposit', meaning: '2 months, required for every long-term tenant' }
  ]
};
const KEY = 'wb.businessModel.v1';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || structuredClone(DEFAULT); } catch { return structuredClone(DEFAULT); } };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default {
  data() {
    return {
      isDirector: me.role === 'director', page: read(), draft: read(), editing: false, okMsg: ''
    };
  },
  methods: {
    view() { return this.editing ? this.draft : this.page; },
    startEdit() { this.draft = JSON.parse(JSON.stringify(this.page)); this.editing = true; this.okMsg = ''; },
    cancel() { this.editing = false; },
    save() {
      const d = this.draft, now = new Date();
      d.sections = d.sections.filter(s => s.title.trim() || s.body.trim());
      d.terms = d.terms.filter(t => t.term.trim());
      d.updatedBy = 'Director'; d.updatedOn = `${now.getDate()} ${MON[now.getMonth()]} ${now.getFullYear()}`;
      this.page = JSON.parse(JSON.stringify(d)); this.editing = false;
      try { localStorage.setItem(KEY, JSON.stringify(d)); } catch {}
      this.okMsg = 'Page saved.';
    }
  }
};
</script>

<style scoped>
    .brief { padding: 20px 18px; }
    .brief h2 { font-size: 15px; margin: 0 0 12px; }
    .brief .body { font-size: 13px; color: var(--text); white-space: pre-line; line-height: 1.6; }
    .brief textarea.input { height: auto; min-height: 120px; font-size: 13px; line-height: 1.55; }
    .brief input.input { font-weight: 600; margin-bottom: 10px; }
    .terms { display: grid; gap: 12px; font-size: 13px; }
    .terms b { display: block; }
    .terms span { color: var(--muted); font-size: 12px; }
    .term-edit { display: grid; grid-template-columns: 110px minmax(0,1fr) 28px; gap: 6px; margin-bottom: 6px; }
    .term-edit .input { height: 32px; font-size: 12px; }
    .edit-bar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; background: var(--amber-soft); color: var(--amber); border-radius: 10px; padding: 10px 14px; margin-bottom: 16px; font-size: 13px; }
    .edit-bar span { margin-right: auto; }
</style>
