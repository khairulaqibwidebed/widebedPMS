<template>
  <main class="content">
    <div class="loading-bar" v-show="loading || busy"></div>
    <div class="notice ok" v-show="okMsg">{{ okMsg }}</div>
    <div class="notice error" v-show="error">{{ error }}</div>

    <!-- List (Figma 254:6983) -->
    <template v-if="view === 'list'">
      <div>
        <div class="page-head">
          <div>
            <h1>Offline inquiries</h1>
            <div class="sub">{{ canAssign ? 'Log offline inquiries and assign each one to an Operations member to follow up.' : 'Log offline inquiries. A Director assigns each one to an Operations member to follow up.' }}</div>
          </div>
        </div>
        <div class="pills-row" style="margin-bottom:16px">
        <OptionPicker v-model="filter" :options="FILTERS.map(f => ({ value: f.key, label: `${f.label} · ${count(f.key)}` }))" label="Status" />
        <button class="btn btn-primary" v-if="canLog" @click="go('new')">+ Log inquiry</button>
        </div>
        <section class="card">
          <Paged :items="shown()" v-slot="{ pageRows }">
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th>Inquiry</th><th>Name</th><th>Looking for</th><th>Source</th><th>Assigned to</th><th>Status</th><th>Updated</th><th></th></tr></thead>
              <tbody>
                <template v-for="ld in pageRows" :key="ld.id">
                  <tr>
                    <td>{{ ld.id }}</td>
                    <td>
                      <span v-if="canSeeContact(ld)">{{ ld.contactName || '—' }}</span>
                      <span v-else class="masked">Hidden</span>
                      <div class="ten-id" v-if="ld.tenantId">{{ ld.tenantId }}</div>
                    </td>
                    <td>{{ ld.lookingFor }}</td>
                    <td>{{ ld.source }}</td>
                    <td>
                      <template v-if="!ld.assignedTo && canAssign">
                        <select class="select assign-sel" aria-label="Assign to" @change="assign(ld, $event.target.value)" :disabled="busy">
                          <option value="">{{ staff.length ? 'Choose staff' : 'No Operations staff yet' }}</option>
                          <template v-for="s in staff" :key="s.uid"><option :value="s.uid">{{ s.name }}</option></template>
                        </select>
                      </template>
                      <span v-show="ld.assignedTo">{{ ld.assignedTo }}</span>
                      <span class="muted" v-show="!ld.assignedTo && !canAssign">Waiting for a Director</span>
                    </td>
                    <td><span class="pill" :class="STATUS[ld.status][1]">{{ STATUS[ld.status][0] }}</span></td>
                    <td>{{ short(ld.updated) }}</td>
                    <td class="num"><button class="editlink" @click="go('lead', ld.id)">{{ ld.assignedTo || !canAssign ? 'View' : 'Assign' }}</button></td>
                  </tr>
                </template>
                <tr v-show="!loading && !shown().length"><td colspan="8" class="muted">No inquiries here.</td></tr>
              </tbody>
            </table>
          </div>
          </Paged>
        </section>
        <p class="page-note">Names and contact details are shown only to the staff member who logged the inquiry, the assigned staff member, Finance and the Directors.</p>
      </div>
    </template>

    <!-- Log inquiry (Figma 254:7235) -->
    <template v-if="view === 'new'">
      <div>
        <button class="back" @click="go('list')">← Back to Offline inquiries</button>
        <div class="page-head">
          <div>
            <h1>Log inquiry</h1>
            <div class="sub">{{ canAssign ? 'Record an offline inquiry and assign it to an Operations member to follow up.' : 'Record an offline inquiry. A Director assigns it to an Operations member.' }}</div>
          </div>
          <div class="head-tools">
            <button class="btn info-btn" type="button" @click="nextOpen = true" aria-label="What happens next" title="What happens next">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
            </button>
            <button class="btn" @click="go('list')">Cancel</button>
            <button class="btn btn-primary" @click="saveNew()" :disabled="busy">{{ canAssign ? 'Save and assign' : 'Save' }}</button>
          </div>
        </div>
        <div class="notice error" v-show="formError">{{ formError }}</div>
        <div>
          <div class="form-card">
            <section class="card">
              <h2>Inquiry</h2>
              <div class="grid-fields">
                <div class="field"><label for="lLooking">Looking for</label><input class="input" id="lLooking" v-model="form.lookingFor" placeholder="e.g. Monthly rental, 2 bedrooms, Ampang"></div>
                <div class="field"><label for="lSource">Source</label>
                  <OptionPicker class="fld-pick" v-model="form.source" :options="SOURCES.map(x => ({ value: x, label: x }))" label="Source" /></div>
                <div class="field"><label for="lBudget">Budget</label><input class="input" id="lBudget" v-model="form.budget" placeholder="e.g. RM 2,200 a month"></div>
                <div class="field"><label for="lView">Preferred viewing</label><input class="input" id="lView" type="date" v-model="form.viewing"></div>
              </div>
            </section>
            <section class="card">
              <h2>Customer</h2>
              <div class="grid-fields">
                <div class="field"><label for="lName">Name</label><input class="input" id="lName" v-model="form.contactName" placeholder="e.g. Prospect A"></div>
                <div class="field"><label for="lPhone">Phone</label><input class="input" id="lPhone" v-model="form.phone" inputmode="tel" placeholder="e.g. 012-345 6789"></div>
                <div class="field"><label for="lEmail">Email (optional)</label><input class="input" id="lEmail" type="email" v-model="form.email" placeholder="e.g. name@example.com"></div>
              </div>
              <p class="help" v-if="known">{{ `This phone number belongs to existing tenant ${known.id}. The inquiry will be linked to them.` }}</p>
            </section>
            <section class="card" v-if="canAssign">
              <h2>Assign to</h2>
              <div class="field" style="max-width:340px;margin:0"><label for="lAssign">Operations member</label>
                <OptionPicker class="fld-pick" v-model="form.assignedTo" :options="[{ value: '', label: 'Assign later' }, ...staff.map(x => ({ value: x.uid, label: x.name }))]" label="Operations member" />
                <span class="help" v-show="!staff.length">No Operations staff yet. Save it unassigned and assign it later.</span></div>
            </section>
            <section class="card">
              <h2>Status (optional)</h2>
              <div class="status-opts">
                <template v-for="k in PICKABLE" :key="k">
                  <button type="button" class="status-opt" :class="{ on: form.status === k }" @click="form.status = form.status === k ? 'new' : k">{{ STATUS[k][0] }}</button>
                </template>
              </div>
            </section>
            <section class="card">
              <h2>Note</h2>
              <textarea class="input" style="height:80px" v-model="form.note" placeholder="e.g. Walked in, wants to view this weekend" aria-label="Note"></textarea>
            </section>
          </div>
        </div>
      </div>
    <div class="modal-back" v-if="nextOpen" @click.self="nextOpen = false" v-esc="() => { nextOpen = false }">
      <div class="modal" role="dialog" aria-label="What happens next" style="max-width:520px;width:calc(100% - 32px)">
        <h2>What happens next</h2>
        <div class="next-list">
          <p v-if="!canAssign">- A Director assigns it to an Operations member.</p>
          <p>- The assigned Operations member sees the inquiry in their Offline inquiries list.</p>
          <p>- They update the status after each follow-up, from a computer or phone.</p>
          <p>- When the customer pays, Create booking saves them as a tenant and makes the booking.</p>
        </div>
        <div class="modal-foot"><button class="btn" @click="nextOpen = false">Close</button></div>
      </div>
    </div>
    </template>

    <!-- One inquiry -->
    <template v-if="view === 'lead' && lead">
      <div>
        <button class="back" @click="go('list')">← Back to Offline inquiries</button>
        <div class="page-head">
          <div>
            <h1>{{ `${lead.id} · ${lead.lookingFor}` }}</h1>
            <div class="sub">{{ `${lead.source} · logged by ${lead.loggedBy} on ${short(lead.created)}` }}</div>
          </div>
          <div class="head-tools">
            <span class="pill" :class="STATUS[lead.status][1]">{{ STATUS[lead.status][0] }}</span>
            <button class="btn btn-primary" v-if="canBook(lead)" @click="go('book', lead.id)">Create booking</button>
          </div>
        </div>
        <div class="side-grid">
          <div class="form-card">
            <section class="card" v-if="booking">
              <div class="card-head"><h2>Booking</h2><span class="muted">{{ booking.id }}</span></div>
              <div class="kv"><span>Unit</span><span>{{ `${booking.propertyName} · ${booking.unitCode}` }}</span></div>
              <div class="kv"><span>Stay</span><span>{{ `${full(booking.arrival)} to ${full(booking.departure)} · ${booking.nights} nights` }}</span></div>
              <div class="kv"><span>Type</span><span>{{ booking.longTerm ? 'Long-term lease' : 'Short stay' }}</span></div>
              <template v-if="booking.longTerm">
                <div class="kv"><span>Monthly rent</span><span>{{ rm(booking.monthlyRent) }}</span></div>
                <div class="kv"><span>Deposit (2 months)</span><span>{{ rm(booking.deposit) }}</span></div>
              </template>
              <div class="kv" v-else><span>Total paid</span><span>{{ rm(booking.amount) }}</span></div>
              <div class="kv"><span>Payment reference</span><span>{{ booking.paymentRef || '—' }}</span></div>
              <div class="kv" v-if="booking.ezeeReservationNo"><span>eZee reservation no.</span><span>{{ booking.ezeeReservationNo }}</span></div>
              <div class="ezee-add" v-else>
                <label for="addEzee">eZee reservation no. (not added yet)</label>
                <div><input class="input" id="addEzee" v-model="ezeeAdd" placeholder="Once it is keyed into eZee"><button class="btn" @click="saveEzee()" :disabled="busy">Add</button></div>
              </div>
            </section>
            <section class="card">
              <div class="card-head"><h2>Update this inquiry</h2></div>
              <div class="field" style="max-width:340px"><label for="uAssign">Assigned to</label>
                <OptionPicker class="fld-pick" v-model="upd.assignedToUid" :disabled="!canAssign" :options="[{ value: '', label: canAssign && !staff.length ? 'No Operations staff yet' : 'Not assigned' }, ...(lead.assignedToUid && !staff.some(x => x.uid === lead.assignedToUid) ? [{ value: lead.assignedToUid, label: lead.assignedTo }] : []), ...staff.map(x => ({ value: x.uid, label: x.name }))]" label="Assigned to" /></div>
              <div class="field" v-if="lead.status !== 'booked'"><label>Status</label>
                <div class="status-opts">
                  <template v-for="k in PICKABLE" :key="k">
                    <button type="button" class="status-opt" :class="{ on: upd.status === k }" @click="upd.status = k">{{ STATUS[k][0] }}</button>
                  </template>
                </div></div>
              <div class="field"><label for="uNote">Follow-up note</label>
                <textarea class="input" id="uNote" v-model="upd.note" placeholder="e.g. Called back, viewing booked for Saturday"></textarea></div>
              <div class="notice error" v-show="formError && !editing">{{ formError }}</div>
              <div class="actions upd-actions"><button class="btn btn-primary" @click="saveUpdate()" :disabled="busy">Save update</button><button class="btn" v-if="updDirty" @click="discardUpdate()" :disabled="busy">Discard changes</button><span class="unsaved-note" v-show="updDirty">Unsaved changes</span></div>
            </section>
          </div>
          <section class="card">
            <div class="card-head">
              <h2>{{ tenant ? 'Tenant' : 'Customer' }}</h2>
              <button class="editlink" v-if="canEdit(lead) && !editing" @click="startEdit()">Edit</button>
            </div>
            <template v-if="canSeeContact(lead) && !editing">
              <div>
                <div class="kv" v-if="tenant"><span>Tenant ID</span><span>{{ tenant.id }}</span></div>
                <div class="kv"><span>Name</span><span>{{ who.name || '—' }}</span></div>
                <div class="kv"><span>Phone</span><span>{{ who.phone || '—' }}</span></div>
                <div class="kv"><span>Email</span><span class="wrap">{{ who.email || '—' }}</span></div>
                <template v-if="tenant">
                  <div class="kv"><span>IC / Passport</span><span>{{ tenant.icPassport || '—' }}</span></div>
                  <div class="kv"><span>Nationality</span><span>{{ tenant.nationality || '—' }}</span></div>
                  <div class="kv"><span>Stays</span><span>{{ tenantStays }}</span></div>
                </template>
              </div>
            </template>
            <template v-if="canSeeContact(lead) && editing">
              <div>
                <div class="field"><label for="eName">Name</label><input class="input" id="eName" v-model="edit.name"></div>
                <div class="field"><label for="ePhone">Phone</label><input class="input" id="ePhone" v-model="edit.phone" inputmode="tel"></div>
                <div class="field"><label for="eEmail">Email</label><input class="input" id="eEmail" type="email" v-model="edit.email"></div>
                <template v-if="tenant">
                  <div class="field"><label for="eIc">IC / Passport</label><input class="input" id="eIc" v-model="edit.icPassport"></div>
                  <div class="field"><label for="eNat">Nationality</label><input class="input" id="eNat" v-model="edit.nationality"></div>
                </template>
                <div class="notice error" v-show="formError">{{ formError }}</div>
                <div class="actions"><button class="btn" @click="editing = false; formError = ''">Cancel</button><button class="btn btn-primary" @click="saveEdit()" :disabled="busy">Save details</button></div>
              </div>
            </template>
            <template v-if="!canSeeContact(lead)">
              <div>
                <div class="kv"><span>Name</span><span class="masked">Hidden</span></div>
                <div class="kv"><span>Phone</span><span class="masked">Hidden</span></div>
                <div class="kv"><span>Email</span><span class="masked">Hidden</span></div>
                <p class="help">Only the staff member who logged it, the assigned staff member, Finance and the Directors see contact details.</p>
              </div>
            </template>
            <div class="kv"><span>Budget</span><span>{{ lead.budget || '—' }}</span></div>
            <div class="kv"><span>Preferred viewing</span><span>{{ lead.viewing ? short(lead.viewing) : '—' }}</span></div>
            <button class="btn" style="width:100%;margin-top:12px" @click="histOpen = true">{{ `History (${lead.history.length})` }}</button>
          </section>
        </div>
      </div>
    </template>

    <div class="modal-back" v-if="histOpen && lead" @click.self="histOpen = false" v-esc="() => { histOpen = false }">
      <div class="modal" role="dialog" aria-label="History" style="max-width:560px;width:calc(100% - 32px)">
        <h2>{{ `${lead.id} · History` }}</h2>
        <div class="hist" style="max-height:60vh;overflow:auto">
          <template v-for="(h, i) in lead.history.slice().reverse()" :key="i">
            <div><small>{{ `${stamp(h.at)} · ${h.by}` }}</small><span>{{ h.text }}</span></div>
          </template>
        </div>
        <div class="modal-foot"><button class="btn" @click="histOpen = false">Close</button></div>
      </div>
    </div>

    <!-- Create booking -->
    <template v-if="view === 'book' && (lead || direct)">
      <div>
        <button class="back" v-if="!embedded" @click="bookBack()">{{ direct ? '← Back to Booking Forms' : `← Back to ${lead.id}` }}</button>
        <div class="page-head">
          <div>
            <h1 v-if="!embedded">{{ direct ? 'New booking' : 'Create booking' }}</h1>
            <div class="sub">{{ direct ? 'A booking without an inquiry, e.g. a walk-in or a returning tenant. Saving saves the customer as a tenant.'
              : `From ${lead.id} · ${lead.lookingFor}. Saving marks the inquiry as paid and saves the customer as a tenant.` }}</div>
          </div>
          <div class="head-tools" v-if="!embedded">
            <button class="btn" @click="bookBack()">Cancel</button>
            <button class="btn btn-primary" @click="saveBooking()" :disabled="busy">Save booking</button>
          </div>
        </div>
        <div class="notice error" v-show="formError">{{ formError }}</div>
        <div :class="{ 'side-grid': !embedded }">
          <div class="form-card">
            <section class="card">
              <h2>Tenant</h2>
              <p class="help" v-if="bk.existing">{{ `Existing tenant ${bk.existing.id} has this phone number. Their details are filled in below and the booking will be added to their record.` }}</p>
              <div class="grid-fields">
                <div class="field"><label for="bName">Name</label><input class="input" id="bName" v-model="bk.name"></div>
                <div class="field"><label for="bPhone">Phone</label><input class="input" id="bPhone" v-model="bk.phone" inputmode="tel" @change="refill(true)"></div>
                <div class="field"><label for="bEmail">Email</label><input class="input" id="bEmail" type="email" v-model="bk.email"></div>
                <div class="field"><label for="bIc">IC / Passport</label><input class="input" id="bIc" v-model="bk.icPassport"></div>
                <div class="field"><label for="bNat">Nationality</label><input class="input" id="bNat" v-model="bk.nationality" placeholder="e.g. Malaysian"></div>
                <div class="field"><label for="bDob">Date of birth</label><input class="input" id="bDob" type="date" v-model="bk.dob"></div>
                <div class="field"><label for="bGender">Gender</label>
                  <OptionPicker class="fld-pick" v-model="bk.gender" :options="GENDERS" label="Gender" /></div>
                <div class="field" v-if="bk.gender === 'Other'"><label for="bGenderOther">If other, type</label><input class="input" id="bGenderOther" v-model="bk.genderOther"></div>
              </div>
            </section>
            <section class="card" v-for="(c, ci) in bk.coTenants" :key="c.key">
              <div class="card-head"><h2>{{ `Tenant ${ci + 2}` }}</h2><button type="button" class="btn" @click="bk.coTenants.splice(ci, 1)">Remove</button></div>
              <div class="grid-fields">
                <div class="field"><label :for="'cName' + ci">Name</label><input class="input" :id="'cName' + ci" v-model="c.name"></div>
                <div class="field"><label :for="'cPhone' + ci">Phone</label><input class="input" :id="'cPhone' + ci" v-model="c.phone" inputmode="tel"></div>
                <div class="field"><label :for="'cEmail' + ci">Email</label><input class="input" :id="'cEmail' + ci" type="email" v-model="c.email"></div>
                <div class="field"><label :for="'cIc' + ci">IC / Passport</label><input class="input" :id="'cIc' + ci" v-model="c.icPassport"></div>
                <div class="field"><label :for="'cNat' + ci">Nationality</label><input class="input" :id="'cNat' + ci" v-model="c.nationality"></div>
                <div class="field"><label :for="'cDob' + ci">Date of birth</label><input class="input" :id="'cDob' + ci" type="date" v-model="c.dob"></div>
                <div class="field"><label>Gender</label><OptionPicker class="fld-pick" v-model="c.gender" :options="GENDERS" :label="`Gender of tenant ${ci + 2}`" /></div>
                <div class="field" v-if="c.gender === 'Other'"><label :for="'cGo' + ci">If other, type</label><input class="input" :id="'cGo' + ci" v-model="c.genderOther"></div>
              </div>
            </section>
            <div><button type="button" class="btn" @click="addCoTenant()">+ Add another tenant</button></div>
            <section class="card">
              <h2>Stay</h2>
              <div class="grid-fields">
                <div class="field"><label for="bProp">Property</label>
                  <OptionPicker class="fld-pick" v-model="bk.propertyId" :options="[{ value: '', label: 'Choose property' }, ...properties.map(x => ({ value: x.id, label: x.name }))]" label="Property" @change="loadUnitList()" /></div>
                <div class="field"><label for="bUnit">Unit</label>
                  <OptionPicker class="fld-pick" v-model="bk.unitId" :disabled="!bk.propertyId" :options="[{ value: '', label: bk.propertyId && !units.length ? 'No units found' : 'Choose unit' }, ...units.map(x => ({ value: x.unitCode, label: x.unitCode }))]" label="Unit" /></div>
                <div class="field"><label for="bIn">Check-in</label><input class="input" id="bIn" type="date" v-model="bk.arrival"></div>
                <div class="field"><label for="bOut">Check-out</label><input class="input" id="bOut" type="date" v-model="bk.departure"></div>
              </div>
              <p class="help" v-if="nights > 0">{{ `${nights} night${nights === 1 ? '' : 's'} · ${longTerm ? 'Long-term lease (30 nights or more)' : 'Short stay (29 nights or less)'}` }}</p>
            </section>
            <section class="card">
              <h2>Booking details</h2>
              <div class="grid-fields">
                <div class="field"><label>Booking source</label><OptionPicker class="fld-pick" v-model="bk.bookingSource" :options="SOURCES_BK" label="Booking source" /></div>
                <div class="field"><label>Rental status</label><OptionPicker class="fld-pick" v-model="bk.rentalStatus" :options="RENTAL_STATUSES" label="Rental status" /></div>
                <div class="field"><label for="bRentType">Type of rent</label>
                  <OptionPicker class="fld-pick" v-model="bk.rentType" :options="RENT_TYPES" label="Type of rent" /></div>
                <div class="field" v-if="longTerm"><label for="bRent">Rental (RM)</label><input class="input" id="bRent" type="number" min="0" step="0.01" v-model="bk.monthlyRent"></div>
                <div class="field" v-else><label for="bRental">Rental (RM)</label><input class="input" id="bRental" type="number" min="0" step="0.01" v-model="bk.rental"></div>
                <div class="field" v-if="longTerm"><label>Security deposit (2 months, required)</label><div class="input readonly">{{ rm(deposit) }}</div></div>
                <div class="field" v-else><label for="bSec">Security deposit (RM)</label><input class="input" id="bSec" type="number" min="0" step="0.01" v-model="bk.securityDeposit"></div>
                <div class="field" v-for="f in FEES" :key="f.key"><label :for="'bf' + f.key">{{ f.label }} (RM)</label><input class="input" :id="'bf' + f.key" type="number" min="0" step="0.01" v-model="bk[f.key]"></div>
                <div class="field" v-if="+bk.othersFee > 0"><label for="bOthersNote">Others: what is it for?</label><input class="input" id="bOthersNote" v-model="bk.othersNote"></div>
              </div>
            </section>
            <section class="card">
              <h2>Payment details</h2>
              <div class="grid-fields">
                <div class="field"><label for="bAmt">{{ longTerm ? 'Amount paid (RM, optional)' : 'Amount (RM)' }}</label><input class="input" id="bAmt" type="number" min="0" step="0.01" v-model="bk.amount"></div>
                <div class="field"><label for="bMode">Mode of payment</label>
                  <OptionPicker class="fld-pick" v-model="bk.payMode" :options="PAY_MODES" label="Mode of payment" /></div>
                <div class="field"><label for="bPayDate">Date</label><input class="input" id="bPayDate" type="date" v-model="bk.payDate"></div>
                <div class="field"><label for="bRef">Reference numbers</label><input class="input" id="bRef" v-model="bk.paymentRef" placeholder="e.g. bank transfer ref or receipt no."></div>
                <div class="field"><label for="bEzee">eZee reservation no. (optional)</label><input class="input" id="bEzee" v-model="bk.ezeeNo" placeholder="Add once it is keyed into eZee"></div>
              </div>
              <div class="field" style="margin-top:12px"><label for="bNote">Remarks</label>
                <textarea class="input" id="bNote" style="height:70px" v-model="bk.note" placeholder="e.g. Paid in full by bank transfer"></textarea></div>
            </section>
            <section class="card">
              <h2>Door access and passcodes</h2>
              <div class="grid-fields">
                <div class="field"><label for="bPass">Main door passcode <span class="muted">(optional)</span></label><input class="input" id="bPass" v-model="bk.mainPasscode" autocomplete="off"></div>
                <div class="field"><label for="bExp">Current expiry date <span class="muted">(optional)</span></label><input class="input" id="bExp" type="date" v-model="bk.currentExpiry"></div>
                <div class="field"><label for="bNextPass">Next door passcode <span class="muted">(optional)</span></label><input class="input" id="bNextPass" v-model="bk.nextPasscode" autocomplete="off"></div>
                <div class="field"><label for="bNextExp">Next expiry date <span class="muted">(optional)</span></label><input class="input" id="bNextExp" type="date" v-model="bk.nextExpiry"></div>
              </div>
            </section>
            <div class="bottom-actions">
              <button class="btn" @click="bookBack()">Cancel</button>
              <button class="btn btn-primary" @click="saveBooking()" :disabled="busy">Save booking</button>
            </div>
          </div>
          <section class="card next-list" v-if="!embedded">
            <div class="card-head"><h2>When you save</h2></div>
            <p>{{ bk.existing ? `- The booking is added to tenant ${bk.existing.id}.` : '- The customer is saved as a new tenant.' }}</p>
            <p v-if="direct">- The booking gets the next number, offline_BK-0001 and up, and shows under Portfolio > Bookings.</p>
            <template v-else>
              <p>{{ `- The booking is saved as offline_${lead.id}, so it can't be made twice.` }}</p>
              <p>{{ `- ${lead.id} is marked Paid · Booked.` }}</p>
            </template>
            <p v-if="longTerm">- The lease starts on the check-in date and the rent cycle follows it.</p>
            <p><b>- Key this booking into eZee to block the room.</b> Month-end pays the owner from the eZee booking; this copy keeps the tenant's history and is never counted twice.</p>
          </section>
        </div>
      </div>
    </template>
  </main>
</template>

<script>
// Offline inquiries in Firestore:
//   offlineInquiries/{LD-0001}            what they want, status, who logged it, who follows up, history
//   offlineInquiries/{id}/private/main    contact name, phone, phoneKey, email (PDPA: never on the parent)
//   tenants/{TEN-0001} + private/main     made by Create booking; a returning tenant is found by phoneKey
//   offlineBookings/{offline_LD-0001}     the stay. Not in bookings: month-end reads bookings and pays from eZee.
import { collection, collectionGroup, doc, getDoc, getDocs, query, where, orderBy, limit, writeBatch, runTransaction,
  arrayUnion, serverTimestamp, getCountFromServer } from 'firebase/firestore';
import { db } from '@/lib/firebase.js';
import { useSession } from '@/stores/session.js';
import OptionPicker from '@/components/OptionPicker.vue';
import { loadProperties, loadUnits, audit, friendlyError } from '@/lib/finance-data.js';
// Direct service connection matching Issues.vue
import { notifyRole, notifyUser } from '@/services/notificationService.js';

const me = useSession();

const STATUS = { new: ['New', 'blue'], interested: ['Interested (Pending payment)', 'green'], considering: ['Considering', 'amber'], uninterested: ['Uninterested', 'grey'],
  booked: ['Paid · Booked', 'accent'] };
const PICKABLE = ['interested', 'considering', 'uninterested'];   // Booked is set only by Create booking
const FILTERS = [{ key: 'all', label: 'All' }, { key: 'new', label: 'New' }, { key: 'interested', label: 'Interested (Pending payment)' },
  { key: 'considering', label: 'Considering' }, { key: 'uninterested', label: 'Uninterested' }, { key: 'booked', label: 'Booked' }];
const ASSIGNERS = ['director'];
const LOGGERS = ['director'];
const CONTACT_ALL = ['director', 'finance'];
const SEE_ALL = ['director', 'finance', 'it'];
const DIRECT_BOOKERS = ['director', 'finance', 'operations'];
const SOURCES = ['Walk-in', 'Phone call', 'WhatsApp', 'Referral', 'Agent', 'Other'];
const LONG_TERM_NIGHTS = 30;
const LIST_LIMIT = 500;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const localIso = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
const nowIso = () => localIso(new Date());
const isoOf = t => (t?.toDate ? localIso(t.toDate()) : typeof t === 'string' ? t : '');
const num = (prefix, n) => `${prefix}-${String(n).padStart(4, '0')}`;
const phoneKey = p => { const n = String(p || '').replace(/\D/g, ''); return n.startsWith('0') ? '6' + n : n; };
const searchWords = name => [...new Set(String(name || '').toLowerCase().split(/\s+/).filter(Boolean)
  .flatMap(w => Array.from({ length: Math.max(0, w.length - 1) }, (_, i) => w.slice(0, i + 2))))];
const GENDERS = ['Male', 'Female', 'Other'].map(x => ({ value: x, label: x })); GENDERS.unshift({ value: '', label: 'Not set' });
const SOURCES_BK = [{ value: '', label: 'Choose source…' }, ...['Offline', 'Website', 'Agent', 'OTA'].map(x => ({ value: x, label: x }))];
const RENTAL_STATUSES = [{ value: '', label: 'Choose status…' }, { value: 'Paid', label: 'Paid' }, { value: 'Unpaid', label: 'Unpaid' }];
const RENT_TYPES = ['Daily', 'Monthly', 'Yearly'].map(x => ({ value: x, label: x }));
const PAY_MODES = ['Bank transfer', 'Cash', 'Card', 'Online banking / QR', 'Cheque', 'Other'].map(x => ({ value: x, label: x })); PAY_MODES.unshift({ value: '', label: 'Choose mode' });
const FEES = [{ key: 'utilityDeposit', label: 'Utility deposit' }, { key: 'internetFee', label: 'Internet fees' }, { key: 'carparkFee', label: 'Carpark fees' },
  { key: 'cleaningFee', label: 'Cleaning fees' }, { key: 'taFee', label: 'Tenancy agreement fees' }, { key: 'taStampFee', label: 'Tenancy agreement stamping fees' }, { key: 'othersFee', label: 'Others' }];
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const toCents = v => Math.round((+v || 0) * 100) / 100;
const emailOk = e => !e || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const stop = msg => Object.assign(new Error(msg), { plain: true });
const errText = (e, what) => (e.plain ? e.message : friendlyError(e, what));
const piiChanges = fields => fields.map(f => ({ field: f, old: null, new: '(changed)' }));

async function findTenant(phone) {
  const k = phoneKey(phone);
  if (k.length < 9) return null;
  const snap = await getDocs(query(collectionGroup(db, 'private'), where('kind', '==', 'tenant'), where('phoneKey', '==', k), limit(5)));
  const hit = snap.docs.find(d => d.ref.path.startsWith('tenants/'));
  return hit ? { id: hit.ref.path.split('/')[1], ...hit.data() } : null;
}
const privateOf = async ref => { const s = await getDoc(doc(ref, 'private', 'main')); return s.exists() ? s.data() : {}; };

export default {
  components: { OptionPicker },
  data() {
    return {
      nextOpen: false, histOpen: false, STATUS, FILTERS, GENDERS, SOURCES_BK, RENTAL_STATUSES, RENT_TYPES, PAY_MODES, FEES, SOURCES, PICKABLE,
      leads: [], staff: [], tenant: null, booking: null, tenantStays: 0, known: null,
      view: 'list', lead: null, filter: 'all', okMsg: '', formError: '', error: '', loading: true, busy: false,
      direct: false, form: {}, upd: {}, ezeeAdd: '', editing: false, edit: {}, bk: {}, properties: [], units: []
    };
  },
  props: { embedded: { type: Boolean, default: false } },   // inside Operations > Booking Forms: only the new-booking form, no page navigation
  emits: ['close', 'saved'],
  async mounted() {
    if (this.embedded) { await this.show('direct'); this.loading = false; return; }
    const q = this.$route.query;
    if ('new' in q) await this.show('new');
    else if ('newBooking' in q) await this.show('direct');
    else if (q.id && 'book' in q) await this.show('book', q.id);
    else if (q.id) await this.show('lead', q.id);
    else { this.okMsg = history.state?.okMsg || ''; await this.show('list'); }
    this.loading = false;
  },
  watch: {
    'form.phone'(v) {
      clearTimeout(this.phoneTimer);
      this.phoneTimer = setTimeout(async () => {
        const t = await findTenant(v).catch(() => null);
        if (this.form.phone === v) this.known = t;
      }, 350);
    }
  },
  beforeUnmount() { clearTimeout(this.phoneTimer); },
  computed: {
    updDirty() { const l = this.lead, u = this.upd; return !!l && !!u && ((u.assignedToUid || '') !== (l.assignedToUid || '') || u.status !== l.status || !!(u.note || '').trim()); },
    canAssign() { return ASSIGNERS.includes(me.role); },
    canLog() { return LOGGERS.includes(me.role); },
    who() { const t = this.tenant, l = this.lead || {}; return t ? { name: t.name, phone: t.phone, email: t.email } : { name: l.contactName, phone: l.phone, email: l.email }; },
    nights() {
      const { arrival: a, departure: b } = this.bk;
      return a && b ? Math.round((Date.parse(b) - Date.parse(a)) / 86400000) : 0;
    },
    longTerm() { return this.nights >= LONG_TERM_NIGHTS; },
    deposit() { return toCents(this.bk.monthlyRent) * 2; }
  },
  methods: {
    discardUpdate() { const l = this.lead; this.upd = { assignedToUid: l.assignedToUid || '', status: l.status, note: '' }; this.formError = ''; },
    // Everyone who should hear about a new inquiry or a status change
    // (the roles must match NOTIFY_ROLES / the Firestore rules)
    inquiryRoles() { return ['finance', 'director', 'operations']; },

    // Shared notification helper structured cleanly like Issues.vue
    async notify({ title, message, roles = [], uids = [], refId = null, link = '/Notifications', skipSelf = true }) {
      const base = { title, message, link, type: 'inquiry', refId };
      const jobs = [];

      // Deduplicate roles and send
      const targetRoles = [...new Set(roles)].filter(Boolean);
      targetRoles.forEach(recipientRole => {
        jobs.push(notifyRole({ ...base, recipientRole }));
      });

      // Deduplicate UIDs and prevent self-notifications when specified
      const targetUids = [...new Set(uids)].filter(uid => uid && (!skipSelf || uid !== me.user.uid));
      targetUids.forEach(recipientUid => {
        jobs.push(notifyUser({ ...base, recipientUid }));
      });

      if (!jobs.length) return;
      const results = await Promise.allSettled(jobs);
      results.forEach(r => {
        if (r.status === 'rejected') console.error('Notification failed:', r.reason);
      });
    },

    go(view, id = null) {
      const query = view === 'new' ? { new: '1' } : view === 'lead' ? { id } : view === 'book' ? { id, book: '1' } : {};
      this.$router.push({ query, state: { okMsg: this.okMsg } });
    },
    async show(view, id) {
      this.formError = ''; this.editing = false;
      try {
        if (view === 'list') await Promise.all([this.loadList(), this.loadStaff()]);
        if (view === 'new') {
          if (!this.canLog) view = 'list';
          else {
            await this.loadStaff();
            this.form = { lookingFor: '', source: 'Walk-in', contactName: '', phone: '', email: '', budget: '', viewing: '', assignedTo: this.canAssign ? this.staff[0]?.uid || '' : '', status: 'new', note: '' };
          }
          if (view === 'list') await this.loadList();
        }
        if (view === 'direct') {
          if (DIRECT_BOOKERS.includes(me.role)) { this.direct = true; view = 'book'; await this.startBooking(); }
          else { view = 'list'; await Promise.all([this.loadList(), this.loadStaff()]); }
        }
        if (!this.direct && (view === 'lead' || view === 'book')) {
          await Promise.all([this.loadLead(id), this.loadStaff()]);
          if (!this.lead || (view === 'book' && !this.canBook(this.lead))) view = this.lead ? 'lead' : 'list';
          if (view === 'list') await this.loadList();
          if (view === 'lead') { this.upd = { assignedToUid: this.lead.assignedToUid || '', status: this.lead.status, note: '' }; this.okMsg = history.state?.okMsg || ''; }
          if (view === 'book') await this.startBooking();
        }
      } catch (e) { this.error = friendlyError(e, 'load the offline inquiries'); }
      this.view = view;
    },
    toLead(id, d) {
      return { id, ...d, assignedTo: d.assignedToName || '', loggedBy: d.loggedByName || '', created: isoOf(d.createdAt), updated: isoOf(d.updatedAt),
        history: d.history || [], contactName: '', phone: '', email: '' };
    },
    async loadList() {
      const col = collection(db, 'offlineInquiries');
      const snap = await getDocs(SEE_ALL.includes(me.role) ? query(col, orderBy('createdAt', 'desc'), limit(LIST_LIMIT))
        : query(col, where('assignedToUid', '==', me.user.uid), limit(LIST_LIMIT)));
      const leads = snap.docs.map(d => this.toLead(d.id, d.data()));
      const priv = await Promise.all(leads.map(ld => this.canSeeContact(ld) ? privateOf(doc(db, 'offlineInquiries', ld.id)).catch(() => ({})) : {}));
      leads.forEach((ld, i) => Object.assign(ld, priv[i]));
      this.leads = leads;
    },
    async loadStaff() {
      if (!this.canAssign || this.staff.length) return;
      const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'operations'), where('active', '==', true)));
      this.staff = snap.docs.map(d => ({ uid: d.id, name: d.data().displayName || d.data().email || d.id })).sort((a, b) => a.name.localeCompare(b.name));
    },
    async loadLead(id) {
      this.lead = null; this.tenant = null; this.booking = null; this.tenantStays = 0;
      const ref = doc(db, 'offlineInquiries', id);
      const snap = await getDoc(ref).catch(e => { if (e.code === 'permission-denied') return null; throw e; });
      if (!snap?.exists()) return;
      const ld = this.toLead(id, snap.data());
      const see = this.canSeeContact(ld);
      if (see) Object.assign(ld, await privateOf(ref));
      const [t, b] = await Promise.all([
        ld.tenantId ? getDoc(doc(db, 'tenants', ld.tenantId)).catch(() => null) : null,
        ld.bookingId ? getDoc(doc(db, 'offlineBookings', ld.bookingId)).catch(() => null) : null
      ]);
      if (t?.exists()) {
        this.tenant = { id: t.id, ...t.data(), ...(see ? await privateOf(doc(db, 'tenants', t.id)).catch(() => ({})) : {}) };
        this.tenantStays = await getCountFromServer(query(collection(db, 'offlineBookings'), where('tenantId', '==', t.id)))
          .then(c => c.data().count).catch(() => 0);
      }
      if (b?.exists()) this.booking = { id: b.id, ...b.data() };
      this.lead = ld;
    },
    count(k) { return this.leads.filter(x => k === 'all' || x.status === k).length; },
    shown() { return this.leads.filter(x => this.filter === 'all' || x.status === this.filter).sort((a, b) => b.id.localeCompare(a.id)); },
    short(iso) { if (!iso) return ''; const [, m, dd] = iso.slice(0, 10).split('-'); return `${+dd} ${MON[+m - 1]}`; },
    full(iso) { return iso ? `${this.short(iso)} ${iso.slice(0, 4)}` : ''; },
    stamp(iso) { return iso ? `${this.short(iso)}, ${iso.slice(11, 16)}` : ''; },
    rm(v) { return 'RM ' + (+v || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); },
    canSeeContact(ld) { return CONTACT_ALL.includes(me.role) || ld.loggedByUid === me.user.uid || ld.assignedToUid === me.user.uid; },
    canEdit(ld) { return this.canSeeContact(ld) && (!this.tenant || CONTACT_ALL.includes(me.role)); },
    canBook(ld) { return ld.status === 'interested' && !ld.bookingId && this.canSeeContact(ld); },
    entry(text) { return { at: nowIso(), by: me.name, text }; },

    async assign(ld, uid) {
      const who = this.staff.find(s => s.uid === uid);
      if (!who || this.busy) return;
      const h = this.entry(`Assigned to ${who.name}.`);
      this.busy = true; this.error = '';
      try {
        const b = writeBatch(db);
        b.update(doc(db, 'offlineInquiries', ld.id), { assignedToUid: who.uid, assignedToName: who.name, updatedAt: serverTimestamp(), history: arrayUnion(h) });
        audit(b, me, { action: 'offlineInquiry.assign', entity: `offlineInquiries/${ld.id}`, changes: [{ field: 'assignedTo', old: null, new: who.name }] });
        await b.commit();
        Object.assign(ld, { assignedToUid: who.uid, assignedToName: who.name, assignedTo: who.name, updated: h.at });
        ld.history.push(h);
        this.okMsg = `${ld.id} assigned to ${who.name}.`;

        // Direct notification to assignee (skipSelf set to false so self-assignment testing works)
        this.notify({
          uids: [who.uid],
          skipSelf: false,
          title: 'Inquiry assigned to you',
          refId: ld.id,
          message: `${ld.id} · ${ld.lookingFor} was assigned to you by ${me.name}.`,
          link: `/Operations/offline-inquiries?id=${ld.id}`
        });
      } catch (e) { this.error = friendlyError(e, 'assign the inquiry'); }
      this.busy = false;
    },

    async saveNew() {
      const f = this.form;
      if (!f.lookingFor.trim()) return this.formError = 'Say what they are looking for, e.g. Monthly rental, 2 bedrooms, Ampang.';
      if (!f.contactName.trim() && !f.phone.trim()) return this.formError = 'Add a name or phone number so Operations can follow up.';
      if (!emailOk(f.email.trim())) return this.formError = 'That email address doesn\'t look right. Check it or leave it empty.';
      this.busy = true; this.formError = '';
      try {
        const known = await findTenant(f.phone);
        const who = this.canAssign ? this.staff.find(s => s.uid === f.assignedTo) || null : null;
        const h = this.entry(`Logged the inquiry${who ? `, assigned to ${who.name}` : ''}${known ? `, linked to existing tenant ${known.id}` : ''}.${f.note.trim() ? ' ' + f.note.trim() : ''}`);
        
        const id = await runTransaction(db, async tx => {
          const cRef = doc(db, 'counters', 'offlineInquiries');
          const c = await tx.get(cRef);
          const n = c.exists() ? c.data().next || 1 : 1, id = num('LD', n), ref = doc(db, 'offlineInquiries', id);
          if ((await tx.get(ref)).exists()) throw stop(`${id} already exists. Ask a Director to check counters/offlineInquiries.`);
          tx.set(cRef, { next: n + 1 });
          tx.set(ref, { lookingFor: f.lookingFor.trim(), source: f.source, budget: f.budget.trim(), viewing: f.viewing, status: f.status,
            assignedToUid: who?.uid || null, assignedToName: who?.name || null, loggedByUid: me.user.uid, loggedByName: me.name,
            tenantId: known?.id || null, bookingId: null, history: [h], createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
          tx.set(doc(ref, 'private', 'main'), { contactName: f.contactName.trim(), phone: f.phone.trim(), phoneKey: phoneKey(f.phone), email: f.email.trim() });
          audit(tx, me, { action: 'offlineInquiry.create', entity: `offlineInquiries/${id}`,
            changes: [{ field: 'status', old: null, new: f.status }, ...(who ? [{ field: 'assignedTo', old: null, new: who.name }] : [])] });
          return id;
        });

        const link = `/Operations/offline-inquiries?id=${id}`;

        // Case A: Assigned to a staff member (skipSelf: false ensures local self-tests trigger notifications)
        if (who) {
          this.notify({
            uids: [who.uid],
            skipSelf: false,
            title: 'Inquiry assigned to you',
            refId: id,
            message: `${id} · ${f.lookingFor.trim()} was assigned to you by ${me.name}.`,
            link
          });
        }

        // Case B: New inquiry — alert Finance, Directors and Operations
        this.notify({
          roles: this.inquiryRoles(),
          title: `New inquiry ${id}`,
          refId: id,
          message: `${me.name} logged ${id} · ${f.lookingFor.trim()} (${STATUS[f.status][0]})${who ? `, assigned to ${who.name}` : ', unassigned'}.`,
          link
        });

        this.okMsg = `${id} logged${who ? ` and assigned to ${who.name}` : ''}.`;
        this.go('list');
      } catch (e) { this.formError = errText(e, 'save the inquiry'); }
      this.busy = false;
    },

    async saveUpdate() {
      const ld = this.lead, u = this.upd, parts = [];
      const who = this.staff.find(s => s.uid === u.assignedToUid) || null;
      const reassign = this.canAssign && (u.assignedToUid || '') !== (ld.assignedToUid || '');
      const statusChanged = u.status !== ld.status;
      const oldStatus = ld.status;
      if (reassign) parts.push(who ? `Assigned to ${who.name}.` : 'Unassigned.');
      if (u.status !== ld.status) parts.push(`Status: ${STATUS[u.status][0]}.`);
      if (u.note.trim()) parts.push(u.note.trim());
      if (!parts.length) return this.formError = 'Nothing changed. Pick a status or add a note.';
      const h = this.entry(parts.join(' '));
      const change = { status: u.status, updatedAt: serverTimestamp(), history: arrayUnion(h),
        ...(reassign ? { assignedToUid: who?.uid || null, assignedToName: who?.name || null } : {}) };
      this.busy = true;
      try {
        const b = writeBatch(db);
        b.update(doc(db, 'offlineInquiries', ld.id), change);
        audit(b, me, { action: 'offlineInquiry.update', entity: `offlineInquiries/${ld.id}`, reason: u.note.trim(),
          changes: [...(u.status !== ld.status ? [{ field: 'status', old: ld.status, new: u.status }] : []),
            ...(reassign ? [{ field: 'assignedTo', old: ld.assignedTo || null, new: who?.name || null }] : [])] });
        await b.commit();
        Object.assign(ld, { status: u.status, updated: h.at, ...(reassign ? { assignedToUid: who?.uid || null, assignedToName: who?.name || null, assignedTo: who?.name || '' } : {}) });
        ld.history.push(h);
        this.formError = ''; this.upd.note = ''; this.okMsg = `${ld.id} updated.`;

        const link = `/Operations/offline-inquiries?id=${ld.id}`;
        if (reassign && who) {
          this.notify({
            uids: [who.uid],
            skipSelf: false,
            title: 'Inquiry assigned to you',
            refId: ld.id,
            message: `${ld.id} · ${ld.lookingFor} was assigned to you by ${me.name}.`,
            link
          });
        }
        if (statusChanged) {
          this.notify({
            roles: this.inquiryRoles(),
            title: 'Inquiry status changed',
            refId: ld.id,
            message: `${ld.id} · ${ld.lookingFor}: ${me.name} changed the status from ${STATUS[oldStatus][0]} to ${STATUS[u.status][0]}.`,
            link
          });
        }
      } catch (e) { this.formError = friendlyError(e, 'save the update'); }
      this.busy = false;
    },

    async saveEzee() {
      const no = this.ezeeAdd.trim(), b = this.booking, ld = this.lead;
      if (!no || !b) return;
      const h = this.entry(`Linked eZee reservation ${no}.`);
      this.busy = true; this.formError = '';
      try {
        const batch = writeBatch(db);
        batch.update(doc(db, 'offlineBookings', b.id), { ezeeReservationNo: no, updatedAt: serverTimestamp(), updatedBy: me.user.uid });
        batch.update(doc(db, 'offlineInquiries', ld.id), { updatedAt: serverTimestamp(), history: arrayUnion(h) });
        audit(batch, me, { action: 'offlineBooking.ezee', entity: `offlineBookings/${b.id}`, propertyId: b.propertyId || null,
          changes: [{ field: 'ezeeReservationNo', old: null, new: no }] });
        await batch.commit();
        b.ezeeReservationNo = no; ld.updated = h.at; ld.history.push(h);
        this.ezeeAdd = ''; this.okMsg = `eZee reservation ${no} linked.`;
      } catch (e) { this.formError = friendlyError(e, 'link the eZee reservation'); }
      this.busy = false;
    },
    startEdit() {
      const t = this.tenant;
      this.edit = { ...this.who, icPassport: t?.icPassport || '', nationality: t?.nationality || '' };
      this.formError = ''; this.editing = true;
    },
    async saveEdit() {
      const e = Object.fromEntries(Object.entries(this.edit).map(([k, v]) => [k, String(v || '').trim()]));
      if (!e.name && !e.phone) return this.formError = 'Keep at least a name or a phone number.';
      if (!emailOk(e.email)) return this.formError = 'That email address doesn\'t look right.';
      const t = this.tenant, ld = this.lead, key = phoneKey(e.phone);
      const before = { ...this.who, icPassport: t?.icPassport || '', nationality: t?.nationality || '' };
      const changed = (t ? ['name', 'phone', 'email', 'icPassport', 'nationality'] : ['name', 'phone', 'email']).filter(k => (before[k] || '') !== e[k]);
      this.busy = true; this.formError = '';
      try {
        if (t && key.length >= 9) {
          const other = await findTenant(e.phone);
          if (other && other.id !== t.id) throw stop(`Tenant ${other.id} already has this phone number.`);
        }
        const h = this.entry(t ? `Updated tenant ${t.id}'s details.` : 'Updated the customer\'s details.');
        const b = writeBatch(db), lRef = doc(db, 'offlineInquiries', ld.id);
        if (t) {
          b.set(doc(db, 'tenants', t.id, 'private', 'main'), { kind: 'tenant', name: e.name, phone: e.phone, phoneKey: key, email: e.email,
            icPassport: e.icPassport, nationality: e.nationality, searchWords: searchWords(e.name) }, { merge: true });
          b.update(doc(db, 'tenants', t.id), { updatedAt: serverTimestamp(), updatedBy: me.user.uid });
        }
        b.set(doc(lRef, 'private', 'main'), { contactName: e.name, phone: e.phone, phoneKey: key, email: e.email }, { merge: true });
        b.update(lRef, { updatedAt: serverTimestamp(), history: arrayUnion(h) });
        audit(b, me, { action: t ? 'tenant.update' : 'offlineInquiry.contact', entity: t ? `tenants/${t.id}` : `offlineInquiries/${ld.id}`, changes: piiChanges(changed) });
        await b.commit();
        if (t) Object.assign(t, { name: e.name, phone: e.phone, phoneKey: key, email: e.email, icPassport: e.icPassport, nationality: e.nationality });
        Object.assign(ld, { contactName: e.name, phone: e.phone, email: e.email, updated: h.at });
        ld.history.push(h);
        this.editing = false; this.okMsg = 'Details saved.';
      } catch (err) { this.formError = errText(err, 'save the details'); }
      this.busy = false;
    },

    bookBack() { if (this.embedded) { this.$emit('close'); return; } if (this.direct) this.$router.push('/Operations/booking-forms'); else this.go('lead', this.lead.id); },
    async startBooking() {
      const ld = this.lead || { contactName: '', phone: '', email: '' };
      this.bk = { name: ld.contactName, phone: ld.phone, email: ld.email, icPassport: '', nationality: 'Malaysian', dob: '', gender: '', genderOther: '', coTenants: [], existing: null,
        rentType: 'Daily', bookingSource: '', rentalStatus: '', mainPasscode: '', currentExpiry: '', nextPasscode: '', nextExpiry: '', rental: '', securityDeposit: '', utilityDeposit: '', internetFee: '', carparkFee: '', cleaningFee: '', taFee: '', taStampFee: '', othersFee: '', othersNote: '',
        payMode: '', payDate: today(),
        propertyId: '', unitId: '', arrival: '', departure: '', amount: '', monthlyRent: '', paymentRef: '', ezeeNo: '', note: '' };
      await this.refill();
      try { this.properties = await loadProperties(); } catch { this.properties = []; this.formError = 'Could not load the property list. Check your connection and reload.'; }
    },
    async refill(typed = false) {
      const phone = this.bk.phone;
      const t = this.lead?.tenantId ? this.tenant : await findTenant(phone).catch(() => null);
      if (typed && this.bk.phone !== phone) return;
      this.bk.existing = t || null;
      if (t) Object.assign(this.bk, { name: t.name || this.bk.name, email: t.email || this.bk.email, icPassport: t.icPassport || '', nationality: t.nationality || this.bk.nationality,
        dob: t.dob || this.bk.dob, gender: t.gender || this.bk.gender, genderOther: t.genderOther || this.bk.genderOther });
    },
    async loadUnitList() {
      this.bk.unitId = ''; this.units = [];
      if (!this.bk.propertyId) return;
      try { this.units = await loadUnits(this.bk.propertyId); } catch { this.formError = 'Could not load the units. Check your connection and try again.'; }
    },
    addCoTenant() { this.bk.coTenants.push({ key: Date.now() + Math.random(), name: '', phone: '', email: '', icPassport: '', nationality: 'Malaysian', dob: '', gender: '', genderOther: '' }); },
    coError() {
      const list = this.bk.coTenants;
      for (let i = 0; i < list.length; i++) {
        const c = list[i], n = `Tenant ${i + 2}`;
        if (!c.name.trim()) return `Add the name of ${n}, or remove them.`;
        if (phoneKey(c.phone).length < 9) return `Add a full phone number for ${n}.`;
        if (c.email.trim() && !emailOk(c.email.trim())) return `The email for ${n} doesn't look right.`;
        if (!c.icPassport.trim()) return `Add the IC or passport number of ${n}.`;
        if (c.gender === 'Other' && !c.genderOther.trim()) return `Type the gender of ${n}, or pick another option.`;
        if (phoneKey(c.phone) === phoneKey(this.bk.phone) || list.some((o, j) => j < i && phoneKey(o.phone) === phoneKey(c.phone))) return `${n} has the same phone number as another tenant on this booking.`;
      }
      return '';
    },
    // Each extra tenant gets their own tenant record (found by phone, or a new TEN number); returns their ids
    async saveCoTenants() {
      const ids = [];
      for (const c of this.bk.coTenants) {
        const details = { kind: 'tenant', name: c.name.trim(), phone: c.phone.trim(), phoneKey: phoneKey(c.phone), email: c.email.trim(),
          icPassport: c.icPassport.trim(), nationality: c.nationality.trim(), searchWords: searchWords(c.name),
          dob: c.dob || '', gender: c.gender || '', genderOther: c.gender === 'Other' ? c.genderOther.trim() : '' };
        const known = await findTenant(c.phone), tcRef = doc(db, 'counters', 'tenants');
        const id = await runTransaction(db, async tx => {
          let tenantId = known?.id, n = 0;
          if (!known) {
            const cs = await tx.get(tcRef);
            n = cs.exists() ? cs.data().next || 1 : 1; tenantId = num('TEN', n);
            if ((await tx.get(doc(db, 'tenants', tenantId))).exists()) throw stop(`${tenantId} already exists. Ask a Director to check counters/tenants.`);
          }
          const tRef = doc(db, 'tenants', tenantId);
          if (known) tx.update(tRef, { status: 'active', updatedAt: serverTimestamp(), updatedBy: me.user.uid });
          else {
            tx.set(tcRef, { next: n + 1 });
            tx.set(tRef, { status: 'active', firstInquiryId: null, createdAt: serverTimestamp(), createdBy: me.user.uid, createdByName: me.name });
          }
          tx.set(doc(tRef, 'private', 'main'), details, { merge: true });
          return tenantId;
        });
        ids.push(id);
      }
      return ids;
    },
    // Door passcodes live in the booking's private record (Director, Finance, Operations only)
    passcodes() { const b = this.bk; return { mainDoorPasscode: b.mainPasscode.trim(), currentExpiryDate: b.currentExpiry || '', nextDoorPasscode: b.nextPasscode.trim(), nextExpiryDate: b.nextExpiry || '' }; },
    // Booking details and payment details that are saved on every offline booking
    extra(coIds = []) {
      const b = this.bk;
      return { coTenantIds: coIds, bookingSource: b.bookingSource, rentalStatus: b.rentalStatus, moveInStatus: 'Ready_to_Send', moveOutStatus: 'Ready_to_Send',
        passwordStatus: b.mainPasscode.trim() && b.currentExpiry ? 'Ready_to_Send' : '', rentType: b.rentType, rental: this.longTerm ? toCents(b.monthlyRent) : toCents(b.rental),
        securityDeposit: this.longTerm ? this.deposit : toCents(b.securityDeposit),
        utilityDeposit: toCents(b.utilityDeposit), internetFee: toCents(b.internetFee), carparkFee: toCents(b.carparkFee), cleaningFee: toCents(b.cleaningFee),
        taFee: toCents(b.taFee), taStampFee: toCents(b.taStampFee), othersFee: toCents(b.othersFee), othersNote: +b.othersFee > 0 ? b.othersNote.trim() : '',
        payment: { amount: toCents(b.amount), mode: b.payMode, date: b.payDate || '', reference: b.paymentRef.trim(), remarks: b.note.trim() } };
    },
    async saveBooking() {
      const b = this.bk, ld = this.lead;
      const err = !b.name.trim() ? 'Add the tenant\'s name.'
        : phoneKey(b.phone).length < 9 ? 'Add a full phone number. It is how a returning tenant is recognised.'
        : !emailOk(b.email.trim()) ? 'That email address doesn\'t look right.'
        : !b.icPassport.trim() ? 'Add the IC or passport number.'
        : b.gender === 'Other' && !b.genderOther.trim() ? 'Type the gender, or pick another option.'
        : !b.unitId ? 'Choose the property and unit.'
        : !b.bookingSource ? 'Choose the booking source.'
        : !b.rentalStatus ? 'Choose the rental status.'
        : !b.arrival || !b.departure ? 'Add the check-in and check-out dates.'
        : this.nights <= 0 ? 'Check-out must be after check-in.'
        : this.longTerm && !(+b.monthlyRent > 0) ? 'Add the monthly rent. The 2-month deposit is worked out from it.'
        : !this.longTerm && !(+b.amount > 0) ? 'Add the amount paid.'
        : +b.amount > 0 && !b.payMode ? 'Choose the mode of payment.'
        : b.mainPasscode.trim() && !b.currentExpiry ? 'Add the expiry date of the main door passcode.'
        : b.nextPasscode.trim() && !b.nextExpiry ? 'Add the expiry date of the next door passcode.' : this.coError();
      if (err) { this.formError = err; window.scrollTo(0, 0); return; }
      if (this.direct) return this.saveDirect();

      this.busy = true; this.formError = '';
      try {
        const prop = this.properties.find(p => p.id === b.propertyId), unit = this.units.find(u => u.id === b.unitId);
        const details = { kind: 'tenant', name: b.name.trim(), phone: b.phone.trim(), phoneKey: phoneKey(b.phone), email: b.email.trim(),
          icPassport: b.icPassport.trim(), nationality: b.nationality.trim(), searchWords: searchWords(b.name),
          dob: b.dob || '', gender: b.gender || '', genderOther: b.gender === 'Other' ? b.genderOther.trim() : '' };
        const coIds = await this.saveCoTenants();
        const known = this.lead.tenantId ? this.tenant : await findTenant(b.phone);
        const bookingId = `offline_${ld.id}`, unitCode = unit?.unitCode || '';
        const lRef = doc(db, 'offlineInquiries', ld.id), bRef = doc(db, 'offlineBookings', bookingId), cRef = doc(db, 'counters', 'tenants');
        
        const res = await runTransaction(db, async tx => {
          if ((await tx.get(bRef)).exists()) throw stop(`${ld.id} already has a booking.`);
          const ls = await tx.get(lRef);
          if (!ls.exists() || ls.data().bookingId) throw stop(`${ld.id} already has a booking.`);
          let tenantId = known?.id, n = 0;
          if (!known) {
            const c = await tx.get(cRef);
            n = c.exists() ? c.data().next || 1 : 1; tenantId = num('TEN', n);
            if ((await tx.get(doc(db, 'tenants', tenantId))).exists()) throw stop(`${tenantId} already exists. Ask a Director to check counters/tenants.`);
          }
          const tRef = doc(db, 'tenants', tenantId);
          if (known) tx.update(tRef, { status: 'active', lastInquiryId: ld.id, updatedAt: serverTimestamp(), updatedBy: me.user.uid });
          else {
            tx.set(cRef, { next: n + 1 });
            tx.set(tRef, { status: 'active', firstInquiryId: ld.id, lastInquiryId: ld.id, createdAt: serverTimestamp(), createdBy: me.user.uid, createdByName: me.name });
          }
          tx.set(doc(tRef, 'private', 'main'), details, { merge: true });
          tx.set(bRef, { source: 'offline', inquiryId: ld.id, tenantId,
            propertyId: b.propertyId, propertyName: prop?.name || '', unitId: b.unitId, unitCode,
            arrival: b.arrival, departure: b.departure, nights: this.nights, longTerm: this.longTerm,
            amount: this.longTerm ? 0 : toCents(b.amount), monthlyRent: this.longTerm ? toCents(b.monthlyRent) : 0, deposit: this.longTerm ? this.deposit : 0,
            paymentRef: b.paymentRef.trim(), ezeeReservationNo: b.ezeeNo.trim(), ...this.extra(coIds), status: 'active',
            createdAt: serverTimestamp(), createdBy: me.user.uid, createdByName: me.name });
          tx.set(doc(bRef, 'private', 'main'), this.passcodes());
          const h = this.entry(`Paid and booked: ${unitCode || 'unit'}, ${this.full(b.arrival)} to ${this.full(b.departure)}. `
            + `${!known ? `Saved as new tenant ${details.name} (${tenantId}).` : `Added to existing tenant ${details.name} (${tenantId}).`}${b.note.trim() ? ' ' + b.note.trim() : ''}`);
          tx.update(lRef, { status: 'booked', tenantId, bookingId, updatedAt: serverTimestamp(), history: arrayUnion(h) });
          tx.set(doc(lRef, 'private', 'main'), { contactName: details.name, phone: details.phone, phoneKey: details.phoneKey, email: details.email }, { merge: true });
          audit(tx, me, { action: 'offlineBooking.create', entity: `offlineBookings/${bookingId}`, propertyId: b.propertyId,
            changes: [{ field: 'status', old: ld.status, new: 'booked' }, { field: 'tenantId', old: null, new: tenantId }, { field: 'unitId', old: null, new: b.unitId }] });
          return { isNew: !known };
        });

        this.okMsg = `${ld.id} booked. ${res.isNew ? `New tenant ${details.name} saved.` : `Added to tenant ${details.name}.`}`;

        // Notify Finance and Directors to key the booking into eZee
        this.notify({
          roles: ['finance', 'director'],
          title: 'New offline booking',
          refId: bookingId,
          message: `${ld.id} booked: ${details.name}, ${unitCode || 'unit'}, ${this.full(b.arrival)} to ${this.full(b.departure)}. Key it into eZee.`,
          link: `/Operations/offline-inquiries?id=${ld.id}`
        });

        // Status moved to Booked — Operations hears about it too (Finance/Director got the eZee note above)
        this.notify({
          roles: ['operations'],
          title: 'Inquiry status changed',
          refId: ld.id,
          message: `${ld.id}: ${me.name} changed the status from ${STATUS[ld.status][0]} to ${STATUS.booked[0]}.`,
          link: `/Operations/offline-inquiries?id=${ld.id}`
        });

        this.go('lead', ld.id);
      } catch (e) { this.formError = errText(e, 'save the booking'); window.scrollTo(0, 0); }
      this.busy = false;
    },

    async saveDirect() {
      const b = this.bk;
      this.busy = true; this.formError = '';
      try {
        const prop = this.properties.find(p => p.id === b.propertyId), unit = this.units.find(u => u.id === b.unitId);
        const details = { kind: 'tenant', name: b.name.trim(), phone: b.phone.trim(), phoneKey: phoneKey(b.phone), email: b.email.trim(),
          icPassport: b.icPassport.trim(), nationality: b.nationality.trim(), searchWords: searchWords(b.name),
          dob: b.dob || '', gender: b.gender || '', genderOther: b.gender === 'Other' ? b.genderOther.trim() : '' };
        const coIds = await this.saveCoTenants();
        const known = await findTenant(b.phone), unitCode = unit?.unitCode || '';
        const bcRef = doc(db, 'counters', 'offlineBookings'), tcRef = doc(db, 'counters', 'tenants');
        const res = await runTransaction(db, async tx => {
          const bc = await tx.get(bcRef), bn = bc.exists() ? bc.data().next || 1 : 1, bookingId = `offline_${num('BK', bn)}`;
          const bRef = doc(db, 'offlineBookings', bookingId);
          if ((await tx.get(bRef)).exists()) throw stop(`${bookingId} already exists. Ask a Director to check counters/offlineBookings.`);
          let tenantId = known?.id, n = 0;
          if (!known) {
            const c = await tx.get(tcRef);
            n = c.exists() ? c.data().next || 1 : 1; tenantId = num('TEN', n);
            if ((await tx.get(doc(db, 'tenants', tenantId))).exists()) throw stop(`${tenantId} already exists. Ask a Director to check counters/tenants.`);
          }
          const tRef = doc(db, 'tenants', tenantId);
          tx.set(bcRef, { next: bn + 1 });
          if (known) tx.update(tRef, { status: 'active', lastBookingId: bookingId, updatedAt: serverTimestamp(), updatedBy: me.user.uid });
          else {
            tx.set(tcRef, { next: n + 1 });
            tx.set(tRef, { status: 'active', firstInquiryId: null, lastBookingId: bookingId, createdAt: serverTimestamp(), createdBy: me.user.uid, createdByName: me.name });
          }
          tx.set(doc(tRef, 'private', 'main'), details, { merge: true });
          tx.set(bRef, { source: 'direct', inquiryId: null, tenantId,
            propertyId: b.propertyId, propertyName: prop?.name || '', unitId: b.unitId, unitCode,
            arrival: b.arrival, departure: b.departure, nights: this.nights, longTerm: this.longTerm,
            amount: this.longTerm ? 0 : toCents(b.amount), monthlyRent: this.longTerm ? toCents(b.monthlyRent) : 0, deposit: this.longTerm ? this.deposit : 0,
            paymentRef: b.paymentRef.trim(), ezeeReservationNo: b.ezeeNo.trim(), ...this.extra(coIds), note: b.note.trim(), status: 'active',
            createdAt: serverTimestamp(), createdBy: me.user.uid, createdByName: me.name });
          tx.set(doc(bRef, 'private', 'main'), this.passcodes());
          audit(tx, me, { action: 'offlineBooking.create', entity: `offlineBookings/${bookingId}`, propertyId: b.propertyId,
            changes: [{ field: 'tenantId', old: null, new: tenantId }, { field: 'unitId', old: null, new: b.unitId }] });
          return { isNew: !known, bookingId };
        });

        const okMsg = `${res.bookingId} saved. ${res.isNew ? `New tenant ${details.name} saved.` : `Added to tenant ${details.name}.`} Key it into eZee to block the room.`;

        this.notify({
          roles: ['finance', 'director'],
          title: 'New offline booking',
          refId: res.bookingId,
          message: `${res.bookingId}: ${details.name}, ${unitCode || 'unit'}, ${this.full(b.arrival)} to ${this.full(b.departure)}. Key it into eZee.`,
          link: '/Portfolio/bookings'
        });

        if (this.embedded) { this.$emit('saved', okMsg); await this.startBooking(); window.scrollTo(0, 0); }
        else this.$router.push({ path: '/Portfolio/bookings', state: { okMsg } });
      } catch (e) { this.formError = errText(e, 'save the booking'); window.scrollTo(0, 0); }
      this.busy = false;
    }
  }
};
</script>

<style scoped>
    .pills-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    .info-btn { padding: 8px 10px; color: var(--accent); border: 1.5px solid var(--accent); }
    .info-btn:hover { background: var(--accent-soft); }
    .next-list p { margin: 0 0 10px; font-size: 14px; line-height: 1.5; }
    .fld-pick { display: block; width: 100%; }
    .fld-pick :deep(.op-btn) { width: 100%; min-height: 40px; }
    .fld-pick :deep(.op-pop) { max-width: none; width: 100%; }
    .count-pills .pill-btn { height: 26px; font-size: 12px; padding: 0 10px; }
    .assign-sel { height: 26px; font-size: 12px; font-weight: 500; border-radius: 999px; border: 0; padding: 0 22px 0 10px; background-color: var(--accent-soft); color: var(--accent);
      background-position: calc(100% - 13px) 11px, calc(100% - 9px) 11px; }
    .back { display: inline-block; color: var(--accent); font-size: 13px; font-weight: 500; margin-bottom: 14px; background: none; border: 0; padding: 0; cursor: pointer; }
    .form-card { display: grid; gap: 16px; }
    .form-card h2 { font-size: 15px; margin: 0 0 12px; }
    .form-card .card-head h2 { margin: 0; }
    .status-opts { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 10px; }
    .status-opt { display: flex; align-items: center; gap: 8px; min-height: 40px; padding: 8px 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); color: var(--text); font-size: 13px; text-align: left; }
    .status-opt::before { content: ""; width: 11px; height: 11px; border-radius: 50%; border: 1.5px solid var(--text-2); flex: none; }
    .status-opt:hover:not(:disabled) { border-color: var(--accent); background: var(--accent-soft); cursor: pointer; }
    .status-opt.on { border-color: var(--accent); background: var(--accent-soft); }
    .status-opt.on::before { border-color: var(--accent); background: var(--accent); box-shadow: inset 0 0 0 2px var(--surface); }
    .next-list p { margin: 0 0 10px; font-size: 13px; color: var(--text-2); }
    .hist { display: grid; gap: 10px; }
    .hist div { font-size: 13px; border-left: 2px solid var(--line); padding-left: 10px; }
    .hist small { display: block; color: var(--muted); font-size: 11px; }
    .page-note { color: var(--muted); font-size: 12px; margin-top: 14px; }
    .masked { color: var(--muted); }
    .ten-id { font-size: 11px; color: var(--muted); }
    .wrap { overflow-wrap: anywhere; }
    .pill.accent { background: var(--accent-soft); color: var(--accent); }
    .readonly { display: flex; align-items: center; background: var(--chip); color: var(--text); }
    .ezee-add { padding-top: 8px; font-size: 13px; }
    .ezee-add label { display: block; color: var(--text-2); margin-bottom: 6px; }
    .ezee-add div { display: flex; gap: 8px; }
    .ezee-add .input { flex: 1; min-width: 0; }
    .bottom-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 8px; padding: 14px 0 20px; }
    .head-tools { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    @media (max-width: 640px) { .status-opts { grid-template-columns: minmax(0,1fr); } }
    .upd-actions { display: flex; align-items: center; gap: 8px; justify-content: flex-start; }
    .upd-actions .unsaved-note { font-size: 11px; color: #A9AFBA; font-weight: 400; }
</style>