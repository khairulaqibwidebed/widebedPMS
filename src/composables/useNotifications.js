
import { onUnmounted, ref } from 'vue'
import {
  subscribeToNotifications,
} from '@/services/notificationService'

export function useNotifications() {
  const notifications = ref([])
  const unreadCount = ref(0)
  const loading = ref(true)
  const error = ref('')

  const unsubscribe = subscribeToNotifications(
    (result) => {
      notifications.value = result.notifications
      unreadCount.value = result.unreadCount
      loading.value = false
      error.value = ''
    },
    (err) => {
      console.error(
        'Failed to load notifications:',
        err
      )

      error.value =
        'Unable to load notifications. Check your connection and Firestore permissions.'

      loading.value = false
    }
  )

  onUnmounted(() => {
    unsubscribe()
  })

  return {
    notifications,
    unreadCount,
    loading,
    error,
  }
}
