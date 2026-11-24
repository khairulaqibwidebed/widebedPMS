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
      <button type="button" class="card kpi kpi-link" :class="{ on: !status }" :aria-pressed="!status" @click="status = ''"><div class="label">Total submissions</div><div class="value">{{ rows.length }}</div></button>
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
              <b class="pc-amt">{{ `RM ${Number(r.amount || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` }}</b>
              <small class="who" v-if="partsShort(r)">{{ partsShort(r) }}</small>
              <span class="tag" :class="'st-' + (r.status || '').toLowerCase()">{{ r.status }}</span>
            </div>
            <button type="button" class="pc-eye" title="View payment" aria-label="View payment" @click.stop="openRow(r)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5C7 5 2.7 8.1 1 12c1.7 3.9 6 7 11 7s9.3-3.1 11-7c-1.7-3.9-6-7-11-7zm0 11.5A4.5 4.5 0 1 1 12 7.5a4.5 4.5 0 0 1 0 9zm0-7.2a2.7 2.7 0 1 0 0 5.4 2.7 2.7 0 0 0 0-5.4z"/></svg></button>
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
              <td class="num eye-col"><button type="button" class="pc-eye" title="View payment" aria-label="View payment" @click.stop="openRow(r)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5C7 5 2.7 8.1 1 12c1.7 3.9 6 7 11 7s9.3-3.1 11-7c-1.7-3.9-6-7-11-7zm0 11.5A4.5 4.5 0 1 1 12 7.5a4.5 4.5 0 0 1 0 9zm0-7.2a2.7 2.7 0 1 0 0 5.4 2.7 2.7 0 0 0 0-5.4z"/></svg></button></td>
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
            <FormField v-else-if="ed.isCharge" label="Charges amount (RM)" req type="number" min="0" step="0.01" v-model="ed.charge" />
            <FormField v-else label="Rental amount (RM)" type="number" min="0" step="0.01" v-model="ed.rental" />
            <div class="field"><label>Payment method</label>
              <OptionPicker class="fld-pick" v-model="ed.mode" :options="MODES" label="Payment method" /></div>
            <FormField label="Bank reference" v-model="ed.bankRef" placeholder="Reference no. on the bank slip" />
            <div class="field"><label class="req">Property</label>
              <PropertyPicker block class="fld-pick" v-model="ed.propertyId" :properties="properties" :before="[{ value: '', label: 'Choose property' }]" @change="editProperty" /></div>
            <div class="field"><label>Unit</label>
              <OptionPicker class="fld-pick" v-model="ed.unitCode" :disabled="!ed.propertyId" :options="[{ value: '', label: 'Choose unit' }, ...units.map(x => ({ value: x.unitCode, label: x.unitCode }))]" label="Unit" searchable /></div>
            <FormField label="Guest / tenant name" req v-model="ed.guest" placeholder="Full name as on IC / passport" />
            <div class="field" v-if="view.bookingId && !ed.isCharge"><label :class="{ req: r2(ed.rental) > 0 }">For month</label>
              <OptionPicker class="fld-pick" v-model="ed.forMonth" :options="monthOptions(monthsAround(ed.date, ed.forMonth))" label="For month" /></div>
            <!-- 23 Nov 2026: the Utilities part; changing it updates the bills -->
            <div class="field wide" v-if="view.bookingId && ed.u"><label>Utilities</label>
              <UtilityPart :u="ed.u" :allow-add="false" /><p class="help">{{ `Total ${money(r2(ed.rental) + r2(ed.u.amount))}` }}</p></div>
            <FormField v-if="canEdit" label="Payment code" v-model="ed.remarks" placeholder="Add payment code" />
            <div class="field wide"><label class="req">Purpose</label><textarea class="input purpose-box" rows="3" maxlength="1000" v-model="ed.purpose"></textarea></div>
          </div>
          <DriveFiles class="v-files" kind="offline-payments" :record-id="view.id" :label="nameOf(view)" :readonly="!(canEdit || opsEdit(view))" :key="view.id" @folder="l => saveFolder(view, l)" />
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

    <template v-if="open">
      <div class="modal-back" @click.self="open = false" v-esc="() => { open = false }">
        <!-- 23 Nov 2026 (Khairul): back to the simple flat form; "Payment for" picks Rental or Utilities (one part per payment).
             Rental shows Amount (+ For month with a booking); Utilities shows the booking's bills to tick. Old combined payments still open. -->
        <form class="modal new-pay" role="dialog" aria-label="New offline payment" @submit.prevent="submit" novalidate @wheel.capture="noWheel">
          <div class="card-head np-top"><h2 style="margin:0">New offline payment</h2><button type="button" class="icon-btn" aria-label="Close" @click="open = false">×</button></div>
          <div class="notice error" ref="newErr" v-show="formError">{{ formError }}</div>
          <div class="grid">
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
              <div class="field"><label class="req">Payment for</label>
                <OptionPicker class="fld-pick" v-model="f.tab" :options="payForOptions" label="Payment for" /></div>
              <template v-if="f.tab === 'rental'">
                <FormField label="Amount (RM)" req type="number" min="0" step="0.01" v-model="f.rental" placeholder="0.00" />
                <!-- 19 Nov 2026: a dropdown of the booking's months, check-in to check-out -->
                <div class="field" v-if="f.bookingId"><label class="req">For month</label>
                  <OptionPicker class="fld-pick" v-model="f.forMonth" :options="monthOptions(f.bookingMonths, f.monthNotes)" label="For month" /></div>
              </template>
              <!-- 24 Nov 2026 (Khairul): Charges = money for the booking kept apart from the rent (never counts towards a month).
                   What it is for is typed in Purpose and saved on the Charges part too. -->
              <template v-else-if="f.tab === 'charges'">
                <FormField label="Amount (RM)" req type="number" min="0" step="0.01" v-model="f.charge" placeholder="0.00" />
                <p class="help tab-off wide" v-if="!f.bookingId">Pick a booking in Guest / tenant name. A charge goes on its booking.</p>
                <p class="help wide" v-else>Kept apart from the rent: it shows under Charges on the booking's Payments tab and does not count towards any month. Write what it is for in Purpose.</p>
              </template>
              <template v-else>
                <div class="field wide"><label class="req">Utility bills</label>
                  <p class="help tab-off" v-if="!f.bookingId">Pick a booking in Guest / tenant name to see its bills.</p>
                  <UtilityPart v-else class="op-util" :u="f.u" :label="`${f.unitCode || ''} ${f.bookingNo || ''} utility`.trim()" /></div>
              </template>

              <div class="op-sep wide"><span>Details</span></div>
              <div class="field wide"><label class="req">Purpose</label><textarea class="input purpose-box purpose-new" rows="3" maxlength="1000" v-model="f.purpose" :placeholder="f.tab === 'charges' ? 'What the charge is for, e.g. Damage: broken lamp in the bedroom' : 'e.g. Rental, security deposit. Long notes are fine, e.g. Deposit = RM2000, Rental = RM2200, Total = RM4200; (-) Payroll = RM3050; Balance = RM950'"></textarea></div>
              <div class="field wide"><label class="req">Receipts / documents</label><DriveFiles kind="offline-payments" :record-id="newId" :label="nameOf(f)" :list-on-load="false" @folder="l => f.docsLink = l" /></div>
              <!-- 19 Nov 2026: Payment code is filled when checking, so it shows only once the status is Checked -->
              <div class="field wide" v-if="f.status === 'Checked'"><label class="req">Payment code</label><input class="input" v-model="f.remarks"></div>
            </template>
          </div>
          <div class="modal-foot">
            <button type="button" class="btn" @click="open = false">Cancel</button>
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
import { payCounts, payMonth, rentalOf } from '@/lib/booking-pay.js';
import { leaseMonths, leaseSlot, leaseSpan } from '@/lib/booking-invoice.js';   // 24 Nov 2026: lease months
import { loadGuestName } from '@/lib/portfolio-data.js';
import { scoped } from '@/lib/property-scope.js';
import { liveMixin } from '@/lib/use-live.js';
import UtilityPart from '@/components/UtilityPart.vue';
import { loadAllBookings, guestNames, forgetBookings } from '@/lib/booking-search.js';
import { r2, money, loadBills, blankUtil, utilAlloc, utilMax, utilPool, addLines, addTotal, linesProblem, newBill, linkBills, partsOf, purposeText, datesText, billOf, refillUtil, oldestFirst } from '@/lib/utility-bills.js';
import { withState } from '@/lib/states.js';
import LiveStatus from '@/components/LiveStatus.vue';

const MODES = ['Bank transfer', 'Cash', 'Card', 'Online banking / QR', 'Cheque', 'Other'].map(x => ({ value: x, label: x })); MODES.unshift({ value: '', label: 'Choose method' });
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
const blank = () => ({ date: today(), amount: '', rental: '', charge: '', tab: 'rental', u: blankUtil(), lastAuto: '', propertyId: '', unitCode: '', guest: '', purpose: '', mode: '', bankRef: '', docsLink: '', status: 'Pending', remarks: '', bookingId: '', bookingNo: '', forMonth: '', bookingMonths: [], monthNotes: {}, monthLabels: {} });

export default {
  popups: { ok: 'done' },   // 16 Nov 2026: its messages show as corner popups (lib/page-popups.js)
  mixins: [liveMixin],
  components: { PropertyPicker, FormField, OptionPicker, Paged, DriveFiles, MonthPicker, LiveStatus, ComboInput, UtilityPart },
  data() { return { MODES, STATUSES, STATUS_OPTS, rows: [], hist: [], showHist: false, loading: true, q: '', from: '', to: '', month: '', rep: null, imp: null, pendingLink: '', status: '', open: false, newId: '', view: null, chk: null, editing: false, ed: {}, f: blank(), activeBookings: [], names: guestNames, viewBills: {}, bkNote: '', layout: savedLayout(), properties: [], units: [], busy: false, error: '', formError: '', done: '' }; },
  watch: {
    view(r) { this.loadHistory(r); this.loadViewBills(r); },
    // 23 Nov 2026: the purpose fills itself from the Rental and Utilities tabs until it is typed over
    autoPurpose(v) { const f = this.f; if (!f.bookingId) return; if (!f.purpose.trim() || f.purpose === f.lastAuto) f.purpose = v; f.lastAuto = v; }
  },
  computed: {
    // The Guest / tenant suggestions: every booking this person may see (23 Nov 2026), with its stay status
    bookingOptions() {
      return this.activeBookings.map(b => ({ key: b.id, value: this.names[b.id] || b.bookingNo || b.id, dim: b.stay === 'Cancelled',
        hint: [b.bookingNo, b.unitCode || b.unitId, b.propertyName, `${b.arrival} to ${b.departure}`, b.stay].filter(Boolean).join(' · ') }));
    },
    // Operations (no Offline Payments Edit tick) record utility payments as Pending (rules Draft 1.03)
    canPayUtil() { const me = useSession(); return can(me, 'bookingForms.view') || can(me, 'offlineInquiries.view'); },
    newStatusOptions() { return this.canEdit ? this.statusOptions('') : [{ value: 'Pending', label: 'Pending' }]; },
    newTotal() { const f = this.f; return f.tab === 'utilities' ? (f.bookingId ? r2(f.u.amount) : 0) : f.tab === 'charges' ? r2(f.charge) : r2(f.rental); },
    payForOptions() { return this.canEdit ? [{ value: 'rental', label: 'Rental' }, { value: 'utilities', label: 'Utilities' }, { value: 'charges', label: 'Charges' }] : [{ value: 'utilities', label: 'Utilities' }]; },
    autoPurpose() {
      if (this.f.tab === 'charges') return '';   // 24 Nov 2026: Charges: staff write what it is for
      const f = this.f, ut = f.tab === 'utilities', pool = utilPool(f.u), alloc = ut && f.bookingId ? utilAlloc(f.u) : [];
      return purposeText({ rental: ut ? 0 : f.rental, forMonth: f.forMonth, utilities: ut && f.bookingId ? f.u.amount : 0, bills: alloc.map(a => pool.find(b => b.id === a.billId)).filter(Boolean) }, monthName);
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
    shown() {
      const q = this.q.trim().toLowerCase();
      return this.rows.filter(r => (!this.status || r.status === this.status) && (!this.from || r.date >= this.from) && (!this.to || r.date <= this.to)
        && (!q || [r.guest, r.propertyName, r.unitCode, r.bankRef, r.submittedByName, r.purpose, r.bookingNo].some(v => String(v || '').toLowerCase().includes(q))));
    }
  },
  async mounted() {
    await this.load();
    // 23 Nov 2026: a bill's "Record payment" on the booking opens the form on Utilities with that bill ticked
    const q = this.$route?.query || {};
    if (q.record && (this.canEdit || this.canPayUtil)) { this.openForm({ bookingId: String(q.record), billId: String(q.bill || '') }); this.$router.replace({ query: {} }); }
  },
  methods: {
    niceDate(d) { if (!d) return ''; const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']; return `${+d.slice(8, 10)} ${M[+d.slice(5, 7) - 1] || ''} ${d.slice(0, 4)}`; },
    // A status card: show only that status; clicking the card that is already on shows them all again
    pickStatus(s) { this.status = this.status === s ? '' : s; },
    openRow(r) { this.view = r; this.editing = false; this.pendingLink = ''; },
    setLayout(v) { this.layout = v; try { localStorage.setItem(LAYOUT_KEY, v); } catch { /* not remembered */ } },
    count(s) { return this.rows.filter(r => r.status === s).length; },
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
      this.f = blank(); if (!this.canEdit) this.f.tab = 'utilities'; this.newId = doc(collection(db, 'offlinePayments')).id; this.units = []; this.formError = ''; this.open = true;
      const list = this.loadActiveBookings();
      if (!this.properties.length) { try { this.properties = await loadProperties(); } catch { this.formError = 'Could not load the property list.'; } }
      if (!opts.bookingId) return;
      await list;
      const b = this.activeBookings.find(x => x.id === opts.bookingId);
      if (!b) { this.formError = 'That booking was not found in your bookings.'; return; }
      await this.pickBooking({ key: b.id }, { billId: opts.billId, quiet: true });
      this.f.tab = 'utilities';
    },
    // 23 Nov 2026 (Khairul): every booking this person may see (past, current, upcoming, Awaiting payment, cancelled), names filling in
    async loadActiveBookings() {
      this.bkNote = this.activeBookings.length ? '' : 'Loading bookings…';
      try { this.activeBookings = await loadAllBookings(); this.bkNote = this.activeBookings.length ? '' : 'No bookings found. Type the name.'; }
      catch { this.bkNote = 'Bookings could not be loaded. Type the name.'; }
    },
    r2, money,
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
    viewParts(r) {
      const p = partsOf(r), out = [];
      if (Array.isArray(r.parts) && r.parts.length) {
        if (p.rental > 0) out.push({ k: 'r', label: `Rental${p.forMonth ? ' · ' + monthName(p.forMonth) : ''}`, amount: p.rental });
        if (p.charges > 0) out.push({ k: 'c', label: 'Charges (kept apart from the rent)', amount: p.charges });
        if (p.utilities > 0) out.push({ k: 'u', label: 'Utilities', amount: p.utilities, bills: Object.entries(p.bills).map(([id, a]) => ({ id, amount: a, name: this.viewBills[id] ? datesText(this.viewBills[id]) : 'Bill ' + id.slice(0, 6) })) });
      }
      return out;
    },
    // 23 Nov 2026: the Rental · Utilities split only when a payment has both
    partsShort(r) { const p = partsOf(r); return !Array.isArray(r.parts) || !r.parts.length ? '' : p.charges > 0 ? 'Charges' : p.utilities > 0 && p.rental > 0 ? `Rental ${p.rental.toFixed(2)} · Utilities ${p.utilities.toFixed(2)}` : ''; },
    // 24 Nov 2026: Payment for, for the Excel / CSV
    payFor(r) { const p = partsOf(r); return p.charges > 0 ? 'Charges' : p.utilities > 0 && p.rental > 0 ? 'Rental + Utilities' : p.utilities > 0 ? 'Utilities' : 'Rental'; },
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
      if (f.forMonth && !f.bookingMonths.includes(f.forMonth)) f.forMonth = '';
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
      const inMonth = (x, m) => (lease.length ? lease[leaseSlot(lease, payMonth(x))].m === m : payMonth(x) === m);
      const sum = (m, ok) => rows.filter(x => ok(x) && (b.longTerm ? inMonth(x, m) : m === first)).reduce((a, x) => a + rentalOf(x), 0);   // 23 Nov 2026: Rental part only
      const notes = {};
      f.bookingMonths = months.filter(m => {
        if (!b.longTerm && m !== first) return sum(first, payCounts) < due - 0.005 || due <= 0;   // short term paid in full: no month left
        const paid = sum(m, payCounts), waiting = sum(m, x => x.status === 'Pending' || x.status === 'Edited');
        if (due > 0 && paid >= due - 0.005) return false;
        notes[m] = [paid > 0 ? `RM ${paid.toFixed(2)} of ${due.toFixed(2)} paid` : '', waiting > 0 ? `RM ${waiting.toFixed(2)} pending` : ''].filter(Boolean).join(', ');
        return true;
      });
      f.monthNotes = notes;
      if (f.forMonth && !f.bookingMonths.includes(f.forMonth)) f.forMonth = '';
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
      const rental = unk ? r2(f.amount) : f.tab === 'rental' ? r2(f.rental) : 0, util = !unk && f.tab === 'utilities' && f.bookingId ? r2(f.u.amount) : 0;
      const charge = !unk && f.tab === 'charges' ? r2(f.charge) : 0, total = r2(rental + util + charge);   // 24 Nov 2026: Charges
      const alloc = util > 0 ? utilAlloc(f.u) : [], newOn = !unk && f.tab === 'utilities' && f.bookingId && f.u.add.on && addTotal(f.u) > 0;
      const tab = t => { f.tab = t; return true; };
      this.formError = !f.date ? 'Choose the payment date.' : unk ? (!(rental > 0) ? 'Enter the amount.' : '')
        : f.tab === 'utilities' && !f.bookingId ? 'Pick a booking in Guest / tenant name to pay its utility bills.'
        : f.tab === 'charges' && !f.bookingId ? 'Pick a booking in Guest / tenant name. A charge goes on its booking.'
        : !(total > 0) ? (f.tab === 'utilities' ? 'Tick the bills this payment pays.' : 'Enter the amount.')
        : !this.canEdit && !(util > 0) ? 'Without the Offline Payments Edit tick you can record utility payments only: set Payment for to Utilities.'
        : !f.propertyId ? 'Choose the property.' : !f.guest.trim() ? 'Enter the guest name.'
        : !f.mode ? 'Choose the payment method.'
        : (f.status === 'Checked' && !String(f.remarks || '').trim()) ? 'Enter the payment code (needed for a Checked payment).'
        : (f.bookingId && rental > 0 && !/^\d{4}-\d{2}$/.test(f.forMonth || '') && tab('rental')) ? 'Choose the month this rental is for.'
        : (util > 0 && util > utilMax(f.u) + 0.005 && tab('utilities')) ? 'The Utilities amount is more than the ticked bills have left.'
        : (util > 0 && Math.abs(alloc.reduce((a, x) => a + x.amount, 0) - util) > 0.005 && tab('utilities')) ? 'Tick the bills this Utilities amount pays.'
        : (newOn && linesProblem(addLines(f.u)) && tab('utilities')) ? `New bill: ${linesProblem(addLines(f.u))}`
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
        const parts = linked && charge > 0 ? [{ type: 'charges', amount: charge, note: f.purpose.trim().slice(0, 1000) }]   // 24 Nov 2026: Charges, apart from the rent
          : linked && util > 0 ? [...(rental > 0 ? [{ type: 'rental', amount: rental, forMonth: f.forMonth || '' }] : []), { type: 'utilities', amount: util, bills: alloc }] : null;
        batch.set(ref, { ...(st ? { state: st } : {}), date: f.date, amount: total, propertyId: f.propertyId, propertyName: prop?.name || '', unitCode: f.unitCode,
          guest: f.guest.trim(), purpose: f.purpose.trim(), mode: f.mode, bankRef: f.bankRef.trim(), docsLink: f.docsLink.trim(), remarks: f.status === 'Checked' ? f.remarks.trim() : '',
          status: f.status, verifiedByName: f.status === 'Pending' ? '' : me.name, verifiedDate: f.status === 'Pending' ? '' : today(), createdAt: serverTimestamp(), createdBy: me.user.uid, submittedByName: me.name,
          ...(linked ? { bookingId: f.bookingId, bookingNo: f.bookingNo, ...(rental > 0 ? { forMonth: f.forMonth } : {}) } : {}),
          ...(parts ? { parts, billIds: alloc.map(x => x.billId), billsAt: serverTimestamp() } : {}) });
        audit(batch, me, { action: 'offlinePayment.create', entity: `offlinePayments/${ref.id}`, propertyId: f.propertyId, changes: [['amount', total], ['date', f.date], ['propertyName', prop?.name || ''], ['unitCode', f.unitCode], ['guest', f.guest.trim()], ['purpose', f.purpose.trim()], ['bankRef', f.bankRef.trim()], ['status', f.status],
          ...(linked ? [['bookingNo', f.bookingNo], ['forMonth', rental > 0 ? f.forMonth : '']] : []), ...(parts && charge > 0 ? [['charges', charge]] : parts ? [['rental', rental], ['utilities', alloc.map(x => `${x.billId} ${x.amount.toFixed(2)}`).join(', ')]] : [])].filter(([, v]) => v !== '').map(([field, v]) => ({ field, old: null, new: v })) });
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
        rental: pp.rental ? pp.rental.toFixed(2) : '', u: null, isCharge: pp.charges > 0, charge: pp.charges ? pp.charges.toFixed(2) : '' };
      // 23 Nov 2026: a booking's payment can pay its utility bills too; the bills it pays now start ticked (not a Charges payment, 24 Nov 2026)
      if (r.bookingId && !this.ed.isCharge) { const u = blankUtil(pp.bills); u.amount = pp.utilities ? pp.utilities.toFixed(2) : ''; u.touched = true; this.ed.u = u; this.loadBookingBills({ id: r.bookingId, propertyId: r.propertyId }, this.ed.u); }
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
      const charge = e.isCharge ? r2(e.charge) : 0, rental = e.isCharge ? 0 : withBills ? r2(e.rental) : r2(e.amount), util = withBills ? r2(e.u.amount) : 0, total = r2(rental + util + charge);
      const alloc = util > 0 ? utilAlloc(e.u) : [];
      this.formError = !e.date ? 'Choose the payment date.' : !(total > 0) ? 'Enter the amount.' : !e.propertyId ? 'Choose the property.' : !String(e.guest).trim() ? 'Enter the guest name.' : !String(e.purpose).trim() ? 'Enter the purpose.'
        : (this.canEdit && r.status === 'Checked' && !String(e.remarks || '').trim()) ? 'A Checked payment needs its payment code.'
        : (r.bookingId && rental > 0 && !/^\d{4}-\d{2}$/.test(e.forMonth || '')) ? 'Choose the month this payment is for.'
        : withBills && e.u.bills === null ? 'The utility bills are still loading.'
        : (util > 0 && util > utilMax(e.u) + 0.005) ? 'The Utilities amount is more than the ticked bills have left.'
        : (util > 0 && Math.abs(alloc.reduce((a, x) => a + x.amount, 0) - util) > 0.005) ? 'Tick the bills this Utilities amount pays.' : '';
      if (this.formError) return this.showError('edErr');
      const prop = this.properties.find(p => p.id === e.propertyId);
      const data = { date: e.date, amount: total, propertyId: e.propertyId, propertyName: prop?.name || r.propertyName || '', unitCode: e.unitCode,
        guest: String(e.guest).trim(), purpose: String(e.purpose).trim(), mode: e.mode || '', bankRef: String(e.bankRef).trim(), ...(this.canEdit ? { remarks: String(e.remarks || '').trim() } : {}), ...(r.bookingId ? { forMonth: rental > 0 ? e.forMonth : '' } : {}) };
      const now = Object.fromEntries(alloc.map(x => [x.billId, x.amount]));
      const billsChanged = withBills && JSON.stringify(Object.entries(pp.bills).sort()) !== JSON.stringify(Object.entries(now).sort());
      if (e.isCharge) { data.parts = [{ type: 'charges', amount: charge, note: data.purpose.slice(0, 1000) }]; data.billIds = []; }   // 24 Nov 2026
      else if (withBills && (util > 0 || (Array.isArray(r.parts) && r.parts.length))) {
        data.parts = [...(rental > 0 ? [{ type: 'rental', amount: rental, forMonth: e.forMonth || '' }] : []), ...(util > 0 ? [{ type: 'utilities', amount: util, bills: alloc }] : [])];
        data.billIds = alloc.map(x => x.billId);
      }
      const ops = this.opsEdit(r);
      if (ops && this.pendingLink) data.docsLink = this.pendingLink;
      const same = k => (k === 'parts' || k === 'billIds' ? JSON.stringify(r[k] || []) === JSON.stringify(data[k]) : (r[k] ?? '') === data[k]);
      const changes = Object.keys(data).filter(k => !same(k)).map(k => (k === 'parts' ? { field: 'parts', old: e.isCharge ? `Charges ${pp.charges.toFixed(2)}` : this.partsShort(r) || '', new: e.isCharge ? `Charges ${charge.toFixed(2)}` : `Rental ${rental.toFixed(2)} · Utilities ${util.toFixed(2)}` }
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
        const payHead = ['Payment Date', 'Booking no.', 'Property', 'Unit', 'Guest / tenant', 'Purpose', 'Payment for', 'Amount (RM)', 'Status', 'Payment mode', 'Bank reference', 'Receipt uploaded', 'Documents link', 'Submitted by', 'Submitted on', 'Verified by', 'Verified date', 'Edited by', 'Edited on', 'Payment code', 'Payment ID', 'Booking ID'];
        const payRow = r => [r.date, r.bookingNo || '', r.propertyName || '', r.unitCode || '', r.guest || '', r.purpose || '', this.payFor(r), money(r.amount), r.status || '', r.mode || '', r.bankRef || '', hasReceipt(r), r.docsLink || '', r.submittedByName || '', when(r.createdAt), r.verifiedByName || '', r.verifiedDate || '', r.editedByName || '', when(r.editedAt), r.remarks || '', r.id, r.bookingId || ''];
        const payments = [payHead, ...list.map(payRow)];
        const title = [[`Offline payments · ${propName} · ${from} to ${to}`], [`Made ${new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })} by ${useSession().name || ''}`], []];
        const file = `Offline_payments_${propName.replace(/[^A-Za-z0-9]+/g, '_')}_${label}`;
        if (kind === 'csv') { download(`${file}.csv`, toCSV(payments), 'text/csv'); }
        else {
          const X = await loadXlsxLib(), wb = X.utils.book_new();
          const sheet = (rows, name, widths) => { const ws = X.utils.aoa_to_sheet(rows); ws['!cols'] = widths.map(w => ({ wch: w })); X.utils.book_append_sheet(wb, ws, name); };
          sheet([...title, ...overview, ['By status', 'Payments', 'Total (RM)', 'Share'], ...byStatus, [], ['By property', ...head.slice(1)], ...byProp, sum(byProp)], 'Summary', [34, 14, 16, 14, 14, 14, 14]);
          if (R.type !== 'monthly') sheet([...title, ['By month', ...head.slice(1)], ...byMonth, sum(byMonth)], 'By month', [14, 12, 14, 14, 14, 14, 14]);
          sheet(payments, 'Payments', [12, 12, 28, 14, 24, 40, 18, 14, 12, 14, 18, 12, 30, 18, 20, 18, 14, 18, 20, 30, 24, 24]);
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
/* 23 Nov 2026 (Khairul): no ▲▼ spinners on money boxes in the new payment form */
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
  .op-table td .clamp { -webkit-line-clamp: unset; display: inline; }
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
.op-table tr.clickable:hover .pc-eye svg { fill: var(--accent); }
.op-table .empty { text-align: center; padding: 28px 16px; }
.op-table td :deep(.op-btn) { min-width: 110px; }
.tag { display: inline-block; padding: 2px 10px; border-radius: 99px; font-size: 12px; font-weight: 500; background: var(--head); color: var(--muted); }
.tag.st-checked { background: #E3F4EA; color: #1E7A45; }
.tag.st-pending { background: #FDEFD9; color: #B26A00; }
.tag.st-unknown { background: #ECEEF2; color: #555B66; }
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
.pay-card { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr) 200px 32px; align-items: center; gap: 20px;
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
.pc-side { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
.pc-amt { font-size: 18px; font-weight: 700; color: var(--text); white-space: nowrap; font-variant-numeric: tabular-nums; }
.pc-eye { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border: 0; border-radius: 8px; background: none; cursor: pointer; padding: 0; }
.pc-eye svg { width: 20px; height: 20px; fill: var(--muted); transition: fill var(--fast); }
.pay-card:hover .pc-eye svg, .pay-card:focus-visible .pc-eye svg { fill: var(--accent); }
.pay-list .empty { text-align: center; padding: 28px 16px; }
@media (max-width: 640px) {
  .pay-card { grid-template-columns: minmax(0, 1fr) auto; gap: 12px; }
  .pc-main, .pc-mid { grid-column: 1; }
  .pc-side { grid-column: 2; grid-row: 1 / span 2; }
  .pc-eye { grid-column: 1 / -1; justify-self: start; }
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
