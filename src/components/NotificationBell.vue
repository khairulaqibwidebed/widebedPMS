<script setup>
// Bell in the top bar: the unread count, and a drop-down with the latest notifications (quick peek).
// Click one to open it (marks it read), "Mark all as read", or "See all" for the Notifications page.
// Phones: the panel fills the screen. One shared listener (composables/useNotifications.js).
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useNotifications } from '@/composables/useNotifications'
import { markNotificationAsRead, markAllNotificationsAsRead, clearNotification } from '@/services/notificationService'

const router = useRouter()
const { notifications, unreadCount, loading, error } = useNotifications()
const open = ref(false)
const actionError = ref('')
const PEEK = 10

const latest = computed(() => notifications.value.slice(0, PEEK))
const label = computed(() => (unreadCount.value > 0 ? `Notifications, ${unreadCount.value} unread` : 'Notifications'))

function ago(t) {
  if (!t?.toDate) return 'Just now'
  const d = t.toDate(), mins = Math.round((Date.now() - d.getTime()) / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins} min ago`
  if (mins < 24 * 60) return `${Math.round(mins / 60)} h ago`
  if (mins < 7 * 24 * 60) return `${Math.round(mins / 1440)} d ago`
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

async function openItem(n) {
  actionError.value = ''
  open.value = false
  if (!n.read) markNotificationAsRead(n.id).catch((e) => console.error(e))
  if (n.link) router.push(n.link)
}
async function readAll() {
  actionError.value = ''
  try { await markAllNotificationsAsRead(notifications.value) } catch (e) { console.error(e); actionError.value = 'Could not mark all as read.' }
}
// × on a row: personal ones are deleted, team ones hidden for you only (services/notificationService.js)
async function clearOne(n) {
  actionError.value = ''
  try { await clearNotification(n) } catch (e) { console.error(e); actionError.value = 'Could not clear it.' }
}
function seeAll() { open.value = false; router.push('/Notifications') }
</script>

<template>
  <div class="nb" v-click-outside="() => { open = false }" v-esc="() => { open = false }">
    <button type="button" class="notification-bell" :class="{ on: open }" :aria-label="label" :title="label" aria-haspopup="dialog" :aria-expanded="String(open)" @click="open = !open">
      <svg class="bell-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>
      <!-- Red badge with the number of unread notifications; hidden when there are none -->
      <span v-if="unreadCount > 0" class="notification-badge">{{ unreadCount > 99 ? '99+' : unreadCount }}</span>
      <!-- Small grey dot when the notifications could not be loaded -->
      <span v-else-if="error" class="notification-error-dot" aria-hidden="true"></span>
    </button>

    <div class="nb-panel" v-if="open" role="dialog" aria-label="Notifications">
      <div class="nb-head">
        <b>Notifications</b>
        <button type="button" class="nb-link" :disabled="!unreadCount" @click="readAll">Mark all as read</button>
        <button type="button" class="nb-close" aria-label="Close" @click="open = false">×</button>
      </div>
      <p class="nb-msg err" v-if="error || actionError">{{ error || actionError }}</p>
      <p class="nb-msg loading-line" v-else-if="loading">Loading…</p>
      <p class="nb-msg" v-else-if="!latest.length">No notifications yet.</p>
      <ul class="nb-list" v-else>
        <li v-for="n in latest" :key="n.id" class="nb-li">
          <button type="button" class="nb-item" :class="{ unread: !n.read }" @click="openItem(n)">
            <span class="nb-dot" aria-hidden="true"></span>
            <span class="nb-text">
              <span class="nb-title">{{ n.title }}</span>
              <span class="nb-body" v-if="n.message">{{ n.message }}</span>
              <span class="nb-when">{{ ago(n.createdAt) }}</span>
            </span>
          </button>
          <button type="button" class="nb-x" title="Clear" aria-label="Clear" @click.stop="clearOne(n)">×</button>
        </li>
      </ul>
      <button type="button" class="nb-all" @click="seeAll">See all notifications</button>
    </div>
  </div>
  <span v-if="error" class="sr-only">{{ error }}</span>
</template>

<style scoped>
.nb { position: relative; display: inline-flex; }
.notification-bell { position: relative; display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; border: 0; padding: 0;
  border-radius: 12px; background: none; color: inherit; cursor: pointer; transition: background 0.2s ease; }
.notification-bell:hover, .notification-bell.on { background: rgba(128, 128, 128, 0.12); }
.bell-icon { display: block; }
.notification-badge { position: absolute; top: 1px; right: 1px; min-width: 18px; height: 18px; padding: 0 5px; box-sizing: border-box; display: inline-flex;
  align-items: center; justify-content: center; border-radius: 999px; background: #d92d20; color: #fff; font-size: 11px; font-weight: 700; line-height: 1;
  box-shadow: 0 0 0 2px var(--surface, #fff); animation: badge-pulse 2s ease-out infinite; }
.notification-error-dot { position: absolute; top: 6px; right: 6px; width: 8px; height: 8px; border-radius: 50%; background: #98a2b3; }
@keyframes badge-pulse {
  0% { box-shadow: 0 0 0 2px var(--surface, #fff), 0 0 0 2px rgba(217, 45, 32, 0.5); }
  70% { box-shadow: 0 0 0 2px var(--surface, #fff), 0 0 0 8px rgba(217, 45, 32, 0); }
  100% { box-shadow: 0 0 0 2px var(--surface, #fff), 0 0 0 8px rgba(217, 45, 32, 0); }
}
@media (prefers-reduced-motion: reduce) { .notification-badge { animation: none; } }

.nb-panel { position: absolute; right: 0; top: calc(100% + 8px); z-index: 35; width: 380px; max-width: calc(100vw - 24px); display: flex; flex-direction: column;
  max-height: min(560px, 75vh); background: var(--surface); border: 1px solid var(--border); border-radius: 12px; box-shadow: 0 12px 36px rgba(0, 0, 0, .16); overflow: hidden; }
.nb-head { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-bottom: 1px solid var(--border); }
.nb-head b { font-size: 15px; margin-right: auto; }
.nb-link { border: 0; background: none; padding: 4px; color: var(--accent); font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
.nb-link:disabled { color: var(--muted); cursor: default; }
.nb-close { display: none; border: 0; background: none; font-size: 24px; line-height: 1; color: var(--muted); width: 36px; height: 36px; cursor: pointer; }
.nb-msg { margin: 0; padding: 18px 14px; color: var(--muted); font-size: 13px; }
.nb-msg.err { color: var(--red, #b42318); }
.nb-list { list-style: none; margin: 0; padding: 4px 0; overflow-y: auto; overscroll-behavior: contain; flex: 1 1 auto; }
.nb-li { position: relative; }
.nb-x { position: absolute; top: 6px; right: 6px; width: 28px; height: 28px; border: 0; border-radius: 6px; background: none; color: var(--muted); font-size: 18px; line-height: 1; cursor: pointer; opacity: 0; transition: opacity .15s; }
.nb-li:hover .nb-x, .nb-x:focus-visible { opacity: 1; }
.nb-x:hover { background: color-mix(in srgb, #d92d20 12%, transparent); color: #d92d20; }
@media (hover: none) { .nb-x { opacity: 1; } }
.nb-item { padding-right: 36px !important; }
.nb-item { display: flex; gap: 10px; width: 100%; padding: 10px 14px; border: 0; background: none; text-align: left; font: inherit; color: inherit; cursor: pointer; }
.nb-item:hover { background: var(--accent-soft); }
.nb-dot { flex: none; width: 8px; height: 8px; margin-top: 6px; border-radius: 50%; background: transparent; }
.nb-item.unread .nb-dot { background: var(--accent); }
.nb-text { display: grid; gap: 2px; min-width: 0; }
.nb-title { font-size: 13px; font-weight: 500; color: var(--text); overflow-wrap: anywhere; }
.nb-item.unread .nb-title { font-weight: 700; }
.nb-body { font-size: 12px; color: var(--text-2); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
.nb-when { font-size: 11px; color: var(--muted); }
.nb-all { border: 0; border-top: 1px solid var(--border); background: var(--surface); padding: 12px; font: inherit; font-size: 13px; font-weight: 600; color: var(--accent); cursor: pointer; }
.nb-all:hover { background: var(--accent-soft); }
/* Phones: the panel fills the screen */
@media (max-width: 600px) {
  .nb-panel { position: fixed; inset: 0; width: auto; max-width: none; max-height: none; border: 0; border-radius: 0; z-index: 50; }
  .nb-head { padding-top: max(12px, env(safe-area-inset-top, 0px)); }
  .nb-close { display: inline-block; }
  .nb-item { padding: 12px 16px; }
  .nb-all { padding-bottom: max(14px, env(safe-area-inset-bottom, 0px)); }
}
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
</style>
