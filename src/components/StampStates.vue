<template>
  <div class="modal-back" @click.self="close()" v-esc="() => close()">
    <div class="modal" role="dialog" aria-label="Stamp states" style="max-width:820px;width:calc(100% - 32px)">
      <h2>Stamp and link records</h2>
      <p class="help" style="margin:0 0 12px">
        Copies each property's state onto its units, bookings, statements, expenses and the rest, and links owners and tenants to the
        properties of their units and bookings, so staff see the owners and tenants of their own properties.
        Check first changes nothing. Running it again is safe: records already stamped are skipped, so a stopped run just carries on.
      </p>
      <div class="notice error" v-show="error">{{ error }}</div>
      <div class="notice ok" v-show="okMsg">{{ okMsg }}</div>

      <div v-if="busy" class="st-busy">
        <div>{{ step }}</div>
        <div class="progress" v-if="total"><div :style="{ width: Math.round(100 * done / total) + '%' }"></div></div>
      </div>

      <template v-if="plan && !busy">
        <div class="notice error" v-if="plan.propertiesWithout">{{ `${plan.propertiesWithout} ${plan.propertiesWithout === 1 ? 'property has' : 'properties have'} no state. Their records can't be stamped: set them first (Set them now), then check again.` }}</div>
        <div class="notice error" v-if="plan.staffWithout">{{ `${plan.staffWithout} active staff ${plan.staffWithout === 1 ? 'has' : 'have'} no properties yet (Settings > Staff). They see no property data until some are given.` }}</div>
        <div class="table-wrap st-wrap">
          <table class="table">
            <thead><tr><th>Records</th><th class="num">Total</th><th class="num">Already done</th><th class="num">To stamp</th><th class="num">Not resolved</th><th class="num">No property</th></tr></thead>
            <tbody>
              <tr v-for="r in plan.rows" :key="r.coll">
                <td class="strong">{{ LABEL[r.coll] }}</td>
                <td class="num">{{ r.total }}</td>
                <td class="num">{{ r.ok }}</td>
                <td class="num" :class="{ strong: r.toStamp }">{{ r.toStamp }}</td>
                <td class="num" :class="{ bad: r.unresolved }">{{ r.unresolved }}</td>
                <td class="num">{{ r.noLink || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="help">{{ plan.writes ? `${plan.writes} records to stamp.` : 'Nothing to stamp.' }}{{ plan.writes > DAILY_CAP ? ` The free plan allows about 20,000 writes a day, so this run stops after ${DAILY_CAP}. Run it again tomorrow to finish.` : '' }}
          "No property" = in-house tickets and uploads with no property: they need no state.</p>

        <template v-if="plan.unresolved.length">
          <h3 class="st-h">Not resolved ({{ plan.unresolved.length }})</h3>
          <p class="help" style="margin:0 0 8px">Not stamped, and not guessed. Fix the property's state, or pick the state here for leads, listings, owners and tenants.</p>
          <div class="table-wrap st-wrap">
            <table class="table">
              <thead><tr><th>Records</th><th>Record</th><th>Why</th><th>State</th></tr></thead>
              <tbody>
                <tr v-for="u in plan.unresolved.slice(0, shown)" :key="u.coll + '/' + u.id">
                  <td>{{ LABEL[u.coll] }}</td>
                  <td class="strong">{{ u.label }}</td>
                  <td>{{ u.why }}</td>
                  <td>
                    <span class="pill green" v-if="picked[u.coll + '/' + u.id]">{{ picked[u.coll + '/' + u.id] }}</span>
                    <span v-else-if="!u.manual" class="help">Fix the property</span>
                    <select v-else class="input st-sel" :aria-label="`State for ${u.label}`" @change="pickState(u, $event.target.value)" :disabled="!!saving">
                      <option value="">Pick the state</option><option v-for="s in STATES" :key="s" :value="s">{{ s }}</option>
                    </select>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <button class="btn btn-sm" type="button" v-if="plan.unresolved.length > shown" @click="shown += 200" style="margin-top:8px">{{ `Show more (${plan.unresolved.length - shown} left)` }}</button>
        </template>
      </template>

      <div class="modal-foot">
        <button class="btn" type="button" v-if="busy && stamping" @click="stopAsked = true" :disabled="stopAsked">{{ stopAsked ? 'Stopping…' : 'Stop' }}</button>
        <button class="btn" type="button" @click="close()" :disabled="busy">Close</button>
        <button class="btn" type="button" @click="check()" :disabled="busy">{{ plan ? 'Check again' : 'Check first (changes nothing)' }}</button>
        <button class="btn btn-primary" type="button" v-if="plan && plan.writes" @click="run()" :disabled="busy">{{ `Stamp ${Math.min(plan.writes, DAILY_CAP)} records` }}</button>
      </div>
    </div>
  </div>
</template>

<script>
// Properties > Stamp states (Directors only, 12 Nov 2026). The work is in lib/state-stamp.js.
import { useSession } from '@/stores/session.js';
import { askConfirm } from '@/lib/confirm.js';
import { friendlyError } from '@/lib/finance-data.js';
import { STATES } from '@/lib/states.js';
import { dryRun, stamp, setStateByHand, saveStampResult, LABEL, DAILY_CAP } from '@/lib/state-stamp.js';

const me = useSession();

export default {
  emits: ['close'],
  data() {
    return { STATES, LABEL, DAILY_CAP, plan: null, busy: false, stamping: false, stopAsked: false, step: '', done: 0, total: 0,
      error: '', okMsg: '', picked: {}, saving: '', shown: 200 };
  },
  methods: {
    close() { if (!this.busy) this.$emit('close'); },
    async check() {
      this.busy = true; this.error = ''; this.okMsg = ''; this.total = 0; this.picked = {}; this.shown = 200;
      try { this.plan = await dryRun(s => { this.step = s; }); }
      catch (e) { this.error = friendlyError(e, 'check the records'); }
      this.busy = false;
    },
    async run() {
      const n = Math.min(this.plan.writes, DAILY_CAP);
      if (!(await askConfirm({ title: 'Stamp states', message: `Stamp the state on ${n} records? Only the state field changes. Each batch is saved in the audit log.`, confirmText: 'Stamp' }))) return;
      this.busy = true; this.stamping = true; this.stopAsked = false; this.error = ''; this.okMsg = '';
      this.step = 'Stamping'; this.done = 0; this.total = n;
      try {
        const r = await stamp(me, this.plan.jobs, ({ done, total }) => { this.done = done; this.total = total; this.step = `Stamped ${done} of ${total}`; }, DAILY_CAP, () => this.stopAsked);
        const left = this.plan.writes - r.done;
        await saveStampResult(me, left + this.plan.unresolved.length);
        this.okMsg = r.stopped ? `Stamped ${r.done}. ${left} left: press Check again, then Stamp, to carry on${this.plan.writes > DAILY_CAP ? ' (tomorrow, for the daily write limit)' : ''}.` : `Stamped ${r.done} records.`;
      } catch (e) {
        this.error = friendlyError(e, 'stamp the states') + (this.done ? ` ${this.done} were stamped before this. Check again and Stamp to carry on.` : '');
      }
      this.busy = false; this.stamping = false;
      // Fresh numbers after the run
      if (!this.error) { const msg = this.okMsg; await this.check(); this.okMsg = msg; }
    },
    async pickState(u, state) {
      if (!state) return;
      this.saving = u.coll + '/' + u.id; this.error = '';
      try {
        await setStateByHand(me, u.coll, u.id, state);
        this.picked = { ...this.picked, [u.coll + '/' + u.id]: state };
      } catch (e) { this.error = e.code ? friendlyError(e, `save the state of ${u.label}`) : e.message; }
      this.saving = '';
    }
  }
};
</script>

<style scoped>
.st-wrap { max-height: 40vh; overflow: auto; }
.st-sel { height: 32px; min-width: 160px; }
.st-busy { margin: 8px 0 12px; font-size: 14px; }
.st-h { font-size: 15px; margin: 16px 0 4px; }
.bad { color: var(--danger, #c0392b); font-weight: 600; }
.modal-foot { flex-wrap: wrap; }
</style>
