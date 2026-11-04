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
          <section class="cp-chat">
            <div class="chat-head">
              <h3>Conversation with HR</h3>
              <p class="help">{{ open.anonymous ? 'Sent anonymously: you can read HR\'s replies here (on this browser) but not reply.' : 'You get a notification when HR replies.' }}</p>
            </div>
            <div class="chat-msgs" ref="chat">
              <div class="loading-bar" v-show="fuLoading"></div>
              <div class="msg" v-for="m in thread" :key="m.id || m.text" :class="m.by === 'hr' ? 'hr' : 'me'">
                <div class="who">{{ m.by === 'hr' ? 'HR' + (m.byName ? ' · ' + m.byName : '') : 'You' }}<span v-if="m.closing" class="tag">Closing note</span><span class="when">{{ when(m.createdAt) }}</span></div>
                <div class="txt" v-if="m.text">{{ m.text }}</div>
                <PhotoThumbs :images="photosOf(m)" />
              </div>
              <p class="chat-empty" v-if="!fuLoading && !thread.length">No replies from HR yet.</p>
            </div>
            <div class="chat-compose" v-if="!open.anonymous && open.status !== 'closed'">
              <ChatCompose v-model="replyText" v-model:photos="replyPhotos" :busy="busy" placeholder="Reply to HR" @send="reply()" />
            </div>
            <p class="chat-closed" v-else-if="open.status === 'closed'">This complaint is closed. Raise a new one if something is still wrong.</p>
          </section>
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
import { createComplaint, loadMyComplaints, loadThread, loadImages, addReply, STATUS } from './complaints.js';
import PhotoPicker from '@/components/PhotoPicker.vue';
import PhotoThumbs from '@/components/PhotoThumbs.vue';
import ChatCompose from '@/components/ChatCompose.vue';
import { friendlyError } from '@/lib/finance-data.js';
import { useSession } from '@/stores/session.js';

const me = useSession();

export default {
  components: { PhotoPicker, PhotoThumbs, ChatCompose },
  data() {
    return { STATUS, open: null, thread: [], images: [], photos: [], replyPhotos: [], fuLoading: false, replyText: '', actErr: '', myName: me.name || 'With my name', list: [], showMine: false, loading: true, loadErr: '', busy: false, subject: '', details: '', anonymous: false, files: [], err: '', okMsg: '' };
  },
  watch: {
    // Keep the newest message in view, like a messaging app
    'thread.length'() { this.$nextTick(() => { const el = this.$refs.chat; if (el) el.scrollTop = el.scrollHeight; }); }
  },
  async mounted() {
    await this.load();
    // From a notification: open that complaint
    const id = this.$route.query.id, c = id && this.list.find(x => x.id === id);
    if (c) { this.showMine = true; this.view(c); }
  },
  methods: {
    async load() {
      this.loading = true; this.loadErr = '';
      try { this.list = await loadMyComplaints(me.user.uid); }
      catch (e) { this.loadErr = friendlyError(e, 'load your complaints'); }
      this.loading = false;
    },
    async view(c) {
      this.open = c; this.thread = []; this.images = []; this.replyText = ''; this.replyPhotos = []; this.actErr = ''; this.fuLoading = true;
      try { const [t, im] = await Promise.all([loadThread(c.id), loadImages(c.id)]); if (this.open === c) { this.thread = t; this.images = im; } }
      catch (e) { this.actErr = friendlyError(e, 'load the replies'); }
      this.fuLoading = false;
    },
    when(t) { return t?.toDate ? t.toDate().toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Just now'; },
    // Photos sent with the complaint ('complaint'), or with one reply (a thread message)
    photosOf(m) { return m === 'complaint' ? this.images.filter(i => i.scope === 'complaint') : (m.images || this.images.filter(i => (m.imageIds || []).includes(i.id))); },
    async reply() {
      if (this.busy || (!this.replyText.trim() && !this.replyPhotos.length)) return;
      this.busy = true; this.actErr = '';
      try { this.thread.push(await addReply(me, this.open, this.replyText, 'sender', this.replyPhotos)); this.replyText = ''; this.replyPhotos = []; }
      catch (e) { this.actErr = e.code ? friendlyError(e, 'send the reply') : e.message; }
      this.busy = false;
    },
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
        this.clear(); await this.load();
      } catch (e) {
        if (e.sentRef) { this.okMsg = `Sent to HR as ${e.sentRef}.`; this.err = e.message; this.clear(); await this.load(); }
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
    .cp-chat { min-height: 0; display: flex; flex-direction: column; border: 1px solid var(--border); border-radius: 12px; background: var(--bg); overflow: hidden; }
    .chat-head { padding: 12px 14px 8px; background: var(--surface); border-bottom: 1px solid var(--border); }
    .chat-head h3 { font-size: 14px; margin: 0 0 2px; }
    .chat-head .help { margin: 0; font-size: 12px; }
    .chat-msgs { flex: 1 1 auto; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding: 14px; }
    .chat-msgs .msg { max-width: 82%; }
    .msg.hr { align-self: flex-start; }
    .msg.me { align-self: flex-end; }
    .chat-empty { margin: auto; color: var(--muted); font-size: 13px; text-align: center; }
    .chat-compose { display: grid; gap: 8px; padding: 10px 12px 12px; background: var(--surface); border-top: 1px solid var(--border); }
    .chat-compose textarea { min-height: 64px; max-height: 160px; resize: vertical; }
    .chat-closed { margin: 0; padding: 12px 14px; background: var(--surface); border-top: 1px solid var(--border); color: var(--muted); font-size: 13px; }
    @media (max-width: 860px) {
      .cp-modal { height: auto; }
      .cp-split { grid-template-columns: 1fr; }
      .cp-left { overflow: visible; padding-right: 0; }
      .cp-chat { min-height: 420px; }
      .chat-msgs { max-height: 60vh; }
    }
    .back { margin-bottom: 10px; height: 30px; padding: 0 10px; font-size: 12px; }
    .fu { margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--line); }
    .fu h3 { font-size: 14px; margin: 0 0 4px; }
    .msgs { display: grid; gap: 8px; margin: 10px 0; }
    .msg { padding: 10px 12px; border-radius: 10px; border: 1px solid var(--line); max-width: 92%; }
    .msg.hr { background: var(--surface); justify-self: start; }
    .msg.me { background: var(--accent-soft); justify-self: end; }
    .who { font-size: 11px; font-weight: 600; color: var(--text-2); display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 3px; }
    .when { color: var(--muted); font-weight: 400; }
    .tag { background: var(--green-soft); color: var(--green); padding: 0 6px; border-radius: 999px; }
    .txt { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 13px; }
    .compose { display: grid; gap: 8px; margin-top: 8px; }
    .compose textarea { min-height: 70px; }
    .compose .btn { justify-self: end; }
    .compose-row { display: flex; justify-content: space-between; align-items: flex-end; gap: 10px; flex-wrap: wrap; }
    .detail { white-space: pre-wrap; font-size: 13px; background: var(--hover); border: 1px solid var(--line); border-radius: 8px; padding: 12px; }
</style>
