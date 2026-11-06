<template>
  <div class="sig-pad">
    <canvas ref="c" :width="w" :height="h" @pointerdown="down" @pointermove="move" @pointerup="up" @pointerleave="up" @pointercancel="up" aria-label="Sign here"></canvas>
    <div class="sig-foot"><span class="help">{{ drawn ? 'Signed. Clear to try again.' : 'Sign in the box with your mouse or finger.' }}</span><button type="button" class="btn btn-sm" @click="clear()" :disabled="!drawn">Clear</button></div>
  </div>
</template>

<script>
// A box to sign in (5 Nov 2026, salary advance forms). image() returns { data: JPEG data URL on white, w, h, size } or null.
export default {
  emits: ['change'],
  data() { return { w: 560, h: 180, drawing: false, drawn: false, last: null }; },
  mounted() { this.clear(); },
  methods: {
    ctx() { return this.$refs.c.getContext('2d'); },
    pos(e) { const r = this.$refs.c.getBoundingClientRect(); return [(e.clientX - r.left) * this.w / r.width, (e.clientY - r.top) * this.h / r.height]; },
    down(e) { e.preventDefault(); this.$refs.c.setPointerCapture?.(e.pointerId); this.drawing = true; this.last = this.pos(e); this.dot(this.last); },
    move(e) {
      if (!this.drawing) return;
      const p = this.pos(e), x = this.ctx();
      x.beginPath(); x.moveTo(...this.last); x.lineTo(...p); x.stroke();
      this.last = p;
      if (!this.drawn) { this.drawn = true; this.$emit('change', true); }
    },
    dot(p) { const x = this.ctx(); x.beginPath(); x.arc(p[0], p[1], 1.2, 0, Math.PI * 2); x.fill(); },
    up() { this.drawing = false; },
    clear() {
      const x = this.ctx();
      x.fillStyle = '#fff'; x.fillRect(0, 0, this.w, this.h);
      x.strokeStyle = '#111'; x.fillStyle = '#111'; x.lineWidth = 2.6; x.lineCap = 'round'; x.lineJoin = 'round';
      if (this.drawn) this.$emit('change', false);
      this.drawn = false;
    },
    image() {
      if (!this.drawn) return null;
      const data = this.$refs.c.toDataURL('image/jpeg', 0.85);
      return { data, w: this.w, h: this.h, size: Math.ceil((data.length - data.indexOf(',') - 1) * 3 / 4) };
    }
  }
};
</script>

<style scoped>
.sig-pad { display: grid; gap: 6px; max-width: 560px; }
.sig-pad canvas { width: 100%; height: auto; aspect-ratio: 560 / 180; border: 1px dashed var(--border); border-radius: 10px; background: #fff; touch-action: none; cursor: crosshair; }
.sig-foot { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.btn-sm { height: 30px; padding: 0 10px; font-size: 12px; }
</style>
