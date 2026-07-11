
var cmsDataActual = null;
var cmsModalGuardarFn = null;

var CMS_ICONOS = [
  { v: 'fa-shield-alt',     l: 'Escudo' },
  { v: 'fa-users',          l: 'Personas' },
  { v: 'fa-search',         l: 'Lupa' },
  { v: 'fa-laptop',         l: 'Computadora' },
  { v: 'fa-bus',            l: 'Bus' },
  { v: 'fa-car',            l: 'Auto' },
  { v: 'fa-warehouse',      l: 'Almacén' },
  { v: 'fa-graduation-cap', l: 'Graduación' },
  { v: 'fa-file-contract',  l: 'Contrato' },
  { v: 'fa-heart',          l: 'Corazón' },
  { v: 'fa-handshake',      l: 'Acuerdo' },
  { v: 'fa-map-marker-alt', l: 'Ubicación' },
  { v: 'fa-bullhorn',       l: 'Megáfono' },
  { v: 'fa-camera',         l: 'Cámara' },
  { v: 'fa-trophy',         l: 'Trofeo' },
  { v: 'fa-notes-medical',  l: 'Médico' },
  { v: 'fa-file-medical',   l: 'Documento médico' }
];

function descansosPortalDefault() {
  return {
    tituloSeccion: 'DESCANSOS MÉDICOS',
    subtitulo: 'Registro y consulta de descansos médicos del personal',
    visible: true,
    tarjetaRegistrar: {
      titulo: 'Registrar descanso médico',
      descripcion: 'Formulario completo con PDF y N.º de código de barras.',
      botonTexto: 'REGISTRAR',
      botonUrl: 'descansos.html',
      icono: 'fa-file-medical'
    },
    tarjetaConsultar: {
      titulo: 'Consultar ingreso',
      descripcion: 'Verifique con CIP y código de barras si el DM ya fue ingresado.',
      botonTexto: 'CONSULTAR',
      botonUrl: 'descansos.html#consulta',
      icono: 'fa-search'
    }
  };
}

function initCMS() {
  var base = apiBaseCMS();
  var iniciar = function(data) {
    cmsDataActual = data || {};
    if (!cmsDataActual.carrusel)  cmsDataActual.carrusel  = [];
    if (!cmsDataActual.fotosEncabezado) cmsDataActual.fotosEncabezado = [];
    if (!cmsDataActual.topbarLinks) cmsDataActual.topbarLinks = { sigcp: '', correo: '' };
    if (!cmsDataActual.novedades) cmsDataActual.novedades = [];
    if (typeof ordenarNovedadesPorFecha === 'function') {
      cmsDataActual.novedades = ordenarNovedadesPorFecha(cmsDataActual.novedades);
    }
    if (cmsDataActual.resenaHistorica && cmsDataActual.resenaHistorica.parrafos && typeof normalizarParrafosResena === 'function') {
      cmsDataActual.resenaHistorica.parrafos = normalizarParrafosResena(cmsDataActual.resenaHistorica.parrafos);
    }
    if (!cmsDataActual.convenios) cmsDataActual.convenios = [];
    if (!cmsDataActual.cursos)    cmsDataActual.cursos    = [];
    if (!cmsDataActual.heroTexto) cmsDataActual.heroTexto = {
      titulo:    'REGIÓN POLICIAL CALLAO',
      subtitulo: 'AL SERVICIO DE LA CIUDADANÍA',
      parrafo:   'Compromiso, Honor y Servicio en la Provincia Constitucional'
    };
    if (!cmsDataActual.bienestarPolicial) cmsDataActual.bienestarPolicial = {
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
    if (!cmsDataActual.descansosPortal) cmsDataActual.descansosPortal = descansosPortalDefault();
    poblarFormulariosCMS();
    renderListasCMS();
    actualizarMetaPublicacionCMS();
  };
  if (base) {
    var urlCms = base + '/portal/configuracion?t=' + Date.now();
    var fetchCms = (typeof fetchConTimeout === 'function')
      ? fetchConTimeout(urlCms, 30000)
      : fetch(urlCms, { cache: 'no-store' });
    fetchCms
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(server) {
        if (server && (server.novedades || server.fotosEncabezado || server.carrusel) && server.ok !== false) {
          iniciar(server);
          saveSiteDataToStorage(server);
          return;
        }
        return cargarSiteData().then(iniciar);
      })
      .catch(function() { cargarSiteData().then(iniciar); });
    return;
  }
  cargarSiteData().then(iniciar);
}

function apiBaseCMS() {
  if (typeof API !== 'undefined' && API) return API;
  if (typeof window.regpolApiBase === 'function') return window.regpolApiBase();
  if (typeof apiBasePortal === 'function') {
    var b = apiBasePortal();
    if (b) return b;
  }
  if (window.REGPOL_API_BASE) return window.REGPOL_API_BASE;
  var h = location.hostname;
  if (h === 'localhost' || h === '127.0.0.1') return 'http://localhost:3000';
  return window.REGPOL_API_PRODUCTION || 'https://regpolcallao-production.up.railway.app';
}

function fechaActualizacionHoy() {
  var meses = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
  var hoy = new Date();
  return hoy.getDate() + ' DE ' + meses[hoy.getMonth()] + ' ' + hoy.getFullYear();
}

function cambiarTabCMS(tab) {
  if (typeof puedeEditarCmsTab === 'function' && !puedeEditarCmsTab(tab)) {
    tab = (typeof primerTabCmsPermitido === 'function') ? primerTabCmsPermitido() : tab;
  }
  document.querySelectorAll('.cms-tab').forEach(function(btn) {
    btn.classList.toggle('activo', btn.getAttribute('data-cms-tab') === tab);
  });
  document.querySelectorAll('.cms-panel').forEach(function(panel) {
    panel.classList.toggle('activo', panel.id === 'cms-panel-' + tab);
  });
  document.querySelectorAll('.sb-item[data-cms-tab]').forEach(function(item) {
    item.classList.toggle('on', item.getAttribute('data-cms-tab') === tab);
  });
  if (tab === 'convenios' || tab === 'cursos') {
    renderGestionConvocatoriasCMS(tab === 'convenios' ? 'cms-lista-convenios' : 'cms-lista-cursos', tab === 'convenios' ? 'convenio' : 'curso');
  }
  actualizarMetaPublicacionCMS();
}

function renderListasCMS() {
  renderGestionConvocatoriasCMS('cms-lista-convenios', 'convenio');
  renderGestionConvocatoriasCMS('cms-lista-cursos', 'curso');
  renderListaNovedades('cms-lista-novedades', cmsDataActual.novedades || []);
  renderEditorFotosEncabezado();
  renderEditorCarrusel();
  renderEditorMenu();
}

function renderGestionConvocatoriasCMS(containerId, tipo) {
  var el = document.getElementById(containerId);
  if (!el) return;
  var esConv = tipo === 'convenio';
  var titulo = esConv ? 'Convenios' : 'Cursos';
  var hash = esConv ? '#convenios' : '#cursos';
  var esSuper = typeof esUnitic === 'function' && esUnitic();
  var puedePdf = typeof puedePublicarResultadosPdf === 'function' && puedePublicarResultadosPdf(tipo);
  var puedeInsc = esConv
    ? (typeof puedeOperarInscritosConvenio === 'function' && puedeOperarInscritosConvenio())
    : (typeof puedeGestionCursos === 'function' && puedeGestionCursos());

  el.innerHTML = '<div style="margin-bottom:14px;">'
    + '<div style="font-size:14px;font-weight:800;color:#004d3d;margin-bottom:6px;"><i class="fas fa-clipboard-list"></i> '
    + titulo + ' en el portal</div>'
    + '<p style="font-size:12.5px;color:#555;line-height:1.55;margin:0 0 12px;">'
    + 'Las tarjetas del home salen de las convocatorias publicadas. Estado y vacantes se sincronizan al guardar cada convocatoria.</p>'
    + '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;">'
    + '<a class="btn btn-v" href="index.html' + hash + '" target="_blank" rel="noopener" style="text-decoration:none;"><i class="fas fa-external-link-alt"></i> Ver en web</a>'
    + (esSuper ? '<button type="button" class="btn btn-v" onclick="irGestionItems(\'' + tipo + '\', document.querySelector(\'[data-page=items-' + tipo + ']\'))"><i class="fas fa-edit"></i> Gestionar convocatorias</button>' : '')
    + (puedePdf ? '<button type="button" class="btn" style="background:#c0392b;color:#fff;" onclick="irPublicarResultados(\'' + tipo + '\', null)"><i class="fas fa-file-pdf"></i> Relación PDF</button>' : '')
    + (puedeInsc && esConv ? '<button type="button" class="btn" style="background:#004d3d;color:#fff;" onclick="ir(\'consulta-cip\', document.querySelector(\'[data-page=consulta-cip]\'))"><i class="fas fa-search"></i> Consulta CIP</button>' : '')
    + '</div>'
    + '<div id="cms-live-' + tipo + '" style="border:1.5px solid #e0e8e0;border-radius:10px;overflow:hidden;">'
    + '<p style="color:#888;font-size:12px;padding:14px;margin:0;">Cargando convocatorias...</p></div>'
    + '</div>';

  var box = document.getElementById('cms-live-' + tipo);
  var base = apiBaseCMS() || '';
  fetch(base + '/portal/items?tipo=' + encodeURIComponent(tipo))
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (!box) return;
      var items = (d && d.ok && d.items) ? d.items : [];
      if (!items.length) {
        box.innerHTML = '<p style="color:#888;font-size:12px;padding:14px;margin:0;">No hay ' + titulo.toLowerCase() + ' publicados en la web.</p>';
        return;
      }
      box.innerHTML = '<table style="width:100%;border-collapse:collapse;font-size:12.5px;">'
        + '<thead><tr style="background:#f0f7f4;color:#004d3d;text-align:left;">'
        + '<th style="padding:8px 10px;">Título</th><th style="padding:8px 10px;">Estado</th><th style="padding:8px 10px;">Vacantes</th><th style="padding:8px 10px;">Web</th></tr></thead><tbody>'
        + items.map(function(it) {
          var est = escHtml(it.estado || '—');
          var color = it.estado === 'DISPONIBLE' ? '#1a7a3a' : (it.estado === 'CERRADO' ? '#c0392b' : '#856404');
          return '<tr style="border-top:1px solid #edf2ef;">'
            + '<td style="padding:8px 10px;font-weight:600;color:#004d3d;">' + escHtml(it.titulo || '') + '</td>'
            + '<td style="padding:8px 10px;font-weight:700;color:' + color + ';">' + est + '</td>'
            + '<td style="padding:8px 10px;">' + escHtml(String(it.vacantes != null ? it.vacantes : '—')) + '</td>'
            + '<td style="padding:8px 10px;"><a href="detalle.html?id=' + encodeURIComponent(it.id) + '&tipo=' + tipo + '" target="_blank" rel="noopener">Abrir</a></td>'
            + '</tr>';
        }).join('')
        + '</tbody></table>';
    })
    .catch(function() {
      if (box) box.innerHTML = '<p style="color:#c0392b;font-size:12px;padding:14px;margin:0;">No se pudo cargar el listado. Revise la conexión al servidor.</p>';
    });
}

function actualizarMetaPublicacionCMS() {
  var meta = document.getElementById('cms-publicado-meta');
  if (!meta) return;
  var cuando = (cmsDataActual && cmsDataActual.cmsPublicadoEn) ? cmsDataActual.cmsPublicadoEn : '';
  if (!cuando) {
    meta.textContent = '';
    return;
  }
  try {
    var d = new Date(cuando);
    meta.textContent = 'Última publicación: ' + d.toLocaleString('es-PE');
  } catch (e) {
    meta.textContent = '';
  }
}

function poblarFormulariosCMS() {
  var d = cmsDataActual;
  setVal('cms-actualizacion', d.actualizacion);
  setVal('cms-resena-intro',  (d.resenaHistorica || {}).intro || '');
  setVal('cms-resena-intro-titulo', (d.resenaHistorica || {}).introTitulo || 'Introducción');
  setVal('cms-labor-intro',   (d.nuestraLabor    || {}).intro || '');
  var bp = d.bienestarPolicial || {};
  setVal('cms-bienestar-titulo-seccion', bp.tituloSeccion || 'BIENESTAR POLICIAL');
  setVal('cms-bienestar-titulo', bp.titulo || '');
  setVal('cms-bienestar-descripcion', bp.descripcion || '');
  setVal('cms-bienestar-boton-texto', bp.botonTexto || 'INICIAR EVALUACIÓN');
  setVal('cms-bienestar-boton-url', bp.botonUrl || 'evaluacion.html');
  setVal('cms-bienestar-video-titulo', bp.videoTutorialTitulo || 'Video tutorial — Cómo usar el cuestionario');
  var chkBien = document.getElementById('cms-bienestar-visible');
  if (chkBien) chkBien.checked = bp.visible !== false;
  if (typeof actualizarEstadoVideoBienestarCMS === 'function') actualizarEstadoVideoBienestarCMS();
  var selIconoBien = document.getElementById('cms-bienestar-icono');
  if (selIconoBien) {
    var iconoBien = bp.icono || 'fa-heart';
    selIconoBien.innerHTML = CMS_ICONOS.map(function(o) {
      return '<option value="' + escHtml(o.v) + '"' + (o.v === iconoBien ? ' selected' : '') + '>' + escHtml(o.l) + '</option>';
    }).join('');
  }
  var dmDef = descansosPortalDefault();
  var dm = d.descansosPortal || dmDef;
  var dmReg = dm.tarjetaRegistrar || dmDef.tarjetaRegistrar;
  var dmCon = dm.tarjetaConsultar || dmDef.tarjetaConsultar;
  setVal('cms-dm-titulo-seccion', dm.tituloSeccion || dmDef.tituloSeccion);
  setVal('cms-dm-subtitulo', dm.subtitulo || dmDef.subtitulo);
  setVal('cms-dm-reg-titulo', dmReg.titulo || '');
  setVal('cms-dm-reg-desc', dmReg.descripcion || '');
  setVal('cms-dm-reg-boton', dmReg.botonTexto || 'REGISTRAR');
  setVal('cms-dm-reg-url', dmReg.botonUrl || 'descansos.html');
  setVal('cms-dm-con-titulo', dmCon.titulo || '');
  setVal('cms-dm-con-desc', dmCon.descripcion || '');
  setVal('cms-dm-con-boton', dmCon.botonTexto || 'CONSULTAR');
  setVal('cms-dm-con-url', dmCon.botonUrl || 'descansos.html#consulta');
  var chkDm = document.getElementById('cms-dm-visible');
  if (chkDm) chkDm.checked = dm.visible !== false;
  renderParrafosResenaCMS();
  renderPilaresCMS();
  inicializarBannerImg('resena',   (d.resenaHistorica || {}).imagenBanner || '');
  inicializarBannerImg('labor',    (d.nuestraLabor    || {}).imagenBanner || '');
  inicializarBannerImg('novedades', d.imagenBannerNovedades || '');
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

function renderEditorFotosEncabezado() {
  var el = document.getElementById('editor-fotos-encabezado');
  if (!el) return;
  if (!cmsDataActual.fotosEncabezado) cmsDataActual.fotosEncabezado = [];

  var fotos = cmsDataActual.fotosEncabezado;
  if (!fotos.length) fotos.push('');

  var html = '<div style="background:#f0f7f4;border:1.5px dashed #c8a94a;border-radius:10px;padding:14px;margin-bottom:20px;">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px;">'
    + '<strong style="color:#004d3d;font-size:13px;"><i class="fas fa-images"></i> Carrusel de fotos del encabezado</strong>'
    + '<button type="button" class="btn btn-v btn-sm" onclick="agregarFotoEncabezadoCMS()"><i class="fas fa-plus"></i> Añadir imagen</button>'
    + '</div>'
    + '<p style="font-size:11px;color:#666;margin:0 0 12px;">Se muestran a la derecha del logo en la página principal. Use fotos <strong>anchas (mín. 800 px)</strong> en JPG/PNG/WEBP para máxima nitidez. Máx. 2 MB por imagen. <strong>No use enlaces de Facebook u otras redes</strong> (bloquean la carga); suba el archivo o use una ruta del sitio.</p>'
    + '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin-bottom:12px;">';
  for (var i = 0; i < fotos.length; i++) {
    html += renderSlotFotoEncabezado(i);
  }
  html += '</div>'
    + '<button class="btn btn-v btn-sm" onclick="guardarFotosEncabezado()"><i class="fas fa-save"></i> Guardar y publicar fotos</button>'
    + '</div>';
  el.innerHTML = html;

  for (var j = 0; j < fotos.length; j++) {
    inicializarBannerImg('encabezado' + j, fotos[j] || '');
  }
}

function agregarFotoEncabezadoCMS() {
  cmsDataActual.fotosEncabezado = leerFotosEncabezado();
  if (cmsDataActual.fotosEncabezado.length >= 20) {
    mostrarAlertaCMS('Máximo 20 imágenes en el carrusel del encabezado.', 'error');
    return;
  }
  cmsDataActual.fotosEncabezado.push('');
  renderEditorFotosEncabezado();
}

function eliminarFotoEncabezadoCMS(idx) {
  cmsDataActual.fotosEncabezado = leerFotosEncabezado();
  cmsDataActual.fotosEncabezado.splice(idx, 1);
  renderEditorFotosEncabezado();
}

function renderSlotFotoEncabezado(idx) {
  var sec = 'encabezado' + idx;
  return '<div style="border:1.5px solid #e0e8e0;border-radius:8px;padding:10px;background:#fff;">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">'
    + '<p style="font-size:11px;font-weight:700;color:#004d3d;margin:0;">Imagen ' + (idx + 1) + '</p>'
    + '<button type="button" class="btn-mini btn-mini-danger" onclick="eliminarFotoEncabezadoCMS(' + idx + ')" title="Quitar"><i class="fas fa-trash"></i></button>'
    + '</div>'
    + '<input type="hidden" id="cms-' + sec + '-img-data" />'
    + '<input type="file" id="cms-' + sec + '-img-file" accept="image/jpeg,image/png,image/webp" onchange="previewBannerImg(this,\'' + sec + '\')" style="font-size:10px;width:100%;margin-bottom:6px;"/>'
    + '<input type="text" id="cms-' + sec + '-img-url" placeholder="URL de imagen (opcional)" class="cms-input" style="font-size:10px;margin-bottom:6px;" onchange="previewBannerUrl(this,\'' + sec + '\')"/>'
    + '<div id="cms-' + sec + '-img-preview" style="display:none;margin-bottom:6px;">'
    + '<img id="cms-' + sec + '-img-thumb" style="width:100%;height:80px;object-fit:cover;border-radius:6px;" alt=""/>'
    + '</div>'
    + '<button type="button" class="btn-mini btn-mini-danger" onclick="quitarBannerImg(\'' + sec + '\')"><i class="fas fa-times"></i> Limpiar</button>'
    + '</div>';
}

function leerFotosEncabezado() {
  var n = (cmsDataActual.fotosEncabezado || []).length;
  var arr = [];
  for (var i = 0; i < n; i++) {
    var v = leerBannerImg('encabezado' + i);
    if (v) arr.push(v);
  }
  return arr;
}

function guardarFotosEncabezado() {
  cmsDataActual.fotosEncabezado = leerFotosEncabezado();
  guardarSitioWeb();
}

function renderEditorCarrusel() {
  var el = document.getElementById('editor-carrusel');
  if (!el) return;
  var slides = cmsDataActual.carrusel || [];
  var heroT  = cmsDataActual.heroTexto || {};
  var topbar = cmsDataActual.topbarLinks || {};
  var sigcpDefault = 'https://sigcp.policia.gob.pe/';
  var correoDefault = 'https://correo.policia.gob.pe/owa/auth/logon.aspx?replaceCurrent=1&url=https%3a%2f%2fcorreo.policia.gob.pe%2fowa';

  var html = '<div class="cms-section-head" style="margin-bottom:14px;">'
    + '<strong style="color:#004d3d;font-size:13px;"><i class="fas fa-images"></i> Diapositivas del carrusel</strong>'
    + '<button class="btn btn-v btn-sm" onclick="agregarSlideCMS()" style="margin-left:12px;"><i class="fas fa-plus"></i> Añadir imagen</button>'
    + '</div>';

  if (!slides.length) {
    html += '<p style="color:#aaa;font-size:12px;margin-bottom:16px;">No hay imágenes en el carrusel. Pulse "Añadir imagen".</p>';
  } else {
    html += '<div id="cms-lista-slides" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;margin-bottom:20px;">';
    slides.forEach(function(s, idx) {
      var thumb = s.imagen
        ? '<img src="' + s.imagen + '" style="width:100%;height:110px;object-fit:cover;border-radius:6px 6px 0 0;" alt=""/>'
        : '<div style="width:100%;height:110px;background:#e0e8e0;border-radius:6px 6px 0 0;display:flex;align-items:center;justify-content:center;"><i class="fas fa-image" style="font-size:28px;color:#bbb;"></i></div>';
      html += '<div class="cms-slide-card" style="border:1.5px solid #e0e8e0;border-radius:8px;overflow:hidden;">'
        + thumb
        + '<div style="padding:8px;">'
        + '<p style="font-size:11px;font-weight:700;color:#004d3d;margin:0 0 4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escHtml(s.titulo || 'Sin título') + '</p>'
        + '<p style="font-size:10px;color:#888;margin:0 0 6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escHtml(s.subtitulo || '') + '</p>'
        + '<div style="display:flex;gap:6px;">'
        + '<button class="btn-mini" onclick="editarSlideCMS(' + idx + ')" title="Editar"><i class="fas fa-edit"></i></button>'
        + '<button class="btn-mini btn-mini-danger" onclick="eliminarSlideCMS(' + idx + ')" title="Eliminar"><i class="fas fa-trash"></i></button>'
        + '</div></div></div>';
    });
    html += '</div>';
  }

  html += '<hr style="margin:16px 0;border:none;border-top:1.5px solid #e0e8e0;"/>'
    + '<strong style="color:#004d3d;font-size:13px;display:block;margin-bottom:10px;"><i class="fas fa-heading"></i> Texto del banner central (solo inicio)</strong>'
    + '<div class="cms-modal-campo"><label class="cms-label">Título principal</label>'
    + '<input type="text" id="cms-hero-titulo" class="cms-input" value="' + escHtml(heroT.titulo || '') + '"/></div>'
    + '<div class="cms-modal-campo"><label class="cms-label">Lema (línea 2)</label>'
    + '<input type="text" id="cms-hero-subtitulo" class="cms-input" value="' + escHtml(heroT.subtitulo || '') + '"/></div>'
    + '<div class="cms-modal-campo"><label class="cms-label">Eslogan (línea 3)</label>'
    + '<textarea id="cms-hero-parrafo" class="cms-textarea" rows="2">' + safeTextareaContent(heroT.parrafo) + '</textarea></div>'
    + '<button class="btn btn-v" onclick="guardarHeroTexto()"><i class="fas fa-save"></i> Guardar textos del hero</button>';

  html += '<hr style="margin:20px 0;border:none;border-top:1.5px solid #e0e8e0;"/>'
    + '<strong style="color:#004d3d;font-size:13px;display:block;margin-bottom:8px;"><i class="fas fa-link"></i> Botones superiores (SIGCP / Correo)</strong>'
    + '<p style="font-size:11px;color:#666;margin:0 0 10px;">Enlaces de la barra verde superior del portal. Déjelos vacíos para usar los oficiales por defecto.</p>'
    + '<div class="cms-modal-campo"><label class="cms-label">URL SIGCP</label>'
    + '<input type="url" id="cms-topbar-sigcp" class="cms-input" placeholder="' + escHtml(sigcpDefault) + '" value="' + escHtml(topbar.sigcp || '') + '"/></div>'
    + '<div class="cms-modal-campo"><label class="cms-label">URL Correo institucional</label>'
    + '<input type="url" id="cms-topbar-correo" class="cms-input" placeholder="https://correo.policia.gob.pe/..." value="' + escHtml(topbar.correo || '') + '"/></div>'
    + '<button class="btn btn-v" onclick="guardarTopbarLinksCMS()"><i class="fas fa-save"></i> Guardar y publicar enlaces</button>';

  el.innerHTML = html;
}

function guardarTopbarLinksCMS() {
  cmsDataActual.topbarLinks = {
    sigcp: (document.getElementById('cms-topbar-sigcp') && document.getElementById('cms-topbar-sigcp').value.trim()) || '',
    correo: (document.getElementById('cms-topbar-correo') && document.getElementById('cms-topbar-correo').value.trim()) || ''
  };
  guardarSitioWeb();
}

function agregarSlideCMS() { abrirModalSlide(null); }
function editarSlideCMS(idx) { abrirModalSlide(idx); }

function eliminarSlideCMS(idx) {
  if (!confirm('¿Eliminar esta imagen del carrusel?')) return;
  cmsDataActual.carrusel.splice(idx, 1);
  renderEditorCarrusel();
  mostrarAlertaCMS('Imagen eliminada. Pulse "Publicar cambios" para aplicar.', 'ok');
}

function abrirModalSlide(idx) {
  var esNuevo = idx === null;
  var item = esNuevo ? { titulo: '', subtitulo: '', imagen: '' } : cmsDataActual.carrusel[idx];

  var imgPreview = item.imagen
    ? '<img id="cms-slide-preview" src="' + item.imagen + '" style="max-width:100%;max-height:160px;border-radius:6px;margin-top:6px;display:block;" alt=""/>'
    : '<img id="cms-slide-preview" src="" style="max-width:100%;max-height:160px;border-radius:6px;margin-top:6px;display:none;" alt=""/>';

  var body = '<div class="cms-modal-campo">'
    + '<label class="cms-label">Imagen (JPG/PNG — se convierte a base64)</label>'
    + '<input type="file" id="cms-slide-file" accept="image/jpeg,image/png,image/webp" style="width:100%;padding:6px;border:1.5px solid #ccc;border-radius:6px;font-size:13px;" onchange="previewSlideImg(this)"/>'
    + imgPreview
    + '<input type="hidden" id="cms-slide-img-data" value="' + escHtml(item.imagen || '') + '"/>'
    + '</div>'
    + cmsCampo('URL de imagen externa (alternativa)', 'cms-slide-url', item.imagen && item.imagen.startsWith('http') ? item.imagen : '')
    + cmsCampo('Título de la diapositiva', 'cms-slide-titulo', item.titulo)
    + cmsCampo('Subtítulo', 'cms-slide-subtitulo', item.subtitulo);

  abrirCmsModal(esNuevo ? 'Nueva imagen del carrusel' : 'Editar diapositiva', body, function() {
    var imgData = getVal('cms-slide-img-data') || getVal('cms-slide-url') || item.imagen || '';
    var nuevo = {
      titulo:    getVal('cms-slide-titulo'),
      subtitulo: getVal('cms-slide-subtitulo'),
      imagen:    imgData
    };
    cmsDataActual.carrusel = cmsDataActual.carrusel || [];
    if (esNuevo) cmsDataActual.carrusel.push(nuevo);
    else         cmsDataActual.carrusel[idx] = nuevo;
    renderEditorCarrusel();
    publicarCmsTrasEdicion('Carrusel actualizado en borrador. Pulse "Publicar cambios".');
    return true;
  });
}

function previewSlideImg(input) {
  var file = input.files && input.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) {
    alert('La imagen no debe superar 2 MB. Comprime la imagen antes de subirla.');
    input.value = ''; return;
  }
  var reader = new FileReader();
  reader.onload = function(e) {
    var data = e.target.result;
    var hidden  = document.getElementById('cms-slide-img-data');
    var preview = document.getElementById('cms-slide-preview');
    if (hidden)  hidden.value = data;
    if (preview) { preview.src = data; preview.style.display = 'block'; }
  };
  reader.readAsDataURL(file);
}

function guardarHeroTexto() {
  cmsDataActual.heroTexto = {
    titulo:    document.getElementById('cms-hero-titulo')    ? document.getElementById('cms-hero-titulo').value.trim()    : '',
    subtitulo: document.getElementById('cms-hero-subtitulo') ? document.getElementById('cms-hero-subtitulo').value.trim() : '',
    parrafo:   document.getElementById('cms-hero-parrafo')   ? document.getElementById('cms-hero-parrafo').value.trim()   : ''
  };
  guardarSitioWeb();
}

function listaNavPortalCMS() {
  if (typeof obtenerPortalNav === 'function') {
    return (window.REGPOL_NAV && window.REGPOL_NAV.length) ? window.REGPOL_NAV : [];
  }
  return (window.REGPOL_NAV && window.REGPOL_NAV.length) ? window.REGPOL_NAV : [];
}

function contenedorMenuPublicacionActivo() {
  var pageMenu = document.getElementById('page-menu-publicacion');
  if (pageMenu && pageMenu.classList.contains('on')) {
    return document.getElementById('menu-publicacion-editor');
  }
  var editorMenu = document.getElementById('editor-menu');
  if (editorMenu && editorMenu.querySelector('input[data-nav-id]')) return editorMenu;
  return null;
}

function recolectarNavOcultosDesdeFormulario() {
  var root = contenedorMenuPublicacionActivo();
  if (!root) {
    return (cmsDataActual && Array.isArray(cmsDataActual.navOcultos))
      ? cmsDataActual.navOcultos.slice() : [];
  }
  var ocultos = [];
  root.querySelectorAll('input[type="checkbox"][data-nav-id]').forEach(function(chk) {
    if (!chk.checked) ocultos.push(chk.getAttribute('data-nav-id'));
  });
  return ocultos;
}

function htmlEditorMenuPublicacion(containerPrefix) {
  var prefix = containerPrefix || 'menu-pub';
  var ocultos = (cmsDataActual && cmsDataActual.navOcultos) ? cmsDataActual.navOcultos : [];
  var nav = listaNavPortalCMS().filter(function(item) { return item.id !== 'consulta'; });

  var html = '<p style="font-size:13px;color:#444;margin-bottom:16px;line-height:1.55;">'
    + '<strong>Marque los ítems que desea publicar</strong> en el menú superior del portal. '
    + 'Los desmarcados no aparecerán en la web ni en las secciones del inicio hasta que los active.</p>';

  html += '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px;">';
  nav.forEach(function(item) {
    var publicado = ocultos.indexOf(item.id) === -1;
    html += '<label style="display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:12px;padding:12px 14px;border:2px solid '
      + (publicado ? '#a5d6a7' : '#e0e0e0') + ';border-radius:10px;cursor:pointer;background:'
      + (publicado ? '#f7faf7' : '#fafafa') + ';">'
      + '<input type="checkbox" class="' + prefix + '-chk" data-nav-id="' + escHtml(item.id) + '" '
      + (publicado ? 'checked' : '') + ' style="width:18px;height:18px;accent-color:#004d3d;"/>'
      + '<span style="font-size:14px;font-weight:700;color:#004d3d;">'
      + '<i class="fas ' + escHtml(item.icon || 'fa-circle') + '" style="margin-right:8px;color:#c8a94a;"></i>'
      + escHtml(item.label) + '</span>'
      + '<span style="font-size:11px;font-weight:700;padding:4px 10px;border-radius:12px;background:'
      + (publicado ? '#d4edda;color:#1a5c32' : '#f8d7da;color:#842029') + ';">'
      + (publicado ? 'PUBLICADO' : 'OCULTO') + '</span>'
      + '</label>';
  });
  html += '</div>';

  html += '<div style="background:#fffdf5;border:1.5px solid #c8a94a;border-radius:10px;padding:14px;margin-bottom:18px;font-size:12px;color:#666;">'
    + '<i class="fas fa-info-circle" style="color:#c8a94a;"></i> '
    + 'Ejemplo: desmarque <strong>CONVENIOS</strong> y <strong>CURSOS</strong> mientras termina esas secciones. '
    + 'El resto del portal seguirá visible.</div>';

  html += '<button type="button" class="btn btn-v" style="font-size:14px;padding:12px 22px;" onclick="guardarMenuPublicacionWeb()">'
    + '<i class="fas fa-globe"></i> GUARDAR Y PUBLICAR EN LA WEB</button>';

  return html;
}

function renderEditorMenu() {
  var el = document.getElementById('editor-menu');
  if (!el) return;
  var html = htmlEditorMenuPublicacion('cms-menu');

  html += '<hr style="margin:20px 0;border:none;border-top:1.5px solid #e0e8e0;"/>'
    + '<strong style="color:#004d3d;font-size:13px;display:block;margin-bottom:10px;"><i class="fas fa-link"></i> Accesos rápidos de la portada</strong>'
    + '<p style="font-size:11px;color:#888;margin-bottom:12px;">Textos de las tarjetas de acceso rápido en la página de inicio.</p>';

  var accesos = (cmsDataActual && cmsDataActual.accesosRapidos) ? cmsDataActual.accesosRapidos : [
    { titulo: 'CONVENIOS DE TRABAJO', descripcion: 'Consulta las últimas convocatorias vigentes para el personal policial' },
    { titulo: 'CURSOS POLICIALES', descripcion: 'Nuevas vacantes y capacitaciones especializadas programadas para este mes' }
  ];
  accesos.forEach(function(a, i) {
    html += '<div style="border:1.5px solid #e0e8e0;border-radius:8px;padding:12px;margin-bottom:10px;">'
      + '<div class="cms-modal-campo"><label class="cms-label">Título del acceso ' + (i+1) + '</label>'
      + '<input type="text" id="cms-acceso-titulo-' + i + '" class="cms-input" value="' + escHtml(a.titulo) + '"/></div>'
      + '<div class="cms-modal-campo"><label class="cms-label">Descripción</label>'
      + '<input type="text" id="cms-acceso-desc-' + i + '" class="cms-input" value="' + escHtml(a.descripcion) + '"/></div>'
      + '</div>';
  });

  el.innerHTML = html;
}

function renderMenuPublicacionPagina() {
  var el = document.getElementById('menu-publicacion-editor');
  if (!el) return;
  el.innerHTML = htmlEditorMenuPublicacion('menu-pub');
}

function guardarMenuPublicacionWeb() {
  if (!cmsDataActual) cmsDataActual = {};
  cmsDataActual.navOcultos = recolectarNavOcultosDesdeFormulario();
  var accesos = [];
  var i = 0;
  while (document.getElementById('cms-acceso-titulo-' + i)) {
    accesos.push({
      titulo: document.getElementById('cms-acceso-titulo-' + i).value.trim(),
      descripcion: document.getElementById('cms-acceso-desc-' + i).value.trim()
    });
    i++;
  }
  if (accesos.length) cmsDataActual.accesosRapidos = accesos;
  guardarSitioWeb(function(ok) {
    if (ok) {
      renderMenuPublicacionPagina();
      renderEditorMenu();
    }
  });
}

function cargarPaginaMenuPublicacion() {
  if (!esUnitic()) { alert('Solo el Super Admin puede publicar el menú del portal.'); return; }
  var pintar = function() {
    renderMenuPublicacionPagina();
  };
  if (cmsDataActual) {
    pintar();
    return;
  }
  if (!CMS_INICIADO) {
    CMS_INICIADO = true;
    initCMS();
    setTimeout(pintar, 400);
    return;
  }
  pintar();
}

function publicarCmsTrasEdicion(mensajeBorrador) {
  guardarSitioWeb(function(ok) {
    if (!ok) {
      mostrarAlertaCMS(mensajeBorrador || 'Cambios guardados en borrador. Pulse "Publicar cambios" para subir al portal.', 'ok');
    }
  });
}

function guardarConfigMenu() {
  guardarMenuPublicacionWeb();
}

function renderListaNovedades(containerId, items) {
  var el = document.getElementById(containerId);
  if (!el) return;
  if (!items.length) {
    el.innerHTML = '<p class="cms-vacio">No hay novedades.</p>';
    return;
  }
  el.innerHTML = items.map(function(item, idx) {
    var thumb = item.imagen
      ? '<img src="' + item.imagen + '" style="width:48px;height:48px;object-fit:cover;border-radius:6px;flex-shrink:0;" alt=""/>'
      : '<div class="cms-item-icono cms-item-icono-naranja"><i class="fas fa-newspaper"></i></div>';
    return '<div class="cms-item">'
      + thumb
      + '<div class="cms-item-info"><strong>' + escHtml(item.titulo) + '</strong>'
      + '<span>' + escHtml(item.fecha) + ' — ' + escHtml(item.categoria) + '</span></div>'
      + '<div class="cms-item-acciones">'
      + '<button type="button" class="btn-mini" onclick="editarNovedadCMS(' + idx + ')"><i class="fas fa-edit"></i></button>'
      + '<button type="button" class="btn-mini btn-mini-danger" onclick="eliminarNovedadCMS(' + idx + ')"><i class="fas fa-trash"></i></button>'
      + '</div></div>';
  }).join('');
}

function abrirModalNovedad(idx) {
  var esNuevo = idx === null;
  var item = esNuevo ? {
    titulo: '', resumen: '', categoria: 'Institucional', imagen: '',
    fecha: new Date().toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
  } : (cmsDataActual.novedades[idx] || {});

  var imgPreviewSrc = item.imagen || '';
  var imgPreviewStyle = imgPreviewSrc ? 'display:block;' : 'display:none;';

  var body = cmsCampo('Título', 'm-titulo', item.titulo)
    + cmsCampo('Resumen breve', 'm-resumen', item.resumen, 'textarea')
    + cmsCampo('Contenido completo (aparece al abrir la noticia)', 'm-contenido', item.contenido || '', 'textarea')
    + cmsCampo('Categoría', 'm-cat', item.categoria, 'select',
        ['Operativo', 'Tránsito', 'Comunitario', 'Institucional', 'Prevención'])
    + cmsCampo('Fecha', 'm-fecha', item.fecha)
    + '<div class="cms-modal-campo">'
    + '<label class="cms-label">Fotografía (JPG/PNG — máx 1.5 MB)</label>'
    + '<input type="file" id="m-foto-file" accept="image/jpeg,image/png,image/webp" style="width:100%;padding:6px;border:1.5px solid #ccc;border-radius:6px;font-size:13px;" onchange="previewNovedadImg(this)"/>'
    + '<img id="m-foto-preview" src="' + escHtml(imgPreviewSrc) + '" style="max-width:100%;max-height:120px;border-radius:6px;margin-top:6px;' + imgPreviewStyle + '" alt=""/>'
    + '<input type="hidden" id="m-foto-data" value="' + escHtml(imgPreviewSrc) + '"/>'
    + (imgPreviewSrc ? '<button type="button" class="btn-mini btn-mini-danger" onclick="quitarFotoNovedad()" style="margin-top:4px;"><i class="fas fa-times"></i> Quitar foto</button>' : '')
    + '</div>';

  abrirCmsModal(esNuevo ? 'Nueva novedad' : 'Editar novedad', body, function() {
    var titulo = leerModal('m-titulo');
    if (!titulo) { alert('El título es obligatorio.'); return false; }
    var nuevo = {
      id:        item.id || ('nov-' + Date.now()),
      titulo:    titulo,
      resumen:   leerModal('m-resumen'),
      contenido: leerModal('m-contenido'),
      categoria: leerModal('m-cat') || 'Institucional',
      fecha:     leerModal('m-fecha'),
      imagen:    getVal('m-foto-data') || item.imagen || ''
    };
    cmsDataActual.novedades = cmsDataActual.novedades || [];
    if (esNuevo) cmsDataActual.novedades.push(nuevo);
    else         cmsDataActual.novedades[idx] = nuevo;
    if (typeof ordenarNovedadesPorFecha === 'function') {
      cmsDataActual.novedades = ordenarNovedadesPorFecha(cmsDataActual.novedades);
    }
    renderListasCMS();
    publicarCmsTrasEdicion('Guardado en borrador. Pulse "Publicar cambios" para subir al portal.');
    return true;
  });
}

function previewNovedadImg(input) {
  var file = input.files && input.files[0];
  if (!file) return;
  if (file.size > 1.5 * 1024 * 1024) {
    alert('La foto no debe superar 1.5 MB. Comprime la imagen antes de subirla.');
    input.value = ''; return;
  }
  var reader = new FileReader();
  reader.onload = function(e) {
    var data = e.target.result;
    var hidden  = document.getElementById('m-foto-data');
    var preview = document.getElementById('m-foto-preview');
    if (hidden)  hidden.value = data;
    if (preview) { preview.src = data; preview.style.display = 'block'; }
  };
  reader.readAsDataURL(file);
}

function quitarFotoNovedad() {
  var hidden  = document.getElementById('m-foto-data');
  var preview = document.getElementById('m-foto-preview');
  var file    = document.getElementById('m-foto-file');
  if (hidden)  hidden.value = '';
  if (preview) { preview.src = ''; preview.style.display = 'none'; }
  if (file)    file.value = '';
}

function syncImagenParrafoResenaCms(seccion, val) {
  cmsDataActual.resenaHistorica = cmsDataActual.resenaHistorica || {};
  if (seccion === 'resena') {
    cmsDataActual.resenaHistorica.imagenBanner = val || '';
    return;
  }
  var m = /^resena-p(\d+)$/.exec(String(seccion || ''));
  if (!m) return;
  var idx = parseInt(m[1], 10);
  var list = cmsDataActual.resenaHistorica.parrafos || [];
  while (list.length <= idx) list.push({ titulo: '', texto: '', imagen: '' });
  list[idx] = (typeof normalizarParrafoResena === 'function')
    ? normalizarParrafoResena(list[idx])
    : { titulo: list[idx].titulo || '', texto: list[idx].texto || '', imagen: '' };
  list[idx].imagen = val || '';
  cmsDataActual.resenaHistorica.parrafos = list;
}

function indiceResenaImagenSeccion(seccion) {
  if (seccion === 'resena') return 'intro';
  var m = /^resena-p(\d+)$/.exec(String(seccion || ''));
  return m ? m[1] : null;
}

function esSeccionImagenResena(seccion) {
  return seccion === 'resena' || /^resena-p\d+$/.test(String(seccion || ''));
}

function dataUrlABlobResena(dataUrl) {
  var parts = String(dataUrl || '').split(',');
  if (parts.length < 2) return null;
  var mimeMatch = parts[0].match(/:(.*?);/);
  if (!mimeMatch) return null;
  var bin = atob(parts[1]);
  var arr = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mimeMatch[1] });
}

function subirImagenResenaAlServidor(seccion, blob, mime, nombre, callback) {
  var idx = indiceResenaImagenSeccion(seccion);
  if (idx === null) { callback(null, 'Sección inválida'); return; }
  var base = apiBaseCMS();
  var token = (typeof TOKEN !== 'undefined' && TOKEN) ? TOKEN : '';
  if (!base || !token) { callback(null, 'Sesión expirada'); return; }
  fetch(base + '/admin/resena-imagen/' + encodeURIComponent(idx), {
    method: 'POST',
    headers: {
      'Content-Type': mime || 'image/jpeg',
      'x-admin-token': token,
      'x-filename': nombre || 'foto.jpg'
    },
    body: blob
  })
    .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, status: r.status, data: d }; }); })
    .then(function(res) {
      if (res.data && res.data.ok && res.data.url) callback(res.data.url, null);
      else if (res.status === 401 || res.status === 403) callback(null, mensajeErrorSesionCms(res.status, res.data));
      else callback(null, (res.data && res.data.error) || 'No se pudo subir la imagen');
    })
    .catch(function() { callback(null, 'Sin conexión al subir la imagen'); });
}

function aplicarImagenResenaCms(seccion, dataUrl, file) {
  var blob = file || dataUrlABlobResena(dataUrl);
  if (!blob) {
    mostrarAlertaCMS('No se pudo procesar la imagen.', 'error');
    return;
  }
  var mime = (file && file.type) || (blob.type) || 'image/jpeg';
  var nombre = (file && file.name) || 'foto.jpg';
  mostrarAlertaCMS('Subiendo imagen al servidor...', 'ok');
  subirImagenResenaAlServidor(seccion, blob, mime, nombre, function(url, err) {
    if (!url) {
      mostrarAlertaCMS(err || 'Error al subir imagen', 'error');
      return;
    }
    var base = apiBaseCMS() || '';
    inicializarBannerImg(seccion, base + url + '?t=' + Date.now());
    syncImagenParrafoResenaCms(seccion, url);
    mostrarAlertaCMS('Imagen subida. Guarde y publique para verla en la web.', 'ok');
  });
}

function subirDataUrlResenaSiBase64(idx, dataUrl) {
  return new Promise(function(resolve) {
    var s = String(dataUrl || '').trim();
    if (!s || s.indexOf('data:image/') !== 0) { resolve(s); return; }
    var seccion = idx === 'intro' ? 'resena' : ('resena-p' + idx);
    var blob = dataUrlABlobResena(s);
    if (!blob) { resolve(''); return; }
    subirImagenResenaAlServidor(seccion, blob, blob.type, 'foto.jpg', function(url) {
      resolve(url || '');
    });
  });
}

function sincronizarImagenResenaEnDom(seccion, url) {
  if (typeof inicializarBannerImg === 'function') inicializarBannerImg(seccion, url || '');
  if (typeof syncImagenParrafoResenaCms === 'function') syncImagenParrafoResenaCms(seccion, url || '');
}

function prepararImagenesResenaParaPublicar(callback) {
  var rh = cmsDataActual.resenaHistorica || {};
  if (document.querySelector('.cms-parrafo-input')) syncParrafosFromDOM();
  var tareas = [];
  if (rh.imagenBanner && String(rh.imagenBanner).indexOf('data:') === 0) {
    tareas.push(subirDataUrlResenaSiBase64('intro', rh.imagenBanner).then(function(url) {
      if (url) {
        rh.imagenBanner = url;
        sincronizarImagenResenaEnDom('resena', url);
      }
    }));
  }
  (rh.parrafos || []).forEach(function(p, i) {
    var img = (p && p.imagen) ? String(p.imagen) : '';
    if (img.indexOf('data:') === 0) {
      tareas.push(subirDataUrlResenaSiBase64(String(i), img).then(function(url) {
        if (url) {
          p.imagen = url;
          sincronizarImagenResenaEnDom('resena-p' + i, url);
        }
      }));
    }
  });
  cmsDataActual.resenaHistorica = rh;
  if (!tareas.length) { callback(); return; }
  Promise.all(tareas).then(function() { callback(); }).catch(function() { callback(); });
}

function renderParrafosResenaCMS() {
  var el = document.getElementById('cms-lista-parrafos');
  if (!el) return;
  var parrafos = normalizarParrafosResena(((cmsDataActual.resenaHistorica || {}).parrafos) || []);
  cmsDataActual.resenaHistorica = cmsDataActual.resenaHistorica || {};
  cmsDataActual.resenaHistorica.parrafos = parrafos;
  if (!parrafos.length) {
    el.innerHTML = '<p class="cms-vacio">No hay párrafos. Pulse "Agregar párrafo".</p>';
    return;
  }
  el.innerHTML = '<div class="cms-parrafos-lista">' + parrafos.map(function(item, idx) {
    var sec = 'resena-p' + idx;
    return '<div class="cms-parrafo-item cms-parrafo-item-v2">'
      + '<div class="cms-parrafo-num">' + String(idx + 1).padStart(2, '0') + '</div>'
      + '<div class="cms-parrafo-campos">'
      + '<input type="text" class="cms-input cms-parrafo-titulo" data-idx="' + idx + '" placeholder="Título del bloque (opcional)" value="' + escHtml(item.titulo) + '"/>'
      + '<textarea class="cms-textarea cms-parrafo-input" data-idx="' + idx + '" rows="3" placeholder="Texto del párrafo...">' + safeTextareaContent(item.texto) + '</textarea>'
      + '<div class="cms-parrafo-img">'
      + '<label class="cms-label" style="font-size:11px;margin-bottom:4px;">Fotografía (JPG/PNG máx. 2.5 MB)</label>'
      + '<input type="file" id="cms-' + sec + '-img-file" accept="image/jpeg,image/png,image/webp" style="font-size:11px;width:100%;margin-bottom:6px;" onchange="previewBannerImg(this,\'' + sec + '\')"/>'
      + '<input type="text" id="cms-' + sec + '-img-url" placeholder="URL de imagen (opcional)" class="cms-input" style="font-size:11px;margin-bottom:6px;" oninput="previewBannerUrl(this,\'' + sec + '\')"/>'
      + '<input type="hidden" id="cms-' + sec + '-img-data" value=""/>'
      + '<div id="cms-' + sec + '-img-preview" style="display:none;margin-bottom:4px;">'
      + '<img id="cms-' + sec + '-img-thumb" style="max-height:80px;border-radius:6px;border:1px solid #ddd;" alt=""/>'
      + '<button type="button" onclick="quitarBannerImg(\'' + sec + '\')" style="margin-left:8px;font-size:11px;color:#c0392b;background:none;border:none;cursor:pointer;"><i class="fas fa-times"></i> Quitar</button>'
      + '</div></div></div>'
      + '<button type="button" class="btn-mini btn-mini-danger" title="Eliminar" onclick="eliminarParrafoResena(' + idx + ')"><i class="fas fa-trash"></i></button>'
      + '</div>';
  }).join('') + '</div>';
  parrafos.forEach(function(item, idx) {
    inicializarBannerImg('resena-p' + idx, item.imagen || '');
  });
}

function recolectarParrafosDesdeDOM() {
  var inputs = document.querySelectorAll('.cms-parrafo-input');
  var mem = normalizarParrafosResena((cmsDataActual.resenaHistorica || {}).parrafos || []);
  if (!inputs.length) return mem;
  var list = [];
  inputs.forEach(function(el) {
    var idx = el.getAttribute('data-idx');
    if (idx === null || idx === '') idx = list.length;
    idx = parseInt(idx, 10);
    var tituloEl = document.querySelector('.cms-parrafo-titulo[data-idx="' + idx + '"]');
    var hidden = document.getElementById('cms-resena-p' + idx + '-img-data');
    var imagen = hidden ? hidden.value.trim() : '';
    if (!imagen && typeof leerBannerImg === 'function') {
      imagen = leerBannerImg('resena-p' + idx) || '';
    }
    if (imagen.indexOf('http') === 0 && imagen.indexOf('/portal/resena-imagen/') !== -1) {
      var u = imagen.replace(/^https?:\/\/[^/]+/, '');
      imagen = u.split('?')[0];
    }
    if (!imagen && mem[idx] && mem[idx].imagen) imagen = String(mem[idx].imagen).trim();
    list.push({
      titulo: tituloEl ? tituloEl.value.trim() : (mem[idx] && mem[idx].titulo) || '',
      texto: el.value.trim(),
      imagen: imagen
    });
  });
  return typeof mergeParrafosResena === 'function' ? mergeParrafosResena(list, mem) : list;
}

function syncParrafosFromDOM() {
  cmsDataActual.resenaHistorica = cmsDataActual.resenaHistorica || { parrafos: [] };
  cmsDataActual.resenaHistorica.parrafos = recolectarParrafosDesdeDOM();
}

function agregarParrafoResena() {
  syncParrafosFromDOM();
  cmsDataActual.resenaHistorica.parrafos.push({ titulo: '', texto: '', imagen: '' });
  renderParrafosResenaCMS();
}

function eliminarParrafoResena(idx) {
  if (!confirm('¿Eliminar este párrafo?')) return;
  syncParrafosFromDOM();
  cmsDataActual.resenaHistorica.parrafos.splice(idx, 1);
  renderParrafosResenaCMS();
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
    return '<div class="cms-pilar-item">'
      + '<div class="cms-pilar-preview"><i class="fas ' + escHtml(p.icono || 'fa-star') + '"></i></div>'
      + '<div class="cms-pilar-info"><strong>' + escHtml(p.titulo) + '</strong><span>' + escHtml(p.texto) + '</span>'
      + (p.imagen ? '<span style="display:block;margin-top:2px;color:#1a7a3a;font-size:10px;"><i class="fas fa-image"></i> Con imagen</span>' : '')
      + '</div>'
      + '<div class="cms-item-acciones">'
      + '<button type="button" class="btn-mini" onclick="editarPilarCMS(' + idx + ')"><i class="fas fa-edit"></i></button>'
      + '<button type="button" class="btn-mini btn-mini-danger" onclick="eliminarPilarCMS(' + idx + ')"><i class="fas fa-trash"></i></button>'
      + '</div></div>';
  }).join('');
}

function agregarPilarCMS()    { abrirModalPilar(null); }
function editarPilarCMS(idx)  { abrirModalPilar(idx); }

function eliminarPilarCMS(idx) {
  if (!confirm('¿Eliminar este pilar?')) return;
  cmsDataActual.nuestraLabor.pilares.splice(idx, 1);
  renderPilaresCMS();
}

function abrirModalPilar(idx) {
  var esNuevo = idx === null;
  var item = esNuevo ? { titulo: '', texto: '', icono: 'fa-shield-alt', imagen: '' }
    : ((cmsDataActual.nuestraLabor || {}).pilares || [])[idx] || {};
  var imgVal = String(item.imagen || '').trim();
  var imgPreview = imgVal
    ? '<img id="cms-pilar-preview" src="' + escHtml(imgVal) + '" style="max-width:100%;max-height:120px;border-radius:6px;margin-top:6px;display:block;" alt=""/>'
    : '<img id="cms-pilar-preview" src="" style="max-width:100%;max-height:120px;border-radius:6px;margin-top:6px;display:none;" alt=""/>';
  var body = cmsCampo('Título del pilar', 'm-titulo', item.titulo)
    + cmsCampo('Descripción', 'm-texto', item.texto, 'textarea')
    + cmsCampo('Icono (si no hay imagen)', 'm-icono', item.icono, 'select', CMS_ICONOS)
    + '<div class="cms-modal-campo"><label class="cms-label">Imagen opcional del slide (JPG/PNG)</label>'
    + '<input type="file" id="cms-pilar-file" accept="image/jpeg,image/png,image/webp" style="width:100%;padding:6px;border:1.5px solid #ccc;border-radius:6px;font-size:12px;" onchange="previewPilarImgCMS(this)"/>'
    + imgPreview
    + '<input type="hidden" id="m-imagen" value="' + escHtml(imgVal) + '"/>'
    + '<input type="text" id="m-imagen-url" class="cms-input" style="margin-top:6px;" placeholder="O URL de imagen" value="' + escHtml(imgVal.indexOf('http') === 0 ? imgVal : '') + '" onchange="var h=document.getElementById(\'m-imagen\');var p=document.getElementById(\'cms-pilar-preview\');if(h)h.value=this.value.trim();if(p&&this.value.trim()){p.src=this.value.trim();p.style.display=\'block\';}"/>'
    + '<p style="font-size:11px;color:#888;margin:6px 0 0;">En la web: imagen o ícono a la izquierda del texto del carrusel.</p></div>';
  abrirCmsModal(esNuevo ? 'Nuevo pilar' : 'Editar pilar', body, function() {
    var titulo = leerModal('m-titulo');
    if (!titulo) { alert('El título es obligatorio.'); return false; }
    var imagen = (document.getElementById('m-imagen') && document.getElementById('m-imagen').value.trim())
      || (document.getElementById('m-imagen-url') && document.getElementById('m-imagen-url').value.trim())
      || '';
    var nuevo = {
      titulo: titulo,
      texto: leerModal('m-texto'),
      icono: leerModal('m-icono') || 'fa-shield-alt',
      imagen: imagen
    };
    cmsDataActual.nuestraLabor = cmsDataActual.nuestraLabor || { pilares: [] };
    cmsDataActual.nuestraLabor.pilares = cmsDataActual.nuestraLabor.pilares || [];
    if (esNuevo) cmsDataActual.nuestraLabor.pilares.push(nuevo);
    else         cmsDataActual.nuestraLabor.pilares[idx] = nuevo;
    renderPilaresCMS();
    publicarCmsTrasEdicion('Pilar guardado en borrador. Pulse "Publicar cambios".');
    return true;
  });
}

function previewPilarImgCMS(input) {
  var file = input.files && input.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) {
    alert('La imagen no debe superar 2 MB.');
    input.value = '';
    return;
  }
  var reader = new FileReader();
  reader.onload = function(e) {
    var data = e.target.result;
    var hidden = document.getElementById('m-imagen');
    var preview = document.getElementById('cms-pilar-preview');
    if (hidden) hidden.value = data;
    if (preview) { preview.src = data; preview.style.display = 'block'; }
  };
  reader.readAsDataURL(file);
}

function agregarNovedadCMS()  { abrirModalNovedad(null); }

function eliminarNovedadCMS(idx) {
  if (!confirm('¿Eliminar esta novedad?')) return;
  cmsDataActual.novedades.splice(idx, 1);
  renderListasCMS();
}
function editarNovedadCMS(idx)     { abrirModalNovedad(idx); }

var BIENESTAR_VIDEO_MAX_MB = 60;

function actualizarEstadoVideoBienestarCMS() {
  var preview = document.getElementById('cms-bienestar-video-preview');
  var meta = document.getElementById('cms-bienestar-video-meta');
  var base = apiBaseCMS();
  var token = (typeof TOKEN !== 'undefined' && TOKEN) ? TOKEN : '';
  if (!base || !token) {
    if (meta) meta.textContent = 'Inicie sesión para gestionar el video.';
    return;
  }
  fetch(base + '/admin/bienestar-video/info', { headers: { 'x-admin-token': token } })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      cmsDataActual.bienestarPolicial = cmsDataActual.bienestarPolicial || {};
      if (!d.ok || !d.disponible) {
        cmsDataActual.bienestarPolicial.videoTutorial = '';
        if (preview) { preview.removeAttribute('src'); preview.style.display = 'none'; }
        if (meta) meta.textContent = 'No hay video subido.';
        return;
      }
      cmsDataActual.bienestarPolicial.videoTutorial = '/portal/bienestar-video';
      cmsDataActual.bienestarPolicial.videoTutorialUpdatedAt = new Date().toISOString();
      if (preview) {
        preview.src = base + '/portal/bienestar-video?t=' + Date.now();
        preview.style.display = 'block';
      }
      if (meta) {
        var mb = ((d.bytes || 0) / (1024 * 1024)).toFixed(1);
        meta.textContent = (d.nombre || 'Video tutorial') + ' — ' + mb + ' MB';
      }
    })
    .catch(function() {
      if (meta) meta.textContent = 'No se pudo verificar el video en el servidor.';
    });
}

function subirVideoBienestarCMS() {
  var input = document.getElementById('cms-bienestar-video-file');
  var file = input && input.files[0];
  if (!file) {
    alert('Seleccione un archivo de video (MP4 o WebM).');
    return;
  }
  if (file.size > BIENESTAR_VIDEO_MAX_MB * 1024 * 1024) {
    alert('El video supera el máximo de ' + BIENESTAR_VIDEO_MAX_MB + ' MB. Comprímalo e intente de nuevo.');
    return;
  }
  var okExt = /\.(mp4|webm|mov)$/i.test(file.name);
  var okMime = /^video\/(mp4|webm|quicktime)$/i.test(file.type || '');
  if (!okExt && !okMime) {
    alert('Formato no válido. Use MP4, WebM o MOV.');
    return;
  }
  var base = apiBaseCMS();
  var token = (typeof TOKEN !== 'undefined' && TOKEN) ? TOKEN : '';
  if (!base || !token) {
    alert('Sesión expirada. Vuelva a ingresar al panel.');
    return;
  }
  mostrarAlertaCMS('Subiendo video (puede tardar 1–2 minutos)...', 'ok');
  fetch(base + '/admin/bienestar-video', {
    method: 'POST',
    headers: {
      'Content-Type': file.type || 'video/mp4',
      'x-admin-token': token,
      'x-filename': file.name
    },
    body: file
  })
    .then(function(r) { return r.json().then(function(d) { return { status: r.status, data: d }; }); })
    .then(function(res) {
      if (!res.data || !res.data.ok) {
        mostrarAlertaCMS('No se subió el video: ' + ((res.data && res.data.error) || ('HTTP ' + res.status)), 'error');
        return;
      }
      cmsDataActual.bienestarPolicial = cmsDataActual.bienestarPolicial || {};
      cmsDataActual.bienestarPolicial.videoTutorial = '/portal/bienestar-video';
      cmsDataActual.bienestarPolicial.videoTutorialUpdatedAt = new Date().toISOString();
      actualizarEstadoVideoBienestarCMS();
      guardarSitioWeb(function(ok) {
        if (ok) mostrarAlertaCMS('Video subido y publicado correctamente.', 'ok');
      });
    })
    .catch(function() {
      mostrarAlertaCMS('Error de conexión al subir el video.', 'error');
    });
}

function quitarVideoBienestarCMS() {
  if (!confirm('¿Quitar el video tutorial del portal?')) return;
  var base = apiBaseCMS();
  var token = (typeof TOKEN !== 'undefined' && TOKEN) ? TOKEN : '';
  if (!base || !token) {
    alert('Sesión expirada.');
    return;
  }
  fetch(base + '/admin/bienestar-video', {
    method: 'DELETE',
    headers: { 'x-admin-token': token }
  })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (!d.ok) {
        mostrarAlertaCMS('No se pudo quitar el video.', 'error');
        return;
      }
      cmsDataActual.bienestarPolicial = cmsDataActual.bienestarPolicial || {};
      cmsDataActual.bienestarPolicial.videoTutorial = '';
      var input = document.getElementById('cms-bienestar-video-file');
      if (input) input.value = '';
      actualizarEstadoVideoBienestarCMS();
      guardarSitioWeb();
      mostrarAlertaCMS('Video eliminado del portal.', 'ok');
    })
    .catch(function() {
      mostrarAlertaCMS('Error de conexión.', 'error');
    });
}

function recolectarDatosCMS() {
  var data = cloneSiteData(cmsDataActual || {});
  if (data.novedades && typeof ordenarNovedadesPorFecha === 'function') {
    data.novedades = ordenarNovedadesPorFecha(data.novedades);
  }
  data.actualizacion      = getVal('cms-actualizacion') || data.actualizacion;
  data.resenaHistorica    = data.resenaHistorica || {};
  data.resenaHistorica.titulo  = 'Reseña Histórica';
  data.resenaHistorica.intro   = getVal('cms-resena-intro');
  data.resenaHistorica.introTitulo = getVal('cms-resena-intro-titulo') || 'Introducción';
  if (document.querySelector('.cms-parrafo-input')) {
    data.resenaHistorica.parrafos = recolectarParrafosDesdeDOM();
    cmsDataActual.resenaHistorica = cmsDataActual.resenaHistorica || {};
    cmsDataActual.resenaHistorica.parrafos = data.resenaHistorica.parrafos;
  } else {
    data.resenaHistorica.parrafos = normalizarParrafosResena((cmsDataActual.resenaHistorica || {}).parrafos || []);
  }
  var bannerIntro = leerBannerImg('resena');
  if (!bannerIntro && cmsDataActual.resenaHistorica && cmsDataActual.resenaHistorica.imagenBanner) {
    bannerIntro = cmsDataActual.resenaHistorica.imagenBanner;
  }
  if (bannerIntro && bannerIntro.indexOf('http') === 0) {
    bannerIntro = bannerIntro.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
  }
  data.resenaHistorica.imagenBanner = bannerIntro;
  data.nuestraLabor       = data.nuestraLabor || {};
  data.nuestraLabor.titulo = 'Nuestra Labor';
  data.nuestraLabor.intro  = getVal('cms-labor-intro');
  data.nuestraLabor.imagenBanner = leerBannerImg('labor');
  if (!data.nuestraLabor.pilares) data.nuestraLabor.pilares = (cmsDataActual.nuestraLabor || {}).pilares || [];
  var topbarSigcpEl = document.getElementById('cms-topbar-sigcp');
  var topbarCorreoEl = document.getElementById('cms-topbar-correo');
  data.topbarLinks = {
    sigcp: topbarSigcpEl ? topbarSigcpEl.value.trim() : ((cmsDataActual.topbarLinks || {}).sigcp || ''),
    correo: topbarCorreoEl ? topbarCorreoEl.value.trim() : ((cmsDataActual.topbarLinks || {}).correo || '')
  };
  data.bienestarPolicial = {
    tituloSeccion: getVal('cms-bienestar-titulo-seccion') || 'BIENESTAR POLICIAL',
    titulo: getVal('cms-bienestar-titulo'),
    descripcion: getVal('cms-bienestar-descripcion'),
    icono: getVal('cms-bienestar-icono') || 'fa-heart',
    botonTexto: getVal('cms-bienestar-boton-texto') || 'INICIAR EVALUACIÓN',
    botonUrl: getVal('cms-bienestar-boton-url') || 'evaluacion.html',
    videoTutorial: (cmsDataActual.bienestarPolicial || {}).videoTutorial || '',
    videoTutorialUpdatedAt: (cmsDataActual.bienestarPolicial || {}).videoTutorialUpdatedAt || '',
    videoTutorialTitulo: getVal('cms-bienestar-video-titulo') || 'Video tutorial — Cómo usar el cuestionario',
    visible: (function() {
      var el = document.getElementById('cms-bienestar-visible');
      return el ? el.checked : true;
    })()
  };
  var dmPrev = (cmsDataActual && cmsDataActual.descansosPortal) || descansosPortalDefault();
  var dmRegPrev = dmPrev.tarjetaRegistrar || {};
  var dmConPrev = dmPrev.tarjetaConsultar || {};
  data.descansosPortal = {
    tituloSeccion: getVal('cms-dm-titulo-seccion') || 'DESCANSOS MÉDICOS',
    subtitulo: getVal('cms-dm-subtitulo') || 'Registro y consulta de descansos médicos del personal',
    visible: (function() {
      var el = document.getElementById('cms-dm-visible');
      return el ? el.checked : true;
    })(),
    tarjetaRegistrar: {
      titulo: getVal('cms-dm-reg-titulo') || 'Registrar descanso médico',
      descripcion: getVal('cms-dm-reg-desc'),
      botonTexto: getVal('cms-dm-reg-boton') || 'REGISTRAR',
      botonUrl: getVal('cms-dm-reg-url') || 'descansos.html',
      icono: dmRegPrev.icono || 'fa-file-medical'
    },
    tarjetaConsultar: {
      titulo: getVal('cms-dm-con-titulo') || 'Consultar ingreso',
      descripcion: getVal('cms-dm-con-desc'),
      botonTexto: getVal('cms-dm-con-boton') || 'CONSULTAR',
      botonUrl: getVal('cms-dm-con-url') || 'descansos.html#consulta',
      icono: dmConPrev.icono || 'fa-search'
    }
  };
  data.imagenBannerNovedades = leerBannerImg('novedades');
  if (document.getElementById('editor-fotos-encabezado')) {
    data.fotosEncabezado = leerFotosEncabezado();
  } else if (cmsDataActual.fotosEncabezado) {
    data.fotosEncabezado = cmsDataActual.fotosEncabezado.filter(function(f) { return !!(f && String(f).trim()); });
  }
  data.navOcultos = recolectarNavOcultosDesdeFormulario();
  if (document.getElementById('cms-acceso-titulo-0')) {
    var accesos = [];
    var ai = 0;
    while (document.getElementById('cms-acceso-titulo-' + ai)) {
      accesos.push({
        titulo: getVal('cms-acceso-titulo-' + ai),
        descripcion: getVal('cms-acceso-desc-' + ai)
      });
      ai++;
    }
    if (accesos.length) data.accesosRapidos = accesos;
  }
  delete data.convenios;
  delete data.cursos;
  delete data.conveniosPdf;
  delete data.cursosPdf;
  return data;
}

function guardarSitioWeb(onComplete) {
  if (!cmsDataActual) cmsDataActual = {};
  var navPrevio = Array.isArray(cmsDataActual.navOcultos) ? cmsDataActual.navOcultos.slice() : [];
  prepararImagenesResenaParaPublicar(function() {
    cmsDataActual = recolectarDatosCMS();
    if (!contenedorMenuPublicacionActivo()) {
      cmsDataActual.navOcultos = navPrevio;
    }
    cmsDataActual.actualizacion = fechaActualizacionHoy();
    cmsDataActual.cmsPublicadoEn = new Date().toISOString();
    setVal('cms-actualizacion', cmsDataActual.actualizacion);
    saveSiteDataToStorage(cmsDataActual);
    publicarCmsDataAlServidor(onComplete);
  });
}

function mensajeErrorSesionCms(status, data) {
  if (status === 401 || status === 403) {
    return 'Sesión expirada o inválida. Cierre sesión (arriba a la derecha), vuelva a ingresar y publique de nuevo.';
  }
  return (data && data.error) || ('error HTTP ' + status);
}

function verificarSesionCmsActiva(callback) {
  var base = apiBaseCMS();
  var token = (typeof TOKEN !== 'undefined' && TOKEN) ? TOKEN : '';
  if (!base || !token) { callback(false); return; }
  fetch(base + '/admin/perfil', { headers: { 'x-admin-token': token } })
    .then(function(r) { return r.json().then(function(d) { return { ok: r.ok && d && d.ok, status: r.status }; }); })
    .then(function(res) { callback(!!res.ok, res.status); })
    .catch(function() { callback(false); });
}

function publicarCmsDataAlServidor(onComplete) {
  var base = apiBaseCMS();
  var token = (typeof TOKEN !== 'undefined' && TOKEN) ? TOKEN : '';
  if (!base) {
    mostrarAlertaCMS('No hay URL del servidor configurada. No se pudo publicar.', 'error');
    if (typeof onComplete === 'function') onComplete(false);
    return;
  }
  if (!token) {
    mostrarAlertaCMS('Sesión expirada. Vuelva a ingresar al panel.', 'error');
    if (typeof onComplete === 'function') onComplete(false);
    return;
  }
  verificarSesionCmsActiva(function(sesionOk) {
    if (!sesionOk) {
      mostrarAlertaCMS(mensajeErrorSesionCms(403, null), 'error');
      if (typeof onComplete === 'function') onComplete(false);
      return;
    }
    mostrarAlertaCMS('Publicando en el servidor...', 'ok');
    fetch(base + '/admin/configuracion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
      body: JSON.stringify(cmsDataActual)
    }).then(function(r) {
      return r.json().catch(function() { return { ok: false, error: 'Respuesta inválida del servidor' }; })
        .then(function(d) { return { status: r.status, data: d }; });
    })
      .then(function(res) {
        var ok = !!(res.data && res.data.ok);
        if (ok) {
          if (typeof limpiarCachePortal === 'function') limpiarCachePortal();
          actualizarMetaPublicacionCMS();
          mostrarAlertaCMS('¡Publicado! Los visitantes verán los cambios al recargar (Ctrl+F5). Use el botón «Ver portal» para comprobar.', 'ok');
        } else {
          mostrarAlertaCMS('No se publicó: ' + mensajeErrorSesionCms(res.status, res.data), 'error');
        }
        if (typeof onComplete === 'function') onComplete(ok);
      })
      .catch(function() {
        mostrarAlertaCMS('Sin conexión al servidor. Los cambios quedaron solo en este navegador.', 'error');
        if (typeof onComplete === 'function') onComplete(false);
      });
  });
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

function mostrarAlertaCMS(texto, tipo) {
  ['alerta-cms', 'alerta-menu-publicacion'].forEach(function(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = texto;
    el.style.display = 'block';
    el.className = 'alerta alerta-' + (tipo === 'ok' ? 'exito' : 'error') + ' visible';
  });
  setTimeout(function() {
    ['alerta-cms', 'alerta-menu-publicacion'].forEach(function(id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.style.display = 'none';
      el.classList.remove('visible');
    });
  }, 5000);
}

function abrirCmsModal(titulo, htmlBody, onGuardar) {
  var tituloEl = document.getElementById('cms-modal-titulo');
  var bodyEl   = document.getElementById('cms-modal-body');
  if (tituloEl) tituloEl.innerHTML = '<i class="fas fa-edit" style="color:#c8a94a;margin-right:6px;"></i>' + escHtml(titulo);
  if (bodyEl)   bodyEl.innerHTML = htmlBody;
  cmsModalGuardarFn = onGuardar;
  var modal = document.getElementById('cms-modal');
  if (modal) {
    modal.classList.add('visible');
    modal.setAttribute('aria-hidden', 'false');
  }
  var btn = document.getElementById('cms-modal-guardar');
  if (btn) {
    btn.onclick = function() {
      if (cmsModalGuardarFn && cmsModalGuardarFn() !== false) cerrarCmsModal();
    };
  }
  var first = document.querySelector('#cms-modal-body input:not([type="hidden"]):not([type="file"]), #cms-modal-body textarea, #cms-modal-body select');
  if (first) setTimeout(function() { first.focus(); }, 100);
}

function cerrarCmsModal() {
  var modal = document.getElementById('cms-modal');
  if (modal) {
    modal.classList.remove('visible');
    modal.setAttribute('aria-hidden', 'true');
  }
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

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') cerrarCmsModal();
});

function inicializarBannerImg(seccion, valor) {
  var hidden  = document.getElementById('cms-' + seccion + '-img-data');
  var preview = document.getElementById('cms-' + seccion + '-img-preview');
  var thumb   = document.getElementById('cms-' + seccion + '-img-thumb');
  var urlInput = document.getElementById('cms-' + seccion + '-img-url');
  if (!hidden) return;
  hidden.value = valor || '';
  if (valor) {
    var src = valor;
    if (src.indexOf('/portal/resena-imagen/') === 0) {
      src = (apiBaseCMS() || '') + src + (src.indexOf('?') === -1 ? '?t=' + Date.now() : '');
    }
    if (thumb)   { thumb.src = src; }
    if (preview) { preview.style.display = 'block'; }
    if (urlInput && valor.startsWith('http')) urlInput.value = valor;
    else if (urlInput && valor.indexOf('/portal/resena-imagen/') === 0) urlInput.value = '';
  } else {
    if (preview) preview.style.display = 'none';
  }
}

function optimizarImagenCMS(dataUrl, maxW, quality, callback) {
  var img = new Image();
  img.onload = function() {
    var w = img.width;
    var h = img.height;
    if (!w || !h) { callback(dataUrl); return; }
    var scale = w > maxW ? maxW / w : 1;
    var cw = Math.round(w * scale);
    var ch = Math.round(h * scale);
    if (scale === 1 && dataUrl.length < 600000) {
      callback(dataUrl);
      return;
    }
    var canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    var ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, cw, ch);
    callback(canvas.toDataURL('image/jpeg', quality));
  };
  img.onerror = function() { callback(dataUrl); };
  img.src = dataUrl;
}

function previewBannerImg(input, seccion) {
  var file = input.files && input.files[0];
  if (!file) return;
  if (file.size > 2.5 * 1024 * 1024) {
    alert('La imagen no debe superar 2.5 MB. Use una foto de buena resolución pero más liviana.');
    input.value = ''; return;
  }
  var reader = new FileReader();
  reader.onload = function(e) {
    var data = e.target.result;
    var aplicar = function(val) {
      if (esSeccionImagenResena(seccion)) {
        aplicarImagenResenaCms(seccion, val, file);
        return;
      }
      inicializarBannerImg(seccion, val);
      syncImagenParrafoResenaCms(seccion, val);
      var urlInput = document.getElementById('cms-' + seccion + '-img-url');
      if (urlInput) urlInput.value = '';
    };
    if (String(seccion).indexOf('encabezado') === 0 || String(seccion).indexOf('resena-p') === 0 || seccion === 'resena') {
      optimizarImagenCMS(data, 1200, 0.88, aplicar);
    } else {
      aplicar(data);
    }
  };
  reader.readAsDataURL(file);
}

function previewBannerUrl(input, seccion) {
  var url = input.value.trim();
  if (!url) { quitarBannerImg(seccion); return; }
  if (String(seccion).indexOf('encabezado') === 0 && /-\d+x\d+\.(jpe?g|png|webp)/i.test(url)) {
    mostrarAlertaCMS('Esa URL parece una miniatura. Use la imagen en tamaño completo para mejor nitidez.', 'error');
  }
  inicializarBannerImg(seccion, url);
  syncImagenParrafoResenaCms(seccion, url);
}

function quitarBannerImg(seccion) {
  var hidden  = document.getElementById('cms-' + seccion + '-img-data');
  var preview = document.getElementById('cms-' + seccion + '-img-preview');
  var thumb   = document.getElementById('cms-' + seccion + '-img-thumb');
  var fileInput = document.getElementById('cms-' + seccion + '-img-file');
  var urlInput  = document.getElementById('cms-' + seccion + '-img-url');
  if (hidden)    hidden.value = '';
  if (preview)   preview.style.display = 'none';
  if (thumb)     thumb.src = '';
  if (fileInput) fileInput.value = '';
  if (urlInput)  urlInput.value = '';
  syncImagenParrafoResenaCms(seccion, '');
}

function leerBannerImg(seccion) {
  var hidden = document.getElementById('cms-' + seccion + '-img-data');
  return hidden ? hidden.value.trim() : '';
}
