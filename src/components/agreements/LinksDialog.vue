<template>
  <div class="drawer-back" @click="emit('close')"></div>
  <aside class="drawer wide lk" role="dialog" aria-label="Fill-in links" @keydown.esc="emit('close')">
    <div class="drawer-head">
      <h2>{{ record ? 'Send to fill in & sign' : 'Fill-in links' }} <small>· {{ record ? record.title : form.name }}</small></h2>
      <button class="icon-btn" aria-label="Close" @click="emit('close')">×</button>
    </div>

    <div class="drawer-body">
      <div class="notice error" v-if="error">{{ error }}</div>

      <!-- Just created: what to send -->
      <div class="lk-done" v-if="created">
        <b>Link ready.</b> Send the link and password to {{ created.kind === 'personal' ? 'the person' : 'the people' }} who should fill it in.
        <div class="lk-share">
          <code>{{ linkUrl(created.slug) }}</code>
          <span>Password: <code>{{ created.password }}</code></span>
        </div>
        <div class="ag-bar">
          <button class="btn btn-sm btn-primary" @click="copy(shareText(created), 'Message copied')">Copy message with link & password</button>
          <button class="btn btn-sm" @click="copy(linkUrl(created.slug), 'Link copied')">Copy link only</button>
          <a class="btn btn-sm" :href="whatsapp(created)" target="_blank" rel="noopener">Send by WhatsApp</a>
        </div>
        <p class="help">The password is not shown again. You can set a new one with Edit.</p>
      </div>

      <!-- New / edit -->
      <form v-if="edit" class="card lk-form" @submit.prevent="save">
        <h3>{{ edit.isNew ? (edit.kind === 'personal' ? 'New personal link' : 'New link for anyone') : 'Edit ' + edit.slug }}</h3>
        <p class="help" v-if="edit.isNew && edit.kind === 'open'">Everyone who opens this link (and knows the password) fills in a new, blank form.</p>
        <p class="help" v-if="edit.isNew && edit.kind === 'personal'">Only for this record: the person checks what you filled in, completes the rest and signs.</p>
        <div class="field">
          <label for="lkSlug">Link name</label>
          <div class="lk-slug"><span>{{ origin }}/f/</span><input id="lkSlug" class="input" v-model="edit.slug" :disabled="!edit.isNew" @input="edit.slug = slugify(edit.slug); slugMsg = ''" @blur="checkSlug" required maxlength="60"></div>
          <span class="ag-error" v-if="slugMsg">{{ slugMsg }}</span>
          <span class="help" v-else-if="edit.isNew">Small letters, numbers and dashes, e.g. <code>widebed-tenancy</code>. It can't be changed later.</span>
        </div>
        <div class="field"><label for="lkTitle">Title on the form</label><input id="lkTitle" class="input" v-model="edit.title" maxlength="120" required></div>
        <div class="field"><label for="lkIntro">Message at the top (optional)</label><textarea id="lkIntro" class="input" rows="3" v-model="edit.intro" maxlength="1000" placeholder="e.g. Please fill in your details and sign. It takes about 5 minutes."></textarea></div>
        <div class="field">
          <label for="lkTpl">PDF they can download</label>
          <select id="lkTpl" class="input select" v-model="edit.templateId">
            <option value="">No PDF (just send the answers)</option>
            <option v-for="t in templates" :key="t.id" :value="t.id">{{ t.name }}</option>
          </select>
        </div>
        <div class="ag-row2">
          <div class="field">
            <label for="lkPass">{{ edit.isNew ? 'Password' : 'New password (leave empty to keep)' }}</label>
            <div class="ag-inline"><input id="lkPass" class="input" v-model="edit.password" :required="edit.isNew" minlength="4" autocomplete="new-password"><button type="button" class="btn btn-sm" @click="edit.password = makePassword()">Make one</button></div>
          </div>
          <div class="field"><label for="lkExp">Closes after (optional)</label><input id="lkExp" class="input" type="date" v-model="edit.expiresAt"></div>
        </div>
        <label class="ag-check-row" v-if="edit.kind === 'personal'"><input type="checkbox" v-model="edit.lockFilled"> Answers you already filled in can't be changed by them</label>
        <label class="ag-check-row"><input type="checkbox" v-model="edit.allowDownload"> They can download their copy after submitting</label>
        <div class="modal-foot">
          <button type="button" class="btn" @click="edit = null">Cancel</button>
          <button type="submit" class="btn btn-primary" :disabled="busy">{{ busy ? 'Saving…' : edit.isNew ? 'Create link' : 'Save' }}</button>
        </div>
      </form>

      <div class="ag-bar lk-new" v-if="!edit">
        <button v-if="record" class="btn btn-primary" @click="startNew('personal')">+ New link for this record</button>
        <button v-else-if="isAdmin" class="btn btn-primary" @click="startNew('open')">+ New link for anyone</button>
        <span class="note" v-if="!record">Personal links for one record are made from the record (Send to fill in & sign).</span>
      </div>

      <div class="table-wrap" v-if="shown.length">
        <table class="table">
          <thead><tr><th>Link</th><th>Type</th><th>Status</th><th class="num">Sent in</th><th>Closes</th><th></th></tr></thead>
          <tbody>
            <tr v-for="l in shown" :key="l.slug">
              <td><b>{{ l.title }}</b><br><small class="muted">/f/{{ l.slug }}</small></td>
              <td>{{ l.kind === 'personal' ? 'Personal' : 'Anyone' }}</td>
              <td><span class="pill" :class="linkState(l).pill">{{ linkState(l).label }}</span></td>
              <td class="num">{{ l.submissions || 0 }}</td>
              <td class="muted">{{ l.expiresAt || '—' }}</td>
              <td class="lk-acts">
                <button class="act-pill" @click="copy(linkUrl(l.slug), 'Link copied')">Copy link</button>
                <button class="act-pill" @click="startEdit(l)">Edit</button>
                <button class="act-pill" :class="l.active === false ? 'good' : 'danger'" @click="toggle(l)">{{ l.active === false ? 'Turn on' : 'Turn off' }}</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="empty" v-else-if="!loading">No links yet.</p>
      <p class="notice ok lk-toast" v-if="toast">{{ toast }}</p>
    </div>
  </aside>
</template>

<script setup>
// Fill-in links for outside people. "Anyone" links (one per form, Agreement Setup) and personal links (one record).
import { ref, computed, onMounted } from 'vue';
import { listLinks, getLink, createLink, saveLink } from '@/lib/agreements/data.js';
import { slugify, SLUG_OK, linkUrl, hashPassword, makePassword, linkState } from '@/lib/agreements/links.js';

const props = defineProps({
  form: { type: Object, required: true },
  templates: { type: Array, default: () => [] },
  record: { type: Object, default: null },   // { id, title } for a personal link
  isAdmin: Boolean
});
const emit = defineEmits(['close']);
const origin = window.location.origin;
const links = ref([]), loading = ref(true), busy = ref(false), error = ref(''), edit = ref(null), created = ref(null), slugMsg = ref(''), toast = ref('');
const shown = computed(() => (props.record ? links.value.filter(l => l.recordId === props.record.id) : links.value));

onMounted(async () => {
  try { links.value = await listLinks(props.form.id); } catch (e) { error.value = 'Could not load the links: ' + e.message; }
  loading.value = false;
  if (props.record && !shown.value.length) startNew('personal');
});

function startNew(kind) {
  created.value = null;
  const base = slugify(kind === 'personal' ? `${props.record.title}-${props.form.name}` : props.form.name);
  edit.value = { isNew: true, kind, slug: base.length >= 3 ? base : base + '-form', title: props.form.name, intro: '', templateId: props.templates[0]?.id || '',
    password: makePassword(), expiresAt: '', lockFilled: true, allowDownload: true };
}
function startEdit(l) {
  created.value = null;
  edit.value = { isNew: false, kind: l.kind, slug: l.slug, title: l.title, intro: l.intro || '', templateId: l.templateId || '', password: '',
    expiresAt: l.expiresAt || '', lockFilled: !!l.lockFilled, allowDownload: l.allowDownload !== false };
}
async function checkSlug() {
  const s = edit.value?.slug;
  if (!edit.value?.isNew || !s) return true;
  if (!SLUG_OK.test(s)) { slugMsg.value = 'Use 3 to 60 small letters, numbers or dashes.'; return false; }
  try { if (await getLink(s)) { slugMsg.value = 'This link name is already used. Try another.'; return false; } } catch (_) {}
  return true;
}
async function save() {
  const e = edit.value;
  error.value = '';
  if (!(await checkSlug())) return;
  if (e.password && e.password.length < 4) { error.value = 'Use a password of at least 4 characters.'; return; }
  busy.value = true;
  try {
    const data = { title: e.title.trim(), intro: e.intro.trim(), templateId: e.templateId, expiresAt: e.expiresAt, lockFilled: e.lockFilled, allowDownload: e.allowDownload };
    if (e.password) Object.assign(data, await hashPassword(e.password));
    if (e.isNew) {
      await createLink(e.slug, { ...data, kind: e.kind, formId: props.form.id, ...(e.kind === 'personal' ? { recordId: props.record.id } : {}) });
      created.value = { slug: e.slug, password: e.password, kind: e.kind, title: data.title };
    } else {
      await saveLink(e.slug, data);
      toast.value = e.password ? 'Saved. Send the new password to the people using this link.' : 'Saved.';
    }
    links.value = await listLinks(props.form.id);
    edit.value = null;
  } catch (err) { error.value = err.code === 'permission-denied' ? 'You don\'t have permission to change this link.' : 'Could not save: ' + err.message; }
  busy.value = false;
}
async function toggle(l) {
  try { await saveLink(l.slug, { active: l.active === false }); l.active = l.active === false; }
  catch (e) { error.value = 'Could not change the link: ' + e.message; }
}

const shareText = c => `Hi, please fill in and sign "${c.title}" here:\n${linkUrl(c.slug)}\nPassword: ${c.password}\n\nThank you,\nWidebed`;
const whatsapp = c => 'https://wa.me/?text=' + encodeURIComponent(shareText(c));
async function copy(text, msg) {
  try { await navigator.clipboard.writeText(text); toast.value = msg; } catch (_) { toast.value = 'Copy did not work. Select the text and copy it.'; }
  setTimeout(() => { toast.value = ''; }, 2500);
}
</script>

<style scoped>
.lk .drawer-head small { color: var(--muted); font-weight: 500; font-size: 14px; }
.lk-done { background: var(--green-soft); border: 1px solid color-mix(in srgb, var(--green) 30%, transparent); border-radius: 12px; padding: 14px 16px; margin-bottom: 16px; display: grid; gap: 10px; }
.lk-share { display: grid; gap: 4px; font-size: 13px; }
.lk-share code { background: var(--surface); padding: 4px 8px; border-radius: 6px; font-size: 13px; overflow-wrap: anywhere; }
.lk-form { margin-bottom: 16px; }
.lk-form h3 { margin: 0 0 4px; font-size: 15px; }
.lk-slug { display: flex; align-items: center; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; background: var(--surface); }
.lk-slug span { padding: 0 8px 0 12px; color: var(--muted); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 45%; }
.lk-slug .input { border: 0; border-radius: 0; padding-left: 0; }
.lk-new { margin-bottom: 12px; }
.lk-acts { display: flex; gap: 6px; justify-content: flex-end; flex-wrap: wrap; }
.lk-toast { position: sticky; bottom: 0; margin-top: 12px; }
code { font-size: 12px; }
</style>
