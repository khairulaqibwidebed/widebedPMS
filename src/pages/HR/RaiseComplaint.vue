<template>
  <main class="content">
    <div class="page-head"><div><h1>Raise a staff complaint</h1><div class="sub">Sent to HR</div></div></div>
    <div class="notice ok" v-show="okMsg">{{ okMsg }}</div>
    <div class="side-grid">
      <section class="card">
        <div class="card-head"><h2>Your complaint</h2></div>
        <form @submit.prevent="send()">
          <div class="field"><label for="cSubj">Subject</label><input class="input" id="cSubj" v-model="subject" placeholder="e.g. Unfair shift changes without notice"></div>
          <div class="field"><label for="cDet">Details</label><textarea class="input" id="cDet" rows="6" style="height:140px" v-model="details" placeholder="What happened, when, and who was involved"></textarea></div>
          <label class="filedrop"><input type="file" multiple hidden @change="pick($event)"><b>Upload document</b>Optional · photos or documents</label>
          <div class="file-names" v-show="files.length">{{ files.join(', ') }}</div>
          <label class="check"><input type="checkbox" v-model="anonymous"><span><b>Send anonymously</b><small>HR will not see your name.</small></span></label>
          <div class="notice error" v-show="err">{{ err }}</div>
          <div class="actions"><button class="btn btn-primary" type="submit">Send to HR</button><button class="btn" type="button" @click="clear()">Cancel</button></div>
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
      <div class="card-head"><h2>My complaints <span class="sample-tag">Saved in this browser for now</span></h2></div>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Ref</th><th>Date</th><th>Subject</th><th>Sent as</th><th>Status</th></tr></thead>
          <tbody>
            <tr v-for="c in mine()" :key="c.ref"><td>{{ c.ref }}</td><td>{{ c.date }}</td><td>{{ c.subject }}</td>
              <td>{{ c.anonymous ? 'Anonymous' : 'With my name' }}</td>
              <td><span class="pill" :class="STATUS[c.status][1]">{{ STATUS[c.status][0] }}</span></td></tr>
            <tr v-show="!mine().length"><td colspan="5" class="muted">You haven't sent any complaints.</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  </main>
</template>

<script>
import { staffComplaints, saveStaffComplaints, nextRef, today, STATUS } from './complaints.js';
import { useSession } from '@/stores/session.js';

const me = useSession();

export default {
  data() {
    return { STATUS, list: staffComplaints(), subject: '', details: '', anonymous: false, files: [], err: '', okMsg: '' };
  },
  methods: {
    mine() { return this.list.filter(c => c.fromId === me.user.uid); },
    pick(e) {
      const big = [...e.target.files].find(f => f.size > 20 * 1024 * 1024);
      if (big) { this.err = `${big.name} is over 20 MB.`; return; }
      this.files = [...e.target.files].map(f => f.name);
    },
    clear() { this.subject = ''; this.details = ''; this.anonymous = false; this.files = []; this.err = ''; },
    send() {
      this.err = ''; this.okMsg = '';
      if (!this.subject.trim()) return this.err = 'Add a subject.';
      if (!this.details.trim()) return this.err = 'Describe what happened.';
      const ref = nextRef(this.list, 'CP-', 4);
      this.list.unshift({ ref, date: today(), fromId: me.user.uid, fromName: me.name, anonymous: this.anonymous,
        subject: this.subject.trim(), details: this.details.trim(), status: 'new', files: this.files });
      saveStaffComplaints(this.list);
      this.okMsg = `Sent to HR as ${ref}${this.anonymous ? ', anonymously' : ''}.`;
      this.clear();
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
