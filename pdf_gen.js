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

const GRID_COLS    = 10;
const GRID_ROW_H   = 12;
const GRID_GAP     = 2;
const MATRIZ_FILAS_COL = 50;
const MATRIZ_ROW_H     = 11;
const MATRIZ_COL_GAP   = 3;
const TOTAL_PREGUNTAS  = 566;
const VERT_FILAS   = 50;
const VERT_ROW_H   = 11;
const VERT_GAP_COL = 3;
const TOTAL_ITEMS_MMPI = 566;
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

function plantillaEscalasPendientes(sexo) {
  return {
    ok: false,
    incompleta: true,
    sexo: sexo || 'Hombre',
    sin_contestar: 566,
    escalas: ESCALAS_MMPI2.map(function(nombre) {
      return { nombre: nombre, tv: '—', tf: '—', tb: '—', t: 0, pendiente: true };
    })
  };
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

// ── Encabezado del efectivo — banner plomo con grado, datos y foto ─────────────
function dibujarEncabezadoEfectivo(doc, x0, y, W, ev, totalV, totalF) {
  const tieneFoto = ev.foto && String(ev.foto).length > 80;
  const fotoW = 56;
  const fotoH = 68;
  const pad = 8;
  const bannerH = 88;
  const textoW = tieneFoto ? W - fotoW - pad * 3 : W - pad * 2;

  doc.rect(x0, y, W, bannerH).fill('#ececec').stroke('#c8c8c8');

  const gradoTxt = String(ev.grado || '—').toUpperCase();
  const nombreTxt = String(ev.nombres || '—').toUpperCase();
  const edadTxt = (function() {
    const e = resolverEdad(ev);
    return e ? e + ' años' : '—';
  })();
  const sexoTxt = ev.sexo || '—';
  const cargoTxt = ev.cargo || '—';
  const armaTxt = formatearArmamentoLegible(ev.armamento || '');
  const fechaTxt = formatearFechaPDF(ev.fecha);

  let ty = y + pad;
  doc.fillColor(COLOR_VERDE).font('Helvetica-Bold').fontSize(7.5)
     .text('GRADO: ' + gradoTxt, x0 + pad, ty, { width: textoW, lineBreak: false, ellipsis: true });
  ty += 11;
  doc.fillColor(COLOR_NEGRO).font('Helvetica-Bold').fontSize(10.5)
     .text(nombreTxt, x0 + pad, ty, { width: textoW, lineBreak: false, ellipsis: true });
  ty += 13;
  doc.font('Helvetica').fontSize(7.5).fillColor(COLOR_NEGRO)
     .text('CIP: ' + (ev.cip || '—') + '          DNI: ' + (ev.dni || '—'), x0 + pad, ty, { width: textoW, lineBreak: false });
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

// ── Matriz vertical: columnas de 50 ítems (1-50, 51-100, …) — solo N° y V/F ──
function totalColumnasMatriz(totalIds) {
  return Math.ceil(totalIds / MATRIZ_FILAS_COL);
}

function dibujarMatrizRespuestasVertical(doc, x0, y0, W, maxY, resp, totalIds, colDesde, colHasta) {
  const colsEnPagina = colHasta - colDesde;
  const colW = (W - MATRIZ_COL_GAP * Math.max(colsEnPagina - 1, 0)) / colsEnPagina;
  const numW = Math.min(18, Math.max(14, Math.floor(colW * 0.4)));
  const boxW = Math.max(10, colW - numW - 2);

  for (let ci = colDesde; ci < colHasta; ci++) {
    const cx = x0 + (ci - colDesde) * (colW + MATRIZ_COL_GAP);
    for (let r = 0; r < MATRIZ_FILAS_COL; r++) {
      const id = ci * MATRIZ_FILAS_COL + r + 1;
      if (id > totalIds) continue;
      const cy = y0 + r * MATRIZ_ROW_H;
      if (cy + MATRIZ_ROW_H > maxY) return false;

      const ans = resp[id] || resp[String(id)] || '';
      doc.fillColor(COLOR_VERDE).font('Helvetica-Bold').fontSize(6.5)
         .text(String(id), cx, cy + 2, { width: numW, lineBreak: false, align: 'right' });
      const bx = cx + numW + 2;
      doc.rect(bx, cy + 1, boxW, 8)
        .fill(ans === 'V' ? '#e8f5ec' : (ans === 'F' ? '#fdeaea' : '#f4f4f4'))
        .stroke('#cccccc');
      if (ans) {
        doc.fillColor(ans === 'V' ? '#1a7a3a' : '#7a1a1a').font('Helvetica-Bold').fontSize(6.5)
           .text(ans, bx, cy + 2, { width: boxW, align: 'center', lineBreak: false });
      }
    }
  }
  return true;
}

function dibujarPaginasMatrizRespuestas(doc, evaluacion, resp, x0, W, maxY) {
  const totalIds = TOTAL_PREGUNTAS;
  const numCols = totalColumnasMatriz(totalIds);
  const COLS_POR_PAGINA = 6;

  for (let colStart = 0; colStart < numCols; colStart += COLS_POR_PAGINA) {
    const colEnd = Math.min(colStart + COLS_POR_PAGINA, numCols);
    doc.addPage();
    dibujarCabecera(doc);
    let y = 78;
    const esPrimera = colStart === 0;
    doc.fillColor(COLOR_VERDE).font('Helvetica-Bold').fontSize(9)
       .text(esPrimera ? 'MATRIZ DE RESPUESTAS — N° / V o F' : 'MATRIZ DE RESPUESTAS (continuación)',
         x0, y, { width: W, lineBreak: false });
    y += 12;
    if (esPrimera) {
      doc.fillColor(COLOR_GRIS).font('Helvetica').fontSize(7.5)
         .text('566 ítems · Numeración vertical (50 por columna) · V = Verdadero / F = Falso',
           x0, y, { width: W, lineBreak: false });
      y += 10;
    }
    const itemDesde = colStart * MATRIZ_FILAS_COL + 1;
    const itemHasta = Math.min(colEnd * MATRIZ_FILAS_COL, totalIds);
    doc.fillColor(COLOR_GRIS).font('Helvetica').fontSize(7)
       .text('Ítems ' + itemDesde + ' — ' + itemHasta + '  ·  ' + (evaluacion.nombres || '—'),
         x0, y, { width: W, lineBreak: false, ellipsis: true });
    y += 10;
    dibujarMatrizRespuestasVertical(doc, x0, y, W, maxY, resp, totalIds, colStart, colEnd);
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
    const mmpi = calcularMMPI2(evaluacion);

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
      y = dibujarBannerAvance(doc, stats, maxItemRespondido(resp), x0, y, W) + 6;
    }
    y = dibujarResultadosMMPI2(doc, mmpi, x0, y, W, maxY, { provisional: !completa });

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
// MMPI-2 Scoring — llama script Python que usa el Excel oficial
// ─────────────────────────────────────────────────────────────────────────────
function calcularMMPI2(evaluacion) {
  try {
    const resp = typeof evaluacion.respuestas === 'string'
      ? JSON.parse(evaluacion.respuestas) : (evaluacion.respuestas || {});

    // Usar campo sexo explícito; fallback inferir desde cargo
    const sexoRaw = String(evaluacion.sexo || '').toLowerCase();
    const cargoStr = String(evaluacion.cargo || '').toLowerCase();
    const sexo = (sexoRaw === 'femenino' || sexoRaw === 'mujer' || sexoRaw === 'f')
      || cargoStr.includes('mujer') || cargoStr.includes('femenin')
      ? 'Mujer' : 'Hombre';

    const input = JSON.stringify({ sexo, respuestas: resp });
    const result = spawnSync('py', ['-3', MMPI2_SCRIPT_PATH], {
      input,
      encoding: 'utf8',
      timeout: 120000,
      maxBuffer: 1024 * 1024,
      env: Object.assign({}, process.env, { PYTHONIOENCODING: 'utf-8' })
    });

    if (result.error) throw result.error;
    const out = (result.stdout || '').trim();
    if (!out) throw new Error('Sin salida del script: ' + (result.stderr || ''));
    return JSON.parse(out);
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

// Dibuja tabla de resultados MMPI-2
function dibujarResultadosMMPI2(doc, mmpi, x0, y, W, maxY, opts) {
  opts = opts || {};
  if (!mmpi || !mmpi.ok || !mmpi.escalas || !mmpi.escalas.length) {
    doc.fillColor('#888').font('Helvetica').fontSize(9)
       .text('Resultados MMPI-2 no disponibles' + (mmpi && mmpi.error ? ': ' + mmpi.error : '') + '.', x0, y);
    return y + 20;
  }

  const escalas = mmpi.escalas;
  const sinC = mmpi.sin_contestar || 0;
  const provisional = opts.provisional || sinC > 0;

  // Título sección
  doc.rect(x0, y, W, 16).fill(COLOR_VERDE);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9)
     .text(provisional
       ? 'RESULTADOS MMPI-2 — PUNTAJES T (PROVISIONAL)'
       : 'RESULTADOS DEL MMPI-2 — PUNTAJES T ESTÁNDAR',
       x0 + 6, y + 4, { width: W - 12, lineBreak: false });
  y += 16;

  doc.fillColor(COLOR_GRIS).font('Helvetica').fontSize(7.5)
     .text('Normas: ' + (mmpi.sexo || 'Hombre') + '   •   Ítems sin contestar: ' + sinC
       + '   •   Punto de corte clínico: T ≥ 65', x0, y, { width: W, lineBreak: false });
  y += 12;

  if (provisional) {
    doc.rect(x0, y, W, 20).fill('#fff8e1').stroke('#f0d78c');
    doc.fillColor('#856404').font('Helvetica-Bold').fontSize(7.5)
       .text('Evaluación en avance (' + (TOTAL_PREGUNTAS - sinC) + '/566). Resultado calculado con respuestas actuales.',
         x0 + 6, y + 4, { width: W - 12, lineBreak: false });
    doc.font('Helvetica').fontSize(7)
       .text('Los puntajes pueden variar al completar y enviar la evaluación.', x0 + 6, y + 12,
         { width: W - 12, lineBreak: false });
    y += 22;
  }

  // Cabecera tabla
  const colW  = [120, 32, 32, 38, 42, 70];
  const heads = ['Escala', 'TV', 'TF', 'Bruto', 'T-score', 'Interpretación'];
  const rowH  = 14;

  doc.rect(x0, y, W, rowH).fill(COLOR_VERDE);
  let tx = x0;
  heads.forEach(function(h, i) {
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(7.5)
       .text(h, tx + 3, y + 3, { width: colW[i] - 6, lineBreak: false });
    tx += colW[i];
  });
  y += rowH;

  // Filas de escalas
  escalas.forEach(function(esc, idx) {
    if (y + rowH > maxY) return;
    const inter = interpretarT(esc.t);
    const bg = idx % 2 === 0 ? '#f7faf7' : '#ffffff';
    doc.rect(x0, y, W, rowH).fill(bg).stroke('#e0e8e0');

    tx = x0;
    const celdas = [
      esc.nombre,
      String(esc.tv),
      String(esc.tf),
      String(esc.tb),
      esc.t > 0 ? String(esc.t) : '—',
      inter.label
    ];
    celdas.forEach(function(val, i) {
      const isT = (i === 4);
      const isInt = (i === 5);
      const color = isInt ? inter.color : (isT && esc.t >= 65 ? '#c0392b' : COLOR_NEGRO);
      const bold = (i === 0) || (isT && esc.t >= 65) || isInt;
      doc.fillColor(color).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.5)
         .text(val, tx + 3, y + 3, { width: colW[i] - 6, lineBreak: false });
      tx += colW[i];
    });

    // Barra visual del T-score (columna interpretación como barra)
    if (esc.t > 0) {
      const barX = x0 + colW[0] + colW[1] + colW[2] + colW[3] + colW[4] - 2;
      const barW = colW[5] - 4;
      const barH = rowH - 6;
      const pct = Math.min(esc.t / 120, 1);
      doc.rect(barX, y + 3, barW, barH).fill('#eeeeee');
      doc.rect(barX, y + 3, barW * pct, barH).fill(inter.color);
    }

    y += rowH;
  });

  // Leyenda
  y += 4;
  const leyenda = [
    { c: '#c0392b', l: 'Muy elevado (T≥80)' },
    { c: '#e67e22', l: 'Elevado (T 65-79)' },
    { c: '#f39c12', l: 'Leve elevación (T 55-64)' },
    { c: '#27ae60', l: 'Normal (T 45-54)' },
    { c: '#2980b9', l: 'Bajo (T<45)' },
  ];
  let lx = x0;
  leyenda.forEach(function(it) {
    doc.rect(lx, y, 8, 8).fill(it.c);
    doc.fillColor(COLOR_GRIS).font('Helvetica').fontSize(6.5)
       .text(it.l, lx + 10, y + 1, { width: 80, lineBreak: false });
    lx += 92;
  });
  y += 14;

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
  interpretarT,
  contarRespuestas,
  formatearArmamentoLegible,
  maxItemRespondido,
  ESCALAS_MMPI2
};
