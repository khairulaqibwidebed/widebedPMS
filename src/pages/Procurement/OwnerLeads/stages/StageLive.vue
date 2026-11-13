<template>
  <section class="card" aria-label="Live">
    <div class="card-head"><h2>{{ `${n}. Live` }}</h2><span class="pill" :class="d.live.live ? 'green' : 'grey'">{{ d.live.live ? 'Live' : 'Not live yet' }}</span></div>
    <template v-if="d.live.live">
      <div class="lv-banner">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
        <span>Marked as Live by <b>{{ d.live.byName || '—' }}</b>{{ d.live.at ? ` on ${stamp(d.live.at)}` : '' }}</span>
      </div>
      <div class="kv" v-if="d.live.overrideReason"><span>Before Marketing was done</span><span>{{ d.live.overrideReason }}</span></div>
    </template>
    <template v-else-if="canEdit">
      <div class="notice warn" v-if="!stageDoneOf(d, 'marketing')">{{ mkReadyOf(d) ? `Finish the marketing checklist first (${d.marketing.items.filter(m => m.on).length} of ${d.marketing.items.length} done, Marketing stage).` : !paidOf(d) ? 'The payment (or the deposit) is not confirmed yet (Payment stage), so Marketing has not started.' : 'Operations Setup is not done yet, so Marketing has not started.' }}</div>
      <div class="notice warn" v-if="balanceDueOf(d)">{{ `The balance (${rm(balanceOf(d))}) is not received yet (Payment stage).` }}</div>
      <div class="notice warn" v-else-if="mkTask && !mkTask.completed">{{ `The Marketing task is not completed yet (${mkTask.subtasksDone} of ${mkTask.subtasksTotal} done).` }}</div>
      <div><button class="btn btn-primary" @click="$emit('mark-live')" :disabled="busy || !stageDoneOf(d, 'marketing')">Mark as Live</button></div>
    </template>
    <p class="muted" v-else>Not live yet.</p>

    <h3 class="lv-h">Handover to Operations</h3>
    <ol class="lv-steps">
      <li class="lv-step" :class="{ ok: !!fee }">
        <span class="lv-num" aria-hidden="true">{{ fee ? '✓' : '1' }}</span>
        <div class="lv-text">
          <b>{{ fee ? fee.text : 'Arrangement not picked' }}</b>
          <small>{{ fee ? 'From Types of service. Accounting or a Director puts this arrangement on the unit in Portfolio (Units tab).' : 'No arrangement in Types of service yet.' }}</small>
        </div>
      </li>
      <li class="lv-step" :class="{ ok: allIn }">
        <span class="lv-num" aria-hidden="true">{{ allIn ? '✓' : '2' }}</span>
        <div class="lv-text">
          <b>{{ allIn ? 'In Portfolio' : 'Create in Portfolio' }}</b>
          <small v-if="allIn">Made when the agreement was marked Signed (Agreement stage).</small>
          <small v-else-if="canAddPortfolio">{{ 'Made when the agreement is marked Signed. For an older listing, each option opens the Portfolio add form filled in from this listing.' }}</small>
          <small v-else>Made when the agreement is marked Signed (Agreement stage).</small>
          <small v-if="inPortfolio" class="lv-done">{{ 'In Portfolio: ' + [portfolio.propertyId && `property ${portfolio.propertyId}`, portfolio.unitId && `unit ${portfolio.unitId}`, portfolio.ownerId && `owner ${portfolio.ownerId}`].filter(Boolean).join(' · ') }}</small>
        </div>
        <div class="create-wrap" v-if="canAddPortfolio && !allIn">
          <button class="btn lv-create" @click="createOpen = !createOpen" :aria-expanded="String(createOpen)">Create ▾</button>
          <template v-if="createOpen">
            <div class="create-back" @click="createOpen = false"></div>
            <div class="create-menu lv-menu">
              <button @click="createOpen = false; $emit('to-portfolio', 'property')">Property</button>
              <button @click="createOpen = false; $emit('to-portfolio', 'unit')">Unit</button>
              <button @click="createOpen = false; $emit('to-portfolio', 'owner')">Owner</button>
            </div>
          </template>
        </div>
      </li>
    </ol>
    <p class="help">The WhatsApp group is now a row in Operations Setup (Owner's WhatsApp Group).</p>
  </section>
</template>

<script>
// Stage: Live (Mark as Live, the handover: the arrangement for the unit, the Portfolio records). 13 Nov 2026: the
// property, owner and unit are made at Agreement (Signed); Create ▾ stays for older listings; the Ops WhatsApp tick moved
// to Operations Setup.
import { stamp, stageDoneOf, serviceFeeOf, mkReadyOf, paidOf, balanceDueOf, balanceOf, rm } from '@/lib/owner-leads.js';

export default {
  props: { d: { type: Object, required: true }, portfolio: { type: Object, default: null }, canEdit: Boolean, busy: Boolean,
    canAddPortfolio: Boolean, canSeeContact: Boolean, mkTask: { type: Object, default: null }, n: { type: Number, default: 6 } },
  emits: ['mark-live', 'to-portfolio'],
  data() { return { createOpen: false }; },
  computed: {
    fee() { return serviceFeeOf(this.d); },
    inPortfolio() { const p = this.portfolio; return !!(p && (p.propertyId || p.unitId || p.ownerId)); },
    allIn() { const p = this.portfolio; return !!(p && p.propertyId && p.unitId && p.ownerId); }
  },
  methods: { stamp, stageDoneOf, mkReadyOf, paidOf, balanceDueOf, balanceOf, rm }
};
</script>

<style scoped>
section.card { display: flex; flex-direction: column; gap: 14px; }
section.card > .card-head { margin-bottom: 0; }
.lv-banner { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-radius: 12px; background: var(--green-soft); color: var(--green); }
.lv-banner span { color: var(--text); }
.lv-h { margin: 6px 0 0; font-size: 15px; }
.lv-steps { list-style: none; margin: 0; padding: 0; border: 1px solid var(--line); border-radius: 12px; }
.lv-step { display: flex; align-items: center; gap: 14px; padding: 14px 16px; }
.lv-step + .lv-step { border-top: 1px solid var(--line); }
.lv-num { flex: none; width: 24px; height: 24px; border-radius: 12px; box-sizing: border-box; border: 2px solid var(--border); color: var(--muted); display: grid; place-items: center; font-size: 12px; font-weight: 700; }
.lv-step.ok .lv-num { background: var(--green); border-color: var(--green); color: #fff; }
.lv-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; cursor: default; }
label.lv-text { cursor: pointer; }
.lv-text b { font-size: 14px; font-weight: 600; }
.lv-text small { font-size: 13px; color: var(--muted); overflow-wrap: anywhere; }
.lv-text small.lv-done { color: var(--green); font-weight: 600; }
.lv-check { flex: none; width: 20px; height: 20px; accent-color: var(--accent); cursor: pointer; }
.create-wrap { flex: none; width: 120px; margin-left: 0; }
.lv-create { border-color: var(--accent); color: var(--accent); }
.lv-menu { bottom: auto; top: calc(100% + 4px); }
@media (max-width: 560px) { .lv-step { flex-wrap: wrap; } .create-wrap { width: 100%; } }
</style>
