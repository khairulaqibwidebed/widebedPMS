<template>
  <main class="content">
    <div class="loading-bar" v-show="loading"></div>
    <div class="page-head">
      <div>
        <h1>Staff accounts</h1>
        <div class="sub">HR details: IC number and monthly salary. Only HR and Directors see this. The department on the form is the role on Accounts.</div>
      </div>
    </div>
    <div class="tabs">
      <RouterLink to="/Settings/staff">Accounts</RouterLink>
      <RouterLink to="/Settings/staff-hr" class="on">HR details</RouterLink>
    </div>
    <div class="notice error" v-show="error">{{ error }}</div>

    <div class="list-tools">
      <div class="search-box">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <input class="input" type="search" v-model="q" placeholder="Search name or role" aria-label="Search name or role">
      </div>
    </div>
    <Paged :items="shown()" v-slot="{ pageRows }">
      <div class="table-wrap soft-wrap">
        <table class="table hover-rows">
          <thead><tr><th>Name</th><th>Role</th><th>IC number</th><th class="num">Monthly salary</th><th>Last changed</th><th></th></tr></thead>
          <tbody>
            <tr v-for="u in pageRows" :key="u.id">
              <td>{{ u.displayName || u.email }}<span class="you" v-show="u.id === myUid">You</span></td>
              <td>{{ ROLE_LABEL[u.role] || u.role || '—' }}<span class="intern-tag" v-if="u.intern">Intern</span></td>
              <template v-if="u.intern"><td class="na">Not needed</td><td class="num na">Not needed</td></template>
              <template v-else>
              <td>{{ hrOf(u).ic || '—' }}</td>
              <td class="num">{{ hrOf(u).salary != null ? rm(hrOf(u).salary) : '—' }}</td>
              </template>
              <td>{{ hrOf(u).updatedAt ? `${day(hrOf(u).updatedAt)} · ${hrOf(u).updatedByName || ''}` : '—' }}</td>
              <td class="row-acts">
                <button class="act-pill" v-if="canEdit(u)" @click="edit(u)">Edit</button>
                <span class="muted" v-else title="Your own details are changed by a Director">—</span>
              </td>
            </tr>
            <SkeletonRows v-if="loading && !shown().length" table :cols="6" />
            <tr v-show="!loading && !shown().length"><td colspan="6" class="muted">No staff match.</td></tr>
          </tbody>
        </table>
      </div>
    </Paged>
    <p class="note">Staff can ask for up to 50% of their salary; they never see the salary or IC number. The department on the form comes from their role on Accounts. Every change is saved in the audit log (which fields changed, not the values). HR can't change their own details: a Director does. Interns have no HR details and no Salary Advance page. Turned-off accounts are not listed.</p>

    <div class="modal-back" v-if="sel" @click.self="sel = null" v-esc="() => { sel = null }">
      <form class="modal" role="dialog" aria-label="HR details" style="max-width:480px;width:calc(100% - 32px)" @submit.prevent="save()">
        <h2>{{ 'HR details: ' + (sel.displayName || sel.email) }}</h2>
        <div class="notice error" v-show="formErr">{{ formErr }}</div>
        <!-- Properties are set on the Accounts tab only (removed here 12 Nov 2026, Khairul) -->
        <label class="check" v-if="sel.role !== 'director'"><input type="checkbox" v-model="form.intern"><span><b>Intern</b><small>No IC or salary needed, and they can't open Salary Advance.</small></span></label>
        <template v-if="!form.intern">
        <div class="field"><label for="hrIc">IC number</label><input class="input" id="hrIc" v-model="form.ic" maxlength="40" placeholder="e.g. 900101-14-5678"></div>
        <div class="field"><label for="hrPay" class="req">Monthly salary (RM)</label><input class="input" id="hrPay" type="number" min="0" step="0.01" v-model="form.salary"></div>
        </template>
        <div class="modal-foot">
          <button type="button" class="btn" @click="sel = null">Cancel</button>
          <button class="btn btn-primary" type="submit" :disabled="busy">{{ busy ? 'Saving…' : 'Save' }}</button>
        </div>
      </form>
    </div>
  </main>
</template>

<script>
// Staff accounts > HR details (5 Nov 2026): IC and monthly salary in staffHR/{uid} (position = their role name, filled in on save), apart from users/{uid} (PDPA).
// Saving also writes advanceLimits/{uid} (50% of salary), the only part the staff member reads. Data: pages/HR/advances.js.
import { collection, getDocs } from 'firebase/firestore';
import { db, ROLE_LABEL } from '@/lib/firebase.js';
import { STATES, statesOf, statesText } from '@/lib/states.js';
import OptionPicker from '@/components/OptionPicker.vue';
import { friendlyError } from '@/lib/finance-data.js';
import { rm } from '@/lib/format.js';
import { toast } from '@/lib/toast.js';
import { useSession } from '@/stores/session.js';
import { loadStaffHR, saveStaffHR } from '@/pages/HR/advances.js';

const me = useSession();

export default {
  components: { OptionPicker },
  data() {
    return { ROLE_LABEL, STATES, statesOf, statesText, myUid: me.user.uid, users: [], hr: {}, loading: true, error: '', q: '', sel: null, form: {}, formErr: '', busy: false };
  },
  async mounted() {
    try {
      const [snap, hr] = await Promise.all([getDocs(collection(db, 'users')), loadStaffHR()]);
      this.users = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.active !== false)
        .sort((a, b) => (a.displayName || a.email || '').localeCompare(b.displayName || b.email || ''));
      this.hr = hr;
    } catch (e) { this.error = friendlyError(e, 'load the HR details'); }
    this.loading = false;
  },
  methods: {
    rm,
    hrOf(u) { return this.hr[u.id] || {}; },
    day(t) { return t?.toDate ? t.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''; },
    canEdit(u) { return me.role === 'director' || u.id !== this.myUid; },
    shown() {
      const q = this.q.trim().toLowerCase();
      return this.users.filter(u => !q || [u.displayName, u.email, ROLE_LABEL[u.role]].some(v => String(v || '').toLowerCase().includes(q)));
    },
    edit(u) { const h = this.hrOf(u); this.sel = u; this.formErr = ''; this.form = { ic: h.ic || '', salary: h.intern || u.intern ? '' : h.salary ?? '', intern: u.intern === true }; },
    async save() {
      if (!this.form.intern && (this.form.salary === '' || this.form.salary == null)) return this.formErr = 'Enter the monthly salary.';
      this.busy = true; this.formErr = '';
      try {
        const saved = await saveStaffHR(me, this.sel, this.hr[this.sel.id], this.form);
        if (saved) this.hr = { ...this.hr, [this.sel.id]: { ...saved, updatedAt: { toDate: () => new Date() }, updatedByName: me.name } };
        this.sel.intern = !!this.form.intern;
        toast('HR details saved.'); this.sel = null;
      } catch (e) { this.formErr = e.code ? friendlyError(e, 'save the HR details') : e.message; }
      this.busy = false;
    }
  }
};
</script>

<style scoped>
.list-tools { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 14px; }
.search-box { position: relative; flex: 1 1 260px; max-width: 420px; }
.search-box svg { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--muted); pointer-events: none; }
.search-box .input { width: 100%; padding-left: 36px; }
.check { display: flex; gap: 10px; align-items: flex-start; font-size: 13px; margin-bottom: 14px; }
.check input { width: 16px; height: 16px; accent-color: var(--accent); margin-top: 2px; }
.check small { display: block; color: var(--muted); font-size: 12px; }
.intern-tag { margin-left: 8px; font-size: 11px; font-weight: 600; color: var(--muted); background: var(--chip); padding: 1px 8px; border-radius: 999px; }
.na { color: var(--muted); font-size: 12px; }
.no-state { color: var(--danger, #c0392b); font-weight: 600; }
.fit-picker :deep(.op) { display: block; width: 100%; }
.fit-picker :deep(.op-btn) { width: 100%; text-align: left; }
.fit-picker :deep(.op-pop) { width: 100%; max-width: none; }
.you { margin-left: 8px; font-size: 11px; font-weight: 600; color: var(--text-2); background: var(--chip); padding: 1px 8px; border-radius: 999px; }
</style>
