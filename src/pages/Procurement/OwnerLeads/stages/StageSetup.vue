<template>
  <section class="card" aria-label="Operations Setup">
    <div class="card-head"><h2>{{ `${n}. Operations Setup` }}</h2>
      <span class="pill" :class="done ? 'green' : onCount ? 'amber' : 'grey'">{{ done ? 'Done' : `${onCount} of ${d.setup.items.length} done` }}</span></div>
    <div class="notice warn" v-if="!paidOf(d)">Operations Setup starts once the payment is confirmed, or the deposit received (Payment stage).</div>
    <p class="help" v-if="d.setup.legacy && !onCount">This listing was past this point before Operations Setup existed, so it counts as done. Ticking rows here is optional.</p>
    <p class="help" v-else>Operations tick each row when it is ready. Marketing starts once every row is ticked.</p>

    <div class="su-list">
      <template v-for="(x, i) in d.setup.items" :key="x.key">
        <div class="su-row" :class="{ on: x.on }">
          <label class="su-tick"><input type="checkbox" v-model="x.on" :disabled="!canEdit" :aria-label="`${x.title} done`"></label>
          <div class="su-main">
            <b>{{ x.title }}</b>
            <!-- Wifi: the name here, the password in the private part -->
            <div class="su-fields" v-if="x.kind === 'wifi'">
              <input class="input" v-if="canEdit" v-model="x.note" placeholder="Wifi name" aria-label="Wifi name">
              <span class="muted" v-else>{{ x.note || 'No Wifi name' }}</span>
              <template v-if="canSeeContact">
                <div class="su-pw" v-if="canEdit">
                  <input class="input" :type="showPw ? 'text' : 'password'" v-model="c.wifiPassword" placeholder="Wifi password" aria-label="Wifi password" autocomplete="off">
                  <button type="button" class="editlink" @click="showPw = !showPw">{{ showPw ? 'Hide' : 'Show' }}</button>
                </div>
                <span class="muted" v-else>{{ c.wifiPassword ? (showPw ? c.wifiPassword : '••••••••') : 'No password' }}</span>
              </template>
              <small class="muted" v-else>The password is shown to Directors, Procurement and Operations only.</small>
            </div>
            <!-- A link (Owner's Google Drive) -->
            <div class="su-fields" v-else-if="x.kind === 'link'">
              <input class="input" v-if="canEdit" v-model="x.link" placeholder="https://drive.google.com/…" :aria-label="`${x.title} link`">
              <a v-if="httpsOk(x.link)" :href="x.link" target="_blank" rel="noopener">Open link</a>
              <span class="muted" v-else-if="!canEdit">No link</span>
            </div>
            <div class="su-fields" v-else>
              <input class="input" v-if="canEdit" v-model="x.note" placeholder="Note (optional)" :aria-label="`${x.title} note`">
              <span class="muted" v-else-if="x.note">{{ x.note }}</span>
            </div>
          </div>
          <button type="button" class="mk-x" v-if="canEdit" @click="d.setup.items.splice(i, 1)" :aria-label="`Remove ${x.title}`" title="Remove">×</button>
        </div>
      </template>
      <p class="muted" v-if="!d.setup.items.length">No rows. Add one below.</p>
    </div>
    <div class="mk-add" v-if="canEdit"><input class="input" v-model="add" placeholder="Add another row, e.g. Smart lock set up" aria-label="New Operations Setup row" @keyup.enter="addRow()"><button class="btn" @click="addRow()" :disabled="!add.trim()">+ Add</button></div>
  </section>
</template>

<script>
// Stage: Operations Setup (13 Nov 2026, Khairul). After Payment, before Marketing; done by Operations. Default rows:
// Deep Cleaning, Wifi (name here, password in the listing's private part), House Rules, Owner's Google Drive (link),
// Owner's WhatsApp Group (this replaces the Live stage's Ops WhatsApp tick). Rows can be added and removed like Marketing.
// When every row is ticked the page tells the Marketing team (ListingFlow save).
import { paidOf, setupDoneOf, httpsOk, lineId } from '@/lib/owner-leads.js';

export default {
  props: { d: { type: Object, required: true }, c: { type: Object, required: true }, canEdit: Boolean, canSeeContact: Boolean, n: { type: Number, default: 6 } },
  data() { return { add: '', showPw: false }; },
  computed: {
    done() { return setupDoneOf(this.d); },
    onCount() { return this.d.setup.items.filter(x => x.on).length; }
  },
  methods: {
    paidOf, httpsOk,
    addRow() {
      const t = this.add.trim();
      if (!t) return;
      if (!this.d.setup.items.some(x => x.title.toLowerCase() === t.toLowerCase())) this.d.setup.items.push({ key: lineId(), title: t, kind: '', on: false, note: '', link: '' });
      this.add = '';
    }
  }
};
</script>

<style scoped>
.su-list { display: grid; gap: 8px; margin-top: 10px; }
.su-row { display: grid; grid-template-columns: 28px minmax(0, 1fr) 28px; gap: 10px; align-items: start; padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; }
.su-row.on { border-color: color-mix(in srgb, var(--green) 45%, var(--border)); background: color-mix(in srgb, var(--green) 6%, transparent); }
.su-tick { padding-top: 2px; }
.su-tick input { width: 18px; height: 18px; }
.su-main { display: grid; gap: 6px; min-width: 0; }
.su-fields { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.su-fields .input { flex: 1 1 220px; max-width: 360px; height: 36px; }
.su-pw { display: flex; gap: 8px; align-items: center; flex: 1 1 220px; max-width: 360px; }
.su-pw .input { flex: 1; }
.mk-x { border: 0; background: none; color: var(--muted); font-size: 18px; cursor: pointer; line-height: 1; padding: 2px; }
.mk-x:hover { color: var(--red); }
.mk-add { display: flex; gap: 8px; margin-top: 12px; }
.mk-add .input { flex: 1; max-width: 420px; }
</style>
