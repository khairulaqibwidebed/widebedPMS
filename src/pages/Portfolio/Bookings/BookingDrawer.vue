<template>
  <div>
    <div class="drawer-back" @click="$emit('close')"></div>
    <aside class="drawer wide" role="dialog" aria-label="Booking" v-esc="() => $emit('close')">
      <div class="drawer-head"><h2>{{ `Booking ${bk.bookingNo || bk.id}` }}<span class="help bk-where">{{ ` · ${bk.propertyName || ''} · ${bk.unitCode || bk.unitId || ''} · ${bk.source === 'import' ? 'Imported from Willow' : bk.source === 'direct' ? 'Direct booking' : 'From Tenant leads'}` }}</span></h2><button class="icon-btn" @click="$emit('close')" aria-label="Close">×</button></div>
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
        <!-- 20 Nov 2026 (Khairul): the deposit is a charge on the Payments tab now (Security deposit on a month) -->
        <div class="field"><label>Booking source</label><input class="input" v-model="bk.f.bookingSource" :disabled="!editable"></div>
        <!-- 20 Nov 2026: the agent picked on the booking form (booking source Agent), for their commission -->
        <div class="field" v-if="bk.agentName"><label>Agent</label><input class="input" :value="[bk.agentName, bk.agentCompany].filter(Boolean).join(' · ')" disabled></div>
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
          <div class="pay-row" v-for="x in bk.payments" :key="x.id"><span>{{ `${dmy(x.date)}${x.forMonth ? ' · for ' + monthName(x.forMonth) : ''}${x.mode ? ' · ' + x.mode : ''}${x.bankRef ? ' · ' + x.bankRef : ''}` }}</span><b>{{ `RM ${amt(x.amount)}` }}</b><span class="tag">{{ x.status }}</span></div>
          <p class="help" v-if="bk.payments.length > 1">{{ `Total Checked RM ${amt(totalPaid)}` }}</p>
        </template>
        <p class="help" v-else>Payments are visible to Accounting, Directors and Operations.</p>
        <template v-if="bk.payments && cal.length">
          <div class="form-sec">Rent summary</div>
          <div class="cal-row" v-if="isLong"><span>Monthly rent</span><b>{{ `RM ${amt(Number(bk.f.rent) || Number(bk.monthlyRent) || 0)}` }}</b></div>
          <div class="cal-row"><span>{{ isLong ? `Total rental (${cal.length} ${cal.length === 1 ? 'month' : 'months'}) · owner receives` : 'Total rental' }}</span><b>{{ `RM ${amt(totalDue)}` }}</b></div>
          <div class="cal-row cal-sub" v-for="c in chargeSums" :key="c.label"><span>{{ c.label }}</span><b>{{ `RM ${amt(c.v)}` }}</b></div>
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
            <template v-for="(c, i) in calShown" :key="c.m">
              <!-- 20 Nov 2026: click a year line to fold its months away -->
              <button type="button" class="tp-year" v-if="i === 0 || c.m.slice(0, 4) !== calShown[i - 1].m.slice(0, 4)"
                :aria-expanded="String(!yearShut(c.m.slice(0, 4)))" @click="toggleYear(c.m.slice(0, 4))">
                <span><span class="tp-caret" aria-hidden="true">{{ yearShut(c.m.slice(0, 4)) ? '▸' : '▾' }}</span><b>{{ c.m.slice(0, 4) }}</b>{{ ` · ${yearSum(c.m.slice(0, 4)).text}` }}</span>
                <span class="tp-amt">{{ `RM ${amt(yearSum(c.m.slice(0, 4)).paid)}` }}<small>{{ ` / ${amt(yearSum(c.m.slice(0, 4)).due)}` }}</small></span>
              </button>
              <template v-if="!yearShut(c.m.slice(0, 4))">
              <div class="tp-row" :class="{ open: add.m === c.m }">
                <span class="tp-m">{{ shortName(c.m) }}</span>
                <span><span class="pill" :class="MONTH_PAY[c.status].cls">{{ MONTH_PAY[c.status].label }}</span></span>
                <span class="tp-amt"><b>{{ `RM ${amt(c.paid)}` }}</b><small v-if="c.due + c.extra > 0">{{ ` / ${amt(c.due + c.extra)}` }}</small></span>
                <button v-if="editable" type="button" class="tp-plus" @click="add.m === c.m ? (add.m = '') : startAdd(c.m)" :title="`Add a charge to ${shortName(c.m)}`" :aria-label="`Add a charge to ${shortName(c.m)}`">+</button>
              </div>
              <div class="tp-charge" v-for="(x, j) in bk.f.monthCharges[c.m] || []" :key="c.m + '-' + j">
                <span>{{ chargeLabel(x) }}</span>
                <b>{{ `RM ${amt(x.amount)}` }}</b>
                <button v-if="editable" type="button" class="mc-x" @click="removeCharge(c.m, j)" :aria-label="`Remove ${chargeLabel(x)} from ${shortName(c.m)}`">×</button>
              </div>
              <div class="mc-form" v-if="editable && add.m === c.m">
                <select class="input" :id="'mcKey' + c.m" v-model="add.key" :aria-label="`Charge for ${shortName(c.m)}`">
                  <option value="" disabled>Choose charge…</option>
                  <option v-for="[k, l] in FEE_LABELS" :key="k" :value="k">{{ l }}</option>
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
          <p class="help">{{ isLong ? `${leaseLabel(nightsNow)}: each month is rent against the Checked payments for that month.` : 'Short term: the rental is due in the check-in month; Checked payments count in the month they are for.' }}</p>
        </template>
        </div>
        <div v-show="tab === 'invoice'">
        <!-- 20 Nov 2026: the invoice for any booking (was Awaiting payment only): the full invoice or one month's page -->
        <template v-if="!pending">
          <div class="form-sec" style="margin-top:0">Invoice</div>
          <p class="help">{{ isLong ? 'Download the full invoice (summary and every month) or one month on its own. Month charges show on their month.' : 'Download the invoice for this booking.' }}</p>
          <button type="button" class="btn" @click="openInvoice()" :disabled="!bk.loaded || invBusy">{{ invBusy ? 'Loading…' : 'Download invoice' }}</button>
        </template>
        <div class="form-sec">Utility bill</div>
        <p class="help" v-if="!bk.bill">No utility bill saved yet. Add it on Portfolio > Utility Lodgment Form.</p>
        <template v-else>
          <!-- Each bill has its own period since 13 Nov 2026; older bills fall back to the one shared period -->
          <div class="cal-row" v-for="u in billRows(bk.bill)" :key="u.label"><span>{{ `${u.label} · ${u.period}` }}</span><b>{{ `RM ${amt(u.v)}` }}</b></div>
          <div class="cal-row"><span><b>Total utility</b></span><b>{{ `RM ${amt(bk.bill.total)}` }}</b></div>
        </template>
        </div>
        <div class="field bk-reason" v-if="editable"><label>Reason for the change (audit log)</label><input class="input" id="bkReason" v-model="bk.reason" placeholder="e.g. Guest extended by two nights"></div>
        <div class="confirm-box" v-if="cancelling">
          <div class="field" style="margin-bottom:10px"><label for="bkCancelWhy" class="req">Why cancel this booking?</label><input class="input" id="bkCancelWhy" v-model="cancelReason" placeholder="e.g. Guest cancelled, booked by mistake"></div>
          <button type="button" class="btn btn-primary" @click="cancelBooking()" :disabled="bk.busy || !cancelReason.trim()">Cancel booking</button> <button type="button" class="btn" @click="cancelling = false">Keep booking</button>
        </div>
        <p class="help" v-if="cancelled && acc.bkEdit && deleteBlock">{{ deleteBlock }}</p>
        <p class="help" v-if="bk.error" style="color:var(--red)">{{ bk.error }}</p>
      </form>
      <div class="drawer-foot">
        <template v-if="acc.bkEdit && !cancelled">
          <button class="btn" style="margin-right:auto" v-show="!cancelling" @click="startCancel()" :disabled="bk.busy">Cancel booking</button>
        </template>
        <template v-if="acc.bkEdit && cancelled">
          <button class="icon-btn trash" style="margin-right:auto" @click="remove()" :disabled="bk.busy || !!deleteBlock || !bk.loaded" :title="deleteBlock || 'Delete this booking for good'" aria-label="Delete booking for good">🗑</button>
          <button class="btn btn-primary" @click="restore()" :disabled="bk.busy">Restore booking</button>
        </template>
        <button class="btn" @click="$emit('close')">Close</button>
        <button class="btn btn-primary" type="submit" form="bkForm" v-if="editable" :disabled="bk.busy">{{ bk.busy ? 'Saving…' : 'Save booking' }}</button>
      </div>
    </aside>
    <InvoiceDialog v-if="invoice" :invoice="invoice" :booking-no="bk.bookingNo || ''" @close="invoice = null" />
  </div>
</template>

<script>
import { leaseLabel } from '@/lib/lease-term.js';
import { payCounts, payMonth } from '@/lib/booking-pay.js';
// Booking drawer (Portfolio › Bookings): an offline booking's details, rent summary and payments; Accounting,
// Directors and Operations can edit it. Tells the page "saved" with the changed fields so it can update its list.
import { amt, dmy, monthName } from '@/lib/format.js';
import { friendlyError } from '@/lib/finance-data.js';
import { useSession } from '@/stores/session.js';
import { toast } from '@/lib/toast.js';
import { askConfirm } from '@/lib/confirm.js';
import { MONTH_PAY, shortName, loadBookingDetails, saveOfflineBooking, setBookingCancelled, deleteOfflineBooking } from '@/lib/portfolio-data.js';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase.js';
import { can } from '@/lib/access.js';
import { invoiceOf, propertyAddressOf, FEE_LABELS, chargeLabel, legacyCharges, allMonthCharges, addInto } from '@/lib/booking-invoice.js';
import InvoiceDialog from '@/components/InvoiceDialog.vue';

const me = useSession();
const PRIV = ['name', 'phone', 'email', 'icPassport', 'mainDoorPasscode', 'currentExpiryDate', 'nextDoorPasscode', 'nextExpiryDate'];
const GUEST = ['name', 'phone', 'email', 'icPassport'];
// Month charges as saved: months in order, empty months and zero amounts left out
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
  components: { InvoiceDialog },
  emits: ['close', 'saved', 'deleted'],
  data() {
    const r = this.booking, rm = c => (c ? Number(c).toFixed(2) : '');
    const f = { name: '', phone: '', email: '', icPassport: '', mainDoorPasscode: '', currentExpiryDate: '', nextDoorPasscode: '', nextExpiryDate: '',
      arrival: r.arrival || '', departure: r.departure || '', rent: rm(r.longTerm ? r.monthlyRent : ''),
      bookingSource: r.bookingSource || '', rentalStatus: r.rentalStatus || '', ezeeReservationNo: r.ezeeReservationNo || '', remark: r.remark || '',
      monthCharges: cleanCharges(allMonthCharges(r)) };
    return { MONTH_PAY, FEE_LABELS, tab: 'details', mpFilter: 'all', yearsShut: {}, add: { m: '', key: '', amount: '', note: '' }, canForms: can(me, 'bookingForms.view'), invoice: null, invBusy: false, cancelling: false, cancelReason: '', bk: { ...r, f, hasPrivate: false, bill: null, reason: '', error: '', busy: false, loaded: false } };
  },
  computed: {
    // Guest details on a tenant record can only be changed by Accounting and Directors; on an imported booking Operations can too
    cancelled() { return this.bk.status === 'cancelled'; },
    pending() { return this.bk.status === 'pending'; },
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
      const out = []; let [y, mo] = f.arrival.slice(0, 7).split('-').map(Number); const last = f.departure.slice(0, 7);
      for (let i = 0; i < 48; i++, mo++) {
        if (mo > 12) { mo = 1; y++; }
        const m = `${y}-${String(mo).padStart(2, '0')}`; if (m > last) break;
        const paid = b.payments.filter(x => payCounts(x) && (long ? payMonth(x) === m : i === 0)).reduce((s, x) => s + (Number(x.amount) || 0), 0);   // Checked only (19 Nov 2026)
        const due = long ? rent : (i === 0 ? rental : 0);
        const extra = (f.monthCharges[m] || []).reduce((s, x) => s + (Number(x.amount) || 0), 0), all = due + extra;   // 20 Nov 2026: month charges
        out.push({ m, paid, due, extra, status: all > 0 ? (paid >= all - 0.005 ? 'paid' : paid > 0 ? 'part' : 'unpaid') : (paid > 0 ? 'paid' : 'unpaid') });
      }
      return out;
    },
    // Deposit, fees and other month charges on top of the rental, added up by charge: paid by the guest, never part of the owner's share
    chargeSums() {
      const t = {};
      Object.values(this.bk.f.monthCharges).flat().forEach(x => { const l = chargeLabel(x); t[l] = (t[l] || 0) + (Number(x.amount) || 0); });
      return Object.entries(t).map(([label, v]) => ({ label, v })).filter(c => c.v > 0);
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
    totalPaid() { return (this.bk.payments || []).filter(payCounts).reduce((a, x) => a + (Number(x.amount) || 0), 0); }
  },
  async created() {
    try {
      const d = await loadBookingDetails(this.booking);
      this.bk.payments = d.payments;
      if (d.hasPrivate) { this.bk.hasPrivate = true; Object.assign(this.bk.f, d.privateData); }
      if (d.guest) Object.assign(this.bk.f, d.guest);
      this.bk.guestOk = d.guestOk;
      this.bk.orig = { ...this.bk.f };
      this.bk.bill = d.bill;
      this.bk.loaded = true;
    } catch (e) { this.bk.error = friendlyError(e, 'load the booking'); }
  },
  methods: {
    leaseLabel, monthName, chargeLabel,
    // The year line: months, how many paid / part / unpaid, and paid against due for that year (all months, not only the filtered ones)
    yearSum(y) {
      const ms = this.cal.filter(c => c.m.startsWith(y)), n = k => ms.filter(c => c.status === k).length;
      const parts = [['paid', 'paid'], ['part', 'part paid'], ['unpaid', 'unpaid']].map(([k, l]) => (n(k) ? `${n(k)} ${l}` : '')).filter(Boolean);
      return { text: `${ms.length} month${ms.length === 1 ? '' : 's'} · ${parts.join(', ')}`, paid: ms.reduce((a, c) => a + c.paid, 0), due: ms.reduce((a, c) => a + c.due + c.extra, 0) };
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
      const label = FEE_LABELS.find(([k]) => k === a.key)?.[1] || a.key;
      // 20 Nov 2026 (Khairul): a charge already on the month is topped up, not added as a second line
      const list = addInto(this.bk.f.monthCharges[a.m], { key: a.key, label, amount: v, ...(a.key === 'othersFee' && a.note.trim() ? { note: a.note.trim() } : {}) });
      this.bk.f.monthCharges = { ...this.bk.f.monthCharges, [a.m]: list };
      this.add = { m: '', key: '', amount: '', note: '' };
    },
    removeCharge(m, j) {
      const list = (this.bk.f.monthCharges[m] || []).filter((_, i) => i !== j), next = { ...this.bk.f.monthCharges };
      if (list.length) next[m] = list; else delete next[m];
      this.bk.f.monthCharges = next;
    },
    amt, dmy, shortName,
    billRows(b) {
      return [['electricity', 'Electricity'], ['water', 'Water'], ['sewerage', 'Sewerage']].filter(([k]) => Number(b[k]) > 0).map(([k, label]) => {
        const a = b[k + 'From'] || b.periodFrom, z = b[k + 'To'] || b.periodTo;
        return { label, v: b[k], period: a && z ? `${dmy(a)} to ${dmy(z)}` : 'no period' };
      });
    },
    // The invoice for an Awaiting payment booking: guest from the tenant record, unit type from the unit (16 Nov 2026)
    async openInvoice() {
      const b = this.bk, f = b.f;
      this.invBusy = true;
      let unitType = '';
      try { const u = b.unitId ? await getDoc(doc(db, 'units', b.unitId)) : null; unitType = u?.exists() ? u.data().info?.type || '' : ''; } catch { /* left out */ }
      let propertyAddress = '';   // 20 Nov 2026: the invoice is headed with the property's name and address
      try { const p = b.propertyId ? await getDoc(doc(db, 'properties', b.propertyId)) : null; propertyAddress = p?.exists() ? propertyAddressOf(p.data()) : ''; } catch { /* left out */ }
      this.invoice = invoiceOf({ ...b, arrival: f.arrival, departure: f.departure, monthlyRent: f.rent || b.monthlyRent, feesInPayments: true, monthCharges: cleanCharges(f.monthCharges) },
        { name: f.name, email: f.email, phone: f.phone }, { propertyName: b.propertyName, unitCode: b.unitCode || b.unitId, unitType, propertyAddress });
      this.invBusy = false;
    },
    startCancel() {
      this.cancelling = true;
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
      if (!await askConfirm({ title: `Delete booking ${b.bookingNo || b.id} for good?`, message: 'The booking, its guest details and passcodes, and its utility bill are removed from the PMS for good. This cannot be undone. The audit log keeps the booking no., unit and dates.', confirmText: 'Delete booking', danger: true })) return;
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
      const main = { arrival: f.arrival, departure: f.departure, nights, longTerm, monthlyRent: longTerm ? c(f.rent) : 0,
        bookingSource: f.bookingSource.trim(), rentalStatus: f.rentalStatus.trim(), ezeeReservationNo: f.ezeeReservationNo.trim(), remark: f.remark.trim(),
        monthCharges: cleanCharges(f.monthCharges) };
      // monthCharges is compared as text; the audit log keeps a short summary ("2026-03: Cleaning fees 80.00")
      const sum = mc => Object.entries(mc || {}).map(([m, l]) => `${m}: ${l.map(x => `${chargeLabel(x)} ${(+x.amount).toFixed(2)}`).join(', ')}`).join('; ');
      // An older booking's deposit and fee fields count as month charges (allMonthCharges), so moving them is not a change on its own
      const same = k => (k === 'monthCharges' ? JSON.stringify(cleanCharges(allMonthCharges(b))) === JSON.stringify(main[k]) : (b[k] ?? '') === main[k]);
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
.bk-where { font-size: 14px; font-weight: 400; margin: 0; }   /* 20 Nov 2026: property, unit and source beside the booking no. */
.bk-tabs { margin: -6px 0 18px; position: sticky; top: -20px; z-index: 2; background: var(--surface, #fff); box-shadow: 0 -20px 0 var(--surface, #fff); }   /* covers the body's top padding while stuck */
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
