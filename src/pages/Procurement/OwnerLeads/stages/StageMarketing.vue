<template>
  <section class="card" aria-label="Marketing">
    <div class="card-head"><h2>{{ `${n}. Marketing` }}</h2><span class="pill" :class="d.marketing.taskId || d.marketing.notifiedAt ? 'green' : 'grey'">{{ d.marketing.taskId ? 'Sent to Marketing' : d.marketing.notifiedAt ? 'Marketing notified' : 'Not notified' }}</span></div>
    <div class="notice warn" v-if="!d.payment.confirmed && !d.marketing.taskId">Marketing is notified once the final payment is confirmed (Payment stage).</div>
    <div class="kv" v-if="d.marketing.notifiedAt"><span>Notified</span><span>{{ `By ${d.marketing.notifiedByName}, ${stamp(d.marketing.notifiedAt)}` }}</span></div>
    <template v-if="!d.marketing.taskId && canEdit && !d.live.live">
      <div class="mk-head">
        <span class="mk-count">{{ `Marketing checklist · ${d.marketing.items.filter(m => m.on).length} of ${d.marketing.items.length} done` }}</span>
        <label class="tick mk-all"><input type="checkbox" :checked="d.marketing.items.every(m => m.on)" :indeterminate.prop="d.marketing.items.some(m => m.on) && !d.marketing.items.every(m => m.on)" @change="d.marketing.items.forEach(m => { m.on = $event.target.checked })"> Select all</label>
      </div>
      <div class="mk-grid">
        <template v-for="(m, i) in d.marketing.items" :key="i">
          <label class="mk-tile" :class="{ on: m.on }"><input type="checkbox" v-model="m.on"><span>{{ m.title }}</span><button type="button" class="mk-x" @click.prevent="d.marketing.items.splice(i, 1)" :aria-label="`Remove ${m.title}`" title="Remove">×</button></label>
        </template>
      </div>
      <div class="mk-add"><input class="input" v-model="mkAdd" placeholder="Add another item, e.g. Listing photos shoot" aria-label="New marketing item" @keyup.enter="addMk()"><button class="btn" @click="addMk()" :disabled="!mkAdd.trim()">+ Add</button></div>
    </template>
    <template v-else>
      <div class="mk-items">
        <template v-for="(m, i) in d.marketing.items.filter(x => x.on)" :key="i"><span class="pill grey">{{ m.title }}</span></template>
        <span class="muted" v-show="!d.marketing.items.some(x => x.on)">Nothing chosen yet.</span>
      </div>
    </template>
    <template v-if="d.marketing.taskId">
      <div class="kv"><span>Sent</span><span>{{ `${d.marketing.sentByName}, ${stamp(d.marketing.sentAt)}` }}</span></div>
      <div class="kv mk-progress"><span>Marketing task</span><span>{{ mkTask ? `${mkTask.subtasksDone} of ${mkTask.subtasksTotal} done · ${mkTask.completed ? 'Completed' : mkTask.status || 'Open'}` : (tasksError ? 'Could not read the task system' : 'Checking…') }}</span></div>
      <button class="btn" @click="$emit('refresh-tasks')" :disabled="tasksLoading">{{ tasksLoading ? 'Checking…' : 'Refresh' }}</button>
    </template>
    <div class="actions" v-if="canEdit && !d.live.live">
      <button class="btn btn-primary" @click="$emit('go-live')" :disabled="busy || !stageDoneOf(d, 'marketing')" :title="!d.payment.confirmed ? 'Confirm the payment first (Payment stage)' : stageDoneOf(d, 'marketing') ? '' : 'Tick every marketing item first'">Go Live</button>
    </div>
    <p class="help" v-if="d.live.live">{{ `Live since ${stamp(d.live.at)}. Handover to Operations is in the Live stage.` }}</p>
  </section>
</template>

<script>
// Stage: Marketing (the checklist; Go Live is done by the page: save, then notify Operations).
import { stamp, stageDoneOf } from '@/lib/owner-leads.js';

export default {
  props: { d: { type: Object, required: true }, canEdit: Boolean, busy: Boolean, mkTask: { type: Object, default: null },
    tasksError: { type: String, default: '' }, tasksLoading: Boolean, n: { type: Number, default: 5 } },
  emits: ['go-live', 'refresh-tasks'],
  data() { return { mkAdd: '' }; },
  methods: {
    stamp, stageDoneOf,
    addMk() {
      const t = this.mkAdd.trim();
      if (!t) return;
      if (!this.d.marketing.items.some(m => m.title.toLowerCase() === t.toLowerCase())) this.d.marketing.items.push({ title: t, on: true });
      this.mkAdd = '';
    }
  }
};
</script>
