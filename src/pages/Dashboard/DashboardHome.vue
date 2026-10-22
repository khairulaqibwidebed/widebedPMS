<template>
  <Dashboard v-if="view === 'director' || view === 'finance'" />
  <RoleDashboard v-else :role="view" />
</template>

<script>
// /Dashboard: each role sees its own dashboard. Director and Finance keep Dashboard.vue; the other roles get
// RoleDashboard.vue. A Director can "View as" any role (?as=role); everyone else always sees their own.
import Dashboard from './Dashboard.vue';
import RoleDashboard, { VIEW_AS } from './RoleDashboard.vue';
import { useSession } from '@/stores/session.js';

export default {
  components: { Dashboard, RoleDashboard },
  data() {
    const role = useSession().role, as = this.$route.query.as;
    return { view: role === 'director' && VIEW_AS.includes(as) ? as : role };
  }
};
</script>
