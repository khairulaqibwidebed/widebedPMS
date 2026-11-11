// Widebed PMS Uploads (11 Nov 2026). Runs under the company Google account (support@widebed.com), deployed like
// Neo's Agreements script but kept as its own project so the two never mix.
//
// The PMS server (Vercel, api/drive.js) calls this to get a short-lived Google Drive access token for this account,
// plus the uploads folder ID. The server then does the uploads, lists and downloads itself, exactly as before.
// Only the server knows PMS_KEY, and the server only acts for signed-in PMS staff.
//
// Script properties (Project Settings > Script properties):
//   ROOT_FOLDER_ID = the "Widebed PMS Files" folder in the company Drive (not the Agreements folder)
//   PMS_KEY        = a long random password; the same value goes in Vercel as DRIVE_SCRIPT_KEY

function doPost(e) {
  var out;
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var props = PropertiesService.getScriptProperties();
    var key = props.getProperty('PMS_KEY');
    if (!key || key.length < 20 || body.key !== key) throw new Error('Not allowed.');
    if (body.action !== 'token') throw new Error('Unknown action.');
    var root = props.getProperty('ROOT_FOLDER_ID') || '';
    if (!root) throw new Error('ROOT_FOLDER_ID is not set in the script properties.');
    out = { ok: true, token: ScriptApp.getOAuthToken(), rootFolderId: root, expiresIn: 2700 };
  } catch (err) {
    out = { ok: false, error: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

// Run this once from the editor (choose "authorize" at the top, press Run) so Google asks for the Drive permission.
// It also checks ROOT_FOLDER_ID points at a real folder.
function authorize() {
  var root = PropertiesService.getScriptProperties().getProperty('ROOT_FOLDER_ID');
  Logger.log(root ? 'Uploads folder: ' + DriveApp.getFolderById(root).getName() : 'ROOT_FOLDER_ID is not set yet.');
}
