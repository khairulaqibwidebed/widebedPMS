<template>
  <div>
    <div class="drawer-back" @click="$emit('close')"></div>
    <aside class="drawer wide bk-fixed" role="dialog" aria-label="Booking" v-esc="() => $emit('close')">
      <div class="drawer-head"><h2>{{ `Booking ${bk.bookingNo || bk.id}` }}<span class="help bk-where">{{ ` · ${bk.propertyName || ''} · ${bk.unitCode || bk.unitId || ''} · ${bk.source === 'import' ? 'Imported from Willow' : bk.source === 'direct' ? 'Direct booking' : 'From Tenant leads'}` }}</span><span class="help bk-created-h" v-if="createdLine">{{ createdLine }}</span></h2><button class="icon-btn" @click="$emit('close')" aria-label="Close">×</button></div>
      <form class="drawer-body" id="bkForm" @submit.prevent="save()">
        <!-- 16 Nov 2026: saved as Awaiting payment on New booking; finish it there once paid -->
        <div class="notice await-note" v-if="pending">
          <span><b>Awaiting payment.</b> The unit is held for these dates. Send the invoice; once they pay, continue to the Payment step to finish the booking.</span>
          <span class="await-acts">
            <button type="button" class="btn" @click="openInvoice()" :disabled="!bk.loaded || invBusy">{{ invBusy ? 'Loading…' : 'Download invoice' }}</button>
            <RouterLink v-if="canForms" class="btn btn-primary" :to="{ path: '/Portfolio/bookings/new', query: { resume: bk.id } }">Continue to payment</RouterLink>
          </span>
        </div>
        <div class="notice warn" v-if="cancelled">{{ `Cancelled${bk.cancelledReason ? ': ' + bk.cancelledReason : ''}. It is left out of the lists, the Dashboard and the forms. Restore it, or delete it for good.` }}</div>
        <!-- 20 Nov 2026 (Khairul): early termination -->
        <div class="notice warn et-note" v-if="et">
          <div class="et-text">
          <div><b>{{ `Terminated early on ${dmy(et.date)}` }}</b>{{ ` (check-out was ${dmy(et.originalDeparture)}) · ${et.type === 'sudden' ? 'Sudden, no notice' : `With notice${et.noticeDate ? ' given ' + dmy(et.noticeDate) : ''}`}` }}</div>
          <div>{{ `Reason: ${et.reason || '—'}` }}</div>
          <div v-if="deposit > 0">{{ depositLine }}</div>
          <div v-if="et.refundNote">{{ `Refund note: ${et.refundNote}` }}</div>
          <div class="et-files" v-if="(et.files || []).length">Tenant's notice: <button type="button" class="et-link" v-for="x in et.files" :key="x.id || x.url" @click="viewNotice(x)">{{ x.name }}</button></div>
          </div>
          <div class="et-acts" v-if="canTerminate || isDirector">
            <label class="btn btn-sm" v-if="canTerminate" :class="{ disabled: bk.busy }">{{ term.upBusy ? `Uploading… ${Math.round(term.progress * 100)}%` : 'Add notice image' }}<input type="file" accept="image/*" multiple hidden :disabled="bk.busy" @change="addNotice($event)"></label>
            <button type="button" class="btn btn-sm" v-if="canTerminate && et.type === 'notice' && deposit > 0 && !refund.open" @click="startRefund()" :disabled="bk.busy">Update refund</button>
            <button type="button" class="btn btn-sm" v-if="isDirector" @click="undoTerm()" :disabled="bk.busy">Restore original check-out</button>
          </div>
          <div class="et-refund" v-if="refund.open">
            <div class="field"><label for="etCharges">Property charges taken off the deposit (RM)</label><input class="input" id="etCharges" type="number" min="0" step="0.01" v-model="refund.charges" placeholder="0.00"></div>
            <div class="field"><label for="etRefNote">Note</label><input class="input" id="etRefNote" v-model="refund.note" placeholder="e.g. Repaint bedroom wall, cleaning"></div>
            <p class="help">{{ `Refund: RM ${amt(deposit)} − RM ${amt(+refund.charges || 0)} = RM ${amt(Math.max(0, deposit - (+refund.charges || 0)))}` }}</p>
            <button type="button" class="btn btn-primary" @click="saveRefund()" :disabled="bk.busy || !(+refund.charges >= 0) || +refund.charges > deposit">Save refund</button> <button type="button" class="btn" @click="refund.open = false">Cancel</button>
          </div>
        </div>
        <p class="help" v-if="bk.inquiryId && acc.canOpenInquiry"><RouterLink class="navlink" :to="`/Operations/offline-inquiries?id=${bk.inquiryId}`">{{ `Open inquiry ${bk.inquiryId}` }}</RouterLink></p>
        <!-- 20 Nov 2026 (Khairul): the popup in tabs (was one long page) -->
        <div class="tabs bk-tabs" role="tablist">
          <button type="button" v-for="t in tabs" :key="t.key" role="tab" :aria-selected="String(tab === t.key)" :class="{ on: tab === t.key }" @click="tab = t.key">{{ t.label }}</button>
        </div>
        <div class="bk-grid" v-show="tab === 'details'">
        <!-- 16 Nov 2026: guest details (tenant personal data) only with Bookings Full -->
        <template v-if="acc.guestNames">
        <div class="form-sec">Guest <span class="help" style="text-transform:none;letter-spacing:0;font-weight:400">· private, Bookings Full only</span></div>
        <div class="field"><label>Name</label><input class="input" v-model="bk.f.name" :disabled="!guestEditable"></div>
        <div class="field"><label>Phone</label><input class="input" v-model="bk.f.phone" :disabled="!guestEditable"></div>
        <div class="field"><label>Email</label><input class="input" id="bkEmail" v-model="bk.f.email" :disabled="!guestEditable"></div>
        <div class="field"><label>IC / Passport</label><input class="input" v-model="bk.f.icPassport" :disabled="!guestEditable"></div>
        </template>
        <p class="help" v-else>Guest details are private: seen only with Bookings Full access.</p>
        <div class="form-sec">Stay</div>
        <div class="field"><label>Check in</label><input class="input" id="bkIn" type="date" v-model="bk.f.arrival" :disabled="!editable"></div>
        <div class="field"><label>Check out</label><input class="input" id="bkOut" type="date" v-model="bk.f.departure" :disabled="!editable"></div>
        <div class="field" v-if="isLong"><label>Monthly rent (RM)</label><input class="input" type="number" step="0.01" min="0" v-model="bk.f.rent" :disabled="!editable"></div>
        <!-- 25 Nov 2026 (Khairul): one night past a whole month or year (a 31-day month) goes into the last month at the same rent -->
        <label class="xn-tgl" v-if="isLong"><span class="tgl"><input type="checkbox" role="switch" v-model="bk.f.extraNight" :disabled="!editable" aria-label="Last night is part of the month"><span class="tgl-track"></span></span>
          <span><b>Last night is part of the month</b><small>For a 31-night month or a 365-night year at the same rent. The 1 extra night goes into the last month instead of its own.</small></span></label>
        <!-- 20 Nov 2026 (Khairul): the deposit is a charge on the Payments tab now (Security deposit on a month) -->
        <!-- 23 Nov 2026 (Khairul): a drop-down of Booking settings > Booking sources; a saved source not in the list stays shown -->
        <div class="field"><label>Booking source</label><OptionPicker class="fld-pick" v-model="bk.f.bookingSource" :options="sourceOpts" label="Booking source" placeholder="Choose source…" :disabled="!editable" /></div>
        <!-- 25 Nov 2026 (Khairul): a booking made for several units at once (Reservation form): the other units' bookings, read-only -->
        <div class="field" v-if="booking.groupId"><label>Booked together with</label>
          <input class="input" :value="groupText" disabled :title="groupText"></div>
        <div class="field" v-if="bk.salesPersonName"><label>Sales person</label><input class="input" :value="bk.salesPersonName" disabled></div>
        <!-- 20 Nov 2026: the agent picked on the booking form (booking source Agent), for their commission -->
        <div class="field" v-if="bk.agentName"><label>Agent</label><input class="input" :value="[bk.agentName, bk.agentCompany].filter(Boolean).join(' · ')" disabled></div>
        <!-- 24 Nov 2026 (Khairul): the agent's commission for this booking (agentCommissions/{id}), read-only; paid on the Agents page -->
        <div class="field" v-if="comm"><label>Agent commission<FormulaInfo :steps="commSteps" heading="Commission: how it is worked out" /></label>
          <input class="input" :value="commText" disabled></div>
        <div class="field"><label>Rental status</label><input class="input" v-model="bk.f.rentalStatus" :disabled="!editable"></div>
        <div class="field"><label>eZee reservation no.</label><input class="input" v-model="bk.f.ezeeReservationNo" :disabled="!editable"></div>
        <div class="field"><label>Remark</label><textarea class="input" rows="2" v-model="bk.f.remark" :disabled="!editable"></textarea></div>
        </div>
        <div class="bk-grid" v-show="tab === 'passcodes'">
        <template v-if="bk.hasPrivate">
          <div class="form-sec">Door passcodes</div>
          <div class="field"><label>Main door passcode</label><input class="input" v-model="bk.f.mainDoorPasscode" :disabled="!editable"></div>
          <div class="field"><label>Expires</label><input class="input" type="date" v-model="bk.f.currentExpiryDate" :disabled="!editable"></div>
          <div class="field"><label>Next passcode</label><input class="input" v-model="bk.f.nextDoorPasscode" :disabled="!editable"></div>
          <div class="field"><label>Next expires</label><input class="input" type="date" v-model="bk.f.nextExpiryDate" :disabled="!editable"></div>
        </template>
        </div>
        <div v-show="tab === 'payments'">
        <div class="form-sec">Payments <span class="help" style="text-transform:none;letter-spacing:0;font-weight:400">· from Accounting › Offline Payments</span></div>
        <template v-if="bk.payments">
          <p class="help" v-if="!bk.payments.length">{{ bk.amount ? `No payment records. Older booking: RM ${amt(bk.amount)} paid.` : 'No payment recorded yet.' }}</p>
          <template v-for="x in bk.payments" :key="x.id">
            <div class="pay-row"><span>{{ `${dmy(x.date)}${x.forMonth && !(x.parts || []).length ? ' · for ' + monthName(x.forMonth) : ''}${x.mode ? ' · ' + x.mode : ''}${x.bankRef ? ' · ' + x.bankRef : ''}` }}</span><b>{{ `RM ${amt(x.amount)}` }}</b><span class="tag">{{ x.status }}</span></div>
            <!-- 23 Nov 2026: a Rental + Utilities payment shows its parts and the bills it paid -->
            <div class="pay-part" v-if="payParts(x)">{{ payParts(x) }}</div>
          </template>
          <p class="help" v-if="bk.payments.length > 1">{{ `Total Checked RM ${amt(totalChecked)}${totalChecked !== totalPaid ? ` · rental RM ${amt(totalPaid)}` : ''}` }}</p>
        </template>
        <p class="help" v-else>Payments are visible to Accounting, Directors and Operations.</p>
        <template v-if="bk.payments && cal.length">
          <div class="form-sec">Rent summary</div>
          <div class="cal-row" v-if="isLong"><span>Monthly rent</span><b>{{ `RM ${amt(Number(bk.f.rent) || Number(bk.monthlyRent) || 0)}` }}</b></div>
          <div class="cal-row"><span>{{ isLong ? `Total rental (${cal.length} ${cal.length === 1 ? 'month' : 'months'}) · owner receives` : 'Total rental' }}</span><b>{{ `RM ${amt(totalDue)}` }}</b></div>
          <!-- 25 Nov 2026 (Khairul): the deposit and fees fold away under one Charges line (closed at first) -->
          <button type="button" class="cal-row cal-fold" v-if="chargeSums.length" :aria-expanded="String(chargesOpen)" @click="chargesOpen = !chargesOpen">
            <span><span class="tp-caret" aria-hidden="true">{{ chargesOpen ? '▾' : '▸' }}</span>{{ `Deposit and fees (${chargeSums.filter(c => c.v).length} charged)` }}</span><b>{{ `RM ${amt(extraTotal)}` }}</b></button>
          <template v-if="chargesOpen"><div class="cal-row cal-sub" :class="{ 'cal-zero': !c.v }" v-for="c in chargeSums" :key="c.label"><span>{{ c.label }}</span><b>{{ `RM ${amt(c.v)}` }}</b></div></template>
          <div class="cal-row"><span>Total to pay</span><b>{{ `RM ${amt(totalDue + extraTotal)}` }}</b></div>
          <div class="cal-row"><span><b>Total paid</b></span><b>{{ `RM ${amt(totalPaid)}` }}</b></div>
          <div class="form-sec">Total Payments</div>
          <!-- 20 Nov 2026 (Khairul): charges can be added to a month (same list as the booking form); they count in that
               month's due and show on that month of the invoice. Saved with Save booking. -->
          <!-- 20 Nov 2026: easier to scan: filter by status, a year line, one compact row per month with a + to add a charge -->
          <div class="tp-filter" role="group" aria-label="Show months">
            <button type="button" v-for="o in mpFilters" :key="o.key" :class="{ on: mpFilter === o.key }" :aria-pressed="String(mpFilter === o.key)" @click="mpFilter = o.key">{{ o.label }} <b>{{ o.n }}</b></button>
          </div>
          <div class="tp-list">
            <p class="tp-none" v-if="!calShown.length">No months here.</p>
            <template v-for="(c, i) in calShown" :key="c.k">
              <!-- 20 Nov 2026: click a year line to fold its months away -->
              <button type="button" class="tp-year" v-if="i === 0 || c.m.slice(0, 4) !== calShown[i - 1].m.slice(0, 4)"
                :aria-expanded="String(!yearShut(c.m.slice(0, 4)))" @click="toggleYear(c.m.slice(0, 4))">
                <span><span class="tp-caret" aria-hidden="true">{{ yearShut(c.m.slice(0, 4)) ? '▸' : '▾' }}</span><b>{{ c.m.slice(0, 4) }}</b>{{ ` · ${yearSum(c.m.slice(0, 4)).text}` }}</span>
                <span class="tp-amt">{{ `RM ${amt(yearSum(c.m.slice(0, 4)).paid)}` }}<small>{{ ` / ${amt(yearSum(c.m.slice(0, 4)).due)}` }}</small></span>
              </button>
              <template v-if="!yearShut(c.m.slice(0, 4))">
              <div class="tp-row" :class="{ open: add.m === c.k }">
                <span class="tp-m">{{ c.from ? c.label : shortName(c.m) }}<small v-if="c.from">{{ leaseSpan(c) }}</small></span>
                <span><span class="pill" :class="MONTH_PAY[c.status].cls">{{ MONTH_PAY[c.status].label }}</span></span>
                <!-- 25 Nov 2026 (Khairul): a month's paid figure is what it kept: its own payments plus what was carried in,
                     less what it carried on to the next month (the last month keeps any overpayment for the stay) -->
                <span class="tp-amt"><b>{{ `RM ${amt(keptOf(c))}` }}</b><small v-if="c.due + c.extra > 0">{{ ` / ${amt(c.due + c.extra)}` }}</small></span>
                <button v-if="editable" type="button" class="tp-plus" @click="add.m === c.k ? (add.m = '') : startAdd(c.k)" :title="`Add a charge to ${monthTag(c)}`" :aria-label="`Add a charge to ${monthTag(c)}`">+</button>
              </div>
              <div class="tp-charge" v-for="ch in c.charges" :key="ch.m + '-' + ch.j">
                <span>{{ chargeLabel(ch.x) }}</span>
                <b>{{ `RM ${amt(ch.x.amount)}` }}</b>
                <button v-if="editable" type="button" class="mc-x" @click="removeCharge(ch.m, ch.j, c)" :aria-label="`Remove ${chargeLabel(ch.x)} from ${monthTag(c)}`">×</button>
              </div>
              <!-- 23 Nov 2026: carry forward (paid over the month's total goes to the next month) -->
              <div class="tp-charge tp-carry" v-if="c.carryIn > 0"><span>{{ `Carried from ${monthTag(cal[cal.findIndex(x => x.k === c.k) - 1])}` }}</span><b>{{ `+ RM ${amt(c.carryIn)}` }}</b><span></span></div>
              <div class="tp-charge tp-carry" v-if="c.carryOut > 0"><span>{{ cal.findIndex(x => x.k === c.k) < cal.length - 1 ? `Carried to ${monthTag(cal[cal.findIndex(x => x.k === c.k) + 1])}` : 'Paid over the total for the stay' }}</span><b>{{ `RM ${amt(c.carryOut)}` }}</b><span></span></div>
              <div class="mc-form" v-if="editable && add.m === c.k">
                <select class="input" :id="'mcKey' + c.k" v-model="add.key" :aria-label="`Charge for ${monthTag(c)}`">
                  <option value="" disabled>Choose charge…</option>
                  <option v-for="[k, l] in chargeChoices" :key="k" :value="k">{{ l }}</option>
                </select>
                <input v-if="add.key === 'othersFee'" class="input" v-model="add.note" placeholder="What for" aria-label="What the charge is for">
                <input class="input mc-amt" type="number" min="0" step="0.01" v-model="add.amount" placeholder="0.00" aria-label="Amount (RM)" @keydown.enter.prevent="addCharge()">
                <button type="button" class="btn btn-primary" @click="addCharge()" :disabled="!add.key || !(Number(add.amount) > 0)">Add</button>
                <button type="button" class="btn" @click="add.m = ''">Cancel</button>
              </div>
              </template>
            </template>
          </div>
          <p class="help" v-if="editable" style="margin-top:6px">Use + on a month to add the security deposit or a fee to it. The deposit and fees typed on the booking form are on the first month.</p>
          <p class="help" v-if="editable && chargesChanged">Month charges changed: add a reason below and Save booking to keep them.</p>
          <p class="help">{{ isLong ? `${leaseLabel(nightsNow)}: each month is rent and charges against the Checked payments for that month. Paid over a month's total is carried to the next month.` : 'Short term: the rental is due in the check-in month; Checked payments count in the month they are for.' }}</p>
        </template>
        <!-- 24 Nov 2026 (Khairul): Charges payments (Offline Payments, Payment for = Charges) on their own, never in a month's paid -->
        <template v-if="chargePays.length">
          <div class="form-sec">Charges <span class="help" style="text-transform:none;letter-spacing:0;font-weight:400">· kept apart from the rent</span></div>
          <div class="tp-list">
            <div class="cg-row" v-for="x in chargePays" :key="x.id">
              <span class="cg-main"><span>{{ dmy(x.date) }}</span><small>{{ x.note || '—' }}</small></span>
              <span><span class="pill" :class="x.status === 'Checked' ? 'green' : 'blue'">{{ x.status === 'Checked' ? 'Checked' : 'Pending check' }}</span></span>
              <b class="tp-amt">{{ `RM ${amt(x.amount)}` }}</b>
            </div>
          </div>
          <div class="cal-row" style="margin-top:6px"><span><b>Charges paid</b> <small class="muted">(Checked)</small></span><b>{{ `RM ${amt(chargesPaid)}` }}</b></div>
          <p class="help">Recorded on Accounting › Offline Payments with Payment for = Charges. They do not count towards any month's rent.</p>
        </template>
        </div>
        <div v-show="tab === 'invoice'">
        <!-- 20 Nov 2026: the invoice for any booking (was Awaiting payment only): the full invoice or one month's page -->
        <template v-if="!pending">
          <div class="form-sec" style="margin-top:0">Invoice</div>
          <p class="help">{{ isLong ? 'Download the full invoice (summary and every month) or one month on its own. Month charges show on their month.' : 'Download the invoice for this booking.' }}</p>
          <button type="button" class="btn" @click="openInvoice()" :disabled="!bk.loaded || invBusy">{{ invBusy ? 'Loading…' : 'Download invoice' }}</button>
        </template>
        <!-- 23 Nov 2026 (Khairul): many bills per booking, newest first, each with its payment status -->
        <div class="form-sec ub-head"><span>{{ `Utility bills · ${(bk.bills || []).length}` }}</span>
          <RouterLink v-if="canForms && !cancelled" class="btn btn-sm" :to="{ path: '/Operations/booking-forms/utility', query: { booking: bk.id } }">+ Lodge new bill</RouterLink></div>
        <p class="help" v-if="!bk.loaded">Loading…</p>
        <p class="help" v-else-if="bk.bills === null">The utility bills can't be read (this booking's property is not on your list, or the latest rules are not published).</p>
        <p class="help" v-else-if="!bk.bills.length">No utility bills yet.</p>
        <div class="ub-list" v-if="bk.bills && bk.bills.length">
          <div class="ub-item" v-for="x in bk.bills" :key="x.id" :class="{ open: billOpen === x.id }">
            <div class="ub-row">
              <span class="ub-main"><b>{{ datesText(x) }}</b><small>{{ lodgedLine(x) }}</small></span>
              <b class="ub-amt">{{ `RM ${amt(x.total)}` }}</b>
              <span class="pill" :class="billPill(x).cls">{{ billPill(x).text }}</span>
            </div>
            <div class="ub-acts">
              <RouterLink v-if="canRecordPay && x.status !== 'paid'" class="btn btn-sm" :to="{ path: '/Finance/offline-payments', query: { record: bk.id, bill: x.id } }">Record payment</RouterLink>
              <button type="button" class="btn btn-sm" :disabled="!bk.f.email" :title="bk.f.email ? 'Opens Gmail with the bill filled in' : 'No tenant email on file (or not visible to you)'" @click="emailBill(x)">Email</button>
              <button type="button" class="btn btn-sm" @click="openBill(x)">{{ billOpen === x.id ? 'Close' : canEditBill ? 'View / Edit' : 'View' }}</button>
            </div>
            <!-- View / Edit: lines, photos, payments; editing needs a reason (audit utilityBill.update) -->
            <div class="ub-view" v-if="billOpen === x.id">
              <template v-if="!billEd">
                <div class="cal-row" v-for="(l, i) in x.lines" :key="i"><span>{{ `${kindLabel(l.kind)} · ${dmy(l.from)} to ${dmy(l.to)}` }}</span><b>{{ `RM ${amt(l.amount)}` }}</b></div>
                <div class="cal-row"><span><b>Total</b></span><b>{{ `RM ${amt(x.total)}` }}</b></div>
                <!-- 23 Nov 2026 (Khairul): only Checked payments count as paid; Pending / Unknown ones show as Pending check -->
                <div class="cal-row"><span>Paid (Checked)</span><b>{{ `RM ${amt(billState(x).checked)}` }}</b></div>
                <div class="cal-row" v-if="billState(x).pending > 0"><span>Pending check</span><b>{{ `RM ${amt(billState(x).pending)}` }}</b></div>
                <div class="cal-row cal-sub" v-for="p in billPays(x)" :key="p.id"><span>{{ `${dmy(p.date)} · ${p.status}${p.mode ? ' · ' + p.mode : ''}` }}</span><b>{{ `RM ${amt(p.amount)}` }}</b></div>
                <p class="help" v-if="x.lodgedFrom === 'payment'">Added from an offline payment.</p>
              </template>
              <template v-else>
                <div class="ub-line" v-for="l in billEd.lines" :key="l.kind">
                  <span>{{ kindLabel(l.kind) }}</span>
                  <input class="input" type="date" v-model="l.from" :aria-label="`${kindLabel(l.kind)} from`">
                  <input class="input" type="date" v-model="l.to" :aria-label="`${kindLabel(l.kind)} to`">
                  <input class="input" type="number" min="0" step="0.01" placeholder="0.00" v-model="l.amount" :aria-label="`${kindLabel(l.kind)} amount (RM)`">
                </div>
                <div class="field"><label class="req" for="ubWhy">Reason for the change</label><input class="input" id="ubWhy" v-model="billEd.reason" placeholder="e.g. Wrong water amount"></div>
              </template>
              <div class="field"><label>Bill photos</label>
                <DriveFiles :key="'ub' + x.id" kind="utility-bills" :record-id="x.id" :readonly="!canEditBill" :label="`${bk.unitCode || bk.unitId || ''} ${bk.bookingNo || bk.id} utility`" @folder="l => keepFolder(x, l)" /></div>
              <p class="help" v-if="billErr" style="color:var(--red)">{{ billErr }}</p>
              <div class="ub-edit-acts" v-if="canEditBill">
                <template v-if="!billEd">
                  <button type="button" class="btn btn-sm" @click="startBillEdit(x)">Edit bill</button>
                  <button type="button" class="btn btn-sm" :disabled="!!x.paymentIds.length || billBusy" :title="x.paymentIds.length ? 'Payments are linked: unlink them first' : 'Delete this bill'" @click="removeBill(x)">Delete bill</button>
                </template>
                <template v-else>
                  <button type="button" class="btn btn-primary btn-sm" :disabled="billBusy" @click="saveBill(x)">{{ billBusy ? 'Saving…' : 'Save bill' }}</button>
                  <button type="button" class="btn btn-sm" @click="billEd = null">Cancel</button>
                </template>
              </div>
            </div>
          </div>
        </div>
        <div class="ub-foot" v-if="bk.bills && bk.bills.length">
          <span>Billed <b>{{ `RM ${amt(billSum.billed)}` }}</b></span><span>Paid <b>{{ `RM ${amt(billSum.paid)}` }}</b></span><span v-if="billSum.pending > 0">Pending check <b>{{ `RM ${amt(billSum.pending)}` }}</b></span><span>Owing <b>{{ `RM ${amt(billSum.owing)}` }}</b></span>
        </div>
        </div>
        <div class="field bk-reason" v-if="editable"><label>Reason for the change (audit log)</label><input class="input" id="bkReason" v-model="bk.reason" placeholder="e.g. Guest extended by two nights"></div>
        <div class="confirm-box" v-if="cancelling">
          <div class="field" style="margin-bottom:10px"><label for="bkCancelWhy" class="req">Why cancel this booking?</label><input class="input" id="bkCancelWhy" v-model="cancelReason" placeholder="e.g. Guest cancelled, booked by mistake"></div>
          <button type="button" class="btn btn-primary" @click="cancelBooking()" :disabled="bk.busy || !cancelReason.trim()">Cancel booking</button> <button type="button" class="btn" @click="cancelling = false">Keep booking</button>
        </div>
        <div class="confirm-box et-box" v-if="terminating">
          <div class="form-sec" style="margin-top:0">Early termination</div>
          <div class="et-grid">
            <div class="field"><label for="etDate" class="req">Move-out date</label><input class="input" type="date" id="etDate" v-model="term.date" :min="nextDay(bk.arrival)" :max="prevDay(bk.departure)"></div>
            <div class="field"><label for="etType" class="req">Type</label>
              <select class="input" id="etType" v-model="term.type"><option value="" disabled>Choose…</option><option value="notice">With notice (tenant gave notice)</option><option value="sudden">Sudden (no notice)</option></select></div>
            <div class="field" v-if="term.type === 'notice'"><label for="etNoticeDate" class="req">Notice given on</label><input class="input" type="date" id="etNoticeDate" v-model="term.noticeDate" :max="term.date || undefined"></div>
          </div>
          <div class="field"><label for="etWhy" class="req">Reason</label><textarea class="input" id="etWhy" rows="2" v-model="term.reason" placeholder="e.g. Tenant relocating for work"></textarea></div>
          <div class="field"><label for="etFiles">Tenant's notice (images, optional)</label>
            <div class="et-pick">
              <label class="btn" :class="{ disabled: bk.busy }"><input type="file" id="etFiles" accept="image/*" multiple hidden :disabled="bk.busy" @change="pickNotice($event)">Choose images</label>
              <span class="help" v-if="!term.files.length">The notice letter or message from the tenant. JPG or PNG. Can be added later too.</span>
              <span class="et-chip" v-for="(x, i) in term.files" :key="x.name + i">{{ x.name }}<button type="button" :aria-label="`Remove ${x.name}`" @click="term.files = term.files.filter((_, j) => j !== i)">×</button></span>
            </div>
          </div>
          <p class="help" v-for="l in termPreview" :key="l">{{ l }}</p>
          <button type="button" class="btn btn-danger" @click="terminate()" :disabled="bk.busy || !!termProblem">{{ term.upBusy ? `Uploading… ${Math.round(term.progress * 100)}%` : bk.busy ? 'Saving…' : 'Terminate early' }}</button> <button type="button" class="btn" @click="terminating = false" :disabled="bk.busy">Keep booking</button>
          <p class="help" v-if="termProblem && (term.date || term.type)">{{ termProblem }}</p>
        </div>
        <p class="help" v-if="cancelled && acc.bkEdit && deleteBlock">{{ deleteBlock }}</p>
        <p class="help" v-if="bk.error" style="color:var(--red)">{{ bk.error }}</p>
      </form>
      <div class="drawer-foot">
        <span class="foot-left" v-if="(acc.bkEdit && !cancelled) || termAllowed">
          <button class="btn" v-if="acc.bkEdit && !cancelled" v-show="!cancelling && !terminating" @click="startCancel()" :disabled="bk.busy">Cancel booking</button>
          <button class="btn" v-if="termAllowed" v-show="!cancelling && !terminating" @click="startTerm()" :disabled="bk.busy || !bk.loaded">Early termination</button>
        </span>
        <template v-if="acc.bkEdit && cancelled">
          <button class="icon-btn trash" style="margin-right:auto" @click="remove()" :disabled="bk.busy || !!deleteBlock || !bk.loaded" :title="deleteBlock || 'Delete this booking for good'" aria-label="Delete booking for good"><Icon name="trash" /></button>
          <button class="btn btn-primary" @click="restore()" :disabled="bk.busy">Restore booking</button>
        </template>
        <button class="btn" @click="$emit('close')">Close</button>
        <button class="btn btn-primary" type="submit" form="bkForm" v-if="editable" :disabled="bk.busy">{{ bk.busy ? 'Saving…' : 'Save booking' }}</button>
      </div>
    </aside>
    <FileViewer ref="viewer" />
    <InvoiceDialog v-if="invoice" :invoice="invoice" :booking-no="bk.bookingNo || ''" :booking-id="booking.id" @close="invoice = null" />
  </div>
</template>

<script>
import { leaseLabel } from '@/lib/lease-term.js';
import { payCounts, withCarry, rentalOf, rentalParts } from '@/lib/booking-pay.js';
import { PILL, datesText, statusPill, kindLabel, KINDS, partsOf, billMailLink, saveBillEdit, deleteBill, noteEmailed, linesProblem } from '@/lib/utility-bills.js';
import DriveFiles from '@/components/DriveFiles.vue';
// Booking drawer (Portfolio › Bookings): an offline booking's details, rent summary and payments; Accounting,
// Directors and Operations can edit it. Tells the page "saved" with the changed fields so it can update its list.
import { amt, dmy, monthName } from '@/lib/format.js';
import { friendlyError } from '@/lib/finance-data.js';
import { useSession } from '@/stores/session.js';
import { toast } from '@/lib/toast.js';
import { askConfirm } from '@/lib/confirm.js';
import { MONTH_PAY, shortName, loadBookingDetails, saveOfflineBooking, setBookingCancelled, deleteOfflineBooking, terminateBooking, updateTermination, undoTermination } from '@/lib/portfolio-data.js';
import { doc, getDoc, updateDoc, getDocs, query, where, collection } from 'firebase/firestore';
import { db } from '@/lib/firebase.js';
import { can } from '@/lib/access.js';
import { invoiceOf, propertyAddressOf, FEE_LABELS, chargeLabel, legacyCharges, allMonthCharges, addInto, depositOf, leaseMonths, leaseSlot, leaseKey, leaseSpan } from '@/lib/booking-invoice.js';
import InvoiceDialog from '@/components/InvoiceDialog.vue';
import OptionPicker from '@/components/OptionPicker.vue';
import { sourcesForForms, feesForForms, sourceOptions, normSources, normFees } from '@/lib/booking-settings.js';
import FileViewer from '@/components/FileViewer.vue';
import FormulaInfo from '@/components/FormulaInfo.vue';
import { loadLine, stepsOf, STATUS_LABEL } from '@/lib/agent-commission.js';
import { uploadForLink } from '@/lib/drive.js';

const me = useSession();
const PRIV = ['name', 'phone', 'email', 'icPassport', 'mainDoorPasscode', 'currentExpiryDate', 'nextDoorPasscode', 'nextExpiryDate'];
const GUEST = ['name', 'phone', 'email', 'icPassport'];
// Month charges as saved: months in order, empty months and zero amounts left out
// Dates as YYYY-MM-DD (20 Nov 2026, early termination)
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const shiftDay = (d, n) => { if (!d) return ''; const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const addMonthsIso = (d, n) => { const t = new Date(d + 'T00:00:00Z'), day = t.getUTCDate(); t.setUTCDate(1); t.setUTCMonth(t.getUTCMonth() + n);
  t.setUTCDate(Math.min(day, new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate())); return t.toISOString().slice(0, 10); };
// Days in the last part month: from the last monthly anniversary of check-in up to the move-out (0 when it lands on one)
const partDays = (arrival, out) => { let from = arrival; for (let i = 1; i <= 240; i++) { const n = addMonthsIso(arrival, i); if (n > out) break; from = n; } return daysBetween(from, out); };
const cleanCharges = mc => Object.fromEntries(Object.entries(mc || {}).sort(([a], [b]) => a.localeCompare(b))
  .map(([m, l]) => [m, (Array.isArray(l) ? l : []).filter(x => Number(x.amount) > 0)]).filter(([, l]) => l.length));
// 20 Nov 2026 (Khairul): the deposit and fees live in the month charges only. An older booking's deposit and fee fields are
// shown as charges on its check-in month (allMonthCharges); saving the booking writes them into monthCharges with
// feesInPayments: true, so they are never counted twice. The old fields stay on the record untouched.

export default {
  props: {
    booking: { type: Object, required: true },   // the row from the bookings list
    acc: { type: Object, required: true }
  },
  components: { InvoiceDialog, FileViewer, OptionPicker, DriveFiles, FormulaInfo },
  emits: ['close', 'saved', 'deleted', 'patched'],
  data() {
    const r = this.booking, rm = c => (c ? Number(c).toFixed(2) : '');
    const f = { name: '', phone: '', email: '', icPassport: '', mainDoorPasscode: '', currentExpiryDate: '', nextDoorPasscode: '', nextExpiryDate: '',
      arrival: r.arrival || '', departure: r.departure || '', rent: rm(r.longTerm ? r.monthlyRent : ''), extraNight: !!r.extraNight,
      bookingSource: r.bookingSource || '', rentalStatus: r.rentalStatus || '', ezeeReservationNo: r.ezeeReservationNo || '', remark: r.remark || '',
      monthCharges: cleanCharges(allMonthCharges(r)) };
    return { comm: null, group: null, PILL, billOpen: '', billEd: null, billBusy: false, billErr: '', MONTH_PAY, FEE_LABELS, sources: normSources(null), feeSet: normFees(null), tab: 'details', chargesOpen: false, mpFilter: 'all', yearsShut: {}, add: { m: '', key: '', amount: '', note: '' }, canForms: can(me, 'bookingForms.view'), invoice: null, invBusy: false, cancelling: false, cancelReason: '',
      terminating: false, term: { date: '', type: '', noticeDate: '', reason: '', files: [], upBusy: false, progress: 0 }, refund: { open: false, charges: '', note: '' }, bk: { ...r, f, hasPrivate: false, bills: null, reason: '', error: '', busy: false, loaded: false } };
  },
  computed: {
    // 25 Nov 2026 (Khairul): when the booking was made, and by whom, under the title
    createdLine() {
      const t = this.booking?.createdAt, ms = !t ? 0 : typeof t.toMillis === 'function' ? t.toMillis() : typeof t.seconds === 'number' ? t.seconds * 1000 : Number(new Date(t)) || 0;
      if (!ms) return '';
      const who = this.booking.createdByName || this.booking.submittedByName || '';
      return `Created ${new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}${who ? ` by ${who}` : ''}`;
    },
    // 24 Nov 2026: "RM 100.00 · 5% of one month's rent · Unpaid"
    commText() {
      const l = this.comm; if (!l) return '';
      const money = `RM ${(Number(l.amount) || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const how = l.rate == null ? 'no % set' : `${l.rate}% of ${l.rentType === 'Daily' ? 'the total rental' : 'one month\'s rent'}`;
      return `${money} · ${how} · ${STATUS_LABEL[l.status] || l.status}${l.status === 'paid' && l.paid?.date ? ` on ${l.paid.date}` : ''}`;
    },
    // 25 Nov 2026: the other bookings of the same group (several units booked together), e.g. "DM-015 · B-12-03"
    groupText() {
      const g = this.group;
      if (!g) return 'Loading…';
      const others = g.filter(x => x.id !== this.booking.id), gno = `Group ${String(this.booking.groupId).replace(/^offline_/, '')}`;   // the group id searched in Offline Payments
      return others.length ? `${gno}: ` + others.map(x => [x.bookingNo || x.id, x.unitCode, x.status === 'cancelled' ? 'cancelled' : ''].filter(Boolean).join(' · ')).join(', ')
        : `${gno}: ${this.booking.groupSize || 'Several'} units were booked together; the others can't be seen.`;
    },
    commSteps() { return this.comm ? stepsOf(this.comm) : []; },
    // Guest details on a tenant record can only be changed by Accounting and Directors; on an imported booking Operations can too
    cancelled() { return this.bk.status === 'cancelled'; },
    // 23 Nov 2026: Booking settings. Sources: active ones in order plus this booking's own. Charges (+ on a month): the security
    // deposit, then the Other fees with their names from the settings (custom fees too).
    sourceOpts() { return sourceOptions(this.sources, this.bk.f.bookingSource); },
    chargeChoices() { return [FEE_LABELS[0], ...this.feeSet.map(f => [f.id, f.label])]; },
    pending() { return this.bk.status === 'pending'; },
    // 20 Nov 2026 (Khairul): early termination. The Early termination tick (Directors always); undo is Directors only.
    et() { const e = this.bk.earlyTermination; return e && e.date ? e : null; },
    canTerminate() { return can(me, 'earlyTermination.edit'); },
    isDirector() { return ['director', 'branchDirector'].includes(me.role); },
    // A stay that has started and not ended (not cancelled, not awaiting payment, not already terminated)
    termAllowed() {
      const b = this.bk, today = todayIso();
      return this.canTerminate && !this.cancelled && !this.pending && !this.et && !!b.arrival && !!b.departure && b.arrival <= today && today < b.departure;
    },
    deposit() { return depositOf(this.bk); },
    depositLine() {
      const e = this.et, d = this.deposit, c = Number(e?.refundCharges) || 0;
      if (!e || !(d > 0)) return '';
      if (e.type === 'sudden') return `Deposit RM ${amt(d)}: forfeited (no notice).`;
      if (c > 0 || e.refundNote) return `Deposit RM ${amt(d)} − property charges RM ${amt(c)} = refund RM ${amt(Math.max(0, d - c))}.`;
      return `Deposit RM ${amt(d)}: to refund after any property charges.`;
    },
    termProblem() {
      const t = this.term, b = this.bk;
      if (!t.date) return 'Pick the move-out date.';
      if (!(t.date > b.arrival && t.date < b.departure)) return 'The move-out date must be after check-in and before the current check-out.';
      if (!t.type) return 'Pick the type: with notice or sudden.';
      if (t.type === 'notice' && !t.noticeDate) return 'Enter the date the tenant gave notice.';
      if (t.type === 'notice' && t.noticeDate > t.date) return 'The notice date must be on or before the move-out date.';
      if (!t.reason.trim()) return 'Enter the reason.';
      return '';
    },
    termPreview() {
      const t = this.term, b = this.bk, out = [];
      if (!t.date || !(t.date > b.arrival && t.date < b.departure)) return out;
      out.push(`Check-out moves from ${dmy(b.departure)} to ${dmy(t.date)}. Months after the move-out drop off.`);
      const rent = Number(b.monthlyRent) || 0, days = partDays(b.arrival, t.date);
      if (t.type === 'notice' && t.noticeDate && t.noticeDate <= t.date) out.push(`Notice period: ${daysBetween(t.noticeDate, t.date)} days.`);
      if (b.longTerm && rent > 0 && days > 0 && t.type) out.push(t.type === 'sudden' ? `Last month (${days} days) is charged in full: RM ${amt(rent)}.` : `Last month is charged by days: ${days} days = RM ${amt(rent / 30 * days)}.`);
      if (this.deposit > 0 && t.type) out.push(t.type === 'sudden' ? `Deposit RM ${amt(this.deposit)} is forfeited.` : `Deposit RM ${amt(this.deposit)} is refunded after any property charges (Update refund).`);
      out.push('No termination fee.');
      return out;
    },
    tabs() {
      return [{ key: 'details', label: 'Guest & stay' }, ...(this.bk.hasPrivate ? [{ key: 'passcodes', label: 'Door passcodes' }] : []),
        { key: 'payments', label: 'Payments' }, { key: 'invoice', label: this.pending ? 'Utility bill' : 'Invoice & utility' }];
    },
    // A cancelled booking is read-only until it is restored
    editable() { return this.acc.bkEdit && !this.cancelled; },
    // Delete for good only when no payment is recorded on it (and only by someone who can see its payments)
    deleteBlock() {
      const b = this.bk;
      if (!b.loaded) return '';
      if (b.payments === null) return "You can't see this booking's payments, so ask Accounting or a Director to delete it for good.";
      if (b.payments.length || Number(b.amount) > 0) return "Payments are recorded on this booking, so it can't be deleted for good. Keep it cancelled.";
      return '';
    },
    guestEditable() { const b = this.bk; return this.editable && !!b.guestOk && (!b.tenantId || this.acc.guestOnTenant); },
    nightsNow() { const f = this.bk.f; return Math.max(0, Math.round((new Date(f.departure) - new Date(f.arrival)) / 86400000)) || 0; },
    isLong() { const f = this.bk.f; return Math.round((new Date(f.departure) - new Date(f.arrival)) / 86400000) >= 30; },
    // Calendar of months for the booking: Checked payments for the month (For month, else payment date) against what is due
    cal() {
      const b = this.bk, f = b.f; if (!f.arrival || !f.departure || !b.payments) return [];
      const long = this.isLong, rent = Number(f.rent) || Number(b.monthlyRent) || 0, rental = Number(b.rental) || 0;
      // 24 Nov 2026 (Khairul): leases count months from the check-in (lib/booking-invoice.js leaseMonths, the same as the invoice):
      // a Monthly Lease in whole months (30 Nov - 31 Dec is one month), not one row per calendar month the stay touches.
      // A payment's For month and a month charge count in the lease month they fall in (leaseSlot).
      if (long) {
        const ms = leaseMonths({ arrival: f.arrival, departure: f.departure, earlyTermination: this.et, extraNight: !!f.extraNight }, rent);
        if (!ms.length) return [];
        const rows = ms.map((x, i) => ({ m: x.m, k: leaseKey(ms, i), from: x.from, to: x.to, label: x.label, paid: 0, due: x.rent, extra: 0, charges: [] }));   // 27 Nov 2026: k = this month's own key (two lease months can start in one calendar month)
        b.payments.filter(payCounts).forEach(x => rentalParts(x).forEach(p => { rows[leaseSlot(ms, p.m)].paid += p.amount; }));   // Checked only, Rental part only; 24 Nov 2026: each Rental line in its own month
        Object.entries(f.monthCharges || {}).sort(([p], [q]) => p.localeCompare(q)).forEach(([m, list]) => (list || []).forEach((x, j) => {
          const r = rows[leaseSlot(ms, m)]; r.extra += Number(x.amount) || 0; r.charges.push({ m, j, x });
        }));
        rows.forEach(r => { r.paid = Math.round(r.paid * 1000) / 1000; r.extra = Math.round(r.extra * 1000) / 1000; });
        return withCarry(rows.map(c => ({ ...c, due: c.due + c.extra }))).map((c, i) => ({ ...rows[i], carryIn: c.carryIn, carryOut: c.carryOut, status: c.status }));
      }
      const out = []; let [y, mo] = f.arrival.slice(0, 7).split('-').map(Number); const last = f.departure.slice(0, 7);
      for (let i = 0; i < 48; i++, mo++) {
        if (mo > 12) { mo = 1; y++; }
        const m = `${y}-${String(mo).padStart(2, '0')}`; if (m > last) break;
        const paid = b.payments.filter(x => payCounts(x) && (long || i === 0)).reduce((s, x) => s + (long ? rentalParts(x).filter(p => p.m === m).reduce((a, p) => a + p.amount, 0) : rentalOf(x)), 0);   // 24 Nov 2026: per Rental line   // Checked only (19 Nov 2026); Rental part only (23 Nov 2026)
        let due = long ? rent : (i === 0 ? rental : 0);
        // 20 Nov 2026: terminated early with notice: the last part month is rent / 30 x days (sudden: in full)
        if (long && m === last && this.et?.type === 'notice') { const d = partDays(f.arrival, f.departure); if (d > 0) due = Math.round(rent / 30 * d * 100) / 100; }
        const extra = (f.monthCharges[m] || []).reduce((s, x) => s + (Number(x.amount) || 0), 0), all = due + extra;   // 20 Nov 2026: month charges
        out.push({ m, k: m, paid, due, extra, charges: (f.monthCharges[m] || []).map((x, j) => ({ m, j, x })), status: all > 0 ? (paid >= all - 0.005 ? 'paid' : paid > 0 ? 'part' : 'unpaid') : (paid > 0 ? 'paid' : 'unpaid') });
      }
      // 23 Nov 2026 (Khairul): leases carry forward. Paid over a month's total (rent + charges) goes to the next month; the
      // status counts it (lib/booking-pay.js withCarry). Short stays are paid as one amount, so nothing to carry.
      if (!long) return out;
      return withCarry(out.map(c => ({ ...c, due: c.due + c.extra }))).map((c, i) => ({ ...out[i], carryIn: c.carryIn, carryOut: c.carryOut, status: c.status }));
    },
    // Deposit, fees and other month charges on top of the rental, added up by charge: paid by the guest, never part of the owner's share
    // 24 Nov 2026 (Khairul): every fee type is listed (the deposit and each fee in Booking settings), RM 0.00 when not charged,
    // so the full list is always in view; a charge of another kind (an older booking's, Others with a note) is added after them
    chargeSums() {
      const t = {}, order = [];
      const put = (l, v) => { if (!(l in t)) { t[l] = 0; order.push(l); } t[l] += v; };
      this.chargeChoices.forEach(([k, l]) => put(chargeLabel({ key: k, label: l }), 0));
      Object.values(this.bk.f.monthCharges).flat().forEach(x => put(chargeLabel(x), Number(x.amount) || 0));
      return order.map(label => ({ label, v: Math.round(t[label] * 100) / 100 })).filter(c => c.v > 0 || this.chargeChoices.some(([k, l]) => chargeLabel({ key: k, label: l }) === c.label));
    },
    totalDue() { return this.cal.reduce((a, c) => a + c.due, 0); },
    mpFilters() {
      const n = k => this.cal.filter(c => c.status === k).length;
      return [{ key: 'all', label: 'All', n: this.cal.length }, ...['unpaid', 'part', 'paid'].filter(k => MONTH_PAY[k]).map(k => ({ key: k, label: MONTH_PAY[k].label, n: n(k) })),
        { key: 'charges', label: 'With charges', n: this.cal.filter(c => c.extra > 0).length }];
    },
    calShown() { const f = this.mpFilter; return f === 'all' ? this.cal : f === 'charges' ? this.cal.filter(c => c.extra > 0) : this.cal.filter(c => c.status === f); },
    extraTotal() { return this.cal.reduce((a, c) => a + c.extra, 0); },
    chargesChanged() { return JSON.stringify(cleanCharges(this.bk.f.monthCharges)) !== JSON.stringify(cleanCharges(allMonthCharges(this.bk))); },
    totalPaid() { return (this.bk.payments || []).filter(payCounts).reduce((a, x) => a + rentalOf(x), 0); },
    // 24 Nov 2026 (Khairul): Charges payments, shown on their own (lib/utility-bills.js partsOf); Checked ones are paid
    // 24 Nov 2026: one row per Charges line (a payment may have several)
    chargePays() { return (this.bk.payments || []).flatMap(p => (Array.isArray(p.parts) ? p.parts : []).map((x, j) => ({ x, j })).filter(({ x }) => x.type === 'charges' && Number(x.amount) > 0).map(({ x, j }) => ({ id: `${p.id}-${j}`, date: p.date, status: p.status, amount: Number(x.amount) || 0, note: x.note || p.purpose || '' }))).sort((a, b) => String(a.date).localeCompare(String(b.date))); },
    chargesPaid() { return this.chargePays.filter(payCounts).reduce((a, x) => a + x.amount, 0); },
    totalChecked() { return (this.bk.payments || []).filter(payCounts).reduce((a, x) => a + (Number(x.amount) || 0), 0); },
    // 23 Nov 2026: utility bills. Edit as today: Accounting (finance edit ticks), Directors and the Booking forms tick (rules Draft 1.03)
    canEditBill() { return ['director', 'branchDirector'].includes(me.role) || ['bookingForms.view', 'ezeeUpload.edit', 'expenses.edit', 'monthEnd.edit', 'invoices.edit', 'offlinePayments.edit'].some(p => can(me, p)); },
    canRecordPay() { return can(me, 'offlinePayments.edit') || (can(me, 'offlinePayments.view') && (can(me, 'bookingForms.view') || can(me, 'offlineInquiries.view'))); },
    billSum() {
      // 23 Nov 2026 (Khairul): Paid = Checked payments only; Pending check = paid by Pending / Unknown payments; Owing = nothing paid yet
      const l = this.bk.bills || [], billed = l.reduce((a, x) => a + x.total, 0), st = l.map(x => this.billState(x));
      const paid = st.reduce((a, x) => a + x.checked, 0), pending = st.reduce((a, x) => a + x.pending, 0);
      return { billed, paid, pending, owing: Math.max(0, billed - paid - pending) };
    }
  },
  async created() {
    if (this.booking.agentId) loadLine(this.booking.id).then(l => { this.comm = l; });   // 24 Nov 2026: null when none or not readable
    if (this.booking.groupId) getDocs(query(collection(db, 'offlineBookings'), where('groupId', '==', this.booking.groupId)))
      .then(s => { this.group = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.bookingNo || '').localeCompare(String(b.bookingNo || ''))); })
      .catch(() => { this.group = []; });   // 25 Nov 2026: booked together
    Promise.all([sourcesForForms(), feesForForms()]).then(([s, f]) => { this.sources = s; this.feeSet = f; });   // 23 Nov 2026
    try {
      const d = await loadBookingDetails(this.booking);
      this.bk.payments = d.payments;
      if (d.hasPrivate) { this.bk.hasPrivate = true; Object.assign(this.bk.f, d.privateData); }
      if (d.guest) Object.assign(this.bk.f, d.guest);
      this.bk.guestOk = d.guestOk;
      this.bk.orig = { ...this.bk.f };
      this.bk.bills = d.bills;
      this.bk.loaded = true;
    } catch (e) { this.bk.error = friendlyError(e, 'load the booking'); }
  },
  methods: {
    // 24 Nov 2026: a lease month is "Month 1 · 30 Nov – 31 Dec 2026"; a short stay's row is its calendar month
    monthTag(c) { return c && c.from ? `${c.label} · ${leaseSpan(c)}` : shortName(c?.m || ''); },
    leaseSpan,
    leaseLabel, monthName, chargeLabel,
    keptOf(c) {
      const last = this.cal.findIndex(x => x.k === c.k) === this.cal.length - 1;
      return Math.round((c.paid + (c.carryIn || 0) - (last ? 0 : c.carryOut || 0)) * 1000) / 1000;
    },
    // The year line: months, how many paid / part / unpaid, and paid against due for that year (all months, not only the filtered ones)
    yearSum(y) {
      const ms = this.cal.filter(c => c.m.startsWith(y)), n = k => ms.filter(c => c.status === k).length;
      const parts = [['paid', 'paid'], ['part', 'part paid'], ['unpaid', 'unpaid']].map(([k, l]) => (n(k) ? `${n(k)} ${l}` : '')).filter(Boolean);
      return { text: `${ms.length} month${ms.length === 1 ? '' : 's'} · ${parts.join(', ')}`, paid: ms.reduce((a, c) => a + this.keptOf(c), 0), due: ms.reduce((a, c) => a + c.due + c.extra, 0) };   // 25 Nov 2026: kept, so a carry into the next year counts there
    },
    // Years fold open and shut; by default only the current year is open (or the first year if the stay is not in it)
    yearShut(y) {
      if (this.mpFilter !== 'all' && !(y in this.yearsShut)) return false;   // a filter shows its matches in every year
      if (y in this.yearsShut) return this.yearsShut[y];
      const ys = [...new Set(this.cal.map(c => c.m.slice(0, 4)))], now = String(new Date().getFullYear());
      return y !== (ys.includes(now) ? now : ys[0]);
    },
    toggleYear(y) { this.yearsShut = { ...this.yearsShut, [y]: !this.yearShut(y) }; },
    startAdd(m) { this.add = { m, key: '', amount: '', note: '' }; this.$nextTick(() => document.getElementById('mcKey' + m)?.focus()); },
    addCharge() {
      const a = this.add, v = Math.round((Number(a.amount) || 0) * 100) / 100;
      if (!a.m || !a.key || !(v > 0)) return;
      const label = this.chargeChoices.find(([k]) => k === a.key)?.[1] || a.key;
      // 20 Nov 2026 (Khairul): a charge already on the month is topped up, not added as a second line
      const list = addInto(this.bk.f.monthCharges[a.m], { key: a.key, label, amount: v, ...(a.key === 'othersFee' && a.note.trim() ? { note: a.note.trim() } : {}) });
      this.bk.f.monthCharges = { ...this.bk.f.monthCharges, [a.m]: list };
      this.add = { m: '', key: '', amount: '', note: '' };
    },
    // 27 Nov 2026 (Khairul): ask before a month charge is removed
    async removeCharge(m, j, c) {
      const x = (this.bk.f.monthCharges[m] || [])[j]; if (!x) return;
      if (!await askConfirm({ title: 'Delete this charge?', message: `${chargeLabel(x)}, RM ${amt(x.amount)} is removed from ${this.monthTag(c)}. Save booking afterwards to keep the change.`, confirmText: 'Delete charge', danger: true })) return;
      if ((this.bk.f.monthCharges[m] || [])[j] !== x) return;
      const list = (this.bk.f.monthCharges[m] || []).filter((_, i) => i !== j), next = { ...this.bk.f.monthCharges };
      if (list.length) next[m] = list; else delete next[m];
      this.bk.f.monthCharges = next;
    },
    amt, dmy, shortName,
    // ---- utility bills (23 Nov 2026) ----
    datesText, statusPill, kindLabel,
    lodgedLine(x) {
      const d = t => (t?.toDate ? t.toDate().toLocaleDateString('en-GB') : '');
      return [d(x.lodgedAt || x.createdAt) ? `Lodged ${d(x.lodgedAt || x.createdAt)}` : '', d(x.emailedAt) ? `emailed ${d(x.emailedAt)}` : ''].filter(Boolean).join(' · ');
    },
    // The payments that pay this bill, with the amount for it
    // 23 Nov 2026 (Khairul): a bill counts as paid only by Checked payments. The bill's saved paid amount includes every
    // linked payment, so Checked = saved paid minus the Pending / Unknown ones (older unlinked money counts as Checked). When the payments can't be read, the bill's saved paid amount is used.
    billState(x) {
      if (!this.bk.payments) return { checked: Math.min(x.paid, x.total), pending: 0 };
      const pays = this.billPays(x);
      const pending = pays.filter(p => p.status !== 'Checked').reduce((a, p) => a + p.amount, 0);
      const checked = Math.max(0, Math.min(x.total, x.paid) - pending);
      return { checked: Math.round(checked * 100) / 100, pending: Math.round(Math.min(pending, x.total) * 100) / 100 };
    },
    billPill(x) {
      const s = this.billState(x), left = Math.round((x.total - s.checked - s.pending) * 100) / 100;
      if (s.pending > 0.004) return { cls: 'blue', text: left > 0.004 ? `Pending check · RM ${this.amt(left)} left` : 'Pending check' };
      if (s.checked > 0 && s.checked >= x.total - 0.005) return { cls: 'green', text: 'Paid' };
      if (s.checked > 0.004) return { cls: 'amber', text: `Partly paid · RM ${this.amt(x.total - s.checked)} left` };
      return { cls: 'red', text: 'Unpaid' };
    },
    billPays(x) { return (this.bk.payments || []).map(p => ({ ...p, amount: partsOf(p).bills[x.id] })).filter(p => p.amount > 0); },
    payParts(p) {
      if (!Array.isArray(p.parts) || !p.parts.length) return '';
      const pp = partsOf(p), names = Object.entries(pp.bills).map(([id, a]) => { const b = (this.bk.bills || []).find(y => y.id === id); return `${b ? datesText(b) : 'bill'} RM ${amt(a)}`; });
      // 24 Nov 2026: every line (Rental per month, Charges with what for)
      const rentals = p.parts.filter(x => x.type === 'rental' && Number(x.amount) > 0).map(x => `Rental${x.forMonth ? ' ' + monthName(x.forMonth) : ''} RM ${amt(x.amount)}`);
      const charges = p.parts.filter(x => x.type === 'charges' && Number(x.amount) > 0).map(x => `Charges RM ${amt(x.amount)}${x.note ? ' (' + x.note + ')' : ''} (not rent)`);
      return [...rentals, pp.utilities > 0 ? `Utilities RM ${amt(pp.utilities)}${names.length ? ' (' + names.join(', ') + ')' : ''}` : '', ...charges].filter(Boolean).join(' · ');
    },
    openBill(x) { this.billOpen = this.billOpen === x.id ? '' : x.id; this.billEd = null; this.billErr = ''; },
    startBillEdit(x) {
      this.billErr = '';
      this.billEd = { reason: '', lines: KINDS.map(k => { const l = x.lines.find(y => y.kind === k.key); return { kind: k.key, from: l?.from || this.bk.f.arrival || '', to: l?.to || this.bk.f.departure || '', amount: l ? l.amount.toFixed(2) : '' }; }) };
    },
    async saveBill(x) {
      const e = this.billEd; this.billErr = linesProblem(e.lines) || (!e.reason.trim() ? 'Add a reason for the change.' : '');
      if (this.billErr) return;
      this.billBusy = true;
      try { Object.assign(x, await saveBillEdit(me, x, e.lines, e.reason.trim())); this.billEd = null; toast('Bill saved'); }
      catch (err) { this.billErr = err.code === 'permission-denied' ? 'Firestore refused this (rules Draft 1.03 needed, or you cannot edit bills).' : friendlyError(err, 'save the bill'); }
      this.billBusy = false;
    },
    async removeBill(x) {
      if (x.paymentIds.length) { this.billErr = 'Payments are linked to this bill. Unlink them first.'; return; }
      if (!await askConfirm({ title: 'Delete this utility bill?', message: `${datesText(x)}, RM ${amt(x.total)} is removed from the booking. The photos stay in Google Drive. The audit log keeps a line.`, confirmText: 'Delete bill', danger: true })) return;
      this.billBusy = true; this.billErr = '';
      try { await deleteBill(me, x, 'Deleted on the booking'); this.bk.bills = this.bk.bills.filter(y => y.id !== x.id); this.billOpen = ''; toast('Bill deleted'); }
      catch (err) { this.billErr = err.code === 'permission-denied' ? 'Firestore refused this (rules Draft 1.03 needed).' : friendlyError(err, 'delete the bill'); }
      this.billBusy = false;
    },
    // A bill's Drive folder link is kept on the bill (for the email) once photos are added here
    async keepFolder(x, link) {
      if (!link || x.driveFolder === link) return;
      try { await updateDoc(doc(db, 'utilityBills', x.id), { driveFolder: link }); x.driveFolder = link; } catch (e) { console.warn('Could not keep the folder link', e.code || e.message); }
    },
    async emailBill(x) {
      const f = this.bk.f; if (!f.email) return;
      window.open(billMailLink(x, this.bk, { name: f.name, email: f.email }), '_blank');
      try { await noteEmailed(me, x); x.emailedAt = { toDate: () => new Date() }; x.emailedByName = me.name || ''; } catch (e) { console.warn('Could not note the email on the bill', e.code || e.message); }
    },
    // The invoice for an Awaiting payment booking: guest from the tenant record, unit type from the unit (16 Nov 2026)
    async openInvoice() {
      const b = this.bk, f = b.f;
      this.invBusy = true;
      let unitType = '';
      try { const u = b.unitId ? await getDoc(doc(db, 'units', b.unitId)) : null; unitType = u?.exists() ? u.data().info?.type || '' : ''; } catch { /* left out */ }
      let propertyAddress = '';   // 20 Nov 2026: the invoice is headed with the property's name and address
      try { const p = b.propertyId ? await getDoc(doc(db, 'properties', b.propertyId)) : null; propertyAddress = p?.exists() ? propertyAddressOf(p.data()) : ''; } catch { /* left out */ }
      // 23 Nov 2026: the invoice follows Booking settings > Other fees (the copy read this visit, up to 10 minutes; saving the settings clears it on that browser)
      const fees = await feesForForms();
      this.invoice = invoiceOf({ ...b, arrival: f.arrival, departure: f.departure, extraNight: !!f.extraNight, monthlyRent: f.rent || b.monthlyRent, feesInPayments: true, monthCharges: cleanCharges(f.monthCharges) },
        { name: f.name, email: f.email, phone: f.phone }, { propertyName: b.propertyName, unitCode: b.unitCode || b.unitId, unitType, propertyAddress, fees });
      this.invBusy = false;
    },
    nextDay(d) { return shiftDay(d, 1); },
    prevDay(d) { return shiftDay(d, -1); },
    startTerm() {
      this.term = { date: '', type: '', noticeDate: '', reason: '', files: [], upBusy: false, progress: 0 };
      this.terminating = true; this.cancelling = false;
      this.$nextTick(() => { const el = document.getElementById('etDate'); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus({ preventScroll: true }); } });
    },
    async uploadNotice(files) {
      const b = this.bk;
      this.term.upBusy = true; this.term.progress = 0;
      try {
        const up = await uploadForLink('terminations', files, p => { this.term.progress = p; }, b.id, `${b.bookingNo || b.id} notice`);
        return up.map(x => ({ name: x.name, id: x.id, url: x.url }));
      } finally { this.term.upBusy = false; }
    },
    async terminate() {
      const b = this.bk, t = this.term; b.error = '';
      if (this.termProblem) return;
      b.busy = true;
      try {
        const files = t.files.length ? await this.uploadNotice(t.files) : [];
        const fields = await terminateBooking(me, b, { date: t.date, type: t.type, noticeDate: t.noticeDate, reason: t.reason.trim(), files });
        toast('Booking terminated early');
        this.$emit('saved', fields);
      } catch (e) { b.error = friendlyError(e, 'terminate the booking'); }
      b.busy = false;
    },
    async addNotice(ev) {
      const files = [...(ev.target.files || [])].filter(x => x.type.startsWith('image/')); ev.target.value = '';
      if (!files.length) return;
      const b = this.bk; b.error = ''; b.busy = true;
      try {
        const up = await this.uploadNotice(files);
        await this.patchTerm({ files: [...(this.et.files || []), ...up] }, 'Notice image added');
        toast('Notice added');
      } catch (e) { b.error = friendlyError(e, 'add the notice'); }
      b.busy = false;
    },
    pickNotice(ev) { const add = [...(ev.target.files || [])].filter(x => x.type.startsWith('image/')); ev.target.value = ''; this.term.files = [...this.term.files, ...add]; },
    startRefund() { const e = this.et; this.refund = { open: true, charges: e.refundCharges ? String(e.refundCharges) : '', note: e.refundNote || '' }; },
    async saveRefund() {
      const b = this.bk, c = Math.round((Number(this.refund.charges) || 0) * 100) / 100; b.error = ''; b.busy = true;
      try {
        await this.patchTerm({ refundCharges: c, refundNote: this.refund.note.trim() }, `Deposit refund: RM ${amt(Math.max(0, this.deposit - c))}`);
        this.refund.open = false; toast('Refund saved');
      } catch (e) { b.error = friendlyError(e, 'save the refund'); }
      b.busy = false;
    },
    // Changes the termination and keeps the popup open (the list row is updated too)
    async patchTerm(patch, reason) {
      const fields = await updateTermination(me, this.bk, patch, reason);
      this.bk.earlyTermination = fields.earlyTermination;
      this.$emit('patched', fields);
    },
    async undoTerm() {
      const b = this.bk, e = this.et; b.error = '';
      if (!await askConfirm({ title: 'Restore the original check-out?', message: `The check-out goes back to ${dmy(e.originalDeparture)} and the early termination is removed. The notice images stay in Drive. The audit log keeps a line.`, confirmText: 'Restore check-out' })) return;
      b.busy = true;
      try {
        const fields = await undoTermination(me, b, `Early termination undone (was ${e.date})`);
        toast('Original check-out restored');
        this.$emit('saved', fields);
      } catch (x) { b.error = friendlyError(x, 'undo the termination'); }
      b.busy = false;
    },
    viewNotice(x) { this.$refs.viewer.open({ name: x.name, url: x.url, id: x.id, kind: 'terminations', recordId: this.bk.id }); },
    startCancel() {
      this.cancelling = true; this.terminating = false;
      this.$nextTick(() => { const el = document.getElementById('bkCancelWhy'); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus({ preventScroll: true }); } });
    },
    async cancelBooking() {
      const b = this.bk, why = this.cancelReason.trim(); b.error = '';
      if (!why) return;
      b.busy = true;
      try {
        await setBookingCancelled(me, b, true, why);
        toast('Booking cancelled');
        this.$emit('saved', { status: 'cancelled', cancelledReason: why });
      } catch (e) { b.error = friendlyError(e, 'cancel the booking'); }
      b.busy = false;
    },
    async restore() {
      const b = this.bk; b.error = '';
      b.busy = true;
      try {
        await setBookingCancelled(me, b, false, 'Restored on Portfolio › Bookings');
        toast('Booking restored');
        this.$emit('saved', { status: null, cancelledReason: null });
      } catch (e) { b.error = friendlyError(e, 'restore the booking'); }
      b.busy = false;
    },
    async remove() {
      const b = this.bk; b.error = '';
      if (this.deleteBlock || b.busy) return;
      if (!await askConfirm({ title: `Delete booking ${b.bookingNo || b.id} for good?`, message: 'The booking, its guest details and passcodes, and its utility bills are removed from the PMS for good. This cannot be undone. The audit log keeps the booking no., unit and dates.', confirmText: 'Delete booking', danger: true })) return;
      b.busy = true;
      try {
        await deleteOfflineBooking(me, b, b.cancelledReason ? `Cancelled: ${b.cancelledReason}` : 'Deleted on Portfolio › Bookings');
        toast('Booking deleted');
        this.$emit('deleted');
      } catch (e) { b.error = friendlyError(e, 'delete the booking'); b.busy = false; }
    },
    async save() {
      const b = this.bk, f = b.f, o = b.orig || {};
      b.error = '';
      const bad = (msg, id) => { b.error = msg; if (['bkIn', 'bkOut', 'bkEmail'].includes(id)) this.tab = 'details'; this.$nextTick(() => { const el = document.getElementById(id); if (!el) return; el.scrollIntoView({ block: 'center', behavior: 'smooth' }); setTimeout(() => el.focus({ preventScroll: true }), 350); }); };
      if (!f.arrival || !f.departure || f.departure < f.arrival) return bad('Check-out can\'t be before check-in.', f.arrival ? 'bkOut' : 'bkIn');
      if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) return bad('The email doesn\'t look right.', 'bkEmail');
      if (!b.reason.trim()) return bad('Add a reason for the change.', 'bkReason');
      const nights = Math.max(1, Math.round((new Date(f.departure) - new Date(f.arrival)) / 86400000)), longTerm = nights >= 30;
      const c = x => Math.round((Number(x) || 0) * 100) / 100;
      const main = { arrival: f.arrival, departure: f.departure, nights, longTerm, extraNight: longTerm && !!f.extraNight, monthlyRent: longTerm ? c(f.rent) : 0,
        bookingSource: String(f.bookingSource || '').trim(), rentalStatus: f.rentalStatus.trim(), ezeeReservationNo: f.ezeeReservationNo.trim(), remark: f.remark.trim(),
        monthCharges: cleanCharges(f.monthCharges) };
      // monthCharges is compared as text; the audit log keeps a short summary ("2026-03: Cleaning fees 80.00")
      const sum = mc => Object.entries(mc || {}).map(([m, l]) => `${m}: ${l.map(x => `${chargeLabel(x)} ${(+x.amount).toFixed(2)}`).join(', ')}`).join('; ');
      // An older booking's deposit and fee fields count as month charges (allMonthCharges), so moving them is not a change on its own
      const same = k => (k === 'extraNight' ? !!b[k] === main[k] : k === 'monthCharges' ? JSON.stringify(cleanCharges(allMonthCharges(b))) === JSON.stringify(main[k]) : (b[k] ?? '') === main[k]);
      const changes = Object.keys(main).filter(k => !same(k)).map(k => (k === 'monthCharges' ? { field: k, old: sum(cleanCharges(allMonthCharges(b))), new: sum(main[k]) } : { field: k, old: b[k] ?? '', new: main[k] }));
      const pchanged = b.hasPrivate ? PRIV.filter(k => (o[k] ?? '') !== (f[k] ?? '') && (b.tenantId ? !GUEST.includes(k) : true)) : [];
      const gchanged = b.tenantId && b.guestOk ? GUEST.filter(k => (o[k] ?? '') !== (f[k] ?? '')) : [];
      if (!changes.length && !pchanged.length && !gchanged.length) { this.$emit('close'); return; }
      // monthCharges is always written, so an older booking is marked feesInPayments on any save (its old fields then stop counting)
      if (legacyCharges(b).length) { main.feesInPayments = true; changes.push({ field: 'feesInPayments', old: false, new: true }); }
      b.busy = true;
      try {
        await saveOfflineBooking(me, b, main, changes,
          pchanged.length ? Object.fromEntries(pchanged.map(k => [k, (f[k] ?? '').trim?.() ?? f[k]])) : null,
          gchanged.length ? Object.fromEntries(gchanged.map(k => [k, String(f[k] ?? '').trim()])) : null);
        toast('Changes saved');
        this.$emit('saved', main);
      } catch (e) { b.error = friendlyError(e, 'save the booking'); }
      b.busy = false;
    }
  }
};
</script>

<style scoped>
/* 25 Nov 2026 (Khairul): the booking popup keeps one height on every tab (the body scrolls) so it doesn't jump about */
@media (min-width: 861px) { .drawer.bk-fixed { height: 90vh; height: 90dvh; } }
.xn-tgl { grid-column: 1 / -1; display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; border: 1px solid var(--border); border-radius: var(--radius, 8px); background: var(--head); cursor: pointer; }
.xn-tgl b { display: block; font-size: 14px; color: var(--text); }
.xn-tgl small { display: block; font-size: 12px; color: var(--muted); margin-top: 2px; }
.tgl { position: relative; flex: none; width: 42px; height: 24px; margin-top: 1px; }
.tgl input { position: absolute; inset: 0; margin: 0; opacity: 0; cursor: pointer; z-index: 1; }
.tgl-track { position: absolute; inset: 0; border-radius: 999px; background: var(--border); transition: background .2s ease; }
.tgl-track::after { content: ""; position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0, 0, 0, .2); transition: transform .2s ease; }
.tgl input:checked + .tgl-track { background: var(--accent); }
.tgl input:checked + .tgl-track::after { transform: translateX(18px); }
.tgl input:focus-visible + .tgl-track { outline: 2px solid var(--accent); outline-offset: 2px; }
.bk-created-h { display: block; margin-top: 2px; font-size: 12px; font-weight: 400; }
.tp-carry span:first-child, .tp-carry b { color: var(--muted); font-style: italic; font-weight: 500; }
.fld-pick { display: block; width: 100%; }
.fld-pick :deep(.op-btn) { width: 100%; min-height: 40px; }
.foot-left { margin-right: auto; display: flex; gap: 8px; flex-wrap: wrap; }
.et-note { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; flex-wrap: wrap; border-left: 3px solid #d08a00; }
.et-text { display: grid; gap: 2px; flex: 1 1 320px; }
.et-note .et-refund { flex-basis: 100%; }
.et-pick { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.et-pick label.btn { cursor: pointer; }
.et-pick label.btn.disabled { opacity: .5; pointer-events: none; }
.et-chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 4px 2px 10px; border: 1px solid var(--border); border-radius: 999px; background: var(--surface, #fff); font-size: 12px; color: var(--text); }
.et-chip button { border: 0; background: none; color: var(--muted); font-size: 15px; line-height: 1; cursor: pointer; padding: 0 4px; }
.et-chip button:hover { color: var(--danger); }
.et-files { display: flex; gap: 8px; flex-wrap: wrap; align-items: baseline; }
.et-link { background: none; border: 0; padding: 0; color: var(--accent); font: inherit; text-decoration: underline; cursor: pointer; }
.et-acts { display: flex; gap: 6px; flex-wrap: wrap; }
.et-acts label.btn { cursor: pointer; }
.et-acts label.btn.disabled { opacity: .5; pointer-events: none; }
.et-refund { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border); }
.et-box { margin-top: 14px; }
.et-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0 12px; }
.ub-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.ub-head .btn { text-transform: none; letter-spacing: 0; }
.ub-list { border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
.ub-item { border-top: 1px solid var(--border); padding: 8px 12px; }
.ub-item:first-child { border-top: 0; }
.ub-item.open { background: var(--bg, #f6f7f9); }
.ub-row { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 10px; align-items: center; }
.ub-main { display: grid; gap: 1px; }
.ub-main small { color: var(--muted); font-size: 12px; }
.ub-amt { white-space: nowrap; }
.ub-row .pill { white-space: nowrap; }
.ub-acts, .ub-edit-acts { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
.ub-view { margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--border); }
.ub-line { display: grid; grid-template-columns: 90px 1fr 1fr 110px; gap: 6px; align-items: center; margin-bottom: 6px; font-size: 13px; }
.ub-foot { display: flex; gap: 18px; flex-wrap: wrap; justify-content: flex-end; padding: 8px 12px; font-size: 14px; color: var(--text-2); }
.ub-foot b { color: var(--text); }
.pay-part { font-size: 12px; color: var(--muted); padding: 0 0 6px 12px; }
/* 24 Nov 2026: Charges list on the Payments tab */
.cg-row { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 12px; align-items: center; padding: 8px 14px; border-top: 1px solid var(--border); }
.cg-row:first-child { border-top: 0; }
.cg-main { display: grid; gap: 1px; }
.cg-main small { color: var(--muted); font-size: 12px; white-space: pre-line; }
@media (max-width: 640px) { .ub-line { grid-template-columns: 1fr 1fr; } }
.bk-where { font-size: 14px; font-weight: 400; margin: 0; }   /* 20 Nov 2026: property, unit and source beside the booking no. */
.bk-tabs { margin: -6px 0 18px; overflow: visible; }   /* 20 Nov 2026 (Khairul): no sticking or scrolling; the tabs stay in place */
.bk-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 16px; }
.bk-grid > .form-sec, .bk-grid > .help, .bk-grid > .field:has(textarea) { grid-column: 1 / -1; }
@media (max-width: 640px) { .bk-grid { grid-template-columns: 1fr; } }
.bk-tabs button { padding: 10px 14px; }   /* 20 Nov 2026: tighter than the page tabs */
.bk-grid .form-sec:first-child { margin-top: 0; }
.bk-reason { margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--border); }
.tp-filter { display: flex; gap: 6px; flex-wrap: wrap; margin: 4px 0 10px; }
.tp-filter button { border: 1px solid var(--border); background: var(--surface, #fff); border-radius: 999px; padding: 4px 10px; font: inherit; font-size: 13px; color: var(--text-2, var(--muted)); cursor: pointer; }
.tp-filter button b { margin-left: 4px; color: var(--text); }
.tp-filter button.on { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); }
.tp-filter button.on b { color: var(--accent); }
.tp-list { border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
.tp-year { width: 100%; border: 0; text-align: left; font: inherit; cursor: pointer; align-items: center; display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; padding: 6px 12px 6px 12px; font-size: 12px; color: var(--muted); background: var(--bg, #f6f7f9); border-top: 1px solid var(--border); }
.tp-year b { color: var(--text); font-weight: 700; }
.tp-year:hover { background: var(--accent-soft); }
.tp-caret { display: inline-block; width: 14px; color: var(--muted); }
.tp-charge b { white-space: nowrap; }
.tp-year .tp-amt { padding-right: 42px; color: var(--text); font-weight: 600; }
.tp-year:first-child { border-top: 0; }
.tp-row { display: grid; grid-template-columns: minmax(80px, 1fr) 110px minmax(150px, auto) 32px; gap: 10px; align-items: center; padding: 7px 12px; border-top: 1px solid var(--border); }
.tp-year + .tp-row { border-top: 0; }
.tp-row.open { background: var(--accent-soft); }
.tp-m { font-weight: 500; }
.tp-m small { display: block; font-size: 12px; font-weight: 400; color: var(--muted); }   /* 24 Nov 2026: the lease month's dates */
.cal-fold { width: 100%; background: none; border-left: 0; border-right: 0; border-top: 0; font: inherit; color: inherit; text-align: left; cursor: pointer; }
.cal-fold:hover { background: var(--accent-soft); }
.cal-row.cal-zero { color: var(--muted); }   /* 24 Nov 2026: a fee type not charged on this booking (RM 0.00) */
.cal-row.cal-zero b { font-weight: 400; color: var(--muted); }
.tp-amt { text-align: right; white-space: nowrap; }
.tp-amt small { color: var(--muted); }
.tp-plus { width: 28px; height: 28px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface, #fff); color: var(--accent); font-size: 18px; line-height: 1; cursor: pointer; }
.tp-plus:hover { border-color: var(--accent); }
.tp-charge { display: grid; grid-template-columns: 1fr auto 32px; gap: 10px; align-items: center; padding: 3px 12px 5px 28px; font-size: 13px; color: var(--text-2, var(--muted)); }
.tp-charge b { font-weight: 500; color: var(--text); }
.tp-none { margin: 0; padding: 10px 12px; color: var(--muted); font-size: 13px; }
.mc-form { padding: 8px 12px 10px 28px; background: var(--accent-soft); }
@media (max-width: 640px) { .tp-row { grid-template-columns: 1fr auto auto 28px; gap: 6px; } }
.mc-x { border: 0; background: none; color: var(--muted); font-size: 16px; line-height: 1; cursor: pointer; padding: 0 2px; margin-left: 6px; }
.mc-x:hover { color: var(--danger, #c0392b); }
.mc-form { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.mc-form select { width: auto; min-width: 200px; }
.mc-form .input { flex: 1 1 140px; }
.mc-amt { max-width: 140px; }
.await-note { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; border-left: 3px solid #d08a00; }
.await-acts { display: flex; gap: 8px; flex-wrap: wrap; }
</style>
