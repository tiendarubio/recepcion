// app.js — Helpers + catálogo en caché + JSONBin load/save

const googleSheetsApiKey = 'AIzaSyAvWylEG-2jRlgYXZBEcPtAWvV-fyBPZgo';
const jsonBinApiKey = '$2a$10$CyV/uYa20LDnSOfu7H/tTOsf96pmltAC/RkQTx73zfXsbCsXk7BxW';

let CATALOGO_CACHE = null;
const recepcionBinId = '68e567c443b1c97be95df578';

function preloadCatalog() {
  if (CATALOGO_CACHE) return Promise.resolve(CATALOGO_CACHE);
  const sheetId = '1b5B9vp0GKc4T_mORssdj-J2vgc-xEO5YAFkcrVX-nHI';
  const sheetRange = 'bd!A2:D5000';
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${sheetRange}?key=${googleSheetsApiKey}`;
  return fetch(url)
    .then(r => { if(!r.ok) throw new Error(r.statusText); return r.json(); })
    .then(d => {
      CATALOGO_CACHE = Array.isArray(d.values) ? d.values : [];
      return CATALOGO_CACHE;
    })
    .catch(err => { console.error('Google Sheets error:', err); CATALOGO_CACHE = []; return CATALOGO_CACHE; });
}

function loadProductsFromGoogleSheets() { return preloadCatalog(); }

function saveReceptionToJSONBin(payload){
  return fetch(`https://api.jsonbin.io/v3/b/${recepcionBinId}`, {
    method: 'PUT',
    headers: {'Content-Type':'application/json','X-Access-Key':jsonBinApiKey},
    body: JSON.stringify(payload)
  }).then(r => { if(!r.ok) throw new Error(r.statusText); return r.json(); });
}

function loadReceptionFromJSONBin(){
  return fetch(`https://api.jsonbin.io/v3/b/${recepcionBinId}/latest`, {
    headers: {'X-Access-Key': jsonBinApiKey}
  }).then(r => { if(!r.ok) throw new Error(r.statusText); return r.json(); })
    .then(d => d.record || {})
    .catch(err => { console.error('JSONBin load error:', err); return {}; });
}
