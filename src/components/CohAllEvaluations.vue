<template>
  <div class="card">
    <div class="ae-head">
      <div>
        <h3 style="margin:0">All evaluations</h3>
        <p class="sub" style="margin:4px 0 0">Who rated who and when, to remove evaluations that spoil the tally. Marks are not shown here. Delete removes the evaluation and its marks for good.</p>
      </div>
    </div>
    <div class="ae-filters">
      <div class="field"><label>Quarter</label>
        <OptionPicker v-model="quarterId" :options="quarters.map(q => ({ value: q.id, label: q.name || q.id }))" label="Quarter" @update:modelValue="load" /></div>
      <div class="field grow"><label>Search</label><input class="input" v-model="q" :placeholder="IN_HINT[searchIn]"></div>
      <!-- whether the name searched is the one who rated (Evaluator) or the one rated (Employee) -->
      <div class="field"><label>Name is</label><OptionPicker v-model="searchIn" :options="SEARCH_IN" label="Name is" /></div>
    </div>
    <p class="help">{{ loading ? 'Loading…' : error || `${shown.length} of ${rows.length} evaluation${rows.length === 1 ? '' : 's'}` }}</p>
    <Paged :items="shown" :size="25" v-slot="{ pageRows }">
      <div class="table-wrap">
        <table class="table ae-table">
          <thead>
            <tr>
              <th v-for="c in SORTS" :key="c.key" :aria-sort="sortKey === c.key ? (desc ? 'descending' : 'ascending') : 'none'">
                <button type="button" class="sort-btn" :class="{ on: sortKey === c.key }" @click="sortBy(c.key)">{{ c.label }}<span class="arrow">{{ sortKey === c.key ? (desc ? '▼' : '▲') : '↕' }}</span></button></th>
              <th>Submitted</th><th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in pageRows" :key="e.id">
              <td>{{ e.evaluatorNameSnapshot || e.evaluatorId }}</td>
              <td>{{ e.evaluateeNameSnapshot || e.evaluateeId }}</td>
              <td class="nw">{{ when(e.submittedAt) }}</td>
              <td class="num"><button type="button" class="btn del-btn" :disabled="busy === e.id" @click="remove(e)">{{ busy === e.id ? 'Deleting…' : 'Delete' }}</button></td>
            </tr>
            <tr v-if="!loading && !pageRows.length"><td colspan="4" class="muted">No evaluations found.</td></tr>
          </tbody>
        </table>
      </div>
    </Paged>
  </div>
</template>

<script>
// 19 Nov 2026 (Khairul): COH > All evaluations (HR and Directors). Who rated who and when in a quarter, with Delete to
// remove an evaluation that spoils the tally (the evaluation, its marks in private/scores and an audit log line, in one
// write; firestore.rules Draft 0.91). Marks are never shown here, and they are not read (one read per evaluation only).
import { collection, doc, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase.js';
import { useSession } from '@/stores/session.js';
import OptionPicker from '@/components/OptionPicker.vue';
import Paged from '@/components/Paged.vue';
import { audit, friendlyError } from '@/lib/finance-data.js';
import { askConfirm, showNotice } from '@/lib/confirm.js';
import { toast } from '@/lib/toast.js';

// Click Evaluator or Employee to sort by it (A to Z, click again Z to A); ties go by the other name
const SORTS = [{ key: 'evaluator', label: 'Evaluator' }, { key: 'evaluatee', label: 'Employee' }];
const nameOf = (e, k) => String((k === 'evaluator' ? e.evaluatorNameSnapshot : e.evaluateeNameSnapshot) || '').toLowerCase();
const SEARCH_IN = [{ value: 'both', label: 'Either' }, { value: 'evaluator', label: 'The evaluator' }, { value: 'evaluatee', label: 'The employee rated' }];
const IN_HINT = { both: 'Evaluator or employee name', evaluator: 'Who gave the rating', evaluatee: 'Who was rated' };

export default {
  components: { OptionPicker, Paged },
  props: { quarters: { type: Array, default: () => [] }, startId: { type: String, default: '' } },
  data() { return { SORTS, SEARCH_IN, IN_HINT, searchIn: 'both', sortKey: 'evaluator', desc: false, quarterId: '', rows: [], q: '', loading: false, error: '', busy: '' }; },
  computed: {
    shown() {
      const q = this.q.trim().toLowerCase();
      const k = this.sortKey, other = k === 'evaluator' ? 'evaluatee' : 'evaluator', dir = this.desc ? -1 : 1;
      return this.rows.filter(e => !q || (this.searchIn !== 'evaluatee' && nameOf(e, 'evaluator').includes(q)) || (this.searchIn !== 'evaluator' && nameOf(e, 'evaluatee').includes(q)))
        .sort((a, b) => dir * nameOf(a, k).localeCompare(nameOf(b, k)) || nameOf(a, other).localeCompare(nameOf(b, other)));
    }
  },
  watch: { quarters: { immediate: true, handler(list) { if (!this.quarterId && list.length) { this.quarterId = this.startId || list[0].id; this.load(); } } } },
  methods: {
    async load() {
      if (!this.quarterId) return;
      this.loading = true; this.error = ''; this.rows = [];
      try {
        const snap = await getDocs(query(collection(db, 'cohEvaluations'), where('quarterId', '==', this.quarterId)));
        this.rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch (e) { this.error = 'Could not load the evaluations.'; }
      this.loading = false;
    },
    sortBy(k) { if (this.sortKey === k) this.desc = !this.desc; else { this.sortKey = k; this.desc = false; } },
    when(t) { const d = t?.toDate?.(); return d ? d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'; },
    async remove(e) {
      const who = `${e.evaluatorNameSnapshot || e.evaluatorId}'s evaluation of ${e.evaluateeNameSnapshot || e.evaluateeId}`;
      const ok = await askConfirm({ title: 'Delete this evaluation?', danger: true, confirmText: 'Delete evaluation',
        message: `${who} (${this.when(e.submittedAt)}) and its marks will be removed for good. It no longer counts in the tally, and ${e.evaluatorNameSnapshot || 'the evaluator'} can rate ${e.evaluateeNameSnapshot || 'them'} again. This cannot be undone.` });
      if (!ok) return;
      this.busy = e.id;
      try {
        const me = useSession(), b = writeBatch(db), ref = doc(db, 'cohEvaluations', e.id);
        b.delete(doc(ref, 'private', 'scores'));
        b.delete(ref);
        audit(b, me, { action: 'performance.coh.evaluation.delete', entity: `cohEvaluations/${e.id}`,
          changes: [{ field: 'evaluation', old: `${e.evaluatorNameSnapshot || e.evaluatorId} -> ${e.evaluateeNameSnapshot || e.evaluateeId}`, new: null }],
          reason: `Quarter ${e.quarterId}: removed from All evaluations` });
        await b.commit();
        this.rows = this.rows.filter(x => x.id !== e.id);
        toast('Evaluation deleted');
      } catch (err) {
        showNotice("Couldn't delete", err?.code === 'permission-denied' ? 'Firestore refused this. The latest security rules (Draft 0.91) need to be published first.' : friendlyError(err, 'delete the evaluation'));
      }
      this.busy = '';
    }
  }
};
</script>

<style scoped>
.ae-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
.ae-filters { display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-end; }
.ae-filters .field { margin-bottom: 0; }
.ae-filters .grow { flex: 1 1 220px; }
.ae-table th, .ae-table td { white-space: nowrap; }
.nw { white-space: nowrap; }
.sort-btn { background: none; border: 0; padding: 0; font: inherit; color: inherit; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; }
.sort-btn .arrow { font-size: 10px; color: var(--muted); }
.sort-btn.on .arrow { color: var(--accent); }
.del-btn { color: var(--danger); }
.del-btn:hover:not(:disabled) { background: var(--danger) !important; border-color: var(--danger) !important; color: #fff !important; }
</style>
