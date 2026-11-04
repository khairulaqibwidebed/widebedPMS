<template>
  <section class="card">
    <h2 class="t">Audit log</h2>
    <p class="card-intro">Every change to this property: who, when, old and new value, start month and reason. Entries can't be edited or deleted.</p>
    <Paged :items="audits" keep-page @page="$emit('audit-page', $event)" v-slot="{ pageRows }">
    <div class="table-wrap">
      <table class="table audit-tbl hover-rows">
        <colgroup><col style="width:170px"><col style="width:130px"><col style="width:150px"><col><col style="width:100px"><col style="width:22%"></colgroup>
        <thead><tr><th>When</th><th>Who</th><th>What</th><th>Change</th><th>Month</th><th>Reason</th></tr></thead>
        <tbody>
          <template v-for="a in pageRows" :key="a.id">
            <tr><td class="nw">{{ stamp(a.at) }}</td><td class="nw">{{ a.userName || '' }}</td><td class="nw">{{ actionText(a) }}</td>
              <td><div class="chg" v-for="(c, i) in changeList(a)" :key="i">{{ c }}</div></td><td>{{ a.month ? shortName(a.month) : '—' }}</td><td>{{ a.reason || '—' }}</td></tr>
          </template>
          <tr v-show="!audits.length"><td colspan="6" class="muted">Nothing recorded yet.</td></tr>
        </tbody>
      </table>
    </div>
    </Paged>
    <div class="more-row" v-show="auditMore && audits.length <= 10"><button type="button" class="btn" @click="$emit('more-audits')" :disabled="auditBusy">Load 30 more changes</button></div>
  </section>
</template>

<script>
// A property's Audit log tab. The page loads the entries (30 at a time) and passes them in.
import { stamp } from '@/lib/format.js';
import { shortName, changeList, actionText } from '@/lib/portfolio-data.js';

export default {
  props: {
    audits: { type: Array, required: true },
    auditMore: { type: Boolean, default: false },
    auditBusy: { type: Boolean, default: false }
  },
  emits: ['audit-page', 'more-audits'],
  methods: { stamp, shortName, changeList, actionText }
};
</script>
