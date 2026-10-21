<template>
  <main class="content">
    <div class="notice ok" v-show="okMsg">{{ okMsg }}</div>

    <!-- ===== Ticket list ===== -->
    <template v-if="!ticket">
      <div>
        <div class="page-head">
          <div>
            <h1>Issues <span class="sample-tag">sample</span></h1>
            <div class="sub">Raise a ticket for anything at a unit or in the office. You only see tickets tagged to your role, tickets you raised, and Directors see all.</div>
          </div>
          <button class="btn btn-primary" @click="openRaise()">+ Raise a ticket</button>
        </div>

        <div class="kpis k3">
          <div class="card kpi"><div class="label">Open</div><div class="value">{{ count('open') }}</div><div class="hint">{{ needReply() + ' need a reply from your role' }}</div></div>
          <div class="card kpi"><div class="label">In progress</div><div class="value">{{ count('progress') }}</div><div class="hint">Being worked on by a tagged team</div></div>
          <div class="card kpi"><div class="label">Completed this month</div><div class="value">{{ completedThisMonth() }}</div><div class="hint">Locked and archived</div></div>
        </div>

        <div class="iss-tools">
          <input class="input" type="search" placeholder="Search ticket no., title or unit" v-model="search" aria-label="Search tickets">
          <div class="pills brand">
            <template v-for="f in FILTERS" :key="f.key">
              <button class="pill-btn" :class="filter === f.key && 'on'" @click="filter = f.key">{{ f.label }}</button>
            </template>
          </div>
          <select class="select" v-model="unitFilter" aria-label="Filter by unit">
            <option value="">All units</option>
            <template v-for="un in unitList()" :key="un"><option :value="un">{{ un }}</option></template>
          </select>
        </div>

        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Ticket no.</th><th>Title</th><th>Unit</th><th>Tags</th><th>Raised by</th><th>Raised on</th><th>Status</th><th class="cnt" title="Comments">💬</th><th class="cnt" title="Attachments">📎</th></tr></thead>
            <tbody>
              <template v-for="t in shown()" :key="t.id">
                <tr class="clickable" @click="open(t.id)">
                  <td class="nw">{{ t.id }}</td>
                  <td class="t-title">{{ t.title }}</td>
                  <td class="nw">{{ t.unit || '—' }}</td>
                  <td class="nw"><template v-for="g in t.tags" :key="g"><span class="tag">{{ g }}</span></template></td>
                  <td>{{ t.raisedBy }}</td>
                  <td class="nw">{{ day(t.raisedAt) }}</td>
                  <td class="nw"><span class="pill" :class="STATUS[t.status].cls">{{ STATUS[t.status].label }}</span></td>
                  <td class="cnt">{{ t.comments.length }}</td>
                  <td class="cnt">{{ fileCount(t) }}</td>
                </tr>
              </template>
              <tr v-show="!shown().length"><td colspan="9" class="muted">No tickets match.</td></tr>
            </tbody>
          </table>
        </div>
        <p class="help" style="margin-top:12px">Completed tickets are locked: no new comments or tag changes. They stay searchable under Completed.
          <span>{{ `You can see ${visible().length} of ${tickets.length} tickets.` }}</span>
          Sample tickets are kept in this browser only; saving to Firebase and files to the company Google Drive come later.</p>
      </div>
    </template>

    <!-- ===== Ticket page ===== -->
    <template v-if="ticket">
      <div>
        <div class="page-head">
          <div>
            <h1>{{ ticket.id + ' · ' + ticket.title }}</h1>
            <div class="sub">{{ (ticket.property || 'Office') + (ticket.unit ? ' · ' + ticket.unit : '') + ' · Raised by ' + ticket.raisedBy + ' on ' + stamp(ticket.raisedAt) }}</div>
          </div>
          <div class="head-tools">
            <button class="btn" @click="back()">← All tickets</button>
            <button class="btn" v-show="ticket.status === 'open' && canUpdate()" @click="setProgress()">Mark in progress</button>
            <button class="btn btn-primary" v-show="ticket.status !== 'done' && canUpdate()" @click="confirmDone = true">Mark completed</button>
          </div>
        </div>

        <div class="side-grid">
          <div class="thread">
            <div class="post orig">
              <div class="post-head"><span class="avatar"></span><b>{{ ticket.raisedBy }}</b><span class="when">{{ stamp(ticket.raisedAt) }}</span><span class="tag">Original issue</span></div>
              <p>{{ ticket.body }}</p>
              <div class="files" v-show="ticket.files.length"><template v-for="fn in ticket.files" :key="fn"><span class="file-chip">{{ icon(fn) + ' ' + fn }}</span></template></div>
            </div>
            <template v-for="c in ticket.comments" :key="c.at + c.by">
              <div class="post">
                <div class="post-head"><span class="avatar"></span><b>{{ c.by }}</b><span class="when">{{ stamp(c.at) }}</span></div>
                <p>{{ c.text }}</p>
                <div class="files" v-show="c.files.length"><template v-for="fn in c.files" :key="fn"><span class="file-chip">{{ icon(fn) + ' ' + fn }}</span></template></div>
              </div>
            </template>

            <div class="post composer" v-show="ticket.status !== 'done'">
              <textarea class="input" placeholder="Write a comment..." v-model="draft.text" aria-label="Comment"></textarea>
              <div class="files" v-show="draft.files.length"><template v-for="(fn, i) in draft.files" :key="fn + i"><span class="file-chip"><span>{{ icon(fn) + ' ' + fn }}</span><button @click="draft.files.splice(i, 1)" aria-label="Remove">×</button></span></template></div>
              <div class="composer-row">
                <label class="btn" style="cursor:pointer">📎 Attach<input type="file" multiple hidden @change="addFiles($event, draft.files)"></label>
                <span class="help">Images, PDF, Word, Excel or PowerPoint, up to 20 MB each</span>
                <button class="btn btn-primary" @click="postComment()" :disabled="!draft.text.trim() && !draft.files.length">Post comment</button>
              </div>
            </div>
            <div class="locked" v-show="ticket.status === 'done'">{{ 'Completed on ' + stamp(ticket.doneAt) + ' by ' + ticket.doneBy + '. This ticket is locked: no edits, tag changes, comments or attachments.' }}</div>
          </div>

          <div class="stack" style="gap:16px">
            <div class="card">
              <div class="card-head"><h2>Details</h2></div>
              <div class="kv"><span>Status</span><span><span class="pill" :class="STATUS[ticket.status].cls">{{ STATUS[ticket.status].label }}</span></span></div>
              <div class="kv"><span>Property</span><span>{{ ticket.property || '—' }}</span></div>
              <div class="kv"><span>Unit</span><span>{{ ticket.unit || '—' }}</span></div>
              <div class="kv"><span>Raised by</span><span>{{ ticket.raisedBy }}</span></div>
              <div class="kv"><span>Raised on</span><span>{{ day(ticket.raisedAt) }}</span></div>
              <div class="kv"><span>Tagged</span><span><template v-for="g in ticket.tags" :key="g"><span class="tag">{{ g }}</span></template></span></div>
              <button class="btn" style="width:100%;margin-top:8px" v-show="ticket.status !== 'done' && canUpdate()" @click="openTags()">Edit tags (reason needed)</button>
              <div class="side-note">Who can see this: roles tagged above, the person who raised it, and Directors.</div>
            </div>
            <div class="card">
              <div class="card-head"><h2>Audit log</h2></div>
              <div class="audit-list">
                <template v-for="a in ticket.audit" :key="a.at + a.text">
                  <div><div class="when">{{ stamp(a.at) }}</div><div>{{ a.text }}</div></div>
                </template>
              </div>
            </div>
            <div class="help">Mark completed locks the ticket and moves it to Completed. Nobody can comment or change tags after that.</div>
          </div>
        </div>
      </div>
    </template>

    <!-- Raise a ticket -->
    <div class="modal-back" v-show="raise" @click.self="raise = null" v-esc="() => { raise = null }">
      <template v-if="raise">
        <form class="modal" role="dialog" aria-label="Raise a ticket" @submit.prevent="saveRaise()">
          <h2>Raise a ticket</h2>
          <div class="notice error" v-show="raise.error">{{ raise.error }}</div>
          <div class="field"><label for="rTitle">Title</label><input class="input" id="rTitle" ref="rTitle" v-model="raise.title" placeholder="e.g. Aircond leaking in master bedroom"></div>
          <div class="field"><label for="rUnit">Unit (optional)</label>
            <input class="input" id="rUnit" list="unitOpts" v-model="raise.unit" placeholder="Choose a unit · leave blank for office issues">
            <datalist id="unitOpts"><template v-for="un in UNITS" :key="un"><option :value="un"></option></template></datalist></div>
          <div class="field"><label for="rBody">What happened</label><textarea class="input" id="rBody" style="height:96px" v-model="raise.body" placeholder="Describe the issue, when it started and what you have tried"></textarea></div>
          <div class="field" style="margin-bottom:8px"><label>Tag the roles who should handle it</label>
            <div class="checks"><template v-for="g in TAGS" :key="g"><label><input type="checkbox" :value="g" v-model="raise.tags"><span>{{ g }}</span></label></template></div>
            <div class="help">Only tagged roles, you and Directors will see this ticket.</div></div>
          <label class="filedrop"><b>Drop files here or click to choose</b>Images, PDF, Word, Excel, PowerPoint · up to 20 MB each
            <input type="file" multiple hidden @change="addFiles($event, raise.files)"></label>
          <div class="files" v-show="raise.files.length"><template v-for="(fn, i) in raise.files" :key="fn + i"><span class="file-chip"><span>{{ icon(fn) + ' ' + fn }}</span><button type="button" @click="raise.files.splice(i, 1)" aria-label="Remove">×</button></span></template></div>
          <div class="modal-foot"><button type="button" class="btn" @click="raise = null">Cancel</button><button class="btn btn-primary">Raise ticket</button></div>
        </form>
      </template>
    </div>

    <!-- Edit tags -->
    <div class="modal-back" v-show="tagEdit" @click.self="tagEdit = null" v-esc="() => { tagEdit = null }">
      <template v-if="tagEdit">
        <form class="modal" role="dialog" aria-label="Edit tags" @submit.prevent="saveTags()" style="max-width:460px">
          <h2>Edit tags</h2>
          <div class="notice error" v-show="tagEdit.error">{{ tagEdit.error }}</div>
          <div class="checks" style="margin-bottom:14px"><template v-for="g in TAGS" :key="g"><label><input type="checkbox" :value="g" v-model="tagEdit.tags"><span>{{ g }}</span></label></template></div>
          <div class="field"><label for="tWhy">Reason</label><input class="input" id="tWhy" v-model="tagEdit.reason" placeholder="e.g. Not an IT issue"></div>
          <div class="help">Removing your own role's tag may hide the ticket from your team.</div>
          <div class="modal-foot"><button type="button" class="btn" @click="tagEdit = null">Cancel</button><button class="btn btn-primary">Save tags</button></div>
        </form>
      </template>
    </div>

    <!-- Confirm complete -->
    <div class="modal-back" v-show="confirmDone" @click.self="confirmDone = false">
      <div class="modal" role="dialog" aria-label="Mark completed" style="max-width:440px">
        <h2>Mark this ticket completed?</h2>
        <p class="help" style="font-size:13px">It will be locked and archived. Nobody can comment, attach files or change tags after this.</p>
        <div class="modal-foot"><button class="btn" @click="confirmDone = false">Cancel</button><button class="btn btn-primary" @click="complete()">Mark completed</button></div>
      </div>
    </div>
  </main>
</template>

<script>
import { ROLE_LABEL } from '@/lib/firebase.js';
import { useSession } from '@/stores/session.js';

const me = useSession();
const myRole = ROLE_LABEL[me.role] || me.role;          // 'Finance', 'Director'
const isDirector = me.role === 'director';
const myLabel = isDirector ? 'Director' : `${myRole} user`;

const KEY = 'wb.issues.v1';
const TAGS = ['IT', 'Admin', 'HR', 'Finance', 'Operations'];
const UNITS = ['DM 07-10', 'DM 07-12', 'DM 07-19', 'DM 12-03', 'DM 13-01', 'DM 14-02', 'DM 16-02', 'DM 19-05'];
const STATUS = { open: { label: 'Open', cls: 'amber' }, progress: { label: 'In progress', cls: 'blue' }, done: { label: 'Completed', cls: 'green' } };
const FILTERS = [{ key: 'all', label: 'All' }, { key: 'open', label: 'Open' }, { key: 'progress', label: 'In progress' },
  { key: 'done', label: 'Completed' }, { key: 'mine', label: 'Tagged to my role' }, { key: 'raised', label: 'Raised by me' }];

const at = (d, t) => `2026-10-${d}T${t}:00`;
// Placeholder roles only, no real names.
const SAMPLE = [
  { id: 'CI-0042', title: 'Aircond leaking in master bedroom', property: "D'Majestic", unit: 'DM 14-02', tags: ['Admin', 'Finance'], raisedBy: 'Operations', raisedRole: 'Operations', raisedAt: at(15, '10:12'), status: 'open',
    body: 'Guest reported water dripping from the aircond in the master bedroom onto the floor. Towels placed underneath. Guest checks out 17 Oct.', files: ['aircond_drip.jpg', 'floor.jpg'],
    comments: [{ by: 'Admin', at: at(15, '11:05'), text: 'Vendor booked for 16 Oct, 2pm. Operations please let the guest know.', files: [] },
      { by: 'Operations', at: at(15, '11:20'), text: 'Guest informed, OK with the time.', files: [] },
      { by: 'Admin', at: at(16, '15:40'), text: 'Drain pipe cleared. Vendor quote attached for Finance (to go on the October statement as an expense).', files: ['vendor_quote.pdf', 'parts_list.xlsx'] }],
    audit: [{ at: at(15, '10:12'), text: 'Operations raised the ticket, tagged Admin, IT' }, { at: at(15, '11:05'), text: 'Admin commented' },
      { at: at(16, '09:30'), text: 'Admin removed tag IT · reason: "Not an IT issue"' }, { at: at(16, '15:40'), text: 'Admin added tag Finance · reason: "Quote for the statement"' }] },
  { id: 'CI-0041', title: 'Smart lock not accepting new passcode', property: "D'Majestic", unit: 'DM 07-19', tags: ['IT', 'Admin'], raisedBy: 'Operations', raisedRole: 'Operations', raisedAt: at(14, '09:40'), status: 'progress', body: 'New passcode set after rent was paid, the lock still rejects it.', files: ['lock_screen.jpg'],
    comments: [1, 2, 3, 4, 5].map(i => ({ by: i % 2 ? 'IT' : 'Operations', at: at(14, `1${i}:00`), text: i % 2 ? 'Checking the lock app.' : 'Tenant waiting downstairs.', files: [] })), audit: [{ at: at(14, '09:40'), text: 'Operations raised the ticket, tagged IT, Admin' }] },
  { id: 'CI-0040', title: 'Guest left item, asking for courier', property: "D'Majestic", unit: 'DM 07-10', tags: ['Admin'], raisedBy: 'Housekeeping', raisedRole: 'Housekeeping', raisedAt: at(13, '16:05'), status: 'open', body: 'Found a jacket in the wardrobe after check-out. Guest wants it couriered.', files: ['jacket.jpg'],
    comments: [{ by: 'Admin', at: at(13, '17:00'), text: 'Asked the guest for an address.', files: [] }], audit: [{ at: at(13, '16:05'), text: 'Housekeeping raised the ticket, tagged Admin' }] },
  { id: 'CI-0039', title: 'Wi-Fi password card missing', property: "D'Majestic", unit: 'DM 19-05', tags: ['IT'], raisedBy: 'Operations', raisedRole: 'Operations', raisedAt: at(12, '12:30'), status: 'progress', body: 'The Wi-Fi card on the fridge is gone.', files: [],
    comments: [{ by: 'IT', at: at(12, '13:00'), text: 'Printing a new card.', files: [] }, { by: 'Operations', at: at(12, '15:00'), text: 'Thanks.', files: [] }], audit: [{ at: at(12, '12:30'), text: 'Operations raised the ticket, tagged IT' }] },
  { id: 'CI-0038', title: 'Payroll login not working', property: '', unit: '', tags: ['HR', 'IT'], raisedBy: 'Finance user', raisedRole: 'Finance', raisedAt: at(11, '09:15'), status: 'open', body: 'The payroll site says my password expired and the reset email never arrives.', files: [],
    comments: [], audit: [{ at: at(11, '09:15'), text: 'Finance user raised the ticket, tagged HR, IT' }] },
  { id: 'CI-0037', title: 'Water heater replaced', property: "D'Majestic", unit: 'DM 16-02', tags: ['Admin', 'Finance'], raisedBy: 'Operations', raisedRole: 'Operations', raisedAt: at('02', '10:00'), status: 'done', doneAt: at('09', '17:20'), doneBy: 'Admin',
    body: 'Water heater stopped working, tenant has no hot water.', files: ['heater.jpg', 'invoice.pdf', 'warranty.pdf'],
    comments: [1, 2, 3, 4, 5, 6].map(i => ({ by: i % 2 ? 'Admin' : 'Finance user', at: at('0' + (2 + Math.ceil(i / 2)), `1${i}:00`), text: i % 2 ? 'Vendor update.' : 'Noted for the statement.', files: [] })),
    audit: [{ at: at('02', '10:00'), text: 'Operations raised the ticket, tagged Admin, Finance' }, { at: at('09', '17:20'), text: 'Admin marked the ticket completed' }] },
  { id: 'CI-0036', title: 'Owner asking why September payout is lower', property: "D'Majestic", unit: 'DM 13-01', tags: ['Finance'], raisedBy: 'Operations', raisedRole: 'Operations', raisedAt: at('01', '11:30'), status: 'progress', body: 'Owner called about the September statement. Negative balance carried forward from a repair?', files: [],
    comments: [{ by: 'Finance user', at: at('01', '14:00'), text: 'Yes, the repair was larger than the month income. Sending the statement PDF.', files: [] }], audit: [{ at: at('01', '11:30'), text: 'Operations raised the ticket, tagged Finance' }] }
];

function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (Array.isArray(s) && s.length) return s; } catch {}
  return structuredClone(SAMPLE);
}
const pad = n => String(n).padStart(2, '0');
const nowIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`; };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default {
  data() {
    return {
      TAGS, UNITS, STATUS, FILTERS,
      tickets: load(), ticket: null, search: '', filter: 'all', unitFilter: '', okMsg: '',
      raise: null, tagEdit: null, confirmDone: false, draft: { text: '', files: [] }
    };
  },
  // ?id= opens a ticket. Opening one or going back changes the address, which remounts the page
  // (Back/Forward included); a message for the next screen travels in history.state.
  mounted() {
    this.route();
  },
  methods: {
    route() {
      const id = this.$route.query.id;
      const t = id && this.visible().find(x => x.id === id);
      this.ticket = t || null;
      this.draft = { text: '', files: [] };
      this.okMsg = (!id || t) && history.state?.okMsg || '';
    },
    persist() { try { localStorage.setItem(KEY, JSON.stringify(this.tickets)); } catch {} },
    open(id) { this.$router.push({ query: { id } }); },
    back() { this.$router.push({ query: {}, state: { okMsg: this.okMsg } }); },

    // Visibility: tagged to my role, raised by me, or Director (sees all)
    raisedByMe(t) { return t.raisedRole === myRole || t.raisedBy === myLabel || t.raisedUid === me.user.uid; },
    visible() { return this.tickets.filter(t => isDirector || t.tags.includes(myRole) || this.raisedByMe(t)); },
    canUpdate() { const t = this.ticket; return t && t.status !== 'done' && (isDirector || t.tags.includes(myRole)); },
    count(s) { return this.visible().filter(t => t.status === s).length; },
    needReply() { return this.visible().filter(t => t.status === 'open' && (isDirector || t.tags.includes(myRole)) && (t.comments.at(-1)?.by || t.raisedBy) !== myLabel).length; },
    completedThisMonth() { const ym = nowIso().slice(0, 7); return this.visible().filter(t => t.status === 'done' && (t.doneAt || '').slice(0, 7) === ym).length; },
    unitList() { return [...new Set(this.visible().map(t => t.unit).filter(Boolean))].sort(); },
    shown() {
      const q = this.search.trim().toLowerCase();
      return this.visible().filter(t => {
        if (['open', 'progress', 'done'].includes(this.filter) && t.status !== this.filter) return false;
        if (this.filter === 'mine' && !t.tags.includes(myRole)) return false;
        if (this.filter === 'raised' && !this.raisedByMe(t)) return false;
        if (this.unitFilter && t.unit !== this.unitFilter) return false;
        return !q || [t.id, t.title, t.unit].some(v => (v || '').toLowerCase().includes(q));
      }).sort((a, b) => b.id.localeCompare(a.id));
    },
    fileCount(t) { return t.files.length + t.comments.reduce((n, c) => n + c.files.length, 0); },
    day(iso) { return iso ? `${+iso.slice(8, 10)} ${MON[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}` : ''; },
    stamp(iso) { return iso ? `${this.day(iso)}, ${iso.slice(11, 16)}` : ''; },
    icon(fn) { return /\.(jpe?g|png|gif|webp|heic)$/i.test(fn) ? '🖼' : /\.(xlsx?|csv)$/i.test(fn) ? '📊' : '📄'; },
    addFiles(e, list) {
      for (const f of e.target.files) { if (f.size > 20 * 1024 * 1024) { this.okMsg = `${f.name} is over 20 MB, not added.`; continue; } list.push(f.name); }
      e.target.value = '';
    },
    log(t, text) { t.audit.push({ at: nowIso(), text }); },

    openRaise() { this.raise = { title: '', unit: '', body: '', tags: [], files: [], error: '' }; this.$nextTick(() => this.$refs.rTitle?.focus()); },
    saveRaise() {
      const r = this.raise;
      if (!r.title.trim()) return r.error = 'Give the ticket a title.';
      if (!r.body.trim()) return r.error = 'Describe what happened.';
      if (!r.tags.length) return r.error = 'Tag at least one role to handle it.';
      const n = Math.max(0, ...this.tickets.map(t => +t.id.slice(3))) + 1;
      const id = 'CI-' + String(n).padStart(4, '0'), when = nowIso();
      const t = { id, title: r.title.trim(), property: r.unit.trim() ? "D'Majestic" : '', unit: r.unit.trim().toUpperCase(), tags: [...r.tags], raisedBy: myLabel, raisedRole: myRole, raisedUid: me.user.uid,
        raisedAt: when, status: 'open', body: r.body.trim(), files: [...r.files], comments: [], audit: [] };
      this.log(t, `${myLabel} raised the ticket, tagged ${t.tags.join(', ')}` + (t.files.length ? ` · ${t.files.length} attachment${t.files.length > 1 ? 's' : ''}` : ''));
      this.tickets.push(t); this.persist();
      this.raise = null; this.okMsg = `${id} raised and tagged ${t.tags.join(', ')}.`;
    },
    postComment() {
      const t = this.ticket; if (t.status === 'done') return;
      const text = this.draft.text.trim(), files = [...this.draft.files];
      t.comments.push({ by: myLabel, at: nowIso(), text, files });
      this.log(t, `${myLabel} commented` + (files.length ? ` and added ${files.length} attachment${files.length > 1 ? 's' : ''}` : ''));
      this.draft = { text: '', files: [] }; this.persist();
    },
    setProgress() { const t = this.ticket; t.status = 'progress'; this.log(t, `${myLabel} marked it in progress`); this.persist(); },
    openTags() { this.tagEdit = { tags: [...this.ticket.tags], reason: '', error: '' }; },
    saveTags() {
      const e = this.tagEdit, t = this.ticket;
      if (!e.tags.length) return e.error = 'Keep at least one role tagged.';
      const added = e.tags.filter(g => !t.tags.includes(g)), removed = t.tags.filter(g => !e.tags.includes(g));
      if (!added.length && !removed.length) return this.tagEdit = null;
      if (!e.reason.trim()) return e.error = 'Give a reason for the tag change.';
      const why = ` · reason: "${e.reason.trim()}"`;
      added.forEach(g => this.log(t, `${myLabel} added tag ${g}${why}`));
      removed.forEach(g => this.log(t, `${myLabel} removed tag ${g}${why}`));
      t.tags = TAGS.filter(g => e.tags.includes(g)); this.persist(); this.tagEdit = null;
      if (!isDirector && !t.tags.includes(myRole) && !this.raisedByMe(t)) { this.okMsg = `${t.id} is no longer tagged to ${myRole}, so it has left your list.`; this.back(); }
    },
    complete() {
      const t = this.ticket; t.status = 'done'; t.doneAt = nowIso(); t.doneBy = myLabel;
      this.log(t, `${myLabel} marked the ticket completed`); this.persist(); this.confirmDone = false;
    }
  }
};
</script>

<style scoped>
    .kpis.k3 { grid-template-columns: repeat(3, minmax(0,1fr)); }
    .iss-tools { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-bottom: 16px; }
    .iss-tools .input { max-width: 224px; height: 34px; }
    .table td.cnt, .table th.cnt { text-align: right; width: 56px; color: var(--text-2); }
    .t-title { font-weight: 500; min-width: 200px; }
    .table td.nw { white-space: nowrap; }
    .table td .tag { white-space: nowrap; }
    .kv .tag { color: var(--accent); }   /* the old page's <template> kept the first tag from matching .kv span:first-child */
    .post { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px 16px 14px; }
    .post.orig { border-color: var(--accent); }
    .post-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; font-size: 13px; }
    .avatar { width: 24px; height: 24px; border-radius: 50%; background: var(--chip); flex: none; }
    .post.orig .avatar { background: var(--accent-soft); }
    .post-head .when { color: var(--muted); font-size: 12px; }
    .post p { margin: 0; font-size: 13px; white-space: pre-wrap; overflow-wrap: anywhere; }
    .files { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
    .file-chip { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--border); border-radius: 6px; padding: 4px 8px; font-size: 12px; background: var(--surface); }
    .file-chip button { border: 0; background: none; color: var(--muted); padding: 0 0 0 2px; }
    .thread { display: grid; gap: 12px; }
    .composer textarea { height: 64px; }
    .composer-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 10px; }
    .composer-row .help { flex: 1; min-width: 160px; }
    .audit-list { display: grid; gap: 10px; font-size: 12px; }
    .audit-list .when { color: var(--muted); font-size: 11px; }
    .checks { display: flex; gap: 16px; flex-wrap: wrap; margin: 6px 0 4px; font-size: 13px; }
    .checks label { display: inline-flex; align-items: center; gap: 6px; }
    .checks input { width: 16px; height: 16px; accent-color: var(--accent); }
    .locked { background: var(--chip); border-radius: 10px; padding: 12px 14px; font-size: 12px; color: var(--text-2); }
    .side-note { color: var(--muted); font-size: 11px; margin-top: 10px; }
    .modal .field { margin-bottom: 12px; }
    @media (max-width: 860px) { .kpis.k3 { grid-template-columns: minmax(0,1fr); } }
</style>
