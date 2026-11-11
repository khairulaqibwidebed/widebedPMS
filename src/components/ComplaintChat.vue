<template>
  <LiveChat :source="src" :title="title" :hint="hint" :placeholder="placeholder" :empty="empty" :can-reply="canReply" :closed-text="closedText"
    :anonymous-other="anonymousOther" photos @extra="p => $emit('complaint-photos', p)" />
</template>

<script>
// The conversation panel of a complaint. Since 6 Nov 2026 a thin wrapper around the shared LiveChat (complaintSource in
// lib/chat-sources.js); props and the complaint-photos event are the same as before. It passes the photos sent WITH the
// complaint up (@complaint-photos) for the details column.
//   <ComplaintChat :complaint="c" side="director" :labels="{ hr: 'HR', director: 'Director' }" title="Conversation with HR" @complaint-photos="p => pics = p" />
import LiveChat from '@/components/LiveChat.vue';
import { complaintSource } from '@/lib/chat-sources.js';

export default {
  components: { LiveChat },
  props: {
    complaint: { type: Object, required: true },
    side: { type: String, required: true },                    // who "you" are in thread.by: 'hr', 'sender' or 'director'
    labels: { type: Object, default: () => ({}) },              // names for each side, e.g. { hr: 'HR', director: 'Director' }
    title: { type: String, default: 'Conversation' }, hint: { type: String, default: '' },
    placeholder: { type: String, default: 'Type a message' }, empty: { type: String, default: 'No replies yet.' },
    canReply: { type: Boolean, default: true }, closedText: { type: String, default: '' },
    anonymousOther: { type: Boolean, default: false }           // anonymous staff complaint: the sender's avatar is faceless
  },
  emits: ['complaint-photos'],
  computed: { src() { return complaintSource(this.complaint, this.side, this.labels); } }
};
</script>
