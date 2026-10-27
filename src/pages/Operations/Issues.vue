<template>
  <main class="content">
    <div class="loading-bar" v-show="loading || busy"></div>
    <div class="notice ok" v-show="okMsg">{{ okMsg }}</div>
    <div class="notice error" v-show="error">{{ error }}</div>

    <!-- ===== Ticket list ===== -->
    <template v-if="!ticket">
      <div>
        <div class="page-head">
          <div>
            <h1>Issues</h1>
            <div class="sub">Raise a ticket for anything at a unit or in the office. You only see tickets tagged to your role, tickets you raised, and Directors see all.</div>
          </div>
          <button class="btn btn-primary" v-if="canRaise" @click="openRaise()">+ Raise a ticket</button>
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
            <thead><tr><th>Ticket no.</th><th>Title</th><th>Unit</th><th>Tags</th><th>Raised by</th><th>Raised on</th><th>Status</th><th class="cnt" title="Comments">💬</th><th class="cnt" title="Drive links">🔗</th></tr></thead>
            <tbody>
              <template v-for="t in shown()" :key="t.id">
                <tr class="clickable" @click="open(t.id)">
                  <td class="nw">{{ t.id }}</td>
                  <td class="t-title">{{ t.title }}</td>
                  <td class="nw">{{ t.unit || '—' }}</td>
                  <td class="nw"><template v-for="g in t.tags" :key="g"><span class="tag">{{ g }}</span></template></td>
                  <td><span class="who"><Avatar :uid="t.raisedByUid" :name="t.raisedBy" :role="t.raisedRole" :size="20" />{{ t.raisedBy }}<span class="tag role-tint" :style="roleTint(t.raisedRole)" v-if="showRole(t.raisedBy, t.raisedRole)">{{ t.raisedRole }}</span></span></td>
                  <td class="nw">{{ day(t.raisedAt) }}</td>
                  <td class="nw"><span class="pill" :class="STATUS[t.status].cls">{{ STATUS[t.status].label }}</span></td>
                  <td class="cnt">{{ t.replyCount || 0 }}</td>
                  <td class="cnt">{{ t.linkCount || 0 }}</td>
                </tr>
              </template>
              <tr v-show="!loading && !shown().length"><td colspan="9" class="muted">No tickets match.</td></tr>
            </tbody>
          </table>
        </div>
        <p class="help" style="margin-top:12px">Completed tickets are locked: no new comments or tag changes. They stay searchable under Completed.
          <span>{{ `You can see ${visible().length} ticket${visible().length === 1 ? '' : 's'}.` }}</span>
          Files stay in the company Google Drive; tickets keep only the links.</p>
      </div>
    </template>

    <!-- ===== Ticket page ===== -->
    <template v-if="ticket">
      <div>
        <div class="page-head">
          <div>
            <h1>{{ ticket.id + ' · ' + ticket.title }}</h1>
            <div class="sub">{{ (ticket.property || 'Office') + (ticket.unit ? ' · ' + ticket.unit : '') + ' · Raised by ' + ticket.raisedBy + (showRole(ticket.raisedBy, ticket.raisedRole) ? ` (${ticket.raisedRole})` : '') + ' on ' + stamp(ticket.raisedAt) }}</div>
          </div>
          <div class="head-tools">
            <button class="btn" @click="back()">← All tickets</button>
            <button class="btn" v-show="ticket.status === 'open' && canUpdate()" @click="setProgress()" :disabled="busy">Mark in progress</button>
            <button class="btn btn-primary" v-show="ticket.status !== 'done' && canUpdate()" @click="confirmDone = true; doneError = ''">Mark completed</button>
          </div>
        </div>

        <div class="side-grid">
          <div class="thread">
            <div class="post orig">
              <div class="post-head"><Avatar :uid="ticket.raisedByUid" :name="ticket.raisedBy" :role="ticket.raisedRole" :size="24" /><b>{{ ticket.raisedBy }}</b><span class="tag role-tint" :style="roleTint(ticket.raisedRole)" v-if="showRole(ticket.raisedBy, ticket.raisedRole)">{{ ticket.raisedRole }}</span><span class="when">{{ stamp(ticket.raisedAt) }}</span><span class="tag">Original issue</span></div>
              <p>{{ ticket.body }}</p>
              <div class="files" v-show="ticket.links.length"><template v-for="l in ticket.links" :key="l.url"><a class="file-chip" :href="l.url" target="_blank" rel="noopener">{{ icon(l.name) + ' ' + l.name }}</a></template></div>
            </div>
            <template v-for="c in replies" :key="c.id">
              <div class="post">
                <div class="post-head"><Avatar :uid="c.byUid" :name="c.by" :role="c.byRole" :size="24" /><b>{{ c.by }}</b><span class="tag role-tint" :style="roleTint(c.byRole)" v-if="showRole(c.by, c.byRole)">{{ c.byRole }}</span><span class="when">{{ stamp(c.at) }}</span></div>
                <p>{{ c.text }}</p>
                <div class="files" v-show="c.links.length"><template v-for="l in c.links" :key="l.url"><a class="file-chip" :href="l.url" target="_blank" rel="noopener">{{ icon(l.name) + ' ' + l.name }}</a></template></div>
              </div>
            </template>

            <div class="post composer" v-show="ticket.status !== 'done' && canComment()">
              <textarea class="input" placeholder="Write a comment..." v-model="draft.text" aria-label="Comment"></textarea>
              <div class="files" v-show="draft.links.length"><template v-for="(l, i) in draft.links" :key="l.url + i"><span class="file-chip"><span>{{ icon(l.name) + ' ' + l.name }}</span><button @click="draft.links.splice(i, 1)" aria-label="Remove">×</button></span></template></div>
              <div class="link-add" v-show="draft.adding">
                <input class="input" v-model="draft.linkName" placeholder="Name, e.g. Vendor quote" aria-label="Link name">
                <input class="input" v-model="draft.linkUrl" placeholder="Paste the Google Drive link" aria-label="Google Drive link" @keydown.enter.prevent="addLink(draft)">
                <button class="btn" type="button" @click="addLink(draft)">Add</button>
              </div>
              <div class="notice error" v-show="draft.error">{{ draft.error }}</div>
              <div class="composer-row">
                <button class="btn" type="button" @click="draft.adding = !draft.adding">🔗 Add Drive link</button>
                <span class="help">Put the file in the company Google Drive and paste its link here</span>
                <button class="btn btn-primary" @click="postComment()" :disabled="busy || (!draft.text.trim() && !draft.links.length)">Post comment</button>
              </div>
            </div>
            <div class="locked" v-show="ticket.status === 'done'">{{ 'Completed on ' + stamp(ticket.doneAt) + ' by ' + ticket.doneBy + '. This ticket is locked: no edits, tag changes, comments or links.' }}</div>
            <div class="locked" v-show="ticket.status !== 'done' && !canComment()">View only. Your role can read this ticket but not comment on it.</div>
          </div>

          <div class="stack" style="gap:16px">
            <div class="card">
              <div class="card-head"><h2>Details</h2></div>
              <div class="kv"><span>Status</span><span><span class="pill" :class="STATUS[ticket.status].cls">{{ STATUS[ticket.status].label }}</span></span></div>
              <div class="kv"><span>Property</span><span>{{ ticket.property || '—' }}</span></div>
              <div class="kv"><span>Unit</span><span>{{ ticket.unit || '—' }}</span></div>
              <div class="kv"><span>Raised by</span><span class="who">{{ ticket.raisedBy }}<span class="tag role-tint" :style="roleTint(ticket.raisedRole)" v-if="showRole(ticket.raisedBy, ticket.raisedRole)">{{ ticket.raisedRole }}</span></span></div>
              <div class="kv"><span>Raised on</span><span>{{ day(ticket.raisedAt) }}</span></div>
              <div class="kv"><span>Tagged</span><span><template v-for="g in ticket.tags" :key="g"><span class="tag">{{ g }}</span></template></span></div>
              <button class="btn" style="width:100%;margin-top:8px" v-show="ticket.status !== 'done' && canUpdate()" @click="openTags()">Edit tags (reason needed)</button>
              <div class="side-note">Who can see this: roles tagged above, the person who raised it, and Directors.</div>
            </div>
            <div class="card">
              <div class="card-head"><h2>Audit log</h2></div>
              <div class="audit-list">
                <template v-for="a in ticket.audit" :key="a.at + a.text">
                  <div><div class="when">{{ stamp(a.at) }}</div><div v-if="a.by"><b>{{ a.by }}</b><span class="tag role-tint" :style="roleTint(a.role)" v-if="showRole(a.by, a.role)">{{ a.role }}</span> {{ a.text }}</div><div v-else>{{ a.text }}</div></div>
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
            <datalist id="unitOpts"><template v-for="un in units" :key="un.id"><option :value="un.unitCode"></option></template></datalist></div>
          <div class="field"><label for="rBody">What happened</label><textarea class="input" id="rBody" style="height:96px" v-model="raise.body" placeholder="Describe the issue, when it started and what you have tried"></textarea></div>
          <div class="field" style="margin-bottom:8px"><label>Tag the roles who should handle it</label>
            <div class="checks"><template v-for="g in TAGS" :key="g"><label><input type="checkbox" :value="g" v-model="raise.tags"><span>{{ g }}</span></label></template></div>
            <div class="help">Only tagged roles, you and Directors will see this ticket.</div></div>
          <div class="field" style="margin-bottom:6px"><label for="rLinkName">Add Drive link (optional)</label>
            <div class="link-add" style="margin-top:0">
              <input class="input" id="rLinkName" v-model="raise.linkName" placeholder="Name, e.g. Photo of the leak">
              <input class="input" v-model="raise.linkUrl" placeholder="Paste the Google Drive link" aria-label="Google Drive link" @keydown.enter.prevent="addLink(raise)">
              <button class="btn" type="button" @click="addLink(raise)">Add</button>
            </div>
            <div class="help">Files stay in the company Google Drive; the ticket keeps only the link.</div></div>
          <div class="files" v-show="raise.links.length"><template v-for="(l, i) in raise.links" :key="l.url + i"><span class="file-chip"><span>{{ icon(l.name) + ' ' + l.name }}</span><button type="button" @click="raise.links.splice(i, 1)" aria-label="Remove">×</button></span></template></div>
          <div class="modal-foot"><button type="button" class="btn" @click="raise = null">Cancel</button><button class="btn btn-primary" :disabled="busy">Raise ticket</button></div>
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
          <div class="modal-foot"><button type="button" class="btn" @click="tagEdit = null">Cancel</button><button class="btn btn-primary" :disabled="busy">Save tags</button></div>
        </form>
      </template>
    </div>

    <!-- Confirm complete -->
    <div class="modal-back" v-show="confirmDone" @click.self="confirmDone = false">
      <div class="modal" role="dialog" aria-label="Mark completed" style="max-width:440px">
        <h2>Mark this ticket completed?</h2>
        <p class="help" style="font-size:13px">It will be locked and archived. Nobody can comment, add links or change tags after this.</p>
        <div class="notice error" v-show="doneError">{{ doneError }}</div>
        <div class="modal-foot"><button class="btn" @click="confirmDone = false">Cancel</button><button class="btn btn-primary" @click="complete()" :disabled="busy">Mark completed</button></div>
      </div>
    </div>
  </main>
</template>

<script>
// Issues in Firestore: issues/{IS-0001} (title, unit, tags, status, Drive links, a short audit trail) and
// issues/{id}/replies/{autoId} for comments. Files stay in the company Google Drive; tickets keep only links.
// Completed tickets are locked by the rules too (no updates or replies once status is 'done').
import { collection, doc, getDoc, getDocs, query, where, orderBy, limit, writeBatch, runTransaction,
  arrayUnion, increment, serverTimestamp } from 'firebase/firestore';
import { db, ROLE_LABEL } from '@/lib/firebase.js';
import Avatar from '@/components/Avatar.vue';
import { roleTint } from '@/lib/avatars.js';
import { useSession } from '@/stores/session.js';
import { audit, friendlyError } from '@/lib/finance-data.js';
import { createNotificationForUser } from '@/services/notificationService'

const me = useSession();
const myRole = ROLE_LABEL[me.role] || me.role;          // 'Finance', 'Director'
const isDirector = me.role === 'director';
// Posts, Raised by and the ticket's audit trail show the person's name with their role as a badge.
const myLabel = me.name || (isDirector ? 'Director' : `${myRole} user`);
// Every role raises, comments on and works its own tickets. IT included (Khairul 21 Oct), though IT is view-only elsewhere.
const canWrite = !!me.role;

const TAGS = ['IT', 'Admin', 'HR', 'Finance', 'Operations', 'Procurement', 'Marketing'];
const STATUS = { open: { label: 'Open', cls: 'amber' }, progress: { label: 'In progress', cls: 'blue' }, done: { label: 'Completed', cls: 'green' } };
const FILTERS = [{ key: 'all', label: 'All' }, { key: 'open', label: 'Open' }, { key: 'progress', label: 'In progress' },
  { key: 'done', label: 'Completed' }, { key: 'mine', label: 'Tagged to my role' }, { key: 'raised', label: 'Raised by me' }];
const LIST_LIMIT = 500;
// Links must point at the company Google Drive (Drive, Docs, Sheets, Slides).
const DRIVE_HOSTS = ['drive.google.com', 'docs.google.com'];

const pad = n => String(n).padStart(2, '0');
const localIso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const nowIso = () => localIso(new Date());
const isoOf = t => (t?.toDate ? localIso(t.toDate()) : typeof t === 'string' ? t : '');
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const toTicket = (id, d) => ({ id, ...d, tags: d.tags || [], links: d.links || [], audit: d.audit || [], raisedAt: isoOf(d.createdAt), doneAt: isoOf(d.doneAt) });

export default {
  components: { Avatar },
  data() {
    return {
      TAGS, STATUS, FILTERS, canRaise: canWrite,
      tickets: [], ticket: null, replies: [], units: [], search: '', filter: 'all', unitFilter: '', okMsg: '', error: '', doneError: '',
      loading: true, busy: false, raise: null, tagEdit: null, confirmDone: false, draft: this.newDraft()
    };
  },
  // ?id= opens a ticket. Opening one or going back changes the address, which remounts the page
  // (Back/Forward included); a message for the next screen travels in history.state.
  async mounted() {
    await this.route();
    this.loading = false;
  },
  methods: {
    roleTint,
    newDraft() { return { text: '', links: [], adding: false, linkName: '', linkUrl: '', error: '' }; },
    async route() {
      const id = this.$route.query.id;
      try {
        if (id) {
          const snap = await getDoc(doc(db, 'issues', id)).catch(e => { if (e.code === 'permission-denied') return null; throw e; });
          const t = snap?.exists() ? toTicket(id, snap.data()) : null;
          this.ticket = t && this.canSee(t) ? t : null;
          if (this.ticket) await this.loadReplies();
        }
        if (!this.ticket) await this.loadList();
      } catch (e) { this.error = friendlyError(e, 'load the tickets'); }
      this.draft = this.newDraft();
      this.okMsg = (!id || this.ticket) && history.state?.okMsg || '';
    },
    // Rules are not filters: Directors read every ticket; everyone else asks for tickets tagged to their role
    // and tickets they raised, and the two lists are merged.
    async loadList() {
      const col = collection(db, 'issues');
      const snaps = isDirector ? [await getDocs(query(col, orderBy('createdAt', 'desc'), limit(LIST_LIMIT)))]
        : await Promise.all([getDocs(query(col, where('tags', 'array-contains', myRole), limit(LIST_LIMIT))),
          getDocs(query(col, where('raisedByUid', '==', me.user.uid), limit(LIST_LIMIT)))]);
      const seen = new Map();
      for (const s of snaps) for (const d of s.docs) seen.set(d.id, toTicket(d.id, d.data()));
      this.tickets = [...seen.values()];
    },
    async loadReplies() {
      const snap = await getDocs(query(collection(db, 'issues', this.ticket.id, 'replies'), orderBy('createdAt')));
      this.replies = snap.docs.map(d => ({ id: d.id, links: [], ...d.data() }));
    },
    open(id) { this.$router.push({ query: { id } }); },
    back() { this.$router.push({ query: {}, state: { okMsg: this.okMsg } }); },

    // Visibility: tagged to my role, raised by me, or Director (sees all)
    raisedByMe(t) { return t.raisedByUid === me.user.uid; },
    canSee(t) { return isDirector || t.tags.includes(myRole) || this.raisedByMe(t); },
    visible() { return this.tickets.filter(t => this.canSee(t)); },
    canUpdate() { const t = this.ticket; return t && canWrite && t.status !== 'done' && (isDirector || t.tags.includes(myRole)); },
    canComment() { return canWrite; },
    count(s) { return this.visible().filter(t => t.status === s).length; },
    needReply() { return this.visible().filter(t => t.status === 'open' && (isDirector || t.tags.includes(myRole)) && (t.lastBy || t.raisedBy) !== myLabel).length; },
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
    day(iso) { return iso ? `${+iso.slice(8, 10)} ${MON[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}` : ''; },
    stamp(iso) { return iso ? `${this.day(iso)}, ${iso.slice(11, 16)}` : ''; },
    icon(fn) { return /\.(jpe?g|png|gif|webp|heic)$/i.test(fn) || /photo|image|picture/i.test(fn) ? '🖼' : /\.(xlsx?|csv)$/i.test(fn) || /sheet/i.test(fn) ? '📊' : '📄'; },
    // Add Drive link: a name and a Google Drive URL (nothing is uploaded to the PMS).
    addLink(target) {
      target.error = '';
      let url;
      try { url = new URL(target.linkUrl.trim()); } catch { url = null; }
      if (!url || url.protocol !== 'https:' || !DRIVE_HOSTS.includes(url.hostname)) return target.error = 'Paste a Google Drive link, starting with https://drive.google.com/ or https://docs.google.com/.';
      if (target.links.some(l => l.url === url.href)) return target.error = 'That link is already added.';
      if (target.links.length >= 10) return target.error = 'Up to 10 links each time.';
      target.links.push({ name: target.linkName.trim().slice(0, 80) || 'Drive link', url: url.href });
      target.linkName = ''; target.linkUrl = ''; target.adding = false;
    },
    entry(text) { return { at: nowIso(), by: myLabel, role: myRole, text }; },
    // Older tickets saved the role as the name ('Director', 'Finance user'): no badge repeating it.
    showRole(name, role) { return !!role && name !== role && name !== `${role} user`; },
    async units4raise() {
      if (this.units.length) return;
      // Operations, Finance and Directors can read units; other roles type the unit instead.
      try {
        const [ps, us] = await Promise.all([getDocs(collection(db, 'properties')), getDocs(collection(db, 'units'))]);
        const names = Object.fromEntries(ps.docs.map(d => [d.id, d.data().name]));
        this.units = us.docs.map(d => ({ id: d.id, ...d.data(), propertyName: names[d.data().propertyId] || '' }))
          .filter(u => u.active !== false && u.unitCode).sort((a, b) => a.unitCode.localeCompare(b.unitCode));
      } catch { this.units = []; }
    },

    openRaise() {
      this.raise = { title: '', unit: '', body: '', tags: [], links: [], linkName: '', linkUrl: '', error: '' };
      this.$nextTick(() => this.$refs.rTitle?.focus());
      this.units4raise();
    },
    async saveRaise() {
      const r = this.raise;
      if (!r.title.trim()) return r.error = 'Give the ticket a title.';
      if (!r.body.trim()) return r.error = 'Describe what happened.';
      if (!r.tags.length) return r.error = 'Tag at least one role to handle it.';
      if (r.linkUrl.trim()) { this.addLink(r); if (r.error) return; }
      const code = r.unit.trim().toUpperCase(), unit = this.units.find(u => u.unitCode.toUpperCase() === code) || null;
      const tags = TAGS.filter(g => r.tags.includes(g));
      const h = this.entry(`raised the ticket, tagged ${tags.join(', ')}` + (r.links.length ? ` · ${r.links.length} Drive link${r.links.length > 1 ? 's' : ''}` : ''));
      this.busy = true; r.error = '';
      try {
        // One transaction: the next IS number (counters/issues), the ticket and the audit entry.
        const id = await runTransaction(db, async tx => {
          const cRef = doc(db, 'counters', 'issues');
          const c = await tx.get(cRef);
          
          const n = c.exists() ? c.data().next || 1 : 1, id = 'IS-' + String(n).padStart(4, '0'), ref = doc(db, 'issues', id);
          if ((await tx.get(ref)).exists()) throw Object.assign(new Error(`${id} already exists. Ask a Director to check counters/issues.`), { plain: true });
          tx.set(cRef, { next: n + 1 });

          tx.set(ref, { title: r.title.trim(), body: r.body.trim(), unit: unit?.unitCode || code, unitId: unit?.id || null,
            property: unit?.propertyName || '', propertyId: unit?.propertyId || null, tags, status: 'open',
            raisedBy: myLabel, raisedRole: myRole, raisedByUid: me.user.uid, links: r.links, linkCount: r.links.length, replyCount: 0, lastBy: myLabel,
            audit: [h], createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
          audit(tx, me, { action: 'issue.create', entity: `issues/${id}`, propertyId: unit?.propertyId || null, changes: [{ field: 'tags', old: null, new: tags.join(', ') }] });
          return id;
        });
        this.raise = null; this.okMsg = `${id} raised and tagged ${tags.join(', ')}.`;
        await this.loadList();
      } catch (e) {
        console.error('Failed to raise issue:', {
          code: e.code,
          message: e.message,
          error: e
        });

        r.error = e.plain
          ? e.message
          : friendlyError(e, 'raise the ticket');
      }
      this.busy = false;
    },
    async postComment() {
      const t = this.ticket, d = this.draft; if (t.status === 'done' || !canWrite) return;
      if (d.linkUrl.trim()) { this.addLink(d); if (d.error) return; }
      const text = d.text.trim(), links = [...d.links];
      if (!text && !links.length) return;
      const h = this.entry(`commented` + (links.length ? ` and added ${links.length} Drive link${links.length > 1 ? 's' : ''}` : ''));
      this.busy = true; d.error = '';
      try {
        const b = writeBatch(db), ref = doc(db, 'issues', t.id);
        b.set(doc(collection(db, 'issues', t.id, 'replies')), { by: myLabel, byRole: myRole, byUid: me.user.uid, at: nowIso(), text, links, createdAt: serverTimestamp() });
        b.update(ref, { replyCount: increment(1), linkCount: increment(links.length), lastBy: myLabel, audit: arrayUnion(h), updatedAt: serverTimestamp() });
        audit(b, me, { action: 'issue.comment', entity: `issues/${t.id}`, propertyId: t.propertyId || null, changes: links.length ? [{ field: 'links', old: null, new: links.length }] : [] });
        await b.commit();
        t.replyCount = (t.replyCount || 0) + 1; t.linkCount = (t.linkCount || 0) + links.length; t.lastBy = myLabel; t.audit.push(h);
        this.draft = this.newDraft();
        await this.loadReplies();
      } catch (e) { d.error = friendlyError(e, 'post the comment'); }
      this.busy = false;
    },
    // Progress, tags and completion: one update with its audit lines, plus the audit log entry.
    async change(fields, lines, action, changes, reason = '') {
      const t = this.ticket, hs = lines.map(x => this.entry(x));
      const b = writeBatch(db);
      b.update(doc(db, 'issues', t.id), { ...fields, audit: arrayUnion(...hs), updatedAt: serverTimestamp() });
      audit(b, me, { action, entity: `issues/${t.id}`, propertyId: t.propertyId || null, changes, reason });
      await b.commit();
      t.audit.push(...hs);
    },
    async setProgress() {
      const t = this.ticket; this.busy = true; this.error = '';
      try {
        await this.change({ status: 'progress' }, [`marked it in progress`], 'issue.progress', [{ field: 'status', old: t.status, new: 'progress' }]);
        t.status = 'progress';
      } catch (e) { this.error = friendlyError(e, 'update the ticket'); }
      this.busy = false;
    },
    openTags() { this.tagEdit = { tags: [...this.ticket.tags], reason: '', error: '' }; },
    async saveTags() {
      const e = this.tagEdit, t = this.ticket;
      if (!e.tags.length) return e.error = 'Keep at least one role tagged.';
      const added = e.tags.filter(g => !t.tags.includes(g)), removed = t.tags.filter(g => !e.tags.includes(g));
      if (!added.length && !removed.length) return this.tagEdit = null;
      if (!e.reason.trim()) return e.error = 'Give a reason for the tag change.';
      const why = ` · reason: "${e.reason.trim()}"`, tags = TAGS.filter(g => e.tags.includes(g));
      this.busy = true; e.error = '';
      try {
        await this.change({ tags }, [...added.map(g => `added tag ${g}${why}`), ...removed.map(g => `removed tag ${g}${why}`)],
          'issue.tags', [{ field: 'tags', old: t.tags.join(', '), new: tags.join(', ') }], e.reason.trim());
        t.tags = tags; this.tagEdit = null;
        if (!this.canSee(t)) { this.okMsg = `${t.id} is no longer tagged to ${myRole}, so it has left your list.`; this.back(); }
      } catch (err) { e.error = friendlyError(err, 'save the tags'); }
      this.busy = false;
    },

    async complete() {
      const t = this.ticket
      this.busy = true
      this.doneError = ''

      try {
        await this.change(
          {
            status: 'done',
            doneAt: serverTimestamp(),
            doneBy: myLabel,
            doneByUid: me.user.uid,
          },
          ['marked the ticket completed'],
          'issue.complete',
          [{ field: 'status', old: t.status, new: 'done' }]
        )

        Object.assign(t, {
          status: 'done',
          doneAt: nowIso(),
          doneBy: myLabel,
        })

        this.confirmDone = false
      } catch (e) {
        this.doneError = friendlyError(e, 'complete the ticket')
      }

      this.busy = false
    },

    async notifyUsers(recipientUids, title, message, link) {
      const currentUid = me.user?.uid

      const uniqueUids = [
        ...new Set(
          (recipientUids || []).filter(
            uid => uid && uid !== currentUid
          )
        ),
      ]

      if (!uniqueUids.length) return

      await Promise.all(
        uniqueUids.map(recipientUid =>
          createNotificationForUser({
            recipientUid,
            title,
            message,
            type: 'issue',
            link,
          })
        )
      )
    },
  },
}
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
    .post-head .when { color: var(--muted); font-size: 12px; }
    .who { display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .audit-list b + .tag { margin: 0 2px 0 6px; }
    .post p { margin: 0; font-size: 13px; white-space: pre-wrap; overflow-wrap: anywhere; }
    .files { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
    .file-chip { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--border); border-radius: 6px; padding: 4px 8px; font-size: 12px; background: var(--surface); }
    .file-chip button { border: 0; background: none; color: var(--muted); padding: 0 0 0 2px; }
    .thread { display: grid; gap: 12px; }
    .composer textarea { height: 64px; }
    .composer-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 10px; }
    .composer-row .help { flex: 1; min-width: 160px; }
    .link-add { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
    .link-add .input { flex: 1 1 160px; min-width: 0; height: 34px; }
    a.file-chip { color: var(--accent); text-decoration: none; overflow-wrap: anywhere; }
    a.file-chip:hover { text-decoration: underline; }
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
