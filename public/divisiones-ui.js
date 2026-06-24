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
    cont.innerHTML = '<p style="color:#888;font-size:12px;padding:12px;">Cargando unidades...</p>';
    return;
  }

  var filas = [];
  divisiones.forEach(function(div) {
    var units = div.unidades || [];
    filas.push(
      '<tr class="fila-division">'
        + '<td colspan="3" style="background:#004d3d;color:#fff;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.35px;">'
        + '<i class="fas fa-sitemap" style="margin-right:6px;"></i>' + escHtmlDiv(div.nombre)
        + ' <span style="font-weight:500;opacity:.85;">(' + units.length + ' unidades)</span></td>'
      + '</tr>'
    );
    units.forEach(function(u) {
      var nom = typeof u === 'string' ? u : (u.nombre || '');
      if (!nom) return;
      var isOn = activas && activas.length
        ? activas.some(function(a) { return normalizarNombreUnidad(a) === normalizarNombreUnidad(nom); })
        : false;
      filas.push(
        '<tr>'
          + '<td style="width:28%;font-size:11px;color:#666;">' + escHtmlDiv(div.nombre) + '</td>'
          + '<td><strong>' + escHtmlDiv(nom) + '</strong></td>'
          + '<td style="text-align:center;width:90px;">'
            + '<input type="checkbox" class="' + chkClass + '" value="' + escHtmlDiv(nom) + '"' + (isOn ? ' checked' : '') + ' title="Activar evaluación">'
          + '</td>'
        + '</tr>'
      );
    });
  });

  cont.innerHTML = '<table class="t" style="margin:0;">'
    + '<thead><tr><th>División</th><th>Dependencia</th><th style="text-align:center;width:90px;">Activa</th></tr></thead>'
    + '<tbody>' + filas.join('') + '</tbody></table>';
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
