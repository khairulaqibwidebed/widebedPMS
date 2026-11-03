<template>
  <div class="removed-box" v-if="bookings.length">
    <h3 class="t">{{ `Removed by hand · ${bookings.length}` }}</h3>
    <p class="help" style="margin:0 0 8px">Not in the statement or the owner PDF. Restore puts a booking back.</p>
    <div class="removed-row" v-for="b in bookings" :key="b.id">
      <span><b>{{ b.reservationNo }}</b> · {{ b.source }} · {{ dmy(b.arrival) }} to {{ dmy(b.departure) }}</span>
      <span class="help">{{ `${b.removedByHand.reason || ''}${b.removedByHand.byName ? ' (' + b.removedByHand.byName + ')' : ''}` }}</span>
      <button class="btn" v-if="!locked" @click="restore(b)" :disabled="busy || disabled">Restore</button>
    </div>
    <div class="notice error" v-if="error" style="margin-top:8px">{{ error }}</div>
  </div>
</template>

<script>
// Month-end unit page: bookings removed by hand (status 'cancelled' + removedByHand), each with Restore.
//   <RemovedBookings :bookings="removedList()" :locked :disabled="busy" :property-id :unit-id :month @restored="bk => ..." />
import { doc, writeBatch, deleteField } from 'firebase/firestore';
import { db } from '@/lib/firebase.js';
import { audit, friendlyError } from '@/lib/finance-data.js';
import { markDirty } from '@/lib/summary-data.js';
import { dmy } from '@/lib/format.js';
import { useSession } from '@/stores/session.js';

const me = useSession();

export default {
  props: { bookings: { type: Array, required: true }, locked: { type: Boolean, default: false }, disabled: { type: Boolean, default: false },
    propertyId: { type: String, required: true }, unitId: { type: String, required: true }, month: { type: String, required: true } },
  emits: ['restored'],
  data() { return { dmy, busy: false, error: '' }; },
  methods: {
    async restore(bk) {
      if (this.locked) return;
      this.busy = true; this.error = '';
      try {
        const b = writeBatch(db);
        b.set(doc(db, 'bookings', bk.id), { status: 'active', removedByHand: deleteField() }, { merge: true });
        audit(b, me, { action: 'booking.restore', entity: `bookings/${bk.id}`, propertyId: this.propertyId, month: this.month, changes: [{ field: 'status', old: 'removed by hand', new: 'active' }], reason: 'Restored on Month-end' });
        markDirty(b, this.propertyId, this.month, [this.unitId]);
        await b.commit();
        this.$emit('restored', bk);
      } catch (e) { this.error = friendlyError(e, 'restore the booking'); }
      this.busy = false;
    }
  }
};
</script>

<style scoped>
.removed-box { margin-top: 18px; padding: 14px; border: 1px dashed var(--border); border-radius: 10px; }
.removed-row { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; padding: 6px 0; border-top: 1px solid var(--line); }
.removed-row .help { flex: 1; min-width: 160px; }
</style>
