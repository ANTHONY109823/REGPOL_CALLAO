/* panel-cms.js — Administración de contenido del portal REGPOL Callao */
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
  { v: 'fa-trophy',         l: 'Trofeo' }
];

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════
function initCMS() {
  cargarSiteData().then(function(data) {
    cmsDataActual = data || {};
    if (!cmsDataActual.carrusel)  cmsDataActual.carrusel  = [];
    if (!cmsDataActual.novedades) cmsDataActual.novedades = [];
    if (!cmsDataActual.convenios) cmsDataActual.convenios = [];
    if (!cmsDataActual.cursos)    cmsDataActual.cursos    = [];
    if (!cmsDataActual.heroTexto) cmsDataActual.heroTexto = {
      titulo:    'REGIÓN POLICIAL CALLAO',
      subtitulo: 'AL SERVICIO DE LA CIUDADANÍA',
      parrafo:   'Compromiso, Honor y Servicio en la Provincia Constitucional'
    };
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

// ═══════════════════════════════════════════════════════════════
// RENDERIZADO GENERAL
// ═══════════════════════════════════════════════════════════════
function renderListasCMS() {
  renderListaEditable('cms-lista-convenios', cmsDataActual.convenios || [], 'convenios');
  renderListaEditable('cms-lista-cursos',    cmsDataActual.cursos    || [], 'cursos');
  renderListaNovedades('cms-lista-novedades', cmsDataActual.novedades || []);
  renderEditorCarrusel();
  renderEditorMenu();
}

function poblarFormulariosCMS() {
  var d = cmsDataActual;
  setVal('cms-actualizacion', d.actualizacion);
  setVal('cms-resena-intro',  (d.resenaHistorica || {}).intro || '');
  setVal('cms-labor-intro',   (d.nuestraLabor    || {}).intro || '');
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

// ═══════════════════════════════════════════════════════════════
// CARRUSEL (INICIO)
// ═══════════════════════════════════════════════════════════════
function renderEditorCarrusel() {
  var el = document.getElementById('editor-carrusel');
  if (!el) return;
  var slides = cmsDataActual.carrusel || [];
  var heroT  = cmsDataActual.heroTexto || {};

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

  el.innerHTML = html;
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
    mostrarAlertaCMS('Carrusel actualizado. Pulse "Publicar cambios".', 'ok');
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

// ═══════════════════════════════════════════════════════════════
// MENÚ (HERO LINKS Y VISIBILIDAD)
// ═══════════════════════════════════════════════════════════════
function renderEditorMenu() {
  var el = document.getElementById('editor-menu');
  if (!el) return;
  var ocultos = cmsDataActual.navOcultos || [];
  var nav = (window.REGPOL_NAV && window.REGPOL_NAV.length) ? window.REGPOL_NAV : [];

  var html = '<p style="font-size:12px;color:#666;margin-bottom:14px;">Activa o desactiva elementos del menú de navegación del portal. Los cambios aplican al publicar.</p>';
  html += '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px;">';
  nav.forEach(function(item) {
    var oculto = ocultos.indexOf(item.id) !== -1;
    html += '<label style="display:flex;align-items:center;gap:10px;padding:8px 12px;border:1.5px solid #e0e8e0;border-radius:7px;cursor:pointer;background:' + (oculto ? '#fff5f5' : '#f7faf7') + ';">'
      + '<input type="checkbox" data-nav-id="' + escHtml(item.id) + '" ' + (!oculto ? 'checked' : '') + ' style="width:16px;height:16px;accent-color:#004d3d;"/>'
      + '<i class="fas ' + escHtml(item.icon || 'fa-circle') + '" style="color:#004d3d;width:16px;text-align:center;"></i>'
      + '<span style="font-size:13px;font-weight:600;">' + escHtml(item.label) + '</span>'
      + '<span style="font-size:11px;color:#aaa;margin-left:auto;">' + escHtml(item.href) + '</span>'
      + '</label>';
  });
  html += '</div>';

  html += '<hr style="margin:16px 0;border:none;border-top:1.5px solid #e0e8e0;"/>'
    + '<strong style="color:#004d3d;font-size:13px;display:block;margin-bottom:10px;"><i class="fas fa-link"></i> Accesos rápidos de la portada</strong>'
    + '<p style="font-size:11px;color:#888;margin-bottom:12px;">Textos de las tarjetas de acceso rápido en la página de inicio.</p>';

  var accesos = cmsDataActual.accesosRapidos || [
    { titulo: 'CONVENIOS DE TRABAJO', descripcion: 'Consulta las últimas convocatorias vigentes para el personal policial', href: 'convenios.html' },
    { titulo: 'CURSOS POLICIALES',    descripcion: 'Nuevas vacantes y capacitaciones especializadas programadas para este mes',  href: 'cursos.html' }
  ];
  accesos.forEach(function(a, i) {
    html += '<div style="border:1.5px solid #e0e8e0;border-radius:8px;padding:12px;margin-bottom:10px;">'
      + '<div class="cms-modal-campo"><label class="cms-label">Título del acceso ' + (i+1) + '</label>'
      + '<input type="text" id="cms-acceso-titulo-' + i + '" class="cms-input" value="' + escHtml(a.titulo) + '"/></div>'
      + '<div class="cms-modal-campo"><label class="cms-label">Descripción</label>'
      + '<input type="text" id="cms-acceso-desc-' + i + '" class="cms-input" value="' + escHtml(a.descripcion) + '"/></div>'
      + '</div>';
  });

  html += '<button class="btn btn-v" onclick="guardarConfigMenu()"><i class="fas fa-save"></i> Guardar configuración de menú</button>';

  el.innerHTML = html;
}

function guardarConfigMenu() {
  var ocultos = [];
  document.querySelectorAll('[data-nav-id]').forEach(function(chk) {
    if (!chk.checked) ocultos.push(chk.getAttribute('data-nav-id'));
  });
  cmsDataActual.navOcultos = ocultos;

  var accesos = [];
  var i = 0;
  while (document.getElementById('cms-acceso-titulo-' + i)) {
    accesos.push({
      titulo:      document.getElementById('cms-acceso-titulo-' + i).value.trim(),
      descripcion: document.getElementById('cms-acceso-desc-'   + i).value.trim()
    });
    i++;
  }
  if (accesos.length) cmsDataActual.accesosRapidos = accesos;

  guardarSitioWeb();
}

// ═══════════════════════════════════════════════════════════════
// NOVEDADES
// ═══════════════════════════════════════════════════════════════
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
    + cmsCampo('Resumen', 'm-resumen', item.resumen, 'textarea')
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
      categoria: leerModal('m-cat') || 'Institucional',
      fecha:     leerModal('m-fecha'),
      imagen:    getVal('m-foto-data') || item.imagen || ''
    };
    cmsDataActual.novedades = cmsDataActual.novedades || [];
    if (esNuevo) cmsDataActual.novedades.unshift(nuevo);
    else         cmsDataActual.novedades[idx] = nuevo;
    renderListasCMS();
    mostrarAlertaCMS('Guardado en borrador. Pulse "Publicar cambios" para subir al portal.', 'ok');
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

// ═══════════════════════════════════════════════════════════════
// CONVENIOS / CURSOS
// ═══════════════════════════════════════════════════════════════
function renderListaEditable(containerId, items, tipo) {
  var el = document.getElementById(containerId);
  if (!el) return;
  if (!items.length) {
    el.innerHTML = '<p class="cms-vacio">No hay registros.</p>';
    return;
  }
  el.innerHTML = items.map(function(item, idx) {
    return '<div class="cms-item">'
      + '<div class="cms-item-icono"><i class="fas ' + escHtml(item.icono || 'fa-file') + '"></i></div>'
      + '<div class="cms-item-info"><strong>' + escHtml(item.titulo) + '</strong>'
      + '<span>' + escHtml(item.descripcion) + ' — <em>' + escHtml(item.estado) + '</em></span></div>'
      + '<div class="cms-item-acciones">'
      + '<button type="button" class="btn-mini" onclick="editarItemCMS(\'' + tipo + '\',' + idx + ')"><i class="fas fa-edit"></i></button>'
      + '<button type="button" class="btn-mini btn-mini-danger" onclick="eliminarItemCMS(\'' + tipo + '\',' + idx + ')"><i class="fas fa-trash"></i></button>'
      + '</div></div>';
  }).join('');
}

// ═══════════════════════════════════════════════════════════════
// RESEÑA HISTÓRICA
// ═══════════════════════════════════════════════════════════════
function renderParrafosResenaCMS() {
  var el = document.getElementById('cms-lista-parrafos');
  if (!el) return;
  var parrafos = ((cmsDataActual.resenaHistorica || {}).parrafos) || [];
  if (!parrafos.length) {
    el.innerHTML = '<p class="cms-vacio">No hay párrafos. Pulse "Agregar párrafo".</p>';
    return;
  }
  el.innerHTML = parrafos.map(function(texto, idx) {
    return '<div class="cms-parrafo-item">'
      + '<div class="cms-parrafo-num">' + String(idx + 1).padStart(2, '0') + '</div>'
      + '<textarea class="cms-textarea cms-parrafo-input" data-idx="' + idx + '" rows="3" placeholder="Escriba el párrafo...">' + safeTextareaContent(texto) + '</textarea>'
      + '<button type="button" class="btn-mini btn-mini-danger" title="Eliminar" onclick="eliminarParrafoResena(' + idx + ')"><i class="fas fa-trash"></i></button>'
      + '</div>';
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

// ═══════════════════════════════════════════════════════════════
// NUESTRA LABOR
// ═══════════════════════════════════════════════════════════════
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
      + '<div class="cms-pilar-info"><strong>' + escHtml(p.titulo) + '</strong><span>' + escHtml(p.texto) + '</span></div>'
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
  var item = esNuevo ? { titulo: '', texto: '', icono: 'fa-shield-alt' }
    : ((cmsDataActual.nuestraLabor || {}).pilares || [])[idx] || {};
  var body = cmsCampo('Título del pilar', 'm-titulo', item.titulo)
    + cmsCampo('Descripción', 'm-texto', item.texto, 'textarea')
    + cmsCampo('Icono', 'm-icono', item.icono, 'select', CMS_ICONOS);
  abrirCmsModal(esNuevo ? 'Nuevo pilar' : 'Editar pilar', body, function() {
    var titulo = leerModal('m-titulo');
    if (!titulo) { alert('El título es obligatorio.'); return false; }
    var nuevo = { titulo: titulo, texto: leerModal('m-texto'), icono: leerModal('m-icono') || 'fa-shield-alt' };
    cmsDataActual.nuestraLabor = cmsDataActual.nuestraLabor || { pilares: [] };
    cmsDataActual.nuestraLabor.pilares = cmsDataActual.nuestraLabor.pilares || [];
    if (esNuevo) cmsDataActual.nuestraLabor.pilares.push(nuevo);
    else         cmsDataActual.nuestraLabor.pilares[idx] = nuevo;
    renderPilaresCMS();
    mostrarAlertaCMS('Pilar guardado. Pulse "Publicar cambios" para aplicar en el portal.', 'ok');
    return true;
  });
}

function recolectarParrafosDesdeDOM() {
  var inputs = document.querySelectorAll('.cms-parrafo-input');
  var list = [];
  inputs.forEach(function(el) { var t = el.value.trim(); if (t) list.push(t); });
  return list;
}

// ═══════════════════════════════════════════════════════════════
// CONVENIOS / CURSOS — modal tarjeta
// ═══════════════════════════════════════════════════════════════
function abrirModalTarjeta(tipo, idx) {
  var esNuevo = idx === null;
  var item = esNuevo
    ? { titulo: '', descripcion: '', estado: 'DISPONIBLE', url: '#', icono: 'fa-shield-alt', color: '#004d3d', estadoColor: 'green' }
    : cmsDataActual[tipo][idx];
  var tituloModal = (esNuevo ? 'Nuevo ' : 'Editar ') + (tipo === 'convenios' ? 'convenio' : 'curso');
  var body = cmsCampo('Título', 'm-titulo', item.titulo)
    + cmsCampo('Descripción', 'm-desc', item.descripcion, 'textarea')
    + cmsCampo('Estado', 'm-estado', item.estado, 'select', ['DISPONIBLE', 'EN PROCESO', 'CERRADO'])
    + cmsCampo('Enlace (URL o archivo .html)', 'm-url', item.url)
    + cmsCampo('Icono', 'm-icono', item.icono, 'select', CMS_ICONOS);
  abrirCmsModal(tituloModal, body, function() {
    var titulo = leerModal('m-titulo');
    if (!titulo) { alert('El título es obligatorio.'); return false; }
    var nuevo = {
      id:          item.id || (tipo.slice(0, 4) + '-' + Date.now()),
      titulo:      titulo.toUpperCase(),
      descripcion: leerModal('m-desc'),
      estado:      leerModal('m-estado') || 'DISPONIBLE',
      estadoColor: leerModal('m-estado') === 'EN PROCESO' ? '#f4f806' : 'green',
      icono:       leerModal('m-icono') || 'fa-shield-alt',
      color:       item.color || '#004d3d',
      url:         leerModal('m-url') || '#'
    };
    cmsDataActual[tipo] = cmsDataActual[tipo] || [];
    if (esNuevo) cmsDataActual[tipo].push(nuevo);
    else         cmsDataActual[tipo][idx] = nuevo;
    renderListasCMS();
    mostrarAlertaCMS('Guardado en borrador. Pulse "Publicar cambios" para subir al portal.', 'ok');
    return true;
  });
}

function agregarConvenioCMS() { abrirModalTarjeta('convenios', null); }
function agregarCursoCMS()    { abrirModalTarjeta('cursos', null); }
function agregarNovedadCMS()  { abrirModalNovedad(null); }

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
function editarItemCMS(tipo, idx)  { abrirModalTarjeta(tipo, idx); }
function editarNovedadCMS(idx)     { abrirModalNovedad(idx); }

// ═══════════════════════════════════════════════════════════════
// GUARDAR / EXPORTAR / IMPORTAR
// ═══════════════════════════════════════════════════════════════
function recolectarDatosCMS() {
  var data = cloneSiteData(cmsDataActual || {});
  data.actualizacion      = getVal('cms-actualizacion') || data.actualizacion;
  data.resenaHistorica    = data.resenaHistorica || {};
  data.resenaHistorica.titulo  = 'Reseña Histórica';
  data.resenaHistorica.intro   = getVal('cms-resena-intro');
  data.resenaHistorica.parrafos = recolectarParrafosDesdeDOM();
  data.resenaHistorica.imagenBanner = leerBannerImg('resena');
  data.nuestraLabor       = data.nuestraLabor || {};
  data.nuestraLabor.titulo = 'Nuestra Labor';
  data.nuestraLabor.intro  = getVal('cms-labor-intro');
  data.nuestraLabor.imagenBanner = leerBannerImg('labor');
  if (!data.nuestraLabor.pilares) data.nuestraLabor.pilares = (cmsDataActual.nuestraLabor || {}).pilares || [];
  data.imagenBannerNovedades = leerBannerImg('novedades');
  return data;
}

function guardarSitioWeb() {
  cmsDataActual = recolectarDatosCMS();
  saveSiteDataToStorage(cmsDataActual);
  publicarSiteData(cmsDataActual);
  mostrarAlertaCMS('Publicando...', 'ok');
  var base = (window.REGPOL_API_BASE != null ? window.REGPOL_API_BASE : '');
  var token = (typeof TOKEN !== 'undefined' && TOKEN) ? TOKEN : '';
  fetch(base + '/admin/configuracion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
    body: JSON.stringify(cmsDataActual)
  }).then(function(r) { return r.json(); })
    .then(function(d) {
      if (d && d.ok) {
        mostrarAlertaCMS('¡Publicado! Los visitantes ven los cambios al recargar.', 'ok');
      } else {
        mostrarAlertaCMS('Guardado local. Verifica la conexión al servidor.', 'ok');
      }
    })
    .catch(function() {
      mostrarAlertaCMS('Guardado local. Sin conexión al servidor.', 'ok');
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

// ═══════════════════════════════════════════════════════════════
// MODAL CMS — helpers
// ═══════════════════════════════════════════════════════════════
function mostrarAlertaCMS(texto, tipo) {
  var el = document.getElementById('alerta-cms');
  if (!el) return;
  el.textContent = texto;
  el.style.display = 'block';
  el.className = 'alerta alerta-' + (tipo === 'ok' ? 'exito' : 'error') + ' visible';
  setTimeout(function() { el.style.display = 'none'; el.classList.remove('visible'); }, 5000);
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

// ═══════════════════════════════════════════════════════════════
// BANNERS HERO — helpers compartidos (resena / labor / novedades)
// ═══════════════════════════════════════════════════════════════
function inicializarBannerImg(seccion, valor) {
  var hidden  = document.getElementById('cms-' + seccion + '-img-data');
  var preview = document.getElementById('cms-' + seccion + '-img-preview');
  var thumb   = document.getElementById('cms-' + seccion + '-img-thumb');
  var urlInput = document.getElementById('cms-' + seccion + '-img-url');
  if (!hidden) return;
  hidden.value = valor || '';
  if (valor) {
    if (thumb)   { thumb.src = valor; }
    if (preview) { preview.style.display = 'block'; }
    if (urlInput && valor.startsWith('http')) urlInput.value = valor;
  } else {
    if (preview) preview.style.display = 'none';
  }
}

function previewBannerImg(input, seccion) {
  var file = input.files && input.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) {
    alert('La imagen no debe superar 2 MB. Comprime la imagen antes de subirla.');
    input.value = ''; return;
  }
  var reader = new FileReader();
  reader.onload = function(e) {
    inicializarBannerImg(seccion, e.target.result);
    var urlInput = document.getElementById('cms-' + seccion + '-img-url');
    if (urlInput) urlInput.value = '';
  };
  reader.readAsDataURL(file);
}

function previewBannerUrl(input, seccion) {
  var url = input.value.trim();
  if (!url) { quitarBannerImg(seccion); return; }
  inicializarBannerImg(seccion, url);
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
}

function leerBannerImg(seccion) {
  var hidden = document.getElementById('cms-' + seccion + '-img-data');
  return hidden ? hidden.value.trim() : '';
}
