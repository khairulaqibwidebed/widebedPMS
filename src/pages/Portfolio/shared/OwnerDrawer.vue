<template>
  <div>
    <div class="drawer-back" @click="$emit('close')"></div>
    <aside class="drawer wide" role="dialog" aria-label="Owner" v-esc="() => $emit('close')">
      <div class="drawer-head"><h2>{{ o.isNew ? 'Add owner' : (jointName(o.fullName, o.coOwners) || 'Owner') }}</h2><button class="icon-btn" @click="$emit('close')" aria-label="Close">×</button></div>
      <form class="drawer-body" id="ownerForm" @submit.prevent="save()">
        <div class="notice error" v-show="o.error">{{ o.error }}</div>
        <p class="help from-listing" v-if="o.fromListing">{{ `Filled in from new owner listing ${o.fromListing.listingId}. Check the details, then Add owner.` }}</p>
        <div class="notice warn" v-show="o.active === false">{{ `Deactivated${o.deactivatedReason ? ': ' + o.deactivatedReason : ''}. Their history stays; they can't be linked to new units.` }}</div>
        <template v-if="!o.isNew && !acc.viewOnly">
          <div>
            <div class="summary-grid">
              <div><b>{{ myUnits.length }}</b><span>Units</span></div>
              <div><b :class="{ 'neg-amt': carriedAmt < 0 }">{{ amt(carriedAmt) }}</b><span>{{ `Carried forward into ${shortName(asOf)} (RM)` }}</span></div>
              <div><b>{{ o.payouts.length }}</b><span>Payouts on record</span></div>
            </div>
            <div class="form-sec">Properties and units</div>
            <div class="rows">
              <template v-for="x in myUnits" :key="x.id"><div class="row"><span>{{ `${x.unitCode} · ${propertyNameOf(x.propertyId)}` }}</span><span class="r">{{ arrLabel(x.terms?.arrangement) }}</span></div></template>
              <div class="empty" v-show="!myUnits.length">No units linked. Link them from a property's Units tab.</div>
            </div>
            <div class="form-sec">Payout history</div>
            <div class="rows">
              <template v-for="h in o.payouts.slice(0, 12)" :key="h.id"><div class="row"><span>{{ `${shortName(h.month)} · ${h.unitCode}` }}</span><span class="r" :class="{ neg: h.payout < 0 }">{{ `RM ${amt(h.payout)}` }}</span></div></template>
              <div class="empty" v-show="!o.payouts.length">No payouts yet.</div>
            </div>
          </div>
        </template>
        <div class="form-sec">Personal details <span class="help" style="text-transform:none;letter-spacing:0;font-weight:400">{{ acc.canEdit ? '· private, Accounting, Directors and Marketing only' : acc.viewOnly ? '· private: once saved, only Accounting and Directors see them' : '· private, Accounting and Directors only' }}</span></div>
        <div class="grid-fields">
          <div class="field"><label for="oName" class="req">{{ o.coOwners.length ? 'Full name (owner 1)' : 'Full name' }}</label><input class="input" id="oName" v-model="o.fullName" placeholder="e.g. Owner A"></div>
          <div class="field"><label for="oIc">IC / passport</label><input class="input" id="oIc" v-model="o.ic"></div>
          <div class="field"><label for="oEmail">Email</label><input class="input" id="oEmail" type="email" v-model="o.email"></div>
          <div class="field"><label for="oPhone">Phone number</label><input class="input" id="oPhone" v-model="o.phone"></div>
          <div class="field"><label for="oDob">Date of birth</label><input class="input" id="oDob" type="date" v-model="o.dob"></div>
          <div class="field"><label for="oWa">WhatsApp</label><input class="input" id="oWa" v-model="o.whatsapp"></div>
          <div class="field"><label for="oWc">WeChat ID</label><input class="input" id="oWc" v-model="o.wechat"></div>
          <div></div>
          <div class="field" style="grid-column:1/-1"><label for="oAddr">Correspondence address</label><textarea class="input" id="oAddr" v-model="o.address"></textarea></div>
        </div>
        <!-- Joint owners: same owner code, bank and units; each extra person has their own name and contact -->
        <template v-for="(c, i) in o.coOwners" :key="c.key">
          <div class="co-owner-head"><span class="form-sec" style="margin:0">{{ `Owner ${i + 2}` }}</span><button type="button" class="btn btn-sm" @click="removeCoOwner(i)">Remove</button></div>
          <div class="grid-fields">
            <div class="field"><label :for="`coName${i}`" class="req">Full name</label><input class="input" :id="`coName${i}`" v-model="c.fullName" placeholder="e.g. Owner B"></div>
            <div class="field"><label :for="`coIc${i}`">IC / passport</label><input class="input" :id="`coIc${i}`" v-model="c.ic"></div>
            <div class="field"><label :for="`coEmail${i}`">Email</label><input class="input" :id="`coEmail${i}`" type="email" v-model="c.email"></div>
            <div class="field"><label :for="`coPhone${i}`">Phone number</label><input class="input" :id="`coPhone${i}`" v-model="c.phone"></div>
          </div>
        </template>
        <div><button type="button" class="btn" @click="addCoOwner()">+ Add another owner</button>
          <p class="help" style="margin-top:6px" v-if="o.coOwners.length">Joint owners share this owner code, bank account and units. Lists show the names joined with "&amp;".</p></div>
        <template v-if="!acc.viewOnly">
          <div class="form-sec">Bank</div>
          <div class="grid-3">
            <div class="field"><label for="oBank">Bank name</label><input class="input" id="oBank" v-model="o.bankName"></div>
            <div class="field"><label for="oHolder">Account holder name</label><input class="input" id="oHolder" v-model="o.accountHolder"></div>
            <div class="field"><label for="oAcc">Bank account</label><input class="input" id="oAcc" v-model="o.bankAccount" inputmode="numeric"></div>
          </div>
        </template>
        <p class="help" v-else>Bank details are added by Accounting or a Director.</p>
        <div class="field" v-show="!o.isNew"><label for="oWhy" class="req">Reason (audit log)</label><input class="input" id="oWhy" v-model="o.reason" placeholder="e.g. Owner changed bank"></div>
        <template v-if="!o.isNew && o.active !== false && !acc.viewOnly">
          <div class="confirm-box" v-show="o.deactivating">
            <div class="field" style="margin-bottom:10px"><label for="oDeact" class="req">Why deactivate this owner?</label><input class="input" id="oDeact" v-model="o.deactivateReason" placeholder="e.g. Sold the unit"></div>
            <button type="button" class="btn btn-primary" @click="deactivate()" :disabled="busy || !o.deactivateReason.trim()">Deactivate owner</button> <button type="button" class="btn" @click="o.deactivating = false">Keep active</button>
          </div>
        </template>
      </form>
      <div class="drawer-foot">
        <button class="icon-btn trash" style="margin-right:auto" v-if="acc.isDirector && !o.isNew" @click="remove()" :disabled="busy" title="Delete this owner from the system" aria-label="Delete owner">🗑</button>
        <button class="btn" v-show="!acc.viewOnly && !o.isNew && o.active !== false && !o.deactivating" @click="startDeactivate()">Deactivate</button>
        <button class="btn btn-primary" v-show="!acc.viewOnly && !o.isNew && o.active === false" @click="reactivate()" :disabled="busy">Reactivate</button>
        <button class="btn" @click="$emit('close')">Cancel</button>
        <button class="btn btn-primary" type="submit" form="ownerForm" :disabled="busy">{{ o.isNew ? 'Add owner' : 'Save owner' }}</button>
      </div>
    </aside>
  </div>
</template>

<script>
// Owner drawer: view, add or edit an owner, deactivate / reactivate, and delete (Directors, only with no units).
// Used by the Owners page and a property's Owners tab. Tells the page "saved" with the message to show; the page
// closes it and loads again.
import { amt } from '@/lib/format.js';
import { friendlyError } from '@/lib/finance-data.js';
import { useSession } from '@/stores/session.js';
import { askConfirm, showNotice } from '@/lib/confirm.js';
import { PRIVATE, BANK, CO_OWNER_FIELDS, jointName, shortName, arrLabel, ownerUnits, carried, nextOwnerCode, freshOwnerCode, loadPayouts, hasRefs, refreshOwner, noteOnListing,
  saveOwner, deleteOwner, deactivateOwner, reactivateOwner } from '@/lib/portfolio-data.js';

const me = useSession();
let coKey = 0;
const blankCo = c => ({ key: ++coKey, ...Object.fromEntries(CO_OWNER_FIELDS.map(k => [k, String(c?.[k] || '')])) });
// Saved form of the joint owners: trimmed, rows with nothing typed dropped
const cleanCo = list => (list || []).map(c => Object.fromEntries(CO_OWNER_FIELDS.map(k => [k, String(c?.[k] || '').trim()]))).filter(c => CO_OWNER_FIELDS.some(k => c[k]));

export default {
  props: {
    owner: { type: Object, default: null },        // the owner row, or null to add one
    prefill: { type: Object, default: null },      // fields from a new owner listing (Create owner)
    owners: { type: Array, required: true },
    units: { type: Array, required: true },        // units loaded on the page (each owner's units come from these)
    properties: { type: Array, required: true },
    bfLines: { type: Array, required: true },
    asOf: { type: String, required: true },
    propertyId: { type: String, required: true },  // 'all' or the property the page is on (audit log)
    acc: { type: Object, required: true }
  },
  emits: ['close', 'saved', 'busy'],
  data() {
    const own = this.owner, p = own?.private || {};
    return {
      busy: false,
      o: { isNew: !own, id: own?.id || null, code: own?.code || own?.id || '', active: own ? own.active !== false : true,
        deactivatedReason: own?.deactivatedReason || '', original: own, payouts: [], reason: '', error: '', deactivating: false, deactivateReason: '',
        ...Object.fromEntries(PRIVATE.map(k => [k, p[k] ?? (k === 'fullName' ? (own?.name || '') : '')])), coOwners: (p.coOwners || []).map(blankCo), ...(this.prefill || {}) }
    };
  },
  computed: {
    myUnits() { return this.o.id ? ownerUnits(this.units, this.o.id) : []; },
    carriedAmt() { return this.o.id ? carried(this.units, this.bfLines, this.o.id) : 0; },
    pagePropertyId() { return this.propertyId === 'all' ? null : this.propertyId; }
  },
  async created() {
    // Accounting and Directors see the owner's payouts
    if (this.owner && !this.acc.viewOnly) this.o.payouts = await loadPayouts(this.myUnits.map(x => x.id));
  },
  methods: {
    amt, shortName, arrLabel, jointName,
    addCoOwner() {
      this.o.coOwners.push(blankCo());
      const i = this.o.coOwners.length - 1;
      this.$nextTick(() => document.getElementById(`coName${i}`)?.focus());
    },
    removeCoOwner(i) { this.o.coOwners.splice(i, 1); },
    propertyNameOf(id) { return this.properties.find(p => p.id === id)?.name || ''; },
    setBusy(v) { this.busy = v; this.$emit('busy', v); },
    async done(msg, removed = false) {
      await refreshOwner(this.o.id, this.acc.viewOnly, this.acc.ownerNames, removed);
      this.$emit('saved', msg);
    },
    async save() {
      const o = this.o; o.error = '';
      if (!o.fullName.trim()) return o.error = 'Enter the owner\'s full name.';
      if (o.email && !/^\S+@\S+\.\S+$/.test(o.email)) return o.error = 'That email doesn\'t look right.';
      const co = cleanCo(o.coOwners);
      if (co.some(c => !c.fullName)) return o.error = 'Enter a full name for every extra owner, or remove the empty one.';
      if (co.some(c => c.email && !/^\S+@\S+\.\S+$/.test(c.email))) return o.error = "One of the extra owners' emails doesn't look right.";
      // Operations add contact details only; bank details are Accounting's and Directors'.
      const priv = Object.fromEntries(PRIVATE.filter(k => !this.acc.viewOnly || !BANK.includes(k)).map(k => [k, String(o[k] || '').trim()]));
      const before = o.original?.private || {};
      const changed = Object.keys(priv).filter(k => (before[k] ?? (k === 'fullName' ? o.original?.name || '' : '')) !== priv[k]);
      // Joint owners are written only when there are some (or there were), so single owners save exactly as before.
      if (co.length || before.coOwners?.length) {
        priv.coOwners = co;
        if (JSON.stringify(cleanCo(before.coOwners)) !== JSON.stringify(co)) changed.push('coOwners');
      }
      if (!o.isNew && !changed.length) { this.$emit('close'); return; }
      if (!o.isNew && !o.reason.trim()) return o.error = 'Add a short reason. It goes in the audit log.';
      let id = o.id;
      try { id ||= await freshOwnerCode(this.owners); }   // a code nobody uses, also outside my properties
      catch (e) { return o.error = friendlyError(e, 'pick an owner code'); }
      const digits = (priv.bankAccount || '').replace(/\D/g, '');
      this.setBusy(true);
      try {
        await saveOwner(me, { id, isNew: o.isNew, keepMain: this.acc.viewOnly && !o.isNew, active: o.active, bankLast4: digits ? digits.slice(-4) : null,
          priv, changed, reason: o.reason.trim() || 'Added on Portfolio', propertyId: this.pagePropertyId });
        const noted = o.isNew ? await noteOnListing(me, o.fromListing, 'ownerId', id, 'owner') : '';
        o.id = id;
        await this.done(`${jointName(priv.fullName, priv.coOwners) || 'Owner'} saved.${noted}`);
      } catch (e) { o.error = friendlyError(e, 'save the owner'); }
      this.setBusy(false);
    },
    // Safe delete (Directors only): works only when nothing refers to the owner. Otherwise deactivate keeps the history.
    async remove() {
      const o = this.o; o.error = '';
      if (this.busy) return;
      this.setBusy(true);
      try {
        const used = await hasRefs([['units', 'ownerId'], ['agreements', 'ownerId'], ['payoutHistory', 'ownerId']], o.id);
        if (used) { this.setBusy(false); await showNotice(`${o.fullName || 'This owner'} can't be deleted`, `They are still linked to ${used === 'units' ? 'one or more units' : used}. Move the units to another owner first, or use Deactivate to keep the history.`); return; }
        if (!await askConfirm({ title: `Delete ${o.fullName || 'this owner'}?`, message: 'Their record and personal details will be removed from the system for good. This cannot be undone.', confirmText: 'Delete owner', danger: true })) { this.setBusy(false); return; }
        await deleteOwner(me, o, this.pagePropertyId);
        await this.done(`${o.fullName || 'Owner'} deleted.`, true);
      } catch (e) { o.error = friendlyError(e, 'delete the owner'); }
      this.setBusy(false);
    },
    startDeactivate() {
      this.o.deactivating = true;
      this.$nextTick(() => { const el = document.getElementById('oDeact'); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus({ preventScroll: true }); } });
    },
    async deactivate() {
      const o = this.o; o.error = '';
      if (!o.deactivateReason.trim()) return o.error = 'Say why the owner is being deactivated.';
      this.setBusy(true);
      try {
        await deactivateOwner(me, o.id, o.deactivateReason.trim());
        await this.done(`${o.fullName || 'Owner'} deactivated. Nothing was deleted.`);
      } catch (e) { o.error = friendlyError(e, 'deactivate the owner'); }
      this.setBusy(false);
    },
    async reactivate() {
      const o = this.o; o.error = '';
      if (!o.reason.trim()) o.reason = 'Reactivated';
      this.setBusy(true);
      try {
        await reactivateOwner(me, o.id, o.reason.trim());
        await this.done(`${o.fullName || 'Owner'} is active again.`);
      } catch (e) { o.error = friendlyError(e, 'turn the owner back on'); }
      this.setBusy(false);
    }
  }
};
</script>
