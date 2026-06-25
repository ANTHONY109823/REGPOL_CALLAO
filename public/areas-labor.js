/* Áreas de labor — lista única para evaluación MMPI-2 e inscripciones (convenios/cursos) */
(function (global) {
  var AREAS = [
    'JEFE DE UNIDAD', 'OFICIAL DE PERMANENCIA', 'FAMILIA', 'DELITOS', 'TRANSITO', 'OPC',
    'GUARDIA PREVENCION', 'ARMERIA', 'COPIA CERITIFICADA', 'LOGISTICA', 'MESA DE PARTES',
    'ADMINISTRACION', 'MORAL Y DISCIPLINA', 'PERSONAL', 'PATRULLAJE MOTORIZADO', 'PATRULLAJE A PIE'
  ];
  var OTRO_VAL = 'OTRO';

  function escAttr(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  global.REGPOL_AREAS_LABOR = AREAS;

  global.regpolHtmlOpcionesArea = function (ph) {
    ph = ph || '— Seleccionar área —';
    return '<option value="">' + escAttr(ph) + '</option>'
      + AREAS.map(function (a) { return '<option value="' + escAttr(a) + '">' + escAttr(a) + '</option>'; }).join('')
      + '<option value="' + OTRO_VAL + '">OTRO (especificar)</option>';
  };

  global.regpolPoblarSelectArea = function (selectEl, ph) {
    if (!selectEl) return;
    selectEl.innerHTML = global.regpolHtmlOpcionesArea(ph);
  };

  global.regpolToggleAreaOtro = function (selectId, boxId, inputId) {
    var sel = typeof selectId === 'string' ? document.getElementById(selectId) : selectId;
    var box = typeof boxId === 'string' ? document.getElementById(boxId) : boxId;
    var inp = typeof inputId === 'string' ? document.getElementById(inputId) : inputId;
    var show = sel && sel.value === OTRO_VAL;
    if (box) box.style.display = show ? '' : 'none';
    if (inp) {
      if (show) inp.setAttribute('required', 'required');
      else { inp.removeAttribute('required'); inp.value = ''; }
    }
  };

  global.regpolObtenerArea = function (selectId, otroId) {
    var sel = document.getElementById(selectId);
    if (!sel) return '';
    if (sel.value === OTRO_VAL) {
      var otro = document.getElementById(otroId);
      return otro ? otro.value.trim() : '';
    }
    return sel.value.trim();
  };

  global.regpolRestaurarArea = function (selectId, otroId, boxId, valor) {
    var sel = document.getElementById(selectId);
    if (!sel) return;
    if (!valor) {
      sel.value = '';
      global.regpolToggleAreaOtro(selectId, boxId, otroId);
      return;
    }
    if (AREAS.indexOf(valor) !== -1) sel.value = valor;
    else {
      sel.value = OTRO_VAL;
      var otro = document.getElementById(otroId);
      if (otro) otro.value = valor;
    }
    global.regpolToggleAreaOtro(selectId, boxId, otroId);
  };
})(typeof window !== 'undefined' ? window : this);
