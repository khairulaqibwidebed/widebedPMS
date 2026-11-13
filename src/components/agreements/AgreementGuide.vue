<template>
  <button type="button" class="btn ag-guide-btn" :class="{ sm: small }" aria-label="How agreements work" title="How agreements work" @click="open = true">
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
  </button>
  <Teleport to="body">
    <template v-if="open">
      <div class="drawer-back" @click="close"></div>
      <aside class="drawer ag-guide" role="dialog" aria-label="How agreements work" tabindex="-1" ref="panel" @keydown.esc="close">
        <div class="drawer-head">
          <h2>How agreements work</h2>
          <button type="button" class="icon-btn" aria-label="Close" @click="close">×</button>
        </div>
        <div class="drawer-body">
          <section class="ag-guide-here">
            <small>You are on</small>
            <b>{{ info.name }}</b>
            <ul><li v-for="t in info.tips" :key="t">{{ t }}</li></ul>
          </section>

          <h3>Making an agreement</h3>
          <ol class="ag-guide-steps">
            <li v-for="(s, i) in DAILY_STEPS" :key="s.key" :class="{ here: info.steps.includes(s.key) }">
              <span class="ag-guide-num" aria-hidden="true">{{ i + 1 }}</span>
              <div>
                <b>{{ s.title }}</b> <span class="pill blue" v-if="info.steps.includes(s.key)">This page</span>
                <p>{{ s.text }}</p>
                <RouterLink v-if="s.to && route.path !== s.to" class="link" :to="s.to" @click="close">{{ s.go }} →</RouterLink>
              </div>
            </li>
          </ol>

          <template v-if="admin">
            <h3>Setting up an agreement <small>Directors, once per agreement</small></h3>
            <ol class="ag-guide-steps">
              <li v-for="(s, i) in SETUP_STEPS" :key="s.key" :class="{ here: info.steps.includes(s.key) }">
                <span class="ag-guide-num" aria-hidden="true">{{ i + 1 }}</span>
                <div>
                  <b>{{ s.title }}</b> <span class="pill blue" v-if="info.steps.includes(s.key)">This page</span>
                  <p>{{ s.text }}</p>
                  <RouterLink v-if="s.to && route.path !== s.to" class="link" :to="s.to" @click="close">{{ s.go }} →</RouterLink>
                </div>
              </li>
            </ol>
          </template>
          <p class="note" v-else>The forms and templates are set up by a Director. If an agreement or a field is missing, ask them to add it in Agreement Setup.</p>

          <h3>Words you will see</h3>
          <dl class="ag-guide-words">
            <template v-for="w in WORDS" :key="w[0]"><dt>{{ w[0] }}</dt><dd>{{ w[1] }}</dd></template>
          </dl>
        </div>
      </aside>
    </template>
  </Teleport>
</template>

<script setup>
// The ⓘ button on every Agreements page (13 Nov 2026): opens a side panel that says what this page is for, the steps of
// making an agreement (the step this page belongs to is marked) and, for people who can set agreements up, those steps too.
// The words are in lib/agreements/guide.js.
//   <AgreementGuide page="records" :admin="isAdmin" />      page: a key of PAGES in guide.js
// It opens by itself the first time someone visits Agreements on a computer (first-visit), then only from the button.
import { ref, computed, watch, nextTick, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { DAILY_STEPS, SETUP_STEPS, PAGES, WORDS } from '@/lib/agreements/guide.js';

const props = defineProps({ page: { type: String, required: true }, admin: { type: Boolean, default: false }, small: { type: Boolean, default: false }, firstVisit: { type: Boolean, default: false } });
const route = useRoute();
const open = ref(false), panel = ref(null);
const info = computed(() => PAGES[props.page] || PAGES.home);
const SEEN = 'wb.agreements.guideSeen';
function close() { open.value = false; }
watch(open, v => { if (v) { try { localStorage.setItem(SEEN, '1'); } catch (_) { /* fine */ } nextTick(() => panel.value?.focus()); } });
onMounted(() => {
  if (!props.firstVisit) return;
  try { if (!localStorage.getItem(SEEN)) open.value = true; } catch (_) { /* private mode: only from the button */ }
});
</script>

<style scoped>
.ag-guide-btn { width: 38px; padding: 0; display: inline-flex; align-items: center; justify-content: center; color: var(--accent); border-color: var(--accent); background: var(--surface); flex: none; }
.ag-guide-btn:hover { background: var(--accent-soft); }
.ag-guide-btn.sm { width: 32px; height: 32px; }
.ag-guide { width: 480px; outline: 0; }
.ag-guide h3 { font-size: 14px; margin: 22px 0 10px; }
.ag-guide h3 small { font-weight: 400; color: var(--text-2); margin-left: 6px; }
.ag-guide-here { background: var(--accent-soft); border-radius: 12px; padding: 14px 16px; display: grid; gap: 2px; }
.ag-guide-here small { color: var(--text-2); font-size: 12px; }
.ag-guide-here b { font-size: 16px; }
.ag-guide-here ul { margin: 8px 0 0; padding-left: 18px; display: grid; gap: 6px; font-size: 13px; line-height: 1.45; }
.ag-guide-steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.ag-guide-steps li { display: flex; gap: 12px; padding: 10px 12px; border-radius: 10px; border: 1px solid transparent; }
.ag-guide-steps li.here { border-color: var(--accent); background: var(--surface); }
.ag-guide-num { flex: none; width: 26px; height: 26px; border-radius: 50%; background: var(--chip); color: var(--text); font-size: 13px; font-weight: 700; display: grid; place-items: center; }
.ag-guide-steps li.here .ag-guide-num { background: var(--accent); color: #fff; }
.ag-guide-steps b { font-size: 14px; }
.ag-guide-steps p { margin: 4px 0 4px; font-size: 13px; line-height: 1.5; color: var(--text-2); }
.ag-guide-steps .link { font-size: 13px; }
.ag-guide-words { margin: 0; display: grid; grid-template-columns: max-content 1fr; gap: 6px 14px; font-size: 13px; }
.ag-guide-words dt { font-weight: 600; }
.ag-guide-words dd { margin: 0; color: var(--text-2); }
</style>
