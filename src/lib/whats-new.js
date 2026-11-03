// What's New: the orange dot on the sidebar link. "Seen" is remembered in this browser only.
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { reactive } from 'vue';
import { db } from './firebase.js';

const KEY = 'wb.updatesSeenAt';
export const whatsNew = reactive({ unread: false });

export function updatesSeenAt() { try { return +localStorage.getItem(KEY) || 0; } catch { return 0; } }

// Called by the What's New page with the newest update it showed.
export function markUpdatesSeen(latest) {
  const t = Math.max(Date.now(), latest?.createdAt?.toMillis ? latest.createdAt.toMillis() : 0);
  try { localStorage.setItem(KEY, String(t)); } catch { /* private window: the dot just comes back */ }
  whatsNew.unread = false;
}

// One read on app load: is there an update newer than the last visit?
export async function checkWhatsNew() {
  try {
    const snap = await getDocs(query(collection(db, 'updates'), orderBy('createdAt', 'desc'), limit(1)));
    const t = snap.docs[0]?.data().createdAt?.toMillis?.() || 0;
    whatsNew.unread = t > updatesSeenAt();
  } catch { whatsNew.unread = false; }
}
