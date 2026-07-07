/* ================================================================
   evaluacion.js — PROGRAMA DE BIENESTAR REGPOL Callao
   Ing. Anthony Ccayo — UNITIC — 2026
   Preguntas se cargan desde la API (PostgreSQL)
================================================================ */

var LOCAL_API = (function() {
  if (typeof regpolApiBase === 'function') return regpolApiBase();
  if (window.REGPOL_API_BASE) return window.REGPOL_API_BASE;
  var h = location.hostname;
  if (h === 'localhost' || h === '127.0.0.1') return 'http://localhost:3000';
  return window.REGPOL_API_PRODUCTION || 'https://regpolcallao-production.up.railway.app';
})();

var PREGUNTAS       = [];   // se llena desde /preguntas
var TOTAL_PREGUNTAS = 0;
var TOTAL_BLOQUES   = 0;
var PREG_POR_BLOQUE = 50;   // 566 / 50 = ~12 bloques

var ESTADO = {
  bloqueActual:    1,
  pregsPorBloque:  PREG_POR_BLOQUE,
  respuestas:      {},
  registroCompleto: false,
  tiempoAcumulado: 0
};
var ALERTA_FINAL_MOSTRADA = false;
var FOTO_BASE64 = '';
var CAM_STREAM = null;
var EVAL_TIEMPO_KEY = 'regpol_eval_tiempo_inicio';

function claveTiempoSesion(cip) {
  return EVAL_TIEMPO_KEY + '_' + String(cip || 'anon').toLowerCase().trim();
}

function obtenerCipEvaluacion() {
  var el = document.getElementById('f-cip');
  return el ? el.value.trim() : '';
}

function iniciarCronometroEvaluacion(cip) {
  cip = cip || obtenerCipEvaluacion();
  if (!cip) return;
  var key = claveTiempoSesion(cip);
  try {
    if (!sessionStorage.getItem(key)) sessionStorage.setItem(key, String(Date.now()));
  } catch (e) {}
}

function reiniciarCronometroEvaluacion(cip) {
  cip = cip || obtenerCipEvaluacion();
  if (!cip) return;
  try { sessionStorage.setItem(claveTiempoSesion(cip), String(Date.now())); } catch (e) {}
}

function obtenerTiempoSesionSegundos(cip) {
  cip = cip || obtenerCipEvaluacion();
  if (!cip) return 0;
  try {
    var inicio = parseInt(sessionStorage.getItem(claveTiempoSesion(cip)), 10);
    if (!inicio || isNaN(inicio)) return 0;
    return Math.max(0, Math.floor((Date.now() - inicio) / 1000));
  } catch (e) {
    return 0;
  }
}

function aplicarTiempoAcumuladoDesdeData(data) {
  if (!data) return;
  ESTADO.tiempoAcumulado = Math.max(0, parseInt(data.tiempo_segundos, 10) || 0);
}

function obtenerTiempoTotalSegundos(cip) {
  return Math.max(0, (ESTADO.tiempoAcumulado || 0) + obtenerTiempoSesionSegundos(cip));
}

function limpiarCronometroEvaluacion(cip) {
  cip = cip || obtenerCipEvaluacion();
  if (!cip) return;
  try { sessionStorage.removeItem(claveTiempoSesion(cip)); } catch (e) {}
}

function toggleAreaOtroEval() {
  if (typeof regpolToggleAreaOtro === 'function') {
    regpolToggleAreaOtro('f-area', 'f-area-otro-box', 'f-area-otro');
  }
}

function obtenerAreaEvaluacion() {
  if (typeof regpolObtenerArea === 'function') return regpolObtenerArea('f-area', 'f-area-otro');
  var sel = document.getElementById('f-area');
  return sel ? sel.value.trim() : '';
}

function restaurarAreaEvaluacion(valor) {
  if (typeof regpolRestaurarArea === 'function') {
    regpolRestaurarArea('f-area', 'f-area-otro', 'f-area-otro-box', valor);
    return;
  }
  var sel = document.getElementById('f-area');
  if (sel && valor) sel.value = valor;
  toggleAreaOtroEval();
}

/* ================================================================
   INICIO — cargar preguntas desde API
================================================================ */
document.addEventListener('DOMContentLoaded', function() {
  try { sessionStorage.removeItem('regpol_aviso_unidades_ok'); } catch (e) {}
  cargarConfigUnidad();

  document.getElementById('f-nacimiento').addEventListener('input', formatearFechaNacimiento);
  document.getElementById('f-nacimiento').addEventListener('blur',  validarFechaNacimiento);
  var fotoInput = document.getElementById('f-foto');
  var fotoCamInput = document.getElementById('f-foto-cam');
  var btnFotoCam = document.getElementById('btn-foto-camara');
  var btnFotoGal = document.getElementById('btn-foto-galeria');
  if (fotoInput) fotoInput.addEventListener('change', manejarFotoSeleccionada);
  if (fotoCamInput) fotoCamInput.addEventListener('change', manejarFotoSeleccionada);
  if (btnFotoCam) btnFotoCam.addEventListener('click', abrirModalCamara);
  if (btnFotoGal && fotoInput) {
    btnFotoGal.addEventListener('click', function() { fotoInput.click(); });
  }
  var btnCapturar = document.getElementById('btn-capturar-foto');
  var btnCancelarCam = document.getElementById('btn-cancelar-camara');
  var btnCerrarCam = document.getElementById('btn-cerrar-camara');
  if (btnCapturar) btnCapturar.addEventListener('click', capturarFotoCamara);
  if (btnCancelarCam) btnCancelarCam.addEventListener('click', cerrarModalCamara);
  if (btnCerrarCam) btnCerrarCam.addEventListener('click', cerrarModalCamara);
  var modalCam = document.getElementById('modal-camara-foto');
  if (modalCam) {
    modalCam.addEventListener('click', function(ev) {
      if (ev.target === modalCam) cerrarModalCamara();
    });
  }
  var btnAvisoUnidades = document.getElementById('btn-aceptar-aviso-unidades');
  if (btnAvisoUnidades) btnAvisoUnidades.addEventListener('click', aceptarAvisoUnidades);
  ['f-cip','f-dni'].forEach(function(id) {
    document.getElementById(id).addEventListener('input', function(e) {
      e.target.value = e.target.value.replace(/\D/g,'');
    });
  });

  ocultarCuestionario();
  cargarPreguntas();
});

var EVAL_CACHE_CONFIG = 'regpol_eval_config_v2';
var EVAL_CACHE_PREG = 'regpol_eval_preguntas_v1';
var EVAL_CACHE_TTL = 30 * 60 * 1000;

function leerCacheEval(clave) {
  try {
    var raw = sessionStorage.getItem(clave);
    if (!raw) return null;
    var c = JSON.parse(raw);
    if (c.exp > Date.now()) return c.data;
  } catch (e) {}
  return null;
}

function guardarCacheEval(clave, data) {
  try {
    sessionStorage.setItem(clave, JSON.stringify({ data: data, exp: Date.now() + EVAL_CACHE_TTL }));
  } catch (e) {}
}

function escHtmlEval(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function extraerUnidadesActivasConfig(data) {
  if (!data || !data.ok || !Array.isArray(data.unidadesActivas)) return [];
  return data.unidadesActivas.map(function(u) { return String(u || '').trim(); }).filter(Boolean);
}

function esInicioDesdePortal() {
  try {
    return /(?:^|[?&])inicio=1(?:&|$)/.test(window.location.search || '');
  } catch (e) {
    return false;
  }
}

function debeMostrarAvisoUnidades() {
  return esInicioDesdePortal();
}

function mostrarModalAvisoUnidades(unidades) {
  var modal = document.getElementById('modal-aviso-unidades');
  var lista = document.getElementById('aviso-unidades-lista');
  if (!modal || !lista) return;

  if (!unidades.length) {
    lista.innerHTML = '<li class="aviso-unidad-vacia">Ninguna dependencia activa en este momento.</li>';
  } else if (unidades.length === 1) {
    lista.innerHTML = '<li class="aviso-unidad-unica">' + escHtmlEval(unidades[0]) + '</li>';
  } else {
    lista.innerHTML = unidades.map(function(u) {
      return '<li><i class="fas fa-check-circle" aria-hidden="true"></i> ' + escHtmlEval(u) + '</li>';
    }).join('');
  }

  modal.hidden = false;
  document.body.classList.add('eval-aviso-unidades-abierto');
  var btn = document.getElementById('btn-aceptar-aviso-unidades');
  if (btn) setTimeout(function() { btn.focus(); }, 120);
}

function aceptarAvisoUnidades() {
  var modal = document.getElementById('modal-aviso-unidades');
  if (modal) modal.hidden = true;
  document.body.classList.remove('eval-aviso-unidades-abierto');
  var reg = document.getElementById('card-registro');
  if (reg) reg.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function aplicarConfigUnidad(sel, data, opciones) {
  opciones = opciones || {};
  var activas = extraerUnidadesActivasConfig(data);
  var divisiones = (data && data.ok && data.divisiones) ? data.divisiones : [];
  var total = poblarSelectEvaluacionDivisiones(sel, divisiones, activas);
  if (opciones.mostrarAviso) {
    mostrarModalAvisoUnidades(activas);
  }
  if (!total) {
    sel.disabled = true;
    mostrarAlerta('El cuestionario no está habilitado para su dependencia en este momento. Contacte a la Oficina de Psicología.', 'error');
    return;
  }
  if (total === 1 && sel.options.length === 2) {
    sel.selectedIndex = 1;
    sel.disabled = true;
  } else {
    sel.disabled = false;
  }
  ocultarAlerta();
}

function configBuiltinEvaluacion() {
  if (typeof REGPOL_UNIDADES_BUILTIN === 'undefined' || !REGPOL_UNIDADES_BUILTIN.divisiones) return null;
  return { ok: true, unidadesActivas: [], divisiones: REGPOL_UNIDADES_BUILTIN.divisiones };
}

function cargarConfigUnidad() {
  var sel = document.getElementById('f-unidad');
  if (!sel) return;

  sel.innerHTML = '<option value="">Cargando dependencias...</option>';
  sel.disabled = true;

  fetch(LOCAL_API + '/config?_=' + Date.now())
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data || !data.ok) throw new Error('config');
      guardarCacheEval(EVAL_CACHE_CONFIG, data);
      aplicarConfigUnidad(sel, data, { mostrarAviso: debeMostrarAvisoUnidades() });
    })
    .catch(function() {
      var cached = leerCacheEval(EVAL_CACHE_CONFIG);
      if (cached && cached.ok) {
        aplicarConfigUnidad(sel, cached, { mostrarAviso: debeMostrarAvisoUnidades() });
        return;
      }
      sel.innerHTML = '<option value="">-- Sin dependencias activas --</option>';
      sel.disabled = true;
      mostrarAlerta('No se pudo cargar la configuración de dependencias. Recargue la página.', 'error');
      if (debeMostrarAvisoUnidades()) mostrarModalAvisoUnidades([]);
    });
}

function aplicarPreguntas(lista) {
  if (!lista || !lista.length) return;
  PREGUNTAS       = lista;
  TOTAL_PREGUNTAS = PREGUNTAS.length;
  TOTAL_BLOQUES   = Math.ceil(TOTAL_PREGUNTAS / PREG_POR_BLOQUE);
  ocultarAlerta();
  actualizarInfoBloque();
}

function cargarPreguntas() {
  var cached = leerCacheEval(EVAL_CACHE_PREG);
  if (cached && cached.length) aplicarPreguntas(cached);
  else if (typeof PREGUNTAS_LOCAL !== 'undefined' && PREGUNTAS_LOCAL.length) aplicarPreguntas(PREGUNTAS_LOCAL);
  else mostrarAlerta('Cargando cuestionario...', 'info');

  fetch(LOCAL_API + '/preguntas')
    .then(function(r){ return r.json(); })
    .then(function(data) {
      if (!data.ok || !data.preguntas.length) throw new Error('Sin preguntas');
      guardarCacheEval(EVAL_CACHE_PREG, data.preguntas);
      aplicarPreguntas(data.preguntas);
    })
    .catch(function() {
      if (PREGUNTAS.length) return;
      if (typeof PREGUNTAS_LOCAL !== 'undefined' && PREGUNTAS_LOCAL.length) {
        aplicarPreguntas(PREGUNTAS_LOCAL);
      } else {
        mostrarAlerta('Error cargando cuestionario. Recargue la página.', 'error');
      }
    });
}

function obtenerComisariaEvaluacion() {
  var sel = document.getElementById('f-unidad');
  return sel ? sel.value.trim() : '';
}

function aplicarUnidadPorDefectoSiVacia() {
  if (obtenerComisariaEvaluacion()) return;
  var sel = document.getElementById('f-unidad');
  if (!sel || sel.options.length !== 2) return;
  sel.selectedIndex = 1;
}

function editarDatosPersonales() {
  var reg = document.getElementById('card-registro');
  var cont = document.getElementById('card-continuar-cip');
  ESTADO.registroEstabaOculto = reg && reg.style.display === 'none';
  if (reg) {
    reg.style.display = '';
    reg.classList.remove('card-registro-bloqueado');
  }
  if (cont) cont.style.display = 'none';
  var btnContinuar = document.querySelector('.btn-registro-continuar');
  var btnGuardar = document.getElementById('btn-guardar-datos-continuar');
  if (btnContinuar) btnContinuar.style.display = ESTADO.registroCompleto ? 'none' : '';
  if (btnGuardar) btnGuardar.style.display = ESTADO.registroCompleto ? 'inline-flex' : 'none';
  aplicarUnidadPorDefectoSiVacia();
  mostrarAlerta('Actualice sus datos (especialmente la dependencia) y pulse «Guardar datos y volver al cuestionario».', 'info');
  if (reg) reg.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function guardarDatosYContinuarCuestionario() {
  var err = validarRegistro();
  if (err) {
    mostrarAlerta(err, 'error');
    document.getElementById('card-registro').scrollIntoView({ behavior: 'smooth' });
    return;
  }
  ocultarAlerta();
  var btn = document.getElementById('btn-guardar-datos-continuar');
  if (btn) btn.disabled = true;
  guardarRegistroEnServidor(function(ok) {
    if (btn) btn.disabled = false;
    activarCuestionario(true);
    if (ESTADO.registroEstabaOculto) ocultarPanelRegistro();
    var btnContinuar = document.querySelector('.btn-registro-continuar');
    if (btnContinuar) btnContinuar.style.display = '';
    if (btn) btn.style.display = 'none';
    mostrarAlerta(ok
      ? 'Datos actualizados. Ya puede finalizar y enviar su cuestionario.'
      : 'Datos actualizados en este equipo. Revise conexión si no se guardó en el servidor.', 'exito');
    setTimeout(ocultarAlerta, 5000);
  });
}

function restaurarUnidadDesdeProgreso(data) {
  var unidad = (data && (data.unidad || data.comisaria)) ? String(data.unidad || data.comisaria).trim() : '';
  if (unidad) {
    seleccionarComisariaEnSelect('f-unidad', unidad);
  }
}

/* ================================================================
   FECHA Y EDAD
================================================================ */
function formatearFechaNacimiento(e) {
  var el = e.target;
  var digits = el.value.replace(/\D/g,'').slice(0,8);
  var f = '';
  if (digits.length <= 2)      f = digits;
  else if (digits.length <= 4) f = digits.slice(0,2)+'/'+digits.slice(2);
  else                          f = digits.slice(0,2)+'/'+digits.slice(2,4)+'/'+digits.slice(4);
  el.value = f;
  if (f.length === 10) validarFechaNacimiento();
}

function validarFechaNacimiento() {
  var input = document.getElementById('f-nacimiento');
  var msg   = document.getElementById('msg-nacimiento');
  var v     = input.value.trim();
  if (!v) { input.className = ''; if (msg) msg.textContent = 'Use formato dd/mm/aaaa (ej: 15/03/1990).'; return; }
  var nac = parsearFechaDMY(v);
  if (!nac) { input.classList.add('invalido'); if (msg) msg.textContent = 'Fecha inválida.'; return; }
  var e = obtenerEdad(nac);
  if (e < 18 || e > 80) { input.classList.add('invalido'); if (msg) msg.textContent = 'Edad debe ser 18-80 años.'; return; }
  input.classList.remove('invalido'); input.classList.add('valido');
  if (msg) msg.textContent = '';
}

function obtenerEdadParaEnvio() {
  var nac = parsearFechaDMY(document.getElementById('f-nacimiento').value);
  return nac ? obtenerEdad(nac) : 0;
}

function esImagenPermitida(file) {
  if (!file) return false;
  var tipo = (file.type || '').toLowerCase();
  if (/^image\/(jpeg|jpg|png|webp|pjpeg|x-png)$/i.test(tipo)) return true;
  return /\.(jpe?g|png|webp)$/i.test(file.name || '');
}

function mostrarErrorFoto(msg) {
  var campo = document.querySelector('.campo-foto');
  var inp = document.getElementById('f-foto');
  var msgEl = document.getElementById('msg-foto');
  if (campo) campo.classList.add('invalido');
  if (inp) inp.classList.add('invalido');
  if (msgEl) msgEl.textContent = msg;
  mostrarAlerta(msg, 'error');
}

function limpiarErrorFoto() {
  var campo = document.querySelector('.campo-foto');
  var inp = document.getElementById('f-foto');
  var msgEl = document.getElementById('msg-foto');
  if (campo) campo.classList.remove('invalido');
  if (inp) inp.classList.remove('invalido');
  if (msgEl) msgEl.textContent = 'Suba una foto (JPG, PNG o WEBP, máx. 2 MB).';
}

function comprimirImagenFoto(file, callback) {
  if (!window.FileReader || !window.Image) {
    var readerSimple = new FileReader();
    readerSimple.onload = function(ev) { callback(ev.target.result); };
    readerSimple.onerror = function() { callback(null); };
    readerSimple.readAsDataURL(file);
    return;
  }
  var reader = new FileReader();
  reader.onload = function(ev) {
    var img = new Image();
    img.onload = function() {
      var maxW = 1200, maxH = 1600;
      var w = img.width, h = img.height;
      var scale = Math.min(1, maxW / w, maxH / h);
      var cw = Math.max(1, Math.round(w * scale));
      var ch = Math.max(1, Math.round(h * scale));
      var canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, cw, ch);
      try {
        callback(canvas.toDataURL('image/jpeg', 0.88));
      } catch (e) {
        callback(ev.target.result);
      }
    };
    img.onerror = function() { callback(ev.target.result); };
    img.src = ev.target.result;
  };
  reader.onerror = function() { callback(null); };
  reader.readAsDataURL(file);
}

function aplicarFotoRegistro(dataUrl, nombreArchivo, inputEl) {
  var nombreEl = document.getElementById('foto-nombre');
  if (!dataUrl) {
    mostrarErrorFoto('No se pudo leer la imagen. Intente con otro archivo JPG o PNG.');
    if (inputEl) inputEl.value = '';
    if (nombreEl) { nombreEl.textContent = 'Sin foto'; nombreEl.classList.remove('ok'); }
    return;
  }
  if (dataUrl.length > 2.8 * 1024 * 1024) {
    mostrarErrorFoto('La foto comprimida sigue siendo muy grande. Use una imagen más pequeña.');
    if (inputEl) inputEl.value = '';
    if (nombreEl) { nombreEl.textContent = 'Sin foto'; nombreEl.classList.remove('ok'); }
    return;
  }
  FOTO_BASE64 = dataUrl;
  actualizarPreviewFoto(FOTO_BASE64);
  limpiarErrorFoto();
  ocultarAlerta();
  if (nombreEl) {
    nombreEl.textContent = (nombreArchivo || 'Foto') + ' — lista';
    nombreEl.classList.add('ok');
  }
}

function abrirModalCamara() {
  var modal = document.getElementById('modal-camara-foto');
  var video = document.getElementById('cam-video');
  var msgErr = document.getElementById('msg-camara-error');
  if (!modal || !video) return;
  if (msgErr) { msgErr.style.display = 'none'; msgErr.textContent = ''; }
  modal.hidden = false;
  document.body.style.overflow = 'hidden';

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    cerrarModalCamara();
    var inpCam = document.getElementById('f-foto-cam');
    if (inpCam) inpCam.click();
    return;
  }

  navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'user' }, width: { ideal: 1280 }, height: { ideal: 960 } },
    audio: false
  }).then(function(stream) {
    CAM_STREAM = stream;
    video.srcObject = stream;
    return video.play();
  }).catch(function() {
    cerrarModalCamara();
    var inpCam = document.getElementById('f-foto-cam');
    if (inpCam) inpCam.click();
    else mostrarErrorFoto('No se pudo acceder a la cámara. Use galería o permita el acceso.');
  });
}

function cerrarModalCamara() {
  var modal = document.getElementById('modal-camara-foto');
  var video = document.getElementById('cam-video');
  if (CAM_STREAM) {
    CAM_STREAM.getTracks().forEach(function(t) { t.stop(); });
    CAM_STREAM = null;
  }
  if (video) video.srcObject = null;
  if (modal) modal.hidden = true;
  document.body.style.overflow = '';
}

function capturarFotoCamara() {
  var video = document.getElementById('cam-video');
  if (!video || !video.videoWidth) return;
  var canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  var dataUrl;
  try {
    dataUrl = canvas.toDataURL('image/jpeg', 0.88);
  } catch (e) {
    mostrarErrorFoto('No se pudo capturar la imagen.');
    return;
  }
  cerrarModalCamara();
  var nombreEl = document.getElementById('foto-nombre');
  if (nombreEl) { nombreEl.textContent = 'Procesando captura...'; nombreEl.classList.remove('ok'); }
  aplicarFotoRegistro(dataUrl, 'captura-camara.jpg', null);
}

function manejarFotoSeleccionada(e) {
  var file = e.target.files && e.target.files[0];
  var nombreEl = document.getElementById('foto-nombre');
  if (!file) {
    FOTO_BASE64 = '';
    actualizarPreviewFoto('');
    if (nombreEl) { nombreEl.textContent = 'Sin foto'; nombreEl.classList.remove('ok'); }
    return;
  }
  if (!esImagenPermitida(file)) {
    mostrarErrorFoto('Use una imagen JPG, PNG o WEBP.');
    e.target.value = '';
    if (nombreEl) { nombreEl.textContent = 'Sin foto'; nombreEl.classList.remove('ok'); }
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    mostrarErrorFoto('La foto es demasiado grande. Elija una imagen menor a 8 MB.');
    e.target.value = '';
    return;
  }
  if (nombreEl) { nombreEl.textContent = 'Procesando: ' + file.name + '...'; nombreEl.classList.remove('ok'); }
  comprimirImagenFoto(file, function(dataUrl) {
    aplicarFotoRegistro(dataUrl, file.name, e.target);
  });
}

function actualizarPreviewFoto(src) {
  var preview = document.getElementById('foto-preview');
  var img = document.getElementById('foto-preview-img');
  var placeholder = document.getElementById('foto-placeholder');
  var cajita = document.getElementById('foto-cajita');
  var btnQuitar = preview ? preview.querySelector('.btn-quitar-foto') : null;
  if (!img) return;
  if (src) {
    img.src = src;
    if (placeholder) placeholder.style.display = 'none';
    if (btnQuitar) btnQuitar.style.display = 'flex';
    if (cajita) cajita.classList.add('con-foto');
  } else {
    img.src = '';
    if (placeholder) placeholder.style.display = 'flex';
    if (btnQuitar) btnQuitar.style.display = 'none';
    if (cajita) cajita.classList.remove('con-foto');
  }
}

function quitarFoto() {
  FOTO_BASE64 = '';
  var inp = document.getElementById('f-foto');
  var inpCam = document.getElementById('f-foto-cam');
  if (inp) inp.value = '';
  if (inpCam) inpCam.value = '';
  cerrarModalCamara();
  actualizarPreviewFoto('');
  limpiarErrorFoto();
  var nombreEl = document.getElementById('foto-nombre');
  if (nombreEl) { nombreEl.textContent = 'Sin foto'; nombreEl.classList.remove('ok'); }
}

function parsearFechaDMY(str) {
  var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((str||'').trim());
  if (!m) return null;
  var d = parseInt(m[1]), mo = parseInt(m[2])-1, y = parseInt(m[3]);
  if (mo<0||mo>11||d<1||d>31||y<1920||y>new Date().getFullYear()) return null;
  var f = new Date(y,mo,d);
  if (f.getFullYear()!==y||f.getMonth()!==mo||f.getDate()!==d||f>new Date()) return null;
  return f;
}

function obtenerEdad(nac) {
  var hoy = new Date(), e = hoy.getFullYear()-nac.getFullYear();
  if (hoy.getMonth()-nac.getMonth()<0||(hoy.getMonth()===nac.getMonth()&&hoy.getDate()<nac.getDate())) e--;
  return e;
}

function esFechaValida(v) { var n=parsearFechaDMY(v); if(!n) return false; var e=obtenerEdad(n); return e>=18&&e<=80; }

function fechaNacParaEnvio() {
  var nac = parsearFechaDMY(document.getElementById('f-nacimiento').value);
  if (!nac) return '';
  return nac.getFullYear()+'-'+String(nac.getMonth()+1).padStart(2,'0')+'-'+String(nac.getDate()).padStart(2,'0');
}

/* ================================================================
   REGISTRO Y CUESTIONARIO
================================================================ */
function contarRespuestasEnData(data) {
  if (!data) return 0;
  var r = data.respuestas;
  if (typeof r === 'string') {
    try { r = JSON.parse(r); } catch (e) { r = {}; }
  }
  r = r || {};
  return Object.keys(r).filter(function(k) { return r[k] === 'V' || r[k] === 'F'; }).length;
}

function validarRegistro() {
  var err='', campos=[
    {id:'f-unidad',  test:function(v){return v.trim().length>0;},      msg:'Seleccione su comisaría.'},
    {id:'f-grado',   test:function(v){return v.trim().length>0;},      msg:'Seleccione su grado.'},
    {id:'f-nombres', test:function(v){return v.trim().length>2;},      msg:'Ingrese su nombre completo.'},
    {id:'f-cip',     test:function(v){return /^\d{8}$/.test(v.trim());}, msg:'CIP: 8 dígitos.'},
    {id:'f-dni',     test:function(v){return /^\d{8}$/.test(v.trim());}, msg:'DNI: 8 dígitos.'},
    {id:'f-nacimiento',test:esFechaValida, msg:'Fecha de nacimiento inválida (18-80 años).'},
    {id:'f-sexo',    test:function(v){return v.trim().length>0;},     msg:'Seleccione el sexo.'},
    {id:'f-cargo',   test:function(v){return v.trim().length>0;},     msg:'Seleccione su cargo.'}
  ];
  campos.forEach(function(c){
    var el=document.getElementById(c.id);
    if (!el) return;
    el.classList.remove('invalido','valido');
    if (!c.test(el.value)){el.classList.add('invalido'); if(!err) err=c.msg;}
    else el.classList.add('valido');
  });
  var areaVal = obtenerAreaEvaluacion();
  var areaSel = document.getElementById('f-area');
  var areaOtro = document.getElementById('f-area-otro');
  if (areaSel) areaSel.classList.remove('invalido', 'valido');
  if (areaOtro) areaOtro.classList.remove('invalido', 'valido');
  if (!areaVal) {
    if (areaSel) areaSel.classList.add('invalido');
    if (areaSel && areaSel.value === 'OTRO' && areaOtro) areaOtro.classList.add('invalido');
    if (!err) err = (areaSel && areaSel.value === 'OTRO') ? 'Indique el área en el campo Otro.' : 'Seleccione su área.';
  } else {
    if (areaSel) areaSel.classList.add('valido');
    if (areaOtro && areaSel && areaSel.value === 'OTRO') areaOtro.classList.add('valido');
  }
  var campoFoto = document.querySelector('.campo-foto');
  var inpFoto = document.getElementById('f-foto');
  if (campoFoto) campoFoto.classList.remove('invalido');
  if (inpFoto) inpFoto.classList.remove('invalido');
  if (!FOTO_BASE64) {
    if (campoFoto) campoFoto.classList.add('invalido');
    if (inpFoto) inpFoto.classList.add('invalido');
    if (!err) err = 'Suba su fotografía (botón Seleccionar fotografía).';
  }
  return err;
}

function obtenerArmamento() {
  var vals = [];
  var chkP = document.getElementById('f-arm-particular');
  var chkE = document.getElementById('f-arm-estado');
  if (chkP && chkP.checked) vals.push(chkP.value);
  if (chkE && chkE.checked) vals.push(chkE.value);
  return vals;
}

function restaurarArmamentoDesdeData(data) {
  var str = '';
  if (data && data.armamento) {
    str = Array.isArray(data.armamento) ? data.armamento.join(', ') : String(data.armamento);
  }
  var chkP = document.getElementById('f-arm-particular');
  var chkE = document.getElementById('f-arm-estado');
  if (chkP) chkP.checked = /particular/i.test(str);
  if (chkE) chkE.checked = /estado/i.test(str);
}

function ocultarPanelRegistro() {
  var r = document.getElementById('card-registro');
  if (r) r.style.display = 'none';
  var c = document.getElementById('card-continuar-cip');
  if (c) c.style.display = 'none';
  ESTADO.registroCompleto = true;
}

function construirPayloadProgreso() {
  return {
    cip:       document.getElementById('f-cip').value.trim(),
    nombres:   document.getElementById('f-nombres').value.trim(),
    dni:       document.getElementById('f-dni').value.trim(),
    fecha_nac: fechaNacParaEnvio(),
    edad:      obtenerEdadParaEnvio(),
    comisaria: obtenerComisariaEvaluacion(),
    unidad:    document.getElementById('f-unidad').value.trim(),
    sexo:      (document.getElementById('f-sexo')||{value:''}).value||'',
    grado:     (document.getElementById('f-grado')||{value:''}).value||'',
    cargo:     (document.getElementById('f-cargo')||{}).value||'',
    area:      obtenerAreaEvaluacion(),
    armamento: obtenerArmamento(),
    foto:      FOTO_BASE64 || '',
    bloque:    ESTADO.bloqueActual || 1,
    total:     Object.keys(ESTADO.respuestas).filter(function(k) {
      return ESTADO.respuestas[k] === 'V' || ESTADO.respuestas[k] === 'F';
    }).length,
    respuestas: ESTADO.respuestas,
    tiempo_segundos: obtenerTiempoTotalSegundos()
  };
}

function guardarRegistroEnServidor(callback) {
  var payload = construirPayloadProgreso();
  if (!payload.cip) { if (callback) callback(false); return; }
  localStorage.setItem('progreso_' + payload.cip, JSON.stringify(payload));
  fetch(LOCAL_API + '/progreso', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).then(function(r) { return r.json(); })
    .then(function(d) {
      if (!d.ok) {
        var msgDup = mensajeErrorDuplicadoNombre(d);
        if (msgDup) mostrarAlerta(msgDup, 'error');
        if (callback) callback(false);
        return;
      }
      if (callback) callback(true);
    })
    .catch(function() { if (callback) callback(false); });
}

function construirPayloadGuardar(completada) {
  return {
    comisaria: obtenerComisariaEvaluacion(),
    unidad:    document.getElementById('f-unidad').value.trim(),
    nombres:   document.getElementById('f-nombres').value.trim(),
    cip:       document.getElementById('f-cip').value.trim(),
    dni:       document.getElementById('f-dni').value.trim(),
    fecha_nac: fechaNacParaEnvio(),
    edad:      obtenerEdadParaEnvio(),
    sexo:      (document.getElementById('f-sexo')||{value:''}).value.trim(),
    grado:     (document.getElementById('f-grado')||{value:''}).value.trim(),
    cargo:     document.getElementById('f-cargo').value.trim(),
    area:      obtenerAreaEvaluacion(),
    armamento: obtenerArmamento(),
    foto:      FOTO_BASE64 || '',
    respuestas: ESTADO.respuestas,
    completada: !!completada,
    tiempo_segundos: obtenerTiempoTotalSegundos()
  };
}

function ocultarCuestionario() {
  ESTADO.registroCompleto=false;
  var c=document.getElementById('card-cuestionario');
  if(c) c.classList.add('seccion-bloqueada');
  var r=document.getElementById('card-registro');
  if(r) r.classList.remove('card-registro-bloqueado');
}

function activarCuestionario(scroll) {
  ESTADO.registroCompleto=true;
  iniciarCronometroEvaluacion();
  var c=document.getElementById('card-cuestionario');
  if(c) c.classList.remove('seccion-bloqueada');
  var r=document.getElementById('card-registro');
  if(r) r.classList.add('card-registro-bloqueado');
  var btnGuardar = document.getElementById('btn-guardar-datos-continuar');
  if (btnGuardar) btnGuardar.style.display = 'none';
  var btnContinuar = document.querySelector('.btn-registro-continuar');
  if (btnContinuar) btnContinuar.style.display = '';
  renderizarBloque(ESTADO.bloqueActual, !!scroll);
}

function aplicarDatosProgresoAlEstado(data) {
  if (!data) return;
  ESTADO.respuestas = typeof data.respuestas === 'string'
    ? JSON.parse(data.respuestas) : (data.respuestas || {});
  ESTADO.bloqueActual = parseInt(data.bloque, 10) || 1;
  aplicarTiempoAcumuladoDesdeData(data);
}

function normalizarDataProgreso(data) {
  if (!data) return null;
  var n = contarRespuestasEnData(data);
  var total = Math.max(parseInt(data.total, 10) || 0, n);
  if (data.encontrado && (data.nombres || total > 0)) {
    data.total = total;
    return data;
  }
  if (total > 0) {
    data.total = total;
    return data;
  }
  return null;
}

function notificarSesionExistente(cip, info) {
  var msg;
  if (info && info.duplicado_por_nombre) {
    notificarDuplicadoPorNombre(cip, info.nombres);
    return;
  }
  if (info && info.completada) {
    msg = 'El CIP ' + cip + ' ya tiene una evaluación enviada a Psicología. '
      + 'No puede registrarse de nuevo. Si necesita ayuda, contacte a la Oficina de Psicología.';
  } else {
    msg = 'Ya tiene una sesión guardada'
      + (info && info.nombres ? ' a nombre de ' + info.nombres : '')
      + '. No complete el formulario otra vez: ingrese su CIP en el recuadro «¿Ya comenzó?» de arriba y pulse Continuar.';
  }
  mostrarAlerta(msg, 'error');

  var card = document.getElementById('card-continuar-cip');
  var inp = document.getElementById('f-cip-continuar');
  if (inp) inp.value = cip;
  if (card) {
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('continuar-cip-destacado');
    setTimeout(function() { card.classList.remove('continuar-cip-destacado'); }, 8000);
  }
  if (inp) {
    setTimeout(function() { inp.focus(); inp.select(); }, 400);
  }
}

function notificarDuplicadoPorNombre(cipExistente, nombres) {
  var msg = 'Ya existe un registro a nombre de ' + (nombres || 'esta persona')
    + ' con CIP ' + cipExistente + '. '
    + 'No puede registrarse con otro CIP. Si ese es su CIP, ingréselo en «¿Ya comenzó?» y pulse Continuar.';
  mostrarAlerta(msg, 'error');

  var card = document.getElementById('card-continuar-cip');
  var inp = document.getElementById('f-cip-continuar');
  if (inp) inp.value = cipExistente;
  if (card) {
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('continuar-cip-destacado');
    setTimeout(function() { card.classList.remove('continuar-cip-destacado'); }, 8000);
  }
  if (inp) {
    setTimeout(function() { inp.focus(); inp.select(); }, 400);
  }
}

function mensajeErrorDuplicadoNombre(data) {
  if (!data || data.error !== 'duplicado_nombre') return null;
  return 'Ya existe un registro a nombre de ' + (data.nombres_existente || 'esta persona')
    + ' con CIP ' + (data.cip_existente || '') + '. '
    + 'No puede registrarse con otro CIP.';
}

function procederRegistroNuevo(cip, btn) {
  if (btn) btn.disabled = true;
  verificarProgresoGuardado(cip, function(data) {
    if (data) aplicarDatosProgresoAlEstado(data);
    var banner = document.getElementById('banner-progreso');
    if (banner) banner.style.display = 'none';

    guardarRegistroEnServidor(function(ok) {
      if (btn) btn.disabled = false;
      if (!ok) {
        document.getElementById('card-registro').scrollIntoView({ behavior: 'smooth' });
        return;
      }
      activarCuestionario(true);
      guardarBloqueEnServidor();
      var nResp = contarRespuestasEnData({ respuestas: ESTADO.respuestas });
      var msg = nResp > 0
        ? 'Registro actualizado. Continúe desde el bloque ' + ESTADO.bloqueActual
          + ' (' + nResp + '/' + TOTAL_PREGUNTAS + ' respondidas).'
        : (ok
          ? 'Registro guardado. Cuestionario iniciado — puede continuar después con su CIP.'
          : 'Cuestionario iniciado. Guarde su avance con el botón inferior.');
      mostrarAlerta(msg, 'exito');
      setTimeout(ocultarAlerta, 4500);
    });
  });
}

function continuarAlCuestionario() {
  if (!PREGUNTAS.length) { mostrarAlerta('Espere a que cargue el cuestionario.','error'); return; }
  var err = validarRegistro();
  if (err) { mostrarAlerta(err,'error'); document.getElementById('card-registro').scrollIntoView({behavior:'smooth'}); return; }
  ocultarAlerta();

  var cip = document.getElementById('f-cip').value.trim();
  var dni = document.getElementById('f-dni').value.trim();
  var nombres = document.getElementById('f-nombres').value.trim();
  var btn = document.querySelector('.btn-registro-continuar');
  if (btn) btn.disabled = true;

  fetch(LOCAL_API + '/verificar-registro?cip=' + encodeURIComponent(cip)
    + '&dni=' + encodeURIComponent(dni)
    + '&nombres=' + encodeURIComponent(nombres))
    .then(function(r) { return r.json(); })
    .then(function(v) {
      if (v.ok && v.registrado) {
        if (btn) btn.disabled = false;
        notificarSesionExistente(v.cip || cip, v);
        return;
      }
      procederRegistroNuevo(cip, btn);
    })
    .catch(function() {
      procederRegistroNuevo(cip, btn);
    });
}

/* ================================================================
   BLOQUES — renderizado por bloques de 50 preguntas
================================================================ */
function actualizarInfoBloque() {
  var el = document.getElementById('texto-pagina');
  if (el) el.textContent = 'Bloque '+ESTADO.bloqueActual+' de '+TOTAL_BLOQUES;
  var er = document.getElementById('texto-respondidas');
  var resp = Object.keys(ESTADO.respuestas).length;
  if (er) er.textContent = resp+' / '+TOTAL_PREGUNTAS+' respondidas';
  var pct = TOTAL_PREGUNTAS>0 ? Math.round(resp/TOTAL_PREGUNTAS*100) : 0;
  var bar = document.getElementById('barra-progreso');
  if (bar) bar.style.width = pct+'%';
  var ip = document.getElementById('info-pagina');
  if (ip) ip.textContent = 'Bloque '+ESTADO.bloqueActual+' de '+TOTAL_BLOQUES+
    ' — '+pct+'% completado';
  if (resp >= TOTAL_PREGUNTAS && TOTAL_PREGUNTAS > 0 && ESTADO.registroCompleto && !ALERTA_FINAL_MOSTRADA) {
    ALERTA_FINAL_MOSTRADA = true;
    mostrarAlerta('Respondió las '+TOTAL_PREGUNTAS+' preguntas. Pulse "Finalizar y Enviar" para registrar en Psicología.','exito');
  }
}

function renderizarBloque(bloque, scroll) {
  if (!ESTADO.registroCompleto) return;
  ESTADO.bloqueActual = bloque;
  var zona   = document.getElementById('zona-preguntas');
  var inicio = (bloque-1)*ESTADO.pregsPorBloque;
  var fin    = Math.min(inicio+ESTADO.pregsPorBloque, TOTAL_PREGUNTAS);
  var subs   = PREGUNTAS.slice(inicio, fin);
  var desde  = inicio+1, hasta = fin;

  var html = '<div class="bloque-header" style="background:#004d3d;color:#fff;padding:8px 14px;border-radius:6px 6px 0 0;font-weight:700;font-size:13px;">'
    +'📋 BLOQUE '+bloque+' / '+TOTAL_BLOQUES+' — Preguntas '+desde+' a '+hasta
    +'</div>'
    +'<table class="tabla-preguntas" role="grid">'
    +'<thead><tr>'
    +'<th class="col-n">#</th>'
    +'<th>Pregunta</th>'
    +'<th class="col-r">V &nbsp; F</th>'
    +'</tr></thead><tbody>';

  subs.forEach(function(p) {
    var r=ESTADO.respuestas[p.id], chkV=r==='V'?'checked':'', chkF=r==='F'?'checked':'', cls=!r?'sin-marcar':'';
    html+='<tr class="'+cls+'" id="fila-'+p.id+'">'
      +'<td class="td-num">'+p.id+'</td>'
      +'<td class="td-texto">'+p.texto+'</td>'
      +'<td class="td-resp"><div class="opciones-si-no">'
        +'<label class="lbl-si"><input type="radio" name="p'+p.id+'" value="V" '+chkV
          +' onchange="guardarRespuesta('+p.id+',\'V\')"> V</label>'
        +'<label class="lbl-no"><input type="radio" name="p'+p.id+'" value="F" '+chkF
          +' onchange="guardarRespuesta('+p.id+',\'F\')"> F</label>'
      +'</div></td></tr>';
  });
  html+='</tbody></table>';
  zona.innerHTML = html;
  actualizarControles();
  actualizarInfoBloque();
  if (scroll!==false) document.getElementById('card-cuestionario').scrollIntoView({behavior:'smooth',block:'start'});
}

function guardarRespuesta(id, val) {
  if (!ESTADO.registroCompleto) return;
  ESTADO.respuestas[id]=val;
  var f=document.getElementById('fila-'+id);
  if(f) f.classList.remove('sin-marcar');
  actualizarInfoBloque();
  autoGuardarProgreso();
}

/* ================================================================
   CONTROLES DE NAVEGACIÓN ENTRE BLOQUES
================================================================ */
function actualizarControles() {
  var b=ESTADO.bloqueActual, esUlt=(b===TOTAL_BLOQUES);
  var btnA=document.getElementById('btn-atras');
  var btnS=document.getElementById('btn-siguiente');
  var btnF=document.getElementById('btn-finalizar');
  var btnG=document.getElementById('btn-guardar-bloque');
  if(btnA) btnA.disabled=(b===1);
  if(btnS) btnS.style.display=esUlt?'none':'inline-flex';
  if(btnF) btnF.style.display=esUlt?'inline-flex':'none';
  if(btnG) btnG.style.display='inline-flex'; // siempre visible
  var ip=document.getElementById('info-pagina');
  if(ip) ip.textContent='Bloque '+b+' de '+TOTAL_BLOQUES;
}

function cambiarBloque(delta) {
  if (!ESTADO.registroCompleto) { mostrarAlerta('Complete primero el Paso 1.','error'); return; }
  var nuevo = ESTADO.bloqueActual + delta;
  if (nuevo<1||nuevo>TOTAL_BLOQUES) return;

  if (delta>0) {
    // Validar que el bloque actual esté completo
    var inicio=(ESTADO.bloqueActual-1)*ESTADO.pregsPorBloque;
    var fin=Math.min(inicio+ESTADO.pregsPorBloque, TOTAL_PREGUNTAS);
    var sinResp=[];
    for(var i=inicio;i<fin;i++) if(!ESTADO.respuestas[PREGUNTAS[i].id]) sinResp.push(PREGUNTAS[i].id);
    if(sinResp.length>0){
      sinResp.forEach(function(id){var f=document.getElementById('fila-'+id);if(f)f.classList.add('sin-marcar');});
      mostrarAlerta('Responda las '+sinResp.length+' pregunta(s) marcadas antes de continuar.','error');
      return;
    }
    ocultarAlerta();
    renderizarBloque(nuevo);
    guardarBloqueEnServidor();
    return;
  }
  ocultarAlerta();
  renderizarBloque(nuevo);
}

/* ================================================================
   GUARDADO POR BLOQUES EN SERVIDOR
================================================================ */
function guardarBloqueEnServidor(callback) {
  var payload = construirPayloadProgreso();

  localStorage.setItem('progreso_'+payload.cip, JSON.stringify(payload));

  fetch(LOCAL_API+'/progreso',{
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)
  }).then(function(r){return r.json();})
    .then(function(){
      mostrarIndicadorGuardado('Bloque '+ESTADO.bloqueActual+' guardado ✓');
      if(callback) callback();
    })
    .catch(function(){
      mostrarIndicadorGuardado('Guardado local ✓');
      if(callback) callback();
    });
}

// Botón "Guardar y salir" — guarda y vuelve al panel de registro (misma página)
function volverAlPanelRegistro() {
  ESTADO.registroCompleto = false;
  var cuest = document.getElementById('card-cuestionario');
  if (cuest) cuest.classList.add('seccion-bloqueada');
  var zona = document.getElementById('zona-preguntas');
  if (zona) zona.innerHTML = '';

  // Ocultar formulario completo — solo panel compacto CIP
  var reg = document.getElementById('card-registro');
  if (reg) reg.style.display = 'none';
  var cont = document.getElementById('card-continuar-cip');
  if (cont) cont.style.display = '';

  var cip = document.getElementById('f-cip');
  var cipCont = document.getElementById('f-cip-continuar');
  if (cip && cipCont && cip.value.trim()) cipCont.value = cip.value.trim();

  var total = Object.keys(ESTADO.respuestas).length;
  if (total > 0) {
    mostrarBannerProgreso({
      cip: (cip && cip.value.trim()) || '',
      nombres: (document.getElementById('f-nombres')||{}).value || '',
      total: total,
      bloque: ESTADO.bloqueActual
    });
  }
  mostrarAlerta('Progreso guardado. Para continuar ingrese su CIP en el panel superior.', 'exito');
  setTimeout(ocultarAlerta, 4500);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function guardarYSalir() {
  if (!ESTADO.registroCompleto) return;
  var btn = document.getElementById('btn-guardar-bloque');
  if (btn) btn.disabled = true;
  guardarBloqueEnServidor(function() {
    mostrarIndicadorGuardado('Progreso guardado. Puede continuar con su CIP.');
    setTimeout(function() {
      volverAlPanelRegistro();
      if (btn) btn.disabled = false;
    }, 500);
  });
}

function continuarConCIP() {
  var inp = document.getElementById('f-cip-continuar');
  var cip = inp ? inp.value.trim() : '';
  if (!cip) { mostrarAlerta('Ingrese su CIP para continuar.','error'); if(inp) inp.focus(); return; }
  if (!PREGUNTAS.length) { mostrarAlerta('Espere a que cargue el cuestionario.','error'); return; }
  ocultarAlerta();
  verificarProgresoGuardado(cip, function(data) {
    if (!data) {
      fetch(LOCAL_API + '/verificar-registro?cip=' + encodeURIComponent(cip))
        .then(function(r) { return r.json(); })
        .then(function(v) {
          if (v.ok && v.registrado && !v.completada) {
            notificarSesionExistente(v.cip || cip, v);
          } else {
            mostrarAlerta('No hay sesión guardada para el CIP ' + cip + '. Complete el Paso 1 si es su primera vez.', 'error');
          }
        })
        .catch(function() {
          mostrarAlerta('No hay sesión guardada para el CIP ' + cip + '. Complete el Paso 1 si es su primera vez.', 'error');
        });
      return;
    }
    document.getElementById('f-cip').value = data.cip || cip;
    if (data.nombres) document.getElementById('f-nombres').value = data.nombres;
    if (data.dni) document.getElementById('f-dni').value = data.dni;
    if (data.fecha_nac) {
      var fn = document.getElementById('f-nacimiento');
      if (fn && /^\d{4}-\d{2}-\d{2}$/.test(data.fecha_nac)) {
        var p = data.fecha_nac.split('-');
        fn.value = p[2] + '/' + p[1] + '/' + p[0];
      }
    }
    if (data.sexo) { var sel = document.getElementById('f-sexo'); if(sel) sel.value = data.sexo; }
    if (data.grado) { var g = document.getElementById('f-grado'); if(g) g.value = data.grado; }
    if (data.cargo) document.getElementById('f-cargo').value = data.cargo;
    if (data.area) restaurarAreaEvaluacion(data.area);
    restaurarArmamentoDesdeData(data);
    if (data.foto) { FOTO_BASE64 = data.foto; actualizarPreviewFoto(data.foto); }
    restaurarUnidadDesdeProgreso(data);
    ocultarPanelRegistro();
    aplicarProgresoRestaurado(data);
  });
}

// Auto-guardar cada respuesta (con pequeña espera para no saturar)
var _saveTimer = null;
function autoGuardarProgreso() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(function() {
    var payload = construirPayloadProgreso();
    if (!payload.cip) return;
    localStorage.setItem('progreso_' + payload.cip, JSON.stringify(payload));
    fetch(LOCAL_API + '/progreso', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(function() {});
    mostrarIndicadorGuardado();
  }, 350);
}

/* ================================================================
   VERIFICAR Y RESTAURAR PROGRESO POR CIP
================================================================ */
function verificarProgresoGuardado(cip, callback) {
  if (!cip) { if(callback) callback(null); return; }

  fetch(LOCAL_API+'/progreso?cip='+encodeURIComponent(cip))
    .then(function(r){return r.json();})
    .then(function(data){
      if(data.ok && data.encontrado) {
        var norm = normalizarDataProgreso(data);
        if (norm) { if(callback) callback(norm); return; }
      }
      var local = localStorage.getItem('progreso_'+cip);
      if (local) {
        try {
          var d = normalizarDataProgreso(JSON.parse(local));
          if (d) { if(callback) callback(d); return; }
        } catch (e) { /* ignorar */ }
      }
      if (callback) callback(null);
    })
    .catch(function(){
      var local=localStorage.getItem('progreso_'+cip);
      if (local) {
        try {
          var d = normalizarDataProgreso(JSON.parse(local));
          if (callback) callback(d);
          return;
        } catch (e) { /* ignorar */ }
      }
      if (callback) callback(null);
    });
}

function mostrarBannerProgreso(data) {
  var banner=document.getElementById('banner-progreso');
  var info=document.getElementById('banner-progreso-info');
  var total=data.total||0, bloque=data.bloque||1;
  var pct=TOTAL_PREGUNTAS>0?Math.round(total/TOTAL_PREGUNTAS*100):0;
  info.textContent='Bloque '+bloque+' de '+TOTAL_BLOQUES+' — '+total+' / '+TOTAL_PREGUNTAS+' preguntas ('+pct+'%)';
  banner.style.display='flex';
  banner._data=data;
}

function aplicarProgresoRestaurado(data) {
  ESTADO.respuestas   = typeof data.respuestas==='string'?JSON.parse(data.respuestas):(data.respuestas||{});
  ESTADO.bloqueActual = parseInt(data.bloque,10)||1;
  ESTADO.registroCompleto = true;
  aplicarTiempoAcumuladoDesdeData(data);
  reiniciarCronometroEvaluacion(data.cip || obtenerCipEvaluacion());
  var banner=document.getElementById('banner-progreso');
  if(banner) banner.style.display='none';
  ocultarPanelRegistro();
  activarCuestionario(true);
  var total=Object.keys(ESTADO.respuestas).length;
  mostrarAlerta('Continúa desde el bloque '+ESTADO.bloqueActual+' — '+total+'/'+TOTAL_PREGUNTAS+' respuestas guardadas.','exito');
  setTimeout(ocultarAlerta,5000);
}

function restaurarProgreso() {
  var data=document.getElementById('banner-progreso')._data;
  if(!data) return;
  if(data.cip)     document.getElementById('f-cip').value    =data.cip;
  if(data.nombres) document.getElementById('f-nombres').value=data.nombres;
  if(data.sexo){ var sel=document.getElementById('f-sexo'); if(sel) sel.value=data.sexo; }
  if(data.grado){ var g=document.getElementById('f-grado'); if(g) g.value=data.grado; }
  if(data.cargo) document.getElementById('f-cargo').value=data.cargo;
  if(data.area) restaurarAreaEvaluacion(data.area);
  restaurarArmamentoDesdeData(data);
  if(data.foto) { FOTO_BASE64 = data.foto; actualizarPreviewFoto(data.foto); }
  restaurarUnidadDesdeProgreso(data);
  ocultarPanelRegistro();
  aplicarProgresoRestaurado(data);
}

function descartarProgreso() {
  document.getElementById('banner-progreso').style.display='none';
  ESTADO.respuestas={};
  ESTADO.bloqueActual=1;
  ESTADO.tiempoAcumulado=0;
  reiniciarCronometroEvaluacion();
  activarCuestionario(true);
}

/* ================================================================
   ENVÍO FINAL
================================================================ */
function validarYEnviar() {
  var err=validarRegistro();
  if(err){
    mostrarAlerta(err + ' Use el botón «Editar datos» o complete el Paso 1.', 'error');
    editarDatosPersonales();
    return;
  }

  var sinRes=PREGUNTAS.filter(function(p){return !ESTADO.respuestas[p.id];});
  if(sinRes.length>0){
    mostrarAlerta('Faltan '+sinRes.length+' preguntas sin responder. Revise todos los bloques.','error');
    return;
  }

  var nombres=document.getElementById('f-nombres').value.trim();
  var dni=document.getElementById('f-dni').value.trim();
  var comis = obtenerComisariaEvaluacion();
  if(!confirm('¿Confirmar envío del cuestionario?\n\n'+nombres+'\nDNI: '+dni+'\nComisaría: '+comis)) return;
  enviarEvaluacion();
}

function enviarEvaluacion() {
  var overlay=document.getElementById('overlay-envio');
  var spinner=document.getElementById('spinner-overlay');
  var checkIcon=document.getElementById('check-ok-icon');
  var textoO=document.getElementById('texto-overlay');
  var subtextoO=document.getElementById('subtexto-overlay');

  overlay.classList.add('visible');

  var respObj={};
  PREGUNTAS.forEach(function(p){ respObj[p.id]=ESTADO.respuestas[p.id]||''; });
  var payload = construirPayloadGuardar(true);
  payload.respuestas = respObj;

  fetch(LOCAL_API+'/guardar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
    .then(function(r){return r.json();})
    .then(function(data){
      if(!data.ok) {
        var msgDup = mensajeErrorDuplicadoNombre(data);
        throw new Error(msgDup || data.error || 'Error del servidor');
      }
      spinner.style.display='none';
      checkIcon.style.display='block';
      textoO.textContent='¡Cuestionario enviado correctamente!';
      subtextoO.textContent=payload.nombres+' | CIP: '+payload.cip;
      // Limpiar progreso guardado
      localStorage.removeItem('progreso_'+payload.cip);
      limpiarCronometroEvaluacion(payload.cip);
      setTimeout(function(){overlay.classList.remove('visible'); limpiarFormulario();},5000);
    })
    .catch(function(err){
      spinner.style.display='none';
      textoO.textContent='Error: '+(err.message||'Verifique conexión.');
      textoO.style.color='#ffaaaa';
      setTimeout(function(){overlay.classList.remove('visible');spinner.style.display='block';textoO.textContent='Enviando...';textoO.style.color='';},5000);
    });
}

function limpiarFormulario() {
  ['f-unidad','f-grado','f-nombres','f-cip','f-dni','f-nacimiento','f-sexo','f-cargo','f-area'].forEach(function(id){var el=document.getElementById(id);if(el) el.value='';});
  var areaOtro=document.getElementById('f-area-otro'); if(areaOtro) areaOtro.value='';
  toggleAreaOtroEval();
  var chkP=document.getElementById('f-arm-particular'); if(chkP) chkP.checked=false;
  var chkE=document.getElementById('f-arm-estado'); if(chkE) chkE.checked=false;
  FOTO_BASE64 = '';
  quitarFoto();
  ESTADO.respuestas={}; ESTADO.bloqueActual=1; ESTADO.tiempoAcumulado=0; ALERTA_FINAL_MOSTRADA=false;
  ocultarCuestionario(); actualizarControles(); actualizarInfoBloque();
  document.getElementById('zona-preguntas').innerHTML='';
  window.scrollTo({top:0,behavior:'smooth'});
}

/* ================================================================
   UI HELPERS
================================================================ */
function mostrarAlerta(msg, tipo) {
  var el=document.getElementById('alerta-global');
  document.getElementById('texto-alerta-global').textContent=msg;
  el.className='alerta alerta-'+(tipo==='error'?'error':tipo==='info'?'info':'exito')+' visible';
}
function ocultarAlerta() {
  var el=document.getElementById('alerta-global');
  if(el) el.classList.remove('visible');
}

function mostrarIndicadorGuardado(msg) {
  var ind=document.getElementById('indicador-guardado');
  if(!ind){
    ind=document.createElement('div'); ind.id='indicador-guardado';
    ind.style.cssText='position:fixed;bottom:18px;left:50%;transform:translateX(-50%);background:rgba(0,77,61,.92);color:#fff;padding:7px 18px;border-radius:20px;font-size:12px;font-weight:600;z-index:9999;pointer-events:none;transition:opacity .4s;';
    document.body.appendChild(ind);
  }
  ind.innerHTML='<i class="fas fa-cloud-upload-alt"></i> '+(msg||'Guardando...');
  ind.style.opacity='1';
  clearTimeout(ind._t);
  ind._t=setTimeout(function(){ind.style.opacity='0';},2500);
}

function abrirPanelAdmin(e) {
  if(e) e.preventDefault();
  window.open('panel-admin.html','regpol_panel','noopener,noreferrer');
  return false;
}

