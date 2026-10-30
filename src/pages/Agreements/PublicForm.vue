<template>
  <div class="pub">
    <header class="pub-top">
      <div class="pub-brand"><span class="brand-mark">W</span><span><b>Widebed</b><small>Agreements</small></span></div>
      <span class="pub-secure" title="Your answers are sent securely">🔒 Secure form</span>
    </header>

    <main class="pub-main">
      <!-- Loading -->
      <div v-if="stage === 'loading'" class="pub-center"><div class="pub-spin" aria-label="Loading"></div></div>

      <!-- Link not valid / closed -->
      <div v-else-if="stage === 'error'" class="card pub-card pub-msg">
        <div class="pub-emoji" aria-hidden="true">🔗</div>
        <h1>{{ errorTitle }}</h1>
        <p>{{ error }}</p>
        <p class="pub-small">If you think this is a mistake, please contact the Widebed team who sent you this link.</p>
      </div>

      <!-- Password -->
      <form v-else-if="stage === 'password'" class="card pub-card pub-pass" @submit.prevent="unlock">
        <div class="pub-emoji" aria-hidden="true">🔐</div>
        <h1>{{ info.title || 'Agreement form' }}</h1>
        <p>{{ info.submitted ? 'This form was already submitted. Enter the password to download your copy.' : 'Enter the password Widebed gave you to open this form.' }}</p>
        <div class="notice error" v-if="error">{{ error }}</div>
        <div class="field">
          <label for="pubPass">Password</label>
          <div class="pw">
            <input id="pubPass" ref="passBox" class="input" :type="showPass ? 'text' : 'password'" v-model="password" autocomplete="off" required>
            <button type="button" @click="showPass = !showPass">{{ showPass ? 'Hide' : 'Show' }}</button>
          </div>
        </div>
        <button class="btn btn-primary pub-wide" :disabled="busy || !password">{{ busy ? 'Opening…' : 'Open form' }}</button>
      </form>

      <!-- Already submitted (personal link) -->
      <ThankYou v-else-if="stage === 'already'" title="Already submitted" :message="'You have already sent this form. Thank you!'">
        <button v-if="already.hasResult" class="btn btn-primary" :disabled="busy" @click="downloadOld">{{ busy ? 'Preparing…' : 'Download your copy (PDF)' }}</button>
      </ThankYou>

      <!-- The form -->
      <template v-else-if="stage === 'form'">
        <div class="notice error pub-err" v-if="error">{{ error }}</div>
        <FillWizard v-model="values" :fields="data.fields" :title="data.title" :intro="data.intro" :uploader="upload" :locked="locked" :busy="busy"
          consent="I confirm the information I gave is true and complete, and I agree to sign this agreement electronically."
          submit-label="Submit and sign" @submit="send" />
      </template>

      <!-- Thank you -->
      <ThankYou v-else-if="stage === 'thanks'" :title="`Thank you${firstName ? ', ' + firstName : ''}!`" :reference="receipt.reference"
        message="We have received your agreement. The Widebed team will check it and get in touch if anything else is needed."
        :note="canDownload ? 'Keep a copy for your records. You can close this page when you are done.' : 'You can close this page now.'">
        <button v-if="canDownload" class="btn btn-primary" :disabled="busy" @click="downloadCopy">{{ busy ? 'Preparing your PDF…' : 'Download your copy (PDF)' }}</button>
      </ThankYou>
      <p class="notice error pub-err" v-if="stage === 'thanks' && error">{{ error }}</p>
    </main>
    <footer class="pub-foot">© {{ new Date().getFullYear() }} Widebed · This form is private. Please don't share the link or password.</footer>
  </div>
</template>

<script setup>
// The public fill-in page: /f/<link name>. No sign-in; each link has a password set by staff.
// Open links make a new record per visitor; personal links fill in one record that staff prepared.
import { ref, computed, onMounted, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import FillWizard from '@/components/agreements/FillWizard.vue';
import ThankYou from '@/components/agreements/ThankYou.vue';
import { linkInfo, openLink, linkTemplateBytes, linkUpload, submitLink, savePdf, linkResult } from '@/lib/agreements/public.js';
import { computeValues, todayISO } from '@/lib/agreements/formula.js';
import { defaultValues, hasValue } from '@/lib/agreements/fields.js';
import { fillPdf } from '@/lib/agreements/pdf.js';
import { downloadBytes, safeFileName } from '@/lib/agreements/bytes.js';
import './agreements.css';

const route = useRoute();
const slug = String(route.params.slug || '').toLowerCase();
const stage = ref('loading'), error = ref(''), errorTitle = ref('This link can\'t be opened'), busy = ref(false);
const info = ref({}), data = ref(null), values = ref({}), password = ref(''), showPass = ref(false), passBox = ref(null);
const receipt = ref({}), already = ref({}), pdf = ref(null);

const locked = computed(() => (data.value?.lockFilled ? Object.keys(data.value.values || {}).filter(k => {
  const v = data.value.values[k]; return v !== '' && v !== null && v !== undefined && v !== false;
}) : []));
const canDownload = computed(() => !!data.value?.template && data.value.allowDownload !== false);
const firstName = computed(() => String(receipt.value.title || '').split(/\s+/)[0].replace(/^./, c => c.toUpperCase()));

onMounted(async () => {
  document.title = 'Agreement form · Widebed';
  try {
    info.value = await linkInfo(slug);
    if (info.value.closed) { errorTitle.value = 'This form is closed'; error.value = info.value.closed; stage.value = 'error'; return; }
    stage.value = 'password';
    await nextTick(); passBox.value?.focus();
  } catch (e) { error.value = e.message; stage.value = 'error'; }
});

async function unlock() {
  busy.value = true; error.value = '';
  try {
    const r = await openLink(slug, password.value);
    if (r.submitted) { already.value = r; stage.value = 'already'; }
    else {
      data.value = r;
      const usable = r.fields.filter(f => hasValue(f) && f.type !== 'formula');
      values.value = { ...defaultValues(usable), ...r.values };
      stage.value = 'form';
      document.title = (r.title || 'Agreement form') + ' · Widebed';
    }
  } catch (e) { error.value = e.message; }
  busy.value = false;
}

const upload = (bytes, name, mime) => linkUpload(slug, password.value, bytes, name, mime);

async function send() {
  busy.value = true; error.value = '';
  try {
    // Only the answers the visitor can give; staff answers stay as they are on the server.
    const answers = {};
    for (const f of data.value.fields) if (hasValue(f) && f.type !== 'formula' && f.onForm !== false && !locked.value.includes(f.id)) answers[f.id] = values.value[f.id] ?? '';
    receipt.value = await submitLink(slug, password.value, answers);
    stage.value = 'thanks';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (canDownload.value) makePdf().catch(e => console.warn(e));   // ready by the time they click
  } catch (e) { error.value = e.message; window.scrollTo({ top: 0, behavior: 'smooth' }); }
  busy.value = false;
}

// The visitor's own copy, made in their browser and also kept with the record.
async function makePdf() {
  if (pdf.value) return pdf.value;
  const t = data.value.template;
  const templateBytes = await linkTemplateBytes(slug, password.value);
  const out = await fillPdf({ templateBytes, fields: data.value.fields, mappings: t.mappings || [], values: computeValues(data.value.fields, values.value),
    loadFile: async () => { throw new Error('not available'); } });
  const name = safeFileName(`${data.value.title || 'Agreement'} - ${receipt.value.title || ''} - ${todayISO()}`) + '.pdf';
  pdf.value = { bytes: out.bytes, name };
  savePdf(slug, password.value, receipt.value, out.bytes, name, receipt.value.title).catch(e => console.warn('save copy', e));
  return pdf.value;
}
async function downloadCopy() {
  busy.value = true; error.value = '';
  try { const p = await makePdf(); downloadBytes(p.bytes, p.name); }
  catch (e) { error.value = 'Your agreement was sent, but the PDF could not be made: ' + e.message; }
  busy.value = false;
}
async function downloadOld() {
  busy.value = true;
  try { const r = await linkResult(slug, password.value); downloadBytes(r.bytes, r.name); }
  catch (e) { error.value = e.message; }
  busy.value = false;
}
</script>

<style scoped>
/* Full page of its own (covers the staff layout if the app wraps every page in it). */
.pub { position: fixed; inset: 0; z-index: 200; overflow-y: auto; background: var(--bg); display: flex; flex-direction: column;
  background-image: radial-gradient(circle at 15% -10%, color-mix(in srgb, var(--accent) 12%, transparent), transparent 45%); }
.pub-top { display: flex; align-items: center; justify-content: space-between; padding: 16px clamp(16px, 4vw, 40px); }
.pub-brand { display: flex; align-items: center; gap: 10px; }
.pub-brand span:last-child { display: grid; line-height: 1.1; }
.pub-brand small { color: var(--muted); font-size: 12px; }
.pub-secure { font-size: 12px; color: var(--muted); background: var(--surface); border: 1px solid var(--border); padding: 4px 10px; border-radius: 999px; }
.pub-main { flex: 1; width: 100%; max-width: 900px; margin: 0 auto; padding: 8px 16px 32px; }
.pub-card { max-width: 440px; margin: 6vh auto 0; padding: 32px 28px; }
.pub-msg, .pub-pass { text-align: center; }
.pub-pass .field { text-align: left; }
.pub-card h1 { font-size: 22px; margin: 8px 0 6px; }
.pub-card p { color: var(--text-2); margin: 0 0 18px; }
.pub-small { font-size: 12px; color: var(--muted) !important; }
.pub-emoji { font-size: 40px; }
.pub-wide { width: 100%; height: 46px; font-size: 15px; }
.pub-err { max-width: 860px; margin: 0 auto 12px; }
.pub-center { display: grid; place-items: center; min-height: 50vh; }
.pub-spin { width: 36px; height: 36px; border-radius: 50%; border: 3px solid var(--line); border-top-color: var(--accent); animation: pub-spin .8s linear infinite; }
@keyframes pub-spin { to { transform: rotate(360deg); } }
.pub-foot { text-align: center; color: var(--muted); font-size: 12px; padding: 16px; }
</style>
