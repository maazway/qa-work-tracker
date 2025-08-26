/** HistoryService.gs */
const HistoryService = (function(){
  const SHEET_NAME = 'History';

  function appendLog({ TaskID, Field, OldValue, NewValue, Note, ChangedBy }) {
    const ss = Utils.getSpreadsheet();
    const sh = ss.getSheetByName(SHEET_NAME);
    if (!sh) throw new Error('History sheet not found');
    const { map } = Utils.readSheet(sh);
    const row = [];
    const log = {
      LogID: Utils.generateLogId(), TaskID,
      ChangedAt: Utils.nowIso(), ChangedBy: ChangedBy || 'WebUser',
      Field, OldValue, NewValue, Note: Note || ''
    };
    const arr = Utils.rowFromObject(map, log);
    sh.appendRow(arr);
    return log;
  }

  function getHistory(taskId) {
    const ss = Utils.getSpreadsheet();
    const sh = ss.getSheetByName(SHEET_NAME);
    if (!sh) throw new Error('History sheet not found');
    const { map, values } = Utils.readSheet(sh);
    const rows = values
      .map(r => Utils.objectFromRow(map, r))
      .filter(o => o.TaskID === taskId)
      .sort((a,b)=> new Date(a.ChangedAt).getTime() - new Date(b.ChangedAt).getTime());
    return rows;
  }

  return { appendLog, getHistory };
})();
