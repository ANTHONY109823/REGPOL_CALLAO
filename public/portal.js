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

function apiBasePortal() {
  if (window.REGPOL_API_BASE != null) return window.REGPOL_API_BASE;
  var h = location.hostname;
  if (h === 'localhost' || h === '127.0.0.1') return 'http://localhost:3000';
  return '';
}

function htmlTarjetaPortalItem(item) {
  var colorEstado = item.estado === 'DISPONIBLE' ? 'green'
    : item.estado === 'CERRADO' ? '#c0392b' : '#856404';
  var inscBadge = item.inscripciones_abiertas
    ? '<span style="display:inline-block;background:#d4edda;color:#1a7a3a;font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;margin-top:4px;">✓ Inscripciones abiertas</span>'
    : '';
  var tipo = item.tipo || 'convenio';
  var icono = item.icono || (tipo === 'curso' ? 'fa-graduation-cap' : 'fa-handshake');
  return '<a href="detalle.html?id=' + item.id + '&tipo=' + tipo + '">' +
    '<div class="card-modern">' +
      '<div class="icon-wrapper" style="background:' + escHtml(item.color || '#004d3d') + ';">' +
        '<i class="fas ' + escHtml(icono) + '"></i>' +
      '</div>' +
      '<h4>' + escHtml(item.titulo) + '</h4>' +
      '<p>' + escHtml(item.descripcion || '') + '</p>' +
      (item.vacantes ? '<p style="font-size:12px;color:#666;"><i class="fas fa-users" style="margin-right:4px;"></i>' + escHtml(String(item.vacantes)) + ' vacantes</p>' : '') +
      '<span style="color:' + colorEstado + ';font-weight:bold;font-size:12px;">' + escHtml(item.estado) + '</span>' +
      inscBadge +
    '</div></a>';
}

function appendPortalItems(tipo, containerId) {
  var el = document.getElementById(containerId);
  if (!el) return Promise.resolve();
  var base = apiBasePortal();
  if (base === null || base === undefined) base = '';
  var url = base + '/portal/items?tipo=' + encodeURIComponent(tipo);
  return fetch(url)
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (!d.ok || !d.items || !d.items.length) {
        if (!el.innerHTML.trim()) {
          el.innerHTML = '<p class="texto-vacio">No hay ' + tipo + 's publicados actualmente.</p>';
        }
        return;
      }
      var htmlDb = d.items.map(htmlTarjetaPortalItem).join('');
      el.innerHTML = (el.innerHTML || '') + htmlDb;
    })
    .catch(function() {
      if (!el.innerHTML.trim()) {
        el.innerHTML = '<p class="texto-vacio">No hay ' + tipo + 's publicados actualmente.</p>';
      }
    });
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
  var h = location.hostname;
  if (h.indexOf('railway.app') !== -1 || h.indexOf('github.io') !== -1) {
    return Promise.resolve(null);
  }
  var url = (typeof WEB_APP_URL !== 'undefined' && WEB_APP_URL) ? WEB_APP_URL : REGPOL_WEB_APP;
  return fetch(url + '?action=get_site')
    .then(function(r) { return r.json(); })
    .then(function(res) { return (res && res.ok && res.data) ? res.data : null; })
    .catch(function() { return null; });
}

function fetchSiteDataDefault() {
  return fetch('site-data.json?v=' + Date.now())
    .then(function(r) { if (!r.ok) throw new Error('site-data'); return r.json(); })
    .catch(function() { return null; });
}

function cargarSiteData() {
  var local = getSiteDataFromStorage();
  var h = location.hostname;
  var usarJsonLocal = h.indexOf('railway.app') !== -1 || h.indexOf('github.io') !== -1;

  if (usarJsonLocal) {
    return fetchSiteDataDefault().then(function(data) {
      if (data) { saveSiteDataToStorage(data); return data; }
      if (local) return local;
      return null;
    });
  }

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
  if (!el) return;
  if (!items || !items.length) {
    el.innerHTML = '';
    return;
  }
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
    var foto = n.imagen
      ? '<div class="noticia-foto"><img src="' + n.imagen + '" alt="' + escHtml(n.titulo) + '" loading="lazy"/></div>'
      : '';
    return '<article class="noticia-card' + (n.imagen ? ' noticia-card-foto' : '') + '">'
      + foto
      + '<div class="noticia-contenido">'
      + '<div class="noticia-meta"><span class="noticia-cat">' + escHtml(n.categoria) + '</span>'
      + '<span class="noticia-fecha">' + escHtml(n.fecha) + '</span></div>'
      + '<h3>' + escHtml(n.titulo) + '</h3>'
      + '<p>' + escHtml(n.resumen) + '</p>'
      + '</div></article>';
  }).join('');
}

function actualizarCarrusel(data) {
  var slides = data.carrusel || [];
  var heroT  = data.heroTexto || {};
  var slider = document.querySelector('.presentation-slider');
  if (!slider) return;

  if (heroT.titulo || heroT.subtitulo || heroT.parrafo) {
    var h1 = slider.querySelector('.hero-overlay h1');
    var h2 = slider.querySelector('.hero-overlay h2');
    var pp = slider.querySelector('.hero-overlay p');
    if (h1 && heroT.titulo)    h1.textContent = heroT.titulo;
    if (h2 && heroT.subtitulo) h2.textContent = heroT.subtitulo;
    if (pp && heroT.parrafo)   pp.textContent = heroT.parrafo;
  }

  if (!slides.length) return;

  var slidesDiv = slider.querySelector('.slides');
  var dotsDiv   = slider.querySelector('.slider-dots');
  if (!slidesDiv) return;

  slidesDiv.innerHTML = slides.map(function(s, i) {
    var isActive = i === 0 ? ' active' : '';
    var imgSrc = s.imagen || '';
    var imgTag = imgSrc
      ? '<img src="' + imgSrc + '" alt="' + escHtml(s.titulo || '') + '" class="slide-img" width="1920" height="1080" '
        + (i === 0 ? 'decoding="async" fetchpriority="high"' : 'loading="lazy" decoding="async"') + '>'
      : '';
    var caption = (s.titulo || s.subtitulo)
      ? '<div class="slide-caption"><strong>' + escHtml(s.titulo || '') + '</strong>'
        + (s.subtitulo ? '<span>' + escHtml(s.subtitulo) + '</span>' : '') + '</div>'
      : '';
    return '<div class="slide' + isActive + '">' + imgTag + caption + '</div>';
  }).join('');

  if (dotsDiv) {
    dotsDiv.innerHTML = slides.map(function(s, i) {
      return '<span class="dot' + (i === 0 ? ' active' : '') + '" data-slide="' + i
        + '" aria-label="Imagen ' + (i + 1) + '"></span>';
    }).join('');
    dotsDiv.querySelectorAll('.dot').forEach(function(dot) {
      dot.addEventListener('click', function() { irASlide(parseInt(this.getAttribute('data-slide'))); });
    });
  }
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
    if (config.renderConvenios) {
      renderTarjetas(data.convenios, config.renderConvenios);
      appendPortalItems('convenio', config.renderConvenios);
    }
    if (config.renderCursos) {
      renderTarjetas(data.cursos, config.renderCursos);
      appendPortalItems('curso', config.renderCursos);
    }
    if (config.renderConveniosPdf) renderPdfList(data.conveniosPdf, config.renderConveniosPdf);
    if (config.renderCursosPdf) renderPdfList(data.cursosPdf, config.renderCursosPdf);
    if (config.actualizarFecha) actualizarFechaPortal(data);
    if (config.actualizarCarrusel) actualizarCarrusel(data);
    if (data.navOcultos && data.navOcultos.length) aplicarNavOcultos(data.navOcultos);
    return data;
  });
}

function aplicarNavOcultos(ocultos) {
  if (!ocultos || !ocultos.length) return;
  document.querySelectorAll('[data-nav-id]').forEach(function(el) {
    if (ocultos.indexOf(el.getAttribute('data-nav-id')) !== -1) {
      el.style.display = 'none';
    }
  });
  REGPOL_NAV.forEach(function(item) {
    if (ocultos.indexOf(item.id) !== -1) {
      var link = document.querySelector('a[href="' + item.href + '"]');
      if (link && link.closest('li')) link.closest('li').style.display = 'none';
    }
  });
}
