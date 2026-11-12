// Who is signed in. Filled once by the router before the first page shows.
// perms = pages ticked on Staff accounts, or null for the role's usual pages (lib/access.js, nav.js navFor).
// properties = the property ids they may see (users/{uid}.properties, lib/property-scope.js); Directors see all.
// states = the states they work in (users/{uid}.states, lib/states.js); Directors see every state whatever it holds.
import { defineStore } from 'pinia';
import { whoAmI } from '../lib/firebase.js';
import { loadMyTheme } from '../lib/theme.js';

let checking = null;

export const useSession = defineStore('session', {
  state: () => ({ user: null, role: null, perms: null, intern: false, states: [], properties: [], name: '', active: false, checked: false }),
  actions: {
    // Asks Firebase once; later calls reuse the answer.
    async check() {
      if (this.checked) return this;
      checking ||= whoAmI().then(me => {
        Object.assign(this, { user: me.user, role: me.role, perms: me.perms ?? null, intern: !!me.intern, states: me.states || [], properties: me.properties || [], name: me.name || '', active: me.active ?? false, checked: true });
        loadMyTheme(me.user?.uid);
      });
      await checking;
      return this;
    },
    set(me) { Object.assign(this, { user: me.user, role: me.role, perms: me.perms ?? null, intern: !!me.intern, states: me.states || [], properties: me.properties || [], name: me.name || '', active: me.active ?? true, checked: true }); }
  }
});