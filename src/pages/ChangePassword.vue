<template>
  <main class="login-wrap">
    <form class="login-card" novalidate @submit.prevent="save">
      <div class="brand"><div class="brand-mark">W</div><div><div class="brand-name">Widebed</div><div class="brand-sub">Property Management</div></div></div>
      <!-- 26 Nov 2026: staff whose password misses the strong rule come here after signing in (api/login-guard.js) -->
      <h1>Choose a stronger password</h1>
      <p class="lead">{{ forced ? 'Your password is too simple. Choose a new one to carry on.' : 'Choose a new password.' }}</p>

      <div class="notice error" v-if="err">{{ err }}</div>

      <div class="field">
        <label for="npw">New password</label>
        <div class="pw">
          <input class="input" id="npw" :type="showPw ? 'text' : 'password'" autocomplete="new-password" v-model="pw" required>
          <button type="button" @click="showPw = !showPw">{{ showPw ? 'Hide' : 'Show' }}</button>
        </div>
      </div>
      <ul class="pw-rules">
        <li v-for="r in rules" :key="r.id" :class="{ met: r.met }">{{ r.met ? '✓' : '•' }} {{ r.label }}</li>
      </ul>
      <div class="field">
        <label for="npw2">Type it again</label>
        <input class="input" id="npw2" :type="showPw ? 'text' : 'password'" autocomplete="new-password" v-model="pw2" required>
      </div>
      <button class="btn btn-primary" type="submit" style="width:100%" :disabled="busy">{{ busy ? 'Saving…' : 'Save new password' }}</button>
      <p class="login-foot"><a href="#" class="link" @click.prevent="out">Sign out</a></p>
    </form>
  </main>
</template>

<script>
import { updatePassword } from 'firebase/auth';
import { auth, logOut } from '../lib/firebase.js';
import { useSession } from '../stores/session.js';
import { PW_RULES, passwordProblem } from '../lib/password-rule.js';
import { guardCall } from '../lib/login-guard.js';
import { homeFor } from '../nav.js';

export default {
  popups: false,
  data: () => ({ pw: '', pw2: '', showPw: false, busy: false, err: '' }),
  computed: {
    forced() { return useSession().weakPassword; },
    rules() { return PW_RULES.map(r => ({ ...r, met: r.ok(this.pw) })); }
  },
  methods: {
    async save() {
      this.err = '';
      const bad = passwordProblem(this.pw);
      if (bad) return this.err = bad;
      if (this.pw !== this.pw2) return this.err = 'The two passwords are not the same.';
      this.busy = true;
      try {
        await updatePassword(auth.currentUser, this.pw);
        try { await guardCall('changed', { password: this.pw }); }   // the server clears the "too simple" mark
        catch (_) { this.busy = false; return this.err = 'Your password was changed, but the system could not confirm it. Sign out and sign in with the new password.'; }
        const s = useSession();
        s.weakPassword = false;
        this.$router.replace(homeFor(s.role));
      } catch (e) {
        this.err = e.code === 'auth/requires-recent-login' ? 'Please sign out, sign in again, then choose the new password.'
          : e.code === 'auth/weak-password' || e.code === 'auth/password-does-not-meet-requirements' ? 'Firebase says this password is too weak. Try a longer one.'
          : e.code === 'auth/network-request-failed' ? 'No internet connection. Check your connection and try again.'
          : 'Could not save the password: ' + (e.message || e);
        this.busy = false;
      }
    },
    async out() { await logOut(); location.replace('/'); }
  }
};
</script>

<style scoped>
.pw-rules { list-style: none; padding: 0; margin: -6px 0 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 4px 12px; font-size: 13px; color: var(--muted); }
.pw-rules li.met { color: var(--ok, #2e7d32); }
</style>
