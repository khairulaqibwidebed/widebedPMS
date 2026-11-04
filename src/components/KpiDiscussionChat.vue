<template>
  <section class="kchat">
    <header class="kchat-head">
      <div class="kchat-avatar">{{ initials(otherName) }}<span class="kchat-online"></span></div>
      <div class="kchat-head-text">
        <div class="kchat-title">{{ title }}</div>
        <div class="kchat-sub" v-if="subtitle">{{ subtitle }}</div>
      </div>
      <span class="kchat-badge">Discussion open</span>
    </header>

    <div class="kchat-list" ref="listEl">
      <p class="kchat-empty" v-if="conv === undefined">Loading discussion…</p>
      <p class="kchat-empty" v-else-if="conv === null">{{ loadError || 'The chat for this KPI hasn\'t been started yet.' }}</p>
      <template v-else>
        <p class="kchat-empty" v-if="!messages.length">No messages yet.</p>
        <template v-for="(m, i) in messages" :key="m.id || i">
          <div class="kchat-day" v-if="showDay(i)"><span>{{ dayLabel(m.at) }}</span></div>
          <div v-if="isSystem(m)" class="kchat-system">{{ systemText(m) }}</div>
          <div v-else class="kchat-msg" :class="{ mine: isMine(m) }">
            <div class="kchat-meta"><b>{{ senderLabel(m) }}</b><span>{{ timeOf(m) }}</span></div>
            <div class="kchat-bubble" :class="{ deleted: m.deleted }">{{ m.deleted ? 'Message deleted' : m.message }}</div>
          </div>
        </template>
      </template>
    </div>

    <p class="kchat-error" v-if="sendError">{{ sendError }}</p>
    <form class="kchat-input" @submit.prevent="send">
      <input v-model="draft" :placeholder="placeholder || `Write a message to ${otherName}…`" :disabled="!conv || sending" aria-label="Message">
      <button type="submit" class="kchat-send" :disabled="!conv || sending || !draft.trim()">
        Send
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/></svg>
      </button>
    </form>
  </section>
</template>

<script setup>
// KPI discussion chat — shown only while a KPI is in discussion (Director sent it back or reopened it).
// Reads/writes the existing kpiConversations/{assignmentId} doc that sendBackForDiscussion() and
// reopenAndSendBack() in lib/performance/kpi.js already create, and listens live so new messages appear
// without a page reload.
import { ref, computed, watch, nextTick, onUnmounted } from 'vue';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase.js';
import { useSession } from '@/stores/session.js';
import { addChatMessage, markConversationAsRead } from '@/lib/performance/kpi.js';

const props = defineProps({
  assignmentId: { type: String, required: true },
  title: { type: String, default: 'Director Discussion' },
  subtitle: { type: String, default: '' },
  otherName: { type: String, default: 'Director' },
  placeholder: { type: String, default: '' }
});

const session = useSession();
const conv = ref(undefined); // undefined = loading, null = no conversation doc yet
const loadError = ref('');
const sendError = ref('');
const draft = ref('');
const sending = ref(false);
const listEl = ref(null);
let unsub = null;

function subscribe(id) {
  unsub?.();
  conv.value = undefined; loadError.value = '';
  unsub = onSnapshot(doc(db, 'kpiConversations', id), snap => {
    conv.value = snap.exists() ? { id: snap.id, ...snap.data() } : null;
    if (conv.value?.unreadBy?.includes(session.user.uid)) {
      markConversationAsRead(id, session.user.uid).catch(e => console.warn('kpi chat read', e));
    }
    scrollToEnd();
  }, e => {
    console.warn('kpi chat', e);
    conv.value = null; loadError.value = 'Could not load the discussion.';
  });
}
watch(() => props.assignmentId, subscribe, { immediate: true });
onUnmounted(() => unsub?.());

const messages = computed(() => conv.value?.messages || []);

async function scrollToEnd() {
  await nextTick();
  if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight;
}

const initials = name => (name || '?').split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?';
const isMine = m => m.byUid === session.user.uid;
const isSystem = m => m.type && m.type !== 'message';
const senderLabel = m => isMine(m) ? 'You' : (m.role === 'director' ? 'Director' : (m.by || props.otherName));
const timeOf = m => m.at ? new Date(m.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';

function systemText(m) {
  const r = m.directorRating ?? m.rating;
  if (m.type === 'rating_proposed') return `Supervisor proposed a rating of ${r}/5 and asked to discuss.`;
  if (m.type === 'reopened') return `KPI reopened for discussion — proposed rating ${r}/5.`;
  if (m.type === 'rating_approved') return `Final rating approved: ${r}/5.`;
  return m.message || '';
}

const dayKey = at => new Date(at).toDateString();
function dayLabel(at) {
  if (!at) return '';
  const d = new Date(at), today = new Date(), yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
const showDay = i => i === 0 || dayKey(messages.value[i].at) !== dayKey(messages.value[i - 1].at);

async function send() {
  const text = draft.value.trim();
  if (!text || sending.value || !conv.value) return;
  sending.value = true; sendError.value = '';
  try {
    await addChatMessage(props.assignmentId, text);
    draft.value = '';
  } catch (e) { sendError.value = e.message; } finally { sending.value = false; }
}
</script>

<style scoped>
/* Uses the app's theme variables throughout, so it follows light/dark mode like the rest of the KPI page. */
.kchat { display: flex; flex-direction: column; min-height: 0; height: 100%; }

.kchat-head { display: flex; align-items: center; gap: 10px; padding-bottom: 12px; border-bottom: 1px solid var(--border); }
.kchat-avatar {
  position: relative; width: 34px; height: 34px; border-radius: 50%; flex-shrink: 0;
  background: var(--text); color: var(--surface); display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700;
}
.kchat-online { position: absolute; right: -1px; bottom: -1px; width: 9px; height: 9px; border-radius: 50%; background: var(--green); border: 2px solid var(--surface); }
.kchat-head-text { flex: 1; min-width: 0; }
.kchat-title { font-weight: 600; font-size: 14px; color: var(--text); }
.kchat-sub { font-size: 11px; color: var(--text-2); }
.kchat-badge { font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 6px; background: var(--amber-soft); color: var(--amber); white-space: nowrap; }

.kchat-list { flex: 1; overflow-y: auto; min-height: 220px; max-height: 380px; padding: 14px 2px; display: flex; flex-direction: column; gap: 12px; }
.kchat-empty { margin: auto; color: var(--text-2); font-size: 13px; text-align: center; }

.kchat-day { display: flex; justify-content: center; }
.kchat-day span { font-size: 10px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--text-2); background: var(--chip); padding: 3px 10px; border-radius: 999px; }
.kchat-system { align-self: center; max-width: 90%; text-align: center; font-size: 12px; color: var(--text-2); background: var(--chip); padding: 6px 12px; border-radius: 10px; }

.kchat-msg { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
.kchat-msg.mine { align-items: flex-end; }
.kchat-meta { display: flex; gap: 6px; align-items: baseline; font-size: 11px; color: var(--text-2); }
.kchat-meta b { color: var(--text); font-weight: 600; }
.kchat-msg.mine .kchat-meta { flex-direction: row-reverse; }
.kchat-bubble {
  max-width: 88%; padding: 10px 14px; font-size: 13.5px; line-height: 1.45; white-space: pre-wrap; word-wrap: break-word;
  background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: 14px 14px 14px 4px;
}
.kchat-msg.mine .kchat-bubble { background: var(--accent); color: #fff; border-color: var(--accent); border-radius: 14px 14px 4px 14px; }
.kchat-bubble.deleted { font-style: italic; opacity: .6; }

.kchat-error { color: var(--red); font-size: 12px; margin: 0 0 6px; }
.kchat-input { display: flex; gap: 8px; padding-top: 12px; border-top: 1px solid var(--border); }
.kchat-input input {
  flex: 1; min-width: 0; height: 40px; padding: 0 14px; font-size: 13px; font-family: inherit;
  background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: 10px;
}
.kchat-input input:focus { outline: none; border-color: var(--accent); }
.kchat-send {
  display: inline-flex; align-items: center; gap: 6px; height: 40px; padding: 0 16px; border: none; border-radius: 10px;
  background: var(--text); color: var(--surface); font-size: 13px; font-weight: 700; cursor: pointer;
}
.kchat-send:disabled { opacity: .45; cursor: not-allowed; }
.kchat-send svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
</style>