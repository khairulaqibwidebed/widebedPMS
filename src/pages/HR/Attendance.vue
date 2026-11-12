<template>
  <main class="content">
    <div class="loading-bar" v-show="loading"></div>
    <div class="page-head">
      <div>
        <h1>Attendance</h1>
        <div class="sub">Clock-ins from the Widebed Staff Attendance app, one row per person per day (several clock-ins in a day are added up). Directors and HR only.</div>
      </div>
      <button class="btn btn-primary" type="button" v-if="tab === 'records'" :disabled="loading || exporting || !peopleCount" @click="exportXlsx()">
        {{ exporting ? 'Exporting…' : 'Export to Excel' }}</button>
    </div>

    <div class="tabs" role="tablist">
      <button type="button" role="tab" :aria-selected="String(tab === 'records')" :class="{ on: tab === 'records' }" @click="tab = 'records'">Records</button>
      <button type="button" role="tab" :aria-selected="String(tab === 'holidays')" :class="{ on: tab === 'holidays' }" @click="tab = 'holidays'">Public holidays</button>
      <button type="button" role="tab" :aria-selected="String(tab === 'settings')" :class="{ on: tab === 'settings' }" @click="tab = 'settings'">Office settings</button>
    </div>

    <div class="notice error" v-show="error">{{ error }}</div>
    <div class="notice ok" v-show="okMsg">{{ okMsg }}</div>

    <!-- ================= Records ================= -->
    <template v-if="tab === 'records'">
      <div class="toolbar">
        <button type="button" class="btn btn-sm" :class="{ 'btn-primary': quick === 'today' }" @click="setQuick('today')">Today</button>
        <button type="button" class="btn btn-sm" :class="{ 'btn-primary': quick === 'month' }" @click="setQuick('month')">This month</button>
        <button type="button" class="btn btn-sm" :class="{ 'btn-primary': quick === 'last' }" @click="setQuick('last')">Last month</button>
        <label class="at-date"><span>From</span><input class="input" type="date" v-model="from" :max="to" @change="quick = ''; load()"></label>
        <label class="at-date"><span>To</span><input class="input" type="date" v-model="to" :min="from" @change="quick = ''; load()"></label>
        <OptionPicker v-model="deptFilter" :options="deptOptions" label="Department" />
      </div>

      <div class="kpis">
        <div class="kpi"><div class="label">Days present</div><div class="value">{{ totals.present }}</div><div class="hint">days with a clock-in</div></div>
        <div class="kpi"><div class="label">Late arrivals</div><div class="value" :class="{ alert: totals.late }">{{ totals.late }}</div><div class="hint">{{ `after ${hm(cfg.lateAfterMin)}` }}</div></div>
        <div class="kpi"><div class="label">Absent / no clock-out</div><div class="value" :class="{ alert: totals.absent + totals.noClockOut }">{{ totals.absent + totals.noClockOut }}</div>
          <div class="hint">{{ `${totals.absent} absent · ${totals.noClockOut} no clock-out` }}</div></div>
        <div class="kpi"><div class="label">Hours worked</div><div class="value">{{ duration(totals.minutes) || '0h 00m' }}</div><div class="hint">{{ `${totals.short} short day${totals.short === 1 ? '' : 's'} · ${totals.offsite} with off-site` }}</div></div>
      </div>

      <!-- Daily Report: the payroll sheet's columns (CLOCK_IN_PAYROLL.xlsx) in the PMS's usual table style. The Excel export
           keeps the payroll sheet's own look. -->
      <section class="card at-card" :class="{ 'at-full': full }">
        <div class="card-head">
          <h2>{{ `Daily Report From: ${from} to ${to}` }}</h2>
          <span class="head-r">
            <span class="help">{{ `${peopleCount} ${peopleCount === 1 ? 'person' : 'people'}` }}</span>
            <button type="button" class="btn btn-sm" v-if="nameFilter.length" @click="nameFilter = []">Clear name filter</button>
            <button type="button" class="btn btn-sm" @click="full = !full" :aria-pressed="String(full)">{{ full ? 'Exit full screen' : 'Full screen' }}</button>
          </span>
        </div>
        <!-- On screen the report is short: one summary line per person; open a person (or "Open all") for their days.
             Each clock-in/out pair sits in one cell. The Excel export is unchanged (payroll layout, every column). 12 Nov 2026 -->
        <div class="at-bar">
          <button type="button" class="btn btn-sm" @click="openAll">Open all</button>
          <button type="button" class="btn btn-sm" @click="opened = []">Close all</button>
          <label class="check at-inline"><input type="checkbox" v-model="hideRest"><span>Hide rest days &amp; holidays</span></label>
        </div>
        <div class="table-wrap at-wrap">
          <table class="table hover-rows at-table">
            <!-- Fixed column widths, so opening a person's days doesn't make the columns jump (12 Nov 2026) -->
            <colgroup>
              <col class="c-name"><col class="c-pos"><col class="c-date"><col><col class="c-num"><col class="c-num"><col class="c-abs">
              <col class="c-status"><col class="c-act">
            </colgroup>
            <thead>
              <tr>
                <th class="at-name-th">
                  <span>Name</span>
                  <OptionPicker class="at-name-filter" multiple searchable :model-value="nameFilter" :options="nameOptions" label="Filter by name"
                    placeholder="All names" @update:model-value="v => (nameFilter = v)" />
                </th>
                <th>Position</th><th>Date</th><th>Clock in → out</th>
                <th class="num">Work (min)</th><th class="num">Late (min)</th><th class="num">Absent</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody v-for="g in report.groups" :key="g.title">
              <tr class="at-group"><td :colspan="9">{{ g.title }}</td></tr>
              <template v-for="p in g.people" :key="p.uid">
                <!-- person summary -->
                <tr class="at-person" @click="toggle(p.uid)">
                  <td class="at-who"><button type="button" class="at-caret" :aria-expanded="String(isOpen(p.uid))" :aria-label="`Show days for ${p.name}`"
                    @click.stop="toggle(p.uid)">{{ isOpen(p.uid) ? '▾' : '▸' }}</button><b>{{ p.name }}</b></td>
                  <td class="muted">{{ p.position }}</td>
                  <td class="nowrap muted">{{ `${sumOf(p).worked} day${sumOf(p).worked === 1 ? '' : 's'} worked` }}</td>
                  <td>
                    <span class="pill amber" v-if="sumOf(p).late">{{ `${sumOf(p).late} late` }}</span>
                    <span class="pill blue" v-if="sumOf(p).offsite">{{ `${sumOf(p).offsite} off-site` }}</span>
                    <span class="pill red" v-if="sumOf(p).missing">{{ `${sumOf(p).missing} missing clock-out` }}</span>
                  </td>
                  <td class="num"><b>{{ p.totals.work }}</b></td><td class="num"><b>{{ p.totals.late }}</b></td><td class="num"><b>{{ p.totals.absent }}</b></td>
                  <td>
                    <span class="pill green" v-if="sumOf(p).normal">{{ `${sumOf(p).normal} normal` }}</span>
                    <span class="pill amber" v-if="sumOf(p).short">{{ `${sumOf(p).short} short` }}</span>
                  </td>
                  <td></td>
                </tr>
                <!-- that person's days -->
                <template v-if="isOpen(p.uid)">
                  <tr v-for="row in daysOf(p)" :key="p.uid + row.key" class="at-day" :class="{ 'at-today': row.key === today }">
                    <td></td><td></td>
                    <td class="nowrap" :class="{ 'at-red-text': row.type === 'span' }">{{ row.date }}</td>
                    <td v-if="row.type === 'span'" colspan="5"><span class="pill grey">{{ row.text }}</span></td>
                    <template v-else>
                      <td>
                        <!-- flex goes on this div, not the <td>: a flex <td> stops being a table cell (short cell, white gap below) -->
                        <div class="at-pairs">
                        <span v-if="row.type === 'absent'" class="pill red">Absent</span>
                        <span v-for="(x, k) in (row.pairs || [])" :key="k" class="at-pair">
                          <span class="nowrap">{{ `${x.inTime || '—'} → ${x.outTime || '—'}` }}</span>
                          <span v-if="x.inKind && x.inKind !== 'normal'" :class="resultPill(x.inKind)">{{ x.inResult }}</span>
                          <span v-if="x.outKind && x.outKind !== 'normal'" :class="resultPill(x.outKind)">{{ x.outResult }}</span>
                          <small class="at-fixed" v-if="x.edited" title="Corrected by HR / a Director">fixed</small>
                        </span>
                        </div>
                      </td>
                      <td class="num">{{ row.type === 'work' && row.workMin != null ? row.workMin : '' }}</td>
                      <td class="num">{{ row.lateMin != null ? row.lateMin : '' }}</td>
                      <td class="num">{{ row.absent || '' }}</td>
                      <td><span v-if="row.status" :class="statusPill(row.statusKind)">{{ row.status }}</span></td>
                    </template>
                    <td class="at-act">
                      <button type="button" class="btn btn-sm" v-if="canFix(row)" @click="openFix(fixRow(row))"
                        :title="row.att && row.att.sessions[0].lateReason ? `Late reason: ${row.att.sessions[0].lateReason}` : ''">{{ row.att ? 'Fix' : 'Add' }}</button>
                    </td>
                  </tr>
                </template>
              </template>
            </tbody>
            <tbody v-if="!loading && !report.groups.length"><tr><td colspan="9" class="muted">No staff match these filters.</td></tr></tbody>
          </table>
        </div>
        <div class="card-foot">
          <span>Status: <b>Normal</b> = {{ requiredMinutes(cfg) }} minutes or more that day (leaving before {{ hm(cfg.workEndMin) }} is fine then); <b>Short</b> = less.
            Off-site = clocked in or out away from the office. Absent = a working day with no clock-in, counted from {{ firstDay ? dateText(firstDay) : 'the first clock-in' }} (when the app started being used). Rest days are never absent; public holidays aren't either, for the staff the holiday is for.
            Late for (Minutes) counts from {{ hm(cfg.workStartMin) }} once it is after {{ hm(cfg.lateAfterMin) }}. Hover Fix to see a late reason. You can't fix your own records.</span>
        </div>
      </section>
    </template>

    <!-- ================= Holidays ================= -->
    <template v-if="tab === 'holidays'">
      <div class="grid-2">
        <section class="card">
          <div class="card-head"><h2>{{ hEditing ? `Edit holiday · ${dateText(hEditing)}` : 'Add a holiday' }}</h2></div>
          <form @submit.prevent="addOne()">
            <div class="grid-fields">
              <div class="field"><label for="hDate" class="req">Date</label><input id="hDate" class="input" type="date" v-model="hDate" required :disabled="!!hEditing"></div>
              <div class="field"><label for="hName">Name</label><input id="hName" class="input" type="text" maxlength="80" v-model="hName" placeholder="Deepavali"></div>
            </div>
            <!-- Who gets this holiday (Draft 0.59). Everyone ticked by default; the unticked are saved as exceptUids. -->
            <div class="field">
              <div class="at-who-head">
                <label>Who gets this holiday</label>
                <span>
                  <button type="button" class="btn btn-sm" @click="hExcept = []">Select all</button>
                  <button type="button" class="btn btn-sm" @click="hExcept = staff.map(s => s.uid)">Clear</button>
                </span>
              </div>
              <input class="input at-who-search" type="search" v-model="hSearch" placeholder="Search a name" aria-label="Search a name">
              <div class="at-who-list">
                <template v-for="g in holidayStaffGroups" :key="g.title">
                  <div class="at-who-dept">
                    <span>{{ g.title }}</span>
                    <button type="button" class="at-link" @click="toggleGroup(g)">{{ g.people.every(p => !hExcept.includes(p.uid)) ? 'Untick all' : 'Tick all' }}</button>
                  </div>
                  <label class="check at-who-person" v-for="p in g.people" :key="p.uid">
                    <input type="checkbox" :checked="!hExcept.includes(p.uid)" @change="toggleOne(p.uid)"><span>{{ p.name }}</span>
                  </label>
                </template>
                <p class="muted" v-if="!holidayStaffGroups.length">No staff match.</p>
              </div>
              <p class="help">{{ hTickedText }}</p>
            </div>
            <button class="btn btn-primary" type="submit" :disabled="busy || !hDate || hTicked === 0">{{ busy ? 'Saving…' : hEditing ? 'Save changes' : 'Add holiday' }}</button>
            <button class="btn" type="button" v-if="hEditing" :disabled="busy" @click="cancelEdit()">Cancel</button>
          </form>
          <hr class="at-hr">
          <div class="field">
            <label for="hBulk">Paste a list <span class="muted">(one per line: 2026-12-25 Christmas Day, or 25/12/2026 Christmas Day; for everyone, Edit to leave people out)</span></label>
            <textarea id="hBulk" class="input at-bulk" v-model="hBulk" placeholder="2026-12-25 Christmas Day"></textarea>
          </div>
          <p class="help" v-if="bulk.list.length || bulk.bad.length">{{ `${bulk.list.length} holiday${bulk.list.length === 1 ? '' : 's'} found` }}<span v-if="bulk.bad.length">{{ ` · ${bulk.bad.length} line${bulk.bad.length === 1 ? '' : 's'} not understood: ${bulk.bad.slice(0, 2).join(' / ')}` }}</span></p>
          <button class="btn" type="button" :disabled="busy || !bulk.list.length" @click="addBulk()">{{ busy ? 'Saving…' : `Add ${bulk.list.length || ''} holidays` }}</button>
        </section>

        <section class="card">
          <div class="card-head"><h2>Holiday list</h2>
            <span class="head-r"><select class="select" v-model="hYear" aria-label="Year"><option v-for="y in years" :key="y" :value="y">{{ y }}</option></select></span></div>
          <div class="row" v-for="h in holidayList" :key="h.date">
            <span><b>{{ dateText(h.date) }}</b> <span class="muted">{{ DAY_NAMES[weekday(h.date)] }}</span><br>{{ h.name }}</span>
            <span class="pill" :class="h.exceptUids.length ? 'amber' : 'green'" :title="exceptNames(h)">{{ h.exceptUids.length ? `Everyone except ${h.exceptUids.length}` : 'Everyone' }}</span>
            <span class="r">
              <button type="button" class="btn btn-sm" v-if="removing !== h.date" :disabled="busy" @click="editHoliday(h)">Edit</button>
              <template v-if="removing === h.date">
                <button type="button" class="btn btn-sm btn-danger" :disabled="busy" @click="removeOne(h.date)">Remove</button>
                <button type="button" class="btn btn-sm" :disabled="busy" @click="removing = ''">Keep</button>
              </template>
              <button v-else type="button" class="btn btn-sm" @click="removing = h.date">Remove</button>
            </span>
          </div>
          <p class="empty" v-if="!holidayList.length">{{ `No holidays for ${hYear} yet.` }}</p>
          <p class="help">Staff can still clock in on a holiday; it's saved as Off day work and never counts as missing. For staff left out
            of a holiday it's a normal working day: late and absent count.</p>
        </section>
      </div>
    </template>

    <!-- ================= Settings ================= -->
    <template v-if="tab === 'settings'">
      <section class="card at-settings">
        <div class="card-head"><h2>Office and working hours</h2></div>
        <form @submit.prevent="saveSettings()">
          <div class="grid-fields">
            <div class="field"><label for="sName" class="req">Office name</label><input id="sName" class="input" v-model="form.officeName" maxlength="80" required></div>
            <div class="field"><label for="sRad" class="req">Allowed distance (metres)</label><input id="sRad" class="input" type="number" min="50" max="2000" step="10" v-model.number="form.radiusM" required></div>
          </div>
          <div class="field"><label for="sAddr">Address</label><input id="sAddr" class="input" v-model="form.address" maxlength="200"></div>
          <div class="grid-fields">
            <div class="field"><label for="sLat" class="req">Latitude</label><input id="sLat" class="input" type="number" step="0.000001" min="-90" max="90" v-model.number="form.lat" required></div>
            <div class="field"><label for="sLng" class="req">Longitude</label><input id="sLng" class="input" type="number" step="0.000001" min="-180" max="180" v-model.number="form.lng" required></div>
          </div>
          <p class="help"><a class="link" :href="`https://www.google.com/maps?q=${form.lat},${form.lng}`" target="_blank" rel="noopener">Check this spot on Google Maps</a>
            · In Google Maps, right-click the office and click the numbers at the top to copy them.</p>
          <div class="grid-fields at-three">
            <div class="field"><label for="sStart">Work starts</label><input id="sStart" class="input" type="time" v-model="form.start" required></div>
            <div class="field"><label for="sLate">Late after</label><input id="sLate" class="input" type="time" v-model="form.late" required></div>
            <div class="field"><label for="sEnd">Work ends</label><input id="sEnd" class="input" type="time" v-model="form.end" required></div>
          </div>
          <div class="field">
            <label>Working days</label>
            <div class="at-days">
              <label class="check" v-for="d in 7" :key="d"><input type="checkbox" :value="d" v-model="form.workDays"><span>{{ DAY_NAMES[d] }}</span></label>
            </div>
          </div>
          <label class="check"><input type="checkbox" v-model="form.allowOffsite"><span>Allow off-site clock-in / clock-out
            <small>Staff away from the office (e.g. at a client) can still clock in and out; it's shown as Off-site. Off: only inside the allowed distance.</small></span></label>
          <p class="help">The app reads these when staff clock in. Clocking in after "Late after" on a working day needs a reason. Changes apply from the next clock-in.</p>
          <button class="btn btn-primary" type="submit" :disabled="busy || !form.workDays.length">{{ busy ? 'Saving…' : 'Save settings' }}</button>
        </form>
      </section>
    </template>

    <!-- ================= Fix / Add ================= -->
    <div class="modal-back" v-if="fix" @click.self="closeFix()">
      <form class="modal at-modal" role="dialog" :aria-label="fixTitle" @submit.prevent="saveFix()">
        <h2>{{ fixTitle }}</h2>
        <div class="notice error" v-show="fix.error">{{ fix.error }}</div>
        <div class="field" v-if="fixSessions.length > 1">
          <label for="fSess">Which clock-in</label>
          <select id="fSess" class="select" v-model.number="fix.session" @change="pickSession()">
            <option v-for="x in fixSessions" :key="x.n" :value="x.n">{{ x.label }}</option>
          </select>
        </div>
        <div class="grid-fields">
          <div class="field"><label for="fIn" class="req">Clock in</label><input id="fIn" class="input" type="time" v-model="fix.inTime" required></div>
          <div class="field"><label for="fOut">Clock out <span class="muted">(leave empty if none)</span></label><input id="fOut" class="input" type="time" v-model="fix.outTime"></div>
        </div>
        <div class="field">
          <label for="fNote" class="req">What happened (audit log)</label>
          <textarea id="fNote" class="input at-bulk" v-model="fix.note" maxlength="300" placeholder="Forgot to clock out; left at 6:05 PM (checked with manager)"></textarea>
        </div>
        <p class="help">{{ fix.session > 1 ? 'A later clock-in (back from a client or errand) is never late.' : 'Late or on time is worked out from the first clock-in time.' }} The staff member sees the corrected times in the app.</p>
        <div class="at-acts">
          <button type="button" class="btn" :disabled="busy" @click="closeFix()">Cancel</button>
          <button type="submit" class="btn btn-primary" :disabled="busy || !fix.inTime || fix.note.trim().length < 3">{{ busy ? 'Saving…' : 'Save' }}</button>
        </div>
      </form>
    </div>
  </main>
</template>

<script>
import { ROLE_LABEL } from '@/lib/firebase.js';
import { friendlyError, loadXlsxLib } from '@/lib/finance-data.js';
import { useSession } from '@/stores/session.js';
import OptionPicker from '@/components/OptionPicker.vue';
import Paged from '@/components/Paged.vue';
import {
  DEFAULT_CFG, DAY_NAMES, KIND, loadConfig, saveConfig, loadRecords, loadFirstDay, loadStaff, loadHolidays,
  minutesOf, clock, hhmm, hm, duration, dayKey, monthRange, weekday, saveCorrection, addHoliday, addHolidays, removeHoliday,
  parseHolidayLines, pad, sessionTimes, dailyReport, reportTotals, reportSheet, generatedStamp, requiredMinutes
} from './attendance.js';

const toTime = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const toMin = t => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + m; };
const formOf = c => ({ officeName: c.officeName, address: c.address || '', lat: c.lat, lng: c.lng, radiusM: c.radiusM,
  start: toTime(c.workStartMin), late: toTime(c.lateAfterMin), end: toTime(c.workEndMin), workDays: [...(c.workDays || [])], allowOffsite: c.allowOffsite !== false });
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default {
  components: { OptionPicker, Paged },
  data() {
    const m = monthRange(0);
    return {
      KIND, DAY_NAMES, tab: 'records', loading: true, busy: false, exporting: false, error: '', okMsg: '',
      cfg: { ...DEFAULT_CFG }, staff: [], records: [], holidays: {}, allHolidays: {}, firstDay: null,
      from: m.from, to: m.to, quick: 'month', nameFilter: [], deptFilter: '', full: false, opened: [], hideRest: true,
      fix: null, hDate: '', hName: '', hBulk: '', hYear: new Date().getFullYear(), removing: '',
      hExcept: [], hEditing: '', hSearch: '',   // holiday form: uids left out, the date being edited, name search
      form: formOf(DEFAULT_CFG)
    };
  },
  computed: {
    myUid() { return useSession().user?.uid; },
    today() { return dayKey(); },
    // The Daily Report (payroll layout): every person, every day of the range. Table and Excel both use it.
    report() {
      return dailyReport({ records: this.records, staff: this.staff, holidays: this.holidays, cfg: this.cfg, from: this.from, to: this.to,
        today: this.today, firstDay: this.firstDay, deptLabel: r => ROLE_LABEL[r] || r || '', staffFilter: this.nameFilter, deptFilter: this.deptFilter });
    },
    totals() { return reportTotals(this.report); },
    peopleCount() { return this.report.groups.reduce((n, g) => n + g.people.length, 0); },
    nameOptions() { return this.staffOptions.filter(o => o.value); },
    staffOptions() {
      const seen = new Map(this.staff.map(s => [s.uid, s.name]));
      for (const r of this.records) if (!seen.has(r.uid)) seen.set(r.uid, r.name || 'Former staff');
      return [{ value: '', label: 'All staff' }, ...[...seen].sort((a, b) => a[1].localeCompare(b[1])).map(([value, label]) => ({ value, label }))];
    },
    deptOptions() {
      const roles = new Set([...this.staff.map(s => s.role), ...this.records.map(r => r.role)].filter(Boolean));
      return [{ value: '', label: 'All departments' }, ...[...roles].map(r => ({ value: r, label: ROLE_LABEL[r] || r })).sort((a, b) => a.label.localeCompare(b.label))];
    },
    rangeText() { return this.from === this.to ? this.dateText(this.from) : `${this.dateText(this.from)} – ${this.dateText(this.to)}`; },
    fixSessions() {
      const list = this.fix?.row.rec?.sessions || [];
      return list.map((x, i) => ({ n: x.session > 1 ? x.session : 1,
        label: `${i + 1}. ${clock(x.clockIn)} – ${x.clockOut ? clock(x.clockOut) : 'no clock-out'}` }));
    },
    fixTitle() { return this.fix ? `${this.fix.row.rec ? 'Fix' : 'Add'} attendance · ${this.fix.row.name} · ${this.dateText(this.fix.row.date)}` : ''; },
    bulk() { return parseHolidayLines(this.hBulk); },
    years() { const y = new Date().getFullYear(); return [y - 1, y, y + 1, y + 2]; },
    holidayList() {
      return Object.entries(this.allHolidays).filter(([d]) => d.startsWith(String(this.hYear)))
        .map(([date, h]) => ({ date, name: h.name, exceptUids: h.exceptUids || [] })).sort((a, b) => a.date.localeCompare(b.date));
    },
    // The holiday form's staff checklist, by department like the Records table (interns in their own group).
    holidayStaffGroups() {
      const q = this.hSearch.trim().toLowerCase();
      const groups = new Map();
      for (const s of this.staff) {
        if (q && !s.name.toLowerCase().includes(q)) continue;
        const title = s.intern ? 'Interns' : (ROLE_LABEL[s.role] || s.role || 'No department');
        if (!groups.has(title)) groups.set(title, []);
        groups.get(title).push(s);
      }
      return [...groups].sort((a, b) => (a[0] === 'Interns') - (b[0] === 'Interns') || a[0].localeCompare(b[0]))
        .map(([title, people]) => ({ title, people }));
    },
    hTicked() { return this.staff.filter(s => !this.hExcept.includes(s.uid)).length; },
    hTickedText() {
      const n = this.hTicked, all = this.staff.length;
      return n === all ? `All ${all} staff get this holiday.` : `${n} of ${all} staff get this holiday. The others work as normal that day.`;
    }
  },
  async mounted() {
    window.addEventListener('keydown', this.onKey);
    this.loading = true;
    try {
      const [cfg, staff, first, hol] = await Promise.all([loadConfig(), loadStaff(), loadFirstDay(), loadHolidays()]);
      this.cfg = cfg; this.form = formOf(cfg); this.staff = staff; this.firstDay = first; this.allHolidays = hol;
    } catch (e) { this.error = friendlyError(e, 'load attendance settings and staff'); }
    await this.load();
  },
  beforeUnmount() { window.removeEventListener('keydown', this.onKey); },
  methods: {
    onKey(e) { if (e.key !== 'Escape') return; if (this.fix) this.closeFix(); else if (this.full) this.full = false; },
    clock, duration, minutesOf, hm, weekday, sessionTimes,
    closeFix() { if (!this.busy) this.fix = null; },
    pair(row, k) { return row.pairs ? row.pairs[k - 1] : null; },
    resultPill(kind) { return { late: 'pill amber', offsite: 'pill blue', early: 'pill amber', missing: 'pill red' }[kind] || ''; },
    statusPill(kind) { return { normal: 'pill green', short: 'pill amber', missing: 'pill red', absent: 'pill red', working: 'pill blue', offday: 'pill grey' }[kind] || 'pill grey'; },
    exitFull() { this.full = false; },
    isOpen(uid) { return this.peopleCount === 1 || this.opened.includes(uid); },   // one person shown: always open
    toggle(uid) { this.opened = this.opened.includes(uid) ? this.opened.filter(u => u !== uid) : [...this.opened, uid]; },
    openAll() { this.opened = this.report.groups.flatMap(g => g.people.map(p => p.uid)); },
    daysOf(p) { return this.hideRest ? p.rows.filter(r => r.type !== 'span' && r.type !== 'blank') : p.rows; },
    sumOf(p) {
      const n = k => p.rows.filter(r => r.statusKind === k).length;
      return {
        worked: p.rows.filter(r => r.type === 'work').length,
        late: p.rows.filter(r => r.type === 'work' && r.lateMin > 0).length,
        offsite: p.rows.filter(r => r.offsite).length,
        missing: n('missing'), normal: n('normal'), short: n('short')
      };
    },
    requiredMinutes,
    // Fix / Add: not your own, not a day still running, not rest days with nothing to fix, not the future
    canFix(row) { return row.uid !== this.myUid && row.key <= this.today && !(row.att && row.att.open && row.key === this.today) && (row.type === 'work' || row.type === 'absent' || (row.type === 'blank' && row.key < this.today)); },
    fixRow(row) { return { uid: row.uid, name: row.name, role: row.role, date: row.key, rec: row.att }; },
    dateText(k) { if (!k) return ''; const [y, m, d] = k.split('-'); return `${+d} ${MON[+m - 1]} ${y}`; },
    deptOf(r) { const s = this.staff.find(x => x.uid === r.uid); return r.rec?.department || ROLE_LABEL[r.role || s?.role] || r.role || ''; },
    setQuick(q) {
      this.quick = q;
      if (q === 'today') { this.from = this.to = this.today; }
      else { const m = monthRange(q === 'last' ? -1 : 0); this.from = m.from; this.to = m.to; }
      this.load();
    },
    async load() {
      if (!this.from || !this.to || this.from > this.to) return;
      this.loading = true; this.error = '';
      try {
        this.records = await loadRecords(this.from, this.to);
        this.holidays = Object.fromEntries(Object.entries(this.allHolidays).filter(([d]) => d >= this.from && d <= this.to));
      } catch (e) { this.error = friendlyError(e, 'load attendance'); }
      this.loading = false;
    },
    flash(msg) { this.okMsg = msg; setTimeout(() => { if (this.okMsg === msg) this.okMsg = ''; }, 4000); },

    // ---- Fix / Add ----
    openFix(row) {
      const list = row.rec?.sessions || [];
      // A day still open (no clock-out): start on that clock-in; otherwise the first.
      const open = list.find(x => !x.clockOut);
      const n = open ? (open.session > 1 ? open.session : 1) : 1;
      this.fix = { row, error: '', note: '', session: n, inTime: '', outTime: '' };
      this.pickSession();
    },
    pickSession() {
      const f = this.fix, list = f.row.rec?.sessions || [];
      const x = list.find(s => (s.session > 1 ? s.session : 1) === f.session);
      f.inTime = x?.clockIn ? hhmm(x.clockIn) : toTime(this.cfg.workStartMin);
      f.outTime = x?.clockOut ? hhmm(x.clockOut) : (x ? '' : toTime(this.cfg.workEndMin));
    },
    async saveFix() {
      const me = useSession();
      this.busy = true; this.fix.error = '';
      try {
        await saveCorrection({ row: this.fix.row, session: this.fix.session, inTime: this.fix.inTime, outTime: this.fix.outTime, note: this.fix.note, cfg: this.cfg,
          holidays: this.allHolidays, me, staffMember: this.staff.find(s => s.uid === this.fix.row.uid) });
        const name = this.fix.row.name;
        this.fix = null;
        this.flash(`Attendance saved for ${name}.`);
        await this.load();
      } catch (e) { this.fix.error = e.code ? friendlyError(e, 'save the correction') : e.message; }
      this.busy = false;
    },

    // ---- Holidays ----
    async reloadHolidays() { this.allHolidays = await loadHolidays(); this.holidays = Object.fromEntries(Object.entries(this.allHolidays).filter(([d]) => d >= this.from && d <= this.to)); },
    async addOne() {
      const date = this.hEditing || this.hDate;
      const existing = this.allHolidays[date] || null;
      if (existing && !this.hEditing) { this.error = `${this.dateText(date)} is already a holiday. Use Edit on the list to change it.`; return; }
      // Keep any left-out person who isn't on the staff list any more (they don't show in the checklist).
      const active = new Set(this.staff.map(s => s.uid));
      const keep = (existing?.exceptUids || []).filter(u => !active.has(u));
      const names = Object.fromEntries(this.staff.map(s => [s.uid, s.name]));
      this.busy = true; this.error = '';
      try {
        await addHoliday(date, this.hName, useSession(), { exceptUids: [...this.hExcept, ...keep], existing, names });
        this.flash(`${this.dateText(date)} ${existing ? 'saved' : 'added'}.`); this.hYear = +date.slice(0, 4);
        this.cancelEdit(); await this.reloadHolidays();
      } catch (e) { this.error = e.code ? friendlyError(e, 'save the holiday') : e.message; }
      this.busy = false;
    },
    editHoliday(h) {
      const active = new Set(this.staff.map(s => s.uid));
      this.hEditing = h.date; this.hDate = h.date; this.hName = h.name; this.hSearch = '';
      this.hExcept = h.exceptUids.filter(u => active.has(u));
      this.removing = ''; window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    cancelEdit() { this.hEditing = ''; this.hDate = ''; this.hName = ''; this.hExcept = []; this.hSearch = ''; },
    toggleOne(uid) { this.hExcept = this.hExcept.includes(uid) ? this.hExcept.filter(u => u !== uid) : [...this.hExcept, uid]; },
    toggleGroup(g) {
      const uids = g.people.map(p => p.uid);
      const allOn = uids.every(u => !this.hExcept.includes(u));
      this.hExcept = allOn ? [...new Set([...this.hExcept, ...uids])] : this.hExcept.filter(u => !uids.includes(u));
    },
    exceptNames(h) {
      if (!h.exceptUids.length) return 'Everyone gets this holiday';
      const byUid = new Map(this.staff.map(s => [s.uid, s.name]));
      return `Working as normal: ${h.exceptUids.map(u => byUid.get(u) || 'Former staff').join(', ')}`;
    },
    async addBulk() {
      // Dates already on the list are skipped, so a paste never wipes who a holiday is for.
      const list = this.bulk.list.filter(h => !this.allHolidays[h.date]);
      const skipped = this.bulk.list.length - list.length;
      const skipText = skipped ? ` ${skipped} already on the list, skipped.` : '';
      if (!list.length) { this.error = `All of these dates are already on the list.`; return; }
      this.busy = true; this.error = '';
      try { await addHolidays(list, useSession()); this.flash(`${list.length} holiday${list.length === 1 ? '' : 's'} added.${skipText}`); this.hBulk = ''; await this.reloadHolidays(); }
      catch (e) { this.error = friendlyError(e, 'add the holidays'); }
      this.busy = false;
    },
    async removeOne(date) {
      this.busy = true; this.error = '';
      try { await removeHoliday(date, useSession()); this.removing = ''; if (this.hEditing === date) this.cancelEdit(); this.flash(`${this.dateText(date)} removed.`); await this.reloadHolidays(); }
      catch (e) { this.error = friendlyError(e, 'remove the holiday'); }
      this.busy = false;
    },

    // ---- Settings ----
    async saveSettings() {
      const f = this.form;
      if (!(f.radiusM >= 50 && f.radiusM <= 2000)) { this.error = 'Allowed distance must be between 50 and 2000 metres.'; return; }
      if (!(Math.abs(f.lat) <= 90 && Math.abs(f.lng) <= 180)) { this.error = 'Check the latitude and longitude.'; return; }
      this.busy = true; this.error = '';
      try {
        const cfg = { ...f, workStartMin: toMin(f.start), lateAfterMin: toMin(f.late), workEndMin: toMin(f.end) };
        await saveConfig(cfg, useSession());
        this.cfg = await loadConfig();
        this.flash('Settings saved. The app uses them from the next clock-in.');
      } catch (e) { this.error = friendlyError(e, 'save the settings'); }
      this.busy = false;
    },

    // ---- Excel ----
    async exportXlsx() {
      this.exporting = true; this.error = '';
      try {
        const XLSX = await loadXlsxLib();
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, reportSheet(this.report, XLSX, generatedStamp()), 'Sheet1');
        XLSX.writeFile(wb, `Attendance ${this.from} to ${this.to}.xlsx`);
      } catch (e) { this.error = friendlyError(e, 'export to Excel'); }
      this.exporting = false;
    }
  }
};
</script>

<style scoped>
.at-date { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--text-2); }
.at-date .input { height: 36px; width: auto; }
.at-dist { display: block; color: var(--muted); font-size: 11px; }
.at-sess { display: block; color: var(--blue); font-size: 11px; font-weight: 600; cursor: help; }
/* Daily Report table: the usual PMS table (.table), a few extras */
.at-wrap { max-height: 70vh; overflow: auto; scrollbar-gutter: stable; }   /* room for the scrollbar kept, so the table doesn't narrow when it appears */
/* Fixed layout: columns keep their width whatever rows are open. Clock in → out takes the rest. */
.at-table { table-layout: fixed; min-width: 1100px; }
.at-table col.c-name { width: 220px; }
.at-table col.c-pos { width: 140px; }
.at-table col.c-date { width: 130px; }
.at-table col.c-num { width: 95px; }
.at-table col.c-abs { width: 80px; }
.at-table col.c-status { width: 170px; }
.at-table col.c-act { width: 70px; }
.at-table td { overflow-wrap: anywhere; }
.at-table thead th { position: sticky; top: 0; z-index: 2; }
.at-table td, .at-table th { padding: 9px 12px; }
.at-table .at-group td { background: var(--head); font-weight: 600; font-size: 13px; padding-top: 14px; }
.at-table .at-today td { background: var(--accent-soft); }
.at-table .at-act { white-space: nowrap; }
.at-red-text { color: var(--red); }
.at-name-th > span { display: block; margin-bottom: 6px; }
.at-name-filter { font-weight: 400; }
.at-name-filter .op-btn { height: 30px; font-size: 12px; }
.at-fixed { display: block; font-size: 10px; color: var(--blue); }
.at-bar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; padding: 0 16px 10px; }
.at-inline { margin: 0 0 0 6px; }
.at-table .at-person { cursor: pointer; }
.at-table .at-person td { border-top: 1px solid var(--border); }
.at-table .at-day td { font-size: 13px; padding-top: 6px; padding-bottom: 6px; }
.at-caret { border: 0; background: none; cursor: pointer; width: 22px; padding: 0; color: var(--muted); font-size: 12px; }
.at-pairs { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
.at-pair { display: inline-flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.at-pair .pill { font-size: 11px; }
/* Holiday form: who gets it */
.at-who-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 6px; }
.at-who-head label { margin: 0; }
.at-who-search { margin-bottom: 6px; }
.at-who-list { border: 1px solid var(--border); border-radius: 10px; padding: 6px 12px 10px; max-height: 280px; overflow: auto; }
.at-who-dept { display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--muted); margin: 10px 0 2px; }
.at-who-person { display: flex; margin: 2px 0; }
.at-link { border: 0; background: none; padding: 0; color: var(--blue); font-size: 12px; cursor: pointer; }
/* Full screen: the report card fills the window (Esc or the button to leave) */
.at-card.at-full { position: fixed; inset: 0; z-index: 60; margin: 0; border-radius: 0; display: flex; flex-direction: column; overflow: hidden; }
.at-card.at-full .at-wrap { flex: 1; max-height: none; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.at-note { max-width: 260px; font-size: 13px; }
.at-note small { display: block; }
.nowrap { white-space: nowrap; }
.num { font-variant-numeric: tabular-nums; }
.at-bulk { height: auto; min-height: 88px; padding: 10px 12px; resize: vertical; }
.at-hr { border: 0; border-top: 1px solid var(--border); margin: 20px 0; }
.at-settings { max-width: 760px; }
.at-three { grid-template-columns: 1fr 1fr 1fr; }
.at-days { display: flex; flex-wrap: wrap; gap: 8px 16px; }
.at-modal { max-width: 520px; }
.at-modal h2 { font-size: 17px; margin: 0 0 14px; }
.at-acts { display: flex; justify-content: flex-end; gap: 8px; }
@media (max-width: 900px) { .kpis { grid-template-columns: repeat(2, minmax(0,1fr)); } }
@media (max-width: 640px) { .at-three { grid-template-columns: 1fr; } }
</style>
