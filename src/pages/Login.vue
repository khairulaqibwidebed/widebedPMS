<template>
  <main class="login-wrap">
    <form class="login-card" novalidate @submit.prevent="signIn">
      <div class="brand"><div class="brand-mark">W</div><div><div class="brand-name">Widebed</div><div class="brand-sub">Property Management</div></div></div>
      <h1>Sign in</h1>
      <p class="lead">Use the email and password your Director set up for you.</p>

      <div class="notice warn" v-if="configMissing">Firebase is not connected yet. Paste your web app config into <b>src/firebase-config.js</b>.</div>
      <div class="notice error" v-if="err">{{ err }}</div>
      <div class="notice ok" v-if="ok">{{ ok }}</div>

      <div class="field">
        <label for="email">Email</label>
        <input class="input" id="email" type="email" autocomplete="username" v-model.trim="email" required>
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

const NO_ACCESS = 'Your account has no access to this system yet. Ask a Director to give you a role.';
const MESSAGES = {
  'auth/invalid-credential': 'Email or password is wrong.',
  'auth/invalid-email': 'That email address does not look right.',
  'auth/user-disabled': 'This account has been switched off. Ask a Director.',
  'auth/missing-password': 'Enter your password.',
  'auth/too-many-requests': 'Too many tries. Wait a few minutes, or reset your password.',
  'auth/network-request-failed': 'No internet connection. Check your connection and try again.'
};

export default {
  data: () => ({ configMissing, email: '', password: '', showPw: false, busy: false, err: '', ok: '' }),
  async created() {
    if ('noaccess' in this.$route.query) this.err = NO_ACCESS;
    // Already signed in with a working role: go straight to the dashboard.
    if (!configMissing) {
      const me = await useSession().check();
      if (me.user && ALLOWED_ROLES.includes(me.role)) this.$router.replace('/Dashboard');
    }
  },
  methods: {
    async signIn() {
      this.err = this.ok = '';
      if (!this.email || !this.password) return this.err = 'Enter your email and password.';
      this.busy = true;
      try {
        const cred = await signInWithEmailAndPassword(auth, this.email, this.password);
        const profile = await profileOf(cred.user);
        if (!ALLOWED_ROLES.includes(profile.role)) { await signOut(auth); throw { code: 'noaccess' }; }
        try { await updateDoc(doc(db, 'users', cred.user.uid), { lastLoginAt: serverTimestamp() }); } catch (_) {}
        useSession().set({ user: cred.user, ...profile });
        this.$router.replace('/Dashboard');
      } catch (e) {
        this.err = e.code === 'noaccess' ? NO_ACCESS : (MESSAGES[e.code] || 'Could not sign in. Try again.');
        this.busy = false;
      }
    },
    async forgot() {
      this.err = this.ok = '';
      if (!this.email) return this.err = 'Type your email above first, then click Forgot password.';
      try { await sendPasswordResetEmail(auth, this.email); } catch (_) {}
      // Same message either way, so nobody can test which emails have accounts.
      this.ok = `If ${this.email} has an account, a reset link is on its way. Check your inbox.`;
    }
  }
};
</script>
