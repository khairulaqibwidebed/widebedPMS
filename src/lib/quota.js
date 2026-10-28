// Detects Firestore's free daily limit. Firestore answers every request with the error code 'resource-exhausted' once
// the day's 50,000 reads (or 20,000 writes) are used. The browser can't ask how many reads are left, but it can notice
// that error and show a banner (AppShell) instead of pages that quietly fail.
import { reactive } from 'vue';

export const quota = reactive({ hit: false, hiddenAt: 0 });

// The free quota resets at midnight Pacific time. This is that moment in the viewer's own clock.
export function resetTime() {
  const now = new Date();
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' })
    .formatToParts(now).filter(x => x.type !== 'literal').map(x => [x.type, Number(x.value)]));
  const msLeft = ((24 - p.hour) * 3600 - p.minute * 60 - p.second) * 1000;
  return new Date(now.getTime() + msLeft).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// Call with any error. Returns true when it was the daily limit.
export function noteQuotaError(e) {
  const hit = e?.code === 'resource-exhausted' || /quota exceeded|resource.exhausted/i.test(String(e?.message || ''));
  if (hit) { quota.hit = true; quota.hiddenAt = 0; }
  return hit;
}

// Catches the errors nobody wrote a catch for (live listeners such as the bell, background reads).
export function watchQuota() {
  window.addEventListener('unhandledrejection', e => noteQuotaError(e.reason));
  window.addEventListener('error', e => noteQuotaError(e.error));
}
