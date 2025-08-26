# QA Work Tracker (GAS + Sheets + Vanilla JS + Tailwind)

A lightweight, responsive web app for tracking QA tasks with full history logging to Google Sheets.

## Features
- Table & Kanban views (drag & drop).
- CRUD with inline edits (Title, Assignee, Priority, Status, DueDate, Tags).
- Every change is logged to **History** with timestamp, who, old → new, and optional note.
- Search + filters + server pagination + sorting.
- Dashboard summaries per **Status** and **Priority**.
- Export current view to CSV.
- Simple auth with **Script Properties** password or restrict Web App access.

## Data Model
One Spreadsheet with 2 sheets.

### `Tasks` columns (row 1 as headers, exactly)
```
ID, Title, Description, Assignee, Priority, Status, CreatedAt, UpdatedAt, DueDate, Tags
```
- `ID` format: `T-YYYY-####` auto-generated
- Dates are ISO strings except `DueDate` = `YYYY-MM-DD`

### `History` columns
```
LogID, TaskID, ChangedAt, ChangedBy, Field, OldValue, NewValue, Note
```

## Deploy (Step-by-step)
1. Create a new Google Spreadsheet. Copy its **ID**.
2. Open **Apps Script** (Extensions → Apps Script).
3. Create these files and paste content from `/backend`:
   - `Code.gs`
   - `TasksService.gs`
   - `HistoryService.gs`
   - `Utils.gs`
   - `WebApp.gs`
4. In Apps Script: **Project Settings** → **Script Properties** → add:
   - `SPREADSHEET_ID` = `your_spreadsheet_id_here`
   - *(optional)* `APP_PASSWORD` = `some-strong-string`
5. Back in the editor, run `initSpreadsheet()` once to create headers (or call `GET ...?action=init&key=APP_PASSWORD`).
6. Deploy → **New deployment** → **Web app**:
   - **Execute as**: *Me*
   - **Who has access**: `Anyone with link` *(or restrict to your domain)*
7. Copy the **Web app URL**.

## Frontend
Open `/frontend/index.html` locally or host anywhere (e.g., GitHub Pages).  
Edit `/frontend/app.js`:
```js
const CONFIG = {
  WEB_APP_URL: 'PASTE_WEB_APP_URL_HERE',
  APP_PASSWORD: 'same_as_script_property_if_used'
};
```
> If you use `APP_PASSWORD`, add `?key=PASSWORD` to GET requests or set it in `CONFIG.APP_PASSWORD`. Because Apps Script doesn't expose headers in `doGet/doPost`, this project checks the `key` query param for auth.

## Auth Options
- **Simplest**: in Deploy settings, set access to your Google account users only.
- **Password**: set `APP_PASSWORD` in Script Properties, then add `?key=...` to frontend requests (already supported).

## Endpoints
- `GET listTasks` with query params: `search`, `status`, `priority`, `dueFrom`, `dueTo`, `sortBy`, `sortDir`, `page`, `pageSize`
- `GET getHistory&taskId=...`
- `POST createTask` body: `{ Title, Description, Assignee, Priority, Status, DueDate, Tags }`
- `POST updateTask` body: `{ id, changes: { field: value, ... }, note }`
- `POST moveStatus` body: `{ id, newStatus, note }`
- `POST deleteTask` body: `{ id, note }`

All responses:
```json
{ "ok": true, "data": ... }
{ "ok": false, "error": "message" }
```

## Notes
- Locking via `LockService` prevents race conditions.
- Column indexes are derived from headers, not hard-coded.
- History logs every changed field (one row per field).
- Deletion is hard delete; the deleted row is serialized in History (`Field=Delete`).

## Local Run
Just open `frontend/index.html` in a browser. Make sure CORS is allowed (the backend sets `Access-Control-Allow-Origin:*`).

## Customize
- Add your own statuses / priorities by adjusting options in frontend and data validation in Sheets if desired.
