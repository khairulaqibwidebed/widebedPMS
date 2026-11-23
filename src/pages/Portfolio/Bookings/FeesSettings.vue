<template>
  <div class="is-panel">
    <div class="loading-bar" v-show="loading || busy"></div>
    <div class="is-head">
      <div>
        <h2>Other fees</h2>
        <p class="help" style="margin:4px 0 0">Staff always type every fee on the booking form. Here you choose, for each type of rent, how the tenant sees it on the invoice:
          <b>Show</b> (its own line), <b>Add into rent</b> (added into the rent shown; same total) or <b>Not used</b> (box hidden on new bookings).
          The booking, the Payments tab, owner statements and reports always keep rent and fees apart.</p>
      </div>
    </div>
    <div class="notice error" v-show="error">{{ error }}</div>
    <div class="notice ok" v-show="okMsg">{{ okMsg }}</div>

    <section class="card fs-card" v-if="!loading">
      <!-- 23 Nov 2026 (Khairul): one tab per type of rent (underline tabs like Staff accounts); no sideways scroll.
           Name, Charged and Deposit are shared by all three; Default amount and On the invoice are for the open tab only. -->
      <div class="fs-tabs" role="tablist" aria-label="Type of rent">
        <button v-for="c in RENT_COLS" :key="c.key" type="button" role="tab" :class="{ on: rentTab === c.key }" :aria-selected="String(rentTab === c.key)" @click="rentTab = c.key">{{ c.term }}</button>
      </div>
      <p class="help fs-tabnote">Name, Charged and Deposit are the same for every type of rent. Default amount and On the invoice are for {{ RENT_COLS.find(c => c.key === rentTab).term }} only.</p>
      <div class="fs-list">
        <div class="fs-row fs-headrow" aria-hidden="true"><span></span><span>Fee</span><span>Charged</span><span class="fs-c">Deposit</span><span>Default (RM)</span><span>On the invoice</span><span></span></div>
        <div v-for="(f, i) in fees" :key="f.id" class="fs-row" :class="{ over: overAt === i, off: f.mode[rentTab] === 'notUsed' }"
          draggable="true" @dragstart="dragFrom = i" @dragover.prevent="overAt = i" @dragleave="overAt = -1" @drop.prevent="drop(i)" @dragend="dragFrom = -1; overAt = -1">
          <div class="fs-move">
            <span class="grip" title="Drag to move" aria-hidden="true">⋮⋮</span>
            <button type="button" class="mv" :disabled="i === 0" @click="move(i, -1)" :aria-label="`Move ${f.label || 'fee'} up`">▲</button>
            <button type="button" class="mv" :disabled="i === fees.length - 1" @click="move(i, 1)" :aria-label="`Move ${f.label || 'fee'} down`">▼</button>
          </div>
          <div class="fs-name">
            <input class="input" v-model="f.label" :maxlength="LABEL_MAX" :class="{ bad: problemOf(f) }" placeholder="Fee name" :aria-label="`Name of fee ${i + 1}`">
            <small class="help" v-if="f.builtIn">Built-in</small>
            <small class="help" v-else-if="isNew(f)">New fee</small>
            <small class="help" v-else>{{ usedText(f) }}</small>
            <small class="bad-text" v-if="problemOf(f)">{{ problemOf(f) }}</small>
          </div>
          <div class="mini-seg" role="group" :aria-label="`${f.label} charged`">
            <button type="button" :class="{ on: f.kind === 'oneOff' }" :aria-pressed="String(f.kind === 'oneOff')" @click="f.kind = 'oneOff'">One-off</button>
            <button type="button" :class="{ on: f.kind === 'monthly' }" :aria-pressed="String(f.kind === 'monthly')" @click="f.kind = 'monthly'">Monthly</button>
          </div>
          <div class="fs-c"><input type="checkbox" class="fs-tick" :checked="f.deposit" @change="setDeposit(f, $event)" :aria-label="`${f.label} is a deposit`"></div>
          <input class="input fs-amt" type="number" min="0" step="0.01" placeholder="None" :value="defaultFor(f, rentTab) ?? ''" @input="setDefaultFor(f, rentTab, $event.target.value)" :aria-label="`${f.label} default amount`">
          <div class="fs-mode" :class="'m-' + f.mode[rentTab]">
            <OptionPicker class="fs-pick" :model-value="f.mode[rentTab]" :options="MODES" :label="`${f.label}: on the invoice`" @update:model-value="v => setMode(f, rentTab, v)" />
          </div>
          <div class="fs-act">
            <button type="button" class="link rm" v-if="canRemove(f)" @click="remove(i)">Remove</button>
            <button type="button" class="link" v-else-if="!f.builtIn && !allOff(f)" @click="hide(f)" title="Bookings have an amount in it, so it can't be removed. Not used everywhere hides it on new bookings.">Hide</button>
          </div>
        </div>
      </div>
      <div class="fs-foot">
        <button type="button" class="btn" @click="add()" :disabled="fees.length >= MAX_ITEMS">+ Add fee</button>
        <span class="help">{{ fees.length >= MAX_ITEMS ? `${MAX_ITEMS} fees at most.` : 'Monthly fees are charged on every month of the stay; One-off fees on the first month. Default amounts fill in new bookings only. A booking that already has an amount in a fee always shows that box.' }}</span>
      </div>
      <div class="fs-notes">
        <p class="help"><b>Add into rent</b> on the invoice: a Monthly fee goes into every month's rent, a One-off fee into the first month's rent. Short term: the fee goes into the stay's total and the rate per night shown is the total divided by the nights. The tenant's grand total never changes.</p>
        <p class="help">The invoice follows these settings when it is downloaded, for every booking (old ones too). The security deposit is always shown on its own.</p>
      </div>
    </section>
    <!-- 23 Nov 2026 (Khairul): Save at the bottom right -->
    <div class="is-foot">
      <p class="muted">{{ loading ? '' : updatedText }}</p>
      <button type="button" class="btn btn-primary" @click="save()" :disabled="loading || busy || !dirty">{{ busy ? 'Saving…' : 'Save settings' }}</button>
    </div>
  </div>
</template>

<script>
// Booking settings > Other fees (/Portfolio/bookings/settings/fees), 23 Nov 2026 (Khairul). config/bookingFees
// (lib/booking-settings.js, Firestore rules 1.02), the 'bookingSettings.edit' tick. Was "Other fees on/off" (Coming soon).
// One row per fee: name, One-off / Monthly, Deposit, default amount (one, or per type of rent) and the mode per type of rent.
// Built-in fees can be renamed and set, not removed. A custom fee can be removed only when no booking has an amount in it
// (customFees.<id> > 0, counted once when the tab opens); otherwise Hide sets it Not used everywhere.
import { loadBookingFees, saveBookingFees, countFeeUse, normFees, newFeeId, cleanDefault, defaultFor, MODES, RENT_COLS, LABEL_MAX, MAX_ITEMS } from '@/lib/booking-settings.js';
import { askConfirm } from '@/lib/confirm.js';
import OptionPicker from '@/components/OptionPicker.vue';

const snap = l => JSON.stringify(l.map(f => [f.id, f.label.trim(), f.kind, !!f.deposit, cleanDefault(f.defaultAmount), f.mode.daily, f.mode.monthly, f.mode.yearly]));
const DEPOSIT_ASK = { title: 'Add a deposit into rent?', message: 'This deposit will look like rent to the tenant and is harder to show as refundable. Continue?', confirmText: 'Continue' };
const copy = l => l.map(f => ({ ...f, mode: { ...f.mode }, defaultAmount: f.defaultAmount && typeof f.defaultAmount === 'object' ? { ...f.defaultAmount } : f.defaultAmount }));

export default {
  components: { OptionPicker },
  emits: ['dirty'],
  data() { return { MODES, RENT_COLS, LABEL_MAX, MAX_ITEMS, fees: [], before: [], start: '', meta: null, used: {}, perType: {}, rentTab: 'daily', loading: true, busy: false, error: '', okMsg: '', dragFrom: -1, overAt: -1 }; },
  computed: {
    dirty() { return !this.loading && snap(this.fees) !== this.start; },
    updatedText() {
      const m = this.meta; if (!m?.saved) return 'Using the built-in fees (nothing saved yet).';
      const at = m.updatedAt?.toDate ? m.updatedAt.toDate().toLocaleString('en-MY', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
      return `Last saved${m.updatedByName ? ' by ' + m.updatedByName : ''}${at ? ', ' + at : ''}.`;
    }
  },
  watch: { dirty(v) { this.$emit('dirty', v); if (v) this.okMsg = ''; } },
  async mounted() { await this.load(); },
  methods: {
    async load() {
      this.loading = true;
      try { this.meta = await loadBookingFees(true); }
      catch { this.error = 'Could not load the fee settings. Showing the built-in fees.'; this.meta = { fees: normFees(null), saved: false }; }
      this.before = copy(this.meta.fees); this.fees = copy(this.meta.fees);
      this.perType = Object.fromEntries(this.fees.map(f => [f.id, !!(f.defaultAmount && typeof f.defaultAmount === 'object')]));
      this.start = snap(this.fees); this.loading = false;
      this.countAll();
    },
    // Custom fees only (built-ins can't be removed): how many bookings have an amount in it
    countAll() {
      this.used = {};
      this.fees.filter(f => !f.builtIn).forEach(f => {
        this.used = { ...this.used, [f.id]: 'counting' };
        countFeeUse(f.id).then(n => { this.used = { ...this.used, [f.id]: n }; }).catch(() => { this.used = { ...this.used, [f.id]: 'unknown' }; });
      });
    },
    isNew(f) { return !this.before.some(b => b.id === f.id); },
    usedText(f) {
      const n = this.used[f.id];
      if (n === 'counting' || n == null) return 'Counting…';
      if (n === 'unknown') return "Couldn't count bookings";
      return `On ${n} booking${n === 1 ? '' : 's'}`;
    },
    allOff(f) { return RENT_COLS.every(c => f.mode[c.key] === 'notUsed'); },
    canRemove(f) { return !f.builtIn && (this.isNew(f) || this.used[f.id] === 0); },
    problemOf(f) {
      const l = f.label.trim().toLowerCase();
      if (!l) return 'Type a name.';
      if (this.fees.some(o => o !== f && o.label.trim().toLowerCase() === l)) return 'Another fee has this name.';
      if (l === 'security deposit') return 'The security deposit is its own box on the booking form.';
      return '';
    },
    numOrNull(v) { return v === '' || v == null ? null : Math.max(0, Number(v) || 0); },
    defaultFor,
    // One type's default; the first time the amounts differ the fee keeps one amount per type of rent
    setDefaultFor(f, key, v) {
      const d = f.defaultAmount, base = d && typeof d === 'object' ? d : { daily: d ?? null, monthly: d ?? null, yearly: d ?? null };
      f.defaultAmount = { ...base, [key]: this.numOrNull(v) }; this.perType = { ...this.perType, [f.id]: true };
    },
    oneDefault(f) { const d = f.defaultAmount; return d == null || typeof d === 'object' ? '' : d; },
    setPer(f, key, v) { f.defaultAmount = { ...(f.defaultAmount && typeof f.defaultAmount === 'object' ? f.defaultAmount : {}), [key]: this.numOrNull(v) }; },
    splitDefault(f, on) {
      const d = f.defaultAmount;
      if (on) f.defaultAmount = d != null && typeof d !== 'object' ? { daily: d, monthly: d, yearly: d } : d;
      else f.defaultAmount = d && typeof d === 'object' ? (d.monthly ?? d.daily ?? d.yearly ?? null) : d;
      this.perType = { ...this.perType, [f.id]: on };
    },
    async setMode(f, key, v) {
      if (v === 'intoRent' && f.deposit && f.mode[key] !== 'intoRent' && !(await askConfirm(DEPOSIT_ASK))) return;
      f.mode = { ...f.mode, [key]: v };
    },
    async setDeposit(f, ev) {
      const on = ev.target.checked;
      if (on && RENT_COLS.some(c => f.mode[c.key] === 'intoRent') && !(await askConfirm(DEPOSIT_ASK))) { ev.target.checked = false; return; }
      f.deposit = on;
    },
    add() {
      const f = { id: newFeeId(), label: '', kind: 'oneOff', deposit: false, builtIn: false, order: this.fees.length, defaultAmount: null, mode: { daily: 'show', monthly: 'show', yearly: 'show' } };
      this.fees.push(f); this.perType = { ...this.perType, [f.id]: false };
      this.$nextTick(() => { const els = this.$el.querySelectorAll('.fs-name input'); els[els.length - 1]?.focus(); });
    },
    async remove(i) {
      const f = this.fees[i];
      if (!this.isNew(f) && !(await askConfirm({ title: `Remove ${f.label}?`, message: 'No booking has an amount in it. It goes from the list when you save.', confirmText: 'Remove', danger: true }))) return;
      this.fees.splice(i, 1);
    },
    hide(f) { f.mode = { daily: 'notUsed', monthly: 'notUsed', yearly: 'notUsed' }; },
    move(i, by) { const j = i + by; if (j < 0 || j >= this.fees.length) return; const l = [...this.fees]; [l[i], l[j]] = [l[j], l[i]]; this.fees = l; },
    drop(i) {
      const from = this.dragFrom; this.overAt = -1; this.dragFrom = -1;
      if (from < 0 || from === i) return;
      const l = [...this.fees], [x] = l.splice(from, 1); l.splice(i, 0, x); this.fees = l;
    },
    async save() {
      this.error = ''; this.okMsg = '';
      const bad = this.fees.find(f => this.problemOf(f));
      if (bad) { this.error = `Fix the fee names first: ${this.problemOf(bad)}`; return; }
      this.busy = true;
      try {
        await saveBookingFees(this.fees.map(f => ({ ...f, label: f.label.trim() })), this.before);
        await this.load();
        this.okMsg = 'Saved. Invoices downloaded from now on follow these settings; the booking form uses them the next time it opens.';
      } catch (e) { this.error = e.code === 'permission-denied' ? 'Saving was refused. You need the "Booking settings" access, and Firestore rules 1.02 must be published.' : `Could not save: ${e.message || e}`; }
      this.busy = false;
    }
  }
};
</script>

<style scoped>
.is-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
.is-head h2 { margin: 0; font-size: 17px; }
.is-foot { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 14px; }
.is-foot p { margin: 0; }
.is-head .help { max-width: 760px; }
.fs-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border); margin: -4px 0 10px; }
.fs-tabs button { border: 0; background: none; padding: 10px 16px; font: inherit; font-size: 15px; font-weight: 500; color: var(--text-2); border-bottom: 2px solid transparent; margin-bottom: -1px; cursor: pointer; }
.fs-tabs button.on { color: var(--accent); border-bottom-color: var(--accent); font-weight: 600; }
.fs-tabs button:not(.on):hover { color: var(--text); }
.fs-tabnote { margin: 0 0 8px; }
.fs-list { display: grid; }
.fs-row { display: grid; grid-template-columns: auto minmax(160px, 1fr) auto 64px 120px 170px 64px; gap: 14px; align-items: start; padding: 12px 4px; border-bottom: 1px solid var(--line); border-top: 2px solid transparent; }
.fs-headrow { padding: 4px 4px 8px; font-size: 11.5px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; align-items: end; }
.fs-row.over { border-top-color: var(--accent); }
.fs-row.off .fs-name input, .fs-row.off .fs-amt { color: var(--muted); }
.fs-pick { display: block; width: 100%; }
@media (max-width: 900px) { .fs-row { grid-template-columns: auto minmax(0, 1fr) auto; } .fs-headrow { display: none; } }
.fs-move { white-space: nowrap; padding-top: 8px; }
.fs-c { text-align: center; }
.grip { cursor: grab; color: var(--muted); font-size: 14px; letter-spacing: -2px; padding: 0 6px 0 2px; user-select: none; }
.mv { border: 1px solid var(--border); background: var(--surface); color: var(--text-2); width: 26px; height: 26px; border-radius: 6px; font-size: 10px; line-height: 1; margin-right: 2px; }
.mv:hover:not(:disabled) { color: var(--accent); border-color: var(--accent); }
.mv:disabled { opacity: .35; }
.fs-name { min-width: 0; }
.fs-name input { width: 100%; }
.fs-name small { display: block; margin-top: 4px; }
.mini-seg { display: inline-grid; grid-auto-flow: column; background: var(--chip); border-radius: 8px; padding: 3px; }
.mini-seg button { border: 0; background: none; height: 30px; padding: 0 10px; border-radius: 6px; font-size: 12.5px; font-weight: 500; color: var(--text-2); white-space: nowrap; }
.mini-seg button.on { background: var(--accent); color: #fff; font-weight: 600; }
.mini-seg button:not(.on):hover { color: var(--accent); }
.fs-c { text-align: center; }
.fs-tick { width: 18px; height: 18px; margin-top: 8px; accent-color: var(--accent); }
.fs-def { min-width: 150px; }
.fs-amt { width: 100%; }
.fs-per { display: flex; align-items: center; justify-content: space-between; gap: 6px; font-size: 12px; color: var(--text-2); margin-bottom: 4px; }
.fs-per .fs-amt { width: 90px; height: 32px; }
.fs-split { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--muted); margin-top: 6px; white-space: nowrap; }
.fs-split input { accent-color: var(--accent); }
.fs-pick :deep(.op-btn) { width: 100%; min-height: 38px; }
.fs-mode.m-intoRent :deep(.op-btn) { border-color: var(--accent); color: var(--accent); }
.fs-mode.m-notUsed :deep(.op-btn) { color: var(--muted); }
.fs-act { white-space: nowrap; padding-top: 10px; }
.rm { color: var(--danger); }
.input.bad { border-color: var(--danger); }
.bad-text { color: var(--danger); font-size: 12px; }
.fs-foot { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding-top: 14px; }
.fs-notes { margin-top: 10px; }
.fs-notes p { margin: 6px 0 0; }
</style>
