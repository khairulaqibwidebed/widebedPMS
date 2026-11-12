<template>
  <main class="content">
    <div class="loading-bar" v-show="loading"></div>
    <div class="page-head">
      <div>
        <h1>One To One Session</h1>
        <div class="sub">The one-to-one form for each employee, filled in with their details and Code of Honor marks. View, download or print it.</div>
      </div>
      <div class="head-tools">
        <select class="select" v-model="quarterId" v-if="quarters.length" aria-label="Quarter">
          <option v-for="q in quarters" :key="q.id" :value="q.id">{{ q.name }}</option>
        </select>
      </div>
    </div>

    <div class="notice error" v-if="error">{{ error }}</div>
    <div class="notice" v-if="!loading && !quarters.length">No quarter yet. Make one on Quarterly Management first.</div>

    <div class="oo-grid" v-if="quarters.length">
      <!-- Staff of the quarter -->
      <section class="card">
        <div class="card-head"><h2>Staff this quarter</h2><span class="muted" v-if="rows.length">{{ rows.length }} people · {{ rows.filter(r => r.complete).length }} complete</span></div>
        <input class="input oo-search" type="search" v-model="search" placeholder="Search a name" aria-label="Search a name">
        <ul class="oo-list">
          <li v-for="r in shown" :key="r.uid" class="oo-row" :class="{ on: r.uid === selectedUid }">
            <div class="oo-who"><b>{{ r.name }}</b><small>{{ r.position || 'No position saved' }}</small></div>
            <span class="pill" :class="r.complete ? 'green' : r.done ? 'amber' : 'grey'" :title="`${r.done} of ${r.expected} colleagues have rated this person`">COH {{ r.done }}/{{ r.expected }}</span>
            <button type="button" class="btn btn-sm" @click="selectedUid = r.uid">View</button>
          </li>
          <li v-if="!loading && !shown.length" class="muted oo-empty">{{ rows.length ? 'No one matches.' : 'Nobody is taking part in this quarter yet.' }}</li>
        </ul>
        <p class="help">COH shows how many colleagues have rated this person, out of those who should. Green means everyone is done.</p>
      </section>

      <!-- The form of the selected person -->
      <section class="card" v-if="sel">
        <div class="card-head oo-head">
          <h2>{{ sel.name }}</h2>
          <span class="oo-acts">
            <button type="button" class="btn btn-sm" :disabled="!pdfUrl || building" @click="printPdf">Print</button>
            <a class="btn btn-sm btn-primary" :class="{ disabled: !pdfUrl || building }" :href="pdfUrl || undefined" :download="downloadName" @click="rememberVenue">Download PDF</a>
          </span>
        </div>
        <div class="grid-fields oo-fields">
          <div class="field"><label for="ooDate">Date</label><input id="ooDate" class="input" type="date" v-model="date"></div>
          <div class="field oo-venue" v-click-outside="() => (venueOpen = false)">
            <label for="ooVenue">Venue</label>
            <!-- Venue (12 Nov 2026): pick one HR saved before, or add a new one; the list is kept for next time -->
            <button id="ooVenue" type="button" class="input oo-venue-btn" :aria-expanded="String(venueOpen)" @click="venueOpen = !venueOpen">
              <span>{{ venue || 'Choose a venue' }}</span><span aria-hidden="true">▾</span>
            </button>
            <div class="oo-venue-menu" v-if="venueOpen">
              <ul>
                <li v-for="v in venues" :key="v" :class="{ on: v === venue }">
                  <button type="button" class="oo-venue-pick" @click="pickVenue(v)">{{ v }}</button>
                  <button type="button" class="icon-btn oo-venue-del" :aria-label="'Remove ' + v" title="Remove from the list" @click.stop="removeVenue(v)">✕</button>
                </li>
                <li v-if="!venues.length" class="muted oo-empty">No venue saved yet.</li>
              </ul>
              <form class="oo-venue-add" @submit.prevent="addVenue">
                <label for="ooNewVenue">Add a venue</label>
                <div><input id="ooNewVenue" class="input" v-model="newVenue" maxlength="80" placeholder="Meeting Room 2"><button class="btn btn-sm btn-primary" type="submit" :disabled="!newVenue.trim()">Add</button></div>
                <span class="help">{{ venueLocal ? 'Kept on this computer only (the shared list needs rules Draft 0.62).' : 'Saved for HR and Directors. Next time, pick it from the list.' }}</span>
              </form>
            </div>
          </div>
        </div>
        <!-- Filled in from the records, and can be typed over for this form (12 Nov 2026) -->
        <div class="grid-fields oo-fields">
          <div class="field"><label for="ooName">Staff name</label><input id="ooName" class="input" v-model="edit.staffName" maxlength="120" :placeholder="sel.name"></div>
          <div class="field"><label for="ooPos">Position</label><input id="ooPos" class="input" v-model="edit.position" maxlength="120" :placeholder="sel.position || 'Position'"></div>
        </div>
        <div class="field oo-fields">
          <label for="ooTopic">Topic</label><input id="ooTopic" class="input" v-model="topic" maxlength="120" :placeholder="TOPIC">
        </div>
        <p class="help oo-edit-note">
          These are filled in for you. Typing over one changes this form only, not the staff record.
          <button type="button" class="link" v-if="edited" @click="resetEdits">Put back the saved details</button>
        </p>
        <div class="oo-join">
          <label for="ooJoin">Join date</label>
          <input id="ooJoin" class="input" type="date" v-model="joinDraft">
          <button type="button" class="btn btn-sm" :disabled="savingJoin || joinDraft === (sel.joinDate || '')" @click="saveJoin">{{ savingJoin ? 'Saving…' : 'Save' }}</button>
          <span class="help" v-if="!sel.joinDate">Entered once; it's kept on the staff record.</span>
        </div>

        <div class="notice warn" v-if="notes.length"><div v-for="n in notes" :key="n">{{ n }}</div></div>

        <div class="oo-preview">
          <iframe v-if="pdfUrl" ref="frame" :src="pdfUrl + '#toolbar=0&view=FitH'" title="One To One Session form"></iframe>
          <p v-else class="muted oo-empty">{{ building ? 'Making the form…' : 'The form shows here.' }}</p>
        </div>
        <p class="help">Marks are the average each question got from the colleagues who rated this person, on the 1 to 5 scale. The other boxes are left empty to write in at the session.</p>
      </section>
      <section class="card" v-else-if="!loading">
        <p class="muted oo-empty">Click View on a person to see their form.</p>
      </section>
    </div>
  </main>
</template>

<script>
// Performance › One To One Session (12 Nov 2026). HR and Directors only: only they can read the COH marks.
// The form is the PDF drawn by lib/performance/oneToOnePdf.js (laid out like HR's Word template); what you see is what prints.
import { listQuarters } from '@/lib/performance/quarters.js';
import { loadSession, loadVenues, saveVenues, saveJoinDate, formData, fileName, cleanVenues, DEFAULT_VENUES, TOPIC } from '@/lib/performance/oneToOne.js';
import { buildOneToOnePdf } from '@/lib/performance/oneToOnePdf.js';
import { CJK_FONT_URL } from '@/lib/agreements/pdf.js';
import { friendlyError } from '@/lib/finance-data.js';
import logoUrl from '@/assets/widebed-vacation-rentals.jpg';

const todayKey = () => { const d = new Date(Date.now() + 8 * 3600 * 1000); return d.toISOString().slice(0, 10); };   // Malaysia day
const LOCAL_KEY = 'wb.oneToOne.venues';
let logoBytes = null, fallbackFont;   // loaded once

export default {
  data() {
    return {
      loading: true, error: '', quarters: [], quarterId: '', questions: [], rows: [], unreadable: 0, search: '', selectedUid: '',
      date: todayKey(), venues: [...DEFAULT_VENUES], venue: DEFAULT_VENUES[0], venueOpen: false, newVenue: '', venueLocal: false,
      joinDraft: '', savingJoin: false, pdfUrl: '', building: false, fontMissing: false,
      TOPIC, topic: TOPIC, edit: { staffName: '', position: '' }, editsByUid: {}   // what HR typed over the filled-in details, kept per person while the page is open
    };
  },
  computed: {
    shown() { const q = this.search.trim().toLowerCase(); return q ? this.rows.filter(r => r.name.toLowerCase().includes(q)) : this.rows; },
    sel() { return this.rows.find(r => r.uid === this.selectedUid) || null; },
    quarterName() { return this.quarters.find(q => q.id === this.quarterId)?.name || ''; },
    form() { return this.sel ? formData({ row: this.sel, questions: this.questions, date: this.date, venue: this.venue, edits: { ...this.edit, topic: this.topic } }) : null; },
    downloadName() { return this.form ? fileName(this.form.staffName, this.quarterName) : ''; },
    edited() { return !!this.sel && (this.edit.staffName !== this.sel.name || this.edit.position !== this.sel.position || this.topic !== TOPIC); },
    notes() {
      const f = this.form, out = [];
      if (!f) return out;
      if (!this.questions.length) out.push('This quarter has no Code of Honor questions. Add them on COH Evaluations › Manage questions.');
      else if (!f.raters) out.push('No colleague has rated this person yet, so the Code of Honor marks are empty.');
      else if (f.raters < f.expected) out.push(`Marks so far, from ${f.raters} of ${f.expected} colleagues. Not everyone has finished.`);
      if (this.unreadable) out.push(`${this.unreadable} evaluation${this.unreadable === 1 ? '' : 's'} in this quarter couldn't be read, so they are not counted.`);
      if (this.fontMissing) out.push('This name has characters (for example Chinese) that the PDF can\'t print; they show as "?".');
      return out;
    }
  },
  watch: {
    quarterId() { this.loadQuarter(); },
    // Another person: their details are filled in (or what was typed for them earlier on this visit).
    selectedUid(uid, old) {
      if (old) this.editsByUid[old] = { ...this.edit };
      this.joinDraft = this.sel?.joinDate || '';
      this.edit = this.sel ? { ...(this.editsByUid[uid] || { staffName: this.sel.name, position: this.sel.position }) } : { staffName: '', position: '' };
    },
    form: { handler() { this.queueBuild(); }, deep: true }
  },
  async created() {
    try {
      const [quarters, v] = await Promise.all([listQuarters(), loadVenues()]);
      this.quarters = quarters;
      this.useVenues(v.venues, v.lastVenue);
      if (quarters.length) this.quarterId = quarters[0].id; else this.loading = false;   // quarterId's watcher loads the people
    } catch (e) { this.error = friendlyError(e, 'load the quarters'); this.loading = false; }
  },
  beforeUnmount() { clearTimeout(this.buildTimer); if (this.pdfUrl) URL.revokeObjectURL(this.pdfUrl); },
  methods: {
    async loadQuarter() {
      const id = this.quarterId;
      this.loading = true; this.error = ''; this.selectedUid = ''; this.editsByUid = {};
      try {
        const s = await loadSession(id);
        if (id !== this.quarterId) return;   // another quarter was picked meanwhile
        this.questions = s.questions; this.rows = s.rows; this.unreadable = s.unreadable;
      } catch (e) { this.error = friendlyError(e, 'load this quarter'); this.rows = []; this.questions = []; }
      this.loading = false;
    },

    // ---- Venues ----
    useVenues(list, last) {
      let venues = cleanVenues(list), lastVenue = last;
      try {   // venues kept on this computer (used while the shared list can't be saved)
        const local = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null');
        if (local?.venues?.length) { venues = cleanVenues([...venues, ...local.venues]); lastVenue = lastVenue || local.lastVenue; this.venueLocal = true; }
      } catch (_) { /* no saved list */ }
      this.venues = venues;
      this.venue = venues.includes(lastVenue) ? lastVenue : (venues[0] || '');
    },
    async keepVenues() {
      try { this.venues = await saveVenues(this.venues, this.venue); this.venueLocal = false; try { localStorage.removeItem(LOCAL_KEY); } catch (_) { /* fine */ } }
      catch (e) {
        // Not allowed yet (rules Draft 0.62 not deployed) or no connection: keep the list on this computer.
        this.venueLocal = true;
        try { localStorage.setItem(LOCAL_KEY, JSON.stringify({ venues: this.venues, lastVenue: this.venue })); } catch (_) { /* fine */ }
      }
    },
    pickVenue(v) { this.venue = v; this.venueOpen = false; this.keepVenues(); },
    addVenue() {
      const [v] = cleanVenues([this.newVenue]);
      if (!v) return;
      const have = this.venues.find(x => x.toLowerCase() === v.toLowerCase());
      if (!have) this.venues = cleanVenues([...this.venues, v]);
      this.venue = have || v; this.newVenue = ''; this.venueOpen = false; this.keepVenues();
    },
    removeVenue(v) {
      this.venues = this.venues.filter(x => x !== v);
      if (this.venue === v) this.venue = this.venues[0] || '';
      this.keepVenues();
    },
    rememberVenue() { if (this.venue) this.keepVenues(); },

    resetEdits() { this.edit = { staffName: this.sel.name, position: this.sel.position }; this.topic = TOPIC; },

    // ---- Join date ----
    async saveJoin() {
      const row = this.sel;
      this.savingJoin = true; this.error = '';
      try { await saveJoinDate(row.uid, this.joinDraft); row.joinDate = this.joinDraft; }
      catch (e) { this.error = e.code === 'permission-denied' ? 'You can\'t change the join date on your own record or a Director\'s. Ask a Director to enter it.' : friendlyError(e, 'save the join date'); }
      this.savingJoin = false;
    },

    // ---- The PDF ----
    queueBuild() { clearTimeout(this.buildTimer); this.buildTimer = setTimeout(() => this.build(), 250); },
    async build() {
      const data = this.form;
      if (!data) { if (this.pdfUrl) URL.revokeObjectURL(this.pdfUrl); this.pdfUrl = ''; return; }
      const run = (this.buildRun = (this.buildRun || 0) + 1);
      this.building = true;
      try {
        if (!logoBytes) { try { logoBytes = new Uint8Array(await (await fetch(logoUrl)).arrayBuffer()); } catch (_) { logoBytes = null; } }
        // A name the built-in fonts can't print (e.g. Chinese): try the same extra font the agreements use.
        const odd = /[^\u0000-ÿ‘’“”–—…]/.test(`${data.staffName}${data.position}${data.venue}${data.questions.map(q => q.title).join('')}`);
        if (odd && fallbackFont === undefined) {
          try { const res = await fetch(CJK_FONT_URL); fallbackFont = res.ok && !(res.headers.get('content-type') || '').includes('text/html') ? new Uint8Array(await res.arrayBuffer()) : null; } catch (_) { fallbackFont = null; }
        }
        const bytes = await buildOneToOnePdf(data, { logoBytes, fallbackFontBytes: odd ? fallbackFont : null });
        if (run !== this.buildRun) return;   // a newer form is being made
        if (this.pdfUrl) URL.revokeObjectURL(this.pdfUrl);
        this.pdfUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
        this.fontMissing = odd && !fallbackFont;
      } catch (e) { console.error(e); if (run === this.buildRun) this.error = 'The form couldn\'t be made. Refresh the page and try again.'; }
      if (run === this.buildRun) this.building = false;
    },
    printPdf() {
      this.rememberVenue();
      try { this.$refs.frame.contentWindow.focus(); this.$refs.frame.contentWindow.print(); }
      catch (_) { window.open(this.pdfUrl, '_blank', 'noopener'); }   // the browser's own PDF page has a print button
    }
  }
};
</script>

<style scoped>
.oo-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.5fr); gap: 16px; align-items: start; }
@media (max-width: 1100px) { .oo-grid { grid-template-columns: minmax(0, 1fr); } }
.oo-search { margin-bottom: 10px; }
.oo-list { list-style: none; margin: 0 0 10px; padding: 0; display: grid; gap: 6px; }
.oo-row { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border: 1px solid var(--border); border-radius: 10px; }
.oo-row.on { border-color: var(--accent); background: var(--accent-soft); }
.oo-who { flex: 1; min-width: 0; display: grid; }
.oo-who b { font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oo-who small { color: var(--text-2); font-size: 12px; }
.oo-empty { padding: 18px; text-align: center; }
.oo-head { flex-wrap: wrap; gap: 8px; }
.oo-acts { display: flex; gap: 8px; }
.oo-acts a.disabled { pointer-events: none; opacity: .5; }
.oo-fields { margin-bottom: 4px; }
.oo-venue { position: relative; }
.oo-venue-btn { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; text-align: left; cursor: pointer; }
.oo-venue-btn span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oo-venue-menu { position: absolute; z-index: 6; top: 100%; left: 0; right: 0; margin-top: 4px; background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
  padding: 6px; box-shadow: 0 12px 28px rgba(26, 29, 35, .12); }
.oo-venue-menu ul { list-style: none; margin: 0; padding: 0; max-height: 220px; overflow: auto; }
.oo-venue-menu li { display: flex; align-items: center; border-radius: 8px; }
.oo-venue-menu li.on { background: var(--accent-soft); }
.oo-venue-menu li.on .oo-venue-pick { font-weight: 600; }
.oo-venue-pick { flex: 1; min-width: 0; text-align: left; border: 0; background: none; font: inherit; color: var(--text); padding: 9px 10px; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oo-venue-del { width: 32px; height: 32px; font-size: 13px; }
.oo-venue-add { border-top: 1px solid var(--line); margin-top: 6px; padding: 8px 4px 2px; display: grid; gap: 4px; }
.oo-venue-add label { font-size: 12px; font-weight: 600; color: var(--text-2); }
.oo-venue-add div { display: flex; gap: 6px; }
.oo-venue-add .input { flex: 1; min-width: 0; }
.oo-edit-note { margin: 0 0 10px; }
.oo-edit-note .link { margin-left: 6px; font-size: 12px; }
.oo-join { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.oo-join label { font-size: 13px; font-weight: 600; }
.oo-join .input { width: 170px; }
.oo-preview { background: var(--chip); border-radius: 10px; padding: 10px; margin: 10px 0; }
.oo-preview iframe { display: block; width: 100%; height: 760px; border: 0; background: #fff; border-radius: 6px; }
</style>
