<template>
  <main class="login-wrap">
    <form class="login-card" novalidate @submit.prevent="signIn">
      <div class="brand"><div class="brand-mark">W</div><div><div class="brand-name">Widebed</div><div class="brand-sub">Property Management</div></div></div>
      <!-- 17 Nov 2026: one form for everyone. Staff type their email; housekeepers type the username HR gave them. -->
      <h1>Sign in</h1>
      <p class="lead">Use your email or username and your password.</p>

      <div class="notice warn" v-if="configMissing">Firebase is not connected yet. Paste your web app config into <b>src/firebase-config.js</b>.</div>
      <div class="notice error" v-if="err">{{ err }}</div>
      <div class="notice ok" v-if="ok">{{ ok }}</div>

      <div class="field">
        <label for="login">Email or username</label>
        <input class="input" id="login" type="text" autocomplete="username" autocapitalize="off" spellcheck="false" v-model.trim="login" required>
      </div>
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
const MESSAGES = {
  'auth/invalid-credential': 'Email, username or password is wrong.',
  'auth/invalid-email': 'That email or username does not look right.',
  'auth/user-disabled': 'This account has been switched off. Ask a Director or HR.',
  'auth/missing-password': 'Enter your password.',
  'auth/too-many-requests': 'Too many tries. Wait a few minutes, or reset your password.',
  'auth/network-request-failed': 'No internet connection. Check your connection and try again.'
};

export default {
  popups: false,   // 16 Nov 2026: messages stay on the page here (lib/page-popups.js)
  data: () => ({ configMissing, login: '', password: '', showPw: false, busy: false, err: '', ok: '' }),
  computed: {
    // No "@" means a username (housekeeping): it becomes the hidden sign-in address <username>@housekeeping.widebed.com
    isUsername() { return !!this.login && !this.login.includes('@'); },
    signInEmail() { return this.isUsername ? hkEmail(cleanUsername(this.login)) : this.login; }
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
    async signIn() {
      this.err = this.ok = '';
      if (!this.login) return this.err = 'Enter your email or username.';
      if (!this.password) return this.err = 'Enter your password.';
      this.busy = true;
      try {
        const cred = await signInWithEmailAndPassword(auth, this.signInEmail, this.password);
        const profile = await profileOf(cred.user);
        if (!ALLOWED_ROLES.includes(profile.role)) { await signOut(auth); throw { code: profile.role === 'ai' ? 'aionly' : 'noaccess' }; }
        try { await updateDoc(doc(db, 'users', cred.user.uid), { lastLoginAt: serverTimestamp() }); } catch (_) {}
        useSession().set({ user: cred.user, ...profile });
        this.$router.replace(homeFor(profile.role));
      } catch (e) {
        this.err = e.code === 'aionly' ? AI_ONLY : e.code === 'noaccess' ? NO_ACCESS
          : ['auth/user-not-found', 'auth/wrong-password'].includes(e.code) ? MESSAGES['auth/invalid-credential']
          : (MESSAGES[e.code] || 'Could not sign in. Try again.');
        this.busy = false;
      }
    },
    async forgot() {
      this.err = this.ok = '';
      if (this.isUsername) return this.ok = 'Ask HR to set a new password for you. They can do it straight away on Staff accounts.';
      if (!this.login) return this.err = 'Type your email above first, then click Forgot password.';
      try { await sendPasswordResetEmail(auth, this.login); } catch (_) {}
      // Same message either way, so nobody can test which emails have accounts.
      this.ok = `If ${this.login} has an account, a reset link is on its way. Check your inbox.`;
    }
  }
};
</script>
