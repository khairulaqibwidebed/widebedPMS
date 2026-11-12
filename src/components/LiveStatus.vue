<template>
  <span class="ls" :class="status" :title="title"><span class="ls-dot"></span>{{ text }}</span>
</template>

<script>
// Small "Live" / "Offline, showing saved data" / "Updated 10:42" line for any live page (lib/use-live.js).
//   <LiveStatus :status="liveStatus.unit?.status" :last-updated="liveStatus.unit?.lastUpdated" />
//   time: show "Updated hh:mm" instead of "Live" (good for polled data such as the TMS)
export default {
  props: { status: { type: String, default: 'connecting' }, lastUpdated: { type: Date, default: null }, time: { type: Boolean, default: false } },
  computed: {
    at() { return this.lastUpdated ? this.lastUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''; },
    text() {
      if (this.status === 'live') return this.time && this.at ? `Updated ${this.at}` : 'Live';
      if (this.status === 'offline') return 'Offline, showing saved data';
      if (this.status === 'error') return this.at ? `Not updating (last ${this.at})` : 'Not updating';
      return 'Connecting…';
    },
    title() { return this.at ? `Last updated ${this.at}` : ''; }
  }
};
</script>

<style scoped>
.ls { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--muted); white-space: nowrap; }
.ls-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); }
.ls.live .ls-dot { background: var(--green); }
.ls.offline .ls-dot { background: var(--amber); }
.ls.error .ls-dot { background: var(--red); }
</style>
