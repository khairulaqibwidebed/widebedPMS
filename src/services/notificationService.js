import {
  addDoc, arrayRemove, arrayUnion, collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where,
} from "firebase/firestore"
import { onAuthStateChanged } from "firebase/auth"
import { auth, db } from "@/lib/firebase"

const notificationsRef = collection(db, "notifications")

// A notification goes to ONE person (recipientUid) or to EVERYONE in a role (recipientRole).
// Both keys are always written (the unused one is null) because the Firestore rules read both.
// Role notifications are shared documents, so "read" is per person: the uid is added to readBy.

const millis = (t) => (t?.toMillis ? t.toMillis() : Date.now()) // createdAt is null for an instant after sending

/**
 * Live notifications for the signed-in user: the ones sent to them personally plus the ones sent to their role.
 * Notifications the user caused themselves are left out. Returns an unsubscribe function.
 */
export function subscribeToNotifications(role, callback, onError = console.error) {
  let stops = []

  const stopListening = () => {
    stops.forEach((stop) => stop())
    stops = []
  }

  const unsubscribeAuth = onAuthStateChanged(
    auth,
    (user) => {
      stopListening()

      if (!user) {
        callback({ notifications: [], unreadCount: 0 })
        return
      }

      const buckets = { uid: [], role: [] }

      const publish = () => {
        const notifications = [...buckets.uid, ...buckets.role]
          .filter((n) => n.createdByUid !== user.uid)
          .map((n) => ({ ...n, read: (n.readBy || []).includes(user.uid), starred: (n.starredBy || []).includes(user.uid) }))
          .sort((a, b) => millis(b.createdAt) - millis(a.createdAt))
        callback({ notifications, unreadCount: notifications.filter((n) => !n.read).length })
      }

      const listen = (key, field, value) =>
        onSnapshot(
          query(notificationsRef, where(field, "==", value), orderBy("createdAt", "desc"), limit(100)),
          (snapshot) => {
            buckets[key] = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
            publish()
          },
          onError
        )

      stops.push(listen("uid", "recipientUid", user.uid))
      if (role) stops.push(listen("role", "recipientRole", role))
    },
    onError
  )

  return () => {
    unsubscribeAuth()
    stopListening()
  }
}

// anonymous: true writes the notification WITHOUT the sender's uid or name (createdByUid: null, createdByName: "").
// Use it only where the sender must stay hidden (anonymous complaints). The Firestore rules must allow it.
async function send({ recipientUid = null, recipientRole = null, title, message = "", type = "general", link = "/Notifications", refId = null, anonymous = false }) {
  const user = auth.currentUser
  if (!user) throw new Error("You must sign in first.")
  if (!!recipientUid === !!recipientRole) throw new Error("Choose one recipient: a person or a role.")
  if (!title?.trim()) throw new Error("Notification title is required.")

  return addDoc(notificationsRef, {
    recipientUid,
    recipientRole,
    title: title.trim().slice(0, 200),
    message: message.trim().slice(0, 600),
    type,
    link,
    refId,
    readBy: [],
    starredBy: [],
    createdByUid: anonymous ? null : user.uid,
    createdByName: anonymous ? "" : user.displayName || "",
    createdAt: serverTimestamp(),
  })
}

/** Notify one person. */
export const notifyUser = (opts) => send({ ...opts, recipientRole: null })

/** Notify everyone in a role: director, finance, it, hr, operations, procurement or marketing. */
export const notifyRole = (opts) => send({ ...opts, recipientUid: null })

/** Mark one notification as read for the current user only. */
export async function markNotificationAsRead(notificationId) {
  const user = auth.currentUser
  if (!user) throw new Error("You must sign in first.")
  if (!notificationId) throw new Error("Notification ID is required.")
  await updateDoc(doc(db, "notifications", notificationId), { readBy: arrayUnion(user.uid) })
}

/** Mark one notification as unread again for the current user only. */
export async function markNotificationAsUnread(notificationId) {
  const user = auth.currentUser
  if (!user) throw new Error("You must sign in first.")
  if (!notificationId) throw new Error("Notification ID is required.")
  await updateDoc(doc(db, "notifications", notificationId), { readBy: arrayRemove(user.uid) })
}

/** Star or un-star a notification for the current user only. */
export async function setNotificationStarred(notificationId, starred) {
  const user = auth.currentUser
  if (!user) throw new Error("You must sign in first.")
  if (!notificationId) throw new Error("Notification ID is required.")
  await updateDoc(doc(db, "notifications", notificationId), { starredBy: starred ? arrayUnion(user.uid) : arrayRemove(user.uid) })
}

/** Mark every unread notification in the list as read for the current user. */
export async function markAllNotificationsAsRead(notifications) {
  await Promise.all(notifications.filter((n) => !n.read).map((n) => markNotificationAsRead(n.id)))
}