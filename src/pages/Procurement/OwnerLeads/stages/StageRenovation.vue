<template>
  <section class="card" aria-label="Renovation">
    <div class="card-head"><h2>{{ `${n}. Renovation` }}</h2><span class="muted">{{ `${d.renovation.items.filter(x => x.status === 'done').length} of ${d.renovation.items.length} done` }}</span></div>
    <div class="notice error" v-show="err">{{ err }}</div>
    <template v-for="g in renoGroupsOf(d)" :key="g">
      <div class="form-sec">{{ g }}</div>
      <div class="table-wrap">
        <table class="table lines reno">
          <thead><tr><th>Item</th><th>Status</th><th class="num">Cost (RM)</th><th v-if="canEdit"></th></tr></thead>
          <tbody>
            <template v-for="it in d.renovation.items.filter(x => x.group === g)" :key="it.id">
              <tr>
                <td class="wrap"><input class="input" v-if="canEdit && it.custom" v-model="it.title" placeholder="e.g. Ceiling repair" aria-label="Item"><span v-else>{{ it.title }}</span></td>
                <td>
                  <select class="select" v-if="canEdit" v-model="it.status" :aria-label="`Status of ${it.title || 'new line'}`"><template v-for="(v, k) in RSTATUS" :key="k"><option :value="k">{{ v[0] }}</option></template></select>
                  <span v-else class="pill" :class="RSTATUS[it.status][1]">{{ RSTATUS[it.status][0] }}</span>
                </td>
                <td class="num"><input class="input cost" v-if="canEdit" v-model="it.cost" inputmode="decimal" placeholder="0" :aria-label="`Cost of ${it.title || 'new line'}`"><span v-else>{{ it.cost === '' ? '—' : rm(it.cost) }}</span></td>
                <td class="num" v-if="canEdit"><button class="editlink" @click="removeLine(it)" :aria-label="`Remove ${it.title || 'line'}`">Remove</button></td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
      <button class="editlink add-line" v-if="canEdit" @click="addReno(g)">{{ `+ Add line to ${g}` }}</button>
    </template>
    <div class="totals">
      <div class="kv"><span>Item costs</span><span>{{ rm(renoCost(d)) }}</span></div>
      <div class="kv"><span>{{ `Procurement fee ${FEE_PCT}%` }}</span><span>{{ rm(renoFee(d)) }}</span></div>
      <div class="kv total"><span>Total</span><span>{{ rm(renoCost(d) + renoFee(d)) }}</span></div>
    </div>

    <div class="form-sec">Photos and videos (Google Drive links)</div>
    <template v-for="(lk, i) in d.renovation.links" :key="i">
      <div class="link-row"><a :href="lk.url" target="_blank" rel="noopener" @click.prevent="$refs.viewer.open({ name: lk.label, url: lk.url, kind: 'listings' })">{{ lk.label }}</a><button class="editlink" v-if="canEdit" @click="d.renovation.links.splice(i, 1)">Remove</button></div>
    </template>
    <p class="muted" v-show="!d.renovation.links.length">No links yet.</p>
    <div class="link-add" v-if="canEdit">
      <input class="input" v-model="linkAdd.label" placeholder="Label, e.g. Before photos" aria-label="Link label">
      <input class="input" v-model="linkAdd.url" placeholder="https://drive.google.com/…" aria-label="Drive link">
      <button class="btn" @click="addLink()">Add link</button>
      <UploadFile kind="listings" :record-id="listingId" :folder-label="`${d.property} ${d.unit}`" label="⬆ Upload photos / videos" @done="f => addUploaded(f)" />
    </div>

    <div class="grid-fields notes">
      <div class="field"><label for="rInt">Internal notes (staff only)</label>
        <textarea class="input" id="rInt" v-if="canEdit" v-model="d.renovation.internalNotes" placeholder="e.g. Contractor quoted two options for the cabinet"></textarea>
        <p class="pre" v-else>{{ d.renovation.internalNotes || '—' }}</p></div>
      <div class="field"><label for="rOwn">Owner notes</label>
        <textarea class="input" id="rOwn" v-if="canEdit" v-model="d.renovation.ownerNotes" placeholder="e.g. Painting is done; the cabinet goes in next week"></textarea>
        <p class="pre" v-else>{{ d.renovation.ownerNotes || '—' }}</p>
        <button class="btn copy" @click="$emit('copy', d.renovation.ownerNotes)" :disabled="!d.renovation.ownerNotes.trim()">Copy for WhatsApp</button></div>
    </div>
    <FileViewer ref="viewer" />
  </section>
</template>

<script>
// Stage: Renovation (lines by group, costs, the procurement fee, Drive links, notes). Edits the draft (d) in place.
import { RSTATUS, FEE_PCT, lineId, httpsOk, renoGroupsOf, renoCost, renoFee, rm } from '@/lib/owner-leads.js';
import UploadFile from '@/components/UploadFile.vue';
import FileViewer from '@/components/FileViewer.vue';

export default {
  components: { UploadFile, FileViewer },
  props: { d: { type: Object, required: true }, listingId: { type: String, required: true }, canEdit: Boolean, n: { type: Number, default: 2 } },
  emits: ['copy'],
  data() { return { RSTATUS, FEE_PCT, linkAdd: { label: '', url: '' }, err: '' }; },
  methods: {
    renoGroupsOf, renoCost, renoFee, rm,
    addReno(group) { this.d.renovation.items.push({ id: lineId(), group, title: '', status: 'notStarted', cost: '', custom: true }); },
    removeLine(it) { const list = this.d.renovation.items, i = list.indexOf(it); if (i >= 0) list.splice(i, 1); },
    addUploaded(files) {
      for (const f of files) if (!this.d.renovation.links.some(l => l.url === f.url)) this.d.renovation.links.push({ label: f.name.slice(0, 80), url: f.url });
    },
    addLink() {
      const label = this.linkAdd.label.trim() || 'Photos', url = this.linkAdd.url.trim();
      if (!httpsOk(url)) { this.err = 'Paste the Google Drive link (it starts with https://).'; return; }
      this.d.renovation.links.push({ label, url });
      this.linkAdd = { label: '', url: '' }; this.err = '';
    }
  }
};
</script>
