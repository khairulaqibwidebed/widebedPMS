// lib/performance/oneToOnePdf.js — draws the One To One Session form as an A4 PDF (pdf-lib), laid out like HR's Word
// template "One To One - Name Staff (Tahun).docx": page 1 the details and the Code of Honor table, page 2 Behaviour
// Competencies and Action (page 2). Filled in: Date & Venue, Staff Name, Join Date, Position, Topic, and the Code of Honor marks
// (one line per COH question) with their average. Everything else is left empty to write in at the session.
//
// data: { company, topic, date, venue, staffName, joinDate, position, questions: [{ title, mark }], average, raters, expected }
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
  const posW = text('Position: ', X0, 108, info);
  text(data.position, X0 + posW, 108, { ...info, maxW: WIDTH - posW });
  text(`Topic: ${data.topic}`, X0, 130, info);

  // The big table: Code of Honor | ratings | what is working | what is not working
  const T = 146, B = 794, H = B - T;
  const cw = [2376, 1701, 3148, 3543].map(w => w * WIDTH / 10768);
  const cx = [X0, X0 + cw[0], X0 + cw[0] + cw[1], X0 + cw[0] + cw[1] + cw[2]];
  box(X0, T, WIDTH, H); cx.slice(1).forEach(x => vline(x, T, B));
  const head = { font: F.b, size: 8.5 };
  text('Code of Honor :', cx[0] + 5, T + 4, head);
  lines(wrap('Overall Self Rating (1-10) :', F.b, 8.5, cw[1] - 10), cx[1] + 5, T + 4, head);
  text('What is Working (Ind):', cx[2] + 5, T + 4, head);
  text('What is Not Working (Ind) :', cx[3] + 5, T + 4, head);
  const second = T + H * 0.645;                    // the lower labels sit about two thirds down, as in the template
  lines(wrap('Superior Rating (1-10) :', F.b, 8.5, cw[1] - 10), cx[1] + 5, second, head);
  text('What is Working (Co):', cx[2] + 5, second, head);
  text('What is Not Working (Co):', cx[3] + 5, second, head);

  // Code of Honor: one line per question, spread down the column; the mark right-aligned and bold.
  const q = data.questions || [], n = q.length;
  const listTop = T + 24, listBottom = B - 34;     // the last 34 pt are for "Average :"
  const step = n ? Math.min(30, (listBottom - listTop) / n) : 0;
  const size = Math.max(5.5, Math.min(8.5, step - 1.5));
  const lead = size + 1.2, markW = 26, titleW = cw[0] - 10 - markW;
  const maxLines = Math.max(1, Math.floor(step / lead));
  q.forEach((item, k) => {
    const top = listTop + k * step + Math.max(0, (step - lead * Math.min(maxLines, 2)) / 2);
    let ls = wrap(`${item.title} :`, F.n, size, titleW);
    if (ls.length > maxLines) { ls = ls.slice(0, maxLines); ls[maxLines - 1] = ls[maxLines - 1].replace(/.{2}$/, '…'); }
    lines(ls, cx[0] + 5, top, { size, lead });
    if (item.mark !== '' && item.mark != null) text(String(item.mark), cx[0] + cw[0] - 6, top, { font: F.b, size: Math.max(size, 7), align: 'right' });
  });
  text('Average :', cx[0] + 5, B - 22, { font: F.b, size: 12 });
  if (data.average) text(String(data.average), cx[0] + cw[0] - 6, B - 22, { font: F.b, size: 12, align: 'right' });
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
    // Each row is as tall as its longest cell
    const wrapped = cells.map((pair, k) => pair.map(phrase => wrap(phrase, F.n, bSize, gw[1 + k * 2] - 6)));
    const h = Math.max(...wrapped.map(pair => pair.reduce((a, ls) => a + ls.length * bLead, 0) + pairGap * (pair.length - 1))) + 7;
    row(h, t => {
      text(name, X0 + 5, t + 3, { font: F.b, size: 9 });
      wrapped.forEach((pair, k) => {
        const col = 1 + k * 2; let y = t + 3;
        pair.forEach(ls => { ls.forEach((s, j) => text(s, gx[col] + gw[col] / 2, y + j * bLead, { size: bSize, align: 'center' })); y += ls.length * bLead + pairGap; });
      });
    });
    row(15, t => text('Remark:', gx[1] - 5, t + 3, { size: 9, align: 'right' }), true);
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
  choices.forEach((o, k) => {
    box(x, mid - sq / 2, sq, sq);
    text(o, x + sq + gap, mid - 4.5, tick);
    x += widths[k] + between;
  });
  hline(x - between + 4, x - between + 4 + otherLine, mid + 5);   // the line after "Other:" to write on
  // Under the tick boxes, the template's own lines; the rest is space to write in.
  const body = aTop + headH;
  text('1.     Recommendation for Confirmation:  N/A', X0 + 8, body + 16, { size: 9 });
  text('If Yes, action:', X0 + 26, body + 36, { font: F.i, size: 9 });
  text('2.     Quarterly Review :', X0 + 8, body + 74, { size: 9 });

  // Signatures, side by side under the box
  const sTop = aBottom + 14;
  [['Attended by:', X0 + 5], ['Acknowledged by:', X0 + WIDTH / 2 + 20]].forEach(([label, sx]) => {
    text(label, sx, sTop, { size: 10 });
    hline(sx, sx + 170, sTop + 38);
    text('Name:', sx, sTop + 44, { size: 10 });
  });
  footer('');
  return pdf.save();
}
