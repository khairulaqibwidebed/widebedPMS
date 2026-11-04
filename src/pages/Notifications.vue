<script setup>
// Notifications page (reworked 3 Nov 2026): one row per notification in Today / This week / Older, filters by area
// (from each notification's type) and by Unread / Starred, and clearing: × on a row, or "Clear read" (read and not starred).
// Personal notifications are deleted; team ones are hidden for you only. Only the last 30 days are fetched.
// Same shared listener as the bell (composables/useNotifications.js).
import { computed, ref } from "vue"
import { useRouter } from "vue-router"
import { useNotifications } from "@/composables/useNotifications"
import {
  KEEP_DAYS, clearNotification, clearReadNotifications, markAllNotificationsAsRead, markNotificationAsRead, markNotificationAsUnread, setNotificationStarred,
} from "@/services/notificationService"
import { askConfirm } from "@/lib/confirm.js"
import OptionPicker from "@/components/OptionPicker.vue"
import { alerts, turnOnAlerts, turnOffAlerts } from "@/lib/desktop-alerts.js"
import { useSession } from "@/stores/session.js"
const session = useSession()

const router = useRouter()
const { notifications, unreadCount, loading, error } = useNotifications()
const show = ref("all")      // all / unread / starred
const area = ref("all")
const actionError = ref("")
const okMsg = ref("")

// Area of a notification, from its type
const AREAS = [
  { key: "issues", label: "Issues", types: ["issue"] },
  { key: "finance", label: "Finance", types: ["statement", "payment", "expense"] },
  { key: "leads", label: "Leads", types: ["inquiry"] },
  { key: "listings", label: "Listings", types: ["listing"] },
  { key: "agreements", label: "Agreements", types: ["agreement"] },
  { key: "hr", label: "HR", types: ["complaint", "access"] },
  { key: "updates", label: "Updates", types: ["update"] },
]
const areaOf = (n) => AREAS.find((a) => a.types.includes(n.type))?.key || "other"
const areaLabel = (n) => AREAS.find((a) => a.key === areaOf(n))?.label || "Other"
// Area drop-down: every area with its count; empty ones are greyed out
const areaOptions = computed(() => {
  const count = (k) => notifications.value.filter((n) => areaOf(n) === k).length
  return [{ value: "all", label: `All areas (${notifications.value.length})` },
    ...[...AREAS, { key: "other", label: "Other" }].map((a) => ({ value: a.key, label: `${a.label} (${count(a.key)})`, disabled: !count(a.key) && area.value !== a.key }))]
})

const shown = computed(() => notifications.value
  .filter((n) => area.value === "all" || areaOf(n) === area.value)
  .filter((n) => show.value === "all" || (show.value === "unread" ? !n.read : n.starred)))
const starredCount = computed(() => notifications.value.filter((n) => n.starred).length)
const clearable = computed(() => notifications.value.filter((n) => n.read && !n.starred).length)

// Today / This week / Older (the list is already newest first)
const ms = (t) => (t?.toMillis ? t.toMillis() : Date.now())
const sections = computed(() => {
  const d = new Date(), today = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(), week = today - 6 * 86400000
  const out = [{ key: "today", label: "Today", items: [] }, { key: "week", label: "This week", items: [] }, { key: "older", label: "Older", items: [] }]
  for (const n of shown.value) out[ms(n.createdAt) >= today ? 0 : ms(n.createdAt) >= week ? 1 : 2].items.push(n)
  return out.filter((s) => s.items.length)
})
const stamp = (t) => (t?.toDate ? t.toDate().toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "Just now")

async function run(action, failMessage) {
  actionError.value = ""; okMsg.value = ""
  try { await action() } catch (e) { console.error(e); actionError.value = failMessage }
}
async function openItem(n) {
  if (!n.read) markNotificationAsRead(n.id).catch((e) => console.error(e))
  if (n.link) router.push(n.link)
}
const toggleRead = (n) => run(() => (n.read ? markNotificationAsUnread(n.id) : markNotificationAsRead(n.id)), "Could not change read status.")
const toggleStar = (n) => run(() => setNotificationStarred(n.id, !n.starred), "Could not change the star.")
const clearOne = (n) => run(() => clearNotification(n), "Could not clear it.")
const readAll = () => run(() => markAllNotificationsAsRead(notifications.value), "Could not mark all as read.")
// Desktop alerts switch (lib/desktop-alerts.js)
async function toggleAlerts() {
  if (alerts.on) { await turnOffAlerts(); okMsg.value = "Notifications pop-ups are off on this device."; return }
  const on = await turnOnAlerts(session.role)
  if (on) okMsg.value = alerts.mode === "push" ? "Push is on: pop-ups even when the PMS is closed." : "Pop-ups are on while the PMS is open. (Push when closed works on the Vercel site.)"
  if (!on) actionError.value = alerts.permission === "denied"
    ? "This browser is blocking notifications for the PMS. Click the icon at the left of the address bar, set Notifications to Allow, then press the button again."
    : "Desktop alerts weren't allowed."
}
async function clearRead() {
  const n = clearable.value
  if (!n) return
  const ok = await askConfirm({ title: `Clear ${n} read notification${n === 1 ? "" : "s"}?`,
    message: "Read notifications leave your list. Unread and starred ones stay. Notifications sent to your team are only hidden for you.", confirmText: "Clear read" })
  if (!ok) return
  await run(async () => { const done = await clearReadNotifications(notifications.value); okMsg.value = `${done} cleared.` }, "Could not clear them.")
}
</script>

<template>
  <main class="content nf-page">
    <div class="page-head">
      <div>
        <h1>Notifications</h1>
        <div class="sub"><b class="nf-unread-sub" v-if="unreadCount">{{ unreadCount }} unread</b><span v-else>Nothing unread</span>{{ ` · the last ${KEEP_DAYS} days` }}</div>
      </div>
      <div class="nf-tools">
        <button type="button" class="btn nf-alerts" v-if="alerts.supported" :class="{ on: alerts.on }" :aria-pressed="String(alerts.on)" @click="toggleAlerts"
          :title="alerts.on ? 'New notifications pop up on this computer while the PMS is open. Click to turn off.' : 'Show a pop-up on this computer for each new notification while the PMS is open'">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
          {{ alerts.on ? (alerts.mode === 'push' ? 'Push notifications on' : 'Desktop alerts on') : 'Turn on push notifications' }}</button>
        <button type="button" class="btn" :disabled="!unreadCount" @click="readAll">Mark all as read</button>
        <button type="button" class="btn" :disabled="!clearable" @click="clearRead">Clear read</button>
      </div>
    </div>

    <!-- Tabs for what you switch most (All / Unread / Starred), the area drop-down on the same line -->
    <div class="nf-bar">
      <div class="nf-tabs" role="tablist" aria-label="Show">
        <button type="button" role="tab" class="nf-tab" :class="{ on: show === 'all' }" :aria-selected="String(show === 'all')" @click="show = 'all'">All</button>
        <button type="button" role="tab" class="nf-tab" :class="{ on: show === 'unread' }" :aria-selected="String(show === 'unread')" @click="show = 'unread'">Unread<span class="nf-n" v-if="unreadCount">{{ unreadCount }}</span></button>
        <button type="button" role="tab" class="nf-tab" :class="{ on: show === 'starred' }" :aria-selected="String(show === 'starred')" @click="show = 'starred'">Starred<span class="nf-n star" v-if="starredCount">{{ starredCount }}</span></button>
      </div>
      <OptionPicker class="nf-area-pick" v-model="area" :options="areaOptions" label="Area" />
    </div>

    <div class="notice ok" v-if="okMsg">{{ okMsg }}</div>
    <div class="notice error" v-if="error || actionError">{{ error || actionError }}</div>
    <p class="help" v-else-if="loading">Loading…</p>
    <div class="card nf-empty" v-else-if="!sections.length">
      {{ show === 'unread' ? 'Nothing unread.' : show === 'starred' ? 'No starred notifications.' : area !== 'all' ? 'Nothing in this area.' : 'No notifications in the last ' + KEEP_DAYS + ' days.' }}
    </div>

    <section class="nf-section" v-for="s in sections" :key="s.key">
      <h2>{{ s.label }}<span class="nf-sec-n">{{ s.items.length }}</span></h2>
      <ul class="nf-list">
        <li v-for="n in s.items" :key="n.id" class="nf-row" :class="[{ unread: !n.read }, 'a-' + areaOf(n)]">
          <span class="nf-dot" aria-hidden="true"></span>
          <button type="button" class="nf-main" @click="openItem(n)">
            <span class="nf-title">{{ n.title }}</span>
            <span class="nf-msg" v-if="n.message">{{ n.message }}</span>
            <span class="nf-meta"><span class="nf-area" :class="'a-' + areaOf(n)">{{ areaLabel(n) }}</span>{{ stamp(n.createdAt) }}</span>
          </button>
          <div class="nf-acts">
            <button type="button" class="nf-ico" :class="{ star: n.starred }" :title="n.starred ? 'Remove star' : 'Star'" :aria-label="n.starred ? 'Remove star' : 'Star'" @click="toggleStar(n)">
              <svg width="16" height="16" viewBox="0 0 24 24" :fill="n.starred ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/></svg></button>
            <button type="button" class="nf-ico" :title="n.read ? 'Mark as unread' : 'Mark as read'" :aria-label="n.read ? 'Mark as unread' : 'Mark as read'" @click="toggleRead(n)">
              <!-- The icon shows the state (Khairul, 3 Nov): unread = closed envelope, read = open envelope. Click to switch. -->
              <svg v-if="!n.read" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>
              <svg v-else width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-9"/><path d="m3 10 9-7 9 7"/><path d="m3 10 9 6 9-6"/></svg></button>
            <button type="button" class="nf-ico clear" title="Clear" aria-label="Clear" @click="clearOne(n)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
          </div>
        </li>
      </ul>
    </section>
  </main>
</template>

<style scoped>
/* Full width, like the other pages (Khairul, 3 Nov) */
.nf-tools { display: flex; gap: 8px; flex-wrap: wrap; }
.nf-alerts.on { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
.nf-bar { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; flex-wrap: wrap; border-bottom: 1px solid var(--border); margin-bottom: 18px; }
.nf-tabs { display: flex; gap: 4px; }
.nf-tab { display: inline-flex; align-items: center; gap: 6px; border: 0; background: none; padding: 10px 14px; margin-bottom: -1px; font: inherit; font-size: 14px; font-weight: 500;
  color: var(--text-2); border-bottom: 2px solid transparent; cursor: pointer; }
.nf-tab:hover { color: var(--accent); }
.nf-tab.on { color: var(--accent); font-weight: 600; border-bottom-color: var(--accent); }
.nf-n { min-width: 20px; padding: 1px 7px; border-radius: 999px; background: #d92d20; color: #fff; font-size: 11px; font-weight: 700; text-align: center; }
.nf-n.star { background: #f79009; color: #fff; }   /* same orange as the star icon */
.nf-area-pick { margin-bottom: 8px; }
.nf-empty { color: var(--muted); font-size: 13px; }
.nf-section { margin-bottom: 18px; }
.nf-section h2 { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--accent); margin: 0 0 8px; }
.nf-sec-n { padding: 1px 8px; border-radius: 999px; background: var(--accent-soft); color: var(--accent); font-size: 11px; letter-spacing: 0; }
.nf-unread-sub { color: var(--accent); font-weight: 700; }
.nf-list { list-style: none; margin: 0; padding: 0; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
.nf-row { --tone: var(--muted); --tone-soft: var(--chip); position: relative; display: flex; align-items: flex-start; gap: 10px; padding: 12px 10px 12px 14px;
  transition: background var(--fast, .15s), box-shadow var(--fast, .15s); }
.nf-row + .nf-row { border-top: 1px solid var(--line, var(--border)); }
/* Each area has its theme colour, used on its tag only */
.a-issues { --tone: var(--amber); --tone-soft: var(--amber-soft); }
.a-finance { --tone: var(--green); --tone-soft: var(--green-soft); }
.a-leads { --tone: var(--blue); --tone-soft: var(--blue-soft); }
.a-listings { --tone: var(--navy); --tone-soft: var(--navy-soft); }
.a-agreements, .a-updates { --tone: var(--accent); --tone-soft: var(--accent-soft); }
.a-hr { --tone: var(--red); --tone-soft: var(--red-soft); }
/* Unread rows stay white: bold title and the red dot mark them (toned down, Khairul 3 Nov) */
/* Hover: a clear highlight in the theme colour, the title turns accent */
.nf-row:hover { background: var(--accent-soft); box-shadow: inset 3px 0 0 var(--accent); }
.nf-row:hover .nf-title { color: var(--accent); }
.nf-dot { flex: none; width: 8px; height: 8px; margin-top: 7px; border-radius: 50%; background: transparent; }
.nf-row.unread .nf-dot { background: var(--accent); }
.nf-main { flex: 1 1 auto; min-width: 0; display: grid; gap: 3px; border: 0; background: none; padding: 0; text-align: left; font: inherit; color: inherit; cursor: pointer; }
.nf-title { font-size: 14px; font-weight: 500; color: var(--text); overflow-wrap: anywhere; }
.nf-row.unread .nf-title { font-weight: 700; }
.nf-row:not(.unread) .nf-title, .nf-row:not(.unread) .nf-msg { opacity: .8; }
.nf-msg { font-size: 13px; color: var(--text-2); overflow-wrap: anywhere; }
.nf-meta { display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--muted); }
.nf-area { padding: 1px 8px; border-radius: 999px; background: var(--tone-soft, var(--chip)); color: var(--tone, var(--text-2)); font-weight: 600; }
.nf-area.a-other { --tone: var(--text-2); --tone-soft: var(--chip); }
.nf-acts { flex: none; display: flex; gap: 2px; }
.nf-ico { display: inline-grid; place-items: center; width: 32px; height: 32px; border: 0; border-radius: 8px; background: none; color: var(--muted); cursor: pointer; }
.nf-ico:hover { background: var(--accent-soft); color: var(--accent); }
.nf-ico.star { color: #f79009; }
.nf-ico.clear { color: var(--danger, #d92d20); }
.nf-ico.clear:hover { background: color-mix(in srgb, var(--danger, #d92d20) 12%, transparent); color: var(--danger, #d92d20); }
@media (pointer: coarse) { .nf-ico { width: 40px; height: 40px; } }
@media (max-width: 600px) { .nf-row { flex-wrap: wrap; } .nf-acts { width: 100%; justify-content: flex-end; margin-top: -4px; } }
</style>
