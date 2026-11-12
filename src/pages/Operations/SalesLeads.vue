<template>
  <main class="content">
    <div class="loading-bar" v-show="loading || busy"></div>
    <div class="notice ok" v-show="okMsg">{{ okMsg }}</div>
    <div class="notice error" v-show="error">{{ error }}</div>

    <!-- List (Figma 254:6983) -->
    <template v-if="view === 'list'">
      <div>
        <div class="page-head">
          <div>
            <h1>Tenant leads</h1>
            <div class="sub">{{ canAssign ? 'Log offline inquiries and assign each one to an Operations member to follow up.' : 'Log offline inquiries. A Director assigns each one to an Operations member to follow up.' }}</div>
          </div>
        </div>
        <div class="pills-row" style="margin-bottom:16px">
        <OptionPicker v-model="filter" :options="FILTERS.map(f => ({ value: f.key, label: `${f.label} · ${count(f.key)}` }))" label="Status" />
        <button class="btn btn-primary" v-if="canLog" @click="go('new')">+ Log inquiry</button>
        </div>
        <section class="card">
          <Paged :items="shown()" v-slot="{ pageRows }">
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th>Inquiry</th><th>Name</th><th>Looking for</th><th>Source</th><th>Assigned to</th><th>Status</th><th>Updated</th><th></th></tr></thead>
              <tbody>
                <template v-for="ld in pageRows" :key="ld.id">
                  <tr>
                    <td>{{ ld.id }}</td>
                    <td>
                      <span v-if="canSeeContact(ld)">{{ ld.contactName || '—' }}</span>
                      <span v-else class="masked">Hidden</span>
                      <div class="ten-id" v-if="ld.tenantId">{{ ld.tenantId }}</div>
                    </td>
                    <td>{{ ld.lookingFor }}</td>
                    <td>{{ ld.source }}</td>
                    <td>
                      <template v-if="!ld.assignedTo && canAssign">
                        <select class="select assign-sel" aria-label="Assign to" @change="assign(ld, $event.target.value)" :disabled="busy">
                          <option value="">{{ staff.length ? 'Choose staff' : 'No Operations staff yet' }}</option>
                          <template v-for="s in staff" :key="s.uid"><option :value="s.uid">{{ s.name }}</option></template>
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
                <SkeletonRows v-if="loading && !shown().length" table :cols="8" />
                <tr v-show="!loading && !shown().length"><td colspan="8" class="muted">No inquiries here.</td></tr>
              </tbody>
            </table>
          </div>
          </Paged>
        </section>
        <p class="page-note">Names and contact details are shown only to the staff member who logged the inquiry, the assigned staff member, Accounting and the Directors.</p>
      </div>
    </template>

    <!-- Log inquiry (Figma 254:7235) -->
    <template v-if="view === 'new'">
      <div>
        <button class="back" @click="go('list')">← Back to Tenant leads</button>
        <div class="page-head">
          <div>
            <h1>Log inquiry</h1>
            <div class="sub">{{ canAssign ? 'Record an offline inquiry and assign it to an Operations member to follow up.' : 'Record an offline inquiry. A Director assigns it to an Operations member.' }}</div>
          </div>
          <div class="head-tools">
            <button class="btn info-btn" type="button" @click="nextOpen = true" aria-label="What happens next" title="What happens next">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
            </button>
            <button class="btn" @click="go('list')">Cancel</button>
            <button class="btn btn-primary" @click="saveNew()" :disabled="busy">{{ canAssign ? 'Save and assign' : 'Save' }}</button>
          </div>
        </div>
        <div class="notice error" v-show="formError">{{ formError }}</div>
        <div>
          <div class="form-card">
            <section class="card">
              <h2>Inquiry</h2>
              <div class="grid-fields">
                <FormField id="lLooking" label="Looking for" req v-model="form.lookingFor" placeholder="e.g. Monthly rental, 2 bedrooms, Ampang" />
                <div class="field"><label for="lState">State</label>
                  <OptionPicker class="fld-pick" v-model="form.state" :options="[{ value: '', label: 'Any state (optional)' }, ...stateList.map(x => ({ value: x, label: x }))]" label="State" /></div>
                <div class="field"><label for="lSource">Source</label>
                  <OptionPicker class="fld-pick" v-model="form.source" :options="SOURCES.map(x => ({ value: x, label: x }))" label="Source" /></div>
                <FormField id="lBudget" label="Budget" v-model="form.budget" placeholder="e.g. RM 2,200 a month" />
                <FormField id="lView" label="Preferred viewing" type="date" v-model="form.viewing" />
              </div>
            </section>
            <section class="card">
              <h2>Customer</h2>
              <div class="grid-fields">
                <FormField id="lName" label="Name" req v-model="form.contactName" placeholder="e.g. Prospect A" />
                <FormField id="lPhone" label="Phone" req v-model="form.phone" inputmode="tel" placeholder="e.g. 012-345 6789" />
                <FormField id="lEmail" label="Email" type="email" v-model="form.email" placeholder="e.g. name@example.com" />
              </div>
              <p class="help" v-if="known">{{ `This phone number belongs to existing tenant ${known.id}. The inquiry will be linked to them.` }}</p>
            </section>
            <section class="card" v-if="canAssign">
              <h2>Assign to</h2>
              <div class="field" style="max-width:340px;margin:0"><label for="lAssign">Operations member</label>
                <OptionPicker class="fld-pick" v-model="form.assignedTo" :options="[{ value: '', label: 'Assign later' }, ...staff.map(x => ({ value: x.uid, label: x.name }))]" label="Operations member" />
                <span class="help" v-show="!staff.length">No Operations staff yet. Save it unassigned and assign it later.</span></div>
            </section>
            <section class="card">
              <h2>Status</h2>
              <div class="status-opts">
                <template v-for="k in PICKABLE" :key="k">
                  <button type="button" class="status-opt" :class="{ on: form.status === k }" @click="form.status = form.status === k ? 'new' : k">{{ STATUS[k][0] }}</button>
                </template>
              </div>
            </section>
            <section class="card">
              <h2>Note</h2>
              <textarea class="input" style="height:80px" v-model="form.note" placeholder="e.g. Walked in, wants to view this weekend" aria-label="Note"></textarea>
            </section>
          </div>
        </div>
      </div>
    <div class="modal-back" v-if="nextOpen" @click.self="nextOpen = false" v-esc="() => { nextOpen = false }">
      <div class="modal" role="dialog" aria-label="What happens next" style="max-width:520px;width:calc(100% - 32px)">
        <h2>What happens next</h2>
        <div class="next-list">
          <p v-if="!canAssign">- A Director assigns it to an Operations member.</p>
          <p>- The assigned Operations member sees the inquiry in their Tenant leads list.</p>
          <p>- They update the status after each follow-up, from a computer or phone.</p>
          <p>- When the customer pays, Create booking saves them as a tenant and makes the booking.</p>
        </div>
        <div class="modal-foot"><button class="btn" @click="nextOpen = false">Close</button></div>
      </div>
    </div>
    </template>

    <!-- One inquiry -->
    <template v-if="view === 'lead' && lead">
      <div>
        <button class="back" @click="go('list')">← Back to Tenant leads</button>
        <div class="page-head">
          <div>
            <h1>{{ `${lead.id} · ${lead.lookingFor}` }}</h1>
            <div class="sub">{{ `${lead.source} · logged by ${lead.loggedBy} on ${short(lead.created)}` }}</div>
          </div>
          <div class="head-tools">
            <span class="pill" :class="STATUS[lead.status][1]">{{ STATUS[lead.status][0] }}</span>
            <button class="btn btn-primary" v-if="canBook(lead)" @click="$router.push({ path: '/Operations/booking-forms/reservation', query: { lead: lead.id } })">Create booking</button>
          </div>
        </div>
        <div class="side-grid">
          <div class="form-card">
            <section class="card" v-if="lead.bookingId && !booking"><div class="card-head"><h2>Booking</h2><span class="muted">{{ lead.bookingId }}</span></div><p class="muted">This booking was deleted (cancelled, then deleted for good on Portfolio › Bookings).</p></section>
            <section class="card" v-if="booking">
              <div class="card-head"><h2>Booking</h2><span class="muted">{{ booking.id }}</span></div>
              <div class="kv" v-if="booking.status === 'cancelled'"><span>Status</span><span>{{ `Cancelled${booking.cancelledReason ? ': ' + booking.cancelledReason : ''}` }}</span></div>
              <div class="kv"><span>Unit</span><span>{{ `${booking.propertyName} · ${booking.unitCode}` }}</span></div>
              <div class="kv"><span>Stay</span><span>{{ `${full(booking.arrival)} to ${full(booking.departure)} · ${booking.nights} nights` }}</span></div>
              <div class="kv"><span>Type</span><span>{{ booking.longTerm ? 'Long-term lease' : 'Short stay' }}</span></div>
              <template v-if="booking.longTerm">
                <div class="kv"><span>Monthly rent</span><span>{{ rm(booking.monthlyRent) }}</span></div>
                <div class="kv"><span>Deposit (2 months)</span><span>{{ rm(booking.deposit) }}</span></div>
              </template>
              <div class="kv" v-else-if="booking.amount"><span>Total paid</span><span>{{ rm(booking.amount) }}</span></div>
              <div class="kv"><span>Payments</span><span>Accounting › Offline Payments</span></div>
              <div class="kv" v-if="booking.ezeeReservationNo"><span>eZee reservation no.</span><span>{{ booking.ezeeReservationNo }}</span></div>
              <div class="ezee-add" v-else>
                <label for="addEzee">eZee reservation no. (not added yet)</label>
                <div><input class="input" id="addEzee" v-model="ezeeAdd" placeholder="Once it is keyed into eZee"><button class="btn" @click="saveEzee()" :disabled="busy">Add</button></div>
              </div>
            </section>
            <section class="card">
              <div class="card-head"><h2>Update this inquiry</h2></div>
              <div class="field" style="max-width:340px"><label for="uAssign">Assigned to</label>
                <OptionPicker class="fld-pick" v-model="upd.assignedToUid" :disabled="!canAssign" :options="[{ value: '', label: canAssign && !staff.length ? 'No Operations staff yet' : 'Not assigned' }, ...(lead.assignedToUid && !staff.some(x => x.uid === lead.assignedToUid) ? [{ value: lead.assignedToUid, label: lead.assignedTo }] : []), ...staff.map(x => ({ value: x.uid, label: x.name }))]" label="Assigned to" /></div>
              <div class="field" v-if="lead.status !== 'booked'"><label>Status</label>
                <div class="status-opts">
                  <template v-for="k in PICKABLE" :key="k">
                    <button type="button" class="status-opt" :class="{ on: upd.status === k }" @click="upd.status = k">{{ STATUS[k][0] }}</button>
                  </template>
                </div></div>
              <div class="field"><label for="uNote">Follow-up note</label>
                <textarea class="input" id="uNote" v-model="upd.note" placeholder="e.g. Called back, viewing booked for Saturday"></textarea></div>
              <div class="notice error" v-show="formError && !editing">{{ formError }}</div>
              <div class="actions upd-actions"><button class="btn btn-primary" @click="saveUpdate()" :disabled="busy">Save update</button><button class="btn" v-if="updDirty" @click="discardUpdate()" :disabled="busy">Discard changes</button><span class="unsaved-note" v-show="updDirty">Unsaved changes</span></div>
            </section>
          </div>
          <section class="card">
            <div class="card-head">
              <h2>{{ tenant ? 'Tenant' : 'Customer' }}</h2>
              <button class="editlink" v-if="canEdit(lead) && !editing" @click="startEdit()">Edit</button>
            </div>
            <template v-if="canSeeContact(lead) && !editing">
              <div>
                <div class="kv" v-if="tenant"><span>Tenant ID</span><span>{{ tenant.id }}</span></div>
                <div class="kv"><span>Name</span><span>{{ who.name || '—' }}</span></div>
                <div class="kv"><span>Phone</span><span>{{ who.phone || '—' }}</span></div>
                <div class="kv"><span>Email</span><span class="wrap">{{ who.email || '—' }}</span></div>
                <template v-if="tenant">
                  <div class="kv"><span>IC / Passport</span><span>{{ tenant.icPassport || '—' }}</span></div>
                  <div class="kv"><span>Nationality</span><span>{{ tenant.nationality || '—' }}</span></div>
                  <div class="kv"><span>Stays</span><span>{{ tenantStays }}</span></div>
                </template>
              </div>
            </template>
            <template v-if="canSeeContact(lead) && editing">
              <div>
                <FormField id="eName" label="Name" v-model="edit.name" />
                <FormField id="ePhone" label="Phone" v-model="edit.phone" inputmode="tel" />
                <FormField id="eEmail" label="Email" type="email" v-model="edit.email" />
                <template v-if="tenant">
                  <FormField id="eIc" label="IC / Passport" v-model="edit.icPassport" />
                  <FormField id="eNat" label="Nationality" v-model="edit.nationality" />
                </template>
                <div class="notice error" v-show="formError">{{ formError }}</div>
                <div class="actions"><button class="btn" @click="editing = false; formError = ''">Cancel</button><button class="btn btn-primary" @click="saveEdit()" :disabled="busy">Save details</button></div>
              </div>
            </template>
            <template v-if="!canSeeContact(lead)">
              <div>
                <div class="kv"><span>Name</span><span class="masked">Hidden</span></div>
                <div class="kv"><span>Phone</span><span class="masked">Hidden</span></div>
                <div class="kv"><span>Email</span><span class="masked">Hidden</span></div>
                <p class="help">Only the staff member who logged it, the assigned staff member, Accounting and the Directors see contact details.</p>
              </div>
            </template>
            <div class="kv"><span>Budget</span><span>{{ lead.budget || '—' }}</span></div>
            <div class="kv"><span>Preferred viewing</span><span>{{ lead.viewing ? short(lead.viewing) : '—' }}</span></div>
            <button class="btn" style="width:100%;margin-top:12px" @click="histOpen = true">{{ `History (${lead.history.length})` }}</button>
          </section>
        </div>
      </div>
    </template>

    <div class="modal-back" v-if="histOpen && lead" @click.self="histOpen = false" v-esc="() => { histOpen = false }">
      <div class="modal" role="dialog" aria-label="History" style="max-width:560px;width:calc(100% - 32px)">
        <h2>{{ `${lead.id} · History` }}</h2>
        <div class="hist" style="max-height:60vh;overflow:auto">
          <template v-for="(h, i) in lead.history.slice().reverse()" :key="i">
            <div><small>{{ `${stamp(h.at)} · ${h.by}` }}</small><span>{{ h.text }}</span></div>
          </template>
        </div>
        <div class="modal-foot"><button class="btn" @click="histOpen = false">Close</button></div>
      </div>
    </div>
  </main>
</template>

<script>
// Offline inquiries in Firestore:
//   offlineInquiries/{LD-0001}            what they want, status, who logged it, who follows up, history
//   offlineInquiries/{id}/private/main    contact name, phone, phoneKey, email (PDPA: never on the parent)
//   tenants/{TEN-0001} + private/main     made by Create booking; a returning tenant is found by phoneKey
//   offlineBookings/{offline_LD-0001}     the stay. Not in bookings: month-end reads bookings and pays from eZee.
// Create booking opens Operations > Booking forms > Reservation (pages/Operations/booking-forms/ReservationForm.vue, since 4 Nov 2026).
import { collection, doc, getDoc, getDocs, query, where, orderBy, limit, writeBatch, runTransaction,
  arrayUnion, serverTimestamp, getCountFromServer } from 'firebase/firestore';
import { db } from '@/lib/firebase.js';
import { useSession } from '@/stores/session.js';
import OptionPicker from '@/components/OptionPicker.vue';
import FormField from '@/components/FormField.vue';
import { audit, friendlyError } from '@/lib/finance-data.js';
import { stateChoices, statesOf } from '@/lib/states.js';
import { scoped, countScoped } from '@/lib/property-scope.js';
import { STATUS, CONTACT_ALL, MON, nowIso, isoOf, num, phoneKey, searchWords, findTenant, privateOf } from '@/lib/offline.js';
// Direct service connection matching Issues.vue
import { notifyRole, notifyUser } from '@/services/notificationService.js';

const me = useSession();

const PICKABLE = ['interested', 'considering', 'uninterested'];   // Booked is set only by Create booking
const FILTERS = [{ key: 'all', label: 'All' }, { key: 'new', label: 'New' }, { key: 'interested', label: 'Interested (Pending payment)' },
  { key: 'considering', label: 'Considering' }, { key: 'uninterested', label: 'Uninterested' }, { key: 'booked', label: 'Booked' }];
const ASSIGNERS = ['director'];
const LOGGERS = ['director'];
const SEE_ALL = ['director', 'finance', 'it'];
const SOURCES = ['Walk-in', 'Phone call', 'WhatsApp', 'Referral', 'Agent', 'Other'];
const LIST_LIMIT = 500;
const emailOk = e => !e || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const stop = msg => Object.assign(new Error(msg), { plain: true });
const errText = (e, what) => (e.plain ? e.message : friendlyError(e, what));
const piiChanges = fields => fields.map(f => ({ field: f, old: null, new: '(changed)' }));

export default {
  components: { OptionPicker, FormField },
  data() {
    return {
      nextOpen: false, histOpen: false, STATUS, FILTERS, SOURCES, PICKABLE,
      leads: [], staff: [], tenant: null, booking: null, tenantStays: 0, known: null,
      view: 'list', lead: null, filter: 'all', okMsg: '', formError: '', error: '', loading: true, busy: false,
      form: {}, upd: {}, ezeeAdd: '', editing: false, edit: {}
    };
  },
  async mounted() {
    const q = this.$route.query;
    if ('new' in q) await this.show('new');
    // Old links: bookings are made on Booking forms > Reservation now
    else if ('newBooking' in q) { this.$router.replace({ path: '/Operations/booking-forms/reservation' }); return; }
    else if (q.id && 'book' in q) { this.$router.replace({ path: '/Operations/booking-forms/reservation', query: { lead: q.id } }); return; }
    else if (q.id) await this.show('lead', q.id);
    else { this.okMsg = history.state?.okMsg || ''; await this.show('list'); }
    this.loading = false;
  },
  watch: {
    'form.phone'(v) {
      clearTimeout(this.phoneTimer);
      this.phoneTimer = setTimeout(async () => {
        const t = await findTenant(v).catch(() => null);
        if (this.form.phone === v) this.known = t;
      }, 350);
    }
  },
  beforeUnmount() { clearTimeout(this.phoneTimer); },
  computed: {
    // The states a new lead can be for: every state for a Director, else the user's own
    stateList() { return stateChoices(me); },
    updDirty() { const l = this.lead, u = this.upd; return !!l && !!u && ((u.assignedToUid || '') !== (l.assignedToUid || '') || u.status !== l.status || !!(u.note || '').trim()); },
    canAssign() { return ASSIGNERS.includes(me.role); },
    canLog() { return LOGGERS.includes(me.role); },
    who() { const t = this.tenant, l = this.lead || {}; return t ? { name: t.name, phone: t.phone, email: t.email } : { name: l.contactName, phone: l.phone, email: l.email }; },
  },
  methods: {
    discardUpdate() { const l = this.lead; this.upd = { assignedToUid: l.assignedToUid || '', status: l.status, note: '' }; this.formError = ''; },
    // Everyone who should hear about a new inquiry or a status change
    // (the roles must match NOTIFY_ROLES / the Firestore rules)
    inquiryRoles() { return ['finance', 'director', 'operations']; },

    // Shared notification helper structured cleanly like Issues.vue
    async notify({ title, message, roles = [], uids = [], refId = null, link = '/Notifications', skipSelf = true }) {
      const base = { title, message, link, type: 'inquiry', refId };
      const jobs = [];

      // Deduplicate roles and send
      const targetRoles = [...new Set(roles)].filter(Boolean);
      targetRoles.forEach(recipientRole => {
        jobs.push(notifyRole({ ...base, recipientRole }));
      });

      // Deduplicate UIDs and prevent self-notifications when specified
      const targetUids = [...new Set(uids)].filter(uid => uid && (!skipSelf || uid !== me.user.uid));
      targetUids.forEach(recipientUid => {
        jobs.push(notifyUser({ ...base, recipientUid }));
      });

      if (!jobs.length) return;
      const results = await Promise.allSettled(jobs);
      results.forEach(r => {
        if (r.status === 'rejected') console.error('Notification failed:', r.reason);
      });
    },

    go(view, id = null) {
      const query = view === 'new' ? { new: '1' } : view === 'lead' ? { id } : {};
      this.$router.push({ query, state: { okMsg: this.okMsg } });
    },
    async show(view, id) {
      this.formError = ''; this.editing = false;
      try {
        if (view === 'list') await Promise.all([this.loadList(), this.loadStaff()]);
        if (view === 'new') {
          if (!this.canLog) view = 'list';
          else {
            await this.loadStaff();
            this.form = { state: statesOf(me).length === 1 ? statesOf(me)[0] : '', lookingFor: '', source: 'Walk-in', contactName: '', phone: '', email: '', budget: '', viewing: '', assignedTo: this.canAssign ? this.staff[0]?.uid || '' : '', status: 'new', note: '' };
          }
          if (view === 'list') await this.loadList();
        }
        if (view === 'lead') {
          await Promise.all([this.loadLead(id), this.loadStaff()]);
          if (!this.lead) view = 'list';
          if (view === 'list') await this.loadList();
          if (view === 'lead') { this.upd = { assignedToUid: this.lead.assignedToUid || '', status: this.lead.status, note: '' }; this.okMsg = history.state?.okMsg || ''; }
        }
      } catch (e) { this.error = friendlyError(e, 'load the offline inquiries'); }
      this.view = view;
    },
    toLead(id, d) {
      return { id, ...d, assignedTo: d.assignedToName || '', loggedBy: d.loggedByName || '', created: isoOf(d.createdAt), updated: isoOf(d.updatedAt),
        history: d.history || [], contactName: '', phone: '', email: '' };
    },
    async loadList() {
      const col = collection(db, 'offlineInquiries');
      const snap = await getDocs(SEE_ALL.includes(me.role) ? query(col, orderBy('createdAt', 'desc'), limit(LIST_LIMIT))
        : query(col, where('assignedToUid', '==', me.user.uid), limit(LIST_LIMIT)));
      const leads = snap.docs.map(d => this.toLead(d.id, d.data()));
      const priv = await Promise.all(leads.map(ld => this.canSeeContact(ld) ? privateOf(doc(db, 'offlineInquiries', ld.id)).catch(() => ({})) : {}));
      leads.forEach((ld, i) => Object.assign(ld, priv[i]));
      this.leads = leads;
    },
    async loadStaff() {
      if (!this.canAssign || this.staff.length) return;
      const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'operations'), where('active', '==', true)));
      this.staff = snap.docs.map(d => ({ uid: d.id, name: d.data().displayName || d.data().email || d.id })).sort((a, b) => a.name.localeCompare(b.name));
    },
    async loadLead(id) {
      this.lead = null; this.tenant = null; this.booking = null; this.tenantStays = 0;
      const ref = doc(db, 'offlineInquiries', id);
      const snap = await getDoc(ref).catch(e => { if (e.code === 'permission-denied') return null; throw e; });
      if (!snap?.exists()) return;
      const ld = this.toLead(id, snap.data());
      const see = this.canSeeContact(ld);
      if (see) Object.assign(ld, await privateOf(ref));
      const [t, b] = await Promise.all([
        ld.tenantId ? getDoc(doc(db, 'tenants', ld.tenantId)).catch(() => null) : null,
        ld.bookingId ? getDoc(doc(db, 'offlineBookings', ld.bookingId)).catch(() => null) : null
      ]);
      if (t?.exists()) {
        this.tenant = { id: t.id, ...t.data(), ...(see ? await privateOf(doc(db, 'tenants', t.id)).catch(() => ({})) : {}) };
        this.tenantStays = await countScoped(scoped(query(collection(db, 'offlineBookings'), where('tenantId', '==', t.id)))).catch(() => 0);   // stays in my properties
      }
      if (b?.exists()) this.booking = { id: b.id, ...b.data() };
      this.lead = ld;
    },
    count(k) { return this.leads.filter(x => k === 'all' || x.status === k).length; },
    shown() { return this.leads.filter(x => this.filter === 'all' || x.status === this.filter).sort((a, b) => b.id.localeCompare(a.id)); },
    short(iso) { if (!iso) return ''; const [, m, dd] = iso.slice(0, 10).split('-'); return `${+dd} ${MON[+m - 1]}`; },
    full(iso) { return iso ? `${this.short(iso)} ${iso.slice(0, 4)}` : ''; },
    stamp(iso) { return iso ? `${this.short(iso)}, ${iso.slice(11, 16)}` : ''; },
    rm(v) { return 'RM ' + (+v || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); },
    canSeeContact(ld) { return CONTACT_ALL.includes(me.role) || ld.loggedByUid === me.user.uid || ld.assignedToUid === me.user.uid; },
    canEdit(ld) { return this.canSeeContact(ld) && (!this.tenant || CONTACT_ALL.includes(me.role)); },
    canBook(ld) { return ld.status === 'interested' && !ld.bookingId && this.canSeeContact(ld); },
    entry(text) { return { at: nowIso(), by: me.name, text }; },

    async assign(ld, uid) {
      const who = this.staff.find(s => s.uid === uid);
      if (!who || this.busy) return;
      const h = this.entry(`Assigned to ${who.name}.`);
      this.busy = true; this.error = '';
      try {
        const b = writeBatch(db);
        b.update(doc(db, 'offlineInquiries', ld.id), { assignedToUid: who.uid, assignedToName: who.name, updatedAt: serverTimestamp(), history: arrayUnion(h) });
        audit(b, me, { action: 'offlineInquiry.assign', entity: `offlineInquiries/${ld.id}`, changes: [{ field: 'assignedTo', old: null, new: who.name }] });
        await b.commit();
        Object.assign(ld, { assignedToUid: who.uid, assignedToName: who.name, assignedTo: who.name, updated: h.at });
        ld.history.push(h);
        this.okMsg = `${ld.id} assigned to ${who.name}.`;

        // Direct notification to assignee (skipSelf set to false so self-assignment testing works)
        this.notify({
          uids: [who.uid],
          skipSelf: false,
          title: 'Inquiry assigned to you',
          refId: ld.id,
          message: `${ld.id} · ${ld.lookingFor} was assigned to you by ${me.name}.`,
          link: `/Operations/offline-inquiries?id=${ld.id}`
        });
      } catch (e) { this.error = friendlyError(e, 'assign the inquiry'); }
      this.busy = false;
    },

    async saveNew() {
      const f = this.form;
      if (!f.lookingFor.trim()) return this.formError = 'Say what they are looking for, e.g. Monthly rental, 2 bedrooms, Ampang.';
      // State is optional since 12 Nov 2026 (access is by property; a lead has none until it is booked)
      if (!f.contactName.trim() && !f.phone.trim()) return this.formError = 'Add a name or phone number so Operations can follow up.';
      if (!emailOk(f.email.trim())) return this.formError = 'That email address doesn\'t look right. Check it or leave it empty.';
      this.busy = true; this.formError = '';
      try {
        const known = await findTenant(f.phone);
        const who = this.canAssign ? this.staff.find(s => s.uid === f.assignedTo) || null : null;
        const h = this.entry(`Logged the inquiry${who ? `, assigned to ${who.name}` : ''}${known ? `, linked to existing tenant ${known.id}` : ''}.${f.note.trim() ? ' ' + f.note.trim() : ''}`);
        
        const id = await runTransaction(db, async tx => {
          const cRef = doc(db, 'counters', 'offlineInquiries');
          const c = await tx.get(cRef);
          const n = c.exists() ? c.data().next || 1 : 1, id = num('LD', n), ref = doc(db, 'offlineInquiries', id);
          if ((await tx.get(ref)).exists()) throw stop(`${id} already exists. Ask a Director to check counters/offlineInquiries.`);
          tx.set(cRef, { next: n + 1 });
          tx.set(ref, { ...(f.state ? { state: f.state } : {}), lookingFor: f.lookingFor.trim(), source: f.source, budget: f.budget.trim(), viewing: f.viewing, status: f.status,
            assignedToUid: who?.uid || null, assignedToName: who?.name || null, loggedByUid: me.user.uid, loggedByName: me.name,
            tenantId: known?.id || null, bookingId: null, history: [h], createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
          tx.set(doc(ref, 'private', 'main'), { contactName: f.contactName.trim(), phone: f.phone.trim(), phoneKey: phoneKey(f.phone), email: f.email.trim() });
          audit(tx, me, { action: 'offlineInquiry.create', entity: `offlineInquiries/${id}`,
            changes: [{ field: 'status', old: null, new: f.status }, ...(who ? [{ field: 'assignedTo', old: null, new: who.name }] : [])] });
          return id;
        });

        const link = `/Operations/offline-inquiries?id=${id}`;

        // Case A: Assigned to a staff member (skipSelf: false ensures local self-tests trigger notifications)
        if (who) {
          this.notify({
            uids: [who.uid],
            skipSelf: false,
            title: 'Inquiry assigned to you',
            refId: id,
            message: `${id} · ${f.lookingFor.trim()} was assigned to you by ${me.name}.`,
            link
          });
        }

        // Case B: New inquiry — alert Finance, Directors and Operations
        this.notify({
          roles: this.inquiryRoles(),
          title: `New inquiry ${id}`,
          refId: id,
          message: `${me.name} logged ${id} · ${f.lookingFor.trim()} (${STATUS[f.status][0]})${who ? `, assigned to ${who.name}` : ', unassigned'}.`,
          link
        });

        this.okMsg = `${id} logged${who ? ` and assigned to ${who.name}` : ''}.`;
        this.go('list');
      } catch (e) { this.formError = errText(e, 'save the inquiry'); }
      this.busy = false;
    },

    async saveUpdate() {
      const ld = this.lead, u = this.upd, parts = [];
      const who = this.staff.find(s => s.uid === u.assignedToUid) || null;
      const reassign = this.canAssign && (u.assignedToUid || '') !== (ld.assignedToUid || '');
      const statusChanged = u.status !== ld.status;
      const oldStatus = ld.status;
      if (reassign) parts.push(who ? `Assigned to ${who.name}.` : 'Unassigned.');
      if (u.status !== ld.status) parts.push(`Status: ${STATUS[u.status][0]}.`);
      if (u.note.trim()) parts.push(u.note.trim());
      if (!parts.length) return this.formError = 'Nothing changed. Pick a status or add a note.';
      const h = this.entry(parts.join(' '));
      const change = { status: u.status, updatedAt: serverTimestamp(), history: arrayUnion(h),
        ...(reassign ? { assignedToUid: who?.uid || null, assignedToName: who?.name || null } : {}) };
      this.busy = true;
      try {
        const b = writeBatch(db);
        b.update(doc(db, 'offlineInquiries', ld.id), change);
        audit(b, me, { action: 'offlineInquiry.update', entity: `offlineInquiries/${ld.id}`, reason: u.note.trim(),
          changes: [...(u.status !== ld.status ? [{ field: 'status', old: ld.status, new: u.status }] : []),
            ...(reassign ? [{ field: 'assignedTo', old: ld.assignedTo || null, new: who?.name || null }] : [])] });
        await b.commit();
        Object.assign(ld, { status: u.status, updated: h.at, ...(reassign ? { assignedToUid: who?.uid || null, assignedToName: who?.name || null, assignedTo: who?.name || '' } : {}) });
        ld.history.push(h);
        this.formError = ''; this.upd.note = ''; this.okMsg = `${ld.id} updated.`;

        const link = `/Operations/offline-inquiries?id=${ld.id}`;
        if (reassign && who) {
          this.notify({
            uids: [who.uid],
            skipSelf: false,
            title: 'Inquiry assigned to you',
            refId: ld.id,
            message: `${ld.id} · ${ld.lookingFor} was assigned to you by ${me.name}.`,
            link
          });
        }
        if (statusChanged) {
          this.notify({
            roles: this.inquiryRoles(),
            title: 'Inquiry status changed',
            refId: ld.id,
            message: `${ld.id} · ${ld.lookingFor}: ${me.name} changed the status from ${STATUS[oldStatus][0]} to ${STATUS[u.status][0]}.`,
            link
          });
        }
      } catch (e) { this.formError = friendlyError(e, 'save the update'); }
      this.busy = false;
    },

    async saveEzee() {
      const no = this.ezeeAdd.trim(), b = this.booking, ld = this.lead;
      if (!no || !b) return;
      const h = this.entry(`Linked eZee reservation ${no}.`);
      this.busy = true; this.formError = '';
      try {
        const batch = writeBatch(db);
        batch.update(doc(db, 'offlineBookings', b.id), { ezeeReservationNo: no, updatedAt: serverTimestamp(), updatedBy: me.user.uid });
        batch.update(doc(db, 'offlineInquiries', ld.id), { updatedAt: serverTimestamp(), history: arrayUnion(h) });
        audit(batch, me, { action: 'offlineBooking.ezee', entity: `offlineBookings/${b.id}`, propertyId: b.propertyId || null,
          changes: [{ field: 'ezeeReservationNo', old: null, new: no }] });
        await batch.commit();
        b.ezeeReservationNo = no; ld.updated = h.at; ld.history.push(h);
        this.ezeeAdd = ''; this.okMsg = `eZee reservation ${no} linked.`;
      } catch (e) { this.formError = friendlyError(e, 'link the eZee reservation'); }
      this.busy = false;
    },
    startEdit() {
      const t = this.tenant;
      this.edit = { ...this.who, icPassport: t?.icPassport || '', nationality: t?.nationality || '' };
      this.formError = ''; this.editing = true;
    },
    async saveEdit() {
      const e = Object.fromEntries(Object.entries(this.edit).map(([k, v]) => [k, String(v || '').trim()]));
      if (!e.name && !e.phone) return this.formError = 'Keep at least a name or a phone number.';
      if (!emailOk(e.email)) return this.formError = 'That email address doesn\'t look right.';
      const t = this.tenant, ld = this.lead, key = phoneKey(e.phone);
      const before = { ...this.who, icPassport: t?.icPassport || '', nationality: t?.nationality || '' };
      const changed = (t ? ['name', 'phone', 'email', 'icPassport', 'nationality'] : ['name', 'phone', 'email']).filter(k => (before[k] || '') !== e[k]);
      this.busy = true; this.formError = '';
      try {
        if (t && key.length >= 9) {
          const other = await findTenant(e.phone);
          if (other && other.id !== t.id) throw stop(`Tenant ${other.id} already has this phone number.`);
        }
        const h = this.entry(t ? `Updated tenant ${t.id}'s details.` : 'Updated the customer\'s details.');
        const b = writeBatch(db), lRef = doc(db, 'offlineInquiries', ld.id);
        if (t) {
          b.set(doc(db, 'tenants', t.id, 'private', 'main'), { kind: 'tenant', name: e.name, phone: e.phone, phoneKey: key, email: e.email,
            icPassport: e.icPassport, nationality: e.nationality, searchWords: searchWords(e.name) }, { merge: true });
          b.update(doc(db, 'tenants', t.id), { updatedAt: serverTimestamp(), updatedBy: me.user.uid });
        }
        b.set(doc(lRef, 'private', 'main'), { contactName: e.name, phone: e.phone, phoneKey: key, email: e.email }, { merge: true });
        b.update(lRef, { updatedAt: serverTimestamp(), history: arrayUnion(h) });
        audit(b, me, { action: t ? 'tenant.update' : 'offlineInquiry.contact', entity: t ? `tenants/${t.id}` : `offlineInquiries/${ld.id}`, changes: piiChanges(changed) });
        await b.commit();
        if (t) Object.assign(t, { name: e.name, phone: e.phone, phoneKey: key, email: e.email, icPassport: e.icPassport, nationality: e.nationality });
        Object.assign(ld, { contactName: e.name, phone: e.phone, email: e.email, updated: h.at });
        ld.history.push(h);
        this.editing = false; this.okMsg = 'Details saved.';
      } catch (err) { this.formError = errText(err, 'save the details'); }
      this.busy = false;
    },

  }
};
</script>

<style scoped>
    .pills-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    .info-btn { padding: 8px 10px; color: var(--accent); border: 1.5px solid var(--accent); }
    .info-btn:hover { background: var(--accent-soft); }
    .next-list p { margin: 0 0 10px; font-size: 14px; line-height: 1.5; }
    .fld-pick { display: block; width: 100%; }
    .fld-pick :deep(.op-btn) { width: 100%; min-height: 40px; }
    .fld-pick :deep(.op-pop) { max-width: none; width: 100%; }
    .count-pills .pill-btn { height: 26px; font-size: 12px; padding: 0 10px; }
    .assign-sel { height: 26px; font-size: 12px; font-weight: 500; border-radius: 999px; border: 0; padding: 0 22px 0 10px; background-color: var(--accent-soft); color: var(--accent);
      background-position: calc(100% - 13px) 11px, calc(100% - 9px) 11px; }
    .back { display: inline-block; color: var(--accent); font-size: 13px; font-weight: 500; margin-bottom: 14px; background: none; border: 0; padding: 0; cursor: pointer; }
    .form-card { display: grid; gap: 16px; }
    .form-card h2 { font-size: 15px; margin: 0 0 12px; }
    .form-card .card-head h2 { margin: 0; }
    .status-opts { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 10px; }
    .status-opt { display: flex; align-items: center; gap: 8px; min-height: 40px; padding: 8px 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); color: var(--text); font-size: 13px; text-align: left; }
    .status-opt::before { content: ""; width: 11px; height: 11px; border-radius: 50%; border: 1.5px solid var(--text-2); flex: none; }
    .status-opt:hover:not(:disabled) { border-color: var(--accent); background: var(--accent-soft); cursor: pointer; }
    .status-opt.on { border-color: var(--accent); background: var(--accent-soft); }
    .status-opt.on::before { border-color: var(--accent); background: var(--accent); box-shadow: inset 0 0 0 2px var(--surface); }
    .next-list p { margin: 0 0 10px; font-size: 13px; color: var(--text-2); }
    .hist { display: grid; gap: 10px; }
    .hist div { font-size: 13px; border-left: 2px solid var(--line); padding-left: 10px; }
    .hist small { display: block; color: var(--muted); font-size: 11px; }
    .page-note { color: var(--muted); font-size: 12px; margin-top: 14px; }
    .masked { color: var(--muted); }
    .ten-id { font-size: 11px; color: var(--muted); }
    .wrap { overflow-wrap: anywhere; }
    .pill.accent { background: var(--accent-soft); color: var(--accent); }
    .readonly { display: flex; align-items: center; background: var(--chip); color: var(--text); }
    .ezee-add { padding-top: 8px; font-size: 13px; }
    .ezee-add label { display: block; color: var(--text-2); margin-bottom: 6px; }
    .ezee-add div { display: flex; gap: 8px; }
    .ezee-add .input { flex: 1; min-width: 0; }
    .bottom-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 8px; padding: 14px 0 20px; }
    .head-tools { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    @media (max-width: 640px) { .status-opts { grid-template-columns: minmax(0,1fr); } }
    .upd-actions { display: flex; align-items: center; gap: 8px; justify-content: flex-start; }
    .upd-actions .unsaved-note { font-size: 11px; color: #A9AFBA; font-weight: 400; }
</style>
