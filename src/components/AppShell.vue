<template>
  <div class="app">
    <aside class="sidebar" :class="{ open: menuOpen }">
      <div class="brand"><div class="brand-mark">W</div><div><div class="brand-name">Widebed</div><div class="brand-sub">Property Management</div></div></div>
      <nav>
        <template v-for="(g, i) in groups" :key="i">
          <template v-if="!g.label">
            <NavItem v-for="it in g.items" :key="it.label" :item="it" :active="active" @soon="notBuilt" />
          </template>
          <template v-else>
            <button class="nav-group-btn" :aria-expanded="String(openGroup === i)" @click="openGroup = openGroup === i ? -1 : i">{{ g.label }}<span class="chev">›</span></button>
            <div class="nav-group" v-show="openGroup === i">
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
          <button aria-haspopup="true" :aria-expanded="String(userMenu)" @click.stop="userMenu = !userMenu"><span class="user-name">{{ me.name }}</span>
            <span class="role-badge">{{ ROLE_LABEL[me.role] || me.role }}</span></button>
          <div class="user-pop" v-show="userMenu"><RouterLink to="/Settings/appearance" @click="userMenu = false">Appearance</RouterLink></div>
        </div>
        <button class="btn" @click="logOut">Log out</button>
      </header>
      <RouterView :key="$route.fullPath" />
    </div>
    <CommandPalette v-if="paletteOpen" :groups="groups" @close="paletteOpen = false" />
  </div>
</template>

<script>
import { NAV } from '../nav.js';
import { ROLE_LABEL, logOut } from '../lib/firebase.js';
import { notBuilt } from '../lib/toast.js';
import { useSession } from '../stores/session.js';
import NavItem from './NavItem.vue';
import CommandPalette from './CommandPalette.vue';

export default {
  components: { NavItem, CommandPalette },
  data: () => ({ ROLE_LABEL, menuOpen: false, userMenu: false, paletteOpen: false, openGroup: -1 }),
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
    this.onDocClick = () => { this.userMenu = false; };
    document.addEventListener('keydown', this.onKey);
    document.addEventListener('click', this.onDocClick);
  },
  unmounted() {
    document.removeEventListener('keydown', this.onKey);
    document.removeEventListener('click', this.onDocClick);
  },
  methods: { logOut, notBuilt }
};
</script>
