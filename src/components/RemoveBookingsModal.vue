<template>
  <div class="modal-back" @click.self="close()" v-esc="close">
    <div class="modal" role="dialog" aria-modal="true" aria-label="Remove bookings">
      <h2>{{ `Remove ${bookings.length} booking${bookings.length === 1 ? '' : 's'}` }}</h2>
      <p class="help" style="margin:0 0 12px">They leave this statement and the owner PDF. Nothing is deleted, and a new eZee upload will not bring them back.</p>
      <div class="field fit-picker"><label>What happens to them?</label>
        <OptionPicker v-model="to" :options="options" label="What happens to them" searchable /></div>
      <div class="field"><label for="rmWhy" class="req">Reason</label><textarea class="input" id="rmWhy" v-model="reason" placeholder="e.g. eZee put this booking under the wrong room"></textarea></div>
      <div class="notice error" v-if="error" style="margin-top:10px">{{ error }}</div>
      <div class="modal-foot"><button class="btn" @click="close()" :disabled="busy">Back</button><button class="btn btn-primary" @click="save()" :disabled="busy || !reason.trim()">{{ busy ? 'Saving…' : to ? 'Move' : 'Remove' }}</button></div>
    </div>
  </div>
</template>

<script>
// Month-end > Manage bookings > Remove bookings: take the ticked bookings out of this unit's statement, or move them to another unit.
//   <RemoveBookingsModal v-if="removeAsk" :property-id :unit-id :unit-code :month :bookings="chosen" @close @done="({ to, ids, reason }) => ..." />
// Remove = status 'cancelled' + removedByHand; move = new unitId/unitCode + movedByHand. Audit entries and stale month summaries either way.
import { doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase.js';
import { loadUnits, audit, friendlyError } from '@/lib/finance-data.js';
import { markDirty } from '@/lib/summary-data.js';
import { useSession } from '@/stores/session.js';
import OptionPicker from '@/components/OptionPicker.vue';

const me = useSession();

export default {
  components: { OptionPicker },
  props: { propertyId: { type: String, required: true }, unitId: { type: String, required: true }, unitCode: { type: String, default: '' },
    month: { type: String, required: true }, bookings: { type: Array, required: true } },
  emits: ['close', 'done'],
  data() { return { units: [], to: '', reason: '', error: '', busy: false }; },
  computed: {
    options() { return [{ value: '', label: 'Remove them entirely' }, ...this.units.filter(u => u.id !== this.unitId).map(u => ({ value: u.id, label: `Move to ${u.unitCode}` }))]; }
  },
  async mounted() { try { this.units = await loadUnits(this.propertyId); } catch (e) { this.units = []; } },
  methods: {
    close() { if (!this.busy) this.$emit('close'); },
    async save() {
      const why = this.reason.trim(); if (!why) return;
      if (!this.bookings.length) { this.error = 'Pick at least one booking.'; return; }
      const to = this.to ? this.units.find(u => u.id === this.to) : null;
      this.busy = true; this.error = '';
      try {
        const b = writeBatch(db);
        for (const bk of this.bookings) {
          const by = { at: serverTimestamp(), by: me.user.uid, byName: me.name, reason: why };
          if (to) {
            b.set(doc(db, 'bookings', bk.id), { unitId: to.id, unitCode: to.unitCode, movedByHand: { ...by, fromUnitId: this.unitId, fromUnitCode: this.unitCode } }, { merge: true });
            audit(b, me, { action: 'booking.move', entity: `bookings/${bk.id}`, propertyId: this.propertyId, month: this.month, changes: [{ field: 'unit', old: this.unitCode, new: to.unitCode }], reason: why });
          } else {
            b.set(doc(db, 'bookings', bk.id), { status: 'cancelled', removedByHand: by }, { merge: true });
            audit(b, me, { action: 'booking.remove', entity: `bookings/${bk.id}`, propertyId: this.propertyId, month: this.month, changes: [{ field: 'status', old: 'active', new: 'removed by hand' }], reason: why });
          }
        }
        markDirty(b, this.propertyId, this.month, to ? [this.unitId, to.id] : [this.unitId]);
        await b.commit();
        this.busy = false;
        this.$emit('done', { to, ids: this.bookings.map(x => x.id), reason: why });
      } catch (e) { this.error = friendlyError(e, 'remove the bookings'); }
      finally { this.busy = false; }
    }
  }
};
</script>

<style scoped>
.fit-picker :deep(.op) { display: block; width: 100%; }
.fit-picker :deep(.op-btn), .fit-picker :deep(.op-input) { width: 100%; }
.fit-picker :deep(.op-pop) { width: 100%; max-width: none; }
</style>
