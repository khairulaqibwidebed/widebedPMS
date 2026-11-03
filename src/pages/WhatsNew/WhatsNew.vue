<template>
  <main class="content">
    <div class="loading-bar" v-show="loading"></div>

    <!-- ===== Patch notes: one update opened (?id=) ===== -->
    <template v-if="open">
      <button type="button" class="wn-back" @click="close()">‹ All updates</button>
      <article class="wn-notes">
        <header class="wn-hero" :class="{ patch: !isMajor(open) }">
          <div class="wn-hero-top">
            <span class="wn-ver" v-if="open.version">{{ open.version }}</span>
            <span class="wn-kind">{{ kindLabel(open) }}</span>
          </div>
          <h1>{{ open.title }}</h1>
          <div class="wn-hero-meta">{{ longDate(open.date) }} · Posted by {{ open.createdByName || 'Director' }}</div>
          <div class="wn-tags"><span class="wn-tag" v-for="a in open.audience" :key="a">{{ audLabel(a) }}</span></div>
        </header>
        <p class="wn-summary" v-if="open.summary">{{ open.summary }}</p>
        <section class="wn-sec" v-for="s in sectionsOf(open)" :key="s.key">
          <h2 :class="'h-' + s.key"><span class="wn-sec-mark"></span>{{ s.label }}</h2>
          <ul><li v-for="(p, i) in s.points" :key="i">{{ p }}</li></ul>
        </section>
        <footer class="wn-notes-foot" v-if="isDirector">
          <button class="act-pill" @click="openEdit(open)">Edit</button>
          <button class="act-pill danger" @click="remove(open)">Delete</button>
        </footer>
      </article>
      <div class="wn-nav">
        <button type="button" class="btn" v-if="neighbour(1)" @click="show(neighbour(1))">‹ Older: {{ neighbour(1).title }}</button>
        <span></span>
        <button type="button" class="btn" v-if="neighbour(-1)" @click="show(neighbour(-1))">Newer: {{ neighbour(-1).title }} ›</button>
      </div>
    </template>

    <!-- ===== List of updates ===== -->
    <template v-else>
      <div class="page-head">
        <div>
          <h1>What's New</h1>
          <div class="sub">Patch notes for the PMS, newest first.</div>
        </div>
        <div class="head-tools" v-if="isDirector"><button class="btn btn-primary" @click="openNew()">+ Post update</button></div>
      </div>

      <div class="notice error" v-show="error">{{ error }}</div>
      <div class="notice ok" v-show="okMsg">{{ okMsg }}</div>

      <div class="pills wn-filter">
        <button type="button" class="pill-btn" :class="{ on: filter === 'mine' }" @click="filter = 'mine'">For me</button>
        <button type="button" class="pill-btn" :class="{ on: filter === 'all' }" @click="filter = 'all'">All updates</button>
        <span class="wn-sep"></span>
        <button type="button" class="pill-btn" v-for="k in KIND_FILTERS" :key="k.value" :class="{ on: kindFilter === k.value }" @click="kindFilter = k.value">{{ k.label }}</button>
      </div>

      <p class="empty" v-if="!loading && !shown.length">{{ filter === 'mine' && items.length ? 'No updates for your team yet. Try All updates.' : 'No updates posted yet.' }}</p>

      <div class="wn-list">
        <button type="button" v-for="(u, i) in shown" :key="u.id" class="wn-card" :class="{ major: isMajor(u), patch: !isMajor(u), fresh: isNew(u) }" @click="show(u)">
          <div class="wn-cal"><b>{{ dayOf(u.date) }}</b><span>{{ monOf(u.date) }}</span></div>
          <div class="wn-card-body">
            <div class="wn-card-top">
              <span class="wn-ver" v-if="u.version">{{ u.version }}</span>
              <span class="wn-kind">{{ kindLabel(u) }}</span>
              <span class="wn-new" v-if="isNew(u)">NEW</span>
            </div>
            <div class="wn-card-title">{{ u.title }}</div>
            <div class="wn-card-sum">{{ u.summary || firstPoint(u) }}</div>
            <div class="wn-card-foot">
              <span class="wn-counts">
                <span v-for="s in sectionsOf(u)" :key="s.key" :class="'c-' + s.key">{{ s.points.length }} {{ s.short }}</span>
              </span>
              <span class="wn-tags"><span class="wn-tag" v-for="a in u.audience" :key="a">{{ audLabel(a) }}</span></span>
            </div>
          </div>
          <span class="wn-more">Read ›</span>
        </button>
      </div>
    </template>

    <!-- ===== Post / edit (Director only) ===== -->
    <div class="modal-back" v-if="form" @click.self="form = null" v-esc="() => { form = null }">
      <form class="modal wn-modal" role="dialog" :aria-label="form.id ? 'Edit update' : 'Post update'" @submit.prevent="save()">
        <h2 class="wn-modal-title">{{ form.id ? 'Edit update' : 'Post update' }}</h2>
        <div class="notice error" v-show="form.error">{{ form.error }}</div>
        <div class="field">
          <label class="req">Type</label>
          <div class="wn-kinds">
            <button type="button" class="wn-kind-opt" v-for="k in KINDS" :key="k.value" :class="{ on: form.kind === k.value }" @click="setKind(k.value)">
              <b>{{ k.label }}</b><span>{{ k.help }}</span>
            </button>
          </div>
        </div>
        <div class="wn-grid">
          <FormField id="wVer" label="Version" v-model="form.version" placeholder="e.g. v1.4" />
          <FormField id="wTitle" label="Title" req v-model="form.title" placeholder="e.g. Owner payments" />
          <FormField id="wDate" label="Date" req type="date" v-model="form.date" />
        </div>
        <FormField id="wSum" label="Short summary" v-model="form.summary" placeholder="One line shown on the update card" />
        <div class="field" v-for="s in SECTIONS" :key="s.key">
          <label :for="'w' + s.key">{{ s.label }}</label>
          <textarea class="input wn-text" :id="'w' + s.key" v-model="form[s.key]" :placeholder="s.hint"></textarea>
        </div>
        <span class="help">One point per line. Fill in at least one of New, Changes or Fixes.</span>
        <div class="field wn-aud">
          <label class="req">Who it affects</label>
          <OptionPicker class="wn-aud-pick" multiple :model-value="form.audience" :options="audOptions" label="Who it affects" placeholder="Pick who it affects" @update:model-value="setAud" />
        </div>
        <div class="wn-modal-acts">
          <button type="button" class="btn" @click="form = null">Cancel</button>
          <button type="submit" class="btn btn-primary" :disabled="busy">{{ busy ? 'Saving…' : form.id ? 'Save changes' : 'Post update' }}</button>
        </div>
      </form>
    </div>
  </main>
</template>

<script>
import { collection, doc, getDocs, query, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db, ROLE_LABEL, BUILTIN_ROLES, CUSTOM_ROLES } from '@/lib/firebase.js';
import { friendlyError } from '@/lib/finance-data.js';
import { askConfirm } from '@/lib/confirm.js';
import { useSession } from '@/stores/session.js';
import FormField from '@/components/FormField.vue';
import OptionPicker from '@/components/OptionPicker.vue';
import { markUpdatesSeen, updatesSeenAt } from '@/lib/whats-new.js';

// Patch note sections, in the order they show. Older posts saved one "body" field; it shows as Changes.
const SECTIONS = [
  { key: 'added', label: 'New', short: 'new', hint: 'e.g. Finance can mark a statement Paid with a pay slip' },
  { key: 'changed', label: 'Changes', short: 'changed', hint: 'e.g. Pull back now asks for a reason in a pop-up' },
  { key: 'fixed', label: 'Fixes', short: 'fixed', hint: 'e.g. Owner share showed 9.26 instead of 100' }
];
// Two kinds of update: a big version (v2.0) and small patch notes (v1.1, v1.2 ...).
const KINDS = [
  { value: 'major', label: 'Version update', help: 'New modules or big features. Version goes up to the next whole number (v1.4 to v2.0).' },
  { value: 'patch', label: 'Patch notes', help: 'Minor bug fixes or small changes. Version goes up by .1 (v1.4 to v1.5).' }
];
const KIND_FILTERS = [{ value: 'any', label: 'All types' }, { value: 'major', label: 'Version updates' }, { value: 'patch', label: 'Patch notes' }];
const lines = t => (t || '').split('\n').map(s => s.replace(/^\s*[-•*]\s*/, '').trim()).filter(Boolean);
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const ms = t => (t?.toMillis ? t.toMillis() : 0);
const asDate = d => { const [y, m, day] = (d || '').split('-').map(Number); return y ? new Date(y, m - 1, day) : null; };

export default {
  components: { FormField, OptionPicker },
  data: () => ({ items: [], loading: true, error: '', okMsg: '', filter: 'mine', kindFilter: 'any', form: null, KINDS, KIND_FILTERS, busy: false, seenBefore: 0, ROLE_LABEL, SECTIONS }),
  computed: {
    me() { return useSession(); },
    isDirector() { return this.me.role === 'director'; },
    shown() {
      return this.items
        .filter(u => this.filter === 'all' || u.audience.includes('everyone') || u.audience.includes(this.me.role))
        .filter(u => this.kindFilter === 'any' || (this.kindFilter === 'major') === this.isMajor(u));
    },
    // Built-in roles plus active roles made on the Roles page (a turned-off role stays listed if this update already uses it)
    ROLES() { return [...BUILTIN_ROLES, ...Object.keys(CUSTOM_ROLES).filter(r => CUSTOM_ROLES[r].active || this.form?.audience.includes(r))]; },
    audOptions() { return [{ value: 'everyone', label: 'Everyone' }, ...this.ROLES.map(r => ({ value: r, label: ROLE_LABEL[r] || r }))]; },
    open() { const id = this.$route.query.id; return id ? this.items.find(u => u.id === id) || null : null; }
  },
  async mounted() {
    this.seenBefore = updatesSeenAt();
    await this.load();
    markUpdatesSeen(this.items[0]);
  },
  methods: {
    async load() {
      this.loading = true; this.error = '';
      try {
        const snap = await getDocs(query(collection(db, 'updates')));
        this.items = snap.docs.map(d => ({ id: d.id, audience: ['everyone'], ...d.data() }))
          .sort((a, b) => (b.date || '').localeCompare(a.date || '') || ms(b.createdAt) - ms(a.createdAt));
      } catch (e) { this.error = friendlyError(e, 'load the updates'); }
      this.loading = false;
    },
    sectionsOf(u) {
      return SECTIONS.map(s => ({ ...s, points: lines(s.key === 'changed' ? [u.changed, u.body].filter(Boolean).join('\n') : u[s.key]) })).filter(s => s.points.length);
    },
    isMajor(u) { return u.kind === 'major'; },
    kindLabel(u) { return this.isMajor(u) ? 'VERSION UPDATE' : 'PATCH NOTES'; },
    firstPoint(u) { const s = this.sectionsOf(u)[0]; return s ? s.points[0] : ''; },
    isNew(u) { return this.seenBefore > 0 && ms(u.createdAt) > this.seenBefore; },
    audLabel(a) { return a === 'everyone' ? 'Everyone' : ROLE_LABEL[a] || a; },
    longDate(d) { const x = asDate(d); return x ? x.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : ''; },
    dayOf(d) { const x = asDate(d); return x ? x.getDate() : ''; },
    monOf(d) { const x = asDate(d); return x ? x.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase() : ''; },
    show(u) { this.okMsg = ''; this.$router.push({ query: { id: u.id } }); window.scrollTo({ top: 0 }); },
    close() { this.$router.push({ query: {} }); },
    neighbour(step) { const list = this.shown, i = list.findIndex(u => u.id === this.open?.id); return i >= 0 ? list[i + step] || null : null; },
    openNew() {
      this.okMsg = '';
      this.form = { id: null, kind: 'patch', autoVer: true, version: this.nextVersion('patch'), title: '', date: today(), summary: '', added: '', changed: '', fixed: '', audience: ['everyone'], error: '' };
    },
    // Next version from the newest one: patch v1.3 -> v1.4, major v1.3 -> v2.0.
    nextVersion(kind) {
      const v = this.items.find(u => /\d/.test(u.version || ''))?.version;
      const m = (v || '').match(/(\d+)(?:\.(\d+))?/);
      if (!m) return kind === 'major' ? 'v1.0' : 'v1.0';
      const major = +m[1], minor = +(m[2] || 0);
      return kind === 'major' ? `v${major + 1}.0` : `v${major}.${minor + 1}`;
    },
    // Switching type on a new post also updates the suggested version, unless it was typed over.
    setKind(k) {
      const f = this.form;
      if (f.autoVer || f.version === this.nextVersion(f.kind)) f.version = this.nextVersion(k);
      f.kind = k;
    },
    openEdit(u) {
      this.okMsg = '';
      this.form = { id: u.id, kind: this.isMajor(u) ? 'major' : 'patch', autoVer: false, version: u.version || '', title: u.title || '', date: u.date || today(), summary: u.summary || '',
        added: u.added || '', changed: [u.changed, u.body].filter(Boolean).join('\n'), fixed: u.fixed || '', audience: [...(u.audience || ['everyone'])], error: '' };
    },
    // Everyone and single teams don't mix: ticking Everyone clears the teams, ticking a team clears Everyone
    setAud(next) {
      const f = this.form, had = f.audience.includes('everyone');
      if (next.includes('everyone') && !had) f.audience = ['everyone'];
      else f.audience = next.filter(x => x !== 'everyone');
    },
    async save() {
      const f = this.form, me = this.me;
      if (!f.title.trim()) return f.error = 'Add a title.';
      if (!f.date) return f.error = 'Add the date of the update.';
      if (!SECTIONS.some(s => lines(f[s.key]).length)) return f.error = 'Add at least one point under New, Changes or Fixes.';
      if (!f.audience.length) return f.error = 'Pick who it affects, or Everyone.';
      this.busy = true; f.error = '';
      try {
        const ref = f.id ? doc(db, 'updates', f.id) : doc(collection(db, 'updates'));
        const data = { kind: f.kind, version: f.version.trim(), title: f.title.trim(), date: f.date, summary: f.summary.trim(),
          added: f.added.trim(), changed: f.changed.trim(), fixed: f.fixed.trim(), body: '', audience: f.audience, updatedAt: serverTimestamp(), updatedBy: me.user.uid };
        const b = writeBatch(db);
        b.set(ref, f.id ? data : { ...data, createdAt: serverTimestamp(), createdBy: me.user.uid, createdByName: me.name }, { merge: true });
        b.set(doc(collection(db, 'auditLog')), { at: serverTimestamp(), uid: me.user.uid, userName: me.name, role: me.role, action: f.id ? 'update.edit' : 'update.post', entity: `updates/${ref.id}`, changes: [{ field: 'title', old: null, new: data.title }], reason: f.id ? 'What\'s New edited' : 'What\'s New posted' });
        await b.commit();
        this.okMsg = f.id ? 'Update saved.' : 'Update posted.';
        this.form = null;
        await this.load();
        markUpdatesSeen(this.items[0]);
      } catch (e) { f.error = friendlyError(e, 'save the update'); }
      this.busy = false;
    },
    async remove(u) {
      if (!await askConfirm({ title: `Delete "${u.title}"?`, message: 'It disappears from What\'s New for everyone. The deletion goes in the audit log.', confirmText: 'Delete update', danger: true })) return;
      const me = this.me;
      try {
        const b = writeBatch(db);
        b.delete(doc(db, 'updates', u.id));
        b.set(doc(collection(db, 'auditLog')), { at: serverTimestamp(), uid: me.user.uid, userName: me.name, role: me.role, action: 'update.delete', entity: `updates/${u.id}`, changes: [{ field: 'title', old: u.title, new: null }], reason: 'What\'s New deleted' });
        await b.commit();
        this.items = this.items.filter(x => x.id !== u.id);
        this.okMsg = 'Update deleted.';
        if (this.$route.query.id) this.close();
      } catch (e) { this.error = friendlyError(e, 'delete the update'); }
    }
  }
};
</script>

<style scoped>
.wn-filter { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; align-items: center; }
.wn-sep { width: 1px; height: 22px; background: var(--border); margin: 0 4px; }
.wn-kinds { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
@media (max-width: 560px) { .wn-kinds { grid-template-columns: 1fr; } }
.wn-kind-opt { text-align: left; font: inherit; color: inherit; cursor: pointer; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; display: flex; flex-direction: column; gap: 3px; }
.wn-kind-opt span { font-size: 12px; color: var(--muted); }
.wn-kind-opt.on { border-color: var(--accent); background: var(--accent-soft); }
.wn-kind-opt.on b { color: var(--accent); }
.wn-list { display: flex; flex-direction: column; gap: 12px; max-width: 920px; }

/* Update card */
.wn-card { display: flex; align-items: stretch; gap: 16px; width: 100%; text-align: left; font: inherit; color: inherit; cursor: pointer;
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; transition: border-color .15s ease, transform .15s ease, box-shadow .15s ease; }
.wn-card:hover { border-color: color-mix(in srgb, var(--accent) 50%, var(--border)); transform: translateY(-1px); box-shadow: 0 6px 18px rgba(0,0,0,.06); }
/* Major update: big tinted card. Patch notes: compact row. */
.wn-card.major { background: linear-gradient(120deg, color-mix(in srgb, var(--accent) 14%, var(--surface)), var(--surface) 65%); border-color: color-mix(in srgb, var(--accent) 40%, var(--border)); padding: 24px 20px; }
.wn-card.major .wn-card-title { font-size: 21px; }
.wn-card.major .wn-cal { flex-basis: 64px; background: var(--accent); color: #fff; }
.wn-card.major .wn-kind { color: var(--accent); }
.wn-card.patch { padding: 12px 16px; }
.wn-card.patch .wn-cal { flex-basis: 48px; }
.wn-card.patch .wn-cal b { font-size: 18px; }
.wn-card.patch .wn-ver { background: var(--chip); color: var(--text-2); }
.wn-card.patch .wn-card-title { font-size: 15px; margin: 4px 0 2px; }
.wn-cal { flex: 0 0 56px; display: flex; flex-direction: column; align-items: center; justify-content: center; border-radius: 10px; background: var(--accent-soft); color: var(--accent); }
.wn-cal b { font-size: 22px; line-height: 1; }
.wn-cal span { font-size: 11px; font-weight: 700; letter-spacing: .06em; margin-top: 3px; }
.wn-card-body { flex: 1 1 auto; min-width: 0; }
.wn-card-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.wn-kind { font-size: 11px; font-weight: 700; letter-spacing: .08em; color: var(--muted); }
.wn-ver { font-size: 11px; font-weight: 700; padding: 1px 8px; border-radius: 6px; background: var(--accent); color: #fff; }
.wn-new { font-size: 10px; font-weight: 800; letter-spacing: .06em; padding: 1px 7px; border-radius: 999px; background: var(--green-soft); color: var(--green); }
.wn-card-title { font-size: 16px; font-weight: 700; margin: 6px 0 4px; }
.wn-card-sum { color: var(--text-2); font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wn-card-foot { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 10px; }
.wn-counts { display: flex; gap: 10px; font-size: 12px; font-weight: 600; }
.c-added { color: var(--green); } .c-changed { color: var(--blue); } .c-fixed { color: var(--amber); }
.wn-tags { display: flex; gap: 6px; flex-wrap: wrap; }
.wn-tag { font-size: 11px; padding: 2px 8px; border-radius: 999px; background: var(--chip); color: var(--text-2); }
.wn-more { align-self: center; color: var(--accent); font-weight: 600; font-size: 13px; white-space: nowrap; }
@media (max-width: 600px) { .wn-more { display: none; } .wn-cal { flex-basis: 48px; } }

/* Patch notes view */
.wn-back { background: none; border: 0; color: var(--accent); font: inherit; font-weight: 600; cursor: pointer; padding: 0; margin-bottom: 14px; }
.wn-notes { max-width: 820px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
.wn-hero { padding: 28px 28px 22px; background: linear-gradient(120deg, var(--accent), color-mix(in srgb, var(--accent) 65%, #1a1d23)); color: #fff; }
.wn-hero .wn-kind { color: rgba(255,255,255,.8); }
.wn-hero .wn-ver { background: rgba(255,255,255,.22); }
.wn-hero-top { display: flex; gap: 8px; align-items: center; }
.wn-hero h1 { margin: 10px 0 6px; font-size: 26px; letter-spacing: -.01em; }
.wn-hero-meta { font-size: 13px; opacity: .85; margin-bottom: 12px; }
.wn-hero .wn-tag { background: rgba(255,255,255,.18); color: #fff; }
/* Patch notes header: plain, with an accent bar, so major updates stand out. */
.wn-hero.patch { background: var(--surface); color: inherit; border-bottom: 1px solid var(--border); border-left: 5px solid var(--accent); padding: 22px 28px 18px; }
.wn-hero.patch h1 { font-size: 22px; }
.wn-hero.patch .wn-kind { color: var(--muted); }
.wn-hero.patch .wn-ver { background: var(--chip); color: var(--text-2); }
.wn-hero.patch .wn-hero-meta { color: var(--muted); opacity: 1; }
.wn-hero.patch .wn-tag { background: var(--chip); color: var(--text-2); }
.wn-summary { margin: 0; padding: 20px 28px 0; font-size: 15px; color: var(--text-2); }
.wn-sec { padding: 18px 28px 4px; }
.wn-sec h2 { font-size: 13px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; margin: 0 0 8px; display: flex; align-items: center; gap: 8px; }
.wn-sec-mark { width: 4px; height: 16px; border-radius: 2px; background: currentColor; }
.h-added { color: var(--green); } .h-changed { color: var(--blue); } .h-fixed { color: var(--amber); }
.wn-sec ul { margin: 0; padding-left: 22px; line-height: 1.7; }
.wn-notes-foot { display: flex; gap: 6px; justify-content: flex-end; padding: 16px 28px 20px; border-top: 1px solid var(--border); margin-top: 18px; }
.wn-notes > :last-child:not(.wn-notes-foot) { padding-bottom: 24px; }
.wn-nav { display: flex; justify-content: space-between; gap: 12px; max-width: 820px; margin-top: 14px; flex-wrap: wrap; }
@media (max-width: 600px) { .wn-hero, .wn-sec, .wn-summary, .wn-notes-foot { padding-left: 18px; padding-right: 18px; } }

/* Form */
.wn-modal { max-width: 680px; }
.wn-modal-title { margin: 0 0 14px; font-size: 18px; }
.wn-grid { display: grid; grid-template-columns: 1fr 2fr 1.2fr; gap: 12px; }
@media (max-width: 640px) { .wn-grid { grid-template-columns: 1fr; } }
.wn-text { height: 76px; }
.wn-aud { margin-top: 12px; }
.wn-aud-pick { display: block; }
.wn-aud-pick :deep(.op-btn) { width: 100%; }
.wn-aud-pick :deep(.op-val) { max-width: none; display: block; }
.pills { display: flex; gap: 6px; flex-wrap: wrap; }
.wn-modal-acts { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }
</style>
