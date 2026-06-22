/* divisiones-ui.js — UI compartida: 4 divisiones REGPOL Callao */

function normalizarNombreUnidad(n) {
  return String(n || '').trim().toUpperCase();
}

function unidadActiva(nombre, activas) {
  if (!activas || !activas.length) return true;
  var key = normalizarNombreUnidad(nombre);
  return activas.some(function(a) { return normalizarNombreUnidad(a) === key; });
}

function guardarDivisionesEnVentana(divisiones) {
  window._divisionesData = divisiones || [];
}

function renderCheckboxesPorDivision(contId, divisiones, activas, chkClass) {
  var cont = document.getElementById(contId);
  if (!cont) return;
  if (!divisiones || !divisiones.length) {
    cont.innerHTML = '<p style="color:#888;font-size:12px;">Cargando unidades...</p>';
    return;
  }
  cont.style.display = 'block';
  cont.style.gridTemplateColumns = '1fr';
  cont.style.gap = '14px';
  cont.innerHTML = divisiones.map(function(div) {
    var units = div.unidades || [];
    var checks = units.map(function(u) {
      var nom = typeof u === 'string' ? u : (u.nombre || '');
      if (!nom) return '';
      var isOn = activas && activas.length
        ? activas.some(function(a) { return normalizarNombreUnidad(a) === normalizarNombreUnidad(nom); })
        : false;
      return '<label style="font-size:12px;display:flex;align-items:flex-start;gap:6px;cursor:pointer;line-height:1.3;">'
        + '<input type="checkbox" class="' + chkClass + '" value="' + escHtmlDiv(nom) + '"' + (isOn ? ' checked' : '') + '> '
        + '<span>' + escHtmlDiv(nom) + '</span></label>';
    }).join('');

    return '<div class="bloque-division" style="border:1.5px solid #c8e6c9;border-radius:8px;padding:12px;background:#fff;">'
      + '<div style="font-weight:700;color:#004d3d;font-size:13px;margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid #e8f5e9;">'
      + '<i class="fas fa-sitemap" style="margin-right:6px;"></i>' + escHtmlDiv(div.nombre)
      + ' <span style="font-weight:400;color:#888;font-size:11px;">(' + units.length + ' unidades)</span></div>'
      + '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;">' + checks + '</div>'
      + '</div>';
  }).join('');
}

function escHtmlDiv(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function llenarSelectDivisiones(selId, divisiones, placeholder) {
  var sel = document.getElementById(selId);
  if (!sel) return;
  sel.innerHTML = '<option value="">' + (placeholder || 'Todas las divisiones') + '</option>';
  (divisiones || []).forEach(function(div) {
    var op = document.createElement('option');
    op.value = div.nombre;
    op.textContent = div.nombre;
    sel.appendChild(op);
  });
}

function llenarSelectUnidadesAgrupadas(selId, divisiones, placeholder, filtroDivision) {
  var sel = document.getElementById(selId);
  if (!sel) return;
  sel.innerHTML = '<option value="">' + (placeholder || '— Seleccionar unidad —') + '</option>';
  var lista = divisiones || [];
  if (filtroDivision) {
    lista = lista.filter(function(d) { return d.nombre === filtroDivision; });
  }
  lista.forEach(function(div) {
    var og = document.createElement('optgroup');
    og.label = div.nombre;
    (div.unidades || []).forEach(function(u) {
      var nom = typeof u === 'string' ? u : (u.nombre || '');
      if (!nom) return;
      var op = document.createElement('option');
      op.value = nom;
      op.textContent = nom;
      og.appendChild(op);
    });
    if (og.children.length) sel.appendChild(og);
  });
}

function poblarSelectEvaluacionDivisiones(sel, divisiones, activas) {
  if (!sel) return;
  sel.innerHTML = '<option value="">-- Seleccionar dependencia --</option>';
  var total = 0;
  (divisiones || []).forEach(function(div) {
    var og = document.createElement('optgroup');
    og.label = div.nombre;
    (div.unidades || []).forEach(function(u) {
      var nom = typeof u === 'string' ? u : (u.nombre || '');
      if (!nom || !unidadActiva(nom, activas)) return;
      var op = document.createElement('option');
      op.value = nom;
      op.textContent = nom;
      og.appendChild(op);
      total++;
    });
    if (og.children.length) sel.appendChild(og);
  });
  return total;
}

function onFiltroDivisionCambio(selDivId, selUniId, divisiones, callbackCargar) {
  var div = document.getElementById(selDivId);
  var nombreDiv = div ? div.value : '';
  llenarSelectUnidadesAgrupadas(selUniId, divisiones, 'Todas las unidades', nombreDiv || null);
  if (callbackCargar) callbackCargar();
}
