<template>
  <main class="content ag">
    <div class="loading-bar" v-show="loading || busy"></div>

    <div class="page-head">
      <div>
        <h1>Agent Database</h1>
        <div class="sub">Marketing › Agent Database · property agents, travel agents and MM2H partners who send us guests and owners</div>
      </div>
      <div class="head-tools">
        <RefreshButton @refresh="go()" />
        <button type="button" class="btn btn-primary" v-if="canEdit" @click="openForm(null)">+ Add agent</button>
      </div>
    </div>

    <section class="card">
      <div class="card-head"><h2>{{ `Agents · ${shown.length}` }}</h2></div>
      <p class="card-intro">Agents' contact and bank details are personal data (PDPA). The list shows only the last 4 digits of the bank account{{ canEdit ? '; open an agent to see the full number.' : '.' }}</p>
      <div class="toolbar tb-split">
        <div class="pills" role="group" aria-label="Filter by agency">
          <button type="button" class="pill-btn" v-for="t in filters" :key="t.id" :class="{ on: filter === t.id }" :aria-pressed="String(filter === t.id)" @click="filter = t.id">{{ `${t.label} · ${t.n}` }}</button>
        </div>
        <input class="input" type="search" v-model="search" placeholder="Search name, company, phone, email" aria-label="Search agents">
      </div>
      <Paged :items="shown" v-slot="{ pageRows }">
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Agent</th><th>Agency</th><th>Mobile</th><th>Email</th><th>Bank</th><th>Business card</th><th></th></tr></thead>
            <tbody>
              <tr class="clickable" v-for="a in pageRows" :key="a.id" @click="openView(a)">
                <td><div class="strong">{{ a.name }}</div><div class="muted small">{{ a.company || '—' }}</div></td>
                <td><span class="pill" :class="agencyColor(a)">{{ agencyLabel(a) }}</span></td>
                <td class="nowrap">{{ a.mobile || '—' }}</td>
                <td>{{ a.email || '—' }}</td>
                <td class="nowrap">{{ a.bankName || '—' }}<div class="muted small" v-if="a.acctLast4">{{ `···${a.acctLast4}` }}</div></td>
                <td><span class="pill green" v-if="a.cardFront || a.cardBack">Attached</span><span class="muted" v-else>None</span></td>
                <td class="num"><button type="button" class="navlink" @click.stop="openView(a)">View</button></td>
              </tr>
              <SkeletonRows v-if="loading && !agents.length" table :cols="7" />
              <tr v-show="!loading && !shown.length"><td colspan="7" class="muted">{{ agents.length ? 'No agents match this search.' : canEdit ? 'No agents yet. Use + Add agent.' : 'No agents yet.' }}</td></tr>
            </tbody>
          </table>
        </div>
      </Paged>
      <div class="card-foot"><span>{{ `Showing ${shown.length} of ${agents.length} agents` }}</span></div>
    </section>

    <!-- One agent: profile (view) or the add / edit form -->
    <div v-if="drawer">
      <div class="drawer-back" @click="closeDrawer()"></div>
      <aside class="drawer wide" role="dialog" :aria-label="drawer.mode === 'view' ? drawer.agent.name : 'Agent'" v-esc="closeDrawer">
        <div class="drawer-head">
          <h2>{{ drawer.mode === 'view' ? drawer.agent.name : drawer.agent ? `Edit ${drawer.agent.name}` : 'Add agent' }}</h2>
          <button type="button" class="icon-btn" @click="closeDrawer()" aria-label="Close">×</button>
        </div>

        <!-- Profile -->
        <!-- 20 Nov 2026: agent details on the left, business card on the right (stacked on a phone) -->
        <div class="drawer-body ag-view" v-if="drawer.mode === 'view'">
          <div class="ag-view-info">
            <div class="ag-tags"><span class="pill" :class="agencyColor(drawer.agent)">{{ agencyLabel(drawer.agent) }}</span><span class="muted">{{ drawer.agent.company }}</span></div>
            <div class="form-sec">Contact</div>
            <div class="kv"><span>Mobile number</span><span><a :href="`tel:${drawer.agent.mobile}`">{{ drawer.agent.mobile }}</a></span></div>
            <div class="kv"><span>Email</span><span><a v-if="drawer.agent.email" :href="`mailto:${drawer.agent.email}`">{{ drawer.agent.email }}</a><template v-else>—</template></span></div>
            <div class="kv"><span>Company name</span><span>{{ drawer.agent.company || '—' }}</span></div>
            <div class="kv"><span>Address</span><span class="pre">{{ drawer.agent.address || '—' }}</span></div>

            <div class="form-sec ag-sec-row">Bank details
              <button type="button" class="link" v-if="drawer.bank && drawer.bank.accountNo" @click="drawer.showAcct = !drawer.showAcct">{{ drawer.showAcct ? 'Hide number' : 'Show number' }}</button>
            </div>
            <div class="kv"><span>Bank</span><span>{{ drawer.agent.bankName || '—' }}</span></div>
            <template v-if="canEdit">
              <div class="kv"><span>Account holder</span><span>{{ drawer.bankLoading ? 'Loading…' : drawer.bank?.holder || '—' }}</span></div>
              <div class="kv"><span>Account number</span><span class="mono">{{ drawer.bankLoading ? 'Loading…' : acctText }}</span></div>
              <p class="help" v-if="drawer.bankError">{{ drawer.bankError }}</p>
            </template>
            <div class="kv" v-else><span>Account number</span><span class="mono">{{ drawer.agent.acctLast4 ? `···· ${drawer.agent.acctLast4}` : '—' }}</span></div>
            <p class="help ag-meta">{{ metaText }}</p>
          </div>

          <div class="ag-view-card">
            <div class="form-sec">Business card</div>
            <div class="ag-card-stack" v-if="drawer.agent.cardFront || drawer.agent.cardBack">
              <template v-for="side in SIDES" :key="side.key">
                <button type="button" class="ag-card" v-if="drawer.agent[side.key]" @click="viewCard(drawer.agent[side.key])" :aria-label="`Open ${side.label.toLowerCase()} of the business card`">
                  <img v-if="drawer.previews[side.key]" :src="drawer.previews[side.key]" :alt="`${side.label} of ${drawer.agent.name}'s business card`">
                  <span class="ag-card-ph" v-else>{{ drawer.previewError[side.key] ? 'Click to open' : isPdf(drawer.agent[side.key]) ? 'PDF · click to open' : 'Loading…' }}</span>
                  <span class="ag-card-label">{{ side.label }}</span>
                </button>
              </template>
              <p class="help">Click a card to see it full size.</p>
            </div>
            <div class="ag-card-none" v-else>No business card attached.</div>
          </div>
        </div>
        <div class="drawer-foot" v-if="drawer.mode === 'view'">
          <button type="button" class="btn btn-danger" v-if="isDirector" @click="remove(drawer.agent)" :disabled="busy">Delete</button>
          <span class="grow"></span>
          <button type="button" class="btn" @click="closeDrawer()">Close</button>
          <button type="button" class="btn btn-primary" v-if="canEdit" @click="openForm(drawer.agent)">Edit</button>
        </div>

        <!-- Add / edit -->
        <form class="drawer-body" v-if="drawer.mode === 'edit'" id="agentForm" @submit.prevent="save()" novalidate>
          <div class="notice error" v-show="f.error">{{ f.error }}</div>
          <div class="form-sec">Agent details</div>
          <div class="grid-fields">
            <div class="field"><label for="agName" class="req">Name</label><input class="input" id="agName" v-model="f.name" placeholder="Full name" maxlength="120"></div>
            <div class="field"><label for="agCompany">Company name</label><input class="input" id="agCompany" v-model="f.company" placeholder="e.g. Bayu Properties Sdn Bhd" maxlength="120"></div>
          </div>
          <fieldset class="field ag-fs">
            <legend class="req">Agency</legend>
            <div class="ag-agency">
              <label v-for="t in AGENCIES" :key="t.id" :class="{ on: f.agency === t.id }"><input type="radio" name="agency" :value="t.id" v-model="f.agency">{{ t.label }}</label>
            </div>
          </fieldset>
          <div class="field" v-if="f.agency === 'other'"><label for="agOther" class="req">Please specify</label><input class="input" id="agOther" v-model="f.agencyOther" placeholder="e.g. Relocation company, Corporate HR" maxlength="60"></div>
          <div class="grid-fields">
            <div class="field"><label for="agMobile" class="req">Mobile number</label><input class="input" id="agMobile" type="tel" v-model="f.mobile" placeholder="e.g. 012-345 6789" maxlength="30"></div>
            <div class="field"><label for="agEmail">Email</label><input class="input" id="agEmail" type="email" v-model="f.email" placeholder="name@company.com" maxlength="120"></div>
          </div>
          <div class="field"><label for="agAddress">Address</label><textarea class="input" id="agAddress" v-model="f.address" rows="3" placeholder="Street, city, postcode, state" maxlength="500"></textarea></div>

          <div class="form-sec">Bank details <span class="help ag-sec-note">· kept private: the list shows only the last 4 digits</span></div>
          <p class="help" v-if="f.bankLoading">Loading the saved bank details…</p>
          <div class="ag-bank">
            <div class="field"><label for="agBank">Bank</label>
              <select class="input" id="agBank" v-model="f.bankName"><option value="">Select bank</option><option v-for="b in BANKS" :key="b" :value="b">{{ b }}</option></select></div>
            <div class="field"><label for="agHolder">Bank account holder</label><input class="input" id="agHolder" v-model="f.holder" placeholder="Name as on the account" maxlength="120" :disabled="f.bankLoading"></div>
            <div class="field"><label for="agAcct">Bank account number</label><input class="input mono" id="agAcct" v-model="f.accountNo" inputmode="numeric" placeholder="Digits only" maxlength="24" :disabled="f.bankLoading"></div>
          </div>

          <div class="form-sec">Business card</div>
          <div class="ag-cards">
            <div class="ag-up" v-for="side in SIDES" :key="side.key">
              <template v-if="f[side.key]">
                <div class="file-line"><span class="ag-file">{{ f[side.key].name }}</span>
                  <span><button type="button" class="link" @click="viewCard(f[side.key])">View</button> · <button type="button" class="link" @click="f[side.key] = null">Remove</button></span></div>
                <span class="help">{{ side.label }}</span>
              </template>
              <label class="filedrop" v-else :class="{ off: f.uploading[side.key] }">
                <b>{{ f.uploading[side.key] ? `Uploading ${f.pct[side.key]}%` : side.label + (side.optional ? ' (optional)' : '') }}</b>
                Image or PDF, click to upload · saved to Google Drive
                <input type="file" hidden accept="image/*,application/pdf" :disabled="f.uploading[side.key]" @change="upload(side.key, $event)">
              </label>
            </div>
          </div>
        </form>
        <div class="drawer-foot" v-if="drawer.mode === 'edit'">
          <button type="button" class="btn" @click="drawer.agent ? openView(drawer.agent) : closeDrawer()">Cancel</button>
          <button type="submit" form="agentForm" class="btn btn-primary" :disabled="busy || f.bankLoading || anyUploading">{{ busy ? 'Saving…' : drawer.agent ? 'Save changes' : 'Save agent' }}</button>
        </div>
      </aside>
    </div>

    <FileViewer ref="viewer" />
  </main>
</template>

<script>
// Marketing > Agent Database (/Marketing/agents), 20 Nov 2026 (Khairul). Agent Database Base: the list and profiles.
// Full: add and edit, and see the bank account holder and number. Directors also delete. Firestore rules Draft 0.94.
// Business cards go to Google Drive > Agent Business Cards (api/drive.js kind 'agents'); only their file ids are saved.
import { useSession } from '@/stores/session.js';
import { can } from '@/lib/access.js';
import { friendlyError } from '@/lib/finance-data.js';
import { askConfirm } from '@/lib/confirm.js';
import { ensureFolders, uploadForLink, fileBlob } from '@/lib/drive.js';
import RefreshButton from '@/components/RefreshButton.vue';
import FileViewer from '@/components/FileViewer.vue';
import { AGENCIES, BANKS, agencyLabel, agencyColor, loadAgents, loadBank, saveAgent, deleteAgent, newAgentId } from './agents.js';

const me = useSession();
const SIDES = [{ key: 'cardFront', label: 'Front of card' }, { key: 'cardBack', label: 'Back of card', optional: true }];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function blankForm() {
  return { id: '', name: '', company: '', agency: 'property', agencyOther: '', mobile: '', email: '', address: '', bankName: '', holder: '', accountNo: '',
    cardFront: null, cardBack: null, active: true, error: '', bankLoading: false, uploading: { cardFront: false, cardBack: false }, pct: { cardFront: 0, cardBack: 0 } };
}

export default {
  components: { RefreshButton, FileViewer },
  data() {
    return { AGENCIES, BANKS, SIDES, agents: [], loading: true, busy: false, error: '', okMsg: '', filter: 'all', search: '', drawer: null, f: blankForm() };
  },
  computed: {
    canEdit() { return can(me, 'agents.edit'); },
    isDirector() { return me.role === 'director'; },
    filters() {
      return [{ id: 'all', label: 'All', n: this.agents.length }, ...AGENCIES.map(t => ({ id: t.id, label: t.label, n: this.agents.filter(a => a.agency === t.id).length }))];
    },
    shown() {
      const q = this.search.trim().toLowerCase();
      return this.agents.filter(a => (this.filter === 'all' || a.agency === this.filter)
        && (!q || [a.name, a.company, a.mobile, a.email, a.agencyOther].some(v => (v || '').toLowerCase().includes(q))
          || (a.mobile || '').replace(/\D/g, '').includes(q.replace(/\D/g, '') || '¬')));
    },
    anyUploading() { return this.f.uploading.cardFront || this.f.uploading.cardBack; },
    acctText() {
      const n = this.drawer?.bank?.accountNo || '';
      if (!n) return '—';
      return this.drawer.showAcct ? n.replace(/(\d{4})(?=\d)/g, '$1 ') : `···· ${n.slice(-4)}`;
    },
    metaText() {
      const a = this.drawer?.agent; if (!a) return '';
      const d = t => (t?.toDate ? t.toDate().toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
      const added = `Added${a.createdByName ? ' by ' + a.createdByName : ''}${d(a.createdAt) ? ', ' + d(a.createdAt) : ''}`;
      const edited = a.updatedAt && d(a.updatedAt) !== d(a.createdAt) ? ` · Last edited${a.updatedByName ? ' by ' + a.updatedByName : ''}, ${d(a.updatedAt)}` : '';
      return added + edited;
    }
  },
  async mounted() {
    if (this.canEdit) ensureFolders();
    await this.go();
  },
  unmounted() { this.dropPreviews(); },
  methods: {
    agencyLabel, agencyColor,
    async go() {
      this.loading = true; this.error = '';
      try { this.agents = await loadAgents(); }
      catch (e) { this.error = friendlyError(e, 'load the agents'); }
      this.loading = false;
    },
    isPdf(c) { return (c?.mimeType || '').includes('pdf') || /\.pdf$/i.test(c?.name || ''); },

    // ---- Profile ----
    async openView(a) {
      this.dropPreviews();
      this.drawer = { mode: 'view', agent: a, bank: null, bankLoading: this.canEdit, bankError: '', showAcct: false, previews: {}, previewError: {} };
      const d = this.drawer;
      if (this.canEdit) {
        try { d.bank = await loadBank(a.id); }
        catch (e) { d.bankError = friendlyError(e, 'load the bank details'); }
        d.bankLoading = false;
      }
      // Small previews of image cards (PDFs open in the viewer)
      for (const s of SIDES) {
        const c = a[s.key];
        if (!c || this.isPdf(c)) continue;
        fileBlob('agents', c.fileId).then(u => { if (this.drawer === d) d.previews[s.key] = u; else URL.revokeObjectURL(u); })
          .catch(() => { d.previewError[s.key] = true; });
      }
    },
    dropPreviews() { Object.values(this.drawer?.previews || {}).forEach(u => URL.revokeObjectURL(u)); },
    viewCard(c) { this.$refs.viewer.open({ name: c.name, id: c.fileId, kind: 'agents' }); },
    async closeDrawer() {
      if (this.drawer?.mode === 'edit' && this.dirty() && !await askConfirm({ title: 'Close without saving?', message: 'Your changes to this agent will be lost.', confirmText: 'Close', danger: true })) return;
      this.dropPreviews();
      this.drawer = null;
    },

    // ---- Add / edit ----
    async openForm(a) {
      this.dropPreviews();
      this.f = blankForm();
      const f = this.f;   // the reactive copy, so the form updates as the bank details arrive
      if (a) Object.assign(f, { id: a.id, name: a.name || '', company: a.company || '', agency: a.agency || 'property', agencyOther: a.agencyOther || '', mobile: a.mobile || '',
        email: a.email || '', address: a.address || '', bankName: a.bankName || '', cardFront: a.cardFront || null, cardBack: a.cardBack || null, active: a.active !== false, bankLoading: true });
      else f.id = newAgentId();
      this.drawer = { mode: 'edit', agent: a };
      if (a) {
        try { const b = await loadBank(a.id); if (b) { f.holder = b.holder || ''; f.accountNo = b.accountNo || ''; } }
        catch (e) { f.error = friendlyError(e, 'load the saved bank details') + ' Close and try again before saving, so they are not lost.'; f.bankLoading = false; this.drawer.bankFailed = true; return; }
        f.bankLoading = false;
      }
      this.start = this.snap();
    },
    snap() { const f = this.f; return JSON.stringify([f.name, f.company, f.agency, f.agencyOther, f.mobile, f.email, f.address, f.bankName, f.holder, f.accountNo, f.cardFront?.fileId, f.cardBack?.fileId]); },
    dirty() { return this.drawer?.mode === 'edit' && this.snap() !== this.start; },
    async upload(key, e) {
      const file = e.target.files[0]; e.target.value = '';
      if (!file) return;
      const f = this.f;
      if (!/^image\//.test(file.type) && file.type !== 'application/pdf') { f.error = 'Business cards must be an image (JPG, PNG) or a PDF.'; return; }
      f.error = ''; f.uploading[key] = true; f.pct[key] = 0;
      try {
        const [got] = await uploadForLink('agents', [file], p => { f.pct[key] = Math.round(p * 100); }, f.id, f.name.trim() || 'New agent');
        if (!got?.id) throw new Error('Drive did not return the file.');
        f[key] = { name: got.name, fileId: got.id, mimeType: got.mimeType || file.type };
      } catch (err) { f.error = `Could not upload the business card: ${err.message}`; }
      f.uploading[key] = false;
    },
    validate() {
      const f = this.f;
      if (!f.name.trim()) return 'Enter the agent\'s name.';
      if (f.agency === 'other' && !f.agencyOther.trim()) return 'Agency is Others: say what kind (e.g. Relocation company).';
      if (!f.mobile.trim()) return 'Enter a mobile number.';
      if (f.email.trim() && !EMAIL.test(f.email.trim())) return 'The email address doesn\'t look right.';
      if (f.accountNo && /[^\d\s-]/.test(f.accountNo)) return 'The bank account number may have digits only.';
      if (f.accountNo.replace(/\D/g, '').length > 20) return 'The bank account number is too long (20 digits at most).';
      return '';
    },
    async save() {
      if (this.drawer?.bankFailed) return;
      this.f.error = this.validate();
      if (this.f.error) return;
      this.busy = true; this.okMsg = '';
      try {
        const existing = this.drawer.agent;
        const saved = await saveAgent(me, this.f.id, this.f, existing);
        await this.go();
        this.start = this.snap();
        this.okMsg = existing ? `${saved.name} saved.` : `${saved.name} added to the Agent Database.`;
        this.openView(this.agents.find(x => x.id === saved.id) || saved);
      } catch (e) {
        this.f.error = e.code === 'permission-denied' ? 'Saving was refused. You need Agent Database Full access, and Firestore rules Draft 0.94 must be published.' : friendlyError(e, 'save the agent');
      }
      this.busy = false;
    },
    async remove(a) {
      if (!await askConfirm({ title: `Delete ${a.name}?`, message: 'The agent and their bank details are removed from the PMS. Their business card files stay in Google Drive. An audit log line is kept.', confirmText: 'Delete agent', danger: true })) return;
      this.busy = true;
      try {
        await deleteAgent(me, a);
        this.dropPreviews(); this.drawer = null;
        this.okMsg = `${a.name} deleted.`;
        await this.go();
      } catch (e) { this.error = friendlyError(e, 'delete the agent'); }
      this.busy = false;
    }
  }
};
</script>

<style scoped>
.form-sec { font-size: 12px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--muted); margin: 18px 0 10px; }
.drawer-body > .form-sec:first-child, .notice + .form-sec { margin-top: 0; }
.head-tools { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.toolbar .input { max-width: 320px; }
.small { font-size: 12px; }
.strong { font-weight: 600; }
.nowrap { white-space: nowrap; }
.mono { font-variant-numeric: tabular-nums; letter-spacing: .03em; }
.pre { white-space: pre-line; }
.grow { flex: 1; }
.ag-tags { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 4px; }
.ag-sec-row { display: flex; align-items: center; justify-content: space-between; }
.ag-sec-row .link { text-transform: none; letter-spacing: 0; font-weight: 500; font-size: 12px; }
.ag-sec-note { text-transform: none; letter-spacing: 0; font-weight: 400; }
.ag-fs { border: 0; padding: 0; margin: 0 0 16px; }
.ag-fs legend { font-weight: 500; font-size: 13px; color: var(--text-2); padding: 0; margin-bottom: 6px; }
.ag-agency { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.ag-agency label { display: flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 12px; border: 1px solid var(--border); border-radius: 8px; cursor: pointer; font-size: 13px; color: var(--text-2); }
.ag-agency label.on { border-color: var(--accent); background: var(--accent-soft); color: var(--text); font-weight: 600; }
.ag-agency input { accent-color: var(--accent); margin: 0; }
.ag-bank { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0 14px; }
.ag-cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.ag-up .filedrop { min-height: 96px; display: flex; flex-direction: column; justify-content: center; gap: 4px; }
.ag-up .filedrop.off { pointer-events: none; opacity: .8; }
.ag-up .file-line { display: flex; justify-content: space-between; gap: 8px; align-items: center; border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; font-size: 13px; }
.ag-file { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.ag-card { position: relative; aspect-ratio: 1.75 / 1; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; background: var(--hover); padding: 0; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.ag-card img { width: 100%; height: 100%; object-fit: contain; }
.ag-card-ph { color: var(--muted); font-size: 12px; }
.ag-card-label { position: absolute; left: 8px; bottom: 8px; background: rgba(0,0,0,.6); color: #fff; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 999px; }
.ag-meta { margin-top: 16px; }
/* Profile: details left, business card right */
.ag-view { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 32px; align-items: start; }
.ag-view .kv span:last-child { overflow-wrap: anywhere; }
.ag-view-card { position: sticky; top: 0; }
.ag-card-stack { display: grid; gap: 12px; }
.ag-card-stack .ag-card { width: 100%; }
.ag-card-none { border: 1.5px dashed var(--border); border-radius: 10px; aspect-ratio: 1.75 / 1; display: flex; align-items: center; justify-content: center; color: var(--muted); font-size: 13px; }
@media (max-width: 860px) { .ag-view { grid-template-columns: minmax(0, 1fr); gap: 8px; } .ag-view-card { position: static; } }
@media (max-width: 720px) { .ag-agency, .ag-bank, .ag-cards { grid-template-columns: minmax(0, 1fr); } }
</style>