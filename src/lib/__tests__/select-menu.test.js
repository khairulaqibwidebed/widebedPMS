// The themed list of plain <select>s (13 Nov 2026): what typing leaves in the list. The rest is tested in a browser.
import { describe, it, expect, vi } from 'vitest';
vi.mock('../select-menu.css', () => ({}));
import { filterRows } from '../select-menu.js';
import { PAGES, DAILY_STEPS, SETUP_STEPS } from '../agreements/guide.js';

const rows = [{ label: 'All properties' }, { group: 'Johor' }, { label: 'Austin Hartamas (JB-AH)', inGroup: true }, { label: 'D\' Pristine Medini (JB-DP)', inGroup: true },
  { group: 'KL' }, { label: '183 Ampang (C)', inGroup: true }];
describe('typing in an open dropdown', () => {
  it('keeps the choices that contain what was typed, ignoring spaces and symbols', () => {
    expect(filterRows(rows, 'jbdp').map(r => r.label || r.group)).toEqual(['Johor', 'D\' Pristine Medini (JB-DP)']);
    expect(filterRows(rows, 'AMPANG').map(r => r.label || r.group)).toEqual(['KL', '183 Ampang (C)']);
  });
  it('keeps everything when nothing is typed, and drops headings with no choice left', () => {
    expect(filterRows(rows, '')).toBe(rows);
    expect(filterRows(rows, 'zzz')).toEqual([]);
    expect(filterRows(rows, 'all').map(r => r.label || r.group)).toEqual(['All properties']);
  });
});
describe('the Agreements guide', () => {
  it('every page points at steps that exist', () => {
    const keys = new Set([...DAILY_STEPS, ...SETUP_STEPS].map(s => s.key));
    for (const [name, p] of Object.entries(PAGES)) {
      expect(p.tips.length > 0).toBe(true);
      for (const k of p.steps) expect([name, k, keys.has(k)]).toEqual([name, k, true]);
    }
  });
});
