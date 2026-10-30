<template>
  <main class="content">
    <div class="page-head">
      <div>
        <h1>Offline payments</h1>
        <div class="sub">Cash and bank transfers received outside the booking sites. Check each one against the bank and mark it Checked, Pending or Unknown. Unknown (no receipt) can be filled in by Operations, which makes it Edited.</div>
      </div>
      <div class="head-actions">
        <button type="button" class="btn" v-if="canEdit" @click="openReport">Report</button>
        <button type="button" class="btn btn-primary" v-if="canEdit" @click="openForm">+ New offline payment</button>
      </div>
    </div>

    <div class="notice error" v-show="error">{{ error }}</div>
    <div class="notice ok" v-show="done">{{ done }}</div>

    <section class="kpis">
      <div class="card kpi"><div class="label">Total submissions</div><div class="value">{{ rows.length }}</div></div>
      <div class="card kpi"><div class="label">Checked</div><div class="value">{{ count('Checked') }}</div></div>
      <div class="card kpi"><div class="label">Pending</div><div class="value">{{ count('Pending') }}</div></div>
      <div class="card kpi"><div class="label">Unknown</div><div class="value" :class="{ alert: count('Unknown') }">{{ count('Unknown') }}</div></div>
      <div class="card kpi"><div class="label">Edited</div><div class="value">{{ count('Edited') }}</div></div>
    </section>

    <section class="card">
      <div class="filters">
        <div class="field grow"><label>Search</label><input class="input" v-model="q" placeholder="Search by name, property, ref…"></div>
        <div class="field"><label>Month</label><MonthPicker v-model="month" all-label="All months" @change="pickMonth" /></div>
        <div class="field"><label>From date</label><input class="input" type="date" v-model="from" @input="month = ''"></div>
        <div class="field"><label>To date</label><input class="input" type="date" v-model="to" @input="month = ''"></div>
        <div class="field"><label>Status</label>
          <OptionPicker v-model="status" :options="STATUS_OPTS" label="Status" /></div>
      </div>
      <p class="help">{{ loading ? 'Loading…' : `${shown.length} record${shown.length === 1 ? '' : 's'}` }}</p>
      <Paged :items="shown" :size="15" v-slot="{ pageRows }">
        <div class="table-wrap" :style="pageRows.length ? null : { minHeight: '0' }"><table class="table op-table">
          <thead><tr><th>Date</th><th>Booking</th><th>Property</th><th>Unit</th><th>Guest</th><th>Purpose</th><th class="num">Amount (RM)</th><th>Status</th><th>Submitted by</th><th></th></tr></thead>
          <tbody>
            <tr v-for="r in pageRows" :key="r.id">
              <td>{{ r.date }}</td><td class="strong">{{ r.bookingNo || '—' }}</td><td>{{ r.propertyName || '—' }}</td><td>{{ r.unitCode || '—' }}</td><td>{{ r.guest }}</td><td class="purpose-cell"><span class="clamp" :title="r.purpose">{{ r.purpose || '—' }}</span></td>
              <td class="num">{{ Number(r.amount || 0).toFixed(2) }}</td>
              <td><span class="tag" :class="'st-' + (r.status || '').toLowerCase()">{{ r.status }}</span><div class="who" v-if="r.editedByName">{{ `by ${r.editedByName}` }}</div></td>
              <td>{{ r.submittedByName || '—' }}</td>
              <td class="num"><button type="button" class="btn" @click="view = r; editing = false">View</button></td>
            </tr>
            <tr v-if="!pageRows.length"><td colspan="10" class="muted empty">{{ loading ? 'Loading…' : 'No offline payments found.' }}</td></tr>
          </tbody>
        </table></div>
      </Paged>
    </section>

    <template v-if="view">
      <div class="modal-back" @click.self="view = null" v-esc="() => { view = null }">
        <div class="modal view-modal" role="dialog" aria-label="Offline payment details">
          <div class="v-head">
            <div><div class="v-title">Offline payment</div><div class="v-sub">{{ view.date }} · submitted by {{ view.submittedByName || '—' }}<template v-if="view.editedByName">{{ ` · edited by ${view.editedByName}${view.editedAt?.toDate ? ' on ' + view.editedAt.toDate().toLocaleDateString('en-GB') : ''}` }}</template></div></div>
            <span class="tag" :class="'st-' + (view.status || '').toLowerCase()">{{ view.status }}</span>
          </div>
          <div class="notice" v-if="opsEdit(view) && !editing">This payment has no receipt. Add the missing details or the receipt, then save. It becomes Edited and Finance is told.</div>
          <div class="v-amount"><span>Amount</span><b>RM {{ Number(view.amount || 0).toFixed(2) }}</b></div>
          <div class="v-grid" v-if="!editing">
            <div class="v-item" v-if="view.bookingNo"><span>Booking</span><b>{{ view.bookingNo }}</b></div>
            <div class="v-item" v-if="view.mode"><span>Mode of payment</span><b>{{ view.mode }}</b></div>
            <div class="v-item"><span>Property</span><b>{{ view.propertyName || '—' }}</b></div>
            <div class="v-item"><span>Unit</span><b>{{ view.unitCode || '—' }}</b></div>
            <div class="v-item"><span>Guest / tenant</span><b>{{ view.guest }}</b></div>
            <div class="v-item v-purpose"><span>Purpose</span><b>{{ view.purpose }}</b></div>
            <div class="v-item"><span>Bank reference</span><b>{{ view.bankRef || '—' }}</b></div>
            <div class="v-item"><span>Documents</span><b><a v-if="view.docsLink" :href="view.docsLink" target="_blank" rel="noopener">Open link</a><template v-else>None</template></b></div>
            <div class="v-item"><span>Verified by</span><b>{{ view.verifiedByName || '—' }}</b></div>
            <div class="v-item"><span>Verified date</span><b>{{ view.verifiedDate || '—' }}</b></div>
          </div>
          <div class="v-edit-grid" v-else>
            <div class="notice error" v-show="formError" style="grid-column: 1 / -1">{{ formError }}</div>
            <div class="field"><label>Payment date</label><input class="input" type="date" v-model="ed.date"></div>
            <div class="field"><label>Amount (RM)</label><input class="input" type="number" min="0" step="0.01" v-model="ed.amount"></div>
            <div class="field"><label>Property</label>
              <OptionPicker class="fld-pick" v-model="ed.propertyId" :options="[{ value: '', label: 'Choose property' }, ...properties.map(x => ({ value: x.id, label: x.name }))]" label="Property" searchable @change="editProperty" /></div>
            <div class="field"><label>Unit</label>
              <OptionPicker class="fld-pick" v-model="ed.unitCode" :disabled="!ed.propertyId" :options="[{ value: '', label: 'Choose unit' }, ...units.map(x => ({ value: x.unitCode, label: x.unitCode }))]" label="Unit" searchable /></div>
            <div class="field"><label>Guest / tenant name</label><input class="input" v-model="ed.guest"></div>
            <div class="field wide"><label>Purpose</label><textarea class="input purpose-box" rows="3" maxlength="1000" v-model="ed.purpose"></textarea></div>
            <div class="field"><label>Bank reference</label><input class="input" v-model="ed.bankRef"></div>
          </div>
          <DriveFiles class="v-files" kind="offline-payments" :record-id="view.id" :label="nameOf(view)" :readonly="!(canEdit || opsEdit(view))" :key="view.id" @folder="l => saveFolder(view, l)" />
          <div class="v-item" v-if="!canEdit" style="margin-top:10px"><span>Remarks</span><b>{{ view.remarks || '—' }}</b></div>
          <div class="v-edit" v-if="canEdit">
            <div class="field"><label>Status</label>
              <OptionPicker class="fld-pick" :model-value="view.status" :options="statusOptions(view.status)" label="Status" @update:modelValue="v => setStatus(view, v)" /></div>
            <div class="field"><label>Remarks</label><input class="input" :value="view.remarks" placeholder="Add remarks" @change="e => setRemarks(view, e.target.value)"></div>
          </div>
          <div class="modal-foot" v-if="!editing">
            <button type="button" class="btn" @click="view = null">Close</button>
            <button type="button" class="btn btn-primary" v-if="canEdit || opsEdit(view)" @click="startEdit">{{ opsEdit(view) ? 'Add details' : 'Edit details' }}</button>
          </div>
          <div class="modal-foot" v-else>
            <button type="button" class="btn" @click="editing = false">Discard changes</button>
            <button type="button" class="btn btn-primary" :disabled="busy" @click="saveEdit">{{ busy ? 'Saving…' : 'Save changes' }}</button>
          </div>
        </div>
      </div>
    </template>

    <template v-if="rep">
      <div class="modal-back" @click.self="rep = null" v-esc="() => { rep = null }">
        <div class="modal rep-modal" role="dialog" aria-label="Offline payments report">
          <div class="card-head"><h2 style="margin:0">Offline payments report</h2></div>
          <p class="help">A summary by property and every payment in the period, as Excel or CSV.</p>
          <div class="notice error" v-show="rep.error">{{ rep.error }}</div>
          <div class="grid">
            <div class="field"><label>Report</label>
              <OptionPicker class="fld-pick" v-model="rep.type" :options="[{ value: 'monthly', label: 'Monthly' }, { value: 'yearly', label: 'Yearly' }, { value: 'custom', label: 'Custom dates' }]" label="Report type" /></div>
            <div class="field"><label>Property</label>
              <OptionPicker class="fld-pick" v-model="rep.propertyId" :options="[{ value: '', label: 'All properties' }, ...properties.map(x => ({ value: x.id, label: x.name }))]" label="Property" searchable /></div>
            <div class="field" v-if="rep.type === 'monthly'"><label>Month</label><MonthPicker v-model="rep.month" /></div>
            <div class="field" v-if="rep.type === 'yearly'"><label>Year</label>
              <OptionPicker class="fld-pick" v-model="rep.year" :options="yearOptions" label="Year" /></div>
            <template v-if="rep.type === 'custom'">
              <div class="field"><label>From date</label><input class="input" type="date" v-model="rep.from"></div>
              <div class="field"><label>To date</label><input class="input" type="date" v-model="rep.to"></div>
            </template>
          </div>
          <div class="modal-foot">
            <button type="button" class="btn" @click="rep = null">Close</button>
            <button type="button" class="btn" :disabled="rep.busy" @click="runReport('csv')">Download CSV</button>
            <button type="button" class="btn btn-primary" :disabled="rep.busy" @click="runReport('xlsx')">{{ rep.busy ? 'Preparing…' : 'Download Excel' }}</button>
          </div>
        </div>
      </div>
    </template>

    <template v-if="open">
      <div class="modal-back" @click.self="open = false" v-esc="() => { open = false }">
        <form class="modal" role="dialog" aria-label="New offline payment" @submit.prevent="submit" novalidate>
          <div class="card-head"><h2 style="margin:0">New offline payment</h2></div>
          <div class="notice error" v-show="formError">{{ formError }}</div>
          <div class="grid">
            <div class="field"><label>Payment date</label><input class="input" type="date" v-model="f.date"></div>
            <div class="field"><label>Amount (RM)</label><input class="input" type="number" min="0" step="0.01" v-model="f.amount" placeholder="0.00"></div>
            <div class="field"><label>Property</label>
              <OptionPicker class="fld-pick" v-model="f.propertyId" :options="[{ value: '', label: 'Choose property' }, ...properties.map(x => ({ value: x.id, label: x.name }))]" label="Property" searchable @change="loadUnitList" /></div>
            <div class="field"><label>Unit</label>
              <OptionPicker class="fld-pick" v-model="f.unitCode" :disabled="!f.propertyId" :options="[{ value: '', label: 'Choose unit' }, ...units.map(x => ({ value: x.unitCode, label: x.unitCode }))]" label="Unit" searchable /></div>
            <div class="field"><label>Guest / tenant name</label><input class="input" v-model="f.guest"></div>
            <div class="field wide"><label>Purpose</label><textarea class="input purpose-box" rows="3" maxlength="1000" v-model="f.purpose" placeholder="e.g. Rental, security deposit. Long notes are fine, e.g. Deposit = RM2000, Rental = RM2200, Total = RM4200; (-) Payroll = RM3050; Balance = RM950"></textarea></div>
            <div class="field"><label>Bank reference</label><input class="input" v-model="f.bankRef"></div>
            
          <div class="field"><label>Status <span class="muted">(Unknown = no receipt)</span></label>
            <OptionPicker class="fld-pick" v-model="f.status" :options="statusOptions('')" label="Status" /></div>
          <div class="field wide"><label>Remarks</label><input class="input" v-model="f.remarks"></div>
            <div class="field wide"><label>Receipts / documents <span class="muted">(optional)</span></label><DriveFiles kind="offline-payments" :record-id="newId" :label="nameOf(f)" :list-on-load="false" @folder="l => f.docsLink = l" /></div>
          </div>
          <div class="modal-foot">
            <button type="button" class="btn" @click="open = false">Cancel</button>
            <button type="submit" class="btn btn-primary" :disabled="busy">{{ busy ? 'Saving…' : 'Submit' }}</button>
          </div>
        </form>
      </div>
    </template>
  </main>
</template>

<script>
import { collection, doc, getDocs, limit, orderBy, query, where, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase.js';
import { useSession } from '@/stores/session.js';
import { can } from '@/lib/access.js';
import { toast } from '@/lib/toast.js';
import OptionPicker from '@/components/OptionPicker.vue';
import Paged from '@/components/Paged.vue';
import DriveFiles from '@/components/DriveFiles.vue';
import { loadProperties, loadUnits, audit, friendlyError, loadXlsxLib, download, toCSV } from '@/lib/finance-data.js';
import MonthPicker from '@/components/MonthPicker.vue';
import { notifyRole } from '@/services/notificationService.js';
import { monthOffset } from '@/lib/format.js';

const STATUSES = ['Checked', 'Pending', 'Unknown', 'Edited'];   // Edited is set by saving an Unknown payment, never picked
const STATUS_OPTS = [{ value: '', label: 'All' }, ...STATUSES.map(s => ({ value: s, label: s }))];
const today = () => new Date().toISOString().slice(0, 10);
const blank = () => ({ date: today(), amount: '', propertyId: '', unitCode: '', guest: '', purpose: '', bankRef: '', docsLink: '', status: 'Pending', remarks: '' });

export default {
  components: { OptionPicker, Paged, DriveFiles, MonthPicker },
  data() { return { STATUSES, STATUS_OPTS, rows: [], loading: true, q: '', from: '', to: '', month: '', rep: null, pendingLink: '', status: '', open: false, newId: '', view: null, editing: false, ed: {}, f: blank(), properties: [], units: [], busy: false, error: '', formError: '', done: '' }; },
  computed: {
    // View and Edit are separate ticks on Staff accounts: View reads the page, Edit also creates and changes payments
    canEdit() { return can(useSession(), 'offlinePayments.edit'); },
    yearOptions() { const y = new Date().getFullYear(); return Array.from({ length: 5 }, (_, i) => ({ value: String(y - i), label: String(y - i) })); },
    shown() {
      const q = this.q.trim().toLowerCase();
      return this.rows.filter(r => (!this.status || r.status === this.status) && (!this.from || r.date >= this.from) && (!this.to || r.date <= this.to)
        && (!q || [r.guest, r.propertyName, r.unitCode, r.bankRef, r.submittedByName, r.purpose, r.bookingNo].some(v => String(v || '').toLowerCase().includes(q))));
    }
  },
  async mounted() { await this.load(); },
  methods: {
    count(s) { return this.rows.filter(r => r.status === s).length; },
    // Pickers offer the three statuses people choose; Edited only shows when the payment already has it
    statusOptions(cur) { return [...STATUSES.slice(0, 3), ...(cur === 'Edited' ? ['Edited'] : [])].map(s => ({ value: s, label: s })); },
    // Operations can fill in a payment with no receipt (status Unknown)
    opsEdit(r) { return !this.canEdit && useSession().role === 'operations' && r?.status === 'Unknown'; },
    pickMonth() {
      if (!this.month) { this.from = ''; this.to = ''; return; }
      const [y, m] = this.month.split('-').map(Number);
      this.from = `${this.month}-01`; this.to = `${this.month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
    },
    async tellOperations(p) {
      try { await notifyRole({ recipientRole: 'operations', type: 'payment', refId: p.id, link: '/Finance/offline-payments', title: 'Offline payment with no receipt',
        message: `RM ${Number(p.amount || 0).toFixed(2)} from ${p.guest}${p.unitCode ? ' (' + p.unitCode + ')' : ''} on ${p.date} has no receipt. Please add the details.` }); } catch { /* the payment is saved either way */ }
    },
    async tellFinance(p, who) {
      try { await notifyRole({ recipientRole: 'finance', type: 'payment', refId: p.id, link: '/Finance/offline-payments', title: 'Offline payment edited',
        message: `${who} filled in the RM ${Number(p.amount || 0).toFixed(2)} payment from ${p.guest}${p.unitCode ? ' (' + p.unitCode + ')' : ''}. Please check it.` }); } catch { /* the edit is saved either way */ }
    },
    async load() {
      this.loading = true;
      try { this.rows = (await getDocs(query(collection(db, 'offlinePayments'), orderBy('createdAt', 'desc'), limit(500)))).docs.map(d => ({ id: d.id, ...d.data() })); }
      catch (e) { this.error = friendlyError(e, 'load the offline payments'); }
      this.loading = false;
    },
    async openForm() {
      this.f = blank(); this.newId = doc(collection(db, 'offlinePayments')).id; this.units = []; this.formError = ''; this.open = true;
      if (!this.properties.length) { try { this.properties = await loadProperties(); } catch { this.formError = 'Could not load the property list.'; } }
    },
    async loadUnitList() {
      this.f.unitCode = ''; this.units = [];
      if (!this.f.propertyId) return;
      try { this.units = await loadUnits(this.f.propertyId); } catch { this.formError = 'Could not load the units.'; }
    },
    async submit() {
      const f = this.f, me = useSession();
      this.formError = !f.date ? 'Choose the payment date.' : !(+f.amount > 0) ? 'Enter the amount.' : !f.propertyId ? 'Choose the property.' : !f.guest.trim() ? 'Enter the guest name.' : !f.purpose.trim() ? 'Enter the purpose.'
        : (f.docsLink.trim() && !/^https?:\/\//i.test(f.docsLink.trim())) ? 'The documents link should start with https://' : '';
      if (this.formError) return;
      this.busy = true;
      try {
        const prop = this.properties.find(p => p.id === f.propertyId), ref = doc(db, 'offlinePayments', this.newId), batch = writeBatch(db);
        batch.set(ref, { date: f.date, amount: Math.round(+f.amount * 100) / 100, propertyId: f.propertyId, propertyName: prop?.name || '', unitCode: f.unitCode,
          guest: f.guest.trim(), purpose: f.purpose.trim(), bankRef: f.bankRef.trim(), docsLink: f.docsLink.trim(), remarks: f.remarks.trim(),
          status: f.status, verifiedByName: f.status === 'Pending' ? '' : me.name, verifiedDate: f.status === 'Pending' ? '' : today(), createdAt: serverTimestamp(), createdBy: me.user.uid, submittedByName: me.name });
        audit(batch, me, { action: 'offlinePayment.create', entity: `offlinePayments/${ref.id}`, propertyId: f.propertyId, changes: [{ field: 'amount', old: null, new: +f.amount }] });
        await batch.commit();
        this.open = false; toast('Changes saved'); this.done = 'Offline payment submitted as ' + f.status + '.';
        if (f.status === 'Unknown') this.tellOperations({ id: ref.id, amount: +f.amount, guest: f.guest.trim(), unitCode: f.unitCode, date: f.date });
        await this.load();
      } catch (e) { this.formError = e.code === 'permission-denied' ? 'Firestore refused this. The latest security rules (offlinePayments) need to be published first.' : friendlyError(e, 'save the payment'); }
      this.busy = false;
    },
    // The Drive folder link is kept on the record so the table's Documents shows it
    nameOf(r) { return [r.date, r.unitCode, r.guest].filter(Boolean).join(' '); },
    saveFolder(r, link) {
      if (!link || link === r.docsLink) return;
      if (this.canEdit) this.patch(r, { docsLink: link }, 'docsLink', r.docsLink || '');
      else this.pendingLink = link;   // Operations: saved together with their edit
    },
    async startEdit() {
      const r = this.view;
      this.ed = { date: r.date, amount: r.amount, propertyId: r.propertyId || '', unitCode: r.unitCode || '', guest: r.guest, purpose: r.purpose, bankRef: r.bankRef || '' };
      this.formError = ''; this.editing = true; this.pendingLink = '';
      try {
        if (!this.properties.length) this.properties = await loadProperties();
        this.units = this.ed.propertyId ? await loadUnits(this.ed.propertyId) : [];
      } catch { this.formError = 'Could not load the property list.'; }
    },
    async editProperty() {
      this.ed.unitCode = ''; this.units = [];
      if (!this.ed.propertyId) return;
      try { this.units = await loadUnits(this.ed.propertyId); } catch { this.formError = 'Could not load the units.'; }
    },
    async saveEdit() {
      const e = this.ed, r = this.view;
      this.formError = !e.date ? 'Choose the payment date.' : !(+e.amount > 0) ? 'Enter the amount.' : !e.propertyId ? 'Choose the property.' : !String(e.guest).trim() ? 'Enter the guest name.' : !String(e.purpose).trim() ? 'Enter the purpose.'
        : '';
      if (this.formError) return;
      const prop = this.properties.find(p => p.id === e.propertyId);
      const data = { date: e.date, amount: Math.round(+e.amount * 100) / 100, propertyId: e.propertyId, propertyName: prop?.name || r.propertyName || '', unitCode: e.unitCode,
        guest: String(e.guest).trim(), purpose: String(e.purpose).trim(), bankRef: String(e.bankRef).trim() };
      const ops = this.opsEdit(r);
      if (ops && this.pendingLink) data.docsLink = this.pendingLink;
      const changes = Object.keys(data).filter(k => (r[k] ?? '') !== data[k]).map(k => ({ field: k, old: r[k] ?? '', new: data[k] }));
      if (!changes.length) { this.editing = false; return; }
      this.busy = true;
      try {
        const me = useSession(), batch = writeBatch(db);
        // Who edited and when is kept on the payment; an Operations edit of an Unknown payment turns it into Edited
        const meta = { editedByName: me.name, editedByUid: me.user.uid, editedAt: serverTimestamp(), ...(ops ? { status: 'Edited' } : {}) };
        batch.update(doc(db, 'offlinePayments', r.id), { ...data, ...meta });
        if (ops) changes.push({ field: 'status', old: 'Unknown', new: 'Edited' });
        audit(batch, me, { action: 'offlinePayment.update', entity: `offlinePayments/${r.id}`, propertyId: data.propertyId || null, changes });
        await batch.commit(); Object.assign(r, data, meta, { editedAt: null }); this.editing = false; toast('Changes saved');
        if (ops) this.tellFinance(r, me.name);
      } catch (err) { this.formError = friendlyError(err, 'save the changes'); }
      this.busy = false;
    },
    async patch(r, data, field, was) {
      this.error = ''; this.done = '';
      const me = useSession();
      try {
        const batch = writeBatch(db);
        batch.update(doc(db, 'offlinePayments', r.id), data);
        audit(batch, me, { action: 'offlinePayment.update', entity: `offlinePayments/${r.id}`, propertyId: r.propertyId || null, changes: [{ field, old: was, new: data[field] }] });
        await batch.commit(); Object.assign(r, data); toast('Changes saved');
      } catch (e) { this.error = friendlyError(e, 'save the change'); }
    },
    setStatus(r, v) {
      if (v === r.status) return;
      const me = useSession();
      this.patch(r, { status: v, verifiedByName: v === 'Pending' ? '' : me.name, verifiedDate: v === 'Pending' ? '' : today() }, 'status', r.status);
      if (v === 'Unknown') this.tellOperations(r);
    },
    // ---- report: monthly, yearly or custom dates; all properties or one ----
    async openReport() {
      const d = new Date();
      this.rep = { type: 'monthly', month: monthOffset(0), year: String(d.getFullYear()), from: '', to: '', propertyId: '', busy: false, error: '' };
      if (!this.properties.length) { try { this.properties = await loadProperties(); } catch { this.rep.error = 'Could not load the property list.'; } }
    },
    async runReport(kind) {
      const R = this.rep; R.error = '';
      let from, to, label;
      if (R.type === 'monthly') { const [y, m] = R.month.split('-').map(Number); from = `${R.month}-01`; to = `${R.month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`; label = R.month; }
      else if (R.type === 'yearly') { from = `${R.year}-01-01`; to = `${R.year}-12-31`; label = R.year; }
      else { from = R.from; to = R.to; label = `${from}_to_${to}`; if (!from || !to) { R.error = 'Choose both dates.'; return; } if (to < from) { R.error = 'The end date is before the start date.'; return; } }
      R.busy = true;
      try {
        const snap = await getDocs(query(collection(db, 'offlinePayments'), where('date', '>=', from), where('date', '<=', to), orderBy('date')));
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(r => !R.propertyId || r.propertyId === R.propertyId)
          .sort((a, b) => String(a.propertyName || '').localeCompare(String(b.propertyName || '')) || String(a.date).localeCompare(String(b.date)));
        if (!list.length) { R.error = 'No offline payments in that period.'; R.busy = false; return; }
        const propName = R.propertyId ? (this.properties.find(p => p.id === R.propertyId)?.name || 'Property') : 'All properties';
        const money = n => Math.round((Number(n) || 0) * 100) / 100;
        const group = (keyOf) => { const m = new Map(); for (const r of list) { const k = keyOf(r), g = m.get(k) || { n: 0, total: 0 }; g.n++; g.total += money(r.amount); STATUSES.forEach(s => { g[s] = (g[s] || 0) + (r.status === s ? money(r.amount) : 0); }); m.set(k, g); } return m; };
        const rowsOf = m => [...m.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]))).map(([k, g]) => [k, g.n, money(g.total), ...STATUSES.map(s => money(g[s]))]);
        const head = ['', 'Payments', 'Total (RM)', ...STATUSES.map(s => `${s} (RM)`)];
        const sum = (rows) => ['Total', rows.reduce((a, r) => a + r[1], 0), ...head.slice(2).map((_, i) => money(rows.reduce((a, r) => a + r[2 + i], 0)))];
        const byProp = rowsOf(group(r => r.propertyName || '—')), byMonth = rowsOf(group(r => String(r.date).slice(0, 7)));
        const payments = [['Date', 'Booking', 'Property', 'Unit', 'Guest', 'Purpose', 'Amount (RM)', 'Status', 'Bank reference', 'Submitted by', 'Verified by', 'Verified date', 'Edited by', 'Mode', 'Remarks', 'Documents'],
          ...list.map(r => [r.date, r.bookingNo || '', r.propertyName || '', r.unitCode || '', r.guest || '', r.purpose || '', money(r.amount), r.status || '', r.bankRef || '', r.submittedByName || '', r.verifiedByName || '', r.verifiedDate || '', r.editedByName || '', r.mode || '', r.remarks || '', r.docsLink || ''])];
        const title = [[`Offline payments · ${propName} · ${from} to ${to}`], []];
        const file = `Offline_payments_${propName.replace(/[^A-Za-z0-9]+/g, '_')}_${label}`;
        if (kind === 'csv') { download(`${file}.csv`, toCSV(payments), 'text/csv'); }
        else {
          const X = await loadXlsxLib(), wb = X.utils.book_new();
          const sheet = (rows, name, widths) => { const ws = X.utils.aoa_to_sheet(rows); ws['!cols'] = widths.map(w => ({ wch: w })); X.utils.book_append_sheet(wb, ws, name); };
          sheet([...title, ['By property', ...head.slice(1)], ...byProp, sum(byProp)], 'Summary', [34, 12, 14, 14, 14, 14, 14]);
          if (R.type !== 'monthly') sheet([...title, ['By month', ...head.slice(1)], ...byMonth, sum(byMonth)], 'By month', [14, 12, 14, 14, 14, 14, 14]);
          sheet(payments, 'Payments', [12, 12, 28, 14, 24, 40, 14, 12, 18, 18, 18, 14, 18, 24, 30]);
          const out = X.write(wb, { type: 'array', bookType: 'xlsx' });
          download(`${file}.xlsx`, new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
        }
        toast('Report downloaded');
      } catch (e) { R.error = friendlyError(e, 'make the report'); }
      R.busy = false;
    },
    setRemarks(r, v) { if (v !== (r.remarks || '')) this.patch(r, { remarks: v.trim() }, 'remarks', r.remarks || ''); }
  }
};
</script>

<style scoped>
.head-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.who { font-size: 11px; color: var(--muted); margin-top: 2px; }
.tag.st-edited { background: #E6EEFB; color: #2B5DB8; }
.rep-modal { max-width: 640px; }
.clamp { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; line-height: 1.4; }
.v-purpose { grid-column: 1 / -1; }
.v-purpose b { white-space: pre-wrap; overflow-wrap: anywhere; font-weight: 600; line-height: 1.5; }
.purpose-box { min-height: 84px !important; resize: vertical; line-height: 1.5; padding-top: 10px; }
.page-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
.filters { display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-end; margin-bottom: 8px; }
.filters .grow { flex: 1; min-width: 220px; }
.field label { display: block; font-size: 13px; color: var(--text-2); margin-bottom: 6px; }
.op-table td, .op-table th { white-space: nowrap; }
.op-table td.purpose-cell { white-space: normal; width: 30%; min-width: 180px; }
.op-table .num { text-align: right; }
.op-table .empty { text-align: center; padding: 28px 16px; }
.op-table td :deep(.op-btn) { min-width: 110px; }
.tag { display: inline-block; padding: 2px 10px; border-radius: 99px; font-size: 12px; font-weight: 500; background: var(--head); color: var(--muted); }
.tag.st-checked { background: #E3F4EA; color: #1E7A45; }
.tag.st-pending { background: #FDEFD9; color: #B26A00; }
.tag.st-unknown { background: #ECEEF2; color: #555B66; }
.v-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.v-title { font-size: 18px; font-weight: 600; }
.v-sub { font-size: 13px; color: var(--muted); margin-top: 2px; }
.v-amount { margin: 14px 0; padding: 14px 18px; border-radius: 12px; background: var(--accent-soft); display: flex; justify-content: space-between; align-items: baseline; }
.v-amount span { font-size: 13px; color: var(--muted); }
.v-amount b { font-size: 26px; }
.v-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 20px; }
.v-item { padding: 10px 0; border-bottom: 1px solid var(--line); display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.v-item span { font-size: 12px; color: var(--muted); }
.v-item b { font-size: 14px; font-weight: 600; overflow-wrap: anywhere; }
.wide { grid-column: 1 / -1; }
.v-files { margin-top: 14px; }
.v-edit-grid, .v-edit { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 20px; margin-top: 14px; }
@media (max-width: 640px) { .v-grid, .v-edit, .v-edit-grid { grid-template-columns: minmax(0, 1fr); } }
.fld-pick { display: block; width: 100%; }
.fld-pick :deep(.op-btn), .fld-pick :deep(.op-input) { width: 100%; min-height: 44px; font-size: 15px; }
.fld-pick :deep(.op-pop) { max-width: none; width: 100%; }
.table-wrap { min-height: 260px; }
.modal { max-width: 920px; width: min(920px, 100%); }
.modal { padding: 18px 24px 0; }
.modal .modal-foot { padding: 12px 0 18px; margin-top: 8px; }
.modal .field { margin-bottom: 0; }
.modal .field label { margin-bottom: 4px; }
.modal .input { min-height: 44px; font-size: 15px; }
.modal .field label { font-size: 14px; }
.grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 20px; margin-bottom: 12px; }
@media (max-width: 640px) { .grid { grid-template-columns: minmax(0, 1fr); } }
</style>
