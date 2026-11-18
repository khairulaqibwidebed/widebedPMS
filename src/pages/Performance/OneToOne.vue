<template>
  <!-- Redesigned 18 Nov 2026 (Khairul, Option A): one-line staff list that scrolls on its own; details shown as text
       (Edit for this form opens the boxes); Session and Leave side by side; PDF preview below. -->
  <main class="content">
    <div class="loading-bar" v-show="loading"></div>
    <div class="page-head">
      <div>
        <h1>One To One Session</h1>
        <div class="sub">Each employee's form, filled in from HR details and Code of Honor marks. View, download or print it.</div>
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
      <!-- Staff of the quarter: one line each, scrolls inside its own box -->
      <section class="card oo-staff">
        <input class="input" type="search" v-model="search" placeholder="Search a name" aria-label="Search a name">
        <div class="oo-count" v-if="rows.length"><span>{{ rows.length }} people</span><span>{{ rows.filter(r => r.complete).length }} complete</span></div>
        <ul class="oo-list">
          <li v-for="r in shown" :key="r.uid">
            <button type="button" class="oo-row" :class="{ on: r.uid === selectedUid }" @click="selectedUid = r.uid" :title="`${r.done} of ${r.expected} colleagues have rated ${r.name}`">
              <b>{{ r.name }}</b><small>{{ r.position || '—' }}</small>
              <span class="oo-n" :class="r.complete ? 'green' : r.done ? 'amber' : 'grey'">{{ r.done }}/{{ r.expected }}</span>
            </button>
          </li>
          <li v-if="!loading && !shown.length" class="muted oo-empty">{{ rows.length ? 'No one matches.' : 'Nobody is taking part in this quarter yet.' }}</li>
        </ul>
        <p class="help oo-key">The number is how many colleagues have rated them, out of those who should. Green means everyone is done.</p>
      </section>

      <div class="oo-right" v-if="sel">
        <!-- Who: details as text, from HR details -->
        <section class="card">
          <div class="oo-head">
            <div class="oo-title">
              <h2>{{ form.staffName }}</h2>
              <div class="sub">{{ form.position || 'No position' }} · rated by {{ sel.done }} of {{ sel.expected }} colleagues<span class="oo-edited" v-if="edited">Edited for this form</span></div>
            </div>
            <span class="oo-acts">
              <button type="button" class="btn btn-sm" @click="editOpen = !editOpen">{{ editOpen ? 'Done' : 'Edit for this form' }}</button>
              <button type="button" class="btn btn-sm" :disabled="!pdfUrl || building" @click="printPdf">Print</button>
              <a class="btn btn-sm btn-primary" :class="{ disabled: !pdfUrl || building }" :href="pdfUrl || undefined" :download="downloadName" @click="rememberVenue">Download PDF</a>
            </span>
          </div>
          <div class="oo-facts">
            <div><span class="oo-lbl">Position</span><b>{{ form.position || '—' }}</b></div>
            <div><span class="oo-lbl">IC number</span><b :class="{ muted: !form.ic }">{{ form.ic || 'Not saved in HR details' }}</b></div>
            <div><span class="oo-lbl">Join date</span><b :class="{ muted: !joinShown }">{{ joinShown || 'Not saved in HR details' }}</b></div>
            <div><span class="oo-lbl">COH average</span><b class="oo-avg">{{ form.average || '—' }}</b></div>
          </div>
          <div class="grid-fields oo-editbox" v-if="editOpen">
            <div class="field"><label for="ooName">Staff name</label><input id="ooName" class="input" v-model="edit.staffName" maxlength="120" :placeholder="sel.name"></div>
            <div class="field"><label for="ooPos">Position</label><input id="ooPos" class="input" v-model="edit.position" maxlength="120" :placeholder="sel.position || 'Position'"></div>
            <div class="field"><label for="ooIc">IC number</label><input id="ooIc" class="input" v-model="edit.ic" maxlength="40" :placeholder="sel.ic || 'Not saved in HR details'"></div>
          </div>
          <p class="help oo-src">
            {{ editOpen ? 'Changes here are for this form only, not the staff record.' : 'From Staff accounts › HR details. Change them there, or use Edit for this form.' }}
            <button type="button" class="link" v-if="edited" @click="resetEdits">Put back the saved details</button>
          </p>
        </section>

        <div class="oo-pair">
          <section class="card">
            <h3 class="oo-h3">Session</h3>
            <div class="grid-fields">
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
            <div class="field"><label for="ooTopic">Topic</label><input id="ooTopic" class="input" v-model="topic" maxlength="120" :placeholder="TOPIC"></div>
          </section>
          <!-- Leave taken this year (17 Nov 2026): typed in for this form, printed under Join Date. Not saved. -->
          <section class="card oo-leave">
            <h3 class="oo-h3">Leave taken in {{ leaveYear }} <span class="help">days, this form only</span></h3>
            <table class="oo-leave-table">
              <thead><tr><th v-for="t in LEAVE_TYPES" :key="t.key" scope="col">{{ t.label }}</th><th scope="col">Total</th></tr></thead>
              <tbody><tr>
                <td v-for="t in LEAVE_TYPES" :key="t.key">
                  <input class="input" type="number" min="0" max="366" step="0.5" inputmode="decimal" placeholder="0" v-model="edit.leave[t.key]" :aria-label="t.label + ' leave days in ' + leaveYear">
                </td>
                <td class="oo-leave-total">{{ form.leave.total || '—' }}</td>
              </tr></tbody>
            </table>
          </section>
        </div>

        <div class="notice warn" v-if="notes.length"><div v-for="n in notes" :key="n">{{ n }}</div></div>

        <section class="card">
          <h3 class="oo-h3">Preview</h3>
          <div class="oo-preview">
            <iframe v-if="pdfUrl" ref="frame" :src="pdfUrl + '#toolbar=0&view=FitH'" title="One To One Session form"></iframe>
            <p v-else class="muted oo-empty">{{ building ? 'Making the form…' : 'The form shows here.' }}</p>
          </div>
          <p class="help">Marks are the average each question got from the colleagues who rated this person, on the 1 to 5 scale. The other boxes are left empty to write in at the session.</p>
        </section>
      </div>
      <section class="card" v-else-if="!loading">
        <p class="muted oo-empty">Click a name on the left to see their form.</p>
      </section>
    </div>
  </main>
</template>

<script>
// Performance › One To One Session (12 Nov 2026). HR and Directors only: only they can read the COH marks.
// The form is the PDF drawn by lib/performance/oneToOnePdf.js (laid out like HR's Word template); what you see is what prints.
import { listQuarters } from '@/lib/performance/quarters.js';
import { loadSession, loadVenues, saveVenues, formData, longDate, fileName, cleanVenues, DEFAULT_VENUES, TOPIC, LEAVE_TYPES, emptyLeave } from '@/lib/performance/oneToOne.js';
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
      pdfUrl: '', building: false, fontMissing: false, editOpen: false,
      TOPIC, LEAVE_TYPES, topic: TOPIC, edit: { staffName: '', position: '', ic: '', leave: emptyLeave() }, editsByUid: {}   // what HR typed over the filled-in details, kept per person while the page is open
    };
  },
  computed: {
    joinShown() { return longDate(this.sel?.joinDate); },   // dd/mm/yyyy, as printed on the PDF
    shown() { const q = this.search.trim().toLowerCase(); return q ? this.rows.filter(r => r.name.toLowerCase().includes(q)) : this.rows; },
    sel() { return this.rows.find(r => r.uid === this.selectedUid) || null; },
    leaveYear() { return /^\d{4}/.test(this.date || '') ? this.date.slice(0, 4) : String(new Date().getFullYear()); },
    quarterName() { return this.quarters.find(q => q.id === this.quarterId)?.name || ''; },
    form() { return this.sel ? formData({ row: this.sel, questions: this.questions, date: this.date, venue: this.venue, edits: { ...this.edit, topic: this.topic } }) : null; },
    downloadName() { return this.form ? fileName(this.form.staffName, this.quarterName) : ''; },
    edited() { return !!this.sel && (this.edit.staffName !== this.sel.name || this.edit.position !== this.sel.position || this.edit.ic !== (this.sel.ic || '') || this.topic !== TOPIC); },
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
      if (old) this.editsByUid[old] = { ...this.edit, leave: { ...this.edit.leave } };
      const kept = this.editsByUid[uid];
      this.edit = this.sel ? (kept ? { ...kept, leave: { ...kept.leave } } : { staffName: this.sel.name, position: this.sel.position, ic: this.sel.ic || '', leave: emptyLeave() })
        : { staffName: '', position: '', ic: '', leave: emptyLeave() };
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

    resetEdits() { this.edit = { ...this.edit, staffName: this.sel.name, position: this.sel.position, ic: this.sel.ic || '' }; this.topic = TOPIC; },   // the leave typed in stays

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
        const odd = /[^\u0000-ÿ‘’“”–—…]/.test(`${data.staffName}${data.position}${data.ic}${data.venue}${data.questions.map(q => q.title).join('')}`);
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
.oo-grid { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 18px; align-items: start; }
@media (max-width: 1000px) { .oo-grid { grid-template-columns: minmax(0, 1fr); } .oo-staff { position: static; max-height: 360px; } }
.oo-staff { position: sticky; top: 16px; max-height: calc(100vh - 32px); display: flex; flex-direction: column; padding: 14px 0 0; overflow: hidden; }
.oo-staff > .input { margin: 0 14px; width: auto; height: 46px; font-size: 15px; padding: 0 14px; border-width: 1.5px; }
.oo-count { display: flex; justify-content: space-between; font-size: 12px; color: var(--text-2); padding: 8px 16px 6px; }
.oo-list { list-style: none; margin: 0; padding: 0; overflow-y: auto; flex: 1; border-top: 1px solid var(--line); }
.oo-row { display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 16px; border: 0; border-left: 3px solid transparent; border-bottom: 1px solid var(--line);
  background: none; font: inherit; color: var(--text); text-align: left; cursor: pointer; }
.oo-row:hover { background: var(--chip); }
.oo-row.on { background: var(--accent-soft); border-left-color: var(--accent); }
.oo-row b { font-size: 13px; font-weight: 600; flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oo-row small { flex: 1; min-width: 0; font-size: 12px; color: var(--text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oo-n { flex: none; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px; font-variant-numeric: tabular-nums; }
.oo-n.green { background: #e3f6ea; color: #15803d; }
.oo-n.amber { background: #fff4dc; color: #a16207; }
.oo-n.grey { background: var(--chip); color: var(--text-2); }
.oo-key { margin: 0; padding: 8px 16px 12px; font-size: 11px; border-top: 1px solid var(--line); }
.oo-right { display: grid; gap: 16px; min-width: 0; }
.oo-right > .card, .oo-pair > .card { margin: 0; }
.oo-head { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 10px; }
.oo-title h2 { margin: 0; font-size: 19px; }
.oo-title .sub { margin-top: 2px; }
.oo-edited { margin-left: 8px; font-size: 11px; font-weight: 600; color: var(--accent); background: var(--accent-soft); padding: 1px 8px; border-radius: 999px; }
.oo-facts { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--line); }
@media (max-width: 700px) { .oo-facts { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.oo-facts > div { display: grid; gap: 3px; min-width: 0; }
.oo-facts b { font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oo-facts b.muted { font-weight: 500; color: var(--muted); }
.oo-lbl { font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--text-2); }
.oo-avg { color: var(--accent); }
.oo-editbox { margin-top: 14px; }
.oo-src { margin: 10px 0 0; }
.oo-src .link { margin-left: 6px; font-size: 12px; }
.oo-pair { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; }
@media (max-width: 1250px) { .oo-pair { grid-template-columns: minmax(0, 1fr); } }
.oo-h3 { margin: 0 0 12px; font-size: 15px; }
.oo-h3 .help { font-weight: 400; margin-left: 4px; }
.oo-leave-table { width: 100%; border-collapse: separate; border-spacing: 0; table-layout: fixed; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
.oo-preview { background: var(--chip); border-radius: 10px; padding: 10px; margin: 0 0 10px; }
.oo-empty { padding: 18px; text-align: center; }
.oo-acts { display: flex; gap: 8px; }
.oo-acts a.disabled { pointer-events: none; opacity: .5; }
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
.oo-leave-table th { padding: 7px 8px; font-size: 12px; font-weight: 600; color: var(--text-2); background: var(--chip); text-align: center; border-bottom: 1px solid var(--border); }
.oo-leave-table td { padding: 6px; text-align: center; }
.oo-leave-table th + th, .oo-leave-table td + td { border-left: 1px solid var(--line); }
.oo-leave-table .input { width: 100%; height: 34px; text-align: center; padding: 0 6px; }
.oo-leave-total { font-weight: 700; font-variant-numeric: tabular-nums; }
.oo-preview iframe { display: block; width: 100%; height: 760px; border: 0; background: #fff; border-radius: 6px; }
</style>
