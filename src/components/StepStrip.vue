<template>
  <div class="step-strip">
    <!-- Phones: one line "Step 2 of 6: Stay" that opens the list of steps -->
    <button type="button" class="ss-phone" :aria-expanded="String(open)" @click="open = !open">
      <span class="ss-dot" :class="states[modelValue]?.state"></span>
      <span class="ss-phone-text"><b>{{ `Step ${modelValue + 1} of ${steps.length}: ${steps[modelValue]?.label || ''}` }}</b><small>{{ noteOf(modelValue) }}</small></span>
      <svg class="ss-chev" :class="{ up: open }" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
    </button>
    <nav class="ss-cards" :class="{ open }" :aria-label="label" :style="{ '--n': steps.length }">
      <button v-for="(s, i) in steps" :key="s.key || i" type="button" class="ss-card" :class="[states[i].state, { on: modelValue === i }]"
        :aria-current="modelValue === i ? 'step' : null" @click="pick(i)">
        <span class="ss-dot" :class="states[i].state"></span>
        <span class="ss-text"><b>{{ `${i + 1}. ${s.label}` }}</b><small>{{ noteOf(i) }}</small></span>
      </button>
    </nav>
    <!-- Room for a second strip under a step later (e.g. rooms on a Property Inspection) -->
    <slot name="sub"></slot>
  </div>
</template>

<script>
// One strip of step cards, used by the forms on Operations > Booking forms (and other forms later).
// The form gives the steps (see lib/steps.js for the shape) and v-model = the index of the step shown.
//   <StepStrip v-model="step" :steps="steps" />
// Any card can be tapped; there is no forced order.
import { stepState, allDone, stillMissing } from '@/lib/steps.js';

export default {
  props: { steps: { type: Array, required: true }, modelValue: { type: Number, default: 0 }, label: { type: String, default: 'Steps' } },
  emits: ['update:modelValue'],
  data() { return { open: false }; },
  computed: {
    states() {
      return this.steps.map(s => {
        if (!s.review) return stepState(s);
        const left = stillMissing(this.steps).reduce((n, x) => n + x.items.length, 0);
        return allDone(this.steps) ? { state: 'ready', note: 'Ready to save' } : { state: 'todo', note: `${left} to finish` };
      });
    }
  },
  methods: {
    noteOf(i) { return this.states[i]?.note || ''; },
    pick(i) { this.open = false; this.$emit('update:modelValue', i); }
  },
  watch: {
    // Phones: keep the current card in view (tapped, or moved to with Back / Next)
    modelValue(i) {
      const nav = this.$el.querySelector('.ss-cards'), card = nav?.querySelectorAll('.ss-card')[i];
      if (card && nav.scrollWidth > nav.clientWidth) nav.scrollTo({ left: card.offsetLeft - nav.offsetLeft - 8, behavior: 'smooth' });
    }
  }
};
</script>

<style scoped>
/* Same look as the stage strip on Procurement > New Owner Listings */
.ss-cards { display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); gap: 8px; }
.ss-card { display: flex; gap: 8px; align-items: flex-start; text-align: left; padding: 10px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface);
  color: var(--muted); font: inherit; font-size: 12px; min-width: 0; cursor: pointer; }
.ss-card:hover { border-color: var(--accent); }
.ss-card.on { border-color: var(--accent); background: var(--accent-soft); }
.ss-text { min-width: 0; }
.ss-text b, .ss-phone-text b { display: block; font-size: 13px; color: var(--text); font-weight: 600; }
.ss-text small, .ss-phone-text small { display: block; font-size: 11px; }
.ss-card.skip { opacity: .55; }
.ss-card.bad small, .ss-phone .bad + .ss-phone-text small { color: var(--red); font-weight: 600; }
.ss-card.bad { border-color: var(--red); }
.ss-card.bad.on { background: var(--red-soft); }
.ss-dot { width: 20px; height: 20px; border-radius: 50%; border: 2px solid var(--border); flex-shrink: 0; display: grid; place-items: center; }
.ss-dot.done, .ss-dot.ready { background: var(--green); border-color: var(--green); }
.ss-dot.done::after, .ss-dot.ready::after { content: '✓'; color: #fff; font-size: 11px; font-weight: 700; }
.ss-dot.part { background: var(--amber); border-color: var(--amber); }
.ss-dot.part::after { content: '–'; color: #fff; font-size: 13px; font-weight: 700; line-height: 1; }
.ss-dot.bad { background: var(--red); border-color: var(--red); }
.ss-dot.bad::after { content: '!'; color: #fff; font-size: 12px; font-weight: 700; }
.ss-dot.skip { border-style: dashed; }
.ss-phone { display: none; }
.ss-chev { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; transition: transform .15s; margin-left: auto; flex: none; }
.ss-chev.up { transform: rotate(180deg); }
@media (max-width: 900px) { .ss-cards { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
/* Phones: the strip stays one row and scrolls sideways (the folded "Step 2 of 6" line is kept below, switched off) */
@media (max-width: 600px) {
  .ss-cards { display: flex; overflow-x: auto; scroll-snap-type: x proximity; -webkit-overflow-scrolling: touch; padding-bottom: 4px; scrollbar-width: thin; }
  .ss-card { flex: 0 0 150px; scroll-snap-align: start; }
}
</style>
