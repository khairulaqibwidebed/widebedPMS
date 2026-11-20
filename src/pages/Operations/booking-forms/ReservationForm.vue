<template>
  <div class="rf">
    <div class="loading-bar" v-show="loading || busy"></div>
    <div class="form-title">
      <h2>Reservation Lodgment Form</h2>
      <p class="sub" v-if="resume">{{ `Finishing ${resume.bookingNo || resume.id} (Awaiting payment). Add the payment and door passcodes, then save. Tenant and stay were saved with the booking.` }}</p>
      <p class="sub" v-else-if="lead">{{ `From ${lead.id} · ${lead.lookingFor}. Saving marks the inquiry as paid and saves the customer as a tenant.` }}</p>
      <p class="sub" v-else>Log a booking: tenant, stay, rent and deposit, payment and door passcodes. A booking without an inquiry, e.g. a walk-in or a returning tenant. Saving saves the customer as a tenant.</p>
    </div>

    <div class="notice error" v-if="blocked">{{ blocked }}
      <div v-if="leadId && canDirect" style="margin-top:8px"><button type="button" class="btn" @click="dropLead()">Start a booking without an inquiry</button></div>
    </div>

    <FormSaved v-else-if="saved" :message="okMsg" :title="pendingSaved ? 'Saved as awaiting payment' : 'Saved'" @again="startAgain()">
      <!-- 16 Nov 2026: Awaiting payment; the invoice can be downloaded again here or from the booking in Bookings -->
      <p class="saved-note" v-if="pendingSaved">Send the invoice to the prospect. Once they pay, open the booking in Bookings and press Continue to payment to finish it.</p>
      <p class="saved-note" v-else>Key this booking into eZee to block the room. The payment, if any, is under Accounting › Offline Payments (status Pending).</p>
      <!-- 16 Nov 2026: the buttons in one row: Download invoice, Open the booking (6 Nov: for whoever can see Bookings), Start another -->
      <template #actions>
        <button type="button" class="btn btn-primary" v-if="pendingSaved" @click="openInvoice()">Download invoice</button>
        <RouterLink class="btn" :class="{ 'btn-primary': !pendingSaved }" v-if="savedLink && canBookings" :to="{ path: '/Portfolio/bookings', query: { property: savedLink.property, id: savedLink.id } }">Open in Bookings</RouterLink>
      </template>
    </FormSaved>

    <template v-else-if="ready">
      <!-- 16 Nov 2026: drafts saved on the person's account (users/{uid}/drafts) -->
      <div class="notice draft-bar" v-if="draft && !resume">
        <span>{{ `You have a draft saved ${draft.when}${draft.label ? ` (${draft.label})` : ''}.` }}</span>
        <span class="draft-acts"><button type="button" class="btn btn-primary btn-sm" @click="useDraft()" :disabled="busy">Continue draft</button>
          <button type="button" class="btn btn-sm" @click="discardDraft()" :disabled="busy">Discard</button></span>
      </div>
      <div class="notice ok" v-if="draftMsg" style="margin-bottom:12px">{{ draftMsg }}</div>
      <StepStrip v-model="step" :steps="steps" label="Reservation steps" />
      <div class="notice error" v-show="formError" style="margin-top:14px">{{ formError }}</div>

      <section class="card rf-body">
        <!-- 1. Tenant -->
        <div v-show="cur === 'tenant'">
          <h3>Tenant</h3>
          <p class="help lock-note" v-if="resume">Saved with the booking. Change the tenant's details on their record after the booking is finished.</p>
          <fieldset class="lock" :disabled="!!resume">
          <!-- 13 Nov 2026: a phone match no longer fills the form by itself; the match is shown and filled in only when picked -->
          <div class="match" v-if="bk.existing && !bk.matchUsed">
            <div><b>{{ `Existing tenant found: ${bk.existing.name || '(no name)'} (${bk.existing.id})` }}</b>
              <p class="help">{{ [bk.existing.email, bk.existing.icPassport, bk.existing.nationality].filter(Boolean).join(' · ') || 'No other details saved.' }} The booking will be added to this tenant's record because the phone number matches.</p></div>
            <button type="button" class="btn btn-primary" @click="useMatch()">Use these details</button>
          </div>
          <p class="help" v-else-if="bk.existing">{{ `Details filled in from existing tenant ${bk.existing.id}. The booking will be added to their record.` }}</p>
          <div class="grid-fields">
            <div class="name-wrap">
              <FormField id="bName" label="Name" req placeholder="Full name as on IC / passport" v-model="bk.name" autocomplete="off" />
              <!-- 13 Nov 2026: existing tenants whose name matches what is typed; picking one fills the details and links the booking to them -->
              <div class="name-hits" v-if="nameHits.length && !bk.matchUsed">
                <p class="help">Existing tenants with this name. Pick one to fill in their details, or keep typing for a new tenant.</p>
                <button type="button" class="hit" v-for="t in nameHits" :key="t.id" @click="pickTenant(t)">
                  <b>{{ t.name || '(no name)' }}</b><span>{{ [t.id, t.phone, t.icPassport].filter(Boolean).join(' · ') }}</span>
                </button>
              </div>
            </div>
            <FormField id="bPhone" label="Phone" req placeholder="e.g. 012-345 6789" v-model="bk.phone" inputmode="tel" @change="refill(true)" />
            <FormField id="bEmail" label="Email" type="email" placeholder="name@email.com" v-model="bk.email" />
            <FormField id="bIc" label="IC / Passport" req placeholder="e.g. 900101-14-5678 or A12345678" v-model="bk.icPassport" />
            <FormField id="bNat" label="Nationality" v-model="bk.nationality" placeholder="e.g. Malaysian" />
            <FormField id="bDob" label="Date of birth" type="date" v-model="bk.dob" />
            <div class="field"><label for="bGender">Gender</label>
              <OptionPicker class="fld-pick" v-model="bk.gender" :options="GENDERS" label="Gender" placeholder="Not set" /></div>
            <FormField v-if="bk.gender === 'Other'" id="bGenderOther" label="If other, type" req v-model="bk.genderOther" />
          </div>
          <div class="sub-sec" v-for="(c, ci) in bk.coTenants" :key="c.key">
            <div class="card-head"><h3>{{ `Tenant ${ci + 2}` }}</h3><button type="button" class="btn" @click="bk.coTenants.splice(ci, 1)">Remove</button></div>
            <div class="grid-fields">
              <FormField :id="'cName' + ci" label="Name" req placeholder="Full name as on IC / passport" v-model="c.name" />
              <FormField :id="'cPhone' + ci" label="Phone" req placeholder="e.g. 012-345 6789" v-model="c.phone" inputmode="tel" />
              <FormField :id="'cEmail' + ci" label="Email" type="email" placeholder="name@email.com" v-model="c.email" />
              <FormField :id="'cIc' + ci" label="IC / Passport" req placeholder="e.g. 900101-14-5678 or A12345678" v-model="c.icPassport" />
              <FormField :id="'cNat' + ci" label="Nationality" placeholder="e.g. Malaysian" v-model="c.nationality" />
              <FormField :id="'cDob' + ci" label="Date of birth" type="date" v-model="c.dob" />
              <div class="field"><label>Gender</label><OptionPicker class="fld-pick" v-model="c.gender" :options="GENDERS" placeholder="Not set" :label="`Gender of tenant ${ci + 2}`" /></div>
              <FormField v-if="c.gender === 'Other'" :id="'cGo' + ci" label="If other, type" req v-model="c.genderOther" />
            </div>
          </div>
          <div class="sub-sec" v-if="!resume"><button type="button" class="btn" @click="addCoTenant()">+ Add another tenant</button></div>
          </fieldset>
        </div>

        <!-- 2. Stay -->
        <div v-show="cur === 'stay'">
          <h3>Stay</h3>
          <p class="help lock-note" v-if="resume">Saved with the booking, and the unit is held for these dates. To change them, finish the booking and edit it in Bookings.</p>
          <fieldset class="lock" :disabled="!!resume">
          <div class="grid-fields">
            <div class="field"><label class="req" for="bProp">Property</label>
              <PropertyPicker block class="fld-pick" v-model="bk.propertyId" :properties="properties" placeholder="Choose property" @change="loadUnitList()" /></div>
            <div class="field"><label class="req" for="bUnit">Unit</label>
              <OptionPicker class="fld-pick" v-model="bk.unitId" :disabled="!bk.propertyId" :options="units.map(x => ({ value: x.id, label: x.unitCode || x.id }))" :placeholder="bk.propertyId && !units.length ? 'No units found' : 'Choose unit'" label="Unit" searchable /></div>
            <FormField id="bIn" label="Check-in" req type="date" v-model="bk.arrival" />
            <FormField id="bOut" label="Check-out" req type="date" v-model="bk.departure" />
          </div>
          <p class="help" v-if="hasStay">{{ nights === 0 ? 'Same-day check-out (0 nights) · Short term' : `${nights} night${nights === 1 ? '' : 's'} · ${leaseLabel(nights)} (${leaseHint(nights)})` }}</p>
          </fieldset>
        </div>

        <!-- 3. Rent & deposit -->
        <div v-show="cur === 'rent'">
          <h3>Rent &amp; deposit</h3>
          <p class="help" style="margin:0 0 10px" v-if="hasStay">{{ longTerm ? `${leaseLabel(nights)}: the security deposit is 2 months of rent.` : 'Short term: no 2-month deposit.' }}</p>
          <!-- 16 Nov 2026 (Khairul): grouped and compact - Booking and Rent three across, the fees as a two-column list -->
          <div class="rd-sec">Booking</div>
          <div class="rd-3">
            <div class="field"><label class="req">Booking source</label><OptionPicker class="fld-pick" v-model="bk.bookingSource" :options="SOURCES_BK" label="Booking source" placeholder="Choose source…" /></div>
            <div class="field"><label class="req">Rental status</label><OptionPicker class="fld-pick" v-model="bk.rentalStatus" :options="RENTAL_STATUSES" label="Rental status" placeholder="Choose status…" /></div>
            <div class="field"><label for="bRentType">Type of rent</label>
              <OptionPicker class="fld-pick" v-model="bk.rentType" :options="RENT_TYPES" label="Type of rent" placeholder="Choose type of rent…" /></div>
          </div>
          <div class="rd-sec">Rent</div>
          <div class="rd-3">
            <FormField v-if="longTerm" id="bRent" label="Rental (RM)" req type="number" min="0" step="0.01" placeholder="0.00" v-model="bk.monthlyRent" />
            <FormField v-else id="bRental" label="Rental (RM)" req type="number" min="0" step="0.01" placeholder="0.00" v-model="bk.rental" />
            <div class="field" v-if="longTerm"><label class="req">Security deposit (2 months)</label><div class="input readonly">{{ rm(deposit) }}</div></div>
            <FormField v-else id="bSec" label="Security deposit (RM)" type="number" min="0" step="0.01" placeholder="0.00" v-model="bk.securityDeposit" />
          </div>
          <div class="rd-sec">Other fees (RM) <span>· leave empty if not charged</span></div>
          <div class="rd-fees">
            <label class="rd-fee" v-for="f in FEES" :key="f.key" :for="'bf' + f.key">
              <span>{{ f.short || f.label }}</span>
              <input class="input rd-amt" :class="{ on: +bk[f.key] > 0 }" :id="'bf' + f.key" type="number" min="0" step="0.01" placeholder="0.00" v-model="bk[f.key]" :aria-label="`${f.label} (RM)`">
            </label>
            <div class="rd-fee rd-total"><span>Total (rental, deposit &amp; fees)</span><b>{{ rm(grandTotal) }}</b></div>
          </div>
          <FormField v-if="+bk.othersFee > 0" id="bOthersNote" label="Others: what is it for?" v-model="bk.othersNote" style="margin-top:12px" />
        </div>

        <!-- 4. Invoice (16 Nov 2026): what the invoice shows; not paid yet = save as Awaiting payment and download it -->
        <div v-show="cur === 'invoice'">
          <h3>Invoice</h3>
          <p class="help" style="margin:0 0 12px" v-if="!resume">{{ invoiceReady ? 'What the invoice will show. Empty fields are left out.' : 'Finish Tenant, Stay and Rent & deposit first. The invoice is made from them.' }}</p>
          <div class="inv-prev" v-if="invoiceReady || resume">
            <div class="inv-col" v-for="g in invoicePreview.groups" :key="g.title">
              <h4>{{ g.title }}</h4>
              <div class="kv" v-for="[k, v] in g.rows" :key="k"><span>{{ k }}</span><span>{{ v }}</span></div>
            </div>
            <div class="inv-col" v-if="invoicePreview.amounts.length">
              <h4>Amounts</h4>
              <div class="kv" v-for="[k, v] in invoicePreview.amounts" :key="k"><span>{{ k }}</span><span>{{ rm(v) }}</span></div>
              <div class="kv inv-total"><span>Total</span><span>{{ rm(invoicePreview.total) }}</span></div>
            </div>
          </div>
          <template v-if="resume">
            <div class="notice await-bar"><span>Need to send it again?</span><button type="button" class="btn" @click="openInvoice()">Download invoice</button></div>
          </template>
          <template v-else>
            <div class="notice await-bar">
              <span><b>Rental status is Unpaid.</b> Save the booking as Awaiting payment and download the invoice to send. The unit is held for these dates; add the payment and handover from Bookings once they pay.</span>
              <button type="button" class="btn btn-primary" @click="saveBooking(true)" :disabled="busy || !invoiceReady" :title="invoiceReady ? '' : 'Finish Tenant, Stay and Rent & deposit first'">{{ busy ? 'Saving…' : 'Save & download invoice' }}</button>
            </div>
            <p class="help">Already paid? Set Rental status to Paid on Rent &amp; deposit; the Payment and Handover steps then show instead of this one.</p>
          </template>
        </div>

        <!-- 5. Payment -->
        <div v-show="cur === 'payment'">
          <h3>Payment</h3>
          <p class="help" v-if="unpaid" style="margin:0 0 10px">Rental status is Unpaid, so payment details are optional. If you type an amount, add the mode, purpose and receipt too.</p>
          <div class="grid-fields">
            <FormField id="bAmt" :label="longTerm ? 'Amount paid (RM)' : 'Amount (RM)'" :req="!longTerm && !unpaid" type="number" min="0" step="0.01" placeholder="0.00" v-model="bk.amount" />
            <div class="field"><label :class="{ req: +bk.amount > 0 }" for="bMode">Mode of payment</label>
              <OptionPicker class="fld-pick" v-model="bk.payMode" :options="PAY_MODES" label="Mode of payment" placeholder="Choose mode" /></div>
            <FormField id="bPayDate" label="Payment Date" type="date" v-model="bk.payDate" />
            <FormField id="bRef" label="Reference numbers" v-model="bk.paymentRef" placeholder="e.g. bank transfer ref or receipt no." />
            <FormField id="bEzee" label="eZee reservation no." v-model="bk.ezeeNo" placeholder="Add once it is keyed into eZee" />
          </div>
          <div class="field" style="margin-top:12px"><label :class="{ req: (!longTerm && !unpaid) || +bk.amount > 0 }" for="bNote">Purpose</label>
            <textarea class="input" id="bNote" style="height:90px" v-model="bk.note" placeholder="e.g. Rental, security deposit. Long notes are fine, e.g. Deposit = RM2000, Rental = RM2200, Total = RM4200; (-) Payroll = RM3050; Balance = RM950"></textarea></div>
          <div class="field" id="bReceipt" tabindex="-1" style="margin-top:12px"><label :class="{ req: +bk.amount > 0 }">Receipt</label>
            <DriveFiles kind="offline-payments" :key="bk.payId" :record-id="bk.payId" :label="payLabel()" :list-on-load="false" @folder="l => bk.docsLink = l" /></div>
          <p class="help">The payment is saved under Accounting › Offline Payments (status Pending), not on the booking. Accounting checks it there.</p>
        </div>

        <!-- 6. Handover -->
        <div v-show="cur === 'handover'">
          <h3>Door access and passcodes</h3>
          <div class="grid-fields">
            <FormField id="bPass" label="Main door passcode" placeholder="e.g. 482916" v-model="bk.mainPasscode" autocomplete="off" />
            <FormField id="bExp" label="Current expiry date" :req="!!bk.mainPasscode.trim()" type="date" v-model="bk.currentExpiry" />
            <FormField id="bNextPass" label="Next door passcode" placeholder="e.g. 715203" v-model="bk.nextPasscode" autocomplete="off" />
            <FormField id="bNextExp" label="Next expiry date" :req="!!bk.nextPasscode.trim()" type="date" v-model="bk.nextExpiry" />
          </div>
        </div>

        <!-- 7. Review & save -->
        <div v-show="cur === 'review'">
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
          <div class="rev when" v-if="resume">
            <h4>When you save</h4>
            <p>{{ `- ${resume.bookingNo || resume.id} stops being Awaiting payment and becomes a normal booking.` }}</p>
            <p v-if="+bk.amount > 0">- The payment goes to Accounting › Offline Payments (status Pending) for checking.</p>
            <p v-if="lead">{{ `- ${lead.id} is marked Paid · Booked.` }}</p>
            <p><b>- Key this booking into eZee to block the room.</b></p>
          </div>
          <div class="rev when" v-else-if="unpaidNew">
            <h4>When you save</h4>
            <p>{{ bk.existing ? `- The booking is added to tenant ${bk.existing.id}.` : '- The customer is saved as a new tenant.' }}</p>
            <p>- The booking is saved as <b>Awaiting payment</b> and the unit is held for these dates.</p>
            <p>- The invoice opens to download and send.</p>
            <p v-if="lead">{{ `- ${lead.id} stays Interested until the booking is paid.` }}</p>
            <p>- Once they pay, open the booking in Bookings and press Continue to payment to add the payment and handover.</p>
          </div>
          <div class="rev when" v-else>
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
        <button type="button" class="btn" v-if="!resume" @click="saveDraft()" :disabled="busy || draftBusy" title="Saves what you've typed on your account. Only you can see it.">{{ draftBusy ? 'Saving…' : 'Save draft' }}</button>
        <button type="button" class="btn btn-primary" v-if="step < steps.length - 1" @click="move(1)">Next</button>
        <button type="button" class="btn btn-primary" v-else @click="saveBooking()" :disabled="busy || !complete" :title="complete ? '' : 'Finish the steps listed above first'">{{ busy ? 'Saving…' : unpaidNew ? 'Save & download invoice' : 'Save booking' }}</button>
      </div>
    </template>
    <InvoiceDialog v-if="invoice" :invoice="invoice" :booking-no="invoiceNo" @close="invoice = null" />
  </div>
</template>

<script>
// Reservation Lodgment Form (Operations > Booking forms > Reservation). Moved out of pages/Operations/SalesLeads.vue on 4 Nov 2026;
// the fields, checks and what is saved are unchanged. Two ways in:
//   - from an inquiry (?lead=LD-0001, Offline Inquiries > Create booking): offlineBookings/offline_LD-0001, the inquiry marked Paid · Booked
//   - without an inquiry (walk-in, returning tenant): offlineBookings/offline_BK-0001 (counters/offlineBookings)
// Drafts (16 Nov 2026): Save draft keeps the form on the person's account, users/{uid}/drafts/reservation (or reservation_LD-0001 for an inquiry).
// One draft per form per inquiry; only that person can read it (Firestore rules 0.69). Saving the booking deletes it.
// Both: tenants/{TEN-0001} + private/main (a returning tenant is found by phone), lodgmentCounters (DM-014 booking no.),
// the payment in offlinePayments (status Pending), door passcodes in offlineBookings/{id}/private/main, an audit entry, notifications.
import { collection, doc, getDoc, getDocs, setDoc, deleteDoc, query, where, runTransaction, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase.js';
import { useSession } from '@/stores/session.js';
import { stateFor } from '@/lib/states.js';
import { linkTenant } from '@/lib/portfolio-data.js';
import OptionPicker from '@/components/OptionPicker.vue';
import PropertyPicker from '@/components/PropertyPicker.vue';
import FormField from '@/components/FormField.vue';
import DriveFiles from '@/components/DriveFiles.vue';
import StepStrip from '@/components/StepStrip.vue';
import { RENT_TERMS, rentTermLabel } from '@/lib/rent-term.js';
import { leaseLabel, leaseTerm, LEASE_HINT } from '@/lib/lease-term.js';
import FormSaved from '@/components/FormSaved.vue';
import { idPrefix } from '@/lib/lodgment.js';
import { loadProperties, loadUnits, audit, friendlyError } from '@/lib/finance-data.js';
import { allDone, stillMissing } from '@/lib/steps.js';
import { STATUS, CONTACT_ALL, DIRECT_BOOKERS, MON, nowIso, isoOf, num, phoneKey, searchWords, findTenant, findTenantsByName, privateOf, guestContact } from '@/lib/offline.js';
import { notifyRole, notifyUser } from '@/services/notificationService.js';
import { can } from '@/lib/access.js';
import { askConfirm } from '@/lib/confirm.js';
import InvoiceDialog from '@/components/InvoiceDialog.vue';
import { invoiceOf } from '@/lib/booking-invoice.js';

const me = useSession();
const LONG_TERM_NIGHTS = 30;
const GENDERS = ['Male', 'Female', 'Other'].map(x => ({ value: x, label: x }));
// 16 Nov 2026: no "Choose…" row in the lists; the drop-downs show a grey placeholder until something is picked
const SOURCES_BK = ['Offline', 'Website', 'Agent', 'OTA'].map(x => ({ value: x, label: x }));
const RENTAL_STATUSES = [{ value: 'Paid', label: 'Paid' }, { value: 'Unpaid', label: 'Unpaid' }];
// 16 Nov 2026: shown as Short / Mid / Long term; saved as Daily / Monthly / Yearly (lib/rent-term.js)
const RENT_TYPES = RENT_TERMS.map(x => ({ value: x.value, label: x.label }));
const PAY_MODES = ['Bank transfer', 'Cash', 'Card', 'Online banking / QR', 'Cheque', 'Other'].map(x => ({ value: x, label: x }));
const FEES = [{ key: 'utilityDeposit', label: 'Utility deposit' }, { key: 'internetFee', label: 'Internet fees' }, { key: 'carparkFee', label: 'Carpark fees' },
  { key: 'cleaningFee', label: 'Cleaning fees' }, { key: 'taFee', label: 'Tenancy agreement fees', short: 'Tenancy agreement' }, { key: 'taStampFee', label: 'Tenancy agreement stamping fees', short: 'TA stamping' },
  { key: 'gatewayFee', label: 'Payment gateway charges', short: 'Payment gateway' }, { key: 'cardFee', label: 'Credit card charges' }, { key: 'othersFee', label: 'Others' }];
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const toCents = v => Math.round((+v || 0) * 100) / 100;
const emailOk = e => !e || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const stop = msg => Object.assign(new Error(msg), { plain: true });
const errText = (e, what) => (e.plain ? e.message : friendlyError(e, what));
const filled = v => !!String(v ?? '').trim();
// What counts as "something typed" for the leave warning (not the ids and lookups the form sets itself)
const typed = bk => JSON.stringify({ ...bk, existing: undefined, matchUsed: undefined, payId: undefined });
// The step a save message is about, so the form jumps there
const STEP_OF = [[/tenant|phone|email|IC or passport|gender/i, 'tenant'], [/property and unit|check-in|Check-out|already booked/, 'stay'], [/booking source|rental status|monthly rent/, 'rent'],
  [/amount paid|mode of payment|purpose|receipt/, 'payment'], [/passcode/, 'handover']];

export default {
  components: { PropertyPicker, OptionPicker, DriveFiles, FormField, StepStrip, FormSaved, InvoiceDialog },
  // resumeId (16 Nov 2026): an Awaiting payment booking (offlineBookings status 'pending') opened to finish it
  props: { leadId: { type: String, default: '' }, resumeId: { type: String, default: '' } },
  emits: ['dirty'],
  data() {
    return {
      GENDERS, SOURCES_BK, RENTAL_STATUSES, RENT_TYPES, PAY_MODES, FEES,
      lead: null, tenant: null, bk: {}, properties: [], units: [], start: '', nameHits: [], nameTimer: null,
      draft: null, draftBusy: false, draftMsg: '', resume: null, pendingSaved: false, invoice: null, invoiceNo: '',
      step: 0, ready: false, saved: false, savedLink: null, canBookings: can(useSession(), 'bookings.view'), blocked: '', okMsg: '', formError: '', loading: true, busy: false
    };
  },
  async mounted() {
    try {
      if (this.resumeId) { await this.loadResume(this.resumeId); this.loading = false; return; }
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
    // Other fees on the Rent & deposit step (not the rental or security deposit); 3 decimals in the sum, 2 on screen
    // 16 Nov 2026: the total on Rent & deposit = rental + security deposit + other fees (same amounts the booking saves)
    grandTotal() { const b = this.bk, rent = this.longTerm ? toCents(b.monthlyRent) + this.deposit : toCents(b.rental) + toCents(b.securityDeposit); return Math.round((rent + this.feesTotal) * 1000) / 1000; },
    feesTotal() { return Math.round(FEES.reduce((t, f) => t + (+this.bk[f.key] || 0), 0) * 1000) / 1000; },
    dirty() { return this.ready && !this.saved && typed(this.bk) !== this.start; },
    // The steps and what each needs, taken from the checks in saveBooking() (which still runs on Save)
    // 16 Nov 2026 (Khairul): the steps follow Rental status. Unpaid: Invoice, no Payment or Handover (saved as Awaiting payment,
    // finished later from Bookings). Paid: Payment and Handover, no Invoice. Not chosen yet: neither. Finishing a booking: all.
    steps() {
      const all = this.allSteps, st = this.bk.rentalStatus;
      if (this.resume) return all;
      const hide = st === 'Unpaid' ? ['payment', 'handover'] : st === 'Paid' ? ['invoice'] : ['invoice', 'payment', 'handover'];
      return all.filter(x => !hide.includes(x.key));
    },
    cur() { return this.steps[this.step]?.key || ''; },
    // A new booking that is Unpaid: saved as Awaiting payment
    unpaidNew() { return !this.resume && this.unpaid; },
    allSteps() {
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
        { key: 'invoice', label: 'Invoice', required: [] },
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
    // The Invoice step's preview: the same rows as the PDF, empty ones left out
    invoicePreview() {
      if (!this.bk.coTenants) return { groups: [], amounts: [], total: 0 };
      const inv = this.formInvoice(), keep = rows => rows.filter(([, v]) => String(v ?? '').trim());
      return { groups: [{ title: 'Tenant', rows: keep(inv.tenant) }, { title: 'Property', rows: keep(inv.property) }, { title: 'Rent & terms', rows: keep(inv.terms) }].filter(g => g.rows.length),
        amounts: inv.amounts, total: inv.total };
    },
    // Tenant, Stay and Rent & deposit done: enough to save as Awaiting payment and make the invoice
    invoiceReady() { return this.steps.length > 3 && allDone(this.steps.slice(0, 3)); },
    missing() { return stillMissing(this.steps); },
    // The summary on Review & save
    review() {
      const b = this.bk, d = v => (filled(v) ? String(v) : '—'), money = v => (+v > 0 ? this.rm(v) : '—');
      const prop = this.properties.find(p => p.id === b.propertyId);
      const fees = FEES.filter(f => +b[f.key] > 0).map(f => [f.label, this.rm(b[f.key])]);
      const pass = (code, exp) => (filled(code) ? `Set${exp ? `, expires ${this.full(exp)}` : ''}` : 'Not set');
      return [
        { key: 'tenant', label: 'Tenant', rows: [['Name', d(b.name)], ['Phone', d(b.phone)], ['Email', d(b.email)], ['IC / Passport', d(b.icPassport)], ['Nationality', d(b.nationality)],
          ...(b.existing ? [['Existing tenant', b.existing.id]] : []), ...(b.coTenants.length ? [['Other tenants', b.coTenants.map(c => c.name || '(no name)').join(', ')]] : [])] },
        { key: 'stay', label: 'Stay', rows: [['Property', prop?.name || '—'], ['Unit', this.units.find(u => u.id === b.unitId)?.unitCode || d(b.unitId)], ['Check-in', b.arrival ? this.full(b.arrival) : '—'], ['Check-out', b.departure ? this.full(b.departure) : '—'],
          ['Nights', this.hasStay ? (this.nights === 0 ? '0 · Same-day check-out' : `${this.nights} · ${leaseLabel(this.nights)}`) : '—']] },
        { key: 'rent', label: 'Rent & deposit', rows: [['Booking source', d(b.bookingSource)], ['Rental status', d(b.rentalStatus)], ['Type of rent', d(rentTermLabel(b.rentType))],
          ['Rental', money(this.longTerm ? b.monthlyRent : b.rental)], ['Security deposit', this.longTerm ? this.rm(this.deposit) : money(b.securityDeposit)], ...fees,
          ...(+b.othersFee > 0 ? [['Others is for', d(b.othersNote)]] : [])] },
        { key: 'payment', label: 'Payment', rows: [['Amount', money(b.amount)], ['Mode', d(b.payMode)], ['Payment Date', b.payDate ? this.full(b.payDate) : '—'], ['Reference', d(b.paymentRef)],
          ['eZee reservation no.', d(b.ezeeNo)], ['Purpose', d(b.note)], ['Receipt', b.docsLink ? 'Uploaded' : 'None']] },
        { key: 'handover', label: 'Handover', rows: [['Main door passcode', pass(b.mainPasscode, b.currentExpiry)], ['Next door passcode', pass(b.nextPasscode, b.nextExpiry)]] }
      ].map(g => ({ ...g, index: this.steps.findIndex(x => x.key === g.key) })).filter(g => g.index >= 0);
    }
  },
  watch: {
    'steps.length'(n) { if (this.step > n - 1) this.step = Math.max(0, n - 1); },
    dirty: { handler(v) { this.$emit('dirty', v); }, immediate: true },
    // Name search: waits until typing stops (one query per pause, not per key), only while no tenant has been picked
    'bk.name'(v) {
      clearTimeout(this.nameTimer);
      // A lead already linked to a tenant books for that tenant, so there is nothing to search
      if (this.bk.matchUsed || this.lead?.tenantId || String(v || '').trim().length < 2) { this.nameHits = []; return; }
      this.nameTimer = setTimeout(async () => {
        const hits = await findTenantsByName(v).catch(() => []);
        if (this.bk.name === v && !this.bk.matchUsed) this.nameHits = hits;
      }, 500);
    }
  },
  beforeUnmount() { clearTimeout(this.nameTimer); },
  methods: {
    leaseLabel,
    leaseHint(n) { return LEASE_HINT[leaseTerm(n)]; },
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
    dropLead() { this.$router.replace({ path: '/Portfolio/bookings/new' }); },
    async startAgain() {
      if (this.lead || this.resume) { this.dropLead(); return; }
      this.saved = false; this.savedLink = null; this.okMsg = ''; this.step = 0; this.ready = false;
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
      this.bk = { name: ld.contactName, phone: ld.phone, email: ld.email, icPassport: '', nationality: 'Malaysian', dob: '', gender: '', genderOther: '', coTenants: [], existing: null, matchUsed: false,
        rentType: '', bookingSource: '',   // 16 Nov 2026: starts empty (placeholder)
        rentalStatus: '', mainPasscode: '', currentExpiry: '', nextPasscode: '', nextExpiry: '', rental: '', securityDeposit: '', utilityDeposit: '', internetFee: '', carparkFee: '', cleaningFee: '', taFee: '', taStampFee: '', gatewayFee: '', cardFee: '', othersFee: '', othersNote: '',
        payMode: '', payDate: today(), payId: doc(collection(db, 'offlinePayments')).id, docsLink: '',
        propertyId: '', unitId: '', arrival: '', departure: '', amount: '', monthlyRent: '', paymentRef: '', ezeeNo: '', note: '' };
      this.units = []; this.formError = '';
      await this.refill();
      try { this.properties = await loadProperties(); } catch { this.properties = []; this.formError = 'Could not load the property list. Check your connection and reload.'; }
      this.start = typed(this.bk);
      this.ready = true;
      await this.findDraft();
    },

    // ---------- Awaiting payment (16 Nov 2026) ----------
    // The invoice of what is on the form (lib/booking-invoice.js); the long-term deposit is the worked-out 2 months
    formInvoice() {
      const b = this.bk, prop = this.properties.find(p => p.id === b.propertyId), unit = this.units.find(u => u.id === b.unitId);
      return invoiceOf({ ...b, securityDeposit: this.longTerm ? this.deposit : b.securityDeposit },
        { name: b.name.trim(), email: b.email.trim(), phone: b.phone.trim() },
        { propertyName: prop?.name || '', unitCode: unit?.unitCode || b.unitId || '', unitType: unit?.info?.type || '' });
    },
    openInvoice() { this.invoice = this.formInvoice(); },
    // Opens a booking saved as Awaiting payment, filled in, at the Payment step
    async loadResume(id) {
      const snap = await getDoc(doc(db, 'offlineBookings', id)).catch(e => { if (e.code === 'permission-denied') return null; throw e; });
      if (!snap?.exists()) { this.blocked = `Booking ${id} was not found, or you can't open it.`; return; }
      const d = snap.data();
      if (d.status !== 'pending') { this.blocked = `${d.bookingNo || id} is not awaiting payment any more. Open it in Bookings to see or change it.`; return; }
      this.resume = { id, ...d };
      const t = d.tenantId ? await getDoc(doc(db, 'tenants', d.tenantId, 'private', 'main')).catch(() => null) : null, tp = t?.exists() ? t.data() : {};
      const pc = await getDoc(doc(db, 'offlineBookings', id, 'private', 'main')).catch(() => null), pp = pc?.exists() ? pc.data() : {};
      if (d.inquiryId) await this.loadLead(d.inquiryId).catch(() => {});   // the inquiry is marked booked on save (when it can be read)
      const v = x => (x || x === 0 ? String(x) : '');
      this.bk = { name: tp.name || '', phone: tp.phone || '', email: tp.email || '', icPassport: tp.icPassport || '', nationality: tp.nationality || '', dob: tp.dob || '',
        gender: tp.gender || '', genderOther: tp.genderOther || '', coTenants: [], existing: null, matchUsed: true,
        rentType: d.rentType || 'Daily', bookingSource: d.bookingSource || '', rentalStatus: 'Paid',   // finishing = paid (16 Nov 2026)
        mainPasscode: pp.mainDoorPasscode || '', currentExpiry: pp.currentExpiryDate || '', nextPasscode: pp.nextDoorPasscode || '', nextExpiry: pp.nextExpiryDate || '',
        rental: d.longTerm ? '' : v(d.rental), monthlyRent: d.longTerm ? v(d.monthlyRent || d.rental) : '', securityDeposit: d.longTerm ? '' : v(d.securityDeposit),
        ...Object.fromEntries(FEES.map(f => [f.key, d[f.key] > 0 ? v(d[f.key]) : ''])), othersNote: d.othersNote || '',
        payMode: '', payDate: today(), payId: doc(collection(db, 'offlinePayments')).id, docsLink: '',
        propertyId: d.propertyId || '', unitId: d.unitId || '', arrival: d.arrival || '', departure: d.departure || '', amount: '', paymentRef: '', ezeeNo: d.ezeeReservationNo || '', note: '' };
      try { this.properties = await loadProperties(); } catch { this.properties = []; }
      if (d.propertyId) { try { this.units = await loadUnits(d.propertyId); } catch { this.units = []; } }
      this.invoiceNo = d.bookingNo || '';
      this.step = Math.max(0, this.steps.findIndex(x => x.key === 'payment'));
      this.start = typed(this.bk);
      this.ready = true;
    },
    // Finishes an Awaiting payment booking: payment, passcodes and rent as typed; the booking becomes active (Firestore rules 0.71)
    async saveResume() {
      const b = this.bk, r = this.resume, ld = this.lead;
      this.busy = true; this.formError = '';
      try {
        const prop = this.properties.find(p => p.id === b.propertyId);
        const st = await stateFor(b.propertyId), tag = st ? { state: st } : {};
        const unitCode = r.unitCode || this.units.find(u => u.id === b.unitId)?.unitCode || await this.unitCodeOf(b.unitId);
        const bRef = doc(db, 'offlineBookings', r.id);
        const { coTenantIds, ...ex } = this.extra(r.coTenantIds || []);
        await runTransaction(db, async tx => {
          const cur = await tx.get(bRef);
          if (!cur.exists() || cur.data().status !== 'pending') throw stop(`${r.bookingNo || r.id} is not awaiting payment any more. Someone may have finished it already.`);
          tx.update(bRef, { ...ex, monthlyRent: this.longTerm ? toCents(b.monthlyRent) : 0, deposit: this.longTerm ? this.deposit : 0,
            ezeeReservationNo: b.ezeeNo.trim(), status: 'active', paidAt: serverTimestamp(), updatedAt: serverTimestamp(), updatedBy: me.user.uid });
          tx.set(doc(bRef, 'private', 'main'), this.passcodes());
          if (+b.amount > 0) tx.set(doc(db, 'offlinePayments', b.payId), { ...this.payRecord(prop, unitCode, r.id, r.bookingNo), ...tag });
          if (ld && ld.bookingId === r.id) {
            const h = this.entry(`Paid: ${r.bookingNo || r.id} is no longer awaiting payment.${b.note.trim() ? ' ' + b.note.trim() : ''}`);
            tx.update(doc(db, 'offlineInquiries', ld.id), { status: 'booked', updatedAt: serverTimestamp(), history: arrayUnion(h) });
          }
          audit(tx, me, { action: 'offlineBooking.paid', entity: `offlineBookings/${r.id}`, propertyId: b.propertyId,
            changes: [{ field: 'status', old: 'pending', new: 'active' }, ...(+b.amount > 0 ? [{ field: 'payment', old: null, new: toCents(b.amount) }] : [])] });
        });
        this.notify({ roles: ['finance', 'director'], title: 'New offline booking', refId: r.id,
          message: `${r.bookingNo || r.id} paid: ${b.name.trim()}, ${unitCode || 'unit'}, ${this.full(b.arrival)} to ${this.full(b.departure)}. Key it into eZee.`, link: '/Portfolio/bookings' });
        this.okMsg = `${r.bookingNo || r.id} is finished and no longer awaiting payment.${ld && ld.bookingId === r.id ? ` ${ld.id} is marked Paid · Booked.` : ''}`;
        this.savedLink = { property: b.propertyId, id: r.id };
        this.saved = true; window.scrollTo(0, 0);
      } catch (e) { this.formError = errText(e, 'finish the booking'); window.scrollTo(0, 0); }
      this.busy = false;
    },

    // ---------- Drafts on the person's account ----------
    draftRef() { return doc(db, 'users', me.user.uid, 'drafts', this.lead ? `reservation_${this.lead.id}` : 'reservation'); },
    async findDraft() {
      this.draft = null; this.draftMsg = '';
      if (this.resume) return;
      const snap = await getDoc(this.draftRef()).catch(() => null);
      if (!snap?.exists()) return;
      const d = snap.data(), at = d.savedAt?.toDate ? d.savedAt.toDate() : null;
      this.draft = { ...d, when: at ? `on ${at.getDate()} ${MON[at.getMonth()]}, ${at.toLocaleTimeString('en-MY', { hour: 'numeric', minute: '2-digit' })}` : 'earlier' };
    },
    async useDraft() {
      const d = this.draft;
      let saved;
      try { saved = JSON.parse(d.bk || '{}'); } catch { this.formError = 'This draft could not be read. Discard it and start again.'; return; }
      this.busy = true;
      Object.assign(this.bk, saved, { existing: null, matchUsed: false });
      if (!Array.isArray(this.bk.coTenants)) this.bk.coTenants = [];
      this.units = [];
      if (this.bk.propertyId) { try { this.units = await loadUnits(this.bk.propertyId); } catch { this.formError = 'Could not load the units. Check your connection and try again.'; } }
      await this.refill().catch(() => {});
      if (saved.matchUsed && this.bk.existing) this.bk.matchUsed = true;
      this.step = Math.min(Math.max(0, +d.step || 0), Math.max(0, this.steps.length - 1));
      this.start = typed(this.bk);
      this.draft = null; this.busy = false;
      this.draftMsg = 'Draft opened. Save draft again to keep new changes.';
    },
    async discardDraft() {
      if (!(await askConfirm({ title: 'Discard draft?', message: 'The saved draft will be deleted.', confirmText: 'Discard', danger: true }))) return;
      this.busy = true;
      try { await deleteDoc(this.draftRef()); this.draft = null; } catch (e) { this.formError = friendlyError(e, 'discard the draft'); }
      this.busy = false;
    },
    async saveDraft() {
      this.draftBusy = true; this.formError = '';
      const b = this.bk, unit = this.units.find(u => u.id === b.unitId)?.unitCode || '';
      try {
        await setDoc(this.draftRef(), { form: 'reservation', leadId: this.lead?.id || '', step: this.step, label: [b.name, unit].filter(x => String(x || '').trim()).join(' · '),
          bk: JSON.stringify({ ...b, existing: undefined }), savedAt: serverTimestamp() });
        this.start = typed(this.bk); this.draft = null;
        const t = new Date();
        this.draftMsg = `Draft saved at ${t.toLocaleTimeString('en-MY', { hour: 'numeric', minute: '2-digit' })}. Open New booking again to continue it.`;
      } catch (e) { this.formError = friendlyError(e, 'save the draft'); }
      this.draftBusy = false;
    },
    // After the booking is saved: the draft is no longer needed (best effort)
    clearDraft() { this.draft = null; this.draftMsg = ''; deleteDoc(this.draftRef()).catch(() => {}); },
    async refill(typed = false) {
      const phone = this.bk.phone;
      const t = this.lead?.tenantId ? this.tenant : await findTenant(phone).catch(() => null);
      if (typed && this.bk.phone !== phone) return;
      // A match is only offered (shown above the fields); useMatch() fills the details when it is picked
      if ((t?.id || null) !== (this.bk.existing?.id || null)) this.bk.matchUsed = false;
      this.bk.existing = t || null;
    },
    // A tenant picked from the name search: their phone is filled too, since the booking is linked to the tenant by phone on save
    pickTenant(t) {
      clearTimeout(this.nameTimer); this.nameHits = [];
      this.bk.existing = t; this.bk.phone = t.phone || this.bk.phone;
      this.useMatch();
    },
    useMatch() {
      const t = this.bk.existing;
      if (!t) return;
      Object.assign(this.bk, { name: t.name || this.bk.name, email: t.email || this.bk.email, icPassport: t.icPassport || this.bk.icPassport, nationality: t.nationality || this.bk.nationality,
        dob: t.dob || this.bk.dob, gender: t.gender || this.bk.gender, genderOther: t.genderOther || this.bk.genderOther, matchUsed: true });
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
          tx.set(doc(tRef, 'private', 'contact'), guestContact(details), { merge: true });   // name, phone, email only (17 Nov 2026)
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
        taFee: toCents(b.taFee), taStampFee: toCents(b.taStampFee), gatewayFee: toCents(b.gatewayFee), cardFee: toCents(b.cardFee), othersFee: toCents(b.othersFee), othersNote: +b.othersFee > 0 ? b.othersNote.trim() : ''};
    },
    // The unit code for the booking, read from the unit itself when the loaded list doesn't have it
    async unitCodeOf(unitId) { try { const u = await getDoc(doc(db, 'units', unitId)); return u.exists() ? u.data().unitCode || '' : ''; } catch { return ''; } },
    // Opens the step a validation message is about, scrolls to the field and puts the cursor there
    focusFor(msg) {
      const s = this.steps.findIndex(x => x.key === (STEP_OF.find(([re]) => re.test(msg)) || [])[1]);
      if (s >= 0) this.step = s;
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
        forMonth: (b.arrival || b.payDate || today()).slice(0, 7),   // 19 Nov 2026: the booking's first payment is for its check-in month
        createdAt: serverTimestamp(), createdBy: me.user.uid, submittedByName: me.name };
    },
    // An existing booking on this unit whose dates overlap: offline bookings, and eZee bookings in the months around the stay.
    async findClash(b) {
      try {
        const hit = x => x.status !== 'cancelled' && (x.arrival || '') < b.departure && (x.departure || '9999') > b.arrival;
        const offs = await getDocs(query(collection(db, 'offlineBookings'), where('propertyId', '==', b.propertyId), where('unitId', '==', b.unitId)));
        for (const d of offs.docs) if (hit(d.data())) return { no: d.data().bookingNo || d.id, arrival: d.data().arrival, departure: d.data().departure };
        const months = []; let y = +b.arrival.slice(0, 4), m = +b.arrival.slice(5, 7);
        const endKey = b.departure.slice(0, 7);
        for (let i = 0; i < 29; i++) { const k = `${y}-${String(m).padStart(2, '0')}`; months.push(k); if (k >= endKey) { m++; if (m > 12) { m = 1; y++; } months.push(`${y}-${String(m).padStart(2, '0')}`); break; } m++; if (m > 12) { m = 1; y++; } }
        const ez = await getDocs(query(collection(db, 'bookings'), where('propertyId', '==', b.propertyId), where('unitId', '==', b.unitId), where('departureMonth', 'in', months.slice(0, 30))));
        for (const d of ez.docs) if (hit(d.data())) return { no: d.data().reservationNo || d.id, arrival: d.data().arrival, departure: d.data().departure };
      } catch (e) { console.warn('Could not check for clashing bookings:', e.code || e.message); }
      return null;
    },
    // pending (16 Nov 2026): Save as awaiting payment - only Tenant, Stay and Rent & deposit are checked; no payment is saved
    async saveBooking(pending = false) {
      pending = pending === true || this.unpaidNew;   // 16 Nov 2026: Unpaid = Awaiting payment
      const b = this.bk, ld = this.lead;
      const base = !b.name.trim() ? 'Add the tenant\'s name.'
        : phoneKey(b.phone).length < 9 ? 'Add a full phone number. It is how a returning tenant is recognised.'
        : !emailOk(b.email.trim()) ? 'That email address doesn\'t look right.'
        : !b.icPassport.trim() ? 'Add the IC or passport number.'
        : b.gender === 'Other' && !b.genderOther.trim() ? 'Type the gender, or pick another option.'
        : !b.unitId ? 'Choose the property and unit.'
        : !b.bookingSource ? 'Choose the booking source.'
        : !b.rentalStatus ? 'Choose the rental status.'
        : !b.arrival || !b.departure ? 'Add the check-in and check-out dates.'
        : this.nights < 0 ? "Check-out can't be before check-in."
        : this.longTerm && !(+b.monthlyRent > 0) ? 'Add the monthly rent. The 2-month deposit is worked out from it.' : '';
      const err = base || (pending ? this.coError() : !this.longTerm && !this.unpaid && !(+b.amount > 0) ? 'Add the amount paid.'
        : +b.amount > 0 && !b.payMode ? 'Choose the mode of payment.'
        : +b.amount > 0 && !b.note.trim() ? 'Add the purpose of the payment.'
        : +b.amount > 0 && !b.docsLink ? 'Upload at least one receipt for the payment.'
        : b.mainPasscode.trim() && !b.currentExpiry ? 'Add the expiry date of the main door passcode.'
        : b.nextPasscode.trim() && !b.nextExpiry ? 'Add the expiry date of the next door passcode.' : this.coError());
      if (err) { this.formError = err; this.focusFor(err); return; }
      if (this.resume) return this.saveResume();
      // Same unit, overlapping dates: refused (a check-out on the day of the next check-in is fine)
      const clash = await this.findClash(b);
      if (clash) { this.formError = `${b.unitId ? (this.units.find(u => u.id === b.unitId)?.unitCode || 'This unit') : 'This unit'} is already booked ${this.full(clash.arrival)} to ${this.full(clash.departure)} (${clash.no}). Pick other dates or another unit.`; this.focusFor(this.formError); return; }
      if (!ld) return this.saveDirect(pending);

      this.busy = true; this.formError = '';
      try {
        const prop = this.properties.find(p => p.id === b.propertyId), unit = this.units.find(u => u.id === b.unitId);
        const details = { kind: 'tenant', name: b.name.trim(), phone: b.phone.trim(), phoneKey: phoneKey(b.phone), email: b.email.trim(),
          icPassport: b.icPassport.trim(), nationality: b.nationality.trim(), searchWords: searchWords(b.name),
          dob: b.dob || '', gender: b.gender || '', genderOther: b.gender === 'Other' ? b.genderOther.trim() : '' };
        const coIds = await this.saveCoTenants();
        // The booking and its payment carry the property's state; the tenant collects the states they stayed in
        const st = await stateFor(b.propertyId), tag = st ? { state: st } : {}, tStates = st ? { states: arrayUnion(st) } : {};
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
          if (known) tx.update(tRef, { status: 'active', lastInquiryId: ld.id, ...tStates, updatedAt: serverTimestamp(), updatedBy: me.user.uid });
          else {
            tx.set(cRef, { next: n + 1 });
            tx.set(tRef, { status: 'active', firstInquiryId: ld.id, lastInquiryId: ld.id, ...tStates, createdAt: serverTimestamp(), createdBy: me.user.uid, createdByName: me.name });
          }
          tx.set(doc(tRef, 'private', 'main'), details, { merge: true });
          tx.set(doc(tRef, 'private', 'contact'), guestContact(details), { merge: true });   // name, phone, email only (17 Nov 2026)
          tx.set(lcRef, { next: ln + 1 });
          tx.set(bRef, { source: 'offline', inquiryId: ld.id, bookingNo, tenantId,
            propertyId: b.propertyId, ...tag, propertyName: prop?.name || '', unitId: b.unitId, unitCode,
            arrival: b.arrival, departure: b.departure, nights: this.nights, longTerm: this.longTerm,
            monthlyRent: this.longTerm ? toCents(b.monthlyRent) : 0, deposit: this.longTerm ? this.deposit : 0,
            ezeeReservationNo: b.ezeeNo.trim(), ...this.extra(coIds), status: pending ? 'pending' : 'active',
            createdAt: serverTimestamp(), createdBy: me.user.uid, createdByName: me.name });
          tx.set(doc(bRef, 'private', 'main'), this.passcodes());
          if (!pending && +b.amount > 0) tx.set(doc(db, 'offlinePayments', b.payId), { ...this.payRecord(prop, unitCode, bookingId, bookingNo), ...tag });
          const h = this.entry(`${pending ? `Saved as ${bookingNo}, awaiting payment` : 'Paid and booked'}: ${unitCode || 'unit'}, ${this.full(b.arrival)} to ${this.full(b.departure)}. `
            + `${!known ? `Saved as new tenant ${details.name} (${tenantId}).` : `Added to existing tenant ${details.name} (${tenantId}).`}${b.note.trim() ? ' ' + b.note.trim() : ''}`);
          // Awaiting payment: the inquiry stays Interested (Pending payment) until the booking is finished
          tx.update(lRef, { status: pending ? ld.status : 'booked', tenantId, bookingId, updatedAt: serverTimestamp(), history: arrayUnion(h) });
          tx.set(doc(lRef, 'private', 'main'), { contactName: details.name, phone: details.phone, phoneKey: details.phoneKey, email: details.email }, { merge: true });
          audit(tx, me, { action: 'offlineBooking.create', entity: `offlineBookings/${bookingId}`, propertyId: b.propertyId,
            changes: [{ field: 'status', old: ld.status, new: pending ? ld.status : 'booked' }, { field: 'tenantId', old: null, new: tenantId }, { field: 'unitId', old: null, new: b.unitId },
              ...(pending ? [{ field: 'bookingStatus', old: null, new: 'pending' }] : [])] });
          return { isNew: !known, bookingNo, tenantId };
        });

        if (pending) { this.afterPending(res.bookingNo, bookingId, res.tenantId, `${ld.id} saved as ${res.bookingNo}, awaiting payment. ${res.isNew ? `New tenant ${details.name} saved.` : `Added to tenant ${details.name}.`}`); return; }

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

        linkTenant(res.tenantId, b.propertyId);   // tenant.propertyIds (data access by property), best effort
        this.savedLink = { property: b.propertyId, id: bookingId };
        this.clearDraft();
        this.saved = true; window.scrollTo(0, 0);
      } catch (e) { this.formError = errText(e, 'save the booking'); window.scrollTo(0, 0); }
      this.busy = false;
    },

    // Saved as Awaiting payment: no notifications yet (nothing to key into eZee); the invoice opens straight away
    afterPending(bookingNo, bookingId, tenantId, msg) {
      linkTenant(tenantId, this.bk.propertyId);
      this.savedLink = { property: this.bk.propertyId, id: bookingId };
      this.clearDraft();
      this.invoiceNo = bookingNo; this.openInvoice();
      this.okMsg = msg; this.pendingSaved = true; this.saved = true; this.busy = false; window.scrollTo(0, 0);
    },
    async saveDirect(pending = false) {
      const b = this.bk;
      this.busy = true; this.formError = '';
      try {
        const prop = this.properties.find(p => p.id === b.propertyId), unit = this.units.find(u => u.id === b.unitId);
        const details = { kind: 'tenant', name: b.name.trim(), phone: b.phone.trim(), phoneKey: phoneKey(b.phone), email: b.email.trim(),
          icPassport: b.icPassport.trim(), nationality: b.nationality.trim(), searchWords: searchWords(b.name),
          dob: b.dob || '', gender: b.gender || '', genderOther: b.gender === 'Other' ? b.genderOther.trim() : '' };
        const coIds = await this.saveCoTenants();
        // The booking and its payment carry the property's state; the tenant collects the states they stayed in
        const st = await stateFor(b.propertyId), tag = st ? { state: st } : {}, tStates = st ? { states: arrayUnion(st) } : {};
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
          if (known) tx.update(tRef, { status: 'active', lastBookingId: bookingId, ...tStates, updatedAt: serverTimestamp(), updatedBy: me.user.uid });
          else {
            tx.set(tcRef, { next: n + 1 });
            tx.set(tRef, { status: 'active', firstInquiryId: null, lastBookingId: bookingId, ...tStates, createdAt: serverTimestamp(), createdBy: me.user.uid, createdByName: me.name });
          }
          tx.set(doc(tRef, 'private', 'main'), details, { merge: true });
          tx.set(doc(tRef, 'private', 'contact'), guestContact(details), { merge: true });   // name, phone, email only (17 Nov 2026)
          tx.set(lcRef, { next: ln + 1 });
          tx.set(bRef, { source: 'direct', inquiryId: null, bookingNo, tenantId,
            propertyId: b.propertyId, ...tag, propertyName: prop?.name || '', unitId: b.unitId, unitCode,
            arrival: b.arrival, departure: b.departure, nights: this.nights, longTerm: this.longTerm,
            monthlyRent: this.longTerm ? toCents(b.monthlyRent) : 0, deposit: this.longTerm ? this.deposit : 0,
            ezeeReservationNo: b.ezeeNo.trim(), ...this.extra(coIds), status: pending ? 'pending' : 'active',
            createdAt: serverTimestamp(), createdBy: me.user.uid, createdByName: me.name });
          tx.set(doc(bRef, 'private', 'main'), this.passcodes());
          if (!pending && +b.amount > 0) tx.set(doc(db, 'offlinePayments', b.payId), { ...this.payRecord(prop, unitCode, bookingId, bookingNo), ...tag });
          audit(tx, me, { action: 'offlineBooking.create', entity: `offlineBookings/${bookingId}`, propertyId: b.propertyId,
            changes: [{ field: 'tenantId', old: null, new: tenantId }, { field: 'unitId', old: null, new: b.unitId }, ...(pending ? [{ field: 'status', old: null, new: 'pending' }] : [])] });
          return { isNew: !known, bookingId, bookingNo, tenantId };
        });

        if (pending) { this.afterPending(res.bookingNo, res.bookingId, res.tenantId, `${res.bookingNo} saved, awaiting payment. ${res.isNew ? `New tenant ${details.name} saved.` : `Added to tenant ${details.name}.`}`); return; }

        const okMsg = `${res.bookingNo} saved. ${res.isNew ? `New tenant ${details.name} saved.` : `Added to tenant ${details.name}.`} Key it into eZee to block the room.`;

        this.notify({
          roles: ['finance', 'director'],
          title: 'New offline booking',
          refId: res.bookingId,
          message: `${res.bookingNo}: ${details.name}, ${unitCode || 'unit'}, ${this.full(b.arrival)} to ${this.full(b.departure)}. Key it into eZee.`,
          link: '/Portfolio/bookings'
        });

        linkTenant(res.tenantId, b.propertyId);   // tenant.propertyIds (data access by property), best effort
        this.savedLink = { property: b.propertyId, id: res.bookingId };
        this.clearDraft();
        this.okMsg = okMsg; this.saved = true; window.scrollTo(0, 0);
      } catch (e) { this.formError = errText(e, 'save the booking'); window.scrollTo(0, 0); }
      this.busy = false;
    }
  }
};
</script>

<style scoped>
.inv-prev { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px 24px; margin-bottom: 14px; }
.inv-col h4 { margin: 0 0 6px; font-size: 13px; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
.inv-total { font-weight: 700; border-top: 1px solid var(--border); padding-top: 4px; }
.rd-sec { font-size: 14px; font-weight: 700; color: var(--text); margin: 16px 0 8px; padding-bottom: 6px; border-bottom: 1px solid var(--border); }
.rd-sec span { font-weight: 400; color: var(--muted); }
.rd-3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0 14px; }
.rd-fees { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 28px; }
.rd-fee { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 5px 0; border-bottom: 1px solid var(--line, var(--border)); font-size: 13px; color: var(--text); cursor: text; }
.rd-amt { width: 130px; height: 32px; padding: 0 8px; font-size: 13px; color: var(--muted); }
.rd-amt.on { color: var(--text); font-weight: 600; }
.rd-total { cursor: default; }
.rd-total span, .rd-total b { color: var(--text); font-weight: 700; }
@media (max-width: 720px) { .rd-3, .rd-fees { grid-template-columns: minmax(0, 1fr); } }
.await-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin: 0 0 14px; }
.lock { border: 0; padding: 0; margin: 0; min-width: 0; }
.lock:disabled { opacity: .75; }
.lock-note { margin: -4px 0 12px; }
.draft-bar { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
.draft-acts { display: flex; gap: 8px; }
.form-title { margin-bottom: 14px; }
.form-title h2 { font-size: 18px; margin: 0; }
.form-title .sub { color: var(--muted); margin: 4px 0 0; font-size: 13px; }
.rf-body { margin-top: 14px; }
.rf-body h3 { font-size: 15px; margin: 0 0 12px; }
.rf-body h4 { font-size: 14px; margin: 0; }
.rf-body .card-head h3 { margin: 0; }
.sub-sec { border-top: 1px solid var(--border); margin-top: 14px; padding-top: 14px; }
.fld-pick { display: block; width: 100%; }
.fld-pick :deep(.op) { display: block; width: 100%; }   /* the property picker wraps its own picker: stretch it too */
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
.match { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; border: 1px solid var(--accent); border-radius: 10px; padding: 10px 12px; margin-bottom: 12px; font-size: 14px; }
.match .help { margin: 4px 0 0; }
.name-wrap { min-width: 0; position: relative; }
/* 16 Nov 2026: floats over the fields below like a drop-down, so the Phone field beside it does not move */
.name-hits { position: absolute; left: 0; right: 0; top: calc(100% - 12px); z-index: 20; max-height: 260px; overflow-y: auto; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 8px; box-shadow: 0 10px 30px rgba(0, 0, 0, .12); }
.name-hits .help { margin: 0 0 6px; }
.hit { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; width: 100%; text-align: left; background: none; border: 0; border-radius: 8px; padding: 6px 8px; cursor: pointer; font: inherit; color: inherit; }
.hit:hover, .hit:focus-visible { background: var(--accent-soft, rgba(0, 128, 128, .08)); }
.hit span { font-size: 12px; color: var(--muted); }
</style>
