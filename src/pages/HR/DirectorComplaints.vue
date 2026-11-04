<template>
  <main class="content soft-page">
    <div class="page-head"><div><h1>{{ isHr ? 'Send a complaint to the Directors' : 'Director Complaints' }}</h1><div class="sub">{{ isHr ? 'Sent to all Directors' : 'Complaints sent to the Directors by HR' }}</div></div>
      <button class="btn btn-primary" type="button" v-if="isHr" @click="showSent = true">{{ `Sent before${list.length ? ` (${list.length})` : ''}` }}</button></div>
    <div class="notice ok" v-show="okMsg">{{ okMsg }}</div>
    <div class="notice error" v-show="loadErr">{{ loadErr }}</div>
    <!-- HR: the form full width, like Raise a staff complaint; "Sent before" opens the list (4 Nov 2026) -->
    <section class="card" v-if="isHr">
      <div class="card-head"><h2>New complaint</h2></div>
      <form @submit.prevent="send()">
        <div class="field"><label>To</label><div><span class="tag">All Directors</span></div></div>
        <div class="field"><label for="dSubj">Subject</label><input class="input" id="dSubj" v-model="subject" placeholder="e.g. Repeated late salary for part-timers"></div>
        <div class="field"><label for="dDet">Details</label><textarea class="input" id="dDet" style="height:140px" v-model="details" placeholder="What happened and what you need from the Directors"></textarea></div>
        <div class="field"><label>Photos</label><PhotoPicker v-model="photos" /><span class="help">Up to 5 photos or screenshots.</span></div>
        <p class="help who-line">Only HR and the Directors can see these complaints, their replies and photos. IT and other staff can't.</p>
        <div class="notice error" v-show="err" style="margin-top:12px">{{ err }}</div>
        <div class="actions" style="margin-top:14px"><button class="btn btn-primary" type="submit" :disabled="busy">{{ busy ? 'Sending…' : 'Send to Directors' }}</button><button class="btn" type="button" @click="clear()">Cancel</button></div>
      </form>
    </section>

    <!-- HR: complaints sent before; click one to open it and its conversation -->
    <div class="modal-back" v-if="showSent" @click.self="showSent = false" v-esc="() => { showSent = false }">
      <div class="modal" role="dialog" aria-label="Sent before" style="max-width:760px;width:calc(100% - 32px)">
        <h2>Sent before</h2>
        <div class="loading-bar" v-show="loading"></div>
        <Paged :items="list" v-slot="{ pageRows }">
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Ref</th><th>Date</th><th>Subject</th><th>From</th><th>Status</th></tr></thead>
            <tbody>
              <tr class="clickable" v-for="c in pageRows" :key="c.id" @click="showSent = false; open(c)"><td>{{ c.ref }}</td><td>{{ c.date }}</td><td>{{ c.subject }}</td><td>{{ c.fromName }}</td>
                <td><span class="pill" :class="st(c)[1]">{{ st(c)[0] }}</span></td></tr>
              <tr v-show="!loading && !list.length"><td colspan="5" class="muted">Nothing sent yet.</td></tr>
            </tbody>
          </table>
        </div>
        </Paged>
        <p class="help" style="margin-top:8px" v-if="list.length">Click a complaint to see the Directors' replies.</p>
        <div class="modal-foot"><button class="btn" @click="showSent = false">Close</button></div>
      </div>
    </div>
    <!-- The Directors' inbox is for Directors only; HR follows what they sent under "Sent before" (4 Nov 2026) -->
    <section class="card" v-if="!isHr">
      <div class="card-head"><h2>Directors' inbox</h2><span class="help">{{ `${list.filter(c => !c.read).length} not read` }}</span></div>
      <div class="loading-bar" v-show="loading"></div>
      <Paged :items="list" v-slot="{ pageRows }">
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Ref</th><th>Date</th><th>From</th><th>Subject</th><th>Status</th><th></th></tr></thead>
          <tbody>
            <tr class="clickable" v-for="c in pageRows" :key="c.id" @click="open(c)"><td>{{ c.ref }}</td><td>{{ c.date }}</td><td>{{ c.fromName }}</td><td>{{ c.subject }}</td>
              <td><span class="pill" :class="st(c)[1]">{{ st(c)[0] }}</span></td>
              <td class="num"><button class="editlink" @click.stop="open(c)">Open</button></td></tr>
            <tr v-show="!loading && !list.length"><td colspan="6" class="muted">No complaints yet.</td></tr>
          </tbody>
        </table>
      </div>
      </Paged>
    </section>
    <template v-if="sel">
      <div class="modal-back" @click.self="sel = null" v-esc="() => { sel = null }">
        <!-- Details on the left, the conversation between HR and the Directors on the right (4 Nov 2026). Phones: stacked. -->
        <div class="modal cp-modal" role="dialog" aria-label="Complaint to the Directors">
          <div class="cp-head">
            <h2>{{ `${sel.ref} · ${sel.subject}` }}</h2>
            <button type="button" class="cp-x" aria-label="Close" @click="sel = null">×</button>
          </div>
          <div class="notice error" v-show="actErr">{{ actErr }}</div>
          <div class="cp-split">
            <div class="cp-left">
              <div class="kv"><span>Date</span><span>{{ sel.date }}</span></div>
              <div class="kv"><span>From</span><span>{{ sel.fromName }}</span></div>
              <!-- Directors set the status (4 Nov 2026), like HR on staff complaints; HR sees it read-only.
                   Closed asks for a closing note first; picking another status on a Closed one reopens it. -->
              <div class="kv"><span>Status</span><span class="st-row">
                <OptionPicker v-if="!isHr" class="st-pick" :model-value="selStatus" :options="statusOptions" label="Status" @update:model-value="pickStatus" />
                <span v-else class="pill" :class="st(sel)[1]">{{ st(sel)[0] }}</span></span></div>
              <div class="close-box" v-if="closing">
                <label for="dcClose" class="req">Closing note (HR sees it)</label>
                <textarea class="input" id="dcClose" v-model="closeNote" maxlength="2000" placeholder="e.g. Salaries for part-timers will be paid on the 25th from next month."></textarea>
                <div class="row-btns"><button class="btn" @click="closing = false">Cancel</button><button class="btn btn-primary" :disabled="busy || !closeNote.trim()" @click="status('closed', closeNote)">Close complaint</button></div>
              </div>
              <div class="field" style="margin-top:12px"><label>Details</label><div class="detail">{{ sel.details }}</div></div>
              <PhotoThumbs :images="selPhotos" />
              <!-- Sent before 4 Nov: only file names were kept (the files were never uploaded) -->
              <div class="file-names" v-show="sel.files && sel.files.length">{{ 'File names given (not uploaded): ' + sel.files.join(', ') }}</div>

              <!-- Directors' notes: only the Directors see these -->
              <section class="fu" v-if="!isHr">
                <h3>Directors' notes <span class="only">Only Directors see these</span></h3>
                <div class="msgs" v-if="notes.length">
                  <div class="msg note" v-for="n in notes" :key="n.id || n.text"><div class="who">{{ n.byName || 'Director' }}<span class="when">{{ when(n.createdAt) }}</span></div><div class="txt">{{ n.text }}</div></div>
                </div>
                <p class="help" v-else-if="!notesLoading">No notes yet.</p>
                <div class="compose">
                  <textarea class="input" v-model="noteText" maxlength="2000" placeholder="e.g. Discussed with Finance on 5 Nov" aria-label="Director note"></textarea>
                  <button class="btn" :disabled="busy || !noteText.trim()" @click="note()">Add note</button>
                </div>
              </section>
            </div>
            <ComplaintChat ref="chat" :key="sel.id" :complaint="sel" :side="isHr ? 'hr' : 'director'" :labels="{ hr: 'HR', director: 'Director' }"
              :title="isHr ? 'Conversation with the Directors' : 'Conversation with HR'"
              :hint="isHr ? 'The Directors get a notification for each reply.' : 'HR gets a notification for each reply.'"
              :placeholder="isHr ? 'Reply to the Directors' : 'Reply to HR'" @complaint-photos="p => selPhotos = p"
              :can-reply="selStatus !== 'closed'" :closed-text="isHr ? 'Closed by the Directors. They can reopen it.' : 'Closed. Pick another status on the left to reopen it and reply.'" />
          </div>
        </div>
      </div>
    </template>
  </main>
</template>

<script>
// HR sends, Directors read. Only a Director opening a complaint marks it read. IT and other staff never see this page.
// 4 Nov 2026: HR no longer sees the Directors' inbox (only "Sent before", which opens each complaint); each complaint has a
// conversation between HR and the Directors with photos (components/ComplaintChat.vue, rules Draft 0.29).
// 4 Nov 2026: the Directors set the status (Read by the Directors / In review / Closed with a note / reopen) and keep their
// own notes; every update notifies HR and the Directors (complaints.js tellBoth, rules Draft 0.30).
import { loadComplaints, createComplaint, markRead, loadNotes, addNote, setStatus, DSTATUS, dirStatus } from './complaints.js';
import PhotoPicker from '@/components/PhotoPicker.vue';
import OptionPicker from '@/components/OptionPicker.vue';
import PhotoThumbs from '@/components/PhotoThumbs.vue';
import ComplaintChat from '@/components/ComplaintChat.vue';
import { friendlyError } from '@/lib/finance-data.js';
import { useSession } from '@/stores/session.js';

const me = useSession();

export default {
  components: { PhotoPicker, PhotoThumbs, ComplaintChat, OptionPicker },
  computed: {
    isHr() { return me.role === 'hr'; },
    selStatus() { return this.sel ? dirStatus(this.sel) : 'new'; },
    // New is only where a complaint starts; the Directors move it on from there
    statusOptions() { return ['new', 'read', 'review', 'closed'].map(k => ({ value: k, label: DSTATUS[k][0], disabled: k === 'new' })); }
  },
  data() {
    return {
      list: [], showSent: false, loading: true, loadErr: '', busy: false, subject: '', details: '', photos: [], err: '', okMsg: '', sel: null, selPhotos: [],
      notes: [], notesLoading: false, noteText: '', closing: false, closeNote: '', actErr: ''
    };
  },
  async mounted() {
    await this.load();
    // From a notification: open that complaint
    const id = this.$route.query.id, c = id && this.list.find(x => x.id === id);
    if (c) this.open(c);
  },
  methods: {
    async load() {
      this.loading = true; this.loadErr = '';
      try { this.list = await loadComplaints('director'); }
      catch (e) { this.loadErr = friendlyError(e, 'load the complaints'); }
      this.loading = false;
    },
    clear() { this.subject = ''; this.details = ''; this.photos = []; this.err = ''; },
    st(c) { return DSTATUS[dirStatus(c)] || DSTATUS.new; },
    when(t) { return t?.toDate ? t.toDate().toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Just now'; },
    // Opening a complaint marks it as read for the Directors and loads their notes
    async open(c) {
      this.sel = c; this.selPhotos = []; this.notes = []; this.noteText = ''; this.closing = false; this.closeNote = ''; this.actErr = '';
      if (me.role !== 'director') return;
      this.notesLoading = true;
      loadNotes(c.id).then(n => { if (this.sel === c) this.notes = n; })
        .catch(e => { this.actErr = friendlyError(e, 'load the notes'); }).finally(() => { this.notesLoading = false; });
      if (c.read) return;
      try { await markRead(me, c); c.read = true; if (!c.status) c.status = 'read'; }
      catch (e) { this.loadErr = friendlyError(e, 'mark the complaint as read'); }
    },
    async run(fn, what) {
      this.busy = true; this.actErr = '';
      try { await fn(); } catch (e) { this.actErr = e.code ? friendlyError(e, what) : e.message; }
      this.busy = false;
    },
    pickStatus(to) {
      if (this.busy || to === this.selStatus) return;
      if (to === 'closed') { this.closing = true; this.closeNote = ''; return; }   // applied by "Close complaint" with its note
      this.closing = false;
      this.status(to);
    },
    status(to, text = '') {
      return this.run(async () => {
        await setStatus(me, this.sel, to, text);
        // The closing note is a message in the conversation
        if (text) this.$refs.chat?.thread.push({ text: text.trim(), by: 'director', byName: me.name, closing: true, createdAt: null });
        this.sel.status = to; this.closing = false; this.closeNote = '';
      }, 'change the status');
    },
    note() { return this.run(async () => { this.notes.push(await addNote(me, this.sel, this.noteText)); this.noteText = ''; }, 'add the note'); },
    async send() {
      this.err = ''; this.okMsg = '';
      if (!this.subject.trim()) return this.err = 'Add a subject.';
      if (!this.details.trim()) return this.err = 'Add the details.';
      this.busy = true;
      try {
        const ref = await createComplaint(me, 'director', { subject: this.subject.trim(), details: this.details.trim(), files: [], images: this.photos });
        this.okMsg = `Sent to the Directors as ${ref}.`; this.clear(); await this.load();
      } catch (e) {
        if (e.sentRef) { this.okMsg = `Sent to the Directors as ${e.sentRef}.`; this.err = e.message; this.clear(); await this.load(); }
        else this.err = friendlyError(e, 'send the complaint');
      }
      this.busy = false;
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
    .who-line { margin: 4px 0 0; }
    .sent-row { width: 100%; border: 0; border-bottom: 1px solid var(--line); background: none; font: inherit; color: inherit; text-align: left; cursor: pointer; padding: 10px 8px; }
    .sent-row:hover { background: var(--accent-soft); }
    .cp-modal { max-width: 1180px; width: calc(100% - 32px); height: min(860px, 90vh); display: flex; flex-direction: column; padding-bottom: 16px; }
    .cp-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
    .cp-head h2 { margin-bottom: 10px; }
    .cp-x { flex: none; width: 36px; height: 36px; border: 0; border-radius: 8px; background: none; color: var(--muted); font-size: 24px; line-height: 1; cursor: pointer; }
    .cp-x:hover { background: var(--hover); color: var(--text); }
    .cp-split { flex: 1 1 auto; min-height: 0; display: grid; grid-template-columns: minmax(220px, 300px) minmax(0, 1fr); gap: 20px; }   /* same sizes as the staff complaints */
    .cp-left { min-height: 0; overflow-y: auto; padding-right: 12px; scrollbar-width: thin; scrollbar-color: var(--border) transparent; }
    @media (max-width: 860px) { .cp-modal { height: auto; } .cp-split { grid-template-columns: 1fr; } .cp-left { overflow: visible; padding-right: 0; } }
    .detail { white-space: pre-wrap; font-size: 13px; background: var(--hover); border: 1px solid var(--line); border-radius: 8px; padding: 12px; }
    /* Status drop-down, closing note and Directors' notes: same look as the staff complaints (StaffComplaints.vue) */
    .st-pick :deep(.op-pop) { left: auto; right: 0; }
    .st-row { display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
    .close-box { display: grid; gap: 6px; margin: 10px 0; padding: 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--hover); }
    .close-box label { font-size: 12px; font-weight: 600; }
    .row-btns { display: flex; gap: 8px; justify-content: flex-end; }
    .fu { margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--line); }
    .fu h3 { font-size: 14px; margin: 0 0 4px; display: flex; align-items: center; gap: 8px; }
    .only { font-size: 11px; font-weight: 600; color: var(--amber); background: var(--amber-soft); padding: 1px 8px; border-radius: 999px; }
    .msgs { display: grid; gap: 8px; margin: 10px 0; }
    .msg { padding: 10px 12px; border-radius: 10px; border: 1px solid var(--line); }
    .msg.note { background: var(--amber-soft); max-width: 100%; }
    .who { font-size: 11px; font-weight: 600; color: var(--text-2); display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 3px; }
    .when { color: var(--muted); font-weight: 400; }
    .txt { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 13px; }
    .compose { display: grid; gap: 8px; margin-top: 8px; }
    .compose textarea, .close-box textarea { min-height: 70px; }
    .compose .btn { justify-self: end; }
</style>
