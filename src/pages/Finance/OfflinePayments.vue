<template>
  <main class="content">
    <div class="page-head">
      <div>
        <h1>Offline payments</h1>
        <div class="sub">Cash and bank transfers received outside the booking sites. Check each one against the bank and mark it Checked, Pending or Unknown. Unknown (no receipt) can be filled in by Operations, which makes it Edited.</div>
        <LiveStatus class="live-line" :status="liveStatus.list?.status" :last-updated="liveStatus.list?.lastUpdated" />
      </div>
      <div class="head-actions">
        <!-- ONE-TIME (18 Nov 2026): the old Offline Payment Check System Excel into the PMS. Remove after the import (with lib/offline-import.js). -->
        <button type="button" class="btn" v-if="isDirector" @click="openImport">Import from Excel</button>
        <button type="button" class="btn" v-if="canEdit" @click="openReport">Report</button>
        <button type="button" class="btn btn-primary" v-if="canEdit || canPayUtil" @click="openForm()">+ New offline payment</button>
      </div>
    </div>


    <section class="kpis">
      <!-- 19 Nov 2026: each card filters the list below by its status (the Status filter follows); Total shows them all -->
      <button type="button" class="card kpi kpi-link" :class="{ on: !status }" :aria-pressed="!status" @click="status = ''"><div class="label">Total submissions</div><div class="value">{{ listRows.length }}</div></button>
      <button type="button" class="card kpi kpi-link" :class="{ on: status === 'Checked' }" :aria-pressed="status === 'Checked'" @click="pickStatus('Checked')"><div class="label">Checked</div><div class="value">{{ count('Checked') }}</div></button>
      <button type="button" class="card kpi kpi-link" :class="{ on: status === 'Pending' }" :aria-pressed="status === 'Pending'" @click="pickStatus('Pending')"><div class="label">Pending</div><div class="value">{{ count('Pending') }}</div></button>
      <button type="button" class="card kpi kpi-link" :class="{ on: status === 'Unknown' }" :aria-pressed="status === 'Unknown'" @click="pickStatus('Unknown')"><div class="label">Unknown</div><div class="value" :class="{ alert: count('Unknown') }">{{ count('Unknown') }}</div></button>
      <button type="button" class="card kpi kpi-link" :class="{ on: status === 'Edited' }" :aria-pressed="status === 'Edited'" @click="pickStatus('Edited')"><div class="label">Edited</div><div class="value">{{ count('Edited') }}</div></button>
    </section>

    <section class="card">
      <div class="filters">
        <!-- 24 Nov 2026 (Khairul): Status drop-down back (removed 20 Nov), right after Search; it and the status cards above set the same filter.
             Search fills the rest of the row. -->
        <div class="field f-search"><label>Search</label><input class="input" v-model="q" placeholder="Search by name, property, ref…"></div>
        <div class="field f-status"><label>Status</label><OptionPicker class="fld-pick" v-model="status" :options="STATUS_OPTS" label="Status" /></div>
        <div class="field"><label>Month</label><MonthPicker v-model="month" all-label="All months" @change="pickMonth" /></div>
        <FormField label="From date" type="date" v-model="from" @input="month = ''" />
        <FormField label="To date" type="date" v-model="to" @input="month = ''" />
      </div>
      <div class="list-head">
        <p class="help">{{ loading ? 'Loading…' : `${shown.length} record${shown.length === 1 ? '' : 's'}` }}</p>
        <!-- 13 Nov 2026: table (default) or cards (one full-width card per payment, as a list); remembered on this browser -->
        <div class="seg slide layout-seg" role="radiogroup" aria-label="Show payments as">
          <button type="button" role="radio" :aria-checked="layout === 'table'" :class="{ on: layout === 'table' }" @click="setLayout('table')">Table</button>
          <button type="button" role="radio" :aria-checked="layout === 'cards'" :class="{ on: layout === 'cards' }" @click="setLayout('cards')">Cards</button>
        </div>
      </div>
      <Paged :items="shown" :size="15" v-slot="{ pageRows }">
        <div class="pay-list" v-if="layout === 'cards'">
          <div class="pay-card" v-for="r in pageRows" :key="r.id" role="button" tabindex="0" :aria-label="`View payment ${r.bookingNo || r.guest || ''}`"
            @click="openRow(r)" @keydown.enter.prevent="openRow(r)" @keydown.space.prevent="openRow(r)">
            <!-- 13 Nov 2026 hierarchy: who paid, then where, then what for, then the small print; amount and status on the right -->
            <div class="pc-main">
              <div class="pc-name">{{ r.guest || '—' }}</div>
              <div class="pc-place"><span>{{ [r.propertyName, r.unitCode].filter(Boolean).join(' · ') || 'No property' }}</span></div>
              <div class="pc-meta">{{ [niceDate(r.date), r.mode, r.submittedByName || '', r.editedByName ? `Edited: ${r.editedByName}` : ''].filter(Boolean).join(' · ') }}</div>
            </div>
            <!-- 20 Nov 2026 (Khairul): what for, in the middle column (fixed width, centred); Payment code only when there is one -->
            <div class="pc-mid">
              <div class="pc-purpose clamp" :title="r.purpose"><span class="pc-k">Purpose</span>{{ r.purpose || '—' }}</div>
              <div class="pc-purpose pc-one" :title="r.remarks" v-if="r.remarks"><span class="pc-k">Payment Code</span>{{ r.remarks }}</div>
            </div>
            <div class="pc-side">
              <!-- 25 Nov 2026 (Khairul): status beside the amount so the card stays thin -->
              <div class="pc-top"><span class="tag" :class="'st-' + (r.status || '').toLowerCase()">{{ r.status }}</span><b class="pc-amt">{{ `RM ${Number(r.amount || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` }}</b></div>
              <small class="who pc-parts" v-if="partsShort(r)">{{ partsShort(r) }}</small>
            </div>
            <ViewChevron label="Open payment" @click.stop="openRow(r)" />
          </div>
          <SkeletonRows v-if="loading && !pageRows.length" :cols="4" />
          <p class="muted empty" v-if="!loading && !pageRows.length">No offline payments found.</p>
        </div>
        <div class="table-wrap" v-else :style="pageRows.length ? null : { minHeight: '0' }"><table class="table op-table">
          <!-- 20 Nov 2026 (Khairul): fits a laptop screen: Unit under Property, Payment code under Purpose (only when there is one), whole row opens the payment, eye instead of View -->
          <colgroup><col style="width:112px"><col style="width:20%"><col style="width:16%"><col><col style="width:105px"><col style="width:110px"><col style="width:105px"><col style="width:40px"></colgroup>
          <thead><tr><th>Payment Date</th><th>Property · Unit</th><th>Guest</th><th>Purpose</th><th class="num">Amount (RM)</th><th>Status</th><th>Submitted by</th><th class="eye-col"></th></tr></thead>
          <tbody>
            <tr class="clickable" v-for="r in pageRows" :key="r.id" @click="openRow(r)">
              <td>{{ r.date }}</td>
              <td><div>{{ r.propertyName || '—' }}</div><div class="who" v-if="r.unitCode">{{ r.unitCode }}</div></td>
              <td>{{ r.guest }}</td>
              <td class="purpose-cell"><span class="clamp" :title="r.purpose">{{ r.purpose || '—' }}</span><div class="op-code" v-if="r.remarks" :title="r.remarks"><span class="pc-k">Code</span>{{ r.remarks }}</div></td>
              <td class="num amt">{{ Number(r.amount || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}<div class="who" v-if="partsShort(r)">{{ partsShort(r) }}</div></td>
              <td><span class="tag" :class="'st-' + (r.status || '').toLowerCase()">{{ r.status }}</span><div class="who" v-if="r.editedByName">{{ `by ${r.editedByName}` }}</div></td>
              <td>{{ r.submittedByName || '—' }}</td>
              <td class="chev-col eye-col"><ViewChevron label="Open payment" @click.stop="openRow(r)" /></td>
            </tr>
            <SkeletonRows v-if="loading && !pageRows.length" table :cols="8" />
            <tr v-if="!loading && !pageRows.length"><td colspan="8" class="muted empty">No offline payments found.</td></tr>
          </tbody>
        </table></div>
      </Paged>
    </section>

    <template v-if="view">
      <div class="modal-back" @click.self="view = null" v-esc="() => { view = null }">
        <div class="modal view-modal" role="dialog" aria-label="Offline payment details">
          <div class="v-head">
            <div><div class="v-title">Offline payment</div><div class="v-sub">{{ view.date }} · submitted by {{ view.submittedByName || '—' }}<template v-if="view.editedByName">{{ ` · edited by ${view.editedByName}${view.editedAt?.toDate ? ' on ' + view.editedAt.toDate().toLocaleDateString('en-GB') : ''}` }}</template></div></div>
            <div class="v-status" v-if="canEdit"><OptionPicker class="fld-pick" :model-value="view.status" :options="statusOptions(view.status)" label="Status" @update:modelValue="v => setStatus(view, v)" /></div>
            <span class="tag" v-else :class="'st-' + (view.status || '').toLowerCase()">{{ view.status }}</span>
          </div>
          <div class="notice" v-if="opsEdit(view) && !editing">This payment has no receipt. Add the missing details or the receipt, then save. It becomes Edited and Accounting is told.</div>
          <div class="v-amount"><span>Amount</span><b>RM {{ Number(view.amount || 0).toFixed(2) }}</b></div>
          <!-- 23 Nov 2026: Rental / Utilities parts and the bills paid -->
          <div class="v-parts" v-if="viewParts(view).length && !editing">
            <div class="v-part" v-for="x in viewParts(view)" :key="x.k"><span>{{ x.label }}</span><b>{{ money(x.amount) }}</b>
              <div class="v-bill" v-for="bl in x.bills || []" :key="bl.id"><span>{{ bl.name }}</span><span>{{ money(bl.amount) }}</span></div></div>
          </div>
          <div class="v-grid" v-if="!editing">
            <div class="v-item"><span>Property</span><b>{{ view.propertyName || '—' }}</b></div>
            <div class="v-item"><span>Unit</span><b>{{ view.unitCode || '—' }}</b></div>
            <div class="v-item"><span>Guest / tenant</span><b>{{ view.guest || '—' }}</b></div>
            <div class="v-item"><span>Payment method</span><b>{{ view.mode || '—' }}</b></div>
            <div class="v-item"><span>Bank reference</span><b>{{ view.bankRef || '—' }}</b></div>
            <div class="v-item"><span>Documents</span><b><a v-if="view.docsLink" :href="view.docsLink" target="_blank" rel="noopener">Open link</a><template v-else>None</template></b></div>
            <div class="v-item" v-if="(view.docsLinks || []).length > 1"><span>Receipts (old sheet)</span><b><template v-for="(l, i) in view.docsLinks" :key="l"><a :href="l" target="_blank" rel="noopener">{{ `Receipt ${i + 1}` }}</a>{{ i < view.docsLinks.length - 1 ? ' · ' : '' }}</template></b></div>
            <div class="v-item"><span>Verified by</span><b>{{ view.verifiedByName || '—' }}</b></div>
            <div class="v-item"><span>Verified date</span><b>{{ view.verifiedDate || '—' }}</b></div>
            <div class="v-item v-purpose" v-if="view.bookingNo"><span>Booking</span><b>{{ view.bookingNo }}{{ view.forMonth ? ` · for ${monthName(view.forMonth)}` : '' }}</b></div>
            <div class="v-item" v-if="view.roomType"><span>Room type (old sheet)</span><b>{{ view.roomType }}</b></div>
            <div class="v-item v-purpose"><span>Purpose</span><b>{{ view.purpose || '—' }}</b></div>
            <div class="v-item v-purpose"><span>Payment code</span><b>{{ view.remarks || '—' }}</b></div>
          </div>
          <div class="v-edit-grid" v-else>
            <div class="notice error" ref="edErr" v-show="formError" style="grid-column: 1 / -1">{{ formError }}</div>
            <FormField label="Payment Date" req type="date" v-model="ed.date" />
            <FormField v-if="!view.bookingId" label="Amount (RM)" req type="number" min="0" step="0.01" v-model="ed.amount" />
            <div class="field"><label>Payment method</label>
              <OptionPicker class="fld-pick" v-model="ed.mode" :options="MODES" label="Payment method" /></div>
            <FormField label="Bank reference" v-model="ed.bankRef" placeholder="Reference no. on the bank slip" />
            <div class="field"><label class="req">Property</label>
              <PropertyPicker block class="fld-pick" v-model="ed.propertyId" :properties="properties" :before="[{ value: '', label: 'Choose property' }]" @change="editProperty" /></div>
            <div class="field"><label>Unit</label>
              <OptionPicker class="fld-pick" v-model="ed.unitCode" :disabled="!ed.propertyId" :options="[{ value: '', label: 'Choose unit' }, ...units.map(x => ({ value: x.unitCode, label: x.unitCode }))]" label="Unit" searchable /></div>
            <FormField label="Guest / tenant name" req v-model="ed.guest" placeholder="Full name as on IC / passport" />
            <!-- 24 Nov 2026 (Khairul): a booking's payment is edited as its lines (Rental / Utilities / Charges); bills follow the change -->
            <PaymentLines v-if="view.bookingId && ed.u" class="wide" :lines="ed.lines" :u="ed.u" booked :month-opts="editMonthOpts" :can-edit="canEdit" :allow-add="false" />
            <FormField v-if="canEdit" label="Payment code" v-model="ed.remarks" placeholder="Add payment code" />
            <div class="field wide"><label class="req">Purpose</label><textarea class="input purpose-box" rows="3" maxlength="1000" v-model="ed.purpose"></textarea></div>
          </div>
          <DriveFiles class="v-files" kind="offline-payments" :record-id="view.groupPayId || view.id" :label="nameOf(view)" :readonly="!(canEdit || opsEdit(view))" :key="view.id" @folder="l => saveFolder(view, l)" />
<div class="hist" v-if="hist.length && showHist">
            <h4>Change history</h4>
            <ul>
              <li v-for="h in hist" :key="h.id">
                <div class="h-top"><b>{{ h.what }}</b><span class="muted">{{ h.when }} · {{ h.userName }}{{ h.role ? ' (' + h.role + ')' : '' }}</span></div>
                <div class="h-chg" v-for="(c, i) in h.changes" :key="i">{{ c.text }}</div>
              </li>
            </ul>
          </div>
          <div class="modal-foot" v-if="!editing">
            <!-- 16 Nov 2026: Directors only (Firestore rules 0.72) -->
            <button type="button" class="btn del-btn" v-if="isDirector" @click="removePayment(view)" :disabled="busy">Delete</button>
            <button type="button" class="btn" @click="view = null">Close</button>
            <button type="button" class="btn" v-if="hist.length" @click="showHist = !showHist">{{ showHist ? 'Hide history' : 'Change history' }}</button>
            <button type="button" class="btn btn-primary" v-if="canEdit || opsEdit(view)" @click="startEdit">{{ opsEdit(view) ? 'Add details' : 'Edit details' }}</button>
          </div>
          <div class="modal-foot" v-else>
            <button type="button" class="btn" @click="editing = false">Discard changes</button>
            <button type="button" class="btn btn-primary" :disabled="busy" @click="saveEdit">{{ busy ? 'Saving…' : 'Save changes' }}</button>
          </div>
        </div>
      </div>
    </template>

    <template v-if="rep">
      <div class="modal-back" @click.self="rep = null" v-esc="() => { rep = null }">
        <div class="modal rep-modal" role="dialog" aria-label="Offline payments report">
          <div class="card-head"><h2 style="margin:0">Offline payments report</h2></div>
          <p class="help">A summary by property and every payment in the period, as Excel or CSV.</p>
          <div class="notice error" v-show="rep.error">{{ rep.error }}</div>
          <div class="grid">
            <div class="field"><label>Report</label>
              <OptionPicker class="fld-pick" v-model="rep.type" :options="[{ value: 'monthly', label: 'Monthly' }, { value: 'yearly', label: 'Yearly' }, { value: 'custom', label: 'Custom dates' }]" label="Report type" /></div>
            <div class="field"><label>Property</label>
              <PropertyPicker block class="fld-pick" v-model="rep.propertyId" :properties="properties" :before="[{ value: '', label: 'All properties' }]" /></div>
            <div class="field" v-if="rep.type === 'monthly'"><label>Month</label><MonthPicker v-model="rep.month" /></div>
            <div class="field" v-if="rep.type === 'yearly'"><label>Year</label>
              <OptionPicker class="fld-pick" v-model="rep.year" :options="yearOptions" label="Year" /></div>
            <template v-if="rep.type === 'custom'">
              <FormField label="From date" type="date" v-model="rep.from" />
              <FormField label="To date" type="date" v-model="rep.to" />
            </template>
          </div>
          <div class="modal-foot">
            <button type="button" class="btn" @click="rep = null">Close</button>
            <button type="button" class="btn" :disabled="rep.busy" @click="runReport('csv')">Download CSV</button>
            <button type="button" class="btn btn-primary" :disabled="rep.busy" @click="runReport('xlsx')">{{ rep.busy ? 'Preparing…' : 'Download Excel' }}</button>
          </div>
        </div>
      </div>
    </template>

    <!-- ONE-TIME import popup (18 Nov 2026). Remove with the button above. -->
    <template v-if="imp">
      <div class="modal-back" @click.self="imp.busy || (imp = null)" v-esc="() => { if (!imp.busy) imp = null }">
        <div class="modal imp-modal" role="dialog" aria-label="Import offline payments from Excel">
          <div class="card-head"><h2 style="margin:0">Import from Excel</h2></div>
          <p class="help">One-time move of the old Offline Payment Check System (the Sales Statement tab) into the PMS. Nothing is saved until you press Import.</p>
          <div class="notice error" v-show="imp.error">{{ imp.error }}</div>
          <template v-if="!imp.list">
            <!-- Choosing the file reads it straight away and shows the preview (nothing is saved yet) -->
            <label class="imp-pick" :class="{ busy: imp.busy }">
              <input type="file" hidden accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" @change="readImport" :disabled="!!imp.busy">
              <b>{{ imp.busy || 'Choose the Excel file' }}</b>
              <span class="muted">{{ imp.busy ? (imp.file || '') : 'Offline Payment Check System.xlsx. The preview shows next, then the Import button.' }}</span>
            </label>
          </template>
          <template v-else-if="imp.done">
            <div class="notice">{{ imp.done }}</div>
          </template>
          <template v-else>
            <div class="imp-sum">
              <div><b>{{ impRows.length }}</b><span>to import</span></div>
              <div><b>{{ `RM ${impTotal}` }}</b><span>total</span></div>
              <div><b>{{ imp.skipped.length }}</b><span>skipped (no amount or date)</span></div>
              <div><b>{{ imp.already.length }}</b><span>already in the PMS</span></div>
              <div><b>{{ imp.repeats.length }}</b><span>repeated in the file</span></div>
              <div><b>{{ impPending }}</b><span>need a choice below</span></div>
            </div>
            <!-- Sheet units not in the PMS: confirm a similar unit, create a new unit, or keep the text (18 Nov 2026) -->
            <div class="imp-box" v-if="imp.missing.length">
              <h4>{{ `Units not in the PMS (${imp.missing.length})` }}</h4>
              <p class="help">{{ `${impFound} payments matched a PMS unit. For the units below, a similar PMS unit is suggested where there is one: pick "Same as …" if it is that unit, or create a new unit. Import stays off until each has a choice.` }}</p>
              <div class="imp-unit" v-for="g in imp.missing" :key="g.key" :class="{ todo: !impChoiceOk(g.key) }">
                <div class="imp-u-name"><b>{{ g.texts.join(' / ') }}</b><span class="muted">{{ `${g.props.join(', ')} · ${g.count} payment${g.count === 1 ? '' : 's'}` }}</span></div>
                <OptionPicker class="fld-pick" :model-value="imp.choice[g.key].use" :options="g.opts" label="What this unit is" @update:modelValue="v => imp.choice[g.key].use = v" />
                <template v-if="imp.choice[g.key].use === 'new'">
                  <input class="input" v-model="imp.choice[g.key].code" placeholder="New unit code" aria-label="New unit code">
                  <PropertyPicker block class="fld-pick imp-u-wide" v-model="imp.choice[g.key].propertyId" :properties="properties" :before="[{ value: '', label: 'Choose property' }]" />
                </template>
                <PropertyPicker v-else-if="imp.choice[g.key].use === 'text'" block class="fld-pick imp-u-wide" v-model="imp.choice[g.key].propertyId" :properties="properties" :before="[{ value: '', label: 'No property' }]" />
              </div>
            </div>
            <div class="imp-box" v-if="impNames.length">
              <h4>{{ `No unit in the sheet: choose the property (${impNames.length})` }}</h4>
              <p class="help">These payments have no unit. Choose the PMS property for each name, or "No property" to keep the name as text.</p>
              <div class="imp-map" v-for="n in impNames" :key="n.key">
                <span>{{ `${n.name || '(blank)'} · ${n.count} payment${n.count === 1 ? '' : 's'}` }}</span>
                <PropertyPicker block class="fld-pick" :model-value="imp.map[n.key] || ''" :properties="properties"
                  :before="[{ value: '', label: 'Choose property' }, { value: '-', label: 'No property (keep the name)' }]" @update:modelValue="v => imp.map = { ...imp.map, [n.key]: v }" />
              </div>
            </div>
            <p class="help" v-if="impNewUnits.length">{{ `New units created when you import (${impNewUnits.length}): ${impNewUnits.map(u => u.code + ' in ' + u.propertyName).join(', ')}. They have no owner or fee arrangement yet.` }}</p>
            <details class="imp-box" v-if="imp.skipped.length">
              <summary>{{ `Skipped rows (${imp.skipped.length})` }}</summary>
              <ul><li v-for="x in imp.skipped" :key="x.row">{{ `Row ${x.row}: ${x.why}${x.text ? ' · ' + x.text : ''}` }}</li></ul>
            </details>
            <details class="imp-box" v-if="imp.already.length">
              <summary>{{ `Already in the PMS, not imported again (${imp.already.length})` }}</summary>
              <ul><li v-for="x in imp.already" :key="x.row">{{ `Row ${x.row}: ${x.date} · RM ${x.amount.toFixed(2)} · ${x.guest}` }}</li></ul>
            </details>
            <details class="imp-box" v-if="imp.repeats.length">
              <summary>{{ `Repeated in the file, only the first is imported (${imp.repeats.length})` }}</summary>
              <ul><li v-for="x in imp.repeats" :key="x.row">{{ `Row ${x.row} repeats row ${x.of}: ${x.date} · RM ${x.amount.toFixed(2)} · ${x.guest}` }}</li></ul>
            </details>
            <p class="help" v-if="imp.busy">{{ imp.busy }}</p>
          </template>
          <div class="modal-foot">
            <button type="button" class="btn" @click="imp = null" :disabled="!!imp.busy">{{ imp.done ? 'Close' : 'Cancel' }}</button>
            <button type="button" class="btn btn-primary" v-if="!imp.done" :title="imp.list ? '' : 'Choose the file first'" :disabled="!imp.list || !!imp.busy || !impRows.length || impPending > 0" @click="runImport">
              {{ !imp.list ? 'Import' : imp.busy ? 'Importing…' : `Import ${impRows.length} payments` }}</button>
          </div>
        </div>
      </div>
    </template>

    <!-- 25 Nov 2026 (Khairul): a group booking's payment: one payment, the units inside it; a unit opens its own record -->
    <template v-if="gView">
      <div class="modal-back" @click.self="gKey = ''" v-esc="() => { gKey = '' }">
        <div class="modal view-modal" role="dialog" aria-label="Group offline payment">
          <div class="v-head">
            <div><div class="v-title">Offline payment · group booking</div><div class="v-sub">{{ `${gView.date} · submitted by ${gView.submittedByName || '—'}` }}</div></div>
            <div class="v-status" v-if="canEdit"><OptionPicker class="fld-pick" :model-value="gView.status" :options="statusOptions(gView.status === 'Mixed' ? '' : gView.status)" label="Status" @update:modelValue="v => setStatus(gView, v)" /></div>
            <span class="tag" v-else :class="'st-' + (gView.status || '').toLowerCase()">{{ gView.status }}</span>
          </div>
          <p class="help" v-if="gView.status === 'Mixed'">The units have different statuses. Choosing a status sets it on every unit.</p>
          <div class="v-amount"><span>{{ `Total for ${gView.members.length} units` }}</span><b>{{ money(gView.amount) }}</b></div>
          <div class="g-units">
            <button type="button" class="g-unit" v-for="m in gView.members" :key="m.id" @click="gKey = ''; openRow(m)">
              <span class="g-u-main"><b>{{ m.unitCode || '—' }}</b><small>{{ [m.bookingNo, m.propertyName].filter(Boolean).join(' · ') }}</small>
                <small v-if="viewParts(m).length">{{ viewParts(m).map(x => `${x.label.replace(' (kept apart from the rent)', '')} ${money(x.amount)}`).join(' · ') }}</small></span>
              <span class="g-u-side"><b>{{ money(m.amount) }}</b><span class="tag" :class="'st-' + (m.status || '').toLowerCase()">{{ m.status }}</span></span>
            </button>
          </div>
          <p class="help">Click a unit to see or edit its part of the payment.</p>
          <div class="v-grid">
            <div class="v-item"><span>Guest / tenant</span><b>{{ gView.guest || '—' }}</b></div>
            <div class="v-item"><span>Payment method</span><b>{{ gView.mode || '—' }}</b></div>
            <div class="v-item"><span>Bank reference</span><b>{{ gView.bankRef || '—' }}</b></div>
            <div class="v-item"><span>Documents</span><b><a v-if="gView.docsLink" :href="gView.docsLink" target="_blank" rel="noopener">Open link</a><template v-else>None</template></b></div>
            <div class="v-item v-purpose"><span>Purpose</span><b class="pre">{{ gView.purpose || '—' }}</b></div>
            <div class="v-item v-purpose"><span>Payment code</span><b>{{ gView.remarks || '—' }}</b></div>
          </div>
          <!-- 25 Nov 2026 (Khairul): the payment slip, uploaded once for the whole group (filed under the first unit's record) -->
          <DriveFiles class="v-files" kind="offline-payments" :record-id="slipId(gView)" :label="nameOf(gView)" :readonly="!canEdit" :key="gView.id" @folder="l => gView.members.forEach(m => saveFolder(m, l))" />
          <div class="modal-foot"><button type="button" class="btn" @click="gKey = ''">Close</button></div>
        </div>
      </div>
    </template>

    <template v-if="open">
      <div class="modal-back" @click.self="closeNew" v-esc="closeNew">
        <!-- 23 Nov 2026 (Khairul): back to the simple flat form; "Payment for" picks Rental or Utilities (one part per payment).
             Rental shows Amount (+ For month with a booking); Utilities shows the booking's bills to tick. Old combined payments still open. -->
        <form class="modal new-pay" role="dialog" aria-label="New offline payment" @submit.prevent="tab === 'group' ? submitGroup() : submit()" novalidate @wheel.capture="noWheel">
          <div class="card-head np-top"><h2 style="margin:0">New offline payment</h2><button type="button" class="icon-btn" aria-label="Close" @click="closeNew">×</button></div>
          <!-- 25 Nov 2026 (Khairul): Group booking tab: one transfer for several units booked together (same groupId) -->
          <div class="np-tabs" role="tablist" aria-label="Payment for" v-if="canEdit">
            <button type="button" role="tab" :aria-selected="String(tab === 'single')" :class="{ on: tab === 'single' }" @click="tab = 'single'">Single booking</button>
            <button type="button" role="tab" :aria-selected="String(tab === 'group')" :class="{ on: tab === 'group' }" @click="tab = 'group'; if (f.status === 'Unknown') f.status = 'Pending'">Group booking</button>
          </div>
          <div class="notice error" ref="newErr" v-show="formError">{{ formError }}</div>
          <div class="grid" v-if="tab === 'group'">
            <div class="op-sep wide op-sep-first"><span>Payment</span></div>
            <div class="field"><label class="req">Status</label>
              <OptionPicker class="fld-pick" v-model="f.status" :options="newStatusOptions.filter(o => o.value !== 'Unknown')" label="Status" /></div>
            <FormField label="Payment Date" req type="date" v-model="f.date" />
            <div class="field"><label class="req">Payment method</label>
              <OptionPicker class="fld-pick" v-model="f.mode" :options="MODES" label="Payment method" /></div>
            <FormField v-if="f.mode !== 'Cash'" label="Bank reference" v-model="f.bankRef" placeholder="Reference no. on the bank slip" />

            <div class="op-sep wide"><span>Group booking</span></div>
            <div class="field wide"><div class="lbl-row"><label class="req" for="opGroup">Group</label>
                <span class="link-line" v-if="f.groupId">{{ `Group ${groupNo(f.groupId)}` }} <button type="button" class="link-btn" @click="unlinkGroup">Change</button></span>
                <span class="link-line muted" v-else-if="bkNote">{{ bkNote }}</span></div>
              <ComboInput id="opGroup" v-model="f.groupSearch" :options="groupOptions" :max="80" placeholder="Search by group id, booking no., tenant or unit" empty-text="No group booking matches." @pick="pickGroup" /></div>
            <template v-if="f.groupId">
              <!-- 25 Nov 2026 (Khairul): Rental, Utilities and Charges, each with a "same for all units" switch -->
              <section class="gp-sec wide">
                <div class="gp-sec-head"><b>Rental</b><label class="gp-tgl"><span class="tgl"><input type="checkbox" role="switch" v-model="f.gSameRent" @change="groupPurpose()" aria-label="Same amount for all units"><span class="tgl-track"></span></span>Same amount for all units</label></div>
                <div class="gp-2">
                  <div class="field"><label :class="{ req: groupSum('rent') > 0 }">For month</label>
                    <OptionPicker class="fld-pick" v-model="f.forMonth" :options="groupMonthOpts" label="For month" @change="groupPurpose()" /></div>
                  <FormField v-if="f.gSameRent" label="Rental per unit (RM)" type="number" min="0" step="0.01" placeholder="0.00" v-model="f.gRent" @input="groupPurpose()" />
                </div>
                <div class="gp-list" v-if="!f.gSameRent">
                  <div class="gp-line" v-for="r in f.groupRows" :key="'r' + r.id"><span><b>{{ r.unitCode }}</b><small>{{ [r.bookingNo, r.due > 0 ? `rent ${money(r.due)}` : ''].filter(Boolean).join(' · ') }}</small></span>
                    <input class="input gp-amt" type="number" min="0" step="0.01" placeholder="0.00" v-model="r.amount" :aria-label="`Rental for ${r.unitCode}`" @input="groupPurpose()"></div>
                </div>
                <button type="button" class="link-btn gp-link" @click="fillGroupRent">{{ f.gSameRent ? "Use the first unit's rent" : "Fill each unit's rent" }}</button>
              </section>

              <section class="gp-sec wide">
                <div class="gp-sec-head"><b>Utilities</b><label class="gp-tgl"><span class="tgl"><input type="checkbox" role="switch" v-model="f.gSameBills" @change="groupPurpose()" aria-label="Same bill dates for all units"><span class="tgl-track"></span></span>Same bill dates for all units</label></div>
                <p class="help" v-if="f.groupRows.some(r => r.bills === undefined)">Loading the utility bills…</p>
                <template v-else-if="f.gSameBills">
                  <p class="help" v-if="!groupPeriods.length">No unpaid utility bills on these bookings.</p>
                  <label class="gp-tick" v-for="pd in groupPeriods" :key="pd.key">
                    <input type="checkbox" :checked="!!f.gPeriods[pd.key]" @change="f.gPeriods = { ...f.gPeriods, [pd.key]: $event.target.checked }; groupPurpose()">
                    <span><b>{{ pd.key }}</b><small>{{ `${pd.units} of ${f.groupRows.length} units · ${money(pd.total)} unpaid` }}</small></span></label>
                </template>
                <div class="gp-list" v-else>
                  <div class="gp-unit" v-for="r in f.groupRows" :key="'u' + r.id"><div class="gp-unit-head"><b>{{ r.unitCode }}</b><small>{{ r.bookingNo }}</small></div>
                    <p class="help" v-if="r.bills === null">The bills can't be read.</p>
                    <p class="help" v-else-if="!r.bills.length">No unpaid bills.</p>
                    <label class="gp-tick" v-for="bl in r.bills || []" :key="bl.id">
                      <input type="checkbox" :checked="!!r.ticks[bl.id]" @change="r.ticks = { ...r.ticks, [bl.id]: $event.target.checked }; groupPurpose()">
                      <span><b>{{ datesText(bl) }}</b><small>{{ `${money(bl.left)} unpaid` }}</small></span></label>
                  </div>
                </div>
                <!-- 25 Nov 2026 (Khairul): a bill not in the PMS yet: made here on each unit's booking and paid by this payment -->
                <div class="gp-new" v-if="!f.groupRows.some(r => r.bills === undefined)">
                  <label class="gp-tick"><input type="checkbox" v-model="f.gNew.on" @change="groupPurpose()">
                    <span><b>Add a new bill and pay it</b><small>For a bill not in the PMS yet. It is saved on each unit's booking and paid by this payment.</small></span></label>
                  <template v-if="f.gNew.on">
                    <!-- 25 Nov 2026 (Khairul): same layout as the single payment's new bill: Electricity / Water / Sewerage, each with its own dates and amount, plus a bill photo -->
                    <template v-for="r in f.groupRows" :key="'n' + r.id">
                      <div class="up-add" v-if="r.nb.on">
                        <div class="up-add-head"><b>{{ `New bill · ${r.unitCode}` }} <small class="muted">{{ r.bookingNo }}</small></b><button type="button" class="link-btn" @click="r.nb.on = false; groupPurpose()">Remove</button></div>
                        <p class="help" v-if="nbFollows(r)" style="margin:0 0 6px">{{ `Dates follow ${nbLead.unitCode} (Same bill dates for all units is on).` }}</p>
                        <div class="up-line" v-for="k in KINDS" :key="k.key">
                          <span class="up-kind">{{ k.label }}</span>
                          <input class="input" type="date" :value="nbDate(r, k.key + 'From')" @input="r.nb[k.key + 'From'] = $event.target.value; groupPurpose()" :disabled="nbFollows(r)" :aria-label="`${k.label} from, ${r.unitCode}`">
                          <input class="input" type="date" :value="nbDate(r, k.key + 'To')" @input="r.nb[k.key + 'To'] = $event.target.value; groupPurpose()" :disabled="nbFollows(r)" :aria-label="`${k.label} to, ${r.unitCode}`">
                          <input class="input up-amt" type="number" min="0" step="0.01" placeholder="0.00" v-model="r.nb[k.key]" :aria-label="`${k.label} amount (RM), ${r.unitCode}`" @input="groupPurpose()">
                        </div>
                        <div class="field"><label>Bill photo <span class="muted">(optional, goes to the bill's Drive folder, not the payment receipts)</span></label>
                          <DriveFiles :key="r.nb.id" kind="utility-bills" :record-id="r.nb.id" :list-on-load="false" :label="[r.bookingNo, r.unitCode].filter(Boolean).join(' ')" @folder="l => r.nb.driveFolder = l" /></div>
                      </div>
                      <button type="button" class="link-btn up-addbtn" v-else @click="r.nb.on = true; groupPurpose()">{{ `+ Add bill for ${r.unitCode}` }}</button>
                    </template>
                    <p class="help" style="margin:0">Leave a unit's amounts empty, or press Remove, if it has no new bill.</p>
                  </template>
                </div>
              </section>

              <section class="gp-sec wide">
                <div class="gp-sec-head"><b>Charges</b><span class="muted gp-sub">kept apart from the rent</span><label class="gp-tgl"><span class="tgl"><input type="checkbox" role="switch" v-model="f.gSameCharge" @change="groupPurpose()" aria-label="Same charge for all units"><span class="tgl-track"></span></span>Same charge for all units</label></div>
                <div class="gp-2" v-if="f.gSameCharge">
                  <FormField label="Charge per unit (RM)" type="number" min="0" step="0.01" placeholder="0.00" v-model="f.gCharge" @input="groupPurpose()" />
                  <FormField label="What for" :req="+f.gCharge > 0" v-model="f.groupChargeNote" placeholder="e.g. Cleaning fee, key replacement" @input="groupPurpose()" />
                </div>
                <div class="gp-list" v-else>
                  <div class="gp-line gp-line3" v-for="r in f.groupRows" :key="'c' + r.id"><span><b>{{ r.unitCode }}</b><small>{{ r.bookingNo }}</small></span>
                    <input class="input gp-amt" type="number" min="0" step="0.01" placeholder="0.00" v-model="r.charges" :aria-label="`Charge for ${r.unitCode}`" @input="groupPurpose()">
                    <input class="input" v-model="r.chargeNote" maxlength="1000" placeholder="What for" :aria-label="`What the charge for ${r.unitCode} is for`" @input="groupPurpose()"></div>
                </div>
              </section>

              <!-- the summary: what each unit's payment line will hold -->
              <div class="wide gp-table">
                <div class="gp-row gp-head"><span>Unit</span><span class="r">Rental</span><span class="r">Utilities</span><span class="r">Charges</span><span class="r">Total</span></div>
                <div class="gp-row" v-for="r in f.groupRows" :key="r.id">
                  <span><b>{{ r.unitCode }}</b><small>{{ [r.bookingNo, r.stay === 'Awaiting payment' ? 'Awaiting payment' : ''].filter(Boolean).join(' · ') }}</small></span>
                  <span class="r">{{ money(rentOf(r)) }}</span><span class="r">{{ money(utilOf(r)) }}</span><span class="r">{{ money(chargeOf(r)) }}</span><span class="r"><b>{{ money(rowTotal(r)) }}</b></span>
                </div>
                <div class="gp-row gp-foot"><span>{{ `Total for ${f.groupRows.length} units` }}</span><span class="r">{{ money(groupSum('rent')) }}</span><span class="r">{{ money(groupSum('util')) }}</span><span class="r">{{ money(groupSum('charge')) }}</span><span class="r gp-all">{{ money(groupTotal) }}</span></div>
              </div>
              <p class="help wide" style="margin:0">Each unit's booking gets its own payment line (units with nothing are skipped). Ticked bills are paid in full. The receipt, method, date and reference are shared.</p>
            </template>

            <div class="op-sep wide"><span>Details</span></div>
            <div class="field wide"><label class="req">Purpose</label><textarea class="input purpose-box purpose-new gp-purpose" rows="4" maxlength="1000" v-model="f.purpose" placeholder="e.g. Rental for November, 3 units"></textarea></div>
            <div class="field wide"><label class="req">Receipts / documents</label><DriveFiles kind="offline-payments" :record-id="newId" :label="[f.date, groupNo(f.groupId), f.guest].filter(Boolean).join(' ')" :list-on-load="false" @folder="l => f.docsLink = l" /></div>
            <div class="field wide" v-if="f.status === 'Checked'"><label class="req">Payment code</label><input class="input" v-model="f.remarks"></div>
          </div>
          <div class="grid" v-else>
            <!-- 23 Nov 2026 (Khairul): light separators: Payment, Booking, Amount, Details -->
            <div class="op-sep wide op-sep-first"><span>Payment</span></div>
            <div class="field"><label class="req">Status <span class="muted">(Unknown = no receipt)</span></label>
              <OptionPicker class="fld-pick" v-model="f.status" :options="newStatusOptions" label="Status" /></div>
            <FormField label="Payment Date" req type="date" v-model="f.date" />
            <p class="help wide" v-if="f.status === 'Unknown'">Unknown only needs the date and amount. Operations can fill in the rest later.</p>
            <FormField v-if="f.status === 'Unknown'" label="Amount (RM)" req type="number" min="0" step="0.01" v-model="f.amount" placeholder="0.00" />
            <template v-if="f.status !== 'Unknown'">
              <div class="field"><label class="req">Payment method</label>
                <OptionPicker class="fld-pick" v-model="f.mode" :options="MODES" label="Payment method" /></div>
              <!-- 23 Nov 2026 (Khairul): no bank reference for Cash -->
              <FormField v-if="f.mode !== 'Cash'" label="Bank reference" v-model="f.bankRef" placeholder="Reference no. on the bank slip" />

              <div class="op-sep wide"><span>Booking</span></div>
              <!-- 19 Nov 2026 (Khairul): pick a booking (fills property, unit, name and links the payment to it), or type any name -->
              <div class="field wide"><div class="lbl-row"><label class="req" for="opGuest">Guest / tenant name</label>
                  <span class="link-line" v-if="f.bookingId">{{ `Booking ${f.bookingNo}` }} <button type="button" class="link-btn" @click="unlinkBooking">Unlink</button></span>
                  <span class="link-line muted" v-else-if="bkNote">{{ bkNote }}</span></div>
                <ComboInput id="opGuest" v-model="f.guest" :options="bookingOptions" :max="80" placeholder="Search bookings or type the name" empty-text="No booking matches. What you typed is kept as it is." @pick="pickBooking" /></div>
              <div class="field"><label class="req">Property</label>
                <PropertyPicker block class="fld-pick" v-model="f.propertyId" :properties="properties" :before="[{ value: '', label: 'Choose property' }]" @change="changeProperty" /></div>
              <div class="field"><label class="req">Unit</label>
                <OptionPicker class="fld-pick" v-model="f.unitCode" :disabled="!f.propertyId" :options="[{ value: '', label: 'Choose unit' }, ...units.map(x => ({ value: x.unitCode, label: x.unitCode }))]" label="Unit" searchable /></div>

              <div class="op-sep wide"><span>Amount</span></div>
              <!-- 24 Nov 2026 (Khairul): one or more payment lines ("+ Add another payment type"): Rental (one line per month),
                   Utilities (one line, the booking's bills) and Charges (kept apart from the rent). One receipt and status for all. -->
              <PaymentLines class="wide" :lines="f.lines" :u="f.u" :booked="!!f.bookingId" :month-opts="monthOptions(f.bookingMonths, f.monthNotes)" :can-edit="canEdit"
                :label="`${f.unitCode || ''} ${f.bookingNo || ''} utility`.trim()" />

              <div class="op-sep wide"><span>Details</span></div>
              <div class="field wide"><label class="req">Purpose</label><textarea class="input purpose-box purpose-new" rows="3" maxlength="1000" v-model="f.purpose" placeholder="e.g. Rental, security deposit. Long notes are fine, e.g. Deposit = RM2000, Rental = RM2200, Total = RM4200; (-) Payroll = RM3050; Balance = RM950"></textarea></div>
              <div class="field wide"><label class="req">Receipts / documents</label><DriveFiles kind="offline-payments" :record-id="newId" :label="nameOf(f)" :list-on-load="false" @folder="l => f.docsLink = l" /></div>
              <!-- 19 Nov 2026: Payment code is filled when checking, so it shows only once the status is Checked -->
              <div class="field wide" v-if="f.status === 'Checked'"><label class="req">Payment code</label><input class="input" v-model="f.remarks"></div>
            </template>
          </div>
          <div class="modal-foot">
            <button type="button" class="btn" @click="closeNew">Cancel</button>
            <button type="submit" class="btn btn-primary" :disabled="busy">{{ busy ? 'Saving…' : 'Submit' }}</button>
          </div>
        </form>
      </div>
    </template>

    <!-- 24 Nov 2026 (Khairul): picking Checked on a payment with no payment code asks for it here; code and status save together -->
    <div class="modal-back" v-if="chk" @click.self="chk.busy || (chk = null)" v-esc="() => { if (!chk.busy) chk = null }">
      <form class="modal chk-modal" role="dialog" aria-labelledby="chkTitle" @submit.prevent="confirmChecked" novalidate>
        <h2 id="chkTitle">Mark as Checked</h2>
        <p class="help">{{ `${chk.r.guest || 'This payment'} · RM ${Number(chk.r.amount || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. Enter the payment code from the bank statement to mark it Checked.` }}</p>
        <div class="field"><label class="req" for="chkCode">Payment code</label>
          <input class="input" id="chkCode" ref="chkCode" v-model="chk.code" maxlength="300" autocomplete="off" placeholder="e.g. MB 30/10/26/NAME /200.00"></div>
        <div class="notice error" v-show="chk.error">{{ chk.error }}</div>
        <div class="modal-foot">
          <button type="button" class="btn" :disabled="chk.busy" @click="chk = null">Cancel</button>
          <button type="submit" class="btn btn-primary" :disabled="chk.busy || !chk.code.trim()">{{ chk.busy ? 'Saving…' : 'Mark Checked' }}</button>
        </div>
      </form>
    </div>
  </main>
</template>

<script>
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where, writeBatch, serverTimestamp, Timestamp } from 'firebase/firestore';
import { SHEET as IMPORT_SHEET, parseSheet, matchRows, sameKey, nameFromEmail, norm, unitKey, unitIndex, similarUnits, guessProperty, cleanCode } from '@/lib/offline-import.js';   // ONE-TIME import
import { saveUnit, forgetUnits } from '@/lib/portfolio-data.js';
import { unitIdOf } from '@/lib/engine.js';
import { db } from '@/lib/firebase.js';
import { useSession } from '@/stores/session.js';
import { stateFor } from '@/lib/states.js';
import { scopedOrBlank, getScoped } from '@/lib/property-scope.js';
import { can } from '@/lib/access.js';
import { toast } from '@/lib/toast.js';
import { askConfirm } from '@/lib/confirm.js';
import FormField from '@/components/FormField.vue';
import OptionPicker from '@/components/OptionPicker.vue';
import PropertyPicker from '@/components/PropertyPicker.vue';
import Paged from '@/components/Paged.vue';
import DriveFiles from '@/components/DriveFiles.vue';
import { loadProperties, loadUnits, audit, friendlyError, loadXlsxLib, download, toCSV } from '@/lib/finance-data.js';
import MonthPicker from '@/components/MonthPicker.vue';
import { notifyRole, notifyUser } from '@/services/notificationService.js';
import { monthOffset, monthName } from '@/lib/format.js';
import ComboInput from '@/components/ComboInput.vue';
import { payCounts, rentalParts } from '@/lib/booking-pay.js';
import PaymentLines from '@/components/PaymentLines.vue';
import { leaseMonths, leaseSlot, leaseSpan } from '@/lib/booking-invoice.js';   // 24 Nov 2026: lease months
import { loadGuestName } from '@/lib/portfolio-data.js';
import { scoped } from '@/lib/property-scope.js';
import { liveMixin } from '@/lib/use-live.js';
import UtilityPart from '@/components/UtilityPart.vue';
import { loadAllBookings, guestNames, forgetBookings } from '@/lib/booking-search.js';
import { spread, KINDS, linesText } from '@/lib/utility-bills.js';
import { r2, money, loadBills, blankUtil, utilAlloc, utilMax, utilPool, addLines, addTotal, linesProblem, newBill, linkBills, partsOf, purposeText, datesText, billOf, refillUtil, oldestFirst, newPayLine } from '@/lib/utility-bills.js';
import { withState } from '@/lib/states.js';
import LiveStatus from '@/components/LiveStatus.vue';

// 25 Nov 2026: OTA (paid through the booking site), as on the booking form
const MODES = ['OTA', 'Bank transfer', 'Cash', 'Card', 'Online banking / QR', 'Cheque', 'Other'].map(x => ({ value: x, label: x })); MODES.unshift({ value: '', label: 'Choose method' });
const STATUSES = ['Checked', 'Pending', 'Unknown', 'Edited'];   // Edited is set by saving an Unknown payment, never picked
const STATUS_OPTS = [{ value: '', label: 'All' }, ...STATUSES.map(s => ({ value: s, label: s }))];
const today = () => new Date().toISOString().slice(0, 10);
// Table or cards, remembered on this browser only (table when nothing is saved)
const LAYOUT_KEY = 'offlinePayments:layout';
const savedLayout = () => { try { return localStorage.getItem(LAYOUT_KEY) === 'cards' ? 'cards' : 'table'; } catch { return 'table'; } };
// Every month from one date's month to another's (YYYY-MM), at most 60
const monthsBetween = (a, b) => {
  if (!/^\d{4}-\d{2}/.test(a || '')) return [];
  const out = [], last = /^\d{4}-\d{2}/.test(b || '') ? b.slice(0, 7) : a.slice(0, 7);
  let [y, m] = a.slice(0, 7).split('-').map(Number);
  for (let i = 0; i < 60; i++) { const k = `${y}-${String(m).padStart(2, '0')}`; if (k > last) break; out.push(k); if (++m > 12) { m = 1; y++; } }
  return out;
};
// 23 Nov 2026: rental (Rental tab), u (Utilities tab, lib/utility-bills.js blankUtil); amount is only typed for Unknown payments
const blank = () => ({ gNew: { on: false }, gSameRent: true, gRent: '', gSameBills: true, gPeriods: {}, gSameCharge: true, gCharge: '', groupChargeNote: '', groupId: '', groupSearch: '', groupRows: [], groupMonths: [], groupLabels: {}, groupAuto: '', date: today(), amount: '', lines: [newPayLine()], u: blankUtil(), lastAuto: '', propertyId: '', unitCode: '', guest: '', purpose: '', mode: '', bankRef: '', docsLink: '', status: 'Pending', remarks: '', bookingId: '', bookingNo: '', forMonth: '', bookingMonths: [], monthNotes: {}, monthLabels: {} });

export default {
  popups: { ok: 'done' },   // 16 Nov 2026: its messages show as corner popups (lib/page-popups.js)
  mixins: [liveMixin],
  components: { PropertyPicker, FormField, OptionPicker, Paged, DriveFiles, MonthPicker, LiveStatus, ComboInput, UtilityPart, PaymentLines },
  data() { return { KINDS, MODES, STATUSES, STATUS_OPTS, rows: [], hist: [], showHist: false, loading: true, q: '', from: '', to: '', month: '', rep: null, imp: null, pendingLink: '', status: '', open: false, tab: 'single', newId: '', view: null, gKey: '', chk: null, editing: false, ed: {}, f: blank(), activeBookings: [], names: guestNames, viewBills: {}, fSnap: '', bkNote: '', layout: savedLayout(), properties: [], units: [], busy: false, error: '', formError: '', done: '' }; },
  watch: {
    view(r) { this.loadHistory(r); this.loadViewBills(r); },
    // 23 Nov 2026: the purpose fills itself from the Rental and Utilities tabs until it is typed over
    autoPurpose(v) { const f = this.f; if (!f.bookingId) return; if (!f.purpose.trim() || f.purpose === f.lastAuto) f.purpose = v; f.lastAuto = v; }
  },
  computed: {
    // 25 Nov 2026 (Khairul): group bookings (several units booked together, offlineBookings.groupId), one row per group
    groupOptions() {
      const by = {};
      this.activeBookings.filter(b => b.groupId).forEach(b => { (by[b.groupId] ||= []).push(b); });
      return Object.entries(by).map(([gid, list]) => {
        const l = [...list].sort((a, b) => String(a.bookingNo || '').localeCompare(String(b.bookingNo || ''))), b0 = l[0], live = l.filter(x => x.stay !== 'Cancelled');
        return { key: gid, value: this.names[b0.id] || b0.bookingNo || gid, dim: !live.length,
          hint: [`Group ${this.groupNo(gid)}`, l.map(x => x.bookingNo || x.id).join(', '), l.map(x => x.unitCode || x.unitId).join(', '), b0.propertyName, `${b0.arrival} to ${b0.departure}`, `${live.length} unit${live.length === 1 ? '' : 's'}`].filter(Boolean).join(' · ') };
      });
    },
    nbLead() { return (this.f.groupRows || []).find(r => r.nb && r.nb.on) || null; },
    groupTotal() { return r2(this.groupSum('rent') + this.groupSum('util') + this.groupSum('charge')); },
    // Same bill dates for all units: the unpaid bills grouped by their dates ("29/09–29/10"), ticked once for every unit
    groupPeriods() {
      const by = {};
      (this.f.groupRows || []).forEach(r => (r.bills || []).forEach(b => { const k = datesText(b), p = by[k] ||= { key: k, units: new Set(), total: 0, from: '' };
        p.units.add(r.id); p.total = r2(p.total + b.left); const fr = (b.lines || []).map(l => l.from).filter(Boolean).sort()[0] || ''; if (!p.from || fr < p.from) p.from = fr; }));
      return Object.values(by).map(p => ({ ...p, units: p.units.size })).sort((a, b) => a.from.localeCompare(b.from));
    },
    groupMonthOpts() {
      const f = this.f, list = f.groupMonths || [];
      return [{ value: '', label: 'Choose month' }, ...list.map(m => ({ value: m, label: f.groupLabels[m] || monthName(m) }))];
    },
    // The Guest / tenant suggestions: every booking this person may see (23 Nov 2026), with its stay status
    bookingOptions() {
      return this.activeBookings.map(b => ({ key: b.id, value: this.names[b.id] || b.bookingNo || b.id, dim: b.stay === 'Cancelled',
        hint: [b.bookingNo, b.unitCode || b.unitId, b.propertyName, `${b.arrival} to ${b.departure}`, b.stay].filter(Boolean).join(' · ') }));
    },
    // Operations (no Offline Payments Edit tick) record utility payments as Pending (rules Draft 1.03)
    canPayUtil() { const me = useSession(); return can(me, 'bookingForms.view') || can(me, 'offlineInquiries.view'); },
    newStatusOptions() { return this.canEdit ? this.statusOptions('') : [{ value: 'Pending', label: 'Pending' }]; },
    // 24 Nov 2026 (Khairul): the purpose lists every line (Rental per month, Utilities bills, Charges with what for)
    autoPurpose() {
      const f = this.f, ut = !!f.bookingId && f.lines.some(x => x.type === 'utilities'), pool = utilPool(f.u), alloc = ut ? utilAlloc(f.u) : [];
      return purposeText({ rentals: f.lines.filter(x => x.type === 'rental').map(x => ({ amount: x.amount, forMonth: x.forMonth })), utilities: ut ? f.u.amount : 0,
        bills: alloc.map(a => pool.find(b => b.id === a.billId)).filter(Boolean), charges: f.lines.filter(x => x.type === 'charges').map(x => ({ amount: x.amount, note: String(x.note || '').trim() })) }, monthName);
    },
    // Edit: For month list (12 months either side of the payment date, plus every month already on its lines)
    editMonthOpts() {
      const list = this.monthsAround(this.ed.date, '');
      (this.ed.lines || []).forEach(x => { if (x.forMonth && !list.includes(x.forMonth)) list.push(x.forMonth); });
      return this.monthOptions(list.sort());
    },
    isDirector() { return ['director', 'branchDirector'].includes(useSession().role); },
    // ---- ONE-TIME import (18 Nov 2026) ----
    impRows() { return this.imp?.list ? matchRows(this.imp.list, this.properties, this.imp.allUnits, this.imp.choice, this.imp.map) : []; },
    impPending() { return this.impRows.filter(r => r.how === 'pending').length; },
    impFound() { return this.impRows.filter(r => r.how === 'found').length; },
    impTotal() { return this.impRows.reduce((a, r) => a + r.amount, 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); },
    // Payments with no unit in the sheet whose property name is not a PMS property: one line per name
    impNames() {
      if (!this.imp?.list) return [];
      const m = new Map();
      matchRows(this.imp.list.filter(r => !unitKey(r.unitCode)), this.properties, [], {}, {}).filter(r => r.how === 'pending')
        .forEach(r => { const k = norm(r.sheetProperty), g = m.get(k) || { key: k, name: r.sheetProperty, count: 0 }; g.count++; m.set(k, g); });
      return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
    },
    // The units the import will create (one per property and code), skipping any that already exist
    impNewUnits() {
      const have = new Set((this.imp?.allUnits || []).map(u => u.id)), m = new Map();
      this.impRows.filter(r => r.how === 'new').forEach(r => { const id = unitIdOf(r.propertyId, r.unitCode); if (!have.has(id) && !m.has(id)) m.set(id, { id, code: r.unitCode, propertyId: r.propertyId, propertyName: r.propertyName }); });
      return [...m.values()];
    },
    // View and Edit are separate ticks on Staff accounts: View reads the page, Edit also creates and changes payments
    canEdit() { return can(useSession(), 'offlinePayments.edit'); },
    yearOptions() { const y = new Date().getFullYear(); return Array.from({ length: 5 }, (_, i) => ({ value: String(y - i), label: String(y - i) })); },
    // 25 Nov 2026 (Khairul): a group booking's payment shows as ONE payment in the list. It is still saved as one record per
    // unit (each unit's booking reads its own), joined by groupPayId (older ones: same group, date and receipt folder).
    listRows() {
      const by = new Map(), out = [];
      this.rows.forEach(r => {
        const k = r.groupPayId || (r.groupId && r.docsLink ? `${r.groupId}|${r.date}|${r.docsLink}` : '');
        if (!k) { out.push(r); return; }
        if (!by.has(k)) { const g = { id: 'grp_' + k, isGroup: true, members: [] }; by.set(k, g); out.push(g); }
        by.get(k).members.push(r);
      });
      // 25 Nov 2026 (Khairul): newest created first (several property queries are merged, so sort here); payments imported
      // together share a created time, so those go by payment date, newest first
      // Imported rows were stamped with the payment date as it was in the sheet; a date fixed later (or a mistyped future year)
      // left that stamp behind, so imported rows (and any stamp in the future) go by the payment date as it is now.
      const byDate = r => Date.parse(`${r.date || '1970-01-01'}T12:00:00+08:00`) || 0, soon = Date.now() + 864e5;
      const at = r => {
        if (r.createdAt === null) return 9e15;   // just saved, not stamped yet
        const ms = r.createdAt?.toMillis?.() || (r.createdAt?.seconds ? r.createdAt.seconds * 1000 : 0);
        return r.source === 'excel-import' || ms > soon ? byDate(r) : ms;
      };
      return out.map(g => {
        if (!g.isGroup) return g;
        const m = [...g.members].sort((a, b) => String(a.unitCode || '').localeCompare(String(b.unitCode || ''))), r0 = m[0];
        if (m.length === 1) return r0;
        const st = new Set(m.map(x => x.status)), props = [...new Set(m.map(x => x.propertyName).filter(Boolean))];
        return { ...r0, id: g.id, isGroup: true, members: m, amount: r2(m.reduce((t, x) => t + (Number(x.amount) || 0), 0)),
          parts: m.flatMap(x => (Array.isArray(x.parts) && x.parts.length ? x.parts : [{ type: 'rental', amount: Number(x.amount) || 0 }])),
          propertyName: props.join(', '), unitCode: `${m.length} units: ${m.map(x => x.unitCode).filter(Boolean).join(', ')}`,
          bookingNo: m.map(x => x.bookingNo).filter(Boolean).join(', '), status: st.size === 1 ? r0.status : 'Mixed',
          remarks: [...new Set(m.map(x => x.remarks).filter(Boolean))].join(', ') };
      }).sort((x, y) => at(y) - at(x) || String(y.date || '').localeCompare(String(x.date || '')));
    },
    gView() { return this.gKey ? this.listRows.find(r => r.id === this.gKey) || null : null; },
    shown() {
      const q = this.q.trim().toLowerCase();
      return this.listRows.filter(r => (!this.status || r.status === this.status) && (!this.from || r.date >= this.from) && (!this.to || r.date <= this.to)
        && (!q || [r.guest, r.propertyName, r.unitCode, r.bankRef, r.submittedByName, r.purpose, r.bookingNo].some(v => String(v || '').toLowerCase().includes(q))));
    }
  },
  // 24 Nov 2026 (Khairul): leaving with a half-typed new payment asks first (closing the popup, another page, closing the tab)
  async beforeRouteLeave() {
    if (!this.newDirty()) return true;
    return askConfirm({ title: 'Leave this payment?', message: "What you've entered will be lost. Files already uploaded stay in Google Drive.", confirmText: 'Leave', danger: true });
  },
  unmounted() { window.removeEventListener('beforeunload', this.warnLeave); },
  async mounted() {
    window.addEventListener('beforeunload', this.warnLeave);
    await this.load();
    // 23 Nov 2026: a bill's "Record payment" on the booking opens the form on Utilities with that bill ticked
    const q = this.$route?.query || {};
    if (q.record && (this.canEdit || this.canPayUtil)) { this.openForm({ bookingId: String(q.record), billId: String(q.bill || '') }); this.$router.replace({ query: {} }); }
  },
  methods: {
    // What the new payment form holds, to tell if anything was typed since it opened
    snapOf(f) {
      return JSON.stringify([f.groupId, f.gNew, (f.groupRows || []).map(r => [r.amount, r.ticks, r.charges, r.chargeNote, r.nb]), f.gRent, f.gCharge, f.gPeriods, f.gSameRent, f.gSameBills, f.gSameCharge, f.groupChargeNote, f.date, f.amount, f.status, f.mode, f.bankRef, f.guest, f.propertyId, f.unitCode, f.purpose, f.docsLink, f.remarks, f.bookingId,
        (f.lines || []).map(x => [x.type, x.amount, x.forMonth, x.note]), r2(f.u?.amount), Object.keys(f.u?.ticks || {}).filter(k => f.u.ticks[k]).sort(), !!f.u?.add?.on]);
    },
    newDirty() { return this.open && !!this.fSnap && this.snapOf(this.f) !== this.fSnap; },
    warnLeave(e) { if (this.newDirty()) { e.preventDefault(); e.returnValue = ''; } },
    // Cancel, ×, Esc or a click outside: ask first when something was entered
    async closeNew() {
      if (this.busy) return;
      if (this.newDirty() && !await askConfirm({ title: 'Leave this payment?', message: "What you've entered will be lost. Files already uploaded stay in Google Drive.", confirmText: 'Leave', danger: true })) return;
      this.open = false;
    },
    niceDate(d) { if (!d) return ''; const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']; return `${+d.slice(8, 10)} ${M[+d.slice(5, 7) - 1] || ''} ${d.slice(0, 4)}`; },
    // A status card: show only that status; clicking the card that is already on shows them all again
    pickStatus(s) { this.status = this.status === s ? '' : s; },
    // The record a group's slip is filed under: the form's id (groupPayId); older ones, the first unit the form saved
    slipId(g) { const m = g.members || []; return g.groupPayId || [...m].sort((a, b) => String(a.bookingNo || '').localeCompare(String(b.bookingNo || ''), undefined, { numeric: true }))[0]?.id || m[0]?.id; },
    openRow(r) { if (r.isGroup) { this.gKey = r.id; return; } this.view = r; this.editing = false; this.pendingLink = ''; },
    setLayout(v) { this.layout = v; try { localStorage.setItem(LAYOUT_KEY, v); } catch { /* not remembered */ } },
    count(s) { return this.listRows.filter(r => r.status === s).length; },
    // Pickers offer the three statuses people choose; Edited only shows when the payment already has it
    statusOptions(cur) { return [...STATUSES.slice(0, 3), ...(cur === 'Edited' ? ['Edited'] : [])].map(s => ({ value: s, label: s })); },
    // Operations can fill in a payment with no receipt (status Unknown)
    opsEdit(r) { return useSession().role === 'operations' && r?.status === 'Unknown'; },   // even with the Edit tick: an Operations fill-in always becomes Edited
    pickMonth() {
      if (!this.month) { this.from = ''; this.to = ''; return; }
      const [y, m] = this.month.split('-').map(Number);
      this.from = `${this.month}-01`; this.to = `${this.month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
    },
    async tellOperations(p) {
      try { await notifyRole({ recipientRole: 'operations', type: 'payment', refId: p.id, link: '/Finance/offline-payments', title: 'Offline payment with no receipt',
        message: `RM ${Number(p.amount || 0).toFixed(2)} from ${p.guest}${p.unitCode ? ' (' + p.unitCode + ')' : ''} on ${p.date} has no receipt. Please add the details.` }); } catch (e) { console.error('Operations notification failed', e); }
    },
    async tellFinance(p, who) {
      try { await notifyRole({ recipientRole: 'finance', type: 'payment', refId: p.id, link: '/Finance/offline-payments', title: 'Offline payment changed from Unknown to Edited',
        message: `${who} filled in the details. Status changed from Unknown to Edited. RM ${Number(p.amount || 0).toFixed(2)} payment from ${p.guest}${p.unitCode ? ' (' + p.unitCode + ')' : ''}. Please check it.` }); } catch (e) { console.error('Accounting notification failed', e); }
    },
    // Live (6 Nov 2026): new payments and status changes show without a refresh (newest 500, as before).
    // Calling it again does nothing while the listener runs.
    load() {
      if (this.liveStops.list) return;
      // Only my properties' payments, plus Unknown ones not given a property yet (lib/property-scope.js)
      this.live('list', scopedOrBlank(query(collection(db, 'offlinePayments'), orderBy('createdAt', 'desc'), limit(1000))), rows => {
        this.rows = rows; this.loading = false; this.fillUnits();
      }, { order: ['createdAt', 'desc'], limit: 1000, onError: e => { this.error = e.friendly || friendlyError(e, 'load the offline payments'); this.loading = false; } });
    },
    // Booking Form payments made before the unit was saved on them: read the unit from the booking
    // What was added or changed on this payment, from the audit log (Finance and Director can read it)
    async loadHistory(r) {
      this.hist = []; this.showHist = false;
      if (!r?.id) return;
      try {
        const snap = await getDocs(query(collection(db, 'auditLog'), where('entity', '==', `offlinePayments/${r.id}`), limit(50)));
        const FIELD = { date: 'Payment date', amount: 'Amount', propertyId: 'Property', propertyName: 'Property', unitCode: 'Unit', guest: 'Guest', purpose: 'Purpose', bankRef: 'Bank reference', mode: 'Payment method', docsLink: 'Documents', status: 'Status', remarks: 'Payment code' };
        const val = v => (v === '' || v == null) ? 'blank' : (v === true ? 'yes' : String(v));
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.at?.toMillis?.() || 0) - (a.at?.toMillis?.() || 0));
        if (this.view?.id !== r.id) return;
        this.hist = list.map(h => ({ id: h.id, userName: h.userName || '', role: h.role || '',
          when: h.at?.toDate ? h.at.toDate().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '',
          what: h.action === 'offlinePayment.create' ? 'Added' : 'Edited',
          changes: (h.changes || []).filter(c => h.action === 'offlinePayment.create' || c.field !== 'propertyName').map(c => ({ text: h.action === 'offlinePayment.create' ? `${FIELD[c.field] || c.field}: ${val(c.new)}` : `${FIELD[c.field] || c.field}: ${val(c.old)} → ${val(c.new)}` })) }));
      } catch { /* not allowed to read the audit log, or offline: the history stays hidden */ }
    },
    async fillUnits() {
      // Each booking is read once and kept (the live list calls this on every change)
      const found = this.bookingUnits || (this.bookingUnits = {});
      const ids = [...new Set(this.rows.filter(r => !r.unitCode && r.bookingId && !(r.bookingId in found)).map(r => r.bookingId))];
      await Promise.all(ids.map(async id => { try { const b = await getDoc(doc(db, 'offlineBookings', id)); found[id] = b.exists() ? (b.data().unitCode || b.data().unitId || '') : ''; } catch { /* leave blank */ } }));
      if (!this.rows.some(r => !r.unitCode && found[r.bookingId])) return;
      this.rows = this.rows.map(r => (!r.unitCode && found[r.bookingId]) ? { ...r, unitCode: found[r.bookingId] } : r);
    },
    // opts (23 Nov 2026): { bookingId, billId } from a bill's "Record payment" on the booking: opens on Utilities with that bill ticked
    async openForm(opts = {}) {
      this.tab = 'single'; this.f = blank(); if (!this.canEdit) this.f.lines = [newPayLine('utilities')]; this.newId = doc(collection(db, 'offlinePayments')).id; this.units = []; this.formError = ''; this.open = true;
      this.fSnap = this.snapOf(this.f);
      const list = this.loadActiveBookings();
      if (!this.properties.length) { try { this.properties = await loadProperties(); } catch { this.formError = 'Could not load the property list.'; } }
      if (!opts.bookingId) return;
      await list;
      const b = this.activeBookings.find(x => x.id === opts.bookingId);
      if (!b) { this.formError = 'That booking was not found in your bookings.'; return; }
      await this.pickBooking({ key: b.id }, { billId: opts.billId, quiet: true });
      this.f.lines = [newPayLine('utilities')];
      for (let i = 0; i < 50 && this.f.u.bills === null; i++) await new Promise(r => setTimeout(r, 100));   // the bill ticks itself once loaded
      this.fSnap = this.snapOf(this.f);   // opened from a bill on the booking: what is filled in for them is not "typed"
    },
    // 23 Nov 2026 (Khairul): every booking this person may see (past, current, upcoming, Awaiting payment, cancelled), names filling in
    async loadActiveBookings() {
      this.bkNote = this.activeBookings.length ? '' : 'Loading bookings…';
      try { this.activeBookings = await loadAllBookings(); this.bkNote = this.activeBookings.length ? '' : 'No bookings found. Type the name.'; }
      catch { this.bkNote = 'Bookings could not be loaded. Type the name.'; }
    },
    r2, money, datesText,
    unpaidCount(u) { return (u.bills || []).filter(b => b.status !== 'paid').length; },
    utilTabText(f) {
      if (r2(f.u.amount) > 0 && f.bookingId) return money(f.u.amount);
      const n = (f.u.bills || []).filter(b => b.status !== 'paid').length;
      return n ? `${n} unpaid bill${n === 1 ? '' : 's'}` : '–';
    },
    // The booking's bills for the Utilities tab: unpaid / partly paid ones, plus the ones this payment already pays (edit)
    async loadBookingBills(b, u, tickId = '') {
      u.bills = null;
      const list = await loadBills(b);
      u.bills = list === null ? false : list.filter(x => x.status !== 'paid' || x.id in u.was).sort(oldestFirst);
      if (tickId && (u.bills || []).some(x => x.id === tickId)) u.ticks = { ...u.ticks, [tickId]: true };
      refillUtil(u);
    },
    // View: the dates of the bills a payment paid
    async loadViewBills(r) {
      this.viewBills = {};
      const ids = partsOf(r || {}).bills; if (!r || !Object.keys(ids).length) return;
      const out = {};
      await Promise.all(Object.keys(ids).map(async id => { try { const sn = await getDoc(doc(db, 'utilityBills', id)); if (sn.exists()) out[id] = billOf(id, sn.data()); } catch { /* not readable: the id shows */ } }));
      if (this.view?.id === r.id) this.viewBills = out;
    },
    // 24 Nov 2026: one row per line of the payment
    viewParts(r) {
      if (!Array.isArray(r.parts) || !r.parts.length) return [];
      return r.parts.map((x, i) => (x.type === 'utilities'
        ? { k: i, label: 'Utilities', amount: r2(x.amount), bills: (x.bills || []).map(b => ({ id: b.billId, amount: r2(b.amount), name: this.viewBills[b.billId] ? datesText(this.viewBills[b.billId]) : 'Bill ' + String(b.billId).slice(0, 6) })) }
        : x.type === 'charges' ? { k: i, label: `Charges${x.note ? ' · ' + x.note : ''} (kept apart from the rent)`, amount: r2(x.amount) }
        : { k: i, label: `Rental${x.forMonth ? ' · ' + monthName(x.forMonth) : ''}`, amount: r2(x.amount) }));
    },
    // 23 Nov 2026: the Rental · Utilities split only when a payment has both
    // 24 Nov 2026: the split by type under the amount (a payment with several lines, or a Charges payment)
    partsShort(r) {
      if (!Array.isArray(r.parts) || !r.parts.length) return '';
      const p = partsOf(r), list = [['Rental', p.rental], ['Utilities', p.utilities], ['Charges', p.charges]].filter(([, v]) => v > 0);
      return r.parts.length > 1 || p.charges > 0 ? list.map(([k, v]) => `${k} ${v.toFixed(2)}`).join(' · ') : '';
    },
    // Every line, for the change history
    partsText(r) {
      return (r.parts || []).map(x => `${x.type === 'rental' ? `Rental${x.forMonth ? ' ' + x.forMonth : ''}` : x.type === 'charges' ? `Charges${x.note ? ' (' + x.note + ')' : ''}` : 'Utilities'} ${r2(x.amount).toFixed(2)}`).join(' · ');
    },
    // 24 Nov 2026: Payment for, for the Excel / CSV
    payFor(r) { const p = partsOf(r); return [['Rental', p.rental], ['Utilities', p.utilities], ['Charges', p.charges]].filter(([, v]) => v > 0).map(([k]) => k).join(' + ') || 'Rental'; },
    // 24 Nov 2026 (Khairul): read the payment lines. Rental may repeat (one line per month), Charges may repeat, Utilities once.
    // Returns { error, parts, total, alloc, util, firstMonth }.
    readLines(lines, u, booked) {
      const L = lines.map(x => ({ ...x, amt: x.type === 'utilities' ? (booked && u ? r2(u.amount) : 0) : r2(x.amount) }));
      const rentals = L.filter(x => x.type === 'rental'), charges = L.filter(x => x.type === 'charges'), utils = L.filter(x => x.type === 'utilities');
      const util = utils.length ? utils[0].amt : 0, alloc = util > 0 ? utilAlloc(u) : [], total = r2(L.reduce((a, x) => a + x.amt, 0));
      const months = rentals.map(x => x.forMonth).filter(Boolean), dup = months.find((m, i) => months.indexOf(m) !== i);
      const error = !L.length ? 'Add a payment line.' : L.length > 8 ? 'One payment can have up to 8 lines.'
        : utils.length > 1 ? 'Utilities can be on one line only. Tick all the bills on that line.'
        : !booked && L.length > 1 ? 'Pick a booking in Guest / tenant name to put several payment types in one payment.'
        : !booked && utils.length ? 'Pick a booking in Guest / tenant name to pay its utility bills.'
        : !booked && charges.length ? 'Pick a booking in Guest / tenant name. A charge goes on its booking.'
        : rentals.some(x => !(x.amt > 0)) ? 'Enter the amount on each Rental line.'
        : booked && rentals.some(x => !/^\d{4}-\d{2}$/.test(x.forMonth || '')) ? 'Choose the month on each Rental line.'
        : dup ? `Rental for ${monthName(dup)} is on two lines. Put it on one line.`
        : charges.some(x => !(x.amt > 0)) ? 'Enter the amount on each Charges line.'
        : charges.some(x => !String(x.note || '').trim()) ? 'Write what each charge is for.'
        : utils.length && u && u.bills === null ? 'The utility bills are still loading.'
        : utils.length && !(util > 0) ? 'Tick the bills this payment pays.'
        : (util > 0 && util > utilMax(u) + 0.005) ? 'The Utilities amount is more than the ticked bills have left.'
        : (util > 0 && Math.abs(alloc.reduce((a, x) => a + x.amount, 0) - util) > 0.005) ? 'Tick the bills this Utilities amount pays.'
        : !(total > 0) ? 'Enter the amount.' : '';
      const parts = L.filter(x => x.amt > 0).map(x => (x.type === 'rental' ? { type: 'rental', amount: x.amt, forMonth: x.forMonth || '' }
        : x.type === 'charges' ? { type: 'charges', amount: x.amt, note: String(x.note || '').trim().slice(0, 1000) } : { type: 'utilities', amount: util, bills: alloc }));
      return { error, parts, total, alloc, util, firstMonth: rentals[0]?.forMonth || '' };
    },
    // One plain Rental line (or nothing) is saved as before, without parts
    needsParts(parts, had) { return had || parts.length > 1 || parts.some(x => x.type !== 'rental'); },
    async pickBooking(o, { billId = '', quiet = false } = {}) {
      const b = this.activeBookings.find(x => x.id === o.key), f = this.f; if (!b) return;
      if (b.stay === 'Cancelled' && !quiet && !await askConfirm({ title: 'This booking is cancelled', message: `${b.bookingNo || b.id} was cancelled${b.cancelledReason ? ` (${b.cancelledReason})` : ''}. Link this payment to it anyway?`, confirmText: 'Use this booking' })) { f.guest = ''; return; }
      // 23 Nov 2026 (Khairul): picking another booking keeps the Rental amount, For month (when the new stay has it) and the
      // Utilities amount / new bill typed so far; only the ticked bills go (they belong to the other booking)
      f.bookingId = b.id; f.bookingNo = b.bookingNo || b.id;
      // 24 Nov 2026 (Khairul): a lease offers its lease months (from the check-in, the same as the invoice and the booking's
      // Payments tab: a Monthly Lease in whole months), saved as the month each starts in; a short stay its calendar months
      const lease = b.longTerm ? leaseMonths(b, Number(b.monthlyRent) || 0) : [];
      f.bookingMonths = lease.length ? lease.map(x => x.m) : monthsBetween(b.arrival, b.departure); f.monthNotes = {};
      f.monthLabels = Object.fromEntries(lease.map(x => [x.m, `${x.label} · ${leaseSpan(x)}`]));
      f.lines.forEach(x => { if (x.forMonth && !f.bookingMonths.includes(x.forMonth)) x.forMonth = ''; });
      f.u = this.keepUtil(f.u); this.loadBookingBills(b, f.u, billId);
      this.dropPaidMonths(b);
      f.guest = this.names[b.id] || f.guest || b.bookingNo || '';
      // 23 Nov 2026 (Khairul): the Rental amount is no longer filled from the booking; staff type what the bank slip shows
      if (f.propertyId !== b.propertyId) {
        f.propertyId = b.propertyId || ''; this.units = [];
        try { this.units = f.propertyId ? await loadUnits(f.propertyId) : []; } catch { this.formError = 'Could not load the units.'; }
      }
      f.unitCode = b.unitCode || b.unitId || '';
      if (f.unitCode && !this.units.some(u => u.unitCode === f.unitCode)) this.units = [...this.units, { unitCode: f.unitCode }];
    },
    // 19 Nov 2026: the error sits at the top of the popup, so bring it into view (it was missed when scrolled down to Submit)
    showError(ref) {
      this.$nextTick(() => {
        const el = this.$refs[ref]; if (!el) return;
        if (document.activeElement && el.closest('form, .modal')?.contains(document.activeElement)) document.activeElement.blur();   // a focused box would hold the scroll
        for (let p = el.parentElement; p; p = p.parentElement) if (p.scrollHeight > p.clientHeight + 1) p.scrollTop = 0;   // the popup and its backdrop, to the top
      });
    },
    // ---------- Group booking tab (25 Nov 2026, Khairul) ----------
    groupNo(gid) { return String(gid || '').replace(/^offline_/, ''); },
    unlinkGroup() { Object.assign(this.f, { groupId: '', groupSearch: '', groupRows: [], groupMonths: [], groupLabels: {}, forMonth: '' }); },
    // A group picked: its bookings (cancelled ones left out) with their rent; the months come from the first booking (same dates)
    pickGroup(o) {
      const f = this.f, list = this.activeBookings.filter(b => b.groupId === o.key && b.stay !== 'Cancelled')
        .sort((a, b) => String(a.bookingNo || '').localeCompare(String(b.bookingNo || '')));
      if (!list.length) { this.formError = 'Every booking in this group is cancelled.'; this.showError('newErr'); return; }
      const b0 = list[0], lease = b0.longTerm ? leaseMonths(b0, Number(b0.monthlyRent) || 0) : [];
      f.groupId = o.key; f.guest = this.names[b0.id] || o.value || '';
      f.groupMonths = lease.length ? lease.map(x => x.m) : monthsBetween(b0.arrival, b0.departure);
      f.groupLabels = Object.fromEntries(lease.map(x => [x.m, `${x.label} · ${leaseSpan(x)}`]));
      f.forMonth = f.groupMonths[0] || '';
      f.groupRows = list.map(b => ({ id: b.id, bookingNo: b.bookingNo || b.id, unitCode: b.unitCode || b.unitId || '', propertyId: b.propertyId || '', propertyName: b.propertyName || '',
        stay: b.stay, due: Number(b.longTerm ? b.monthlyRent : b.rental) || 0, amount: '', ticks: {}, charges: '', chargeNote: '', bills: undefined, owing: 0,
        nb: { id: doc(collection(db, 'utilityBills')).id, on: true, driveFolder: '', ...Object.fromEntries(KINDS.flatMap(k => [[k.key, ''], [k.key + 'From', ''], [k.key + 'To', '']])) } }));
      f.gPeriods = {}; f.gRent = '';
      f.groupRows.forEach(r => this.loadGroupBills(r));
      this.formError = '';
      this.groupPurpose();
    },
    fillGroupRent() {
      const f = this.f;
      if (f.gSameRent) { const d = f.groupRows.find(r => r.due > 0)?.due; if (d) f.gRent = String(r2(d)); }
      else f.groupRows.forEach(r => { if (r.due > 0) r.amount = String(r2(r.due)); });
      this.groupPurpose();
    },
    // What each unit pays (the switches pick the shared box or the unit's own)
    rentOf(r) { return r2(this.f.gSameRent ? this.f.gRent : r.amount); },
    groupBillsOf(r) { const f = this.f; return (r.bills || []).filter(b => (f.gSameBills ? f.gPeriods[datesText(b)] : r.ticks[b.id])); },
    utilOf(r) { return r2(this.groupBillsOf(r).reduce((t, b) => t + b.left, 0) + this.newBillOf(r)); },
    // The new bill typed for a unit (Add a new bill and pay it): its lines and total
    // With Same bill dates on, every unit's new bill takes its dates from the first unit that has a new bill.
    nbFollows(r) { const lead = this.nbLead; return !!(this.f.gSameBills && lead && lead !== r); },
    nbDate(r, key) { return (this.nbFollows(r) ? this.nbLead.nb : r.nb)?.[key] || ''; },
    newLinesOf(r) { return KINDS.map(k => ({ kind: k.key, from: this.nbDate(r, k.key + 'From'), to: this.nbDate(r, k.key + 'To'), amount: r.nb?.[k.key] })); },
    newBillOf(r) { return this.f.gNew?.on && r.nb?.on ? r2(KINDS.reduce((t, k) => t + (Number(r.nb?.[k.key]) || 0), 0)) : 0; },
    chargeOf(r) { return r2(this.f.gSameCharge ? this.f.gCharge : r.charges); },
    chargeNoteOf(r) { return String(this.f.gSameCharge ? this.f.groupChargeNote : r.chargeNote || '').trim(); },
    groupSum(k) { const fn = { rent: this.rentOf, util: this.utilOf, charge: this.chargeOf }[k]; return r2((this.f.groupRows || []).reduce((t, r) => t + fn(r), 0)); },
    rowTotal(r) { return r2(this.rentOf(r) + this.utilOf(r) + this.chargeOf(r)); },
    // A unit's unpaid utility bills (undefined = loading, null = can't be read)
    async loadGroupBills(r) {
      const list = await loadBills({ id: r.id, propertyId: r.propertyId });
      const row = this.f.groupRows.find(x => x.id === r.id); if (!row) return;   // another group picked meanwhile
      row.bills = list ? list.filter(b => b.left > 0.004).sort(oldestFirst) : null;
      row.owing = row.bills ? r2(row.bills.reduce((t, b) => t + b.left, 0)) : 0;
    },
    // The purpose fills itself until it is typed over, one line each: Rental Nov 2026 RM 666.00 / Utilities RM 90.00 / Charges RM 50.00 (Cleaning) / 3 units (T-017, T-018, T-019)
    // 25 Nov 2026 (Khairul): Utilities in detail, a line per unit: each bill's kinds, dates and amounts
    utilDetail() {
      const one = ls => ls.filter(l => Number(l.amount) > 0).map(l => `   ${linesText({ lines: [l] })}`);
      const old = b => (b.left < b.total - 0.004 ? [`   Bill ${datesText(b)} balance ${money(b.left)}`] : one(b.lines || []));
      return this.f.groupRows.filter(r => this.utilOf(r) > 0).flatMap(r => [`- ${r.unitCode} (${r.bookingNo}): ${money(this.utilOf(r))}`,
        ...this.groupBillsOf(r).flatMap(old), ...(this.newBillOf(r) > 0 ? one(this.newLinesOf(r)) : [])]);
    },
    // 25 Nov 2026 (Khairul): a line per unit under Rental and Charges too
    unitLines(amt, noteOf) {
      return this.f.groupRows.filter(r => amt(r) > 0).map(r => { const n = noteOf ? noteOf(r) : ''; return `- ${r.unitCode} (${r.bookingNo}): ${money(amt(r))}${n ? ` (${n})` : ''}`; });
    },
    groupPurpose() {
      const f = this.f, paid = f.groupRows.filter(r => this.rowTotal(r) > 0), list = paid.length ? paid : f.groupRows;
      const rent = this.groupSum('rent'), util = this.groupSum('util'), ch = this.groupSum('charge'), note = [...new Set(f.groupRows.filter(r => this.chargeOf(r) > 0).map(r => this.chargeNoteOf(r)).filter(Boolean))].join(', ');
      // 25 Nov 2026 (Khairul): in this order, a line each: name and units, Rental, Utilities, Charges
      const bits = [`${f.guest.trim() || 'Group'} · ${list.length} unit${list.length === 1 ? '' : 's'}: ${list.map(r => `${r.unitCode} (${r.bookingNo})`).join(', ')}`,
        rent > 0 || !(util > 0 || ch > 0) ? [`Rental${f.forMonth ? ` ${monthName(f.forMonth)}` : ''}: ${money(rent)}`, ...this.unitLines(r => this.rentOf(r))].join('\n') : '',
        util > 0 ? [`Utilities: ${money(util)}`, ...this.utilDetail()].join('\n') : '', ch > 0 ? [`Charges: ${money(ch)}${note && f.gSameCharge ? ` (${note})` : ''}`, ...this.unitLines(r => this.chargeOf(r), r => (f.gSameCharge ? '' : this.chargeNoteOf(r)))].join('\n') : ''].filter(Boolean);
      const text = bits.join('\n');
      if (!f.purpose.trim() || f.purpose === f.groupAuto) f.purpose = text;
      f.groupAuto = text;
    },
    // One offline payment per unit with an amount: the same date, method, reference, receipt and status; each linked to its
    // booking. Rental only = a plain payment as before; with Utilities or Charges = parts (rules Draft 1.11), the bills paid
    // oldest first in the same batch.
    async submitGroup() {
      if (this.f.mode === 'Cash') this.f.bankRef = '';
      const f = this.f, me = useSession(), rows = f.groupRows.filter(r => this.rowTotal(r) > 0);
      const neg = f.groupRows.find(r => this.rentOf(r) < 0 || this.chargeOf(r) < 0);
      const noNote = rows.find(r => this.chargeOf(r) > 0 && !this.chargeNoteOf(r));
      const nbRows = f.gNew.on ? f.groupRows.filter(r => this.newBillOf(r) > 0) : [];
      const nbBad = nbRows.map(r => [r, linesProblem(this.newLinesOf(r))]).find(([, m]) => m);
      this.formError = !f.date ? 'Choose the payment date.' : !f.groupId ? 'Choose the group booking.'
        : neg ? "An amount can't be below 0."
        : !rows.length ? 'Enter an amount for at least one unit.'
        : this.groupSum('rent') > 0 && !f.forMonth ? 'Choose the month the rental is for.'
        : f.groupRows.some(r => r.bills === undefined) && this.groupSum('util') === 0 && (Object.values(f.gPeriods).some(Boolean)) ? 'The utility bills are still loading. Try again in a moment.'
        : f.gNew.on && !nbRows.length ? 'Type the new bill amounts, or untick Add a new bill.'
        : f.gNew.on && f.groupRows.some(r => r.nb.on && KINDS.some(k => Number(r.nb[k.key]) < 0)) ? "Bill amounts can't be below 0."
        : nbBad ? `New bill for ${nbBad[0].unitCode}: ${nbBad[1]}`
        : noNote ? (f.gSameCharge ? 'Write what the charge is for.' : `Write what the charge for ${noNote.unitCode} is for.`)
        : !f.mode ? 'Choose the payment method.'
        : (f.status === 'Checked' && !String(f.remarks || '').trim()) ? 'Enter the payment code (needed for a Checked payment).'
        : !f.purpose.trim() ? 'Enter the purpose.'
        : !f.docsLink.trim() ? 'Upload the receipt.' : '';
      if (this.formError) return this.showError('newErr');
      this.busy = true;
      try {
        const batch = writeBatch(db), states = {};
        for (const [i, r] of rows.entries()) {
          if (!(r.propertyId in states)) states[r.propertyId] = await stateFor(r.propertyId);
          const st = states[r.propertyId], rent = this.rentOf(r), util = this.utilOf(r), ch = this.chargeOf(r), amount = this.rowTotal(r), note = this.chargeNoteOf(r);
          const ref = i === 0 ? doc(db, 'offlinePayments', this.newId) : doc(collection(db, 'offlinePayments'));
          const nbAmt = this.newBillOf(r), fresh = {};
          let nb = null;
          if (nbAmt > 0) {   // the new bill on this unit's booking, paid in full by this payment
            const bk = this.activeBookings.find(x => x.id === r.id) || { id: r.id, bookingNo: r.bookingNo, propertyId: r.propertyId, propertyName: r.propertyName, unitCode: r.unitCode };
            nb = await withState(r.propertyId, newBill(bk, this.newLinesOf(r), 'payment', me, { driveFolder: r.nb.driveFolder || '' }));
            fresh[r.nb.id] = { total: nb.total, data: nb };
          }
          const old = this.groupBillsOf(r), alloc = [...(old.length ? spread(r2(util - (nb ? nb.total : 0)), old) : []), ...(nb ? [{ billId: r.nb.id, amount: nb.total }] : [])];   // ticked bills and the new one, each paid in full
          const parts = util > 0 || ch > 0 ? [...(rent > 0 ? [{ type: 'rental', amount: rent, forMonth: f.forMonth }] : []), ...(util > 0 ? [{ type: 'utilities', amount: util, bills: alloc }] : []),
            ...(ch > 0 ? [{ type: 'charges', amount: ch, note: note.slice(0, 1000) }] : [])] : null;
          if (alloc.length) await linkBills(batch, ref.id, {}, Object.fromEntries(alloc.map(x => [x.billId, x.amount])), fresh);
          if (nb) {
            batch.set(doc(db, 'utilityBills', r.nb.id), nb);
            audit(batch, me, { action: 'utilityBill.create', entity: `utilityBills/${r.nb.id}`, propertyId: r.propertyId || null, changes: [{ field: 'total', old: null, new: nb.total }, { field: 'dates', old: null, new: datesText(nb) }, { field: 'lodgedFrom', old: null, new: 'payment' }] });
          }
          const prop = this.properties.find(p => p.id === r.propertyId);
          batch.set(ref, { ...(st ? { state: st } : {}), date: f.date, amount, propertyId: r.propertyId, propertyName: prop?.name || r.propertyName || '', unitCode: r.unitCode,
            guest: f.guest.trim(), purpose: f.purpose.trim(), mode: f.mode, bankRef: f.bankRef.trim(), docsLink: f.docsLink.trim(), remarks: f.status === 'Checked' ? f.remarks.trim() : '',
            status: f.status, verifiedByName: f.status === 'Pending' ? '' : me.name, verifiedDate: f.status === 'Pending' ? '' : today(), createdAt: serverTimestamp(), createdBy: me.user.uid, submittedByName: me.name,
            bookingId: r.id, bookingNo: r.bookingNo, ...(rent > 0 && f.forMonth ? { forMonth: f.forMonth } : {}), groupId: f.groupId, groupPayId: this.newId,
            ...(parts ? { parts, billIds: alloc.map(x => x.billId), billsAt: serverTimestamp() } : {}) });
          audit(batch, me, { action: 'offlinePayment.create', entity: `offlinePayments/${ref.id}`, propertyId: r.propertyId, changes: [['amount', amount], ['date', f.date], ['unitCode', r.unitCode], ['guest', f.guest.trim()],
            ['purpose', f.purpose.trim()], ['bankRef', f.bankRef.trim()], ['status', f.status], ['bookingNo', r.bookingNo], ['forMonth', rent > 0 ? f.forMonth : ''], ['groupId', f.groupId],
            ...(parts ? [['parts', this.partsText({ parts })], ['utilities', alloc.map(x => `${x.billId} ${x.amount.toFixed(2)}`).join(', ')]] : [])].filter(([, v]) => v !== '').map(([field, v]) => ({ field, old: null, new: v })) });
        }
        await batch.commit();
        this.open = false; toast('Changes saved');
        this.done = `${rows.length} offline payment${rows.length === 1 ? '' : 's'} submitted as ${f.status} for group ${this.groupNo(f.groupId)} (${money(this.groupTotal)}).`;
        await this.load();
      } catch (e) { this.formError = e.code === 'permission-denied' ? 'Firestore refused this. Utilities or Charges need the latest security rules (Draft 1.11 or later) published, and the Offline Payments Edit tick.' : friendlyError(e, 'save the payments'); this.showError('newErr'); }
      this.busy = false;
    },
    unlinkBooking() { Object.assign(this.f, { bookingId: '', bookingNo: '', bookingMonths: [], monthNotes: {}, monthLabels: {}, u: this.keepUtil(this.f.u) }); },
    // The Utilities tab without the old booking's bills: the amount typed (or filled) and a new bill being typed stay
    keepUtil(old) {
      const u = blankUtil();
      if (!old) return u;
      u.amount = old.amount; u.touched = r2(old.amount) > 0; u.add = { ...old.add };
      return u;
    },
    // 19 Nov 2026: months already paid (Checked payments cover the rent) are left out of For month; part-paid and
    // Pending ones stay, with a note. Short term: the whole rental is due in the check-in month.
    async dropPaidMonths(b) {
      let rows = [];
      try {
        const q = b.propertyId ? query(collection(db, 'offlinePayments'), where('bookingId', '==', b.id), where('propertyId', '==', b.propertyId))
          : query(collection(db, 'offlinePayments'), where('bookingId', '==', b.id));
        rows = (await getDocs(q)).docs.map(d => d.data());
      } catch { return; }   // can't read them: every month stays
      const f = this.f; if (f.bookingId !== b.id) return;   // picked another booking meanwhile
      const months = f.bookingMonths, first = months[0];
      const due = Number(b.longTerm ? b.monthlyRent : b.rental) || 0;
      // 24 Nov 2026: a lease's payments count in the lease month their For month falls in (leaseSlot)
      const lease = b.longTerm ? leaseMonths(b, Number(b.monthlyRent) || 0) : [];
      // 23 Nov 2026: Rental part only; 24 Nov 2026: each Rental line in its own month (lease month by leaseSlot)
      const inMonthL = (m2, m) => (lease.length ? lease[leaseSlot(lease, m2)].m === m : m2 === m);
      const sum = (m, ok) => rows.filter(ok).reduce((a, x) => a + rentalParts(x).filter(p => (b.longTerm ? inMonthL(p.m, m) : m === first)).reduce((s, p) => s + p.amount, 0), 0);
      const notes = {};
      f.bookingMonths = months.filter(m => {
        if (!b.longTerm && m !== first) return sum(first, payCounts) < due - 0.005 || due <= 0;   // short term paid in full: no month left
        const paid = sum(m, payCounts), waiting = sum(m, x => x.status === 'Pending' || x.status === 'Edited');
        if (due > 0 && paid >= due - 0.005) return false;
        notes[m] = [paid > 0 ? `RM ${paid.toFixed(2)} of ${due.toFixed(2)} paid` : '', waiting > 0 ? `RM ${waiting.toFixed(2)} pending` : ''].filter(Boolean).join(', ');
        return true;
      });
      f.monthNotes = notes;
      f.lines.forEach(x => { if (x.forMonth && !f.bookingMonths.includes(x.forMonth)) x.forMonth = ''; });
    },
    monthOptions(list, notes = {}) {
      if (!(list || []).length) return [{ value: '', label: 'Every month is paid' }];
      const name = m => this.f?.monthLabels?.[m] && list === this.f.bookingMonths ? this.f.monthLabels[m] : monthName(m);   // 24 Nov 2026: lease months
      return [{ value: '', label: 'Choose month' }, ...list.map(m => ({ value: m, label: notes[m] ? `${name(m)} (${notes[m]})` : name(m) }))];
    },
    // Edit: 12 months either side of the payment date, plus the saved month
    monthsAround(date, cur) {
      const d = /^\d{4}-\d{2}/.test(date || '') ? date : today(), y = +d.slice(0, 4), m = +d.slice(5, 7);
      const from = `${m === 12 ? y : y - 1}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}`, to = `${y + 1}-${d.slice(5, 7)}`;
      const list = monthsBetween(from + '-01', to + '-01');
      return cur && !list.includes(cur) ? [cur, ...list].sort() : list;
    },
    changeProperty() { if (this.f.bookingId) this.unlinkBooking(); this.loadUnitList(); },   // another property: no longer that booking
    monthName,
    async loadUnitList() {
      this.f.unitCode = ''; this.units = [];
      if (!this.f.propertyId) return;
      try { this.units = await loadUnits(this.f.propertyId); } catch { this.formError = 'Could not load the units.'; }
    },
    // 23 Nov 2026 (Khairul): amount = Rental + Utilities. parts: [{ type: 'rental', amount, forMonth }, { type: 'utilities', amount,
    // bills: [{ billId, amount }] }], billIds, billsAt. The bills paid (and a new bill typed on the Utilities tab) change in the same batch.
    // The mouse wheel over a focused number box would change the amount: let it scroll the form instead
    noWheel(e) { if (e.target.type === 'number' && e.target === document.activeElement) e.target.blur(); },
    async submit() {
      if (this.f.mode === 'Cash') this.f.bankRef = '';   // 23 Nov 2026: Cash has no bank reference (box hidden)
      const f = this.f, me = useSession();
      // Unknown only needs the date and amount; Pending and Checked need everything, including a receipt
      const unk = f.status === 'Unknown';
      // 23 Nov 2026 (Khairul): only the part chosen in Payment for is saved
      // 24 Nov 2026 (Khairul): the payment lines (Rental / Utilities / Charges), all in this one payment
      const L = unk ? null : this.readLines(f.lines, f.u, !!f.bookingId);
      const total = unk ? r2(f.amount) : L.total, util = unk ? 0 : L.util, alloc = unk ? [] : L.alloc;
      const newOn = !unk && f.bookingId && f.lines.some(x => x.type === 'utilities') && f.u.add.on && addTotal(f.u) > 0;
      this.formError = !f.date ? 'Choose the payment date.' : unk ? (!(total > 0) ? 'Enter the amount.' : '')
        : !this.canEdit && f.lines.some(x => x.type !== 'utilities') ? 'Without the Offline Payments Edit tick you can record utility payments only: set Payment for to Utilities.'
        : L.error ? L.error
        : !f.propertyId ? 'Choose the property.' : !f.guest.trim() ? 'Enter the guest name.'
        : !f.mode ? 'Choose the payment method.'
        : (f.status === 'Checked' && !String(f.remarks || '').trim()) ? 'Enter the payment code (needed for a Checked payment).'
        : (newOn && linesProblem(addLines(f.u))) ? `New bill: ${linesProblem(addLines(f.u))}`
        // 23 Nov 2026 (Khairul): the new bill's photo is optional (was required)
        : !f.purpose.trim() ? 'Enter the purpose.'
        : !f.docsLink.trim() ? 'Upload the receipt. It is required unless the status is Unknown.'
        : (f.docsLink.trim() && !/^https?:\/\//i.test(f.docsLink.trim())) ? 'The documents link should start with https://' : '';
      if (this.formError) return this.showError('newErr');
      this.busy = true;
      try {
        const prop = this.properties.find(p => p.id === f.propertyId), ref = doc(db, 'offlinePayments', this.newId), batch = writeBatch(db);
        const st = await stateFor(f.propertyId);   // the payment carries its property's state
        const linked = f.bookingId && !unk, b = linked ? this.activeBookings.find(x => x.id === f.bookingId) : null;
        // A bill typed on the Utilities tab is saved on the booking (lodgedFrom 'payment'), with this payment's share on it
        const fresh = {};
        let nb = null;
        if (newOn && b) {
          nb = await withState(b.propertyId, newBill(b, addLines(f.u), 'payment', me, { driveFolder: f.u.add.driveFolder || '' }));
          fresh[f.u.add.id] = { total: nb.total, data: nb };
        }
        const now = Object.fromEntries(alloc.map(x => [x.billId, x.amount]));
        if (linked && (alloc.length || nb)) await linkBills(batch, ref.id, {}, now, fresh);
        if (nb) {
          batch.set(doc(db, 'utilityBills', f.u.add.id), nb);
          audit(batch, me, { action: 'utilityBill.create', entity: `utilityBills/${f.u.add.id}`, propertyId: b.propertyId || null, changes: [{ field: 'total', old: null, new: nb.total }, { field: 'dates', old: null, new: datesText(nb) }, { field: 'lodgedFrom', old: null, new: 'payment' }] });
        }
        // 24 Nov 2026: one part per line (several Rental months, Utilities, Charges); one plain Rental line is saved as before
        const parts = linked && this.needsParts(L.parts, false) ? L.parts : null, forMonth = linked ? L.firstMonth : '';
        batch.set(ref, { ...(st ? { state: st } : {}), date: f.date, amount: total, propertyId: f.propertyId, propertyName: prop?.name || '', unitCode: f.unitCode,
          guest: f.guest.trim(), purpose: f.purpose.trim(), mode: f.mode, bankRef: f.bankRef.trim(), docsLink: f.docsLink.trim(), remarks: f.status === 'Checked' ? f.remarks.trim() : '',
          status: f.status, verifiedByName: f.status === 'Pending' ? '' : me.name, verifiedDate: f.status === 'Pending' ? '' : today(), createdAt: serverTimestamp(), createdBy: me.user.uid, submittedByName: me.name,
          ...(linked ? { bookingId: f.bookingId, bookingNo: f.bookingNo, ...(forMonth ? { forMonth } : {}) } : {}),
          ...(parts ? { parts, billIds: alloc.map(x => x.billId), billsAt: serverTimestamp() } : {}) });
        audit(batch, me, { action: 'offlinePayment.create', entity: `offlinePayments/${ref.id}`, propertyId: f.propertyId, changes: [['amount', total], ['date', f.date], ['propertyName', prop?.name || ''], ['unitCode', f.unitCode], ['guest', f.guest.trim()], ['purpose', f.purpose.trim()], ['bankRef', f.bankRef.trim()], ['status', f.status],
          ...(linked ? [['bookingNo', f.bookingNo], ['forMonth', forMonth]] : []), ...(parts ? [['parts', this.partsText({ parts })], ['utilities', alloc.map(x => `${x.billId} ${x.amount.toFixed(2)}`).join(', ')]] : [])].filter(([, v]) => v !== '').map(([field, v]) => ({ field, old: null, new: v })) });
        await batch.commit();
        this.open = false; toast('Changes saved'); this.done = 'Offline payment submitted as ' + f.status + '.';
        if (f.status === 'Unknown') this.tellOperations({ id: ref.id, amount: total, guest: f.guest.trim(), unitCode: f.unitCode, date: f.date });
        await this.load();
      } catch (e) { this.formError = e.code === 'permission-denied' ? 'Firestore refused this. The latest security rules (Draft 1.03: offline payments and utility bills) need to be published first.' : friendlyError(e, 'save the payment'); this.showError('newErr'); }
      this.busy = false;
    },
    // The Drive folder link is kept on the record so the table's Documents shows it
    nameOf(r) { return [r.date, r.unitCode, r.guest].filter(Boolean).join(' '); },
    saveFolder(r, link) {
      if (!link || link === r.docsLink) return;
      if (this.canEdit) this.patch(r, { docsLink: link }, 'docsLink', r.docsLink || '');
      else this.pendingLink = link;   // Operations: saved together with their edit
    },
    async startEdit() {
      const r = this.view;
      const pp = partsOf(r);
      this.ed = { date: r.date, amount: r.amount, propertyId: r.propertyId || '', unitCode: r.unitCode || '', guest: r.guest, purpose: r.purpose, mode: r.mode || '', bankRef: r.bankRef || '', remarks: r.remarks || '', forMonth: r.forMonth || pp.forMonth || '',
        u: null, lines: [] };
      // 24 Nov 2026 (Khairul): a booking's payment is edited as its lines; an older one-amount payment is one Rental line
      if (r.bookingId) this.ed.lines = Array.isArray(r.parts) && r.parts.length ? r.parts.map(x => newPayLine(x.type, x)) : [newPayLine('rental', { amount: r.amount, forMonth: r.forMonth })];
      // 23 Nov 2026: a booking's payment can pay its utility bills too; the bills it pays now start ticked
      if (r.bookingId) { const u = blankUtil(pp.bills); u.amount = pp.utilities ? pp.utilities.toFixed(2) : ''; u.touched = true; this.ed.u = u; this.loadBookingBills({ id: r.bookingId, propertyId: r.propertyId }, this.ed.u); }
      this.formError = ''; this.editing = true;   // a receipt uploaded before pressing Add details is kept
      try {
        if (!this.properties.length) this.properties = await loadProperties();
        this.units = this.ed.propertyId ? await loadUnits(this.ed.propertyId) : [];
      } catch { this.formError = 'Could not load the property list.'; }
    },
    async editProperty() {
      this.ed.unitCode = ''; this.units = [];
      if (!this.ed.propertyId) return;
      try { this.units = await loadUnits(this.ed.propertyId); } catch { this.formError = 'Could not load the units.'; }
    },
    async saveEdit() {
      const e = this.ed, r = this.view;
      // 23 Nov 2026: a booking's payment is Rental + Utilities; the bills it pays follow the change
      const pp = partsOf(r), withBills = !!r.bookingId && !!e.u;
      // 24 Nov 2026 (Khairul): a booking's payment is its lines (Rental / Utilities / Charges)
      const L = withBills ? this.readLines(e.lines, e.u, true) : null;
      const total = withBills ? L.total : r2(e.amount), alloc = withBills ? L.alloc : [];
      this.formError = !e.date ? 'Choose the payment date.' : withBills && L.error ? L.error : !(total > 0) ? 'Enter the amount.' : !e.propertyId ? 'Choose the property.' : !String(e.guest).trim() ? 'Enter the guest name.' : !String(e.purpose).trim() ? 'Enter the purpose.'
        : (this.canEdit && r.status === 'Checked' && !String(e.remarks || '').trim()) ? 'A Checked payment needs its payment code.' : '';
      if (this.formError) return this.showError('edErr');
      const prop = this.properties.find(p => p.id === e.propertyId);
      const data = { date: e.date, amount: total, propertyId: e.propertyId, propertyName: prop?.name || r.propertyName || '', unitCode: e.unitCode,
        guest: String(e.guest).trim(), purpose: String(e.purpose).trim(), mode: e.mode || '', bankRef: String(e.bankRef).trim(), ...(this.canEdit ? { remarks: String(e.remarks || '').trim() } : {}), ...(r.bookingId ? { forMonth: withBills ? L.firstMonth : (r.forMonth || '') } : {}) };
      const now = Object.fromEntries(alloc.map(x => [x.billId, x.amount]));
      const billsChanged = withBills && JSON.stringify(Object.entries(pp.bills).sort()) !== JSON.stringify(Object.entries(now).sort());
      if (withBills && this.needsParts(L.parts, Array.isArray(r.parts) && r.parts.length > 0)) { data.parts = L.parts; data.billIds = alloc.map(x => x.billId); }
      const ops = this.opsEdit(r);
      if (ops && this.pendingLink) data.docsLink = this.pendingLink;
      const same = k => (k === 'parts' || k === 'billIds' ? JSON.stringify(r[k] || []) === JSON.stringify(data[k]) : (r[k] ?? '') === data[k]);
      const changes = Object.keys(data).filter(k => !same(k)).map(k => (k === 'parts' ? { field: 'parts', old: this.partsText(r), new: this.partsText(data) }
        : k === 'billIds' ? { field: 'utilities', old: Object.entries(pp.bills).map(([id, a]) => `${id} ${a.toFixed(2)}`).join(', '), new: alloc.map(x => `${x.billId} ${x.amount.toFixed(2)}`).join(', ') }
        : { field: k, old: r[k] ?? '', new: data[k] }));
      if (!changes.length) { this.editing = false; return; }
      this.busy = true;
      try {
        const me = useSession(), batch = writeBatch(db);
        // Who edited and when is kept on the payment; an Operations edit of an Unknown payment turns it into Edited
        const meta = { editedByName: me.name, editedByUid: me.user.uid, editedAt: serverTimestamp(), ...(ops ? { status: 'Edited' } : {}), ...(billsChanged ? { billsAt: serverTimestamp() } : {}) };
        if (billsChanged) await linkBills(batch, r.id, pp.bills, now);
        // Moved to another property: its state follows
        const st = data.propertyId && data.propertyId !== r.propertyId ? await stateFor(data.propertyId) : '';
        batch.update(doc(db, 'offlinePayments', r.id), { ...data, ...meta, ...(st ? { state: st } : {}) });
        if (ops) changes.push({ field: 'status', old: 'Unknown', new: 'Edited' });
        audit(batch, me, { action: 'offlinePayment.update', entity: `offlinePayments/${r.id}`, propertyId: data.propertyId || null, changes });
        await batch.commit(); Object.assign(r, data, meta, { editedAt: null, billsAt: null }); this.editing = false; toast('Changes saved'); this.loadViewBills(r);
        if (ops) this.tellFinance(r, me.name);
      } catch (err) { this.formError = friendlyError(err, 'save the changes'); }
      this.busy = false;
    },
    // Directors: delete a payment for good. The audit line keeps what it was.
    async removePayment(r) {
      const what = `RM ${(+r.amount || 0).toFixed(2)} on ${r.date || 'no date'}${r.guest ? ` from ${r.guest}` : ''}${r.unitCode ? ` (${r.unitCode})` : ''}`;
      const ok = await askConfirm({ title: 'Delete this payment?', danger: true, confirmText: 'Delete payment',
        message: `${what} will be removed for good.${r.bookingId ? ` It is linked to booking ${r.bookingNo || r.bookingId}, so that booking will show less paid.` : ''}${(r.billIds || []).length ? ' The utility bills it paid go back to Unpaid or Partly paid.' : ''} Uploaded files stay in Google Drive. This cannot be undone.` });
      if (!ok) return;
      this.busy = true; this.error = '';
      try {
        const me = useSession(), batch = writeBatch(db);
        // 23 Nov 2026: the bills it paid go back to Unpaid / Partly paid in the same batch
        const was = partsOf(r).bills;
        if (Object.keys(was).length) await linkBills(batch, r.id, was, {});
        batch.delete(doc(db, 'offlinePayments', r.id));
        const keep = ['date', 'amount', 'propertyName', 'unitCode', 'guest', 'purpose', 'mode', 'bankRef', 'status', 'bookingNo', 'remarks'];
        audit(batch, me, { action: 'offlinePayment.delete', entity: `offlinePayments/${r.id}`, propertyId: r.propertyId || null, reason: `Deleted: ${what}`,
          changes: keep.filter(k => r[k] !== undefined && r[k] !== '' && r[k] !== null).map(k => ({ field: k, old: r[k], new: null })) });
        await batch.commit();
        this.rows = this.rows.filter(x => x.id !== r.id); this.view = null; toast('Payment deleted');
      } catch (e) { this.view = null; this.error = e.code === 'permission-denied' ? 'Deleting was refused. Only Directors can delete payments (Firestore rules 0.72 must be published).' : friendlyError(e, 'delete the payment'); window.scrollTo(0, 0); }
      this.busy = false;
    },
    async patch(r, data, field, was, more = []) {
      this.error = ''; this.done = '';
      const me = useSession();
      try {
        const batch = writeBatch(db);
        batch.update(doc(db, 'offlinePayments', r.id), data);
        audit(batch, me, { action: 'offlinePayment.update', entity: `offlinePayments/${r.id}`, propertyId: r.propertyId || null, changes: [{ field, old: was, new: data[field] }, ...more] });
        await batch.commit(); Object.assign(r, data); toast('Changes saved');
      } catch (e) { this.error = friendlyError(e, 'save the change'); }
    },
    async setStatus(r, v) {
      if (v === r.status) return;
      // 24 Nov 2026 (Khairul): a payment can't be Checked without its payment code; a small popup asks for it (confirmChecked)
      if (v === 'Checked' && !String(r.remarks || '').trim()) {
        this.chk = { r, code: '', error: '', busy: false };
        this.$nextTick(() => this.$refs.chkCode?.focus());
        return;
      }
      await this.applyStatus(r, v);
    },
    async confirmChecked() {
      const c = this.chk, code = c.code.trim();
      if (!code) return this.$refs.chkCode?.focus();   // the button is off until a code is typed (Enter on an empty box does nothing)
      c.busy = true; c.error = '';
      const ok = await this.applyStatus(c.r, 'Checked', { remarks: code }, [{ field: 'remarks', old: c.r.remarks || '', new: code }]);
      if (ok) this.chk = null; else { c.busy = false; c.error = this.error || 'Could not save. Try again.'; }
    },
    // Saves a status change (plus any extra fields, e.g. the payment code) and sends the usual notifications. true when saved.
    async applyStatus(r, v, extra = {}, more = []) {
      if (r.isGroup) { let ok = true; for (const x of r.members) if (x.status !== v || extra.remarks) ok = (await this.applyStatus(x, v, extra, more)) && ok; return ok; }
      const me = useSession();
      await this.patch(r, { ...extra, status: v, verifiedByName: v === 'Pending' ? '' : me.name, verifiedDate: v === 'Pending' ? '' : today() }, 'status', r.status, more);
      if (r.status !== v) return false;   // not saved (the error is shown)
      if (v === 'Unknown') this.tellOperations(r);
      if (v === 'Checked') this.tellFiller(r, me);
      return true;
    },
    // Checked: the person who filled in an Unknown payment (Operations) hears that Finance checked it (3 Nov 2026)
    tellFiller(r, me) {
      const uid = r.editedByUid;
      if (!uid || uid === me.user.uid) return;
      notifyUser({ recipientUid: uid, type: 'payment', refId: r.id, link: '/Finance/offline-payments', title: 'Offline payment checked',
        message: `${me.name} checked the RM ${Number(r.amount || 0).toFixed(2)} payment from ${r.guest || 'a guest'}${r.unitCode ? ' (' + r.unitCode + ')' : ''} you filled in.` })
        .catch(e => console.error('Notification failed', e));
    },
    // ---- report: monthly, yearly or custom dates; all properties or one ----
    async openReport() {
      const d = new Date();
      this.rep = { type: 'monthly', month: monthOffset(0), year: String(d.getFullYear()), from: '', to: '', propertyId: '', busy: false, error: '' };
      if (!this.properties.length) { try { this.properties = await loadProperties(); } catch { this.rep.error = 'Could not load the property list.'; } }
    },
    async runReport(kind) {
      const R = this.rep; R.error = '';
      let from, to, label;
      if (R.type === 'monthly') { const [y, m] = R.month.split('-').map(Number); from = `${R.month}-01`; to = `${R.month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`; label = R.month; }
      else if (R.type === 'yearly') { from = `${R.year}-01-01`; to = `${R.year}-12-31`; label = R.year; }
      else { from = R.from; to = R.to; label = `${from}_to_${to}`; if (!from || !to) { R.error = 'Choose both dates.'; return; } if (to < from) { R.error = 'The end date is before the start date.'; return; } }
      R.busy = true;
      try {
        const snap = await getScoped(scopedOrBlank(query(collection(db, 'offlinePayments'), where('date', '>=', from), where('date', '<=', to), orderBy('date'))), { order: ['date', 'asc'] });
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(r => !R.propertyId || r.propertyId === R.propertyId)
          .sort((a, b) => String(a.propertyName || '').localeCompare(String(b.propertyName || '')) || String(a.date).localeCompare(String(b.date)));
        if (!list.length) { R.error = 'No offline payments in that period.'; R.busy = false; return; }
        const propName = R.propertyId ? (this.properties.find(p => p.id === R.propertyId)?.name || 'Property') : 'All properties';
        const money = n => Math.round((Number(n) || 0) * 100) / 100;
        const group = (keyOf) => { const m = new Map(); for (const r of list) { const k = keyOf(r), g = m.get(k) || { n: 0, total: 0 }; g.n++; g.total += money(r.amount); STATUSES.forEach(s => { g[s] = (g[s] || 0) + (r.status === s ? money(r.amount) : 0); }); m.set(k, g); } return m; };
        const rowsOf = m => [...m.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]))).map(([k, g]) => [k, g.n, money(g.total), ...STATUSES.map(s => money(g[s]))]);
        const head = ['', 'Payments', 'Total (RM)', ...STATUSES.map(s => `${s} (RM)`)];
        const sum = (rows) => ['Total', rows.reduce((a, r) => a + r[1], 0), ...head.slice(2).map((_, i) => money(rows.reduce((a, r) => a + r[2 + i], 0)))];
        const byProp = rowsOf(group(r => r.propertyName || '—')), byMonth = rowsOf(group(r => String(r.date).slice(0, 7)));
        const when = t => t?.toDate ? t.toDate().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '';
        const hasReceipt = r => (r.docsLink ? 'Yes' : 'No');
        const payHead = ['Payment Date', 'Booking no.', 'Property', 'Unit', 'Guest / tenant', 'Purpose', 'Payment for', 'Rental (RM)', 'Utilities (RM)', 'Charges (RM)', 'Amount (RM)', 'Status', 'Payment mode', 'Bank reference', 'Receipt uploaded', 'Documents link', 'Submitted by', 'Submitted on', 'Verified by', 'Verified date', 'Edited by', 'Edited on', 'Payment code', 'Payment ID', 'Booking ID'];
        const payRow = r => [r.date, r.bookingNo || '', r.propertyName || '', r.unitCode || '', r.guest || '', r.purpose || '', this.payFor(r), money(partsOf(r).rental), money(partsOf(r).utilities), money(partsOf(r).charges), money(r.amount), r.status || '', r.mode || '', r.bankRef || '', hasReceipt(r), r.docsLink || '', r.submittedByName || '', when(r.createdAt), r.verifiedByName || '', r.verifiedDate || '', r.editedByName || '', when(r.editedAt), r.remarks || '', r.id, r.bookingId || ''];
        const payments = [payHead, ...list.map(payRow)];
        const title = [[`Offline payments · ${propName} · ${from} to ${to}`], [`Made ${new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })} by ${useSession().name || ''}`], []];
        const file = `Offline_payments_${propName.replace(/[^A-Za-z0-9]+/g, '_')}_${label}`;
        if (kind === 'csv') { download(`${file}.csv`, toCSV(payments), 'text/csv'); }
        else {
          const X = await loadXlsxLib(), wb = X.utils.book_new();
          const sheet = (rows, name, widths) => { const ws = X.utils.aoa_to_sheet(rows); ws['!cols'] = widths.map(w => ({ wch: w })); X.utils.book_append_sheet(wb, ws, name); };
          sheet([...title, ...overview, ['By status', 'Payments', 'Total (RM)', 'Share'], ...byStatus, [], ['By property', ...head.slice(1)], ...byProp, sum(byProp)], 'Summary', [34, 14, 16, 14, 14, 14, 14]);
          if (R.type !== 'monthly') sheet([...title, ['By month', ...head.slice(1)], ...byMonth, sum(byMonth)], 'By month', [14, 12, 14, 14, 14, 14, 14]);
          sheet(payments, 'Payments', [12, 12, 28, 14, 24, 40, 18, 12, 12, 12, 14, 12, 14, 18, 12, 30, 18, 20, 18, 14, 18, 20, 30, 24, 24]);
          const out = X.write(wb, { type: 'array', bookType: 'xlsx' });
          download(`${file}.xlsx`, new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
        }
        toast('Report downloaded');
      } catch (e) { R.error = friendlyError(e, 'make the report'); }
      R.busy = false;
    },
    // ---- ONE-TIME import from the old Excel (18 Nov 2026). Remove with the button and lib/offline-import.js. ----
    async openImport() {
      this.imp = { list: null, skipped: [], already: [], repeats: [], allUnits: [], missing: [], choice: {}, map: {}, names: {}, file: '', busy: '', error: '', done: '' };
      if (!this.properties.length) { try { this.properties = await loadProperties(); } catch { this.imp.error = 'Could not load the property list.'; } }
    },
    async readImport(e) {
      const I = this.imp, file = e.target.files?.[0];
      if (!file) return;
      I.error = ''; I.busy = 'Reading the file…'; I.file = file.name;
      try {
        const X = await loadXlsxLib(), wb = X.read(await file.arrayBuffer(), { type: 'array' });
        if (!wb.Sheets[IMPORT_SHEET]) throw Object.assign(new Error(`This file has no "${IMPORT_SHEET}" tab.`), { plain: true });
        const { rows, skipped } = parseSheet(X.utils.sheet_to_json(wb.Sheets[IMPORT_SHEET], { header: 1, raw: true, defval: null }));
        I.busy = 'Checking units and payments already in the PMS…';
        // Every PMS unit (units are matched across all properties); staff names for Verified By; every payment already saved
        const [unitSnap, users, have] = await Promise.all([
          getDocs(collection(db, 'units')),
          getDocs(collection(db, 'users')).catch(() => ({ docs: [] })),
          getDocs(collection(db, 'offlinePayments'))]);
        I.allUnits = unitSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.active !== false && u.unitCode);
        users.docs.forEach(d => { const u = d.data(); if (u.email) I.names[String(u.email).toLowerCase()] = u.displayName || ''; });
        const saved = new Set(have.docs.map(d => sameKey(d.data())));
        // Same payment already saved, or the same row twice in the file (date, amount, guest, bank ref, unit, purpose, payment code)
        const firstOf = new Map(), list = [];
        for (const r of rows) {
          if (saved.has(sameKey(r))) { I.already.push(r); continue; }
          const k = [sameKey(r), norm(r.purpose), norm(r.remarks)].join('|');
          if (firstOf.has(k)) { I.repeats.push({ ...r, of: firstOf.get(k) }); continue; }
          firstOf.set(k, r.row); list.push(r);
        }
        I.skipped = skipped; I.list = list;
        // Sheet units with no PMS unit: grouped by code; a similar PMS unit is offered to confirm, else "Create new unit" is preset
        const idx = unitIndex(I.allUnits), groups = new Map(), propName = id => this.properties.find(p => p.id === id)?.name || id;
        for (const r of list) {
          const k = unitKey(r.unitCode);
          if (!k || idx.has(k)) continue;
          const g = groups.get(k) || { key: k, texts: [], props: [], count: 0 };
          if (!g.texts.includes(r.unitCode)) g.texts.push(r.unitCode);
          if (r.sheetProperty && !g.props.includes(r.sheetProperty)) g.props.push(r.sheetProperty);
          g.count++; groups.set(k, g);
        }
        const choice = {};
        I.missing = [...groups.values()].map(g => {
          const sim = similarUnits(g.key, I.allUnits);
          g.opts = [{ value: '', label: 'Choose…' }, ...sim.map(u => ({ value: u.id, label: `Same as ${u.unitCode} (${propName(u.propertyId)})` })),
            { value: 'new', label: 'Create new unit' }, { value: 'text', label: 'No unit (keep the sheet text)' }];
          g.similar = sim.length;
          choice[g.key] = { use: sim.length ? '' : 'new', code: cleanCode(g.texts[0]), propertyId: guessProperty(g.texts[0], I.allUnits) };
          return g;
        }).sort((a, b) => (b.similar ? 1 : 0) - (a.similar ? 1 : 0) || a.texts[0].localeCompare(b.texts[0]));
        I.choice = choice;
        if (!list.length) I.error = 'Nothing to import: every payment in the file is already in the PMS or has no amount.';
      } catch (err) { console.error('Offline payments import: reading failed', err); I.error = err.plain ? err.message : friendlyError(err, 'read the file'); }
      e.target.value = '';   // the same file can be chosen again
      I.busy = '';
    },
    impChoiceOk(key) {
      const c = this.imp.choice[key];
      return c.use === 'text' || (c.use === 'new' ? !!(c.propertyId && cleanCode(c.code)) : !!c.use);
    },
    async runImport() {
      const I = this.imp, me = useSession(), rows = this.impRows, make = this.impNewUnits;
      if (!rows.length || this.impPending) return;
      I.error = ''; I.busy = 'Importing…';
      let n = 0;
      try {
        // 1. New units first (no owner or fee arrangement; Accounting or a Director adds those in Portfolio)
        for (const [i, u] of make.entries()) {
          I.busy = `Creating unit ${i + 1} of ${make.length} (${u.code})…`;
          await saveUnit(me, { id: u.id, isNew: true, propertyId: u.propertyId, code: u.code, aliases: [], ownerId: null, info: {}, active: true,
            terms: null, termsChanged: false, effectiveFrom: new Date().toISOString().slice(0, 7), reason: 'Created by the one-time offline payments import',
            changes: [{ field: 'unitCode', old: null, new: u.code }] });
          I.allUnits.push({ id: u.id, unitCode: u.code, propertyId: u.propertyId, active: true });
        }
        for (const id of new Set(make.map(u => u.propertyId))) await forgetUnits(id);
        const states = {};
        for (const id of new Set(rows.map(r => r.propertyId).filter(Boolean))) states[id] = await stateFor(id);
        for (let i = 0; i < rows.length; i += 400) {
          const b = writeBatch(db), part = rows.slice(i, i + 400);
          for (const r of part) {
            const links = r.docsLink.split(/\s*\|\s*|\s+/).filter(l => /^https?:\/\//i.test(l));
            const verifier = r.verifiedEmail ? (I.names[r.verifiedEmail] || nameFromEmail(r.verifiedEmail)) : '';
            b.set(doc(collection(db, 'offlinePayments')), {
              ...(states[r.propertyId] ? { state: states[r.propertyId] } : {}),
              date: r.date, amount: r.amount, propertyId: r.propertyId, propertyName: r.propertyName, unitCode: r.unitCode,
              guest: r.guest, purpose: r.purpose, mode: '', bankRef: r.bankRef, docsLink: links[0] || '', ...(links.length > 1 ? { docsLinks: links } : {}),
              remarks: r.remarks, status: r.status, verifiedByName: verifier, verifiedDate: r.verifiedDate, roomType: r.roomType || '',
              // Sorted by the payment date (noon, Malaysia time); "Submitted by" is the person in the sheet, not the importer
              createdAt: Timestamp.fromDate(new Date(`${r.date}T12:00:00+08:00`)), createdBy: me.user.uid, submittedByName: r.submittedByName,
              source: 'excel-import', importedRow: r.row, importedAt: serverTimestamp()
            });
          }
          if (i + 400 >= rows.length) audit(b, me, { action: 'offlinePayment.import', entity: 'offlinePayments', reason: `One-time import from ${I.file}`,
            changes: [{ field: 'imported', old: null, new: rows.length }, { field: 'skipped', old: null, new: I.skipped.length }, { field: 'alreadyInPms', old: null, new: I.already.length }, { field: 'repeats', old: null, new: I.repeats.length }] });
          await b.commit(); n += part.length; I.busy = `Imported ${n} of ${rows.length}…`;
        }
        I.done = `${n} payments imported${make.length ? `, ${make.length} new units created` : ''}. Skipped: ${I.skipped.length} with no amount or date, ${I.already.length} already in the PMS, ${I.repeats.length} repeated in the file.`;
        toast('Import finished');
      } catch (err) {
        I.error = `${n ? `${n} of ${rows.length} were imported before this error. Running the import again skips those. ` : make.length ? 'Units created so far are kept and found next time. ' : ''}${err.code === 'permission-denied' ? 'Firestore refused the import.' : friendlyError(err, 'import the payments')}`;
      }
      I.busy = '';
    },
    setRemarks(r, v) { if (v !== (r.remarks || '')) this.patch(r, { remarks: v.trim() }, 'remarks', r.remarks || ''); }
  }
};
</script>

<style scoped>
/* 23 Nov 2026 (Khairul): simple form again; Purpose starts short (grows with the bill lines when Utilities fills it) */
/* 23 Nov 2026 (Khairul): section separators in the New offline payment form */
.op-sep { display: block; margin: 14px 0 0; padding-bottom: 6px; border-bottom: 2px solid var(--border); font-size: 16px; font-weight: 700; color: var(--text); }
.op-sep-first { margin-top: 2px; }
.np-top { display: flex; justify-content: space-between; align-items: center; }
/* 25 Nov 2026: Single booking / Group booking tabs and the group's unit table */
.np-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border); margin: 8px 0 12px; }
.np-tabs button { background: none; border: 0; border-bottom: 2px solid transparent; margin-bottom: -1px; padding: 8px 14px; font: inherit; font-size: 14px; font-weight: 600; color: var(--muted); cursor: pointer; }
.np-tabs button.on { color: var(--accent); border-bottom-color: var(--accent); }
.np-tabs button:hover:not(.on) { color: var(--text); }
.gp-sec { border: 1px solid var(--border); border-radius: var(--radius); padding: 12px 14px; display: grid; gap: 10px; }
.gp-sec-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 14px; }
.gp-sub { font-size: 12px; }
.gp-tgl { margin-left: auto; display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-2, var(--text)); cursor: pointer; }
.gp-2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 14px; }
.gp-2 > * { margin: 0; }
.gp-list { display: grid; gap: 6px; }
.gp-line { display: grid; grid-template-columns: minmax(0, 1fr) 150px; gap: 10px; align-items: center; padding: 6px 0; border-top: 1px solid var(--line, var(--border)); font-size: 13px; }
.gp-line3 { grid-template-columns: minmax(0, 1fr) 130px minmax(0, 1.2fr); }
.gp-line small, .gp-tick small, .gp-unit-head small { display: block; font-size: 11px; color: var(--muted); }
.gp-unit { border-top: 1px solid var(--line, var(--border)); padding-top: 8px; }
.gp-unit-head { display: flex; align-items: baseline; gap: 8px; font-size: 13px; margin-bottom: 4px; }
.gp-unit-head small { display: inline; }
.gp-tick { display: flex; align-items: center; gap: 10px; padding: 6px 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 13px; cursor: pointer; margin-bottom: 6px; }
.gp-tick:hover { border-color: var(--accent); }
.gp-tick input { width: 16px; height: 16px; accent-color: var(--accent); }
.gp-link { justify-self: start; font-size: 13px; }
.gp-all { color: var(--accent); font-weight: 700; }
.tgl { position: relative; flex: none; width: 38px; height: 22px; }
.tgl input { position: absolute; inset: 0; margin: 0; opacity: 0; cursor: pointer; z-index: 1; }
.tgl-track { position: absolute; inset: 0; border-radius: 999px; background: var(--border); transition: background .2s ease; }
.tgl-track::after { content: ""; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0, 0, 0, .2); transition: transform .2s ease; }
.tgl input:checked + .tgl-track { background: var(--accent); }
.tgl input:checked + .tgl-track::after { transform: translateX(16px); }
.tgl input:focus-visible + .tgl-track { outline: 2px solid var(--accent); outline-offset: 2px; }
@media (max-width: 640px) { .gp-2, .gp-line, .gp-line3 { grid-template-columns: minmax(0, 1fr); } .gp-tgl { margin-left: 0; } }
.gp-purpose { min-height: 96px; }
.gp-new { display: grid; gap: 10px; border-top: 1px dashed var(--border); padding-top: 10px; }
.up-add { border: 1px dashed var(--border); border-radius: 10px; padding: 10px 12px; }
.up-add-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-size: 14px; }
.up-add-head small { font-weight: 400; margin-left: 4px; }
.up-line { display: grid; grid-template-columns: 90px minmax(0, 1fr) minmax(0, 1fr) 120px; gap: 8px; align-items: center; margin-bottom: 6px; }
.up-kind { font-size: 13px; color: var(--text-2); }
.up-amt { -moz-appearance: textfield; appearance: textfield; }
.up-add .field { margin-top: 8px; }
.up-addbtn { justify-self: start; }
@media (max-width: 640px) { .up-line { grid-template-columns: 1fr 1fr; } }
.gp-fill { display: flex; align-items: flex-end; justify-content: flex-end; }
.gp-table { border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
.gp-row { display: grid; grid-template-columns: minmax(0, 1.4fr) repeat(4, minmax(0, 1fr)); gap: 10px; align-items: center; padding: 8px 12px; border-top: 1px solid var(--line, var(--border)); font-size: 13px; }
.gp-row:first-child { border-top: 0; }
.gp-row small { display: block; font-size: 11px; color: var(--muted); }
.gp-row .r { text-align: right; }
.gp-head { background: var(--head); font-size: 12px; font-weight: 600; color: var(--muted); }
.gp-foot { background: var(--head); font-weight: 600; }
.gp-amt { height: 34px; text-align: right; width: 100%; }
.gp-row .r small { margin-top: 2px; }
.gp-fill { gap: 8px; flex-wrap: wrap; }
.gp-grand { display: flex; justify-content: space-between; padding: 10px 12px; border-top: 1px solid var(--border); font-size: 14px; font-weight: 700; }
.gp-grand b { color: var(--accent); }
/* 23 Nov 2026 (Khairul): no ▲▼ spinners on money boxes in the new payment form */
/* 25 Nov 2026 (Khairul): popups with tabs keep one height on every tab (the body scrolls) */
/* (it sits 8vh from the top and grows down, so a minimum height stops it jumping between Single and Group booking) */
@media (min-width: 861px) { .modal.new-pay { min-height: 84vh; } }
.new-pay :deep(input[type=number]) { -moz-appearance: textfield; appearance: textfield; }
.new-pay :deep(input[type=number]::-webkit-outer-spin-button), .new-pay :deep(input[type=number]::-webkit-inner-spin-button) { -webkit-appearance: none; margin: 0; }
.op-util :deep(.up-amount) { margin-top: 12px; }
.purpose-box.purpose-new { min-height: 90px !important; field-sizing: content; max-height: 260px; }
.pay-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border); margin-top: 6px; }
.pay-tabs button { border: 0; background: none; padding: 10px 14px; font: inherit; font-size: 14px; color: var(--text-2); border-bottom: 2px solid transparent; cursor: pointer; }
.pay-tabs button.on { color: var(--accent); border-bottom-color: var(--accent); font-weight: 600; }
.tab-body { padding-top: 4px; }
.util-purpose { margin-top: 12px; }
.tab-off { padding: 14px; border: 1px dashed var(--border); border-radius: 10px; color: var(--muted); }
.soft-warn { margin: 0; }
.pay-total { margin-right: auto; display: grid; font-size: 16px; font-weight: 700; }
.pay-total small { font-size: 12px; font-weight: 400; color: var(--muted); }
.v-parts { display: grid; gap: 6px; margin: -4px 0 12px; }
.v-part { display: grid; grid-template-columns: 1fr auto; gap: 2px 10px; padding: 8px 12px; border: 1px solid var(--border); border-radius: 8px; font-size: 14px; }
.v-bill { grid-column: 1 / -1; display: flex; justify-content: space-between; font-size: 13px; color: var(--muted); padding-left: 10px; }
.head-actions { display: flex; gap: 8px; flex: none; margin-left: auto; }
.page-head > div:first-child { flex: 1 1 320px; min-width: 0; }
.live-line { margin-top: 6px; }
.kpis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; }
.kpis .kpi { padding: 12px 14px; }
.kpis .kpi .label { font-size: 12px; }
.kpis .kpi .value { font-size: 22px; margin-top: 2px; }
@media (max-width: 800px) { .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } .head-actions { flex-wrap: wrap; flex: 1 1 100%; margin-left: 0; min-width: 0; } }
/* Phones: the buttons share the width and wrap; + New offline payment takes its own full line (24 Nov 2026) */
@media (max-width: 600px) { .head-actions .btn { flex: 1 1 auto; } .head-actions .btn-primary { flex-basis: 100%; } }
/* Phone cards: property and unit, purpose and payment code wrap onto more lines instead of being cut short with "…" */
@media (max-width: 600px) {
  .op-table td { flex-wrap: wrap; row-gap: 2px; }
  .op-table td > div, .op-table td .clamp, .op-table td .op-code { white-space: normal; overflow: visible; text-overflow: clip; max-width: 100%; }
  .op-table td > div, .op-table td .op-code { flex: 0 1 auto; margin-left: auto; text-align: right; }
  .op-table td .clamp { -webkit-line-clamp: unset; line-clamp: unset; display: inline; }
}   /* 1 1 100%: the buttons wrap instead of running off a phone (24 Nov 2026) */
.who { font-size: 11px; color: var(--muted); margin-top: 2px; }
.tag.st-edited { background: #E6EEFB; color: #2B5DB8; }
.rep-modal { max-width: 640px; }
/* 16 Nov 2026: every picker in the report popup fills its column, all the same height */
.rep-modal :deep(.op), .rep-modal :deep(.pp), .rep-modal :deep(.mp) { display: block; width: 100%; }
.rep-modal :deep(.op-btn), .rep-modal :deep(.op-input), .rep-modal :deep(.mp-btn) { width: 100%; min-height: 44px; font-size: 15px; text-align: left; }
.rep-modal :deep(.op-pop) { max-width: none; width: 100%; }
.clamp { display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; line-height: 1.4; }
.v-purpose { grid-column: 1 / -1; }
.v-purpose b { white-space: pre-wrap; overflow-wrap: anywhere; font-weight: 600; line-height: 1.5; }
.purpose-box { min-height: 210px !important;   /* 23 Nov 2026 (Khairul): fits the numbered bill lines (about 8 lines) */ resize: vertical; line-height: 1.5; padding-top: 10px; }
.page-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
.filters { display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-end; margin-bottom: 8px; }
.filters .grow { flex: 1; min-width: 220px; }
.filters .f-status { width: 160px; }   /* wide enough for "Unknown" / "Edited" in its list (24 Nov 2026) */
.filters .f-search { flex: 1; min-width: 220px; }   /* fills the rest of the row */
.field label { display: block; font-size: 13px; color: var(--text-2); margin-bottom: 6px; }
/* 20 Nov 2026 (Khairul): fixed column widths so the table fits a laptop screen with no sideways scroll; long text ends in … */
.op-table { table-layout: fixed; width: 100%; }
/* Half screen and narrower (24 Nov 2026): the fixed columns need about 860px, else Purpose shrinks to nothing; scroll sideways in the box instead */
@media (min-width: 601px) and (max-width: 1024px) { .op-table { min-width: 860px; } }   /* not on phones: there the rows are cards and must fit the screen */
.op-table td, .op-table th { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-left: 10px; padding-right: 10px; }
.op-table td > div { overflow: hidden; text-overflow: ellipsis; }
.op-table td.purpose-cell { white-space: normal; }
.op-table td:first-child, .op-table th:first-child { padding-left: 16px; }
.op-table .num { text-align: right; }
.op-table .amt { font-variant-numeric: tabular-nums; }
.op-table .eye-col { padding-left: 0; padding-right: 8px; }
/* 20 Nov 2026 (Khairul): payment code readable: normal-size dark text on a light chip, one line, full text on hover */
.op-code { display: block; width: fit-content; max-width: 100%; margin-top: 4px; padding: 2px 6px; border-radius: 4px; background: #f1f5f9; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 12px; color: #475569; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.op-code .pc-k { font-family: inherit; font-size: 10px; margin-right: 6px; }
.op-table .empty { text-align: center; padding: 28px 16px; }
.op-table td :deep(.op-btn) { min-width: 110px; }
.tag { display: inline-block; padding: 2px 10px; border-radius: 99px; font-size: 12px; font-weight: 500; background: var(--head); color: var(--muted); }
.tag.st-checked { background: #E3F4EA; color: #1E7A45; }
.tag.st-pending { background: #FDEFD9; color: #B26A00; }
.tag.st-unknown { background: #ECEEF2; color: #555B66; }
.tag.st-mixed { background: #ECEEF2; color: #333A45; }
.g-units { display: grid; gap: 6px; margin-bottom: 6px; }
.g-unit { display: flex; justify-content: space-between; gap: 12px; align-items: center; text-align: left; padding: 8px 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface, #fff); font: inherit; cursor: pointer; }
.g-unit:hover { border-color: var(--accent); }
.g-u-main { display: grid; gap: 2px; min-width: 0; }
.g-u-main small { color: var(--muted); font-size: 12px; }
.g-u-side { display: grid; gap: 4px; justify-items: end; }
.pre { white-space: pre-line; }
.v-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.v-title { font-size: 18px; font-weight: 600; }
.v-sub { font-size: 13px; color: var(--muted); margin-top: 2px; }
.v-status { width: 150px; flex: none; }
.v-head > div:first-child { flex: 1; min-width: 0; }
.v-amount { margin: 10px 0; padding: 8px 14px; border-radius: 10px; background: var(--accent-soft); display: flex; justify-content: space-between; align-items: baseline; }
.v-amount span { font-size: 13px; color: var(--muted); }
.v-amount b { font-size: 18px; }
.v-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 20px; }
.hist { margin-top: 14px; }
.hist h4 { margin: 0 0 6px; font-size: 13px; }
.hist ul { list-style: none; margin: 0; padding: 0; max-height: 200px; overflow-y: auto; }
.hist li { padding: 8px 10px; margin-bottom: 6px; border: 1px solid var(--line); border-radius: 10px; font-size: 13px; }
.h-top { display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.h-chg { color: var(--muted); overflow-wrap: anywhere; }
.v-item { padding: 8px 0; border-bottom: 1px solid var(--line); display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.v-item span { font-size: 12px; color: var(--muted); font-weight: 500; text-transform: uppercase; letter-spacing: .03em; }
.v-item b { font-size: 15px; font-weight: 600; color: var(--text); overflow-wrap: anywhere; }
.wide { grid-column: 1 / -1; }
.v-files { margin-top: 14px; }
.v-edit-grid, .v-edit { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 20px; margin-top: 14px; }
@media (max-width: 640px) { .v-grid, .v-edit, .v-edit-grid { grid-template-columns: minmax(0, 1fr); } }
.fld-pick { display: block; width: 100%; }
.fld-pick :deep(.op) { display: block; width: 100%; }
.fld-pick :deep(.op-btn), .fld-pick :deep(.op-input) { width: 100%; min-height: 44px; font-size: 15px; }
.fld-pick :deep(.op-pop) { max-width: none; width: 100%; }
.table-wrap { min-height: 260px; }
.list-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 8px; }
.list-head .help { margin: 0; }
.layout-seg { margin: 0; width: 180px; }
.pay-list { display: flex; flex-direction: column; gap: 10px; }
/* 20 Nov 2026 (Khairul): same layout as Offline bookings cards: who | what for (fixed, centred) | amount | eye */
/* 23 Nov 2026 (Khairul): fixed amount and eye columns so the middle (Purpose) starts on the same line on every card */
.pay-card { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr) 230px 32px; align-items: center; gap: 20px;
  border: 1px solid var(--border); border-radius: 12px; padding: 14px 18px; cursor: pointer; background: var(--surface); transition: border-color var(--fast), box-shadow var(--fast); }
.pay-card:hover, .pay-card:focus-visible { border-color: color-mix(in srgb, var(--accent) 45%, transparent); box-shadow: 0 4px 14px rgba(0, 0, 0, .07); outline: none; }
/* Level 1: guest and amount. Level 2: booking and place. Level 3: purpose. Level 4: date, method, who. */
.pc-main { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.pc-name { font-size: 16px; font-weight: 700; color: var(--text); line-height: 1.3; }
.pc-place { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 13px; font-weight: 500; color: var(--text-2); }
.pc-no { font-size: 12px; font-weight: 600; padding: 1px 8px; border-radius: 6px; background: var(--chip); color: var(--text); letter-spacing: .02em; }
.pc-purpose { font-size: 13px; color: var(--text); }
.pc-one { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }   /* long bank refs stay on one line; full text on hover */
.pc-mid { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.pc-k { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); margin-right: 6px; }
.pc-meta { font-size: 12px; color: var(--muted); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pc-side { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
.pc-top { display: flex; align-items: center; gap: 8px; }
.pc-parts { text-align: right; line-height: 1.35; }
.pc-amt { font-size: 18px; font-weight: 700; color: var(--text); white-space: nowrap; font-variant-numeric: tabular-nums; }
/* 25 Nov 2026 (Khairul): chevron instead of the eye; theme colour + 2px nudge when the card is hovered or focused */
.pay-card .view-chev { justify-self: end; }
.pay-card:hover .view-chev, .pay-card:focus-visible .view-chev { color: var(--theme-color, var(--brand)); transform: translateX(2px); }
.pay-list .empty { text-align: center; padding: 28px 16px; }
@media (max-width: 640px) {
  .pay-card { grid-template-columns: minmax(0, 1fr) auto; gap: 12px; }
  .pc-main, .pc-mid { grid-column: 1; }
  .pc-side { grid-column: 2; grid-row: 1 / span 2; }
  .pay-card .view-chev { grid-column: 1 / -1; justify-self: start; }
}
.modal { max-width: 920px; width: min(920px, 100%); }
.modal { padding: 18px 24px 0; }
.modal .modal-foot { padding: 12px 0 18px; margin-top: 8px; }
.chk-modal { max-width: 440px; }
.chk-modal h2 { margin-bottom: 6px; }
.del-btn { margin-right: auto; color: var(--danger); }
.del-btn:hover:not(:disabled) { background: var(--danger) !important; border-color: var(--danger) !important; color: #fff !important; }
.modal .field { margin-bottom: 0; }
.modal .field label { margin-bottom: 4px; }
/* 19 Nov 2026: :deep so the inputs and labels inside FormField / ComboInput match the pickers (44px, 14px labels) */
.modal :deep(.input) { min-height: 44px; font-size: 15px; }
.modal :deep(.field label) { font-size: 14px; margin-bottom: 4px; }
.grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 20px; margin-bottom: 12px; }
@media (max-width: 640px) { .grid { grid-template-columns: minmax(0, 1fr); } }
/* ONE-TIME import popup (18 Nov 2026) */
.imp-modal { max-width: 720px; display: grid; gap: 12px; }
.imp-sum { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 8px; }
.imp-sum > div { display: grid; padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; }
.imp-sum b { font-size: 18px; }
.imp-sum span { font-size: 12px; color: var(--muted); }
.imp-box { border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; }
.imp-box h4 { margin: 0 0 4px; }
.imp-box summary { cursor: pointer; font-weight: 600; }
.imp-box ul { margin: 8px 0 0; padding-left: 18px; max-height: 200px; overflow: auto; font-size: 13px; }
.imp-map { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; align-items: center; margin-top: 8px; font-size: 14px; }
@media (max-width: 640px) { .imp-map { grid-template-columns: 1fr; } }
.imp-pick { display: grid; gap: 4px; justify-items: center; text-align: center; padding: 26px 16px; border: 2px dashed var(--border); border-radius: 12px; cursor: pointer; }
.imp-pick:hover { border-color: var(--accent); background: var(--accent-soft); }
.imp-pick b { font-size: 15px; color: var(--accent); }
.imp-pick.busy { cursor: progress; }
.imp-unit { display: grid; grid-template-columns: 1.1fr 1fr; gap: 8px 10px; align-items: center; padding: 10px 0; border-top: 1px solid var(--border); }
.imp-unit:first-of-type { border-top: 0; }
.imp-unit.todo .imp-u-name b { color: var(--danger, #c0392b); }
.imp-u-name { display: grid; gap: 2px; font-size: 14px; }
.imp-u-name span { font-size: 12.5px; }
.imp-unit > .input, .imp-unit > .imp-u-wide { grid-column: 2; }
@media (max-width: 640px) { .imp-unit { grid-template-columns: 1fr; } .imp-unit > .input, .imp-unit > .imp-u-wide { grid-column: auto; } }
.lbl-row { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.link-line { display: inline-flex; align-items: baseline; gap: 6px; font-size: 12px; color: var(--muted); }
.link-btn { background: none; border: 0; padding: 0; color: var(--accent); font: inherit; font-size: 12px; cursor: pointer; text-decoration: underline; }
</style>
