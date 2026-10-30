// lib/agreements/formula.js — a small, safe formula language for agreement forms. Nothing is run through eval().
//
//   [Monthly Rental] * 2 + [Utility Deposit]
//   IF([Carpark] = "Yes", 150, 0)
//   ADD_MONTHS([Commencement Date], 12) - 1
//
// Formulas are SAVED with field ids ([@f_ab12cd]) so renaming a field never breaks them.
// The editor SHOWS field names ([Monthly Rental]); toStored / toDisplay convert between the two.

export class FormulaError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const fail = (code, message) => { throw new FormulaError(code, message); };

// ---------- Values ----------
// Inside a formula a value is a number, text, true/false, null (blank) or a date { date: 'YYYY-MM-DD' }.
const DAY_MS = 86400000;
export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const isDate = v => !!v && typeof v === 'object' && typeof v.date === 'string';
// A date field nobody filled in. Date maths on it stays blank, so an unfilled start date gives a blank end date.
const NO_DATE = Object.freeze({ date: '', blank: true });
const pad = n => String(n).padStart(2, '0');
const isoOf = (y, m, d) => `${String(y).padStart(4, '0')}-${pad(m)}-${pad(d)}`;
const dayNo = v => Math.round(Date.parse(v.date + 'T00:00:00Z') / DAY_MS);
const fromDayNo = n => ({ date: new Date(n * DAY_MS).toISOString().slice(0, 10) });
export function todayISO() { const d = new Date(); return isoOf(d.getFullYear(), d.getMonth() + 1, d.getDate()); }

// Removes floating-point noise: 0.1 + 0.2 gives 0.3, not 0.30000000000000004.
export const clean = n => (Number.isFinite(n) ? Number(n.toPrecision(15)) : n);
// Money rounding: half away from zero, so 1.005 rounds to 1.01.
export function roundHalfUp(x, decimals = 0) {
  const f = Math.pow(10, decimals);
  return clean((Math.sign(x) * Math.round(clean(Math.abs(x) * f))) / f);
}

function num(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string') {
    const n = Number(v.replace(/^\s*RM/i, '').replace(/[,\s]/g, ''));
    if (Number.isFinite(n)) return n;
  }
  return fail('#VALUE!', `"${text(v)}" is not a number`);
}
function text(v) {
  if (v === null || v === undefined) return '';
  if (isDate(v)) return v.date;
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return String(v);
}
const blank = v => v === null || v === undefined || v === '' || v === NO_DATE;
const truthy = v => (blank(v) ? false : typeof v === 'string' ? v !== '' : !!v);
function asDate(v, fn) {
  if (blank(v)) return null;
  if (isDate(v)) return v;
  if (typeof v === 'string' && ISO_DATE.test(v)) return { date: v };
  return fail('#VALUE!', `${fn} needs a date`);
}
function addMonths(d, n) {
  const [y, m, day] = d.date.split('-').map(Number);
  const total = y * 12 + (m - 1) + Math.trunc(n);
  const ny = Math.floor(total / 12), nm = ((total % 12) + 12) % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();   // 31 Jan + 1 month = 28/29 Feb
  return { date: isoOf(ny, nm + 1, Math.min(day, last)) };
}

// "Ringgit Malaysia One Thousand Five Hundred Only"
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
function under1000(n) {
  const out = [], h = Math.floor(n / 100), r = n % 100;
  if (h) out.push(ONES[h] + ' Hundred');
  if (r) out.push(r < 20 ? ONES[r] : TENS[Math.floor(r / 10)] + (r % 10 ? '-' + ONES[r % 10] : ''));
  return out.join(' ');
}
export function numberWords(n) {
  n = Math.floor(Math.abs(n));
  if (n === 0) return 'Zero';
  const parts = [];
  for (const [size, name] of [[1e9, 'Billion'], [1e6, 'Million'], [1e3, 'Thousand'], [1, '']]) {
    const q = Math.floor(n / size);
    if (q) { parts.push(under1000(q) + (name ? ' ' + name : '')); n -= q * size; }
  }
  return parts.join(' ');
}
function inWords(x) {
  const total = roundHalfUp(Math.abs(num(x)), 2);
  const ringgit = Math.floor(total), sen = Math.round((total - ringgit) * 100);
  return `Ringgit Malaysia ${numberWords(ringgit)}${sen ? ' and Sen ' + numberWords(sen) : ''} Only`;
}

// ---------- Functions ----------
// lazy = gets the unevaluated arguments (IF only works out the branch it needs).
const FUNCTIONS = {
  SUM: { min: 1, usage: 'SUM(a, b, …)', help: 'Adds numbers', fn: a => clean(a.reduce((s, v) => s + num(v), 0)) },
  AVG: { min: 1, usage: 'AVG(a, b, …)', help: 'Average of numbers', fn: a => clean(a.reduce((s, v) => s + num(v), 0) / a.length) },
  MIN: { min: 1, usage: 'MIN(a, b, …)', help: 'Smallest number', fn: a => Math.min(...a.map(num)) },
  MAX: { min: 1, usage: 'MAX(a, b, …)', help: 'Largest number', fn: a => Math.max(...a.map(num)) },
  ROUND: { min: 1, max: 2, usage: 'ROUND(x, decimals)', help: 'Rounds half up, e.g. ROUND([Fee], 2)', fn: ([x, d]) => roundHalfUp(num(x), d === undefined ? 0 : num(d)) },
  ABS: { min: 1, max: 1, usage: 'ABS(x)', help: 'Number without its minus sign', fn: ([x]) => Math.abs(num(x)) },
  IF: { min: 2, max: 3, lazy: true, usage: 'IF(test, then, else)', help: 'IF([Carpark] = "Yes", 150, 0)',
    fn: (args, ev) => (truthy(ev(args[0])) ? ev(args[1]) : args[2] ? ev(args[2]) : '') },
  IFERROR: { min: 2, max: 2, lazy: true, usage: 'IFERROR(value, fallback)', help: 'Uses the fallback when the value has an error',
    fn: (args, ev) => { try { return ev(args[0]); } catch (e) { if (e instanceof FormulaError) return ev(args[1]); throw e; } } },
  AND: { min: 1, usage: 'AND(a, b, …)', help: 'True when all are true', fn: a => a.every(truthy) },
  OR: { min: 1, usage: 'OR(a, b, …)', help: 'True when any is true', fn: a => a.some(truthy) },
  NOT: { min: 1, max: 1, usage: 'NOT(x)', help: 'Opposite of true/false', fn: ([x]) => !truthy(x) },
  ISBLANK: { min: 1, max: 1, usage: 'ISBLANK(x)', help: 'True when the field is empty', fn: ([x]) => blank(x) },
  CONCAT: { min: 1, usage: 'CONCAT(a, b, …)', help: 'Joins text; & also joins', fn: a => a.map(text).join('') },
  UPPER: { min: 1, max: 1, usage: 'UPPER(text)', help: 'CAPITAL LETTERS', fn: ([x]) => text(x).toUpperCase() },
  LOWER: { min: 1, max: 1, usage: 'LOWER(text)', help: 'small letters', fn: ([x]) => text(x).toLowerCase() },
  IN_WORDS: { min: 1, max: 1, usage: 'IN_WORDS(amount)', help: 'Ringgit Malaysia One Thousand Five Hundred Only', fn: ([x]) => (blank(x) ? '' : inWords(x)) },
  TODAY: { min: 0, max: 0, usage: 'TODAY()', help: "Today's date", fn: () => ({ date: todayISO() }) },
  DATE: { min: 3, max: 3, usage: 'DATE(year, month, day)', help: 'Builds a date', fn: ([y, m, d]) => fromDayNo(Math.round(Date.UTC(num(y), num(m) - 1, num(d)) / DAY_MS)) },
  YEAR: { min: 1, max: 1, usage: 'YEAR(date)', help: 'Year of a date', fn: ([d]) => { const x = asDate(d, 'YEAR'); return x && Number(x.date.slice(0, 4)); } },
  MONTH: { min: 1, max: 1, usage: 'MONTH(date)', help: 'Month 1–12', fn: ([d]) => { const x = asDate(d, 'MONTH'); return x && Number(x.date.slice(5, 7)); } },
  DAY: { min: 1, max: 1, usage: 'DAY(date)', help: 'Day of the month', fn: ([d]) => { const x = asDate(d, 'DAY'); return x && Number(x.date.slice(8, 10)); } },
  ADD_DAYS: { min: 2, max: 2, usage: 'ADD_DAYS(date, days)', help: 'Date plus days', fn: ([d, n]) => { const x = asDate(d, 'ADD_DAYS'); return !x ? NO_DATE : fromDayNo(dayNo(x) + Math.round(num(n))); } },
  ADD_MONTHS: { min: 2, max: 2, usage: 'ADD_MONTHS(date, months)', help: 'ADD_MONTHS([Start Date], 12) - 1', fn: ([d, n]) => { const x = asDate(d, 'ADD_MONTHS'); return !x ? NO_DATE : addMonths(x, num(n)); } },
  ADD_YEARS: { min: 2, max: 2, usage: 'ADD_YEARS(date, years)', help: 'Date plus years', fn: ([d, n]) => { const x = asDate(d, 'ADD_YEARS'); return !x ? NO_DATE : addMonths(x, num(n) * 12); } },
  DAYS: { min: 2, max: 2, usage: 'DAYS(end, start)', help: 'Days between two dates', fn: ([e, s]) => { const a = asDate(e, 'DAYS'), b = asDate(s, 'DAYS'); return a && b ? dayNo(a) - dayNo(b) : null; } }
};
FUNCTIONS.AVERAGE = { ...FUNCTIONS.AVG, usage: 'AVERAGE(a, b, …)' };

export const FUNCTION_LIST = Object.entries(FUNCTIONS).map(([name, f]) => ({ name, usage: f.usage, help: f.help }));

// ---------- Reading a formula ----------
const OPS2 = ['<=', '>=', '<>', '!='];
const OPS1 = '+-*/^&%=<>(),';
function tokenize(src) {
  const toks = [];
  let i = 0, m;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    const rest = src.slice(i);
    if ((m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(rest))) { toks.push({ t: 'num', v: parseFloat(m[0]) }); i += m[0].length; continue; }
    if (c === '"') {
      let j = i + 1, s = '';
      for (;;) {
        if (j >= src.length) fail('#SYNTAX!', 'A text value is missing its closing "');
        if (src[j] === '"') { if (src[j + 1] === '"') { s += '"'; j += 2; continue; } break; }
        s += src[j++];
      }
      toks.push({ t: 'str', v: s }); i = j + 1; continue;
    }
    if (c === '[') {
      const j = src.indexOf(']', i);
      if (j < 0) fail('#SYNTAX!', 'A field name is missing its closing ]');
      toks.push({ t: 'ref', v: src.slice(i + 1, j).trim() }); i = j + 1; continue;
    }
    if ((m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest))) { toks.push({ t: 'id', v: m[0].toUpperCase() }); i += m[0].length; continue; }
    const two = src.slice(i, i + 2);
    if (OPS2.includes(two)) { toks.push({ t: 'op', v: two === '!=' ? '<>' : two }); i += 2; continue; }
    if (OPS1.includes(c)) { toks.push({ t: 'op', v: c }); i++; continue; }
    fail('#SYNTAX!', `"${c}" can't be used here`);
  }
  return toks;
}

// Turns a stored formula into a tree. Lowest to highest priority: comparisons, &, + -, * /, ^, minus sign, %.
export function parse(src) {
  const toks = tokenize(String(src ?? ''));
  if (!toks.length) fail('#SYNTAX!', 'The formula is empty');
  let p = 0;
  const isOp = (...ops) => toks[p] && toks[p].t === 'op' && ops.includes(toks[p].v);
  const expect = v => { if (!isOp(v)) fail('#SYNTAX!', `Expected "${v}"`); p++; };
  const left = (next, ops) => { let a = next(); while (isOp(...ops)) { const op = toks[p++].v; a = { k: 'bin', op, a, b: next() }; } return a; };

  const expr = () => left(concat, ['=', '<>', '<', '>', '<=', '>=']);
  const concat = () => left(additive, ['&']);
  const additive = () => left(term, ['+', '-']);
  const term = () => left(power, ['*', '/']);
  const power = () => { const a = unary(); if (isOp('^')) { p++; return { k: 'bin', op: '^', a, b: power() }; } return a; };
  const unary = () => { if (isOp('-')) { p++; return { k: 'neg', a: unary() }; } if (isOp('+')) { p++; return unary(); } return postfix(); };
  const postfix = () => { let a = primary(); while (isOp('%')) { p++; a = { k: 'pct', a }; } return a; };
  function primary() {
    const t = toks[p++];
    if (!t) fail('#SYNTAX!', 'The formula ends too early');
    if (t.t === 'num' || t.t === 'str') return { k: 'lit', v: t.v };
    if (t.t === 'ref') {
      if (!t.v.startsWith('@')) fail('#NAME?', `There is no field called [${t.v}]`);
      return { k: 'ref', id: t.v.slice(1) };
    }
    if (t.t === 'id') {
      if (t.v === 'TRUE' || t.v === 'FALSE') return { k: 'lit', v: t.v === 'TRUE' };
      const f = FUNCTIONS[t.v];
      if (!f) fail('#NAME?', `There is no function called ${t.v}`);
      expect('(');
      const args = [];
      if (!isOp(')')) {
        args.push(expr());
        while (isOp(',')) { p++; args.push(expr()); }
      }
      expect(')');
      if (args.length < f.min || (f.max !== undefined && args.length > f.max)) fail('#SYNTAX!', `${f.usage} — wrong number of values`);
      return { k: 'call', name: t.v, args };
    }
    if (t.t === 'op' && t.v === '(') { const a = expr(); expect(')'); return a; }
    return fail('#SYNTAX!', `"${t.v}" is in the wrong place`);
  }
  const ast = expr();
  if (p < toks.length) fail('#SYNTAX!', `"${toks[p].v}" is in the wrong place`);
  return ast;
}

// ---------- Working a formula out ----------
function evaluate(node, get) {
  switch (node.k) {
    case 'lit': return node.v;
    case 'ref': return get(node.id);
    case 'neg': return clean(-num(evaluate(node.a, get)));
    case 'pct': return clean(num(evaluate(node.a, get)) / 100);
    case 'call': {
      const f = FUNCTIONS[node.name], ev = a => evaluate(a, get);
      return f.lazy ? f.fn(node.args, ev) : f.fn(node.args.map(ev));
    }
    default: return binop(node.op, evaluate(node.a, get), evaluate(node.b, get));
  }
}
function binop(op, a, b) {
  switch (op) {
    case '+':
      if (a === NO_DATE || b === NO_DATE) return NO_DATE;
      if (isDate(a) && !isDate(b)) return fromDayNo(dayNo(a) + Math.round(num(b)));
      if (isDate(b) && !isDate(a)) return fromDayNo(dayNo(b) + Math.round(num(a)));
      return clean(num(a) + num(b));
    case '-':
      if (isDate(a) && isDate(b)) return a === NO_DATE || b === NO_DATE ? null : dayNo(a) - dayNo(b);
      if (a === NO_DATE) return NO_DATE;
      if (isDate(a)) return fromDayNo(dayNo(a) - Math.round(num(b)));
      return clean(num(a) - num(b));
    case '*': return clean(num(a) * num(b));
    case '/': { const d = num(b); if (d === 0) fail('#DIV/0!', 'Division by zero'); return clean(num(a) / d); }
    case '^': return clean(Math.pow(num(a), num(b)));
    case '&': return text(a) + text(b);
    default: {
      const numeric = v => typeof v === 'number' || typeof v === 'boolean' || isDate(v) || blank(v);
      let x, y;
      if (numeric(a) && numeric(b) && !(blank(a) && blank(b))) { x = isDate(a) ? dayNo(a) : num(a); y = isDate(b) ? dayNo(b) : num(b); }
      else { x = text(a).toLowerCase(); y = text(b).toLowerCase(); }
      return { '=': x === y, '<>': x !== y, '<': x < y, '>': x > y, '<=': x <= y, '>=': x >= y }[op];
    }
  }
}

function refsOf(node, out = new Set()) {
  if (node.k === 'ref') out.add(node.id);
  if (node.a) refsOf(node.a, out);
  if (node.b) refsOf(node.b, out);
  if (node.args) node.args.forEach(a => refsOf(a, out));
  return out;
}

const compiled = new Map();
export function compile(stored) {
  if (!compiled.has(stored)) {
    try { const ast = parse(stored); compiled.set(stored, { ast, refs: [...refsOf(ast)] }); }
    catch (e) { if (!(e instanceof FormulaError)) throw e; compiled.set(stored, { error: e }); }
  }
  return compiled.get(stored);
}

// ---------- Field names <-> ids ----------
const REF_OR_TEXT = /"(?:[^"]|"")*"|\[([^\]]*)\]/g;
export function toStored(display, fields) {
  return String(display ?? '').replace(REF_OR_TEXT, (all, name) => {
    if (name === undefined || name.trim().startsWith('@')) return all;
    const n = name.trim().toLowerCase();
    const f = fields.find(x => x.type !== 'section' && String(x.label).trim().toLowerCase() === n);
    if (!f) fail('#NAME?', `There is no field called [${name.trim()}]`);
    return `[@${f.id}]`;
  });
}
export function toDisplay(stored, fields) {
  return String(stored ?? '').replace(REF_OR_TEXT, (all, ref) => {
    if (ref === undefined || !ref.startsWith('@')) return all;
    const f = fields.find(x => x.id === ref.slice(1));
    return f ? `[${f.label}]` : '[deleted field]';
  });
}
// Ids a stored formula uses (for "this field is used by…" warnings).
export const refsIn = stored => { const c = compile(stored || ''); return c.error ? [] : c.refs; };

// ---------- Whole records ----------
// The value a field gives a formula.
function toFormulaValue(field, v) {
  if (v && typeof v === 'object' && v.error) fail(v.error, `[${field.label}] has an error: ${v.message}`);
  const type = field.type === 'formula' ? field.resultType : field.type;
  if (blank(v)) return type === 'date' ? NO_DATE : null;
  if (type === 'number' || type === 'currency') return typeof v === 'number' ? v : num(v);
  if (type === 'date') return typeof v === 'string' && ISO_DATE.test(v) ? { date: v } : NO_DATE;
  if (type === 'checkbox' || type === 'boolean') return v === true || v === 'true';
  if (typeof v === 'object') return v.name || '';
  return String(v);
}
// A formula's answer, saved the way its result type expects.
function fromFormulaValue(v, type) {
  if (blank(v)) return null;
  if (type === 'date') return isDate(v) ? v.date : typeof v === 'string' && ISO_DATE.test(v) ? v : fail('#VALUE!', 'The answer is not a date. Change the result type.');
  if (type === 'number' || type === 'currency') {
    if (isDate(v)) fail('#VALUE!', 'The answer is a date. Set the result type to Date.');
    const n = num(v);
    if (!Number.isFinite(n)) fail('#NUM!', 'The number is too large');
    return clean(n);
  }
  if (type === 'boolean') return truthy(v);
  return text(v);
}

// Orders formula fields so each one is worked out after the fields it uses. Loops become #CYCLE!.
export function formulaPlan(fields) {
  const formulas = fields.filter(f => f.type === 'formula');
  const byId = new Map(formulas.map(f => [f.id, f]));
  const order = [], state = new Map(), errors = new Map();
  function visit(f, stack) {
    if (state.get(f.id) === 'done') return;
    if (state.get(f.id) === 'visiting') {
      for (const id of stack.slice(stack.indexOf(f.id))) errors.set(id, new FormulaError('#CYCLE!', 'These formulas use each other in a loop'));
      return;
    }
    state.set(f.id, 'visiting');
    const c = compile(f.expr || '');
    if (!c.error) for (const id of c.refs) if (byId.has(id)) visit(byId.get(id), [...stack, f.id]);
    state.set(f.id, 'done');
    order.push(f);
  }
  for (const f of formulas) visit(f, []);
  return { order, errors };
}

// Every value of a record, with formula fields worked out. Errors become { error: '#DIV/0!', message }.
export function computeValues(fields, values = {}) {
  const out = { ...values };
  const byId = new Map(fields.map(f => [f.id, f]));
  const { order, errors } = formulaPlan(fields);
  const get = id => {
    const f = byId.get(id);
    if (!f) fail('#REF!', 'A field this formula uses was deleted');
    return toFormulaValue(f, out[id]);
  };
  for (const f of order) {
    if (!String(f.expr || '').trim()) { out[f.id] = null; continue; }
    const c = compile(f.expr);
    const err = errors.get(f.id) || c.error;
    if (err) { out[f.id] = { error: err.code, message: err.message }; continue; }
    try { out[f.id] = fromFormulaValue(evaluate(c.ast, get), f.resultType || 'number'); }
    catch (e) {
      if (!(e instanceof FormulaError)) throw e;
      out[f.id] = { error: e.code, message: e.message };
    }
  }
  return out;
}

// ---------- Autocomplete ----------
// What to suggest for the text before the cursor: field names after "[", function names after letters.
export function suggest(before, fields) {
  const open = before.lastIndexOf('['), close = before.lastIndexOf(']');
  const quotes = (before.match(/"/g) || []).length;
  if (quotes % 2 === 1) return null;   // inside "text"
  if (open > close) {
    const q = before.slice(open + 1).trim().toLowerCase();
    const items = fields.filter(f => f.type !== 'section' && String(f.label).toLowerCase().includes(q))
      .slice(0, 12).map(f => ({ label: f.label, insert: `[${f.label}]`, hint: f.type === 'formula' ? 'formula' : f.type }));
    return { from: open, items };
  }
  const m = /[A-Za-z_]+$/.exec(before);
  if (!m) return null;
  const q = m[0].toUpperCase();
  const items = FUNCTION_LIST.filter(f => f.name.startsWith(q)).slice(0, 10).map(f => ({ label: f.usage, insert: f.name + '(', hint: f.help }));
  return { from: m.index, items };
}
