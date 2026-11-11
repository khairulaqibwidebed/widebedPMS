<template>
  <main class="content soft-page">
    <div class="page-head"><div><h1>Raise a staff complaint</h1><div class="sub">Sent to HR</div></div><button class="btn btn-primary" type="button" @click="showMine = true">My complaints{{ list.length ? ` (${list.length})` : '' }}</button></div>
    <div class="notice ok" v-show="okMsg">{{ okMsg }}</div>
    <div class="notice error" v-show="loadErr">{{ loadErr }}</div>
    <div>
      <section class="card">
        <div class="card-head"><h2>Your complaint</h2></div>
        <form @submit.prevent="send()">
          <div class="field"><label for="cSubj">Subject</label><input class="input" id="cSubj" v-model="subject" placeholder="e.g. Unfair shift changes without notice"></div>
          <div class="field"><label for="cDet">Details</label><textarea class="input" id="cDet" rows="6" style="height:140px" v-model="details" placeholder="What happened, when, and who was involved"></textarea></div>
          <div class="field"><label>Photos</label><PhotoPicker v-model="photos" /><span class="help">Up to 5 photos or screenshots. Only HR (and you) can see them.</span></div>
          <label class="check"><input type="checkbox" v-model="anonymous"><span><b>Send anonymously</b><small>Your name is not saved anywhere, so HR cannot see it. It shows under My complaints on this browser only.</small></span></label>
          <div class="notice error" v-show="err">{{ err }}</div>
          <div class="actions"><button class="btn btn-primary" type="submit" :disabled="busy">{{ busy ? 'Sending…' : 'Send to HR' }}</button><button class="btn" type="button" @click="clear()">Cancel</button></div>
        </form>
      </section>
    </div>
    <div class="modal-back" v-if="showMine" @click.self="showMine = false" v-esc="() => { showMine = false }">
    <div class="modal" :class="{ 'cp-modal': open }" role="dialog" aria-label="My complaints" :style="open ? null : 'max-width:760px;width:calc(100% - 32px)'">
      <!-- One complaint: details on the left, the conversation with HR on the right like a messaging app (4 Nov 2026).
           Named complaints that aren't closed can reply. Phones: stacked. -->
      <template v-if="open">
        <div class="cp-head">
          <h2>{{ open.ref + (open.subject ? ' · ' + open.subject : '') }}</h2>
          <button type="button" class="cp-x" aria-label="Close" @click="showMine = false; open = null">×</button>
        </div>
        <div class="notice error" v-show="actErr">{{ actErr }}</div>
        <div class="cp-split">
          <div class="cp-left">
            <div class="kv"><span>Sent</span><span>{{ open.date + (open.anonymous ? ' · anonymously' : '') }}</span></div>
            <div class="kv"><span>Status</span><span><span class="pill" :class="(STATUS[open.status] || STATUS.new)[1]">{{ (STATUS[open.status] || STATUS.new)[0] }}</span></span></div>
            <div class="field" style="margin-top:12px" v-if="open.details"><label>Details</label><div class="detail">{{ open.details }}</div></div>
            <PhotoThumbs :images="photosOf('complaint')" />
          </div>
          <!-- Conversation with HR: the shared live chat (6 Nov 2026). Anonymous ones can read HR's replies but not reply. -->
          <ComplaintChat :key="open.id" :complaint="open" side="sender" :labels="{ hr: 'HR', sender: 'You' }" title="Conversation with HR"
            :hint="open.anonymous ? 'Sent anonymously: you can read HR\'s replies here (on this browser) but not reply.' : 'You get a notification when HR replies.'"
            placeholder="Reply to HR" empty="No replies from HR yet." :can-reply="!open.anonymous && open.status !== 'closed'"
            :closed-text="open.status === 'closed' ? 'This complaint is closed. Raise a new one if something is still wrong.' : ''" @complaint-photos="p => images = p" />
        </div>
      </template>
      <template v-else>
      <h2>My complaints</h2>
      <div class="loading-bar" v-show="loading"></div>
      <Paged :items="list" v-slot="{ pageRows }">
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Ref</th><th>Date</th><th>Subject</th><th>Sent as</th><th>Status</th></tr></thead>
          <tbody>
            <tr class="clickable" v-for="c in pageRows" :key="c.id" @click="view(c)"><td>{{ c.ref }}</td><td>{{ c.date }}</td><td>{{ c.subject }}</td>
              <td>{{ c.anonymous ? 'Anonymous' : myName }}</td>
              <td><span class="pill" :class="(STATUS[c.status] || STATUS.new)[1]">{{ (STATUS[c.status] || STATUS.new)[0] }}</span>
                <div class="help" v-if="c.readAt?.toDate">{{ 'Read ' + c.readAt.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) }}</div></td></tr>
            <SkeletonRows v-if="loading && !list.length" table :cols="5" />
            <tr v-show="!loading && !list.length"><td colspan="5" class="muted">You haven't sent any complaints.</td></tr>
          </tbody>
        </table>
      </div>
      </Paged>
      <p class="help" style="margin-top:8px" v-if="list.length">Click a complaint to see HR's replies.</p>
      <div class="modal-foot"><button class="btn" @click="showMine = false">Close</button></div>
      </template>
    </div>
    </div>
  </main>
</template>

<script>
import { createComplaint, watchComplaintList, watchMyAnonComplaints, mergeRows, newestFirst, STATUS } from './complaints.js';
import { liveMixin } from '@/lib/use-live.js';
import PhotoPicker from '@/components/PhotoPicker.vue';
import PhotoThumbs from '@/components/PhotoThumbs.vue';
import ComplaintChat from '@/components/ComplaintChat.vue';
import { friendlyError } from '@/lib/finance-data.js';
import { useSession } from '@/stores/session.js';

const me = useSession();

export default {
  mixins: [liveMixin],
  components: { PhotoPicker, PhotoThumbs, ComplaintChat },
  data() {
    return { STATUS, open: null, images: [], photos: [], actErr: '', myName: me.name || 'With my name', list: [], showMine: false, loading: true, loadErr: '', busy: false, subject: '', details: '', anonymous: false, files: [], err: '', okMsg: '' };
  },
  mounted() {
    let first = true;
    this.load(() => {
      if (!first) return;
      first = false;   // from a notification: open that complaint
      const id = this.$route.query.id, c = id && this.list.find(x => x.id === id);
      if (c) { this.showMine = true; this.view(c); }
    });
  },
  methods: {
    // Live (6 Nov 2026): HR's status changes show without a refresh. Named ones by fromId; anonymous ones from this
    // browser's saved refs (one small listener each). Called again after sending an anonymous one, to add its ref.
    load(after) {
      this.loadErr = '';
      let named = null, anon = null;
      const show = () => {
        if (!named || !anon) return;
        this.list = mergeRows(this.list, [...named, ...anon].sort(newestFirst)); this.loading = false; after?.();
      };
      const fail = e => { this.loadErr = friendlyError(e, 'load your complaints'); this.loading = false; };
      this.liveUse('named', watchComplaintList({ kind: 'staff', fromId: me.user.uid }, rows => { named = rows; show(); }, fail));
      this.liveUse('anon', watchMyAnonComplaints(rows => { anon = rows; show(); }, fail));
    },
    async view(c) {
      // HR's replies show live inside ComplaintChat (6 Nov 2026); it stops listening when the window closes
      this.open = c; this.images = []; this.actErr = '';
    },
    // Photos sent with the complaint (ComplaintChat passes them up)
    photosOf() { return this.images; },
    clear() { this.subject = ''; this.details = ''; this.anonymous = false; this.files = []; this.photos = []; this.err = ''; },
    async send() {
      this.err = ''; this.okMsg = '';
      if (!this.subject.trim()) return this.err = 'Add a subject.';
      if (!this.details.trim()) return this.err = 'Describe what happened.';
      this.busy = true;
      try {
        const anonymous = this.anonymous;
        const ref = await createComplaint(me, 'staff', { subject: this.subject.trim(), details: this.details.trim(), files: [], anonymous, images: this.photos });
        this.okMsg = `Sent to HR as ${ref}${anonymous ? ', anonymously' : ''}.`;
        if (anonymous) this.load(); this.clear();   // named ones arrive by themselves
      } catch (e) {
        if (e.sentRef) { this.okMsg = `Sent to HR as ${e.sentRef}.`; this.err = e.message; this.load(); this.clear(); }
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
    .cp-modal { max-width: 1180px; width: calc(100% - 32px); height: min(860px, 90vh); display: flex; flex-direction: column; padding-bottom: 16px; }
    .cp-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
    .cp-head h2 { margin-bottom: 10px; }
    .cp-x { flex: none; width: 36px; height: 36px; border: 0; border-radius: 8px; background: none; color: var(--muted); font-size: 24px; line-height: 1; cursor: pointer; }
    .cp-x:hover { background: var(--hover); color: var(--text); }
    .cp-split { flex: 1 1 auto; min-height: 0; display: grid; grid-template-columns: minmax(220px, 300px) minmax(0, 1fr); gap: 20px; }   /* the sender has less to show: narrower details, wider chat */
    .cp-left { min-height: 0; overflow-y: auto; padding-right: 16px; scrollbar-gutter: stable; }
    @media (max-width: 860px) {
      .cp-modal { height: auto; }
      .cp-split { grid-template-columns: 1fr; }
      .cp-left { overflow: visible; padding-right: 0; }
    }
    .back { margin-bottom: 10px; height: 30px; padding: 0 10px; font-size: 12px; }
    .who-cell { display: inline-flex; align-items: center; gap: 8px; }
    .detail { white-space: pre-wrap; font-size: 13px; background: var(--hover); border: 1px solid var(--line); border-radius: 8px; padding: 12px; }
</style>
