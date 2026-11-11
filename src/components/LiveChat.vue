<template>
  <section class="lc" :class="{ bare }">
    <!-- Header strip with a round avatar and a badge (KPI), or the plain title + hint head (complaints) -->
    <header class="lc-strip" v-if="headAvatar || badge">
      <div class="lc-havatar" v-if="headAvatar">{{ initials(headAvatar) }}<span class="lc-online"></span></div>
      <div class="lc-htext">
        <div class="lc-title">{{ title }}</div>
        <div class="lc-sub" v-if="subtitle">{{ subtitle }}</div>
      </div>
      <span class="lc-badge" v-if="badge">{{ badge }}</span>
    </header>
    <div class="lc-head" v-else>
      <h3>{{ title }}</h3>
      <p class="help" v-if="subtitle || hint">{{ subtitle || hint }}</p>
    </div>
    <p class="help lc-hint" v-if="(headAvatar || badge) && hint">{{ hint }}</p>
    <div class="notice error" v-show="err" style="margin:8px 12px 0">{{ err }}</div>

    <div class="lc-body">
      <div class="lc-msgs" :class="listClass" ref="list" @scroll="onScroll">
        <div class="loading-bar" v-show="loading"></div>
        <template v-for="(m, i) in messages" :key="m.id || i">
          <div class="lc-day" v-if="showDay(i)"><span>{{ dayLabel(m.at) }}</span></div>
          <div class="lc-system" v-if="m.system">{{ m.text }}</div>
          <div class="msg-row" v-else :class="m.mine ? 'mine' : 'theirs'">
            <Avatar class="msg-av" :anonymous="!m.mine && anonymousOther" :uid="m.byUid" :name="m.byName || m.label" :role="m.role" :size="30" />
            <div class="msg" :class="m.mine ? 'mine' : 'theirs'">
              <div class="who">{{ who(m) }}<span v-if="m.tag" class="tag">{{ m.tag }}</span><span class="when">{{ timeOf(m.at) }}</span></div>
              <div class="txt deleted" v-if="m.deleted">Message deleted</div>
              <div class="txt" v-else-if="m.text">{{ m.text }}</div>
              <PhotoThumbs v-if="photos && m.images && m.images.length" :images="m.images" />
            </div>
          </div>
        </template>
        <p class="lc-empty" v-if="!loading && !messages.length">{{ empty }}</p>
      </div>
      <button type="button" class="lc-new" v-if="newBelow" @click="toBottom()">New message ↓</button>
    </div>

    <div class="lc-compose" v-if="canReply">
      <ChatCompose v-model="text" v-model:photos="pics" :allow-photos="photos" :busy="busy || loading" :placeholder="placeholder" @send="send" />
    </div>
    <p class="lc-closed" v-else-if="closedText">{{ closedText }}</p>
  </section>
</template>

<script>
// The one chat for every page (6 Nov 2026), WhatsApp style: yours on the right, theirs on the left, day separators,
// grey system lines, optional photos, the message bar at the bottom. Where the messages come from is a "source"
// from lib/chat-sources.js (complaintSource, kpiSource); a new kind of chat only needs a new source.
//   <LiveChat :source="src" title="Conversation with HR" hint="..." placeholder="Reply to HR" photos @extra="x => pics = x" />
// It re-subscribes when source.key changes and stops listening when it closes.
import ChatCompose from '@/components/ChatCompose.vue';
import PhotoThumbs from '@/components/PhotoThumbs.vue';
import Avatar from '@/components/Avatar.vue';
import { friendlyError } from '@/lib/finance-data.js';

const NEAR = 80;   // px from the bottom that still counts as "at the newest"

export default {
  components: { ChatCompose, PhotoThumbs, Avatar },
  props: {
    source: { type: Object, required: true },
    title: { type: String, default: 'Conversation' }, subtitle: { type: String, default: '' }, hint: { type: String, default: '' },
    badge: { type: String, default: '' }, headAvatar: { type: String, default: '' },
    placeholder: { type: String, default: 'Type a message' }, empty: { type: String, default: 'No messages yet.' },
    canReply: { type: Boolean, default: true }, closedText: { type: String, default: '' },
    photos: { type: Boolean, default: false },            // paperclip and photo thumbnails
    anonymousOther: { type: Boolean, default: false },    // the other side's avatar shows as anonymous
    bare: { type: Boolean, default: false },              // no border or background (the page draws the box, as on KPI)
    listClass: { type: String, default: '' }              // extra class on the message list, for the page's own heights
  },
  emits: ['extra'],
  data() { return { messages: [], loading: true, err: '', text: '', pics: [], busy: false, newBelow: false }; },
  watch: { 'source.key'() { this.subscribe(); } },
  mounted() { this.subscribe(); },
  beforeUnmount() { this.stopSource?.(); },
  methods: {
    subscribe() {
      this.stopSource?.();
      this.messages = []; this.loading = true; this.err = ''; this.newBelow = false;
      let first = true;
      this.stopSource = this.source.watch(({ messages, extra }) => {
        const el = this.$refs.list;
        const wasNear = !el || el.scrollHeight - el.scrollTop - el.clientHeight < NEAR;
        const grew = messages.length > this.messages.length, lastMine = messages[messages.length - 1]?.mine;
        this.messages = messages; this.loading = false;
        if (extra !== undefined) this.$emit('extra', extra);
        // On open go to the newest; later only follow if you were already at the bottom (or it is your own message)
        if (first || (grew && (wasNear || lastMine))) this.$nextTick(() => this.toBottom());
        else if (grew) this.newBelow = true;
        first = false;
      }, e => { this.err = e.friendly || friendlyError(e, 'load the conversation'); this.loading = false; });
    },
    toBottom() { const el = this.$refs.list; if (el) el.scrollTop = el.scrollHeight; this.newBelow = false; },
    onScroll() { const el = this.$refs.list; if (this.newBelow && el && el.scrollHeight - el.scrollTop - el.clientHeight < NEAR) this.newBelow = false; },
    who(m) { return m.mine ? 'You' : m.label + (m.byName && m.byName !== m.label ? ' · ' + m.byName : ''); },
    timeOf(d) { return d ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : 'Just now'; },
    initials(name) { return (name || '?').split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?'; },
    dayLabel(d) {
      if (!d) return 'Today';
      const today = new Date(), y = new Date(); y.setDate(today.getDate() - 1);
      if (d.toDateString() === today.toDateString()) return 'Today';
      if (d.toDateString() === y.toDateString()) return 'Yesterday';
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    },
    showDay(i) {
      const day = m => (m.at || new Date()).toDateString();
      return i === 0 || day(this.messages[i]) !== day(this.messages[i - 1]);
    },
    async send() {
      if (this.busy || (!this.text.trim() && !this.pics.length)) return;
      this.busy = true; this.err = '';
      try { await this.source.send(this.text, this.photos ? this.pics : []); this.text = ''; this.pics = []; }   // the listener adds it
      catch (e) { this.err = e.code ? friendlyError(e, 'send the message') : e.message; }
      this.busy = false;
    }
  }
};
</script>

<style scoped>
.lc { min-height: 0; display: flex; flex-direction: column; border: 1px solid var(--border); border-radius: 12px; background: var(--bg); overflow: hidden; }
.lc.bare { border: 0; border-radius: 0; background: none; height: 100%; }
.lc-head { padding: 12px 14px 8px; background: var(--surface); border-bottom: 1px solid var(--border); }
.lc-head h3 { font-size: 14px; margin: 0 0 2px; }
.lc-head .help { margin: 0; font-size: 12px; }
.lc-hint { margin: 6px 14px 0; font-size: 12px; }
.lc.bare .lc-hint { margin: 6px 0 0; }

/* Header strip (KPI): round avatar with a green dot, title, subtitle, badge */
.lc-strip { display: flex; align-items: center; gap: 10px; padding: 12px 14px; background: var(--surface); border-bottom: 1px solid var(--border); }
.lc.bare .lc-strip { padding: 0 0 12px; background: none; }
.lc-havatar { position: relative; width: 34px; height: 34px; border-radius: 50%; flex-shrink: 0; background: var(--text); color: var(--surface);
  display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; }
.lc-online { position: absolute; right: -1px; bottom: -1px; width: 9px; height: 9px; border-radius: 50%; background: var(--green); border: 2px solid var(--surface); }
.lc-htext { flex: 1; min-width: 0; }
.lc-title { font-weight: 600; font-size: 14px; color: var(--text); }
.lc-sub { font-size: 11px; color: var(--text-2); }
.lc-badge { font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 6px; background: var(--amber-soft); color: var(--amber); white-space: nowrap; }

.lc-body { position: relative; flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.lc-msgs { flex: 1 1 auto; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding: 14px; }
.lc.bare .lc-msgs { padding: 14px 2px; }
.lc-empty { margin: auto; color: var(--muted); font-size: 13px; text-align: center; }
.lc-day { display: flex; justify-content: center; }
.lc-day span { font-size: 10px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--text-2); background: var(--chip); padding: 3px 10px; border-radius: 999px; }
.lc-system { align-self: center; max-width: 90%; text-align: center; font-size: 12px; color: var(--text-2); background: var(--chip); padding: 6px 12px; border-radius: 10px; }
.lc-new { position: absolute; left: 50%; bottom: 10px; transform: translateX(-50%); border: 1px solid var(--border); background: var(--surface); color: var(--text);
  font-size: 12px; font-weight: 600; padding: 5px 12px; border-radius: 999px; cursor: pointer; box-shadow: 0 2px 8px rgba(0, 0, 0, .12); }

.msg-row { display: flex; align-items: flex-end; gap: 8px; max-width: 88%; }
.msg-row.mine { align-self: flex-end; flex-direction: row-reverse; }
.msg-row.theirs { align-self: flex-start; }
.msg-av { margin-bottom: 2px; flex-shrink: 0; }
.msg { padding: 10px 12px; border-radius: 10px; border: 1px solid var(--line); min-width: 0; }
.msg.mine { background: var(--accent-soft); }
.msg.theirs { background: var(--surface); }
.who { font-size: 11px; font-weight: 600; color: var(--text-2); display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 3px; }
.when { color: var(--muted); font-weight: 400; }
.tag { background: var(--green-soft); color: var(--green); padding: 0 6px; border-radius: 999px; }
.txt { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 13px; color: var(--text); }
.txt.deleted { font-style: italic; opacity: .6; }

.lc-compose { padding: 10px 12px 12px; background: var(--surface); border-top: 1px solid var(--border); }
.lc.bare .lc-compose { padding: 12px 0 0; background: none; }
.lc-closed { margin: 0; padding: 12px 14px; background: var(--surface); border-top: 1px solid var(--border); color: var(--muted); font-size: 13px; }
.lc.bare .lc-closed { padding: 12px 0 0; background: none; }
@media (max-width: 860px) { .lc:not(.bare) { min-height: 420px; } .lc:not(.bare) .lc-msgs { max-height: 60vh; } }
</style>
