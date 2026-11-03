<template>
  <div class="modal-back" @click.self="emit('close')" @keydown.esc="emit('close')">
    <form class="modal" role="dialog" aria-label="Renewal reminders" style="max-width: 520px" @submit.prevent="save">
      <h2>Renewal reminders · {{ form.name }}</h2>
      <p class="help">Staff are reminded {{ REMIND_DAYS.slice(0, -1).join(', ') }} days before an agreement ends and on the end date,
        in the PMS and by email. The agreements also show on the Renewals page.</p>
      <div class="notice error" v-if="error">{{ error }}</div>

      <label class="ag-check-row"><input type="checkbox" v-model="on"> Track renewals for this form</label>

      <template v-if="on">
        <div class="field">
          <label for="rnEnd">Which field is the end date?</label>
          <select id="rnEnd" class="input select" v-model="endFieldId" required>
            <option value="" disabled>Choose a date field</option>
            <option v-for="f in dateFields" :key="f.id" :value="f.id">{{ f.label }}{{ f.type === 'formula' ? ' (formula)' : '' }}</option>
          </select>
          <span class="help" v-if="!dateFields.length">This form has no date fields. Add one (e.g. Completion Date) in the form builder first.</span>
        </div>
        <div class="field">
          <label for="rnUnit">Which field is the unit number? (optional)</label>
          <select id="rnUnit" class="input select" v-model="unitFieldId">
            <option value="">Don't track by unit</option>
            <option v-for="f in unitFields" :key="f.id" :value="f.id">{{ f.label }}</option>
          </select>
          <span class="help">Lets the Renewals page group and filter by unit number.</span>
        </div>
        <div class="field">
          <span class="rn-lbl">Remind whole departments (optional)</span>
          <div class="rn-roles">
            <label class="ag-check-row" v-for="(label, key) in ROLE_LABEL" :key="key"><input type="checkbox" :value="key" v-model="roles"> {{ label }}</label>
          </div>
        </div>
        <div class="field">
          <span class="rn-lbl">Remind these staff (optional)</span>
          <PeoplePicker v-model="people" :staff="staff" label="Add a staff member to remind" />
          <span class="help">For every agreement of this form. The person who made each record and its people in charge are always reminded too.</span>
        </div>
      </template>

      <div class="modal-foot">
        <button type="button" class="btn" @click="emit('close')">Cancel</button>
        <button type="submit" class="btn btn-primary" :disabled="busy || (on && !endFieldId)">{{ busy ? 'Saving…' : 'Save' }}</button>
      </div>
    </form>
  </div>
</template>

<script setup>
// Agreement Setup → Forms → Renewal: which date field ends the agreement, and which departments and staff are also reminded.
import { ref, computed, onMounted } from 'vue';
import { saveForm, audit, listStaff } from '@/lib/agreements/data.js';
import { endFieldsOf, unitFieldsOf, rolesOf, peopleOf, REMIND_DAYS } from '@/lib/agreements/renewals.js';
import PeoplePicker from './PeoplePicker.vue';
import { ROLE_LABEL } from '@/lib/firebase.js';

const props = defineProps({ form: { type: Object, required: true } });
const emit = defineEmits(['close', 'saved']);
const r = props.form.renewal || {};
const dateFields = computed(() => endFieldsOf(props.form));
const unitFields = computed(() => unitFieldsOf(props.form));
// Guess the end date field the first time: a date field named like "Completion", "End" or "Expiry".
const guess = () => (dateFields.value.find(f => /complet|end|expir/i.test(f.label)) || {}).id || '';
const guessUnit = () => (unitFields.value.find(f => /unit|room|lot/i.test(f.label)) || {}).id || '';
const on = ref(r.on ?? true), endFieldId = ref(r.endFieldId || guess()), roles = ref([...rolesOf(r)]), people = ref([...peopleOf(r)]);
const unitFieldId = ref(r.unitFieldId || guessUnit());
const staff = ref([]);
onMounted(() => listStaff().then(l => { staff.value = l; }).catch(() => {}));
const busy = ref(false), error = ref('');

async function save() {
  busy.value = true; error.value = '';
  const renewal = { on: on.value, endFieldId: on.value ? endFieldId.value : (r.endFieldId || ''), roles: roles.value, people: people.value };
  renewal.unitFieldId = on.value ? unitFieldId.value : (r.unitFieldId || '');
  try {
    await saveForm(props.form.id, { renewal });
    audit('agreement.form.renewal', `agreementForms/${props.form.id}`, on.value ? `Renewal reminders on: ${[...roles.value.map(k => ROLE_LABEL[k] || k), ...people.value.map(p => p.name)].join(', ') || 'makers and people in charge only'}` : 'Renewal reminders off');
    emit('saved', renewal);
  } catch (e) { error.value = e.code === 'permission-denied' ? 'You don\'t have permission to change this form.' : 'Could not save: ' + e.message; busy.value = false; }
}
</script>

<style scoped>
.rn-lbl { display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; }
.rn-roles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px 12px; }
.rn-roles .ag-check-row { margin: 0; }
</style>
