// lib/agreements/public.js — what the public fill-in page (/f/<link name>) uses. No sign-in: every call goes to the
// Apps Script with the link name and its password, and the script decides what the visitor may see or save.
import { DRIVE_URL, MAX_UPLOAD } from './drive.js';
import { bytesToBase64, base64ToBytes } from './bytes.js';

async function call(action, body) {
  if (!DRIVE_URL) throw new Error('This form is not available right now.');
  let res;
  try { res = await fetch(DRIVE_URL, { method: 'POST', body: JSON.stringify({ action, ...body }) }); }
  catch (_) { throw new Error('No internet connection. Check your connection and try again.'); }
  let data;
  try { data = await res.json(); } catch (_) { throw new Error('Something went wrong. Please try again in a moment.'); }
  if (!data.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

export const linkInfo = slug => call('linkInfo', { slug });
export const openLink = (slug, password) => call('linkOpen', { slug, password });
export async function linkTemplateBytes(slug, password) {
  const r = await call('linkTemplate', { slug, password });
  return base64ToBytes(r.data);
}
export async function linkUpload(slug, password, bytes, name, mime) {
  if (bytes.length > MAX_UPLOAD) throw new Error('This file is larger than 15 MB.');
  return call('linkUpload', { slug, password, name, mime, data: bytesToBase64(bytes) });
}
export const submitLink = (slug, password, values) => call('linkSubmit', { slug, password, values });
export const savePdf = (slug, password, receipt, bytes, name, title) =>
  call('linkSavePdf', { slug, password, recordId: receipt.recordId, receipt: receipt.receipt, name, title, data: bytesToBase64(bytes) });
export async function linkResult(slug, password) {
  const r = await call('linkResult', { slug, password });
  return { bytes: base64ToBytes(r.data), name: r.name };
}
