# Staff Attendance – Phase 5 (PMS side), 11 Nov 2026

New page **HR > Attendance** (`/HR/attendance`), Directors and HR only (same as Staff Accounts, never tickable).

## Files
| File | What |
|---|---|
| `src/pages/HR/Attendance.vue` | **New.** The page: Records, Public holidays, Office settings tabs |
| `src/pages/HR/attendance.js` | **New.** Loading, the table rows, corrections, holidays, settings, Excel rows |
| `src/pages/HR/__tests__/attendance.test.js` | **New.** `npm test` |
| `src/router.js` | One line: `page('/HR/attendance', …, 'Attendance', DH)` after Announcements |
| `src/nav.js` | `ATTENDANCE` item added to the HR group for Directors (`HR_DIR`) and HR (`HR_HR`) |
| `src/pages/Settings/AuditLog.vue` | Names for the five new audit actions (`attendance.*`), shown under "HR & Playbook" |
| `firebase/firestore.rules` + `firestore.rules` | **Draft 0.51** (several clock-ins a day) on 0.50 (HR / Director corrections), 0.49 (attendance) and Khairul's 0.48 |
| `firebase/firestore.indexes.json` | The two `attendance` indexes (uid + date) the app needs (same as Phase 3) |

If someone changed `router.js`, `nav.js` or `AuditLog.vue` after this morning, don't overwrite theirs: make the small edits above by hand.

## Publish
```
npm test
npm run build
firebase deploy --only firestore:rules,firestore:indexes --project widebed-pmsdashboard
```
then deploy the site as usual (Vercel).

## The page
- **Records:** Today / This month / Last month or any dates; filter by staff, department, status. Totals: days present, late, missing (no clock-in + no clock-out), hours. One row per record, plus a **Missing** row for each active staff member on each working day with no clock-in (from the first day anyone used the app; never weekends, holidays or today). Shows distance from the office under each time, the late reason, and who fixed it.
- **Export to Excel:** exactly the rows shown (filters apply): date, day, staff, department, status, times, hours (decimal and h:mm), late reason, distances, who corrected it and why.
- **Fix / Add:** set the clock-in and clock-out times with a note (required, goes in the audit log). Late / on time / off day is worked out from the times. **You can't fix your own record** (another HR person or a Director must); the rules enforce this.
- **Public holidays:** add one, or paste a list (`2026-12-25 Christmas Day` or `25/12/2026 Christmas Day`, one per line); remove. Holidays are never missing; a clock-in on one is Off day work.
- **Office settings:** name, address, latitude / longitude (with a Google Maps check link), allowed distance (50–2000 m), work start, late after, work end, working days. The app and the rules read these from the next clock-in.

## Rules Draft 0.50
HR and Directors may create or update `attendance/{uid}_{date}` for anyone **but themselves**, keeping the person and date, with `editedBy` = them, `editedAt` = server time and an `editNote` of 3–300 characters. Clock-out must be after clock-in. Still nobody deletes.

## Update, 11 Nov 2026 afternoon: several clock-ins a day
Staff can clock in again after clocking out (out to a client and back). Each return is its own document:
`attendance/{uid}_{day}` (first), then `{uid}_{day}_s2`, `_s3` … (up to 10, field `session`).
- **Rules Draft 0.51:** session n ≥ 2 only when session n−1 exists and is clocked out; same office / server-time / not-mocked checks; never late, no late reason. HR / Director corrections may fix any session (keeps its id and `session`).
- **Page:** one row per person per day: first clock-in, last clock-out, total of the finished clock-ins, "2 clock-ins" under the times (hover for all times). A day whose last clock-in has no clock-out is **No clock-out**. **Fix** asks which clock-in to correct; a later clock-in is never late.
- **Excel:** two more columns, `Clock-ins` and `All times` (e.g. `9:20 AM – 12:00 PM, 2:00 PM – 6:00 PM`).
