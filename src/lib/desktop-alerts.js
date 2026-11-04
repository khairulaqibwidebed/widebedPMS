// Two kinds, one switch on the Notifications page:
//   push (lib/push.js): pop-ups even when the PMS is closed. Used on the Vercel site once VITE_FIREBASE_VAPID_KEY is set.
//   page alerts (this file): pop-ups only while the PMS is open. Used where push can't work (npm run dev, no key yet).
// Desktop alerts (3 Nov 2026): a Windows / macOS pop-up for each new notification while the PMS is open in a tab or
// window (minimised or behind other windows is fine). No server: the live listener (composables/useNotifications.js)
// already sees new notifications and passes them here. Fully closed = no pop-up (that needs push messaging, later).
// Turned on per browser with a button on the Notifications page (the browser asks for permission once).
// Only shown when you're not looking at the PMS: if its tab is in front, the bell already shows it.
import { reactive } from 'vue';
import { router } from '@/router.js';
import { markNotificationAsRead } from '@/services/notificationService';
import { pushOn, pushProblem, turnOnPush, turnOffPush } from '@/lib/push.js';

const KEY = 'wb.desktopAlerts';
const supported = typeof window !== 'undefined' && 'Notification' in window;
const readPref = () => { try { return localStorage.getItem(KEY) === '1'; } catch (_) { return false; } };

export const alerts = reactive({
  supported,
  permission: supported ? Notification.permission : 'denied',   // default / granted / denied
  on: supported && (pushOn() || readPref()) && Notification.permission === 'granted',
  mode: pushOn() ? 'push' : 'page'      // which kind is on
});

function save(v) { try { localStorage.setItem(KEY, v ? '1' : '0'); } catch (_) {} }

// From a button press (browsers only ask from a click). Push when it can work here, otherwise page alerts.
// Returns true when on.
export async function turnOnAlerts(role) {
  if (!supported) return false;
  if (!(await pushProblem())) {
    const why = await turnOnPush(role);
    alerts.permission = Notification.permission;
    if (!why) {
      alerts.on = true; alerts.mode = 'push'; save(false);
      show({ id: 'wb-test', title: 'Push notifications are on', message: 'New PMS notifications will pop up on this device, even when the PMS is closed.' }, false);
      return true;
    }
    if (why === 'denied') { alerts.on = false; return false; }
    console.warn(why);   // push failed: fall back to page alerts below
  }
  if (Notification.permission === 'default') {
    try { alerts.permission = await Notification.requestPermission(); } catch (_) { alerts.permission = Notification.permission; }
  }
  alerts.permission = Notification.permission;
  alerts.on = alerts.permission === 'granted';
  alerts.mode = 'page';
  save(alerts.on);
  if (alerts.on) show({ id: 'wb-test', title: 'Desktop alerts are on', message: 'New PMS notifications will pop up here while the PMS is open.' }, false);
  return alerts.on;
}
export async function turnOffAlerts() { alerts.on = false; save(false); if (alerts.mode === 'push') await turnOffPush(); alerts.mode = 'page'; }

const since = Date.now();          // nothing from before this tab opened pops up
const shown = new Set();
const ms = t => (t?.toMillis ? t.toMillis() : 0);

// Called with the full list on every change; pops up the ones that are new, unread and arrived after the tab opened.
export function alertNew(list) {
  if (!alerts.on || alerts.mode === 'push' || Notification.permission !== 'granted') return;   // push shows its own
  const looking = document.visibilityState === 'visible' && document.hasFocus();
  for (const n of list) {
    if (n.read || shown.has(n.id) || ms(n.createdAt) < since) continue;
    shown.add(n.id);
    if (!looking) show(n, true);
  }
}

function show(n, clickable) {
  try {
    // tag = the notification id, so two open PMS tabs show it once
    const pop = new Notification(n.title || 'Widebed PMS', { body: n.message || '', tag: n.id, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png' });
    pop.onclick = () => {
      window.focus();
      pop.close();
      if (!clickable) return;
      if (!n.read) markNotificationAsRead(n.id).catch(() => {});
      if (n.link) router.push(n.link);
    };
  } catch (e) { console.warn('Desktop alert not shown:', e.message); }   // e.g. phones, which need push messaging instead
}
