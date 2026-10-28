<template>
  <RouterView v-if="$route.meta.public" />
  <AppShell v-else />
  <ConfirmDialog />
</template>

<script>
import AppShell from './components/AppShell.vue';
import ConfirmDialog from './components/ConfirmDialog.vue';
export default { components: { AppShell, ConfirmDialog } };
</script>
