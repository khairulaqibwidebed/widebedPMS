import { can } from '@/lib/access.js';
// Portfolio (Owners, Properties, Bookings): what each role may see and do there. One place for every page and drawer.
// Today this goes by role, as the old single Portfolio page did; Phase B2 moves it to page ticks.

// View-only roles (Khairul 21 Oct): properties, units, owner codes and offline bookings; no fees, payouts,
// statements, audit log or owner personal details, and none of those are read from Firestore.
const VIEWERS = ['operations', 'procurement', 'marketing'];
// Operations may also add properties, units and owners (Khairul 21 Oct): no fees, rent or bank details, and no editing.
const ADDERS = ['director', 'finance', 'operations', 'marketing'];
// Tabs on a property page. View-only roles get the first three.
export const ALL_PTABS = [{ key: 'overview', label: 'Overview' }, { key: 'units', label: 'Units' }, { key: 'owners', label: 'Owners' },
  { key: 'rates', label: 'Pool sharing' }, { key: 'audit', label: 'Audit log' }];   // 12 Nov 2026: Fees & rates and OTA commissions moved to Portfolio > Fees & Rates; only Pool Net Rental # % stays per property

// 12 Nov 2026 (Khairul): a view-only role whose ticks include Portfolio Edit (Roles page or Staff ticks) works here like
// Finance: full access to owners, properties, units and bookings, fees and bank details included. The rules already
// allow it (portfolioEditor() = can('portfolio.edit')). Directors stay Directors.
export function portfolioAccess(role, me = null) {
  if (role !== 'director' && VIEWERS.includes(role) && me && can(me, 'portfolio.edit')) role = 'finance';
  const viewOnly = VIEWERS.includes(role);
  return {
    viewOnly,
    isDirector: role === 'director',
    canAdd: ADDERS.includes(role),                                   // + Add property / unit / owner
    // Marketing also open and edit properties, units and owners (Khairul 27 Oct): details and contact only, no money,
    // owner link, status or bank details.
    canEdit: role === 'marketing',
    // May read owner names (12 Nov 2026: Operations too, so the Owner list on a unit shows names). Contact and bank
    // details stay hidden on screen for view-only roles.
    ownerNames: ['director', 'finance', 'marketing', 'operations'].includes(role),
    canBook: ['director', 'finance', 'operations'].includes(role),     // + New booking (direct, no inquiry)
    bkEdit: ['director', 'finance', 'operations'].includes(role),      // edit an offline booking
    canOpenInquiry: ['director', 'finance', 'operations'].includes(role),
    guestNames: ['director', 'finance', 'operations'].includes(role),  // may read guests' names (private data)
    guestOnTenant: ['director', 'finance'].includes(role),             // may change guest details kept on a tenant record
    PTABS: viewOnly ? ALL_PTABS.slice(0, 3) : ALL_PTABS
  };
}
