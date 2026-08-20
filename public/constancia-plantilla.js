(function (global) {
  var DEFAULTS = {
    modal_titulo: 'Documentación aprobada',
    modal_mensaje: 'Su documentación fue aprobada. Ya ocupa una vacante (ingreso {modo}). Descargue su constancia y preséntese en la comisaría o en la fecha de formación según lo indicado.',
    encabezado: 'MINISTERIO DEL INTERIOR\nPOLICÍA NACIONAL DEL PERÚ\nREGIÓN POLICIAL CALLAO\nSEC-OFIADM - OFIBAP',
    titulo: 'CONSTANCIA DE NOMBRAMIENTO PARA EL SERVICIO POLICIAL EXTRAORDINARIO COMPLEMENTARIO A LA FUNCIÓN POLICIAL',
    mostrar_qr: true,
    seccion1_titulo: '1. Datos del efectivo',
    label_grado: 'Grado',
    label_nombres: 'Apellidos y nombres',
    label_cip: 'CIP',
    label_dni: 'DNI',
    label_codifin: 'CODIFIN',
    label_celular: 'Celular',
    label_unidad: 'Unidad de origen',
    seccion2_titulo: '2. Datos del convenio / vacante',
    label_convenio: 'Convenio',
    label_origen: 'Origen de ingreso',
    label_comisaria: 'Comisaría asignada',
    label_uniforme: 'Uniforme',
    seccion3_titulo: '3. Presentación y turno de trabajo',
    label_presentarse: 'Dónde presentarse (punto de concentración)',
    label_concentracion: 'Punto / lugar de concentración',
    label_turno: 'Turno de trabajo',
    label_indicaciones: 'Indicaciones adicionales',
    fallback_presentarse: 'Según indicación de Convenios',
    fallback_concentracion: 'Por confirmar',
    fallback_indicaciones: 'Consultar con el área de Convenios',
    aviso_titulo: 'Importante — documentación original:',
    aviso_texto: 'El día que se presente a la comisaría o formación, debe llevar en físico la documentación original completa que subió en PDF al portal (misma documentación del expediente digital). Sin ella no se concretará su incorporación.',
    aprobacion_titulo: 'Aprobación del expediente:',
    aprobacion_por: 'Aprobado por:',
    aprobacion_fecha: 'Fecha y hora:',
    aprobacion_pendiente: 'Pendiente de registro del aprobador en el sistema.',
    fecha_prefijo: 'Callao,',
    pie_linea1: 'Oficina de Bienestar / Convenios — REGPOL Callao',
    pie_linea2: 'Documento verificable por QR · {modo}',
    pie_linea3: 'La inasistencia injustificada o el incumplimiento del uniforme dará lugar a desactivación inmediata.'
  };

  var GRUPOS = [
    {
      id: 'modal',
      titulo: 'Modal (lo que ve el ganador al abrir)',
      campos: [
        { key: 'modal_titulo', label: 'Título del modal', tipo: 'text' },
        { key: 'modal_mensaje', label: 'Mensaje encima de la constancia', tipo: 'textarea', hint: 'Puede usar {modo} (Por sorteo / Por repechaje).' }
      ]
    },
    {
      id: 'membrete',
      titulo: 'Membrete y título del documento',
      campos: [
        { key: 'encabezado', label: 'Membrete (una institución por línea)', tipo: 'textarea' },
        { key: 'titulo', label: 'Título de la constancia', tipo: 'textarea' },
        { key: 'mostrar_qr', label: 'Mostrar código QR de verificación', tipo: 'check' }
      ]
    },
    {
      id: 's1',
      titulo: '1. Datos del efectivo — etiquetas',
      campos: [
        { key: 'seccion1_titulo', label: 'Título de la sección', tipo: 'text' },
        { key: 'label_grado', label: 'Etiqueta Grado', tipo: 'text' },
        { key: 'label_nombres', label: 'Etiqueta Apellidos y nombres', tipo: 'text' },
        { key: 'label_cip', label: 'Etiqueta CIP', tipo: 'text' },
        { key: 'label_dni', label: 'Etiqueta DNI', tipo: 'text' },
        { key: 'label_codifin', label: 'Etiqueta CODIFIN', tipo: 'text' },
        { key: 'label_celular', label: 'Etiqueta Celular', tipo: 'text' },
        { key: 'label_unidad', label: 'Etiqueta Unidad de origen', tipo: 'text' }
      ]
    },
    {
      id: 's2',
      titulo: '2. Datos del convenio / vacante — etiquetas',
      campos: [
        { key: 'seccion2_titulo', label: 'Título de la sección', tipo: 'text' },
        { key: 'label_convenio', label: 'Etiqueta Convenio', tipo: 'text' },
        { key: 'label_origen', label: 'Etiqueta Origen de ingreso', tipo: 'text' },
        { key: 'label_comisaria', label: 'Etiqueta Comisaría asignada', tipo: 'text' },
        { key: 'label_uniforme', label: 'Etiqueta Uniforme', tipo: 'text' }
      ]
    },
    {
      id: 's3',
      titulo: '3. Presentación y turno — etiquetas y textos de respaldo',
      campos: [
        { key: 'seccion3_titulo', label: 'Título de la sección', tipo: 'text' },
        { key: 'label_presentarse', label: 'Etiqueta Dónde presentarse', tipo: 'text' },
        { key: 'label_concentracion', label: 'Etiqueta Punto / lugar de concentración', tipo: 'text' },
        { key: 'label_indicaciones', label: 'Etiqueta Indicaciones adicionales', tipo: 'text' },
        { key: 'fallback_presentarse', label: 'Texto si no hay lugar de presentación', tipo: 'text' },
        { key: 'fallback_concentracion', label: 'Texto si no hay punto de concentración', tipo: 'text' },
        { key: 'fallback_indicaciones', label: 'Texto si no hay indicaciones', tipo: 'textarea' }
      ]
    },
    {
      id: 'aviso',
      titulo: 'Aviso de documentación original',
      campos: [
        { key: 'aviso_titulo', label: 'Título del aviso', tipo: 'text' },
        { key: 'aviso_texto', label: 'Texto del aviso', tipo: 'textarea' }
      ]
    },
    {
      id: 'cierre',
      titulo: 'Aprobación, fecha y pie',
      campos: [
        { key: 'aprobacion_titulo', label: 'Título del bloque de aprobación', tipo: 'text' },
        { key: 'aprobacion_por', label: 'Etiqueta Aprobado por', tipo: 'text' },
        { key: 'aprobacion_fecha', label: 'Etiqueta Fecha y hora', tipo: 'text' },
        { key: 'aprobacion_pendiente', label: 'Texto si aún no hay aprobador', tipo: 'textarea' },
        { key: 'fecha_prefijo', label: 'Prefijo de fecha (ej. Callao,)', tipo: 'text' },
        { key: 'pie_linea1', label: 'Pie — línea 1', tipo: 'text' },
        { key: 'pie_linea2', label: 'Pie — línea 2', tipo: 'text', hint: 'Puede usar {modo}.' },
        { key: 'pie_linea3', label: 'Pie — línea 3 (sanciones)', tipo: 'textarea' }
      ]
    }
  ];

  function merge(saved) {
    var out = {};
    Object.keys(DEFAULTS).forEach(function (k) {
      if (k === 'mostrar_qr') {
        if (saved && typeof saved.mostrar_qr === 'boolean') out.mostrar_qr = saved.mostrar_qr;
        else if (saved && (saved.mostrar_qr === '0' || saved.mostrar_qr === 0 || saved.mostrar_qr === 'false')) out.mostrar_qr = false;
        else out.mostrar_qr = DEFAULTS.mostrar_qr;
        return;
      }
      if (saved && saved[k] != null && String(saved[k]).length) out[k] = String(saved[k]);
      else out[k] = DEFAULTS[k];
    });
    return out;
  }

  function parseSlotPostula(texto) {
    var s = String(texto || '').trim();
    if (!s) return { lugar: '', turno: '', dia: '' };
    if (s.indexOf('|') >= 0) {
      var p = s.split('|').map(function (x) { return String(x || '').trim(); });
      return { lugar: p[0] || '', turno: p[1] || '', dia: p[2] || '' };
    }
    var m = s.match(/^(.+?)\s*[—\-]\s*([A-ZÁÉÍÓÚÑÜ0-9 ]+?)\s*\/\s*([A-ZÁÉÍÓÚÑÜ\/]+)\s*$/i);
    if (m) {
      return { lugar: String(m[1] || '').trim(), turno: String(m[2] || '').trim(), dia: String(m[3] || '').trim() };
    }
    return { lugar: s, turno: '', dia: '' };
  }

  function applyVars(txt, vars) {
    return String(txt || '').replace(/\{(\w+)\}/g, function (_, k) {
      return vars && vars[k] != null ? String(vars[k]) : '';
    });
  }

  function escDefault(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function nl2brEsc(s, esc) {
    return esc(s).replace(/\n/g, '<br>');
  }

  function htmlSheet(ins, tpl, opts) {
    ins = ins || {};
    tpl = merge(tpl);
    opts = opts || {};
    var esc = opts.esc || escDefault;
    var qrFn = opts.qrUrl || function () { return ''; };
    var fechaHoy = opts.fechaHoy || '';
    var token = ins.token_constancia || '';
    var verify = opts.verifyUrl || '';
    var modo = ins.modo_ingreso_label || (ins.modo_ingreso === 'repechaje' ? 'Por repechaje' : 'Por sorteo');
    var vars = { modo: modo };
    var lugar = String(ins.lugar || '').trim();
    var cia = String(ins.comisaria_postula || '').trim();
    var slot = parseSlotPostula(cia);
    var autoTurno = '';
    if (slot.turno && slot.dia) autoTurno = slot.turno + ' / ' + slot.dia;
    else if (slot.turno) autoTurno = slot.turno;
    var punto = String(ins.constancia_concentracion || ins.constancia_presentarse || '').trim()
      || slot.lugar || lugar || tpl.fallback_concentracion;
    var autoIndicaciones = String(ins.contactos_responsables || '').trim() || tpl.fallback_indicaciones;
    var indicaciones = String(ins.constancia_indicaciones || '').trim() || autoIndicaciones;
    var turnoTrabajo = autoTurno;
    var aprobNombre = String(ins.aprobado_por_nombre || '').trim();
    var aprobFecha = String(ins.fecha_aprobacion_legible || '').trim();
    if (!aprobFecha && ins.fecha_aprobacion) {
      try {
        aprobFecha = new Date(ins.fecha_aprobacion).toLocaleString('es-PE', {
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit', hour12: true
        });
      } catch (e) { aprobFecha = String(ins.fecha_aprobacion); }
    }

    function fila(label, valor, full) {
      if (!valor) return '';
      return '<div class="c-item' + (full ? ' full' : '') + '"><span>' + esc(label) + '</span><strong>' + esc(valor) + '</strong></div>';
    }

    var html = '<div class="c-head">'
      + '<div class="c-inst">' + nl2brEsc(tpl.encabezado, esc) + '</div>'
      + ((tpl.mostrar_qr !== false && token) ? ('<div class="c-qr"><img alt="QR" src="' + esc(qrFn(verify || token)) + '"/></div>') : '')
      + '</div>'
      + '<h2>' + esc(tpl.titulo) + '</h2>'
      + '<div class="c-sec"><div class="c-sec-tit">' + esc(tpl.seccion1_titulo) + '</div><div class="c-grid">'
      + fila(tpl.label_grado, ins.grado || '—')
      + fila(tpl.label_nombres, ins.nombres || '—')
      + fila(tpl.label_cip, ins.cip || '—')
      + fila(tpl.label_dni, ins.dni || '—')
      + fila(tpl.label_codifin, ins.codifin || '—')
      + fila(tpl.label_celular, ins.telefono || '—')
      + fila(tpl.label_unidad, ins.unidad || '—')
      + '</div></div>'
      + '<div class="c-sec"><div class="c-sec-tit">' + esc(tpl.seccion2_titulo) + '</div><div class="c-grid">'
      + fila(tpl.label_convenio, ins.convocatoria || '—', true)
      + fila(tpl.label_origen, modo)
      + fila(tpl.label_uniforme, ins.uniforme || '—', true)
      + '</div></div>'
      + '<div class="c-sec"><div class="c-sec-tit">' + esc(tpl.seccion3_titulo) + '</div><div class="c-grid">'
      + fila(tpl.label_presentarse, punto, true)
      + fila(tpl.label_turno, turnoTrabajo || '—', true)
      + fila(tpl.label_indicaciones, indicaciones, true)
      + '</div></div>'
      + '<div class="c-aviso"><strong>' + esc(tpl.aviso_titulo) + '</strong> ' + esc(tpl.aviso_texto) + '</div>'
      + '<div class="c-aprob"><strong>' + esc(tpl.aprobacion_titulo) + '</strong><br>'
      + (aprobNombre
        ? (esc(tpl.aprobacion_por) + ' <strong>' + esc(aprobNombre) + '</strong>'
          + (aprobFecha ? (' · ' + esc(tpl.aprobacion_fecha) + ' <strong>' + esc(aprobFecha) + '</strong>') : ''))
        : esc(tpl.aprobacion_pendiente))
      + '</div>'
      + '<div class="c-fecha">' + esc(tpl.fecha_prefijo) + ' ' + esc(fechaHoy) + '</div>'
      + '<div class="c-pie">' + esc(tpl.pie_linea1) + '<br>'
      + esc(applyVars(tpl.pie_linea2, vars))
      + '<br>' + esc(tpl.pie_linea3) + '</div>';
    return html;
  }

  function mensajeModal(tpl, ins) {
    tpl = merge(tpl);
    ins = ins || {};
    var modo = ins.modo_ingreso_label || (ins.modo_ingreso === 'repechaje' ? 'Por repechaje' : 'Por sorteo');
    return applyVars(tpl.modal_mensaje, { modo: modo });
  }

  global.ConstanciaNombramiento = {
    DEFAULTS: DEFAULTS,
    GRUPOS: GRUPOS,
    merge: merge,
    applyVars: applyVars,
    htmlSheet: htmlSheet,
    mensajeModal: mensajeModal
  };
})(typeof window !== 'undefined' ? window : this);
