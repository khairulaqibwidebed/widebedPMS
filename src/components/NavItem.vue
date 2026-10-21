<template>
  <RouterLink v-if="item.to" class="nav-item" :class="{ active: item.label === active }" :to="item.to">{{ item.label }}</RouterLink>
  <a v-else class="nav-item" href="#" @click.prevent="$emit('soon', item.label)">{{ item.label }}</a>
</template>

<script>
export default { props: { item: Object, active: String }, emits: ['soon'] };
</script>
