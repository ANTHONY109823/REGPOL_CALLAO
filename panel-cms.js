/* panel-cms.js — Administración de contenido del portal */
var cmsDataActual = null;

function initCMS() {
  cargarSiteData().then(function(data) {
    cmsDataActual = data || {};
    poblarFormulariosCMS();
    renderListasCMS();
  });
}

function poblarFormulariosCMS() {
  var d = cmsDataActual;
  setVal('cms-actualizacion', d.actualizacion);
  setVal('cms-resena-intro', (d.resenaHistorica || {}).intro || '');
  setVal('cms-resena-parrafos', ((d.resenaHistorica || {}).parrafos || []).join('\n\n'));
  setVal('cms-labor-intro', (d.nuestraLabor || {}).intro || '');
}

function setVal(id, val) {
  var el = document.getElementById(id);
  if (el) el.value = val || '';
}

function getVal(id) {
  var el = document.getElementById(id);
  return el ? el.value.trim() : '';
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
      '<div class="cms-item-info"><strong>' + escHtml(item.titulo) + '</strong>' +
      '<span>' + escHtml(item.descripcion) + ' — ' + escHtml(item.estado) + '</span></div>' +
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
  data.resenaHistorica.parrafos = getVal('cms-resena-parrafos').split(/\n\n+/).filter(Boolean);
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

function agregarConvenioCMS() {
  var titulo = prompt('Título del convenio:');
  if (!titulo) return;
  var desc = prompt('Descripción breve:') || '';
  var url = prompt('Enlace (ej: celador.html o #):') || '#';
  cmsDataActual.convenios = cmsDataActual.convenios || [];
  cmsDataActual.convenios.push({
    id: 'conv-' + Date.now(),
    titulo: titulo.toUpperCase(),
    descripcion: desc,
    estado: 'DISPONIBLE',
    estadoColor: 'green',
    icono: 'fa-shield-alt',
    color: '#004d3d',
    url: url
  });
  renderListasCMS();
  mostrarAlertaCMS('Convenio agregado. Pulse "Publicar cambios del portal" para guardar.', 'ok');
}

function agregarCursoCMS() {
  var titulo = prompt('Título del curso:');
  if (!titulo) return;
  var desc = prompt('Descripción breve:') || '';
  var url = prompt('Enlace (ej: curso_siat.html o #):') || '#';
  cmsDataActual.cursos = cmsDataActual.cursos || [];
  cmsDataActual.cursos.push({
    id: 'curso-' + Date.now(),
    titulo: titulo.toUpperCase(),
    descripcion: desc,
    estado: 'DISPONIBLE',
    estadoColor: 'green',
    icono: 'fa-graduation-cap',
    color: '#004d3d',
    url: url
  });
  renderListasCMS();
  mostrarAlertaCMS('Curso agregado. Pulse "Publicar cambios del portal" para guardar.', 'ok');
}

function agregarNovedadCMS() {
  var titulo = prompt('Título de la novedad:');
  if (!titulo) return;
  var resumen = prompt('Resumen:') || '';
  var cat = prompt('Categoría (Operativo, Tránsito, etc.):') || 'Institucional';
  cmsDataActual.novedades = cmsDataActual.novedades || [];
  cmsDataActual.novedades.unshift({
    id: 'nov-' + Date.now(),
    fecha: new Date().toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }),
    categoria: cat,
    titulo: titulo,
    resumen: resumen
  });
  renderListasCMS();
  mostrarAlertaCMS('Novedad agregada. Pulse "Publicar cambios del portal" para guardar.', 'ok');
}

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

function editarItemCMS(tipo, idx) {
  var item = cmsDataActual[tipo][idx];
  if (!item) return;
  item.titulo = (prompt('Título:', item.titulo) || item.titulo).toUpperCase();
  item.descripcion = prompt('Descripción:', item.descripcion) || item.descripcion;
  item.estado = prompt('Estado (DISPONIBLE / EN PROCESO):', item.estado) || item.estado;
  item.url = prompt('Enlace:', item.url) || item.url;
  renderListasCMS();
}

function editarNovedadCMS(idx) {
  var item = cmsDataActual.novedades[idx];
  if (!item) return;
  item.titulo = prompt('Título:', item.titulo) || item.titulo;
  item.resumen = prompt('Resumen:', item.resumen) || item.resumen;
  item.categoria = prompt('Categoría:', item.categoria) || item.categoria;
  item.fecha = prompt('Fecha:', item.fecha) || item.fecha;
  renderListasCMS();
}

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
