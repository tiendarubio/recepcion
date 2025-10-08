// recepcion.js — Av. Morazán (scanner-friendly + carga JSONBin + Enter flow + limpiar guarda)
document.addEventListener('DOMContentLoaded', async () => {
  const IVA = 0.13;
  const $ = (id) => document.getElementById(id);

  $('fechaRecepcion').textContent = `Fecha de recepción: ${new Date().toLocaleString('es-SV', { timeZone: 'America/El_Salvador' })}`;

  const body = $('recepcionBody');
  const proveedorInput = $('proveedorInput');
  const btnSave = $('saveReception');
  const btnPDF = $('exportPDF');
  const btnPrint = $('printPDF');
  const btnExcel = $('exportExcel');
  const btnClear = $('clearReception');

  // ------- Alta manual -------
  const mCodigo = $('mCodigo');
  const mNombre = $('mNombre');
  const mCodInv = $('mCodInv');
  const mCantidad = $('mCantidad');
  const mTotalSin = $('mTotalSin');

  $('btnAddManual').addEventListener('click', () => {
    const codigo = (mCodigo.value || '').trim();
    const nombre = (mNombre.value || '').trim();
    const codInv = (mCodInv.value || 'N/A').trim() || 'N/A';
    const qty = parseNum(mCantidad.value);
    const tSin = parseNum(mTotalSin.value);

    if (!codigo || !nombre) { Swal.fire('Campos faltantes', 'Ingrese CÓDIGO DE BARRA y NOMBRE.', 'info'); return; }
    if (!(qty > 0)) { Swal.fire('Cantidad inválida', 'La CANTIDAD debe ser mayor que 0.', 'warning'); return; }
    if (!(tSin >= 0)) { Swal.fire('Costo inválido', 'El COSTO TOTAL SIN IVA debe ser 0 o mayor.', 'warning'); return; }

    addRow({ barcode: codigo, nombre, codInvent: codInv, cantidad: qty, totalSin: tSin });
    mCodigo.value = ''; mNombre.value = ''; mCodInv.value = 'N/A'; mCantidad.value = ''; mTotalSin.value = '';
    mCodigo.focus();
  });

  // ------- Autocomplete y pistola lectora -------
  const searchInput = $('searchInput');
  const suggestions = $('suggestions');
  let currentFocus = -1;

  await preloadCatalog(); // del app.js

  searchInput.addEventListener('input', () => {
    const q = (searchInput.value || '').replace(/\r|\n/g,'').trim().toLowerCase();
    suggestions.innerHTML = '';
    currentFocus = -1;
    if (!q) return;

    loadProductsFromGoogleSheets().then(rows => {
      const filtered = rows.filter(r => {
        const nombre = (r[0] || '').toLowerCase();
        const barcode = (r[3] || '').toLowerCase();
        return nombre.includes(q) || barcode.includes(q);
      }).slice(0, 50);

      filtered.forEach(prod => {
        const li = document.createElement('li');
        li.className = 'list-group-item';
        const nombre = prod[0] || '';
        const codInvent = prod[1] || 'N/A';
        const barcode = prod[3] || 'sin código';
        li.textContent = `${nombre} (${barcode})`;
        li.addEventListener('click', () => addRowAndFocus({ barcode, nombre, codInvent }));
        suggestions.appendChild(li);
      });
    });
  });

  searchInput.addEventListener('keydown', (e) => {
    const items = suggestions.getElementsByTagName('li');
    if (e.key === 'ArrowDown') { currentFocus++; addActive(items); }
    else if (e.key === 'ArrowUp') { currentFocus--; addActive(items); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (currentFocus > -1 && items[currentFocus]) {
        items[currentFocus].click();
      } else {
        const q = (searchInput.value || '').replace(/\r|\n/g,'').trim();
        if (!q) return;
        const rows = (window.CATALOGO_CACHE || []);
        let match = null;
        for (const r of rows) {
          if (r[3] && String(r[3]).trim() === q) { match = r; break; }
        }
        if (match) {
          const nombre = match[0] || '';
          const codInvent = match[1] || 'N/A';
          const barcode = match[3] || q;
          addRowAndFocus({ barcode, nombre, codInvent });
        }
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

  function addRowAndFocus({ barcode, nombre, codInvent }){
    addRow({ barcode, nombre, codInvent });
    const firstRow = body.firstElementChild;
    if (firstRow) {
      const qty = firstRow.querySelector('.qty');
      qty && qty.focus();
    }
  }

  // ------- Agregar fila (CANTIDAD inicia vacía) -------
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

    // Enter-flow: Cantidad -> TotalSin -> Search
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

  // Unidad sin IVA = TotalSin / Cantidad ; Unidad con IVA = Unidad sin IVA * 1.13
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
    btnClear.disabled = !has && !proveedorInput.value.trim();
  }

  // ------- Guardar -------
  btnSave.addEventListener('click', () => {
    if (!proveedorInput.value.trim()) { Swal.fire('Proveedor requerido', 'Ingrese el nombre del proveedor.', 'info'); return; }
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
      meta: { tienda: 'AVENIDA MORAZÁN', proveedor: proveedorInput.value.trim(), fechaRecepcion: new Date().toISOString() },
      items,
      totales: {
        lineas: Number(document.getElementById('tLineas').textContent),
        cantidad_total: Number(document.getElementById('tCantidad').textContent),
        total_sin_iva: Number(document.getElementById('tSinIva').textContent),
        total_con_iva: Number(document.getElementById('tConIva').textContent)
      }
    };

    saveReceptionToJSONBin(payload).then(() => {
      const msg = document.getElementById('successMessage');
      msg.textContent = 'Recepción guardada correctamente.';
      msg.style.display = 'block';
      setTimeout(() => msg.style.display = 'none', 4000);
      Swal.fire('Guardado', 'La recepción ha sido guardada.', 'success');
    }).catch(e => Swal.fire('Error', String(e), 'error'));
  });

  // ------- Cargar estado previo desde JSONBin -------
  try {
    const record = await loadReceptionFromJSONBin();
    if (record && record.items && Array.isArray(record.items)) {
      if (record.meta && record.meta.proveedor) { proveedorInput.value = record.meta.proveedor; }
      record.items.forEach(it => {
        addRow({
          barcode: it.codigo_barras || '',
          nombre: it.nombre || '',
          codInvent: it.codigo_inventario || 'N/A',
          cantidad: Number(it.cantidad) || 0,
          totalSin: Number(it.total_sin_iva) || 0
        });
      });
      recalcTotals();
    }
  } catch (e) { console.error('Error al cargar estado previo:', e); }

  // ------- PDF / Imprimir -------
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
    doc.text(`Fecha: ${fecha}`,10,26);
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
    doc.autoTable({startY:36, head:[['#','Código Barras','Producto','Cod. Inv.','Cant.','Unit. sin IVA','Unit. con IVA','Total sin IVA','Total con IVA']], body:rows, styles:{fontSize:9,cellPadding:2}});
    const y = doc.lastAutoTable.finalY + 6;
    doc.text(`Líneas: ${$('tLineas').textContent}  |  Cantidad total: ${$('tCantidad').textContent}  |  Total sin IVA: $${$('tSinIva').textContent}  |  Total con IVA: $${$('tConIva').textContent}`,10,y);
    const name = `Recepcion_Avenida_Morazan_${fecha}.pdf`;
    if(openWindow) doc.output('dataurlnewwindow'); else doc.save(name);
  }

  // ------- Excel: codigo (Cod. Inventario), unidad=6, cantidad, totalcosto = COSTO TOTAL SIN IVA -------
  btnExcel.addEventListener('click', () => {
    if(body.rows.length===0) return;
    const fecha = new Date().toISOString().split('T')[0];
    const data = [['codigo','unidad','cantidad','totalcosto']];
    [...body.getElementsByTagName('tr')].forEach(tr => {
      const codInvent = String(tr.cells[3].innerText || '');
      const qty = parseNum(tr.querySelector('.qty').value);
      const totalSin = parseNum(tr.querySelector('.totalSin').value); // COSTO TOTAL SIN IVA
      data.push([codInvent, 6, Number(qty), Number(fix2(totalSin))]);
    });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Recepcion');
    const wbout = XLSX.write(wb, { bookType:'xlsx', type:'array' });
    const blob = new Blob([wbout], { type:'application/octet-stream' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Recepcion_Avenida_Morazan_${fecha}.xlsx`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  });

  // ------- Limpiar (borra, resetea y GUARDA estado vacío) -------
  btnClear.addEventListener('click', () => {
    if (body.rows.length === 0 && !proveedorInput.value.trim()) return;
    Swal.fire({
      title:'¿Vaciar y comenzar nueva recepción?',
      text:'Esto guardará el estado vacío.',
      icon:'warning',
      showCancelButton:true,
      confirmButtonText:'Sí, limpiar y guardar'
    }).then(res => {
      if(res.isConfirmed){
        body.innerHTML='';
        proveedorInput.value='';
        recalcTotals();
        updateButtons();
        const payload = {
          meta: { tienda: 'AVENIDA MORAZÁN', proveedor: '', fechaRecepcion: new Date().toISOString() },
          items: [],
          totales: { lineas: 0, cantidad_total: 0, total_sin_iva: 0, total_con_iva: 0 }
        };
        saveReceptionToJSONBin(payload).then(() => {
          const msg = document.getElementById('successMessage');
          msg.textContent = 'Recepción limpiada y guardada. Lista para empezar una nueva.';
          msg.style.display = 'block';
          setTimeout(() => msg.style.display = 'none', 4000);
          Swal.fire('Listo', 'Se limpió y guardó el estado vacío.', 'success');
        }).catch(e => Swal.fire('Error', String(e), 'error'));
      }
    });
  });

  // ---- helpers locales ----
  function parseNum(v){ const n=parseFloat(v); return isNaN(n)?0:n; }
});
