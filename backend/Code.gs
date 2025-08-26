/** Code.gs
 * Entry and config helpers for QA Work Tracker (Google Apps Script).
 * Set Script Properties:
 * - SPREADSHEET_ID: target spreadsheet ID
 * - APP_PASSWORD: optional simple auth secret (front-end sends in X-APP-KEY)
 */
function initSpreadsheet() {
  const ss = Utils.getSpreadsheet();
  Utils.ensureSheetHeaders(ss, 'Tasks', [
    'ID','Title','Description','Assignee','Priority','Status','CreatedAt','UpdatedAt','DueDate','Tags'
  ]);
  Utils.ensureSheetHeaders(ss, 'History', [
    'LogID','TaskID','ChangedAt','ChangedBy','Field','OldValue','NewValue','Note'
  ]);
  return 'OK';
}
