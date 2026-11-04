<template>
  <section class="cc-chat">
    <div class="chat-head">
      <h3>{{ title }}</h3>
      <p class="help" v-if="hint">{{ hint }}</p>
    </div>
    <div class="notice error" v-show="err" style="margin:8px 12px 0">{{ err }}</div>
    <div class="chat-msgs" ref="list">
      <div class="loading-bar" v-show="loading"></div>
      <div class="msg" v-for="m in thread" :key="m.id || m.text" :class="m.by === side ? 'mine' : 'theirs'">
        <div class="who">{{ m.by === side ? 'You' : (labels[m.by] || 'Them') + (m.byName ? ' · ' + m.byName : '') }}<span v-if="m.closing" class="tag">Closing note</span><span class="when">{{ when(m.createdAt) }}</span></div>
        <div class="txt" v-if="m.text">{{ m.text }}</div>
        <PhotoThumbs :images="photosOf(m)" />
      </div>
      <p class="chat-empty" v-if="!loading && !thread.length">{{ empty }}</p>
    </div>
    <div class="chat-compose" v-if="canReply">
      <ChatCompose v-model="text" v-model:photos="photos" :busy="busy" :placeholder="placeholder" @send="send" />
    </div>
    <p class="chat-closed" v-else-if="closedText">{{ closedText }}</p>
  </section>
</template>

<script>
// The conversation panel of a complaint, like a messaging app: your messages on the right, theirs on the left, photos as
// thumbnails, newest kept in view, the WhatsApp-style bar at the bottom. Loads the thread and photos itself and passes
// the photos sent WITH the complaint up (@complaint-photos) for the details column.
//   <ComplaintChat :complaint="c" side="director" :labels="{ hr: 'HR', director: 'Director' }" title="Conversation with HR" @complaint-photos="p => pics = p" />
import { loadThread, loadImages, addReply } from '@/pages/HR/complaints.js';
import { friendlyError } from '@/lib/finance-data.js';
import { useSession } from '@/stores/session.js';
import PhotoThumbs from '@/components/PhotoThumbs.vue';
import ChatCompose from '@/components/ChatCompose.vue';

const me = useSession();

export default {
  components: { PhotoThumbs, ChatCompose },
  props: {
    complaint: { type: Object, required: true },
    side: { type: String, required: true },                    // who "you" are in thread.by: 'hr', 'sender' or 'director'
    labels: { type: Object, default: () => ({}) },              // names for the other side, e.g. { hr: 'HR', director: 'Director' }
    title: { type: String, default: 'Conversation' }, hint: { type: String, default: '' },
    placeholder: { type: String, default: 'Type a message' }, empty: { type: String, default: 'No replies yet.' },
    canReply: { type: Boolean, default: true }, closedText: { type: String, default: '' }
  },
  emits: ['complaint-photos'],
  data() { return { thread: [], images: [], loading: true, err: '', text: '', photos: [], busy: false }; },
  watch: { 'thread.length'() { this.$nextTick(() => { const el = this.$refs.list; if (el) el.scrollTop = el.scrollHeight; }); } },
  async mounted() {
    const c = this.complaint;
    try {
      const [t, im] = await Promise.all([loadThread(c.id), loadImages(c.id)]);
      this.thread = t; this.images = im;
      this.$emit('complaint-photos', im.filter(i => i.scope === 'complaint'));
    } catch (e) { this.err = friendlyError(e, 'load the conversation'); }
    this.loading = false;
  },
  methods: {
    when(t) { return t?.toDate ? t.toDate().toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Just now'; },
    photosOf(m) { return m.images || this.images.filter(i => (m.imageIds || []).includes(i.id)); },
    async send() {
      if (this.busy || (!this.text.trim() && !this.photos.length)) return;
      this.busy = true; this.err = '';
      try { this.thread.push(await addReply(me, this.complaint, this.text, this.side, this.photos)); this.text = ''; this.photos = []; }
      catch (e) { this.err = e.code ? friendlyError(e, 'send the reply') : e.message; }
      this.busy = false;
    }
  }
};
</script>

<style scoped>
.cc-chat { min-height: 0; display: flex; flex-direction: column; border: 1px solid var(--border); border-radius: 12px; background: var(--bg); overflow: hidden; }
.chat-head { padding: 12px 14px 8px; background: var(--surface); border-bottom: 1px solid var(--border); }
.chat-head h3 { font-size: 14px; margin: 0 0 2px; }
.chat-head .help { margin: 0; font-size: 12px; }
.chat-msgs { flex: 1 1 auto; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding: 14px; }
.msg { padding: 10px 12px; border-radius: 10px; border: 1px solid var(--line); max-width: 82%; }
.msg.mine { align-self: flex-end; background: var(--accent-soft); }
.msg.theirs { align-self: flex-start; background: var(--surface); }
.who { font-size: 11px; font-weight: 600; color: var(--text-2); display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 3px; }
.when { color: var(--muted); font-weight: 400; }
.tag { background: var(--green-soft); color: var(--green); padding: 0 6px; border-radius: 999px; }
.txt { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 13px; }
.chat-empty { margin: auto; color: var(--muted); font-size: 13px; text-align: center; }
.chat-compose { padding: 10px 12px 12px; background: var(--surface); border-top: 1px solid var(--border); }
.chat-closed { margin: 0; padding: 12px 14px; background: var(--surface); border-top: 1px solid var(--border); color: var(--muted); font-size: 13px; }
@media (max-width: 860px) { .cc-chat { min-height: 420px; } .chat-msgs { max-height: 60vh; } }
</style>
