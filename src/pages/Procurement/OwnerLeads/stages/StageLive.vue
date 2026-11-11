<template>
  <section class="card" aria-label="Live">
    <div class="card-head"><h2>{{ `${n}. Live` }}</h2><span class="pill" :class="d.live.live ? 'green' : 'grey'">{{ d.live.live ? 'Live' : 'Not live yet' }}</span></div>
    <template v-if="d.live.live">
      <div class="kv"><span>Marked as Live</span><span>{{ `${d.live.byName}, ${stamp(d.live.at)}` }}</span></div>
      <div class="kv" v-if="d.live.overrideReason"><span>Before Marketing was done</span><span>{{ d.live.overrideReason }}</span></div>
    </template>
    <template v-else-if="canEdit">
      <div class="notice warn" v-if="!stageDoneOf(d, 'marketing')">{{ d.payment.confirmed ? `Finish the marketing checklist first (${d.marketing.items.filter(m => m.on).length} of ${d.marketing.items.length} done, Marketing stage).` : 'The payment is not confirmed yet (Payment stage), so Marketing has not started.' }}</div>
      <div class="notice warn" v-else-if="mkTask && !mkTask.completed">{{ `The Marketing task is not completed yet (${mkTask.subtasksDone} of ${mkTask.subtasksTotal} done).` }}</div>
      <button class="btn btn-primary" @click="$emit('mark-live')" :disabled="busy || !stageDoneOf(d, 'marketing')">Mark as Live</button>
    </template>
    <p class="muted" v-else>Not live yet.</p>

    <div class="form-sec">Handover to Operations</div>
    <p class="help" v-if="fee">{{ `Service fee for this unit: ${fee.pct}% (${fee.label} rent, from Types of service). Create ▾ Unit fills it in as the unit's service fee; pick the arrangement there and check it.` }}</p>
    <p class="help" v-else>No rent type in Types of service, so no service fee is filled in for the unit.</p>
    <label class="tick" v-if="canEdit"><input type="checkbox" v-model="d.live.opsGroup"> Ops WhatsApp group made</label>
    <div class="kv" v-else><span>Ops WhatsApp group made</span><span>{{ d.live.opsGroup ? 'Yes' : 'No' }}</span></div>
    <div class="ho-line">
      <p class="help" v-if="canAddPortfolio">{{ 'Each option opens the Portfolio add form filled in from this listing. Check it and press Save there.'
        + (canSeeContact ? '' : ' Owner phone and email are not filled in: only Directors and Procurement see them.') }}</p>
      <p class="help" v-else>Operations creates these from this listing (the property, unit and owner in Portfolio).</p>
      <div class="create-wrap" v-if="canAddPortfolio">
        <button class="btn" @click="createOpen = !createOpen">Create ▾</button>
        <template v-if="createOpen">
          <div class="create-back" @click="createOpen = false"></div>
          <div class="create-menu">
            <button @click="createOpen = false; $emit('to-portfolio', 'property')">Property</button>
            <button @click="createOpen = false; $emit('to-portfolio', 'unit')">Unit</button>
            <button @click="createOpen = false; $emit('to-portfolio', 'owner')">Owner</button>
          </div>
        </template>
      </div>
    </div>
    <div class="kv" v-if="portfolio && (portfolio.propertyId || portfolio.unitId || portfolio.ownerId)"><span>In Portfolio</span>
      <span>{{ [portfolio.propertyId && `property ${portfolio.propertyId}`, portfolio.unitId && `unit ${portfolio.unitId}`, portfolio.ownerId && 'owner added'].filter(Boolean).join(' · ') }}</span></div>
  </section>
</template>

<script>
// Stage: Live (Mark as Live, the handover to Operations, Create property / unit / owner in Portfolio).
import { stamp, stageDoneOf, serviceFeeOf } from '@/lib/owner-leads.js';

export default {
  props: { d: { type: Object, required: true }, portfolio: { type: Object, default: null }, canEdit: Boolean, busy: Boolean,
    canAddPortfolio: Boolean, canSeeContact: Boolean, mkTask: { type: Object, default: null }, n: { type: Number, default: 6 } },
  emits: ['mark-live', 'to-portfolio'],
  data() { return { createOpen: false }; },
  computed: { fee() { return serviceFeeOf(this.d); } },
  methods: { stamp, stageDoneOf }
};
</script>
