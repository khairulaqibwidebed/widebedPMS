<template>
  <main class="content">
    <div class="page-head dash-head">
      <div>
        <h1>{{ `${roleName} dashboard` }}</h1>
        <div class="sub">Quick links to the pages you can open. Notifications are in the bell at the top.</div>
      </div>
    </div>

    <section class="card" v-for="g in groups" :key="g.label">
      <div class="card-head"><h2>{{ g.label }}</h2></div>
      <div class="dq-grid">
        <RouterLink v-for="it in g.items" :key="it.to" class="dq-tile" :to="it.to">
          <span class="dq-ic"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" v-html="icon(it)"></svg></span>
          <span class="dq-txt"><b>{{ it.label }}</b></span>
          <span class="dq-go">&rsaquo;</span>
        </RouterLink>
      </div>
    </section>
  </main>
</template>

<script>
// /Dashboard for roles made on the Roles page. Same tiles as the sidebar (pages the person can open), no figures yet.
import { useSession } from '@/stores/session.js';
import { navFor } from '@/nav.js';
import { NAV_ICONS } from '@/components/NavIcons.js';
import { ROLE_LABEL } from '@/lib/firebase.js';

export default {
  data() {
    const me = useSession();
    // Dashboard and My Account are left out: they are one click away in the sidebar.
    const groups = navFor(me).filter(g => g.label !== 'My Account')
      .map(g => ({ label: g.label || 'Pages', items: g.items.filter(it => it.to && it.to !== '/Dashboard') })).filter(g => g.items.length);
    return { groups, roleName: ROLE_LABEL[me.role] || me.role };
  },
  methods: { icon(it) { return NAV_ICONS[it.icon] || NAV_ICONS.dot; } }
};
</script>
