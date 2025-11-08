// app.js — Helpers + catálogo/proveedores en caché + JSONBin multi-bin
const googleSheetsApiKey = 'AIzaSyAvWylEG-2jRlgYXZBEcPtAWvV-fyBPZgo';
const jsonBinApiKey = '$2a$10$CyV/uYa20LDnSOfu7H/tTOsf96pmltAC/RkQTx73zfXsbCsXk7BxW';

let CATALOGO_CACHE = null;
let PROVIDERS_CACHE = null;

// Mapa de recepciones -> BIN IDs
const RECEPCION_BINS = {
  R1: '68e567c443b1c97be95df578', // BIN 1
  R2: '690d0a1143b1c97be99d7487', // BIN 2
  R3: '690f67b443b1c97be9a10063'  // BIN 3
};

function preloadCatalog() {
  if (CATALOGO_CACHE) return Promise.resolve(CATALOGO_CACHE);
  const sheetId = '1b5B9vp0GKc4T_mORssdj-J2vgc-xEO5YAFkcrVX-nHI';
  const sheetRange = 'bd!A2:D5000';
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${sheetRange}?key=${googleSheetsApiKey}`;
  return fetch(url)
    .then(r => { if(!r.ok) throw new Error(r.statusText); return r.json(); })
    .then(d => { CATALOGO_CACHE = Array.isArray(d.values) ? d.values : []; return CATALOGO_CACHE; })
    .catch(err => { console.error('Google Sheets error (catálogo):', err); CATALOGO_CACHE = []; return CATALOGO_CACHE; });
}
function loadProductsFromGoogleSheets() { return preloadCatalog(); }

function preloadProviders(){
  if (PROVIDERS_CACHE) return Promise.resolve(PROVIDERS_CACHE);
  const sheetId = '1b5B9vp0GKc4T_mORssdj-J2vgc-xEO5YAFkcrVX-nHI';
  const sheetRange = 'proveedores!C2:C1000';
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${sheetRange}?key=${googleSheetsApiKey}`;
  return fetch(url)
    .then(r => { if(!r.ok) throw new Error(r.statusText); return r.json(); })
    .then(d => {
      const vals = Array.isArray(d.values) ? d.values.flat().filter(Boolean) : [];
      PROVIDERS_CACHE = vals;
      return PROVIDERS_CACHE;
    })
    .catch(err => { console.error('Google Sheets error (proveedores):', err); PROVIDERS_CACHE = []; return PROVIDERS_CACHE; });
}
function loadProvidersFromGoogleSheets(){ return preloadProviders(); }

// ---- JSONBin helpers por BIN ----
function saveReceptionToJSONBin(binId, payload){
  return fetch(`https://api.jsonbin.io/v3/b/${binId}`, {
    method: 'PUT',
    headers: {'Content-Type':'application/json','X-Access-Key':jsonBinApiKey},
    body: JSON.stringify(payload)
  }).then(r => { if(!r.ok) throw new Error(r.statusText); return r.json(); });
}

function loadReceptionFromJSONBin(binId){
  return fetch(`https://api.jsonbin.io/v3/b/${binId}/latest`, {
    headers: {'X-Access-Key': jsonBinApiKey}
  }).then(r => { if(!r.ok) throw new Error(r.statusText); return r.json(); })
    .then(d => d.record || {})
    .catch(err => { console.error('JSONBin load error:', err); return {}; });
}
