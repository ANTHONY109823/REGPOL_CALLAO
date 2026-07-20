/**
 * Genera guía PDF: Diagnóstico Automatizado — Riesgo Institucional (MMPI-2).
 * Uso: node scripts/gen-diagnostico-riesgo-pdf.js
 */
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const OUT = path.join(__dirname, '..', 'docs', 'MMPI2_Diagnostico_Riesgo_Institucional.pdf');
const OUT_PUBLIC = path.join(__dirname, '..', 'public', 'MMPI2_Diagnostico_Riesgo_Institucional.pdf');
const VERDE = '#004d3d';
const ORO = '#c8a94a';
const ROJO = '#c0392b';
const NARANJA = '#e67e22';
const VERDE_RIESGO = '#27ae60';
const MARGEN = 50;
const ANCHO = 495;
const FECHA = '6 de julio de 2026';

const SECCIONES = [
  {
    titulo: '1. Propósito',
    cuerpo: [
      'Este documento describe cómo el sistema REGPOL Callao calcula el bloque «Diagnóstico Automatizado — Riesgo Institucional» en los informes MMPI-2.',
      'La lógica está implementada en pdf_gen.js, función diagnosticoFinalMMPI().',
      'El diagnóstico combina cuatro componentes: Bloque I (validez), alertas clínicas, reglas compuestas y nivel final de riesgo.'
    ]
  },
  {
    titulo: '2. Flujo general',
    cuerpo: [
      '1. El efectivo completa las 566 respuestas del MMPI-2.',
      '2. El motor calcula puntajes brutos y T estándar por escala.',
      '3. Se ejecuta diagnosticoFinalMMPI(escalas) con los resultados.',
      '4. El informe (HTML o PDF) muestra el texto interpretativo y el nivel BAJO / MODERADO / ALTO.'
    ]
  },
  {
    titulo: '3. Bloque I — Actitud ante la prueba (caja amarilla)',
    cuerpo: [
      'Evalúa validez y defensividad. Si se superan umbrales críticos, BLOQUEA el Riesgo Bajo y fuerza nivel ALTO no interpretable.',
      '',
      'Umbrales de invalidez (prioridad L > F > K):',
      '• L bruto ≥ 8 o L T ≥ 80 → Alto Riesgo de Integridad / Protocolo Severamente Distorsionado — evaluación presencial obligatoria.',
      '• F T ≥ 90 → Grito de Auxilio / Exageración — evaluación presencial obligatoria.',
      '• K T ≥ 70 → Distorsión Positiva Consciente (Faking Good) — evaluación presencial obligatoria.',
      '',
      'Si no hay invalidez crítica y K T ≥ 60 → solo texto informativo de defensividad moderada (no cambia el nivel).'
    ]
  },
  {
    titulo: '4. Alertas clínicas (cajas rojas)',
    cuerpo: [
      'Solo tres escalas clínicas generan alertas de riesgo institucional, con umbral T ≥ 60:',
      '',
      '• Escala 4 — Desviación Psicopática (Pd): mala conducta, impulsividad, rechazo a la autoridad.',
      '• Escala 6 — Paranoia (Pa): suspicacia, resentimiento hacia superiores, problemas disciplinarios.',
      '• Escala 9 — Hipomanía (Ma): baja tolerancia a la frustración, búsqueda de sensaciones, riesgo de uso innecesario de la fuerza.',
      '',
      'Escalas como Hipocondría (1), Depresión (2), Histeria (3), etc. pueden mostrar alerta en la tabla de resultados, pero NO cuentan para el nivel de riesgo institucional.'
    ]
  },
  {
    titulo: '5. Reglas compuestas',
    cuerpo: [
      'Combinaciones que elevan automáticamente el riesgo a ALTO:',
      '',
      'Regla 1 — Alto riesgo disciplinario:',
      'Escala 4 T ≥ 60 Y Escala 6 T ≥ 60',
      '→ Rechazo a normas + resentimiento hacia superiores. Monitoreo preventivo inmediato.',
      '',
      'Regla 2 — Alto riesgo operativo:',
      'Escala 4 T ≥ 60 Y Escala 9 T ≥ 60',
      '→ Desviación psicopática + alta energía/impulsividad. Riesgo de uso desproporcionado de la fuerza.'
    ]
  },
  {
    titulo: '6. Nivel final de riesgo',
    cuerpo: [
      'El nivel se determina así:',
      '',
      '1) Primero: si hay invalidez de validez (L ≥ 8 / L≥80T / K≥70T / F≥90T) → nivel ALTO (bloqueo de Riesgo Bajo), categoría no interpretable.',
      '',
      '2) Si el perfil es válido, se usan alertas clínicas (escalas 4, 6, 9) y reglas compuestas:',
      '',
      'ALTO — si se cumple alguna de estas condiciones:',
      '• 3 o más alertas clínicas (4, 6 o 9 elevadas), O',
      '• Regla 1 (4 + 6), O',
      '• Regla 2 (4 + 9)',
      'Texto: «Riesgo Alto (Intervención Prioritaria). Requiere intervención, reevaluación presencial por el psicólogo mentor y seguimiento cercano.»',
      '',
      'MODERADO — si hay 1 o 2 alertas y no aplican reglas compuestas:',
      'Texto: «Riesgo Moderado (Alerta Preventiva). Se sugiere su inclusión en programas preventivos de control de impulsos o gestión emocional.»',
      '',
      'BAJO — si no hay alertas ni reglas compuestas ni invalidez de validez:',
      'Texto: «Riesgo Bajo. Continuar con su rol habitual.»'
    ]
  },
  {
    titulo: '7. Ejemplo ilustrativo',
    cuerpo: [
      'Caso: L bruto = 15, K T = 55, Escalas 4/6/9 < 60',
      '',
      'Resultado del sistema:',
      '• Invalidez de validez: SÍ (L ≥ 8) → BLOQUEO DE RIESGO BAJO.',
      '• Nivel final: ALTO (ámbar institucional).',
      '• Categoría: Alto Riesgo de Integridad / Protocolo Severamente Distorsionado — EVALUACIÓN CLÍNICA NO INTERPRETABLE / EVALUACIÓN PRESENCIAL OBLIGATORIA.',
      '• Resumen: fallas de integridad, moral fingida, encubrimiento de faltas, ocultamiento deliberado de problemas y problemas disciplinarios futuros.'
    ]
  },
  {
    titulo: '8. Tabla resumen',
    cuerpo: [
      'Componente          | Escalas        | Umbral           | Afecta nivel',
      'Invalidez validez     | L / F / K      | L≥8·L≥80·K≥70·F≥90 | Sí → ALTO (bloqueo BAJO)',
      'Defensividad inform.  | K             | T ≥ 60 (sin gate)| Solo texto',
      'Alerta clínica        | 4 (Pd)         | T ≥ 60           | Sí',
      'Alerta clínica        | 6 (Pa)         | T ≥ 60           | Sí',
      'Alerta clínica        | 9 (Ma)         | T ≥ 60           | Sí',
      'Regla compuesta       | 4 + 6          | ambas ≥60        | Sí → ALTO',
      'Regla compuesta       | 4 + 9          | ambas ≥60        | Sí → ALTO',
      'Otras escalas (1,2,3…) | Varias        | según tabla      | No (solo tabla)'
    ]
  },
  {
    titulo: '9. Referencia técnica',
    cuerpo: [
      'Archivo fuente: pdf_gen.js',
      'Funciones: diagnosticoFinalMMPI(), significadoEscalaMMPI(), calcularDiagnosticoFila()',
      'Especificación funcional: «Módulo de Informe Automatizado MMPI-2» (enfoque preventivo Sellbom).',
      '',
      'Región Policial del Callao — UNITIC — 2026'
    ]
  }
];

function necesitaPagina(doc, alto) {
  if (doc.y + alto > doc.page.height - MARGEN) {
    doc.addPage();
    return true;
  }
  return false;
}

function parrafo(doc, texto, opts) {
  const fs = (opts && opts.fontSize) || 9.5;
  const bold = opts && opts.bold;
  const color = (opts && opts.color) || '#222222';
  doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fs).fillColor(color);
  const h = doc.heightOfString(texto, { width: ANCHO, lineGap: 2 });
  necesitaPagina(doc, h + 6);
  doc.text(texto, MARGEN, doc.y, { width: ANCHO, lineGap: 2 });
  doc.moveDown(0.3);
}

function cajaNivel(doc, label, color, texto) {
  const pad = 8;
  doc.font('Helvetica-Bold').fontSize(9.5);
  const contenido = label + ' — ' + texto;
  const h = doc.heightOfString(contenido, { width: ANCHO - pad * 2 }) + pad * 2;
  necesitaPagina(doc, h + 6);
  const y0 = doc.y;
  doc.rect(MARGEN, y0, ANCHO, h).fill(color);
  doc.fillColor('#ffffff').text(contenido, MARGEN + pad, y0 + pad, { width: ANCHO - pad * 2 });
  doc.y = y0 + h + 6;
}

function generar() {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });

  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: MARGEN, bottom: MARGEN, left: MARGEN, right: MARGEN }
  });

  const stream = fs.createWriteStream(OUT);
  doc.pipe(stream);

  doc.rect(0, 0, doc.page.width, 108).fill(VERDE);
  doc.rect(0, 108, doc.page.width, 4).fill(ORO);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(20)
    .text('MMPI-2', MARGEN, 28, { width: ANCHO, align: 'center' });
  doc.fontSize(14).text('Diagnóstico Automatizado', MARGEN, 54, { width: ANCHO, align: 'center' });
  doc.fontSize(12).font('Helvetica').text('Riesgo Institucional — Guía metodológica', MARGEN, 76, { width: ANCHO, align: 'center' });
  doc.moveDown(4);
  doc.fillColor(VERDE).fontSize(10).text('Región Policial del Callao — UNITIC', { align: 'center', width: ANCHO });
  doc.fillColor('#666').fontSize(9).text(FECHA, { align: 'center', width: ANCHO });
  doc.moveDown(1.5);

  parrafo(doc, 'Resumen visual de niveles:', { bold: true, fontSize: 10 });
  cajaNivel(doc, 'BAJO', VERDE_RIESGO, '0 alertas en escalas 4, 6 o 9. Continuar rol habitual.');
  cajaNivel(doc, 'MODERADO', NARANJA, '1–2 alertas clínicas. Programas preventivos sugeridos.');
  cajaNivel(doc, 'ALTO', ROJO, '3+ alertas o reglas 4+6 / 4+9. Intervención prioritaria.');
  doc.moveDown(0.5);

  SECCIONES.forEach(function(sec, idx) {
    if (idx > 0) doc.moveDown(0.4);
    necesitaPagina(doc, 36);
    doc.fillColor(VERDE).font('Helvetica-Bold').fontSize(12).text(sec.titulo, MARGEN, doc.y, { width: ANCHO });
    doc.moveDown(0.35);
    doc.moveTo(MARGEN, doc.y).lineTo(MARGEN + ANCHO, doc.y).strokeColor(ORO).lineWidth(1).stroke();
    doc.moveDown(0.45);
    sec.cuerpo.forEach(function(linea) {
      if (linea === '') {
        doc.moveDown(0.2);
        return;
      }
      parrafo(doc, linea);
    });
  });

  doc.moveDown(0.6);
  necesitaPagina(doc, 24);
  doc.moveTo(MARGEN, doc.y).lineTo(MARGEN + ANCHO, doc.y).strokeColor('#ddd').lineWidth(0.5).stroke();
  doc.moveDown(0.35);
  doc.fillColor('#888').font('Helvetica').fontSize(7.5)
    .text('Generado desde REGPOL_CALLAO — scripts/gen-diagnostico-riesgo-pdf.js', MARGEN, doc.y, { width: ANCHO, align: 'center' });

  doc.end();

  return new Promise(function(resolve, reject) {
    stream.on('finish', function() {
      fs.copyFileSync(OUT, OUT_PUBLIC);
      resolve({ docs: OUT, public: OUT_PUBLIC });
    });
    stream.on('error', reject);
  });
}

generar()
  .then(function(paths) {
    console.log('PDF generado:');
    console.log(' ', paths.docs);
    console.log(' ', paths.public);
  })
  .catch(function(e) {
    console.error(e);
    process.exit(1);
  });
