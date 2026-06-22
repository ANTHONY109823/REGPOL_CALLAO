/*
  pdf_gen.js — Generador de PDFs para REGPOL Callao
  Cuestionario Psicológico — UNITIC — 2026
*/

const PDFDocument = require('pdfkit');
const PREGUNTAS_DEFAULT = require('./preguntas_data.json');

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

// ── Encabezado del efectivo (barra nombre + datos) ────────────────────────────
function dibujarEncabezadoEfectivo(doc, x0, y, W, ev, totalV, totalF) {
  doc.rect(x0, y, W, 22).fill(COLOR_VERDE);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(11)
     .text(String(ev.nombres || '—').toUpperCase(), x0 + 8, y + 6, { width: W - 16, lineBreak: false, ellipsis: true });
  y += 22;

  doc.rect(x0, y, W, 17).fill('#ececec');
  doc.fillColor(COLOR_NEGRO).font('Helvetica').fontSize(7.5)
     .text('CIP: ' + (ev.cip || '—') + '   DNI: ' + (ev.dni || '—') + '   Edad: ' + (ev.edad ? ev.edad + ' años' : '—'),
           x0 + 6, y + 5, { width: W * 0.52, lineBreak: false });
  doc.fillColor('#1a7a3a').font('Helvetica-Bold').fontSize(8)
     .text('V: ' + totalV, x0 + W * 0.54, y + 4, { lineBreak: false });
  doc.fillColor('#7a1a1a')
     .text('F: ' + totalF, x0 + W * 0.62, y + 4, { lineBreak: false });
  doc.fillColor(COLOR_GRIS).font('Helvetica').fontSize(7.5)
     .text('Fecha: ' + (ev.fecha || '—'), x0 + W * 0.72, y + 5, { width: W * 0.26, align: 'right', lineBreak: false });
  return y + 17;
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
//   1) Matriz compacta N° + V/F (como imagen de referencia)
//   2) Bloque detallado pregunta + respuesta
// ─────────────────────────────────────────────────────────────────────────────
function generarPDFIndividual(evaluacion, preguntas) {
  var PREGUNTAS = preguntas || PREGUNTAS_DEFAULT;
  return new Promise(function(resolve) {
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
    const totalIds = PREGUNTAS.length;
    const m  = { left: 40, right: 40, top: 75, bottom: 45 };
    const W  = A4_W - m.left - m.right;
    const x0 = m.left;
    const maxY = A4_H - m.bottom - 8;

    // ── BLOQUE 1: Matriz compacta ─────────────────────────────────────────────
    let gridId = 1;
    let primeraHojaGrilla = true;

    while (gridId <= totalIds) {
      doc.addPage();
      dibujarCabecera(doc);

      let y = 78;
      if (primeraHojaGrilla) {
        y = dibujarEncabezadoEfectivo(doc, x0, y, W, evaluacion, totalV, totalF) + 8;
        doc.fillColor(COLOR_VERDE).font('Helvetica-Bold').fontSize(9)
           .text('MATRIZ DE RESPUESTAS — ÍTEM / V o F', x0, y, { width: W, lineBreak: false });
        y += 14;
        primeraHojaGrilla = false;
      } else {
        doc.fillColor(COLOR_GRIS).font('Helvetica').fontSize(8)
           .text('Matriz de respuestas (continuación) — ' + (evaluacion.nombres || '—'),
                 x0, y, { width: W, lineBreak: false, ellipsis: true });
        y += 16;
      }

      gridId = dibujarGrillaCompacta(doc, x0, y, W, maxY, resp, gridId, totalIds);
    }

    // ── BLOQUE 2: Preguntas y respuestas detalladas ───────────────────────────
    const POR_PAGINA = 50;
    const altFila = 18;

    for (let inicio = 0; inicio < PREGUNTAS.length; inicio += POR_PAGINA) {
      doc.addPage();
      dibujarCabecera(doc);

      let y = 78;
      if (inicio === 0) {
        doc.fillColor(COLOR_VERDE).font('Helvetica-Bold').fontSize(11)
           .text('RESPUESTAS DETALLADAS AL CUESTIONARIO — ' + totalIds + ' ÍTEMS', x0, y, { width: W, align: 'center', lineBreak: false });
        y += 16;
        doc.fillColor(COLOR_GRIS).font('Helvetica').fontSize(7.5)
           .text('V = Verdadero   F = Falso   — = Sin respuesta', x0, y, { width: W, align: 'center', lineBreak: false });
        y += 12;
      } else {
        doc.fillColor(COLOR_GRIS).font('Helvetica').fontSize(7.5)
           .text('Respuestas detalladas (continuación) — ' + (evaluacion.nombres || '—'),
                 x0, y, { width: W, lineBreak: false, ellipsis: true });
        y += 14;
      }

      doc.fillColor(COLOR_GRIS).font('Helvetica').fontSize(7.5)
         .text('CIP: ' + (evaluacion.cip || '—') + '   Comisaría: ' + (evaluacion.comisaria || '—'),
               x0, y, { width: W, lineBreak: false, ellipsis: true });
      y += 16;

      const bloque = PREGUNTAS.slice(inicio, inicio + POR_PAGINA);
      const mitad  = Math.ceil(bloque.length / 2);
      const col1   = bloque.slice(0, mitad);
      const col2   = bloque.slice(mitad);
      const colW   = (W - 16) / 2;

      [col1, col2].forEach(function(col, ci) {
        const cx = x0 + ci * (colW + 16);
        col.forEach(function(p, i) {
          const ry = y + i * altFila;
          const respuesta = resp[p.id] || resp[String(p.id)] || '—';
          const esPar = i % 2 === 0;

          doc.rect(cx, ry, colW, altFila).fill(esPar ? '#f7faf7' : '#ffffff');
          doc.rect(cx, ry, colW, altFila).stroke('#e0e8e0');

          doc.fillColor(COLOR_VERDE).font('Helvetica-Bold').fontSize(7)
             .text(String(p.id).padStart(3, ' '), cx + 3, ry + 5, { width: 20, align: 'right', lineBreak: false });

          doc.fillColor(COLOR_NEGRO).font('Helvetica').fontSize(6.8)
             .text(p.texto, cx + 26, ry + 3, { width: colW - 52, height: altFila - 4, ellipsis: true, lineBreak: false });

          const rColor = respuesta === 'V' ? '#1a7a3a' : (respuesta === 'F' ? '#7a1a1a' : '#999');
          doc.rect(cx + colW - 22, ry + 3, 18, 12)
             .fill(respuesta === 'V' ? '#d4edda' : (respuesta === 'F' ? '#f8d7da' : '#eee'));
          doc.fillColor(rColor).font('Helvetica-Bold').fontSize(8)
             .text(respuesta, cx + colW - 22, ry + 4, { width: 18, align: 'center', lineBreak: false });
        });
      });
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

module.exports = { generarPDFIndividual, generarPDFComisaria };
