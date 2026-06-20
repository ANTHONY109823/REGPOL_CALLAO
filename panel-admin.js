/* ================================================================
   panel-admin.js — Panel de Control Operador UNITIC
   REGPOL Callao — Ing. Anthony Ccayo — 2026
================================================================ */

var WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzHHCUjXQVNtgVTERGx3RuiGPfSHuhCgTVddHL8ByDJUE-lLQessVsdFCFabayhCC5u/exec';
var ADMIN_PASS  = 'AdminUNITIC2026';

function mostrarPanelAutenticado() {
  document.getElementById('login-admin').style.display     = 'none';
  document.getElementById('admin-contenido').style.display   = 'block';
  sessionStorage.setItem('panelAdminAuth', '1');

  var statNombre = document.getElementById('stat-nombre-comisaria');
  if (statNombre) {
    statNombre.textContent = localStorage.getItem('comisariaActiva') || 'No configurada';
  }

  setTimeout(cargarComisariasDesdeSheet, 300);
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

  alerta.classList.add('visible');
  setTimeout(function() { alerta.classList.remove('visible'); }, 3000);
}

function cerrarSesionAdmin() {
  sessionStorage.removeItem('panelAdminAuth');
  document.getElementById('login-admin').style.display     = 'flex';
  document.getElementById('admin-contenido').style.display = 'none';
  document.getElementById('input-password').value          = '';
  document.getElementById('alerta-login').classList.remove('visible');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function cargarComisariasDesdeSheet() {
  var url    = WEB_APP_URL || localStorage.getItem('webAppUrl');
  var select = document.getElementById('filtro-comisaria');
  var msg    = document.getElementById('msg-descarga');
  var ico    = document.getElementById('ico-refresh-comisarias');

  if (!url) {
    mostrarMsgDescarga('Falta configurar la URL de la Web App.', 'error');
    mostrarInputWebApp();
    return;
  }

  if (ico) ico.classList.add('fa-spin');
  select.innerHTML = '<option value="">-- Cargando... --</option>';
  select.disabled = true;
  msg.style.display = 'none';

  fetch(url + '?action=listar')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (ico) ico.classList.remove('fa-spin');
      select.disabled = false;

      if (!data.ok || !data.comisarias.length) {
        select.innerHTML = '<option value="">-- Sin respuestas aún --</option>';
        return;
      }

      select.innerHTML = '<option value="">-- Seleccionar comisaría --</option>';
      data.comisarias.forEach(function(c) {
        var op = document.createElement('option');
        op.value = c;
        op.textContent = c;
        select.appendChild(op);
      });

      var statTotal = document.getElementById('stat-total-resp');
      var txtTotal  = document.getElementById('txt-total-resp');
      if (statTotal && txtTotal) {
        statTotal.style.display = 'flex';
        txtTotal.textContent = 'Total de evaluaciones en la hoja: ' + data.total;
      }
    })
    .catch(function() {
      if (ico) ico.classList.remove('fa-spin');
      select.disabled = false;
      select.innerHTML = '<option value="">-- Error de conexión --</option>';
      mostrarMsgDescarga('No se pudo conectar con la Web App. Verifica que esté desplegada.', 'error');
    });
}

function descargarPorComisaria() {
  var url       = WEB_APP_URL || localStorage.getItem('webAppUrl');
  var comisaria = document.getElementById('filtro-comisaria').value.trim();

  if (!url) { mostrarInputWebApp(); return; }
  if (!comisaria) {
    mostrarMsgDescarga('Selecciona una comisaría primero.', 'error');
    return;
  }

  triggerDescarga(
    url + '?action=descargar&comisaria=' + encodeURIComponent(comisaria),
    'MMPI2_' + comisaria.replace(/\s+/g, '_') + '.csv'
  );
  mostrarMsgDescarga('Descargando evaluaciones de: ' + comisaria, 'ok');
}

function descargarTodas() {
  var url = WEB_APP_URL || localStorage.getItem('webAppUrl');
  if (!url) { mostrarInputWebApp(); return; }

  triggerDescarga(url + '?action=descargar', 'MMPI2_TODAS_LAS_COMISARIAS.csv');
  mostrarMsgDescarga('Descargando todas las evaluaciones...', 'ok');
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
  var campo = document.getElementById('campo-webapp-url');
  if (campo) { campo.style.display = 'block'; return; }

  var panel = document.querySelector('.panel-respuestas');
  var div = document.createElement('div');
  div.id = 'campo-webapp-url';
  div.style.cssText = 'background:rgba(243,156,18,.15);border:1px solid rgba(243,156,18,.4);border-radius:8px;padding:12px 14px;margin-top:12px;';
  div.innerHTML = '<p style="color:#fff;font-size:12.5px;margin:0 0 8px;"><i class="fas fa-exclamation-triangle" style="color:#f39c12;"></i> <strong>Configura la URL de tu Web App</strong> (Apps Script → Implementar → Nueva implementación):</p>'
    + '<div style="display:flex;gap:8px;flex-wrap:wrap;">'
    + '<input id="input-webapp-url" type="text" placeholder="https://script.google.com/macros/s/.../exec" style="flex:1;min-width:200px;padding:8px 10px;border-radius:6px;border:none;font-size:12px;" />'
    + '<button onclick="guardarWebAppUrl()" style="background:#f39c12;color:#fff;border:none;border-radius:6px;padding:8px 14px;font-weight:700;cursor:pointer;font-size:12px;">Guardar</button>'
    + '</div>';
  panel.appendChild(div);
}

function guardarWebAppUrl() {
  var val = document.getElementById('input-webapp-url').value.trim();
  if (!val || val.indexOf('script.google.com') === -1) {
    mostrarMsgDescarga('URL inválida. Debe ser una URL de Google Apps Script.', 'error');
    return;
  }
  localStorage.setItem('webAppUrl', val);
  WEB_APP_URL = val;
  document.getElementById('campo-webapp-url').style.display = 'none';
  cargarComisariasDesdeSheet();
}

document.addEventListener('DOMContentLoaded', function() {
  var guardado = localStorage.getItem('comisariaActiva') || '';
  var adminInput = document.getElementById('admin-comisaria');
  if (adminInput && guardado) adminInput.value = guardado;

  var storedUrl = localStorage.getItem('webAppUrl');
  if (storedUrl) WEB_APP_URL = storedUrl;

  if (sessionStorage.getItem('panelAdminAuth') === '1') {
    mostrarPanelAutenticado();
  } else {
    document.getElementById('input-password').focus();
  }
});
