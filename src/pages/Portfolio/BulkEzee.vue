<template>
  <!-- 24 Nov 2026 (Khairul): Bulk Upload > New bookings (eZee) and Cancel bookings (eZee). Accounting and Directors only.
       No property to choose: each row's property is found from its reservation no. or room (DMRS… / DM 0719 = DM), and
       a tab per property in the file lets them check each one. Nothing is saved until the person has confirmed in the last
       box (a tick for new bookings, typing "CANCEL <n>" for cancellations), so no booking is added twice and none is
       cancelled by accident.
       24 Nov 2026: Monthly check (mode ezeeMonth). Accounting uploads the whole month's eZee Reservation report: the same
       checks as New bookings (bookings someone forgot to upload, changes, clashes: Skip, Add, Replace the PMS booking, or
       edit the row), plus the bookings still booked in the PMS that eZee has as cancelled or doesn't have at all (a
       cancellation nobody uploaded): Keep or Cancel in the PMS.
       24 Nov 2026: each row opens the New booking form (Reservation Lodgment Form) filled in from the file, so it is saved as
       a booking in Portfolio > Bookings exactly like one made in the PMS (tenant record, booking no., payment, passcodes),
       linked to the eZee reservation no. The eZee booking itself is still saved for Accounting (Month-End).
       24 Nov 2026 (later): the form opens by itself on the first row once the file is checked. Its last button is Save to
       pending confirm: nothing is written, the row shows Pending confirm to add, and the next row opens. Continue to confirm
       then writes it all: the eZee bookings, and each pending row as a booking (the same form's own save, run in turn). -->
  <div class="bz">
    <p class="muted bz-hint">{{ isMonth
      ? 'Once a month: drop the whole month\'s eZee Reservation report (.csv or .xlsx). The PMS compares it with what was uploaded day by day and lists what is missing, changed, clashing, or still booked in the PMS but cancelled in eZee. You decide each one before anything is saved.'
      : isNew
      ? 'Drop the eZee Reservation report as .csv or .xlsx (the same export as Upload eZee report). Every property and month in the file is found by itself. Rooms must already be units in Portfolio.'
      : 'Drop eZee\'s Cancelled Reservation report, printed to PDF. The PMS reads the printed pages (up to a minute), finds each booking\'s property by itself and only cancels a booking whose details match.' }}</p>

    <label class="dropzone" :class="{ over: dragging }" v-show="!checked && !busy && !doneMsg"
      @dragover.prevent="dragging = true" @dragleave="dragging = false" @drop.prevent="dragging = false; pick($event.dataTransfer.files)">
      <svg class="dz-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l6 6h-4v6h-4V9H6zM4 19h16v2H4z"/></svg>
      <b>{{ isMonth ? 'Drag the month\'s eZee Reservation report here, or' : isNew ? 'Drag the eZee Reservation report here, or' : 'Drag the printed Cancelled Reservation PDF here, or' }}</b>
      <span class="btn">Choose file</span>
      <small>{{ isNew ? '.csv or .xlsx · any number of properties in one file' : '.pdf · any number of properties in one report' }}</small>
      <input type="file" class="sr-only" :accept="isNew ? '.csv,.xlsx,.xls' : '.pdf'" @change="pick($event.target.files); $event.target.value = ''">
    </label>

    <section class="card" v-show="busy"><p class="muted" style="margin:0">{{ busyNote }}</p><div class="bz-bar" v-show="percent"><span :style="{ width: percent + '%' }"></span></div></section>
    <div class="notice error" role="alert" v-if="error">{{ error }}</div>
    <div class="notice ok bz-done" role="status" v-if="doneMsg"><div>{{ doneMsg }}</div>
      <div v-if="doneLinks.length" class="bz-done-where">Saved as eZee bookings for Accounting (Month-End). Make each one a booking in Portfolio › Bookings with the form below.</div>
      <div class="bz-done-links"><router-link v-for="l in doneLinks" :key="l.to" class="btn btn-sm" :to="l.to">{{ l.label }}</router-link>
        <button type="button" class="btn btn-sm" @click="reset">Upload another file</button></div></div>
    <!-- 24 Nov 2026: after saving, the rows can still be made into PMS bookings one by one -->
    <div class="notice ok" v-if="doneMsg && flash" role="status">{{ flash }}</div>
    <section class="bz-group green" v-if="doneMsg && isNew && afterRows.length">
      <header><b>{{ `Make them bookings in Portfolio › Bookings · ${afterRows.filter(y => !madeOf(y.x, y.part)).length} to go` }}</b><span>Click a row to open the New booking form filled in from eZee, add the phone, IC and rent, and save.</span></header>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Reservation</th><th>Room · stay</th><th>In Bookings</th></tr></thead>
        <tbody><tr v-for="y in afterRows" :key="y.part.key + y.x.r.rowKey" class="bz-click" tabindex="0" @click="openForm(y.x, y.part)" @keydown.enter.self="openForm(y.x, y.part)">
          <td><b>{{ y.x.r.reservationNo }}</b><div class="muted">{{ `${y.x.guest || '—'} · ${y.part.label} · ${y.x.r.source || '—'}` }}</div></td>
          <td>{{ y.x.r.unitCode || '—' }}<div class="muted">{{ stay(y.x.r) }}</div></td>
          <td @click.stop><span class="pill green" v-if="madeOf(y.x, y.part)">{{ `Saved as ${madeOf(y.x, y.part).bookingNo}` }}</span>
            <template v-else><div class="bz-with" v-if="stagedOf(y.x, y.part)?.error">{{ stagedOf(y.x, y.part).error }}</div>
            <button type="button" class="btn btn-sm" @click="openForm(y.x, y.part, true)">Fill in booking form</button></template></td>
        </tr></tbody>
      </table></div>
    </section>

    <template v-if="checked && !doneMsg">
      <div class="bz-file">
        <span><b>{{ fileName }}</b><template v-if="note">{{ ` · ${note}` }}</template></span>
        <button type="button" class="btn" :disabled="busy" @click="reset">Choose another file</button>
      </div>
      <!-- Monthly check: the months this file holds in full. A PMS booking leaving in one of them that the file doesn't have is listed. -->
      <div class="bz-months" v-if="isMonth && fileMonths.length">
        <span class="bz-months-label">This file has every booking that checks out in:</span>
        <button v-for="mm in fileMonths" :key="mm" type="button" class="chip" :class="{ on: fullMonths.includes(mm) }" :aria-pressed="fullMonths.includes(mm)" @click="toggleMonth(mm)">{{ monthName(mm) }}</button>
        <span class="muted bz-small">Untick a month the file only holds part of, or bookings of that month will show as Not in the file.</span>
      </div>
      <div class="notice warn" v-if="!isNew && m.stated && m.stated !== m.read">{{ `The report says ${m.stated} cancelled reservations, but ${m.read} could be read from the printed pages. Check the report for the missing ${m.stated - m.read > 0 ? m.stated - m.read : ''} and cancel them in Portfolio > Bookings, or print the report again more clearly.` }}</div>

      <!-- One tab per property found in the file -->
      <div class="bz-tabs" role="tablist" aria-label="Properties in this file">
        <button v-for="pt in parts" :key="pt.key" type="button" role="tab" class="bz-tab" :class="{ on: pt.key === tab, warn: needsLook(pt) }" :aria-selected="pt.key === tab" @click="tab = pt.key">
          <b>{{ pt.label }}</b><small>{{ tabNote(pt) }}</small>
        </button>
      </div>

      <template v-if="cur">
        <!-- A property that could not be found, or a code shared by several properties -->
        <section class="card bz-ask" v-if="!cur.prop">
          <template v-if="cur.ask && cur.ask.length">
            <p style="margin-top:0">{{ `Code ${cur.code} belongs to more than one property. Which one are these ${cur.size} rows for?` }}</p>
            <div class="bz-ask-row">
              <select class="input" v-model="cur.pick" :aria-label="`Property for code ${cur.code}`">
                <option value="">Choose…</option>
                <option v-for="id in cur.ask" :key="id" :value="id">{{ propLabel(id) }}</option>
              </select>
              <button type="button" class="btn btn-primary" :disabled="!cur.pick || busy" @click="choose(cur)">Check these rows</button>
            </div>
          </template>
          <p v-else style="margin:0">{{ cur.why }}</p>
        </section>

        <!-- New bookings -->
        <template v-else-if="isNew">
          <div class="kpis bz-kpis">
            <div class="kpi"><div class="label">Ready to add</div><div class="value">{{ g.ready.length }}</div><div class="hint">new, no clash</div></div>
            <div class="kpi"><div class="label">Already in the PMS</div><div class="value">{{ g.same.length }}</div><div class="hint">same details · skipped</div></div>
            <div class="kpi"><div class="label">Changed</div><div class="value">{{ g.changed.length }}</div><div class="hint">room, dates or total differ</div></div>
            <div class="kpi"><div class="label">Fill in blanks</div><div class="value" :class="{ alert: g.fill.length }">{{ g.fill.length }}</div><div class="hint">in the PMS, details missing</div></div>
            <div class="kpi"><div class="label">Clashes</div><div class="value" :class="{ alert: g.clash.length }">{{ g.clash.length }}</div><div class="hint">room already booked</div></div>
            <div class="kpi"><div class="label">Cancelled in the PMS</div><div class="value">{{ g.cancelled.length }}</div><div class="hint">can be added again</div></div>
            <div class="kpi"><div class="label">Can't add</div><div class="value">{{ cantItems.length }}</div><div class="hint">left out</div></div>
            <template v-if="isMonth">
              <div class="kpi"><div class="label">Cancelled in eZee</div><div class="value" :class="{ alert: mg.gone.length }">{{ mg.gone.length }}</div><div class="hint">still booked in the PMS</div></div>
              <div class="kpi"><div class="label">Not in the file</div><div class="value" :class="{ alert: mg.missing.length }">{{ mg.missing.length }}</div><div class="hint">booked in the PMS only</div></div>
            </template>
          </div>
          <div class="notice ok" v-if="flash" role="status">{{ flash }}</div>
          <p class="muted bz-small" style="margin:-4px 0 14px">Click a row to open the New booking form filled in from the file: complete it and save, and it becomes a booking in Portfolio › Bookings like one made in the PMS. Compare and edit shows what the system has now next to the file.</p>

          <!-- Monthly check: booked in the PMS, but eZee has it cancelled or doesn't have it -->
          <section v-for="grp in monthGroups" :key="grp.key" class="bz-group" :class="grp.tone" v-show="isMonth && grp.items.length">
            <header><b>{{ `${grp.title} · ${grp.items.length}` }}</b><span>{{ grp.note }}</span></header>
            <div class="table-wrap"><table class="table">
              <thead><tr><th>In the PMS</th><th>Room · stay</th><th>In the file</th><th>Do</th></tr></thead>
              <tbody><tr v-for="x in grp.items" :key="x.booking.id">
                <td><b>{{ x.booking.id }}</b><div class="muted">{{ `${x.booking.guestName || '—'} · ${x.booking.source || '—'} · RM ${amt(x.booking.totalInclTax)}` }}</div></td>
                <td>{{ x.booking.unitCode || '—' }}<div class="muted">{{ stay(x.booking) }}</div></td>
                <td>{{ x.row ? 'Cancelled in eZee (no room)' : 'Not in this file' }}<div class="muted">{{ x.why }}</div></td>
                <td><span class="bz-seg" v-if="!x.locked"><button type="button" :class="{ on: x.choice === 'keep' }" @click="x.choice = 'keep'">Keep</button><button type="button" :class="{ on: x.choice === 'cancel', danger: x.choice === 'cancel' }" @click="x.choice = 'cancel'">Cancel in PMS</button></span>
                  <span class="pill grey" v-else>Locked</span></td>
              </tr></tbody>
            </table></div>
          </section>

          <section v-for="sec in sections" :key="sec.key" class="bz-group" :class="sec.tone" v-show="sec.items.length">
            <header><b>{{ `${sec.title} · ${sec.items.length}` }}</b><span>{{ sec.note }}</span></header>
            <div class="table-wrap"><table class="table">
              <thead><tr><th>In the file</th><th>Room · stay</th><th>{{ sec.third }}</th><th v-if="sec.opts">Do</th><th v-if="sec.key !== 'cant'">In Bookings</th></tr></thead>
              <tbody><tr v-for="x in sec.key === 'ready' ? sec.items.slice(0, limit) : sec.items" :key="x.r.rowKey" class="bz-click" tabindex="0" @click="rowClick(x, sec.key)" @keydown.enter.self="rowClick(x, sec.key)">
                <td><b>{{ x.r.docId }}</b><span class="pill blue bz-edited" v-if="x.edited?.length">Edited</span><div class="muted">{{ `${x.guest || '—'} · ${x.r.source || '—'} · RM ${amt(x.r.totalInclTax)}` }}</div></td>
                <td>{{ x.r.unitCode || x.r.roomRaw || '—' }}<div class="muted">{{ stay(x.r) }}</div></td>
                <td>
                  <template v-if="sec.key === 'changed'"><div v-for="d in x.diffs" :key="d.field">{{ `${d.field}: ` }}<s class="muted">{{ show(d.from) }}</s>{{ ' → ' }}<b>{{ show(d.to) }}</b></div></template>
                  <template v-else-if="sec.key === 'fill'"><div class="muted">{{ `${x.target.kind === 'offline' ? 'Offline booking' : 'eZee booking'} ${x.target.ref}` }}</div><div v-for="f in x.fills" :key="f.label">{{ `${f.label}: ` }}<b>{{ show(f.to) }}</b></div></template>
                  <template v-else-if="sec.key === 'ready'">{{ x.r.isNew ? 'Not in the system yet' : '—' }}</template>
                  <template v-else>{{ x.why }}</template>
                  <div v-for="w in (sec.key === 'ready' ? [] : x.with)" :key="w.kind + w.ref" class="bz-with">{{ `Clashes: ${w.kind === 'offline' ? 'offline booking' : w.kind === 'file' ? 'this file' : 'eZee'} ${w.ref}${w.guest ? ` · ${w.guest}` : ''} · ${dmy(w.arrival)} – ${dmy(w.departure)}` }}</div>
                  <div class="bz-ok" v-if="x.edited?.length && !x.with.length && (sec.key === 'clash' || sec.key === 'cancelled')">No clash after the edit</div>
                </td>
                <td v-if="sec.opts" @click.stop><span class="bz-seg"><button v-for="o in sec.opts(x)" :key="o.v" type="button" :class="{ on: x.choice === o.v, danger: o.danger && x.choice === o.v }" @click="x.choice = o.v">{{ o.label }}</button></span>
                  <div class="bz-with" v-if="x.choice === 'replace'">{{ `Cancels ${x.with.map(w => w.ref).join(', ')} in the PMS` }}</div>
                  <button type="button" class="link bz-cmp-btn" @click="openCompare(x, sec.key)">Compare and edit</button></td>
                <td v-if="sec.key !== 'cant'" @click.stop>
                  <span class="pill green" v-if="madeOf(x, cur)" :title="madeOf(x, cur).id">{{ `${madeOf(x, cur).bookingNo}${madeOf(x, cur).saved ? ' saved' : ''}` }}</span>
                  <div class="bz-stage" v-else-if="stagedOf(x, cur)">
                    <span class="pill amber bz-pill">{{ fillTarget(x) ? 'Pending confirm to fill' : 'Pending confirm to add' }}</span>
                    <div class="bz-stage-meta">{{ stagedOf(x, cur).label }}</div>
                    <div class="bz-with" v-if="stagedOf(x, cur).error">{{ stagedOf(x, cur).error }}</div>
                    <div class="bz-stage-acts"><button type="button" class="link" @click="openForm(x, cur)">Edit</button><button type="button" class="link" @click="unstage(x, cur)">Remove</button></div>
                  </div>
                  <button type="button" class="btn btn-sm" :class="{ 'btn-primary': !doneMsg }" v-else-if="needsForm(x, cur)" @click="openForm(x, cur)">{{ fillTarget(x) ? `Fill in ${fillTarget(x).ref}` : 'Fill in booking form' }}</button>
                  <span class="muted" v-else :title="canForm(x) ? 'Choose Add to fill in its booking form' : ''">{{ canForm(x) && sec.opts ? 'Choose Add first' : '—' }}</span></td>
              </tr></tbody>
            </table></div>
            <button type="button" class="btn bz-more" v-if="sec.key === 'ready' && sec.items.length > limit" @click="limit = 100000">{{ `Show all ${sec.items.length}` }}</button>
          </section>
          <p class="muted" v-if="g.same.length">{{ `${g.same.length} already in the PMS with the same details: nothing to do.` }}</p>
        </template>

        <!-- Cancellations -->
        <template v-else>
          <div class="kpis bz-kpis">
            <div class="kpi"><div class="label">Will be cancelled</div><div class="value">{{ c.cancel.length }}</div><div class="hint">found, details match</div></div>
            <div class="kpi"><div class="label">Check first</div><div class="value" :class="{ alert: c.check.length }">{{ c.check.length }}</div><div class="hint">left as they are unless ticked</div></div>
            <div class="kpi"><div class="label">Can't cancel</div><div class="value">{{ c.blocked.length }}</div><div class="hint">month completed</div></div>
            <div class="kpi"><div class="label">Still in Bookings</div><div class="value" :class="{ alert: c.offOnly.length }">{{ c.offOnly.length }}</div><div class="hint">cancelled for Accounting, still booked</div></div>
            <div class="kpi"><div class="label">Nothing to do</div><div class="value">{{ c.nothing.length }}</div><div class="hint">already cancelled or not found</div></div>
          </div>

          <!-- 24 Nov 2026: the booking in Portfolio > Bookings (offline booking with this eZee reservation no.) is cancelled too -->
          <section class="bz-group red" v-if="c.offOnly.length">
            <header><b>{{ `Still booked in Portfolio › Bookings · ${c.offOnly.length}` }}</b><span>eZee has these cancelled (and Accounting's copy is already cancelled or missing), but the booking made in the PMS is still active. Default: Cancel.</span></header>
            <div class="table-wrap"><table class="table">
              <thead><tr><th>Reservation</th><th>Booking in Bookings</th><th>Why</th><th>Do</th></tr></thead>
              <tbody><tr v-for="x in c.offOnly" :key="'o' + x.row.resNo + (x.row.folioNo || '')">
                <td><b>{{ x.row.resNo }}</b><div class="muted">{{ reportLine(x.row) }}</div></td>
                <td><div v-for="o in x.offline" :key="o.id">{{ `${o.bookingNo || o.id} · ${o.unitCode || '—'}` }}<div class="muted">{{ `${stay(o)}${o.status === 'pending' ? ' · Awaiting payment' : ''}` }}</div></div></td>
                <td>{{ x.why }}</td>
                <td><span class="bz-seg"><button type="button" :class="{ on: !x.go }" @click="x.go = false">Leave</button><button type="button" :class="{ on: x.go, danger: x.go }" @click="x.go = true">Cancel</button></span></td>
              </tr></tbody>
            </table></div>
          </section>

          <section class="bz-group red" v-if="c.check.length">
            <header><b>{{ `Check first · ${c.check.length}` }}</b><span>Default: Leave. Choose Cancel only when you are sure it is the same booking.</span></header>
            <div class="table-wrap"><table class="table">
              <thead><tr><th>In the report</th><th>In the PMS</th><th>Why check</th><th>Do</th></tr></thead>
              <tbody><tr v-for="x in c.check" :key="x.row.resNo + x.booking.id">
                <td><b>{{ x.row.resNo }}</b><div class="muted">{{ reportLine(x.row) }}</div></td>
                <td>{{ `${x.booking.reservationNo} · ${x.booking.unitCode || '—'}` }}<div class="muted">{{ `${x.booking.guestName || '—'} · ${stay(x.booking)} · RM ${amt(x.booking.totalInclTax)}` }}</div></td>
                <td>{{ x.why }}</td>
                <td><span class="bz-seg"><button type="button" :class="{ on: !x.go }" @click="x.go = false">Leave</button><button type="button" :class="{ on: x.go, danger: x.go }" @click="x.go = true">Cancel</button></span></td>
              </tr></tbody>
            </table></div>
          </section>

          <section class="bz-group amber" v-if="c.cancel.length">
            <header><b>{{ `Will be cancelled · ${c.cancel.length}` }}</b><span>Marked Cancelled with eZee's cancel date, who cancelled and the remark, here and in Portfolio › Bookings. Nothing is deleted.</span></header>
            <div class="table-wrap"><table class="table">
              <thead><tr><th>Reservation</th><th>Guest</th><th>Room · stay in the PMS</th><th>Source</th><th>Cancelled</th><th>Remark</th><th>Matched on</th><th>Also in Bookings</th></tr></thead>
              <tbody><tr v-for="x in c.cancel" :key="x.booking.id">
                <td>{{ x.booking.id }}</td><td>{{ x.booking.guestName || x.row.guest || '—' }}</td><td>{{ `${x.booking.unitCode || '—'} · ${stay(x.booking)}` }}</td>
                <td>{{ x.row.source || x.booking.source || '—' }}</td><td>{{ dmy(x.row.cancelDate) || '—' }}</td><td>{{ x.row.remark || '—' }}</td>
                <td>{{ matchedOn(x) }}</td>
                <td>{{ (x.offline || []).map(o => o.bookingNo || o.id).join(', ') || '—' }}</td>
              </tr></tbody>
            </table></div>
          </section>

          <section class="bz-group grey" v-if="c.blocked.length || c.nothing.length">
            <header><b>{{ `Not cancelled here · ${c.blocked.length + c.nothing.length}` }}</b><span>Month completed, already cancelled, or not in the PMS.</span></header>
            <div class="table-wrap"><table class="table">
              <thead><tr><th>Reservation</th><th>Guest</th><th>Why</th></tr></thead>
              <tbody><tr v-for="x in [...c.blocked, ...c.nothing]" :key="x.row.resNo + (x.row.folioNo || '') + x.why">
                <td>{{ x.row.resNo }}</td><td>{{ x.booking?.guestName || x.row.guest || '—' }}</td><td>{{ x.why }}</td>
              </tr></tbody>
            </table></div>
          </section>
        </template>
      </template>

      <div class="bz-foot">
        <span class="muted">{{ footNote }}</span>
        <button type="button" class="btn" :class="isNew ? 'btn-primary' : 'btn-danger'" :disabled="!count || busy || (isNew && unfilledAll > 0)" :title="isNew && unfilledAll ? 'Fill in the booking form of every row being added first' : ''" @click="openConfirm">{{ isNew ? 'Continue to confirm' : `Continue to cancel ${count}` }}</button>
      </div>
    </template>

    <!-- 24 Nov 2026: the New booking form for one eZee row (the same form as Portfolio > Bookings > + New booking) -->
    <div class="modal-back" v-if="form" @click.self="closeForm">
      <div class="modal bz-form-modal" role="dialog" aria-modal="true" aria-label="New booking from eZee">
        <div class="bz-form-head"><span><b>{{ form.prefill.fillId ? `Fill in ${fillTarget(form.x)?.ref || form.prefill.fillId} · eZee ${form.prefill.ezeeNo}` : `New booking · eZee ${form.prefill.ezeeNo}` }}</b>
            <span class="muted bz-small" v-if="!form.now && queue.length">{{ ` · row ${queueAt(form) + 1} of ${queue.length} to fill in` }}</span></span>
          <span class="bz-form-acts"><button type="button" class="btn btn-sm" v-if="!form.now && nextAfter(form)" @click="skipRow">Skip this row</button>
            <button type="button" class="btn btn-sm" @click="closeForm">Close</button></span></div>
        <ReservationForm :key="form.key" :prefill="form.prefill" :stage-only="!form.now" @dirty="v => form.dirty = v" @staged="onStaged" @saved="onFormSaved" @close="form = null" />
      </div>
    </div>
    <!-- Continue to confirm: each pending row is saved by the same form, with no screen, one after another -->
    <div v-if="committing" style="display:none" aria-hidden="true">
      <ReservationForm :key="committing.key" :prefill="committing.prefill" auto-save pay-checked @saved="committing.onSaved" @done="committing.resolve" />
    </div>

    <!-- Review one row: the system's record next to the file's, what will change, and the file's details can be edited -->
    <div class="modal-back" v-if="cmp" @click.self="cmp = null">
      <div class="modal bz-modal bz-cmp-modal" role="dialog" aria-modal="true" aria-labelledby="bzCmpTitle">
        <h2 id="bzCmpTitle">{{ `${cmp.x.r.docId} · ${cmpTitle}` }}</h2>
        <p class="muted" style="margin:-6px 0 12px">{{ cmpLead }}</p>

        <div class="bz-clashes" v-if="cmpClash.length">
          <div class="bz-rec" v-for="w in cmpClash" :key="w.kind + w.ref">
            <div class="bz-rec-head"><b>{{ `${w.kind === 'offline' ? 'Offline booking' : w.kind === 'file' ? 'Also in this file' : 'eZee booking'} ${w.ref}` }}</b>
              <span class="pill" :class="!w.now ? 'green' : w.same ? 'amber' : 'red'">{{ !w.now ? 'No clash now' : w.same ? 'Same reservation no.' : 'Same room, same nights' }}</span></div>
            <div class="muted">{{ [w.guest || '—', w.unitCode || '—', w.arrival ? `${dmy(w.arrival)} – ${dmy(w.departure)}` : '', w.nights ? `${w.nights} nights` : '', w.source].filter(Boolean).join(' · ') }}</div>
          </div>
        </div>

        <div class="table-wrap bz-cmp-wrap"><table class="table bz-cmp-table">
          <thead><tr><th>Detail</th><th>{{ cmpSysLabel }}</th><th>From the file</th><th>What happens</th></tr></thead>
          <tbody><tr v-for="f in cmpRows" :key="f.k">
            <td class="bz-fl ct-title">{{ f.label }}</td>
            <td :class="{ muted: f.sys === '—' }">{{ f.sys }}</td>
            <td>
              <input v-if="f.edit === 'text'" class="input bz-in" v-model.trim="cmp.d[f.k]" :aria-label="f.label">
              <input v-else-if="f.edit === 'date'" type="date" class="input bz-in" v-model="cmp.d[f.k]" :aria-label="f.label">
              <select v-else-if="f.edit === 'unit'" class="input bz-in" v-model="cmp.d.unitId" :aria-label="f.label"><option v-for="u in cmp.part.ctx.units" :key="u.id" :value="u.id">{{ u.unitCode }}</option></select>
              <template v-else>{{ f.file }}</template>
              <div class="bz-was" v-if="f.edit && f.edited">{{ `File had: ${f.orig || '—'}` }}</div>
            </td>
            <td><span class="pill" :class="f.tone">{{ f.what }}</span></td>
          </tr></tbody>
        </table></div>
        <div class="notice" :class="draftClash.length ? 'error' : 'ok'" style="margin:12px 0 0" v-if="cmp.x.r.unitId">{{ draftClash.length ? `With these details it clashes with ${draftClash.map(w => w.ref).join(', ')}.` : 'No clash with these details.' }}</div>
        <p class="muted bz-small">Amounts stay as eZee has them. A change made here is saved with your name in the audit log; the next Upload eZee report of that month puts back what eZee has, so change it in eZee too.</p>
        <div class="notice error" v-if="cmp.err" style="margin-top:12px">{{ cmp.err }}</div>
        <div class="modal-foot">
          <button type="button" class="btn" @click="cmp = null">Close</button>
          <button type="button" class="btn" v-if="cmp.x.edited?.length" :disabled="cmp.busy" @click="resetEdit">Back to the file's details</button>
          <button type="button" class="btn btn-primary" :disabled="cmp.busy || !draftChanged" @click="applyEdit">Save my edits</button>
        </div>
      </div>
    </div>

    <!-- The last check before anything is written: every property in one list -->
    <div class="modal-back" v-if="confirming" @click.self="confirming = false">
      <div class="modal bz-modal" role="dialog" aria-modal="true" aria-labelledby="bzConfirmTitle">
        <template v-if="isNew">
          <h2 id="bzConfirmTitle">{{ `${isMonth ? 'Apply' : 'Save'} ${count} ${count === 1 ? 'change' : 'changes'} to ${ready.length} ${ready.length === 1 ? 'property' : 'properties'}?` }}</h2>
          <div class="bz-sum">
            <div v-for="pt in ready" :key="pt.key"><span>{{ pt.label }}</span><b>{{ [`${pt.adds.length} new`, pt.stagedRows.length && `${pt.stagedRows.length} to Bookings`, `${pt.updates.length} updated`, pt.fills.length && `${pt.fills.length} filled in`, pt.readds.length && `${pt.readds.length} added again`, pt.forced.length && `${pt.forced.length} clash added`, pt.replaces.length && `${pt.replaces.length} replaced`, pt.cancels.length && `${pt.cancels.length} cancelled`, pt.edits && `${pt.edits} edited`].filter(Boolean).join(' · ') }}</b></div>
          </div>
          <div class="notice ok" v-if="stagedAll.length">{{ `${stagedAll.length} ${stagedAll.length === 1 ? 'row is' : 'rows are'} added to Portfolio › Bookings as bookings (Pending confirm to add).` }}</div>
          <div class="notice error" v-if="cancelsAll.length">{{ `These will be cancelled in the PMS (their nights leave the owner statements): ${cancelsAll.map(x => `${x.booking.id} (${x.booking.unitCode || '—'})`).join(', ')}.` }}</div>
          <p class="muted bz-small" v-if="skippedTotal">{{ `${skippedTotal} rows skipped or left out (already in the PMS, clashes, changes kept, or rows that can't be added).` }}</p>
          <div class="notice warn" v-if="forcedAll.length">{{ `These will double-book their room: ${forcedAll.map(x => `${x.r.reservationNo} (${x.r.unitCode})`).join(', ')}.` }}</div>
          <div class="notice warn" v-if="unsettled.length">{{ `Not saved: ${unsettled.map(p => p.label).join(', ')} (property not found or not chosen).` }}</div>
          <label class="bz-tick"><input type="checkbox" v-model="ticked"> I checked each property's clashes and changes, and these bookings are not already in the PMS another way (for example as an offline booking).</label>
          <div class="modal-foot"><button type="button" class="btn" @click="confirming = false">Back to the list</button>
            <button type="button" class="btn btn-primary" :disabled="!ticked || busy" @click="saveNew">{{ `${isMonth ? 'Apply' : 'Save'} ${count} ${count === 1 ? 'change' : 'changes'}` }}</button></div>
        </template>
        <template v-else>
          <h2 id="bzConfirmTitle">{{ `Cancel ${count} ${count === 1 ? 'booking' : 'bookings'}?` }}</h2>
          <p class="muted" style="margin-top:-8px">Their nights leave the owner statements of the months they are in.</p>
          <div class="bz-sum"><div v-for="r in byMonth" :key="r.key"><span>{{ `${r.label} · ${monthName(r.month)}` }}</span><b>{{ `${r.n} · RM ${amt(r.total)}` }}</b></div></div>
          <div class="notice warn" v-if="offTotal">{{ `${offTotal} ${offTotal === 1 ? 'booking' : 'bookings'} in Portfolio › Bookings ${offTotal === 1 ? 'is' : 'are'} cancelled too (same eZee reservation no.).` }}</div>
          <div class="notice error" v-if="fromCheck">{{ `Includes ${fromCheck} you chose under Check first.` }}</div>
          <label for="bzType" class="bz-type-label">{{ `Type CANCEL ${count} to confirm` }}</label>
          <input id="bzType" class="input" v-model="typed" :placeholder="`CANCEL ${count}`" autocomplete="off">
          <p class="muted bz-small">Saved in the audit log with your name, the file and every booking. To undo, upload that month's eZee report again on Upload eZee report: it sets each booking back as eZee has it.</p>
          <div class="modal-foot"><button type="button" class="btn" @click="confirming = false">Back to the list</button>
            <button type="button" class="btn btn-danger" :disabled="typed.trim().toUpperCase() !== `CANCEL ${count}` || busy" @click="saveCancel">{{ `Cancel ${count} ${count === 1 ? 'booking' : 'bookings'}` }}</button></div>
        </template>
      </div>
    </div>
  </div>
</template>

<script>
import { markRaw, defineAsyncComponent } from 'vue';
import { askConfirm } from '@/lib/confirm.js';
import { collection, doc, getDoc, getDocs, query, where, writeBatch, serverTimestamp, deleteField, arrayUnion } from 'firebase/firestore';
import { db } from '@/lib/firebase.js';
import { clearCache } from '@/lib/cache.js';
import { parseCSV, readEzee } from '@/lib/engine.js';
import { sheetText } from '@/lib/finance-import.js';
import { classifyNew, monthsOf, clashesFor, classifyMissing, mainMonth } from '@/lib/ezee-bulk.js';
import { parseCancelReport, matchCancellations } from '@/lib/ezee-cancel.js';
import { saveEzeeBookings, CHUNK } from '@/lib/ezee-save.js';
import { markDirty } from '@/lib/summary-data.js';
import { loadUnits, completedUnitIds, audit, friendlyError, loadXlsxLib } from '@/lib/finance-data.js';
import { readPdfText } from '@/lib/drive.js';
import { loadPdfJs } from '@/lib/agreements/pdf.js';
import { monthName, amt, dmy } from '@/lib/format.js';
import { ezeeCandidates, statesFor } from '@/lib/states.js';
import { useSession } from '@/stores/session.js';

const me = useSession();
const EMPTY_NEW = { ready: [], same: [], changed: [], clash: [], fill: [], cancelled: [], cant: [], other: [] };
// The details shown side by side in the review box; edit = can be changed before saving (amounts and eZee numbers can't)
const FIELDS = [{ k: 'guest', label: 'Guest', edit: 'text' }, { k: 'unit', label: 'Room', edit: 'unit' }, { k: 'arrival', label: 'Check-in', edit: 'date' },
  { k: 'departure', label: 'Check-out', edit: 'date' }, { k: 'nights', label: 'Nights' }, { k: 'source', label: 'Source', edit: 'text' }, { k: 'rateType', label: 'Rate type', edit: 'text' },
  { k: 'folioNo', label: 'Folio no.' }, { k: 'invoiceNo', label: 'Invoice no.' }, { k: 'totalInclTax', label: 'Total (RM)' }, { k: 'status', label: 'Status' }];
const EDITABLE = ['guest', 'unitId', 'arrival', 'departure', 'source', 'rateType'];
const OFFLINE_KEYS = ['guest', 'unit', 'arrival', 'departure', 'nights', 'source', 'status'];
const nightsOf = (a, d) => (a && d && d > a ? Math.round((Date.parse(d) - Date.parse(a)) / 864e5) : 0);
const EMPTY_CAN = { cancel: [], check: [], blocked: [], nothing: [], offOnly: [] };
const EMPTY_MONTH = { gone: [], missing: [] };
const chunks = (list, n) => { const out = []; for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n)); return out; };
const monthAdd = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };
const monthRange = (a, b) => { const out = []; for (let m = a; m <= b && out.length < 60; m = monthAdd(m, 1)) out.push(m); return out; };
const today = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);   // Malaysia
const toBase64 = buf => { let s = ''; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
// The property code of a reservation no.: DMRS39352 -> DM
const codeOfRes = no => (String(no || '').match(/^([A-Z]{2,4})\s?RS/) || [])[1] || '';
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export default {
  components: { ReservationForm: defineAsyncComponent(() => import('../Operations/booking-forms/ReservationForm.vue')) },
  props: { mode: { type: String, required: true }, properties: { type: Array, default: () => [] } },
  emits: ['busy'],
  data() {
    return { dragging: false, busy: false, busyNote: '', percent: 0, error: '', doneMsg: '', fileName: '', note: '', checked: false,
      parts: [], tab: '', m: { stated: null, read: 0 }, limit: 30, confirming: false, ticked: false, typed: '', rows: markRaw([]), cmp: null, flash: '', doneLinks: [],
      fileMonths: [], fullMonths: [],
      form: null, made: {}, staged: {}, committing: null };   // staged: "prop|docId" -> { bk, pending, label, error } (Pending confirm to add)   // 24 Nov 2026: the booking form open for one row; rows saved as PMS bookings ("prop|docId" -> { id, bookingNo })   // Monthly check: check-out months in the file, and those it holds in full
  },
  computed: {
    // New bookings and Monthly check share the same screen; isMonth adds the bookings eZee no longer has
    isNew() { return this.mode === 'ezeeNew' || this.mode === 'ezeeMonth'; },
    isMonth() { return this.mode === 'ezeeMonth'; },
    mg() { return (this.isMonth && this.cur?.mg) || EMPTY_MONTH; },
    monthGroups() {
      return [
        { key: 'gone', title: 'Cancelled in eZee, still booked in the PMS', tone: 'red', items: this.mg.gone, note: 'Someone forgot to upload the cancellation. Default: Cancel in PMS.' },
        { key: 'missing', title: 'Not in the file', tone: 'amber', items: this.mg.missing, note: 'Booked in the PMS, not in this eZee file. Default: Keep. Cancel only if eZee really has no such booking.' }
      ];
    },
    // Can't be added: in a Monthly check, a cancelled row that matches a PMS booking is listed under Cancelled in eZee instead
    cantItems() {
      const gone = new Set(this.mg.gone.map(x => x.booking.reservationNo));
      return [...this.g.cant, ...this.g.other].filter(x => !gone.has(x.r.reservationNo));
    },
    cur() { return this.parts.find(p => p.key === this.tab) || null; },
    // After saving: the rows that were saved, to make into PMS bookings one by one
    afterRows() {
      return this.parts.filter(p => p.prop && p.g).flatMap(p => [...p.g.ready, ...p.g.clash.filter(x => x.choice === 'add' || x.choice === 'replace'), ...p.g.changed, ...p.g.cancelled.filter(x => x.choice === 'add')]
        .filter(x => this.canForm(x) || this.madeOf(x, p)).map(x => ({ x, part: p })));
    },
    g() { return this.cur?.g || EMPTY_NEW; },
    c() { return this.cur?.c || EMPTY_CAN; },
    // Properties found and checked, with what each one will save
    ready() {
      return this.parts.filter(p => p.prop && (p.g || p.c)).map(p => {
        if (!this.isNew) {
          const list = [...p.c.cancel, ...p.c.check.filter(x => x.go)], offOnly = (p.c.offOnly || []).filter(x => x.go);
          // 24 Nov 2026: the offline bookings (Portfolio > Bookings) of these reservations, cancelled with them
          const offs = [...list, ...offOnly].flatMap(x => x.offline || []).filter((o, i, a) => a.findIndex(z => z.id === o.id) === i);
          return { ...p, list, offOnly, offs };
        }
        const take = [...p.g.clash, ...p.g.cancelled].filter(x => x.choice === 'add');
        const forced = take.filter(x => x.with.length), readds = p.g.cancelled.filter(x => x.choice === 'add');
        // Replace (24 Nov 2026): the file's row is added and the PMS eZee bookings it clashes with are cancelled
        const replaces = p.g.clash.filter(x => x.choice === 'replace' && this.canReplace(x, p));
        const adds = [...p.g.ready, ...take, ...replaces], updates = p.g.changed.filter(x => x.choice === 'update'), fills = p.g.fill.filter(x => x.choice === 'fill');
        const mg = (this.isMonth && p.mg) || EMPTY_MONTH;
        const byId = new Map((p.ctx?.existing || []).map(b => [b.id, b]));
        const fromReplace = replaces.flatMap(x => x.with.map(w => ({ booking: byId.get(w.id), why: `Replaced by ${x.r.docId} from the file`, replacedBy: x.r.docId }))).filter(y => y.booking);
        const cancels = [...mg.gone, ...mg.missing].filter(x => x.choice === 'cancel' && !x.locked).concat(fromReplace)
          .filter((y, i, a) => a.findIndex(z => z.booking.id === y.booking.id) === i);
        const stagedRows = this.formRows(p).filter(x => this.stagedOf(x, p)?.bk && !this.madeOf(x, p));
        return { ...p, forced, readds, adds, updates, fills, replaces, cancels, stagedRows, edits: [...adds, ...updates, ...fills].filter(x => x.edited?.length).length };
      }).filter(p => (this.isNew ? p.adds.length + p.updates.length + p.fills.length + p.cancels.length + p.stagedRows.length : p.list.length + p.offOnly.length));
    },
    unsettled() { return this.parts.filter(p => !p.prop); },
    forcedAll() { return this.ready.flatMap(p => p.forced || []); },
    cancelsAll() { return this.ready.flatMap(p => p.cancels || []); },
    stagedAll() { return this.ready.flatMap(p => (p.stagedRows || []).map(x => ({ x, part: p }))); },
    // New rows (to add) with no booking form filled in and no booking in the PMS
    // 24 Nov 2026 (Khairul/Crane): every row being added must have its booking form filled in (Pending confirm to add)
    // before Continue to confirm. Skipped rows don't need one.
    unfilledRows() { return this.parts.filter(p => p.prop && p.g).flatMap(p => this.formRows(p).filter(x => !this.stagedOf(x, p) && !this.madeOf(x, p)).map(x => ({ x, part: p }))); },
    unfilledAll() { return this.unfilledRows.length; },
    // Rows waiting for the booking form, in the order they are shown (the form opens on the first, then the next)
    queue() { return this.parts.filter(p => p.prop && p.g).flatMap(p => this.formRows(p).filter(x => !this.madeOf(x, p)).map(x => ({ x, part: p }))); },
    count() { return this.ready.reduce((t, p) => t + (this.isNew ? p.adds.length + p.updates.length + p.fills.length + p.cancels.length + p.stagedRows.length : p.list.length + p.offOnly.length), 0); },
    // The groups of the property in view, in the order they are shown, with their choices
    sections() {
      const g = this.g;
      return [
        { key: 'clash', title: 'Clashes', tone: 'red', items: g.clash, third: 'Already in the system', note: 'The room is already booked for some of these nights, or the booking is already in the system as an offline booking. Default: Skip.',
          // 24 Nov 2026: Replace = cancel the clashing eZee booking(s) in the PMS and add this one (eZee is right)
          opts: x => [{ v: 'skip', label: 'Skip' }, ...(this.canReplace(x) ? [{ v: 'replace', label: 'Replace PMS booking', danger: true }] : []), { v: 'add', label: x.with.length ? 'Add anyway' : 'Add' }] },
        { key: 'fill', title: 'Fill in blank details', tone: 'amber', items: g.fill, third: 'Blank in the system → from the file', note: 'Already in the system, but some details are blank there and the file has them. Default: Fill in (only the blanks are written).',
          opts: () => [{ v: 'fill', label: 'Fill in' }, { v: 'leave', label: 'Leave' }] },
        { key: 'changed', title: 'Changed since it was saved', tone: 'blue', items: g.changed, third: 'What changes', note: 'Default: Update (the old values go to the audit log). A change that now clashes defaults to Keep.',
          opts: () => [{ v: 'update', label: 'Update' }, { v: 'keep', label: 'Keep system' }] },
        { key: 'cancelled', title: 'Cancelled in the system', tone: 'grey', items: g.cancelled, third: 'Why', note: 'eZee has these as booked again, or they were cancelled here by mistake. Default: Skip. Add again brings each back as eZee has it now.',
          opts: x => [{ v: 'skip', label: 'Skip' }, { v: 'add', label: x.with.length ? 'Add again anyway' : 'Add again', danger: !!x.with.length }] },
        { key: 'cant', title: "Can't be added", tone: 'grey', items: this.cantItems, third: 'Why', note: 'Left out. Fix them in eZee or Portfolio, then upload again.' },
        { key: 'ready', title: 'Ready to add', tone: 'green', items: g.ready, third: 'In the system', note: 'New bookings with no clash. A reservation with several rooms is saved as one booking per room.' }
      ];
    },
    // Review box -------------------------------------------------------------
    cmpSys() {   // the system's own record for this row (eZee booking, or offline booking with the same reservation no.), or null
      const x = this.cmp?.x; if (!x) return null;
      const e = x.existing; if (!e) return null;
      return x.target?.kind === 'offline' || ('bookingNo' in e && !('reservationNo' in e))
        ? { kind: 'offline', ref: e.bookingNo || e.id, guest: e.guest, unitCode: e.unitCode, arrival: e.arrival, departure: e.departure, nights: e.nights, source: e.bookingSource, status: e.status }
        : { kind: 'eZee', ref: e.reservationNo || e.id, guest: e.guestName, unitCode: e.unitCode, arrival: e.arrival, departure: e.departure, nights: e.nights, source: e.source,
          folioNo: e.folioNo, invoiceNo: e.invoiceNo, rateType: e.rateType, totalInclTax: e.totalInclTax, status: e.status };
    },
    cmpTitle() { return { ready: 'New booking', clash: 'Clash', fill: 'Fill in blank details', changed: 'Changed', cancelled: 'Cancelled in the system', cant: "Can't be added" }[this.cmp?.group] || ''; },
    cmpSysLabel() { const s = this.cmpSys; return s ? `In the system (${s.kind === 'offline' ? 'offline booking' : 'eZee booking'} ${s.ref})` : 'In the system'; },
    cmpLead() {
      const k = this.cmp?.group;
      return k === 'ready' || (k === 'clash' && !this.cmpSys) ? 'Not in the system yet: every detail below is added as new.'
        : k === 'fill' ? 'Only the details marked Fill in are written; everything else in the system stays as it is.'
        : k === 'changed' ? 'Update writes the whole booking again from the file (the old values go to the audit log).'
        : k === 'cancelled' ? 'Add again sets it back to booked with the details from the file.'
        : k === 'clash' ? 'The system already has this reservation as an offline booking.' : '';
    },
    cmpClash() {
      if (!this.cmp) return [];
      return [...this.cmp.orig, ...this.draftClash].filter((w, i, a) => a.findIndex(v => v.kind + v.ref === w.kind + w.ref) === i)
        .map(w => ({ ...w, now: this.draftClash.some(v => v.kind + v.ref === w.kind + w.ref) }));
    },
    draftClash() { const r = this.draftRec(); return r && r.unitId ? clashesFor(r, { ...this.cmp.part.ctx, fileStays: this.accepted(this.cmp.part, this.cmp.x) }) : []; },
    draftChanged() { const c = this.cmp; if (!c) return false; return EDITABLE.some(k => String(c.d[k] ?? '') !== String(c.start[k] ?? '')); },
    cmpRows() {
      const c = this.cmp; if (!c) return [];
      const sys = this.cmpSys, r = this.draftRec() || c.x.r, orig = c.x.orig || {}, group = c.group;
      const val = (k, o) => (k === 'guest' ? (o === r ? c.d.guest : o?.guest) : k === 'unit' ? o?.unitCode : o?.[k]);
      const fmt = (k, v) => (v === undefined || v === null || v === '' ? '—' : k === 'totalInclTax' ? `RM ${amt(v)}` : /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? dmy(v) : String(v));
      const fillKeys = new Set((c.x.fills || []).map(f => f.label));
      return FIELDS.map(f => {
        const fileV = val(f.k, r), sysV = sys ? val(f.k, sys) : undefined;
        const blankSys = sysV === undefined || sysV === null || sysV === '' || sysV === 0;
        let what = 'New', tone = 'green';
        if (sys) {
          if (String(sysV ?? '') === String(fileV ?? '')) { what = 'Same'; tone = 'grey'; }
          else if (group === 'fill') [what, tone] = blankSys && fillKeys.has(f.k === 'guest' ? 'Guest name' : f.label) ? ['Fill in', 'amber'] : blankSys && (fileV === undefined || fileV === '') ? ['Same', 'grey'] : ['Kept as in the system', 'grey'];
          else if (group === 'clash') [what, tone] = ['Not saved (skip or add as new)', 'grey'];
          else [what, tone] = blankSys ? ['Fill in', 'amber'] : ['Changes', 'blue'];
          if (sys.kind === 'offline' && !OFFLINE_KEYS.includes(f.k) && what !== 'Same') [what, tone] = ['—', 'grey'];
        } else if (fileV === undefined || fileV === null || fileV === '') { what = '—'; tone = 'grey'; }
        const origV = f.k === 'guest' ? orig.guest : f.k === 'unit' ? orig.unitCode : orig[f.k];
        return { k: f.k === 'unit' ? 'unitId' : f.k, label: f.label, sys: sys ? fmt(f.k, sysV) : '—', file: fmt(f.k, fileV), what, tone,
          edit: c.editable ? f.edit : null, edited: c.x.orig && origV !== undefined && String(origV ?? '') !== String((f.k === 'guest' ? c.x.guest : f.k === 'unit' ? c.x.r.unitCode : c.x.r[f.k]) ?? ''), orig: fmt(f.k, origV) };
      });
    },
    offTotal() { return this.isNew ? 0 : this.ready.reduce((t, p) => t + (p.offs || []).length, 0); },
    fromCheck() { return this.parts.reduce((t, p) => t + (p.c ? p.c.check.filter(x => x.go).length : 0), 0); },
    skippedTotal() {
      return this.parts.filter(p => p.g).reduce((t, p) => t + p.g.same.length + p.g.cant.length + p.g.cancelled.filter(x => x.choice !== 'add').length + p.g.other.length
        + p.g.clash.filter(x => x.choice !== 'add' && x.choice !== 'replace').length + p.g.changed.filter(x => x.choice !== 'update').length + p.g.fill.filter(x => x.choice !== 'fill').length, 0);
    },
    byMonth() {
      const t = {};
      for (const p of this.ready) for (const x of p.list) {
        const m = x.booking.departureMonth || '—', k = p.key + m;
        t[k] = t[k] || { key: k, label: p.label, month: m, n: 0, total: 0 }; t[k].n++; t[k].total += Number(x.booking.totalInclTax) || 0;
      }
      return Object.values(t).sort((a, b) => a.label.localeCompare(b.label) || a.month.localeCompare(b.month));
    },
    footNote() {
      if (this.isNew && this.unfilledAll) return `Fill in the booking form (or Check details) for ${this.unfilledAll} ${this.unfilledAll === 1 ? 'row' : 'rows'} being added or filled in (${this.unfilledRows.slice(0, 4).map(y => y.x.r.reservationNo).join(', ')}${this.unfilledAll > 4 ? ', …' : ''}), or set ${this.unfilledAll === 1 ? 'it' : 'them'} to Skip. Then Continue to confirm.`;
      if (!this.count) return this.isNew ? 'Nothing to save.' : 'Nothing to cancel.';
      const where = plural(this.ready.length, 'property', 'properties');
      if (this.isMonth) return `${this.count} changes across ${where} (every tab: adds, updates, fill-ins and cancellations). Nothing is saved until you confirm.`;
      return this.isNew ? `Saves ${this.count} across ${where} (every tab, fill-ins included). Nothing is saved until you confirm.` : `Cancels ${this.count} across ${where} (every tab). Nothing is changed until you confirm.`;
    }
  },
  watch: { busy(v) { this.$emit('busy', v); } },
  methods: {
    amt, dmy, monthName,
    show(v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? dmy(v) : (v ?? '—'); },
    stay(b) { return b.arrival ? `${dmy(b.arrival)} – ${dmy(b.departure)}${b.nights ? ` · ${b.nights} ${b.nights === 1 ? 'night' : 'nights'}` : ''}` : '—'; },
    reportLine(r) { return [r.guest, r.arr && r.dpt ? `${r.arr} – ${r.dpt}` : '', r.folioNo, r.source, r.cancelDate ? `cancelled ${dmy(r.cancelDate)}` : '', r.remark].filter(Boolean).join(' · '); },
    matchedOn(x) { const s = x.sure || {}; return [s.folio && 'folio no.', s.dates && 'dates', s.name && 'guest'].filter(Boolean).join(', ') || '—'; },
    propLabel(id) { const p = this.properties.find(x => x.id === id); return p ? `${p.name}${p.code ? ` (${p.code})` : ''}${p.info?.state ? ` · ${p.info.state}` : ''}` : id; },
    // What the tab says under the property name
    tabNote(p) {
      if (!p.prop) return p.ask?.length ? `${p.size} rows · choose the property` : `${p.size} rows · not found`;
      if (!(this.isNew ? p.g : p.c)) return 'Checking…';
      if (this.isNew) {
        const g = p.g, add = g.ready.length + g.clash.filter(x => x.choice === 'add' || x.choice === 'replace').length + g.cancelled.filter(x => x.choice === 'add').length;
        const mg = (this.isMonth && p.mg) || EMPTY_MONTH, gone = mg.gone.length + mg.missing.length;
        return [`${add} new`, gone && `${gone} only in the PMS`, g.cancelled.length && `${g.cancelled.length} cancelled here`, g.fill.length && `${g.fill.length} to fill in`, g.changed.length && `${g.changed.length} changed`, g.clash.length && `${g.clash.length} ${g.clash.length === 1 ? 'clash' : 'clashes'}`].filter(Boolean).join(' · ');
      }
      const c = p.c;
      return [`${c.cancel.length + c.check.filter(x => x.go).length + c.offOnly.filter(x => x.go).length} to cancel`, c.check.length && `${c.check.length} to check`].filter(Boolean).join(' · ');
    },
    needsLook(p) { const x = this.isNew ? p.g : p.c, mg = (this.isMonth && p.mg) || EMPTY_MONTH; return !p.prop || (!!x && (this.isNew ? x.clash.length + x.fill.length + mg.gone.length + mg.missing.length + this.formRows(p).filter(y => !this.stagedOf(y, p) && !this.madeOf(y, p)).length > 0 : x.check.length + x.offOnly.length > 0)); },
    // Replace is offered when every clash is an eZee booking saved in the PMS (an offline booking is cancelled on its own page)
    // and none of them sits in a completed owner statement
    canReplace(x, part = this.cur) {
      if (!x.with.length || !x.with.every(w => w.kind === 'eZee')) return false;
      const ctx = part?.ctx; if (!ctx) return false;
      return x.with.every(w => { const bk = ctx.existing.find(b => b.id === w.id); return !!bk && !ctx.doneBy[bk.departureMonth]?.has(bk.unitId); });
    },
    toggleMonth(mm) {
      this.fullMonths = this.fullMonths.includes(mm) ? this.fullMonths.filter(v => v !== mm) : [...this.fullMonths, mm].sort();
      for (const p of this.parts) if (p.ctx) this.checkMissing(p);
    },
    // Monthly check: bookings booked in the PMS that the file has as cancelled or not at all. Choices made by hand are kept.
    checkMissing(part) {
      if (!this.isMonth || !part.prop || !part.ctx) return;
      const before = new Map([...(part.mg?.gone || []), ...(part.mg?.missing || [])].map(x => [x.booking.id, x.choice]));
      const mg = classifyMissing(part.rows, part.ctx.existing, { fullMonths: this.fullMonths, done: (u, m) => !!part.ctx.doneBy[m]?.has(u) });
      for (const x of [...mg.gone, ...mg.missing]) if (!x.locked && before.has(x.booking.id)) x.choice = before.get(x.booking.id);
      part.mg = mg;
    },

    // ---------- The New booking form for a row (24 Nov 2026) ----------
    // Already a booking in Portfolio > Bookings: made here, or an offline booking holding this eZee reservation no.
    madeOf(x, part) {
      const m = part && this.made[`${part.key}|${x.r.docId}`];
      if (m) return m;
      if (this.fillTarget(x)) return null;   // being filled in: done once saved (made)
      const e = x.existing, off = e && 'bookingNo' in e && !('reservationNo' in e) ? e : null;
      const same = off || (part?.ctx?.offline || []).find(o => o.status !== 'cancelled' && o.ezeeReservationNo && o.ezeeReservationNo === x.r.reservationNo);
      return same ? { id: same.id, bookingNo: same.bookingNo || same.id } : null;
    },
    // A row with a room and a stay can be opened in the form
    canForm(x) { return x.r.status === 'active' && !!x.r.unitId && !!x.r.arrival && !!x.r.departure; },
    key(x, part) { return `${part.key}|${x.r.docId}`; },
    stagedOf(x, part) { return (part && this.staged[this.key(x, part)]) || null; },
    // Rows a booking form is offered for: new rows (ready, and clash / cancelled ones being added) and changed ones
    formRows(p) {
      const g = p.g; if (!g) return [];
      // 24 Nov 2026: and Fill in blank details: on an eZee booking (no booking in Bookings yet: one is made), or on a booking in
      // Bookings (that booking opens in the form, its blanks filled from the file, and is updated)
      return [...g.ready, ...g.clash.filter(x => x.choice === 'add' || x.choice === 'replace'), ...g.cancelled.filter(x => x.choice === 'add'),
        ...g.fill.filter(x => x.choice === 'fill')].filter(x => this.canForm(x) || this.fillTarget(x));
    },
    needsForm(x, part) { return !!part && this.formRows(part).includes(x); },
    // Fill in blank details on a booking already in Portfolio > Bookings: that booking opens in the form (no new one is made)
    fillTarget(x) { return x.choice === 'fill' && x.target?.kind === 'offline' ? x.target : null; },
    queueAt(f) { return this.queue.findIndex(y => y.part === f.part && y.x.r.docId === f.x.r.docId); },
    nextAfter(f) {
      const q = this.queue, i = f ? this.queueAt(f) : -1;
      return [...q.slice(i + 1), ...q.slice(0, Math.max(0, i))].find(y => !this.stagedOf(y.x, y.part)) || null;
    },
    openNext(f = null) { const n = this.nextAfter(f); this.form = null; if (n) this.$nextTick(() => { this.tab = n.part.key; this.openForm(n.x, n.part); }); },
    skipRow() { const f = this.form; this.openNext(f); },
    onStaged(e) {
      const f = this.form; if (!f) return;
      this.staged = { ...this.staged, [this.key(f.x, f.part)]: { bk: e.bk, pending: e.pending, label: e.label, error: '' } };
      this.flash = `${f.x.r.reservationNo}: ${this.fillTarget(f.x) ? 'Pending confirm to fill' : 'Pending confirm to add'}. It is saved when you press Continue to confirm.`;
      f.dirty = false;
      this.openNext(f);
    },
    unstage(x, part) { const s = { ...this.staged }; delete s[this.key(x, part)]; this.staged = s; },
    // Continue to confirm: one pending row saved by the booking form itself (no screen). Resolves { ok, error }.
    commitRow(x, part) {
      const st = this.stagedOf(x, part);
      return new Promise(resolve => {
        const ft = this.fillTarget(x);
        this.committing = { key: `c|${this.key(x, part)}|${Date.now()}`, prefill: { ezeeNo: x.r.reservationNo, bk: st.bk, ...(ft ? { fillId: ft.id } : {}) }, resolve,
          onSaved: e => { this.made = { ...this.made, [this.key(x, part)]: { id: e.bookingId, bookingNo: e.bookingNo, saved: true } }; } };
      }).then(r => { this.committing = null; return r; });
    },
    rowClick(x, group) { if (group !== 'cant' && this.needsForm(x, this.cur) && !this.madeOf(x, this.cur)) this.openForm(x, this.cur, !!this.doneMsg); else this.openCompare(x, group); },
    // now = after the upload was saved: the form saves straight away (there is no Continue to confirm any more)
    openForm(x, part, now = false) {
      if (!part?.prop || this.madeOf(x, part)) return;
      const st = this.stagedOf(x, part), ft = this.fillTarget(x);
      this.form = { key: `${part.key}|${x.r.docId}|${Date.now()}`, x, part, now, dirty: false, done: false,
        prefill: { ezeeNo: x.r.reservationNo, name: x.guest || '', propertyId: part.prop.id, unitId: x.r.unitId, arrival: x.r.arrival, departure: x.r.departure,
          source: x.r.source || '', total: x.r.totalInclTax || 0, ...(ft ? { fillId: ft.id } : {}), ...(st ? { bk: st.bk } : {}) } };
    },
    async closeForm() {
      if (this.form?.dirty && !this.form.done && !(await askConfirm({ title: 'Close the form?', message: "What you've entered will be lost.", confirmText: 'Close', danger: true }))) return;
      this.form = null;
    },
    onFormSaved(e) {
      const f = this.form; if (!f) return;
      this.made = { ...this.made, [`${f.part.key}|${f.x.r.docId}`]: { id: e.bookingId, bookingNo: e.bookingNo, saved: true } };
      f.done = true; f.dirty = false;
      this.flash = `${f.x.r.reservationNo} saved as booking ${e.bookingNo}${e.pending ? ' (awaiting payment)' : ''}. It is in Portfolio › Bookings.`;
    },

    // ---------- Review and edit one row ----------
    // Rows of the property that will be added or updated (besides x): another one in the same room and nights is a clash too
    accepted(part, x) {
      const g = part.g;
      return [...g.ready, ...g.clash.filter(y => y.choice === 'add'), ...g.cancelled.filter(y => y.choice === 'add'), ...g.changed.filter(y => y.choice === 'update')]
        .filter(y => y !== x && y.r.rowKey !== x.r.rowKey).map(y => ({ ...y.r, guest: y.guest }));
    },
    openCompare(x, group) {
      const start = { guest: x.guest || '', unitId: x.r.unitId || '', arrival: x.r.arrival || '', departure: x.r.departure || '', source: x.r.source || '', rateType: x.r.rateType || '' };
      // Rows that can't be saved anyway (no room in eZee, another property) are shown, not edited
      const editable = group !== 'cant' || !!x.r.unitCode;
      this.cmp = { part: this.cur, x, group, editable, busy: false, err: '', orig: x.with.map(w => ({ ...w })), d: { ...start }, start };
    },
    draftRec() {
      const c = this.cmp; if (!c) return null;
      const d = c.d, u = c.part.ctx.units.find(v => v.id === d.unitId);
      return { ...c.x.r, unitId: d.unitId || c.x.r.unitId, unitCode: u ? u.unitCode : c.x.r.unitCode, arrival: d.arrival, departure: d.departure, source: d.source, rateType: d.rateType,
        nights: nightsOf(d.arrival, d.departure) || c.x.r.nights, departureMonth: d.departure ? d.departure.slice(0, 7) : c.x.r.departureMonth };
    },
    // Sorts the property's rows again with the edits made so far; choices made by hand are kept where the row stays in its group
    classify(part) {
      const ctx = part.ctx, edits = part.edits || (part.edits = {});
      const before = {};
      if (part.g) for (const [k, list] of Object.entries(part.g)) for (const x of list) before[x.r.rowKey] = { k, choice: x.choice };
      const recs = part.rows.map(r => {
        const e = edits[r.rowKey]; if (!e) return r;
        return { ...r, ...e.patch, private: { ...(r.private || {}), ...(e.guest !== undefined ? { guestName: e.guest || null } : {}) } };
      });
      const g = classifyNew(recs.map(r => ({ ...r, propertyCode: part.prop.code })), { property: { id: part.prop.id, code: part.prop.code, name: part.prop.name },
        units: ctx.units, existing: ctx.existing, offline: ctx.offline, done: (u, m) => !!ctx.doneBy[m]?.has(u) });
      for (const [k, list] of Object.entries(g)) for (const x of list) {
        const e = edits[x.r.rowKey];
        if (e) { x.edited = e.list; x.orig = e.orig; }
        const b = before[x.r.rowKey];
        if (b && b.k === k && b.choice !== undefined) x.choice = b.choice;
      }
      part.g = g;
      return g;
    },
    async applyEdit() {
      const c = this.cmp, x = c.x, r = this.draftRec();
      if (!r.arrival || !r.departure || r.departure <= r.arrival) { c.err = 'Check-out must be after check-in.'; return; }
      c.busy = true;
      try {   // the new check-out month's statement must still be open
        const ctx = c.part.ctx;
        if (r.departureMonth && !ctx.doneBy[r.departureMonth]) ctx.doneBy[r.departureMonth] = await completedUnitIds(c.part.prop.id, r.departureMonth);
        if (ctx.doneBy[r.departureMonth]?.has(r.unitId)) { c.err = `The ${monthName(r.departureMonth)} owner statement for ${r.unitCode} is completed. Choose another room or dates.`; c.busy = false; return; }
      } catch (e) { c.err = friendlyError(e, 'check the month'); c.busy = false; return; }
      const orig = x.orig || { guest: x.guest || '', unitCode: x.r.unitCode, arrival: x.r.arrival, departure: x.r.departure, source: x.r.source, rateType: x.r.rateType };
      const now = { guest: c.d.guest, unitCode: r.unitCode, arrival: r.arrival, departure: r.departure, source: r.source, rateType: r.rateType };
      const list = [['Guest', 'guest'], ['Room', 'unitCode'], ['Check-in', 'arrival'], ['Check-out', 'departure'], ['Source', 'source'], ['Rate type', 'rateType']]
        .filter(([, k]) => String(orig[k] ?? '') !== String(now[k] ?? '')).map(([field, k]) => ({ field, from: orig[k] ?? '', to: now[k] ?? '' }));
      const edits = c.part.edits || (c.part.edits = {});
      if (list.length) edits[x.r.rowKey] = { orig, list, guest: c.d.guest, patch: { unitId: r.unitId, unitCode: r.unitCode, arrival: r.arrival, departure: r.departure, nights: r.nights, departureMonth: r.departureMonth, source: r.source, rateType: r.rateType } };
      else delete edits[x.r.rowKey];
      this.afterEdit(c.part, x.r.rowKey, c.group);
    },
    resetEdit() { const c = this.cmp; delete (c.part.edits || {})[c.x.r.rowKey]; this.afterEdit(c.part, c.x.r.rowKey, c.group); },
    afterEdit(part, key, was) {
      const g = this.classify(part);
      const names = { ready: 'Ready to add', same: 'Already in the system (nothing to do)', changed: 'Changed', clash: 'Clashes', fill: 'Fill in blank details', cancelled: 'Cancelled in the system', cant: "Can't be added", other: "Can't be added" };
      const [k, x] = Object.entries(g).map(([k, l]) => [k, l.find(y => y.r.rowKey === key)]).find(([, y]) => y) || [];
      // A row moved to another group by the edit takes that group's own default
      if (x && k === was && (k === 'clash' || k === 'cancelled')) x.choice = x.with.length ? x.choice : 'add';
      this.flash = x ? `${x.r.docId} saved with your edits: now under ${names[k]}.` : '';
      this.cmp = null;
    },
    reset() { Object.assign(this, { form: null, made: {}, staged: {}, committing: null, fileMonths: [], fullMonths: [], flash: '', cmp: null, doneLinks: [], error: '', doneMsg: '', fileName: '', note: '', checked: false, parts: [], tab: '', m: { stated: null, read: 0 }, limit: 30, confirming: false, ticked: false, typed: '', percent: 0, rows: markRaw([]) }); },
    openConfirm() { if (this.isNew && this.unfilledAll) return; this.ticked = false; this.typed = ''; this.confirming = true; },

    // The rows of a file split by property code, each matched to a property in the PMS (a tab each)
    split(list, codeOf, buildingOf) {
      const by = new Map();
      for (const r of list) { const k = codeOf(r) || '?'; if (!by.has(k)) by.set(k, []); by.get(k).push(r); }
      return [...by.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([code, rows]) => {
        const part = { key: code, code, rows: markRaw(rows), size: rows.length, prop: null, ask: null, pick: '', why: '', label: code, g: null, c: null };
        if (code === '?') { part.label = 'No property'; part.why = `${plural(rows.length, 'row has', 'rows have')} no reservation no. or room that shows its property. Left out.`; return part; }
        const hits = ezeeCandidates(this.properties, { code, building: buildingOf ? buildingOf(rows) : '' });
        if (hits.length === 1) { part.prop = hits[0]; part.label = hits[0].name; }
        else if (hits.length > 1) part.ask = hits.map(p => p.id);
        else part.why = `No property with the code ${code} in the PMS (or not one you can see). These ${plural(rows.length, 'row', 'rows')} are left out. Add the property in Portfolio first, or ask a Director.`;
        return part;
      });
    },

    async pick(files) {
      const file = files && files[0];
      if (!file) return;
      this.reset(); this.fileName = file.name; this.busy = true;
      try {
        if (this.isNew) await this.readNew(file); else await this.readCancel(file);
        for (const [i, p] of this.parts.entries()) if (p.prop) { this.busyNote = `Checking ${p.label} (${i + 1} of ${this.parts.length})…`; await this.checkPart(p); }
        // Open the first tab that needs a look, else the first
        this.tab = (this.parts.find(p => this.needsLook(p)) || this.parts[0])?.key || '';
        this.checked = true;
        // 24 Nov 2026: the booking form opens by itself on the first new row (filled in from the file)
        if (this.isNew && this.queue.length) { const f = this.queue[0]; this.tab = f.part.key; this.$nextTick(() => this.openForm(f.x, f.part)); }
      } catch (e) { this.error = e.code ? friendlyError(e, 'read the bookings') : e.message; }
      this.busy = false; this.percent = 0;
    },
    // A code shared by several properties: checked once they say which
    async choose(p) {
      p.prop = this.properties.find(x => x.id === p.pick) || null;
      if (!p.prop) return;
      p.label = p.prop.name; this.busy = true; this.busyNote = `Checking ${p.label}…`;
      try { await this.checkPart(p); } catch (e) { this.error = e.code ? friendlyError(e, 'read the bookings') : e.message; p.prop = null; p.label = p.code; }
      this.busy = false;
    },
    checkPart(p) { return this.isNew ? this.checkNew(p) : this.checkCancel(p); },

    // ---------- New bookings ----------
    async readNew(file) {
      this.busyNote = 'Reading the file…';
      let rows;
      if (/\.csv$/i.test(file.name)) rows = parseCSV(await file.text());
      else { const X = await loadXlsxLib(); const wb = X.read(await file.arrayBuffer(), { type: 'array', cellDates: true }); rows = sheetText(X, wb.Sheets[wb.SheetNames[0]]); }
      const { records } = readEzee(rows);
      if (!records.length) throw new Error('No reservations in this file.');
      records.forEach((r, i) => { r.rowKey = i; });   // a row's own key (edits are kept by it)
      this.rows = markRaw(records);
      const building = list => { const n = {}; list.forEach(r => { if (r.building) n[r.building] = (n[r.building] || 0) + 1; }); return Object.keys(n).sort((a, b) => n[b] - n[a])[0] || ''; };
      this.parts = this.split(records, r => r.propertyCode || codeOfRes(r.reservationNo), building);
      const months = monthsOf(records);
      // Monthly check: the month with the most check-outs is taken as the month the file holds in full (they can change it)
      this.fileMonths = months; this.fullMonths = this.isMonth ? [mainMonth(records)].filter(Boolean) : [];
      const span = months.length ? `${monthName(months[0])} – ${monthName(months[months.length - 1])}` : '';
      this.note = `${records.length} rows, ${new Set(records.map(r => r.reservationNo)).size} reservations, ${plural(this.parts.length, 'property', 'properties')}${span ? `, check-outs ${span}` : ''}`;
    },

    async checkNew(part) {
      const p = part.prop, records = part.rows;
      const units = await loadUnits(p.id);
      const months = monthsOf(records);
      const first = records.filter(r => r.arrival).map(r => r.arrival.slice(0, 7)).sort()[0] || months[0], last = months[months.length - 1];
      const range = first && last ? monthRange(first, monthAdd(last, 1)) : [];
      // Saved eZee bookings: every one with a reservation number in the file, and every one leaving in the file's months
      const found = new Map();
      const take = snap => snap.docs.forEach(d => found.set(d.id, { id: d.id, ...d.data() }));
      for (const m of chunks(range, 30)) take(await getDocs(query(collection(db, 'bookings'), where('propertyId', '==', p.id), where('departureMonth', 'in', m))));
      for (const n of chunks([...new Set(records.map(r => r.reservationNo))], 30)) take(await getDocs(query(collection(db, 'bookings'), where('propertyId', '==', p.id), where('reservationNo', 'in', n))));
      // Guest names (private part) only for the file's own reservation numbers
      const names = {}, inFile = new Set(records.map(r => r.reservationNo));
      await Promise.all([...found.values()].filter(b => inFile.has(b.reservationNo)).map(async b => {
        // '' = read and blank (can be filled in from the file); left out = not allowed to read it
        try { const s = await getDoc(doc(db, 'bookings', b.id, 'private', 'main')); names[b.id] = s.exists() ? s.data().guestName || '' : ''; } catch { /* not allowed: shown without a name */ }
      }));
      const existing = [...found.values()].map(b => ({ ...b, guestName: names[b.id] }));
      const offline = (await getDocs(query(collection(db, 'offlineBookings'), where('propertyId', '==', p.id)))).docs
        .map(d => ({ id: d.id, ...d.data() })).map(o => ({ id: o.id, bookingNo: o.bookingNo, unitId: o.unitId, unitCode: o.unitCode, arrival: o.arrival, departure: o.departure,
          nights: o.nights, bookingSource: o.bookingSource || '', status: o.status, ezeeReservationNo: o.ezeeReservationNo || '', guest: o.tenantName || o.guestName || undefined }));
      // Offline bookings with a reservation no. in the file: their guest name, so a blank one can be filled in
      await Promise.all(offline.filter(o => inFile.has(o.ezeeReservationNo)).map(async o => {
        try { const s = await getDoc(doc(db, 'offlineBookings', o.id, 'private', 'main')); o.guest = s.exists() ? s.data().name || '' : ''; } catch { /* not allowed */ }
      }));
      // Monthly check: guest names of every saved booking (the ones only in the PMS are listed too)
      if (this.isMonth) await Promise.all(existing.filter(b => b.guestName === undefined && b.status !== 'cancelled').map(async b => {
        try { const s = await getDoc(doc(db, 'bookings', b.id, 'private', 'main')); b.guestName = s.exists() ? s.data().guestName || '' : ''; } catch { /* not allowed */ }
      }));
      const doneBy = {};
      for (const m of [...new Set([...months, ...existing.map(b => b.departureMonth).filter(Boolean)])]) doneBy[m] = await completedUnitIds(p.id, m);
      part.ctx = markRaw({ units, existing, offline, doneBy });
      // Rows of this tab are this property's, whatever code the room shows
      part.edits = {}; part.g = null; part.mg = null;
      this.classify(part);
      this.checkMissing(part);
    },

    async saveNew() {
      const parts = this.ready, all = this.count;
      this.confirming = false; this.busy = true; this.busyNote = `Saving ${all} bookings…`; this.percent = 2;
      try {
        const batchRef = doc(collection(db, 'importBatches'));
        const tally = { created: 0, changed: 0, unchanged: 0, writes: 0 }, allMonths = new Set();
        const total = this.count - parts.reduce((t, p) => t + p.fills.length, 0) || 1;   // progress: bookings written by saveEzeeBookings
        let done = 0;
        for (const pt of parts) {
          // Saved month by month (bookings are kept under their check-out month), the same way as Upload eZee report
          const list = [...pt.adds, ...pt.updates].map(x => x.r), byMonth = {};
          for (const r of list) (byMonth[r.departureMonth] ||= []).push(r);
          const before = new Map([...pt.g.changed, ...pt.readds].map(x => [x.r.docId, x.existing]));
          for (const m of Object.keys(byMonth).sort()) {
            const recs = byMonth[m]; allMonths.add(m);
            const check = { month: m, property: { id: pt.prop.id }, savedHash: {}, savedUnit: {}, held: {}, via: this.isMonth ? 'month' : 'daily' };
            for (const r of recs) {
              const ex = before.get(r.docId);
              if (ex) { check.savedHash[r.docId] = ex.rawHash || null; check.savedUnit[r.docId] = ex.unitId || null; if (ex.movedByHand) check.held[r.docId] = 'moved'; }
            }
            this.busyNote = `Saving ${pt.label} · ${monthName(m)}…`;
            const t = await saveEzeeBookings(recs, batchRef, check, f => { this.percent = Math.round(5 + 85 * (done + f * recs.length) / total); });
            for (const k of Object.keys(tally)) tally[k] += t[k];
            done += recs.length;
          }
        }
        // Added again: the cancel note moves to cancelHistory and the booking is booked again (saveEzeeBookings wrote it as eZee has it)
        for (const pt of parts) for (const list of chunks(pt.readds, 200)) {
          const rb = writeBatch(db);
          for (const x of list) rb.set(doc(db, 'bookings', x.r.docId), { cancel: deleteField(), cancelHistory: arrayUnion({ ...(x.existing?.cancel || {}), at: x.existing?.cancel?.at || null, undoneAt: new Date().toISOString(), undoneBy: me.name, undoneFile: this.fileName }),
            reAdded: { at: serverTimestamp(), byUid: me.user.uid, byName: me.name, file: this.fileName, batchId: batchRef.id } }, { merge: true });
          await rb.commit();
        }
        // Blank details filled in: only the blank fields are written
        // A Fill in on a booking in Portfolio > Bookings is saved by its booking form below (not twice)
        for (const pt of parts) for (const list of chunks(pt.fills.filter(x => !(this.fillTarget(x) && this.stagedOf(x, pt)?.bk)), 100)) {
          const fb = writeBatch(db), dirty = new Map();
          for (const x of list) {
            const set = Object.assign({}, ...x.fills.map(f => f.doc)), priv = Object.assign({}, ...x.fills.map(f => f.priv));
            const coll = x.target.kind === 'offline' ? 'offlineBookings' : 'bookings';
            fb.set(doc(db, coll, x.target.id), { ...set, filledIn: { at: serverTimestamp(), byUid: me.user.uid, byName: me.name, file: this.fileName, batchId: batchRef.id, fields: x.fills.map(f => f.label) } }, { merge: true });
            if (Object.keys(priv).length) {
              fb.set(doc(db, coll, x.target.id, 'private', 'main'), priv, { merge: true });
              if (coll === 'offlineBookings') fb.set(doc(db, coll, x.target.id, 'private', 'contact'), { name: priv.name }, { merge: true });
            }
            if (coll === 'bookings') {
              const m = set.departureMonth || x.existing?.departureMonth, u = set.unitId || x.existing?.unitId || null;
              if (m) { if (!dirty.has(m)) dirty.set(m, []); dirty.get(m).push(u); }
            }
          }
          for (const [m, ids] of dirty) markDirty(fb, pt.prop.id, m, ids);
          await fb.commit();
        }
        // Monthly check (24 Nov 2026): cancel in the PMS what eZee has cancelled or doesn't have, and the bookings replaced
        // by a clash row. Same record as a Cancel bookings upload; rawHash cleared so the next eZee upload can set it back.
        for (const pt of parts) for (const list of chunks(pt.cancels, CHUNK)) {
          const cb = writeBatch(db), dirty = new Map();
          for (const x of list) {
            const bk = x.booking;
            cb.set(doc(db, 'bookings', bk.id), { status: 'cancelled', rawHash: null, cancel: { date: today(), by: '', remark: x.replacedBy ? `Replaced by ${x.replacedBy}` : x.row ? 'Cancelled in eZee (monthly check)' : 'Not in the eZee monthly report',
              source: x.replacedBy ? 'Monthly check · replaced' : 'Monthly check', file: this.fileName, batchId: batchRef.id, at: serverTimestamp(), byUid: me.user.uid, byName: me.name, checked: true },
              lastImportedAt: serverTimestamp() }, { merge: true });
            if (bk.departureMonth) { if (!dirty.has(bk.departureMonth)) dirty.set(bk.departureMonth, []); dirty.get(bk.departureMonth).push(bk.unitId || null); }
          }
          for (const [m, ids] of dirty) markDirty(cb, pt.prop.id, m, ids);
          await cb.commit();
        }
        const b = writeBatch(db), pids = parts.map(p => p.prop.id);
        const per = Object.fromEntries(parts.map(p => [p.prop.id, { created: p.adds.length, updated: p.updates.length, filledIn: p.fills.length, edited: p.edits, forcedClashes: p.forced.length, replaced: p.replaces.length, cancelled: p.cancels.length }]));
        b.set(batchRef, { kind: this.isMonth ? 'ezeeMonth' : 'ezeeBulk', fullMonths: this.isMonth ? this.fullMonths : null, fileName: this.fileName, filePath: null, months: [...allMonths].sort(), propertyIds: pids, states: await statesFor(pids),
          counts: { rows: this.rows.length, created: parts.reduce((t, p) => t + p.adds.length, 0), updated: parts.reduce((t, p) => t + p.updates.length, 0),
            forcedClashes: this.forcedAll.length, cancelled: this.cancelsAll.length, skipped: this.skippedTotal, bookingWrites: tally.writes, perProperty: per }, result: 'ok',
          uploadedBy: me.user.uid, uploadedByName: me.name, uploadedAt: serverTimestamp() });
        for (const pt of parts) {
          const changes = [{ field: 'added', old: null, new: pt.adds.map(x => x.r.docId).join(', ').slice(0, 4000) }];
          for (const x of pt.updates.slice(0, 60)) changes.push({ field: x.r.docId, old: x.diffs.map(d => `${d.field} ${d.from}`).join('; '), new: x.diffs.map(d => `${d.field} ${d.to}`).join('; ') });
          if (pt.forced.length) changes.push({ field: 'added despite a clash', old: null, new: pt.forced.map(x => `${x.r.docId} (${x.with.map(w => w.ref).join(', ')})`).join('; ').slice(0, 2000) });
          if (pt.cancels.length) changes.push({ field: 'cancelled in the PMS (monthly check)', old: 'active', new: pt.cancels.map(x => `${x.booking.id}${x.replacedBy ? ` (replaced by ${x.replacedBy})` : ''}`).join('; ').slice(0, 2000) });
          if (pt.readds.length) changes.push({ field: 'added again (was cancelled in the PMS)', old: 'cancelled', new: pt.readds.map(x => x.r.docId).join(', ').slice(0, 2000) });
          for (const x of [...pt.adds, ...pt.updates, ...pt.fills].filter(y => y.edited?.length).slice(0, 60)) changes.push({ field: `${x.r.docId} edited before saving`, old: x.edited.map(e => `${e.field} ${e.from || '—'}`).join('; '), new: x.edited.map(e => `${e.field} ${e.to || '—'}`).join('; ') });
          for (const x of pt.fills.slice(0, 60)) changes.push({ field: `${x.target.kind === 'offline' ? 'offlineBookings' : 'bookings'}/${x.target.id} filled in`, old: x.fills.map(f => `${f.label} blank`).join('; '), new: x.fills.map(f => f.label === 'Guest name' ? 'Guest name added' : `${f.label} ${f.to}`).join('; ') });
          audit(b, me, { action: this.isMonth ? 'ezee.monthCheck' : 'ezee.bulkAdd', entity: `importBatches/${batchRef.id}`, propertyId: pt.prop.id, changes, reason: this.fileName });
        }
        await b.commit(); clearCache();
        // 24 Nov 2026: the rows Pending confirm to add become bookings in Portfolio > Bookings, one after another, through the
        // booking form's own save (tenant record, booking no., payment, passcodes). A row that fails stays pending with why.
        const staged = parts.flatMap(p => p.stagedRows.map(x => ({ x, part: p })));
        let made = 0; const failed = [];
        for (const [i, y] of staged.entries()) {
          this.busyNote = `Adding bookings to Portfolio › Bookings (${i + 1} of ${staged.length})…`; this.percent = Math.round(90 + 9 * i / staged.length);
          const r = await this.commitRow(y.x, y.part);
          if (r?.ok) made++;
          else { failed.push(y.x.r.reservationNo); this.staged = { ...this.staged, [this.key(y.x, y.part)]: { ...this.stagedOf(y.x, y.part), error: r?.error || 'Not saved.' } }; }
        }
        this.percent = 100;
        this.doneMsg = `${made ? `${made} ${made === 1 ? 'booking' : 'bookings'} added to Portfolio › Bookings. ` : ''}${failed.length ? `${failed.length} not added (${failed.join(', ')}): open them below. ` : ''}${this.isMonth ? 'Monthly check applied' : 'Saved'}: ${parts.map(p => `${p.label} ${p.adds.length} new${p.readds.length ? ` (${p.readds.length} added again)` : ''}, ${p.updates.length} updated${p.fills.length ? `, ${p.fills.length} filled in` : ''}${p.cancels.length ? `, ${p.cancels.length} cancelled` : ''}`).join(' · ')}.`;
        // Where to see them: Month-End Payout per property and check-out month (the busiest months first), and the property's Units tab
        const links = [];
        for (const p of parts) {
          const n = {};
          for (const x of [...p.adds, ...p.updates]) n[x.r.departureMonth] = (n[x.r.departureMonth] || 0) + 1;
          for (const x of p.cancels) if (x.booking.departureMonth) n[x.booking.departureMonth] = (n[x.booking.departureMonth] || 0) + 1;
          for (const m of Object.keys(n).filter(Boolean).sort((a, b) => n[b] - n[a] || a.localeCompare(b)).slice(0, 3))
            links.push({ label: `${parts.length > 1 ? `${p.label} · ` : ''}Month-End ${monthName(m)} (${n[m]})`, to: `/Finance/month-end?property=${encodeURIComponent(p.prop.id)}&month=${m}` });
          links.push({ label: `${p.label} · Bookings`, to: `/Portfolio/bookings?property=${encodeURIComponent(p.prop.id)}` });
        }
        this.doneLinks = links;
        this.checked = false;
      } catch (e) { this.error = (e.code ? friendlyError(e, 'save the bookings') : e.message) + ' Saving the same file again is safe: bookings already saved show as "Already in the PMS".'; }
      this.busy = false; this.percent = 0;
    },

    // ---------- Cancellations ----------
    async readCancelText(file) {
      const buf = await file.arrayBuffer();
      // A PDF that holds text (saved by eZee's own Export) is read here; a printed one (pictures) by Google Drive
      try {
        const lib = await loadPdfJs();
        const pdf = await lib.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise;
        let text = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const items = (await (await pdf.getPage(i)).getTextContent()).items;
          let lastY = null;
          for (const it of items) { const y = Math.round(it.transform?.[5] ?? 0); text += (lastY !== null && Math.abs(y - lastY) > 2 ? '\n' : ' ') + it.str; lastY = y; }
          text += '\n';
        }
        if (/[A-Z]{2,4}\s?RS\s?\d{4}/.test(text)) return text;
      } catch { /* not readable here: OCR below */ }
      if (buf.byteLength > 3 * 1024 * 1024) throw new Error('This PDF is bigger than 3 MB. Print fewer pages at a time (for example two weeks of cancellations) and upload each.');
      this.busyNote = 'Reading the printed pages (Google Drive reads the text). This can take up to a minute…';
      return readPdfText(file.name, toBase64(buf));
    },

    async readCancel(file) {
      if (!/\.pdf$/i.test(file.name)) throw new Error('Choose the Cancelled Reservation report as a PDF.');
      this.busyNote = 'Reading the report…';
      const rep = parseCancelReport(await this.readCancelText(file));
      if (!rep.rows.length) throw new Error('No reservation numbers could be read from this PDF. Is it eZee\'s Cancelled Reservation report? Print it again at full size and try once more.');
      this.rows = markRaw(rep.rows);
      this.m = { stated: rep.stated, read: rep.rows.length };
      this.parts = this.split(rep.rows, r => codeOfRes(r.resNo));
      this.note = `${rep.rows.length} cancelled reservations read, ${plural(this.parts.length, 'property', 'properties')}${rep.from ? `, cancelled ${rep.from} – ${rep.to}` : ''}`;
    },

    async checkCancel(part) {
      const p = part.prop, rows = part.rows;
      const found = new Map();
      const take = snap => snap.docs.forEach(d => found.set(d.id, { id: d.id, ...d.data() }));
      for (const n of chunks([...new Set(rows.map(r => r.resNo))], 30)) take(await getDocs(query(collection(db, 'bookings'), where('propertyId', '==', p.id), where('reservationNo', 'in', n))));
      // A number read wrong: its folio number may still find the booking (listed to check, never cancelled on its own)
      const lost = rows.filter(r => r.folioNo && ![...found.values()].some(b => b.reservationNo === r.resNo)).map(r => r.folioNo);
      for (const n of chunks([...new Set(lost)], 30)) take(await getDocs(query(collection(db, 'bookings'), where('propertyId', '==', p.id), where('folioNo', 'in', n))));
      const bookings = [...found.values()];
      await Promise.all(bookings.map(async b => {
        try { const s = await getDoc(doc(db, 'bookings', b.id, 'private', 'main')); b.guestName = s.exists() ? s.data().guestName || '' : ''; } catch { b.guestName = ''; }
      }));
      const doneBy = {};
      for (const m of [...new Set(bookings.map(b => b.departureMonth).filter(Boolean))]) doneBy[m] = await completedUnitIds(p.id, m);
      const out = matchCancellations(rows, bookings, { done: b => !!doneBy[b.departureMonth]?.has(b.unitId), today: today() });
      out.check.forEach(x => { x.go = false; });
      // 24 Nov 2026: the booking made in the PMS for each reservation (offlineBookings with this eZee reservation no., made from
      // Bulk Upload > New bookings or keyed in by hand). It is what Portfolio > Bookings lists, so it is cancelled too.
      const offBy = new Map();
      for (const n of chunks([...new Set(rows.map(r => r.resNo))], 30)) {
        const snap = await getDocs(query(collection(db, 'offlineBookings'), where('propertyId', '==', p.id), where('ezeeReservationNo', 'in', n)));
        snap.docs.forEach(d => { const o = { id: d.id, ...d.data() }; if (o.status === 'cancelled') return; if (!offBy.has(o.ezeeReservationNo)) offBy.set(o.ezeeReservationNo, []); offBy.get(o.ezeeReservationNo).push(o); });
      }
      for (const x of [...out.cancel, ...out.check, ...out.blocked]) x.offline = offBy.get(x.booking?.reservationNo || x.row.resNo) || [];
      // Already cancelled for Accounting (or never uploaded there), but still active in Portfolio > Bookings: its own group
      out.offOnly = [];
      const seen = new Set();
      out.nothing = out.nothing.filter(x => {
        const o = (offBy.get(x.row.resNo) || []).filter(v => !seen.has(v.id));
        if (!o.length) return true;
        o.forEach(v => seen.add(v.id));
        out.offOnly.push({ row: x.row, booking: x.booking, offline: o, go: true,
          why: x.booking ? 'Already cancelled for Accounting, but the booking in Portfolio › Bookings is still active.' : 'Only in Portfolio › Bookings (not uploaded from eZee).' });
        return false;
      });
      part.c = out;
    },

    async saveCancel() {
      const parts = this.ready, total = this.count;
      this.confirming = false; this.busy = true; this.busyNote = `Cancelling ${total} bookings…`; this.percent = 5;
      try {
        const batchRef = doc(collection(db, 'importBatches'));
        let done = 0;
        for (const pt of parts) {
          for (const part of chunks(pt.list, CHUNK)) {
            const b = writeBatch(db), dirty = new Map();
            for (const x of part) {
              const bk = x.booking, row = x.row;
              // rawHash cleared: the next Upload eZee report of that month writes each booking again as eZee has it (the undo)
              b.set(doc(db, 'bookings', bk.id), { status: 'cancelled', rawHash: null, cancel: { date: row.cancelDate || null, by: row.cancelledBy || '', remark: row.remark || '',
                source: 'eZee Cancelled Reservation report', file: this.fileName, batchId: batchRef.id, at: serverTimestamp(), byUid: me.user.uid, byName: me.name,
                checked: !!x.why }, lastImportedAt: serverTimestamp() }, { merge: true });
              const k = bk.departureMonth;
              if (k) { if (!dirty.has(k)) dirty.set(k, []); dirty.get(k).push(bk.unitId || null); }
            }
            for (const [m, ids] of dirty) markDirty(b, pt.prop.id, m, ids);
            await b.commit();
            done += part.length; this.percent = Math.round(5 + 85 * done / total);
          }
        }
        // 24 Nov 2026: their bookings in Portfolio > Bookings (offline bookings), the same way as Cancel booking in the booking drawer
        let offDone = 0;
        for (const pt of parts) for (const list of chunks(pt.offs, 200)) {
          const ob = writeBatch(db);
          for (const o of list) {
            ob.update(doc(db, 'offlineBookings', o.id), { status: 'cancelled', cancelledReason: `Cancelled in eZee (${o.ezeeReservationNo}), ${this.fileName}`.slice(0, 300),
              cancelledAt: serverTimestamp(), cancelledBy: me.user.uid, updatedAt: serverTimestamp(), updatedBy: me.user.uid });
            audit(ob, me, { action: 'offlineBooking.cancel', entity: `offlineBookings/${o.id}`, propertyId: o.propertyId || pt.prop.id,
              changes: [{ field: 'status', old: o.status || 'active', new: 'cancelled' }], reason: `eZee ${o.ezeeReservationNo} cancelled (${this.fileName})` });
          }
          await ob.commit(); offDone += list.length;
        }
        const b = writeBatch(db), pids = parts.map(p => p.prop.id);
        const all = parts.flatMap(p => p.list);
        const leftToCheck = this.parts.reduce((t, p) => t + (p.c ? p.c.check.filter(x => !x.go).length : 0), 0);
        b.set(batchRef, { kind: 'ezeeCancel', fileName: this.fileName, filePath: null, months: [...new Set(all.map(x => x.booking.departureMonth).filter(Boolean))].sort(),
          propertyIds: pids, states: await statesFor(pids),
          counts: { read: this.m.read, stated: this.m.stated, cancelled: total, fromCheckFirst: this.fromCheck, leftToCheck,
            offlineCancelled: offDone, perProperty: Object.fromEntries(parts.map(p => [p.prop.id, p.list.length])) }, result: 'ok',
          uploadedBy: me.user.uid, uploadedByName: me.name, uploadedAt: serverTimestamp() });
        for (const pt of parts) audit(b, me, { action: 'ezee.bulkCancel', entity: `importBatches/${batchRef.id}`, propertyId: pt.prop.id,
          changes: pt.list.slice(0, 200).map(x => ({ field: x.booking.id, old: `active · ${x.booking.unitCode || ''} · ${x.booking.arrival} – ${x.booking.departure} · RM ${amt(x.booking.totalInclTax)}`,
            new: `cancelled ${x.row.cancelDate || ''}${x.why ? ' (checked by hand)' : ''}` })), reason: this.fileName });
        await b.commit(); clearCache();
        this.doneMsg = `Cancelled ${all.length} eZee ${all.length === 1 ? 'booking' : 'bookings'}${offDone ? ` and ${offDone} in Portfolio › Bookings` : ''}: ${parts.map(p => `${p.label} ${p.list.length + p.offOnly.length}`).join(' · ')}.${leftToCheck ? ` ${leftToCheck} left to check by hand.` : ''}`;
        this.checked = false;
      } catch (e) { this.error = e.code ? friendlyError(e, 'cancel the bookings') : e.message; }
      this.busy = false; this.percent = 0;
    }
  }
};
</script>

<style scoped>
.bz-hint { margin: 0 0 14px; font-size: 13px; }
/* One tab per property in the file: scrolls sideways inside itself when there are many */
.bz-tabs { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; margin-bottom: 16px; scrollbar-width: thin; }
.bz-tab { flex: none; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; text-align: left; padding: 10px 14px; min-width: 150px; max-width: 260px;
  border: 1.5px solid var(--border); border-radius: var(--radius); background: var(--surface); color: var(--text); font: inherit; cursor: pointer; position: relative; }
.bz-tab b { font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.bz-tab small { font-size: 12px; color: var(--muted); white-space: nowrap; }
.bz-tab:hover { border-color: var(--accent); }
.bz-tab.on { border-color: var(--accent); background: var(--accent-soft); }
.bz-tab.warn::after { content: ''; position: absolute; top: 8px; right: 8px; width: 8px; height: 8px; border-radius: 50%; background: var(--danger); }
.bz-ask-row { display: flex; gap: 10px; flex-wrap: wrap; } .bz-ask-row .input { flex: 1 1 220px; min-width: 0; }
.bz-file { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin: 16px 0; }
.bz-kpis { grid-template-columns: repeat(auto-fit, minmax(min(170px, 100%), 1fr)); }
.bz-group { border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); margin-bottom: 16px; overflow: hidden; }
.bz-group > header { display: flex; justify-content: space-between; gap: 8px 16px; flex-wrap: wrap; align-items: baseline; padding: 12px 16px; font-size: 13px; }
.bz-group > header span { color: var(--text-2); }
.bz-group.red > header { background: var(--red-soft); } .bz-group.blue > header { background: var(--blue-soft); }
.bz-group.amber > header { background: var(--amber-soft); } .bz-group.green > header { background: var(--green-soft); } .bz-group.grey > header { background: var(--chip); }
.bz-group .table-wrap { border: 0; border-radius: 0; }
.bz-more { margin: 8px 16px 14px; }
.bz-seg { display: inline-flex; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.bz-seg button { border: 0; background: var(--surface); padding: 6px 10px; font: inherit; font-size: 12px; font-weight: 600; color: var(--text-2); cursor: pointer; min-height: 32px; white-space: nowrap; }
.bz-seg button.on { background: var(--accent); color: #fff; }
.bz-seg button.on.danger { background: var(--danger); }
.bz-foot { position: sticky; bottom: 0; display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; padding: 12px 0; background: var(--bg); }
.bz-bar { height: 6px; border-radius: 3px; background: var(--chip); margin-top: 10px; overflow: hidden; } .bz-bar span { display: block; height: 100%; background: var(--accent); transition: width .3s; }
.bz-modal { max-width: 620px; }
.bz-done-where { margin-top: 6px; } .bz-done-links { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.bz-with { color: var(--red); font-size: 12.5px; margin-top: 2px; }
.bz-cmp-table td { vertical-align: top; } .bz-fl { color: var(--muted); white-space: nowrap; }
.bz-in { min-width: 140px; padding: 6px 8px; } .bz-was { font-size: 12px; color: var(--muted); margin-top: 3px; }
.bz-clashes { display: grid; gap: 8px; margin-bottom: 12px; }
.bz-clashes .bz-rec { border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; margin: 0; } .bz-clashes .bz-rec + .bz-rec { border-top: 1px solid var(--border); padding-top: 10px; }
@media (max-width: 600px) { .bz-in { width: 100%; min-width: 0; } }
.bz-click { cursor: pointer; } .bz-click:hover td { background: var(--hover); }
.bz-cmp-btn { display: block; margin-top: 6px; font-size: 12.5px; }
.bz-edited { margin-left: 6px; font-size: 11px; } .bz-ok { color: var(--green); font-size: 12.5px; font-weight: 600; margin-top: 2px; }
.bz-cmp-modal { max-width: 860px; width: 100%; }
.bz-cmp { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; }
.bz-cmp h3 { font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); margin: 0 0 10px; }
.bz-cmp-col { border: 1px solid var(--border); border-radius: var(--radius); padding: 14px; min-width: 0; }
.bz-cmp-col.new { border-color: var(--accent); background: var(--accent-soft); }
.bz-rec + .bz-rec { border-top: 1px solid var(--border); margin-top: 12px; padding-top: 12px; }
.bz-rec-head { display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 6px; }
.bz-cmp dl { margin: 0; } .bz-cmp dl > div { display: flex; justify-content: space-between; gap: 12px; padding: 4px 0; font-size: 14px; }
.bz-cmp dt { color: var(--muted); } .bz-cmp dd { margin: 0; text-align: right; min-width: 0; overflow-wrap: anywhere; }
.bz-cmp .field { margin-bottom: 10px; }
.bz-cmp-dates { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 10px; }
@media (max-width: 700px) { .bz-cmp, .bz-cmp-dates { grid-template-columns: minmax(0, 1fr); } }
/* Phone cards: each cell's label above its lines (cells here hold two or three lines) */
@media (max-width: 600px) {
  .bz-group table.table td { display: block; text-align: left; }
  .bz-group table.table td::before { display: block; max-width: none; margin-bottom: 2px; }
  .bz-group table.table td .bz-seg { margin-top: 4px; }
}
.bz-sum > div { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; border-top: 1px solid var(--border); font-size: 14px; }
.bz-tick { display: flex; gap: 10px; align-items: flex-start; margin-top: 14px; font-size: 14px; } .bz-tick input { margin-top: 3px; }
.bz-type-label { display: block; font-weight: 600; margin: 14px 0 6px; }
.bz-small { font-size: 12.5px; margin: 8px 0 0; }
/* 24 Nov 2026: the New booking form in a wide popup */
.bz-form-modal { max-width: 1100px; width: 100%; max-height: calc(100vh - 40px); overflow-y: auto; }
.bz-form-acts { display: flex; gap: 8px; }
/* Pending confirm to add: the tag on one line, then who / room / status, then Edit and Remove side by side */
.bz-stage { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; min-width: 190px; }
.bz-pill { white-space: nowrap; }
.bz-stage-meta { font-size: 12.5px; color: var(--muted); line-height: 1.35; }
.bz-stage-acts { display: flex; gap: 14px; font-size: 12.5px; }
.bz-stage-acts .link { font-weight: 600; }
.bz-form-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 12px; position: sticky; top: -1px; background: var(--surface); padding: 4px 0 8px; z-index: 5; }
/* Monthly check: the months the file holds in full */
.bz-months { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: -4px 0 16px; padding: 12px 14px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); }
.bz-months-label { font-size: 13px; font-weight: 600; }
.bz-months .chip { border: 1.5px solid var(--border); background: var(--surface); border-radius: 999px; padding: 5px 12px; font: inherit; font-size: 13px; cursor: pointer; color: var(--text-2); }
.bz-months .chip.on { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); font-weight: 600; }
.bz-months .bz-small { margin: 0; flex-basis: 100%; }
</style>
