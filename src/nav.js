// Sidebar per role. Folding groups: only the group of the current page is open (agreed 19 Oct for all roles).
// to = null means the page is not built yet.
const P = (label, to = null) => ({ label, to });
const PORTFOLIO = { label: 'Portfolio', items: [P('Owners', '/Portfolio/owners'), P('Properties', '/Portfolio/properties'), P('Bookings', '/Portfolio/bookings')] };
const HR_STAFF = { label: 'HR', items: [P('Attendance SOP', '/HR/attendance-sop'), P('Advance SOP', '/HR/advance-sop'), P('Allowance SOP', '/HR/allowance-sop'), P('Claim SOCSO', '/HR/claim-socso'), P('Raise a complaint', '/HR/raise-complaint')] };

export const NAV = {
  finance: [
    { items: [P('Dashboard', '/Dashboard'), P('Reports', '/Reports')] },
    PORTFOLIO,
    { label: 'Finance', items: [P('Upload eZee report', '/Finance/upload'), P('Expenses & Reimbursements', '/Finance/expenses'), P('Month-end payout', '/Finance/month-end'),
      P('Invoices & Receipts', '/Finance/invoices'), P('Offline payments', '/Finance/offline-payments'), P('Offline inquiries', '/Operations/offline-inquiries')] },
    { label: 'Operations', items: [P('Issues', '/Operations/issues')] },
    { label: 'Playbook', items: [P('Onboarding', '/Playbook/onboarding'), P('Business Model', '/Playbook/business-model')] },
    HR_STAFF
  ],
  director: [
    { items: [P('Dashboard', '/Dashboard'), P('Tasks'), P('Reports', '/Reports')] },
    PORTFOLIO,
    { label: 'Finance', items: [P('Upload eZee report', '/Finance/upload'), P('Expenses & Reimbursements', '/Finance/expenses'), P('Month-end payout', '/Finance/month-end'),
      P('Invoices & Receipts', '/Finance/invoices'), P('Offline payments', '/Finance/offline-payments')] },
    { label: 'Operations', items: [P('Issues', '/Operations/issues'), P('Offline inquiries', '/Operations/offline-inquiries'), P('Booking forms', '/Operations/booking-forms')] },
    { label: 'Procurement', items: [P('New owner listings', '/Procurement/new-owner-listings'), P('Forms', '/Procurement/forms')] },
    { label: 'Playbook', items: [P('Onboarding', '/Playbook/onboarding'), P('Business Model', '/Playbook/business-model')] },
    { label: 'Settings', items: [P('Staff accounts', '/Settings/staff'), P('Brand logos', '/Settings/brand-logos'), P('Audit log', '/Settings/audit-log')] },
    { label: 'HR', items: [P('Attendance SOP', '/HR/attendance-sop'), P('Advance SOP', '/HR/advance-sop'), P('Allowance SOP', '/HR/allowance-sop'), P('Claim SOCSO', '/HR/claim-socso'),
      P('Staff complaints', '/HR/staff-complaints'), P('Director complaints', '/HR/director-complaints'), P('Raise a complaint', '/HR/raise-complaint')] }
  ]
};
