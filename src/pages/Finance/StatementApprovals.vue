<template>
  <main class="content">
    <div class="loading-bar" v-show="loading"></div>

    <div class="page-head">
      <div>
        <h1>Statement Approvals</h1>
        <div class="sub">Unit statements Finance has sent to you. Approving completes the statement and locks it.</div>
      </div>
      <div class="head-tools">
        <OptionPicker v-model="propertyId" :options="propertyOptions" label="Property" @change="refilter()" />
        <MonthPicker v-if="tab === 'history'" :ahead="1" v-model="month" @change="loadHistory()" />
      </div>
    </div>

    <div class="notice error" v-show="error">{{ error }}</div>
    <div class="notice ok" v-show="okMsg">{{ okMsg }}</div>

    <section class="kpis sa-kpis">
      <button type="button" class="card kpi kpi-link" :class="{ on: tab === 'waiting' }" @click="tab = 'waiting'"><div class="label">Waiting for you</div><div class="value" :class="{ alert: waiting.length }">{{ waiting.length }}</div><div class="hint">Sent by Finance</div></button>
      <div class="card kpi"><div class="label">Sent back</div><div class="value">{{ returnedCount == null ? '…' : returnedCount }}</div><div class="hint">With Finance to fix</div></div>
      <button type="button" class="card kpi kpi-link" :class="{ on: tab === 'history' }" @click="openHistory()"><div class="label">History</div><div class="value">{{ historyLoaded ? history.filter(h => h.status === 'approved').length : '—' }}</div><div class="hint">{{ historyLoaded ? `approved in ${monthName(month)}` : 'Open to see approved and sent back' }}</div></button>
    </section>

    <!-- Waiting, grouped by property and month -->
    <template v-if="tab === 'waiting'">
      <section class="card" v-if="!groups.length && !loading"><div class="empty">Nothing is waiting for approval.</div></section>
      <template v-for="g in groups" :key="g.key">
        <section class="card sa-group">
          <div class="card-head">
            <h2>{{ `${g.propertyName} · ${monthName(g.month)}` }} <span class="pill blue">{{ `${g.items.length} waiting` }}</span></h2>
            <button class="btn btn-primary" :disabled="busy" @click="askAll(g)">{{ `Approve all ${g.items.filter(x => !x.again).length}` }}</button>
          </div>
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th>Unit</th><th>Arrangement</th><th class="num">Total receivable</th><th class="num">Payout</th><th>Sent</th><th>Look at</th><th class="num"></th></tr></thead>
              <tbody>
                <template v-for="a in g.items" :key="a.id">
                  <tr class="clickable" @click="view(a)">
                    <td><b>{{ a.unitCode }}</b></td>
                    <td>{{ a.snapshot?.arrangementLabel || '—' }}</td>
                    <td class="num">{{ amt(a.snapshot?.totals?.totalReceivable) }}</td>
                    <td class="num" :class="a.payout < 0 ? 'neg-amt' : ''"><b>{{ amt(a.payout) }}</b></td>
                    <td>{{ `${a.submittedByName || 'Finance'} · ${stamp(a.submittedAt)}` }}</td>
                    <td><span class="pill red" v-if="a.payout < 0">Negative balance</span> <span class="pill amber" v-if="a.again">Revision after reopen</span></td>
                    <td class="num"><button class="editlink" @click.stop="view(a)">Review</button></td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
        </section>
      </template>
    </template>

    <!-- History for the picked month -->
    <template v-else>
      <section class="card">
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Unit</th><th>Property</th><th class="num">Payout</th><th>Result</th><th>When</th></tr></thead>
            <tbody>
              <template v-for="a in shownHistory" :key="a.id">
                <tr>
                  <td><b>{{ a.unitCode }}</b></td>
                  <td>{{ propertyName(a.propertyId) }}</td>
                  <td class="num">{{ amt(a.payout) }}</td>
                  <td><span class="pill" :class="a.status === 'approved' ? 'green' : 'amber'">{{ a.status === 'approved' ? `Approved by ${a.approvedByName || '—'}` : `Sent back: ${a.returnReason || ''}` }}</span></td>
                  <td>{{ stamp(a.status === 'approved' ? a.approvedAt : a.returnedAt) }}</td>
                </tr>
              </template>
              <tr v-show="!shownHistory.length"><td colspan="5" class="muted">{{ historyLoaded ? 'Nothing approved or sent back in this month.' : 'Loading…' }}</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>

    <!-- Review drawer: the frozen statement Finance sent -->
    <template v-if="sel">
      <div class="drawer-back" @click="close()"></div>
      <aside class="drawer wide" role="dialog" aria-label="Review statement" v-esc="close">
        <div class="drawer-head"><h2>{{ `${sel.unitCode} · ${monthName(sel.month)}` }}</h2><button class="icon-btn" @click="close()" aria-label="Close">×</button></div>
        <div class="drawer-body">
          <div class="notice error" v-show="drawerError">{{ drawerError }}</div>
          <p class="help" style="margin:0 0 12px">{{ `${propertyName(sel.propertyId)} · ${s.arrangementLabel || ''} · sent by ${sel.submittedByName || 'Finance'}, ${stamp(sel.submittedAt)}. These numbers are frozen.` }}</p>
          <div class="sa-sum">
            <div class="row"><span>{{ s.fixed ? 'Fixed rent' : 'Total receivable' }}</span><span>{{ amt(s.totals.totalReceivable) }}</span></div>
            <template v-if="!s.fixed">
              <div class="row sub"><span>{{ `Service fee (${pct(s.rates.serviceFeePct)})` }}</span><span>{{ amt(-s.totals.serviceFee) }}</span></div>
              <div class="row sub" v-show="s.rates.utilityFeePct"><span>{{ `Utilities (${pct(s.rates.utilityFeePct)})` }}</span><span>{{ amt(-s.totals.utilityFee) }}</span></div>
              <div class="row sub" v-show="s.rates.sstOnFeePct"><span>{{ `SST on fee (${pct(s.rates.sstOnFeePct)})` }}</span><span>{{ amt(-s.totals.sstOnFee) }}</span></div>
            </template>
            <template v-for="e in (s.expenseLines || [])" :key="e.expenseId"><div class="row sub"><span>{{ `${dmy(e.date)} · ${e.description}` }}</span><span>{{ amt(e.amount) }}</span></div></template>
            <div class="row total" :class="{ 'neg-amt': s.totals.payout < 0 }"><span>{{ s.totals.payout < 0 ? 'Payout (negative, carried forward)' : 'Payout to owner' }}</span><span>{{ 'RM ' + amt(s.totals.payout) }}</span></div>
          </div>
          <h3 class="t">{{ `Bookings · ${(s.lines || []).length}` }}</h3>
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th>Reservation</th><th>Source</th><th>Check-in</th><th>Check-out</th><th class="num">Nights</th><th class="num">Guest paid</th><th class="num">Owner share</th></tr></thead>
              <tbody>
                <template v-for="l in (s.lines || [])" :key="l.reservationNo">
                  <tr><td>{{ l.reservationNo }}</td><td>{{ l.source }}</td><td>{{ dmy(l.arrival) }}</td><td>{{ dmy(l.departure) }}</td><td class="num">{{ l.nights }}</td><td class="num">{{ amt(l.guestPaid) }}</td><td class="num"><b>{{ amt(l.pto) }}</b></td></tr>
                </template>
                <tr v-show="!(s.lines || []).length"><td colspan="7" class="muted">No bookings checked out this month.</td></tr>
              </tbody>
            </table>
          </div>
          <div class="confirm-box" v-show="returning">
            <div class="field"><label for="saWhy">Why is it sent back? <span style="color:#d92d20">*required</span></label><input class="input" id="saWhy" v-model="returnReason" placeholder="e.g. Cleaning fee looks wrong"></div>
          </div>
        </div>
        <div class="drawer-foot">
          <button class="btn" v-show="!returning" @click="startReturn()" :disabled="busy">Send back</button>
          <button class="btn" v-show="returning" @click="returning = false" :disabled="busy">Cancel</button>
          <button class="btn btn-primary" v-show="returning" @click="sendBack()" :disabled="busy || !returnReason.trim()">Send back to Finance</button>
          <button class="btn btn-primary" v-show="!returning" @click="approveOne()" :disabled="busy">{{ busy ? 'Approving…' : 'Approve' }}</button>
        </div>
      </aside>
    </template>
  </main>
</template>

<script>
import { collection, doc, getCountFromServer, getDoc, getDocs, query, where, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase.js';
import { loadProperties, audit, friendlyError } from '@/lib/finance-data.js';
import { completeStatement } from '@/lib/statement-approve.js';
import { monthEndFromSummaries } from '@/lib/summaries.js';
import { propertyMonth, canWriteSummaries } from '@/lib/summary-data.js';
import { paymentSummary } from '@/lib/engine.js';
import { notifyRole } from '@/services/notificationService.js';
import { amt, pct, dmy, stamp, monthName, monthOffset } from '@/lib/format.js';
import { useSession } from '@/stores/session.js';
import { askConfirm } from '@/lib/confirm.js';
import MonthPicker from '@/components/MonthPicker.vue';
import OptionPicker from '@/components/OptionPicker.vue';

const me = useSession();
const msOf = t => (t?.toMillis ? t.toMillis() : 0);

export default {
  components: { MonthPicker, OptionPicker },
  data() {
    return {
      amt, pct, dmy, stamp, monthName,
      tab: 'waiting', properties: [], propertyId: 'all', month: monthOffset(0),
      waiting: [], returnedCount: null, history: [], historyLoaded: false,
      loading: true, busy: false, error: '', okMsg: '',
      sel: null, drawerError: '', returning: false, returnReason: '', overrideReason: ''
    };
  },
  computed: {
    propertyOptions() { return [{ value: 'all', label: 'All properties' }, ...this.properties.map(p => ({ value: p.id, label: p.name }))]; },
    s() { return this.sel.snapshot; },
    shownHistory() {
      return this.history.filter(h => this.propertyId === 'all' || h.propertyId === this.propertyId)
        .sort((a, b) => msOf(b.approvedAt || b.returnedAt) - msOf(a.approvedAt || a.returnedAt));
    },
    // One group per property and month, oldest month first, so the Director clears the oldest first.
    groups() {
      const m = new Map();
      for (const a of this.waiting) {
        if (this.propertyId !== 'all' && a.propertyId !== this.propertyId) continue;
        const key = `${a.propertyId}|${a.month}`;
        if (!m.has(key)) m.set(key, { key, propertyId: a.propertyId, propertyName: this.propertyName(a.propertyId), month: a.month, items: [] });
        m.get(key).items.push(a);
      }
      return [...m.values()].map(g => ({ ...g, items: g.items.sort((x, y) => (x.unitCode || '').localeCompare(y.unitCode || '', undefined, { numeric: true })) }))
        .sort((x, y) => x.month.localeCompare(y.month) || x.propertyName.localeCompare(y.propertyName));
    }
  },
  async created() { await this.load(); },
  methods: {
    propertyName(id) { return this.properties.find(p => p.id === id)?.name || id; },
    refilter() { /* the lists are filtered by propertyId in the computed values */ },
    async load() {
      this.loading = true; this.error = '';
      try {
        this.properties = await loadProperties();
        const [w, rc] = await Promise.all([
          getDocs(query(collection(db, 'approvals'), where('status', '==', 'submitted'))),
          getCountFromServer(query(collection(db, 'approvals'), where('status', '==', 'returned'))).then(r => r.data().count).catch(() => null)
        ]);
        this.waiting = w.docs.map(d => ({ id: d.id, ...d.data() }));
        this.returnedCount = rc;
      } catch (e) { this.error = friendlyError(e, 'load the approvals'); }
      this.loading = false;
    },
    async openHistory() { this.tab = 'history'; if (!this.historyLoaded) await this.loadHistory(); },
    async loadHistory() {
      this.historyLoaded = false;
      try {
        const snap = await getDocs(query(collection(db, 'approvals'), where('month', '==', this.month)));
        this.history = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(a => a.status === 'approved' || a.status === 'returned');
      } catch (e) { this.error = friendlyError(e, 'load the history'); }
      this.historyLoaded = true;
    },
    view(a) { this.sel = a; this.drawerError = ''; this.returning = false; this.returnReason = ''; this.overrideReason = ''; },
    close() { if (!this.busy) this.sel = null; },
    startReturn() { this.returning = true; this.$nextTick(() => document.getElementById('saWhy')?.focus()); },

    // The month's units, who is done and the totals, the same way Month-end payout works them out.
    async monthContext(propertyId, month) {
      const ps = await getDoc(doc(db, 'properties', propertyId));
      const prop = { id: propertyId, ...(ps.exists() ? ps.data() : {}) };
      const pm = await propertyMonth(prop, month, { me, canWrite: canWriteSummaries(me), unitSummaries: true });
      const { rows } = monthEndFromSummaries(pm.units, month);
      return { unitIds: rows.map(r => r.unitId), doneIds: new Set(rows.filter(r => r.status === 'completed').map(r => r.unitId)),
        summary: paymentSummary(rows.map(r => ({ fixed: r.fixed, payout: r.totals.payout, totalReceivable: r.totals.totalReceivable }))) };
    },
    async approve(a, ctx, overrideReason = '') {
      const res = await completeStatement({ r: a.snapshot, propertyId: a.propertyId, month: a.month, me, unitIds: ctx.unitIds, doneIds: ctx.doneIds,
        summary: ctx.summary, overrideReason, approval: a });
      ctx.doneIds.add(a.unitId);
      this.waiting = this.waiting.filter(x => x.id !== a.id);
      this.history = this.history.filter(x => x.id !== a.id);
      if (a.month === this.month) this.history.push({ ...a, status: 'approved', approvedByName: me.name, approvedAt: null });
      return res;
    },
    async approveOne() {
      const a = this.sel; if (!a || this.busy) return;
      const ok = await askConfirm({ title: `Approve ${a.unitCode}?`,
        message: `This completes and locks ${a.unitCode} for ${monthName(a.month)}. Payout to owner: RM ${amt(a.payout)}.`, confirmText: 'Approve & complete' });
      if (!ok) return;
      this.busy = true; this.drawerError = '';
      try {
        const ctx = await this.monthContext(a.propertyId, a.month);
        await this.approve(a, ctx, this.overrideReason);
        this.okMsg = `${a.unitCode} approved and completed for ${monthName(a.month)}.`;
        this.sel = null;
      } catch (e) { this.drawerError = e.code ? friendlyError(e, 'approve the statement') : e.message; }
      this.busy = false;
    },
    async askAll(g) {
      const list = g.items.filter(x => !x.again);
      const skipped = g.items.length - list.length;
      if (!list.length) { this.error = 'Every statement here was reopened, so each needs its own reason. Open them one by one.'; return; }
      const ok = await askConfirm({ title: `Approve ${list.length} statements?`,
        message: `${g.propertyName} · ${monthName(g.month)}. Each one is completed and locked, and negative balances carry forward into next month.` + (skipped ? ` ${skipped} reopened statement${skipped === 1 ? '' : 's'} will be left for you to open one by one.` : ''),
        confirmText: `Approve ${list.length}` });
      if (!ok) return;
      this.busy = true; this.error = ''; this.okMsg = '';
      let done = 0;
      try {
        const ctx = await this.monthContext(g.propertyId, g.month);
        for (const a of list) { await this.approve(a, ctx); done++; }
        this.okMsg = `${done} statement${done === 1 ? '' : 's'} approved for ${g.propertyName} · ${monthName(g.month)}.`;
      } catch (e) {
        this.error = `${done} approved, then it stopped: ` + (e.code ? friendlyError(e, 'approve the statements') : e.message);
      }
      this.busy = false;
    },
    async sendBack() {
      const a = this.sel; if (!a || this.busy || !this.returnReason.trim()) return;
      this.busy = true; this.drawerError = '';
      try {
        const reason = this.returnReason.trim();
        const b = writeBatch(db);
        b.update(doc(db, 'approvals', a.id), { status: 'returned', returnReason: reason, returnedBy: me.user.uid, returnedByName: me.name, returnedAt: serverTimestamp() });
        audit(b, me, { action: 'statement.return', entity: `approvals/${a.id}`, propertyId: a.propertyId, month: a.month,
          changes: [{ field: 'status', old: 'submitted', new: 'returned' }], reason });
        await b.commit();
        notifyRole({ recipientRole: 'finance', title: 'Statement sent back', message: `${a.unitCode} · ${monthName(a.month)}: ${reason}`,
          type: 'statement', link: `/Finance/month-end?property=${a.propertyId}&month=${a.month}`, refId: a.id }).catch(e => console.warn('Finance notification not sent:', e));
        this.waiting = this.waiting.filter(x => x.id !== a.id);
        if (this.returnedCount != null) this.returnedCount++;
        this.okMsg = `${a.unitCode} sent back to Finance.`;
        this.sel = null;
      } catch (e) { this.drawerError = friendlyError(e, 'send the statement back'); }
      this.busy = false;
    }
  }
};
</script>

<style scoped>
.sa-kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.sa-group { margin-bottom: 16px; }
.sa-group .card-head h2 { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.sa-sum { margin-bottom: 18px; }
.sa-sum .row { display: flex; justify-content: space-between; gap: 12px; padding: 7px 0; border-bottom: 1px solid var(--line); font-size: 14px; }
.sa-sum .row.sub { color: var(--text-2); font-size: 13px; padding-left: 12px; }
.sa-sum .row.total { font-weight: 700; font-size: 15px; border-bottom: 0; }
h3.t { font-size: 14px; margin: 4px 0 8px; }
@media (max-width: 700px) { .sa-kpis { grid-template-columns: 1fr; } }
</style>
