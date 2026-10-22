// Sidebar per role. Folding groups: only the group of the current page is open (agreed 19 Oct for all roles).
// to = null means the page is not built yet.
const P = (label, to = null) => ({ label, to });
const PORTFOLIO = { label: 'Portfolio', items: [P('Owners', '/Portfolio/owners'), P('Properties', '/Portfolio/properties'), P('Bookings', '/Portfolio/bookings')] };
const HR_STAFF = { label: 'HR', items: [P('Attendance SOP', '/HR/attendance-sop'), P('Advance SOP', '/HR/advance-sop'), P('Allowance SOP', '/HR/allowance-sop'), P('Claim SOCSO', '/HR/claim-socso'), P('Raise a Complaint', '/HR/raise-complaint')] };
const NEW_LISTINGS = { label: 'Procurement', items: [P('New Owner Listings', '/Procurement/new-owner-listings')] };
// Every role's own account page, last in the sidebar.
const MY_ACCOUNT = { label: 'My Account', items: [P('Profile & Appearance', '/Settings/appearance')] };
const PLAYBOOK = { label: 'Playbook', items: [P('Onboarding', '/Playbook/onboarding'), P('Business Model', '/Playbook/business-model')] };

export const NAV = {
  finance: [
    { items: [P('Dashboard', '/Dashboard')] },
    PORTFOLIO,
    { label: 'Finance', items: [P('Upload eZee Report', '/Finance/upload'), P('Expenses & Reimbursements', '/Finance/expenses'), P('Month-End Payout', '/Finance/month-end'),
      P('Invoices & Receipts', '/Finance/invoices'), P('Offline Payments', '/Finance/offline-payments'), P('Reports', '/Reports'), P('Offline Inquiries', '/Operations/offline-inquiries')] },
    { label: 'Operations', items: [P('Issues', '/Operations/issues')] },
    { label: 'Playbook', items: [P('Onboarding', '/Playbook/onboarding'), P('Business Model', '/Playbook/business-model')] },
    HR_STAFF,
    MY_ACCOUNT
  ],
  director: [
    { items: [P('Dashboard', '/Dashboard')] },
    PORTFOLIO,
    { label: 'Finance', items: [P('Upload eZee Report', '/Finance/upload'), P('Expenses & Reimbursements', '/Finance/expenses'), P('Month-End Payout', '/Finance/month-end'),
      P('Invoices & Receipts', '/Finance/invoices'), P('Offline Payments', '/Finance/offline-payments'), P('Reports', '/Reports')] },
    { label: 'Operations', items: [P('Issues', '/Operations/issues'), P('Offline Inquiries', '/Operations/offline-inquiries'), P('Booking Forms', '/Operations/booking-forms')] },
    { label: 'Procurement', items: [P('New Owner Listings', '/Procurement/new-owner-listings'), P('Forms', '/Procurement/forms')] },
    { label: 'Playbook', items: [P('Onboarding', '/Playbook/onboarding'), P('Business Model', '/Playbook/business-model')] },
    { label: 'Company Settings', items: [P('Staff Accounts', '/Settings/staff'), P('Brand Logos', '/Settings/brand-logos'), P('Audit Log', '/Settings/audit-log')] },
    { label: 'HR', items: [P('Attendance SOP', '/HR/attendance-sop'), P('Advance SOP', '/HR/advance-sop'), P('Allowance SOP', '/HR/allowance-sop'), P('Claim SOCSO', '/HR/claim-socso'),
      P('Staff Complaints', '/HR/staff-complaints'), P('Director Complaints', '/HR/director-complaints'), P('Raise a Complaint', '/HR/raise-complaint')] },
    MY_ACCOUNT
  ],
  // Roles without their own pages yet (signed in 21 Oct): their Dashboard, Issues, Playbook, the staff HR pages and their own forms.
  // Portfolio is view-only for Operations, Procurement and Marketing (no fees, payouts or owner contact details).
  operations: [
    { items: [P('Dashboard', '/Dashboard')] },
    PORTFOLIO,
    { label: 'Operations', items: [P('Issues', '/Operations/issues'), P('Offline Inquiries', '/Operations/offline-inquiries'), P('Booking Forms', '/Operations/booking-forms')] },
    NEW_LISTINGS, PLAYBOOK, HR_STAFF,
    MY_ACCOUNT
  ],
  // IT: view-only except its own tickets.
  it: [
    { items: [P('Dashboard', '/Dashboard')] },
    { label: 'Operations', items: [P('Issues', '/Operations/issues')] },
    PLAYBOOK, HR_STAFF,
    MY_ACCOUNT
  ],
  hr: [
    { items: [P('Dashboard', '/Dashboard')] },
    { label: 'HR', items: [P('Attendance SOP', '/HR/attendance-sop'), P('Advance SOP', '/HR/advance-sop'), P('Allowance SOP', '/HR/allowance-sop'), P('Claim SOCSO', '/HR/claim-socso'),
      P('Staff Complaints', '/HR/staff-complaints'), P('Director Complaints', '/HR/director-complaints')] },
    { label: 'Operations', items: [P('Issues', '/Operations/issues')] },
    PLAYBOOK,
    { label: 'Company Settings', items: [P('Staff Accounts', '/Settings/staff'), P('Audit Log', '/Settings/audit-log')] },
    MY_ACCOUNT
  ],
  procurement: [
    { items: [P('Dashboard', '/Dashboard')] },
    PORTFOLIO,
    { label: 'Procurement', items: [P('Forms', '/Procurement/forms')] },
    { label: 'Operations', items: [P('Issues', '/Operations/issues')] },
    PLAYBOOK, HR_STAFF,
    MY_ACCOUNT
  ],
  marketing: [
    { items: [P('Dashboard', '/Dashboard')] },
    PORTFOLIO,
    { label: 'Operations', items: [P('Issues', '/Operations/issues')] },
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
