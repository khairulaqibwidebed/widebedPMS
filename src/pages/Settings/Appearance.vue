<template>
  <main class="content">
    <div class="page-head">
      <div>
        <h1>Profile &amp; Appearance</h1>
        <div class="sub">Your account details, and how the PMS looks on your screen.</div>
      </div>
      <div class="preview head-preview">
        <span class="pv-label">Preview</span>
        <button class="btn btn-primary">+ Add line</button>
        <button class="btn">Cancel</button>
        <span class="pill green">Completed</span><span class="pill amber">Estimated</span><span class="pill grey">Draft</span>
        <span class="role-badge">Finance</span>
        <span class="editlink">Edit ›</span>
      </div>
    </div>

    <div class="layout">
    <aside class="card idcard">
      <div class="banner"></div>
      <div class="id-body">
        <div class="ava"><Avatar :uid="uid" :name="me.name" :role="me.role" :size="104" /></div>
        <h2 class="id-name">{{ me.name || '-' }}</h2>
        <span class="role-badge role-tint" :style="roleTint(me.role)">{{ roleLabel }}</span>
        <div class="id-mail">{{ email || '-' }}</div>
        <div class="id-btns">
          <label class="btn" :class="{ 'btn-primary': !hasPic }">{{ hasPic ? 'Change photo' : 'Upload photo' }}<input type="file" accept="image/png,image/jpeg,image/webp" hidden @change="pick" :disabled="busy"></label>
          <button class="btn" v-if="hasPic" @click="removePic" :disabled="busy">Remove photo</button>
        </div>
        <div class="id-sep"></div>
        <button class="btn btn-danger wide" @click="resetPw" :disabled="busy || !email">Reset password</button>
        <p class="ok" v-if="okMsg">{{ okMsg }}</p>
        <p class="err" v-if="error">{{ error }}</p>
      </div>
    </aside>
    <div class="stack">

    <section class="card">
      <div class="card-head"><h2>Colour theme</h2></div>
      <p class="card-intro">Widebed orange is the default for everyone. Pick Custom to choose your own colour.</p>
      <div class="theme-grid">
        <template v-for="th in themes" :key="th.key">
          <button class="choice" :class="{ on: t.brand === th.key }" @click="set({ brand: th.key })" :aria-pressed="t.brand === th.key">
            <span class="swatch"><i :style="`background:${th.c[0]}`"></i><i :style="`background:${th.c[1]}`"></i><i :style="`background:${th.c[2]}`"></i></span>
            <span><b>{{ th.label }}</b><span class="tick" v-show="t.brand === th.key"> · In use</span><br><small>{{ th.note }}</small></span>
          </button>
        </template>
        <div class="choice custom" :class="{ on: t.brand === 'custom' }" role="button" tabindex="0" :aria-pressed="t.brand === 'custom'"
             @click="t.brand !== 'custom' && set({ brand: 'custom' })" @keydown.enter.self="set({ brand: 'custom' })">
          <span class="swatch"><i :style="`background:${pal.brand}`"></i><i :style="`background:${pal.accent}`"></i><i :style="`background:${pal.soft}`"></i></span>
          <span><b>Custom</b><span class="tick" v-show="t.brand === 'custom'"> · In use</span><br><small>Your own colour</small></span>
          <span class="pick" @click.stop>
            <input type="color" :value="t.custom" @input="live($event.target.value)" @change="pickColour($event.target.value)" aria-label="Pick your colour">
            <input class="input hex" :value="hexDraft" @input="hexDraft = $event.target.value" @keydown.enter="typeHex" @blur="typeHex" maxlength="7" spellcheck="false" aria-label="Colour code">
          </span>
        </div>
      </div>
      <p class="note" v-if="t.brand === 'custom' && pal.accent !== pal.brand" style="margin:10px 0 0">Buttons use a slightly darker shade ({{ pal.accent }}) so white text on them stays readable.</p>
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

    </div>
    </div>

    <p class="note" style="margin-top:16px">Saved to your account, so it follows you to any computer. Statements, invoices, receipts and other PDFs always use Widebed's company colours and logo (Settings › Brand logos), whatever you pick here.</p>
  </main>
</template>

<script>
import { readTheme, saveTheme, applyTheme, customPalette, isHex } from '@/lib/theme.js';
import { toast } from '@/lib/toast.js';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth, ROLE_LABEL } from '@/lib/firebase.js';
import { useSession } from '@/stores/session.js';
import Avatar from '@/components/Avatar.vue';
import { avatarSrc, squareShrink, saveMyAvatar, removeMyAvatar, roleTint, MAX_OUT } from '@/lib/avatars.js';

const MAX_IN = 10 * 1024 * 1024;

const dark = matchMedia('(prefers-color-scheme: dark)');
const follow = () => applyTheme();

export default {
  components: { Avatar },
  data() {
    const me = useSession();
    return {
      me, uid: me.user?.uid || null, email: me.user?.email || '', busy: false, okMsg: '', error: '',
      t: readTheme(), hexDraft: readTheme().custom,
      themes: [
        { key: 'widebed', label: 'Widebed', note: 'Orange and white (default)', c: ['#F26D4D', '#C2452B', '#FDEBE6'] },
        { key: 'blue', label: 'Blue', note: 'Classic office blue', c: ['#4C7FE0', '#2F5FBF', '#E6EEFB'] }
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
  computed: {
    pal() { return customPalette(this.t.custom, this.t.mode === 'dark' || (this.t.mode === 'system' && dark.matches)); },
    hasPic() { return !!avatarSrc(this.uid); },
    roleLabel() { return ROLE_LABEL[this.me.role] || this.me.role || '-'; }
  },
  methods: {
    roleTint,
    pick(e) {
      this.error = ''; this.okMsg = '';
      const f = e.target.files[0]; e.target.value = '';
      if (!f) return;
      if (!/^image\/(png|jpeg|webp)$/.test(f.type)) return this.error = 'Choose a JPG, PNG or WebP picture.';
      if (f.size > MAX_IN) return this.error = 'That picture is over 10 MB. Choose a smaller one.';
      const url = URL.createObjectURL(f), img = new Image();
      img.onload = async () => {
        URL.revokeObjectURL(url);
        const src = squareShrink(img);
        if (src.length > MAX_OUT * 1.4) return this.error = 'That picture could not be made small enough. Try another one.';
        this.busy = true;
        try { await saveMyAvatar(this.uid, src); toast('Photo saved'); }
        catch (_) { this.error = 'Could not save the photo. Check your connection and try again.'; }
        this.busy = false;
      };
      img.onerror = () => { URL.revokeObjectURL(url); this.error = 'That file could not be read as a picture.'; };
      img.src = url;
    },
    async removePic() {
      this.error = ''; this.okMsg = ''; this.busy = true;
      try { await removeMyAvatar(this.uid); toast('Photo removed'); }
      catch (_) { this.error = 'Could not remove the photo. Try again.'; }
      this.busy = false;
    },
    async resetPw() {
      this.error = ''; this.okMsg = ''; this.busy = true;
      try { await sendPasswordResetEmail(auth, this.email); this.okMsg = `A password reset link was sent to ${this.email}. Check your inbox and spam folder.`; }
      catch (_) { this.error = 'Could not send the reset email. Try again in a few minutes.'; }
      this.busy = false;
    },
    set(patch) { this.t = { ...this.t, ...patch }; saveTheme(this.t); toast('Appearance saved'); },
    // Dragging in the colour picker previews live; letting go saves it
    live(hex) { this.t = { ...this.t, brand: 'custom', custom: hex.toUpperCase() }; this.hexDraft = this.t.custom; applyTheme(this.t); },
    pickColour(hex) { this.hexDraft = hex.toUpperCase(); this.set({ brand: 'custom', custom: this.hexDraft }); },
    typeHex() {
      let h = (this.hexDraft || '').trim(); if (h && h[0] !== '#') h = '#' + h;
      if (!isHex(h)) { this.hexDraft = this.t.custom; return; }
      if (h.toUpperCase() !== this.t.custom || this.t.brand !== 'custom') this.pickColour(h);
    }
  }
};
</script>

<style scoped>
    .layout { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 20px; align-items: stretch; }
    .stack { display: grid; gap: 20px; min-width: 0; }
    .stack .card + .card, .card + .card { margin-top: 0; }
    .idcard { padding: 0; overflow: hidden; display: flex; flex-direction: column; }
    .id-body { flex: 1; }
    .id-body .wide { margin-top: auto; }
    .head-preview { margin-left: auto; align-self: end; justify-content: flex-end; }
    .pv-label { font-size: 12px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
    .banner { height: 84px; background: linear-gradient(135deg, var(--brand), var(--accent)); }
    .id-body { display: grid; justify-items: center; gap: 8px; padding: 0 20px 22px; text-align: center; }
    .ava { margin-top: -52px; border-radius: 50%; border: 4px solid var(--surface); background: var(--surface); line-height: 0; }
    .id-name { margin: 6px 0 0; font-size: 18px; }
    .id-body .role-badge { justify-self: center; width: auto; display: inline-flex; align-items: center; line-height: 1; padding: 6px 12px 5px; }
    .id-mail { color: var(--muted); font-size: 13px; overflow-wrap: anywhere; }
    .id-btns { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; margin-top: 6px; }
    .id-btns label.btn { cursor: pointer; }
    .id-sep { height: 1px; background: var(--border); width: 100%; margin: 10px 0 4px; }
    .wide { width: 100%; }
    @media (max-width: 900px) { .layout { grid-template-columns: minmax(0, 1fr); } .idcard { position: static; } .head-preview { margin-left: 0; } }
    .muted { color: var(--muted); font-size: 12px; }
    .small { margin: 0; }
    .ok { color: var(--green, #1F8A4C); font-size: 13px; margin: 0; }
    .err { color: var(--red, #C0392B); font-size: 13px; margin: 0; }
    .theme-grid { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 14px; }
    .choice.custom { cursor: pointer; }
    .pick { display: flex; gap: 8px; align-items: center; }
    .pick input[type=color] { width: 38px; height: 34px; padding: 2px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); cursor: pointer; flex: none; }
    .pick .hex { height: 34px; min-width: 0; flex: 1; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 13px; text-transform: uppercase; }
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
    @media (max-width: 1200px) { .theme-grid { grid-template-columns: repeat(2, minmax(0,1fr)); } }
    @media (max-width: 520px) { .theme-grid, .mode-grid { grid-template-columns: minmax(0,1fr); } }
</style>
