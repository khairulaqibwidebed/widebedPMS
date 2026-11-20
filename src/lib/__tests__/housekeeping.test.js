// Housekeeping (17 Nov 2026): username sign-in addresses and COH rating pairs.
import { describe, it, expect } from 'vitest';
import * as H from '../housekeeping.js';

const roles = { boss: 'director', hr1: 'hr', ops: 'operations', fin: 'finance', hk1: 'housekeeping', hk2: 'housekeeping' };
const roleOf = uid => roles[uid] || '';
const uids = Object.keys(roles);

describe('usernames', () => {
  it('turns a username into the hidden sign-in address and back', () => {
    expect(H.hkEmail(' Siti ')).toBe('siti@housekeeping.widebed.com');
    expect(H.usernameOf('siti@housekeeping.widebed.com')).toBe('siti');
    expect(H.usernameOf('siti@widebed.com')).toBe('');
  });
  it('checks usernames and passwords', () => {
    expect(H.usernameOk('siti.a')).toBe(true);
    expect(H.usernameOk('ab')).toBe(false);
    expect(H.usernameOk('siti a')).toBe(false);
    expect(H.passwordProblem('short1')).toMatch(/8/);
    expect(H.passwordProblem('nonumbers')).toMatch(/number/);
    expect(H.passwordProblem('clean123')).toBe('');
  });
});

describe('COH pairs', () => {
  const pairs = { boss: ['hk1', 'hk2'], hr1: ['hk1'], hk1: ['hk2', 'ops'] };
  it('office staff rate each other as before, but not housekeepers unless paired', () => {
    expect(H.canRate('ops', 'fin', roleOf, pairs)).toBe(true);
    expect(H.canRate('ops', 'hk1', roleOf, pairs)).toBe(false);
    expect(H.canRate('boss', 'hk2', roleOf, pairs)).toBe(true);
    expect(H.canRate('hk1', 'hk1', roleOf, pairs)).toBe(false);
  });
  it('a housekeeper rates only whom HR listed', () => {
    expect(H.rateesOf('hk1', uids, roleOf, pairs)).toEqual(['ops', 'hk2']);
    expect(H.rateesOf('hk2', uids, roleOf, pairs)).toEqual([]);
  });
  it('counts who should rate someone', () => {
    expect(H.ratersOf('hk1', uids, roleOf, pairs)).toEqual(['boss', 'hr1']);
    expect(H.ratersOf('ops', uids, roleOf, pairs)).toEqual(['boss', 'hr1', 'fin', 'hk1']);
  });
  it('edits rated-by and rates lists, and tidies before saving', () => {
    let p = H.setRatedBy(pairs, 'hk1', ['fin']);
    expect(H.ratedByList('hk1', p)).toEqual(['fin']);
    expect(p.boss).toEqual(['hk2']);
    p = H.setRates(p, 'hk1', []);
    expect(p.hk1).toBeUndefined();
    const clean = H.cleanPairs({ ops: ['fin', 'hk1', 'ops', 'gone'], hk2: ['hk2'] }, uids, roleOf);
    expect(clean).toEqual({ ops: ['hk1'] });   // office pairs need no listing; self and people not in the quarter dropped
  });
});

// 19 Nov 2026: interns and General work like housekeepers (special(uid))
describe('Interns and General', () => {
  const special = uid => uid === 'fin';   // say fin is an intern or in General
  const pairs = { boss: ['fin'], fin: ['ops'] };
  it('only assigned people rate them, and they rate only whom HR listed', () => {
    expect(H.canRate('ops', 'fin', roleOf, pairs, special)).toBe(false);
    expect(H.canRate('boss', 'fin', roleOf, pairs, special)).toBe(true);
    expect(H.canRate('fin', 'ops', roleOf, pairs, special)).toBe(true);
    expect(H.canRate('fin', 'hr1', roleOf, pairs, special)).toBe(false);
    expect(H.canRate('ops', 'hr1', roleOf, pairs, special)).toBe(true);
    expect(H.ratersOf('fin', uids, roleOf, pairs, special)).toEqual(['boss']);
  });
  it('keeps their pairs when tidying', () => {
    expect(H.cleanPairs({ boss: ['fin', 'ops'], fin: ['ops'] }, uids, roleOf, special)).toEqual({ boss: ['fin'], fin: ['ops'] });
  });
});
