<template>
  <div class="removed-box" v-if="bookings.length">
    <h3 class="t">{{ `Removed by hand · ${bookings.length}` }}</h3>
    <p class="help" style="margin:0 0 8px">Not in the statement or the owner PDF. Restore puts a booking back. Delete permanently removes it from the PMS, so the next eZee upload adds it again as a new booking (e.g. to re-test the calculation).</p>
    <div class="removed-row" v-for="b in bookings" :key="b.id">
      <span><b>{{ b.reservationNo }}</b> · {{ b.source }} · {{ dmy(b.arrival) }} to {{ dmy(b.departure) }}</span>
      <span class="help">{{ `${b.removedByHand.reason || ''}${b.removedByHand.byName ? ' (' + b.removedByHand.byName + ')' : ''}` }}</span>
      <span class="removed-acts" v-if="!locked">
        <button class="btn" @click="restore(b)" :disabled="busy || disabled">Restore</button>
        <button class="btn btn-del" @click="remove(b)" :disabled="busy || disabled">Delete permanently</button>
      </span>
    </div>
    <div class="notice error" v-if="error" style="margin-top:8px">{{ error }}</div>
  </div>
</template>

<script>
// Month-end unit page: bookings removed by hand (status 'cancelled' + removedByHand), each with Restore or Delete permanently.
// Delete (4 Nov 2026, for re-testing): the booking document goes; the audit log keeps its key figures; the next eZee upload
// adds it back as a new booking. Rules Draft 0.24 allow it only for a booking that was removed by hand (Finance/Director).
//   <RemovedBookings :bookings="removedList()" :locked :disabled="busy" :property-id :unit-id :month @restored="bk => ..." @deleted="bk => ..." />
import { doc, writeBatch, deleteField } from 'firebase/firestore';
import { db } from '@/lib/firebase.js';
import { audit, friendlyError } from '@/lib/finance-data.js';
import { markDirty } from '@/lib/summary-data.js';
import { dmy } from '@/lib/format.js';
import { useSession } from '@/stores/session.js';
import { askConfirm } from '@/lib/confirm.js';

const me = useSession();

export default {
  props: { bookings: { type: Array, required: true }, locked: { type: Boolean, default: false }, disabled: { type: Boolean, default: false },
    propertyId: { type: String, required: true }, unitId: { type: String, required: true }, month: { type: String, required: true } },
  emits: ['restored', 'deleted'],
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
    },
    async remove(bk) {
      if (this.locked) return;
      const ok = await askConfirm({ title: `Delete ${bk.reservationNo} permanently?`, danger: true, confirmText: 'Delete permanently',
        message: 'It is removed from the PMS for good. The next eZee upload for this month adds it again as a new booking. The audit log keeps a record of it.' });
      if (!ok) return;
      this.busy = true; this.error = '';
      try {
        const b = writeBatch(db);
        b.delete(doc(db, 'bookings', bk.id));
        const kept = ['reservationNo', 'source', 'unitCode', 'arrival', 'departure', 'nights', 'allRoomCharges', 'cleaningFee', 'otherPaymentMethod']
          .map(f => ({ field: f, old: bk[f] ?? null, new: null }));
        audit(b, me, { action: 'booking.delete', entity: `bookings/${bk.id}`, propertyId: this.propertyId, month: this.month, changes: kept,
          reason: `Deleted permanently on Month-end (it was removed by hand: ${bk.removedByHand?.reason || 'no reason'})` });
        markDirty(b, this.propertyId, this.month, [this.unitId]);
        await b.commit();
        this.$emit('deleted', bk);
      } catch (e) { this.error = friendlyError(e, 'delete the booking'); }
      this.busy = false;
    }
  }
};
</script>

<style scoped>
.removed-box { margin-top: 18px; padding: 14px; border: 1px dashed var(--border); border-radius: 10px; }
.removed-row { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; padding: 6px 0; border-top: 1px solid var(--line); }
.removed-row .help { flex: 1; min-width: 160px; }
.removed-acts { display: inline-flex; gap: 8px; flex-wrap: wrap; }
.btn-del { color: var(--danger, #d92d20); }
.btn-del:hover:not(:disabled) { border-color: var(--danger, #d92d20); background: color-mix(in srgb, var(--danger, #d92d20) 10%, transparent); }
</style>
