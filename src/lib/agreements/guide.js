// lib/agreements/guide.js — the words of the Agreements guide (the ⓘ button on every Agreements page, 13 Nov 2026).
// Plain data, so the wording can be changed here without touching the pages. components/agreements/AgreementGuide.vue shows it.

// Day to day: everyone who uses Agreements.
export const DAILY_STEPS = [
  { key: 'pick', title: 'Pick the agreement', to: '/Agreements', go: 'Open Agreements',
    text: 'Agreements shows one card for each kind of agreement. Click a card to see its records.' },
  { key: 'fill', title: 'Fill in the details',
    text: 'Click "+ Fill in" (or "+ New …") and answer the questions. It saves by itself as a Draft, so you can stop and come back. '
      + 'To let the tenant or owner fill it in themselves, open the record and click "Send to fill in & sign": you get a link and a password to send them.' },
  { key: 'check', title: 'Check what was sent in',
    text: 'Anything sent in through a link waits under "To check". Open it, read the answers, fix what is wrong, then click "Checked: mark completed".' },
  { key: 'generate', title: 'Make the agreement PDF',
    text: 'Open the record (or tick it in the table) and click "Generate agreement". Choose the template, look through the preview, then "Download & save to history".' },
  { key: 'renew', title: 'Renew before it ends', to: '/Agreements/renewals', go: 'Open Renewals',
    text: 'Renewals lists every agreement that has an end date. The person in charge is reminded before it ends and on the day; "Renew" starts the next term from the old one.' }
];

// Setting up: people with Agreement Setup (Directors).
export const SETUP_STEPS = [
  { key: 'master', title: 'Add the master file', to: '/Agreements/setup', go: 'Open Agreement Setup',
    text: 'Your original agreement, as a Word file or a Google Docs link. It is kept safe in Drive; you change it through a working copy ("Edit in Google Docs").' },
  { key: 'form', title: 'Build the form',
    text: 'The questions staff answer. Add fields, mark the ones that must be filled, add choices and formulas. "Try the form" shows it the way staff will see it.' },
  { key: 'template', title: 'Make the template and place the fields',
    text: 'Turn the master file into a PDF template (or upload a PDF). Open it and drag each field to the spot where it should print, then preview it with sample data.' },
  { key: 'reminders', title: 'Turn on renewal reminders (optional)',
    text: 'In Agreement Setup › Forms, click "Renewal" on a form and choose which field is its end date.' }
];

// What each page is for. steps: the step(s) above that happen on this page.
export const PAGES = {
  home: { name: 'Agreements', steps: ['pick'], tips: [
    'Each card is one kind of agreement, with how many records are draft, completed or waiting for a check.',
    '"+ Fill in" starts a new one straight away.',
    'A blue "to check" pill means someone has sent one in through a link.'] },
  records: { name: 'Records of one agreement', steps: ['fill', 'check', 'generate'], tips: [
    'The buttons along the top filter by status: All open, To check, Draft, Completed, Archived.',
    'Click a row to open it. Tick one row to "Generate agreement"; tick several to Duplicate or Archive them.',
    '"Save as view" keeps your columns, filters and sorting for next time.',
    'Import and Export move records to and from Excel or CSV.'] },
  record: { name: 'One agreement record', steps: ['fill', 'check', 'generate'], tips: [
    'Your changes save by themselves. The line under the title says when it was last saved.',
    'Fields marked * must be filled. A note at the top counts what still needs attention.',
    '"Send to fill in & sign" lets the tenant or owner complete it from a link.',
    '"Generate agreement" makes the PDF. Click "Mark completed" once it is final; "Back to draft" opens it again.'] },
  renewals: { name: 'Renewals', steps: ['renew'], tips: [
    'Only agreements whose form has renewal reminders turned on are listed.',
    '"Renew" makes the next term as a new record, with the old answers filled in. Change the dates, then send it to sign.',
    '"Not renewing" stops the reminders for that agreement; "Undo" brings them back.'] },
  setup: { name: 'Agreement Setup', steps: ['master', 'form', 'template', 'reminders'], tips: [
    'Work from top to bottom: 1 Master files, 2 Forms, 3 Agreement templates.',
    'One form can have several templates, for example the same agreement in two languages.',
    'Archiving hides something without deleting the records made with it.'] },
  master: { name: 'Master file', steps: ['master'], tips: [
    'This is the original. "Edit in Google Docs" opens a working copy; the master only changes when you save that copy.',
    '"+ Make a template" turns it into a PDF template for a form.',
    'After changing the master, open each of its templates and click "Update from master".'] },
  form: { name: 'Form builder', steps: ['form'], tips: [
    'Left: click or drag a field type to add it.',
    'Middle: your fields, in the order staff see them. Drag ⠿ to move one.',
    'Right: the settings of the field you clicked (name, required, choices, "Show only when").',
    'Changes save by themselves. Undo and Redo are at the top. "Try the form" shows it as staff see it.'] },
  template: { name: 'Place fields on the template', steps: ['template'], tips: [
    'Left: the form\'s fields. Drag one onto the page where it should print.',
    'Click a placed box to move it, resize it or change how its text looks.',
    'Preview with sample data before staff use it. "Update from master" brings in a newer version of the document.'] }
};

// The words on the status pills.
export const WORDS = [
  ['Draft', 'Being filled in. Not final yet.'],
  ['To check', 'Sent in through a fill-in link. Staff should read it and mark it completed.'],
  ['Completed', 'Checked and final.'],
  ['Archived', 'Put away. It can be restored.'],
  ['Template', 'The agreement as a PDF, with the form\'s fields placed on it.'],
  ['Fill-in link', 'A web address and password for the tenant or owner to fill in and sign the form themselves.']
];
