/** WebApp.gs - HTTP layer */
function doGet(e) {
  try {
    if (!Utils.checkAuth(e)) return Utils.addCors(Utils.jsonError(new Error('Unauthorized')));
    const action = (e.parameter.action||'').toString();
    if (action === 'listTasks') {
      const data = TasksService.listTasks({
        search: e.parameter.search,
        status: e.parameter.status,
        priority: e.parameter.priority,
        dueFrom: e.parameter.dueFrom,
        dueTo: e.parameter.dueTo,
        sortBy: e.parameter.sortBy,
        sortDir: e.parameter.sortDir,
        page: parseInt(e.parameter.page||'1',10),
        pageSize: parseInt(e.parameter.pageSize||'20',10)
      });
      return Utils.addCors(Utils.jsonOk(data));
    } else if (action === 'getHistory') {
      const taskId = e.parameter.taskId;
      const rows = HistoryService.getHistory(taskId);
      return Utils.addCors(Utils.jsonOk(rows));
    } else if (action === 'init') {
      initSpreadsheet();
      return Utils.addCors(Utils.jsonOk('initialized'));
    } else {
      return Utils.addCors(Utils.jsonError(new Error('Unknown action')));
    }
  } catch (err) {
    return Utils.addCors(Utils.jsonError(err));
  }
}

function doPost(e) {
  try {
    if (!Utils.checkAuth(e)) return Utils.addCors(Utils.jsonError(new Error('Unauthorized')));
    const action = (e.parameter.action||'').toString();
    const body = e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
    if (action === 'createTask') {
      const obj = TasksService.createTask(body, 'WebUser');
      return Utils.addCors(Utils.jsonOk(obj));
    } else if (action === 'updateTask') {
      const obj = TasksService.updateTask(body.id, body.changes||{}, body.note||'', 'WebUser');
      return Utils.addCors(Utils.jsonOk(obj));
    } else if (action === 'moveStatus') {
      const obj = TasksService.moveStatus(body.id, body.newStatus, body.note||'', 'WebUser');
      return Utils.addCors(Utils.jsonOk(obj));
    } else if (action === 'deleteTask') {
      const obj = TasksService.deleteTask(body.id, body.note||'', 'WebUser');
      return Utils.addCors(Utils.jsonOk(obj));
    } else {
      return Utils.addCors(Utils.jsonError(new Error('Unknown action')));
    }
  } catch (err) {
    return Utils.addCors(Utils.jsonError(err));
  }
}

function doOptions(e) {
  const resp = ContentService.createTextOutput('');
  return Utils.addCors(resp);
}
