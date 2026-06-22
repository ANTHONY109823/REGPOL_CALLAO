/* panel-cms.js — Administración de contenido del portal */
var cmsDataActual = null;
var cmsModalGuardarFn = null;

var CMS_ICONOS = [
  { v: 'fa-shield-alt', l: 'Escudo' },
  { v: 'fa-users', l: 'Personas' },
  { v: 'fa-search', l: 'Lupa' },
  { v: 'fa-laptop', l: 'Computadora' },
  { v: 'fa-bus', l: 'Bus' },
  { v: 'fa-car', l: 'Auto' },
  { v: 'fa-warehouse', l: 'Almacén' },
  { v: 'fa-graduation-cap', l: 'Graduación' },
  { v: 'fa-file-contract', l: 'Contrato' },
  { v: 'fa-heart', l: 'Corazón' }
];

function initCMS() {
  cargarSiteData().then(function(data) {
    cmsDataActual = data || {};
    poblarFormulariosCMS();
    renderListasCMS();
  });
}

function cambiarTabCMS(tab) {
  document.querySelectorAll('.cms-tab').forEach(function(btn) {
    btn.classList.toggle('activo', btn.getAttribute('data-cms-tab') === tab);
  });
  document.querySelectorAll('.cms-panel').forEach(function(panel) {
    panel.classList.toggle('activo', panel.id === 'cms-panel-' + tab);
  });
}

function poblarFormulariosCMS() {
  var d = cmsDataActual;
  setVal('cms-actualizacion', d.actualizacion);
  setVal('cms-resena-intro', (d.resenaHistorica || {}).intro || '');
  setVal('cms-labor-intro', (d.nuestraLabor || {}).intro || '');
  renderParrafosResenaCMS();
  renderPilaresCMS();
}

function setVal(id, val) {
  var el = document.getElementById(id);
  if (el) el.value = val || '';
}

function getVal(id) {
  var el = document.getElementById(id);
  return el ? el.value.trim() : '';
}

function safeTextareaContent(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

function renderParrafosResenaCMS() {
  var el = document.getElementById('cms-lista-parrafos');
  if (!el) return;
  var parrafos = ((cmsDataActual.resenaHistorica || {}).parrafos) || [];
  if (!parrafos.length) {
    el.innerHTML = '<p class="cms-vacio">No hay párrafos. Pulse "Agregar párrafo".</p>';
    return;
  }
  el.innerHTML = parrafos.map(function(texto, idx) {
    return '<div class="cms-parrafo-item">' +
      '<div class="cms-parrafo-num">' + String(idx + 1).padStart(2, '0') + '</div>' +
      '<textarea class="cms-textarea cms-parrafo-input" data-idx="' + idx + '" rows="3" placeholder="Escriba el párrafo...">' + safeTextareaContent(texto) + '</textarea>' +
      '<button type="button" class="btn-mini btn-mini-danger" title="Eliminar" onclick="eliminarParrafoResena(' + idx + ')"><i class="fas fa-trash"></i></button>' +
      '</div>';
  }).join('');
}

function renderPilaresCMS() {
  var el = document.getElementById('cms-lista-pilares');
  if (!el) return;
  var pilares = ((cmsDataActual.nuestraLabor || {}).pilares) || [];
  if (!pilares.length) {
    el.innerHTML = '<p class="cms-vacio">No hay pilares. Pulse "Agregar pilar".</p>';
    return;
  }
  el.innerHTML = pilares.map(function(p, idx) {
    return '<div class="cms-pilar-item">' +
      '<div class="cms-pilar-preview"><i class="fas ' + escHtml(p.icono || 'fa-star') + '"></i></div>' +
      '<div class="cms-pilar-info"><strong>' + escHtml(p.titulo) + '</strong><span>' + escHtml(p.texto) + '</span></div>' +
      '<div class="cms-item-acciones">' +
        '<button type="button" class="btn-mini" onclick="editarPilarCMS(' + idx + ')"><i class="fas fa-edit"></i></button>' +
        '<button type="button" class="btn-mini btn-mini-danger" onclick="eliminarPilarCMS(' + idx + ')"><i class="fas fa-trash"></i></button>' +
      '</div></div>';
  }).join('');
}

function syncParrafosFromDOM() {
  cmsDataActual.resenaHistorica = cmsDataActual.resenaHistorica || { parrafos: [] };
  var inputs = document.querySelectorAll('.cms-parrafo-input');
  var list = [];
  inputs.forEach(function(el) { list.push(el.value); });
  cmsDataActual.resenaHistorica.parrafos = list;
}

function agregarParrafoResena() {
  syncParrafosFromDOM();
  cmsDataActual.resenaHistorica.parrafos.push('');
  renderParrafosResenaCMS();
}

function eliminarParrafoResena(idx) {
  if (!confirm('¿Eliminar este párrafo?')) return;
  syncParrafosFromDOM();
  cmsDataActual.resenaHistorica.parrafos.splice(idx, 1);
  renderParrafosResenaCMS();
}

function agregarPilarCMS() {
  abrirModalPilar(null);
}

function editarPilarCMS(idx) {
  abrirModalPilar(idx);
}

function eliminarPilarCMS(idx) {
  if (!confirm('¿Eliminar este pilar?')) return;
  cmsDataActual.nuestraLabor.pilares.splice(idx, 1);
  renderPilaresCMS();
}

function recolectarParrafosDesdeDOM() {
  var inputs = document.querySelectorAll('.cms-parrafo-input');
  var list = [];
  inputs.forEach(function(el) {
    var t = el.value.trim();
    if (t) list.push(t);
  });
  return list;
}

function renderListasCMS() {
  renderListaEditable('cms-lista-convenios', cmsDataActual.convenios || [], 'convenios');
  renderListaEditable('cms-lista-cursos', cmsDataActual.cursos || [], 'cursos');
  renderListaNovedades('cms-lista-novedades', cmsDataActual.novedades || []);
}

function renderListaEditable(containerId, items, tipo) {
  var el = document.getElementById(containerId);
  if (!el) return;
  if (!items.length) {
    el.innerHTML = '<p class="cms-vacio">No hay registros.</p>';
    return;
  }
  el.innerHTML = items.map(function(item, idx) {
    return '<div class="cms-item">' +
      '<div class="cms-item-icono"><i class="fas ' + escHtml(item.icono || 'fa-file') + '"></i></div>' +
      '<div class="cms-item-info"><strong>' + escHtml(item.titulo) + '</strong>' +
      '<span>' + escHtml(item.descripcion) + ' — <em>' + escHtml(item.estado) + '</em></span></div>' +
      '<div class="cms-item-acciones">' +
        '<button type="button" class="btn-mini" onclick="editarItemCMS(\'' + tipo + '\',' + idx + ')"><i class="fas fa-edit"></i></button>' +
        '<button type="button" class="btn-mini btn-mini-danger" onclick="eliminarItemCMS(\'' + tipo + '\',' + idx + ')"><i class="fas fa-trash"></i></button>' +
      '</div></div>';
  }).join('');
}

function renderListaNovedades(containerId, items) {
  var el = document.getElementById(containerId);
  if (!el) return;
  if (!items.length) {
    el.innerHTML = '<p class="cms-vacio">No hay novedades.</p>';
    return;
  }
  el.innerHTML = items.map(function(item, idx) {
    return '<div class="cms-item">' +
      '<div class="cms-item-icono cms-item-icono-naranja"><i class="fas fa-newspaper"></i></div>' +
      '<div class="cms-item-info"><strong>' + escHtml(item.titulo) + '</strong>' +
      '<span>' + escHtml(item.fecha) + ' — ' + escHtml(item.categoria) + '</span></div>' +
      '<div class="cms-item-acciones">' +
        '<button type="button" class="btn-mini" onclick="editarNovedadCMS(' + idx + ')"><i class="fas fa-edit"></i></button>' +
        '<button type="button" class="btn-mini btn-mini-danger" onclick="eliminarNovedadCMS(' + idx + ')"><i class="fas fa-trash"></i></button>' +
      '</div></div>';
  }).join('');
}

function recolectarDatosCMS() {
  var data = cloneSiteData(cmsDataActual || {});
  data.actualizacion = getVal('cms-actualizacion') || data.actualizacion;
  data.resenaHistorica = data.resenaHistorica || {};
  data.resenaHistorica.titulo = 'Reseña Histórica';
  data.resenaHistorica.intro = getVal('cms-resena-intro');
  data.resenaHistorica.parrafos = recolectarParrafosDesdeDOM();
  data.nuestraLabor = data.nuestraLabor || {};
  data.nuestraLabor.titulo = 'Nuestra Labor';
  data.nuestraLabor.intro = getVal('cms-labor-intro');
  if (!data.nuestraLabor.pilares) data.nuestraLabor.pilares = (cmsDataActual.nuestraLabor || {}).pilares || [];
  return data;
}

function guardarSitioWeb() {
  cmsDataActual = recolectarDatosCMS();
  saveSiteDataToStorage(cmsDataActual);
  publicarSiteData(cmsDataActual);
  mostrarAlertaCMS('Contenido publicado. Los visitantes verán los cambios al recargar el portal.', 'ok');
}

function mostrarAlertaCMS(texto, tipo) {
  var el = document.getElementById('alerta-cms');
  if (!el) return;
  el.textContent = texto;
  el.className = 'alerta alerta-' + (tipo === 'ok' ? 'exito' : 'error') + ' visible';
  setTimeout(function() { el.classList.remove('visible'); }, 4000);
}

/* --- MODAL CMS --- */
function abrirCmsModal(titulo, htmlBody, onGuardar) {
  document.getElementById('cms-modal-titulo').innerHTML = '<i class="fas fa-edit"></i> ' + escHtml(titulo);
  document.getElementById('cms-modal-body').innerHTML = htmlBody;
  cmsModalGuardarFn = onGuardar;
  var modal = document.getElementById('cms-modal');
  modal.classList.add('visible');
  modal.setAttribute('aria-hidden', 'false');
  var btn = document.getElementById('cms-modal-guardar');
  btn.onclick = function() {
    if (cmsModalGuardarFn && cmsModalGuardarFn() !== false) cerrarCmsModal();
  };
  var first = document.querySelector('#cms-modal-body input, #cms-modal-body textarea, #cms-modal-body select');
  if (first) setTimeout(function() { first.focus(); }, 100);
}

function cerrarCmsModal() {
  var modal = document.getElementById('cms-modal');
  modal.classList.remove('visible');
  modal.setAttribute('aria-hidden', 'true');
  cmsModalGuardarFn = null;
}

function cmsCampo(label, id, val, tipo, opts) {
  tipo = tipo || 'text';
  var html = '<div class="cms-modal-campo"><label class="cms-label" for="' + id + '">' + label + '</label>';
  if (tipo === 'textarea') {
    html += '<textarea id="' + id + '" class="cms-textarea" rows="4">' + safeTextareaContent(val) + '</textarea>';
  } else if (tipo === 'select') {
    html += '<select id="' + id + '" class="cms-select">';
    (opts || []).forEach(function(o) {
      var sel = (o.v === val || o === val) ? ' selected' : '';
      var valOpt = o.v !== undefined ? o.v : o;
      var labOpt = o.l !== undefined ? o.l : o;
      html += '<option value="' + escHtml(valOpt) + '"' + sel + '>' + escHtml(labOpt) + '</option>';
    });
    html += '</select>';
  } else {
    html += '<input type="text" id="' + id + '" class="cms-input" value="' + escHtml(val || '') + '" />';
  }
  return html + '</div>';
}

function leerModal(id) {
  var el = document.getElementById(id);
  return el ? el.value.trim() : '';
}

function abrirModalTarjeta(tipo, idx) {
  var esNuevo = idx === null;
  var item = esNuevo ? { titulo: '', descripcion: '', estado: 'DISPONIBLE', url: '#', icono: 'fa-shield-alt', color: '#004d3d', estadoColor: 'green' } : cmsDataActual[tipo][idx];
  var tituloModal = (esNuevo ? 'Nuevo ' : 'Editar ') + (tipo === 'convenios' ? 'convenio' : 'curso');
  var body = cmsCampo('Título', 'm-titulo', item.titulo) +
    cmsCampo('Descripción', 'm-desc', item.descripcion, 'textarea') +
    cmsCampo('Estado', 'm-estado', item.estado, 'select', ['DISPONIBLE', 'EN PROCESO', 'CERRADO']) +
    cmsCampo('Enlace (URL o archivo .html)', 'm-url', item.url) +
    cmsCampo('Icono', 'm-icono', item.icono, 'select', CMS_ICONOS);
  abrirCmsModal(tituloModal, body, function() {
    var titulo = leerModal('m-titulo');
    if (!titulo) { alert('El título es obligatorio.'); return false; }
    var nuevo = {
      id: item.id || (tipo.slice(0, 4) + '-' + Date.now()),
      titulo: titulo.toUpperCase(),
      descripcion: leerModal('m-desc'),
      estado: leerModal('m-estado') || 'DISPONIBLE',
      estadoColor: leerModal('m-estado') === 'EN PROCESO' ? '#f4f806' : 'green',
      icono: leerModal('m-icono') || 'fa-shield-alt',
      color: item.color || '#004d3d',
      url: leerModal('m-url') || '#'
    };
    cmsDataActual[tipo] = cmsDataActual[tipo] || [];
    if (esNuevo) cmsDataActual[tipo].push(nuevo);
    else cmsDataActual[tipo][idx] = nuevo;
    renderListasCMS();
    mostrarAlertaCMS('Guardado en borrador. Pulse "Publicar cambios" para subir al portal.', 'ok');
    return true;
  });
}

function abrirModalNovedad(idx) {
  var esNuevo = idx === null;
  var item = esNuevo ? {
    titulo: '', resumen: '', categoria: 'Institucional',
    fecha: new Date().toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
  } : cmsDataActual.novedades[idx];
  var body = cmsCampo('Título', 'm-titulo', item.titulo) +
    cmsCampo('Resumen', 'm-resumen', item.resumen, 'textarea') +
    cmsCampo('Categoría', 'm-cat', item.categoria, 'select', ['Operativo', 'Tránsito', 'Comunitario', 'Institucional', 'Prevención']) +
    cmsCampo('Fecha', 'm-fecha', item.fecha);
  abrirCmsModal(esNuevo ? 'Nueva novedad' : 'Editar novedad', body, function() {
    var titulo = leerModal('m-titulo');
    if (!titulo) { alert('El título es obligatorio.'); return false; }
    var nuevo = {
      id: item.id || ('nov-' + Date.now()),
      titulo: titulo,
      resumen: leerModal('m-resumen'),
      categoria: leerModal('m-cat') || 'Institucional',
      fecha: leerModal('m-fecha')
    };
    cmsDataActual.novedades = cmsDataActual.novedades || [];
    if (esNuevo) cmsDataActual.novedades.unshift(nuevo);
    else cmsDataActual.novedades[idx] = nuevo;
    renderListasCMS();
    mostrarAlertaCMS('Guardado en borrador. Pulse "Publicar cambios" para subir al portal.', 'ok');
    return true;
  });
}

function abrirModalPilar(idx) {
  var esNuevo = idx === null;
  var item = esNuevo ? { titulo: '', texto: '', icono: 'fa-shield-alt' } : cmsDataActual.nuestraLabor.pilares[idx];
  var body = cmsCampo('Título del pilar', 'm-titulo', item.titulo) +
    cmsCampo('Descripción', 'm-texto', item.texto, 'textarea') +
    cmsCampo('Icono', 'm-icono', item.icono, 'select', CMS_ICONOS);
  abrirCmsModal(esNuevo ? 'Nuevo pilar' : 'Editar pilar', body, function() {
    var titulo = leerModal('m-titulo');
    if (!titulo) { alert('El título es obligatorio.'); return false; }
    var nuevo = { titulo: titulo, texto: leerModal('m-texto'), icono: leerModal('m-icono') || 'fa-shield-alt' };
    cmsDataActual.nuestraLabor = cmsDataActual.nuestraLabor || { pilares: [] };
    cmsDataActual.nuestraLabor.pilares = cmsDataActual.nuestraLabor.pilares || [];
    if (esNuevo) cmsDataActual.nuestraLabor.pilares.push(nuevo);
    else cmsDataActual.nuestraLabor.pilares[idx] = nuevo;
    renderPilaresCMS();
    mostrarAlertaCMS('Pilar guardado. Pulse "Publicar cambios" para aplicar en el portal.', 'ok');
    return true;
  });
}

function agregarConvenioCMS() { abrirModalTarjeta('convenios', null); }
function agregarCursoCMS() { abrirModalTarjeta('cursos', null); }
function agregarNovedadCMS() { abrirModalNovedad(null); }

function eliminarItemCMS(tipo, idx) {
  if (!confirm('¿Eliminar este registro?')) return;
  cmsDataActual[tipo].splice(idx, 1);
  renderListasCMS();
}

function eliminarNovedadCMS(idx) {
  if (!confirm('¿Eliminar esta novedad?')) return;
  cmsDataActual.novedades.splice(idx, 1);
  renderListasCMS();
}

function editarItemCMS(tipo, idx) { abrirModalTarjeta(tipo, idx); }
function editarNovedadCMS(idx) { abrirModalNovedad(idx); }

function exportarSiteJSON() {
  var data = recolectarDatosCMS();
  var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'site-data-regpol-callao.json';
  a.click();
}

function importarSiteJSON(input) {
  var file = input.files && input.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      cmsDataActual = JSON.parse(e.target.result);
      poblarFormulariosCMS();
      renderListasCMS();
      mostrarAlertaCMS('JSON importado. Revise y pulse Publicar.', 'ok');
    } catch (err) {
      mostrarAlertaCMS('Archivo JSON inválido.', 'error');
    }
  };
  reader.readAsText(file);
  input.value = '';
}

function restaurarSiteDefault() {
  if (!confirm('¿Restaurar contenido predeterminado del portal?')) return;
  fetch('site-data.json?v=' + Date.now())
    .then(function(r) { return r.json(); })
    .then(function(data) {
      cmsDataActual = data;
      poblarFormulariosCMS();
      renderListasCMS();
      mostrarAlertaCMS('Contenido base cargado. Pulse Publicar para aplicar.', 'ok');
    });
}

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') cerrarCmsModal();
});
