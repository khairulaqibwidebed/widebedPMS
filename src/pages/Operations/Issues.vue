<template>
  <main class="content">
    <div class="loading-bar" v-show="loading || busy"></div>
    <div class="notice ok" v-show="okMsg">{{ okMsg }}</div>
    <div class="notice error" v-show="error">{{ error }}</div>

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
                  <td><div class="tag-wrap"><template v-for="g in t.tags" :key="g"><span class="tag">{{ tagLabel(g) }}</span></template></div></td>
                  <td><span class="who"><Avatar :uid="t.raisedByUid" :name="t.raisedBy" :role="t.raisedRole" :size="20" />{{ t.raisedBy }}<span class="tag role-tint" :style="roleTint(t.raisedRole)" v-if="showRole(t.raisedBy, t.raisedRole)">{{ tagLabel(t.raisedRole) }}</span></span></td>
                  <td class="nw">{{ day(t.raisedAt) }}</td>
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
        <p class="help" style="margin-top:12px">Completed tickets are locked: no new comments or tag changes. They stay searchable under Completed.
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
            <div class="sub"><span class="type-badge" :class="typeOf(ticket)"><svg viewBox="0 0 24 24" aria-hidden="true" v-html="TYPE_ICON[typeOf(ticket)]"></svg>{{ TYPE_LABEL[typeOf(ticket)] }}</span>{{ (ticket.property || 'Office') + (ticket.unit ? ' · ' + ticket.unit : '') + ' · Raised by ' + ticket.raisedBy + (showRole(ticket.raisedBy, ticket.raisedRole) ? ` (${tagLabel(ticket.raisedRole)})` : '') + ' on ' + stamp(ticket.raisedAt) }}</div>
          </div>
        </div>

        <div class="side-grid">
          <div class="thread">
            <div class="post orig">
              <div class="post-head"><Avatar :uid="ticket.raisedByUid" :name="ticket.raisedBy" :role="ticket.raisedRole" :size="24" /><b>{{ ticket.raisedBy }}</b><span class="tag role-tint" :style="roleTint(ticket.raisedRole)" v-if="showRole(ticket.raisedBy, ticket.raisedRole)">{{ tagLabel(ticket.raisedRole) }}</span><span class="when">{{ stamp(ticket.raisedAt) }}</span><span class="tag">Original issue</span></div>
              <p>{{ ticket.body }}</p>
              <div class="files" v-show="ticket.links.length"><template v-for="l in ticket.links" :key="l.url"><a class="file-chip" :href="l.url" target="_blank" rel="noopener" @click.prevent="$refs.viewer.open({ name: l.name, url: l.url, kind: 'issues' })">{{ icon(l.name) + ' ' + l.name }}</a></template></div>
            </div>
            <template v-for="c in replies" :key="c.id">
              <div class="post">
                <div class="post-head"><Avatar :uid="c.byUid" :name="c.by" :role="c.byRole" :size="24" /><b>{{ c.by }}</b><span class="tag role-tint" :style="roleTint(c.byRole)" v-if="showRole(c.by, c.byRole)">{{ tagLabel(c.byRole) }}</span><span class="when">{{ stamp(c.at) }}</span></div>
                <p>{{ c.text }}</p>
                <div class="files" v-show="c.links.length"><template v-for="l in c.links" :key="l.url"><a class="file-chip" :href="l.url" target="_blank" rel="noopener" @click.prevent="$refs.viewer.open({ name: l.name, url: l.url, kind: 'issues' })">{{ icon(l.name) + ' ' + l.name }}</a></template></div>
              </div>
            </template>

            <div class="post composer" v-show="ticket.status !== 'done' && canComment()">
              <textarea class="input" placeholder="Write a comment..." v-model="draft.text" aria-label="Comment"></textarea>
              <div class="files" v-show="draft.links.length"><template v-for="(l, i) in draft.links" :key="l.url + i"><span class="file-chip"><span>{{ icon(l.name) + ' ' + l.name }}</span><button @click="draft.links.splice(i, 1)" aria-label="Remove">×</button></span></template></div>
              <div class="link-add" v-show="draft.adding">
                <input class="input" v-model="draft.linkName" placeholder="Name, e.g. Vendor quote" aria-label="Link name">
                <input class="input" v-model="draft.linkUrl" placeholder="Paste the Google Drive link" aria-label="Google Drive link" @keydown.enter.prevent="addLink(draft)">
                <button class="btn" type="button" @click="addLink(draft)">Add</button>
              </div>
              <div class="notice error" v-show="draft.error">{{ draft.error }}</div>
              <div class="composer-row">
                <UploadFile kind="issues" :record-id="ticket.id" :folder-label="ticket.title" @done="f => addUploaded(draft, f)" />
                <button class="btn" type="button" @click="draft.adding = !draft.adding">🔗 Add Drive link</button>
                <span class="help">Upload a photo, PDF or video, or paste a Drive link</span>
                <button class="btn btn-primary" @click="postComment()" :disabled="busy || (!draft.text.trim() && !draft.links.length)">Post comment</button>
              </div>
            </div>
            <div class="locked" v-show="ticket.status === 'done'">{{ 'Completed on ' + stamp(ticket.doneAt) + ' by ' + ticket.doneBy + '. This ticket is locked: no edits, tag changes, comments or links.' }}</div>
            <div class="locked" v-show="ticket.status !== 'done' && !canComment()">View only. Your role can read this ticket but not comment on it.</div>
          </div>

          <div class="stack" style="gap:16px">
            <div class="card">
              <div class="card-head"><h2>Details</h2></div>
              <div class="kv"><span>Status</span><span><span class="pill" :class="STATUS[ticket.status].cls" :title="statusHint(ticket)">{{ statusLabel(ticket) }}</span></span></div>
              <div class="kv"><span>Type</span><span><span class="type-badge" :class="typeOf(ticket)"><svg viewBox="0 0 24 24" aria-hidden="true" v-html="TYPE_ICON[typeOf(ticket)]"></svg>{{ TYPE_LABEL[typeOf(ticket)] }}</span></span></div>
              <div class="kv"><span>Property</span><span>{{ ticket.property || '—' }}</span></div>
              <div class="kv"><span>Unit</span><span>{{ ticket.unit || '—' }}</span></div>
              <div class="kv"><span>Raised by</span><span class="who">{{ ticket.raisedBy }}<span class="tag role-tint" :style="roleTint(ticket.raisedRole)" v-if="showRole(ticket.raisedBy, ticket.raisedRole)">{{ tagLabel(ticket.raisedRole) }}</span></span></div>
              <div class="kv"><span>Raised on</span><span>{{ day(ticket.raisedAt) }}</span></div>
              <div class="kv"><span>Tagged</span><span><template v-for="g in ticket.tags" :key="g"><span class="tag">{{ tagLabel(g) }}</span></template></span></div>
              <button class="btn" style="width:100%;margin-top:8px" v-show="ticket.status !== 'done' && canUpdate()" @click="openTags()">Edit Department Tags </button>
            <div class="acts acts-card" v-if="(ticket.status !== 'done' && canUpdate()) || canDelete">
              <button class="btn btn-primary" @click="menuOpen = !menuOpen" aria-haspopup="menu" :aria-expanded="String(menuOpen)">Actions
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></button>
              <div class="acts-back" v-if="menuOpen" @click="menuOpen = false"></div>
              <div class="acts-menu" v-if="menuOpen" role="menu">
                <button role="menuitem" v-show="ticket.status === 'open' && canUpdate()" @click="menuOpen = false; setProgress()" :disabled="busy">Mark in progress</button>
                <button role="menuitem" v-show="ticket.status !== 'done' && canUpdate()" @click="menuOpen = false; openEdit()" :disabled="busy">Edit title &amp; description</button>
                <button role="menuitem" v-show="ticket.status !== 'done' && canUpdate()" @click="menuOpen = false; switchType()" :disabled="busy">{{ typeOf(ticket) === 'customer' ? 'Change to In-house' : 'Change to Customer' }}</button>
                <button role="menuitem" v-show="ticket.status !== 'done' && canUpdate()" @click="menuOpen = false; confirmDone = true; doneError = ''">Mark completed</button>
                <button role="menuitem" class="danger" v-if="canDelete" @click="menuOpen = false; openDelete()">Delete ticket</button>
              </div>
            </div>
            <button class="btn" style="width:100%;margin-top:8px" @click="auditOpen = true">Audit log</button>
            </div>
            <!-- Quote & invoice: anyone on the ticket adds the quote; Finance/Director approve and add it to the unit's expenses (owner pays) -->
            <TicketQuote :key="ticket.id" :ticket="ticket" @view="f => $refs.viewer.open(f)" />
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
              <button type="button" role="radio" :aria-checked="String(raise.type === 'customer')" :class="{ on: raise.type === 'customer' }" @click="raise.type = 'customer'"><b>Customer</b><small>A guest or tenant's problem at a unit</small></button>
              <button type="button" role="radio" :aria-checked="String(raise.type === 'inhouse')" :class="{ on: raise.type === 'inhouse' }" @click="raise.type = 'inhouse'"><b>In-house</b><small>Office, staff or company matters</small></button>
            </div></div>
          <div class="field"><label class="req" for="rTitle">Title</label><input class="input" id="rTitle" ref="rTitle" v-model="raise.title" placeholder="e.g. Aircond leaking in master bedroom"></div>
          <!-- Customer tickets only: the property, and the ticket's card goes to that property's board in the task system
               (Maintenance). In-house tickets stay in the PMS and have no property. -->
          <div class="field" v-if="raise.type === 'customer'"><label class="req" for="rProp">Property</label>
            <select v-if="propertyChoices().length" class="input" id="rProp" v-model="raise.property" @change="raise.unit = ''">
              <option value="">Choose the property</option>
              <option v-for="p in propertyChoices()" :key="p" :value="p">{{ p }}</option>
            </select>
            <input v-else class="input" id="rProp" v-model="raise.property" maxlength="80" placeholder="Type the property name, as on its task system board">
            <div class="help">The ticket's card goes to this property's board in the task system (Maintenance).</div></div>
          <!-- In-house tickets have no unit (6 Nov 2026), so one isn't added by mistake -->
          <!-- Slides shut for In-house and open again for Customer; hidden fields can't be tabbed into -->
          <div class="unit-fold" :class="{ open: raise.type !== 'inhouse' }" :inert="raise.type === 'inhouse' || null">
            <div class="unit-inner"><div class="field"><label :class="{ req: raise.type === 'customer' }" for="rUnit">Unit</label>
              <ComboInput id="rUnit" v-model="raise.unit" :options="unitOptions()" placeholder="Choose the unit" /></div></div>
          </div>
          <div class="field"><label class="req" for="rBody">What happened</label><textarea class="input" id="rBody" style="height:96px" v-model="raise.body" placeholder="Describe the issue, when it started and what you have tried"></textarea></div>
          <div class="field" style="margin-bottom:8px"><label>Tag the roles who should handle it</label>
            <!-- Same chips + drop-down as Edit tags. Your own role is always tagged and has no × -->
            <div class="tag-pick">
              <template v-for="g in TAGS.filter(x => raise.tags.includes(x))" :key="g"><span class="tag-chip" :class="g === myRole && 'locked'" :title="g === myRole ? 'Your role is always tagged' : null">{{ tagLabel(g) }}<button type="button" v-if="g !== myRole" @click="raise.tags = raise.tags.filter(x => x !== g)" :aria-label="'Remove ' + g">×</button></span></template>
              <span class="help" v-show="!raise.tags.length">No roles tagged</span>
            </div>
            <OptionPicker class="add-role" v-show="raise.tags.length < TAGS.length" v-model="addPickR" :options="addOptionsR()" label="Add a role" @change="addTagR($event)" /></div>
          <div class="field" style="margin-bottom:6px"><label for="rLinkName">Add Drive link</label>
            <div class="link-add" style="margin-top:0">
              <input class="input" id="rLinkName" v-model="raise.linkName" placeholder="Name, e.g. Photo of the leak">
              <input class="input" v-model="raise.linkUrl" placeholder="Paste the Google Drive link" aria-label="Google Drive link" @keydown.enter.prevent="addLink(raise)">
              <button class="btn" type="button" @click="addLink(raise)">Add</button>
              <UploadFile kind="issues" :record-id="raise.rid" :folder-label="raise.title" @done="f => addUploaded(raise, f)" />
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
          <p class="help" v-show="typeOf(ticket) === 'customer' && !ticket.property" style="margin-top:0">This Customer ticket has no property yet, so it has no card in the task system. Choose its property.</p>
          <div class="notice error" v-show="edit.error">{{ edit.error }}</div>
          <div class="field"><label class="req" for="eTitle">Title</label><input class="input" id="eTitle" ref="eTitle" v-model="edit.title" maxlength="200"></div>
          <div class="field" v-if="typeOf(ticket) === 'customer'"><label class="req" for="eProp">Property</label>
            <select v-if="propertyChoices().length" class="input" id="eProp" v-model="edit.property">
              <option value="">Choose the property</option>
              <option v-for="p in propertyChoices(edit.property)" :key="p" :value="p">{{ p }}</option>
            </select>
            <input v-else class="input" id="eProp" v-model="edit.property" maxlength="80"></div>
          <div class="field"><label class="req" for="eBody">What happened</label><textarea class="input" id="eBody" style="height:120px" v-model="edit.body" maxlength="5000"></textarea></div>
          <div class="help">Saved in the audit log. The ticket's card in the task system changes too.</div>
          <div class="modal-foot"><button type="button" class="btn" @click="edit = null">Cancel</button><button class="btn btn-primary" :disabled="busy">Save</button></div>
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
    <div class="modal-back" v-show="confirmDone" @click.self="confirmDone = false">
      <div class="modal" role="dialog" aria-label="Mark completed" style="max-width:440px">
        <h2>Mark this ticket completed?</h2>
        <p class="help" style="font-size:13px">It will be locked and archived. Nobody can comment, add links or change tags after this.</p>
        <div class="notice error" v-show="doneError">{{ doneError }}</div>
        <div class="modal-foot"><button class="btn" @click="confirmDone = false">Cancel</button><button class="btn btn-primary" @click="complete()" :disabled="busy">Mark completed</button></div>
      </div>
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
import { notifyRole, notifyUser } from '@/services/notificationService.js';
import OptionPicker from '@/components/OptionPicker.vue';
import UploadFile from '@/components/UploadFile.vue';
import FileViewer from '@/components/FileViewer.vue';
import TicketQuote from '@/components/TicketQuote.vue';
import { NAV_ICONS } from '@/components/NavIcons.js';

import { liveMixin } from '@/lib/use-live.js';

import { syncIssue, maintenanceBoards } from '@/lib/tms.js';


const me = useSession();
const myRole = issueTagOf(me.role);          // the word saved on tickets: 'Finance' (shown as Accounting), 'Director'
const isDirector = me.role === 'director';
// Posts, Raised by and the ticket's audit trail show the person's name with their role as a badge.
const myLabel = me.name || (isDirector ? 'Director' : `${myRole} user`);
// Every role raises, comments on and works its own tickets. IT included (Khairul 21 Oct), though IT is view-only elsewhere.
const canWrite = !!me.role;

// Roles made on the Roles page can be tagged too (by name).
const tagsNow = () => ['Director', 'IT', 'Admin', 'HR', 'Finance', 'Operations', 'Procurement', 'Marketing', ...Object.values(CUSTOM_ROLES).filter(r => r.active).map(r => r.name)];
let TAGS = tagsNow();   // worked out again each time the page opens, so a role made a minute ago is there
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
const TYPE_LABEL = { customer: 'Customer', inhouse: 'In-house' };
// Told apart by style and icon, not colour, so they work with any theme (custom themes included) and for colour-blind users.
const TYPE_ICON = { customer: NAV_ICONS.user, inhouse: NAV_ICONS.building };
const TYPE_TABS = [{ key: '', label: 'All' }, { key: 'customer', label: 'Customer' }, { key: 'inhouse', label: 'In-house' }];
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
const toTicket = (id, d) => ({ id, ...d, tags: d.tags || [], links: d.links || [], audit: d.audit || [], raisedAt: isoOf(d.createdAt), updatedIso: isoOf(d.updatedAt), doneAt: isoOf(d.doneAt) });

export default {
  beforeCreate() { TAGS = tagsNow(); },
  mixins: [liveMixin],
  components: { FormField, Avatar, ComboInput, OptionPicker, UploadFile, FileViewer, TicketQuote },
  data() {
    return {
      TAGS, STATUS, FILTERS, TYPE_LABEL, TYPE_ICON, TYPE_TABS, typeTab: readTypeTab(), myRole, canRaise: canWrite, canDelete: isDirector, del: null,
      menuOpen: false, auditOpen: false, edit: null, boards: [], pmsProps: [], addPick: '', addPickR: '', tickets: [], ticket: null, replies: [], units: [], search: '',
      // The dashboard links here with ?tag= (one team's tickets) and ?filter= (e.g. active = open or in progress).
      filter: FILTERS.some(f => f.key === this.$route.query.filter) ? this.$route.query.filter : (this.$route.query.tag ? 'active' : 'all'),
      tagFilter: TAGS.includes(this.$route.query.tag) ? this.$route.query.tag : '', okMsg: '', error: '', doneError: '',
      loading: true, busy: false, raise: null, tagEdit: null, confirmDone: false, draft: this.newDraft()
    };
  },
  // ?id= opens a ticket. Opening one or going back changes the address, which remounts the page
  // (Back/Forward included); a message for the next screen travels in history.state.
  async mounted() {
    await this.route();
    this.loading = false;
  },
  methods: {
    tagLabel,   // saved tag word -> what is shown ("Finance" shows as Accounting)
    // Summary cards: set the list's filter (if any) and scroll to it.
    kpiGo(key, ref = 'list') { if (key) this.filter = key; this.$nextTick(() => this.$refs[ref]?.scrollIntoView({ behavior: 'smooth', block: 'start' })); },
    roleTint,
    newDraft() { return { text: '', links: [], adding: false, linkName: '', linkUrl: '', error: '' }; },
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
      const parts = isDirector ? { all: query(col, orderBy('createdAt', 'desc'), limit(LIST_LIMIT)) }
        : { tagged: query(col, where('tags', 'array-contains', myRole), limit(LIST_LIMIT)), mine: query(col, where('raisedByUid', '==', me.user.uid), limit(LIST_LIMIT)) };
      const got = {};
      return new Promise((resolve, reject) => {
        for (const [key, q] of Object.entries(parts)) {
          this.live(key, q, rows => {
            got[key] = rows;
            if (Object.keys(got).length < Object.keys(parts).length) return;
            const seen = new Map();
            for (const list of Object.values(got)) for (const r of list) seen.set(r.id, toTicket(r.id, r));
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
    canSee(t) { return isDirector || t.tags.includes(myRole) || this.raisedByMe(t); },
    // Units of the chosen property (all units until one is chosen)
    unitOptions() {
      const p = this.raise?.property;
      return this.units.filter(u => !p || sameName(u.propertyName, p)).map(u => ({ value: u.unitCode, hint: u.propertyName }));
    },
    visible() { return this.tickets.filter(t => t.status !== 'deleted' && this.canSee(t)); },
    canUpdate() { const t = this.ticket; return t && canWrite && t.status !== 'done' && (isDirector || t.tags.includes(myRole)); },
    canComment() { return canWrite; },
    // The status is always shown in PMS words (Open, In progress, Completed). Tickets tagged Operations or Procurement have a
    // card in the task system (TMS, Maintenance workspace); its column (e.g. DOING) is shown only when hovering the status.
    statusLabel(t) { return STATUS[t.status].label; },
    statusHint(t) { return t.tmsStatus?.name && t.tmsStatus.for === t.status ? `Task system column: ${t.tmsStatus.name}` : null; },
    count(s) { return this.visible().filter(t => t.status === s).length; },
    needReply() { return this.visible().filter(t => t.status === 'open' && (isDirector || t.tags.includes(myRole)) && (t.lastBy || t.raisedBy) !== myLabel).length; },
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
    addUploaded(target, files) {
      for (const f of files) if (target.links.length < 10 && !target.links.some(l => l.url === f.url)) target.links.push({ name: f.name.slice(0, 80), url: f.url });
    },
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
      if (unitCache && Date.now() - unitCache.at < 600000) { this.units = unitCache.units; this.pmsProps = unitCache.props || []; return; }
      // Operations, Finance and Directors can read units; other roles type the unit instead.
      try {
        const [ps, us] = await Promise.all([getDocs(collection(db, 'properties')), getDocs(collection(db, 'units'))]);
        const names = Object.fromEntries(ps.docs.map(d => [d.id, d.data().name]));
        this.pmsProps = ps.docs.map(d => ({ id: d.id, name: d.data().name || '' })).filter(p => p.name).sort((a, b) => a.name.localeCompare(b.name));
        this.units = us.docs.map(d => ({ id: d.id, ...d.data(), propertyName: names[d.data().propertyId] || '' }))
          .filter(u => u.active !== false && u.unitCode).sort((a, b) => a.unitCode.localeCompare(b.unitCode));
        unitCache = { at: Date.now(), units: this.units, props: this.pmsProps };
      } catch { this.units = []; }
    },

    // The Property list: the property boards of the task system's Maintenance workspace (so every ticket has a board to go
    // to), or the PMS properties when the task system can't be reached. `keep`: a value to keep in the list (Edit).
    propertyChoices(keep = '') {
      const names = this.boards.length ? this.boards.map(b => b.name) : this.pmsProps.map(p => p.name);
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
    openRaise() {
      this.raise = { rid: (globalThis.crypto?.randomUUID?.() || String(Date.now()) + Math.random().toString(36).slice(2)).replace(/-/g, '').slice(0, 20), type: this.typeTab, title: '', property: '', unit: '', body: '', tags: TAGS.includes(myRole) ? [myRole] : [], links: [], linkName: '', linkUrl: '', error: '' };
      this.$nextTick(() => this.$refs.rTitle?.focus());
      this.units4raise();
      this.loadBoards();
    },
    async saveRaise() {
      const r = this.raise;
      if (!TYPE_LABEL[r.type]) return r.error = 'Choose Customer or In-house.';
      if (!r.title.trim()) return r.error = 'Give the ticket a title.';
      if (r.type === 'customer' && !r.property.trim()) return r.error = 'Choose the property.';
      if (r.type === 'customer' && !r.unit.trim()) return r.error = 'Choose the unit for a customer ticket.';
      if (!r.body.trim()) return r.error = 'Describe what happened.';
      if (!r.tags.length && !TAGS.includes(myRole)) return r.error = 'Tag at least one role to handle it.';
      if (r.linkUrl.trim()) { this.addLink(r); if (r.error) return; }
      const code = r.type === 'inhouse' ? '' : r.unit.trim().toUpperCase(), unit = this.units.find(u => u.unitCode.toUpperCase() === code) || null;
      if (unit && !sameName(unit.propertyName, r.property)) return r.error = `${unit.unitCode} is in ${unit.propertyName}, not ${r.property.trim()}.`;
      // Customer: the chosen property; In-house: none (it stays in the PMS)
      const propertyName = r.type === 'customer' ? r.property.trim().slice(0, 80) : '';
      const propertyId = propertyName ? unit?.propertyId || this.propertyIdOf(propertyName) : null;
      const tags = TAGS.filter(g => r.tags.includes(g) || g === myRole);
      const h = this.entry(`raised the ${TYPE_LABEL[r.type]} ticket, tagged ${tags.map(tagLabel).join(', ')}` + (r.links.length ? ` · ${r.links.length} Drive link${r.links.length > 1 ? 's' : ''}` : ''));
      this.busy = true; r.error = '';
      try {
        // One transaction: the next IS number (counters/issues), the ticket and the audit entry.
        const id = await runTransaction(db, async tx => {
          const cRef = doc(db, 'counters', 'issues');
          const c = await tx.get(cRef);
          const n = c.exists() ? c.data().next || 1 : 1, id = 'IS-' + String(n).padStart(4, '0'), ref = doc(db, 'issues', id);
          // No read of the new ticket here: the rules can't check who may see a ticket that doesn't exist yet, so
          // that read is refused. Writing over an existing IS number is refused by the rules anyway.
          tx.set(cRef, { next: n + 1 });

          tx.set(ref, { type: r.type, title: r.title.trim(), body: r.body.trim(), unit: unit?.unitCode || code, unitId: unit?.id || null,
            property: propertyName, propertyId, tags, status: 'open',
            raisedBy: myLabel, raisedRole: myRole, raisedByUid: me.user.uid, links: r.links, linkCount: r.links.length, replyCount: 0, lastBy: myLabel,
            audit: [h], createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
          audit(tx, me, { action: 'issue.create', entity: `issues/${id}`, propertyId, changes: [{ field: 'tags', old: null, new: tags.join(', ') }] });
          return id;
        });
        this.raise = null; this.okMsg = `${id} raised and tagged ${tags.map(tagLabel).join(', ')}.`;
        this.notify({ id, tags, raisedRole: myRole, raisedByUid: me.user.uid },
          { title: `New issue ${id}`, message: `${myLabel} raised "${r.title.trim()}", tagged ${tags.map(tagLabel).join(', ')}.` });

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
      const t = this.ticket, d = this.draft; if (t.status === 'done' || !canWrite) return;
      if (d.linkUrl.trim()) { this.addLink(d); if (d.error) return; }
      const text = d.text.trim(), links = [...d.links];
      if (!text && !links.length) return;
      // Plain comments are already in the thread; only added Drive links go in the audit log
      const h = links.length ? this.entry(`added ${links.length} Drive link${links.length > 1 ? 's' : ''}`) : null;
      this.busy = true; d.error = '';
      try {
        const b = writeBatch(db), ref = doc(db, 'issues', t.id);
        b.set(doc(collection(db, 'issues', t.id, 'replies')), { by: myLabel, byRole: myRole, byUid: me.user.uid, at: nowIso(), text, links, createdAt: serverTimestamp() });
        b.update(ref, { replyCount: increment(1), linkCount: increment(links.length), lastBy: myLabel, ...(h ? { audit: arrayUnion(h) } : {}), updatedAt: serverTimestamp() });
        audit(b, me, { action: 'issue.comment', entity: `issues/${t.id}`, propertyId: t.propertyId || null, changes: links.length ? [{ field: 'links', old: null, new: links.length }] : [] });
        await b.commit();
        t.replyCount = (t.replyCount || 0) + 1; t.linkCount = (t.linkCount || 0) + links.length; t.lastBy = myLabel; if (h) t.audit.push(h);
        this.notify(t, { title: `New comment on ${t.id}`, message: `${myLabel} commented on "${t.title}".` });
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
      this.busy = true; this.error = '';
      try {
        await this.change({ type: to }, [`changed the type from ${TYPE_LABEL[from]} to ${TYPE_LABEL[to]}`], 'issue.type', [{ field: 'type', old: TYPE_LABEL[from], new: TYPE_LABEL[to] }]);
        t.type = to; this.okMsg = `${t.id} is now a ${TYPE_LABEL[to]} ticket.`
          + (to === 'inhouse' ? ' Its task system card is removed (In-house tickets stay in the PMS).'
            : t.property ? '' : ' Choose its property (Edit) so it goes to the task system.');
        this.toTms(t);   // Customer: its card is made; In-house: its card is removed
      } catch (e) { this.error = friendlyError(e, 'change the type'); }
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

    async complete() {
      const t = this.ticket
      this.busy = true
      this.doneError = ''

      try {
        await this.change(
          {
            status: 'done',
            doneAt: serverTimestamp(),
            doneBy: myLabel,
            doneByUid: me.user.uid,
          },
          ['marked the ticket completed'],
          'issue.complete',
          [{ field: 'status', old: t.status, new: 'done' }]
        )

        Object.assign(t, {
          status: 'done',
          doneAt: nowIso(),
          doneBy: myLabel,
        })

        this.confirmDone = false
        this.toTms(t)
        this.notify(t, { title: `${t.id} completed`, message: `${myLabel} marked "${t.title}" completed.` })
      } catch (e) {
        this.doneError = friendlyError(e, 'complete the ticket')
      }

      this.busy = false
    },

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
        if (!(isDirector || (t.tags || []).includes(myRole))) return;
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
      this.edit = { title: this.ticket.title, body: this.ticket.body || '', property: this.ticket.property || '', error: '' };
      this.$nextTick(() => this.$refs.eTitle?.focus());
      this.units4raise();
      this.loadBoards();
    },
    async saveEdit() {
      const e = this.edit, t = this.ticket, title = e.title.trim(), body = e.body.trim(), customer = typeOf(t) === 'customer';
      const property = customer ? e.property.trim().slice(0, 80) : (t.property || '');   // In-house: unchanged
      if (!title) return e.error = 'Give the ticket a title.';
      if (customer && !property) return e.error = 'Choose the property.';
      if (!body) return e.error = 'Describe what happened.';
      const lines = [], changes = [];
      if (title !== t.title) { lines.push(`changed the title (was "${t.title.slice(0, 80)}")`); changes.push({ field: 'title', old: t.title, new: title }); }
      if (body !== (t.body || '')) { lines.push('changed the description'); changes.push({ field: 'body', old: null, new: null }); }
      const fields = { title, body };
      if (property !== (t.property || '')) {
        Object.assign(fields, { property, propertyId: this.propertyIdOf(property) });
        lines.push(`changed the property (was ${t.property || 'none'})`); changes.push({ field: 'property', old: t.property || null, new: property });
      }
      if (!lines.length) return this.edit = null;
      this.busy = true; e.error = '';
      try {
        await this.change(fields, lines, 'issue.edit', changes);
        Object.assign(t, fields);
        this.edit = null; this.okMsg = `${t.id} saved.`;
        this.toTms(t);
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
    .acts-card { margin-top: 14px; }
    .acts-card > .btn { width: 100%; justify-content: center; }
    .acts-card .acts-menu { top: auto; bottom: calc(100% + 6px); left: 0; right: 0; width: auto; }
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
    .side-note { color: var(--muted); font-size: 11px; margin-top: 10px; }
    .modal .field { margin-bottom: 12px; }
    @media (max-width: 860px) { .kpis.k3 { grid-template-columns: minmax(0,1fr); } }
</style>