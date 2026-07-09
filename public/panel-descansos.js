/* panel-descansos.js — Módulo Descansos médicos (Admin / Super Admin) */
(function(global) {
  var DM_META = { divisiones: [], unidades: [], grados: [], tipos_documento: [], grados_medico: [] };
  var DM_ROWS = [];
  var DM_ANIO = new Date().getFullYear();

  function api() { return (typeof regpolApiBase === 'function') ? regpolApiBase() : (window.REGPOL_API_BASE || ''); }
  function token() { return (typeof TOKEN !== 'undefined' && TOKEN) ? TOKEN : ((JSON.parse(localStorage.getItem('regpol_session') || '{}') || {}).token || ''); }
  function hdr() { return { 'Content-Type': 'application/json', 'x-admin-token': token() }; }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function nombreCompleto(r) {
    return [r.apellido_paterno, r.apellido_materno, r.nombres].filter(Boolean).join(' ').trim();
  }

  function qsFiltros() {
    var p = new URLSearchParams();
    var anio = (document.getElementById('dm-f-anio') || {}).value || DM_ANIO;
    if (anio) p.set('anio', anio);
    ['division', 'unidad', 'grado', 'tipo_documento'].forEach(function(k) {
      var el = document.getElementById('dm-f-' + k);
      if (el && el.value) p.set(k, el.value);
    });
    var origen = (document.getElementById('dm-f-origen') || {}).value;
    if (origen) p.set('origen', origen);
    return p.toString();
  }

  function fillSelect(id, items, placeholder, valueKey) {
    var el = document.getElementById(id);
    if (!el) return;
    var cur = el.value;
    var opts = '<option value="">' + (placeholder || '— Todos —') + '</option>';
    (items || []).forEach(function(it) {
      var v = valueKey ? it[valueKey] : it;
      var lab = valueKey ? (it.k || it[valueKey]) : it;
      if (typeof it === 'object' && it.k) { v = it.k; lab = it.k; }
      opts += '<option value="' + esc(v) + '">' + esc(lab) + '</option>';
    });
    el.innerHTML = opts;
    if (cur) el.value = cur;
  }

  function filtrarUnidadesPorDivision() {
    var div = (document.getElementById('dm-f-division') || {}).value || '';
    var list = (DM_META.unidades || []).filter(function(u) {
      if (!div) return true;
      return String(u.division || '').toLowerCase().indexOf(div.toLowerCase()) >= 0 || u.division === div;
    });
    fillSelect('dm-f-unidad', list.map(function(u) { return u.k || u.unidad || u; }), '— Todas las unidades —');
  }

  async function cargarMeta() {
    var anio = (document.getElementById('dm-f-anio') || {}).value || DM_ANIO;
    var r = await fetch(api() + '/admin/descansos/meta/filtros?anio=' + encodeURIComponent(anio), { headers: hdr() });
    var d = await r.json();
    if (!d.ok) return;
    DM_META = d;
    fillSelect('dm-f-division', d.divisiones, '— Todas las divisiones —');
    filtrarUnidadesPorDivision();
    fillSelect('dm-f-grado', d.grados, '— Todos los grados —');
    fillSelect('dm-f-tipo_documento', d.tipos_documento || [], '— Todos —');
  }

  async function cargarListado() {
    var wrap = document.getElementById('dm-tabla-wrap');
    if (wrap) wrap.innerHTML = '<p style="color:#888;padding:16px;text-align:center;">Cargando...</p>';
    var r = await fetch(api() + '/admin/descansos?' + qsFiltros() + '&limit=500', { headers: hdr() });
    var d = await r.json();
    if (!d.ok) {
      if (wrap) wrap.innerHTML = '<p style="color:#c0392b;padding:16px;">' + esc(d.error || 'Error') + '</p>';
      return;
    }
    DM_ROWS = d.rows || [];
    var totalEl = document.getElementById('dm-total-label');
    if (totalEl) totalEl.textContent = (d.total || 0) + ' registro(s)';
    if (!DM_ROWS.length) {
      wrap.innerHTML = '<p style="color:#888;padding:20px;text-align:center;">Sin registros con estos filtros.</p>';
      return;
    }
    var html = '<div style="overflow:auto;"><table class="tabla" style="width:100%;font-size:12px;"><thead><tr>'
      + '<th>CIP</th><th>Nombre</th><th>Grado</th><th>Unidad</th><th>Inicio</th><th>Días</th><th>CIE</th><th>Cód. barras</th><th>Origen</th><th>Registro</th><th></th>'
      + '</tr></thead><tbody>';
    DM_ROWS.forEach(function(row) {
      var fr = row.fecha_registro ? new Date(row.fecha_registro).toLocaleString('es-PE') : '';
      html += '<tr>'
        + '<td>' + esc(row.cip) + '</td>'
        + '<td>' + esc(nombreCompleto(row)) + '</td>'
        + '<td>' + esc(row.grado) + '</td>'
        + '<td>' + esc(row.unidad) + '</td>'
        + '<td>' + esc(String(row.fecha_inicio || '').slice(0, 10)) + '</td>'
        + '<td>' + esc(row.dias) + '</td>'
        + '<td>' + esc(row.cie) + '</td>'
        + '<td>' + esc(row.codigo_barras) + '</td>'
        + '<td>' + esc(row.origen) + '</td>'
        + '<td style="white-space:nowrap;font-size:11px;">' + esc(fr) + '</td>'
        + '<td style="white-space:nowrap;">'
        + '<button class="btn" style="padding:4px 8px;font-size:11px;" onclick="dmVer(' + row.id + ')">Ver</button> '
        + (row.tiene_pdf ? '<button class="btn" style="padding:4px 8px;font-size:11px;" onclick="dmPdf(' + row.id + ')">PDF</button> ' : '')
        + '<button class="btn" style="padding:4px 8px;font-size:11px;background:#c0392b;" onclick="dmAnular(' + row.id + ')">Anular</button>'
        + '</td></tr>';
    });
    html += '</tbody></table></div>';
    wrap.innerHTML = html;
  }

  async function cargarDashboard() {
    var box = document.getElementById('dm-dash-body');
    if (!box) return;
    box.innerHTML = '<p style="color:#888;padding:12px;">Cargando dashboard...</p>';
    var r = await fetch(api() + '/admin/descansos/dashboard/stats?' + qsFiltros(), { headers: hdr() });
    var d = await r.json();
    if (!d.ok) { box.innerHTML = '<p style="color:#c0392b;">' + esc(d.error) + '</p>'; return; }
    var s = d.resumen || {};
    function lista(arr, labelFn) {
      if (!arr || !arr.length) return '<p style="color:#aaa;font-size:12px;">Sin datos</p>';
      return '<ul style="margin:0;padding-left:18px;font-size:12.5px;line-height:1.6;">'
        + arr.map(function(x) { return '<li>' + esc(labelFn(x)) + '</li>'; }).join('')
        + '</ul>';
    }
    box.innerHTML =
      '<div class="stats-grid" style="margin-bottom:16px;">'
      + '<div class="stat"><div class="n">' + (s.total || 0) + '</div><div class="l">Total DM</div></div>'
      + '<div class="stat"><div class="n">' + (s.efectivos || 0) + '</div><div class="l">Efectivos</div></div>'
      + '<div class="stat"><div class="n">' + (s.dias_total || 0) + '</div><div class="l">Días totales</div></div>'
      + '<div class="stat"><div class="n">' + (s.dias_promedio || 0) + '</div><div class="l">Promedio días</div></div>'
      + '</div>'
      + '<div class="breakdown-grid">'
      + '<div class="bl-box"><div class="bl-head"><i class="fas fa-building"></i> Por unidad</div>'
      + lista(d.por_unidad, function(x) { return x.k + ' — ' + x.n + ' DM / ' + x.dias + ' días'; }) + '</div>'
      + '<div class="bl-box"><div class="bl-head"><i class="fas fa-sitemap"></i> Por división</div>'
      + lista(d.por_division, function(x) { return x.k + ' — ' + x.n + ' / ' + x.dias + ' días'; }) + '</div>'
      + '<div class="bl-box"><div class="bl-head"><i class="fas fa-user-shield"></i> Por grado</div>'
      + lista(d.por_grado, function(x) { return x.k + ' — ' + x.n; }) + '</div>'
      + '<div class="bl-box"><div class="bl-head"><i class="fas fa-notes-medical"></i> Por diagnóstico</div>'
      + lista(d.por_diagnostico, function(x) { return String(x.k).slice(0, 60) + ' — ' + x.n; }) + '</div>'
      + '<div class="bl-box"><div class="bl-head"><i class="fas fa-code"></i> Por CIE</div>'
      + lista(d.por_cie, function(x) { return x.k + ' — ' + x.n; }) + '</div>'
      + '<div class="bl-box"><div class="bl-head"><i class="fas fa-file-alt"></i> Por tipo documento</div>'
      + lista(d.por_tipo, function(x) { return x.k + ' — ' + x.n; }) + '</div>'
      + '<div class="bl-box"><div class="bl-head"><i class="fas fa-users"></i> Top efectivos</div>'
      + lista(d.top_efectivos, function(x) {
        return (x.cip || '') + ' ' + nombreCompleto(x) + ' — ' + x.n + ' DM / ' + x.dias + ' días';
      }) + '</div>'
      + '<div class="bl-box"><div class="bl-head"><i class="fas fa-database"></i> Por origen</div>'
      + lista(d.por_origen, function(x) { return x.k + ' — ' + x.n; }) + '</div>'
      + '</div>';
  }

  function exportUrl(modo) {
    var q = qsFiltros();
    if (modo === 'pdf-list') return api() + '/admin/descansos/export/pdf?modo=listado&' + q + '&token=' + encodeURIComponent(token());
    if (modo === 'pdf-dash') return api() + '/admin/descansos/export/pdf?modo=dashboard&' + q + '&token=' + encodeURIComponent(token());
    return '#';
  }

  function abrirExport(modo) {
    window.open(exportUrl(modo), '_blank');
  }

  async function dmVer(id) {
    var r = await fetch(api() + '/admin/descansos/' + id, { headers: hdr() });
    var d = await r.json();
    if (!d.ok) { alert(d.error || 'Error'); return; }
    var row = d.row;
    var html = '<div style="font-size:13px;line-height:1.55;">'
      + '<p><strong>CIP:</strong> ' + esc(row.cip) + ' &nbsp; <strong>Código barras:</strong> ' + esc(row.codigo_barras) + '</p>'
      + '<p><strong>Nombre:</strong> ' + esc(nombreCompleto(row)) + '</p>'
      + '<p><strong>Grado:</strong> ' + esc(row.grado) + ' &nbsp; <strong>Unidad:</strong> ' + esc(row.unidad) + '</p>'
      + '<p><strong>División:</strong> ' + esc(row.division) + '</p>'
      + '<p><strong>Inicio:</strong> ' + esc(String(row.fecha_inicio || '').slice(0, 10))
      + ' &nbsp; <strong>Días:</strong> ' + esc(row.dias)
      + ' &nbsp; <strong>Término:</strong> ' + esc(String(row.fecha_termino || '').slice(0, 10)) + '</p>'
      + '<p><strong>CIE:</strong> ' + esc(row.cie) + '</p>'
      + '<p><strong>Diagnóstico:</strong> ' + esc(row.diagnostico) + '</p>'
      + '<p><strong>Documento:</strong> ' + esc(row.tipo_documento) + '</p>'
      + '<p><strong>Médico:</strong> ' + esc(row.grado_medico) + ' ' + esc(row.nombres_medico) + '</p>'
      + '<p><strong>CIP médico:</strong> ' + esc(row.cip_medico) + ' &nbsp; <strong>DNI médico:</strong> ' + esc(row.dni_medico)
      + ' &nbsp; <strong>CMP/COP:</strong> ' + esc(row.cmp_cop_medico) + '</p>'
      + '<p><strong>Centro:</strong> ' + esc(row.centro_asistencial) + '</p>'
      + '<p><strong>Origen:</strong> ' + esc(row.origen) + ' &nbsp; <strong>Fecha registro:</strong> '
      + esc(row.fecha_registro ? new Date(row.fecha_registro).toLocaleString('es-PE') : '') + '</p>'
      + '</div>';
    var modal = document.getElementById('dm-modal');
    var body = document.getElementById('dm-modal-body');
    if (body) body.innerHTML = html;
    if (modal) modal.style.display = 'flex';
  }

  function dmPdf(id) {
    window.open(api() + '/admin/descansos/' + id + '/pdf?inline=1&token=' + encodeURIComponent(token()), '_blank');
  }

  async function dmAnular(id) {
    if (!confirm('¿Anular este registro de descanso médico?')) return;
    var r = await fetch(api() + '/admin/descansos/' + id, { method: 'DELETE', headers: hdr() });
    var d = await r.json();
    if (!d.ok) { alert(d.error || 'Error'); return; }
    cargarListado();
    cargarDashboard();
  }

  function cerrarModal() {
    var modal = document.getElementById('dm-modal');
    if (modal) modal.style.display = 'none';
  }

  function leerExcelBase64(inputId) {
    return new Promise(function(resolve, reject) {
      var input = document.getElementById(inputId);
      var f = input && input.files && input.files[0];
      if (!f) return reject(new Error('Seleccione un archivo Excel'));
      var reader = new FileReader();
      reader.onload = function() { resolve({ data: reader.result, nombre: f.name }); };
      reader.onerror = function() { reject(new Error('No se pudo leer el archivo')); };
      reader.readAsDataURL(f);
    });
  }

  async function importarHistorico() {
    var msg = document.getElementById('dm-import-msg');
    try {
      if (msg) msg.textContent = 'Importando...';
      var file = await leerExcelBase64('dm-excel-historico');
      var r = await fetch(api() + '/admin/descansos/importar-historico', {
        method: 'POST', headers: hdr(),
        body: JSON.stringify({ archivo: file.data, nombre: file.nombre })
      });
      var d = await r.json();
      if (!d.ok) { if (msg) msg.textContent = d.error || 'Error'; return; }
      if (msg) msg.textContent = d.mensaje + (d.omitidos ? ' · Omitidos: ' + d.omitidos : '');
      await cargarMeta();
      await cargarListado();
      await cargarDashboard();
    } catch (e) {
      if (msg) msg.textContent = e.message;
    }
  }

  async function cotejarHospital() {
    var msg = document.getElementById('dm-cotejo-msg');
    var resBox = document.getElementById('dm-cotejo-resultado');
    try {
      if (msg) msg.textContent = 'Cotejando...';
      var file = await leerExcelBase64('dm-excel-hospital');
      var anio = (document.getElementById('dm-f-anio') || {}).value || DM_ANIO;
      var r = await fetch(api() + '/admin/descansos/cotejar-hospital', {
        method: 'POST', headers: hdr(),
        body: JSON.stringify({ archivo: file.data, nombre: file.nombre, anio: anio })
      });
      var d = await r.json();
      if (!d.ok) { if (msg) msg.textContent = d.error || 'Error'; return; }
      var s = d.resumen || {};
      if (msg) msg.textContent = 'Cotejo OK';
      if (resBox) {
        resBox.innerHTML = '<div class="stats-grid" style="margin-top:12px;">'
          + '<div class="stat"><div class="n">' + (s.hospital || 0) + '</div><div class="l">Hospital</div></div>'
          + '<div class="stat" style="border-color:#c8e6c9;"><div class="n" style="color:#1a7a3a;">' + (s.coincide || 0) + '</div><div class="l">Coincide</div></div>'
          + '<div class="stat" style="border-color:#ffe082;"><div class="n" style="color:#856404;">' + (s.solo_regpol || 0) + '</div><div class="l">Solo REGPOL</div></div>'
          + '<div class="stat" style="border-color:#f5c6cb;"><div class="n" style="color:#842029;">' + (s.solo_hospital || 0) + '</div><div class="l">Solo hospital</div></div>'
          + '</div>';
      }
      cargarHistorialCotejos();
    } catch (e) {
      if (msg) msg.textContent = e.message;
    }
  }

  async function cargarHistorialCotejos() {
    var box = document.getElementById('dm-cotejos-hist');
    if (!box) return;
    var r = await fetch(api() + '/admin/descansos-cotejos', { headers: hdr() });
    var d = await r.json();
    if (!d.ok) { box.innerHTML = ''; return; }
    if (!d.rows.length) { box.innerHTML = '<p style="color:#aaa;font-size:12px;">Sin cotejos previos.</p>'; return; }
    box.innerHTML = '<table class="tabla" style="width:100%;font-size:12px;"><thead><tr>'
      + '<th>Fecha</th><th>Título</th><th>Hospital</th><th>Coincide</th><th>Solo REGPOL</th><th>Solo hosp.</th><th>Por</th>'
      + '</tr></thead><tbody>'
      + d.rows.map(function(row) {
        return '<tr><td>' + esc(row.creado ? new Date(row.creado).toLocaleString('es-PE') : '') + '</td>'
          + '<td>' + esc(row.titulo) + '</td>'
          + '<td>' + esc(row.total_hospital) + '</td>'
          + '<td>' + esc(row.total_coincide) + '</td>'
          + '<td>' + esc(row.total_solo_regpol) + '</td>'
          + '<td>' + esc(row.total_solo_hospital) + '</td>'
          + '<td>' + esc(row.creado_por) + '</td></tr>';
      }).join('')
      + '</tbody></table>';
  }

  async function initPaginaDescansos() {
    var anioEl = document.getElementById('dm-f-anio');
    if (anioEl && !anioEl.value) anioEl.value = String(DM_ANIO);
    await cargarMeta();
    await cargarListado();
    await cargarDashboard();
    await cargarHistorialCotejos();
  }

  function aplicarFiltros() {
    filtrarUnidadesPorDivision();
    cargarListado();
    cargarDashboard();
  }

  function limpiarFiltros() {
    ['division', 'unidad', 'grado', 'tipo_documento', 'origen'].forEach(function(k) {
      var el = document.getElementById('dm-f-' + k);
      if (el) el.value = '';
    });
    var anioEl = document.getElementById('dm-f-anio');
    if (anioEl) anioEl.value = String(DM_ANIO);
    aplicarFiltros();
  }

  global.dmInit = initPaginaDescansos;
  global.dmAplicarFiltros = aplicarFiltros;
  global.dmLimpiarFiltros = limpiarFiltros;
  global.dmImportarHistorico = importarHistorico;
  global.dmCotejarHospital = cotejarHospital;
  global.dmExport = abrirExport;
  global.dmVer = dmVer;
  global.dmPdf = dmPdf;
  global.dmAnular = dmAnular;
  global.dmCerrarModal = cerrarModal;
  global.dmOnDivisionChange = function() { filtrarUnidadesPorDivision(); };
})(window);
