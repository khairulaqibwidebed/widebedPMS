<template>
  <span class="avatar" :style="style" :title="name || ''" aria-hidden="true">
    <img v-if="src" :src="src" alt="">
    <template v-else>{{ letter }}</template>
  </span>
</template>

<script>
// A person's picture, or the first letter of their name on their role colour when they have none.
import { avatarSrc, roleColor, initialOf } from '@/lib/avatars.js';

export default {
  props: { uid: String, name: String, role: String, size: { type: Number, default: 28 } },
  computed: {
    src() { return avatarSrc(this.uid); },
    letter() { return initialOf(this.name); },
    style() {
      return { width: this.size + 'px', height: this.size + 'px', fontSize: Math.round(this.size * 0.45) + 'px',
               background: this.src ? 'var(--surface)' : roleColor(this.role) };
    }
  }
};
</script>

<style scoped>
.avatar { display: inline-flex; align-items: center; justify-content: center; flex: none; border-radius: 50%;
  overflow: hidden; color: #fff; font-weight: 700; line-height: 1; user-select: none; vertical-align: middle; }
.avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
</style>
