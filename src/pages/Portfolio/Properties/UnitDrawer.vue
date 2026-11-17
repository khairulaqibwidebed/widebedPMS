<template>
  <div>
    <div class="drawer-back" @click="$emit('close')"></div>
    <aside class="drawer" role="dialog" aria-label="Edit unit" v-esc="() => $emit('close')">
      <div class="drawer-head"><h2>{{ u.isNew ? 'Add unit' : `Edit unit · ${u.unitCode}` }}</h2><button class="icon-btn" @click="$emit('close')" aria-label="Close">×</button></div>
      <form class="drawer-body" id="unitForm" @submit.prevent="save()">
        <div class="notice error" v-show="u.error">{{ u.error }}</div>
        <p class="help from-listing" v-if="u.fromListing">{{ `From listing ${u.fromListing.listingId}. Check, then save.` }}</p>
        <div class="ud-2">
        <div class="field"><label for="uCode" class="req">Unit code</label>
          <!-- 16 Nov 2026: Directors may change an existing unit's code (e.g. a dual key split into N-11-07A and N-11-07B) -->
          <input class="input" id="uCode" v-model="u.unitCode" :readonly="!u.isNew && !acc.isDirector" :placeholder="`${property.code || 'DM'} 1615`">
          <span class="help" v-if="u.isNew">{{ property.code ? `e.g. ${property.code} 0719` : 'Type it as Accounting writes it.' }}</span>
          <span class="help" v-else-if="renamed">{{ `Same unit, new code: its history stays. ${u.original.unitCode} is added to Other eZee names so eZee files that still use it match this unit; remove it there if eZee doesn't.` }}</span>
          <span class="help" v-else-if="acc.isDirector">Directors can change the code. The unit keeps its history.</span>
          <!-- 17 Nov 2026: the unit's folder in its state's Drive folder (<property>/Owner/<unit>) -->
          <span class="help" v-if="!u.isNew">Drive folder: <a v-if="driveLink" :href="driveLink" target="_blank" rel="noopener">Open</a><template v-else>{{ driveMsg }}</template></span>
          <!-- 17 Nov 2026: Add unit shows the Drive folder that saving will make (in the property's own folder style) -->
          <span class="help drive-plan" v-else-if="drivePlan">
            <template v-if="drivePlan.create">Drive folder to be made:
              <template v-for="(seg, i) in drivePlan.path" :key="i"><span :class="{ 'seg-new': seg.new }">{{ seg.name }}<small v-if="seg.new"> new</small></span> / </template><b class="seg-make">{{ drivePlan.create.name }}</b></template>
            <template v-else>{{ drivePlan.msg }}</template>
          </span></div>
        <div class="field"><label for="uAlias">Other eZee names for this unit</label>
          <input class="input" id="uAlias" v-model="u.aliases" placeholder="e.g. DM 1509-2"><span class="help">Separate with commas.</span></div>
        </div>
        <div class="ud-2">
        <div class="field"><label for="uOwner">Owner</label>
          <OptionPicker class="full-pick" v-model="u.ownerId" :options="ownerOptions" label="Owner" searchable :disabled="acc.viewOnly && !u.isNew" />
          <span class="help">{{ acc.viewOnly && !u.isNew ? 'Changed by Accounting or a Director.' : 'Not listed? Add on the Owners tab.' }}</span></div>
        <div class="field"><label for="uType">Unit type</label>
          <OptionPicker class="full-pick" v-model="u.info.type" :options="unitTypeOptions" label="Unit type" searchable add-label="Type" @add="addType" /></div>
        </div>
        <div class="form-sec">Unit details</div>
        <div class="ud-4">
          <div class="field"><label for="uBed">Bedrooms</label><input class="input" id="uBed" type="number" min="0" v-model="u.info.bedrooms"></div>
          <div class="field"><label for="uBath">Bathrooms</label><input class="input" id="uBath" type="number" min="0" v-model="u.info.bathrooms"></div>
          <div class="field"><label for="uSize">Size (sq ft)</label><input class="input" id="uSize" type="number" min="0" v-model="u.info.sizeSqft"></div>
          <div class="field"><label for="uPark">Car parks</label><input class="input" id="uPark" type="number" min="0" v-model="u.info.carParks"></div>
        </div>
        <div class="form-sec">Bills and management</div>
        <div class="ud-4">
          <div class="field"><label for="uTnb">TNB account</label><input class="input" id="uTnb" v-model="u.info.tnb"></div>
          <div class="field"><label for="uWater">Water bill account</label><input class="input" id="uWater" v-model="u.info.water"></div>
          <div class="field"><label for="uWifi">Wi-Fi bill account</label><input class="input" id="uWifi" v-model="u.info.wifi"></div>
          <div class="field"><label for="uSew">Sewerage bill account</label><input class="input" id="uSew" v-model="u.info.sewerage"></div>
        </div>
        <div class="ud-2">
        <div class="field"><label for="uJmb">JMB / MC (condo management) phone or email</label><input class="input" id="uJmb" v-model="u.info.jmb"></div>
        <!-- 13 Nov 2026: one per unit, from Finance's Owner List. Saved by people with an Edit tick (the rules don't allow it for Operations or Marketing yet). -->
        <div class="field"><label for="uAc">Autocount account no.</label>
          <input class="input" id="uAc" v-model="u.autocountAcc" :readonly="acc.viewOnly" placeholder="e.g. 300-C013">
          <span class="help" v-if="acc.viewOnly">Set by Accounting or a Director.</span></div>
        </div>
        <!-- 16 Nov 2026: free notes on the unit (Finance's Owner List Remark column comes here through Bulk Upload). Same people as the Autocount no. -->
        <div class="field"><label for="uRem">Remarks</label>
          <textarea class="input" id="uRem" rows="3" v-model="u.remarks" :readonly="acc.viewOnly" placeholder="e.g. Fixed Rental - RM 1,300, start from January 2023"></textarea></div>
        <template v-if="!acc.viewOnly">
          <hr class="divider">
          <div class="ud-2">
          <div class="field"><label for="uArr">Arrangement</label>
            <OptionPicker class="full-pick" v-model="u.arrangement" :options="arrangementOptions" label="Arrangement" searchable />
            <span class="help" v-if="chosen">{{ `${FEE_TYPES[chosen.type]?.label || chosen.type}: ${FEE_TYPES[chosen.type]?.explain || ''}` }}<FormulaInfo :type="chosen.type" /></span>
            <span class="help" v-else-if="u.arrangement">Not set up for this month. Pick another.</span>
            <span class="help" v-else>Set up on Fees & Rates or Pool sharing.</span>
            <span class="help from-listing" v-if="u.isNew && u.fromListing?.serviceFee">{{ `From ${u.fromListing.listingId}: service fee ${u.fromListing.serviceFee.pct}%, filled in after you pick an arrangement.` }}</span></div>
          <div class="field" v-show="isFixed"><label for="uFix" class="req">Fixed rent a month (RM)</label><input class="input" id="uFix" type="number" step="0.01" v-model="u.fixedRentAmount"></div>
          </div>
          <template v-if="chosen">
            <div class="ud-3">
              <div class="field"><label>Service fee %</label><input class="input" type="number" step="0.01" v-model="u.serviceFeePct" :placeholder="pctOut(chosen.servicePct || 0)"></div>
              <div class="field"><label>Utility fee %</label><input class="input" type="number" step="0.01" v-model="u.utilityFeePct" :placeholder="pctOut(chosen.utilityPct || 0)"></div>
              <div class="field"><label>SST on fee %</label><input class="input" type="number" step="0.01" v-model="u.sstOnFeePct" :placeholder="pctOut(chosen.sstPct || 0)"></div>
            </div>
            <p class="help" style="margin:-6px 0 12px">Leave empty to use the arrangement's rates.</p>
          </template>
          <div class="ud-3">
          <div class="field"><label for="uPrice">Purchase price (RM)</label><input class="input" id="uPrice" type="number" step="0.01" min="0" v-model="u.purchasePrice">
            <span class="help">Used to split Pool Sharing.</span></div>
            <div class="field"><label>Applies from</label>
              <OptionPicker class="full-pick" v-model="u.effectiveFrom" :options="monthOptions" label="Applies from" /></div>
            <!-- 16 Nov 2026: the Active checkbox in a box the same height and border as the fields beside it -->
            <div class="field" v-show="!u.isNew"><label for="uActive">Unit in use</label>
              <label class="ud-check" :class="{ on: u.active }"><input id="uActive" type="checkbox" v-model="u.active"><span>Active</span></label></div>
          </div>
        </template>
        <p class="help" v-else>Rent and fees are set by Accounting or a Director.</p>
        <div class="field"><label for="uWhy" class="req">Reason (audit log)</label><textarea class="input" id="uWhy" v-model="u.reason" placeholder="e.g. New owner agreement from June"></textarea></div>
        <template v-if="!acc.viewOnly">
          <hr class="divider">
          <h3 style="margin:0 0 6px;font-size:14px">Settings history</h3>
          <div class="rows history-list">
            <template v-for="h in u.history" :key="h.id">
              <div class="row"><span>{{ `From ${h.effectiveFrom === '2000-01' ? 'the start' : monthName(h.effectiveFrom)} · ${arrLabel(h.arrangement)}` + (h.fixedRentAmount ? ` RM ${amt(h.fixedRentAmount)}` : '') + (h.reason ? ` · ${h.reason}` : '') }}</span><span class="r help">{{ h.createdByName || '' }}</span></div>
            </template>
            <div class="empty" v-show="!u.history?.length">No settings yet.</div>
          </div>
        </template>
      </form>
      <div class="drawer-foot">
        <button class="icon-btn trash" style="margin-right:auto" v-if="acc.isDirector && !u.isNew" @click="remove()" :disabled="busy" title="Delete this unit from the system" aria-label="Delete unit">🗑</button>
        <button class="btn" @click="$emit('close')">Cancel</button>
        <button class="btn btn-primary" type="submit" form="unitForm" :disabled="busy">{{ busy ? 'Saving…' : 'Save unit' }}</button>
      </div>
    </aside>
  </div>
</template>

<script>
// Unit drawer (a property's Units tab): add or edit a unit, its owner, details and, for Accounting and Directors,
// its arrangement and fees from a month on. Directors can delete a unit with no history.
// Tells the page "saved" with the message to show; the page closes it and loads again.
import { unitIdOf } from '@/lib/engine.js';
import { FEE_TYPES, arrangementsOf } from '@/lib/fee-types.js';
import { amt, monthName, pct } from '@/lib/format.js';
import { friendlyError } from '@/lib/finance-data.js';
import { useSession } from '@/stores/session.js';
import { askConfirm, showNotice } from '@/lib/confirm.js';
import OptionPicker from '@/components/OptionPicker.vue';
import { unitFolder, unitPlan, makeUnitFolders } from '@/lib/drive.js';
import FormulaInfo from '@/components/FormulaInfo.vue';
import { UNIT_INFO, UNIT_TYPES, pctIn, pctOut, msOf, arrLabel, arrangementOptions, ownerLabel, hasRefs, noteOnListing, forgetUnits,
  addUnitType, saveUnit, deleteUnit, loadRates } from '@/lib/portfolio-data.js';

const me = useSession();

export default {
  components: { OptionPicker, FormulaInfo },
  props: {
    unit: { type: Object, default: null },          // the unit row, or null to add one
    prefill: { type: Object, default: null },       // fields from a new owner listing (Create unit)
    property: { type: Object, required: true },
    units: { type: Array, required: true },         // this property's units
    owners: { type: Array, required: true },
    customTypes: { type: Array, required: true },   // unit types people added
    asOf: { type: String, required: true },
    months: { type: Array, required: true },
    acc: { type: Object, required: true }
  },
  emits: ['close', 'saved', 'busy', 'type-added'],
  data() {
    const unit = this.unit, t = unit?.terms || {};
    return {
      FEE_TYPES, busy: false, driveLink: '', driveMsg: 'checking…', drivePlan: null, arrangements: arrangementsOf(null),   // the built-in list until this property's list is read
      u: {
        isNew: !unit, id: unit?.id || null, original: unit, unitCode: unit?.unitCode || `${this.property.code || ''} `,
        aliases: (unit?.aliases || []).join(', '), ownerId: unit?.ownerId || '', active: unit ? unit.active !== false : true,
        info: { ...Object.fromEntries(UNIT_INFO.map(k => [k, ''])), ...(unit?.info || {}) },
        arrangement: t.arrangement || '', fixedRentAmount: t.fixedRentAmount ?? '',
        serviceFeePct: pctOut(t.serviceFeePct), utilityFeePct: pctOut(t.utilityFeePct), sstOnFeePct: pctOut(t.sstOnFeePct),
        purchasePrice: unit?.purchasePrice ?? '', autocountAcc: unit?.autocountAcc || '', remarks: unit?.remarks || '',
        effectiveFrom: this.asOf, reason: '', error: '',
        history: [...(unit?.termHistory || [])].sort((a, b) => (b.effectiveFrom || '').localeCompare(a.effectiveFrom || '') || msOf(b.createdAt) - msOf(a.createdAt)),
        ...(this.prefill || {})
      }
    };
  },
  // This property's fee arrangements (Fees & rates) for the month the change applies from
  async created() {
    if (this.unit) this.findDrive();
    if (!this.acc.viewOnly) await this.loadArrangements();
  },
  watch: {
    'u.effectiveFrom'() { if (!this.acc.viewOnly) this.loadArrangements(); },
    // Add unit: the folder preview follows the code as it is typed (read once typing stops)
    'u.unitCode'() {
      if (!this.u.isNew) return;
      clearTimeout(this.planTimer);
      this.planTimer = setTimeout(() => this.previewDrive(), 600);
    }
  },
  computed: {
    renamed() { const u = this.u; return !u.isNew && u.original && u.unitCode.trim().replace(/\s+/g, ' ') !== u.original.unitCode; },
    monthOptions() { return this.months.map(m => ({ value: m, label: monthName(m) })); },
    arrangementOptions() { return arrangementOptions(this.arrangements); },
    chosen() { return this.u.arrangement ? this.arrangements[this.u.arrangement] || null : null; },
    isFixed() { return this.chosen?.type === 'fixed'; },
    unitTypeOptions() {
      const seen = new Set(), out = [];
      for (const t of [...UNIT_TYPES.filter(x => x !== 'Other'), ...this.customTypes, ...this.units.map(x => x.info?.type), this.u.info.type, 'Other']) {
        const k = String(t || '').trim(); if (!k || seen.has(k.toLowerCase())) continue; seen.add(k.toLowerCase()); out.push({ value: k, label: k });
      }
      return [{ value: '', label: 'Choose' }, ...out];
    },
    ownerOptions() {
      return [{ value: '', label: 'No owner linked' }, ...this.owners.filter(x => x.active !== false || x.id === this.u.ownerId)
        .map(o => ({ value: o.id, label: this.ownerPickLabel(o) }))];
    }
  },
  methods: {
    amt, monthName, arrLabel, pctOut,
    // Read-only: is there a folder for this unit under <property>/Owner in Drive? Not found is left as is.
    async findDrive() {
      try {
        const f = await unitFolder(this.property.id, this.unit.unitCode);
        this.driveLink = f.link || '';
        this.driveMsg = f.link ? '' : f.why === 'state' ? 'the state has no Drive folder yet' : 'not found';
      } catch (e) { this.driveMsg = 'could not check'; }
    },
    // Add unit: what saving will make in Drive (nothing is made here). Hidden when the code has no number yet.
    async previewDrive() {
      const code = this.u.unitCode.trim().replace(/\s+/g, ' ');
      if (!/\d/.test(code)) { this.drivePlan = null; return; }
      try {
        const r = ((await unitPlan([{ id: this.property.id, units: [...this.units.map(x => x.unitCode).filter(Boolean), code], only: [code] }])).properties || [])[0] || {};
        if (code !== this.u.unitCode.trim().replace(/\s+/g, ' ')) return;   // typed on meanwhile
        this.drivePlan = r.skip ? { msg: r.skip === 'state' ? 'Drive folder: the state has no Drive folder yet, so none is made.' : '' }
          : r.create?.length ? { path: r.path || [], create: r.create[0] } : { msg: 'Drive folder: one already matches this unit.' };
      } catch (e) { this.drivePlan = null; }
    },
    // After a new unit is saved: make its Drive folder. Never stops the save; the result is added to the saved message.
    async makeDrive(code) {
      try {
        const made = (await makeUnitFolders([{ id: this.property.id, units: [...this.units.map(x => x.unitCode).filter(Boolean), code], only: [code] }])).made || [];
        return made.length ? ` Drive folder ${made[0].name} created.` : '';
      } catch (e) { return ` Drive folder not made (${e.message}).`; }
    },
    // Roles that can't read owner names (PDPA) saw "Owner linked" on every row (12 Nov 2026): they now see the owner's
    // code and their units in this property, so the rows can be told apart. Others see the name as before.
    ownerPickLabel(o) {
      const name = ownerLabel(this.owners, o.id, this.acc.viewOnly);
      if (name !== 'Owner linked') return name;
      const units = this.units.filter(x => x.ownerId === o.id).map(x => x.unitCode).filter(Boolean);
      return `Owner ${o.code || o.id}` + (units.length ? ` · ${units.slice(0, 3).join(', ')}${units.length > 3 ? ` +${units.length - 3}` : ''}` : '');
    },
    async loadArrangements() {
      try { this.arrangements = (await loadRates(this.property.id, this.u.effectiveFrom, { merged: true })).arrangements; }   // with the shared Fees & Rates
      catch (e) { this.u.error = friendlyError(e, 'load the fee arrangements'); }
    },
    setBusy(v) { this.busy = v; this.$emit('busy', v); },
    async addType(name) {
      const t = name.trim().replace(/\s+/g, ' ');
      if (!t) return;
      const same = this.unitTypeOptions.find(o => o.value && o.value.toLowerCase() === t.toLowerCase());
      if (same) { this.u.info.type = same.value; return; }
      this.$emit('type-added', t); this.u.info.type = t;
      await addUnitType(t);
    },
    async save() {
      const u = this.u, pid = this.property.id; u.error = '';
      const code = u.unitCode.trim().replace(/\s+/g, ' ');
      // Any code with a number in it: "DM 0719", "CS B-07-13", or no prefix like "C-01-06" (183 Ampang, Langkawi, NOVO)
      if (!/\d/.test(code)) return u.error = `Type the unit code with its number${this.property.code ? `, like ${this.property.code} 0719` : ''}.`;
      const id = u.id || unitIdOf(pid, code);
      if (u.isNew && this.units.some(x => x.id === id)) return u.error = 'That unit already exists.';
      // A new code for an existing unit (Directors): no other unit of the property may use it; the old code becomes an eZee name
      const oldCode = u.original?.unitCode || '', rename = !u.isNew && code !== oldCode;
      const norm = v => String(v || '').trim().replace(/\s+/g, ' ').toLowerCase();
      if (rename && this.units.some(x => x.id !== u.id && [x.unitCode, ...(x.aliases || [])].some(v => norm(v) === norm(code)))) return u.error = `Another unit here already uses ${code}.`;
      if (rename && oldCode && !u.aliases.split(',').some(a => norm(a) === norm(oldCode))) u.aliases = [oldCode, ...u.aliases.split(',').map(a => a.trim()).filter(Boolean)].join(', ');
      const fixed = this.isFixed;
      if (!this.acc.viewOnly && u.arrangement && !this.chosen && u.arrangement !== u.original?.terms?.arrangement) return u.error = 'Pick an arrangement from the list.';
      if (fixed && !(Number(u.fixedRentAmount) > 0)) return u.error = 'Enter the fixed rent amount.';
      const price = u.purchasePrice === '' || u.purchasePrice == null ? null : Math.round(Number(u.purchasePrice) * 100) / 100;
      if (!this.acc.viewOnly && price != null && !(price >= 0)) return u.error = 'Purchase price must be a number, 0 or more.';
      const aliases = u.aliases.split(',').map(s => s.trim().replace(/\s+/g, ' ')).filter(Boolean);
      const old = u.original?.terms || {};
      // Every type keeps its % fields (empty = the arrangement's numbers). Fixed rent also keeps the rent.
      const terms = u.arrangement ? {
        arrangement: u.arrangement, fixedRentAmount: fixed ? Math.round(Number(u.fixedRentAmount) * 100) / 100 : null,
        serviceFeePct: pctIn(u.serviceFeePct), utilityFeePct: pctIn(u.utilityFeePct), sstOnFeePct: pctIn(u.sstOnFeePct)
      } : null;
      const termsChanged = terms && (u.isNew || !u.original.terms || Object.keys(terms).some(k => (old[k] ?? null) !== terms[k]));
      const ownerId = u.ownerId || null;
      const unitChanges = [];
      const numOr = v => (v === '' || v == null ? null : Number(v));
      const info = {};
      for (const k of UNIT_INFO) info[k] = ['bedrooms', 'bathrooms', 'sizeSqft', 'carParks'].includes(k) ? numOr(u.info[k]) : String(u.info[k] || '').trim();
      const oldInfo = u.original?.info || {};
      for (const k of UNIT_INFO) if ((oldInfo[k] ?? '') !== (info[k] ?? '')) unitChanges.push({ field: k, old: oldInfo[k] ?? null, new: info[k] });
      if (rename) unitChanges.push({ field: 'unitCode', old: oldCode, new: code });
      if ((u.original?.ownerId || null) !== ownerId) unitChanges.push({ field: 'ownerId', old: u.original?.ownerId || null, new: ownerId });
      if ((u.original?.aliases || []).join(',') !== aliases.join(',')) unitChanges.push({ field: 'aliases', old: u.original?.aliases || [], new: aliases });
      if (!this.acc.viewOnly && (u.original?.purchasePrice ?? null) !== price) unitChanges.push({ field: 'Purchase price', old: u.original?.purchasePrice != null ? `RM ${amt(u.original.purchasePrice)}` : null, new: price != null ? `RM ${amt(price)}` : null });
      const ac = String(u.autocountAcc || '').trim();
      if (!this.acc.viewOnly && (u.original?.autocountAcc || '') !== ac) unitChanges.push({ field: 'autocountAcc', old: u.original?.autocountAcc || null, new: ac || null });
      const rem = String(u.remarks || '').trim();
      if (!this.acc.viewOnly && String(u.original?.remarks || '').trim() !== rem) unitChanges.push({ field: 'remarks', old: u.original?.remarks || null, new: rem || null });
      if (!u.isNew && (u.original.active !== false) !== u.active) unitChanges.push({ field: 'active', old: u.original.active !== false, new: u.active });
      if (!u.isNew && !termsChanged && !unitChanges.length) { this.$emit('close'); return; }
      if (!u.reason.trim()) return u.error = 'Add a short reason. It goes in the audit log.';
      const termChanges = [];
      if (termsChanged) {
        if ((old.arrangement || null) !== terms.arrangement) termChanges.push({ field: 'arrangement', old: old.arrangement || null, new: terms.arrangement });
        if (fixed && (old.fixedRentAmount ?? null) !== terms.fixedRentAmount) termChanges.push({ field: 'Fixed rent', old: old.fixedRentAmount != null ? `RM ${amt(old.fixedRentAmount)}` : null, new: `RM ${amt(terms.fixedRentAmount)}` });
        for (const [k, lbl] of [['serviceFeePct', 'Service fee'], ['utilityFeePct', 'Utility fee'], ['sstOnFeePct', 'SST on fee']])
          if ((old[k] ?? null) !== terms[k]) termChanges.push({ field: lbl, old: old[k] != null ? pct(old[k]) : null, new: terms[k] != null ? pct(terms[k]) : 'normal rate' });
      }
      this.setBusy(true);
      try {
        await saveUnit(me, { id, isNew: u.isNew, detailsOnly: this.acc.viewOnly && !u.isNew, propertyId: pid, code, aliases, ownerId, info, active: u.active,
          ...(this.acc.viewOnly ? {} : { purchasePrice: price, autocountAcc: ac, remarks: rem }),
          terms, termsChanged, effectiveFrom: u.effectiveFrom, reason: u.reason.trim(), changes: [...unitChanges, ...termChanges] });
        const noted = u.isNew ? await noteOnListing(me, u.fromListing, 'unitId', id, 'unit') : '';
        const drive = u.isNew ? await this.makeDrive(code) : '';
        await forgetUnits(pid);
        this.$emit('saved', `${code} saved` + (termsChanged ? `, settings apply from ${monthName(u.effectiveFrom)}.` : '.') + noted + drive);
      } catch (e) { u.error = friendlyError(e, 'save the unit'); }
      this.setBusy(false);
    },
    // Safe delete (Directors only): works only when nothing refers to the unit. Otherwise set it inactive.
    async remove() {
      const u = this.u, pid = this.property.id; u.error = '';
      if (this.busy) return;
      this.setBusy(true);
      try {
        const used = await hasRefs([['bookings', 'unitId'], ['expenses', 'unitId'], ['statements', 'unitId'], ['payoutHistory', 'unitId'],
          ['offlineBookings', 'unitId'], ['issues', 'unitId']], u.id);
        if (used) { this.setBusy(false); await showNotice(`${u.unitCode} can't be deleted`, `It already has history (${used}). Set the unit to inactive instead, so the history stays.`); return; }
        if (!await askConfirm({ title: `Delete unit ${u.unitCode}?`, message: 'It will be removed from the system for good, including its terms history. This cannot be undone.', confirmText: 'Delete unit', danger: true })) { this.setBusy(false); return; }
        await deleteUnit(me, u, pid);
        await forgetUnits(pid);
        this.$emit('saved', `${u.unitCode} deleted.`);
      } catch (e) { u.error = friendlyError(e, 'delete the unit'); }
      this.setBusy(false);
    }
  }
};
</script>

<style scoped>
.drive-plan { overflow-wrap: anywhere; }
.drive-plan .seg-new { color: var(--accent); }
.drive-plan .seg-new small { font-size: 10px; font-weight: 600; text-transform: uppercase; }
.drive-plan .seg-make { color: var(--accent); }
/* 16 Nov 2026: wider centred popup, fields side by side (one column on phones) */
.ud-2, .ud-3, .ud-4 { display: grid; gap: 0 14px; }
.ud-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.ud-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.ud-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.ud-check { height: 40px; display: flex; align-items: center; gap: 10px; padding: 0 12px; border: 1px solid var(--border); border-radius: 8px;
  background: var(--surface); color: var(--text); font-size: 14px; cursor: pointer; }
.ud-check:hover { border-color: var(--accent); }
.ud-check input { width: 16px; height: 16px; margin: 0; accent-color: var(--accent); cursor: pointer; }
@media (max-width: 720px) { .ud-2, .ud-3, .ud-4 { grid-template-columns: 1fr; } }
</style>
