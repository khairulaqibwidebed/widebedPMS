<template>
  <main class="content">
    <div class="page-head"><div><h1>Send a complaint to the Directors</h1><div class="sub">Only HR can use this form</div></div>
      <div class="head-tools"><span class="sample-tag">Saved in this browser for now</span></div></div>
    <div class="callout" style="margin-bottom:20px">HR sends these complaints and the Directors read them. HR has no login yet, so for now the form shows to Directors so it can be tried out; the inbox below is what Directors see.</div>
    <div class="notice ok" v-show="okMsg">{{ okMsg }}</div>
    <div class="side-grid">
      <section class="card">
        <div class="card-head"><h2>New complaint</h2></div>
        <form @submit.prevent="send()">
          <div class="field"><label>To</label><div><span class="tag">All Directors</span></div></div>
          <div class="field"><label for="dSubj">Subject</label><input class="input" id="dSubj" v-model="subject" placeholder="e.g. Repeated late salary for part-timers"></div>
          <div class="field"><label for="dDet">Details</label><textarea class="input" id="dDet" style="height:140px" v-model="details" placeholder="What happened and what you need from the Directors"></textarea></div>
          <label class="filedrop"><input type="file" multiple hidden @change="files = [...$event.target.files].map(f => f.name)"><b>Upload document</b>Optional · supporting documents</label>
          <div class="file-names" v-show="files.length">{{ files.join(', ') }}</div>
          <div class="notice error" v-show="err" style="margin-top:12px">{{ err }}</div>
          <div class="actions" style="margin-top:14px"><button class="btn btn-primary" type="submit">Send to Directors</button><button class="btn" type="button" @click="clear()">Cancel</button></div>
        </form>
      </section>
      <div class="stack" style="gap:20px">
        <section class="card">
          <div class="card-head"><h2>Who can see this</h2></div>
          <div class="rows">
            <div class="row" v-for="w in WHO" :key="w[0]"><span>{{ w[0] }}</span><span class="pill" :class="w[1] ? 'yes' : 'no'">{{ w[1] ? 'Yes' : 'No' }}</span></div>
          </div>
        </section>
        <section class="card">
          <div class="card-head"><h2>Sent before</h2></div>
          <div class="rows">
            <div class="row" v-for="c in list" :key="c.ref"><span>{{ `${c.ref} · ${c.date}` }}</span><span class="pill" :class="c.read ? 'green' : 'amber'">{{ c.read ? 'Read' : 'Not read' }}</span></div>
          </div>
        </section>
      </div>
    </div>
    <section class="card" style="margin-top:20px">
      <div class="card-head"><h2>Directors' inbox</h2><span class="help">{{ `${list.filter(c => !c.read).length} not read` }}</span></div>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Ref</th><th>Date</th><th>From</th><th>Subject</th><th>Status</th><th></th></tr></thead>
          <tbody>
            <tr class="clickable" v-for="c in list" :key="c.ref" @click="open(c)"><td>{{ c.ref }}</td><td>{{ c.date }}</td><td>{{ c.fromName }}</td><td>{{ c.subject }}</td>
              <td><span class="pill" :class="c.read ? 'green' : 'amber'">{{ c.read ? 'Read' : 'New' }}</span></td>
              <td class="num"><button class="editlink" @click.stop="open(c)">Open</button></td></tr>
          </tbody>
        </table>
      </div>
    </section>
    <template v-if="sel">
      <div class="modal-back" @click.self="sel = null" v-esc="() => { sel = null }">
        <div class="modal" role="dialog" aria-label="Complaint to the Directors">
          <h2>{{ `${sel.ref} · ${sel.subject}` }}</h2>
          <div class="kv"><span>Date</span><span>{{ sel.date }}</span></div>
          <div class="kv"><span>From</span><span>{{ sel.fromName }}</span></div>
          <div class="field" style="margin-top:12px"><label>Details</label><div class="detail">{{ sel.details }}</div></div>
          <div class="file-names" v-show="sel.files.length">{{ 'Attached: ' + sel.files.join(', ') }}</div>
          <div class="modal-foot"><button class="btn" @click="sel = null">Close</button></div>
        </div>
      </div>
    </template>
  </main>
</template>

<script>
import { directorComplaints, saveDirectorComplaints, nextRef, today } from './complaints.js';
import { useSession } from '@/stores/session.js';

const me = useSession();

export default {
  data() {
    return {
      WHO: [['HR', true], ['Directors', true], ['IT', false], ['Other staff', false]],
      list: directorComplaints(), subject: '', details: '', files: [], err: '', okMsg: '', sel: null
    };
  },
  methods: {
    clear() { this.subject = ''; this.details = ''; this.files = []; this.err = ''; },
    // Opening a complaint marks it as read for the Directors
    open(c) { this.sel = c; if (!c.read) { c.read = true; saveDirectorComplaints(this.list); } },
    send() {
      this.err = ''; this.okMsg = '';
      if (!this.subject.trim()) return this.err = 'Add a subject.';
      if (!this.details.trim()) return this.err = 'Add the details.';
      const ref = nextRef(this.list, 'DC-', 3);
      this.list.unshift({ ref, date: today(), fromName: me.name, subject: this.subject.trim(), details: this.details.trim(), read: false, files: this.files });
      saveDirectorComplaints(this.list);
      this.okMsg = `Sent to the Directors as ${ref}.`; this.clear();
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
