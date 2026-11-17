<template>
  <main class="login-wrap">
    <form class="login-card" novalidate @submit.prevent="signIn">
      <div class="brand"><div class="brand-mark">W</div><div><div class="brand-name">Widebed</div><div class="brand-sub">Property Management</div></div></div>
      <!-- 17 Nov 2026: Staff sign in with their email; Housekeeping with the username HR gave them -->
      <div class="login-tabs" role="tablist" aria-label="Who is signing in" :class="{ hk: mode === 'hk' }">
        <span class="login-thumb" aria-hidden="true"></span>
        <button type="button" role="tab" :aria-selected="String(mode === 'staff')" :class="{ on: mode === 'staff' }" @click="setMode('staff')">Staff</button>
        <button type="button" role="tab" :aria-selected="String(mode === 'hk')" :class="{ on: mode === 'hk' }" @click="setMode('hk')">Housekeeping</button>
      </div>
      <!-- The heading and the first box slide in from the side of the tab picked (17 Nov 2026) -->
      <Transition :name="mode === 'hk' ? 'lg-left' : 'lg-right'" mode="out-in">
        <div :key="mode">
          <h1>{{ mode === 'hk' ? 'Housekeeping sign in' : 'Sign in' }}</h1>
          <p class="lead">{{ mode === 'hk' ? 'Use the username and password HR gave you.' : 'Use the email and password your Director set up for you.' }}</p>

      <div class="notice warn" v-if="configMissing">Firebase is not connected yet. Paste your web app config into <b>src/firebase-config.js</b>.</div>
      <div class="notice error" v-if="err">{{ err }}</div>
      <div class="notice ok" v-if="ok">{{ ok }}</div>

      <div class="field" v-if="mode === 'hk'">
        <label for="username">Username</label>
        <input class="input" id="username" type="text" autocomplete="username" autocapitalize="off" spellcheck="false" v-model.trim="username" required>
      </div>
      <div class="field" v-else>
        <label for="email">Email</label>
        <input class="input" id="email" type="email" autocomplete="username" v-model.trim="email" required>
      </div>
        </div>
      </Transition>
      <div class="field">
        <label for="password">Password</label>
        <div class="pw">
          <input class="input" id="password" :type="showPw ? 'text' : 'password'" autocomplete="current-password" v-model="password" required>
          <button type="button" @click="showPw = !showPw">{{ showPw ? 'Hide' : 'Show' }}</button>
        </div>
      </div>
      <div class="login-row">
        <span></span>
        <a href="#" class="link" @click.prevent="forgot">Forgot password?</a>
      </div>
      <button class="btn btn-primary" type="submit" style="width:100%" :disabled="busy || configMissing">{{ busy ? 'Signing in…' : 'Sign in' }}</button>
      <p class="login-foot">Widebed staff only. Every sign-in is recorded.</p>
    </form>
  </main>
</template>

<script>
import { signInWithEmailAndPassword, sendPasswordResetEmail, signOut } from 'firebase/auth';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, configMissing, profileOf, ALLOWED_ROLES } from '../lib/firebase.js';
import { useSession } from '../stores/session.js';
import { hkEmail, cleanUsername } from '../lib/housekeeping.js';
import { homeFor } from '../nav.js';

const NO_ACCESS = 'Your account has no access to this system yet. Ask a Director to give you a role.';
// 17 Nov 2026: AI Agent logins (role 'ai') read data only, never the screens
const AI_ONLY = "This is an AI Agent account. It reads data only and can't open the PMS screens.";
const MODE_KEY = 'wb.loginMode';   // the tab used last on this device
const MESSAGES = {
  'auth/invalid-credential': 'Email or password is wrong.',
  'auth/invalid-email': 'That email address does not look right.',
  'auth/user-disabled': 'This account has been switched off. Ask a Director.',
  'auth/missing-password': 'Enter your password.',
  'auth/too-many-requests': 'Too many tries. Wait a few minutes, or reset your password.',
  'auth/network-request-failed': 'No internet connection. Check your connection and try again.'
};

export default {
  popups: false,   // 16 Nov 2026: messages stay on the page here (lib/page-popups.js)
  data: () => {
    let mode = 'staff';
    try { if (localStorage.getItem(MODE_KEY) === 'hk') mode = 'hk'; } catch (_) { /* no storage */ }
    return { configMissing, mode, email: '', username: '', password: '', showPw: false, busy: false, err: '', ok: '' };
  },
  async created() {
    if ('noaccess' in this.$route.query) this.err = this.$route.query.noaccess === 'ai' ? AI_ONLY : NO_ACCESS;
    // Already signed in with a working role: go straight to the dashboard.
    if (!configMissing) {
      const me = await useSession().check();
      if (me.user && ALLOWED_ROLES.includes(me.role)) this.$router.replace(homeFor(me.role));
    }
  },
  methods: {
    setMode(m) {
      this.mode = m; this.err = this.ok = '';
      try { localStorage.setItem(MODE_KEY, m); } catch (_) { /* fine */ }
    },
    async signIn() {
      this.err = this.ok = '';
      const hk = this.mode === 'hk';
      if (hk ? !this.username : !this.email) return this.err = hk ? 'Enter your username.' : 'Enter your email and password.';
      if (!this.password) return this.err = 'Enter your password.';
      this.busy = true;
      try {
        const cred = await signInWithEmailAndPassword(auth, hk ? hkEmail(cleanUsername(this.username)) : this.email, this.password);
        const profile = await profileOf(cred.user);
        if (!ALLOWED_ROLES.includes(profile.role)) { await signOut(auth); throw { code: profile.role === 'ai' ? 'aionly' : 'noaccess' }; }
        try { await updateDoc(doc(db, 'users', cred.user.uid), { lastLoginAt: serverTimestamp() }); } catch (_) {}
        useSession().set({ user: cred.user, ...profile });
        this.$router.replace(homeFor(profile.role));
      } catch (e) {
        this.err = e.code === 'aionly' ? AI_ONLY : e.code === 'noaccess' ? NO_ACCESS
          : hk && ['auth/invalid-credential', 'auth/invalid-email', 'auth/user-not-found', 'auth/wrong-password'].includes(e.code) ? 'Username or password is wrong.'
          : hk && e.code === 'auth/user-disabled' ? 'This account has been switched off. Ask HR.'
          : (MESSAGES[e.code] || 'Could not sign in. Try again.');
        this.busy = false;
      }
    },
    async forgot() {
      this.err = this.ok = '';
      if (this.mode === 'hk') return this.ok = 'Ask HR to set a new password for you. They can do it straight away on Staff accounts.';
      if (!this.email) return this.err = 'Type your email above first, then click Forgot password.';
      try { await sendPasswordResetEmail(auth, this.email); } catch (_) {}
      // Same message either way, so nobody can test which emails have accounts.
      this.ok = `If ${this.email} has an account, a reset link is on its way. Check your inbox.`;
    }
  }
};
</script>

<style scoped>
/* Staff / Housekeeping switch: the white pill slides under the tab picked (as on Staff accounts and Issues) */
.login-tabs { position: relative; display: grid; grid-template-columns: 1fr 1fr; padding: 4px; margin-top: 24px; border-radius: 10px;
  background: var(--chip); border: 1px solid var(--border); }
.login-thumb { position: absolute; top: 4px; bottom: 4px; left: 4px; width: calc(50% - 4px); border-radius: 7px; background: var(--surface);
  box-shadow: 0 1px 3px rgba(0, 0, 0, .12), 0 0 0 1px var(--border); transition: transform .3s cubic-bezier(.4, 0, .2, 1); }
.login-tabs.hk .login-thumb { transform: translateX(100%); }
.login-tabs button { position: relative; z-index: 1; height: 34px; border: 0; border-radius: 7px; background: none; font: inherit; font-size: 14px;
  font-weight: 600; color: var(--muted); cursor: pointer; transition: color .25s ease; }
.login-tabs button.on { color: var(--text); }
.login-tabs + div h1, .login-tabs ~ div > h1 { margin-top: 20px; }

/* The text and first box: out to one side, in from the other */
.lg-left-enter-active, .lg-left-leave-active, .lg-right-enter-active, .lg-right-leave-active { transition: opacity .18s ease, transform .18s ease; }
.lg-left-enter-from { opacity: 0; transform: translateX(16px); }
.lg-left-leave-to { opacity: 0; transform: translateX(-16px); }
.lg-right-enter-from { opacity: 0; transform: translateX(-16px); }
.lg-right-leave-to { opacity: 0; transform: translateX(16px); }
@media (prefers-reduced-motion: reduce) {
  .login-thumb, .login-tabs button { transition: none; }
  .lg-left-enter-active, .lg-left-leave-active, .lg-right-enter-active, .lg-right-leave-active { transition: none; }
}
</style>
