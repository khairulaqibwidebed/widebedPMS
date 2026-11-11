# Agreements: setup steps

Do these once. Steps 1–3 need the **company Google account** (the one that should own the files).

## 1. Make the Drive folder

1. In Google Drive (company account), create a folder, e.g. **Widebed PMS Agreements**.
2. Open it and copy the ID from the address bar. It is the part after `/folders/`.
   For example, `https://drive.google.com/drive/folders/1AbC…xyz` has the ID `1AbC…xyz`.

The script makes three sub-folders inside it the first time they are needed: *Templates*, *Attachments* (IC copies) and *Generated agreements*.

## 2. Create the Apps Script

1. Go to <https://script.google.com> → **New project**. Name it *Widebed PMS Agreements*.
2. Delete what is in `Code.gs` and paste in the whole of `apps-script/Code.gs`.
3. **Project Settings** (gear icon) → **Script properties** → add two:
   - `ROOT_FOLDER_ID` = the folder ID from step 1
   - `FIREBASE_PROJECT_ID` = `projectId` from `src/firebase-config.js`
4. Save.

## 3. Deploy it

1. **Deploy → New deployment → Select type: Web app**.
2. *Execute as*: **Me** (the company account). *Who has access*: **Anyone**.
   "Anyone" only means the address can be called. Every call is checked against the person's PMS sign-in, and switched-off accounts are refused.
3. Click **Deploy** and approve the permissions (Drive and external requests).
4. Copy the **Web app URL** (ends in `/exec`).

After changing `Code.gs` later: **Deploy → Manage deployments → Edit → Version: New version**, so the address stays the same.

## 4. Connect the PMS

1. In the project's `.env` file (create it next to `package.json` if there isn't one), add:
   ```
   VITE_AGREEMENTS_DRIVE_URL=https://script.google.com/macros/s/…/exec
   ```
2. Install the new libraries:
   ```
   npm install pdf-lib@1.17.1 @pdf-lib/fontkit@1.1.1 pdfjs-dist@4.10.38
   npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
   ```
   (SheetJS is installed from its own site because the copy on npm is old.)
3. Deploy the new `firestore.rules`:
   ```
   firebase deploy --only firestore:rules
   ```
4. Restart `npm run dev` (Vite only reads `.env` when it starts), then build and deploy as usual.

## 5. Chinese text in PDFs (optional)

The built-in PDF fonts only cover English letters. For the (CN) agreements, download **Noto Sans SC**
(<https://fonts.google.com/noto/specimen/Noto+Sans+SC> → Download family). Copy `NotoSansSC-Regular.ttf` into the
project as `public/fonts/NotoSansSC-Regular.ttf`. The PDF then uses it automatically for Chinese text and includes
only the characters it needs. Without it, Chinese characters print as `?` and the preview warns about it.

## 6. Who can do what

- **Everyone signed in:** can fill in forms, see and edit all records, generate PDFs and download them.
- **Agreement Setup:** Directors always have it. Tick it for anyone else on *Staff accounts → Page access → Agreements*.
  It allows creating forms, changing fields and formulas, uploading templates and placing fields.
- Records, forms and templates are **archived**, never deleted, and the main actions go into the audit log.

## Try it

1. **Agreement Setup → New form → Start from: General Tenancy** (built from your Google Sheet).
2. **Upload template**: choose the General Tenancy PDF and link it to that form.
3. In the designer, drag *Name of Tenant*, *Monthly Rental*, *Security Deposit (Rent)* … onto the page.
   Tick **Preview values** to see sample text in place, then **Preview PDF** for the real file.
4. **Agreements → + New General Tenancy**: fill it in, sign, **Save as completed** → **Generate agreement**.
