<template>
  <AnnouncementBanner />
  <Dashboard v-if="view === 'director' || view === 'finance'" />
  <RoleDashboard v-else-if="builtIn" :role="view" />
  <CustomDashboard v-else />
</template>

<script>
// /Dashboard: each role sees its own dashboard. Director and Finance keep Dashboard.vue; the other roles get
// RoleDashboard.vue. A Director can "View as" any role (?as=role); everyone else always sees their own.
import Dashboard from './Dashboard.vue';
import RoleDashboard, { VIEW_AS } from './RoleDashboard.vue';
import CustomDashboard from './CustomDashboard.vue';
import AnnouncementBanner from '@/components/AnnouncementBanner.vue';   // unread HR announcement, above every dashboard (5 Nov 2026)
import { BUILTIN_ROLES } from '@/lib/firebase.js';
import { useSession } from '@/stores/session.js';

export default {
  components: { Dashboard, RoleDashboard, CustomDashboard, AnnouncementBanner },
  data() {
    const role = useSession().role, as = this.$route.query.as;
    const view = role === 'director' && VIEW_AS.includes(as) ? as : role;
    return { view, builtIn: BUILTIN_ROLES.includes(view) };
  }
};
</script>
