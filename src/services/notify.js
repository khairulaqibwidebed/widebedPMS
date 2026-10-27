import { notifyRole, notifyUser } from '@/services/notificationService.js'

// Roles the Firestore rules accept. Any other spelling is rejected, so it is checked here first.
export const NOTIFY_ROLES = ['director', 'finance', 'it', 'hr', 'operations', 'procurement', 'marketing']

/**
 * Send a notification from any page. Fire and forget: it never throws, so a failed
 * notification can never block or undo what the user just did.
 *
 *   sendNotification({
 *     roles: ['finance', 'director'],     // everyone in these roles
 *     uids: [inquiry.assignedToUid],      // and/or specific people
 *     title: 'New expense to review',     // short; notifications with the same title are grouped
 *     message: 'Ali submitted RM 250 for Unit 12.',
 *     link: '/Finance/expenses',          // must start with /
 *     type: 'expense',                    // any label
 *     refId: expense.id,                  // optional: the record it is about
 *     skipUid: me.user.uid,               // optional: do not send to this person
 *   })
 */
// export async function sendNotification({ roles = [], uids = [], title, message = '', link = '/Notifications', type = 'general', refId = null, skipUid = null }) {
//   const base = { title, message, link, type, refId }
//   const badRoles = roles.filter((r) => !NOTIFY_ROLES.includes(r))
//   if (badRoles.length) console.warn('sendNotification: unknown role(s) skipped:', badRoles.join(', '))

//   const jobs = [
//     ...[...new Set(roles)].filter((r) => NOTIFY_ROLES.includes(r)).map((recipientRole) => notifyRole({ ...base, recipientRole })),
//     ...[...new Set(uids)].filter((u) => u && u !== skipUid).map((recipientUid) => notifyUser({ ...base, recipientUid })),
//   ]

//   const results = await Promise.allSettled(jobs)
//   results.forEach((r) => { if (r.status === 'rejected') console.error('Notification failed:', r.reason) })
// }

export async function sendNotification({ roles = [], uids = [], title, message = '', link = '/Notifications', type = 'general', refId = null, skipUid = null }) {
  const targetRoles = [...new Set(roles)].filter((r) => NOTIFY_ROLES.includes(r));
  const targetUids = [...new Set(uids)].filter((u) => u && u !== skipUid);

  console.log('[sendNotification debug]', { targetRoles, targetUids, skipUid, rawUids: uids });

  if (targetRoles.length === 0 && targetUids.length === 0) {
    console.warn('[sendNotification] No valid recipients after filtering! Notification aborted.');
    return;
  }

  const base = { title, message, link, type, refId };
  const jobs = [
    ...targetRoles.map((recipientRole) => notifyRole({ ...base, recipientRole })),
    ...targetUids.map((recipientUid) => notifyUser({ ...base, recipientUid })),
  ];

  const results = await Promise.allSettled(jobs);
  console.log('[sendNotification results]', results);
}