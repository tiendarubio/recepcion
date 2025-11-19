document.addEventListener('DOMContentLoaded', async () => {
  const IVA = 0.13;
  const $ = (id) => document.getElementById(id);

  $('fechaRecepcion').textContent = `Fecha de recepción: ${new Date().toLocaleString('es-SV', { timeZone: 'America/El_Salvador' })}`;

  const body = $('recepcionBody');
  const proveedorInput = $('proveedorInput');
  const numCreditoInput = $('numCreditoInput');
  const btnSave = $('saveReception');
  const btnPDF = $('exportPDF');
  const btnPrint = $('printPDF');
  const btnExcel = $('exportExcel');
  const btnClear = $('clearReception');

  // Alta manual (en modal)
  const mCodigo = $('mCodigo');
  const mNombre = $('mNombre');
  const mCodInv = $('mCodInv');
  const mCantidad = $('mCantidad');
  const mTotalSin = $('mTotalSin');
  const manualModalEl = document.getElementById('manualModal');
  const manualModal = new bootstrap.Modal(manualModalEl);

  // Navegación con Enter dentro del modal (mCodigo -> mNombre -> mCodInv -> mCantidad -> mTotalSin -> Guardar)
  const modalInputs = [mCodigo, mNombre, mCodInv, mCantidad, mTotalSin];
  modalInputs.forEach((inp, idx) => {
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (idx < modalInputs.length - 1) {
          modalInputs[idx + 1].focus();
        } else {
          // Último campo: disparar el botón de agregar
          $('btnAddManual').click();
        }
      }
    });
  });

  // --- Estado de recepción actual (R1/R2/R3) ---
  let CURRENT_RECEPCION = localStorage.getItem('TR_AVM_CURRENT_RECEPCION') || 'R1';
  const recepcionSelect = $('recepcionSelect');
  function getCurrentBinId() { return RECEPCION_BINS[CURRENT_RECEPCION]; }
  function sanitizeName(s){ return (s||'').toString().trim().replace(/\s+/g,'_').replace(/[^\w\-\.]/g,'_'); }

  recepcionSelect.value = CURRENT_RECEPCION;

  // --- Centrar siempre el elemento que tiene el foco (buscador o cantidad / costo) ---
  const searchInput = $('searchInput');
  function centerOnElement(el) {
    if (!el) return;
    setTimeout(() => {
      const rect = el.getBoundingClientRect();
      const absoluteTop = rect.top + window.pageYOffset;
      const middle = absoluteTop - (window.innerHeight / 2) + rect.height / 2;
      window.scrollTo({
        top: middle,
        behavior: 'smooth'
      });
    }, 0);
  }

  document.addEventListener('focusin', (e) => {
    const t = e.target;
    if (t === searchInput || t.classList.contains('qty') || t.classList.contains('totalSin')) {
      centerOnElement(t);
    }
  });

  // --- Proveedor: autocomplete desde hoja proveedores!C2:C1000 ---
  const provSuggestions = $('provSuggestions');
  await preloadProviders();

  let provFocus = -1;
  proveedorInput.addEventListener('input', () => {
    const q = (proveedorInput.value || '').trim().toLowerCase();
    provSuggestions.innerHTML = '';
    provFocus = -1;
    if (!q) return;
    loadProvidersFromGoogleSheets().then(list => {
      list.filter(p => p.toLowerCase().includes(q)).slice(0,50).forEach(name => {
        const li = document.createElement('li');
        li.className = 'list-group-item';
        li.textContent = name;
        li.addEventListener('click', () => { proveedorInput.value = name; provSuggestions.innerHTML = ''; });
        provSuggestions.appendChild(li);
      });
      if (!provSuggestions.children.length) {
        const li = document.createElement('li');
        li.className = 'list-group-item list-group-item-light no-results';
        li.textContent = 'Sin resultados. Escriba el nombre completo del proveedor.';
        provSuggestions.appendChild(li);
      }
    });
  });
  proveedorInput.addEventListener('keydown', (e) => {
    const items = provSuggestions.getElementsByTagName('li');
    if (e.key === 'ArrowDown') { provFocus++; addActiveProv(items); }
    else if (e.key === 'ArrowUp') { provFocus--; addActiveProv(items); }
    else if (e.key === 'Enter') {
      if (provFocus > -1 && items[provFocus]) {
        e.preventDefault();
        items[provFocus].click();
      }
    }
  });
  function addActiveProv(items){
    if(!items || !items.length) return;
    [...items].forEach(x => x.classList.remove('active'));
    if (provFocus >= items.length) provFocus = 0;
    if (provFocus < 0) provFocus = items.length - 1;
    items[provFocus].classList.add('active');
    items[provFocus].scrollIntoView({ block:'nearest' });
  }

  // Cerrar sugerencias de proveedor al hacer click fuera / ESC
  document.addEventListener('click', (e) => {
    const target = e.target;
    if (target === proveedorInput || provSuggestions.contains(target)) return;
    provSuggestions.innerHTML = '';
    provFocus = -1;
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      provSuggestions.innerHTML = '';
      provFocus = -1;
    }
  });

  // Función para abrir el modal manual desde búsqueda
  function openManualModalFromSearch(rawQuery){
    const q = (rawQuery || '').trim();
    mCodigo.value = '';
    mNombre.value = '';
    mCodInv.value = 'N/A';
    mCantidad.value = '';
    mTotalSin.value = '';
    if (q) {
      if (/^\d+$/.test(q)) mCodigo.value = q;
      else mNombre.value = q;
    }
    manualModal.show();
    setTimeout(() => {
      mCodigo.focus();
    }, 200);
  }

  // Alta manual de producto (desde modal)
  $('btnAddManual').addEventListener('click', () => {
    const codigo = (mCodigo.value || '').trim();
    const nombre = (mNombre.value || '').trim();
    const codInv = (mCodInv.value || 'N/A').trim() || 'N/A';
    const qty = parseNum(mCantidad.value);
    const tSin = parseNum(mTotalSin.value);

    if (!codigo || !nombre) { Swal.fire('Campos faltantes', 'Ingrese código de barra y nombre.', 'info'); return; }
    if (!(qty > 0)) { Swal.fire('Cantidad inválida', 'La cantidad debe ser mayor que 0.', 'warning'); return; }
    if (!(tSin >= 0)) { Swal.fire('Costo inválido', 'El costo total sin IVA debe ser 0 o mayor.', 'warning'); return; }

    addRow({ barcode: codigo, nombre, codInvent: codInv, cantidad: qty, totalSin: tSin });
    manualModal.hide();
    searchInput.focus();
  });

  // Autocomplete productos (con pistola)
  const suggestions = $('suggestions');
  let currentFocus = -1;

  await preloadCatalog();

  searchInput.addEventListener('input', () => {
    const raw = (searchInput.value || '').replace(/\r|\n/g,'').trim();
    const q = raw.toLowerCase();
    suggestions.innerHTML = '';
    currentFocus = -1;
    if (!q) return;

    loadProductsFromGoogleSheets().then(rows => {
      const filtered = rows.filter(r => {
        const nombre    = (r[0] || '').toLowerCase();
        const codInvent = (r[1] || '').toLowerCase();
        const barcode   = (r[3] || '').toLowerCase();
        return nombre.includes(q) || barcode.includes(q) || codInvent.includes(q);
      });

      if (!filtered.length) {
        const li = document.createElement('li');
        li.className = 'list-group-item list-group-item-light no-results';
        li.innerHTML = '<strong>Sin resultados</strong>. Haz clic o presiona Enter para agregar producto manual.';
        li.addEventListener('click', () => {
          suggestions.innerHTML = '';
          openManualModalFromSearch(raw);
        });
        suggestions.appendChild(li);
        return;
      }

      filtered.slice(0, 50).forEach(prod => {
        const li = document.createElement('li');
        li.className = 'list-group-item';
        const nombre = prod[0] || '';
        const codInvent = prod[1] || 'N/A';
        const barcode = prod[3] || 'sin código';
        li.textContent = `${nombre} (${barcode}) [${codInvent}]`;
        li.addEventListener('click', () => addRowAndFocus({ barcode, nombre, codInvent }));
        suggestions.appendChild(li);
      });
    });
  });

  searchInput.addEventListener('keydown', (e) => {
    const items = suggestions.getElementsByTagName('li');
    const itemsArr = Array.from(items);
    const onlyNoResults = itemsArr.length === 1 && itemsArr[0].classList.contains('no-results');

    if (e.key === 'ArrowDown') { currentFocus++; addActive(items); }
    else if (e.key === 'ArrowUp') { currentFocus--; addActive(items); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (currentFocus > -1 && items[currentFocus]) {
        items[currentFocus].click();
        return;
      }

      const raw = (searchInput.value || '').replace(/\r|\n/g,'').trim();
      if (!raw) return;

      // Si sólo hay "sin resultados", abrir modal
      if (onlyNoResults || !itemsArr.length) {
        suggestions.innerHTML = '';
        openManualModalFromSearch(raw);
        return;
      }

      // Intentar match exacto (código de barras / inventario) como en TRLista
      const rows = (window.CATALOGO_CACHE || []);
      let match = null;
      for (const r of rows) {
        const barcode   = r[3] ? String(r[3]).trim() : '';
        const codInvent = r[1] ? String(r[1]).trim() : '';
        if (barcode === raw || codInvent === raw) { match = r; break; }
      }
      if (match) {
        const nombre = match[0] || '';
        const codInvent = match[1] || 'N/A';
        const barcode = match[3] || raw;
        addRowAndFocus({ barcode, nombre, codInvent });
      } else {
        suggestions.innerHTML = '';
        openManualModalFromSearch(raw);
      }
    }
  });

  function addActive(items) {
    if (!items || !items.length) return;
    [...items].forEach(x => x.classList.remove('active'));
    if (currentFocus >= items.length) currentFocus = 0;
    if (currentFocus < 0) currentFocus = items.length - 1;
    items[currentFocus].classList.add('active');
    items[currentFocus].scrollIntoView({ block:'nearest' });
  }

  // Cerrar sugerencias de productos al hacer click fuera / ESC
  document.addEventListener('click', (e) => {
    const target = e.target;
    if (target === searchInput || suggestions.contains(target)) return;
    suggestions.innerHTML = '';
    currentFocus = -1;
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      suggestions.innerHTML = '';
      currentFocus = -1;
    }
  });

  function addRowAndFocus({ barcode, nombre, codInvent }){
    addRow({ barcode, nombre, codInvent });
    const firstRow = body.firstElementChild;
    if (firstRow) {
      const qty = firstRow.querySelector('.qty');
      qty && qty.focus();
    }
  }

  // Agregar fila (cantidad vacía)
  function addRow({ barcode, nombre, codInvent, cantidad='', totalSin=0 }) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td></td>
      <td>${barcode || ''}</td>
      <td>${nombre || ''}</td>
      <td>${codInvent || 'N/A'}</td>
      <td><input type="number" class="form-control form-control-sm qty" min="0" step="1" value="${cantidad}"></td>
      <td><input type="number" class="form-control form-control-sm totalSin" min="0" step="0.01" value="${totalSin || ''}" placeholder="0.00"></td>
      <td><input type="number" class="form-control form-control-sm unitCon" step="0.01" placeholder="0.00" readonly></td>
      <td><input type="number" class="form-control form-control-sm unitSin" step="0.01" placeholder="0.00" readonly></td>
      <td><button class="btn btn-danger btn-sm"><i class="fas fa-trash"></i></button></td>
    `;
    body.insertBefore(tr, body.firstChild);
    renumber();
    suggestions.innerHTML = '';
    searchInput.value = '';

    const qty = tr.querySelector('.qty');
    const totalSinInp = tr.querySelector('.totalSin');
    const delBtn = tr.querySelector('button');

    [qty, totalSinInp].forEach(inp => inp.addEventListener('input', () => recalcRow(tr)));

    qty.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); totalSinInp.focus(); } });
    totalSinInp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); searchInput.focus(); } });

    delBtn.addEventListener('click', () => {
      Swal.fire({ title:'¿Eliminar ítem?', icon:'warning', showCancelButton:true, confirmButtonText:'Sí, eliminar' })
        .then(res => { if (res.isConfirmed) { tr.remove(); renumber(); recalcTotals(); updateButtons(); } });
    });

    recalcRow(tr);
    updateButtons();
  }

  function renumber() {
    [...body.getElementsByTagName('tr')].forEach((row, idx) => row.cells[0].textContent = (body.rows.length - idx));
  }

  function parseNum(v){ const n = parseFloat(v); return isNaN(n) ? 0 : n; }
  function fix2(n){ return Math.round(n*100)/100; }

  function recalcRow(tr) {
    const qtyVal = parseNum(tr.querySelector('.qty').value);
    const totalSinVal = parseNum(tr.querySelector('.totalSin').value);
    const unitSinInp = tr.querySelector('.unitSin');
    const unitConInp = tr.querySelector('.unitCon');

    if (qtyVal > 0) {
      const unitSin = totalSinVal / qtyVal;
      const unitCon = unitSin * (1 + IVA);
      unitSinInp.value = unitSin ? fix2(unitSin).toFixed(2) : '';
      unitConInp.value = unitCon ? fix2(unitCon).toFixed(2) : '';
    } else {
      unitSinInp.value = '';
      unitConInp.value = '';
    }
    recalcTotals();
  }

  function recalcTotals() {
    let lineas = 0, tCantidad = 0, totalSin = 0, totalCon = 0;
    [...body.getElementsByTagName('tr')].forEach(tr => {
      const qty = parseNum(tr.querySelector('.qty')?.value);
      const tSin = parseNum(tr.querySelector('.totalSin')?.value);
      if (qty > 0) { lineas++; tCantidad += qty; totalSin += fix2(tSin); }
    });
    totalCon = fix2(totalSin * (1 + IVA));
    $('tLineas').textContent = lineas;
    $('tCantidad').textContent = tCantidad;
    $('tSinIva').textContent = fix2(totalSin).toFixed(2);
    $('tConIva').textContent = fix2(totalCon).toFixed(2);

    updateButtons();
  }

  function updateButtons(){
    const has = body.rows.length > 0;
    btnPDF.disabled = !has;
    btnPrint.disabled = !has;
    btnExcel.disabled = !has;
    btnClear.disabled = !has && !(proveedorInput.value.trim() || numCreditoInput.value.trim());
  }

  // Guardar
  btnSave.addEventListener('click', () => {
    if (!proveedorInput.value.trim()) { Swal.fire('Proveedor requerido', 'Ingrese o seleccione un proveedor.', 'info'); return; }
    if (!numCreditoInput.value.trim()) { Swal.fire('Crédito Fiscal requerido', 'Ingrese el número de crédito fiscal.', 'info'); return; }
    if (body.rows.length === 0) { Swal.fire('Sin ítems', 'Agregue al menos un producto.', 'error'); return; }

    const items = [...body.getElementsByTagName('tr')].map(tr => {
      const qty = parseNum(tr.querySelector('.qty').value);
      const totalSin = parseNum(tr.querySelector('.totalSin').value);
      const unitSin = parseNum(tr.querySelector('.unitSin').value);
      const unitCon = parseNum(tr.querySelector('.unitCon').value);
      return {
        codigo_barras: tr.cells[1].innerText.trim(),
        nombre: tr.cells[2].innerText.trim(),
        codigo_inventario: tr.cells[3].innerText.trim(),
        cantidad: qty,
        unit_con_iva: fix2(unitCon),
        unit_sin_iva: fix2(unitSin),
        total_sin_iva: fix2(totalSin),
        total_con_iva: fix2(totalSin * (1 + IVA))
      };
    });

    const payload = {
      meta: {
        tienda: 'AVENIDA MORAZÁN',
        proveedor: proveedorInput.value.trim(),
        numero_credito_fiscal: numCreditoInput.value.trim(),
        fechaRecepcion: new Date().toISOString()
      },
      items,
      totales: {
        lineas: Number(document.getElementById('tLineas').textContent),
        cantidad_total: Number(document.getElementById('tCantidad').textContent),
        total_sin_iva: Number(document.getElementById('tSinIva').textContent),
        total_con_iva: Number(document.getElementById('tConIva').textContent)
      }
    };

    saveReceptionToJSONBin(getCurrentBinId(), payload).then(() => {
      const msg = document.getElementById('successMessage');
      msg.textContent = 'Recepción guardada correctamente.';
      msg.style.display = 'block';
      setTimeout(() => msg.style.display = 'none', 4000);
      Swal.fire('Guardado', 'La recepción ha sido guardada.', 'success');
    }).catch(e => Swal.fire('Error', String(e), 'error'));
  });

  // Cargar estado previo del BIN actual
  await (async function loadAndRenderFromCurrentBin(){
    try {
      const record = await loadReceptionFromJSONBin(getCurrentBinId());
      if (record && record.items && Array.isArray(record.items)) {
        if (record.meta && record.meta.proveedor) { proveedorInput.value = record.meta.proveedor; }
        if (record.meta && record.meta.numero_credito_fiscal) { numCreditoInput.value = record.meta.numero_credito_fiscal; }
        record.items.forEach(it => {
          addRow({
            barcode: it.codigo_barras || '',
            nombre: it.nombre || '',
            codInvent: it.codigo_inventario || 'N/A',
            cantidad: (it.cantidad !== undefined && it.cantidad !== null) ? Number(it.cantidad) : '',
            totalSin: Number(it.total_sin_iva) || 0
          });
        });
        recalcTotals();
      }
    } catch (e) { console.error('Error al cargar estado previo:', e); }
  })();

  // Cambio de recepción
  recepcionSelect.addEventListener('change', async () => {
    CURRENT_RECEPCION = recepcionSelect.value;
    localStorage.setItem('TR_AVM_CURRENT_RECEPCION', CURRENT_RECEPCION);
    body.innerHTML = '';
    proveedorInput.value = '';
    numCreditoInput.value = '';
    recalcTotals();
    updateButtons();
    try {
      const record = await loadReceptionFromJSONBin(getCurrentBinId());
      if (record && record.items && Array.isArray(record.items)) {
        if (record.meta && record.meta.proveedor) { proveedorInput.value = record.meta.proveedor; }
        if (record.meta && record.meta.numero_credito_fiscal) { numCreditoInput.value = record.meta.numero_credito_fiscal; }
        record.items.forEach(it => {
          addRow({
            barcode: it.codigo_barras || '',
            nombre: it.nombre || '',
            codInvent: it.codigo_inventario || 'N/A',
            cantidad: (it.cantidad !== undefined && it.cantidad !== null) ? Number(it.cantidad) : '',
            totalSin: Number(it.total_sin_iva) || 0
          });
        });
        recalcTotals();
      }
    } catch (e) { console.error('Error al cargar estado previo:', e); }
  });

  // PDF/Imprimir
  btnPDF.addEventListener('click', () => exportPDF(false));
  btnPrint.addEventListener('click', () => exportPDF(true));
  function exportPDF(openWindow=false){
    if(body.rows.length===0) return;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const fecha = new Date().toISOString().split('T')[0];
    doc.setFontSize(12);
    doc.text('Tienda: AVENIDA MORAZÁN',10,10);
    doc.text(`Proveedor: ${proveedorInput.value || '-'}`,10,18);
    doc.text(`Crédito Fiscal: ${numCreditoInput.value || '-'}`,10,26);
    doc.text(`Fecha: ${fecha}`,10,34);
    const rows = [...body.getElementsByTagName('tr')].map((tr,i)=>([
      i+1,
      tr.cells[1].innerText,
      tr.cells[2].innerText,
      tr.cells[3].innerText,
      tr.querySelector('.qty').value,
      (parseNum(tr.querySelector('.unitSin').value)).toFixed(2),
      (parseNum(tr.querySelector('.unitCon').value)).toFixed(2),
      (parseNum(tr.querySelector('.totalSin').value)).toFixed(2),
      (parseNum(tr.querySelector('.totalSin').value)*(1+IVA)).toFixed(2)
    ]));
    doc.autoTable({startY:40, head:[['#','Código Barras','Producto','Cod. Inv.','Cant.','Ud. sin IVA','Ud. con IVA','Total sin IVA','Total con IVA']], body:rows, styles:{fontSize:9,cellPadding:2}});
    const y = doc.lastAutoTable.finalY + 6;
    doc.text(`Líneas: ${$('tLineas').textContent}  |  Cantidad total: ${$('tCantidad').textContent}  |  Total sin IVA: $${$('tSinIva').textContent}  |  Total con IVA: $${$('tConIva').textContent}`,10,y);
    const name = `${sanitizeName(proveedorInput.value)}_${sanitizeName(numCreditoInput.value)}_${fecha}_RECEPCION_AVM.pdf`;
    if(openWindow) doc.output('dataurlnewwindow'); else doc.save(name);
  }

  // Excel export
  btnExcel.addEventListener('click', () => {
    if(body.rows.length===0) return;
    const fecha = new Date().toISOString().split('T')[0];
    const data = [['codigo','unidad','cantidad','totalcosto']];
    [...body.getElementsByTagName('tr')].forEach(tr => {
      const codInvent = String(tr.cells[3].innerText || '');
      const qty = parseNum(tr.querySelector('.qty').value);
      const totalSin = parseNum(tr.querySelector('.totalSin').value);
      data.push([codInvent, 6, Number(qty), Number(fix2(totalSin))]);
    });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Recepcion');
    const wbout = XLSX.write(wb, { bookType:'xlsx', type:'array' });
    const blob = new Blob([wbout], { type:'application/octet-stream' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${sanitizeName(proveedorInput.value)}_${sanitizeName(numCreditoInput.value)}_${fecha}_RECEPCION_AVM.xlsx`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  });

  // Limpiar y guardar vacío
  btnClear.addEventListener('click', () => {
    if (body.rows.length === 0 && !(proveedorInput.value.trim() || numCreditoInput.value.trim())) return;
    Swal.fire({
      title:'¿Vaciar y comenzar nueva recepción?',
      text:'Esto guardará el estado vacío en esta recepción.',
      icon:'warning',
      showCancelButton:true,
      confirmButtonText:'Sí, limpiar y guardar'
    }).then(res => {
      if(res.isConfirmed){
        body.innerHTML='';
        proveedorInput.value = '';
        numCreditoInput.value = '';
        recalcTotals();
        updateButtons();
        const payload = {
          meta: { tienda: 'AVENIDA MORAZÁN', proveedor: '', numero_credito_fiscal: '', fechaRecepcion: new Date().toISOString() },
          items: [],
          totales: { lineas: 0, cantidad_total: 0, total_sin_iva: 0, total_con_iva: 0 }
        };
        saveReceptionToJSONBin(getCurrentBinId(), payload).then(() => {
          const msg = document.getElementById('successMessage');
          msg.textContent = 'Recepción limpiada y guardada. Lista para empezar una nueva.';
          msg.style.display = 'block';
          setTimeout(() => msg.style.display = 'none', 4000);
          Swal.fire('Listo', 'Se limpió y guardó el estado vacío.', 'success');
        }).catch(e => Swal.fire('Error', String(e), 'error'));
      }
    });
  });

  // Enfocar buscador al inicio
  searchInput.focus();
});
