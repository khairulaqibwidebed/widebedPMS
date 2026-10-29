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

    <div class="notice error" v-show="error">{{ error }}</div>
    <div class="notice ok" v-show="okMsg">{{ okMsg }}</div>

    <div class="staff-filters">
      <div class="pills brand">
        <template v-for="f in filters" :key="f.key">
          <button class="pill-btn" :class="{ on: filter === f.key }" @click="filter = f.key">{{ `${f.label} (${count(f.key)})` }}</button>
        </template>
      </div>
      <OptionPicker v-model="roleFilter" :options="roleOptions" label="Filter by role" />
      <div class="head-tools push">
        <button class="btn" @click="openLogs()">Logs</button>
        <button class="btn btn-primary" @click="openAdd()">+ Invite staff</button>
      </div>
    </div>

    <Paged :items="shown()" v-slot="{ pageRows }">
    <div class="table-wrap soft-wrap">
      <table class="table staff-table hover-rows">
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Last sign-in</th><th>Active</th><th>Joined</th><th></th></tr></thead>
        <tbody>
          <template v-for="row in pageRows" :key="row.id">
            <tr>
              <td><button class="name-btn" @click="openEdit(row)">{{ row.displayName || '(no name)' }}</button><span class="you" v-show="row.id === myUid">You</span></td>
              <td>{{ row.email }}</td>
              <td>
                {{ roleText(row) }}
                <span class="tag custom-tag" v-if="isCustom(row)" title="Page access changed from the role's usual pages">Custom access</span>
              </td>
              <td>{{ row.lastLoginAt ? when(row.lastLoginAt) : 'Never' }}</td>
              <td><span class="pill" :class="row.active === false ? 'grey' : 'green'">{{ row.active === false ? 'Turned off' : 'Active' }}</span></td>
              <td>{{ row.createdAt ? joined(row.createdAt) : '—' }}</td>
              <td class="row-acts">
                <template v-if="row.id === myUid || locked(row)"><span class="muted">—</span></template>
                <template v-if="row.id !== myUid && !locked(row) && row.active !== false">
                  <span><button class="act-pill" @click="openEdit(row)">Change access</button><button class="act-pill danger" @click="openToggle(row)">Turn off</button></span>
                </template>
                <template v-if="row.id !== myUid && !locked(row) && row.active === false">
                  <button class="act-pill good" @click="openToggle(row)">Turn back on</button>
                </template>
              </td>
            </tr>
          </template>
          <tr v-show="!loading && !shown().length"><td colspan="7" class="muted">No staff match.</td></tr>
        </tbody>
      </table>
    </div>
    </Paged>
    <p class="note staff-note">Changing a role, page access or turning an account off asks for a reason and is saved in the audit log. Nothing is deleted.</p>

    <!-- Account log: read only when it is opened -->
    <template v-if="logsOpen">
      <div class="drawer-back" @click="logsOpen = false"></div>
      <aside class="drawer wide" role="dialog" aria-label="Account logs" v-esc="() => { logsOpen = false }">
        <div class="drawer-head"><h2>Account logs</h2><button class="icon-btn" @click="logsOpen = false" aria-label="Close">×</button></div>
        <div class="drawer-body">
          <p class="help" style="margin:0 0 12px">Who was invited, who changed role or page access and who was turned off or back on, newest first.</p>
          <div class="notice error" v-show="logsError">{{ logsError }}</div>
          <div class="empty" v-show="logsLoading">Loading…</div>
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
        <div><b>Finance</b><span>Upload eZee, expenses, month-end payout, exports.</span></div>
        <div><b>IT</b><span>View-only, personal details hidden, except on Issues: raises, comments on and completes tickets tagged IT. Sees Issues, offline inquiries (no names), Playbook and SOPs for now.</span></div>
        <div><b>Operations</b><span>Issues, offline inquiries assigned to them, booking forms, Playbook and SOPs.</span></div>
        <div><b>HR</b><span>SOP pages, complaints, Playbook, Staff accounts and Audit log, Issues.</span></div>
        <div><b>Procurement</b><span>The Fillout form links, Issues, Playbook and SOPs.</span></div>
        <div><b>Marketing</b><span>Issues, Playbook and SOPs for now. Own pages come later.</span></div>
        <div><b>Page access</b><span>Each role starts with its usual pages ticked. You can tick View or Edit on any other page, or untick a usual one. Statement Approvals, Brand Logos, Staff accounts, Audit log and complaints always follow the role.</span></div>
      </div>
        <div class="modal-foot"><button class="btn" @click="rolesOpen = false">Close</button></div>
      </div>
    </div>

    <!-- Turn off / Turn back on -->
    <template v-if="panelOpen && panel.quick">
      <div class="modal-back" @click.self="close()" v-esc="() => { close() }">
        <form class="modal" role="dialog" :aria-label="panel.active ? 'Turn account back on' : 'Turn account off'" @submit.prevent="save()">
          <h2>{{ (panel.active ? 'Turn back on: ' : 'Turn off: ') + panel.displayName }}</h2>
          <p class="help">{{ panel.active ? 'They can sign in again with their old password, or use Forgot password.' : 'They can no longer sign in or see anything. Their history stays.' }}</p>
          <div class="notice error" v-show="panel.error">{{ panel.error }}</div>
          <div class="field">
            <label for="qReason">Reason</label>
            <textarea class="input" id="qReason" v-model="panel.reason" placeholder="e.g. Left the company"></textarea>
            <span class="help">Saved in the audit log with your name.</span>
          </div>
          <div class="modal-foot">
            <button type="button" class="btn" @click="close()">Cancel</button>
            <button class="btn btn-primary" type="submit" :disabled="panel.busy">{{ panel.busy ? 'Saving…' : (panel.active ? 'Turn back on' : 'Turn off') }}</button>
          </div>
        </form>
      </div>
    </template>

    <!-- Add / Edit panel -->
    <template v-if="panelOpen && !panel.quick">
      <div>
        <div class="drawer-back" @click="close()"></div>
        <aside class="drawer" role="dialog" :aria-label="panel.mode === 'add' ? 'Add staff' : 'Edit staff'" v-esc="() => { close() }">
          <div class="drawer-head">
            <h2>{{ panel.mode === 'add' ? 'Invite staff' : 'Edit staff' }}</h2>
            <button class="icon-btn" @click="close()" aria-label="Close">×</button>
          </div>
          <form class="drawer-body" id="staffForm" @submit.prevent="save()">
            <div class="notice error" v-show="panel.error">{{ panel.error }}</div>
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
              <label for="sRole">Role</label>
              <select class="input" id="sRole" v-model="panel.role" :disabled="cantEdit" @change="resetPerms()">
                <template v-for="r in roleChoices" :key="r"><option :value="r" :selected="r === panel.role">{{ ROLE_LABEL[r] }}</option></template>
              </select>
              <span class="help" v-show="panel.isMe">You can't change your own access. Ask another Director.</span>
              <span class="help" v-show="!panel.isMe && locked(panel.original || {})">Only a Director can change a Director's account.</span>
              <span class="help" v-show="!panel.isMe && !canSignIn(panel.role)">This role can't sign in yet. Its pages come in a later increment.</span>
            </div>

            <!-- Page access: View / Edit ticks per page, starting from the role's usual pages -->
            <div class="field" v-if="panel.role !== 'director'">
              <div class="perm-top">
                <label>Page access</label>
                <button type="button" class="link" @click="resetPerms()" :disabled="cantEdit || !panelCustom">Reset to {{ ROLE_LABEL[panel.role] }} defaults</button>
              </div>
              <span class="help">Starts with the role's usual pages. Edit includes View. Changing the role resets these ticks.</span>
              <div class="perm-wrap">
                <table class="perm-table">
                  <thead><tr><th>Page</th><th>View</th><th>Edit</th></tr></thead>
                  <tbody>
                    <template v-for="grp in pageGroups" :key="grp.name">
                      <tr class="perm-grp"><td colspan="3">{{ grp.name }}<small v-if="GROUP_NOTES[grp.name]">{{ GROUP_NOTES[grp.name] }}</small></td></tr>
                      <tr v-for="pg in grp.pages" :key="pg.key" :class="{ on: has(pg.key + '.view') || has(pg.key + '.edit') }">
                        <td>{{ pg.label }}</td>
                        <td>
                          <span v-if="pg.editOnly" class="muted" title="Everyone can view this">✓</span>
                          <input v-else type="checkbox" :checked="has(pg.key + '.view')" :disabled="cantEdit" :aria-label="'View ' + pg.label" @change="tick(pg, 'view', $event.target.checked)">
                        </td>
                        <td>
                          <span v-if="pg.viewOnly" class="muted" title="Nothing to change on this page">—</span>
                          <input v-else type="checkbox" :checked="has(pg.key + '.edit')" :disabled="cantEdit" :aria-label="'Edit ' + pg.label" @change="tick(pg, 'edit', $event.target.checked)">
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
                <label class="switch">
                  <span><b>Account active</b><br><span class="help">Turned off = can't sign in or see anything. Their history stays.</span></span>
                  <input type="checkbox" v-model="panel.active" :disabled="cantEdit">
                </label>
                <div class="field">
                  <label for="sReason">Reason for the change</label>
                  <textarea class="input" id="sReason" v-model="panel.reason" placeholder="e.g. Covers Expenses while Finance is on leave"></textarea>
                  <span class="help">Saved in the audit log with your name.</span>
                </div>
                <hr class="divider">
                <button type="button" class="btn" @click="sendReset()" :disabled="panel.busy">Send password reset email</button>
              </div>
            </template>
          </form>
          <div class="drawer-foot">
            <button class="btn" @click="close()">Cancel</button>
            <button class="btn btn-primary" type="submit" form="staffForm" :disabled="panel.busy || locked(panel.original || {})">{{ panel.busy ? 'Saving…' : (panel.mode === 'add' ? 'Send invite' : 'Save changes') }}</button>
          </div>
        </aside>
      </div>
    </template>
  </main>
</template>

<script>
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, updateProfile, signOut, sendPasswordResetEmail } from 'firebase/auth';
import { collection, doc, getDocs, serverTimestamp, writeBatch, query, where, limit, deleteField } from 'firebase/firestore';
import { friendlyError } from '@/lib/finance-data.js';
import { auth, db, ROLE_LABEL, ALLOWED_ROLES } from '@/lib/firebase.js';
import { firebaseConfig } from '@/firebase-config.js';
import { when } from '@/lib/format.js';
import { useSession } from '@/stores/session.js';
import OptionPicker from '@/components/OptionPicker.vue';
import { PAGES, GROUP_NOTES, PRESETS, permsOf, cleanPerms, samePerms, permLabel } from '@/lib/access.js';

const me = useSession();

const ROLES = ['director', 'finance', 'it', 'operations', 'hr', 'procurement', 'marketing'];
const AUTH_ERRORS = {
  'auth/email-already-in-use': 'This email already has a login. If the person is missing from this list, ask Khairul to add their staff record with tools/set-role.js.',
  'auth/invalid-email': 'That email address does not look right.',
  'auth/network-request-failed': 'No internet connection. Try again.'
};

// The ticks a role starts with (Directors need none).
const presetOf = role => role === 'director' ? [] : cleanPerms(PRESETS[role] || []);
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

function audit(batch, action, uid, changes, reason) {
  batch.set(doc(collection(db, 'auditLog')), {
    at: serverTimestamp(), uid: me.user.uid, userName: me.name, role: me.role,
    action, entity: `users/${uid}`, changes, reason: reason || ''
  });
}

export default {
  components: { OptionPicker },
  data() {
    return {
      ROLES, ROLE_LABEL, GROUP_NOTES, when,
      myUid: me.user.uid,
      users: [], loading: true, error: '', okMsg: '',
      filter: 'all', roleFilter: '', changes: [], logsOpen: false, rolesOpen: false, logsLoading: false, logsError: '',
      filters: [{ key: 'all', label: 'All' }, { key: 'active', label: 'Active' }, { key: 'off', label: 'Turned off' }],
      panel: {}, panelOpen: false
    };
  },
  computed: {
    roleOptions() { return [{ value: '', label: 'All roles' }, ...ROLES.map(r => ({ value: r, label: ROLE_LABEL[r] || r }))]; },
    roleChoices() { return me.role === 'director' ? ROLES : ROLES.filter(r => r !== 'director'); },
    // The tick table, one heading per group (Finance, Portfolio…).
    pageGroups() {
      const groups = [];
      for (const pg of PAGES) {
        let g = groups.find(x => x.name === pg.group);
        if (!g) groups.push(g = { name: pg.group, pages: [] });
        g.pages.push(pg);
      }
      return groups;
    },
    // True when the ticks in the panel differ from the role's usual pages.
    panelCustom() { return !samePerms(this.panel.perms || [], presetOf(this.panel.role)); },
    cantEdit() { return this.panel.isMe || this.locked(this.panel.original || {}); }
  },
  async mounted() {
    await this.load();
    if ('add' in this.$route.query) this.openAdd();
  },
  methods: {
    async load() {
      this.loading = true;
      try {
        const snap = await getDocs(collection(db, 'users'));
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
    hasRoleFilter(u) { return !this.roleFilter || u.role === this.roleFilter; },
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
      this.panel = { mode: 'add', displayName: '', email: '', role: 'finance', perms: presetOf('finance'), active: true, reason: '', isMe: false, busy: false, error: '' };
    },
    openEdit(u) {
      this.okMsg = '';
      this.panelOpen = true;
      this.panel = { mode: 'edit', id: u.id, original: u, displayName: u.displayName || '', email: u.email, role: u.role || 'finance',
        perms: cleanPerms(permsOf({ role: u.role || 'finance', perms: u.perms })), active: u.active !== false, reason: '', isMe: u.id === this.myUid, busy: false, error: '' };
    },
    openToggle(u) {
      this.openEdit(u);
      this.panel.active = u.active === false;
      this.panel.quick = true;
    },
    close() { if (!this.panel.busy) this.panelOpen = false; },

    async save() {
      const p = this.panel;
      p.error = '';
      const name = p.displayName.trim(), email = p.email.trim().toLowerCase();
      // Saved only when different from the role's usual pages, so later changes to a role's defaults still reach them.
      const perms = p.role === 'director' ? [] : cleanPerms(p.perms);
      const custom = p.role !== 'director' && !samePerms(perms, presetOf(p.role));
      if (!name) return p.error = 'Enter their full name.';
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
            displayName: name, email, role: p.role, active: true,
            ...(custom ? { perms } : {}),
            createdAt: serverTimestamp(), createdBy: me.user.uid, createdByName: me.name
          });
          const changes = [{ field: 'role', old: null, new: p.role }];
          if (custom) changes.push({ field: 'perms', old: presetOf(p.role), new: perms });
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
          if (p.active !== (o.active !== false)) changes.push({ field: 'active', old: o.active !== false, new: p.active });
          if (!changes.length) { p.busy = false; this.panelOpen = false; return; }
          if (!p.reason.trim()) { p.busy = false; return p.error = 'Add a short reason. It goes in the audit log.'; }
          batch.update(doc(db, 'users', p.id), {
            displayName: name, role: p.role, active: p.active, perms: custom ? perms : deleteField(),
            updatedAt: serverTimestamp(), updatedBy: me.user.uid, updatedByName: me.name
          });
          audit(batch, 'staff.update', p.id, changes, p.reason.trim());
          await batch.commit();
          this.okMsg = `${name} updated. Changes apply the next time they open a page.`;
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
    .head-tools.push { margin-left: auto; display: flex; gap: 8px; }
    .info-btn { padding: 8px 10px; color: var(--accent); border: 1.5px solid var(--accent); }
    .info-btn:hover { background: var(--accent-soft); }
    .staff-filters { margin-bottom: 16px; display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
    .staff-table td { white-space: nowrap; }
    .custom-tag { margin: 0 0 0 6px; }
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
</style>