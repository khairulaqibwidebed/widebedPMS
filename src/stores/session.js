// Who is signed in. Filled once by the router before the first page shows.
import { defineStore } from 'pinia';
import { whoAmI } from '../lib/firebase.js';

let checking = null;

export const useSession = defineStore('session', {
  state: () => ({ user: null, role: null, name: '', active: false, checked: false }),
  actions: {
    // Asks Firebase once; later calls reuse the answer.
    async check() {
      if (this.checked) return this;
      checking ||= whoAmI().then(me => { Object.assign(this, { user: me.user, role: me.role, name: me.name || '', active: me.active ?? false, checked: true }); });
      await checking;
      return this;
    },
    set(me) { Object.assign(this, { user: me.user, role: me.role, name: me.name || '', active: me.active ?? true, checked: true }); }
  }
});
