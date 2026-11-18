# Maintenance Master Record Google Sheet - setup (18 Nov 2026)

No Vercel settings and no passwords. One Apps Script attached to the Sheet does the work, under the company Google account.
The PMS side is src/lib/maintenance-sheet.js; Firestore rules Draft 0.84 must be published first.

## Steps (company Google account, the one that owns the Master Record Sheet)
1. Test first on a copy: open the 2026 Master Record Sheet > File > Make a copy. Use the copy for steps 2-7.
2. In the Sheet: Extensions > Apps Script.
3. Delete what is in Code.gs and paste all of apps-script-maintenance-sheet/Code.gs.
4. Project Settings (gear) > tick "Show appsscript.json manifest file in editor". Open appsscript.json, replace it with
   apps-script-maintenance-sheet/appsscript.json. Save (Ctrl+S).
5. Pick "authorize" in the function list at the top, press Run, allow the permissions (Advanced > Go to ... if Google warns).
   It remembers this file as that year's file (the year in the file name, e.g. "2026 Master Record").
6. Deploy > New deployment > gear > Web app. Execute as: Me. Who has access: Anyone. Deploy. Copy the Web app URL
   (https://script.google.com/macros/s/.../exec).
7. In the PMS as a Director: Finance > Expenses & Reimbursements > Maintenance tab > "Sheet settings". Paste the Web app URL
   and the Sheet's own link. Save and sync.

## New year
Nothing to do. The first 2027 ticket that syncs makes "2027 ..." (the 2026 file's name with the year changed) in the same
Drive folder: a copy of the 2026 file with its month tabs emptied down to one "Template" tab (headers, formats, totals).
Other tabs (e.g. Owner list) are copied as they are. Each year's file is remembered in the script properties
(YEAR_2026, YEAR_2027, ...). The PMS "Open <year> Sheet" button opens the right file.
One manual step: the Owner list tab pulls the Owner List file with IMPORTRANGE, and a copied file shows #REF! there
until someone clicks that cell and presses "Allow access" (once per new file). Until then the Unit No dropdowns show
"invalid" and the owner/property lookups are blank. The same applies to any test copy.

## Moving from the test copy to the real Sheet
Do steps 2-6 on the real Sheet (its own script and its own new URL; "authorize" remembers it as the 2026 file because its
name has 2026 in it), then step 7 with the new URL and link. The first sync
writes every PMS ticket of the year into the real Sheet. The copy can then be deleted.

## After changing Code.gs later
Deploy > Manage deployments > pencil > Version: New version > Deploy. The URL stays the same.

## How it behaves
- Writes into the team's month tabs ("Nov 26"; "November 2026" etc. also match; a missing month tab is made). Headers are
  found by name in the first 5 rows (row 2 normally). Only rows whose ID is a PMS ticket (IS-0001) are touched; other rows,
  the row 1 totals (their SUM range is stretched to the last row) and the team's own columns are left alone. New tickets
  go at the bottom; Profit gets the usual =IF(WB="","",WB-Cost) formula. "PMS synced at" and "Sheet edited at" are added at
  the end of the header row.
- Editable in the Sheet (comes back to the PMS): Area, Action Date, Solution/Action Taken, Cost Remarks.
- Everything else the PMS writes (money, owner, unit, dates) comes from the PMS; a single-cell edit there is put back.
- The team's own columns (Status_One, Email_Status_One, Status_Two, Email_Status_Two, Update_By, Cost On) are never touched.
- Syncs: when the Maintenance tab opens, after each charge / edit / remove, "Sync Google Sheet" (whole year), and every
  5 minutes while the tab is in front. Only Accounting (Expenses Edit tick) and Directors can sync.

## Fillout formulas (18 Nov 2026)
The old month tabs fill Owner's Name, emails, Property_Name and the Drive link with one formula in the header cell
(ARRAYFORMULA + XLOOKUP on Unit No, from Fillout days) and Unit No has a dropdown. Fillout is no longer used, so in the
month tabs the PMS writes to (Nov 2026 on): paste those columns as values only (from the header row down) and remove the
Unit No dropdown; the PMS fills them. If a column formula is left in, the script leaves that column empty for PMS rows
(the formula fills it) instead of breaking it with #REF!.
