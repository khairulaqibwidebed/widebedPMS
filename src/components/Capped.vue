<template>
  <slot :capRows="capRows" />
  <button class="cap-more" type="button" v-if="list.length > size" @click="open = !open" :aria-expanded="String(open)">
    {{ open ? 'Show less' : `… ${list.length - size} more` }}
  </button>
</template>

<script>
// Dashboard panels: show the first 5 rows, then "… N more" to open the rest in place.
//   <Capped :items="list" v-slot="{ capRows }"> ... v-for="x in capRows" ... </Capped>
export default {
  props: { items: { type: Array, default: () => [] }, size: { type: Number, default: 5 } },
  data() { return { open: false }; },
  computed: {
    list() { return this.items || []; },
    capRows() { return this.open ? this.list : this.list.slice(0, this.size); }
  }
};
</script>
