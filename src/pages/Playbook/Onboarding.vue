<template>
  <main class="content">
    <div class="page-head">
      <div>
        <h1>Onboarding for new staff and interns</h1>
        <div class="sub">Start here. Work through each stage, tick items as you go, and ask the people listed if you get stuck.</div>
      </div>
    </div>

    <div class="pills brand ob-tabs" role="tablist">
      <template v-for="tb in TABS" :key="tb.key">
        <button class="pill-btn" role="tab" :aria-selected="tab === tb.key" :class="tab === tb.key && 'on'" @click="setTab(tb.key)">{{ tb.label }}</button>
      </template>
    </div>

    <div class="side-grid">
      <div class="stack" style="gap:16px">

        <!-- Checklist -->
        <template v-if="tab === 'checklist'">
          <div class="stack" style="gap:16px">
            <div class="card">
              <div class="prog-head"><h2>{{ `Your progress · ${doneCount()} of ${total()} done` }}</h2><span class="tag" v-show="intern">Intern</span></div>
              <div class="bar"><div :style="`width:${total() ? doneCount() / total() * 100 : 0}%`"></div></div>
            </div>
            <template v-for="st in STAGES" :key="st.key">
              <div class="card stage-card">
                <div class="card-head"><h2>{{ st.title }}</h2>
                  <span class="pill" :class="stageDone(st) === st.items.length ? 'green' : 'grey'">{{ `${stageDone(st)} of ${st.items.length}` }}</span></div>
                <div class="stage-sub">{{ st.sub }}</div>
                <template v-for="(it, i) in st.items" :key="st.key + i">
                  <label class="tick" :class="isTicked(st.key, i) && 'done'">
                    <input type="checkbox" :checked="isTicked(st.key, i)" @change="toggle(st.key, i)"><span>{{ it }}</span>
                  </label>
                </template>
              </div>
            </template>
            <p class="help">Your ticks are kept in this browser for now; saving them to your account comes with the HR increment.</p>
          </div>
        </template>

        <!-- How Widebed works -->
        <template v-if="tab === 'how'">
          <div class="card prose">
            <h3>What we do</h3>
            <p>Widebed looks after serviced apartments for unit owners in Malaysia. Each unit is either rented out as short stays or to a long-term tenant, and the owner is paid once a month.</p>
            <h3>Short-term and long-term stays</h3>
            <ul>
              <li><b>Short-term</b> is 29 nights or less. Guests book through sites like Booking.com, Agoda or Trip.com, or directly. Utilities are included in the booking price and Widebed pays them.</li>
              <li><b>Long-term</b> is 30 nights or more. The tenant pays a 2-month deposit (always required), pays utilities directly, and pays rent the day before each new cycle to get the next smart-lock passcode.</li>
            </ul>
            <h3>Owners and their arrangements</h3>
            <ul>
              <li><b>Fixed rent</b>: the owner gets the same amount every month, and Widebed keeps the booking money.</li>
              <li><b>Profit share 40%</b> (daily stays): 20% service fee plus 20% utilities, taken from the month's total.</li>
              <li><b>Profit share 20%</b> (monthly stays).</li>
              <li><b>Long-term tenant</b>: 10% fee plus SST on the fee.</li>
            </ul>
            <h3>What eZee does and what the PMS does</h3>
            <p>eZee is the booking system: every stay, check-in and check-out lives there. The PMS is Widebed's owner and finance layer. Finance uploads the eZee report, the PMS works out each unit's statement, Finance checks it and completes the month, and the owner is paid with a PDF statement.</p>
          </div>
        </template>

        <!-- Who to ask -->
        <template v-if="tab === 'who'">
          <div class="card prose">
            <h3>Who to ask for what</h3>
            <div class="table-wrap" style="margin-bottom:16px"><table class="table">
              <thead><tr><th>Team</th><th>Ask them about</th></tr></thead>
              <tbody><template v-for="w in WHO" :key="w.team + w.what"><tr><td><b>{{ w.team }}</b></td><td>{{ w.what }}</td></tr></template></tbody>
            </table></div>
            <h3>Accounts and tools to request on day 1</h3>
            <ul>
              <li>PMS login (HR asks the Director to invite you; you get an email to set your own password)</li>
              <li>Company email</li>
              <li>Laptop and office Wi-Fi (IT)</li>
              <li>eZee access, if your role uses it (Operations or Finance)</li>
              <li>Company Google Drive folder for your team</li>
            </ul>
            <p>Intern accounts carry an "Intern" label and can only open what their role allows.</p>
          </div>
        </template>

        <!-- PMS walkthrough -->
        <template v-if="tab === 'walk'">
          <div class="card">
            <div class="card-head"><h2>PMS walkthrough</h2>
              <select class="select" v-model="walkRole" aria-label="Role"><template v-for="r in Object.keys(WALK)" :key="r"><option :value="r">{{ r }}</option></template></select></div>
            <div class="walk">
              <template v-for="(w, i) in WALK[walkRole]" :key="walkRole + i">
                <div class="walk-step"><span class="n">{{ i + 1 }}</span><div><b>{{ w.title }}</b><p>{{ w.text }}</p></div>
                  <RouterLink class="navlink" :to="w.to" v-if="w.to">{{ 'Open ' + w.page + ' →' }}</RouterLink></div>
              </template>
            </div>
          </div>
        </template>

        <!-- FAQ & glossary -->
        <template v-if="tab === 'faq'">
          <div class="stack" style="gap:16px">
            <div class="card faq">
              <div class="card-head"><h2>FAQ</h2></div>
              <template v-for="f in FAQ" :key="f.q"><details><summary>{{ f.q }}</summary><p>{{ f.a }}</p></details></template>
            </div>
            <div class="card">
              <div class="card-head"><h2>Glossary</h2></div>
              <dl class="gloss"><template v-for="g in GLOSS" :key="g[0]"><div style="display:contents"><dt>{{ g[0] }}</dt><dd>{{ g[1] }}</dd></div></template></dl>
            </div>
          </div>
        </template>
      </div>

      <div class="stack" style="gap:16px">
        <div class="card">
          <div class="card-head"><h2>Who to ask</h2></div>
          <div class="ask"><template v-for="w in WHO" :key="w.team + w.what"><div><b>{{ w.team }}</b><span>{{ w.what }}</span></div></template></div>
        </div>
        <div class="card newc" v-show="isDirector">
          <div class="card-head"><h2>Newcomers (HR and Directors)</h2><span class="sample-tag">sample</span></div>
          <template v-for="n in NEWCOMERS" :key="n.who">
            <div class="kv"><span>{{ n.who }}</span><span>{{ `${n.done} / ${total()}` + (n.done >= total() ? ' ✓' : '') }}</span></div>
          </template>
          <div class="help" style="margin-top:6px">HR edits the stages and items for each role.</div>
        </div>
        <div class="callout">New here? Read the <RouterLink class="navlink" to="/Playbook/business-model">Business Model brief</RouterLink> in your first week.</div>
      </div>
    </div>
  </main>
</template>

<script>
import { useSession } from '@/stores/session.js';

const me = useSession();

const TABS = [{ key: 'checklist', label: 'Checklist' }, { key: 'how', label: 'How Widebed works' }, { key: 'who', label: 'Who to ask' },
  { key: 'walk', label: 'PMS walkthrough' }, { key: 'faq', label: 'FAQ & glossary' }];
const STAGES = [
  { key: 'before', title: 'Before day 1', sub: 'Sent with your offer letter', items: ['Sign and return the PDPA confidentiality form', 'Get your PMS login from HR', 'Read the Business Model brief'] },
  { key: 'day1', title: 'Day 1', sub: 'Your first day in the office', items: ['Meet your supervisor and the team you sit with', 'Tour of the office and one unit', 'Log in to the PMS and set your colour theme', 'Read "How Widebed works"'] },
  { key: 'week1', title: 'Week 1', sub: 'Learn the daily routine', items: ['Shadow Operations on a check-in and check-out', 'Watch Finance upload an eZee report', 'Raise and close a test ticket in Issues', 'Learn the owner arrangements (fixed rent, profit share, long-term)', 'Ask three questions in your first check-in'] },
  { key: 'month1', title: 'Month 1', sub: 'Work on your own', items: ['Help prepare one month-end statement with Finance', 'Explain OTA commission to your supervisor', 'Write down anything confusing for the next intern', 'Month-1 review with your supervisor', 'Give feedback on this onboarding', 'Sign off from HR'] }
];
const WHO = [
  { team: 'Finance', what: 'Statements, payouts, expenses, invoices' },
  { team: 'Operations', what: 'Check-ins, guests, smart-lock passcodes' },
  { team: 'Admin', what: 'Units, vendors, repairs' },
  { team: 'HR', what: 'Leave, payroll, internship forms' },
  { team: 'IT', what: 'Logins, laptops, Wi-Fi' },
  { team: 'Director', what: 'PMS access and roles, anything unclear' }
];
const WALK = {
  Finance: [
    { title: 'Upload the eZee report', text: 'Export the month from eZee (CSV or Excel) and drop it on the Upload page. Cancelled bookings (no room number) are set aside.', page: 'Upload', to: '/Finance/upload' },
    { title: 'Add expenses as they happen', text: 'Each repair, bill or reimbursement goes on its unit, with the receipt. Lines can be edited with a reason until that unit\'s statement is completed.', page: 'Expenses', to: '/Finance/expenses' },
    { title: 'Check each unit statement', text: 'Type the exact Trip.com amounts, look at anything marked Estimated or Negative.', page: 'Month-end payout', to: '/Finance/month-end' },
    { title: 'Approve & complete', text: 'When a unit has nothing Estimated, complete its statement. Each completed statement becomes a read-only PDF.', page: 'Month-end payout', to: '/Finance/month-end' },
    { title: 'Download documents', text: 'Owner statements, invoices and receipts are on Invoices & Receipts.', page: 'Invoices & Receipts', to: '/Finance/invoices' }
  ],
  Operations: [
    { title: 'Check-ins follow eZee', text: 'Guests and stays are handled in eZee as today.' },
    { title: 'Raise a ticket for any unit problem', text: 'Tag the team who should handle it, attach photos.', page: 'Issues', to: '/Operations/issues' },
    { title: 'Smart-lock passcodes', text: 'Passcodes are set by hand after Finance verifies the rent payment.' }
  ],
  'Everyone': [
    { title: 'Find any page', text: 'Press Ctrl K and type part of a page name.' },
    { title: 'Change your colour theme', text: 'Click your name at the top right, then Appearance.', page: 'Appearance', to: '/Settings/appearance' },
    { title: 'Raise a ticket', text: 'Anything broken in a unit or the office goes in Issues.', page: 'Issues', to: '/Operations/issues' }
  ]
};
const FAQ = [
  { q: 'Why does a booking count in the month the guest leaves?', a: 'Revenue is counted on the check-out date, so a stay from 28 Sep to 2 Oct belongs to October.' },
  { q: 'What is a long-term stay?', a: '30 nights or more. 29 nights or less is short-term.' },
  { q: 'Why is the Trip.com amount "Estimated"?', a: 'Trip.com takes a commission that is not in the eZee report. The PMS estimates 15% until Finance types the exact amount on the booking line.' },
  { q: 'What happens when an owner\'s month is negative?', a: 'The owner gets nothing that month and the negative balance is carried forward to the next month as an expense line.' },
  { q: 'Can a completed statement be changed?', a: 'Not directly. A Director can reopen it, which makes a new revision and keeps the old PDF.' },
  { q: 'Are invoices sent to tenants automatically?', a: 'No. Every invoice needs Finance approval first and is never sent automatically.' }
];
const GLOSS = [
  ['eZee', 'The booking system Widebed uses for every stay'],
  ['OTA', 'Online travel agency, e.g. Booking.com, Agoda, Trip.com'],
  ['PTO', 'Payment to owner, before Widebed\'s fee'],
  ['Fixed rent', 'Owner gets a set amount every month; Widebed keeps the booking money'],
  ['Profit share', 'Widebed takes a % of the unit\'s monthly total (40% daily, 20% monthly)'],
  ['SST', 'Sales and service tax, 8%'],
  ['Tourism Tax', 'RM 10 per unit per night for non-Malaysian guests'],
  ['Deposit', '2 months, required for every long-term tenant'],
  ['Completed', 'A month that Finance has approved; its statements are locked PDFs']
];
const NEWCOMERS = [{ who: 'Intern · started 13 Oct', done: 6 }, { who: 'Operations · started 1 Oct', done: 15 }, { who: 'Finance · started 15 Sep', done: 18 }];
const keyOf = () => 'wb.onboarding.' + me.user.uid;
const readTicks = () => { try { return JSON.parse(localStorage.getItem(keyOf())) || {}; } catch { return {}; } };

export default {
  data() {
    return {
      TABS, STAGES, WHO, WALK, FAQ, GLOSS, NEWCOMERS,
      isDirector: me.role === 'director', intern: !!me.intern,
      tab: 'checklist', walkRole: me.role === 'finance' ? 'Finance' : 'Everyone', ticks: readTicks()
    };
  },
  mounted() { const h = this.$route.hash.slice(1); if (TABS.some(t => t.key === h)) this.tab = h; },
  methods: {
    // Keeps the router's history state; a router navigation would remount the page.
    setTab(k) { this.tab = k; history.replaceState(history.state, '', '#' + k); },
    isTicked(s, i) { return !!this.ticks[`${s}.${i}`]; },
    toggle(s, i) {
      const k = `${s}.${i}`; this.ticks = { ...this.ticks, [k]: !this.ticks[k] };
      try { localStorage.setItem(keyOf(), JSON.stringify(this.ticks)); } catch {}
    },
    stageDone(st) { return st.items.filter((_, i) => this.isTicked(st.key, i)).length; },
    doneCount() { return STAGES.reduce((n, st) => n + this.stageDone(st), 0); },
    total() { return STAGES.reduce((n, st) => n + st.items.length, 0); }
  }
};
</script>

<style scoped>
    .ob-tabs { margin-bottom: 20px; }
    .prog-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 10px; }
    .prog-head h2 { margin: 0; font-size: 15px; }
    .bar { height: 8px; background: var(--chip); border-radius: 999px; overflow: hidden; }
    .bar > div { height: 100%; background: var(--accent); transition: width .2s; }
    .stage-card .card-head { margin-bottom: 4px; }
    .stage-sub { color: var(--text-2); font-size: 12px; margin-bottom: 10px; }
    .tick { display: flex; align-items: flex-start; gap: 10px; padding: 5px 0; font-size: 13px; cursor: pointer; }
    .tick input { width: 16px; height: 16px; margin: 1px 0 0; accent-color: var(--accent); flex: none; }
    .tick.done span { color: var(--muted); text-decoration: line-through; text-decoration-color: transparent; }
    .ask { display: grid; gap: 12px; font-size: 13px; }
    .ask b { display: block; }
    .ask span { color: var(--muted); font-size: 12px; }
    .newc .kv span:last-child { font-variant-numeric: tabular-nums; }
    .prose { font-size: 13px; color: var(--text-2); }
    .prose h3 { font-size: 14px; color: var(--text); margin: 18px 0 6px; }
    .prose h3:first-child { margin-top: 0; }
    .prose p, .prose ul { margin: 0 0 8px; }
    .prose ul { padding-left: 18px; }
    .walk { display: grid; gap: 10px; }
    .walk-step { display: grid; grid-template-columns: 28px minmax(0,1fr) auto; gap: 12px; align-items: start; padding: 12px 0; border-bottom: 1px solid var(--line); font-size: 13px; }
    .walk-step:last-child { border-bottom: 0; }
    .walk-step .n { width: 24px; height: 24px; border-radius: 50%; background: var(--accent-soft); color: var(--accent); font-weight: 700; font-size: 12px; display: grid; place-items: center; }
    .walk-step p { margin: 2px 0 0; color: var(--text-2); }
    .faq details { border-bottom: 1px solid var(--line); padding: 12px 0; font-size: 13px; }
    .faq details:last-child { border-bottom: 0; }
    .faq summary { font-weight: 600; cursor: pointer; }
    .faq p { margin: 8px 0 0; color: var(--text-2); }
    .gloss { display: grid; grid-template-columns: 140px minmax(0,1fr); gap: 8px 16px; font-size: 13px; }
    .gloss dt { font-weight: 600; }
    .gloss dd { margin: 0; color: var(--text-2); }
    @media (max-width: 520px) { .gloss { grid-template-columns: minmax(0,1fr); } .walk-step { grid-template-columns: 28px minmax(0,1fr); } .walk-step a { grid-column: 2; } }
</style>
