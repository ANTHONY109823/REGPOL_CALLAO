/* comisarias.js — 20 Comisarías REGPOL Callao 2026 (orden oficial) */
var COMISARIAS_CALLAO = [
  'CIA CALLAO',
  'CIA BELLAVISTA',
  'CIA CIUDADELA CHALACA',
  'CIA CIUDAD DEL PESCADOR',
  'CIA RAMON CASTILLA',
  'CIA LA LEGUA',
  'CIA LA PERLA',
  'CIA LA PUNTA',
  'CIA JUAN INGUNZA',
  'CIA BOCANEGRA',
  'CIA MANUEL DULANTO',
  'CIA PLAYA RIMAC',
  'CIA CARMEN DE LA LEGUA',
  'CIA SARITA COLONIA',
  'CIA VENTANILLA',
  'CIA MI PERU',
  'CIA PACHACUTEC',
  'CIA VILLA LOS REYES',
  'CIA MARQUEZ',
  'CIA OQUENDO'
];

function poblarSelectComisarias(selectEl, placeholder) {
  var sel = typeof selectEl === 'string' ? document.getElementById(selectEl) : selectEl;
  if (!sel) return;

  var texto = placeholder || '-- Seleccionar comisaría --';
  sel.innerHTML = '<option value="">' + texto + '</option>';

  COMISARIAS_CALLAO.forEach(function(nombre) {
    var op = document.createElement('option');
    op.value = nombre;
    op.textContent = nombre;
    sel.appendChild(op);
  });
}

function agregarComisariasExtra(selectEl, extras) {
  var sel = typeof selectEl === 'string' ? document.getElementById(selectEl) : selectEl;
  if (!sel || !extras || !extras.length) return;

  var existentes = {};
  Array.prototype.forEach.call(sel.options, function(op) {
    if (op.value) existentes[op.value.toUpperCase()] = true;
  });

  extras.forEach(function(item) {
    var nombre = typeof item === 'string' ? item : (item.nombre || item);
    if (!nombre) return;
    var key = nombre.toUpperCase();
    if (existentes[key]) return;
    existentes[key] = true;
    var op = document.createElement('option');
    op.value = nombre;
    op.textContent = nombre + ' (hoja)';
    sel.appendChild(op);
  });
}

function seleccionarComisariaEnSelect(selectEl, valor) {
  var sel = typeof selectEl === 'string' ? document.getElementById(selectEl) : selectEl;
  if (!sel || !valor) return;
  var buscado = valor.toUpperCase();
  for (var i = 0; i < sel.options.length; i++) {
    if (sel.options[i].value.toUpperCase() === buscado) {
      sel.selectedIndex = i;
      return;
    }
  }
}
