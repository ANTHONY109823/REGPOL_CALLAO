/*
  pdf_gen.js — Generador de PDFs para REGPOL Callao
  Cuestionario Psicológico — UNITIC — 2026
*/

const PDFDocument = require('pdfkit');
const PREGUNTAS_DEFAULT = require('./preguntas_data.json');

// Colores institucionales
const COLOR_VERDE  = '#004d3d';
const COLOR_ORO    = '#c8a94a';
const COLOR_GRIS   = '#555555';
const COLOR_NEGRO  = '#1a1a1a';
const COLOR_CLARO  = '#f5f5f5';
const COLOR_LINEA  = '#cccccc';

// ── Cabecera compacta (listados) ───────────────────────────────────────────────
function dibujarCabeceraLista(doc) {
  doc.rect(0, 0, doc.page.width, 52).fill(COLOR_VERDE);
  doc.rect(0, 52, doc.page.width, 3).fill(COLOR_ORO);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(12)
     .text('POLICÍA NACIONAL DEL PERÚ — REGPOL CALLAO', 40, 14, { align: 'center', width: doc.page.width - 80 });
  doc.font('Helvetica').fontSize(9)
     .text('Listado de evaluaciones psicológicas', 40, 32, { align: 'center', width: doc.page.width - 80 });
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

// ── Cabecera institucional ────────────────────────────────────────────────────
function dibujarCabecera(doc) {
  // Fondo verde cabecera
  doc.rect(0, 0, doc.page.width, 70).fill(COLOR_VERDE);

  // Línea dorada
  doc.rect(0, 70, doc.page.width, 3).fill(COLOR_ORO);

  // Texto cabecera
  doc.fillColor('#ffffff')
     .font('Helvetica-Bold').fontSize(13)
     .text('POLICÍA NACIONAL DEL PERÚ', 60, 14, { align: 'center' });
  doc.font('Helvetica').fontSize(10)
     .text('REGIÓN POLICIAL CALLAO — UNITIC', 60, 30, { align: 'center' });
  doc.font('Helvetica-Bold').fontSize(9).fillColor(COLOR_ORO)
     .text('EVALUACIÓN MMPI-2 — BIENESTAR DEL PERSONAL POLICIAL', 60, 46, { align: 'center' });

  doc.moveDown(0.5);
}

// ── Pie de página ─────────────────────────────────────────────────────────────
function dibujarPie(doc, pagina, totalPaginas) {
  const y = doc.page.height - 35;
  doc.rect(0, y - 5, doc.page.width, 40).fill('#eeeeee');
  doc.rect(0, y - 5, doc.page.width, 2).fill(COLOR_ORO);

  doc.fillColor(COLOR_GRIS).font('Helvetica').fontSize(7.5)
     .text('REGPOL CALLAO — UNITIC 2026 — Documento confidencial de uso psicológico exclusivo',
           40, y + 4, { align: 'left', width: 350 });
  doc.text('Pág. ' + pagina + ' / ' + totalPaginas,
           doc.page.width - 100, y + 4, { align: 'right', width: 60 });
}

// ── Formato de fechas ─────────────────────────────────────────────────────────
function formatearFechaPDF(valor) {
  if (!valor) return '—';
  if (valor instanceof Date && !isNaN(valor.getTime())) {
    return valor.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  const s = String(valor);
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[3] + '/' + iso[2] + '/' + iso[1];
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
  return s.length > 16 ? s.substring(0, 10) : s;
}

// ── Caja de dato personal ─────────────────────────────────────────────────────
function cajaInfo(doc, x, y, w, label, valor) {
  doc.rect(x, y, w, 28).fill('#f9f9f9').stroke(COLOR_LINEA);
  doc.fillColor(COLOR_GRIS).font('Helvetica').fontSize(7)
     .text(label, x + 6, y + 5);
  doc.fillColor(COLOR_NEGRO).font('Helvetica-Bold').fontSize(10)
     .text(String(valor || '—'), x + 6, y + 14, { width: w - 12 });
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF INDIVIDUAL — un efectivo
// ─────────────────────────────────────────────────────────────────────────────
function generarPDFIndividual(evaluacion, preguntas) {
  var PREGUNTAS = preguntas || PREGUNTAS_DEFAULT;
  return new Promise(function(resolve) {
    const doc    = new PDFDocument({ size: 'A4', margins: { top: 85, bottom: 45, left: 40, right: 40 }, autoFirstPage: false });
    const chunks = [];
    doc.on('data', function(c) { chunks.push(c); });
    doc.on('end',  function()  { resolve(Buffer.concat(chunks)); });

    let resp = {};
    try { resp = typeof evaluacion.respuestas === 'string' ? JSON.parse(evaluacion.respuestas) : (evaluacion.respuestas || {}); } catch(e) {}

    const totalV = Object.values(resp).filter(function(v){ return v==='V'; }).length;
    const totalF = Object.values(resp).filter(function(v){ return v==='F'; }).length;
    const totalPaginasBase = 1 + Math.ceil(PREGUNTAS.length / 50);

    // ── PÁGINA 1: Ficha personal ──────────────────────────────────────────────
    doc.addPage();
    dibujarCabecera(doc);

    // Título sección
    doc.y = 90;
    doc.fillColor(COLOR_VERDE).font('Helvetica-Bold').fontSize(12)
       .text('FICHA DE EVALUACIÓN — CUESTIONARIO PSICOLÓGICO', { align: 'center' });
    doc.moveDown(0.3);
    doc.fillColor(COLOR_GRIS).font('Helvetica').fontSize(8)
       .text('Evaluación Psicológica del Personal Policial — REGPOL Callao', { align: 'center' });
    doc.moveDown(0.8);

    // Datos personales — primero los más cortos, luego los extensos
    const m   = doc.page.margins;
    const W   = doc.page.width - m.left - m.right;
    const x0  = m.left;
    let   cy  = doc.y;

    const w4 = (W - 12) / 4;
    cajaInfo(doc, x0,          cy, w4, 'CIP',              evaluacion.cip || '—');
    cajaInfo(doc, x0+w4+4,     cy, w4, 'DNI',              evaluacion.dni || '—');
    cajaInfo(doc, x0+(w4+4)*2, cy, w4, 'EDAD',             evaluacion.edad ? evaluacion.edad + ' años' : '—');
    cajaInfo(doc, x0+(w4+4)*3, cy, w4, 'FECHA EVALUACIÓN', evaluacion.fecha || '—');
    cy += 32;

    const w3 = (W - 8) / 3;
    cajaInfo(doc, x0,       cy, w3, 'RESPUESTAS V (VERDADERO)', totalV + ' / 566');
    cajaInfo(doc, x0+w3+4,  cy, w3, 'RESPUESTAS F (FALSO)',     totalF + ' / 566');
    cajaInfo(doc, x0+w3*2+8,cy, w3, 'TOTAL RESPONDIDAS',        (totalV + totalF) + ' / 566');
    cy += 32;

    cajaInfo(doc, x0,          cy, W*0.5-4, 'COMISARÍA / DEPENDENCIA', evaluacion.comisaria);
    cajaInfo(doc, x0+W*0.5+4, cy, W*0.5-4, 'UNIDAD ACTUAL',           evaluacion.unidad);
    cy += 32;

    cajaInfo(doc, x0, cy, W, 'APELLIDOS Y NOMBRES COMPLETOS', evaluacion.nombres);
    cy += 32;

    cajaInfo(doc, x0, cy, W*0.5-4, 'FECHA DE NACIMIENTO', formatearFechaPDF(evaluacion.fecha_nac));
    cajaInfo(doc, x0+W*0.5+4, cy, W*0.5-4, 'ESTADO', evaluacion.completada ? 'COMPLETA' : 'PARCIAL');
    cy += 36;

    // Aviso confidencialidad
    doc.rect(x0, cy, W, 22).fill('#fff8e1');
    doc.fillColor('#7a5c00').font('Helvetica-Bold').fontSize(8)
       .text('⚠  DOCUMENTO CONFIDENCIAL — Solo para uso del personal de psicología autorizado de la REGPOL Callao.', x0+8, cy+7, { width: W-16 });
    cy += 28;

    dibujarPie(doc, 1, totalPaginasBase);

    let numPag = 1;
    const POR_PAGINA = 50;
    const totalPaginas = 1 + Math.ceil(PREGUNTAS.length / POR_PAGINA);

    doc.addPage();
    numPag = 2;
    dibujarCabecera(doc);
    doc.y = 90;
    doc.fillColor(COLOR_VERDE).font('Helvetica-Bold').fontSize(11)
       .text('RESPUESTAS DETALLADAS AL CUESTIONARIO — ' + PREGUNTAS.length + ' ÍTEMS', { align: 'center' });
    doc.moveDown(0.3);
    doc.fillColor(COLOR_GRIS).font('Helvetica').fontSize(7.5)
       .text('V = Verdadero     F = Falso     — = Sin respuesta', { align: 'center' });
    doc.moveDown(0.4);
    doc.fillColor(COLOR_GRIS).font('Helvetica').fontSize(7.5)
       .text('Efectivo: ' + (evaluacion.nombres || '—') + '   CIP: ' + (evaluacion.cip || '—') + '   Comisaría: ' + (evaluacion.comisaria || '—'), { align: 'center' });
    doc.moveDown(0.5);

    for (var inicio = 0; inicio < PREGUNTAS.length; inicio += POR_PAGINA) {
      if (inicio > 0) {
        numPag++;
        doc.addPage();
        dibujarCabecera(doc);
        doc.y = 82;
        doc.fillColor(COLOR_GRIS).font('Helvetica').fontSize(7.5)
           .text('Efectivo: ' + (evaluacion.nombres || '—') + '   CIP: ' + (evaluacion.cip || '—') + '   Comisaría: ' + (evaluacion.comisaria || '—'));
        doc.moveDown(0.3);
      }

      const bloque = PREGUNTAS.slice(inicio, inicio + POR_PAGINA);
      const mitad  = Math.ceil(bloque.length / 2);
      const col1   = bloque.slice(0, mitad);
      const col2   = bloque.slice(mitad);
      const colW   = (W - 20) / 2;
      const startY = doc.y + 4;

      [col1, col2].forEach(function(col, ci) {
        const cx = x0 + ci * (colW + 20);
        let   ry = startY;

        col.forEach(function(p, i) {
          const respuesta = resp[p.id] || '—';
          const esPar     = i % 2 === 0;
          const altFila   = 18;

          doc.rect(cx, ry, colW, altFila).fill(esPar ? '#f7faf7' : '#ffffff');
          doc.rect(cx, ry, colW, altFila).stroke('#e0e8e0');

          doc.fillColor(COLOR_VERDE).font('Helvetica-Bold').fontSize(7)
             .text(String(p.id).padStart(3,' '), cx + 3, ry + 5, { width: 20, align: 'right' });

          doc.fillColor(COLOR_NEGRO).font('Helvetica').fontSize(6.8)
             .text(p.texto, cx + 26, ry + 3, { width: colW - 52, height: altFila - 4, ellipsis: true });

          const rColor = respuesta === 'V' ? '#1a7a3a' : (respuesta === 'F' ? '#7a1a1a' : '#999');
          doc.rect(cx + colW - 22, ry + 3, 18, 12).fill(respuesta === 'V' ? '#d4edda' : (respuesta === 'F' ? '#f8d7da' : '#eee'));
          doc.fillColor(rColor).font('Helvetica-Bold').fontSize(8)
             .text(respuesta, cx + colW - 22, ry + 4, { width: 18, align: 'center' });

          ry += altFila;
        });
      });

      dibujarPie(doc, numPag, totalPaginas);
    }

    doc.end();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF POR COMISARÍA — resumen de todos los efectivos
// ─────────────────────────────────────────────────────────────────────────────
function generarPDFComisaria(comisaria, evaluaciones, preguntas) {
  return new Promise(function(resolve) {
    const doc    = new PDFDocument({ size: 'A4', margins: { top: 70, bottom: 45, left: 40, right: 40 }, autoFirstPage: false });
    const chunks = [];
    doc.on('data', function(c) { chunks.push(c); });
    doc.on('end',  function()  { resolve(Buffer.concat(chunks)); });

    const m  = doc.page.margins;
    const W  = doc.page.width - m.left - m.right;
    const x0 = m.left;
    const rowH = 16;
    const cols = [26, 148, 52, 52, 68, 26, 26, 48];
    const heads = ['N°', 'Apellidos y Nombres', 'CIP', 'DNI', 'Fecha', 'V', 'F', 'Avance'];
    const rowsPerPage = Math.floor((doc.page.height - 130 - 45) / rowH) - 1;
    const totalPaginas = Math.max(1, Math.ceil((evaluaciones.length + 1) / rowsPerPage));

    let numPag = 1;
    doc.addPage();
    dibujarCabeceraLista(doc);

    doc.y = 68;
    doc.fillColor(COLOR_VERDE).font('Helvetica-Bold').fontSize(13)
       .text('LISTADO DE EFECTIVOS EVALUADOS', { align: 'center' });
    doc.moveDown(0.2);
    doc.fillColor(COLOR_ORO).font('Helvetica-Bold').fontSize(11)
       .text(String(comisaria || '').toUpperCase(), { align: 'center' });
    doc.moveDown(0.6);

    let rowY = doc.y;
    dibujarFilaTabla(doc, x0, rowY, W, cols, heads, { header: true, rowH: rowH });
    rowY += rowH;

    evaluaciones.forEach(function(ev, idx) {
      if (rowY > doc.page.height - 55) {
        dibujarPie(doc, numPag, totalPaginas);
        numPag++;
        doc.addPage();
        dibujarCabeceraLista(doc);
        rowY = 68;
        dibujarFilaTabla(doc, x0, rowY, W, cols, heads, { header: true, rowH: rowH });
        rowY += rowH;
      }

      const stats = contarRespuestas(ev);
      const fecha = String(ev.fecha || '—').substring(0, 10);
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

    dibujarPie(doc, numPag, totalPaginas);
    doc.end();
  });
}

module.exports = { generarPDFIndividual, generarPDFComisaria };
