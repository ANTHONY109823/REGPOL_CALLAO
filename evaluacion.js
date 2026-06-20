/* ================================================================
   evaluacion.js -- Logica del modulo MMPI-2 REGPOL Callao
   Ing. Anthony Ccayo -- UNITIC -- 2026
   Las preguntas estan en preguntas.js (566 items, V/F)

   ANTES DE PUBLICAR: reemplaza en CONFIG_FORMS los entry.XXXXXXX
   con los IDs reales de tu Google Form.
================================================================ */

/* ================================================================
   CONFIGURACION GOOGLE FORMS
   Sustituye TU_FORM_ID y cada entry.10000000XX con los valores
   reales que obtendras al ejecutar el script de Apps Script.
================================================================ */
var FORM_BASE = 'https://docs.google.com';
var FORM_PATH = '/forms/d/e/1FAIpQLSeese4MXIjiWOzDynlyH3Q42mrZE2BuRYalhdeR5IJUvpJtvw/formResponse';

var CONFIG_FORMS = {
  get URL_ENVIO() { return FORM_BASE + FORM_PATH; },
  ENTRY_COMISARIA:        'entry.1000000001',
  ENTRY_UNIDAD:           'entry.1000000002',
  ENTRY_NOMBRES:          'entry.1000000003',
  ENTRY_CIP:              'entry.1000000004',
  ENTRY_DNI:              'entry.1000000005',
  ENTRY_FECHA_NACIMIENTO: 'entry.1000000006',
  ENTRY_EDAD:             'entry.1000000007',
  ENTRADAS_PREGUNTAS: (function() {
    var m = {};
    for (var i = 1; i <= 566; i++) {
      m['ENTRY_P' + i] = 'entry.' + (2000000000 + i);
    }
    return m;
  })()
};

/* ================================================================
   ESTADO GLOBAL
   PREGUNTAS, TOTAL_PREGUNTAS y TOTAL_PAGINAS vienen de preguntas.js
================================================================ */
var ESTADO = {
  paginaActual:  1,
  pregsPorPag:   10,
  respuestas:    {},
  adminLogueado: false,
  panelAbierto:  false
};

/* ================================================================
   INICIO
================================================================ */
document.addEventListener('DOMContentLoaded', function() {
  var guardado = localStorage.getItem('comisariaActiva') || 'NO CONFIGURADA -- VER PANEL ADMIN';
  document.getElementById('nombre-comisaria').textContent = guardado;
  var adminInput = document.getElementById('admin-comisaria');
  if (guardado !== 'NO CONFIGURADA -- VER PANEL ADMIN') adminInput.value = guardado;

  /* Actualizar textos con los valores reales del MMPI-2 */
  document.getElementById('texto-pagina').textContent     = 'Pagina 1 de ' + TOTAL_PAGINAS;
  document.getElementById('texto-respondidas').textContent = '0 / ' + TOTAL_PREGUNTAS + ' respondidas';
  document.getElementById('info-pagina').textContent      = 'Pagina 1 de ' + TOTAL_PAGINAS;

  renderizarPagina(1);

  document.getElementById('f-nacimiento').addEventListener('change', calcularEdad);
  ['f-cip', 'f-dni'].forEach(function(id) {
    document.getElementById(id).addEventListener('input', function(e) {
      e.target.value = e.target.value.replace(/\D/g, '');
    });
  });
});

/* ================================================================
   CALCULO AUTOMATICO DE EDAD
================================================================ */
function calcularEdad() {
  var input = document.getElementById('f-nacimiento');
  var out   = document.getElementById('f-edad');
  if (!input.value) { out.value = ''; return; }
  var hoy  = new Date();
  var nac  = new Date(input.value);
  var edad = hoy.getFullYear() - nac.getFullYear();
  var mes  = hoy.getMonth() - nac.getMonth();
  if (mes < 0 || (mes === 0 && hoy.getDate() < nac.getDate())) edad--;
  if (edad < 18 || edad > 80) {
    out.value = 'Verifique la fecha ingresada';
    input.classList.add('invalido');
  } else {
    out.value = edad + ' anios';
    input.classList.remove('invalido');
    input.classList.add('valido');
  }
}

/* ================================================================
   RENDERIZADO DE PAGINA (paginacion de 10 en 10)
================================================================ */
function renderizarPagina(pagina) {
  ESTADO.paginaActual = pagina;
  var zona   = document.getElementById('zona-preguntas');
  var inicio = (pagina - 1) * ESTADO.pregsPorPag;
  var fin    = Math.min(inicio + ESTADO.pregsPorPag, TOTAL_PREGUNTAS);
  var subs   = PREGUNTAS.slice(inicio, fin);

  var html = '<table class="tabla-preguntas" role="grid">' +
    '<thead><tr>' +
    '<th class="col-n">#</th>' +
    '<th>Pregunta MMPI-2</th>' +
    '<th class="col-r">V &nbsp; F</th>' +
    '</tr></thead><tbody>';

  subs.forEach(function(p) {
    var r    = ESTADO.respuestas[p.id];
    var chkV = (r === 'V') ? 'checked' : '';
    var chkF = (r === 'F') ? 'checked' : '';
    var cls  = !r ? 'sin-marcar' : '';
    html += '<tr class="' + cls + '" id="fila-' + p.id + '">' +
      '<td class="td-num">' + p.id + '</td>' +
      '<td class="td-texto">' + p.texto + '</td>' +
      '<td class="td-resp">' +
        '<div class="opciones-si-no">' +
          '<label class="lbl-si">' +
            '<input type="radio" name="p' + p.id + '" value="V" ' + chkV +
            ' onchange="guardarRespuesta(' + p.id + ',\'V\')"> V' +
          '</label>' +
          '<label class="lbl-no">' +
            '<input type="radio" name="p' + p.id + '" value="F" ' + chkF +
            ' onchange="guardarRespuesta(' + p.id + ',\'F\')"> F' +
          '</label>' +
        '</div>' +
      '</td></tr>';
  });

  html += '</tbody></table>';
  zona.innerHTML = html;
  actualizarControles();
  actualizarProgreso();
  document.getElementById('card-cuestionario').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ================================================================
   GUARDAR RESPUESTA EN MEMORIA
================================================================ */
function guardarRespuesta(id, val) {
  ESTADO.respuestas[id] = val;
  var fila = document.getElementById('fila-' + id);
  if (fila) fila.classList.remove('sin-marcar');
  actualizarProgreso();
}

/* ================================================================
   BARRA DE PROGRESO
================================================================ */
function actualizarProgreso() {
  var resp = Object.keys(ESTADO.respuestas).length;
  var pct  = Math.round((resp / TOTAL_PREGUNTAS) * 100);
  document.getElementById('barra-progreso').style.width = pct + '%';
  document.getElementById('texto-pagina').textContent =
    'Pagina ' + ESTADO.paginaActual + ' de ' + TOTAL_PAGINAS;
  document.getElementById('texto-respondidas').textContent =
    resp + ' / ' + TOTAL_PREGUNTAS + ' respondidas';
  document.getElementById('aria-progreso').setAttribute('aria-valuenow', pct);
}

/* ================================================================
   CONTROLES DE PAGINACION
================================================================ */
function actualizarControles() {
  var pg    = ESTADO.paginaActual;
  var esUlt = (pg === TOTAL_PAGINAS);
  document.getElementById('btn-atras').disabled          = (pg === 1);
  document.getElementById('btn-siguiente').style.display = esUlt ? 'none' : 'inline-flex';
  document.getElementById('btn-finalizar').style.display = esUlt ? 'inline-flex' : 'none';
  document.getElementById('info-pagina').textContent     = 'Pagina ' + pg + ' de ' + TOTAL_PAGINAS;
}

function cambiarPagina(delta) {
  var nueva = ESTADO.paginaActual + delta;
  if (nueva < 1 || nueva > TOTAL_PAGINAS) return;

  if (delta > 0) {
    var inicio  = (ESTADO.paginaActual - 1) * ESTADO.pregsPorPag;
    var fin     = Math.min(inicio + ESTADO.pregsPorPag, TOTAL_PREGUNTAS);
    var sinResp = [];
    for (var i = inicio; i < fin; i++) {
      if (!ESTADO.respuestas[PREGUNTAS[i].id]) sinResp.push(PREGUNTAS[i].id);
    }
    if (sinResp.length > 0) {
      sinResp.forEach(function(id) {
        var f = document.getElementById('fila-' + id);
        if (f) f.classList.add('sin-marcar');
      });
      mostrarAlerta('Responda las ' + sinResp.length + ' pregunta(s) marcadas en rojo antes de continuar.', 'error');
      return;
    }
  }
  ocultarAlerta();
  renderizarPagina(nueva);
}

/* ================================================================
   VALIDACION FINAL Y ENVIO A GOOGLE FORMS
================================================================ */
function validarYEnviar() {
  var err    = false;
  var msgErr = '';
  var campos = [
    { id: 'f-unidad',     test: function(v) { return v.trim().length > 0; },      msg: 'La unidad/dependencia es obligatoria.' },
    { id: 'f-nombres',    test: function(v) { return v.trim().length > 0; },      msg: 'El nombre completo es obligatorio.' },
    { id: 'f-cip',        test: function(v) { return /^\d{6}$/.test(v.trim()); }, msg: 'El CIP debe tener exactamente 6 digitos.' },
    { id: 'f-dni',        test: function(v) { return /^\d{8}$/.test(v.trim()); }, msg: 'El DNI debe tener exactamente 8 digitos.' },
    { id: 'f-nacimiento', test: function(v) { return v.length > 0; },             msg: 'La fecha de nacimiento es obligatoria.' }
  ];

  campos.forEach(function(c) {
    var el = document.getElementById(c.id);
    el.classList.remove('invalido', 'valido');
    if (!c.test(el.value)) {
      el.classList.add('invalido');
      if (!err) msgErr = c.msg;
      err = true;
    } else {
      el.classList.add('valido');
    }
  });

  if (err) {
    mostrarAlerta(msgErr, 'error');
    document.getElementById('f-unidad').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  var sinRes = PREGUNTAS.filter(function(p) { return !ESTADO.respuestas[p.id]; });
  if (sinRes.length > 0) {
    mostrarAlerta('Faltan ' + sinRes.length + ' pregunta(s) sin responder. Revise todas las paginas.', 'error');
    return;
  }

  var nombres = document.getElementById('f-nombres').value.trim();
  var dni     = document.getElementById('f-dni').value.trim();
  var comis   = document.getElementById('nombre-comisaria').textContent;
  var msg     = 'Confirma el envio del MMPI-2?\n\nEfectivo: ' + nombres + '\nDNI: ' + dni + '\nComisaria: ' + comis;

  if (!confirm(msg)) return;
  enviarAGoogleForms();
}

function enviarAGoogleForms() {
  var overlay   = document.getElementById('overlay-envio');
  var spinner   = document.getElementById('spinner-overlay');
  var checkIcon = document.getElementById('check-ok-icon');
  var textoO    = document.getElementById('texto-overlay');
  var subtextoO = document.getElementById('subtexto-overlay');

  overlay.classList.add('visible');

  var datos = new FormData();
  datos.append(CONFIG_FORMS.ENTRY_COMISARIA,        document.getElementById('nombre-comisaria').textContent);
  datos.append(CONFIG_FORMS.ENTRY_UNIDAD,           document.getElementById('f-unidad').value.trim());
  datos.append(CONFIG_FORMS.ENTRY_NOMBRES,          document.getElementById('f-nombres').value.trim());
  datos.append(CONFIG_FORMS.ENTRY_CIP,              document.getElementById('f-cip').value.trim());
  datos.append(CONFIG_FORMS.ENTRY_DNI,              document.getElementById('f-dni').value.trim());
  datos.append(CONFIG_FORMS.ENTRY_FECHA_NACIMIENTO, document.getElementById('f-nacimiento').value);
  datos.append(CONFIG_FORMS.ENTRY_EDAD,             document.getElementById('f-edad').value);

  PREGUNTAS.forEach(function(p) {
    var entryId = CONFIG_FORMS.ENTRADAS_PREGUNTAS['ENTRY_P' + p.id];
    datos.append(entryId, ESTADO.respuestas[p.id] || '');
  });

  fetch(CONFIG_FORMS.URL_ENVIO, { method: 'POST', mode: 'no-cors', body: datos })
    .then(function() {
      spinner.style.display   = 'none';
      checkIcon.style.display = 'block';
      textoO.textContent      = 'MMPI-2 enviado correctamente!';
      subtextoO.textContent   = document.getElementById('f-nombres').value.trim() +
        ' | DNI: ' + document.getElementById('f-dni').value.trim();
      setTimeout(function() { overlay.classList.remove('visible'); limpiarFormulario(); }, 5000);
    })
    .catch(function() {
      spinner.style.display = 'none';
      textoO.textContent    = 'Error de conexion. Intente nuevamente.';
      textoO.style.color    = '#ffaaaa';
      setTimeout(function() {
        overlay.classList.remove('visible');
        spinner.style.display = 'block';
        textoO.textContent    = 'Enviando evaluacion...';
        textoO.style.color    = '';
      }, 4000);
    });
}

function limpiarFormulario() {
  ['f-unidad', 'f-nombres', 'f-cip', 'f-dni', 'f-nacimiento', 'f-edad'].forEach(function(id) {
    document.getElementById(id).value = '';
  });
  ESTADO.respuestas = {};
  renderizarPagina(1);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ================================================================
   ALERTAS
================================================================ */
function mostrarAlerta(msg, tipo) {
  var el = document.getElementById('alerta-global');
  document.getElementById('texto-alerta-global').textContent = msg;
  el.className = 'alerta alerta-' + (tipo === 'error' ? 'error' : 'exito') + ' visible';
}
function ocultarAlerta() {
  document.getElementById('alerta-global').classList.remove('visible');
}

/* ================================================================
   PANEL DE ADMINISTRACION (contrasena: AdminUNITIC2026)
================================================================ */
function togglePanelAdmin() {
  ESTADO.panelAbierto = !ESTADO.panelAbierto;
  document.getElementById('panel-admin').style.display =
    ESTADO.panelAbierto ? 'block' : 'none';
  if (ESTADO.panelAbierto) {
    document.getElementById('panel-admin').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function verificarPassword() {
  var input  = document.getElementById('input-password');
  var alerta = document.getElementById('alerta-login');
  if (input.value === 'AdminUNITIC2026') {
    ESTADO.adminLogueado = true;
    document.getElementById('login-admin').style.display     = 'none';
    document.getElementById('admin-contenido').style.display = 'block';
    alerta.classList.remove('visible');
    input.value = '';
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
  if (!nombre) { input.style.borderColor = '#c0392b'; return; }
  input.style.borderColor = '';
  localStorage.setItem('comisariaActiva', nombre);
  document.getElementById('nombre-comisaria').textContent = nombre;
  alerta.classList.add('visible');
  setTimeout(function() { alerta.classList.remove('visible'); }, 3000);
}

function cerrarSesionAdmin() {
  ESTADO.adminLogueado = false;
  document.getElementById('login-admin').style.display     = 'block';
  document.getElementById('admin-contenido').style.display = 'none';
  document.getElementById('input-password').value          = '';
  document.getElementById('alerta-login').classList.remove('visible');
}
