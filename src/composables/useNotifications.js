import { onUnmounted, ref, watch } from 'vue'
import { subscribeToNotifications } from '@/services/notificationService'
import { useSession } from '@/stores/session.js'

// ONE live listener for the whole app, shared by the bell, its drop-down panel and the Notifications page,
// so opening the page doesn't read the same notifications from Firestore a second time.
// It starts with the first component that uses it and stops when the last one goes away.
const notifications = ref([])
const unreadCount = ref(0)
const loading = ref(true)
const error = ref('')
let users = 0, stop = null, stopWatch = null

function start() {
  const session = useSession()
  // The bell can mount before the session has loaded the user's role. Role notifications
  // (new issue, new comment) need that role, so listen again whenever the role changes.
  stopWatch = watch(
    () => session.role,
    (role) => {
      if (stop) stop()
      stop = subscribeToNotifications(
        role,
        (result) => {
          notifications.value = result.notifications
          unreadCount.value = result.unreadCount
          loading.value = false
          error.value = ''
        },
        (err) => {
          console.error('Failed to load notifications:', err)
          error.value = 'Unable to load notifications. Check your connection and Firestore permissions.'
          loading.value = false
        }
      )
    },
    { immediate: true }
  )
}

export function useNotifications() {
  if (users++ === 0) start()
  onUnmounted(() => {
    if (--users === 0) { if (stop) stop(); if (stopWatch) stopWatch(); stop = stopWatch = null; loading.value = true }
  })
  return { notifications, unreadCount, loading, error }
}
