
(function(global) {
  var FL_ANIO = 2026;
  var FL_META = { divisiones: [], unidades: [], situaciones: [] };
  var FL_ROWS = [];
  var FL_CAPS = {
    puede_registrar: false,
    puede_admin: false,
    puede_cambiar_situacion: false,
    unidad_asignada: null
  };
  var FL_CONSULTA = null;

  function api() { return (typeof regpolApiBase === 'function') ? regpolApiBase() : (window.REGPOL_API_BASE || ''); }
  function token() {
    return (typeof TOKEN !== 'undefined' && TOKEN)
      ? TOKEN
      : ((JSON.parse(localStorage.getItem('regpol_session') || '{}') || {}).token || '');
  }
  function hdr() { return { 'Content-Type': 'application/json', 'x-admin-token': token() }; }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function fmtFechaHora(v) {
    if (!v) return '—';
    try {
      return new Date(v).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });
    } catch (e) { return String(v); }
  }

  function badgeSit(s) {
    var c = s === 'TARDE' ? '#b8860b' : (s === 'ABANDONO' ? '#c0392b' : '#004d3d');
    return '<span style="display:inline-block;padding:3px 8px;border-radius:6px;background:' + c + ';color:#fff;font-size:11px;font-weight:700;">'
      + esc(s || 'FALTO') + '</span>';
  }

  function qsFiltros() {
    var p = new URLSearchParams();
    p.set('anio', FL_ANIO);
    ['division', 'unidad', 'situacion', 'mes', 'desde', 'hasta', 'q'].forEach(function(k) {
      var el = document.getElementById('fl-f-' + k);
      if (el && el.value) p.set(k, el.value);
    });
    return p.toString();
  }

  function fillSelect(id, items, placeholder) {
    var el = document.getElementById(id);
    if (!el) return;
    var cur = el.value;
    var opts = '<option value="">' + (placeholder || '— Todos —') + '</option>';
    (items || []).forEach(function(it) {
      var v = (typeof it === 'object') ? (it.k || it.unidad || '') : it;
      var lab = v;
      opts += '<option value="' + esc(v) + '">' + esc(lab) + '</option>';
    });
    el.innerHTML = opts;
    if (cur) el.value = cur;
  }

  function filtrarUnidadesPorDivision() {
    var div = (document.getElementById('fl-f-division') || {}).value || '';
    var list = (FL_META.unidades || []).filter(function(u) {
      if (!div) return true;
      return String(u.division || '').toUpperCase() === String(div).toUpperCase();
    });
    fillSelect('fl-f-unidad', list, '— Todas las unidades —');
  }

  function aplicarCapsUI() {
    var regBlock = document.getElementById('fl-block-registro');
    var importPage = document.querySelector('[data-page="faltos-import"]');
    var btnImportNav = document.querySelector('[data-page="faltos-import"]');
    if (regBlock) regBlock.style.display = FL_CAPS.puede_registrar ? '' : 'none';
    document.querySelectorAll('[data-fl-admin-only]').forEach(function(el) {
      el.style.display = FL_CAPS.puede_admin ? '' : 'none';
    });
    var uniHint = document.getElementById('fl-unidad-hint');
    if (uniHint) {
      uniHint.textContent = FL_CAPS.unidad_asignada
        ? ('Unidad asignada: ' + FL_CAPS.unidad_asignada)
        : (FL_CAPS.puede_admin ? 'Vista global (admin área / Super Admin)' : '');
    }
  }

  async function cargarMeta() {
    var r = await fetch(api() + '/admin/faltos/meta/filtros?anio=' + FL_ANIO, { headers: hdr() });
    var d = await r.json();
    if (!d.ok) return;
    FL_META = d;
    FL_CAPS.puede_registrar = !!d.puede_registrar;
    FL_CAPS.puede_admin = !!d.puede_admin;
    FL_CAPS.puede_cambiar_situacion = !!d.puede_cambiar_situacion;
    FL_CAPS.unidad_asignada = d.unidad_asignada || null;
    fillSelect('fl-f-division', d.divisiones, '— Todas las divisiones —');
    filtrarUnidadesPorDivision();
    fillSelect('fl-f-situacion', ['FALTO', 'TARDE', 'ABANDONO'], '— Todas —');
    aplicarCapsUI();
  }

  async function cargarListado() {
    var wrap = document.getElementById('fl-tabla-wrap');
    if (wrap) wrap.innerHTML = '<p style="color:#888;padding:16px;text-align:center;">Cargando...</p>';
    var r = await fetch(api() + '/admin/faltos?' + qsFiltros() + '&limit=500', { headers: hdr() });
    var d = await r.json();
    if (!d.ok) {
      if (wrap) wrap.innerHTML = '<p style="color:#c0392b;padding:16px;">' + esc(d.error || 'Error') + '</p>';
      return;
    }
    FL_ROWS = d.rows || [];
    if (d.puede_cambiar_situacion != null) FL_CAPS.puede_cambiar_situacion = !!d.puede_cambiar_situacion;
    var totalEl = document.getElementById('fl-total-label');
    if (totalEl) totalEl.textContent = (d.total || 0) + ' registro(s)';
    if (!FL_ROWS.length) {
      wrap.innerHTML = '<p style="color:#888;padding:20px;text-align:center;">Sin registros con estos filtros.</p>';
      return;
    }
    var html = '<div style="overflow:auto;"><table class="tabla" style="width:100%;font-size:12px;"><thead><tr>'
      + '<th>Nº registro</th><th>CIP</th><th>Nombres</th><th>Grado</th><th>Unidad</th>'
      + '<th>Inicio labor</th><th>Situación</th><th>Reincorporación</th><th>Origen</th><th></th>'
      + '</tr></thead><tbody>';
    FL_ROWS.forEach(function(row) {
      html += '<tr>'
        + '<td style="font-weight:700;white-space:nowrap;">' + esc(row.numero_registro) + '</td>'
        + '<td>' + esc(row.cip) + '</td>'
        + '<td>' + esc(row.apellidos_nombres) + '</td>'
        + '<td>' + esc(row.grado) + '</td>'
        + '<td>' + esc(row.unidad) + '</td>'
        + '<td style="white-space:nowrap;">' + esc(fmtFechaHora(row.inicio_labor)) + '</td>'
        + '<td>' + badgeSit(row.situacion) + '</td>'
        + '<td style="white-space:nowrap;">' + esc(fmtFechaHora(row.reincorporacion)) + '</td>'
        + '<td>' + esc(row.origen) + '</td>'
        + '<td><button type="button" class="btn" style="padding:4px 8px;font-size:11px;" onclick="flVer(' + row.id + ')">Ver</button></td>'
        + '</tr>';
    });
    html += '</tbody></table></div>';
    wrap.innerHTML = html;
  }

  async function cargarDashboard() {
    var body = document.getElementById('fl-dash-body');
    if (!body) return;
    body.innerHTML = '<p style="color:#888;padding:16px;">Cargando métricas...</p>';
    var r = await fetch(api() + '/admin/faltos/dashboard/stats?' + qsFiltros(), { headers: hdr() });
    var d = await r.json();
    if (!d.ok) {
      body.innerHTML = '<p style="color:#c0392b;">' + esc(d.error || 'Error') + '</p>';
      return;
    }
    var s = d.resumen || {};
    var html = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:18px;">'
      + kpi('Total 2026', s.total || 0, '#004d3d')
      + kpi('Falto', s.FALTO || 0, '#004d3d')
      + kpi('Tarde', s.TARDE || 0, '#b8860b')
      + kpi('Abandono', s.ABANDONO || 0, '#c0392b')
      + '</div>';

    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">';
    html += '<div><h4 style="margin:0 0 8px;color:#004d3d;font-size:13px;">Por unidad</h4>'
      + tablaSimple((d.por_unidad || []).map(function(x) { return [x.unidad, x.n]; }), ['Unidad', 'Nº'])
      + '</div>';
    html += '<div><h4 style="margin:0 0 8px;color:#004d3d;font-size:13px;">Por mes</h4>'
      + tablaSimple((d.por_mes || []).map(function(x) { return ['Mes ' + x.mes, x.n]; }), ['Mes', 'Nº'])
      + '</div>';
    html += '</div>';
    html += '<h4 style="margin:16px 0 8px;color:#004d3d;font-size:13px;">Últimos días</h4>'
      + tablaSimple((d.por_dia || []).map(function(x) {
        return [String(x.dia).slice(0, 10), x.n];
      }), ['Día', 'Nº']);
    body.innerHTML = html;
  }

  function kpi(label, n, color) {
    return '<div style="background:#f4f8f5;border:1.5px solid #cfdad2;border-left:4px solid ' + color + ';border-radius:8px;padding:12px;">'
      + '<div style="font-size:22px;font-weight:800;color:' + color + ';">' + n + '</div>'
      + '<div style="font-size:11px;font-weight:700;color:#666;text-transform:uppercase;">' + esc(label) + '</div></div>';
  }

  function tablaSimple(rows, heads) {
    if (!rows.length) return '<p style="color:#888;font-size:12px;">Sin datos</p>';
    var h = '<div style="overflow:auto;"><table class="tabla" style="width:100%;font-size:12px;"><thead><tr>';
    heads.forEach(function(x) { h += '<th>' + esc(x) + '</th>'; });
    h += '</tr></thead><tbody>';
    rows.forEach(function(r) {
      h += '<tr>';
      r.forEach(function(c) { h += '<td>' + esc(c) + '</td>'; });
      h += '</tr>';
    });
    return h + '</tbody></table></div>';
  }

  async function flBuscarRrhh() {
    var cip = ((document.getElementById('fl-reg-cip') || {}).value || '').replace(/\D/g, '');
    var box = document.getElementById('fl-rrhh-preview');
    if (!box) return;
    if (cip.length < 6) {
      box.innerHTML = '<span style="color:#888;">Ingrese CIP para cruzar con nómina</span>';
      return;
    }
    box.innerHTML = 'Buscando en RR.HH....';
    var r = await fetch(api() + '/admin/faltos/rrhh/' + encodeURIComponent(cip), { headers: hdr() });
    var d = await r.json();
    if (!d.ok) {
      box.innerHTML = '<span style="color:#c0392b;">' + esc(d.error || 'No encontrado') + '</span>';
      return;
    }
    var p = d.personal;
    box.innerHTML = '<strong style="color:#004d3d;">' + esc(p.apellidos_nombres) + '</strong><br>'
      + '<span style="font-size:12px;color:#555;">' + esc(p.grado) + ' · ' + esc(p.unidad)
      + (p.division ? ' · ' + esc(p.division) : '') + '</span>';
    box.dataset.ok = '1';
  }

  async function flRegistrar(ev) {
    if (ev) ev.preventDefault();
    if (!FL_CAPS.puede_registrar) {
      alert('Solo el personal de unidad puede registrar faltos.');
      return;
    }
    var cip = ((document.getElementById('fl-reg-cip') || {}).value || '').trim();
    var fecha = ((document.getElementById('fl-reg-fecha') || {}).value || '').trim();
    var hora = ((document.getElementById('fl-reg-hora') || {}).value || '').trim();
    var obs = ((document.getElementById('fl-reg-obs') || {}).value || '').trim();
    var msg = document.getElementById('fl-reg-msg');
    if (msg) msg.textContent = 'Guardando...';
    var r = await fetch(api() + '/admin/faltos', {
      method: 'POST',
      headers: hdr(),
      body: JSON.stringify({
        cip: cip,
        fecha_labor: fecha,
        hora_inicio_labor: hora,
        observacion: obs
      })
    });
    var d = await r.json();
    if (!d.ok) {
      if (msg) { msg.style.color = '#c0392b'; msg.textContent = d.error || 'Error'; }
      return;
    }
    if (msg) { msg.style.color = '#1a7a3a'; msg.textContent = 'Registrado: ' + d.falto.numero_registro; }
    mostrarModalComprobante(d.falto);
    var form = document.getElementById('fl-form-reg');
    if (form) form.reset();
    var prev = document.getElementById('fl-rrhh-preview');
    if (prev) { prev.innerHTML = ''; prev.dataset.ok = ''; }
    cargarListado();
    if (document.getElementById('fl-dash-body')) cargarDashboard();
  }

  function mostrarModalComprobante(f) {
    var modal = document.getElementById('fl-modal');
    var body = document.getElementById('fl-modal-body');
    if (!modal || !body || !f) return;
    body.innerHTML = htmlFicha(f, false);
    modal.classList.add('open');
  }

  function htmlFicha(f, conFormSituacion) {
    var html = '<div style="text-align:center;margin-bottom:14px;">'
      + '<div style="font-size:12px;color:#666;letter-spacing:.5px;">NÚMERO DE REGISTRO</div>'
      + '<div style="font-size:26px;font-weight:900;color:#004d3d;letter-spacing:1px;">' + esc(f.numero_registro) + '</div>'
      + '</div>'
      + '<table style="width:100%;font-size:13px;border-collapse:collapse;">'
      + filaF('CIP', f.cip)
      + filaF('Apellidos y nombres', f.apellidos_nombres)
      + filaF('Grado', f.grado)
      + filaF('Unidad', f.unidad)
      + filaF('División', f.division)
      + filaF('Inicio de labor', fmtFechaHora(f.inicio_labor))
      + filaF('Situación', f.situacion)
      + filaF('Reincorporación', fmtFechaHora(f.reincorporacion))
      + filaF('Observación', f.observacion || '—')
      + filaF('Origen', f.origen)
      + '</table>';

    if (conFormSituacion && FL_CAPS.puede_cambiar_situacion) {
      html += '<hr style="margin:16px 0;border:none;border-top:1px solid #dde8e5;">'
        + '<h4 style="margin:0 0 8px;color:#004d3d;font-size:13px;">Actualizar por reincorporación</h4>'
        + '<p style="font-size:12px;color:#666;margin:0 0 10px;">≤ 24 h → TARDE · &gt; 24 h → ABANDONO</p>'
        + '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end;">'
        + '<div><label style="font-size:11px;font-weight:700;display:block;">Fecha</label>'
        + '<input type="date" id="fl-sit-fecha" style="padding:7px;"></div>'
        + '<div><label style="font-size:11px;font-weight:700;display:block;">Hora</label>'
        + '<input type="time" id="fl-sit-hora" style="padding:7px;"></div>'
        + '<button type="button" class="btn btn-v" onclick="flGuardarSituacion(' + f.id + ')">Guardar situación</button>'
        + '</div>'
        + '<p id="fl-sit-msg" style="font-size:12px;margin-top:8px;"></p>';
    } else if (conFormSituacion && !FL_CAPS.puede_cambiar_situacion) {
      html += '<p style="font-size:12px;color:#856404;margin-top:12px;background:#fff8e6;padding:10px;border-radius:8px;">'
        + 'Solo el personal de la unidad puede modificar la situación. El admin del área solo consulta.</p>';
    }
    return html;
  }

  function filaF(k, v) {
    return '<tr><td style="padding:6px 8px;color:#666;width:38%;border-bottom:1px solid #eee;">' + esc(k)
      + '</td><td style="padding:6px 8px;font-weight:600;border-bottom:1px solid #eee;">' + esc(v == null ? '—' : v) + '</td></tr>';
  }

  async function flVer(id) {
    var r = await fetch(api() + '/admin/faltos/' + id, { headers: hdr() });
    var d = await r.json();
    if (!d.ok) { alert(d.error || 'Error'); return; }
    if (d.puede_cambiar_situacion != null) FL_CAPS.puede_cambiar_situacion = !!d.puede_cambiar_situacion;
    FL_CONSULTA = d.falto;
    var modal = document.getElementById('fl-modal');
    var body = document.getElementById('fl-modal-body');
    if (body) body.innerHTML = htmlFicha(d.falto, true);
    if (modal) modal.classList.add('open');
  }

  async function flConsultarNumero() {
    var cip = ((document.getElementById('fl-con-cip') || {}).value || '').trim();
    var num = ((document.getElementById('fl-con-numero') || {}).value || '').trim();
    var msg = document.getElementById('fl-con-msg');
    if (msg) msg.textContent = 'Buscando...';
    var r = await fetch(
      api() + '/admin/faltos/consulta?cip=' + encodeURIComponent(cip) + '&numero_registro=' + encodeURIComponent(num),
      { headers: hdr() }
    );
    var d = await r.json();
    if (!d.ok) {
      if (msg) { msg.style.color = '#c0392b'; msg.textContent = d.error || 'No encontrado'; }
      return;
    }
    if (msg) { msg.style.color = '#1a7a3a'; msg.textContent = 'Encontrado'; }
    if (d.puede_cambiar_situacion != null) FL_CAPS.puede_cambiar_situacion = !!d.puede_cambiar_situacion;
    FL_CONSULTA = d.falto;
    var modal = document.getElementById('fl-modal');
    var body = document.getElementById('fl-modal-body');
    if (body) body.innerHTML = htmlFicha(d.falto, true);
    if (modal) modal.classList.add('open');
  }

  async function flGuardarSituacion(id) {
    var fecha = ((document.getElementById('fl-sit-fecha') || {}).value || '').trim();
    var hora = ((document.getElementById('fl-sit-hora') || {}).value || '').trim();
    var msg = document.getElementById('fl-sit-msg');
    if (!fecha || !hora) {
      if (msg) { msg.style.color = '#c0392b'; msg.textContent = 'Complete fecha y hora de reincorporación'; }
      return;
    }
    if (msg) msg.textContent = 'Actualizando...';
    var r = await fetch(api() + '/admin/faltos/' + id + '/situacion', {
      method: 'PUT',
      headers: hdr(),
      body: JSON.stringify({ fecha_reincorporacion: fecha, hora_reincorporacion: hora })
    });
    var d = await r.json();
    if (!d.ok) {
      if (msg) { msg.style.color = '#c0392b'; msg.textContent = d.error || 'Error'; }
      return;
    }
    if (msg) { msg.style.color = '#1a7a3a'; msg.textContent = d.mensaje || 'Actualizado'; }
    FL_CONSULTA = d.falto;
    var body = document.getElementById('fl-modal-body');
    if (body) body.innerHTML = htmlFicha(d.falto, true);
    cargarListado();
    if (document.getElementById('fl-dash-body')) cargarDashboard();
  }

  function flCerrarModal() {
    var modal = document.getElementById('fl-modal');
    if (modal) modal.classList.remove('open');
  }

  function flAplicarFiltros() {
    cargarListado();
    if (document.getElementById('page-faltos-dash') && document.getElementById('page-faltos-dash').classList.contains('on')) {
      cargarDashboard();
    }
  }

  function flLimpiarFiltros() {
    ['division', 'unidad', 'situacion', 'mes', 'desde', 'hasta', 'q'].forEach(function(k) {
      var el = document.getElementById('fl-f-' + k);
      if (el) el.value = '';
    });
    filtrarUnidadesPorDivision();
    flAplicarFiltros();
  }

  function flOnDivisionChange() {
    filtrarUnidadesPorDivision();
  }

  function flExportCsv() {
    fetch(api() + '/admin/faltos/export/csv?' + qsFiltros(), { headers: hdr() })
      .then(function(r) { return r.blob(); })
      .then(function(blob) {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'faltos_2026.csv';
        a.click();
      })
      .catch(function() { alert('No se pudo exportar'); });
  }

  function flImportarHistorico() {
    if (!FL_CAPS.puede_admin) {
      alert('Solo el admin del área puede subir el Excel histórico.');
      return;
    }
    var inp = document.getElementById('fl-excel-historico');
    if (!inp || !inp.files || !inp.files[0]) {
      alert('Seleccione un archivo Excel');
      return;
    }
    var msg = document.getElementById('fl-import-msg');
    if (msg) msg.textContent = 'Subiendo...';
    var reader = new FileReader();
    reader.onload = async function() {
      var r = await fetch(api() + '/admin/faltos/importar-historico', {
        method: 'POST',
        headers: hdr(),
        body: JSON.stringify({ archivo: reader.result, nombre: inp.files[0].name })
      });
      var d = await r.json();
      if (!d.ok) {
        if (msg) { msg.style.color = '#c0392b'; msg.textContent = d.error || 'Error'; }
        return;
      }
      var extra = (d.errores && d.errores.length) ? (' · Ej.: ' + d.errores.slice(0, 3).join(' | ')) : '';
      if (msg) {
        msg.style.color = '#1a7a3a';
        msg.textContent = (d.mensaje || '') + extra;
      }
      cargarListado();
    };
    reader.readAsDataURL(inp.files[0]);
  }

  async function flInit() {
    var anioEl = document.getElementById('fl-f-anio');
    if (anioEl) { anioEl.value = FL_ANIO; anioEl.readOnly = true; }
    await cargarMeta();
    await cargarListado();
    if (document.getElementById('page-faltos-dash') && document.getElementById('page-faltos-dash').classList.contains('on')) {
      await cargarDashboard();
    }
  }

  global.flInit = flInit;
  global.flAplicarFiltros = flAplicarFiltros;
  global.flLimpiarFiltros = flLimpiarFiltros;
  global.flOnDivisionChange = flOnDivisionChange;
  global.flBuscarRrhh = flBuscarRrhh;
  global.flRegistrar = flRegistrar;
  global.flConsultarNumero = flConsultarNumero;
  global.flVer = flVer;
  global.flGuardarSituacion = flGuardarSituacion;
  global.flCerrarModal = flCerrarModal;
  global.flExportCsv = flExportCsv;
  global.flImportarHistorico = flImportarHistorico;
  global.flCargarDashboard = cargarDashboard;
})(typeof window !== 'undefined' ? window : this);
