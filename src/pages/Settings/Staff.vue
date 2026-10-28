<template>
  <main class="content">
    <div class="loading-bar" v-show="loading"></div>

    <div class="page-head">
      <div>
        <h1>Staff accounts</h1>
        <div class="sub">Director and HR. Invite staff, set their role, and turn accounts off when someone leaves.</div>
      </div>
      <button class="btn btn-primary" @click="openAdd()">+ Invite staff</button>
    </div>

    <div class="notice error" v-show="error">{{ error }}</div>
    <div class="notice ok" v-show="okMsg">{{ okMsg }}</div>

    <div class="staff-filters">
      <div class="pills brand">
        <template v-for="f in filters" :key="f.key">
          <button class="pill-btn" :class="{ on: filter === f.key }" @click="filter = f.key">{{ `${f.label} (${count(f.key)})` }}</button>
        </template>
      </div>
      <select class="select" v-model="roleFilter" aria-label="Filter by role">
        <option value="">All roles</option>
        <template v-for="r in ROLES" :key="r"><option :value="r">{{ ROLE_LABEL[r] || r }}</option></template>
      </select>
    </div>

    <div class="table-wrap soft-wrap">
      <table class="table staff-table hover-rows">
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Last sign-in</th><th>Active</th><th>Joined</th><th></th></tr></thead>
        <tbody>
          <template v-for="row in shown()" :key="row.id">
            <tr>
              <td><button class="name-btn" @click="openEdit(row)">{{ row.displayName || '(no name)' }}</button><span class="you" v-show="row.id === myUid">You</span></td>
              <td>{{ row.email }}</td>
              <td>{{ roleText(row) }}</td>
              <td>{{ row.lastLoginAt ? when(row.lastLoginAt) : 'Never' }}</td>
              <td><span class="pill" :class="row.active === false ? 'grey' : 'green'">{{ row.active === false ? 'Turned off' : 'Active' }}</span></td>
              <td>{{ row.createdAt ? joined(row.createdAt) : '—' }}</td>
              <td class="row-acts">
                <template v-if="row.id === myUid || locked(row)"><span class="muted">—</span></template>
                <template v-if="row.id !== myUid && !locked(row) && row.active !== false">
                  <span><button class="act-pill" @click="openEdit(row)">Change role</button><button class="act-pill danger" @click="openToggle(row)">Turn off</button></span>
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
    <p class="note staff-note">Changing a role or turning an account off asks for a reason and is saved in the audit log. Nothing is deleted.</p>

    <section class="card" style="margin-top:20px">
      <div class="card-head"><h2>Recent account changes</h2></div>
      <div class="changes">
        <template v-for="c in changes" :key="c.id"><div>{{ c.text }}</div></template>
        <div class="empty" v-show="!changes.length">No account changes yet.</div>
      </div>
    </section>

    <section class="card" style="margin-top:20px">
      <div class="card-head"><h2>What each role can do</h2></div>
      <div class="role-list">
        <div><b>Director</b><span>Everything, including Staff accounts and Director Override.</span></div>
        <div><b>Finance</b><span>Upload eZee, expenses, month-end payout, exports.</span></div>
        <div><b>IT</b><span>View-only, personal details hidden, except on Issues: raises, comments on and completes tickets tagged IT. Sees Issues, offline inquiries (no names), Playbook and SOPs for now.</span></div>
        <div><b>Operations</b><span>Issues, offline inquiries assigned to them, booking forms, Playbook and SOPs.</span></div>
        <div><b>HR</b><span>SOP pages, complaints, Playbook, Staff accounts and Audit log, Issues.</span></div>
        <div><b>Procurement</b><span>The Fillout form links, Issues, Playbook and SOPs.</span></div>
        <div><b>Marketing</b><span>Issues, Playbook and SOPs for now. Own pages come later.</span></div>
      </div>
    </section>

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
              <select class="input" id="sRole" v-model="panel.role" :disabled="panel.isMe || locked(panel.original || {})">
                <template v-for="r in roleChoices" :key="r"><option :value="r" :selected="r === panel.role">{{ ROLE_LABEL[r] }}</option></template>
              </select>
              <span class="help" v-show="panel.isMe">You can't change your own role. Ask another Director.</span>
              <span class="help" v-show="!panel.isMe && locked(panel.original || {})">Only a Director can change a Director's account.</span>
              <span class="help" v-show="!panel.isMe && !canSignIn(panel.role)">This role can't sign in yet. Its pages come in a later increment.</span>
            </div>

            <template v-if="panel.mode === 'edit'">
              <div>
                <label class="switch">
                  <span><b>Account active</b><br><span class="help">Turned off = can't sign in or see anything. Their history stays.</span></span>
                  <input type="checkbox" v-model="panel.active" :disabled="panel.isMe || locked(panel.original || {})">
                </label>
                <div class="field">
                  <label for="sReason">Reason for the change</label>
                  <textarea class="input" id="sReason" v-model="panel.reason" placeholder="e.g. Joined Finance team, left the company"></textarea>
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
import { collection, doc, getDocs, serverTimestamp, writeBatch, query, orderBy, limit } from 'firebase/firestore';
import { auth, db, ROLE_LABEL, ALLOWED_ROLES } from '@/lib/firebase.js';
import { firebaseConfig } from '@/firebase-config.js';
import { when } from '@/lib/format.js';
import { useSession } from '@/stores/session.js';

const me = useSession();

const ROLES = ['director', 'finance', 'it', 'operations', 'hr', 'procurement', 'marketing'];
const AUTH_ERRORS = {
  'auth/email-already-in-use': 'This email already has a login. If the person is missing from this list, ask Khairul to add their staff record with tools/set-role.js.',
  'auth/invalid-email': 'That email address does not look right.',
  'auth/network-request-failed': 'No internet connection. Try again.'
};

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
  data() {
    return {
      ROLES, ROLE_LABEL, when,
      myUid: me.user.uid,
      users: [], loading: true, error: '', okMsg: '',
      filter: 'all', roleFilter: '', changes: [],
      filters: [{ key: 'all', label: 'All' }, { key: 'active', label: 'Active' }, { key: 'off', label: 'Turned off' }],
      panel: {}, panelOpen: false
    };
  },
  computed: {
    roleChoices() { return me.role === 'director' ? ROLES : ROLES.filter(r => r !== 'director'); }
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
        await this.loadChanges();
      } catch (e) {
        console.error(e);
        this.error = e.code === 'permission-denied'
          ? 'Firestore refused the read. Check the latest security rules are deployed.'
          : 'Could not load staff: ' + (e.message || e);
      }
      this.loading = false;
    },
    match(u, key) {
      if (key === 'all') return true;
      if (key === 'off') return u.active === false;
      if (key === 'active') return u.active !== false;
      return u.role === key;
    },
    count(key) { return this.users.filter(u => this.match(u, key) && (!this.roleFilter || u.role === this.roleFilter)).length; },
    shown() { return this.users.filter(u => this.match(u, this.filter) && (!this.roleFilter || u.role === this.roleFilter)); },
    roleText(u) { const r = ROLE_LABEL[u.role] || 'No role'; return u.intern ? `Intern (${r})` : r; },
    joined(ts) { const d = ts.toDate ? ts.toDate() : new Date(ts); return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); },
    // Last 30 audit entries, staff ones only (one orderBy, no extra index needed).
    async loadChanges() {
      try {
        const snap = await getDocs(query(collection(db, 'auditLog'), orderBy('at', 'desc'), limit(30)));
        const nameOf = id => { const u = this.users.find(x => x.id === id); return u ? (u.displayName || u.email) : 'a removed account'; };
        const field = { role: 'role', active: 'account', displayName: 'name' };
        this.changes = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(a => (a.entity || '').startsWith('users/')).slice(0, 8).map(a => {
          const who = nameOf(a.entity.slice(6)), at = a.at ? this.joined(a.at) : '';
          let what;
          if (a.action === 'staff.create') what = `${a.userName} invited ${who} as ${ROLE_LABEL[a.changes?.[0]?.new] || 'staff'}`;
          else what = `${a.userName} ` + (a.changes || []).map(c => c.field === 'active' ? (c.new ? `turned ${who} back on` : `turned off ${who}`)
            : c.field === 'role' ? `changed ${who} from ${ROLE_LABEL[c.old] || 'no role'} to ${ROLE_LABEL[c.new]}` : `renamed ${c.old || who} to ${c.new}`).join(', ');
          return { id: a.id, text: `${at} · ${what}${a.reason && a.action !== 'staff.create' ? ` · reason: "${a.reason}"` : ''}` };
        });
      } catch (e) { console.warn('audit read', e); this.changes = []; }
    },
    roleColour(r) { return { director: 'red', finance: 'blue', it: 'grey', operations: 'amber', hr: 'green', procurement: 'grey', marketing: 'amber' }[r] || 'grey'; },
    canSignIn(r) { return ALLOWED_ROLES.includes(r); },
    // HR manages staff accounts too, but can't touch Directors or make anyone a Director (the rules refuse it as well).
    locked(u) { return me.role !== 'director' && u.role === 'director'; },

    openAdd() {
      this.okMsg = '';
      this.panelOpen = true;
      this.panel = { mode: 'add', displayName: '', email: '', role: 'finance', active: true, reason: '', isMe: false, busy: false, error: '' };
    },
    openEdit(u) {
      this.okMsg = '';
      this.panelOpen = true;
      this.panel = { mode: 'edit', id: u.id, original: u, displayName: u.displayName || '', email: u.email, role: u.role || 'finance',
        active: u.active !== false, reason: '', isMe: u.id === this.myUid, busy: false, error: '' };
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
            createdAt: serverTimestamp(), createdBy: me.user.uid, createdByName: me.name
          });
          audit(batch, 'staff.create', uid, [{ field: 'role', old: null, new: p.role }], 'New staff account');
          await batch.commit();
          try { await sendPasswordResetEmail(auth, email); } catch (_) {}
          this.okMsg = `${name} added as ${ROLE_LABEL[p.role]}. A set-password email is on its way to ${email}.`;
        } else {
          const o = p.original, changes = [];
          if (name !== (o.displayName || '')) changes.push({ field: 'displayName', old: o.displayName || '', new: name });
          if (p.role !== o.role) changes.push({ field: 'role', old: o.role || null, new: p.role });
          if (p.active !== (o.active !== false)) changes.push({ field: 'active', old: o.active !== false, new: p.active });
          if (!changes.length) { p.busy = false; this.panelOpen = false; return; }
          if (!p.reason.trim()) { p.busy = false; return p.error = 'Add a short reason. It goes in the audit log.'; }
          batch.update(doc(db, 'users', p.id), {
            displayName: name, role: p.role, active: p.active,
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
    .staff-filters { margin-bottom: 16px; display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
    .staff-table td { white-space: nowrap; }
    .name-btn { border: 0; background: none; padding: 0; font: inherit; color: var(--text); cursor: pointer; text-align: left; }
    .name-btn:hover { text-decoration: underline; }
    .row-acts { text-align: left; }
    .row-acts span { display: inline-flex; gap: 6px; }
    .staff-note { margin: 12px 0 0; }
    .changes { display: grid; gap: 8px; font-size: 12px; color: var(--text-2); }
</style>
