<template>
  <section class="card">
    <div class="card-head"><h2>{{ sop.stepsTitle }}</h2>
      <span class="ss-head-r">
        <span class="help">{{ sop.editedBy ? `Last edited by ${sop.editedBy} · ${sop.editedOn}` : 'Starter text, not edited yet' }}</span>
        <button class="btn btn-sm" type="button" v-if="canEdit && !editing" :disabled="busy" @click="start()">Edit steps</button>
      </span>
    </div>
    <template v-if="!editing">
      <ol class="sop-steps"><li v-for="(st, i) in sop.steps" :key="i"><span class="sop-num">{{ i + 1 }}</span><span>{{ st }}</span></li></ol>
      <p class="help" style="margin:10px 0 0" v-show="!sop.saved">Starter text. HR types the real SOP; the first save keeps it for all staff.</p>
    </template>
    <template v-else>
      <TransitionGroup name="ss-row" tag="div" class="ss-list">
        <div class="ss-row" v-for="(st, i) in draft" :key="ids[i]">
          <span class="sop-num">{{ i + 1 }}</span>
          <textarea class="ss-text" rows="1" ref="txt" v-model="draft[i]" :aria-label="`Step ${i + 1}`" :placeholder="`Step ${i + 1}: what to do`"
            @input="grow($event.target)" @keydown.enter.ctrl.prevent="add(i + 1)"></textarea>
          <button class="ss-del" type="button" @click="drop(i)" :disabled="draft.length === 1" aria-label="Remove step" title="Remove step">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
      </TransitionGroup>
      <button class="ss-add" type="button" @click="add(draft.length)"><span aria-hidden="true">+</span> Add step</button>
      <div class="ss-foot">
        <div class="field"><label for="sopWhy">Reason for the change <span class="muted">(saved in the log)</span></label>
          <input class="input" id="sopWhy" v-model="reason" placeholder="e.g. New working hours from November"></div>
        <div class="notice error" v-show="err">{{ err }}</div>
        <div class="ss-actions">
          <span class="help">Ctrl + Enter adds a step below.</span>
          <button class="btn" type="button" @click="editing = false">Cancel</button>
          <button class="btn btn-primary" type="button" :disabled="busy" @click="save()">{{ busy ? 'Saving…' : 'Save steps' }}</button>
        </div>
      </div>
    </template>
  </section>
</template>

<script>
// The steps card: read for everyone; "Edit steps" for HR and Directors. Saving is done by the parent (SopView).
import { askConfirm } from '@/lib/confirm.js';
const PLACEHOLDER = 'Write the first step here.';
let seq = 0;

export default {
  props: { sop: { type: Object, required: true }, canEdit: Boolean, busy: Boolean, editFirst: Boolean },
  emits: ['save'],
  data() { return { editing: false, draft: [], ids: [], reason: '', err: '' }; },
  // A new SOP opens straight into the editor, with "First version" as the reason.
  mounted() { if (this.editFirst && this.canEdit) { this.start(); this.reason = 'First version'; } },
  methods: {
    start() {
      // A new SOP's placeholder step opens as an empty box, so HR types over nothing.
      const steps = this.sop.steps.length === 1 && this.sop.steps[0] === PLACEHOLDER ? [''] : [...this.sop.steps];
      this.draft = steps.length ? steps : [''];
      this.ids = this.draft.map(() => ++seq);
      this.reason = ''; this.err = ''; this.editing = true;
      this.$nextTick(() => { (this.$refs.txt || []).forEach(t => this.grow(t)); if (!this.draft[0]) this.$refs.txt?.[0]?.focus(); });
    },
    // Boxes grow with the text, so there is no drag handle.
    grow(t) { if (!t) return; t.style.height = 'auto'; t.style.height = `${t.scrollHeight + 2}px`; },
    add(at) {
      this.draft.splice(at, 0, ''); this.ids.splice(at, 0, ++seq);
      this.$nextTick(() => this.$refs.txt?.[at]?.focus());
    },
    // Always asks first, even for an empty step.
    async drop(i) {
      const msg = this.draft[i].trim() ? 'Its text is lost. Nothing is saved until you click Save steps.' : 'Nothing is saved until you click Save steps.';
      if (!(await askConfirm({ title: `Remove step ${i + 1}?`, message: msg, confirmText: 'Remove step', danger: true }))) return;
      this.draft.splice(i, 1); this.ids.splice(i, 1);
    },
    save() {
      const steps = this.draft.map(s => s.trim()).filter(Boolean);
      if (!steps.length) return this.err = 'Keep at least one step.';
      if (!this.reason.trim()) return this.err = 'Add a short reason. It goes in the change log.';
      this.err = '';
      this.$emit('save', { steps, reason: this.reason.trim(), done: () => { this.editing = false; }, fail: m => { this.err = m; } });
    }
  }
};
</script>

<style scoped>
.ss-head-r { display: inline-flex; align-items: center; gap: 12px; flex-wrap: wrap; justify-content: flex-end; }
.sop-steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
.sop-steps li { display: flex; gap: 12px; align-items: flex-start; font-size: 13px; }
.sop-num { flex: none; width: 24px; height: 24px; border-radius: 50%; background: var(--accent-soft); color: var(--accent); font-size: 11px; font-weight: 700; display: grid; place-items: center; }

/* Editor: one row per step (number, text, remove), lined up on the first line of text */
.ss-list { display: grid; gap: 8px; }
.ss-row { display: grid; grid-template-columns: 24px minmax(0, 1fr) 32px; gap: 10px; align-items: start; padding: 8px 8px 8px 12px;
  border: 1px solid var(--border); border-radius: 10px; background: var(--surface); transition: border-color .15s, box-shadow .15s; }
.ss-row:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.ss-row .sop-num { margin-top: 6px; }
.ss-text { width: 100%; min-height: 36px; resize: none; overflow: hidden; border: 0; outline: none; background: transparent; color: var(--text);
  font: inherit; font-size: 13.5px; line-height: 1.5; padding: 7px 0; }
.ss-text::placeholder { color: var(--muted); }
.ss-del { width: 32px; height: 32px; margin-top: 2px; border: 0; border-radius: 8px; background: none; color: var(--muted); display: grid; place-items: center;
  cursor: pointer; opacity: .55; transition: opacity .15s, background .15s, color .15s; }
.ss-del svg { width: 16px; height: 16px; }
.ss-row:hover .ss-del, .ss-row:focus-within .ss-del { opacity: 1; }
.ss-del { color: var(--danger); }
.ss-del:hover:not(:disabled) { background: color-mix(in srgb, var(--danger) 12%, transparent); }
.ss-del:disabled { opacity: .25; cursor: default; }

.ss-add { width: 100%; margin-top: 8px; height: 42px; border: 1px dashed var(--border); border-radius: 10px; background: none; color: var(--text-2);
  font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; transition: border-color .15s, color .15s, background .15s; }
.ss-add:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
.ss-add span { font-size: 15px; margin-right: 4px; }

.ss-foot { margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--border); }
.ss-foot .field { margin-bottom: 12px; }
.ss-actions { display: flex; align-items: center; gap: 10px; justify-content: flex-end; flex-wrap: wrap; }
.ss-actions .help { margin-right: auto; }

/* Rows slide in and out when added or removed */
.ss-row-enter-active, .ss-row-leave-active { transition: opacity .18s ease, transform .18s ease; }
.ss-row-enter-from, .ss-row-leave-to { opacity: 0; transform: translateY(-4px); }
.ss-row-leave-active { position: absolute; width: calc(100% - 40px); }
.ss-row-move { transition: transform .18s ease; }
@media (prefers-reduced-motion: reduce) { .ss-row, .ss-del, .ss-add, .ss-row-enter-active, .ss-row-leave-active, .ss-row-move { transition: none; } }
</style>
