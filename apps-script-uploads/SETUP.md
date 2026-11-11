# Uploads on the company Drive: setup steps

All PMS uploads except Agreements (SOPs, Issues, Expenses, Offline Payments, Utility Bills, Owner Leads, Announcements,
Owner Payments) go through `api/drive.js` on Vercel. This small Apps Script lets that function use the **company Google
account**. It is a separate project from Neo's Agreements script (see `SETUP.md`), set up the same way.

Do steps 1 to 3 signed in as the company account (support@widebed.com).

## 1. Make the folder
In the company Drive, create **Widebed PMS Files** (not the Agreements folder). Copy its ID, the part after `/folders/`.
The function makes the page folders inside it (Issues, Expenses, HR SOPs ...) when they are first needed.

## 2. Create the Apps Script
1. <https://script.google.com> > **New project**, named *Widebed PMS Uploads*.
2. Replace `Code.gs` with `apps-script-uploads/Code.gs`.
3. Project Settings > tick **Show "appsscript.json" manifest file**, then replace it with `apps-script-uploads/appsscript.json`.
4. Project Settings > **Script properties**, add two:
   - `ROOT_FOLDER_ID` = the folder ID from step 1
   - `PMS_KEY` = a long random password (30+ characters, letters and numbers). Keep it; it goes into Vercel too.
5. In the editor, choose **authorize** at the top and press **Run**. Approve the Drive permission. The log shows the folder name.

## 3. Deploy it
**Deploy > New deployment > Web app**, Execute as **Me**, Who has access **Anyone**. Deploy and copy the URL (ends in `/exec`).
After changing `Code.gs` later: Manage deployments > Edit > Version: New version, so the URL stays the same.

## 4. Connect the PMS
1. Vercel > Settings > Environment Variables (Production and Preview):
   - `DRIVE_SCRIPT_URL` = the `/exec` URL
   - `DRIVE_SCRIPT_KEY` = the same value as `PMS_KEY`
   When these are set, `GOOGLE_OAUTH_*` and `DRIVE_ROOT_FOLDER_ID` are no longer used. Delete them once uploads work.
2. Add the same two lines to `vercel-drive.env.local` for `npm run dev`, and restart it.
3. Redeploy on Vercel.

## 5. Files uploaded before the switch
They stay in the old personal Drive and the PMS still points at them by ID. From that account, share the old root
folder with support@widebed.com as **Editor** so they still open in the PMS, or move them into the new folder.

## Check
Upload a photo on an Issue: it appears in *Widebed PMS Files > Issues > <month>*. Open an older upload: it still loads.
