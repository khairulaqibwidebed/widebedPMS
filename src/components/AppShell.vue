<template>
  <div class="app">
    <aside class="sidebar" :class="{ open: menuOpen }">
      <div class="brand"><div class="brand-mark">W</div><div><div class="brand-name">Widebed</div><div class="brand-sub">Property Management</div></div></div>
      <nav>
        <template v-for="(g, i) in groups" :key="i">
          <div v-if="!g.label" :class="{ 'nav-flat-after': i > 0 && groups[i - 1].label }">
            <NavItem v-for="it in g.items" :key="it.label" :item="it" :active="active" @soon="notBuilt" />
          </div>
          <template v-else>
            <button class="nav-group-btn" :aria-expanded="String(isOpen(g, i))" @click="toggle(g, i)">{{ g.label }}<span class="chev">›</span></button>
            <div class="nav-group" v-show="isOpen(g, i)">
              <NavItem v-for="it in g.items" :key="it.label" :item="it" :active="active" @soon="notBuilt" />
            </div>
          </template>
        </template>
      </nav>
    </aside>
    <div class="main">
      <header class="topbar">
        <button class="btn menu-btn" aria-label="Menu" @click="menuOpen = !menuOpen">☰</button>
        <button class="search-btn" @click="paletteOpen = true"><svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="7" cy="7" r="5.5"/><path d="M11 11l4 4"/></svg> <span>Search</span><kbd>Ctrl K</kbd></button>
        <div class="user-menu">
          <div class="user-id"><Avatar :uid="me.user?.uid" :name="me.name" :role="me.role" :size="30" /><span class="user-name">{{ me.name }}</span>
            <span class="role-badge role-tint" :style="roleTint(me.role)">{{ ROLE_LABEL[me.role] || me.role }}</span></div>
        </div>
        <!-- Notifications: icon only for now (system on Khairul's to-do list). Log out is on Profile & Appearance. -->
        <button class="btn bell-btn" aria-label="Notifications" title="Notifications" @click="notBuilt('Notifications')"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg></button>
      </header>
      <RouterView :key="$route.fullPath" />
    </div>
    <CommandPalette v-if="paletteOpen" :groups="groups" @close="paletteOpen = false" />
  </div>
</template>

<script>
import { NAV } from '../nav.js';
import { ROLE_LABEL } from '../lib/firebase.js';
import { notBuilt } from '../lib/toast.js';
import { useSession } from '../stores/session.js';
import NavItem from './NavItem.vue';
import Avatar from './Avatar.vue';
import { roleTint } from '../lib/avatars.js';
import CommandPalette from './CommandPalette.vue';

// Sidebar groups a person has folded, remembered in this browser.
const FOLDED_KEY = 'wb.navFolded';
function readFolded() { try { return JSON.parse(localStorage.getItem(FOLDED_KEY)) || []; } catch (_) { return []; } }

export default {
  components: { NavItem, CommandPalette, Avatar },
  data: () => ({ ROLE_LABEL, menuOpen: false, paletteOpen: false, openGroup: -1, folded: readFolded() }),
  computed: {
    me: () => useSession(),
    groups() { return NAV[this.me.role] || []; },
    active() { return this.$route.meta.label; }
  },
  watch: {
    // Only the current page's group is open. On an ungrouped page (Dashboard) the first group opens.
    $route: {
      immediate: true,
      handler() {
        this.menuOpen = false;
        const i = this.groups.findIndex(g => g.label && g.items.some(it => it.label === this.active));
        this.openGroup = i >= 0 ? i : this.groups.findIndex(g => g.label);
      }
    }
  },
  mounted() {
    this.onKey = e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); this.paletteOpen = true; } };
    document.addEventListener('keydown', this.onKey);
  },
  unmounted() {
    document.removeEventListener('keydown', this.onKey);
  },
  methods: {
    notBuilt, roleTint,
    // Director: one group open at a time (the current page's). Everyone else: every group open unless they folded it.
    isOpen(g, i) { return this.me.role === 'director' ? this.openGroup === i : !this.folded.includes(g.label); },
    toggle(g, i) {
      if (this.me.role === 'director') { this.openGroup = this.openGroup === i ? -1 : i; return; }
      this.folded = this.folded.includes(g.label) ? this.folded.filter(l => l !== g.label) : [...this.folded, g.label];
      try { localStorage.setItem(FOLDED_KEY, JSON.stringify(this.folded)); } catch (_) {}
    }
  }
};
</script>
