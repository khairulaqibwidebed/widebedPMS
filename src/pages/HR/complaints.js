// Staff complaints (to HR) and Director complaints (HR to the Directors), kept in this browser until they move to Firebase.
// A staff complaint keeps the sender's id so they can follow it under My complaints; when it is anonymous, HR only sees "Anonymous".
const read = (k, seed) => { try { const v = JSON.parse(localStorage.getItem(k)); if (Array.isArray(v)) return v; } catch {} return seed; };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
export const today = () => new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

const STAFF_SEED = [
  { ref: 'CP-0012', date: '18 Oct 2026', fromId: 'sample-1', fromName: 'Operations 1', anonymous: true, subject: 'Unfair shift changes without notice', details: 'My shifts were changed twice this month with less than a day\'s notice.', status: 'new', files: [] },
  { ref: 'CP-0011', date: '16 Oct 2026', fromId: 'sample-2', fromName: 'Operations 2', anonymous: false, subject: 'Air-cond in staff room not working', details: 'The air-cond in the staff room has not worked for a week.', status: 'new', files: [] },
  { ref: 'CP-0010', date: '9 Oct 2026', fromId: 'sample-3', fromName: 'Housekeeping 1', anonymous: true, subject: 'Rude behaviour in group chat', details: 'Some messages in the team group chat were rude and personal.', status: 'review', files: [] },
  { ref: 'CP-0009', date: '2 Oct 2026', fromId: 'sample-4', fromName: 'Finance user 2', anonymous: false, subject: 'Overtime claim paid late', details: 'My September overtime was paid two weeks late.', status: 'closed', files: [] }
];
const DIR_SEED = [
  { ref: 'DC-003', date: '12 Oct 2026', fromName: 'HR user 1', subject: 'Staff room repairs', details: 'Staff have raised the staff room air-cond three times. A repair budget is needed.', read: true, files: [] },
  { ref: 'DC-002', date: '30 Sep 2026', fromName: 'HR user 1', subject: 'Overtime payment dates', details: 'Overtime has been paid late twice. Please confirm the payment date for overtime.', read: true, files: [] }
];
export const STATUS = { new: ['New', 'amber'], review: ['In review', 'blue'], closed: ['Closed', 'green'] };
export const staffComplaints = () => read('wb.complaints.staff', STAFF_SEED);
export const saveStaffComplaints = v => write('wb.complaints.staff', v);
export const directorComplaints = () => read('wb.complaints.director', DIR_SEED);
export const saveDirectorComplaints = v => write('wb.complaints.director', v);
export const nextRef = (list, prefix, width) => prefix + String(Math.max(0, ...list.map(c => +c.ref.replace(/\D/g, ''))) + 1).padStart(width, '0');
