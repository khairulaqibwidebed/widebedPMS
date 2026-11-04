// lib/performance/calc.js — every pure calculation used by the performance management feature, with no
// Firestore or Firebase import. Kept separate so the formulas in Phases 3.4/4.3/4.6/5.3 of the spec can be
// unit-tested directly (see src/lib/performance/__tests__/calc.test.js) without a Firestore emulator.
// quarters.js / coh.js / kpi.js / tms.js import and re-export from here — nothing about their public API changes.

export const DEFAULT_WEIGHTS = { coh: 30, kpi: 40, tms: 30 };

export const STATUSES = ['draft', 'upcoming', 'active', 'evaluation', 'pendingApproval', 'finalized', 'archived'];
const FORWARD = { draft: 'upcoming', upcoming: 'active', active: 'evaluation', evaluation: 'pendingApproval', pendingApproval: 'finalized', finalized: 'archived' };
export function canAdvance(status) { return !!FORWARD[status]; }
export function nextStatus(status) { return FORWARD[status] || null; }

export function weightsOk(weights) {
  const w = weights || DEFAULT_WEIGHTS;
  return Number(w.coh) + Number(w.kpi) + Number(w.tms) === 100;
}

// Phase 3.4 — COH: average of valid ratings received, scaled to the quarter's COH weight. Below the configured
// minimum, explicitly "insufficient data" rather than a silent zero or a free pass.
export function cohScoreFromRatings(averageRatings, minValid, cohWeight) {
  if (averageRatings.length < minValid) return { status: 'insufficientData', score: null, averageRating: null, count: averageRatings.length };
  const avg = averageRatings.reduce((s, r) => s + r, 0) / averageRatings.length;
  return { status: 'ok', score: Math.round((avg / 5) * cohWeight * 100) / 100, averageRating: Math.round(avg * 100) / 100, count: averageRatings.length };
}

// Phase 4.3 — deadline-based rating suggestion. Uses the actual completion timestamp, not "today"; a null
// completionTimestamp (not completed) always suggests 0, never a free pass. No deadline configured: the
// reviewer decides (returns null) rather than guessing.
export const DEFAULT_DEADLINE_THRESHOLDS = [
  { minDaysEarly: 7, rating: 5 },
  { minDaysEarly: 4, rating: 4 },
  { minDaysEarly: 1, rating: 4 },
  { minDaysEarly: 0, rating: 3 },
  { minDaysEarly: -Infinity, rating: 1 }
];
export function suggestDeadlineRating(deadline, completionTimestamp, thresholds = DEFAULT_DEADLINE_THRESHOLDS) {
  if (!completionTimestamp) return 0;
  if (!deadline) return null;
  const due = new Date(deadline + 'T23:59:59');
  const done = new Date(completionTimestamp);
  const daysEarly = Math.floor((due - done) / 86400000);
  for (const t of thresholds) if (daysEarly >= t.minDaysEarly) return t.rating;
  return thresholds[thresholds.length - 1]?.rating ?? 1;
}

// A Director may configure a simpler 3-tier early/on-time/overdue rule per KPI task instead of the 5-tier
// DEFAULT_DEADLINE_THRESHOLDS above (that default is untouched and still applies whenever a task has no
// override). Converts to the same { minDaysEarly, rating } shape suggestDeadlineRating already understands,
// so nothing about the scoring function itself changes — only which thresholds get passed in.
export function customThresholds({ earlyDays = 3, earlyRating = 5, onTimeRating = 3, overdueRating = 1 } = {}) {
  return [
    { minDaysEarly: Math.max(1, Number(earlyDays) || 1), rating: Number(earlyRating) },
    { minDaysEarly: 0, rating: Number(onTimeRating) },
    { minDaysEarly: -Infinity, rating: Number(overdueRating) }
  ];
}

export function totalWeightage(assignments) { return assignments.reduce((s, a) => s + Number(a.weightage || 0), 0); }

// Phase 4.6 — KPI: weighted average of only the KPIs with a final approved rating, scaled to kpiWeight.
// An assignment still pending review blocks "ok" (returns 'pending') instead of being treated as a zero.
export function kpiScoreFor(assignments, submissionsByAssignmentId, kpiWeight) {
  if (!assignments.length) return { status: 'n/a', score: null };
  const rated = assignments.filter(a => submissionsByAssignmentId[a.id]?.finalApprovedRating != null);
  if (rated.length < assignments.length) return { status: 'pending', score: null, rated: rated.length, total: assignments.length };
  const weightedSum = rated.reduce((s, a) => s + submissionsByAssignmentId[a.id].finalApprovedRating * a.weightage, 0) / 100;
  return { status: 'ok', score: Math.round((weightedSum / 5) * kpiWeight * 100) / 100 };
}

// Phase 5.4 — TMS attribution: cancelled tasks excluded; a multi-assignee task counts once per assignee
// (equal weight, never doubled for one person); tasks without a due date are still eligible.
export function attributeTasksFor(employeeUid, tasks) {
  const eligible = [], excluded = [], reasons = {};
  for (const t of tasks) {
    if (!t.assignees?.includes(employeeUid)) continue;
    if (t.cancelled) { excluded.push(t.id); reasons[t.id] = 'Cancelled'; continue; }
    eligible.push(t.id);
  }
  const completed = tasks.filter(t => eligible.includes(t.id) && (t.status === 'completed' || t.status === 'done')).map(t => t.id);
  return { eligibleTaskIds: eligible, completedTaskIds: completed, excludedTaskIds: excluded, exclusionReasons: reasons };
}

// Phase 5.3 — TMS score: equal weight per task, never scaled by priority, difficulty or duration.
// No eligible tasks -> explicitly "n/a", never a free 30/30.
export function tmsScoreFromCounts(totalTasks, completedTasks, tmsWeight) {
  if (totalTasks === 0) return { status: 'n/a', score: null };
  return { status: 'ok', score: Math.round((completedTasks / totalTasks) * tmsWeight * 100) / 100 };
}
