<template>
  <div id="sop">
    <div class="page-head">
      <div>
        <RouterLink class="back-link" to="/HR/sops">← All SOPs</RouterLink>
        <div class="sv-title">
          <button v-if="sop && canEdit" type="button" class="sv-ic edit" :class="{ open: iconOpen }" :disabled="busy" @click="iconOpen = !iconOpen"
            aria-label="Change the icon" title="Change the icon"><SopIcon :name="sop.icon" /></button>
          <span v-else-if="sop" class="sv-ic"><SopIcon :name="sop.icon" /></span>
          <h1>{{ sop ? sop.title : 'SOP' }}</h1>
        </div>
        <div class="sub" v-if="sop && sop.sub">{{ sop.sub }}</div>
      </div>
      <div class="head-tools">
        <span class="chip" v-show="!canEdit">View only</span>
        <RouterLink v-if="sopKey === 'advance'" class="btn btn-primary" to="/HR/salary-advance">Salary Advance form</RouterLink>
        <button class="btn btn-danger" type="button" v-if="canEdit && sop" :disabled="busy" @click="delOpen = true; delWhy = ''">Delete SOP</button>
      </div>
    </div>
    <!-- Icon picker (HR and Directors): picking one saves it straight away -->
    <Transition name="sv-fold">
      <section class="card sv-icons" v-if="iconOpen && sop">
        <div class="card-head"><h2>Pick an icon</h2><button class="btn btn-sm" type="button" @click="iconOpen = false">Done</button></div>
        <SopIconPicker :model-value="sop.icon" :disabled="busy" @update:model-value="setIcon" />
      </section>
    </Transition>
    <!-- Delete SOP (HR and Directors): needs a reason; the SOP leaves the list, the Audit Log keeps it -->
    <div class="modal-back" v-if="delOpen" @click.self="delOpen = busy" v-esc="() => { if (!busy) delOpen = false }">
      <div class="modal" role="dialog" aria-label="Delete SOP" style="max-width:460px;width:calc(100% - 32px)">
        <ConfirmReason :title="`Delete ${sop.title}?`" text="It leaves the SOPs list for everyone. Its documents stay in Google Drive, and the Audit Log keeps who deleted it and why."
          v-model="delWhy" label="Reason" placeholder="e.g. Replaced by the new Cleaning SOP" confirm-text="Delete SOP" danger :busy="busy" @confirm="remove()" @cancel="delOpen = false" />
      </div>
    </div>
    <div class="notice error" v-show="err">{{ err }}</div>
    <div class="loading-bar" v-show="loading"></div>
    <div class="side-grid" v-if="sop">
      <SopSteps :sop="sop" :can-edit="canEdit" :busy="busy" :edit-first="editFirst" @save="saveSteps" />
      <div class="stack" style="gap:20px">
        <SopDocs :docs="sop.docs" :sop-key="sop.key" :title="sop.title" :can-edit="canEdit" :busy="busy" :me="me" @add="addDoc" @remove="removeDoc" />
        <SopLog :log="sop.log" />
      </div>
    </div>
  </div>
</template>

<script>
// One SOP (/HR/sops/<key>): steps, documents and change log, each its own component. All saves go through here
// (sops-data.js saveSop), so the change log and audit entries are written in one place.
import SopSteps from './SopSteps.vue';
import SopDocs from './SopDocs.vue';
import SopLog from './SopLog.vue';
import SopIcon from './SopIcon.vue';
import SopIconPicker from './SopIconPicker.vue';
import ConfirmReason from '@/components/ConfirmReason.vue';
import { loadSop, saveSop, deleteSop } from '@/pages/HR/sops-data.js';
import { friendlyError } from '@/lib/finance-data.js';
import { toast } from '@/lib/toast.js';
import { askConfirm } from '@/lib/confirm.js';
import { useSession } from '@/stores/session.js';
import { can } from '@/lib/access.js';

export default {
  components: { SopSteps, SopDocs, SopLog, SopIcon, SopIconPicker, ConfirmReason },
  // editFirst: a new SOP opens with the steps editor already open.
  props: { sopKey: { type: String, required: true }, editFirst: Boolean },
  data() { const me = useSession(); return { me, canEdit: can(me, 'sops.edit'), sop: null, loading: true, busy: false, err: '', delOpen: false, delWhy: '', iconOpen: false }; },
  async mounted() {
    try {
      this.sop = await loadSop(this.sopKey);
      if (!this.sop) this.err = 'There is no SOP at this address. It may have been renamed; go back to All SOPs.';
      else document.title = `${this.sop.title} · Widebed PMS`;
    } catch (e) { this.err = friendlyError(e, 'load this SOP'); }
    this.loading = false;
  },
  methods: {
    async save(what, action, next, reason = '') {
      this.busy = true;
      try { this.sop = await saveSop(this.me, this.sop, what, action, next, reason); return true; }
      catch (e) { toast(friendlyError(e, 'save the SOP')); return false; }
      finally { this.busy = false; }
    },
    async saveSteps({ steps, reason, done, fail }) {
      if (await this.save(`Edited the steps: ${reason}`, 'sop.update', { steps, docs: this.sop.docs }, reason)) { done(); toast('SOP saved.'); }
      else fail('The SOP was not saved. Try again.');
    },
    async addDoc(d, done) {
      try { if (await this.save(`Added ${d.name}`, 'sop.docAdd', { steps: this.sop.steps, docs: [d, ...this.sop.docs] })) toast(`${d.name} added.`); }
      finally { done(); }
    },
    async setIcon(icon) {
      if (icon === this.sop.icon) return;
      if (await this.save('Changed the icon', 'sop.icon', { steps: this.sop.steps, docs: this.sop.docs, icon })) toast('Icon changed.');
    },
    async remove() {
      this.busy = true;
      try {
        await deleteSop(this.me, this.sop, this.delWhy);
        toast(`${this.sop.title} deleted.`);
        this.delOpen = false;
        this.$router.push('/HR/sops');
      } catch (e) { toast(e.code ? friendlyError(e, 'delete the SOP') : e.message); }
      this.busy = false;
    },
    async removeDoc(i) {
      const d = this.sop.docs[i];
      if (!(await askConfirm({ title: 'Remove this document?', message: `${d.name} leaves this SOP for everyone. The file stays in Google Drive.`, confirmText: 'Remove', danger: true }))) return;
      if (await this.save(`Removed ${d.name}`, 'sop.docRemove', { steps: this.sop.steps, docs: this.sop.docs.filter((_, j) => j !== i) })) toast(`${d.name} removed.`);
    }
  }
};
</script>

<style scoped>
.back-link { display: inline-block; margin-bottom: 8px; font-size: 13px; font-weight: 600; color: var(--accent); text-decoration: none; }
.back-link:hover { text-decoration: underline; }
.sv-title { display: flex; align-items: center; gap: 12px; }
.sv-title h1 { margin: 0; }
.sv-ic { flex: none; width: 40px; height: 40px; border-radius: 10px; display: grid; place-items: center; background: var(--accent-soft); color: var(--accent);
  border: 1px solid transparent; padding: 0; }
.sv-ic :deep(.sop-icon) { width: 20px; height: 20px; }
.sv-ic.edit { cursor: pointer; transition: border-color .15s, transform .15s; }
.sv-ic.edit:hover:not(:disabled), .sv-ic.edit.open { border-color: var(--accent); }
.sv-ic.edit:active:not(:disabled) { transform: scale(.94); }
.sv-icons { margin-bottom: 20px; }
.sv-fold-enter-active, .sv-fold-leave-active { transition: opacity .18s ease, transform .18s ease; }
.sv-fold-enter-from, .sv-fold-leave-to { opacity: 0; transform: translateY(-6px); }
@media (prefers-reduced-motion: reduce) { .sv-fold-enter-active, .sv-fold-leave-active, .sv-ic.edit { transition: none; } }
#sop .side-grid { grid-template-columns: minmax(0,1fr) 380px; }
@media (max-width: 1000px) { #sop .side-grid { grid-template-columns: minmax(0,1fr); } }
</style>
