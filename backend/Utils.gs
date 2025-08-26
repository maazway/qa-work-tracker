/** Utils.gs: helpers for spreadsheet access and responses */
const Utils = (function(){
  function getSpreadsheet() {
    const props = PropertiesService.getScriptProperties();
    const id = props.getProperty('SPREADSHEET_ID');
    if (!id) throw new Error('Missing SPREADSHEET_ID script property');
    return SpreadsheetApp.openById(id);
  }

  function ensureSheetHeaders(ss, name, headers) {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    const firstRow = sh.getRange(1,1,1,headers.length).getValues()[0];
    const missing = headers.some((h,i)=> firstRow[i] !== h);
    if (missing) {
      sh.clear();
      sh.getRange(1,1,1,headers.length).setValues([headers]);
    }
  }

  function getHeaders(sh) {
    const lastCol = sh.getLastColumn();
    const headers = sh.getRange(1,1,1,lastCol).getValues()[0];
    return headers;
  }

  function readSheet(sh) {
    const headers = getHeaders(sh);
    const lastRow = sh.getLastRow();
    const lastCol = sh.getLastColumn();
    let values = [];
    if (lastRow > 1) values = sh.getRange(2,1,lastRow-1,lastCol).getValues();
    const map = headers.reduce((m,h,i)=> (m[h]=i, m), {});
    return { map, headers, values };
  }

  function objectFromRow(map, row) {
    const obj = {};
    Object.keys(map).forEach(k => obj[k] = row[map[k]] || '');
    return obj;
  }

  function rowFromObject(map, obj) {
    const row = new Array(Object.keys(map).length).fill('');
    Object.keys(map).forEach(k => row[map[k]] = obj[k]!==undefined? obj[k] : '');
    return row;
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function generateTaskId(ss) {
    const sh = ss.getSheetByName('Tasks');
    if (!sh) throw new Error('Tasks sheet not found');
    const { map, values } = readSheet(sh);
    // Find max running number by year
    const year = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy');
    let max = 0;
    values.forEach(r => {
      const id = r[map.ID]; // e.g. T-2025-0001
      if (id && id.indexOf('T-'+year+'-')===0) {
        const n = parseInt(id.split('-')[2],10);
        if (!isNaN(n) && n > max) max = n;
      }
    });
    const next = (max+1).toString().padStart(4,'0');
    return `T-${year}-${next}`;
  }

  function generateLogId() {
    const ts = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMddHHmmssSSS");
    const rand = Math.floor(Math.random()*1000).toString().padStart(3,'0');
    return `L-${ts}-${rand}`;
  }

  function checkAuth(e) {
    const props = PropertiesService.getScriptProperties();
    const pwd = props.getProperty('APP_PASSWORD') || '';
    if (!pwd) return true; // no auth
    const header = (e && e.parameter && e.parameter.key) || (e && e.postData && e.postData.contents && JSON.parse(e.postData.contents)['key']);
    const h = e && e['headers'] ? e['headers']['X-APP-KEY'] : null;
    const reqHeader = e && e['parameter'] && e['parameter']['X-APP-KEY'];
    const key = (e && e['parameter'] && e['parameter']['key']) || (e && e['headers'] && e['headers']['X-APP-KEY']);
    // Apps Script doesn't directly expose headers via doGet/doPost e, but we also check query param "key".
    const provided = (e && e.parameter && e.parameter.key) || ''; // support query
    // allow also X-APP-KEY via content; frontend sends header but not readable; fallback query is recommended in README.
    return provided === pwd;
  }

  function jsonOk(data) {
    return ContentService.createTextOutput(JSON.stringify({ ok:true, data })).setMimeType(ContentService.MimeType.JSON);
  }
  function jsonError(err) {
    const msg = (err && err.message) ? err.message : (err+'');
    return ContentService.createTextOutput(JSON.stringify({ ok:false, error: msg })).setMimeType(ContentService.MimeType.JSON);
  }

  function addCors(resp) {
    resp.setHeader('Access-Control-Allow-Origin','*');
    resp.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
    resp.setHeader('Access-Control-Allow-Headers','Content-Type,X-APP-KEY');
    return resp;
  }

  return { getSpreadsheet, ensureSheetHeaders, getHeaders, readSheet, objectFromRow, rowFromObject, nowIso, generateTaskId, generateLogId, jsonOk, jsonError, addCors, checkAuth };
})();
