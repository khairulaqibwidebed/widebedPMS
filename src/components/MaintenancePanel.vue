<template>
  <section class="card">
    <div class="card-head">
      <h2>{{ `Maintenance · ${monthName(month)} · ${shown().length} ticket${shown().length === 1 ? '' : 's'}` }}</h2>
      <!-- 18 Nov 2026 (Khairul): the Google Sheet buttons in one 3-dots menu: Sync, Settings, Open Sheet (lib/maintenance-sheet.js).
           The Download Master Record button was removed (lib/maintenance.js downloadMasterRecord is kept, unused). -->
      <div class="mt-more" v-if="sheet || isDirector" @keydown.esc="moreOpen = false">
        <span class="mt-busy muted" v-if="sheetBusy">{{ sheetBusy }}</span>
        <button type="button" class="mt-dots" title="Google Sheet" aria-label="Google Sheet menu" aria-haspopup="menu" :aria-expanded="String(moreOpen)" @click="moreOpen = !moreOpen">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg></button>
        <div class="mt-more-back" v-if="moreOpen" @click="moreOpen = false"></div>
        <div class="mt-more-menu" v-if="moreOpen" role="menu">
          <button type="button" role="menuitem" v-if="sheet" :disabled="!!sheetBusy" @click="moreOpen = false; syncYear()">Sync</button>
          <button type="button" role="menuitem" v-if="isDirector" @click="moreOpen = false; openSheetSetup()">Settings</button>
          <a role="menuitem" v-if="sheet && sheetLink()" :href="sheetLink()" target="_blank" rel="noopener" @click="moreOpen = false">Open Sheet</a>
        </div>
      </div>
    </div>
    <p class="card-intro">On-site tickets of this month: completed ones by the month they were completed, In progress and Cancelled ones by the month of their Date. Enter the WB Charge and the Invoice No. to charge the owner: it adds one Maintenance line to the unit's statement. The owner sees only the WB Charge and the description, never the cost or the profit.</p>
    <div class="notice error" v-show="error">{{ error }}</div>
    <div class="notice ok" v-show="okMsg">{{ okMsg }}</div>
    <!-- Sheet status: green dot = set up and the last sync worked; red dot = not set up, or the last sync failed (18 Nov 2026) -->
    <p class="mt-sheet muted" v-if="sheetChecked && ((sheet && sheetNote) || !sheet?.scriptUrl)"><span class="mt-dot" :class="sheetLinked ? 'on' : 'off'" aria-hidden="true"></span>{{ sheet?.scriptUrl ? sheetNote : 'Google Sheet not linked' }}</p>
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
              <td class="num">{{ t.completion ? amt(t.completion.cost) : '—' }}</td>
              <!-- Pending: type WB Charge and Invoice No. here. Charged tickets are edited in the popup (Edit). -->
              <template v-if="st(t) === 'pending'">
                <td class="num"><input class="input num-in" type="number" step="0.01" min="0" v-model="row(t).wb" :aria-label="'WB Charge ' + t.id" placeholder="0.00"></td>
                <td><input class="input inv-in" v-model="row(t).inv" maxlength="40" :aria-label="'Invoice No. ' + t.id" placeholder="Invoice No."></td>
              </template>
              <template v-else>
                <td class="num">{{ isCharged(t) ? amt(t.billing.wbCharge) : '—' }}</td>
                <td>{{ isCharged(t) ? t.billing.invoiceNo : '—' }}</td>
              </template>
              <td class="nw">{{ isCharged(t) ? dmy(t.billing.chargedAt) : '—' }}</td>
              <td class="nw"><span class="pill" :class="PILL[st(t)]">{{ MAINT_STATUS[st(t)] }}</span>
                <small class="muted" v-if="isCharged(t) && t.billing.expenseMonth !== t.completion.month"><br>{{ 'on ' + monthName(t.billing.expenseMonth) }}</small></td>
              <td class="row-end">
                <button class="btn btn-primary btn-sm" v-if="st(t) === 'pending'" @click="charge(t)" :disabled="busy">Save</button>
                <!-- Eye: opens the ticket popup (same as clicking the row) -->
                <button type="button" class="icon-btn mt-eye" :title="'View ' + t.id" :aria-label="'View ' + t.id" @click="detail = t">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                </button>
              </td>
            </tr>
          </template>
          <SkeletonRows v-if="loading && !shown().length" table :cols="9" />
          <tr v-show="!loading && !shown().length"><td colspan="9" class="muted">{{ EMPTY[filter] }}</td></tr>
        </tbody>
        <tfoot v-show="shown().length">
          <tr><td colspan="3">Totals</td><td class="num">{{ amt(sum(t => t.completion?.cost)) }}</td><td class="num">{{ amt(sum(t => isCharged(t) ? t.billing.wbCharge : 0)) }}</td>
            <td colspan="4" class="nw"><span :class="{ neg: sum(t => isCharged(t) ? t.billing.profit : 0) < 0 }">{{ 'Profit RM ' + amt(sum(t => isCharged(t) ? t.billing.profit : 0)) }}</span></td></tr>
        </tfoot>
      </table>
    </div>
    <!-- Ticket popup (18 Nov 2026): the details that left the table -->
    <div class="modal-back mt-back" v-if="detail" @click.self="closeDetail()">
      <div class="modal mt-pop" role="dialog" aria-modal="true" :aria-label="detail.id + ' details'" v-esc="() => closeDetail()">
        <div class="mt-pop-head">
          <h2>{{ detail.id }}<span class="pill mt-pill" :class="PILL[st(detail)]">{{ MAINT_STATUS[st(detail)] }}</span></h2>
          <button type="button" class="icon-btn" aria-label="Close" title="Close (Esc)" @click="closeDetail()">×</button>
        </div>
        <div class="kv"><span>Unit</span><span>{{ detail.unit + (detail.property ? ' · ' + detail.property : '') }}</span></div>
        <div class="kv"><span>Area</span><span>{{ detail.area || '—' }}</span></div>
        <!-- In progress / Cancelled (18 Nov 2026): what was reported; nothing to charge yet -->
        <template v-if="!detail.completion">
          <div class="kv"><span>Raised by</span><span>{{ detail.raisedBy || '—' }}</span></div>
          <div class="kv" v-if="st(detail) === 'cancelled'"><span>Cancel reason</span><span>{{ detail.deleteReason || '—' }}</span></div>
          <div class="mt-pop-sol"><span>What happened</span><p>{{ detail.body || detail.title || '—' }}</p></div>
        </template>
        <template v-else>
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
        </template>
        <div class="notice error" v-show="error && isCharged(detail) && row(detail).editing">{{ error }}</div>
        <div class="modal-foot mt-pop-foot" v-if="isCharged(detail) && row(detail).editing">
          <textarea class="input mt-reason" rows="4" v-model="row(detail).reason" placeholder="Reason for the change (audit log)" aria-label="Reason"></textarea>
          <button class="btn" @click="row(detail).editing = false; error = ''">Cancel</button>
          <button class="btn" @click="remove(detail)" :disabled="busy">Remove charge</button>
          <button class="btn btn-primary" @click="saveEdit(detail)" :disabled="busy">Save change</button>
        </div>
        <div class="modal-foot" v-else-if="st(detail) === 'cancelled'">
          <router-link class="btn" :to="{ path: '/Operations/issues', query: { id: detail.id } }">Open ticket</router-link>
          <button class="btn mt-purge-btn" v-if="isDirector" @click="purge = { id: detail.id, t: detail, reason: '', error: '' }">Remove for good</button>
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
    <!-- Director, Cancelled ticket: remove it for good (rules Draft 0.86), in the same popup style as the app's confirm box.
         A reason is required; cannot be undone. -->
    <div class="modal-back mt-cf-back" v-if="purge" @click.self="!busy && (purge = null)">
      <div class="modal mt-cf" role="alertdialog" aria-modal="true" :aria-label="'Remove ' + purge.id + ' for good'" v-esc="() => { if (!busy) purge = null; }">
        <div class="mt-cf-icon" aria-hidden="true">🗑</div>
        <h2>{{ `Remove ${purge.id} for good?` }}</h2>
        <p>The ticket and its comments are deleted and can't be brought back. Its Google Sheet row goes too; the Drive folder is kept.</p>
        <textarea class="input mt-cf-reason" rows="3" v-model="purge.reason" placeholder="Reason (kept in the audit log)" aria-label="Reason for removing"></textarea>
        <div class="notice error" v-show="purge.error">{{ purge.error }}</div>
        <div class="modal-foot mt-cf-foot">
          <button class="btn" @click="purge = null" :disabled="busy">Cancel</button>
          <button class="btn mt-cf-danger" @click="removeForGood(purge.t)" :disabled="busy || !purge.reason.trim()">{{ busy ? 'Removing…' : 'Remove for good' }}</button>
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
import { loadMaintenance, chargeTicket, editCharge, removeCharge, r2, maintStatus, MAINT_STATUS, removeTicketForGood, ticketMonth } from '@/lib/maintenance.js';
import { loadSheetSettings, saveSheetSettings, syncMonths, syncSheetEdits, yearMonths, makeYearFile, removeSheetRows } from '@/lib/maintenance-sheet.js';
import { STATES } from '@/lib/states.js';
import { showNotice } from '@/lib/confirm.js';
// The Sheet is a reference copy (Khairul): checked on open, after each charge, by the button, and every 2 minutes while the tab is in front
const SHEET_EVERY = 2 * 60 * 1000;

// 18 Nov 2026: In progress and Cancelled added (every Customer ticket is listed); Pending stays the default
const FILTERS = [{ value: 'pending', label: 'Pending' }, { value: 'charged', label: 'Charged' }, { value: 'progress', label: 'In progress' }, { value: 'cancelled', label: 'Cancelled' }, { value: 'all', label: 'All' }];
const PILL = { pending: 'amber', charged: 'green', progress: 'blue', cancelled: 'red' };
const EMPTY = { pending: 'Nothing waiting to be charged this month.', charged: 'Nothing charged this month.', progress: 'No On-site tickets in progress this month.',
  cancelled: 'No cancelled On-site tickets this month.', all: 'No On-site tickets this month.' };
export default {
  components: { OptionPicker, SkeletonRows },
  props: { propertyId: { type: String, default: '' }, propertyName: { type: String, default: '' }, month: { type: String, required: true } },
  emits: ['charged'],
  data() { return { me: useSession(), FILTERS, PILL, EMPTY, MAINT_STATUS, filter: 'pending', detail: null, search: '', tickets: [], rows: {}, locked: {}, loading: true, busy: false, error: '', okMsg: '', moreOpen: false, purge: null, sheetFailed: false, sheetChecked: false,
    sheet: null, sheetBusy: '', sheetNote: '', sheetSetup: null, sheetTimer: null, sheetLinks: {}, states: STATES }; },
  computed: { year() { return this.month.slice(0, 4); }, allProps() { return this.propertyId === 'all'; }, isDirector() { return this.me.role === 'director'; }, nextYear() { return String(new Date().getFullYear() + 1); }, sheetLinked() { return !!this.sheet?.scriptUrl && !this.sheetFailed; } },   // 'all': the page's All properties
  watch: { propertyId() { this.load(); }, month() { this.load(); } },
  async mounted() {
    this.sheet = await loadSheetSettings(); this.sheetChecked = true;   // no red dot flash before the settings are read
    this.load();
    this.sheetTimer = setInterval(() => { if (document.visibilityState === 'visible') this.sheetQuick(); }, SHEET_EVERY);
  },
  beforeUnmount() { clearInterval(this.sheetTimer); },
  methods: {
    amt, dmy, monthName,
    isCharged(t) { return t.billing?.status === 'charged'; },
    st(t) { return maintStatus(t); },
    // Click anywhere on a table row opens the ticket popup (the Pending row's inputs and Save button still work as usual)
    closeDetail() { this.purge = null; const t = this.detail; if (t && this.isCharged(t) && this.rows[t.id]?.editing) delete this.rows[t.id]; this.detail = null; },
    rowClick(e, t) { if (!e.target.closest('a, button, input, select, textarea, label')) this.detail = t; },
    row(t) { return this.rows[t.id] || (this.rows[t.id] = { wb: '', inv: '', cost: '', reason: '', editing: !this.isCharged(t) }); },
    profitOf(t) { const r = this.row(t), cost = this.isCharged(t) ? Number(r.cost) || 0 : Number(t.completion.cost) || 0; return r2((Number(r.wb) || 0) - cost); },
    lockKey(t) { return `${t.propertyId}_${t.billing?.expenseMonth}_${t.unitId}`; },
    shown() {
      const q = this.search.trim().toLowerCase();
      return this.tickets.filter(t => this.filter === 'all' || this.st(t) === this.filter)
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
      this.sheetFailed = false;
      if (out.link) this.sheetLinks = { ...this.sheetLinks, [out.year]: out.link };
      const at = new Date().toLocaleTimeString('en-MY', { hour: 'numeric', minute: '2-digit' });
      this.sheetNote = `Google Sheet synced ${at}` + (out.fromSheet ? ` · ${out.fromSheet} ticket${out.fromSheet === 1 ? '' : 's'} updated from the Sheet` : '')
        + (!quiet && out.toSheet ? ` · ${out.toSheet} row${out.toSheet === 1 ? '' : 's'} written` : '');
      if (out.fromSheet) this.load(true);   // show the Sheet's edits (no second sync)
    },
    sheetFail(e) { this.sheetFailed = true; this.sheetNote = 'Google Sheet not synced: ' + (e.plain ? e.message : friendlyError(e, 'sync the Google Sheet')); },
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
    // Director: a Cancelled ticket removed for good, then its Sheet row (18 Nov 2026)
    async removeForGood(t) {
      const p = this.purge; p.error = '';
      if (!p.reason.trim()) return p.error = 'Give a reason for removing it.';
      this.busy = true;
      try { await removeTicketForGood(this.me, t, p.reason.trim()); }
      catch (e) { p.error = e.plain ? e.message : friendlyError(e, 'remove the ticket'); this.busy = false; return; }
      this.busy = false;
      this.tickets = this.tickets.filter(x => x.id !== t.id); this.purge = null; this.detail = null; this.error = '';
      // Popups, not a banner (Khairul, 18 Nov 2026)
      const year = (ticketMonth(t) || this.month).slice(0, 4);
      let sheetErr = '';
      if (this.sheet?.scriptUrl) { try { await removeSheetRows(this.sheet.scriptUrl, year, [t.id]); } catch (e) { sheetErr = e.message; } }
      if (sheetErr) showNotice(`${t.id} removed for good`, `Its Google Sheet row was not removed (${sheetErr}). Delete that row in the Sheet by hand.`, 'info');
      else showNotice(`${t.id} removed for good`, this.sheet?.scriptUrl ? 'The ticket, its comments and its Google Sheet row are gone.' : 'The ticket and its comments are gone.', 'info');
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
.mt-more { position: relative; display: flex; align-items: center; gap: 10px; }
.mt-busy { font-size: 12.5px; }
.mt-dots { display: inline-grid; place-items: center; width: 38px; height: 38px; padding: 0; border: 1px solid var(--accent); border-radius: 10px; background: var(--surface); color: var(--accent); cursor: pointer; }
.mt-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 7px; vertical-align: 1px; }
.mt-dot.on { background: #22a35a; }
.mt-dot.off { background: var(--danger, #c0392b); }
.mt-dots:hover, .mt-dots[aria-expanded="true"] { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); }
.mt-more-back { position: fixed; inset: 0; z-index: 20; }
.mt-more-menu { position: absolute; right: 0; top: calc(100% + 6px); z-index: 21; min-width: 170px; display: grid; padding: 6px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,.12); }
.mt-more-menu button, .mt-more-menu a { display: block; text-align: left; background: none; border: 0; padding: 9px 12px; border-radius: 8px; font: inherit; font-size: 14px; color: var(--text); text-decoration: none; cursor: pointer; }
.mt-more-menu button:hover:not(:disabled), .mt-more-menu a:hover { background: var(--accent-soft); color: var(--accent); }
.mt-more-menu button:disabled { opacity: .55; cursor: default; }
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
.mt-cf-back { z-index: 70; align-items: center; padding-top: 16px; }
.mt-cf { max-width: 420px; text-align: center; }
.mt-cf-icon { width: 56px; height: 56px; margin: 0 auto 12px; border-radius: 50%; display: grid; place-items: center; font-size: 26px; background: var(--red-soft); }
.mt-cf h2 { margin-bottom: 8px; }
.mt-cf p { margin: 0 0 14px; color: var(--text-2); font-size: 14px; line-height: 1.5; }
.mt-cf-reason { width: 100%; text-align: left; resize: vertical; }
.mt-cf-foot { justify-content: center; margin-top: 16px; }
.mt-cf-foot .btn { min-width: 120px; }
.mt-cf-danger { background: var(--danger); border-color: var(--danger); color: #fff; }
.mt-cf-danger:hover:not(:disabled) { filter: brightness(.9); }
.mt-purge-btn { color: var(--danger, #c0392b); border-color: color-mix(in srgb, var(--danger, #c0392b) 45%, transparent); }
</style>
