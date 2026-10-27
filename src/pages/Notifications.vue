<script setup>
import { computed, ref } from "vue"
import { useRouter } from "vue-router"
import { useNotifications } from "@/composables/useNotifications"
import { markAllNotificationsAsRead, markNotificationAsRead } from "@/services/notificationService"

const router = useRouter()
const { notifications, unreadCount, loading, error } = useNotifications()
const filter = ref("all")
const actionError = ref("")

const shown = computed(() => (filter.value === "unread" ? notifications.value.filter((n) => !n.read) : notifications.value))

const stamp = (t) => (t?.toDate ? t.toDate().toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "Just now")

async function openItem(n) {
  actionError.value = ""
  try { if (!n.read) await markNotificationAsRead(n.id) } catch (e) { console.error(e); actionError.value = "Could not mark it as read." }
  if (n.link) router.push(n.link)
}

async function readAll() {
  actionError.value = ""
  try { await markAllNotificationsAsRead(notifications.value) } catch (e) { console.error(e); actionError.value = "Could not mark all as read." }
}
</script>

<template>
  <section class="notif-page">
    <div class="notif-head">
      <div>
        <h1>Notifications</h1>
        <p class="sub">{{ unreadCount }} unread</p>
      </div>
      <div class="notif-actions">
        <button class="chip" :class="{ on: filter === 'all' }" @click="filter = 'all'">All</button>
        <button class="chip" :class="{ on: filter === 'unread' }" @click="filter = 'unread'">Unread</button>
        <button class="chip" :disabled="!unreadCount" @click="readAll">Mark all as read</button>
      </div>
    </div>

    <p v-if="error || actionError" class="notif-error">{{ error || actionError }}</p>
    <p v-else-if="loading" class="sub">Loading…</p>
    <p v-else-if="!shown.length" class="sub">{{ filter === "unread" ? "Nothing unread." : "No notifications yet." }}</p>

    <ul v-else class="notif-list">
      <li v-for="n in shown" :key="n.id">
        <button class="notif-item" :class="{ unread: !n.read }" @click="openItem(n)">
          <span class="dot" aria-hidden="true"></span>
          <span class="body">
            <b>{{ n.title }}</b>
            <span v-if="n.message" class="msg">{{ n.message }}</span>
          </span>
          <span class="when">{{ stamp(n.createdAt) }}</span>
        </button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.notif-page { max-width: 760px; }
.notif-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
.notif-head h1 { margin: 0; font-size: 20px; }
.sub { color: var(--muted); font-size: 12px; margin: 4px 0 0; }
.notif-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.chip { border: 1px solid var(--border); background: var(--surface); color: inherit; border-radius: 999px; padding: 5px 12px; font-size: 12px; cursor: pointer; }
.chip.on { border-color: var(--accent); color: var(--accent); }
.chip:disabled { opacity: .5; cursor: default; }
.notif-error { color: #b42318; font-size: 13px; }
.notif-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.notif-item { width: 100%; display: flex; align-items: flex-start; gap: 10px; text-align: left; border: 1px solid var(--border); background: var(--surface); color: inherit; border-radius: var(--radius); padding: 12px 14px; cursor: pointer; }
.notif-item:hover { border-color: var(--accent); }
.dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 6px; background: transparent; flex: none; }
.notif-item.unread .dot { background: var(--accent); }
.body { flex: 1; min-width: 0; display: grid; gap: 2px; font-size: 13px; }
.notif-item:not(.unread) b { font-weight: 500; }
.msg { color: var(--text-2); overflow-wrap: anywhere; }
.when { color: var(--muted); font-size: 11px; white-space: nowrap; }
</style>