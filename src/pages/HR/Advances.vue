<template>
  <div>
    <div class="notice error" v-show="error && tab !== 'mine'">{{ error }}</div>

    <!-- Requests -->
    <section class="card" v-show="tab === 'requests'">
      <div class="card-head"><h2>Requests</h2>
        <span class="head-r"><span class="help">{{ `${list.filter(a => a.status === 'submitted').length} waiting` }}</span>
          <button class="btn btn-primary" type="button" v-if="isHR" @click="openNew()">New form</button></span></div>
      <div class="list-tools">
        <div class="search-box">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          <input class="input" type="search" v-model="q" placeholder="Search ref or name" aria-label="Search ref or name">
        </div>
        <OptionPicker v-model="filter" :options="filterOptions" label="Status" />
      </div>
      <div class="loading-bar" v-show="loading"></div>
      <Paged :items="shown()" v-slot="{ pageRows }">
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Ref</th><th>Sent</th><th>Staff</th><th class="num">Amount</th><th>Status</th><th></th></tr></thead>
            <tbody>
              <tr class="clickable" v-for="a in pageRows" :key="a.id" @click="open(a)">
                <td>{{ a.ref }}</td><td>{{ day(a.createdAt) }}</td>
                <td><span class="who-cell"><Avatar :uid="a.uid" :name="a.name" :size="24" />{{ a.name }}<span class="by-hr" v-if="a.byHR">Made by HR</span></span></td>
                <td class="num">{{ rm(a.approvedAmount ?? a.amount) }}</td>
                <td><span class="pill" :class="st(a)[2]">{{ st(a)[0] }}</span></td>
                <td class="num"><button class="editlink" @click.stop="open(a)">Open</button></td>
              </tr>
              <tr v-show="!loading && !shown().length"><td colspan="7" class="muted">{{ q.trim() ? `Nothing matches "${q.trim()}".` : 'No requests here.' }}</td></tr>
            </tbody>
          </table>
        </div>
      </Paged>
      <p class="help" style="margin-top:12px">{{ isHR ? 'Open a request to review it, approve it once signed, or mark it paid.' : 'View only: HR moves requests on.' }} Salaries and IC numbers are set on Staff accounts &gt; <RouterLink to="/Settings/staff-hr">HR details</RouterLink>. Nothing here is deleted.</p>
    </section>

    <!-- Signature -->
    <section class="card" v-if="tab === 'signature'">
      <div class="card-head"><h2>Signature on the forms</h2><span class="help">{{ sig ? `Last changed by ${sig.updatedByName || '—'} · ${day(sig.updatedAt)}` : 'Not added yet' }}</span></div>
      <div class="loading-bar" v-show="sigLoading"></div>
      <p class="help" style="margin-top:0">Reviewing a request puts this signature, with the name below, on the form automatically. Changing it later doesn't change forms already made.</p>
      <div class="sig-box">
        <img v-if="sigImage || sig?.image" :src="sigImage ? sigImage.data : sig.image" alt="Saved signature">
        <span v-else class="muted">No signature saved yet.</span>
      </div>
      <div class="field"><label for="sigName" class="req">Name printed under the signature</label>
        <input class="input" id="sigName" v-model="sigName" maxlength="100" placeholder="Miss Chloe"></div>
      <div class="field"><label>Signature image</label>
        <ImageDrop v-model="sigImage" label="Signature image" :disabled="busy" hint="A clear photo or scan of the signature on white paper. JPG or PNG." @error="sigErr = $event" /></div>
      <div class="notice error" v-show="sigErr">{{ sigErr }}</div>
      <div class="actions"><button class="btn btn-primary" :disabled="busy" @click="saveSig()">{{ busy ? 'Saving…' : 'Save signature' }}</button></div>
    </section>

    <!-- Signature log (Directors) -->
    <section class="card" v-if="tab === 'log'">
      <div class="card-head"><h2>Forms carrying the signature</h2><span class="help">{{ `${uses.length} form${uses.length === 1 ? '' : 's'}` }}</span></div>
      <div class="loading-bar" v-show="logLoading"></div>
      <Paged :items="uses" v-slot="{ pageRows }">
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>When</th><th>Request</th><th>Staff</th><th>Signature of</th><th>Made by</th></tr></thead>
            <tbody>
              <tr v-for="u in pageRows" :key="u.id"><td>{{ stamp(u.at) }}</td><td>{{ u.ref }}</td><td>{{ u.staffName }}</td><td>{{ u.signerName }}</td><td>{{ u.createdByName }}</td></tr>
              <tr v-show="!logLoading && !uses.length"><td colspan="5" class="muted">No forms made yet.</td></tr>
            </tbody>
          </table>
        </div>
      </Paged>
    </section>

    <!-- One request -->
    <!-- New form (5 Nov 2026): HR makes the form for a staff member and downloads it for WhatsApp; they sign on paper -->
    <div class="modal-back" v-if="nf.open" @click.self="closeNew()" v-esc="() => closeNew()">
      <form class="modal" role="dialog" aria-label="New salary advance form" style="max-width:560px;width:calc(100% - 32px)" @submit.prevent="createForm()">
        <h2>New salary advance form</h2>
        <p class="help" style="margin-top:0">Makes the form with {{ signer }}'s signature and downloads the PDF to send on WhatsApp. The staff member signs the paper copy; when it comes back, open the request and mark it signed outside the PMS.</p>
        <div class="loading-bar" v-show="nf.loading"></div>
        <div class="field"><label class="req">Staff member</label>
          <OptionPicker class="op-full" v-model="nf.uid" searchable :options="nf.staff.map(s => ({ value: s.id, label: s.dept ? `${s.name} · ${s.dept}` : s.name }))" label="Staff member" :placeholder="nf.loading ? 'Loading…' : 'Pick a staff member'" />
          <span class="help">Only staff with IC and salary on HR details. Interns are not listed.</span></div>
        <div class="field"><label for="nfAmt" class="req">Total (RM)</label>
          <input class="input" id="nfAmt" type="number" min="1" step="0.01" :max="nfLimit || null" v-model="nf.amount" placeholder="e.g. 500">
          <span class="help" v-if="nfStaff">{{ `Up to ${rm(nfLimit)} (50% of the salary)` }}</span></div>
        <div class="field"><label for="nfWhy" class="req">Reason</label>
          <input class="input" id="nfWhy" maxlength="1000" v-model="nf.reason" placeholder="e.g. Car repair"></div>
        <div class="field"><label for="nfDsc">Description</label>
          <textarea class="input" id="nfDsc" rows="4" maxlength="1000" v-model="nf.desc" placeholder="Details printed on the form (optional)"></textarea></div>
        <label class="check"><input type="checkbox" v-model="nf.told"><span>{{ signer }} has been told</span></label>
        <div class="notice error" v-show="nf.err">{{ nf.err }}</div>
        <div class="modal-foot">
          <button class="btn" type="button" @click="closeNew()">Cancel</button>
          <button class="btn btn-primary" type="submit" :disabled="busy || !nf.uid || !nf.told">{{ busy ? 'Making the form…' : 'Create and download PDF' }}</button>
        </div>
      </form>
    </div>

    <div class="modal-back" v-if="sel" @click.self="sel = null" v-esc="() => { sel = null }">
      <div class="modal cp-modal" role="dialog" aria-label="Salary advance">
        <!-- Restyled 5 Nov 2026: title + status, four figures, then the request (left) and HR's next step, notes and history (right).
             One scroll for the whole window. Phones: Next step first. -->
        <div class="sa-head">
          <Avatar :uid="sel.uid" :name="sel.name" :size="40" />
          <div class="sa-title">
            <h2>{{ sel.name }}</h2>
            <div class="sa-sub"><span>{{ sel.ref }}</span><span>{{ (sel.byHR ? 'Made by HR ' : 'Sent ') + day(sel.createdAt) }}</span><span v-if="dept">{{ 'Dept: ' + dept }}</span></div>
          </div>
          <button type="button" class="btn btn-sm" :class="{ on: histOpen }" @click="histOpen = !histOpen">{{ `History (${(sel.history || []).length})` }}</button>
          <span class="pill sa-pill" :class="st(sel)[2]">{{ st(sel)[0] }}</span>
          <button type="button" class="cp-x" aria-label="Close" @click="sel = null">×</button>
        </div>
        <div class="notice error" v-show="actErr">{{ actErr }}</div>

        <div class="sa-body">
          <div class="sa-figs">
            <div class="sa-fig"><span>{{ sel.approvedAmount != null ? 'Approved' : 'Amount asked' }}</span><b>{{ rm(sel.approvedAmount ?? sel.amount) }}</b><small v-if="sel.approvedAmount != null && sel.approvedAmount !== sel.amount">{{ 'Asked ' + rm(sel.amount) }}</small></div>
            <div class="sa-fig"><span>Limit (50%)</span><b>{{ hr ? rm(limitOf(hr.salary)) : '—' }}</b></div>
            <div class="sa-fig"><span>Monthly salary</span><b>{{ hr ? rm(hr.salary) : '—' }}</b></div>
          </div>
          <p class="help" v-if="!hr && !fuLoading" style="margin:0 0 12px">No HR details for this person yet (Staff accounts &gt; HR details).</p>

          <!-- Progress (5 Nov 2026): each step with its date and who did it, the current one highlighted -->
          <ol class="sa-steps" :style="{ gridTemplateColumns: `repeat(${steps(sel).length}, minmax(0, 1fr))` }">
            <li v-for="s in steps(sel)" :key="s.key" :class="[s.state, sel.status]">
              <span class="dot"><svg v-if="s.state === 'done'" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg><template v-else-if="s.state === 'stop'">×</template></span>
              <b>{{ s.label }}</b>
              <small v-if="s.sub">{{ s.sub }}</small>
            </li>
          </ol>

          <div class="sa-split">
            <!-- Left: the request and HR notes -->
            <div class="sa-col">
              <section class="sa-card">
                <h3>Request</h3>
                <div class="detail">{{ sel.reason }}</div>
                <div class="field" v-if="sel.description"><label>Description</label><div class="detail">{{ sel.description }}</div></div>
              </section>

              <!-- HR notes on the left, under the request (Khairul, 5 Nov 2026) -->
              <section class="sa-card" v-if="isHR || isDirector">
                <h3>HR notes <span class="only">Only HR and Directors</span></h3>
                <div class="loading-bar" v-show="fuLoading"></div>
                <div class="msgs" v-if="notes.length">
                  <div class="msg note" v-for="n in notes" :key="n.id || n.text"><div class="who"><Avatar :uid="n.byUid" :name="n.byName" role="hr" :size="18" />{{ n.byName || 'HR' }}<span class="when">{{ stamp(n.createdAt) }}</span></div><div class="txt">{{ n.text }}</div></div>
                </div>
                <p class="help" v-else-if="!fuLoading" style="margin:0">No notes yet.</p>
                <div class="compose" v-if="isHR && sel.uid !== myUid">
                  <textarea class="input" v-model="noteText" maxlength="1000" placeholder="e.g. Checked: no advance outstanding" aria-label="HR note"></textarea>
                  <button class="btn" :disabled="busy || !noteText.trim()" @click="note()">Add note</button>
                </div>
              </section>
            </div>

            <!-- Right: what happens next (or how it ended), then the documents -->
            <div class="sa-col sa-side">
              <template v-if="canAct">
                <section class="sa-card next" v-if="sel.status === 'submitted'">
                  <h3><span class="next-tag">Next step</span>Review</h3>
                  <p class="help">Makes the form with {{ signer }}'s signature and asks the staff member to sign it.</p>
                  <div class="field"><label for="apAmt" class="req">Amount to approve (RM)</label>
                    <input class="input" id="apAmt" type="number" min="1" step="0.01" v-model="apAmount"></div>
                  <div class="field"><label for="apNote">Note on the form (optional, printed)</label>
                    <textarea class="input" id="apNote" maxlength="1000" v-model="apNote" placeholder="e.g. Deducted in full from the December salary"></textarea></div>
                  <label class="check"><input type="checkbox" v-model="apTold"><span><b>{{ `${signer} has been told` }}</b><small>Saved with your name and the time. Her signature goes on the form automatically.</small></span></label>
                  <div class="reject-box" v-if="rjOpen">
                    <label for="rjWhy" class="req">Reason for rejecting (the staff member sees it)</label>
                    <textarea class="input" id="rjWhy" maxlength="1000" v-model="rjReason" placeholder="e.g. An advance is still being repaid"></textarea>
                    <div class="row-btns"><button class="btn" @click="rjOpen = false; rjReason = ''">Cancel</button><button class="btn danger" :disabled="busy || !rjReason.trim()" @click="reject()">Confirm reject</button></div>
                  </div>
                  <div class="row-btns split" v-else>
                    <button class="btn btn-reject" :disabled="busy" @click="rjOpen = true">Reject</button>
                    <button class="btn btn-primary" :disabled="busy || !apTold" @click="review()">Send to staff to sign</button>
                  </div>
                </section>
                <section class="sa-card next" v-if="sel.status === 'reviewed'">
                  <h3><span class="next-tag wait">Waiting</span>Staff signature</h3>
                  <p class="help" v-if="sel.byHR">HR made this form: send the PDF (Documents) to the staff member on WhatsApp. When the signed copy comes back, upload it here and mark it signed.</p>
                  <p class="help" v-else>The staff member signs in the PMS. If they signed the paper form instead, upload the fully signed document and mark it signed.</p>
                  <ImageDrop v-model="outImg" pdf-only label="Fully signed document" :disabled="busy" @error="actErr = $event" />
                  <div class="row-btns end"><button class="btn btn-primary" :disabled="busy || !outImg" @click="outside()">Mark signed outside the PMS</button></div>
                </section>
                <section class="sa-card next" v-if="sel.status === 'signed'">
                  <h3><span class="next-tag">Next step</span>Approve</h3>
                  <p class="help">Check the staff member's signature under Documents, then approve. It moves to Pending payment.</p>
                  <div class="reject-box" v-if="rjOpen">
                    <label for="rjWhy2" class="req">Reason for rejecting (the staff member sees it)</label>
                    <textarea class="input" id="rjWhy2" maxlength="1000" v-model="rjReason" placeholder="e.g. The signature doesn't match"></textarea>
                    <div class="row-btns"><button class="btn" @click="rjOpen = false; rjReason = ''">Cancel</button><button class="btn danger" :disabled="busy || !rjReason.trim()" @click="reject()">Confirm reject</button></div>
                  </div>
                  <div class="row-btns split" v-else>
                    <button class="btn btn-reject" :disabled="busy" @click="rjOpen = true">Reject</button>
                    <button class="btn btn-primary" :disabled="busy" @click="approve()">Approve</button>
                  </div>
                </section>
                <section class="sa-card next" v-if="sel.status === 'approved'">
                  <h3><span class="next-tag">Next step</span>Payment</h3>
                  <div class="grid2">
                    <div class="field"><label class="req">Payment type</label>
                      <OptionPicker v-model="payType" :options="Object.entries(PAY_TYPES).map(([value, label]) => ({ value, label }))" label="Payment type" placeholder="Pick one" /></div>
                    <div class="field"><label for="pdDate" class="req">Date paid</label><input class="input" id="pdDate" type="date" v-model="paidDate"></div>
                  </div>
                  <div class="field"><label class="req">Payment screenshot</label>
                    <ImageDrop v-model="payImg" paste label="Payment screenshot" :disabled="busy" hint="For the record: only HR and Directors see it." @error="actErr = $event" /></div>
                  <div class="row-btns end"><button class="btn btn-primary" :disabled="busy || !payType || !paidDate || !payImg" @click="paid()">Mark paid</button></div>
                </section>
              </template>
              <p class="sa-card help own" v-else-if="isHR && sel.uid === myUid && !ended(sel)">This is your own request: another HR person moves it on.</p>

              <section class="sa-card done" :class="sel.status" v-if="ended(sel)">
                <h3><span class="next-tag" :class="sel.status">{{ st(sel)[0] }}</span>{{ doneTitle(sel) }}</h3>
                <p class="help" v-if="doneSub(sel)">{{ doneSub(sel) }}</p>
                <div class="detail reject" v-if="sel.status === 'rejected' && sel.rejectReason">{{ sel.rejectReason }}</div>
              </section>

              <!-- The form, how the staff member signed, the fully signed copy and (HR/Directors only) the payment screenshot -->
              <section class="sa-card" v-if="hasForm(sel)">
                <h3>Documents</h3>
                <div class="docs">
                  <button class="doc" :disabled="busy" @click="pdf()"><span class="doc-ic">PDF</span>Salary advance form</button>
                  <button class="doc" v-if="signed?.image" :disabled="busy" @click="save(signed.image, signed.method === 'drawn' ? 'staff signature' : 'staff signed copy')"><span class="doc-ic">{{ fileKind(signed.image) }}</span>{{ signed.method === 'drawn' ? 'Staff signature' : "Staff's uploaded copy" }}</button>
                  <button class="doc" v-if="payment?.image" :disabled="busy" @click="save(payment.image, 'payment')"><span class="doc-ic">IMG</span>Payment screenshot</button>
                  <template v-if="['signed', 'approved', 'paid'].includes(sel.status)">
                    <div class="doc-row" v-if="copy?.image">
                      <button class="doc" :disabled="busy" @click="save(copy.image, 'fully signed')"><span class="doc-ic">{{ fileKind(copy.image) }}</span>Fully signed document<small>{{ (copy.byName || 'HR') + ' · ' + day(copy.at) }}</small></button>
                      <button type="button" class="link-btn" v-if="canAct && !copyOpen" :disabled="busy" @click="copyOpen = true">Replace</button>
                    </div>
                    <div class="doc-row" v-else-if="canAct && !copyOpen">
                      <span class="doc missing"><span class="doc-ic grey">IMG</span>Fully signed document<small>Not added (optional)</small></span>
                      <button type="button" class="link-btn" :disabled="busy" @click="copyOpen = true">Add</button>
                    </div>
                    <div class="copy-add" v-if="canAct && copyOpen">
                      <ImageDrop v-model="copyImg" pdf-only label="Fully signed document" :disabled="busy" @error="actErr = $event" />
                      <div class="row-btns"><button class="btn" :disabled="busy" @click="copyOpen = false; copyImg = null">Cancel</button><button class="btn btn-primary" :disabled="busy || !copyImg" @click="saveCopy()">Save signed document</button></div>
                    </div>
                  </template>
                </div>
              </section>
            </div>
          </div>
        </div>

        <!-- History: behind the header button, a panel over the right side of the window -->
        <aside class="hist-panel" v-if="histOpen" aria-label="History">
          <div class="hist-head"><h3>History</h3><button type="button" class="cp-x" aria-label="Close history" @click="histOpen = false">×</button></div>
          <ol class="timeline">
            <li v-for="(h, i) in sel.history || []" :key="i" :class="{ last: i === (sel.history || []).length - 1 }">
              <b>{{ STEP[h.action] || h.action }}</b>
              <span class="when">{{ `${h.byName} · ${stamp(h.at)}` }}</span>
              <div class="help" v-if="h.note">{{ h.note }}</div>
            </li>
          </ol>
        </aside>
      </div>
    </div>
  </div>
</template>

<script>
// HR and Directors: every salary advance. HR moves them on (never their own); Directors read everything, keep the
// signature up to date if they want, and see the log of forms carrying the signature. Data: ./advances.js.
// Not a page of its own: SalaryAdvance.vue shows it under its Requests / Signature / Signature log tabs (prop tab).
import { fileKind, loadFormStaff, createByHR, watchAdvances, getStaffHR, getDept, reviewAdvance, markSignedOutside, uploadSignedCopy, approveAdvance, rejectAdvance, markPaid,
  loadForm, loadSigned, loadSignedCopy, loadPayment, loadNotes, addNote, loadSignature, saveSignature, loadSignatureUses, imageFile,
  limitOf, todayIso, STATUS, STEP, PAY_TYPES, SIGN_METHOD, DEFAULT_SIGNER } from './advances.js';
import { buildAdvancePdf, advanceFileName } from '@/lib/advance-pdf.js';
import { friendlyError, download } from '@/lib/finance-data.js';
import { rm, dmy } from '@/lib/format.js';
import { toast } from '@/lib/toast.js';
import { useSession } from '@/stores/session.js';
import OptionPicker from '@/components/OptionPicker.vue';
import Avatar from '@/components/Avatar.vue';
import ImageDrop from '@/components/ImageDrop.vue';

const me = useSession();
const FILTERS = [['all', 'All statuses'], ...Object.entries(STATUS).map(([k, v]) => [k, v[0]])];

import { liveMixin } from '@/lib/use-live.js';

export default {
  mixins: [liveMixin],
  components: { OptionPicker, Avatar, ImageDrop },
  props: { tab: { type: String, default: 'requests' } },
  data() {
    return {
      STATUS, STEP, PAY_TYPES, SIGN_METHOD, myUid: me.user.uid, isHR: me.role === 'hr', isDirector: me.role === 'director',
      list: [], loading: true, error: '', q: '', filter: 'all', sel: null, hr: null, dept: '', notes: [], fuLoading: false,
      busy: false, actErr: '', rjOpen: false, histOpen: false, noteText: '', apAmount: '', apNote: '', apTold: false, rjReason: '', paidDate: '', payType: '',
      signed: null, copy: null, payment: null, outImg: null, payImg: null, copyImg: null, copyOpen: false,
      sig: null, sigLoaded: false, sigLoading: false, sigName: DEFAULT_SIGNER, sigImage: null, sigErr: '',
      uses: [], logLoading: false,
      nf: { open: false, loading: false, staff: [], uid: '', amount: '', reason: '', desc: '', told: false, err: '' }
    };
  },
  computed: {
    filterOptions() { return FILTERS.map(([k, label]) => ({ value: k, label: `${label} (${k === 'all' ? this.list.length : this.list.filter(a => a.status === k).length})` })); },
    signer() { return this.sig?.signerName || DEFAULT_SIGNER; },
    canAct() { return this.isHR && this.sel && this.sel.uid !== this.myUid; },
    nfStaff() { return this.nf.staff.find(s => s.id === this.nf.uid) || null; },
    nfLimit() { return this.nfStaff ? limitOf(this.nfStaff.hr.salary) : 0; }
  },
  watch: {
    tab(t) { if (t === 'signature') this.sigErr = ''; if (t === 'log') this.openLog(); }
  },
  async mounted() {
    await this.load();
    this.loadSig();
    if (this.tab === 'log') this.openLog();
    // From a notification (?tab=requests&id=...): open that request
    const id = this.tab === 'requests' && this.$route.query.id, a = id && this.list.find(x => x.id === id);
    if (a) { this.filter = 'all'; this.open(a); }
  },
  methods: {
    rm, dmy, limitOf, fileKind,
    st(a) { return STATUS[a.status] || STATUS.submitted; },
    // Progress steps from the history: done (date, who), now, or where it stopped (rejected / withdrawn).
    steps(a) {
      const h = a.history || [];
      const last = keys => [...h].reverse().find(x => keys.includes(x.action));
      const short = x => (x && x.at && x.at.toDate) ? x.at.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
      const how = { drawn: 'on screen', upload: 'copy uploaded', outside: 'outside the PMS' };
      const defs = a.byHR ? [['made', ['hrCreated'], 'Made by HR'], ['signed', ['signed', 'signedOutside'], 'Signed'], ['approved', ['approved'], 'Approved'], ['paid', ['paid'], 'Paid']] : [['submitted', ['submitted'], 'Submitted'], ['reviewed', ['reviewed'], 'Reviewed'], ['signed', ['signed', 'signedOutside'], 'Signed'], ['approved', ['approved'], 'Approved'], ['paid', ['paid'], 'Paid']];
      const stop = ['rejected', 'withdrawn'].includes(a.status) ? last([a.status]) : null;
      let placed = false;
      return defs.map(([key, acts, label]) => {
        const x = last(acts);
        if (x) {
          let sub = short(x) + ' · ' + (x.byName || '');
          if (key === 'signed') sub = short(x) + ' · ' + (how[a.signMethod] || '');
          if (key === 'paid') sub = this.isoDay(a.paidDate, true) + ' · ' + (PAY_TYPES[a.paymentType] || '');
          return { key, label, sub, state: 'done' };
        }
        if (placed) return { key, label, sub: '', state: 'todo' };
        placed = true;
        if (stop) return { key, label: STATUS[a.status][0], sub: short(stop) + ' · ' + (stop.byName || ''), state: 'stop' };
        return { key, label, sub: 'Now', state: 'now' };
      });
    },
    ended(a) { return ['paid', 'rejected', 'withdrawn'].includes(a.status); },
    isoDay(iso, short) {
      if (!iso) return '';
      const d = new Date(iso + 'T00:00:00');
      return isNaN(d) ? iso : d.toLocaleDateString('en-GB', short ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
    },
    doneTitle(a) { return a.status === 'paid' ? rm(a.approvedAmount ?? a.amount) + ' paid' : a.status === 'rejected' ? 'Not approved' : 'Withdrawn by the staff member'; },
    doneSub(a) {
      const x = [...(a.history || [])].reverse().find(h => h.action === a.status);
      if (a.status === 'paid') return this.isoDay(a.paidDate) + ' by ' + (PAY_TYPES[a.paymentType] || '—') + (x && x.byName ? ' · marked by ' + x.byName : '');
      return x ? (x.byName || '') + ' · ' + this.stamp(x.at) : '';
    },
    hasForm(a) { return ['reviewed', 'signed', 'approved', 'paid'].includes(a.status); },
    day(t) { return t?.toDate ? t.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'; },
    stamp(t) { return t?.toDate ? t.toDate().toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Just now'; },
    // ---- New form ----
    async openNew() {
      Object.assign(this.nf, { open: true, uid: '', amount: '', reason: '', desc: '', told: false, err: '' });
      if (!this.sigLoaded) this.loadSig();
      this.nf.loading = true;
      try { this.nf.staff = await loadFormStaff(this.myUid); } catch (e) { this.nf.err = friendlyError(e, 'load the staff list'); }
      this.nf.loading = false;
    },
    closeNew() { if (!this.busy) this.nf.open = false; },
    async createForm() {
      this.busy = true; this.nf.err = '';
      try {
        const { id, form } = await createByHR(me, this.nfStaff, { amount: this.nf.amount, reason: this.nf.reason, description: this.nf.desc, told: this.nf.told, sig: this.sig });
        try { download(advanceFileName(form), new Blob([await buildAdvancePdf(form)], { type: 'application/pdf' })); }
        catch { toast('Form saved, but the PDF could not be made here. Open the request and download it from Documents.'); }
        this.nf.open = false; await this.load();
        toast(`${form.ref} made for ${form.name}. Send the PDF on WhatsApp.`);
        const a = this.list.find(x => x.id === id); if (a) this.open(a);
      } catch (e) { this.nf.err = e.code ? friendlyError(e, 'make the form') : e.message; }
      this.busy = false;
    },
    // Live (6 Nov 2026): new requests and status changes show without a refresh; the open request updates in place.
    // Resolves when the list first arrives; calling it again while it runs does nothing.
    load() {
      if (this.liveStops.list) return Promise.resolve();
      return new Promise(resolve => {
        this.liveUse('list', watchAdvances(rows => {
          const old = new Map(this.list.map(a => [a.id, a]));
          this.list = rows.map(r => { const o = old.get(r.id); return o ? Object.assign(o, r) : r; });
          this.loading = false; resolve();
        }, e => { this.error = e.friendly || friendlyError(e, 'load the requests'); this.loading = false; resolve(); }));
      });
    },
    shown() {
      const q = this.q.trim().toLowerCase();
      return this.list.filter(a => (this.filter === 'all' || a.status === this.filter) && (!q || [a.ref, a.name].some(v => String(v || '').toLowerCase().includes(q))));
    },
    async open(a) {
      Object.assign(this, { sel: a, hr: null, dept: '', notes: [], actErr: '', noteText: '', apAmount: a.approvedAmount ?? a.amount, apNote: '', apTold: false, rjReason: '',
        paidDate: todayIso(), payType: '', rjOpen: false, histOpen: false, signed: null, copy: null, payment: null, outImg: null, payImg: null, copyImg: null, copyOpen: false, fuLoading: true });
      const after = ['signed', 'approved', 'paid'].includes(a.status);
      try {
        const [hr, dept, notes, signed, copy, payment] = await Promise.all([getStaffHR(a.uid), getDept(a.uid).catch(() => ''), loadNotes(a.id),
          after ? loadSigned(a.id) : null, after ? loadSignedCopy(a.id) : null, a.status === 'paid' ? loadPayment(a.id) : null]);
        if (this.sel === a) Object.assign(this, { hr, dept, notes, signed, copy, payment });
      } catch (e) { this.actErr = friendlyError(e, 'load the details'); }
      this.fuLoading = false;
    },
    // Do one step, then reload the list and reopen the request with its new state
    async run(fn, what, done) {
      this.busy = true; this.actErr = '';
      try {
        await fn(); if (done) toast(done);
        const id = this.sel?.id; await this.load();
        const a = this.list.find(x => x.id === id); if (a && this.sel) this.open(a);
      } catch (e) { this.actErr = e.code ? friendlyError(e, what) : e.message; }
      this.busy = false;
    },
    review() {
      return this.run(async () => {
        if (!this.sigLoaded) await this.loadSig();
        await reviewAdvance(me, this.sel, { approvedAmount: this.apAmount, formNote: this.apNote, told: this.apTold, hr: this.hr, sig: this.sig, dept: this.dept });
      }, 'review it', `${this.sel.ref} reviewed. The staff member has been asked to sign.`);
    },
    outside() { return this.run(() => markSignedOutside(me, this.sel, this.outImg), 'mark it signed', `${this.sel.ref} marked signed outside the PMS.`); },
    saveCopy() { return this.run(() => uploadSignedCopy(me, this.sel, this.copyImg), 'save the signed document', 'Fully signed document saved.'); },
    approve() { return this.run(() => approveAdvance(me, this.sel), 'approve it', `${this.sel.ref} approved: pending payment.`); },
    reject() { return this.run(() => rejectAdvance(me, this.sel, this.rjReason), 'reject it', `${this.sel.ref} rejected.`); },
    paid() { return this.run(() => markPaid(me, this.sel, { paidDate: this.paidDate, paymentType: this.payType, im: this.payImg }), 'mark it paid', `${this.sel.ref} marked paid.`); },
    save(dataUrl, what) { const f = imageFile(dataUrl, `Salary Advance ${this.sel.ref} ${what}`); download(f.name, f.blob); },
    async note() {
      this.busy = true; this.actErr = '';
      try { this.notes.push(await addNote(me, this.sel, this.noteText)); this.noteText = ''; }
      catch (e) { this.actErr = e.code ? friendlyError(e, 'add the note') : e.message; }
      this.busy = false;
    },
    async pdf() {
      this.busy = true; this.actErr = '';
      try {
        const f = await loadForm(this.sel.id);
        if (!f) throw new Error('This request has no saved form.');
        download(advanceFileName(f), new Blob([await buildAdvancePdf(f, this.signed)], { type: 'application/pdf' }));
      } catch (e) { this.actErr = e.code ? friendlyError(e, 'make the PDF') : e.message; }
      this.busy = false;
    },

    // ---- Signature ----
    async loadSig() {
      this.sigLoading = true;
      try { this.sig = await loadSignature(); this.sigName = this.sig?.signerName || DEFAULT_SIGNER; this.sigLoaded = true; }
      catch (e) { this.sigErr = friendlyError(e, 'load the signature'); }
      this.sigLoading = false;
    },
    async saveSig() {
      this.busy = true; this.sigErr = '';
      try {
        await saveSignature(me, this.sig, { signerName: this.sigName, image: this.sigImage });
        this.sigImage = null; await this.loadSig(); toast('Signature saved.');
      } catch (e) { this.sigErr = e.code ? friendlyError(e, 'save the signature') : e.message; }
      this.busy = false;
    },
    async openLog() {
      this.logLoading = true;
      try { this.uses = await loadSignatureUses(); } catch (e) { this.error = friendlyError(e, 'load the signature log'); }
      this.logLoading = false;
    }
  }
};
</script>

<style scoped>
.list-tools { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 14px; }
.search-box { position: relative; flex: 1 1 260px; max-width: 420px; }
.search-box svg { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--muted); pointer-events: none; }
.search-box .input { width: 100%; padding-left: 36px; }
.who-cell { display: inline-flex; align-items: center; gap: 8px; }
/* Request window (restyled 5 Nov 2026) */
.cp-modal { max-width: 1060px; width: calc(100% - 32px); max-height: 90vh; display: flex; flex-direction: column; padding: 0; overflow: hidden; }
.sa-head { display: flex; align-items: center; gap: 12px; padding: 18px 20px 14px; border-bottom: 1px solid var(--border); }
.sa-title { flex: 1 1 auto; min-width: 0; }
.sa-title h2 { margin: 0; font-size: 18px; }
.sa-sub { display: flex; flex-wrap: wrap; gap: 0 14px; font-size: 12px; color: var(--muted); margin-top: 2px; }
.sa-pill { flex: none; }
.cp-x { flex: none; width: 36px; height: 36px; border: 0; border-radius: 8px; background: none; color: var(--muted); font-size: 24px; line-height: 1; cursor: pointer; }
.cp-x:hover { background: var(--hover); color: var(--text); }
.cp-modal > .notice { margin: 12px 20px 0; }
.sa-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 16px 20px 20px; scrollbar-width: thin; scrollbar-color: var(--border) transparent; }
.sa-figs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-bottom: 16px; }
.sa-fig { display: grid; gap: 2px; padding: 12px 14px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); }
.sa-fig span { font-size: 12px; color: var(--muted); }
.sa-fig b { font-size: 17px; }
.sa-fig small { font-size: 11px; color: var(--muted); }
.sa-split { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr); gap: 16px; align-items: start; }
.sa-col { display: grid; gap: 14px; min-width: 0; }
.sa-card { display: grid; gap: 10px; padding: 14px 16px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); min-width: 0; }
.sa-card h3 { font-size: 14px; margin: 0; display: flex; align-items: center; gap: 8px; }
.sa-card .field { margin: 0; }
.sa-card .kv { margin: 0; }
.sa-card textarea { min-height: 64px; }
.sa-card.next { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.sa-card.own { margin: 0; }
.head-r { display: flex; align-items: center; gap: 12px; }
.by-hr { margin-left: 8px; font-size: 11px; font-weight: 600; color: var(--muted); background: var(--chip); padding: 1px 8px; border-radius: 999px; white-space: nowrap; }
.sa-card.done.paid { border-color: var(--green, #1a7f4b); }
.sa-card.done.rejected { border-color: var(--red, #c0392b); }
.next-tag.paid { background: var(--green-soft, #e6f4ec); color: var(--green, #1a7f4b); }
.next-tag.rejected { background: var(--red-soft); color: var(--red, #c0392b); }
.next-tag.withdrawn { background: var(--chip); color: var(--muted); }
.sa-steps { list-style: none; margin: 0 0 16px; padding: 14px 8px 12px; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); border: 1px solid var(--border); border-radius: 12px; background: var(--surface); }
.sa-steps li { position: relative; display: grid; justify-items: center; align-content: start; gap: 3px; text-align: center; padding: 0 4px; min-width: 0; }
.sa-steps li::before { content: ''; position: absolute; top: 11px; left: -50%; width: 100%; height: 2px; background: var(--border); z-index: 0; }
.sa-steps li:first-child::before { display: none; }
.sa-steps li.done::before, .sa-steps li.now::before, .sa-steps li.stop::before { background: var(--accent); }
.sa-steps .dot { position: relative; z-index: 1; width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; font-size: 14px; font-weight: 700; background: var(--surface); border: 2px solid var(--border); color: var(--muted); }
.sa-steps li.done .dot { background: var(--accent); border-color: var(--accent); color: #fff; }
.sa-steps li.paid.done .dot { background: var(--green, #1a7f4b); border-color: var(--green, #1a7f4b); }
.sa-steps li.now .dot { border-color: var(--accent); box-shadow: 0 0 0 4px var(--accent-soft); }
.sa-steps li.stop .dot { background: var(--red, #c0392b); border-color: var(--red, #c0392b); color: #fff; }
.sa-steps li.stop.withdrawn .dot { background: var(--muted); border-color: var(--muted); }
.sa-steps b { font-size: 12px; font-weight: 600; }
.sa-steps li.todo b { color: var(--muted); font-weight: 500; }
.sa-steps li.now b { color: var(--accent); }
.sa-steps li.stop b { color: var(--red, #c0392b); }
.sa-steps li.stop.withdrawn b { color: var(--muted); }
.sa-steps small { font-size: 11px; color: var(--muted); line-height: 1.3; overflow-wrap: anywhere; }
.doc small { margin-left: auto; font-size: 11px; color: var(--muted); }
.doc-row { display: flex; align-items: center; gap: 8px; }
.doc-row .doc { flex: 1 1 auto; min-width: 0; }
.doc.missing { cursor: default; border-style: dashed; background: transparent; color: var(--muted); }
.doc.missing:hover { background: transparent; }
.doc-ic.grey { background: var(--chip); color: var(--muted); }
.link-btn { flex: none; border: 0; background: none; padding: 4px 6px; font: inherit; font-size: 13px; font-weight: 600; color: var(--accent); cursor: pointer; }
.link-btn:disabled { opacity: .5; cursor: default; }
.copy-add { display: grid; gap: 6px; }
.next-tag { font-size: 11px; font-weight: 600; color: var(--accent); background: var(--accent-soft); padding: 1px 8px; border-radius: 999px; }
.next-tag.wait { color: var(--amber); background: var(--amber-soft); }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
/* Reject sits in the Next step card, left of the main button; it opens the reason box in the same card */
.row-btns.split { justify-content: space-between; }
.btn-reject { color: var(--red); border-color: var(--red); background: transparent; }
.btn-reject:hover:not(:disabled) { background: var(--red-soft); }
.reject-box { display: grid; gap: 8px; padding: 12px; border-radius: 10px; background: var(--red-soft); }
.reject-box label { font-size: 13px; font-weight: 600; }
.reject-box textarea { min-height: 64px; background: var(--surface); }
/* History panel over the right side of the window */
.cp-modal { position: relative; }
.btn-sm { height: 30px; padding: 0 10px; font-size: 12px; flex: none; }
.btn-sm.on { background: var(--hover); }
.hist-panel { position: absolute; top: 0; right: 0; bottom: 0; width: min(360px, 100%); z-index: 5; display: flex; flex-direction: column; gap: 12px;
  padding: 16px 18px; background: var(--surface); border-left: 1px solid var(--border); box-shadow: -8px 0 24px rgba(0, 0, 0, 0.12); overflow-y: auto; }
.hist-head { display: flex; align-items: center; justify-content: space-between; }
.hist-head h3 { margin: 0; font-size: 15px; }
.docs { display: grid; gap: 8px; }
.doc { display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg); color: var(--text); font: inherit; font-size: 13px; text-align: left; cursor: pointer; }
.doc:hover { background: var(--hover); }
.doc-ic { flex: none; font-size: 10px; font-weight: 700; color: var(--accent); background: var(--accent-soft); padding: 3px 6px; border-radius: 6px; }
.timeline { list-style: none; margin: 0; padding: 0; display: grid; }
.timeline li { position: relative; padding: 0 0 14px 20px; font-size: 13px; display: grid; gap: 1px; }
.timeline li::before { content: ''; position: absolute; left: 3px; top: 5px; width: 9px; height: 9px; border-radius: 50%; background: var(--border); }
.timeline li::after { content: ''; position: absolute; left: 7px; top: 16px; bottom: 0; width: 1px; background: var(--border); }
.timeline li.last { padding-bottom: 0; }
.timeline li.last::before { background: var(--accent); }
.timeline li.last::after { display: none; }
@media (max-width: 860px) {
  .sa-figs { grid-template-columns: 1fr 1fr; }
  .sa-split { grid-template-columns: 1fr; }
  .sa-side { order: -1; }
}
@media (max-width: 560px) {
  .sa-steps small { display: none; }
}
.detail { white-space: pre-wrap; font-size: 13px; background: var(--hover); border: 1px solid var(--line); border-radius: 8px; padding: 12px; }
.detail.reject { background: var(--red-soft); border-color: transparent; }
.row-btns { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }
.check { display: flex; gap: 10px; align-items: flex-start; font-size: 13px; }
.check input { width: 16px; height: 16px; accent-color: var(--accent); margin-top: 2px; }
.op-full { display: block; width: 100%; }
.op-full :deep(.op-btn) { width: 100%; }
.op-full :deep(.op-val) { max-width: none; }
.op-full :deep(.op-pop) { width: 100%; max-width: none; }
.check small { display: block; color: var(--muted); font-size: 12px; }
.only { font-size: 11px; font-weight: 600; color: var(--amber); background: var(--amber-soft); padding: 1px 8px; border-radius: 999px; }
.msgs { display: grid; gap: 8px; }
.msg { padding: 10px 12px; border-radius: 10px; border: 1px solid var(--line); }
.msg.note { background: var(--amber-soft); }
.who { font-size: 11px; font-weight: 600; color: var(--text-2); display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 3px; }
.when { color: var(--muted); font-weight: 400; }
.txt { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 13px; }
.compose { display: grid; gap: 8px; }
.compose textarea { min-height: 64px; }
.compose .btn { justify-self: end; }
.sig-box { display: flex; align-items: center; justify-content: center; min-height: 120px; max-width: 420px; padding: 12px; margin-bottom: 14px; border: 1px dashed var(--border); border-radius: 10px; background: #fff; }
.sig-box img { max-width: 100%; max-height: 140px; }
.preview { max-width: 100%; max-height: 220px; border: 1px solid var(--border); border-radius: 8px; justify-self: start; }
</style>
