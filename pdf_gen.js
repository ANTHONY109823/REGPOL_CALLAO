/*
  pdf_gen.js — Generador de PDFs para REGPOL Callao
  Cuestionario Psicológico — UNITIC — 2026
*/

const PDFDocument = require('pdfkit');
const PREGUNTAS_DEFAULT = require('./preguntas_data.json');

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

function calcularAnchurasTabla(W) {
  const ratios = [0.045, 0.36, 0.095, 0.095, 0.115, 0.055, 0.055, 0.12, 0.06];
  const cols = ratios.map(function(r) { return Math.floor(W * r); });
  const sum = cols.reduce(function(a, b) { return a + b; }, 0);
  cols[1] += W - sum;
  return cols;
}

function calcularAnchosTablaEscalas(W) {
  const ratios = [0.28, 0.144, 0.144, 0.144, 0.144, 0.144];
  const cols = ratios.map(function(r) { return Math.floor(W * r); });
  const sum = cols.reduce(function(a, b) { return a + b; }, 0);
  cols[0] += W - sum;
  return cols;
}

function calcularAnchosTablaDetalle(W) {
  const ratios = [0.045, 0.31, 0.105, 0.145, 0.145, 0.25];
  const cols = ratios.map(function(r) { return Math.floor(W * r); });
  const sum = cols.reduce(function(a, b) { return a + b; }, 0);
  cols[1] += W - sum;
  return cols;
}

function dibujarFilaTabla(doc, x0, y, W, cols, celdas, opts) {
  const esHeader = opts && opts.header;
  const par = opts && opts.par;
  const minRowH = (opts && opts.rowH) || (esHeader ? 20 : 17);
  const padX = 4;
  const padY = esHeader ? 5 : 4;
  const fontSize = esHeader ? 8.5 : 8;
  const bg = esHeader ? COLOR_VERDE : (par ? '#f4f8f5' : '#ffffff');
  const borde = esHeader ? '#3d7a62' : '#cfdad2';

  let rowH = minRowH;
  if (!esHeader) {
    celdas.forEach(function(c, i) {
      doc.font(i === 1 ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize);
      const h = doc.heightOfString(String(c == null ? '—' : c), { width: cols[i] - padX * 2 });
      rowH = Math.max(rowH, h + padY * 2);
    });
  }

  doc.rect(x0, y, W, rowH).fill(bg);

  doc.strokeColor(borde).lineWidth(0.45);
  let vx = x0;
  for (let i = 0; i <= cols.length; i++) {
    doc.moveTo(vx, y).lineTo(vx, y + rowH).stroke();
    if (i < cols.length) vx += cols[i];
  }
  doc.moveTo(x0, y + rowH).lineTo(x0 + W, y + rowH).stroke();

  let tx = x0;
  celdas.forEach(function(c, i) {
    const centrado = i === 0 || i >= 5;
    const txt = String(c == null ? '—' : c);
    doc.fillColor(esHeader ? '#ffffff' : (i === 0 ? COLOR_VERDE : COLOR_NEGRO))
       .font((esHeader || i === 1) ? 'Helvetica-Bold' : 'Helvetica')
       .fontSize(fontSize);
    const textW = cols[i] - padX * 2;
    const textH = doc.heightOfString(txt, { width: textW });
    const ty = y + Math.max(padY, (rowH - textH) / 2);
    doc.text(txt, tx + padX, ty, {
      width: textW,
      align: centrado ? 'center' : 'left',
      lineBreak: !esHeader && i === 1,
      ellipsis: esHeader || i !== 1
    });
    tx += cols[i];
  });

  return rowH;
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
  const pad = 10;
  const dataFs = 8.5;
  const lineH = 11;
  const footerH = 14;
  const bannerH = pad + lineH * 7 + 6 + footerH + pad;
  const fotoH = bannerH - pad * 2;
  const fotoW = Math.round(fotoH * 0.72);
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
  const areaTxt = String(ev.area || '—').toUpperCase();
  const armaTxt = formatearArmamentoLegible(ev.armamento || '').toUpperCase();
  const fechaTxt = formatearFechaPDF(ev.fecha);

  const lineas = [
    gradoTxt,
    nombreTxt,
    'CIP: ' + String(ev.cip || '—').toUpperCase() + '          DNI: ' + String(ev.dni || '—').toUpperCase(),
    'EDAD: ' + edadTxt + '          SEXO: ' + sexoTxt,
    'CARGO: ' + cargoTxt,
    'ÁREA: ' + areaTxt,
    'ARMA: ' + armaTxt
  ];

  let ty = y + pad;
  doc.fillColor(COLOR_NEGRO).font('Helvetica').fontSize(dataFs);
  lineas.forEach(function(txt) {
    doc.text(txt, x0 + pad, ty, { width: textoW, lineBreak: false, ellipsis: true });
    ty += lineH;
  });

  if (tieneFoto) {
    const fotoX = x0 + W - fotoW - pad;
    const fotoY = y + pad;
    try {
      doc.save();
      doc.rect(fotoX, fotoY, fotoW, fotoH).clip();
      doc.image(ev.foto, fotoX, fotoY, { cover: [fotoW, fotoH] });
      doc.restore();
      doc.rect(fotoX, fotoY, fotoW, fotoH).stroke('#aaaaaa');
    } catch (e) {
      try {
        doc.image(ev.foto, fotoX, fotoY, { width: fotoW, height: fotoH });
        doc.rect(fotoX, fotoY, fotoW, fotoH).stroke('#aaaaaa');
      } catch (e2) {}
    }
  }

  const footY = y + bannerH - pad - footerH;
  doc.strokeColor('#c8c8c8').lineWidth(0.5)
     .moveTo(x0 + pad, footY).lineTo(x0 + W - pad, footY).stroke();
  doc.fillColor(COLOR_NEGRO).font('Helvetica').fontSize(dataFs)
     .text('V: ' + totalV + '          F: ' + totalF + '          FECHA: ' + fechaTxt,
       x0 + pad, footY + 4, { width: textoW, lineBreak: false });

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
    // Deja libre la franja del pie de página (ver dibujarPie: altoPie=28 + banda de 5+8pt)
    const maxY = A4_H - m.bottom - 28 - 11;

    doc.addPage();
    dibujarCabecera(doc);
    let y = 78;
    y = dibujarEncabezadoEfectivo(doc, x0, y, W, evaluacion, totalV, totalF) + 10;

    if (!completa) {
      y = dibujarBannerAvance(doc, stats, maxItemRespondido(resp), x0, y, W) + 4;
    }
    const resultado = dibujarResultadosMMPI2(doc, mmpi, x0, y, W, maxY, { completa: completa, omitirAvisoIncompleto: !completa });
    y = resultado.y;

    if (resultado.diagPendiente) {
      doc.addPage();
      dibujarCabecera(doc);
      y = dibujarDiagnosticoFinalMMPI(doc, resultado.diagnostico, x0, 78, W, resultado.fontSig);
    }

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
      margins: { top: 48, bottom: 34, left: 28, right: 28 },
      autoFirstPage: false
    });
    const chunks = [];
    doc.on('data', function(c) { chunks.push(c); });
    doc.on('end',  function()  { resolve(Buffer.concat(chunks)); });

    const x0 = 28;
    const W  = A4_W - 56;
    const cols = calcularAnchurasTabla(W);
    const heads = ['N°', 'Apellidos y Nombres', 'CIP', 'DNI', 'Fecha', 'V', 'F', 'Avance', 'Edad'];
    const marginBottom = 34;
    const maxRowY = A4_H - marginBottom - 24;
    const lista = evaluaciones || [];
    let pagina = 0;

    function cerrarPaginaActual() {
      if (pagina > 0) dibujarPieLista(doc, pagina);
    }

    // opts: { titulo, subtitulo, heads, cols, continuacionTitulo }
    function abrirPagina(opts) {
      opts = opts || {};
      cerrarPaginaActual();
      doc.addPage();
      pagina += 1;
      dibujarCabeceraLista(doc);
      let startY = 58;
      if (opts.titulo) {
        doc.fillColor(COLOR_VERDE).font('Helvetica-Bold').fontSize(11)
           .text(opts.titulo, x0, 58, { align: 'center', width: W, lineBreak: false });
        doc.fillColor(COLOR_ORO).font('Helvetica-Bold').fontSize(10)
           .text(String(comisaria || '').toUpperCase(), x0, 71, { align: 'center', width: W, lineBreak: false });
        doc.fillColor(COLOR_GRIS).font('Helvetica').fontSize(8)
           .text(opts.subtitulo || '', x0, 84, { align: 'center', width: W, lineBreak: false });
        startY = 96;
      } else {
        doc.fillColor(COLOR_GRIS).font('Helvetica-Bold').fontSize(8)
           .text(String(comisaria || '').toUpperCase() + (opts.continuacionTitulo || ' — continuación'), x0, 60, { align: 'center', width: W, lineBreak: false });
        startY = 72;
      }
      if (opts.heads && opts.cols) {
        const headerH = dibujarFilaTabla(doc, x0, startY, W, opts.cols, opts.heads, { header: true, rowH: 20 });
        return startY + headerH;
      }
      return startY;
    }

    let rowY = abrirPagina({
      titulo: 'LISTADO DE EFECTIVOS EVALUADOS',
      subtitulo: 'Total: ' + lista.length + ' registro' + (lista.length === 1 ? '' : 's'),
      heads: heads, cols: cols
    });

    lista.forEach(function(ev, idx) {
      const stats = contarRespuestas(ev);
      const fecha = String(ev.fecha || '—').substring(0, 10);
      const edad = resolverEdad(ev);
      const fila = [
        String(idx + 1),
        String(ev.nombres || '—').toUpperCase(),
        String(ev.cip || '—').toUpperCase(),
        String(ev.dni || '—').toUpperCase(),
        fecha,
        String(stats.v),
        String(stats.f),
        stats.total + '/566',
        edad ? String(edad) : '—'
      ];
      if (rowY + 17 > maxRowY) rowY = abrirPagina({ heads: heads, cols: cols });
      rowY += dibujarFilaTabla(doc, x0, rowY, W, cols, fila, { par: idx % 2 === 0, rowH: 17 });
    });

    if (!lista.length) {
      dibujarFilaTabla(doc, x0, rowY, W, cols,
        ['—', 'Sin registros para este filtro', '—', '—', '—', '—', '—', '—', '—'],
        { par: false, rowH: 17 });
    }

    if (lista.length) {
      dibujarInformeEstadisticoUnidad(doc, lista, { x0: x0, W: W, maxRowY: maxRowY, abrirPagina: abrirPagina });
    }

    cerrarPaginaActual();
    doc.end();
  });
}

// ── Informe estadístico — diagnóstico MMPI-2 contabilizado por escala + ───────
// ── detalle nominal (nombres completos) de quienes respondieron en la unidad ──
function dibujarInformeEstadisticoUnidad(doc, lista, ctx) {
  const x0 = ctx.x0, W = ctx.W, maxRowY = ctx.maxRowY, abrirPagina = ctx.abrirPagina;

  const detalle = lista.map(function(ev) { return { ev: ev, res: calcularDiagnosticoFila(ev) }; });
  const totalEvaluados = lista.length;
  const completos = detalle.filter(function(d) { return d.res.completa; });
  const incompletos = totalEvaluados - completos.length;

  const riesgoCounts = { BAJO: 0, MODERADO: 0, ALTO: 0 };
  const escalaCounts = {};
  ESCALAS_MMPI2.forEach(function(nombre) {
    escalaCounts[nombre] = { MUY_ELEVADO: 0, ELEVADO: 0, LEVE: 0, NORMAL: 0, BAJO: 0 };
  });

  completos.forEach(function(d) {
    if (d.res.diag) riesgoCounts[d.res.diag.nivel] = (riesgoCounts[d.res.diag.nivel] || 0) + 1;
    if (d.res.mmpi && d.res.mmpi.escalas) {
      d.res.mmpi.escalas.forEach(function(esc) {
        if (!escalaCounts[esc.nombre] || esc.t <= 0) return;
        const label = interpretarT(esc.t).label;
        if (label === 'MUY ELEVADO') escalaCounts[esc.nombre].MUY_ELEVADO++;
        else if (label === 'ELEVADO') escalaCounts[esc.nombre].ELEVADO++;
        else if (label === 'LEVE ELEV.') escalaCounts[esc.nombre].LEVE++;
        else if (label === 'NORMAL') escalaCounts[esc.nombre].NORMAL++;
        else if (label === 'BAJO') escalaCounts[esc.nombre].BAJO++;
      });
    }
  });

  // ── Página de resumen ──────────────────────────────────────────────────────
  let y = abrirPagina({
    titulo: 'INFORME ESTADÍSTICO — DIAGNÓSTICO MMPI-2',
    subtitulo: totalEvaluados + ' evaluado' + (totalEvaluados === 1 ? '' : 's') + ' · ' + completos.length + ' completo' + (completos.length === 1 ? '' : 's') + ' · ' + incompletos + ' en avance'
  });

  doc.rect(x0, y, W, 16).fill(COLOR_VERDE);
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(9)
     .text('DISTRIBUCIÓN DE RIESGO INSTITUCIONAL (sobre evaluaciones completas)', x0 + 6, y + 4, { width: W - 12, lineBreak: false });
  y += 20;

  const nivelesInfo = [
    { key: 'BAJO', color: '#27ae60', label: 'Riesgo Bajo' },
    { key: 'MODERADO', color: '#e67e22', label: 'Riesgo Moderado' },
    { key: 'ALTO', color: '#c0392b', label: 'Riesgo Alto' }
  ];
  const boxW = (W - 16) / 3;
  nivelesInfo.forEach(function(n, i) {
    const n_ = riesgoCounts[n.key] || 0;
    const pct = completos.length ? Math.round((n_ / completos.length) * 100) : 0;
    const bx = x0 + i * (boxW + 8);
    doc.rect(bx, y, boxW, 40).fill(n.color);
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(16)
       .text(String(n_), bx, y + 5, { width: boxW, align: 'center', lineBreak: false });
    doc.font('Helvetica').fontSize(8)
       .text(n.label + ' (' + pct + '%)', bx, y + 24, { width: boxW, align: 'center', lineBreak: false });
  });
  y += 52;

  doc.rect(x0, y, W, 16).fill(COLOR_VERDE);
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(9)
     .text('CONTEO POR ESCALA (evaluaciones completas, según puntaje T)', x0 + 6, y + 4, { width: W - 12, lineBreak: false });
  y += 20;

  const colsEsc = calcularAnchosTablaEscalas(W);
  const headsEsc = ['Escala', 'Muy Elevado', 'Elevado', 'Leve Elev.', 'Normal', 'Bajo'];
  y += dibujarFilaTabla(doc, x0, y, W, colsEsc, headsEsc, { header: true, rowH: 18 });

  ESCALAS_MMPI2.forEach(function(nombre, idx) {
    const c = escalaCounts[nombre];
    if (y + 15 > maxRowY) {
      y = abrirPagina({ titulo: 'INFORME ESTADÍSTICO — DIAGNÓSTICO MMPI-2', continuacionTitulo: ' — Conteo por escala (continuación)' });
      y += dibujarFilaTabla(doc, x0, y, W, colsEsc, headsEsc, { header: true, rowH: 18 });
    }
    y += dibujarFilaTabla(doc, x0, y, W, colsEsc,
      [nombre, String(c.MUY_ELEVADO), String(c.ELEVADO), String(c.LEVE), String(c.NORMAL), String(c.BAJO)],
      { par: idx % 2 === 0, rowH: 15 });
  });

  // ── Detalle nominal por evaluado ─────────────────────────────────────────────
  const colsDet = calcularAnchosTablaDetalle(W);
  const headsDet = ['N°', 'Apellidos y Nombres', 'CIP', 'Estado', 'Nivel de Riesgo', 'Escalas en Alerta'];
  let rowY = abrirPagina({
    titulo: 'DETALLE POR EVALUADO — DIAGNÓSTICO MMPI-2',
    subtitulo: 'Nombres completos de quienes respondieron en la unidad',
    heads: headsDet, cols: colsDet
  });

  detalle.forEach(function(d, idx) {
    const ev = d.ev, res = d.res;
    const estado = res.completa ? 'Completo' : ('Avance ' + Math.round((res.stats.total / TOTAL_PREGUNTAS) * 100) + '%');
    const nivel = res.completa && res.diag ? res.diag.nivel : '—';
    const alertas = res.completa && res.alertCodes && res.alertCodes.length ? res.alertCodes.join(', ') : (res.completa ? 'Ninguna' : '—');
    const fila = [
      String(idx + 1),
      String(ev.nombres || '—').toUpperCase(),
      String(ev.cip || '—').toUpperCase(),
      estado,
      nivel,
      alertas
    ];
    if (rowY + 17 > maxRowY) {
      rowY = abrirPagina({ heads: headsDet, cols: colsDet, continuacionTitulo: ' — Detalle por evaluado (continuación)' });
    }
    rowY += dibujarFilaTabla(doc, x0, rowY, W, colsDet, fila, { par: idx % 2 === 0, rowH: 17 });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// MMPI-2 Scoring — implementacion nativa JS (sin Python, sin Excel)
// Tabla T y claves extraidas del Excel oficial (Auxiliar + formulas)
// ─────────────────────────────────────────────────────────────────────────────

// Tabla puntajes T: indice = raw_score (0-73)
// cols: [L_H,F_H,K_H,Hs_H,D_H,Hy_H,Pd_H,Mf_H,Pa_H,Pt_H,Sc_H,Ma_H,Si_H,
//        L_M,F_M,K_M,Hs_M,D_M,Hy_M,Pd_M,Mf_M,Pa_M,Pt_M,Sc_M,Ma_M,Si_M]
var _MMPI_T = [
  [35,36,0,0,0,0,0,0,0,0,0,0,0,33,37,0,0,0,0,0,0,0,0,0,0,0],
  [39,39,0,0,0,0,0,0,0,0,0,0,0,38,41,0,0,0,0,0,0,0,0,0,0,0],
  [43,42,0,30,0,0,0,0,30,0,0,0,0,43,44,0,0,0,0,0,0,30,0,0,0,0],
  [48,45,0,31,0,0,0,0,31,0,0,0,0,47,48,0,0,0,0,0,0,31,0,0,0,0],
  [52,48,0,31,0,0,0,0,32,0,0,0,0,52,51,0,0,0,0,0,0,32,0,0,0,0],
  [56,51,0,32,0,0,0,0,34,0,0,0,0,57,53,0,0,0,0,0,0,34,0,0,0,0],
  [61,55,30,33,0,0,0,0,37,0,0,0,0,62,58,30,30,0,0,0,0,37,0,0,0,0],
  [65,58,33,35,0,0,0,0,39,0,0,0,0,66,61,32,33,0,0,0,120,39,0,0,0,0],
  [70,61,35,37,0,30,0,0,42,0,0,0,0,71,65,35,35,0,0,0,118,42,0,0,0,0],
  [74,64,37,39,30,31,0,0,46,0,0,30,30,76,68,37,38,0,30,0,116,45,0,0,30,0],
  [78,67,39,42,32,32,0,0,49,0,0,31,31,81,72,39,40,30,31,0,114,49,0,0,31,30],
  [83,70,41,45,34,33,30,0,53,0,0,33,33,86,75,41,43,32,32,0,111,52,0,0,33,32],
  [87,73,43,48,36,34,31,0,57,0,30,35,34,90,79,43,46,34,32,30,109,56,0,0,35,33],
  [91,76,45,51,38,35,33,0,61,0,31,36,35,95,82,46,49,36,34,32,106,59,0,30,37,34],
  [96,79,47,54,40,37,34,0,64,30,32,38,37,100,85,48,51,38,35,34,104,63,0,31,39,35],
  [100,82,49,57,42,38,35,0,68,31,33,39,37,103,89,50,54,40,36,36,101,67,0,32,41,36],
  [0,85,51,59,45,40,37,30,72,32,34,41,38,0,93,52,57,42,38,37,99,70,30,33,43,37],
  [0,98,54,62,47,42,39,32,75,33,35,43,40,0,96,54,59,44,39,39,96,74,31,34,45,38],
  [0,92,56,64,50,43,40,34,79,34,36,45,41,0,99,56,61,46,41,41,94,78,32,36,47,39],
  [0,95,58,66,52,45,42,36,83,36,37,47,42,0,103,59,63,47,43,43,92,81,34,37,49,40],
  [0,98,60,68,54,47,44,38,86,37,38,49,43,0,106,61,65,49,45,45,89,85,35,39,51,41],
  [0,101,62,70,57,50,46,40,90,39,40,51,44,0,109,63,67,51,47,47,87,89,37,41,53,42],
  [0,104,64,73,59,52,48,42,94,41,42,53,45,0,113,65,69,53,49,49,84,92,39,42,56,43],
  [0,107,66,75,61,54,50,44,97,43,44,56,47,0,115,67,71,55,51,51,82,96,40,44,59,45],
  [0,110,68,77,62,57,52,46,101,44,54,59,48,0,120,70,74,57,54,53,79,100,42,46,62,46],
  [0,113,70,79,64,59,54,48,105,47,47,62,49,0,0,72,76,59,56,55,77,103,44,48,65,47],
  [0,116,72,81,66,61,57,50,108,49,49,65,50,0,0,74,78,62,58,58,74,107,47,50,68,48],
  [0,119,75,84,68,64,59,52,112,51,51,69,51,0,0,76,80,64,61,60,72,111,49,52,71,49],
  [0,120,77,86,70,66,62,54,116,53,53,72,52,0,0,78,82,66,63,63,69,114,51,53,74,50],
  [0,0,79,88,72,69,64,56,119,55,55,75,54,0,0,81,84,68,65,66,67,118,53,55,76,51],
  [0,0,81,90,74,71,67,58,120,57,56,78,55,0,0,83,86,70,68,68,65,120,55,57,79,52],
  [0,0,0,92,76,74,69,60,0,59,58,81,56,0,0,0,88,72,70,71,62,0,57,59,83,53],
  [0,0,0,94,78,76,72,62,0,62,60,85,57,0,0,0,90,75,73,73,60,0,59,60,85,54],
  [0,0,0,97,80,79,74,64,0,64,62,88,58,0,0,0,92,77,75,76,57,0,61,62,88,55],
  [0,0,0,99,81,81,77,66,0,66,63,91,59,0,0,0,95,79,77,79,55,0,62,63,91,57],
  [0,0,0,101,83,84,79,68,0,68,65,94,61,0,0,0,97,81,80,81,52,0,64,65,94,58],
  [0,0,0,103,85,86,82,70,0,70,67,98,62,0,0,0,99,83,82,84,50,0,66,66,97,59],
  [0,0,0,105,87,89,84,72,0,72,69,101,63,0,0,0,101,86,84,87,47,0,68,67,100,60],
  [0,0,0,108,89,91,87,74,0,74,70,104,64,0,0,0,103,88,87,89,45,0,70,69,103,61],
  [0,0,0,110,91,94,90,76,0,77,72,107,65,0,0,0,105,90,89,92,43,0,72,70,106,62],
  [0,0,0,112,93,96,92,78,0,79,74,110,66,0,0,0,107,92,92,94,40,0,73,72,109,63],
  [0,0,0,114,95,99,95,79,0,81,75,114,68,0,0,0,109,94,94,97,38,0,75,73,112,64],
  [0,0,0,116,97,101,97,81,0,83,77,117,69,0,0,0,111,96,96,100,35,0,77,75,115,65],
  [0,0,0,119,98,104,100,83,0,85,79,120,70,0,0,0,113,99,99,102,33,0,79,76,118,66],
  [0,0,0,120,100,106,102,85,0,87,81,0,71,0,0,0,116,101,101,105,30,0,81,78,120,67],
  [0,0,0,0,102,109,105,87,0,89,82,0,72,0,0,0,118,103,104,107,0,0,83,79,0,69],
  [0,0,0,0,104,111,107,89,0,91,84,0,73,0,0,0,120,105,106,110,0,0,84,81,0,70],
  [0,0,0,0,106,114,110,91,0,94,86,0,75,0,0,0,0,107,108,113,0,0,86,82,0,71],
  [0,0,0,0,108,116,112,93,0,96,87,0,76,0,0,0,0,109,111,115,0,0,88,84,0,72],
  [0,0,0,0,110,119,115,95,0,98,89,0,77,0,0,0,0,112,113,118,0,0,90,85,0,73],
  [0,0,0,0,112,120,117,97,0,100,91,0,78,0,0,0,0,114,115,120,0,0,92,87,0,74],
  [0,0,0,0,114,0,120,99,0,102,93,0,79,0,0,0,0,116,118,0,0,0,94,88,0,75],
  [0,0,0,0,115,0,0,101,0,104,94,0,80,0,0,0,0,118,120,0,0,0,95,90,0,76],
  [0,0,0,0,117,0,0,103,0,106,96,0,82,0,0,0,0,120,0,0,0,0,97,91,0,77],
  [0,0,0,0,119,0,0,105,0,109,98,0,83,0,0,0,0,0,0,0,0,0,99,93,0,78],
  [0,0,0,0,120,0,0,107,0,111,99,0,84,0,0,0,0,0,0,0,0,0,101,94,0,79],
  [0,0,0,0,0,0,0,109,0,113,101,0,85,0,0,0,0,0,0,0,0,0,103,96,0,81],
  [0,0,0,0,0,0,0,0,0,115,103,0,86,0,0,0,0,0,0,0,0,0,105,97,0,82],
  [0,0,0,0,0,0,0,0,0,117,105,0,87,0,0,0,0,0,0,0,0,0,106,99,0,83],
  [0,0,0,0,0,0,0,0,0,119,106,0,89,0,0,0,0,0,0,0,0,0,108,100,0,84],
  [0,0,0,0,0,0,0,0,0,120,108,0,90,0,0,0,0,0,0,0,0,0,110,102,0,85],
  [0,0,0,0,0,0,0,0,0,0,110,0,91,0,0,0,0,0,0,0,0,0,112,103,0,86],
  [0,0,0,0,0,0,0,0,0,0,111,0,92,0,0,0,0,0,0,0,0,0,114,105,0,87],
  [0,0,0,0,0,0,0,0,0,0,113,0,93,0,0,0,0,0,0,0,0,0,115,106,0,88],
  [0,0,0,0,0,0,0,0,0,0,115,0,94,0,0,0,0,0,0,0,0,0,117,108,0,89],
  [0,0,0,0,0,0,0,0,0,0,117,0,96,0,0,0,0,0,0,0,0,0,119,109,0,90],
  [0,0,0,0,0,0,0,0,0,0,118,0,97,0,0,0,0,0,0,0,0,0,120,111,0,91],
  [0,0,0,0,0,0,0,0,0,0,120,0,98,0,0,0,0,0,0,0,0,0,0,112,0,93],
  [0,0,0,0,0,0,0,0,0,0,0,0,99,0,0,0,0,0,0,0,0,0,0,113,0,94],
  [0,0,0,0,0,0,0,0,0,0,0,0,100,0,0,0,0,0,0,0,0,0,0,115,0,95],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,116,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,118,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,119,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,120,0,0]
];

// Columnas de _MMPI_T para cada escala segun sexo
var _MMPI_COL_H = {L:0,F:1,K:2,Hs:3,D:4,Hy:5,Pd:6,Mf:7,Pa:8,Pt:9,Sc:10,Ma:11,Si:12};
var _MMPI_COL_M = {L:13,F:14,K:15,Hs:16,D:17,Hy:18,Pd:19,Mf:20,Pa:21,Pt:22,Sc:23,Ma:24,Si:25};

// Claves de puntuacion extraidas de las formulas del Excel
var _MMPI_KEYS = {
  L:   {V:[],F:[16,29,41,51,77,93,102,107,123,139,153,183,203,232,260]},
  F:   {V:[18,24,30,36,42,48,54,60,66,72,84,96,114,138,144,150,156,162,168,180,198,216,228,234,240,246,252,258,264,270,282,288,294,300,306,312,324,336,349,355,361],
        F:[6,12,78,90,102,108,120,126,132,174,186,192,204,210,222,276,318,330,343]},
  K:   {V:[83],F:[29,37,58,76,110,116,122,127,130,136,148,157,158,167,171,196,213,243,267,284,290,330,338,339,341,346,348,356,365]},
  Hs:  {V:[18,28,39,53,59,97,101,111,149,175,247],F:[2,3,8,10,20,45,47,57,91,117,141,143,152,164,173,176,179,208,224,249,255]},
  D:   {V:[5,15,18,37,38,39,46,56,73,92,117,127,130,146,147,170,175,181,215,233],F:[2,9,10,20,29,33,37,43,45,49,55,68,75,76,95,109,118,134,140,141,142,143,148,165,178,188,189,212,221,223,226,238,245,248,260,267,330]},
  Hy:  {V:[11,18,31,39,40,44,65,101,166,172,175,218,230],F:[2,3,7,8,9,10,14,26,29,45,47,58,76,81,91,95,98,110,115,116,124,125,129,135,141,148,151,152,157,159,161,164,167,173,176,179,185,193,208,213,224,241,243,249,253,263,265]},
  Pd:  {V:[17,21,22,31,32,35,42,52,54,56,71,82,89,94,99,105,113,195,202,219,225,259,264,288],F:[9,12,34,70,79,83,95,122,125,129,143,157,158,160,167,171,185,209,214,217,226,243,261,263,266,267]},
  MfH: {V:[4,25,62,64,67,74,80,112,119,122,128,137,166,177,187,191,196,205,209,219,236,251,256,268,271],F:[1,19,26,27,63,68,69,76,86,103,104,107,120,121,132,133,163,184,193,194,197,199,201,207,231,235,237,239,254,257,272]},
  MfM: {V:[4,25,62,64,67,74,80,112,119,121,122,128,137,177,187,191,196,205,219,236,251,256,271],F:[1,19,26,27,63,68,69,76,86,103,104,107,120,121,132,133,163,184,193,194,197,199,201,207,209,231,235,237,239,254,257,268,272]},
  Pa:  {V:[16,17,22,23,24,42,99,113,138,144,145,146,162,234,259,271,277,285,305,307,333,334,336,355,361],F:[81,95,98,100,104,110,244,255,266,283,284,286,297,314,315]},
  Pt:  {V:[11,16,23,31,38,56,65,73,82,89,94,130,147,170,175,196,218,242,273,275,277,285,289,301,302,304,308,309,310,313,316,317,320,325,326,327,328,329,331],F:[3,9,33,109,140,165,174,293,321]},
  Sc:  {V:[16,17,21,22,23,31,32,35,38,42,44,46,48,65,85,92,138,145,147,166,168,170,180,182,190,218,221,229,233,234,242,247,252,256,268,273,274,277,279,281,287,291,292,296,298,299,303,307,311,316,319,320,322,323,325,329,332,333,355],F:[6,9,12,34,90,91,106,165,177,179,192,210,255,276,278,280,290,295,343]},
  Ma:  {V:[13,15,21,23,50,55,61,85,87,98,113,122,131,145,155,168,169,182,190,200,205,206,211,212,218,220,227,229,238,242,244,248,250,253,269],F:[88,93,100,106,107,136,154,158,167,243,263]},
  Si:  {V:[31,56,70,100,104,110,127,135,158,161,167,185,215,243,251,265,275,284,289,296,302,308,326,337,338,347,348,351,352,357,364,367,368,369],F:[25,32,49,79,86,112,131,181,189,207,209,231,237,255,262,267,280,321,328,335,340,342,344,345,350,353,354,358,360,362,363,370]}
};

function _mmpiScore(key, resp) {
  var tv = 0, tf = 0;
  var vItems = key.V || [];
  var fItems = key.F || [];
  for (var i = 0; i < vItems.length; i++) {
    var q = vItems[i];
    if (resp[q] === 'V' || resp[String(q)] === 'V') tv++;
  }
  for (var j = 0; j < fItems.length; j++) {
    var q2 = fItems[j];
    if (resp[q2] === 'F' || resp[String(q2)] === 'F') tf++;
  }
  return { tv: tv, tf: tf, tb: tv + tf };
}

function _mmpiT(col, adjRaw) {
  var r = Math.floor(adjRaw);
  if (r < 0 || r >= _MMPI_T.length) return 0;
  return _MMPI_T[r][col] || 0;
}

function resolverSexoMMPI(evaluacion) {
  var sexoRaw = String((evaluacion && evaluacion.sexo) || '').toLowerCase();
  var cargoStr = String((evaluacion && evaluacion.cargo) || '').toLowerCase();
  return (sexoRaw === 'femenino' || sexoRaw === 'mujer' || sexoRaw === 'f')
    || cargoStr.includes('mujer') || cargoStr.includes('femenin')
    ? 'Mujer' : 'Hombre';
}

function plantillaEscalasMMPI() {
  return ESCALAS_MMPI2.map(function(nombre) {
    return { nombre: nombre, tv: '—', tf: '—', tb: '—', t: 0, no_calificable: true };
  });
}

function calcularMMPI2(evaluacion) {
  try {
    var resp = typeof evaluacion.respuestas === 'string'
      ? JSON.parse(evaluacion.respuestas) : (evaluacion.respuestas || {});
    var esMujer = resolverSexoMMPI(evaluacion) === 'Mujer';
    var cols = esMujer ? _MMPI_COL_M : _MMPI_COL_H;
    var mfKey = esMujer ? _MMPI_KEYS.MfM : _MMPI_KEYS.MfH;

    var L  = _mmpiScore(_MMPI_KEYS.L,  resp);
    var F  = _mmpiScore(_MMPI_KEYS.F,  resp);
    var K  = _mmpiScore(_MMPI_KEYS.K,  resp);
    var Hs = _mmpiScore(_MMPI_KEYS.Hs, resp);
    var D  = _mmpiScore(_MMPI_KEYS.D,  resp);
    var Hy = _mmpiScore(_MMPI_KEYS.Hy, resp);
    var Pd = _mmpiScore(_MMPI_KEYS.Pd, resp);
    var Mf = _mmpiScore(mfKey,          resp);
    var Pa = _mmpiScore(_MMPI_KEYS.Pa, resp);
    var Pt = _mmpiScore(_MMPI_KEYS.Pt, resp);
    var Sc = _mmpiScore(_MMPI_KEYS.Sc, resp);
    var Ma = _mmpiScore(_MMPI_KEYS.Ma, resp);
    var Si = _mmpiScore(_MMPI_KEYS.Si, resp);
    var rK = K.tb;

    var sinC = 0;
    for (var i = 1; i <= 566; i++) {
      var ans = resp[i] || resp[String(i)] || '';
      if (ans !== 'V' && ans !== 'F') sinC++;
    }

    return {
      ok: true,
      sexo: esMujer ? 'Mujer' : 'Hombre',
      sin_contestar: sinC,
      escalas: [
        {code:'L',  nombre:'L — Mentira',               tv:L.tv, tf:L.tf, tb:L.tb, t:_mmpiT(cols.L,  L.tb)},
        {code:'F',  nombre:'F — Infrecuencia',           tv:F.tv, tf:F.tf, tb:F.tb, t:_mmpiT(cols.F,  F.tb)},
        {code:'K',  nombre:'K — Corrección',        tv:K.tv, tf:K.tf, tb:K.tb, t:_mmpiT(cols.K,  rK)},
        {code:'Hs', nombre:'1 — Hipocondría',       tv:Hs.tv,tf:Hs.tf,tb:Hs.tb,t:_mmpiT(cols.Hs, Hs.tb + 0.5*rK)},
        {code:'D',  nombre:'2 — Depresión',         tv:D.tv, tf:D.tf, tb:D.tb, t:_mmpiT(cols.D,  D.tb)},
        {code:'Hy', nombre:'3 — Histeria',               tv:Hy.tv,tf:Hy.tf,tb:Hy.tb,t:_mmpiT(cols.Hy, Hy.tb)},
        {code:'Pd', nombre:'4 — Psicopatía',        tv:Pd.tv,tf:Pd.tf,tb:Pd.tb,t:_mmpiT(cols.Pd, Pd.tb + 0.4*rK)},
        {code:'Mf', nombre:'5 — Masculinidad/Feminidad', tv:Mf.tv,tf:Mf.tf,tb:Mf.tb,t:_mmpiT(cols.Mf, Mf.tb)},
        {code:'Pa', nombre:'6 — Paranoia',               tv:Pa.tv,tf:Pa.tf,tb:Pa.tb,t:_mmpiT(cols.Pa, Pa.tb)},
        {code:'Pt', nombre:'7 — Psicastenia',            tv:Pt.tv,tf:Pt.tf,tb:Pt.tb,t:_mmpiT(cols.Pt, Pt.tb + rK)},
        {code:'Sc', nombre:'8 — Esquizofrenia',          tv:Sc.tv,tf:Sc.tf,tb:Sc.tb,t:_mmpiT(cols.Sc, Sc.tb + rK)},
        {code:'Ma', nombre:'9 — Hipomanía',         tv:Ma.tv,tf:Ma.tf,tb:Ma.tb,t:_mmpiT(cols.Ma, Ma.tb + 0.2*rK)},
        {code:'Si', nombre:'0 — Introversión Social',tv:Si.tv,tf:Si.tf,tb:Si.tb,t:_mmpiT(cols.Si, Si.tb)}
      ]
    };
  } catch(e) {
    return { ok: false, error: e.message, escalas: [] };
  }
}

function normalizarResultadoMMPI(mmpi, evaluacion, completa, stats) {
  var sexo = resolverSexoMMPI(evaluacion);
  var respondidos = (stats && stats.total) || 0;
  var sinC = completa
    ? ((mmpi && mmpi.sin_contestar) || 0)
    : Math.max(0, TOTAL_PREGUNTAS - respondidos);
  var noCalificable = !completa;

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
    motor_error: (mmpi && mmpi.error) || 'Motor de calculo no disponible',
    escalas: plantillaEscalasMMPI()
  };
}

// ── Significado automático por escala (enfoque preventivo Sellbom) ─────────────
// Fuente: especificación funcional "Módulo de Informe Automatizado MMPI-2".
// L usa puntaje directo (tb); el resto usa puntaje T estándar.
function significadoEscalaMMPI(esc, esMujer) {
  var t = esc.t, pd = esc.tb;
  switch (esc.code) {
    case 'L':
      return pd >= 8
        ? { texto: 'Rigidez moral fingida. Defensividad extrema. Alto riesgo de fallas de integridad en el campo.', alerta: true }
        : { texto: 'Sin indicios de distorsión positiva marcada; actitud sincera ante la prueba.', alerta: false };
    case 'F':
      if (t > 100) return { texto: 'Perfil invalidado. Respuestas al azar, errores de corrección, grave dislexia o tendencia a contestar todo como "Verdadero". Actitud no cooperativa, fingimiento de mala imagen de sí mismo o desorientación y confusión psicótica.', alerta: true, invalida: true };
      if (t >= 80)  return { texto: 'Perfil invalidado. Sugiere fingimiento de enfermedad, procesos psicóticos, responder "Falso" a todas las respuestas o exageración de problemas asociados a deseabilidad social o estado confusional.', alerta: true, invalida: true };
      if (t >= 65)  return { texto: 'Probablemente válido. Elevación asociada a fingir enfermedad o procesos psicóticos. Posibles rasgos psicóticos/neuróticos severos, problemas de sociabilidad, cambios de humor, inquietud e imprevisibilidad.', alerta: true };
      if (t >= 60)  return { texto: 'Perfil probablemente válido. Indica problemas en un área particular (trabajo, salud, sexo, etc.).', alerta: false };
      if (t >= 50)  return { texto: 'Registro aceptable. Puntuaciones dentro de la media que reflejan un buen funcionamiento y respuestas típicas.', alerta: false };
      return { texto: 'Registro aceptable. Indica conformidad, convencionalidad, sinceridad social o una posible falsa imagen positiva.', alerta: false };
    case 'K':
      if (t > 70)  return { texto: 'Perfil invalidado por marcada defensividad o fingimiento de buena imagen (contestar todo como "Falso"). Acusada implicación emocional, inhibición, timidez, desconfianza o ausencia de comprensión.', alerta: true, invalida: true };
      if (t >= 60) return { texto: 'Validez cuestionada. Clínicamente defensivo, tendencia a la negación de problemas e intolerancia. Niega todo y muestra nula capacidad para la intuición.', alerta: true };
      if (t >= 50) return { texto: 'Perfil válido. Autoevaluación equilibrada. Individuo ajustado, independiente, inteligente, entusiasta y con intereses amplios.', alerta: false };
      return { texto: 'Perfil invalidado por exageración de desajustes o fingir "hacerse el enfermo" (contestar todo como "Verdadero"). Estado confuso, autocrítico, conformista, introvertido, cínico y suspicaz.', alerta: true, invalida: true };
    case 'Hs':
      if (t > 80)  return { texto: 'Problemas somáticos graves, ilusiones esquizoides o extrañas ilusiones corporales. Individuo constreñido e inmovilizado por múltiples síntomas y quejas.', alerta: true };
      if (t >= 60) return { texto: 'Preocupaciones somáticas, reacción exigente ante cualquier problema real y exageración de problemas físicos. Trastornos del sueño, falta de energía, carácter exigente e insatisfecho.', alerta: true };
      if (t >= 40) return { texto: 'Puntuaciones medias. Pequeñas preocupaciones (o ninguna) acerca del cuerpo o la salud. Emocionalmente abierto, equilibrado, realista y perspicaz.', alerta: false };
      return { texto: 'Ausencia de preocupaciones somáticas. Individuo enérgico, optimista, intuitivo, capaz y efectivo.', alerta: false };
    case 'D':
      if (t > 70)  return { texto: 'Depresión clínica severa. Reservado, afectado seriamente por los problemas, desesperado, con sentimientos de inutilidad. Preocupación por muerte/suicidio, abatido y lento en el pensar y actuar.', alerta: true };
      if (t >= 60) return { texto: 'Depresión moderada e insatisfacción con la vida. Ausencia de energía, incapacidad de concentración, quejas somáticas y problemas de sueño. Falta de confianza en sí mismo, disfórico.', alerta: true };
      if (t >= 40) return { texto: 'Puntuaciones medias. Conforme consigo mismo, estable, ajustado y realista.', alerta: false };
      return { texto: 'Alegre, de buen humor, seguro de sí mismo y autoconfiado. Ausencia de inhibición, rasgos impulsivos, socialmente extravertido y sin desórdenes emocionales.', alerta: false };
    case 'Hy':
      if (t > 80)  return { texto: 'Considerar reacción de conversión. Elevada sugestionabilidad, ansiedad frecuente y episodios de pánico. Carácter desinhibido, rabietas infantiles y tendencia a somatizar la vergüenza.', alerta: true };
      if (t >= 60) return { texto: 'Presencia de síntomas somáticos, trastornos del sueño y ausencia de comprensión sobre las causas. Actitud inmadura, centrada en sí mismo, exigente, absorbente y sugestionable.', alerta: true };
      if (t >= 40) return { texto: 'Puntuaciones medias. Sujeto realista, abierto a los sentimientos, lógico y sensato.', alerta: false };
      return { texto: 'Individuo reservado, conformista y convencional. Intereses reducidos, socialmente aislado, crítico y de mente cerrada.', alerta: false };
    case 'Pd':
      if (t > 75)  return { texto: 'Asocial / comportamiento antisocial. Juicio pobre, inestabilidad, irresponsabilidad, egocéntrico e inmaduro. Perfil atacante y agresivo.', alerta: true };
      if (t >= 60) return { texto: 'Riesgo institucional: posibles problemas con la ley y la autoridad, o consumo de sustancias no autorizadas. Problemas familiares, impulsivo, airado, irritable, no cooperativo/a. Extrovertido, relaciones superficiales, enérgico y creativo.', alerta: true };
      if (t >= 40) return { texto: 'Puntuaciones medias. Sincero, confiado, responsable y persistente.', alerta: false };
      return { texto: 'Convencional, rígido, con aceptación de la autoridad. Sincero, persona de confianza, moralista, autocrítico y excesivamente cumplidor.', alerta: false };
    case 'Mf':
      if (esMujer) {
        if (t > 75)  return { texto: 'Considerar graves problemas sexuales.', alerta: true };
        if (t >= 60) return { texto: 'Rechazo del papel tradicional femenino. Persona asertiva, segura de sí misma y competitiva.', alerta: false };
        if (t >= 40) return { texto: 'Puntuaciones medias. Empática, capaz, competente, acomodaticia, considerada e idealista.', alerta: false };
        return { texto: 'Puntuación baja. Perfil de intereses tradicionalmente femeninos; los rasgos específicos pueden variar entre mayor docilidad/sumisión o mayor asertividad/competencia según el contexto sociocultural del evaluado.', alerta: false };
      }
      if (t > 75)  return { texto: 'Considerar graves problemas sexuales.', alerta: true };
      if (t >= 60) return { texto: 'Conflictos sobre la identidad sexual, ausencia de intereses masculinos tradicionales. Intereses intelectuales, sensible y empático.', alerta: false };
      if (t >= 40) return { texto: 'Puntuaciones medias. Práctico, acomodaticio, realista y convencional.', alerta: false };
      return { texto: 'Patrón tradicional de intereses masculinos, declaraciones machistas, crudo, agresivo. Intereses reducidos, imprudente, orientado a la acción y autoconfiado.', alerta: false };
    case 'Pa':
      if (t > 70)  return { texto: 'Gravedad: considerar psicosis paranoide.', alerta: true };
      if (t >= 60) return { texto: 'Alerta preventiva: predisposición paranoide. Excesivamente sensible, suspicaz, airado, resentido y reservado.', alerta: true };
      if (t >= 50) return { texto: 'Sujeto sensible, suspicaz, airado, resentido. Presenta ausencia de control emocional.', alerta: false };
      if (t >= 45) return { texto: 'Puntuaciones medias. Racional, de pensamiento claro, cauto y flexible.', alerta: false };
      if (t >= 35) return { texto: 'Persona tenaz, evasiva, egocéntrica, insatisfecha y sin intuición. Considerar psicosis.', alerta: true };
      return { texto: 'Probablemente psicosis paranoide. Sujeto cauteloso, evasivo y testarudo.', alerta: true };
    case 'Pt':
      if (t > 75)  return { texto: 'Miedo extremo, ansiedad, tensión. Trastornos del pensamiento, percepción defectuosa, falta de concentración, rumiaciones, rituales rígidos, fobias y sentimientos de culpa.', alerta: true };
      if (t >= 60) return { texto: 'Ansiedad, depresión moderada, falta de seguridad en sí mismo, culpabilidad, perfeccionista e indeciso. No se siente aceptado por los demás.', alerta: true };
      if (t >= 40) return { texto: 'Puntuaciones medias. Confiable, sincero, adaptable y bien organizado.', alerta: false };
      return { texto: 'Ausencia de desórdenes emocionales. Seguro de sí mismo, capaz, competente, con prestigio y reconocimiento.', alerta: false };
    case 'Sc':
      if (t > 75)  return { texto: 'Alerta psiquiátrica: posible trastorno esquizofrénico.', alerta: true };
      if (t >= 60) return { texto: 'Esquizoide de estilo libre, confuso, miedoso. Carácter reservado, no comprometido, tendencia a la fantasía y ensueños excesivos.', alerta: true };
      if (t >= 40) return { texto: 'Puntuaciones medias. Adaptable, dependiente y con un buen equilibrio.', alerta: false };
      return { texto: 'Persona sensible, confiada, prudente, convencional, concreta, práctica y sumisa.', alerta: false };
    case 'Ma':
      if (t > 80)  return { texto: 'Alerta institucional: posible trastorno bipolar, tipo maníaco.', alerta: true };
      if (t >= 70) return { texto: 'Energía excesiva, ausencia de dirección, desorganización conceptual, poco realista en su auto-valoración. Tiránico, mandón, muy hablador, baja tolerancia a la frustración e impulsivo.', alerta: true };
      if (t >= 60) return { texto: 'Rango preventivo policial: sujeto activo, enérgico, extrovertido, creativo y rebelde.', alerta: true };
      if (t >= 40) return { texto: 'Puntuaciones medias. Sociable y amistoso, responsable, realista, entusiasta y equilibrado.', alerta: false };
      return { texto: 'Sujeto sensible, confiado, responsable, prudente, convencional, sumiso, práctico y concreto.', alerta: false };
    case 'Si':
      if (t > 75)  return { texto: 'Extremadamente reservado.', alerta: true };
      if (t >= 60) return { texto: 'Introvertido, reservado, tímido, depresivo, culpable y con bajo ritmo personal. Supercontrolado, sumiso; persona de confianza, formal y responsable en el trabajo.', alerta: false };
      if (t >= 40) return { texto: 'Puntuaciones medias. Activo, enérgico, amistoso, equilibrado y hablador.', alerta: false };
      return { texto: 'Extravertido, sociable, seguro de sí mismo, enérgico, competitivo, poco controlado y manipulativo.', alerta: false };
    default:
      return { texto: '', alerta: false };
  }
}

// ── Diagnóstico automatizado final — riesgo institucional (Bloques I-III) ─────
function diagnosticoFinalMMPI(escalas) {
  function porCodigo(c) { return (escalas || []).filter(function(e) { return e.code === c; })[0]; }
  var L = porCodigo('L'), K = porCodigo('K'), E4 = porCodigo('Pd'), E6 = porCodigo('Pa'), E9 = porCodigo('Ma');
  var pdL = L ? L.tb : 0;
  var ptK = K ? K.t : 0;
  var t4 = E4 ? E4.t : 0, t6 = E6 ? E6.t : 0, t9 = E9 ? E9.t : 0;

  var bloqueI = null;
  if (pdL >= 8) {
    bloqueI = 'La actitud del evaluado ante la prueba muestra una intencionalidad marcada de distorsión positiva (deseo de simular una moralidad impecable). Este nivel de defensividad constituye un predictor estadístico de problemas de rendimiento futuro y fallas de integridad.';
  } else if (ptK >= 60) {
    bloqueI = 'Se observa un perfil defensivo moderado/alto. El evaluado tiende a ocultar sus fallas de adaptación, lo que suele correlacionar con un cuestionamiento encubierto de la normativa institucional.';
  }

  var alertas = [];
  if (t4 >= 60) alertas.push({ code: 'Pd', label: 'Escala 4 — Desviación Psicopática', texto: 'Predictor robusto de mala conducta, impulsividad, rechazo a la autoridad y normas.' });
  if (t6 >= 60) alertas.push({ code: 'Pa', label: 'Escala 6 — Paranoia', texto: 'Suspicacia, resentimiento hacia superiores, reticencia interpersonal, problemas disciplinarios.' });
  if (t9 >= 60) alertas.push({ code: 'Ma', label: 'Escala 9 — Hipomanía', texto: 'Baja tolerancia a la frustración, búsqueda de sensaciones, riesgo de uso innecesario de la fuerza.' });

  var regla1 = t4 >= 60 && t6 >= 60;
  var regla2 = t4 >= 60 && t9 >= 60;
  var reglas = [];
  if (regla1) reglas.push('ALTO RIESGO DISCIPLINARIO: combinación de rechazo a las normas e impulsividad (Escala 4) con resentimiento y suspicacia hacia los superiores (Escala 6). Se sugiere monitoreo preventivo inmediato.');
  if (regla2) reglas.push('ALTO RIESGO OPERATIVO: coexistencia de desviación psicopática (Escala 4) con alta energía, baja tolerancia a la frustración y búsqueda de sensaciones (Escala 9). Predice estadísticamente alta probabilidad de uso desproporcionado de la fuerza física.');

  var alertasRojas = alertas.length;
  var nivel, texto;
  if (alertasRojas >= 3 || regla1 || regla2) {
    nivel = 'ALTO';
    texto = 'Riesgo Alto (Intervención Prioritaria). Requiere intervención, reevaluación presencial por el psicólogo mentor y seguimiento cercano.';
  } else if (alertasRojas >= 1) {
    nivel = 'MODERADO';
    texto = 'Riesgo Moderado (Alerta Preventiva). Se sugiere su inclusión en programas preventivos de control de impulsos o gestión emocional.';
  } else {
    nivel = 'BAJO';
    texto = 'Riesgo Bajo. Continuar con su rol habitual.';
  }

  return { bloqueI: bloqueI, alertas: alertas, reglas: reglas, nivel: nivel, texto: texto, alertasRojas: alertasRojas };
}

// ── Diagnóstico completo de una fila (evaluación o avance) — uso en reportes ──
function calcularDiagnosticoFila(ev) {
  const stats = contarRespuestas(ev);
  const completa = stats.total >= TOTAL_PREGUNTAS;
  if (!completa) return { completa: false, stats: stats, mmpi: null, diag: null };

  const mmpiRaw = calcularMMPI2(ev);
  const mmpi = normalizarResultadoMMPI(mmpiRaw, ev, true, stats);
  if (!mmpi || !mmpi.escalas || !mmpi.escalas.length) {
    return { completa: true, stats: stats, mmpi: mmpi, diag: null };
  }
  const esMujer = mmpi.sexo === 'Mujer';
  const alertCodes = mmpi.escalas
    .filter(function(e) { return e.t > 0 && significadoEscalaMMPI(e, esMujer).alerta; })
    .map(function(e) { return e.code; });
  const diag = diagnosticoFinalMMPI(mmpi.escalas);
  return { completa: true, stats: stats, mmpi: mmpi, diag: diag, alertCodes: alertCodes };
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

function dibujarLeyendaMmpi(doc, x0, y, W) {
  const items = [
    { c: '#c0392b', l: 'Muy elevado (T≥80)' },
    { c: '#e67e22', l: 'Elevado (T 65-79)' },
    { c: '#f39c12', l: 'Leve (T 55-64)' },
    { c: '#27ae60', l: 'Normal (T 45-54)' },
    { c: '#2980b9', l: 'Bajo (T<45)' },
    { c: '#856404', l: 'Provisional / No calificable' }
  ];
  const cols = 3;
  const rowH = 11;
  const colW = W / cols;
  items.forEach(function(it, i) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const lx = x0 + col * colW;
    const ly = y + row * rowH;
    doc.rect(lx, ly + 1, 6, 6).fill(it.c);
    doc.fillColor(COLOR_NEGRO).font('Helvetica').fontSize(7)
       .text(it.l, lx + 9, ly, { width: colW - 12, lineBreak: false });
  });
  return y + Math.ceil(items.length / cols) * rowH + 4;
}

// Dibuja tabla de resultados MMPI-2 (siempre muestra las 13 escalas)
// ── Bloque de diagnóstico automatizado final (Bloques I-III + reglas compuestas) ─
function dibujarDiagnosticoFinalMMPI(doc, diag, x0, y, W, fs) {
  const colorNivel = diag.nivel === 'ALTO' ? '#c0392b' : (diag.nivel === 'MODERADO' ? '#e67e22' : '#27ae60');
  const padX = 7;
  const innerW = W - padX * 2;

  const tituloH = 14;
  doc.rect(x0, y, W, tituloH).fill(COLOR_NEGRO);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(Math.min(fs + 1.2, 9))
     .text('DIAGNÓSTICO AUTOMATIZADO — CONCLUSIÓN DE RIESGO INSTITUCIONAL', x0 + padX, y + 3, { width: innerW, lineBreak: false });
  y += tituloH + 3;

  if (diag.bloqueI) {
    doc.font('Helvetica').fontSize(fs);
    const h = doc.heightOfString(diag.bloqueI, { width: innerW });
    doc.rect(x0, y, W, h + 6).fill('#f7f2e2');
    doc.fillColor('#5c4a12').text(diag.bloqueI, x0 + padX, y + 3, { width: innerW });
    y += h + 6 + 3;
  }

  diag.alertas.forEach(function(a) {
    doc.font('Helvetica').fontSize(fs);
    const txt = a.label + ': ' + a.texto;
    const h = doc.heightOfString(txt, { width: innerW });
    doc.rect(x0, y, W, h + 6).fill('#fdeeee');
    doc.fillColor('#7a1a1a').text(txt, x0 + padX, y + 3, { width: innerW });
    y += h + 6 + 3;
  });

  diag.reglas.forEach(function(r) {
    doc.font('Helvetica-Bold').fontSize(fs);
    const h = doc.heightOfString(r, { width: innerW });
    doc.rect(x0, y, W, h + 6).fill('#fbe1e1');
    doc.fillColor('#7a1a1a').text(r, x0 + padX, y + 3, { width: innerW });
    y += h + 6 + 3;
  });

  doc.font('Helvetica-Bold').fontSize(fs + 0.3);
  const hFinal = doc.heightOfString('NIVEL DE RIESGO: ' + diag.nivel + ' — ' + diag.texto, { width: innerW });
  doc.rect(x0, y, W, hFinal + 8).fill(colorNivel);
  doc.fillColor('#ffffff')
     .text('NIVEL DE RIESGO: ' + diag.nivel + ' — ' + diag.texto, x0 + padX, y + 4, { width: innerW });
  y += hFinal + 8 + 5;

  return y;
}

function dibujarResultadosMMPI2(doc, mmpi, x0, y, W, maxY, opts) {
  opts = opts || {};
  const escalas = (mmpi && mmpi.escalas && mmpi.escalas.length)
    ? mmpi.escalas
    : plantillaEscalasMMPI();
  const sinC = (mmpi && mmpi.sin_contestar != null) ? mmpi.sin_contestar : TOTAL_PREGUNTAS;
  const noCalificable = !!(mmpi && mmpi.no_calificable);
  const provisional = !!(mmpi && mmpi.provisional);
  const completa = opts.completa !== false && !noCalificable;
  const esMujer = (mmpi && mmpi.sexo) === 'Mujer';
  const conDiagnostico = completa && !provisional && !noCalificable;

  let titulo = 'RESULTADOS DEL MMPI-2 — PUNTAJES T ESTÁNDAR';
  if (noCalificable) titulo = 'PARÁMETROS MMPI-2 — AVANCE PARCIAL';
  else if (provisional) titulo = 'RESULTADOS MMPI-2 — PUNTAJES T (PROVISIONAL)';

  const tituloH = 18;
  doc.rect(x0, y, W, tituloH).fill(COLOR_VERDE);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9.5)
     .text(titulo, x0 + 8, y + 4.5, { width: W - 16, lineBreak: false });
  y += tituloH + 2;

  const subH = 14;
  doc.rect(x0, y, W, subH).fill('#f0f4f2');
  doc.fillColor(COLOR_NEGRO).font('Helvetica').fontSize(7.5)
     .text('Normas: ' + ((mmpi && mmpi.sexo) || 'Hombre')
       + '   •   Ítems sin contestar: ' + sinC
       + '   •   Corte clínico: T ≥ 65', x0 + 6, y + 3.5, { width: W - 12, lineBreak: false });
  y += subH + 4;

  if (noCalificable && !opts.omitirAvisoIncompleto) {
    doc.rect(x0, y, W, 22).fill('#fff3cd').stroke('#e6c200');
    doc.fillColor('#7a5c00').font('Helvetica-Bold').fontSize(8)
       .text('AÚN NO ES CALIFICABLE — Complete los 566 ítems y envíe la evaluación (' + (TOTAL_PREGUNTAS - sinC) + '/566).',
         x0 + 8, y + 6, { width: W - 16, lineBreak: false });
    y += 24;
  } else if (provisional) {
    doc.rect(x0, y, W, 18).fill('#fff8e1').stroke('#f0d78c');
    doc.fillColor('#856404').font('Helvetica-Bold').fontSize(8)
       .text('Resultado provisional con respuestas actuales. Puede variar al completar los 566 ítems.',
         x0 + 8, y + 5, { width: W - 16, lineBreak: false });
    y += 20;
  }

  // Columnas: Escala | TV | TF | Bruto | T-score | Estado | Significado (como la vista web)
  const colW = (function() {
    const ratios = conDiagnostico
      ? [0.185, 0.048, 0.048, 0.055, 0.072, 0.132, 0.46]
      : [0.185, 0.07, 0.07, 0.085, 0.09, 0.19, 0.31];
    const cols = ratios.map(function(r) { return Math.floor(W * r); });
    const sum = cols.reduce(function(a, b) { return a + b; }, 0);
    cols[6] += W - sum;
    return cols;
  })();
  const heads = ['Escala', 'TV', 'TF', 'Bruto', 'T-score', 'Estado', 'Significado'];
  const headRowH = 15;
  const borde = '#cfdad2';
  const padCel = 4;

  // ── Preparar significados automáticos por escala y diagnóstico final ─────────
  const filas = escalas.map(function(esc) {
    const tieneT = esc.t > 0;
    const sig = (conDiagnostico && tieneT) ? significadoEscalaMMPI(esc, esMujer) : null;
    return { esc: esc, tieneT: tieneT, sig: sig };
  });
  const diagnostico = conDiagnostico ? diagnosticoFinalMMPI(escalas) : null;

  function alturaFila(f, fs) {
    let h = 14;
    doc.font('Helvetica-Bold').fontSize(7.5);
    h = Math.max(h, doc.heightOfString(f.esc.nombre, { width: colW[0] - padCel * 2 }) + 7);
    if (f.sig && f.sig.texto) {
      doc.font('Helvetica-Oblique').fontSize(fs);
      h = Math.max(h, doc.heightOfString(f.sig.texto, { width: colW[6] - padCel * 2 }) + 7);
    }
    return h;
  }

  // ── Autofit: elegir el tamaño de fuente más grande que quepa en una sola hoja ─
  const availH = Math.max(0, maxY - y - 4);
  let fontSig = 7.2;
  let cabeDiagAqui = true;

  function medirAlturaTabla(fs) {
    let h = headRowH;
    filas.forEach(function(f) { h += alturaFila(f, fs); });
    return h;
  }

  function medirAlturaDiagnostico(fs) {
    if (!diagnostico) return 0;
    let h = 14 + 3;
    const innerW = W - 14;
    if (diagnostico.bloqueI) { doc.font('Helvetica').fontSize(fs); h += doc.heightOfString(diagnostico.bloqueI, { width: innerW }) + 9; }
    diagnostico.alertas.forEach(function(a) {
      doc.font('Helvetica').fontSize(fs);
      h += doc.heightOfString(a.label + ': ' + a.texto, { width: innerW }) + 9;
    });
    diagnostico.reglas.forEach(function(r) {
      doc.font('Helvetica-Bold').fontSize(fs);
      h += doc.heightOfString(r, { width: innerW }) + 9;
    });
    doc.font('Helvetica-Bold').fontSize(fs + 0.3);
    h += doc.heightOfString('NIVEL DE RIESGO: ' + diagnostico.nivel + ' — ' + diagnostico.texto, { width: innerW }) + 13;
    return h;
  }

  if (conDiagnostico) {
    const candidatos = [7.2, 7.0, 6.8, 6.6, 6.4, 6.2, 6.0, 5.8, 5.6];
    for (let i = 0; i < candidatos.length; i++) {
      const fs = candidatos[i];
      const hTabla = medirAlturaTabla(fs);
      const hDiag = medirAlturaDiagnostico(Math.max(fs, 6.2));
      if (hTabla + hDiag <= availH) {
        fontSig = fs;
        cabeDiagAqui = true;
        break;
      }
      if (i === candidatos.length - 1) {
        fontSig = fs;
        cabeDiagAqui = hTabla + hDiag <= availH;
      }
    }
  }

  doc.rect(x0, y, W, headRowH).fill(COLOR_VERDE);
  let tx = x0;
  heads.forEach(function(h, i) {
    const centrado = i >= 1 && i <= 4;
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(7.5)
       .text(h, tx + padCel, y + 4, { width: colW[i] - padCel * 2, align: centrado ? 'center' : 'left', lineBreak: false });
    if (i < heads.length - 1) {
      doc.strokeColor('#3d7a62').lineWidth(0.4).moveTo(tx + colW[i], y).lineTo(tx + colW[i], y + headRowH).stroke();
    }
    tx += colW[i];
  });
  y += headRowH;

  filas.forEach(function(f, idx) {
    const esc = f.esc;
    const rowH = alturaFila(f, fontSig);
    if (y + rowH > maxY - 2) return;
    const tieneT = f.tieneT;
    const inter = noCalificable && !tieneT
      ? { label: 'NO CALIFICABLE', color: '#b8860b' }
      : (noCalificable && tieneT
        ? { label: 'PROVISIONAL', color: '#856404' }
        : (tieneT ? interpretarT(esc.t) : { label: '—', color: '#888888' }));
    const bg = idx % 2 === 0 ? '#f4f8f5' : '#ffffff';
    doc.rect(x0, y, W, rowH).fill(bg);
    doc.strokeColor(borde).lineWidth(0.45).moveTo(x0, y + rowH).lineTo(x0 + W, y + rowH).stroke();

    tx = x0;
    // Escala (negrita, puede envolver)
    doc.fillColor(COLOR_NEGRO).font('Helvetica-Bold').fontSize(7.5)
       .text(esc.nombre, tx + padCel, y + 3.5, { width: colW[0] - padCel * 2 });
    doc.strokeColor(borde).lineWidth(0.35).moveTo(tx + colW[0], y).lineTo(tx + colW[0], y + rowH).stroke();
    tx += colW[0];

    // TV / TF / Bruto / T-score (centrados)
    const vals = [
      esc.tv != null && esc.tv !== '—' ? String(esc.tv) : '—',
      esc.tf != null && esc.tf !== '—' ? String(esc.tf) : '—',
      esc.tb != null && esc.tb !== '—' ? String(esc.tb) : '—',
      tieneT ? String(esc.t) : '—'
    ];
    vals.forEach(function(val, i) {
      doc.fillColor(COLOR_NEGRO).font('Helvetica').fontSize(7.5)
         .text(val, tx + padCel, y + 3.5, { width: colW[i + 1] - padCel * 2, align: 'center', lineBreak: false });
      doc.strokeColor(borde).lineWidth(0.35).moveTo(tx + colW[i + 1], y).lineTo(tx + colW[i + 1], y + rowH).stroke();
      tx += colW[i + 1];
    });

    // Estado (cuadrito de color + etiqueta)
    const estadoLabel = noCalificable && !tieneT ? 'NO CALIFICABLE' : inter.label;
    doc.rect(tx + padCel, y + 4, 5, 5).fill(inter.color);
    doc.fillColor(COLOR_NEGRO).font('Helvetica').fontSize(6.8)
       .text(estadoLabel, tx + padCel + 8, y + 3.5, { width: colW[5] - padCel * 2 - 8 });
    doc.strokeColor(borde).lineWidth(0.35).moveTo(tx + colW[5], y).lineTo(tx + colW[5], y + rowH).stroke();
    tx += colW[5];

    // Significado (cursiva, al costado)
    if (f.sig && f.sig.texto) {
      doc.fillColor(f.sig.alerta ? '#7a1a1a' : '#444444').font('Helvetica-Oblique').fontSize(fontSig)
         .text(f.sig.texto, tx + padCel, y + 3.5, { width: colW[6] - padCel * 2 });
    } else {
      doc.fillColor('#bbbbbb').font('Helvetica').fontSize(7)
         .text('—', tx + padCel, y + 3.5, { width: colW[6] - padCel * 2, lineBreak: false });
    }

    y += rowH;
  });

  if (diagnostico) {
    y += 5;
    if (cabeDiagAqui) {
      y = dibujarDiagnosticoFinalMMPI(doc, diagnostico, x0, y, W, Math.max(fontSig, 6.2));
    }
  } else if (completa || provisional || noCalificable) {
    y += 4;
    y = dibujarLeyendaMmpi(doc, x0, y, W);
  }

  return { y: y, diagnostico: diagnostico, diagPendiente: diagnostico && !cabeDiagAqui, fontSig: Math.max(fontSig, 6.2) };
}

function dibujarBannerAvance(doc, stats, maxId, x0, y, W) {
  const pendientes = Math.max(0, 566 - (stats.total || 0));
  const pct = Math.min(100, Math.round(((stats.total || 0) / 566) * 100));
  const bannerH = 38;
  doc.rect(x0, y, W, bannerH).fill('#fff8e1').stroke('#e6c200');
  doc.fillColor('#7a5c00').font('Helvetica-Bold').fontSize(10)
     .text('EVALUACIÓN INCOMPLETA — Avance: ' + (stats.total || 0) + '/566 (' + pct + '%)', x0 + 10, y + 7, { width: W - 20, lineBreak: false });
  doc.font('Helvetica').fontSize(8)
     .text('Respondidos: V=' + (stats.v || 0) + '  F=' + (stats.f || 0)
       + '  |  Pendientes: ' + pendientes + ' ítems'
       + (maxId > 0 ? '  |  Último ítem: ' + maxId : ''),
       x0 + 10, y + 21, { width: W - 20, lineBreak: false });
  return y + bannerH;
}

function dibujarCabeceraPortal(doc, subtitulo) {
  doc.rect(0, 0, doc.page.width, 70).fill(COLOR_VERDE);
  doc.rect(0, 70, doc.page.width, 3).fill(COLOR_ORO);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(13)
     .text('POLICÍA NACIONAL DEL PERÚ', 40, 14, { align: 'center', width: doc.page.width - 80, lineBreak: false });
  doc.font('Helvetica').fontSize(10)
     .text('REGIÓN POLICIAL CALLAO — UNITIC', 40, 30, { align: 'center', width: doc.page.width - 80, lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(9).fillColor(COLOR_ORO)
     .text(subtitulo, 40, 46, { align: 'center', width: doc.page.width - 80, lineBreak: false });
}

function dibujarPiePortal(doc, pagina, totalPaginas) {
  const altoPie = 28;
  const y = yPieSeguro(doc, altoPie);
  doc.rect(0, y - 5, doc.page.width, altoPie + 8).fill('#eeeeee');
  doc.rect(0, y - 5, doc.page.width, 2).fill(COLOR_ORO);
  doc.fillColor(COLOR_GRIS).font('Helvetica').fontSize(7.5)
     .text('REGPOL CALLAO — UNITIC 2026 — Constancia de vacante / selección',
           40, y + 2, { align: 'left', width: 350, lineBreak: false });
  doc.text('Pág. ' + pagina + ' / ' + totalPaginas,
           doc.page.width - 100, y + 2, { align: 'right', width: 60, lineBreak: false });
}

function extraerUniformeDeRequisitos(requisitos) {
  let reqs = requisitos;
  if (typeof reqs === 'string') {
    try { reqs = JSON.parse(reqs); } catch (e) { reqs = []; }
  }
  if (!Array.isArray(reqs)) return '';
  const hit = reqs.find(function(r) {
    return /uniforme/i.test(String(r || ''));
  });
  return hit ? String(hit) : '';
}

const DEFAULTS_CONSTANCIA_CONVENIO = {
  'PLAN CELADOR': {
    uniforme: 'Uniforme de faena completo (camisa, pantalón, correa y fornitura reglamentaria).',
    lugar: 'Dependencia o comisaría asignada — confirmar punto de formación diaria en Oficina de Convenios.',
    horario: '08:00 a 20:00 hrs (12 horas por turno).',
    contactos: 'Oficina de Convenios — REGPOL Callao | WhatsApp: 927 577 686.'
  }
};

function detallesConstanciaConvenio(item) {
  const titulo = String(item.titulo || '').trim().toUpperCase();
  const defs = DEFAULTS_CONSTANCIA_CONVENIO[titulo] || {};
  const uniformeReq = extraerUniformeDeRequisitos(item.requisitos);
  return {
    uniforme: String(item.uniforme || '').trim() || uniformeReq || defs.uniforme || 'Uniforme reglamentario de faena completo y documento de identidad.',
    lugar: String(item.lugar || '').trim() || defs.lugar || 'Oficina gestora — REGPOL Callao (confirmar con el área).',
    horario: String(item.horario || '').trim() || defs.horario || 'Por confirmar — consulte con el área correspondiente.',
    contactos: String(item.contactos_responsables || '').trim() || defs.contactos || 'Oficina de Convenios — REGPOL Callao | WhatsApp: 927 577 686.',
    beneficio: String(item.fecha_inicio || '').trim(),
    detalleBeneficio: String(item.duracion || '').trim(),
    observaciones: String(item.observaciones || '').trim()
  };
}

function generarPDFConstanciaVacante(inscripcion, item) {
  return new Promise(function(resolve) {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 75, bottom: 45, left: 40, right: 40 },
      autoFirstPage: false,
      bufferPages: true
    });
    const chunks = [];
    doc.on('data', function(c) { chunks.push(c); });
    doc.on('end', function() { resolve(Buffer.concat(chunks)); });

    const m = { left: 40, right: 40, top: 75, bottom: 45 };
    const W = A4_W - m.left - m.right;
    const x0 = m.left;
    const maxY = A4_H - m.bottom - 20;
    let y = 78;

    const esCurso = item.tipo === 'curso';
    const tituloDoc = esCurso
      ? 'CONSTANCIA DE SELECCIÓN — CURSO DE CAPACITACIÓN'
      : 'CONSTANCIA DE VACANTE OCUPADA — CONVENIO';

    doc.addPage();
    dibujarCabeceraPortal(doc, tituloDoc);

    doc.rect(x0, y, W, 22).fill('#ececec').stroke('#c8c8c8');
    doc.fillColor(COLOR_NEGRO).font('Helvetica-Bold').fontSize(11)
       .text(tituloDoc, x0 + 10, y + 6, { width: W - 20, align: 'center', lineBreak: false });
    y += 30;

    const dataFs = 9;
    const lineH = 13;
    const lineas = [
      'CIP: ' + String(inscripcion.cip || '—'),
      'DNI: ' + String(inscripcion.dni || '—'),
      'GRADO: ' + formatearGradoDisplay(inscripcion.grado),
      'APELLIDOS Y NOMBRES: ' + String(inscripcion.nombres || '—').toUpperCase(),
      'UNIDAD: ' + String(inscripcion.unidad || '—').toUpperCase(),
      'CARGO: ' + String(inscripcion.cargo || '—').toUpperCase()
    ];
    doc.fillColor(COLOR_NEGRO).font('Helvetica').fontSize(dataFs);
    lineas.forEach(function(txt) {
      doc.text(txt, x0, y, { width: W, lineBreak: false, ellipsis: true });
      y += lineH;
    });
    y += 8;

    function seccion(titulo) {
      if (y > maxY - 40) {
        doc.addPage();
        dibujarCabeceraPortal(doc, tituloDoc);
        y = 78;
      }
      doc.rect(x0, y, W, 18).fill(COLOR_VERDE);
      doc.fillColor('#fff').font('Helvetica-Bold').fontSize(9)
         .text(titulo, x0 + 8, y + 5, { width: W - 16, lineBreak: false });
      y += 22;
    }

    function textoBloque(txt) {
      doc.fillColor(COLOR_NEGRO).font('Helvetica').fontSize(dataFs)
         .text(txt, x0, y, { width: W, lineBreak: true });
      y += doc.heightOfString(txt, { width: W }) + 4;
    }

    seccion('CONVOCATORIA');
    textoBloque('Tipo: ' + (esCurso ? 'Curso de capacitación' : 'Convenio interinstitucional'));
    textoBloque('Denominación: ' + (item.titulo || '—'));
    textoBloque('Vacantes del proceso: ' + (item.vacantes != null ? String(item.vacantes) : '—'));
    textoBloque('Fecha de inscripción: ' + formatearFechaPDF(inscripcion.fecha));
    const det = detallesConstanciaConvenio(item);
    if (!esCurso && det.beneficio) {
      textoBloque('Beneficio económico: ' + det.beneficio + (det.detalleBeneficio ? ' — ' + det.detalleBeneficio : ''));
    }
    y += 4;

    seccion('UNIFORME Y PRESENTACIÓN');
    textoBloque('Uniforme autorizado: ' + det.uniforme);
    textoBloque('Documentación: CIP, DNI y constancia impresa o digital al momento de presentarse.');
    y += 4;

    seccion('LUGAR DE FORMACIÓN / PRESENTACIÓN DIARIA');
    textoBloque('Lugar donde debe presentarse cada día: ' + det.lugar);
    textoBloque('Fecha de inicio: ' + (item.fecha_inicio || 'Por confirmar'));
    textoBloque('Duración / período: ' + (item.duracion || '—'));
    if (inscripcion.disponibilidad) {
      textoBloque('Disponibilidad declarada: ' + inscripcion.disponibilidad
        + (inscripcion.dia_franco ? ' — Día franco: ' + inscripcion.dia_franco : ''));
    }
    y += 4;

    seccion('HORARIO DE SERVICIO');
    textoBloque('Horario asignado: ' + det.horario);
    y += 4;

    seccion('CONTACTOS DE RESPONSABLES');
    textoBloque(det.contactos);
    if (det.observaciones) textoBloque('Indicaciones adicionales: ' + det.observaciones);
    y += 4;

    seccion('RESPONSABILIDADES Y COMPROMISOS');
    let reqs = item.requisitos;
    if (typeof reqs === 'string') {
      try { reqs = JSON.parse(reqs); } catch (e) { reqs = []; }
    }
    if (!Array.isArray(reqs)) reqs = [];
    const bullets = reqs.slice();
    if (item.descripcion && String(item.descripcion).trim()) {
      bullets.push(String(item.descripcion).trim());
    }
    bullets.push('Cumplir con las disposiciones del Reglamento de la PNP y las normas del convenio o curso.');
    bullets.push('Presentarse puntualmente en el lugar y horario indicados con uniforme reglamentario y documento de identidad.');
    bullets.push(esCurso
      ? 'Mantener conducta intachable durante todo el programa de capacitación.'
      : 'Desempeñar las funciones asignadas conforme al convenio y a las directivas del área.');

    bullets.forEach(function(b, idx) {
      if (y > maxY - 20) {
        doc.addPage();
        dibujarCabeceraPortal(doc, tituloDoc);
        y = 78;
      }
      const linea = (idx + 1) + '. ' + b;
      doc.fillColor(COLOR_NEGRO).font('Helvetica').fontSize(8.5)
         .text(linea, x0 + 4, y, { width: W - 8, lineBreak: true });
      y += doc.heightOfString(linea, { width: W - 8 }) + 3;
    });

    if (item.observaciones) {
      y += 6;
      if (y > maxY - 30) {
        doc.addPage();
        dibujarCabeceraPortal(doc, tituloDoc);
        y = 78;
      }
      const obs = 'Observaciones: ' + item.observaciones;
      doc.fillColor(COLOR_GRIS).font('Helvetica-Oblique').fontSize(8)
         .text(obs, x0, y, { width: W, lineBreak: true });
      y += doc.heightOfString(obs, { width: W }) + 4;
    }

    y += 10;
    if (y > maxY - 55) {
      doc.addPage();
      dibujarCabeceraPortal(doc, tituloDoc);
      y = 78;
    }
    doc.rect(x0, y, W, 52).fill('#f7faf7').stroke('#cfdad2');
    doc.fillColor(COLOR_NEGRO).font('Helvetica').fontSize(8.5)
       .text('El presente documento acredita la ocupación de vacante. Preséntelo impreso o en formato digital al momento de su incorporación.',
         x0 + 10, y + 8, { width: W - 20, lineBreak: true });
    const oficina = esCurso
      ? 'Oficina de Educación Policial — REGPOL Callao'
      : 'Oficina de Convenios — REGPOL Callao';
    doc.font('Helvetica-Bold').fontSize(8.5)
       .text(oficina, x0 + 10, y + 34, { width: W - 20, lineBreak: false });

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      dibujarPiePortal(doc, i - range.start + 1, range.count);
    }

    doc.end();
  });
}

module.exports = {
  generarPDFIndividual,
  generarPDFComisaria,
  generarPDFConstanciaVacante,
  calcularMMPI2,
  normalizarResultadoMMPI,
  interpretarT,
  contarRespuestas,
  formatearArmamentoLegible,
  formatearGradoDisplay,
  maxItemRespondido,
  ESCALAS_MMPI2,
  significadoEscalaMMPI,
  diagnosticoFinalMMPI
};
