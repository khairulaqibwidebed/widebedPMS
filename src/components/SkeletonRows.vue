<template>
  <!-- Placeholder rows while a list loads. Registered globally in main.js.
         <SkeletonRows v-if="loading" />                 4 rows with a round avatar
         <SkeletonRows v-if="loading" :rows="6" :avatar="false" :cols="3" />
         In a table: <SkeletonRows v-if="loading" table :cols="5" />  (renders <tr> rows; put it inside <tbody>) -->
  <template v-if="table">
    <tr v-for="r in rows" :key="r" class="sk-tr" aria-hidden="true">
      <td v-for="c in cols" :key="c"><span class="sk" :style="{ height: '10px', width: widths[(r + c) % widths.length] }"></span></td>
    </tr>
  </template>
  <div v-else class="sk-rows" role="status" aria-label="Loading">
    <div v-for="r in rows" :key="r" class="sk-row">
      <span v-if="avatar" class="sk" style="width: 28px; height: 28px; border-radius: 50%"></span>
      <span class="sk" :style="{ flex: 1, height: '10px', maxWidth: widths[r % widths.length] }"></span>
      <span v-for="c in cols - 1" :key="c" class="sk" style="width: 56px; height: 10px"></span>
    </div>
  </div>
</template>

<script>
export default {
  props: { rows: { type: Number, default: 4 }, cols: { type: Number, default: 2 }, avatar: { type: Boolean, default: true }, table: { type: Boolean, default: false } },
  data() { return { widths: ['70%', '55%', '85%', '62%', '78%'] }; }
};
</script>

<style scoped>
.sk-rows { display: grid; gap: 4px; padding: 6px 0; }
.sk-row { display: flex; align-items: center; gap: 12px; min-height: 40px; padding: 0 4px; border-bottom: 1px solid var(--line); }
.sk-row:last-child { border-bottom: 0; }
.sk-tr td { padding-top: 14px; padding-bottom: 14px; }
</style>
