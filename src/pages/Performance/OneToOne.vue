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
        <select class="select" :value="quarterId" @change="pickQuarter($event)" v-if="quarters.length" aria-label="Quarter">
          <option v-for="q in quarters" :key="q.id" :value="q.id">{{ q.name }}</option>
        </select>
      </div>
    </div>

    <div class="notice error" v-if="error">{{ error }}</div>
    <div class="notice warn" v-if="formsLocked">Saving forms needs the Firestore rules Draft 1.13 (oneToOneForms). Ask IT to deploy them; until then, what you type here is not kept.</div>
    <!-- Unsaved changes (25 Nov 2026): asked before another person or quarter is opened -->
    <div class="notice warn oo-ask" v-if="pending" role="alertdialog" aria-label="Unsaved changes">
      <span>You have unsaved changes for <b>{{ form ? form.staffName : 'this person' }}</b>.</span>
      <span class="oo-ask-btns">
        <button type="button" class="btn btn-sm btn-primary" :disabled="saving" @click="answerPending('save')">{{ saving ? 'Saving…' : 'Save and continue' }}</button>
        <button type="button" class="btn btn-sm" @click="answerPending('discard')">Discard</button>
        <button type="button" class="btn btn-sm" @click="answerPending('stay')">Stay</button>
      </span>
    </div>
    <div class="notice" v-if="!loading && !quarters.length">No quarter yet. Make one on Quarterly Management first.</div>

    <!-- Redesigned 25 Nov 2026 (Crane, from the approved Claude Design preview): people with initials and a Saved filter; one person
         card with save status and actions; Session and Leave the same size; Code of Honor marks and Write-in boxes closed until Show. -->
    <div class="oo-grid" v-if="quarters.length">
      <section class="card oo-staff">
        <div class="oo-staff-top">
          <input class="input" type="search" v-model="search" placeholder="Search a name" aria-label="Search a name">
          <div class="oo-filters" role="group" aria-label="Show">
            <button v-for="f in filters" :key="f.key" type="button" class="oo-chip" :class="{ on: filter === f.key }" :aria-pressed="String(filter === f.key)" @click="filter = f.key">{{ f.label }} {{ f.count }}</button>
          </div>
        </div>
        <ul class="oo-list">
          <li v-for="r in shown" :key="r.uid">
            <button type="button" class="oo-row" :class="{ on: r.uid === selectedUid }" @click="pick(r.uid)" :title="`${r.done} of ${r.expected} colleagues have rated ${r.name}`">
              <span class="oo-av" aria-hidden="true">{{ initials(r.name) }}</span>
              <span class="oo-who"><b>{{ r.name }}</b><small>{{ r.position || '—' }}</small></span>
              <span class="oo-side">
                <span class="oo-n" :class="r.complete ? 'green' : r.done ? 'amber' : 'grey'">{{ r.done }}/{{ r.expected }}</span>
                <span class="oo-saved" v-if="saved[r.uid]">✓ Saved</span>
              </span>
            </button>
          </li>
          <li v-if="!loading && !shown.length" class="muted oo-empty">{{ rows.length ? 'No one matches.' : 'Nobody is taking part in this quarter yet.' }}</li>
        </ul>
        <p class="help oo-key">7/9 = colleagues who rated them, out of those who should. Green means everyone is done.</p>
      </section>

      <div class="oo-right" v-if="sel">
        <!-- The person: details from HR details, save status and the form's actions -->
        <section class="card">
          <div class="oo-head">
            <div class="oo-title">
              <span class="oo-av big" aria-hidden="true">{{ initials(form.staffName) }}</span>
              <div>
                <h2>{{ form.staffName }}</h2>
                <div class="oo-badges">
                  <span class="oo-badge">{{ form.position || 'No position' }}</span>
                  <span class="oo-badge" :class="sel.complete ? 'green' : 'amber'">Rated by {{ sel.done }} of {{ sel.expected }}</span>
                  <span class="oo-badge accent" v-if="edited">Edited for this form</span>
                </div>
              </div>
            </div>
            <span class="oo-acts">
              <span class="oo-status" :class="dirty ? 'amber' : savedAt ? 'green' : 'grey'"><i aria-hidden="true"></i>{{ dirty ? 'Unsaved changes' : savedAt ? 'Saved ' + savedAt : 'Not saved yet' }}</span>
              <button type="button" class="btn" :disabled="!pdfUrl || building" @click="printPdf">Print</button>
              <a class="btn" :class="{ disabled: !pdfUrl || building }" :href="pdfUrl || undefined" :download="downloadName" @click="rememberVenue">Download PDF</a>
              <button type="button" class="btn btn-primary oo-save" :disabled="saving || !dirty" @click="save()">{{ saving ? 'Saving…' : 'Save' }}</button>
            </span>
          </div>
          <div class="oo-facts">
            <div><span class="oo-lbl">Position</span><b>{{ form.position || '—' }}</b></div>
            <div><span class="oo-lbl">IC number</span><b :class="{ muted: !form.ic }">{{ form.ic || 'Not saved in HR details' }}</b></div>
            <div><span class="oo-lbl">Join date</span><b :class="{ muted: !joinShown }">{{ joinShown || 'Not saved in HR details' }}</b></div>
            <div><span class="oo-lbl">Details from</span><span class="oo-from">HR details · <button type="button" class="link" @click="editOpen = !editOpen">{{ editOpen ? 'Done' : 'Edit for this form' }}</button></span></div>
          </div>
          <div class="grid-fields oo-editbox" v-if="editOpen">
            <div class="field"><label for="ooName">Staff name</label><input id="ooName" class="input" v-model="edit.staffName" maxlength="120" :placeholder="sel.name"></div>
            <div class="field"><label for="ooPos">Position</label><input id="ooPos" class="input" v-model="edit.position" maxlength="120" :placeholder="sel.position || 'Position'"></div>
            <div class="field"><label for="ooIc">IC number</label><input id="ooIc" class="input" v-model="edit.ic" maxlength="40" :placeholder="sel.ic || 'Not saved in HR details'"></div>
          </div>
          <p class="help oo-src" v-if="editOpen || edited">
            {{ editOpen ? 'Changes here are for this form only, not the staff record.' : 'Some details were changed for this form.' }}
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
          <!-- Leave taken until the session date: typed in for this form, printed under Join Date. Saved with Save. -->
          <section class="card">
            <div class="oo-h3row"><h3 class="oo-h3">Leave taken until {{ leaveUntil }}</h3><span class="help">days</span></div>
            <div class="oo-leave">
              <div v-for="t in LEAVE_TYPES" :key="t.key">
                <label class="oo-leave-lbl" :for="'ooLv' + t.key">{{ t.label }}</label>
                <input :id="'ooLv' + t.key" class="input" type="number" min="0" max="366" step="0.5" inputmode="decimal" placeholder="0" v-model="edit.leave[t.key]" :aria-label="t.label + ' leave days until ' + leaveUntil">
              </div>
              <div><span class="oo-leave-lbl">Total</span><div class="oo-leave-total">{{ form.leave.total || '—' }}</div></div>
            </div>
          </section>
        </div>

        <div class="notice warn" v-if="notes.length"><div v-for="n in notes" :key="n">{{ n }}</div></div>

        <!-- Code of Honor marks: the overall average, each question's mark behind Show -->
        <section class="card">
          <button type="button" class="oo-fold" :aria-expanded="String(cohOpen)" @click="cohOpen = !cohOpen">
            <span>
              <span class="oo-fold-title">Code of Honor marks</span>
              <span class="oo-fold-sub">{{ cohSub }}</span>
            </span>
            <span class="oo-fold-right">
              <span class="oo-big"><b>{{ form.average || '—' }}</b><small>Overall average</small></span>
              <span class="oo-showbtn">{{ cohOpen ? 'Hide' : 'Show' }} <span class="oo-chev" :class="{ up: cohOpen }" aria-hidden="true">▾</span></span>
            </span>
          </button>
          <div class="oo-fold-body oo-coh" v-if="cohOpen">
            <div v-for="(q, k) in form.questions" :key="k" class="oo-bar-row">
              <span class="oo-bar-name" :title="q.title">{{ q.title }}</span>
              <span class="oo-bar"><span :class="{ low: q.mark !== '' && Number(q.mark) < 3.5 }" :style="{ width: q.mark === '' ? '0%' : (Number(q.mark) / 5 * 100) + '%' }"></span></span>
              <b class="oo-bar-mark">{{ q.mark || '—' }}</b>
            </div>
            <p v-if="!form.questions.length" class="muted oo-empty">No Code of Honor questions in this quarter.</p>
          </div>
        </section>

        <!-- Write-in boxes (25 Nov 2026): the parts of the template left empty, typed here and printed on the PDF. Closed until Show. -->
        <section class="card">
          <button type="button" class="oo-fold" :aria-expanded="String(writeOpen)" @click="writeOpen = !writeOpen">
            <span>
              <span class="oo-fold-title">Write-in boxes</span>
              <span class="oo-fold-sub">{{ filled ? filled + ' filled in · ' : '' }}ratings, what is working, behaviour, action, names</span>
            </span>
            <span class="oo-showbtn">{{ writeOpen ? 'Hide' : 'Show' }} <span class="oo-chev" :class="{ up: writeOpen }" aria-hidden="true">▾</span></span>
          </button>
          <div class="oo-fold-body oo-write" v-if="writeOpen">
            <div>
              <div class="oo-kicker">Page 1 · Individual and colleague views</div>
              <div class="oo-two">
                <div class="oo-box">
                  <div class="oo-box-head"><b>Individual (Ind)</b><label class="oo-rate">Self rating <input class="input" type="number" min="1" max="10" step="1" inputmode="numeric" v-model="edit.notes.selfRating" placeholder="–" aria-label="Overall self rating, 1 to 10"> /10</label></div>
                  <div class="field"><label for="ooWi">What is working</label><textarea id="ooWi" class="input" rows="3" maxlength="1500" v-model="edit.notes.workingInd"></textarea></div>
                  <div class="field"><label for="ooNwi">What is not working</label><textarea id="ooNwi" class="input" rows="3" maxlength="1500" v-model="edit.notes.notWorkingInd"></textarea></div>
                </div>
                <div class="oo-box">
                  <div class="oo-box-head"><b>Colleague (Co)</b><label class="oo-rate">Superior rating <input class="input" type="number" min="1" max="10" step="1" inputmode="numeric" v-model="edit.notes.superiorRating" placeholder="–" aria-label="Superior rating, 1 to 10"> /10</label></div>
                  <div class="field"><label for="ooWc">What is working</label><textarea id="ooWc" class="input" rows="3" maxlength="1500" v-model="edit.notes.workingCo"></textarea></div>
                  <div class="field"><label for="ooNwc">What is not working</label><textarea id="ooNwc" class="input" rows="3" maxlength="1500" v-model="edit.notes.notWorkingCo"></textarea></div>
                </div>
              </div>
            </div>

            <div>
              <div class="oo-kicker">Page 2 · Behaviour competencies, marks 1 to 5</div>
              <div class="oo-three">
                <div class="oo-box" v-for="b in BEHAVIOURS" :key="b.key">
                  <b>{{ b.label }}</b>
                  <div class="oo-hint">{{ BEHAVIOUR_HINT[b.key] }}</div>
                  <div class="oo-pair-in">
                    <div class="field"><label :for="'ooBs' + b.key">Self</label><input :id="'ooBs' + b.key" class="input oo-mid" type="number" min="1" max="5" step="1" inputmode="numeric" placeholder="–" v-model="edit.notes.behaviour[b.key].self"></div>
                    <div class="field"><label :for="'ooBp' + b.key">Superior</label><input :id="'ooBp' + b.key" class="input oo-mid" type="number" min="1" max="5" step="1" inputmode="numeric" placeholder="–" v-model="edit.notes.behaviour[b.key].superior"></div>
                  </div>
                  <div class="field"><label :for="'ooBr' + b.key">Remark</label><input :id="'ooBr' + b.key" class="input" maxlength="200" v-model="edit.notes.behaviour[b.key].remark"></div>
                </div>
              </div>
            </div>

            <div>
              <div class="oo-kicker">Action</div>
              <div class="oo-actions">
                <button v-for="a in ACTIONS" :key="a.key" type="button" class="oo-pill" :class="{ on: edit.notes.actions[a.key] }" :aria-pressed="String(!!edit.notes.actions[a.key])"
                  @click="edit.notes.actions[a.key] = !edit.notes.actions[a.key]">{{ edit.notes.actions[a.key] ? '✓' : '+' }} {{ a.label }}{{ a.key === 'other' ? ':' : '' }}</button>
                <input class="input oo-other" maxlength="80" v-model="edit.notes.otherAction" placeholder="Other action" aria-label="Other action" @input="edit.notes.actions.other = !!edit.notes.otherAction.trim() || edit.notes.actions.other">
              </div>
              <div class="oo-two">
                <div class="field"><label for="ooRec">1. Recommendation for confirmation</label><input id="ooRec" class="input" maxlength="120" v-model="edit.notes.recommendation" placeholder="N/A"></div>
                <div class="field"><label for="ooYes">If yes, action</label><input id="ooYes" class="input" maxlength="200" v-model="edit.notes.ifYes"></div>
              </div>
              <div class="field"><label for="ooQr">2. Quarterly review</label><textarea id="ooQr" class="input" rows="3" maxlength="1500" v-model="edit.notes.quarterlyReview"></textarea></div>
            </div>

            <div>
              <div class="oo-kicker">Signatures</div>
              <div class="oo-two">
                <div class="field"><label for="ooAtt">Attended by</label><input id="ooAtt" class="input" maxlength="120" v-model="edit.notes.attendedBy" :placeholder="form.staffName"></div>
                <div class="field"><label for="ooAck">Acknowledged by</label><input id="ooAck" class="input" maxlength="120" v-model="edit.notes.acknowledgedBy" placeholder="HR / Director"></div>
              </div>
            </div>
          </div>
        </section>

        <section class="card">
          <div class="oo-h3row"><h3 class="oo-h3">PDF preview</h3><span class="help">Updates as you type · A4, 2 pages</span></div>
          <div class="oo-preview">
            <iframe v-if="pdfUrl" ref="frame" :src="pdfUrl + '#toolbar=0&view=FitH'" title="One To One Session form"></iframe>
            <p v-else class="muted oo-empty">{{ building ? 'Making the form…' : 'The form shows here.' }}</p>
          </div>
          <p class="help">Marks are the average each question got from the colleagues who rated this person, on the 1 to 5 scale. The other boxes print what you type in Write-in boxes; the ones left empty stay blank to write in at the session.</p>
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
import { loadSession, loadVenues, saveVenues, formData, longDate, fileName, cleanVenues, DEFAULT_VENUES, TOPIC, LEAVE_TYPES, emptyLeave,
  BEHAVIOURS, ACTIONS, emptyNotes, cleanNotes, notesFilled, formRecord, loadForms, saveForm } from '@/lib/performance/oneToOne.js';
import { askConfirm } from '@/lib/confirm.js';
import { buildOneToOnePdf } from '@/lib/performance/oneToOnePdf.js';
import { CJK_FONT_URL } from '@/lib/agreements/pdf.js';
import { friendlyError } from '@/lib/finance-data.js';
import logoUrl from '@/assets/widebed-vacation-rentals.jpg';

const todayKey = () => { const d = new Date(Date.now() + 8 * 3600 * 1000); return d.toISOString().slice(0, 10); };   // Malaysia day
const LOCAL_KEY = 'wb.oneToOne.venues';
// The scale on page 2, as a reminder under each behaviour (1 → 3 → 5)
const BEHAVIOUR_HINT = { positive: 'I can’t → I will try → No problem', passionate: 'No energy → Normal → Full of energy', accountability: 'Never complete → Late → Always complete' };
let logoBytes = null, fallbackFont;   // loaded once

export default {
  data() {
    return {
      loading: true, error: '', quarters: [], quarterId: '', questions: [], rows: [], unreadable: 0, search: '', selectedUid: '',
      date: todayKey(), venues: [...DEFAULT_VENUES], venue: DEFAULT_VENUES[0], venueOpen: false, newVenue: '', venueLocal: false,
      pdfUrl: '', building: false, fontMissing: false, editOpen: false,
      TOPIC, LEAVE_TYPES, BEHAVIOURS, ACTIONS, topic: TOPIC, edit: { staffName: '', position: '', ic: '', leave: emptyLeave(), notes: emptyNotes() },
      // Saved forms (25 Nov 2026): saved = { uid: record } for this quarter; snapshot = the form as last loaded or saved, to tell unsaved changes
      saved: {}, formsLocked: false, saving: false, snapshot: '', pending: null, writeOpen: false,
      cohOpen: false, filter: 'all', BEHAVIOUR_HINT   // 25 Nov 2026 redesign: marks closed until Show; All / Not saved / Saved
    };
  },
  computed: {
    joinShown() { return longDate(this.sel?.joinDate); },   // dd/mm/yyyy, as printed on the PDF
    shown() {
      const q = this.search.trim().toLowerCase();
      return this.rows.filter(r => (!q || r.name.toLowerCase().includes(q)) && (this.filter === 'all' || (this.filter === 'saved') === !!this.saved[r.uid]));
    },
    filters() {
      const n = this.rows.filter(r => this.saved[r.uid]).length;
      return [{ key: 'all', label: 'All', count: this.rows.length }, { key: 'unsaved', label: 'Not saved', count: this.rows.length - n }, { key: 'saved', label: 'Saved', count: n }];
    },
    cohSub() {
      const f = this.form;
      if (!f || !f.raters) return 'No colleague has rated this person yet.';
      return `Average from ${f.raters} of ${f.expected} colleague${f.expected === 1 ? '' : 's'}, out of 5.${f.raters < f.expected ? ' Not everyone has finished.' : ''}`;
    },
    sel() { return this.rows.find(r => r.uid === this.selectedUid) || null; },
    leaveUntil() { return longDate(this.date) || '—'; },
    filled() { return notesFilled(this.edit.notes); },
    current() { return this.sel ? JSON.stringify(formRecord({ quarterId: this.quarterId, uid: this.selectedUid, date: this.date, venue: this.venue, topic: this.topic, edit: this.edit })) : ''; },
    dirty() { return !!this.sel && this.current !== this.snapshot; },
    savedAt() {
      const t = this.saved[this.selectedUid]?.updatedAt, d = t?.toDate ? t.toDate() : t instanceof Date ? t : null;
      return d ? d.toLocaleString('en-GB', { day: '2-digit', month: '2-digit', hour: 'numeric', minute: '2-digit', hour12: true }).replace(',', '') : '';
    },
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
    // Attended by follows the staff name while it hasn't been changed by hand
    'edit.staffName'(name, old) { if (this.edit.notes && this.edit.notes.attendedBy === old) this.edit.notes.attendedBy = name; },
    form: { handler() { this.queueBuild(); }, deep: true }
  },
  async created() {
    this.onUnload = e => { if (this.dirty) { e.preventDefault(); e.returnValue = ''; } };   // closing the tab with unsaved changes
    window.addEventListener('beforeunload', this.onUnload);
    try {
      const [quarters, v] = await Promise.all([listQuarters(), loadVenues()]);
      this.quarters = quarters;
      this.useVenues(v.venues, v.lastVenue);
      if (quarters.length) this.quarterId = quarters[0].id; else this.loading = false;   // quarterId's watcher loads the people
    } catch (e) { this.error = friendlyError(e, 'load the quarters'); this.loading = false; }
  },
  beforeUnmount() { window.removeEventListener('beforeunload', this.onUnload); clearTimeout(this.buildTimer); if (this.pdfUrl) URL.revokeObjectURL(this.pdfUrl); },
  async beforeRouteLeave() {
    if (!this.dirty) return true;
    return askConfirm({ title: 'Leave without saving?', message: `Your changes to ${this.form?.staffName || 'this form'} are not saved.`, confirmText: 'Leave', danger: true });
  },
  methods: {
    async loadQuarter() {
      const id = this.quarterId;
      this.loading = true; this.error = ''; this.selectedUid = ''; this.saved = {}; this.pending = null;
      try {
        const [s, forms] = await Promise.all([loadSession(id), loadForms(id).catch(() => null)]);
        if (id !== this.quarterId) return;   // another quarter was picked meanwhile
        this.questions = s.questions; this.rows = s.rows; this.unreadable = s.unreadable;
        this.saved = forms || {}; this.formsLocked = !forms;   // null: the rules for oneToOneForms (Draft 1.13) aren't deployed yet
      } catch (e) { this.error = friendlyError(e, 'load this quarter'); this.rows = []; this.questions = []; }
      this.loading = false;
    },

    // ---- One person's form: open, save, and the unsaved-changes question ----
    // Opens the selected person: their saved form, or their HR details (date and venue carry over from the last person).
    applyPerson() {
      const sel = this.sel, r = sel && this.saved[sel.uid];
      if (!sel) { this.edit = { staffName: '', position: '', ic: '', leave: emptyLeave(), notes: emptyNotes() }; this.snapshot = ''; return; }
      if (r) {
        if (r.date) this.date = r.date;
        if (r.venue) this.venue = r.venue;
        this.topic = r.topic || TOPIC;
        this.edit = { staffName: r.staffName || sel.name, position: r.position || sel.position, ic: r.ic || sel.ic || '',
          leave: { ...emptyLeave(), ...(r.leave || {}) }, notes: cleanNotes(r.notes, r.staffName || sel.name) };
      } else {
        this.topic = TOPIC;
        this.edit = { staffName: sel.name, position: sel.position, ic: sel.ic || '', leave: emptyLeave(), notes: emptyNotes(sel.name) };
      }
      this.snapshot = this.current;
    },
    pick(uid) {
      if (uid === this.selectedUid) return;
      if (this.dirty) { this.pending = { kind: 'person', uid }; return; }
      this.pending = null; this.selectedUid = uid; this.applyPerson();
    },
    pickQuarter(e) {
      const id = e.target.value;
      if (this.dirty) { e.target.value = this.quarterId; this.pending = { kind: 'quarter', id }; return; }
      this.quarterId = id;
    },
    async answerPending(a) {
      const p = this.pending;
      if (!p || a === 'stay') { this.pending = null; return; }
      if (a === 'save' && !(await this.save())) return;   // not saved: stay on this form (the error shows above)
      this.pending = null; this.snapshot = this.current;    // discarded or saved
      if (p.kind === 'person') { this.selectedUid = p.uid; this.applyPerson(); } else this.quarterId = p.id;
    },
    async save() {
      if (!this.sel || this.saving) return false;
      this.saving = true; this.error = '';
      try {
        const rec = await saveForm({ quarterId: this.quarterId, uid: this.selectedUid, date: this.date, venue: this.venue, topic: this.topic, edit: this.edit });
        this.saved = { ...this.saved, [rec.uid]: rec };
        this.snapshot = this.current; this.formsLocked = false;
        this.rememberVenue();
        return true;
      } catch (e) {
        if (e?.code === 'permission-denied') this.formsLocked = true;
        this.error = friendlyError(e, 'save this form');
        return false;
      } finally { this.saving = false; }
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

    // "Abdullah (Erwin)" -> "AE"
    initials(name) { return String(name || '').replace(/[()]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'; },
    resetEdits() { this.edit = { ...this.edit, staffName: this.sel.name, position: this.sel.position, ic: this.sel.ic || '' }; this.topic = TOPIC; },   // the leave and write-in boxes stay

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
/* 25 Nov 2026 redesign (approved Claude Design preview) */
.oo-grid { display: grid; grid-template-columns: 320px minmax(0, 1fr); gap: 20px; align-items: start; }
@media (max-width: 1000px) { .oo-grid { grid-template-columns: minmax(0, 1fr); } }

/* People */
.oo-staff { position: sticky; top: 16px; max-height: calc(100vh - 32px); display: flex; flex-direction: column; padding: 0; overflow: hidden; border-radius: 14px; }
/* One column: the list sits above the form and scrolls away with the page (must come after the rule above). */
@media (max-width: 1000px) { .oo-staff { position: static; max-height: 420px; } }
.oo-staff-top { padding: 14px 14px 12px; }
.oo-staff-top .input { width: 100%; height: 44px; font-size: 15px; }
.oo-filters { display: flex; gap: 6px; margin-top: 10px; flex-wrap: wrap; }
.oo-chip { border: 1px solid var(--border); background: var(--surface); color: var(--text-2); font: inherit; font-size: 12px; font-weight: 600; padding: 6px 12px; border-radius: 999px; cursor: pointer; }
.oo-chip:hover { border-color: var(--accent); color: var(--accent); }
.oo-chip.on { background: var(--accent); border-color: var(--accent); color: #fff; }   /* 25 Nov 2026 (Khairul): theme colour, not black */
.oo-list { list-style: none; margin: 0; padding: 0; overflow-y: auto; flex: 1; border-top: 1px solid var(--line); }
.oo-row { display: flex; align-items: center; gap: 12px; width: 100%; padding: 10px 14px; border: 0; border-bottom: 1px solid var(--line); background: none; font: inherit; color: var(--text); text-align: left; cursor: pointer; }
.oo-row:hover { background: #F7F8FA; }
.oo-row.on { background: var(--accent-soft); box-shadow: inset 3px 0 0 var(--accent); }
.oo-av { flex: none; width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; font-size: 12px; font-weight: 700; background: var(--chip); color: var(--text-2); }
.oo-row.on .oo-av { background: var(--accent); color: #fff; }
.oo-av.big { width: 56px; height: 56px; font-size: 19px; background: var(--accent-soft); color: var(--accent); }
.oo-who { flex: 1; min-width: 0; display: grid; }
.oo-who b { font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oo-who small { font-size: 12px; color: var(--text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oo-side { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
.oo-n { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px; font-variant-numeric: tabular-nums; }
.oo-n.green { background: #e3f6ea; color: #15803d; }
.oo-n.amber { background: #fff4dc; color: #8a5300; }
.oo-n.grey { background: var(--chip); color: var(--text-2); }
.oo-saved { font-size: 11px; font-weight: 600; color: #15803d; white-space: nowrap; }
.oo-key { margin: 0; padding: 10px 16px 12px; font-size: 11px; border-top: 1px solid var(--line); }
.oo-empty { padding: 18px; text-align: center; }

/* Right side */
.oo-right { display: grid; gap: 16px; min-width: 0; }
.oo-right > .card, .oo-pair > .card { margin: 0; border-radius: 14px; padding: 20px 22px; }
.oo-head { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px; }
.oo-title { display: flex; align-items: center; gap: 14px; min-width: 0; }
.oo-title h2 { margin: 0; font-size: 21px; font-weight: 700; }
.oo-badges { display: flex; gap: 8px; margin-top: 6px; flex-wrap: wrap; }
.oo-badge { font-size: 12px; font-weight: 600; padding: 3px 10px; border-radius: 999px; background: var(--chip); color: var(--text-2); }
.oo-badge.amber { background: #fff4dc; color: #8a5300; }
.oo-badge.green { background: #e3f6ea; color: #15803d; }
.oo-badge.accent { background: var(--accent-soft); color: var(--accent); }
.oo-acts { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.oo-acts .btn { height: 40px; }
.oo-acts a.disabled { pointer-events: none; opacity: .5; }
.oo-save { padding: 0 22px; }
.oo-status { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; margin-right: 4px; white-space: nowrap; }
.oo-status i { width: 8px; height: 8px; border-radius: 50%; background: currentColor; }
.oo-status.green { color: #15803d; }
.oo-status.amber { color: #8a5300; }
.oo-status.amber i { background: #d97706; }
.oo-status.grey { color: var(--text-2); }
.oo-facts { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-top: 18px; }
@media (max-width: 760px) { .oo-facts { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.oo-facts > div { display: grid; gap: 4px; min-width: 0; background: #F7F8FA; border-radius: 10px; padding: 12px 14px; }
.oo-facts b { font-size: 15px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oo-facts b.muted { font-size: 13px; font-weight: 500; color: var(--muted); }
.oo-lbl { font-size: 11px; font-weight: 600; color: var(--text-2); }
.oo-from { font-size: 13px; color: var(--text-2); }
.oo-from .link { font-size: 13px; padding: 0; }
.oo-editbox { margin-top: 14px; }
.oo-src { margin: 10px 0 0; }
.oo-src .link { margin-left: 6px; font-size: 12px; }

/* Session and Leave: the same size */
.oo-pair { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
@media (max-width: 1250px) { .oo-pair { grid-template-columns: minmax(0, 1fr); } }
.oo-h3 { margin: 0 0 14px; font-size: 16px; font-weight: 700; }
.oo-h3row { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
.oo-leave { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; }
.oo-leave-lbl { display: block; text-align: center; font-size: 12px; font-weight: 600; color: var(--text-2); margin-bottom: 6px; }
.oo-leave .input { width: 100%; height: 52px; font-size: 20px; font-weight: 600; text-align: center; padding: 0 4px; }
.oo-leave-total { height: 52px; border-radius: 10px; background: var(--accent-soft); color: var(--accent); font-size: 22px; font-weight: 700; display: grid; place-items: center; font-variant-numeric: tabular-nums; }
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

/* Cards that open with Show */
.oo-fold { display: flex; width: 100%; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; border: 0; background: none; padding: 0; font: inherit; color: var(--text); text-align: left; cursor: pointer; }
.oo-fold-title { display: block; font-size: 16px; font-weight: 700; }
.oo-fold-sub { display: block; font-size: 13px; color: var(--text-2); margin-top: 4px; }
.oo-fold-right { display: flex; align-items: center; gap: 16px; }
.oo-big { display: grid; text-align: right; }
.oo-big b { font-size: 34px; font-weight: 700; color: var(--accent); line-height: 1; font-variant-numeric: tabular-nums; }
.oo-big small { font-size: 11px; font-weight: 600; color: var(--text-2); margin-top: 4px; }
.oo-showbtn { height: 36px; padding: 0 14px; border: 1px solid var(--border); border-radius: 10px; font-size: 13px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.oo-fold:hover .oo-showbtn { border-color: var(--accent); color: var(--accent); }
.oo-chev { display: inline-block; transition: transform .15s; }
.oo-chev.up { transform: rotate(180deg); }
.oo-fold-body { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--line); }
.oo-coh { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 32px; row-gap: 9px; }
@media (max-width: 760px) { .oo-coh { grid-template-columns: minmax(0, 1fr); } }
.oo-bar-row { display: flex; align-items: center; gap: 10px; min-width: 0; }
.oo-bar-name { flex: 0 0 170px; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oo-bar { flex: 1; height: 8px; border-radius: 999px; background: var(--chip); overflow: hidden; }
.oo-bar span { display: block; height: 100%; border-radius: 999px; background: var(--accent); }
.oo-bar span.low { background: #d97706; }
.oo-bar-mark { flex: 0 0 30px; text-align: right; font-size: 13px; font-variant-numeric: tabular-nums; }

/* Write-in boxes */
.oo-write { display: grid; gap: 22px; }
.oo-write .field { margin: 0; }
.oo-write textarea.input { height: auto; min-height: 84px; padding: 10px 12px; resize: vertical; line-height: 1.5; }
.oo-kicker { font-size: 12px; font-weight: 700; color: var(--accent); letter-spacing: .05em; text-transform: uppercase; margin-bottom: 10px; }
.oo-two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.oo-three { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
@media (max-width: 1100px) { .oo-three { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 760px) { .oo-two { grid-template-columns: minmax(0, 1fr); } }
.oo-box { border: 1px solid var(--line); border-radius: 12px; padding: 14px; display: grid; gap: 10px; align-content: start; }
.oo-box > b { font-size: 14px; }
.oo-box-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
.oo-box-head b { font-size: 14px; }
.oo-rate { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 600; color: var(--text-2); }
.oo-rate .input { width: 64px; height: 36px; text-align: center; font-weight: 700; padding: 0 4px; }
.oo-hint { font-size: 12px; color: var(--text-2); margin-top: -6px; }
.oo-pair-in { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.oo-mid { text-align: center; font-weight: 700; }
.oo-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
.oo-pill { height: 38px; padding: 0 14px; border-radius: 999px; border: 1px solid var(--border); background: var(--surface); color: var(--text-2); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
.oo-pill:hover { border-color: var(--accent); }
.oo-pill.on { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); }
.oo-other { width: 200px; height: 38px; }
.oo-actions + .oo-two { margin-bottom: 12px; }

/* Preview */
.oo-preview { background: var(--chip); border-radius: 12px; padding: 12px; margin: 0 0 10px; }
.oo-preview iframe { display: block; width: 100%; height: 760px; border: 0; background: #fff; border-radius: 6px; }

/* Unsaved-changes question */
.oo-ask { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.oo-ask-btns { display: flex; gap: 8px; }
</style>