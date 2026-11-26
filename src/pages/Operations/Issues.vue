<template>
  <main class="content">
    <div class="loading-bar" v-show="loading || busy"></div>

    <!-- ===== Ticket list ===== -->
    <template v-if="!ticket">
      <div>
        <div class="page-head">
          <div>
            <h1>Issues</h1>
            <div class="sub">Raise a ticket for anything at a unit or in the office. You only see tickets tagged to your role, tickets you raised, and Directors see all.</div>
          </div>
          <button class="btn btn-primary" v-if="canRaise" @click="openRaise()">+ Raise a ticket</button>
        </div>

        <div class="kpis k3">
          <button type="button" class="card kpi kpi-link" :class="{ on: filter === 'open' }" @click="kpiGo('open')"><div class="label">Open</div><div class="value">{{ count('open') }}</div><div class="hint">{{ needReply() + ' need a reply from your role' }}</div></button>
          <button type="button" class="card kpi kpi-link" :class="{ on: filter === 'progress' }" @click="kpiGo('progress')"><div class="label">In progress</div><div class="value">{{ count('progress') }}</div><div class="hint">Being worked on by a tagged team</div></button>
          <button type="button" class="card kpi kpi-link" :class="{ on: filter === 'done' }" @click="kpiGo('done')"><div class="label">Completed this month</div><div class="value">{{ completedThisMonth() }}</div><div class="hint">Locked and archived</div></button>
        </div>

        <!-- One toolbar (6 Nov 2026): search first, then the Customer / In-house switch (a pill slides to the picked tab;
             counts follow the other filters) and Status. Team and unit drop-downs removed: search finds units. -->
        <div class="iss-tools" ref="list">
          <input class="input search" type="search" placeholder="Search ticket no., title or unit" v-model="search" aria-label="Search tickets">
          <div class="type-seg" role="tablist" aria-label="Ticket type" :style="{ '--i': TYPE_TABS.findIndex(k => k.key === typeTab) }">
            <span class="type-thumb" aria-hidden="true"></span>
            <template v-for="k in TYPE_TABS" :key="k.key">
              <button type="button" role="tab" :aria-selected="String(typeTab === k.key)" :class="[k.key || 'all', { on: typeTab === k.key }]" @click="setTypeTab(k.key)">
                {{ k.label }}<span class="n">{{ typeCount(k.key) }}</span></button>
            </template>
          </div>
          <OptionPicker class="status-pick" v-model="filter" :options="FILTERS.map(f => ({ value: f.key, label: f.label }))" label="Status" />
          <!-- A dashboard link can still open one team's tickets (?tag=); shown as a chip so it can be cleared -->
          <button type="button" class="team-chip" v-if="tagFilter" @click="tagFilter = ''" :aria-label="'Clear team filter ' + tagLabel(tagFilter)">{{ 'Team: ' + tagLabel(tagFilter) }}<span aria-hidden="true">×</span></button>
        </div>

        <!-- The list fades and slides a little when the type tab changes -->
        <Transition name="type-swap" mode="out-in">
        <div :key="typeTab">
        <Paged :items="shown()" v-slot="{ pageRows }">
        <div class="table-wrap">
          <table class="table hover-rows">
            <thead><tr><th>Ticket no.</th><th>Type</th><th>Title</th><th>Unit</th><th>Tags</th><th>Raised by</th><th>Raised on</th><th>Status</th><th>Last update</th></tr></thead>
            <tbody>
              <template v-for="t in pageRows" :key="t.id">
                <tr class="clickable" @click="open(t.id)">
                  <td class="nw ct-sub">{{ t.id }}<span class="ct-only" v-if="t.unit">{{ ' · ' + t.unit }}</span></td>
                  <td class="nw"><span class="type-badge" :class="typeOf(t)"><svg viewBox="0 0 24 24" aria-hidden="true" v-html="TYPE_ICON[typeOf(t)]"></svg>{{ TYPE_LABEL[typeOf(t)] }}</span></td>
                  <td class="t-title ct-title">{{ t.title }}</td>
                  <td class="nw ct-hide">{{ t.unit || '—' }}</td>
                  <!-- 19 Nov 2026: at most 2 tags in the list, then "+N" (hover shows the rest); the ticket shows them all -->
                  <td><div class="tag-wrap"><template v-for="g in t.tags.slice(0, 2)" :key="g"><span class="tag">{{ tagLabel(g) }}</span></template><span class="tag tag-more" v-if="t.tags.length > 2" :title="t.tags.slice(2).map(tagLabel).join(', ')">{{ `+${t.tags.length - 2}` }}</span></div></td>
                  <td><span class="who"><Avatar :uid="t.raisedByUid" :name="t.raisedBy" :role="t.raisedRole" :size="20" />{{ t.raisedBy }}<span class="tag role-tint" :style="roleTint(t.raisedRole)" v-if="showRole(t.raisedBy, t.raisedRole)">{{ tagLabel(t.raisedRole) }}</span></span></td>
                  <td class="nw">{{ day(raisedDay(t)) }}</td>
                  <td class="nw ct-badge"><span class="pill" :class="STATUS[t.status].cls" :title="statusHint(t)">{{ statusLabel(t) }}</span></td>
                  <!-- Last update (6 Nov 2026, replaced the comment and link counts): when anything last changed, and who posted last -->
                  <td class="nw ct-hide last-up" :title="stamp(t.updatedIso || t.raisedAt)"><span>{{ ago(t.updatedIso || t.raisedAt) }}</span><small v-if="t.lastBy">{{ t.lastBy }}</small></td>
                </tr>
              </template>
              <SkeletonRows v-if="loading && !shown().length" table :cols="9" />
              <tr v-show="!loading && !shown().length"><td colspan="9" class="muted">No tickets match.</td></tr>
            </tbody>
          </table>
        </div>
        </Paged>
        </div>
        </Transition>
        <p class="help" style="margin-top:12px">Completed tickets are locked: no edits or tag changes; comments stay open for follow-up. They stay searchable under Completed.
          <span>{{ `You can see ${visible().length} ticket${visible().length === 1 ? '' : 's'}.` }}</span>
          Files stay in the company Google Drive; tickets keep only the links.</p>
      </div>
    </template>

    <!-- ===== Ticket page ===== -->
    <template v-if="ticket">
      <div>
        <div class="page-head">
          <div>
            <a class="back-link" href="#" @click.prevent="back()">← All tickets</a>
            <h1>{{ ticket.id + ' · ' + ticket.title }}</h1>
            <div class="sub"><span class="type-badge" :class="typeOf(ticket)"><svg viewBox="0 0 24 24" aria-hidden="true" v-html="TYPE_ICON[typeOf(ticket)]"></svg>{{ TYPE_LABEL[typeOf(ticket)] }}</span>{{ (ticket.property || 'Office') + (ticket.unit ? ' · ' + ticket.unit : '') + ' · Raised by ' + ticket.raisedBy + (showRole(ticket.raisedBy, ticket.raisedRole) ? ` (${tagLabel(ticket.raisedRole)})` : '') + ' on ' + (ticket.reportDate ? day(ticket.reportDate) : stamp(ticket.raisedAt)) }}</div>
          </div>
        </div>

        <div class="side-grid">
          <div class="thread">
            <div class="post orig">
              <div class="post-head"><Avatar :uid="ticket.raisedByUid" :name="ticket.raisedBy" :role="ticket.raisedRole" :size="24" /><b>{{ ticket.raisedBy }}</b><span class="tag role-tint" :style="roleTint(ticket.raisedRole)" v-if="showRole(ticket.raisedBy, ticket.raisedRole)">{{ tagLabel(ticket.raisedRole) }}</span><span class="when">{{ stamp(ticket.raisedAt) }}</span><span class="tag">Original issue</span></div>
              <p>{{ ticket.body }}</p>
              <!-- 17 Nov 2026: posted files as preview cards (photos show a thumbnail); click opens the viewer -->
              <div class="previews posted" v-show="ticket.links.length"><template v-for="l in ticket.links" :key="l.url"><button type="button" class="pv" :title="'Open ' + l.name" @click="$refs.viewer.open({ name: l.name, url: l.url, kind: 'issues' })"><span class="pv-open"><img v-if="thumbs[l.url] && thumbs[l.url] !== 'none'" :src="thumbs[l.url]" alt=""><span class="pv-ico" v-else>{{ fileIcon(l.name) }}</span></span><span class="pv-name">{{ l.name }}</span></button></template></div>
            </div>
            <!-- 17 Nov 2026: comment box under the original issue, newest comments first -->
            <!-- 17 Nov 2026: files picked, pasted (Ctrl+V) or dropped stay on this device until Post comment, which uploads
                 them to the ticket's Drive folder and then posts. Removing one before posting never touches Drive. -->
            <!-- 18 Nov 2026: comments stay open on a completed ticket (follow-up only); everything else is locked -->
            <div class="post composer" :class="{ dropping }" v-show="canComment()"
              @dragover.prevent="dragOver($event)" @dragleave="e => { if (!e.currentTarget.contains(e.relatedTarget)) dropping = false; }" @drop.prevent="onDrop($event)">
              <div class="drop-hint" v-if="dropping">Drop to attach</div>
              <div class="done-note" v-if="ticket.status === 'done'">Ticket completed. Comments are for follow-up only.</div>
              <textarea class="input" placeholder="Write a comment... (paste with Ctrl+V or drop files here)" v-model="draft.text" aria-label="Comment" @paste="onPaste($event)"></textarea>
              <!-- Previews of what will be posted: click to open, × to take it off -->
              <div class="previews" v-show="draft.files.length">
                <template v-for="(l, i) in draft.files" :key="l.key">
                  <div class="pv" :title="l.name">
                    <button type="button" class="pv-open" @click="openLocal(l)" :aria-label="'Preview ' + l.name">
                      <img v-if="l.preview && l.kind === 'image'" :src="l.preview" alt="">
                      <video v-else-if="l.preview && l.kind === 'video'" :src="l.preview" muted preload="metadata"></video>
                      <span class="pv-ico" v-else>{{ l.kind === 'video' ? '🎬' : icon(l.name) }}</span>
                    </button>
                    <span class="pv-name">{{ l.name }}</span>
                    <button type="button" class="pv-x" @click="dropFile(i)" :disabled="draft.sending !== null" aria-label="Remove">×</button>
                  </div>
                </template>
              </div>
              <div class="notice error" v-show="draft.error">{{ draft.error }}</div>
              <div class="composer-row">
                <label class="btn" :class="{ off: draft.sending !== null }">⬆ Attach file<input type="file" multiple hidden accept="image/*,application/pdf,video/*" :disabled="draft.sending !== null" @change="e => { attachFiles([...e.target.files]); e.target.value = ''; }"></label>
                <span class="help">Attach, paste (Ctrl+V) or drop a photo, PDF or video. Saved to Drive when you post.</span>
                <button class="btn btn-primary" @click="postComment()" :disabled="busy || (!draft.text.trim() && !draft.files.length)">{{ draft.sending !== null ? `Uploading ${draft.sending}%` : 'Post comment' }}</button>
              </div>
            </div>
            <div class="locked" v-show="ticket.status === 'done'">{{ 'Completed on ' + stamp(ticket.doneAt) + ' by ' + ticket.doneBy + '. This ticket is locked: no edits or tag changes. Comments stay open for follow-up.' }}</div>
            <div class="locked" v-show="ticket.status !== 'done' && !canComment()">View only. Your role can read this ticket but not comment on it.</div>
            <template v-for="c in newestFirst" :key="c.id">
              <div class="post">
                <div class="post-head"><Avatar :uid="c.byUid" :name="c.by" :role="c.byRole" :size="24" /><b>{{ c.by }}</b><span class="tag role-tint" :style="roleTint(c.byRole)" v-if="showRole(c.by, c.byRole)">{{ tagLabel(c.byRole) }}</span><span class="when">{{ stamp(c.at) }}</span></div>
                <p>{{ c.text }}</p>
                <div class="previews posted" v-show="c.links.length"><template v-for="l in c.links" :key="l.url"><button type="button" class="pv" :title="'Open ' + l.name" @click="$refs.viewer.open({ name: l.name, url: l.url, kind: 'issues' })"><span class="pv-open"><img v-if="thumbs[l.url] && thumbs[l.url] !== 'none'" :src="thumbs[l.url]" alt=""><span class="pv-ico" v-else>{{ fileIcon(l.name) }}</span></span><span class="pv-name">{{ l.name }}</span></button></template></div>
              </div>
            </template>

          </div>

          <div class="stack" style="gap:16px">
            <div class="card">
              <div class="card-head"><h2>Details</h2></div>
              <!-- 18 Nov 2026 (Khairul): Actions at the top of Details; its menu opens downward -->
            <div class="acts acts-card" v-if="(ticket.status !== 'done' && canUpdate()) || canDelete">
              <button class="btn btn-primary" @click="menuOpen = !menuOpen" aria-haspopup="menu" :aria-expanded="String(menuOpen)">Actions
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></button>
              <div class="acts-back" v-if="menuOpen" @click="menuOpen = false"></div>
              <div class="acts-menu" v-if="menuOpen" role="menu">
                <button role="menuitem" v-show="ticket.status === 'open' && canUpdate()" @click="menuOpen = false; setProgress()" :disabled="busy">Mark in progress</button>
                <button role="menuitem" v-show="ticket.status !== 'done' && canUpdate()" @click="menuOpen = false; openEdit()" :disabled="busy">{{ typeOf(ticket) === 'customer' ? 'Edit ticket (people, area, details)' : 'Edit title & description' }}</button>
                <button role="menuitem" v-show="ticket.status !== 'done' && canUpdate()" @click="menuOpen = false; switchType()" :disabled="busy">{{ typeOf(ticket) === 'customer' ? 'Change to Office' : 'Change to On-site' }}</button>
                <button role="menuitem" v-show="ticket.status !== 'done' && canUpdate()" @click="menuOpen = false; openDone()">Mark completed</button>
                <button role="menuitem" v-if="canDelete && ticket.status === 'done'" @click="menuOpen = false; reopen = { reason: '', error: '' }">Reopen ticket</button>
                <button role="menuitem" class="danger" v-if="canDelete" @click="menuOpen = false; openDelete()">Delete ticket</button>
              </div>
            </div>
              <div class="kv"><span>Status</span><span><span class="pill" :class="STATUS[ticket.status].cls" :title="statusHint(ticket)">{{ statusLabel(ticket) }}</span></span></div>
              <div class="kv"><span>Type</span><span><span class="type-badge" :class="typeOf(ticket)"><svg viewBox="0 0 24 24" aria-hidden="true" v-html="TYPE_ICON[typeOf(ticket)]"></svg>{{ TYPE_LABEL[typeOf(ticket)] }}</span></span></div>
              <div class="kv"><span>Property</span><span>{{ ticket.property || '—' }}</span></div>
              <div class="kv"><span>Unit</span><span>{{ ticket.unit || '—' }}</span></div>
              <div class="kv"><span>Raised by</span><span class="who">{{ ticket.raisedBy }}<span class="tag role-tint" :style="roleTint(ticket.raisedRole)" v-if="showRole(ticket.raisedBy, ticket.raisedRole)">{{ tagLabel(ticket.raisedRole) }}</span></span></div>
              <!-- 19 Nov 2026 (Khairul): Raised on is the ticket's Date (when it was typed in stays in the audit log); then the
                   Action date (once completed) and the Deadline -->
              <div class="kv"><span>Raised on</span><span>{{ day(raisedDay(ticket)) }}</span></div>
              <div class="kv"><span>Action date</span><span>{{ ticket.completion?.actionDate ? day(ticket.completion.actionDate) : '—' }}</span></div>
              <div class="kv"><span>Deadline</span><span :class="{ late: isLate(ticket) }">{{ ticket.deadline ? day(ticket.deadline) : '—' }}</span></div>
              <div class="kv"><span>Tagged</span><span><template v-for="g in ticket.tags" :key="g"><span class="tag">{{ tagLabel(g) }}</span></template></span></div>
              <!-- 18 Nov 2026 (Customer tickets): the area, the people doing the work, and the ticket's Drive folder -->
              <template v-if="typeOf(ticket) === 'customer'">
                <div class="kv"><span>Area</span><span>{{ ticket.area || '—' }}</span></div>
                <div class="kv"><span>People</span><span class="ppl"><template v-for="p in ticket.assignees" :key="p.uid"><span class="who"><Avatar :uid="p.uid" :name="p.name" role="" :size="20" />{{ p.name }}</span></template><span v-if="!ticket.assignees.length">—</span></span></div>
                <div class="kv"><span>Drive folder</span><span><a v-if="ticket.driveFolderUrl" :href="ticket.driveFolderUrl" target="_blank" rel="noopener">Open folder</a><template v-else>Made with the first file</template></span></div>
                <!-- 26 Nov 2026 (Khairul): the Owner Portal shows this ticket's progress to the owner unless it is hidden here -->
                <div class="kv"><span>Owner portal</span><span>{{ ticket.hideFromOwner ? 'Hidden from owner' : 'Shown to owner' }}<button type="button" class="btn" v-if="canHideFromOwner()" style="margin-left:8px;padding:2px 10px" :disabled="busy" @click="toggleOwnerView()">{{ ticket.hideFromOwner ? 'Show' : 'Hide' }}</button></span></div>
              </template>
              <button class="btn" style="width:100%;margin-top:8px" v-show="ticket.status !== 'done' && canUpdate()" @click="openTags()">Edit Department Tags </button>
            <ConfirmReason v-if="reopen" style="margin-top:12px" :title="'Reopen ' + ticket.id + '?'" text="It goes back to In progress. The completion details stay in the audit log." label="Reason" placeholder="e.g. Leak came back" v-model="reopen.reason" confirm-text="Reopen" :busy="busy" @confirm="doReopen()" @cancel="reopen = null" />
            <div class="notice error" v-if="reopen && reopen.error" style="margin-top:8px">{{ reopen.error }}</div>
            <button class="btn" style="width:100%;margin-top:8px" @click="auditOpen = true">Audit log</button>
            </div>
            <!-- 18 Nov 2026: what was done, its cost and the owner charge (Customer tickets completed with the new popup).
                 The Quote & invoice card (TicketQuote.vue) is no longer shown: Accounting charges the owner from
                 Expenses & Reimbursements > Maintenance instead. Old issueQuotes and their expense lines are kept. -->
            <div class="card" v-if="ticket.completion">
              <div class="card-head"><h2>Completion</h2></div>
              <div class="kv"><span>Action date</span><span>{{ day(ticket.completion.actionDate) }}</span></div>
              <div class="kv"><span>Action / Solution</span><span class="wrap">{{ ticket.completion.solution }}</span></div>
              <div class="kv"><span>Fixed by</span><span>{{ ticket.completion.fixedByName }}</span></div>
              <div class="kv"><span>Cost (RM)</span><span>{{ money(ticket.completion.cost) }}</span></div>
              <div class="kv" v-if="ticket.completion.costRemarks"><span>Cost remarks</span><span class="wrap">{{ ticket.completion.costRemarks }}</span></div>
              <div class="kv"><span>Completed by</span><span>{{ ticket.completion.completedByName }}</span></div>
              <div class="kv"><span>Owner charge</span><span>{{ ticket.billing?.status === 'charged' ? `RM ${money(ticket.billing.wbCharge)} · invoice ${ticket.billing.invoiceNo}` : 'Pending (Accounting)' }}</span></div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Raise a ticket -->
    <div class="modal-back" v-show="raise" @click.self="raise = null" v-esc="() => { raise = null }">
      <template v-if="raise">
        <form class="modal" role="dialog" aria-label="Raise a ticket" @submit.prevent="saveRaise()">
          <h2>Raise a ticket</h2>
          <div class="notice error" v-show="raise.error">{{ raise.error }}</div>
          <div class="field"><label class="req">Type</label>
            <div class="type-pick" role="radiogroup" aria-label="Ticket type">
              <button type="button" role="radio" :aria-checked="String(raise.type === 'customer')" :class="{ on: raise.type === 'customer' }" @click="raise.type = 'customer'"><b>On-site</b><small>A tenant, owner or housekeeping problem at a unit</small></button>
              <button type="button" role="radio" :aria-checked="String(raise.type === 'inhouse')" :class="{ on: raise.type === 'inhouse' }" @click="raise.type = 'inhouse'"><b>Office</b><small>The HQ office, staff or company matters (no unit)</small></button>
            </div></div>
          <div class="field"><label class="req" for="rTitle">Title</label><input class="input" id="rTitle" ref="rTitle" v-model="raise.title" placeholder="e.g. Aircond leaking in master bedroom"></div>
          <!-- 19 Nov 2026 (Khairul): the date the problem was reported, today by default (Malaysia time); both ticket types -->
          <div class="date-pair">
            <FormField id="rDate" label="Date" type="date" v-model="raise.reportDate" :max="today()" req />
            <FormField id="rDue" label="Deadline" type="date" v-model="raise.deadline" :min="raise.reportDate" req />
          </div>
          <!-- Customer tickets only: the property, and the ticket's card goes to that property's board in the task system
               (Maintenance). In-house tickets stay in the PMS and have no property. -->
          <div class="field" v-if="raise.type === 'customer'"><label class="req" for="rProp">Property</label>
            <OptionPicker v-if="propertyChoices().length" class="full-pick" v-model="raise.property" :options="propertyOptions()" label="Property" searchable @change="raise.unit = ''" />
            <input v-else class="input" id="rProp" v-model="raise.property" maxlength="80" placeholder="Type the property name, as on its task system board">
            <div class="help">The ticket's card goes to this property's board in the task system (Maintenance). A property with no board yet gets one.</div></div>
          <!-- In-house tickets have no unit (6 Nov 2026), so one isn't added by mistake -->
          <!-- Slides shut for In-house and open again for Customer; hidden fields can't be tabbed into -->
          <div class="unit-fold" :class="{ open: raise.type !== 'inhouse' }" :inert="raise.type === 'inhouse' || null">
            <div class="unit-inner"><div class="field"><label :class="{ req: raise.type === 'customer' }" for="rUnit">Unit</label>
              <ComboInput id="rUnit" v-model="raise.unit" :options="unitOptions()" placeholder="Choose the unit" /></div></div>
          </div>
          <!-- 18 Nov 2026 (Customer tickets): the area of the unit, and the Maintenance people who do the work -->
          <template v-if="raise.type === 'customer'">
            <div class="field"><label for="rArea">Area</label>
              <OptionPicker class="full-pick" v-model="raise.area" :options="areaOptions()" label="Area" />
              <input v-if="raise.area === 'Other'" class="input" id="rArea" style="margin-top:8px" v-model="raise.areaOther" maxlength="60" placeholder="Which area?"></div>
            <div class="field"><label>People</label>
              <PeoplePicker v-model="raise.people" :people="staffFor" placeholder="Search Maintenance staff" :empty-text="peopleNote(raise.property)" />
              <div class="help">Who does the work. Role tags above decide who can see the ticket; people picked here can always see and update it.</div></div>
          </template>
          <div class="field"><label class="req" for="rBody">What happened</label><textarea class="input" id="rBody" style="height:96px" v-model="raise.body" placeholder="Describe the issue, when it started and what you have tried"></textarea></div>
          <div class="field" style="margin-bottom:8px"><label>Tag the roles who should handle it</label>
            <!-- Same chips + drop-down as Edit tags. Your own role is always tagged and has no × -->
            <div class="tag-pick">
              <template v-for="g in TAGS.filter(x => raise.tags.includes(x))" :key="g"><span class="tag-chip" :class="g === myRole && 'locked'" :title="g === myRole ? 'Your role is always tagged' : null">{{ tagLabel(g) }}<button type="button" v-if="g !== myRole" @click="raise.tags = raise.tags.filter(x => x !== g)" :aria-label="'Remove ' + g">×</button></span></template>
              <span class="help" v-show="!raise.tags.length">No roles tagged</span>
            </div>
            <OptionPicker class="add-role" v-show="raise.tags.length < TAGS.length" v-model="addPickR" :options="addOptionsR()" label="Add a role" @change="addTagR($event)" /></div>
          <!-- 18 Nov: "Add Drive link" (name + pasted link) removed from the raise form at Khairul's ask; files are uploaded instead -->
          <div class="field" style="margin-bottom:6px"><label>Files</label>
            <div class="link-add" style="margin-top:0">
              <UploadFile v-if="raise.type !== 'customer' || (raise.property.trim() && raise.unit.trim())" kind="issues" :record-id="raise.rid" :folder-label="raise.title" :extra="raiseDrive()" @done="f => addUploaded(raise, f)" />
              <span class="help" v-else>Choose the property and unit first to upload, so files go to the unit's folder.</span>
            </div>
            <div class="help">Files stay in the company Google Drive; the ticket keeps only the link.</div></div>
          <div class="files" v-show="raise.links.length"><template v-for="(l, i) in raise.links" :key="l.url + i"><span class="file-chip"><span>{{ icon(l.name) + ' ' + l.name }}</span><button type="button" @click="raise.links.splice(i, 1)" aria-label="Remove">×</button></span></template></div>
          <div class="modal-foot"><button type="button" class="btn" @click="raise = null">Cancel</button><button class="btn btn-primary" :disabled="busy">Raise ticket</button></div>
        </form>
      </template>
    </div>

    <!-- Edit tags -->
    <div class="modal-back" v-show="tagEdit" @click.self="tagEdit = null" v-esc="() => { tagEdit = null }">
      <template v-if="tagEdit">
        <form class="modal" role="dialog" aria-label="Edit tags" @submit.prevent="saveTags()" style="max-width:460px">
          <h2>Edit Department Tags</h2>
          <div class="notice error" v-show="tagEdit.error">{{ tagEdit.error }}</div>
          <!-- Tagged roles as chips (× removes one); the drop-down adds a role not yet tagged -->
          <div class="field"><label for="tAdd">Tagged roles</label>
            <div class="tag-pick">
              <template v-for="g in TAGS.filter(x => tagEdit.tags.includes(x))" :key="g"><span class="tag-chip">{{ tagLabel(g) }}<span class="lock" v-if="g === raiserTag()" title="The department that raised the ticket stays tagged"> (Raised)</span><button type="button" v-if="g !== raiserTag()"  @click="tagEdit.tags = tagEdit.tags.filter(x => x !== g)" :aria-label="'Remove ' + g">×</button></span></template>
              <span class="help" v-show="!tagEdit.tags.length">No roles tagged</span>
            </div>
            <OptionPicker class="add-role" v-show="tagEdit.tags.length < TAGS.length" v-model="addPick" :options="addOptions()" label="Add a role" @change="addTag($event)" /></div>
          <FormField id="tWhy" label="Reason" v-model="tagEdit.reason" placeholder="e.g. Not an IT issue" />
          <div class="help">The department that raised the ticket always stays tagged.</div>
          <div class="modal-foot"><button type="button" class="btn" @click="tagEdit = null">Cancel</button><button class="btn btn-primary" :disabled="busy">Save tags</button></div>
        </form>
      </template>
    </div>

    <!-- Edit title & description (Directors and the tagged roles, rules Draft 0.47). The task system card follows. -->
    <div class="modal-back" v-show="edit" @click.self="edit = null" v-esc="() => { edit = null }">
      <template v-if="edit">
        <form class="modal" role="dialog" aria-label="Edit title and description" @submit.prevent="saveEdit()" style="max-width:520px">
          <h2>{{ 'Edit ' + ticket.id }}</h2>
          <p class="help" v-show="typeOf(ticket) === 'customer' && !ticket.property" style="margin-top:0">This On-site ticket has no property yet, so it has no card in the task system. Choose its property.</p>
          <div class="notice error" v-show="edit.error">{{ edit.error }}</div>
          <div class="field"><label class="req" for="eTitle">Title</label><input class="input" id="eTitle" ref="eTitle" v-model="edit.title" maxlength="200"></div>
          <div class="date-pair">
            <FormField id="eDate" label="Date" type="date" v-model="edit.reportDate" :max="today()" req />
            <FormField id="eDue" label="Deadline" type="date" v-model="edit.deadline" :min="edit.reportDate" req />
          </div>
          <div class="field" v-if="typeOf(ticket) === 'customer'"><label class="req" for="eProp">Property</label>
            <OptionPicker v-if="propertyChoices().length" class="full-pick" v-model="edit.property" :options="propertyOptions(edit.property)" label="Property" searchable />
            <input v-else class="input" id="eProp" v-model="edit.property" maxlength="80"></div>
          <div class="field"><label class="req" for="eBody">What happened</label><textarea class="input" id="eBody" style="height:120px" v-model="edit.body" maxlength="5000"></textarea></div>
          <template v-if="typeOf(ticket) === 'customer'">
            <div class="field"><label for="eArea">Area</label>
              <OptionPicker class="full-pick" v-model="edit.area" :options="areaOptions()" label="Area" />
              <input v-if="edit.area === 'Other'" class="input" id="eArea" style="margin-top:8px" v-model="edit.areaOther" maxlength="60" placeholder="Which area?"></div>
            <div class="field"><label>People</label>
              <PeoplePicker v-model="edit.people" :people="staffFor" :known="ticket.assignees.map(p => ({ ...p, role: '' }))" placeholder="Search Maintenance staff" :empty-text="peopleNote(edit.property)" /></div>
          </template>
          <div class="help">Saved in the audit log. The ticket's card in the task system changes too.</div>
          <div class="modal-foot"><button type="button" class="btn" @click="edit = null">Cancel</button><button class="btn btn-primary" :disabled="busy">Save</button></div>
        </form>
      </template>
    </div>

    <!-- 18 Nov 2026 (Khairul): In-house to Customer. Property, unit, a Maintenance person and an Operations person are required;
         Operations and Maintenance are tagged straight away. One write (rules Draft 0.82). -->
    <div class="modal-back" v-show="toCust" @click.self="toCust = null" v-esc="() => { toCust = null }">
      <template v-if="toCust">
        <form class="modal" role="dialog" :aria-label="'Change ' + ticket.id + ' to On-site'" @submit.prevent="saveToCustomer()" style="max-width:520px">
          <h2>{{ 'Change ' + ticket.id + ' to On-site' }}</h2>
          <p class="help" style="margin-top:0">An On-site ticket needs its unit and the people doing the work. Operations and Maintenance are tagged when you save.</p>
          <div class="notice error" v-show="toCust.error">{{ toCust.error }}</div>
          <div class="field"><label class="req" for="cProp">Property</label>
            <OptionPicker v-if="propertyChoices().length" class="full-pick" v-model="toCust.property" :options="propertyOptions()" label="Property" searchable @change="toCust.unit = ''" />
            <input v-else class="input" id="cProp" v-model="toCust.property" maxlength="80" placeholder="Type the property name, as on its task system board"></div>
          <div class="field"><label class="req" for="cUnit">Unit</label>
            <ComboInput id="cUnit" v-model="toCust.unit" :options="toCustUnitOptions()" placeholder="Choose the unit" /></div>
          <div class="field"><label for="cArea">Area</label>
            <OptionPicker class="full-pick" v-model="toCust.area" :options="areaOptions()" label="Area" />
            <input v-if="toCust.area === 'Other'" class="input" id="cArea" style="margin-top:8px" v-model="toCust.areaOther" maxlength="60" placeholder="Which area?"></div>
          <div class="field"><label class="req">Maintenance person</label>
            <PeoplePicker v-model="toCust.maint" :people="staffFor" placeholder="Search Maintenance staff" :empty-text="peopleNote(toCust.property)" /></div>
          <div class="field"><label class="req">Operations person</label>
            <PeoplePicker v-model="toCust.ops" :people="opsFor" placeholder="Search Operations staff" :empty-text="opsNote(toCust.property)" /></div>
          <div class="field"><label>Tags added</label>
            <div class="help" style="margin-top:0">{{ toCustTags().filter(g => !ticket.tags.includes(g)).map(tagLabel).join(', ') || 'None (already tagged)' }}</div></div>
          <div class="modal-foot"><button type="button" class="btn" @click="toCust = null">Cancel</button><button class="btn btn-primary" :disabled="busy">Change to On-site</button></div>
        </form>
      </template>
    </div>

    <!-- Delete ticket (Directors only). Nothing is hard-deleted: the ticket is marked deleted with a reason and leaves every list. -->
    <div class="modal-back" v-show="del" @click.self="del = null" v-esc="() => { del = null }">
      <template v-if="del">
        <form class="modal" role="dialog" aria-label="Delete ticket" @submit.prevent="remove()" style="max-width:440px">
          <h2>{{ 'Delete ' + ticket.id + '?' }}</h2>
          <p class="help" style="font-size:13px">It disappears from every list and dashboard and can't be opened again. It stays in the Audit log with your reason.</p>
          <div class="notice error" v-show="del.error">{{ del.error }}</div>
          <div class="field"><label for="dWhy">Reason</label><input class="input" id="dWhy" ref="dWhy" v-model="del.reason" placeholder="e.g. Test ticket, raised twice"></div>
          <div class="modal-foot"><button type="button" class="btn" @click="del = null">Cancel</button><button class="btn btn-danger" :disabled="busy">Delete ticket</button></div>
        </form>
      </template>
    </div>

    <!-- Audit log -->
    <div class="modal-back" v-if="auditOpen && ticket" @click.self="auditOpen = false" v-esc="() => { auditOpen = false }">
      <div class="modal audit-modal" role="dialog" aria-modal="true" aria-label="Audit log" style="max-width:560px">
        <h2>{{ 'Audit log · ' + ticket.id }}</h2>
              <div class="audit-list">
                <template v-for="a in ticket.audit" :key="a.at + a.text">
                  <div><div class="when">{{ stamp(a.at) }}</div><div v-if="a.by"><b>{{ a.by }}</b><span class="tag role-tint" :style="roleTint(a.role)" v-if="showRole(a.by, a.role)">{{ tagLabel(a.role) }}</span> {{ a.text }}</div><div v-else>{{ a.text }}</div></div>
                </template>
              </div>
        <div class="modal-foot"><button class="btn" @click="auditOpen = false">Close</button></div>
      </div>
    </div>

    <!-- Confirm complete -->
    <!-- In-house tickets: the simple popup. Customer tickets (18 Nov 2026): what was done, the cost and who fixed it. -->
    <div class="modal-back" v-show="confirmDone" @click.self="confirmDone = false">
      <div class="modal" role="dialog" aria-label="Mark completed" style="max-width:440px" v-if="!doneForm">
        <h2>Mark this ticket completed?</h2>
        <p class="help" style="font-size:13px">It will be locked and archived. Nobody can edit it or change tags after this; comments stay open for follow-up.</p>
        <div class="notice error" v-show="doneError">{{ doneError }}</div>
        <div class="modal-foot"><button class="btn" @click="confirmDone = false">Cancel</button><button class="btn btn-primary" @click="complete()" :disabled="busy">Mark completed</button></div>
      </div>
      <form class="modal" role="dialog" aria-label="Mark completed" style="max-width:520px" v-else @submit.prevent="complete()">
        <h2>Mark this ticket completed?</h2>
        <p class="help" style="font-size:13px;margin-top:0">It will be locked. Comments stay open for follow-up. Accounting is told so they can charge the owner.</p>
        <div class="notice error" v-show="doneError">{{ doneError }}</div>
        <div class="grid-fields">
          <FormField id="dDate" label="Action date" type="date" v-model="doneForm.actionDate" req />
          <FormField id="dCost" label="Cost (RM)" type="number" step="0.01" min="0" v-model="doneForm.cost" placeholder="0.00" req />
        </div>
        <div class="field"><label class="req" for="dSol">Action / Solution</label><textarea class="input" id="dSol" style="height:80px" v-model="doneForm.solution" maxlength="1000" placeholder="e.g. Replaced the aircond drain pipe"></textarea></div>
        <FormField id="dRem" label="Cost remarks" v-model="doneForm.costRemarks" placeholder="e.g. Parts RM 25, labour RM 15" />
        <div class="field"><label class="req">Fixed by</label>
          <OptionPicker class="full-pick" v-model="doneForm.fixedByUid" :options="fixedByOptions()" label="Fixed by" /></div>
        <div class="kv"><span>Drive folder</span><span><a v-if="ticket && ticket.driveFolderUrl" :href="ticket.driveFolderUrl" target="_blank" rel="noopener">Open folder</a><template v-else>Made when you complete</template></span></div>
        <div class="modal-foot"><button type="button" class="btn" @click="confirmDone = false">Cancel</button><button class="btn btn-primary" :disabled="busy">{{ busy ? 'Saving…' : 'Mark completed' }}</button></div>
      </form>
    </div>
    <FileViewer ref="viewer" />
  </main>
</template>

<script>
// Issues in Firestore: issues/{IS-0001} (title, unit, tags, status, Drive links, a short audit trail) and
// issues/{id}/replies/{autoId} for comments. Files stay in the company Google Drive; tickets keep only links.
// Completed tickets are locked by the rules too (no updates or replies once status is 'done').
import { collection, doc, getDoc, getDocs, updateDoc, query, where, orderBy, limit, writeBatch, runTransaction,
  arrayUnion, increment, serverTimestamp } from 'firebase/firestore';
import { db, ROLE_LABEL, CUSTOM_ROLES, issueTagOf, tagLabel } from '@/lib/firebase.js';
import FormField from '@/components/FormField.vue';
import ComboInput from '@/components/ComboInput.vue';
import Avatar from '@/components/Avatar.vue';
import { roleTint } from '@/lib/avatars.js';
import { useSession } from '@/stores/session.js';
import { audit, friendlyError } from '@/lib/finance-data.js';
import { stateFor } from '@/lib/states.js';
import { scoped, getScoped, canSee, isDirectorMe } from '@/lib/property-scope.js';
import { notifyRole, notifyUser } from '@/services/notificationService.js';
import OptionPicker from '@/components/OptionPicker.vue';
import UploadFile from '@/components/UploadFile.vue';
import { uploadForLink, fileBlob, driveId } from '@/lib/drive.js';
import { toast } from '@/lib/toast.js';
import FileViewer from '@/components/FileViewer.vue';
// TicketQuote.vue (Quote & invoice card) is no longer used here since 18 Nov 2026 (Expenses > Maintenance replaces it)
import PeoplePicker from '@/components/PeoplePicker.vue';
import ConfirmReason from '@/components/ConfirmReason.vue';
import { AREAS, maintenanceStaff, roleStaff, canBill, myMonth, myDay, r3 } from '@/lib/maintenance.js';
import { ticketFolder } from '@/lib/drive.js';
import { deleteField } from 'firebase/firestore';
import { NAV_ICONS } from '@/components/NavIcons.js';

import { liveMixin } from '@/lib/use-live.js';

import { syncIssue, maintenanceBoards } from '@/lib/tms.js';


const me = useSession();
const myRole = issueTagOf(me.role);          // the word saved on tickets: 'Finance' (shown as Accounting), 'Director'
const isDirector = ['director', 'branchDirector'].includes(me.role);
const isBD = me.role === 'branchDirector';   // 24 Nov 2026: Branch Directors see their branches' tickets (and in-house ones they are on)
// Posts, Raised by and the ticket's audit trail show the person's name with their role as a badge.
const myLabel = me.name || (isDirector ? 'Director' : `${myRole} user`);
// Every role raises, comments on and works its own tickets. IT included (Khairul 21 Oct), though IT is view-only elsewhere.
const canWrite = !!me.role;

// Roles made on the Roles page can be tagged too (by name).
const tagsNow = () => ['Director', 'IT', 'Admin', 'HR', 'Finance', 'Operations', 'Procurement', 'Marketing', ...Object.values(CUSTOM_ROLES).filter(r => r.active).map(r => r.name)];
let TAGS = tagsNow();   // worked out again each time the page opens, so a role made a minute ago is there
// Customer tickets start with these roles tagged (Khairul, 18 Nov 2026); they can still be taken off before raising.
// 18 Nov 2026: Maintenance (the custom role on Settings > Roles, matched by name) replaces Marketing. Skipped if that role doesn't exist or is off.
const maintenanceTag = () => Object.values(CUSTOM_ROLES).find(r => r.active && (r.name || '').trim().toLowerCase() === 'maintenance')?.name;
const customerTags = () => ['Operations', maintenanceTag()].filter(Boolean);
const startTags = type => [...new Set([...(TAGS.includes(myRole) ? [myRole] : []), ...(type === 'customer' ? customerTags() : [])])];
const STATUS = { open: { label: 'Open', cls: 'amber' }, progress: { label: 'In progress', cls: 'blue' }, done: { label: 'Completed', cls: 'green' }, deleted: { label: 'Deleted', cls: 'red' } };
const FILTERS = [{ key: 'all', label: 'All statuses' }, { key: 'active', label: 'Not completed' }, { key: 'open', label: 'Open' }, { key: 'progress', label: 'In progress' },
  { key: 'done', label: 'Completed' }, { key: 'mine', label: 'Tagged to my role' }, { key: 'raised', label: 'Raised by me' }];
// Each tag is answered by one sign-in role ('Admin' has no sign-in role yet, so Directors cover it).
// Roles made on the Roles page are tagged by name and notified by their id (rules Draft 0.21).
// Directors see every ticket but are only notified when Director (or Admin) is tagged (Khairul, 3 Nov 2026).
const TAG_ROLE = { Director: 'director', IT: 'it', Admin: 'director', HR: 'hr', Finance: 'finance', Accounting: 'finance', Operations: 'operations', Procurement: 'procurement', Marketing: 'marketing' };
const roleForTag = g => TAG_ROLE[g] || Object.keys(CUSTOM_ROLES).find(id => CUSTOM_ROLES[id].name === g) || null;
// Ticket type (6 Nov 2026): 'customer' (a guest or tenant's problem at a unit) or 'inhouse' (office, staff, company).
// Tickets from before have no type: one with a unit counts as Customer, one without as In-house, until someone changes it.
// 19 Nov 2026 (Khairul): shown as On-site and Office (the saved values stay 'customer' / 'inhouse')
const TYPE_LABEL = { customer: 'On-site', inhouse: 'Office' };
// Told apart by style and icon, not colour, so they work with any theme (custom themes included) and for colour-blind users.
const TYPE_ICON = { customer: NAV_ICONS.user, inhouse: NAV_ICONS.building };
const TYPE_TABS = [{ key: '', label: 'All' }, { key: 'customer', label: 'On-site' }, { key: 'inhouse', label: 'Office' }];
const typeOf = t => t.type === 'customer' || t.type === 'inhouse' ? t.type : (t.unit ? 'customer' : 'inhouse');
// The tab picked is remembered in this browser (Operations mostly sit on Customer).
const TYPE_KEY = 'wb.issueType';
const readTypeTab = () => { try { const v = localStorage.getItem(TYPE_KEY) || ''; return TYPE_LABEL[v] ? v : ''; } catch { return ''; } };
const LIST_LIMIT = 500;
let unitCache = null;
let boardCache = null;   // the task system's Maintenance boards (the Property list), 10 minutes
// Property names match whatever the capitals, extra spaces or kind of apostrophe (D'Majestic / D’Majestic)
const nameKey = s => String(s ?? '').replace(/[‘’`´]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
const sameName = (a, b) => nameKey(a) === nameKey(b);
// Links must point at the company Google Drive (Drive, Docs, Sheets, Slides).
const DRIVE_HOSTS = ['drive.google.com', 'docs.google.com'];

const pad = n => String(n).padStart(2, '0');
const localIso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const nowIso = () => localIso(new Date());
const isoOf = t => (t?.toDate ? localIso(t.toDate()) : typeof t === 'string' ? t : '');
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const toTicket = (id, d) => ({ id, ...d, tags: d.tags || [], links: d.links || [], audit: d.audit || [], assigneeUids: d.assigneeUids || [], assignees: d.assignees || [],
  raisedAt: isoOf(d.createdAt), updatedIso: isoOf(d.updatedAt), doneAt: isoOf(d.doneAt) });
// Accounting (Expenses Edit tick) and Directors read completed Customer tickets too (rules Draft 0.80), to charge the owner
const iBill = canBill(me);

export default {
  beforeCreate() { TAGS = tagsNow(); },
  mixins: [liveMixin],
  components: { FormField, Avatar, ComboInput, OptionPicker, UploadFile, FileViewer, PeoplePicker, ConfirmReason },
  data() {
    return {
      TAGS, STATUS, FILTERS, TYPE_LABEL, TYPE_ICON, TYPE_TABS, typeTab: readTypeTab(), myRole, canRaise: canWrite, canDelete: isDirector, del: null,
      menuOpen: false, auditOpen: false, edit: null, boards: [], pmsProps: [], addPick: '', addPickR: '', tickets: [], ticket: null, replies: [], units: [], search: '',
      // The dashboard links here with ?tag= (one team's tickets) and ?filter= (e.g. active = open or in progress).
      filter: FILTERS.some(f => f.key === this.$route.query.filter) ? this.$route.query.filter : (this.$route.query.tag ? 'active' : 'all'),
      tagFilter: TAGS.includes(this.$route.query.tag) ? this.$route.query.tag : '', okMsg: '', error: '', doneError: '',
      dropping: false, thumbs: {}, loading: true, busy: false, raise: null, tagEdit: null, confirmDone: false, draft: this.newDraft(),
      // 18 Nov 2026: Maintenance staff for the property being raised / edited, the completion form, the reopen box
      staffFor: [], staffLoading: false, doneForm: null, reopen: null, toCust: null, opsFor: [], opsLoading: false
    };
  },
  watch: {
    replies() { this.loadThumbs(); },
    'ticket.links'() { this.loadThumbs(); },
    'raise.property'(v) { if (this.raise?.type === 'customer') this.loadStaff(v); },
    'raise.type'(v) {
      if (!this.raise) return;
      // Switching type adds or takes off Operations + Maintenance (never your own role)
      if (v === 'customer') { this.raise.tags = [...new Set([...this.raise.tags, ...customerTags()])]; this.loadStaff(this.raise.property); }
      else { const ct = customerTags(); this.raise.tags = this.raise.tags.filter(g => g === myRole || !ct.includes(g)); }
    },
    'edit.property'(v) { if (this.edit && typeOf(this.ticket) === 'customer') this.loadStaff(v); },
    'toCust.property'(v) { if (this.toCust) { this.loadStaff(v); this.loadOps(v); } }
  },
  // ?id= opens a ticket. Opening one or going back changes the address, which remounts the page
  // (Back/Forward included); a message for the next screen travels in history.state.
  async mounted() {
    await this.route();
    this.loading = false;
  },
  computed: {
    // 17 Nov 2026: the thread shows the newest comment first, right under the comment box
    newestFirst() { return [...this.replies].reverse(); }
  },
  methods: {
    tagLabel,   // saved tag word -> what is shown ("Finance" shows as Accounting)
    // Summary cards: set the list's filter (if any) and scroll to it.
    kpiGo(key, ref = 'list') { if (key) this.filter = key; this.$nextTick(() => this.$refs[ref]?.scrollIntoView({ behavior: 'smooth', block: 'start' })); },
    roleTint,
    newDraft() { return { text: '', links: [], files: [], adding: false, linkName: '', linkUrl: '', error: '', sending: null }; },
    async route() {
      const id = this.$route.query.id;
      try {
        if (id) {
          const snap = await getDoc(doc(db, 'issues', id)).catch(e => { if (e.code === 'permission-denied') return null; throw e; });
          const t = snap?.exists() ? toTicket(id, snap.data()) : null;
          this.ticket = t && t.status !== 'deleted' && this.canSee(t) ? t : null;
          if (t?.status === 'deleted') this.error = `${id} was deleted.`;
          if (this.ticket) await this.loadReplies();
        }
        if (!this.ticket) await this.loadList();
      } catch (e) { this.error = friendlyError(e, 'load the tickets'); }
      this.draft = this.newDraft();
      this.okMsg = (!id || this.ticket) && history.state?.okMsg || '';
    },
    // Rules are not filters: Directors read every ticket; everyone else asks for tickets tagged to their role
    // and tickets they raised, and the two lists are merged.
    // Live (6 Nov 2026): new tickets and changes show without a refresh. Resolves when the list first arrives;
    // calling it again while it runs does nothing.
    loadList() {
      if (this.liveStops.mine || this.liveStops.all) return Promise.resolve();
      const col = collection(db, 'issues');
      const parts = isDirector && !isBD ? { all: query(col, orderBy('createdAt', 'desc'), limit(LIST_LIMIT)) }
        : isBD ? { ...Object.fromEntries(scoped(query(col, limit(LIST_LIMIT))).map((q, i) => ['prop' + i, q])), mine: query(col, where('raisedByUid', '==', me.user.uid), limit(LIST_LIMIT)),
          people: query(col, where('assigneeUids', 'array-contains', me.user.uid), limit(LIST_LIMIT)) }
        : { tagged: query(col, where('tags', 'array-contains', myRole), limit(LIST_LIMIT)), mine: query(col, where('raisedByUid', '==', me.user.uid), limit(LIST_LIMIT)),
          // 18 Nov 2026: tickets I am tagged on as a person (People), whatever roles are tagged (rules Draft 0.80)
          people: query(col, where('assigneeUids', 'array-contains', me.user.uid), limit(LIST_LIMIT)) };
      const got = {};
      return new Promise((resolve, reject) => {
        for (const [key, q] of Object.entries(parts)) {
          this.live(key, q, rows => {
            got[key] = rows;
            if (Object.keys(got).length < Object.keys(parts).length) return;
            const seen = new Map();
            // Customer tickets on a property that is not mine are left out; in-house tickets (no property) keep the tag rules
            for (const list of Object.values(got)) for (const r of list) if (!r.propertyId || canSee(r.propertyId)) seen.set(r.id, toTicket(r.id, r));
            this.tickets = [...seen.values()];
            resolve();
          }, { onError: e => { this.error = e.friendly || friendlyError(e, 'load the tickets'); reject(e); } });
        }
      }).catch(() => {});
    },
    // The open ticket and its comments, live: someone else's comment or progress change shows at once
    loadReplies() {
      const id = this.ticket.id;
      if (this.liveTicket === id) return Promise.resolve();
      this.liveTicket = id;
      this.live('ticket', doc(db, 'issues', id), d => {
        if (d && this.ticket?.id === id) Object.assign(this.ticket, toTicket(id, d));
      }, { onError: e => { this.error = e.friendly || friendlyError(e, 'load the ticket'); } });
      return new Promise(resolve => {
        this.live('replies', query(collection(db, 'issues', id, 'replies'), orderBy('createdAt')), rows => {
          this.replies = rows.map(r => ({ links: [], ...r })); resolve();
        }, { onError: e => { this.error = e.friendly || friendlyError(e, 'load the comments'); resolve(); } });
      });
    },
    open(id) { this.$router.push({ query: { id } }); },
    back() { this.$router.push({ query: {}, state: { okMsg: this.okMsg } }); },

    // Visibility: tagged to my role, raised by me, or Director (sees all)
    raisedByMe(t) { return t.raisedByUid === me.user.uid; },
    // 18 Nov 2026: also the people tagged on it (People), and Accounting for a completed Customer ticket (to charge the owner)
    isPerson(t) { return (t.assigneeUids || []).includes(me.user.uid); },
    canSee(t) { return isDirector || t.tags.includes(myRole) || this.raisedByMe(t) || this.isPerson(t) || (iBill && t.status === 'done' && t.type === 'customer' && !!t.completion); },
    // Units of the chosen property (all units until one is chosen)
    unitOptions() {
      const p = this.raise?.property;
      return this.units.filter(u => !p || sameName(u.propertyName, p)).map(u => ({ value: u.unitCode, hint: u.propertyName }));
    },
    visible() { return this.tickets.filter(t => t.status !== 'deleted' && this.canSee(t)); },
    canUpdate() { const t = this.ticket; return t && canWrite && t.status !== 'done' && (isDirector || t.tags.includes(myRole) || this.isPerson(t)); },
    canComment() { return canWrite; },
    // 26 Nov 2026: Hide from owner / Show to owner (Customer tickets, any status), for the people who work the ticket
    canHideFromOwner() { const t = this.ticket; return !!t && canWrite && typeOf(t) === 'customer' && (isDirector || t.tags.includes(myRole) || this.isPerson(t)); },
    async toggleOwnerView() {
      const t = this.ticket, next = !t.hideFromOwner; this.busy = true; this.error = '';
      try {
        await this.change({ hideFromOwner: next }, [next ? 'hid this ticket from the owner (Owner Portal)' : 'showed this ticket to the owner (Owner Portal)'], 'issue.ownerView',
          [{ field: 'hideFromOwner', old: !next, new: next }]);
        t.hideFromOwner = next;
        const row = this.tickets.find(x => x.id === t.id); if (row) row.hideFromOwner = next;
      } catch (e) { this.error = friendlyError(e, 'change this'); }
      this.busy = false;
    },
    // The status is always shown in PMS words (Open, In progress, Completed). Tickets tagged Operations or Procurement have a
    // card in the task system (TMS, Maintenance workspace); its column (e.g. DOING) is shown only when hovering the status.
    statusLabel(t) { return STATUS[t.status].label; },
    statusHint(t) { return t.tmsStatus?.name && t.tmsStatus.for === t.status ? `Task system column: ${t.tmsStatus.name}` : null; },
    count(s) { return this.visible().filter(t => t.status === s).length; },
    needReply() { return this.visible().filter(t => t.status === 'open' && (isDirector || t.tags.includes(myRole) || this.isPerson(t)) && (t.lastBy || t.raisedBy) !== myLabel).length; },
    completedThisMonth() { const ym = nowIso().slice(0, 7); return this.visible().filter(t => t.status === 'done' && (t.doneAt || '').slice(0, 7) === ym).length; },
    typeOf,
    setTypeTab(k) { this.typeTab = k; try { localStorage.setItem(TYPE_KEY, k); } catch { /* private window */ } },
    // Each tab's number: the tickets the other filters show, of that type.
    typeCount(k) { const list = this.filtered(); return k ? list.filter(t => typeOf(t) === k).length : list.length; },
    shown() { return this.typeTab ? this.filtered().filter(t => typeOf(t) === this.typeTab) : this.filtered(); },
    // Every filter except the type tab.
    filtered() {
      const q = this.search.trim().toLowerCase();
      return this.visible().filter(t => {
        if (['open', 'progress', 'done'].includes(this.filter) && t.status !== this.filter) return false;
        if (this.filter === 'active' && !['open', 'progress'].includes(t.status)) return false;
        if (this.tagFilter && !t.tags.includes(this.tagFilter)) return false;
        if (this.filter === 'mine' && !t.tags.includes(myRole)) return false;
        if (this.filter === 'raised' && !this.raisedByMe(t)) return false;
        return !q || [t.id, t.title, t.unit].some(v => (v || '').toLowerCase().includes(q));
      }).sort((a, b) => b.id.localeCompare(a.id));
    },
    day(iso) { return iso ? `${+iso.slice(8, 10)} ${MON[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}` : ''; },
    // "Just now", "5 min ago", "3h ago", "Yesterday", "4 days ago", then the date.
    ago(iso) {
      if (!iso) return '';
      const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
      if (mins < 1) return 'Just now';
      if (mins < 60) return `${mins} min ago`;
      if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
      const days = Math.floor(mins / 1440);
      return days === 1 ? 'Yesterday' : days < 7 ? `${days} days ago` : this.day(iso);
    },
    stamp(iso) { return iso ? `${this.day(iso)}, ${iso.slice(11, 16)}` : ''; },
    icon(fn) { return /\.(jpe?g|png|gif|webp|heic)$/i.test(fn) || /photo|image|picture/i.test(fn) ? '🖼' : /\.(xlsx?|csv)$/i.test(fn) || /sheet/i.test(fn) ? '📊' : '📄'; },
    // Add Drive link: a name and a Google Drive URL (nothing is uploaded to the PMS).
    // picked: the files as chosen on this device, for a preview before posting (never saved; links keep name and url only)
    addUploaded(target, files, picked = []) {
      files.forEach((f, i) => {
        if (target.links.length >= 10 || target.links.some(l => l.url === f.url)) return;
        const local = picked[i], type = local?.type || f.mimeType || '';
        const kind = type.startsWith('image/') ? 'image' : type.startsWith('video/') ? 'video' : '';
        target.links.push({ name: f.name.slice(0, 80), url: f.url, kind, preview: local && kind ? URL.createObjectURL(local) : '' });
      });
    },
    dropLink(target, i) {
      const [l] = target.links.splice(i, 1);
      if (l?.preview) URL.revokeObjectURL(l.preview);
    },
    // Ctrl+V in the comment box: pasted screenshots or copied files are uploaded to the ticket's folder. Plain text pastes as usual.
    // Posted files (17 Nov 2026): a thumbnail for each photo, read through /api/drive (photos up to 4 MB), 3 at a time.
    // thumbs[url] = blob URL, or 'none' when it can't be shown (the card then shows an icon).
    fileIcon(n) { return /\.(mp4|mov|m4v|webm|avi|3gp)$/i.test(n) ? '🎬' : /\.pdf$/i.test(n) ? '📕' : this.icon(n); },
    async loadThumbs() {
      const all = [...(this.ticket?.links || []), ...this.replies.flatMap(c => c.links || [])];
      const todo = all.filter(l => l.url && !(l.url in this.thumbs) && /\.(jpe?g|png|gif|webp)$/i.test(l.name || ''));
      for (const l of todo) this.thumbs[l.url] = 'none';
      const one = async l => {
        const id = driveId(l.url);
        if (!id) return;
        try { this.thumbs[l.url] = await fileBlob('issues', id); } catch { /* left as an icon */ }
      };
      for (let i = 0; i < todo.length; i += 3) await Promise.all(todo.slice(i, i + 3).map(one));
    },
    async onPaste(e) {
      const files = [...(e.clipboardData?.files || [])];
      if (!files.length || !this.ticket) return;   // plain text pastes as usual
      e.preventDefault();
      this.attachFiles(files, 'Pasted');
    },
    // Drag and drop: only file drags light the box up (dragging text inside it does nothing special)
    dragOver(e) { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.dataTransfer.dropEffect = 'copy'; this.dropping = true; } },
    onDrop(e) {
      this.dropping = false;
      const files = [...(e.dataTransfer?.files || [])];
      if (files.length && this.ticket) this.attachFiles(files, 'Dropped');
    },
    // Picked, pasted or dropped files: kept on this device with a preview until Post comment uploads them
    attachFiles(files, how = '') {
      const d = this.draft;
      if (d.sending !== null) return;
      const stamp = new Date().toTimeString().slice(0, 8).replace(/:/g, '');
      const room = 10 - d.files.length;
      if (room <= 0) { d.error = 'Up to 10 files per comment.'; return; }
      d.error = '';
      files.slice(0, room).forEach((f, i) => {
        // A screenshot comes in as "image.png": give it a name that tells pastes apart
        const file = how && (/^image\.\w+$/i.test(f.name) || !f.name)
          ? new File([f], `${how} ${stamp}${i ? '-' + (i + 1) : ''}.${(f.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`, { type: f.type }) : f;
        const kind = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : '';
        d.files.push({ key: `${Date.now()}-${i}-${file.name}`, file, name: file.name.slice(0, 80), kind, preview: kind ? URL.createObjectURL(file) : '' });
      });
      if (files.length > room) d.error = 'Up to 10 files per comment; the rest were left out.';
    },
    dropFile(i) {
      const [l] = this.draft.files.splice(i, 1);
      if (l?.preview) URL.revokeObjectURL(l.preview);
    },
    // A file not posted yet opens from this device (nothing in Drive yet)
    openLocal(l) { window.open(l.preview || URL.createObjectURL(l.file), '_blank', 'noopener'); },
    addLink(target) {
      target.error = '';
      let url;
      try { url = new URL(target.linkUrl.trim()); } catch { url = null; }
      if (!url || url.protocol !== 'https:' || !DRIVE_HOSTS.includes(url.hostname)) return target.error = 'Paste a Google Drive link, starting with https://drive.google.com/ or https://docs.google.com/.';
      if (target.links.some(l => l.url === url.href)) return target.error = 'That link is already added.';
      if (target.links.length >= 10) return target.error = 'Up to 10 links each time.';
      target.links.push({ name: target.linkName.trim().slice(0, 80) || 'Drive link', url: url.href });
      target.linkName = ''; target.linkUrl = ''; target.adding = false;
    },
    entry(text) { return { at: nowIso(), by: myLabel, role: myRole, text }; },
    // Older tickets saved the role as the name ('Director', 'Finance user'): no badge repeating it.
    showRole(name, role) { return !!role && name !== role && name !== `${role} user`; },
    async units4raise() {
      if (this.units.length) return;
      // The unit list is a read per unit; keep it for 10 minutes in this tab so reopening Issues doesn't download it again.
      if (unitCache && unitCache.uid === me.user.uid && Date.now() - unitCache.at < 600000) { this.units = unitCache.units; this.pmsProps = unitCache.props || []; return; }
      // Operations, Finance and Directors can read units; other roles type the unit instead.
      try {
        // Only my properties and their units (lib/property-scope.js)
        const [ps, us] = await Promise.all([getScoped(scoped(collection(db, 'properties'), '__id')), getScoped(scoped(collection(db, 'units')))]);
        const names = Object.fromEntries(ps.docs.map(d => [d.id, d.data().name]));
        this.pmsProps = ps.docs.map(d => ({ id: d.id, name: d.data().name || '' })).filter(p => p.name).sort((a, b) => a.name.localeCompare(b.name));
        this.units = us.docs.map(d => ({ id: d.id, ...d.data(), propertyName: names[d.data().propertyId] || '' }))
          .filter(u => u.active !== false && u.unitCode).sort((a, b) => a.unitCode.localeCompare(b.unitCode));
        unitCache = { at: Date.now(), uid: me.user.uid, units: this.units, props: this.pmsProps };
      } catch { this.units = []; }
    },

    // The Property list (12 Nov 2026): every PMS property, plus any Maintenance board in the task system that is not a PMS
    // property. A PMS property with no board yet gets one when its first ticket is raised (task system, makeBoard).
    // `keep`: a value to keep in the list (Edit).
    // The same list for the searchable drop-down
    propertyOptions(keep = '') { return [{ value: '', label: 'Choose the property' }, ...this.propertyChoices(keep).map(p => ({ value: p, label: p }))]; },
    propertyChoices(keep = '') {
      const names = this.pmsProps.map(p => p.name);
      // Task-system boards that are not on the PMS list: Directors see them all; staff only a board tied to one of their
      // own properties (access by property, 12 Nov 2026). Before this, every board showed for everyone.
      for (const b of this.boards) {
        if (names.some(n => sameName(n, b.name))) continue;
        if (isDirectorMe() || (b.pmsPropertyId && canSee(b.pmsPropertyId))) names.push(b.name);
      }
      names.sort((a, b) => a.localeCompare(b));
      return keep && !names.some(n => sameName(n, keep)) ? [keep, ...names] : names;
    },
    propertyIdOf(name) {
      const b = this.boards.find(x => sameName(x.name, name)), p = this.pmsProps.find(x => sameName(x.name, name));
      return b?.pmsPropertyId || p?.id || null;
    },
    async loadBoards() {
      if (boardCache && Date.now() - boardCache.at < 600000) { this.boards = boardCache.boards; return; }
      try { this.boards = await maintenanceBoards(); boardCache = { at: Date.now(), boards: this.boards }; }
      catch (e) { console.error('Task system boards:', e); this.boards = []; }
    },
    today() { return myDay(); },
    // The ticket's Date (19 Nov 2026); older tickets: the day it was raised
    raisedDay(t) { return t?.reportDate || (t?.raisedAt || '').slice(0, 10); },
    isLate(t) { return !!t?.deadline && !['done', 'deleted'].includes(t.status) && t.deadline < myDay(); },
    openRaise() {
      this.raise = { rid: (globalThis.crypto?.randomUUID?.() || String(Date.now()) + Math.random().toString(36).slice(2)).replace(/-/g, '').slice(0, 20), type: this.typeTab === 'inhouse' ? 'inhouse' : 'customer', title: '', property: '', unit: '', body: '', tags: startTags(this.typeTab === 'inhouse' ? 'inhouse' : 'customer'), links: [], linkName: '', linkUrl: '', error: '',
        area: '', areaOther: '', people: [], reportDate: myDay(), deadline: '' };
      this.staffFor = [];
      this.$nextTick(() => this.$refs.rTitle?.focus());
      this.units4raise();
      this.loadBoards();
    },
    // Owner Files (17 Nov 2026): where an issue upload goes. Customer ticket: the unit's Maintenance folder, found by
    // property and unit; the ticket folder is matched by the last 5 of driveRid (the id the raise form uploads under).
    raiseDrive() {
      const r = this.raise;
      if (!r || r.type !== 'customer') return {};
      const code = r.unit.trim().toUpperCase(), unit = this.units.find(u => u.unitCode.toUpperCase() === code) || null;
      return { propertyId: unit?.propertyId || this.propertyIdOf(r.property.trim()) || '', unit: unit?.unitCode || code, date: r.reportDate || myDay() };
    },
    ticketDrive(t) {
      if (!t || t.type !== 'customer' || !t.propertyId || !t.unit) return {};
      return { propertyId: t.propertyId, unit: t.unit, date: this.raisedDay(t) };   // the ticket's Date (raisedAt is local time)
    },
    async saveRaise() {
      const r = this.raise;
      if (!TYPE_LABEL[r.type]) return r.error = 'Choose On-site or Office.';
      if (!r.title.trim()) return r.error = 'Give the ticket a title.';
      if (r.type === 'customer' && !r.property.trim()) return r.error = 'Choose the property.';
      if (r.type === 'customer' && !r.unit.trim()) return r.error = 'Choose the unit for an On-site ticket.';
      if (!r.body.trim()) return r.error = 'Describe what happened.';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(r.reportDate || '')) return r.error = 'Choose the date.';
      if (r.reportDate > myDay()) return r.error = 'The date cannot be in the future.';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(r.deadline || '')) return r.error = 'Choose the deadline.';
      if (r.deadline < r.reportDate) return r.error = 'The deadline cannot be before the date.';
      if (!r.tags.length && !TAGS.includes(myRole)) return r.error = 'Tag at least one role to handle it.';
      if (r.linkUrl.trim()) { this.addLink(r); if (r.error) return; }
      const code = r.type === 'inhouse' ? '' : r.unit.trim().toUpperCase(), unit = this.units.find(u => u.unitCode.toUpperCase() === code) || null;
      if (unit && !sameName(unit.propertyName, r.property)) return r.error = `${unit.unitCode} is in ${unit.propertyName}, not ${r.property.trim()}.`;
      // Customer: the chosen property; In-house: none (it stays in the PMS)
      const propertyName = r.type === 'customer' ? r.property.trim().slice(0, 80) : '';
      const propertyId = propertyName ? unit?.propertyId || this.propertyIdOf(propertyName) : null;
      const tags = TAGS.filter(g => r.tags.includes(g) || g === myRole);
      // 18 Nov 2026 (Customer): area and the people doing the work
      const area = r.type === 'customer' ? this.areaValue(r) : '';
      if (r.type === 'customer' && r.area === 'Other' && !area) return r.error = 'Type the area, or pick one from the list.';
      const assignees = r.type === 'customer' ? this.peopleOf(r.people) : [];
      const h = this.entry(`raised the ${TYPE_LABEL[r.type]} ticket, tagged ${tags.map(tagLabel).join(', ')}` + (r.links.length ? ` · ${r.links.length} Drive link${r.links.length > 1 ? 's' : ''}` : '')
        + (assignees.length ? ` · people: ${assignees.map(p => p.name).join(', ')}` : ''));
      this.busy = true; r.error = '';
      try {
        // Customer ticket: the property's state goes on the ticket (state security); In-house tickets have none
        const state = propertyId ? await stateFor(propertyId) : '';
        // 18 Nov 2026: the ticket's Drive folder is made now (unit's Maintenance folder in Owner Files), so the ticket keeps
        // its link from the start. Best effort: a failure never stops the raise (the first file or completion makes it later).
        let folder = null;
        if (r.type === 'customer' && propertyId) {
          try { folder = await ticketFolder(r.rid, r.title.trim(), { propertyId, unit: unit?.unitCode || code, date: r.reportDate }); }
          catch (e) { console.warn('Ticket Drive folder not made yet:', e.message); }
        }
        // One transaction: the next IS number (counters/issues), the ticket and the audit entry.
        const id = await runTransaction(db, async tx => {
          const cRef = doc(db, 'counters', 'issues');
          const c = await tx.get(cRef);
          const n = c.exists() ? c.data().next || 1 : 1, id = 'IS-' + String(n).padStart(4, '0'), ref = doc(db, 'issues', id);
          // No read of the new ticket here: the rules can't check who may see a ticket that doesn't exist yet, so
          // that read is refused. Writing over an existing IS number is refused by the rules anyway.
          tx.set(cRef, { next: n + 1 });

          tx.set(ref, { type: r.type, title: r.title.trim(), body: r.body.trim(), unit: unit?.unitCode || code, unitId: unit?.id || null,
            property: propertyName, propertyId, ...(state ? { state } : {}), tags, status: 'open', reportDate: r.reportDate, deadline: r.deadline,
            raisedBy: myLabel, raisedRole: myRole, raisedByUid: me.user.uid, driveRid: r.rid, links: r.links, linkCount: r.links.length, replyCount: 0, lastBy: myLabel,
            ...(r.type === 'customer' ? { area, assigneeUids: assignees.map(p => p.uid), assignees } : {}),
            ...(folder?.folderId ? { driveFolderId: folder.folderId, driveFolderUrl: folder.folderLink } : {}),
            audit: [h], createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
          audit(tx, me, { action: 'issue.create', entity: `issues/${id}`, propertyId, changes: [{ field: 'tags', old: null, new: tags.join(', ') }] });
          return id;
        });
        this.raise = null; this.okMsg = `${id} raised and tagged ${tags.map(tagLabel).join(', ')}.`;
        this.notify({ id, tags, raisedRole: myRole, raisedByUid: me.user.uid },
          { title: `New issue ${id}`, message: `${myLabel} raised "${r.title.trim()}", tagged ${tags.map(tagLabel).join(', ')}.` });
        this.tellPeople({ id }, assignees.map(p => p.uid), `You were tagged on ${id}`, `${myLabel} tagged you on "${r.title.trim()}" (${propertyName}${code ? ' · ' + code : ''}).`);

        await this.loadList();

        // Customer tickets go to the task system (Maintenance); In-house ones stay here
        if (r.type === 'customer') await this.toTms(this.tickets.find(x => x.id === id) || { id, status: 'open', tags });

      } catch (e) {
        console.error('Failed to raise issue:', {
          code: e.code,
          message: e.message,
          error: e
        });

        r.error = e.plain
          ? e.message
          : friendlyError(e, 'raise the ticket');
      }
      this.busy = false;
    },
    async postComment() {
      const t = this.ticket, d = this.draft; if (!canWrite) return;   // 18 Nov 2026: comments allowed on completed tickets too
      if (d.linkUrl.trim()) { this.addLink(d); if (d.error) return; }
      const text = d.text.trim();
      if (!text && !d.links.length && !d.files.length) return;
      // 17 Nov 2026: attached files go to the ticket's Drive folder now, on Post. If that fails nothing is posted.
      let links = d.links.map(l => ({ name: l.name, url: l.url }));
      let folder = {};   // 18 Nov 2026: an older ticket keeps its Drive folder link the first time a file is added
      if (d.files.length) {
        this.busy = true; d.error = ''; d.sending = 0;
        try {
          const got = await uploadForLink('issues', d.files.map(f => f.file), p => { d.sending = Math.round(p * 100); }, t.driveRid || t.id, t.title, this.ticketDrive(t));
          links = [...links, ...got.map(f => ({ name: f.name.slice(0, 80), url: f.url }))];
          const fid = /\/folders\/([A-Za-z0-9_-]+)/.exec(got.folderLink || '')?.[1];
          if (fid && !t.driveFolderUrl) folder = { driveFolderId: fid, driveFolderUrl: got.folderLink };
          if (got.note) toast(got.note);
        } catch (e) { d.error = `Upload failed, nothing was posted: ${e.message}`; this.busy = false; d.sending = null; return; }
        d.sending = null;
      }
      // Plain comments are already in the thread; only added Drive links go in the audit log
      const h = links.length ? this.entry(`added ${links.length} Drive link${links.length > 1 ? 's' : ''}`) : null;
      this.busy = true; d.error = '';
      try {
        const b = writeBatch(db), ref = doc(db, 'issues', t.id);
        b.set(doc(collection(db, 'issues', t.id, 'replies')), { by: myLabel, byRole: myRole, byUid: me.user.uid, at: nowIso(), text, links, createdAt: serverTimestamp() });
        b.update(ref, { replyCount: increment(1), linkCount: increment(links.length), lastBy: myLabel, ...folder, ...(h ? { audit: arrayUnion(h) } : {}), updatedAt: serverTimestamp() });
        audit(b, me, { action: 'issue.comment', entity: `issues/${t.id}`, propertyId: t.propertyId || null, changes: links.length ? [{ field: 'links', old: null, new: links.length }] : [] });
        await b.commit();
        t.replyCount = (t.replyCount || 0) + 1; t.linkCount = (t.linkCount || 0) + links.length; t.lastBy = myLabel; Object.assign(t, folder); if (h) t.audit.push(h);
        this.notify(t, { title: `New comment on ${t.id}`, message: `${myLabel} commented on "${t.title}".` });
        if (typeOf(t) === 'customer') this.toTms(t);   // the TMS card gets this comment (and its files as attachments)
        for (const f of d.files) if (f.preview) URL.revokeObjectURL(f.preview);
        this.draft = this.newDraft();
        await this.loadReplies();
      } catch (e) { d.error = friendlyError(e, 'post the comment'); }
      this.busy = false;
    },
    // Progress, tags and completion: one update with its audit lines, plus the audit log entry.
    async change(fields, lines, action, changes, reason = '') {
      const t = this.ticket, hs = lines.map(x => this.entry(x));
      const b = writeBatch(db);
      b.update(doc(db, 'issues', t.id), { ...fields, audit: arrayUnion(...hs), updatedAt: serverTimestamp() });
      audit(b, me, { action, entity: `issues/${t.id}`, propertyId: t.propertyId || null, changes, reason });
      await b.commit();
      t.audit.push(...hs);
    },
    async setProgress() {
      const t = this.ticket; this.busy = true; this.error = '';
      try {
        await this.change({ status: 'progress' }, [`marked it in progress`], 'issue.progress', [{ field: 'status', old: t.status, new: 'progress' }]);
        t.status = 'progress';
        this.toTms(t);
        this.notify(t, { title: `${t.id} is in progress`, message: `${myLabel} marked "${t.title}" in progress.` });
      } catch (e) { this.error = friendlyError(e, 'update the ticket'); }
      this.busy = false;
    },
    // Customer <-> In-house: Directors and the tagged roles, while the ticket is open or in progress (rules Draft 0.45).
    async switchType() {
      const t = this.ticket, from = typeOf(t), to = from === 'customer' ? 'inhouse' : 'customer';
      if (to === 'customer') return this.openToCustomer();   // 18 Nov 2026: property, unit and people first
      this.busy = true; this.error = '';
      try {
        await this.change({ type: to }, [`changed the type from ${TYPE_LABEL[from]} to ${TYPE_LABEL[to]}`], 'issue.type', [{ field: 'type', old: TYPE_LABEL[from], new: TYPE_LABEL[to] }]);
        t.type = to; this.okMsg = `${t.id} is now an ${TYPE_LABEL[to]} ticket.`
          + (to === 'inhouse' ? ' Its task system card is removed (Office tickets stay in the PMS).'
            : t.property ? '' : ' Choose its property (Edit) so it goes to the task system.');
        this.toTms(t);   // Customer: its card is made; In-house: its card is removed
      } catch (e) { this.error = friendlyError(e, 'change the type'); }
      this.busy = false;
    },
    // 18 Nov 2026 (Khairul): In-house -> Customer popup
    openToCustomer() {
      const t = this.ticket;
      this.toCust = { property: t.property || '', unit: t.unit || '', area: '', areaOther: '', maint: [], ops: [], error: '' };
      this.staffFor = []; this.opsFor = [];
      Promise.all([this.units4raise(), this.loadBoards()]).then(() => { if (this.toCust) { this.loadStaff(this.toCust.property); this.loadOps(this.toCust.property); } });
    },
    toCustUnitOptions() {
      const p = this.toCust?.property;
      return this.units.filter(u => !p || sameName(u.propertyName, p)).map(u => ({ value: u.unitCode, hint: u.propertyName }));
    },
    toCustTags() { const t = this.ticket; return TAGS.filter(g => t.tags.includes(g) || customerTags().includes(g)); },
    async loadOps(propertyName) {
      const pid = this.propertyIdOf(String(propertyName || '').trim());
      this.opsFor = []; if (!pid) return;
      this.opsLoading = true;
      try { const list = await roleStaff('operations', pid); if (this.propertyIdOf(String(propertyName || '').trim()) === pid) this.opsFor = list; }
      catch (e) { console.error('Operations staff:', e); }
      this.opsLoading = false;
    },
    opsNote(propertyName) {
      if (!String(propertyName || '').trim()) return 'Choose the property first.';
      return this.opsLoading ? 'Loading…' : 'No Operations staff have access to this property.';
    },
    async saveToCustomer() {
      const c = this.toCust, t = this.ticket, propertyName = c.property.trim().slice(0, 80), code = c.unit.trim().toUpperCase();
      if (!propertyName) return c.error = 'Choose the property.';
      if (!code) return c.error = 'Choose the unit.';
      const unit = this.units.find(u => u.unitCode.toUpperCase() === code) || null;
      if (unit && !sameName(unit.propertyName, propertyName)) return c.error = `${unit.unitCode} is in ${unit.propertyName}, not ${propertyName}.`;
      if (!c.maint.length) return c.error = 'Pick the Maintenance person who does the work.';
      if (!c.ops.length) return c.error = 'Pick the Operations person in charge.';
      if (!maintenanceTag()) return c.error = 'There is no active Maintenance role (Settings > Roles), so the ticket can\'t be tagged to Maintenance.';
      const area = this.areaValue(c);
      if (c.area === 'Other' && !area) return c.error = 'Type the area, or pick one from the list.';
      const known = [...this.staffFor, ...this.opsFor, ...(t.assignees || [])];
      const uids = [...new Set([...(t.assigneeUids || []), ...c.maint, ...c.ops])].slice(0, 20);
      const assignees = uids.map(uid => ({ uid, name: (known.find(x => x.uid === uid)?.name || 'Staff').slice(0, 80) }));
      const added = uids.filter(u => !(t.assigneeUids || []).includes(u));
      const tags = this.toCustTags(), newTags = tags.filter(g => !t.tags.includes(g));
      this.busy = true; c.error = '';
      try {
        const propertyId = unit?.propertyId || this.propertyIdOf(propertyName) || null, state = propertyId ? await stateFor(propertyId) : '';
        const fields = { type: 'customer', property: propertyName, propertyId, ...(state ? { state } : {}), unit: unit?.unitCode || code, unitId: unit?.id || null,
          tags, assigneeUids: uids, assignees, ...(area ? { area } : {}) };
        const nm = uid => assignees.find(p => p.uid === uid)?.name || 'Staff';
        await this.change(fields, [`changed the type from Office to On-site · ${propertyName} · ${fields.unit}`
          + (newTags.length ? ` · tagged ${newTags.map(tagLabel).join(', ')}` : '')
          + ` · Maintenance: ${c.maint.map(nm).join(', ')} · Operations: ${c.ops.map(nm).join(', ')}`], 'issue.type',
          [{ field: 'type', old: 'Office', new: 'On-site' }, { field: 'unit', old: t.unit || null, new: fields.unit }, { field: 'people', old: (t.assignees || []).map(p => p.name).join(', ') || null, new: assignees.map(p => p.name).join(', ') }]);
        Object.assign(t, fields);
        this.toCust = null; this.okMsg = `${t.id} is now an On-site ticket for ${fields.unit}.`;
        this.toTms(t);   // its task system card is made
        if (newTags.length) this.notify(t, { title: `${t.id} tagged to ${newTags.join(', ')}`, message: `${myLabel} changed "${t.title}" to an On-site ticket (${propertyName} · ${fields.unit}).`, tags: newTags, includeRaiser: false });
        this.tellPeople(t, added, `You were tagged on ${t.id}`, `${myLabel} tagged you on "${t.title}" (${propertyName} · ${fields.unit}).`);
      } catch (e) { c.error = friendlyError(e, 'change the ticket to On-site'); }
      this.busy = false;
    },
    addOptionsR() { return [{ value: '', label: '+ Add a role…' }, ...TAGS.filter(x => !this.raise.tags.includes(x)).map(g => ({ value: g, label: tagLabel(g) }))]; },
    addTagR(v) { if (v && !this.raise.tags.includes(v)) this.raise.tags.push(v); this.addPickR = ''; },
    addOptions() { return [{ value: '', label: '+ Add a role…' }, ...TAGS.filter(x => !this.tagEdit.tags.includes(x)).map(g => ({ value: g, label: tagLabel(g) }))]; },
    addTag(v) { if (v && !this.tagEdit.tags.includes(v)) this.tagEdit.tags.push(v); this.addPick = ''; },
    // The department that raised the ticket stays tagged for good.
    raiserTag() { return this.ticket && this.ticket.tags.includes(this.ticket.raisedRole) ? this.ticket.raisedRole : null; },
    openTags() { this.tagEdit = { tags: [...this.ticket.tags], reason: '', error: '' }; },
    async saveTags() {
      const e = this.tagEdit, t = this.ticket;
      if (!e.tags.length) return e.error = 'Keep at least one role tagged.';
      if (this.raiserTag() && !e.tags.includes(this.raiserTag())) return e.error = `${this.raiserTag()} raised this ticket, so it stays tagged.`;
      const added = e.tags.filter(g => !t.tags.includes(g)), removed = t.tags.filter(g => !e.tags.includes(g));
      if (!added.length && !removed.length) return this.tagEdit = null;
      if (!e.reason.trim()) return e.error = 'Give a reason for the tag change.';
      const why = ` · reason: "${e.reason.trim()}"`, tags = TAGS.filter(g => e.tags.includes(g));
      this.busy = true; e.error = '';
      try {
        await this.change({ tags }, [...added.map(g => `added tag ${g}${why}`), ...removed.map(g => `removed tag ${g}${why}`)],
          'issue.tags', [{ field: 'tags', old: t.tags.join(', '), new: tags.join(', ') }], e.reason.trim());
        t.tags = tags; this.tagEdit = null;
        this.toTms(t);
        if (added.length) this.notify(t, { title: `${t.id} tagged to ${added.join(', ')}`, message: `${myLabel} tagged "${t.title}" to ${added.join(', ')}. Reason: ${e.reason.trim()}`, tags: added, includeRaiser: false });
        if (!this.canSee(t)) { this.okMsg = `${t.id} is no longer tagged to ${tagLabel(myRole)}, so it has left your list.`; this.back(); }
      } catch (err) { e.error = friendlyError(err, 'save the tags'); }
      this.busy = false;
    },

    // Mark completed. In-house: the simple confirm. Customer (18 Nov 2026): Action date, Action / Solution, Cost remarks,
    // Cost (RM), Fixed by (one of the people tagged; default me). Saved as `completion`, billing { status: 'pending' }.
    openDone() {
      const t = this.ticket;
      this.doneError = '';
      this.doneForm = typeOf(t) === 'customer'
        ? { actionDate: myDay(), solution: '', costRemarks: '', cost: '', fixedByUid: me.user.uid }
        : null;
      this.confirmDone = true;
    },
    // Fixed by: the people tagged on the ticket, plus me (the person completing) when I am not one of them
    fixedByChoices() {
      // You first (the default), then the ticket's People (18 Nov: no "Choose who fixed it" line)
      const mine = (this.ticket?.assignees || []).find(p => p.uid === me.user.uid) || { uid: me.user.uid, name: myLabel };
      return [mine, ...(this.ticket?.assignees || []).filter(p => p.uid !== me.user.uid)];
    },
    fixedByOptions() { return this.fixedByChoices().map(p => ({ value: p.uid, label: p.name })); },
    async complete() {
      const t = this.ticket, f = this.doneForm;
      this.doneError = '';
      let completion = null;
      if (f) {
        const cost = f.cost === '' || f.cost == null ? NaN : Number(f.cost);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(f.actionDate || '')) return this.doneError = 'Add the action date.';
        if (!f.solution.trim()) return this.doneError = 'Say what was done (Action / Solution).';
        if (!(cost >= 0)) return this.doneError = 'Enter the cost in RM (0 if it cost nothing).';
        const who = this.fixedByChoices().find(p => p.uid === f.fixedByUid);
        if (!who) return this.doneError = 'Choose who fixed it.';
        completion = { actionDate: f.actionDate, solution: f.solution.trim().slice(0, 1000), costRemarks: f.costRemarks.trim().slice(0, 300), cost: r3(cost),
          fixedByUid: who.uid, fixedByName: who.name, completedByUid: me.user.uid, completedByName: myLabel,
          completedAt: serverTimestamp(), month: myMonth(), driveFolderUrl: t.driveFolderUrl || '' };
      }
      this.busy = true;
      try {
        // An older ticket with no Drive folder link gets its folder now (best effort)
        const folder = {};
        if (completion && !t.driveFolderUrl && t.propertyId && t.unit) {
          try {
            const r = await ticketFolder(t.driveRid || t.id, t.title, this.ticketDrive(t));
            if (r.folderId) { Object.assign(folder, { driveFolderId: r.folderId, driveFolderUrl: r.folderLink }); completion.driveFolderUrl = r.folderLink; }
          } catch (e) { console.warn('Ticket Drive folder not made:', e.message); }
        }
        const fields = { status: 'done', doneAt: serverTimestamp(), doneBy: myLabel, doneByUid: me.user.uid,
          ...(completion ? { completion, billing: { status: 'pending' }, ...folder } : {}) };
        const line = completion
          ? `marked the ticket completed · action ${completion.actionDate}: ${completion.solution.slice(0, 120)} · fixed by ${completion.fixedByName} · cost RM ${completion.cost.toFixed(2)}`
          : 'marked the ticket completed';
        await this.change(fields, [line], 'issue.complete', [{ field: 'status', old: t.status, new: 'done' }, ...(completion ? [{ field: 'cost', old: null, new: completion.cost }] : [])]);
        Object.assign(t, { status: 'done', doneAt: nowIso(), doneBy: myLabel, ...folder,
          ...(completion ? { completion: { ...completion, completedAt: nowIso() }, billing: { status: 'pending' } } : {}) });
        this.confirmDone = false; this.doneForm = null;
        this.toTms(t);
        this.notify(t, { title: `${t.id} completed`, message: `${myLabel} marked "${t.title}" completed.` });
        // Accounting is told, so they charge the owner (Expenses & Reimbursements > Maintenance)
        if (completion) notifyRole({ recipientRole: 'finance', type: 'issue', refId: t.id, link: '/Finance/expenses?tab=maintenance',
          title: `${t.id} completed · cost RM ${completion.cost.toFixed(2)} · needs WB Charge`,
          message: `${t.unit || ''} ${t.property ? '(' + t.property + ')' : ''}: ${completion.solution.slice(0, 120)}. Fixed by ${completion.fixedByName}.` })
          .catch(e => console.error('Notification failed:', e));
      } catch (e) {
        this.doneError = friendlyError(e, 'complete the ticket');
      }
      this.busy = false;
    },
    // Reopen (Directors only, with a reason): back to In progress. The completion goes into completionHistory and the audit
    // line; the ticket leaves Accounting's Pending list. Refused while the owner is charged.
    async doReopen() {
      const t = this.ticket, r = this.reopen, reason = r.reason.trim();
      if (!reason) return r.error = 'Give a reason.';
      if (t.billing?.status === 'charged') return r.error = 'Remove the charge in Expenses first.';
      this.busy = true; r.error = '';
      try {
        const c = t.completion;
        const fields = { status: 'progress', reopenReason: reason, doneAt: deleteField(), doneBy: deleteField(), doneByUid: deleteField(),
          ...(c ? { completion: deleteField(), billing: deleteField(),
            completionHistory: arrayUnion({ ...c, completedAt: c.completedAt?.toDate ? isoOf(c.completedAt) : (c.completedAt || ''), reopenedAt: nowIso(), reopenedBy: myLabel, reopenReason: reason }) } : {}) };
        const line = `reopened the ticket · reason: "${reason}"` + (c ? ` · was completed on ${c.actionDate} by ${c.fixedByName}, cost RM ${Number(c.cost || 0).toFixed(2)}: ${String(c.solution || '').slice(0, 120)}` : '');
        await this.change(fields, [line], 'issue.reopen', [{ field: 'status', old: 'done', new: 'progress' }], reason);
        Object.assign(t, { status: 'progress', reopenReason: reason }); delete t.completion; delete t.billing; delete t.doneBy;
        this.reopen = null;
        this.toTms(t);
        this.notify(t, { title: `${t.id} reopened`, message: `${myLabel} reopened "${t.title}". Reason: ${reason}` });
      } catch (e) { r.error = friendlyError(e, 'reopen the ticket'); }
      this.busy = false;
    },

    // ----- People and Area (18 Nov 2026, Customer tickets) -----
    areaOptions() { return [{ value: '', label: 'Choose the area' }, ...AREAS.map(a => ({ value: a, label: a }))]; },
    areaValue(x) { return x.area === 'Other' ? x.areaOther.trim().slice(0, 60) : x.area; },
    // [{ uid, name }] for picked uids (names from the Maintenance list, or as saved on the ticket)
    peopleOf(uids) {
      const known = [...this.staffFor, ...(this.ticket?.assignees || [])];
      return uids.map(uid => { const p = known.find(x => x.uid === uid); return { uid, name: (p?.name || 'Staff').slice(0, 80) }; });
    },
    async loadStaff(propertyName) {
      const pid = this.propertyIdOf(String(propertyName || '').trim());
      this.staffFor = []; if (!pid) return;
      this.staffLoading = true;
      try { const list = await maintenanceStaff(pid); if (this.propertyIdOf(String(propertyName || '').trim()) === pid) this.staffFor = list; }
      catch (e) { console.error('Maintenance staff:', e); }
      this.staffLoading = false;
    },
    peopleNote(propertyName) {
      if (!String(propertyName || '').trim()) return 'Choose the property first.';
      return this.staffLoading ? 'Loading…' : 'No Maintenance staff have access to this property.';
    },
    tellPeople(t, uids, title, message) {
      const link = `/Operations/issues?id=${t.id}`;
      for (const uid of uids || []) if (uid !== me.user.uid)
        notifyUser({ recipientUid: uid, title, message, type: 'issue', refId: t.id, link }).catch(e => console.error('Notification failed:', e));
    },
    money(v) { return (Number(v) || 0).toFixed(2); },

    openDelete() {
      this.del = { reason: '', error: '' };
      this.$nextTick(() => this.$refs.dWhy?.focus());
    },
    // Directors only (rules too). Marked deleted, never removed: it leaves every list and dashboard count.
    async remove() {
      const t = this.ticket, d = this.del, reason = d.reason.trim();
      if (!reason) return d.error = 'Give a reason for deleting the ticket.';
      this.busy = true; d.error = '';
      try {
        await this.change({ status: 'deleted', deletedAt: serverTimestamp(), deletedBy: myLabel, deletedByUid: me.user.uid, deleteReason: reason },
          [`deleted the ticket · reason: "${reason}"`], 'issue.delete', [{ field: 'status', old: t.status, new: 'deleted' }], reason);
        this.del = null;
        // wait for the task system before leaving the ticket page, so a failure can be shown on the list
        const tmsError = await this.toTms({ ...t, status: 'deleted' });
        this.okMsg = `${t.id} deleted.` + (tmsError ? ` Its task system card was not removed (${tmsError}); it is removed when someone opens its board there.` : '');
        this.back();
      } catch (e) { d.error = friendlyError(e, 'delete the ticket'); }
      this.busy = false;
    },

    // Task system (TMS) Maintenance link, after every change: the TMS reads the ticket and makes or updates its card
    // (every ticket has one, on its property's board in the Maintenance workspace).
    // Best effort: the ticket is saved either way, and its next change tries again. Then the card's column name is kept on
    // the ticket for the status pill (rules Draft 0.47; only people who can change the ticket, and not once Completed).
    async toTms(t) {
      try {
        const r = await syncIssue(t.id);
        if (t.status === 'deleted') return '';
        // a new card: say where it went (In-house tickets have no property, so they go to the "Office" board)
        if (r.created) this.okMsg = `${this.okMsg ? this.okMsg + ' ' : ''}Task system card added to the board “${r.boardName}” (${r.column}).`;
        if (!r.taskId || !r.column || r.status !== t.status || !['open', 'progress'].includes(t.status)) return;
        if (!(isDirector || (t.tags || []).includes(myRole) || this.isPerson(t))) return;
        if (t.tmsStatus?.name === r.column && t.tmsStatus?.for === r.status) return;
        const tmsStatus = { name: r.column, for: r.status };
        await updateDoc(doc(db, 'issues', t.id), { tmsStatus });
        t.tmsStatus = tmsStatus;
        const row = this.tickets.find(x => x.id === t.id); if (row) row.tmsStatus = tmsStatus;
      } catch (e) {
        console.error('Task system sync failed:', e);
        if (t.status === 'deleted') return e.message;   // remove() shows it on the list
        this.error = `${t.id} is saved, but the task system was not updated: ${e.message}. It is tried again on the ticket's next change.`;
      }
      return '';
    },
    openEdit() {
      const t = this.ticket, other = t.area && !AREAS.includes(t.area);
      this.edit = { title: t.title, body: t.body || '', property: t.property || '', error: '', reportDate: t.reportDate || (t.raisedAt || '').slice(0, 10), deadline: t.deadline || '',
        area: other ? 'Other' : (t.area || ''), areaOther: other ? t.area : '', people: [...(t.assigneeUids || [])] };
      this.$nextTick(() => this.$refs.eTitle?.focus());
      this.staffFor = [];
      Promise.all([this.units4raise(), this.loadBoards()]).then(() => { if (this.edit && typeOf(t) === 'customer') this.loadStaff(this.edit.property); });
    },
    async saveEdit() {
      const e = this.edit, t = this.ticket, title = e.title.trim(), body = e.body.trim(), customer = typeOf(t) === 'customer';
      const property = customer ? e.property.trim().slice(0, 80) : (t.property || '');   // In-house: unchanged
      if (!title) return e.error = 'Give the ticket a title.';
      if (customer && !property) return e.error = 'Choose the property.';
      if (!body) return e.error = 'Describe what happened.';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(e.reportDate || '')) return e.error = 'Choose the date.';
      if (e.reportDate > myDay()) return e.error = 'The date cannot be in the future.';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(e.deadline || '')) return e.error = 'Choose the deadline.';
      if (e.deadline < e.reportDate) return e.error = 'The deadline cannot be before the date.';
      const lines = [], changes = [];
      if (title !== t.title) { lines.push(`changed the title (was "${t.title.slice(0, 80)}")`); changes.push({ field: 'title', old: t.title, new: title }); }
      if (body !== (t.body || '')) { lines.push('changed the description'); changes.push({ field: 'body', old: null, new: null }); }
      const fields = { title, body };
      const was = t.reportDate || (t.raisedAt || '').slice(0, 10);
      if (e.deadline !== (t.deadline || '')) { fields.deadline = e.deadline; lines.push(`changed the deadline to ${e.deadline}${t.deadline ? ` (was ${t.deadline})` : ''}`); changes.push({ field: 'deadline', old: t.deadline || null, new: e.deadline }); }
      if (e.reportDate !== was) { fields.reportDate = e.reportDate; lines.push(`changed the date to ${e.reportDate}${was ? ` (was ${was})` : ''}`); changes.push({ field: 'reportDate', old: was || null, new: e.reportDate }); }
      if (property !== (t.property || '')) {
        const propertyId = this.propertyIdOf(property), state = propertyId ? await stateFor(propertyId) : '';
        Object.assign(fields, { property, propertyId, ...(state ? { state } : {}) });
        lines.push(`changed the property (was ${t.property || 'none'})`); changes.push({ field: 'property', old: t.property || null, new: property });
      }
      // 18 Nov 2026 (Customer): area and people (audit "tagged / removed <name>"; newly tagged people are told)
      let added = [];
      if (customer) {
        const area = this.areaValue(e);
        if (e.area === 'Other' && !area) return e.error = 'Type the area, or pick one from the list.';
        if (area !== (t.area || '')) { fields.area = area; lines.push(`changed the area to ${area || 'none'}${t.area ? ` (was ${t.area})` : ''}`); changes.push({ field: 'area', old: t.area || null, new: area || null }); }
        const before = t.assigneeUids || [], after = e.people;
        added = after.filter(u => !before.includes(u));
        const removed = before.filter(u => !after.includes(u));
        if (added.length || removed.length) {
          const people = this.peopleOf(after), nameOf = uid => (people.find(p => p.uid === uid) || (t.assignees || []).find(p => p.uid === uid))?.name || 'Staff';
          Object.assign(fields, { assigneeUids: people.map(p => p.uid), assignees: people });
          lines.push(...added.map(u => `tagged ${nameOf(u)}`), ...removed.map(u => `removed ${nameOf(u)}`));
          changes.push({ field: 'people', old: (t.assignees || []).map(p => p.name).join(', ') || null, new: people.map(p => p.name).join(', ') || null });
        }
      }
      if (!lines.length) return this.edit = null;
      this.busy = true; e.error = '';
      try {
        await this.change(fields, lines, 'issue.edit', changes);
        Object.assign(t, fields);
        this.edit = null; this.okMsg = `${t.id} saved.`;
        this.toTms(t);   // the card's title, description, property and assignees follow
        this.tellPeople(t, added, `You were tagged on ${t.id}`, `${myLabel} tagged you on "${t.title}" (${t.property || ''}${t.unit ? ' · ' + t.unit : ''}).`);
      } catch (err) { e.error = friendlyError(err, 'save the ticket'); }
      this.busy = false;
    },

    // Notifications are best effort: a failed one is logged and never blocks or undoes the ticket action.
    // Only the tagged roles are told (the Director too only when tagged). Roles get one shared notification each (read state is per person); the person who raised the ticket
    // gets their own, unless they already receive the role one. You never see notifications you caused.
    async notify(t, { title, message, tags = t.tags, includeRaiser = true }) {
      const link = `/Operations/issues?id=${t.id}`;
      const roles = [...new Set(tags.map(roleForTag).filter(Boolean))];
      const raiserRole = roleForTag(t.raisedRole);
      const base = { title, message, type: 'issue', refId: t.id, link };
      const jobs = roles.map(recipientRole => notifyRole({ ...base, recipientRole }));
      if (includeRaiser && t.raisedByUid && t.raisedByUid !== me.user.uid && !roles.includes(raiserRole))
        jobs.push(notifyUser({ ...base, recipientUid: t.raisedByUid }));
      (await Promise.allSettled(jobs)).forEach(r => { if (r.status === 'rejected') console.error('Notification failed:', r.reason); });
    },
  },
}
</script>

<style scoped>
    .modal .add-role { display: block !important; width: 100% !important; }
    .modal .add-role :deep(.op-btn) { width: 100% !important; min-height: 40px; color: var(--text); }
    .add-role :deep(.op-val) { max-width: none; }
    .add-role :deep(.op-pop) { max-width: none; width: 100%; }
    .back-link { display: inline-block; margin-bottom: 8px; font-size: 13px; font-weight: 600; color: var(--accent); text-decoration: none; }
    .back-link:hover { text-decoration: underline; }
    .acts { position: relative; }
    .acts > .btn { display: inline-flex; align-items: center; gap: 6px; }
    .acts-card { margin: 0 0 12px; }
    .acts-card > .btn { width: 100%; justify-content: center; }
    .acts-card .acts-menu { top: calc(100% + 6px); bottom: auto; left: 0; right: 0; width: auto; }
    .acts-back { position: fixed; inset: 0; z-index: 20; }
    .acts-menu { position: absolute; left: auto; right: 0; top: calc(100% + 6px); z-index: 21; min-width: 100%; width: max-content; white-space: nowrap; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,.12); padding: 6px; display: grid; }
    .acts-menu button { text-align: left; background: none; border: 0; padding: 9px 12px; border-radius: 8px; font: inherit; font-size: 14px; color: var(--text); cursor: pointer; }
    .acts-menu button:hover:not(:disabled) { background: var(--accent-soft); color: var(--accent); }
    .acts-menu button.danger { color: var(--danger); }
    .acts-menu button.danger:hover { background: color-mix(in srgb, var(--danger) 12%, transparent); color: var(--danger); }
    .kpis.k3 { grid-template-columns: repeat(3, minmax(0,1fr)); }
    /* Ticket type (6 Nov 2026): tabs with counts, a badge on every row, and the choice when raising */
    /* Type switch: three equal tabs; the white pill (thumb) slides under the picked one */
    .type-seg { --i: 0; position: relative; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); flex: none; width: 360px; height: 40px;
      padding: 3px; border-radius: 10px; background: var(--chip); border: 1px solid var(--border); box-sizing: border-box; }
    .type-thumb { position: absolute; top: 3px; bottom: 3px; left: 3px; width: calc((100% - 6px) / 3); border-radius: 7px;
      background: var(--surface); box-shadow: 0 1px 3px rgba(0,0,0,.12), 0 0 0 1px var(--border);
      transform: translateX(calc(var(--i) * 100%)); transition: transform .28s cubic-bezier(.4, 0, .2, 1); }
    .type-seg button { position: relative; z-index: 1; display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-width: 0;
      border: 0; background: none; padding: 0 8px; border-radius: 7px; font: inherit; font-size: 13px; font-weight: 600;
      color: var(--muted); cursor: pointer; white-space: nowrap; transition: color .2s ease; }
    .type-seg button:hover { color: var(--text); }
    .type-seg button.on { color: var(--text); }
    .type-seg .n { min-width: 18px; padding: 0 6px; border-radius: 999px; font-size: 11px; line-height: 18px; text-align: center;
      background: color-mix(in srgb, var(--muted) 18%, transparent); color: var(--text-2); transition: background .2s ease, color .2s ease; }
    /* The picked tab's count is the theme colour on every tab (selection, not type) */
    .type-seg button.on .n { background: var(--accent); color: #fff; }
    .type-seg button:active { transform: scale(.97); }
    /* List swap when the tab changes */
    .type-swap-enter-active { transition: opacity .2s ease, transform .2s ease; }
    .type-swap-leave-active { transition: opacity .12s ease, transform .12s ease; }
    .type-swap-enter-from { opacity: 0; transform: translateY(6px); }
    .type-swap-leave-to { opacity: 0; transform: translateY(-4px); }
    @media (prefers-reduced-motion: reduce) { .type-thumb, .type-swap-enter-active, .type-swap-leave-active { transition: none; } }
    /* Customer: solid pill in the text colour (dark in light mode, light in dark mode). In-house: soft grey chip. */
    .type-badge { display: inline-flex; align-items: center; gap: 5px; padding: 2px 9px 2px 7px; border-radius: 999px; font-size: 11.5px; font-weight: 700; white-space: nowrap; border: 1px solid transparent; }
    .type-badge svg { width: 12px; height: 12px; flex: none; fill: none; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; }
    .type-badge.customer { color: var(--surface); background: var(--text); }
    .type-badge.inhouse { color: var(--text-2); background: var(--chip); border-color: var(--border); }
    .sub .type-badge { margin-right: 8px; vertical-align: 1px; }
    .unit-fold { display: grid; grid-template-rows: 0fr; opacity: 0; transition: grid-template-rows .25s cubic-bezier(.4, 0, .2, 1), opacity .18s ease; }
    .unit-fold.open { grid-template-rows: 1fr; opacity: 1; transition: grid-template-rows .25s cubic-bezier(.4, 0, .2, 1), opacity .22s ease .05s; }
    .unit-inner { min-height: 0; overflow: hidden; }
    .unit-fold .unit-inner { transform: translateY(-4px); transition: transform .25s cubic-bezier(.4, 0, .2, 1); }
    /* Once open, let the unit list drop down past the box (it would be cut off while the fold clips) */
    .unit-fold.open .unit-inner { transform: none; animation: unit-unclip 0s .25s forwards; }
    @keyframes unit-unclip { to { overflow: visible; } }
    @media (prefers-reduced-motion: reduce) { .unit-fold, .unit-fold.open, .unit-fold .unit-inner { transition: none; } }
    .type-pick { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    /* 19 Nov 2026: Date and Deadline side by side (stacked on a phone) */
    .date-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .date-pair > * { min-width: 0; }
    @media (max-width: 480px) { .date-pair { grid-template-columns: 1fr; } }
    .type-pick button { display: grid; gap: 2px; text-align: left; padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px;
      background: var(--surface); font: inherit; color: var(--text); cursor: pointer; }
    .type-pick button small { color: var(--muted); font-size: 12px; }
    .type-pick button.on { border-color: var(--accent); background: var(--accent-soft); }
    .type-pick button.on b { color: var(--accent); }
    .iss-tools { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-bottom: 16px; }
    .iss-tools .input.search { flex: 1 1 240px; max-width: 360px; height: 40px; }
    .team-chip { display: inline-flex; align-items: center; gap: 8px; height: 32px; padding: 0 10px 0 12px; border-radius: 999px; border: 1px solid var(--border);
      background: var(--accent-soft); color: var(--accent); font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; }
    .team-chip span { font-size: 15px; line-height: 1; }
    .iss-tools :deep(.op-btn) { height: 40px; }
    @media (max-width: 640px) { .type-seg { width: 100%; } .iss-tools .input.search { max-width: none; } }
    @media (max-width: 480px) { .type-pick { grid-template-columns: 1fr; } }
    .last-up span { display: block; }
    .last-up small { display: block; color: var(--muted); font-size: 12px; margin-top: 2px; max-width: 160px; overflow: hidden; text-overflow: ellipsis; }
    /* Status drop-down keeps one width whatever is picked, so the toolbar doesn't shift */
    .iss-tools .status-pick :deep(.op-btn) { min-width: 168px; }
    .t-title { font-weight: 500; min-width: 200px; }
    .table td.nw { white-space: nowrap; }
    .table td .tag { white-space: nowrap; }
    .tag-wrap { display: flex; flex-wrap: wrap; gap: 4px; max-width: 230px; }
    .tag-wrap .tag { margin: 0; }
    .tag-wrap .tag-more { background: var(--surface-2, #f1f1f4); color: var(--muted); cursor: default; }
    .table td .who { white-space: nowrap; }
    .kv .tag { color: var(--accent); }   /* the old page's <template> kept the first tag from matching .kv span:first-child */
    .post { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px 16px 14px; }
    .post.orig { border-color: var(--accent); }
    .post-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; font-size: 13px; }
    .post-head .when { color: var(--muted); font-size: 12px; }
    .who { display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .audit-list b + .tag { margin: 0 2px 0 6px; }
    .post p { margin: 0; font-size: 13px; white-space: pre-wrap; overflow-wrap: anywhere; }
    .files { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
    /* Drag and drop on the comment box (17 Nov 2026) */
    .composer { position: relative; }
    .composer.dropping { outline: 2px dashed var(--accent); outline-offset: -2px; background: var(--accent-soft); }
    .drop-hint { position: absolute; inset: 0; display: grid; place-items: center; font-weight: 600; color: var(--accent); pointer-events: none; z-index: 1; }
    /* Posted files as cards (17 Nov 2026) */
    .previews.posted { margin-top: 10px; }
    .previews.posted .pv { padding: 0; cursor: pointer; text-align: left; font: inherit; color: var(--text); }
    .previews.posted .pv:hover { border-color: var(--accent); }
    .previews.posted .pv-open { display: grid; place-items: center; height: 80px; background: var(--bg, #f4f5f7); }
    .previews.posted .pv-open img { width: 100%; height: 80px; object-fit: cover; display: block; }
    /* Comment previews (17 Nov 2026) */
    .previews { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
    .pv { position: relative; width: 120px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); overflow: hidden; display: flex; flex-direction: column; }
    .pv-open { border: 0; padding: 0; background: var(--bg, #f4f5f7); height: 80px; display: grid; place-items: center; cursor: pointer; }
    .pv-open img, .pv-open video { width: 100%; height: 80px; object-fit: cover; display: block; }
    .pv-ico { font-size: 26px; }
    .pv-busy { height: 106px; align-items: center; justify-content: center; gap: 6px; }
    .pv-name { font-size: 11px; padding: 4px 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .pv-x { position: absolute; top: 4px; right: 4px; width: 20px; height: 20px; border-radius: 50%; border: 0; background: rgba(0,0,0,.55); color: #fff; font-size: 13px; line-height: 20px; padding: 0; cursor: pointer; }
    .file-chip { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--border); border-radius: 6px; padding: 4px 8px; font-size: 12px; background: var(--surface); }
    .file-chip button { border: 0; background: none; color: var(--muted); padding: 0 0 0 2px; }
    .thread { display: grid; gap: 12px; }
    .composer textarea { height: 64px; }
    .composer-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 10px; }
    .composer-row .help { flex: 1; min-width: 160px; }
    .link-add { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
    .link-add .input { flex: 1 1 160px; min-width: 0; height: 34px; }
    a.file-chip { color: var(--accent); text-decoration: none; overflow-wrap: anywhere; }
    a.file-chip:hover { text-decoration: underline; }
    .audit-list { display: grid; gap: 10px; font-size: 12px; }
    .audit-modal .audit-list { gap: 0; font-size: 14px; line-height: 1.5; max-height: 55vh; overflow-y: auto; margin: 4px -4px 0; padding: 0 4px; }
    .audit-modal .audit-list > div { padding: 12px 0 12px 14px; border-left: 3px solid var(--accent-soft); margin-left: 4px; position: relative; }
    .audit-modal .audit-list > div + div { border-top: 1px solid var(--border); border-top-left-radius: 0; }
    .audit-modal .audit-list .when { font-size: 12px; font-weight: 600; margin-bottom: 4px; }
    .audit-modal .audit-list .tag { font-size: 12px; margin: 0 6px; }
    .audit-list .when { color: var(--muted); font-size: 11px; }
    .checks { display: flex; gap: 16px; flex-wrap: wrap; margin: 6px 0 4px; font-size: 13px; }
    .checks label { display: inline-flex; align-items: center; gap: 6px; }
    .checks input { width: 16px; height: 16px; accent-color: var(--accent); }
    /* Edit tags: the tagged roles sit in a box like an input, as theme-coloured chips */
    .modal .tag-pick { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; min-height: 44px; padding: 8px 10px; margin-bottom: 8px;
      border: 1px solid var(--border); border-radius: 10px; background: var(--surface); }
    .modal .tag-chip { display: inline-flex; align-items: center; gap: 6px; padding: 4px 6px 4px 12px; border-radius: 999px;
      background: var(--accent-soft); color: var(--accent); border: 1px solid color-mix(in srgb, var(--accent) 25%, transparent);
      font-size: 12.5px; font-weight: 600; line-height: 1.2; }
    .modal .tag-chip button { display: inline-grid; place-items: center; width: 18px; height: 18px; padding: 0; border: 0; border-radius: 50%;
      background: transparent; color: inherit; font-size: 14px; line-height: 1; cursor: pointer; transition: background .15s, color .15s; }
    .modal .tag-chip button:hover { background: var(--accent); color: #fff; }
    .modal .tag-chip.locked { padding-right: 12px; }
    .checks input:disabled { opacity: 1; cursor: not-allowed; }
    .checks label:has(input:disabled) { cursor: not-allowed; font-weight: 600; }
    .locked { background: var(--chip); border-radius: 10px; padding: 12px 14px; font-size: 12px; color: var(--text-2); }
    /* 18 Nov 2026: completed-ticket comment note, People list, long completion text */
    .done-note { font-size: 12px; color: var(--text-2); background: var(--chip); border-radius: 8px; padding: 6px 10px; margin-bottom: 8px; }
    .kv .ppl { display: flex; flex-wrap: wrap; gap: 6px 10px; justify-content: flex-end; }
    .kv .wrap { white-space: pre-wrap; overflow-wrap: anywhere; text-align: right; }
    .side-note { color: var(--muted); font-size: 11px; margin-top: 10px; }
    .modal .field { margin-bottom: 12px; }
    /* 24 Nov 2026: the three summary cards stay side by side on half screen; phones show them two per row (app.css) */
.kv .late { color: var(--danger, #c0392b); font-weight: 600; }
</style>