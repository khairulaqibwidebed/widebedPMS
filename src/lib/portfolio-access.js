// Portfolio (Owners, Properties, Bookings): what each role may see and do there. One place for every page and drawer.
// Today this goes by role, as the old single Portfolio page did; Phase B2 moves it to page ticks.

// View-only roles (Khairul 21 Oct): properties, units, owner codes and offline bookings; no fees, payouts,
// statements, audit log or owner personal details, and none of those are read from Firestore.
const VIEWERS = ['operations', 'procurement', 'marketing'];
// Operations may also add properties, units and owners (Khairul 21 Oct): no fees, rent or bank details, and no editing.
const ADDERS = ['director', 'finance', 'operations', 'marketing'];
// Tabs on a property page. View-only roles get the first three.
export const ALL_PTABS = [{ key: 'overview', label: 'Overview' }, { key: 'units', label: 'Units' }, { key: 'owners', label: 'Owners' },
  { key: 'rates', label: 'Fees & rates' }, { key: 'ota', label: 'OTA commissions' }, { key: 'audit', label: 'Audit log' }];

export function portfolioAccess(role) {
  const viewOnly = VIEWERS.includes(role);
  return {
    viewOnly,
    isDirector: role === 'director',
    canAdd: ADDERS.includes(role),                                   // + Add property / unit / owner
    // Marketing also open and edit properties, units and owners (Khairul 27 Oct): details and contact only, no money,
    // owner link, status or bank details.
    canEdit: role === 'marketing',
    canBook: ['director', 'finance', 'operations'].includes(role),     // + New booking (direct, no inquiry)
    bkEdit: ['director', 'finance', 'operations'].includes(role),      // edit an offline booking
    canOpenInquiry: ['director', 'finance', 'operations'].includes(role),
    guestNames: ['director', 'finance', 'operations'].includes(role),  // may read guests' names (private data)
    guestOnTenant: ['director', 'finance'].includes(role),             // may change guest details kept on a tenant record
    PTABS: viewOnly ? ALL_PTABS.slice(0, 3) : ALL_PTABS
  };
}
