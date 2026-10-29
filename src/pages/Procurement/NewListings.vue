<template>
  <main class="content">
    <div class="loading-bar" v-show="loading || busy"></div>
    <div class="notice ok" v-show="okMsg">{{ okMsg }}</div>
    <div class="notice error" v-show="error">{{ error }}</div>

    <!-- ========== LIST ========== -->
    <template v-if="view === 'list'">
      <div>
        <div class="page-head">
          <div>
            <h1>New owner listings</h1>
            <div class="sub">{{ canEdit ? 'Each new unit from the signed service agreement to Live. Work comes in as Procurement tasks from the task system.' : 'Each new unit from the signed service agreement to Live. Procurement and the Directors update these; you can view them.' }}</div>
          </div>
          <button class="btn btn-primary" v-if="canEdit" @click="go('new')">+ New listing</button>
        </div>

        <section class="kpis">
          <button type="button" class="card kpi kpi-link" :class="{ on: filter === 'progress' }" @click="kpiGo('progress')"><div class="label">In progress</div><div class="value">{{ count('progress') }}</div><div class="hint">Not live yet</div></button>
          <button type="button" class="card kpi kpi-link" :class="{ on: filter === 'live' }" @click="kpiGo('live')"><div class="label">Live</div><div class="value">{{ count('live') }}</div><div class="hint">Handed over to Operations</div></button>
          <button type="button" class="card kpi kpi-link" :class="{ on: filter === 'unsigned' }" @click="kpiGo('unsigned')"><div class="label">Agreement not signed</div><div class="value" :class="{ alert: count('unsigned') }">{{ count('unsigned') }}</div><div class="hint">Skipped for now</div></button>
          <button type="button" class="card kpi kpi-link" :class="{ on: filter === 'unsent' }" @click="kpiGo('unsent')"><div class="label">Not sent to task system</div><div class="value" :class="{ alert: count('unsent') }">{{ count('unsent') }}</div><div class="hint">Open the listing and Send now</div></button>
        </section>

        <section class="card inbox" v-if="hasInbox" aria-label="From task system">
          <div class="card-head">
            <h2>{{ `From task system${inboxShown().length ? ' · ' + inboxShown().length : ''}` }}</h2>
            <button class="btn" @click="loadInbox()" :disabled="inboxLoading">{{ inboxLoading ? 'Checking…' : 'Refresh' }}</button>
          </div>
          <p class="help" style="margin:-4px 0 12px">Procurement tasks made in the task system that have no listing yet. Start listing makes the NL number and links the task to it.</p>
          <div class="notice warn" v-show="inboxError">{{ inboxError }}</div>
          <p class="muted" v-show="!inboxLoading && !inboxError && !inboxShown().length">No new Procurement tasks.</p>
          <div class="inbox-list">
            <template v-for="t in inboxShown()" :key="t.id">
              <div class="inbox-row">
                <div class="inbox-text">
                  <b>{{ t.title }}</b>
                  <small>{{ [t.dueDate ? `Due ${full(tmsDate(t.dueDate))}` : 'No due date', t.createdByName ? `from ${t.createdByName}` : '', t.status].filter(Boolean).join(' · ') }}</small>
                  <span v-if="t.description">{{ t.description.length > 160 ? t.description.slice(0, 160) + '…' : t.description }}</span>
                </div>
                <button class="btn btn-primary" @click="startFromTask(t)" :disabled="busy">Start listing</button>
              </div>
            </template>
          </div>
        </section>

        <div class="toolbar nol-tools" ref="list">
          <input class="input" type="search" placeholder="Search NL no., property, unit or owner" v-model="search" aria-label="Search listings">
          <OptionPicker v-model="filter" :options="FILTERS.map(f => ({ value: f.key, label: `${f.label} · ${count(f.key)}` }))" label="Status" />
        </div>
        <section class="card">
          <Paged :items="shown()" v-slot="{ pageRows }">
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th>Listing</th><th>Property / unit</th><th>Owner</th><th>Current stage</th><th>Started</th><th>Status</th><th>Task system</th></tr></thead>
              <tbody>
                <template v-for="l in pageRows" :key="l.id">
                  <tr class="clickable" @click="go('listing', l.id)">
                    <td><b>{{ l.id }}</b></td>
                    <td>{{ placeOf(l) }}</td>
                    <td>{{ l.ownerName || '—' }}</td>
                    <td>{{ `${l.stage} · ${STAGES[l.stage - 1].label}` }}</td>
                    <td>{{ full(l.startedOn) }}</td>
                    <td><span class="pill" :class="l.status === 'live' ? 'green' : 'blue'">{{ l.status === 'live' ? 'Live' : 'In progress' }}</span></td>
                    <td><span class="pill" :class="tmsState(l)[1]">{{ tmsState(l)[0] }}</span></td>
                  </tr>
                </template>
                <tr v-show="!loading && !shown().length"><td colspan="7" class="muted">No listings here.</td></tr>
              </tbody>
            </table>
          </div>
          </Paged>
        </section>
        <p class="page-note">Owner phone numbers and emails are shown only to Procurement and the Directors. Photos and videos are kept in Google Drive; each listing holds the links.</p>
      </div>
    </template>

    <!-- ========== NEW (without a task) ========== -->
    <template v-if="view === 'new'">
      <div>
        <button class="back" @click="go('list')">← Back to New owner listings</button>
        <div class="page-head">
          <div>
            <h1>New listing</h1>
            <div class="sub">For a new unit that has no task in the task system. Listings that start as a Procurement task are started from the list instead.</div>
          </div>
          <div class="head-tools">
            <button class="btn" @click="go('list')">Cancel</button>
            <button class="btn btn-primary" @click="saveNew()" :disabled="busy">Save listing</button>
          </div>
        </div>
        <div class="notice error" v-show="formError">{{ formError }}</div>
        <section class="card form-card" style="max-width:760px">
          <div class="grid-fields">
            <div class="field"><label for="nProp">Property</label><select class="select" id="nProp" :value="propChoice(form, 'n')" @change="pickProp(form, 'n', $event.target.value)"><option value="">Choose a property…</option><template v-for="p in properties" :key="p.id"><option :value="p.name">{{ p.name }}</option></template><option value="__new">New property (not in Portfolio yet)…</option></select><input class="input prop-new" v-if="propChoice(form, 'n') === '__new'" v-model="form.property" placeholder="Name of the new property" aria-label="New property name"></div>
            <div class="field"><label for="nUnit">Unit</label><input class="input" id="nUnit" v-model="form.unit" placeholder="e.g. DM 12-03"></div>
            <div class="field"><label for="nOwner">Owner name</label><input class="input" id="nOwner" v-model="form.ownerName" placeholder="e.g. Owner A"></div>
            <div class="field"><label for="nDue">Due date (optional)</label><input class="input" id="nDue" type="date" v-model="form.dueDate"></div>
            <div class="field"><label for="nPhone">Owner phone (optional)</label><input class="input" id="nPhone" v-model="form.ownerPhone" inputmode="tel" placeholder="e.g. 012-345 6789"></div>
            <div class="field"><label for="nEmail">Owner email (optional)</label><input class="input" id="nEmail" type="email" v-model="form.ownerEmail" placeholder="e.g. owner@example.com"></div>
          </div>
          <div class="field"><label for="nDesc">Description (optional)</label><textarea class="input" id="nDesc" v-model="form.description" placeholder="e.g. 2-bedroom unit, owner wants it live before December"></textarea></div>
        </section>
      </div>
    </template>

    <!-- ========== ONE LISTING ========== -->
    <template v-if="view === 'listing' && l">
      <div>
        <button class="back" @click="go('list')">← Back to New owner listings</button>
        <div class="page-head">
          <div>
            <h1>{{ `${l.id} · ${placeOf(l)}` }}</h1>
            <div class="sub">{{ `Started ${full(l.startedOn)} by ${l.createdByName || '—'}${l.ownerName ? ' · owner ' + l.ownerName : ''}` }}</div>
          </div>
        </div>

        <div class="notice warn unsent" v-if="l.tmsTaskId && l.tmsSync?.pending">
          <span>{{ `Not sent to task system. ${l.tmsSync.error || 'The last change has not reached the task.'} The change is saved here.` }}</span>
          <button class="btn" v-if="canEdit" @click="sendNow()" :disabled="busy">Send now</button>
        </div>

        <div class="notice error" v-show="formError">{{ formError }}</div>
        <div class="side-grid">
          <div class="form-card">
            <nav class="nol-steps" aria-label="Stages">
              <template v-for="(s, i) in STAGES" :key="s.key">
                <button type="button" class="step" :class="{ on: tab === i, done: stageDone(d, i), part: stagePart(d, i), now: currentIdx(d) === i && !stageDone(d, i) }" @click="tab = i">
                  <span class="stage-dot"></span><span><b>{{ `${i + 1}. ${s.short}` }}</b><small>{{ stageNote(d, i) }}</small></span>
                </button>
              </template>
            </nav>

            <!-- 1. Service agreement -->
            <section class="card" v-if="tab === 0" aria-label="Service Agreement Signed">
              <div class="card-head"><h2>1. Service Agreement Signed</h2><span class="pill" :class="stageDone(d, 0) ? (d.agreement.signed ? 'green' : 'amber') : 'grey'">{{ d.agreement.signed ? 'Signed' : d.agreement.skipped ? 'Skipped for now' : 'Not yet' }}</span></div>
              <template v-if="canEdit">
                <div class="ag-opts" role="group" aria-label="Service agreement">
                  <button type="button" class="ag-opt" :class="{ sel: d.agreement.signed }" :aria-pressed="d.agreement.signed" @click="d.agreement.signed = !d.agreement.signed">
                    <span class="ag-radio"></span><span><b>Signed</b><small>The owner has signed the service agreement.</small></span>
                  </button>
                  <button type="button" class="ag-opt" :class="{ sel: d.agreement.skipped && !d.agreement.signed, amber: true }" :aria-pressed="d.agreement.skipped && !d.agreement.signed"
                    @click="if (d.agreement.signed || !d.agreement.skipped) { d.agreement.signed = false; d.agreement.skipped = true } else { d.agreement.skipped = false; d.agreement.skipNote = '' }">
                    <span class="ag-radio"></span><span><b>Skip for now</b><small>Start renovation first; record the signing later.</small></span>
                  </button>
                </div>
                <div class="ag-more" v-if="d.agreement.signed">
                  <div class="field" style="margin:0;max-width:220px"><label for="agDate">Date signed</label><input class="input" id="agDate" type="date" v-model="d.agreement.date"></div>
                  <p class="help" style="margin:8px 0 0" v-if="saved.agreement.skipped && !saved.agreement.signed">{{ `It will be recorded as signed during ${STAGES[currentIdx(saved)].label}.` }}</p>
                </div>
                <div class="ag-more amber" v-else-if="d.agreement.skipped">
                  <div class="field" style="margin:0"><label for="agNote">Why is it skipped for now? (required)</label>
                    <textarea class="input" id="agNote" v-model="d.agreement.skipNote" placeholder="e.g. Owner signs when back from overseas; renovation can start"></textarea></div>
                </div>
              </template>
              <template v-else>
                <div class="kv"><span>Signed</span><span>{{ d.agreement.signed ? `Yes, ${full(d.agreement.date)}` : 'No' }}</span></div>
                <div class="kv" v-if="d.agreement.skipped && !d.agreement.signed"><span>Skipped for now</span><span>{{ d.agreement.skipNote }}</span></div>
              </template>
              <div class="kv" v-if="d.agreement.signed && d.agreement.signedDuringStage"><span>Recorded</span><span>{{ `Signed during ${d.agreement.signedDuringStage}` }}</span></div>
              <p class="help" v-if="d.agreement.signed && d.agreement.skipNote">{{ `Earlier skipped: ${d.agreement.skipNote}` }}</p>
              <div class="actions" v-if="canEdit"><span class="muted" v-show="dirty">Unsaved changes</span><button class="btn" v-if="dirty" @click="discard()" :disabled="busy">Discard changes</button><button class="btn btn-primary" @click="save()" :disabled="busy">Save</button></div>
            </section>

            <!-- 2. Renovation -->
            <section class="card" v-if="tab === 1" aria-label="Renovation">
              <div class="card-head"><h2>2. Renovation</h2><span class="muted">{{ `${d.renovation.items.filter(x => x.status === 'done').length} of ${d.renovation.items.length} done` }}</span></div>
              <template v-for="g in renoGroups()" :key="g">
                <div class="form-sec">{{ g }}</div>
                <div class="table-wrap">
                  <table class="table lines reno">
                    <thead><tr><th>Item</th><th>Status</th><th class="num">Cost (RM)</th><th v-if="canEdit"></th></tr></thead>
                    <tbody>
                      <template v-for="it in d.renovation.items.filter(x => x.group === g)" :key="it.id">
                        <tr>
                          <td class="wrap"><input class="input" v-if="canEdit && it.custom" v-model="it.title" placeholder="e.g. Ceiling repair" aria-label="Item"><span v-else>{{ it.title }}</span></td>
                          <td>
                            <select class="select" v-if="canEdit" v-model="it.status" :aria-label="`Status of ${it.title || 'new line'}`"><template v-for="(v, k) in RSTATUS" :key="k"><option :value="k">{{ v[0] }}</option></template></select>
                            <span v-else class="pill" :class="RSTATUS[it.status][1]">{{ RSTATUS[it.status][0] }}</span>
                          </td>
                          <td class="num"><input class="input cost" v-if="canEdit" v-model="it.cost" inputmode="decimal" placeholder="0" :aria-label="`Cost of ${it.title || 'new line'}`"><span v-else>{{ it.cost === '' ? '—' : rm(it.cost) }}</span></td>
                          <td class="num" v-if="canEdit"><button class="editlink" @click="removeLine(d.renovation.items, it)" :aria-label="`Remove ${it.title || 'line'}`">Remove</button></td>
                        </tr>
                      </template>
                    </tbody>
                  </table>
                </div>
                <button class="editlink add-line" v-if="canEdit" @click="addReno(g)">{{ `+ Add line to ${g}` }}</button>
              </template>
              <div class="totals">
                <div class="kv"><span>Item costs</span><span>{{ rm(renoCost(d)) }}</span></div>
                <div class="kv"><span>{{ `Procurement fee ${FEE_PCT}%` }}</span><span>{{ rm(renoFee(d)) }}</span></div>
                <div class="kv total"><span>Total</span><span>{{ rm(renoCost(d) + renoFee(d)) }}</span></div>
              </div>

              <div class="form-sec">Photos and videos (Google Drive links)</div>
              <template v-for="(lk, i) in d.renovation.links" :key="i">
                <div class="link-row"><a :href="lk.url" target="_blank" rel="noopener">{{ lk.label }}</a><button class="editlink" v-if="canEdit" @click="d.renovation.links.splice(i, 1)">Remove</button></div>
              </template>
              <p class="muted" v-show="!d.renovation.links.length">No links yet.</p>
              <div class="link-add" v-if="canEdit">
                <input class="input" v-model="linkAdd.label" placeholder="Label, e.g. Before photos" aria-label="Link label">
                <input class="input" v-model="linkAdd.url" placeholder="https://drive.google.com/…" aria-label="Drive link">
                <button class="btn" @click="addLink()">Add link</button>
              </div>

              <div class="grid-fields notes">
                <div class="field"><label for="rInt">Internal notes (staff only)</label>
                  <textarea class="input" id="rInt" v-if="canEdit" v-model="d.renovation.internalNotes" placeholder="e.g. Contractor quoted two options for the cabinet"></textarea>
                  <p class="pre" v-else>{{ d.renovation.internalNotes || '—' }}</p></div>
                <div class="field"><label for="rOwn">Owner notes</label>
                  <textarea class="input" id="rOwn" v-if="canEdit" v-model="d.renovation.ownerNotes" placeholder="e.g. Painting is done; the cabinet goes in next week"></textarea>
                  <p class="pre" v-else>{{ d.renovation.ownerNotes || '—' }}</p>
                  <button class="btn copy" @click="copy(d.renovation.ownerNotes)" :disabled="!d.renovation.ownerNotes.trim()">Copy for WhatsApp</button></div>
              </div>
              <div class="actions" v-if="canEdit"><span class="muted" v-show="dirty">Unsaved changes</span><button class="btn" v-if="dirty" @click="discard()" :disabled="busy">Discard changes</button><button class="btn btn-primary" @click="save()" :disabled="busy">Save</button></div>
            </section>

            <!-- 3. Furniture -->
            <section class="card" v-if="tab === 2" aria-label="Furniture">
              <div class="card-head"><h2>3. Furniture</h2><span class="muted">{{ furnUsed(d).length ? `${furnUsed(d).filter(f => subDone(d, f.key)).length} of ${furnUsed(d).length} completed` : 'No items yet' }}</span></div>
              <template v-for="f in FURN" :key="f.key">
                <div class="sub-stage" :data-sub="f.key">
                  <div class="card-head" style="margin-bottom:8px"><h3>{{ f.label }}</h3>
                    <span class="pill" :class="subDone(d, f.key) ? 'green' : 'grey'">{{ subDone(d, f.key) ? 'Completed' : d.furniture[f.key].length ? `${d.furniture[f.key].filter(x => x.done).length} of ${d.furniture[f.key].length} ticked` : 'Not needed' }}</span></div>
                  <div class="table-wrap" v-show="d.furniture[f.key].length">
                    <table class="table lines">
                      <thead><tr><th style="width:72px"><label class="th-all" v-if="canEdit" title="Tick or untick every line"><input type="checkbox" :checked="d.furniture[f.key].every(x => x.done)" :indeterminate.prop="d.furniture[f.key].some(x => x.done) && !d.furniture[f.key].every(x => x.done)" @change="d.furniture[f.key].forEach(x => { x.done = $event.target.checked })" :aria-label="`Tick all ${f.label}`"> All</label><template v-else>Added</template></th><th>Item</th><th class="num">RM</th><th v-if="canEdit"></th></tr></thead>
                      <tbody>
                        <template v-for="it in d.furniture[f.key]" :key="it.id">
                          <tr>
                            <td><input type="checkbox" v-model="it.done" v-if="canEdit" :aria-label="`${it.item || 'Line'} added`"><span v-else>{{ it.done ? '✓' : '—' }}</span></td>
                            <td class="wrap"><input class="input" v-if="canEdit" v-model="it.item" placeholder="e.g. Sofa" aria-label="Item"><span v-else>{{ it.item }}</span></td>
                            <td class="num"><input class="input cost" v-if="canEdit" v-model="it.cost" inputmode="decimal" placeholder="0" :aria-label="`RM for ${it.item || 'line'}`"><span v-else>{{ rm(it.cost) }}</span></td>
                            <td class="num" v-if="canEdit"><button class="editlink" @click="removeLine(d.furniture[f.key], it)">Remove</button></td>
                          </tr>
                        </template>
                      </tbody>
                      <tfoot><tr><td></td><td>Total</td><td class="num">{{ rm(sum(d.furniture[f.key])) }}</td><td v-if="canEdit"></td></tr></tfoot>
                    </table>
                  </div>
                  <p class="muted" v-show="!d.furniture[f.key].length">No items yet.</p>
                  <div class="furn-tools" v-if="canEdit">
                    <button class="editlink" @click="addFurn(f.key)">+ Add line</button>
                    <button class="editlink" @click="pasteOpen = pasteOpen === f.key ? '' : f.key">Paste lines</button>
                  </div>
                  <div class="paste" v-if="canEdit && pasteOpen === f.key">
                    <textarea class="input" v-model="pasteText" :aria-label="`Paste ${f.label} lines`" placeholder="One item a line, e.g.&#10;TV RM2500&#10;Linen RM20"></textarea>
                    <button class="btn" @click="pasteLines(f.key)">Add these lines</button>
                  </div>
                  <div class="done-text" v-if="subDone(d, f.key)">
                    <span>{{ f.doneText }}</span>
                    <button class="btn copy" @click="copy(f.doneText)">Copy for WhatsApp</button>
                  </div>
                </div>
              </template>
              <div class="totals">
                <template v-for="f in FURN" :key="f.key"><div class="kv"><span>{{ f.label }}</span><span>{{ rm(sum(d.furniture[f.key])) }}</span></div></template>
                <div class="kv total"><span>Total</span><span>{{ rm(furnTotal(d)) }}</span></div>
              </div>
              <div class="actions" v-if="canEdit"><span class="muted" v-show="dirty">Unsaved changes</span><button class="btn" v-if="dirty" @click="discard()" :disabled="busy">Discard changes</button><button class="btn btn-primary" @click="save()" :disabled="busy">Save</button></div>
            </section>

            <!-- 4. Final quotation & payment -->
            <section class="card" v-if="tab === 3" aria-label="Final quotation and payment">
              <div class="card-head"><h2>4. Final quotation &amp; payment</h2><span class="pill" :class="d.payment.confirmed ? 'green' : 'grey'">{{ d.payment.confirmed ? 'Payment confirmed' : 'Waiting for payment' }}</span></div>
              <template v-for="k in PAY_LINKS" :key="k[0]">
                <div class="field" v-if="canEdit"><label :for="'pay_' + k[0]">{{ `${k[1]} (Google Drive link)` }}</label><input class="input" :id="'pay_' + k[0]" v-model="d.payment[k[0]]" placeholder="https://drive.google.com/…"></div>
                <div class="kv" v-else><span>{{ k[1] }}</span><span><a v-if="d.payment[k[0]]" :href="d.payment[k[0]]" target="_blank" rel="noopener">Open</a><template v-else>—</template></span></div>
              </template>
              <div class="totals quote">
                <div class="kv"><span>{{ `Renovation (incl. ${FEE_PCT}% procurement fee)` }}</span><span>{{ rm(renoCost(d) + renoFee(d)) }}</span></div>
                <div class="kv"><span>Furniture</span><span>{{ rm(furnTotal(d)) }}</span></div>
                <div class="kv total"><span>Quotation total</span><span>{{ rm(quoteTotal(d)) }}</span></div>
              </div>
              <div class="field" v-if="canEdit && !d.payment.confirmed" style="max-width:320px"><label for="payAmt">Final amount (RM)</label>
                <div class="amt-row"><input class="input" id="payAmt" v-model="d.payment.amount" inputmode="decimal" :placeholder="quoteTotal(d).toFixed(2)">
                  <button type="button" class="editlink" v-show="money(d.payment.amount) !== quoteTotal(d)" @click="d.payment.amount = quoteTotal(d).toFixed(2)">Use total</button></div></div>
              <div class="kv" v-else><span>Final amount</span><span>{{ d.payment.amount === '' ? '—' : rm(d.payment.amount) }}</span></div>
              <div class="kv" v-if="d.payment.confirmed"><span>Confirmed</span><span>{{ `${d.payment.confirmedByName}, ${stamp(d.payment.confirmedAt)}` }}</span></div>
              <p class="help">Payment confirmed sends the Marketing team a notification about this listing.</p>
              <div class="actions" v-if="canEdit">
                <span class="muted" v-show="dirty">Unsaved changes</span>
                <button class="btn" v-if="dirty" @click="discard()" :disabled="busy">Discard changes</button><button class="btn" @click="save()" :disabled="busy">Save</button>
                <button class="btn btn-primary" v-if="!d.payment.confirmed" @click="confirmPayment()" :disabled="busy">Payment confirmed</button>
              </div>
            </section>

            <!-- 5. Marketing -->
            <section class="card" v-if="tab === 4" aria-label="Marketing">
              <div class="card-head"><h2>5. Marketing</h2><span class="pill" :class="d.marketing.taskId || d.marketing.notifiedAt ? 'green' : 'grey'">{{ d.marketing.taskId ? 'Sent to Marketing' : d.marketing.notifiedAt ? 'Marketing notified' : 'Not notified' }}</span></div>
              <div class="notice warn" v-if="!d.payment.confirmed && !d.marketing.taskId">Marketing is notified once the final payment is confirmed (stage 4).</div>
              <div class="kv" v-if="d.marketing.notifiedAt"><span>Notified</span><span>{{ `By ${d.marketing.notifiedByName}, ${stamp(d.marketing.notifiedAt)}` }}</span></div>
              <template v-if="!d.marketing.taskId && canEdit && !d.live.live">
                <div class="mk-head">
                  <span class="mk-count">{{ `Marketing checklist · ${d.marketing.items.filter(m => m.on).length} of ${d.marketing.items.length} done` }}</span>
                  <label class="tick mk-all"><input type="checkbox" :checked="d.marketing.items.every(m => m.on)" :indeterminate.prop="d.marketing.items.some(m => m.on) && !d.marketing.items.every(m => m.on)" @change="d.marketing.items.forEach(m => { m.on = $event.target.checked })"> Select all</label>
                </div>
                <div class="mk-grid">
                  <template v-for="(m, i) in d.marketing.items" :key="i">
                    <label class="mk-tile" :class="{ on: m.on }"><input type="checkbox" v-model="m.on"><span>{{ m.title }}</span><button type="button" class="mk-x" @click.prevent="d.marketing.items.splice(i, 1)" :aria-label="`Remove ${m.title}`" title="Remove">×</button></label>
                  </template>
                </div>
                <div class="mk-add"><input class="input" v-model="mkAdd" placeholder="Add another item, e.g. Listing photos shoot" aria-label="New marketing item" @keyup.enter="addMk()"><button class="btn" @click="addMk()" :disabled="!mkAdd.trim()">+ Add</button></div>
              </template>
              <template v-else>
                <div class="mk-items">
                  <template v-for="(m, i) in d.marketing.items.filter(x => x.on)" :key="i"><span class="pill grey">{{ m.title }}</span></template>
                  <span class="muted" v-show="!d.marketing.items.some(x => x.on)">Nothing chosen yet.</span>
                </div>
              </template>
              <template v-if="d.marketing.taskId">
                <div class="kv"><span>Sent</span><span>{{ `${d.marketing.sentByName}, ${stamp(d.marketing.sentAt)}` }}</span></div>
                <div class="kv mk-progress"><span>Marketing task</span><span>{{ mkTask ? `${mkTask.subtasksDone} of ${mkTask.subtasksTotal} done · ${mkTask.completed ? 'Completed' : mkTask.status || 'Open'}` : (tasksError ? 'Could not read the task system' : 'Checking…') }}</span></div>
                <button class="btn" @click="loadTasks()" :disabled="tasksLoading">{{ tasksLoading ? 'Checking…' : 'Refresh' }}</button>
              </template>
              <div class="actions" v-if="canEdit && !d.live.live">
                <span class="muted" v-show="dirty">Unsaved changes</span>
                <button class="btn" v-if="dirty" @click="discard()" :disabled="busy">Discard changes</button><button class="btn" @click="save()" :disabled="busy">Save</button>
                <button class="btn btn-primary" @click="goLive()" :disabled="busy || !stageDone(d, 4)" :title="!d.payment.confirmed ? 'Confirm the payment first (stage 4)' : stageDone(d, 4) ? '' : 'Tick every marketing item first'">Go Live</button>
              </div>
              <p class="help" v-if="d.live.live">{{ `Live since ${stamp(d.live.at)}. Handover to Operations is in stage 6.` }}</p>
            </section>

            <!-- 6. Live -->
            <section class="card" v-if="tab === 5" aria-label="Live">
              <div class="card-head"><h2>6. Live</h2><span class="pill" :class="d.live.live ? 'green' : 'grey'">{{ d.live.live ? 'Live' : 'Not live yet' }}</span></div>
              <template v-if="d.live.live">
                <div class="kv"><span>Marked as Live</span><span>{{ `${d.live.byName}, ${stamp(d.live.at)}` }}</span></div>
                <div class="kv" v-if="d.live.overrideReason"><span>Before Marketing was done</span><span>{{ d.live.overrideReason }}</span></div>
              </template>
              <template v-else-if="canEdit">
                <div class="notice warn" v-if="!stageDone(d, 4)">{{ d.payment.confirmed ? `Finish the marketing checklist first (${d.marketing.items.filter(m => m.on).length} of ${d.marketing.items.length} done, stage 5).` : 'The payment is not confirmed yet (stage 4), so Marketing has not started.' }}</div>
                <div class="notice warn" v-else-if="mkTask && !mkTask.completed">{{ `The Marketing task is not completed yet (${mkTask.subtasksDone} of ${mkTask.subtasksTotal} done).` }}</div>
                <button class="btn btn-primary" @click="markLive()" :disabled="busy || !stageDone(d, 4)">Mark as Live</button>
              </template>
              <p class="muted" v-else>Not live yet.</p>

              <div class="form-sec">Handover to Operations</div>
              <label class="tick" v-if="canEdit"><input type="checkbox" v-model="d.live.opsGroup"> Ops WhatsApp group made</label>
              <div class="kv" v-else><span>Ops WhatsApp group made</span><span>{{ d.live.opsGroup ? 'Yes' : 'No' }}</span></div>
              <div class="ho-line">
              <template v-if="canAddPortfolio">
                <p class="help">{{ 'Each option opens the Portfolio add form filled in from this listing. Check it and press Save there.'
                  + (canSeeContact ? '' : ' Owner phone and email are not filled in: only Directors, Procurement and Operations see them.') }}</p>
              </template>
              <p class="help" v-else>Operations creates these from this listing (the property, unit and owner in Portfolio).</p>
              <div class="ho-foot">
                <div class="ho-btns"><span class="muted" v-show="dirty && canEdit">Unsaved changes</span>
<div class="ho-row"><div class="create-wrap" v-if="canAddPortfolio">
                  <button class="btn" @click="createOpen = !createOpen">Create ▾</button>
                  <template v-if="createOpen">
                    <div class="create-back" @click="createOpen = false"></div>
                    <div class="create-menu">
                      <button @click="createOpen = false; toPortfolio('property')">Property</button>
                      <button @click="createOpen = false; toPortfolio('unit')">Unit</button>
                      <button @click="createOpen = false; toPortfolio('owner')">Owner</button>
                    </div>
                  </template>
                </div>
                <button class="btn" v-if="dirty" @click="discard()" :disabled="busy">Discard changes</button><button class="btn" v-if="canEdit" @click="save()" :disabled="busy">Save</button></div></div>
              </div>
              </div>
              <div class="kv" v-if="l.portfolio && (l.portfolio.propertyId || l.portfolio.unitId || l.portfolio.ownerId)"><span>In Portfolio</span>
                <span>{{ [l.portfolio.propertyId && `property ${l.portfolio.propertyId}`, l.portfolio.unitId && `unit ${l.portfolio.unitId}`, l.portfolio.ownerId && 'owner added'].filter(Boolean).join(' · ') }}</span></div>
            </section>

            <section class="card" aria-label="Listing details" v-if="tab === 0">
              <div class="card-head"><h2>Details</h2><span class="muted" v-show="dirty">Unsaved changes</span></div>
              <div class="d-grid" v-if="canEdit">
                <div class="field"><label for="dProp">Property</label><select class="select" id="dProp" :value="propChoice(d, 'd')" @change="pickProp(d, 'd', $event.target.value)"><option value="">Choose a property…</option><template v-for="p in properties" :key="p.id"><option :value="p.name">{{ p.name }}</option></template><option value="__new">New property (not in Portfolio yet)…</option></select><input class="input prop-new" v-if="propChoice(d, 'd') === '__new'" v-model="d.property" placeholder="Name of the new property" aria-label="New property name"></div>
                <div class="field"><label for="dUnit">Unit</label><input class="input" id="dUnit" v-model="d.unit" placeholder="e.g. DM 12-03"></div>
                <div class="field"><label for="dOwner">Owner name</label><input class="input" id="dOwner" v-model="d.ownerName" placeholder="e.g. Owner A"></div>
                <div class="field"><label for="dDue">Due date</label><input class="input" id="dDue" type="date" v-model="d.dueDate"></div>
                <div class="field"><label for="dPhone">Owner phone</label><input class="input" id="dPhone" v-model="c.ownerPhone" inputmode="tel"></div>
                <div class="field"><label for="dEmail">Owner email</label><input class="input" id="dEmail" type="email" v-model="c.ownerEmail"></div>
                <div class="field span2"><label for="dDesc">Description</label><textarea class="input" id="dDesc" v-model="d.description"></textarea></div>
                <div class="actions span2"><button class="btn" v-if="dirty" @click="discard()" :disabled="busy">Discard changes</button><button class="btn btn-primary" @click="save()" :disabled="busy">Save details</button></div>
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
                <p class="pre span2" v-if="d.description">{{ d.description }}</p>
              </div>
            </section>
          </div>

          <div class="form-card">
            <section class="card" aria-label="Task system">
              <div class="card-head"><h2>Task system</h2><button class="editlink" @click="loadTasks()" :disabled="tasksLoading" v-if="l.tmsTaskId || d.marketing.taskId">Refresh</button></div>
              <template v-if="l.tmsTaskId">
                <div class="kv"><span>Listing status</span><span class="pill" :class="l.status === 'live' ? 'green' : 'blue'">{{ l.status === 'live' ? 'Live' : 'In progress' }}</span></div>
                <div class="kv"><span>Task link</span><span class="pill" :class="tmsState(l)[1]">{{ tmsState(l)[0] }}</span></div>
                <div class="kv"><span>Procurement task</span><span>{{ procTask ? `${procTask.completed ? 'Completed' : procTask.status || 'Open'} · ${procTask.subtasksDone} of ${procTask.subtasksTotal}` : l.tmsSync?.linked === false ? 'Not linked yet' : tasksError ? 'Could not read' : '…' }}</span></div>
                <div class="kv"><span>Last sent</span><span>{{ l.tmsSync?.pending ? 'Not sent' : stamp(l.tmsSync?.at) || '—' }}</span></div>
              </template>
              <p class="muted" v-else>Started here, not from a task.</p>
              <div class="kv" v-if="d.marketing.taskId"><span>Marketing task</span><span>{{ mkTask ? `${mkTask.completed ? 'Completed' : mkTask.status || 'Open'} · ${mkTask.subtasksDone} of ${mkTask.subtasksTotal}` : tasksError ? 'Could not read' : '…' }}</span></div>
              <p class="help" v-show="tasksError">{{ tasksError }}</p>
              <button type="button" class="btn view-details" @click="showDetails = true">View details</button>
              <button type="button" class="btn view-details" style="margin-top:8px" @click="histOpen = true">{{ `History (${l.history.length})` }}</button>
            </section>
          </div>
        </div>
        <div class="modal-back" v-if="histOpen" @click.self="histOpen = false" v-esc="() => { histOpen = false }">
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
        <div class="modal-back" v-if="showDetails" @click.self="showDetails = false" v-esc="() => { showDetails = false }">
          <div class="modal details-modal" role="dialog" aria-label="Listing details">
            <div class="notice error" v-show="formError">{{ formError }}</div>
                <div class="card-head"><h2>Details</h2><span class="muted" v-show="dirty">Unsaved changes</span></div>
                <div class="d-grid" v-if="canEdit">
                  <div class="field"><label for="mdProp">Property</label><select class="select" id="mdProp" :value="propChoice(d, 'd')" @change="pickProp(d, 'd', $event.target.value)"><option value="">Choose a property…</option><template v-for="p in properties" :key="p.id"><option :value="p.name">{{ p.name }}</option></template><option value="__new">New property (not in Portfolio yet)…</option></select><input class="input prop-new" v-if="propChoice(d, 'd') === '__new'" v-model="d.property" placeholder="Name of the new property" aria-label="New property name"></div>
                  <div class="field"><label for="mdUnit">Unit</label><input class="input" id="mdUnit" v-model="d.unit" placeholder="e.g. DM 12-03"></div>
                  <div class="field"><label for="mdOwner">Owner name</label><input class="input" id="mdOwner" v-model="d.ownerName" placeholder="e.g. Owner A"></div>
                  <div class="field"><label for="mdDue">Due date</label><input class="input" id="mdDue" type="date" v-model="d.dueDate"></div>
                  <div class="field"><label for="mdPhone">Owner phone</label><input class="input" id="mdPhone" v-model="c.ownerPhone" inputmode="tel"></div>
                  <div class="field"><label for="mdEmail">Owner email</label><input class="input" id="mdEmail" type="email" v-model="c.ownerEmail"></div>
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
                  <p class="pre span2" v-if="d.description">{{ d.description }}</p>
                </div>
            <div class="modal-foot"><button type="button" class="btn" @click="showDetails = false">Close</button><button type="button" class="btn btn-primary" v-if="canEdit" :disabled="busy" @click="save().then(ok => { if (ok !== false) showDetails = false })">Save details</button></div>
          </div>
        </div>
      </div>
    </template>
  </main>
</template>

<script>
// New owner listings in Firestore:
//   newOwnerListings/{NL-0001}            the unit, owner name, each stage, history, the linked TMS task and its send state
//   newOwnerListings/{id}/private/main    owner phone and email (Director and Procurement only)
//   counters/newOwnerListings             the next NL number (taken in the create transaction)
// Work starts as a Procurement task in the task system (TMS): the "From task system" inbox lists the ones with no listing.
// Every save sends one message to the linked task (a note of what changed, the checklist as its subtasks, completed when
// Live). If the TMS can't be reached the save still happens here and the listing shows "Not sent" with Send now.
import { collection, doc, getDoc, getDocs, query, orderBy, limit, writeBatch, updateDoc, runTransaction, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase.js';
import { useSession } from '@/stores/session.js';
import { audit, friendlyError, loadProperties } from '@/lib/finance-data.js';
import { inbox, link, syncTask, listTasksFor } from '@/lib/tms.js';
import { notifyRole } from '@/services/notificationService';
import { toast } from '@/lib/toast.js';
import { handOff } from '@/lib/handoff.js';
import OptionPicker from '@/components/OptionPicker.vue';

const me = useSession();
// Who edits (the rules say the same). Finance, Operations and Marketing view only.
const EDITORS = ['director', 'procurement', 'marketing'];   // Marketing too (Khairul 27 Oct)
// Who may create properties, units and owners in Portfolio (the rules: Directors and Finance, and Operations create-only).
// Procurement may not, so it sees a note instead of the Create buttons.
const PORTFOLIO_ADDERS = ['director', 'finance', 'operations', 'marketing'];
// Who sees the owner's phone and email (the rules: editors, and Operations read-only).
const CONTACT_READERS = ['director', 'procurement', 'marketing', 'operations'];
const LINK_TYPE = 'newOwnerListing';
const LIST_LIMIT = 300;
const FEE_PCT = 20;   // Procurement fee on renovation item costs
const STAGES = [
  { key: 'agreement', label: 'Service Agreement Signed', short: 'Agreement' },
  { key: 'renovation', label: 'Renovation', short: 'Renovation' },
  { key: 'furniture', label: 'Furniture', short: 'Furniture' },
  { key: 'payment', label: 'Final quotation & payment', short: 'Payment' },
  { key: 'marketing', label: 'Marketing', short: 'Marketing' },
  { key: 'live', label: 'Live', short: 'Live' }
];
const RSTATUS = { notStarted: ['Not started', 'grey'], ongoing: ['Ongoing', 'amber'], done: ['Done', 'green'] };
const RENO_GROUPS = ['General works', 'Kitchen cabinet', 'Cleaning', 'Curtains'];
const RENO_DEFAULT = [
  ['General works', 'Electrical work / general work: pull new cable, add points, fan, light, aircon'], ['General works', 'Painting'],
  ['General works', 'Windows'], ['General works', 'Hacking'],
  ['Kitchen cabinet', 'Custom-made kitchen cabinet'], ['Kitchen cabinet', 'Colour spec'], ['Kitchen cabinet', 'Plumbing work'],
  ['Cleaning', 'Cleaning'], ['Curtains', 'Curtains']
];
const FURN = [
  { key: 'big', label: 'Big furniture', doneText: 'All big furniture has been fully added in.' },
  { key: 'electrical', label: 'Electrical items', doneText: 'All electrical items have been fully added in.' },
  { key: 'essential', label: 'Essential items', doneText: 'All essential items have been fully added in.' }
];
const PAY_LINKS = [['quotationUrl', 'Quotation PDF'], ['invoiceUrl', 'Owner invoice'], ['proofUrl', 'Payment proof']];
const MK_DEFAULT = ['Logo & Branding', 'Website', 'IG', 'FB', 'TikTok', 'Google Business', 'Flyer', 'Social media content'];
const FILTERS = [{ key: 'all', label: 'All' }, { key: 'progress', label: 'In progress' }, { key: 'live', label: 'Live' }, { key: 'unsigned', label: 'Agreement not signed' }, { key: 'unsent', label: 'Not sent' }];
const DETAILS = [['property', 'property'], ['unit', 'unit'], ['ownerName', 'owner name'], ['title', 'title'], ['description', 'description'], ['dueDate', 'due date']];
const SECTIONS = ['agreement', 'renovation', 'furniture', 'payment', 'marketing', 'live'];

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const localIso = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
const nowIso = () => localIso(new Date());
const isoOf = t => (t?.toDate ? localIso(t.toDate()) : typeof t === 'string' ? t : '');
const num = (prefix, n) => `${prefix}-${String(n).padStart(4, '0')}`;
const lineId = () => Math.random().toString(36).slice(2, 10);
const clone = o => JSON.parse(JSON.stringify(o));
const money = v => Math.round((parseFloat(String(v ?? '').replace(/,/g, '')) || 0) * 100) / 100;
const rmText = v => 'RM ' + money(v).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const httpsOk = u => /^https:\/\/\S+$/.test(String(u || '').trim());
const emailOk = e => !e || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const stop = msg => Object.assign(new Error(msg), { plain: true });
const errText = (e, what) => (e.plain ? e.message : friendlyError(e, what));
// TMS due dates are midnight Malaysia time (ISO in UTC): back to the Malaysian calendar date.
const tmsDate = iso => (iso ? new Date(Date.parse(iso) + 8 * 3600e3).toISOString().slice(0, 10) : '');

function blank() {
  return {
    agreement: { signed: false, date: '', skipped: false, skipNote: '', signedDuringStage: null },
    renovation: { items: RENO_DEFAULT.map(([group, title]) => ({ id: lineId(), group, title, status: 'notStarted', cost: '' })), links: [], internalNotes: '', ownerNotes: '' },
    furniture: { big: [], electrical: [], essential: [] },
    payment: { quotationUrl: '', invoiceUrl: '', proofUrl: '', amount: '', confirmed: false, confirmedByUid: null, confirmedByName: '', confirmedAt: '' },
    marketing: { items: MK_DEFAULT.map(title => ({ title, on: false })), taskId: null, sentAt: '', sentByName: '', notifiedAt: '', notifiedByName: '' },
    live: { live: false, at: '', byName: '', overrideReason: '', opsGroup: false }
  };
}
// Older or partial documents get every field (missing sections from blank()).
function withDefaults(data) {
  const b = blank(), out = { ...data };
  for (const k of SECTIONS) out[k] = { ...b[k], ...(data[k] || {}) };
  out.furniture = { ...b.furniture, ...(data.furniture || {}) };
  for (const k of ['property', 'unit', 'ownerName', 'title', 'description', 'dueDate']) out[k] = data[k] || '';
  return out;
}

const subDoneOf = (l, k) => l.furniture[k].length > 0 && l.furniture[k].every(x => x.done);
// Furniture groups that have lines; an empty group (e.g. no electrical items for this unit) is not counted.
const furnUsed = l => FURN.filter(f => l.furniture[f.key].length > 0);
// Each stage counts as done when: 1 signed or skipped for now, 2 every renovation line Done, 3 every furniture line ticked in
// each sub-stage that has lines (empty ones are not needed), 4 payment confirmed, 5 Marketing notified and every checklist line ticked (or an older Marketing task sent), 6 Live.
// The TMS department that holds the listing's task: Procurement, then Marketing once the payment is confirmed, then
// Operations once it is Live.
const deptOf = l => l.live.live ? 'operation' : l.payment.confirmed ? 'marketing' : 'procurement';
function stageDoneOf(l, i) {
  if (i === 0) return l.agreement.signed || (l.agreement.skipped && !!l.agreement.skipNote.trim());
  if (i === 1) return l.renovation.items.length > 0 && l.renovation.items.every(x => x.status === 'done');
  if (i === 2) return furnUsed(l).length > 0 && furnUsed(l).every(f => subDoneOf(l, f.key));
  if (i === 3) return l.payment.confirmed;
  if (i === 4) return !!l.marketing.taskId || (!!l.marketing.notifiedAt && mkDoneOf(l));
  return l.live.live;
}
// Marketing checklist: every line ticked (Khairul 27 Oct: no Go Live before it is 100%).
const mkDoneOf = l => l.marketing.items.length > 0 && l.marketing.items.every(m => m.on);
// Started but not finished (yellow dash on the stage strip, Khairul 27 Oct): some work in the stage, not all of it.
function stagePartOf(l, i) {
  if (stageDoneOf(l, i)) return false;
  if (i === 0) return l.agreement.skipped;   // skipped, the reason not written yet
  if (i === 1) return l.renovation.items.some(x => x.status !== 'notStarted');
  if (i === 2) return FURN.some(f => l.furniture[f.key].some(x => x.done));
  if (i === 3) return PAY_LINKS.some(([k]) => !!l.payment[k]) || money(l.payment.amount) > 0;
  if (i === 4) return !!l.marketing.notifiedAt || l.marketing.items.some(m => m.on);
  return false;
}
const currentIdxOf = l => { if (l.live.live) return 5; const i = STAGES.findIndex((s, k) => !stageDoneOf(l, k)); return i < 0 ? 5 : i; };

// The task's checklist: the stages, with each renovation line and furniture sub-stage on its own.
function checklistOf(l) {
  return [
    { title: 'Service agreement signed', done: l.agreement.signed },
    ...l.renovation.items.filter(x => x.title.trim()).map(x => ({ title: `Renovation: ${x.title.trim()}`, done: x.status === 'done' })),
    ...FURN.map(f => ({ title: `Furniture: ${f.label}`, done: subDoneOf(l, f.key) || (!l.furniture[f.key].length && stageDoneOf(l, 2)) })),
    { title: 'Final quotation & payment confirmed', done: l.payment.confirmed },
    { title: 'Marketing notified', done: !!(l.marketing.taskId || l.marketing.notifiedAt) },
    { title: 'Live', done: l.live.live }
  ];
}

// What changed between two versions of a listing, as short lines (history, audit reason and the task note).
function summarize(a, b, contactChanged) {
  const out = [];
  const det = DETAILS.filter(([k]) => (a[k] || '') !== (b[k] || '')).map(x => x[1]);
  if (det.length) out.push(`Details updated (${det.join(', ')}).`);
  if (contactChanged) out.push('Owner contact details updated.');
  const g0 = a.agreement, g = b.agreement;
  if (g.signed && !g0.signed) out.push(`Service agreement signed${g.date ? ` on ${g.date}` : ''}${g.signedDuringStage ? ` (signed during ${g.signedDuringStage})` : ''}.`);
  else if (g.signed && g.date !== g0.date) out.push(`Agreement date changed to ${g.date}.`);
  if (!g.signed && g0.signed) out.push('Service agreement no longer ticked as signed.');
  if (!g.signed && g.skipped && (!g0.skipped || g.skipNote !== g0.skipNote)) out.push(`Service agreement skipped for now: ${g.skipNote.trim()}`);
  if (!g.signed && !g.skipped && g0.skipped) out.push('Service agreement no longer skipped.');

  const byId = list => Object.fromEntries(list.map(x => [x.id, x]));
  const r0 = byId(a.renovation.items);
  for (const x of b.renovation.items) {
    const o = r0[x.id];
    if (!o) { out.push(`Renovation: added ${x.title.trim()}${money(x.cost) ? ' ' + rmText(x.cost) : ''}.`); continue; }
    if (o.title !== x.title) out.push(`Renovation: ${o.title} renamed to ${x.title.trim()}.`);
    if (o.status !== x.status) out.push(`Renovation: ${x.title.trim()} ${RSTATUS[x.status][0]}.`);
    if (money(o.cost) !== money(x.cost) || (o.cost === '') !== (x.cost === '')) out.push(`Renovation: ${x.title.trim()} cost ${rmText(x.cost)}.`);
  }
  const r1 = byId(b.renovation.items);
  for (const o of a.renovation.items) if (!r1[o.id]) out.push(`Renovation: removed ${o.title}.`);
  const urls0 = a.renovation.links.map(x => x.url), urls1 = b.renovation.links.map(x => x.url);
  for (const x of b.renovation.links) if (!urls0.includes(x.url)) out.push(`Renovation: added link ${x.label}.`);
  for (const x of a.renovation.links) if (!urls1.includes(x.url)) out.push(`Renovation: removed link ${x.label}.`);
  if (a.renovation.internalNotes !== b.renovation.internalNotes) out.push('Renovation internal notes updated.');
  if (a.renovation.ownerNotes !== b.renovation.ownerNotes) out.push('Renovation owner notes updated.');

  for (const f of FURN) {
    const f0 = byId(a.furniture[f.key]), f1 = byId(b.furniture[f.key]);
    for (const x of b.furniture[f.key]) {
      const o = f0[x.id];
      if (!o) { out.push(`${f.label}: added ${x.item.trim()} ${rmText(x.cost)}${x.done ? ' (ticked)' : ''}.`); continue; }
      if (o.item !== x.item) out.push(`${f.label}: ${o.item} renamed to ${x.item.trim()}.`);
      if (money(o.cost) !== money(x.cost)) out.push(`${f.label}: ${x.item.trim()} ${rmText(x.cost)}.`);
      if (o.done !== x.done) out.push(`${f.label}: ${x.item.trim()} ${x.done ? 'ticked' : 'unticked'}.`);
    }
    for (const o of a.furniture[f.key]) if (!f1[o.id]) out.push(`${f.label}: removed ${o.item}.`);
    if (subDoneOf(b, f.key) && !subDoneOf(a, f.key)) out.push(`${f.label} completed. ${f.doneText}`);
  }

  for (const [k, label] of PAY_LINKS) if ((a.payment[k] || '') !== (b.payment[k] || '')) out.push(`${label} link ${b.payment[k] ? (a.payment[k] ? 'changed' : 'added') : 'removed'}.`);
  if (money(a.payment.amount) !== money(b.payment.amount)) out.push(`Final amount ${rmText(b.payment.amount)}.`);
  if (b.payment.confirmed && !a.payment.confirmed) out.push(`Payment confirmed by ${b.payment.confirmedByName}.`);
  if (b.marketing.notifiedAt && !a.marketing.notifiedAt) out.push('Marketing team notified.');

  const mk = x => x.marketing.items.filter(m => m.on).map(m => m.title).join(', ');
  const t0 = a.marketing.items.map(m => m.title), t1 = b.marketing.items.map(m => m.title);
  for (const t of t1) if (!t0.includes(t)) out.push(`Marketing: added ${t}.`);
  for (const t of t0) if (!t1.includes(t)) out.push(`Marketing: removed ${t}.`);
  if (mk(a) !== mk(b)) out.push(`Marketing items: ${mk(b) || 'none'}.`);
  if (b.marketing.taskId && !a.marketing.taskId) out.push(`Sent to Marketing as a task (${b.marketing.items.filter(m => m.on).length} items).`);

  if (b.live.live && !a.live.live) out.push(`Marked as Live${b.live.overrideReason ? ` before Marketing was done: ${b.live.overrideReason}` : ''}.`);
  if (b.live.opsGroup !== a.live.opsGroup) out.push(b.live.opsGroup ? 'Ops WhatsApp group made.' : 'Ops WhatsApp group un-ticked.');

  const s0 = currentIdxOf(a), s1 = currentIdxOf(b);
  if (s0 !== s1) out.push(`Now at stage ${s1 + 1}: ${STAGES[s1].label}.`);
  return out;
}

export default {
  components: { OptionPicker },
  data() {
    return { createOpen: false,
      STAGES, RSTATUS, FURN, PAY_LINKS, FILTERS, FEE_PCT,
      canEdit: EDITORS.includes(me.role), hasInbox: ['director', 'procurement'].includes(me.role), isDirector: me.role === 'director',
      canAddPortfolio: PORTFOLIO_ADDERS.includes(me.role), canSeeContact: CONTACT_READERS.includes(me.role),
      view: 'list', listings: [], search: '', filter: 'all',
      tasks: [], inboxLoading: false, inboxError: '',
      l: null, saved: null, d: null, c: { ownerPhone: '', ownerEmail: '' }, c0: { ownerPhone: '', ownerEmail: '' },
      tab: 0, linkAdd: { label: '', url: '' }, pasteOpen: '', pasteText: '', mkAdd: '', liveReason: '',
      linked: [], tasksLoading: false, tasksError: '', showDetails: false, histOpen: false, properties: [], propNew: {},
      form: {}, formError: '', okMsg: '', error: '', loading: true, busy: false
    };
  },
  // ?id= opens a listing, ?new=1 the new-listing form. Moving between them changes the address, which remounts the page;
  // a message for the next view travels in history.state.
  async mounted() {
    const q = this.$route.query;
    loadProperties().then(list => { this.properties = list; }).catch(e => console.error('Could not load properties:', e));
    this.okMsg = history.state?.okMsg || '';
    try {
      if ('new' in q && this.canEdit) {
        this.form = { property: '', unit: '', ownerName: '', ownerPhone: '', ownerEmail: '', dueDate: '', description: '' };
        this.view = 'new';
      } else if (q.id) {
        await this.loadListing(String(q.id));
        this.view = this.l ? 'listing' : 'list';
        if (!this.l) { this.error = `No listing ${q.id}.`; await this.loadList(); }
        else this.loadTasks();
      } else {
        await this.loadList();
        if (this.hasInbox) this.loadInbox();
      }
    } catch (e) { this.error = friendlyError(e, 'load the new owner listings'); }
    this.loading = false;
  },
  computed: {
    dirty() { return !!this.d && (JSON.stringify(this.d) !== JSON.stringify(this.saved) || JSON.stringify(this.c) !== JSON.stringify(this.c0)); },
    mkTask() { const id = this.d?.marketing.taskId; return id ? this.linked.find(t => t.id === id) || null : null; },
    procTask() { const id = this.l?.tmsTaskId; return id ? this.linked.find(t => t.id === id) || null : null; }
  },
  methods: {
    // Summary cards: set the list's filter (if any) and scroll to it.
    kpiGo(key, ref = 'list') { if (key) this.filter = key; this.$nextTick(() => this.$refs[ref]?.scrollIntoView({ behavior: 'smooth', block: 'start' })); },
    go(view, id = null) {
      const query = view === 'new' ? { new: '1' } : view === 'listing' ? { id } : {};
      this.$router.push({ query, state: { okMsg: this.okMsg } });
    },
    toRow(id, data) {
      const l = withDefaults(data);
      return { id, ...l, history: data.history || [], stage: data.stage || currentIdxOf(l) + 1, status: data.status || 'inProgress',
        startedOn: (data.startedOn || isoOf(data.createdAt)).slice(0, 10), updated: isoOf(data.updatedAt) };
    },
    // One query for the whole list.
    async loadList() {
      const snap = await getDocs(query(collection(db, 'newOwnerListings'), orderBy('createdAt', 'desc'), limit(LIST_LIMIT)));
      this.listings = snap.docs.map(x => this.toRow(x.id, x.data()));
    },
    // One message to the TMS when the list opens, and again on Refresh. No polling.
    async loadInbox() {
      this.inboxLoading = true; this.inboxError = '';
      try { this.tasks = await inbox('procurement'); }
      catch (e) { this.inboxError = `${e.message} New Procurement tasks can't be shown right now; try Refresh later.`; this.tasks = []; }
      this.inboxLoading = false;
    },
    // A task whose listing exists but whose link didn't reach the TMS yet still shows there: not here.
    inboxShown() { const ids = new Set(this.listings.map(x => x.tmsTaskId).filter(Boolean)); return this.tasks.filter(t => !ids.has(t.id)); },
    // One listing: the parent, and its private part for those who may see the owner's contact details.
    async loadListing(id) {
      const ref = doc(db, 'newOwnerListings', id);
      const snap = await getDoc(ref).catch(e => { if (e.code === 'permission-denied') return null; throw e; });
      if (!snap?.exists()) return;
      const l = this.toRow(id, snap.data());
      if (this.canSeeContact) {
        const p = await getDoc(doc(ref, 'private', 'main')).catch(() => null);
        const pd = p?.exists() ? p.data() : {};
        this.c0 = { ownerPhone: pd.ownerPhone || '', ownerEmail: pd.ownerEmail || '' };
        this.c = { ...this.c0 };
      }
      this.l = l;
      this.saved = this.draftOf(l);
      this.d = clone(this.saved);
      this.tab = currentIdxOf(this.d);
    },
    discard() { this.d = clone(this.saved); this.c = { ...this.c0 }; this.formError = ''; },
    draftOf(l) { return clone(Object.fromEntries([...DETAILS.map(x => x[0]), ...SECTIONS].map(k => [k, l[k]]))); },
    // The linked tasks (Procurement and Marketing), read once on open and on Refresh.
    async loadTasks() {
      if (!this.l || (!this.l.tmsTaskId && !this.d.marketing.taskId)) return;
      this.tasksLoading = true; this.tasksError = '';
      try { this.linked = await listTasksFor(LINK_TYPE, this.l.id); }
      catch (e) { this.tasksError = e.message; }
      this.tasksLoading = false;
    },

    isIn(x, k) {
      return k === 'all' || (k === 'live' ? x.status === 'live' : k === 'progress' ? x.status !== 'live'
        : k === 'unsigned' ? !x.agreement.signed && x.agreement.skipped : k === 'unsent' ? !!(x.tmsTaskId && x.tmsSync?.pending) : false);
    },
    count(k) { return this.listings.filter(x => this.isIn(x, k)).length; },
    shown() {
      const s = this.search.trim().toLowerCase();
      return this.listings.filter(x => this.isIn(x, this.filter)
        && (!s || [x.id, x.property, x.unit, x.ownerName, x.title].some(v => String(v || '').toLowerCase().includes(s))))
        .sort((a, b) => b.id.localeCompare(a.id));
    },
    placeOf(l) { return [l.property, l.unit].filter(Boolean).join(' · ') || l.title || 'Property not set'; },
    tmsState(l) { return !l.tmsTaskId ? ['Not linked', 'grey'] : l.tmsSync?.pending ? ['Not sent', 'amber'] : ['Linked', 'green']; },
    stageDone(l, i) { return stageDoneOf(l, i); },
    stagePart(l, i) { return stagePartOf(l, i); },
    // Property dropdown: the Portfolio's properties, or "New property" with a typed name for one not added yet.
    propChoice(o, key) {
      const v = (o.property || '').trim();
      return this.propNew[key] || (v && !this.properties.some(p => p.name === v)) ? '__new' : v;
    },
    pickProp(o, key, value) {
      const old = this.properties.find(p => p.name === o.property), pick = this.properties.find(p => p.name === value);
      this.propNew[key] = value === '__new';
      o.property = value === '__new' ? '' : value;
      // Unit codes start with the property's short code (e.g. "DM 07-19"): fill it in when the unit is blank or
      // still starts with the previous property's code.
      const unit = (o.unit || '').trim(), oldCode = old?.code ? old.code + ' ' : null;
      if (pick?.code && (!unit || (oldCode && (unit + ' ').startsWith(oldCode)))) o.unit = pick.code + ' ' + (oldCode && unit.startsWith(oldCode) ? unit.slice(oldCode.length) : '');
    },
    currentIdx(l) { return currentIdxOf(l); },
    stageNote(l, i) {
      if (i === 0) return l.agreement.signed ? 'Signed' : l.agreement.skipped ? 'Skipped for now' : 'Not yet';
      if (i === 1) return `${l.renovation.items.filter(x => x.status === 'done').length}/${l.renovation.items.length} done`;
      if (i === 2) return furnUsed(l).length ? `${furnUsed(l).filter(f => subDoneOf(l, f.key)).length}/${furnUsed(l).length} completed` : 'No items yet';
      if (i === 3) return l.payment.confirmed ? 'Confirmed' : 'Waiting';
      if (i === 4) return l.marketing.taskId ? 'Sent' : !l.marketing.notifiedAt ? 'Waiting' : `${l.marketing.items.filter(m => m.on).length}/${l.marketing.items.length} done`;
      return l.live.live ? 'Live' : 'Not yet';
    },
    renoGroups() { return [...RENO_GROUPS, ...new Set(this.d.renovation.items.map(x => x.group).filter(g => !RENO_GROUPS.includes(g)))]; },
    renoCost(l) { return money(l.renovation.items.reduce((t, x) => t + money(x.cost), 0)); },
    renoFee(l) { return money(this.renoCost(l) * FEE_PCT / 100); },
    sum(lines) { return money(lines.reduce((t, x) => t + money(x.cost), 0)); },
    furnTotal(l) { return money(FURN.reduce((t, f) => t + this.sum(l.furniture[f.key]), 0)); },
    // Final quotation: renovation (with the procurement fee) plus furniture.
    quoteTotal(l) { return money(this.renoCost(l) + this.renoFee(l) + this.furnTotal(l)); },
    money(v) { return money(v); },
    subDone(l, k) { return subDoneOf(l, k); },
    furnUsed(l) { return furnUsed(l); },
    rm: rmText, tmsDate,
    short(iso) { if (!iso) return ''; const [, m, dd] = iso.slice(0, 10).split('-'); return `${+dd} ${MON[+m - 1]}`; },
    full(iso) { return iso ? `${this.short(iso)} ${iso.slice(0, 4)}` : ''; },
    stamp(iso) { return iso ? `${this.short(iso)} ${iso.slice(0, 4)}, ${iso.slice(11, 16)}` : ''; },
    entry(text) { return { at: nowIso(), by: me.name, text }; },

    // ----- editing the draft -----
    addReno(group) { this.d.renovation.items.push({ id: lineId(), group, title: '', status: 'notStarted', cost: '', custom: true }); },
    removeLine(list, it) { const i = list.indexOf(it); if (i >= 0) list.splice(i, 1); },
    addFurn(k) { this.d.furniture[k].push({ id: lineId(), item: '', cost: '', done: false }); },
    // "TV RM2500" / "Linen RM20" / "Kettle 45": one row each (item, then the amount at the end, RM optional).
    pasteLines(k) {
      const rows = this.pasteText.split(/\r?\n/).map(s => s.trim()).filter(Boolean).map(s => {
        const m = s.match(/^(.*?)[\s:,-]*(?:RM)?\s*([\d,]+(?:\.\d{1,2})?)\s*$/i);
        return m && m[1].trim() ? { item: m[1].trim(), cost: String(money(m[2])) } : { item: s, cost: '' };
      });
      if (!rows.length) { this.formError = 'Paste one item a line, e.g. TV RM2500.'; return; }
      rows.forEach(r => this.d.furniture[k].push({ id: lineId(), ...r, done: false }));
      this.pasteText = ''; this.pasteOpen = ''; this.formError = '';
    },
    addLink() {
      const label = this.linkAdd.label.trim() || 'Photos', url = this.linkAdd.url.trim();
      if (!httpsOk(url)) { this.formError = 'Paste the Google Drive link (it starts with https://).'; return; }
      this.d.renovation.links.push({ label, url });
      this.linkAdd = { label: '', url: '' }; this.formError = '';
    },
    addMk() {
      const t = this.mkAdd.trim();
      if (!t) return;
      if (!this.d.marketing.items.some(m => m.title.toLowerCase() === t.toLowerCase())) this.d.marketing.items.push({ title: t, on: true });
      this.mkAdd = '';
    },
    async copy(text) {
      try { await navigator.clipboard.writeText(text); toast('Copied. Paste it into WhatsApp.'); }
      catch (_) { toast('Could not copy here. Select the text and copy it by hand.'); }
    },

    validate(d) {
      if (d.agreement.signed && !d.agreement.date) return 'Add the date the service agreement was signed.';
      if (!d.agreement.signed && d.agreement.skipped && !d.agreement.skipNote.trim()) return 'Add a note saying why the agreement is skipped for now.';
      if (d.renovation.items.some(x => !x.title.trim())) return 'Give each new renovation line a name, or remove it.';
      if (FURN.some(f => d.furniture[f.key].some(x => !x.item.trim()))) return 'Give each furniture line an item name, or remove it.';
      if ([...d.renovation.items, ...FURN.flatMap(f => d.furniture[f.key])].some(x => String(x.cost ?? '').trim() && isNaN(Number(String(x.cost).replace(/,/g, ''))))) return 'Costs are numbers in RM, e.g. 2500.';
      for (const [k, label] of PAY_LINKS) if (d.payment[k] && !httpsOk(d.payment[k])) return `The ${label} link must be a Google Drive link starting with https://.`;
      if (!emailOk(this.c.ownerEmail.trim())) return 'That owner email doesn\'t look right.';
      return '';
    },

    // Saves the whole listing (one batch: listing, private part if changed, audit entry), then sends to the linked task.
    async save({ completed } = {}) {
      if (!this.canEdit || this.busy) return;
      const d = this.d, before = this.saved, l = this.l;
      const err = this.validate(d);
      if (err) { this.formError = err; window.scrollTo(0, 0); return false; }
      d.renovation.items.forEach(x => { x.title = x.title.trim(); delete x.custom; });
      if (d.agreement.signed && !before.agreement.signed) d.agreement.signedDuringStage = before.agreement.skipped ? STAGES[currentIdxOf(before)].label : null;
      const c = { ownerPhone: this.c.ownerPhone.trim(), ownerEmail: this.c.ownerEmail.trim() };
      const contactChanged = c.ownerPhone !== this.c0.ownerPhone || c.ownerEmail !== this.c0.ownerEmail;
      const lines = summarize(before, d, contactChanged);
      if (!lines.length) { this.formError = 'Nothing changed yet.'; return false; }
      const stage = currentIdxOf(d) + 1, status = d.live.live ? 'live' : 'inProgress', text = lines.join(' ');
      const h = this.entry(text);
      const linkedTask = !!l.tmsTaskId;
      const prevSync = l.tmsSync || {};
      // Saved as "not sent" first, so a closed tab or lost connection still shows it; cleared once the task has it.
      const tmsSync = linkedTask ? { linked: prevSync.linked !== false, pending: true, pendingNote: [prevSync.pending ? prevSync.pendingNote : '', lines.join('\n')].filter(Boolean).join('\n'),
        error: prevSync.error || '', at: prevSync.at || '' } : null;
      this.busy = true; this.formError = '';
      try {
        const ref = doc(db, 'newOwnerListings', l.id);
        const b = writeBatch(db);
        b.update(ref, { ...clone(d), stage, status, tmsSync, updatedAt: serverTimestamp(), updatedByUid: me.user.uid, updatedByName: me.name, history: arrayUnion(h) });
        if (contactChanged) b.set(doc(ref, 'private', 'main'), c, { merge: true });
        audit(b, me, { action: 'newOwnerListing.update', entity: `newOwnerListings/${l.id}`, reason: text.slice(0, 1000),
          changes: [...(stage !== l.stage ? [{ field: 'stage', old: l.stage, new: stage }] : []), ...(status !== l.status ? [{ field: 'status', old: l.status, new: status }] : []),
            ...SECTIONS.filter(k => JSON.stringify(before[k]) !== JSON.stringify(d[k])).map(k => ({ field: k, old: null, new: '(changed)' })),
            ...DETAILS.filter(([k]) => (before[k] || '') !== (d[k] || '')).map(([k]) => ({ field: k, old: before[k] || null, new: d[k] || null })),
            ...(contactChanged ? [{ field: 'ownerContact', old: null, new: '(changed)' }] : [])] });
        await b.commit();
        Object.assign(l, clone(d), { stage, status, tmsSync, updated: h.at });
        l.history.push(h);
        this.saved = clone(d); this.c0 = { ...c }; this.c = { ...c };
        this.okMsg = `${l.id} saved.`;
        if (linkedTask) await this.push({ completed });
        this.busy = false;
        return true;
      } catch (e) { this.formError = errText(e, 'save the listing'); }
      this.busy = false;
      return false;
    },
    // One message to the linked task: the waiting note, the checklist, and completed when Live. Remembers the result.
    async push({ completed } = {}) {
      const l = this.l, s = l.tmsSync || {};
      let next, linked = s.linked !== false;
      try {
        if (!linked) { await link(l.tmsTaskId, { type: LINK_TYPE, id: l.id }); linked = true; }
        await syncTask(l.tmsTaskId, { note: s.pendingNote || '', checklist: checklistOf(l), completed: completed ?? (l.live.live ? true : undefined),
          started: stageDoneOf(l, 0), departmentId: deptOf(l) });
        next = { linked: true, pending: false, pendingNote: '', error: '', at: nowIso() };
        this.okMsg = `${l.id} saved and sent to the task system.`;
      } catch (e) {
        next = { ...s, linked, pending: true, error: e.message };
        this.okMsg = `${l.id} saved here. Not sent to task system: ${e.message}`;
      }
      try { await updateDoc(doc(db, 'newOwnerListings', l.id), { tmsSync: next }); l.tmsSync = next; }
      catch (e) { this.formError = friendlyError(e, 'note the task system result'); }
      if (!next.pending) this.loadTasks();
    },
    // Create property / unit / owner: the Portfolio add form opens filled in from this listing. Handed over in memory,
    // not in the address (the owner's phone and email). Portfolio finds the property for a unit by the id recorded here
    // or by its name.
    toPortfolio(kind) {
      const d = this.d, pf = this.l.portfolio || {};
      handOff({ kind, listingId: this.l.id, property: d.property.trim(), unit: d.unit.trim(), ownerName: d.ownerName.trim(),
        ownerPhone: this.canSeeContact ? this.c.ownerPhone.trim() : '', ownerEmail: this.canSeeContact ? this.c.ownerEmail.trim() : '',
        recordBack: this.canEdit, portfolio: { propertyId: pf.propertyId || null, unitId: pf.unitId || null, ownerId: pf.ownerId || null } });
      this.$router.push(kind === 'owner' ? '/Portfolio/owners' : kind === 'unit' && pf.propertyId ? `/Portfolio/properties?property=${pf.propertyId}` : '/Portfolio/properties');
    },
    async sendNow() {
      if (this.busy) return;
      this.busy = true; this.formError = '';
      await this.push();
      this.busy = false;
    },
    async confirmPayment() {
      if (!(money(this.d.payment.amount) > 0)) { this.formError = 'Add the final amount before confirming the payment.'; return; }
      const keep = clone(this.d.payment);
      const keepMk = clone(this.d.marketing), at = nowIso();
      Object.assign(this.d.payment, { confirmed: true, confirmedByUid: me.user.uid, confirmedByName: me.name, confirmedAt: at });
      Object.assign(this.d.marketing, { notifiedAt: at, notifiedByName: me.name });
      if (!(await this.save())) { this.d.payment = keep; this.d.marketing = keepMk; return; }
      // The Marketing team's bell: one role notification, opened straight to this listing.
      const l = this.l, items = this.d.marketing.items.filter(m => m.on).map(m => m.title);
      try {
        await notifyRole({ recipientRole: 'marketing', type: 'listing', refId: l.id, link: `/Procurement/new-owner-listings?id=${l.id}`,
          title: `New listing for Marketing: ${l.id}`,
          message: `Payment confirmed for ${this.placeOf(this.d)}.` + (items.length ? ` Marketing: ${items.join(', ')}.` : '') });
        this.okMsg = `${l.id}: payment confirmed and the Marketing team notified.`;
      } catch (e) {
        console.error('Notification failed:', e);
        this.okMsg = `${l.id}: payment confirmed. The Marketing notification could not be sent: ${e.message}`;
      }
    },
    async goLive() {
      await this.markLive();
      if (!this.d.live.live) return;
      this.tab = 5;
      // Operations takes over (property, unit and owner in Portfolio, the Ops WhatsApp group): one role notification.
      const l = this.l;
      try {
        await notifyRole({ recipientRole: 'operations', type: 'listing', refId: l.id, link: `/Procurement/new-owner-listings?id=${l.id}`,
          title: `Listing is Live: ${l.id}`, message: `${this.placeOf(this.d)} is Live. Please take over the handover (Portfolio and the Ops WhatsApp group).` });
        this.okMsg += ' Operations notified.';
      } catch (e) {
        console.error('Notification failed:', e);
        this.okMsg += ` The Operations notification could not be sent: ${e.message}`;
      }
    },
    async markLive() {
      const d = this.d;
      const reason = this.liveReason.trim();
      if (!stageDoneOf(d, 4)) { this.formError = 'Finish the marketing checklist (every item ticked) before going Live.'; return; }
      const keep = clone(d.live);
      Object.assign(d.live, { live: true, at: nowIso(), byName: me.name, overrideReason: stageDoneOf(d, 4) ? '' : reason });
      if (!(await this.save({ completed: true }))) { d.live = keep; return; }
      const l = this.l;
      this.okMsg = !l.tmsTaskId ? `${l.id} is Live.` : l.tmsSync?.pending ? `${l.id} is Live. Not sent to task system: ${l.tmsSync.error}` : `${l.id} is Live and its task is completed.`;
    },

    // ----- new listings -----
    async create(fields, contact, task) {
      const h = this.entry(task ? `Started from the task system task "${task.title}".` : 'Started the listing.');
      return runTransaction(db, async tx => {
        const cRef = doc(db, 'counters', 'newOwnerListings');
        const cs = await tx.get(cRef);
        const n = cs.exists() ? cs.data().next || 1 : 1, id = num('NL', n), ref = doc(db, 'newOwnerListings', id);
        if ((await tx.get(ref)).exists()) throw stop(`${id} already exists. Ask a Director to check counters/newOwnerListings.`);
        const data = { ...blank(), ...fields, stage: 1, status: 'inProgress', startedOn: nowIso().slice(0, 10),
          tmsTaskId: task?.id || null, tmsSync: task ? { linked: false, pending: true, pendingNote: '', error: '', at: '' } : null,
          createdByUid: me.user.uid, createdByName: me.name, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), history: [h] };
        tx.set(cRef, { next: n + 1 });
        tx.set(ref, data);
        if (contact.ownerPhone || contact.ownerEmail) tx.set(doc(ref, 'private', 'main'), contact);
        audit(tx, me, { action: 'newOwnerListing.create', entity: `newOwnerListings/${id}`, reason: h.text,
          changes: [{ field: 'status', old: null, new: 'inProgress' }, ...(task ? [{ field: 'tmsTaskId', old: null, new: task.id }] : [])] });
        return id;
      });
    },
    async startFromTask(t) {
      if (this.busy) return;
      this.busy = true; this.error = '';
      try {
        const id = await this.create({ title: t.title || '', description: t.description || '', dueDate: tmsDate(t.dueDate) }, {}, t);
        // Link the task back. If the TMS can't be reached, the listing shows "Not sent" and Send now links it.
        let tmsSync;
        try { await link(t.id, { type: LINK_TYPE, id }); tmsSync = { linked: true, pending: false, pendingNote: '', error: '', at: nowIso() }; this.okMsg = `${id} started and linked to the task.`; }
        catch (e) { tmsSync = { linked: false, pending: true, pendingNote: '', error: e.message, at: '' }; this.okMsg = `${id} started. Not linked in the task system yet: ${e.message}`; }
        await updateDoc(doc(db, 'newOwnerListings', id), { tmsSync }).catch(() => {});
        this.busy = false;
        this.go('listing', id);
      } catch (e) { this.error = errText(e, 'start the listing'); this.busy = false; }
    },
    async saveNew() {
      const f = this.form;
      if (!f.property.trim() && !f.unit.trim()) return this.formError = 'Add the property or the unit.';
      if (!emailOk(f.ownerEmail.trim())) return this.formError = 'That owner email doesn\'t look right.';
      this.busy = true; this.formError = '';
      try {
        const id = await this.create({ property: f.property.trim(), unit: f.unit.trim(), ownerName: f.ownerName.trim(), title: '', description: f.description.trim(), dueDate: f.dueDate },
          { ownerPhone: f.ownerPhone.trim(), ownerEmail: f.ownerEmail.trim() }, null);
        this.okMsg = `${id} started.`;
        this.busy = false;
        this.go('listing', id);
      } catch (e) { this.formError = errText(e, 'save the listing'); this.busy = false; }
    }
  }
};
</script>

<style scoped>
    .back { display: inline-block; color: var(--accent); font-size: 13px; font-weight: 500; margin-bottom: 14px; background: none; border: 0; padding: 0; cursor: pointer; }
    .title-pills { display: flex; gap: 8px; margin: 6px 0 4px; }
    .ho-line { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap; }
    .ho-line > .help, .ho-line > template { flex: 1 1 320px; }
    .ho-foot { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; margin-left: auto; }
    .ho-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
    .ho-btns { position: relative; display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
    .ho-btns > .muted { position: absolute; right: 0; bottom: calc(100% + 6px); white-space: nowrap; }
    .ho-row { display: flex; gap: 8px; }
    .ho-btns .create-wrap { position: relative; width: 120px; }
    .handover.create-wrap { position: relative; display: block; width: 120px; margin-left: auto; }
    .create-wrap > .btn { width: 100%; }
    .create-back { position: fixed; inset: 0; z-index: 20; }
    .create-menu { position: absolute; left: 0; right: 0; width: 100%; bottom: calc(100% + 4px); z-index: 21; background: var(--card, #fff); border: 1px solid var(--line, #e5e5e5); border-radius: 8px; box-shadow: 0 6px 18px rgba(0,0,0,.12); padding: 4px; display: flex; flex-direction: column; }
    .create-menu button { text-align: left; border: 0; background: none; padding: 8px 10px; border-radius: 6px; font: inherit; cursor: pointer; }
    .create-menu button:hover { background: var(--brand-soft, #fde8e2); }
    .head-tools { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    .form-card { display: grid; gap: 16px; min-width: 0; align-content: start; }
    .form-card h2 { font-size: 15px; margin: 0; }
    .form-card h3 { font-size: 14px; margin: 0; }
    .page-note { color: var(--muted); font-size: 12px; margin-top: 14px; }
    .inbox { margin-bottom: 20px; }
    .inbox-list { display: grid; gap: 10px; }
    .inbox-row { display: flex; gap: 12px; align-items: center; justify-content: space-between; border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; flex-wrap: wrap; }
    .inbox-text { display: grid; gap: 2px; min-width: 0; flex: 1 1 240px; font-size: 13px; }
    .inbox-text small { color: var(--muted); font-size: 12px; }
    .inbox-text span { color: var(--text-2); overflow-wrap: anywhere; }
    .nol-tools .input { flex: 1 1 220px; }
    .nol-steps { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 8px; margin-bottom: 16px; }
    .step { display: flex; gap: 8px; align-items: flex-start; text-align: left; padding: 10px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); color: var(--muted); font-size: 12px; min-width: 0; cursor: pointer; }
    .step b { display: block; font-size: 13px; color: var(--text); font-weight: 600; }
    .step small { display: block; font-size: 11px; }
    .step .stage-dot { width: 20px; height: 20px; }
    .step.done .stage-dot { background: var(--green); border-color: var(--green); }
    .step.done .stage-dot::after { content: '✓'; color: #fff; font-size: 11px; font-weight: 700; }
    .step.now .stage-dot { border-color: var(--accent); }
    .step.part .stage-dot { background: var(--amber); border-color: var(--amber); display: grid; place-items: center; }
    .step.part .stage-dot::after { content: '–'; color: #fff; font-size: 13px; font-weight: 700; line-height: 1; }
    .step.on { border-color: var(--accent); background: var(--accent-soft); }
    .unsent { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
    .sign-row { display: flex; gap: 16px; align-items: flex-end; flex-wrap: wrap; margin-bottom: 12px; }
    .tick { display: inline-flex; gap: 8px; align-items: center; font-size: 13px; margin: 0 16px 8px 0; cursor: pointer; }
    .tick input { width: 16px; height: 16px; accent-color: var(--navy); }
    .form-sec { font-weight: 600; font-size: 13px; margin: 16px 0 8px; color: var(--text-2); }
    .lines td { padding: 8px 10px; }
    .lines th { padding: 9px 10px; }
    .lines .input { height: 34px; min-width: 120px; }
    .lines .input.cost { width: 100px; min-width: 80px; text-align: right; }
    .lines .select { height: 34px; }
    .wrap { overflow-wrap: anywhere; }
    .add-line { margin-top: 6px; }
    .totals { margin-top: 14px; max-width: 340px; margin-left: auto; }
    .totals .total { border-top: 1px solid var(--border); }
    .link-row { display: flex; gap: 12px; justify-content: space-between; font-size: 13px; padding: 4px 0; overflow-wrap: anywhere; }
    .link-row a { color: var(--accent); }
    .link-add { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
    .link-add .input { flex: 1 1 180px; min-width: 0; }
    .notes { margin-top: 16px; }
    .notes .field { align-content: start; }
    .reno th:nth-child(2) { width: 150px; }
    .reno th:nth-child(3) { width: 130px; }
    .reno th:nth-child(4) { width: 80px; }
    .notes textarea { height: 90px; }
    .copy { justify-self: start; margin-top: 6px; }
    .pre { white-space: pre-wrap; font-size: 13px; margin: 0; overflow-wrap: anywhere; }
    .sub-stage { border-top: 1px solid var(--line); padding-top: 12px; margin-top: 12px; }
    .sub-stage:first-of-type { border-top: 0; margin-top: 0; padding-top: 0; }
    .furn-tools { display: flex; gap: 16px; margin-top: 8px; }
    .paste { display: grid; gap: 8px; margin-top: 8px; }
    .paste textarea { height: 90px; }
    .paste .btn { justify-self: start; }
    .done-text { display: flex; gap: 10px; align-items: center; justify-content: space-between; flex-wrap: wrap; margin-top: 10px; padding: 10px 12px; background: var(--green-soft); color: var(--green); border-radius: 8px; font-size: 13px; }
    .done-text .copy { margin: 0; }
    .mk-items { display: flex; flex-wrap: wrap; gap: 4px 0; margin-bottom: 8px; }
    .mk-items .pill { margin: 0 6px 6px 0; }
    .handover { display: flex; gap: 8px; flex-wrap: wrap; }
    .actions { display: flex; gap: 10px; align-items: center; justify-content: flex-end; flex-wrap: wrap; margin-top: 16px; }
    .hist { display: grid; gap: 10px; }
    .hist div { font-size: 13px; border-left: 2px solid var(--line); padding-left: 10px; overflow-wrap: anywhere; }
    .hist small { display: block; color: var(--muted); font-size: 11px; }
    textarea.input { height: 80px; padding: 10px 12px; }
    .ag-opts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .ag-opt { display: flex; gap: 12px; align-items: flex-start; text-align: left; padding: 14px 16px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); color: var(--text); cursor: pointer; font: inherit; transition: border-color .15s, background .15s; }
    .ag-opt:hover { border-color: var(--accent); }
    .ag-opt b { display: block; font-size: 14px; font-weight: 600; }
    .ag-opt small { display: block; font-size: 12px; color: var(--muted); margin-top: 2px; }
    .ag-radio { flex: 0 0 18px; width: 18px; height: 18px; margin-top: 1px; border-radius: 50%; border: 2px solid var(--border); background: var(--surface); }
    .ag-opt.sel { border-color: var(--green); background: var(--green-soft); }
    .ag-opt.sel .ag-radio { border-color: var(--green); background: radial-gradient(var(--green) 0 4px, var(--surface) 5px); }
    .ag-opt.amber.sel { border-color: var(--amber, #d97706); background: var(--amber-soft, #fef3c7); }
    .ag-opt.amber.sel .ag-radio { border-color: var(--amber, #d97706); background: radial-gradient(var(--amber, #d97706) 0 4px, var(--surface) 5px); }
    .ag-more { margin-top: 12px; padding: 14px 16px; border-radius: 12px; background: color-mix(in srgb, var(--text) 4%, var(--surface)); }
    @media (max-width: 600px) { .ag-opts { grid-template-columns: minmax(0, 1fr); } }
    .view-details { width: 100%; margin-top: 14px; }
    .prop-new { margin-top: 8px; }
    .totals.quote { margin: 0 0 16px auto; max-width: 420px; }
    .amt-row { display: flex; gap: 12px; align-items: center; }
    .amt-row .editlink { white-space: nowrap; }
    .grid-fields { align-items: start; }
    .field > .select { width: 100%; height: 40px; font-weight: 400; font-size: 14px; padding-left: 12px; background-position: calc(100% - 17px) 18px, calc(100% - 13px) 18px; }
    .th-all { display: inline-flex; gap: 6px; align-items: center; cursor: pointer; font-weight: 500; }
    .th-all input { width: 16px; height: 16px; accent-color: var(--accent); }
    .mk-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin: 14px 0 10px; }
    .mk-count { font-size: 12px; font-weight: 600; color: var(--text-2); text-transform: uppercase; letter-spacing: .04em; }
    .mk-all { font-weight: 600; margin: 0; }
    .mk-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 8px; }
    .mk-tile { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px;
      font-size: 13px; cursor: pointer; background: var(--surface); transition: border-color .15s, background .15s; }
    .mk-tile:hover { border-color: var(--accent); }
    .mk-tile.on { border-color: var(--green); background: var(--green-soft); font-weight: 600; }
    .mk-tile input { width: 16px; height: 16px; flex: none; accent-color: var(--green); }
    .mk-tile span { flex: 1; min-width: 0; overflow-wrap: anywhere; }
    .mk-x { flex: none; width: 22px; height: 22px; border: 0; border-radius: 6px; background: none; color: var(--muted); font-size: 16px; line-height: 1; cursor: pointer; }
    .mk-x:hover { background: var(--red-soft); color: var(--red); }
    .mk-add { display: flex; gap: 8px; margin: 12px 0 4px; }
    .mk-add .input { flex: 1; min-width: 0; }
    .details-modal { max-width: 680px; }
    .details-modal .card-head { margin-bottom: 12px; }
    .d-grid { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 4px 16px; align-items: start; }
    .d-grid .span2 { grid-column: 1 / -1; }
    .d-grid .kv { margin: 0; }
    .d-grid .actions { margin-top: 4px; }
    .form-card .nol-steps { margin-bottom: 0; }
    .timeline { max-height: 520px; overflow-y: auto; padding-right: 4px; gap: 0; }
    .timeline div { position: relative; border-left: 2px solid var(--border); padding: 0 0 14px 16px; margin-left: 5px; }
    .timeline div:last-of-type { padding-bottom: 0; }
    .timeline div::before { content: ''; position: absolute; left: -6px; top: 3px; width: 10px; height: 10px; border-radius: 50%; background: var(--surface); border: 2px solid var(--accent); }
    .timeline div:first-child::before { background: var(--accent); }
    @media (max-width: 700px) { .d-grid { grid-template-columns: minmax(0,1fr); } }
    @media (max-width: 900px) { .nol-steps { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
    @media (max-width: 480px) { .nol-steps { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
