<template>
  <main class="content ag">
    <div class="loading-bar" v-show="loading || busy"></div>

    <div class="page-head">
      <div>
        <h1>Agent Database</h1>
        <div class="sub">Marketing › Agent Database · property agents, travel agents and MM2H partners who send us guests and owners</div>
      </div>
      <div class="head-tools">
        <RefreshButton @refresh="go()" />
        <button type="button" class="btn btn-primary" v-if="canEdit" @click="openForm(null)">+ Add agent</button>
      </div>
    </div>

    <section class="card">
      <div class="card-head"><h2>{{ `Agents · ${shown.length}` }}</h2></div>
      <p class="card-intro">Agents' contact and bank details are personal data (PDPA). The list shows only the last 4 digits of the bank account{{ canEdit ? '; open an agent to see the full number.' : '.' }}</p>
      <div class="toolbar tb-split">
        <div class="pills" role="group" aria-label="Filter by agency">
          <button type="button" class="pill-btn" v-for="t in filters" :key="t.id" :class="{ on: filter === t.id }" :aria-pressed="String(filter === t.id)" @click="filter = t.id">{{ `${t.label} · ${t.n}` }}</button>
        </div>
        <input class="input" type="search" v-model="search" placeholder="Search name, company, phone, email" aria-label="Search agents">
      </div>
      <Paged :items="shown" v-slot="{ pageRows }">
        <div class="table-wrap">
          <!-- 24 Nov 2026 (Khairul): fixed column widths, everything after Agent centred -->
          <table class="table ag-list">
            <colgroup><col style="width:22%"><col style="width:14%"><col style="width:13%"><col style="width:13%"><col style="width:11%"><col v-if="lines" style="width:12%"><col style="width:10%"><col style="width:5%"></colgroup>
            <thead><tr><th>Agent</th><th>Agency</th><th>Mobile</th><th>Email</th><th>Commission</th><th v-if="lines">Unpaid commission</th><th>Bank</th><th></th></tr></thead>
            <tbody>
              <tr class="clickable" v-for="a in pageRows" :key="a.id" @click="openView(a)">
                <td class="ag-cut"><div class="strong" :title="a.name">{{ a.name }}</div><div class="muted small" :title="a.company">{{ a.company || '—' }}</div></td>
                <td><span class="pill nowrap" :class="agencyColor(a)">{{ agencyLabel(a) }}</span></td>
                <td class="nowrap">{{ a.mobile || '—' }}</td>
                <td class="ag-cut"><div :title="a.email">{{ a.email || '—' }}</div></td>
                <td class="nowrap"><template v-if="a.commDaily != null || a.commMonthly != null || a.commYearly != null"><div>{{ `Daily ${pctText(a.commDaily)}` }}</div><div>{{ `Monthly ${pctText(a.commMonthly)}` }}</div><div>{{ `Yearly ${pctText(a.commYearly)}` }}</div></template><span class="muted" v-else>Not set</span></td>
                <!-- 24 Nov 2026 (Khairul): what is still owed to the agent, from their booking commission lines -->
                <td v-if="lines" class="nowrap"><template v-if="sumOf(a.id).nUnpaid"><div class="strong">{{ rm(sumOf(a.id).unpaid) }}</div><div class="muted small">{{ `${sumOf(a.id).nUnpaid} booking${sumOf(a.id).nUnpaid > 1 ? 's' : ''}` }}</div></template><span class="muted" v-else>—</span></td>
                <td class="nowrap">{{ a.bankName || '—' }}<div class="muted small" v-if="a.acctLast4">{{ `···${a.acctLast4}` }}</div></td>
                <td><button type="button" class="ag-eye" :title="`View ${a.name}`" :aria-label="`View ${a.name}`" @click.stop="openView(a)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5C7 5 2.7 8.1 1 12c1.7 3.9 6 7 11 7s9.3-3.1 11-7c-1.7-3.9-6-7-11-7zm0 11.5A4.5 4.5 0 1 1 12 7.5a4.5 4.5 0 0 1 0 9zm0-7.2a2.7 2.7 0 1 0 0 5.4 2.7 2.7 0 0 0 0-5.4z"/></svg></button></td>
              </tr>
              <SkeletonRows v-if="loading && !agents.length" table :cols="lines ? 8 : 7" />
              <tr v-show="!loading && !shown.length"><td :colspan="lines ? 8 : 7" class="muted">{{ agents.length ? 'No agents match this search.' : canEdit ? 'No agents yet. Use + Add agent.' : 'No agents yet.' }}</td></tr>
            </tbody>
          </table>
        </div>
      </Paged>
      <div class="card-foot"><span>{{ `Showing ${shown.length} of ${agents.length} agents` }}</span></div>
    </section>

    <!-- One agent: profile (view) or the add / edit form -->
    <div v-if="drawer">
      <div class="drawer-back" @click="closeDrawer()"></div>
      <aside class="drawer wide ag-fixed" role="dialog" :aria-label="drawer.mode === 'view' ? drawer.agent.name : 'Agent'" v-esc="closeDrawer">
        <div class="drawer-head">
          <h2>{{ drawer.mode === 'view' ? drawer.agent.name : drawer.agent ? `Edit ${drawer.agent.name}` : 'Add agent' }}</h2>
          <button type="button" class="icon-btn" @click="closeDrawer()" aria-label="Close">×</button>
        </div>

        <!-- Profile: 24 Nov 2026 (Khairul) in tabs: Contact (with the business card), Commissions (settings and bookings), Bank details -->
        <div class="drawer-body" v-if="drawer.mode === 'view'">
          <div class="ag-tags"><span class="pill" :class="agencyColor(drawer.agent)">{{ agencyLabel(drawer.agent) }}</span><span class="muted">{{ drawer.agent.company }}</span></div>
          <div class="tabs ag-tabs" role="tablist">
            <button type="button" v-for="t in VIEW_TABS" :key="t.key" role="tab" :aria-selected="String(drawer.tab === t.key)" :class="{ on: drawer.tab === t.key }" @click="drawer.tab = t.key">{{ t.label }}<span class="muted" v-if="t.key === 'comm' && drawer.sum.nUnpaid">{{ ` · ${drawer.sum.nUnpaid} unpaid` }}</span></button>
          </div>

          <!-- Contact: details left, business card right (stacked on a phone) -->
          <div class="ag-view ag-tab" v-show="drawer.tab === 'contact'">
          <div class="ag-view-info">
            <div class="form-sec">Contact</div>
            <div class="kv"><span>Mobile number</span><span><a :href="`tel:${drawer.agent.mobile}`">{{ drawer.agent.mobile }}</a></span></div>
            <div class="kv"><span>Email</span><span><a v-if="drawer.agent.email" :href="`mailto:${drawer.agent.email}`">{{ drawer.agent.email }}</a><template v-else>—</template></span></div>
            <div class="kv"><span>Company name</span><span>{{ drawer.agent.company || '—' }}</span></div>
            <div class="kv"><span>License number</span><span>{{ drawer.agent.licenseNo || '—' }}</span></div>
            <div class="kv"><span>Address</span><span class="pre">{{ drawer.agent.address || '—' }}</span></div>
            <div class="kv"><span>Remarks</span><span class="pre">{{ drawer.agent.remarks || '—' }}</span></div>

            <div class="form-sec ag-sec-row">Bank details
              <button type="button" class="link" v-if="drawer.bank && drawer.bank.accountNo" @click="drawer.showAcct = !drawer.showAcct">{{ drawer.showAcct ? 'Hide number' : 'Show number' }}</button>
            </div>
            <div class="kv"><span>Bank</span><span>{{ drawer.agent.bankName || '—' }}</span></div>
            <template v-if="canEdit">
              <div class="kv"><span>Account holder</span><span>{{ drawer.bankLoading ? 'Loading…' : drawer.bank?.holder || '—' }}</span></div>
              <div class="kv"><span>Account number</span><span class="mono">{{ drawer.bankLoading ? 'Loading…' : acctText }}</span></div>
              <p class="help" v-if="drawer.bankError">{{ drawer.bankError }}</p>
            </template>
            <div class="kv" v-else><span>Account number</span><span class="mono">{{ drawer.agent.acctLast4 ? `···· ${drawer.agent.acctLast4}` : '—' }}</span></div>
            <p class="help ag-meta">{{ metaText }}</p>
          </div>

          <div class="ag-view-card">
            <div class="form-sec">Business card</div>
            <div class="ag-card-stack" v-if="drawer.agent.cardFront || drawer.agent.cardBack">
              <template v-for="side in SIDES" :key="side.key">
                <button type="button" class="ag-card" v-if="drawer.agent[side.key]" @click="viewCard(drawer.agent[side.key])" :aria-label="`Open ${side.label.toLowerCase()} of the business card`">
                  <img v-if="drawer.previews[side.key]" :src="drawer.previews[side.key]" :alt="`${side.label} of ${drawer.agent.name}'s business card`">
                  <span class="ag-card-ph" v-else>{{ drawer.previewError[side.key] ? 'Click to open' : isPdf(drawer.agent[side.key]) ? 'PDF · click to open' : 'Loading…' }}</span>
                  <span class="ag-card-label">{{ side.label }}</span>
                </button>
              </template>
              <p class="help">Click a card to see it full size.</p>
            </div>
            <div class="ag-card-none" v-else>No business card attached.</div>
          </div>
          </div>

          <!-- Commissions: the agent's % (settings) and one line per booking -->
          <div class="ag-tab" v-show="drawer.tab === 'comm'">
            <div class="form-sec">Booking commissions</div>
            <p class="help" v-if="drawer.linesLoading">Loading…</p>
            <p class="help" v-else-if="drawer.linesError">{{ drawer.linesError }}</p>
            <template v-else>
            <div class="ag-rates">
              <div class="ag-rate"><span>Unpaid</span><b>{{ rm(drawer.sum.unpaid) }}</b><span class="muted small">{{ `${drawer.sum.nUnpaid} booking${drawer.sum.nUnpaid === 1 ? '' : 's'}` }}</span></div>
              <div class="ag-rate"><span>Paid</span><b>{{ rm(drawer.sum.paid) }}</b><span class="muted small">{{ `${drawer.sum.nPaid} booking${drawer.sum.nPaid === 1 ? '' : 's'}` }}</span></div>
            </div>
            <div class="pills ag-cfilter" role="group" aria-label="Filter commissions">
              <button type="button" class="pill-btn" v-for="t in lineFilters" :key="t.id" :class="{ on: drawer.cFilter === t.id }" :aria-pressed="String(drawer.cFilter === t.id)" @click="drawer.cFilter = t.id">{{ `${t.label} · ${t.n}` }}</button>
            </div>
            <p class="help" v-if="!shownLines.length">{{ drawer.lines.length ? 'No commissions with this status.' : 'No bookings with this agent yet. A line is added when a booking is saved with booking source Agent and this agent picked.' }}</p>
            <div class="table-wrap" v-else>
              <!-- 24 Nov 2026 (Khairul): fixed column widths, so nothing shifts between agents or filters -->
              <table class="table ag-hist-table ag-comm-table">
                <colgroup><col style="width:22%"><col style="width:21%"><col style="width:14%"><col style="width:8%"><col style="width:14%"><col style="width:10%"><col style="width:11%"></colgroup>
                <thead><tr><th>Booking</th><th>Stay</th><th class="ag-mid">Taken from</th><th class="ag-mid">%</th><th class="ag-mid">Commission<FormulaInfo :steps="RULE_STEPS" heading="Commission: how it is worked out" note="The % and the amount are kept on each line, so changing the agent's % later never changes them." /></th><th class="ag-st">Status</th><th></th></tr></thead>
                <tbody>
                  <tr v-for="l in shownLines" :key="l.id">
                    <td class="ag-cut"><div class="strong">{{ l.bookingNo || l.bookingId }}</div><div class="muted small" :title="[l.unitCode, l.propertyName].filter(Boolean).join(' · ')">{{ [l.unitCode, l.propertyName].filter(Boolean).join(' · ') }}</div></td>
                    <td class="nowrap">{{ `${dateText(l.arrival)} to ${dateText(l.departure)}` }}<div class="muted small">{{ typeLabel(l.rentType) }}</div></td>
                    <td class="ag-mid nowrap">{{ rm(l.base) }}<div class="muted small">{{ l.rentType === 'Daily' ? 'total rental' : '1 month\'s rent' }}</div></td>
                    <td class="ag-mid">{{ l.rate == null ? 'Not set' : `${l.rate}%` }}</td>
                    <td class="ag-mid nowrap"><b>{{ rm(l.amount) }}</b></td>
                    <td class="ag-st">
                      <span class="pill" :class="STATUS_PILL[l.status]">{{ STATUS_LABEL[l.status] || l.status }}</span>
                      <div class="muted small" v-if="l.status === 'paid' && l.paid">{{ `${dateText(l.paid.date)} · ${rm(l.paid.amount)} · ${l.paid.bankRef}` }}</div>
                      <div class="muted small" v-if="l.status === 'cancelled' && l.cancelReason">{{ l.cancelReason }}</div>
                      <div class="ag-warn small" v-if="l.status === 'paid' && l.bookingChanged">{{ `Booking changed after payment${l.bookingChangeNote ? ': ' + l.bookingChangeNote : ''}` }}</div>
                      <div class="muted small" v-if="l.status === 'unpaid' && l.lastUndo">{{ `Payment undone: ${l.lastUndo.reason}` }}</div>
                    </td>
                    <td class="num nowrap">
                      <button type="button" class="btn btn-sm" v-if="canPay && l.status === 'unpaid'" @click="startPay(l)">Mark paid</button>
                      <button type="button" class="link" v-if="l.status === 'paid' && l.paid?.slip" @click="viewSlip(l.paid.slip)">Pay slip</button>
                      <template v-if="isDirector && l.status === 'paid'"> · <button type="button" class="link" @click="startUndo(l)">Undo</button></template>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            </template>

            <div class="form-sec ag-sec-row">Commission settings
              <button type="button" class="link" @click="drawer.histOpen = true">View commission history<span class="muted" v-if="!drawer.histLoading && drawer.history.length">{{ ` · ${drawer.history.length}` }}</span></button>
            </div>
            <div class="ag-rates">
              <div class="ag-rate"><span>Daily rental</span><b>{{ pctText(drawer.agent.commDaily) }}</b></div>
              <div class="ag-rate"><span>Monthly rental</span><b>{{ pctText(drawer.agent.commMonthly) }}</b></div>
              <div class="ag-rate"><span>Yearly rental</span><b>{{ pctText(drawer.agent.commYearly) }}</b></div>
            </div>
          </div>

        </div>
        <div class="drawer-foot" v-if="drawer.mode === 'view'">
          <button type="button" class="btn btn-danger" v-if="isDirector" @click="remove(drawer.agent)" :disabled="busy">Delete</button>
          <span class="grow"></span>
          <button type="button" class="btn" @click="closeDrawer()">Close</button>
          <button type="button" class="btn btn-primary" v-if="canEdit" @click="openForm(drawer.agent)">Edit</button>
        </div>

        <!-- Add / edit -->
        <form class="drawer-body" v-if="drawer.mode === 'edit'" id="agentForm" @submit.prevent="save()" novalidate>
          <div class="notice error" v-show="f.error">{{ f.error }}</div>
          <!-- 24 Nov 2026 (Khairul): the form in the same tabs as the profile -->
          <div class="tabs ag-tabs" role="tablist">
            <button type="button" v-for="t in VIEW_TABS" :key="t.key" role="tab" :aria-selected="String(f.tab === t.key)" :class="{ on: f.tab === t.key }" @click="f.tab = t.key">{{ t.label }}</button>
          </div>
          <div class="ag-tab" v-show="f.tab === 'contact'">
            <div class="form-sec">Agent details</div>
            <div class="grid-fields">
              <div class="field"><label for="agName" class="req">Name</label><input class="input" id="agName" v-model="f.name" placeholder="Full name" maxlength="120"></div>
              <div class="field"><label for="agCompany">Company name</label><input class="input" id="agCompany" v-model="f.company" placeholder="e.g. Bayu Properties Sdn Bhd" maxlength="120"></div>
            </div>
            <fieldset class="field ag-fs">
              <legend class="req">Agency</legend>
              <div class="ag-agency">
                <label v-for="t in AGENCIES" :key="t.id" :class="{ on: f.agency === t.id }"><input type="radio" name="agency" :value="t.id" v-model="f.agency">{{ t.label }}</label>
              </div>
            </fieldset>
            <div class="field" v-if="f.agency === 'other'"><label for="agOther" class="req">Please specify</label><input class="input" id="agOther" v-model="f.agencyOther" placeholder="e.g. Relocation company, Corporate HR" maxlength="60"></div>
            <div class="grid-fields">
              <div class="field"><label for="agMobile" class="req">Mobile number</label><input class="input" id="agMobile" type="tel" v-model="f.mobile" placeholder="e.g. 012-345 6789" maxlength="30"></div>
              <div class="field"><label for="agEmail">Email</label><input class="input" id="agEmail" type="email" v-model="f.email" placeholder="name@company.com" maxlength="120"></div>
            </div>
            <!-- 20 Nov 2026 (Khairul): the agent's license number (e.g. REN 37139) -->
          <div class="grid-fields">
              <div class="field"><label for="agLicense">License number</label><input class="input" id="agLicense" v-model="f.licenseNo" placeholder="e.g. REN 37139" maxlength="60"></div>
              <div class="field" v-if="branchList.length"><label :class="{ req: isBD }">Branches</label>
                <OptionPicker class="fld-pick" v-model="f.branchIds" multiple :options="branchList.map(b => ({ value: b.id, label: b.name }))" label="Branches" placeholder="Choose branches…" />
              </div>
          </div>
            <div class="field"><label for="agAddress">Address</label><textarea class="input" id="agAddress" v-model="f.address" rows="3" placeholder="Street, city, postcode, state" maxlength="500"></textarea></div>
            <!-- 20 Nov 2026 (Khairul): free-text remarks about the agent -->
            <!-- 24 Nov 2026 (Khairul): the agent's branches. Branch Directors see only agents in their branches. -->
            <div class="field"><label for="agRemarks">Remarks</label><textarea class="input" id="agRemarks" v-model="f.remarks" rows="3" placeholder="e.g. Prefers WhatsApp, covers Mont Kiara and Bangsar" maxlength="1000"></textarea></div>

            <div class="form-sec">Bank details <span class="help ag-sec-note">· kept private: the list shows only the last 4 digits</span></div>
            <p class="help" v-if="f.bankLoading">Loading the saved bank details…</p>
            <div class="ag-bank">
              <div class="field"><label for="agBank">Bank</label>
                <input class="input" id="agBank" v-model="f.bankName" placeholder="e.g. Maybank" maxlength="60"></div>
              <div class="field"><label for="agHolder">Bank account holder</label><input class="input" id="agHolder" v-model="f.holder" placeholder="e.g. Ahmad bin Ali" maxlength="120" :disabled="f.bankLoading"></div>
              <div class="field"><label for="agAcct">Bank account number</label><input class="input mono" id="agAcct" v-model="f.accountNo" inputmode="numeric" placeholder="e.g. 512345678901" maxlength="24" :disabled="f.bankLoading"></div>
            </div>
            <div class="form-sec">Business card</div>
            <div class="ag-cards">
              <div class="ag-up" v-for="side in SIDES" :key="side.key">
                <template v-if="f[side.key]">
                  <div class="file-line"><span class="ag-file">{{ f[side.key].name }}</span>
                    <span><button type="button" class="link" @click="viewCard(f[side.key])">View</button> · <button type="button" class="link" @click="f[side.key] = null">Remove</button></span></div>
                  <span class="help">{{ side.label }}</span>
                </template>
                <label class="filedrop" v-else :class="{ off: f.uploading[side.key] }">
                  <b>{{ f.uploading[side.key] ? `Uploading ${f.pct[side.key]}%` : side.label + (side.optional ? ' (optional)' : '') }}</b>
                  Image or PDF, click to upload · saved to Google Drive
                  <input type="file" hidden accept="image/*,application/pdf" :disabled="f.uploading[side.key]" @change="upload(side.key, $event)">
                </label>
              </div>
            </div>
          </div>
          <div class="ag-tab" v-show="f.tab === 'comm'">
            <div class="form-sec">Commission <span class="help ag-sec-note">· % the agent earns; leave empty if not agreed</span></div>
            <div class="ag-bank">
              <div class="field"><label for="agDaily">Daily rental (%)</label><input class="input" id="agDaily" type="number" inputmode="decimal" min="0" max="100" step="0.01" v-model="f.commDaily" placeholder="e.g. 10"></div>
              <div class="field"><label for="agMonthly">Monthly rental (%)</label><input class="input" id="agMonthly" type="number" inputmode="decimal" min="0" max="100" step="0.01" v-model="f.commMonthly" placeholder="e.g. 5"></div>
              <!-- 24 Nov 2026 (Khairul): Yearly rental % too -->
              <div class="field"><label for="agYearly">Yearly rental (%)</label><input class="input" id="agYearly" type="number" inputmode="decimal" min="0" max="100" step="0.01" v-model="f.commYearly" placeholder="e.g. 5"></div>
            </div>
            <div class="ag-bank" v-if="commChanged">
              <div class="field"><label for="agFrom" class="req">Effective from</label><input class="input" id="agFrom" type="date" v-model="f.commFrom"></div>
              <div class="field ag-span2" v-if="drawer.agent"><label for="agNote">Reason for change</label><input class="input" id="agNote" v-model="f.commNote" placeholder="e.g. New agreement signed" maxlength="200"></div>
            </div>
            <p class="help" v-if="commChanged">This change is added to the commission history when you save. Bookings already made keep the % they were made with.</p>
          </div>
        </form>
        <div class="drawer-foot" v-if="drawer.mode === 'edit'">
          <button type="button" class="btn" @click="drawer.agent ? openView(drawer.agent) : closeDrawer()">Cancel</button>
          <button type="submit" form="agentForm" class="btn btn-primary" :disabled="busy || f.bankLoading || anyUploading">{{ busy ? 'Saving…' : drawer.agent ? 'Save changes' : 'Save agent' }}</button>
        </div>
      </aside>

      <!-- Commission history popup, on top of the agent profile -->
      <div class="ag-pop-back" v-if="drawer.mode === 'view' && drawer.histOpen" @click.self="drawer.histOpen = false">
        <div class="ag-pop" role="dialog" aria-modal="true" :aria-label="`Commission history of ${drawer.agent.name}`">
          <div class="ag-pop-head">
            <div>
              <h3>Commission history</h3>
              <div class="muted small">{{ `${drawer.agent.name} · now Daily ${pctText(drawer.agent.commDaily)}, Monthly ${pctText(drawer.agent.commMonthly)}, Yearly ${pctText(drawer.agent.commYearly)}` }}</div>
            </div>
            <button type="button" class="icon-btn" @click="drawer.histOpen = false" aria-label="Close">×</button>
          </div>
          <div class="ag-pop-body">
            <p class="help" v-if="drawer.histLoading">Loading…</p>
            <p class="help" v-else-if="drawer.histError">{{ drawer.histError }}</p>
            <p class="help" v-else-if="!drawer.history.length">No commission set yet.</p>
            <div class="table-wrap" v-else>
              <table class="table ag-hist-table">
                <thead><tr><th>Effective from</th><th class="num">Daily</th><th class="num">Monthly</th><th class="num">Yearly</th><th>Changed by</th></tr></thead>
                <tbody>
                  <tr v-for="h in drawer.history" :key="h.id">
                    <td class="nowrap">{{ dateText(h.effectiveFrom) }}<div class="muted small" v-if="h.note">{{ h.note }}</div></td>
                    <td class="num">{{ pctText(h.daily) }}<div class="muted small" v-if="h.rev > 1 && h.daily !== h.prevDaily">{{ `was ${pctText(h.prevDaily)}` }}</div></td>
                    <td class="num">{{ pctText(h.monthly) }}<div class="muted small" v-if="h.rev > 1 && h.monthly !== h.prevMonthly">{{ `was ${pctText(h.prevMonthly)}` }}</div></td>
                    <td class="num">{{ pctText(h.yearly) }}<div class="muted small" v-if="h.rev > 1 && (h.yearly ?? null) !== (h.prevYearly ?? null)">{{ `was ${pctText(h.prevYearly)}` }}</div></td>
                    <td>{{ h.byName || '—' }}<div class="muted small">{{ stampText(h.at) }}</div></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div class="ag-pop-foot">
            <button type="button" class="btn" @click="drawer.histOpen = false">Close</button>
          </div>
        </div>
      </div>


      <!-- 24 Nov 2026 (Khairul): Mark paid / Undo payment in its own popup, on top of the agent profile -->
      <div class="ag-pop-back" v-if="drawer.mode === 'view' && pay.line" @click.self="closePay()">
        <div class="ag-pop" role="dialog" aria-modal="true" :aria-label="pay.mode === 'paid' ? 'Mark commission paid' : 'Undo payment'">
          <div class="ag-pop-head">
            <div>
              <h3>{{ pay.mode === 'paid' ? 'Mark commission paid' : 'Undo payment' }}</h3>
              <div class="muted small">{{ `${pay.line.bookingNo || pay.line.bookingId} · ${[pay.line.unitCode, pay.line.propertyName].filter(Boolean).join(' · ')} · commission ${rm(pay.line.amount)}` }}</div>
            </div>
            <button type="button" class="icon-btn" @click="closePay()" aria-label="Close">×</button>
          </div>
          <!-- Mark paid / undo, for one line -->
          <form class="ag-pop-body" id="payForm" @submit.prevent="pay.mode === 'paid' ? savePaid() : saveUndo()" novalidate>
            <div class="notice error" v-show="pay.error">{{ pay.error }}</div>
            <template v-if="pay.mode === 'paid'">
              <div class="ag-bank">
                <div class="field"><label for="cpDate" class="req">Date paid</label><input class="input" id="cpDate" type="date" v-model="pay.date"></div>
                <div class="field"><label for="cpAmt" class="req">Amount paid (RM)</label><input class="input" id="cpAmt" type="number" min="0" step="0.01" v-model="pay.amount"></div>
                <div class="field"><label for="cpRef" class="req">Bank reference</label><input class="input" id="cpRef" v-model="pay.bankRef" maxlength="100" placeholder="e.g. IBG 123456"></div>
              </div>
              <div class="field"><label class="req">Pay slip</label>
                <div class="file-line" v-if="pay.slip"><span class="ag-file">{{ pay.slip.name }}</span><span><button type="button" class="link" @click="viewSlip(pay.slip)">View</button> · <button type="button" class="link" @click="pay.slip = null">Remove</button></span></div>
                <label class="filedrop" v-else :class="{ off: pay.uploading }"><b>{{ pay.uploading ? `Uploading ${pay.pct}%` : 'Upload pay slip' }}</b>Image or PDF · saved to Google Drive<input type="file" hidden accept="image/*,application/pdf" :disabled="pay.uploading" @change="uploadSlip($event)"></label>
              </div>
              <div class="field"><label for="cpNote">Note</label><input class="input" id="cpNote" v-model="pay.note" maxlength="300" placeholder="Optional"></div>
            </template>
            <div class="field" v-else><label for="cpWhy" class="req">Why undo this payment?</label><input class="input" id="cpWhy" v-model="pay.reason" maxlength="300" placeholder="e.g. Paid to the wrong account"></div>
          </form>
          <div class="ag-pop-foot ag-pay-foot">
            <button type="button" class="btn" @click="closePay()">Cancel</button>
            <button type="submit" form="payForm" class="btn" :class="pay.mode === 'paid' ? 'btn-primary' : 'btn-danger'" :disabled="busy || pay.uploading">{{ busy ? 'Saving…' : pay.mode === 'paid' ? 'Save as paid' : 'Undo payment' }}</button>
          </div>
        </div>
      </div>
    </div>

    <FileViewer ref="viewer" />
  </main>
</template>

<script>
// Marketing > Agent Database (/Marketing/agents), 20 Nov 2026 (Khairul). Agent Database Base: the list and profiles.
// Full: add and edit, and see the bank account holder and number. Directors also delete. Firestore rules Draft 0.94.
// Business cards go to Google Drive > Agent Business Cards (api/drive.js kind 'agents'); only their file ids are saved.
import { useSession } from '@/stores/session.js';
import { can } from '@/lib/access.js';
import { friendlyError } from '@/lib/finance-data.js';
import { askConfirm } from '@/lib/confirm.js';
import { toast } from '@/lib/toast.js';
import { ensureFolders, uploadForLink, fileBlob } from '@/lib/drive.js';
import RefreshButton from '@/components/RefreshButton.vue';
import FileViewer from '@/components/FileViewer.vue';
import { loadBranches } from '@/lib/branches.js';
import { AGENCIES, BANKS, agencyLabel, agencyColor, loadAgents, loadBank, loadCommissionHistory, pct, pctText, saveAgent, deleteAgent, newAgentId } from './agents.js';
import FormulaInfo from '@/components/FormulaInfo.vue';
import OptionPicker from '@/components/OptionPicker.vue';
import { loadAllLines, loadAgentLines, totals, stepsOf, markPaid, undoPaid, canPayCommission, STATUS_LABEL, COMM_TYPES, todayYmd } from '@/lib/agent-commission.js';

// 24 Nov 2026: the general rule, on the (i) of the booking commissions popup
const RULE_STEPS = [
  'One line per booking made with this agent (booking source Agent).',
  'The % follows the booking\'s Type of rent: Daily, Monthly or Yearly rental. It is the % that applies on the day the booking is made.',
  'Daily rental: % of the total rental of the stay. Monthly and Yearly rental: % of one month\'s rent. Deposit and other fees are not counted.',
  'Booking edited before payment: worked out again with the same %. Booking cancelled or deleted: the line is Cancelled.',
  'Accounting or a Director marks it Paid with the date, amount, bank reference and pay slip.'
];
// 24 Nov 2026 (Khairul): the agent profile in tabs
const VIEW_TABS = [{ key: 'contact', label: 'Profile' }, { key: 'comm', label: 'Commissions' }];   // bank details moved into Profile (Khairul)
const STATUS_PILL = { unpaid: 'amber', paid: 'green', cancelled: 'grey' };
const rm = n => `RM ${(Number(n) || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const me = useSession();
const SIDES = [{ key: 'cardFront', label: 'Front of card' }, { key: 'cardBack', label: 'Back of card', optional: true }];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const numOrEmpty = v => (v === null || v === undefined ? '' : v);
function blankForm() {
  return { id: '', name: '', company: '', agency: 'property', agencyOther: '', mobile: '', email: '', licenseNo: '', address: '', remarks: '', bankName: '', holder: '', accountNo: '',
    commDaily: '', commMonthly: '', commYearly: '', commFrom: today(), commNote: '', commStart: [null, null, null],
    cardFront: null, cardBack: null, active: true, branchIds: [], tab: 'contact', error: '', bankLoading: false, uploading: { cardFront: false, cardBack: false }, pct: { cardFront: 0, cardBack: 0 } };
}

export default {
  components: { RefreshButton, FileViewer, FormulaInfo, OptionPicker },
  data() {
    return { VIEW_TABS, RULE_STEPS, STATUS_PILL, STATUS_LABEL, lines: null, pay: { line: null }, AGENCIES, BANKS, SIDES, branchList: [], isBD: me.role === 'branchDirector', agents: [], loading: true, busy: false, error: '', okMsg: '', filter: 'all', search: '', drawer: null, f: blankForm() };
  },
  computed: {
    canEdit() { return can(me, 'agents.edit'); },
    canPay() { return canPayCommission(me); },
    // 24 Nov 2026: commission lines by agent (list column); null when they can't be read
    linesBy() { const m = {}; (this.lines || []).forEach(l => { (m[l.agentId] ||= []).push(l); }); return m; },
    lineFilters() {
      const ls = this.drawer?.lines || [];
      return [{ id: 'all', label: 'All', n: ls.length }, ...['unpaid', 'paid', 'cancelled'].map(s => ({ id: s, label: STATUS_LABEL[s], n: ls.filter(l => l.status === s).length }))];
    },
    shownLines() { const d = this.drawer; return d ? d.lines.filter(l => d.cFilter === 'all' || l.status === d.cFilter) : []; },
    isDirector() { return ['director', 'branchDirector'].includes(me.role); },
    filters() {
      return [{ id: 'all', label: 'All', n: this.agents.length }, ...AGENCIES.map(t => ({ id: t.id, label: t.label, n: this.agents.filter(a => a.agency === t.id).length }))];
    },
    shown() {
      const q = this.search.trim().toLowerCase();
      return this.agents.filter(a => (this.filter === 'all' || a.agency === this.filter)
        && (!q || [a.name, a.company, a.mobile, a.email, a.licenseNo, a.agencyOther].some(v => (v || '').toLowerCase().includes(q))
          || (a.mobile || '').replace(/\D/g, '').includes(q.replace(/\D/g, '') || '¬')));
    },
    // The rates differ from what was saved (or are set on a new agent)
    commChanged() { return pct(this.f.commDaily) !== this.f.commStart[0] || pct(this.f.commMonthly) !== this.f.commStart[1] || pct(this.f.commYearly) !== this.f.commStart[2]; },
    anyUploading() { return this.f.uploading.cardFront || this.f.uploading.cardBack; },
    acctText() {
      const n = this.drawer?.bank?.accountNo || '';
      if (!n) return '—';
      return this.drawer.showAcct ? n.replace(/(\d{4})(?=\d)/g, '$1 ') : `···· ${n.slice(-4)}`;
    },
    metaText() {
      const a = this.drawer?.agent; if (!a) return '';
      const d = t => (t?.toDate ? t.toDate().toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
      const added = `Added${a.createdByName ? ' by ' + a.createdByName : ''}${d(a.createdAt) ? ', ' + d(a.createdAt) : ''}`;
      const edited = a.updatedAt && d(a.updatedAt) !== d(a.createdAt) ? ` · Last edited${a.updatedByName ? ' by ' + a.updatedByName : ''}, ${d(a.updatedAt)}` : '';
      return added + edited;
    }
  },
  async mounted() {
    if (this.canEdit) ensureFolders();
    // Branches to pick on the form (24 Nov 2026). A Branch Director: only their own.
    loadBranches().then(all => { this.branchList = all.filter(b => b.active && (!this.isBD || (me.branches || []).includes(b.id))); }).catch(() => {});
    await this.go();
  },
  unmounted() { this.dropPreviews(); },
  methods: {
    agencyLabel, agencyColor, pctText, rm, stepsOf,
    typeLabel(v) { return (COMM_TYPES.find(t => t.value === v) || {}).label || v || '—'; },
    sumOf(agentId) { return totals(this.linesBy[agentId] || []); },
    dateText(ymd) {
      if (!ymd) return '—';
      const [y, m, d] = ymd.split('-').map(Number);
      return new Date(y, m - 1, d).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' });
    },
    stampText(t) { return t?.toDate ? t.toDate().toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' }) : ''; },
    async go() {
      this.loading = true; this.error = '';
      try {
        const all = await loadAgents();
        // Branch Directors (24 Nov 2026): only agents in one of their branches (agents with no branch: Directors only)
        this.agents = this.isBD ? all.filter(a => (a.branchIds || []).some(b => (me.branches || []).includes(b))) : all;
        this.lines = await loadAllLines().catch(() => null);   // 24 Nov 2026: no access or rules not published: the column is hidden
      }
      catch (e) { this.error = friendlyError(e, 'load the agents'); }
      this.loading = false;
    },
    isPdf(c) { return (c?.mimeType || '').includes('pdf') || /\.pdf$/i.test(c?.name || ''); },

    // ---- Profile ----
    async openView(a) {
      this.dropPreviews();
      this.drawer = { mode: 'view', agent: a, bank: null, bankLoading: this.canEdit, bankError: '', showAcct: false, previews: {}, previewError: {},
        history: [], histLoading: true, histError: '', histOpen: false,
        lines: [], sum: totals([]), linesLoading: true, linesError: '', cFilter: 'all', tab: 'contact' };
      const d = this.drawer;
      this.loadLines(d);
      loadCommissionHistory(a.id).then(h => { d.history = h; }).catch(e => { d.histError = friendlyError(e, 'load the commission history'); })
        .finally(() => { d.histLoading = false; });
      if (this.canEdit) {
        try { d.bank = await loadBank(a.id); }
        catch (e) { d.bankError = friendlyError(e, 'load the bank details'); }
        d.bankLoading = false;
      }
      // Small previews of image cards (PDFs open in the viewer)
      for (const s of SIDES) {
        const c = a[s.key];
        if (!c || this.isPdf(c)) continue;
        fileBlob('agents', c.fileId).then(u => { if (this.drawer === d) d.previews[s.key] = u; else URL.revokeObjectURL(u); })
          .catch(() => { d.previewError[s.key] = true; });
      }
    },
    dropPreviews() { Object.values(this.drawer?.previews || {}).forEach(u => URL.revokeObjectURL(u)); },
    viewCard(c) { this.$refs.viewer.open({ name: c.name, id: c.fileId, kind: 'agents' }); },
    async closeDrawer() {
      // Esc / backdrop with the commission history open: close just the popup
      if (this.drawer?.histOpen) { this.drawer.histOpen = false; return; }
      if (this.pay.line) { this.closePay(); return; }   // Esc with the Mark paid popup open: close just the popup
      if (this.drawer?.mode === 'edit' && this.dirty() && !await askConfirm({ title: 'Close without saving?', message: 'Your changes to this agent will be lost.', confirmText: 'Close', danger: true })) return;
      this.dropPreviews();
      this.drawer = null;
    },

    // ---- Booking commissions (24 Nov 2026) ----
    async loadLines(d) {
      d.linesLoading = true; d.linesError = '';
      try {
        d.lines = await loadAgentLines(d.agent.id);
        d.sum = totals(d.lines);
      } catch (e) { d.linesError = friendlyError(e, 'load the booking commissions'); }
      d.linesLoading = false;
    },
    startPay(l) { this.pay = { line: l, mode: 'paid', date: todayYmd(), amount: String(l.amount ?? ''), bankRef: '', note: '', slip: null, uploading: false, pct: 0, error: '' }; },
    closePay() { if (!this.pay.uploading && !this.busy) this.pay = { line: null }; },
    startUndo(l) { this.pay = { line: l, mode: 'undo', reason: '', error: '' }; },
    async uploadSlip(e) {
      const file = e.target.files[0]; e.target.value = '';
      if (!file) return;
      const p = this.pay;
      if (!/^image\//.test(file.type) && file.type !== 'application/pdf') { p.error = 'The pay slip must be an image (JPG, PNG) or a PDF.'; return; }
      p.error = ''; p.uploading = true; p.pct = 0;
      try {
        // Google Drive > Agent Commission Payments > <agent id>
        const [got] = await uploadForLink('agent-commissions', [file], x => { p.pct = Math.round(x * 100); }, this.drawer.agent.id, this.drawer.agent.name);
        if (!got?.id) throw new Error('Drive did not return the file.');
        p.slip = { name: got.name, fileId: got.id, mimeType: got.mimeType || file.type };
      } catch (err) { p.error = `Could not upload the pay slip: ${err.message}`; }
      p.uploading = false;
    },
    viewSlip(c) { this.$refs.viewer.open({ name: c.name, id: c.fileId, kind: 'agent-commissions' }); },
    async savePaid() {
      const p = this.pay;
      p.error = !/^\d{4}-\d{2}-\d{2}$/.test(p.date || '') ? 'Pick the date paid.'
        : !(Number(p.amount) > 0) ? 'Enter the amount paid.'
        : !String(p.bankRef || '').trim() ? 'Enter the bank reference.'
        : !p.slip ? 'Upload the pay slip.' : '';
      if (p.error) return;
      this.busy = true;
      try {
        await markPaid(me, p.line, { date: p.date, amount: Number(p.amount), bankRef: p.bankRef, note: p.note, slip: p.slip });
        this.pay = { line: null };
        await this.afterPay();
      } catch (e) { p.error = e.code === 'permission-denied' ? 'Saving was refused. Only Accounting and Directors can mark a commission paid, and Firestore rules Draft 1.10 must be published.' : friendlyError(e, 'mark the commission paid'); }
      this.busy = false;
    },
    async saveUndo() {
      const p = this.pay;
      p.error = String(p.reason || '').trim() ? '' : 'Add the reason for undoing the payment.';
      if (p.error) return;
      this.busy = true;
      try {
        await undoPaid(me, p.line, p.reason);
        this.pay = { line: null };
        await this.afterPay();
      } catch (e) { p.error = friendlyError(e, 'undo the payment'); }
      this.busy = false;
    },
    async afterPay() {
      await this.loadLines(this.drawer);
      this.lines = await loadAllLines().catch(() => this.lines);
    },

    // ---- Add / edit ----
    async openForm(a) {
      this.dropPreviews();
      this.f = blankForm();
      const f = this.f;   // the reactive copy, so the form updates as the bank details arrive
      if (a) Object.assign(f, { id: a.id, name: a.name || '', company: a.company || '', agency: a.agency || 'property', agencyOther: a.agencyOther || '', mobile: a.mobile || '',
        email: a.email || '', licenseNo: a.licenseNo || '', address: a.address || '', remarks: a.remarks || '', bankName: a.bankName || '', cardFront: a.cardFront || null, cardBack: a.cardBack || null, active: a.active !== false, bankLoading: true,
        commDaily: numOrEmpty(a.commDaily), commMonthly: numOrEmpty(a.commMonthly), commYearly: numOrEmpty(a.commYearly), commStart: [a.commDaily ?? null, a.commMonthly ?? null, a.commYearly ?? null] });
      else f.id = newAgentId();
      f.tab = this.drawer?.mode === 'view' && this.drawer.tab ? this.drawer.tab : 'contact';   // Edit opens on the tab being viewed
      f.branchIds = a ? [...(a.branchIds || [])] : this.isBD ? [...(me.branches || [])] : [];   // a Branch Director's new agent starts in their branches
      this.drawer = { mode: 'edit', agent: a };
      if (a) {
        try { const b = await loadBank(a.id); if (b) { f.holder = b.holder || ''; f.accountNo = b.accountNo || ''; } }
        catch (e) { f.error = friendlyError(e, 'load the saved bank details') + ' Close and try again before saving, so they are not lost.'; f.bankLoading = false; this.drawer.bankFailed = true; return; }
        f.bankLoading = false;
      }
      this.start = this.snap();
    },
    snap() { const f = this.f; return JSON.stringify([(f.branchIds || []).join(), f.name, f.company, f.agency, f.agencyOther, f.mobile, f.email, f.licenseNo, f.address, f.remarks, f.bankName, f.holder, f.accountNo, f.cardFront?.fileId, f.cardBack?.fileId, pct(f.commDaily), pct(f.commMonthly), pct(f.commYearly)]); },
    dirty() { return this.drawer?.mode === 'edit' && this.snap() !== this.start; },
    async upload(key, e) {
      const file = e.target.files[0]; e.target.value = '';
      if (!file) return;
      const f = this.f;
      if (!/^image\//.test(file.type) && file.type !== 'application/pdf') { f.error = 'Business cards must be an image (JPG, PNG) or a PDF.'; return; }
      f.error = ''; f.uploading[key] = true; f.pct[key] = 0;
      try {
        const [got] = await uploadForLink('agents', [file], p => { f.pct[key] = Math.round(p * 100); }, f.id, f.name.trim() || 'New agent');
        if (!got?.id) throw new Error('Drive did not return the file.');
        f[key] = { name: got.name, fileId: got.id, mimeType: got.mimeType || file.type };
      } catch (err) { f.error = `Could not upload the business card: ${err.message}`; }
      f.uploading[key] = false;
    },
    validate() {
      const f = this.f;
      if (!f.name.trim()) return 'Enter the agent\'s name.';
      if (f.agency === 'other' && !f.agencyOther.trim()) return 'Agency is Others: say what kind (e.g. Relocation company).';
      if (!f.mobile.trim()) return 'Enter a mobile number.';
      if (f.email.trim() && !EMAIL.test(f.email.trim())) return 'The email address doesn\'t look right.';
      for (const [v, label] of [[f.commDaily, 'Daily'], [f.commMonthly, 'Monthly'], [f.commYearly, 'Yearly']]) {
        if (String(v ?? '').trim() === '') continue;
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0 || n > 100) return `${label} commission must be a % from 0 to 100.`;
      }
      if (this.commChanged && !/^\d{4}-\d{2}-\d{2}$/.test(f.commFrom || '')) return 'Pick the date the new commission starts (Effective from).';
      if (f.accountNo && /[^\d\s-]/.test(f.accountNo)) return 'The bank account number may have digits only.';
      if (f.accountNo.replace(/\D/g, '').length > 20) return 'The bank account number is too long (20 digits at most).';
      return '';
    },
    async save() {
      if (this.drawer?.bankFailed) return;
      this.f.error = this.validate() || (this.isBD && !this.f.branchIds.some(b => (me.branches || []).includes(b)) ? 'Tick at least one of your branches.' : '');
      if (this.f.error) { this.f.tab = /commission|Effective from/i.test(this.f.error) ? 'comm' : 'contact'; return; }
      this.busy = true; this.okMsg = '';
      try {
        const existing = this.drawer.agent;
        const saved = await saveAgent(me, this.f.id, this.f, existing);
        await this.go();
        this.start = this.snap();
        this.okMsg = existing ? `${saved.name} saved.` : `${saved.name} added to the Agent Database.`;
        const tab = this.f.tab;
        await this.openView(this.agents.find(x => x.id === saved.id) || saved);
        if (this.drawer) this.drawer.tab = tab;   // back on the tab that was edited
      } catch (e) {
        this.f.error = e.code === 'permission-denied' ? 'Saving was refused. You need Agent Database Full access, and Firestore rules Draft 0.94 must be published.' : friendlyError(e, 'save the agent');
      }
      this.busy = false;
    },
    async remove(a) {
      if (!await askConfirm({ title: `Delete ${a.name}?`, message: 'The agent and their bank details are removed from the PMS. Their business card files stay in Google Drive. An audit log line is kept.', confirmText: 'Delete agent', danger: true })) return;
      this.busy = true;
      try {
        await deleteAgent(me, a);
        this.dropPreviews(); this.drawer = null;
        this.okMsg = `${a.name} deleted.`;
        await this.go();
      } catch (e) { this.error = friendlyError(e, 'delete the agent'); }
      this.busy = false;
    }
  }
};
</script>

<style scoped>
.fld-pick { display: block; width: 100%; }
.fld-pick :deep(.op-btn) { width: 100%; min-height: 40px; }
.ag-branches .check { display: inline-flex; align-items: center; gap: 6px; font-weight: 400; }
.form-sec { font-size: 12px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--muted); margin: 24px 0 10px; padding-bottom: 8px; border-bottom: 1px solid var(--border); }
.drawer-body > .form-sec:first-child, .notice + .form-sec { margin-top: 0; }
.head-tools { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.toolbar .input { max-width: 320px; }
.small { font-size: 12px; }
.strong { font-weight: 600; }
.nowrap { white-space: nowrap; }
.mono { font-variant-numeric: tabular-nums; letter-spacing: .03em; }
.pre { white-space: pre-line; }
.grow { flex: 1; }
.ag-tags { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 4px; }
.ag-sec-row { display: flex; align-items: center; justify-content: space-between; }
.ag-sec-row .link { text-transform: none; letter-spacing: 0; font-weight: 500; font-size: 12px; }
.ag-sec-note { text-transform: none; letter-spacing: 0; font-weight: 400; }
.ag-fs { border: 0; padding: 0; margin: 0 0 16px; }
.ag-fs legend { font-weight: 500; font-size: 13px; color: var(--text-2); padding: 0; margin-bottom: 6px; }
.ag-agency { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.ag-agency label { display: flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 12px; border: 1px solid var(--border); border-radius: 8px; cursor: pointer; font-size: 13px; color: var(--text-2); }
.ag-agency label.on { border-color: var(--accent); background: var(--accent-soft); color: var(--text); font-weight: 600; }
.ag-agency input { accent-color: var(--accent); margin: 0; }
.ag-bank { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0 14px; }
.ag-cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.ag-up .filedrop { min-height: 96px; display: flex; flex-direction: column; justify-content: center; gap: 4px; }
.ag-up .filedrop.off { pointer-events: none; opacity: .8; }
.ag-up .file-line { display: flex; justify-content: space-between; gap: 8px; align-items: center; border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; font-size: 13px; }
.ag-file { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.ag-card { position: relative; aspect-ratio: 1.75 / 1; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; background: var(--hover); padding: 0; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.ag-card img { width: 100%; height: 100%; object-fit: contain; }
.ag-card-ph { color: var(--muted); font-size: 12px; }
.ag-card-label { position: absolute; left: 8px; bottom: 8px; background: rgba(0,0,0,.6); color: #fff; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 999px; }
.ag-meta { margin-top: 16px; }
.ag-hist-btn { margin: 8px 0 4px; width: 100%; justify-content: center; }
.ag-fixed { height: min(800px, 90vh); height: min(800px, 90dvh); }   /* 24 Nov 2026 (Khairul): same height on every tab */
.ag-tabs { margin: 10px 0 18px; }
.ag-list { table-layout: fixed; width: 100%; }
.ag-list th, .ag-list td { text-align: center; vertical-align: middle; }
.ag-list th:first-child, .ag-list td:first-child { text-align: left; }
.ag-list .ag-cut > div { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* 24 Nov 2026 (Khairul): eye instead of View, as on Offline Payments (grey, magenta on row hover) */
.ag-eye { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border: 0; border-radius: 8px; background: none; cursor: pointer; padding: 0; }
.ag-eye svg { width: 20px; height: 20px; fill: var(--muted); transition: fill var(--fast); }
tr.clickable:hover .ag-eye svg, .ag-eye:focus-visible svg { fill: var(--accent); }
.ag-comm-table { table-layout: fixed; width: 100%; }
.ag-comm-table th, .ag-comm-table td { vertical-align: middle; }   /* 24 Nov 2026 (Khairul): centred height-wise too */
.ag-comm-table .ag-cut > div { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ag-comm-table .ag-st, .ag-comm-table .ag-mid { text-align: center; }
.ag-comm-table td.ag-st .small { text-align: center; overflow-wrap: anywhere; }
.ag-comm-table th .fi { margin-left: 4px; }
.ag-tabs button { padding: 10px 14px; }
.ag-tab > .form-sec:first-child, .ag-tab .ag-view-info > .form-sec:first-child, .ag-tab .ag-view-card > .form-sec:first-child { margin-top: 0; }
.ag-bank-tab { max-width: 560px; }
.ag-rates { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-bottom: 12px; align-items: stretch; }
.ag-rate { display: flex; flex-direction: column; gap: 2px; border: 1px solid var(--border); border-radius: 10px; padding: 10px 14px; font-size: 13px; color: var(--text-2); }
.ag-rate b { font-size: 18px; color: var(--text); }
.ag-rate-hist { justify-content: center; align-items: center; align-self: stretch; height: auto; min-height: 0; border-radius: 10px; }
.ag-cfilter { margin-bottom: 10px; }
.ag-warn { color: #b45309; font-weight: 600; }
.ag-span2 { grid-column: span 2; }

#payForm .file-line { display: flex; justify-content: space-between; gap: 8px; align-items: center; border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; font-size: 13px; background: var(--surface); }
#payForm .filedrop.off { pointer-events: none; opacity: .8; }
.ag-pay-foot { gap: 8px; }
.ag-hist-table { font-size: 13px; }
.ag-hist-table th, .ag-hist-table td { padding: 8px 10px; vertical-align: top; }
/* Commission history popup */
.ag-pop-back { position: fixed; inset: 0; z-index: 1000; background: rgba(0,0,0,.35); display: flex; align-items: center; justify-content: center; padding: 16px; }
.ag-pop { background: var(--card, #fff); border-radius: 12px; box-shadow: 0 20px 50px rgba(0,0,0,.25); width: min(640px, 100%); max-height: 85vh; display: flex; flex-direction: column; }
.ag-pop-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 18px 20px 14px; border-bottom: 1px solid var(--border); }
.ag-pop-head h3 { margin: 0 0 2px; font-size: 17px; }
.ag-pop-body { padding: 16px 20px; overflow: auto; }
.ag-pop-foot { display: flex; justify-content: flex-end; padding: 12px 20px; border-top: 1px solid var(--border); }
/* Profile: details left, business card right */
.ag-view { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 32px; align-items: start; }
.ag-view .kv span:last-child { overflow-wrap: anywhere; }
.ag-view-card { position: sticky; top: 0; }
.ag-card-stack { display: grid; gap: 10px; justify-items: center; }   /* 24 Nov 2026 (Khairul): front on top, back under it (fills the Profile tab's right side) */
.ag-card-stack > .help { margin: 0; text-align: center; }
.ag-card-stack .ag-card { width: 100%; max-width: 320px; }   /* 24 Nov 2026 (Khairul): smaller, so both cards sit beside the details without scrolling */
.ag-card-none { border: 1.5px dashed var(--border); border-radius: 10px; aspect-ratio: 1.75 / 1; display: flex; align-items: center; justify-content: center; color: var(--muted); font-size: 13px; }
@media (max-width: 860px) { .ag-view { grid-template-columns: minmax(0, 1fr); gap: 8px; } .ag-view-card { position: static; } }
@media (max-width: 720px) { .ag-agency, .ag-bank, .ag-cards { grid-template-columns: minmax(0, 1fr); } }
</style>