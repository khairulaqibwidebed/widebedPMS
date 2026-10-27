
<script setup>
import { useRouter } from 'vue-router'

import {
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from '@/services/notificationService'

import {
  useNotifications,
} from '@/composables/useNotifications'

const router = useRouter()

const {
  notifications,
  unreadCount,
  loading,
  error,
} = useNotifications()

async function openNotification(notification) {
  try {
    if (!notification.read) {
      await markNotificationAsRead(notification.id)
    }

    const link = notification.link

    if (
      typeof link === 'string' &&
      link.startsWith('/') &&
      !link.startsWith('//')
    ) {
      await router.push(link)
    }
  } catch (err) {
    console.error(
      'Unable to open notification:',
      err
    )
  }
}

async function markAllRead() {
  try {
    await markAllNotificationsAsRead(
      notifications.value
    )
  } catch (err) {
    console.error(
      'Unable to mark notifications as read:',
      err
    )
  }
}

function formatDate(value) {
  if (!value) return 'Just now'

  const date =
    typeof value.toDate === 'function'
      ? value.toDate()
      : new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Just now'
  }

  return date.toLocaleString()
}
</script>

<template>
  <main class="notifications-page">
    <header class="page-header">
      <div>
        <h1>Notifications</h1>
        <p>
          You have {{ unreadCount }} unread
          notification(s).
        </p>
      </div>

      <button
        v-if="unreadCount > 0"
        type="button"
        class="mark-all-button"
        @click="markAllRead"
      >
        Mark all as read
      </button>
    </header>

    <div v-if="loading" class="state-message">
      Loading notifications...
    </div>

    <div
      v-else-if="error"
      class="state-message error-message"
      role="alert"
    >
      {{ error }}
    </div>

    <div
      v-else-if="notifications.length === 0"
      class="empty-state"
    >
      <div class="empty-icon">🔔</div>
      <h2>You're all caught up!</h2>
      <p>You don't have any notifications yet.</p>
    </div>

    <ul v-else class="notification-list">
      <li
        v-for="item in notifications"
        :key="item.id"
      >
        <button
          type="button"
          class="notification-item"
          :class="{ unread: !item.read }"
          @click="openNotification(item)"
        >
          <span
            class="status-dot"
            :class="{ active: !item.read }"
          />

          <span class="notification-copy">
            <strong>{{ item.title }}</strong>

            <span class="notification-message">
              {{ item.message }}
            </span>

            <small>
              {{ formatDate(item.createdAt) }}
            </small>
          </span>

          <span
            v-if="!item.read"
            class="unread-label"
          >
            New
          </span>
        </button>
      </li>
    </ul>
  </main>
</template>

<style scoped>
.notifications-page {
  max-width: 1000px;
  margin: 0 auto;
  padding: 24px;
  color: inherit;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
}

.page-header h1 {
  margin: 0 0 6px;
  font-size: 26px;
  font-weight: 700;
}

.page-header p {
  margin: 0;
  opacity: 0.7;
}

.mark-all-button {
  padding: 10px 14px;
  border: none;
  border-radius: 10px;
  background: #234b38;
  color: white;
  cursor: pointer;
}

.mark-all-button:hover {
  background: #183a29;
}

.notification-list {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.notification-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  width: 100%;
  padding: 16px;
  border: 1px solid #e1e6e2;
  border-radius: 14px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition: background 0.2s ease;
}

.notification-item:hover {
  background: rgba(100, 120, 100, 0.08);
}

.notification-item.unread {
  border-color: #91b19a;
  background: rgba(53, 112, 77, 0.08);
}

.status-dot {
  flex-shrink: 0;
  width: 9px;
  height: 9px;
  margin-top: 6px;
  border-radius: 50%;
}

.status-dot.active {
  background: #2e7d4f;
}

.notification-copy {
  display: grid;
  gap: 6px;
  flex: 1;
  min-width: 0;
}

.notification-copy strong {
  font-size: 15px;
}

.notification-message {
  font-size: 14px;
  overflow-wrap: anywhere;
}

.notification-copy small {
  font-size: 12px;
  opacity: 0.65;
}

.unread-label {
  color: #2e7d4f;
  font-size: 12px;
  font-weight: 700;
}

.state-message,
.empty-state {
  padding: 36px 20px;
  text-align: center;
  border: 1px dashed #cbd5cc;
  border-radius: 14px;
}

.error-message {
  color: #b42318;
}

.empty-icon {
  font-size: 32px;
}

.empty-state h2 {
  margin-bottom: 8px;
}

.empty-state p {
  margin: 0;
  opacity: 0.7;
}

@media (max-width: 600px) {
  .notifications-page {
    padding: 16px;
  }

  .page-header {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
