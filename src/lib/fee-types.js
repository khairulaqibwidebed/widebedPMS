// Fee types: the one place that says what each kind of owner arrangement is and how its fees are worked out.
// To add a type: add one entry to FEE_TYPES with every field below. Nothing else needs to change.
//
// An arrangement (saved per property on its rate versions, see arrangementsOf) always has the same fields:
//   { name, type, section, servicePct, utilityPct, sstPct, netRentalPct, effectiveFrom, reason }
//   Percentages are kept as fractions (0.2 = 20%). sstPct is on the service fee; 0 = no SST. netRentalPct is used by Pool only.
//
// Gross Rental = the unit's month total after OTA commission (the sum of bookingPTO in engine.js, the same for every type).
// Each calc(ctx) gets:
//   ctx.gross     Gross Rental of the unit for the month
//   ctx.expenses  the unit's expense lines for the month: [{ kind: 'expense'|'reimburse'|'broughtForward', signed, ... }]
//                 (signed: expenses negative, reimbursements positive)
//   ctx.rates     effectiveRates() for the unit: serviceFeePct, utilityFeePct, sstOnFeePct, netRentalPct, fixedRentAmount
//   ctx.lines     the booking lines (each with .pto)
//   ctx.pool      Pool only: this unit's part of the property pool from engine.poolShares(), or null
// and returns the statement totals (same names as before, so screens, PDFs and Excel files keep working):
//   { fixed, totalReceivable, serviceFee, utilityFee, sstOnFee, entitlement, totalExpenses, netReceivable, roundingAdjust,
//     payout, charges, [deduction, reimburse, bookingIncome, netRental, pool, expenses, status] }
// formula: the steps shown on Fees & rates (How it's worked out); example: a made-up worked example, [label, amount] pairs.
// Calculations keep full precision (3 decimals or more); screens and files show 2.

export const round05 = x => Math.sign(x) * Math.round(Math.abs(x) / 0.05 + 1e-9) * 0.05;
const num = v => { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return isFinite(n) ? n : 0; };
const sum = (list, f) => list.reduce((s, x) => s + f(x), 0);

// The fees on an amount: service and utility % of it, SST % of the service fee.
function feesOn(base, rates) {
  const serviceFee = base * num(rates.serviceFeePct);
  const utilityFee = base * num(rates.utilityFeePct);
  const sstOnFee = serviceFee * num(rates.sstOnFeePct);
  return { serviceFee, utilityFee, sstOnFee };
}
// Fees on Gross Rental, then every expense line. This is the old profit share / long-term tenant formula, unchanged.
function feesThenExpenses({ gross, expenses, rates }) {
  const { serviceFee, utilityFee, sstOnFee } = feesOn(gross, rates);
  const entitlement = gross - serviceFee - utilityFee - sstOnFee;
  const totalExpenses = sum(expenses, e => e.signed);
  const netReceivable = entitlement + totalExpenses;
  const payout = round05(netReceivable);
  return { fixed: false, totalReceivable: gross, serviceFee, utilityFee, sstOnFee, entitlement, totalExpenses, netReceivable,
    roundingAdjust: payout - netReceivable, payout, charges: gross - payout };
}

export const FEE_TYPES = {
  revenue: {
    id: 'revenue', label: 'Revenue Sharing', sections: ['short'], netRental: false, scope: 'unit', everyMonth: false,
    explain: 'Widebed keeps Total % of Gross Rental (after OTA commission). No expenses come off first.',
    formula: ['Gross Rental = Bookings − OTA commission', 'Fees = Gross Rental × Total %', 'SST = Service fee × SST %', 'Owner gets = Gross Rental − Fees − SST − Expenses + Reimbursements', 'Rounded to RM 0.05'],
    example: [['Gross Rental', 'RM 1,000'], ['Fees 40%', '− RM 400'], ['Owner gets', 'RM 600']],
    calc: feesThenExpenses
  },
  profit: {
    id: 'profit', label: 'Profit Sharing', sections: ['short'], netRental: false, scope: 'unit', everyMonth: false,
    explain: 'Unit expenses come off Gross Rental (after OTA commission) first. Widebed keeps Total % of what is left.',
    formula: ['Gross Rental = Bookings − OTA commission', 'Net Rental = Gross Rental − Expenses', 'Fees = Net Rental × Total % (0 if Net Rental is below 0)', 'SST = Service fee × SST %', 'Owner gets = Net Rental − Fees − SST + Reimbursements', 'Rounded to RM 0.05'],
    example: [['Gross Rental', 'RM 1,000'], ['Expenses', '− RM 200'], ['Net Rental', 'RM 800'], ['Fees 40%', '− RM 320'], ['Owner gets', 'RM 480']],
    // Net Rental = Gross Rental - the unit's expenses (kind 'expense'). Fees come off Net Rental (never below 0).
    // Reimbursements and brought-forward balances come in after the fees, as for every other type.
    calc({ gross, expenses, rates }) {
      const before = expenses.filter(e => e.kind === 'expense'), after = expenses.filter(e => e.kind !== 'expense');
      const netRental = gross + sum(before, e => e.signed);
      const { serviceFee, utilityFee, sstOnFee } = feesOn(Math.max(0, netRental), rates);
      const entitlement = netRental - serviceFee - utilityFee - sstOnFee;
      const netReceivable = entitlement + sum(after, e => e.signed);
      const payout = round05(netReceivable);
      return { fixed: false, totalReceivable: gross, netRental, serviceFee, utilityFee, sstOnFee, entitlement,
        totalExpenses: sum(expenses, e => e.signed), netReceivable, roundingAdjust: payout - netReceivable, payout, charges: gross - payout };
    }
  },
  pool: {
    id: 'pool', label: 'Pool Sharing', sections: ['short'], netRental: true, scope: 'property', everyMonth: true,
    explain: 'Every unit in the property puts its Gross Rental (after OTA commission) into one pot. Owners share Net Rental # % of the pot, split by each unit\'s purchase price. No expenses come off.',
    formula: ['Pot = Gross Rental of every Pool unit in the property', 'Net Rental # = Pot × Net Rental # %', 'Unit % = Unit purchase price ÷ All Pool units\' purchase prices', 'Unit share = Net Rental # × Unit %', 'Owner gets = Unit share − Fees (if any) + Reimbursements', 'No expenses come off. Rounded to RM 0.05'],
    example: [['Pot', 'RM 10,000'], ['Net Rental # 56.25%', 'RM 5,625'], ['Unit 20% of prices', '× 20%'], ['Owner gets', 'RM 1,125']],
    // ctx.pool from engine.poolShares(): pot, netRental (#), unitPct, share. Fees (0 by default) come off the share.
    // Expenses are not deducted; reimbursements and brought-forward balances still count.
    calc({ gross, expenses, rates, pool }) {
      const share = pool ? pool.share : 0;
      const kept = expenses.filter(e => e.kind !== 'expense');
      const { serviceFee, utilityFee, sstOnFee } = feesOn(share, rates);
      const entitlement = share - serviceFee - utilityFee - sstOnFee;
      const totalExpenses = sum(kept, e => e.signed);
      const netReceivable = entitlement + totalExpenses;
      const payout = round05(netReceivable);
      return { fixed: false, totalReceivable: share, grossRental: gross, pool: pool || null, expenses: kept, serviceFee, utilityFee, sstOnFee, entitlement,
        totalExpenses, netReceivable, roundingAdjust: payout - netReceivable, payout, charges: share - payout,
        ...(!pool || pool.missingPrice ? { status: 'poolCheck' } : {}) };
    }
  },
  midTenant: {
    id: 'midTenant', label: 'Mid-term tenant', sections: ['mid'], netRental: false, scope: 'unit', everyMonth: false, tenant: true,
    explain: 'Widebed keeps Total % of the monthly rent the tenant pays. Same maths as Long-term tenant.',
    formula: ['Fees = Monthly rent × Total %', 'SST = Service fee × SST %', 'Owner gets = Monthly rent − Fees − SST − Expenses + Reimbursements', 'Rounded to RM 0.05'],
    example: [['Monthly rent', 'RM 2,000'], ['Fee 20%', '− RM 400'], ['SST 8% of fee', '− RM 32'], ['Owner gets', 'RM 1,568']],
    calc: feesThenExpenses
  },
  tenant: {
    id: 'tenant', label: 'Long-term tenant', sections: ['long'], netRental: false, scope: 'unit', everyMonth: false, tenant: true,
    explain: 'Widebed keeps Total % of the monthly rent the tenant pays.',
    formula: ['Fees = Monthly rent × Total %', 'SST = Service fee × SST %', 'Owner gets = Monthly rent − Fees − SST − Expenses + Reimbursements', 'Rounded to RM 0.05'],
    example: [['Monthly rent', 'RM 2,000'], ['Fee 10%', '− RM 200'], ['SST 8% of fee', '− RM 16'], ['Owner gets', 'RM 1,784']],
    calc: feesThenExpenses
  },
  fixed: {
    id: 'fixed', label: 'Fixed rent', sections: ['mid', 'long'], netRental: false, scope: 'unit', everyMonth: true,
    explain: 'Widebed pays the owner a fixed rent each month. Leave the % fields at 0 unless a fee is taken from the rent.',
    formula: ['Owner gets = Fixed rent − Fees (if any) − Deductions + Reimbursements', 'Bookings stay with Widebed', 'Not rounded'],
    example: [['Fixed rent', 'RM 1,400'], ['Deductions', '− RM 50'], ['Owner gets', 'RM 1,350']],
    // The unit's fixed rent less deductions plus reimbursements (old fixedRent formula). Fees, when above 0, come off the rent.
    calc({ expenses, rates, lines }) {
      const rent = num(rates.fixedRentAmount);
      const { serviceFee, utilityFee, sstOnFee } = feesOn(rent, rates);
      const deduction = expenses.filter(e => e.signed < 0).reduce((s, e) => s - e.signed, 0);
      const reimburse = expenses.filter(e => e.signed > 0).reduce((s, e) => s + e.signed, 0);
      const payout = rent - serviceFee - utilityFee - sstOnFee - deduction + reimburse;
      return { fixed: true, totalReceivable: rent, serviceFee, utilityFee, sstOnFee, deduction, reimburse, payout, charges: rent - payout,
        bookingIncome: sum(lines, l => l.pto), status: payout < 0 ? 'negative' : 'fixed' };
    }
  }
};

export const feeType = id => FEE_TYPES[id] || FEE_TYPES.revenue;
export const typesFor = section => Object.values(FEE_TYPES).filter(t => t.sections.includes(section));

// The three cards on Fees & rates
export const SECTIONS = [
  { key: 'short', label: 'Short term', hint: 'Revenue Sharing, Profit Sharing or Pool Sharing' },
  { key: 'mid', label: 'Mid term', hint: 'Mid-term tenant or Fixed rent' },
  { key: 'long', label: 'Long term', hint: 'Long-term tenant or Fixed rent' }
];

export const DEFAULT_NET_RENTAL_PCT = 0.5625;

// The four arrangements every property had before 6 Nov 2026, kept under their old keys so every unit's saved terms
// still point at the right one (and per-unit fee overrides such as DM 1408-2 still apply on top). A property whose
// rate version has no `arrangements` list uses these. The first save on Fees & rates writes them out as its list.
const BUILT_IN = { effectiveFrom: '2000-01', reason: 'Built in (before 6 Nov 2026)', netRentalPct: DEFAULT_NET_RENTAL_PCT };
export const DEFAULT_ARRANGEMENTS = {
  profitShare40: { ...BUILT_IN, name: 'Revenue share 40%', type: 'revenue', section: 'short', servicePct: 0.20, utilityPct: 0.20, sstPct: 0 },
  profitShare20: { ...BUILT_IN, name: 'Revenue share 20%', type: 'revenue', section: 'short', servicePct: 0.20, utilityPct: 0, sstPct: 0 },
  longTermTenant: { ...BUILT_IN, name: 'Long-term tenant', type: 'tenant', section: 'long', servicePct: 0.10, utilityPct: 0, sstPct: 0.08 },
  fixedRent: { ...BUILT_IN, name: 'Fixed rent', type: 'fixed', section: 'long', servicePct: 0, utilityPct: 0, sstPct: 0 }
};

// The arrangements in force with a property's rate version: { [id]: arrangement }.
export const arrangementsOf = rateVersion => rateVersion?.arrangements || DEFAULT_ARRANGEMENTS;

// Names for screens that show arrangement ids from several properties (Owners list, audit log). Every property whose
// rates are read is remembered here; the built-in names are always known.
const known = new Map(Object.entries(DEFAULT_ARRANGEMENTS));
export function rememberArrangements(list) { for (const [id, a] of Object.entries(list || {})) known.set(id, a); }
export const knownArrangement = id => (id ? known.get(id) || null : null);
export const arrangementName = id => (id ? knownArrangement(id)?.name || 'Other arrangement' : 'Not set up');
export const arrangementType = id => knownArrangement(id)?.type || null;
// Unit terms keep the old field names for a unit's own rate
export const TERM_PCT = { serviceFeePct: 'servicePct', utilityFeePct: 'utilityPct', sstOnFeePct: 'sstPct' };
// A new arrangement id: unique across properties, so a name lookup by id can't mix two properties up.
export const newArrangementId = () => `arr${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
// A built-in arrangement's normal rate under the unit-terms name (e.g. legacyRate('profitShare40', 'serviceFeePct') = 0.2).
// The importers (Upload, Bulk upload) still write the built-in keys and keep only rates that differ from these.
export const legacyRate = (id, termKey) => DEFAULT_ARRANGEMENTS[id]?.[TERM_PCT[termKey]];
