<script setup>
import { computed } from 'vue'
import { useNotifications } from '@/composables/useNotifications'

const { unreadCount, error } = useNotifications()

const label = computed(() => (unreadCount.value > 0 ? `Notifications, ${unreadCount.value} unread` : 'Notifications'))
</script>

<template>
  <RouterLink to="/Notifications" class="notification-bell" :aria-label="label" :title="label">
    <span class="bell-icon" aria-hidden="true">🔔</span>

    <!-- Red badge with the number of unread notifications; hidden when there are none -->
    <span v-if="unreadCount > 0" class="notification-badge">
      {{ unreadCount > 99 ? '99+' : unreadCount }}
    </span>

    <!-- Small grey dot when the notifications could not be loaded -->
    <span v-else-if="error" class="notification-error-dot" aria-hidden="true"></span>
  </RouterLink>

  <span v-if="error" class="sr-only">{{ error }}</span>
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
  top: 1px;
  right: 1px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: #d92d20;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  box-shadow: 0 0 0 2px var(--surface, #fff);
  animation: badge-pulse 2s ease-out infinite;
}

.notification-error-dot {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #98a2b3;
}

@keyframes badge-pulse {
  0% { box-shadow: 0 0 0 2px var(--surface, #fff), 0 0 0 2px rgba(217, 45, 32, 0.5); }
  70% { box-shadow: 0 0 0 2px var(--surface, #fff), 0 0 0 8px rgba(217, 45, 32, 0); }
  100% { box-shadow: 0 0 0 2px var(--surface, #fff), 0 0 0 8px rgba(217, 45, 32, 0); }
}

@media (prefers-reduced-motion: reduce) {
  .notification-badge { animation: none; }
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