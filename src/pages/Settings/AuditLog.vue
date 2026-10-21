<template>
  <main class="content">
    <div class="loading-bar" v-show="loading"></div>
    <div class="page-head">
      <div>
        <h1>Audit log</h1>
        <div class="sub">Every change made in the PMS: who, when, what changed and why. Directors only.</div>
      </div>
      <span class="chip">Read-only</span>
    </div>
    <div class="notice error" v-show="error">{{ error }}</div>

    <div class="toolbar">
      <input class="input" type="search" placeholder="Search who, unit, reason…" v-model="search" aria-label="Search">
      <div class="pills brand">
        <template v-for="a in AREAS" :key="a.key">
          <button class="pill-btn" :class="{ on: area === a.key }" @click="area = a.key">{{ a.key === 'all' ? `All (${entries.length})` : `${a.label} (${countArea(a.key)})` }}</button>
        </template>
      </div>
    </div>

    <section class="card">
      <div class="card-head"><h2>{{ `Changes · newest first` }}</h2><span class="help">{{ `${shown().length} of ${entries.length} loaded` }}</span></div>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Record</th><th>Changes</th><th>Reason</th></tr></thead>
          <tbody>
            <template v-for="e in shown()" :key="e.id">
              <tr>
                <td class="when">{{ stamp(e.at) }}</td>
                <td class="who"><span>{{ e.userName || 'Unknown' }}</span><small>{{ ROLE_LABEL[e.role] || '' }}</small></td>
                <td>{{ actionText(e.action) }}</td>
                <td class="ent">{{ entityText(e) }}</td>
                <td>
                  <div class="chg">
                    <template v-for="(c, i) in (e.changes || []).slice(0, 6)" :key="i">
                      <span><b>{{ c.field }}</b>: <span>{{ changeText(e, c) }}</span></span>
                    </template>
                    <span class="muted" v-show="(e.changes || []).length > 6">{{ `+ ${(e.changes || []).length - 6} more` }}</span>
                    <span class="muted" v-show="!(e.changes || []).length">—</span>
                  </div>
                </td>
                <td class="reason">{{ e.reason || '—' }}</td>
              </tr>
            </template>
            <tr v-show="!loading && !shown().length"><td colspan="6" class="muted">{{ entries.length ? 'No entries match. Load more to search further back.' : 'No changes recorded yet.' }}</td></tr>
          </tbody>
        </table>
      </div>
      <div class="card-foot">
        <span>Entries can't be edited or deleted. Personal details (IC, bank, phone, email, address) are never shown here, only that they changed.</span>
        <button class="btn" v-show="more" @click="loadMore()" :disabled="loading">Load more</button>
      </div>
    </section>
  </main>
</template>

<script>
import { markRaw } from 'vue';
import { collection, query, orderBy, limit, startAfter, getDocs } from 'firebase/firestore';
import { db, ROLE_LABEL } from '@/lib/firebase.js';
import { friendlyError } from '@/lib/finance-data.js';

const PAGE = 50;
const AREAS = [{ key: 'all', label: 'All' }, { key: 'money', label: 'Expenses & Ctrip' }, { key: 'units', label: 'Units & rates' },
  { key: 'owners', label: 'Owners' }, { key: 'statements', label: 'Statements & month-end' }, { key: 'uploads', label: 'Uploads' }, { key: 'staff', label: 'Staff accounts' }];
const AREA_OF = { expense: 'money', ctrip: 'money', unit: 'units', unitTerms: 'units', rates: 'units', property: 'units', owner: 'owners',
  statement: 'statements', month: 'statements', ezee: 'uploads', financeStatement: 'uploads', staff: 'staff' };
const ACTIONS = {
  'expense.create': 'Added an expense line', 'expense.update': 'Edited an expense line', 'expense.remove': 'Removed an expense line',
  'ctrip.enter': 'Typed a Trip.com amount', 'unit.create': 'Added a unit', 'unit.update': 'Changed unit settings',
  'unitTerms.create': 'Changed unit fees or fixed rent', 'unitTerms.starter': 'Loaded starter unit settings', 'unitTerms.fromStatement': "Set up units from Finance's statement",
  'rates.create': 'Changed fees & rates or OTA commissions', 'property.create': 'Added a property', 'property.update': 'Edited property details',
  'owner.create': 'Added an owner', 'owner.update': 'Edited an owner', 'owner.deactivate': 'Deactivated an owner', 'owner.reactivate': 'Turned an owner back on',
  'month.complete': 'Approved & completed a month', 'month.reopen': 'Reopened a month', 'statement.complete': 'Approved & completed a unit statement', 'statement.reopen': 'Reopened a unit statement', 'statement.override': 'Edited a statement (Director Override)',
  'ezee.upload': 'Uploaded an eZee report', 'financeStatement.import': "Imported Finance's statement", 'staff.create': 'Invited staff', 'staff.update': 'Changed a staff account'
};
// Personal data (PDPA): show that it changed, never the value.
const PII = /(^|\.)(ic|icPassport|passport|nric|email|phone|whatsapp|wechat|address|bank|bankName|bankAccount|accountNo|accountHolder|dob|dateOfBirth|fullName|name|contact)/i;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const val = v => v == null || v === '' ? '(blank)' : typeof v === 'boolean' ? (v ? 'on' : 'off') : typeof v === 'object' ? (v.toDate ? v.toDate().toLocaleDateString('en-GB') : JSON.stringify(v).slice(0, 60)) : String(v).slice(0, 60);

export default {
  data() {
    return { AREAS, ROLE_LABEL, entries: [], last: null, more: false, loading: true, error: '', search: '', area: 'all' };
  },
  async mounted() { await this.loadMore(); },
  methods: {
    async loadMore() {
      this.loading = true; this.error = '';
      try {
        const cons = [orderBy('at', 'desc'), ...(this.last ? [startAfter(this.last)] : []), limit(PAGE)];
        const snap = await getDocs(query(collection(db, 'auditLog'), ...cons));
        this.entries.push(...snap.docs.map(d => ({ id: d.id, ...d.data() })));
        // markRaw: the Firestore cursor must stay a plain snapshot, not a Vue proxy.
        this.last = snap.docs.length ? markRaw(snap.docs[snap.docs.length - 1]) : this.last;
        this.more = snap.docs.length === PAGE;
      } catch (e) { this.error = friendlyError(e, 'load the audit log'); }
      this.loading = false;
    },
    areaOf(e) { const p = String(e.action || '').split('.')[0]; return AREA_OF[p] || (String(e.entity || '').startsWith('users/') ? 'staff' : 'other'); },
    countArea(k) { return this.entries.filter(e => this.areaOf(e) === k).length; },
    shown() {
      const q = this.search.trim().toLowerCase();
      return this.entries.filter(e => this.area === 'all' || this.areaOf(e) === this.area)
        .filter(e => !q || [e.userName, e.action, this.actionText(e.action), e.entity, e.reason, e.month, e.propertyId].some(x => String(x || '').toLowerCase().includes(q)));
    },
    stamp(ts) {
      if (!ts) return '';
      const d = ts.toDate ? ts.toDate() : new Date(ts);
      return `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    },
    actionText(a) {
      if (ACTIONS[a]) return ACTIONS[a];
      const [area, verb] = String(a || 'change').split('.');
      return `${(verb || 'changed').replace(/([A-Z])/g, ' $1').toLowerCase()} · ${area.replace(/([A-Z])/g, ' $1').toLowerCase()}`.replace(/^./, c => c.toUpperCase());
    },
    entityText(e) {
      const parts = [e.entity || ''];
      if (e.month) parts.push(e.month);
      return parts.filter(Boolean).join(' · ');
    },
    changeText(e, c) {
      if (PII.test(c.field || '') || /\/private\//.test(e.entity || '')) return 'changed (personal detail, hidden)';
      if (c.old == null && c.new != null) return val(c.new);
      return `${val(c.old)} → ${val(c.new)}`;
    }
  }
};
</script>

<style scoped>
    .chg { display: grid; gap: 2px; font-size: 12px; }
    .chg span { color: var(--text-2); }
    .chg b { font-weight: 600; color: var(--text); }
    .when { white-space: nowrap; }
    .who { white-space: nowrap; }
    .who small { display: block; color: var(--muted); font-size: 11px; }
    .ent { font-size: 12px; color: var(--muted); overflow-wrap: anywhere; }
    .reason { font-size: 12px; color: var(--text-2); max-width: 220px; }
    .page-note { color: var(--muted); font-size: 12px; margin-top: 14px; }
    .table td { vertical-align: top; }
</style>
