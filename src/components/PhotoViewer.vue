<template>
  <div class="pv-back" v-if="at !== null && images[at]" @click.self="close" v-esc="close" role="dialog" aria-label="Photo">
    <img class="pv-big" :src="safe(images[at].data)" :alt="'Photo ' + (at + 1)">
    <button type="button" class="pv-close" aria-label="Close" @click="close">×</button>
    <template v-if="images.length > 1">
      <button type="button" class="pv-nav prev" aria-label="Previous photo" @click="go(-1)">‹</button>
      <button type="button" class="pv-nav next" aria-label="Next photo" @click="go(1)">›</button>
      <span class="pv-count">{{ `${at + 1} / ${images.length}` }}</span>
    </template>
  </div>
</template>

<script>
// Full-size photo with previous / next. Used by PhotoThumbs (saved photos) and PhotoPicker (photos about to be sent).
//   <PhotoViewer :images="list" v-model="openIndex" />   (openIndex null = closed)
export default {
  props: { images: { type: Array, default: () => [] }, modelValue: { type: Number, default: null } },
  emits: ['update:modelValue'],
  computed: { at() { return this.modelValue; } },
  methods: {
    safe(d) { return typeof d === 'string' && d.startsWith('data:image/') ? d : ''; },   // only real image data is shown
    close() { this.$emit('update:modelValue', null); },
    go(step) { this.$emit('update:modelValue', (this.at + step + this.images.length) % this.images.length); }
  }
};
</script>

<style scoped>
.pv-back { position: fixed; inset: 0; z-index: 80; background: rgba(10, 12, 16, .88); display: flex; align-items: center; justify-content: center; padding: 48px 56px; }
.pv-big { max-width: 100%; max-height: 100%; border-radius: 6px; box-shadow: 0 8px 40px rgba(0, 0, 0, .5); }
.pv-close { position: absolute; top: 12px; right: 14px; width: 40px; height: 40px; border: 0; border-radius: 50%; background: rgba(255, 255, 255, .15); color: #fff; font-size: 24px; cursor: pointer; }
.pv-nav { position: absolute; top: 50%; transform: translateY(-50%); width: 44px; height: 44px; border: 0; border-radius: 50%; background: rgba(255, 255, 255, .15); color: #fff; font-size: 28px; cursor: pointer; }
.pv-nav.prev { left: 10px; } .pv-nav.next { right: 10px; }
.pv-count { position: absolute; bottom: 14px; left: 50%; transform: translateX(-50%); color: #fff; font-size: 13px; }
@media (max-width: 600px) { .pv-back { padding: 56px 8px; } }
</style>
