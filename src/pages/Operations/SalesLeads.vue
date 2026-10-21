<template>
  <main class="content">
    <div class="notice ok" v-show="okMsg">{{ okMsg }}</div>

    <!-- List (Figma 254:6983) -->
    <template v-if="view === 'list'">
      <div>
        <div class="page-head">
          <div>
            <h1>Offline inquiries <span class="sample-tag">Sample</span></h1>
            <div class="sub">{{ canAssign ? 'Log offline inquiries and assign each one to an Operations member to follow up.' : 'Log offline inquiries. A Director assigns each one to an Operations member to follow up.' }}</div>
          </div>
          <button class="btn btn-primary" @click="go('new')">+ Log inquiry</button>
        </div>
        <div class="pills brand count-pills" style="margin-bottom:16px">
          <template v-for="f in FILTERS" :key="f.key">
            <button class="pill-btn" :class="{ on: filter === f.key }" @click="filter = f.key">{{ `${f.label} · ${count(f.key)}` }}</button>
          </template>
        </div>
        <section class="card">
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th>Inquiry</th><th>Looking for</th><th>Source</th><th>Assigned to</th><th>Status</th><th>Updated</th><th></th></tr></thead>
              <tbody>
                <template v-for="ld in shown()" :key="ld.id">
                  <tr>
                    <td>{{ ld.id }}</td>
                    <td>{{ ld.lookingFor }}</td>
                    <td>{{ ld.source }}</td>
                    <td>
                      <template v-if="!ld.assignedTo && canAssign">
                        <select class="select assign-sel" aria-label="Assign to" @change="assign(ld, $event.target.value)">
                          <option value="">Choose staff</option>
                          <template v-for="s in STAFF" :key="s"><option :value="s">{{ s }}</option></template>
                        </select>
                      </template>
                      <span v-show="ld.assignedTo">{{ ld.assignedTo }}</span>
                      <span class="muted" v-show="!ld.assignedTo && !canAssign">Waiting for a Director</span>
                    </td>
                    <td><span class="pill" :class="STATUS[ld.status][1]">{{ STATUS[ld.status][0] }}</span></td>
                    <td>{{ short(ld.updated) }}</td>
                    <td class="num"><button class="editlink" @click="go('lead', ld.id)">{{ ld.assignedTo || !canAssign ? 'View' : 'Assign' }}</button></td>
                  </tr>
                </template>
                <tr v-show="!shown().length"><td colspan="7" class="muted">No inquiries here.</td></tr>
              </tbody>
            </table>
          </div>
        </section>
        <p class="page-note">Contact details are shown only to the assigned staff member and the Directors. Sample inquiries are kept in this browser until offline inquiries are saved to Firebase.</p>
      </div>
    </template>

    <!-- Log inquiry (Figma 254:7235) -->
    <template v-if="view === 'new'">
      <div>
        <button class="back" @click="go('list')">← Back to Offline inquiries</button>
        <div class="page-head">
          <div>
            <h1>Log inquiry</h1>
            <div class="sub">{{ canAssign ? 'Record an offline inquiry and assign it to an Operations member to follow up.' : 'Record an offline inquiry. A Director assigns it to an Operations member.' }}</div>
          </div>
          <div class="head-tools">
            <button class="btn" @click="go('list')">Cancel</button>
            <button class="btn btn-primary" @click="saveNew()">{{ canAssign ? 'Save and assign' : 'Save' }}</button>
          </div>
        </div>
        <div class="notice error" v-show="formError">{{ formError }}</div>
        <div class="side-grid">
          <div class="form-card">
            <section class="card">
              <h2>Inquiry</h2>
              <div class="grid-fields">
                <div class="field"><label for="lLooking">Looking for</label><input class="input" id="lLooking" v-model="form.lookingFor" placeholder="e.g. Monthly rental, 2 bedrooms, Ampang"></div>
                <div class="field"><label for="lSource">Source</label>
                  <select class="input" id="lSource" v-model="form.source"><template v-for="s in SOURCES" :key="s"><option :value="s">{{ s }}</option></template></select></div>
                <div class="field"><label for="lName">Contact name</label><input class="input" id="lName" v-model="form.contactName" placeholder="e.g. Prospect A"></div>
                <div class="field"><label for="lPhone">Phone</label><input class="input" id="lPhone" v-model="form.phone" placeholder="e.g. 012-345 6789"></div>
                <div class="field"><label for="lBudget">Budget</label><input class="input" id="lBudget" v-model="form.budget" placeholder="e.g. RM 2,200 a month"></div>
                <div class="field"><label for="lView">Preferred viewing</label><input class="input" id="lView" type="date" v-model="form.viewing"></div>
              </div>
            </section>
            <section class="card" v-if="canAssign">
              <h2>Assign to</h2>
              <div class="field" style="max-width:340px;margin:0"><label for="lAssign">Operations member</label>
                <select class="input" id="lAssign" v-model="form.assignedTo">
                  <option value="">Assign later</option>
                  <template v-for="s in STAFF" :key="s"><option :value="s">{{ s }}</option></template>
                </select></div>
            </section>
            <section class="card">
              <h2>Status (optional)</h2>
              <div class="status-opts">
                <template v-for="k in ['interested', 'considering', 'uninterested']" :key="k">
                  <button type="button" class="status-opt" :class="{ on: form.status === k }" @click="form.status = form.status === k ? 'new' : k">{{ STATUS[k][0] }}</button>
                </template>
              </div>
            </section>
            <section class="card">
              <h2>Note</h2>
              <textarea class="input" style="height:80px" v-model="form.note" placeholder="e.g. Walked in, wants to view this weekend" aria-label="Note"></textarea>
            </section>
          </div>
          <section class="card next-list">
            <div class="card-head"><h2>What happens next</h2></div>
            <p v-if="!canAssign">- A Director assigns it to an Operations member.</p>
            <p>- The assigned Operations member sees the inquiry in their Offline inquiries list.</p>
            <p>- They update the status after each follow-up, from a computer or phone.</p>
            <p>- Finance and the Directors can see every inquiry and its history here.</p>
          </section>
        </div>
      </div>
    </template>

    <!-- One lead -->
    <template v-if="view === 'lead' && lead">
      <div>
        <button class="back" @click="go('list')">← Back to Offline inquiries</button>
        <div class="page-head">
          <div>
            <h1>{{ `${lead.id} · ${lead.lookingFor}` }}</h1>
            <div class="sub">{{ `${lead.source} · logged by ${lead.loggedBy} on ${short(lead.created)}` }}</div>
          </div>
          <span class="pill" :class="STATUS[lead.status][1]">{{ STATUS[lead.status][0] }}</span>
        </div>
        <div class="side-grid">
          <div class="form-card">
            <section class="card">
              <div class="card-head"><h2>Update this inquiry</h2></div>
              <div class="field" style="max-width:340px"><label for="uAssign">Assigned to</label>
                <select class="input" id="uAssign" v-model="upd.assignedTo" :disabled="!canAssign">
                  <option value="">Not assigned</option>
                  <template v-for="s in STAFF" :key="s"><option :value="s" :selected="s === upd.assignedTo">{{ s }}</option></template>
                </select></div>
              <div class="field"><label>Status</label>
                <div class="status-opts">
                  <template v-for="k in ['interested', 'considering', 'uninterested']" :key="k">
                    <button type="button" class="status-opt" :class="{ on: upd.status === k }" @click="upd.status = k">{{ STATUS[k][0] }}</button>
                  </template>
                </div></div>
              <div class="field"><label for="uNote">Follow-up note</label>
                <textarea class="input" id="uNote" v-model="upd.note" placeholder="e.g. Called back, viewing booked for Saturday"></textarea></div>
              <div class="notice error" v-show="formError">{{ formError }}</div>
              <div class="actions"><button class="btn btn-primary" @click="saveUpdate()">Save update</button></div>
            </section>
            <section class="card">
              <div class="card-head"><h2>History</h2></div>
              <div class="hist">
                <template v-for="(h, i) in lead.history.slice().reverse()" :key="i">
                  <div><small>{{ `${stamp(h.at)} · ${h.by}` }}</small><span>{{ h.text }}</span></div>
                </template>
              </div>
            </section>
          </div>
          <section class="card">
            <div class="card-head"><h2>Contact</h2></div>
            <template v-if="canSeeContact(lead)">
              <div>
                <div class="kv"><span>Name</span><span>{{ lead.contactName || '—' }}</span></div>
                <div class="kv"><span>Phone</span><span>{{ lead.phone || '—' }}</span></div>
              </div>
            </template>
            <template v-if="!canSeeContact(lead)">
              <div>
                <div class="kv"><span>Name</span><span class="masked">Hidden</span></div>
                <div class="kv"><span>Phone</span><span class="masked">{{ lead.phone ? '•••• ' + lead.phone.slice(-4) : '—' }}</span></div>
                <p class="help">Only the assigned staff member and the Directors see contact details.</p>
              </div>
            </template>
            <div class="kv"><span>Budget</span><span>{{ lead.budget || '—' }}</span></div>
            <div class="kv"><span>Preferred viewing</span><span>{{ lead.viewing ? short(lead.viewing) : '—' }}</span></div>
          </section>
        </div>
      </div>
    </template>
  </main>
</template>

<script>
import { useSession } from '@/stores/session.js';

const me = useSession();

const STATUS = { new: ['New', 'blue'], interested: ['Interested (Pending payment)', 'green'], considering: ['Considering', 'amber'], uninterested: ['Uninterested', 'grey'] };
const FILTERS = [{ key: 'all', label: 'All' }, { key: 'new', label: 'New' }, { key: 'interested', label: 'Interested (Pending payment)' },
  { key: 'considering', label: 'Considering' }, { key: 'uninterested', label: 'Uninterested' }];
const STAFF = ['Operations 1', 'Operations 2'];   // placeholder Operations members until staff accounts feed this list
// Who can assign a lead to an Operations member. Directors only for now (Khairul 21 Oct); add roles here to change it.
const ASSIGNERS = ['director'];
const SOURCES = ['Walk-in', 'Phone call', 'WhatsApp', 'Referral', 'Agent', 'Other'];
const KEY = 'wb.leads';
const d = s => `2026-10-${s}T10:00:00`;
const SAMPLE = [
  { id: 'LD-0146', lookingFor: 'Yearly lease, 1 bedroom, Bangsar', source: 'Phone call', assignedTo: '', status: 'new', contactName: 'Prospect A', phone: '012-000 0146', budget: 'RM 2,000 a month', viewing: '', loggedBy: 'Finance user 1', created: d(19), updated: d(19) },
  { id: 'LD-0145', lookingFor: 'Monthly rental, 2 bedrooms, Ampang', source: 'Walk-in', assignedTo: 'Operations 1', status: 'new', contactName: 'Prospect B', phone: '012-000 0145', budget: 'RM 2,200 a month', viewing: '2026-10-24', loggedBy: 'Finance user 1', created: d(19), updated: d(19) },
  { id: 'LD-0144', lookingFor: 'Short stay, 4 nights, KLCC', source: 'Phone call', assignedTo: 'Operations 2', status: 'interested', contactName: 'Prospect C', phone: '012-000 0144', budget: 'RM 250 a night', viewing: '', loggedBy: 'Finance user 2', created: d(16), updated: d(18) },
  { id: 'LD-0143', lookingFor: 'Yearly lease, studio, Cheras', source: 'WhatsApp', assignedTo: 'Operations 1', status: 'considering', contactName: 'Prospect D', phone: '012-000 0143', budget: 'RM 1,500 a month', viewing: '', loggedBy: 'Finance user 1', created: d(15), updated: d(17) },
  { id: 'LD-0141', lookingFor: 'Short stay, 2 nights', source: 'Walk-in', assignedTo: 'Operations 2', status: 'uninterested', contactName: 'Prospect E', phone: '012-000 0141', budget: '', viewing: '', loggedBy: 'Finance user 2', created: d(12), updated: d(14) }
].map(x => ({ ...x, history: [{ at: x.created, by: x.loggedBy, text: `Logged the inquiry${x.assignedTo ? `, assigned to ${x.assignedTo}` : ''}.` }] }));
const load = () => { try { const v = JSON.parse(localStorage.getItem(KEY)); if (Array.isArray(v)) return v; } catch {} return structuredClone(SAMPLE); };
const persist = v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const nowIso = () => { const t = new Date(); return new Date(t.getTime() - t.getTimezoneOffset() * 60000).toISOString().slice(0, 19); };

export default {
  data() {
    return {
      STATUS, FILTERS, STAFF, SOURCES,
      leads: load(), view: 'list', lead: null, filter: 'all', okMsg: '', formError: '',
      form: {}, upd: {}
    };
  },
  // ?new=1 opens Log inquiry, ?id= opens a lead. Moving between them changes the address, which remounts the page
  // (Back/Forward included); a message for the list travels in history.state.
  mounted() {
    const q = this.$route.query;
    if ('new' in q) this.show('new');
    else if (q.id) this.show('lead', q.id);
    else this.okMsg = history.state?.okMsg || '';
  },
  computed: {
    canAssign() { return ASSIGNERS.includes(me.role); }
  },
  methods: {
    go(view, id = null) {
      const query = view === 'new' ? { new: '1' } : view === 'lead' ? { id } : {};
      this.$router.push(view === 'list' ? { query, state: { okMsg: this.okMsg } } : { query });
    },
    show(view, id) {
      this.formError = '';
      if (view === 'new') this.form = { lookingFor: '', source: 'Walk-in', contactName: '', phone: '', budget: '', viewing: '', assignedTo: this.canAssign ? STAFF[0] : '', status: 'new', note: '' };
      if (view === 'lead') {
        this.lead = this.leads.find(x => x.id === id) || null;
        if (!this.lead) view = 'list';
        else this.upd = { assignedTo: this.lead.assignedTo, status: this.lead.status, note: '' };
      }
      this.view = view;
    },
    count(k) { return this.leads.filter(x => k === 'all' || x.status === k).length; },
    shown() { return this.leads.filter(x => this.filter === 'all' || x.status === this.filter).sort((a, b) => b.id.localeCompare(a.id)); },
    short(iso) { if (!iso) return ''; const [, m, dd] = iso.slice(0, 10).split('-'); return `${+dd} ${MON[+m - 1]}`; },
    stamp(iso) { return `${this.short(iso)}, ${iso.slice(11, 16)}`; },
    canSeeContact(ld) { return me.role === 'director' || ld.loggedBy === me.name || ld.assignedTo === me.name; },
    save() { persist(this.leads); },
    assign(ld, who) {
      if (!who) return;
      ld.assignedTo = who; ld.updated = nowIso();
      ld.history.push({ at: ld.updated, by: me.name, text: `Assigned to ${who}.` });
      this.save(); this.okMsg = `${ld.id} assigned to ${who}.`;
    },
    saveNew() {
      const f = this.form;
      if (!f.lookingFor.trim()) return this.formError = 'Say what they are looking for, e.g. Monthly rental, 2 bedrooms, Ampang.';
      if (!f.contactName.trim() && !f.phone.trim()) return this.formError = 'Add a contact name or phone number so Operations can follow up.';
      const next = Math.max(0, ...this.leads.map(x => +x.id.slice(3))) + 1;
      const at = nowIso();
      const ld = { id: `LD-${String(next).padStart(4, '0')}`, lookingFor: f.lookingFor.trim(), source: f.source, assignedTo: f.assignedTo, status: f.status,
        contactName: f.contactName.trim(), phone: f.phone.trim(), budget: f.budget.trim(), viewing: f.viewing, loggedBy: me.name, created: at, updated: at,
        history: [{ at, by: me.name, text: `Logged the inquiry${f.assignedTo ? `, assigned to ${f.assignedTo}` : ''}.${f.note.trim() ? ' ' + f.note.trim() : ''}` }] };
      this.leads.push(ld); this.save();
      this.okMsg = `${ld.id} logged${ld.assignedTo ? ` and assigned to ${ld.assignedTo}` : ''}.`; this.go('list');
    },
    saveUpdate() {
      const ld = this.lead, u = this.upd, parts = [];
      if (u.assignedTo !== ld.assignedTo) parts.push(u.assignedTo ? `Assigned to ${u.assignedTo}.` : 'Unassigned.');
      if (u.status !== ld.status) parts.push(`Status: ${STATUS[u.status][0]}.`);
      if (u.note.trim()) parts.push(u.note.trim());
      if (!parts.length) return this.formError = 'Nothing changed. Pick a status or add a note.';
      ld.assignedTo = u.assignedTo; ld.status = u.status; ld.updated = nowIso();
      ld.history.push({ at: ld.updated, by: me.name, text: parts.join(' ') });
      this.save(); this.formError = ''; this.upd.note = ''; this.okMsg = `${ld.id} updated.`;
    }
  }
};
</script>

<style scoped>
    .count-pills .pill-btn { height: 26px; font-size: 12px; padding: 0 10px; }
    .assign-sel { height: 26px; font-size: 12px; font-weight: 500; border-radius: 999px; border: 0; padding: 0 22px 0 10px; background-color: var(--accent-soft); color: var(--accent);
      background-position: calc(100% - 13px) 11px, calc(100% - 9px) 11px; }
    .back { display: inline-block; color: var(--accent); font-size: 13px; font-weight: 500; margin-bottom: 14px; background: none; border: 0; padding: 0; cursor: pointer; }
    .form-card { display: grid; gap: 16px; }
    .form-card h2 { font-size: 15px; margin: 0 0 12px; }
    .status-opts { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 10px; }
    .status-opt { display: flex; align-items: center; gap: 8px; min-height: 40px; padding: 8px 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); color: var(--text); font-size: 13px; text-align: left; }
    .status-opt::before { content: ""; width: 11px; height: 11px; border-radius: 50%; border: 1.5px solid var(--text-2); flex: none; }
    .status-opt.on { border-color: var(--accent); background: var(--accent-soft); }
    .status-opt.on::before { border-color: var(--accent); background: var(--accent); box-shadow: inset 0 0 0 2px var(--surface); }
    .next-list p { margin: 0 0 10px; font-size: 13px; color: var(--text-2); }
    .hist { display: grid; gap: 10px; }
    .hist div { font-size: 13px; border-left: 2px solid var(--line); padding-left: 10px; }
    .hist small { display: block; color: var(--muted); font-size: 11px; }
    .page-note { color: var(--muted); font-size: 12px; margin-top: 14px; }
    .masked { color: var(--muted); }
    @media (max-width: 640px) { .status-opts { grid-template-columns: minmax(0,1fr); } }
</style>
