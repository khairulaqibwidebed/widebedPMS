<template>
  <PropertyPage v-if="one" />
  <PropertiesPage v-else />
</template>

<script>
// /Portfolio/properties: one property (?property=<id>) or the list. AppShell's <RouterView :key="$route.fullPath">
// opens this again on every address change, so the right page is always mounted fresh.
import PropertiesPage from './PropertiesPage.vue';
import PropertyPage from './PropertyPage.vue';

export default {
  components: { PropertiesPage, PropertyPage },
  computed: {
    one() { const p = this.$route.query.property; return !!p && p !== 'all'; }
  }
};
</script>
