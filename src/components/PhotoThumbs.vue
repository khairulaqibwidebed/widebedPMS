<template>
  <div class="pt" v-if="images.length">
    <button type="button" class="pt-item" v-for="(p, i) in images" :key="p.id || i" :aria-label="'Open photo ' + (i + 1)" @click="at = i">
      <img :src="safe(p.data)" alt="" loading="lazy">
    </button>
    <PhotoViewer :images="images" v-model="at" />
  </div>
</template>

<script>
// Photos shown directly as thumbnails; click one for full size. images = [{ id, data: 'data:image/...' }]
//   <PhotoThumbs :images="list" />
import PhotoViewer from '@/components/PhotoViewer.vue';

export default {
  components: { PhotoViewer },
  props: { images: { type: Array, default: () => [] } },
  data() { return { at: null }; },
  methods: { safe(d) { return typeof d === 'string' && d.startsWith('data:image/') ? d : ''; } }   // only real image data is shown
};
</script>

<style scoped>
.pt { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.pt-item { width: 96px; height: 96px; padding: 0; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; background: var(--hover); cursor: zoom-in; }
.pt-item:hover { border-color: var(--accent); }
.pt-item img { width: 100%; height: 100%; object-fit: cover; display: block; }
@media (max-width: 600px) { .pt-item { width: 80px; height: 80px; } }
</style>
