<template>
  <div class="modal-back cf-back" v-if="s.open" @click.self="answer(false)">
    <div class="modal cf" role="alertdialog" aria-modal="true" :aria-label="s.title" v-esc="() => answer(false)">
      <div class="cf-icon" :class="{ danger: s.danger }" aria-hidden="true">{{ s.alertOnly ? '!' : s.danger ? '🗑' : '?' }}</div>
      <h2>{{ s.title }}</h2>
      <p>{{ s.message }}</p>
      <div class="modal-foot cf-foot">
        <button class="btn" v-if="!s.alertOnly" @click="answer(false)">Cancel</button>
        <button class="btn cf-yes" :class="s.danger && !s.alertOnly ? 'cf-danger' : 'btn-primary'" ref="yes" @click="answer(true)">{{ s.confirmText }}</button>
      </div>
    </div>
  </div>
</template>

<script>
import { confirmState, answerConfirm } from '@/lib/confirm.js';
export default {
  data() { return { s: confirmState }; },
  watch: { 's.open'(v) { if (v) this.$nextTick(() => this.$refs.yes?.focus()); } },
  methods: { answer(yes) { answerConfirm(yes); } }
};
</script>

<style scoped>
.cf-back { z-index: 80; align-items: center; padding-top: 16px; }
.cf { max-width: 400px; text-align: center; }
.cf-icon { width: 56px; height: 56px; margin: 0 auto 12px; border-radius: 50%; display: grid; place-items: center; font-size: 26px; background: var(--chip); }
.cf-icon.danger { background: var(--red-soft); }
.cf h2 { margin-bottom: 8px; }
.cf p { margin: 0; color: var(--text-2); font-size: 14px; line-height: 1.5; }
.cf-foot { justify-content: center; margin-top: 20px; }
.cf-foot .btn { min-width: 120px; }
.cf-danger { background: var(--danger); border-color: var(--danger); color: #fff; }
.cf-danger:hover { filter: brightness(.9); }
</style>
