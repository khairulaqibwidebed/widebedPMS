// lib/performance/oneToOnePdf.js — draws the One To One Session form as an A4 PDF (pdf-lib), laid out like HR's Word
// template "One To One - Name Staff (Tahun).docx": page 1 the details and the Code of Honor table, page 2 Behaviour
// Competencies and Action (page 2). Filled in: Date & Venue, Staff Name, Join Date, Position, Topic, and the Code of Honor marks
// (one line per COH question) with their average. Everything else is left empty to write in at the session.
//
// data: { company, topic, date, venue, staffName, ic, joinDate, leaveYear, leave: { cells: [{ label, days }], total }, position,
//         questions: [{ title, mark }], average, raters, expected }
// 17 Nov 2026: IC No. under Staff Name, and a small "Leave taken" table under Join Date.
// 25 Nov 2026: "Leave taken until <session date>", and data.notes (the write-in boxes typed on the page, see emptyNotes in
// oneToOne.js) printed in their boxes: ratings, what is / isn't working, Behaviour scores and remarks, Action, signature names.
// opts: { logoBytes (JPG, optional), fallbackFontBytes (a TTF for names the built-in fonts can't print, optional) }
const A4 = [595.28, 841.89];
const X0 = 28, WIDTH = 546;                        // the tables' left edge and width (the template's margins)
const BEHAVIOUR = [
  ['Positive', 36, [['I don’t know', 'I can’t'], ['I will find out', 'I will try'], ['I can do it', 'No problem']]],
  ['Passionate', 48, [['No energy', 'Passive & lazy'], ['Normal & no excitement', 'Follow others'], ['Full of energy', 'Aggressive & proactive']]],
  ['Accountability', 56, [['Never complete task', 'Never solve problem'], ['Complete task but late', 'Try to solve problem'], ['Always complete task', 'Always solve problems']]]
];

export async function buildOneToOnePdf(data, opts = {}) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  pdf.setTitle(`One To One Session - ${data.staffName || ''}`.trim());
  const F = { n: await pdf.embedFont(StandardFonts.TimesRoman), b: await pdf.embedFont(StandardFonts.TimesRomanBold), i: await pdf.embedFont(StandardFonts.TimesRomanItalic) };
  let fallback = null;
  if (opts.fallbackFontBytes) {
    try { const fontkit = (await import('@pdf-lib/fontkit')).default; pdf.registerFontkit(fontkit); fallback = await pdf.embedFont(opts.fallbackFontBytes, { subset: true }); } catch (_) { fallback = null; }
  }
  const black = rgb(0, 0, 0);
  const canEncode = (font, text) => { try { font.encodeText(text); return true; } catch (_) { return false; } };
  // The font that can print this text: the asked one, else the fallback, else the asked one with "?" for what it can't print.
  const pick = (font, text) => {
    const t = String(text ?? '').replace(/[\r\n\t]+/g, ' ');
    if (canEncode(font, t)) return { font, text: t };
    if (fallback && canEncode(fallback, t)) return { font: fallback, text: t };
    return { font, text: [...t].map(ch => (canEncode(font, ch) ? ch : '?')).join('') };
  };
  const widthOf = (text, font, size) => { const p = pick(font, text); return p.font.widthOfTextAtSize(p.text, size); };
  // Break text into lines no wider than maxW (a single word wider than that is cut).
  const wrap = (text, font, size, maxW) => {
    const lines = []; let line = '';
    for (const word of String(text ?? '').split(/\s+/).filter(Boolean)) {
      const tryLine = line ? `${line} ${word}` : word;
      if (widthOf(tryLine, font, size) <= maxW) { line = tryLine; continue; }
      if (line) lines.push(line);
      line = word;
      while (widthOf(line, font, size) > maxW && line.length > 1) {
        let cut = line.length - 1;
        while (cut > 1 && widthOf(line.slice(0, cut), font, size) > maxW) cut--;
        lines.push(line.slice(0, cut)); line = line.slice(cut);
      }
    }
    if (line) lines.push(line);
    return lines;
  };

  let page;
  // All positions are measured from the TOP of the page (top = distance down), like reading the form.
  const text = (s, x, top, { font = F.n, size = 9, align = 'left', maxW } = {}) => {
    let p = pick(font, s);
    if (maxW) while (p.text.length > 1 && p.font.widthOfTextAtSize(p.text, size) > maxW) p = { font: p.font, text: p.text.slice(0, -1) };
    const w = p.font.widthOfTextAtSize(p.text, size);
    page.drawText(p.text, { x: align === 'right' ? x - w : align === 'center' ? x - w / 2 : x, y: A4[1] - top - size * 0.72, size, font: p.font, color: black });
    return w;
  };
  const lines = (list, x, top, o = {}) => { const lead = o.lead || (o.size || 9) + 1.5; list.forEach((s, k) => text(s, x, top + k * lead, o)); return list.length * lead; };
  // Typed text in a box: keeps the line breaks HR typed, wraps to maxW, stops at `bottom` (the last line ends with …).
  const para = (s, x, top, maxW, bottom, o = {}) => {
    const size = o.size || 9, lead = o.lead || size + 2;
    let ls = String(s ?? '').split('\n').flatMap(p => (p.trim() ? wrap(p, o.font || F.n, size, maxW) : ['']));
    while (ls.length && !ls[ls.length - 1]) ls.pop();
    const fit = Math.max(0, Math.floor((bottom - top) / lead));
    if (ls.length > fit) { ls = ls.slice(0, fit); if (fit) ls[fit - 1] = ls[fit - 1].replace(/.{0,2}$/, '…'); }
    lines(ls, x, top, { size, lead, font: o.font || F.n });
  };
  const hline = (x1, x2, top) => page.drawLine({ start: { x: x1, y: A4[1] - top }, end: { x: x2, y: A4[1] - top }, thickness: 0.75, color: black });
  const vline = (x, t1, t2) => page.drawLine({ start: { x, y: A4[1] - t1 }, end: { x, y: A4[1] - t2 }, thickness: 0.75, color: black });
  const box = (x, top, w, h) => { hline(x, x + w, top); hline(x, x + w, top + h); vline(x, top, top + h); vline(x + w, top, top + h); };
  const footer = note => {
    text('HR Department', X0 + WIDTH + 6, 806, { font: F.i, size: 8, align: 'right' });
    if (note) text(note, X0, 806, { font: F.i, size: 7.5, maxW: WIDTH - 80 });
  };

  // ================= Page 1 =================
  page = pdf.addPage(A4);
  text(data.company, X0, 16, { font: F.b, size: 12 });
  text('One To One Session', X0, 31, { font: F.b, size: 10.5 });
  if (opts.logoBytes) {
    try { const img = await pdf.embedJpg(opts.logoBytes); const w = 165, h = w * img.height / img.width; page.drawImage(img, { x: X0 + WIDTH - w + 4, y: A4[1] - 12 - h, width: w, height: h }); } catch (_) { /* no logo: the form is still complete */ }
  }
  const info = { font: F.b, size: 10 };
  text(`Date & Venue : ${[data.venue, data.date].filter(Boolean).join(', ')}`, X0, 64, { ...info, maxW: WIDTH });
  const nameW = text('Staff Name: ', X0, 86, info);
  text(data.staffName, X0 + nameW, 86, { ...info, maxW: 398 - nameW - 8 });
  text(`(Join Date : ${data.joinDate || '                    '} )`, X0 + 398, 86, info);
  const leftW = 398 - 8;                           // the left column stops before the Join Date / leave table on the right
  const icW = text('IC No: ', X0, 106, info);
  text(data.ic || '', X0 + icW, 106, { ...info, maxW: leftW - icW });
  const posW = text('Position: ', X0, 126, info);
  text(data.position, X0 + posW, 126, { ...info, maxW: leftW - posW });
  text(`Topic: ${data.topic}`, X0, 146, { ...info, maxW: leftW });

  // Leave taken this year: under Join Date, one column per type and a total (days; blank = not filled in)
  const lv = data.leave || { cells: [], total: '' };
  const lcols = [...lv.cells, { label: 'Total', days: lv.total }];
  const lx = X0 + 398, lw = WIDTH - 398, ltop = 116, lrow = 14, colW = lw / lcols.length;
  const lvTitle = data.leaveUntil ? `Leave taken until ${data.leaveUntil}` : 'Leave taken';
  text(widthOf(`${lvTitle} (days):`, F.b, 8.5) <= lw ? `${lvTitle} (days):` : `${lvTitle}:`, lx, 102, { font: F.b, size: 8.5, maxW: lw });
  box(lx, ltop, lw, lrow * 2); hline(lx, lx + lw, ltop + lrow);
  lcols.forEach((c, k) => {
    if (k) vline(lx + k * colW, ltop, ltop + lrow * 2);
    const cx = lx + k * colW + colW / 2;
    text(c.label, cx, ltop + 3.5, { font: F.b, size: 7.5, align: 'center', maxW: colW - 4 });
    if (c.days !== '') text(c.days, cx, ltop + lrow + 3.5, { font: k === lcols.length - 1 ? F.b : F.n, size: 8.5, align: 'center' });
  });

  // 26 Nov 2026: the Code of Honor marks are their own table on top (three questions a row, in the form's order, read down
  // each column, Average on the last line); the box under it keeps the ratings and what is / isn't working, now wider.
  const head = { font: F.b, size: 8.5 };
  const nt = data.notes || {};
  const q = data.questions || [];
  const qRows = Math.max(1, Math.ceil(q.length / 3));
  const cT = 162, hdrH = 16, rowH = qRows > 9 ? 13 : 15, avgH = 18;
  const tW = WIDTH * 0.24, mW = WIDTH / 3 - tW;                  // one question's title and mark cells
  const cB = cT + hdrH + qRows * rowH + avgH;
  box(X0, cT, WIDTH, cB - cT);
  hline(X0, X0 + WIDTH, cT + hdrH);
  for (let r = 1; r <= qRows; r++) hline(X0, X0 + WIDTH, cT + hdrH + r * rowH);
  [1, 2, 3, 4, 5].forEach(k => vline(X0 + Math.ceil(k / 2) * tW + Math.floor(k / 2) * mW, cT + hdrH, cB - avgH));
  vline(X0 + WIDTH - mW, cB - avgH, cB);
  const hW = text('Code of Honor', X0 + 5, cT + 4, { font: F.b, size: 9.5 });
  if (data.raters) text(`(average from ${data.raters}${data.expected ? ` of ${data.expected}` : ''} colleague${data.raters === 1 ? '' : 's'}, on a scale of 1 to 5)`, X0 + 10 + hW, cT + 5, { font: F.i, size: 8, maxW: WIDTH - hW - 16 });
  q.forEach((item, k) => {
    const col = Math.floor(k / qRows), row = k % qRows;
    const x = X0 + col * (tW + mW), top = cT + hdrH + row * rowH + (rowH - 8.5) / 2;
    const title = String(item.title || '');
    const size = Math.max(6.5, Math.min(8.5, 8.5 * (tW - 10) / Math.max(1, widthOf(title, F.n, 8.5))));   // a long title shrinks a little first
    text(title, x + 5, top + (8.5 - size) / 2, { size, maxW: tW - 10 });
    if (item.mark !== '' && item.mark != null) text(String(item.mark), x + tW + mW / 2, top, { font: F.b, size: 9, align: 'center' });
  });
  text('Average :', X0 + WIDTH - mW - 6, cB - avgH + 3.5, { font: F.b, size: 11, align: 'right' });
  if (data.average) text(String(data.average), X0 + WIDTH - mW / 2, cB - avgH + 3.5, { font: F.b, size: 11, align: 'center' });

  // The box: ratings | what is working | what is not working, Individual on top, Colleague below
  const T = cB + 10, B = 794, H = B - T;
  const cw = [0.18, 0.41, 0.41].map(f => f * WIDTH);
  const cx = [X0, X0 + cw[0], X0 + cw[0] + cw[1]];
  const second = T + H / 2;
  box(X0, T, WIDTH, H); cx.slice(1).forEach(x => vline(x, T, B)); hline(X0, X0 + WIDTH, second);
  const selfH = lines(wrap('Overall Self Rating (1-10) :', F.b, 8.5, cw[0] - 10), cx[0] + 5, T + 4, head);
  text('What is Working (Ind):', cx[1] + 5, T + 4, head);
  text('What is Not Working (Ind) :', cx[2] + 5, T + 4, head);
  const supH = lines(wrap('Superior Rating (1-10) :', F.b, 8.5, cw[0] - 10), cx[0] + 5, second + 4, head);
  text('What is Working (Co):', cx[1] + 5, second + 4, head);
  text('What is Not Working (Co):', cx[2] + 5, second + 4, head);
  // What HR typed: the ratings big under their labels, the four boxes as paragraphs
  if (nt.selfRating) text(nt.selfRating, cx[0] + cw[0] / 2, T + 10 + selfH, { font: F.b, size: 18, align: 'center' });
  if (nt.superiorRating) text(nt.superiorRating, cx[0] + cw[0] / 2, second + 10 + supH, { font: F.b, size: 18, align: 'center' });
  para(nt.workingInd, cx[1] + 5, T + 20, cw[1] - 10, second - 6);
  para(nt.notWorkingInd, cx[2] + 5, T + 20, cw[2] - 10, second - 6);
  para(nt.workingCo, cx[1] + 5, second + 20, cw[1] - 10, B - 6);
  para(nt.notWorkingCo, cx[2] + 5, second + 20, cw[2] - 10, B - 6);
  const from = data.raters ? `Code of Honor marks: the average from ${data.raters}${data.expected ? ` of ${data.expected}` : ''} colleague${data.raters === 1 ? '' : 's'}, on a scale of 1 to 5.` : 'Code of Honor marks: no colleague has rated this person yet.';
  footer(from);

  // ================= Page 2: Behaviour Competencies and Action (2 pages at most, 13 Nov 2026) =================
  // The Behaviour table and the signatures are kept compact so the Action box gets all the room left on the page.
  page = pdf.addPage(A4);
  text('Behaviour Competencies:', X0, 22, { font: F.b, size: 10 });
  const gw = [2405, 1298, 687, 1409, 717, 1247, 737, 2268].map(w => w * WIDTH / 10768);
  const gx = gw.reduce((a, w) => [...a, a[a.length - 1] + w], [X0]);
  let top = 35;
  const row = (h, draw, full) => {
    hline(X0, X0 + WIDTH, top); vline(X0, top, top + h); vline(X0 + WIDTH, top, top + h); vline(gx[1], top, top + h);
    if (!full) gx.slice(2, 8).forEach(x => vline(x, top, top + h));
    draw(top); top += h; hline(X0, X0 + WIDTH, top);
  };
  const bSize = 7, bLead = 8, pairGap = 3;
  row(16, t => {
    ['1', '2', '3', '4', '5'].forEach((s, k) => text(s, gx[k + 1] + gw[k + 1] / 2, t + 3, { size: 9, align: 'center' }));
    text('Self', gx[6] + 4, t + 3, { size: 9 }); text('Superior', gx[7] + 4, t + 3, { size: 9 });
  });
  for (const [name, , cells] of BEHAVIOUR) {
    const bv = nt.behaviour?.[name.toLowerCase()] || {};
    // Each row is as tall as its longest cell
    const wrapped = cells.map((pair, k) => pair.map(phrase => wrap(phrase, F.n, bSize, gw[1 + k * 2] - 6)));
    const h = Math.max(...wrapped.map(pair => pair.reduce((a, ls) => a + ls.length * bLead, 0) + pairGap * (pair.length - 1))) + 7;
    row(h, t => {
      text(name, X0 + 5, t + 3, { font: F.b, size: 9 });
      wrapped.forEach((pair, k) => {
        const col = 1 + k * 2; let y = t + 3;
        pair.forEach(ls => { ls.forEach((s, j) => text(s, gx[col] + gw[col] / 2, y + j * bLead, { size: bSize, align: 'center' })); y += ls.length * bLead + pairGap; });
      });
      if (bv.self) text(bv.self, gx[6] + gw[6] / 2, t + h / 2 - 6, { font: F.b, size: 12, align: 'center' });
      if (bv.superior) text(bv.superior, gx[7] + gw[7] / 2, t + h / 2 - 6, { font: F.b, size: 12, align: 'center' });
    });
    row(15, t => {
      text('Remark:', gx[1] - 5, t + 3, { size: 9, align: 'right' });
      if (bv.remark) text(bv.remark, gx[1] + 5, t + 3, { size: 9, maxW: X0 + WIDTH - gx[1] - 10 });
    }, true);
  }

  // Action: the box takes all the space down to the signatures. Its top row: "Action:" on the left,
  // tick boxes on the right (Confirmation, Extend, Need Training, Other: ____); below them the template's lines
  // (1. Recommendation for Confirmation, If Yes, action, 2. Quarterly Review) and space to write in.
  const sigH = 56;                                   // signature block: label, line, "Name:"
  const aTop = top + 12, aBottom = 798 - sigH - 14, aH = aBottom - aTop, headH = 28;
  box(X0, aTop, WIDTH, aH);
  hline(X0, X0 + WIDTH, aTop + headH);
  const mid = aTop + headH / 2;
  text('Action:', X0 + 8, mid - 6, { font: F.b, size: 12 });
  const tick = { size: 10 }, sq = 10, gap = 6, between = 18, otherLine = 80;
  const choices = ['Confirmation', 'Extend', 'Need Training', 'Other:'];
  const widths = choices.map(o => sq + gap + widthOf(o, F.n, tick.size));
  const total = widths.reduce((a, w) => a + w, 0) + between * (choices.length - 1) + 4 + otherLine;
  let x = X0 + WIDTH - 10 - total;
  const ticked = ['confirmation', 'extend', 'training', 'other'].map(k => nt.actions?.[k] === true);
  choices.forEach((o, k) => {
    box(x, mid - sq / 2, sq, sq);
    if (ticked[k]) {   // a cross in the box
      page.drawLine({ start: { x: x + 2, y: A4[1] - (mid - sq / 2 + 2) }, end: { x: x + sq - 2, y: A4[1] - (mid + sq / 2 - 2) }, thickness: 1.2, color: black });
      page.drawLine({ start: { x: x + 2, y: A4[1] - (mid + sq / 2 - 2) }, end: { x: x + sq - 2, y: A4[1] - (mid - sq / 2 + 2) }, thickness: 1.2, color: black });
    }
    text(o, x + sq + gap, mid - 4.5, tick);
    x += widths[k] + between;
  });
  hline(x - between + 4, x - between + 4 + otherLine, mid + 5);   // the line after "Other:" to write on
  if (nt.otherAction) text(nt.otherAction, x - between + 6, mid - 4.5, { size: 9, maxW: otherLine - 4 });
  // Under the tick boxes, the template's own lines; the rest is space to write in.
  const body = aTop + headH;
  const recW = text('1.     Recommendation for Confirmation:  ', X0 + 8, body + 16, { size: 9 });
  text(nt.recommendation ?? 'N/A', X0 + 8 + recW, body + 16, { size: 9, maxW: WIDTH - recW - 20 });
  const yesW = text('If Yes, action:  ', X0 + 26, body + 36, { font: F.i, size: 9 });
  if (nt.ifYes) para(nt.ifYes, X0 + 26 + yesW, body + 36, WIDTH - 26 - yesW - 16, body + 70);
  text('2.     Quarterly Review :', X0 + 8, body + 74, { size: 9 });
  para(nt.quarterlyReview, X0 + 26, body + 90, WIDTH - 42, aBottom - 6);

  // Signatures, side by side under the box
  const sTop = aBottom + 14;
  [['Attended by:', X0 + 5, nt.attendedBy], ['Acknowledged by:', X0 + WIDTH / 2 + 20, nt.acknowledgedBy]].forEach(([label, sx, who]) => {
    text(label, sx, sTop, { size: 10 });
    hline(sx, sx + 170, sTop + 38);
    const nW = text('Name: ', sx, sTop + 44, { size: 10 });
    if (who) text(who, sx + nW, sTop + 44, { size: 10, maxW: 220 - nW });
  });
  footer('');
  return pdf.save();
}