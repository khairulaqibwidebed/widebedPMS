<template>
  <main class="content">
    <div class="page-head">
      <div>
        <h1>Appearance</h1>
        <div class="sub">How the PMS looks on your screen. Changing it affects only you.</div>
      </div>
    </div>

    <section class="card">
      <div class="card-head"><h2>Colour theme</h2></div>
      <p class="card-intro">Widebed orange is the default for everyone.</p>
      <div class="theme-grid">
        <template v-for="th in themes" :key="th.key">
          <button class="choice" :class="{ on: t.brand === th.key }" @click="set({ brand: th.key })" :aria-pressed="t.brand === th.key">
            <span class="swatch"><i :style="`background:${th.c[0]}`"></i><i :style="`background:${th.c[1]}`"></i><i :style="`background:${th.c[2]}`"></i></span>
            <span><b>{{ th.label }}</b><span class="tick" v-show="t.brand === th.key"> · In use</span><br><small>{{ th.note }}</small></span>
          </button>
        </template>
      </div>
    </section>

    <section class="card">
      <div class="card-head"><h2>Light or dark</h2></div>
      <div class="mode-grid">
        <template v-for="m in modes" :key="m.key">
          <button class="choice" :class="{ on: t.mode === m.key }" @click="set({ mode: m.key })" :aria-pressed="t.mode === m.key">
            <span class="mini" :class="m.key"><span class="sb"></span><span class="bd"><i style="width:70%"></i><i style="width:45%"></i><i style="width:60%"></i></span></span>
            <span><b>{{ m.label }}</b><span class="tick" v-show="t.mode === m.key"> · In use</span><br><small>{{ m.note }}</small></span>
          </button>
        </template>
      </div>
    </section>

    <section class="card">
      <div class="card-head"><h2>Preview</h2></div>
      <div class="preview">
        <button class="btn btn-primary">+ Add line</button>
        <button class="btn">Cancel</button>
        <span class="pill green">Completed</span><span class="pill amber">Estimated</span><span class="pill grey">Draft</span>
        <span class="role-badge">Finance</span>
        <span class="editlink">Edit ›</span>
      </div>
    </section>

    <p class="note" style="margin-top:16px">Saved in this browser for now, so set it again on another computer. It will follow your account once that is switched on. Statements, invoices, receipts and other PDFs always use Widebed's company colours and logo (Settings › Brand logos), whatever you pick here.</p>
  </main>
</template>

<script>
import { readTheme, saveTheme, applyTheme } from '@/lib/theme.js';
import { toast } from '@/lib/toast.js';

const dark = matchMedia('(prefers-color-scheme: dark)');
const follow = () => applyTheme();

export default {
  data() {
    return {
      t: readTheme(),
      themes: [
        { key: 'widebed', label: 'Widebed', note: 'Orange and white (default)', c: ['#F26D4D', '#C2452B', '#FDEBE6'] },
        { key: 'teal', label: 'Teal', note: 'Calm green-blue', c: ['#2BA197', '#1C7C74', '#E1F3F1'] },
        { key: 'blue', label: 'Blue', note: 'Classic office blue', c: ['#4C7FE0', '#2F5FBF', '#E6EEFB'] },
        { key: 'grey', label: 'Neutral grey', note: 'Low colour', c: ['#6B7280', '#4B5260', '#ECEEF1'] }
      ],
      modes: [
        { key: 'light', label: 'Light', note: 'White pages' },
        { key: 'dark', label: 'Dark', note: 'Easier at night' },
        { key: 'system', label: 'Match computer', note: 'Follows your computer setting' }
      ]
    };
  },
  // "Match computer" follows the OS setting live
  mounted() { dark.addEventListener('change', follow); },
  unmounted() { dark.removeEventListener('change', follow); },
  methods: {
    set(patch) { this.t = { ...this.t, ...patch }; saveTheme(this.t); toast('Appearance saved'); }
  }
};
</script>

<style scoped>
    .theme-grid { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 12px; }
    .mode-grid { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 12px; }
    .choice { border: 1.5px solid var(--border); border-radius: 12px; background: var(--surface); padding: 14px; text-align: left; color: var(--text); display: grid; gap: 10px; }
    .choice:hover { border-color: var(--muted); }
    .choice.on { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
    .choice b { font-size: 14px; }
    .choice small { color: var(--muted); font-size: 12px; }
    /* Swatches are the themes' own colours, shown as samples */
    .swatch { height: 44px; border-radius: 8px; display: flex; overflow: hidden; border: 1px solid var(--border); }
    .swatch i { flex: 1; }
    .mini { height: 44px; border-radius: 8px; border: 1px solid var(--border); display: flex; overflow: hidden; }
    .mini .sb { width: 30%; }
    .mini .bd { flex: 1; padding: 8px; display: grid; gap: 4px; align-content: start; }
    .mini .bd i { height: 5px; border-radius: 3px; display: block; }
    .mini.light .sb { background: #FFFFFF; border-right: 1px solid #E5E7EB; } .mini.light .bd { background: #F5F6F8; } .mini.light .bd i { background: #D5D9DF; }
    .mini.dark .sb { background: #1A2029; border-right: 1px solid #2C3440; } .mini.dark .bd { background: #12161C; } .mini.dark .bd i { background: #3A4250; }
    .mini.system .sb { background: linear-gradient(180deg, #FFFFFF 50%, #1A2029 50%); } .mini.system .bd { background: linear-gradient(180deg, #F5F6F8 50%, #12161C 50%); } .mini.system .bd i { background: #8A919C; }
    .tick { font-size: 12px; font-weight: 600; color: var(--accent); }
    .preview { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    .card + .card { margin-top: 20px; }
    @media (max-width: 900px) { .theme-grid { grid-template-columns: repeat(2, minmax(0,1fr)); } }
    @media (max-width: 520px) { .theme-grid, .mode-grid { grid-template-columns: minmax(0,1fr); } }
</style>
