<template>
  <main class="content soft-page">
    <div class="page-head">
      <div><h1>Staff complaints</h1><div class="sub">Complaints sent to HR by staff</div></div>
    </div>
    <div class="notice error" v-show="error">{{ error }}</div>
    <!-- The list sits in a coloured card like the Directors' inbox, with search and the status drop-down (4 Nov 2026) -->
    <section class="card">
      <div class="card-head"><h2>HRs' Inbox</h2><span class="help">{{ `${list.filter(c => c.status === 'new').length} new` }}</span></div>
      <div class="list-tools">
        <div class="search-box">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          <input class="input" type="search" v-model="q" placeholder="Search ref, name or subject" aria-label="Search ref, name or subject">
        </div>
        <OptionPicker v-model="filter" :options="filterOptions" label="Status" />
      </div>
      <div class="loading-bar" v-show="loading"></div>
      <Paged :items="shown()" v-slot="{ pageRows }">
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Ref</th><th>Date</th><th>From</th><th>Subject</th><th>Status</th><th></th></tr></thead>
          <tbody>
            <tr class="clickable" v-for="c in pageRows" :key="c.id" @click="open(c)">
              <td>{{ c.ref }}</td><td>{{ c.date }}</td>
              <td><span class="who-cell"><Avatar :anonymous="c.anonymous" :uid="c.fromId" :name="c.fromName" :size="24" />{{ c.anonymous ? 'Anonymous' : c.fromName }}</span></td>
              <td>{{ c.subject }}</td>
              <td><span class="pill" :class="st(c)[1]">{{ st(c)[0] }}</span></td>
              <td class="num"><button class="editlink" @click.stop="open(c)">Open</button></td>
            </tr>
            <tr v-show="!loading && !shown().length"><td colspan="6" class="muted">{{ q.trim() ? `Nothing matches "${q.trim()}".` : 'No complaints here.' }}</td></tr>
          </tbody>
        </table>
      </div>
      </Paged>
    </section>
    <p class="help" style="margin-top:12px">Complaints sent anonymously show "Anonymous" and HR cannot see who sent them. Opening a New complaint marks it "Read by HR", which the sender sees under My complaints. HR cannot change the details or delete a complaint. Only HR sees this page.</p>

    <template v-if="sel">
      <div class="modal-back" @click.self="sel = null" v-esc="() => { sel = null }">
        <!-- Details on the left, the conversation on the right like a messaging app (Khairul, 4 Nov 2026). Phones: stacked. -->
        <div class="modal cp-modal" role="dialog" aria-label="Complaint">
          <div class="cp-head">
            <h2>{{ `${sel.ref} · ${sel.subject}` }}</h2>
            <button type="button" class="cp-x" aria-label="Close" @click="sel = null">×</button>
          </div>
          <div class="notice error" v-show="actErr">{{ actErr }}</div>
          <div class="cp-split">
            <div class="cp-left">
              <div class="kv"><span>Date</span><span>{{ sel.date }}</span></div>
              <div class="kv"><span>From</span><span class="who-cell"><Avatar :anonymous="sel.anonymous" :uid="sel.fromId" :name="sel.fromName" :size="24" />{{ sel.anonymous ? 'Anonymous' : sel.fromName }}</span></div>
              <!-- Status drop-down. Closed asks for a closing note first; picking another status on a Closed one reopens it. -->
              <div class="kv"><span>Status</span><span class="st-row">
                <OptionPicker class="st-pick" :model-value="sel.status" :options="statusOptions" label="Status" @update:model-value="pickStatus" /></span></div>
              <div class="close-box" v-if="closing">
                <label for="cpClose" class="req">Closing note (the sender sees it)</label>
                <textarea class="input" id="cpClose" v-model="closeNote" maxlength="2000" placeholder="e.g. We spoke to the supervisor and changed the roster from next week."></textarea>
                <div class="row-btns"><button class="btn" @click="closing = false">Cancel</button><button class="btn btn-primary" :disabled="busy || !closeNote.trim()" @click="status('closed', closeNote)">Close complaint</button></div>
              </div>
              <div class="field" style="margin-top:12px"><label>Details</label><div class="detail">{{ sel.details }}</div></div>
              <PhotoThumbs :images="photosOf('complaint')" />
              <!-- Complaints sent before 4 Nov kept only file names (the files themselves were never uploaded) -->
              <div class="file-names" v-show="sel.files && sel.files.length">{{ 'File names given (not uploaded): ' + sel.files.join(', ') }}</div>

              <!-- HR notes: only HR sees these -->
              <section class="fu notes">
                <h3>HR notes <span class="only">Only HR sees these</span></h3>
                <div class="msgs" v-if="notes.length">
                  <div class="msg note" v-for="n in notes" :key="n.id || n.text"><div class="who"><Avatar :uid="n.byUid" :name="n.byName" role="hr" :size="18" />{{ n.byName || 'HR' }}<span class="when">{{ when(n.createdAt) }}</span></div><div class="txt">{{ n.text }}</div></div>
                </div>
                <p class="help" v-else-if="!notesLoading">No notes yet.</p>
                <div class="compose">
                  <textarea class="input" v-model="noteText" maxlength="2000" placeholder="e.g. Spoke to the supervisor on 5 Nov" aria-label="HR note"></textarea>
                  <button class="btn" :disabled="busy || !noteText.trim()" @click="note()">Add note</button>
                </div>
              </section>
            </div>

            <!-- Conversation with the sender (they see it under My complaints). Shared live chat since 6 Nov 2026. -->
            <ComplaintChat :key="sel.id" :complaint="sel" side="hr" :labels="{ hr: 'HR', sender: sel.anonymous ? 'Anonymous' : (sel.fromName || 'Sender') }"
              :anonymous-other="sel.anonymous" :title="sel.anonymous ? 'Conversation · Anonymous' : 'Conversation · ' + (sel.fromName || 'Sender')"
              :hint="sel.anonymous ? 'They see replies on the browser they sent it from, with no notification, and cannot reply.' : 'They see these under My complaints, get a notification for each reply, and can reply back.'"
              placeholder="Reply to the sender" empty="No replies yet. Your first reply starts the conversation." :can-reply="sel.status !== 'closed'"
              closed-text="Closed. Pick another status on the left to reopen it and reply." @complaint-photos="p => images = p" />
          </div>
        </div>
      </div>
    </template>
  </main>
</template>

<script>
// Only HR reads staff complaints. Opening a New one marks it Read by HR (the only change allowed); nobody edits or deletes them.
// Anonymous ones carry no sender at all.
import { watchComplaintList, mergeRows, markStaffRead, loadNotes, addNote, setStatus, STATUS } from './complaints.js';
import { liveMixin } from '@/lib/use-live.js';
import PhotoPicker from '@/components/PhotoPicker.vue';
import OptionPicker from '@/components/OptionPicker.vue';
import PhotoThumbs from '@/components/PhotoThumbs.vue';
import ComplaintChat from '@/components/ComplaintChat.vue';
import Avatar from '@/components/Avatar.vue';
import { useSession } from '@/stores/session.js';

const me = useSession();
import { friendlyError } from '@/lib/finance-data.js';

export default {
  mixins: [liveMixin],
  components: { PhotoPicker, PhotoThumbs, OptionPicker, ComplaintChat, Avatar },
  data() {
    return {
      STATUS, list: [], loading: true, error: '', filter: 'all', q: '', sel: null,
      notes: [], images: [], notesLoading: false, noteText: '', closing: false, closeNote: '', busy: false, actErr: '',
      filters: [['all', 'All'], ['new', 'New'], ['read', 'Read by HR'], ['review', 'In review'], ['closed', 'Closed']]
    };
  },
  computed: {
    // New is only where a complaint starts; HR moves it on from there
    filterOptions() {
      return this.filters.map(([k, label]) => ({ value: k, label: `${k === 'all' ? 'All statuses' : label} (${k === 'all' ? this.list.length : this.list.filter(c => c.status === k).length})` }));
    },
    statusOptions() { return ['new', 'read', 'review', 'closed'].map(k => ({ value: k, label: STATUS[k][0], disabled: k === 'new' })); }
  },
  mounted() {
    // Live (6 Nov 2026): new complaints and status changes show without a refresh, the open one too
    let first = true;
    this.liveUse('list', watchComplaintList({ kind: 'staff' }, rows => {
      this.list = mergeRows(this.list, rows); this.loading = false;
      if (first) {   // from a notification: open that complaint
        first = false;
        const id = this.$route.query.id, c = id && this.list.find(x => x.id === id);
        if (c) this.open(c);
      }
    }, e => { this.error = friendlyError(e, 'load the complaints'); this.loading = false; }));
  },
  methods: {
    st(c) { return STATUS[c.status] || STATUS.new; },
    pickStatus(to) {
      if (this.busy || to === this.sel.status) return;
      if (to === 'closed') { this.closing = true; this.closeNote = ''; return; }   // applied by "Close complaint" with its note
      this.closing = false;
      this.status(to);
    },
    // Open the complaint; a New one becomes Read by HR for the sender (best effort: reading never fails because of it)
    async open(c) {
      this.sel = c; this.notes = []; this.images = []; this.noteText = ''; this.closing = false; this.actErr = '';
      // The conversation and its photos are live inside ComplaintChat (6 Nov 2026); notes are HR-only and load once
      this.notesLoading = true;
      const load = loadNotes(c.id).then(n => { if (this.sel === c) this.notes = n; })
        .catch(e => { this.actErr = friendlyError(e, 'load the notes'); })
        .finally(() => { if (this.sel === c) this.notesLoading = false; });
      if (c.status === 'new') {
        try { if (await markStaffRead(me, c)) c.status = 'read'; }
        catch (e) { console.warn('Could not mark it read:', e.code || e.message); }
      }
      await load;
    },
    when(t) { return t?.toDate ? t.toDate().toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Just now'; },
    async run(fn, what) {
      this.busy = true; this.actErr = '';
      try { await fn(); } catch (e) { this.actErr = e.code ? friendlyError(e, what) : e.message; }
      this.busy = false;
    },
    // Photos sent with the complaint (ComplaintChat passes them up)
    photosOf() { return this.images; },
    note() { return this.run(async () => { this.notes.push(await addNote(me, this.sel, this.noteText)); this.noteText = ''; }, 'add the note'); },
    status(to, text = '') {
      return this.run(async () => {
        await setStatus(me, this.sel, to, text);
        this.sel.status = to; this.closing = false; this.closeNote = '';
      }, 'change the status');
    },
    // Status filter, then search by ref, sender name (Anonymous for anonymous ones) or subject
    shown() {
      const q = this.q.trim().toLowerCase();
      return this.list.filter(c => (this.filter === 'all' || c.status === this.filter)
        && (!q || [c.ref, c.anonymous ? 'Anonymous' : c.fromName, c.subject].some(v => String(v || '').toLowerCase().includes(q))));
    }
  }
};
</script>

<style scoped>
    .ok-box { display: grid; gap: 4px; }
    .yes { background: var(--green-soft); color: var(--green); }
    .no { background: var(--red-soft); color: var(--red); }
    .anon { background: var(--chip); color: var(--text-2); font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 999px; }
    .check { display: flex; gap: 10px; align-items: flex-start; margin: 14px 0; font-size: 13px; }
    .check input { width: 16px; height: 16px; accent-color: var(--accent); margin-top: 2px; }
    .check small { display: block; color: var(--muted); font-size: 12px; }
    .filedrop b { color: var(--accent); }
    .file-names { font-size: 12px; color: var(--text-2); margin-top: 6px; }
    .cp-modal { max-width: 1180px; width: calc(100% - 32px); height: min(860px, 90vh); display: flex; flex-direction: column; padding-bottom: 16px; }
    .cp-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
    .cp-head h2 { margin-bottom: 10px; }
    .cp-x { flex: none; width: 36px; height: 36px; border: 0; border-radius: 8px; background: none; color: var(--muted); font-size: 24px; line-height: 1; cursor: pointer; }
    .cp-x:hover { background: var(--hover); color: var(--text); }
    .cp-split { flex: 1 1 auto; min-height: 0; display: grid; grid-template-columns: minmax(220px, 300px) minmax(0, 1fr); gap: 20px; }   /* same sizes as the staff side (RaiseComplaint.vue) */
    .cp-left { min-height: 0; overflow-y: auto; padding-right: 12px; scrollbar-width: thin; scrollbar-color: var(--border) transparent; }   /* HR notes can make it scroll: a thin, quiet scrollbar */
    .cp-left::-webkit-scrollbar { width: 6px; } .cp-left::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
    @media (max-width: 860px) {
      .cp-modal { height: auto; }
      .cp-split { grid-template-columns: 1fr; }
      .cp-left { overflow: visible; padding-right: 0; }
    }
    /* Status drop-down: as wide as its text (no forced width) */
    /* Its list opens to the left, so the right edge of the details column doesn't cut it off */
    .st-pick :deep(.op-pop) { left: auto; right: 0; }
    .st-row { display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
    .btn-sm { height: 30px; padding: 0 10px; font-size: 12px; }
    .close-box { display: grid; gap: 6px; margin: 10px 0; padding: 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--hover); }
    .close-box label { font-size: 12px; font-weight: 600; }
    .row-btns { display: flex; gap: 8px; justify-content: flex-end; }
    .fu { margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--line); }
    .fu h3 { font-size: 14px; margin: 0 0 4px; display: flex; align-items: center; gap: 8px; }
    .only { font-size: 11px; font-weight: 600; color: var(--amber); background: var(--amber-soft); padding: 1px 8px; border-radius: 999px; }
    .msgs { display: grid; gap: 8px; margin: 10px 0; }
    .msg { padding: 10px 12px; border-radius: 10px; border: 1px solid var(--line); max-width: 92%; }
    .msg.note { background: var(--amber-soft); max-width: 100%; }
    .who { font-size: 11px; font-weight: 600; color: var(--text-2); display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 3px; }
    .when { color: var(--muted); font-weight: 400; }
    .tag { background: var(--green-soft); color: var(--green); padding: 0 6px; border-radius: 999px; }
    .txt { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 13px; }
    .compose { display: grid; gap: 8px; margin-top: 8px; }
    .compose textarea, .close-box textarea { min-height: 70px; }
    .compose .btn { justify-self: end; }
    .compose-row { display: flex; justify-content: space-between; align-items: flex-end; gap: 10px; flex-wrap: wrap; }
    .who-cell { display: inline-flex; align-items: center; gap: 8px; }
    .list-tools { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 14px; }
    .search-box { position: relative; flex: 1 1 260px; max-width: 420px; }
    .search-box svg { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--muted); pointer-events: none; }
    .search-box .input { width: 100%; padding-left: 36px; }
    .detail { white-space: pre-wrap; font-size: 13px; background: var(--hover); border: 1px solid var(--line); border-radius: 8px; padding: 12px; }
</style>