
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
  orderBy,
  limit,
  serverTimestamp,
} from 'firebase/firestore'

import { onAuthStateChanged } from 'firebase/auth'

import { auth, db } from '@/lib/firebase'

const notificationsRef = collection(db, 'notifications')

/**
 * Subscribe to notifications for the currently signed-in user.
 * Updates automatically when notifications change in Firestore.
 */
export function subscribeToNotifications(
  callback,
  onError = console.error
) {
  let unsubscribeNotifications = null

  const unsubscribeAuth = onAuthStateChanged(
    auth,
    (user) => {
      if (unsubscribeNotifications) {
        unsubscribeNotifications()
        unsubscribeNotifications = null
      }

      if (!user) {
        callback({
          notifications: [],
          unreadCount: 0,
        })
        return
      }

      const notificationsQuery = query(
        notificationsRef,
        where('recipientUid', '==', user.uid),
        orderBy('createdAt', 'desc'),
        limit(100)
      )

      unsubscribeNotifications = onSnapshot(
        notificationsQuery,
        (snapshot) => {
          const notifications = snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          }))

          callback({
            notifications,
            unreadCount: notifications.filter(
              (item) => !item.read
            ).length,
          })
        },
        onError
      )
    },
    onError
  )

  return () => {
    unsubscribeAuth()

    if (unsubscribeNotifications) {
      unsubscribeNotifications()
      unsubscribeNotifications = null
    }
  }
}

/**
 * Create a notification in the current user's own inbox.
 */
export async function createNotification({
  title,
  message = '',
  type = 'general',
  link = '/Notifications',
}) {
  const user = auth.currentUser

  if (!user) {
    throw new Error('You must sign in first.')
  }

  if (!title?.trim()) {
    throw new Error('Notification title is required.')
  }

  return addDoc(notificationsRef, {
    recipientUid: user.uid,
    title: title.trim(),
    message: message.trim(),
    type,
    link,
    read: false,
    createdByUid: user.uid,
    createdAt: serverTimestamp(),
  })
}

/**
 * Create a notification for a specified recipient.
 *
 * IMPORTANT:
 * Firestore Security Rules must authorize this operation safely.
 * Do not allow every user to send notifications to arbitrary users.
 */
export async function createNotificationForUser({
  recipientUid,
  title,
  message = '',
  type = 'general',
  link = '/Notifications',
}) {
  const user = auth.currentUser

  if (!user) {
    throw new Error('You must sign in first.')
  }

  if (!recipientUid) {
    throw new Error('Recipient UID is required.')
  }

  if (!title?.trim()) {
    throw new Error('Notification title is required.')
  }

  return addDoc(notificationsRef, {
    recipientUid,
    title: title.trim(),
    message: message.trim(),
    type,
    link,
    read: false,
    createdByUid: user.uid,
    createdAt: serverTimestamp(),
  })
}

/**
 * Mark one notification as read.
 */
export async function markNotificationAsRead(notificationId) {
  if (!notificationId) {
    throw new Error('Notification ID is required.')
  }

  await updateDoc(
    doc(db, 'notifications', notificationId),
    { read: true }
  )
}

/**
 * Mark all unread notifications as read.
 */
export async function markAllNotificationsAsRead(notifications) {
  const unreadNotifications = notifications.filter(
    (item) => !item.read
  )

  await Promise.all(
    unreadNotifications.map((item) =>
      markNotificationAsRead(item.id)
    )
  )
}
