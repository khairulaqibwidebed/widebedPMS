<template>
  <main class="content">
    <div class="loading-bar" v-show="loading"></div>
    <div class="ag-crumb"><RouterLink to="/Agreements/setup">Agreement Setup</RouterLink><span>›</span><span>Form</span></div>
    <div class="notice error" v-if="error">{{ error }}</div>

    <template v-if="form">
      <div class="ag-bar fb-top">
        <button class="btn btn-sm" @click="leave">← Back</button>
        <input class="input fb-name" v-model="name" aria-label="Form name" maxlength="120">
        <span class="ag-save" :class="{ error: autosave.status.value === 'error' }">{{ autosave.label.value }}</span>
        <span class="grow"></span>
        <button class="btn btn-sm" :disabled="!undo.canUndo.value" title="Undo (Ctrl+Z)" @click="undo.undo()">↶ Undo</button>
        <button class="btn btn-sm" :disabled="!undo.canRedo.value" title="Redo (Ctrl+Shift+Z)" @click="undo.redo()">↷ Redo</button>
        <div class="seg fb-seg" role="tablist">
          <button role="tab" :class="{ on: tab === 'fields' }" :aria-selected="String(tab === 'fields')" @click="tab = 'fields'">Fields</button>
          <button role="tab" :class="{ on: tab === 'preview' }" :aria-selected="String(tab === 'preview')" @click="tab = 'preview'">Try the form</button>
        </div>
        <button class="btn btn-sm btn-primary" :disabled="autosave.status.value === 'saving'" @click="saveNow">Save</button>
      </div>

      <div class="ag-three">
        <!-- Field types -->
        <aside class="card ag-side">
          <h3>Add a field</h3>
          <p class="help fb-tip">Click to add under the selected field, or drag into the list.</p>
          <div class="ag-list">
            <button v-for="t in FIELD_TYPES" :key="t.type" type="button" class="ag-chipbtn" draggable="true" :title="t.hint || ''"
              @click="addField(t.type)" @dragstart="drag = { type: t.type }" @dragend="drag = null; dropAt = -1">{{ t.label }}</button>
          </div>
        </aside>

        <!-- The fields, in order -->
        <section class="card fb-mid">
          <template v-if="tab === 'fields'">
            <ol class="fb-list" @dragover.prevent @drop.prevent="dropOn(fields.length)">
              <li v-for="(f, i) in fields" :key="f.id" class="fb-item" :class="{ on: f.id === selectedId, section: f.type === 'section', over: dropAt === i }"
                draggable="true" @dragstart="drag = { id: f.id }" @dragend="drag = null; dropAt = -1"
                @dragover.prevent.stop="dropAt = i" @drop.prevent.stop="dropOn(i)" @click="selectedId = f.id">
                <span class="fb-grip" aria-hidden="true">⠿</span>
                <div class="fb-main">
                  <b>{{ f.label }}</b>
                  <small>
                    {{ TYPE_LABEL[f.type] }}<template v-if="f.required"> · required</template><template v-if="f.onForm === false"> · table only</template>
                    <template v-if="f.internalOnly"> · staff only</template>
                  <template v-if="f.showIf && f.showIf.fieldId"> · shown only when {{ labelOf(f.showIf.fieldId) }} {{ COND[f.showIf.op || 'equals'] }} {{ f.showIf.op === 'filled' ? '' : condText(f.showIf) }}</template>
                  </small>
                  <code v-if="f.type === 'formula'" class="fb-fx" :class="{ bad: plan.errors.has(f.id) || !!sampleOut[f.id]?.error }">= {{ toDisplay(f.expr, fields) || '(empty)' }}</code>
                </div>
                <span class="fb-acts">
                  <button type="button" class="icon-btn" title="Move up" aria-label="Move up" :disabled="i === 0" @click.stop="move(i, -1)">↑</button>
                  <button type="button" class="icon-btn" title="Move down" aria-label="Move down" :disabled="i === fields.length - 1" @click.stop="move(i, 1)">↓</button>
                  <button type="button" class="icon-btn" title="Duplicate" aria-label="Duplicate" @click.stop="duplicate(f)">⧉</button>
                  <button type="button" class="icon-btn" title="Delete" aria-label="Delete" @click.stop="askDelete(f)">🗑</button>
                </span>
              </li>
              <li v-if="!fields.length" class="fb-empty">No fields yet. Pick a field type on the left.</li>
              <li v-if="drag" class="fb-dropend" :class="{ over: dropAt === fields.length }" @dragover.prevent.stop="dropAt = fields.length" @drop.prevent.stop="dropOn(fields.length)">Drop here to add at the end</li>
            </ol>
          </template>
          <template v-else>
            <p class="help">Fill this in to test the form. These answers are sample data: they show formula results here and are not saved as a record.</p>
            <div class="ag-form">
              <FieldInput v-for="f in previewFields" :key="f.id" :field="f" :model-value="f.type === 'formula' ? sampleOut[f.id] : sample[f.id]"
                @update:model-value="v => (sample = { ...sample, [f.id]: v })" />
            </div>
          </template>
        </section>

        <!-- Settings of the selected field -->
        <aside class="card ag-side ag-right" v-if="sel">
          <h3>{{ TYPE_LABEL[sel.type] }} settings</h3>
          <div class="ag-props">
            <div class="field">
              <label for="pLabel">{{ sel.type === 'section' ? 'Heading' : 'Field name' }}</label>
              <input id="pLabel" class="input" :value="sel.label" @input="sel.label = $event.target.value.replace(/[[\]]/g, '')">
              <span class="ag-error" v-if="labelErr">{{ labelErr }}</span>
              <span class="help" v-else-if="sel.type !== 'section'">Formulas use this name, e.g. [{{ sel.label }}]. Renaming is safe.</span>
            </div>
            <div class="field" v-if="sel.type !== 'section'">
              <label for="pType">Type</label>
              <select id="pType" class="input select" :value="sel.type" @change="changeType($event.target.value)">
                <option v-for="t in FIELD_TYPES.filter(t => t.type !== 'section')" :key="t.type" :value="t.type">{{ t.label }}</option>
              </select>
              <span class="help">Field ID: <code>{{ sel.id }}</code> (never changes)</span>
            </div>

            <!-- Formula -->
            <template v-if="sel.type === 'formula'">
              <div class="field">
                <label>Formula</label>
                <FormulaEditor :key="sel.id" v-model="sel.expr" :fields="fields" :field="sel" :sample="sample" />
              </div>
              <div class="field">
                <label for="pResult">The answer is</label>
                <select id="pResult" class="input select" v-model="sel.resultType"><option v-for="r in RESULT_TYPES" :key="r.value" :value="r.value">{{ r.label }}</option></select>
              </div>
            </template>

            <!-- Choices -->
            <div class="field" v-if="hasOptions(sel)">
              <label for="pOpts">Choices (one per line)</label>
              <textarea id="pOpts" class="input" rows="4" :value="sel.options.join('\n')" @input="sel.options = $event.target.value.split('\n').map(s => s.trim()).filter(Boolean)"></textarea>
              <label class="ag-check-row"><input type="checkbox" v-model="sel.allowOther"> Allow "Other" with a typed answer</label>
            </div>

            <template v-if="!['section', 'formula'].includes(sel.type)">
              <div class="field" v-if="['text', 'textarea', 'email', 'phone', 'number', 'currency'].includes(sel.type)">
                <label for="pPh">Placeholder</label>
                <input id="pPh" class="input" v-model="sel.placeholder">
              </div>
              <div class="field" v-if="!['signature', 'image', 'file'].includes(sel.type)">
                <label for="pDef">Default value</label>
                <select v-if="hasOptions(sel)" id="pDef" class="input select" v-model="sel.default"><option value="">None</option><option v-for="o in sel.options" :key="o" :value="o">{{ o }}</option></select>
                <select v-else-if="sel.type === 'checkbox'" id="pDef" class="input select" v-model="sel.default"><option value="">Not ticked</option><option value="true">Ticked</option></select>
                <input v-else id="pDef" class="input" v-model="sel.default" :placeholder="sel.type === 'date' ? 'YYYY-MM-DD or TODAY' : ''">
              </div>
              <label class="ag-check-row"><input type="checkbox" v-model="sel.required"> Required to complete</label>
            </template>
            <label class="ag-check-row"><input type="checkbox" :checked="sel.onForm !== false" @change="sel.onForm = $event.target.checked"><span>Show on the form<br><small class="help">Off = a table column only</small></span></label>
            <label class="ag-check-row" v-if="sel.onForm !== false"><input type="checkbox" v-model="sel.internalOnly"><span>Staff only<br><small class="help">Hidden on fill-in links for tenants and landlords</small></span></label>

            <!-- Show only when -->
            <div class="field" v-if="sel.onForm !== false">
              <label for="pIf">Show only when</label>
              <select id="pIf" class="input select" :value="sel.showIf?.fieldId || ''" @change="setCond($event.target.value)">
                <option value="">Always show</option>
                <option v-for="f in condFields" :key="f.id" :value="f.id">{{ f.label }}</option>
              </select>
              <div class="ag-row2" v-if="sel.showIf && sel.showIf.fieldId" style="margin-top: 6px">
                <select class="input select" v-model="sel.showIf.op" aria-label="Condition"><option v-for="(l, k) in COND" :key="k" :value="k">{{ l }}</option></select>
                <template v-if="sel.showIf.op !== 'filled'">
                  <select v-if="condOptions.length" class="input select" v-model="sel.showIf.value" aria-label="Value"><option v-for="o in condOptions" :key="o.value" :value="o.value">{{ o.label }}</option></select>
                  <input v-else class="input" v-model="sel.showIf.value" aria-label="Value">
                </template>
              </div>
            </div>

            <!-- How it prints -->
            <template v-if="['text', 'textarea', 'dropdown', 'radio'].includes(valueTypeOf(sel))">
              <div class="field">
                <label for="pCase">Letters</label>
                <select id="pCase" class="input select" :value="sel.format?.case || ''" @change="fmt('case', $event.target.value)">
                  <option value="">As typed</option><option value="upper">CAPITALS</option><option value="title">Title Case</option><option value="lower">lower case</option>
                </select>
              </div>
            </template>
            <template v-if="valueTypeOf(sel) === 'currency'">
              <div class="ag-row2">
                <div class="field"><label for="pPre">Shown with</label><input id="pPre" class="input" :value="sel.format?.prefix ?? 'RM '" @input="fmt('prefix', $event.target.value)"></div>
                <div class="field"><label for="pDec">Decimals</label><input id="pDec" class="input" type="number" min="0" max="4" :value="sel.format?.decimals ?? 2" @input="fmt('decimals', $event.target.value === '' ? 2 : Number($event.target.value))"></div>
              </div>
            </template>
            <template v-if="valueTypeOf(sel) === 'number'">
              <div class="ag-row2">
                <div class="field"><label for="pNdec">Decimals</label><input id="pNdec" class="input" type="number" min="0" max="6" placeholder="Any" :value="sel.format?.decimals ?? ''" @input="fmt('decimals', $event.target.value === '' ? '' : Number($event.target.value))"></div>
                <div class="field"><label for="pSuf">After the number</label><input id="pSuf" class="input" placeholder="e.g.  months" :value="sel.format?.suffix || ''" @input="fmt('suffix', $event.target.value)"></div>
              </div>
              <label class="ag-check-row"><input type="checkbox" :checked="!!sel.format?.thousands" @change="fmt('thousands', $event.target.checked)"> 1,000 separators</label>
            </template>
            <div class="field" v-if="valueTypeOf(sel) === 'date'">
              <label for="pDate">Date looks like</label>
              <select id="pDate" class="input select" :value="sel.format?.date || 'DD/MM/YYYY'" @change="fmt('date', $event.target.value)">
                <option v-for="d in DATE_FORMATS" :key="d.value" :value="d.value">{{ d.example }}</option>
              </select>
            </div>
            <div class="ag-row2" v-if="['checkbox', 'boolean'].includes(valueTypeOf(sel))">
              <div class="field"><label for="pYes">Ticked prints</label><input id="pYes" class="input" :value="sel.format?.yes ?? 'Yes'" @input="fmt('yes', $event.target.value)"></div>
              <div class="field"><label for="pNo">Not ticked prints</label><input id="pNo" class="input" :value="sel.format?.no ?? 'No'" @input="fmt('no', $event.target.value)"></div>
            </div>
            <div class="field" v-if="sel.type !== 'section'">
              <label for="pHelp">Help text under the field</label>
              <input id="pHelp" class="input" v-model="sel.help">
            </div>
          </div>
        </aside>
        <aside class="card ag-side ag-right" v-else>
          <h3>Field settings</h3>
          <p class="help">Select a field in the list to change its name, type, choices, formula or when it shows.</p>
        </aside>
      </div>
    </template>

    <ConfirmDialog v-if="ask" :title="ask.title" :text="ask.text" :items="ask.items" confirm="Delete field" danger @close="ask = null" @ok="ask.run(); ask = null" />
  </main>
</template>

<script setup>
// Form builder: fields, their order, choices, formulas and "show only when" rules. Saves itself; undo/redo.
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import FieldInput from '@/components/agreements/FieldInput.vue';
import FormulaEditor from '@/components/agreements/FormulaEditor.vue';
import ConfirmDialog from '@/components/agreements/ConfirmDialog.vue';
import { getForm, saveForm, listTemplates } from '@/lib/agreements/data.js';
import { FIELD_TYPES, TYPE_LABEL, RESULT_TYPES, newField, newId, hasOptions, hasValue, labelProblem, sampleValues, isShown } from '@/lib/agreements/fields.js';
import { computeValues, formulaPlan, toDisplay, refsIn } from '@/lib/agreements/formula.js';
import { DATE_FORMATS, valueType } from '@/lib/agreements/format.js';
import { useUndo, useAutosave } from '@/lib/agreements/history.js';
import './agreements.css';

const COND = { equals: 'is', notEquals: 'is not', filled: 'is filled in' };
const route = useRoute(), router = useRouter();
const loading = ref(true), error = ref(''), form = ref(null), name = ref(''), fields = ref([]);
const selectedId = ref(''), tab = ref('fields'), drag = ref(null), dropAt = ref(-1), ask = ref(null), templates = ref([]);
const sample = ref({});

const sel = computed(() => fields.value.find(f => f.id === selectedId.value) || null);
const labelErr = computed(() => (sel.value ? labelProblem(sel.value.label, fields.value, sel.value.id) : ''));
const labelOf = id => fields.value.find(f => f.id === id)?.label || 'a deleted field';
const valueTypeOf = f => valueType(f);
const plan = computed(() => formulaPlan(fields.value));
const sampleOut = computed(() => computeValues(fields.value, sample.value));
const previewFields = computed(() => fields.value.filter(f => f.type === 'section' || isShown(f, sample.value)));

// ---- Load, auto-save, undo ----
const undo = useUndo(() => ({ name: name.value, fields: fields.value }), s => { name.value = s.name; fields.value = s.fields; });
const autosave = useAutosave(() => saveForm(form.value.id, { name: name.value.trim() || 'Untitled form', fields: fields.value }));
onMounted(async () => {
  try {
    form.value = await getForm(route.params.id);
    if (!form.value) throw new Error('This form no longer exists.');
    name.value = form.value.name;
    fields.value = form.value.fields || [];
    sample.value = sampleValues(fields.value);
    selectedId.value = fields.value.find(hasValue)?.id || '';
    undo.reset();
    templates.value = await listTemplates(form.value.id);
  } catch (e) { error.value = e.message; }
  loading.value = false;
});
let commitTimer = null;
watch([name, fields], () => {
  if (loading.value) return;
  autosave.touch();
  clearTimeout(commitTimer); commitTimer = setTimeout(undo.commit, 350);
}, { deep: true });

// Save now (changes also save by themselves) and Back to Agreement Setup.
async function saveNow() { await autosave.flush(); }
async function leave() { await autosave.flush(); router.push('/Agreements/setup'); }

function onKey(e) {
  if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z' && e.key.toLowerCase() !== 'y') return;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;   // let text boxes undo typing
  e.preventDefault();
  undo.commit();
  if (e.key.toLowerCase() === 'y' || e.shiftKey) undo.redo(); else undo.undo();
}
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));

// ---- Adding, moving, deleting ----
function addField(type, at) {
  const f = newField(type, fields.value);
  const list = [...fields.value];
  const i = at ?? (sel.value ? list.indexOf(sel.value) + 1 : list.length);
  list.splice(i, 0, f);
  fields.value = list;
  selectedId.value = f.id;
  if (hasValue(f) && f.type !== 'formula') sample.value = { ...sample.value, ...sampleValues([f]) };
}
function dropOn(i) {
  const d = drag.value;
  drag.value = null; dropAt.value = -1;
  if (!d) return;
  if (d.type) { addField(d.type, i); return; }
  const list = [...fields.value], from = list.findIndex(f => f.id === d.id);
  if (from < 0) return;
  const [f] = list.splice(from, 1);
  list.splice(from < i ? i - 1 : i, 0, f);
  fields.value = list;
}
function move(i, step) {
  const list = [...fields.value];
  [list[i], list[i + step]] = [list[i + step], list[i]];
  fields.value = list;
}
function duplicate(f) {
  const copy = { ...JSON.parse(JSON.stringify(f)), id: newId(), label: newField(f.type, fields.value, f.label + ' copy').label };
  const list = [...fields.value];
  list.splice(list.indexOf(f) + 1, 0, copy);
  fields.value = list;
  selectedId.value = copy.id;
}
function askDelete(f) {
  const items = [
    ...fields.value.filter(x => x.type === 'formula' && refsIn(x.expr).includes(f.id)).map(x => `Formula "${x.label}" uses it`),
    ...fields.value.filter(x => x.showIf?.fieldId === f.id).map(x => `"${x.label}" shows only when it is answered`),
    ...templates.value.filter(t => (t.mappings || []).some(m => m.fieldId === f.id)).map(t => `It is placed on the template "${t.name}"`)
  ];
  ask.value = {
    title: `Delete "${f.label}"?`, items,
    text: items.length ? 'It is still used here. Those formulas will show #REF! and placed copies will be skipped until you fix them:' : 'Values already saved in records stay but are no longer shown. Undo brings the field back.',
    run: () => { fields.value = fields.value.filter(x => x.id !== f.id); if (selectedId.value === f.id) selectedId.value = ''; }
  };
}

// ---- Settings helpers ----
function changeType(type) {
  const f = sel.value;
  f.type = type;
  if (hasOptions(f) && !f.options?.length) f.options = ['Option 1', 'Option 2'];
  if (type === 'formula' && !f.resultType) f.resultType = 'number';
}
function fmt(key, value) { sel.value.format = { ...(sel.value.format || {}), [key]: value }; }
const condFields = computed(() => fields.value.filter(f => f.id !== selectedId.value && hasValue(f) && !['signature', 'image', 'file'].includes(f.type)));
function setCond(fieldId) { sel.value.showIf = fieldId ? { fieldId, op: 'equals', value: '' } : null; }
const condOptions = computed(() => {
  const target = fields.value.find(f => f.id === sel.value?.showIf?.fieldId);
  if (!target) return [];
  if (hasOptions(target)) return target.options.map(o => ({ value: o, label: o }));
  if (target.type === 'checkbox') return [{ value: 'true', label: 'Ticked' }, { value: 'false', label: 'Not ticked' }];
  return [];
});
const condText = c => (c.value === 'true' ? 'ticked' : c.value === 'false' ? 'not ticked' : `"${c.value}"`);
</script>

<style scoped>
.fb-top { margin-bottom: 14px; }
.fb-name { max-width: 420px; font-size: 18px; font-weight: 700; height: 42px; }
.fb-seg { margin: 0; min-width: 220px; }
.fb-tip { margin: 0 0 10px; }
.fb-mid { min-height: 420px; }
.fb-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.fb-item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); cursor: pointer;
  transition: border-color var(--fast, .15s), background var(--fast, .15s), box-shadow var(--fast, .15s); }
.fb-item:hover { border-color: color-mix(in srgb, var(--accent) 50%, var(--border)); }
.fb-item.on { border-color: var(--accent); background: var(--accent-soft); box-shadow: inset 4px 0 0 var(--accent); }
.fb-item.over, .fb-dropend.over { box-shadow: 0 -3px 0 var(--accent); }
.fb-item.section { background: var(--hover); }
.fb-item.section b { text-transform: uppercase; letter-spacing: .04em; font-size: 12px; color: var(--accent); }
.fb-grip { color: var(--muted); cursor: grab; font-size: 16px; }
.fb-main { flex: 1; min-width: 0; display: grid; gap: 2px; }
.fb-main b { font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fb-main small { color: var(--muted); font-size: 12px; }
.fb-fx { font-size: 12px; color: var(--accent); background: var(--surface); border: 1px solid var(--line); border-radius: 6px; padding: 2px 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fb-fx.bad { color: var(--red); }
.fb-acts { display: flex; gap: 2px; opacity: .35; transition: opacity var(--fast, .15s); }
.fb-item:hover .fb-acts, .fb-item.on .fb-acts, .fb-acts:focus-within { opacity: 1; }
.fb-acts .icon-btn { width: 28px; height: 28px; font-size: 14px; }
.fb-empty { padding: 32px; text-align: center; color: var(--muted); border: 1.5px dashed var(--border); border-radius: 10px; }
.fb-dropend { padding: 12px; text-align: center; color: var(--muted); font-size: 12px; border: 1.5px dashed var(--border); border-radius: 10px; }
code { font-size: 11px; background: var(--chip); padding: 1px 5px; border-radius: 4px; }
</style>