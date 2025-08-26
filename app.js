/* QA Work Tracker Frontend - Vanilla JS (module) */
const CONFIG = {
  WEB_APP_URL:
    'https://script.google.com/macros/s/AKfycbyLmxLHB8M_GZLn7cZlwou-37u3QGnKpZYrH88OHX4-jbnenyKELWPS7zg8GnPfXZ00Ag/exec', // <-- PASTE setelah deploy
  APP_PASSWORD: '', // optional; dikirim via query ?key=...
  PAGE_SIZE_DEFAULT: 20,
};

// ---------- Utilities ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const qs = (sel, el = document) => el.querySelector(sel);
const qsa = (sel, el = document) => Array.from(el.querySelectorAll(sel));
const isoNow = () => new Date().toISOString();

function toast(msg) {
  const wrap = qs('#toast');
  const box = wrap.firstElementChild;
  box.textContent = msg;
  wrap.classList.remove('hidden');
  setTimeout(() => wrap.classList.add('hidden'), 2200);
}

function downloadCSV(filename, rows) {
  const head = Object.keys(rows[0] || {});
  const escape = (v) => (v == null ? '' : ('' + v).replace(/"/g, '""'));
  const csv = [head.join(',')]
    .concat(rows.map((r) => head.map((h) => `"${escape(r[h])}"`).join(',')))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const debounce = (fn, wait = 300) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
};

const fmtDate = (d) => (!d ? '' : new Date(d).toLocaleDateString());

// ---------- Theme ----------
function applyThemeIcon() {
  const isDark = document.documentElement.classList.contains('dark');
  qs('#iconSun').classList.toggle('hidden', !isDark);
  qs('#iconMoon').classList.toggle('hidden', isDark);
}
function toggleTheme() {
  const root = document.documentElement;
  const dark = root.classList.toggle('dark');
  localStorage.setItem('qa_theme', dark ? 'dark' : 'light');
  applyThemeIcon();
}

// ---------- API (tanpa preflight CORS) ----------
function withAuth(urlObj) {
  if (CONFIG.APP_PASSWORD) urlObj.searchParams.set('key', CONFIG.APP_PASSWORD);
  return urlObj;
}

async function apiGet(action, params = {}) {
  const url = withAuth(new URL(CONFIG.WEB_APP_URL));
  url.searchParams.set('action', action);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  });
  const res = await fetch(url.toString()); // simple GET, no custom headers
  return res.json();
}

async function apiPost(action, body = {}) {
  const url = withAuth(new URL(CONFIG.WEB_APP_URL));
  url.searchParams.set('action', action);
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // simple request (no preflight)
    body: JSON.stringify(body),
  });
  return res.json();
}

// ---------- State ----------
const state = {
  view: 'table',
  sortBy: 'UpdatedAt',
  sortDir: 'desc',
  page: 1,
  pageSize: CONFIG.PAGE_SIZE_DEFAULT,
  filters: { search: '', status: '', priority: '', dueFrom: '', dueTo: '' },
  list: [],
  total: 0,
  pages: 1,
  countsByStatus: {},
  countsByPriority: {},
  currentTask: null,
};

// ---------- UI Wiring ----------
function setView(view) {
  state.view = view;
  qs('#tableView').classList.toggle('hidden', view !== 'table');
  qs('#kanbanView').classList.toggle('hidden', view !== 'kanban');
  loadList();
}

function bindTopBar() {
  qs('#btnTable').addEventListener('click', () => setView('table'));
  qs('#btnKanban').addEventListener('click', () => setView('kanban'));
  qs('#btnNewTask').addEventListener('click', () => openModal());
  qs('#btnExport').addEventListener('click', () => {
    if (state.list.length === 0) return toast('No data to export');
    downloadCSV(`qa-work-tracker-${Date.now()}.csv`, state.list);
  });

  // Theme toggle
  qs('#btnTheme').addEventListener('click', toggleTheme);
  applyThemeIcon();

  const onFilter = debounce(() => {
    state.page = 1;
    state.filters.search = qs('#searchInput').value.trim();
    state.filters.status = qs('#statusFilter').value;
    state.filters.priority = qs('#priorityFilter').value;
    state.filters.dueFrom = qs('#dueFrom').value;
    state.filters.dueTo = qs('#dueTo').value;
    loadList();
  }, 350);
  [
    '#searchInput',
    '#statusFilter',
    '#priorityFilter',
    '#dueFrom',
    '#dueTo',
  ].forEach((id) => qs(id).addEventListener('input', onFilter));

  qs('#prevPage').addEventListener('click', () => {
    if (state.page > 1) {
      state.page--;
      loadList();
    }
  });
  qs('#nextPage').addEventListener('click', () => {
    if (state.page < state.pages) {
      state.page++;
      loadList();
    }
  });
  qs('#pageSize').addEventListener('change', (e) => {
    state.pageSize = +e.target.value;
    state.page = 1;
    loadList();
  });

  // Sorting headers
  qsa('th[data-sort]').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.getAttribute('data-sort');
      if (state.sortBy === key)
        state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      else {
        state.sortBy = key;
        state.sortDir = 'asc';
      }
      loadList();
    });
  });
}

// ---------- Rendering ----------
function renderSummary() {
  const el = qs('#summaryCards');
  el.innerHTML = '';
  const statuses = [
    'Backlog',
    'To Do',
    'In Progress',
    'In Review',
    'Blocked',
    'Done',
  ];
  const priorities = ['Low', 'Medium', 'High', 'Critical'];

  const makeCard = (title, count) => `
    <div class="rounded-2xl border border-slate-200 bg-white p-3 dark:bg-slate-950 dark:border-slate-800">
      <div class="text-xs text-slate-500 dark:text-slate-400">${title}</div>
      <div class="text-2xl font-bold mt-1">${count || 0}</div>
    </div>`;

  statuses.forEach((s) =>
    el.insertAdjacentHTML(
      'beforeend',
      makeCard(s, state.countsByStatus[s] || 0)
    )
  );
  priorities.forEach((p) =>
    el.insertAdjacentHTML(
      'beforeend',
      makeCard(p, state.countsByPriority[p] || 0)
    )
  );
}

function renderTable() {
  const body = qs('#tableBody');
  body.innerHTML = '';
  for (const t of state.list) {
    const tr = document.createElement('tr');
    tr.className = 'border-t border-slate-200 dark:border-slate-800';
    tr.innerHTML = `
      <td class="px-4 py-2 text-slate-500 dark:text-slate-400">${t.ID}</td>
      <td class="px-4 py-2"><input data-id="${
        t.ID
      }" data-field="Title" class="inline-edit w-full bg-transparent border border-transparent focus:border-slate-300 dark:focus:border-slate-700 rounded-lg px-2 py-1" value="${
      t.Title || ''
    }"/></td>
      <td class="px-4 py-2"><input data-id="${
        t.ID
      }" data-field="Assignee" class="inline-edit w-full bg-transparent border border-transparent focus:border-slate-300 dark:focus:border-slate-700 rounded-lg px-2 py-1" value="${
      t.Assignee || ''
    }"/></td>
      <td class="px-4 py-2">
        <select data-id="${
          t.ID
        }" data-field="Priority" class="inline-edit w-full bg-transparent border border-transparent focus:border-slate-300 dark:focus:border-slate-700 rounded-lg px-2 py-1">
          ${['Low', 'Medium', 'High', 'Critical']
            .map(
              (p) =>
                `<option ${p === t.Priority ? 'selected' : ''}>${p}</option>`
            )
            .join('')}
        </select>
      </td>
      <td class="px-4 py-2">
        <select data-id="${
          t.ID
        }" data-field="Status" class="inline-edit w-full bg-transparent border border-transparent focus:border-slate-300 dark:focus:border-slate-700 rounded-lg px-2 py-1">
          ${['Backlog', 'To Do', 'In Progress', 'In Review', 'Blocked', 'Done']
            .map(
              (s) => `<option ${s === t.Status ? 'selected' : ''}>${s}</option>`
            )
            .join('')}
        </select>
      </td>
      <td class="px-4 py-2"><input data-id="${
        t.ID
      }" data-field="DueDate" type="date" class="inline-edit w-full bg-transparent border border-transparent focus:border-slate-300 dark:focus:border-slate-700 rounded-lg px-2 py-1" value="${
      t.DueDate || ''
    }"/></td>
      <td class="px-4 py-2"><input data-id="${
        t.ID
      }" data-field="Tags" class="inline-edit w-full bg-transparent border border-transparent focus:border-slate-300 dark:focus:border-slate-700 rounded-lg px-2 py-1" value="${
      t.Tags || ''
    }"/></td>
      <td class="px-4 py-2">
        <button class="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 dark:border-slate-700" data-action="open" data-id="${
          t.ID
        }">View / Edit</button>
      </td>
    `;
    body.appendChild(tr);
  }

  // Inline edit handler
  qsa('.inline-edit', body).forEach((el) => {
    const handler = debounce(async () => {
      const id = el.dataset.id;
      const field = el.dataset.field;
      const val = el.value;
      const res = await apiPost('updateTask', {
        id,
        changes: { [field]: val },
        note: '',
      });
      if (!res.ok) return toast('Update failed: ' + (res.error || ''));
      toast('Updated');
      loadList(false);
    }, 400);
    el.addEventListener('change', handler);
  });

  // Open modal
  qsa('button[data-action="open"]', body).forEach((btn) => {
    btn.addEventListener('click', () => openModal(btn.dataset.id));
  });

  // Pagination info
  qs(
    '#paginationInfo'
  ).textContent = `Page ${state.page} / ${state.pages} • ${state.total} items`;
}

function renderKanban() {
  const statuses = [
    'Backlog',
    'To Do',
    'In Progress',
    'In Review',
    'Blocked',
    'Done',
  ];
  const view = qs('#kanbanView .flex');
  view.innerHTML = '';
  statuses.forEach((status) => {
    const col = document.createElement('div');
    col.className =
      'min-w-[260px] w-[260px] bg-white border border-slate-200 rounded-2xl p-3 dark:bg-slate-950 dark:border-slate-800';
    col.innerHTML = `
      <div class="text-sm font-semibold mb-2">${status} <span class="text-xs text-slate-500 dark:text-slate-400">(${
      state.countsByStatus[status] || 0
    })</span></div>
      <div class="space-y-2 kanban-col" data-status="${status}" aria-label="Kanban column ${status}"></div>
    `;
    view.appendChild(col);
  });

  const group = {};
  state.list.forEach((t) => {
    const s = t.Status || 'Backlog';
    (group[s] = group[s] || []).push(t);
  });

  qsa('.kanban-col', view).forEach((col) => {
    const s = col.dataset.status;
    (group[s] || []).forEach((t) => {
      const card = document.createElement('div');
      card.className =
        'rounded-xl border border-slate-200 bg-white p-3 cursor-move dark:border-slate-800 dark:bg-slate-900';
      card.setAttribute('draggable', 'true');
      card.dataset.id = t.ID;
      card.innerHTML = `
        <div class="font-semibold">${t.Title || '(untitled)'}</div>
        <div class="text-xs text-slate-500 dark:text-slate-400 mt-1">${
          t.Assignee || '-'
        } • ${t.Priority || '-'} • Due ${fmtDate(t.DueDate)}</div>
        <div class="mt-2 flex gap-2">
          <button class="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 dark:border-slate-700" data-action="open" data-id="${
            t.ID
          }">Open</button>
        </div>
      `;
      col.appendChild(card);
    });
  });

  // Drag & Drop
  let dragId = null;
  qsa('[draggable="true"]', view).forEach((card) => {
    card.addEventListener('dragstart', (e) => {
      dragId = card.dataset.id;
      e.dataTransfer.setData('text/plain', dragId);
    });
  });
  qsa('.kanban-col', view).forEach((col) => {
    col.addEventListener('dragover', (e) => e.preventDefault());
    col.addEventListener('drop', async (e) => {
      e.preventDefault();
      const id = dragId || e.dataTransfer.getData('text/plain');
      const newStatus = col.dataset.status;
      const t = state.list.find((x) => x.ID === id);
      if (!t || t.Status === newStatus) return;
      const res = await apiPost('moveStatus', {
        id,
        newStatus,
        note: 'Kanban move',
      });
      if (!res.ok) return toast('Move failed: ' + (res.error || ''));
      toast('Moved to ' + newStatus);
      await loadList();
    });
  });

  // Open from kanban
  qsa('button[data-action="open"]', view).forEach((btn) =>
    btn.addEventListener('click', () => openModal(btn.dataset.id))
  );
}

// ---------- Data Loading ----------
async function loadList() {
  const params = {
    page: state.page,
    pageSize: state.pageSize,
    sortBy: state.sortBy,
    sortDir: state.sortDir,
    search: state.filters.search,
    status: state.filters.status,
    priority: state.filters.priority,
    dueFrom: state.filters.dueFrom,
    dueTo: state.filters.dueTo,
  };
  const res = await apiGet('listTasks', params);
  if (!res.ok) {
    toast('Error: ' + (res.error || ''));
    return;
  }
  state.list = res.data.items;
  state.total = res.data.total;
  state.pages = res.data.pages;
  state.countsByStatus = res.data.countsByStatus || {};
  state.countsByPriority = res.data.countsByPriority || {};
  renderSummary();
  if (state.view === 'table') renderTable();
  else renderKanban();
}

// ---------- Modal (Create / Edit) ----------
function openModal(id = null) {
  const modal = qs('#taskModal');
  modal.classList.add('show');
  qs('#tabDetails').classList.add(
    'text-indigo-400',
    'border-b-2',
    'border-indigo-500'
  );
  qs('#tabHistory').classList.remove('text-indigo-400');
  qs('#historyPanel').classList.add('hidden');

  if (id) {
    const t = state.list.find((x) => x.ID === id);
    state.currentTask = t;
    qs('#modalTitle').textContent = `Edit Task • ${t.ID}`;
    qs('#btnDelete').classList.remove('hidden');
    qs('#fTitle').value = t.Title || '';
    qs('#fAssignee').value = t.Assignee || '';
    qs('#fDescription').value = t.Description || '';
    qs('#fPriority').value = t.Priority || 'Medium';
    qs('#fStatus').value = t.Status || 'To Do';
    qs('#fDueDate').value = t.DueDate || '';
    qs('#fTags').value = t.Tags || '';
    qs('#fNote').value = '';
    qs('#detailMeta').textContent = `Created ${
      t.CreatedAt ? new Date(t.CreatedAt).toLocaleString() : ''
    } • Updated ${t.UpdatedAt ? new Date(t.UpdatedAt).toLocaleString() : ''}`;
    loadHistory(t.ID);
  } else {
    state.currentTask = null;
    qs('#modalTitle').textContent = 'New Task';
    qs('#btnDelete').classList.add('hidden');
    ['#fTitle', '#fAssignee', '#fDescription', '#fTags', '#fNote'].forEach(
      (id) => (qs(id).value = '')
    );
    qs('#fPriority').value = 'Medium';
    qs('#fStatus').value = 'To Do';
    qs('#fDueDate').value = '';
    qs('#detailMeta').textContent = '';
    qs('#historyList').innerHTML = '';
  }
}

async function loadHistory(taskId) {
  const res = await apiGet('getHistory', { taskId });
  const list = qs('#historyList');
  list.innerHTML = '';
  if (!res.ok) {
    list.innerHTML = `<li class="text-red-600 dark:text-red-400">${
      res.error || 'Failed loading history'
    }</li>`;
    return;
  }
  (res.data || []).forEach((h) => {
    const li = document.createElement('li');
    li.className =
      'bg-white border border-slate-200 rounded-xl p-3 dark:bg-slate-900 dark:border-slate-800';
    li.innerHTML = `<div class="text-xs text-slate-500 dark:text-slate-400">${new Date(
      h.ChangedAt
    ).toLocaleString()} • ${h.ChangedBy}</div>
    <div class="mt-1"><span class="text-slate-700 dark:text-slate-200 font-semibold">${
      h.Field
    }</span>: <span class="text-rose-600 dark:text-rose-300 line-through">${
      h.OldValue || ''
    }</span> → <span class="text-emerald-700 dark:text-emerald-300">${
      h.NewValue || ''
    }</span></div>
    ${
      h.Note
        ? `<div class="text-xs text-slate-500 dark:text-slate-400 mt-1">Note: ${h.Note}</div>`
        : ''
    }`;
    list.appendChild(li);
  });
}

function closeModal() {
  qs('#taskModal').classList.remove('show');
}

function bindModal() {
  qs('#closeModal').addEventListener('click', closeModal);
  qs('#btnDelete').addEventListener('click', async () => {
    if (!state.currentTask) return;
    if (!confirm('Delete this task?')) return;
    const res = await apiPost('deleteTask', {
      id: state.currentTask.ID,
      note: 'Deleted from modal',
    });
    if (!res.ok) return toast('Delete failed: ' + (res.error || ''));
    toast('Deleted');
    closeModal();
    loadList();
  });
  qs('#btnSave').addEventListener('click', async () => {
    const data = {
      Title: qs('#fTitle').value.trim(),
      Description: qs('#fDescription').value.trim(),
      Assignee: qs('#fAssignee').value.trim(),
      Priority: qs('#fPriority').value,
      Status: qs('#fStatus').value,
      DueDate: qs('#fDueDate').value,
      Tags: qs('#fTags').value.trim(),
    };
    const note = qs('#fNote').value.trim();

    if (!state.currentTask) {
      if (
        !data.Title ||
        !data.Assignee ||
        !data.Priority ||
        !data.Status ||
        !data.DueDate
      ) {
        return toast(
          'Please fill Title, Assignee, Priority, Status, Due Date.'
        );
      }
      const res = await apiPost('createTask', data);
      if (!res.ok) return toast('Create failed: ' + (res.error || ''));
      toast('Created');
      closeModal();
      loadList();
    } else {
      const res = await apiPost('updateTask', {
        id: state.currentTask.ID,
        changes: data,
        note,
      });
      if (!res.ok) return toast('Save failed: ' + (res.error || ''));
      toast('Saved');
      closeModal();
      loadList();
    }
  });

  // Tabs
  qs('#tabDetails').addEventListener('click', () => {
    qs('#tabDetails').classList.add(
      'text-indigo-400',
      'border-b-2',
      'border-indigo-500'
    );
    qs('#tabHistory').classList.remove(
      'text-indigo-400',
      'border-b-2',
      'border-indigo-500'
    );
    qs('#historyPanel').classList.add('hidden');
  });
  qs('#tabHistory').addEventListener('click', () => {
    qs('#tabHistory').classList.add(
      'text-indigo-400',
      'border-b-2',
      'border-indigo-500'
    );
    qs('#tabDetails').classList.remove(
      'text-indigo-400',
      'border-b-2',
      'border-indigo-500'
    );
    qs('#historyPanel').classList.remove('hidden');
  });
}

// ---------- Init ----------
async function init() {
  bindTopBar();
  bindModal();
  await loadList();
  setView('table');
}
init();