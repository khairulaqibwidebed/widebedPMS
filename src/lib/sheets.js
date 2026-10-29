// Forms that save to Google Sheets (not Firestore). Each form posts to a Google Apps Script web app that is
// bound to its Sheet and adds a row; see handoffs/Lodgment_Apps_Script.gs. Set the web app URL in .env.local
// (VITE_LODGMENT_SHEET_URL) or paste it below.
export const LODGMENT_SHEET_URL = import.meta.env.VITE_LODGMENT_SHEET_URL || import.meta.env.VITE_LODGEMENT_SHEET_URL || '';   // both spellings work

// Sends one row. Returns { ok: true, confirmed: true } when Google answers, or { ok: true, confirmed: false } when the browser
// could not read the answer (Google's redirect has no CORS headers on some accounts). The request is sent only once,
// because the row has usually been added even when the answer cannot be read.
export async function postToSheet(url, form, row) {
  if (!url) throw new Error('The Google Sheet link is not set yet. Add VITE_LODGMENT_SHEET_URL to .env.local and restart npm run dev.');
  const body = JSON.stringify({ form, row });
  try {
    // text/plain keeps this a simple request, so the browser does not need Google to answer a preflight
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body });
    let out = null;
    try { out = await res.json(); } catch (e) { /* not JSON */ }
    if (out && out.ok === false) throw new Error(out.error || 'The Google Sheet refused the row.');
    if (!out) throw new Error('The Google Sheet did not confirm the row was added. Check the Apps Script deployment (access: Anyone).');
    return { ok: true, confirmed: true, id: out.id || '' };
  } catch (e) {
    if (e instanceof TypeError) return { ok: true, confirmed: false };   // sent, answer unreadable
    throw e;
  }
}
