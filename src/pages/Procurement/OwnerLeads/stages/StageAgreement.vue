<template>
  <section class="card" aria-label="Service Agreement Signed">
    <div class="card-head"><h2>{{ `${n}. Service Agreement Signed` }}</h2><span class="pill" :class="done ? (d.agreement.signed ? 'green' : 'amber') : 'grey'">{{ d.agreement.signed ? 'Signed' : d.agreement.skipped ? 'Skipped for now' : 'Not yet' }}</span></div>
    <template v-if="canEdit">
      <div class="ag-opts" role="group" aria-label="Service agreement">
        <button type="button" class="ag-opt" :class="{ sel: d.agreement.signed }" :aria-pressed="d.agreement.signed" @click="d.agreement.signed = !d.agreement.signed">
          <span class="ag-radio"></span><span><b>Signed</b><small>The owner has signed the service agreement.</small></span>
        </button>
        <button type="button" class="ag-opt amber" :class="{ sel: d.agreement.skipped && !d.agreement.signed }" :aria-pressed="d.agreement.skipped && !d.agreement.signed" @click="toggleSkip()">
          <span class="ag-radio"></span><span><b>Skip for now</b><small>Start renovation first; record the signing later.</small></span>
        </button>
      </div>
      <div class="ag-more" v-if="d.agreement.signed">
        <div class="field" style="margin:0;max-width:220px"><label for="agDate">Date signed</label><input class="input" id="agDate" type="date" v-model="d.agreement.date"></div>
        <p class="help" style="margin:8px 0 0" v-if="saved.agreement.skipped && !saved.agreement.signed">{{ `It will be recorded as signed during ${STAGES[currentKeyOf(saved)].label}.` }}</p>
      </div>
      <div class="ag-more amber" v-else-if="d.agreement.skipped">
        <div class="field" style="margin:0"><label for="agNote">Why is it skipped for now? (required)</label>
          <textarea class="input" id="agNote" v-model="d.agreement.skipNote" placeholder="e.g. Owner signs when back from overseas; renovation can start"></textarea></div>
      </div>
    </template>
    <template v-else>
      <div class="kv"><span>Signed</span><span>{{ d.agreement.signed ? `Yes, ${full(d.agreement.date)}` : 'No' }}</span></div>
      <div class="kv" v-if="d.agreement.skipped && !d.agreement.signed"><span>Skipped for now</span><span>{{ d.agreement.skipNote }}</span></div>
    </template>
    <div class="kv" v-if="d.agreement.signed && d.agreement.signedDuringStage"><span>Recorded</span><span>{{ `Signed during ${d.agreement.signedDuringStage}` }}</span></div>
    <p class="help" v-if="d.agreement.signed && d.agreement.skipNote">{{ `Earlier skipped: ${d.agreement.skipNote}` }}</p>
  </section>
</template>

<script>
// Stage: Service Agreement Signed. Edits the draft (d) in place; the page's Save bar saves it.
import { STAGES, currentKeyOf, stageDoneOf, full } from '@/lib/owner-leads.js';

export default {
  props: { d: { type: Object, required: true }, saved: { type: Object, required: true }, canEdit: Boolean, n: { type: Number, default: 1 } },
  data() { return { STAGES }; },
  computed: { done() { return stageDoneOf(this.d, 'agreement'); } },
  methods: {
    currentKeyOf, full,
    toggleSkip() {
      const a = this.d.agreement;
      if (a.signed || !a.skipped) { a.signed = false; a.skipped = true; } else { a.skipped = false; a.skipNote = ''; }
    }
  }
};
</script>
