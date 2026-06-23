/* portal.js \u2014 Datos y renderizado compartido del portal REGPOL Callao */
(function() {
  if (window.REGPOL_API_BASE != null) return;
  var h = location.hostname;
  if (h === 'localhost' || h === '127.0.0.1') {
    window.REGPOL_API_BASE = 'http://localhost:3000';
  } else if (h.indexOf('github.io') !== -1 || h.indexOf('github.com') !== -1) {
    window.REGPOL_API_BASE = 'https://regpolcallao-production.up.railway.app';
  } else {
    window.REGPOL_API_BASE = '';
  }
})();

var REGPOL_WEB_APP = 'https://script.google.com/macros/s/AKfycbzHHCUjXQVNtgVTERGx3RuiGPfSHuhCgTVddHL8ByDJUE-lLQessVsdFCFabayhCC5u/exec';
var REGPOL_SITE_KEY = 'regpolSiteData_v1';

var PORTAL_MARCA = {
  titulo: 'REGI\u00d3N POLICIAL CALLAO',
  subtitulo: 'UNIDAD DE TECNOLOGIAS DE LA INFORMACION Y COMUNICACIONES'
};

var PORTAL_HERO = {
  titulo: 'REGI\u00d3N POLICIAL CALLAO',
  lema: 'AL SERVICIO DE LA CIUDADAN\u00cdA',
  eslogan: 'Compromiso, Honor y Servicio en la Provincia Constitucional'
};

var REGPOL_NAV_FALLBACK = [
  { id: 'inicio',    href: 'index.html',            label: 'INICIO',             icon: 'fa-home' },
  { id: 'novedades', href: 'novedades.html',         label: 'NOVEDADES' },
  { id: 'convenios', href: 'convenios.html',         label: 'CONVENIOS' },
  { id: 'cursos',    href: 'cursos.html',            label: 'CURSOS' },
  { id: 'bienestar', href: 'evaluacion.html',        label: 'BIENESTAR',          icon: 'fa-heart' },
  { id: 'resena',    href: 'resena-historica.html',  label: 'RESE\u00d1A HIST\u00d3RICA' },
  { id: 'labor',     href: 'nuestra-labor.html',     label: 'NUESTRA LABOR' },
  { id: 'unidades',  href: 'unidades.html',          label: 'NUESTRAS UNIDADES', icon: 'fa-map-marker-alt' }
];

var portalActiveNavId = '';

function obtenerPortalNav() {
  if (window.REGPOL_NAV && window.REGPOL_NAV.length) return window.REGPOL_NAV;
  return REGPOL_NAV_FALLBACK;
}

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
    ? '<span style="display:inline-block;background:#d4edda;color:#1a7a3a;font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;margin-top:4px;">\u2713 Inscripciones abiertas</span>'
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
  var cacheKey = 'portal_items_' + tipo;
  try {
    var raw = sessionStorage.getItem(cacheKey);
    if (raw) {
      var c = JSON.parse(raw);
      if (c.exp > Date.now() && c.items && c.items.length) {
        el.innerHTML = (el.innerHTML || '') + c.items.map(htmlTarjetaPortalItem).join('');
        return Promise.resolve();
      }
    }
  } catch (e) {}
  var url = base + '/portal/items?tipo=' + encodeURIComponent(tipo);
  return fetchConTimeout(url, 12000)
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (!d.ok || !d.items || !d.items.length) {
        if (!el.innerHTML.trim()) {
          el.innerHTML = '<p class="texto-vacio">No hay ' + tipo + 's publicados actualmente.</p>';
        }
        return;
      }
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify({ items: d.items, exp: Date.now() + 180000 }));
      } catch (e) {}
      el.innerHTML = (el.innerHTML || '') + d.items.map(htmlTarjetaPortalItem).join('');
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

function fetchConTimeout(url, ms) {
  ms = ms || 12000;
  return Promise.race([
    fetch(url),
    new Promise(function(_, reject) {
      setTimeout(function() { reject(new Error('timeout')); }, ms);
    })
  ]);
}

function fetchSiteDataDefault() {
  var base = apiBasePortal();
  return fetchConTimeout((base || '') + '/portal/configuracion', 6000)
    .then(function(r) { if (!r.ok) throw new Error('no-config'); return r.json(); })
    .catch(function() {
      return fetchConTimeout('site-data.json?v=3', 4000)
        .then(function(r) { if (!r.ok) throw new Error('site-data'); return r.json(); })
        .catch(function() { return null; });
    });
}

function obtenerSiteDataSync() {
  var local = getSiteDataFromStorage();
  if (local) return local;
  if (typeof REGPOL_SITE_DATA_BUILTIN !== 'undefined' && REGPOL_SITE_DATA_BUILTIN) {
    return REGPOL_SITE_DATA_BUILTIN;
  }
  return null;
}

function aplicarPortalConfig(config, data) {
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
  initPortalNav((config && config.activeNav) || portalActiveNavId);
  if (data.navOcultos && data.navOcultos.length) aplicarNavOcultos(data.navOcultos);
}

function refrescarSiteDataEnFondo(config) {
  return fetchSiteDataDefault().then(function(fresh) {
    if (!fresh) return null;
    saveSiteDataToStorage(fresh);
    if (config) aplicarPortalConfig(config, fresh);
    return fresh;
  }).catch(function() { return null; });
}

function cargarSiteData() {
  var sync = obtenerSiteDataSync();
  if (sync) {
    refrescarSiteDataEnFondo(null);
    return Promise.resolve(sync);
  }
  var h = location.hostname;
  var usarJsonLocal = h.indexOf('railway.app') !== -1 || h.indexOf('github.io') !== -1;
  if (usarJsonLocal) {
    return fetchSiteDataDefault().then(function(data) {
      if (data) { saveSiteDataToStorage(data); return data; }
      return obtenerSiteDataSync();
    });
  }
  return fetchSiteDataFromServer()
    .then(function(server) {
      if (server) { saveSiteDataToStorage(server); return server; }
      return fetchSiteDataDefault();
    })
    .then(function(data) {
      if (data) { saveSiteDataToStorage(data); return data; }
      return obtenerSiteDataSync();
    });
}

function publicarSiteData(data) {
  saveSiteDataToStorage(data);
  var base = apiBasePortal();
  var token = (typeof TOKEN !== 'undefined' && TOKEN) ? TOKEN : '';
  if (token) {
    fetch((base || '') + '/admin/configuracion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
      body: JSON.stringify(data)
    }).catch(function() {});
  }
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

function normalizarHeroTexto(heroT) {
  heroT = heroT || {};
  var titulo = (heroT.titulo || PORTAL_HERO.titulo).trim();
  var lema = (heroT.lema || '').trim();
  var subtitulo = (heroT.subtitulo || '').trim();
  var eslogan = (heroT.eslogan || heroT.parrafo || '').trim();

  if (!lema) {
    if (subtitulo === PORTAL_HERO.eslogan || subtitulo === 'Compromiso, Honor y Servicio en la Provincia Constitucional') {
      eslogan = eslogan || subtitulo;
      lema = PORTAL_HERO.lema;
    } else if (subtitulo === PORTAL_MARCA.subtitulo || subtitulo.indexOf('TECNOLOG') !== -1) {
      lema = PORTAL_HERO.lema;
      eslogan = eslogan || PORTAL_HERO.eslogan;
    } else if (subtitulo) {
      lema = subtitulo;
    } else {
      lema = PORTAL_HERO.lema;
    }
  }
  if (!eslogan) eslogan = PORTAL_HERO.eslogan;
  return { titulo: titulo, lema: lema, eslogan: eslogan };
}

function aplicarEncabezadoMarca() {
  document.querySelectorAll('.main-header .portal-eslogan').forEach(function(el) {
    el.textContent = PORTAL_MARCA.titulo;
  });
  document.querySelectorAll('.main-header .portal-subtitulo').forEach(function(el) {
    el.textContent = PORTAL_MARCA.subtitulo;
  });
}

function aplicarHeroMarca(heroT) {
  var hero = normalizarHeroTexto(heroT);
  document.querySelectorAll('.hero-overlay .portal-hero-titulo').forEach(function(el) {
    el.textContent = hero.titulo;
  });
  document.querySelectorAll('.hero-overlay .portal-hero-lema').forEach(function(el) {
    el.textContent = hero.lema;
  });
  document.querySelectorAll('.hero-overlay .portal-hero-eslogan').forEach(function(el) {
    el.textContent = hero.eslogan;
  });
}

function initPortalNav(activeId) {
  if (activeId) portalActiveNavId = activeId;
  else activeId = portalActiveNavId;
  aplicarEncabezadoMarca();
  var ul = document.querySelector('.nav-main ul');
  if (!ul) return;
  var navItems = obtenerPortalNav();
  ul.innerHTML = navItems.map(function(item) {
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
  html += '<p class="institucional-lead">' + escHtml(sec.intro) + '</p>';
  html += '</div>';
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
  html += '<p class="institucional-lead">' + escHtml(sec.intro) + '</p>';
  html += '</div>';
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

var _novedadesCache = [];

function renderNovedades(data, containerId, limite) {
  var el = document.getElementById(containerId);
  if (!el) return;
  var items = (data.novedades || []).slice();
  _novedadesCache = items;
  if (limite) items = items.slice(0, limite);
  if (!items.length) { el.innerHTML = '<p class="texto-vacio">Sin novedades publicadas.</p>'; return; }
  if (limite) {
    el.innerHTML = '<div class="novedades-portada-lista">' + items.map(function(n, idx) {
      return '<article class="noticia-card" onclick="abrirNovedadDetalle(' + idx + ')" style="cursor:pointer;">'
        + '<div class="noticia-contenido">'
        + '<div class="noticia-meta"><span class="noticia-cat">' + escHtml(n.categoria) + '</span>'
        + '<span class="noticia-fecha">' + escHtml(n.fecha) + '</span></div>'
        + '<h3>' + escHtml(n.titulo) + '</h3>'
        + '<p>' + escHtml(n.resumen) + '</p>'
        + '</div></article>';
    }).join('') + '</div>';
  } else {
    el.innerHTML = '<div class="novedades-grid">' + items.map(function(n, idx) {
      var bgStyle = n.imagen
        ? 'background-image:url(' + JSON.stringify(n.imagen) + ');background-size:cover;background-position:center;'
        : 'background:linear-gradient(135deg,#002d24,#004d3d);';
      return '<article class="nov-card" onclick="abrirNovedadDetalle(' + idx + ')">'
        + '<div class="nov-card-img" style="' + bgStyle + '">'
        + '<div class="nov-card-img-overlay"></div>'
        + '<span class="nov-card-cat">' + escHtml(n.categoria) + '</span>'
        + '</div>'
        + '<div class="nov-card-body">'
        + '<div class="nov-card-fecha"><i class="fas fa-calendar-alt"></i> ' + escHtml(n.fecha) + '</div>'
        + '<h3 class="nov-card-titulo">' + escHtml(n.titulo) + '</h3>'
        + '<p class="nov-card-resumen">' + escHtml(n.resumen) + '</p>'
        + '<span class="nov-card-link"><i class="fas fa-arrow-right"></i> Leer mas</span>'
        + '</div></article>';
    }).join('') + '</div>';
  }
}

function abrirNovedadDetalle(idx) {
  var n = _novedadesCache[idx];
  if (!n) return;
  var inner = document.getElementById('modal-nov-inner');
  if (!inner) return;
  var heroHtml = n.imagen
    ? '<div class="modal-nov-hero"><img src="' + escHtml(n.imagen) + '" alt="' + escHtml(n.titulo) + '"/></div>'
    : '';
  inner.innerHTML = heroHtml
    + '<div class="modal-nov-header">'
    + '<span class="noticia-cat">' + escHtml(n.categoria) + '</span>'
    + '<span class="modal-nov-fecha">' + escHtml(n.fecha) + '</span>'
    + '</div>'
    + '<h2 class="modal-nov-titulo">' + escHtml(n.titulo) + '</h2>'
    + '<div class="modal-nov-cuerpo"><p>' + escHtml(n.contenido || n.resumen) + '</p></div>';
  var modal = document.getElementById('modal-novedad');
  if (modal) { modal.classList.add('visible'); document.body.style.overflow = 'hidden'; }
}

function cerrarNovedadModal() {
  var modal = document.getElementById('modal-novedad');
  if (modal) { modal.classList.remove('visible'); document.body.style.overflow = ''; }
}

function actualizarCarrusel(data) {
  var slides = data.carrusel || [];
  var heroT  = data.heroTexto || {};
  var slider = document.querySelector('.presentation-slider');
  if (!slider) return;

  aplicarHeroMarca(heroT);

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
  if (el && data.actualizacion) el.textContent = '\u00daLTIMA ACTUALIZACI\u00d3N: ' + data.actualizacion;
}

function initPortalPagina(config) {
  config = config || {};
  initPortalNav(config.activeNav || '');
  aplicarHeroMarca();
  var data = obtenerSiteDataSync();
  if (data) aplicarPortalConfig(config, data);
  return cargarSiteData().then(function(fresh) {
    if (fresh) aplicarPortalConfig(config, fresh);
    return fresh;
  });
}

function renderUnidadesPublico(data) {
  var cont = document.getElementById('contenedor-unidades');
  var msg  = document.getElementById('msg-cargando');
  if (!cont || !msg) return;
  if (!data || !data.ok || !data.divisiones || !data.divisiones.length) {
    msg.innerHTML = '<i class="fas fa-exclamation-circle"></i> No se pudo cargar la informaci?n.';
    return;
  }
  msg.style.display = 'none';
  var html = '';
  data.divisiones.forEach(function(div) {
    if (!div.unidades || !div.unidades.length) return;
    html += '<div class="unidades-seccion">'
      + '<h3 class="unidades-seccion-titulo"><i class="fas fa-shield-alt"></i> ' + escHtml(div.nombre) + '</h3>'
      + '<div class="tabla-unidades-wrap"><table class="tabla-unidades">'
      + '<thead><tr>'
      + '<th>#</th>'
      + '<th>Comisaria / Unidad</th>'
      + '<th>Direcci?n</th>'
      + '<th>Tel?fono</th>'
      + '<th>Mapa</th>'
      + '</tr></thead><tbody>';
    div.unidades.forEach(function(u, i) {
      var mapsUrl = u.direccion
        ? 'https://www.google.com/maps/search/' + encodeURIComponent(u.direccion + ', Callao, Peru')
        : '';
      var mapsBtn = mapsUrl
        ? '<a href="' + mapsUrl + '" target="_blank" rel="noopener noreferrer" class="btn-mapa"><i class="fas fa-map-marker-alt"></i> Ver mapa</a>'
        : '<span class="sin-dato">-</span>';
      var tel = u.telefono
        ? '<a href="tel:' + escHtml(u.telefono) + '" class="tel-link">' + escHtml(u.telefono) + '</a>'
        : '<span class="sin-dato">-</span>';
      html += '<tr>'
        + '<td class="td-num">' + (i + 1) + '</td>'
        + '<td class="td-nombre">' + escHtml(u.nombre) + '</td>'
        + '<td class="td-dir">' + (u.direccion ? escHtml(u.direccion) : '<span class="sin-dato">No disponible</span>') + '</td>'
        + '<td class="td-tel">' + tel + '</td>'
        + '<td class="td-mapa">' + mapsBtn + '</td>'
        + '</tr>';
    });
    html += '</tbody></table></div></div>';
  });
  cont.innerHTML = html;
}

function initUnidadesPagina() {
  initPortalNav('unidades');
  var base = apiBasePortal();
  if (base === null || base === undefined) base = '';
  if (typeof REGPOL_UNIDADES_BUILTIN !== 'undefined' && REGPOL_UNIDADES_BUILTIN) {
    renderUnidadesPublico(REGPOL_UNIDADES_BUILTIN);
  }
  fetchConTimeout('unidades-data.json', 5000)
    .then(function(r) { return r.json(); })
    .then(function(data) { renderUnidadesPublico(data); })
    .catch(function() {});
  var ctrl = new AbortController();
  var t = setTimeout(function() { ctrl.abort(); }, 6000);
  fetch(base + '/unidades-publico', { signal: ctrl.signal })
    .then(function(r) { return r.json(); })
    .then(function(live) {
      if (live && live.ok && live.divisiones && live.divisiones.length) renderUnidadesPublico(live);
    })
    .catch(function() {})
    .finally(function() { clearTimeout(t); });
}

function aplicarNavOcultos(ocultos) {
  if (!ocultos || !ocultos.length) return;
  document.querySelectorAll('[data-nav-id]').forEach(function(el) {
    if (ocultos.indexOf(el.getAttribute('data-nav-id')) !== -1) {
      el.style.display = 'none';
    }
  });
  obtenerPortalNav().forEach(function(item) {
    if (ocultos.indexOf(item.id) !== -1) {
      var link = document.querySelector('a[href="' + item.href + '"]');
      if (link && link.closest('li')) link.closest('li').style.display = 'none';
    }
  });
}
