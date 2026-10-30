<template>
  <div class="modal-back gen-back" @click.self="close" @keydown.esc="close">
    <div class="modal gen" role="dialog" aria-label="Generate agreement">
      <div class="gen-head">
        <h2>{{ sample ? 'Preview with sample data' : 'Generate agreement' }}<small v-if="!sample"> · {{ record.title }}</small></h2>
        <button type="button" class="icon-btn" aria-label="Close" @click="close">×</button>
      </div>

      <div class="notice warn" v-if="!templates.length">There is no template for this form yet. Upload one in Agreement Setup.</div>
      <div v-else class="gen-pick">
        <label for="genTpl">Template</label>
        <select id="genTpl" class="input select" v-model="tplId">
          <option v-for="t in templates" :key="t.id" :value="t.id">{{ t.name }} (v{{ t.version }}, {{ (t.mappings || []).length }} fields placed)</option>
        </select>
      </div>

      <div class="notice error" v-if="error">{{ error }}</div>
      <div class="notice warn" v-if="warnings.length">
        <b>Check before sending:</b>
        <ul><li v-for="w in warnings" :key="w">{{ w }}</li></ul>
      </div>
      <div class="notice ok" v-if="savedMsg">{{ savedMsg }}</div>

      <div class="gen-pages" ref="pagesBox">
        <div class="empty" v-if="busy">Filling in the agreement…</div>
        <template v-else-if="doc">
          <PdfPage v-for="n in pageCount" :key="tplId + n" :doc="doc" :page="n" :width="pageWidth" :size="tpl.pages[n - 1]" />
        </template>
      </div>

      <div class="modal-foot">
        <span class="note gen-note" v-if="!sample && !driveReady()">Google Drive isn't connected, so the PDF won't be kept in the history.</span>
        <button type="button" class="btn" @click="close">Close</button>
        <button type="button" class="btn" :disabled="!bytes || saving" @click="downloadOnly">Download only</button>
        <button v-if="!sample" type="button" class="btn btn-primary" :disabled="!bytes || saving || !driveReady()" @click="saveAndDownload">{{ saving ? 'Saving…' : 'Download & save to history' }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
// Fills the chosen template with a record, shows the finished pages and downloads / keeps the PDF.
// Switching templates re-uses the same record: nobody has to fill the form in again.
import { ref, shallowRef, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import PdfPage from './PdfPage.vue';
import { computeValues, todayISO } from '@/lib/agreements/formula.js';
import { fillPdf, openPdf } from '@/lib/agreements/pdf.js';
import { loadFile, uploadBytes, driveReady } from '@/lib/agreements/drive.js';
import { addGenerated } from '@/lib/agreements/data.js';
import { downloadBytes, safeFileName } from '@/lib/agreements/bytes.js';

const props = defineProps({
  form: { type: Object, required: true },
  record: { type: Object, required: true },   // { id, title, values }
  templates: { type: Array, required: true },
  templateId: { type: String, default: '' },
  sample: Boolean                               // designer preview: nothing is saved
});
const emit = defineEmits(['close', 'generated']);

const tplId = ref(props.templateId || props.templates[0]?.id || '');
const tpl = computed(() => props.templates.find(t => t.id === tplId.value));
const doc = shallowRef(null), bytes = shallowRef(null);
const busy = ref(false), saving = ref(false), error = ref(''), warnings = ref([]), savedMsg = ref('');
const pagesBox = ref(null), pageWidth = ref(600);
const pageCount = computed(() => doc.value?.numPages || 0);
const fileName = computed(() => safeFileName(`${tpl.value?.name || 'Agreement'} - ${props.record.title || 'Untitled'} - ${todayISO()}`) + '.pdf');

async function build() {
  if (!tpl.value) return;
  busy.value = true; error.value = ''; warnings.value = []; savedMsg.value = '';
  doc.value?.destroy(); doc.value = null; bytes.value = null;
  try {
    const file = await loadFile(tpl.value.fileId);
    const values = computeValues(props.form.fields, props.record.values || {});
    const out = await fillPdf({ templateBytes: file.bytes, fields: props.form.fields, mappings: tpl.value.mappings || [], values, loadFile });
    bytes.value = out.bytes;
    warnings.value = out.warnings;
    if (!(tpl.value.mappings || []).length) warnings.value.unshift('No fields are placed on this template yet, so the PDF is the blank template.');
    doc.value = await openPdf(out.bytes);
  } catch (e) { console.error(e); error.value = 'Could not make the PDF: ' + e.message; }
  busy.value = false;
}
watch(tplId, build);

function downloadOnly() { downloadBytes(bytes.value, fileName.value); }
async function saveAndDownload() {
  saving.value = true; error.value = '';
  try {
    const up = await uploadBytes('agreements', bytes.value, fileName.value, 'application/pdf');
    await addGenerated({ recordId: props.record.id, formId: props.form.id, templateId: tpl.value.id, templateName: tpl.value.name,
      templateVersion: tpl.value.version, fileId: up.id, fileName: up.name, title: props.record.title || '' });
    downloadBytes(bytes.value, fileName.value);
    savedMsg.value = 'Saved to Google Drive and the agreement history.';
    emit('generated');
  } catch (e) { error.value = 'Could not save to Drive: ' + e.message + ' You can still use "Download only".'; }
  saving.value = false;
}
const close = () => emit('close');

let ro;
onMounted(() => {
  ro = new ResizeObserver(() => { pageWidth.value = Math.max(280, Math.min(760, (pagesBox.value?.clientWidth || 640) - 32)); });
  ro.observe(pagesBox.value);
  build();
});
onBeforeUnmount(() => { ro?.disconnect(); doc.value?.destroy(); });
</script>

<style scoped>
.gen-back { align-items: stretch; padding: 3vh 16px; }
.gen { max-width: 880px; display: flex; flex-direction: column; max-height: 94vh; }
.gen-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.gen-head h2 { margin: 0; }
.gen-head small { color: var(--muted); font-weight: 500; font-size: 14px; }
.gen-pick { display: grid; gap: 6px; margin: 14px 0; }
.gen-pick label { font-size: 13px; font-weight: 500; color: var(--text-2); }
.gen-pages { flex: 1; min-height: 240px; overflow: auto; background: var(--chip); border-radius: 10px; padding: 16px; display: flex; flex-direction: column; align-items: center; gap: 16px; }
.notice ul { margin: 6px 0 0; padding-left: 18px; }
.gen-note { margin-right: auto; }
</style>
