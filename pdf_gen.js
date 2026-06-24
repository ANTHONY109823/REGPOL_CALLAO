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

const COLOR_VERDE  = '#004d3d';
const COLOR_ORO    = '#c8a94a';
const COLOR_GRIS   = '#555555';
const COLOR_NEGRO  = '#1a1a1a';
const COLOR_LINEA  = '#cccccc';

const GRID_COLS    = 10;
const GRID_ROW_H   = 12;
const GRID_GAP     = 2;
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
    const vals = Object.values(r);
    return {
      total: vals.length,
      v: vals.filter(function(x) { return x === 'V'; }).length,
      f: vals.filter(function(x) { return x === 'F'; }).length
    };
  } catch (e) {
    return { total: 0, v: 0, f: 0 };
  }
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

function dibujarPie(doc, pagina, totalPaginas) {
  const y = doc.page.height - 35;
  doc.rect(0, y - 5, doc.page.width, 40).fill('#eeeeee');
  doc.rect(0, y - 5, doc.page.width, 2).fill(COLOR_ORO);
  doc.fillColor(COLOR_GRIS).font('Helvetica').fontSize(7.5)
     .text('REGPOL CALLAO — UNITIC 2026 — Documento confidencial de uso psicológico exclusivo',
           40, y + 4, { align: 'left', width: 350, lineBreak: false });
  doc.text('Pág. ' + pagina + ' / ' + totalPaginas,
           doc.page.width - 100, y + 4, { align: 'right', width: 60, lineBreak: false });
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
  const edadTxt = ev.edad ? ev.edad + ' años' : '—';
  const sexoTxt = ev.sexo || '—';
  const cargoTxt = ev.cargo || '—';
  const armaTxt = ev.armamento || 'Sin armamento';
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
  doc.text('ARMAMENTO: ' + armaTxt, x0 + pad, ty, { width: Math.min(textoW, W * 0.62), lineBreak: false, ellipsis: true });

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

// ── Matriz compacta N° + respuesta (10 columnas) ──────────────────────────────
function dibujarGrillaCompacta(doc, x0, y0, W, maxY, resp, desdeId, totalIds) {
  const colW = (W - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;
  const filaInicio = Math.floor((desdeId - 1) / GRID_COLS);
  let id = desdeId;

  while (id <= totalIds) {
    const col = (id - 1) % GRID_COLS;
    const fila = Math.floor((id - 1) / GRID_COLS) - filaInicio;
    const cy = y0 + fila * GRID_ROW_H;

    if (cy + GRID_ROW_H > maxY) break;

    const cx = x0 + col * (colW + GRID_GAP);
    const r = resp[id] || resp[String(id)] || '';

    doc.fillColor(COLOR_NEGRO).font('Helvetica').fontSize(6.5)
       .text(String(id), cx + 1, cy + 2, { width: 12, lineBreak: false });

    const bx = cx + 14;
    const bw = colW - 15;
    doc.rect(bx, cy + 1, bw, 9)
       .fill(r === 'V' ? '#d4edda' : (r === 'F' ? '#f8d7da' : '#f5f5f5'))
       .stroke('#bbbbbb');
    if (r) {
      doc.fillColor(r === 'V' ? '#1a7a3a' : '#7a1a1a').font('Helvetica-Bold').fontSize(6.5)
         .text(r, bx, cy + 2, { width: bw, align: 'center', lineBreak: false });
    }
    id++;
  }

  return id;
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
  var soloResultados = opts.soloResultados !== false;
  return new Promise(function(resolve) {
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

    let resp = {};
    try {
      resp = typeof evaluacion.respuestas === 'string'
        ? JSON.parse(evaluacion.respuestas) : (evaluacion.respuestas || {});
    } catch (e) {}

    const totalV = Object.values(resp).filter(function(v) { return v === 'V'; }).length;
    const totalF = Object.values(resp).filter(function(v) { return v === 'F'; }).length;
    const m  = { left: 40, right: 40, top: 75, bottom: 45 };
    const W  = A4_W - m.left - m.right;
    const x0 = m.left;
    const maxY = A4_H - m.bottom - 8;

    doc.addPage();
    dibujarCabecera(doc);
    let y = 78;
    y = dibujarEncabezadoEfectivo(doc, x0, y, W, evaluacion, totalV, totalF) + 10;
    y = dibujarResultadosMMPI2(doc, mmpi, x0, y, W, maxY);

    if (!soloResultados) {
      const totalIds = (preguntas || PREGUNTAS_DEFAULT).length;
      let gridId = 1;
      const TITULO_H = 14;
      const CONT_H = 16;
      const MIN_FILAS = 5;
      const espacioDisponible = maxY - y;
      if (espacioDisponible >= TITULO_H + GRID_ROW_H * MIN_FILAS) {
        y += 8;
        doc.fillColor(COLOR_VERDE).font('Helvetica-Bold').fontSize(9)
           .text('MATRIZ DE RESPUESTAS — ÍTEM / V o F', x0, y, { width: W, lineBreak: false });
        y += TITULO_H;
        gridId = dibujarGrillaCompacta(doc, x0, y, W, maxY, resp, gridId, totalIds);
      }
      let paginasVacias = 0;
      while (gridId <= totalIds && paginasVacias < 2) {
        const prevId = gridId;
        doc.addPage();
        dibujarCabecera(doc);
        y = 78;
        doc.fillColor(COLOR_GRIS).font('Helvetica').fontSize(8)
           .text('Matriz de respuestas (continuación) — ' + (evaluacion.nombres || '—'),
                 x0, y, { width: W, lineBreak: false, ellipsis: true });
        y += CONT_H;
        gridId = dibujarGrillaCompacta(doc, x0, y, W, maxY, resp, gridId, totalIds);
        if (gridId === prevId) paginasVacias++;
        else paginasVacias = 0;
      }
    }

    aplicarPiesEnTodas(doc);
    doc.end();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF POR COMISARÍA — resumen de todos los efectivos
// ─────────────────────────────────────────────────────────────────────────────
function generarPDFComisaria(comisaria, evaluaciones, preguntas) {
  return new Promise(function(resolve) {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 70, bottom: 45, left: 40, right: 40 },
      autoFirstPage: false,
      bufferPages: true
    });
    const chunks = [];
    doc.on('data', function(c) { chunks.push(c); });
    doc.on('end',  function()  { resolve(Buffer.concat(chunks)); });

    const m  = { left: 40, right: 40, top: 70, bottom: 45 };
    const W  = A4_W - m.left - m.right;
    const x0 = m.left;
    const rowH = 16;
    const cols = [26, 148, 52, 52, 68, 26, 26, 48];
    const heads = ['N°', 'Apellidos y Nombres', 'CIP', 'DNI', 'Fecha', 'V', 'F', 'Avance'];

    doc.addPage();
    dibujarCabeceraLista(doc);

    doc.fillColor(COLOR_VERDE).font('Helvetica-Bold').fontSize(13)
       .text('LISTADO DE EFECTIVOS EVALUADOS', 40, 68, { align: 'center', width: doc.page.width - 80, lineBreak: false });
    doc.fillColor(COLOR_ORO).font('Helvetica-Bold').fontSize(11)
       .text(String(comisaria || '').toUpperCase(), 40, 86, { align: 'center', width: doc.page.width - 80, lineBreak: false });

    let rowY = 108;
    dibujarFilaTabla(doc, x0, rowY, W, cols, heads, { header: true, rowH: rowH });
    rowY += rowH;

    evaluaciones.forEach(function(ev, idx) {
      if (rowY > A4_H - 55) {
        doc.addPage();
        dibujarCabeceraLista(doc);
        rowY = 68;
        dibujarFilaTabla(doc, x0, rowY, W, cols, heads, { header: true, rowH: rowH });
        rowY += rowH;
      }

      const stats = contarRespuestas(ev);
      const fecha = String(ev.fecha || '—').substring(0, 16);
      dibujarFilaTabla(doc, x0, rowY, W, cols, [
        String(idx + 1),
        ev.nombres || '—',
        ev.cip || '—',
        ev.dni || '—',
        fecha,
        String(stats.v),
        String(stats.f),
        stats.total + '/566'
      ], { par: idx % 2 === 0, rowH: rowH });
      rowY += rowH;
    });

    aplicarPiesEnTodas(doc);
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
function dibujarResultadosMMPI2(doc, mmpi, x0, y, W, maxY) {
  if (!mmpi || !mmpi.ok || !mmpi.escalas || !mmpi.escalas.length) {
    doc.fillColor('#888').font('Helvetica').fontSize(9)
       .text('Resultados MMPI-2 no disponibles.', x0, y);
    return y + 20;
  }

  const escalas = mmpi.escalas;

  // Título sección
  doc.rect(x0, y, W, 16).fill(COLOR_VERDE);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9)
     .text('RESULTADOS DEL MMPI-2 — PUNTAJES T ESTÁNDAR', x0 + 6, y + 4,
           { width: W - 12, lineBreak: false });
  y += 16;

  // Subtítulo sexo y sin contestar
  const sinC = mmpi.sin_contestar || 0;
  doc.fillColor(COLOR_GRIS).font('Helvetica').fontSize(7.5)
     .text(`Normas: ${mmpi.sexo || 'Hombre'}   •   Ítems sin contestar: ${sinC}   •   Punto de corte clínico: T ≥ 65`, x0, y, { width: W, lineBreak: false });
  y += 12;

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

module.exports = { generarPDFIndividual, generarPDFComisaria, calcularMMPI2, interpretarT, contarRespuestas };
