<template>
  <div class="pdf-page" ref="root" :style="{ width: width + 'px', height: height + 'px' }">
    <canvas ref="canvas"></canvas>
    <div class="pdf-loading" v-if="!drawn">Page {{ page }}</div>
    <!-- Placed fields, drop targets etc. sit on top of the page -->
    <div class="pdf-overlay"><slot :width="width" :height="height" /></div>
  </div>
</template>

<script setup>
// One page of a PDF drawn on a canvas. It is drawn only when it scrolls near the screen, and again after zoom.
// The parent must hold the PDF.js document in a shallowRef (PDF.js objects break inside Vue's deep reactivity).
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';

const props = defineProps({
  doc: { type: Object, default: null },
  page: { type: Number, required: true },
  width: { type: Number, required: true },
  size: { type: Object, default: null }   // { w, h } in PDF points, so the box has the right height before drawing
});
const root = ref(null), canvas = ref(null), drawn = ref(false);
const height = computed(() => (props.size ? (props.width * props.size.h) / props.size.w : props.width * 1.414));

let task = null, visible = false, timer = null, observer = null;

async function draw() {
  if (!props.doc || !canvas.value || !visible) return;
  if (task) { task.cancel(); try { await task.promise; } catch (_) {} task = null; }
  try {
    const page = await props.doc.getPage(props.page);
    const base = page.getViewport({ scale: 1 });
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const vp = page.getViewport({ scale: (props.width / base.width) * ratio });
    const c = canvas.value;
    if (!c) return;
    c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
    task = page.render({ canvasContext: c.getContext('2d'), viewport: vp });
    await task.promise;
    task = null;
    drawn.value = true;
  } catch (e) {
    if (e?.name !== 'RenderingCancelledException') console.warn('PDF page', props.page, e);
  }
}
const later = () => { clearTimeout(timer); timer = setTimeout(draw, 120); };

watch(() => [props.doc, props.width, props.page], later);
onMounted(() => {
  observer = new IntersectionObserver(entries => {
    visible = entries.some(e => e.isIntersecting);
    if (visible) later();
  }, { rootMargin: '800px 0px' });
  observer.observe(root.value);
});
onBeforeUnmount(() => { clearTimeout(timer); observer?.disconnect(); task?.cancel(); });
</script>

<style scoped>
.pdf-page { position: relative; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.18), 0 6px 20px rgba(0,0,0,.08); flex: none; }
.pdf-page canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.pdf-loading { position: absolute; inset: 0; display: grid; place-items: center; color: #9aa0aa; font-size: 13px; }
.pdf-overlay { position: absolute; inset: 0; }
</style>
