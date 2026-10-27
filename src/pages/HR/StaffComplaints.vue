<template>
  <main class="content soft-page">
    <div class="page-head">
      <div><h1>Staff complaints</h1><div class="sub">Complaints sent to HR by staff</div></div>
      <div class="head-tools"><span class="chip">View only</span></div>
    </div>
    <div class="notice error" v-show="error">{{ error }}</div>
    <div class="pills brand" style="margin-bottom:16px">
      <button class="pill-btn" v-for="f in filters" :key="f[0]" :class="{ on: filter === f[0] }" @click="filter = f[0]">{{ f[1] }}</button>
    </div>
    <div class="loading-bar" v-show="loading"></div>
    <Paged :items="shown()" v-slot="{ pageRows }">
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>Ref</th><th>Date</th><th>From</th><th>Subject</th><th>Status</th><th></th></tr></thead>
        <tbody>
          <tr class="clickable" v-for="c in pageRows" :key="c.id" @click="sel = c">
            <td>{{ c.ref }}</td><td>{{ c.date }}</td>
            <td><span class="anon" v-show="c.anonymous">Anonymous</span><span v-show="!c.anonymous">{{ c.fromName }}</span></td>
            <td>{{ c.subject }}</td>
            <td><span class="pill" :class="st(c)[1]">{{ st(c)[0] }}</span></td>
            <td class="num"><button class="editlink" @click.stop="sel = c">Open</button></td>
          </tr>
          <tr v-show="!loading && !shown().length"><td colspan="6" class="muted">No complaints here.</td></tr>
        </tbody>
      </table>
    </div>
    </Paged>
    <p class="help" style="margin-top:12px">Complaints sent anonymously show "Anonymous" and HR cannot see who sent them. HR can read complaints but cannot change or delete them. Directors see this page view-only.</p>

    <template v-if="sel">
      <div class="modal-back" @click.self="sel = null" v-esc="() => { sel = null }">
        <div class="modal" role="dialog" aria-label="Complaint">
          <h2>{{ `${sel.ref} · ${sel.subject}` }}</h2>
          <div class="kv"><span>Date</span><span>{{ sel.date }}</span></div>
          <div class="kv"><span>From</span><span>{{ sel.anonymous ? 'Anonymous' : sel.fromName }}</span></div>
          <div class="kv"><span>Status</span><span><span class="pill" :class="st(sel)[1]">{{ st(sel)[0] }}</span></span></div>
          <div class="field" style="margin-top:12px"><label>Details</label><div class="detail">{{ sel.details }}</div></div>
          <div class="file-names" v-show="sel.files && sel.files.length">{{ 'Attached: ' + sel.files.join(', ') }}</div>
          <div class="modal-foot"><button class="btn" @click="sel = null">Close</button></div>
        </div>
      </div>
    </template>
  </main>
</template>

<script>
// HR and Directors read staff complaints; nobody changes or deletes them. Anonymous ones carry no sender at all.
import { loadComplaints, STATUS } from './complaints.js';
import { friendlyError } from '@/lib/finance-data.js';

export default {
  data() {
    return {
      STATUS, list: [], loading: true, error: '', filter: 'all', sel: null,
      filters: [['all', 'All'], ['new', 'New'], ['review', 'In review'], ['closed', 'Closed']]
    };
  },
  async mounted() {
    try { this.list = await loadComplaints('staff'); }
    catch (e) { this.error = friendlyError(e, 'load the complaints'); }
    this.loading = false;
  },
  methods: {
    st(c) { return STATUS[c.status] || STATUS.new; },
    shown() { return this.list.filter(c => this.filter === 'all' || c.status === this.filter); }
  }
};
</script>

<style scoped>
    .ok-box { display: grid; gap: 4px; }
    .yes { background: var(--green-soft); color: var(--green); }
    .no { background: var(--red-soft); color: var(--red); }
    .anon { background: var(--chip); color: var(--text-2); font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 999px; }
    .check { display: flex; gap: 10px; align-items: flex-start; margin: 14px 0; font-size: 13px; }
    .check input { width: 16px; height: 16px; accent-color: var(--accent); margin-top: 2px; }
    .check small { display: block; color: var(--muted); font-size: 12px; }
    .filedrop b { color: var(--accent); }
    .file-names { font-size: 12px; color: var(--text-2); margin-top: 6px; }
    .detail { white-space: pre-wrap; font-size: 13px; background: var(--hover); border: 1px solid var(--line); border-radius: 8px; padding: 12px; }
</style>
