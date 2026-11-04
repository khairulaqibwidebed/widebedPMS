<template>
  <span class="avatar" :style="style" :title="anonymous ? 'Anonymous' : name || ''" aria-hidden="true">
    <!-- Anonymous: a faceless grey person; never loads anyone's picture -->
    <svg v-if="anonymous" class="anon-face" viewBox="0 0 24 24"><circle cx="12" cy="9.2" r="3.8"/><path d="M4.6 19Q12 12 19.4 19Q12 26 4.6 19Z"/></svg>
    <img v-else-if="src" :src="src" alt="">
    <template v-else>{{ letter }}</template>
  </span>
</template>

<script>
// A person's picture, or the first letter of their name on their role colour when they have none.
// anonymous: a faceless grey person instead (anonymous complaints), and nothing is looked up.
import { avatarSrc, roleColor, initialOf } from '@/lib/avatars.js';

export default {
  props: { uid: String, name: String, role: String, size: { type: Number, default: 28 }, anonymous: { type: Boolean, default: false } },
  computed: {
    src() { return this.anonymous ? null : avatarSrc(this.uid); },
    letter() { return initialOf(this.name); },
    style() {
      return { width: this.size + 'px', height: this.size + 'px', fontSize: Math.round(this.size * 0.45) + 'px',
               background: this.anonymous ? '#E2E2E2' : this.src ? 'var(--surface)' : roleColor(this.role) };
    }
  }
};
</script>

<style scoped>
.avatar { display: inline-flex; align-items: center; justify-content: center; flex: none; border-radius: 50%;
  overflow: hidden; color: #fff; font-weight: 700; line-height: 1; user-select: none; vertical-align: middle; }
.avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
.anon-face { width: 100%; height: 100%; display: block; fill: #A6A6A6; }   /* the grey placeholder figure on light grey */
</style>
