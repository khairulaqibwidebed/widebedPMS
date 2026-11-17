<template>
  <main class="content">
    <div class="loading-bar" v-show="loading"></div>

    <div class="page-head">
      <div>
        <h1>Staff accounts</h1>
        <div class="sub">Director and HR. Invite staff, set their role and which pages they can view or edit, and turn accounts off when someone leaves.</div>
      </div>
      <button class="btn info-btn" type="button" @click="rolesOpen = true" aria-label="What each role can do" title="What each role can do">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
      </button>
    </div>

    <!-- HR details (IC, position, salary) is its own page, StaffHR.vue (5 Nov 2026) -->
    <div class="tabs">
      <RouterLink to="/Settings/staff" class="on">Accounts</RouterLink>
      <RouterLink to="/Settings/staff-hr">HR details</RouterLink>
    </div>
    <div class="notice error" v-show="error">{{ error }}</div>
    <div class="notice ok" v-show="okMsg">{{ okMsg }}</div>
    <!-- Properties (12 Nov 2026): staff see only the properties on their record, so everyone needs at least one -->
    <div class="notice error no-state-note" v-if="noStateCount">
      <span>{{ `${noStateCount} active staff ${noStateCount === 1 ? 'has' : 'have'} no properties yet. They see no property data until some are given.` }}</span>
      <button class="link" type="button" @click="noStateOnly = !noStateOnly">{{ noStateOnly ? 'Show everyone' : 'Show them' }}</button>
    </div>

    <div class="staff-filters">
      <input class="input staff-search" type="search" v-model="search" placeholder="Search name, email or role" aria-label="Search staff">
      <!-- Active / Inactive switch (6 Nov 2026), same look as Issues' Customer / In-house: the white pill slides to the picked tab -->
      <div class="staff-seg" role="tablist" aria-label="Account status" :style="{ '--i': filters.findIndex(f => f.key === filter) }">
        <span class="staff-thumb" aria-hidden="true"></span>
        <template v-for="f in filters" :key="f.key">
          <button type="button" role="tab" :aria-selected="String(filter === f.key)" :class="{ on: filter === f.key }" @click="filter = f.key">
            {{ f.label }}<span class="n">{{ count(f.key) }}</span></button>
        </template>
      </div>
      <OptionPicker v-model="roleFilter" :options="roleOptions" label="Filter by role" />
      <div class="head-tools push">
        <button class="btn" @click="openLogs()">Logs</button>
        <button class="btn btn-primary" @click="openAdd()">+ Invite staff</button>
      </div>
    </div>

    <!-- The list fades and slides a little when Active / Inactive changes -->
    <Transition name="staff-swap" mode="out-in">
    <div :key="filter">
    <Paged :items="shown()" v-slot="{ pageRows }">
    <div class="table-wrap soft-wrap staff-wrap">
      <table class="table staff-table hover-rows">
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Properties</th><th>Last sign-in</th><th>Active</th><th>Joined</th><th></th></tr></thead>
        <tbody>
          <template v-for="row in pageRows" :key="row.id">
            <tr>
              <td><button class="name-btn" @click="openEdit(row)">{{ row.displayName || '(no name)' }}</button><span class="you" v-show="row.id === myUid">You</span></td>
              <td>{{ row.email }}</td>
              <td>
                {{ roleText(row) }}
                <span class="tag custom-tag" v-if="isCustom(row)" title="Page access changed from the role's usual pages">Custom access</span>
              </td>
              <td class="states-cell" :class="{ 'no-state': needsState(row) }">{{ propertiesText(row) }}</td>
              <td>{{ row.lastLoginAt ? when(row.lastLoginAt) : 'Never' }}</td>
              <td><span class="pill" :class="row.active === false ? 'grey' : 'green'">{{ row.active === false ? 'Inactive' : 'Active' }}</span></td>
              <td>{{ row.createdAt ? joined(row.createdAt) : '—' }}</td>
              <td class="row-acts">
                <template v-if="row.id === myUid || locked(row)"><span class="muted">—</span></template>
                <!-- Turn off / Turn back on moved into the edit panel (12 Nov 2026) -->
                <template v-if="row.id !== myUid && !locked(row)">
                  <button class="act-pill" @click="openEdit(row)">Change access</button>
                </template>
              </td>
            </tr>
          </template>
          <SkeletonRows v-if="loading && !shown().length" table :cols="8" />
          <tr v-show="!loading && !shown().length"><td colspan="8" class="muted">No staff match.</td></tr>
        </tbody>
      </table>
    </div>
    </Paged>
    </div>
    </Transition>
    <p class="note staff-note">Changing a role, page access or turning an account off asks for a reason and is saved in the audit log. Nothing is deleted.</p>

    <!-- Account log: read only when it is opened -->
    <template v-if="logsOpen">
      <div class="drawer-back" @click="logsOpen = false"></div>
      <aside class="drawer wide" role="dialog" aria-label="Account logs" v-esc="() => { logsOpen = false }">
        <div class="drawer-head"><h2>Account logs</h2><button class="icon-btn" @click="logsOpen = false" aria-label="Close">×</button></div>
        <div class="drawer-body">
          <p class="help" style="margin:0 0 12px">Who was invited, who changed role or page access and who was turned off or back on, newest first.</p>
          <div class="notice error" v-show="logsError">{{ logsError }}</div>
          <div class="empty loading-line" v-show="logsLoading">Loading…</div>
          <Paged :items="changes" :size="10" v-slot="{ pageRows }">
            <div class="changes logs-list">
              <template v-for="c in pageRows" :key="c.id"><div>{{ c.text }}</div></template>
            </div>
          </Paged>
          <div class="empty" v-show="!logsLoading && !changes.length && !logsError">No account changes yet.</div>
        </div>
        <div class="drawer-foot">
          <RouterLink class="btn" to="/Settings/audit-log" style="margin-right:auto">Full audit log</RouterLink>
          <button class="btn" @click="loadChanges()" :disabled="logsLoading">Refresh</button>
          <button class="btn btn-primary" @click="logsOpen = false">Close</button>
        </div>
      </aside>
    </template>

    <div class="modal-back" v-if="rolesOpen" @click.self="rolesOpen = false" v-esc="() => { rolesOpen = false }">
      <div class="modal" role="dialog" aria-label="What each role can do" style="max-width:720px;width:calc(100% - 32px)">
        <h2>What each role can do</h2>
      <div class="role-list">
        <div><b>Director</b><span>Everything, including Staff accounts and Director Override.</span></div>
        <div><b>Accounting</b><span>Upload eZee, expenses, month-end payout, exports.</span></div>
        <div><b>IT</b><span>View-only, personal details hidden, except on Issues: raises, comments on and completes tickets tagged IT. Sees Issues, offline inquiries (no names), Playbook and SOPs for now.</span></div>
        <div><b>Operations</b><span>Issues, offline inquiries assigned to them, booking forms, Playbook and SOPs.</span></div>
        <div><b>HR</b><span>SOP pages, complaints, Playbook, Staff accounts and Audit log, Issues.</span></div>
        <div><b>Procurement</b><span>The Fillout form links, Issues, Playbook and SOPs.</span></div>
        <div><b>Marketing</b><span>Issues, Playbook and SOPs for now. Own pages come later.</span></div>
        <div v-for="r in Object.keys(CUSTOM_ROLES)" :key="r"><b>{{ CUSTOM_ROLES[r].name }}</b><span>{{ CUSTOM_ROLES[r].description || 'Made on the Roles page.' }}{{ CUSTOM_ROLES[r].active ? '' : ' (turned off)' }}</span></div>
        <div><b>Page access</b><span>Each role starts with its usual pages ticked. You can tick View or Edit on any other page, or untick a usual one. Statement Approvals, Brand Logos, Staff accounts, Audit log and complaints always follow the role.</span></div>
      </div>
        <div class="modal-foot"><button class="btn" @click="rolesOpen = false">Close</button></div>
      </div>
    </div>

    <!-- Add / Edit panel -->
    <template v-if="panelOpen">
      <div>
        <div class="drawer-back" @click="close()"></div>
        <aside class="drawer" role="dialog" :aria-label="panel.mode === 'add' ? 'Add staff' : 'Edit staff'" v-esc="() => { close() }">
          <div class="drawer-head">
            <h2>{{ panel.mode === 'add' ? 'Invite staff' : 'Edit staff' }}</h2>
            <button class="icon-btn" @click="close()" aria-label="Close">×</button>
          </div>
          <form class="drawer-body" id="staffForm" @submit.prevent="save()">
            <div class="notice error" v-show="panel.error">{{ panel.error }}</div>
            <!-- Account status (12 Nov 2026): two clear choices instead of a small tick at the bottom -->
            <div class="acct" v-if="panel.mode === 'edit'">
              <div class="acct-top">
                <b>Account status</b>
                <span class="pill" :class="wasActive ? 'green' : 'grey'">{{ wasActive ? 'Active now' : 'Turned off now' }}</span>
              </div>
              <div class="acct-opts" role="radiogroup" aria-label="Account status">
                <button type="button" role="radio" class="acct-opt on-opt" :class="{ picked: panel.active }" :aria-checked="String(panel.active)" :disabled="cantEdit" @click="panel.active = true">
                  <span class="acct-dot"></span><span><b>Active</b><small>Can sign in and use their pages.</small></span>
                </button>
                <button type="button" role="radio" class="acct-opt off-opt" :class="{ picked: !panel.active }" :aria-checked="String(!panel.active)" :disabled="cantEdit" @click="panel.active = false">
                  <span class="acct-dot"></span><span><b>Turned off</b><small>Can't sign in or see anything. Their history stays.</small></span>
                </button>
              </div>
              <div class="acct-note off" v-if="wasActive && !panel.active">{{ `Saving turns off ${panel.displayName || 'this account'}. Add the reason below (e.g. Left the company).` }}</div>
              <div class="acct-note on" v-if="!wasActive && panel.active">{{ `Saving turns ${panel.displayName || 'this account'} back on. They sign in with their old password, or use Forgot password.` }}</div>
            </div>
            <div class="field">
              <label for="sName">Full name</label>
              <input class="input" id="sName" v-model="panel.displayName" required>
            </div>
            <div class="field">
              <label for="sEmail">Work email</label>
              <input class="input" id="sEmail" type="email" v-model="panel.email" :readonly="panel.mode === 'edit'" required>
              <span class="help" v-show="panel.mode === 'add'">They get an email with a link to set their own password.</span>
              <span class="help" v-show="panel.mode === 'edit'">An email can't be changed. Switch this account off and add a new one instead.</span>
            </div>
            <div class="field">
              <label>Role</label>
              <OptionPicker class="fit-picker" v-model="panel.role" :options="roleChoices.map(r => ({ value: r, label: ROLE_LABEL[r] }))" label="Role" :disabled="cantEdit" @change="resetPerms()" />
              <span class="help" v-show="panel.isMe">You can't change your own access. Ask another Director.</span>
              <span class="help" v-show="!panel.isMe && locked(panel.original || {})">Only a Director can change a Director's account.</span>
              <span class="help" v-show="!panel.isMe && !canSignIn(panel.role)">This role can't sign in yet. Its pages come in a later increment.</span>
            </div>
            <!-- The properties they may see (12 Nov 2026, data access by property) -->
            <StaffPropertiesField v-if="panel.role !== 'director'" v-model="panel.properties" :properties="allProperties" :disabled="cantEdit" />
            <p class="help" v-else>A Director sees every property.</p>

            <!-- Page access: one tick per page, starting from the role's usual pages -->
            <div class="field" v-if="panel.role !== 'director'">
              <div class="perm-top">
                <label>Page access</label>
                <button type="button" class="link" @click="resetPerms()" :disabled="cantEdit || !panelCustom">Reset to {{ ROLE_LABEL[panel.role] }} defaults</button>
              </div>
              <span class="help">Starts with the role's usual pages. A tick gives full access to that page. Changing the role resets these ticks.</span>
              <div class="perm-wrap">
                <table class="perm-table">
                  <thead><tr><th>Page</th><th>Access</th></tr></thead>
                  <tbody>
                    <template v-for="grp in pageGroups" :key="grp.name">
                      <tr class="perm-grp"><td colspan="2">{{ grp.name }}<small v-if="GROUP_NOTES[grp.name]">{{ GROUP_NOTES[grp.name] }}</small></td></tr>
                      <tr v-for="row in grp.pages" :key="row.id" :class="{ on: rowState(row) !== 'off' }">
                        <td>{{ row.label }}<small class="muted" v-if="rowState(row) === 'some'"> · some pages only (tick to give all)</small></td>
                        <td>
                          <input type="checkbox" :checked="rowState(row) !== 'off'" :indeterminate.prop="rowState(row) === 'some'" :disabled="cantEdit" :aria-label="row.label" @change="tickRow(row, $event.target.checked)">
                        </td>
                      </tr>
                    </template>
                  </tbody>
                </table>
              </div>
              <span class="help">Always open for everyone: Dashboard, Issues, Playbook, SOPs, Raise a Complaint and Profile. Statement Approvals, Brand Logos, Staff accounts, Audit log and complaints can't be ticked: they follow the role.</span>
            </div>
            <p class="help" v-else>A Director can open and change every page.</p>

            <template v-if="panel.mode === 'edit'">
              <div>
                <div class="field">
                  <label for="sReason" :class="{ req: changedStatus }">Reason for the change</label>
                  <textarea class="input" id="sReason" v-model="panel.reason" placeholder="e.g. Covers Expenses while Accounting is on leave"></textarea>
                  <span class="help">Saved in the audit log with your name.</span>
                </div>
                <hr class="divider">
                <button type="button" class="btn" @click="sendReset()" :disabled="panel.busy">Send password reset email</button>
              </div>
            </template>
          </form>
          <div class="drawer-foot">
            <button class="btn" @click="close()">Cancel</button>
            <button class="btn" :class="changedStatus && !panel.active ? 'btn-danger' : 'btn-primary'" type="submit" form="staffForm" :disabled="panel.busy || locked(panel.original || {})">{{ panel.busy ? 'Saving…'
              : panel.mode === 'add' ? 'Send invite' : changedStatus ? (panel.active ? 'Save and turn back on' : 'Save and turn off') : 'Save changes' }}</button>
          </div>
        </aside>
      </div>
    </template>
  </main>
</template>

<script>
import { notifyUser } from '@/services/notificationService.js';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, updateProfile, signOut, sendPasswordResetEmail } from 'firebase/auth';
import { collection, doc, getDocs, serverTimestamp, writeBatch, query, where, limit, deleteField } from 'firebase/firestore';
import { friendlyError } from '@/lib/finance-data.js';
import { auth, db, ROLE_LABEL, ALLOWED_ROLES, BUILTIN_ROLES, CUSTOM_ROLES } from '@/lib/firebase.js';
import { firebaseConfig } from '@/firebase-config.js';
import { when } from '@/lib/format.js';
import { useSession } from '@/stores/session.js';
import OptionPicker from '@/components/OptionPicker.vue';
import { STATES, statesOf, statesText } from '@/lib/states.js';
import StaffPropertiesField from '@/components/StaffPropertiesField.vue';
import { PAGES, ACCESS_ROWS, rowPerms, GROUP_NOTES, PRESETS, permsOf, cleanPerms, samePerms, permLabel } from '@/lib/access.js';

const me = useSession();

const AUTH_ERRORS = {
  'auth/email-already-in-use': 'This email already has a login. If the person is missing from this list, ask Khairul to add their staff record with tools/set-role.js.',
  'auth/invalid-email': 'That email address does not look right.',
  'auth/network-request-failed': 'No internet connection. Try again.'
};

// The ticks a role starts with (Directors need none).
const presetOf = role => role === 'director' ? [] : cleanPerms(PRESETS[role] || []);
const sameList = (a, b) => [...a].sort().join('|') === [...b].sort().join('|');
// "+ Expenses & Others (edit), − Reports" for the audit log.
function permDiff(oldList, newList) {
  const added = newList.filter(p => !oldList.includes(p)).map(p => '+ ' + permLabel(p));
  const removed = oldList.filter(p => !newList.includes(p)).map(p => '− ' + permLabel(p));
  return [...added, ...removed].join(', ') || 'no change';
}

// Creates the login on a second, temporary Firebase app so the Director stays signed in.
async function createLogin(email, displayName) {
  const temp = initializeApp(firebaseConfig, 'staff-create-' + Date.now());
  try {
    const tempAuth = getAuth(temp);
    const pw = crypto.getRandomValues(new Uint32Array(4)).join('-') + 'Wb!';   // never shown; they set their own
    const cred = await createUserWithEmailAndPassword(tempAuth, email, pw);
    await updateProfile(cred.user, { displayName });
    await signOut(tempAuth);
    return cred.user.uid;
  } finally {
    await deleteApp(temp);
  }
}

// The property ids on a staff record (data access by property, 12 Nov 2026)
const propsOf = u => (Array.isArray(u?.properties) ? u.properties.filter(Boolean) : []);

function audit(batch, action, uid, changes, reason) {
  batch.set(doc(collection(db, 'auditLog')), {
    at: serverTimestamp(), uid: me.user.uid, userName: me.name, role: me.role,
    action, entity: `users/${uid}`, changes, reason: reason || ''
  });
}

export default {
  components: { OptionPicker, StaffPropertiesField },
  data() {
    return {
      ROLE_LABEL, CUSTOM_ROLES, GROUP_NOTES, when, STATES, statesText, noStateOnly: false, allProperties: [],
      myUid: me.user.uid,
      users: [], loading: true, error: '', okMsg: '',
      filter: 'active', roleFilter: '', search: '', changes: [], logsOpen: false, rolesOpen: false, logsLoading: false, logsError: '',
      filters: [{ key: 'active', label: 'Active' }, { key: 'off', label: 'Inactive' }],
      panel: {}, panelOpen: false
    };
  },
  computed: {
    // Built-in roles, then the ones made on the Roles page (turned-off roles left out).
    ROLES() { return [...BUILTIN_ROLES, ...Object.keys(CUSTOM_ROLES).filter(r => CUSTOM_ROLES[r].active)]; },
    roleOptions() { return [{ value: '', label: 'All roles' }, ...this.ROLES.map(r => ({ value: r, label: ROLE_LABEL[r] || r }))]; },
    roleChoices() { return me.role === 'director' ? this.ROLES : this.ROLES.filter(r => r !== 'director'); },
    // The tick table, one heading per group (Finance, Portfolio…).
    pageGroups() {
      const groups = [];
      for (const pg of ACCESS_ROWS) {
        let g = groups.find(x => x.name === pg.group);
        if (!g) groups.push(g = { name: pg.group, pages: [] });
        g.pages.push(pg);
      }
      return groups;
    },
    // True when the ticks in the panel differ from the role's usual pages.
    panelCustom() { return !samePerms(this.panel.perms || [], presetOf(this.panel.role)); },
    cantEdit() { return this.panel.isMe || this.locked(this.panel.original || {}); },
    // Account status as saved, and whether the panel changes it
    wasActive() { return this.panel.original ? this.panel.original.active !== false : true; },
    changedStatus() { return this.panel.mode === 'edit' && this.panel.active !== this.wasActive; },
    noStateCount() { return this.users.filter(u => this.needsState(u)).length; }
  },
  async mounted() {
    await this.load();
    if ('add' in this.$route.query) this.openAdd();
  },
  methods: {
    async load() {
      this.loading = true;
      try {
        // Every property, to pick from (Directors and HR manage staff; the list is not limited to their own properties)
        const [snap, ps] = await Promise.all([getDocs(collection(db, 'users')), getDocs(collection(db, 'properties')).catch(() => ({ docs: [] }))]);
        this.allProperties = ps.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => p.active !== false).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        this.users = snap.docs.map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.displayName || a.email || '').localeCompare(b.displayName || b.email || ''));
      } catch (e) {
        console.error(e);
        this.error = e.code === 'permission-denied'
          ? 'Firestore refused the read. Check the latest security rules are deployed.'
          : 'Could not load staff: ' + (e.message || e);
      }
      this.loading = false;
    },
    // Someone whose saved ticks differ from their role's usual pages.
    isCustom(u) { return u.role !== 'director' && Array.isArray(u.perms) && !samePerms(u.perms, presetOf(u.role)); },
    hasRoleFilter(u) { return (!this.roleFilter || u.role === this.roleFilter) && this.hasSearch(u) && (!this.noStateOnly || this.needsState(u)); },
    // An active account (not a Director) with no state: it sees no property data once the lock is on
    needsState(u) { return u.active !== false && u.role !== 'director' && !propsOf(u).length; },
    // "All (Director)" / "3 properties: Austin Hartamas, ..." / "None yet"
    propertiesText(u) {
      if (u.role === 'director') return 'All (Director)';
      const ids = propsOf(u); if (!ids.length) return 'None yet';
      const names = ids.map(id => this.allProperties.find(p => p.id === id)?.name || id);
      return ids.length <= 2 ? names.join(', ') : `${ids.length} properties`;
    },
    // Search box: name, email or role (incl. "Intern"), any part, case ignored
    hasSearch(u) { const q = this.search.trim().toLowerCase(); return !q || [u.displayName, u.email, this.roleText(u)].some(x => String(x || '').toLowerCase().includes(q)); },
    match(u, key) {
      if (key === 'all') return true;
      if (key === 'off') return u.active === false;
      if (key === 'active') return u.active !== false;
      return u.role === key;
    },
    count(key) { return this.users.filter(u => this.match(u, key) && this.hasRoleFilter(u)).length; },
    shown() { return this.users.filter(u => this.match(u, this.filter) && this.hasRoleFilter(u)); },
    roleText(u) { const r = ROLE_LABEL[u.role] || 'No role'; return u.intern ? `Intern (${r})` : r; },
    joined(ts) { const d = ts.toDate ? ts.toDate() : new Date(ts); return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); },

    // Tick table helpers. Ticking Edit also ticks View; unticking View also unticks Edit.
    has(perm) { return (this.panel.perms || []).includes(perm); },
    // 'on' = every permission of the row is ticked, 'some' = a few (an older custom set), 'off' = none
    rowState(row) {
      const all = rowPerms(row), have = all.filter(p => this.has(p)).length;
      return have === all.length ? 'on' : have ? 'some' : 'off';
    },
    tickRow(row, on) {
      const set = new Set(this.panel.perms || []);
      for (const p of rowPerms(row)) on ? set.add(p) : set.delete(p);
      this.panel.perms = cleanPerms([...set]);
    },
    tick(pg, level, on) {
      const set = new Set(this.panel.perms || []);
      const view = pg.key + '.view', edit = pg.key + '.edit';
      if (level === 'view') { if (on) set.add(view); else { set.delete(view); set.delete(edit); } }
      else if (on) { set.add(edit); if (!pg.editOnly) set.add(view); }
      else set.delete(edit);
      this.panel.perms = cleanPerms([...set]);
    },
    resetPerms() { this.panel.perms = presetOf(this.panel.role); },

    openLogs() { this.logsOpen = true; this.loadChanges(); },
    // Staff account entries only, read when the Logs panel is opened (not on every visit to this page).
    async loadChanges() {
      this.logsLoading = true; this.logsError = '';
      try {
        const snap = await getDocs(query(collection(db, 'auditLog'), where('action', 'in', ['staff.create', 'staff.update']), limit(100)));
        const nameOf = id => { const u = this.users.find(x => x.id === id); return u ? (u.displayName || u.email) : 'a removed account'; };
        this.changes = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(a => (a.entity || '').startsWith('users/'))
          .sort((a, b) => (b.at?.toMillis?.() || 0) - (a.at?.toMillis?.() || 0)).map(a => {
          const who = nameOf(a.entity.slice(6)), at = a.at ? this.joined(a.at) : '';
          let what;
          if (a.action === 'staff.create') {
            const extra = (a.changes || []).find(c => c.field === 'perms');
            what = `${a.userName} invited ${who} as ${ROLE_LABEL[a.changes?.[0]?.new] || 'staff'}` + (extra ? ` with custom page access (${permDiff(extra.old || [], extra.new || [])})` : '');
          } else {
            what = `${a.userName} ` + (a.changes || []).map(c =>
              c.field === 'active' ? (c.new ? `turned ${who} back on` : `turned off ${who}`)
              : c.field === 'role' ? `changed ${who} from ${ROLE_LABEL[c.old] || 'no role'} to ${ROLE_LABEL[c.new]}`
              : c.field === 'perms' ? `changed ${who}'s page access: ${permDiff(c.old || [], c.new || [])}`
              : c.field === 'properties' ? `changed ${who}'s properties (${(c.old || []).length} to ${(c.new || []).length})`
              : c.field === 'states' ? `changed ${who}'s states from ${(c.old || []).join(', ') || 'none'} to ${(c.new || []).join(', ') || 'none'}`
              : `renamed ${c.old || who} to ${c.new}`).join(', ');
          }
          return { id: a.id, text: `${at} · ${what}${a.reason && a.action !== 'staff.create' ? ` · reason: "${a.reason}"` : ''}` };
        });
      } catch (e) { console.warn('audit read', e); this.changes = []; this.logsError = friendlyError(e, 'load the logs'); }
      this.logsLoading = false;
    },
    roleColour(r) { return { director: 'red', finance: 'blue', it: 'grey', operations: 'amber', hr: 'green', procurement: 'grey', marketing: 'amber' }[r] || 'grey'; },
    canSignIn(r) { return ALLOWED_ROLES.includes(r); },
    // HR manages staff accounts too, but can't touch Directors or make anyone a Director (the rules refuse it as well).
    locked(u) { return me.role !== 'director' && u.role === 'director'; },

    openAdd() {
      this.okMsg = '';
      this.panelOpen = true;
      this.panel = { mode: 'add', displayName: '', email: '', role: 'finance', perms: presetOf('finance'), properties: [], active: true, reason: '', isMe: false, busy: false, error: '' };
    },
    openEdit(u) {
      this.okMsg = '';
      this.panelOpen = true;
      this.panel = { mode: 'edit', id: u.id, original: u, displayName: u.displayName || '', email: u.email, role: u.role || 'finance',
        perms: cleanPerms(permsOf({ role: u.role || 'finance', perms: u.perms })), properties: propsOf(u), active: u.active !== false, reason: '', isMe: u.id === this.myUid, busy: false, error: '' };
    },
    close() { if (!this.panel.busy) this.panelOpen = false; },

    async save() {
      const p = this.panel;
      p.error = '';
      const name = p.displayName.trim(), email = p.email.trim().toLowerCase();
      // Saved only when different from the role's usual pages, so later changes to a role's defaults still reach them.
      const perms = p.role === 'director' ? [] : cleanPerms(p.perms);
      const custom = p.role !== 'director' && !samePerms(perms, presetOf(p.role));
      const properties = p.role === 'director' ? [] : [...new Set(p.properties || [])].sort();   // Directors: always every property
      if (!name) return p.error = 'Enter their full name.';
      if (p.mode === 'add' && p.role !== 'director' && !properties.length) return p.error = 'Choose at least one property.';
      if (p.mode === 'add') {
        if (!email) return p.error = 'Enter their work email.';
        if (this.users.some(u => (u.email || '').toLowerCase() === email)) return p.error = 'Someone on the list already uses this email.';
      }
      p.busy = true;
      try {
        const batch = writeBatch(db);
        if (p.mode === 'add') {
          const uid = await createLogin(email, name);
          batch.set(doc(db, 'users', uid), {
            displayName: name, email, role: p.role, active: true, properties,
            ...(custom ? { perms } : {}),
            createdAt: serverTimestamp(), createdBy: me.user.uid, createdByName: me.name
          });
          const changes = [{ field: 'role', old: null, new: p.role }];
          if (custom) changes.push({ field: 'perms', old: presetOf(p.role), new: perms });
          if (properties.length) changes.push({ field: 'properties', old: [], new: properties });
          audit(batch, 'staff.create', uid, changes, 'New staff account');
          await batch.commit();
          try { await sendPasswordResetEmail(auth, email); } catch (_) {}
          this.okMsg = `${name} added as ${ROLE_LABEL[p.role]}${custom ? ' with custom page access' : ''}. A set-password email is on its way to ${email}.`;
        } else {
          const o = p.original, changes = [];
          const oldPerms = o.role === 'director' ? [] : cleanPerms(permsOf({ role: o.role, perms: o.perms }));
          if (name !== (o.displayName || '')) changes.push({ field: 'displayName', old: o.displayName || '', new: name });
          if (p.role !== o.role) changes.push({ field: 'role', old: o.role || null, new: p.role });
          if (!samePerms(perms, oldPerms)) changes.push({ field: 'perms', old: oldPerms, new: perms });
          if (p.role !== 'director' && !sameList(properties, propsOf(o))) changes.push({ field: 'properties', old: propsOf(o), new: properties });
          if (p.active !== (o.active !== false)) changes.push({ field: 'active', old: o.active !== false, new: p.active });
          if (!changes.length) { p.busy = false; this.panelOpen = false; return; }
          if (!p.reason.trim()) { p.busy = false; return p.error = 'Add a short reason. It goes in the audit log.'; }
          batch.update(doc(db, 'users', p.id), {
            displayName: name, role: p.role, active: p.active, perms: custom ? perms : deleteField(), ...(p.role === 'director' ? {} : { properties }),
            updatedAt: serverTimestamp(), updatedBy: me.user.uid, updatedByName: me.name
          });
          audit(batch, 'staff.update', p.id, changes, p.reason.trim());
          await batch.commit();
          this.okMsg = `${name} updated. Changes apply the next time they open a page.`;
          // The person hears that their role or page access changed (3 Nov 2026). Not for switched-off accounts or yourself.
          const roleChanged = p.role !== o.role, accessChanged = changes.some(c => c.field === 'perms' || c.field === 'properties');
          if ((roleChanged || accessChanged) && p.active && p.id !== me.user.uid)
            notifyUser({ recipientUid: p.id, type: 'access', link: '/', refId: p.id,
              title: roleChanged ? `Your role is now ${ROLE_LABEL[p.role] || p.role}` : 'Your page access changed',
              message: `${me.name} changed your ${roleChanged && accessChanged ? 'role and pages' : roleChanged ? 'role' : 'pages'}. Reason: ${p.reason.trim()}. Reload a page to see the change.` })
              .catch(e => console.warn('Notification not sent:', e));
        }
        p.busy = false;
        this.panelOpen = false;
        await this.load();
      } catch (e) {
        console.error(e);
        p.busy = false;
        p.error = AUTH_ERRORS[e.code] || (e.code === 'permission-denied'
          ? 'Firestore refused the change. Check the latest security rules are deployed.'
          : 'Could not save: ' + (e.message || e));
      }
    },

    async sendReset() {
      const p = this.panel;
      p.busy = true; p.error = '';
      try {
        await sendPasswordResetEmail(auth, p.email);
        this.okMsg = `Password reset email sent to ${p.email}.`;
        this.panelOpen = false;
      } catch (e) { p.error = AUTH_ERRORS[e.code] || 'Could not send the email.'; }
      p.busy = false;
    }
  }
};
</script>

<style scoped>
    /* Active / Inactive switch: two equal tabs; the white pill (thumb) slides under the picked one (as on Issues) */
    .staff-seg { --i: 0; position: relative; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); flex: none; width: 240px; height: 40px;
      padding: 3px; border-radius: 10px; background: var(--chip); border: 1px solid var(--border); box-sizing: border-box; }
    .staff-thumb { position: absolute; top: 3px; bottom: 3px; left: 3px; width: calc((100% - 6px) / 2); border-radius: 7px;
      background: var(--surface); box-shadow: 0 1px 3px rgba(0,0,0,.12), 0 0 0 1px var(--border);
      transform: translateX(calc(var(--i) * 100%)); transition: transform .28s cubic-bezier(.4, 0, .2, 1); }
    .staff-seg button { position: relative; z-index: 1; display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-width: 0;
      border: 0; background: none; padding: 0 8px; border-radius: 7px; font: inherit; font-size: 13px; font-weight: 600;
      color: var(--muted); cursor: pointer; white-space: nowrap; transition: color .2s ease, transform .1s ease; }
    .staff-seg button:hover, .staff-seg button.on { color: var(--text); }
    .staff-seg .n { min-width: 18px; padding: 0 6px; border-radius: 999px; font-size: 11px; line-height: 18px; text-align: center;
      background: color-mix(in srgb, var(--muted) 18%, transparent); color: var(--text-2); transition: background .2s ease, color .2s ease; }
    .staff-seg button.on .n { background: var(--accent); color: #fff; }
    .staff-seg button:active { transform: scale(.97); }
    .staff-swap-enter-active { transition: opacity .2s ease, transform .2s ease; }
    .staff-swap-leave-active { transition: opacity .12s ease, transform .12s ease; }
    .staff-swap-enter-from { opacity: 0; transform: translateY(6px); }
    .staff-swap-leave-to { opacity: 0; transform: translateY(-4px); }
    @media (prefers-reduced-motion: reduce) { .staff-thumb, .staff-swap-enter-active, .staff-swap-leave-active { transition: none; } }
    @media (max-width: 640px) { .staff-seg { width: 100%; } }
    .head-tools.push { margin-left: auto; display: flex; gap: 8px; }
    .info-btn { padding: 8px 10px; color: var(--accent); border: 1.5px solid var(--accent); }
    .info-btn:hover { background: var(--accent-soft); }
    .staff-filters { margin-bottom: 16px; display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
    .staff-search { width: 260px; max-width: 100%; }
    /* No sideways scroll (12 Nov 2026): the table fits the page and long text wraps instead */
    .staff-wrap { overflow-x: hidden; }
    .staff-table { width: 100%; table-layout: auto; }
    .staff-table td { white-space: normal; overflow-wrap: anywhere; }
    .staff-table td:nth-child(2) { min-width: 160px; }
    .staff-table .pill, .staff-table .act-pill, .staff-table .custom-tag { white-space: nowrap; }
    /* Long names wrap onto the next line instead of widening the table (4 Nov 2026) */
    .staff-table td:first-child { white-space: normal; overflow-wrap: anywhere; min-width: 140px; max-width: 220px; }
    .custom-tag { margin: 0 0 0 6px; }
    /* Account status card in the edit panel */
    .acct { border: 1px solid var(--border); border-radius: 12px; padding: 12px; margin-bottom: 16px; background: var(--surface); }
    .acct-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
    .acct-opts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .acct-opt { display: flex; gap: 10px; align-items: flex-start; text-align: left; padding: 10px 12px; border: 1.5px solid var(--border); border-radius: 10px;
      background: var(--surface); color: var(--text); font: inherit; cursor: pointer; transition: border-color .15s ease, background .15s ease; }
    .acct-opt b { display: block; font-size: 14px; }
    .acct-opt small { display: block; font-size: 12px; color: var(--muted); margin-top: 2px; line-height: 1.4; }
    .acct-dot { flex: none; width: 12px; height: 12px; margin-top: 3px; border-radius: 50%; border: 2px solid var(--muted); }
    .acct-opt:hover:not(:disabled) { border-color: var(--text-2); }
    .acct-opt:disabled { cursor: not-allowed; opacity: .6; }
    .on-opt.picked { border-color: var(--green, #2e7d32); background: color-mix(in srgb, var(--green, #2e7d32) 9%, transparent); }
    .on-opt.picked .acct-dot { border-color: var(--green, #2e7d32); background: var(--green, #2e7d32); }
    .off-opt.picked { border-color: var(--danger, #c0392b); background: color-mix(in srgb, var(--danger, #c0392b) 8%, transparent); }
    .off-opt.picked .acct-dot { border-color: var(--danger, #c0392b); background: var(--danger, #c0392b); }
    .acct-note { margin-top: 10px; font-size: 13px; padding: 8px 10px; border-radius: 8px; }
    .acct-note.off { color: var(--danger, #c0392b); background: color-mix(in srgb, var(--danger, #c0392b) 8%, transparent); }
    .acct-note.on { color: var(--green, #2e7d32); background: color-mix(in srgb, var(--green, #2e7d32) 9%, transparent); }
    @media (max-width: 480px) { .acct-opts { grid-template-columns: minmax(0, 1fr); } }
    .states-cell { white-space: normal !important; min-width: 110px; }
    .states-cell.no-state { color: var(--danger, #c0392b); font-weight: 600; }
    .no-state-note { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
    .name-btn { border: 0; background: none; padding: 0; font: inherit; color: var(--text); cursor: pointer; text-align: left; }
    .name-btn:hover { text-decoration: underline; }
    .row-acts { text-align: left; }
    .row-acts span { display: inline-flex; gap: 6px; }
    .staff-note { margin: 12px 0 0; }
    .changes { display: grid; gap: 8px; font-size: 12px; color: var(--text-2); }
    .role-list { display: grid; gap: 8px; margin: 14px 0 6px; max-height: 60vh; overflow: auto; }
    .role-list > div { display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: 16px; align-items: start; padding: 12px 14px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); }
    .role-list b { font-size: 13px; color: var(--accent); }
    .role-list span { font-size: 14px; line-height: 1.5; color: var(--text); }
    @media (max-width: 520px) { .role-list > div { grid-template-columns: minmax(0, 1fr); gap: 4px; } }

    /* Page access tick table */
    .perm-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
    .perm-top .link:disabled { color: var(--muted); cursor: default; text-decoration: none; }
    .perm-wrap { border: 1px solid var(--border); border-radius: 10px; overflow: hidden; margin: 4px 0; }
    .perm-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .perm-table th { text-align: left; font-size: 12px; font-weight: 500; color: var(--muted); background: var(--head); padding: 8px 12px; border-bottom: 1px solid var(--border); }
    .perm-table th:not(:first-child), .perm-table td:not(:first-child) { width: 56px; text-align: center; }
    .perm-table td { padding: 8px 12px; border-bottom: 1px solid var(--line); transition: background var(--fast, .15s); }
    .perm-table tr:last-child td { border-bottom: 0; }
    .perm-table tr.on td { background: var(--accent-soft); }
    .perm-table tr.on td:first-child { color: var(--accent); font-weight: 600; }
    .perm-table .perm-grp td { background: var(--hover); font-size: 11px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--text-2); text-align: left; }
    .perm-table .perm-grp small { display: block; font-size: 11px; font-weight: 400; letter-spacing: 0; text-transform: none; color: var(--muted); margin-top: 2px; }
    .perm-table input { width: 16px; height: 16px; accent-color: var(--accent); cursor: pointer; }
    .perm-table input:disabled { cursor: not-allowed; }
.fit-picker :deep(.op) { display: block; width: 100%; }
/* The picker's own root carries .fit-picker (the rule above only reaches inner .op), so it is sized here (13 Nov 2026) */
.fit-picker { display: block; width: 100%; min-width: 0; max-width: 100%; }
.fit-picker :deep(.op-btn), .fit-picker :deep(.op-input) { width: 100%; text-align: left; }
.fit-picker :deep(.op-pop) { width: 100%; max-width: none; }
/* Edit staff panel (13 Nov 2026): never scrolls sideways; anything too wide wraps or is cut off with "…" */
.drawer-body { overflow-x: hidden; }
.drawer-body > *, .drawer-body .field { min-width: 0; max-width: 100%; }
.drawer-body .help, .perm-table td { overflow-wrap: anywhere; }
.fit-picker :deep(.op-btn) { overflow: hidden; min-width: 0; }
.fit-picker :deep(.op-val) { display: block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>