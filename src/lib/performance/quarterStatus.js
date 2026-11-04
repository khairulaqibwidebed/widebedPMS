// lib/performance/quarterStatus.js
// Quarters now have only three statuses: draft -> active -> finalized.
// Older quarters may still have one of the previous statuses saved in Firestore. normalizeStatus() maps those
// onto the new three, so old quarters keep working without editing the data by hand.

export const STATUSES = ['draft', 'active', 'finalized'];

const LEGACY = {
  upcoming: 'draft',
  evaluation: 'active',
  pendingApproval: 'active',
  archived: 'finalized'
};

export function normalizeStatus(s) {
  if (STATUSES.includes(s)) return s;
  return LEGACY[s] || 'draft';
}

export const STATUS_LABELS = { draft: 'Draft', active: 'Active', finalized: 'Finalized' };

export const STATUS_HELP = {
  draft: 'Being set up by Director/HR. Employees can\'t see it yet.',
  active: 'Open for the quarter: KPIs are assigned, COH peer evaluation and KPI self-rating are open, and Director/HR review and calculate results.',
  finalized: 'Results are locked and released to employees. Changes only through "Request correction" on the approval page.'
};