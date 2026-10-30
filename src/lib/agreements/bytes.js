// lib/agreements/bytes.js — small helpers for file bytes.

export function bytesToBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export function base64ToBytes(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
export const dataUrlToBytes = url => base64ToBytes(url.slice(url.indexOf(',') + 1));

export function downloadBytes(bytes, name, mime = 'application/pdf') {
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export const safeFileName = s => String(s || 'file').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);

// What a file really is, from its first bytes (the name can lie).
export function sniff(bytes) {
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return 'application/pdf';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return 'application/zip';   // .docx / .xlsx
  return '';
}

// Photos become a JPEG or PNG a PDF can hold, at most 2000 px on the longest side.
export async function normaliseImage(file, maxSide = 2000) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniff(bytes);
  if ((kind === 'image/png' || kind === 'image/jpeg') && bytes.length < 3 * 1024 * 1024) return { bytes, mime: kind };
  let bmp;
  try { bmp = await createImageBitmap(file); } catch (_) { throw new Error('This image type can\'t be read. Use a JPG or PNG photo.'); }
  const s = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * s); canvas.height = Math.round(bmp.height * s);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.86));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), mime: 'image/jpeg' };
}
