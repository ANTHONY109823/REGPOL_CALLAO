/* ================================================================
   panel-admin.js — Panel de Control Operador UNITIC
   REGPOL Callao — Ing. Anthony Ccayo — 2026
================================================================ */

var WEB_APP_URL = 'http://localhost:3000';
var ADMIN_PASS  = 'AdminUNITIC2026';
var vistaAdminActual = 'dashboard';

function cambiarVistaAdmin(vista) {
  vistaAdminActual = vista;
  sessionStorage.setItem('panelAdminVista', vista);

  document.querySelectorAll('.admin-vista').forEach(function(el) {
    el.classList.remove('activa');
  });
  document.querySelectorAll('.sidebar-item').forEach(function(btn) {
    btn.classList.toggle('activo', btn.getAttribute('data-vista') === vista);
  });

  var panel = document.getElementById('vista-' + vista);
  if (panel) panel.classList.add('activa');

  if (vista === 'dashboard') cargarDashboardAdmin();
}

function cargarDashboardAdmin() {
  var comisActiva = localStorage.getItem('comisariaActiva') || 'No configurada';
  var elComis = document.getElementById('dash-kpi-comisaria-activa');
  if (elComis) elComis.textContent = comisActiva;

  var url = WEB_APP_URL || localStorage.getItem('webAppUrl');
  if (!url) return;

  fetch(url + '/stats')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data.ok) return;
      setText('dash-kpi-total', data.totalCompletas || 0);
      setText('dash-kpi-progreso', data.progresosActivos || 0);
      setText('dash-kpi-comisarias', (data.porComisaria || []).length);

      var tbody = document.querySelector('#tabla-ultimas-eval tbody');
      if (tbody) {
        var rows = data.ultimasEvaluaciones || [];
        if (!rows.length) {
          tbody.innerHTML = '<tr><td colspan="3">Sin evaluaciones registradas aún.</td></tr>';
        } else {
          tbody.innerHTML = rows.map(function(r) {
            return '<tr><td>' + escDash(r.fecha) + '</td><td>' + escDash(r.comisaria) + '</td><td>' + escDash(r.nombres) + '</td></tr>';
          }).join('');
        }
      }
      var act = document.getElementById('dash-ultima-act');
      if (act) act.textContent = 'Actualizado: ' + new Date().toLocaleString('es-PE');
    })
    .catch(function() {
      var tbody = document.querySelector('#tabla-ultimas-eval tbody');
      if (tbody) tbody.innerHTML = '<tr><td colspan="3">No se pudo conectar con la Web App.</td></tr>';
    });
}

function setText(id, val) {
  var el = document.getElementById(id);
  if (el) el.textContent = val;
}

function escDash(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function mostrarPanelAutenticado() {
  document.body.classList.add('autenticado');
  sessionStorage.setItem('panelAdminAuth', '1');

  var statNombre = document.getElementById('stat-nombre-comisaria');
  if (statNombre) {
    statNombre.textContent = localStorage.getItem('comisariaActiva') || 'No configurada';
  }

  var vista = sessionStorage.getItem('panelAdminVista') || 'dashboard';
  cambiarVistaAdmin(vista);

  setTimeout(cargarComisariasDesdeSheet, 300);
  if (typeof initCMS === 'function') setTimeout(initCMS, 400);
}

function verificarPassword() {
  var input  = document.getElementById('input-password');
  var alerta = document.getElementById('alerta-login');

  if (input.value === ADMIN_PASS) {
    alerta.classList.remove('visible');
    input.value = '';
    mostrarPanelAutenticado();
  } else {
    alerta.classList.add('visible');
    input.value = '';
    input.focus();
  }
}

function guardarComisaria() {
  var input  = document.getElementById('admin-comisaria');
  var nombre = input.value.trim().toUpperCase();
  var alerta = document.getElementById('alerta-guardado');

  if (!nombre) {
    input.style.borderColor = '#c0392b';
    return;
  }

  input.style.borderColor = '';
  localStorage.setItem('comisariaActiva', nombre);

  var statNombre = document.getElementById('stat-nombre-comisaria');
  if (statNombre) statNombre.textContent = nombre;
  var dashComis = document.getElementById('dash-kpi-comisaria-activa');
  if (dashComis) dashComis.textContent = nombre;

  alerta.classList.add('visible');
  setTimeout(function() { alerta.classList.remove('visible'); }, 3000);
}

function cerrarSesionAdmin() {
  sessionStorage.removeItem('panelAdminAuth');
  sessionStorage.removeItem('panelAdminVista');
  document.body.classList.remove('autenticado');
  document.getElementById('input-password').value = '';
  document.getElementById('alerta-login').classList.remove('visible');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function cargarComisariasDesdeSheet() {
  var url    = WEB_APP_URL || localStorage.getItem('webAppUrl');
  var select = document.getElementById('filtro-comisaria');
  var msg    = document.getElementById('msg-descarga');
  var ico    = document.getElementById('ico-refresh-comisarias');

  poblarSelectComisarias(select);

  if (!url) {
    mostrarMsgDescarga('Lista cargada. Configure la Web App para ver totales de la hoja.', 'error');
    mostrarInputWebApp();
    return;
  }

  if (ico) ico.classList.add('fa-spin');
  select.disabled = true;
  msg.style.display = 'none';

  fetch(url + '/listar')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (ico) ico.classList.remove('fa-spin');
      select.disabled = false;

      if (data.ok && data.comisarias && data.comisarias.length) {
        agregarComisariasExtra(select, data.comisarias);
      }

      var statTotal = document.getElementById('stat-total-resp');
      var txtTotal  = document.getElementById('txt-total-resp');
      if (statTotal && txtTotal && data.ok) {
        statTotal.style.display = 'flex';
        txtTotal.textContent = 'Total de evaluaciones en la hoja: ' + (data.total || 0);
      }
    })
    .catch(function() {
      if (ico) ico.classList.remove('fa-spin');
      select.disabled = false;
      mostrarMsgDescarga('Lista de comisarías cargada. No se pudo conectar con la Web App.', 'error');
    });
}

function descargarPorComisaria() {
  var comisaria = document.getElementById('filtro-comisaria').value.trim();
  if (!comisaria) {
    mostrarMsgDescarga('Selecciona una comisaría primero.', 'error');
    return;
  }
  triggerDescarga(
    WEB_APP_URL + '/descargar?comisaria=' + encodeURIComponent(comisaria),
    'MMPI2_' + comisaria.replace(/\s+/g, '_') + '.csv'
  );
  mostrarMsgDescarga('Descargando evaluaciones de: ' + comisaria, 'ok');
}

function descargarTodas() {
  triggerDescarga(WEB_APP_URL + '/descargar', 'MMPI2_TODAS_LAS_COMISARIAS.csv');
  mostrarMsgDescarga('Descargando todas las evaluaciones...', 'ok');
}

function descargarPDFComisaria() {
  var comisaria = document.getElementById('filtro-comisaria').value.trim();
  if (!comisaria) { mostrarMsgDescarga('Selecciona una comisaría primero.', 'error'); return; }
  triggerDescarga(WEB_APP_URL + '/pdf/comisaria?comisaria=' + encodeURIComponent(comisaria),
    'MMPI2_' + comisaria.replace(/\s+/g,'_') + '.pdf');
  mostrarMsgDescarga('Generando PDF de: ' + comisaria + ' ...', 'ok');
}

function descargarPDFTodas() {
  fetch(WEB_APP_URL + '/listar').then(function(r){ return r.json(); }).then(function(data) {
    (data.comisarias || []).forEach(function(c) {
      setTimeout(function() {
        triggerDescarga(WEB_APP_URL + '/pdf/comisaria?comisaria=' + encodeURIComponent(c),
          'MMPI2_' + c.replace(/\s+/g,'_') + '.pdf');
      }, 800);
    });
    mostrarMsgDescarga('Generando PDFs de ' + (data.comisarias||[]).length + ' comisaría(s)...', 'ok');
  }).catch(function(){ mostrarMsgDescarga('Error al obtener comisarías.', 'error'); });
}

function triggerDescarga(url, nombre) {
  var link = document.createElement('a');
  link.href = url;
  link.download = nombre;
  link.target = '_blank';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function mostrarMsgDescarga(texto, tipo) {
  var msg = document.getElementById('msg-descarga');
  msg.textContent = texto;
  msg.style.display = 'block';
  msg.className = 'msg-descarga msg-descarga-' + (tipo === 'error' ? 'error' : 'ok');
  setTimeout(function() { msg.style.display = 'none'; }, 5000);
}

function mostrarInputWebApp() {
  // Ya no se necesita — usamos servidor local
}

function guardarWebAppUrl() {}

// ── VER EVALUACIONES EN PANTALLA ──────────────────────────────────────────────
function verDatos() {
  var panel = document.getElementById('panel-tabla-datos');
  if (!panel) return;
  panel.style.display = 'block';
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Poblar selector de comisarías del filtro
  fetch(WEB_APP_URL + '/listar')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var sel = document.getElementById('filtro-tabla-comisaria');
      if (!sel || !data.ok) return;
      var actual = sel.value;
      sel.innerHTML = '<option value="">-- Todas las comisarías --</option>';
      (data.comisarias || []).forEach(function(c) {
        var opt = document.createElement('option');
        opt.value = c; opt.textContent = c;
        if (c === actual) opt.selected = true;
        sel.appendChild(opt);
      });
    })
    .catch(function() {});

  cargarTablaDatos(1);
}

function cargarTablaDatos(pagina) {
  pagina = pagina || 1;
  var comisaria = (document.getElementById('filtro-tabla-comisaria') || {}).value || '';
  var busqueda  = ((document.getElementById('filtro-tabla-busqueda') || {}).value || '').trim();

  fetch(WEB_APP_URL + '/evaluaciones?pagina=' + pagina
    + '&comisaria=' + encodeURIComponent(comisaria)
    + '&busqueda='  + encodeURIComponent(busqueda))
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data.ok) { document.getElementById('tabla-datos-body').innerHTML = '<tr><td colspan="7">Error al cargar datos.</td></tr>'; return; }
      renderTabla(data.rows, data.total, data.pagina, data.paginas);
    })
    .catch(function() {
      document.getElementById('tabla-datos-body').innerHTML =
        '<tr><td colspan="7" style="color:#f39c12;">Servidor no disponible. Asegúrate que node server.js esté corriendo.</td></tr>';
    });
}

function renderTabla(rows, total, pagina, paginas) {
  var tbody = document.getElementById('tabla-datos-body');
  var info  = document.getElementById('tabla-datos-info');
  if (!tbody) return;

  if (!rows || !rows.length) {
    tbody.innerHTML = '<tr><td colspan="7">No hay evaluaciones registradas aún.</td></tr>';
    if (info) info.textContent = 'Sin resultados.';
    return;
  }

  tbody.innerHTML = rows.map(function(r) {
    var resp = {};
    try { resp = typeof r.respuestas === 'string' ? JSON.parse(r.respuestas) : (r.respuestas || {}); } catch(e) {}
    var total_resp = Object.keys(resp).length;
    return '<tr>'
      + '<td>' + escDash(r.id) + '</td>'
      + '<td>' + escDash(r.fecha) + '</td>'
      + '<td><strong>' + escDash(r.nombres) + '</strong></td>'
      + '<td>' + escDash(r.cip) + '</td>'
      + '<td>' + escDash(r.dni) + '</td>'
      + '<td>' + escDash(r.comisaria) + '</td>'
      + '<td style="text-align:center;">'
      + '<span style="background:#27ae60;color:#fff;padding:2px 7px;border-radius:10px;font-size:11px;margin-right:6px;">' + total_resp + '/566</span>'
      + '<a href="http://localhost:3000/pdf/efectivo?id=' + r.id + '" target="_blank" title="Descargar PDF individual" '
      + 'style="background:#c0392b;color:#fff;padding:2px 8px;border-radius:10px;font-size:11px;text-decoration:none;">PDF</a>'
      + '</td>'
      + '</tr>';
  }).join('');

  if (info) info.textContent = 'Mostrando ' + rows.length + ' de ' + total + ' evaluaciones | Página ' + pagina + ' de ' + paginas;

  // Paginación
  var paginacion = document.getElementById('tabla-paginacion');
  if (paginacion) {
    var btns = '';
    if (pagina > 1) btns += '<button class="btn-pag" onclick="cargarTablaDatos(' + (pagina-1) + ')">← Anterior</button>';
    for (var p = Math.max(1, pagina-2); p <= Math.min(paginas, pagina+2); p++) {
      btns += '<button class="btn-pag' + (p===pagina?' btn-pag-activo':'') + '" onclick="cargarTablaDatos(' + p + ')">' + p + '</button>';
    }
    if (pagina < paginas) btns += '<button class="btn-pag" onclick="cargarTablaDatos(' + (pagina+1) + ')">Siguiente →</button>';
    paginacion.innerHTML = btns;
  }
}

document.addEventListener('DOMContentLoaded', function() {
  poblarSelectComisarias('filtro-comisaria');
  poblarSelectComisarias('admin-comisaria');

  var guardado = localStorage.getItem('comisariaActiva') || '';
  if (guardado) seleccionarComisariaEnSelect('admin-comisaria', guardado);

  var storedUrl = localStorage.getItem('webAppUrl');
  if (storedUrl) WEB_APP_URL = storedUrl;

  if (sessionStorage.getItem('panelAdminAuth') === '1') {
    mostrarPanelAutenticado();
  } else {
    document.getElementById('input-password').focus();
  }
});
