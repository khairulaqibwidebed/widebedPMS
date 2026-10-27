<script setup>
import { useNotifications } from '@/composables/useNotifications'

const { unreadCount, error } = useNotifications()
</script>

<template>
  <RouterLink
    to="/Notifications"
    class="notification-bell"
    aria-label="Open notifications"
    title="Notifications"
  >
    <span class="bell-icon" aria-hidden="true">
      🔔
    </span>

    <span
      v-if="unreadCount > 0"
      class="notification-badge"
    >
      {{ unreadCount > 99 ? '99+' : unreadCount }}
    </span>
  </RouterLink>

  <span v-if="error" class="sr-only">
    {{ error }}
  </span>
</template>

<style scoped>
.notification-bell {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  color: inherit;
  text-decoration: none;
  transition: background 0.2s ease;
}

.notification-bell:hover {
  background: rgba(128, 128, 128, 0.12);
}

.bell-icon {
  font-size: 20px;
  line-height: 1;
}

.notification-badge {
  position: absolute;
  top: 0;
  right: 0;
  min-width: 17px;
  height: 17px;
  padding: 0 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: #b42318;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
