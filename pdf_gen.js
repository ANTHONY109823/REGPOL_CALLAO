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
  var PREGUNTAS = preguntas || PREGUNTAS_DEFAULT;
  return new Promise(function(resolve) {
    const doc    = new PDFDocument({ size: 'A4', margins: { top: 85, bottom: 45, left: 40, right: 40 }, autoFirstPage: false });
    const chunks = [];
    doc.on('data', function(c) { chunks.push(c); });
    doc.on('end',  function()  { resolve(Buffer.concat(chunks)); });

    const totalPaginas = evaluaciones.length + 1;
    let   numPag = 0;

    // ── PORTADA ───────────────────────────────────────────────────────────────
    numPag++;
    doc.addPage();
    dibujarCabecera(doc);

    const m  = doc.page.margins;
    const W  = doc.page.width - m.left - m.right;
    const x0 = m.left;

    doc.y = 100;
    doc.fillColor(COLOR_VERDE).font('Helvetica-Bold').fontSize(15)
       .text('INFORME DE CUESTIONARIO PSICOLÓGICO', { align: 'center' });
    doc.moveDown(0.3);
    doc.fillColor(COLOR_ORO).font('Helvetica-Bold').fontSize(13)
       .text(comisaria.toUpperCase(), { align: 'center' });
    doc.moveDown(0.5);
    doc.fillColor(COLOR_GRIS).font('Helvetica').fontSize(9)
       .text('Inventario Multifásico de Personalidad de Minnesota — 2 (Versión Argentina)', { align: 'center' });
    doc.moveDown(1.5);

    // Cuadro resumen
    const fechaHoy = new Date().toLocaleDateString('es-PE', { day:'2-digit', month:'long', year:'numeric' });
    const totalEval = evaluaciones.length;
    const totalCompletas = evaluaciones.filter(function(e){
      try { return Object.keys(JSON.parse(e.respuestas||'{}')).length === 566; } catch(ex){ return false; }
    }).length;

    doc.rect(x0 + W*0.15, doc.y, W*0.7, 90).fill('#f0f7f0').stroke(COLOR_VERDE);
    const cy0 = doc.y + 12;
    doc.fillColor(COLOR_VERDE).font('Helvetica-Bold').fontSize(10)
       .text('RESUMEN DEL INFORME', x0 + W*0.15, cy0, { width: W*0.7, align: 'center' });
    doc.fillColor(COLOR_NEGRO).font('Helvetica').fontSize(9)
       .text('Fecha de generación:  ' + fechaHoy, x0 + W*0.15 + 20, cy0 + 18)
       .text('Total de efectivos evaluados:  ' + totalEval, x0 + W*0.15 + 20, cy0 + 33)
       .text('Evaluaciones completas (566/566):  ' + totalCompletas, x0 + W*0.15 + 20, cy0 + 48)
       .text('Dependencia:  ' + comisaria.toUpperCase(), x0 + W*0.15 + 20, cy0 + 63);

    doc.y = cy0 + 100;
    doc.moveDown(1);

    // Lista de efectivos
    doc.fillColor(COLOR_VERDE).font('Helvetica-Bold').fontSize(10)
       .text('EFECTIVOS EVALUADOS', { align: 'center' });
    doc.moveDown(0.5);

    // Cabecera tabla lista
    const cols = [30, 200, 60, 60, 80];
    const heads = ['N°', 'Apellidos y Nombres', 'CIP', 'DNI', 'Fecha Eval.'];
    let tx = x0;
    doc.rect(x0, doc.y, W, 18).fill(COLOR_VERDE);
    heads.forEach(function(h, i) {
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8)
         .text(h, tx + 4, doc.y + 4, { width: cols[i]-6 });
      tx += cols[i];
    });
    doc.y += 18;

    evaluaciones.forEach(function(ev, idx) {
      const resp   = {};
      try { Object.assign(resp, JSON.parse(ev.respuestas||'{}')); } catch(e) {}
      const totalR = Object.keys(resp).length;
      const par    = idx % 2 === 0;

      doc.rect(x0, doc.y, W, 16).fill(par ? '#f7faf7' : '#ffffff');

      tx = x0;
      const celdas = [
        String(idx+1),
        ev.nombres || '—',
        ev.cip || '—',
        ev.dni || '—',
        (ev.fecha || '—').substring(0, 10)
      ];
      celdas.forEach(function(c, i) {
        const color = i === 0 ? COLOR_VERDE : COLOR_NEGRO;
        doc.fillColor(color).font(i===0||i===1?'Helvetica-Bold':'Helvetica').fontSize(7.5)
           .text(c, tx + 4, doc.y + 3, { width: cols[i]-8, ellipsis: true });
        tx += cols[i];
      });

      // Badge de completitud
      const badge = totalR + '/566';
      const bColor = totalR === 566 ? '#27ae60' : '#e67e22';
      doc.rect(x0 + W - 50, doc.y + 2, 46, 12).fill(bColor).stroke(bColor);
      doc.fillColor('#fff').font('Helvetica-Bold').fontSize(7)
         .text(badge, x0 + W - 50, doc.y + 3, { width: 46, align: 'center' });

      doc.y += 16;

      // Nueva página si no cabe
      if (doc.y > doc.page.height - 80) {
        dibujarPie(doc, numPag, totalPaginas);
        doc.addPage();
        numPag++;
        dibujarCabecera(doc);
        doc.y = 88;
      }
    });

    dibujarPie(doc, numPag, totalPaginas);

    // ── UNA PÁGINA POR EFECTIVO — Resumen de sus respuestas ──────────────────
    evaluaciones.forEach(function(ev) {
      numPag++;
      doc.addPage();
      dibujarCabecera(doc);

      let resp = {};
      try { resp = JSON.parse(ev.respuestas||'{}'); } catch(e) {}
      const vCount = Object.values(resp).filter(function(v){return v==='V';}).length;
      const fCount = Object.values(resp).filter(function(v){return v==='F';}).length;

      // Encabezado efectivo
      doc.y = 82;
      doc.rect(x0, doc.y, W, 36).fill('#eef7ee').stroke(COLOR_VERDE);
      doc.fillColor(COLOR_VERDE).font('Helvetica-Bold').fontSize(10)
         .text(ev.nombres || '—', x0+10, doc.y+4, { width: W*0.65 });
      doc.fillColor(COLOR_GRIS).font('Helvetica').fontSize(8)
         .text('CIP: ' + (ev.cip||'—') + '   DNI: ' + (ev.dni||'—') + '   Edad: ' + (ev.edad||'—') + ' años', x0+10, doc.y+18, { width: W*0.65 });
      // Stats en esquina
      doc.fillColor('#1a7a3a').font('Helvetica-Bold').fontSize(10)
         .text('V: ' + vCount, x0+W*0.72, doc.y+4, { width: 50 });
      doc.fillColor('#7a1a1a').font('Helvetica-Bold').fontSize(10)
         .text('F: ' + fCount, x0+W*0.72, doc.y+18, { width: 50 });
      doc.fillColor(COLOR_NEGRO).font('Helvetica').fontSize(8)
         .text('Fecha: ' + (ev.fecha||'—').substring(0,16), x0+W*0.82, doc.y+4, { width: W*0.18 });
      doc.y += 44;

      // Cuadrícula de respuestas compacta (10 columnas × N filas)
      const anchoCol = Math.floor(W / 10);
      const altFila  = 15;
      const NUM_COLS = 10;
      let col = 0, ry = doc.y;

      PREGUNTAS.forEach(function(p, idx) {
        const cx  = x0 + col * anchoCol;
        const res = resp[p.id] || '—';
        const par = idx % 2 === 0;

        doc.rect(cx, ry, anchoCol, altFila).fill(par ? '#f7faf7' : '#fff').stroke('#e0e8e0');

        // Número
        doc.fillColor(COLOR_VERDE).font('Helvetica-Bold').fontSize(6)
           .text(p.id, cx+2, ry+2, { width: 18, align: 'right' });

        // Respuesta coloreada
        const rColor = res==='V' ? '#1a7a3a' : (res==='F' ? '#7a1a1a' : '#bbb');
        const rBg    = res==='V' ? '#d4edda'  : (res==='F' ? '#f8d7da'  : '#eee');
        doc.rect(cx+anchoCol-14, ry+2, 11, 11).fill(rBg);
        doc.fillColor(rColor).font('Helvetica-Bold').fontSize(7.5)
           .text(res, cx+anchoCol-14, ry+3, { width: 11, align: 'center' });

        col++;
        if (col >= NUM_COLS) {
          col = 0;
          ry += altFila;
          if (ry + altFila > doc.page.height - 50) {
            dibujarPie(doc, numPag, totalPaginas);
            doc.addPage();
            numPag++;
            dibujarCabecera(doc);
            ry = 88;
          }
        }
      });

      dibujarPie(doc, numPag, totalPaginas);
    });

    doc.end();
  });
}

module.exports = { generarPDFIndividual, generarPDFComisaria };
