<template>
  <div class="modal-back" @click.self="close()" v-esc="() => close()">
    <form class="modal" role="dialog" aria-label="New SOP" style="max-width:520px;width:calc(100% - 32px)" @submit.prevent="make()">
      <h2>New SOP</h2>
      <p class="help" style="margin-top:0">Give it a title and a short line. It opens straight away so you can write the steps and add documents.</p>
      <div class="field"><label class="req" for="sopTitle">Title</label>
        <input class="input" id="sopTitle" ref="title" v-model="title" :maxlength="TITLE_MAX" placeholder="e.g. Cleaning SOP"></div>
      <div class="field"><label for="sopSub">Short line</label>
        <input class="input" id="sopSub" v-model="sub" :maxlength="SUB_MAX" placeholder="e.g. How units are cleaned between stays"></div>
      <div class="field"><label>Icon</label><SopIconPicker v-model="icon" /></div>
      <div class="notice error" v-show="err">{{ err }}</div>
      <div class="modal-foot">
        <button class="btn" type="button" @click="close()">Cancel</button>
        <button class="btn btn-primary" type="submit" :disabled="busy || !title.trim()">{{ busy ? 'Making…' : 'Make SOP' }}</button>
      </div>
    </form>
  </div>
</template>

<script>
// "+ New SOP" popup. Makes sops/{key} (key from the title) and hands the new SOP back to the page, which opens it.
import { useSession } from '@/stores/session.js';
import { createSop, TITLE_MAX, SUB_MAX } from '@/pages/HR/sops-data.js';
import { friendlyError } from '@/lib/finance-data.js';
import SopIconPicker from './SopIconPicker.vue';

export default {
  components: { SopIconPicker },
  props: { takenKeys: { type: Set, required: true } },
  emits: ['close', 'created'],
  data() { return { TITLE_MAX, SUB_MAX, title: '', sub: '', icon: 'fileText', err: '', busy: false }; },
  mounted() { this.$nextTick(() => this.$refs.title?.focus()); },
  methods: {
    close() { if (!this.busy) this.$emit('close'); },
    async make() {
      this.busy = true; this.err = '';
      try { this.$emit('created', await createSop(useSession(), { title: this.title, sub: this.sub, icon: this.icon }, this.takenKeys)); }
      catch (e) { this.err = e.code ? friendlyError(e, 'make the SOP') : e.message; }
      this.busy = false;
    }
  }
};
</script>
