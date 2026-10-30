<template>
  <main class="content">
    <div class="loading-bar" v-show="loading || busy"></div>

    <!-- ========== Header ========== -->
    <div class="page-head" v-show="!onProperty()">
      <div>
        <h1>{{ { properties: 'Properties', owners: 'Owners', bookings: 'Bookings' }[top] }}</h1>
        <div class="sub">
          <span>{{ `Portfolio › ${{ properties: 'Properties', owners: 'Owners', bookings: 'Bookings' }[top]} · ` }}</span>
          <span>{{ { properties: 'every property you have access to', owners: viewOnly ? 'who owns each unit' : 'who owns each unit and how they are paid', bookings: 'offline bookings made from Offline inquiries, e.g. long-term tenants not booked through eZee' }[top] }}</span>
        </div>
      </div>
      <div class="head-tools">
        <OptionPicker v-model="propertyId" :options="propertyOptionsAll" label="Property" @change="switchProperty()" v-show="top !== 'properties'" />
        <MonthPicker :ahead="1" v-model="asOf" @change="switchMonth()" v-if="!viewOnly" />
        <RefreshButton @refresh="go()" />
      </div>
    </div>

    <div class="page-head" v-show="onProperty()">
      <div>
        <h1>{{ propertyName() }}</h1>
        <div class="sub crumb"><a href="/Portfolio/properties" @click.prevent="toList('properties')">Portfolio</a> › <a href="/Portfolio/properties" @click.prevent="toList('properties')">Properties</a>
          <span>{{ ` › ${propertyName()}` + (viewOnly ? ' · view only' : '') }}</span></div>
      </div>
      <div class="head-tools">
        <OptionPicker v-model="propertyId" :options="propertyOptions" label="Property" @change="switchProperty()" />
        <MonthPicker :ahead="1" v-model="asOf" @change="switchMonth()" v-if="!viewOnly" />
        <RefreshButton @refresh="go()" />
        <button class="btn btn-primary" v-show="ptab === 'units'" @click="openUnit(null)" v-if="canAdd">+ Add unit</button>
        <button class="btn" v-show="ptab === 'overview'" @click="openProperty(property())" v-if="!viewOnly || canEdit">Edit property</button>
      </div>
    </div>

    <nav class="tabs" v-show="onProperty()" aria-label="Property sections">
      <template v-for="t in PTABS" :key="t.key"><button :class="{ on: ptab === t.key }" @click="setPtab(t.key)">{{ t.label }}</button></template>
    </nav>

    <div class="notice error" v-show="error">{{ error }}</div>
    <div class="notice ok" v-show="okMsg">{{ okMsg }}</div>

    <!-- ========== PROPERTIES LIST ========== -->
    <div v-show="top === 'properties' && !onProperty()">
      <section class="kpis">
        <button type="button" class="card kpi kpi-link" :class="{ on: !propAttn }" @click="propAttn = false; kpiGo('propList')"><div class="label">Properties</div><div class="value">{{ properties.length }}</div><div class="hint">Widebed manages</div></button>
        <button type="button" class="card kpi kpi-link" @click="propAttn = false; kpiGo('propList')"><div class="label">Units</div><div class="value">{{ allUnits.length }}</div><div class="hint">Across all properties</div></button>
        <template v-if="!viewOnly">
        <RouterLink class="card kpi kpi-link" :to="`/Finance/month-end?month=${asOf}`" title="Open Month-end payout"><div class="label">{{ `${monthOnly(asOf)} statements` }}</div>
          <div class="value small">{{ `${completedUnits()} of ${allUnits.length} completed` }}</div>
          <div class="hint">{{ `${properties.filter(p => !isDone(p.id)).length} ${properties.filter(p => !isDone(p.id)).length === 1 ? 'property' : 'properties'} still open` }}</div></RouterLink>
        <button type="button" class="card kpi kpi-link" :class="{ on: propAttn }" @click="propAttn = !propAttn; kpiGo('propList')" title="Show only properties with units not set up"><div class="label">Needs attention</div><div class="value" :class="{ alert: allUnits.filter(x => !x.terms).length }">{{ allUnits.filter(x => !x.terms).length }}</div><div class="hint">{{ propAttn ? 'Showing these properties · click to show all' : 'Units not set up yet' }}</div></button>
        </template>
      </section>
      <div class="pf-bar">
        <input class="input" type="search" placeholder="Search property..." v-model="propSearch" aria-label="Search property">
        <button class="btn btn-primary" @click="openProperty(null)" v-if="canAdd">+ Add property</button>
      </div>
      <section class="card" ref="propList">
        <h2 class="t">{{ viewOnly ? 'Properties' : `Properties · ${monthName(asOf)}` }}</h2>
        <Paged :items="shownProperties()" v-slot="{ pageRows }">
        <div class="table-wrap">
          <table class="table">
            <thead v-if="viewOnly"><tr><th>Property</th><th>Short code</th><th class="num">Units</th><th>City · State</th><th></th></tr></thead>
            <thead v-else><tr><th>Property</th><th class="num">Units</th><th>Arrangement mix</th><th>{{ `${monthOnly(asOf)} statements` }}</th><th>Status</th><th>Needs attention</th><th></th></tr></thead>
            <tbody>
              <template v-for="p in pageRows" :key="p.id">
                <tr class="clickable" @click="openPropertyPage(p.id)" v-if="viewOnly">
                  <td class="strong">{{ p.name }}</td>
                  <td>{{ p.code || '—' }}</td>
                  <td class="num">{{ unitsOf(p.id).length }}</td>
                  <td>{{ [p.info?.city, p.info?.state].filter(Boolean).join(' · ') || '—' }}</td>
                  <td class="num"><button class="navlink" @click.stop="openPropertyPage(p.id)">Open →</button></td>
                </tr>
                <tr class="clickable" @click="openPropertyPage(p.id)" v-else>
                  <td class="strong">{{ p.name }}</td>
                  <td class="num">{{ unitsOf(p.id).length }}</td>
                  <td>{{ mixText(unitsOf(p.id)) }}</td>
                  <td>{{ !unitsOf(p.id).length ? 'Not started' : `${isDone(p.id) ? unitsOf(p.id).length : (monthDocs[p.id]?.completedUnits || 0)} of ${unitsOf(p.id).length} completed` }}</td>
                  <td><span class="pill" :class="isDone(p.id) ? 'green' : 'grey'">{{ isDone(p.id) ? 'Completed' : 'Draft' }}</span></td>
                  <td :class="attentionText(p.id) === '—' ? 'muted' : 'att'">{{ attentionText(p.id) }}</td>
                  <td class="num"><button class="navlink" @click.stop="openPropertyPage(p.id)">Open →</button></td>
                </tr>
              </template>
              <tr v-show="!loading && !shownProperties().length"><td :colspan="viewOnly ? 5 : 7" class="muted">{{ viewOnly ? 'No properties yet.' : 'No properties yet. Add one, or upload an eZee report and it is created for you.' }}</td></tr>
            </tbody>
          </table>
        </div>
        </Paged>
        <div class="card-foot"><span>{{ `Click a property to open its tabs (${PTABS.map(t => t.label).join(', ')}).` }}</span></div>
      </section>
    </div>

    <!-- ========== OWNERS (top tab, and the property's Owners tab) ========== -->
    <div v-show="(top === 'owners' && !onProperty()) || (onProperty() && ptab === 'owners')">
      <section class="card">
        <div class="card-head"><h2>{{ `Owners · ${shownOwners().length}` }}</h2>
          <div class="pills"><button class="pill-btn" :class="{ on: !showInactive }" @click="showInactive = false">Active</button><button class="pill-btn" :class="{ on: showInactive }" @click="showInactive = true">Deactivated</button></div></div>
        <p class="card-intro" v-if="canEdit">Owner names and contact details are personal data (PDPA): Finance, Directors and Marketing see them. Click an owner to edit. Bank details stay with Finance.</p>
        <p class="card-intro" v-else-if="viewOnly">Owner names, contact and bank details are personal data (PDPA), seen only by Finance and Directors. This list shows each owner's units only.</p>
        <p class="card-intro" v-else>Owner names and bank details are personal data (PDPA). Only Finance and Directors can see the full details; this list shows the owner's name and the last 4 digits of the bank account.
          Owner details can later come from the Google Sheet staff already keep (cached copy plus Sync now).</p>
        <div class="toolbar tb-split"><input class="input" type="search" placeholder="Search owner name or unit" v-model="ownerSearch" aria-label="Search owner"><button class="btn btn-primary" @click="openOwnerForm(null)" v-if="canAdd">+ Add owner</button></div>
        <Paged :items="shownOwners()" v-slot="{ pageRows }">
        <div class="table-wrap">
          <table class="table">
            <thead v-if="viewOnly"><tr><th v-if="canEdit">Owner</th><th>Units</th><th>Status</th></tr></thead>
            <thead v-else><tr><th>Owner</th><th>Units</th><th>Arrangement</th><th>Paid to</th><th class="num">Carried forward (RM)</th><th></th></tr></thead>
            <tbody>
              <template v-for="own in pageRows" :key="own.id">
                <tr v-if="viewOnly" :class="{ clickable: canEdit }" @click="canEdit && openOwnerForm(own)">
                  <td class="strong" v-if="canEdit">{{ ownerName(own.id) || 'No name saved' }}</td>
                  <td>{{ ownerUnits(own.id).map(x => propertyId === 'all' ? `${x.unitCode} · ${propertyNameOf(x.propertyId)}` : x.unitCode).join(', ') || '—' }}</td>
                  <td><span class="pill" :class="own.active === false ? 'grey' : 'green'">{{ own.active === false ? 'Deactivated' : 'Active' }}</span></td>
                </tr>
                <tr class="clickable" @click="openOwner(own)" v-else>
                  <td class="strong">{{ ownerName(own.id) || 'No name saved' }}</td>
                  <td>{{ ownerUnits(own.id).map(x => x.unitCode).join(', ') || '—' }}</td>
                  <td>{{ [...new Set(ownerUnits(own.id).map(x => arrLabel(x.terms?.arrangement)))].join(', ') || '—' }}</td>
                  <td>{{ own.bankLast4 ? `Bank transfer ···${own.bankLast4}` : '—' }}</td>
                  <td class="num" :class="{ 'neg-amt': carried(own.id) < 0 }">{{ amt(carried(own.id)) }}</td>
                  <td class="num"><button class="navlink" @click.stop="openOwner(own)">View</button></td>
                </tr>
              </template>
              <tr v-show="!loading && !shownOwners().length"><td :colspan="viewOnly ? (canEdit ? 3 : 2) : 6" class="muted">{{ viewOnly ? 'No owners here.' : 'No owners here yet. Add one, then link their units on the Units tab.' }}</td></tr>
            </tbody>
          </table>
        </div>
        </Paged>
        <div class="card-foot"><span>{{ `Showing ${shownOwners().length} of ${owners.length} owners` }}</span></div>
      </section>
    </div>

    <!-- ========== BOOKINGS (offline, read-only) ========== -->
    <div v-show="top === 'bookings' && !onProperty()">
      <section class="kpis">
        <button type="button" class="card kpi kpi-link" :class="{ on: bookingKind === 'all' }" @click="bookingKind = 'all'; kpiGo('bookList')"><div class="label">Offline bookings</div><div class="value">{{ offlineBookings.length }}</div><div class="hint">Made from Offline inquiries</div></button>
        <button type="button" class="card kpi kpi-link" :class="{ on: bookingKind === 'long' }" @click="bookingKind = 'long'; kpiGo('bookList')"><div class="label">Long-term tenants</div><div class="value">{{ offlineBookings.filter(x => x.longTerm).length }}</div><div class="hint">30 nights or more</div></button>
        <button type="button" class="card kpi kpi-link" :class="{ on: bookingKind === 'short' }" @click="bookingKind = 'short'; kpiGo('bookList')"><div class="label">Short stays</div><div class="value">{{ offlineBookings.filter(x => !x.longTerm).length }}</div><div class="hint">29 nights or less</div></button>
        <button type="button" class="card kpi kpi-link" :class="{ on: bookingKind === 'noEzee' }" @click="bookingKind = 'noEzee'; kpiGo('bookList')"><div class="label">Not in eZee yet</div><div class="value" :class="{ alert: offlineBookings.filter(x => !x.ezeeReservationNo).length }">{{ offlineBookings.filter(x => !x.ezeeReservationNo).length }}</div><div class="hint">No eZee reservation no. linked</div></button>
      </section>
      <section class="card">
        <div class="card-head"><h2>Offline bookings</h2></div>
        <p class="card-intro">Stays made outside eZee, such as long-term tenants.</p>
        <div class="toolbar" ref="bookList">
          <input class="input" type="search" placeholder="Search booking no., unit or tenant ID" v-model="bookingSearch" aria-label="Search booking">
        </div>
        <Paged :items="shownBookings()" v-slot="{ pageRows }">
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Booking no.</th><th>Unit</th><th>Tenant</th><th>Check-in</th><th>Check-out</th><th>Type</th><th class="num" v-if="!viewOnly">Amount (RM)</th><th>eZee no.</th><th v-if="canOpenInquiry"></th></tr></thead>
            <tbody>
              <template v-for="bkRow in pageRows" :key="bkRow.id">
                <tr>
                  <td class="strong nw">{{ bkRow.id }}</td>
                  <td class="nw">{{ propertyId === 'all' && bkRow.propertyName ? `${bkRow.propertyName} · ${bkRow.unitCode}` : bkRow.unitCode }}</td>
                  <td class="nw">{{ bkRow.tenantId || '—' }}</td>
                  <td class="nw">{{ dmy(bkRow.arrival) }}</td>
                  <td class="nw">{{ dmy(bkRow.departure) }}</td>
                  <td class="nw">{{ bkRow.longTerm ? 'Long-term lease' : 'Short stay' }}</td>
                  <td class="num nw" v-if="!viewOnly">{{ bkRow.longTerm ? `${amt(bkRow.monthlyRent)} a month` : amt(bkRow.amount) }}</td>
                  <td class="nw"><span v-if="bkRow.ezeeReservationNo">{{ bkRow.ezeeReservationNo }}</span><span class="pill amber" v-else>Not added</span></td>
                  <td class="num" v-if="canOpenInquiry"><RouterLink class="navlink" v-if="bkRow.inquiryId" :to="`/Operations/offline-inquiries?id=${bkRow.inquiryId}`">View</RouterLink><span class="muted" v-else>—</span></td>
                </tr>
              </template>
              <tr v-show="!shownBookings().length"><td :colspan="9 - (viewOnly ? 1 : 0) - (canOpenInquiry ? 0 : 1)" class="muted">{{ bookingsLoading ? 'Loading offline bookings…' : bookingSearch.trim() ? 'No bookings match.' : 'No offline bookings yet. They are made from Offline inquiries with Create booking, or with + New booking.' }}</td></tr>
            </tbody>
          </table>
        </div>
        </Paged>
        <div class="card-foot" v-if="!viewOnly"><span>Invoice and receipt PDFs are made from a booking, approved by Finance, saved to the company Google Drive and listed on Finance › Invoices & Receipts. Nothing is sent automatically.</span></div>
      </section>
    </div>

    <!-- ========== PROPERTY: OVERVIEW ========== -->
    <div v-show="onProperty() && ptab === 'overview'">
      <section class="kpis">
        <button type="button" class="card kpi kpi-link" @click="filter = 'all'; setPtab('units')"><div class="label">Units</div><div class="value">{{ units.length }}</div><div class="hint">{{ viewOnly ? typeText(units) || 'None yet' : mixText(units) || 'None yet' }}</div></button>
        <button type="button" class="card kpi kpi-link" v-if="viewOnly" @click="setPtab('owners')"><div class="label">Owners</div><div class="value">{{ new Set(units.map(x => x.ownerId).filter(Boolean)).size }}</div><div class="hint">Linked to these units</div></button>
        <template v-else>
        <button type="button" class="card kpi kpi-link" @click="filter = 'fixed'; setPtab('units')"><div class="label">Fixed rent a month</div><div class="value small">{{ `RM ${amt(fixedTotal())}` }}</div><div class="hint">{{ `${units.filter(x => x.terms?.arrangement === 'fixedRent').length} fixed-rent units` }}</div></button>
        <RouterLink class="card kpi kpi-link" :to="`/Finance/month-end?property=${propertyId}&month=${asOf}`" title="Open Month-end payout"><div class="label">{{ `${monthOnly(asOf)} statements` }}</div><div class="value small">{{ isDone(propertyId) ? 'Completed' : 'Open' }}</div><div class="hint">Month-end payout</div></RouterLink>
        <button type="button" class="card kpi kpi-link" @click="filter = 'none'; setPtab('units')"><div class="label">Needs attention</div><div class="value" :class="{ alert: units.filter(x => !x.terms).length }">{{ units.filter(x => !x.terms).length }}</div><div class="hint">Units not set up</div></button>
        </template>
      </section>
      <section class="card">
        <div class="card-head"><h2>Property details</h2><button class="editlink" @click="openProperty(property())" v-if="!viewOnly || canEdit">Edit ›</button></div>
        <div class="info-grid">
          <div>
            <div class="kv"><span>Property name</span><span>{{ property().name }}</span></div>
            <div class="kv"><span>Short code</span><span>{{ property().code || '—' }}</span></div>
            <div class="kv"><span>Address</span><span>{{ info().address || '—' }}</span></div>
            <div class="kv"><span>City · State</span><span>{{ `${info().city || '—'} · ${info().state || '—'}` }}</span></div>
          </div>
          <div>
            <div class="kv"><span>eZee account number</span><span>{{ info().ezeeAccount || '—' }}</span></div>
            <div class="kv"><span>Name in the eZee report</span><span>{{ info().ezeeName || '—' }}</span></div>
            <p class="help">{{ viewOnly ? 'Each unit\'s owner, type and rooms are on the Units tab.' : 'Unit details (owner, type, rooms, size, car parks, bill accounts, JMB) are on each unit: Units tab, Edit.' }}</p>
          </div>
        </div>
      </section>
    </div>

    <!-- ========== PROPERTY: UNITS ========== -->
    <div v-show="onProperty() && ptab === 'units'">
      <div class="notice warn" v-show="!viewOnly && units.filter(x => !x.terms).length && (property().code || '').toUpperCase() === 'DM'">
        <span>{{ `${units.filter(x => !x.terms).length} units aren't set up yet.` }}</span> <button class="link" style="margin-left:8px" @click="loadStarter()" :disabled="busy">{{ `Load D'Majestic starter settings from ${monthName(asOf)}` }}</button>
      </div>
      <section class="card">
        <h2 class="t">{{ `Units · ${units.length}` }}</h2>
        <p class="card-intro" v-if="viewOnly">{{ `Every unit in this property with its owner code, type and rooms. ${canAdd ? 'You can add a unit; changes to' : 'Changes to'} units, fees and rent are made by Finance and Directors.` }}</p>
        <p class="card-intro" v-else>Click a unit to change its settings (arrangement, owner, fixed rent, eZee name, status). Saving asks which month the change starts from and why, so completed months never change. Every change goes in the audit log below.</p>
        <div class="toolbar">
          <input class="input" type="search" placeholder="Search unit or owner" v-model="search" aria-label="Search unit">
          <div class="pills" v-if="!viewOnly">
            <template v-for="f in filters" :key="f.key">
              <button class="pill-btn" :class="{ on: filter === f.key }" @click="filter = f.key">{{ `${f.label} (${units.filter(x => match(x, f.key)).length})` }}</button>
            </template>
          </div>
        </div>
        <Paged :items="shown()" v-slot="{ pageRows }">
        <div class="table-wrap">
          <table class="table">
            <thead v-if="viewOnly"><tr><th>Unit</th><th>Owner</th><th>Type</th><th class="num">Bedrooms</th><th class="num">Bathrooms</th><th class="num">Size (sq ft)</th></tr></thead>
            <thead v-else><tr><th>Unit</th><th>Arrangement</th><th>Fixed rent</th><th class="num">Monthly amount (RM)</th><th>Effective from</th><th>Last changed</th><th></th></tr></thead>
            <tbody>
              <template v-for="row in pageRows" :key="row.id">
                <tr v-if="viewOnly" :class="{ clickable: canEdit }" @click="canEdit && openUnit(row)">
                  <td class="strong">{{ row.unitCode }}</td>
                  <td>{{ ownerLabel(row.ownerId) || '—' }}</td>
                  <td>{{ row.info?.type || '—' }}</td>
                  <td class="num">{{ row.info?.bedrooms ?? '—' }}</td>
                  <td class="num">{{ row.info?.bathrooms ?? '—' }}</td>
                  <td class="num">{{ row.info?.sizeSqft ?? '—' }}</td>
                </tr>
                <tr class="clickable" :class="{ future: futureOf(row) }" @click="openUnit(row)" v-else>
                  <td class="strong">{{ row.unitCode }}</td>
                  <td><span v-show="row.terms">{{ arrLabel(row.terms?.arrangement) }}</span><span class="pill amber" v-show="!row.terms">Not set up</span></td>
                  <td><span class="toggle" :class="{ on: row.terms?.arrangement === 'fixedRent' }" role="img" :aria-label="row.terms?.arrangement === 'fixedRent' ? 'Fixed rent on' : 'Fixed rent off'"></span></td>
                  <td class="num">{{ row.terms?.arrangement === 'fixedRent' ? amt(row.terms.fixedRentAmount) : '—' }}</td>
                  <td>{{ row.terms ? shortName(row.terms.effectiveFrom === '2000-01' ? asOf : row.terms.effectiveFrom) : '—' }}</td>
                  <td>
                    <span>{{ lastChanged(row) }}</span>
                    <span class="sub-line" v-show="futureOf(row)">{{ futureText(row) }}</span>
                  </td>
                  <td class="num"><button class="editlink" @click.stop="openUnit(row)">Edit ›</button></td>
                </tr>
              </template>
              <tr v-show="!loading && !shown().length"><td :colspan="viewOnly ? 6 : 7" class="muted">No units match.</td></tr>
            </tbody>
          </table>
        </div>
        </Paged>
        <div class="card-foot"><span>{{ viewOnly ? `Showing ${shown().length} of ${units.length} units` : `Showing ${shown().length} of ${units.length} units · ${units.filter(x => x.terms?.arrangement === 'fixedRent').length} on fixed rent · RM ${amt(fixedTotal())} a month` }}</span></div>
      </section>

      <section class="card" style="margin-top:20px" v-if="!viewOnly">
        <h2 class="t">Audit log · unit settings</h2>
        <p class="card-intro">Every change is recorded with who, when, old and new value, effective month and reason. Saving asks for the reason. Entries can't be edited or deleted.</p>
        <Paged :items="audits.filter(x => /^unit/.test(x.action || ''))" keep-page @page="onAuditPage" v-slot="{ pageRows }">
        <div class="table-wrap">
          <table class="table audit-tbl hover-rows">
            <colgroup><col style="width:170px"><col style="width:130px"><col style="width:110px"><col><col style="width:120px"><col style="width:22%"></colgroup>
            <thead><tr><th>When</th><th>Who</th><th>Unit</th><th>Change</th><th>Effective from</th><th>Reason</th></tr></thead>
            <tbody>
              <template v-for="a in pageRows" :key="a.id">
                <tr><td class="nw">{{ stamp(a.at) }}</td><td class="nw">{{ a.userName || '' }}</td><td class="nw">{{ unitCodeOfEntity(a.entity) }}</td>
                  <td><div class="chg" v-for="(c, i) in changeList(a)" :key="i">{{ c }}</div></td><td>{{ a.month ? shortName(a.month) : '—' }}</td><td>{{ a.reason || '—' }}</td></tr>
              </template>
              <tr v-show="!audits.filter(x => /^unit/.test(x.action || '')).length"><td colspan="6" class="muted">No unit changes recorded yet.</td></tr>
            </tbody>
          </table>
        </div>
        </Paged>
        <div class="more-row" v-show="auditMore && audits.filter(x => /^unit/.test(x.action || '')).length <= 10"><button type="button" class="btn" @click="loadAudits(true)" :disabled="auditBusy">Load 30 more changes</button></div>
      </section>
    </div>

    <!-- ========== PROPERTY: FEES & RATES ========== -->
    <div v-show="onProperty() && ptab === 'rates'" v-if="!viewOnly">
      <section class="card">
        <h2 class="t">Fees by arrangement</h2>
        <p class="card-intro">Normal rates for each owner arrangement. A unit can have its own rate on the Units tab. Fees are taken from the unit's monthly total after OTA commission; unit costs come off after the fee.</p>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Arrangement</th><th class="num">Service fee</th><th class="num">Utility fee</th><th class="num">SST on fee</th><th class="num">Units here</th></tr></thead>
            <tbody>
              <template v-for="(a, k) in ARRANGEMENTS" :key="k">
                <tr><td class="strong">{{ a.label }}</td>
                  <td class="num">{{ k === 'fixedRent' ? '—' : pct(a.serviceFeePct) }}</td>
                  <td class="num">{{ k === 'fixedRent' ? '—' : pct(a.utilityFeePct) }}</td>
                  <td class="num">{{ k === 'fixedRent' ? '—' : pct(a.sstOnFeePct) }}</td>
                  <td class="num">{{ units.filter(x => x.terms?.arrangement === k).length }}</td></tr>
              </template>
            </tbody>
          </table>
        </div>
      </section>
      <section class="card" style="margin-top:20px">
        <div class="card-head"><h2>Rules for this property</h2><span class="help">{{ rates.current ? `In force for ${monthName(asOf)}: from ${rates.current.effectiveFrom === '2000-01' ? 'the start' : monthName(rates.current.effectiveFrom)}` : '' }}</span></div>
        <div class="switch" style="border-top:0;margin-top:0"><div><b>Early check-in money goes to the owner</b><div class="help">After SST. Other incidentals stay with Widebed.</div></div>
          <input type="checkbox" v-model="rates.earlyToOwner" aria-label="Early check-in money to owner"></div>
        <div class="grid-fields">
          <div class="field"><label for="rTT">Tourism Tax per unit per night (RM)</label><input class="input" id="rTT" type="number" step="0.01" v-model="rates.tourismTax"><span class="help">Non-Malaysian guests only. Kept apart in the exports.</span></div>
          <div></div>
          <div class="field"><label>Applies from</label>
            <select class="input" v-model="rates.effectiveFrom"><template v-for="m in months" :key="m"><option :value="m" :selected="m === rates.effectiveFrom">{{ monthName(m) }}</option></template></select></div>
          <div class="field"><label for="rWhy1">Reason (audit log)</label><input class="input" id="rWhy1" v-model="rates.reason" placeholder="e.g. Owner agreement changed"></div>
        </div>
        <div class="actions"><button class="btn btn-primary" @click="saveRates()" :disabled="busy">Save fees & rates</button></div>
      </section>
    </div>

    <!-- ========== PROPERTY: OTA COMMISSIONS ========== -->
    <div v-show="onProperty() && ptab === 'ota'" v-if="!viewOnly">
      <section class="card">
        <div class="card-head"><h2>OTA commission and payout type</h2><span class="help">{{ rates.current ? `In force for ${monthName(asOf)}` : '' }}</span></div>
        <p class="card-intro">Net: the site pays Widebed after taking its commission. Gross: the site invoices its commission separately. Ctrip uses its rate only as an estimate until Finance types the Trip.com amount.</p>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Channel</th><th>Payout</th><th class="num">Commission %</th><th class="num">Payment fee %</th><th>How the guest price is worked out</th></tr></thead>
            <tbody>
              <template v-for="k in Object.keys(rates.form)" :key="k">
                <tr>
                  <td class="strong">{{ rates.form[k].label }}</td>
                  <td><select class="input" style="height:34px;min-width:150px" v-model="rates.form[k].payout"><option value="net">Net</option><option value="gross">Gross</option></select></td>
                  <td class="num"><input class="input inline-input" type="number" step="0.01" v-model="rates.form[k].commission" :aria-label="`${rates.form[k].label} commission`"></td>
                  <td class="num"><input class="input inline-input" type="number" step="0.01" v-model="rates.form[k].paymentFee" v-show="rates.form[k].payout === 'gross'" :aria-label="`${rates.form[k].label} payment fee`"><span class="muted" v-show="rates.form[k].payout !== 'gross'">—</span></td>
                  <td class="help">{{ rates.form[k].payout === 'net' ? `(room + SST) ÷ ${(100 - Number(rates.form[k].commission || 0)).toFixed(2)}%` : 'room + SST, less commission, payment fee and 8% SST on each' }}</td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
        <div class="grid-fields" style="margin-top:16px">
          <div class="field"><label>Applies from</label>
            <select class="input" v-model="rates.effectiveFrom"><template v-for="m in months" :key="m"><option :value="m" :selected="m === rates.effectiveFrom">{{ monthName(m) }}</option></template></select></div>
          <div class="field"><label for="rWhy2">Reason (audit log)</label><input class="input" id="rWhy2" v-model="rates.reason" placeholder="e.g. Agoda raised commission from October"></div>
        </div>
        <div class="actions"><button class="btn btn-primary" @click="saveRates()" :disabled="busy">Save OTA commissions</button></div>
      </section>
    </div>

    <!-- ========== PROPERTY: AUDIT LOG ========== -->
    <div v-show="onProperty() && ptab === 'audit'" v-if="!viewOnly">
      <section class="card">
        <h2 class="t">Audit log</h2>
        <p class="card-intro">Every change to this property: who, when, old and new value, start month and reason. Entries can't be edited or deleted.</p>
        <Paged :items="audits" keep-page @page="onAuditPage" v-slot="{ pageRows }">
        <div class="table-wrap">
          <table class="table audit-tbl hover-rows">
            <colgroup><col style="width:170px"><col style="width:130px"><col style="width:150px"><col><col style="width:100px"><col style="width:22%"></colgroup>
            <thead><tr><th>When</th><th>Who</th><th>What</th><th>Change</th><th>Month</th><th>Reason</th></tr></thead>
            <tbody>
              <template v-for="a in pageRows" :key="a.id">
                <tr><td class="nw">{{ stamp(a.at) }}</td><td class="nw">{{ a.userName || '' }}</td><td class="nw">{{ actionText(a) }}</td>
                  <td><div class="chg" v-for="(c, i) in changeList(a)" :key="i">{{ c }}</div></td><td>{{ a.month ? shortName(a.month) : '—' }}</td><td>{{ a.reason || '—' }}</td></tr>
              </template>
              <tr v-show="!audits.length"><td colspan="6" class="muted">Nothing recorded yet.</td></tr>
            </tbody>
          </table>
        </div>
        </Paged>
        <div class="more-row" v-show="auditMore && audits.length <= 10"><button type="button" class="btn" @click="loadAudits(true)" :disabled="auditBusy">Load 30 more changes</button></div>
      </section>
    </div>

    <!-- ========== Drawer: Edit / Add unit ========== -->
    <template v-if="unitOpen && (!viewOnly || canEdit || (canAdd && u.isNew))">
      <div>
        <div class="drawer-back" @click="unitOpen = false"></div>
        <aside class="drawer" role="dialog" aria-label="Edit unit" v-esc="() => { unitOpen = false }">
          <div class="drawer-head"><h2>{{ u.isNew ? 'Add unit' : `Edit unit · ${u.unitCode}` }}</h2><button class="icon-btn" @click="unitOpen = false" aria-label="Close">×</button></div>
          <form class="drawer-body" id="unitForm" @submit.prevent="saveUnit()">
            <div class="notice error" v-show="u.error">{{ u.error }}</div>
            <p class="help from-listing" v-if="u.fromListing">{{ `Filled in from new owner listing ${u.fromListing.listingId}. Check the details, then Save unit.` }}</p>
            <div class="field"><label for="uCode">Unit code</label>
              <input class="input" id="uCode" v-model="u.unitCode" :readonly="!u.isNew" :placeholder="`${property().code || 'DM'} 1615`">
              <span class="help" v-show="u.isNew">{{ property().code ? `Starts with this property's code (${property().code}), then the floor and unit, e.g. ${property().code} 0719. You can change it.` : 'This property has no short code yet. Type the unit code as Finance writes it.' }}</span></div>
            <div class="field"><label for="uAlias">Other eZee names for this unit</label>
              <input class="input" id="uAlias" v-model="u.aliases" placeholder="e.g. DM 1509-2"><span class="help">Comma between names. Bookings under these names count for this unit on the next upload.</span></div>
            <div class="field"><label for="uOwner">Owner</label>
              <OptionPicker class="full-pick" v-model="u.ownerId" :options="ownerOptions(u)" label="Owner" searchable :disabled="viewOnly && !u.isNew" />
              <span class="help">{{ viewOnly && !u.isNew ? 'A change of owner is made by Finance or a Director.' : 'Not in the list? Add them on the Owners tab first.' }}</span></div>
            <div class="form-sec">Unit details</div>
            <div class="field"><label for="uType">Unit type</label>
              <OptionPicker class="full-pick" v-model="u.info.type" :options="unitTypeOptions" label="Unit type" searchable add-label="Type" @add="addUnitType" /></div>
            <div class="grid-fields">
              <div class="field"><label for="uBed">Bedrooms</label><input class="input" id="uBed" type="number" min="0" v-model="u.info.bedrooms"></div>
              <div class="field"><label for="uBath">Bathrooms</label><input class="input" id="uBath" type="number" min="0" v-model="u.info.bathrooms"></div>
              <div class="field"><label for="uSize">Size (sq ft)</label><input class="input" id="uSize" type="number" min="0" v-model="u.info.sizeSqft"></div>
              <div class="field"><label for="uPark">Car parks</label><input class="input" id="uPark" type="number" min="0" v-model="u.info.carParks"></div>
            </div>
            <div class="form-sec">Bills and management</div>
            <div class="grid-fields">
              <div class="field"><label for="uTnb">TNB account</label><input class="input" id="uTnb" v-model="u.info.tnb"></div>
              <div class="field"><label for="uWater">Water bill account</label><input class="input" id="uWater" v-model="u.info.water"></div>
              <div class="field"><label for="uWifi">Wi-Fi bill account</label><input class="input" id="uWifi" v-model="u.info.wifi"></div>
              <div class="field"><label for="uSew">Sewerage bill account</label><input class="input" id="uSew" v-model="u.info.sewerage"></div>
            </div>
            <div class="field"><label for="uJmb">JMB / MC (condo management) phone or email</label><input class="input" id="uJmb" v-model="u.info.jmb"></div>
            <template v-if="!viewOnly">
            <hr class="divider">
            <div class="field"><label for="uArr">Arrangement</label>
              <OptionPicker class="full-pick" v-model="u.arrangement" :options="arrangementOptions" label="Arrangement" searchable /></div>
            <div class="switch" style="border-top:0;margin-top:-6px"><span>Fixed rent</span>
              <button type="button" class="toggle" :class="{ on: u.arrangement === 'fixedRent' }" style="border:0" @click="u.arrangement = u.arrangement === 'fixedRent' ? '' : 'fixedRent'" aria-label="Fixed rent"></button></div>
            <div class="field" v-show="u.arrangement === 'fixedRent'"><label for="uFix">Fixed rent a month (RM)</label><input class="input" id="uFix" type="number" step="0.01" v-model="u.fixedRentAmount"></div>
            <template v-if="u.arrangement && u.arrangement !== 'fixedRent'">
              <div class="grid-3">
                <div class="field"><label>Service fee %</label><input class="input" type="number" step="0.01" v-model="u.serviceFeePct" :placeholder="ARRANGEMENTS[u.arrangement].serviceFeePct * 100"></div>
                <div class="field"><label>Utility fee %</label><input class="input" type="number" step="0.01" v-model="u.utilityFeePct" :placeholder="ARRANGEMENTS[u.arrangement].utilityFeePct * 100"></div>
                <div class="field"><label>SST on fee %</label><input class="input" type="number" step="0.01" v-model="u.sstOnFeePct" :placeholder="ARRANGEMENTS[u.arrangement].sstOnFeePct * 100"></div>
              </div>
            </template>
            <div class="grid-fields">
              <div class="field"><label>Applies from</label>
                <select class="input" v-model="u.effectiveFrom"><template v-for="m in months" :key="m"><option :value="m" :selected="m === u.effectiveFrom">{{ monthName(m) }}</option></template></select></div>
              <div class="field" v-show="!u.isNew"><label>Unit in use</label>
                <label class="help" style="height:40px;display:flex;align-items:center;gap:8px"><input type="checkbox" v-model="u.active"> Active</label></div>
            </div>
            </template>
            <p class="help" v-else>Arrangement, fixed rent and fees are set by Finance or a Director after the unit is added.</p>
            <div class="field"><label for="uWhy">Reason (audit log)</label><textarea class="input" id="uWhy" v-model="u.reason" placeholder="e.g. New owner agreement from June"></textarea></div>
            <template v-if="!viewOnly">
            <hr class="divider">
            <h3 style="margin:0 0 6px;font-size:14px">Settings history</h3>
            <div class="rows history-list">
              <template v-for="h in u.history" :key="h.id">
                <div class="row"><span>{{ `From ${h.effectiveFrom === '2000-01' ? 'the start' : monthName(h.effectiveFrom)} · ${arrLabel(h.arrangement)}` + (h.fixedRentAmount ? ` RM ${amt(h.fixedRentAmount)}` : '') + (h.reason ? ` · ${h.reason}` : '') }}</span><span class="r help">{{ h.createdByName || '' }}</span></div>
              </template>
              <div class="empty" v-show="!u.history?.length">No settings yet.</div>
            </div>
            </template>
          </form>
          <div class="drawer-foot">
            <button class="icon-btn trash" style="margin-right:auto" v-if="isDirector && !u.isNew" @click="deleteUnit()" :disabled="busy" title="Delete this unit from the system" aria-label="Delete unit">🗑</button>
            <button class="btn" @click="unitOpen = false">Cancel</button>
            <button class="btn btn-primary" type="submit" form="unitForm" :disabled="busy">{{ busy ? 'Saving…' : 'Save unit' }}</button>
          </div>
        </aside>
      </div>
    </template>

    <!-- ========== Drawer: Add / edit property ========== -->
    <template v-if="propOpen && (!viewOnly || canEdit || (canAdd && !np.id))">
      <div>
        <div class="drawer-back" @click="propOpen = false"></div>
        <aside class="drawer wide" role="dialog" aria-label="Property" v-esc="() => { propOpen = false }">
          <div class="drawer-head"><h2>{{ np.id ? `Edit property · ${np.name}` : 'Add property' }}</h2><button class="icon-btn" @click="propOpen = false" aria-label="Close">×</button></div>
          <form class="drawer-body" id="propForm" @submit.prevent="saveProperty()">
            <div class="notice error" v-show="np.error">{{ np.error }}</div>
            <p class="help from-listing" v-if="np.fromListing">{{ `Filled in from new owner listing ${np.fromListing.listingId}. Add the short code and the rest, then Add property.` }}</p>
            <div class="form-sec">Property details</div>
            <div class="grid-fields">
              <div class="field"><label for="pName">Property name</label><input class="input" id="pName" v-model="np.name" placeholder="e.g. D'Majestic"></div>
              <div class="field"><label for="pCode">Short code</label><input class="input" id="pCode" v-model="np.code" :readonly="!!np.id" placeholder="e.g. DM">
                <span class="help">Starts every unit number in this property, e.g. DM 07-19.</span></div>
              <div class="field" style="grid-column:1/-1"><label for="pAddr">Address</label><input class="input" id="pAddr" v-model="np.info.address" placeholder="Street address"></div>
              <div class="field"><label for="pCity">City</label><input class="input" id="pCity" v-model="np.info.city" placeholder="e.g. Kuala Lumpur"></div>
              <div class="field"><label for="pState">State</label>
                <select class="input" id="pState" v-model="np.info.state"><option value="">Select state</option>
                  <template v-for="st in STATES" :key="st"><option :value="st" :selected="st === np.info.state">{{ st }}</option></template></select></div>
            </div>
            <div class="form-sec">eZee link</div>
            <p class="help" style="margin:-4px 0 10px">Tells the upload which eZee rows belong to this property.</p>
            <div class="grid-fields">
              <div class="field"><label for="pEzAcc">eZee account number</label><input class="input" id="pEzAcc" v-model="np.info.ezeeAccount" placeholder="e.g. 9979">
                <span class="help">Several buildings can share one eZee account.</span></div>
              <div class="field"><label for="pEzName">Name in the eZee report</label><input class="input" id="pEzName" v-model="np.info.ezeeName" placeholder="As it appears in the export"></div>
            </div>
            <div class="field" v-show="np.id"><label for="pWhy">Reason (audit log)</label><input class="input" id="pWhy" v-model="np.reason" placeholder="e.g. New TNB account number"></div>
            <p class="help" v-show="!np.id">{{ viewOnly ? 'After saving, add its units from the Units tab. It starts with the standard OTA rates; Finance or a Director can change them. The change is recorded in the audit log.'
              : 'After saving, add its units from the Units tab. It starts with the standard OTA rates (change them under OTA commissions). The change is recorded in the audit log.' }}</p>
          </form>
          <div class="drawer-foot"><button class="btn" @click="propOpen = false">Cancel</button><button class="btn btn-primary" type="submit" form="propForm" :disabled="busy">{{ np.id ? 'Save property' : 'Add property' }}</button></div>
        </aside>
      </div>
    </template>

    <!-- ========== Drawer: Owner (view / edit / add) ========== -->
    <template v-if="ownerOpen && (!viewOnly || canEdit || (canAdd && o.isNew))">
      <div>
        <div class="drawer-back" @click="ownerOpen = false"></div>
        <aside class="drawer wide" role="dialog" aria-label="Owner" v-esc="() => { ownerOpen = false }">
          <div class="drawer-head"><h2>{{ o.isNew ? 'Add owner' : (o.fullName || 'Owner') }}</h2><button class="icon-btn" @click="ownerOpen = false" aria-label="Close">×</button></div>
          <form class="drawer-body" id="ownerForm" @submit.prevent="saveOwner()">
            <div class="notice error" v-show="o.error">{{ o.error }}</div>
            <p class="help from-listing" v-if="o.fromListing">{{ `Filled in from new owner listing ${o.fromListing.listingId}. Check the details, then Add owner.` }}</p>
            <div class="notice warn" v-show="o.active === false">{{ `Deactivated${o.deactivatedReason ? ': ' + o.deactivatedReason : ''}. Their history stays; they can't be linked to new units.` }}</div>
            <template v-if="!o.isNew && !viewOnly">
              <div>
                <div class="summary-grid">
                  <div><b>{{ ownerUnits(o.id).length }}</b><span>Units</span></div>
                  <div><b :class="{ 'neg-amt': carried(o.id) < 0 }">{{ amt(carried(o.id)) }}</b><span>{{ `Carried forward into ${shortName(asOf)} (RM)` }}</span></div>
                  <div><b>{{ o.payouts.length }}</b><span>Payouts on record</span></div>
                </div>
                <div class="form-sec">Properties and units</div>
                <div class="rows">
                  <template v-for="x in ownerUnits(o.id)" :key="x.id"><div class="row"><span>{{ `${x.unitCode} · ${propertyNameOf(x.propertyId)}` }}</span><span class="r">{{ arrLabel(x.terms?.arrangement) }}</span></div></template>
                  <div class="empty" v-show="!ownerUnits(o.id).length">No units linked. Link them from a property's Units tab.</div>
                </div>
                <div class="form-sec">Payout history</div>
                <div class="rows">
                  <template v-for="h in o.payouts.slice(0, 12)" :key="h.id"><div class="row"><span>{{ `${shortName(h.month)} · ${h.unitCode}` }}</span><span class="r" :class="{ neg: h.payout < 0 }">{{ `RM ${amt(h.payout)}` }}</span></div></template>
                  <div class="empty" v-show="!o.payouts.length">No payouts yet.</div>
                </div>
              </div>
            </template>
            <div class="form-sec">Personal details <span class="help" style="text-transform:none;letter-spacing:0;font-weight:400">{{ canEdit ? '· private, Finance, Directors and Marketing only' : viewOnly ? '· private: once saved, only Finance and Directors see them' : '· private, Finance and Directors only' }}</span></div>
            <div class="grid-fields">
              <div class="field"><label for="oName">Full name</label><input class="input" id="oName" v-model="o.fullName" placeholder="e.g. Owner A"></div>
              <div class="field"><label for="oIc">IC / passport</label><input class="input" id="oIc" v-model="o.ic"></div>
              <div class="field"><label for="oEmail">Email</label><input class="input" id="oEmail" type="email" v-model="o.email"></div>
              <div class="field"><label for="oPhone">Phone number</label><input class="input" id="oPhone" v-model="o.phone"></div>
              <div class="field"><label for="oDob">Date of birth</label><input class="input" id="oDob" type="date" v-model="o.dob"></div>
              <div class="field"><label for="oWa">WhatsApp</label><input class="input" id="oWa" v-model="o.whatsapp"></div>
              <div class="field"><label for="oWc">WeChat ID</label><input class="input" id="oWc" v-model="o.wechat"></div>
              <div></div>
              <div class="field" style="grid-column:1/-1"><label for="oAddr">Correspondence address</label><textarea class="input" id="oAddr" v-model="o.address"></textarea></div>
            </div>
            <template v-if="!viewOnly">
            <div class="form-sec">Bank</div>
            <div class="grid-3">
              <div class="field"><label for="oBank">Bank name</label><input class="input" id="oBank" v-model="o.bankName"></div>
              <div class="field"><label for="oHolder">Account holder name</label><input class="input" id="oHolder" v-model="o.accountHolder"></div>
              <div class="field"><label for="oAcc">Bank account</label><input class="input" id="oAcc" v-model="o.bankAccount" inputmode="numeric"></div>
            </div>
            </template>
            <p class="help" v-else>Bank details are added by Finance or a Director.</p>
            <div class="field" v-show="!o.isNew"><label for="oWhy">Reason (audit log)</label><input class="input" id="oWhy" v-model="o.reason" placeholder="e.g. Owner changed bank"></div>
            <template v-if="!o.isNew && o.active !== false && !viewOnly">
              <div class="confirm-box" v-show="o.deactivating">
                <div class="field" style="margin-bottom:10px"><label for="oDeact">Why deactivate this owner? <span style="color:#d92d20">*required</span></label><input class="input" id="oDeact" v-model="o.deactivateReason" placeholder="e.g. Sold the unit"></div>
                <button type="button" class="btn btn-primary" @click="deactivateOwner()" :disabled="busy || !o.deactivateReason.trim()">Deactivate owner</button> <button type="button" class="btn" @click="o.deactivating = false">Keep active</button>
              </div>
            </template>
          </form>
          <div class="drawer-foot">
            <button class="icon-btn trash" style="margin-right:auto" v-if="isDirector && !o.isNew" @click="deleteOwner()" :disabled="busy" title="Delete this owner from the system" aria-label="Delete owner">🗑</button>
            <button class="btn" v-show="!viewOnly && !o.isNew && o.active !== false && !o.deactivating" @click="startDeactivate()">Deactivate</button>
            <button class="btn btn-primary" v-show="!viewOnly && !o.isNew && o.active === false" @click="reactivateOwner()" :disabled="busy">Reactivate</button>
            <button class="btn" @click="ownerOpen = false">Cancel</button>
            <button class="btn btn-primary" type="submit" form="ownerForm" :disabled="busy">{{ o.isNew ? 'Add owner' : 'Save owner' }}</button>
          </div>
        </aside>
      </div>
    </template>

  </main>
</template>

<script>
import { markRaw } from 'vue';
import { setDoc, collection, doc, getDoc, getDocs, query, where, orderBy, limit, startAfter, writeBatch, updateDoc, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase.js';
import { ARRANGEMENTS, DEFAULT_OTA, DM_STARTER, unitIdOf } from '@/lib/engine.js';
import { loadProperties, loadUnits, loadSetup, latestVersion, audit, friendlyError } from '@/lib/finance-data.js';
import { propertyMonth, markFrom, canWriteSummaries } from '@/lib/summary-data.js';
import { ALL_MONTHS } from '@/lib/summaries.js';
import { amt, monthName, monthOffset, stamp, pct, dmy } from '@/lib/format.js';
import { useSession } from '@/stores/session.js';
import { cached, clearCache, patchCache, TTL } from '@/lib/cache.js';
import RefreshButton from '@/components/RefreshButton.vue';
import { askConfirm, showNotice } from '@/lib/confirm.js';
import { lastProperty, rememberProperty } from '@/lib/last-property.js';
import { peekHandoff, takeHandoff } from '@/lib/handoff.js';

const me = useSession();

let params = new URLSearchParams(location.search);
const pctIn = v => (v === '' || v == null ? null : Number(v) / 100);
const pctOut = v => (v == null ? '' : +(v * 100).toFixed(4));
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
const AUDIT_PAGE = 30;
const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const msOf = t => (t?.toMillis ? t.toMillis() : 0);
const dateOnly = t => { if (!t) return ''; const d = t.toDate ? t.toDate() : new Date(t); return `${d.getDate()} ${MON3[d.getMonth()]} ${d.getFullYear()}`; };
const prevMonth = ym => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const PRIVATE = ['fullName', 'ic', 'email', 'phone', 'dob', 'whatsapp', 'wechat', 'address', 'bankName', 'accountHolder', 'bankAccount'];
const PROP_INFO = ['address', 'city', 'state', 'ezeeAccount', 'ezeeName'];
const UNIT_INFO = ['type', 'bedrooms', 'bathrooms', 'sizeSqft', 'carParks', 'tnb', 'water', 'wifi', 'sewerage', 'jmb'];
const STATES = ['Johor', 'Kedah', 'Kelantan', 'Melaka', 'Negeri Sembilan', 'Pahang', 'Perak', 'Perlis', 'Pulau Pinang', 'Sabah', 'Sarawak', 'Selangor', 'Terengganu',
  'W.P. Kuala Lumpur', 'W.P. Labuan', 'W.P. Putrajaya'];
const CARRY = ['search', 'filter', 'propSearch', 'ownerSearch', 'showInactive', 'bookingSearch', 'okMsg'];
let carry = null;
// View-only roles (Khairul 21 Oct): properties, units, owner codes and offline bookings; no fees, payouts,
// statements, audit log or owner personal details, and none of those are read from Firestore.
const VIEWERS = ['operations', 'procurement', 'marketing'];
const ALL_PTABS = [{ key: 'overview', label: 'Overview' }, { key: 'units', label: 'Units' }, { key: 'owners', label: 'Owners' },
  { key: 'rates', label: 'Fees & rates' }, { key: 'ota', label: 'OTA commissions' }, { key: 'audit', label: 'Audit log' }];
// Operations may also add properties, units and owners (Khairul 21 Oct): no fees, rent or bank details, and no editing.
const ADDERS = ['director', 'finance', 'operations', 'marketing'];
const BANK = ['bankName', 'accountHolder', 'bankAccount'];
const UNIT_TYPES = ['Studio', '1 bedroom', '2 bedrooms', '3 bedrooms', 'Dual key', 'Penthouse', 'Other'];

import OptionPicker from '@/components/OptionPicker.vue';
import MonthPicker from '@/components/MonthPicker.vue';
export default {
  components: { OptionPicker, MonthPicker, RefreshButton },
  beforeCreate() { params = new URLSearchParams(location.search); },
  data() {
    return {
      ARRANGEMENTS, STATES, UNIT_TYPES, amt, monthName, stamp, pct, dmy,
      canLogInquiry: me.role === 'director',   // logging inquiries is Directors only for now
      viewOnly: VIEWERS.includes(me.role),
      isDirector: me.role === 'director',
      canOpenInquiry: ['director', 'finance', 'operations'].includes(me.role),   // who may open Offline inquiries
      canAdd: ADDERS.includes(me.role),    // + Add property / unit / owner
      // Marketing also open and edit properties, units and owners (Khairul 27 Oct): details and contact only, no money,
      // owner link, status or bank details.
      canEdit: me.role === 'marketing',
      canBook: ['director', 'finance', 'operations'].includes(me.role),   // + New booking (direct, no inquiry)
      PTABS: VIEWERS.includes(me.role) ? ALL_PTABS.slice(0, 3) : ALL_PTABS,
      // Owners, Properties and Bookings share this page; the route picks the section.
      top: this.$route.meta.section || 'properties',
      ptab: params.get('ptab') || 'units',
      properties: [], propertyId: params.get('property') || (this.$route.meta.section === 'properties' ? 'all' : lastProperty(true)) || 'all', asOf: params.get('month') || monthOffset(0),
      months: Array.from({ length: 25 }, (_, i) => monthOffset(1 - i)),
      customTypes: [], allUnits: [], units: [], owners: [], monthDocs: {}, bfLines: [], audits: [], auditLast: null, auditMore: false, auditBusy: false,
      offlineBookings: [], bookingsLoading: false,
      search: '', filter: 'all', propSearch: '', ownerSearch: '', showInactive: false, bookingSearch: '', bookingKind: 'all', propAttn: false,
      filters: [{ key: 'all', label: 'All' }, { key: 'none', label: 'Not set up' }, { key: 'share', label: 'Profit share' }, { key: 'fixed', label: 'Fixed rent' }, { key: 'long', label: 'Long-term' }],
      loading: true, busy: false, error: '', okMsg: '',
      unitOpen: false, u: { history: [] }, propOpen: false, np: { info: {} },
      ownerOpen: false, o: { payouts: [] },
      rates: { form: {}, effectiveFrom: monthOffset(0), reason: '', earlyToOwner: true, tourismTax: 10, current: null }
    };
  },
  created() {
    if (carry?.section === this.top) Object.assign(this, carry.state);
    carry = null;
    // A direct booking saved on Offline inquiries comes back here with its message.
    if (this.top === 'bookings' && history.state?.okMsg) {
      this.okMsg = history.state.okMsg;
      history.replaceState({ ...history.state, okMsg: undefined }, '');
    }
  },
  // Remember the property for the next page (see lib/last-property.js)
  watch: {
    propertyId(v) { rememberProperty(v); },
    // The sidebar's Properties link while a property is open: back to the full list
    '$route.fullPath'() {
      const r = this.$route;
      if (r.meta.section === 'properties' && !r.query.property && this.propertyId !== 'all') { this.propertyId = 'all'; this.okMsg = ''; this.go(); }
    }
  },
  async mounted() {
    // Unit types people added with "+ Add type" (shared by everyone)
    getDoc(doc(db, 'config', 'unitTypes')).then(s => { if (s.exists()) this.customTypes = s.data().list || []; }).catch(() => {});
    if (!this.months.includes(this.asOf)) this.months.push(this.asOf);
    if (!this.PTABS.some(t => t.key === this.ptab)) this.ptab = 'units';
    await this.go();
    await this.pickUpHandoff();
  },
  computed: {
    unitTypeOptions() {
      const seen = new Set(), out = [];
      for (const t of [...UNIT_TYPES.filter(x => x !== 'Other'), ...this.customTypes, ...this.allUnits.map(x => x.info?.type), this.u?.info?.type, 'Other']) {
        const k = String(t || '').trim(); if (!k || seen.has(k.toLowerCase())) continue; seen.add(k.toLowerCase()); out.push({ value: k, label: k });
      }
      return [{ value: '', label: 'Choose' }, ...out];
    },
    arrangementOptions() { return [{ value: '', label: 'Not set up' }, ...Object.entries(ARRANGEMENTS).map(([k, a]) => ({ value: k, label: a.label }))]; },
    propertyOptions() { return [...this.properties.map(p => ({ value: p.id, label: p.name }))]; },
    propertyOptionsAll() { return [{ value: 'all', label: 'All properties' }, ...this.properties.map(p => ({ value: p.id, label: p.name }))]; }
  },
  methods: {
    onProperty() { return this.top === 'properties' && this.propertyId !== 'all'; },
    // Address for a section with the current property / tab / month (month left out when it is the current one).
    urlFor(section, propertyId = this.propertyId, ptab = this.ptab) {
      const q = new URLSearchParams();
      if (propertyId !== 'all') q.set('property', propertyId);
      if (section === 'properties' && propertyId !== 'all' && ptab !== 'units') q.set('ptab', ptab);
      if (this.asOf !== monthOffset(0)) q.set('month', this.asOf);
      return `/Portfolio/${section}` + (q.toString() ? '?' + q : '');
    },
    // Tab changes only update the address (no reload); history.state is kept for the router.
    syncUrl() {
      const url = this.urlFor(this.$route.meta.section);
      if (url !== location.pathname + location.search) history.replaceState(history.state, '', url);
    },
    // Another section, or the list / a property page: the router remounts the page and it loads again.
    // Going back to the list means All properties: forget the remembered single property first, or the page reopens on it.
    toList(tab) { this.okMsg = ''; rememberProperty('all'); this.$router.push(tab === this.$route.meta.section ? this.urlFor(tab, 'all') : `/Portfolio/${tab}`); },
    openPropertyPage(id) { this.okMsg = ''; this.$router.push(this.$route.meta.section === 'properties' ? this.urlFor('properties', id, 'units') : `/Portfolio/properties?property=${id}`); },
    // Property or month picked in the header: new address (replaces it, as before). The router remounts the page,
    // so what the old page kept in memory (searches and filters) is carried over to the new one.
    switchProperty() { this.okMsg = ''; this.reload(); },
    switchMonth() { this.reload(); },
    reload() {
      const url = this.urlFor(this.$route.meta.section);
      if (url === this.$route.fullPath) { this.go(); return; }
      carry = { section: this.top, state: Object.fromEntries(CARRY.map(k => [k, this[k]])) };
      this.$router.replace(url);
    },
    // Create property / unit / owner on a new owner listing: open the add form filled in from it (lib/handoff.js,
    // in memory). The person still checks it and saves. A unit needs its property: the id the listing recorded, or
    // the property with the listing's name; the page moves to that property first, then opens the form.
    async pickUpHandoff() {
      const h = peekHandoff();
      if (!h || !this.canAdd || this.error) return;
      if (h.kind === 'owner' && this.top === 'owners') {
        takeHandoff();
        this.openOwnerForm(null);
        Object.assign(this.o, { fullName: h.ownerName || '', phone: h.ownerPhone || '', email: h.ownerEmail || '', fromListing: h });
      } else if (h.kind === 'property' && this.top === 'properties' && !this.onProperty()) {
        takeHandoff();
        this.openProperty(null);
        Object.assign(this.np, { name: h.property || '', fromListing: h });
      } else if (h.kind === 'unit' && this.top === 'properties') {
        const name = (h.property || '').trim().toLowerCase();
        const p = this.properties.find(x => x.id === h.portfolio?.propertyId)
          || (name && this.properties.find(x => (x.name || '').trim().toLowerCase() === name || x.id === slug(name)));
        if (!p) {
          takeHandoff();
          this.error = `No property called "${h.property || '(not set on the listing)'}" in Portfolio yet. Create the property first (Create property on ${h.listingId}), then Create unit.`;
          return;
        }
        if (this.propertyId !== p.id) { this.$router.replace(this.urlFor('properties', p.id, 'units')); return; }
        takeHandoff();
        if (this.ptab !== 'units') { this.ptab = 'units'; this.syncUrl(); }
        this.openUnit(null);
        Object.assign(this.u, { unitCode: [p.code, h.unit].filter(Boolean).join(' '), reason: `New owner listing ${h.listingId}`, fromListing: h,
          ownerId: this.owners.some(x => x.id === h.portfolio?.ownerId && x.active !== false) ? h.portfolio.ownerId : '' });
      }
    },
    // After a save from a listing: note the new id on it (Directors; Procurement and Directors edit listings, and
    // Procurement don't add in Portfolio). Returns a sentence for the message.
    async noteOnListing(h, key, id, what) {
      if (!h?.recordBack) return '';
      try {
        const ref = doc(db, 'newOwnerListings', h.listingId);
        const snap = await getDoc(ref);
        const portfolio = { ...(snap.exists() ? snap.data().portfolio || {} : {}), [key]: id };
        const d = new Date(), at = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
        await updateDoc(ref, { portfolio, updatedAt: serverTimestamp(), updatedByUid: me.user.uid, updatedByName: me.name,
          history: arrayUnion({ at, by: me.name, text: what === 'owner' ? 'Created in Portfolio: owner.' : `Created in Portfolio: ${what} ${id}.` }) });
        return ` Noted on ${h.listingId}.`;
      } catch (e) { return ` Not noted on ${h.listingId}: ${friendlyError(e, 'update the listing')}`; }
    },
    async setPtab(k) { this.ptab = k; this.okMsg = ''; this.syncUrl(); if ((k === 'rates' || k === 'ota') && !this.viewOnly) await this.openRates(); if (k === 'audit' && !this.viewOnly) await this.loadAudits(); },

    async go() {
      this.loading = true; this.error = '';
      try {
        this.properties = await loadProperties();
        if (this.propertyId !== 'all' && !this.properties.some(p => p.id === this.propertyId)) this.propertyId = 'all';
        this.syncUrl();
        // View-only roles read units without their terms (fees, fixed rent), and no months, expenses or owner private docs.
        const view = this.viewOnly;
        // Properties list (Director / Finance): the month summaries hold each property's units and arrangements, so the
        // units, their terms, owners and expenses are not read for it. The Bookings tab needs none of them either.
        if (!view && !this.onProperty() && this.top !== 'owners') {
          const pms = this.top === 'properties'
            ? await Promise.all(this.properties.map(p => propertyMonth(p, this.asOf, { me, canWrite: canWriteSummaries(me) }))) : [];
          this.monthDocs = Object.fromEntries(this.properties.map((p, i) => [p.id, pms[i]?.month || { status: 'open' }]));
          this.allUnits = pms.flatMap((pm, i) => pm.summary.units.map(x => ({ id: x.id, unitCode: x.unitCode, propertyId: this.properties[i].id,
            terms: x.hasTerms ? { arrangement: x.arrangement, fixedRentAmount: x.fixedRentAmount } : null })));
          this.owners = []; this.bfLines = []; this.units = [];
          if (this.top === 'bookings') await this.loadOfflineBookings();
          this.loading = false;
          return;
        }
        // Opening one property needs only that property's units, terms, month and expenses. Owners (and the Owners tab,
        // which lists each owner's units across properties) need every property.
        const one = this.onProperty() && this.top !== 'owners' ? this.properties.filter(p => p.id === this.propertyId) : this.properties;
        const [owners, sets, mdocs, bfSnap] = await Promise.all([
          cached(`owners:${view}:${this.canEdit}`, TTL.mid, async () => {
            const list = (await getDocs(collection(db, 'owners'))).docs.map(d => ({ id: d.id, ...d.data() }));
            // Names live in private/main (PDPA); older owners kept the name on the main record.
            const privs = view && !this.canEdit ? [] : await Promise.all(list.map(x => getDoc(doc(db, 'owners', x.id, 'private', 'main')).catch(() => null)));
            list.forEach((x, i) => { x.private = privs[i]?.exists?.() ? privs[i].data() : {}; });
            return list;
          }),
          Promise.all(one.map(p => cached(`set:${p.id}:${view ? 'v' : this.asOf}`, TTL.mid, () => (view ? loadUnits(p.id).then(units => ({ units })) : loadSetup(p.id, this.asOf))))),
          view ? [] : Promise.all(one.map(p => getDoc(doc(db, 'months', `${p.id}_${this.asOf}`)))),
          view ? { docs: [] } : getDocs(one.length === 1 ? query(collection(db, 'expenses'), where('month', '==', this.asOf), where('propertyId', '==', one[0].id))
            : query(collection(db, 'expenses'), where('month', '==', this.asOf)))
        ]);
        // By name; codes are for the system only.
        this.owners = [...owners].sort((a, b) => (a.private?.fullName || a.name || a.code || a.id).localeCompare(b.private?.fullName || b.name || b.code || b.id));
        this.allUnits = sets.flatMap(s => s.units);
        this.monthDocs = Object.fromEntries(this.properties.map(p => { const i = one.indexOf(p); return [p.id, i >= 0 && mdocs[i]?.exists() ? mdocs[i].data() : { status: 'open' }]; }));
        this.bfLines = bfSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(e => e.auto && e.kind === 'broughtForward' && !e.deleted);
        this.units = this.propertyId === 'all' ? [] : this.allUnits.filter(x => x.propertyId === this.propertyId);
        if (this.top === 'bookings') await this.loadOfflineBookings();
        if (this.onProperty() && !view) {
          if (this.ptab === 'audit') await this.loadAudits(); else { this.audits = []; this.auditLast = null; }
          if (this.ptab === 'rates' || this.ptab === 'ota') await this.openRates();
        }
      } catch (e) { this.error = friendlyError(e, 'load the portfolio'); }
      this.loading = false;
    },
    // The property's change history, 30 at a time, newest first (index: auditLog propertyId + at).
    // If that index isn't deployed yet, fall back to a capped read so the page still works.
    // The audit tables fetch the next 30 on their own when the user reaches the last loaded page
    onAuditPage({ page, last }) { if (page >= last && this.auditMore && !this.auditBusy) this.loadAudits(true); },
    async loadAudits(more = false) {
      if (this.auditBusy) return;
      this.auditBusy = true;
      try { await this.loadAuditsNow(more); } finally { this.auditBusy = false; }
    },
    async loadAuditsNow(more = false) {
      const col = collection(db, 'auditLog');
      const base = [where('propertyId', '==', this.propertyId)];
      try {
        const snap = await getDocs(query(col, ...base, orderBy('at', 'desc'), ...(more && this.auditLast ? [startAfter(this.auditLast)] : []), limit(AUDIT_PAGE)));
        const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        this.audits = more ? [...this.audits, ...rows] : rows;
        this.auditLast = snap.docs.length ? markRaw(snap.docs[snap.docs.length - 1]) : this.auditLast;
        this.auditMore = snap.docs.length === AUDIT_PAGE;
      } catch (e) {
        if (e.code !== 'failed-precondition') throw e;
        console.warn('auditLog index (propertyId, at) is missing; showing the latest 100 only. Create it here:', (e.message.match(/https:\/\/\S+/) || [''])[0]);
        const snap = await getDocs(query(col, ...base, limit(100)));
        this.audits = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => msOf(b.at) - msOf(a.at));
        this.auditMore = false;
      }
    },

    // ---- helpers ----
    shortName(m) { return m ? `${MON3[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}` : ''; },
    monthOnly(m) { return monthName(m).split(' ')[0]; },
    property() { return this.properties.find(p => p.id === this.propertyId) || {}; },
    propertyName() { return this.property().name || ''; },
    propertyNameOf(id) { return this.properties.find(p => p.id === id)?.name || ''; },
    info() { return this.property().info || {}; },
    unitsOf(pid) { return this.allUnits.filter(x => x.propertyId === pid); },
    isDone(pid) { return this.monthDocs[pid]?.status === 'completed'; },
    // Completion is per unit: a 'partial' month document counts its completed units
    completedUnits() { return this.properties.reduce((n, p) => n + (this.isDone(p.id) ? this.unitsOf(p.id).length : (this.monthDocs[p.id]?.completedUnits || 0)), 0); },
    arrLabel(a) { return ARRANGEMENTS[a]?.label || (a ? a : 'Not set up'); },
    mixText(list) {
      const n = k => list.filter(x => x.terms?.arrangement === k).length;
      const share = list.filter(x => /profitShare/.test(x.terms?.arrangement || '')).length, none = list.filter(x => !x.terms).length;
      return [n('fixedRent') && `${n('fixedRent')} fixed`, share && `${share} profit share`, n('longTermTenant') && `${n('longTermTenant')} LT`, none && `${none} not set up`].filter(Boolean).join(' · ');
    },
    // View-only: "3 Studio · 2 1 bedroom" from each unit's type (no arrangement, it is in the terms).
    typeText(list) {
      const n = {}; list.forEach(x => { const t = x.info?.type || 'Type not set'; n[t] = (n[t] || 0) + 1; });
      return Object.entries(n).map(([t, c]) => `${c} ${t}`).join(' · ');
    },
    attentionText(pid) {
      const list = this.unitsOf(pid);
      if (!list.length) return 'Upload eZee report';
      const none = list.filter(x => !x.terms).length;
      return none ? `${none} to set up` : '—';
    },
    shownProperties() {
      const q = this.propSearch.trim().toLowerCase();
      const attn = this.propAttn ? new Set(this.allUnits.filter(x => !x.terms).map(x => x.propertyId)) : null;
      return this.properties.filter(p => (!q || p.name.toLowerCase().includes(q) || (p.code || '').toLowerCase().includes(q)) && (!attn || attn.has(p.id)));
    },
    // Summary cards: scroll to the list they filter.
    kpiGo(ref) { this.$nextTick(() => this.$refs[ref]?.scrollIntoView({ behavior: 'smooth', block: 'start' })); },
    fixedTotal() { return this.units.filter(x => x.terms?.arrangement === 'fixedRent').reduce((s, x) => s + (Number(x.terms.fixedRentAmount) || 0), 0); },
    match(x, key) {
      const a = x.terms?.arrangement;
      return key === 'all' || (key === 'none' && !a) || (key === 'share' && /profitShare/.test(a || '')) || (key === 'fixed' && a === 'fixedRent') || (key === 'long' && a === 'longTermTenant');
    },
    shown() {
      const q = this.search.trim().toLowerCase();
      return this.units.filter(x => this.match(x, this.filter) && (!q || x.unitCode.toLowerCase().includes(q) || this.ownerLabel(x.ownerId).toLowerCase().includes(q)));
    },
    newest(row) { return [...(row.termHistory || [])].sort((a, b) => msOf(b.createdAt) - msOf(a.createdAt))[0]; },
    lastChanged(row) { const h = this.newest(row); return h ? `${dateOnly(h.createdAt)}${h.createdByName ? ' · ' + h.createdByName : ''}` : '—'; },
    futureOf(row) { return (row.termHistory || []).filter(h => h.effectiveFrom > this.asOf).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))[0] || null; },
    futureText(row) {
      const f = this.futureOf(row); if (!f) return '';
      const now = row.terms;
      const from = `${this.arrLabel(f.arrangement)}${f.fixedRentAmount ? ' RM ' + amt(f.fixedRentAmount) : ''} from ${this.shortName(f.effectiveFrom)}`;
      return now?.arrangement === 'fixedRent' ? `RM ${amt(now.fixedRentAmount)} until ${this.shortName(prevMonth(f.effectiveFrom))} · then ${from}` : `Changes to ${from}`;
    },
    unitCodeOfEntity(e) { const id = (e || '').split('/')[1]; return this.allUnits.find(x => x.id === id)?.unitCode || '—'; },
    // One line per changed field. Personal fields are logged as "(changed)" only, so they read "Bank name updated".
    changeList(a) {
      const v = x => (x == null || x === '' ? '—' : Array.isArray(x) ? (x.join(', ') || '—') : ARRANGEMENTS[x]?.label || String(x));
      const names = { ownerId: 'Owner', aliases: 'eZee names', active: 'Active', arrangement: 'Arrangement', units: 'Units', status: 'Status',
        fullName: 'Full name', dob: 'Date of birth', bankName: 'Bank name', accountHolder: 'Account holder', bankAccount: 'Bank account',
        ic: 'IC / Passport', email: 'Email', phone: 'Phone', address: 'Address', whatsapp: 'WhatsApp', wechat: 'WeChat ID' };
      const nice = f => names[f] || f.replace(/([A-Z])/g, ' $1').replace(/^./, m => m.toUpperCase());
      const out = (a.changes || []).map(c => c.new === '(changed)' ? `${nice(c.field)} updated` : `${nice(c.field)}: ${v(c.old)} → ${v(c.new)}`);
      return out.length ? out : ['—'];
    },
    actionText(a) {
      const label = ({ 'unit.create': 'Unit added', 'unit.update': 'Unit changed', 'unitTerms.starter': 'Starter settings', 'rates.create': 'Fees & rates', 'property.create': 'Property added',
        'property.update': 'Property changed', 'month.complete': 'Month completed', 'month.reopen': 'Month reopened', 'statement.complete': 'Statement completed', 'statement.reopen': 'Statement reopened', 'statement.send': 'Statement sent', 'statement.pullback': 'Statement pulled back', 'statement.return': 'Statement sent back',
        'owner.create': 'Owner added', 'owner.update': 'Owner changed', 'owner.deactivate': 'Owner deactivated', 'owner.reactivate': 'Owner reactivated', 'owner.delete': 'Owner deleted',
        'unit.delete': 'Unit deleted', 'ezee.upload': 'eZee report uploaded', 'unitTerms.create': 'Unit settings changed', 'expense.create': 'Expense added',
        'expense.update': 'Expense changed', 'expense.remove': 'Expense removed' })[a.action]
        // Anything else: "offlineBooking.create" -> "Offline booking create"
        || String(a.action || '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[._]/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase());
      // Every word starts with a capital (eZee keeps its own spelling)
      return label.replace(/(^|\s)([a-z])/g, (m, sp, c) => sp + c.toUpperCase()).replace(/\bEzee\b/g, 'eZee');
    },

    // ---- owners ----
    ownerName(id) { const x = this.owners.find(y => y.id === id); return x ? (x.private?.fullName || x.name || '') : ''; },
    // Owner codes (OWN-001) are for the system only; screens show the name. Roles that can't read names (PDPA) see "Owner linked".
    ownerOptions(u) { return [{ value: '', label: 'No owner linked' }, ...this.owners.filter(x => x.active !== false || x.id === u.ownerId).map(o => ({ value: o.id, label: this.ownerLabel(o.id) }))]; },
    async addUnitType(name) {
      const t = name.trim().replace(/\s+/g, ' '), u = this.u;
      if (!t || !u) return;
      const same = this.unitTypeOptions.find(o => o.value && o.value.toLowerCase() === t.toLowerCase());
      if (same) { u.info.type = same.value; return; }
      this.customTypes = [...this.customTypes, t]; u.info.type = t;
      try { await setDoc(doc(db, 'config', 'unitTypes'), { list: arrayUnion(t) }, { merge: true }); }
      catch { /* kept on this unit; it still appears for the next unit through the units already saved */ }
    },
    ownerLabel(id) { const x = this.owners.find(y => y.id === id); if (!x) return ''; return this.ownerName(id) || (this.viewOnly ? 'Owner linked' : 'No name saved'); },
    ownerUnits(id) { return this.allUnits.filter(x => x.ownerId === id); },
    carried(id) { const ids = this.ownerUnits(id).map(x => x.id); return -this.bfLines.filter(e => ids.includes(e.unitId)).reduce((s, e) => s + (Number(e.amount) || 0), 0); },
    shownOwners() {
      const q = this.ownerSearch.trim().toLowerCase();
      const pid = this.propertyId;
      return this.owners.filter(x => (this.showInactive ? x.active === false : x.active !== false)
        && (pid === 'all' || this.ownerUnits(x.id).some(y => y.propertyId === pid) || (pid !== 'all' && this.property().info?.ownerId === x.id))
        && (!q || (x.code || x.id).toLowerCase().includes(q) || this.ownerName(x.id).toLowerCase().includes(q) || this.ownerUnits(x.id).some(y => y.unitCode.toLowerCase().includes(q))));
    },
    async openOwner(own) {
      this.openOwnerForm(own);
      const ids = this.ownerUnits(own.id).map(x => x.id);
      const snaps = await Promise.all(ids.map(id => getDocs(query(collection(db, 'payoutHistory'), where('unitId', '==', id))).catch(() => ({ docs: [] }))));
      this.o.payouts = snaps.flatMap(s => s.docs.map(d => ({ id: d.id, ...d.data() }))).sort((a, b) => (b.month || '').localeCompare(a.month || ''));
    },
    openOwnerForm(own) {
      this.okMsg = '';
      const p = own?.private || {};
      this.o = { isNew: !own, id: own?.id || null, code: own?.code || own?.id || '', active: own ? own.active !== false : true,
        deactivatedReason: own?.deactivatedReason || '', original: own, payouts: [], reason: '', error: '', deactivating: false, deactivateReason: '',
        ...Object.fromEntries(PRIVATE.map(k => [k, p[k] ?? (k === 'fullName' ? (own?.name || '') : '')])) };
      this.ownerOpen = true;
    },
    nextOwnerCode() {
      const n = Math.max(0, ...this.owners.map(x => Number(String(x.code || x.id).replace(/\D/g, '')) || 0)) + 1;
      return `OWN-${String(n).padStart(3, '0')}`;
    },
    async saveOwner() {
      const o = this.o; o.error = '';
      if (!o.fullName.trim()) return o.error = 'Enter the owner\'s full name.';
      if (o.email && !/^\S+@\S+\.\S+$/.test(o.email)) return o.error = 'That email doesn\'t look right.';
      // Operations add contact details only; bank details are Finance's and Directors'.
      const priv = Object.fromEntries(PRIVATE.filter(k => !this.viewOnly || !BANK.includes(k)).map(k => [k, String(o[k] || '').trim()]));
      const before = o.original?.private || {};
      const changed = Object.keys(priv).filter(k => (before[k] ?? (k === 'fullName' ? o.original?.name || '' : '')) !== priv[k]);
      if (!o.isNew && !changed.length) { this.ownerOpen = false; return; }
      if (!o.isNew && !o.reason.trim()) return o.error = 'Add a short reason. It goes in the audit log.';
      const id = o.id || this.nextOwnerCode();
      const digits = (priv.bankAccount || '').replace(/\D/g, '');
      this.busy = true;
      try {
        const b = writeBatch(db);
        // Marketing editing an owner leave the code, status and bank digits as they are.
        const main = this.viewOnly && !o.isNew ? { updatedAt: serverTimestamp(), updatedBy: me.user.uid }
          : { code: id, active: o.active, bankLast4: digits ? digits.slice(-4) : null, updatedAt: serverTimestamp(), updatedBy: me.user.uid };
        if (o.isNew) Object.assign(main, { createdAt: serverTimestamp(), createdBy: me.user.uid });
        b.set(doc(db, 'owners', id), main, { merge: true });
        b.set(doc(db, 'owners', id, 'private', 'main'), { ...priv, updatedAt: serverTimestamp(), updatedBy: me.user.uid }, { merge: true });
        // Audit names the fields changed, never the personal values.
        audit(b, me, { action: o.isNew ? 'owner.create' : 'owner.update', entity: `owners/${id}`, propertyId: this.propertyId === 'all' ? null : this.propertyId,
          changes: changed.map(k => ({ field: k, old: null, new: '(changed)' })), reason: o.reason.trim() || 'Added on Portfolio' });
        await b.commit();
        const noted = o.isNew ? await this.noteOnListing(o.fromListing, 'ownerId', id, 'owner') : '';
        this.ownerOpen = false;
        this.okMsg = `${priv.fullName || 'Owner'} saved.${noted}`;
        await this.refreshOwner(id);
        await this.go();
      } catch (e) { o.error = friendlyError(e, 'save the owner'); }
      this.busy = false;
    },
    // After a save only what changed is read again (not every owner and unit): one owner is patched in the saved list,
    // and a property's units, terms and fees are dropped so this one property is read fresh.
    async refreshOwner(id, removed = false) {
      let owner = null;
      if (!removed) {
        const [m, pr] = await Promise.all([getDoc(doc(db, 'owners', id)), getDoc(doc(db, 'owners', id, 'private', 'main')).catch(() => null)]);
        if (m.exists()) owner = { id, ...m.data(), private: pr?.exists?.() ? pr.data() : {} };
      }
      const ok = await patchCache(`owners:${this.viewOnly}:${this.canEdit}`, list => [...list.filter(x => x.id !== id), ...(owner ? [owner] : [])]);
      if (!ok) await clearCache('owners:');
    },
    async forgetUnits() { await Promise.all([clearCache(`set:${this.propertyId}:`), clearCache(`units:${this.propertyId}`)]); },
    // Safe delete (Directors only): works only when nothing refers to the record. Otherwise deactivate keeps the history.
    async hasRefs(list, id) {
      for (const [coll, field] of list) {
        const snap = await getDocs(query(collection(db, coll), where(field, '==', id), limit(1)));
        if (!snap.empty) return coll;
      }
      return '';
    },
    async deleteUnit() {
      const u = this.u; u.error = '';
      if (this.busy) return;
      this.busy = true;
      try {
        const used = await this.hasRefs([['bookings', 'unitId'], ['expenses', 'unitId'], ['statements', 'unitId'], ['payoutHistory', 'unitId'],
          ['offlineBookings', 'unitId'], ['issues', 'unitId']], u.id);
        if (used) { this.busy = false; await showNotice(`${u.unitCode} can't be deleted`, `It already has history (${used}). Set the unit to inactive instead, so the history stays.`); return; }
        if (!await askConfirm({ title: `Delete unit ${u.unitCode}?`, message: 'It will be removed from the system for good, including its terms history. This cannot be undone.', confirmText: 'Delete unit', danger: true })) { this.busy = false; return; }
        const b = writeBatch(db);
        for (const sub of ['terms', 'ownership']) (await getDocs(collection(db, 'units', u.id, sub))).forEach(d => b.delete(d.ref));
        b.delete(doc(db, 'units', u.id));
        audit(b, me, { action: 'unit.delete', entity: `units/${u.id}`, propertyId: this.propertyId, changes: [{ field: 'unit', old: u.unitCode, new: null }], reason: 'Deleted, no history' });
        await b.commit();
        this.unitOpen = false; this.okMsg = `${u.unitCode} deleted.`;
        await this.forgetUnits();
        await this.go();
      } catch (e) { u.error = friendlyError(e, 'delete the unit'); }
      this.busy = false;
    },
    async deleteOwner() {
      const o = this.o; o.error = '';
      if (this.busy) return;
      this.busy = true;
      try {
        const used = await this.hasRefs([['units', 'ownerId'], ['agreements', 'ownerId'], ['payoutHistory', 'ownerId']], o.id);
        if (used) { this.busy = false; await showNotice(`${o.fullName || 'This owner'} can't be deleted`, `They are still linked to ${used === 'units' ? 'one or more units' : used}. Move the units to another owner first, or use Deactivate to keep the history.`); return; }
        if (!await askConfirm({ title: `Delete ${o.fullName || 'this owner'}?`, message: 'Their record and personal details will be removed from the system for good. This cannot be undone.', confirmText: 'Delete owner', danger: true })) { this.busy = false; return; }
        const b = writeBatch(db);
        b.delete(doc(db, 'owners', o.id, 'private', 'main'));
        b.delete(doc(db, 'owners', o.id));
        audit(b, me, { action: 'owner.delete', entity: `owners/${o.id}`, propertyId: this.propertyId === 'all' ? null : this.propertyId, changes: [{ field: 'owner', old: o.fullName || o.code || o.id, new: null }], reason: 'Deleted, no units linked' });
        await b.commit();
        this.ownerOpen = false; this.okMsg = `${o.fullName || 'Owner'} deleted.`;
        await this.refreshOwner(o.id, true);
        await this.go();
      } catch (e) { o.error = friendlyError(e, 'delete the owner'); }
      this.busy = false;
    },
    startDeactivate() {
      this.o.deactivating = true;
      this.$nextTick(() => { const el = document.getElementById('oDeact'); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus({ preventScroll: true }); } });
    },
    async deactivateOwner() {
      const o = this.o; o.error = '';
      if (!o.deactivateReason.trim()) return o.error = 'Say why the owner is being deactivated.';
      this.busy = true;
      try {
        const b = writeBatch(db);
        b.set(doc(db, 'owners', o.id), { active: false, deactivatedReason: o.deactivateReason.trim(), deactivatedAt: serverTimestamp(), deactivatedBy: me.user.uid }, { merge: true });
        audit(b, me, { action: 'owner.deactivate', entity: `owners/${o.id}`, changes: [{ field: 'active', old: true, new: false }], reason: o.deactivateReason.trim() });
        await b.commit();
        this.ownerOpen = false; this.okMsg = `${o.fullName || 'Owner'} deactivated. Nothing was deleted.`;
        await this.refreshOwner(o.id);
        await this.go();
      } catch (e) { o.error = friendlyError(e, 'deactivate the owner'); }
      this.busy = false;
    },
    async reactivateOwner() {
      const o = this.o; o.error = '';
      if (!o.reason.trim()) o.reason = 'Reactivated';
      this.busy = true;
      try {
        const b = writeBatch(db);
        b.set(doc(db, 'owners', o.id), { active: true, deactivatedReason: null }, { merge: true });
        audit(b, me, { action: 'owner.reactivate', entity: `owners/${o.id}`, changes: [{ field: 'active', old: false, new: true }], reason: o.reason.trim() });
        await b.commit();
        this.ownerOpen = false; this.okMsg = `${o.fullName || 'Owner'} is active again.`;
        await this.refreshOwner(o.id);
        await this.go();
      } catch (e) { o.error = friendlyError(e, 'turn the owner back on'); }
      this.busy = false;
    },

    // ---- units ----
    openUnit(unit) {
      this.okMsg = '';
      const t = unit?.terms || {};
      this.u = {
        isNew: !unit, id: unit?.id || null, original: unit, unitCode: unit?.unitCode || `${this.property().code || ''} `,
        aliases: (unit?.aliases || []).join(', '), ownerId: unit?.ownerId || '', active: unit ? unit.active !== false : true,
        info: { ...Object.fromEntries(UNIT_INFO.map(k => [k, ''])), ...(unit?.info || {}) },
        arrangement: t.arrangement || '', fixedRentAmount: t.fixedRentAmount ?? '',
        serviceFeePct: pctOut(t.serviceFeePct), utilityFeePct: pctOut(t.utilityFeePct), sstOnFeePct: pctOut(t.sstOnFeePct),
        effectiveFrom: this.asOf, reason: '', error: '',
        history: [...(unit?.termHistory || [])].sort((a, b) => (b.effectiveFrom || '').localeCompare(a.effectiveFrom || '') || msOf(b.createdAt) - msOf(a.createdAt))
      };
      this.unitOpen = true;
    },
    async saveUnit() {
      const u = this.u; u.error = '';
      const code = u.unitCode.trim().replace(/\s+/g, ' ');
      // Any code with a number in it: "DM 0719", "CS B-07-13", or no prefix like "C-01-06" (183 Ampang, Langkawi, NOVO)
      if (!/\d/.test(code)) return u.error = `Type the unit code with its number${this.property().code ? `, like ${this.property().code} 0719` : ''}.`;
      const id = u.id || unitIdOf(this.propertyId, code);
      if (u.isNew && this.units.some(x => x.id === id)) return u.error = 'That unit already exists.';
      if (u.arrangement === 'fixedRent' && !(Number(u.fixedRentAmount) > 0)) return u.error = 'Enter the fixed rent amount.';
      const aliases = u.aliases.split(',').map(s => s.trim().replace(/\s+/g, ' ')).filter(Boolean);
      const old = u.original?.terms || {};
      const fixed = u.arrangement === 'fixedRent';
      const terms = u.arrangement ? {
        arrangement: u.arrangement, fixedRentAmount: fixed ? Math.round(Number(u.fixedRentAmount) * 100) / 100 : null,
        serviceFeePct: fixed ? null : pctIn(u.serviceFeePct), utilityFeePct: fixed ? null : pctIn(u.utilityFeePct), sstOnFeePct: fixed ? null : pctIn(u.sstOnFeePct)
      } : null;
      const termsChanged = terms && (u.isNew || !u.original.terms || Object.keys(terms).some(k => (old[k] ?? null) !== terms[k]));
      const ownerId = u.ownerId || null;
      const unitChanges = [];
      const numOr = v => (v === '' || v == null ? null : Number(v));
      const info = {};
      for (const k of UNIT_INFO) info[k] = ['bedrooms', 'bathrooms', 'sizeSqft', 'carParks'].includes(k) ? numOr(u.info[k]) : String(u.info[k] || '').trim();
      const oldInfo = u.original?.info || {};
      for (const k of UNIT_INFO) if ((oldInfo[k] ?? '') !== (info[k] ?? '')) unitChanges.push({ field: k, old: oldInfo[k] ?? null, new: info[k] });
      if ((u.original?.ownerId || null) !== ownerId) unitChanges.push({ field: 'ownerId', old: u.original?.ownerId || null, new: ownerId });
      if ((u.original?.aliases || []).join(',') !== aliases.join(',')) unitChanges.push({ field: 'aliases', old: u.original?.aliases || [], new: aliases });
      if (!u.isNew && (u.original.active !== false) !== u.active) unitChanges.push({ field: 'active', old: u.original.active !== false, new: u.active });
      if (!u.isNew && !termsChanged && !unitChanges.length) { this.unitOpen = false; return; }
      if (!u.reason.trim()) return u.error = 'Add a short reason. It goes in the audit log.';
      this.busy = true;
      try {
        const b = writeBatch(db);
        const unitData = { propertyId: this.propertyId, unitCode: code, ezeeRoomMatch: code, aliases, ownerId, info, active: u.active,
          updatedAt: serverTimestamp(), updatedBy: me.user.uid };
        if (u.isNew) unitData.createdAt = serverTimestamp(), unitData.createdBy = me.user.uid;
        // Marketing editing a unit change its details and eZee names only.
        b.set(doc(db, 'units', id), this.viewOnly && !u.isNew ? { aliases, info, updatedAt: serverTimestamp(), updatedBy: me.user.uid } : unitData, { merge: true });
        markFrom(b, this.propertyId, ALL_MONTHS, id);   // this unit's month summaries are worked out again (owner, status, settings)
        if (termsChanged) b.set(doc(db, 'units', id, 'terms', `${u.effectiveFrom}_${Date.now()}`), { ...terms, otaOverrides: null, effectiveFrom: u.effectiveFrom,
          reason: u.reason.trim(), createdBy: me.user.uid, createdByName: me.name, createdAt: serverTimestamp() });
        const termChanges = [];
        if (termsChanged) {
          if ((old.arrangement || null) !== terms.arrangement) termChanges.push({ field: 'arrangement', old: old.arrangement || null, new: terms.arrangement });
          if (fixed && (old.fixedRentAmount ?? null) !== terms.fixedRentAmount) termChanges.push({ field: 'Fixed rent', old: old.fixedRentAmount != null ? `RM ${amt(old.fixedRentAmount)}` : null, new: `RM ${amt(terms.fixedRentAmount)}` });
          for (const [k, lbl] of [['serviceFeePct', 'Service fee'], ['utilityFeePct', 'Utility fee'], ['sstOnFeePct', 'SST on fee']])
            if (!fixed && (old[k] ?? null) !== terms[k]) termChanges.push({ field: lbl, old: old[k] != null ? pct(old[k]) : null, new: terms[k] != null ? pct(terms[k]) : 'normal rate' });
        }
        audit(b, me, { action: u.isNew ? 'unit.create' : 'unit.update', entity: `units/${id}`, propertyId: this.propertyId, month: u.effectiveFrom,
          changes: [...unitChanges, ...termChanges], reason: u.reason.trim() });
        await b.commit();
        const noted = u.isNew ? await this.noteOnListing(u.fromListing, 'unitId', id, 'unit') : '';
        this.unitOpen = false;
        this.okMsg = `${code} saved` + (termsChanged ? `, settings apply from ${monthName(u.effectiveFrom)}.` : '.') + noted;
        await this.forgetUnits();
        await this.go();
      } catch (e) { u.error = friendlyError(e, 'save the unit'); }
      this.busy = false;
    },
    async loadStarter() {
      this.busy = true; this.error = '';
      try {
        const b = writeBatch(db); let n = 0; const ts = Date.now();
        for (const x of this.units.filter(y => !y.terms)) {
          const share = DM_STARTER.units.find(y => y[0] === x.unitCode), fixed = DM_STARTER.fixed.find(y => y[0] === x.unitCode);
          if (!share && !fixed) continue;
          const t = fixed ? { arrangement: 'fixedRent', fixedRentAmount: fixed[1] } : { arrangement: share[1], ...(share[2] || {}) };
          b.set(doc(db, 'units', x.id, 'terms', `${this.asOf}_${ts}`), { fixedRentAmount: null, serviceFeePct: null, utilityFeePct: null, sstOnFeePct: null, otaOverrides: null,
            ...t, effectiveFrom: this.asOf, reason: 'Starter settings (Upload CSV test page, Finance Sep 2026 set-up)', createdBy: me.user.uid, createdByName: me.name, createdAt: serverTimestamp() });
          markFrom(b, this.propertyId, this.asOf, x.id);
          n++;
        }
        audit(b, me, { action: 'unitTerms.starter', entity: `properties/${this.propertyId}`, propertyId: this.propertyId, month: this.asOf, changes: [{ field: 'units', old: null, new: n }], reason: 'Starter settings loaded' });
        await b.commit();
        this.okMsg = `Starter settings loaded for ${n} units from ${monthName(this.asOf)}. Fixed rents are Sep 2026 amounts: check them.`;
        await this.forgetUnits();
        await this.go();
      } catch (e) { this.error = friendlyError(e, 'load the starter settings'); }
      this.busy = false;
    },

    // ---- fees & rates / OTA commissions (one effective-dated rate version) ----
    async openRates() {
      const snap = await getDocs(collection(db, 'properties', this.propertyId, 'rateVersions'));
      const versions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const cur = latestVersion(versions, this.asOf);
      const form = {};
      for (const [k, d] of Object.entries(DEFAULT_OTA)) {
        const v = { ...d, ...(cur?.ota?.[k] || {}) };
        form[k] = { label: d.label, payout: v.payout, commission: +(v.commissionPct * 100).toFixed(4), paymentFee: +((v.paymentFeePct || 0) * 100).toFixed(4), sstPct: v.sstPct ?? 0.08 };
      }
      this.rates = { form, effectiveFrom: this.asOf, reason: '', earlyToOwner: cur?.earlyCheckInToOwner !== false, tourismTax: cur?.tourismTaxPerNight ?? 10, current: cur };
    },
    async saveRates() {
      const r = this.rates; this.error = '';
      if (!r.reason.trim()) { this.error = 'Add a reason for the change (audit log).'; return; }
      const ota = {};
      for (const [k, f] of Object.entries(r.form)) {
        const c = Number(f.commission);
        if (!(c >= 0 && c < 100)) { this.error = `${f.label}: commission must be between 0 and 100%.`; return; }
        ota[k] = { label: f.label, payout: f.payout, commissionPct: c / 100, ...(f.payout === 'gross' ? { paymentFeePct: Number(f.paymentFee || 0) / 100, sstPct: f.sstPct } : {}) };
      }
      const tt = Number(r.tourismTax);
      if (!(tt >= 0)) { this.error = 'Tourism Tax must be 0 or more.'; return; }
      this.busy = true;
      try {
        const b = writeBatch(db);
        b.set(doc(db, 'properties', this.propertyId, 'rateVersions', `${r.effectiveFrom}_${Date.now()}`), { effectiveFrom: r.effectiveFrom, ota,
          earlyCheckInToOwner: r.earlyToOwner, tourismTaxPerNight: tt, reason: r.reason.trim(),
          createdBy: me.user.uid, createdByName: me.name, createdAt: serverTimestamp() });
        audit(b, me, { action: 'rates.create', entity: `properties/${this.propertyId}/rateVersions`, propertyId: this.propertyId, month: r.effectiveFrom, reason: r.reason.trim() });
        markFrom(b, this.propertyId, r.effectiveFrom);   // every unit's summary from that month on is worked out again
        await b.commit();
        await this.forgetUnits();
        this.okMsg = `Saved, applying from ${monthName(r.effectiveFrom)}.`;
        await this.openRates(); if (this.ptab === 'audit') await this.loadAudits(); else { this.audits = []; this.auditLast = null; }
      } catch (e) { this.error = friendlyError(e, 'save the rates'); }
      this.busy = false;
    },

    // ---- add / edit property ----
    openProperty(p) {
      this.okMsg = '';
      const i = p?.info || {};
      this.np = { id: p?.id || null, name: p?.name || '', code: p?.code || '', reason: '', error: '', original: p,
        info: { address: '', city: '', state: '', ezeeAccount: '', ezeeName: '', ...i } };
      this.propOpen = true;
    },
    async saveProperty() {
      const p = this.np; p.error = '';
      const name = p.name.trim(), code = p.code.trim().toUpperCase();
      if (!name || !code) return p.error = 'Enter the property name and the short code.';
      // Property keeps only these (Khairul 20 Oct); owner, rooms, size and bill accounts are on each unit.
      const info = {};
      for (const k of PROP_INFO) info[k] = String(p.info[k] || '').trim();
      if (p.id) {
        const before = { name: p.original.name, ...(p.original.info || {}) };
        const norm = v => (v == null ? '' : v);
        const changes = Object.entries({ name, ...info }).filter(([k, v]) => norm(before[k]) !== norm(v)).map(([k, v]) => ({ field: k, old: before[k] ?? null, new: v }));
        if (!changes.length) { this.propOpen = false; return; }
        if (!p.reason.trim()) return p.error = 'Add a short reason. It goes in the audit log.';
        this.busy = true;
        try {
          const b = writeBatch(db);
          b.set(doc(db, 'properties', p.id), { name, info, updatedAt: serverTimestamp(), updatedBy: me.user.uid }, { merge: true });
          audit(b, me, { action: 'property.update', entity: `properties/${p.id}`, propertyId: p.id, changes, reason: p.reason.trim() });
          await b.commit();
          this.propOpen = false; this.okMsg = `${name} saved.`;
          await clearCache('properties'); await this.forgetUnits();
          await this.go();
        } catch (e) { p.error = friendlyError(e, 'save the property'); }
        this.busy = false;
        return;
      }
      const id = slug(name);
      if (this.properties.some(x => x.id === id || (x.code || '').toUpperCase() === code)) return p.error = 'A property with this name or code already exists.';
      this.busy = true;
      try {
        const b = writeBatch(db);
        b.set(doc(db, 'properties', id), { name, code, info, active: true, createdAt: serverTimestamp(), createdBy: me.user.uid });
        b.set(doc(db, 'properties', id, 'rateVersions', '2000-01_default'), { effectiveFrom: '2000-01', ota: DEFAULT_OTA, earlyCheckInToOwner: true, tourismTaxPerNight: 10,
          reason: 'Default OTA settings', createdBy: me.user.uid, createdByName: me.name, createdAt: serverTimestamp() });
        audit(b, me, { action: 'property.create', entity: `properties/${id}`, propertyId: id, reason: 'Added on Portfolio' });
        await b.commit();
        const noted = await this.noteOnListing(p.fromListing, 'propertyId', id, 'property');
        this.propOpen = false;
        this.okMsg = `${name} added. Upload its eZee report to bring in units, or add them here.${noted}`;
        await clearCache('properties');
        this.openPropertyPage(id);
      } catch (e) { p.error = friendlyError(e, 'add the property'); }
      this.busy = false;
    },

    // ---- offline bookings (read-only; made from Offline inquiries > Create booking) ----
    // Kept in offlineBookings, never in bookings, so month-end (which pays from eZee) can't count them.
    async loadOfflineBookings() {
      this.bookingsLoading = true;
      try {
        const col = collection(db, 'offlineBookings');
        const snap = await getDocs(this.propertyId === 'all' ? query(col, orderBy('createdAt', 'desc'), limit(300))
          : query(col, where('propertyId', '==', this.propertyId), limit(300)));
        this.offlineBookings = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => x.status !== 'cancelled')
          .sort((a, b) => (b.arrival || '').localeCompare(a.arrival || ''));
      } catch (e) { this.error = friendlyError(e, 'load the offline bookings'); }
      this.bookingsLoading = false;
    },
    shownBookings() {
      const q = this.bookingSearch.trim().toLowerCase();
      const k = this.bookingKind;
      return this.offlineBookings.filter(x => (k === 'all' || (k === 'long' && x.longTerm) || (k === 'short' && !x.longTerm) || (k === 'noEzee' && !x.ezeeReservationNo))
        && (!q || [x.id, x.unitCode, x.tenantId, x.ezeeReservationNo].some(v => (v || '').toLowerCase().includes(q))));
    }
  }
};
</script>

<style scoped>
    .pf-bar { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin: 8px 0 24px; }
    .pf-bar .input { max-width: 260px; height: 36px; }
    .pf-bar .grow { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; flex: 1; min-width: 0; }
    .card h2.t { font-size: 15px; margin: 0 0 12px; }
    .card .table-wrap { margin-top: 4px; }
    .table td.strong { font-weight: 600; }
    .table tr.future td { background: var(--amber-soft); }
    .sub-line { display: block; font-size: 11px; color: var(--amber); }
    .att { color: var(--amber); }
    .kpi .value.small { font-size: 24px; }
    .form-sec { font-size: 12px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--muted); margin: 18px 0 10px; }
    .form-sec:first-child { margin-top: 0; }
    .grid-3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0 14px; }
    .info-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 32px; }
    .table td.nw { white-space: nowrap; }
    .drawer .field { align-content: start; }
    .history-list .row { font-size: 12px; }
    .from-listing { margin: 0 0 12px; padding: 8px 10px; border-radius: 8px; background: var(--accent-soft); color: var(--text-2); }
    @media (max-width: 720px) { .grid-3, .info-grid { grid-template-columns: 1fr; } }
.audit-tbl { table-layout: fixed; width: 100%; }
.audit-tbl td { vertical-align: top; overflow-wrap: anywhere; }
.audit-tbl .chg + .chg { margin-top: 2px; }
</style>
