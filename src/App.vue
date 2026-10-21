<template>
  <RouterView v-if="$route.meta.public" />
  <AppShell v-else />
</template>

<script>
import AppShell from './components/AppShell.vue';
export default { components: { AppShell } };
</script>
