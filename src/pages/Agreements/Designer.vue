<template>
  <main class="content ds">
    <div class="loading-bar" v-show="loading || busy"></div>
    <div class="ag-crumb"><RouterLink to="/Agreements/setup">Agreement Setup</RouterLink><span>›</span><span>Place fields</span></div>
    <div class="notice error" v-if="error">{{ error }}</div>

    <template v-if="tpl && form">
      <!-- Toolbar -->
      <div class="ag-bar ds-top card">
        <div class="ds-title">
          <b>{{ tpl.name }}</b>
          <small>{{ form.name }} · {{ tpl.fileName }} <span class="tag">v{{ tpl.version }}</span></small>
        </div>
        <select class="select" :value="tpl.id" aria-label="Switch template" @change="router.push('/Agreements/setup/template/' + $event.target.value)" v-if="siblings.length > 1">
          <option v-for="t in siblings" :key="t.id" :value="t.id">{{ t.name }}</option>
        </select>
        <span class="ag-save" :class="{ error: autosave.status.value === 'error' }">{{ autosave.label.value }}</span>
        <span class="grow"></span>
        <button class="btn btn-sm" :disabled="!undo.canUndo.value" title="Undo (Ctrl+Z)" @click="undo.undo()">↶</button>
        <button class="btn btn-sm" :disabled="!undo.canRedo.value" title="Redo (Ctrl+Shift+Z)" @click="undo.redo()">↷</button>
        <span class="ds-zoom">
          <button class="btn btn-sm" aria-label="Zoom out" @click="zoomBy(-0.25)">−</button>
          <button class="btn btn-sm ds-zoom-val" title="Fit to width" @click="zoom = 1">{{ Math.round(zoom * 100) }}%</button>
          <button class="btn btn-sm" aria-label="Zoom in" @click="zoomBy(0.25)">+</button>
        </span>
        <select class="select" aria-label="Go to page" :value="''" @change="goPage(+$event.target.value); $event.target.value = ''">
          <option value="" disabled>Page…</option>
          <option v-for="n in tpl.pages.length" :key="n" :value="n">Page {{ n }}</option>
        </select>
        <label class="ds-toggle"><input type="checkbox" v-model="preview"> Preview values</label>
        <select class="select" v-if="preview" v-model="previewId" aria-label="Preview with">
          <option value="">Sample data</option>
          <option v-for="r in records" :key="r.id" :value="r.id">{{ r.title || 'Untitled' }}</option>
        </select>
        <label class="btn btn-sm" :class="{ disabled: busy }">Replace PDF<input type="file" hidden accept="application/pdf,.pdf,.doc,.docx" @change="replaceFile"></label>
        <button class="btn btn-sm btn-primary" @click="openGenerate">{{ previewRecord ? 'Generate agreement' : 'Preview PDF' }}</button>
      </div>

      <div class="ag-three ds-three">
        <!-- Fields to place -->
        <aside class="card ag-side">
          <input class="input ds-search" type="search" v-model="search" placeholder="Search fields" aria-label="Search fields">
          <p class="help ds-tip">Drag a field onto the page. Or click it, then click the page.</p>
          <template v-for="g in fieldGroups" :key="g.name">
            <h3 v-if="g.items.length">{{ g.name }}</h3>
            <div class="ag-list ds-group">
              <button v-for="f in g.items" :key="f.id" type="button" class="ag-chipbtn" :class="{ on: armed === f.id }" draggable="true"
                :title="armed === f.id ? 'Now click on the page' : 'Drag onto the page, or click then click the page'"
                @dragstart="startDrag($event, f)" @click="armed = armed === f.id ? '' : f.id">
                <span v-if="f.type === 'formula'" class="ds-fx">ƒ</span>{{ f.label }}<small>{{ placedCount(f.id) || '' }}</small>
              </button>
            </div>
          </template>
          <button class="btn btn-sm ds-add" @click="ask = { kind: 'addField', type: 'text' }">+ New field</button>
          <RouterLink class="link ds-builder" :to="'/Agreements/setup/form/' + form.id">Open the form builder</RouterLink>
        </aside>

        <!-- Pages -->
        <section class="ds-pages" ref="pagesBox" @click.self="selectedId = ''">
          <div class="notice warn" v-if="offPages.length">
            {{ offPages.length }} placed field(s) are on pages this PDF doesn't have.
            <button class="link" @click="moveOffPages">Move them to the last page</button>
          </div>
          <div v-for="(size, i) in tpl.pages" :key="i" class="ds-page" :data-page="i + 1">
            <div class="ds-page-label">Page {{ i + 1 }} of {{ tpl.pages.length }}</div>
            <PdfPage :doc="doc" :page="i + 1" :width="pageWidth" :size="size">
              <template #default="{ width }">
                <div class="ds-drop" :class="{ armed: !!armed }" @dragover.prevent @drop.prevent="onDrop($event, i + 1)" @pointerdown.self="onPagePointer($event, i + 1)">
                  <div v-for="m in onPage(i + 1)" :key="m.id" class="ds-box" :class="{ on: m.id === selectedId, mark: !!m.mark, img: isImage(m), missing: !fieldOf(m) }"
                    :style="boxStyle(m, width, size)" @pointerdown.stop="startMove($event, m, 'move')" :title="fieldOf(m)?.label || 'Deleted field'">
                    <img v-if="isImage(m) && preview && imageSrc(m)" :src="imageSrc(m)" alt="">
                    <span class="ds-text">{{ boxText(m) }}</span>
                    <span class="ds-handle" @pointerdown.stop="startMove($event, m, 'resize')" aria-hidden="true"></span>
                  </div>
                </div>
              </template>
            </PdfPage>
          </div>
        </section>

        <!-- Settings of the selected box -->
        <aside class="card ag-side ag-right">
          <template v-if="selM">
            <h3>Placed field</h3>
            <div class="ag-props">
              <div class="field">
                <label for="mField">Field</label>
                <select id="mField" class="input select" v-model="selM.fieldId">
                  <option v-if="!fieldOf(selM)" :value="selM.fieldId">(deleted field)</option>
                  <option v-for="f in placeableFields" :key="f.id" :value="f.id">{{ f.label }}</option>
                </select>
              </div>
              <div class="ag-row2">
                <div class="field"><label for="mPage">Page</label><input id="mPage" class="input" type="number" min="1" :max="tpl.pages.length" :value="selM.page" @change="setPage(+$event.target.value)"></div>
                <div class="field"><label for="mSize">Font size</label><input id="mSize" class="input" type="number" min="5" max="72" step="0.5" v-model.number="selM.size"></div>
              </div>
              <div class="ag-row2">
                <div class="field"><label for="mX">Left (pt)</label><input id="mX" class="input" type="number" step="0.5" :value="pt(selM, 'x')" @change="setPt('x', $event.target.value)"></div>
                <div class="field"><label for="mY">Top (pt)</label><input id="mY" class="input" type="number" step="0.5" :value="pt(selM, 'y')" @change="setPt('y', $event.target.value)"></div>
              </div>
              <div class="ag-row2">
                <div class="field"><label for="mW">Width (pt)</label><input id="mW" class="input" type="number" step="0.5" min="4" :value="pt(selM, 'w')" @change="setPt('w', $event.target.value)"></div>
                <div class="field"><label for="mH">Height (pt)</label><input id="mH" class="input" type="number" step="0.5" min="4" :value="pt(selM, 'h')" @change="setPt('h', $event.target.value)"></div>
              </div>
              <template v-if="!isImage(selM)">
                <div class="ag-row2">
                  <div class="field">
                    <label for="mFont">Font</label>
                    <select id="mFont" class="input select" v-model="selM.font"><option v-for="(f, k) in FONTS" :key="k" :value="k">{{ f.label }}</option></select>
                  </div>
                  <div class="field"><label for="mColor">Colour</label><input id="mColor" class="input ds-color" type="color" v-model="selM.color"></div>
                </div>
                <div class="field">
                  <label>Align</label>
                  <div class="seg ds-align">
                    <button v-for="a in ['left', 'center', 'right']" :key="a" type="button" :class="{ on: (selM.align || 'left') === a }" @click="selM.align = a">{{ a[0].toUpperCase() + a.slice(1) }}</button>
                  </div>
                </div>
                <label class="ag-check-row"><input type="checkbox" v-model="selM.multiline"> Wrap long text onto more lines</label>
              </template>
              <label class="ag-check-row"><input type="checkbox" :checked="!!selM.mark" @change="toggleMark($event.target.checked)"> Print a mark instead of the value</label>
              <template v-if="selM.mark">
                <div class="ag-row2">
                  <div class="field"><label for="mMark">Mark</label><input id="mMark" class="input" maxlength="3" v-model="selM.mark"></div>
                  <div class="field">
                    <label for="mMatch">When the answer is</label>
                    <select v-if="markOptions.length" id="mMatch" class="input select" v-model="selM.matchValue"><option v-for="o in markOptions" :key="o.value" :value="o.value">{{ o.label }}</option></select>
                    <input v-else id="mMatch" class="input" v-model="selM.matchValue">
                  </div>
                </div>
                <p class="help">For printed boxes like "Residential [ ]": place one mark per choice.</p>
              </template>
              <div class="ag-bar">
                <button class="btn btn-sm" @click="duplicateSel">Duplicate</button>
                <button class="btn btn-sm btn-danger" @click="removeSel">Delete</button>
              </div>
              <p class="help ds-keys"><span class="ag-kbd">Arrows</span> move · <span class="ag-kbd">Shift</span> moves further · <span class="ag-kbd">Del</span> delete · <span class="ag-kbd">Ctrl D</span> duplicate</p>
            </div>
          </template>
          <template v-else>
            <h3>Template</h3>
            <div class="kv"><span>Pages</span><span>{{ tpl.pages.length }}</span></div>
            <div class="kv"><span>Fields placed</span><span>{{ mappings.length }}</span></div>
            <div class="kv"><span>Form</span><span>{{ form.name }}</span></div>
            <p class="help">Click a placed field to change it. Values print inside the box: the top-left corner is where the first letter starts.</p>
            <hr class="divider">
            <h3>Versions</h3>
            <div class="rows">
              <div class="row" v-for="v in [...(tpl.versions || [])].reverse()" :key="v.v">
                <span><b>v{{ v.v }}</b> {{ v.fileName }}<br><small class="muted">{{ new Date(v.at).toLocaleDateString('en-GB') }} · {{ v.byName }}</small></span>
                <span v-if="v.v === tpl.version" class="pill green">In use</span>
                <button v-else class="btn btn-sm" :disabled="busy" @click="restore(v.v)">Use</button>
              </div>
            </div>
            <p class="help">Replacing the PDF keeps every placed field. Agreements made earlier are not changed.</p>
          </template>
        </aside>
      </div>
    </template>

    <NameDialog v-if="ask && ask.kind === 'addField'" title="New field" label="Field name" value="" confirm="Add field" help="It is added to the form too, so staff fill it in." @close="ask = null" @done="addField">
      <div class="field">
        <label for="newFieldType">Type</label>
        <select id="newFieldType" class="input select" v-model="ask.type">
          <option v-for="t in FIELD_TYPES.filter(t => !['section', 'file', 'formula'].includes(t.type))" :key="t.type" :value="t.type">{{ t.label }}</option>
        </select>
      </div>
    </NameDialog>
    <GenerateDialog v-if="gen" :form="form" :record="gen" :templates="siblings" :template-id="tpl.id" :sample="!previewRecord" @close="gen = null" />
  </main>
</template>

<script setup>
// Designer: drag form fields (and formula answers) onto the pages of an uploaded PDF.
// Boxes are kept as fractions of the page, so they print in the same place at any zoom.
import { ref, shallowRef, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PdfPage from '@/components/agreements/PdfPage.vue';
import NameDialog from '@/components/agreements/NameDialog.vue';
import GenerateDialog from '@/components/agreements/GenerateDialog.vue';
import { getTemplate, getForm, saveTemplate, saveForm, listTemplates, listRecords, addTemplateVersion, restoreTemplateVersion } from '@/lib/agreements/data.js';
import { FIELD_TYPES, newField, newId, placeable, hasOptions, labelProblem, sampleValues } from '@/lib/agreements/fields.js';
import { computeValues } from '@/lib/agreements/formula.js';
import { FONTS, LINE, openPdf, mappingText } from '@/lib/agreements/pdf.js';
import { loadFile } from '@/lib/agreements/drive.js';
import { uploadTemplateFile, offPage } from '@/lib/agreements/templates.js';
import { useUndo, useAutosave } from '@/lib/agreements/history.js';
import './agreements.css';

const route = useRoute(), router = useRouter();
const loading = ref(true), busy = ref(false), error = ref('');
const tpl = ref(null), form = ref(null), siblings = ref([]), mappings = ref([]), doc = shallowRef(null);
const selectedId = ref(''), armed = ref(''), search = ref(''), ask = ref(null), gen = ref(null);
const zoom = ref(1), fitWidth = ref(760), pagesBox = ref(null);
const preview = ref(false), previewId = ref(''), records = ref([]);
const pageWidth = computed(() => Math.round(fitWidth.value * zoom.value));

const fieldById = computed(() => new Map((form.value?.fields || []).map(f => [f.id, f])));
const fieldOf = m => fieldById.value.get(m.fieldId);
const placeableFields = computed(() => (form.value?.fields || []).filter(placeable));
const selM = computed(() => mappings.value.find(m => m.id === selectedId.value) || null);
const onPage = n => mappings.value.filter(m => m.page === n);
const placedCount = id => mappings.value.filter(m => m.fieldId === id).length;
const offPages = computed(() => (tpl.value ? offPage(mappings.value, tpl.value.pages) : []));
const isImage = m => ['signature', 'image'].includes(fieldOf(m)?.type) && !m.mark;
const fieldGroups = computed(() => {
  const q = search.value.trim().toLowerCase();
  const list = placeableFields.value.filter(f => !q || f.label.toLowerCase().includes(q));
  return [
    { name: 'Form fields', items: list.filter(f => f.type !== 'formula' && f.onForm !== false) },
    { name: 'Formula answers', items: list.filter(f => f.type === 'formula') },
    { name: 'Table-only columns', items: list.filter(f => f.type !== 'formula' && f.onForm === false) }
  ];
});

// ---- Loading ----
async function loadPdf() {
  doc.value?.destroy(); doc.value = null;
  const file = await loadFile(tpl.value.fileId);
  doc.value = await openPdf(file.bytes);
}
onMounted(async () => {
  try {
    tpl.value = await getTemplate(route.params.id);
    if (!tpl.value) throw new Error('This template no longer exists.');
    form.value = await getForm(tpl.value.formId);
    if (!form.value) throw new Error('The form this template uses was not found.');
    mappings.value = JSON.parse(JSON.stringify(tpl.value.mappings || []));
    undo.reset();
    siblings.value = await listTemplates(form.value.id);
    loading.value = false;
    await loadPdf();
  } catch (e) { error.value = e.message; loading.value = false; }
});
// The pages fill the middle column; zoom is relative to that width.
const ro = new ResizeObserver(() => { if (pagesBox.value) fitWidth.value = Math.max(320, pagesBox.value.clientWidth - 40); });
watch(pagesBox, (el, old) => { if (old) ro.unobserve(old); if (el) ro.observe(el); });
onBeforeUnmount(() => { ro.disconnect(); doc.value?.destroy(); });

// ---- Saving, undo ----
const undo = useUndo(() => mappings.value, s => { mappings.value = s; if (!s.some(m => m.id === selectedId.value)) selectedId.value = ''; });
const autosave = useAutosave(async () => {
  await saveTemplate(tpl.value.id, { mappings: mappings.value });
  const t = siblings.value.find(x => x.id === tpl.value.id);
  if (t) t.mappings = JSON.parse(JSON.stringify(mappings.value));
}, 900);
let commitTimer = null, dragging = false;
watch(mappings, () => {
  if (loading.value) return;
  autosave.touch();
  if (!dragging) { clearTimeout(commitTimer); commitTimer = setTimeout(undo.commit, 300); }
}, { deep: true });

// ---- Placing ----
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
function defaultBox(f) {
  if (f.type === 'checkbox') return { w: 12, h: 12, mark: 'X', matchValue: '', align: 'center' };
  if (f.type === 'signature' || f.type === 'image') return { w: 160, h: 60 };
  if (f.type === 'textarea') return { w: 300, h: 28, multiline: true };
  return { w: 200, h: 14 };
}
function placeAt(fieldId, page, rx, ry) {
  const f = fieldById.value.get(fieldId), size = tpl.value.pages[page - 1];
  if (!f || !size) return;
  const d = defaultBox(f);
  const w = Math.min(d.w / size.w, 1), h = Math.min(d.h / size.h, 1);
  const m = { id: newId('m_'), fieldId, page, x: clamp(rx - w / 2, 0, 1 - w), y: clamp(ry - h / 2, 0, 1 - h), w, h,
    font: 'Helvetica', size: 10, color: '#000000', align: d.align || 'left', multiline: !!d.multiline, mark: d.mark || '', matchValue: d.matchValue ?? '' };
  mappings.value = [...mappings.value, m];
  selectedId.value = m.id;
}
function startDrag(e, f) { e.dataTransfer.setData('text/x-agreement-field', f.id); e.dataTransfer.effectAllowed = 'copy'; }
function onDrop(e, page) {
  const id = e.dataTransfer.getData('text/x-agreement-field');
  if (!id) return;
  const r = e.currentTarget.getBoundingClientRect();
  placeAt(id, page, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
}
function onPagePointer(e, page) {
  if (!armed.value) { selectedId.value = ''; return; }
  const r = e.currentTarget.getBoundingClientRect();
  placeAt(armed.value, page, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  if (!e.shiftKey) armed.value = '';   // Shift-click keeps placing the same field
}

// Move or resize with the mouse / finger.
function startMove(e, m, mode) {
  if (e.button !== undefined && e.button !== 0) return;
  const overlay = e.currentTarget.closest('.ds-drop');
  if (armed.value) { onPagePointer({ currentTarget: overlay, clientX: e.clientX, clientY: e.clientY, shiftKey: e.shiftKey }, m.page); return; }   // placing on top of another box
  selectedId.value = m.id;
  const rect = overlay.getBoundingClientRect(), size = tpl.value.pages[m.page - 1];
  const sx = e.clientX, sy = e.clientY, start = { x: m.x, y: m.y, w: m.w, h: m.h };
  const minW = 4 / size.w, minH = 4 / size.h;
  let moved = false;
  dragging = true;
  const move = ev => {
    const dx = (ev.clientX - sx) / rect.width, dy = (ev.clientY - sy) / rect.height;
    if (!moved && Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) < 3) return;
    moved = true;
    if (mode === 'move') { m.x = clamp(start.x + dx, 0, 1 - m.w); m.y = clamp(start.y + dy, 0, 1 - m.h); }
    else { m.w = clamp(start.w + dx, minW, 1 - m.x); m.h = clamp(start.h + dy, minH, 1 - m.y); }
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    dragging = false;
    if (moved) undo.commit();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

// ---- Settings panel ----
const pageSize = m => tpl.value.pages[m.page - 1] || tpl.value.pages[0];
const pt = (m, k) => Math.round(m[k] * (k === 'x' || k === 'w' ? pageSize(m).w : pageSize(m).h) * 10) / 10;
function setPt(k, v) {
  const m = selM.value, s = pageSize(m), n = Number(v);
  if (!Number.isFinite(n)) return;
  const full = k === 'x' || k === 'w' ? s.w : s.h;
  if (k === 'x') m.x = clamp(n / full, 0, 1 - m.w);
  if (k === 'y') m.y = clamp(n / full, 0, 1 - m.h);
  if (k === 'w') m.w = clamp(n / full, 4 / full, 1 - m.x);
  if (k === 'h') m.h = clamp(n / full, 4 / full, 1 - m.y);
}
function setPage(n) {
  const m = selM.value;
  if (!Number.isInteger(n) || n < 1 || n > tpl.value.pages.length) return;
  const from = pageSize(m), to = tpl.value.pages[n - 1];   // keep the same size in points on a page of another size
  m.w = Math.min(1, (m.w * from.w) / to.w); m.h = Math.min(1, (m.h * from.h) / to.h);
  m.x = clamp(m.x, 0, 1 - m.w); m.y = clamp(m.y, 0, 1 - m.h);
  m.page = n;
  goPage(n);
}
function toggleMark(on) {
  const m = selM.value, f = fieldOf(m);
  m.mark = on ? 'X' : '';
  m.matchValue = on ? (hasOptions(f || {}) ? f.options[0] || '' : '') : '';
  if (on) m.align = 'center';
}
const markOptions = computed(() => {
  const f = selM.value && fieldOf(selM.value);
  if (!f) return [];
  if (hasOptions(f)) return f.options.map(o => ({ value: o, label: o }));
  if (f.type === 'checkbox') return [{ value: '', label: 'Ticked' }];
  return [];
});
function duplicateSel() {
  const m = selM.value;
  const copy = { ...m, id: newId('m_'), y: clamp(m.y + m.h + 4 / pageSize(m).h, 0, 1 - m.h) };
  mappings.value = [...mappings.value, copy];
  selectedId.value = copy.id;
}
function removeSel() { mappings.value = mappings.value.filter(m => m.id !== selectedId.value); selectedId.value = ''; }
function moveOffPages() { const last = tpl.value.pages.length; mappings.value.forEach(m => { if (m.page > last) { m.page = last; m.x = 0; m.y = 0; } }); }

function onKey(e) {
  const tag = document.activeElement?.tagName;
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || document.querySelector('.modal-back');
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && (k === 'z' || k === 'y')) {
    if (typing) return;
    e.preventDefault(); undo.commit();
    if (k === 'y' || e.shiftKey) undo.redo(); else undo.undo();
    return;
  }
  if (typing) return;
  if (e.key === 'Escape') { armed.value = ''; selectedId.value = ''; return; }
  const m = selM.value;
  if (!m) return;
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSel(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'd') { e.preventDefault(); duplicateSel(); return; }
  const step = e.shiftKey ? 10 : 1, s = pageSize(m);
  const nudge = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
  if (nudge) { e.preventDefault(); m.x = clamp(m.x + nudge[0] / s.w, 0, 1 - m.w); m.y = clamp(m.y + nudge[1] / s.h, 0, 1 - m.h); }
}
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));

// ---- How boxes look ----
const previewRecord = computed(() => (preview.value && previewId.value ? records.value.find(r => r.id === previewId.value) : null));
const previewValues = computed(() => (!form.value ? {} : computeValues(form.value.fields, previewRecord.value ? previewRecord.value.values || {} : sampleValues(form.value.fields))));
watch(preview, async on => { if (on && !records.value.length) { try { records.value = (await listRecords(form.value.id)).filter(r => r.status !== 'archived'); } catch (e) { console.warn(e); } } });
function boxText(m) {
  const f = fieldOf(m);
  if (!f) return 'Deleted field';
  if (isImage(m)) return preview.value && imageSrc(m) ? '' : f.label;
  if (!preview.value) return m.mark ? m.mark : f.label;
  return mappingText(f, previewValues.value[f.id], m);
}
function imageSrc(m) {
  const v = previewValues.value[m.fieldId];
  return typeof v === 'string' && v.startsWith('data:image/') ? v : '';
}
function boxStyle(m, width, size) {
  const font = FONTS[m.font] || FONTS.Helvetica;
  return {
    left: m.x * 100 + '%', top: m.y * 100 + '%', width: m.w * 100 + '%', height: m.h * 100 + '%',
    fontFamily: font.css, fontWeight: font.weight || 400, fontSize: ((m.size || 10) * width) / size.w + 'px', lineHeight: LINE,
    color: m.color || '#000', textAlign: m.align || 'left', whiteSpace: m.multiline ? 'pre-wrap' : 'pre'
  };
}

// ---- Zoom and pages ----
const zoomBy = d => { zoom.value = clamp(Math.round((zoom.value + d) * 100) / 100, 0.5, 2.5); };
function goPage(n) { pagesBox.value?.querySelector(`[data-page="${n}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }

// ---- New field, new PDF, versions ----
async function addField(label) {
  const problem = labelProblem(label, form.value.fields);
  if (problem) { error.value = problem; return; }
  const f = newField(ask.value.type, form.value.fields, label);
  ask.value = null;
  try { await saveForm(form.value.id, { fields: [...form.value.fields, f] }); form.value.fields = [...form.value.fields, f]; armed.value = f.id; }
  catch (e) { error.value = 'Could not add the field: ' + e.message; }
}
async function replaceFile(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  busy.value = true; error.value = '';
  try {
    await autosave.flush();
    const up = await uploadTemplateFile(file);
    tpl.value = await addTemplateVersion(tpl.value, up);
    await loadPdf();
  } catch (err) { error.value = err.message; }
  busy.value = false;
}
async function restore(v) {
  busy.value = true;
  try { tpl.value = await restoreTemplateVersion(tpl.value, v); await loadPdf(); }
  catch (err) { error.value = err.message; }
  busy.value = false;
}

async function openGenerate() {
  await autosave.flush();
  const t = siblings.value.find(x => x.id === tpl.value.id);
  if (t) Object.assign(t, { mappings: JSON.parse(JSON.stringify(mappings.value)), fileId: tpl.value.fileId, pages: tpl.value.pages, version: tpl.value.version });
  const r = previewRecord.value;
  gen.value = r ? { id: r.id, title: r.title, values: r.values || {} } : { id: '', title: 'Sample', values: sampleValues(form.value.fields) };
}
</script>

<style scoped>
.ds-top { padding: 10px 14px; margin-bottom: 14px; position: sticky; top: 70px; z-index: 6; }
.ds-title { display: grid; min-width: 0; }
.ds-title b { font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ds-title small { color: var(--muted); font-size: 12px; }
.ds-zoom { display: inline-flex; gap: 2px; }
.ds-zoom-val { min-width: 56px; }
.ds-toggle { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; cursor: pointer; }
.ds-toggle input { width: 16px; height: 16px; accent-color: var(--accent); }
label.btn.disabled { opacity: .55; pointer-events: none; }
.ds-three { grid-template-columns: 240px minmax(0, 1fr) 290px; }
@media (max-width: 1180px) { .ds-three { grid-template-columns: 220px minmax(0, 1fr); } }
@media (max-width: 760px) { .ds-three { grid-template-columns: minmax(0, 1fr); } }
.ds-search { height: 34px; margin-bottom: 8px; }
.ds-tip { margin: 0 0 12px; }
.ds-group { margin-bottom: 14px; }
.ds-fx { font-style: italic; font-weight: 700; color: var(--accent); margin-right: 2px; }
.ag-chipbtn.on .ds-fx { color: #fff; }
.ds-add { width: 100%; margin-top: 4px; }
.ds-builder { display: block; margin-top: 10px; font-size: 12px; }
.ds-pages { min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 22px; padding: 20px; background: var(--chip); border-radius: var(--radius); overflow-x: auto; }
.ds-page { display: grid; gap: 6px; justify-items: center; }
.ds-page-label { font-size: 12px; color: var(--muted); }
.ds-drop { position: absolute; inset: 0; }
.ds-drop.armed { cursor: copy; outline: 2px dashed var(--accent); outline-offset: -2px; }
.ds-box { position: absolute; box-sizing: border-box; overflow: hidden; cursor: move; touch-action: none; user-select: none;
  background: color-mix(in srgb, var(--accent) 12%, transparent); outline: 1px dashed color-mix(in srgb, var(--accent) 70%, transparent); }
.ds-box:hover { background: color-mix(in srgb, var(--accent) 20%, transparent); }
.ds-box.on { outline: 2px solid var(--accent); background: color-mix(in srgb, var(--accent) 18%, transparent); z-index: 2; }
.ds-box.missing { outline-color: var(--red); background: color-mix(in srgb, var(--red) 15%, transparent); }
.ds-box.img { display: grid; place-items: center; }
.ds-box.img img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
.ds-box.img .ds-text { font-size: 11px !important; color: var(--accent); white-space: nowrap; }
.ds-text { display: block; }
.ds-handle { position: absolute; right: 0; bottom: 0; width: 10px; height: 10px; background: var(--accent); cursor: nwse-resize; opacity: 0; }
.ds-box:hover .ds-handle, .ds-box.on .ds-handle { opacity: 1; }
.ds-color { padding: 2px 4px; height: 40px; }
.ds-align { margin-bottom: 0; }
.ds-keys { margin-top: 12px; line-height: 1.8; }
</style>
