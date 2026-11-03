// Phones: every table shows as cards (one card per row). CSS in app.css ("Phone cards") does the layout; this file
// copies each column heading onto its cells as data-label, so a card reads "Unit: DM 0712" without each page
// typing the labels. Runs only while the screen is phone width, and again whenever a table's rows change.
// Per-table polish uses classes on the cells (see app.css): ct-title, ct-badge, ct-hide, ct-actions.
const PHONE = '(max-width: 600px)';
const TABLES = 'table.table, table.perm-table';

// Heading text per column, following colspan in the heading row.
function headings(table) {
  const row = table.tHead?.rows[table.tHead.rows.length - 1];
  if (!row) return [];
  const out = [];
  for (const th of row.cells) {
    const text = (th.dataset.label ?? th.textContent).replace(/\s+/g, ' ').trim();
    for (let i = 0; i < (th.colSpan || 1); i++) out.push(text);
  }
  return out;
}

function label(table) {
  const heads = headings(table);
  for (const body of table.tBodies) {
    for (const tr of body.rows) {
      let col = 0;
      for (const td of tr.cells) {
        const span = td.colSpan || 1;
        // A cell across most of the row ("No tickets match.") is a full-width line with no label
        if (span > 1 && span >= heads.length - 1) td.classList.add('ct-full');
        else if (!td.hasAttribute('data-fixed-label')) {
          const text = heads[col] || '';
          if (td.getAttribute('data-label') !== text) td.setAttribute('data-label', text);
        }
        col += span;
      }
    }
  }
}

let queued = false;
function run() {
  queued = false;
  document.querySelectorAll(TABLES).forEach(label);
}
function queue() { if (!queued) { queued = true; requestAnimationFrame(run); } }

export function startCardTables() {
  const mq = window.matchMedia(PHONE);
  let observer = null;
  const toggle = () => {
    if (mq.matches && !observer) {
      observer = new MutationObserver(queue);
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
      queue();
    } else if (!mq.matches && observer) { observer.disconnect(); observer = null; }
  };
  mq.addEventListener('change', toggle);
  if (document.body) toggle(); else window.addEventListener('DOMContentLoaded', toggle);
}
