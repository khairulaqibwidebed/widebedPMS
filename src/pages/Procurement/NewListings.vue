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
          <div class="card kpi"><div class="label">In progress</div><div class="value">{{ count('progress') }}</div><div class="hint">Not live yet</div></div>
          <div class="card kpi"><div class="label">Live</div><div class="value">{{ count('live') }}</div><div class="hint">Handed over to Operations</div></div>
          <div class="card kpi"><div class="label">Agreement not signed</div><div class="value" :class="{ alert: count('unsigned') }">{{ count('unsigned') }}</div><div class="hint">Skipped for now</div></div>
          <div class="card kpi"><div class="label">Not sent to task system</div><div class="value" :class="{ alert: count('unsent') }">{{ count('unsent') }}</div><div class="hint">Open the listing and Send now</div></div>
        </section>

        <section class="card inbox" v-if="canEdit" aria-label="From task system">
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

        <div class="toolbar nol-tools">
          <input class="input" type="search" placeholder="Search NL no., property, unit or owner" v-model="search" aria-label="Search listings">
          <div class="pills brand">
            <template v-for="f in FILTERS" :key="f.key">
              <button class="pill-btn" :class="{ on: filter === f.key }" @click="filter = f.key">{{ `${f.label} · ${count(f.key)}` }}</button>
            </template>
          </div>
        </div>
        <section class="card">
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th>Listing</th><th>Property / unit</th><th>Owner</th><th>Current stage</th><th>Started</th><th>Status</th><th>Task system</th></tr></thead>
              <tbody>
                <template v-for="l in shown()" :key="l.id">
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
            <div class="field"><label for="nProp">Property</label><input class="input" id="nProp" v-model="form.property" placeholder="e.g. Sample Residence"></div>
            <div class="field"><label for="nUnit">Unit</label><input class="input" id="nUnit" v-model="form.unit" placeholder="e.g. A-12-03"></div>
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
          <div class="head-tools">
            <span class="pill" :class="l.status === 'live' ? 'green' : 'blue'">{{ l.status === 'live' ? 'Live' : 'In progress' }}</span>
            <span class="pill" :class="tmsState(l)[1]">{{ tmsState(l)[0] }}</span>
          </div>
        </div>

        <div class="notice warn unsent" v-if="l.tmsTaskId && l.tmsSync?.pending">
          <span>{{ `Not sent to task system. ${l.tmsSync.error || 'The last change has not reached the task.'} The change is saved here.` }}</span>
          <button class="btn" v-if="canEdit" @click="sendNow()" :disabled="busy">Send now</button>
        </div>

        <nav class="nol-steps" aria-label="Stages">
          <template v-for="(s, i) in STAGES" :key="s.key">
            <button type="button" class="step" :class="{ on: tab === i, done: stageDone(d, i), now: currentIdx(d) === i && !stageDone(d, i) }" @click="tab = i">
              <span class="stage-dot"></span><span><b>{{ `${i + 1}. ${s.short}` }}</b><small>{{ stageNote(d, i) }}</small></span>
            </button>
          </template>
        </nav>

        <div class="notice error" v-show="formError">{{ formError }}</div>
        <div class="side-grid">
          <div class="form-card">

            <!-- 1. Service agreement -->
            <section class="card" v-if="tab === 0" aria-label="Service Agreement Signed">
              <div class="card-head"><h2>1. Service Agreement Signed</h2><span class="pill" :class="stageDone(d, 0) ? (d.agreement.signed ? 'green' : 'amber') : 'grey'">{{ d.agreement.signed ? 'Signed' : d.agreement.skipped ? 'Skipped for now' : 'Not yet' }}</span></div>
              <template v-if="canEdit">
                <div class="sign-row">
                  <label class="tick"><input type="checkbox" v-model="d.agreement.signed" aria-label="Signed"> Signed</label>
                  <div class="field" style="margin:0"><label for="agDate">Date signed</label><input class="input" id="agDate" type="date" v-model="d.agreement.date" :disabled="!d.agreement.signed"></div>
                </div>
                <p class="help" v-if="d.agreement.signed && saved.agreement.skipped && !saved.agreement.signed">{{ `It will be recorded as signed during ${STAGES[currentIdx(saved)].label}.` }}</p>
                <template v-if="!d.agreement.signed">
                  <button class="btn" v-if="!d.agreement.skipped" @click="d.agreement.skipped = true">Skip for now</button>
                  <div class="field" v-else><label for="agNote">Why is it skipped for now? (required)</label>
                    <textarea class="input" id="agNote" v-model="d.agreement.skipNote" placeholder="e.g. Owner signs when back from overseas; renovation can start"></textarea>
                    <button class="editlink" style="justify-self:start" @click="d.agreement.skipped = false; d.agreement.skipNote = ''">Don't skip</button></div>
                </template>
              </template>
              <template v-else>
                <div class="kv"><span>Signed</span><span>{{ d.agreement.signed ? `Yes, ${full(d.agreement.date)}` : 'No' }}</span></div>
                <div class="kv" v-if="d.agreement.skipped && !d.agreement.signed"><span>Skipped for now</span><span>{{ d.agreement.skipNote }}</span></div>
              </template>
              <div class="kv" v-if="d.agreement.signed && d.agreement.signedDuringStage"><span>Recorded</span><span>{{ `Signed during ${d.agreement.signedDuringStage}` }}</span></div>
              <p class="help" v-if="d.agreement.signed && d.agreement.skipNote">{{ `Earlier skipped: ${d.agreement.skipNote}` }}</p>
              <div class="actions" v-if="canEdit"><span class="muted" v-show="dirty">Unsaved changes</span><button class="btn btn-primary" @click="save()" :disabled="busy">Save</button></div>
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
              <div class="actions" v-if="canEdit"><span class="muted" v-show="dirty">Unsaved changes</span><button class="btn btn-primary" @click="save()" :disabled="busy">Save</button></div>
            </section>

            <!-- 3. Furniture -->
            <section class="card" v-if="tab === 2" aria-label="Furniture">
              <div class="card-head"><h2>3. Furniture</h2><span class="muted">{{ `Total ${rm(furnTotal(d))}` }}</span></div>
              <template v-for="f in FURN" :key="f.key">
                <div class="sub-stage" :data-sub="f.key">
                  <div class="card-head" style="margin-bottom:8px"><h3>{{ f.label }}</h3>
                    <span class="pill" :class="subDone(d, f.key) ? 'green' : 'grey'">{{ subDone(d, f.key) ? 'Completed' : `${d.furniture[f.key].filter(x => x.done).length} of ${d.furniture[f.key].length} ticked` }}</span></div>
                  <div class="table-wrap" v-show="d.furniture[f.key].length">
                    <table class="table lines">
                      <thead><tr><th style="width:44px">Added</th><th>Item</th><th class="num">RM</th><th v-if="canEdit"></th></tr></thead>
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
              <div class="actions" v-if="canEdit"><span class="muted" v-show="dirty">Unsaved changes</span><button class="btn btn-primary" @click="save()" :disabled="busy">Save</button></div>
            </section>

            <!-- 4. Final quotation & payment -->
            <section class="card" v-if="tab === 3" aria-label="Final quotation and payment">
              <div class="card-head"><h2>4. Final quotation &amp; payment</h2><span class="pill" :class="d.payment.confirmed ? 'green' : 'grey'">{{ d.payment.confirmed ? 'Payment confirmed' : 'Waiting for payment' }}</span></div>
              <template v-for="k in PAY_LINKS" :key="k[0]">
                <div class="field" v-if="canEdit"><label :for="'pay_' + k[0]">{{ `${k[1]} (Google Drive link)` }}</label><input class="input" :id="'pay_' + k[0]" v-model="d.payment[k[0]]" placeholder="https://drive.google.com/…"></div>
                <div class="kv" v-else><span>{{ k[1] }}</span><span><a v-if="d.payment[k[0]]" :href="d.payment[k[0]]" target="_blank" rel="noopener">Open</a><template v-else>—</template></span></div>
              </template>
              <div class="field" v-if="canEdit && !d.payment.confirmed" style="max-width:240px"><label for="payAmt">Final amount (RM)</label><input class="input" id="payAmt" v-model="d.payment.amount" inputmode="decimal" placeholder="0.00"></div>
              <div class="kv" v-else><span>Final amount</span><span>{{ d.payment.amount === '' ? '—' : rm(d.payment.amount) }}</span></div>
              <div class="kv" v-if="d.payment.confirmed"><span>Confirmed</span><span>{{ `${d.payment.confirmedByName}, ${stamp(d.payment.confirmedAt)}` }}</span></div>
              <p class="help">Marketing can start only once the payment is confirmed.</p>
              <div class="actions" v-if="canEdit">
                <span class="muted" v-show="dirty">Unsaved changes</span>
                <button class="btn" @click="save()" :disabled="busy">Save</button>
                <button class="btn btn-primary" v-if="!d.payment.confirmed" @click="confirmPayment()" :disabled="busy">Payment confirmed</button>
              </div>
            </section>

            <!-- 5. Marketing -->
            <section class="card" v-if="tab === 4" aria-label="Marketing">
              <div class="card-head"><h2>5. Marketing</h2><span class="pill" :class="d.marketing.taskId ? 'green' : 'grey'">{{ d.marketing.taskId ? 'Sent to Marketing' : 'Not sent' }}</span></div>
              <div class="notice warn" v-if="!d.payment.confirmed && !d.marketing.taskId">Marketing starts once the final payment is confirmed (stage 4).</div>
              <template v-if="!d.marketing.taskId && canEdit">
                <div class="mk-items">
                  <template v-for="(m, i) in d.marketing.items" :key="i">
                    <label class="tick"><input type="checkbox" v-model="m.on"> {{ m.title }}</label>
                  </template>
                </div>
                <div class="link-add"><input class="input" v-model="mkAdd" placeholder="e.g. Listing photos shoot" aria-label="New marketing item" @keyup.enter="addMk()"><button class="btn" @click="addMk()">Add line</button></div>
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
              <div class="actions" v-if="canEdit && !d.marketing.taskId">
                <span class="muted" v-show="dirty">Unsaved changes</span>
                <button class="btn" @click="save()" :disabled="busy">Save</button>
                <button class="btn btn-primary" v-if="isDirector" @click="sendMarketing()" :disabled="busy || !d.payment.confirmed">Send to Marketing</button>
                <span class="help" v-else>A Director sends the Marketing task: the task system currently only lets Directors create tasks.</span>
              </div>
            </section>

            <!-- 6. Live -->
            <section class="card" v-if="tab === 5" aria-label="Live">
              <div class="card-head"><h2>6. Live</h2><span class="pill" :class="d.live.live ? 'green' : 'grey'">{{ d.live.live ? 'Live' : 'Not live yet' }}</span></div>
              <template v-if="d.live.live">
                <div class="kv"><span>Marked as Live</span><span>{{ `${d.live.byName}, ${stamp(d.live.at)}` }}</span></div>
                <div class="kv" v-if="d.live.overrideReason"><span>Before Marketing was done</span><span>{{ d.live.overrideReason }}</span></div>
              </template>
              <template v-else-if="canEdit">
                <div class="notice warn" v-if="!stageDone(d, 4)">The Marketing task has not been sent yet. To go live anyway, give the reason.</div>
                <div class="notice warn" v-else-if="mkTask && !mkTask.completed">{{ `The Marketing task is not completed yet (${mkTask.subtasksDone} of ${mkTask.subtasksTotal} done).` }}</div>
                <div class="field" v-if="!stageDone(d, 4)"><label for="liveWhy">Reason to go live before Marketing</label><input class="input" id="liveWhy" v-model="liveReason" placeholder="e.g. Owner asked to open bookings now"></div>
                <button class="btn btn-primary" @click="markLive()" :disabled="busy">Mark as Live</button>
              </template>
              <p class="muted" v-else>Not live yet.</p>

              <div class="form-sec">Handover to Operations</div>
              <label class="tick" v-if="canEdit"><input type="checkbox" v-model="d.live.opsGroup"> Ops WhatsApp group made</label>
              <div class="kv" v-else><span>Ops WhatsApp group made</span><span>{{ d.live.opsGroup ? 'Yes' : 'No' }}</span></div>
              <template v-if="canAddPortfolio">
                <p class="help">{{ 'Each button opens the Portfolio add form filled in from this listing. Check it and press Save there.'
                  + (canSeeContact ? '' : ' Owner phone and email are not filled in: only Directors, Procurement and Operations see them.') }}</p>
                <div class="handover">
                  <button class="btn" @click="toPortfolio('property')">Create property</button>
                  <button class="btn" @click="toPortfolio('unit')">Create unit</button>
                  <button class="btn" @click="toPortfolio('owner')">Create owner</button>
                </div>
              </template>
              <p class="help" v-else>Operations creates these from this listing (the property, unit and owner in Portfolio).</p>
              <div class="kv" v-if="l.portfolio && (l.portfolio.propertyId || l.portfolio.unitId || l.portfolio.ownerId)"><span>In Portfolio</span>
                <span>{{ [l.portfolio.propertyId && `property ${l.portfolio.propertyId}`, l.portfolio.unitId && `unit ${l.portfolio.unitId}`, l.portfolio.ownerId && 'owner added'].filter(Boolean).join(' · ') }}</span></div>
              <div class="actions" v-if="canEdit"><span class="muted" v-show="dirty">Unsaved changes</span><button class="btn" @click="save()" :disabled="busy">Save</button></div>
            </section>

            <section class="card">
              <div class="card-head"><h2>History</h2></div>
              <div class="hist">
                <template v-for="(h, i) in l.history.slice().reverse()" :key="i">
                  <div><small>{{ `${stamp(h.at)} · ${h.by}` }}</small><span>{{ h.text }}</span></div>
                </template>
                <p class="muted" v-show="!l.history.length">Nothing yet.</p>
              </div>
            </section>
          </div>

          <div class="form-card">
            <section class="card" aria-label="Listing details">
              <div class="card-head"><h2>Details</h2></div>
              <template v-if="canEdit">
                <div class="field"><label for="dProp">Property</label><input class="input" id="dProp" v-model="d.property" placeholder="e.g. Sample Residence"></div>
                <div class="field"><label for="dUnit">Unit</label><input class="input" id="dUnit" v-model="d.unit" placeholder="e.g. A-12-03"></div>
                <div class="field"><label for="dOwner">Owner name</label><input class="input" id="dOwner" v-model="d.ownerName" placeholder="e.g. Owner A"></div>
                <div class="field"><label for="dPhone">Owner phone</label><input class="input" id="dPhone" v-model="c.ownerPhone" inputmode="tel"></div>
                <div class="field"><label for="dEmail">Owner email</label><input class="input" id="dEmail" type="email" v-model="c.ownerEmail"></div>
                <div class="field"><label for="dDue">Due date</label><input class="input" id="dDue" type="date" v-model="d.dueDate"></div>
                <div class="field"><label for="dDesc">Description</label><textarea class="input" id="dDesc" v-model="d.description"></textarea></div>
                <div class="actions"><button class="btn" @click="save()" :disabled="busy">Save</button></div>
              </template>
              <template v-else>
                <div class="kv"><span>Property</span><span>{{ d.property || '—' }}</span></div>
                <div class="kv"><span>Unit</span><span>{{ d.unit || '—' }}</span></div>
                <div class="kv"><span>Owner</span><span>{{ d.ownerName || '—' }}</span></div>
                <template v-if="canSeeContact">
                  <div class="kv"><span>Owner phone</span><span>{{ c.ownerPhone || '—' }}</span></div>
                  <div class="kv"><span>Owner email</span><span>{{ c.ownerEmail || '—' }}</span></div>
                </template>
                <div class="kv"><span>Due</span><span>{{ full(d.dueDate) || '—' }}</span></div>
                <p class="pre" v-if="d.description">{{ d.description }}</p>
              </template>
            </section>
            <section class="card" aria-label="Task system">
              <div class="card-head"><h2>Task system</h2><button class="editlink" @click="loadTasks()" :disabled="tasksLoading" v-if="l.tmsTaskId || d.marketing.taskId">Refresh</button></div>
              <template v-if="l.tmsTaskId">
                <div class="kv"><span>Procurement task</span><span>{{ procTask ? `${procTask.completed ? 'Completed' : procTask.status || 'Open'} · ${procTask.subtasksDone} of ${procTask.subtasksTotal}` : l.tmsSync?.linked === false ? 'Not linked yet' : tasksError ? 'Could not read' : '…' }}</span></div>
                <div class="kv"><span>Last sent</span><span>{{ l.tmsSync?.pending ? 'Not sent' : stamp(l.tmsSync?.at) || '—' }}</span></div>
              </template>
              <p class="muted" v-else>Started here, not from a task.</p>
              <div class="kv" v-if="d.marketing.taskId"><span>Marketing task</span><span>{{ mkTask ? `${mkTask.completed ? 'Completed' : mkTask.status || 'Open'} · ${mkTask.subtasksDone} of ${mkTask.subtasksTotal}` : tasksError ? 'Could not read' : '…' }}</span></div>
              <p class="help" v-show="tasksError">{{ tasksError }}</p>
            </section>
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
import { audit, friendlyError } from '@/lib/finance-data.js';
import { inbox, link, syncTask, createTask, listTasksFor } from '@/lib/tms.js';
import { toast } from '@/lib/toast.js';
import { handOff } from '@/lib/handoff.js';

const me = useSession();
// Who edits (the rules say the same). Finance, Operations and Marketing view only.
const EDITORS = ['director', 'procurement'];
// Who may create properties, units and owners in Portfolio (the rules: Directors and Finance, and Operations create-only).
// Procurement may not, so it sees a note instead of the Create buttons.
const PORTFOLIO_ADDERS = ['director', 'finance', 'operations'];
// Who sees the owner's phone and email (the rules: editors, and Operations read-only).
const CONTACT_READERS = ['director', 'procurement', 'operations'];
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
const FILTERS = [{ key: 'all', label: 'All' }, { key: 'progress', label: 'In progress' }, { key: 'live', label: 'Live' }, { key: 'unsent', label: 'Not sent' }];
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
    marketing: { items: MK_DEFAULT.map(title => ({ title, on: false })), taskId: null, sentAt: '', sentByName: '' },
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
// Each stage counts as done when: 1 signed or skipped for now, 2 every renovation line Done, 3 every furniture line in all
// three sub-stages ticked, 4 payment confirmed, 5 the Marketing task sent, 6 Live.
function stageDoneOf(l, i) {
  if (i === 0) return l.agreement.signed || (l.agreement.skipped && !!l.agreement.skipNote.trim());
  if (i === 1) return l.renovation.items.length > 0 && l.renovation.items.every(x => x.status === 'done');
  if (i === 2) return FURN.every(f => subDoneOf(l, f.key));
  if (i === 3) return l.payment.confirmed;
  if (i === 4) return !!l.marketing.taskId;
  return l.live.live;
}
const currentIdxOf = l => { if (l.live.live) return 5; const i = STAGES.findIndex((s, k) => !stageDoneOf(l, k)); return i < 0 ? 5 : i; };

// The task's checklist: the stages, with each renovation line and furniture sub-stage on its own.
function checklistOf(l) {
  return [
    { title: 'Service agreement signed', done: l.agreement.signed },
    ...l.renovation.items.filter(x => x.title.trim()).map(x => ({ title: `Renovation: ${x.title.trim()}`, done: x.status === 'done' })),
    ...FURN.map(f => ({ title: `Furniture: ${f.label}`, done: subDoneOf(l, f.key) })),
    { title: 'Final quotation & payment confirmed', done: l.payment.confirmed },
    { title: 'Marketing task sent', done: !!l.marketing.taskId },
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

  const mk = x => x.marketing.items.filter(m => m.on).map(m => m.title).join(', ');
  const t0 = a.marketing.items.map(m => m.title), t1 = b.marketing.items.map(m => m.title);
  for (const t of t1) if (!t0.includes(t)) out.push(`Marketing: added ${t}.`);
  if (mk(a) !== mk(b)) out.push(`Marketing items: ${mk(b) || 'none'}.`);
  if (b.marketing.taskId && !a.marketing.taskId) out.push(`Sent to Marketing as a task (${b.marketing.items.filter(m => m.on).length} items).`);

  if (b.live.live && !a.live.live) out.push(`Marked as Live${b.live.overrideReason ? ` before Marketing was done: ${b.live.overrideReason}` : ''}.`);
  if (b.live.opsGroup !== a.live.opsGroup) out.push(b.live.opsGroup ? 'Ops WhatsApp group made.' : 'Ops WhatsApp group un-ticked.');

  const s0 = currentIdxOf(a), s1 = currentIdxOf(b);
  if (s0 !== s1) out.push(`Now at stage ${s1 + 1}: ${STAGES[s1].label}.`);
  return out;
}

export default {
  data() {
    return {
      STAGES, RSTATUS, FURN, PAY_LINKS, FILTERS, FEE_PCT,
      canEdit: EDITORS.includes(me.role), isDirector: me.role === 'director',
      canAddPortfolio: PORTFOLIO_ADDERS.includes(me.role), canSeeContact: CONTACT_READERS.includes(me.role),
      view: 'list', listings: [], search: '', filter: 'all',
      tasks: [], inboxLoading: false, inboxError: '',
      l: null, saved: null, d: null, c: { ownerPhone: '', ownerEmail: '' }, c0: { ownerPhone: '', ownerEmail: '' },
      tab: 0, linkAdd: { label: '', url: '' }, pasteOpen: '', pasteText: '', mkAdd: '', liveReason: '',
      linked: [], tasksLoading: false, tasksError: '',
      form: {}, formError: '', okMsg: '', error: '', loading: true, busy: false
    };
  },
  // ?id= opens a listing, ?new=1 the new-listing form. Moving between them changes the address, which remounts the page;
  // a message for the next view travels in history.state.
  async mounted() {
    const q = this.$route.query;
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
        if (this.canEdit) this.loadInbox();
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
    currentIdx(l) { return currentIdxOf(l); },
    stageNote(l, i) {
      if (i === 0) return l.agreement.signed ? 'Signed' : l.agreement.skipped ? 'Skipped for now' : 'Not yet';
      if (i === 1) return `${l.renovation.items.filter(x => x.status === 'done').length}/${l.renovation.items.length} done`;
      if (i === 2) return `${FURN.filter(f => subDoneOf(l, f.key)).length}/3 completed`;
      if (i === 3) return l.payment.confirmed ? 'Confirmed' : 'Waiting';
      if (i === 4) return l.marketing.taskId ? 'Sent' : 'Not sent';
      return l.live.live ? 'Live' : 'Not yet';
    },
    renoGroups() { return [...RENO_GROUPS, ...new Set(this.d.renovation.items.map(x => x.group).filter(g => !RENO_GROUPS.includes(g)))]; },
    renoCost(l) { return money(l.renovation.items.reduce((t, x) => t + money(x.cost), 0)); },
    renoFee(l) { return money(this.renoCost(l) * FEE_PCT / 100); },
    sum(lines) { return money(lines.reduce((t, x) => t + money(x.cost), 0)); },
    furnTotal(l) { return money(FURN.reduce((t, f) => t + this.sum(l.furniture[f.key]), 0)); },
    subDone(l, k) { return subDoneOf(l, k); },
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
        await syncTask(l.tmsTaskId, { note: s.pendingNote || '', checklist: checklistOf(l), completed: completed ?? (l.live.live ? true : undefined) });
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
      Object.assign(this.d.payment, { confirmed: true, confirmedByUid: me.user.uid, confirmedByName: me.name, confirmedAt: nowIso() });
      if (!(await this.save())) this.d.payment = keep;
    },
    // Directors only (the TMS lets Directors create tasks): a separate Marketing task with the chosen items as its checklist.
    async sendMarketing() {
      const d = this.d, l = this.l;
      if (!d.payment.confirmed) { this.formError = 'Confirm the final payment first (stage 4).'; return; }
      const items = d.marketing.items.filter(m => m.on).map(m => m.title);
      if (!items.length) { this.formError = 'Tick at least one marketing item.'; return; }
      const err = this.validate(d);
      if (err) { this.formError = err; return; }
      this.busy = true; this.formError = '';
      let taskId;
      try {
        taskId = await createTask({ title: `Marketing: ${this.placeOf(d)} (${l.id})`, details: `New owner listing ${l.id}${d.ownerName ? ', owner ' + d.ownerName : ''}. Sent from the PMS by ${me.name}.`,
          assigneeUids: [], departmentId: 'marketing', priority: 'medium', subtasks: items, pmsLink: { type: LINK_TYPE, id: l.id }, dueDate: d.dueDate || undefined });
      } catch (e) { this.formError = `Could not send to Marketing: ${e.message} Nothing was changed.`; this.busy = false; return; }
      this.busy = false;
      Object.assign(d.marketing, { taskId, sentAt: nowIso(), sentByName: me.name });
      if (await this.save()) { this.okMsg = `${l.id}: Marketing task sent.`; this.loadTasks(); }
    },
    async markLive() {
      const d = this.d;
      const reason = this.liveReason.trim();
      if (!stageDoneOf(d, 4) && !reason) { this.formError = 'Give the reason to go live before the Marketing task is sent.'; return; }
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
    @media (max-width: 900px) { .nol-steps { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
    @media (max-width: 480px) { .nol-steps { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
