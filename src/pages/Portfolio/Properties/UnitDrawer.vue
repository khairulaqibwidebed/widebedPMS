<template>
  <div>
    <div class="drawer-back" @click="$emit('close')"></div>
    <aside class="drawer" role="dialog" aria-label="Edit unit" v-esc="() => $emit('close')">
      <div class="drawer-head"><h2>{{ u.isNew ? 'Add unit' : `Edit unit · ${u.unitCode}` }}</h2><button class="icon-btn" @click="$emit('close')" aria-label="Close">×</button></div>
      <form class="drawer-body" id="unitForm" @submit.prevent="save()">
        <div class="notice error" v-show="u.error">{{ u.error }}</div>
        <p class="help from-listing" v-if="u.fromListing">{{ `Filled in from new owner listing ${u.fromListing.listingId}. Check the details, then Save unit.` }}</p>
        <div class="field"><label for="uCode" class="req">Unit code</label>
          <input class="input" id="uCode" v-model="u.unitCode" :readonly="!u.isNew" :placeholder="`${property.code || 'DM'} 1615`">
          <span class="help" v-show="u.isNew">{{ property.code ? `Starts with this property's code (${property.code}), then the floor and unit, e.g. ${property.code} 0719. You can change it.` : 'This property has no short code yet. Type the unit code as Accounting writes it.' }}</span></div>
        <div class="field"><label for="uAlias">Other eZee names for this unit</label>
          <input class="input" id="uAlias" v-model="u.aliases" placeholder="e.g. DM 1509-2"><span class="help">Comma between names. Bookings under these names count for this unit on the next upload.</span></div>
        <div class="field"><label for="uOwner">Owner</label>
          <OptionPicker class="full-pick" v-model="u.ownerId" :options="ownerOptions" label="Owner" searchable :disabled="acc.viewOnly && !u.isNew" />
          <span class="help">{{ acc.viewOnly && !u.isNew ? 'A change of owner is made by Accounting or a Director.' : 'Not in the list? Add them on the Owners tab first.' }}</span></div>
        <div class="form-sec">Unit details</div>
        <div class="field"><label for="uType">Unit type</label>
          <OptionPicker class="full-pick" v-model="u.info.type" :options="unitTypeOptions" label="Unit type" searchable add-label="Type" @add="addType" /></div>
        <div class="grid-fields">
          <div class="field"><label for="uBed">Bedrooms</label><input class="input" id="uBed" type="number" min="0" v-model="u.info.bedrooms"></div>
          <div class="field"><label for="uBath">Bathrooms</label><input class="input" id="uBath" type="number" min="0" v-model="u.info.bathrooms"></div>
          <div class="field"><label for="uSize">Size (sq ft)</label><input class="input" id="uSize" type="number" min="0" v-model="u.info.sizeSqft"></div>
          <div class="field"><label for="uPark">Car parks</label><input class="input" id="uPark" type="number" min="0" v-model="u.info.carParks"></div>
        </div>
        <div class="form-sec">Bills and management</div>
        <div class="grid-fields">
          <div class="field"><label for="uTnb">TNB account</label><input class="input" id="uTnb" v-model="u.info.tnb"></div>
          <div class="field"><label for="uWater">Water bill account</label><input class="input" id="uWater" v-model="u.info.water"></div>
          <div class="field"><label for="uWifi">Wi-Fi bill account</label><input class="input" id="uWifi" v-model="u.info.wifi"></div>
          <div class="field"><label for="uSew">Sewerage bill account</label><input class="input" id="uSew" v-model="u.info.sewerage"></div>
        </div>
        <div class="field"><label for="uJmb">JMB / MC (condo management) phone or email</label><input class="input" id="uJmb" v-model="u.info.jmb"></div>
        <template v-if="!acc.viewOnly">
          <hr class="divider">
          <div class="field"><label for="uArr">Arrangement</label>
            <OptionPicker class="full-pick" v-model="u.arrangement" :options="arrangementOptions" label="Arrangement" searchable />
            <span class="help" v-if="chosen">{{ `${FEE_TYPES[chosen.type]?.label || chosen.type}: ${FEE_TYPES[chosen.type]?.explain || ''}` }}<FormulaInfo :type="chosen.type" /></span>
            <span class="help" v-else-if="u.arrangement">This arrangement is not on this property's Fees & rates for the month. Pick another.</span>
            <span class="help" v-else>Arrangements are set up on the Fees & rates tab.</span>
            <span class="help from-listing" v-if="u.isNew && u.fromListing?.serviceFee">{{ `From ${u.fromListing.listingId}: ${u.fromListing.serviceFee.label} rent, service fee ${u.fromListing.serviceFee.pct}%. It is filled in as this unit's service fee once you pick an arrangement; clear it to use the arrangement's number.` }}</span></div>
          <div class="field" v-show="isFixed"><label for="uFix" class="req">Fixed rent a month (RM)</label><input class="input" id="uFix" type="number" step="0.01" v-model="u.fixedRentAmount"></div>
          <template v-if="chosen">
            <div class="grid-3">
              <div class="field"><label>Service fee %</label><input class="input" type="number" step="0.01" v-model="u.serviceFeePct" :placeholder="pctOut(chosen.servicePct || 0)"></div>
              <div class="field"><label>Utility fee %</label><input class="input" type="number" step="0.01" v-model="u.utilityFeePct" :placeholder="pctOut(chosen.utilityPct || 0)"></div>
              <div class="field"><label>SST on fee %</label><input class="input" type="number" step="0.01" v-model="u.sstOnFeePct" :placeholder="pctOut(chosen.sstPct || 0)"></div>
            </div>
            <p class="help" style="margin:-6px 0 12px">Leave empty to use the arrangement's numbers. A number here is this unit's own rate.</p>
          </template>
          <div class="field"><label for="uPrice">Purchase price (RM)</label><input class="input" id="uPrice" type="number" step="0.01" min="0" v-model="u.purchasePrice">
            <span class="help">Pool Sharing splits the owners' part of the pot by purchase price. Accounting and Directors only.</span></div>
          <div class="grid-fields">
            <div class="field"><label>Applies from</label>
              <select class="input" v-model="u.effectiveFrom"><template v-for="m in months" :key="m"><option :value="m" :selected="m === u.effectiveFrom">{{ monthName(m) }}</option></template></select></div>
            <div class="field" v-show="!u.isNew"><label>Unit in use</label>
              <label class="help" style="height:40px;display:flex;align-items:center;gap:8px"><input type="checkbox" v-model="u.active"> Active</label></div>
          </div>
        </template>
        <p class="help" v-else>Arrangement, fixed rent and fees are set by Accounting or a Director after the unit is added.</p>
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
      FEE_TYPES, busy: false, arrangements: arrangementsOf(null),   // the built-in list until this property's list is read
      u: {
        isNew: !unit, id: unit?.id || null, original: unit, unitCode: unit?.unitCode || `${this.property.code || ''} `,
        aliases: (unit?.aliases || []).join(', '), ownerId: unit?.ownerId || '', active: unit ? unit.active !== false : true,
        info: { ...Object.fromEntries(UNIT_INFO.map(k => [k, ''])), ...(unit?.info || {}) },
        arrangement: t.arrangement || '', fixedRentAmount: t.fixedRentAmount ?? '',
        serviceFeePct: pctOut(t.serviceFeePct), utilityFeePct: pctOut(t.utilityFeePct), sstOnFeePct: pctOut(t.sstOnFeePct),
        purchasePrice: unit?.purchasePrice ?? '',
        effectiveFrom: this.asOf, reason: '', error: '',
        history: [...(unit?.termHistory || [])].sort((a, b) => (b.effectiveFrom || '').localeCompare(a.effectiveFrom || '') || msOf(b.createdAt) - msOf(a.createdAt)),
        ...(this.prefill || {})
      }
    };
  },
  // This property's fee arrangements (Fees & rates) for the month the change applies from
  async created() { if (!this.acc.viewOnly) await this.loadArrangements(); },
  watch: { 'u.effectiveFrom'() { if (!this.acc.viewOnly) this.loadArrangements(); } },
  computed: {
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
        .map(o => ({ value: o.id, label: ownerLabel(this.owners, o.id, this.acc.viewOnly) }))];
    }
  },
  methods: {
    amt, monthName, arrLabel, pctOut,
    async loadArrangements() {
      try { this.arrangements = (await loadRates(this.property.id, this.u.effectiveFrom)).arrangements; }
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
      if ((u.original?.ownerId || null) !== ownerId) unitChanges.push({ field: 'ownerId', old: u.original?.ownerId || null, new: ownerId });
      if ((u.original?.aliases || []).join(',') !== aliases.join(',')) unitChanges.push({ field: 'aliases', old: u.original?.aliases || [], new: aliases });
      if (!this.acc.viewOnly && (u.original?.purchasePrice ?? null) !== price) unitChanges.push({ field: 'Purchase price', old: u.original?.purchasePrice != null ? `RM ${amt(u.original.purchasePrice)}` : null, new: price != null ? `RM ${amt(price)}` : null });
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
          ...(this.acc.viewOnly ? {} : { purchasePrice: price }),
          terms, termsChanged, effectiveFrom: u.effectiveFrom, reason: u.reason.trim(), changes: [...unitChanges, ...termChanges] });
        const noted = u.isNew ? await noteOnListing(me, u.fromListing, 'unitId', id, 'unit') : '';
        await forgetUnits(pid);
        this.$emit('saved', `${code} saved` + (termsChanged ? `, settings apply from ${monthName(u.effectiveFrom)}.` : '.') + noted);
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
