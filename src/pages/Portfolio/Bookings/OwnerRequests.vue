<template>
  <div class="modal-back" @click.self="close()" v-esc="close">
    <div class="modal" role="dialog" aria-modal="true" aria-label="Owner booking request">
      <h2>Owner booking <span class="pill" :class="r.status === 'confirmed' ? 'green' : r.status === 'declined' ? 'red' : 'amber'">{{ r.status === 'confirmed' ? 'Confirmed' : r.status === 'declined' ? 'Declined' : 'Awaiting confirmation' }}</span></h2>
      <p class="help" style="margin:0 0 12px" v-if="r.status === 'pending'">The owner asked for their own unit from the Owner Portal. Nothing is booked until you confirm. After confirming, key the stay into eZee by hand.</p>
      <p class="help" style="margin:0 0 12px" v-else-if="r.status === 'confirmed'">Confirmed. The owner sees it as Booked in the portal. Make sure it is keyed into eZee.</p>
      <dl class="orq-dl">
        <dt>Unit</dt><dd>{{ r.unitCode }}<span class="muted" v-if="r.property"> · {{ r.property }}</span></dd>
        <dt>Stay</dt><dd>{{ dmy(r.arrival) }} to {{ dmy(r.departure) }} · {{ r.nights }} {{ r.nights === 1 ? 'night' : 'nights' }}</dd>
        <dt>Asked by</dt><dd>{{ r.ownerName || 'the owner' }}<span class="muted" v-if="r.createdAt"> · {{ dmy(day(r.createdAt)) }}</span></dd>
        <template v-if="r.note"><dt>Note</dt><dd class="orq-note">“{{ r.note }}”</dd></template>
        <template v-if="r.decidedByName"><dt>Answered by</dt><dd>{{ r.decidedByName }}<template v-if="r.declineReason"> · {{ r.declineReason }}</template></dd></template>
      </dl>
      <ConfirmReason v-if="declining" v-model="reason" title="Decline this request?" text="The owner sees your reason in the portal." label="Reason (the owner sees this)" confirm-text="Decline request" danger :busy="busy" @confirm="decline()" @cancel="declining = false" />
      <div class="notice error" v-if="error" style="margin-top:10px">{{ error }}</div>
      <div class="modal-foot" v-if="!declining">
        <button type="button" class="btn" @click="close()" :disabled="busy">Close</button>
        <template v-if="r.status === 'pending' && canDecide">
          <button type="button" class="btn" :disabled="busy" @click="declining = true; reason = ''">Decline</button>
          <button type="button" class="btn btn-primary" :disabled="busy" @click="confirm()">{{ busy ? 'Saving…' : 'Confirm' }}</button>
        </template>
      </div>
    </div>
  </div>
</template>

<script>
// Portfolio > Bookings: one owner booking request from the Owner Portal (27 Nov 2026, Khairul: owner requests sit in the Bookings list with an
// "Owner" tag; click one to Confirm or Decline). The portal's server writes ownerBookingRequests (status pending). The owner sees the answer in the portal.
// Rules: Draft 1.18 (update may only change status pending -> confirmed / declined plus who and when). Not a booking record: a confirmed one is keyed into eZee by hand.
import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase.js';
import { audit, friendlyError } from '@/lib/finance-data.js';
import { askConfirm } from '@/lib/confirm.js';
import { dmy } from '@/lib/format.js';
import { useSession } from '@/stores/session.js';
import ConfirmReason from '@/components/ConfirmReason.vue';

const msOf = t => !t ? 0 : typeof t.toMillis === 'function' ? t.toMillis() : typeof t.seconds === 'number' ? t.seconds * 1000 : Number(new Date(t)) || 0;
export default {
  components: { ConfirmReason },
  props: { r: { type: Object, required: true }, canDecide: { type: Boolean, default: false } },
  emits: ['close'],
  data() { return { busy: false, declining: false, reason: '', error: '', dmy }; },
  methods: {
    close() { if (!this.busy) this.$emit('close'); },
    day(t) { const ms = msOf(t); return ms ? new Date(ms + 8 * 3600e3).toISOString().slice(0, 10) : ''; },
    async decide(status, reason = '') {
      const me = useSession(), r = this.r;
      this.busy = true; this.error = '';
      try {
        const b = writeBatch(db);
        b.update(doc(db, 'ownerBookingRequests', r.id), { status, decidedAt: serverTimestamp(), decidedByUid: me.user.uid, decidedByName: me.name || '', updatedAt: serverTimestamp(), ...(status === 'declined' ? { declineReason: reason.trim().slice(0, 300) } : {}) });
        audit(b, me, { action: `ownerBooking.${status}`, entity: `ownerBookingRequests/${r.id}`, propertyId: r.propertyId || null,
          changes: [{ field: 'status', old: 'pending', new: status }, { field: 'stay', old: '', new: `${r.unitCode} ${r.arrival} to ${r.departure}` }], reason });
        await b.commit();
        this.$emit('close');
      } catch (e) { this.error = friendlyError(e, 'save the answer'); } finally { this.busy = false; }
    },
    async confirm() {
      const r = this.r;
      const ok = await askConfirm({ title: 'Confirm this owner booking?', message: `${r.unitCode}, ${dmy(r.arrival)} to ${dmy(r.departure)}. The owner will see it as Booked in the portal. Key it into eZee by hand.`, confirmText: 'Confirm booking' });
      if (ok) await this.decide('confirmed');
    },
    decline() { return this.decide('declined', this.reason); }
  }
};
</script>

<style scoped>
.orq-dl { display: grid; grid-template-columns: max-content 1fr; gap: 6px 14px; margin: 0 0 4px; }
.orq-dl dt { color: var(--muted); }
.orq-dl dd { margin: 0; font-weight: 600; }
.orq-dl dd .muted { font-weight: 400; }
.orq-note { font-style: italic; font-weight: 400 !important; color: #57534e; }
</style>
