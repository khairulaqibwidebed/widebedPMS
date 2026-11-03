<template>
  <main class="content">
    <div class="loading-bar" v-show="loading"></div>

    <div class="page-head">
      <div>
        <h1>Roles</h1>
        <div class="sub">Director only. Make new roles and set the pages each role starts with. People with the role get these pages unless their own ticks were changed on Staff accounts.</div>
      </div>
      <div class="head-tools"><button class="btn btn-primary" @click="openNew()">+ Create role</button></div>
    </div>

    <div class="notice error" v-show="error">{{ error }}</div>
    <div class="notice ok" v-show="okMsg">{{ okMsg }}</div>

    <div class="table-wrap soft-wrap">
      <table class="table hover-rows">
        <thead><tr><th>Role</th><th>Description</th><th>People</th><th>Pages ticked</th><th>Status</th><th></th></tr></thead>
        <tbody>
          <tr v-for="r in rows" :key="r.id">
            <td><span class="dot" :style="{ background: colourOf(r) }"></span> <button class="name-btn" @click="openEdit(r)" :disabled="r.id === 'director'">{{ r.name }}</button><span class="tag" v-if="r.builtin"> Built-in</span></td>
            <td>{{ r.description || '-' }}</td>
            <td>{{ people[r.id] || 0 }}</td>
            <td>{{ r.id === 'director' ? 'All' : permCount(r) }}</td>
            <td><span class="pill" :class="r.active ? 'green' : 'grey'">{{ r.active ? 'Active' : 'Turned off' }}</span></td>
            <td class="row-acts"><button class="act-pill" v-if="r.id !== 'director'" @click="openEdit(r)">Edit</button><span class="muted" v-else>-</span></td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="note">New roles can sign in, see their Dashboard, Issues, Agreements, Playbook and the staff HR pages, plus every page ticked below. Statement Approvals, Brand Logos, Staff accounts, Roles, Audit log and complaints can't be ticked. Role-wide notifications only reach the built-in roles for now.</p>

    <template v-if="panelOpen">
      <div>
        <div class="drawer-back" @click="close()"></div>
        <aside class="drawer" role="dialog" :aria-label="panel.isNew ? 'Create role' : 'Edit role'" v-esc="() => { close() }">
          <div class="drawer-head">
            <h2>{{ panel.isNew ? 'Create role' : `Edit ${panel.name}` }}</h2>
            <button class="icon-btn" @click="close()" aria-label="Close">×</button>
          </div>
          <form class="drawer-body" id="roleForm" @submit.prevent="save()">
            <div class="notice error" v-show="panel.error">{{ panel.error }}</div>
            <div class="field">
              <label for="rName" class="req">Role name</label>
              <input class="input" id="rName" v-model="panel.name" :readonly="panel.builtin" placeholder="e.g. Leasing">
            </div>
            <div class="field">
              <label for="rDesc">Description</label>
              <input class="input" id="rDesc" v-model="panel.description" :readonly="panel.builtin" placeholder="What this role does, shown on Staff accounts">
            </div>
            <div class="field" v-if="!panel.builtin">
              <label>Colour</label>
              <div class="swatches">
                <button type="button" v-for="c in COLOURS" :key="c" class="swatch" :class="{ on: panel.color === c }" :style="{ background: c }" :aria-label="c" @click="panel.color = c"></button>
                <label class="swatch custom" :class="{ on: !COLOURS.includes(panel.color) }" :style="{ background: COLOURS.includes(panel.color) ? '' : panel.color }" title="Pick any colour">
                  <span v-if="COLOURS.includes(panel.color)">+</span>
                  <input type="color" :value="panel.color" @input="panel.color = $event.target.value" aria-label="Custom colour">
                </label>
              </div>
            </div>

            <div class="field">
              <div class="perm-top">
                <label>Default page access</label>
                <button type="button" class="link" v-if="panel.builtin" @click="panel.perms = cleanPerms(ORIGINAL[panel.id] || [])">Reset to built-in defaults</button>
              </div>
              <span class="help">A tick gives full access to that page. Anyone in this role starts with these pages.</span>
              <div class="perm-wrap">
                <table class="perm-table">
                  <thead><tr><th>Page</th><th>Access</th></tr></thead>
                  <tbody>
                    <template v-for="grp in pageGroups" :key="grp.name">
                      <tr class="perm-grp"><td colspan="2">{{ grp.name }}<small v-if="GROUP_NOTES[grp.name]">{{ GROUP_NOTES[grp.name] }}</small></td></tr>
                      <tr v-for="row in grp.pages" :key="row.id" :class="{ on: rowState(row) !== 'off' }">
                        <td>{{ row.label }}</td>
                        <td><input type="checkbox" :checked="rowState(row) !== 'off'" :aria-label="row.label" @change="tickRow(row, $event.target.checked)"></td>
                      </tr>
                    </template>
                  </tbody>
                </table>
              </div>
            </div>

            <div v-if="!panel.isNew">
              <label class="switch" v-if="!panel.builtin">
                <span><b>Role active</b><br><span class="help">Turned off = nobody can be given this role. It can't be turned off while people still have it.</span></span>
                <input type="checkbox" v-model="panel.active">
              </label>
              <div class="field">
                <label for="rWhy" class="req">Reason for the change</label>
                <textarea class="input" id="rWhy" v-model="panel.reason" placeholder="e.g. Leasing now needs Offline Payments"></textarea>
                <span class="help">Saved in the audit log with your name.</span>
              </div>
            </div>
            <p class="help" v-if="!panel.isNew">{{ `${people[panel.id] || 0} people have this role. Changes reach them the next time they open a page.` }}</p>
          </form>
          <div class="drawer-foot">
            <button class="btn" @click="close()">Cancel</button>
            <button class="btn btn-primary" type="submit" form="roleForm" :disabled="panel.busy">{{ panel.busy ? 'Saving…' : (panel.isNew ? 'Create role' : 'Save changes') }}</button>
          </div>
        </aside>
      </div>
    </template>
  </main>
</template>

<script>
import { collection, doc, getDocs, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db, ROLE_LABEL, BUILTIN_ROLES, CUSTOM_ROLES, loadRoleRegistry } from '@/lib/firebase.js';
import { friendlyError } from '@/lib/finance-data.js';
import { useSession } from '@/stores/session.js';
import { roleColor } from '@/lib/avatars.js';
import { ACCESS_ROWS, rowPerms, GROUP_NOTES, PRESETS, cleanPerms, samePerms } from '@/lib/access.js';

const me = useSession();
const BUILTIN_TEXT = {
  director: 'Everything, including Staff accounts and Roles.', finance: 'Upload eZee, expenses, month-end payout, exports.', it: 'View-only, except Issues.',
  operations: 'Issues, offline inquiries, booking forms, Playbook and SOPs.', hr: 'SOP pages, complaints, Staff accounts, Audit log.',
  procurement: 'New owner listings and Procurement forms.', marketing: 'New owner listings and Portfolio details.'
};
const COLOURS = ['#E0603F', '#2F86D6', '#C98A12', '#7E5BD6', '#1C9A8F', '#3E9B5A', '#D6457E', '#7A8190'];
const slug = s => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
// Built-in roles' usual pages as shipped (before any change on this page).
const ORIGINAL = JSON.parse(JSON.stringify(PRESETS));

export default {
  data() { return { ORIGINAL, COLOURS, GROUP_NOTES, loading: true, error: '', okMsg: '', rolesDocs: {}, people: {}, panel: {}, panelOpen: false }; },
  computed: {
    rows() {
      const built = BUILTIN_ROLES.map(id => ({ id, name: ROLE_LABEL[id], builtin: true, active: true, description: this.rolesDocs[id]?.description || BUILTIN_TEXT[id], perms: id === 'director' ? [] : (PRESETS[id] || []) }));
      const custom = Object.keys(CUSTOM_ROLES).map(id => ({ id, builtin: false, ...CUSTOM_ROLES[id], perms: PRESETS[id] || [] }));
      return [...built, ...custom];
    },
    pageGroups() {
      const groups = [];
      for (const pg of ACCESS_ROWS) {
        let g = groups.find(x => x.name === pg.group);
        if (!g) groups.push(g = { name: pg.group, pages: [] });
        g.pages.push(pg);
      }
      return groups;
    }
  },
  async mounted() { await this.load(); },
  methods: {
    cleanPerms,
    colourOf(r) { return roleColor(r.id); },
    permCount(r) { return cleanPerms(r.perms).length ? `${new Set(cleanPerms(r.perms).map(p => p.split('.')[0])).size} pages` : 'None'; },
    async load() {
      this.loading = true; this.error = '';
      try {
        await loadRoleRegistry(true);
        let rs = null, us = null;
        try { rs = await getDocs(collection(db, 'roles')); } catch (e) { this.error = 'The roles collection was refused (' + (e.code || e.message) + '). The published security rules have no roles block that lets you read it.'; }
        try { us = await getDocs(collection(db, 'users')); } catch (e) { this.error = (this.error ? this.error + ' ' : '') + 'The staff list was refused (' + (e.code || e.message) + '), so people counts show 0.'; }
        this.rolesDocs = Object.fromEntries((rs ? rs.docs : []).map(d => [d.id, d.data()]));
        const n = {}; (us ? us.docs : []).forEach(d => { const u = d.data(); if (u.active !== false && u.role) n[u.role] = (n[u.role] || 0) + 1; });
        this.people = n;
      } catch (e) { this.error = friendlyError(e, 'load the roles'); }
      this.loading = false;
    },
    openNew() { this.panel = { isNew: true, builtin: false, id: '', name: '', description: '', color: COLOURS[4], perms: [], active: true, reason: '', busy: false, error: '' }; this.panelOpen = true; },
    openEdit(r) {
      if (r.id === 'director') return;
      this.panel = { isNew: false, builtin: r.builtin, id: r.id, name: r.name, description: r.builtin ? '' : r.description, color: r.color || COLOURS[4], perms: cleanPerms(r.perms), active: r.active, reason: '', busy: false, error: '', before: cleanPerms(r.perms), wasActive: r.active };
      this.panelOpen = true;
    },
    close() { if (!this.panel.busy) this.panelOpen = false; },
    has(p) { return (this.panel.perms || []).includes(p); },
    rowState(row) { const all = rowPerms(row), n = all.filter(p => this.has(p)).length; return n === all.length ? 'on' : n ? 'some' : 'off'; },
    tickRow(row, on) {
      const set = new Set(this.panel.perms || []);
      for (const p of rowPerms(row)) on ? set.add(p) : set.delete(p);
      this.panel.perms = cleanPerms([...set]);
    },
    async save() {
      const p = this.panel; p.error = '';
      const name = p.name.trim();
      if (!name) return p.error = 'Enter a role name.';
      let id = p.id;
      if (p.isNew) {
        id = slug(name);
        if (!id) return p.error = 'Use letters or numbers in the role name.';
        if (BUILTIN_ROLES.includes(id) || this.rolesDocs[id] || this.rows.some(r => r.name.toLowerCase() === name.toLowerCase())) return p.error = 'A role with this name already exists.';
      } else {
        if (!p.reason.trim()) return p.error = 'Add a short reason. It goes in the audit log.';
        if (!p.builtin && !p.active && p.wasActive && this.people[id]) return p.error = `${this.people[id]} people still have this role. Move them to another role on Staff accounts first.`;
      }
      const perms = cleanPerms(p.perms);
      const changes = [];
      if (p.isNew) changes.push({ field: 'role', old: null, new: name });
      else {
        if (!samePerms(perms, p.before)) changes.push({ field: 'perms', old: p.before, new: perms });
        if (!p.builtin && p.active !== p.wasActive) changes.push({ field: 'active', old: p.wasActive, new: p.active });
        if (!p.builtin && (name !== ROLE_LABEL[id] || p.description !== (CUSTOM_ROLES[id]?.description || '') || p.color !== (CUSTOM_ROLES[id]?.color || ''))) changes.push({ field: 'details', old: null, new: '(changed)' });
        if (!changes.length) { this.panelOpen = false; return; }
      }
      p.busy = true;
      try {
        const b = writeBatch(db);
        const data = p.builtin
          ? { builtin: true, perms, updatedAt: serverTimestamp(), updatedBy: me.user.uid }
          : { name, description: p.description.trim(), color: p.color, perms, active: p.active, builtin: false, updatedAt: serverTimestamp(), updatedBy: me.user.uid, ...(p.isNew ? { createdAt: serverTimestamp(), createdBy: me.user.uid } : {}) };
        b.set(doc(db, 'roles', id), data, { merge: true });
        b.set(doc(collection(db, 'auditLog')), {
          at: serverTimestamp(), uid: me.user.uid, userName: me.name, role: me.role,
          action: p.isNew ? 'role.create' : 'role.update', entity: `roles/${id}`, changes, reason: p.isNew ? 'New role' : p.reason.trim()
        });
        await b.commit();
        this.okMsg = p.isNew ? `${name} created. Add people to it on Staff accounts.` : `${name} saved. Changes reach people the next time they open a page.`;
        this.panelOpen = false;
        await this.load();
      } catch (e) { p.error = friendlyError(e, 'save the role'); }
      p.busy = false;
    }
  }
};
</script>

<style scoped>
.name-btn { border: 0; background: none; padding: 0; font: inherit; color: var(--text); cursor: pointer; text-align: left; }
.name-btn:hover { text-decoration: underline; }
.dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 4px; }
.swatches { display: flex; gap: 8px; flex-wrap: wrap; }
.swatch { width: 28px; height: 28px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; }
.swatch.custom { position: relative; display: grid; place-items: center; border: 2px dashed var(--border); color: var(--muted); font-size: 18px; overflow: hidden; background: var(--surface); }
.swatch.custom input { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; }
.swatch.on { outline: 2px solid var(--accent); outline-offset: 2px; }
.perm-top { display: flex; justify-content: space-between; align-items: center; }
.perm-wrap { border: 1px solid var(--border); border-radius: 10px; overflow: hidden; margin: 4px 0; }
.perm-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.perm-table th { text-align: left; font-size: 12px; font-weight: 500; color: var(--muted); background: var(--head); padding: 8px 12px; border-bottom: 1px solid var(--border); }
.perm-table th:not(:first-child), .perm-table td:not(:first-child) { width: 56px; text-align: center; }
.perm-table td { padding: 8px 12px; border-bottom: 1px solid var(--line); }
.perm-table tr:last-child td { border-bottom: 0; }
.perm-table tr.on td { background: var(--accent-soft); }
.perm-table tr.on td:first-child { color: var(--accent); font-weight: 600; }
.perm-table .perm-grp td { background: var(--hover); font-size: 11px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--text-2); text-align: left; }
.perm-table .perm-grp small { display: block; font-size: 11px; font-weight: 400; letter-spacing: 0; text-transform: none; color: var(--muted); margin-top: 2px; }
.perm-table input { width: 16px; height: 16px; accent-color: var(--accent); cursor: pointer; }
</style>
