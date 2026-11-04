import { describe, it, expect } from 'vitest';
import {
  weightsOk, canAdvance, nextStatus,
  cohScoreFromRatings,
  suggestDeadlineRating, DEFAULT_DEADLINE_THRESHOLDS, customThresholds,
  totalWeightage, kpiScoreFor,
  attributeTasksFor, tmsScoreFromCounts,
  isCohOnly, finalScoreFor
} from '../calc.js';

describe('quarter weights and lifecycle', () => {
  it('accepts weights that sum to 100', () => {
    expect(weightsOk({ coh: 30, kpi: 40, tms: 30 })).toBe(true);
  });
  it('rejects weights that do not sum to 100', () => {
    expect(weightsOk({ coh: 30, kpi: 40, tms: 20 })).toBe(false);
  });
  it('moves forward through the lifecycle', () => {
    expect(nextStatus('draft')).toBe('upcoming');
    expect(nextStatus('evaluation')).toBe('pendingApproval');
  });
  it('has no forward move from finalized or archived', () => {
    expect(canAdvance('archived')).toBe(false);
  });
});

describe('COH score (Phase 3.4)', () => {
  it('matches the spec example: 4.20 average -> 25.20 contribution', () => {
    const result = cohScoreFromRatings([4.2], 1, 30);
    expect(result.status).toBe('ok');
    expect(result.score).toBe(25.2);
  });
  it('is insufficient data below the configured minimum, not a silent zero', () => {
    const result = cohScoreFromRatings([5], 3, 30);
    expect(result.status).toBe('insufficientData');
    expect(result.score).toBeNull();
  });
  it('averages multiple evaluators correctly', () => {
    const result = cohScoreFromRatings([4, 5, 3], 1, 30);
    expect(result.averageRating).toBe(4);
    expect(result.score).toBe(24);
  });
});

describe('KPI deadline-based rating suggestion (Phase 4.3)', () => {
  it('suggests 5 for 7+ days early', () => {
    expect(suggestDeadlineRating('2026-09-20', '2026-09-10')).toBe(5);
  });
  it('suggests 4 for 4-6 days early', () => {
    expect(suggestDeadlineRating('2026-09-20', '2026-09-15')).toBe(4);
  });
  it('suggests 4 for 1-3 days early', () => {
    expect(suggestDeadlineRating('2026-09-20', '2026-09-18')).toBe(4);
  });
  it('suggests 3 for completion on the due date', () => {
    expect(suggestDeadlineRating('2026-09-20', '2026-09-20T10:00:00')).toBe(3);
  });
  it('suggests 1 for completion after the deadline', () => {
    expect(suggestDeadlineRating('2026-09-20', '2026-09-22')).toBe(1);
  });
  it('is 0 when not completed at all, not a free pass', () => {
    expect(suggestDeadlineRating('2026-09-20', null)).toBe(0);
  });
  it('returns null (reviewer decides) when there is no deadline configured', () => {
    expect(suggestDeadlineRating('', '2026-09-10')).toBeNull();
  });
  it('respects custom configured thresholds', () => {
    const custom = [{ minDaysEarly: 1, rating: 5 }, { minDaysEarly: -Infinity, rating: 2 }];
    expect(suggestDeadlineRating('2026-09-20', '2026-09-10', custom)).toBe(5);
    expect(suggestDeadlineRating('2026-09-20', '2026-09-21', custom)).toBe(2);
  });
});

describe('customThresholds (Director-configured early/on-time/overdue)', () => {
  it('builds a 3-tier threshold array suggestDeadlineRating understands', () => {
    const t = customThresholds({ earlyDays: 5, earlyRating: 5, onTimeRating: 3, overdueRating: 1 });
    expect(suggestDeadlineRating('2026-09-20', '2026-09-10', t)).toBe(5); // 10+ days early
    expect(suggestDeadlineRating('2026-09-20', '2026-09-18', t)).toBe(3); // 2 days early, below the 5-day bar -> on-time bucket
    expect(suggestDeadlineRating('2026-09-20', '2026-09-22', t)).toBe(1); // overdue
  });
  it('falls back to sensible defaults when given no config', () => {
    expect(customThresholds()).toEqual([
      { minDaysEarly: 3, rating: 5 }, { minDaysEarly: 0, rating: 3 }, { minDaysEarly: -Infinity, rating: 1 }
    ]);
  });
});

describe('KPI score (Phase 4.6)', () => {
  it('matches the spec example: weighted rating 4.20 -> 33.60 contribution', () => {
    const assignments = [
      { id: 'a', weightage: 40 }, { id: 'b', weightage: 30 }, { id: 'c', weightage: 20 }, { id: 'd', weightage: 10 }
    ];
    const subs = {
      a: { finalApprovedRating: 5 }, b: { finalApprovedRating: 4 }, c: { finalApprovedRating: 3 }, d: { finalApprovedRating: 4 }
    };
    const result = kpiScoreFor(assignments, subs, 40);
    expect(result.status).toBe('ok');
    expect(result.score).toBe(33.6);
  });
  it('is pending (not zero) while any KPI lacks a final approved rating', () => {
    const assignments = [{ id: 'a', weightage: 100 }];
    const result = kpiScoreFor(assignments, { a: { finalApprovedRating: null } }, 40);
    expect(result.status).toBe('pending');
    expect(result.score).toBeNull();
  });
  it('is n/a when there are no assignments at all', () => {
    expect(kpiScoreFor([], {}, 40).status).toBe('n/a');
  });
});

describe('KPI weightage validation', () => {
  it('sums weightages across an employee\'s assignments', () => {
    expect(totalWeightage([{ weightage: 40 }, { weightage: 30 }, { weightage: 30 }])).toBe(100);
  });
});

describe('TMS attribution and score (Phase 5.3/5.4)', () => {
  const tasks = [
    { id: 't1', assignees: ['u1'], status: 'completed', cancelled: false },
    { id: 't2', assignees: ['u1'], status: 'open', cancelled: false },
    { id: 't3', assignees: ['u1'], status: 'open', cancelled: true },
    { id: 't4', assignees: ['u1', 'u2'], status: 'completed', cancelled: false },
    { id: 't5', assignees: ['u2'], status: 'completed', cancelled: false }
  ];

  it('excludes cancelled tasks', () => {
    const r = attributeTasksFor('u1', tasks);
    expect(r.eligibleTaskIds).not.toContain('t3');
    expect(r.excludedTaskIds).toContain('t3');
    expect(r.exclusionReasons.t3).toBe('Cancelled');
  });
  it('counts a multi-assignee task once per assignee, never doubled', () => {
    const r = attributeTasksFor('u1', tasks);
    expect(r.eligibleTaskIds.filter(id => id === 't4').length).toBe(1);
  });
  it('does not attribute another employee\'s solo task', () => {
    const r = attributeTasksFor('u1', tasks);
    expect(r.eligibleTaskIds).not.toContain('t5');
  });
  it('matches the spec example: 16/20 completed -> 24.00/30', () => {
    expect(tmsScoreFromCounts(20, 16, 30).score).toBe(24);
  });
  it('is n/a (never a free 30) when there are no eligible tasks', () => {
    const result = tmsScoreFromCounts(0, 0, 30);
    expect(result.status).toBe('n/a');
    expect(result.score).toBeNull();
  });
  it('gives equal weight regardless of how many tasks are completed vs total', () => {
    expect(tmsScoreFromCounts(4, 2, 30).score).toBe(15);
    expect(tmsScoreFromCounts(10, 5, 30).score).toBe(15);
  });
});

describe('final score and Directors (COH only)', () => {
  const W = { coh: 30, kpi: 40, tms: 30 };
  const ok = score => ({ status: 'ok', score });
  it('only Directors are COH-only', () => {
    expect(isCohOnly('director')).toBe(true);
    expect(isCohOnly('hr')).toBe(false);
    expect(isCohOnly(undefined)).toBe(false);
  });
  it('adds all three components for everyone else', () => {
    expect(finalScoreFor({ coh: ok(25.2), kpi: ok(33.6), tms: ok(24) }, W)).toBe(82.8);
  });
  it('is null while KPI is still pending for everyone else', () => {
    expect(finalScoreFor({ coh: ok(25.2), kpi: { status: 'pending', score: null }, tms: ok(24) }, W)).toBeNull();
  });
  it('scales COH to /100 for a Director, ignoring KPI and TMS entirely', () => {
    const na = { status: 'notApplicable', score: null };
    expect(finalScoreFor({ coh: ok(25.2), kpi: na, tms: na }, W, { cohOnly: true })).toBe(84);
  });
  it('is null for a Director until COH has enough evaluations', () => {
    const na = { status: 'notApplicable', score: null };
    expect(finalScoreFor({ coh: { status: 'insufficientData', score: null }, kpi: na, tms: na }, W, { cohOnly: true })).toBeNull();
  });
});