<template>
  <div class="app" :class="{ collapsed: rail }">
    <aside class="sidebar" :class="{ open: menuOpen }">
      <div class="brand">
        <div class="brand-mark">W</div>
        <div class="brand-text"><div class="brand-name">Widebed</div><div class="brand-sub">Property Management</div></div>
      </div>

      <nav>
        <template v-for="(g, i) in groups" :key="i">
          <div v-if="!g.label" :class="{ 'nav-flat-after': i > 0 && groups[i - 1].label }">
            <NavItem v-for="it in g.items" :key="it.label" :item="it" :active="active" :collapsed="rail" @soon="notBuilt" />
          </div>
          <template v-else>
            <button class="nav-group-btn" :class="{ 'has-active': hasActive(g) }" :aria-expanded="rail ? null : String(isOpen(g, i))" :title="rail ? g.label : null" @click="toggle(g, i)">
              <svg class="grp-icon" viewBox="0 0 24 24" aria-hidden="true" v-html="groupIcon(g)"></svg>
              <span class="grp-label">{{ g.label }}</span>
              <span class="chev">›</span>
            </button>
            <div class="nav-group" v-show="isOpen(g, i)">
              <NavItem v-for="it in g.items" :key="it.label" :item="it" :active="active" :collapsed="rail" @soon="notBuilt" />
            </div>
          </template>
        </template>
      </nav>

      <button class="sidebar-toggle" type="button" :aria-expanded="wide ? String(!rail) : null" :aria-label="!wide ? 'Close menu' : rail ? 'Expand sidebar' : 'Collapse sidebar'" :title="wide && rail ? 'Expand sidebar' : null" @click="toggleSidebar">
        <svg class="toggle-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/><path class="collapse-arrow" d="m16 15-3-3 3-3"/></svg>
        <span class="toggle-label">{{ wide ? 'Collapse' : 'Close menu' }}</span>
      </button>
    </aside>
    <div class="main">
      <header class="topbar">
        <button class="btn menu-btn" aria-label="Menu" @click="menuOpen = !menuOpen">☰</button>
        <button class="search-btn" @click="paletteOpen = true"><svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="7" cy="7" r="5.5"/><path d="M11 11l4 4"/></svg> <span>Search</span><kbd>Ctrl K</kbd></button>
        <div class="user-menu" v-click-outside="() => { userOpen = false }" v-esc="() => { userOpen = false }">
          <button type="button" class="user-id" :class="{ open: userOpen }" @click="userOpen = !userOpen" aria-haspopup="menu" :aria-expanded="String(userOpen)">
            <Avatar :uid="me.user?.uid" :name="me.name" :role="me.role" :size="30" /><span class="user-name">{{ me.name }}</span>
            <span class="role-badge role-tint" :style="roleTint(me.role)">{{ ROLE_LABEL[me.role] || me.role }}</span>
            <svg class="um-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
          </button>
          <!-- Account menu: profile and log out, one click from any page -->
          <div class="um-pop" role="menu" v-show="userOpen">
            <div class="um-head">
              <Avatar :uid="me.user?.uid" :name="me.name" :role="me.role" :size="40" />
              <div class="um-who"><b>{{ me.name }}</b><span>{{ me.user?.email || '' }}</span></div>
            </div>
            <router-link class="um-item" role="menuitem" to="/Settings/appearance" @click="userOpen = false">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>
              Profile &amp; Appearance
            </router-link>
            <button type="button" class="um-item" role="menuitem" @click="refreshData">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/></svg>
              Refresh saved data
            </button>
            <button type="button" class="um-item danger" role="menuitem" @click="logOut">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg>
              Log out
            </button>
          </div>
        </div>
        <!-- Notifications: icon only for now (system on Khairul's to-do list). Log out is on Profile & Appearance.
        <button class="btn bell-btn" aria-label="Notifications" title="Notifications" @click="notBuilt('Notifications')"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg></button> -->
        <!-- Neo's Notification -->
        <NotificationBell />
        <!-- <button class="btn bell-btn" aria-label="Notifications" title="Notifications" @click="$router.push('/notifications')">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>
          <span v-if="unreadCount > 0" class="notification-dot" :title="`${unreadCount} unread notifications`"></span>
        </button> -->
      </header>
      <div class="quota-bar" role="alert" v-if="quota.hit && !quota.hiddenAt">
        <b>The free daily Firestore limit is used up.</b>
        <span>{{ `Pages can't load or save data until it resets at about ${resetAt}. Saved copies still show. Please stop reloading.` }}</span>
        <button type="button" class="btn" @click="quota.hiddenAt = Date.now()">Hide</button>
      </div>
      <RouterView :key="$route.fullPath" />
    </div>
    <CommandPalette v-if="paletteOpen" :groups="groups" @close="paletteOpen = false" />
  </div>
</template>

<script>
import { NAV } from '../nav.js';
import { ROLE_LABEL, logOut } from '../lib/firebase.js';
import { clearCache } from '../lib/cache.js';
import { quota, resetTime } from '../lib/quota.js';
import { notBuilt } from '../lib/toast.js';
import { useSession } from '../stores/session.js';
import NavItem from './NavItem.vue';
import Avatar from './Avatar.vue';
import { roleTint } from '../lib/avatars.js';
import CommandPalette from './CommandPalette.vue';
import { NAV_ICONS } from './NavIcons.js';
// import { triggerPushNotification } from '../lib/push.js';
import NotificationBell from '@/components/NotificationBell.vue'

// Sidebar groups a person has folded, remembered in this browser.
const FOLDED_KEY = 'wb.navFolded';
function readFolded() { try { return JSON.parse(localStorage.getItem(FOLDED_KEY)) || []; } catch (_) { return []; } }

// Whether the whole sidebar is collapsed to an icon rail, remembered in this browser.
const COLLAPSED_KEY = 'wb.navCollapsed';
function readCollapsed() { try { return localStorage.getItem(COLLAPSED_KEY) === '1'; } catch (_) { return false; } }

// The icon rail only exists on desktop. Keep this equal to the breakpoint in the <style> block below,
// and one pixel above the 860px where app.css turns the sidebar into a drawer.
const DESKTOP_QUERY = '(min-width: 861px)';

export default {
  components: { NavItem, CommandPalette, Avatar, NotificationBell },
  data: () => ({
    ROLE_LABEL, quota, menuOpen: false, userOpen: false, paletteOpen: false, openGroup: -1,
    folded: readFolded(), collapsed: readCollapsed(),
    wide: window.matchMedia(DESKTOP_QUERY).matches
  }),
  computed: {
    resetAt: () => resetTime(),
    me: () => useSession(),
    groups() { return NAV[this.me.role] || []; },
    active() { return this.$route.meta.label; },
    // Collapsed AND on desktop. On mobile the sidebar is always the full drawer.
    rail() { return this.collapsed && this.wide; },
    // Neo's Notification: return a mock unread count (e.g., 2) so it doesn't crash
    // unreadCount() { 
    //   return 2; 
    // }
    
  },
  watch: {
    // Only the current page's group is open. On an ungrouped page (Dashboard) the first group opens.
    $route: {
      immediate: true,
      handler() {
        this.menuOpen = false; this.userOpen = false;
        const i = this.groups.findIndex(g => g.label && g.items.some(it => it.label === this.active));
        this.openGroup = i >= 0 ? i : this.groups.findIndex(g => g.label);
      }
    }
  },
  mounted() {
    this.onKey = e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); this.paletteOpen = true; } };
    document.addEventListener('keydown', this.onKey);
    this.mq = window.matchMedia(DESKTOP_QUERY);
    this.onMq = e => { this.wide = e.matches; };
    this.mq.addEventListener('change', this.onMq);

    // Neo's Notification: Request permission for push notifications if not already granted
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    // setTimeout(() => {
    //   triggerPushNotification(
    //     'New Task Assigned',
    //     'AC not cooling in Room 302 has been assigned to you.',
    //     '/Operations/issues'
    //   );
    // }, 3000);
  },
  unmounted() {
    document.removeEventListener('keydown', this.onKey);
    this.mq.removeEventListener('change', this.onMq);
  },
  methods: {
    logOut,
    async refreshData() { await clearCache(); location.reload(); },
    notBuilt, roleTint,
    groupIcon(g) { return NAV_ICONS[g.icon] || NAV_ICONS.dot; },
    hasActive(g) { return g.items.some(it => it.label === this.active); },
    setCollapsed(v) {
      this.collapsed = v;
      try { localStorage.setItem(COLLAPSED_KEY, v ? '1' : '0'); } catch (_) {}
    },
    // Desktop: collapse or expand the icon rail. Phone: the sidebar is a drawer, so the same button closes it.
    toggleSidebar() {
      if (!this.wide) { this.menuOpen = false; return; }
      this.setCollapsed(!this.collapsed);
    },
    // Director: one group open at a time (the current page's). Everyone else: every group open unless they folded it.
    // In the icon rail the item lists are hidden by CSS, so folding state is kept and comes back on expand.
    isOpen(g, i) {
      return this.me.role === 'director' ? this.openGroup === i : !this.folded.includes(g.label);
    },
    // Open a group (used when a department icon is clicked in the rail).
    reveal(g, i) {
      if (this.me.role === 'director') { this.openGroup = i; return; }
      if (!this.folded.includes(g.label)) return;
      this.folded = this.folded.filter(l => l !== g.label);
      try { localStorage.setItem(FOLDED_KEY, JSON.stringify(this.folded)); } catch (_) {}
    },
    toggle(g, i) {
      // Clicking a department icon in the rail expands the sidebar with that department open.
      if (this.rail) { this.setCollapsed(false); this.reveal(g, i); return; }
      if (this.me.role === 'director') { this.openGroup = this.openGroup === i ? -1 : i; return; }
      this.folded = this.folded.includes(g.label) ? this.folded.filter(l => l !== g.label) : [...this.folded, g.label];
      try { localStorage.setItem(FOLDED_KEY, JSON.stringify(this.folded)); } catch (_) {}
    }
  }
};
</script>

<style>
/* .app { --sidebar-w: 240px; --nav-ease: cubic-bezier(.4, 0, .2, 1); } */
.app {display: flex;min-height: 100vh;min-height: 100dvh;width: 100%;overflow-x: hidden;--sidebar-w: 268px;--topbar-h: 60px;--nav-ease: cubic-bezier(.4, 0, .2, 1);}
/* Main content area sits next to the sidebar and scrolls independently */
.main {flex: 1;display: flex;flex-direction: column;min-width: 0; /* Prevents flex children from pushing wider than screen */height: 100vh;height: 100dvh;overflow-y: auto;}
/* Fixed/sticky topbar height */
.topbar {height: var(--topbar-h);flex-shrink: 0;display: flex;align-items: center;padding: 0 20px;background: #fff;border-bottom: 1px solid rgba(128, 128, 128, 0.2);position: sticky;top: 0;z-index: 10;}
/* Global content container for all views */
/* Fills the space beside the sidebar (open or collapsed) and stays centred; only very wide screens hit the cap.
   Side padding grows with the screen so big monitors don't look cramped at the edges. */
main.content {flex: 1;width: 100%;max-width: none;margin: 0;padding: clamp(20px, 2.2vw, 36px) clamp(16px, 3vw, 56px) 48px;box-sizing: border-box;}
/* Ensure flex grids inside dashboards scale down on smaller screens */
.grid-2 {display: grid;grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));gap: 20px;}

/* Department header: icon + label + chevron. */
.nav-group-btn { display: flex; align-items: center; gap: 10px; white-space: nowrap; overflow: hidden; transition: gap .25s var(--nav-ease), padding .25s var(--nav-ease), background .2s ease; }
.nav-group-btn .chev { margin-left: auto; }
/* Pages inside a department get a short theme-colour line on their left, so they read as sub-items of the header */
.nav-group .nav-item { position: relative; }
.nav-group .nav-item::before { content: ""; position: absolute; left: 2px; top: 50%; width: 3px; height: 16px; margin-top: -8px; border-radius: 2px;
  background: var(--accent); opacity: .35; transition: opacity .15s, height .15s, margin-top .15s; }
.nav-group .nav-item:hover::before { opacity: .7; }
.nav-group .nav-item.active::before { opacity: 1; height: 22px; margin-top: -11px; }
.grp-icon { width: 18px; height: 18px; flex-shrink: 0; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; opacity: .8; }
.grp-label { overflow: hidden; max-width: 180px; opacity: 1; transition: max-width .25s var(--nav-ease), opacity .2s ease; }

/* Sidebar toggle: styled like a nav item, shown on every screen size (on a phone it closes the drawer). */
.sidebar-toggle {
  display: flex; align-items: center; gap: 10px;
  width: calc(100% - 16px); margin: 6px 8px 10px; padding: 8px 10px; flex-shrink: 0;
  background: none; border: 0; border-radius: 8px;
  color: inherit; font: inherit; text-align: left; cursor: pointer;
  opacity: .75; transition: opacity .2s ease, background .2s ease, gap .25s var(--nav-ease);
}
.sidebar-toggle:hover { opacity: 1; background: rgba(128, 128, 128, .12); }
.toggle-icon { flex-shrink: 0; }
.toggle-label { white-space: nowrap; overflow: hidden; max-width: 160px; opacity: 1; transition: max-width .25s var(--nav-ease), opacity .2s ease; }
.collapse-arrow { transition: transform .25s var(--nav-ease); transform-origin: 12px 12px; }

/* Column layout on every screen size: brand on top, nav scrolls in the middle, toggle pinned at the bottom. */
.sidebar { display: flex; flex-direction: column; }
.sidebar > .brand { flex-shrink: 0; }
.sidebar > nav { flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden; }
.sidebar-toggle { margin-top: auto; border-top: 1px solid rgba(128, 128, 128, .2); border-radius: 0; width: 100%; margin-left: 0; margin-right: 0; padding: 12px 18px; }

/* Neo's Notification: */
.bell-btn {position: relative;}
.notification-dot {position: absolute;top: 8px;right: 8px;width: 8px;height: 8px;background-color: #e53935;border-radius: 50%;border: 2px solid #fff;}

/* Phone drawer: dvh so the pinned button is not hidden under the browser's address bar; keep clear of the home bar. */
@media (max-width: 860px) {
  .app .sidebar { height: 100vh; height: 100dvh; }
  .app .sidebar-toggle { padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px)); }
}

@media (min-width: 861px) { /* keep equal to DESKTOP_QUERY in the script, and one above the drawer breakpoint (860px) in app.css */
  .app.collapsed { --sidebar-w: 68px; }
  .app.collapsed .sidebar-toggle { justify-content: center; gap: 0; }
  .app.collapsed .toggle-label { max-width: 0; opacity: 0; }
  .app.collapsed .collapse-arrow { transform: rotate(180deg); }

  .sidebar { width: var(--sidebar-w); overflow-x: hidden; transition: width .25s var(--nav-ease); }
  .app.collapsed .sidebar-toggle { padding-left: 0; padding-right: 0; }

  .brand-text { white-space: nowrap; overflow: hidden; max-width: 200px; opacity: 1; transition: max-width .25s var(--nav-ease), opacity .2s ease; }
  .app.collapsed .brand-text { max-width: 0; opacity: 0; }
  .app.collapsed .brand { justify-content: center; gap: 0; }

  /* Icon rail: only the Dashboard icon and one icon per department. Item lists are hidden. */
  .app.collapsed .nav-group { display: none; }
  .app.collapsed .nav-group-btn { justify-content: center; gap: 0; padding-left: 0; padding-right: 0; }
  .app.collapsed .grp-label { max-width: 0; opacity: 0; }
  .app.collapsed .nav-group-btn .chev { display: none; }
  .app.collapsed .grp-icon { opacity: .8; }
  .app.collapsed .nav-group-btn:hover .grp-icon,
  .app.collapsed .nav-group-btn.has-active .grp-icon { opacity: 1; }
  .app.collapsed .nav-group-btn.has-active { background: rgba(128, 128, 128, .15); }
}

@media (prefers-reduced-motion: reduce) {
  .sidebar, .brand-text, .nav-group-btn, .grp-label, .collapse-arrow, .toggle-label, .sidebar-toggle { transition: none; }
}
.quota-bar { display: flex; align-items: center; gap: 10px 14px; flex-wrap: wrap; padding: 10px 20px; background: var(--red-soft); color: var(--red); border-bottom: 1px solid var(--border); font-size: 13px; }
.quota-bar span { flex: 1; min-width: 200px; color: var(--text-2); }
</style>