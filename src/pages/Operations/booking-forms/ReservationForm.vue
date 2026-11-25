<template>
  <div class="rf">
    <div class="loading-bar" v-show="loading || busy"></div>
    <div class="form-title">
      <h2>Reservation Lodgment Form</h2>
      <p class="sub" v-if="resume">{{ `Finishing ${resume.bookingNo || resume.id} (Awaiting payment). Add the payment and door passcodes, then save. Tenant and stay were saved with the booking.` }}</p>
      <p class="sub" v-else-if="lead">{{ `From ${lead.id} · ${lead.lookingFor}. Saving marks the inquiry as paid and saves the customer as a tenant.` }}</p>
      <p class="sub" v-else-if="fillOf">{{ `Filling in ${fillOf.bookingNo || fillOf.id} from eZee reservation ${prefill.ezeeNo}. What the booking already has is kept; its blank details are filled in from the file. Check them, add anything missing, then ${stageOnly ? 'Save to pending confirm' : 'save'}. Deposit, fees and payments stay as they are.` }}</p>
      <p class="sub" v-else-if="prefill">{{ `From eZee reservation ${prefill.ezeeNo}. The room, dates, guest and source are filled in from the file: add the phone, IC, rent and status, then Save to pending confirm. It is added to the system when you press Continue to confirm on the upload.` }}</p>
      <p class="sub" v-else>Log a booking: tenant, stay, rent and deposit, payment and door passcodes. A booking without an inquiry, e.g. a walk-in or a returning tenant. Saving saves the customer as a tenant.</p>
    </div>

    <div class="notice error" v-if="blocked">{{ blocked }}
      <div v-if="leadId && canDirect" style="margin-top:8px"><button type="button" class="btn" @click="dropLead()">Start a booking without an inquiry</button></div>
    </div>

    <FormSaved v-else-if="saved" :message="okMsg" :title="pendingSaved ? 'Saved as awaiting payment' : 'Saved'" :again-text="prefill ? 'Close' : 'Start another'" @again="prefill ? $emit('close') : startAgain()">
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
          <!-- 20 Nov 2026 (Khairul): Type of rent first and required. Yearly Lease: move-in month (always the 1st) and how many
               years; 1 year = 1 Jan to 31 Dec, saved with check-out on the 1st after the last day (1 Jan next year), so the
               invoice months run 1st to 1st with no part month. -->
          <div class="grid-fields">
            <div class="field"><label class="req" for="bProp">Property</label>
              <PropertyPicker block class="fld-pick" v-model="bk.propertyId" :properties="properties" placeholder="Choose property" @change="loadUnitList()" /></div>
            <div class="field"><label class="req" for="bUnit">Unit</label>
              <OptionPicker class="fld-pick" v-model="bk.unitId" :disabled="!bk.propertyId" :options="units.map(x => ({ value: x.id, label: x.unitCode || x.id }))" :placeholder="bk.propertyId && !units.length ? 'No units found' : 'Choose unit'" label="Unit" searchable /></div>
          </div>
          <div class="grid-fields">
            <div class="field"><label class="req">Type of rent</label>
              <OptionPicker class="fld-pick" v-model="bk.rentType" :options="RENT_TYPES" label="Type of rent" placeholder="Choose type of rent…" /></div>
          </div>
          <div class="grid-fields">
            <!-- 20 Nov 2026 (Khairul): reverted; every type of rent (Yearly too) uses check-in and check-out dates again -->
            <FormField id="bIn" label="Check-in" req type="date" v-model="bk.arrival" />
            <FormField id="bOut" label="Check-out" req type="date" v-model="bk.departure" />
          </div>
          <p class="help" v-if="hasStay">{{ nights === 0 ? 'Same-day check-out (0 nights) · Daily Lease' : `${nights} night${nights === 1 ? '' : 's'} · ${leaseLabel(nights)} (${leaseHint(nights)})` }}</p>
          </fieldset>
        </div>

        <!-- 3. Rent & deposit -->
        <div v-show="cur === 'rent'">
          <h3>Rent &amp; deposit</h3>
          <!-- 20 Nov 2026 (Khairul): the 2-month deposit is worked out for Long-term leases only (365+ nights) and can be typed over;
               Monthly term and Short term: the deposit is optional -->
          <p class="help" style="margin:0 0 10px" v-if="hasStay">{{ autoDeposit ? `${leaseLabel(nights)}: the security deposit is 2 months of rent. Type another amount to change it.` : `${leaseLabel(nights)}: a security deposit is optional.` }}</p>
          <!-- 16 Nov 2026 (Khairul): grouped and compact - Booking and Rent three across, the fees as a two-column list -->
          <div class="rd-sec">Booking</div>
          <div class="rd-3">
            <div class="field"><label class="req">Booking source</label><OptionPicker class="fld-pick" v-model="bk.bookingSource" :options="sourceOpts" label="Booking source" placeholder="Choose source…" /></div>
            <div class="field"><label class="req">Rental status</label><OptionPicker class="fld-pick" v-model="bk.rentalStatus" :options="RENTAL_STATUSES" label="Rental status" placeholder="Choose status…" /></div>
            <!-- 20 Nov 2026 (Khairul): who made the sale. Meant for Operations staff; open to every active staff member for now (SALES_ROLES) -->
            <div class="field"><label>Sales person</label>
              <OptionPicker class="fld-pick" v-model="bk.salesPersonUid" :options="salesOptions" label="Sales person" searchable placeholder="Choose sales person…" /></div>
            <!-- 20 Nov 2026 (Khairul): booking source Agent = pick the agent from Marketing > Agent Database, for their commission -->
            <div class="field" v-if="isAgent"><label class="req">Agent</label>
              <OptionPicker class="fld-pick" v-model="bk.agentId" :options="agentOptions" label="Agent" searchable :placeholder="agentsMsg || 'Choose agent…'" />
              <p class="help" style="margin:4px 0 0" v-if="agentsMsg">{{ agentsMsg }}</p></div>
          </div>
          <div class="rd-sec">Rent</div>
          <div class="rd-3">
            <FormField v-if="longTerm" id="bRent" label="Rental (RM)" req type="number" min="0" step="0.01" placeholder="0.00" v-model="bk.monthlyRent" />
            <FormField v-else id="bRental" label="Rental (RM)" req type="number" min="0" step="0.01" placeholder="0.00" v-model="bk.rental" />
            <div class="field"><label for="bSec">{{ autoDeposit ? 'Security deposit (RM, 2 months)' : 'Security deposit (RM)' }}</label>
              <input class="input" id="bSec" type="number" min="0" step="0.01" :placeholder="autoDeposit ? autoDepositAmt.toFixed(2) : '0.00'" v-model="bk.securityDeposit">
              <p class="help" style="margin:4px 0 0" v-if="depositChanged">
                Changed from {{ rm(autoDepositAmt) }}. <button type="button" class="link-btn" @click="bk.securityDeposit = ''">Use 2 months</button></p></div>
          </div>
          <div class="rd-sec">Other fees (RM) <span>· leave empty if not charged</span></div>
          <div class="rd-fees">
            <!-- 23 Nov 2026 (Khairul): the boxes follow Booking settings > Other fees for this booking's type of rent. Not used = hidden,
                 unless the booking already has an amount in it. Add into rent = a note; the invoice adds it into the rent shown. -->
            <label class="rd-fee" v-for="f in feeRows" :key="f.id" :for="'bf' + f.id">
              <span>{{ f.short }}<small class="rd-into" v-if="f.into">Added into rent on the invoice</small></span>
              <input class="input rd-amt" :class="{ on: +feeVal(f) > 0 }" :id="'bf' + f.id" type="number" min="0" step="0.01" placeholder="0.00" :value="feeVal(f)" @input="setFee(f, $event.target.value)" :aria-label="`${f.label} (RM)`">
            </label>
            <div class="rd-fee rd-total"><span>Total (rental, deposit &amp; fees)</span><b>{{ rm(grandTotal) }}</b></div>
          </div>
          <FormField v-if="+bk.othersFee > 0" id="bOthersNote" label="Others: what is it for?" v-model="bk.othersNote" style="margin-top:12px" />
          <!-- 20 Nov 2026 (Khairul): the deposit and fees typed here are saved as charges on the first month of the booking's Payments tab
               (offlineBookings.monthCharges), the same place "+" adds a charge, so nothing is entered or counted twice -->
          <p class="help" style="margin:8px 0 0">The security deposit and fees are saved as charges on the first month in the booking's Payments tab. Change them or add more there later.</p>
        </div>

        <!-- 4. Invoice (16 Nov 2026): what the invoice shows; not paid yet = save as Awaiting payment and download it -->
        <div v-show="cur === 'invoice'">
          <h3>Invoice</h3>
          <p class="help" style="margin:0 0 12px" v-if="!resume">{{ invoiceReady ? 'What the invoice will show. Empty fields are left out.' : 'Finish Tenant, Stay and Rent & deposit first. The invoice is made from them.' }}</p>
          <!-- 20 Nov 2026 (Khairul): redesigned - totals up top, three detail cards, and the amounts as a table (one row per month) -->
          <div class="inv-wrap" v-if="invoiceReady || resume">
            <div class="inv-hero">
              <div class="inv-stat main"><span>Total for the stay</span><b>{{ rm(invoicePreview.total) }}</b></div>
              <template v-if="invoicePreview.months.length">
                <div class="inv-stat"><span>Months</span><b>{{ invoicePreview.months.length }}</b></div>
                <div class="inv-stat"><span>Monthly rent</span><b>{{ rm(invoicePreview.monthlyRent) }}</b></div>
                <div class="inv-stat"><span>Due in Month 1</span><b>{{ rm(invoicePreview.months[0].total) }}</b></div>
              </template>
            </div>
            <div class="inv-cards">
              <section class="inv-card" v-for="g in invoicePreview.groups" :key="g.title">
                <h4>{{ g.title }}</h4>
                <div class="inv-kv" v-for="[k, v] in g.rows" :key="k"><span>{{ k }}</span><b>{{ v }}</b></div>
              </section>
            </div>
            <section class="inv-card" v-if="invoicePreview.amounts.length">
              <h4>Amounts</h4>
              <div class="inv-scroll" v-if="invoicePreview.months.length">
                <table class="inv-tbl">
                  <thead><tr><th>Month</th><th>Period</th><th class="r">Rent</th><th>Other charges</th><th class="r">Total</th></tr></thead>
                  <tbody>
                    <tr v-for="m in invoicePreview.months" :key="m.label">
                      <td class="nowrap">{{ m.label }}</td>
                      <td class="muted nowrap">{{ `${full(m.from)} – ${full(m.to)}` }}</td>
                      <td class="r nowrap">{{ rm(m.rent) }}</td>
                      <td><span class="inv-chip" v-for="[k, v] in m.amounts.slice(1)" :key="k">{{ k }} <b>{{ rm(v) }}</b></span><span class="muted" v-if="m.amounts.length < 2">—</span></td>
                      <td class="r nowrap"><b>{{ rm(m.total) }}</b></td>
                    </tr>
                  </tbody>
                  <tfoot><tr><td colspan="4">Total</td><td class="r nowrap">{{ rm(invoicePreview.total) }}</td></tr></tfoot>
                </table>
              </div>
              <table class="inv-tbl" v-else>
                <tbody><tr v-for="[k, v] in invoicePreview.amounts" :key="k"><td>{{ k }}</td><td class="r nowrap">{{ rm(v) }}</td></tr></tbody>
                <tfoot><tr><td>Total</td><td class="r nowrap">{{ rm(invoicePreview.total) }}</td></tr></tfoot>
              </table>
            </section>
          </div>
          <template v-if="resume">
            <div class="notice await-bar"><span>Need to send it again?</span><button type="button" class="btn" @click="openInvoice()">Download invoice</button></div>
          </template>
          <template v-else>
            <div class="notice await-bar">
              <span><b>Rental status is Unpaid.</b> Save the booking as Awaiting payment and download the invoice to send. The unit is held for these dates; add the payment and handover from Bookings once they pay.</span>
              <button type="button" class="btn btn-primary" @click="saveBooking(true)" :disabled="busy || !invoiceReady" :title="invoiceReady ? '' : 'Finish Tenant, Stay and Rent & deposit first'">{{ busy ? 'Saving…' : stageOnly ? 'Save to pending confirm' : 'Save & download invoice' }}</button>
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
        <button type="button" class="btn" v-if="!resume && !stageOnly" @click="saveDraft()" :disabled="busy || draftBusy" title="Saves what you've typed on your account. Only you can see it.">{{ draftBusy ? 'Saving…' : 'Save draft' }}</button>
        <button type="button" class="btn btn-primary" v-if="step < steps.length - 1" @click="move(1)">Next</button>
        <button type="button" class="btn btn-primary" v-else @click="saveBooking()" :disabled="busy || !complete" :title="complete ? '' : 'Finish the steps listed above first'">{{ busy ? 'Saving…' : stageOnly ? 'Save to pending confirm' : unpaidNew ? 'Save & download invoice' : 'Save booking' }}</button>
      </div>
    </template>
    <InvoiceDialog v-if="invoice" :invoice="invoice" :booking-no="invoiceNo" :booking-id="resume?.id || savedLink?.id || ''" @close="invoice = null" />
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
import { collection, doc, getDoc, getDocs, setDoc, deleteDoc, query, where, runTransaction, arrayUnion, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase.js';
import { useSession } from '@/stores/session.js';
import { stateFor } from '@/lib/states.js';
import { linkTenant } from '@/lib/portfolio-data.js';
import OptionPicker from '@/components/OptionPicker.vue';
import PropertyPicker from '@/components/PropertyPicker.vue';
import FormField from '@/components/FormField.vue';
import DriveFiles from '@/components/DriveFiles.vue';
import StepStrip from '@/components/StepStrip.vue';
import { RENT_TERMS, rentTermLabel, termOf } from '@/lib/rent-term.js';
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
import { invoiceOf, propertyAddressOf, allMonthCharges } from '@/lib/booking-invoice.js';
import { sourcesForForms, feesForForms, sourceOptions, isAgentSource, normSources, normFees, feeColOf, defaultFor, feeShort } from '@/lib/booking-settings.js';
import { loadAgents } from '@/pages/Marketing/agents.js';
import { lineRef, newLine, loadHistory, writeChange } from '@/lib/agent-commission.js';
import { listStaff } from '@/lib/agreements/data.js';
import MonthPicker from '@/components/MonthPicker.vue';
// 20 Nov 2026 (Khairul): the Sales person list. Base setting = Operations only (['operations']); opened to all staff for now (null)
const SALES_ROLES = null;

const me = useSession();
const LONG_TERM_NIGHTS = 30;
const GENDERS = ['Male', 'Female', 'Other'].map(x => ({ value: x, label: x }));
// 16 Nov 2026: no "Choose…" row in the lists; the drop-downs show a grey placeholder until something is picked
// 23 Nov 2026 (Khairul): the booking sources come from Booking settings > Booking sources (sourceOpts); Agent works by its id.
const RENTAL_STATUSES = [{ value: 'Paid', label: 'Paid' }, { value: 'Unpaid', label: 'Unpaid' }];
// 16 Nov 2026: shown as Short / Mid / Long term; saved as Daily / Monthly / Yearly (lib/rent-term.js)
const RENT_TYPES = RENT_TERMS.map(x => ({ value: x.value, label: x.label }));
const YEARS = Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: `${i + 1} year${i ? 's' : ''}` }));   // Yearly Lease (20 Nov 2026)
// YYYY-MM-01 plus n years (the check-out of a Yearly Lease)
const plusYears = (iso, n) => `${+iso.slice(0, 4) + (+n || 1)}${iso.slice(4, 7)}-01`;
// The Type of rent value (Daily / Monthly / Yearly) for a stay's nights or dates (termOf in lib/rent-term.js)
const termValue = b => RENT_TERMS.find(x => x.key === termOf({ nights: b.nights, arrival: b.arrival, departure: b.departure }))?.value || '';
const PAY_MODES = ['Bank transfer', 'Cash', 'Card', 'Online banking / QR', 'Cheque', 'Other'].map(x => ({ value: x, label: x }));
const FEES = [{ key: 'utilityDeposit', label: 'Utility deposit' }, { key: 'internetFee', label: 'Internet fees' }, { key: 'carparkFee', label: 'Carpark fees' },
  { key: 'cleaningFee', label: 'Cleaning fees' }, { key: 'taFee', label: 'Tenancy agreement fees', short: 'Tenancy agreement' }, { key: 'taStampFee', label: 'Tenancy agreement stamping fees', short: 'TA stamping' },
  { key: 'gatewayFee', label: 'Payment gateway charges', short: 'Payment gateway' }, { key: 'cardFee', label: 'Credit card charges' }, { key: 'othersFee', label: 'Others' }];
// 20 Nov 2026: what is in the deposit and fee boxes, to tell whether they were changed (finishing an Awaiting payment booking)
// 23 Nov 2026: the built-in fees (FEES) keep their booking keys; Booking settings > Other fees may rename them and adds custom
// fees (bk.customFees { <feeId>: amount }, saved on the booking as customFees). The boxes shown are feeRows.
const feeSnap = b => JSON.stringify([b.securityDeposit, ...FEES.map(f => b[f.key]), b.othersNote, b.customFees || {}]);
// A booking's first-month charges added up by kind { securityDeposit: 7080, carparkFee: 101, ... } and the Others note
const firstMonthFees = d => {
  const t = {}, list = allMonthCharges(d)[String(d.arrival || '').slice(0, 7)] || [];
  list.forEach(c => { t[c.key] = Math.round(((t[c.key] || 0) + (+c.amount || 0)) * 100) / 100; });
  return { t, note: list.find(c => c.key === 'othersFee' && c.note)?.note || '' };
};
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const toCents = v => Math.round((+v || 0) * 100) / 100;
const emailOk = e => !e || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const stop = msg => Object.assign(new Error(msg), { plain: true });
const errText = (e, what) => (e.plain ? e.message : friendlyError(e, what));
const filled = v => !!String(v ?? '').trim();
// What counts as "something typed" for the leave warning (not the ids and lookups the form sets itself)
const typed = bk => JSON.stringify({ ...bk, existing: undefined, matchUsed: undefined, payId: undefined });
// The step a save message is about, so the form jumps there
const STEP_OF = [[/tenant|phone|email|IC or passport|gender/i, 'tenant'], [/type of rent|Yearly Lease|number of years|property and unit|check-in|Check-out|already booked/, 'stay'], [/booking source|rental status|monthly rent/, 'rent'],
  [/amount paid|mode of payment|purpose|receipt/, 'payment'], [/passcode/, 'handover']];

export default {
  components: { PropertyPicker, OptionPicker, DriveFiles, FormField, StepStrip, FormSaved, InvoiceDialog, MonthPicker },
  // resumeId (16 Nov 2026): an Awaiting payment booking (offlineBookings status 'pending') opened to finish it
  // prefill (24 Nov 2026): a row from Bulk Upload > New bookings (eZee), opened in this form so it is saved like any booking
  // made in the PMS: { ezeeNo, name, propertyId, unitId, arrival, departure, source, total, note }. The form starts filled in
  // with it; everything else (phone, IC, rent type, status, payment) is completed here as usual.
  // stageOnly (24 Nov 2026, Bulk Upload eZee): the last button checks everything (and the room) but saves nothing; it
  //   emits 'staged' with the form as filled in, and the row waits as "Pending confirm to add".
  // autoSave: prefill.bk (a staged form) is opened and saved straight away, with no screen; emits 'done' { ok, error }.
  // prefill.fillId: an offline booking already in Portfolio > Bookings whose blank details the eZee file has (Fill in blank
  //   details). The form opens that booking, the blanks filled from the file; saving updates it (no new booking is made).
  props: { leadId: { type: String, default: '' }, resumeId: { type: String, default: '' }, prefill: { type: Object, default: null },
    stageOnly: { type: Boolean, default: false }, autoSave: { type: Boolean, default: false },
    // payChecked (24 Nov 2026): Bulk Upload eZee rows, confirmed by Accounting / a Director on Continue to confirm. The payment is
    // saved as Checked by them (when they hold Offline Payments Edit), so the booking shows Paid at once instead of waiting.
    payChecked: { type: Boolean, default: false } },
  emits: ['dirty', 'saved', 'close', 'staged', 'done'],
  data() {
    return {
      GENDERS, RENTAL_STATUSES, RENT_TYPES, YEARS, PAY_MODES, FEES,
      sources: normSources(null), feeSet: normFees(null), autoFees: {},   // 23 Nov 2026: Booking settings (read once per visit)
      lead: null, tenant: null, bk: {}, properties: [], units: [], start: '', nameHits: [], nameTimer: null,
      fillOf: null,   // 24 Nov 2026: the booking being filled in (prefill.fillId)
      draft: null, draftBusy: false, draftMsg: '', resume: null, resumeFees: '', agents: null, agentsMsg: '', staff: [], pendingSaved: false, invoice: null, invoiceNo: '',
      step: 0, ready: false, saved: false, savedLink: null, canBookings: can(useSession(), 'bookings.view'), blocked: '', okMsg: '', formError: '', loading: true, busy: false
    };
  },
  async mounted() {
    listStaff().then(s => { this.staff = s; }).catch(() => {});   // Sales person list (20 Nov 2026)
    // 23 Nov 2026: booking sources and other fees from Booking settings (the built-in lists when they can't be read)
    [this.sources, this.feeSet] = await Promise.all([sourcesForForms(), feesForForms()]);
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
    if (this.autoSave) {
      if (!this.blocked) await this.saveBooking();
      this.$emit('done', { ok: this.saved, error: this.blocked || this.formError || (this.saved ? '' : 'Not saved.') });
    }
  },
  computed: {
    canDirect() { return DIRECT_BOOKERS.includes(me.role); },
    // 23 Nov 2026: active sources in order; a booking's own source stays shown even when hidden or renamed since
    sourceOpts() { return sourceOptions(this.sources, this.bk.bookingSource); },
    isAgent() { return isAgentSource(this.sources, this.bk.bookingSource); },
    // The Other fees column for this booking (Daily / Monthly / Yearly from Type of rent, else the nights)
    feeCol() { const b = this.bk; return feeColOf({ rentType: b.rentType, arrival: b.arrival, departure: b.departure }); },
    feeRows() {
      const col = this.feeCol;
      return this.feeSet.filter(f => f.mode[col] !== 'notUsed' || +this.feeVal(f) > 0)
        .map(f => ({ ...f, short: feeShort(f), into: f.mode[col] === 'intoRent' }));
    },
    // Rental status Unpaid: the payment details are not required
    unpaid() { return this.bk.rentalStatus === 'Unpaid'; },
    nights() {
      const { arrival: a, departure: b } = this.bk;
      return a && b ? Math.round((Date.parse(b) - Date.parse(a)) / 86400000) : 0;
    },
    // Both dates set and check-out not before check-in (a same-day check-out, 0 nights, is allowed)
    yearly() { return this.bk.rentType === 'Yearly'; },
    // The last day of a Yearly Lease (the day before check-out): 1 Jan 2027, 1 year -> 31 Dec 2027
    leaseEnd() { const d = this.bk.departure; if (!d) return ''; const t = new Date(Date.parse(d) - 864e5); return t.toISOString().slice(0, 10); },
    hasStay() { return !!(this.bk.arrival && this.bk.departure) && this.nights >= 0; },
    longTerm() { return this.nights >= LONG_TERM_NIGHTS; },
    // 20 Nov 2026: 2 months of rent is worked out for a Long-term lease (365+ nights) only; an amount typed in the box wins.
    // Monthly term and Short term: only what is typed (empty = no deposit).
    autoDeposit() { return leaseTerm(this.nights) === 'long'; },
    autoDepositAmt() { return toCents(this.bk.monthlyRent) * 2; },
    depositChanged() { const t = this.bk.securityDeposit; return this.autoDeposit && t !== '' && t != null && toCents(t) !== this.autoDepositAmt; },
    deposit() { const t = this.bk.securityDeposit; return t !== '' && t != null ? toCents(t) : this.autoDeposit ? this.autoDepositAmt : 0; },
    // Other fees on the Rent & deposit step (not the rental or security deposit); 3 decimals in the sum, 2 on screen
    // 16 Nov 2026: the total on Rent & deposit = rental + security deposit + other fees (same amounts the booking saves)
    // 20 Nov 2026: the deposit and fees as first-month charges { 'YYYY-MM': [...] } (lib/booking-invoice.js)
    // Active agents (and the one already on the booking). 24 Nov 2026 (Khairul): the name only (was "Name · Company · Property agent")
    salesOptions() {
      return this.staff.filter(s => !SALES_ROLES || SALES_ROLES.includes(s.role) || s.uid === this.bk.salesPersonUid).map(s => ({ value: s.uid, label: s.name }));
    },
    agentOptions() {
      return (this.agents || []).filter(a => a.active !== false || a.id === this.bk.agentId)
        .map(a => ({ value: a.id, label: String(a.name || '').trim() || '(no name)' }));
    },
    // 23 Nov 2026: the deposit, then every fee with an amount (built-in and custom) in the Other fees order, on the first month.
    // Khairul: fees go on the first month only; other months get theirs with + on the booking's Payments tab.
    formCharges() {
      const b = this.bk, m = String(b.arrival || '').slice(0, 7), note = String(b.othersNote || '').trim();
      const list = [{ key: 'securityDeposit', label: 'Security deposit', amount: toCents(this.deposit) },
        ...this.feeSet.map(f => ({ key: f.id, label: f.label, amount: toCents(this.feeVal(f)), ...(f.id === 'othersFee' && note ? { note } : {}) }))].filter(c => c.amount > 0);
      return m && list.length ? { [m]: list } : {};
    },
    grandTotal() { const b = this.bk, rent = (this.longTerm ? toCents(b.monthlyRent) : toCents(b.rental)) + this.deposit; return Math.round((rent + this.feesTotal) * 1000) / 1000; },
    feesTotal() { return Math.round(this.feeSet.reduce((t, f) => t + (+this.feeVal(f) || 0), 0) * 1000) / 1000; },
    dirty() { return this.ready && !this.saved && typed(this.bk) !== this.start; },
    // The steps and what each needs, taken from the checks in saveBooking() (which still runs on Save)
    // 16 Nov 2026 (Khairul): the steps follow Rental status. Unpaid: Invoice, no Payment or Handover (saved as Awaiting payment,
    // finished later from Bookings). Paid: Payment and Handover, no Invoice. Not chosen yet: neither. Finishing a booking: all.
    steps() {
      const all = this.allSteps, st = this.bk.rentalStatus;
      if (this.resume) return all;
      if (this.fillOf) return all.filter(x => ['tenant', 'stay', 'rent', 'review'].includes(x.key));   // payments stay on the booking
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
          { label: 'Property', filled: filled(b.propertyId) }, { label: 'Unit', filled: filled(b.unitId) }, { label: 'Type of rent', filled: filled(b.rentType) }, { label: 'Check-in', filled: filled(b.arrival) }, { label: 'Check-out', filled: filled(b.departure) }] },
        { key: 'rent', label: 'Rent & deposit', required: [
          { label: 'Booking source', filled: filled(b.bookingSource) }, ...(this.isAgent ? [{ label: 'Agent', filled: filled(b.agentId) }] : []),
          { label: 'Rental status', filled: filled(b.rentalStatus) },
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
      if (!this.bk.coTenants) return { groups: [], amounts: [], months: [], monthlyRent: 0, total: 0 };
      const inv = this.formInvoice(), keep = rows => rows.filter(([, v]) => String(v ?? '').trim());
      return { groups: [{ title: 'Tenant', rows: keep(inv.tenant) }, { title: 'Property', rows: keep(inv.property) }, { title: 'Rent & terms', rows: keep(inv.terms) }].filter(g => g.rows.length),
        amounts: inv.amounts, months: inv.months || [], monthlyRent: inv.monthlyRent, total: inv.total };
    },
    // Tenant, Stay and Rent & deposit done: enough to save as Awaiting payment and make the invoice
    invoiceReady() { return this.steps.length > 3 && allDone(this.steps.slice(0, 3)); },
    missing() { return stillMissing(this.steps); },
    // The summary on Review & save
    review() {
      const b = this.bk, d = v => (filled(v) ? String(v) : '—'), money = v => (+v > 0 ? this.rm(v) : '—');
      const prop = this.properties.find(p => p.id === b.propertyId);
      const fees = this.feeSet.filter(f => +this.feeVal(f) > 0).map(f => [f.label, this.rm(this.feeVal(f))]);
      const pass = (code, exp) => (filled(code) ? `Set${exp ? `, expires ${this.full(exp)}` : ''}` : 'Not set');
      return [
        { key: 'tenant', label: 'Tenant', rows: [['Name', d(b.name)], ['Phone', d(b.phone)], ['Email', d(b.email)], ['IC / Passport', d(b.icPassport)], ['Nationality', d(b.nationality)],
          ...(b.existing ? [['Existing tenant', b.existing.id]] : []), ...(b.coTenants.length ? [['Other tenants', b.coTenants.map(c => c.name || '(no name)').join(', ')]] : [])] },
        { key: 'stay', label: 'Stay', rows: [['Property', prop?.name || '—'], ['Unit', this.units.find(u => u.id === b.unitId)?.unitCode || d(b.unitId)], ['Check-in', b.arrival ? this.full(b.arrival) : '—'], ['Check-out', b.departure ? this.full(b.departure) : '—'],
          ['Nights', this.hasStay ? (this.nights === 0 ? '0 · Same-day check-out' : `${this.nights} · ${leaseLabel(this.nights)}`) : '—'], ['Type of rent', d(rentTermLabel(b.rentType))]] },
        { key: 'rent', label: 'Rent & deposit', rows: [['Booking source', d(b.bookingSource)], ['Sales person', d(this.staff.find(s => s.uid === b.salesPersonUid)?.name)], ...(this.isAgent ? [['Agent', d(this.agentOf(b.agentId)?.name)]] : []), ['Rental status', d(b.rentalStatus)],
          ['Rental', money(this.longTerm ? b.monthlyRent : b.rental)], ['Security deposit', this.rm(this.deposit)], ...fees,
          ...(+b.othersFee > 0 ? [['Others is for', d(b.othersNote)]] : [])] },
        { key: 'payment', label: 'Payment', rows: [['Amount', money(b.amount)], ['Mode', d(b.payMode)], ['Payment Date', b.payDate ? this.full(b.payDate) : '—'], ['Reference', d(b.paymentRef)],
          ['eZee reservation no.', d(b.ezeeNo)], ['Purpose', d(b.note)], ['Receipt', b.docsLink ? 'Uploaded' : 'None']] },
        { key: 'handover', label: 'Handover', rows: [['Main door passcode', pass(b.mainPasscode, b.currentExpiry)], ['Next door passcode', pass(b.nextPasscode, b.nextExpiry)]] }
      ].map(g => ({ ...g, index: this.steps.findIndex(x => x.key === g.key) })).filter(g => g.index >= 0);
    }
  },
  watch: {
    'bk.bookingSource'() { if (this.isAgent) this.loadAgentList(); },
    // 23 Nov 2026: default amounts (Booking settings > Other fees) fill a NEW booking's empty boxes when the type of rent is
    // picked or changed; a box still holding the last default follows the new one. Never on a booking being finished.
    'bk.rentType'(v) { if (v && !this.resume) this.applyDefaults(); },
    // 20 Nov 2026 (Khairul): Type of rent fills itself from the stay dates (under 30 nights Short term, 30 to 364 Mid term,
    // 365+ Long term) and follows them when the dates change; it can still be picked by hand afterwards.
    // A saved booking opened again keeps its own Type of rent until its dates are changed.
    // 20 Nov 2026: Type of rent is now picked first (required), so the dates only fill it in when it is still empty
    nights(n) {
      if (!this.hasStay || n <= 0) return;
      if (!this.bk.rentType) this.bk.rentType = termValue({ nights: n });
    },
    // Yearly Lease: the move-in moves to the 1st of its month and check-out follows the number of years
    // 20 Nov 2026 (Khairul): Yearly Lease no longer sets the dates from a month + years (setYearly kept, unused)
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
    // 23 Nov 2026: a fee box's value (built-in fees keep their booking keys; custom fees are in bk.customFees)
    feeVal(f) { return f.builtIn ? this.bk[f.id] ?? '' : this.bk.customFees?.[f.id] ?? ''; },
    setFee(f, v) {
      if (f.builtIn) this.bk[f.id] = v;
      else this.bk.customFees = { ...(this.bk.customFees || {}), [f.id]: v };
    },
    applyDefaults() {
      const col = this.feeCol, auto = { ...this.autoFees };
      this.feeSet.forEach(f => {
        const d = f.mode[col] === 'notUsed' ? null : defaultFor(f, col), cur = String(this.feeVal(f) ?? '');
        if (cur !== '' && cur !== auto[f.id]) return;   // typed by hand: kept
        const next = d == null ? '' : String(d);
        this.setFee(f, next); auto[f.id] = next;
      });
      this.autoFees = auto;
    },
    // Yearly Lease: move-in on the 1st of the month picked, check-out on the 1st after the last year (1 Jan 2027 + 1 year = 1 Jan 2028)
    setYearly(month) {
      const b = this.bk;
      if (!b.years) b.years = '1';
      if (!/^\d{4}-\d{2}$/.test(month || '')) { b.arrival = ''; b.departure = ''; return; }
      b.arrival = `${month}-01`; b.departure = plusYears(b.arrival, b.years);
    },
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
        rentType: '', years: '1', bookingSource: '', agentId: '', salesPersonUid: me.user?.uid || '',   // 16 Nov 2026: starts empty (placeholder)
        rentalStatus: '', mainPasscode: '', currentExpiry: '', nextPasscode: '', nextExpiry: '', rental: '', securityDeposit: '', utilityDeposit: '', internetFee: '', carparkFee: '', cleaningFee: '', taFee: '', taStampFee: '', gatewayFee: '', cardFee: '', othersFee: '', othersNote: '', customFees: {},
        payMode: '', payDate: today(), payId: doc(collection(db, 'offlinePayments')).id, docsLink: '',
        propertyId: '', unitId: '', arrival: '', departure: '', amount: '', monthlyRent: '', paymentRef: '', ezeeNo: '', note: '' };
      this.units = []; this.formError = ''; this.autoFees = {};
      await this.refill();
      try { this.properties = await loadProperties(); } catch { this.properties = []; this.formError = 'Could not load the property list. Check your connection and reload.'; }
      if (this.prefill?.bk) await this.restoreStaged(this.prefill.bk);
      else if (this.prefill) await this.applyPrefill(this.prefill);
      if (this.prefill?.fillId) await this.loadFill(this.prefill, !this.prefill.bk);
      this.start = typed(this.bk);
      this.ready = true;
      if (this.prefill) { if (this.prefill.bk && !this.autoSave) this.step = Math.max(0, this.steps.length - 1); return; }   // no draft offer for eZee rows
      await this.findDraft();
    },

    // 24 Nov 2026: an eZee row from Bulk Upload. Only the details eZee has are filled in; the type of rent follows the nights.
    async applyPrefill(p) {
      const b = this.bk, str = v => String(v ?? '').trim();
      const src = str(p.source), hit = this.sources.find(x => x.active && x.label.toLowerCase() === src.toLowerCase());
      Object.assign(b, { name: str(p.name) || b.name, propertyId: str(p.propertyId), arrival: str(p.arrival), departure: str(p.departure),
        ezeeNo: str(p.ezeeNo), bookingSource: hit ? hit.label : src, note: str(p.note) });
      if (b.propertyId) { try { this.units = await loadUnits(b.propertyId); } catch { this.units = []; } }
      b.unitId = this.units.some(u => u.id === p.unitId) ? p.unitId : '';
      const n = b.arrival && b.departure ? Math.round((Date.parse(b.departure) - Date.parse(b.arrival)) / 864e5) : 0;
      if (n > 0) b.rentType = termValue({ nights: n, arrival: b.arrival, departure: b.departure });
      if (+p.total > 0) { if (n >= LONG_TERM_NIGHTS) b.monthlyRent = ''; else b.rental = String(Math.round(+p.total * 100) / 100); }
    },
    // 24 Nov 2026: Fill in blank details. The booking's own details win; what it has blank keeps the file's value (applyPrefill).
    async loadFill(p, overlay) {
      const snap = await getDoc(doc(db, 'offlineBookings', p.fillId)).catch(e => { if (e.code === 'permission-denied') return null; throw e; });
      if (!snap?.exists()) { this.blocked = `Booking ${p.fillId} was not found, or you can't open it.`; return; }
      const d = snap.data();
      if (d.status === 'cancelled') { this.blocked = `${d.bookingNo || p.fillId} is cancelled. Bring it back in Bookings first.`; return; }
      this.fillOf = { id: p.fillId, ...d };
      if (!overlay) return;
      const t = d.tenantId ? await getDoc(doc(db, 'tenants', d.tenantId, 'private', 'main')).catch(() => null) : await getDoc(doc(db, 'offlineBookings', p.fillId, 'private', 'main')).catch(() => null);
      const g = t?.exists() ? t.data() : {}, b = this.bk, v = x => (x || x === 0 ? String(x) : ''), keep = (k, val) => { if (String(val ?? '').trim()) b[k] = String(val); };
      keep('name', g.name || g.fullName); keep('phone', g.phone); keep('email', g.email); keep('icPassport', g.icPassport); keep('nationality', g.nationality);
      keep('dob', g.dob); keep('gender', g.gender); keep('genderOther', g.genderOther);
      if (d.unitId && d.unitId !== b.unitId) { b.unitId = d.unitId; if (!this.units.some(u => u.id === d.unitId)) { try { this.units = await loadUnits(d.propertyId || b.propertyId); } catch { /* kept */ } } }
      keep('arrival', d.arrival); keep('departure', d.departure); keep('rentType', d.rentType); keep('bookingSource', d.bookingSource); keep('agentId', d.agentId);
      keep('salesPersonUid', d.salesPersonUid); keep('rentalStatus', d.rentalStatus || (d.status === 'pending' ? 'Unpaid' : ''));
      if (d.longTerm) { keep('monthlyRent', v(d.monthlyRent || d.rental)); b.rental = ''; } else keep('rental', v(d.rental));
      keep('ezeeNo', d.ezeeReservationNo);
    },
    // Saves the filled-in booking: its stay, rent and source, and the guest's details (on the tenant record, or on the booking
    // for an imported one). Deposit, fees and payments stay as they are (the booking's Payments tab).
    async saveFill() {
      const b = this.bk, o = this.fillOf;
      this.busy = true; this.formError = '';
      try {
        const unitCode = this.units.find(u => u.id === b.unitId)?.unitCode || await this.unitCodeOf(b.unitId);
        const ag = this.isAgent ? this.agentOf(b.agentId) : null, sp = this.staff.find(x => x.uid === b.salesPersonUid);
        const main = { unitId: b.unitId, unitCode, arrival: b.arrival, departure: b.departure, nights: this.nights, longTerm: this.longTerm, rentType: b.rentType,
          bookingSource: b.bookingSource, agentId: ag?.id || '', agentName: ag?.name || '', agentCompany: ag?.company || '',
          salesPersonUid: sp?.uid || o.salesPersonUid || '', salesPersonName: sp?.name || o.salesPersonName || '', rentalStatus: b.rentalStatus,
          rental: this.longTerm ? toCents(b.monthlyRent) : toCents(b.rental), monthlyRent: this.longTerm ? toCents(b.monthlyRent) : 0, ezeeReservationNo: b.ezeeNo.trim() };
        const details = { name: b.name.trim(), phone: b.phone.trim(), phoneKey: phoneKey(b.phone), email: b.email.trim(), icPassport: b.icPassport.trim(), nationality: b.nationality.trim(),
          dob: b.dob || '', gender: b.gender || '', genderOther: b.gender === 'Other' ? b.genderOther.trim() : '' };
        const changes = Object.keys(main).filter(k => String(o[k] ?? '') !== String(main[k] ?? '')).map(k => ({ field: k, old: o[k] ?? null, new: main[k] }));
        const batch = writeBatch(db), ref = doc(db, 'offlineBookings', o.id);
        batch.update(ref, { ...main, updatedAt: serverTimestamp(), updatedBy: me.user.uid });
        const gRef = o.tenantId ? doc(db, 'tenants', o.tenantId) : ref;
        batch.set(doc(gRef, 'private', 'main'), o.tenantId ? { kind: 'tenant', ...details, searchWords: searchWords(b.name) } : details, { merge: true });
        batch.set(doc(gRef, 'private', 'contact'), guestContact(details), { merge: true });
        audit(batch, me, { action: 'offlineBooking.update', entity: `offlineBookings/${o.id}`, propertyId: o.propertyId || b.propertyId || null,
          changes: [...changes, ...Object.keys(details).map(k => ({ field: `private.${k}`, old: null, new: null }))], reason: `Filled in from eZee ${b.ezeeNo.trim()} (Bulk Upload)` });
        await batch.commit();
        this.$emit('saved', { bookingId: o.id, bookingNo: o.bookingNo || o.id, tenantId: o.tenantId || null, ezeeNo: b.ezeeNo.trim(), pending: false, filled: true });
        this.okMsg = `${o.bookingNo || o.id} updated from eZee ${b.ezeeNo.trim()}.`; this.saved = true;
      } catch (e) { this.formError = errText(e, 'save the booking'); }
      this.busy = false;
    },
    // A form already filled in and staged (Pending confirm to add): put back as it was, like a draft
    async restoreStaged(json) {
      let saved; try { saved = JSON.parse(json || '{}'); } catch { this.formError = 'This row could not be read. Fill in the form again.'; return; }
      Object.assign(this.bk, saved, { existing: null, matchUsed: false });
      if (!Array.isArray(this.bk.coTenants)) this.bk.coTenants = [];
      if (!this.bk.customFees || typeof this.bk.customFees !== 'object') this.bk.customFees = {};
      this.units = [];
      if (this.bk.propertyId) { try { this.units = await loadUnits(this.bk.propertyId); } catch { this.formError = 'Could not load the units. Check your connection and try again.'; } }
      await this.refill().catch(() => {});
      if (saved.matchUsed && this.bk.existing) this.bk.matchUsed = true;
    },
    // ---------- Awaiting payment (16 Nov 2026) ----------
    // The invoice of what is on the form (lib/booking-invoice.js); the long-term deposit is the worked-out 2 months
    formInvoice() {
      const b = this.bk, prop = this.properties.find(p => p.id === b.propertyId), unit = this.units.find(u => u.id === b.unitId);
      return invoiceOf({ ...b, feesInPayments: true, monthCharges: this.chargesFor(this.resume) },
        { name: b.name.trim(), email: b.email.trim(), phone: b.phone.trim() },
        { propertyName: prop?.name || '', unitCode: unit?.unitCode || b.unitId || '', unitType: unit?.info?.type || '', propertyAddress: propertyAddressOf(prop), fees: this.feeSet });
    },
    openInvoice() { this.invoice = this.formInvoice(); },
    agentOf(id) { return (this.agents || []).find(a => a.id === id) || null; },
    // 24 Nov 2026: the picked agent and their commission history (the % on today's date goes on the commission line).
    // History not readable: the agent's % now.
    async commSource() {
      const agent = this.isAgent ? this.agentOf(this.bk.agentId) : null;
      if (!agent) return null;
      return { agent, history: await loadHistory(agent.id).catch(() => []) };
    },
    // 20 Nov 2026: the agents list (Marketing > Agent Database), loaded once when Agent is picked as the booking source
    async loadAgentList() {
      if (this.agents) return;
      this.agents = []; this.agentsMsg = 'Loading agents…';
      try { this.agents = await loadAgents(); this.agentsMsg = this.agents.length ? '' : 'No agents yet. Add them on Marketing › Agent Database.'; }
      catch (e) { this.agents = null; this.agentsMsg = e.code === 'permission-denied' ? "You can't see the agent list yet (Firestore rules Draft 0.95 needs publishing)." : 'Could not load the agents. Check your connection.'; }
    },
    // The month charges to save: a new booking gets the form's deposit and fees on its first month. Finishing an Awaiting payment
    // booking keeps its charges as they are, unless the deposit or fee boxes were changed: then the first month is replaced by them.
    chargesFor(base) {
      if (!base) return this.formCharges;
      const all = allMonthCharges(base), m = String(base.arrival || '').slice(0, 7);
      if (feeSnap(this.bk) === this.resumeFees) return all;
      delete all[m];
      return { ...all, ...this.formCharges };
    },
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
      const fm = firstMonthFees(d);   // 20 Nov 2026: the boxes show the first month's charges on the Payments tab
      this.bk = { name: tp.name || '', phone: tp.phone || '', email: tp.email || '', icPassport: tp.icPassport || '', nationality: tp.nationality || '', dob: tp.dob || '',
        gender: tp.gender || '', genderOther: tp.genderOther || '', coTenants: [], existing: null, matchUsed: true,
        rentType: d.rentType || termValue(d) || 'Daily', years: String(Math.max(1, Math.round((Date.parse(d.departure) - Date.parse(d.arrival)) / 864e5 / 365)) || 1), bookingSource: d.bookingSource || '', agentId: d.agentId || '', salesPersonUid: d.salesPersonUid || '', rentalStatus: 'Paid',   // finishing = paid (16 Nov 2026)
        mainPasscode: pp.mainDoorPasscode || '', currentExpiry: pp.currentExpiryDate || '', nextPasscode: pp.nextDoorPasscode || '', nextExpiry: pp.nextExpiryDate || '',
        rental: d.longTerm ? '' : v(d.rental), monthlyRent: d.longTerm ? v(d.monthlyRent || d.rental) : '', securityDeposit: fm.t.securityDeposit ? v(fm.t.securityDeposit) : (d.longTerm ? '0' : ''),
        ...Object.fromEntries(FEES.map(f => [f.key, fm.t[f.key] > 0 ? v(fm.t[f.key]) : ''])), othersNote: fm.note || d.othersNote || '',
        customFees: Object.fromEntries(this.feeSet.filter(f => !f.builtIn && fm.t[f.id] > 0).map(f => [f.id, v(fm.t[f.id])])),   // 23 Nov 2026
        payMode: '', payDate: today(), payId: doc(collection(db, 'offlinePayments')).id, docsLink: '',
        propertyId: d.propertyId || '', unitId: d.unitId || '', arrival: d.arrival || '', departure: d.departure || '', amount: '', paymentRef: '', ezeeNo: d.ezeeReservationNo || '', note: '' };
      try { this.properties = await loadProperties(); } catch { this.properties = []; }
      if (d.propertyId) { try { this.units = await loadUnits(d.propertyId); } catch { this.units = []; } }
      this.resumeFees = feeSnap(this.bk);
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
        const comm = await this.commSource();
        await runTransaction(db, async tx => {
          const cur = await tx.get(bRef);
          if (!cur.exists() || cur.data().status !== 'pending') throw stop(`${r.bookingNo || r.id} is not awaiting payment any more. Someone may have finished it already.`);
          const ls = r.agentId || comm ? await tx.get(lineRef(r.id)) : null, line = ls?.exists() ? { id: ls.id, ...ls.data() } : null;
          tx.update(bRef, { ...ex, monthlyRent: this.longTerm ? toCents(b.monthlyRent) : 0, monthCharges: this.chargesFor(cur.data()),   // its charges as saved now
            ezeeReservationNo: b.ezeeNo.trim(), status: 'active', paidAt: serverTimestamp(), updatedAt: serverTimestamp(), updatedBy: me.user.uid });
          // 24 Nov 2026: the agent's commission line. None yet (or another agent / type of rent, not paid): a new one with today's %.
          // Otherwise worked out again with its saved % (cancelled when the source is no longer Agent).
          const after = { ...cur.data(), ...ex, id: r.id, monthlyRent: this.longTerm ? toCents(b.monthlyRent) : 0 };
          if (comm && (!line || (line.status !== 'paid' && (line.agentId !== comm.agent.id || line.rentType !== after.rentType)))) tx.set(lineRef(r.id), newLine(me, after, comm.agent, comm.history));
          else if (line) writeChange(tx, me, line, after, { agentNow: !!comm, reason: 'Awaiting payment booking finished' });
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
    draftRef() { return doc(db, 'users', me.user.uid, 'drafts', this.lead ? `reservation_${this.lead.id}` : this.prefill?.ezeeNo ? `reservation_ezee_${String(this.prefill.ezeeNo).replace(/[^A-Za-z0-9_-]/g, '')}` : 'reservation'); },
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
      if (!this.bk.customFees || typeof this.bk.customFees !== 'object') this.bk.customFees = {};   // drafts saved before 23 Nov 2026
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
      const ag = this.isAgent ? this.agentOf(b.agentId) : null;   // 20 Nov 2026: the agent, for commission
      const sp = this.staff.find(s => s.uid === b.salesPersonUid);   // 20 Nov 2026: the sales person
      return { coTenantIds: coIds, salesPersonUid: sp?.uid || '', salesPersonName: sp?.name || '', bookingSource: b.bookingSource, agentId: ag?.id || '', agentName: ag?.name || '', agentCompany: ag?.company || '', rentalStatus: b.rentalStatus, moveInStatus: 'Ready_to_Send', moveOutStatus: 'Ready_to_Send',
        passwordStatus: b.mainPasscode.trim() && b.currentExpiry ? 'Ready_to_Send' : '', rentType: b.rentType, rental: this.longTerm ? toCents(b.monthlyRent) : toCents(b.rental),
        feesInPayments: true, monthCharges: this.formCharges,
        // 23 Nov 2026: amounts in custom fees (Booking settings > Other fees), { <feeId>: amount }; built-ins stay in monthCharges only
        customFees: Object.fromEntries(this.feeSet.filter(f => !f.builtIn && toCents(this.feeVal(f)) > 0).map(f => [f.id, toCents(this.feeVal(f))])) };   // 20 Nov 2026: deposit and fees saved as first-month charges (Payments tab)
    },
    // The unit code for the booking, read from the unit itself when the loaded list doesn't have it
    async unitCodeOf(unitId) { try { const u = await getDoc(doc(db, 'units', unitId)); return u.exists() ? u.data().unitCode || '' : ''; } catch { return ''; } },
    // Opens the step a validation message is about, scrolls to the field and puts the cursor there
    focusFor(msg) {
      const s = this.steps.findIndex(x => x.key === (STEP_OF.find(([re]) => re.test(msg)) || [])[1]);
      if (s >= 0) this.step = s;
      const MAP = [[/^Choose the type of rent/, '[aria-label="Type of rent"]'], [/Yearly Lease starts/, '#bIn button'], [/number of years/, '#bYears'], [/^Add the tenant/, '#bName'], [/^Add a full phone/, '#bPhone'], [/email address/, '#bEmail'], [/^Add the IC/, '#bIc'], [/^Type the gender/, '#bGenderOther'],
        [/^Choose the property and unit/, '[aria-label="Property"]'], [/^Choose the agent/, '[aria-label="Agent"]'], [/^Choose the booking source/, '[aria-label="Booking source"]'], [/^Choose the rental status/, '[aria-label="Rental status"]'],
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
        ...(this.payChecked && can(me, 'offlinePayments.edit') ? { status: 'Checked', verifiedByName: me.name, verifiedDate: today() } : { status: 'Pending', verifiedByName: '', verifiedDate: '' }),
        bookingId, bookingNo,
        forMonth: (b.arrival || b.payDate || today()).slice(0, 7),   // 19 Nov 2026: the booking's first payment is for its check-in month
        createdAt: serverTimestamp(), createdBy: me.user.uid, submittedByName: me.name };
    },
    // An existing booking on this unit whose dates overlap: offline bookings, and eZee bookings in the months around the stay.
    async findClash(b) {
      try {
        const hit = x => x.status !== 'cancelled' && (x.arrival || '') < b.departure && (x.departure || '9999') > b.arrival;
        const offs = await getDocs(query(collection(db, 'offlineBookings'), where('propertyId', '==', b.propertyId), where('unitId', '==', b.unitId)));
        for (const d of offs.docs) if (d.id !== this.fillOf?.id && hit(d.data())) return { no: d.data().bookingNo || d.id, arrival: d.data().arrival, departure: d.data().departure };
        const months = []; let y = +b.arrival.slice(0, 4), m = +b.arrival.slice(5, 7);
        const endKey = b.departure.slice(0, 7);
        for (let i = 0; i < 29; i++) { const k = `${y}-${String(m).padStart(2, '0')}`; months.push(k); if (k >= endKey) { m++; if (m > 12) { m = 1; y++; } months.push(`${y}-${String(m).padStart(2, '0')}`); break; } m++; if (m > 12) { m = 1; y++; } }
        const ez = await getDocs(query(collection(db, 'bookings'), where('propertyId', '==', b.propertyId), where('unitId', '==', b.unitId), where('departureMonth', 'in', months.slice(0, 30))));
        // 24 Nov 2026: the eZee booking of this same reservation (an eZee row opened here) is the same stay, not a clash
        const own = String(b.ezeeNo || '').trim();
        for (const d of ez.docs) if (hit(d.data()) && !(own && d.data().reservationNo === own)) return { no: d.data().reservationNo || d.id, arrival: d.data().arrival, departure: d.data().departure };
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
        : !b.rentType ? 'Choose the type of rent.'
        : !b.bookingSource ? 'Choose the booking source.'
        : this.isAgent && !b.agentId ? 'Choose the agent (booking source is Agent).'
        : !b.rentalStatus ? 'Choose the rental status.'
        : !b.arrival || !b.departure ? 'Add the check-in and check-out dates.'
        : this.nights < 0 ? "Check-out can't be before check-in."
        : this.longTerm && !(+b.monthlyRent > 0) ? 'Add the monthly rent.'
        : this.feeSet.some(f => +this.feeVal(f) < 0) || +b.securityDeposit < 0 ? "The deposit and fees can't be below 0." : '';
      const err = base || (pending || this.fillOf ? this.coError() : !this.longTerm && !this.unpaid && !(+b.amount > 0) ? 'Add the amount paid.'
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
      // 24 Nov 2026: Bulk Upload eZee: checked, nothing saved yet; the row waits for Continue to confirm
      if (this.stageOnly) {
        const b2 = this.bk, unit = this.units.find(u => u.id === b2.unitId);
        this.$emit('staged', { bk: JSON.stringify({ ...b2, existing: undefined }), pending,
          label: [b2.name.trim(), unit?.unitCode || '', pending ? 'Awaiting payment' : b2.rentalStatus].filter(Boolean).join(' · ') });
        this.start = typed(this.bk);
        return;
      }
      if (this.fillOf) return this.saveFill();
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

        const comm = await this.commSource();   // 24 Nov 2026: the agent and their % history, for the commission line
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
          const bData = { source: 'offline', inquiryId: ld.id, bookingNo, tenantId,
            propertyId: b.propertyId, ...tag, propertyName: prop?.name || '', unitId: b.unitId, unitCode,
            arrival: b.arrival, departure: b.departure, nights: this.nights, longTerm: this.longTerm,
            monthlyRent: this.longTerm ? toCents(b.monthlyRent) : 0,
            ezeeReservationNo: b.ezeeNo.trim(), ...this.extra(coIds), status: pending ? 'pending' : 'active',
            createdAt: serverTimestamp(), createdBy: me.user.uid, createdByName: me.name };
          tx.set(bRef, bData);
          if (comm) tx.set(lineRef(bookingId), newLine(me, { ...bData, id: bookingId }, comm.agent, comm.history));   // 24 Nov 2026: the agent's commission line
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
      this.$emit('saved', { bookingId, bookingNo, tenantId, ezeeNo: this.bk.ezeeNo.trim(), pending: true });
      linkTenant(tenantId, this.bk.propertyId);
      this.savedLink = { property: this.bk.propertyId, id: bookingId };
      this.clearDraft();
      this.invoiceNo = bookingNo; if (!this.autoSave) this.openInvoice();
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
        const comm = await this.commSource();   // 24 Nov 2026: the agent and their % history, for the commission line
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
          const bData = { source: 'direct', inquiryId: null, bookingNo, tenantId,
            propertyId: b.propertyId, ...tag, propertyName: prop?.name || '', unitId: b.unitId, unitCode,
            arrival: b.arrival, departure: b.departure, nights: this.nights, longTerm: this.longTerm,
            monthlyRent: this.longTerm ? toCents(b.monthlyRent) : 0,
            ezeeReservationNo: b.ezeeNo.trim(), ...this.extra(coIds), status: pending ? 'pending' : 'active',
            createdAt: serverTimestamp(), createdBy: me.user.uid, createdByName: me.name };
          tx.set(bRef, bData);
          if (comm) tx.set(lineRef(bookingId), newLine(me, { ...bData, id: bookingId }, comm.agent, comm.history));   // 24 Nov 2026: the agent's commission line
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

        this.$emit('saved', { bookingId: res.bookingId, bookingNo: res.bookingNo, tenantId: res.tenantId, ezeeNo: b.ezeeNo.trim(), pending: false });
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
/* Invoice step (20 Nov 2026 redesign) */
.inv-wrap { display: grid; gap: 14px; margin-bottom: 14px; align-content: start; }
.inv-hero { display: flex; flex-wrap: wrap; gap: 10px; align-items: stretch; height: auto; }
.inv-stat { flex: 1 1 150px; background: var(--head); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px 16px; display: flex; flex-direction: column; justify-content: flex-start; gap: 2px; height: auto; }
.inv-stat span { font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
.inv-stat b { font-size: 18px; color: var(--text); }
.inv-stat.main { flex: 2 1 240px; background: var(--accent-soft); border-color: transparent; }
.inv-stat.main b { font-size: 24px; color: var(--accent); }
.inv-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr)); gap: 14px; }
.inv-card { border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 16px; background: var(--surface); }
.inv-card h4 { margin: 0 0 8px; font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; }
.inv-kv { display: flex; justify-content: space-between; gap: 12px; padding: 5px 0; border-bottom: 1px solid var(--line); font-size: 13px; }
.inv-kv:last-child { border-bottom: 0; }
.inv-kv span { color: var(--muted); }
.inv-kv b { font-weight: 600; text-align: right; overflow-wrap: anywhere; }
.inv-scroll { max-height: 420px; overflow: auto; border: 1px solid var(--line); border-radius: 8px; }
.inv-tbl { width: 100%; border-collapse: collapse; font-size: 13px; }
.inv-tbl th { position: sticky; top: 0; background: var(--head); text-align: left; font-weight: 600; color: var(--muted); padding: 8px 10px; z-index: 1; }
.inv-tbl td { padding: 8px 10px; border-top: 1px solid var(--line); vertical-align: top; }
.inv-tbl .r { text-align: right; }
.inv-tbl .nowrap { white-space: nowrap; }
.inv-tbl tfoot td { position: sticky; bottom: 0; background: var(--surface); font-weight: 700; border-top: 2px solid var(--border); }
.inv-chip { display: inline-block; background: var(--chip); border-radius: 999px; padding: 2px 8px; margin: 0 4px 4px 0; font-size: 12px; }
.inv-chip b { font-weight: 600; }
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
.link-btn { background: none; border: 0; padding: 0; font: inherit; color: var(--accent); font-weight: 600; cursor: pointer; }
.rd-into { display: block; font-size: 11px; color: var(--accent); font-weight: 500; margin-top: 2px; }
</style>
