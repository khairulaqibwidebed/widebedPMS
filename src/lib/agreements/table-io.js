// lib/agreements/table-io.js — CSV and Excel import/export for the records grid.
import { exportValue, parseInput } from './format.js';
import { hasValue } from './fields.js';

export function toCsv(rows) {
  const cell = v => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return '﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n');   // BOM so Excel reads RM and Chinese text
}
export function parseCsv(text) {
  const rows = []; let row = [], cur = '', q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim() !== ''));
}

// Header row + one row per record, plain values (numbers stay numbers).
export function tableRows(columns, records, valuesOf) {
  const head = columns.map(c => c.label);
  const body = records.map(r => columns.map(c => (c.field ? exportValue(c.field, valuesOf(r)[c.field.id]) : c.plain(r))));
  return [head, ...body];
}

export async function exportFile(kind, name, rows) {
  if (kind === 'csv') {
    const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' });
    return save(blob, name + '.csv');
  }
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Records');
  XLSX.writeFile(wb, name + '.xlsx');
}
function save(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// Reads a .csv or .xlsx file into rows of cells (the first row is the header).
export async function readTableFile(file) {
  if (/\.csv$/i.test(file.name)) return parseCsv(await file.text());
  const XLSX = await import('xlsx');
  const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array', cellDates: true });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' });
}

// Matches header names to fields (by name or id) and turns each row into record values.
export function importPlan(table, fields) {
  const [head = [], ...body] = table;
  const usable = fields.filter(f => hasValue(f) && !['formula', 'signature', 'image', 'file'].includes(f.type));
  const cols = head.map(h => {
    const k = String(h).trim().toLowerCase();
    if (k === 'status') return { header: h, status: true };
    return { header: h, field: usable.find(f => f.label.trim().toLowerCase() === k || f.id === String(h).trim()) || null };
  });
  const problems = [];
  const records = body.map((cells, i) => {
    const values = {}; let status = 'draft';
    cols.forEach((c, j) => {
      const raw = cells[j];
      if (c.status) { const s = String(raw || '').toLowerCase(); if (['draft', 'completed', 'archived'].includes(s)) status = s; return; }
      if (!c.field) return;
      const v = parseInput(c.field, raw);
      if (v === undefined) problems.push(`Row ${i + 2}, ${c.header}: "${raw}" can't be read as ${c.field.type}.`);
      else values[c.field.id] = v;
    });
    return { values, status };
  });
  return { matched: cols.filter(c => c.field).map(c => c.header), ignored: cols.filter(c => !c.field && !c.status).map(c => c.header), records, problems };
}
