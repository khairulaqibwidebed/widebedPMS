<template>
  <main class="content">
    <div class="page-head"><div><h1>Raise a staff complaint</h1><div class="sub">Sent to HR</div></div></div>
    <div class="notice ok" v-show="okMsg">{{ okMsg }}</div>
    <div class="notice error" v-show="loadErr">{{ loadErr }}</div>
    <div class="side-grid">
      <section class="card">
        <div class="card-head"><h2>Your complaint</h2></div>
        <form @submit.prevent="send()">
          <div class="field"><label for="cSubj">Subject</label><input class="input" id="cSubj" v-model="subject" placeholder="e.g. Unfair shift changes without notice"></div>
          <div class="field"><label for="cDet">Details</label><textarea class="input" id="cDet" rows="6" style="height:140px" v-model="details" placeholder="What happened, when, and who was involved"></textarea></div>
          <label class="filedrop"><input type="file" multiple hidden @change="pick($event)"><b>Upload document</b>Optional · photos or documents</label>
          <div class="file-names" v-show="files.length">{{ files.join(', ') }}</div>
          <label class="check"><input type="checkbox" v-model="anonymous"><span><b>Send anonymously</b><small>Your name is not saved anywhere, so HR cannot see it. It shows under My complaints on this browser only.</small></span></label>
          <div class="notice error" v-show="err">{{ err }}</div>
          <div class="actions"><button class="btn btn-primary" type="submit" :disabled="busy">{{ busy ? 'Sending…' : 'Send to HR' }}</button><button class="btn" type="button" @click="clear()">Cancel</button></div>
        </form>
      </section>
      <section class="card">
        <div class="card-head"><h2>What happens next</h2></div>
        <div class="rows">
          <div class="row"><span>HR reads your complaint</span></div>
          <div class="row"><span>HR may contact you (not if anonymous)</span></div>
          <div class="row"><span>You can see the status under My complaints</span></div>
        </div>
      </section>
    </div>
    <section class="card" style="margin-top:20px">
      <div class="card-head"><h2>My complaints</h2></div>
      <div class="loading-bar" v-show="loading"></div>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Ref</th><th>Date</th><th>Subject</th><th>Sent as</th><th>Status</th></tr></thead>
          <tbody>
            <tr v-for="c in list" :key="c.id"><td>{{ c.ref }}</td><td>{{ c.date }}</td><td>{{ c.subject }}</td>
              <td>{{ c.anonymous ? 'Anonymous' : myName }}</td>
              <td><span class="pill" :class="(STATUS[c.status] || STATUS.new)[1]">{{ (STATUS[c.status] || STATUS.new)[0] }}</span></td></tr>
            <tr v-show="!loading && !list.length"><td colspan="5" class="muted">You haven't sent any complaints.</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  </main>
</template>

<script>
import { createComplaint, loadMyComplaints, STATUS } from './complaints.js';
import { friendlyError } from '@/lib/finance-data.js';
import { useSession } from '@/stores/session.js';

const me = useSession();

export default {
  data() {
    return { STATUS, myName: me.name || 'With my name', list: [], loading: true, loadErr: '', busy: false, subject: '', details: '', anonymous: false, files: [], err: '', okMsg: '' };
  },
  async mounted() { await this.load(); },
  methods: {
    async load() {
      this.loading = true; this.loadErr = '';
      try { this.list = await loadMyComplaints(me.user.uid); }
      catch (e) { this.loadErr = friendlyError(e, 'load your complaints'); }
      this.loading = false;
    },
    pick(e) {
      const big = [...e.target.files].find(f => f.size > 20 * 1024 * 1024);
      if (big) { this.err = `${big.name} is over 20 MB.`; return; }
      this.files = [...e.target.files].map(f => f.name);
    },
    clear() { this.subject = ''; this.details = ''; this.anonymous = false; this.files = []; this.err = ''; },
    async send() {
      this.err = ''; this.okMsg = '';
      if (!this.subject.trim()) return this.err = 'Add a subject.';
      if (!this.details.trim()) return this.err = 'Describe what happened.';
      this.busy = true;
      try {
        const anonymous = this.anonymous;
        const ref = await createComplaint(me, 'staff', { subject: this.subject.trim(), details: this.details.trim(), files: this.files, anonymous });
        this.okMsg = `Sent to HR as ${ref}${anonymous ? ', anonymously' : ''}.`;
        this.clear(); await this.load();
      } catch (e) { this.err = friendlyError(e, 'send the complaint'); }
      this.busy = false;
    }
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
