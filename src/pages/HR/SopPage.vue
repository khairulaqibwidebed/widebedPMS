<template>
  <main class="content" id="sop">
    <div class="page-head">
      <div><h1>{{ cfg.title }}</h1><div class="sub">{{ cfg.sub }}</div></div>
      <div class="head-tools">
        <span class="chip" v-show="!canEdit">View only</span>
        <template v-if="canEdit"><label class="btn">Upload document<input type="file" hidden @change="upload($event)"></label></template>
        <button class="btn btn-primary" v-show="canEdit && !editing" @click="startEdit()">Edit SOP</button>
      </div>
    </div>
    <div class="side-grid">
      <section class="card">
        <div class="card-head"><h2>{{ cfg.stepsTitle }}</h2><span class="help">{{ `Last edited by ${data.editedBy} · ${data.editedOn}` }}</span></div>
        <template v-if="!editing">
          <div>
            <ol class="sop-steps"><li v-for="(st, i) in data.steps" :key="i"><span class="sop-num">{{ i + 1 }}</span><span>{{ st }}</span></li></ol>
            <p class="help" style="margin:10px 0 0">Sample text. HR types the real SOP.<span class="sample-tag">Saved in this browser for now</span></p>
          </div>
        </template>
        <template v-if="editing">
          <div>
            <div class="sop-edit" v-for="(st, i) in draft" :key="i"><span class="sop-num">{{ i + 1 }}</span>
              <textarea class="input" rows="2" v-model="draft[i]" :aria-label="`Step ${i + 1}`"></textarea>
              <button class="icon-btn" @click="draft.splice(i, 1)" aria-label="Remove step">×</button></div>
            <button class="btn btn-sm" @click="draft.push('')">+ Add step</button>
            <div class="field" style="margin-top:14px"><label for="sopWhy">Reason for the change (saved in the log)</label>
              <input class="input" id="sopWhy" v-model="reason" placeholder="e.g. New working hours from November"></div>
            <div class="notice error" v-show="err">{{ err }}</div>
            <div class="actions"><button class="btn btn-primary" @click="saveEdit()">Save SOP</button><button class="btn" @click="editing = false">Cancel</button></div>
          </div>
        </template>
      </section>
      <div class="stack" style="gap:20px">
        <section class="card">
          <div class="card-head"><h2>Documents</h2><span class="chip">{{ `${data.docs.length} file${data.docs.length === 1 ? '' : 's'}` }}</span></div>
          <div class="doc-list">
            <div class="doc-row" v-for="(d, i) in data.docs" :key="d.name + i">
              <span class="doc-badge">{{ ext(d.name) }}</span>
              <div class="doc-name"><b>{{ d.name }}</b><small>{{ `Added by ${d.by} · ${d.on}` }}</small></div>
              <button class="editlink" @click="toast('Sample file, nothing to download yet')">Download</button>
              <button class="doc-remove" v-show="canEdit" @click="removeDoc(i)">Remove</button>
            </div>
            <div class="empty" v-show="!data.docs.length">No documents yet.</div>
          </div>
          <template v-if="canEdit">
            <label class="filedrop sop-drop"><input type="file" hidden @change="upload($event)"><b>Upload document</b>PDF, Word, Excel or images · staff can download</label>
          </template>
          <p class="help" style="margin:10px 0 0">Files will be kept in the company Google Drive; the PMS keeps only the link.</p>
        </section>
        <section class="card" v-show="data.log.length">
          <div class="card-head"><h2>Change log</h2></div>
          <div class="rows"><div class="row" v-for="(l, i) in data.log.slice(0, 6)" :key="i"><span>{{ l.what }}</span><span class="r">{{ l.when }}</span></div></div>
        </section>
      </div>
    </div>
  </main>
</template>

<script>
// HR SOP pages (Attendance, Advance, Allowance, Claim SOCSO). One component, four addresses: the route's meta.sop picks the SOP.
// SOP pages only explain the rules (clock-in happens outside the PMS). Everyone can read and download;
// only HR edits (Director too, full access) and every edit is logged. HR is not a login yet, so Director edits and Finance views.
// Text and the document list are kept in this browser until the SOPs move to Firebase; files will sit in the company Google Drive.
import { toast } from '@/lib/toast.js';
import { useSession } from '@/stores/session.js';
import { SOPS } from './sops.js';

const me = useSession();

const today = () => new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const load = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

export default {
  data() {
    const key = this.$route.meta.sop;
    const cfg = SOPS[key];
    const seed = { steps: [...cfg.steps], editedBy: 'HR user 1', editedOn: '18 Oct 2026', log: [],
      docs: cfg.docs.map(([name, on]) => ({ name, on, by: 'HR user 1' })) };
    return { KEY: 'wb.sop.' + key, cfg, data: load('wb.sop.' + key) || seed, canEdit: me.role === 'director', editing: false, draft: [], reason: '', err: '' };
  },
  methods: {
    toast,
    ext(n) { return (n.split('.').pop() || '').toUpperCase().slice(0, 4); },
    save(what) { this.data.log.unshift({ what: `${what} · ${me.name}`, when: today() }); store(this.KEY, this.data); },
    startEdit() { this.draft = [...this.data.steps]; this.reason = ''; this.err = ''; this.editing = true; },
    saveEdit() {
      const steps = this.draft.map(s => s.trim()).filter(Boolean);
      if (!steps.length) return this.err = 'Keep at least one step.';
      if (!this.reason.trim()) return this.err = 'Add a short reason. It goes in the change log.';
      this.data.steps = steps; this.data.editedBy = me.name; this.data.editedOn = today();
      this.save(`Edited the steps: ${this.reason.trim()}`); this.editing = false; toast('SOP saved.');
    },
    upload(e) {
      const f = e.target.files[0]; e.target.value = '';
      if (!f) return;
      if (f.size > 20 * 1024 * 1024) return toast('Files must be 20 MB or less.');
      this.data.docs.unshift({ name: f.name, on: today(), by: me.name });
      this.save(`Added ${f.name}`); toast(`${f.name} added. Files go to the company Google Drive once that is set up.`);
    },
    removeDoc(i) { const d = this.data.docs.splice(i, 1)[0]; this.save(`Removed ${d.name}`); toast(`${d.name} removed.`); }
  }
};
</script>

<style scoped>
  .sop-steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
  .sop-steps li, .sop-edit { display: flex; gap: 12px; align-items: flex-start; font-size: 13px; }
  .sop-num { flex: none; width: 22px; height: 22px; border-radius: 50%; background: var(--accent-soft); color: var(--accent); font-size: 11px; font-weight: 700; display: grid; place-items: center; }
  .sop-edit { margin-bottom: 10px; } .sop-edit textarea { height: auto; min-height: 52px; }
  .doc-list { display: grid; }
  .doc-row { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--line); }
  .doc-badge { flex: none; width: 34px; height: 34px; border-radius: 6px; background: var(--accent-soft); color: var(--accent); font-size: 9px; font-weight: 700; display: grid; place-items: center; }
  .doc-name { flex: 1; min-width: 0; font-size: 13px; overflow-wrap: anywhere; } .doc-name b { font-weight: 500; display: block; } .doc-name small { color: var(--muted); font-size: 11px; }
  .doc-remove { background: none; border: 0; padding: 0; color: var(--muted); font-size: 12px; }
  #sop .side-grid { grid-template-columns: minmax(0,1fr) 380px; }
  @media (max-width: 1000px) { #sop .side-grid { grid-template-columns: minmax(0,1fr); } }
  .sop-drop { margin-top: 12px; } .sop-drop b { color: var(--accent); }
</style>
