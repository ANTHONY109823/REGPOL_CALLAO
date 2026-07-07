/* divisiones-ui.js — UI compartida: divisiones REGPOL Callao */

(function injectDivisionesUiStyles() {
  if (document.getElementById('divisiones-ui-styles')) return;
  var s = document.createElement('style');
  s.id = 'divisiones-ui-styles';
  s.textContent = [
    '.uni-grid-activacion{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;align-items:start;}',
    '@media(max-width:1400px){.uni-grid-activacion{grid-template-columns:repeat(3,minmax(0,1fr));}}',
    '@media(max-width:1000px){.uni-grid-activacion{grid-template-columns:repeat(2,minmax(0,1fr));}}',
    '@media(max-width:640px){.uni-grid-activacion{grid-template-columns:1fr;}}',
    '.uni-div-col{border:1.5px solid #c8e6c9;border-radius:8px;overflow:hidden;background:#fff;box-shadow:0 1px 4px rgba(0,77,61,.06);}',
    '.uni-div-head{background:#004d3d;color:#fff;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.35px;padding:7px 9px;line-height:1.3;}',
    '.uni-div-head small{font-weight:500;opacity:.85;text-transform:none;}',
    '.uni-div-list{padding:6px 8px 8px;display:flex;flex-direction:column;gap:1px;max-height:none;}',
    '.uni-chk-item{display:flex;align-items:flex-start;gap:7px;font-size:11px;padding:4px 5px;border-radius:5px;cursor:pointer;line-height:1.3;}',
    '.uni-chk-item:hover{background:#f0f8f4;}',
    '.uni-chk-item input{margin-top:2px;flex-shrink:0;}',
    '.uni-chk-item span{flex:1;min-width:0;}'
  ].join('');
  document.head.appendChild(s);
})();

function normalizarNombreUnidad(n) {
  return String(n || '').trim().toUpperCase();
}

function unidadActiva(nombre, activas) {
  if (!activas || !activas.length) return false;
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
    cont.innerHTML = '<p style="color:#888;font-size:12px;padding:12px;">Cargando unidades...</p>';
    return;
  }

  var cols = divisiones.map(function(div) {
    var units = div.unidades || [];
    var items = units.map(function(u) {
      var nom = typeof u === 'string' ? u : (u.nombre || '');
      if (!nom) return '';
      var isOn = activas && activas.length
        ? activas.some(function(a) { return normalizarNombreUnidad(a) === normalizarNombreUnidad(nom); })
        : false;
      return '<label class="uni-chk-item">'
        + '<input type="checkbox" class="' + chkClass + '" value="' + escHtmlDiv(nom) + '"' + (isOn ? ' checked' : '') + ' title="Activar evaluación">'
        + '<span>' + escHtmlDiv(nom) + '</span>'
        + '</label>';
    }).filter(Boolean).join('');

    return '<div class="uni-div-col">'
      + '<div class="uni-div-head"><i class="fas fa-sitemap" style="margin-right:5px;"></i>'
      + escHtmlDiv(div.nombre) + ' <small>(' + units.length + ')</small></div>'
      + '<div class="uni-div-list">' + (items || '<span style="font-size:11px;color:#999;padding:4px;">Sin unidades</span>') + '</div>'
      + '</div>';
  });

  cont.innerHTML = '<div class="uni-grid-activacion">' + cols.join('') + '</div>';
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

var UNIDADES_EVAL_SIEMPRE = [];

function poblarSelectEvaluacionDivisiones(sel, divisiones, activas) {
  if (!sel) return;
  sel.innerHTML = '<option value="">-- Seleccionar dependencia --</option>';
  var total = 0;
  var agregadas = {};
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
      agregadas[normalizarNombreUnidad(nom)] = true;
      total++;
    });
    if (og.children.length) sel.appendChild(og);
  });
  UNIDADES_EVAL_SIEMPRE.forEach(function(nom) {
    if (agregadas[normalizarNombreUnidad(nom)]) return;
    if (activas && activas.length && !unidadActiva(nom, activas)) return;
    var op = document.createElement('option');
    op.value = nom;
    op.textContent = nom;
    sel.appendChild(op);
    total++;
  });
  return total;
}

function onFiltroDivisionCambio(selDivId, selUniId, divisiones, callbackCargar) {
  var div = document.getElementById(selDivId);
  var nombreDiv = div ? div.value : '';
  llenarSelectUnidadesAgrupadas(selUniId, divisiones, 'Todas las unidades', nombreDiv || null);
  if (callbackCargar) callbackCargar();
}
