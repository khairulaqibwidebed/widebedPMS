// Form builder helpers: choices (12 Nov 2026) and drag and drop.
import { describe, it, expect } from 'vitest';
import { cleanOptions, choiceUsers, renameChoice, dropIndex, moveTo } from '../fields.js';
import { scrollSpeed } from '../drag-scroll.js';

describe('choices', () => {
  it('tidies the list for saving: trimmed, no empty ones, no repeats', () => {
    expect(cleanOptions([' Fully furnished ', '', 'Bare unit', 'bare unit', '   '])).toEqual(['Fully furnished', 'Bare unit']);
    expect(cleanOptions(undefined)).toEqual([]);
  });
  const type = { id: 't', type: 'dropdown', label: 'Tenancy type', options: ['Short term', 'Corporate'], default: 'Corporate' };
  const make = () => [{ ...type }, { id: 'c', label: 'Company name', showIf: { fieldId: 't', op: 'equals', value: 'Corporate' } },
    { id: 'x', label: 'Other', showIf: { fieldId: 'z', op: 'equals', value: 'Corporate' } }];
  it('finds where a choice is used', () => {
    const fields = make();
    expect(choiceUsers(fields, fields[0], ' Corporate ').length).toBe(2);   // the default and one rule
    expect(choiceUsers(fields, fields[0], 'Short term')).toEqual([]);
    expect(choiceUsers(fields, fields[0], '')).toEqual([]);
  });
  it('renaming a choice updates the default and the rules of that field only', () => {
    const fields = make();
    renameChoice(fields, fields[0], 'Corporate', 'Company');
    expect(fields[0].default).toBe('Company');
    expect(fields[1].showIf.value).toBe('Company');
    expect(fields[2].showIf.value).toBe('Corporate');
  });
});

describe('drag and drop', () => {
  it('drops before a row from its top half, after it from the bottom half', () => {
    expect(dropIndex(3, 105, 100, 40)).toBe(3);
    expect(dropIndex(3, 125, 100, 40)).toBe(4);
  });
  it('moves a field to the place the line showed', () => {
    expect(moveTo(['a', 'b', 'c', 'd'], 0, 3)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveTo(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
    expect(moveTo(['a', 'b', 'c', 'd'], 1, 4)).toEqual(['a', 'c', 'd', 'b']);
    expect(moveTo(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'b', 'c']);
    expect(moveTo(['a', 'b', 'c'], 1, 2)).toEqual(['a', 'b', 'c']);
  });
  it('scrolls up near the top edge, down near the bottom, not in the middle', () => {
    expect(scrollSpeed(70, 62, 900) < 0).toBe(true);
    expect(scrollSpeed(880, 62, 900) > 0).toBe(true);
    expect(scrollSpeed(450, 62, 900)).toBe(0);
    expect(scrollSpeed(10, 62, 900)).toBe(-1300);   // over the top bar: full speed
  });
});
