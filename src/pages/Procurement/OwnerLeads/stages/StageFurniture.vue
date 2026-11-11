<template>
  <section class="card" aria-label="Furniture">
    <div class="card-head"><h2>{{ `${n}. Furniture` }}</h2><span class="muted">{{ furnUsed(d).length ? `${furnUsed(d).filter(f => subDoneOf(d, f.key)).length} of ${furnUsed(d).length} completed` : 'No items yet' }}</span></div>
    <div class="notice error" v-show="err">{{ err }}</div>
    <template v-for="f in FURN" :key="f.key">
      <div class="sub-stage" :data-sub="f.key">
        <div class="card-head" style="margin-bottom:8px"><h3>{{ f.label }}</h3>
          <span class="pill" :class="subDoneOf(d, f.key) ? 'green' : 'grey'">{{ subDoneOf(d, f.key) ? 'Completed' : d.furniture[f.key].length ? `${d.furniture[f.key].filter(x => x.done).length} of ${d.furniture[f.key].length} ticked` : 'Not needed' }}</span></div>
        <div class="table-wrap" v-show="d.furniture[f.key].length">
          <table class="table lines">
            <thead><tr><th style="width:72px"><label class="th-all" v-if="canEdit" title="Tick or untick every line"><input type="checkbox" :checked="d.furniture[f.key].every(x => x.done)" :indeterminate.prop="d.furniture[f.key].some(x => x.done) && !d.furniture[f.key].every(x => x.done)" @change="d.furniture[f.key].forEach(x => { x.done = $event.target.checked })" :aria-label="`Tick all ${f.label}`"> All</label><template v-else>Added</template></th><th>Item</th><th class="num">RM</th><th v-if="canEdit"></th></tr></thead>
            <tbody>
              <template v-for="it in d.furniture[f.key]" :key="it.id">
                <tr>
                  <td><input type="checkbox" v-model="it.done" v-if="canEdit" :aria-label="`${it.item || 'Line'} added`"><span v-else>{{ it.done ? '✓' : '—' }}</span></td>
                  <td class="wrap"><input class="input" v-if="canEdit" v-model="it.item" placeholder="e.g. Sofa" aria-label="Item"><span v-else>{{ it.item }}</span></td>
                  <td class="num"><input class="input cost" v-if="canEdit" v-model="it.cost" inputmode="decimal" placeholder="0" :aria-label="`RM for ${it.item || 'line'}`"><span v-else>{{ rm(it.cost) }}</span></td>
                  <td class="num" v-if="canEdit"><button class="editlink" @click="removeLine(d.furniture[f.key], it)">Remove</button></td>
                </tr>
              </template>
            </tbody>
            <tfoot><tr><td></td><td>Total</td><td class="num">{{ rm(sumLines(d.furniture[f.key])) }}</td><td v-if="canEdit"></td></tr></tfoot>
          </table>
        </div>
        <p class="muted" v-show="!d.furniture[f.key].length">No items yet.</p>
        <div class="furn-tools" v-if="canEdit">
          <button class="editlink" @click="addFurn(f.key)">+ Add line</button>
          <button class="editlink" @click="pasteOpen = pasteOpen === f.key ? '' : f.key">Paste lines</button>
        </div>
        <div class="paste" v-if="canEdit && pasteOpen === f.key">
          <textarea class="input" v-model="pasteText" :aria-label="`Paste ${f.label} lines`" placeholder="One item a line, e.g.&#10;TV RM2500&#10;Linen RM20"></textarea>
          <button class="btn" @click="pasteLines(f.key)">Add these lines</button>
        </div>
        <div class="done-text" v-if="subDoneOf(d, f.key)">
          <span>{{ f.doneText }}</span>
          <button class="btn copy" @click="$emit('copy', f.doneText)">Copy for WhatsApp</button>
        </div>
      </div>
    </template>
    <div class="totals">
      <template v-for="f in FURN" :key="f.key"><div class="kv"><span>{{ f.label }}</span><span>{{ rm(sumLines(d.furniture[f.key])) }}</span></div></template>
      <div class="kv total"><span>Total</span><span>{{ rm(furnTotal(d)) }}</span></div>
    </div>
  </section>
</template>

<script>
// Stage: Furniture (big furniture, electrical items, essential items). Edits the draft (d) in place.
import { FURN, lineId, money, rm, sumLines, furnTotal, furnUsed, subDoneOf } from '@/lib/owner-leads.js';

export default {
  props: { d: { type: Object, required: true }, canEdit: Boolean, n: { type: Number, default: 3 } },
  emits: ['copy'],
  data() { return { FURN, pasteOpen: '', pasteText: '', err: '' }; },
  methods: {
    rm, sumLines, furnTotal, furnUsed, subDoneOf,
    removeLine(list, it) { const i = list.indexOf(it); if (i >= 0) list.splice(i, 1); },
    addFurn(k) { this.d.furniture[k].push({ id: lineId(), item: '', cost: '', done: false }); },
    // "TV RM2500" / "Linen RM20" / "Kettle 45": one row each (item, then the amount at the end, RM optional).
    pasteLines(k) {
      const rows = this.pasteText.split(/\r?\n/).map(s => s.trim()).filter(Boolean).map(s => {
        const m = s.match(/^(.*?)[\s:,-]*(?:RM)?\s*([\d,]+(?:\.\d{1,2})?)\s*$/i);
        return m && m[1].trim() ? { item: m[1].trim(), cost: String(money(m[2])) } : { item: s, cost: '' };
      });
      if (!rows.length) { this.err = 'Paste one item a line, e.g. TV RM2500.'; return; }
      rows.forEach(r => this.d.furniture[k].push({ id: lineId(), ...r, done: false }));
      this.pasteText = ''; this.pasteOpen = ''; this.err = '';
    }
  }
};
</script>
