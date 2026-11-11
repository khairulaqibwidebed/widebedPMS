<template>
  <div class="an-banner" role="status" v-if="latest && !hidden">
    <span class="an-b-ico" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M15 9a3 3 0 0 1 0 6"/><path d="M18 6a7 7 0 0 1 0 12"/></svg></span>
    <span class="an-b-text"><b>{{ `${posterLabel(latest)} posted an announcement:` }}</b> {{ latest.title }}<span class="an-b-more" v-if="unread.length > 1">{{ ` +${unread.length - 1} more` }}</span></span>
    <RouterLink class="btn btn-primary an-b-btn" :to="{ path: '/HR/announcements', query: { id: latest.id } }">Read it</RouterLink>
    <button type="button" class="an-b-x" aria-label="Hide for now" title="Hide for now" @click="hidden = true">×</button>
  </div>
</template>

<script>
// Dashboard banner (5 Nov 2026): the newest announcement meant for me that I haven't opened yet.
// Live (6 Nov 2026): a new announcement shows while the dashboard is open, and the banner goes once I open it
// anywhere. Cost: the newest 10 for my role + my viewed list once, then only changes.
// × hides it until the dashboard is left; it comes back next visit until the announcement is opened.
// Uses the person's real role (not a Director's "View as").
import { useSession } from '@/stores/session.js';
import { watchFor, watchMyReads, isUnread, posterLabel } from '@/pages/HR/announcements.js';
import { liveMixin } from '@/lib/use-live.js';

export default {
  mixins: [liveMixin],
  data: () => ({ items: null, reads: null, hidden: false }),
  computed: {
    unread() { const me = useSession(); return this.items && this.reads ? this.items.filter(a => isUnread(a, me, this.reads)) : []; },
    latest() { return this.unread[0] || null; }
  },
  mounted() {
    const me = useSession();
    if (!me.user || !me.role) return;
    const warn = e => console.warn('Announcements banner not loaded:', e);
    this.liveUse('items', watchFor({ role: me.role }, rows => { this.items = rows; }, warn, 10));
    this.liveUse('reads', watchMyReads(me.user.uid, r => { this.reads = r; }, warn));
  },
  methods: { posterLabel }
};
</script>

<style scoped>
.an-banner { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin: clamp(20px, 2.2vw, 36px) clamp(16px, 3vw, 56px) 0;
  padding: 12px 14px; border-radius: 12px; border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--border));
  background: color-mix(in srgb, var(--accent) 8%, var(--surface)); box-shadow: 0 4px 14px rgba(0,0,0,.05); }
.an-b-ico { flex: none; width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; background: var(--accent); color: #fff; }
.an-b-text { flex: 1 1 260px; min-width: 0; font-size: 14px; overflow-wrap: anywhere; }
.an-b-more { color: var(--muted); font-weight: 600; }
.an-b-btn { flex: none; text-decoration: none; }
.an-b-x { flex: none; width: 32px; height: 32px; border: 0; border-radius: 8px; background: none; color: var(--muted); font-size: 22px; line-height: 1; cursor: pointer; }
.an-b-x:hover { background: var(--hover); color: var(--text); }
</style>
