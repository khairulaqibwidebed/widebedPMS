<template>
  <main class="content soft-page">
    <div class="page-head">
      <div><h1>Salary advance</h1><div class="sub">Ask HR for part of your salary early. How it works: <RouterLink to="/HR/sops/advance">Advance SOP</RouterLink></div></div>
    </div>

    <section class="card" v-if="intern">
      <p style="margin:0">Salary advances are not available for interns. Ask HR if you think this is wrong.</p>
    </section>

    <template v-else>
    <!-- HR and Directors: the requests, the signature and its log on the same page (5 Nov 2026), one sidebar item -->
    <div class="tabs" v-if="staffSide">
      <button type="button" :class="{ on: tab === 'requests' }" @click="go('requests')">Requests</button>
      <button type="button" :class="{ on: tab === 'signature' }" @click="go('signature')">Signature</button>
      <button type="button" v-if="isDirector" :class="{ on: tab === 'log' }" @click="go('log')">Signature log</button>
      <button type="button" :class="{ on: tab === 'mine' }" @click="go('mine')">My advances</button>
    </div>
    <Advances v-if="staffSide" v-show="tab !== 'mine'" :tab="tab" />
    <div v-show="tab === 'mine'">
    <div class="notice ok" v-show="okMsg">{{ okMsg }}</div>
    <div class="notice error" v-show="loadErr">{{ loadErr }}</div>
    <div class="loading-bar" v-show="loading"></div>

    <section class="card">
      <div class="card-head"><h2>My advances</h2>
        <span class="head-r"><span class="help">{{ list.length ? `${list.length} request${list.length === 1 ? '' : 's'}` : '' }}</span>
          <button class="btn btn-primary" type="button" :disabled="loading || !!loadErr || !(limit > 0)" @click="newOpen = true; okMsg = ''">New request</button></span></div>
      <div class="notice" v-if="!loading && !loadErr && !(limit > 0)" style="margin-bottom:12px">HR has not set up your salary details yet, so you can't request an advance. Ask HR first.</div>
      <Paged :items="list" v-slot="{ pageRows }">
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Ref</th><th>Sent</th><th class="num">Amount</th><th>Status</th><th></th></tr></thead>
            <tbody>
              <tr class="clickable" v-for="a in pageRows" :key="a.id" @click="open(a)">
                <td>{{ a.ref }}</td><td>{{ when(a.createdAt) }}</td>
                <td class="num">{{ rm(a.approvedAmount ?? a.amount) }}</td>
                <td><span class="pill" :class="st(a)[2]">{{ staffLabel(a) }}</span><span class="by-hr" v-if="a.byHR">Made by HR</span></td>
                <td class="num"><button class="editlink" @click.stop="open(a)">{{ a.status === 'reviewed' ? 'Sign' : 'Open' }}</button></td>
              </tr>
              <SkeletonRows v-if="loading && !list.length" table :cols="6" />
              <tr v-show="!loading && !list.length"><td colspan="6" class="muted">You haven't asked for an advance yet.</td></tr>
            </tbody>
          </table>
        </div>
      </Paged>
    </section>
    </div>
    </template>

    <!-- New request popup (5 Nov 2026) -->
    <div class="modal-back" v-if="newOpen" @click.self="closeNew()" v-esc="() => closeNew()">
      <form class="modal" role="dialog" aria-label="New salary advance request" style="max-width:520px;width:calc(100% - 32px)" @submit.prevent="send()">
        <h2>New request</h2>
        <p class="limit">You can ask for up to <b>{{ rm(limit) }}</b>, 50% of your monthly salary.</p>
        <div class="field"><label for="aAmt" class="req">Amount (RM)</label>
          <input class="input" id="aAmt" type="number" min="1" step="0.01" :max="limit" v-model="amount" placeholder="e.g. 500"></div>
        <div class="field"><label for="aWhy" class="req">Reason</label>
          <textarea class="input" id="aWhy" rows="4" maxlength="1000" v-model="reason" placeholder="e.g. Car repair before payday"></textarea></div>
        <div class="notice error" v-show="err">{{ err }}</div>
        <div class="modal-foot">
          <button class="btn" type="button" @click="closeNew()">Cancel</button>
          <button class="btn btn-primary" type="submit" :disabled="busy">{{ busy ? 'Sending…' : 'Send to HR' }}</button>
        </div>
      </form>
    </div>

    <div class="modal-back" v-if="sel" @click.self="sel = null" v-esc="() => { sel = null }">
      <div class="modal" role="dialog" aria-label="Salary advance" style="max-width:640px;width:calc(100% - 32px)">
        <h2>{{ `${sel.ref} · ${rm(sel.approvedAmount ?? sel.amount)}` }}</h2>
        <div class="notice error" v-show="actErr">{{ actErr }}</div>
        <div class="kv"><span>Status</span><span><span class="pill" :class="st(sel)[2]">{{ staffLabel(sel) }}</span></span></div>
        <div class="kv" v-if="sel.byHR"><span>Made by</span><span>{{ `HR (${sel.reviewedByName || 'HR'})` }}</span></div>
        <template v-if="!sel.byHR">
        <div class="kv"><span>Amount asked</span><span>{{ rm(sel.amount) }}</span></div>
        <div class="kv" v-if="sel.approvedAmount != null"><span>Amount approved</span><span>{{ rm(sel.approvedAmount) }}</span></div>
        </template>
        <div class="kv" v-else><span>Total</span><span>{{ rm(sel.approvedAmount ?? sel.amount) }}</span></div>
        
        <div class="kv" v-if="sel.signMethod"><span>Signed</span><span>{{ SIGN_METHOD[sel.signMethod] }}</span></div>
        <div class="kv" v-if="sel.paidDate"><span>Paid</span><span>{{ dmy(sel.paidDate) + ' · ' + (PAY_TYPES[sel.paymentType] || '') }}</span></div>
        <div class="field" style="margin-top:12px"><label>Reason</label><div class="detail">{{ sel.reason }}</div></div>
        <div class="field" v-if="sel.description"><label>Description</label><div class="detail">{{ sel.description }}</div></div>
        <div class="field" v-if="sel.rejectReason"><label>HR's reason</label><div class="detail">{{ sel.rejectReason }}</div></div>

        <!-- HR made this form (5 Nov 2026): signed on paper only, sent on WhatsApp. Shown here as a record. -->
        <div class="sign-box" v-if="sel.status === 'reviewed' && sel.byHR">
          <h3>Sign the paper form</h3>
          <p class="help" style="margin-top:0">HR made this form and sends it to you on WhatsApp. Sign the paper copy and return it to HR. It can't be signed here.</p>
          <button class="btn" type="button" :disabled="busy" @click="pdf()">Download form (PDF)</button>
        </div>
        <!-- Sign the form: on screen, or download, sign on paper and upload a scan (PDF) or photo -->
        <div class="sign-box" v-else-if="sel.status === 'reviewed'">
          <h3>Sign your form</h3>
          <p class="help" style="margin-top:0">The form already has {{ sel.chloeTold?.signerName || 'the Director' }}'s signature. Check it first, then sign.</p>
          <button class="btn" type="button" :disabled="busy" @click="pdf()">Download form (PDF)</button>
          <div class="pills brand" style="margin:12px 0 8px">
            <button type="button" class="pill-btn" :class="{ on: signWay === 'drawn' }" @click="signWay = 'drawn'">Sign here</button>
            <button type="button" class="pill-btn" :class="{ on: signWay === 'upload' }" @click="signWay = 'upload'">Upload signed copy</button>
          </div>
          <template v-if="signWay === 'drawn'">
            <SignaturePad ref="pad" @change="padDrawn = $event" />
            <label class="check"><input type="checkbox" v-model="agree"><span>I agree that this advance will be deducted from my salary as set out in the Advance SOP.</span></label>
          </template>
          <template v-else>
            <ImageDrop v-model="upload" pdf label="Signed form" :disabled="busy" hint="A scan (PDF) or clear photo of the whole signed form." @error="actErr = $event" />
          </template>
          <div class="row-btns"><button class="btn btn-primary" :disabled="busy || (signWay === 'drawn' ? !(padDrawn && agree) : !upload)" @click="sign()">{{ busy ? 'Saving…' : 'Send signed form to HR' }}</button></div>
        </div>

        <!-- After signing: the form, their signed copy and HR's fully signed copy -->
        <div class="row-btns" style="margin-top:12px" v-if="['signed', 'approved', 'paid'].includes(sel.status)">
          <button class="btn" :disabled="busy" @click="pdf()">Download form (PDF)</button>
          <button class="btn" v-if="signed?.image && signed.method === 'upload'" :disabled="busy" @click="save(signed.image, 'my signed copy')">My uploaded copy</button>
          <button class="btn" v-if="copy?.image" :disabled="busy" @click="save(copy.image, 'fully signed')">Fully signed copy</button>
        </div>

        <div class="field" style="margin-top:12px"><label>History</label>
          <ol class="hist"><li v-for="(h, i) in sel.history || []" :key="i"><b>{{ STEP[h.action] || h.action }}</b> · {{ h.byName }} · {{ when(h.at) }}</li></ol></div>
        <div class="modal-foot">
          <button class="btn" v-if="sel.status === 'submitted'" :disabled="busy" @click="withdraw()">{{ busy ? 'Withdrawing…' : 'Withdraw request' }}</button>
          <button class="btn" @click="sel = null">Close</button>
        </div>
      </div>
    </div>
  </main>
</template>

<script>
// Staff: ask for a salary advance (up to 50% of the monthly salary HR has entered), sign the form HR prepares, and follow it
// under My advances. The salary itself is never read here, only the limit. HR and Directors also get the Requests,
// Signature and Signature log tabs (Advances.vue). Interns don't get this page. Data shape: ./advances.js.
import { createAdvance, loadMyAdvances, getMyLimit, withdrawAdvance, signAdvance, loadForm, loadSigned, loadSignedCopy, imageFile,
  STATUS, STEP, SIGN_METHOD, PAY_TYPES, todayIso } from './advances.js';
import { buildAdvancePdf, advanceFileName } from '@/lib/advance-pdf.js';
import ImageDrop from '@/components/ImageDrop.vue';
import { friendlyError, download } from '@/lib/finance-data.js';
import { rm, dmy } from '@/lib/format.js';
import { useSession } from '@/stores/session.js';
import Advances from './Advances.vue';
import SignaturePad from '@/components/SignaturePad.vue';

const me = useSession();
// HR and Directors open on Requests; My advances is the last tab (5 Nov 2026). A staff link (?id= without a tab) opens My advances.
const TABS = ['requests', 'signature', 'log', 'mine'];

export default {
  components: { Advances, SignaturePad, ImageDrop },
  data() {
    const staffSide = ['hr', 'director'].includes(me.role), isDirector = me.role === 'director';
    const q = this.$route.query.tab;
    const tab = staffSide && TABS.includes(q) && (q !== 'log' || isDirector) ? q : (staffSide && !this.$route.query.id ? 'requests' : 'mine');
    return { intern: !!me.intern, staffSide, isDirector, tab, STATUS, STEP, SIGN_METHOD, PAY_TYPES, limit: null, list: [], loading: true, loadErr: '',
      newOpen: false, amount: '', reason: '', err: '', okMsg: '', busy: false, sel: null, actErr: '',
      signWay: 'drawn', padDrawn: false, agree: false, upload: null, signed: null, copy: null };
  },
  async mounted() {
    if (this.intern) return;
    await this.load();
    const id = this.tab === 'mine' && this.$route.query.id, a = id && this.list.find(x => x.id === id);
    if (a) this.open(a);
  },
  methods: {
    rm, dmy, todayIso,
    // The tab is kept in the address (?tab=requests) so a refresh or a notification lands on it
    go(t) { this.tab = t; this.$router.replace({ query: t === 'requests' ? {} : { tab: t } }); },
    st(a) { return STATUS[a.status] || STATUS.submitted; },
    staffLabel(a) { return a.byHR && a.status === 'reviewed' ? 'Sign the paper form' : this.st(a)[1]; },
    when(t) { return t?.toDate ? t.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Just now'; },
    async load() {
      this.loading = true; this.loadErr = '';
      try { [this.limit, this.list] = await Promise.all([getMyLimit(me.user.uid), loadMyAdvances(me.user.uid)]); }
      catch (e) { this.loadErr = friendlyError(e, 'load your advances'); }
      this.loading = false;
    },
    clear() { this.amount = ''; this.reason = ''; this.err = ''; },
    closeNew() { if (this.busy) return; this.newOpen = false; this.clear(); },
    async send() {
      this.err = ''; this.okMsg = ''; this.busy = true;
      try {
        const ref = await createAdvance(me, this.limit, { amount: this.amount, reason: this.reason });
        this.okMsg = `Sent to HR as ${ref}. You get a notification when HR has reviewed it.`;
        this.clear(); this.newOpen = false; await this.load();
      } catch (e) { this.err = e.code ? friendlyError(e, 'send the request') : e.message; }
      this.busy = false;
    },
    async open(a) {
      Object.assign(this, { sel: a, actErr: '', signWay: 'drawn', padDrawn: false, agree: false, upload: null, signed: null, copy: null });
      if (!['signed', 'approved', 'paid'].includes(a.status)) return;
      try { const [s, c] = await Promise.all([loadSigned(a.id), loadSignedCopy(a.id)]); if (this.sel === a) { this.signed = s; this.copy = c; } }
      catch (e) { this.actErr = friendlyError(e, 'load the signed form'); }
    },
    async withdraw() {
      this.busy = true; this.actErr = '';
      try { await withdrawAdvance(me, this.sel); this.okMsg = `${this.sel.ref} withdrawn.`; this.sel = null; await this.load(); }
      catch (e) { this.actErr = e.code ? friendlyError(e, 'withdraw it') : e.message; }
      this.busy = false;
    },
    async sign() {
      this.busy = true; this.actErr = '';
      try {
        const im = this.signWay === 'drawn' ? this.$refs.pad?.image() : this.upload;
        await signAdvance(me, this.sel, this.signWay, im);
        this.okMsg = `${this.sel.ref} signed and sent to HR.`; this.sel = null; await this.load();
      } catch (e) { this.actErr = e.code ? friendlyError(e, 'save your signature') : e.message; }
      this.busy = false;
    },
    async pdf() {
      this.busy = true; this.actErr = '';
      try {
        const [f, s] = await Promise.all([loadForm(this.sel.id), this.signed ? this.signed : ['signed', 'approved', 'paid'].includes(this.sel.status) ? loadSigned(this.sel.id) : null]);
        if (!f) throw new Error('The form is not ready yet. Ask HR.');
        download(advanceFileName(f), new Blob([await buildAdvancePdf(f, s)], { type: 'application/pdf' }));
      } catch (e) { this.actErr = e.code ? friendlyError(e, 'make the PDF') : e.message; }
      this.busy = false;
    },
    save(dataUrl, what) { const f = imageFile(dataUrl, `Salary Advance ${this.sel.ref} ${what}`); download(f.name, f.blob); }
  }
};
</script>

<style scoped>
.limit { margin: 0 0 14px; font-size: 14px; }
.head-r { display: flex; align-items: center; gap: 12px; }
.by-hr { margin-left: 8px; font-size: 11px; font-weight: 600; color: var(--muted); background: var(--chip); padding: 1px 8px; border-radius: 999px; white-space: nowrap; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 16px; }
@media (max-width: 640px) { .grid2 { grid-template-columns: 1fr; } }
.detail { white-space: pre-wrap; font-size: 13px; background: var(--hover); border: 1px solid var(--line); border-radius: 8px; padding: 12px; }
.hist { margin: 0; padding-left: 18px; font-size: 13px; display: grid; gap: 4px; }
.sign-box { margin-top: 14px; padding: 14px; border: 1px solid var(--border); border-radius: 10px; background: var(--hover); display: grid; gap: 8px; justify-items: start; }
.sign-box h3 { font-size: 14px; margin: 0; }
.sign-box .row-btns { justify-self: stretch; }
.row-btns { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }
.check { display: flex; gap: 10px; align-items: flex-start; font-size: 13px; }
.check input { width: 16px; height: 16px; accent-color: var(--accent); margin-top: 2px; flex: none; }
.preview { max-width: 100%; max-height: 260px; border: 1px solid var(--border); border-radius: 8px; }
</style>
