<template>
  <form class="lodge" @submit.prevent="save()" novalidate>
    <div class="notice error" v-show="error">{{ error }}</div>
    <div class="notice ok" v-show="done">{{ done }}</div>

    <section class="card">
      <h2>Tenant information</h2>
      <div class="grid-fields">
        <div class="field wide"><label for="lgName">Guest full name</label><input class="input" id="lgName" v-model="f.guestName"></div>
        <div class="field"><label for="lgIc">IC / Passport number</label><input class="input" id="lgIc" v-model="f.icPassport"></div>
        <div class="field"><label for="lgPhone">Phone / WhatsApp number</label><input class="input" id="lgPhone" v-model="f.phone" inputmode="tel" placeholder="e.g. 0123456789"></div>
        <div class="field wide"><label for="lgEmail">Email address</label><input class="input" id="lgEmail" type="email" v-model="f.email" placeholder="user@example.com"></div>
      </div>
    </section>

    <section class="card">
      <h2>Booking and financial details</h2>
      <div class="grid-fields">
        <div class="field"><label>Booking source</label>
          <OptionPicker class="fld-pick" v-model="f.bookingSource" :options="SOURCES" label="Booking source" /></div>
        <div class="field"><label>Property name</label>
          <OptionPicker class="fld-pick" v-model="f.propertyName" :options="propertyOptions" label="Property name" searchable @change="f.unitNumber = ''" /></div>
        <div class="field"><label>Unit number</label>
          <OptionPicker class="fld-pick" v-model="f.unitNumber" :disabled="!f.propertyName" :options="unitOptions" label="Unit number" searchable /></div>
        <div class="field"><label>Rental status</label>
          <OptionPicker class="fld-pick" v-model="f.rentalStatus" :options="STATUSES" label="Rental status" /></div>
        <div class="field"><label for="lgIn">Check-in date</label><input class="input" id="lgIn" type="date" v-model="f.checkIn"></div>
        <div class="field"><label for="lgOut">Check-out date</label><input class="input" id="lgOut" type="date" v-model="f.checkOut"></div>
        <div class="field"><label for="lgRent">Rental amount (RM)</label><input class="input" id="lgRent" type="number" min="0" step="0.01" v-model="f.rentalAmount" placeholder="0.00"></div>
        <div class="field"><label for="lgDep">Deposit amount (RM)</label><input class="input" id="lgDep" type="number" min="0" step="0.01" v-model="f.depositAmount" placeholder="0.00"></div>
      </div>
    </section>

    <section class="card">
      <h2>Door access and passcodes</h2>
      <div class="grid-fields">
        <div class="field"><label for="lgPass">Main door passcode <span class="muted">(optional)</span></label><input class="input" id="lgPass" v-model="f.mainPasscode" autocomplete="off"></div>
        <div class="field"><label for="lgExp">Current expiry date <span class="muted">(optional)</span></label><input class="input" id="lgExp" type="date" v-model="f.currentExpiry"></div>
        <div class="field"><label for="lgNext">Next door passcode <span class="muted">(optional)</span></label><input class="input" id="lgNext" v-model="f.nextPasscode" autocomplete="off"></div>
        <div class="field"><label for="lgNextExp">Next expiry date <span class="muted">(optional)</span></label><input class="input" id="lgNextExp" type="date" v-model="f.nextExpiry"></div>
      </div>
    </section>

    <button type="submit" class="btn btn-primary commit" :disabled="busy">{{ busy ? 'Saving…' : 'Commit reservation record' }}</button>
  </form>
</template>

<script>
import { useSession } from '@/stores/session.js';
import OptionPicker from '@/components/OptionPicker.vue';
import UNITS from '@/data/willow-units.json';
import { collection, doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase.js';
import { idPrefix } from '@/lib/lodgment.js';

// Same lists as Willow's "Booking Details" sheet: Property Name and Unit Number must match its "Owner List" exactly.
const opt = a => a.map(x => ({ value: x, label: x }));
const SOURCES = [{ value: '', label: 'Choose source…' }, ...opt(['Offline', 'Website', 'Agent', 'OTA'])];
const STATUSES = [{ value: '', label: 'Choose status…' }, ...opt(['Paid', 'Unpaid'])];
const blank = () => ({ guestName: '', icPassport: '', phone: '', email: '', bookingSource: '', propertyName: '', unitNumber: '', rentalStatus: '',
  checkIn: '', checkOut: '', rentalAmount: '', depositAmount: '', mainPasscode: '', currentExpiry: '', nextPasscode: '', nextExpiry: '' });
const digits = v => String(v || '').replace(/\D/g, '');

export default {
  components: { OptionPicker },
  data() { return { SOURCES, STATUSES, f: blank(), busy: false, error: '', done: '' }; },
  computed: {
    propertyOptions() { return [{ value: '', label: 'Choose property…' }, ...Object.keys(UNITS).map(p => ({ value: p, label: p }))]; },
    unitOptions() {
      const list = UNITS[this.f.propertyName] || [];
      return [{ value: '', label: this.f.propertyName ? 'Choose unit…' : 'Select property first…' }, ...list.map(u => ({ value: u, label: u }))];
    }
  },
  methods: {
    check() {
      const f = this.f;
      if (!f.guestName.trim()) return 'Add the guest\'s full name.';
      if (!f.icPassport.trim()) return 'Add the IC or passport number.';
      if (digits(f.phone).length < 9) return 'Add a full phone or WhatsApp number.';
      if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) return 'That email address doesn\'t look right.';
      if (!f.bookingSource) return 'Choose the booking source.';
      if (!f.propertyName || !f.unitNumber) return 'Choose the property and unit.';
      if (!f.rentalStatus) return 'Choose the rental status.';
      if (!f.checkIn || !f.checkOut) return 'Add the check-in and check-out dates.';
      if (f.checkOut <= f.checkIn) return 'Check-out must be after check-in.';
      if (f.mainPasscode.trim() && !f.currentExpiry) return 'Add the expiry date of the main door passcode.';
      if (f.nextPasscode.trim() && !f.nextExpiry) return 'Add the expiry date of the next door passcode.';
      return '';
    },
    async save() {
      const f = this.f, me = useSession();
      this.error = this.check(); this.done = '';
      if (this.error) return;
      this.busy = true;
      try {
        const nights = Math.round((new Date(f.checkOut) - new Date(f.checkIn)) / 86400000);
        const prefix = idPrefix(f.propertyName), cRef = doc(db, 'lodgmentCounters', prefix), ref = doc(collection(db, 'reservationLodgments'));
        const id = await runTransaction(db, async tx => {
          const c = await tx.get(cRef), n = c.exists() ? c.data().next || 1 : 1, bookingId = `${prefix}-${String(n).padStart(3, '0')}`;
          tx.set(cRef, { next: n + 1 });
          // Field names follow Willow's "Booking Details" columns, so a later sync to the Sheet is a straight copy.
          tx.set(ref, { bookingId, bookingSource: f.bookingSource, propertyName: f.propertyName, unitNumber: f.unitNumber,
            checkIn: f.checkIn, checkOut: f.checkOut, stayDuration: nights, rentalAmount: +f.rentalAmount || 0, renewalDate: f.checkOut,
            rentalStatus: f.rentalStatus, depositAmount: +f.depositAmount || 0, moveInStatus: 'Ready_to_Send', moveOutStatus: 'Ready_to_Send',
            passwordStatus: f.mainPasscode.trim() && f.currentExpiry ? 'Ready_to_Send' : '',
            createdAt: serverTimestamp(), createdBy: me.user.uid, createdByName: me.name });
          tx.set(doc(ref, 'private', 'main'), { name: f.guestName.trim(), icPassport: f.icPassport.trim(), phone: f.phone.trim(), email: f.email.trim(),
            mainDoorPasscode: f.mainPasscode.trim(), currentExpiryDate: f.currentExpiry || '', nextDoorPasscode: f.nextPasscode.trim(), nextExpiryDate: f.nextExpiry || '' });
          return bookingId;
        });
        this.done = `Saved as ${id}: ${f.unitNumber}, ${f.checkIn} to ${f.checkOut}.`;
        this.f = blank();
      } catch (e) { this.error = e.code === 'permission-denied' ? 'Firestore refused this. The latest security rules (reservationLodgments, lodgmentCounters) need to be published first.' : (e.message || 'Could not save the reservation record.'); }
      this.busy = false;
    }
  }
};
</script>

<style scoped>
.lodge { display: grid; gap: 14px; padding: 14px; }
.lodge .card { margin: 0; }
.lodge h2 { font-size: 15px; margin: 0 0 12px; }
.grid-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 16px; }
.field.wide { grid-column: 1 / -1; }
.field label { display: block; font-size: 13px; color: var(--text-2); margin-bottom: 6px; }
.fld-pick { display: block; width: 100%; }
.fld-pick :deep(.op-btn), .fld-pick :deep(.op-input) { width: 100%; min-height: 40px; }
.fld-pick :deep(.op-pop) { max-width: none; width: 100%; }
.commit { width: 100%; height: 44px; justify-content: center; }
@media (max-width: 640px) { .grid-fields { grid-template-columns: minmax(0, 1fr); } }
</style>
