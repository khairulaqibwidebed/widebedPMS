<template>
  <div class="modal-back" @click.self="close()" v-esc="close">
    <div class="modal" role="dialog" aria-modal="true" aria-label="Add booking" style="max-width:560px;width:calc(100% - 32px)">
      <h2>{{ `Add a booking to ${unitCode}` }}</h2>
      <p class="help" style="margin:0 0 12px">For a booking eZee did not give this unit. Its amounts are typed by you and shown as Manual. Check-out must be in {{ monthName(month) }}.</p>
      <div class="notice error" v-if="a.error" style="margin-bottom:10px">{{ a.error }}</div>
      <div class="grid-fields">
        <FormField id="adRes" label="Reservation no." req v-model="a.reservationNo" />
        <FormField id="adSrc" label="Source" req v-model="a.source" list="adSources" />
        <datalist id="adSources"><option v-for="x in SOURCES" :key="x">{{ x }}</option></datalist>
        <FormField id="adIn" label="Check-in" req type="date" v-model="a.arrival" />
        <FormField id="adOut" label="Check-out" req type="date" v-model="a.departure" />
        <FormField id="adGp" label="Guest paid (RM)" req type="number" step="0.01" min="0" v-model="a.guestPaid" @input="autoShare()" />
        <FormField id="adPl" label="Platform cut (RM)" type="number" step="0.01" min="0" v-model="a.platform" @input="autoShare()" />
        <div class="field"><label for="adPto" class="req">Owner share (RM)</label><input class="input" id="adPto" type="number" step="0.01" v-model="a.pto" @input="a.touched = true"><span class="help">Starts as guest paid ÷ 1.08 minus the platform cut. Change it if Accounting's figure differs.</span></div>
      </div>
      <div class="field"><label for="adWhy" class="req">Reason</label><textarea class="input" id="adWhy" v-model="a.reason" placeholder="e.g. Booking missing from the eZee report"></textarea></div>
      <div class="modal-foot"><button class="btn" @click="close()" :disabled="busy">Cancel</button><button class="btn btn-primary" @click="save()" :disabled="busy">{{ busy ? 'Adding…' : 'Add booking' }}</button></div>
    </div>
  </div>
</template>

<script>
// Month-end > Manage bookings > Add booking: a booking eZee did not give this unit, with amounts typed by hand (shown as Manual).
//   <AddBookingModal v-if="addOpen" :property-id :unit-id :unit-code :month @close @added="({ id, data, reason }) => ..." />
// Saves bookings/{reservationNo} with manual: true, an audit entry, and marks the unit's month summary stale.
import { doc, getDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase.js';
import { audit, friendlyError } from '@/lib/finance-data.js';
import { markDirty } from '@/lib/summary-data.js';
import { otaKeyOf, r2 } from '@/lib/engine.js';
import { monthName } from '@/lib/format.js';
import { useSession } from '@/stores/session.js';
import { withState } from '@/lib/states.js';
import FormField from '@/components/FormField.vue';

const me = useSession();
const SOURCES = ['Walk-in', 'Direct', 'Booking.com', 'Agoda', 'Expedia', 'Tiket.com', 'Traveloka', 'Airbnb'];

export default {
  components: { FormField },
  props: { propertyId: { type: String, required: true }, unitId: { type: String, required: true }, unitCode: { type: String, default: '' }, month: { type: String, required: true } },
  emits: ['close', 'added'],
  data() {
    return { SOURCES, monthName, busy: false,
      a: { reservationNo: '', source: 'Walk-in', arrival: '', departure: '', guestPaid: '', platform: '0', pto: '', touched: false, reason: '', error: '' } };
  },
  methods: {
    close() { if (!this.busy) this.$emit('close'); },
    // Owner share follows guest paid ÷ 1.08 (SST off) minus the platform cut until it is typed over
    autoShare() {
      const a = this.a; if (a.touched) return;
      const gp = Number(a.guestPaid);
      a.pto = a.guestPaid === '' || !(gp >= 0) ? '' : String(r2(gp / 1.08 - (Number(a.platform) || 0)));
    },
    async save() {
      const a = this.a; a.error = '';
      const id = String(a.reservationNo).trim(), source = String(a.source).trim(), reason = a.reason.trim();
      if (!id || /\//.test(id)) return (a.error = 'Type the reservation number (no slashes).');
      if (!source) return (a.error = 'Type the source.');
      if (!a.arrival || !a.departure) return (a.error = 'Pick the check-in and check-out dates.');
      if (a.departure < a.arrival) return (a.error = 'Check-out is before check-in.');
      if (a.departure.slice(0, 7) !== this.month) return (a.error = `Check-out must be in ${monthName(this.month)}: a booking counts in the month it ends.`);
      if (!(Number(a.guestPaid) > 0)) return (a.error = 'Type what the guest paid.');
      if (a.pto === '' || Number.isNaN(Number(a.pto))) return (a.error = 'Type the owner share.');
      if (!reason) return (a.error = 'Add a short reason. It goes in the audit log.');
      this.busy = true;
      try {
        if ((await getDoc(doc(db, 'bookings', id))).exists()) { a.error = `A booking with reservation ${id} already exists. Use Edit all or Move instead, so it is not counted twice.`; return; }
        const nights = Math.max(1, Math.round((Date.parse(a.departure) - Date.parse(a.arrival)) / 864e5));
        const edits = { ovGuestPaid: Number(a.guestPaid), ovPlatform: Number(a.platform) || 0, ovPto: Number(a.pto), editedBy: me.user.uid, editedByName: me.name, editReason: reason };
        const data = { reservationNo: id, folioNo: '', source, otaKey: otaKeyOf(source), arrival: a.arrival, departure: a.departure, departureMonth: this.month, nights,
          status: 'active', propertyId: this.propertyId, unitId: this.unitId, unitCode: this.unitCode, manual: true, edits,
          addedByHand: { at: serverTimestamp(), by: me.user.uid, byName: me.name, reason } };
        const b = writeBatch(db);
        b.set(doc(db, 'bookings', id), await withState(this.propertyId, data));   // carries its property's state
        audit(b, me, { action: 'booking.add', entity: `bookings/${id}`, propertyId: this.propertyId, month: this.month,
          changes: [{ field: 'booking', old: null, new: `${source} ${a.arrival} to ${a.departure}, owner share ${r2(a.pto)}` }], reason });
        markDirty(b, this.propertyId, this.month, [this.unitId]);
        await b.commit();
        this.busy = false;
        this.$emit('added', { id, data, reason });
      } catch (e) { a.error = friendlyError(e, 'add the booking'); }
      finally { this.busy = false; }
    }
  }
};
</script>
