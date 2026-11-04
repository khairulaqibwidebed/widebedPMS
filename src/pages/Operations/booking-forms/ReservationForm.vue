<template>
  <div class="rf">
    <div class="loading-bar" v-show="loading || busy"></div>
    <div class="form-title">
      <h2>Reservation Lodgment Form</h2>
      <p class="sub" v-if="lead">{{ `From ${lead.id} · ${lead.lookingFor}. Saving marks the inquiry as paid and saves the customer as a tenant.` }}</p>
      <p class="sub" v-else>Log a booking: tenant, stay, rent and deposit, payment and door passcodes. A booking without an inquiry, e.g. a walk-in or a returning tenant. Saving saves the customer as a tenant.</p>
    </div>

    <div class="notice error" v-if="blocked">{{ blocked }}
      <div v-if="leadId && canDirect" style="margin-top:8px"><button type="button" class="btn" @click="dropLead()">Start a booking without an inquiry</button></div>
    </div>

    <FormSaved v-else-if="saved" :message="okMsg" @again="startAgain()">
      <p class="saved-note">Key this booking into eZee to block the room. The payment, if any, is under Accounting › Offline Payments (status Pending).</p>
    </FormSaved>

    <template v-else-if="ready">
      <StepStrip v-model="step" :steps="steps" label="Reservation steps" />
      <div class="notice error" v-show="formError" style="margin-top:14px">{{ formError }}</div>

      <section class="card rf-body">
        <!-- 1. Tenant -->
        <div v-show="step === 0">
          <h3>Tenant</h3>
          <p class="help" v-if="bk.existing">{{ `Existing tenant ${bk.existing.id} has this phone number. Their details are filled in below and the booking will be added to their record.` }}</p>
          <div class="grid-fields">
            <FormField id="bName" label="Name" req v-model="bk.name" />
            <FormField id="bPhone" label="Phone" req v-model="bk.phone" inputmode="tel" @change="refill(true)" />
            <FormField id="bEmail" label="Email" type="email" v-model="bk.email" />
            <FormField id="bIc" label="IC / Passport" req v-model="bk.icPassport" />
            <FormField id="bNat" label="Nationality" v-model="bk.nationality" placeholder="e.g. Malaysian" />
            <FormField id="bDob" label="Date of birth" type="date" v-model="bk.dob" />
            <div class="field"><label for="bGender">Gender</label>
              <OptionPicker class="fld-pick" v-model="bk.gender" :options="GENDERS" label="Gender" placeholder="Not set" /></div>
            <FormField v-if="bk.gender === 'Other'" id="bGenderOther" label="If other, type" req v-model="bk.genderOther" />
          </div>
          <div class="sub-sec" v-for="(c, ci) in bk.coTenants" :key="c.key">
            <div class="card-head"><h3>{{ `Tenant ${ci + 2}` }}</h3><button type="button" class="btn" @click="bk.coTenants.splice(ci, 1)">Remove</button></div>
            <div class="grid-fields">
              <FormField :id="'cName' + ci" label="Name" req v-model="c.name" />
              <FormField :id="'cPhone' + ci" label="Phone" req v-model="c.phone" inputmode="tel" />
              <FormField :id="'cEmail' + ci" label="Email" type="email" v-model="c.email" />
              <FormField :id="'cIc' + ci" label="IC / Passport" req v-model="c.icPassport" />
              <FormField :id="'cNat' + ci" label="Nationality" v-model="c.nationality" />
              <FormField :id="'cDob' + ci" label="Date of birth" type="date" v-model="c.dob" />
              <div class="field"><label>Gender</label><OptionPicker class="fld-pick" v-model="c.gender" :options="GENDERS" placeholder="Not set" :label="`Gender of tenant ${ci + 2}`" /></div>
              <FormField v-if="c.gender === 'Other'" :id="'cGo' + ci" label="If other, type" req v-model="c.genderOther" />
            </div>
          </div>
          <div class="sub-sec"><button type="button" class="btn" @click="addCoTenant()">+ Add another tenant</button></div>
        </div>

        <!-- 2. Stay -->
        <div v-show="step === 1">
          <h3>Stay</h3>
          <div class="grid-fields">
            <div class="field"><label class="req" for="bProp">Property</label>
              <OptionPicker class="fld-pick" v-model="bk.propertyId" :options="[{ value: '', label: 'Choose property' }, ...properties.map(x => ({ value: x.id, label: x.name }))]" label="Property" searchable @change="loadUnitList()" /></div>
            <div class="field"><label class="req" for="bUnit">Unit</label>
              <OptionPicker class="fld-pick" v-model="bk.unitId" :disabled="!bk.propertyId" :options="[{ value: '', label: bk.propertyId && !units.length ? 'No units found' : 'Choose unit' }, ...units.map(x => ({ value: x.id, label: x.unitCode || x.id }))]" label="Unit" searchable /></div>
            <FormField id="bIn" label="Check-in" req type="date" v-model="bk.arrival" />
            <FormField id="bOut" label="Check-out" req type="date" v-model="bk.departure" />
          </div>
          <p class="help" v-if="hasStay">{{ nights === 0 ? 'Same-day check-out (0 nights) · Short stay' : `${nights} night${nights === 1 ? '' : 's'} · ${longTerm ? 'Long-term lease (30 nights or more)' : 'Short stay (29 nights or less)'}` }}</p>
        </div>

        <!-- 3. Rent & deposit -->
        <div v-show="step === 2">
          <h3>Rent &amp; deposit</h3>
          <p class="help" style="margin:0 0 10px" v-if="hasStay">{{ longTerm ? 'Long-term lease: the security deposit is 2 months of rent.' : 'Short stay: no 2-month deposit.' }}</p>
          <div class="grid-fields">
            <div class="field"><label class="req">Booking source</label><OptionPicker class="fld-pick" v-model="bk.bookingSource" :options="SOURCES_BK" label="Booking source" /></div>
            <div class="field"><label class="req">Rental status</label><OptionPicker class="fld-pick" v-model="bk.rentalStatus" :options="RENTAL_STATUSES" label="Rental status" /></div>
            <div class="field"><label for="bRentType">Type of rent</label>
              <OptionPicker class="fld-pick" v-model="bk.rentType" :options="RENT_TYPES" label="Type of rent" /></div>
            <FormField v-if="longTerm" id="bRent" label="Rental (RM)" req type="number" min="0" step="0.01" v-model="bk.monthlyRent" />
            <FormField v-else id="bRental" label="Rental (RM)" req type="number" min="0" step="0.01" v-model="bk.rental" />
            <div class="field" v-if="longTerm"><label class="req">Security deposit (2 months)</label><div class="input readonly">{{ rm(deposit) }}</div></div>
            <FormField v-else id="bSec" label="Security deposit (RM)" type="number" min="0" step="0.01" v-model="bk.securityDeposit" />
            <FormField v-for="f in FEES" :key="f.key" :id="'bf' + f.key" :label="`${f.label} (RM)`" type="number" min="0" step="0.01" v-model="bk[f.key]" />
            <FormField v-if="+bk.othersFee > 0" id="bOthersNote" label="Others: what is it for?" v-model="bk.othersNote" />
          </div>
        </div>

        <!-- 4. Payment -->
        <div v-show="step === 3">
          <h3>Payment</h3>
          <p class="help" v-if="unpaid" style="margin:0 0 10px">Rental status is Unpaid, so payment details are optional. If you type an amount, add the mode, purpose and receipt too.</p>
          <div class="grid-fields">
            <FormField id="bAmt" :label="longTerm ? 'Amount paid (RM)' : 'Amount (RM)'" :req="!longTerm && !unpaid" type="number" min="0" step="0.01" v-model="bk.amount" />
            <div class="field"><label :class="{ req: +bk.amount > 0 }" for="bMode">Mode of payment</label>
              <OptionPicker class="fld-pick" v-model="bk.payMode" :options="PAY_MODES" label="Mode of payment" /></div>
            <FormField id="bPayDate" label="Date" type="date" v-model="bk.payDate" />
            <FormField id="bRef" label="Reference numbers" v-model="bk.paymentRef" placeholder="e.g. bank transfer ref or receipt no." />
            <FormField id="bEzee" label="eZee reservation no." v-model="bk.ezeeNo" placeholder="Add once it is keyed into eZee" />
          </div>
          <div class="field" style="margin-top:12px"><label :class="{ req: (!longTerm && !unpaid) || +bk.amount > 0 }" for="bNote">Purpose</label>
            <textarea class="input" id="bNote" style="height:90px" v-model="bk.note" placeholder="e.g. Rental, security deposit. Long notes are fine, e.g. Deposit = RM2000, Rental = RM2200, Total = RM4200; (-) Payroll = RM3050; Balance = RM950"></textarea></div>
          <div class="field" id="bReceipt" tabindex="-1" style="margin-top:12px"><label :class="{ req: +bk.amount > 0 }">Receipt</label>
            <DriveFiles kind="offline-payments" :key="bk.payId" :record-id="bk.payId" :label="payLabel()" :list-on-load="false" @folder="l => bk.docsLink = l" /></div>
          <p class="help">The payment is saved under Accounting › Offline Payments (status Pending), not on the booking. Accounting checks it there.</p>
        </div>

        <!-- 5. Handover -->
        <div v-show="step === 4">
          <h3>Door access and passcodes</h3>
          <div class="grid-fields">
            <FormField id="bPass" label="Main door passcode" v-model="bk.mainPasscode" autocomplete="off" />
            <FormField id="bExp" label="Current expiry date" :req="!!bk.mainPasscode.trim()" type="date" v-model="bk.currentExpiry" />
            <FormField id="bNextPass" label="Next door passcode" v-model="bk.nextPasscode" autocomplete="off" />
            <FormField id="bNextExp" label="Next expiry date" :req="!!bk.nextPasscode.trim()" type="date" v-model="bk.nextExpiry" />
          </div>
        </div>

        <!-- 6. Review & save -->
        <div v-show="step === 5">
          <h3>Review &amp; save</h3>
          <div class="notice warn" v-if="missing.length">
            <b>Still missing</b>
            <ul class="miss"><li v-for="m in missing" :key="m.index"><button type="button" class="editlink" @click="step = m.index">{{ `${m.index + 1}. ${m.label}` }}</button>: {{ m.items.join(', ') }}</li></ul>
          </div>
          <div class="notice ok" v-else>Everything needed is filled in. Check the details and press Save booking.</div>
          <div class="rev" v-for="r in review" :key="r.index">
            <div class="card-head"><h4>{{ `${r.index + 1}. ${r.label}` }}</h4><button type="button" class="editlink" @click="step = r.index">Edit</button></div>
            <div class="kv" v-for="[k, v] in r.rows" :key="k"><span>{{ k }}</span><span>{{ v }}</span></div>
          </div>
          <div class="rev when">
            <h4>When you save</h4>
            <p>{{ bk.existing ? `- The booking is added to tenant ${bk.existing.id}.` : '- The customer is saved as a new tenant.' }}</p>
            <p v-if="!lead">- The booking gets the next booking no. for its property (like DM-014), and shows under Portfolio > Bookings.</p>
            <template v-else>
              <p>{{ `- The booking is saved as offline_${lead.id}, so it can't be made twice.` }}</p>
              <p>{{ `- ${lead.id} is marked Paid · Booked.` }}</p>
            </template>
            <p v-if="longTerm">- The lease starts on the check-in date and the rent cycle follows it.</p>
            <p><b>- Key this booking into eZee to block the room.</b> Month-end pays the owner from the eZee booking; this copy keeps the tenant's history and is never counted twice.</p>
          </div>
        </div>
      </section>

      <div class="bottom-actions">
        <button type="button" class="btn" v-if="step > 0" @click="move(-1)">Back</button>
        <span class="spacer"></span>
        <button type="button" class="btn btn-primary" v-if="step < steps.length - 1" @click="move(1)">Next</button>
        <button type="button" class="btn btn-primary" v-else @click="saveBooking()" :disabled="busy || !complete" :title="complete ? '' : 'Finish the steps listed above first'">{{ busy ? 'Saving…' : 'Save booking' }}</button>
      </div>
    </template>
  </div>
</template>

<script>
// Reservation Lodgment Form (Operations > Booking forms > Reservation). Moved out of pages/Operations/SalesLeads.vue on 4 Nov 2026;
// the fields, checks and what is saved are unchanged. Two ways in:
//   - from an inquiry (?lead=LD-0001, Offline Inquiries > Create booking): offlineBookings/offline_LD-0001, the inquiry marked Paid · Booked
//   - without an inquiry (walk-in, returning tenant): offlineBookings/offline_BK-0001 (counters/offlineBookings)
// Both: tenants/{TEN-0001} + private/main (a returning tenant is found by phone), lodgmentCounters (DM-014 booking no.),
// the payment in offlinePayments (status Pending), door passcodes in offlineBookings/{id}/private/main, an audit entry, notifications.
import { collection, doc, getDoc, getDocs, query, where, runTransaction, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase.js';
import { useSession } from '@/stores/session.js';
import OptionPicker from '@/components/OptionPicker.vue';
import FormField from '@/components/FormField.vue';
import DriveFiles from '@/components/DriveFiles.vue';
import StepStrip from '@/components/StepStrip.vue';
import FormSaved from '@/components/FormSaved.vue';
import { idPrefix } from '@/lib/lodgment.js';
import { loadProperties, loadUnits, audit, friendlyError } from '@/lib/finance-data.js';
import { allDone, stillMissing } from '@/lib/steps.js';
import { STATUS, CONTACT_ALL, DIRECT_BOOKERS, MON, nowIso, isoOf, num, phoneKey, searchWords, findTenant, privateOf } from '@/lib/offline.js';
import { notifyRole, notifyUser } from '@/services/notificationService.js';

const me = useSession();
const LONG_TERM_NIGHTS = 30;
const GENDERS = ['Male', 'Female', 'Other'].map(x => ({ value: x, label: x }));
const SOURCES_BK = [{ value: '', label: 'Choose source…' }, ...['Offline', 'Website', 'Agent', 'OTA'].map(x => ({ value: x, label: x }))];
const RENTAL_STATUSES = [{ value: '', label: 'Choose status…' }, { value: 'Paid', label: 'Paid' }, { value: 'Unpaid', label: 'Unpaid' }];
const RENT_TYPES = ['Daily', 'Monthly', 'Yearly'].map(x => ({ value: x, label: x }));
const PAY_MODES = ['Bank transfer', 'Cash', 'Card', 'Online banking / QR', 'Cheque', 'Other'].map(x => ({ value: x, label: x })); PAY_MODES.unshift({ value: '', label: 'Choose mode' });
const FEES = [{ key: 'utilityDeposit', label: 'Utility deposit' }, { key: 'internetFee', label: 'Internet fees' }, { key: 'carparkFee', label: 'Carpark fees' },
  { key: 'cleaningFee', label: 'Cleaning fees' }, { key: 'taFee', label: 'Tenancy agreement fees' }, { key: 'taStampFee', label: 'Tenancy agreement stamping fees' }, { key: 'othersFee', label: 'Others' }];
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const toCents = v => Math.round((+v || 0) * 100) / 100;
const emailOk = e => !e || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const stop = msg => Object.assign(new Error(msg), { plain: true });
const errText = (e, what) => (e.plain ? e.message : friendlyError(e, what));
const filled = v => !!String(v ?? '').trim();
// What counts as "something typed" for the leave warning (not the ids and lookups the form sets itself)
const typed = bk => JSON.stringify({ ...bk, existing: undefined, payId: undefined });
// The step a save message is about, so the form jumps there
const STEP_OF = [[/tenant|phone|email|IC or passport|gender/i, 0], [/property and unit|check-in|Check-out|already booked/, 1], [/booking source|rental status|monthly rent/, 2],
  [/amount paid|mode of payment|purpose|receipt/, 3], [/passcode/, 4]];

export default {
  components: { OptionPicker, DriveFiles, FormField, StepStrip, FormSaved },
  props: { leadId: { type: String, default: '' } },
  emits: ['dirty'],
  data() {
    return {
      GENDERS, SOURCES_BK, RENTAL_STATUSES, RENT_TYPES, PAY_MODES, FEES,
      lead: null, tenant: null, bk: {}, properties: [], units: [], start: '',
      step: 0, ready: false, saved: false, blocked: '', okMsg: '', formError: '', loading: true, busy: false
    };
  },
  async mounted() {
    try {
      if (this.leadId) {
        await this.loadLead(this.leadId);
        if (!this.lead || !this.canBook(this.lead)) {
          this.blocked = this.lead ? `${this.leadId} can't be booked here. A booking is made from an inquiry with status Interested (Pending payment) that has no booking yet.`
            : `Inquiry ${this.leadId} was not found, or you can't open it.`;
          this.loading = false; return;
        }
      } else if (!this.canDirect) {
        this.blocked = 'Only Directors, Accounting and Operations can make a booking without an inquiry.';
        this.loading = false; return;
      }
      await this.startBooking();
    } catch (e) { this.blocked = friendlyError(e, 'open the booking form'); }
    this.loading = false;
  },
  computed: {
    canDirect() { return DIRECT_BOOKERS.includes(me.role); },
    // Rental status Unpaid: the payment details are not required
    unpaid() { return this.bk.rentalStatus === 'Unpaid'; },
    nights() {
      const { arrival: a, departure: b } = this.bk;
      return a && b ? Math.round((Date.parse(b) - Date.parse(a)) / 86400000) : 0;
    },
    // Both dates set and check-out not before check-in (a same-day check-out, 0 nights, is allowed)
    hasStay() { return !!(this.bk.arrival && this.bk.departure) && this.nights >= 0; },
    longTerm() { return this.nights >= LONG_TERM_NIGHTS; },
    deposit() { return toCents(this.bk.monthlyRent) * 2; },
    dirty() { return this.ready && !this.saved && typed(this.bk) !== this.start; },
    // The steps and what each needs, taken from the checks in saveBooking() (which still runs on Save)
    steps() {
      const b = this.bk;
      if (!b.coTenants) return [];
      const paid = +b.amount > 0;
      return [
        { key: 'tenant', label: 'Tenant', problem: this.tenantProblem(), required: [
          { label: 'Name', filled: filled(b.name) }, { label: 'Phone', filled: phoneKey(b.phone).length >= 9 }, { label: 'IC / Passport', filled: filled(b.icPassport) },
          ...(b.gender === 'Other' ? [{ label: 'Gender (type it)', filled: filled(b.genderOther) }] : []),
          ...b.coTenants.flatMap((c, i) => [{ label: `Tenant ${i + 2} name`, filled: filled(c.name) }, { label: `Tenant ${i + 2} phone`, filled: phoneKey(c.phone).length >= 9 },
            { label: `Tenant ${i + 2} IC / Passport`, filled: filled(c.icPassport) }, ...(c.gender === 'Other' ? [{ label: `Tenant ${i + 2} gender (type it)`, filled: filled(c.genderOther) }] : [])])] },
        { key: 'stay', label: 'Stay', problem: b.arrival && b.departure && this.nights < 0 ? "Check-out can't be before check-in." : '', required: [
          { label: 'Property', filled: filled(b.propertyId) }, { label: 'Unit', filled: filled(b.unitId) }, { label: 'Check-in', filled: filled(b.arrival) }, { label: 'Check-out', filled: filled(b.departure) }] },
        { key: 'rent', label: 'Rent & deposit', required: [
          { label: 'Booking source', filled: filled(b.bookingSource) }, { label: 'Rental status', filled: filled(b.rentalStatus) },
          ...(this.longTerm ? [{ label: 'Monthly rent', filled: +b.monthlyRent > 0 }] : [])] },
        { key: 'payment', label: 'Payment', notNeeded: this.unpaid && !paid, required: [
          ...(!this.longTerm && !this.unpaid ? [{ label: 'Amount paid', filled: paid }] : []),
          ...(paid ? [{ label: 'Mode of payment', filled: filled(b.payMode) }, { label: 'Purpose', filled: filled(b.note) }, { label: 'Receipt', filled: filled(b.docsLink) }] : [])] },
        { key: 'handover', label: 'Handover', required: [
          ...(filled(b.mainPasscode) ? [{ label: 'Main door passcode expiry', filled: filled(b.currentExpiry) }] : []),
          ...(filled(b.nextPasscode) ? [{ label: 'Next door passcode expiry', filled: filled(b.nextExpiry) }] : [])] },
        { key: 'review', label: 'Review & save', review: true }
      ];
    },
    complete() { return allDone(this.steps); },
    missing() { return stillMissing(this.steps); },
    // The summary on Review & save
    review() {
      const b = this.bk, d = v => (filled(v) ? String(v) : '—'), money = v => (+v > 0 ? this.rm(v) : '—');
      const prop = this.properties.find(p => p.id === b.propertyId);
      const fees = FEES.filter(f => +b[f.key] > 0).map(f => [f.label, this.rm(b[f.key])]);
      const pass = (code, exp) => (filled(code) ? `Set${exp ? `, expires ${this.full(exp)}` : ''}` : 'Not set');
      return [
        { index: 0, label: 'Tenant', rows: [['Name', d(b.name)], ['Phone', d(b.phone)], ['Email', d(b.email)], ['IC / Passport', d(b.icPassport)], ['Nationality', d(b.nationality)],
          ...(b.existing ? [['Existing tenant', b.existing.id]] : []), ...(b.coTenants.length ? [['Other tenants', b.coTenants.map(c => c.name || '(no name)').join(', ')]] : [])] },
        { index: 1, label: 'Stay', rows: [['Property', prop?.name || '—'], ['Unit', this.units.find(u => u.id === b.unitId)?.unitCode || d(b.unitId)], ['Check-in', b.arrival ? this.full(b.arrival) : '—'], ['Check-out', b.departure ? this.full(b.departure) : '—'],
          ['Nights', this.hasStay ? (this.nights === 0 ? '0 · Same-day check-out' : `${this.nights} · ${this.longTerm ? 'Long-term lease' : 'Short stay'}`) : '—']] },
        { index: 2, label: 'Rent & deposit', rows: [['Booking source', d(b.bookingSource)], ['Rental status', d(b.rentalStatus)], ['Type of rent', d(b.rentType)],
          ['Rental', money(this.longTerm ? b.monthlyRent : b.rental)], ['Security deposit', this.longTerm ? this.rm(this.deposit) : money(b.securityDeposit)], ...fees,
          ...(+b.othersFee > 0 ? [['Others is for', d(b.othersNote)]] : [])] },
        { index: 3, label: 'Payment', rows: [['Amount', money(b.amount)], ['Mode', d(b.payMode)], ['Date', b.payDate ? this.full(b.payDate) : '—'], ['Reference', d(b.paymentRef)],
          ['eZee reservation no.', d(b.ezeeNo)], ['Purpose', d(b.note)], ['Receipt', b.docsLink ? 'Uploaded' : 'None']] },
        { index: 4, label: 'Handover', rows: [['Main door passcode', pass(b.mainPasscode, b.currentExpiry)], ['Next door passcode', pass(b.nextPasscode, b.nextExpiry)]] }
      ];
    }
  },
  watch: { dirty: { handler(v) { this.$emit('dirty', v); }, immediate: true } },
  methods: {
    short(iso) { if (!iso) return ''; const [, m, dd] = iso.slice(0, 10).split('-'); return `${+dd} ${MON[+m - 1]}`; },
    full(iso) { return iso ? `${this.short(iso)} ${iso.slice(0, 4)}` : ''; },
    rm(v) { return 'RM ' + (+v || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); },
    canSeeContact(ld) { return CONTACT_ALL.includes(me.role) || ld.loggedByUid === me.user.uid || ld.assignedToUid === me.user.uid; },
    canBook(ld) { return ld.status === 'interested' && !ld.bookingId && this.canSeeContact(ld); },
    entry(text) { return { at: nowIso(), by: me.name, text }; },
    move(by) { this.step = Math.min(this.steps.length - 1, Math.max(0, this.step + by)); window.scrollTo({ top: 0, behavior: 'smooth' }); },
    // Invalid entries on the Tenant step (the same wording as the save checks)
    tenantProblem() {
      const b = this.bk;
      if (!emailOk(b.email.trim())) return 'The email address doesn\'t look right.';
      for (let i = 0; i < b.coTenants.length; i++) {
        const c = b.coTenants[i], n = `Tenant ${i + 2}`;
        if (c.email.trim() && !emailOk(c.email.trim())) return `The email for ${n} doesn't look right.`;
        if (phoneKey(c.phone).length >= 9 && (phoneKey(c.phone) === phoneKey(b.phone) || b.coTenants.some((o, j) => j < i && phoneKey(o.phone) === phoneKey(c.phone)))) return `${n} has the same phone number as another tenant on this booking.`;
      }
      return '';
    },
    // Start another booking without the inquiry (drops ?lead= from the address; the page opens a fresh form)
    dropLead() { this.$router.replace({ path: '/Operations/booking-forms/reservation' }); },
    async startAgain() {
      if (this.lead) { this.dropLead(); return; }
      this.saved = false; this.okMsg = ''; this.step = 0; this.ready = false;
      await this.startBooking();
      window.scrollTo(0, 0);
    },

    // Sends to roles and people (the roles must match NOTIFY_ROLES / the Firestore rules)
    async notify({ title, message, roles = [], uids = [], refId = null, link = '/Notifications', skipSelf = true }) {
      const base = { title, message, link, type: 'inquiry', refId };
      const jobs = [];
      [...new Set(roles)].filter(Boolean).forEach(recipientRole => jobs.push(notifyRole({ ...base, recipientRole })));
      [...new Set(uids)].filter(uid => uid && (!skipSelf || uid !== me.user.uid)).forEach(recipientUid => jobs.push(notifyUser({ ...base, recipientUid })));
      if (!jobs.length) return;
      const results = await Promise.allSettled(jobs);
      results.forEach(r => { if (r.status === 'rejected') console.error('Notification failed:', r.reason); });
    },

    // The inquiry and (if it has one) its tenant, with the private contact details
    async loadLead(id) {
      this.lead = null; this.tenant = null;
      const ref = doc(db, 'offlineInquiries', id);
      const snap = await getDoc(ref).catch(e => { if (e.code === 'permission-denied') return null; throw e; });
      if (!snap?.exists()) return;
      const d = snap.data();
      const ld = { id, ...d, assignedTo: d.assignedToName || '', loggedBy: d.loggedByName || '', created: isoOf(d.createdAt), updated: isoOf(d.updatedAt),
        history: d.history || [], contactName: '', phone: '', email: '' };
      const see = this.canSeeContact(ld);
      if (see) Object.assign(ld, await privateOf(ref));
      const t = ld.tenantId ? await getDoc(doc(db, 'tenants', ld.tenantId)).catch(() => null) : null;
      if (t?.exists()) this.tenant = { id: t.id, ...t.data(), ...(see ? await privateOf(doc(db, 'tenants', t.id)).catch(() => ({})) : {}) };
      this.lead = ld;
    },
    async startBooking() {
      const ld = this.lead || { contactName: '', phone: '', email: '' };
      this.bk = { name: ld.contactName, phone: ld.phone, email: ld.email, icPassport: '', nationality: 'Malaysian', dob: '', gender: '', genderOther: '', coTenants: [], existing: null,
        rentType: 'Daily', bookingSource: '', rentalStatus: '', mainPasscode: '', currentExpiry: '', nextPasscode: '', nextExpiry: '', rental: '', securityDeposit: '', utilityDeposit: '', internetFee: '', carparkFee: '', cleaningFee: '', taFee: '', taStampFee: '', othersFee: '', othersNote: '',
        payMode: '', payDate: today(), payId: doc(collection(db, 'offlinePayments')).id, docsLink: '',
        propertyId: '', unitId: '', arrival: '', departure: '', amount: '', monthlyRent: '', paymentRef: '', ezeeNo: '', note: '' };
      this.units = []; this.formError = '';
      await this.refill();
      try { this.properties = await loadProperties(); } catch { this.properties = []; this.formError = 'Could not load the property list. Check your connection and reload.'; }
      this.start = typed(this.bk);
      this.ready = true;
    },
    async refill(typed = false) {
      const phone = this.bk.phone;
      const t = this.lead?.tenantId ? this.tenant : await findTenant(phone).catch(() => null);
      if (typed && this.bk.phone !== phone) return;
      this.bk.existing = t || null;
      if (t) Object.assign(this.bk, { name: t.name || this.bk.name, email: t.email || this.bk.email, icPassport: t.icPassport || '', nationality: t.nationality || this.bk.nationality,
        dob: t.dob || this.bk.dob, gender: t.gender || this.bk.gender, genderOther: t.genderOther || this.bk.genderOther });
    },
    async loadUnitList() {
      this.bk.unitId = ''; this.units = [];
      if (!this.bk.propertyId) return;
      try { this.units = await loadUnits(this.bk.propertyId); } catch { this.formError = 'Could not load the units. Check your connection and try again.'; }
    },
    addCoTenant() { this.bk.coTenants.push({ key: Date.now() + Math.random(), name: '', phone: '', email: '', icPassport: '', nationality: 'Malaysian', dob: '', gender: '', genderOther: '' }); },
    coError() {
      const list = this.bk.coTenants;
      for (let i = 0; i < list.length; i++) {
        const c = list[i], n = `Tenant ${i + 2}`;
        if (!c.name.trim()) return `Add the name of ${n}, or remove them.`;
        if (phoneKey(c.phone).length < 9) return `Add a full phone number for ${n}.`;
        if (c.email.trim() && !emailOk(c.email.trim())) return `The email for ${n} doesn't look right.`;
        if (!c.icPassport.trim()) return `Add the IC or passport number of ${n}.`;
        if (c.gender === 'Other' && !c.genderOther.trim()) return `Type the gender of ${n}, or pick another option.`;
        if (phoneKey(c.phone) === phoneKey(this.bk.phone) || list.some((o, j) => j < i && phoneKey(o.phone) === phoneKey(c.phone))) return `${n} has the same phone number as another tenant on this booking.`;
      }
      return '';
    },
    // Each extra tenant gets their own tenant record (found by phone, or a new TEN number); returns their ids
    async saveCoTenants() {
      const ids = [];
      for (const c of this.bk.coTenants) {
        const details = { kind: 'tenant', name: c.name.trim(), phone: c.phone.trim(), phoneKey: phoneKey(c.phone), email: c.email.trim(),
          icPassport: c.icPassport.trim(), nationality: c.nationality.trim(), searchWords: searchWords(c.name),
          dob: c.dob || '', gender: c.gender || '', genderOther: c.gender === 'Other' ? c.genderOther.trim() : '' };
        const known = await findTenant(c.phone), tcRef = doc(db, 'counters', 'tenants');
        const id = await runTransaction(db, async tx => {
          let tenantId = known?.id, n = 0;
          if (!known) {
            const cs = await tx.get(tcRef);
            n = cs.exists() ? cs.data().next || 1 : 1; tenantId = num('TEN', n);
            if ((await tx.get(doc(db, 'tenants', tenantId))).exists()) throw stop(`${tenantId} already exists. Ask a Director to check counters/tenants.`);
          }
          const tRef = doc(db, 'tenants', tenantId);
          if (known) tx.update(tRef, { status: 'active', updatedAt: serverTimestamp(), updatedBy: me.user.uid });
          else {
            tx.set(tcRef, { next: n + 1 });
            tx.set(tRef, { status: 'active', firstInquiryId: null, createdAt: serverTimestamp(), createdBy: me.user.uid, createdByName: me.name });
          }
          tx.set(doc(tRef, 'private', 'main'), details, { merge: true });
          return tenantId;
        });
        ids.push(id);
      }
      return ids;
    },
    // Door passcodes live in the booking's private record (Director, Finance, Operations only)
    passcodes() { const b = this.bk; return { mainDoorPasscode: b.mainPasscode.trim(), currentExpiryDate: b.currentExpiry || '', nextDoorPasscode: b.nextPasscode.trim(), nextExpiryDate: b.nextExpiry || '' }; },
    // Booking details and payment details that are saved on every offline booking
    extra(coIds = []) {
      const b = this.bk;
      return { coTenantIds: coIds, bookingSource: b.bookingSource, rentalStatus: b.rentalStatus, moveInStatus: 'Ready_to_Send', moveOutStatus: 'Ready_to_Send',
        passwordStatus: b.mainPasscode.trim() && b.currentExpiry ? 'Ready_to_Send' : '', rentType: b.rentType, rental: this.longTerm ? toCents(b.monthlyRent) : toCents(b.rental),
        securityDeposit: this.longTerm ? this.deposit : toCents(b.securityDeposit),
        utilityDeposit: toCents(b.utilityDeposit), internetFee: toCents(b.internetFee), carparkFee: toCents(b.carparkFee), cleaningFee: toCents(b.cleaningFee),
        taFee: toCents(b.taFee), taStampFee: toCents(b.taStampFee), othersFee: toCents(b.othersFee), othersNote: +b.othersFee > 0 ? b.othersNote.trim() : ''};
    },
    // The unit code for the booking, read from the unit itself when the loaded list doesn't have it
    async unitCodeOf(unitId) { try { const u = await getDoc(doc(db, 'units', unitId)); return u.exists() ? u.data().unitCode || '' : ''; } catch { return ''; } },
    // Opens the step a validation message is about, scrolls to the field and puts the cursor there
    focusFor(msg) {
      const s = (STEP_OF.find(([re]) => re.test(msg)) || [])[1];
      if (s !== undefined) this.step = s;
      const MAP = [[/^Add the tenant/, '#bName'], [/^Add a full phone/, '#bPhone'], [/email address/, '#bEmail'], [/^Add the IC/, '#bIc'], [/^Type the gender/, '#bGenderOther'],
        [/^Choose the property and unit/, '[aria-label="Property"]'], [/^Choose the booking source/, '[aria-label="Booking source"]'], [/^Choose the rental status/, '[aria-label="Rental status"]'],
        [/check-in and check-out|^Check-out can/, '#bIn'], [/^Add the monthly rent/, '#bRent'], [/^Add the amount paid/, '#bAmt'], [/^Choose the mode of payment/, '[aria-label="Mode of payment"]'],
        [/^Add the purpose/, '#bNote'], [/receipt/, '#bReceipt'], [/main door passcode/, '#bExp'], [/next door passcode/, '#bNextExp']];
      const sel = (MAP.find(([re]) => re.test(msg)) || [])[1];
      this.$nextTick(() => {
        const el = sel && this.$el.querySelector(sel);
        if (!el) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        setTimeout(() => el.focus && el.focus({ preventScroll: true }), 350);
      });
    },
    payLabel() { const b = this.bk; return [b.payDate, this.units.find(u => u.id === b.unitId)?.unitCode, b.name].filter(Boolean).join(' '); },
    // The payment is saved in the Offline Payments collection (what Finance checks), inside the same write as the booking
    payRecord(prop, unitCode, bookingId, bookingNo) {
      const b = this.bk;
      return { date: b.payDate || today(), amount: toCents(b.amount), mode: b.payMode, propertyId: b.propertyId, propertyName: prop?.name || '', unitCode: unitCode || b.unitId || '', unitId: b.unitId || '',
        guest: b.name.trim(), purpose: b.note.trim() || `Booking ${bookingNo}`, bankRef: b.paymentRef.trim(), docsLink: b.docsLink || '', remarks: '',
        status: 'Pending', verifiedByName: '', verifiedDate: '', bookingId, bookingNo,
        createdAt: serverTimestamp(), createdBy: me.user.uid, submittedByName: me.name };
    },
    // An existing booking on this unit whose dates overlap: offline bookings, and eZee bookings in the months around the stay.
    async findClash(b) {
      try {
        const hit = x => x.status !== 'cancelled' && (x.arrival || '') < b.departure && (x.departure || '9999') > b.arrival;
        const offs = await getDocs(query(collection(db, 'offlineBookings'), where('unitId', '==', b.unitId)));
        for (const d of offs.docs) if (hit(d.data())) return { no: d.data().bookingNo || d.id, arrival: d.data().arrival, departure: d.data().departure };
        const months = []; let y = +b.arrival.slice(0, 4), m = +b.arrival.slice(5, 7);
        const endKey = b.departure.slice(0, 7);
        for (let i = 0; i < 29; i++) { const k = `${y}-${String(m).padStart(2, '0')}`; months.push(k); if (k >= endKey) { m++; if (m > 12) { m = 1; y++; } months.push(`${y}-${String(m).padStart(2, '0')}`); break; } m++; if (m > 12) { m = 1; y++; } }
        const ez = await getDocs(query(collection(db, 'bookings'), where('unitId', '==', b.unitId), where('departureMonth', 'in', months.slice(0, 30))));
        for (const d of ez.docs) if (hit(d.data())) return { no: d.data().reservationNo || d.id, arrival: d.data().arrival, departure: d.data().departure };
      } catch (e) { console.warn('Could not check for clashing bookings:', e.code || e.message); }
      return null;
    },
    async saveBooking() {
      const b = this.bk, ld = this.lead;
      const err = !b.name.trim() ? 'Add the tenant\'s name.'
        : phoneKey(b.phone).length < 9 ? 'Add a full phone number. It is how a returning tenant is recognised.'
        : !emailOk(b.email.trim()) ? 'That email address doesn\'t look right.'
        : !b.icPassport.trim() ? 'Add the IC or passport number.'
        : b.gender === 'Other' && !b.genderOther.trim() ? 'Type the gender, or pick another option.'
        : !b.unitId ? 'Choose the property and unit.'
        : !b.bookingSource ? 'Choose the booking source.'
        : !b.rentalStatus ? 'Choose the rental status.'
        : !b.arrival || !b.departure ? 'Add the check-in and check-out dates.'
        : this.nights < 0 ? "Check-out can't be before check-in."
        : this.longTerm && !(+b.monthlyRent > 0) ? 'Add the monthly rent. The 2-month deposit is worked out from it.'
        : !this.longTerm && !this.unpaid && !(+b.amount > 0) ? 'Add the amount paid.'
        : +b.amount > 0 && !b.payMode ? 'Choose the mode of payment.'
        : +b.amount > 0 && !b.note.trim() ? 'Add the purpose of the payment.'
        : +b.amount > 0 && !b.docsLink ? 'Upload at least one receipt for the payment.'
        : b.mainPasscode.trim() && !b.currentExpiry ? 'Add the expiry date of the main door passcode.'
        : b.nextPasscode.trim() && !b.nextExpiry ? 'Add the expiry date of the next door passcode.' : this.coError();
      if (err) { this.formError = err; this.focusFor(err); return; }
      // Same unit, overlapping dates: refused (a check-out on the day of the next check-in is fine)
      const clash = await this.findClash(b);
      if (clash) { this.formError = `${b.unitId ? (this.units.find(u => u.id === b.unitId)?.unitCode || 'This unit') : 'This unit'} is already booked ${this.full(clash.arrival)} to ${this.full(clash.departure)} (${clash.no}). Pick other dates or another unit.`; this.focusFor(this.formError); return; }
      if (!ld) return this.saveDirect();

      this.busy = true; this.formError = '';
      try {
        const prop = this.properties.find(p => p.id === b.propertyId), unit = this.units.find(u => u.id === b.unitId);
        const details = { kind: 'tenant', name: b.name.trim(), phone: b.phone.trim(), phoneKey: phoneKey(b.phone), email: b.email.trim(),
          icPassport: b.icPassport.trim(), nationality: b.nationality.trim(), searchWords: searchWords(b.name),
          dob: b.dob || '', gender: b.gender || '', genderOther: b.gender === 'Other' ? b.genderOther.trim() : '' };
        const coIds = await this.saveCoTenants();
        const known = this.lead.tenantId ? this.tenant : await findTenant(b.phone);
        const bookingId = `offline_${ld.id}`, unitCode = unit?.unitCode || await this.unitCodeOf(b.unitId);
        const lRef = doc(db, 'offlineInquiries', ld.id), bRef = doc(db, 'offlineBookings', bookingId), cRef = doc(db, 'counters', 'tenants');

        const res = await runTransaction(db, async tx => {
          if ((await tx.get(bRef)).exists()) throw stop(`${ld.id} already has a booking.`);
          // Booking no. in the Reservation Lodgment style (DM-014); the counter is shared with the lodgment form
          const lcRef = doc(db, 'lodgmentCounters', idPrefix(prop?.name)), lc = await tx.get(lcRef), ln = lc.exists() ? lc.data().next || 1 : 1, bookingNo = `${idPrefix(prop?.name)}-${String(ln).padStart(3, '0')}`;
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
          tx.set(lcRef, { next: ln + 1 });
          tx.set(bRef, { source: 'offline', inquiryId: ld.id, bookingNo, tenantId,
            propertyId: b.propertyId, propertyName: prop?.name || '', unitId: b.unitId, unitCode,
            arrival: b.arrival, departure: b.departure, nights: this.nights, longTerm: this.longTerm,
            monthlyRent: this.longTerm ? toCents(b.monthlyRent) : 0, deposit: this.longTerm ? this.deposit : 0,
            ezeeReservationNo: b.ezeeNo.trim(), ...this.extra(coIds), status: 'active',
            createdAt: serverTimestamp(), createdBy: me.user.uid, createdByName: me.name });
          tx.set(doc(bRef, 'private', 'main'), this.passcodes());
          if (+b.amount > 0) tx.set(doc(db, 'offlinePayments', b.payId), this.payRecord(prop, unitCode, bookingId, bookingNo));
          const h = this.entry(`Paid and booked: ${unitCode || 'unit'}, ${this.full(b.arrival)} to ${this.full(b.departure)}. `
            + `${!known ? `Saved as new tenant ${details.name} (${tenantId}).` : `Added to existing tenant ${details.name} (${tenantId}).`}${b.note.trim() ? ' ' + b.note.trim() : ''}`);
          tx.update(lRef, { status: 'booked', tenantId, bookingId, updatedAt: serverTimestamp(), history: arrayUnion(h) });
          tx.set(doc(lRef, 'private', 'main'), { contactName: details.name, phone: details.phone, phoneKey: details.phoneKey, email: details.email }, { merge: true });
          audit(tx, me, { action: 'offlineBooking.create', entity: `offlineBookings/${bookingId}`, propertyId: b.propertyId,
            changes: [{ field: 'status', old: ld.status, new: 'booked' }, { field: 'tenantId', old: null, new: tenantId }, { field: 'unitId', old: null, new: b.unitId }] });
          return { isNew: !known, bookingNo };
        });

        this.okMsg = `${ld.id} booked as ${res.bookingNo}. ${res.isNew ? `New tenant ${details.name} saved.` : `Added to tenant ${details.name}.`}`;

        // Notify Finance and Directors to key the booking into eZee
        this.notify({
          roles: ['finance', 'director'],
          title: 'New offline booking',
          refId: bookingId,
          message: `${ld.id} booked as ${res.bookingNo}: ${details.name}, ${unitCode || 'unit'}, ${this.full(b.arrival)} to ${this.full(b.departure)}. Key it into eZee.`,
          link: `/Operations/offline-inquiries?id=${ld.id}`
        });

        // Status moved to Booked — Operations hears about it too (Finance/Director got the eZee note above)
        this.notify({
          roles: ['operations'],
          title: 'Inquiry status changed',
          refId: ld.id,
          message: `${ld.id}: ${me.name} changed the status from ${STATUS[ld.status][0]} to ${STATUS.booked[0]}.`,
          link: `/Operations/offline-inquiries?id=${ld.id}`
        });

        this.saved = true; window.scrollTo(0, 0);
      } catch (e) { this.formError = errText(e, 'save the booking'); window.scrollTo(0, 0); }
      this.busy = false;
    },

    async saveDirect() {
      const b = this.bk;
      this.busy = true; this.formError = '';
      try {
        const prop = this.properties.find(p => p.id === b.propertyId), unit = this.units.find(u => u.id === b.unitId);
        const details = { kind: 'tenant', name: b.name.trim(), phone: b.phone.trim(), phoneKey: phoneKey(b.phone), email: b.email.trim(),
          icPassport: b.icPassport.trim(), nationality: b.nationality.trim(), searchWords: searchWords(b.name),
          dob: b.dob || '', gender: b.gender || '', genderOther: b.gender === 'Other' ? b.genderOther.trim() : '' };
        const coIds = await this.saveCoTenants();
        const known = await findTenant(b.phone), unitCode = unit?.unitCode || await this.unitCodeOf(b.unitId);
        const bcRef = doc(db, 'counters', 'offlineBookings'), tcRef = doc(db, 'counters', 'tenants');
        const res = await runTransaction(db, async tx => {
          const bc = await tx.get(bcRef), bn = bc.exists() ? bc.data().next || 1 : 1, bookingId = `offline_${num('BK', bn)}`;
          const bRef = doc(db, 'offlineBookings', bookingId);
          const lcRef = doc(db, 'lodgmentCounters', idPrefix(prop?.name)), lc = await tx.get(lcRef), ln = lc.exists() ? lc.data().next || 1 : 1, bookingNo = `${idPrefix(prop?.name)}-${String(ln).padStart(3, '0')}`;
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
          tx.set(lcRef, { next: ln + 1 });
          tx.set(bRef, { source: 'direct', inquiryId: null, bookingNo, tenantId,
            propertyId: b.propertyId, propertyName: prop?.name || '', unitId: b.unitId, unitCode,
            arrival: b.arrival, departure: b.departure, nights: this.nights, longTerm: this.longTerm,
            monthlyRent: this.longTerm ? toCents(b.monthlyRent) : 0, deposit: this.longTerm ? this.deposit : 0,
            ezeeReservationNo: b.ezeeNo.trim(), ...this.extra(coIds), status: 'active',
            createdAt: serverTimestamp(), createdBy: me.user.uid, createdByName: me.name });
          tx.set(doc(bRef, 'private', 'main'), this.passcodes());
          if (+b.amount > 0) tx.set(doc(db, 'offlinePayments', b.payId), this.payRecord(prop, unitCode, bookingId, bookingNo));
          audit(tx, me, { action: 'offlineBooking.create', entity: `offlineBookings/${bookingId}`, propertyId: b.propertyId,
            changes: [{ field: 'tenantId', old: null, new: tenantId }, { field: 'unitId', old: null, new: b.unitId }] });
          return { isNew: !known, bookingId, bookingNo };
        });

        const okMsg = `${res.bookingNo} saved. ${res.isNew ? `New tenant ${details.name} saved.` : `Added to tenant ${details.name}.`} Key it into eZee to block the room.`;

        this.notify({
          roles: ['finance', 'director'],
          title: 'New offline booking',
          refId: res.bookingId,
          message: `${res.bookingNo}: ${details.name}, ${unitCode || 'unit'}, ${this.full(b.arrival)} to ${this.full(b.departure)}. Key it into eZee.`,
          link: '/Portfolio/bookings'
        });

        this.okMsg = okMsg; this.saved = true; window.scrollTo(0, 0);
      } catch (e) { this.formError = errText(e, 'save the booking'); window.scrollTo(0, 0); }
      this.busy = false;
    }
  }
};
</script>

<style scoped>
.form-title { margin-bottom: 14px; }
.form-title h2 { font-size: 18px; margin: 0; }
.form-title .sub { color: var(--muted); margin: 4px 0 0; font-size: 13px; }
.rf-body { margin-top: 14px; }
.rf-body h3 { font-size: 15px; margin: 0 0 12px; }
.rf-body h4 { font-size: 14px; margin: 0; }
.rf-body .card-head h3 { margin: 0; }
.sub-sec { border-top: 1px solid var(--border); margin-top: 14px; padding-top: 14px; }
.fld-pick { display: block; width: 100%; }
.fld-pick :deep(.op-btn) { width: 100%; min-height: 40px; }
.fld-pick :deep(.op-pop) { max-width: none; width: 100%; }
.readonly { display: flex; align-items: center; background: var(--chip); color: var(--text); }
.miss { margin: 6px 0 0; padding-left: 18px; }
.miss li { margin: 2px 0; }
.miss .editlink { font-weight: 600; }
.rev { border-top: 1px solid var(--border); padding: 12px 0; }
.rev .card-head { margin-bottom: 4px; }
.when h4 { margin-bottom: 8px; }
.when p { margin: 0 0 8px; font-size: 13px; color: var(--text-2); }
.saved-note { font-size: 13px !important; color: var(--text-2) !important; }
.spacer { flex: 1; }
.bottom-actions { display: flex; gap: 10px; margin-top: 8px; padding: 14px 0 20px; }
.bottom-actions .btn:disabled { opacity: .5; cursor: not-allowed; }
</style>
