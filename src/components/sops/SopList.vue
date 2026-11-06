<template>
  <section class="card">
    <div class="sl-tools">
      <input class="input sl-search" type="search" v-model="q" placeholder="Search SOPs" aria-label="Search SOPs">
      <button class="btn btn-primary" type="button" v-if="canEdit" @click="$emit('new')">+ New SOP</button>
    </div>
    <div class="sl-list">
      <RouterLink v-for="s in shown" :key="s.key" class="sl-row" :to="`/HR/sops/${s.key}`">
        <span class="sl-ic" aria-hidden="true"><SopIcon :name="s.icon" /></span>
        <span class="sl-txt"><b>{{ s.title }}</b><small>{{ s.sub || 'No short description yet' }}</small></span>
        <span class="sl-meta">{{ s.editedOn ? `Edited ${s.editedOn}` : 'Starter text' }}<small>{{ `${s.steps.length} step${s.steps.length === 1 ? '' : 's'} · ${s.docs.length} file${s.docs.length === 1 ? '' : 's'}` }}</small></span>
        <span class="sl-go" aria-hidden="true">›</span>
      </RouterLink>
      <div class="empty" v-show="!loading && !shown.length">{{ q.trim() ? 'No SOPs match.' : 'No SOPs yet.' }}</div>
    </div>
  </section>
</template>

<script>
// The list on HR > SOPs: search by title or short line, one row per SOP, "+ New SOP" for HR and Directors.
import SopIcon from './SopIcon.vue';

export default {
  components: { SopIcon },
  props: { sops: { type: Array, required: true }, loading: Boolean, canEdit: Boolean },
  emits: ['new'],
  data() { return { q: '' }; },
  computed: {
    shown() {
      const q = this.q.trim().toLowerCase();
      return q ? this.sops.filter(s => `${s.title} ${s.sub}`.toLowerCase().includes(q)) : this.sops;
    }
  }
};
</script>

<style scoped>
.sl-tools { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }
.sl-search { flex: 1 1 220px; max-width: 360px; height: 40px; }
.sl-tools .btn { margin-left: auto; }
.sl-list { display: grid; gap: 8px; }
.sl-row { display: grid; grid-template-columns: 40px minmax(0, 1fr) auto 16px; gap: 14px; align-items: center; padding: 12px 14px;
  border: 1px solid var(--border); border-radius: 10px; background: var(--surface); color: var(--text); text-decoration: none;
  transition: border-color .15s, background .15s; }
.sl-row:hover { border-color: var(--accent); background: var(--accent-soft); }
.sl-ic { width: 40px; height: 40px; border-radius: 10px; display: grid; place-items: center; background: var(--accent-soft); color: var(--accent); font-size: 13px; font-weight: 700; }
.sl-row:hover .sl-ic { background: var(--surface); }
.sl-ic :deep(.sop-icon) { width: 20px; height: 20px; }
.sl-txt { min-width: 0; } .sl-txt b { display: block; font-size: 14px; } .sl-txt small { display: block; color: var(--muted); font-size: 12.5px; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sl-meta { text-align: right; font-size: 12.5px; color: var(--text-2); white-space: nowrap; } .sl-meta small { display: block; color: var(--muted); font-size: 11.5px; margin-top: 2px; }
.sl-go { color: var(--muted); font-size: 18px; }
@media (max-width: 600px) { .sl-row { grid-template-columns: 36px minmax(0, 1fr) 12px; } .sl-meta { display: none; } .sl-ic { width: 36px; height: 36px; } }
</style>
