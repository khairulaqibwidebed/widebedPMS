<template>
  <section class="card" v-if="log.length">
    <div class="card-head"><h2>Change log</h2></div>
    <div class="rows"><div class="row" v-for="(l, i) in log.slice(0, 6)" :key="i"><span>{{ l.what }}</span><span class="r">{{ l.when }}</span></div></div>
  </section>
</template>

<script>
// The last few changes to one SOP (the full trail is in Settings > Audit Log).
export default { props: { log: { type: Array, required: true } } };
</script>
