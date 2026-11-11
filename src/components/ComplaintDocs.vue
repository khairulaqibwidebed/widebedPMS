<template>
  <section class="cd">
    <h3>Documents <span class="cd-only">{{ complaint.kind === 'director' ? "HR's Google Drive · only HR and the Directors" : "HR's Google Drive · only HR and the sender" }}</span></h3>
    <div class="cd-list" v-if="docs.length">
      <div class="cd-row" v-for="d in docs" :key="d.id">
        <span class="cd-badge">{{ ext(d.name) }}</span>
        <div class="cd-name"><b>{{ d.name }}</b><small>{{ `${d.threadId ? 'From the chat' : WHO[d.by] || 'Added'} · ${when(d.createdAt)}` }}</small></div>
        <button class="btn btn-sm" type="button" @click="view(d)">View</button>
        <button class="btn btn-sm" type="button" :disabled="dl === d.id" @click="download(d)">{{ dl === d.id ? '…' : 'Download' }}</button>
      </div>
    </div>
    <p class="help" v-else-if="!loading">No documents.</p>
    <template v-if="canAdd">
      <div class="cd-prog" v-if="busy"><span :style="{ width: pct + '%' }"></span><b>{{ `Uploading ${pct}%` }}</b></div>
      <label v-else class="btn btn-sm cd-add"><input type="file" hidden multiple :accept="DOC_ACCEPT" @change="pick">+ Add document</label>
      <span class="help cd-hint">{{ `PDF, Word, Excel or images, up to ${DOC_MAX_MB} MB each.` }}</span>
    </template>
    <div class="notice error" v-show="err">{{ err }}</div>
    <FileViewer ref="viewer" />
  </section>
</template>

<script>
// Documents on a staff complaint (11 Nov 2026): live list from complaints/{id}/docs, files in HR's own Google Drive.
// side 'hr', 'sender' or 'director' (11 Nov 2026: Director complaints and anonymous senders too); canAdd = HR any time, the named sender while it isn't closed.
import FileViewer from '@/components/FileViewer.vue';
import { downloadFile } from '@/lib/drive.js';
import { watchDocs, addDocs, docKind, DOC_ACCEPT, DOC_MAX_MB } from '@/pages/HR/complaints.js';
import { useSession } from '@/stores/session.js';
import { toast } from '@/lib/toast.js';

const WHO = { hr: 'Added by HR', sender: 'Added by the sender', anon: 'Added by the sender', director: 'Added by a Director' };

export default {
  components: { FileViewer },
  props: { complaint: { type: Object, required: true }, side: { type: String, default: 'sender' }, canAdd: Boolean },
  data() { return { WHO, DOC_ACCEPT, DOC_MAX_MB, docs: [], loading: true, busy: false, pct: 0, err: '', dl: '', stop: null }; },
  mounted() {
    this.stop = watchDocs(this.complaint.id, rows => { this.docs = rows; this.loading = false; }, () => { this.loading = false; });
  },
  beforeUnmount() { this.stop?.(); },
  methods: {
    ext(n) { return (String(n).split('.').pop() || '').toUpperCase().slice(0, 4); },
    when(t) { const d = t?.toDate ? t.toDate() : null; return d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Just now'; },
    async pick(e) {
      const files = [...e.target.files]; e.target.value = '';
      if (!files.length) return;
      this.busy = true; this.pct = 0; this.err = '';
      try {
        const by = this.side === 'sender' && this.complaint.anonymous ? 'anon' : this.side;
        const n = await addDocs(useSession(), this.complaint, files, by, p => { this.pct = Math.round(p * 100); });
        toast(`${n} document${n === 1 ? '' : 's'} added.`);
      } catch (err) { this.err = err.message; }
      this.busy = false;
    },
    view(d) { this.$refs.viewer.open({ name: d.name, id: d.fileId, kind: docKind(this.complaint), recordId: this.complaint.id }); },
    async download(d) {
      this.dl = d.id;
      try { await downloadFile(docKind(this.complaint), d.fileId, d.name, this.complaint.id); } catch (err) { toast(err.message); }
      this.dl = '';
    }
  }
};
</script>

<style scoped>
.cd { margin-top: 14px; }
.cd h3 { font-size: 14px; margin: 0 0 8px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.cd-only { font-size: 11px; font-weight: 600; color: var(--muted); background: var(--chip); padding: 2px 8px; border-radius: 999px; }
.cd-list { display: grid; }
.cd-row { display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--line); }
.cd-badge { flex: none; width: 34px; height: 34px; border-radius: 6px; background: var(--accent-soft); color: var(--accent); font-size: 9px; font-weight: 700; display: grid; place-items: center; }
.cd-name { flex: 1; min-width: 0; font-size: 13px; overflow-wrap: anywhere; } .cd-name b { font-weight: 500; display: block; } .cd-name small { color: var(--muted); font-size: 11px; }
.btn-sm { height: 30px; padding: 0 10px; font-size: 12px; flex: none; }
.cd-add { margin-top: 10px; cursor: pointer; }
.cd-hint { display: block; margin-top: 4px; }
.cd-prog { position: relative; margin-top: 10px; height: 30px; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; font-size: 12px; display: grid; place-items: center; }
.cd-prog span { position: absolute; inset: 0 auto 0 0; background: var(--accent-soft); transition: width .2s; }
.cd-prog b { position: relative; }
</style>
