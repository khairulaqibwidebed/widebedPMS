<template>
  <section class="card">
    <div class="card-head">
      <h2>{{ `Maintenance · ${monthName(month)} · ${shown().length} ticket${shown().length === 1 ? '' : 's'}` }}</h2>
      <div class="mt-head-btns">
        <!-- 18 Nov 2026: Google Sheet copy of the Master Record (lib/maintenance-sheet.js) -->
        <a class="btn" v-if="sheet && sheetLink()" :href="sheetLink()" target="_blank" rel="noopener">{{ `Open ${year} Sheet` }}</a>
        <button class="btn" v-if="sheet" @click="syncYear()" :disabled="!!sheetBusy">{{ sheetBusy || 'Sync Google Sheet' }}</button>
        <button class="btn" v-if="isDirector" @click="openSheetSetup()">Sheet settings</button>
        <button class="btn" @click="master()" :disabled="!!exporting">{{ exporting || `Download ${year} Master Record` }}</button>
      </div>
    </div>
    <p class="card-intro">Completed Customer tickets of this month (the month they were completed). Enter the WB Charge and the Invoice No. to charge the owner: it adds one Maintenance line to the unit's statement. The owner sees only the WB Charge and the description, never the cost or the profit.</p>
    <div class="notice error" v-show="error">{{ error }}</div>
    <div class="notice ok" v-show="okMsg">{{ okMsg }}</div>
    <p class="mt-sheet muted" v-if="sheet && sheetNote">{{ sheetNote }}</p>
    <div class="toolbar">
      <OptionPicker v-model="filter" :options="FILTERS" label="Status" />
      <input class="input" type="search" placeholder="Search ticket or unit" v-model="search" aria-label="Search" style="max-width:220px">
    </div>
    <!-- 18 Nov 2026: the table fits without sideways scrolling. Action date, Solution, Fixed by and Profit moved to the ticket popup
         (click anywhere on a row). Cost stays: it is what the WB Charge is priced from. -->
    <!-- 18 Nov 2026: Cards view removed (Khairul); the table is the only view -->
    <div class="table-wrap">
      <table class="table mt">
        <thead><tr><th>Ticket</th><th>Unit</th><th>Area</th><th class="num">Cost (RM)</th><th class="num">WB Charge (RM)</th><th>Invoice No.</th><th>Charged owner</th><th>Status</th><th></th></tr></thead>
        <tbody>
          <template v-for="t in shown()" :key="t.id">
            <tr class="clickable" @click="rowClick($event, t)" :title="'Show ' + t.id + ' details'">
              <td class="nw mt-tid">{{ t.id }}</td>
              <td class="nw">{{ t.unit }}<small class="muted" v-if="allProps"><br>{{ t.property }}</small></td>
              <td>{{ t.area || '—' }}</td>
              <td class="num">{{ amt(t.completion.cost) }}</td>
              <!-- Pending: type WB Charge and Invoice No. here. Charged tickets are edited in the popup (Edit). -->
              <template v-if="!isCharged(t)">
                <td class="num"><input class="input num-in" type="number" step="0.01" min="0" v-model="row(t).wb" :aria-label="'WB Charge ' + t.id" placeholder="0.00"></td>
                <td><input class="input inv-in" v-model="row(t).inv" maxlength="40" :aria-label="'Invoice No. ' + t.id" placeholder="Invoice No."></td>
              </template>
              <template v-else>
                <td class="num">{{ isCharged(t) ? amt(t.billing.wbCharge) : '—' }}</td>
                <td>{{ isCharged(t) ? t.billing.invoiceNo : '—' }}</td>
              </template>
              <td class="nw">{{ isCharged(t) ? dmy(t.billing.chargedAt) : '—' }}</td>
              <td class="nw"><span class="pill" :class="isCharged(t) ? 'green' : 'amber'">{{ isCharged(t) ? 'Charged' : 'Pending' }}</span>
                <small class="muted" v-if="isCharged(t) && t.billing.expenseMonth !== t.completion.month"><br>{{ 'on ' + monthName(t.billing.expenseMonth) }}</small></td>
              <td class="row-end">
                <button class="btn btn-primary btn-sm" v-if="!isCharged(t)" @click="charge(t)" :disabled="busy">Save</button>
                <!-- Eye: opens the ticket popup (same as clicking the row) -->
                <button type="button" class="icon-btn mt-eye" :title="'View ' + t.id" :aria-label="'View ' + t.id" @click="detail = t">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                </button>
              </td>
            </tr>
          </template>
          <SkeletonRows v-if="loading && !shown().length" table :cols="9" />
          <tr v-show="!loading && !shown().length"><td colspan="9" class="muted">{{ filter === 'pending' ? 'Nothing waiting to be charged this month.' : 'No completed Customer tickets this month.' }}</td></tr>
        </tbody>
        <tfoot v-show="shown().length">
          <tr><td colspan="3">Totals</td><td class="num">{{ amt(sum(t => t.completion.cost)) }}</td><td class="num">{{ amt(sum(t => isCharged(t) ? t.billing.wbCharge : 0)) }}</td>
            <td colspan="4" class="nw"><span :class="{ neg: sum(t => isCharged(t) ? t.billing.profit : 0) < 0 }">{{ 'Profit RM ' + amt(sum(t => isCharged(t) ? t.billing.profit : 0)) }}</span></td></tr>
        </tfoot>
      </table>
    </div>
    <!-- Ticket popup (18 Nov 2026): the details that left the table -->
    <div class="modal-back mt-back" v-if="detail" @click.self="closeDetail()">
      <div class="modal mt-pop" role="dialog" aria-modal="true" :aria-label="detail.id + ' details'" v-esc="() => closeDetail()">
        <div class="mt-pop-head">
          <h2>{{ detail.id }}<span class="pill mt-pill" :class="isCharged(detail) ? 'green' : 'amber'">{{ isCharged(detail) ? 'Charged' : 'Pending' }}</span></h2>
          <button type="button" class="icon-btn" aria-label="Close" title="Close (Esc)" @click="closeDetail()">×</button>
        </div>
        <div class="kv"><span>Unit</span><span>{{ detail.unit + (detail.property ? ' · ' + detail.property : '') }}</span></div>
        <div class="kv"><span>Area</span><span>{{ detail.area || '—' }}</span></div>
        <div class="kv"><span>Action date</span><span>{{ dmy(detail.completion.actionDate) }}</span></div>
        <div class="kv"><span>Fixed by</span><span>{{ detail.completion.fixedByName || '—' }}</span></div>
        <div class="mt-pop-sol"><span>Solution</span><p>{{ detail.completion.solution || '—' }}</p></div>
        <!-- Editing a charged ticket (Edit below): Cost, WB Charge, Invoice No. and a reason (audit log) -->
        <div class="mt-money" v-if="isCharged(detail) && row(detail).editing">
          <label><span>Cost (RM)</span><input class="input" type="number" step="0.01" min="0" v-model="row(detail).cost" :aria-label="'Cost ' + detail.id"></label>
          <label><span>WB Charge (RM)</span><input class="input" type="number" step="0.01" min="0" v-model="row(detail).wb" :aria-label="'WB Charge ' + detail.id" placeholder="0.00"></label>
          <label><span>Profit (RM)</span><b :class="{ neg: row(detail).wb !== '' && profitOf(detail) < 0 }">{{ row(detail).wb === '' ? '—' : amt(profitOf(detail)) }}</b></label>
          <label><span>Invoice No.</span><input class="input" v-model="row(detail).inv" maxlength="40" :aria-label="'Invoice No. ' + detail.id" placeholder="Invoice No."></label>
        </div>
        <div class="mt-money" v-else>
          <div><span>Cost (RM)</span><b>{{ amt(detail.completion.cost) }}</b></div>
          <div><span>WB Charge (RM)</span><b>{{ isCharged(detail) ? amt(detail.billing.wbCharge) : '—' }}</b></div>
          <div><span>Profit (RM)</span><b :class="{ neg: isCharged(detail) && detail.billing.profit < 0 }">{{ isCharged(detail) ? amt(detail.billing.profit) : '—' }}</b></div>
          <div><span>Invoice No.</span><b>{{ isCharged(detail) ? detail.billing.invoiceNo : '—' }}</b></div>
        </div>
        <div class="kv" v-if="detail.completion.costRemarks"><span>Cost remarks</span><span>{{ detail.completion.costRemarks }}</span></div>
        <div class="kv"><span>Charged owner</span><span>{{ isCharged(detail) ? dmy(detail.billing.chargedAt) + (detail.billing.expenseMonth !== detail.completion.month ? ' (on ' + monthName(detail.billing.expenseMonth) + ')' : '') : 'Not charged yet' }}</span></div>
        <div class="notice error" v-show="error && isCharged(detail) && row(detail).editing">{{ error }}</div>
        <div class="modal-foot mt-pop-foot" v-if="isCharged(detail) && row(detail).editing">
          <textarea class="input mt-reason" rows="4" v-model="row(detail).reason" placeholder="Reason for the change (audit log)" aria-label="Reason"></textarea>
          <button class="btn" @click="row(detail).editing = false; error = ''">Cancel</button>
          <button class="btn" @click="remove(detail)" :disabled="busy">Remove charge</button>
          <button class="btn btn-primary" @click="saveEdit(detail)" :disabled="busy">Save change</button>
        </div>
        <div class="modal-foot" v-else>
          <router-link class="btn" :to="{ path: '/Operations/issues', query: { id: detail.id } }">Open ticket</router-link>
          <template v-if="isCharged(detail)">
            <span class="muted mt-locked" v-if="locked[lockKey(detail)]" title="That month's statement is completed">Locked</span>
            <button class="btn btn-primary" v-else @click="startEdit(detail)">Edit</button>
          </template>
        </div>
      </div>
    </div>
    <!-- Google Sheet settings (Directors). Setup steps: apps-script-maintenance-sheet/SETUP.md -->
    <div class="modal-back mt-back" v-if="sheetSetup" @click.self="sheetSetup = null">
      <form class="modal" role="dialog" aria-label="Google Sheet settings" v-esc="() => (sheetSetup = null)" @submit.prevent="saveSheetSetup()" style="max-width:560px">
        <div class="mt-pop-head"><h2>Google Sheet settings</h2>
          <button type="button" class="icon-btn" aria-label="Close" @click="sheetSetup = null">×</button></div>
        <p class="help" style="margin-top:0">The Master Record Google Sheet, kept in step with the PMS. Sheet edits to Area, Action Date, Solution/Action Taken and Cost Remarks come back to the PMS; money columns always come from the PMS. One file per year: next year's file is made by itself on its first sync.</p>
        <div class="notice error" v-show="sheetSetup.error">{{ sheetSetup.error }}</div>
        <div class="field"><label class="req" for="shScript">Apps Script web app URL</label>
          <input class="input" id="shScript" v-model="sheetSetup.scriptUrl" placeholder="https://script.google.com/macros/s/…/exec"></div>
        <div class="field"><label for="shSheet">Google Sheet link (optional)</label>
          <input class="input" id="shSheet" v-model="sheetSetup.sheetUrl" placeholder="https://docs.google.com/spreadsheets/d/…"></div>
        <div class="field"><label for="shState">Only properties in</label>
          <select class="input" id="shState" v-model="sheetSetup.state">
            <option value="">All states</option>
            <option v-for="s in states" :key="s" :value="s">{{ s }}</option>
          </select>
          <p class="help">Tickets of properties in other states (or with no state) stay out of this Sheet.</p></div>
        <div class="field" v-if="sheet?.scriptUrl">
          <label>Next year's file</label>
          <div><button type="button" class="btn" :disabled="busy" @click="makeNextYear()">Make {{ nextYear }} file now</button></div>
          <p class="help" v-if="!sheetSetup.yearMade">Made by itself on the first {{ nextYear }} sync anyway: a copy of this year's file with the month tabs emptied down to one Template tab.</p>
          <p class="help" v-else>Ready: <a :href="sheetSetup.yearMade.url" target="_blank" rel="noopener">{{ sheetSetup.yearMade.name }}</a> ({{ sheetSetup.yearMade.tabs.join(', ') }})</p></div>
        <div class="modal-foot"><button type="button" class="btn" @click="sheetSetup = null">Cancel</button><button class="btn btn-primary" :disabled="busy">Save and sync</button></div>
      </form>
    </div>
    <p class="card-foot" style="display:block">Profit = WB Charge − Cost (shown for charged tickets). A charge can be edited or removed, with a reason, until that unit's statement for the month is completed. If the ticket's month is already completed for the unit, the line goes to the next open month.</p>
  </section>
</template>

<script>
// Expenses & Reimbursements > Maintenance (18 Nov 2026): Accounting and Directors charge the owner for completed Customer tickets.
// Data and writes are in lib/maintenance.js.
import OptionPicker from '@/components/OptionPicker.vue';
import SkeletonRows from '@/components/SkeletonRows.vue';
import { amt, dmy, monthName } from '@/lib/format.js';
import { useSession } from '@/stores/session.js';
import { friendlyError, completedUnitIds } from '@/lib/finance-data.js';
import { loadMaintenance, chargeTicket, editCharge, removeCharge, downloadMasterRecord, r2 } from '@/lib/maintenance.js';
import { loadSheetSettings, saveSheetSettings, syncMonths, syncSheetEdits, yearMonths, makeYearFile } from '@/lib/maintenance-sheet.js';
import { STATES } from '@/lib/states.js';
// The Sheet is a reference copy (Khairul): checked on open, after each charge, by the button, and every 2 minutes while the tab is in front
const SHEET_EVERY = 2 * 60 * 1000;

const FILTERS = [{ value: 'pending', label: 'Pending' }, { value: 'charged', label: 'Charged' }, { value: 'all', label: 'All' }];
export default {
  components: { OptionPicker, SkeletonRows },
  props: { propertyId: { type: String, default: '' }, propertyName: { type: String, default: '' }, month: { type: String, required: true } },
  emits: ['charged'],
  data() { return { me: useSession(), FILTERS, filter: 'pending', detail: null, search: '', tickets: [], rows: {}, locked: {}, loading: true, busy: false, error: '', okMsg: '', exporting: '',
    sheet: null, sheetBusy: '', sheetNote: '', sheetSetup: null, sheetTimer: null, sheetLinks: {}, states: STATES }; },
  computed: { year() { return this.month.slice(0, 4); }, allProps() { return this.propertyId === 'all'; }, isDirector() { return this.me.role === 'director'; }, nextYear() { return String(new Date().getFullYear() + 1); } },   // 'all': the page's All properties
  watch: { propertyId() { this.load(); }, month() { this.load(); } },
  async mounted() {
    this.sheet = await loadSheetSettings();
    this.load();
    this.sheetTimer = setInterval(() => { if (document.visibilityState === 'visible') this.sheetQuick(); }, SHEET_EVERY);
  },
  beforeUnmount() { clearInterval(this.sheetTimer); },
  methods: {
    amt, dmy, monthName,
    isCharged(t) { return t.billing?.status === 'charged'; },
    // Click anywhere on a table row opens the ticket popup (the Pending row's inputs and Save button still work as usual)
    closeDetail() { const t = this.detail; if (t && this.isCharged(t) && this.rows[t.id]?.editing) delete this.rows[t.id]; this.detail = null; },
    rowClick(e, t) { if (!e.target.closest('a, button, input, select, textarea, label')) this.detail = t; },
    row(t) { return this.rows[t.id] || (this.rows[t.id] = { wb: '', inv: '', cost: '', reason: '', editing: !this.isCharged(t) }); },
    profitOf(t) { const r = this.row(t), cost = this.isCharged(t) ? Number(r.cost) || 0 : Number(t.completion.cost) || 0; return r2((Number(r.wb) || 0) - cost); },
    lockKey(t) { return `${t.propertyId}_${t.billing?.expenseMonth}_${t.unitId}`; },
    shown() {
      const q = this.search.trim().toLowerCase();
      return this.tickets.filter(t => this.filter === 'all' || (this.filter === 'charged') === this.isCharged(t))
        .filter(t => !q || [t.id, t.unit, t.property].some(v => (v || '').toLowerCase().includes(q)));
    },
    sum(f) { return this.shown().reduce((s, t) => s + (Number(f(t)) || 0), 0); },
    async load(noSheet = false) {
      if (!this.propertyId) { this.tickets = []; this.loading = false; return; }
      this.loading = true; this.error = '';
      try {
        this.tickets = await loadMaintenance(this.month, this.allProps ? '' : this.propertyId);
        this.rows = {};
        // Charged rows: is that month's statement completed for the unit? (then the charge is locked)
        const groups = {};
        for (const t of this.tickets.filter(x => this.isCharged(x))) (groups[`${t.propertyId}|${t.billing.expenseMonth}`] ||= []).push(t);
        const locked = {};
        await Promise.all(Object.entries(groups).map(async ([k, list]) => {
          const [pid, m] = k.split('|'), done = await completedUnitIds(pid, m);
          for (const t of list) locked[this.lockKey(t)] = done.has(t.unitId);
        }));
        this.locked = locked;
      } catch (e) { this.error = friendlyError(e, 'load the maintenance tickets'); }
      this.loading = false;
      if (!noSheet) this.sheetSync([this.month]);
    },
    // ---------- Google Sheet ----------
    // This year's file (from the script; one file per year), else the link saved in Sheet settings
    sheetLink() { return this.sheetLinks[this.year] || (this.sheet?.sheetUrl && this.year === String(new Date().getFullYear()) ? this.sheet.sheetUrl : ''); },
    sheetDone(out, quiet) {
      if (out.link) this.sheetLinks = { ...this.sheetLinks, [out.year]: out.link };
      const at = new Date().toLocaleTimeString('en-MY', { hour: 'numeric', minute: '2-digit' });
      this.sheetNote = `Google Sheet synced ${at}` + (out.fromSheet ? ` · ${out.fromSheet} ticket${out.fromSheet === 1 ? '' : 's'} updated from the Sheet` : '')
        + (!quiet && out.toSheet ? ` · ${out.toSheet} row${out.toSheet === 1 ? '' : 's'} written` : '');
      if (out.fromSheet) this.load(true);   // show the Sheet's edits (no second sync)
    },
    sheetFail(e) { this.sheetNote = 'Google Sheet not synced: ' + (e.plain ? e.message : friendlyError(e, 'sync the Google Sheet')); },
    async sheetSync(months, quiet = true) {
      if (!this.sheet?.scriptUrl || this.sheetBusy) return;
      this.sheetBusy = 'Syncing…';
      try { this.sheetDone(await syncMonths(this.me, this.sheet.scriptUrl, months, s => { if (!quiet) this.sheetBusy = s; }, this.sheet.states || []), quiet); }
      catch (e) { this.sheetFail(e); }
      this.sheetBusy = '';
    },
    async sheetQuick() {
      if (!this.sheet?.scriptUrl || this.sheetBusy || this.busy) return;
      this.sheetBusy = 'Syncing…';
      try { this.sheetDone(await syncSheetEdits(this.me, this.sheet.scriptUrl, this.year, this.sheet.states || []), true); }
      catch (e) { this.sheetFail(e); }
      this.sheetBusy = '';
    },
    syncYear() { this.sheetSync(yearMonths(this.year), false); },
    openSheetSetup() { this.sheetSetup = { scriptUrl: this.sheet?.scriptUrl || '', sheetUrl: this.sheet?.sheetUrl || '', state: (this.sheet?.states || [])[0] || '', error: '', yearMade: null }; },
    async makeNextYear() {
      const f = this.sheetSetup; f.error = ''; this.busy = true;
      try { f.yearMade = await makeYearFile(this.sheet.scriptUrl, this.nextYear); this.sheetLinks = { ...this.sheetLinks, [this.nextYear]: f.yearMade.url }; }
      catch (e) { f.error = e.plain ? e.message : friendlyError(e, 'make the file'); }
      finally { this.busy = false; }
    },
    async saveSheetSetup() {
      const f = this.sheetSetup; f.error = ''; this.busy = true;
      try { this.sheet = await saveSheetSettings(this.me, { ...f, states: f.state ? [f.state] : [] }); this.sheetSetup = null; this.busy = false; this.syncYear(); }
      catch (e) { f.error = e.plain ? e.message : friendlyError(e, 'save the Sheet settings'); this.busy = false; }
    },
    async charge(t) {
      const r = this.row(t); this.error = ''; this.okMsg = '';
      if (r.wb === '' || !(Number(r.wb) >= 0)) return this.error = `${t.id}: enter the WB Charge (RM, 0 allowed).`;
      if (!String(r.inv).trim()) return this.error = `${t.id}: type the Invoice No.`;
      if (!t.unitId || !t.propertyId) return this.error = `${t.id} has no unit in the PMS, so it can't go on a statement.`;
      this.busy = true;
      try {
        const out = await chargeTicket(this.me, t, { wbCharge: Number(r.wb), invoiceNo: r.inv });
        t.billing = out.billing; delete this.rows[t.id];
        this.okMsg = `${t.id}: RM ${amt(out.billing.wbCharge)} added to ${t.unit}'s ${monthName(out.month)} statement` + (out.moved ? ` (${monthName(t.completion.month)} is completed for that unit).` : '.');
        this.$emit('charged'); this.sheetSync([t.completion.month]);
      } catch (e) { this.error = e.plain ? e.message : friendlyError(e, 'charge the owner'); }
      this.busy = false;
    },
    startEdit(t) { this.rows[t.id] = { wb: t.billing.wbCharge, inv: t.billing.invoiceNo, cost: t.completion.cost, reason: '', editing: true }; },
    async saveEdit(t) {
      const r = this.row(t); this.error = ''; this.okMsg = '';
      if (r.wb === '' || !(Number(r.wb) >= 0)) return this.error = `${t.id}: enter the WB Charge (RM, 0 allowed).`;
      if (r.cost === '' || !(Number(r.cost) >= 0)) return this.error = `${t.id}: enter the cost (RM, 0 allowed).`;
      if (!String(r.inv).trim()) return this.error = `${t.id}: type the Invoice No.`;
      if (!r.reason.trim()) return this.error = `${t.id}: give a reason for the change.`;
      this.busy = true;
      try {
        const out = await editCharge(this.me, t, { wbCharge: Number(r.wb), invoiceNo: r.inv, cost: Number(r.cost) }, r.reason.trim());
        if (out) { t.billing = out.billing; t.completion.cost = out.cost; this.okMsg = `${t.id}: charge updated.`; this.$emit('charged'); this.sheetSync([t.completion.month]); }
        delete this.rows[t.id];
      } catch (e) { this.error = e.plain ? e.message : friendlyError(e, 'change the charge'); }
      this.busy = false;
    },
    async remove(t) {
      const r = this.row(t); this.error = ''; this.okMsg = '';
      if (!r.reason.trim()) return this.error = `${t.id}: give a reason for removing the charge.`;
      this.busy = true;
      try {
        await removeCharge(this.me, t, r.reason.trim());
        t.billing = { status: 'pending' }; delete this.rows[t.id];
        this.okMsg = `${t.id}: charge removed; the ticket is Pending again.`; this.$emit('charged'); this.sheetSync([t.completion.month]);
      } catch (e) { this.error = e.plain ? e.message : friendlyError(e, 'remove the charge'); }
      this.busy = false;
    },
    async master() {
      this.error = ''; this.okMsg = ''; this.exporting = 'Preparing…';
      try {
        const out = await downloadMasterRecord(this.year, s => { this.exporting = s; });
        this.okMsg = out.tickets ? `${this.year}_Master_Record.xlsx downloaded: ${out.tickets} ticket${out.tickets === 1 ? '' : 's'} in ${out.months} month sheet${out.months === 1 ? '' : 's'}.`
          : `${this.year}_Master_Record.xlsx downloaded. No completed Customer tickets in ${this.year} yet (Owner list only).`;
      } catch (e) { this.error = friendlyError(e, 'build the Master Record'); }
      this.exporting = '';
    }
  }
};
</script>

<style scoped>
.mt td { vertical-align: top; }
.mt .nw { white-space: nowrap; }
.mt .neg { color: var(--danger, #c0392b); }
.num-in { width: 96px; height: 34px; text-align: right; }
.inv-in { width: 120px; height: 34px; }
.btn-sm { height: 32px; padding: 0 12px; }
.row-end { text-align: right; white-space: nowrap; }
.mt-head-btns { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.mt-sheet { margin: -4px 0 10px; font-size: 12.5px; }
.mt-tid { font-weight: 600; color: var(--accent); }
/* Eye: a plain icon, no box (Khairul 18 Nov); grey, turns brand red when the row is hovered */
.mt-eye { display: inline-grid; place-items: center; vertical-align: middle; margin-left: 6px; width: 28px; height: 28px; background: none !important; color: var(--muted); }
.mt tbody tr:hover .mt-eye, .mt-eye:focus-visible { color: var(--accent); }
.mt-pop-foot { flex-wrap: wrap; }
.mt-pop-foot .mt-reason { flex: 1 1 100%; height: auto; min-height: 96px; padding: 10px 12px; resize: vertical; font: inherit; line-height: 1.45; }
.mt-locked { align-self: center; font-size: 13px; }
/* Popup sits higher and stays fully on screen in Edit (Khairul 18 Nov); scrolls inside if the window is short */
.mt-back { align-items: center; padding: 16px; }
.mt-pop { max-height: calc(100vh - 32px); max-height: calc(100dvh - 32px); overflow-y: auto; }
.mt-pop-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin-bottom: 16px; }
.mt-pop-head .icon-btn { margin: -6px -8px 0 0; line-height: 1; }
.mt-pop h2 { display: flex; align-items: center; gap: 10px; margin: 0; }
.mt-pill { font-size: 12px; }
.mt-pop-sol { padding: 7px 0 12px; font-size: 13px; }
.mt-pop-sol span { color: var(--text-2); }
.mt-pop-sol p { margin: 4px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.mt-pop .mt-money { margin-bottom: 6px; }
.mt-money { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 12px; padding: 10px 12px; border-radius: 10px; background: var(--chip); }
.mt-money > * { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.mt-money span { font-size: 12px; color: var(--muted); }
.mt-money b { font-size: 15px; font-variant-numeric: tabular-nums; }
.mt-money .input { height: 34px; width: 100%; background: var(--surface); }
.neg { color: var(--danger, #c0392b); }
.toolbar { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-bottom: 12px; }
</style>
