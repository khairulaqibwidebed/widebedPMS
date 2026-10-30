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
    <button class="btn" style="border:1.5px solid var(--accent); color:var(--accent)" v-show="canEdit && !editing && !editTab" :disabled="loading" @click="tab === 'checklist' ? startEdit() : startEditC()">{{ tab === 'checklist' ? 'Edit checklist' : 'Edit this page' }}</button>
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
                      <button class="icon-btn" @click="del(st.items, i, `this item`)" aria-label="Remove item">×</button></div>
                  </template>
                  <div class="actions" style="margin-top:8px"><button class="btn btn-sm" @click="addItem(st)">+ Add item</button>
                    <button class="editlink" @click="del(draft, si, `this stage and its items`)">Remove stage</button></div>
                </div>
              </template>
              <button class="btn" @click="addStage()">+ Add stage</button>
              <div class="notice error" v-show="editErr">{{ editErr }}</div>
            </template>
          </div>
        </template>

        <!-- How Widebed works -->
        <template v-if="tab === 'how'">
          <div class="card prose" v-if="editTab !== 'how'">
            <template v-for="(sec, i) in how" :key="i"><h3>{{ sec.title }}</h3><div v-html="rich(sec.text)"></div></template>
          </div>
          <template v-else>
            <div class="edit-bar">
              <span>Editing this page for everyone.</span>
              <button class="btn" @click="editTab = ''">Cancel</button>
              <button class="btn btn-primary" :disabled="busy" @click="saveEditC()">{{ busy ? 'Saving…' : 'Save changes' }}</button>
            </div>
            <div class="notice error" v-show="editErr">{{ editErr }}</div>
            <div class="card step-edit" v-for="(sec, i) in dc.how" :key="i">
              <button type="button" class="del-btn" :title="`Delete section ${i + 1}`" :aria-label="`Delete section ${i + 1}`" @click="del(dc.how, i, `section ${i + 1}`)"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button>
              <span class="item-no">{{ `Section ${i + 1}` }}</span>
              <input class="input stage-title" v-model="sec.title" :aria-label="`Section ${i + 1} title`" placeholder="Section title">
              <textarea class="input ed-area" rows="6" v-model="sec.text" :aria-label="`Section ${i + 1} text`"></textarea>
            </div>
            <button class="btn" @click="dc.how.push({ title: 'New section', text: '' })">+ Add section</button>
            <p class="help">Start a line with "- " for a bullet. Put **double stars** around words to make them bold. A blank line starts a new paragraph.</p>
          </template>
        </template>

        <!-- Who to ask -->
        <template v-if="tab === 'who'">
          <div class="card prose" v-if="editTab !== 'who'">
            <h3>Who to ask for what</h3>
            <div class="table-wrap" style="margin-bottom:16px"><table class="table">
              <thead><tr><th>Team</th><th>Ask them about</th></tr></thead>
              <tbody><template v-for="w in who" :key="w.team + w.what"><tr><td><b>{{ w.team }}</b></td><td>{{ w.what }}</td></tr></template></tbody>
            </table></div>
            <h3>Accounts and tools to request on day 1</h3>
            <ul><template v-for="d in dayOne" :key="d"><li>{{ d }}</li></template></ul>
            <p>{{ dayOneNote }}</p>
          </div>
          <template v-else>
            <div class="edit-bar">
              <span>Editing this page for everyone.</span>
              <button class="btn" @click="editTab = ''">Cancel</button>
              <button class="btn btn-primary" :disabled="busy" @click="saveEditC()">{{ busy ? 'Saving…' : 'Save changes' }}</button>
            </div>
            <div class="notice error" v-show="editErr">{{ editErr }}</div>
            <div class="card">
              <div class="card-head"><h2>Who to ask for what</h2></div>
              <div class="pair-edit" v-for="(w, i) in dc.who" :key="i"><input class="input" v-model="w.team" placeholder="Team" :aria-label="`Team ${i + 1}`"><input class="input" v-model="w.what" placeholder="Ask them about" :aria-label="`Topics ${i + 1}`">
                <button class="icon-btn" @click="del(dc.who, i, `the ${w.team || 'blank'} row`)" aria-label="Remove row">×</button></div>
              <button class="btn btn-sm" @click="dc.who.push({ team: '', what: '' })">+ Add team</button>
            </div>
            <div class="card">
              <div class="card-head"><h2>Accounts and tools to request on day 1</h2></div>
              <div class="item-edit" v-for="(d, i) in dc.dayOne" :key="i"><input class="input" v-model="dc.dayOne[i]" :aria-label="`Item ${i + 1}`"><button class="icon-btn" @click="del(dc.dayOne, i, `item ${i + 1}`)" aria-label="Remove item">×</button></div>
              <button class="btn btn-sm" @click="dc.dayOne.push('')">+ Add item</button>
              <textarea class="input ed-area" rows="2" style="margin-top:10px" v-model="dc.dayOneNote" aria-label="Note under the list"></textarea>
            </div>
          </template>
        </template>

        <!-- PMS walkthrough -->
        <template v-if="tab === 'walk'">
          <div class="card" v-if="editTab !== 'walk'">
            <div class="card-head"><h2>PMS walkthrough</h2>
              <select class="select" v-model="walkRole" aria-label="Role"><template v-for="r in Object.keys(walk)" :key="r"><option :value="r">{{ r }}</option></template></select></div>
            <div class="walk">
              <template v-for="(w, i) in walk[walkRole] || []" :key="walkRole + i">
                <div class="walk-step"><span class="n">{{ i + 1 }}</span><div><b>{{ w.title }}</b><p>{{ w.text }}</p></div>
                  <RouterLink class="navlink" :to="w.to" v-if="w.to">{{ 'Open ' + w.page + ' →' }}</RouterLink></div>
              </template>
            </div>
          </div>
          <template v-else>
            <div class="edit-bar">
              <span>Editing this page for everyone.</span>
              <button class="btn" @click="editTab = ''">Cancel</button>
              <button class="btn btn-primary" :disabled="busy" @click="saveEditC()">{{ busy ? 'Saving…' : 'Save changes' }}</button>
            </div>
            <div class="notice error" v-show="editErr">{{ editErr }}</div>
            <div class="card">
              <div class="card-head"><h2>PMS walkthrough</h2>
                <select class="select" v-model="walkRole" aria-label="Role"><template v-for="r in Object.keys(dc.walk)" :key="r"><option :value="r">{{ r }}</option></template></select></div>
              <div class="pair-edit" style="grid-template-columns:minmax(0,1fr) auto"><input class="input" v-model="newRole" placeholder="New role or group name"><button class="btn btn-sm" @click="addRole()">+ Add role</button></div>
              <div class="actions" style="margin:6px 0 10px"><button class="editlink" v-show="Object.keys(dc.walk).length > 1" @click="removeRole()">{{ `Remove "${walkRole}" and its steps` }}</button></div>
              <div class="step-edit" v-for="(w, i) in dc.walk[walkRole] || []" :key="walkRole + i">
                <button type="button" class="del-btn" :title="`Delete step ${i + 1}`" :aria-label="`Delete step ${i + 1}`" @click="del(dc.walk[walkRole], i, `step ${i + 1}`)"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button>
                <span class="item-no">{{ `Step ${i + 1}` }}</span>
                <input class="input stage-title" v-model="w.title" :aria-label="`Step ${i + 1} title`" placeholder="Step title">
                <textarea class="input ed-area" rows="2" v-model="w.text" :aria-label="`Step ${i + 1} text`"></textarea>
                <div class="help" v-if="w.to">{{ `Links to ${w.page}` }}</div>
              </div>
              <button class="btn btn-sm" @click="(dc.walk[walkRole] = dc.walk[walkRole] || []).push({ title: '', text: '' })">+ Add step</button>
            </div>
          </template>
        </template>

        <!-- FAQ & glossary -->
        <template v-if="tab === 'faq'">
          <div class="stack" style="gap:16px" v-if="editTab !== 'faq'">
            <div class="card faq">
              <div class="card-head"><h2>FAQ</h2></div>
              <template v-for="f in faq" :key="f.q"><details><summary>{{ f.q }}</summary><p>{{ f.a }}</p></details></template>
            </div>
            <div class="card">
              <div class="card-head"><h2>Glossary</h2></div>
              <dl class="gloss"><template v-for="g in gloss" :key="g[0]"><div style="display:contents"><dt>{{ g[0] }}</dt><dd>{{ g[1] }}</dd></div></template></dl>
            </div>
          </div>
          <div class="stack" style="gap:16px" v-else>
            <div class="edit-bar">
              <span>Editing this page for everyone.</span>
              <button class="btn" @click="editTab = ''">Cancel</button>
              <button class="btn btn-primary" :disabled="busy" @click="saveEditC()">{{ busy ? 'Saving…' : 'Save changes' }}</button>
            </div>
            <div class="notice error" v-show="editErr">{{ editErr }}</div>
            <div class="card">
              <div class="card-head"><h2>FAQ</h2></div>
              <div class="step-edit" v-for="(f, i) in dc.faq" :key="i">
                <button type="button" class="del-btn" :title="`Delete question ${i + 1}`" :aria-label="`Delete question ${i + 1}`" @click="del(dc.faq, i, `question ${i + 1}`)"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button>
                <span class="item-no">{{ `Question ${i + 1}` }}</span>
                <input class="input stage-title" v-model="f.q" :aria-label="`Question ${i + 1}`" placeholder="Question">
                <textarea class="input ed-area" rows="2" v-model="f.a" :aria-label="`Answer ${i + 1}`" placeholder="Answer"></textarea>
              </div>
              <button class="btn btn-sm" @click="dc.faq.push({ q: '', a: '' })">+ Add question</button>
            </div>
            <div class="card">
              <div class="card-head"><h2>Glossary</h2></div>
              <div class="pair-edit" v-for="(g, i) in dc.gloss" :key="i"><input class="input" v-model="g[0]" placeholder="Term" :aria-label="`Term ${i + 1}`"><textarea class="input ed-area" rows="2" style="margin:0" v-model="g[1]" placeholder="Meaning" :aria-label="`Meaning ${i + 1}`"></textarea>
                <button class="icon-btn" @click="del(dc.gloss, i, `the term ${g[0] || ''}`.trim())" aria-label="Remove term">×</button></div>
              <button class="btn btn-sm" @click="dc.gloss.push(['', ''])">+ Add term</button>
            </div>
          </div>
        </template>
      </div>

      <div class="stack" style="gap:16px">
        <div class="card">
          <div class="card-head"><h2>Who to ask</h2></div>
          <div class="ask"><template v-for="w in who" :key="w.team + w.what"><div><b>{{ w.team }}</b><span>{{ w.what }}</span></div></template></div>
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
    <Teleport to="body">
      <div class="modal-back" v-if="askLeave" @click.self="askLeave = false" v-esc="() => { askLeave = false }">
        <div class="modal leave-modal" role="dialog" aria-modal="true" aria-label="Unsaved changes">
          <h2>Save your changes?</h2>
          <p class="help">You changed this page but have not saved it.</p>
          <div class="modal-foot"><button class="btn" @click="askLeave = false">Keep editing</button><button class="btn" @click="leave('discard')">Discard</button><button class="btn btn-primary" :disabled="busy" @click="leave('save')">{{ busy ? 'Saving…' : 'Save and leave' }}</button></div>
        </div>
      </div>
    </Teleport>
  </main>
</template>

<script>
import { collection, doc, getDoc, getDocs, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db, ROLE_LABEL } from '@/lib/firebase.js';
import { audit, friendlyError } from '@/lib/finance-data.js';
import { toast } from '@/lib/toast.js';
import { askConfirm } from '@/lib/confirm.js';
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
const HOW = [
  { title: 'What we do', text: 'Widebed looks after serviced apartments for unit owners in Malaysia. Each unit is either rented out as short stays or to a long-term tenant, and the owner is paid once a month.' },
  { title: 'Short-term and long-term stays', text: '- **Short-term** is 29 nights or less. Guests book through sites like Booking.com, Agoda or Trip.com, or directly. Utilities are included in the booking price and Widebed pays them.\n- **Long-term** is 30 nights or more. The tenant pays a 2-month deposit (always required), pays utilities directly, and pays rent the day before each new cycle to get the next smart-lock passcode.' },
  { title: 'Owners and their arrangements', text: '- **Fixed rent**: the owner gets the same amount every month, and Widebed keeps the booking money.\n- **Profit share 40%** (daily stays): 20% service fee plus 20% utilities, taken from the month\'s total.\n- **Profit share 20%** (monthly stays).\n- **Long-term tenant**: 10% fee plus SST on the fee.' },
  { title: 'What eZee does and what the PMS does', text: 'eZee is the booking system: every stay, check-in and check-out lives there. The PMS is Widebed\'s owner and finance layer. Finance uploads the eZee report, the PMS works out each unit\'s statement, Finance checks it and completes the month, and the owner is paid with a PDF statement.' }
];
const DAY_ONE = ['PMS login (HR asks the Director to invite you; you get an email to set your own password)', 'Company email', 'Laptop and office Wi-Fi (IT)', 'eZee access, if your role uses it (Operations or Finance)', 'Company Google Drive folder for your team'];
const DAY_ONE_NOTE = 'Intern accounts carry an "Intern" label and can only open what their role allows.';
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
const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const uid6 = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export default {
  data() {
    return {
      TABS, how: copy(HOW), who: copy(WHO), dayOne: [...DAY_ONE], dayOneNote: DAY_ONE_NOTE, walk: copy(WALK), faq: copy(FAQ), gloss: copy(GLOSS),
      editTab: '', askLeave: false, goTab: '', dc: {}, newRole: '', stages: withIds(STAGES), newcomers: [],
      seesAll: ['director', 'hr'].includes(me.role), canEdit: ['director', 'hr'].includes(me.role), intern: !!me.intern,
      tab: 'checklist', walkRole: me.role === 'finance' ? 'Finance' : 'Everyone', ticks: {},
      loading: true, error: '', editing: false, draft: [], editErr: '', busy: false
    };
  },
  async mounted() {
    const h = this.$route.hash.slice(1); if (TABS.some(t => t.key === h)) this.tab = h;
    try {
      const [content, mine] = await Promise.all([getDoc(doc(db, 'playbook', 'onboarding')), getDoc(doc(db, 'onboardingProgress', me.user.uid))]);
      if (content.exists()) {
        const c = content.data();
        if (Array.isArray(c.stages)) this.stages = c.stages;
        if (Array.isArray(c.how)) this.how = c.how;
        if (Array.isArray(c.who)) this.who = c.who;
        if (Array.isArray(c.dayOne)) this.dayOne = c.dayOne;
        if (typeof c.dayOneNote === 'string') this.dayOneNote = c.dayOneNote;
        if (c.walk && typeof c.walk === 'object') { this.walk = c.walk; if (!this.walk[this.walkRole]) this.walkRole = Object.keys(this.walk)[0] || this.walkRole; }
        if (Array.isArray(c.faq)) this.faq = c.faq;
        if (Array.isArray(c.gloss)) this.gloss = c.gloss;
      }
      if (mine.exists()) this.ticks = mine.data().ticks || {};
      if (this.seesAll) await this.loadNewcomers();
    } catch (e) { this.error = friendlyError(e, 'load the checklist'); }
    this.loading = false;
  },
  methods: {
    // Keeps the router's history state; a router navigation would remount the page.
    switchTab(k) { this.tab = k; history.replaceState(history.state, '', '#' + k); },
    setTab(k) {
      if (k === this.tab) return;
      if (!this.editing && !this.editTab) return this.switchTab(k);
      if (!this.isDirty()) { this.editing = false; this.editTab = ''; return this.switchTab(k); }   // nothing changed: just leave edit mode
      this.goTab = k; this.askLeave = true;
    },
    isDirty() {
      const j = JSON.stringify;
      if (this.editing) return j(this.draft) !== j(this.stages);
      const d = this.dc;
      return j(({ how: [d.how], who: [d.who, d.dayOne, d.dayOneNote], walk: [d.walk], faq: [d.faq, d.gloss] })[this.editTab])
        !== j(({ how: [this.how], who: [this.who, this.dayOne, this.dayOneNote], walk: [this.walk], faq: [this.faq, this.gloss] })[this.editTab]);
    },
    async leave(how) {
      if (how === 'save') { if (this.editing) await this.saveEdit(); else await this.saveEditC(); if (this.editing || this.editTab) return; }
      else { this.editing = false; this.editTab = ''; }
      this.askLeave = false; this.switchTab(this.goTab);
    },
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
    // Text with "- " bullets and **bold**, shown safely (everything is escaped first)
    rich(t) {
      const out = []; let list = [];
      const flush = () => { if (list.length) { out.push('<ul>' + list.map(x => `<li>${x}</li>`).join('') + '</ul>'); list = []; } };
      for (const raw of String(t || '').split('\n')) {
        const line = raw.trim(), html = esc(line).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
        if (!line) flush(); else if (line.startsWith('- ')) list.push(html.slice(2)); else { flush(); out.push(`<p>${html}</p>`); }
      }
      flush(); return out.join('');
    },
    startEditC() {
      this.dc = { how: copy(this.how), who: copy(this.who), dayOne: [...this.dayOne], dayOneNote: this.dayOneNote, walk: copy(this.walk), faq: copy(this.faq), gloss: copy(this.gloss) };
      this.editErr = ''; this.newRole = ''; this.editTab = this.tab;
    },
    addRole() {
      const r = this.newRole.trim();
      if (!r) return;
      if (!this.dc.walk[r]) this.dc.walk[r] = [];
      this.walkRole = r; this.newRole = '';
    },
    async removeRole() {
      const r = this.walkRole;
      if (!await askConfirm({ title: `Delete "${r}"?`, message: 'This removes the role and all its walkthrough steps once you save.', confirmText: 'Yes, delete', danger: true })) return;
      delete this.dc.walk[r]; this.walkRole = Object.keys(this.dc.walk)[0];
    },
    // Asks first; nothing is saved until "Save changes", and Cancel brings everything back
    async del(list, i, what) {
      if (await askConfirm({ title: `Delete ${what}?`, message: 'It is removed from this page once you press Save changes. Cancel brings it back.', confirmText: 'Yes, delete', danger: true })) list.splice(i, 1);
    },
    async saveEditC() {
      const d = this.dc, t = this.editTab, clean = s => String(s || '').trim();
      const next = {
        how: { how: d.how.map(x => ({ title: clean(x.title), text: String(x.text || '').trim() })).filter(x => x.title || x.text) },
        who: { who: d.who.map(x => ({ team: clean(x.team), what: clean(x.what) })).filter(x => x.team), dayOne: d.dayOne.map(clean).filter(Boolean), dayOneNote: clean(d.dayOneNote) },
        walk: { walk: Object.fromEntries(Object.entries(d.walk).map(([r, st]) => [r, st.map(x => ({ ...x, title: clean(x.title), text: clean(x.text) })).filter(x => x.title || x.text)])) },
        faq: { faq: d.faq.map(x => ({ q: clean(x.q), a: clean(x.a) })).filter(x => x.q), gloss: d.gloss.map(g => [clean(g[0]), clean(g[1])]).filter(g => g[0]) }
      }[t];
      this.busy = true; this.editErr = '';
      try {
        const batch = writeBatch(db);
        batch.set(doc(db, 'playbook', 'onboarding'), { ...next, updatedAt: serverTimestamp(), updatedBy: me.name, updatedByUid: me.user.uid }, { merge: true });
        audit(batch, me, { action: 'playbook.update', entity: 'playbook/onboarding', changes: [{ field: t, old: 'edited', new: 'edited' }] });
        await batch.commit();
        Object.assign(this, next); this.editTab = '';
        if (!this.walk[this.walkRole]) this.walkRole = Object.keys(this.walk)[0] || this.walkRole;
        toast('Changes saved');
      } catch (e) { this.editErr = friendlyError(e, 'save the page'); }
      this.busy = false;
    },
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
        batch.set(doc(db, 'playbook', 'onboarding'), { stages, updatedAt: serverTimestamp(), updatedBy: me.name, updatedByUid: me.user.uid }, { merge: true });
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
    .ed-area { width: 100%; height: auto; min-height: 60px; resize: vertical; line-height: 1.5; padding-top: 10px; margin-bottom: 6px; }
    .pair-edit { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,2fr) 28px; gap: 6px; margin-bottom: 6px; }
    .step-edit { position: relative; padding: 6px 14px 12px; margin-bottom: 12px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); }
    .item-no { display: block; min-height: 38px; line-height: 38px; margin-bottom: 2px !important; font-size: 12px; font-weight: 600; color: var(--muted); margin-bottom: 6px; }
    .del-btn { position: absolute; top: 12px; right: 14px; width: 26px; height: 26px; display: grid; place-items: center; border-radius: 7px; border: 1px solid #f0c4be; background: #fdecea; color: #c0392b; cursor: pointer; }
    .del-btn svg { width: 14px; height: 14px; }
    @media (hover: hover) { .del-btn:hover { background: #c0392b; border-color: #c0392b; color: #fff; } }
    .del-btn:focus-visible { background: #c0392b; border-color: #c0392b; color: #fff; }
    .item-edit .icon-btn, .pair-edit .icon-btn { color: #c0392b; font-size: 18px; border-radius: 7px; }
    @media (hover: hover) { .item-edit .icon-btn:hover, .pair-edit .icon-btn:hover { background: #fdecea; } }
    .step-edit .stage-title { margin-bottom: 6px; }
    .leave-modal { max-width: 440px; }
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
