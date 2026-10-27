import { onUnmounted, ref, watch } from 'vue'
import { subscribeToNotifications } from '@/services/notificationService'
import { useSession } from '@/stores/session.js'

export function useNotifications() {
  const session = useSession()
  const notifications = ref([])
  const unreadCount = ref(0)
  const loading = ref(true)
  const error = ref('')

  let stop = null

  // The bell can mount before the session has loaded the user's role. Role notifications
  // (new issue, new comment) need that role, so listen again whenever the role changes.
  watch(
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

  onUnmounted(() => {
    if (stop) stop()
  })

  return { notifications, unreadCount, loading, error }
}