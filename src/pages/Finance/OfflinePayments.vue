<template>
  <main class="content">
    <div class="page-head">
      <div>
        <h1>Offline payments</h1>
        <div class="sub">Cash and bank transfers received outside the booking sites. Check each one against the bank and mark it Checked, Pending or Unknown.</div>
      </div>
      <button type="button" class="btn btn-primary" @click="openForm">+ New offline payment</button>
    </div>

    <div class="notice error" v-show="error">{{ error }}</div>
    <div class="notice ok" v-show="done">{{ done }}</div>

    <section class="kpis">
      <div class="card kpi"><div class="label">Total submissions</div><div class="value">{{ rows.length }}</div></div>
      <div class="card kpi"><div class="label">Checked</div><div class="value">{{ count('Checked') }}</div></div>
      <div class="card kpi"><div class="label">Pending</div><div class="value">{{ count('Pending') }}</div></div>
      <div class="card kpi"><div class="label">Unknown</div><div class="value">{{ count('Unknown') }}</div></div>
    </section>

    <section class="card">
      <div class="filters">
        <div class="field grow"><label>Search</label><input class="input" v-model="q" placeholder="Search by name, property, ref…"></div>
        <div class="field"><label>From date</label><input class="input" type="date" v-model="from"></div>
        <div class="field"><label>To date</label><input class="input" type="date" v-model="to"></div>
        <div class="field"><label>Status</label>
          <OptionPicker v-model="status" :options="STATUS_OPTS" label="Status" /></div>
      </div>
      <p class="help">{{ loading ? 'Loading…' : `${shown.length} record${shown.length === 1 ? '' : 's'}` }}</p>
      <Paged :items="shown" v-slot="{ pageRows }">
        <div class="table-wrap" :style="pageRows.length ? null : { minHeight: '0' }"><table class="table op-table">
          <thead><tr><th>Date</th><th>Property</th><th>Unit</th><th>Guest</th><th class="num">Amount (RM)</th><th>Status</th><th></th></tr></thead>
          <tbody>
            <tr v-for="r in pageRows" :key="r.id">
              <td>{{ r.date }}</td><td>{{ r.propertyName || '—' }}</td><td>{{ r.unitCode || '—' }}</td><td>{{ r.guest }}</td>
              <td class="num">{{ Number(r.amount || 0).toFixed(2) }}</td>
              <td><span class="tag" :class="'st-' + (r.status || '').toLowerCase()">{{ r.status }}</span></td>
              <td class="num"><button type="button" class="btn" @click="view = r; editing = false">View</button></td>
            </tr>
            <tr v-if="!pageRows.length"><td colspan="7" class="muted empty">{{ loading ? 'Loading…' : 'No offline payments found.' }}</td></tr>
          </tbody>
        </table></div>
      </Paged>
    </section>

    <template v-if="view">
      <div class="modal-back" @click.self="view = null" v-esc="() => { view = null }">
        <div class="modal view-modal" role="dialog" aria-label="Offline payment details">
          <div class="v-head">
            <div><div class="v-title">Offline payment</div><div class="v-sub">{{ view.date }} · submitted by {{ view.submittedByName || '—' }}</div></div>
            <span class="tag" :class="'st-' + (view.status || '').toLowerCase()">{{ view.status }}</span>
          </div>
          <div class="v-amount"><span>Amount</span><b>RM {{ Number(view.amount || 0).toFixed(2) }}</b></div>
          <div class="v-grid" v-if="!editing">
            <div class="v-item"><span>Property</span><b>{{ view.propertyName || '—' }}</b></div>
            <div class="v-item"><span>Unit</span><b>{{ view.unitCode || '—' }}</b></div>
            <div class="v-item"><span>Guest / tenant</span><b>{{ view.guest }}</b></div>
            <div class="v-item"><span>Purpose</span><b>{{ view.purpose }}</b></div>
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
            <div class="field"><label>Purpose</label><input class="input" v-model="ed.purpose"></div>
            <div class="field"><label>Bank reference</label><input class="input" v-model="ed.bankRef"></div>
            <div class="field"><label>Documents link</label><input class="input" v-model="ed.docsLink" placeholder="https://drive.google.com/…"></div>
          </div>
          <DriveFiles class="v-files" kind="offline-payments" :record-id="view.id" :key="view.id" @folder="l => saveFolder(view, l)" />
          <div class="v-edit">
            <div class="field"><label>Status</label>
              <OptionPicker class="fld-pick" :model-value="view.status" :options="STATUSES.map(s => ({ value: s, label: s }))" label="Status" @update:modelValue="v => setStatus(view, v)" /></div>
            <div class="field"><label>Remarks</label><input class="input" :value="view.remarks" placeholder="Add remarks" @change="e => setRemarks(view, e.target.value)"></div>
          </div>
          <div class="modal-foot" v-if="!editing">
            <button type="button" class="btn" @click="view = null">Close</button>
            <button type="button" class="btn btn-primary" @click="startEdit">Edit details</button>
          </div>
          <div class="modal-foot" v-else>
            <button type="button" class="btn" @click="editing = false">Discard changes</button>
            <button type="button" class="btn btn-primary" :disabled="busy" @click="saveEdit">{{ busy ? 'Saving…' : 'Save changes' }}</button>
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
            <div class="field"><label>Purpose</label><input class="input" v-model="f.purpose" placeholder="e.g. Rental, security deposit"></div>
            <div class="field"><label>Bank reference</label><input class="input" v-model="f.bankRef"></div>
            <div class="field wide"><label>Receipts / documents <span class="muted">(optional)</span></label><DriveFiles kind="offline-payments" :record-id="newId" :list-on-load="false" @folder="l => f.docsLink = l" /></div>
          <div class="field"><label>Status <span class="muted">(Unknown = no receipt)</span></label>
            <OptionPicker class="fld-pick" v-model="f.status" :options="STATUSES.map(s => ({ value: s, label: s }))" label="Status" /></div>
          <div class="field"><label>Remarks</label><input class="input" v-model="f.remarks"></div>
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
import { collection, doc, getDocs, limit, orderBy, query, updateDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase.js';
import { useSession } from '@/stores/session.js';
import OptionPicker from '@/components/OptionPicker.vue';
import Paged from '@/components/Paged.vue';
import DriveFiles from '@/components/DriveFiles.vue';
import { loadProperties, loadUnits, audit, friendlyError } from '@/lib/finance-data.js';

const STATUSES = ['Checked', 'Pending', 'Unknown'];
const STATUS_OPTS = [{ value: '', label: 'All' }, ...STATUSES.map(s => ({ value: s, label: s }))];
const today = () => new Date().toISOString().slice(0, 10);
const blank = () => ({ date: today(), amount: '', propertyId: '', unitCode: '', guest: '', purpose: '', bankRef: '', docsLink: '', status: 'Pending', remarks: '' });

export default {
  components: { OptionPicker, Paged, DriveFiles },
  data() { return { STATUSES, STATUS_OPTS, rows: [], loading: true, q: '', from: '', to: '', status: '', open: false, newId: '', view: null, editing: false, ed: {}, f: blank(), properties: [], units: [], busy: false, error: '', formError: '', done: '' }; },
  computed: {
    shown() {
      const q = this.q.trim().toLowerCase();
      return this.rows.filter(r => (!this.status || r.status === this.status) && (!this.from || r.date >= this.from) && (!this.to || r.date <= this.to)
        && (!q || [r.guest, r.propertyName, r.unitCode, r.bankRef, r.submittedByName, r.purpose].some(v => String(v || '').toLowerCase().includes(q))));
    }
  },
  async mounted() { await this.load(); },
  methods: {
    count(s) { return this.rows.filter(r => r.status === s).length; },
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
        this.open = false; this.done = 'Offline payment submitted as ' + f.status + '.'; await this.load();
      } catch (e) { this.formError = e.code === 'permission-denied' ? 'Firestore refused this. The latest security rules (offlinePayments) need to be published first.' : friendlyError(e, 'save the payment'); }
      this.busy = false;
    },
    // The Drive folder link is kept on the record so the table's Documents shows it
    saveFolder(r, link) { if (link && link !== r.docsLink) this.patch(r, { docsLink: link }, 'docsLink', r.docsLink || ''); },
    async startEdit() {
      const r = this.view;
      this.ed = { date: r.date, amount: r.amount, propertyId: r.propertyId || '', unitCode: r.unitCode || '', guest: r.guest, purpose: r.purpose, bankRef: r.bankRef || '', docsLink: r.docsLink || '' };
      this.formError = ''; this.editing = true;
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
        : (String(e.docsLink).trim() && !/^https?:\/\//i.test(String(e.docsLink).trim())) ? 'The documents link should start with https://' : '';
      if (this.formError) return;
      const prop = this.properties.find(p => p.id === e.propertyId);
      const data = { date: e.date, amount: Math.round(+e.amount * 100) / 100, propertyId: e.propertyId, propertyName: prop?.name || r.propertyName || '', unitCode: e.unitCode,
        guest: String(e.guest).trim(), purpose: String(e.purpose).trim(), bankRef: String(e.bankRef).trim(), docsLink: String(e.docsLink).trim() };
      const changes = Object.keys(data).filter(k => (r[k] ?? '') !== data[k]).map(k => ({ field: k, old: r[k] ?? '', new: data[k] }));
      if (!changes.length) { this.editing = false; return; }
      this.busy = true;
      try {
        const me = useSession(), batch = writeBatch(db);
        batch.update(doc(db, 'offlinePayments', r.id), data);
        audit(batch, me, { action: 'offlinePayment.update', entity: `offlinePayments/${r.id}`, propertyId: data.propertyId || null, changes });
        await batch.commit(); Object.assign(r, data); this.editing = false;
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
        await batch.commit(); Object.assign(r, data);
      } catch (e) { this.error = friendlyError(e, 'save the change'); }
    },
    setStatus(r, v) {
      if (v === r.status) return;
      const me = useSession();
      this.patch(r, { status: v, verifiedByName: v === 'Pending' ? '' : me.name, verifiedDate: v === 'Pending' ? '' : today() }, 'status', r.status);
    },
    setRemarks(r, v) { if (v !== (r.remarks || '')) this.patch(r, { remarks: v.trim() }, 'remarks', r.remarks || ''); }
  }
};
</script>

<style scoped>
.page-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
.filters { display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-end; margin-bottom: 8px; }
.filters .grow { flex: 1; min-width: 220px; }
.field label { display: block; font-size: 13px; color: var(--text-2); margin-bottom: 6px; }
.op-table td, .op-table th { white-space: nowrap; }
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
.modal { padding: 18px 24px; max-height: calc(100dvh - 24px); }
.modal .field { margin-bottom: 0; }
.modal .field label { margin-bottom: 4px; }
.modal .input { min-height: 44px; font-size: 15px; }
.modal .field label { font-size: 14px; }
.grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 20px; margin-bottom: 12px; }
@media (max-width: 640px) { .grid { grid-template-columns: minmax(0, 1fr); } }
</style>
