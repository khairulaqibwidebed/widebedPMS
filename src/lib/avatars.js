// Profile pictures. Each person's picture is one small document, avatars/{uid} = { src, updatedAt }: a data URL
// cropped to a 128 px square in the browser (file storage needs the paid plan), kept under 40 KB.
// Anyone signed in reads; only the person themself saves or removes their own.
// No picture = the first letter of their name on a circle in their role colour.
import { reactive } from 'vue';
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db, ROLE_LABEL } from './firebase.js';

// Role colours (also used by the role badges). Solid enough for a white letter in light and dark mode.
export const ROLE_COLOR = {
  director: '#E0603F', finance: '#2F86D6', operations: '#C98A12', it: '#7E5BD6',
  hr: '#1C9A8F', procurement: '#3E9B5A', marketing: '#D6457E'
};
export const roleColor = role => ROLE_COLOR[roleKey(role)] || '#7A8190';
// Accepts a role key ('finance') or the label stored on older records ('Finance').
export function roleKey(r) {
  if (!r) return null;
  if (ROLE_COLOR[r]) return r;
  return Object.keys(ROLE_LABEL).find(k => ROLE_LABEL[k] === r) || String(r).toLowerCase();
}
// Inline style for a role badge or tag in that role's colour (see .role-tint in app.css).
export const roleTint = role => ({ '--rc': roleColor(role) });
export const initialOf = name => (String(name || '').trim().match(/[\p{L}\p{N}]/u) || ['?'])[0].toUpperCase();

export const SIDE = 128, MAX_OUT = 40 * 1024;
const pics = reactive({});        // uid -> data URL, or null when they have none
const asked = {};                 // uid -> pending read, so each picture is read once per visit

export function avatarSrc(uid) {
  if (!uid) return null;
  if (!(uid in asked)) {
    asked[uid] = getDoc(doc(db, 'avatars', uid))
      .then(d => { pics[uid] = d.exists() ? (d.data().src || null) : null; })
      .catch(() => { pics[uid] = null; });
  }
  return pics[uid] ?? null;
}

// Crops the middle square, draws it at 128 px and returns the smaller of WebP and JPEG.
export function squareShrink(img) {
  const w = img.naturalWidth, h = img.naturalHeight, s = Math.min(w, h);
  const c = document.createElement('canvas'); c.width = c.height = SIDE;
  const g = c.getContext('2d');
  g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, SIDE, SIDE);
  g.drawImage(img, (w - s) / 2, (h - s) / 2, s, s, 0, 0, SIDE, SIDE);
  const webp = c.toDataURL('image/webp', 0.85), jpg = c.toDataURL('image/jpeg', 0.85);
  return webp.startsWith('data:image/webp') && webp.length < jpg.length ? webp : jpg;
}

export async function saveMyAvatar(uid, src) {
  await setDoc(doc(db, 'avatars', uid), { src, updatedAt: serverTimestamp() });
  pics[uid] = src; asked[uid] = Promise.resolve();
}
export async function removeMyAvatar(uid) {
  await deleteDoc(doc(db, 'avatars', uid));
  pics[uid] = null; asked[uid] = Promise.resolve();
}
