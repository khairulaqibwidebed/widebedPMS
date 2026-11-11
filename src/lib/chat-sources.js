// Chat sources (6 Nov 2026): one small adapter per kind of chat, so components/LiveChat.vue can draw any of them.
// Each factory returns { key, watch(onUpdate, onError) -> stop, send(text, photos) -> Promise }.
// onUpdate gets { messages, extra }; every message is turned into the same shape LiveChat draws:
//   { id, text, mine, system, byUid, byName, label, role, at (Date or null), tag, deleted, images: [] }
// A new kind of chat = one new source here. Data stays where it is.
import { doc } from 'firebase/firestore';
import { db } from '@/lib/firebase.js';
import { listen } from '@/lib/use-live.js';
import { useSession } from '@/stores/session.js';
import { watchConversation, addReply } from '@/pages/HR/complaints.js';
import { addChatMessage, markConversationAsRead } from '@/lib/performance/kpi.js';

const asDate = t => (t?.toDate ? t.toDate() : t instanceof Date ? t : typeof t === 'number' ? new Date(t) : null);

// Complaints: complaints/{id}/thread and /images. side = who "you" are in thread.by ('hr', 'sender' or 'director');
// labels = names per side, e.g. { hr: 'HR', director: 'Director' }. extra = photos sent WITH the complaint.
export function complaintSource(complaint, side, labels = {}) {
  const me = useSession();
  return {
    key: `complaint:${complaint.id}:${side}`,
    watch(onUpdate, onError) {
      let thread = null, images = [];
      const toMsg = m => ({
        // mine = written by THIS person (6 Nov 2026: another Director on the same side shows on the left with their name);
        // old messages with no byUid fall back to the side
        id: m.id, text: m.text || '', mine: m.byUid ? m.byUid === me.user?.uid : m.by === side, system: false,
        byUid: m.byUid || null, byName: m.byName || '', label: labels[m.by] || 'Them',
        role: m.by === 'hr' ? 'hr' : m.by === 'director' ? 'director' : null,
        at: asDate(m.createdAt), tag: m.closing ? 'Closing note' : '', deleted: false,
        images: m.images || images.filter(i => (m.imageIds || []).includes(i.id))
      });
      const push = () => thread && onUpdate({ messages: thread.map(toMsg), extra: images.filter(i => i.scope === 'complaint') });
      return watchConversation(complaint.id, ch => {
        if (ch.thread) thread = ch.thread;
        if (ch.images) images = ch.images;
        push();   // waits for the thread, then again whenever either changes
      }, onError);
    },
    send: (text, photos = []) => addReply(me, complaint, text, side, photos)
  };
}

// KPI discussion: kpiConversations/{assignmentId}.messages (one document). No document yet -> extra.missing.
export function kpiSource(assignmentId, otherName = 'Director') {
  const me = useSession();
  return {
    key: `kpi:${assignmentId}`,
    watch(onUpdate, onError) {
      return listen(doc(db, 'kpiConversations', assignmentId), conv => {
        if (!conv) return onUpdate({ messages: [], extra: { missing: true } });
        const uid = me.user?.uid;
        if (uid && conv.unreadBy?.includes(uid)) markConversationAsRead(assignmentId, uid).catch(e => console.warn('kpi chat read', e));
        const messages = (conv.messages || []).map((m, i) => {
          const system = !!m.type && m.type !== 'message';
          return {
            id: m.id || `m${i}`, text: system ? systemText(m) : m.message || '', mine: !system && m.byUid === uid, system,
            byUid: m.byUid || null, byName: m.by || '', label: m.role === 'director' ? 'Director' : (m.by || otherName),
            role: m.role === 'director' ? 'director' : null, at: asDate(m.at), tag: '', deleted: !!m.deleted, images: []
          };
        });
        onUpdate({ messages, extra: { missing: false } });
      }, { onError });
    },
    send: text => addChatMessage(assignmentId, text)
  };
}

// The grey centred lines in the KPI chat
function systemText(m) {
  const r = m.directorRating ?? m.rating;
  if (m.type === 'rating_proposed') return `Supervisor proposed a rating of ${r}/5 and asked to discuss.`;
  if (m.type === 'reopened') return `KPI reopened for discussion — proposed rating ${r}/5.`;
  if (m.type === 'rating_approved') return `Final rating approved: ${r}/5.`;
  return m.message || '';
}
