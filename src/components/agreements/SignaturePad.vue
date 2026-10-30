<template>
  <div class="sig" :class="{ disabled }">
    <img v-if="modelValue" :src="modelValue" alt="Signature">
    <canvas v-else ref="canvas" width="600" height="200" :aria-label="label + ': sign with your finger or mouse'"
      @pointerdown="start" @pointermove="move" @pointerup="end" @pointercancel="end" @pointerleave="end"></canvas>
    <div class="sig-bar">
      <span class="help">{{ modelValue ? 'Signed' : 'Sign inside the box' }}</span>
      <button type="button" class="btn btn-sm" :disabled="disabled || (!modelValue && !inked)" @click="clear">{{ modelValue ? 'Clear and sign again' : 'Clear' }}</button>
    </div>
  </div>
</template>

<script setup>
// A box to sign in with a finger, pen or mouse. Saves a small PNG (data URL) when the pen lifts.
import { ref } from 'vue';

const props = defineProps({ modelValue: { type: String, default: '' }, label: { type: String, default: 'Signature' }, disabled: Boolean });
const emit = defineEmits(['update:modelValue']);
const canvas = ref(null), inked = ref(false);
let drawing = false, last = null;

function point(e) {
  const r = canvas.value.getBoundingClientRect();
  return { x: ((e.clientX - r.left) * canvas.value.width) / r.width, y: ((e.clientY - r.top) * canvas.value.height) / r.height };
}
function start(e) {
  if (props.disabled) return;
  drawing = true; last = point(e);
  canvas.value.setPointerCapture?.(e.pointerId);
  const ctx = canvas.value.getContext('2d');
  ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111827';
  ctx.beginPath(); ctx.arc(last.x, last.y, 1.4, 0, Math.PI * 2); ctx.fill();
  inked.value = true;
}
function move(e) {
  if (!drawing) return;
  const p = point(e), ctx = canvas.value.getContext('2d');
  ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
  last = p;
}
function end() {
  if (!drawing) return;
  drawing = false;
  if (inked.value) emit('update:modelValue', canvas.value.toDataURL('image/png'));
}
function clear() {
  inked.value = false;
  if (props.modelValue) emit('update:modelValue', '');
  else canvas.value.getContext('2d').clearRect(0, 0, canvas.value.width, canvas.value.height);
}
</script>

<style scoped>
.sig { display: grid; gap: 6px; }
.sig canvas, .sig img { width: 100%; max-width: 420px; aspect-ratio: 3 / 1; border: 1.5px dashed var(--border); border-radius: 10px; background: #fff; touch-action: none; cursor: crosshair; }
.sig img { object-fit: contain; border-style: solid; cursor: default; }
.sig.disabled canvas { cursor: not-allowed; opacity: .6; }
.sig-bar { display: flex; align-items: center; justify-content: space-between; gap: 8px; max-width: 420px; }
</style>
