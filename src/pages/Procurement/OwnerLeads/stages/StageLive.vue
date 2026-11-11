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
      <div class="notice warn" v-if="!stageDoneOf(d, 'marketing')">{{ mkReadyOf(d) ? `Finish the marketing checklist first (${d.marketing.items.filter(m => m.on).length} of ${d.marketing.items.length} done, Marketing stage).` : 'The payment (or the deposit) is not confirmed yet (Payment stage), so Marketing has not started.' }}</div>
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
          <b>{{ fee ? `Service fee ${fee.pct}%` : 'Service fee not set' }}</b>
          <small>{{ fee ? `${fee.label} rent, from Types of service. Create ▾ Unit fills it in as the unit's service fee; pick the arrangement there and check it.` : 'No rent type in Types of service, so no service fee is filled in for the unit.' }}</small>
        </div>
      </li>
      <li class="lv-step" :class="{ ok: inPortfolio }">
        <span class="lv-num" aria-hidden="true">{{ inPortfolio ? '✓' : '2' }}</span>
        <div class="lv-text">
          <b>Create in Portfolio</b>
          <small v-if="canAddPortfolio">{{ 'Each option opens the Portfolio add form filled in from this listing. Check it and press Save there.'
            + (canSeeContact ? '' : ' Owner phone and email are not filled in: only Directors and Procurement see them.') }}</small>
          <small v-else>Operations creates these from this listing (the property, unit and owner in Portfolio).</small>
          <small v-if="inPortfolio" class="lv-done">{{ 'In Portfolio: ' + [portfolio.propertyId && `property ${portfolio.propertyId}`, portfolio.unitId && `unit ${portfolio.unitId}`, portfolio.ownerId && 'owner added'].filter(Boolean).join(' · ') }}</small>
        </div>
        <div class="create-wrap" v-if="canAddPortfolio">
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
      <li class="lv-step" :class="{ ok: d.live.opsGroup }">
        <span class="lv-num" aria-hidden="true">{{ d.live.opsGroup ? '✓' : '3' }}</span>
        <label class="lv-text" v-if="canEdit" for="lvOps">
          <b>Ops WhatsApp group made</b>
          <small>Tick once the Operations group for this unit exists.</small>
        </label>
        <div class="lv-text" v-else><b>Ops WhatsApp group made</b><small>{{ d.live.opsGroup ? 'Yes' : 'Not yet' }}</small></div>
        <input v-if="canEdit" id="lvOps" class="lv-check" type="checkbox" v-model="d.live.opsGroup">
      </li>
    </ol>
  </section>
</template>

<script>
// Stage: Live (Mark as Live, the handover to Operations as three steps: service fee, Create property / unit / owner in
// Portfolio, Ops WhatsApp group). Redesigned 11 Nov 2026; what each part does is unchanged.
import { stamp, stageDoneOf, serviceFeeOf, mkReadyOf, balanceDueOf, balanceOf, rm } from '@/lib/owner-leads.js';

export default {
  props: { d: { type: Object, required: true }, portfolio: { type: Object, default: null }, canEdit: Boolean, busy: Boolean,
    canAddPortfolio: Boolean, canSeeContact: Boolean, mkTask: { type: Object, default: null }, n: { type: Number, default: 6 } },
  emits: ['mark-live', 'to-portfolio'],
  data() { return { createOpen: false }; },
  computed: {
    fee() { return serviceFeeOf(this.d); },
    inPortfolio() { const p = this.portfolio; return !!(p && (p.propertyId || p.unitId || p.ownerId)); }
  },
  methods: { stamp, stageDoneOf, mkReadyOf, balanceDueOf, balanceOf, rm }
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
