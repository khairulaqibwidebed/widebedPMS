<template>
  <main class="content">
    <div class="loading-bar" v-show="loading || busy"></div>

    <!-- ========== Header ========== -->
    <div class="page-head" v-show="!onProperty()">
      <div>
        <h1>{{ { properties: 'Properties', owners: 'Owners', bookings: 'Bookings' }[top] }}</h1>
        <div class="sub">
          <span>{{ `Portfolio › ${{ properties: 'Properties', owners: 'Owners', bookings: 'Bookings' }[top]} · ` }}</span>
          <span>{{ { properties: 'every property you have access to', owners: 'who owns each unit and how they are paid', bookings: 'bookings typed in by hand, e.g. long-term tenants not booked through eZee' }[top] }}</span>
        </div>
      </div>
      <div class="head-tools">
        <select class="select" v-model="propertyId" @change="switchProperty()" aria-label="Property" v-show="top !== 'properties'">
          <option value="all">All properties</option>
          <template v-for="p in properties" :key="p.id"><option :value="p.id" :selected="p.id === propertyId">{{ p.name }}</option></template>
        </select>
        <select class="select" v-model="asOf" @change="switchMonth()" aria-label="Month">
          <template v-for="m in months" :key="m"><option :value="m" :selected="m === asOf">{{ shortName(m) }}</option></template>
        </select>
      </div>
    </div>

    <div class="page-head" v-show="onProperty()">
      <div>
        <h1>{{ propertyName() }}</h1>
        <div class="sub crumb"><a href="/Portfolio/properties" @click.prevent="toList('properties')">Portfolio</a> › <a href="/Portfolio/properties" @click.prevent="toList('properties')">Properties</a>
          <span>{{ ` › ${propertyName()} · set once, used every month` }}</span></div>
      </div>
      <div class="head-tools">
        <select class="select" v-model="propertyId" @change="switchProperty()" aria-label="Property">
          <template v-for="p in properties" :key="p.id"><option :value="p.id" :selected="p.id === propertyId">{{ p.name }}</option></template>
        </select>
        <select class="select" v-model="asOf" @change="switchMonth()" aria-label="Month">
          <template v-for="m in months" :key="m"><option :value="m" :selected="m === asOf">{{ shortName(m) }}</option></template>
        </select>
        <button class="btn btn-primary" v-show="ptab === 'units'" @click="openUnit(null)">+ Add unit</button>
        <button class="btn" v-show="ptab === 'overview'" @click="openProperty(property())">Edit property</button>
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
        <div class="card kpi"><div class="label">Properties</div><div class="value">{{ properties.length }}</div><div class="hint">Widebed manages</div></div>
        <div class="card kpi"><div class="label">Units</div><div class="value">{{ allUnits.length }}</div><div class="hint">Across all properties</div></div>
        <div class="card kpi"><div class="label">{{ `${monthOnly(asOf)} statements` }}</div>
          <div class="value small">{{ `${completedUnits()} of ${allUnits.length} completed` }}</div>
          <div class="hint">{{ `${properties.filter(p => !isDone(p.id)).length} ${properties.filter(p => !isDone(p.id)).length === 1 ? 'property' : 'properties'} still open` }}</div></div>
        <div class="card kpi"><div class="label">Needs attention</div><div class="value" :class="{ alert: allUnits.filter(x => !x.terms).length }">{{ allUnits.filter(x => !x.terms).length }}</div><div class="hint">Units not set up yet</div></div>
      </section>
      <div class="pf-bar">
        <input class="input" type="search" placeholder="Search property..." v-model="propSearch" aria-label="Search property">
        <button class="btn btn-primary" @click="openProperty(null)">+ Add property</button>
      </div>
      <section class="card">
        <h2 class="t">{{ `Properties · ${monthName(asOf)}` }}</h2>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Property</th><th class="num">Units</th><th>Arrangement mix</th><th>{{ `${monthOnly(asOf)} statements` }}</th><th>Status</th><th>Needs attention</th><th></th></tr></thead>
            <tbody>
              <template v-for="p in shownProperties()" :key="p.id">
                <tr class="clickable" @click="openPropertyPage(p.id)">
                  <td class="strong">{{ p.name }}</td>
                  <td class="num">{{ unitsOf(p.id).length }}</td>
                  <td>{{ mixText(unitsOf(p.id)) }}</td>
                  <td>{{ !unitsOf(p.id).length ? 'Not started' : `${isDone(p.id) ? unitsOf(p.id).length : (monthDocs[p.id]?.completedUnits || 0)} of ${unitsOf(p.id).length} completed` }}</td>
                  <td><span class="pill" :class="isDone(p.id) ? 'green' : 'grey'">{{ isDone(p.id) ? 'Completed' : 'Draft' }}</span></td>
                  <td :class="attentionText(p.id) === '—' ? 'muted' : 'att'">{{ attentionText(p.id) }}</td>
                  <td class="num"><button class="navlink" @click.stop="openPropertyPage(p.id)">Open →</button></td>
                </tr>
              </template>
              <tr v-show="!loading && !shownProperties().length"><td colspan="7" class="muted">No properties yet. Add one, or upload an eZee report and it is created for you.</td></tr>
            </tbody>
          </table>
        </div>
        <div class="card-foot"><span>Click a property to open its tabs (Overview, Units, Owners, Fees & rates, OTA commissions, Audit log).</span></div>
      </section>
    </div>

    <!-- ========== OWNERS (top tab, and the property's Owners tab) ========== -->
    <div v-show="(top === 'owners' && !onProperty()) || (onProperty() && ptab === 'owners')">
      <section class="card">
        <div class="card-head"><h2>{{ `Owners · ${shownOwners().length}` }}</h2>
          <div class="pills"><button class="pill-btn" :class="{ on: !showInactive }" @click="showInactive = false">Active</button><button class="pill-btn" :class="{ on: showInactive }" @click="showInactive = true">Deactivated</button></div></div>
        <p class="card-intro">Owner names and bank details are personal data (PDPA). Only Finance and Directors can see the full details; this list shows a code and the last 4 digits.
          Owner details can later come from the Google Sheet staff already keep (cached copy plus Sync now).</p>
        <div class="toolbar"><input class="input" type="search" placeholder="Search owner code or unit" v-model="ownerSearch" aria-label="Search owner"></div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Owner</th><th>Units</th><th>Arrangement</th><th>Paid to</th><th class="num">Carried forward (RM)</th><th></th></tr></thead>
            <tbody>
              <template v-for="own in shownOwners()" :key="own.id">
                <tr class="clickable" @click="openOwner(own)">
                  <td class="strong">{{ own.code || own.id }}</td>
                  <td>{{ ownerUnits(own.id).map(x => x.unitCode).join(', ') || '—' }}</td>
                  <td>{{ [...new Set(ownerUnits(own.id).map(x => arrLabel(x.terms?.arrangement)))].join(', ') || '—' }}</td>
                  <td>{{ own.bankLast4 ? `Bank transfer ···${own.bankLast4}` : '—' }}</td>
                  <td class="num" :class="{ 'neg-amt': carried(own.id) < 0 }">{{ amt(carried(own.id)) }}</td>
                  <td class="num"><button class="navlink" @click.stop="openOwner(own)">View</button></td>
                </tr>
              </template>
              <tr v-show="!loading && !shownOwners().length"><td colspan="6" class="muted">No owners here yet. Add one, then link their units on the Units tab.</td></tr>
            </tbody>
          </table>
        </div>
        <div class="card-foot"><span>{{ `Showing ${shownOwners().length} of ${owners.length} owners` }}</span><button class="btn" @click="openOwnerForm(null)">+ Add owner</button></div>
      </section>
    </div>

    <!-- ========== BOOKINGS (manual) ========== -->
    <div v-show="top === 'bookings' && !onProperty()">
      <section class="kpis">
        <div class="card kpi"><div class="label">Bookings</div><div class="value">{{ shownBookings().filter(x => !x.cancelled).length }}</div><div class="hint">Typed in by hand</div></div>
        <div class="card kpi"><div class="label">Long-term tenants</div><div class="value">{{ shownBookings().filter(x => !x.cancelled && nightsOf(x) >= 30).length }}</div><div class="hint">30 nights or more</div></div>
        <div class="card kpi"><div class="label">Awaiting payment</div><div class="value" :class="{ alert: shownBookings().filter(x => !x.cancelled && !x.paidAmount).length }">{{ shownBookings().filter(x => !x.cancelled && !x.paidAmount).length }}</div><div class="hint">No payment recorded</div></div>
        <div class="card kpi"><div class="label">Invoices waiting</div><div class="value">{{ shownBookings().filter(x => x.invoiceStatus === 'pending').length }}</div><div class="hint">For Finance to approve</div></div>
      </section>
      <section class="card">
        <div class="card-head"><h2>Bookings <span class="sample-tag">sample</span></h2><button class="btn btn-primary" @click="openBookingForm(null)">+ Add booking</button></div>
        <p class="card-intro">For stays not booked through eZee, e.g. long-term tenants. These are sample rows: adding and editing work on this screen only, saving to Firebase comes later.</p>
        <div class="toolbar">
          <input class="input" type="search" placeholder="Search booking no., unit or tenant" v-model="bookingSearch" aria-label="Search booking">
          <div class="pills"><button class="pill-btn" :class="{ on: !showCancelled }" @click="showCancelled = false">Active</button><button class="pill-btn" :class="{ on: showCancelled }" @click="showCancelled = true">Cancelled</button></div>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Booking no.</th><th>Unit</th><th>Guest / tenant</th><th>Move in</th><th>Move out</th><th>Source</th><th class="num">Rental (RM)</th><th>Payment</th><th></th></tr></thead>
            <tbody>
              <template v-for="bkRow in shownBookings()" :key="bkRow.id">
                <tr class="clickable" @click="openBookingForm(bkRow)">
                  <td class="strong">{{ bkRow.id }}</td>
                  <td>{{ bkRow.unitCode }}</td>
                  <td>{{ bkRow.guest.fullName }}</td>
                  <td>{{ dmy(bkRow.commence) }}</td>
                  <td>{{ dmy(bkRow.departure) }}</td>
                  <td>{{ bkRow.source }}</td>
                  <td class="num">{{ amt(bkRow.money.rental) }}</td>
                  <td><span class="pill" :class="bkRow.cancelled ? 'red' : bkRow.paidAmount ? 'green' : 'amber'">{{ bkRow.cancelled ? 'Cancelled' : bkRow.paidAmount ? 'Paid' : 'Awaiting' }}</span></td>
                  <td class="num"><button class="navlink" @click.stop="openBookingForm(bkRow)">View</button></td>
                </tr>
              </template>
              <tr v-show="!shownBookings().length"><td colspan="9" class="muted">No bookings match.</td></tr>
            </tbody>
          </table>
        </div>
        <div class="card-foot"><span>Invoice and receipt PDFs are made from a booking, approved by Finance, saved to the company Google Drive and listed on Finance › Invoices & Receipts. Nothing is sent automatically.</span></div>
      </section>
    </div>

    <!-- ========== PROPERTY: OVERVIEW ========== -->
    <div v-show="onProperty() && ptab === 'overview'">
      <section class="kpis">
        <div class="card kpi"><div class="label">Units</div><div class="value">{{ units.length }}</div><div class="hint">{{ mixText(units) || 'None yet' }}</div></div>
        <div class="card kpi"><div class="label">Fixed rent a month</div><div class="value small">{{ `RM ${amt(fixedTotal())}` }}</div><div class="hint">{{ `${units.filter(x => x.terms?.arrangement === 'fixedRent').length} fixed-rent units` }}</div></div>
        <div class="card kpi"><div class="label">{{ `${monthOnly(asOf)} statements` }}</div><div class="value small">{{ isDone(propertyId) ? 'Completed' : 'Open' }}</div><div class="hint">Month-end payout</div></div>
        <div class="card kpi"><div class="label">Needs attention</div><div class="value" :class="{ alert: units.filter(x => !x.terms).length }">{{ units.filter(x => !x.terms).length }}</div><div class="hint">Units not set up</div></div>
      </section>
      <section class="card">
        <div class="card-head"><h2>Property details</h2><button class="editlink" @click="openProperty(property())">Edit ›</button></div>
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
            <p class="help">Unit details (owner, type, rooms, size, car parks, bill accounts, JMB) are on each unit: Units tab, Edit.</p>
          </div>
        </div>
      </section>
    </div>

    <!-- ========== PROPERTY: UNITS ========== -->
    <div v-show="onProperty() && ptab === 'units'">
      <div class="notice warn" v-show="units.filter(x => !x.terms).length && (property().code || '').toUpperCase() === 'DM'">
        <span>{{ `${units.filter(x => !x.terms).length} units aren't set up yet.` }}</span> <button class="link" style="margin-left:8px" @click="loadStarter()" :disabled="busy">{{ `Load D'Majestic starter settings from ${monthName(asOf)}` }}</button>
      </div>
      <section class="card">
        <h2 class="t">{{ `Units · ${units.length}` }}</h2>
        <p class="card-intro">Click a unit to change its settings (arrangement, owner, fixed rent, eZee name, status). Saving asks which month the change starts from and why, so completed months never change. Every change goes in the audit log below.</p>
        <div class="toolbar">
          <input class="input" type="search" placeholder="Search unit or owner" v-model="search" aria-label="Search unit">
          <div class="pills">
            <template v-for="f in filters" :key="f.key">
              <button class="pill-btn" :class="{ on: filter === f.key }" @click="filter = f.key">{{ `${f.label} (${units.filter(x => match(x, f.key)).length})` }}</button>
            </template>
          </div>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Unit</th><th>Arrangement</th><th>Fixed rent</th><th class="num">Monthly amount (RM)</th><th>Effective from</th><th>Last changed</th><th></th></tr></thead>
            <tbody>
              <template v-for="row in shown()" :key="row.id">
                <tr class="clickable" :class="{ future: futureOf(row) }" @click="openUnit(row)">
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
              <tr v-show="!loading && !shown().length"><td colspan="7" class="muted">No units match.</td></tr>
            </tbody>
          </table>
        </div>
        <div class="card-foot"><span>{{ `Showing ${shown().length} of ${units.length} units · ${units.filter(x => x.terms?.arrangement === 'fixedRent').length} on fixed rent · RM ${amt(fixedTotal())} a month` }}</span></div>
      </section>

      <section class="card" style="margin-top:20px">
        <h2 class="t">Audit log · unit settings</h2>
        <p class="card-intro">Every change is recorded with who, when, old and new value, effective month and reason. Saving asks for the reason. Entries can't be edited or deleted.</p>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>When</th><th>Who</th><th>Unit</th><th>Change</th><th>Effective from</th><th>Reason</th></tr></thead>
            <tbody>
              <template v-for="a in audits.filter(x => /^unit/.test(x.action || '')).slice(0, 12)" :key="a.id">
                <tr><td class="nw">{{ stamp(a.at) }}</td><td class="nw">{{ a.userName || '' }}</td><td class="nw">{{ unitCodeOfEntity(a.entity) }}</td>
                  <td>{{ changeText(a) }}</td><td>{{ a.month ? shortName(a.month) : '—' }}</td><td>{{ a.reason || '—' }}</td></tr>
              </template>
              <tr v-show="!audits.filter(x => /^unit/.test(x.action || '')).length"><td colspan="6" class="muted">No unit changes recorded yet.</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <!-- ========== PROPERTY: FEES & RATES ========== -->
    <div v-show="onProperty() && ptab === 'rates'">
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
    <div v-show="onProperty() && ptab === 'ota'">
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
    <div v-show="onProperty() && ptab === 'audit'">
      <section class="card">
        <h2 class="t">Audit log</h2>
        <p class="card-intro">Every change to this property: who, when, old and new value, start month and reason. Entries can't be edited or deleted.</p>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>When</th><th>Who</th><th>What</th><th>Change</th><th>Month</th><th>Reason</th></tr></thead>
            <tbody>
              <template v-for="a in audits" :key="a.id">
                <tr><td class="nw">{{ stamp(a.at) }}</td><td class="nw">{{ a.userName || '' }}</td><td class="nw">{{ actionText(a) }}</td>
                  <td>{{ changeText(a) }}</td><td>{{ a.month ? shortName(a.month) : '—' }}</td><td>{{ a.reason || '—' }}</td></tr>
              </template>
              <tr v-show="!audits.length"><td colspan="6" class="muted">Nothing recorded yet.</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <!-- ========== Drawer: Edit / Add unit ========== -->
    <template v-if="unitOpen">
      <div>
        <div class="drawer-back" @click="unitOpen = false"></div>
        <aside class="drawer" role="dialog" aria-label="Edit unit" v-esc="() => { unitOpen = false }">
          <div class="drawer-head"><h2>{{ u.isNew ? 'Add unit' : `Edit unit · ${u.unitCode}` }}</h2><button class="icon-btn" @click="unitOpen = false" aria-label="Close">×</button></div>
          <form class="drawer-body" id="unitForm" @submit.prevent="saveUnit()">
            <div class="notice error" v-show="u.error">{{ u.error }}</div>
            <div class="field"><label for="uCode">Unit code</label>
              <input class="input" id="uCode" v-model="u.unitCode" :readonly="!u.isNew" :placeholder="`${property().code || 'DM'} 1615`">
              <span class="help" v-show="u.isNew">As Finance writes it: property code, space, floor and unit, e.g. DM 0719.</span></div>
            <div class="field"><label for="uAlias">Other eZee names for this unit</label>
              <input class="input" id="uAlias" v-model="u.aliases" placeholder="e.g. DM 1509-2"><span class="help">Comma between names. Bookings under these names count for this unit on the next upload.</span></div>
            <div class="field"><label for="uOwner">Owner</label>
              <select class="input" id="uOwner" v-model="u.ownerId">
                <option value="">No owner linked</option>
                <template v-for="own in owners.filter(x => x.active !== false || x.id === u.ownerId)" :key="own.id"><option :value="own.id" :selected="own.id === u.ownerId">{{ ownerLabel(own.id) }}</option></template>
              </select>
              <span class="help">Not in the list? Add them on the Owners tab first.</span></div>
            <div class="form-sec">Unit details</div>
            <div class="field"><label for="uType">Unit type</label>
              <select class="input" id="uType" v-model="u.info.type"><option value="">Choose</option>
                <template v-for="t in UNIT_TYPES" :key="t"><option :value="t" :selected="t === u.info.type">{{ t }}</option></template></select></div>
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
            <hr class="divider">
            <div class="field"><label for="uArr">Arrangement</label>
              <select class="input" id="uArr" v-model="u.arrangement">
                <option value="">Not set up</option>
                <template v-for="(a, k) in ARRANGEMENTS" :key="k"><option :value="k" :selected="k === u.arrangement">{{ a.label }}</option></template>
              </select></div>
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
            <div class="field"><label for="uWhy">Reason (audit log)</label><textarea class="input" id="uWhy" v-model="u.reason" placeholder="e.g. New owner agreement from June"></textarea></div>
            <hr class="divider">
            <h3 style="margin:0 0 6px;font-size:14px">Settings history</h3>
            <div class="rows history-list">
              <template v-for="h in u.history" :key="h.id">
                <div class="row"><span>{{ `From ${h.effectiveFrom === '2000-01' ? 'the start' : monthName(h.effectiveFrom)} · ${arrLabel(h.arrangement)}` + (h.fixedRentAmount ? ` RM ${amt(h.fixedRentAmount)}` : '') + (h.reason ? ` · ${h.reason}` : '') }}</span><span class="r help">{{ h.createdByName || '' }}</span></div>
              </template>
              <div class="empty" v-show="!u.history?.length">No settings yet.</div>
            </div>
          </form>
          <div class="drawer-foot">
            <button class="btn" @click="unitOpen = false">Cancel</button>
            <button class="btn btn-primary" type="submit" form="unitForm" :disabled="busy">{{ busy ? 'Saving…' : 'Save unit' }}</button>
          </div>
        </aside>
      </div>
    </template>

    <!-- ========== Drawer: Add / edit property ========== -->
    <template v-if="propOpen">
      <div>
        <div class="drawer-back" @click="propOpen = false"></div>
        <aside class="drawer wide" role="dialog" aria-label="Property" v-esc="() => { propOpen = false }">
          <div class="drawer-head"><h2>{{ np.id ? `Edit property · ${np.name}` : 'Add property' }}</h2><button class="icon-btn" @click="propOpen = false" aria-label="Close">×</button></div>
          <form class="drawer-body" id="propForm" @submit.prevent="saveProperty()">
            <div class="notice error" v-show="np.error">{{ np.error }}</div>
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
            <p class="help" v-show="!np.id">After saving, add its units from the Units tab. It starts with the standard OTA rates (change them under OTA commissions). The change is recorded in the audit log.</p>
          </form>
          <div class="drawer-foot"><button class="btn" @click="propOpen = false">Cancel</button><button class="btn btn-primary" type="submit" form="propForm" :disabled="busy">{{ np.id ? 'Save property' : 'Add property' }}</button></div>
        </aside>
      </div>
    </template>

    <!-- ========== Drawer: Owner (view / edit / add) ========== -->
    <template v-if="ownerOpen">
      <div>
        <div class="drawer-back" @click="ownerOpen = false"></div>
        <aside class="drawer wide" role="dialog" aria-label="Owner" v-esc="() => { ownerOpen = false }">
          <div class="drawer-head"><h2>{{ o.isNew ? 'Add owner' : `${o.code}${o.fullName ? ' · ' + o.fullName : ''}` }}</h2><button class="icon-btn" @click="ownerOpen = false" aria-label="Close">×</button></div>
          <form class="drawer-body" id="ownerForm" @submit.prevent="saveOwner()">
            <div class="notice error" v-show="o.error">{{ o.error }}</div>
            <div class="notice warn" v-show="o.active === false">{{ `Deactivated${o.deactivatedReason ? ': ' + o.deactivatedReason : ''}. Their history stays; they can't be linked to new units.` }}</div>
            <template v-if="!o.isNew">
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
            <div class="form-sec">Personal details <span class="help" style="text-transform:none;letter-spacing:0;font-weight:400">· private, Finance and Directors only</span></div>
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
            <div class="form-sec">Bank</div>
            <div class="grid-3">
              <div class="field"><label for="oBank">Bank name</label><input class="input" id="oBank" v-model="o.bankName"></div>
              <div class="field"><label for="oHolder">Account holder name</label><input class="input" id="oHolder" v-model="o.accountHolder"></div>
              <div class="field"><label for="oAcc">Bank account</label><input class="input" id="oAcc" v-model="o.bankAccount" inputmode="numeric"></div>
            </div>
            <div class="field" v-show="!o.isNew"><label for="oWhy">Reason (audit log)</label><input class="input" id="oWhy" v-model="o.reason" placeholder="e.g. Owner changed bank"></div>
            <template v-if="!o.isNew && o.active !== false">
              <div class="confirm-box" v-show="o.deactivating">
                <div class="field" style="margin-bottom:10px"><label for="oDeact">Why deactivate this owner?</label><input class="input" id="oDeact" v-model="o.deactivateReason" placeholder="e.g. Sold the unit"></div>
                <button type="button" class="btn btn-primary" @click="deactivateOwner()" :disabled="busy">Deactivate owner</button> <button type="button" class="btn" @click="o.deactivating = false">Keep active</button>
              </div>
            </template>
          </form>
          <div class="drawer-foot">
            <button class="btn" style="margin-right:auto" v-show="!o.isNew && o.active !== false && !o.deactivating" @click="o.deactivating = true">Deactivate</button>
            <button class="btn" v-show="!o.isNew && o.active === false" @click="reactivateOwner()" :disabled="busy">Turn back on</button>
            <button class="btn" @click="ownerOpen = false">Cancel</button>
            <button class="btn btn-primary" type="submit" form="ownerForm" :disabled="busy">{{ o.isNew ? 'Add owner' : 'Save owner' }}</button>
          </div>
        </aside>
      </div>
    </template>

    <!-- ========== Drawer: Booking (sample, in memory) ========== -->
    <template v-if="bookingOpen">
      <div>
        <div class="drawer-back" @click="bookingOpen = false"></div>
        <aside class="drawer wide" role="dialog" aria-label="Booking" v-esc="() => { bookingOpen = false }">
          <div class="drawer-head"><h2>{{ bk.isNew ? 'Add booking' : `Booking ${bk.id}` }}</h2><button class="icon-btn" @click="bookingOpen = false" aria-label="Close">×</button></div>
          <form class="drawer-body" id="bookingForm" @submit.prevent="saveBooking()">
            <div class="notice error" v-show="bk.error">{{ bk.error }}</div>
            <div class="notice warn" v-show="bk.cancelled">{{ `Cancelled: ${bk.cancelReason || ''}` }}</div>
            <p class="help" style="margin-top:0">Sample screen: changes stay on this page until saving to Firebase is built.</p>
            <template v-if="!bk.isNew && !bk.cancelled">
              <div class="actions" style="margin:0 0 6px">
                <button type="button" class="btn" @click="openDoc('invoice')">Generate invoice</button>
                <button type="button" class="btn" @click="openDoc('receipt')" :disabled="!(Number(bk.paidAmount) > 0)" :title="Number(bk.paidAmount) > 0 ? '' : 'Record a payment first'">Generate receipt</button>
              </div>
            </template>
            <div class="form-sec">Stay</div>
            <div class="grid-fields">
              <div class="field"><label for="bUnit">Unit</label>
                <input class="input" id="bUnit" v-model="bk.unitCode" list="unitList" placeholder="e.g. DM 12-03">
                <datalist id="unitList"><template v-for="x in allUnits" :key="x.id"><option :value="x.unitCode"></option></template></datalist></div>
              <div class="field"><label for="bSrc">Source</label>
                <select class="input" id="bSrc" v-model="bk.source"><option>Walk-in</option><option>Agent</option><option>Referral</option><option>Website</option><option>Social media</option><option>Other</option></select></div>
              <div class="field"><label for="bIn">Commence date (move in)</label><input class="input" id="bIn" type="date" v-model="bk.commence"></div>
              <div class="field"><label for="bOut">Departure date (move out)</label><input class="input" id="bOut" type="date" v-model="bk.departure">
                <span class="help">{{ nightsOf(bk) ? `${nightsOf(bk)} nights · ${nightsOf(bk) >= 30 ? 'long-term (30+ days)' : 'short-term'}` : '' }}</span></div>
              <div class="field"><label for="bSales">Sales person</label><input class="input" id="bSales" v-model="bk.salesPerson" placeholder="e.g. Operations 1"></div>
            </div>
            <div class="form-sec">Guest / tenant <span class="help" style="text-transform:none;letter-spacing:0;font-weight:400">· private</span></div>
            <div class="grid-fields">
              <div class="field"><label for="gName">Full name</label><input class="input" id="gName" v-model="bk.guest.fullName" placeholder="e.g. Tenant 1"></div>
              <div class="field"><label for="gIc">IC / passport</label><input class="input" id="gIc" v-model="bk.guest.ic"></div>
              <div class="field"><label for="gEmail">Email</label><input class="input" id="gEmail" type="email" v-model="bk.guest.email"></div>
              <div class="field"><label for="gPhone">Phone number</label><input class="input" id="gPhone" v-model="bk.guest.phone"></div>
              <div class="field"><label for="gDob">Date of birth</label><input class="input" id="gDob" type="date" v-model="bk.guest.dob"></div>
              <div class="field"><label for="gWa">WhatsApp</label><input class="input" id="gWa" v-model="bk.guest.whatsapp"></div>
              <div class="field"><label for="gWc">WeChat ID</label><input class="input" id="gWc" v-model="bk.guest.wechat"></div>
              <div></div>
              <div class="field" style="grid-column:1/-1"><label for="gAddr">Correspondence address</label><textarea class="input" id="gAddr" v-model="bk.guest.address"></textarea></div>
              <div class="field"><label for="gBank">Bank name</label><input class="input" id="gBank" v-model="bk.guest.bankName"></div>
              <div class="field"><label for="gHolder">Account holder name</label><input class="input" id="gHolder" v-model="bk.guest.accountHolder"></div>
              <div class="field"><label for="gAcc">Bank account</label><input class="input" id="gAcc" v-model="bk.guest.bankAccount"><span class="help">For refunding the deposit.</span></div>
            </div>
            <div class="form-sec">Money (RM)</div>
            <div class="grid-3">
              <template v-for="f in MONEY" :key="f.key">
                <div class="field"><label :for="`m_${f.key}`">{{ f.label }}</label><input class="input" :id="`m_${f.key}`" type="number" step="0.01" min="0" v-model="bk.money[f.key]"></div>
              </template>
            </div>
            <div class="kv" style="border-top:1px solid var(--line)"><span>Total to invoice</span><span>{{ `RM ${amt(moneyTotal(bk))}` }}</span></div>
            <div class="form-sec">Payment</div>
            <div class="grid-3">
              <div class="field"><label for="pAmt">Payment amount (RM)</label><input class="input" id="pAmt" type="number" step="0.01" min="0" v-model="bk.paidAmount"></div>
              <div class="field"><label for="pMeth">Payment method</label>
                <select class="input" id="pMeth" v-model="bk.paymentMethod"><option value="">Choose</option><option>Bank transfer</option><option>DuitNow</option><option>Cash</option><option>Card</option><option>Cheque</option></select></div>
              <div class="field"><label for="pDate">Payment date</label><input class="input" id="pDate" type="date" v-model="bk.paidOn"></div>
            </div>
            <div class="field"><label for="pSlip">Payment slip</label>
              <input class="input" id="pSlip" v-model="bk.slipLink" placeholder="Paste the Google Drive link to the slip">
              <span class="help">Slips are kept in the company Google Drive; the PMS keeps only the link. Uploading straight to Drive comes later.</span></div>
            <template v-if="!bk.isNew && !bk.cancelled">
              <div>
                <div class="confirm-box" v-show="bk.cancelling">
                  <div class="field" style="margin-bottom:10px"><label for="bCx">Why cancel this booking?</label><input class="input" id="bCx" v-model="bk.cancelReasonDraft" placeholder="e.g. Tenant changed their mind before move in"></div>
                  <button type="button" class="btn btn-primary" @click="cancelBooking()">Cancel booking</button> <button type="button" class="btn" @click="bk.cancelling = false">Keep it</button>
                </div>
              </div>
            </template>
          </form>
          <div class="drawer-foot">
            <button class="btn" style="margin-right:auto" v-show="!bk.isNew && !bk.cancelled && !bk.cancelling" @click="bk.cancelling = true">Cancel booking</button>
            <button class="btn" @click="bookingOpen = false">Close</button>
            <button class="btn btn-primary" type="submit" form="bookingForm" v-show="!bk.cancelled">{{ bk.isNew ? 'Add booking' : 'Save booking' }}</button>
          </div>
        </aside>
      </div>
    </template>

    <!-- ========== Invoice / receipt preview (read-only) ========== -->
    <template v-if="docOpen">
      <div class="modal-back" @click.self="docOpen = null" v-esc="() => { docOpen = null }">
        <div class="modal wide" role="dialog" :aria-label="docOpen === 'invoice' ? 'Invoice preview' : 'Receipt preview'">
          <div class="card-head" style="margin-bottom:14px"><h2 style="margin:0">{{ docOpen === 'invoice' ? 'Invoice preview' : 'Receipt preview' }}</h2>
            <span class="watermark">{{ docOpen === 'invoice' ? 'Draft · waiting for Finance approval' : 'Draft' }}</span></div>
          <div class="doc">
            <div class="doc-head">
              <div><div class="doc-logo">WIDEBED</div><div style="font-size:11px;color:#7A8190;margin-top:4px">Widebed Property Management · Kuala Lumpur, Malaysia</div></div>
              <div class="doc-title"><b>{{ docOpen === 'invoice' ? 'INVOICE' : 'OFFICIAL RECEIPT' }}</b>
                <span>{{ docNo() }}</span><br><span>{{ `Date: ${dmy(docOpen === 'receipt' && bk.paidOn ? bk.paidOn : today)}` }}</span></div>
            </div>
            <div class="doc-parties">
              <div><b>{{ docOpen === 'invoice' ? 'Bill to' : 'Received from' }}</b><span>{{ bk.guest.fullName || '—' }}</span><br><span>{{ bk.guest.address || '' }}</span></div>
              <div><b>Stay</b><span>{{ `${bk.unitCode} · ${propertyOfUnitCode(bk.unitCode)}` }}</span><br><span>{{ `${dmy(bk.commence)} to ${dmy(bk.departure)} (${nightsOf(bk)} nights)` }}</span></div>
            </div>
            <table v-show="docOpen === 'invoice'">
              <thead><tr><th>Item</th><th class="num">Amount (RM)</th></tr></thead>
              <tbody><template v-for="f in MONEY.filter(f => Number(bk.money[f.key]) > 0)" :key="f.key"><tr><td>{{ f.label }}</td><td class="num">{{ amt(bk.money[f.key]) }}</td></tr></template></tbody>
              <tfoot><tr><td>Total due</td><td class="num">{{ amt(moneyTotal(bk)) }}</td></tr></tfoot>
            </table>
            <table v-show="docOpen === 'receipt'">
              <thead><tr><th>Payment</th><th>Method</th><th class="num">Amount (RM)</th></tr></thead>
              <tbody><tr><td>{{ `For ${bk.id}, ${bk.unitCode}` }}</td><td>{{ bk.paymentMethod || '—' }}</td><td class="num">{{ amt(bk.paidAmount) }}</td></tr></tbody>
              <tfoot><tr><td colspan="2">Total received</td><td class="num">{{ amt(bk.paidAmount) }}</td></tr>
                <tr v-show="moneyTotal(bk) - Number(bk.paidAmount || 0) > 0.004"><td colspan="2" style="font-weight:500;border-top:0">Balance still due</td><td class="num" style="font-weight:500;border-top:0">{{ amt(moneyTotal(bk) - Number(bk.paidAmount || 0)) }}</td></tr></tfoot>
            </table>
            <div class="doc-note">{{ docOpen === 'invoice' ? 'Please pay by bank transfer and send the slip to Widebed. Deposits are refunded at move out, less any unpaid bills or damage.' : 'This receipt is computer generated and needs no signature.' }}</div>
          </div>
          <p class="help" style="margin-top:14px">{{ docOpen === 'invoice'
            ? 'Read-only. Finance must approve an invoice before it is issued; it is never sent automatically. Once approved it is saved as a PDF with the Widebed logo to the company Google Drive and listed on Finance › Invoices & Receipts (coming later).'
            : 'Read-only. Made from the recorded payment. Once Finance completes it, it is saved as a PDF to the company Google Drive and listed on Finance › Invoices & Receipts (coming later).' }}</p>
          <div class="modal-foot">
            <button class="btn" @click="docOpen = null">Close</button>
            <button class="btn btn-primary" v-show="docOpen === 'invoice'" @click="sendForApproval()" :disabled="bk.invoiceStatus === 'pending'">{{ bk.invoiceStatus === 'pending' ? 'Waiting for Finance' : 'Send to Finance for approval' }}</button>
          </div>
        </div>
      </div>
    </template>
  </main>
</template>

<script>
import { collection, doc, getDoc, getDocs, query, where, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase.js';
import { toast } from '@/lib/toast.js';
import { ARRANGEMENTS, DEFAULT_OTA, DM_STARTER, unitIdOf } from '@/lib/engine.js';
import { loadProperties, loadSetup, latestVersion, audit, friendlyError } from '@/lib/finance-data.js';
import { amt, monthName, monthOffset, stamp, pct, dmy, dayOffset } from '@/lib/format.js';
import { useSession } from '@/stores/session.js';

const me = useSession();

let params = new URLSearchParams(location.search);
const pctIn = v => (v === '' || v == null ? null : Number(v) / 100);
const pctOut = v => (v == null ? '' : +(v * 100).toFixed(4));
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const msOf = t => (t?.toMillis ? t.toMillis() : 0);
const dateOnly = t => { if (!t) return ''; const d = t.toDate ? t.toDate() : new Date(t); return `${d.getDate()} ${MON3[d.getMonth()]} ${d.getFullYear()}`; };
const prevMonth = ym => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const PRIVATE = ['fullName', 'ic', 'email', 'phone', 'dob', 'whatsapp', 'wechat', 'address', 'bankName', 'accountHolder', 'bankAccount'];
const MONEY = [
  { key: 'rental', label: 'Rental' }, { key: 'securityDeposit', label: 'Security deposit' }, { key: 'utilityDeposit', label: 'Utility deposit' },
  { key: 'advanceRental', label: 'Advance rental' }, { key: 'cleaningFee', label: 'Cleaning fee' }, { key: 'wifiFee', label: 'Wi-Fi fee' }, { key: 'carPark', label: 'Car park' }
];
const emptyGuest = () => Object.fromEntries(PRIVATE.map(k => [k, '']));
// Sample manual bookings (placeholder people). Kept on this page only until bookings can be saved.
const SAMPLE_BOOKINGS = [
  { id: 'MB-2610-001', propertyCode: 'DM', unitCode: 'DM 12-03', source: 'Agent', salesPerson: 'Operations 1', commence: '2026-10-01', departure: '2027-09-30',
    guest: { ...emptyGuest(), fullName: 'Tenant 1', email: 'tenant1@example.com', phone: '012-000 0001' },
    money: { rental: 2100, securityDeposit: 4200, utilityDeposit: 500, advanceRental: 2100, cleaningFee: 150, wifiFee: 0, carPark: 150 },
    paidAmount: 9200, paymentMethod: 'Bank transfer', paidOn: '2026-09-28', slipLink: 'https://drive.google.com/…', invoiceStatus: 'approved' },
  { id: 'MB-2610-002', propertyCode: 'DM', unitCode: 'DM 16-02', source: 'Referral', salesPerson: 'Operations 2', commence: '2026-10-15', departure: '2027-04-14',
    guest: { ...emptyGuest(), fullName: 'Tenant 2', email: 'tenant2@example.com' },
    money: { rental: 2000, securityDeposit: 4000, utilityDeposit: 500, advanceRental: 0, cleaningFee: 150, wifiFee: 80, carPark: 0 },
    paidAmount: '', paymentMethod: '', paidOn: '', slipLink: '', invoiceStatus: 'pending' },
  { id: 'MB-2610-003', propertyCode: 'DM', unitCode: 'DM 09-01', source: 'Walk-in', salesPerson: 'Operations 1', commence: '2026-10-20', departure: '2026-11-05',
    guest: { ...emptyGuest(), fullName: 'Guest 3' },
    money: { rental: 1600, securityDeposit: 300, utilityDeposit: 0, advanceRental: 0, cleaningFee: 80, wifiFee: 0, carPark: 0 },
    paidAmount: 1980, paymentMethod: 'DuitNow', paidOn: '2026-10-19', slipLink: '', invoiceStatus: '' }
];

const PROP_INFO = ['address', 'city', 'state', 'ezeeAccount', 'ezeeName'];
const UNIT_INFO = ['type', 'bedrooms', 'bathrooms', 'sizeSqft', 'carParks', 'tnb', 'water', 'wifi', 'sewerage', 'jmb'];
const STATES = ['Johor', 'Kedah', 'Kelantan', 'Melaka', 'Negeri Sembilan', 'Pahang', 'Perak', 'Perlis', 'Pulau Pinang', 'Sabah', 'Sarawak', 'Selangor', 'Terengganu',
  'W.P. Kuala Lumpur', 'W.P. Labuan', 'W.P. Putrajaya'];
const CARRY = ['bookings', 'search', 'filter', 'propSearch', 'ownerSearch', 'showInactive', 'bookingSearch', 'showCancelled', 'okMsg'];
let carry = null;
const UNIT_TYPES = ['Studio', '1 bedroom', '2 bedrooms', '3 bedrooms', 'Dual key', 'Penthouse', 'Other'];

export default {
  beforeCreate() { params = new URLSearchParams(location.search); },
  data() {
    return {
      ARRANGEMENTS, MONEY, STATES, UNIT_TYPES, amt, monthName, stamp, pct, dmy, today: dayOffset(0),
      PTABS: [{ key: 'overview', label: 'Overview' }, { key: 'units', label: 'Units' }, { key: 'owners', label: 'Owners' },
        { key: 'rates', label: 'Fees & rates' }, { key: 'ota', label: 'OTA commissions' }, { key: 'audit', label: 'Audit log' }],
      // Owners, Properties and Bookings share this page; the route picks the section.
      top: this.$route.meta.section || 'properties',
      ptab: params.get('ptab') || 'units',
      properties: [], propertyId: params.get('property') || 'all', asOf: params.get('month') || monthOffset(0),
      months: Array.from({ length: 25 }, (_, i) => monthOffset(1 - i)),
      allUnits: [], units: [], owners: [], monthDocs: {}, bfLines: [], audits: [],
      bookings: SAMPLE_BOOKINGS.map(x => JSON.parse(JSON.stringify(x))),
      search: '', filter: 'all', propSearch: '', ownerSearch: '', showInactive: false, bookingSearch: '', showCancelled: false,
      filters: [{ key: 'all', label: 'All' }, { key: 'none', label: 'Not set up' }, { key: 'share', label: 'Profit share' }, { key: 'fixed', label: 'Fixed rent' }, { key: 'long', label: 'Long-term' }],
      loading: true, busy: false, error: '', okMsg: '',
      unitOpen: false, u: { history: [] }, propOpen: false, np: { info: {} },
      ownerOpen: false, o: { payouts: [] }, bookingOpen: false, bk: { guest: {}, money: {} }, docOpen: null,
      rates: { form: {}, effectiveFrom: monthOffset(0), reason: '', earlyToOwner: true, tourismTax: 10, current: null }
    };
  },
  created() {
    if (carry?.section === this.top) Object.assign(this, carry.state);
    carry = null;
  },
  async mounted() {
    if (!this.months.includes(this.asOf)) this.months.push(this.asOf);
    if (!this.PTABS.some(t => t.key === this.ptab)) this.ptab = 'units';
    await this.go();
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
    toList(tab) { this.okMsg = ''; this.$router.push(tab === this.$route.meta.section ? this.urlFor(tab, 'all') : `/Portfolio/${tab}`); },
    openPropertyPage(id) { this.okMsg = ''; this.$router.push(this.$route.meta.section === 'properties' ? this.urlFor('properties', id, 'units') : `/Portfolio/properties?property=${id}`); },
    // Property or month picked in the header: new address (replaces it, as before). The router remounts the page,
    // so what the old page kept in memory (sample bookings, searches, filters) is carried over to the new one.
    switchProperty() { this.okMsg = ''; this.reload(); },
    switchMonth() { this.reload(); },
    reload() {
      const url = this.urlFor(this.$route.meta.section);
      if (url === this.$route.fullPath) { this.go(); return; }
      carry = { section: this.top, state: Object.fromEntries(CARRY.map(k => [k, this[k]])) };
      this.$router.replace(url);
    },
    async setPtab(k) { this.ptab = k; this.okMsg = ''; this.syncUrl(); if (k === 'rates' || k === 'ota') await this.openRates(); },

    async go() {
      this.loading = true; this.error = '';
      try {
        this.properties = await loadProperties();
        if (this.propertyId !== 'all' && !this.properties.some(p => p.id === this.propertyId)) this.propertyId = 'all';
        this.syncUrl();
        const [ownerSnap, sets, mdocs, bfSnap] = await Promise.all([
          getDocs(collection(db, 'owners')),
          Promise.all(this.properties.map(p => loadSetup(p.id, this.asOf))),
          Promise.all(this.properties.map(p => getDoc(doc(db, 'months', `${p.id}_${this.asOf}`)))),
          getDocs(query(collection(db, 'expenses'), where('month', '==', this.asOf)))
        ]);
        const owners = ownerSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        // Names live in private/main (PDPA); older owners kept the name on the main record.
        const privs = await Promise.all(owners.map(x => getDoc(doc(db, 'owners', x.id, 'private', 'main')).catch(() => null)));
        owners.forEach((x, i) => { x.private = privs[i]?.exists?.() ? privs[i].data() : {}; });
        this.owners = owners.sort((a, b) => (a.code || a.id).localeCompare(b.code || b.id));
        this.allUnits = sets.flatMap(s => s.units);
        this.monthDocs = Object.fromEntries(this.properties.map((p, i) => [p.id, mdocs[i].exists() ? mdocs[i].data() : { status: 'open' }]));
        this.bfLines = bfSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(e => e.auto && e.kind === 'broughtForward' && !e.deleted);
        this.units = this.propertyId === 'all' ? [] : this.allUnits.filter(x => x.propertyId === this.propertyId);
        if (this.onProperty()) {
          await this.loadAudits();
          if (this.ptab === 'rates' || this.ptab === 'ota') await this.openRates();
        }
      } catch (e) { this.error = friendlyError(e, 'load the portfolio'); }
      this.loading = false;
    },
    async loadAudits() {
      const snap = await getDocs(query(collection(db, 'auditLog'), where('propertyId', '==', this.propertyId)));
      this.audits = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => msOf(b.at) - msOf(a.at));
    },

    // ---- helpers ----
    shortName(m) { return m ? `${MON3[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}` : ''; },
    monthOnly(m) { return monthName(m).split(' ')[0]; },
    property() { return this.properties.find(p => p.id === this.propertyId) || {}; },
    propertyName() { return this.property().name || ''; },
    propertyNameOf(id) { return this.properties.find(p => p.id === id)?.name || ''; },
    propertyOfUnitCode(code) { const x = this.allUnits.find(y => y.unitCode === code); return x ? this.propertyNameOf(x.propertyId) : ''; },
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
    attentionText(pid) {
      const list = this.unitsOf(pid);
      if (!list.length) return 'Upload eZee report';
      const none = list.filter(x => !x.terms).length;
      return none ? `${none} to set up` : '—';
    },
    shownProperties() { const q = this.propSearch.trim().toLowerCase(); return this.properties.filter(p => !q || p.name.toLowerCase().includes(q) || (p.code || '').toLowerCase().includes(q)); },
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
    changeText(a) {
      const v = x => (x == null || x === '' ? '—' : Array.isArray(x) ? (x.join(', ') || '—') : ARRANGEMENTS[x]?.label || String(x));
      const names = { ownerId: 'Owner', aliases: 'eZee names', active: 'Active', arrangement: 'Arrangement', units: 'Units', status: 'Status' };
      return (a.changes || []).map(c => `${names[c.field] || c.field}: ${v(c.old)} → ${v(c.new)}`).join('; ') || '—';
    },
    actionText(a) {
      return ({ 'unit.create': 'Unit added', 'unit.update': 'Unit changed', 'unitTerms.starter': 'Starter settings', 'rates.create': 'Fees & rates', 'property.create': 'Property added',
        'property.update': 'Property changed', 'month.complete': 'Month completed', 'month.reopen': 'Month reopened', 'statement.complete': 'Statement completed', 'statement.reopen': 'Statement reopened' })[a.action] || a.action;
    },

    // ---- owners ----
    ownerName(id) { const x = this.owners.find(y => y.id === id); return x ? (x.private?.fullName || x.name || '') : ''; },
    ownerLabel(id) { const x = this.owners.find(y => y.id === id); if (!x) return ''; const n = this.ownerName(id); return `${x.code || x.id}${n ? ' · ' + n : ''}`; },
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
      const priv = Object.fromEntries(PRIVATE.map(k => [k, String(o[k] || '').trim()]));
      const before = o.original?.private || {};
      const changed = PRIVATE.filter(k => (before[k] ?? (k === 'fullName' ? o.original?.name || '' : '')) !== priv[k]);
      if (!o.isNew && !changed.length) { this.ownerOpen = false; return; }
      if (!o.isNew && !o.reason.trim()) return o.error = 'Add a short reason. It goes in the audit log.';
      const id = o.id || this.nextOwnerCode();
      const digits = priv.bankAccount.replace(/\D/g, '');
      this.busy = true;
      try {
        const b = writeBatch(db);
        const main = { code: id, active: o.active, bankLast4: digits ? digits.slice(-4) : null, updatedAt: serverTimestamp(), updatedBy: me.user.uid };
        if (o.isNew) Object.assign(main, { createdAt: serverTimestamp(), createdBy: me.user.uid });
        b.set(doc(db, 'owners', id), main, { merge: true });
        b.set(doc(db, 'owners', id, 'private', 'main'), { ...priv, updatedAt: serverTimestamp(), updatedBy: me.user.uid }, { merge: true });
        // Audit names the fields changed, never the personal values.
        audit(b, me, { action: o.isNew ? 'owner.create' : 'owner.update', entity: `owners/${id}`, propertyId: this.propertyId === 'all' ? null : this.propertyId,
          changes: changed.map(k => ({ field: k, old: null, new: '(changed)' })), reason: o.reason.trim() || 'Added on Portfolio' });
        await b.commit();
        this.ownerOpen = false;
        this.okMsg = `${id} saved.`;
        await this.go();
      } catch (e) { o.error = friendlyError(e, 'save the owner'); }
      this.busy = false;
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
        this.ownerOpen = false; this.okMsg = `${o.code} deactivated. Nothing was deleted.`;
        await this.go();
      } catch (e) { o.error = friendlyError(e, 'deactivate the owner'); }
      this.busy = false;
    },
    async reactivateOwner() {
      const o = this.o; o.error = '';
      if (!o.reason.trim()) return o.error = 'Add a reason (audit log) before turning the owner back on.';
      this.busy = true;
      try {
        const b = writeBatch(db);
        b.set(doc(db, 'owners', o.id), { active: true, deactivatedReason: null }, { merge: true });
        audit(b, me, { action: 'owner.reactivate', entity: `owners/${o.id}`, changes: [{ field: 'active', old: false, new: true }], reason: o.reason.trim() });
        await b.commit();
        this.ownerOpen = false; this.okMsg = `${o.code} is active again.`;
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
      if (!/^\S+ \S+/.test(code)) return u.error = 'Type the unit code like DM 0719.';
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
        b.set(doc(db, 'units', id), unitData, { merge: true });
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
        this.unitOpen = false;
        this.okMsg = `${code} saved` + (termsChanged ? `, settings apply from ${monthName(u.effectiveFrom)}.` : '.');
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
          n++;
        }
        audit(b, me, { action: 'unitTerms.starter', entity: `properties/${this.propertyId}`, propertyId: this.propertyId, month: this.asOf, changes: [{ field: 'units', old: null, new: n }], reason: 'Starter settings loaded' });
        await b.commit();
        this.okMsg = `Starter settings loaded for ${n} units from ${monthName(this.asOf)}. Fixed rents are Sep 2026 amounts: check them.`;
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
        await b.commit();
        this.okMsg = `Saved, applying from ${monthName(r.effectiveFrom)}.`;
        await this.openRates(); await this.loadAudits();
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
        this.propOpen = false;
        this.okMsg = `${name} added. Upload its eZee report to bring in units, or add them here.`;
        this.openPropertyPage(id);
      } catch (e) { p.error = friendlyError(e, 'add the property'); }
      this.busy = false;
    },

    // ---- manual bookings (sample, in memory) ----
    nightsOf(x) { if (!x.commence || !x.departure) return 0; return Math.max(0, Math.round((new Date(x.departure) - new Date(x.commence)) / 86400000)); },
    moneyTotal(x) { return MONEY.reduce((s, f) => s + (Number(x.money?.[f.key]) || 0), 0); },
    shownBookings() {
      const q = this.bookingSearch.trim().toLowerCase();
      const code = this.propertyId === 'all' ? null : (this.property().code || '').toUpperCase();
      return this.bookings.filter(x => !!x.cancelled === this.showCancelled && (!code || x.propertyCode === code)
        && (!q || x.id.toLowerCase().includes(q) || x.unitCode.toLowerCase().includes(q) || (x.guest.fullName || '').toLowerCase().includes(q)));
    },
    openBookingForm(row) {
      this.okMsg = '';
      const base = row ? JSON.parse(JSON.stringify(row)) : {
        id: '', propertyCode: (this.property().code || 'DM').toUpperCase(), unitCode: '', source: 'Walk-in', salesPerson: '', commence: dayOffset(0), departure: '',
        guest: emptyGuest(), money: Object.fromEntries(MONEY.map(f => [f.key, ''])), paidAmount: '', paymentMethod: '', paidOn: '', slipLink: '', invoiceStatus: '' };
      this.bk = { ...base, isNew: !row, error: '', cancelling: false, cancelReasonDraft: '' };
      this.bookingOpen = true;
    },
    saveBooking() {
      const x = this.bk; x.error = '';
      if (!x.unitCode.trim()) return x.error = 'Pick the unit.';
      if (!x.guest.fullName.trim()) return x.error = 'Enter the guest or tenant\'s full name.';
      if (!x.commence || !x.departure || x.departure <= x.commence) return x.error = 'Move out must be after move in.';
      if (!(Number(x.money.rental) > 0)) return x.error = 'Enter the rental.';
      const clean = JSON.parse(JSON.stringify(x)); for (const k of ['isNew', 'error', 'cancelling', 'cancelReasonDraft']) delete clean[k];
      const unit = this.allUnits.find(y => y.unitCode === x.unitCode.trim());
      if (unit) clean.propertyCode = (this.properties.find(p => p.id === unit.propertyId)?.code || clean.propertyCode).toUpperCase();
      if (x.isNew) {
        const yymm = x.commence.slice(2, 4) + x.commence.slice(5, 7);
        clean.id = `MB-${yymm}-${String(this.bookings.length + 1).padStart(3, '0')}`;
        this.bookings.unshift(clean);
      } else this.bookings.splice(this.bookings.findIndex(y => y.id === x.id), 1, clean);
      this.bookingOpen = false;
      this.okMsg = `${clean.id} saved on this screen (sample). Saving to Firebase comes later.`;
    },
    cancelBooking() {
      const x = this.bk; x.error = '';
      if (!x.cancelReasonDraft.trim()) return x.error = 'Say why the booking is cancelled.';
      const row = this.bookings.find(y => y.id === x.id);
      Object.assign(row, { cancelled: true, cancelReason: x.cancelReasonDraft.trim() });
      this.bookingOpen = false; this.okMsg = `${x.id} cancelled. It stays in the list under Cancelled.`;
    },
    openDoc(kind) { this.docOpen = kind; },
    docNo() {
      const yymm = (this.bk.commence || this.today).slice(2, 4) + (this.bk.commence || this.today).slice(5, 7);
      const unit = (this.bk.unitCode || '').replace(/\D/g, '').slice(0, 4);
      return `${this.docOpen === 'invoice' ? 'INV' : 'RCP'}-${this.bk.propertyCode || 'DM'}-${yymm}-${unit}`;
    },
    sendForApproval() {
      const row = this.bookings.find(y => y.id === this.bk.id);
      if (row) row.invoiceStatus = 'pending';
      this.bk.invoiceStatus = 'pending';
      toast('Sent to Finance for approval (sample). Nothing goes to the tenant until Finance approves.');
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
    .doc { border: 1px solid var(--border); border-radius: 10px; padding: 28px; background: #fff; color: #1A1D23; }
    .doc-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 2px solid #F26D4D; padding-bottom: 14px; margin-bottom: 16px; flex-wrap: wrap; }
    .doc-logo { font-weight: 800; letter-spacing: .14em; color: #F26D4D; font-size: 20px; }
    .doc-title { text-align: right; font-size: 12px; color: #4B5260; }
    .doc-title b { display: block; font-size: 16px; color: #1A1D23; letter-spacing: .04em; }
    .doc-parties { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; font-size: 12px; margin-bottom: 16px; }
    .doc-parties b { display: block; font-size: 11px; color: #7A8190; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 4px; }
    .doc table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .doc th { text-align: left; color: #7A8190; font-weight: 600; border-bottom: 1px solid #E5E7EB; padding: 8px 4px; }
    .doc td { padding: 8px 4px; border-bottom: 1px solid #EEF0F3; }
    .doc .num { text-align: right; }
    .doc tfoot td { font-weight: 700; border-bottom: 0; border-top: 1px solid #1A1D23; }
    .doc-note { font-size: 11px; color: #7A8190; margin-top: 16px; }
    .watermark { display: inline-block; font-size: 11px; font-weight: 700; color: #A66300; background: #FDF3DC; border-radius: 999px; padding: 2px 10px; }
    .modal.wide { max-width: 760px; }
    .modal-back { z-index: 60; }
    .table td.nw { white-space: nowrap; }
    .drawer .field { align-content: start; }
    .history-list .row { font-size: 12px; }
    @media (max-width: 720px) { .grid-3, .info-grid, .doc-parties { grid-template-columns: 1fr; } .doc { padding: 18px; } }
</style>
