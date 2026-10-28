<template>
  <main class="content">
    <div class="loading-bar" v-show="loading || busy"></div>

    <div class="page-head">
      <div :style="selOpen ? 'visibility:hidden' : ''">
        <h1>Month-end payout</h1>
        <div class="sub">{{ `${monthName(month)} · ${propertyName()} · owner statements by checkout month` }}</div>
      </div>
      <div class="head-tools">
        <span class="pill" :class="completed ? 'green' : (doneCount() ? 'blue' : 'grey')">{{ completed ? 'Completed' : (doneCount() ? `${doneCount()} of ${rows.length} completed` : 'Open') }}</span>
        <OptionPicker v-model="propertyId" :options="propertyOptions" label="Property" @change="load()" />
        <MonthPicker :ahead="1" v-model="month" @change="load()" />
      </div>
    </div>
    <div class="me-actions" v-show="!selOpen && propertyId">
      <span class="help">{{ completed ? `${monthName(month)} is completed. Statements are read-only.` : (checklist.length ? `${checklist.length} item${checklist.length === 1 ? '' : 's'} to fix before those units can be completed. Draft statements recalculate by themselves.` : 'All clear. Open each unit\'s statement to review it, then Approve & complete it.') }}</span>
      <RouterLink class="btn" :to="{ path: '/Finance/upload', query: { property: propertyId, month } }" v-show="!completed">Upload eZee report</RouterLink>
      <button class="btn" @click="downloadXlsx()" :disabled="!rows.length || busy">Download xlsx</button>
      <button class="btn" v-show="rows.some(r => r.fixed || r.arrangement === 'fixedRent')" @click="downloadFixedRent()" :disabled="busy">Fixed rent summary</button>
      <button class="btn" v-show="rows.some(r => r.fixed || r.arrangement === 'fixedRent')" @click="downloadFixedRent('pdf')" :disabled="busy">Fixed rent PDF</button>
    </div>

    <div class="notice error" v-show="error">{{ error }}</div>
    <div class="notice ok" v-show="okMsg">{{ okMsg }}</div>
    <div class="notice warn" v-show="!loading && !properties.length">No properties yet. Upload an eZee report first; it creates the property and its units.</div>

    <div v-show="!selOpen">
    <section class="kpis" v-show="rows.length">
      <button type="button" class="card kpi kpi-link" @click="kpiGo('all')"><div class="label">Total rental income</div><div class="value">{{ rm(summary.income) }}</div><div class="hint">{{ `${bookingCount()} bookings · ${rows.length} units` }}</div></button>
      <button type="button" class="card kpi kpi-link" @click="kpiGo('all')"><div class="label">Bal to pay owners</div><div class="value">{{ rm(summary.balToPay) }}</div><div class="hint">{{ `Fixed ${amt(summary.fixed)} · Profit sharing ${amt(summary.share)}` }}</div></button>
      <button type="button" class="card kpi kpi-link" :class="{ on: filter === 'negative' }" @click="kpiGo('negative')"><div class="label">Carried forward</div><div class="value" :class="summary.carried ? 'alert' : ''">{{ rm(summary.carried) }}</div><div class="hint">{{ `Negative balances go to ${monthName(nextMonth(month))}` }}</div></button>
      <button type="button" class="card kpi kpi-link" @click="kpiGo(null, 'checks')"><div class="label">Needs attention</div><div class="value" :class="checklist.length ? 'alert' : ''">{{ checklist.length }}</div><div class="hint">Must be zero to complete</div></button>
    </section>

    <div class="toolbar" v-show="rows.length" ref="list">
      <input class="input" type="search" placeholder="Search unit" v-model="search" aria-label="Search unit">
      <div class="pills">
        <template v-for="f in filters" :key="f.key">
          <button class="pill-btn" :class="{ on: filter === f.key }" @click="filter = f.key">{{ `${f.label} (${rows.filter(r => match(r, f.key)).length})` }}</button>
        </template>
      </div>
    </div>

    <section class="card" v-show="rows.length">
      <div class="card-head"><h2>{{ `Statements · ${monthName(month)} · ${rows.length} units` }}</h2></div>
    <Paged :items="shown()" v-slot="{ pageRows }">
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>Unit</th><th>Arrangement</th><th class="num">Bookings</th><th class="num">Income</th>
          <th class="num">Fees & expenses</th><th class="num">Payout</th><th>Status</th><th></th></tr></thead>
        <tbody>
          <template v-for="r in pageRows" :key="r.unitId">
            <tr class="clickable" @click="open(r)">
              <td><b>{{ r.unitCode }}</b></td>
              <td>{{ r.arrangementLabel }}</td>
              <td class="num">{{ r.bookingCount }}</td>
              <td class="num">{{ amt(r.totals.totalReceivable) }}</td>
              <td class="num">{{ amt(r.fixed ? r.totals.reimburse - r.totals.deduction : -(r.totals.serviceFee + r.totals.utilityFee + r.totals.sstOnFee) + r.totals.totalExpenses) }}</td>
              <td class="num" :class="r.totals.payout < 0 ? 'neg-amt' : ''"><b>{{ amt(r.totals.payout) }}</b></td>
              <td class="st-cell"><span class="pill" :class="r.status === 'completed' ? 'green' : 'grey'">{{ r.status === 'completed' ? 'Completed' : 'Open' }}</span><span class="pill" :class="STATUS[r.status][1]" v-if="r.status !== 'completed' && r.status !== 'draft'">{{ STATUS[r.status][0] }}</span></td>
              <td class="num"><button class="editlink" @click.stop="open(r)">{{ r.status === 'completed' ? 'View' : 'Edit' }}</button></td>
            </tr>
          </template>
        </tbody>
        <tfoot><tr><td colspan="3">Total</td><td class="num">{{ amt(summary.income) }}</td><td></td><td class="num">{{ amt(rows.reduce((s, r) => s + r.totals.payout, 0)) }}</td><td></td><td></td></tr></tfoot>
      </table>
    </div>
    </Paged>
    </section>
    <div class="empty card" style="margin-top:16px" v-show="!loading && propertyId && !rows.length">No bookings or fixed-rent units for this month. Upload the eZee report for it first.</div>
    <div class="grid-2" style="margin-top:24px" v-show="!loading && propertyId">
      <section class="card" ref="checks">
        <div class="card-head"><h2>Before you can complete</h2>
          <button class="btn btn-sm starter-btn" v-if="starterAvailable()" @click="starterAsk = !starterAsk" :aria-expanded="starterAsk"
            title="Fill in the D'Majestic units that aren't set up">⚡ Starter settings</button></div>
        <!-- Starter settings: a slim confirm strip instead of a big box -->
        <div class="starter-strip" v-if="starterAvailable() && starterAsk">
          <span>Set arrangement and fixed rent for the D'Majestic units that aren't set up (Finance's Sep 2026 set-up), from <b>{{ monthName(month) }}</b>. You can edit any unit afterwards.</span>
          <span class="starter-acts"><button class="btn btn-sm" @click="starterAsk = false">Cancel</button><button class="btn btn-sm btn-primary" @click="loadStarter(); starterAsk = false" :disabled="busy">Load</button></span>
        </div>
        <div class="rows">
          <Paged :items="checklist" :size="5" v-slot="{ pageRows }">
          <template v-for="(c, i) in pageRows" :key="c.text + i">
            <div class="row"><span>{{ c.text }}</span>
              <button class="btn" v-show="!!c.label" @click="c.action()">{{ c.label }}</button></div>
          </template>
          </Paged>
          <div class="empty" v-show="!checklist.length && !completed">All clear. Open each unit's statement, then Approve & complete it.</div>
          <div class="empty" v-show="completed">Month completed. Statements are read-only.</div>
        </div>
      </section>

      <section class="card">
        <div class="card-head"><h2>Payment to owner</h2></div>
        <div class="rows">
          <div class="row"><span>Total rental income</span><span class="r">{{ amt(summary.income) }}</span></div>
          <div class="row"><span>Fixed rent</span><span class="r">{{ amt(summary.fixed) }}</span></div>
          <div class="row"><span>Profit sharing</span><span class="r">{{ amt(summary.share) }}</span></div>
          <div class="row"><b>Bal to pay (positive balances only)</b><b class="r">{{ amt(summary.balToPay) }}</b></div>
          <div class="row"><span>Units completed</span><span class="r">{{ `${doneCount()} of ${rows.length}` }}</span></div>
        </div>
        <p class="help" style="margin-top:14px">{{ `${doneCount()} of ${rows.length} unit statements completed. Each unit is approved & completed on its own statement page.` }}</p>
      </section>
    </div>


    </div>

    <!-- Unit statement page (Figma 7:197) -->
    <template v-if="selOpen">
      <div class="stmt-page" v-esc="() => { selOpen = false }">
        <button class="navlink" style="margin-bottom:14px" @click="selOpen = false">← Back to Month-end payout</button>
        <div class="page-head" style="margin-bottom:16px">
          <div><h1 style="font-size:24px">{{ `${sel.unitCode} · ${monthName(month)}` }}</h1>
            <div class="sub">{{ sel.arrangementLabel + (sel.fixed ? ` · RM ${amt(sel.rates.fixedRentAmount)} a month` : ` · service ${pct(sel.rates.serviceFeePct)}, utility ${pct(sel.rates.utilityFeePct)}` + (sel.rates.sstOnFeePct ? `, SST on fee ${pct(sel.rates.sstOnFeePct)}` : '')) }}</div></div>
          <div class="head-tools">
            <span class="pill" :class="STATUS[sel.status][1]">{{ STATUS[sel.status][0] }}</span>
            <button class="btn" v-show="sel.status !== 'completed'" @click="openSettings(unitById(sel.unitId))">Unit settings</button>
            <button class="btn" @click="downloadStatement()" :disabled="busy">Download xlsx</button>
            <button class="btn" @click="downloadStatement('pdf')" :disabled="busy">Download PDF</button>
          </div>
        </div>
        <div class="notice warn" v-show="sel.lines.some(l => l.estimated)">{{ `${sel.lines.filter(l => l.estimated).length} Trip.com booking${sel.lines.filter(l => l.estimated).length === 1 ? ' is' : 's are'} estimated at 15%. Type the amount Trip.com paid on the booking line to finish this statement.` }}</div>
        <div class="side-grid stmt-grid">
        <section class="card" style="min-width:0">
          <div>
            <div class="notice warn" v-show="sel.status === 'notSetUp'">This unit isn't set up, so 20% service fee is assumed. Open Unit settings to set its arrangement.</div>
            <div class="card-head"><h2>{{ (sel.fixed ? 'Bookings (kept by Widebed, shown for audit)' : 'Bookings') + ` · ${sel.lines.length}` }}</h2></div>
            <div class="table-wrap">
              <table class="table">
                <thead><tr><th>Reservation</th><th>Source</th><th>Check-in</th><th>Check-out</th><th class="num">Nights</th><th class="num">Guest paid</th><th class="num">Platform cut</th><th class="num">Owner share</th><th class="num" v-show="sel.lines.some(l => l.financeAmount != null)" title="Finance's amount for this booking, from their completed statement">Finance</th><th>Status</th></tr></thead>
                <tbody>
                  <template v-for="l in sel.lines" :key="l.reservationNo">
                    <tr :class="{ est: l.estimated }">
                      <td><span>{{ l.reservationNo }}</span><div class="tag-est" v-show="l.note && !l.estimated" :title="l.note">{{ l.note }}</div></td>
                      <td>{{ l.source }}</td>
                      <td>{{ dmy(l.arrival) }}</td><td>{{ dmy(l.departure) }}</td>
                      <td class="num">{{ l.nights }}</td>
                      <td class="num">
                        <template v-if="l.otaKey === 'ctrip' && sel.status !== 'completed' && !l.final">
                          <span class="ctrip-in"><input class="input" type="number" step="0.01" :placeholder="l.estimated ? 'RM amount' : amt(l.guestPaid)" v-model="ctripInput[l.reservationNo]" aria-label="Trip.com amount" @keyup.enter="saveCtrip(l)">
                            <button class="btn" @click="saveCtrip(l)" :disabled="busy || !ctripInput[l.reservationNo]">Save</button></span>
                        </template>
                        <span v-show="!(l.otaKey === 'ctrip' && sel.status !== 'completed' && !l.final)">{{ amt(l.guestPaid) }}</span>
                      </td>
                      <td class="num muted">{{ l.platform == null ? '' : amt(-l.platform) }}</td>
                      <td class="num"><b>{{ amt(l.pto) }}</b></td>
                      <td class="num" v-show="sel.lines.some(l => l.financeAmount != null)" :class="{ 'neg-amt': l.financeAmount != null && Math.abs(l.financeAmount - l.pto) >= 0.05 }">{{ amt(l.financeAmount) }}</td>
                      <td><span class="pill" :class="l.estimated ? 'amber' : (l.edited ? 'blue' : 'green')">{{ l.estimated ? 'Estimated' : (l.edited ? 'Edited' : (l.final ? 'Final' : 'Entered')) }}</span></td>
                    </tr>
                  </template>
                  <tr v-show="!sel.lines.length"><td colspan="10" class="muted">No bookings checked out this month.</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>
        <section class="card">
          <div class="card-head"><h2>Statement summary</h2></div>
            <div class="stmt-lines">
              <template v-if="!sel.fixed">
                <div>
                  <div class="row"><span>Total receivable</span><span>{{ amt(sel.totals.totalReceivable) }}</span></div>
                  <div class="row sub"><span>{{ `Service fee (${pct(sel.rates.serviceFeePct)})` }}</span><span>{{ amt(-sel.totals.serviceFee) }}</span></div>
                  <div class="row sub" v-show="sel.rates.utilityFeePct"><span>{{ `Utilities (${pct(sel.rates.utilityFeePct)})` }}</span><span>{{ amt(-sel.totals.utilityFee) }}</span></div>
                  <div class="row sub" v-show="sel.rates.sstOnFeePct"><span>{{ `SST on fee (${pct(sel.rates.sstOnFeePct)})` }}</span><span>{{ amt(-sel.totals.sstOnFee) }}</span></div>
                  <div class="row"><span>Owner's entitlement</span><span>{{ amt(sel.totals.entitlement) }}</span></div>
                </div>
              </template>
              <template v-if="sel.fixed">
                <div class="row"><span>Fixed rent</span><span>{{ amt(sel.totals.totalReceivable) }}</span></div>
              </template>
              <div class="stmt-label"><span>Expenses & reimbursements</span><RouterLink class="navlink" :to="{ path: '/Finance/expenses', query: { property: propertyId, month } }">View all →</RouterLink></div>
              <template v-for="e in sel.expenseLines" :key="e.expenseId">
                <div class="row sub"><span>{{ `${dmy(e.date)} · ${e.description}` }}</span><span>{{ amt(e.amount) }}</span></div>
              </template>
              <div class="row sub" v-show="!sel.expenseLines.length"><span>No expenses or reimbursements</span><span></span></div>
              <template v-if="!sel.fixed">
                <div>
                  <div class="row"><span>Nett receivable</span><span>{{ amt(sel.totals.netReceivable) }}</span></div>
                  <div class="row sub"><span>Rounding adjust (to RM 0.05)</span><span>{{ amt(sel.totals.roundingAdjust) }}</span></div>
                </div>
              </template>
              <div class="row total" :class="{ 'neg-amt': sel.totals.payout < 0 }"><span>{{ sel.totals.payout < 0 ? 'Payout (negative, carried forward)' : 'Payout to owner' }}</span><span>{{ 'RM ' + amt(sel.totals.payout) }}</span></div>
            </div>
            <p class="help" v-show="sel.status !== 'completed'" style="margin-top:14px">Add expenses on the <RouterLink class="link" :to="{ path: '/Finance/expenses', query: { property: propertyId, month, add: 1 } }">Expenses page</RouterLink>.</p>
          <!-- Approve & complete is per unit (Khairul, Oct 2026) -->
          <div class="unit-done" v-if="sel.status === 'completed'">
            <p class="help" style="margin:14px 0 10px">{{ `Completed${sel.completedByName ? ' by ' + sel.completedByName : ''}${sel.revision > 1 ? ` · revision ${sel.revision}` : ''}. This statement is read-only.` }}</p>
            <button class="btn" v-show="role === 'director' && !reopening" @click="reopening = true" :disabled="busy">Reopen statement (Director)</button>
          </div>
          <div class="actions" style="margin-top:14px" v-else>
            <div class="rows" style="width:100%" v-show="blockers(sel).length">
              <template v-for="(c, i) in blockers(sel)" :key="i"><div class="row"><span class="neg-amt">{{ c.text }}</span></div></template>
            </div>
            <button class="btn btn-primary" v-show="!confirming" @click="askComplete()" :disabled="busy || blockers(sel).length > 0">Approve & complete</button>
          </div>
          <template v-if="confirming && sel.status !== 'completed'">
            <div class="confirm-box" id="completeBox" ref="completeBox">
              <b>{{ `Complete ${sel.unitCode} for ${monthName(month)}?` }}</b>
              <p class="help" style="margin:4px 0 10px">{{ `The statement becomes read-only. Payout RM ${amt(sel.totals.payout)}.` + (sel.totals.payout < 0 ? ` The negative balance carries forward to ${monthName(nextMonth(month))}.` : '') }}</p>
              <template v-if="reopened(sel)"><div class="field"><label>Reason for the new revision (Director Override)</label><input class="input" v-model="overrideReason"></div></template>
              <div class="actions"><button class="btn btn-primary" @click="complete()" :disabled="busy">Yes, complete</button><button class="btn" @click="confirming = false">Cancel</button></div>
            </div>
          </template>
          <template v-if="reopening && sel.status === 'completed'">
            <div class="confirm-box">
              <b>{{ `Reopen ${sel.unitCode}?` }}</b>
              <p class="help" style="margin:4px 0 10px">The statement stays saved. Completing again saves a new revision and keeps the old one. Its brought-forward line in the next month is removed.</p>
              <div class="field"><label>Reason (audit log)</label><input class="input" v-model="overrideReason"></div>
              <div class="actions"><button class="btn btn-primary" @click="reopen()" :disabled="busy || !overrideReason.trim()">Reopen</button><button class="btn" @click="reopening = false">Cancel</button></div>
            </div>
          </template>
        </section>
        </div>
        <section class="card" style="margin-top:20px">
            <div class="card-head"><h2>Monthly payout summary <span class="help">{{ month.slice(0, 4) }}</span></h2></div>
            <div class="table-wrap">
              <table class="table payout-strip">
                <thead><tr><template v-for="m in yearMonths()" :key="m"><th class="num">{{ SHORT[+m.slice(5) - 1] }}</th></template></tr></thead>
                <tbody><tr><template v-for="m in yearMonths()" :key="m">
                  <td class="num" :class="{ 'neg-amt': (payoutFor(sel, m)?.value ?? 0) < 0, muted: payoutFor(sel, m)?.draft }"
                      :title="payoutFor(sel, m)?.label || ''">{{ payoutFor(sel, m) ? amt(payoutFor(sel, m).value) : '' }}</td>
                </template></tr></tbody>
              </table>
            </div>
            <p class="help" style="margin-top:6px">Past months come from completed months in the PMS, or from Finance's statements uploaded on Upload eZee report. Hover a number to see where it came from.</p>
        </section>
      </div>
    </template>

    <!-- Unit settings panel -->
    <template v-if="settingsOpen">
      <div>
        <div class="drawer-back" style="z-index:50" @click="settingsOpen = false"></div>
        <aside class="drawer" style="z-index:51" role="dialog" aria-label="Unit settings" v-esc="() => { settingsOpen = false }">
          <div class="drawer-head"><h2>{{ `Unit settings · ${set.unitCode}` }}</h2><button class="icon-btn" @click="settingsOpen = false" aria-label="Close">×</button></div>
          <form class="drawer-body" id="setForm" @submit.prevent="saveSettings()">
            <div class="notice error" v-show="set.error">{{ set.error }}</div>
            <div class="field">
              <label for="sArr">Arrangement</label>
              <select class="input" id="sArr" v-model="set.arrangement">
                <template v-for="(a, k) in ARRANGEMENTS" :key="k"><option :value="k" :selected="k === set.arrangement">{{ a.label }}</option></template>
              </select>
            </div>
            <div class="field" v-show="set.arrangement === 'fixedRent'"><label for="sFix">Fixed rent a month (RM)</label><input class="input" id="sFix" type="number" step="0.01" v-model="set.fixedRentAmount"></div>
            <template v-if="set.arrangement !== 'fixedRent'">
              <div>
                <p class="help" style="margin-top:0">Leave a % blank to use the arrangement's normal rate (shown greyed).</p>
                <div class="grid-fields">
                  <div class="field"><label>Service fee %</label><input class="input" type="number" step="0.01" v-model="set.serviceFeePct" :placeholder="ARRANGEMENTS[set.arrangement].serviceFeePct * 100"></div>
                  <div class="field"><label>Utility fee %</label><input class="input" type="number" step="0.01" v-model="set.utilityFeePct" :placeholder="ARRANGEMENTS[set.arrangement].utilityFeePct * 100"></div>
                  <div class="field"><label>SST on fee %</label><input class="input" type="number" step="0.01" v-model="set.sstOnFeePct" :placeholder="ARRANGEMENTS[set.arrangement].sstOnFeePct * 100"></div>
                </div>
              </div>
            </template>
            <div class="field">
              <label for="sFrom">Applies from</label>
              <select class="input" id="sFrom" v-model="set.effectiveFrom">
                <template v-for="m in months" :key="m"><option :value="m" :selected="m === set.effectiveFrom">{{ monthName(m) }}</option></template>
              </select>
            </div>
            <div class="field"><label for="sWhy">Reason (audit log)</label><textarea class="input" id="sWhy" v-model="set.reason" placeholder="e.g. New owner agreement from June"></textarea></div>
            <hr class="divider">
            <h3 style="margin:0 0 6px;font-size:14px">History</h3>
            <div class="rows">
              <template v-for="h in set.history" :key="h.id">
                <div class="row"><span>{{ `From ${monthName(h.effectiveFrom)} · ${ARRANGEMENTS[h.arrangement]?.label || h.arrangement}` + (h.fixedRentAmount ? ` RM ${amt(h.fixedRentAmount)}` : '') }}</span><span class="r help">{{ h.createdByName || '' }}</span></div>
              </template>
              <div class="empty" v-show="!set.history.length">Not set up yet.</div>
            </div>
          </form>
          <div class="drawer-foot">
            <button class="btn" @click="settingsOpen = false">Cancel</button>
            <button class="btn btn-primary" type="submit" form="setForm" :disabled="busy">Save settings</button>
          </div>
        </aside>
      </div>
    </template>
  </main>
</template>

<script>
import { collection, doc, getDoc, getDocFromCache, getDocs, setDoc, writeBatch, serverTimestamp, query, where }
  from 'firebase/firestore';
import { db } from '@/lib/firebase.js';
import { toast } from '@/lib/toast.js';
import { ARRANGEMENTS, DM_STARTER, paymentSummary, byUnit, nextMonth, r2 } from '@/lib/engine.js';
import { loadProperties, loadSetup, loadBookings, loadExpenses, audit, friendlyError, download, loadXlsxLib, statementId, monthSummary } from '@/lib/finance-data.js';
import { draftRecord, monthEndFromSummaries, ALL_MONTHS } from '@/lib/summaries.js';
import { propertyMonth, readUnit, markDirty, markFrom, canWriteSummaries } from '@/lib/summary-data.js';
import { rm, amt, pct, dmy, monthName, monthOffset } from '@/lib/format.js';
import { useSession } from '@/stores/session.js';
import { lastProperty, rememberProperty } from '@/lib/last-property.js';
import { buildStatementXlsx, buildFixedRentXlsx, loadStatementTemplate, FIXED_RENT_TEMPLATE_URL } from '@/lib/statement-xlsx.js';
import { buildStatementPdf, buildFixedRentPdf, loadPdfKit } from '@/lib/statement-pdf.js';

const me = useSession();

const STATUS = { draft: ['Draft', 'grey'], fixed: ['Fixed rent', 'blue'], negative: ['Negative', 'red'], estimated: ['Estimated', 'amber'],
  notSetUp: ['Not set up', 'amber'], completed: ['Completed', 'green'] };
let params = new URLSearchParams(location.search);
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SOURCE = { pms: 'Completed in the PMS', finance: "Finance's statement (Payment To Owner)", summary: "Finance's statement (unit sheet summary)" };
const pctIn = v => (v === '' || v == null ? null : Number(v) / 100);
const pctOut = v => (v == null ? '' : +(v * 100).toFixed(4));

// The statement record (saved on completion, shown either way) is statementRecord in lib/summaries.js.
// The list comes from the unit month summaries; a unit's bookings are read only when its statement is opened.
const msOf = t => (t?.toMillis ? t.toMillis() : (t?.seconds != null ? t.seconds * 1000 : null));

import OptionPicker from '@/components/OptionPicker.vue';
import MonthPicker from '@/components/MonthPicker.vue';
export default {
  components: { OptionPicker, MonthPicker },
  beforeCreate() { params = new URLSearchParams(location.search); },
  data() {
    return {
      starterAsk: false,
      STATUS, ARRANGEMENTS, SHORT, rm, amt, pct, dmy, monthName, nextMonth,
      role: me.role,
      properties: [], propertyId: params.get('property') || lastProperty(), month: params.get('month') || monthOffset(-1),
      months: Array.from({ length: 13 }, (_, i) => monthOffset(1 - i)),
      prop: null, ums: [], unitFull: {}, rateVersions: null, payHistory: {},
      rows: [], checklist: [], summary: { income: 0, fixed: 0, share: 0, balToPay: 0, carried: 0 },
      completed: false,
      loading: true, busy: false, error: '', okMsg: '',
      search: '', filter: 'all',
      filters: [{ key: 'all', label: 'All' }, { key: 'open', label: 'Open' }, { key: 'done', label: 'Completed' }, { key: 'attention', label: 'Needs attention' }, { key: 'negative', label: 'Negative' },
        { key: 'fixed', label: 'Fixed rent' }, { key: 'share', label: 'Profit share' }],
      toast, sel: null, selOpen: false, ctripInput: {},
      settingsOpen: false, set: {}, confirming: false, reopening: false, overrideReason: ''
    };
  },
  // Remember the property for the next page (see lib/last-property.js)
  watch: { propertyId(v) { rememberProperty(v); } },
  async mounted() {
    try {
      this.properties = await loadProperties();
      if (!this.properties.some(p => p.id === this.propertyId)) this.propertyId = this.properties[0]?.id || '';
      if (!this.months.includes(this.month)) this.months.push(this.month);
      this.months.sort().reverse();
      await this.load();
    } catch (e) { this.error = friendlyError(e, 'load the page'); this.loading = false; }
  },
  computed: {
    propertyOptions() { return [...this.properties.map(p => ({ value: p.id, label: p.name }))]; }
  },
  methods: {
    // Summary cards: set the list's filter (if any) and scroll to it.
    kpiGo(key, ref = 'list') { if (key) this.filter = key; this.$nextTick(() => this.$refs[ref]?.scrollIntoView({ behavior: 'smooth', block: 'start' })); },
    propertyName() { return this.properties.find(p => p.id === this.propertyId)?.name || ''; },
    property() { return this.properties.find(p => p.id === this.propertyId) || {}; },

    async load() {
      if (!this.propertyId) { this.loading = false; return; }
      this.loading = true; this.error = ''; this.selOpen = false; this.confirming = false; this.reopening = false;
      try {
        // The property is read again here: its counters say which summaries are stale, and this page changes them.
        const ps = await getDoc(doc(db, 'properties', this.propertyId));
        this.prop = { id: this.propertyId, ...(ps.exists() ? ps.data() : {}) };
        const pm = await propertyMonth(this.prop, this.month, { me, canWrite: canWriteSummaries(me), unitSummaries: true });
        this.ums = pm.units; this.unitFull = {}; this.rateVersions = null; this.payHistory = {};
        this.compute();
      } catch (e) { this.error = friendlyError(e, 'load the month'); }
      this.loading = false;
    },

    // Drafts are worked out by the engine (summaries.js keeps the result per unit, and works it out again when a unit's
    // data changes). Completion is per unit: a completed unit shows what was saved. A reopened unit is a draft again.
    compute() {
      const { rows, drafts, doneCount, activeCount, noUnit } = monthEndFromSummaries(this.ums, this.month);
      this.rows = rows;
      this.completed = this.rows.length > 0 && !drafts.length;
      // Each item names its unit; items with no unit (nothing uploaded, a room not recognised) hold back every unit.
      const c = [];
      if (!activeCount && !doneCount) c.push({ unitId: null, text: `No bookings for ${monthName(this.month)} yet. Upload the eZee report first.`, label: 'Upload', action: () => this.$router.push('/Finance/upload') });
      for (const b of noUnit) c.push({ unitId: null, text: `${b.reservationNo}: room "${b.roomRaw}" not recognised` });
      for (const r of drafts.filter(r => r.status === 'notSetUp')) c.push({ unitId: r.unitId, text: `${r.unitCode}: not set up (no arrangement)`, label: 'Set up', action: () => this.openSettings(this.unitById(r.unitId)) });
      for (const r of drafts.filter(r => !r.fixed)) for (const no of r.estimatedLines)
        c.push({ unitId: r.unitId, text: `${r.unitCode}: Ctrip ${no} needs the Trip.com amount`, label: 'Open', action: () => this.open(r) });
      this.checklist = c;
      this.summary = paymentSummary(this.rows.map(r => ({ fixed: r.fixed, payout: r.totals.payout, totalReceivable: r.totals.totalReceivable })));
      if (this.sel) { const again = this.rows.find(r => r.unitId === this.sel.unitId) && this.fullRecord(this.sel.unitId); if (again) this.sel = again; else this.selOpen = false; }
    },
    // ---- one unit's full data (its statement page) ----
    async loadUnitFull(unitId) {
      if (this.unitFull[unitId]) return this.unitFull[unitId];
      const um = this.ums.find(u => u.unitId === unitId);
      const d = await readUnit(this.propertyId, this.month, unitId, this.rateVersions, um?.row?.status === 'completed' ? (ref => this.cachedStatement(ref, um)) : null);
      this.rateVersions = d.rateVersions;
      const ph = await getDocs(query(collection(db, 'payoutHistory'), where('unitId', '==', unitId), where('year', '==', this.month.slice(0, 4))));
      ph.docs.forEach(x => { if (x.data().propertyId === this.propertyId) this.payHistory[x.id] = x.data(); });
      this.unitFull[unitId] = d;
      return d;
    },
    // A completed statement never changes except by a Director reopen, so the copy saved in this browser is used
    // when it matches the unit's summary (same status, revision and completion time); otherwise it is read again.
    async cachedStatement(ref, um) {
      try {
        const c = await getDocFromCache(ref);
        const s = c.exists() ? c.data() : null, m = um.statement || {};
        if (s && s.status === 'completed' && m.status === 'completed' && s.revision === m.revision && msOf(s.completedAt) === m.completedAtMs) return c;
      } catch (_) { /* not saved in this browser */ }
      return getDoc(ref);
    },
    // The unit's statement as Month-end payout shows it: the saved one when completed, otherwise the engine's draft.
    fullRecord(unitId) {
      const d = this.unitFull[unitId];
      if (!d) return null;
      if (d.statement?.status === 'completed') return { ...d.statement, status: 'completed' };
      return draftRecord({ propertyId: this.propertyId, month: this.month, unitId, unit: d.unit, propertyRates: d.propertyRates, bookings: d.bookings, expenses: d.expenses });
    },
    // Every row with its booking and expense lines (Download xlsx): the whole month is read, as before.
    async fullRows() {
      const [setup, bookings, expenses, st, ph] = await Promise.all([
        loadSetup(this.propertyId, this.month), loadBookings(this.propertyId, this.month), loadExpenses(this.propertyId, this.month),
        getDocs(query(collection(db, 'statements'), where('propertyId', '==', this.propertyId), where('month', '==', this.month))),
        getDocs(query(collection(db, 'payoutHistory'), where('propertyId', '==', this.propertyId), where('year', '==', this.month.slice(0, 4))))
      ]);
      ph.docs.forEach(d => { this.payHistory[d.id] = d.data(); });
      const done = st.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => s.status === 'completed');
      const doneIds = new Set(done.map(s => s.unitId));
      const units = setup.units.filter(u => !doneIds.has(u.id));
      const active = bookings.filter(b => b.status !== 'cancelled');
      const missing = [];
      for (const b of active) if (b.unitId && !doneIds.has(b.unitId) && !units.some(u => u.id === b.unitId) && !missing.includes(b.unitId)) missing.push(b.unitId);
      const drafts = [...units.map(u => u.id), ...missing].map(id => draftRecord({ propertyId: this.propertyId, month: this.month, unitId: id,
        unit: units.find(u => u.id === id) || null, propertyRates: setup.rates, bookings: bookings.filter(b => b.unitId === id), expenses: expenses.filter(e => e.unitId === id) })).filter(Boolean);
      return [...drafts, ...done.map(s => ({ ...s, status: 'completed' }))].sort((a, b) => byUnit(a.unitCode, b.unitCode));
    },
    // ---- Monthly payout summary (like the strip at the bottom of Finance's unit sheets) ----
    yearMonths() { const y = this.month.slice(0, 4); return SHORT.map((_, i) => `${y}-${String(i + 1).padStart(2, '0')}`); },
    // Finance's FIXED RENT sheet for the property: every fixed-rent unit, its deductions, reimbursements and remark.
    // kind: 'xlsx' or 'pdf' (lib/statement-pdf.js: Finance's PDF of the same sheet)
    async downloadFixedRent(kind = 'xlsx') {
      this.busy = true;
      try {
        const pdf = kind === 'pdf';
        const [X, tpl, rows] = await Promise.all([pdf ? loadPdfKit() : loadXlsxLib(), pdf ? null : loadStatementTemplate(FIXED_RENT_TEMPLATE_URL), this.fullRows()]);
        const units = rows.filter(r => r.fixed).map(r => ({
          unitCode: r.unitCode, rent: r.totals.totalReceivable,
          deductions: r.expenseLines.filter(e => e.amount < 0).map(e => -e.amount),
          reimburse: r.expenseLines.filter(e => e.amount > 0).map(e => e.amount),
          remark: r.expenseLines.map(e => e.description).filter(Boolean).join(' + ')
        }));
        const f = { propertyName: this.property().name || this.propertyName(), month: this.month, units };
        const bytes = pdf ? await buildFixedRentPdf(X.lib, X.fontkit, X.fonts, f) : buildFixedRentXlsx(X, tpl, f);
        const [y, m] = this.month.split('-');
        download(`${this.property().code || this.propertyId} ${SHORT[+m - 1]}${y.slice(2)} Fixed Rent Summary${this.completed ? '' : ' (draft)'}.${kind}`,
          new Blob([bytes], { type: pdf ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      } catch (e) { this.error = e.code ? friendlyError(e, 'make the fixed rent summary') : e.message; }
      this.busy = false;
    },
    // The unit's statement as Finance's xlsx (lib/statement-xlsx.js: their "D 0719" sheet, only names and numbers change).
    async downloadStatement(kind = 'xlsx') {
      const s = this.sel;
      if (s.fixed) { await this.downloadFixedRent(kind); return; }   // Finance's fixed-rent statement is one sheet for the property
      this.busy = true;
      try {
        const pdf = kind === 'pdf';
        const [X, tpl, nb] = await Promise.all([pdf ? loadPdfKit() : loadXlsxLib(), pdf ? null : loadStatementTemplate(),
          getDocs(query(collection(db, 'bookings'), where('unitId', '==', s.unitId), where('departureMonth', '==', nextMonth(this.month)))).catch(() => ({ docs: [] }))]);
        // Next booking: the unit's first stay that checks out next month (eZee upload for that month needed)
        const next = nb.docs.map(d => d.data()).filter(b => b.propertyId === this.propertyId && b.status !== 'cancelled' && b.arrival)
          .sort((a, b) => a.arrival.localeCompare(b.arrival))[0] || null;
        const payouts = {};
        for (const m of this.yearMonths()) { const p = this.payoutFor(s, m); if (p) payouts[m] = p.value; }
        const data = {
          unitCode: s.unitCode, month: this.month, rates: s.rates, payout: s.totals.payout, payouts,
          lines: s.lines.map(l => ({ source: l.source, arrival: l.arrival, departure: l.departure, nights: l.nights, amount: l.pto })),
          expenses: s.expenseLines.map(e => ({ description: e.description, amount: e.amount })),
          nextBooking: next && { arrival: next.arrival, departure: next.departure }
        };
        const bytes = pdf ? await buildStatementPdf(X.lib, X.fontkit, X.fonts, data) : buildStatementXlsx(X, tpl, data);
        const [y, m] = this.month.split('-');
        download(`${s.unitCode} ${SHORT[+m - 1]}${y.slice(2)} Rental Income Statement${s.status === 'completed' ? '' : ' (draft)'}.${kind}`,
          new Blob([bytes], { type: pdf ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      } catch (e) { this.error = e.code ? friendlyError(e, 'make the statement') : e.message; }
      this.busy = false;
    },
    payoutFor(r, m) {
      if (m === this.month) return { value: r.totals.payout, label: r.status === 'completed' ? SOURCE.pms : 'This month (draft)', draft: r.status !== 'completed' };
      const h = this.payHistory[`${r.unitId}_${m}`];
      return h ? { value: h.payout, label: `${SOURCE[h.source] || h.source}${h.fileName ? ` · ${h.fileName}` : ''}` } : null;
    },
    bookingCount() { return this.rows.reduce((s, r) => s + r.bookingCount, 0); },
    match(r, key) {
      if (key === 'all') return true;
      if (key === 'attention') return r.status === 'notSetUp' || r.status === 'estimated';
      if (key === 'negative') return r.totals.payout < 0;
      if (key === 'fixed') return r.fixed;
      if (key === 'open') return r.status !== 'completed';
      if (key === 'done') return r.status === 'completed';
      return !r.fixed;
    },
    shown() {
      const q = this.search.trim().toLowerCase();
      return this.rows.filter(r => this.match(r, this.filter) && (!q || r.unitCode.toLowerCase().includes(q)));
    },
    unitById(id) { return this.unitFull[id]?.unit || { id, unitCode: this.rows.find(r => r.unitId === id)?.unitCode || id, termHistory: [], missing: !this.unitFull[id] }; },
    async open(r) {
      this.busy = true; this.error = '';
      try {
        await this.loadUnitFull(r.unitId);
        this.sel = this.fullRecord(r.unitId) || r; this.ctripInput = {}; this.confirming = false; this.reopening = false; this.overrideReason = ''; this.selOpen = true; window.scrollTo(0, 0);
      } catch (e) { this.error = friendlyError(e, 'open the statement'); }
      this.busy = false;
    },
    askComplete() { this.confirming = true; this.$nextTick(() => this.$refs.completeBox?.scrollIntoView({ behavior: 'smooth', block: 'center' })); },
    doneCount() { return this.rows.filter(r => r.status === 'completed').length; },
    isDone(unitId) { return this.rows.some(r => r.unitId === unitId && r.status === 'completed'); },
    // What holds back this unit's Approve & complete: its own items, plus month-wide ones (nothing uploaded, unknown rooms)
    blockers(r) { return r && r.status !== 'completed' ? this.checklist.filter(c => !c.unitId || c.unitId === r.unitId) : []; },
    // A unit completed before and reopened: completing it again is a new revision (Director Override)
    reopened(r) { return !!r && this.ums.some(u => u.unitId === r.unitId && u.statement?.status === 'reopened'); },
    // A unit's statement for another month is completed (one read)
    async doneIn(unitId, month) { const s = await getDoc(doc(db, 'statements', statementId(unitId, month))); return s.exists() && s.data().status === 'completed'; },
    // This unit's expense lines for another month (the brought-forward line lives there)
    async unitExpenses(unitId, month) {
      const snap = await getDocs(query(collection(db, 'expenses'), where('unitId', '==', unitId), where('month', '==', month)));
      return snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(e => e.propertyId === this.propertyId);
    },

    // ---- Ctrip amount typed per booking (ARR-13) ----
    async saveCtrip(l) {
      if (this.sel?.status === 'completed') return;
      const v = Number(this.ctripInput[l.reservationNo]);
      if (!(v > 0)) { this.error = 'Type the Trip.com amount (above zero) first.'; return; }
      this.busy = true; this.error = '';
      try {
        const b = writeBatch(db);
        const ctrip = { guestPaid: v, enteredBy: me.user.uid, enteredByName: me.name, enteredAt: serverTimestamp() };
        const unitId = this.sel.unitId, full = this.unitFull[unitId];
        b.set(doc(db, 'bookings', l.reservationNo), { ctrip }, { merge: true });
        markDirty(b, this.propertyId, this.month, [unitId]);   // the unit's summary is worked out again
        audit(b, me, { action: 'ctrip.enter', entity: `bookings/${l.reservationNo}`, propertyId: this.propertyId, month: this.month,
          changes: [{ field: 'ctrip.guestPaid', old: full?.bookings.find(x => x.id === l.reservationNo)?.ctrip?.guestPaid ?? null, new: v }] });
        await b.commit();
        const bk = full?.bookings.find(x => x.id === l.reservationNo); if (bk) bk.ctrip = { guestPaid: v };
        this.ctripInput[l.reservationNo] = '';
        await this.refreshKeepingUnit(unitId);
        this.okMsg = `Trip.com amount saved for ${l.reservationNo}.`;
      } catch (e) { this.error = friendlyError(e, 'save the Ctrip amount'); }
      this.busy = false;
    },

    // ---- Unit settings (effective-dated terms, ARR-15/16) ----
    async openSettings(u) {
      if (this.isDone(u.id)) return;   // a completed unit's settings for this month are read-only
      if (u.missing) { try { await this.loadUnitFull(u.id); } catch (e) { this.error = friendlyError(e, 'open the unit settings'); return; } u = this.unitById(u.id); }
      const t = u.terms || {};
      this.set = { unitId: u.id, unitCode: u.unitCode, arrangement: t.arrangement || 'profitShare20', fixedRentAmount: t.fixedRentAmount ?? '',
        serviceFeePct: pctOut(t.serviceFeePct), utilityFeePct: pctOut(t.utilityFeePct), sstOnFeePct: pctOut(t.sstOnFeePct),
        effectiveFrom: this.month, reason: '', error: '',
        history: [...(u.termHistory || [])].sort((a, b) => (b.effectiveFrom || '').localeCompare(a.effectiveFrom || '')) };
      this.settingsOpen = true;
    },
    termsDoc(arrangement, extra = {}) {
      return { arrangement, fixedRentAmount: null, serviceFeePct: null, utilityFeePct: null, sstOnFeePct: null, otaOverrides: null,
        createdBy: me.user.uid, createdByName: me.name, createdAt: serverTimestamp(), ...extra };
    },
    async saveSettings() {
      const s = this.set; s.error = '';
      if (s.arrangement === 'fixedRent' && !(Number(s.fixedRentAmount) > 0)) return s.error = 'Enter the fixed rent amount.';
      if (!s.reason.trim()) return s.error = 'Add a short reason. It goes in the audit log.';
      const fixed = s.arrangement === 'fixedRent';
      const data = this.termsDoc(s.arrangement, {
        effectiveFrom: s.effectiveFrom, reason: s.reason.trim(),
        fixedRentAmount: fixed ? Math.round(Number(s.fixedRentAmount) * 100) / 100 : null,
        serviceFeePct: fixed ? null : pctIn(s.serviceFeePct), utilityFeePct: fixed ? null : pctIn(s.utilityFeePct), sstOnFeePct: fixed ? null : pctIn(s.sstOnFeePct)
      });
      this.busy = true;
      try {
        const b = writeBatch(db);
        // A unit seen only in bookings gets its unit record now
        if (!this.unitFull[s.unitId]?.unit) {
          b.set(doc(db, 'units', s.unitId), { propertyId: this.propertyId, unitCode: s.unitCode, ezeeRoomMatch: s.unitCode, aliases: [], ownerId: null, active: true, createdAt: serverTimestamp(), createdBy: me.user.uid });
          markFrom(b, this.propertyId, ALL_MONTHS, s.unitId);
        }
        b.set(doc(db, 'units', s.unitId, 'terms', `${s.effectiveFrom}_${Date.now()}`), data);
        markFrom(b, this.propertyId, s.effectiveFrom, s.unitId);   // summaries from that month on are worked out again
        audit(b, me, { action: 'unitTerms.create', entity: `units/${s.unitId}/terms`, propertyId: this.propertyId, month: s.effectiveFrom,
          changes: [{ field: 'arrangement', old: this.unitById(s.unitId).terms?.arrangement || null, new: s.arrangement }], reason: s.reason.trim() });
        await b.commit();
        this.settingsOpen = false;
        this.okMsg = `${s.unitCode} settings saved, applying from ${monthName(s.effectiveFrom)}.`;
        await this.load();
      } catch (e) { s.error = friendlyError(e, 'save the settings'); }
      this.busy = false;
    },
    starterAvailable() {
      return !this.completed && (this.property().code || '').toUpperCase() === 'DM' && this.rows.some(r => r.status === 'notSetUp' &&
        [...DM_STARTER.units, ...DM_STARTER.fixed].some(x => x[0] === r.unitCode));
    },
    async loadStarter() {
      this.busy = true; this.error = '';
      try {
        const b = writeBatch(db);
        let n = 0;
        const stamp = Date.now();
        const { units } = await loadSetup(this.propertyId, this.month);
        for (const u of units.filter(u => !u.terms && !this.isDone(u.id))) {
          const share = DM_STARTER.units.find(x => x[0] === u.unitCode), fixed = DM_STARTER.fixed.find(x => x[0] === u.unitCode);
          if (!share && !fixed) continue;
          const data = fixed ? this.termsDoc('fixedRent', { fixedRentAmount: fixed[1] }) : this.termsDoc(share[1], share[2] || {});
          b.set(doc(db, 'units', u.id, 'terms', `${this.month}_${stamp}`), { ...data, effectiveFrom: this.month, reason: 'Starter settings (Upload CSV test page, Finance Sep 2026 set-up)' });
          markFrom(b, this.propertyId, this.month, u.id);
          n++;
        }
        audit(b, me, { action: 'unitTerms.starter', entity: `properties/${this.propertyId}`, propertyId: this.propertyId, month: this.month,
          changes: [{ field: 'units', old: null, new: n }], reason: 'Starter settings loaded' });
        await b.commit();
        this.okMsg = `Starter settings loaded for ${n} units, applying from ${monthName(this.month)}. Fixed rents are Sep 2026 amounts: check them for earlier months.`;
        await this.load();
      } catch (e) { this.error = friendlyError(e, 'load the starter settings'); }
      this.busy = false;
    },

    // ---- Approve & complete, one unit at a time (PTO-09: everything stamped; the unit's statement is frozen) ----
    // The month document is a summary: open, partial (some units completed) or completed (every unit with a statement).
    monthSummaryDoc(doneIds) {
      const sum = monthSummary(this.rows.map(r => r.unitId), doneIds);
      return { propertyId: this.propertyId, month: this.month, ...sum,
        totals: { fixedRent: r2(this.summary.fixed), profitSharing: r2(this.summary.share), balToPay: r2(this.summary.balToPay), carried: r2(this.summary.carried) },
        updatedBy: me.user.uid, updatedByName: me.name, updatedAt: serverTimestamp(),
        ...(sum.status === 'completed' ? { completedBy: me.user.uid, completedByName: me.name, completedAt: serverTimestamp() } : {}) };
    },
    async complete() {
      const r = this.sel;
      if (!r || r.status === 'completed' || this.blockers(r).length) return;
      const again = this.reopened(r), prev = this.unitFull[r.unitId]?.statement;
      if (again && me.role !== 'director') { this.error = `${r.unitCode} was reopened. Only a Director can complete it again (Director Override).`; return; }
      if (again && !this.overrideReason.trim()) { this.error = 'Add the reason for the new revision.'; return; }
      this.busy = true; this.error = '';
      try {
        const next = nextMonth(this.month), id = statementId(r.unitId, this.month);
        if (await this.doneIn(r.unitId, next)) throw new Error(`${r.unitCode} is already completed for ${monthName(next)}, so its balance can't carry forward into it.`);
        const b = writeBatch(db);
        let nextChanged = r.totals.payout < 0;
        // A Brought Forward line made earlier (from Finance's statement for this month) goes if the PMS payout is no longer negative
        for (const e of (await this.unitExpenses(r.unitId, next)).filter(e => e.auto && e.sourceMonth === this.month && !e.deleted))
          if (!(r.totals.payout < 0)) {
            b.update(doc(db, 'expenses', e.id), { deleted: true, auto: true, deletedReason: `${r.unitCode} ${monthName(this.month)} completed in the PMS` });
            nextChanged = true;
          }
        b.set(doc(db, 'payoutHistory', id), { propertyId: this.propertyId, unitId: r.unitId, unitCode: r.unitCode, month: this.month, year: this.month.slice(0, 4),
          source: 'pms', totalIncome: r.totals.totalReceivable, charges: r2(r.totals.totalReceivable - r.totals.payout), payout: r.totals.payout, fixed: r.fixed, remark: '',
          fileName: null, importedBy: me.user.uid, importedByName: me.name, importedAt: serverTimestamp() });
        // The old revision was saved when the unit was reopened (the rules check it exists before allowing the new revision)
        b.set(doc(db, 'statements', id), { ...r, status: 'completed', revision: (prev?.revision || 0) + 1,
          ...(again ? { overrideReason: this.overrideReason.trim() } : {}),
          completedBy: me.user.uid, completedByName: me.name, completedAt: serverTimestamp() });
        if (r.totals.payout < 0)   // ARR-18: negative balance carried forward automatically
          b.set(doc(db, 'expenses', `bf_${r.unitId}_${next}`), { propertyId: this.propertyId, unitId: r.unitId, date: `${next}-01`, month: next,
            kind: 'broughtForward', type: 'broughtForward', description: `Brought forward from ${monthName(this.month)}`, amount: r2(-r.totals.payout),
            auto: true, sourceStatementId: id, sourceMonth: this.month, files: [], deleted: false,
            createdBy: me.user.uid, createdByName: me.name, createdAt: serverTimestamp() });
        const doneIds = new Set([...this.rows.filter(x => x.status === 'completed').map(x => x.unitId), r.unitId]);
        const m = this.monthSummaryDoc(doneIds);
        b.set(doc(db, 'months', `${this.propertyId}_${this.month}`), m, { merge: true });
        // The unit's summary now comes from the completed statement; the next month's changes with its brought-forward line
        markDirty(b, this.propertyId, this.month, [r.unitId]);
        if (nextChanged) markDirty(b, this.propertyId, next, [r.unitId]);
        audit(b, me, { action: again ? 'statement.override' : 'statement.complete', entity: `statements/${id}`,
          propertyId: this.propertyId, month: this.month, changes: [{ field: 'status', old: again ? 'reopened' : 'open', new: 'completed' }], reason: this.overrideReason.trim() });
        await b.commit();
        this.confirming = false; this.overrideReason = '';
        this.okMsg = `${r.unitCode} completed for ${monthName(this.month)}.` + (m.status === 'completed'
          ? ` All ${m.unitCount} statements for ${monthName(this.month)} are completed.` : ` ${m.completedUnits} of ${m.unitCount} units completed.`);
        await this.reloadAt(r.unitId);
      } catch (e) { this.error = e.code ? friendlyError(e, 'complete the statement') : e.message; }
      this.busy = false;
    },
    // Director only: the unit's statement is saved as a revision, then it is a draft again.
    async reopen() {
      const r = this.sel;
      if (!r || r.status !== 'completed' || me.role !== 'director' || !this.overrideReason.trim()) return;
      this.busy = true; this.error = '';
      try {
        const next = nextMonth(this.month), id = statementId(r.unitId, this.month);
        if (await this.doneIn(r.unitId, next)) throw new Error(`${r.unitCode} is already completed for ${monthName(next)}, which holds its brought-forward line. Reopen ${monthName(next)} for this unit first.`);
        const reason = this.overrideReason.trim(), s = this.unitFull[r.unitId].statement;
        const { id: _id, ...data } = s;
        await setDoc(doc(db, 'statements', id, 'revisions', String(s.revision || 1)), { ...data, reopenReason: reason, reopenedBy: me.user.uid, reopenedAt: serverTimestamp() });
        const nextExp = await this.unitExpenses(r.unitId, next);
        const b = writeBatch(db);
        b.update(doc(db, 'statements', id), { status: 'reopened', reopenReason: reason, reopenedBy: me.user.uid, reopenedByName: me.name, reopenedAt: serverTimestamp() });
        const bf = nextExp.filter(e => e.auto && e.sourceMonth === this.month && !e.deleted);
        for (const e of bf)
          b.update(doc(db, 'expenses', e.id), { deleted: true, auto: true, deletedReason: `${r.unitCode} ${monthName(this.month)} reopened` });
        // The unit is a draft again: its summary is worked out from the bookings again (and the next month's, if a line went)
        markDirty(b, this.propertyId, this.month, [r.unitId]);
        if (bf.length) markDirty(b, this.propertyId, next, [r.unitId]);
        const doneIds = new Set(this.rows.filter(x => x.status === 'completed' && x.unitId !== r.unitId).map(x => x.unitId));
        b.set(doc(db, 'months', `${this.propertyId}_${this.month}`), { ...this.monthSummaryDoc(doneIds), reopenedBy: me.user.uid, reopenedByName: me.name, reopenedAt: serverTimestamp() }, { merge: true });
        audit(b, me, { action: 'statement.reopen', entity: `statements/${id}`, propertyId: this.propertyId, month: this.month,
          changes: [{ field: 'status', old: 'completed', new: 'reopened' }], reason });
        await b.commit();
        this.reopening = false; this.overrideReason = '';
        this.okMsg = `${r.unitCode} reopened for ${monthName(this.month)}.`;
        await this.reloadAt(r.unitId);
      } catch (e) { this.error = e.code ? friendlyError(e, 'reopen the statement') : e.message; }
      this.busy = false;
    },
    async reloadAt(unitId) {
      await this.load();
      const again = this.rows.find(x => x.unitId === unitId);
      if (again) { await this.loadUnitFull(unitId); this.sel = this.fullRecord(unitId) || again; this.ctripInput = {}; this.selOpen = true; }
    },
    // After a change made on the open statement: the list is read again (the unit's summary is refreshed),
    // the statement stays open and is worked out from the data already in memory.
    async refreshKeepingUnit(unitId) {
      const full = this.unitFull[unitId], ph = this.payHistory, rv = this.rateVersions;
      await this.load();
      this.unitFull[unitId] = full; this.payHistory = ph; this.rateVersions = rv;
      const again = this.rows.find(x => x.unitId === unitId) && this.fullRecord(unitId);
      if (again) { this.sel = again; this.selOpen = true; }
    },

    // ---- xlsx in Finance's order: Payment To Owner, statements, every booking, expenses ----
    async downloadXlsx() {
      this.busy = true;
      try {
        const X = await loadXlsxLib(), wb = X.utils.book_new(), R = v => (typeof v === 'number' ? r2(v) : v);
        const rows = await this.fullRows();   // the export needs every booking line, so the whole month is read here
        const add = (name, aoa, widths) => {
          const ws = X.utils.aoa_to_sheet(aoa.map(r => r.map(R)));
          ws['!cols'] = widths.map(w => ({ wch: w }));
          aoa[0].forEach((_, c) => { const a = X.utils.encode_cell({ r: 0, c }); if (ws[a]) ws[a].s = { font: { bold: true }, fill: { patternType: 'solid', fgColor: { rgb: 'D9D9D9' } } }; });
          X.utils.book_append_sheet(wb, ws, name);
        };
        const pay = [['Unit', 'Arrangement', 'Total Rental Income', 'Service Fees (Include SST) & Charges', 'Payment To Owner', 'Remark', 'Statement']];
        rows.forEach(r => pay.push([r.unitCode, r.arrangementLabel, r.totals.totalReceivable, r.totals.totalReceivable - r.totals.payout, r.totals.payout,
          r.fixed ? 'FIXED' : r.totals.payout < 0 ? 'Negative: carried forward' : STATUS[r.status][0], r.status === 'completed' ? 'Completed' : 'Open']));
        pay.push([], ['Total', '', this.summary.income], ['', '', '', 'Bal to pay', this.summary.balToPay], ['', '', '', 'Fixed Rent', this.summary.fixed], ['', '', '', 'Profit Sharing', this.summary.share]);
        add('Payment To Owner', pay, [12, 18, 18, 22, 18, 26, 11]);
        const st = [['Unit', 'Arrangement', 'Bookings', 'Nights', 'Total Receivable', 'Service Fee', 'Utilities', 'SST on Fee', "Owner's Entitlement", 'Expenses', 'Nett Receivable', 'Rounding', 'Payout', 'Status']];
        rows.forEach(r => st.push([r.unitCode, r.arrangementLabel, r.lines.length, r.totals.nights, r.totals.totalReceivable, -r.totals.serviceFee, -r.totals.utilityFee, -r.totals.sstOnFee,
          r.totals.entitlement, r.totals.totalExpenses, r.totals.netReceivable, r.totals.roundingAdjust, r.totals.payout, STATUS[r.status][0]]));
        add('Statements', st, [12, 18, 9, 8, 15, 12, 12, 11, 16, 12, 15, 10, 12, 12]);
        const bk = [['Unit', 'Source', 'Reservation No', 'Check In', 'Check Out', 'Nights', 'Method', 'Guest paid (before commission)', 'Platform charges', 'PTO (RM)', "Finance's amount", 'Note']];
        rows.forEach(r => r.lines.forEach(l => bk.push([r.unitCode, l.source, l.reservationNo, dmy(l.arrival), dmy(l.departure), l.nights, l.method, l.guestPaid, l.platform, l.pto, l.financeAmount ?? '', l.note || ''])));
        add('Bookings', bk, [12, 16, 14, 11, 11, 7, 10, 16, 14, 12, 14, 40]);
        const ym = this.yearMonths(), ps = [['Unit', ...ym.map(m => `${SHORT[+m.slice(5) - 1]} ${m.slice(0, 4)}`)]];
        rows.forEach(r => ps.push([r.unitCode, ...ym.map(m => this.payoutFor(r, m)?.value ?? '')]));
        add('Monthly Payout Summary', ps, [12, ...ym.map(() => 11)]);
        const ex = [['Unit', 'Date', 'Kind', 'Description', 'Amount']];
        rows.forEach(r => r.expenseLines.forEach(e => ex.push([r.unitCode, dmy(e.date), e.kind, e.description, e.amount])));
        add('Expenses', ex, [12, 11, 14, 36, 12]);
        const out = X.write(wb, { bookType: 'xlsx', type: 'array' });
        download(`${this.property().code || this.propertyId} ${monthName(this.month)} owner payout${this.completed ? '' : ' (draft)'}.xlsx`, new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      } catch (e) { this.error = e.message || String(e); }
      this.busy = false;
    }
  }
};
</script>

<style scoped>
    .starter-btn { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 35%, var(--border)); }
    .starter-btn:hover { background: var(--accent-soft); }
    .starter-strip { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin: -4px 0 10px; padding: 8px 10px 8px 12px;
      border-radius: 10px; background: var(--accent-soft); font-size: 12px; color: var(--text-2); }
    .starter-strip > span:first-child { flex: 1 1 240px; }
    .starter-acts { display: inline-flex; gap: 6px; margin-left: auto; }
    .st-cell .pill + .pill { margin-left: 6px; }
    .actions .rows .row { padding: 6px 0; }
    .me-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: -8px 0 20px; }
    .me-actions .help { margin-right: auto; }
    .stmt-grid { grid-template-columns: minmax(0,1fr) 300px; }
    .stmt-page .table th, .stmt-page .table td { padding: 10px 9px; white-space: nowrap; }
    .stmt-page .table .tag-est { white-space: normal; max-width: 200px; }
    /* Trip.com amount: one compact box with its Save button (Khairul 27 Oct: the table was squashed) */
    .ctrip-in { display: inline-flex; align-items: center; gap: 8px; }
    .ctrip-in .input { width: 104px; height: 32px; padding: 0 8px; text-align: center; appearance: textfield; -moz-appearance: textfield; }
    .ctrip-in .input::-webkit-inner-spin-button, .ctrip-in .input::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
    .ctrip-in .btn { height: 32px; padding: 0 12px; font-size: 12px; }
    .stmt-label .navlink { text-transform: none; letter-spacing: 0; font-size: 12px; }
    /* Summary goes under the bookings until the table has room beside it */
    @media (max-width: 1600px) { .stmt-grid { grid-template-columns: minmax(0,1fr); } }
    .table tr.est td { background: color-mix(in srgb, var(--amber-soft) 60%, var(--surface)); }
    .stmt-label { display: flex; justify-content: space-between; font-size: 11px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--muted); padding: 14px 0 4px; }
    @media (max-width: 1000px) { .stmt-grid { grid-template-columns: minmax(0,1fr); } }
</style>
