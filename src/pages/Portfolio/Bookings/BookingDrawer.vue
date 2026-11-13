<template>
  <div>
    <div class="drawer-back" @click="$emit('close')"></div>
    <aside class="drawer wide" role="dialog" aria-label="Booking" v-esc="() => $emit('close')">
      <div class="drawer-head"><h2>{{ `Booking ${bk.bookingNo || bk.id}` }}</h2><button class="icon-btn" @click="$emit('close')" aria-label="Close">×</button></div>
      <form class="drawer-body" id="bkForm" @submit.prevent="save()">
        <p class="help">{{ `${bk.propertyName || ''} · ${bk.unitCode || bk.unitId || ''} · ${bk.source === 'import' ? 'Imported from Willow' : bk.source === 'direct' ? 'Direct booking' : 'From Tenant leads'}` }}</p>
        <div class="notice warn" v-if="cancelled">{{ `Cancelled${bk.cancelledReason ? ': ' + bk.cancelledReason : ''}. It is left out of the lists, the Dashboard and the forms. Restore it, or delete it for good.` }}</div>
        <p class="help" v-if="bk.inquiryId && acc.canOpenInquiry"><RouterLink class="navlink" :to="`/Operations/offline-inquiries?id=${bk.inquiryId}`">{{ `Open inquiry ${bk.inquiryId}` }}</RouterLink></p>
        <div class="form-sec">Guest <span class="help" style="text-transform:none;letter-spacing:0;font-weight:400">· private, Accounting, Directors and Operations only</span></div>
        <div class="field"><label>Name</label><input class="input" v-model="bk.f.name" :disabled="!guestEditable"></div>
        <div class="field"><label>Phone</label><input class="input" v-model="bk.f.phone" :disabled="!guestEditable"></div>
        <div class="field"><label>Email</label><input class="input" id="bkEmail" v-model="bk.f.email" :disabled="!guestEditable"></div>
        <div class="field"><label>IC / Passport</label><input class="input" v-model="bk.f.icPassport" :disabled="!guestEditable"></div>
        <div class="form-sec">Stay</div>
        <div class="field"><label>Check in</label><input class="input" id="bkIn" type="date" v-model="bk.f.arrival" :disabled="!editable"></div>
        <div class="field"><label>Check out</label><input class="input" id="bkOut" type="date" v-model="bk.f.departure" :disabled="!editable"></div>
        <div class="field" v-if="isLong"><label>Monthly rent (RM)</label><input class="input" type="number" step="0.01" min="0" v-model="bk.f.rent" :disabled="!editable"></div>
        <div class="field"><label>Deposit (RM)</label><input class="input" type="number" step="0.01" min="0" v-model="bk.f.deposit" :disabled="!editable"></div>
        <div class="field"><label>Booking source</label><input class="input" v-model="bk.f.bookingSource" :disabled="!editable"></div>
        <div class="field"><label>Rental status</label><input class="input" v-model="bk.f.rentalStatus" :disabled="!editable"></div>
        <div class="field"><label>eZee reservation no.</label><input class="input" v-model="bk.f.ezeeReservationNo" :disabled="!editable"></div>
        <div class="field"><label>Remark</label><textarea class="input" rows="2" v-model="bk.f.remark" :disabled="!editable"></textarea></div>
        <template v-if="bk.hasPrivate">
          <div class="form-sec">Door passcodes</div>
          <div class="field"><label>Main door passcode</label><input class="input" v-model="bk.f.mainDoorPasscode" :disabled="!editable"></div>
          <div class="field"><label>Expires</label><input class="input" type="date" v-model="bk.f.currentExpiryDate" :disabled="!editable"></div>
          <div class="field"><label>Next passcode</label><input class="input" v-model="bk.f.nextDoorPasscode" :disabled="!editable"></div>
          <div class="field"><label>Next expires</label><input class="input" type="date" v-model="bk.f.nextExpiryDate" :disabled="!editable"></div>
        </template>
        <div class="form-sec">Payments <span class="help" style="text-transform:none;letter-spacing:0;font-weight:400">· from Accounting › Offline Payments</span></div>
        <template v-if="bk.payments">
          <p class="help" v-if="!bk.payments.length">{{ bk.amount ? `No payment records. Older booking: RM ${amt(bk.amount)} paid.` : 'No payment recorded yet.' }}</p>
          <div class="pay-row" v-for="x in bk.payments" :key="x.id"><span>{{ `${dmy(x.date)}${x.mode ? ' · ' + x.mode : ''}${x.bankRef ? ' · ' + x.bankRef : ''}` }}</span><b>{{ `RM ${amt(x.amount)}` }}</b><span class="tag">{{ x.status }}</span></div>
          <p class="help" v-if="bk.payments.length > 1">{{ `Total RM ${amt(totalPaid)}` }}</p>
        </template>
        <p class="help" v-else>Payments are visible to Accounting, Directors and Operations.</p>
        <template v-if="bk.payments && cal.length">
          <div class="form-sec">Rent summary</div>
          <div class="cal-row" v-if="isLong"><span>Monthly rent</span><b>{{ `RM ${amt(Number(bk.f.rent) || Number(bk.monthlyRent) || 0)}` }}</b></div>
          <div class="cal-row"><span>{{ isLong ? `Total rental (${cal.length} ${cal.length === 1 ? 'month' : 'months'}) · owner receives` : 'Total rental' }}</span><b>{{ `RM ${amt(totalDue)}` }}</b></div>
          <div class="cal-row cal-sub" v-for="c in charges" :key="c.label"><span>{{ c.label }}</span><b>{{ `RM ${amt(c.v)}` }}</b></div>
          <div class="cal-row"><span>Total to pay</span><b>{{ `RM ${amt(totalDue + otherTotal)}` }}</b></div>
          <div class="cal-row"><span><b>Total paid</b></span><b>{{ `RM ${amt(totalPaid)}` }}</b></div>
          <div class="form-sec">Total Payments</div>
          <div class="cal-row" v-for="c in cal" :key="c.m"><span>{{ shortName(c.m) }}</span><span class="pill" :class="MONTH_PAY[c.status].cls">{{ MONTH_PAY[c.status].label }}</span><b>{{ `RM ${amt(c.paid)}` }}<small v-if="c.due > 0">{{ ` / ${amt(c.due)}` }}</small></b></div>
          <p class="help">{{ isLong ? 'Long-term: each month is rent against payments dated in that month.' : 'Short stay: the rental is due in the check-in month; payments count in the month they are dated.' }}</p>
        </template>
        <div class="form-sec">Utility bill</div>
        <p class="help" v-if="!bk.bill">No utility bill saved yet. Add it on Portfolio > Booking Forms > Utility Lodgment Form.</p>
        <template v-else>
          <!-- Each bill has its own period since 13 Nov 2026; older bills fall back to the one shared period -->
          <div class="cal-row" v-for="u in billRows(bk.bill)" :key="u.label"><span>{{ `${u.label} · ${u.period}` }}</span><b>{{ `RM ${amt(u.v)}` }}</b></div>
          <div class="cal-row"><span><b>Total utility</b></span><b>{{ `RM ${amt(bk.bill.total)}` }}</b></div>
        </template>
        <div class="field" v-if="editable"><label>Reason for the change (audit log)</label><input class="input" id="bkReason" v-model="bk.reason" placeholder="e.g. Guest extended by two nights"></div>
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
  </div>
</template>

<script>
// Booking drawer (Portfolio › Bookings): an offline booking's details, rent summary and payments; Accounting,
// Directors and Operations can edit it. Tells the page "saved" with the changed fields so it can update its list.
import { amt, dmy } from '@/lib/format.js';
import { friendlyError } from '@/lib/finance-data.js';
import { useSession } from '@/stores/session.js';
import { toast } from '@/lib/toast.js';
import { askConfirm } from '@/lib/confirm.js';
import { MONTH_PAY, shortName, loadBookingDetails, saveOfflineBooking, setBookingCancelled, deleteOfflineBooking } from '@/lib/portfolio-data.js';

const me = useSession();
const PRIV = ['name', 'phone', 'email', 'icPassport', 'mainDoorPasscode', 'currentExpiryDate', 'nextDoorPasscode', 'nextExpiryDate'];
const GUEST = ['name', 'phone', 'email', 'icPassport'];
const CHARGES = [['securityDeposit', 'Security deposit'], ['utilityDeposit', 'Utility deposit'], ['internetFee', 'Internet fees'], ['carparkFee', 'Carpark fees'], ['cleaningFee', 'Cleaning fees'], ['taFee', 'Tenancy agreement fees'], ['taStampFee', 'Tenancy agreement stamping fees'], ['othersFee', 'Others']];

export default {
  props: {
    booking: { type: Object, required: true },   // the row from the bookings list
    acc: { type: Object, required: true }
  },
  emits: ['close', 'saved', 'deleted'],
  data() {
    const r = this.booking, rm = c => (c ? Number(c).toFixed(2) : '');
    const f = { name: '', phone: '', email: '', icPassport: '', mainDoorPasscode: '', currentExpiryDate: '', nextDoorPasscode: '', nextExpiryDate: '',
      arrival: r.arrival || '', departure: r.departure || '', rent: rm(r.longTerm ? r.monthlyRent : ''), deposit: rm(r.deposit),
      bookingSource: r.bookingSource || '', rentalStatus: r.rentalStatus || '', ezeeReservationNo: r.ezeeReservationNo || '', remark: r.remark || '' };
    return { MONTH_PAY, cancelling: false, cancelReason: '', bk: { ...r, f, hasPrivate: false, bill: null, reason: '', error: '', busy: false, loaded: false } };
  },
  computed: {
    // Guest details on a tenant record can only be changed by Accounting and Directors; on an imported booking Operations can too
    cancelled() { return this.bk.status === 'cancelled'; },
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
    isLong() { const f = this.bk.f; return Math.round((new Date(f.departure) - new Date(f.arrival)) / 86400000) >= 30; },
    // Calendar of months for the booking: paid in the month (by payment date) against what is due
    cal() {
      const b = this.bk, f = b.f; if (!f.arrival || !f.departure || !b.payments) return [];
      const long = this.isLong, rent = Number(f.rent) || Number(b.monthlyRent) || 0, rental = Number(b.rental) || 0;
      const out = []; let [y, mo] = f.arrival.slice(0, 7).split('-').map(Number); const last = f.departure.slice(0, 7);
      for (let i = 0; i < 48; i++, mo++) {
        if (mo > 12) { mo = 1; y++; }
        const m = `${y}-${String(mo).padStart(2, '0')}`; if (m > last) break;
        const paid = b.payments.filter(x => (x.date || '').slice(0, 7) === m).reduce((s, x) => s + (Number(x.amount) || 0), 0);
        const due = long ? rent : (i === 0 ? rental : 0);
        out.push({ m, paid, due, status: due > 0 ? (paid >= due - 0.005 ? 'paid' : paid > 0 ? 'part' : 'unpaid') : (paid > 0 ? 'paid' : 'unpaid') });
      }
      return out;
    },
    // Deposits and fees on top of the rental: paid by the guest, never part of the owner's share
    charges() {
      const b = this.bk;
      return CHARGES.map(([k, label]) => ({ label: k === 'othersFee' && b.othersNote ? `Others (${b.othersNote})` : label,
        v: Number(k === 'securityDeposit' && b.f.deposit !== undefined ? b.f.deposit : b[k]) || 0 })).filter(c => c.v > 0);
    },
    otherTotal() { return this.charges.reduce((a, c) => a + c.v, 0); },
    totalDue() { return this.cal.reduce((a, c) => a + c.due, 0); },
    totalPaid() { return (this.bk.payments || []).reduce((a, x) => a + (Number(x.amount) || 0), 0); }
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
    amt, dmy, shortName,
    billRows(b) {
      return [['electricity', 'Electricity'], ['water', 'Water'], ['sewerage', 'Sewerage']].filter(([k]) => Number(b[k]) > 0).map(([k, label]) => {
        const a = b[k + 'From'] || b.periodFrom, z = b[k + 'To'] || b.periodTo;
        return { label, v: b[k], period: a && z ? `${dmy(a)} to ${dmy(z)}` : 'no period' };
      });
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
      const bad = (msg, id) => { b.error = msg; this.$nextTick(() => { const el = document.getElementById(id); if (!el) return; el.scrollIntoView({ block: 'center', behavior: 'smooth' }); setTimeout(() => el.focus({ preventScroll: true }), 350); }); };
      if (!f.arrival || !f.departure || f.departure < f.arrival) return bad('Check-out can\'t be before check-in.', f.arrival ? 'bkOut' : 'bkIn');
      if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) return bad('The email doesn\'t look right.', 'bkEmail');
      if (!b.reason.trim()) return bad('Add a reason for the change.', 'bkReason');
      const nights = Math.max(1, Math.round((new Date(f.departure) - new Date(f.arrival)) / 86400000)), longTerm = nights >= 30;
      const c = x => Math.round((Number(x) || 0) * 100) / 100;
      const main = { arrival: f.arrival, departure: f.departure, nights, longTerm, monthlyRent: longTerm ? c(f.rent) : 0, deposit: c(f.deposit),
        bookingSource: f.bookingSource.trim(), rentalStatus: f.rentalStatus.trim(), ezeeReservationNo: f.ezeeReservationNo.trim(), remark: f.remark.trim() };
      const changes = Object.keys(main).filter(k => (b[k] ?? '') !== main[k]).map(k => ({ field: k, old: b[k] ?? '', new: main[k] }));
      const pchanged = b.hasPrivate ? PRIV.filter(k => (o[k] ?? '') !== (f[k] ?? '') && (b.tenantId ? !GUEST.includes(k) : true)) : [];
      const gchanged = b.tenantId && b.guestOk ? GUEST.filter(k => (o[k] ?? '') !== (f[k] ?? '')) : [];
      if (!changes.length && !pchanged.length && !gchanged.length) { this.$emit('close'); return; }
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
