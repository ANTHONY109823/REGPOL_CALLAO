/*
  pdf_gen.js — Generador de PDFs para REGPOL Callao
  Cuestionario Psicológico — UNITIC — 2026
*/

const PDFDocument = require('pdfkit');
const { spawnSync } = require('child_process');
const path = require('path');
const PREGUNTAS_DEFAULT = require('./preguntas_data.json');

const MMPI2_EXCEL_PATH = path.join(__dirname, '..', '..', 'Downloads', 'MMPI-2.xls');
const MMPI2_SCRIPT_PATH = path.join(__dirname, 'mmpi2_score.py');

const ESCALAS_MMPI2 = [
  'L — Mentira',
  'F — Infrecuencia',
  'K — Corrección',
  '1 — Hipocondría',
  '2 — Depresión',
  '3 — Histeria',
  '4 — Psicopatía',
  '5 — Masculinidad/Feminidad',
  '6 — Paranoia',
  '7 — Psicastenia',
  '8 — Esquizofrenia',
  '9 — Hipomanía',
  '0 — Introversión Social'
];

const COLOR_VERDE  = '#004d3d';
const COLOR_ORO    = '#c8a94a';
const COLOR_GRIS   = '#555555';
const COLOR_NEGRO  = '#1a1a1a';
const COLOR_LINEA  = '#cccccc';

const MATRIZ_COL_GAP   = 2;
const TOTAL_PREGUNTAS  = 566;
const A4_W         = 595.28;
const A4_H         = 841.89;

// ── Cabecera compacta (listados) ───────────────────────────────────────────────
function dibujarCabeceraLista(doc) {
  doc.rect(0, 0, doc.page.width, 52).fill(COLOR_VERDE);
  doc.rect(0, 52, doc.page.width, 3).fill(COLOR_ORO);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(12)
     .text('POLICÍA NACIONAL DEL PERÚ — REGPOL CALLAO', 40, 14, { align: 'center', width: doc.page.width - 80, lineBreak: false });
  doc.font('Helvetica').fontSize(9)
     .text('Listado de evaluaciones psicológicas', 40, 32, { align: 'center', width: doc.page.width - 80, lineBreak: false });
}

function contarRespuestas(ev) {
  try {
    const r = typeof ev.respuestas === 'string' ? JSON.parse(ev.respuestas || '{}') : (ev.respuestas || {});
    const vals = Object.keys(r).filter(function(k) { return r[k] === 'V' || r[k] === 'F'; });
    return {
      total: vals.length,
      v: vals.filter(function(k) { return r[k] === 'V'; }).length,
      f: vals.filter(function(k) { return r[k] === 'F'; }).length,
      respuestas: r
    };
  } catch (e) {
    return { total: 0, v: 0, f: 0, respuestas: {} };
  }
}

function parseRespuestas(evaluacion) {
  try {
    return typeof evaluacion.respuestas === 'string'
      ? JSON.parse(evaluacion.respuestas || '{}')
      : (evaluacion.respuestas || {});
  } catch (e) {
    return {};
  }
}

function maxItemRespondido(resp) {
  let max = 0;
  Object.keys(resp || {}).forEach(function(k) {
    const v = resp[k];
    if (v === 'V' || v === 'F') {
      const n = parseInt(k, 10);
      if (!isNaN(n) && n > max) max = n;
    }
  });
  return max;
}

function resolverEdad(ev) {
  if (!ev) return null;
  const e = parseInt(ev.edad, 10);
  if (e > 0) return e;
  if (!ev.fecha_nac) return null;
  const nac = new Date(ev.fecha_nac);
  if (isNaN(nac.getTime())) return null;
  const hoy = new Date();
  let edad = hoy.getFullYear() - nac.getFullYear();
  const m = hoy.getMonth() - nac.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
  return edad > 0 ? edad : null;
}

function dibujarFilaTabla(doc, x0, y, W, cols, celdas, opts) {
  const rowH = (opts && opts.rowH) || 16;
  const esHeader = opts && opts.header;
  const par = opts && opts.par;
  const bg = esHeader ? COLOR_VERDE : (par ? '#f7faf7' : '#ffffff');
  doc.rect(x0, y, W, rowH).fill(bg);
  if (!esHeader) doc.rect(x0, y, W, rowH).stroke('#e0e8e0');
  let tx = x0;
  celdas.forEach(function(c, i) {
    doc.fillColor(esHeader ? '#ffffff' : (i === 0 ? COLOR_VERDE : COLOR_NEGRO))
       .font((esHeader || i === 1) ? 'Helvetica-Bold' : 'Helvetica')
       .fontSize(esHeader ? 8 : 7.5)
       .text(String(c == null ? '—' : c), tx + 4, y + (esHeader ? 4 : 3), {
         width: cols[i] - 8,
         lineBreak: false,
         ellipsis: true
       });
    tx += cols[i];
  });
}

function dibujarCabecera(doc) {
  doc.rect(0, 0, doc.page.width, 70).fill(COLOR_VERDE);
  doc.rect(0, 70, doc.page.width, 3).fill(COLOR_ORO);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(13)
     .text('POLICÍA NACIONAL DEL PERÚ', 40, 14, { align: 'center', width: doc.page.width - 80, lineBreak: false });
  doc.font('Helvetica').fontSize(10)
     .text('REGIÓN POLICIAL CALLAO — UNITIC', 40, 30, { align: 'center', width: doc.page.width - 80, lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(9).fillColor(COLOR_ORO)
     .text('EVALUACIÓN MMPI-2 — BIENESTAR DEL PERSONAL POLICIAL', 40, 46, { align: 'center', width: doc.page.width - 80, lineBreak: false });
}

function yPieSeguro(doc, altoPie) {
  return doc.page.height - doc.page.margins.bottom - altoPie;
}

function dibujarPie(doc, pagina, totalPaginas) {
  const altoPie = 28;
  const y = yPieSeguro(doc, altoPie);
  doc.rect(0, y - 5, doc.page.width, altoPie + 8).fill('#eeeeee');
  doc.rect(0, y - 5, doc.page.width, 2).fill(COLOR_ORO);
  doc.fillColor(COLOR_GRIS).font('Helvetica').fontSize(7.5)
     .text('REGPOL CALLAO — UNITIC 2026 — Documento confidencial de uso psicológico exclusivo',
           40, y + 2, { align: 'left', width: 350, lineBreak: false });
  doc.text('Pág. ' + pagina + ' / ' + totalPaginas,
           doc.page.width - 100, y + 2, { align: 'right', width: 60, lineBreak: false });
}

function formatearArmamentoLegible(arm) {
  if (!arm || arm === 'Sin armamento') return 'Ninguno';
  return String(arm).split(',')
    .map(function(s) {
      s = s.trim().replace(/^ARMAMENTO\s+/i, '');
      if (/^particular$/i.test(s) || /particular/i.test(s)) return 'Particular';
      if (/^del\s+estado$/i.test(s) || /del estado/i.test(s)) return 'Del Estado';
      return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
    })
    .filter(Boolean)
    .join(', ') || 'Ninguno';
}

function formatearFechaPDF(valor) {
  if (!valor) return '—';
  if (valor instanceof Date && !isNaN(valor.getTime())) {
    return valor.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  const s = String(valor);
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[3] + '/' + iso[2] + '/' + iso[1];
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
  return s.length > 16 ? s.substring(0, 16) : s;
}

function formatearGradoDisplay(grado) {
  const g = String(grado || '').trim();
  return g ? g.toUpperCase() : '—';
}

// ── Encabezado del efectivo — banner plomo con grado, datos y foto ─────────────
function dibujarEncabezadoEfectivo(doc, x0, y, W, ev, totalV, totalF) {
  const tieneFoto = ev.foto && String(ev.foto).length > 80;
  const fotoW = 56;
  const fotoH = 68;
  const pad = 8;
  const bannerH = 88;
  const textoW = tieneFoto ? W - fotoW - pad * 3 : W - pad * 2;

  doc.rect(x0, y, W, bannerH).fill('#ececec').stroke('#c8c8c8');

  const gradoTxt = formatearGradoDisplay(ev.grado);
  const nombreTxt = String(ev.nombres || '—').toUpperCase();
  const edadTxt = (function() {
    const e = resolverEdad(ev);
    return e ? e + ' AÑOS' : '—';
  })();
  const sexoTxt = String(ev.sexo || '—').toUpperCase();
  const cargoTxt = String(ev.cargo || '—').toUpperCase();
  const armaTxt = formatearArmamentoLegible(ev.armamento || '').toUpperCase();
  const fechaTxt = formatearFechaPDF(ev.fecha);

  let ty = y + pad;
  doc.fillColor(COLOR_VERDE).font('Helvetica-Bold').fontSize(7.5)
     .text(gradoTxt, x0 + pad, ty, { width: textoW, lineBreak: false, ellipsis: true });
  ty += 11;
  doc.fillColor(COLOR_NEGRO).font('Helvetica-Bold').fontSize(10.5)
     .text(nombreTxt, x0 + pad, ty, { width: textoW, lineBreak: false, ellipsis: true });
  ty += 13;
  doc.font('Helvetica').fontSize(7.5).fillColor(COLOR_NEGRO)
     .text('CIP: ' + String(ev.cip || '—').toUpperCase() + '          DNI: ' + String(ev.dni || '—').toUpperCase(),
       x0 + pad, ty, { width: textoW, lineBreak: false });
  ty += 10;
  doc.text('EDAD: ' + edadTxt + '          SEXO: ' + sexoTxt, x0 + pad, ty, { width: textoW, lineBreak: false });
  ty += 10;
  doc.text('CARGO: ' + cargoTxt, x0 + pad, ty, { width: textoW, lineBreak: false, ellipsis: true });
  ty += 10;
  doc.text('ARMA: ' + armaTxt, x0 + pad, ty, { width: Math.min(textoW, W * 0.62), lineBreak: false, ellipsis: true });

  if (tieneFoto) {
    const fotoX = x0 + W - fotoW - pad;
    const fotoY = y + (bannerH - fotoH) / 2;
    try {
      doc.save();
      doc.rect(fotoX, fotoY, fotoW, fotoH).clip();
      doc.image(ev.foto, fotoX, fotoY, { fit: [fotoW, fotoH], align: 'center', valign: 'center' });
      doc.restore();
      doc.rect(fotoX, fotoY, fotoW, fotoH).stroke('#aaaaaa');
    } catch (e) {}
  }

  doc.fillColor('#1a7a3a').font('Helvetica-Bold').fontSize(7.5)
     .text('V: ' + totalV, x0 + W * 0.58, y + bannerH - 14, { lineBreak: false });
  doc.fillColor('#7a1a1a')
     .text('F: ' + totalF, x0 + W * 0.66, y + bannerH - 14, { lineBreak: false });
  doc.fillColor(COLOR_GRIS).font('Helvetica').fontSize(7)
     .text('Fecha: ' + fechaTxt, x0 + W * 0.74, y + bannerH - 14, { width: W * 0.24, align: 'right', lineBreak: false });

  return y + bannerH;
}

// ── Matriz vertical dinámica — llena el A4 (N° + V/F) ───────────────────────
function calcularLayoutMatriz(y0, maxY, W, totalIds) {
  for (let rowH = 8; rowH <= 10.5; rowH += 0.25) {
    const filasPorCol = Math.floor((maxY - y0) / rowH);
    if (filasPorCol < 45) continue;
    const numCols = Math.ceil(totalIds / filasPorCol);
    if (numCols < 1 || numCols > 16) continue;
    const colW = (W - MATRIZ_COL_GAP * Math.max(numCols - 1, 0)) / numCols;
    if (colW < 24) continue;
    if (numCols * filasPorCol >= totalIds) {
      return { rowH: rowH, filasPorCol: filasPorCol, colsPorPagina: numCols };
    }
  }
  const filasPorCol = 57;
  const rowH = 8.5;
  const colsPorPagina = Math.max(1, Math.floor((W + MATRIZ_COL_GAP) / (26 + MATRIZ_COL_GAP)));
  return { rowH: rowH, filasPorCol: filasPorCol, colsPorPagina: colsPorPagina };
}

function totalColumnasMatriz(totalIds, filasPorCol) {
  return Math.ceil(totalIds / filasPorCol);
}

function dibujarMatrizColumnas(doc, x0, y0, W, maxY, resp, totalIds, layout, colDesde, colHasta) {
  const colsEnPagina = colHasta - colDesde;
  const colW = (W - MATRIZ_COL_GAP * Math.max(colsEnPagina - 1, 0)) / colsEnPagina;
  const numW = Math.min(15, Math.max(12, Math.floor(colW * 0.36)));
  const boxW = Math.max(9, colW - numW - 1);
  const rowH = layout.rowH;
  const filasPorCol = layout.filasPorCol;

  for (let ci = colDesde; ci < colHasta; ci++) {
    const cx = x0 + (ci - colDesde) * (colW + MATRIZ_COL_GAP);
    for (let r = 0; r < filasPorCol; r++) {
      const id = ci * filasPorCol + r + 1;
      if (id > totalIds) continue;
      const cy = y0 + r * rowH;
      if (cy + rowH > maxY) return;

      const ans = resp[id] || resp[String(id)] || '';
      doc.fillColor(COLOR_VERDE).font('Helvetica-Bold').fontSize(6)
         .text(String(id), cx, cy + 1.5, { width: numW, lineBreak: false, align: 'right' });
      const bx = cx + numW + 1;
      doc.rect(bx, cy + 0.5, boxW, rowH - 2)
        .fill(ans === 'V' ? '#e8f5ec' : (ans === 'F' ? '#fdeaea' : '#f4f4f4'))
        .stroke('#cccccc');
      if (ans) {
        doc.fillColor(ans === 'V' ? '#1a7a3a' : '#7a1a1a').font('Helvetica-Bold').fontSize(6)
           .text(ans, bx, cy + 1.5, { width: boxW, align: 'center', lineBreak: false });
      }
    }
  }
}

function dibujarPaginasMatrizRespuestas(doc, evaluacion, resp, x0, W, maxY) {
  const totalIds = TOTAL_PREGUNTAS;
  const yMatriz = 90;
  const layout = calcularLayoutMatriz(yMatriz, maxY, W, totalIds);
  const totalCols = totalColumnasMatriz(totalIds, layout.filasPorCol);
  const colsPorPagina = layout.colsPorPagina;
  const totalPaginas = Math.ceil(totalCols / colsPorPagina);

  for (let p = 0; p < totalPaginas; p++) {
    const colDesde = p * colsPorPagina;
    const colHasta = Math.min(colDesde + colsPorPagina, totalCols);
    doc.addPage();
    dibujarCabecera(doc);
    let y = 74;
    doc.fillColor(COLOR_VERDE).font('Helvetica-Bold').fontSize(8.5)
       .text(p === 0 ? 'MATRIZ DE RESPUESTAS — N° / V o F' : 'MATRIZ DE RESPUESTAS (continuación)',
         x0, y, { width: W, lineBreak: false });
    y += 9;
    const itemDesde = colDesde * layout.filasPorCol + 1;
    const itemHasta = Math.min(colHasta * layout.filasPorCol, totalIds);
    doc.fillColor(COLOR_GRIS).font('Helvetica').fontSize(6.5)
       .text('Ítems ' + itemDesde + '–' + itemHasta + ' de 566 · V/F · ' + (evaluacion.nombres || '—'),
         x0, y, { width: W, lineBreak: false, ellipsis: true });
    y += 8;
    dibujarMatrizColumnas(doc, x0, y, W, maxY, resp, totalIds, layout, colDesde, colHasta);
  }
}

// ── Pies de página en todas las hojas (bufferPages) ───────────────────────────
function aplicarPiesEnTodas(doc) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    dibujarPie(doc, i - range.start + 1, range.count);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF INDIVIDUAL — un efectivo
//   1) Resultados MMPI-2 (puntajes T por escala)
//   2) Matriz compacta N° + V/F
// ─────────────────────────────────────────────────────────────────────────────
function generarPDFIndividual(evaluacion, preguntas, opts) {
  opts = opts || {};
  return new Promise(function(resolve) {
    const resp = parseRespuestas(evaluacion);
    const stats = contarRespuestas(evaluacion);
    const completa = opts.completa != null
      ? !!opts.completa
      : (!!evaluacion.completada && stats.total >= 566);
    const mmpiRaw = calcularMMPI2(evaluacion);
    const mmpi = normalizarResultadoMMPI(mmpiRaw, evaluacion, completa, stats);

    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 75, bottom: 45, left: 40, right: 40 },
      autoFirstPage: false,
      bufferPages: true
    });
    const chunks = [];
    doc.on('data', function(c) { chunks.push(c); });
    doc.on('end',  function()  { resolve(Buffer.concat(chunks)); });

    const totalV = stats.v;
    const totalF = stats.f;
    const m  = { left: 40, right: 40, top: 75, bottom: 45 };
    const W  = A4_W - m.left - m.right;
    const x0 = m.left;
    const maxY = A4_H - m.bottom - 8;

    doc.addPage();
    dibujarCabecera(doc);
    let y = 78;
    y = dibujarEncabezadoEfectivo(doc, x0, y, W, evaluacion, totalV, totalF) + 10;

    if (!completa) {
      y = dibujarBannerAvance(doc, stats, maxItemRespondido(resp), x0, y, W) + 4;
    }
    y = dibujarResultadosMMPI2(doc, mmpi, x0, y, W, maxY, { completa: completa });

    dibujarPaginasMatrizRespuestas(doc, evaluacion, resp, x0, W, maxY);

    aplicarPiesEnTodas(doc);
    doc.end();
  });
}

function dibujarPieLista(doc, pagina) {
  const altoPie = 24;
  const y = yPieSeguro(doc, altoPie);
  doc.rect(0, y - 4, doc.page.width, altoPie + 6).fill('#eeeeee');
  doc.rect(0, y - 4, doc.page.width, 2).fill(COLOR_ORO);
  doc.fillColor(COLOR_GRIS).font('Helvetica').fontSize(7)
     .text('REGPOL CALLAO — UNITIC 2026 — Listado resumido de evaluaciones',
           36, y + 2, { align: 'left', width: 380, lineBreak: false });
  doc.text('Pág. ' + pagina, doc.page.width - 70, y + 2, { align: 'right', width: 50, lineBreak: false });
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF POR COMISARÍA / UNIDAD — tabla resumida (sin hojas en blanco)
// ─────────────────────────────────────────────────────────────────────────────
function generarPDFComisaria(comisaria, evaluaciones) {
  return new Promise(function(resolve) {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 52, bottom: 38, left: 36, right: 36 },
      autoFirstPage: false
    });
    const chunks = [];
    doc.on('data', function(c) { chunks.push(c); });
    doc.on('end',  function()  { resolve(Buffer.concat(chunks)); });

    const x0 = 36;
    const W  = A4_W - 72;
    const rowH = 14;
    const cols = [20, 118, 44, 44, 54, 18, 18, 34, 22];
    const heads = ['N°', 'Apellidos y Nombres', 'CIP', 'DNI', 'Fecha', 'V', 'F', 'Avance', 'Edad'];
    const marginBottom = 38;
    const maxRowY = A4_H - marginBottom - 30;
    const lista = evaluaciones || [];
    let pagina = 0;

    function cerrarPaginaActual() {
      if (pagina > 0) dibujarPieLista(doc, pagina);
    }

    function abrirPagina(esContinuacion) {
      cerrarPaginaActual();
      doc.addPage();
      pagina += 1;
      dibujarCabeceraLista(doc);
      let startY = 58;
      if (!esContinuacion) {
        doc.fillColor(COLOR_VERDE).font('Helvetica-Bold').fontSize(11)
           .text('LISTADO DE EFECTIVOS EVALUADOS', x0, 56, { align: 'center', width: W, lineBreak: false });
        doc.fillColor(COLOR_ORO).font('Helvetica-Bold').fontSize(10)
           .text(String(comisaria || '').toUpperCase(), x0, 70, { align: 'center', width: W, lineBreak: false });
        startY = 84;
      }
      dibujarFilaTabla(doc, x0, startY, W, cols, heads, { header: true, rowH: rowH });
      return startY + rowH;
    }

    let rowY = abrirPagina(false);

    lista.forEach(function(ev, idx) {
      if (rowY + rowH > maxRowY) rowY = abrirPagina(true);
      const stats = contarRespuestas(ev);
      const fecha = String(ev.fecha || '—').substring(0, 10);
      const edad = resolverEdad(ev);
      dibujarFilaTabla(doc, x0, rowY, W, cols, [
        String(idx + 1),
        ev.nombres || '—',
        ev.cip || '—',
        ev.dni || '—',
        fecha,
        String(stats.v),
        String(stats.f),
        stats.total + '/566',
        edad ? String(edad) : '—'
      ], { par: idx % 2 === 0, rowH: rowH });
      rowY += rowH;
    });

    if (!lista.length) {
      dibujarFilaTabla(doc, x0, rowY, W, cols,
        ['—', 'Sin registros para este filtro', '—', '—', '—', '—', '—', '—', '—'],
        { par: false, rowH: rowH });
    }

    cerrarPaginaActual();
    doc.end();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// MMPI-2 Scoring — script Python (Excel) con respaldo de plantilla en servidor
// ─────────────────────────────────────────────────────────────────────────────
function resolverSexoMMPI(evaluacion) {
  const sexoRaw = String((evaluacion && evaluacion.sexo) || '').toLowerCase();
  const cargoStr = String((evaluacion && evaluacion.cargo) || '').toLowerCase();
  return (sexoRaw === 'femenino' || sexoRaw === 'mujer' || sexoRaw === 'f')
    || cargoStr.includes('mujer') || cargoStr.includes('femenin')
    ? 'Mujer' : 'Hombre';
}

function plantillaEscalasMMPI() {
  return ESCALAS_MMPI2.map(function(nombre) {
    return { nombre: nombre, tv: '—', tf: '—', tb: '—', t: 0, no_calificable: true };
  });
}

function normalizarResultadoMMPI(mmpi, evaluacion, completa, stats) {
  const sexo = resolverSexoMMPI(evaluacion);
  const respondidos = (stats && stats.total) || 0;
  const sinC = completa
    ? ((mmpi && mmpi.sin_contestar) || 0)
    : Math.max(0, TOTAL_PREGUNTAS - respondidos);
  const noCalificable = !completa;

  if (mmpi && mmpi.ok && mmpi.escalas && mmpi.escalas.length) {
    return Object.assign({}, mmpi, {
      ok: true,
      sexo: mmpi.sexo || sexo,
      sin_contestar: sinC,
      no_calificable: noCalificable,
      provisional: noCalificable
    });
  }

  return {
    ok: true,
    no_calificable: true,
    provisional: false,
    sin_contestar: sinC,
    sexo: sexo,
    motor_error: (mmpi && mmpi.error) || 'Motor de cálculo no disponible en servidor',
    escalas: plantillaEscalasMMPI()
  };
}

function ejecutarScriptMMPI2(input) {
  const intentos = [
    ['python3', [MMPI2_SCRIPT_PATH]],
    ['python', [MMPI2_SCRIPT_PATH]],
    ['py', ['-3', MMPI2_SCRIPT_PATH]]
  ];
  let ultimoError = '';
  for (let i = 0; i < intentos.length; i++) {
    const cmd = intentos[i][0];
    const args = intentos[i].slice(1);
    const result = spawnSync(cmd, args, {
      input: input,
      encoding: 'utf8',
      timeout: 120000,
      maxBuffer: 1024 * 1024,
      env: Object.assign({}, process.env, { PYTHONIOENCODING: 'utf-8' })
    });
    if (result.error) {
      ultimoError = result.error.message || String(result.error);
      if (result.error.code === 'ENOENT') continue;
      throw result.error;
    }
    const out = (result.stdout || '').trim();
    if (!out) {
      ultimoError = (result.stderr || '').trim() || 'Sin salida del script';
      continue;
    }
    try {
      return JSON.parse(out);
    } catch (e) {
      ultimoError = 'JSON inválido: ' + e.message;
    }
  }
  throw new Error(ultimoError || 'Python no disponible');
}

function calcularMMPI2(evaluacion) {
  try {
    const resp = typeof evaluacion.respuestas === 'string'
      ? JSON.parse(evaluacion.respuestas) : (evaluacion.respuestas || {});
    const sexo = resolverSexoMMPI(evaluacion);
    const input = JSON.stringify({ sexo: sexo, respuestas: resp });
    return ejecutarScriptMMPI2(input);
  } catch (e) {
    return { ok: false, error: e.message, escalas: [] };
  }
}

// Interpretación del puntaje T
function interpretarT(t) {
  if (!t || t === 0) return { label: 'N/D', color: '#888888' };
  if (t >= 80)  return { label: 'MUY ELEVADO', color: '#c0392b' };
  if (t >= 65)  return { label: 'ELEVADO',     color: '#e67e22' };
  if (t >= 55)  return { label: 'LEVE ELEV.',  color: '#f39c12' };
  if (t >= 45)  return { label: 'NORMAL',      color: '#27ae60' };
  return              { label: 'BAJO',          color: '#2980b9' };
}

// Dibuja tabla de resultados MMPI-2 (siempre muestra las 13 escalas)
function dibujarResultadosMMPI2(doc, mmpi, x0, y, W, maxY, opts) {
  opts = opts || {};
  const escalas = (mmpi && mmpi.escalas && mmpi.escalas.length)
    ? mmpi.escalas
    : plantillaEscalasMMPI();
  const sinC = (mmpi && mmpi.sin_contestar != null) ? mmpi.sin_contestar : TOTAL_PREGUNTAS;
  const noCalificable = !!(mmpi && mmpi.no_calificable);
  const provisional = !!(mmpi && mmpi.provisional);
  const completa = opts.completa !== false && !noCalificable;

  let titulo = 'RESULTADOS DEL MMPI-2 — PUNTAJES T ESTÁNDAR';
  if (noCalificable) titulo = 'PARÁMETROS MMPI-2 — AÚN NO CALIFICABLE';
  else if (provisional) titulo = 'RESULTADOS MMPI-2 — PUNTAJES T (PROVISIONAL)';

  doc.rect(x0, y, W, 15).fill(noCalificable ? '#7a5c00' : COLOR_VERDE);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8.5)
     .text(titulo, x0 + 6, y + 3.5, { width: W - 12, lineBreak: false });
  y += 15;

  doc.fillColor(COLOR_GRIS).font('Helvetica').fontSize(7)
     .text('Normas: ' + ((mmpi && mmpi.sexo) || 'Hombre')
       + '   •   Ítems sin contestar: ' + sinC
       + '   •   Corte clínico: T ≥ 65', x0, y, { width: W, lineBreak: false });
  y += 10;

  if (noCalificable) {
    doc.rect(x0, y, W, 26).fill('#fff3cd').stroke('#e6c200');
    doc.fillColor('#7a5c00').font('Helvetica-Bold').fontSize(7.5)
       .text('AÚN NO ES CALIFICABLE — La evaluación no está completa (' + (TOTAL_PREGUNTAS - sinC) + '/566).',
         x0 + 6, y + 4, { width: W - 12, lineBreak: false });
    doc.font('Helvetica').fontSize(7)
       .text('Debe responder los 566 ítems y enviar con Finalizar y Enviar para obtener calificación oficial.',
         x0 + 6, y + 13, { width: W - 12, lineBreak: false });
    if (mmpi && mmpi.motor_error && !provisional) {
      doc.fillColor('#888').font('Helvetica-Oblique').fontSize(6.5)
         .text('Cálculo automático no disponible en servidor; se muestran parámetros de referencia.',
           x0 + 6, y + 20, { width: W - 12, lineBreak: false });
    }
    y += 28;
  } else if (provisional) {
    doc.rect(x0, y, W, 18).fill('#fff8e1').stroke('#f0d78c');
    doc.fillColor('#856404').font('Helvetica-Bold').fontSize(7.5)
       .text('Resultado provisional con respuestas actuales. Puede variar al completar los 566 ítems.',
         x0 + 6, y + 5, { width: W - 12, lineBreak: false });
    y += 20;
  }

  const colW  = [118, 30, 30, 36, 40, 76];
  const heads = ['Escala', 'TV', 'TF', 'Bruto', 'T-score', 'Estado / Interpretación'];
  const rowH  = 13;

  doc.rect(x0, y, W, rowH).fill(noCalificable ? '#7a5c00' : COLOR_VERDE);
  let tx = x0;
  heads.forEach(function(h, i) {
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(7)
       .text(h, tx + 2, y + 3, { width: colW[i] - 4, lineBreak: false });
    tx += colW[i];
  });
  y += rowH;

  escalas.forEach(function(esc, idx) {
    if (y + rowH > maxY - 4) return;
    const tieneT = esc.t > 0;
    const inter = noCalificable && !tieneT
      ? { label: 'NO CALIFICABLE', color: '#b8860b' }
      : (noCalificable && tieneT
        ? { label: 'PROVISIONAL', color: '#856404' }
        : (tieneT ? interpretarT(esc.t) : { label: '—', color: '#888888' }));
    const bg = idx % 2 === 0 ? '#f7faf7' : '#ffffff';
    doc.rect(x0, y, W, rowH).fill(bg).stroke('#e0e8e0');

    tx = x0;
    const celdas = [
      esc.nombre,
      esc.tv != null && esc.tv !== '—' ? String(esc.tv) : '—',
      esc.tf != null && esc.tf !== '—' ? String(esc.tf) : '—',
      esc.tb != null && esc.tb !== '—' ? String(esc.tb) : '—',
      tieneT ? String(esc.t) : '—',
      noCalificable && !tieneT ? 'NO CALIFICABLE' : inter.label
    ];
    celdas.forEach(function(val, i) {
      const isT = (i === 4);
      const isInt = (i === 5);
      const color = isInt ? inter.color : (isT && esc.t >= 65 ? '#c0392b' : COLOR_NEGRO);
      const bold = (i === 0) || (isT && esc.t >= 65) || isInt;
      doc.fillColor(color).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7)
         .text(val, tx + 2, y + 3, { width: colW[i] - 4, lineBreak: false });
      tx += colW[i];
    });

    if (tieneT && !noCalificable) {
      const barX = x0 + colW[0] + colW[1] + colW[2] + colW[3] + colW[4] - 2;
      const barW = colW[5] - 4;
      const barH = rowH - 5;
      const pct = Math.min(esc.t / 120, 1);
      doc.rect(barX, y + 2.5, barW, barH).fill('#eeeeee');
      doc.rect(barX, y + 2.5, barW * pct, barH).fill(inter.color);
    }

    y += rowH;
  });

  if (completa) {
    y += 3;
    const leyenda = [
      { c: '#c0392b', l: 'Muy elevado (T≥80)' },
      { c: '#e67e22', l: 'Elevado (T 65-79)' },
      { c: '#f39c12', l: 'Leve (T 55-64)' },
      { c: '#27ae60', l: 'Normal (T 45-54)' },
      { c: '#2980b9', l: 'Bajo (T<45)' }
    ];
    let lx = x0;
    leyenda.forEach(function(it) {
      doc.rect(lx, y, 7, 7).fill(it.c);
      doc.fillColor(COLOR_GRIS).font('Helvetica').fontSize(6)
         .text(it.l, lx + 9, y, { width: 72, lineBreak: false });
      lx += 82;
    });
    y += 11;
  }

  return y;
}

function dibujarBannerAvance(doc, stats, maxId, x0, y, W) {
  const pendientes = Math.max(0, 566 - (stats.total || 0));
  const pct = Math.min(100, Math.round(((stats.total || 0) / 566) * 100));
  const bannerH = 34;
  doc.rect(x0, y, W, bannerH).fill('#fff8e1').stroke('#f0d78c');
  doc.fillColor('#856404').font('Helvetica-Bold').fontSize(9)
     .text('EVALUACIÓN INCOMPLETA — Avance: ' + (stats.total || 0) + '/566 (' + pct + '%)', x0 + 8, y + 6, { width: W - 16, lineBreak: false });
  doc.font('Helvetica').fontSize(7.5)
     .text('Respondidos: V=' + (stats.v || 0) + '  F=' + (stats.f || 0)
       + '  |  Pendientes: ' + pendientes + ' ítems'
       + (maxId > 0 ? '  |  Último ítem contestado: ' + maxId : ''),
       x0 + 8, y + 19, { width: W - 16, lineBreak: false });
  return y + bannerH;
}

module.exports = {
  generarPDFIndividual,
  generarPDFComisaria,
  calcularMMPI2,
  normalizarResultadoMMPI,
  interpretarT,
  contarRespuestas,
  formatearArmamentoLegible,
  formatearGradoDisplay,
  maxItemRespondido,
  ESCALAS_MMPI2
};
