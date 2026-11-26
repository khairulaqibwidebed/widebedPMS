<template>
  <!-- HR > Leave, "My leave" (26 Nov 2026, Crane): everyone applies for leave here as well as in the attendance app, sees
       their requests and withdraws one while it is waiting, and sees their days per type for the year. Shown inside Leave.vue
       (the only part of that page staff see). Emits "changed" after a request is sent or withdrawn. Logic: leave.js. -->
  <div class="ml">
    <div class="loading-bar" v-show="loading"></div>
    <div class="ml-top">
      <span class="muted">Apply for leave or MC, and see what you have left. The same requests show in the attendance app.</span>
      <label class="ml-year"><span>Year</span>
        <select class="select" v-model.number="year" @change="loadEnt()"><option v-for="y in years" :key="y" :value="y">{{ y }}</option></select></label>
    </div>

    <div class="notice error" v-if="error">{{ error }}</div>
    <div class="notice ok" v-if="okMsg">{{ okMsg }}</div>

    <!-- Balance per type -->
    <div class="ml-cards">
      <div class="ml-card" v-for="b in balance.filter(x => x.active || x.used || x.waiting || x.given != null)" :key="b.key">
        <div class="ml-card-label">{{ b.label }}</div>
        <div class="ml-card-value" :class="{ 'ml-neg': b.left != null && b.left < 0 }">{{ b.given == null ? '—' : b.left }}</div>
        <div class="ml-card-hint">{{ b.given == null ? 'No limit set' : `left of ${b.given}` }}</div>
        <div class="ml-card-hint">{{ `${b.used} used · ${b.waiting} waiting` }}</div>
      </div>
    </div>

    <div class="grid-2">
      <section class="card">
        <div class="card-head"><h2>Apply for leave</h2></div>
        <p class="notice warn" v-if="!enabled">HR has turned leave requests off for now. Ask HR if you need leave.</p>
        <form v-else @submit.prevent="apply()">
          <div class="field"><label for="mType" class="req">Type</label>
            <select id="mType" class="select" v-model="f.type"><option v-for="t in types.filter(x => x.active)" :key="t.key" :value="t.key">{{ t.label }}</option></select></div>
          <div class="grid-fields">
            <div class="field"><label for="mFrom" class="req">From</label><input id="mFrom" class="input" type="date" v-model="f.from" required @change="f.to = (!f.to || f.to < f.from) ? f.from : f.to"></div>
            <div class="field"><label for="mTo" class="req">To</label><input id="mTo" class="input" type="date" v-model="f.to" :min="f.from" required></div>
          </div>
          <label class="check"><input type="checkbox" v-model="f.halfDay" :disabled="f.from !== f.to"><span>Half day <small>One day only</small></span></label>
          <div class="field"><label for="mNote">Note <span class="muted">(optional)</span></label><input id="mNote" class="input" v-model="f.note" maxlength="300" placeholder="Family trip"></div>
          <p class="help" v-if="f.from && f.to"><b>{{ daysText(days) }}</b> of working days. {{ leftLine }}</p>
          <p class="notice warn" v-if="over">{{ `That is ${over} day${over === 1 ? '' : 's'} more than you have left for ${typeLabel(f.type)}. You can still send it; HR decides.` }}</p>
          <button class="btn btn-primary" type="submit" :disabled="busy || !f.from || !f.to">{{ busy ? 'Sending…' : 'Send request' }}</button>
        </form>
      </section>

      <section class="card">
        <div class="card-head"><h2>My requests</h2></div>
        <div class="ml-row" v-for="r in mine" :key="r.id">
          <div>
            <b>{{ typeLabel(r.type) }}</b> <span class="muted">{{ daysText(r.days) }}</span>
            <div>{{ rangeText(r) }}</div>
            <small class="muted" v-if="r.note">{{ r.note }}</small>
            <small class="ml-why" v-if="r.resolveNote">{{ `${STATUS[r.status]?.label || r.status} by ${r.resolvedByName || 'HR'}: ${r.resolveNote}` }}</small>
            <small class="muted ml-block" v-else-if="r.byHR">{{ `Added by ${r.resolvedByName || 'HR'}` }}</small>
          </div>
          <div class="ml-right">
            <span class="pill" :class="(STATUS[r.status] || {}).pill">{{ (STATUS[r.status] || { label: r.status }).label }}</span>
            <template v-if="r.status === 'pending'">
              <button v-if="withdrawing !== r.id" type="button" class="btn btn-sm" :disabled="busy" @click="withdrawing = r.id">Withdraw</button>
              <span v-else class="ml-confirm">
                <button type="button" class="btn btn-sm btn-danger" :disabled="busy" @click="withdraw(r)">Yes, withdraw</button>
                <button type="button" class="btn btn-sm" :disabled="busy" @click="withdrawing = ''">No</button>
              </span>
            </template>
          </div>
        </div>
        <p class="empty" v-if="!loading && !mine.length">No leave requests yet.</p>
      </section>
    </div>
  </div>
</template>

<script>
import { friendlyError } from '@/lib/finance-data.js';
import { useSession } from '@/stores/session.js';
import { loadConfig, loadHolidays, dayKey } from './attendance.js';
import {
  STATUS, typeLabel, loadLeaveTypes, rangeText, daysText, workingDays, balanceFor, overBy, leaveEnabled,
  loadMyLeave, loadMyEntitlement, applyLeave, withdrawLeave
} from './leave.js';

const emptyForm = () => ({ type: 'annual', from: '', to: '', halfDay: false, note: '' });

export default {
  emits: ['changed'],
  data() {
    return {
      STATUS, types: [],
      loading: true, busy: false, error: '', okMsg: '',
      cfg: {}, holidays: {}, mine: [], ent: null, year: +dayKey().slice(0, 4), f: emptyForm(), withdrawing: ''
    };
  },
  computed: {
    me() { return useSession(); },
    enabled() { return leaveEnabled(this.cfg); },
    years() { const y = +dayKey().slice(0, 4); return [y - 1, y, y + 1]; },
    balance() { return balanceFor(this.ent, this.mine, this.me.user?.uid, this.year); },
    days() { return workingDays({ from: this.f.from, to: this.f.to, halfDay: this.f.halfDay && this.f.from === this.f.to, cfg: this.cfg, holidays: this.holidays, uid: this.me.user?.uid }); },
    formYear() { return this.f.from ? +this.f.from.slice(0, 4) : this.year; },
    leftLine() {
      if (this.formYear !== this.year) return `Pick ${this.formYear} at the top to see what you have left that year.`;
      const b = this.balance.find(x => x.key === this.f.type);
      return b && b.given != null ? `You have ${b.left} ${typeLabel(this.f.type)} day${b.left === 1 ? '' : 's'} left in ${this.year}${b.waiting ? ` (${b.waiting} waiting)` : ''}.` : '';
    },
    over() { return this.formYear === this.year ? overBy(this.balance, this.f.type, this.days) : 0; }
  },
  async mounted() {
    try {
      const [cfg, hol, types] = await Promise.all([loadConfig(), loadHolidays(), loadLeaveTypes()]);
      this.cfg = cfg; this.holidays = hol; this.types = [...types];
    } catch (e) { this.error = friendlyError(e, 'load the leave settings'); }
    await this.load();
  },
  methods: {
    rangeText, daysText, typeLabel,
    flash(msg) { this.okMsg = msg; setTimeout(() => { if (this.okMsg === msg) this.okMsg = ''; }, 5000); },
    async load() {
      this.loading = true; this.error = '';
      try {
        const uid = this.me.user.uid;
        const [mine, ent] = await Promise.all([loadMyLeave(uid), loadMyEntitlement(uid, this.year)]);
        this.mine = mine; this.ent = ent;
      } catch (e) { this.error = friendlyError(e, 'load your leave'); }
      this.loading = false;
    },
    async loadEnt() {
      try { this.ent = await loadMyEntitlement(this.me.user.uid, this.year); } catch (e) { this.error = friendlyError(e, 'load your leave days'); }
    },
    async apply() {
      this.busy = true; this.error = '';
      try {
        const f = this.f;
        await applyLeave({ me: this.me, type: f.type, from: f.from, to: f.to, halfDay: f.halfDay && f.from === f.to, note: f.note, days: this.days });
        this.flash('Request sent. HR has been told; you\'ll get a notification when they answer.');
        this.f = emptyForm();
        await this.load();
        this.$emit('changed');
      } catch (e) { this.error = e.code ? friendlyError(e, 'send the request') : e.message; }
      this.busy = false;
    },
    async withdraw(r) {
      this.busy = true; this.error = '';
      try { await withdrawLeave(r, this.me); this.withdrawing = ''; this.flash('Request withdrawn.'); await this.load(); this.$emit('changed'); }
      catch (e) { this.error = e.code ? friendlyError(e, 'withdraw the request') : e.message; }
      this.busy = false;
    }
  }
};
</script>

<style scoped>
.ml-top { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
.ml-year { display: grid; gap: 4px; font-size: 12px; font-weight: 600; color: var(--text-2); }
.ml-year .select { height: 38px; }
.ml-cards { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }
@media (max-width: 900px) { .ml-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.ml-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 14px 16px; }
.ml-card-label { font-size: 12px; font-weight: 600; color: var(--text-2); }
.ml-card-value { font-size: 26px; font-weight: 700; margin: 4px 0 2px; font-variant-numeric: tabular-nums; }
.ml-neg { color: var(--red); }
.ml-card-hint { font-size: 12px; color: var(--muted); }
.ml-row { display: flex; justify-content: space-between; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--line, var(--border)); }
.ml-row:last-of-type { border-bottom: 0; }
.ml-right { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
.ml-confirm { display: flex; gap: 6px; }
.ml-why { display: block; color: var(--text-2); margin-top: 2px; }
.ml-block { display: block; }
</style>
