<template>
  <main class="content">
    <div class="page-head">
      <div>
        <h1>New owner listings <span class="sample-tag">Sample</span></h1>
        <div class="sub">Track each new unit from signing to going live.</div>
      </div>
      <button class="btn btn-primary" @click="openNew()">+ New owner listing</button>
    </div>
    <div class="notice warn">On hold: Procurement's scope is the Forms links for now. This tracker is shown for review, with sample listings kept in this browser.</div>
    <div class="notice ok" v-show="okMsg">{{ okMsg }}</div>

    <section class="card stage-strip">
      <template v-for="(s, i) in STAGES" :key="i">
        <span style="display:contents"><span class="stage-chip">{{ `${i + 1} ${s}` }}</span><span class="stage-arrow" v-show="i < STAGES.length - 1">→</span></span>
      </template>
    </section>

    <section class="card">
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Unit</th><th>Owner</th><th>Stage</th><th>Progress</th><th>Next step</th><th>Updated</th></tr></thead>
          <tbody>
            <template v-for="row in listings" :key="row.id">
              <tr class="clickable" @click="openEdit(row)">
                <td><b>{{ row.unit }}</b></td>
                <td>{{ row.owner }}</td>
                <td>{{ `${row.stage} · ${STAGES[row.stage - 1]}` }}</td>
                <td><div class="bar" :aria-label="`Stage ${row.stage} of 6`"><div :style="`width:${Math.round(row.stage / STAGES.length * 100)}%`"></div></div></td>
                <td>{{ row.next }}</td>
                <td>{{ short(row.updated) }}</td>
              </tr>
            </template>
            <tr v-show="!listings.length"><td colspan="6" class="muted">No listings yet.</td></tr>
          </tbody>
        </table>
      </div>
    </section>
    <p class="page-note">Click a listing to move it to the next stage or change its next step. Each listing's next step can be turned into a task later. Owners are kept up to date through the owner portal (planned separately).</p>

    <template v-if="modalOpen">
      <div class="modal-back" @click.self="modalOpen = false" v-esc="() => { modalOpen = false }">
        <div class="modal" role="dialog" :aria-label="modal.id ? 'Update listing' : 'New owner listing'">
          <h2>{{ modal.id ? `Update ${modal.unit}` : 'New owner listing' }}</h2>
          <div class="notice error" v-show="modal.error">{{ modal.error }}</div>
          <div class="grid-fields">
            <div class="field"><label for="nUnit">Unit</label><input class="input" id="nUnit" v-model="modal.unit" placeholder="e.g. Avara B-07-11"></div>
            <div class="field"><label for="nOwner">Owner code</label><input class="input" id="nOwner" v-model="modal.owner" placeholder="e.g. OWN-047"></div>
          </div>
          <div class="field"><label>Stage</label>
            <div class="stage-pick">
              <template v-for="(s, i) in STAGES" :key="i">
                <button type="button" :class="{ on: modal.stage === i + 1, done: modal.stage > i + 1 }" @click="modal.stage = i + 1"><b>{{ modal.stage > i + 1 ? '✓' : i + 1 }}</b><span>{{ s }}</span></button>
              </template>
            </div></div>
          <div class="field"><label for="nNext">Next step</label><input class="input" id="nNext" v-model="modal.next" placeholder="e.g. Site visit for renovation"></div>
          <div class="modal-foot">
            <button class="btn" @click="modalOpen = false">Cancel</button>
            <button class="btn btn-primary" @click="save()">{{ modal.id ? 'Save' : 'Add listing' }}</button>
          </div>
        </div>
      </div>
    </template>
  </main>
</template>

<script>
const STAGES = ['Agreement signed', 'Renovation', 'Furnishing', 'Photos', 'Listed on platforms', 'Live'];
const KEY = 'wb.listings';
const SAMPLE = [
  { id: 'L4', unit: 'Anggun A-12-03', owner: 'OWN-041', stage: 3, next: 'Linen and towels delivery', updated: '2026-10-18' },
  { id: 'L3', unit: 'Avara B-07-11', owner: 'OWN-044', stage: 2, next: 'Quotation approval by owner', updated: '2026-10-17' },
  { id: 'L2', unit: 'Flexus 09-02', owner: 'OWN-039', stage: 5, next: 'Go live on Booking.com and Agoda', updated: '2026-10-19' },
  { id: 'L1', unit: 'Ampang Arte 15-06', owner: 'OWN-046', stage: 1, next: 'Site visit for renovation', updated: '2026-10-16' }
];
const load = () => { try { const v = JSON.parse(localStorage.getItem(KEY)); if (Array.isArray(v)) return v; } catch {} return structuredClone(SAMPLE); };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const today = () => { const t = new Date(); return new Date(t.getTime() - t.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

export default {
  data() {
    return {
      STAGES, listings: load(), modal: {}, modalOpen: false, okMsg: ''
    };
  },
  methods: {
    short(iso) { const [, m, dd] = iso.split('-'); return `${+dd} ${MON[+m - 1]}`; },
    openNew() { this.modal = { id: null, unit: '', owner: '', stage: 1, next: '', error: '' }; this.modalOpen = true; },
    openEdit(row) { this.modal = { ...row, error: '' }; this.modalOpen = true; },
    save() {
      const m = this.modal;
      if (!m.unit.trim()) return m.error = 'Type the unit, e.g. Avara B-07-11.';
      if (!m.next.trim() && m.stage < 6) return m.error = 'Add the next step so everyone knows what is left.';
      const data = { unit: m.unit.trim(), owner: m.owner.trim(), stage: m.stage, next: m.stage === 6 && !m.next.trim() ? 'Live' : m.next.trim(), updated: today() };
      if (m.id) Object.assign(this.listings.find(x => x.id === m.id), data);
      else this.listings.unshift({ id: 'L' + Date.now(), ...data });
      try { localStorage.setItem(KEY, JSON.stringify(this.listings)); } catch {}
      this.okMsg = `${data.unit}: stage ${data.stage}, ${STAGES[data.stage - 1]}.`;
      this.modalOpen = false;
    }
  }
};
</script>

<style scoped>
    .stage-strip { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; margin-bottom: 20px; }
    .stage-chip { font-size: 12px; font-weight: 500; color: var(--accent); background: var(--accent-soft); border-radius: 999px; padding: 4px 10px; }
    .stage-arrow { color: var(--muted); font-size: 12px; }
    .bar { width: 100%; max-width: 140px; height: 6px; border-radius: 999px; background: var(--chip); overflow: hidden; }
    .bar > div { height: 100%; background: var(--brand); border-radius: 999px; }
    .page-note { color: var(--muted); font-size: 12px; margin-top: 14px; }
    .stage-pick { display: grid; gap: 8px; }
    .stage-pick button { display: flex; align-items: center; gap: 10px; text-align: left; height: 38px; padding: 0 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); color: var(--text); font-size: 13px; }
    .stage-pick button b { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; font-size: 11px; background: var(--chip); color: var(--text-2); flex: none; }
    .stage-pick button.done b { background: var(--green); color: #fff; }
    .stage-pick button.on { border-color: var(--accent); background: var(--accent-soft); }
    .stage-pick button.on b { background: var(--accent); color: #fff; }
</style>
