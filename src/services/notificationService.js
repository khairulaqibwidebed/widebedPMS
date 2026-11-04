import {
  addDoc, arrayRemove, arrayUnion, collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, serverTimestamp, Timestamp, updateDoc, where, writeBatch,
} from "firebase/firestore"
import { onAuthStateChanged } from "firebase/auth"
import { auth, db } from "@/lib/firebase"
import { sendPush } from "@/lib/push.js"

const notificationsRef = collection(db, "notifications")

// A notification goes to ONE person (recipientUid) or to EVERYONE in a role (recipientRole).
// Both keys are always written (the unused one is null) because the Firestore rules read both.
// Role notifications are shared documents, so "read" is per person: the uid is added to readBy.

// Only the last 30 days are fetched (Khairul, 3 Nov 2026): older notifications are never read from Firestore.
export const KEEP_DAYS = 30

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
          .filter((n) => n.createdByUid !== user.uid && !(n.hiddenBy || []).includes(user.uid))
          .map((n) => ({ ...n, read: (n.readBy || []).includes(user.uid), starred: (n.starredBy || []).includes(user.uid) }))
          .sort((a, b) => millis(b.createdAt) - millis(a.createdAt))
        callback({ notifications, unreadCount: notifications.filter((n) => !n.read).length })
      }

      const since = Timestamp.fromMillis(Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000)
      const listen = (key, field, value) =>
        onSnapshot(
          query(notificationsRef, where(field, "==", value), where("createdAt", ">=", since), orderBy("createdAt", "desc"), limit(30)),
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

  const ref = await addDoc(notificationsRef, {
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
  sendPush(ref.id)   // phones and closed apps (lib/push.js, api/push.js); best effort
  return ref
}

/** Notify one person. */
export const notifyUser = (opts) => send({ ...opts, recipientRole: null })

/** Notify everyone in a role: a built-in role (director, finance, it, hr, operations, procurement, marketing) or a role made on the Roles page (its id; rules Draft 0.21). */
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

/**
 * Clear one notification for the current user (3 Nov 2026). Sent to them personally: deleted. Sent to their team (role):
 * hidden for them only (hiddenBy), because the others in the team still need it.
 */
export async function clearNotification(n) {
  const user = auth.currentUser
  if (!user) throw new Error("You must sign in first.")
  if (n.recipientUid === user.uid) await deleteDoc(doc(db, "notifications", n.id))
  else await updateDoc(doc(db, "notifications", n.id), { hiddenBy: arrayUnion(user.uid) })
}

/** "Clear read": every read notification in the list that isn't starred, in batches of up to 400 writes. Returns how many. */
export async function clearReadNotifications(notifications) {
  const user = auth.currentUser
  if (!user) throw new Error("You must sign in first.")
  const list = notifications.filter((n) => n.read && !n.starred)
  for (let i = 0; i < list.length; i += 400) {
    const b = writeBatch(db)
    for (const n of list.slice(i, i + 400)) {
      const ref = doc(db, "notifications", n.id)
      if (n.recipientUid === user.uid) b.delete(ref)
      else b.update(ref, { hiddenBy: arrayUnion(user.uid) })
    }
    await b.commit()
  }
  return list.length
}
