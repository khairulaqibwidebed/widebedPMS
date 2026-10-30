// lib/agreements/templates.js — checking and uploading an agreement template file.
import { sniff, safeFileName } from './bytes.js';
import { readPages } from './pdf.js';
import { uploadBytes, MAX_UPLOAD } from './drive.js';

// Checks the file is a real PDF, reads its page sizes and stores it in Drive. Returns { id, name, pages }.
export async function uploadTemplateFile(file) {
  if (/\.docx?$/i.test(file.name)) throw new Error('Word files can\'t be shown exactly in a browser. In Word choose File → Save As → PDF, then upload the PDF.');
  if (file.size > MAX_UPLOAD) throw new Error('This file is larger than 15 MB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (sniff(bytes) !== 'application/pdf') throw new Error('This isn\'t a PDF file.');
  let pages;
  try { pages = await readPages(bytes); }
  catch (e) { throw new Error(/sideways/.test(e.message) ? e.message : 'This PDF can\'t be opened. If it has a password, remove it and try again.'); }
  if (!pages.length) throw new Error('This PDF has no pages.');
  const up = await uploadBytes('templates', bytes, safeFileName(file.name), 'application/pdf');
  return { id: up.id, name: up.name, pages, bytes };
}

// Placed fields that no longer fit a new file (fewer pages).
export const offPage = (mappings, pages) => mappings.filter(m => m.page > pages.length);
