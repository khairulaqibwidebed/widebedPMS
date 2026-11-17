// Messages to the Task Management System (TMS): a separate Firebase project, on its own Vercel. Nothing here reads or
// writes TMS data directly. Each message carries the signed-in person's PMS ID token, and the TMS function
// (api/pms-task.js there) checks it, reads their users/{uid} here for role and active, and decides. No fixed secret is
// kept in this code. See handoffs/Task_System_PMS_Link.md and the TMS repo's docs/PMS_LINK.md.
//
// PMS uids are TMS uids (staff sign in to the TMS with their PMS account), so assignees are sent as PMS uids.
// Used by Owner Leads / Listing Flow (lib/owner-leads.js, pages/Procurement/OwnerLeads/) and Operations > Issues (syncIssue).
import { auth } from './firebase.js';

// Set VITE_TMS_URL in .env.local to try a TMS preview or a local copy; the live TMS is the fallback.
export const TMS_URL = (import.meta.env.VITE_TMS_URL || 'https://widebed-tms.vercel.app').replace(/\/$/, '');

// One message. Throws with the TMS's own reason (e.g. "Only Directors create tasks") when it refuses.
export async function sendToTasks(action, body = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in first.');
  const idToken = await user.getIdToken();   // refreshed by Firebase when near expiry
  let r;
  try {
    r = await fetch(`${TMS_URL}/api/pms-task`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...body })
    });
  } catch (_) {
    throw new Error('The task system could not be reached.');
  }
  const reply = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(reply.error || 'The task system refused this.');
  return reply;
}

// Director only. data: { title, details, assigneeUids: [uid], dueDate: 'YYYY-MM-DD', departmentId, priority,
// subtasks: ['text'], pmsLink: { type: 'newOwnerListing', id } }. Resolves with the TMS task ID.
export const createTask = async data => (await sendToTasks('create', { data })).taskId;

// Director, an assignee, or a Procurement user on a Procurement task. data: { text, completed: true/false,
// subtasks: [{ id, done }] (ticks) or [{ title, done }] (the whole checklist) }. Resolves { status, completed }.
export const updateTask = (taskId, data) => sendToTasks('update', { taskId, data });

// The TMS tasks linked to one PMS record: [{ id, title, status, completed, subtasksDone, subtasksTotal, dueDate, ... }]
export const listTasksFor = async (type, id) => (await sendToTasks('list', { data: { type, id } })).tasks || [];

// Director or Procurement: open TMS tasks of their department (a Director names one; default procurement) not yet
// linked to a PMS record. [{ id, title, description, dueDate (ISO), status, priority, createdByName, ... }]
export const inbox = async (departmentId) => (await sendToTasks('inbox', { data: departmentId ? { departmentId } : {} })).tasks || [];

// Points an existing TMS task at a PMS record, e.g. link(taskId, { type: 'newOwnerListing', id: 'NL-0001' }).
// Refused (409) when the task is linked to another record already.
export const link = (taskId, pmsLink) => sendToTasks('link', { taskId, data: { pmsLink } });

// One message per save: a note of what changed, the whole checklist as [{ title, done }], completed when given, and
// started (moves a task still before DOING into DOING). Resolves { status, completed }.
// departmentId hands the task to that department ('marketing', 'operation', ...).
// description (when given) replaces the card's description (a New Owner Listing's Description, 11 Nov 2026).
export function syncTask(taskId, { note = '', checklist = [], completed, started, departmentId, description } = {}) {
  const data = { subtasks: checklist.slice(0, 50).map(c => ({ title: String(c.title).slice(0, 200), done: !!c.done })) };
  if (note) data.text = note.slice(0, 2000);
  if (typeof completed === 'boolean') data.completed = completed;
  if (started) data.started = true;
  if (departmentId) data.departmentId = departmentId;
  if (typeof description === 'string') data.description = description.slice(0, 5000);
  return updateTask(taskId, data);
}

// Maintenance tickets (Issues): makes or updates the ticket's card in the TMS Maintenance workspace, on its property's
// board. Call it after every change to a ticket. Only the number is sent: the TMS reads the ticket itself from the PMS
// with your sign-in, so the PMS rules decide who may sync it. Every ticket gets a card, whatever roles are tagged.
// Resolves { taskId (null for a Completed ticket that never had a card), columnId, column (its name, e.g. 'DOING'), status ('open'|'progress'|'done') }.
export const syncIssue = id => sendToTasks('issue', { data: { id } });

// The property boards of the TMS Maintenance workspace: the Property list when raising or editing a ticket (every
// ticket's card goes on its property's board). [{ id, name, pmsPropertyId }]
export const maintenanceBoards = async () => (await sendToTasks('maintenanceBoards')).boards || [];

// Owner Leads (Procurement > Owner Leads / Listing Flow). Every card of the TMS board "Owner Leads" (workspace
// "Business Development & Procurement"). Director, Procurement, Marketing, Operations.
// [{ taskId, title, description, createdAt, updatedAt, dueDate (ISO), column (name),
//    status ('new'|'progress'|'signed'|'live'|'cancelled'|null), assigneeUids, createdByName, pmsLink }]
export const ownerLeads = async () => (await sendToTasks('ownerLeads')).leads || [];

// Director or Procurement: moves an Owner Leads card to the column of that status (any direction).
// status: 'new' | 'progress' | 'signed' | 'live' | 'cancelled'. Resolves { column, status, moved }.
export const moveOwnerLead = (taskId, status) => sendToTasks('moveOwnerLead', { taskId, data: { status } });
// A comment on an Owner Leads card, under the signed-in person's name (a listing's Remarks).
export const commentOwnerLead = (taskId, text) => sendToTasks('commentOwnerLead', { taskId, data: { text } });
// Director only (13 Nov 2026): deletes an Owner Leads card for good, once its listing is deleted here. Resolves { deleted }.
export const deleteOwnerLead = taskId => sendToTasks('deleteOwnerLead', { taskId });
