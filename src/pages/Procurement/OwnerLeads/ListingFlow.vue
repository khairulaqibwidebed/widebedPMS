<template>
  <main class="content ol-flow">
    <div class="loading-bar" v-show="loading || busy"></div>
    <div class="notice ok" v-show="okMsg">{{ okMsg }}</div>
    <div class="notice error" v-show="error">{{ error }}</div>
    <div class="notice warn" v-if="syncNotes.length"><template v-for="(n, i) in syncNotes" :key="i"><div>{{ n }}</div></template></div>

    <!-- Listings (with the task inbox) open in a panel; with a listing open these sit in its header instead -->
    <div class="ol-bar" v-if="mode && !(mode === 'listing' && l && d)">
      <span class="ol-bar-fill"></span>
      <button type="button" class="ol-tbtn" :class="{ has: hasInbox && newLeads.length }" @click="openPanel(hasInbox && newLeads.length ? 'inbox' : 'list')"
        :aria-label="`Listings: ${leftRows.length} in progress` + (hasInbox ? `, ${newLeads.length} new from the task system` : '')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
        Listings <span class="ol-count">{{ leftRows.length }}</span>
        <span class="ol-new-leads" v-if="hasInbox && newLeads.length">{{ `${newLeads.length} new` }}</span>
      </button>
      <router-link class="btn btn-primary" v-if="canEdit && mode !== 'new'" :to="listingLink('new')">+ New listing</router-link>
    </div>

    <NewLead v-if="mode === 'new'" :properties="properties" @cancel="$router.push('/Procurement/listing-flow')" @saved="onNewSaved" @dirty="v => newDirty = v" />

    <template v-else-if="mode === 'listing' && l && d">
      <div class="ol-head">
        <div class="ol-head-main">
          <div class="ol-kicker"><b>{{ l.id }}</b><span>{{ `Started ${full(l.startedOn)} by ${l.createdByName || '—'}` }}</span></div>
          <h1>{{ placeOf(l) }}</h1>
          <div class="ol-tms">
            <span class="pill" :class="LEAD_STATUS[leadStatus].pill">{{ LEAD_STATUS[leadStatus].label }}</span>
            <span class="muted" :title="'Aging: days to signed, then from signed to live'">{{ agingOf(l, now).text }}</span>
            <span class="ol-sep" aria-hidden="true">|</span>
            <span class="pill" :class="tmsState(l)[1]">{{ `Task system: ${tmsState(l)[0]}` }}</span>
            <span class="muted" v-if="l.tmsTaskId">{{ procTask ? `Procurement task ${procTask.completed ? 'Completed' : procTask.status || 'Open'} · ${procTask.subtasksDone} of ${procTask.subtasksTotal}` : l.tmsSync?.linked === false ? 'Not linked yet' : tasksError ? 'Could not read the task' : '…' }}</span>
            <span class="muted" v-else>Started here, not from a task.</span>
            <button class="editlink" v-if="l.tmsTaskId || d.marketing.taskId" @click="loadTasks()" :disabled="tasksLoading">{{ tasksLoading ? 'Checking…' : 'Refresh' }}</button>
          </div>
        </div>
        <div class="head-tools">
          <button type="button" class="ol-tbtn" :class="{ has: hasInbox && newLeads.length }" @click="openPanel(hasInbox && newLeads.length ? 'inbox' : 'list')"
            :aria-label="`Listings: ${leftRows.length} in progress` + (hasInbox ? `, ${newLeads.length} new from the task system` : '')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
            Listings <span class="ol-count">{{ leftRows.length }}</span>
            <span class="ol-new-leads" v-if="hasInbox && newLeads.length">{{ `${newLeads.length} new` }}</span>
          </button>
          <router-link class="btn btn-primary" v-if="canEdit && mode !== 'new'" :to="listingLink('new')">+ New listing</router-link>
          <div class="more-wrap" v-if="moreItems">
            <button type="button" class="btn more-btn" aria-label="More actions" :aria-expanded="String(moreOpen)" @click="moreOpen = !moreOpen">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
            </button>
            <template v-if="moreOpen">
              <div class="more-back" @click="moreOpen = false"></div>
              <div class="more-menu" role="menu">
                <button type="button" role="menuitem" class="danger-text" v-if="canNotProceed" @click="moreOpen = false; npOpen = true; npReason = ''">Not proceeding</button>
                <button type="button" role="menuitem" v-if="isDirector && leadStatus === 'cancelled'" @click="moreOpen = false; reopen()" :disabled="busy">Reopen</button>
              </div>
            </template>
          </div>
        </div>
      </div>

      <div class="tms-sending" v-if="tmsSending" role="status" aria-live="polite">
        <span>Updating the task system…</span>
        <div class="loading-bar"></div>
      </div>
      <div class="notice warn unsent" v-else-if="l.tmsTaskId && l.tmsSync?.pending">
        <span>{{ `Not sent to task system. ${l.tmsSync.error || 'The last change has not reached the task.'} The change is saved here.` }}</span>
        <button class="btn" v-if="canEdit" @click="sendNow()" :disabled="busy">Send now</button>
      </div>
      <div class="notice warn" v-if="leadStatus === 'cancelled'">{{ `Not proceeding${l.cancelledBy ? ' (' + l.cancelledBy + ')' : ''}: ${l.cancelReason || 'no reason given'}. The listing is read-only${isDirector ? '; Reopen (in the ⋯ menu) brings it back.' : '; only a Director can reopen it.'}` }}</div>
      <div class="notice warn" v-if="leadStatus === 'live' && !d.live.live">The card was moved to Live in the task system, but the Live stage here is not marked yet.</div>
      <div class="notice warn" v-if="remoteChanged">Someone else saved this listing while you were editing. Save keeps your version; Discard shows theirs.</div>
      <div class="notice error" v-show="formError">{{ formError }}</div>

      <!-- Stages: a slim stepper -->
      <nav class="ol-stepper" :style="{ '--n': stageKeys.length }" aria-label="Stages">
        <template v-for="(k, i) in stageKeys" :key="k">
          <button type="button" class="st" :class="{ on: tab === k, done: stageDoneOf(d, k), part: stagePartOf(d, k), now: currentKey === k && !stageDoneOf(d, k) }"
            :aria-current="tab === k ? 'step' : null" @click="openStage(k)">
            <span class="st-track"><span class="st-dot">{{ stageDoneOf(d, k) ? '✓' : stagePartOf(d, k) ? '–' : i + 1 }}</span><span class="st-bar" v-if="i < stageKeys.length - 1"></span></span>
            <b>{{ STAGES[k].short }}</b>
            <small>{{ stageNote(d, k) }}</small>
          </button>
        </template>
      </nav>

      <div class="ol-body">
        <div class="ol-main">
          <StageAgreement v-if="tab === 'agreement'" :d="d" :saved="saved" :can-edit="editable" :n="numberOf('agreement')" />
          <StageServices v-else-if="tab === 'services'" :d="d" :can-edit="editable" :n="numberOf('services')" />
          <StageRenovation v-else-if="tab === 'renovation'" :d="d" :listing-id="l.id" :can-edit="editable" :n="numberOf('renovation')" @copy="copy" />
          <StageFurniture v-else-if="tab === 'furniture'" :d="d" :can-edit="editable" :n="numberOf('furniture')" @copy="copy" />
          <StagePayment v-else-if="tab === 'payment'" :d="d" :listing-id="l.id" :can-edit="editable" :busy="busy" :pdf-busy="pdfBusy" :n="numberOf('payment')" @confirm-payment="confirmPayment" @download-quote="downloadQuote" />
          <StageMarketing v-else-if="tab === 'marketing'" :d="d" :can-edit="editable" :busy="busy" :mk-task="mkTask" :tasks-error="tasksError" :tasks-loading="tasksLoading"
            :n="numberOf('marketing')" @go-live="goLive" @refresh-tasks="loadTasks" />
          <StageLive v-else-if="tab === 'live'" :d="d" :portfolio="l.portfolio || null" :can-edit="editable" :busy="busy" :can-add-portfolio="canAddPortfolio"
            :can-see-contact="canSeeContact" :mk-task="mkTask" :n="numberOf('live')" @mark-live="markLive" @to-portfolio="toPortfolio" />
        </div>

        <!-- Summary: the key facts, and the latest remark -->
        <aside class="ol-side" aria-label="Summary">
          <section class="card ol-sum">
            <h2>Summary</h2>
            <template v-for="f in facts" :key="f[0]">
              <div class="ol-fact"><span>{{ f[0] }}</span><span>{{ f[1] }}</span></div>
            </template>
            <div class="ol-rem">
              <div class="ol-sum-head"><span class="ol-rem-label">Remarks</span><span class="muted">{{ `${d.remarksLog.length} comment${d.remarksLog.length === 1 ? '' : 's'}` }}</span></div>
              <template v-if="lastRemark">
                <div class="rm-meta"><b>{{ lastRemark.byName || 'Earlier remarks' }}</b><template v-if="lastRemark.at">{{ ` · ${stamp(lastRemark.at)}` }}</template></div>
                <p class="rm-text">{{ lastRemark.text }}</p>
              </template>
              <p class="muted ol-rem-none" v-else>No remarks yet.</p>
            </div>
            <div class="ol-sum-btns">
              <button type="button" class="btn" @click="showDetails = true">{{ editable ? 'Edit details' : 'Details' }}</button>
              <button type="button" class="btn" @click="histOpen = true">{{ `History · ${l.history.length}` }}</button>
            </div>
          </section>
        </aside>
      </div>
    </template>

    <div class="card ol-empty" v-else-if="mode === 'listing' && notFound"><p>{{ `No listing ${$route.params.id}, or you can't open it.` }}</p></div>
    <div class="card ol-empty" v-else-if="mode === 'listing'"><SkeletonRows :rows="4" /></div>
    <!-- Nothing open: the panel sits in the page -->
    <!-- Nothing open: the start page, new leads and listings side by side -->
    <template v-else>
      <div class="ol-home-head">
        <div><h1>Listing Flow</h1><p class="muted">Start new owner leads and follow each listing through to Live.</p></div>
        <router-link class="btn btn-primary" v-if="canEdit" :to="listingLink('new')">+ New listing</router-link>
      </div>
      <ListingsPanel home v-model:whose="whose" :has-inbox="hasInbox" :can-edit="canEdit" :busy="busy"
        :leads="newLeads" :status="liveStatus.leads" :error="leadsError" :loaded="leadsLoaded" :rows="leftRows" :loading="listLoading" @start="askStart" />
    </template>

    <!-- The panel over the page (while a listing or New listing is open) -->
    <div class="ol-drawer-back" v-if="panel" @click.self="panel = false" v-esc="() => { panel = false }">
      <aside class="ol-drawer" role="dialog" aria-label="Owner listings">
        <ListingsPanel closable v-model:tab="panelTab" v-model:whose="whose" :has-inbox="hasInbox" :can-edit="canEdit" :busy="busy"
          :leads="newLeads" :status="liveStatus.leads" :error="leadsError" :loaded="leadsLoaded" :rows="leftRows" :loading="listLoading"
          :current-id="l ? l.id : ''" @start="t => { panel = false; askStart(t) }" @close="panel = false" />
      </aside>
    </div>

    <!-- one Save / Discard bar for the whole listing (same as Profile & Appearance) -->
    <div class="save-bar" v-if="editable && mode === 'listing' && dirty" role="region" aria-label="Unsaved listing changes">
      <span>Unsaved changes</span>
      <button class="btn" @click="discard()" :disabled="busy">Discard</button>
      <button class="btn btn-primary" @click="save()" :disabled="busy">Save</button>
    </div>

    <!-- History -->
    <div class="modal-back" v-if="histOpen && l" @click.self="histOpen = false" v-esc="() => { histOpen = false }">
      <div class="modal" role="dialog" aria-label="History" style="max-width:560px;width:calc(100% - 32px)">
        <div class="card-head"><h2>History</h2></div>
        <div class="hist timeline">
          <template v-for="(h, i) in l.history.slice().reverse()" :key="i">
            <div><small>{{ `${stamp(h.at)} · ${h.by}` }}</small><span>{{ h.text }}</span></div>
          </template>
          <p class="muted" v-show="!l.history.length">Nothing yet.</p>
        </div>
        <div class="modal-foot"><button type="button" class="btn" @click="histOpen = false">Close</button></div>
      </div>
    </div>

    <!-- Details -->
    <div class="modal-back" v-if="showDetails && d" @click.self="showDetails = false" v-esc="() => { showDetails = false }">
      <div class="modal details-modal" role="dialog" aria-label="Listing details">
        <div class="notice error" v-show="formError">{{ formError }}</div>
        <div class="card-head"><h2>Details</h2><span class="muted" v-show="dirty">Unsaved changes</span></div>
        <div class="d-grid" v-if="editable">
          <PropertyField :o="d" :properties="properties" id="mdProp" />
          <FormField id="mdUnit" label="Unit" v-model="d.unit" placeholder="e.g. DM 12-03" />
          <FormField id="mdOwner" label="Owner name" v-model="d.ownerName" placeholder="e.g. Owner A" />
          <FormField id="mdDue" label="Due date" type="date" v-model="d.dueDate" />
          <template v-if="canSeeContact">
            <FormField id="mdPhone" label="Owner phone" v-model="c.ownerPhone" inputmode="tel" />
            <FormField id="mdEmail" label="Owner email" type="email" v-model="c.ownerEmail" />
          </template>
          <div class="field"><label for="mdType">Unit type</label><select class="select" id="mdType" v-model="d.unitType"><option value="">Not set</option><template v-for="t in UNIT_TYPES" :key="t"><option :value="t">{{ t }}</option></template></select></div>
          <FormField id="mdSize" label="Size (sq ft)" v-model="d.sizeSqft" inputmode="numeric" placeholder="e.g. 850" />
          <div class="field"><label for="mdSrc">Source</label><select class="select" id="mdSrc" v-model="d.source"><option value="">Not set</option><template v-for="t in SOURCES" :key="t"><option :value="t">{{ t }}</option></template></select></div>
          <div class="field span2"><label for="mdRem">{{ `Remarks (${d.remarksLog.length})` }}</label>
            <div class="rm-list" v-if="d.remarksLog.length">
              <template v-for="(r, i) in d.remarksLog" :key="i">
                <div class="rm-item"><div class="rm-meta"><b>{{ r.byName || 'Earlier remarks' }}</b><template v-if="r.at">{{ ` · ${stamp(r.at)}` }}</template></div><p class="rm-text">{{ r.text }}</p></div>
              </template>
            </div>
            <textarea class="input" id="mdRem" v-model="newRemark" placeholder="Write a comment… e.g. Owner prefers WhatsApp after 6 pm"></textarea>
            <p class="help">Added with Save details, and sent to the task system card as a comment.</p></div>
          <div class="field span2"><label for="mdDesc">Description</label><textarea class="input" id="mdDesc" v-model="d.description"></textarea></div>
        </div>
        <div class="d-grid" v-else>
          <div class="kv"><span>Property</span><span>{{ d.property || '—' }}</span></div>
          <div class="kv"><span>Unit</span><span>{{ d.unit || '—' }}</span></div>
          <div class="kv"><span>Owner</span><span>{{ d.ownerName || '—' }}</span></div>
          <template v-if="canSeeContact">
            <div class="kv"><span>Owner phone</span><span>{{ c.ownerPhone || '—' }}</span></div>
            <div class="kv"><span>Owner email</span><span>{{ c.ownerEmail || '—' }}</span></div>
          </template>
          <div class="kv"><span>Due</span><span>{{ full(d.dueDate) || '—' }}</span></div>
          <div class="kv"><span>Unit type</span><span>{{ d.unitType || '—' }}</span></div>
          <div class="kv"><span>Size</span><span>{{ d.sizeSqft ? `${d.sizeSqft} sq ft` : '—' }}</span></div>
          <div class="kv"><span>Source</span><span>{{ d.source || '—' }}</span></div>
          <div class="span2"><div class="kv"><span>{{ `Remarks (${d.remarksLog.length})` }}</span><span v-if="!d.remarksLog.length">—</span></div>
            <div class="rm-list" v-if="d.remarksLog.length">
              <template v-for="(r, i) in d.remarksLog" :key="i">
                <div class="rm-item"><div class="rm-meta"><b>{{ r.byName || 'Earlier remarks' }}</b><template v-if="r.at">{{ ` · ${stamp(r.at)}` }}</template></div><p class="rm-text">{{ r.text }}</p></div>
              </template>
            </div></div>
          <p class="pre span2" v-if="d.description">{{ d.description }}</p>
        </div>
        <p class="help" v-if="!canSeeContact">Owner phone and email are shown only to Procurement and the Directors.</p>
        <div class="modal-foot"><button type="button" class="btn" @click="showDetails = false">Close</button><button type="button" class="btn btn-primary" v-if="editable" :disabled="busy" @click="save().then(ok => { if (ok) showDetails = false })">Save details</button></div>
      </div>
    </div>

    <!-- Start listing: the lead's details first -->
    <div class="modal-back" v-if="startLead" @click.self="startLead = null" v-esc="() => { startLead = null }">
      <div class="modal" role="dialog" aria-label="Start listing" style="max-width:560px;width:calc(100% - 32px)">
        <div class="card-head"><h2>Start listing</h2></div>
        <p class="help">{{ `"${startLead.title}" gets the next NL number, is linked to its card, and the card moves to In Progress. These can be filled in later too.` }}</p>
        <div class="d-grid">
          <div class="field"><label for="slType">Unit type</label><select class="select" id="slType" v-model="startForm.unitType"><option value="">Not set</option><template v-for="t in UNIT_TYPES" :key="t"><option :value="t">{{ t }}</option></template></select></div>
          <FormField id="slSize" label="Size (sq ft)" v-model="startForm.sizeSqft" inputmode="numeric" placeholder="e.g. 850" />
          <div class="field"><label for="slSrc">Source</label><select class="select" id="slSrc" v-model="startForm.source"><option value="">Not set</option><template v-for="t in SOURCES" :key="t"><option :value="t">{{ t }}</option></template></select></div>
          <div class="field span2"><label for="slRem">Remarks</label><textarea class="input" id="slRem" v-model="startForm.remarks"></textarea></div>
        </div>
        <div class="modal-foot"><button class="btn" @click="startLead = null">Cancel</button><button class="btn btn-primary" @click="confirmStart()" :disabled="busy">Start listing</button></div>
      </div>
    </div>

    <!-- Not proceeding: reason required -->
    <div class="modal-back" v-if="npOpen" @click.self="npOpen = false" v-esc="() => { npOpen = false }">
      <div class="modal" role="dialog" aria-label="Not proceeding" style="max-width:520px;width:calc(100% - 32px)">
        <div class="card-head"><h2>Not proceeding</h2></div>
        <p class="help">The owner is not going ahead. The listing becomes read-only, its card moves to Cancelled, and only a Director can reopen it. Unsaved changes are not saved.</p>
        <div class="field"><label class="req" for="npR">Why?</label><textarea class="input" id="npR" v-model="npReason" placeholder="e.g. Owner sold the unit"></textarea></div>
        <div class="modal-foot"><button class="btn" @click="npOpen = false">Cancel</button><button class="btn btn-primary" @click="notProceeding()" :disabled="busy || !npReason.trim()">Not proceeding</button></div>
      </div>
    </div>
  </main>
</template>

<script>
// Leads & Agreements > Listing Flow: one new owner listing, stage by stage (11 Nov 2026, split from NewListings.vue with
// no change to what a listing does). Addresses:
//   /Procurement/listing-flow               the list on the left, nothing open
//   /Procurement/listing-flow/new           + New listing (no task)
//   /Procurement/listing-flow/NL-0001       one listing, at its current stage
//   /Procurement/listing-flow/NL-0001/payment   one listing, one stage (agreement, services, renovation, furniture, payment, marketing, live)
// Opens with the Owner Leads View tick (so the "Listing is Live" notification works for Operations, read-only); the
// sidebar item shows only with the Edit tick. Everything about a listing that isn't layout is in lib/owner-leads.js.
// Live: the listings list (newest 300) and the open listing through use-live.js; "From task system" polls every 60 s.
// The open listing refreshes by itself when nothing is typed; with unsaved changes it shows a notice instead.
import { collection, doc, query, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase.js';
import { useSession } from '@/stores/session.js';
import { can } from '@/lib/access.js';
import { liveMixin } from '@/lib/use-live.js';
import { askConfirm } from '@/lib/confirm.js';
import { loadProperties } from '@/lib/finance-data.js';
import { listTasksFor, ownerLeads } from '@/lib/tms.js';
import { notifyRole } from '@/services/notificationService';
import { toast } from '@/lib/toast.js';
import { handOff } from '@/lib/handoff.js';
import {
  LINK_TYPE, LIST_LIMIT, STAGES, STAGE_KEYS, PORTFOLIO_ADDERS, CONTACT_READERS, toRow, draftOf, clone, money, rm, depositOf, nowIso, sameData,
  stagesFor, stageDoneOf, stagePartOf, currentKeyOf, stageNote, validate, saveListing, pushListing, loadContact,
  startFromTask, remarkEntry, placeOf, tmsState, full, stamp, errText, listingLink, stageText, serviceFeeOf, quoteTotal, payTypeLabel,
  LEAD_STATUS, UNIT_TYPES, SOURCES, STATUS_MOVERS, LEAD_READERS, statusOf, agingOf, moveCard, setNotProceeding, reopenListing, reconcile
} from '@/lib/owner-leads.js';
import FormField from '@/components/FormField.vue';
import PropertyField from './PropertyField.vue';
import ListingsPanel from './ListingsPanel.vue';
import NewLead from './NewLead.vue';
import StageAgreement from './stages/StageAgreement.vue';
import StageServices from './stages/StageServices.vue';
import StageRenovation from './stages/StageRenovation.vue';
import StageFurniture from './stages/StageFurniture.vue';
import StagePayment from './stages/StagePayment.vue';
import { buildQuotePdf, quoteFileName } from '@/lib/listing-quote-pdf.js';
import { downloadBytes } from '@/lib/agreements/bytes.js';
import StageMarketing from './stages/StageMarketing.vue';
import StageLive from './stages/StageLive.vue';

const BASE = '/Procurement/listing-flow';
const blankContact = () => ({ ownerPhone: '', ownerEmail: '' });

export default {
  components: { FormField, PropertyField, ListingsPanel, NewLead, StageAgreement, StageServices, StageRenovation, StageFurniture, StagePayment, StageMarketing, StageLive },
  mixins: [liveMixin],
  data() {
    const me = useSession();
    return {
      STAGES, LEAD_STATUS, UNIT_TYPES, SOURCES,
      newRemark: '',   // the Remarks "new comment" box: added to d.remarksLog on Save
      uid: me.user?.uid || '', isDirector: me.role === 'director', mover: STATUS_MOVERS.includes(me.role), readsLeads: LEAD_READERS.includes(me.role),
      leads: [], leadsError: '', leadsLoaded: false, leadsIn: false, syncing: false, syncNotes: [], now: Date.now(),
      startLead: null, startForm: {}, npOpen: false, npReason: '',
      canEdit: can(me, 'newOwnerListings.edit'), hasInbox: ['director', 'procurement'].includes(me.role),
      canAddPortfolio: PORTFOLIO_ADDERS.includes(me.role), canSeeContact: CONTACT_READERS.includes(me.role),
      whose: me.role === 'director' ? 'everyone' : 'mine',
      listings: [], listLoading: true, properties: [],
      panel: false, panelTab: me.role === 'director' || me.role === 'procurement' ? 'inbox' : 'list',   // the listings / task inbox panel
      moreOpen: false,     // the header's ⋯ menu (Not proceeding, Reopen)
      tmsSending: false,   // a save or Send now is on its way to the task system (progress bar instead of "Not sent")
      mode: '', l: null, saved: null, d: null, c: blankContact(), c0: blankContact(), tab: 'agreement', wantStage: '', notFound: false, remoteChanged: false, newDirty: false,
      linked: [], tasksLoading: false, tasksError: '', showDetails: false, histOpen: false,
      formError: '', okMsg: '', error: '', loading: false, busy: false, pdfBusy: false
    };
  },
  computed: {
    canNotProceed() { return this.mover && this.canEdit && !['live', 'cancelled'].includes(this.leadStatus); },
    moreItems() { return this.canNotProceed || (this.isDirector && this.leadStatus === 'cancelled'); },
    // The Summary card: the key facts of the open listing
    facts() {
      const d = this.d, fee = serviceFeeOf(d), t = this.mkTask;
      return [
        ['Owner', d.ownerName || '—'],
        ['Unit', [d.unit, d.unitType, d.sizeSqft ? `${d.sizeSqft} sq ft` : ''].filter(Boolean).join(' · ') || '—'],
        ['Source', d.source || '—'],
        ['Due', d.dueDate ? full(d.dueDate) : '—'],
        ['Rent type', fee ? `${fee.label} · fee ${fee.pct}%` : 'Not set'],
        ['Quotation total', rm(quoteTotal(d))],
        ['Payment', `${payTypeLabel(d.payment.type)} · ${stageNote(d, 'payment')}`],
        ...(d.marketing.taskId ? [['Marketing task', t ? `${t.completed ? 'Completed' : t.status || 'Open'} · ${t.subtasksDone} of ${t.subtasksTotal}` : '…']] : [])
      ];
    },
    lastRemark() { const log = this.d?.remarksLog || []; return log[log.length - 1] || null; },
    dirty() { return !!this.d && !!this.saved && (!sameData(this.d, this.saved) || !sameData(this.c, this.c0) || !!this.newRemark.trim()); },
    stageKeys() { return this.d ? stagesFor(this.d) : STAGE_KEYS; },
    currentKey() { return this.d ? currentKeyOf(this.d) : 'agreement'; },
    mkTask() { const id = this.d?.marketing.taskId; return id ? this.linked.find(t => t.id === id) || null : null; },
    procTask() { const id = this.l?.tmsTaskId; return id ? this.linked.find(t => t.id === id) || null : null; },
    linkedIds() { return this.listings.map(x => x.tmsTaskId).filter(Boolean); },
    // From task system: cards on the Owner Leads board with no listing yet (not Cancelled)
    newLeads() { const ids = new Set(this.linkedIds); return this.leads.filter(x => !x.pmsLink && x.status !== 'cancelled' && !ids.has(x.taskId)); },
    // Cards I am assigned to in the TMS
    myTaskIds() { return new Set(this.leads.filter(x => (x.assigneeUids || []).includes(this.uid)).map(x => x.taskId)); },
    // Left column: not Live or Not proceeding; mine (I started it, or I'm on its card in the TMS) or everyone's, newest NL first.
    leftRows() {
      return this.listings.filter(x => !['live', 'cancelled'].includes(statusOf(x))
        && (this.whose === 'everyone' || x.createdByUid === this.uid || this.myTaskIds.has(x.tmsTaskId))).sort((a, b) => b.id.localeCompare(a.id));
    },
    leadStatus() { return this.l ? statusOf(this.l) : 'progress'; },
    // Not proceeding listings are read-only (a Director reopens them first)
    editable() { return this.canEdit && this.leadStatus !== 'cancelled'; }
  },
  created() { this.applyRoute(this.$route); },
  mounted() {
    loadProperties().then(list => { this.properties = list; }).catch(e => console.error('Could not load properties:', e));
    this.live('list', query(collection(db, 'newOwnerListings'), orderBy('createdAt', 'desc'), limit(LIST_LIMIT)),
      rows => { const first = this.listLoading; this.listings = rows.map(toRow); this.listLoading = false; if (first) this.sync(); },
      { onError: e => { this.error = e.friendly; this.listLoading = false; } });
    // The TMS Owner Leads board, every 60 s (pauses while the tab is hidden)
    if (this.readsLeads) this.livePoll('leads', () => this.pollLeads(), 60000,
      { onError: e => { this.leadsError = `${e.message} New owner leads can't be shown right now; it tries again by itself.`; this.leadsLoaded = true; } });
    window.addEventListener('beforeunload', this.warn);
  },
  unmounted() { window.removeEventListener('beforeunload', this.warn); },
  watch: {
    $route(to) { this.panel = false; this.moreOpen = false; if (to.path.startsWith(BASE)) this.applyRoute(to); },
    // A stage hidden in Types of service while it is open: back to Types of service.
    stageKeys(keys) { if (this.d && !keys.includes(this.tab)) this.tab = 'services'; }
  },
  // Another listing, + New listing or another page with unsaved changes: ask first. Switching stages doesn't ask.
  async beforeRouteUpdate(to, from) {
    if (to.params.id === from.params.id || !this.unsaved()) return true;
    const ok = await this.askLeave();
    if (ok) this.okMsg = '';
    return ok;
  },
  async beforeRouteLeave() { return this.unsaved() ? this.askLeave() : true; },
  methods: {
    openPanel(tab) { this.panelTab = this.hasInbox ? tab : 'list'; this.panel = true; },
    stageDoneOf, stagePartOf, stageNote, stageText, agingOf, placeOf, tmsState, full, stamp, listingLink,
    numberOf(k) { return this.stageKeys.indexOf(k) + 1; },
    unsaved() { return this.mode === 'new' ? this.newDirty : this.editable && this.dirty; },
    async pollLeads() {
      this.leads = await ownerLeads(); this.leadsError = ''; this.leadsLoaded = true; this.leadsIn = true; this.now = Date.now();
      await this.sync();
    },
    listLoadingNow() { return this.listLoading; },
    // Bring the listings in line with the cards (Directors and Procurement), once the list and the board are both in.
    async sync() {
      if (this.syncing || this.listLoadingNow() || !this.leadsIn) return;
      this.syncing = true;
      try { this.syncNotes = await reconcile(this.leads, this.listings); } finally { this.syncing = false; }
    },
    askLeave() { return askConfirm({ title: 'Leave without saving?', message: 'Your unsaved changes to this listing will be lost.', confirmText: 'Leave', danger: true }); },
    // Closing or reloading the browser tab: the browser's own "Leave site?" warning
    warn(e) { if (!this.unsaved()) return; e.preventDefault(); e.returnValue = ''; },

    // ----- the address decides what is open -----
    applyRoute(route) {
      const id = route.params.id ? String(route.params.id) : '';
      if (id === 'new') {
        if (!this.canEdit) { this.$router.replace(BASE); return; }
        this.closeListing(); this.mode = 'new'; this.newDirty = false;
        return;
      }
      if (!id) { this.closeListing(); this.mode = ''; return; }
      if (!this.l || this.l.id !== id || this.mode !== 'listing') this.openListing(id);
      this.pickStage(route.params.stage);
    },
    pickStage(stage) {
      if (!this.d) { this.wantStage = stage || ''; return; }
      this.tab = this.stageKeys.includes(stage) ? stage : this.currentKey;
    },
    openStage(k) { if (this.l) this.$router.replace(`${listingLink(this.l.id)}/${k}`); },
    closeListing() {
      this.stopLive('one');
      Object.assign(this, { l: null, saved: null, d: null, newRemark: '', c: blankContact(), c0: blankContact(), notFound: false, remoteChanged: false, linked: [], tasksError: '', formError: '', showDetails: false, histOpen: false });
    },
    // One listing, live. The owner's contact (private part) is read once, for those who see it.
    openListing(id) {
      this.closeListing();
      this.mode = 'listing'; this.loading = true;
      if (this.canSeeContact) loadContact(id).then(c => { if (this.l?.id === id || (!this.l && this.$route.params.id === id)) { this.c0 = c; this.c = { ...c }; } });
      this.live('one', doc(db, 'newOwnerListings', id), row => this.onRow(id, row),
        { onError: e => { this.loading = false; if (e.code === 'permission-denied') this.notFound = true; else this.error = e.friendly; } });
    },
    onRow(id, row) {
      this.loading = false;
      if (!row) { this.notFound = true; this.l = null; this.d = null; return; }
      const r = toRow(row), first = !this.l || this.l.id !== id;
      if (first) {
        this.l = r; this.saved = draftOf(r); this.d = clone(this.saved);
        this.pickStage(this.wantStage || this.$route.params.stage); this.wantStage = '';
        this.loadTasks();
        return;
      }
      this.l = r;
      if (this.busy) return;   // our own save on its way: save() settles the draft
      const theirs = draftOf(r);
      if (sameData(theirs, this.saved)) return;
      if (!this.dirty) { this.saved = theirs; this.d = clone(theirs); this.remoteChanged = false; }
      else this.remoteChanged = true;
    },
    discard() {
      this.newRemark = '';
      this.saved = draftOf(this.l); this.d = clone(this.saved); this.c = { ...this.c0 }; this.formError = ''; this.remoteChanged = false;
    },
    // The linked tasks (Procurement and Marketing), read once on open and on Refresh.
    async loadTasks() {
      if (!this.l || (!this.l.tmsTaskId && !this.d?.marketing.taskId)) return;
      this.tasksLoading = true; this.tasksError = '';
      try { this.linked = await listTasksFor(LINK_TYPE, this.l.id); }
      catch (e) { this.tasksError = e.message; }
      this.tasksLoading = false;
    },
    async copy(text) {
      try { await navigator.clipboard.writeText(text); toast('Copied. Paste it into WhatsApp.'); }
      catch (_) { toast('Could not copy here. Select the text and copy it by hand.'); }
    },

    // ----- saving -----
    // Saves the whole listing, then sends it to the linked task. Resolves true when saved.
    async save({ completed, live = false } = {}) {
      if (!this.editable || this.busy || !this.d) return false;
      const err = validate(this.d, this.c);
      if (err) { this.formError = err; window.scrollTo(0, 0); return false; }
      this.busy = true; this.formError = '';
      // A new comment in the Remarks box joins the history (and becomes the latest remarks) with this save
      const note = this.newRemark.trim(), keepRemarks = this.d.remarks;
      if (note) { this.d.remarksLog.push(remarkEntry(note)); this.d.remarks = note; }
      try {
        let res;
        try { res = await saveListing({ l: this.l, before: this.saved, d: this.d, c: this.c, c0: this.c0, live }); }
        catch (e) { if (note) { this.d.remarksLog.pop(); this.d.remarks = keepRemarks; } throw e; }
        if (note) this.newRemark = '';
        const { contact, statusChanged } = res;
        this.saved = clone(this.d); this.c0 = { ...contact }; this.c = { ...contact }; this.remoteChanged = false;
        this.okMsg = `${this.l.id} saved.`;
        if (this.l.tmsTaskId) {
          this.tmsSending = true;
          try { const r = await pushListing(this.l, { completed }); this.okMsg = r.message; if (r.sent) this.loadTasks(); }
          catch (e) { this.formError = errText(e, 'note the task system result'); }
          // Signed / Live: the card on the Owner Leads board follows
          if (statusChanged) { try { this.okMsg += (await moveCard(this.l, statusChanged)).message; } catch (e) { console.error(e); } }
          this.tmsSending = false;
        }
        this.busy = false;
        return true;
      } catch (e) { this.formError = errText(e, 'save the listing'); }
      this.busy = false;
      return false;
    },
    async sendNow() {
      if (this.busy) return;
      this.busy = true; this.formError = ''; this.tmsSending = true;
      try {
        const r = await pushListing(this.l); this.okMsg = r.message; if (r.sent) this.loadTasks();
        if (this.l.tmsSync?.pendingStatus) this.okMsg += (await moveCard(this.l, this.l.tmsSync.pendingStatus)).message;
      } catch (e) { this.formError = errText(e, 'send to the task system'); }
      this.busy = false; this.tmsSending = false;
    },
    // kind: 'full' (Payment confirmed), 'deposit' (Deposit received) or 'balance' (Balance received).
    // Marketing starts once the money is in (Khairul 11 Nov): Full payment confirmed, or the deposit received. Those
    // notify the Marketing team; Balance received only marks the listing paid in full (payment.confirmed).
    async confirmPayment(kind = 'full') {
      const d = this.d, p = d.payment, total = money(p.amount);
      if (!(total > 0)) { this.formError = 'Add the final amount before confirming the payment.'; return; }
      if (kind !== 'full') {
        if (!(depositOf(d) > 0)) { this.formError = 'Add the deposit amount first.'; return; }
        if (depositOf(d) >= total) { this.formError = 'The deposit must be less than the final amount.'; return; }
      }
      if (kind === 'balance' && !p.deposit.received) { this.formError = 'Confirm the deposit first.'; return; }
      const me = useSession();
      const keep = clone(p), keepMk = clone(d.marketing), at = nowIso();
      const who = { receivedByUid: me.user.uid, receivedByName: me.name, receivedAt: at };
      // Marketing is told once: on Payment confirmed or Deposit received (an older Marketing task counts as told)
      const tell = kind !== 'balance' && !d.marketing.notifiedAt && !d.marketing.taskId;
      if (kind === 'deposit') Object.assign(p.deposit, { received: true, ...who });
      else {
        if (kind === 'balance') Object.assign(p.balance, { received: true, ...who });
        Object.assign(p, { confirmed: true, confirmedByUid: me.user.uid, confirmedByName: me.name, confirmedAt: at });
      }
      if (tell) Object.assign(d.marketing, { notifiedAt: at, notifiedByName: me.name });
      if (!(await this.save())) { d.payment = keep; d.marketing = keepMk; return; }
      const l = this.l;
      const done = kind === 'deposit' ? `deposit ${rm(p.deposit.amount)} received` : kind === 'balance' ? 'balance received, paid in full' : 'payment confirmed';
      if (!tell) { this.okMsg = `${l.id}: ${done}.`; return; }
      // The Marketing team's bell: one role notification, opened straight to this listing.
      const items = d.marketing.items.filter(m => m.on).map(m => m.title);
      try {
        await notifyRole({ recipientRole: 'marketing', type: 'listing', refId: l.id, link: listingLink(l.id),
          title: `New listing for Marketing: ${l.id}`,
          message: `${kind === 'deposit' ? 'Deposit received' : 'Payment confirmed'} for ${placeOf(d)}.` + (items.length ? ` Marketing: ${items.join(', ')}.` : '') });
        this.okMsg = `${l.id}: ${done} and the Marketing team notified.`;
      } catch (e) {
        console.error('Notification failed:', e);
        this.okMsg = `${l.id}: ${done}. The Marketing notification could not be sent: ${e.message}`;
      }
    },
    // Quotation PDF of what the Payment stage shows (unsaved changes included). Owner phone and email only for
    // Directors and Procurement.
    async downloadQuote() {
      if (this.pdfBusy) return;
      this.pdfBusy = true; this.formError = '';
      try {
        const l = { ...this.d, id: this.l.id };
        const bytes = await buildQuotePdf(l, { contact: this.canSeeContact ? this.c : null, by: useSession().name });
        downloadBytes(bytes, quoteFileName(l));
        if (this.dirty) toast('The PDF includes your unsaved changes.');
      } catch (e) { this.formError = `Could not make the quotation PDF: ${e.message || e}`; }
      this.pdfBusy = false;
    },
    async goLive() {
      await this.markLive();
      if (!this.d.live.live) return;
      this.openStage('live');
      // Operations takes over (property, unit and owner in Portfolio, the Ops WhatsApp group): one role notification.
      const l = this.l;
      try {
        await notifyRole({ recipientRole: 'operations', type: 'listing', refId: l.id, link: listingLink(l.id),
          title: `Listing is Live: ${l.id}`, message: `${placeOf(this.d)} is Live. Please take over the handover (Portfolio and the Ops WhatsApp group).` });
        this.okMsg += ' Operations notified.';
      } catch (e) {
        console.error('Notification failed:', e);
        this.okMsg += ` The Operations notification could not be sent: ${e.message}`;
      }
    },
    async markLive() {
      const d = this.d;
      if (!stageDoneOf(d, 'marketing')) { this.formError = 'Finish the marketing checklist (every item ticked) before going Live.'; return; }
      const keep = clone(d.live);
      Object.assign(d.live, { live: true, at: nowIso(), byName: useSession().name, overrideReason: '' });
      if (!(await this.save({ completed: true, live: true }))) { this.d.live = keep; return; }
      const l = this.l;
      this.okMsg = !l.tmsTaskId ? `${l.id} is Live.` : l.tmsSync?.pending ? `${l.id} is Live. Not sent to task system: ${l.tmsSync.error}` : `${l.id} is Live and its task is completed.`;
    },
    // Create property / unit / owner: the Portfolio add form opens filled in from this listing. Handed over in memory,
    // not in the address (the owner's phone and email). Portfolio finds the property for a unit by the id recorded here
    // or by its name.
    toPortfolio(kind) {
      const d = this.d, pf = this.l.portfolio || {};
      handOff({ kind, listingId: this.l.id, property: d.property.trim(), unit: d.unit.trim(), ownerName: d.ownerName.trim(),
        ownerPhone: this.canSeeContact ? this.c.ownerPhone.trim() : '', ownerEmail: this.canSeeContact ? this.c.ownerEmail.trim() : '',
        serviceFee: serviceFeeOf(d),   // Types of service: the unit's service fee, prefilled on Create unit
        recordBack: this.canEdit, portfolio: { propertyId: pf.propertyId || null, unitId: pf.unitId || null, ownerId: pf.ownerId || null } });
      this.$router.push(kind === 'owner' ? '/Portfolio/owners' : kind === 'unit' && pf.propertyId ? `/Portfolio/properties?property=${pf.propertyId}` : '/Portfolio/properties');
    },

    // ----- new listings -----
    askStart(t) { this.startLead = t; this.startForm = { unitType: '', sizeSqft: '', source: '', remarks: '' }; },
    async confirmStart() {
      const t = this.startLead, f = this.startForm;
      this.startLead = null;
      await this.startTask(t, { unitType: f.unitType, sizeSqft: String(f.sizeSqft || '').trim(), source: f.source, remarks: f.remarks.trim() });
    },
    async notProceeding() {
      if (this.busy) return;
      this.busy = true; this.formError = '';
      try {
        const r = await setNotProceeding(this.l, this.npReason);
        this.npOpen = false; this.discard();
        this.okMsg = `${this.l.id} is Not proceeding.${r.message}`;
      } catch (e) { this.formError = errText(e, 'mark the listing Not proceeding'); this.npOpen = false; }
      this.busy = false;
    },
    async reopen() {
      if (this.busy) return;
      this.busy = true; this.formError = '';
      try { const r = await reopenListing(this.l); this.okMsg = `${this.l.id} reopened.${r.message}`; }
      catch (e) { this.formError = errText(e, 'reopen the listing'); }
      this.busy = false;
    },
    async startTask(t, fields = {}) {
      if (this.busy || !(await this.leaveOk())) return;
      this.busy = true; this.error = '';
      try {
        const { id, message } = await startFromTask(t, fields);
        this.busy = false;
        this.discardSilently();
        await this.$router.push(listingLink(id));
        this.okMsg = message;
      } catch (e) { this.error = errText(e, 'start the listing'); this.busy = false; }
    },
    async onNewSaved(id, message) {
      this.newDirty = false;
      await this.$router.push(listingLink(id));
      this.okMsg = message;
    },
    // Before Start listing opens another listing: the same question as switching listings.
    async leaveOk() { return !this.unsaved() || this.askLeave(); },
    discardSilently() { if (this.d) this.discard(); this.newDirty = false; }
  }
};
</script>

<style scoped>
/* Redesign 11 Nov 2026: top buttons, a panel from the right (the app sidebar is on the left), full-width listing */
.ol-flow { display: flex; flex-direction: column; gap: 16px; }
.ol-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.ol-bar-fill { flex: 1 1 40px; }
.ol-tbtn { display: inline-flex; align-items: center; gap: 8px; height: 40px; padding: 0 14px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); font: inherit; font-weight: 600; color: var(--text); cursor: pointer; }
.ol-tbtn:hover { border-color: var(--accent); }
.ol-tbtn.has { border-color: color-mix(in srgb, var(--amber) 45%, var(--border)); }
.ol-new-leads { height: 22px; padding: 0 8px; border-radius: 11px; background: var(--amber); color: #fff; font-size: 12px; font-weight: 600; display: inline-grid; place-items: center; }
.ol-count { background: var(--amber); color: #fff; }
.ol-tdot { width: 8px; height: 8px; border-radius: 4px; background: var(--muted); }
.ol-tbtn.inbox.has .ol-tdot { background: var(--amber); }
.ol-count { min-width: 22px; height: 22px; padding: 0 7px; border-radius: 11px; background: var(--chip); color: var(--text-2); font-size: 12px; font-weight: 600; display: inline-grid; place-items: center; box-sizing: border-box; }

.ol-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-start; gap: 12px 16px; }
.ol-head-main { flex: 1 1 480px; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.ol-kicker { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; font-size: 13px; color: var(--muted); }
.ol-kicker b { color: var(--accent); letter-spacing: .02em; }
.ol-head h1 { margin: 0; font-size: 24px; line-height: 1.25; overflow-wrap: anywhere; }
.ol-tms { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font-size: 13px; }
.ol-sep { color: var(--border); }
.head-tools { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.more-wrap { position: relative; }
.more-btn { width: 40px; padding: 0; display: grid; place-items: center; }
.more-back { position: fixed; inset: 0; z-index: 20; }
.more-menu { position: absolute; right: 0; top: calc(100% + 4px); z-index: 21; min-width: 180px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,.14); padding: 4px; display: flex; flex-direction: column; }
.more-menu button { text-align: left; border: 0; background: none; padding: 10px 12px; border-radius: 8px; font: inherit; cursor: pointer; color: var(--text); }
.more-menu button.danger-text { color: var(--red); }
.more-menu button:hover { background: var(--hover); }
.danger-text { color: var(--red); }

/* Stages: a slim stepper (dot, line to the next stage, name, short note); one row, scrolls sideways when narrow */
.ol-stepper { display: grid; grid-template-columns: repeat(var(--n, 6), minmax(96px, 1fr)); gap: 4px; background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 14px 16px; overflow-x: auto; }
.st { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; min-width: 0; padding: 6px; border: 0; border-radius: 10px; background: none; font: inherit; text-align: left; color: var(--text); cursor: pointer; }
.st:hover { background: var(--hover); }
.st.on { background: var(--accent-soft); }
.st-track { display: flex; align-items: center; gap: 6px; width: 100%; margin-bottom: 2px; }
.st-dot { flex: none; width: 24px; height: 24px; border-radius: 12px; box-sizing: border-box; border: 2px solid var(--border); background: var(--surface); color: var(--muted); display: grid; place-items: center; font-size: 12px; font-weight: 700; }
.st-bar { flex: 1; height: 2px; border-radius: 1px; background: var(--border); }
.st.done .st-dot { background: var(--green); border-color: var(--green); color: #fff; }
.st.done .st-bar { background: var(--green); }
.st.part .st-dot { background: var(--amber); border-color: var(--amber); color: #fff; }
.st.now .st-dot { border-color: var(--accent); color: var(--accent); box-shadow: 0 0 0 4px var(--accent-soft); }
.st.on .st-dot { box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 25%, transparent); }
.st b { font-size: 14px; font-weight: 600; overflow-wrap: anywhere; }
.st small { font-size: 12px; color: var(--muted); }

/* The stage on the left, the Summary on the right; the Summary drops below on a narrow screen */
.ol-body { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start; }
.ol-main { flex: 999 1 560px; min-width: 0; display: flex; flex-direction: column; gap: 16px; }
.ol-side { flex: 1 1 280px; max-width: 360px; display: flex; flex-direction: column; gap: 16px; }
@media (max-width: 900px) { .ol-side { max-width: none; } }
.ol-sum { display: flex; flex-direction: column; gap: 10px; }
.ol-sum h2 { margin: 0; font-size: 15px; }
.ol-sum-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.ol-sum-head .muted { font-size: 12px; }
.ol-fact { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; padding-bottom: 8px; border-bottom: 1px solid var(--line); }
.ol-fact span:first-child { color: var(--muted); flex: none; }
.ol-fact span:last-child { font-weight: 600; text-align: right; overflow-wrap: anywhere; }
.ol-sum .editlink { align-self: flex-start; }
.ol-rem { display: flex; flex-direction: column; gap: 6px; }
.ol-rem-label { font-size: 13px; color: var(--muted); }
.ol-rem-none { margin: 0; font-size: 13px; }
.ol-sum-btns { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 4px; }
.ol-sum-btns .btn { width: 100%; justify-content: center; }
.ol-sum .rm-text { margin: 0; }
.ol-home-head { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 12px 16px; }
.ol-home-head h1 { margin: 0; font-size: 24px; }
.ol-home-head p { margin: 4px 0 0; font-size: 14px; }

/* The panel over the page, sliding in from the right */
.ol-drawer-back { position: fixed; inset: 0; z-index: 60; background: rgba(15, 18, 24, .38); display: flex; justify-content: flex-end; }
.ol-drawer { width: min(440px, 100%); height: 100%; background: var(--surface); box-shadow: -8px 0 32px rgba(0,0,0,.18); animation: drawer-in .25s var(--ease); }
@keyframes drawer-in { from { transform: translateX(40px); opacity: 0; } to { transform: none; opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .ol-drawer { animation: none; } }
.ol-empty p { margin: 0; color: var(--muted); }
.tms-sending { display: grid; gap: 8px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); font-size: 13px; color: var(--text-2); }
.unsent { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
.save-bar { position: fixed; right: 24px; bottom: 24px; z-index: 40; display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,.18); font-weight: 600; animation: bar-in .35s cubic-bezier(.2,.9,.3,1.2); }
.save-bar .btn-primary { animation: save-pulse 1.6s ease-in-out 3; }
@keyframes bar-in { from { transform: translateX(40px); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes save-pulse { 0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 55%, transparent); } 50% { box-shadow: 0 0 0 7px transparent; } }
@media (prefers-reduced-motion: reduce) { .save-bar, .save-bar .btn-primary { animation: none; } }
.hist { display: grid; gap: 10px; }
.hist div { font-size: 13px; border-left: 2px solid var(--line); padding-left: 10px; overflow-wrap: anywhere; }
.hist small { display: block; color: var(--muted); font-size: 11px; }
.timeline { max-height: 520px; overflow-y: auto; padding-right: 4px; gap: 0; }
.timeline div { position: relative; border-left: 2px solid var(--border); padding: 0 0 14px 16px; margin-left: 5px; }
.timeline div:last-of-type { padding-bottom: 0; }
.timeline div::before { content: ''; position: absolute; left: -6px; top: 3px; width: 10px; height: 10px; border-radius: 50%; background: var(--surface); border: 2px solid var(--accent); }
.timeline div:first-child::before { background: var(--accent); }
.details-modal { max-width: 680px; }
.details-modal .card-head { margin-bottom: 12px; }
.d-grid { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 4px 16px; align-items: start; }
.d-grid .span2 { grid-column: 1 / -1; }
.d-grid .kv { margin: 0; }
.field > .select { width: 100%; height: 40px; font-weight: 400; font-size: 14px; padding-left: 12px; }
.pre { white-space: pre-wrap; font-size: 13px; margin: 0; overflow-wrap: anywhere; }
/* Remarks history, like the comments in the task system */
.rm-list { display: grid; gap: 10px; margin: 4px 0 10px; }
.rm-meta { font-size: 12px; color: var(--muted); margin-bottom: 4px; }
.rm-meta b { color: var(--text); font-weight: 600; }
.rm-text { margin: 0; padding: 8px 12px; border-radius: 12px; background: var(--accent-soft); color: var(--text); font-size: 13px; white-space: pre-wrap; overflow-wrap: anywhere; }
textarea.input { height: 80px; padding: 10px 12px; }
@media (max-width: 700px) { .d-grid { grid-template-columns: minmax(0,1fr); } }
</style>

<!-- Stage forms (components in ./stages) share these; kept under .ol-flow so they reach no other page. -->
<style>

.ol-flow .ol-right .card h2 { font-size: 15px; margin: 0; }
.ol-flow .ol-right .card h3 { font-size: 14px; margin: 0; }
.ol-flow .tick { display: inline-flex; gap: 8px; align-items: center; font-size: 13px; margin: 0 16px 8px 0; cursor: pointer; }
.ol-flow .tick input { width: 16px; height: 16px; accent-color: var(--navy); }
.ol-flow .form-sec { font-weight: 600; font-size: 13px; margin: 16px 0 8px; color: var(--text-2); }
.ol-flow .lines td { padding: 8px 10px; }
.ol-flow .lines th { padding: 9px 10px; }
.ol-flow .lines .input { height: 34px; min-width: 120px; }
.ol-flow .lines .input.cost { width: 100px; min-width: 80px; text-align: right; }
.ol-flow .lines .select { height: 34px; }
.ol-flow .wrap { overflow-wrap: anywhere; }
.ol-flow .add-line { margin-top: 6px; }
.ol-flow .totals { margin-top: 14px; max-width: 340px; margin-left: auto; }
.ol-flow .totals .total { border-top: 1px solid var(--border); }
.ol-flow .totals.quote { margin: 0 0 16px auto; max-width: 420px; }
.ol-flow .link-row { display: flex; gap: 12px; justify-content: space-between; font-size: 13px; padding: 4px 0; overflow-wrap: anywhere; }
.ol-flow .link-row a { color: var(--accent); }
.ol-flow .link-add { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
.ol-flow .link-add .input { flex: 1 1 180px; min-width: 0; }
.ol-flow .notes { margin-top: 16px; align-items: start; }
.ol-flow .notes .field { align-content: start; }
.ol-flow .notes textarea { height: 90px; }
.ol-flow .reno th:nth-child(2) { width: 150px; }
.ol-flow .reno th:nth-child(3) { width: 130px; }
.ol-flow .reno th:nth-child(4) { width: 80px; }
.ol-flow .copy { justify-self: start; margin-top: 6px; }
.ol-flow .pre { white-space: pre-wrap; font-size: 13px; margin: 0; overflow-wrap: anywhere; }
.ol-flow .sub-stage { border-top: 1px solid var(--line); padding-top: 12px; margin-top: 12px; }
.ol-flow .sub-stage:first-of-type { border-top: 0; margin-top: 0; padding-top: 0; }
.ol-flow .furn-tools { display: flex; gap: 16px; margin-top: 8px; }
.ol-flow .paste { display: grid; gap: 8px; margin-top: 8px; }
.ol-flow .paste textarea { height: 90px; }
.ol-flow .paste .btn { justify-self: start; }
.ol-flow .done-text { display: flex; gap: 10px; align-items: center; justify-content: space-between; flex-wrap: wrap; margin-top: 10px; padding: 10px 12px; background: var(--green-soft); color: var(--green); border-radius: 8px; font-size: 13px; }
.ol-flow .done-text .copy { margin: 0; }
.ol-flow .mk-items { display: flex; flex-wrap: wrap; gap: 4px 0; margin-bottom: 8px; }
.ol-flow .mk-items .pill { margin: 0 6px 6px 0; }
.ol-flow .actions { display: flex; gap: 10px; align-items: center; justify-content: flex-end; flex-wrap: wrap; margin-top: 16px; }
.ol-flow textarea.input { height: 80px; padding: 10px 12px; }
.ol-flow .ag-opts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.ol-flow .ag-opt { display: flex; gap: 12px; align-items: flex-start; text-align: left; padding: 14px 16px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); color: var(--text); cursor: pointer; font: inherit; transition: border-color .15s, background .15s; }
.ol-flow .ag-opt:hover { border-color: var(--accent); }
.ol-flow .ag-opt b { display: block; font-size: 14px; font-weight: 600; }
.ol-flow .ag-opt small { display: block; font-size: 12px; color: var(--muted); margin-top: 2px; }
.ol-flow .ag-radio { flex: 0 0 18px; width: 18px; height: 18px; margin-top: 1px; border-radius: 50%; border: 2px solid var(--border); background: var(--surface); }
.ol-flow .ag-opt.sel { border-color: var(--green); background: var(--green-soft); }
.ol-flow .ag-opt.sel .ag-radio { border-color: var(--green); background: radial-gradient(var(--green) 0 4px, var(--surface) 5px); }
.ol-flow .ag-opt.amber.sel { border-color: var(--amber, #d97706); background: var(--amber-soft, #fef3c7); }
.ol-flow .ag-opt.amber.sel .ag-radio { border-color: var(--amber, #d97706); background: radial-gradient(var(--amber, #d97706) 0 4px, var(--surface) 5px); }
.ol-flow .ag-more { margin-top: 12px; padding: 14px 16px; border-radius: 12px; background: color-mix(in srgb, var(--text) 4%, var(--surface)); }
@media (max-width: 600px) { .ol-flow .ag-opts { grid-template-columns: minmax(0, 1fr); } }
.ol-flow .amt-row { display: flex; gap: 12px; align-items: center; }
.ol-flow .amt-row .editlink { white-space: nowrap; }
.ol-flow .th-all { display: inline-flex; gap: 6px; align-items: center; cursor: pointer; font-weight: 500; }
.ol-flow .th-all input { width: 16px; height: 16px; accent-color: var(--accent); }
.ol-flow .mk-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin: 14px 0 10px; }
.ol-flow .mk-count { font-size: 12px; font-weight: 600; color: var(--text-2); text-transform: uppercase; letter-spacing: .04em; }
.ol-flow .mk-all { font-weight: 600; margin: 0; }
.ol-flow .mk-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 8px; }
.ol-flow .mk-tile { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; font-size: 13px; cursor: pointer; background: var(--surface); transition: border-color .15s, background .15s; }
.ol-flow .mk-tile:hover { border-color: var(--accent); }
.ol-flow .mk-tile.on { border-color: var(--green); background: var(--green-soft); font-weight: 600; }
.ol-flow .mk-tile input { width: 16px; height: 16px; flex: none; accent-color: var(--green); }
.ol-flow .mk-tile span { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.ol-flow .mk-x { flex: none; width: 22px; height: 22px; border: 0; border-radius: 6px; background: none; color: var(--muted); font-size: 16px; line-height: 1; cursor: pointer; }
.ol-flow .mk-x:hover { background: var(--red-soft); color: var(--red); }
.ol-flow .mk-add { display: flex; gap: 8px; margin: 12px 0 4px; }
.ol-flow .mk-add .input { flex: 1; min-width: 0; }
.ol-flow .ho-line { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap; }
.ol-flow .ho-line > .help { flex: 1 1 320px; }
.ol-flow .create-wrap { position: relative; width: 120px; margin-left: auto; }
.ol-flow .create-wrap > .btn { width: 100%; }
.ol-flow .create-back { position: fixed; inset: 0; z-index: 20; }
.ol-flow .create-menu { position: absolute; left: 0; right: 0; width: 100%; bottom: calc(100% + 4px); z-index: 21; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 6px 18px rgba(0,0,0,.12); padding: 4px; display: flex; flex-direction: column; }
.ol-flow .create-menu button { text-align: left; border: 0; background: none; padding: 8px 10px; border-radius: 6px; font: inherit; cursor: pointer; color: var(--text); }
.ol-flow .create-menu button:hover { background: var(--accent-soft); color: var(--accent); }
</style>
