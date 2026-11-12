<template>
  <section class="card ol-inbox" aria-label="From task system">
    <div class="card-head">
      <h2>{{ `From task system${leads.length ? ' · ' + leads.length : ''}` }}</h2>
      <LiveStatus :status="status?.status" :last-updated="status?.lastUpdated" time />
    </div>
    <div class="notice warn" v-show="error">{{ error }}</div>
    <p class="muted" v-show="loaded && !error && !leads.length">No new owner leads on the board.</p>
    <div class="inbox-list">
      <template v-for="t in leads" :key="t.taskId">
        <div class="inbox-row">
          <div class="inbox-text">
            <b>{{ t.title }}</b>
            <small>{{ [t.column || 'New', t.dueDate ? `Due ${full(tmsDate(t.dueDate))}` : '', t.createdByName ? `from ${t.createdByName}` : '', `${leadAging(t).text} old`].filter(Boolean).join(' · ') }}</small>
            <span v-if="t.description">{{ t.description.length > 120 ? t.description.slice(0, 120) + '…' : t.description }}</span>
          </div>
          <button class="btn btn-primary btn-sm" @click="$emit('start', t)" :disabled="busy">Start listing</button>
        </div>
      </template>
    </div>
  </section>
</template>

<script>
// "From task system": cards on the TMS Owner Leads board that nobody has started yet (no listing linked). The page polls
// the board (ownerLeads, every 60 s through use-live.js) and passes them in; Start listing is done by the page.
import { full, tmsDate, leadAging } from '@/lib/owner-leads.js';
import LiveStatus from '@/components/LiveStatus.vue';

export default {
  components: { LiveStatus },
  props: { leads: { type: Array, default: () => [] }, status: { type: Object, default: null }, error: { type: String, default: '' }, loaded: Boolean, busy: Boolean },
  emits: ['start'],
  methods: { full, tmsDate, leadAging }
};
</script>

<style scoped>
.ol-inbox h2 { font-size: 15px; margin: 0; white-space: nowrap; }
.ol-inbox .card-head { flex-wrap: wrap; gap: 4px 8px; }
.inbox-list { display: grid; gap: 8px; }
.inbox-row { display: grid; gap: 8px; border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px; }
.inbox-row .btn { justify-self: start; }
.inbox-text { display: grid; gap: 2px; min-width: 0; font-size: 13px; }
.inbox-text small { color: var(--muted); font-size: 12px; }
.inbox-text span { color: var(--text-2); overflow-wrap: anywhere; font-size: 12px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
</style>
