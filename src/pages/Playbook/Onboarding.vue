<template>
  <main class="content soft-page">
    <div class="page-head">
      <div>
        <h1>Onboarding for new staff and interns</h1>
        <div class="sub">Start here. Work through each stage, tick items as you go, and ask the people listed if you get stuck.</div>
      </div>
    </div>

    <div class="tabs-row">
    <div class="pills brand ob-tabs" role="tablist">
      <template v-for="tb in TABS" :key="tb.key">
        <button class="pill-btn" role="tab" :aria-selected="tab === tb.key" :class="tab === tb.key && 'on'" @click="setTab(tb.key)">{{ tb.label }}</button>
      </template>
    </div>
    <button class="btn" style="border:1.5px solid var(--accent); color:var(--accent)" v-show="tab === 'checklist' && canEdit && !editing" :disabled="loading" @click="startEdit()">Edit checklist</button>
    </div>

    <div class="side-grid">
      <div class="stack" style="gap:16px">

        <!-- Checklist -->
        <template v-if="tab === 'checklist'">
          <div class="stack" style="gap:16px">
            <div class="notice error" v-show="error">{{ error }}</div>
            <div class="card">
              <div class="prog-head"><h2>{{ `Your progress · ${doneCount()} of ${total()} done` }}</h2><span class="tag" v-show="intern">Intern</span></div>
              <div class="bar"><div :style="`width:${total() ? doneCount() / total() * 100 : 0}%`"></div></div>
              <div class="loading-bar" v-show="loading" style="margin-top:10px"></div>
            </div>
            <template v-if="!editing">
              <template v-for="st in stages" :key="st.key">
                <div class="card stage-card">
                  <div class="card-head"><h2>{{ st.title }}</h2>
                    <span class="pill" :class="stageDone(st) === st.items.length ? 'green' : 'grey'">{{ `${stageDone(st)} of ${st.items.length}` }}</span></div>
                  <div class="stage-sub">{{ st.sub }}</div>
                  <template v-for="it in st.items" :key="it.id">
                    <label class="tick" :class="isTicked(it.id) && 'done'">
                      <input type="checkbox" :checked="isTicked(it.id)" :disabled="loading" @change="toggle(it.id)"><span>{{ it.text }}</span>
                    </label>
                  </template>
                </div>
              </template>
              <p class="help">Your ticks are saved to your account. HR and the Directors can see how far you are.</p>
            </template>
            <template v-if="editing">
              <div class="edit-bar">
                <span>Editing the checklist for everyone. Ticks stay with each item.</span>
                <button class="btn" @click="editing = false">Cancel</button>
                <button class="btn btn-primary" :disabled="busy" @click="saveEdit()">{{ busy ? 'Saving…' : 'Save checklist' }}</button>
              </div>
              <template v-for="(st, si) in draft" :key="st.key">
                <div class="card stage-card">
                  <input class="input stage-title" v-model="st.title" :aria-label="`Stage ${si + 1} title`">
                  <input class="input" v-model="st.sub" :aria-label="`Stage ${si + 1} note`" placeholder="Short note under the title">
                  <template v-for="(it, i) in st.items" :key="it.id">
                    <div class="item-edit"><input class="input" v-model="it.text" :aria-label="`Stage ${si + 1} item ${i + 1}`">
                      <button class="icon-btn" @click="st.items.splice(i, 1)" aria-label="Remove item">×</button></div>
                  </template>
                  <div class="actions" style="margin-top:8px"><button class="btn btn-sm" @click="addItem(st)">+ Add item</button>
                    <button class="editlink" @click="draft.splice(si, 1)">Remove stage</button></div>
                </div>
              </template>
              <button class="btn" @click="addStage()">+ Add stage</button>
              <div class="notice error" v-show="editErr">{{ editErr }}</div>
            </template>
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
        <div class="card newc" v-show="seesAll">
          <div class="card-head"><h2>Newcomers (HR and Directors)</h2></div>
          <template v-for="n in newcomers" :key="n.uid">
            <div class="kv"><span>{{ n.who }}</span><span>{{ `${n.done} / ${total()}` + (n.done >= total() ? ' ✓' : '') }}</span></div>
          </template>
          <div class="empty" v-show="!newcomers.length">No one has ticked anything yet.</div>
          <div class="help" style="margin-top:6px">HR edits the stages and items for each role.</div>
        </div>
        <div class="callout">New here? Read the <RouterLink class="navlink" to="/Playbook/business-model">Business Model brief</RouterLink> in your first week.</div>
      </div>
    </div>
  </main>
</template>

<script>
import { collection, doc, getDoc, getDocs, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db, ROLE_LABEL } from '@/lib/firebase.js';
import { audit, friendlyError } from '@/lib/finance-data.js';
import { toast } from '@/lib/toast.js';
import { useSession } from '@/stores/session.js';
import { STAGES, withIds } from './onboarding-stages.js';

const me = useSession();

const TABS = [{ key: 'checklist', label: 'Checklist' }, { key: 'how', label: 'How Widebed works' }, { key: 'who', label: 'Who to ask' },
  { key: 'walk', label: 'PMS walkthrough' }, { key: 'faq', label: 'FAQ & glossary' }];
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
// Checklist content lives in playbook/onboarding (HR and Directors edit it); until the first save the stages above show.
// Each item has an id so ticks stay with the item when the list is edited. Each person's ticks are in
// onboardingProgress/{uid}: only that person writes them, HR and Directors read everyone's.
const copy = v => JSON.parse(JSON.stringify(v));
const uid6 = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export default {
  data() {
    return {
      TABS, WHO, WALK, FAQ, GLOSS, stages: withIds(STAGES), newcomers: [],
      seesAll: ['director', 'hr'].includes(me.role), canEdit: ['director', 'hr'].includes(me.role), intern: !!me.intern,
      tab: 'checklist', walkRole: me.role === 'finance' ? 'Finance' : 'Everyone', ticks: {},
      loading: true, error: '', editing: false, draft: [], editErr: '', busy: false
    };
  },
  async mounted() {
    const h = this.$route.hash.slice(1); if (TABS.some(t => t.key === h)) this.tab = h;
    try {
      const [content, mine] = await Promise.all([getDoc(doc(db, 'playbook', 'onboarding')), getDoc(doc(db, 'onboardingProgress', me.user.uid))]);
      if (content.exists() && Array.isArray(content.data().stages)) this.stages = content.data().stages;
      if (mine.exists()) this.ticks = mine.data().ticks || {};
      if (this.seesAll) await this.loadNewcomers();
    } catch (e) { this.error = friendlyError(e, 'load the checklist'); }
    this.loading = false;
  },
  methods: {
    // Keeps the router's history state; a router navigation would remount the page.
    setTab(k) { this.tab = k; history.replaceState(history.state, '', '#' + k); },
    async loadNewcomers() {
      const [prog, users] = await Promise.all([getDocs(collection(db, 'onboardingProgress')), getDocs(collection(db, 'users'))]);
      const names = Object.fromEntries(users.docs.map(u => [u.id, u.data()]));
      this.newcomers = prog.docs.map(d => {
        const u = names[d.id] || {};
        return { uid: d.id, who: `${u.displayName || 'Staff member'}${u.role ? ' · ' + (ROLE_LABEL[u.role] || u.role) : ''}`, ticks: d.data().ticks || {} };
      }).map(n => ({ ...n, done: this.countTicks(n.ticks) })).sort((a, b) => a.done - b.done || a.who.localeCompare(b.who));
    },
    isTicked(id) { return !!this.ticks[id]; },
    async toggle(id) {
      const was = !!this.ticks[id];
      this.ticks = { ...this.ticks, [id]: !was };
      try {
        const batch = writeBatch(db);
        batch.set(doc(db, 'onboardingProgress', me.user.uid), { ticks: { [id]: !was }, updatedAt: serverTimestamp() }, { merge: true });
        audit(batch, me, { action: 'onboarding.tick', entity: `onboardingProgress/${me.user.uid}`, changes: [{ field: id, old: was, new: !was }] });
        await batch.commit();
      } catch (e) { this.ticks = { ...this.ticks, [id]: was }; toast(friendlyError(e, 'save your tick')); }
    },
    countTicks(ticks) { return this.stages.reduce((n, st) => n + st.items.filter(it => ticks[it.id]).length, 0); },
    stageDone(st) { return st.items.filter(it => this.isTicked(it.id)).length; },
    doneCount() { return this.countTicks(this.ticks); },
    total() { return this.stages.reduce((n, st) => n + st.items.length, 0); },
    startEdit() { this.draft = copy(this.stages); this.editErr = ''; this.editing = true; },
    addItem(st) { st.items.push({ id: `${st.key}-${uid6()}`, text: '' }); },
    addStage() { this.draft.push({ key: 's' + uid6(), title: 'New stage', sub: '', items: [] }); },
    async saveEdit() {
      const stages = this.draft.map(st => ({ key: st.key, title: st.title.trim(), sub: st.sub.trim(),
        items: st.items.map(it => ({ id: it.id, text: it.text.trim() })).filter(it => it.text) })).filter(st => st.title || st.items.length);
      if (!stages.some(st => st.items.length)) return this.editErr = 'Keep at least one item.';
      this.busy = true; this.editErr = '';
      try {
        const batch = writeBatch(db);
        batch.set(doc(db, 'playbook', 'onboarding'), { stages, updatedAt: serverTimestamp(), updatedBy: me.name, updatedByUid: me.user.uid });
        audit(batch, me, { action: 'playbook.update', entity: 'playbook/onboarding', changes: [{ field: 'items', old: this.total(), new: stages.reduce((n, st) => n + st.items.length, 0) }] });
        await batch.commit();
        this.stages = stages; this.editing = false;
        this.newcomers = this.newcomers.map(n => ({ ...n, done: this.countTicks(n.ticks) }));
        toast('Checklist saved.');
      } catch (e) { this.editErr = friendlyError(e, 'save the checklist'); }
      this.busy = false;
    }
  }
};
</script>

<style scoped>
    .tabs-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
    .tabs-row .ob-tabs { margin-bottom: 0; width: auto; flex: 0 1 auto; }
    .tabs-row > .btn { margin-left: auto; transition: background .15s, color .15s; }
    .ob-tabs { margin-bottom: 20px; }
    .prog-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 10px; }
    .prog-head h2 { margin: 0; font-size: 15px; }
    .bar { height: 8px; background: var(--chip); border-radius: 999px; overflow: hidden; }
    .bar > div { height: 100%; background: var(--accent); transition: width .2s; }
    .stage-card .card-head { margin-bottom: 4px; }
    .prog-head .btn { margin-left: auto; }
    .stage-title { font-weight: 600; margin-bottom: 6px; }
    .stage-card > .input { margin-bottom: 6px; }
    .item-edit { display: grid; grid-template-columns: minmax(0,1fr) 28px; gap: 6px; margin-bottom: 6px; }
    .item-edit .input { height: 32px; font-size: 13px; }
    .edit-bar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; background: var(--amber-soft); color: var(--amber); border-radius: 10px; padding: 10px 14px; font-size: 13px; }
    .edit-bar span { margin-right: auto; }
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
