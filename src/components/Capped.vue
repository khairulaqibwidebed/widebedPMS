<template>
  <slot :capRows="capRows" />
  <div class="cap-more cap-fixed" v-if="fixed && list.length > size">{{ `… ${list.length - size} more` }}</div>
  <button class="cap-more" type="button" v-else-if="list.length > size" @click="open = !open" :aria-expanded="String(open)">
    {{ open ? 'Show less' : `… ${list.length - size} more` }}
  </button>
</template>

<script>
// Dashboard panels: show the first 5 rows, then "… N more" to open the rest in place.
//   <Capped :items="list" v-slot="{ capRows }"> ... v-for="x in capRows" ... </Capped>
export default {
  props: { items: { type: Array, default: () => [] }, size: { type: Number, default: 5 }, fixed: { type: Boolean, default: false } },
  data() { return { open: false }; },
  computed: {
    list() { return this.items || []; },
    capRows() { return this.open && !this.fixed ? this.list : this.list.slice(0, this.size); }
  }
};
</script>
