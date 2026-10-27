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
            <h1>Offline inquiries</h1>
            <div class="sub">{{ canAssign ? 'Log offline inquiries and assign each one to an Operations member to follow up.' : 'Log offline inquiries. A Director assigns each one to an Operations member to follow up.' }}</div>
          </div>
          <button class="btn btn-primary" v-if="canLog" @click="go('new')">+ Log inquiry</button>
        </div>
        <div class="pills brand count-pills" style="margin-bottom:16px">
          <template v-for="f in FILTERS" :key="f.key">
            <button class="pill-btn" :class="{ on: filter === f.key }" @click="filter = f.key">{{ `${f.label} · ${count(f.key)}` }}</button>
          </template>
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
                <tr v-show="!loading && !shown().length"><td colspan="8" class="muted">No inquiries here.</td></tr>
              </tbody>
            </table>
          </div>
          </Paged>
        </section>
        <p class="page-note">Names and contact details are shown only to the staff member who logged the inquiry, the assigned staff member, Finance and the Directors.</p>
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
            <button class="btn btn-primary" @click="saveNew()" :disabled="busy">{{ canAssign ? 'Save and assign' : 'Save' }}</button>
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
                <div class="field"><label for="lBudget">Budget</label><input class="input" id="lBudget" v-model="form.budget" placeholder="e.g. RM 2,200 a month"></div>
                <div class="field"><label for="lView">Preferred viewing</label><input class="input" id="lView" type="date" v-model="form.viewing"></div>
              </div>
            </section>
            <section class="card">
              <h2>Customer</h2>
              <div class="grid-fields">
                <div class="field"><label for="lName">Name</label><input class="input" id="lName" v-model="form.contactName" placeholder="e.g. Prospect A"></div>
                <div class="field"><label for="lPhone">Phone</label><input class="input" id="lPhone" v-model="form.phone" inputmode="tel" placeholder="e.g. 012-345 6789"></div>
                <div class="field"><label for="lEmail">Email (optional)</label><input class="input" id="lEmail" type="email" v-model="form.email" placeholder="e.g. name@example.com"></div>
              </div>
              <p class="help" v-if="known">{{ `This phone number belongs to existing tenant ${known.id}. The inquiry will be linked to them.` }}</p>
            </section>
            <section class="card" v-if="canAssign">
              <h2>Assign to</h2>
              <div class="field" style="max-width:340px;margin:0"><label for="lAssign">Operations member</label>
                <select class="input" id="lAssign" v-model="form.assignedTo">
                  <option value="">Assign later</option>
                  <template v-for="s in staff" :key="s.uid"><option :value="s.uid">{{ s.name }}</option></template>
                </select>
                <span class="help" v-show="!staff.length">No Operations staff yet. Save it unassigned and assign it later.</span></div>
            </section>
            <section class="card">
              <h2>Status (optional)</h2>
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
          <section class="card next-list">
            <div class="card-head"><h2>What happens next</h2></div>
            <p v-if="!canAssign">- A Director assigns it to an Operations member.</p>
            <p>- The assigned Operations member sees the inquiry in their Offline inquiries list.</p>
            <p>- They update the status after each follow-up, from a computer or phone.</p>
            <p>- When the customer pays, Create booking saves them as a tenant and makes the booking.</p>
          </section>
        </div>
      </div>
    </template>

    <!-- One inquiry -->
    <template v-if="view === 'lead' && lead">
      <div>
        <button class="back" @click="go('list')">← Back to Offline inquiries</button>
        <div class="page-head">
          <div>
            <h1>{{ `${lead.id} · ${lead.lookingFor}` }}</h1>
            <div class="sub">{{ `${lead.source} · logged by ${lead.loggedBy} on ${short(lead.created)}` }}</div>
          </div>
          <div class="head-tools">
            <span class="pill" :class="STATUS[lead.status][1]">{{ STATUS[lead.status][0] }}</span>
            <button class="btn btn-primary" v-if="canBook(lead)" @click="go('book', lead.id)">Create booking</button>
          </div>
        </div>
        <div class="side-grid">
          <div class="form-card">
            <section class="card" v-if="booking">
              <div class="card-head"><h2>Booking</h2><span class="muted">{{ booking.id }}</span></div>
              <div class="kv"><span>Unit</span><span>{{ `${booking.propertyName} · ${booking.unitCode}` }}</span></div>
              <div class="kv"><span>Stay</span><span>{{ `${full(booking.arrival)} to ${full(booking.departure)} · ${booking.nights} nights` }}</span></div>
              <div class="kv"><span>Type</span><span>{{ booking.longTerm ? 'Long-term lease' : 'Short stay' }}</span></div>
              <template v-if="booking.longTerm">
                <div class="kv"><span>Monthly rent</span><span>{{ rm(booking.monthlyRent) }}</span></div>
                <div class="kv"><span>Deposit (2 months)</span><span>{{ rm(booking.deposit) }}</span></div>
              </template>
              <div class="kv" v-else><span>Total paid</span><span>{{ rm(booking.amount) }}</span></div>
              <div class="kv"><span>Payment reference</span><span>{{ booking.paymentRef || '—' }}</span></div>
              <div class="kv" v-if="booking.ezeeReservationNo"><span>eZee reservation no.</span><span>{{ booking.ezeeReservationNo }}</span></div>
              <div class="ezee-add" v-else>
                <label for="addEzee">eZee reservation no. (not added yet)</label>
                <div><input class="input" id="addEzee" v-model="ezeeAdd" placeholder="Once it is keyed into eZee"><button class="btn" @click="saveEzee()" :disabled="busy">Add</button></div>
              </div>
            </section>
            <section class="card">
              <div class="card-head"><h2>Update this inquiry</h2></div>
              <div class="field" style="max-width:340px"><label for="uAssign">Assigned to</label>
                <select class="input" id="uAssign" v-model="upd.assignedToUid" :disabled="!canAssign">
                  <option value="">{{ canAssign && !staff.length ? 'No Operations staff yet' : 'Not assigned' }}</option>
                  <option v-if="lead.assignedToUid && !staff.some(s => s.uid === lead.assignedToUid)" :value="lead.assignedToUid">{{ lead.assignedTo }}</option>
                  <template v-for="s in staff" :key="s.uid"><option :value="s.uid" :selected="s.uid === upd.assignedToUid">{{ s.name }}</option></template>
                </select></div>
              <div class="field" v-if="lead.status !== 'booked'"><label>Status</label>
                <div class="status-opts">
                  <template v-for="k in PICKABLE" :key="k">
                    <button type="button" class="status-opt" :class="{ on: upd.status === k }" @click="upd.status = k">{{ STATUS[k][0] }}</button>
                  </template>
                </div></div>
              <div class="field"><label for="uNote">Follow-up note</label>
                <textarea class="input" id="uNote" v-model="upd.note" placeholder="e.g. Called back, viewing booked for Saturday"></textarea></div>
              <div class="notice error" v-show="formError && !editing">{{ formError }}</div>
              <div class="actions"><button class="btn btn-primary" @click="saveUpdate()" :disabled="busy">Save update</button></div>
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
                <div class="field"><label for="eName">Name</label><input class="input" id="eName" v-model="edit.name"></div>
                <div class="field"><label for="ePhone">Phone</label><input class="input" id="ePhone" v-model="edit.phone" inputmode="tel"></div>
                <div class="field"><label for="eEmail">Email</label><input class="input" id="eEmail" type="email" v-model="edit.email"></div>
                <template v-if="tenant">
                  <div class="field"><label for="eIc">IC / Passport</label><input class="input" id="eIc" v-model="edit.icPassport"></div>
                  <div class="field"><label for="eNat">Nationality</label><input class="input" id="eNat" v-model="edit.nationality"></div>
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
                <p class="help">Only the staff member who logged it, the assigned staff member, Finance and the Directors see contact details.</p>
              </div>
            </template>
            <div class="kv"><span>Budget</span><span>{{ lead.budget || '—' }}</span></div>
            <div class="kv"><span>Preferred viewing</span><span>{{ lead.viewing ? short(lead.viewing) : '—' }}</span></div>
          </section>
        </div>
      </div>
    </template>

    <!-- Create booking -->
    <template v-if="view === 'book' && (lead || direct)">
      <div>
        <button class="back" @click="bookBack()">{{ direct ? '← Back to Bookings' : `← Back to ${lead.id}` }}</button>
        <div class="page-head">
          <div>
            <h1>{{ direct ? 'New booking' : 'Create booking' }}</h1>
            <div class="sub">{{ direct ? 'A booking without an inquiry, e.g. a walk-in or a returning tenant. Saving saves the customer as a tenant.'
              : `From ${lead.id} · ${lead.lookingFor}. Saving marks the inquiry as paid and saves the customer as a tenant.` }}</div>
          </div>
          <div class="head-tools">
            <button class="btn" @click="bookBack()">Cancel</button>
            <button class="btn btn-primary" @click="saveBooking()" :disabled="busy">Save booking</button>
          </div>
        </div>
        <div class="notice error" v-show="formError">{{ formError }}</div>
        <div class="side-grid">
          <div class="form-card">
            <section class="card">
              <h2>Tenant</h2>
              <p class="help" v-if="bk.existing">{{ `Existing tenant ${bk.existing.id} has this phone number. Their details are filled in below and the booking will be added to their record.` }}</p>
              <div class="grid-fields">
                <div class="field"><label for="bName">Name</label><input class="input" id="bName" v-model="bk.name"></div>
                <div class="field"><label for="bPhone">Phone</label><input class="input" id="bPhone" v-model="bk.phone" inputmode="tel" @change="refill(true)"></div>
                <div class="field"><label for="bEmail">Email</label><input class="input" id="bEmail" type="email" v-model="bk.email"></div>
                <div class="field"><label for="bIc">IC / Passport</label><input class="input" id="bIc" v-model="bk.icPassport"></div>
                <div class="field"><label for="bNat">Nationality</label><input class="input" id="bNat" v-model="bk.nationality" placeholder="e.g. Malaysian"></div>
              </div>
            </section>
            <section class="card">
              <h2>Stay</h2>
              <div class="grid-fields">
                <div class="field"><label for="bProp">Property</label>
                  <select class="input" id="bProp" v-model="bk.propertyId" @change="loadUnitList()">
                    <option value="">Choose property</option>
                    <template v-for="p in properties" :key="p.id"><option :value="p.id">{{ p.name }}</option></template>
                  </select></div>
                <div class="field"><label for="bUnit">Unit</label>
                  <select class="input" id="bUnit" v-model="bk.unitId" :disabled="!bk.propertyId">
                    <option value="">{{ bk.propertyId && !units.length ? 'No units found' : 'Choose unit' }}</option>
                    <template v-for="u in units" :key="u.id"><option :value="u.id">{{ u.unitCode }}</option></template>
                  </select></div>
                <div class="field"><label for="bIn">Check-in</label><input class="input" id="bIn" type="date" v-model="bk.arrival"></div>
                <div class="field"><label for="bOut">Check-out</label><input class="input" id="bOut" type="date" v-model="bk.departure"></div>
              </div>
              <p class="help" v-if="nights > 0">{{ `${nights} night${nights === 1 ? '' : 's'} · ${longTerm ? 'Long-term lease (30 nights or more)' : 'Short stay (29 nights or less)'}` }}</p>
            </section>
            <section class="card">
              <h2>Payment</h2>
              <div class="grid-fields">
                <template v-if="longTerm">
                  <div class="field"><label for="bRent">Monthly rent (RM)</label><input class="input" id="bRent" type="number" min="0" step="0.01" v-model="bk.monthlyRent"></div>
                  <div class="field"><label>Deposit (2 months, required)</label><div class="input readonly">{{ rm(deposit) }}</div></div>
                </template>
                <div class="field" v-else><label for="bAmt">Total paid (RM)</label><input class="input" id="bAmt" type="number" min="0" step="0.01" v-model="bk.amount"></div>
                <div class="field"><label for="bEzee">eZee reservation no. (optional)</label><input class="input" id="bEzee" v-model="bk.ezeeNo" placeholder="Add once it is keyed into eZee"></div>
                <div class="field"><label for="bRef">Payment reference</label><input class="input" id="bRef" v-model="bk.paymentRef" placeholder="e.g. bank transfer ref or receipt no."></div>
              </div>
            </section>
            <section class="card">
              <h2>Note</h2>
              <textarea class="input" style="height:70px" v-model="bk.note" placeholder="e.g. Paid in full by bank transfer" aria-label="Note"></textarea>
            </section>
          </div>
          <section class="card next-list">
            <div class="card-head"><h2>When you save</h2></div>
            <p>{{ bk.existing ? `- The booking is added to tenant ${bk.existing.id}.` : '- The customer is saved as a new tenant.' }}</p>
            <p v-if="direct">- The booking gets the next number, offline_BK-0001 and up, and shows under Portfolio > Bookings.</p>
            <template v-else>
              <p>{{ `- The booking is saved as offline_${lead.id}, so it can't be made twice.` }}</p>
              <p>{{ `- ${lead.id} is marked Paid · Booked.` }}</p>
            </template>
            <p v-if="longTerm">- The lease starts on the check-in date and the rent cycle follows it.</p>
            <p><b>- Key this booking into eZee to block the room.</b> Month-end pays the owner from the eZee booking; this copy keeps the tenant's history and is never counted twice.</p>
          </section>
        </div>
      </div>
    </template>
  </main>
</template>

<script>
// Offline inquiries in Firestore:
//   offlineInquiries/{LD-0001}            what they want, status, who logged it, who follows up, history
//   offlineInquiries/{id}/private/main    contact name, phone, phoneKey, email (PDPA: never on the parent)
//   tenants/{TEN-0001} + private/main     made by Create booking; a returning tenant is found by phoneKey
//   offlineBookings/{offline_LD-0001}     the stay. Not in bookings: month-end reads bookings and pays from eZee.
import { collection, collectionGroup, doc, getDoc, getDocs, query, where, orderBy, limit, writeBatch, runTransaction,
  arrayUnion, serverTimestamp, getCountFromServer } from 'firebase/firestore';
import { db } from '@/lib/firebase.js';
import { useSession } from '@/stores/session.js';
import { loadProperties, loadUnits, audit, friendlyError } from '@/lib/finance-data.js';

const me = useSession();

const STATUS = { new: ['New', 'blue'], interested: ['Interested (Pending payment)', 'green'], considering: ['Considering', 'amber'], uninterested: ['Uninterested', 'grey'],
  booked: ['Paid · Booked', 'accent'] };
const PICKABLE = ['interested', 'considering', 'uninterested'];   // Booked is set only by Create booking
const FILTERS = [{ key: 'all', label: 'All' }, { key: 'new', label: 'New' }, { key: 'interested', label: 'Interested (Pending payment)' },
  { key: 'considering', label: 'Considering' }, { key: 'uninterested', label: 'Uninterested' }, { key: 'booked', label: 'Booked' }];
// Who can assign an inquiry to an Operations member. Directors only for now (Khairul 21 Oct); add roles here to change it.
const ASSIGNERS = ['director'];
// Who logs inquiries. Directors only for now (Khairul 21 Oct); add roles here and in the rules to change it.
const LOGGERS = ['director'];
// Who sees every inquiry with its contact details and edits tenants (the rules say the same).
const CONTACT_ALL = ['director', 'finance'];
// Who sees the whole list (IT without names or contact details); Operations see the ones assigned to them.
const SEE_ALL = ['director', 'finance', 'it'];
// Who makes a booking without an inquiry (Portfolio > Bookings > + New booking, Khairul 21 Oct). The rules say the same.
const DIRECT_BOOKERS = ['director', 'finance', 'operations'];
const SOURCES = ['Walk-in', 'Phone call', 'WhatsApp', 'Referral', 'Agent', 'Other'];
const LONG_TERM_NIGHTS = 30;   // 30+ days = long-term (business rule)
const LIST_LIMIT = 500;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const localIso = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
const nowIso = () => localIso(new Date());
const isoOf = t => (t?.toDate ? localIso(t.toDate()) : typeof t === 'string' ? t : '');
const num = (prefix, n) => `${prefix}-${String(n).padStart(4, '0')}`;
// Phone numbers compared as digits only, with a leading 0 read as Malaysia's 60, so 012-345 6789 and +60 12 345 6789 match.
const phoneKey = p => { const n = String(p || '').replace(/\D/g, ''); return n.startsWith('0') ? '6' + n : n; };
// Name search words: the start of each word from 2 letters (ERD v2), e.g. Chow Kia Wei -> ch, cho, chow, ki, kia, we, wei.
const searchWords = name => [...new Set(String(name || '').toLowerCase().split(/\s+/).filter(Boolean)
  .flatMap(w => Array.from({ length: Math.max(0, w.length - 1) }, (_, i) => w.slice(0, i + 2))))];
const toCents = v => Math.round((+v || 0) * 100) / 100;
const emailOk = e => !e || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
// Shown as a plain message (not "Could not ...") when a save is refused for a reason the person can act on.
const stop = msg => Object.assign(new Error(msg), { plain: true });
const errText = (e, what) => (e.plain ? e.message : friendlyError(e, what));
// The audit log names the personal fields that changed, never their values (IT reads the audit log).
const piiChanges = fields => fields.map(f => ({ field: f, old: null, new: '(changed)' }));

// A returning tenant: tenants/{id}/private/main with the same phoneKey. kind == 'tenant' keeps inquiries' own
// private documents out, and lets the rules allow this search for Operations too.
async function findTenant(phone) {
  const k = phoneKey(phone);
  if (k.length < 9) return null;
  const snap = await getDocs(query(collectionGroup(db, 'private'), where('kind', '==', 'tenant'), where('phoneKey', '==', k), limit(5)));
  const hit = snap.docs.find(d => d.ref.path.startsWith('tenants/'));
  return hit ? { id: hit.ref.path.split('/')[1], ...hit.data() } : null;
}
const privateOf = async ref => { const s = await getDoc(doc(ref, 'private', 'main')); return s.exists() ? s.data() : {}; };

export default {
  data() {
    return {
      STATUS, FILTERS, SOURCES, PICKABLE,
      leads: [], staff: [], tenant: null, booking: null, tenantStays: 0, known: null,
      view: 'list', lead: null, filter: 'all', okMsg: '', formError: '', error: '', loading: true, busy: false,
      direct: false, form: {}, upd: {}, ezeeAdd: '', editing: false, edit: {}, bk: {}, properties: [], units: []
    };
  },
  // ?new=1 opens Log inquiry, ?id= opens an inquiry, ?id=&book=1 opens Create booking, ?newBooking=1 a booking without an inquiry. Moving between them changes the address,
  // which remounts the page (Back/Forward included); a message for the list travels in history.state.
  async mounted() {
    const q = this.$route.query;
    if ('new' in q) await this.show('new');
    else if ('newBooking' in q) await this.show('direct');
    else if (q.id && 'book' in q) await this.show('book', q.id);
    else if (q.id) await this.show('lead', q.id);
    else { this.okMsg = history.state?.okMsg || ''; await this.show('list'); }
    this.loading = false;
  },
  watch: {
    // Log inquiry: look the phone number up once typing pauses.
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
    canAssign() { return ASSIGNERS.includes(me.role); },
    canLog() { return LOGGERS.includes(me.role); },
    // Once booked, the tenant record is the source of the customer's details.
    who() { const t = this.tenant, l = this.lead || {}; return t ? { name: t.name, phone: t.phone, email: t.email } : { name: l.contactName, phone: l.phone, email: l.email }; },
    nights() {
      const { arrival: a, departure: b } = this.bk;
      return a && b ? Math.round((Date.parse(b) - Date.parse(a)) / 86400000) : 0;
    },
    longTerm() { return this.nights >= LONG_TERM_NIGHTS; },
    deposit() { return toCents(this.bk.monthlyRent) * 2; }
  },
  methods: {
    go(view, id = null) {
      const query = view === 'new' ? { new: '1' } : view === 'lead' ? { id } : view === 'book' ? { id, book: '1' } : {};
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
            this.form = { lookingFor: '', source: 'Walk-in', contactName: '', phone: '', email: '', budget: '', viewing: '', assignedTo: this.canAssign ? this.staff[0]?.uid || '' : '', status: 'new', note: '' };
          }
          if (view === 'list') await this.loadList();
        }
        if (view === 'direct') {
          if (DIRECT_BOOKERS.includes(me.role)) { this.direct = true; view = 'book'; await this.startBooking(); }
          else { view = 'list'; await Promise.all([this.loadList(), this.loadStaff()]); }
        }
        if (!this.direct && (view === 'lead' || view === 'book')) {
          await Promise.all([this.loadLead(id), this.loadStaff()]);
          if (!this.lead || (view === 'book' && !this.canBook(this.lead))) view = this.lead ? 'lead' : 'list';
          if (view === 'list') await this.loadList();
          if (view === 'lead') { this.upd = { assignedToUid: this.lead.assignedToUid || '', status: this.lead.status, note: '' }; this.okMsg = history.state?.okMsg || ''; }
          if (view === 'book') await this.startBooking();
        }
      } catch (e) { this.error = friendlyError(e, 'load the offline inquiries'); }
      this.view = view;
    },
    toLead(id, d) {
      return { id, ...d, assignedTo: d.assignedToName || '', loggedBy: d.loggedByName || '', created: isoOf(d.createdAt), updated: isoOf(d.updatedAt),
        history: d.history || [], contactName: '', phone: '', email: '' };
    },
    // Rules are not filters: Operations ask only for the inquiries assigned to them.
    async loadList() {
      const col = collection(db, 'offlineInquiries');
      const snap = await getDocs(SEE_ALL.includes(me.role) ? query(col, orderBy('createdAt', 'desc'), limit(LIST_LIMIT))
        : query(col, where('assignedToUid', '==', me.user.uid), limit(LIST_LIMIT)));
      const leads = snap.docs.map(d => this.toLead(d.id, d.data()));
      // Names only for the rows this person may see (one small read each).
      const priv = await Promise.all(leads.map(ld => this.canSeeContact(ld) ? privateOf(doc(db, 'offlineInquiries', ld.id)).catch(() => ({})) : {}));
      leads.forEach((ld, i) => Object.assign(ld, priv[i]));
      this.leads = leads;
    },
    // Operations members to assign to: active staff records with the operations role (Directors only).
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
      // Tenant and booking: IT has no access to these, so the page simply shows less.
      const [t, b] = await Promise.all([
        ld.tenantId ? getDoc(doc(db, 'tenants', ld.tenantId)).catch(() => null) : null,
        ld.bookingId ? getDoc(doc(db, 'offlineBookings', ld.bookingId)).catch(() => null) : null
      ]);
      if (t?.exists()) {
        this.tenant = { id: t.id, ...t.data(), ...(see ? await privateOf(doc(db, 'tenants', t.id)).catch(() => ({})) : {}) };
        this.tenantStays = await getCountFromServer(query(collection(db, 'offlineBookings'), where('tenantId', '==', t.id)))
          .then(c => c.data().count).catch(() => 0);
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
    // Directors and Finance see every inquiry's contact details; otherwise only the person who logged it and the assignee.
    canSeeContact(ld) { return CONTACT_ALL.includes(me.role) || ld.loggedByUid === me.user.uid || ld.assignedToUid === me.user.uid; },
    // A tenant's details are changed only by Directors and Finance (Operations add to them only through Create booking).
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
      } catch (e) { this.error = friendlyError(e, 'assign the inquiry'); }
      this.busy = false;
    },
    async saveNew() {
      const f = this.form;
      if (!f.lookingFor.trim()) return this.formError = 'Say what they are looking for, e.g. Monthly rental, 2 bedrooms, Ampang.';
      if (!f.contactName.trim() && !f.phone.trim()) return this.formError = 'Add a name or phone number so Operations can follow up.';
      if (!emailOk(f.email.trim())) return this.formError = 'That email address doesn\'t look right. Check it or leave it empty.';
      this.busy = true; this.formError = '';
      try {
        const known = await findTenant(f.phone);
        const who = this.canAssign ? this.staff.find(s => s.uid === f.assignedTo) || null : null;
        const h = this.entry(`Logged the inquiry${who ? `, assigned to ${who.name}` : ''}${known ? `, linked to existing tenant ${known.id}` : ''}.${f.note.trim() ? ' ' + f.note.trim() : ''}`);
        // One transaction: the next LD number (counters/offlineInquiries), the inquiry, its private part and the audit entry.
        const id = await runTransaction(db, async tx => {
          const cRef = doc(db, 'counters', 'offlineInquiries');
          const c = await tx.get(cRef);
          const n = c.exists() ? c.data().next || 1 : 1, id = num('LD', n), ref = doc(db, 'offlineInquiries', id);
          if ((await tx.get(ref)).exists()) throw stop(`${id} already exists. Ask a Director to check counters/offlineInquiries.`);
          tx.set(cRef, { next: n + 1 });
          tx.set(ref, { lookingFor: f.lookingFor.trim(), source: f.source, budget: f.budget.trim(), viewing: f.viewing, status: f.status,
            assignedToUid: who?.uid || null, assignedToName: who?.name || null, loggedByUid: me.user.uid, loggedByName: me.name,
            tenantId: known?.id || null, bookingId: null, history: [h], createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
          tx.set(doc(ref, 'private', 'main'), { contactName: f.contactName.trim(), phone: f.phone.trim(), phoneKey: phoneKey(f.phone), email: f.email.trim() });
          audit(tx, me, { action: 'offlineInquiry.create', entity: `offlineInquiries/${id}`,
            changes: [{ field: 'status', old: null, new: f.status }, ...(who ? [{ field: 'assignedTo', old: null, new: who.name }] : [])] });
          return id;
        });
        this.okMsg = `${id} logged${who ? ` and assigned to ${who.name}` : ''}.`; this.go('list');
      } catch (e) { this.formError = errText(e, 'save the inquiry'); }
      this.busy = false;
    },
    async saveUpdate() {
      const ld = this.lead, u = this.upd, parts = [];
      const who = this.staff.find(s => s.uid === u.assignedToUid) || null;
      const reassign = this.canAssign && (u.assignedToUid || '') !== (ld.assignedToUid || '');
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

    // Create booking: fill from the inquiry, or from the existing tenant with the same phone number.
    bookBack() { if (this.direct) this.$router.push('/Portfolio/bookings'); else this.go('lead', this.lead.id); },
    async startBooking() {
      const ld = this.lead || { contactName: '', phone: '', email: '' };
      this.bk = { name: ld.contactName, phone: ld.phone, email: ld.email, icPassport: '', nationality: 'Malaysian', existing: null,
        propertyId: '', unitId: '', arrival: '', departure: '', amount: '', monthlyRent: '', paymentRef: '', ezeeNo: '', note: '' };
      await this.refill();
      try { this.properties = await loadProperties(); } catch { this.properties = []; this.formError = 'Could not load the property list. Check your connection and reload.'; }
    },
    async refill(typed = false) {
      const phone = this.bk.phone;
      const t = this.lead?.tenantId ? this.tenant : await findTenant(phone).catch(() => null);
      if (typed && this.bk.phone !== phone) return;
      this.bk.existing = t || null;
      if (t) Object.assign(this.bk, { name: t.name || this.bk.name, email: t.email || this.bk.email, icPassport: t.icPassport || '', nationality: t.nationality || this.bk.nationality });
    },
    async loadUnitList() {
      this.bk.unitId = ''; this.units = [];
      if (!this.bk.propertyId) return;
      try { this.units = await loadUnits(this.bk.propertyId); } catch { this.formError = 'Could not load the units. Check your connection and try again.'; }
    },
    async saveBooking() {
      const b = this.bk, ld = this.lead;
      const err = !b.name.trim() ? 'Add the tenant\'s name.'
        : phoneKey(b.phone).length < 9 ? 'Add a full phone number. It is how a returning tenant is recognised.'
        : !emailOk(b.email.trim()) ? 'That email address doesn\'t look right.'
        : !b.icPassport.trim() ? 'Add the IC or passport number.'
        : !b.unitId ? 'Choose the property and unit.'
        : !b.arrival || !b.departure ? 'Add the check-in and check-out dates.'
        : this.nights <= 0 ? 'Check-out must be after check-in.'
        : this.longTerm && !(+b.monthlyRent > 0) ? 'Add the monthly rent. The 2-month deposit is worked out from it.'
        : !this.longTerm && !(+b.amount > 0) ? 'Add the total paid.' : '';
      if (err) { this.formError = err; window.scrollTo(0, 0); return; }
      if (this.direct) return this.saveDirect();

      this.busy = true; this.formError = '';
      try {
        const prop = this.properties.find(p => p.id === b.propertyId), unit = this.units.find(u => u.id === b.unitId);
        const details = { kind: 'tenant', name: b.name.trim(), phone: b.phone.trim(), phoneKey: phoneKey(b.phone), email: b.email.trim(),
          icPassport: b.icPassport.trim(), nationality: b.nationality.trim(), searchWords: searchWords(b.name) };
        // The tenant this booking goes to: the inquiry's own, or a returning one with the same phone number.
        const known = this.lead.tenantId ? this.tenant : await findTenant(b.phone);
        const bookingId = `offline_${ld.id}`, unitCode = unit?.unitCode || '';
        const lRef = doc(db, 'offlineInquiries', ld.id), bRef = doc(db, 'offlineBookings', bookingId), cRef = doc(db, 'counters', 'tenants');
        // One transaction: tenant number, tenant + private, booking, inquiry (booked) and the audit entry.
        // It refuses if offline_LD-xxxx already exists, so the same inquiry can't be booked twice.
        const res = await runTransaction(db, async tx => {
          if ((await tx.get(bRef)).exists()) throw stop(`${ld.id} already has a booking.`);
          const ls = await tx.get(lRef);
          if (!ls.exists() || ls.data().bookingId) throw stop(`${ld.id} already has a booking.`);
          let tenantId = known?.id, n = 0;
          if (!known) {
            const c = await tx.get(cRef);
            n = c.exists() ? c.data().next || 1 : 1; tenantId = num('TEN', n);
            if ((await tx.get(doc(db, 'tenants', tenantId))).exists()) throw stop(`${tenantId} already exists. Ask a Director to check counters/tenants.`);
          }
          const tRef = doc(db, 'tenants', tenantId);
          if (known) tx.update(tRef, { status: 'active', lastInquiryId: ld.id, updatedAt: serverTimestamp(), updatedBy: me.user.uid });
          else {
            tx.set(cRef, { next: n + 1 });
            tx.set(tRef, { status: 'active', firstInquiryId: ld.id, lastInquiryId: ld.id, createdAt: serverTimestamp(), createdBy: me.user.uid, createdByName: me.name });
          }
          tx.set(doc(tRef, 'private', 'main'), details, { merge: true });
          tx.set(bRef, { source: 'offline', inquiryId: ld.id, tenantId,
            propertyId: b.propertyId, propertyName: prop?.name || '', unitId: b.unitId, unitCode,
            arrival: b.arrival, departure: b.departure, nights: this.nights, longTerm: this.longTerm,
            amount: this.longTerm ? 0 : toCents(b.amount), monthlyRent: this.longTerm ? toCents(b.monthlyRent) : 0, deposit: this.longTerm ? this.deposit : 0,
            paymentRef: b.paymentRef.trim(), ezeeReservationNo: b.ezeeNo.trim(), status: 'active',
            createdAt: serverTimestamp(), createdBy: me.user.uid, createdByName: me.name });
          const h = this.entry(`Paid and booked: ${unitCode || 'unit'}, ${this.full(b.arrival)} to ${this.full(b.departure)}. `
            + `${!known ? `Saved as new tenant ${details.name} (${tenantId}).` : `Added to existing tenant ${details.name} (${tenantId}).`}${b.note.trim() ? ' ' + b.note.trim() : ''}`);
          tx.update(lRef, { status: 'booked', tenantId, bookingId, updatedAt: serverTimestamp(), history: arrayUnion(h) });
          tx.set(doc(lRef, 'private', 'main'), { contactName: details.name, phone: details.phone, phoneKey: details.phoneKey, email: details.email }, { merge: true });
          audit(tx, me, { action: 'offlineBooking.create', entity: `offlineBookings/${bookingId}`, propertyId: b.propertyId,
            changes: [{ field: 'status', old: ld.status, new: 'booked' }, { field: 'tenantId', old: null, new: tenantId }, { field: 'unitId', old: null, new: b.unitId }] });
          return { isNew: !known };
        });
        this.okMsg = `${ld.id} booked. ${res.isNew ? `New tenant ${details.name} saved.` : `Added to tenant ${details.name}.`}`;
        this.go('lead', ld.id);
      } catch (e) { this.formError = errText(e, 'save the booking'); window.scrollTo(0, 0); }
      this.busy = false;
    },
    // + New booking from Portfolio: no inquiry. One transaction: booking number (counters/offlineBookings), tenant number if new,
    // tenant + private, booking and the audit entry.
    async saveDirect() {
      const b = this.bk;
      this.busy = true; this.formError = '';
      try {
        const prop = this.properties.find(p => p.id === b.propertyId), unit = this.units.find(u => u.id === b.unitId);
        const details = { kind: 'tenant', name: b.name.trim(), phone: b.phone.trim(), phoneKey: phoneKey(b.phone), email: b.email.trim(),
          icPassport: b.icPassport.trim(), nationality: b.nationality.trim(), searchWords: searchWords(b.name) };
        const known = await findTenant(b.phone), unitCode = unit?.unitCode || '';
        const bcRef = doc(db, 'counters', 'offlineBookings'), tcRef = doc(db, 'counters', 'tenants');
        const res = await runTransaction(db, async tx => {
          const bc = await tx.get(bcRef), bn = bc.exists() ? bc.data().next || 1 : 1, bookingId = `offline_${num('BK', bn)}`;
          const bRef = doc(db, 'offlineBookings', bookingId);
          if ((await tx.get(bRef)).exists()) throw stop(`${bookingId} already exists. Ask a Director to check counters/offlineBookings.`);
          let tenantId = known?.id, n = 0;
          if (!known) {
            const c = await tx.get(tcRef);
            n = c.exists() ? c.data().next || 1 : 1; tenantId = num('TEN', n);
            if ((await tx.get(doc(db, 'tenants', tenantId))).exists()) throw stop(`${tenantId} already exists. Ask a Director to check counters/tenants.`);
          }
          const tRef = doc(db, 'tenants', tenantId);
          tx.set(bcRef, { next: bn + 1 });
          if (known) tx.update(tRef, { status: 'active', lastBookingId: bookingId, updatedAt: serverTimestamp(), updatedBy: me.user.uid });
          else {
            tx.set(tcRef, { next: n + 1 });
            tx.set(tRef, { status: 'active', firstInquiryId: null, lastBookingId: bookingId, createdAt: serverTimestamp(), createdBy: me.user.uid, createdByName: me.name });
          }
          tx.set(doc(tRef, 'private', 'main'), details, { merge: true });
          tx.set(bRef, { source: 'direct', inquiryId: null, tenantId,
            propertyId: b.propertyId, propertyName: prop?.name || '', unitId: b.unitId, unitCode,
            arrival: b.arrival, departure: b.departure, nights: this.nights, longTerm: this.longTerm,
            amount: this.longTerm ? 0 : toCents(b.amount), monthlyRent: this.longTerm ? toCents(b.monthlyRent) : 0, deposit: this.longTerm ? this.deposit : 0,
            paymentRef: b.paymentRef.trim(), ezeeReservationNo: b.ezeeNo.trim(), note: b.note.trim(), status: 'active',
            createdAt: serverTimestamp(), createdBy: me.user.uid, createdByName: me.name });
          audit(tx, me, { action: 'offlineBooking.create', entity: `offlineBookings/${bookingId}`, propertyId: b.propertyId,
            changes: [{ field: 'tenantId', old: null, new: tenantId }, { field: 'unitId', old: null, new: b.unitId }] });
          return { isNew: !known, bookingId };
        });
        const okMsg = `${res.bookingId} saved. ${res.isNew ? `New tenant ${details.name} saved.` : `Added to tenant ${details.name}.`} Key it into eZee to block the room.`;
        this.$router.push({ path: '/Portfolio/bookings', state: { okMsg } });
      } catch (e) { this.formError = errText(e, 'save the booking'); window.scrollTo(0, 0); }
      this.busy = false;
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
    .form-card .card-head h2 { margin: 0; }
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
    .ten-id { font-size: 11px; color: var(--muted); }
    .wrap { overflow-wrap: anywhere; }
    .pill.accent { background: var(--accent-soft); color: var(--accent); }
    .readonly { display: flex; align-items: center; background: var(--chip); color: var(--text); }
    .ezee-add { padding-top: 8px; font-size: 13px; }
    .ezee-add label { display: block; color: var(--text-2); margin-bottom: 6px; }
    .ezee-add div { display: flex; gap: 8px; }
    .ezee-add .input { flex: 1; min-width: 0; }
    .head-tools { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    @media (max-width: 640px) { .status-opts { grid-template-columns: minmax(0,1fr); } }
</style>
