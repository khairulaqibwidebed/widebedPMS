// Sidebar per role. Folding groups: only the group of the current page is open (agreed 19 Oct for all roles).
// to = null means the page is not built yet. icon = key from components/navIcons.js.
const P = (label, to = null, icon = 'dot') => ({ label, to, icon });
const PORTFOLIO = { label: 'Portfolio', items: [P('Owners', '/Portfolio/owners', 'user'), P('Properties', '/Portfolio/properties', 'building'), P('Bookings', '/Portfolio/bookings', 'calendar')] };
// Director and Finance also get Bulk Upload (only they may write properties, units and owners in full).
const PORTFOLIO_EDIT = { label: 'Portfolio', items: [...PORTFOLIO.items, P('Bulk Upload', '/Portfolio/bulk-upload', 'folderUp')] };
const HR_STAFF = { label: 'HR', items: [P('Attendance SOP', '/HR/attendance-sop', 'clock'), P('Advance SOP', '/HR/advance-sop', 'wallet'), P('Allowance SOP', '/HR/allowance-sop', 'gift'), P('Claim SOCSO', '/HR/claim-socso', 'shieldCheck'), P('Raise a Complaint', '/HR/raise-complaint', 'flag')] };
const NEW_LISTINGS = { label: 'Procurement', items: [P('New Owner Listings', '/Procurement/new-owner-listings', 'home')] };
// Every role's own account page, last in the sidebar.
const MY_ACCOUNT = { label: 'My Account', items: [P('Profile & Appearance', '/Settings/appearance', 'sliders')] };
const PLAYBOOK = { label: 'Playbook', items: [P('Onboarding', '/Playbook/onboarding', 'book'), P('Business Model', '/Playbook/business-model', 'briefcase')] };

export const NAV = {
  finance: [
    { items: [P('Dashboard', '/Dashboard', 'dashboard')] },
    PORTFOLIO_EDIT,
    { label: 'Finance', items: [P('Upload eZee Report', '/Finance/upload', 'upload'), P('Expenses & Reimbursements', '/Finance/expenses', 'receipt'), P('Month-End Payout', '/Finance/month-end', 'banknote'),
      P('Invoices & Receipts', '/Finance/invoices', 'fileText'), P('Offline Payments', '/Finance/offline-payments', 'creditCard'), P('Reports', '/Reports', 'chart'), P('Offline Inquiries', '/Operations/offline-inquiries', 'message')] },
    { label: 'Operations', items: [P('Issues', '/Operations/issues', 'alert')] },
    PLAYBOOK,
    HR_STAFF,
    MY_ACCOUNT
  ],
  director: [
    { items: [P('Dashboard', '/Dashboard', 'dashboard')] },
    PORTFOLIO_EDIT,
    { label: 'Finance', items: [P('Upload eZee Report', '/Finance/upload', 'upload'), P('Expenses & Reimbursements', '/Finance/expenses', 'receipt'), P('Month-End Payout', '/Finance/month-end', 'banknote'),
      P('Invoices & Receipts', '/Finance/invoices', 'fileText'), P('Offline Payments', '/Finance/offline-payments', 'creditCard'), P('Reports', '/Reports', 'chart')] },
    { label: 'Operations', items: [P('Issues', '/Operations/issues', 'alert'), P('Offline Inquiries', '/Operations/offline-inquiries', 'message'), P('Booking Forms', '/Operations/booking-forms', 'clipboard')] },
    { label: 'Procurement', items: [P('New Owner Listings', '/Procurement/new-owner-listings', 'home'), P('Forms', '/Procurement/forms', 'filePlus')] },
    PLAYBOOK,
    { label: 'Company Settings', items: [P('Staff Accounts', '/Settings/staff', 'users'), P('Brand Logos', '/Settings/brand-logos', 'image'), P('Audit Log', '/Settings/audit-log', 'history')] },
    { label: 'HR', items: [P('Attendance SOP', '/HR/attendance-sop', 'clock'), P('Advance SOP', '/HR/advance-sop', 'wallet'), P('Allowance SOP', '/HR/allowance-sop', 'gift'), P('Claim SOCSO', '/HR/claim-socso', 'shieldCheck'),
      P('Staff Complaints', '/HR/staff-complaints', 'clipboard'), P('Director Complaints', '/HR/director-complaints', 'shieldAlert'), P('Raise a Complaint', '/HR/raise-complaint', 'flag')] },
    MY_ACCOUNT
  ],
  // Roles without their own pages yet (signed in 21 Oct): their Dashboard, Issues, Playbook, the staff HR pages and their own forms.
  // Portfolio is view-only for Operations, Procurement and Marketing (no fees, payouts or owner contact details).
  operations: [
    { items: [P('Dashboard', '/Dashboard', 'dashboard')] },
    PORTFOLIO,
    { label: 'Operations', items: [P('Issues', '/Operations/issues', 'alert'), P('Offline Inquiries', '/Operations/offline-inquiries', 'message'), P('Booking Forms', '/Operations/booking-forms', 'clipboard')] },
    NEW_LISTINGS, PLAYBOOK, HR_STAFF,
    MY_ACCOUNT
  ],
  // IT: view-only except its own tickets.
  it: [
    { items: [P('Dashboard', '/Dashboard', 'dashboard')] },
    { label: 'Operations', items: [P('Issues', '/Operations/issues', 'alert')] },
    PLAYBOOK, HR_STAFF,
    MY_ACCOUNT
  ],
  hr: [
    { items: [P('Dashboard', '/Dashboard', 'dashboard')] },
    { label: 'HR', items: [P('Attendance SOP', '/HR/attendance-sop', 'clock'), P('Advance SOP', '/HR/advance-sop', 'wallet'), P('Allowance SOP', '/HR/allowance-sop', 'gift'), P('Claim SOCSO', '/HR/claim-socso', 'shieldCheck'),
      P('Staff Complaints', '/HR/staff-complaints', 'clipboard'), P('Director Complaints', '/HR/director-complaints', 'shieldAlert')] },
    { label: 'Operations', items: [P('Issues', '/Operations/issues', 'alert')] },
    PLAYBOOK,
    { label: 'Company Settings', items: [P('Staff Accounts', '/Settings/staff', 'users'), P('Audit Log', '/Settings/audit-log', 'history')] },
    MY_ACCOUNT
  ],
  procurement: [
    { items: [P('Dashboard', '/Dashboard', 'dashboard')] },
    PORTFOLIO,
    { label: 'Procurement', items: [P('New Owner Listings', '/Procurement/new-owner-listings', 'home'), P('Forms', '/Procurement/forms', 'filePlus')] },
    { label: 'Operations', items: [P('Issues', '/Operations/issues', 'alert')] },
    PLAYBOOK, HR_STAFF,
    MY_ACCOUNT
  ],
  marketing: [
    { items: [P('Dashboard', '/Dashboard', 'dashboard')] },
    PORTFOLIO,
    { label: 'Operations', items: [P('Issues', '/Operations/issues', 'alert')] },
    NEW_LISTINGS, PLAYBOOK, HR_STAFF,
    MY_ACCOUNT
  ]
};

// Where a role lands after signing in: the Dashboard if they have one, otherwise the first page in their sidebar.
export function homeFor(role) {
  const pages = (NAV[role] || []).flatMap(g => g.items).filter(it => it.to);
  if (pages.some(it => it.to === '/Dashboard')) return '/Dashboard';
  if (pages.length) return pages[0].to;
  return '/Dashboard';
}