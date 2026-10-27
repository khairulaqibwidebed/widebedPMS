<script setup>
import { computed, ref } from "vue"
import { useRouter } from "vue-router"
import { useNotifications } from "@/composables/useNotifications"
import {
  markAllNotificationsAsRead, markNotificationAsRead, markNotificationAsUnread, setNotificationStarred,
} from "@/services/notificationService"

const router = useRouter()
const { notifications, unreadCount, loading, error } = useNotifications()
const filter = ref("all")
const actionError = ref("")
const open = ref({}) // which groups are expanded, by title

const starredCount = computed(() => notifications.value.filter((n) => n.starred).length)

const shown = computed(() => {
  if (filter.value === "unread") return notifications.value.filter((n) => !n.read)
  if (filter.value === "starred") return notifications.value.filter((n) => n.starred)
  return notifications.value
})

// Notifications with the same title share one group. The list is already newest first,
// so groups are ordered by their latest message and messages inside a group are newest first.
const groups = computed(() => {
  const map = new Map()
  for (const n of shown.value) {
    if (!map.has(n.title)) map.set(n.title, { key: n.title, title: n.title, items: [] })
    map.get(n.title).items.push(n)
  }
  return [...map.values()].map((g) => ({
    ...g,
    unread: g.items.filter((i) => !i.read).length,
    starred: g.items.some((i) => i.starred),
    latest: g.items[0].createdAt,
  }))
})

const stamp = (t) => (t?.toDate ? t.toDate().toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "Just now")
const toggleGroup = (g) => { open.value = { ...open.value, [g.key]: !open.value[g.key] } }

async function run(action, failMessage) {
  actionError.value = ""
  try { await action() } catch (e) { console.error(e); actionError.value = failMessage }
}

async function openItem(n) {
  if (!n.read) await run(() => markNotificationAsRead(n.id), "Could not mark it as read.")
  if (n.link) router.push(n.link)
}

const toggleRead = (n) => run(() => (n.read ? markNotificationAsUnread(n.id) : markNotificationAsRead(n.id)), "Could not change read status.")
const toggleStar = (n) => run(() => setNotificationStarred(n.id, !n.starred), "Could not change the star.")
const readGroup = (g) => run(() => markAllNotificationsAsRead(g.items), "Could not mark the group as read.")
const readAll = () => run(() => markAllNotificationsAsRead(notifications.value), "Could not mark all as read.")
</script>

<template>
  <main class="content">
    <div class="nf-head">
      <div>
        <h1>Notifications</h1>
        <p class="nf-sub">{{ unreadCount }} unread</p>
      </div>
      <div class="nf-filters">
        <button class="nf-chip" :class="{ on: filter === 'all' }" @click="filter = 'all'">All</button>
        <button class="nf-chip" :class="{ on: filter === 'unread' }" @click="filter = 'unread'">Unread</button>
        <button class="nf-chip" :class="{ on: filter === 'starred' }" @click="filter = 'starred'">Starred ({{ starredCount }})</button>
        <button class="nf-chip" :disabled="!unreadCount" @click="readAll">Mark all as read</button>
      </div>
    </div>

    <p v-if="error || actionError" class="nf-error">{{ error || actionError }}</p>
    <p v-else-if="loading" class="nf-sub">Loading…</p>
    <p v-else-if="!groups.length" class="nf-sub">
      {{ filter === "unread" ? "Nothing unread." : filter === "starred" ? "No starred notifications." : "No notifications yet." }}
    </p>

    <ul v-else class="nf-list">
      <li v-for="g in groups" :key="g.key" class="nf-group" :class="{ unread: g.unread > 0, expanded: open[g.key] }">
        <!-- Group header: click to open or close the messages -->
        <div class="nf-group-head">
          <button type="button" class="nf-toggle" :aria-expanded="!!open[g.key]" @click="toggleGroup(g)">
            <span class="nf-chevron" aria-hidden="true">{{ open[g.key] ? "▾" : "▸" }}</span>
            <span class="nf-group-title">
              {{ g.title }}
              <span v-if="g.starred" class="nf-star-mark" aria-hidden="true">★</span>
            </span>
            <span class="nf-count" :title="g.items.length + ' notification(s)'">{{ g.items.length }}</span>
            <span v-if="g.unread" class="nf-unread-pill">{{ g.unread }} new</span>
            <span class="nf-when">{{ stamp(g.latest) }}</span>
          </button>
          <button v-if="g.unread" type="button" class="nf-btn" @click="readGroup(g)">Mark group as read</button>
        </div>

        <!-- Dropdown: the messages under this title -->
        <ul v-if="open[g.key]" class="nf-sublist">
          <li v-for="n in g.items" :key="n.id" class="nf-sub-item" :class="{ unread: !n.read }">
            <div class="nf-row">
              <span class="nf-dot" aria-hidden="true"></span>
              <div class="nf-text" role="button" tabindex="0" @click="openItem(n)" @keyup.enter="openItem(n)">
                <span class="nf-msg">{{ n.message || "(no details)" }}</span>
              </div>
              <span class="nf-when">{{ stamp(n.createdAt) }}</span>
            </div>
            <div class="nf-actions">
              <button
                type="button"
                class="nf-btn nf-star"
                :class="{ on: n.starred }"
                :title="n.starred ? 'Remove star' : 'Star'"
                :aria-label="n.starred ? 'Remove star' : 'Star'"
                @click="toggleStar(n)"
              >{{ n.starred ? "★" : "☆" }}</button>
              <button type="button" class="nf-btn" @click="toggleRead(n)">{{ n.read ? "Mark as unread" : "Mark as read" }}</button>
            </div>
          </li>
        </ul>
      </li>
    </ul>
  </main>
</template>

<style scoped>
.nf-page { max-width: 760px; }
.nf-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
.nf-head h1 { margin: 0; font-size: 20px; }
.nf-sub { color: var(--muted); font-size: 12px; margin: 4px 0 0; }
.nf-filters { display: flex; gap: 8px; flex-wrap: wrap; }
.nf-error { color: #b42318; font-size: 13px; }

/* Buttons: reset anything the app's global button styles may set (fixed width or height, big padding). */
.nf-chip, .nf-btn, .nf-toggle {
  appearance: none; box-sizing: border-box; width: auto; min-width: 0; height: auto; min-height: 0; margin: 0;
  line-height: 1.3; color: inherit; font: inherit; font-size: 12px; cursor: pointer;
}
.nf-chip { border: 1px solid var(--border); background: var(--surface); border-radius: 999px; padding: 5px 12px; white-space: nowrap; }
.nf-chip.on { border-color: var(--accent); color: var(--accent); }
.nf-chip:disabled { opacity: .5; cursor: default; }

.nf-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.nf-group { border: 1px solid var(--border); background: var(--surface); border-radius: var(--radius); min-width: 0; }
.nf-group:hover, .nf-group.expanded { border-color: var(--accent); }

.nf-group-head { display: flex; align-items: center; gap: 10px; padding: 4px 14px 4px 4px; flex-wrap: wrap; }
.nf-toggle {
  flex: 1 1 260px; min-width: 0; display: flex; align-items: center; gap: 10px; text-align: left;
  border: 0; background: none; padding: 10px; font-size: 13px;
}
.nf-chevron { width: 14px; flex: none; color: var(--muted); }
.nf-group-title { flex: 1 1 auto; min-width: 0; font-weight: 500; overflow-wrap: anywhere; }
.nf-group.unread .nf-group-title { font-weight: 700; }
.nf-star-mark { color: #f79009; margin-left: 4px; }
.nf-count { flex: none; min-width: 20px; padding: 1px 7px; border-radius: 999px; background: rgba(128, 128, 128, .18); font-size: 11px; text-align: center; }
.nf-unread-pill { flex: none; padding: 1px 8px; border-radius: 999px; background: #d92d20; color: #fff; font-size: 11px; font-weight: 700; white-space: nowrap; }
.nf-when { flex: none; color: var(--muted); font-size: 11px; white-space: nowrap; }

.nf-sublist { list-style: none; margin: 0; padding: 0 14px 10px 32px; display: grid; gap: 6px; }
.nf-sub-item { border-top: 1px solid var(--border); padding-top: 8px; min-width: 0; }
.nf-sub-item:not(.unread) { opacity: .75; }
.nf-row { display: flex; align-items: flex-start; gap: 10px; min-width: 0; }
.nf-dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 5px; background: transparent; flex: none; }
.nf-sub-item.unread .nf-dot { background: #d92d20; }
.nf-text { flex: 1 1 auto; min-width: 0; font-size: 13px; cursor: pointer; }
.nf-msg { color: var(--text-2); overflow-wrap: anywhere; }

.nf-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: 10px; margin-top: 4px; padding-left: 18px; }
.nf-btn { border: 0; background: none; color: var(--muted); padding: 2px 4px; white-space: nowrap; }
.nf-btn:hover { color: var(--accent); }
.nf-star { font-size: 18px; line-height: 1; }
.nf-star.on { color: #f79009; }
</style>