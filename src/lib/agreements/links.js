// lib/agreements/links.js — fill-in links for outside people: names, addresses and passwords.

// Link names become the address /f/<name>: small letters, numbers and dashes.
export const slugify = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 60);
export const SLUG_OK = /^[a-z0-9-]{3,60}$/;
export const linkUrl = slug => `${window.location.origin}/f/${slug}`;

// Passwords are kept as salt + SHA-256 (the Apps Script checks them the same way); nobody can read them back.
export async function hashPassword(password) {
  const salt = Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, '0')).join('');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + password));
  return { passSalt: salt, passHash: Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('') };
}
// Easy to read out on the phone: no 0/O or 1/l.
export function makePassword(n = 6) {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(n)), b => chars[b % chars.length]).join('');
}
export function linkState(l) {
  if (l.kind === 'personal' && l.submittedAt) return { key: 'done', label: 'Submitted', pill: 'green' };
  if (l.active === false) return { key: 'off', label: 'Turned off', pill: 'grey' };
  if (l.expiresAt && new Date(l.expiresAt + 'T23:59:59+08:00') < new Date()) return { key: 'expired', label: 'Expired', pill: 'amber' };
  return { key: 'on', label: 'Open', pill: 'blue' };
}
