// Push to this device (3 Nov 2026): pop-ups even when the PMS is closed (desktop; Android; iPhone only as an installed app).
// The browser registers with Firebase Cloud Messaging and its token is saved in pushTokens/{token} with the person's uid.
// api/push.js sends to those tokens whenever a notification is written (sendPush below). The service worker
// (pwa/sw.template.js) shows the pop-up and opens the page on click.
// Needs the production build (the service worker) and VITE_FIREBASE_VAPID_KEY (public key, set on Vercel).
import { getMessaging, getToken, deleteToken, isSupported } from 'firebase/messaging';
import { doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { app, auth, db } from '@/lib/firebase.js';

const KEY = 'wb.pushToken';
const VAPID = import.meta.env.VITE_FIREBASE_VAPID_KEY || '';
const saved = () => { try { return localStorage.getItem(KEY) || ''; } catch (_) { return ''; } };
const remember = t => { try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch (_) {} };

// Why push can't work here, or '' when it can
export async function pushProblem() {
  if (!import.meta.env.PROD) return 'Push works on the Vercel site, not with npm run dev.';
  if (!VAPID) return 'Push is not set up yet (VITE_FIREBASE_VAPID_KEY is missing on Vercel).';
  if (!('serviceWorker' in navigator) || !(await isSupported().catch(() => false))) return 'This browser does not support push.';
  return '';
}
export const pushOn = () => !!saved();

async function register(role) {
  const reg = await navigator.serviceWorker.ready;
  const token = await getToken(getMessaging(app), { vapidKey: VAPID, serviceWorkerRegistration: reg });
  if (!token) throw new Error('No push token.');
  const old = saved();
  if (old && old !== token) await deleteDoc(doc(db, 'pushTokens', old)).catch(() => {});
  await setDoc(doc(db, 'pushTokens', token), { uid: auth.currentUser.uid, role: role || null,
    device: navigator.userAgent.slice(0, 200), updatedAt: serverTimestamp() });
  remember(token);
  return token;
}

// From the button (the browser asks for permission once). Returns '' when push is on, otherwise why not.
export async function turnOnPush(role) {
  const problem = await pushProblem();
  if (problem) return problem;
  if (Notification.permission === 'default') await Notification.requestPermission().catch(() => {});
  if (Notification.permission !== 'granted') return 'denied';
  try { await register(role); return ''; } catch (e) { console.warn('Push not turned on:', e); return 'Push could not be turned on: ' + (e.code || e.message); }
}

export async function turnOffPush() {
  const t = saved();
  remember('');
  if (t) await deleteDoc(doc(db, 'pushTokens', t)).catch(() => {});
  try { await deleteToken(getMessaging(app)); } catch (_) { /* already gone */ }
}

// On each app start: keep this device's token fresh (tokens can change) and its role up to date
export async function refreshPush(role) {
  if (!pushOn() || await pushProblem() || Notification.permission !== 'granted') return;
  try { await register(role); } catch (e) { console.warn('Push token not refreshed:', e.code || e.message); }
}

// Signing out: this device stops getting the person's pushes
export async function forgetDevice() {
  const t = saved();
  if (!t) return;
  remember('');
  await deleteDoc(doc(db, 'pushTokens', t)).catch(() => {});
}

// After a notification is written: ask api/push.js to deliver it. Best effort, never blocks or throws.
export function sendPush(notificationId) {
  if (!import.meta.env.PROD || !auth.currentUser) return;
  auth.currentUser.getIdToken().then(t => fetch('/api/push', { method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, body: JSON.stringify({ id: notificationId }) }))
    .then(r => { if (r && !r.ok && r.status !== 409) r.json().then(j => console.warn('Push not sent:', j.error)).catch(() => {}); })
    .catch(e => console.warn('Push not sent:', e.message));
}
