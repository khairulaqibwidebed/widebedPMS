<template>
  <main class="content">
    <div class="page-head">
      <div><h1>Announcements</h1><div class="sub">{{ poster ? 'Post announcements to everyone or to chosen teams, and see who has read them.' : 'Announcements from HR and the Directors.' }}</div></div>
      <div class="head-tools" v-if="poster"><button class="btn btn-primary" @click="openNew()">+ Post announcement</button></div>
    </div>
    <div class="notice error" v-show="error">{{ error }}</div>
    <div class="notice ok" v-show="okMsg">{{ okMsg }}</div>

    <!-- ===== One announcement (5 Nov 2026: strip on top like the cards, message on the left, attachments and HR's panel on the right) ===== -->
    <template v-if="open">
      <button type="button" class="an-back" @click="close()">‹ All announcements</button>
      <div class="an-detail" :class="{ solo: !hasSide }">
        <article class="an-open" :class="{ pinned: open.pinned }">
          <header class="an-open-head">
            <span class="an-pinmark" v-if="open.pinned"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>Pinned</span>
            <Avatar :uid="open.createdBy" :name="open.createdByName" :role="open.createdByRole" :size="26" />
            <span class="an-who">{{ `${open.createdByName || posterLabel(open)} · ${audLabel(open.createdByRole)}` }}</span>
            <span class="an-time">{{ when(open.createdAt, true) }}</span>
          </header>
          <div class="an-body">
            <h2 class="an-open-title">{{ open.title }}</h2>
            <div class="an-tags">
              <span class="an-tag" v-for="a in open.audience" :key="a">{{ audLabel(a) }}</span>
              <span class="an-tag edited" v-if="open.editedAt" :title="`Edited ${when(open.editedAt, true)}${open.editedByName ? ` by ${open.editedByName}` : ''}`">Edited</span>
            </div>
            <div class="an-msg">{{ open.message }}</div>
          </div>
          <footer class="an-foot" v-if="poster && !deleting">
            <button class="act-pill" @click="openEdit(open)">Edit</button>
            <button class="act-pill" :disabled="busy" @click="togglePin(open)">{{ open.pinned ? 'Unpin' : 'Pin to top' }}</button>
            <button class="act-pill danger" @click="deleting = { reason: '' }">Delete</button>
          </footer>
          <div class="an-del" v-if="poster && deleting">
            <label for="anDelReason" class="req">Why is it being deleted? (goes in the audit log)</label>
            <textarea class="input" id="anDelReason" v-model="deleting.reason" maxlength="500" placeholder="e.g. Posted to the wrong team"></textarea>
            <p class="help">It disappears for everyone, and its files are removed from Google Drive.</p>
            <div class="row-btns"><button class="btn" @click="deleting = null">Cancel</button><button class="btn btn-danger" :disabled="busy || !deleting.reason.trim()" @click="remove(open)">{{ busy ? 'Deleting…' : 'Delete announcement' }}</button></div>
          </div>
        </article>

        <div class="an-col" v-if="hasSide">
          <!-- Attachments: one row per file; photos show a small preview (fetched from Drive when opened) -->
          <section class="an-box" v-if="open.files.length">
            <div class="an-box-head"><h3>{{ `Attachments (${open.files.length})` }}</h3>
              <button type="button" class="btn btn-sm" v-if="open.files.length > 1" :disabled="!!downloading" @click="downloadAll(open)">{{ downloading === 'all' ? 'Downloading…' : 'Download all' }}</button></div>
            <div class="an-att row" v-for="f in photosOf(open)" :key="f.id">
              <button type="button" class="an-thumb" :aria-label="`View ${f.name}`" @click="view(f)">
                <img v-if="thumbs[f.id]" :src="thumbs[f.id]" :alt="f.name">
                <span v-else class="an-ext" :class="extClass(f)">{{ thumbErr[f.id] ? ext(f) : '…' }}</span>
              </button>
              <span class="an-att-info"><b :title="f.name">{{ f.name }}</b><small>{{ size(f.size) }}</small></span>
              <button type="button" class="ico-btn" title="View" aria-label="View" @click="view(f)"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg></button>
              <button type="button" class="ico-btn" title="Download" aria-label="Download" :disabled="!!downloading" @click="download(f)"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg></button>
            </div>
            <div class="an-att row" v-for="f in otherFilesOf(open)" :key="f.id">
              <span class="an-ext big" :class="extClass(f)">{{ ext(f) }}</span>
              <span class="an-att-info"><b :title="f.name">{{ f.name }}</b><small>{{ size(f.size) }}</small></span>
              <button type="button" class="ico-btn" v-if="viewable(f)" title="View" aria-label="View" @click="view(f)"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg></button>
              <button type="button" class="ico-btn" title="Download" aria-label="Download" :disabled="!!downloading" @click="download(f)"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg></button>
            </div>
          </section>

        <!-- Who has opened it: HR and Directors only -->
        <section class="an-side" v-if="poster">
          <h3 class="an-side-title">Who has viewed it</h3>
          <div class="notice error" v-show="viewsErr">{{ viewsErr }}</div>
          <div class="loading-bar" v-show="viewsLoading"></div>
          <template v-if="!viewsLoading">
            <div class="an-big"><b>{{ viewedCount }}</b><span>{{ `of ${audience.length} viewed` }}</span><em>{{ `${pctOf(viewedCount, audience.length)}%` }}</em></div>
            <div class="an-meter"><span :style="{ width: pctOf(viewedCount, audience.length) + '%' }"></span></div>
            <div class="an-remind">
              <button class="btn btn-sm" v-if="notViewed.length" :disabled="busy" @click="sendRemind(open)">{{ `Remind ${notViewed.length}` }}</button>
              <span class="help" v-if="open.remindedAt">{{ `Last reminded ${when(open.remindedAt, true)}` }}</span>
            </div>
            <div class="an-ptabs">
              <button type="button" class="pill-btn" :class="{ on: sideTab === 'not' }" @click="sideTab = 'not'">{{ `Not viewed yet ${notViewed.length}` }}</button>
              <button type="button" class="pill-btn" :class="{ on: sideTab === 'viewed' }" @click="sideTab = 'viewed'">{{ `Viewed ${views.length}` }}</button>
            </div>
            <ul class="an-people" v-if="sideTab === 'viewed'">
              <li v-for="v in views" :key="v.uid"><Avatar :uid="v.uid" :name="v.name" :role="v.role" :size="28" /><span class="an-pname">{{ v.name || 'Staff' }}<small>{{ `${audLabel(v.role)} · ${when(v.viewedAt, true)}` }}</small></span></li>
              <li class="muted" v-if="!views.length">Nobody has opened it yet.</li>
            </ul>
            <ul class="an-people" v-else>
              <li v-for="p in notViewed" :key="p.uid"><Avatar :uid="p.uid" :name="p.name" :role="p.role" :size="28" /><span class="an-pname">{{ p.name }}<small>{{ audLabel(p.role) }}</small></span></li>
              <li class="muted" v-if="!notViewed.length">Everyone it is for has opened it.</li>
            </ul>
            <p class="help an-side-note">Counts active staff in the teams it is for (including people who joined later), not the person who posted it.</p>
          </template>
        </section>
        </div>
      </div>
    </template>

    <!-- ===== List: tabs with counts, search, cards grouped Pinned / This week / This month / This year / Older ===== -->
    <template v-else>
      <div class="an-tools">
        <div class="an-tabs" role="tablist">
          <button type="button" class="pill-btn" v-for="t in FILTERS" :key="t.value" role="tab" :aria-selected="filter === t.value" :class="{ on: filter === t.value }" @click="filter = t.value">
            {{ t.label }} <span class="an-count" :class="{ hot: t.value === 'unread' && tabCount.unread }">{{ tabCount[t.value] }}</span></button>
        </div>
        <div class="search-box">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          <input class="input" type="search" v-model="q" placeholder="Search title, message or who posted" aria-label="Search announcements">
        </div>
      </div>
      <div class="loading-bar" v-show="loading"></div>

      <div class="an-empty" v-if="!loading && !shown.length">
        <span class="an-empty-ico" aria-hidden="true"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M15 9a3 3 0 0 1 0 6"/><path d="M18 6a7 7 0 0 1 0 12"/></svg></span>
        <b>{{ q.trim() ? `Nothing matches "${q.trim()}"` : filter === 'unread' ? 'Nothing unread' : filter === 'viewed' ? 'Nothing viewed yet' : 'No announcements yet' }}</b>
        <span class="muted">{{ q.trim() || filter !== 'all' ? 'Try another search or tab.' : poster ? 'Post the first one for your team.' : 'Announcements from HR will show here.' }}</span>
        <button class="btn btn-primary" v-if="poster && !q.trim() && filter === 'all'" @click="openNew()">+ Post announcement</button>
      </div>

      <section class="an-group" v-for="g in groups" :key="g.key" :class="'g-' + g.key">
        <h2 class="an-group-title">{{ g.label }}<span>{{ g.items.length }}</span></h2>
        <!-- Pinned and regular cards share one layout (5 Nov 2026); pinned ones get a themed strip with a pin and run full width -->
        <div class="an-grid">
          <button type="button" class="an-card" v-for="a in g.items" :key="a.id" :class="{ unread: unread(a), pinned: a.pinned }" @click="openItem(a)">
            <span class="an-card-head">
              <span class="an-pinmark" v-if="a.pinned"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>Pinned</span>
              <Avatar :uid="a.createdBy" :name="a.createdByName" :role="a.createdByRole" :size="22" />
              <span class="an-who">{{ `${a.createdByName || posterLabel(a)} · ${audLabel(a.createdByRole)}` }}</span>
              <span class="an-time" :title="when(a.createdAt, true)">{{ ago(a.createdAt) }}</span>
            </span>
            <span class="an-card-body">
            <span class="an-card-title"><span class="an-unread" v-if="unread(a)">Unread</span>{{ a.title }}</span>
            <span class="an-card-msg">{{ a.message }}</span>
            <span class="an-chips" v-if="a.files.length">
              <span class="an-chip" v-for="f in a.files.slice(0, 3)" :key="f.id"><span class="an-ext" :class="extClass(f)">{{ ext(f) }}</span><span class="an-chip-name">{{ f.name }}</span></span>
              <span class="an-chip more" v-if="a.files.length > 3">{{ `+${a.files.length - 3} more` }}</span>
            </span>
            <span class="an-card-foot">
              <span class="an-tags"><span class="an-tag" v-for="t in a.audience" :key="t">{{ audLabel(t) }}</span><span class="an-tag edited" v-if="a.editedAt">Edited</span></span>
              <span class="an-seen" v-if="poster && staff">
                <span class="an-seen-txt">{{ counts[a.id] == null ? 'Viewed …' : `Viewed ${counts[a.id]} of ${audienceOf(a, staff).length}` }}</span>
                <span class="an-meter small"><span :style="{ width: pctOf(counts[a.id] || 0, audienceOf(a, staff).length) + '%' }"></span></span>
              </span>
            </span>
            </span>
          </button>
        </div>
      </section>
    </template>

    <!-- ===== Post / edit (HR and Directors) ===== -->
    <div class="modal-back" v-if="form" @click.self="cancelForm()" v-esc="cancelForm">
      <form class="modal an-modal" role="dialog" :aria-label="form.id ? 'Edit announcement' : 'Post announcement'" @submit.prevent="save()">
        <h2 class="an-modal-title">{{ form.id ? 'Edit announcement' : 'Post announcement' }}</h2>
        <div class="notice error" v-show="form.error">{{ form.error }}</div>
        <FormField id="anTitle" label="Title" req v-model="form.title" :maxlength="TITLE_MAX" placeholder="e.g. Office closed on Friday" />
        <div class="field">
          <label for="anMsg" class="req">Message</label>
          <textarea class="input an-text" id="anMsg" ref="anMsg" v-model="form.message" :maxlength="MESSAGE_MAX" placeholder="Write the announcement" @input="grow($event.target)"></textarea>
        </div>
        <div class="field">
          <label class="req">Who it's for</label>
          <OptionPicker class="an-aud-pick" multiple :model-value="form.audience" :options="audOptions" label="Who it's for" placeholder="Pick who it's for" @update:model-value="setAud" />
        </div>
        <div class="field">
          <label>Photos and files <span class="muted">(saved to Google Drive, up to {{ MAX_FILES }}, 4 MB each; big photos are made smaller)</span></label>
          <ul class="an-files" v-if="form.files.length || form.newFiles.length">
            <li v-for="f in form.files" :key="f.id" :class="{ gone: form.removed.includes(f.id) }">
              <span class="an-ext" :class="extClass(f)">{{ ext(f) }}</span><span class="an-fname">{{ f.name }}</span><span class="muted">{{ size(f.size) }}</span>
              <button type="button" class="btn btn-sm" @click="toggleRemove(f)">{{ form.removed.includes(f.id) ? 'Keep' : 'Remove' }}</button>
            </li>
            <li v-for="(f, i) in form.newFiles" :key="'n' + i">
              <span class="an-ext" :class="extClass(f)">{{ ext(f) }}</span><span class="an-fname">{{ f.name }}</span><span class="muted">{{ `${size(f.size)} · new` }}</span>
              <button type="button" class="btn btn-sm" @click="form.newFiles.splice(i, 1)">Remove</button>
            </li>
          </ul>
          <label class="btn an-add" :class="{ off: busy || form.preparing || fileCount >= MAX_FILES }">{{ form.preparing ? 'Preparing…' : '+ Add photos or files' }}
            <input type="file" multiple hidden :disabled="busy || form.preparing || fileCount >= MAX_FILES" @change="addFiles"></label>
        </div>
        <label class="check"><input type="checkbox" v-model="form.pinned"><span>Pin to top<small>Stays above newer announcements until unpinned.</small></span></label>
        <p class="help" v-if="!form.id">Posting sends a notification to the teams it is for. Editing later sends nothing.</p>
        <div class="an-prog" v-if="busy && pct"><span :style="{ width: pct + '%' }"></span></div>
        <div class="an-modal-acts">
          <button type="button" class="btn" :disabled="busy" @click="cancelForm()">Cancel</button>
          <button type="submit" class="btn btn-primary" :disabled="busy || form.preparing">{{ busy ? (pct ? `Uploading ${pct}%` : 'Saving…') : form.id ? 'Save changes' : 'Post announcement' }}</button>
        </div>
      </form>
    </div>

    <FileViewer ref="viewer" />
  </main>
</template>

<script>
// /HR/announcements (5 Nov 2026). Everyone reads the announcements meant for them; HR and Directors post, edit, pin and
// delete (with a reason), and see who has opened each one. Data and Drive files: pages/HR/announcements.js.
// Redesign (5 Nov 2026): cards grouped Pinned / This week (since Monday) / This month / This year / Older, tabs with counts,
// HR sees "Viewed X of Y" on each card (one count read per card + the staff list once per visit).
// The opened announcement is kept in the page (not in the address), so opening one doesn't reload the page;
// ?id= is read once when the page opens (dashboard banner, notifications).
import { ROLE_LABEL, BUILTIN_ROLES, CUSTOM_ROLES } from '@/lib/firebase.js';
import { friendlyError } from '@/lib/finance-data.js';
import { askConfirm } from '@/lib/confirm.js';
import { downloadFile, fileBlob } from '@/lib/drive.js';
import { useSession } from '@/stores/session.js';
import FormField from '@/components/FormField.vue';
import OptionPicker from '@/components/OptionPicker.vue';
import Avatar from '@/components/Avatar.vue';
import FileViewer from '@/components/FileViewer.vue';
import { KIND, MAX_FILES, TITLE_MAX, MESSAGE_MAX, canPost, ms, audLabel, posterLabel, isUnread, byPinThenNew, loadFor, loadMyReads,
  markViewed, loadViews, countViews, loadActiveStaff, audienceOf, prepareFile, postAnnouncement, editAnnouncement, setPinned, deleteAnnouncement, remind } from './announcements.js';

const FILTERS = [{ value: 'all', label: 'All' }, { value: 'unread', label: 'Unread' }, { value: 'viewed', label: 'Viewed' }];
const GROUPS = [['pinned', 'Pinned'], ['week', 'This week'], ['month', 'This month'], ['year', 'This year'], ['older', 'Older']];
const day = (d, year = true) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}) });

export default {
  components: { FormField, OptionPicker, Avatar, FileViewer },
  data: () => ({ items: [], reads: {}, loading: true, error: '', okMsg: '', q: '', filter: 'all', openId: null,
    views: [], staff: null, counts: {}, thumbs: {}, thumbErr: {}, viewsLoading: false, viewsErr: '', sideTab: 'not', form: null, busy: false, pct: 0, deleting: null, downloading: '',
    FILTERS, MAX_FILES, TITLE_MAX, MESSAGE_MAX }),
  computed: {
    me() { return useSession(); },
    poster() { return canPost(this.me.role); },
    open() { return this.openId ? this.items.find(a => a.id === this.openId) || null : null; },
    hasSide() { return !!this.open && (this.poster || this.open.files.length > 0); },
    tabCount() {
      const u = this.items.filter(a => this.unread(a)).length;
      return { all: this.items.length, unread: u, viewed: this.items.length - u };
    },
    shown() {
      const t = this.q.trim().toLowerCase();
      return [...this.items].sort(byPinThenNew)
        .filter(a => this.filter === 'all' || (this.filter === 'unread') === this.unread(a))
        .filter(a => !t || [a.title, a.message, a.createdByName].some(x => String(x || '').toLowerCase().includes(t)));
    },
    // Pinned on top; the rest by when they were posted. Week starts on Monday. Empty groups are left out.
    groups() {
      const now = new Date(), mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
      const m1 = new Date(now.getFullYear(), now.getMonth(), 1), y1 = new Date(now.getFullYear(), 0, 1);
      const out = Object.fromEntries(GROUPS.map(([key, label]) => [key, { key, label, items: [] }]));
      for (const a of this.shown) {
        const t = ms(a.createdAt) || Date.now();
        out[a.pinned ? 'pinned' : t >= +mon ? 'week' : t >= +m1 ? 'month' : t >= +y1 ? 'year' : 'older'].items.push(a);
      }
      return GROUPS.map(([k]) => out[k]).filter(g => g.items.length);
    },
    // HR's panel
    audience() { return this.open && this.staff ? audienceOf(this.open, this.staff) : []; },
    viewedCount() { const seen = new Set(this.views.map(v => v.uid)); return this.audience.filter(p => seen.has(p.uid)).length; },
    notViewed() { const seen = new Set(this.views.map(v => v.uid)); return this.audience.filter(p => !seen.has(p.uid)).sort((a, b) => a.name.localeCompare(b.name)); },
    // Built-in roles plus active custom roles (a turned-off role stays listed if this announcement already uses it)
    audOptions() {
      const roles = [...BUILTIN_ROLES, ...Object.keys(CUSTOM_ROLES).filter(r => CUSTOM_ROLES[r].active || this.form?.audience.includes(r))];
      return [{ value: 'everyone', label: 'Everyone' }, ...roles.map(r => ({ value: r, label: ROLE_LABEL[r] || r }))];
    },
    fileCount() { return this.form ? this.form.files.length - this.form.removed.length + this.form.newFiles.length : 0; }
  },
  beforeUnmount() { this.dropThumbs(); },
  async mounted() {
    try {
      const [items, reads] = await Promise.all([loadFor(this.me), loadMyReads(this.me.user.uid)]);
      this.items = items; this.reads = reads;
      const id = this.$route.query.id;
      if (id) {
        const a = this.items.find(x => x.id === id);
        if (a) this.openItem(a); else this.error = 'That announcement was deleted, or it is not meant for your team.';
      }
    } catch (e) { this.error = friendlyError(e, 'load announcements'); }
    this.loading = false;
    if (this.poster) this.loadCounts();
  },
  methods: {
    audLabel, posterLabel, audienceOf,
    unread(a) { return isUnread(a, this.me, this.reads); },
    pctOf(n, of) { return of ? Math.min(100, Math.round((n / of) * 100)) : 0; },
    when(t, time = false) {
      const v = ms(t); if (!v) return 'just now';
      const d = new Date(v);
      return time ? `${day(d)}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : day(d);
    },
    // "5 min ago", "3 h ago", "Yesterday", "3 Nov", "12 Oct 2025"
    ago(t) {
      const v = ms(t); if (!v) return 'Just now';
      const mins = Math.floor((Date.now() - v) / 60000), d = new Date(v), now = new Date();
      if (mins < 1) return 'Just now';
      if (mins < 60) return `${mins} min ago`;
      if (mins < 24 * 60 && d.getDate() === now.getDate()) return `${Math.floor(mins / 60)} h ago`;
      const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      if (d.toDateString() === y.toDateString()) return 'Yesterday';
      return day(d, d.getFullYear() !== now.getFullYear());
    },
    ext(f) { const m = /\.([a-z0-9]{1,5})$/i.exec(f.name || ''); return m ? m[1].toUpperCase() : 'FILE'; },
    extClass(f) {
      const t = f.type || '', e = this.ext(f);
      return t.startsWith('image/') ? 'x-img' : t === 'application/pdf' || e === 'PDF' ? 'x-pdf' : t.startsWith('video/') ? 'x-vid'
        : /^(XLSX?|CSV)$/.test(e) ? 'x-xls' : /^DOCX?$/.test(e) ? 'x-doc' : '';
    },
    size(n) { return !n ? '' : n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`; },
    isPhoto(f) { return (f.type || '').startsWith('image/'); },
    photosOf(a) { return a.files.filter(f => this.isPhoto(f)); },
    otherFilesOf(a) { return a.files.filter(f => !this.isPhoto(f)); },
    viewable(f) { const t = f.type || ''; return t.startsWith('image/') || t.startsWith('video/') || t === 'application/pdf'; },

    // HR's list: the staff list once, then one count per announcement
    async loadCounts() {
      try {
        if (!this.staff) this.staff = await loadActiveStaff();
        const r = await Promise.allSettled(this.items.map(a => countViews(a.id)));
        this.counts = Object.fromEntries(this.items.map((a, i) => [a.id, r[i].status === 'fulfilled' ? r[i].value : null]));
      } catch (e) { console.warn('View counts not loaded:', e); }
    },
    async openItem(a) {
      this.okMsg = ''; this.error = ''; this.deleting = null; this.sideTab = 'not'; this.openId = a.id; window.scrollTo({ top: 0 });
      try { if (await markViewed(this.me, a, this.reads)) this.reads = { ...this.reads, [a.id]: new Date() }; }
      catch (e) { console.warn('Viewed not recorded:', e); }
      if (this.poster) this.loadPanel(a);
      this.loadThumbs(a);
    },
    close() { this.openId = null; this.deleting = null; this.views = []; this.dropThumbs(); },
    // Photo previews: each photo is fetched from Drive (through api/drive.js) when the announcement is opened. No Firestore reads.
    async loadThumbs(a) {
      this.dropThumbs();
      for (const f of this.photosOf(a)) {
        try { const u = await fileBlob(KIND, f.id); if (this.openId === a.id) this.thumbs = { ...this.thumbs, [f.id]: u }; else URL.revokeObjectURL(u); }
        catch (e) { this.thumbErr = { ...this.thumbErr, [f.id]: true }; console.warn('Preview not loaded:', e); }
      }
    },
    dropThumbs() { Object.values(this.thumbs).forEach(u => URL.revokeObjectURL(u)); this.thumbs = {}; this.thumbErr = {}; },
    async downloadAll(a) {
      this.downloading = 'all'; this.error = '';
      try { for (const f of a.files) { await downloadFile(KIND, f.id, f.name); await new Promise(r => setTimeout(r, 400)); } }
      catch (e) { this.error = e.message; }
      this.downloading = '';
    },
    async loadPanel(a) {
      this.viewsLoading = true; this.viewsErr = '';
      try {
        const [views, staff] = await Promise.all([loadViews(a.id), this.staff ? this.staff : loadActiveStaff()]);
        if (this.openId !== a.id) return;
        this.views = views; this.staff = staff;
        this.counts = { ...this.counts, [a.id]: views.length };
      } catch (e) { this.viewsErr = friendlyError(e, 'load who has viewed it'); }
      this.viewsLoading = false;
    },
    view(f) { this.$refs.viewer.open({ id: f.id, name: f.name, kind: KIND, download: true }); },
    async download(f) {
      this.downloading = f.id; this.error = '';
      try { await downloadFile(KIND, f.id, f.name); } catch (e) { this.error = e.message; }
      this.downloading = '';
    },

    // ---- Post / edit ----
    openNew() { this.okMsg = ''; this.form = { id: null, title: '', message: '', audience: ['everyone'], pinned: false, files: [], removed: [], newFiles: [], preparing: false, error: '' }; },
    // 5 Nov 2026: the message box grows with the text (up to about 20 lines, then scrolls)
    grow(el) {
      if (!el) return;
      el.style.height = 'auto';
      const h = el.scrollHeight + 2;
      el.style.height = Math.min(Math.max(h, 160), 460) + 'px';
      el.style.overflowY = h > 460 ? 'auto' : 'hidden';
    },
    openEdit(a) { this.okMsg = ''; this.form = { id: a.id, title: a.title, message: a.message, audience: [...(a.audience || ['everyone'])], pinned: !!a.pinned, files: [...a.files], removed: [], newFiles: [], preparing: false, error: '' }; this.$nextTick(() => this.grow(this.$refs.anMsg)); },
    cancelForm() { if (!this.busy) this.form = null; },
    // Everyone and single teams don't mix: ticking Everyone clears the teams, ticking a team clears Everyone
    setAud(next) {
      const f = this.form, had = f.audience.includes('everyone');
      if (next.includes('everyone') && !had) f.audience = ['everyone'];
      else f.audience = next.filter(x => x !== 'everyone');
    },
    toggleRemove(f) { const r = this.form.removed; this.form.removed = r.includes(f.id) ? r.filter(x => x !== f.id) : [...r, f.id]; },
    async addFiles(e) {
      const list = [...e.target.files]; e.target.value = '';
      const f = this.form; f.error = ''; f.preparing = true;
      const errs = [];
      for (const file of list) {
        if (this.fileCount >= MAX_FILES) { errs.push(`Only ${MAX_FILES} files per announcement.`); break; }
        try { f.newFiles.push(await prepareFile(file)); } catch (err) { errs.push(err.message); }
      }
      f.preparing = false; f.error = errs.join(' ');
    },
    async save() {
      const f = this.form; f.error = '';
      if (!f.title.trim()) return f.error = 'Add a title.';
      if (!f.message.trim()) return f.error = 'Write the message.';
      if (!f.audience.length) return f.error = "Pick who it's for, or Everyone.";
      this.busy = true; this.pct = 0;
      const prog = p => { this.pct = Math.round(p * 100); };
      try {
        if (f.id) {
          const a = this.items.find(x => x.id === f.id);
          const next = await editAnnouncement(this.me, a, f, prog);
          this.items = this.items.map(x => (x.id === a.id ? next : x));
          this.okMsg = 'Announcement saved.';
        } else {
          const a = await postAnnouncement(this.me, f, prog);
          this.items = [a, ...this.items];
          this.counts = { ...this.counts, [a.id]: 0 };
          this.okMsg = 'Announcement posted. The teams it is for got a notification.';
        }
        this.form = null;
      } catch (e) { f.error = friendlyError(e, 'save the announcement'); }
      this.busy = false; this.pct = 0;
    },
    async togglePin(a) {
      this.busy = true; this.error = '';
      try { await setPinned(this.me, a, !a.pinned); a.pinned = !a.pinned; this.okMsg = a.pinned ? 'Pinned to the top.' : 'Unpinned.'; }
      catch (e) { this.error = friendlyError(e, 'change the pin'); }
      this.busy = false;
    },
    async remove(a) {
      this.busy = true; this.error = '';
      try {
        await deleteAnnouncement(this.me, a, this.deleting.reason);
        this.items = this.items.filter(x => x.id !== a.id);
        this.close(); this.okMsg = 'Announcement deleted.';
      } catch (e) { this.error = friendlyError(e, 'delete the announcement'); }
      this.busy = false;
    },
    async sendRemind(a) {
      const people = this.notViewed;
      if (!await askConfirm({ title: `Remind ${people.length} ${people.length === 1 ? 'person' : 'people'}?`, message: 'Each person who has not opened it yet gets a notification.', confirmText: 'Send reminder' })) return;
      this.busy = true; this.error = '';
      try { const n = await remind(this.me, a, people); a.remindedAt = new Date(); this.okMsg = `Reminder sent to ${n} ${n === 1 ? 'person' : 'people'}.`; }
      catch (e) { this.error = friendlyError(e, 'send the reminder'); }
      this.busy = false;
    }
  }
};
</script>

<style scoped>
/* ---- List ---- */
.an-tools { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; justify-content: space-between; margin-bottom: 20px; }
.an-tabs { display: flex; gap: 6px; flex-wrap: wrap; }
.an-count { display: inline-block; min-width: 20px; margin-left: 4px; padding: 0 6px; border-radius: 999px; background: var(--chip); color: var(--text-2); font-size: 11px; font-weight: 700; line-height: 18px; text-align: center; }
.pill-btn.on .an-count { background: rgba(255,255,255,.25); color: inherit; }
.an-count.hot { background: var(--accent); color: #fff; }
.search-box { position: relative; flex: 0 1 380px; min-width: 220px; }
.search-box svg { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--muted); pointer-events: none; }
.search-box .input { width: 100%; padding-left: 36px; background: var(--surface); }
@media (max-width: 600px) { .search-box { flex: 1 1 100%; } }

.an-group { margin-bottom: 26px; }
.an-group-title { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); margin: 0 0 10px; }
.an-group-title span { font-size: 11px; font-weight: 700; letter-spacing: 0; padding: 0 7px; border-radius: 999px; background: var(--chip); color: var(--text-2); line-height: 18px; }
.an-group-title::after { content: ""; flex: 1; height: 1px; background: var(--border); }
.g-pinned .an-group-title { color: var(--accent); }
.an-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 14px; }
@media (max-width: 600px) { .an-grid { grid-template-columns: 1fr; } }
/* Pinned: same card, full width, themed strip with a pin */
.g-pinned .an-grid { grid-template-columns: 1fr; }
.an-pinmark { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 700; color: var(--accent); padding-right: 8px; margin-right: 2px; border-right: 1px solid color-mix(in srgb, var(--accent) 30%, transparent); }
.an-pinmark svg { transform: rotate(35deg); }
.an-seen.inline { flex-direction: row; align-items: center; gap: 8px; min-width: 0; }

.an-card { display: flex; flex-direction: column; gap: 10px; width: 100%; text-align: left; font: inherit; color: inherit; cursor: pointer; position: relative; overflow: hidden;
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px 18px; transition: border-color .15s, transform .15s, box-shadow .15s; }
.an-card:hover { border-color: color-mix(in srgb, var(--accent) 50%, var(--border)); transform: translateY(-1px); box-shadow: 0 6px 18px rgba(0,0,0,.06); }
.an-card.pinned { border-color: color-mix(in srgb, var(--accent) 35%, var(--border)); }
.an-card.pinned .an-card-head { background: var(--accent-soft); border-bottom-color: color-mix(in srgb, var(--accent) 20%, var(--line)); }
.an-card.pinned .an-who { color: var(--text); }
/* Option 5 (5 Nov): grey strip on top with who and when, the content below */
.an-card { padding: 0; gap: 0; }
.an-card-head { display: flex; align-items: center; gap: 8px; padding: 8px 16px; background: var(--hover); border-bottom: 1px solid var(--line); }
.an-who { flex: 1; min-width: 0; font-size: 12px; font-weight: 600; color: var(--text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.an-card-body { flex: 1; display: flex; flex-direction: column; gap: 8px; padding: 12px 16px 14px; }
.an-time { font-size: 12px; color: var(--muted); white-space: nowrap; }
.an-card-title { font-size: 16px; font-weight: 700; line-height: 1.3; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.an-card:not(.unread) .an-card-title { font-weight: 600; }
.an-unread { font-size: 10px; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; padding: 2px 7px; border-radius: 999px; background: var(--accent); color: #fff; }
.an-card-msg { color: var(--text-2); font-size: 13px; line-height: 1.5; white-space: pre-line; display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.an-chips { display: flex; gap: 6px; flex-wrap: wrap; }
.an-chip { display: inline-flex; align-items: center; gap: 6px; max-width: 200px; padding: 3px 8px 3px 3px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); font-size: 12px; }
.an-chip-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.an-chip.more { padding: 3px 8px; color: var(--muted); }
.an-card-foot { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: auto; padding-top: 4px; }
.an-tags { display: flex; gap: 6px; flex-wrap: wrap; }
.an-tag { font-size: 11px; padding: 2px 8px; border-radius: 999px; background: var(--chip); color: var(--text-2); }
.an-tag.edited { background: none; border: 1px dashed var(--border); color: var(--muted); }
.an-seen { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; min-width: 110px; }
.an-seen-txt { font-size: 12px; font-weight: 600; color: var(--text-2); }

.an-meter { display: block; height: 8px; border-radius: 8px; background: var(--line); overflow: hidden; }
.an-meter span { display: block; height: 100%; border-radius: 8px; background: var(--accent); transition: width .3s; }
.an-meter.small { width: 110px; height: 5px; }

.an-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center; padding: 48px 20px; border: 1.5px dashed var(--border); border-radius: var(--radius); background: var(--surface); }
.an-empty-ico { width: 52px; height: 52px; border-radius: 50%; display: grid; place-items: center; background: var(--accent-soft); color: var(--accent); margin-bottom: 4px; }
.an-empty .btn { margin-top: 8px; }

/* File type badges */
.an-ext { flex: none; min-width: 36px; text-align: center; font-size: 10px; font-weight: 800; letter-spacing: .04em; padding: 4px 6px; border-radius: 6px; background: var(--chip); color: var(--text-2); }
.an-ext.x-img { background: var(--blue-soft); color: var(--blue); }
.an-ext.x-pdf { background: var(--red-soft); color: var(--red); }
.an-ext.x-vid { background: var(--amber-soft); color: var(--amber); }
.an-ext.x-xls { background: var(--green-soft); color: var(--green); }
.an-ext.x-doc { background: var(--accent-soft); color: var(--accent); }
.an-ext.big { min-width: 0; width: 46px; height: 46px; display: grid; place-items: center; font-size: 11px; border-radius: 10px; }

/* ---- One announcement ---- */
.an-back { background: none; border: 0; color: var(--accent); font: inherit; font-weight: 600; cursor: pointer; padding: 0; margin-bottom: 14px; }
.an-detail { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 20px; align-items: start; max-width: 1240px; }
.an-detail.solo { grid-template-columns: minmax(0, 1fr); max-width: 860px; }
@media (max-width: 1000px) { .an-detail { grid-template-columns: minmax(0, 1fr); } }
.an-open { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; min-width: 0; }
.an-open.pinned { border-color: color-mix(in srgb, var(--accent) 35%, var(--border)); }
.an-open-head { display: flex; align-items: center; gap: 10px; padding: 10px 28px; background: var(--hover); border-bottom: 1px solid var(--line); }
.an-open.pinned .an-open-head { background: var(--accent-soft); border-bottom-color: color-mix(in srgb, var(--accent) 20%, var(--line)); }
.an-open-head .an-who { font-size: 13px; color: var(--text); }
.an-body { padding: 22px 28px 20px; }
.an-open-title { font-size: 24px; line-height: 1.25; letter-spacing: -.01em; margin: 0 0 10px; overflow-wrap: anywhere; }
.an-msg { white-space: pre-wrap; font-size: 15px; line-height: 1.75; overflow-wrap: anywhere; margin-top: 18px; }
.btn-sm { height: 30px; padding: 0 10px; font-size: 12px; }
.an-foot { display: flex; gap: 6px; justify-content: flex-end; padding: 14px 28px 18px; border-top: 1px solid var(--border); }
.an-del { margin: 0 28px 20px; padding-top: 14px; border-top: 1px solid var(--border); display: grid; gap: 6px; }
.an-del textarea { min-height: 70px; }
.row-btns { display: flex; justify-content: flex-end; gap: 8px; }
@media (max-width: 600px) { .an-open-head, .an-body, .an-foot { padding-left: 18px; padding-right: 18px; } .an-del { margin-left: 18px; margin-right: 18px; } }

/* Right column: attachments, then HR's panel */
.an-col { display: flex; flex-direction: column; gap: 16px; position: sticky; top: 16px; min-width: 0; }
@media (max-width: 1000px) { .an-col { position: static; } }
.an-box { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; display: flex; flex-direction: column; gap: 10px; }
.an-box-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.an-box-head h3 { font-size: 15px; margin: 0; }
.an-thumb { flex: none; width: 44px; height: 44px; padding: 0; border: 0; border-radius: 8px; overflow: hidden; background: var(--hover); display: grid; place-items: center; cursor: zoom-in; }
.an-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.an-att { display: flex; align-items: center; gap: 8px; padding: 8px 10px; }
.an-att.row { border: 1px solid var(--line); border-radius: 12px; }
.an-att .an-ext.big { width: 40px; height: 40px; }
.an-att-info { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.3; }
.an-att-info b { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.an-att-info small { font-size: 11px; color: var(--muted); }
.ico-btn { flex: none; width: 32px; height: 32px; display: grid; place-items: center; border-radius: 8px; border: 1px solid var(--border); background: var(--surface); color: var(--accent); cursor: pointer; }
.ico-btn:disabled { opacity: .5; cursor: default; }
@media (hover: hover) { .ico-btn:hover:not(:disabled) { background: var(--accent-soft); border-color: var(--accent); } }

/* HR's side panel */
.an-side { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; }
.an-side-title { font-size: 15px; margin: 0 0 12px; }
.an-big { display: flex; align-items: baseline; gap: 8px; margin-bottom: 8px; }
.an-big b { font-size: 34px; line-height: 1; }
.an-big span { color: var(--text-2); font-size: 13px; }
.an-big em { margin-left: auto; font-style: normal; font-weight: 700; color: var(--accent); }
.an-remind { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin: 12px 0 14px; }
.an-ptabs { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
.an-people { list-style: none; margin: 0; padding: 0; max-height: 380px; overflow-y: auto; }
.an-people li { display: flex; align-items: center; gap: 10px; padding: 7px 0; border-bottom: 1px solid var(--line); font-size: 13px; }
.an-pname { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.an-pname small { color: var(--muted); font-size: 11px; }
.an-side-note { margin: 12px 0 0; }

/* ---- Form ---- */
.an-modal { max-width: 640px; }
.an-modal-title { margin: 0 0 14px; font-size: 18px; }
.an-text { min-height: 160px; resize: none; overflow-y: hidden; }
.an-aud-pick { display: block; }
.an-aud-pick :deep(.op-btn) { width: 100%; }
.an-aud-pick :deep(.op-val) { max-width: none; display: block; }
.an-files { list-style: none; margin: 0 0 8px; padding: 0; }
.an-files li { display: flex; align-items: center; gap: 10px; padding: 8px 10px; margin-bottom: 6px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); font-size: 13px; }
.an-files li.gone { opacity: .5; }
.an-files li.gone .an-fname { text-decoration: line-through; }
.an-fname { flex: 1; overflow-wrap: anywhere; }
.an-add.off { opacity: .6; pointer-events: none; }
.check { display: flex; gap: 10px; align-items: flex-start; margin: 14px 0; font-size: 13px; }
.check input { width: 16px; height: 16px; accent-color: var(--accent); margin-top: 2px; }
.check small { display: block; color: var(--muted); font-size: 12px; }
.an-prog { height: 4px; border-radius: 4px; background: var(--line); margin-top: 8px; overflow: hidden; }
.an-prog span { display: block; height: 100%; background: var(--accent); transition: width .2s; }
.an-modal-acts { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }
</style>
