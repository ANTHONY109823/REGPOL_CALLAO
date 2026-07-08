/* portal.js \u2014 Datos y renderizado compartido del portal REGPOL Callao */
(function() {
  if (window.REGPOL_API_BASE) return;
  var h = location.hostname;
  var prod = window.REGPOL_API_PRODUCTION || 'https://regpolcallao-production.up.railway.app';
  window.REGPOL_API_BASE = (h === 'localhost' || h === '127.0.0.1') ? 'http://localhost:3000' : prod;
})();

var REGPOL_WEB_APP = 'https://script.google.com/macros/s/AKfycbzHHCUjXQVNtgVTERGx3RuiGPfSHuhCgTVddHL8ByDJUE-lLQessVsdFCFabayhCC5u/exec';
var REGPOL_SITE_KEY = 'regpolSiteData_v2';

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
  { id: 'inicio',    href: 'index.html#inicio',    label: 'INICIO',             icon: 'fa-home' },
  { id: 'novedades', href: 'index.html#novedades', label: 'NOVEDADES' },
  { id: 'convenios', href: 'index.html#convenios', label: 'CONVENIOS' },
  { id: 'cursos',    href: 'index.html#cursos',    label: 'CURSOS' },
  { id: 'bienestar', href: 'index.html#bienestar', label: 'BIENESTAR',          icon: 'fa-heart' },
  { id: 'resena',    href: 'index.html#resena',    label: 'RESE\u00d1A HIST\u00d3RICA' },
  { id: 'labor',     href: 'index.html#labor',    label: 'NUESTRA LABOR' },
  { id: 'unidades',  href: 'index.html#unidades', label: 'NUESTRAS UNIDADES', icon: 'fa-map-marker-alt' }
];

var portalActiveNavId = '';
var _scrollNavListo = false;
var portalNavOcultosCache = [];

function obtenerPortalNav(ocultos) {
  var ocultosList = ocultos || portalNavOcultosCache || [];
  var base = (window.REGPOL_NAV && window.REGPOL_NAV.length) ? window.REGPOL_NAV : REGPOL_NAV_FALLBACK;
  return base.filter(function(item) {
    return item.id !== 'consulta' && ocultosList.indexOf(item.id) === -1;
  });
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function apiBasePortal() {
  if (typeof window.regpolApiBase === 'function') return window.regpolApiBase();
  if (window.REGPOL_API_BASE) return window.REGPOL_API_BASE;
  var h = location.hostname;
  if (h === 'localhost' || h === '127.0.0.1') return 'http://localhost:3000';
  return window.REGPOL_API_PRODUCTION || 'https://regpolcallao-production.up.railway.app';
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
      '<span class="card-estado" style="color:' + colorEstado + ';">' + escHtml(item.estado) + '</span>' +
      inscBadge +
    '</div></a>';
}

function appendPortalItems(tipo, containerId) {
  var el = document.getElementById(containerId);
  if (!el) return Promise.resolve();
  var base = apiBasePortal();
  if (base === null || base === undefined) base = '';
  var cacheKey = 'portal_items_v2_' + tipo;
  try {
    var raw = sessionStorage.getItem(cacheKey);
    if (raw) {
      var c = JSON.parse(raw);
      if (c.exp > Date.now() && c.items && c.items.length) {
        el.innerHTML = c.items.map(htmlTarjetaPortalItem).join('');
        return Promise.resolve();
      }
    }
  } catch (e) {}
  var url = base + '/portal/items?tipo=' + encodeURIComponent(tipo);
  return fetchConTimeout(url, 12000)
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (!d.ok || !d.items || !d.items.length) {
        el.innerHTML = '<p class="texto-vacio">No hay ' + tipo + 's publicados actualmente.</p>';
        return;
      }
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify({ items: d.items, exp: Date.now() + 180000 }));
      } catch (e) {}
      el.innerHTML = d.items.map(htmlTarjetaPortalItem).join('');
    })
    .catch(function() {
      el.innerHTML = '<p class="texto-vacio">No hay ' + tipo + 's publicados actualmente.</p>';
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

function tieneSiteDataPersistido() {
  return !!getSiteDataFromStorage();
}

function fingerprintCarruselSlides(slides) {
  return (slides || []).map(function(s) {
    return String((s && s.imagen) || '').trim();
  }).join('\u0001');
}

function fingerprintFotosEncabezado(fotos) {
  return (fotos || []).map(function(f) { return String(f || '').trim(); }).join('\u0001');
}

var _carruselFingerprint = '';
var _carruselInitGen = 0;
var _headerFotosFingerprint = '';

function siteDataParaCacheLocal(data) {
  if (!data || typeof data !== 'object') return data;
  var lite = Object.assign({}, data);
  if (lite.fotosEncabezado) {
    lite.fotosEncabezado = sanitizarFotosEncabezado(lite.fotosEncabezado.map(function(u) {
      var s = String(u || '');
      return s.indexOf('data:') === 0 ? '' : s;
    }).filter(Boolean));
  }
  if (lite.carrusel) {
    lite.carrusel = lite.carrusel.map(function(sl) {
      var img = String((sl && sl.imagen) || '');
      return Object.assign({}, sl, { imagen: img.indexOf('data:') === 0 ? '' : img });
    });
  }
  if (lite.resenaHistorica && lite.resenaHistorica.parrafos) {
    lite.resenaHistorica = Object.assign({}, lite.resenaHistorica, {
      parrafos: lite.resenaHistorica.parrafos.map(function(p) {
        var n = typeof p === 'string' ? { texto: p } : Object.assign({}, p);
        if (n.imagen && String(n.imagen).indexOf('data:') === 0) n.imagen = '';
        return n;
      })
    });
  }
  ['resenaHistorica', 'nuestraLabor'].forEach(function(k) {
    if (lite[k] && lite[k].imagenBanner && String(lite[k].imagenBanner).indexOf('data:') === 0) {
      lite[k] = Object.assign({}, lite[k], { imagenBanner: '' });
    }
  });
  if (lite.imagenBannerNovedades && String(lite.imagenBannerNovedades).indexOf('data:') === 0) {
    lite.imagenBannerNovedades = '';
  }
  if (lite.novedades && lite.novedades.length) {
    lite.novedades = lite.novedades.map(function(n) {
      if (!n) return n;
      var img = String(n.imagen || n.foto || '');
      if (img.indexOf('data:') === 0) {
        return Object.assign({}, n, { imagen: '' });
      }
      return n;
    });
  }
  if (lite.convenios && lite.convenios.length) {
    lite.convenios = lite.convenios.map(function(c) {
      if (!c) return c;
      var img = String(c.imagen || '');
      if (img.indexOf('data:') === 0) {
        return Object.assign({}, c, { imagen: '' });
      }
      return c;
    });
  }
  return lite;
}

function saveSiteDataToStorage(data) {
  try {
    var paraGuardar = siteDataParaCacheLocal(data);
    var json = JSON.stringify(paraGuardar);
    if (json.length > 2.5 * 1024 * 1024) {
      return;
    }
    localStorage.setItem(REGPOL_SITE_KEY, json);
  } catch (e) {
    try { localStorage.removeItem(REGPOL_SITE_KEY); } catch (e2) {}
  }
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

var PORTAL_CONFIG_TIMEOUT_MS = 30000;

function fetchConTimeout(url, ms) {
  ms = ms || 12000;
  return Promise.race([
    fetch(url, { cache: 'no-store' }),
    new Promise(function(_, reject) {
      setTimeout(function() { reject(new Error('timeout')); }, ms);
    })
  ]);
}

function limpiarCachePortal() {
  try { localStorage.removeItem(REGPOL_SITE_KEY); } catch (e) {}
}

function esHostEstaticoPortal() {
  var h = location.hostname;
  return h.indexOf('github.io') !== -1 || h.indexOf('github.com') !== -1;
}

function fetchSiteDataDefault() {
  var cargarJsonLocal = function() {
    return fetchConTimeout('site-data.json?v=5', 4000)
      .then(function(r) { if (!r.ok) throw new Error('site-data'); return r.json(); })
      .catch(function() {
        if (typeof REGPOL_SITE_DATA_BUILTIN !== 'undefined' && REGPOL_SITE_DATA_BUILTIN) {
          return REGPOL_SITE_DATA_BUILTIN;
        }
        return null;
      });
  };
  var normalizarConfigApi = function(data) {
    if (!data || data.ok === false) throw new Error('no-config');
    if (data.fotosEncabezado) data.fotosEncabezado = sanitizarFotosEncabezado(data.fotosEncabezado, false);
    return data;
  };
  var pedirApi = function() {
    var base = apiBasePortal();
    if (!base) return Promise.reject(new Error('no-api'));
    var urlApi = base + '/portal/configuracion?t=' + Date.now();
    if (window.__REGPOL_CONFIG_PROMISE) {
      return window.__REGPOL_CONFIG_PROMISE.then(function(data) {
        if (data) return normalizarConfigApi(data);
        throw new Error('no-config');
      });
    }
    return fetchConTimeout(urlApi, PORTAL_CONFIG_TIMEOUT_MS)
      .then(function(r) { if (!r.ok) throw new Error('no-config'); return r.json(); })
      .then(normalizarConfigApi)
      .catch(function() {
        return fetchConTimeout(urlApi + '&retry=1', PORTAL_CONFIG_TIMEOUT_MS)
          .then(function(r) { if (!r.ok) throw new Error('no-config'); return r.json(); })
          .then(normalizarConfigApi);
      });
  };
  return pedirApi().catch(cargarJsonLocal);
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
  aplicarEncabezadoMarca(data);
  if (config.renderResena) renderResenaHistorica(data, config.renderResena);
  if (config.renderLabor) renderNuestraLabor(data, config.renderLabor);
  if (config.renderBienestar) renderBienestarPolicial(data, config.renderBienestar);
  if (config.renderNovedades) renderNovedades(data, config.renderNovedades, config.limiteNovedades);
  if (config.renderConvenios && (!data.navOcultos || data.navOcultos.indexOf('convenios') === -1)) {
    var elConv = document.getElementById(config.renderConvenios);
    if (elConv) elConv.innerHTML = '';
    appendPortalItems('convenio', config.renderConvenios);
  } else if (config.renderConvenios) {
    var elConvHide = document.getElementById(config.renderConvenios);
    if (elConvHide && elConvHide.closest('section')) elConvHide.closest('section').style.display = 'none';
  }
  if (config.renderCursos && (!data.navOcultos || data.navOcultos.indexOf('cursos') === -1)) {
    var elCur = document.getElementById(config.renderCursos);
    if (elCur) elCur.innerHTML = '';
    appendPortalItems('curso', config.renderCursos);
  } else if (config.renderCursos) {
    var elCurHide = document.getElementById(config.renderCursos);
    if (elCurHide && elCurHide.closest('section')) elCurHide.closest('section').style.display = 'none';
  }
  if (config.renderConveniosPdf && (!data.navOcultos || data.navOcultos.indexOf('convenios') === -1)) {
    cargarResultadosPdfPortal('convenio', config.renderConveniosPdf);
  }
  if (config.renderCursosPdf && (!data.navOcultos || data.navOcultos.indexOf('cursos') === -1)) {
    cargarResultadosPdfPortal('curso', config.renderCursosPdf);
  }
  if (config.actualizarFecha) actualizarFechaPortal(data);
  if (config.actualizarCarrusel) actualizarCarrusel(data);
  if (data.navOcultos) portalNavOcultosCache = data.navOcultos;
  initPortalNav((config && config.activeNav) || portalActiveNavId, data.navOcultos || []);
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
  return fetchSiteDataDefault().then(function(data) {
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

function esPaginaInicio() {
  var p = (location.pathname || '').split('/').pop() || '';
  return !p || p === 'index.html';
}

function marcarNavActivo(activeId) {
  document.querySelectorAll('.nav-main a[data-nav]').forEach(function(a) {
    a.classList.toggle('activo', a.getAttribute('data-nav') === activeId);
  });
}

function navDesdeHash() {
  var h = (location.hash || '').replace('#', '').trim();
  var ids = ['inicio', 'novedades', 'convenios', 'cursos', 'bienestar', 'resena', 'labor', 'unidades'];
  return ids.indexOf(h) >= 0 ? h : '';
}

function scrollASeccion(id) {
  if (!id) return;
  var el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  marcarNavActivo(id);
}

function initPortalStickyNav() {
  if (!esPaginaInicio()) return;
  var nav = document.querySelector('.portal-home .nav-main');
  if (!nav || nav.dataset.stickyReady) return;
  nav.dataset.stickyReady = '1';

  var placeholder = document.createElement('div');
  placeholder.className = 'nav-main-placeholder';
  placeholder.setAttribute('aria-hidden', 'true');
  nav.insertAdjacentElement('afterend', placeholder);

  var navOffset = 0;
  function measureOffset() {
    if (!nav.classList.contains('nav-is-fixed')) {
      navOffset = nav.getBoundingClientRect().top + window.scrollY;
    }
  }

  function updateStickyNav() {
    if (window.scrollY >= navOffset - 1) {
      if (!nav.classList.contains('nav-is-fixed')) {
        placeholder.style.height = nav.offsetHeight + 'px';
        nav.classList.add('nav-is-fixed');
      }
    } else {
      nav.classList.remove('nav-is-fixed');
      placeholder.style.height = '0';
    }
  }

  measureOffset();
  window.addEventListener('resize', function() { measureOffset(); updateStickyNav(); });
  window.addEventListener('load', function() { measureOffset(); updateStickyNav(); });
  window.addEventListener('scroll', updateStickyNav, { passive: true });
  updateStickyNav();
}

function initPortalScrollNav() {
  if (!esPaginaInicio() || _scrollNavListo) return;
  _scrollNavListo = true;
  var ul = document.querySelector('.nav-main ul');
  if (ul) {
    ul.addEventListener('click', function(e) {
      var a = e.target.closest('a[data-nav]');
      if (!a) return;
      var href = a.getAttribute('href') || '';
      var hash = href.indexOf('#') !== -1 ? href.split('#')[1] : '';
      if (!hash) return;
      e.preventDefault();
      scrollASeccion(hash);
      if (history.pushState) history.pushState(null, '', '#' + hash);
    });
  }
  var ids = ['inicio', 'novedades', 'convenios', 'cursos', 'bienestar', 'resena', 'labor', 'unidades'];
  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function() {
      ticking = false;
      var y = window.scrollY + 100;
      var actual = 'inicio';
      ids.forEach(function(id) {
        var el = document.getElementById(id);
        if (el && el.offsetTop <= y) actual = id;
      });
      marcarNavActivo(actual);
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  initPortalStickyNav();
}

function initPortalNav(activeId, ocultos) {
  if (activeId) portalActiveNavId = activeId;
  else activeId = portalActiveNavId;
  if (ocultos) portalNavOcultosCache = ocultos;
  aplicarTextoEncabezadoMarca();
  var ul = document.querySelector('.nav-main ul');
  if (!ul) return;
  var navItems = obtenerPortalNav(portalNavOcultosCache);
  ul.innerHTML = navItems.map(function(item) {
    var cls = item.id === activeId ? ' class="activo"' : '';
    var icon = item.icon ? '<i class="fas ' + item.icon + '"></i> ' : '';
    return '<li><a href="' + item.href + '" data-nav="' + item.id + '"' + cls + '>' + icon + item.label + '</a></li>';
  }).join('');
  if (esPaginaInicio()) initPortalScrollNav();
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

function aplicarTextoEncabezadoMarca() {
  document.querySelectorAll('.main-header .portal-eslogan').forEach(function(el) {
    el.textContent = PORTAL_MARCA.titulo;
  });
  document.querySelectorAll('.main-header .portal-subtitulo').forEach(function(el) {
    el.textContent = PORTAL_MARCA.subtitulo;
  });
}

function aplicarEncabezadoMarca(data) {
  aplicarTextoEncabezadoMarca();
  if (!data) return;
  var fotos = sanitizarFotosEncabezado(data.fotosEncabezado, false);
  if (fotos.length) renderFotosEncabezado(data);
}

function asegurarPanelFotosEncabezado() {
  var flex = document.querySelector('.main-header .header-flex');
  if (!flex) return null;
  var panel = document.getElementById('header-fotos-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'header-fotos-panel';
    panel.className = 'header-fotos-panel';
    panel.setAttribute('aria-label', 'Carrusel de fotos del encabezado');
    flex.appendChild(panel);
  }
  return panel;
}

var FOTOS_ENCABEZADO_DEFAULT = [];

var CARRUSEL_DEFAULT = [];
var HEADER_FOTOS_INTERVAL_MS = 6500;
var HEADER_FOTOS_TRANSITION_MS = 900;
var _headerFotosTimer = null;
var _headerFotosResizeFn = null;
var _headerFotoBlobUrls = [];

function revocarHeaderFotoBlobs() {
  _headerFotoBlobUrls.forEach(function(u) {
    try { URL.revokeObjectURL(u); } catch (e) {}
  });
  _headerFotoBlobUrls = [];
}

function urlImagenHeaderParaDom(src) {
  var s = String(src || '').trim();
  if (!s) return '';
  if (s.indexOf('data:image/') !== 0) return s;
  try {
    var parts = s.split(',');
    if (parts.length < 2) return s;
    var mimeMatch = parts[0].match(/:(.*?);/);
    if (!mimeMatch) return s;
    var bin = atob(parts[1]);
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    var blobUrl = URL.createObjectURL(new Blob([arr], { type: mimeMatch[1] }));
    _headerFotoBlobUrls.push(blobUrl);
    return blobUrl;
  } catch (e) {
    return s;
  }
}

function esUrlImagenHotlinkRota(url) {
  var u = String(url || '').toLowerCase();
  return /fbcdn\.net|facebook\.com|instagram\.com|cdninstagram\.com|tiktokcdn\.com|tiktok\.com/.test(u);
}

function esImagenEncabezadoValida(url) {
  var f = String(url || '').trim();
  if (!f) return false;
  if (/^data:image\/(jpeg|png|webp);base64,/i.test(f)) return true;
  return !esUrlImagenHotlinkRota(f);
}

function sanitizarFotosEncabezado(fotos, usarDefaults) {
  var arr = Array.isArray(fotos) ? fotos : [];
  var limpias = arr.map(function(f) { return String(f || '').trim(); }).filter(esImagenEncabezadoValida);
  if (limpias.length) return limpias;
  return usarDefaults ? FOTOS_ENCABEZADO_DEFAULT.slice() : [];
}

function slidesCarruselValidos(carrusel) {
  return (carrusel || []).filter(function(s) {
    return s && String(s.imagen || '').trim();
  });
}

function resolverSlidesCarrusel(data) {
  var slides = slidesCarruselValidos(data && data.carrusel);
  return slides.length ? slides : CARRUSEL_DEFAULT.slice();
}

function preloadImagenCarrusel(url) {
  var src = String(url || '').trim();
  if (!src) return;
  var id = 'preload-carrusel-hero';
  var link = document.getElementById(id);
  if (!link) {
    link = document.createElement('link');
    link.id = id;
    link.rel = 'preload';
    link.as = 'image';
    document.head.appendChild(link);
  }
  if (link.getAttribute('href') !== src) link.setAttribute('href', src);
}

function esperarPrimeraImagenCarrusel(slider, callback) {
  if (!slider) { if (callback) callback(); return; }
  var primera = slider.querySelector('.slide.active .slide-img') || slider.querySelector('.slide-img');
  if (!primera || !primera.getAttribute('src')) { if (callback) callback(); return; }
  if (primera.complete && primera.naturalWidth > 0) { if (callback) callback(); return; }
  var listo = false;
  function done() {
    if (listo) return;
    listo = true;
    if (callback) callback();
  }
  primera.addEventListener('load', done, { once: true });
  primera.addEventListener('error', done, { once: true });
  setTimeout(done, 6000);
}

function detenerPresentationSlider() {
  if (initPresentationSlider._timer) {
    clearInterval(initPresentationSlider._timer);
    initPresentationSlider._timer = null;
  }
  if (initPresentationSlider._cleanupTimeout) {
    clearTimeout(initPresentationSlider._cleanupTimeout);
    initPresentationSlider._cleanupTimeout = null;
  }
}

function irAlSlideInicial(slider) {
  if (!slider) return;
  var slides = slider.querySelectorAll('.slide');
  var dots = slider.querySelectorAll('.slider-dots .dot');
  slides.forEach(function(s, i) {
    s.classList.remove('was-active');
    if (i === 0) s.classList.add('active');
    else s.classList.remove('active');
  });
  dots.forEach(function(d, i) {
    d.classList.toggle('active', i === 0);
  });
}

function detenerHeaderFotosCarrusel() {
  if (_headerFotosTimer) {
    clearInterval(_headerFotosTimer);
    _headerFotosTimer = null;
  }
}

function renderFotosEncabezado(data) {
  detenerHeaderFotosCarrusel();
  revocarHeaderFotoBlobs();
  if (_headerFotosResizeFn) {
    window.removeEventListener('resize', _headerFotosResizeFn);
    _headerFotosResizeFn = null;
  }

  var panel = asegurarPanelFotosEncabezado();
  if (!panel) return;

  var raw = (data && data.fotosEncabezado) ? data.fotosEncabezado : [];
  var fotos = sanitizarFotosEncabezado(raw, false);

  if (!fotos.length) {
    panel.innerHTML = '';
    panel.style.display = 'none';
    _headerFotosFingerprint = '';
    return;
  }

  var fpFotos = fingerprintFotosEncabezado(fotos);
  if (fpFotos === _headerFotosFingerprint && panel.querySelector('.header-fotos-track')) {
    return;
  }
  _headerFotosFingerprint = fpFotos;

  panel.style.removeProperty('display');

  var domFotos = fotos.map(urlImagenHeaderParaDom);
  var domClones = domFotos.slice(0, Math.min(3, domFotos.length));
  var todos = domFotos.concat(domClones);

  panel.innerHTML =
    '<div class="header-fotos-viewport">'
    + '<div class="header-fotos-track">'
    + todos.map(function(src, i) {
      return '<div class="header-foto-item"><img src="' + escHtml(src) + '" alt="REGPOL Callao foto ' + ((i % fotos.length) + 1) + '" decoding="async"'
        + (i < 3 ? ' fetchpriority="high"' : ' loading="lazy"') + '/></div>';
    }).join('')
    + '</div></div>';

  if (fotos.length <= 1) return;

  var track = panel.querySelector('.header-fotos-track');
  var viewport = panel.querySelector('.header-fotos-viewport');
  if (!track || !viewport) return;

  var offset = 0;
  var animando = false;

  function anchoItem() {
    var gap = 8;
    var vw = viewport.offsetWidth;
    return Math.max(60, Math.round((vw - gap * 2) / 3));
  }

  function pasoPx() {
    return anchoItem() + 8;
  }

  function ajustarItems() {
    var w = anchoItem();
    Array.prototype.forEach.call(track.children, function(el) {
      el.style.width = w + 'px';
      el.style.flexBasis = w + 'px';
    });
    track.style.transform = 'translate3d(-' + Math.round(offset * pasoPx()) + 'px,0,0)';
  }

  function avanzar() {
    if (animando || !track.children.length) return;
    animando = true;
    offset++;
    track.style.transform = 'translate3d(-' + Math.round(offset * pasoPx()) + 'px,0,0)';
    setTimeout(function() {
      animando = false;
      if (offset >= fotos.length) {
        track.style.transition = 'none';
        offset = 0;
        track.style.transform = 'translate3d(0,0,0)';
        requestAnimationFrame(function() {
          requestAnimationFrame(function() {
            track.style.transition = '';
          });
        });
      }
    }, HEADER_FOTOS_TRANSITION_MS + 50);
  }

  function iniciarAuto() {
    detenerHeaderFotosCarrusel();
    _headerFotosTimer = setInterval(avanzar, HEADER_FOTOS_INTERVAL_MS);
  }

  ajustarItems();
  _headerFotosResizeFn = function() {
    ajustarItems();
    if (!animando) {
      track.style.transition = 'none';
      track.style.transform = 'translate3d(-' + Math.round(offset * pasoPx()) + 'px,0,0)';
      void track.offsetHeight;
      track.style.transition = '';
    }
  };
  window.addEventListener('resize', _headerFotosResizeFn);

  panel.onmouseenter = detenerHeaderFotosCarrusel;
  panel.onmouseleave = iniciarAuto;
  setTimeout(iniciarAuto, 800);
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

function renderTarjetas(items, containerId) {
  var el = document.getElementById(containerId);
  if (!el) return;
  if (!items || !items.length) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = items.map(function(item) {
    var url = item.url || '#';
    var src = String(item.imagen || '').trim();
    var mediaHtml = src
      ? '<div class="card-modern-foto"><img src="' + escHtml(src) + '" alt="' + escHtml(item.titulo) + '" loading="lazy" decoding="async"/></div>'
      : '<div class="icon-wrapper" style="background:' + escHtml(item.color || '#004d3d') + ';">'
        + '<i class="fas ' + escHtml(item.icono || 'fa-file') + '"></i></div>';
    return '<a href="' + escHtml(url) + '">' +
      '<div class="card-modern' + (src ? ' card-modern--foto' : '') + '">' +
        mediaHtml +
        '<h4>' + escHtml(item.titulo) + '</h4>' +
        '<p>' + escHtml(item.descripcion) + '</p>' +
        '<span class="card-estado" style="color:' + escHtml(item.estadoColor || 'green') + ';">' +
          escHtml(item.estado) +
        '</span>' +
      '</div></a>';
  }).join('');
}

function renderPdfList(items, containerId) {
  cargarResultadosPdfPortal(containerId.indexOf('curso') >= 0 ? 'curso' : 'convenio', containerId);
}

function cargarResultadosPdfPortal(tipo, containerId) {
  var el = document.getElementById(containerId);
  if (!el) return;
  var base = apiBasePortal();
  if (base === null || base === undefined) base = '';
  fetch((base || '') + '/portal/resultados-pdf?tipo=' + encodeURIComponent(tipo))
    .then(function(r) { return r.json(); })
    .then(function(d) {
      renderPdfCajas(d.ok && d.resultados ? d.resultados : [], containerId, tipo);
    })
    .catch(function() {
      if (el) el.innerHTML = '<p class="texto-vacio">No hay documentos publicados.</p>';
    });
}

function renderPdfCajas(items, containerId, tipo) {
  var el = document.getElementById(containerId);
  var secId = tipo === 'curso' ? 'section-pdf-cursos' : 'section-pdf-convenios';
  var sec = document.getElementById(secId);
  if (!el) return;
  if (!items || !items.length) {
    el.innerHTML = '';
    if (sec) sec.style.display = 'none';
    return;
  }
  if (sec) sec.style.display = '';
  el.innerHTML = items.map(function(item) {
    return '<div class="grid-pdf-modern"><div class="pdf-item pdf-item-caja">' +
      '<i class="fas fa-file-pdf pdf-item-icono"></i>' +
      '<div class="pdf-item-body">' +
      '<h5>' + escHtml(item.titulo) + '</h5>' +
      (item.item_titulo ? '<p class="pdf-item-sub">' + escHtml(item.item_titulo) + '</p>' : '') +
      '<div class="pdf-item-acciones">' +
      '<button type="button" class="btn-pdf-ver" onclick="verPdfPortal(' + item.id + ')">' +
      '<i class="fas fa-eye"></i> VER PDF</button>' +
      '<button type="button" class="btn-pdf-desc" onclick="descargarPdfPortal(' + item.id + ')">' +
      '<i class="fas fa-download"></i> DESCARGAR</button>' +
      '</div></div></div></div>';
  }).join('');
}

function verPdfPortal(id, titulo) {
  var base = apiBasePortal();
  fetch((base || '') + '/portal/resultados-pdf/' + id)
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (!d.ok || !d.resultado || !d.resultado.pdf_data) {
        alert('No se pudo cargar el PDF.');
        return;
      }
      abrirModalPdfPortal(d.resultado.pdf_data, titulo || d.resultado.titulo || 'Documento PDF');
    })
    .catch(function() { alert('Error de conexión.'); });
}

function descargarPdfPortal(id) {
  var base = apiBasePortal();
  fetch((base || '') + '/portal/resultados-pdf/' + id)
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (!d.ok || !d.resultado || !d.resultado.pdf_data) {
        alert('No se pudo descargar el PDF.');
        return;
      }
      descargarDataUrlPdf(d.resultado.pdf_data, d.resultado.pdf_nombre || 'resultado.pdf');
    });
}

function descargarDataUrlPdf(dataUrl, nombre) {
  var a = document.createElement('a');
  a.href = dataUrl;
  a.download = nombre || 'documento.pdf';
  a.click();
}

function abrirModalPdfPortal(dataUrl, titulo) {
  var modal = document.getElementById('modal-pdf-portal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-pdf-portal';
    modal.className = 'modal-pdf-portal';
    modal.innerHTML = '<div class="modal-pdf-portal-box">' +
      '<div class="modal-pdf-portal-head">' +
      '<strong id="modal-pdf-portal-titulo"></strong>' +
      '<button type="button" onclick="cerrarModalPdfPortal()" aria-label="Cerrar">&times;</button>' +
      '</div>' +
      '<iframe id="modal-pdf-portal-frame" title="Vista previa PDF"></iframe>' +
      '<div class="modal-pdf-portal-foot">' +
      '<button type="button" class="btn-pdf-desc" id="modal-pdf-portal-desc"><i class="fas fa-download"></i> DESCARGAR PDF</button>' +
      '</div></div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function(e) {
      if (e.target === modal) cerrarModalPdfPortal();
    });
  }
  document.getElementById('modal-pdf-portal-titulo').textContent = titulo || 'Documento PDF';
  document.getElementById('modal-pdf-portal-frame').src = dataUrl;
  var btnDesc = document.getElementById('modal-pdf-portal-desc');
  btnDesc.onclick = function() { descargarDataUrlPdf(dataUrl, (titulo || 'documento') + '.pdf'); };
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function cerrarModalPdfPortal() {
  var modal = document.getElementById('modal-pdf-portal');
  if (!modal) return;
  modal.classList.remove('open');
  var frame = document.getElementById('modal-pdf-portal-frame');
  if (frame) frame.src = 'about:blank';
  document.body.style.overflow = '';
}


function htmlPaginaHeroBanner(opts) {
  opts = opts || {};
  var tipo = opts.tipo || 'resena';
  var titulo = opts.titulo || '';
  var subtitulo = opts.subtitulo || '';
  var imagen = String(opts.imagen || '').trim();
  var icono = opts.icono || 'fa-landmark';
  if (opts.soloImagen) {
    if (!imagen) return '';
    return '<div class="pagina-hero-banner pagina-hero-banner--solo-img hero-' + escHtml(tipo) + '">'
      + '<img class="pagina-hero-img" src="' + escHtml(imagen) + '" alt="' + escHtml(titulo) + '" loading="lazy" decoding="async"/>'
      + '</div>';
  }
  var imgHtml = imagen
    ? '<img class="pagina-hero-img" src="' + escHtml(imagen) + '" alt="' + escHtml(titulo) + '" loading="lazy" decoding="async"/>'
    : '';
  var subHtml = subtitulo ? '<p>' + escHtml(subtitulo) + '</p>' : '';
  return '<div class="pagina-hero-banner hero-' + escHtml(tipo) + '">'
    + imgHtml
    + '<div class="pagina-hero-overlay"></div>'
    + '<div class="pagina-hero-contenido">'
    + '<div class="pagina-hero-icono"><i class="fas ' + escHtml(icono) + '"></i></div>'
    + '<div class="pagina-hero-texto"><h2>' + escHtml(titulo) + '</h2>' + subHtml + '</div>'
    + '</div></div>';
}

function normalizarParrafoResena(p) {
  if (!p) return { titulo: '', texto: '', imagen: '' };
  if (typeof p === 'string') return { titulo: '', texto: p.trim(), imagen: '' };
  return {
    titulo: String(p.titulo || '').trim(),
    texto: String(p.texto || p.parrafo || '').trim(),
    imagen: String(p.imagen || '').trim()
  };
}

function normalizarParrafosResena(list) {
  return (list || []).map(normalizarParrafoResena);
}

function imagenResenaPreferida(domImg, memImg) {
  var d = String(domImg || '').trim();
  var m = String(memImg || '').trim();
  if (d.indexOf('/portal/resena-imagen/') === 0) return d;
  if (m.indexOf('/portal/resena-imagen/') === 0) return m;
  if (d.indexOf('data:') === 0 && m && m.indexOf('data:') !== 0) return m;
  return d || m;
}

function mergeParrafosResena(desdeDom, desdeMem) {
  var mem = normalizarParrafosResena(desdeMem || []);
  var dom = normalizarParrafosResena(desdeDom || []);
  var n = Math.max(dom.length, mem.length);
  var out = [];
  var i;
  for (i = 0; i < n; i++) {
    var d = dom[i] || {};
    var m = mem[i] || {};
    out.push({
      titulo: String(d.titulo || m.titulo || '').trim(),
      texto: String(d.texto || m.texto || '').trim(),
      imagen: imagenResenaPreferida(d.imagen, m.imagen)
    });
  }
  return out;
}

function urlPublicaResenaImagen(path) {
  var s = String(path || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (s.indexOf('/portal/resena-imagen/') === 0) {
    return (apiBasePortal() || '') + s + (s.indexOf('?') === -1 ? '?t=' + Date.now() : '');
  }
  return s;
}

var _resenaCarruselTimer = null;
var _resenaSlideBlobUrls = [];

function revocarResenaSlideBlobs() {
  _resenaSlideBlobUrls.forEach(function(u) {
    try { URL.revokeObjectURL(u); } catch (e) {}
  });
  _resenaSlideBlobUrls = [];
}

function urlImagenResenaSlideParaDom(src) {
  var s = String(src || '').trim();
  if (!s) return '';
  if (s.indexOf('/portal/resena-imagen/') === 0) return urlPublicaResenaImagen(s);
  if (s.indexOf('data:image/') !== 0) return s;
  try {
    var parts = s.split(',');
    if (parts.length < 2) return s;
    var mimeMatch = parts[0].match(/:(.*?);/);
    if (!mimeMatch) return s;
    var bin = atob(parts[1]);
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    var blobUrl = URL.createObjectURL(new Blob([arr], { type: mimeMatch[1] }));
    _resenaSlideBlobUrls.push(blobUrl);
    return blobUrl;
  } catch (e) {
    return s;
  }
}

function construirSlidesResena(sec) {
  var slides = [];
  var intro = String(sec.intro || '').trim();
  var introImg = String(sec.imagenBanner || '').trim();
  var introTitulo = String(sec.introTitulo || 'Introducción').trim() || 'Introducción';
  if (intro || introImg) {
    slides.push({ titulo: introTitulo, texto: intro, imagen: introImg });
  }
  var parrafos = normalizarParrafosResena(sec.parrafos).filter(function(p) {
    return p.titulo || p.texto || p.imagen;
  });
  return slides.concat(parrafos);
}

function htmlTextoResenaSlide(texto) {
  var t = String(texto || '').trim();
  if (!t) return '';
  var parts = t.split(/\s*[\u2022\u00B7•]\s*/);
  if (parts.length <= 1) {
    return '<p class="resena-slide-parrafo">' + escHtml(t) + '</p>';
  }
  var intro = parts[0].trim();
  var items = parts.slice(1).map(function(s) { return s.trim(); }).filter(Boolean);
  var html = '';
  if (intro) html += '<p class="resena-slide-parrafo resena-slide-intro">' + escHtml(intro) + '</p>';
  if (items.length) {
    html += '<ul class="resena-slide-lista">';
    items.forEach(function(item) {
      html += '<li>' + escHtml(item) + '</li>';
    });
    html += '</ul>';
  }
  return html;
}

function htmlResenaCarruselSlide(p, i, isActive) {
  var num = String(i + 1).padStart(2, '0');
  var imgSrc = p.imagen ? urlImagenResenaSlideParaDom(p.imagen) : '';
  var mediaHtml = imgSrc
    ? '<div class="resena-slide-media"><img src="' + escHtml(imgSrc) + '" alt="' + escHtml(p.titulo || ('Bloque ' + num)) + '" loading="lazy" decoding="async"/></div>'
    : '';
  var tituloHtml = p.titulo
    ? '<h3 class="resena-slide-titulo">' + escHtml(p.titulo) + '</h3>'
    : '';
  return '<article class="resena-carrusel-slide institucional-bloque' + (isActive ? ' active' : '') + '" data-idx="' + i + '" aria-hidden="' + (isActive ? 'false' : 'true') + '">'
    + '<div class="resena-slide-inner' + (imgSrc ? ' resena-slide-inner--con-img' : '') + '">'
    + mediaHtml
    + '<div class="resena-slide-body">'
    + '<span class="institucional-num" aria-hidden="true">' + num + '</span>'
    + tituloHtml
    + (p.texto ? htmlTextoResenaSlide(p.texto) : '')
    + '</div></div></article>';
}

function detenerResenaCarrusel() {
  if (_resenaCarruselTimer) {
    clearInterval(_resenaCarruselTimer);
    _resenaCarruselTimer = null;
  }
}

function initResenaHistoricaCarrusel() {
  detenerResenaCarrusel();
  var root = document.getElementById('resena-carrusel');
  if (!root) return;
  var track = root.querySelector('.resena-carrusel-track');
  var slides = root.querySelectorAll('.resena-carrusel-slide');
  var btnPrev = root.querySelector('.resena-carrusel-btn.prev');
  var btnNext = root.querySelector('.resena-carrusel-btn.next');
  if (!track || !slides.length) return;

  var current = 0;

  function irA(idx) {
    if (!slides.length) return;
    current = (idx + slides.length) % slides.length;
    track.style.transform = 'translate3d(-' + (current * 100) + '%,0,0)';
    root.querySelectorAll('.resena-carrusel-dot').forEach(function(dot, i) {
      dot.classList.toggle('active', i === current);
      dot.setAttribute('aria-selected', i === current ? 'true' : 'false');
    });
    slides.forEach(function(sl, i) {
      sl.classList.toggle('active', i === current);
      sl.setAttribute('aria-hidden', i === current ? 'false' : 'true');
    });
  }

  if (slides.length < 2) {
    if (btnPrev) btnPrev.style.display = 'none';
    if (btnNext) btnNext.style.display = 'none';
    var dotsOnly = root.querySelector('.resena-carrusel-dots');
    if (dotsOnly) dotsOnly.style.display = 'none';
    irA(0);
    return;
  }

  if (btnPrev) {
    btnPrev.style.display = '';
    btnPrev.onclick = function() { irA(current - 1); reiniciarAuto(); };
  }
  if (btnNext) {
    btnNext.style.display = '';
    btnNext.onclick = function() { irA(current + 1); reiniciarAuto(); };
  }
  root.querySelectorAll('.resena-carrusel-dot').forEach(function(dot) {
    dot.onclick = function() {
      irA(parseInt(dot.getAttribute('data-idx'), 10) || 0);
      reiniciarAuto();
    };
  });

  function reiniciarAuto() {
    detenerResenaCarrusel();
    _resenaCarruselTimer = setInterval(function() { irA(current + 1); }, 7000);
  }

  root.onmouseenter = detenerResenaCarrusel;
  root.onmouseleave = reiniciarAuto;
  irA(0);
  reiniciarAuto();
}

function renderResenaHistorica(data, containerId) {
  var el = document.getElementById(containerId);
  var sec = data.resenaHistorica;
  if (!el || !sec) return;
  detenerResenaCarrusel();
  revocarResenaSlideBlobs();
  var slides = construirSlidesResena(sec);
  var html = '<article class="institucional-page institucional-resena institucional-resena--carrusel">';

  if (slides.length) {
    html += '<div class="resena-carrusel resena-carrusel--completo" id="resena-carrusel" aria-label="Reseña histórica">';
    html += '<button type="button" class="resena-carrusel-btn prev" aria-label="Anterior"><i class="fas fa-chevron-left"></i></button>';
    html += '<div class="resena-carrusel-viewport"><div class="resena-carrusel-track">';
    slides.forEach(function(p, i) {
      html += htmlResenaCarruselSlide(p, i, i === 0);
    });
    html += '</div></div>';
    html += '<button type="button" class="resena-carrusel-btn next" aria-label="Siguiente"><i class="fas fa-chevron-right"></i></button>';
    html += '<div class="resena-carrusel-dots" role="tablist">';
    slides.forEach(function(p, i) {
      html += '<button type="button" class="resena-carrusel-dot' + (i === 0 ? ' active' : '') + '" data-idx="' + i + '" role="tab" aria-label="Diapositiva ' + (i + 1) + '" aria-selected="' + (i === 0 ? 'true' : 'false') + '"></button>';
    });
    html += '</div></div>';
  } else {
    html += '<p class="texto-vacio">Contenido de reseña histórica en preparación.</p>';
  }

  html += '</article>';
  el.innerHTML = html;
  if (slides.length) initResenaHistoricaCarrusel();
}

function renderNuestraLabor(data, containerId) {
  var el = document.getElementById(containerId);
  var sec = data.nuestraLabor;
  if (!el || !sec) return;
  var html = '<article class="institucional-page institucional-labor">';
  html += htmlPaginaHeroBanner({
    tipo: 'labor',
    titulo: sec.titulo || 'Nuestra Labor',
    imagen: sec.imagenBanner,
    soloImagen: true
  });
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

function bienestarPolicialDefault() {
  return {
    tituloSeccion: 'BIENESTAR POLICIAL',
    titulo: 'EVALUACIÓN PSICOLÓGICA — PROGRAMA DE BIENESTAR',
    descripcion: 'Acceda al cuestionario institucional (MMPI-2) y complete su registro de identificación para la Oficina de Psicología de la REGPOL Callao.',
    icono: 'fa-heart',
    botonTexto: 'INICIAR EVALUACIÓN',
    botonUrl: 'evaluacion.html',
    videoTutorial: '',
    videoTutorialTitulo: 'Video tutorial — Cómo usar el cuestionario',
    visible: true
  };
}

function urlVideoBienestarPortal(path) {
  var p = String(path || '/portal/bienestar-video').trim();
  if (!p) return '';
  if (/^https?:\/\//i.test(p)) return p;
  var base = apiBasePortal() || '';
  return base + p + (p.indexOf('?') === -1 ? '?t=' + Date.now() : '');
}

function renderBienestarPolicial(data, containerId) {
  var el = document.getElementById(containerId);
  var secWrap = document.getElementById('bienestar');
  var sec = (data && data.bienestarPolicial) ? data.bienestarPolicial : bienestarPolicialDefault();
  if (secWrap) secWrap.style.display = (sec.visible === false) ? 'none' : '';
  var tituloSec = document.getElementById('bienestar-titulo-seccion');
  if (tituloSec) tituloSec.textContent = sec.tituloSeccion || 'BIENESTAR POLICIAL';
  if (!el) return;
  if (sec.visible === false) { el.innerHTML = ''; return; }
  var icono = sec.icono || 'fa-heart';
  var url = sec.botonUrl || 'evaluacion.html';
  if (/evaluacion\.html$/i.test(url.split('?')[0])) {
    url = 'evaluacion.html?inicio=1';
  }
  var html = '';
  if (sec.videoTutorial) {
    var videoSrc = urlVideoBienestarPortal(sec.videoTutorial);
    var videoTitulo = (sec.videoTutorialTitulo || 'Video tutorial — Cómo usar el cuestionario').trim();
    html += '<div class="bienestar-video-wrap">'
      + (videoTitulo ? '<p class="bienestar-video-titulo"><i class="fas fa-play-circle"></i> ' + escHtml(videoTitulo) + '</p>' : '')
      + '<video class="bienestar-video" controls playsinline preload="metadata" '
      + 'src="' + escHtml(videoSrc) + '">'
      + 'Su navegador no puede reproducir este video.</video>'
      + '</div>';
  }
  html += '<div class="bienestar-home-card">'
    + '<i class="fas ' + escHtml(icono) + '" style="font-size:36px;color:#c8a94a;margin-bottom:12px;"></i>'
    + '<h4>' + escHtml(sec.titulo || '') + '</h4>'
    + '<p>' + escHtml(sec.descripcion || '') + '</p>'
    + '<a href="' + escHtml(url) + '" class="btn-bienestar"><i class="fas fa-clipboard-check"></i> '
    + escHtml(sec.botonTexto || 'INICIAR EVALUACIÓN') + '</a>'
    + '</div>';
  el.innerHTML = html;
}

var _novedadesCache = [];

var MESES_NOVEDAD = {
  ene: 0, enero: 0, feb: 1, febrero: 1, mar: 2, marzo: 2,
  abr: 3, abril: 3, may: 4, mayo: 4, jun: 5, junio: 5,
  jul: 6, julio: 6, ago: 7, agosto: 7, sep: 8, sept: 8, septiembre: 8,
  oct: 9, octubre: 9, nov: 10, noviembre: 10, dic: 11, diciembre: 11
};

function parseFechaNovedad(fecha) {
  var s = String(fecha || '').trim().toLowerCase();
  if (!s) return NaN;
  var iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return Date.UTC(+iso[1], +iso[2] - 1, +iso[3]);
  var dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmy) return Date.UTC(+dmy[3], +dmy[2] - 1, +dmy[1]);
  var norm = s.replace(/\./g, '').replace(/\s+/g, '');
  var compact = norm.match(/^(\d{1,2})([a-z\u00e1\u00e9\u00ed\u00f3\u00fa\u00f1]+)(\d{4})$/i);
  if (compact) {
    var mesC = MESES_NOVEDAD[compact[2].substring(0, 3)] ?? MESES_NOVEDAD[compact[2]];
    if (mesC !== undefined) return Date.UTC(+compact[3], mesC, +compact[1]);
  }
  var spaced = s.match(/^(\d{1,2})\s+([a-z\u00e1\u00e9\u00ed\u00f3\u00fa\u00f1\.]+)\s+(\d{4})$/i);
  if (spaced) {
    var mesS = MESES_NOVEDAD[spaced[2].replace(/\./g, '').substring(0, 3)];
    if (mesS !== undefined) return Date.UTC(+spaced[3], mesS, +spaced[1]);
  }
  var t = Date.parse(fecha);
  return isNaN(t) ? NaN : t;
}

function timestampIngresoNovedad(n) {
  if (!n) return 0;
  var m = String(n.id || '').match(/nov-(\d+)/);
  return m ? +m[1] : 0;
}

function ordenarNovedadesPorFecha(items) {
  return (items || []).slice().sort(function(a, b) {
    var ta = parseFechaNovedad(a && a.fecha);
    var tb = parseFechaNovedad(b && b.fecha);
    var aValid = !isNaN(ta);
    var bValid = !isNaN(tb);
    if (aValid && bValid && ta !== tb) return tb - ta;
    if (aValid && !bValid) return -1;
    if (!aValid && bValid) return 1;
    return timestampIngresoNovedad(b) - timestampIngresoNovedad(a);
  });
}

function imagenNovedad(n) {
  if (!n) return '';
  return String(n.imagen || n.foto || n.imagenUrl || '').trim();
}

function renderNovedades(data, containerId, limite) {
  var el = document.getElementById(containerId);
  if (!el) return;
  var items = ordenarNovedadesPorFecha(data.novedades || []);
  _novedadesCache = items;
  if (limite) items = items.slice(0, limite);
  if (!items.length) { el.innerHTML = '<p class="texto-vacio">Sin novedades publicadas.</p>'; return; }
  if (limite) {
    el.innerHTML = '<div class="novedades-portada-lista">' + items.map(function(n, idx) {
      var src = imagenNovedad(n);
      var fotoHtml = src
        ? '<div class="noticia-foto"><img src="' + escHtml(src) + '" alt="' + escHtml(n.titulo) + '" loading="lazy" decoding="async"/></div>'
        : '';
      return '<article class="noticia-card' + (src ? ' noticia-card-foto' : '') + '" onclick="abrirNovedadDetalle(' + idx + ')" style="cursor:pointer;">'
        + fotoHtml
        + '<div class="noticia-contenido">'
        + '<div class="noticia-meta"><span class="noticia-cat">' + escHtml(n.categoria) + '</span>'
        + '<span class="noticia-fecha">' + escHtml(n.fecha) + '</span></div>'
        + '<h3>' + escHtml(n.titulo) + '</h3>'
        + '<p>' + escHtml(n.resumen) + '</p>'
        + '</div></article>';
    }).join('') + '</div>';
  } else {
    el.innerHTML = '<div class="novedades-grid">' + items.map(function(n, idx) {
      var src = imagenNovedad(n);
      var imgHtml = src
        ? '<img class="nov-card-img-photo" src="' + escHtml(src) + '" alt="' + escHtml(n.titulo) + '" loading="lazy" decoding="async"/>'
        : '';
      return '<article class="nov-card" onclick="abrirNovedadDetalle(' + idx + ')">'
        + '<div class="nov-card-img' + (src ? '' : ' nov-card-img--vacio') + '">'
        + imgHtml
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
  var heroHtml = imagenNovedad(n)
    ? '<div class="modal-nov-hero"><img src="' + escHtml(imagenNovedad(n)) + '" alt="' + escHtml(n.titulo) + '"/></div>'
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

function initPresentationSlider() {
  detenerPresentationSlider();
  var slider = document.querySelector('.presentation-slider');
  if (!slider) return;
  var slides = slider.querySelectorAll('.slide');
  var dots = slider.querySelectorAll('.slider-dots .dot');
  if (!slides.length) {
    slider.classList.add('slider-sin-imagenes');
    return;
  }
  slider.classList.remove('slider-esperando-api', 'slider-sin-imagenes');
  irAlSlideInicial(slider);

  var FADE_MS = 1200;
  var current = 0;
  var timer = null;

  function changeSlide(index) {
    if (index < 0 || index >= slides.length || index === current) return;
    var prev = slides[current];
    var next = slides[index];
    if (!next || prev === next) return;

    slides.forEach(function(s) {
      if (s !== prev && s !== next) s.classList.remove('active', 'was-active');
    });
    if (prev) {
      prev.classList.remove('active');
      prev.classList.add('was-active');
    }
    next.classList.remove('was-active');
    next.classList.add('active');

    dots.forEach(function(d) { d.classList.remove('active'); });
    if (dots[index]) dots[index].classList.add('active');

    if (initPresentationSlider._cleanupTimeout) {
      clearTimeout(initPresentationSlider._cleanupTimeout);
    }
    if (prev) {
      initPresentationSlider._cleanupTimeout = setTimeout(function() {
        prev.classList.remove('was-active');
        initPresentationSlider._cleanupTimeout = null;
      }, FADE_MS + 80);
    }
    current = index;
  }

  function nextSlide() {
    changeSlide((current + 1) % slides.length);
  }

  function startAuto() {
    clearInterval(timer);
    timer = setInterval(nextSlide, 6000);
  }

  dots.forEach(function(dot) {
    dot.onclick = function() {
      changeSlide(parseInt(dot.getAttribute('data-slide'), 10) || 0);
      startAuto();
    };
  });

  window.irASlide = changeSlide;
  startAuto();
  initPresentationSlider._timer = timer;
}

function actualizarCarrusel(data) {
  data = data || {};
  var slides = resolverSlidesCarrusel(data);
  var heroT  = data.heroTexto || {};
  var slider = document.querySelector('.presentation-slider');
  if (!slider) return;

  aplicarHeroMarca(heroT);

  var slidesDiv = slider.querySelector('.slides');
  var dotsDiv   = slider.querySelector('.slider-dots');
  if (!slidesDiv) return;

  if (!slides.length) {
    detenerPresentationSlider();
    slidesDiv.innerHTML = '';
    if (dotsDiv) dotsDiv.innerHTML = '';
    slider.classList.add('slider-sin-imagenes');
    slider.classList.remove('slider-esperando-api');
    _carruselFingerprint = '';
    return;
  }

  var fp = fingerprintCarruselSlides(slides);
  var slideCount = slider.querySelectorAll('.slide').length;
  if (fp === _carruselFingerprint && slideCount === slides.length) {
    irAlSlideInicial(slider);
    slider.classList.remove('slider-esperando-api');
    if (!initPresentationSlider._timer) initPresentationSlider();
    return;
  }
  _carruselFingerprint = fp;
  var gen = ++_carruselInitGen;

  detenerPresentationSlider();
  preloadImagenCarrusel(slides[0].imagen);
  slider.classList.remove('slider-sin-imagenes');
  slidesDiv.innerHTML = slides.map(function(s, i) {
    var isActive = i === 0 ? ' active' : '';
    var imgSrc = String(s.imagen || '').trim();
    var imgTag = '<img src="' + imgSrc + '" alt="' + escHtml(s.titulo || '') + '" class="slide-img" width="1920" height="1080" '
      + (i === 0 ? 'decoding="async" fetchpriority="high"' : 'loading="lazy" decoding="async"') + '>';
    var caption = (s.titulo || s.subtitulo)
      ? '<div class="slide-caption"><strong>' + escHtml(s.titulo || '') + '</strong>'
        + (s.subtitulo ? '<span>' + escHtml(s.subtitulo) + '</span>' : '') + '</div>'
      : '';
    return '<div class="slide' + isActive + '">' + imgTag + caption + '</div>';
  }).join('');

  if (dotsDiv) {
    dotsDiv.innerHTML = slides.length > 1
      ? slides.map(function(s, i) {
        return '<span class="dot' + (i === 0 ? ' active' : '') + '" data-slide="' + i
          + '" aria-label="Imagen ' + (i + 1) + '"></span>';
      }).join('')
      : '';
    dotsDiv.querySelectorAll('.dot').forEach(function(dot) {
      dot.addEventListener('click', function() {
        if (typeof window.irASlide === 'function') {
          window.irASlide(parseInt(this.getAttribute('data-slide'), 10) || 0);
        }
      });
    });
  }
  if (gen !== _carruselInitGen) return;
  irAlSlideInicial(slider);
  slider.classList.remove('slider-esperando-api');
  initPresentationSlider();
}

function actualizarFechaPortal(data) {
  var el = document.getElementById('fecha-actualizacion-portal');
  if (el && data.actualizacion) el.textContent = '\u00daLTIMA ACTUALIZACI\u00d3N: ' + data.actualizacion;
}

function initPortalPagina(config) {
  config = config || {};
  initPortalNav(config.activeNav || '');
  aplicarHeroMarca();
  var pre = obtenerSiteDataSync();
  if (pre) {
    aplicarPortalConfig(config, pre);
  }
  return cargarSiteData().then(function(fresh) {
    if (fresh) aplicarPortalConfig(config, fresh);
    return fresh;
  });
}

function renderUnidadesPublico(data) {
  var cont = document.getElementById('contenedor-unidades');
  var msg  = document.getElementById('msg-cargando-unidades') || document.getElementById('msg-cargando');
  if (!cont) return;
  if (!data || !data.ok || !data.divisiones || !data.divisiones.length) {
    if (msg) msg.innerHTML = '<i class="fas fa-exclamation-circle"></i> No se pudo cargar la información.';
    return;
  }
  if (msg) msg.style.display = 'none';
  var html = '';
  data.divisiones.forEach(function(div) {
    if (!div.unidades || !div.unidades.length) return;
    html += '<div class="unidades-seccion">'
      + '<h3 class="unidades-seccion-titulo"><i class="fas fa-shield-alt"></i> ' + escHtml(div.nombre) + '</h3>'
      + '<div class="tabla-unidades-wrap"><table class="tabla-unidades">'
      + '<colgroup>'
      + '<col style="width:38px"/>'
      + '<col style="width:22%"/>'
      + '<col style="width:auto"/>'
      + '<col style="width:130px"/>'
      + '<col style="width:110px"/>'
      + '</colgroup>'
      + '<thead><tr>'
      + '<th style="text-align:center;">#</th>'
      + '<th>Comisaria / Unidad</th>'
      + '<th>Dirección</th>'
      + '<th style="text-align:center;">Teléfono</th>'
      + '<th style="text-align:center;">Mapa</th>'
      + '</tr></thead><tbody>';
    div.unidades.forEach(function(u, i) {
      var mapsUrl = u.direccion
        ? 'https://www.google.com/maps/search/' + encodeURIComponent(u.direccion + ', Callao, Peru')
        : '';
      var mapsBtn = mapsUrl
        ? '<a href="' + mapsUrl + '" target="_blank" rel="noopener noreferrer" class="btn-mapa" title="Ver en Google Maps"><i class="fas fa-map-marker-alt"></i> Ver mapa</a>'
        : '<span class="sin-dato">-</span>';
      var tel = u.telefono
        ? '<a href="tel:' + escHtml(u.telefono) + '" class="tel-link">' + escHtml(u.telefono) + '</a>'
        : '<span class="sin-dato">-</span>';
      html += '<tr>'
        + '<td class="td-num" data-label="N°">' + (i + 1) + '</td>'
        + '<td class="td-nombre" data-label="Unidad">' + escHtml(u.nombre) + '</td>'
        + '<td class="td-dir" data-label="Dirección">' + (u.direccion ? escHtml(u.direccion) : '<span class="sin-dato">No disponible</span>') + '</td>'
        + '<td class="td-tel" data-label="Teléfono" style="text-align:center;">' + tel + '</td>'
        + '<td class="td-mapa" data-label="Mapa" style="text-align:center;">' + mapsBtn + '</td>'
        + '</tr>';
    });
    html += '</tbody></table></div></div>';
  });
  cont.innerHTML = html;
}

function initUnidadesPagina() {
  initPortalNav('unidades');
  cargarUnidadesPublico();
}

function cargarUnidadesPublico() {
  var cont = document.getElementById('contenedor-unidades');
  if (!cont) return;
  var msg = document.getElementById('msg-cargando-unidades') || document.getElementById('msg-cargando');
  if (msg) { msg.style.display = ''; msg.textContent = 'Cargando unidades...'; }
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

function cargarSorteosPortal() {
  var base = apiBasePortal() || '';
  fetch(base + '/portal/sorteos')
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (!d.ok) return;
      var proximos = (d.sorteos || []).filter(function(s) { return s.tipo === 'proximo'; });
      var resultados = (d.sorteos || []).filter(function(s) { return s.tipo === 'resultado'; });
      renderSorteosProximos(proximos);
      renderSorteosResultados(resultados);
    })
    .catch(function() {});
}

function renderSorteosProximos(list) {
  var sec = document.getElementById('seccion-proximos');
  var grid = document.getElementById('grid-proximos');
  if (!sec || !grid || !list.length) return;
  sec.style.display = '';
  grid.innerHTML = list.map(function(s) {
    var imgHtml = s.imagen
      ? '<img src="' + escHtml(s.imagen) + '" alt="' + escHtml(s.titulo) + '"/>'
      : '<div class="sorteo-placeholder"><i class="fas fa-random"></i><span style="font-size:12px;font-weight:700;">PR\u00d3XIMO SORTEO</span></div>';
    return '<div class="sorteo-flyer">'
      + '<div class="sorteo-flyer-img">' + imgHtml
      + '<span class="sorteo-flyer-badge">CONVOCATORIA</span></div>'
      + '<div class="sorteo-flyer-body">'
      + (s.fecha_sorteo ? '<div class="sorteo-flyer-fecha"><i class="fas fa-calendar-alt"></i> ' + escHtml(s.fecha_sorteo) + '</div>' : '')
      + '<div class="sorteo-flyer-titulo">' + escHtml(s.titulo) + '</div>'
      + (s.descripcion ? '<div class="sorteo-flyer-desc">' + escHtml(s.descripcion) + '</div>' : '')
      + '</div></div>';
  }).join('');
}

function renderSorteosResultados(list) {
  var sec = document.getElementById('seccion-resultados');
  var cont = document.getElementById('lista-resultados');
  if (!sec || !cont || !list.length) return;
  sec.style.display = '';
  cont.innerHTML = list.map(function(s) {
    var filas = (s.resultados || []).map(function(r, i) {
      return '<tr><td style="text-align:center;"><span class="resultado-nro">' + (i + 1) + '</span></td>'
        + '<td><div class="resultado-nombre">' + escHtml(r.nombres) + '</div></td>'
        + '<td><div class="resultado-unidad">' + escHtml(r.unidad || '') + '</div></td></tr>';
    }).join('');
    return '<div class="resultado-card"><div class="resultado-header"><i class="fas fa-trophy"></i>'
      + '<div class="resultado-header-info"><strong>' + escHtml(s.titulo) + '</strong></div></div>'
      + '<table class="resultado-tabla"><thead><tr><th>#</th><th>Nombres</th><th>Unidad</th></tr></thead><tbody>'
      + filas + '</tbody></table></div>';
  }).join('');
}

function initPortalInicio() {
  var navInicial = navDesdeHash() || 'inicio';
  window.addEventListener('pageshow', function(ev) {
    if (!ev.persisted) return;
    var slider = document.querySelector('.presentation-slider');
    if (!slider) return;
    detenerPresentationSlider();
    irAlSlideInicial(slider);
    if (slider.querySelectorAll('.slide').length) initPresentationSlider();
  });
  return initPortalPagina({
    activeNav: navInicial,
    renderNovedades: 'lista-novedades',
    actualizarFecha: true,
    actualizarCarrusel: true,
    renderConvenios: 'grid-convenios',
    renderCursos: 'grid-cursos',
    renderConveniosPdf: 'lista-pdf-convenios',
    renderCursosPdf: 'lista-pdf-cursos',
    renderResena: 'contenido-resena',
    renderLabor: 'contenido-labor',
    renderBienestar: 'contenido-bienestar'
  }).then(function(data) {
    cargarSorteosPortal();
    cargarUnidadesPublico();
    var hash = navDesdeHash();
    if (hash) setTimeout(function() { scrollASeccion(hash); }, 300);
    return data;
  });
}

function aplicarNavOcultos(ocultos) {
  if (!ocultos) ocultos = [];
  portalNavOcultosCache = ocultos;
  var mapaSecciones = {
    inicio: 'inicio',
    novedades: 'novedades',
    convenios: 'convenios',
    cursos: 'cursos',
    bienestar: 'bienestar',
    resena: 'resena',
    labor: 'labor',
    unidades: 'unidades'
  };
  Object.keys(mapaSecciones).forEach(function(id) {
    var sec = document.getElementById(mapaSecciones[id]);
    if (sec) sec.style.display = ocultos.indexOf(id) !== -1 ? 'none' : '';
  });
  document.querySelectorAll('[data-nav-id]').forEach(function(el) {
    var id = el.getAttribute('data-nav-id');
    el.style.display = ocultos.indexOf(id) !== -1 ? 'none' : '';
  });
  initPortalNav(portalActiveNavId, ocultos);
}
