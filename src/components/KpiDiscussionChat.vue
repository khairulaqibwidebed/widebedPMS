<template>
  <LiveChat class="kchat" :source="src" :title="title" :subtitle="subtitle" :head-avatar="otherName" badge="Discussion open"
    :placeholder="placeholder || `Write a message to ${otherName}…`" :empty="missing ? 'The chat for this KPI hasn\'t been started yet.' : 'No messages yet.'"
    :can-reply="!missing" bare list-class="kchat-list" @extra="x => missing = !!x?.missing" />
</template>

<script setup>
// KPI discussion chat — shown only while a KPI is in discussion (Director sent it back or reopened it).
// Reads/writes the existing kpiConversations/{assignmentId} doc that sendBackForDiscussion() and
// reopenAndSendBack() in lib/performance/kpi.js already create.
// 6 Nov 2026 (Khairul): now a thin wrapper around the shared LiveChat (kpiSource in lib/chat-sources.js); same props as before.
import { ref, computed } from 'vue';
import LiveChat from '@/components/LiveChat.vue';
import { kpiSource } from '@/lib/chat-sources.js';

const props = defineProps({
  assignmentId: { type: String, required: true },
  title: { type: String, default: 'Director Discussion' },
  subtitle: { type: String, default: '' },
  otherName: { type: String, default: 'Director' },
  placeholder: { type: String, default: '' }
});

const missing = ref(false);   // no conversation doc yet
const src = computed(() => kpiSource(props.assignmentId, props.otherName));
</script>

<style scoped>
/* Card heights as before; KPI.vue's review modal lets the list fill the column (its rules win over these) */
:where(.kchat) :deep(.kchat-list) { min-height: 220px; max-height: 380px; }
</style>
