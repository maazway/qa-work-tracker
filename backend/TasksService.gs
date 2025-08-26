/** TasksService.gs: business logic for Tasks sheet */
const TasksService = (function(){
  const SHEET_NAME = 'Tasks';

  function listTasks(params) {
    const ss = Utils.getSpreadsheet();
    const sh = ss.getSheetByName(SHEET_NAME);
    if (!sh) throw new Error('Tasks sheet not found');
    const { map, headers, values } = Utils.readSheet(sh);

    // Build filters
    const search = (params.search || '').toString().toLowerCase();
    const fStatus = (params.status || '').toString();
    const fPriority = (params.priority || '').toString();
    const dueFrom = params.dueFrom ? new Date(params.dueFrom) : null;
    const dueTo = params.dueTo ? new Date(params.dueTo) : null;

    // Map rows
    let rows = values.map(r => Utils.objectFromRow(map, r));

    // Filter
    rows = rows.filter(o => {
      if (!o.ID) return false;
      if (search) {
        const hay = [o.Title,o.Description,o.Assignee,o.Tags].join(' ').toLowerCase();
        if (hay.indexOf(search)===-1) return false;
      }
      if (fStatus && o.Status !== fStatus) return false;
      if (fPriority && o.Priority !== fPriority) return false;
      if (dueFrom && (!o.DueDate || new Date(o.DueDate) < dueFrom)) return false;
      if (dueTo && (!o.DueDate || new Date(o.DueDate) > dueTo)) return false;
      return true;
    });

    // Counts
    const countsByStatus = {};
    const countsByPriority = {};
    rows.forEach(o => {
      countsByStatus[o.Status] = (countsByStatus[o.Status]||0)+1;
      countsByPriority[o.Priority] = (countsByPriority[o.Priority]||0)+1;
    });

    // Sort
    const sortBy = params.sortBy || 'UpdatedAt';
    const sortDir = (params.sortDir||'desc').toLowerCase();
    rows.sort((a,b)=>{
      let va = a[sortBy], vb = b[sortBy];
      // Normalize dates
      if (sortBy==='CreatedAt' || sortBy==='UpdatedAt' || sortBy==='DueDate') {
        va = va ? new Date(va).getTime() : 0; vb = vb ? new Date(vb).getTime() : 0;
      }
      if (va<vb) return sortDir==='asc'?-1:1;
      if (va>vb) return sortDir==='asc'?1:-1;
      return 0;
    });

    const total = rows.length;
    const pageSize = parseInt(params.pageSize || 20, 10);
    const page = Math.max(1, parseInt(params.page || 1, 10));
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const start = (page-1)*pageSize;
    const items = rows.slice(start, start + pageSize);

    return { items, total, pages, countsByStatus, countsByPriority };
  }

  function createTask(data, actor) {
    const lock = LockService.getDocumentLock(); lock.waitLock(30000);
    try {
      const ss = Utils.getSpreadsheet();
      const sh = ss.getSheetByName(SHEET_NAME);
      if (!sh) throw new Error('Tasks sheet not found');
      const { map, headers, values } = Utils.readSheet(sh);

      // Validation
      ['Title','Assignee','Priority','Status','DueDate'].forEach(f => {
        if (!data[f]) throw new Error('Missing required field: ' + f);
      });

      const now = Utils.nowIso();
      const id = Utils.generateTaskId(ss);

      const rowObj = {
        ID: id,
        Title: data.Title || '',
        Description: data.Description || '',
        Assignee: data.Assignee || '',
        Priority: data.Priority || 'Medium',
        Status: data.Status || 'To Do',
        CreatedAt: now,
        UpdatedAt: now,
        DueDate: data.DueDate || '',
        Tags: data.Tags || ''
      };

      // Append
      const row = Utils.rowFromObject(map, rowObj);
      sh.appendRow(row);

      // History: no explicit field changes on creation per spec (0..n rows). We'll log Created minimal.
      HistoryService.appendLog({
        TaskID: id, Field: 'Create', OldValue: '', NewValue: JSON.stringify(rowObj), Note: data.Note || '', ChangedBy: actor || 'WebUser'
      });

      return rowObj;
    } finally {
      lock.releaseLock();
    }
  }

  function updateTask(id, changes, note, actor) {
    if (!id) throw new Error('Missing id');
    const lock = LockService.getDocumentLock(); lock.waitLock(30000);
    try {
      const ss = Utils.getSpreadsheet();
      const sh = ss.getSheetByName(SHEET_NAME);
      if (!sh) throw new Error('Tasks sheet not found');
      const { map, headers, values } = Utils.readSheet(sh);
      const colId = map.ID + 1;
      const idList = values.map(r => r[map.ID]);
      const idx = idList.indexOf(id);
      if (idx === -1) throw new Error('Task not found');

      const rowPos = idx + 2; // + header
      const rowVals = sh.getRange(rowPos, 1, 1, headers.length).getValues()[0];
      const obj = Utils.objectFromRow(map, rowVals);
      const now = Utils.nowIso();
      obj.UpdatedAt = now;

      const updates = {};
      Object.keys(changes||{}).forEach(f => {
        if (f==='ID' || f==='CreatedAt') return;
        const oldV = obj[f];
        const newV = changes[f];
        if (newV === undefined) return;
        if (String(oldV||'') === String(newV||'')) return;
        obj[f] = newV;
        updates[f] = newV;
        HistoryService.appendLog({
          TaskID: id, Field: f, OldValue: oldV, NewValue: newV, Note: note||'', ChangedBy: actor || 'WebUser'
        });
      });

      // Always write UpdatedAt if any change
      const rowUpdate = Utils.rowFromObject(map, obj);
      sh.getRange(rowPos, 1, 1, headers.length).setValues([rowUpdate]);
      return obj;
    } finally {
      lock.releaseLock();
    }
  }

  function moveStatus(id, newStatus, note, actor) {
    return updateTask(id, { Status: newStatus }, note||'Kanban move', actor);
  }

  function deleteTask(id, note, actor) {
    const lock = LockService.getDocumentLock(); lock.waitLock(30000);
    try {
      const ss = Utils.getSpreadsheet();
      const sh = ss.getSheetByName(SHEET_NAME);
      if (!sh) throw new Error('Tasks sheet not found');
      const { map, headers, values } = Utils.readSheet(sh);
      const idList = values.map(r => r[map.ID]);
      const idx = idList.indexOf(id);
      if (idx === -1) throw new Error('Task not found');
      const rowPos = idx + 2;
      const rowVals = sh.getRange(rowPos, 1, 1, headers.length).getValues()[0];
      const obj = Utils.objectFromRow(map, rowVals);

      // Log delete
      HistoryService.appendLog({
        TaskID: id, Field: 'Delete', OldValue: JSON.stringify(obj), NewValue: '', Note: note||'', ChangedBy: actor || 'WebUser'
      });
      sh.deleteRow(rowPos);
      return { deleted: true };
    } finally {
      lock.releaseLock();
    }
  }

  return { listTasks, createTask, updateTask, moveStatus, deleteTask };
})();
