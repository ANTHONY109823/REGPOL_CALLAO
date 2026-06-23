/* portal.js — Datos y renderizado compartido del portal REGPOL Callao */
var REGPOL_WEB_APP = 'https://script.google.com/macros/s/AKfycbzHHCUjXQVNtgVTERGx3RuiGPfSHuhCgTVddHL8ByDJUE-lLQessVsdFCFabayhCC5u/exec';
var REGPOL_SITE_KEY = 'regpolSiteData_v1';

var REGPOL_NAV = [
  { id: 'inicio',    href: 'index.html',            label: 'INICIO',             icon: 'fa-home' },
  { id: 'resena',    href: 'resena-historica.html',  label: 'RESEÑA HISTÓRICA' },
  { id: 'labor',     href: 'nuestra-labor.html',     label: 'NUESTRA LABOR' },
  { id: 'unidades',  href: 'unidades.html',          label: 'NUESTRAS UNIDADES', icon: 'fa-map-marker-alt' },
  { id: 'convenios', href: 'convenios.html',         label: 'CONVENIOS' },
  { id: 'cursos',    href: 'cursos.html',            label: 'CURSOS REGIONALES' },
  { id: 'novedades', href: 'novedades.html',         label: 'NOVEDADES' },
  { id: 'bienestar', href: 'evaluacion.html',        label: 'BIENESTAR',          icon: 'fa-heart' }
];

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cloneSiteData(data) {
  return JSON.parse(JSON.stringify(data));
}

function getSiteDataFromStorage() {
  try {
    var raw = localStorage.getItem(REGPOL_SITE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function saveSiteDataToStorage(data) {
  localStorage.setItem(REGPOL_SITE_KEY, JSON.stringify(data));
}

function fetchSiteDataFromServer() {
  var url = (typeof WEB_APP_URL !== 'undefined' && WEB_APP_URL) ? WEB_APP_URL : REGPOL_WEB_APP;
  return fetch(url + '?action=get_site')
    .then(function(r) { return r.json(); })
    .then(function(res) { return (res && res.ok && res.data) ? res.data : null; })
    .catch(function() { return null; });
}

function fetchSiteDataDefault() {
  return fetch('site-data.json?v=' + Date.now())
    .then(function(r) { return r.json(); })
    .catch(function() { return null; });
}

function cargarSiteData() {
  var local = getSiteDataFromStorage();
  return fetchSiteDataFromServer()
    .then(function(server) {
      if (server) {
        saveSiteDataToStorage(server);
        return server;
      }
      if (local) return local;
      return fetchSiteDataDefault();
    })
    .then(function(data) {
      if (data) return data;
      if (local) return local;
      return fetchSiteDataDefault();
    });
}

function publicarSiteData(data) {
  saveSiteDataToStorage(data);
  var url = (typeof WEB_APP_URL !== 'undefined' && WEB_APP_URL) ? WEB_APP_URL : REGPOL_WEB_APP;
  return fetch(url, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'save_site', data: data })
  }).catch(function() {});
}

function marcarNavActivo(activeId) {
  document.querySelectorAll('.nav-main a[data-nav]').forEach(function(a) {
    a.classList.toggle('activo', a.getAttribute('data-nav') === activeId);
  });
}

function initPortalNav(activeId) {
  var ul = document.querySelector('.nav-main ul');
  if (!ul) return;
  ul.innerHTML = REGPOL_NAV.map(function(item) {
    var cls = item.id === activeId ? ' class="activo"' : '';
    var icon = item.icon ? '<i class="fas ' + item.icon + '"></i> ' : '';
    return '<li><a href="' + item.href + '" data-nav="' + item.id + '"' + cls + '>' + icon + item.label + '</a></li>';
  }).join('');
}

function renderTarjetas(items, containerId) {
  var el = document.getElementById(containerId);
  if (!el || !items || !items.length) return;
  el.innerHTML = items.map(function(item) {
    var url = item.url || '#';
    return '<a href="' + escHtml(url) + '">' +
      '<div class="card-modern">' +
        '<div class="icon-wrapper" style="background:' + escHtml(item.color || '#004d3d') + ';">' +
          '<i class="fas ' + escHtml(item.icono || 'fa-file') + '"></i>' +
        '</div>' +
        '<h4>' + escHtml(item.titulo) + '</h4>' +
        '<p>' + escHtml(item.descripcion) + '</p>' +
        '<span style="color:' + escHtml(item.estadoColor || 'green') + ';font-weight:bold;font-size:12px;">' +
          escHtml(item.estado) +
        '</span>' +
      '</div></a>';
  }).join('');
}

function renderPdfList(items, containerId) {
  var el = document.getElementById(containerId);
  if (!el) return;
  if (!items || !items.length) {
    el.innerHTML = '<p class="texto-vacio">No hay documentos publicados.</p>';
    return;
  }
  el.innerHTML = items.map(function(item) {
    return '<div class="grid-pdf-modern"><div class="pdf-item">' +
      '<i class="fas fa-file-pdf" style="font-size:30px;color:#e74c3c;"></i>' +
      '<div><h5>' + escHtml(item.titulo) + '</h5>' +
      '<a href="' + escHtml(item.url || '#') + '" class="btn-download" target="_blank" rel="noopener">DESCARGAR PDF</a>' +
      '</div></div></div>';
  }).join('');
}

function renderResenaHistorica(data, containerId) {
  var el = document.getElementById(containerId);
  var sec = data.resenaHistorica;
  if (!el || !sec) return;
  var html = '<article class="institucional-page institucional-resena">';
  html += '<div class="institucional-cabecera">';
  html += '<div class="institucional-icono"><i class="fas fa-landmark"></i></div>';
  html += '<div class="institucional-cabecera-texto">';
  html += '<h2>' + escHtml(sec.titulo || 'Reseña Histórica') + '</h2>';
  html += '<p class="institucional-lead">' + escHtml(sec.intro) + '</p>';
  html += '</div></div>';
  html += '<div class="institucional-cuerpo">';
  (sec.parrafos || []).forEach(function(p, i) {
    html += '<div class="institucional-bloque">' +
      '<span class="institucional-num" aria-hidden="true">' + String(i + 1).padStart(2, '0') + '</span>' +
      '<p>' + escHtml(p) + '</p></div>';
  });
  html += '</div></article>';
  el.innerHTML = html;
}

function renderNuestraLabor(data, containerId) {
  var el = document.getElementById(containerId);
  var sec = data.nuestraLabor;
  if (!el || !sec) return;
  var html = '<article class="institucional-page institucional-labor">';
  html += '<div class="institucional-cabecera">';
  html += '<div class="institucional-icono institucional-icono-naranja"><i class="fas fa-hands-helping"></i></div>';
  html += '<div class="institucional-cabecera-texto">';
  html += '<h2>' + escHtml(sec.titulo || 'Nuestra Labor') + '</h2>';
  html += '<p class="institucional-lead">' + escHtml(sec.intro) + '</p>';
  html += '</div></div>';
  html += '<div class="pilares-grid-v2">';
  (sec.pilares || []).forEach(function(p) {
    html += '<div class="card-pilar-v2">' +
      '<div class="card-pilar-v2-icono"><i class="fas ' + escHtml(p.icono || 'fa-star') + '"></i></div>' +
      '<h4>' + escHtml(p.titulo) + '</h4>' +
      '<p>' + escHtml(p.texto) + '</p></div>';
  });
  html += '</div></article>';
  el.innerHTML = html;
}

function renderNovedades(data, containerId, limite) {
  var el = document.getElementById(containerId);
  if (!el) return;
  var items = (data.novedades || []).slice();
  if (limite) items = items.slice(0, limite);
  if (!items.length) {
    el.innerHTML = '<p class="texto-vacio">Sin novedades publicadas.</p>';
    return;
  }
  el.innerHTML = items.map(function(n) {
    return '<article class="noticia-card">' +
      '<div class="noticia-meta"><span class="noticia-cat">' + escHtml(n.categoria) + '</span>' +
      '<span class="noticia-fecha">' + escHtml(n.fecha) + '</span></div>' +
      '<h3>' + escHtml(n.titulo) + '</h3>' +
      '<p>' + escHtml(n.resumen) + '</p></article>';
  }).join('');
}

function actualizarFechaPortal(data) {
  var el = document.getElementById('fecha-actualizacion-portal');
  if (el && data.actualizacion) el.textContent = 'ÚLTIMA ACTUALIZACIÓN: ' + data.actualizacion;
}

function initPortalPageHero(activeId) {
  if (!activeId || activeId === 'inicio') return;
  if (document.querySelector('.portal-page-hero') || document.querySelector('.presentation-slider')) return;
  var nav = document.querySelector('.nav-main');
  if (!nav) return;
  var item = REGPOL_NAV.filter(function(i) { return i.id === activeId; })[0];
  if (!item) return;
  var hero = document.createElement('section');
  hero.className = 'portal-page-hero';
  hero.setAttribute('aria-label', 'Titulo de seccion');
  hero.innerHTML = '<div class="container"><h2>' + escHtml(item.label) + '</h2></div>';
  nav.insertAdjacentElement('afterend', hero);
}

function initPortalPagina(config) {
  config = config || {};
  initPortalNav(config.activeNav || '');
  if (config.showPageHero !== false) initPortalPageHero(config.activeNav || '');
  return cargarSiteData().then(function(data) {
    if (!data) return;
    if (config.renderResena) renderResenaHistorica(data, config.renderResena);
    if (config.renderLabor) renderNuestraLabor(data, config.renderLabor);
    if (config.renderNovedades) renderNovedades(data, config.renderNovedades, config.limiteNovedades);
    if (config.renderConvenios) renderTarjetas(data.convenios, config.renderConvenios);
    if (config.renderCursos) renderTarjetas(data.cursos, config.renderCursos);
    if (config.renderConveniosPdf) renderPdfList(data.conveniosPdf, config.renderConveniosPdf);
    if (config.renderCursosPdf) renderPdfList(data.cursosPdf, config.renderCursosPdf);
    if (config.actualizarFecha) actualizarFechaPortal(data);
    return data;
  });
}
