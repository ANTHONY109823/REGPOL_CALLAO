/**
 * Genera el PDF modelo de inscripción (convenios / cursos) — REGPOL Callao
 * Uso: node scripts/gen-plantilla-inscripcion.js
 */
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const OUT = path.join(__dirname, '..', 'public', 'plantillas', 'modelo-inscripcion-regpol.pdf');

const CAMPOS = [
  ['GRADO / RANGO', ''],
  ['APELLIDOS Y NOMBRES', ''],
  ['CIP', ''],
  ['DNI', ''],
  ['UNIDAD / DEPENDENCIA', ''],
  ['ÁREA / SECCIÓN', ''],
  ['CARGO (ADMINISTRATIVO / INVESTIGACIÓN / PATRULLAJE)', ''],
  ['ARMA — CONDICIÓN (DEL ESTADO / PARTICULAR)', ''],
  ['SITUACIÓN (VACACIONES / DÍA DE FRANCO)', ''],
  ['DÍA DE FRANCO (PAR / IMPAR)', ''],
  ['TELÉFONO / CELULAR', ''],
  ['CORREO ELECTRÓNICO', ''],
  ['FECHA DE EGRESO DE ESCUELA (solo cursos)', ''],
  ['CONVOCATORIA / CURSO AL QUE POSTULA', ''],
];

function lineaCampo(doc, label, y) {
  doc.fontSize(9).fillColor('#333').font('Helvetica-Bold').text(label, 50, y, { width: 500 });
  doc.moveTo(50, y + 14).lineTo(545, y + 14).strokeColor('#004d3d').lineWidth(0.8).stroke();
  return y + 28;
}

function generar() {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const stream = fs.createWriteStream(OUT);
  doc.pipe(stream);

  doc.rect(0, 0, 595, 70).fill('#004d3d');
  doc.fillColor('#fff').fontSize(14).font('Helvetica-Bold')
    .text('REGIÓN POLICIAL CALLAO — UNITIC', 50, 22, { align: 'center', width: 495 });
  doc.fontSize(10).font('Helvetica')
    .text('FORMULARIO MODELO DE INSCRIPCIÓN — CONVENIO / CURSO', 50, 42, { align: 'center', width: 495 });

  let y = 88;
  doc.fillColor('#004d3d').fontSize(11).font('Helvetica-Bold')
    .text('I. DATOS DEL EFECTIVO POLICIAL', 50, y);
  y += 22;

  CAMPOS.forEach(function (par) {
    if (y > 700) {
      doc.addPage();
      y = 50;
    }
    y = lineaCampo(doc, par[0], y);
  });

  y += 10;
  if (y > 620) { doc.addPage(); y = 50; }
  doc.fillColor('#004d3d').fontSize(11).font('Helvetica-Bold')
    .text('II. DECLARACIÓN JURADA', 50, y);
  y += 18;
  doc.fontSize(9).fillColor('#333').font('Helvetica')
    .text(
      'Declaro bajo responsabilidad que la información consignada es verídica y que adjunto ' +
      'mi expediente de requisitos completo, firmado y sin enmendaduras, en un único archivo PDF. ' +
      'Acepto las condiciones de la convocatoria y las decisiones del área correspondiente.',
      50, y, { width: 495, align: 'justify' }
    );
  y += 52;

  doc.text('Lugar y fecha: _________________________________', 50, y);
  y += 36;
  doc.text('Firma del efectivo: _________________________________', 50, y);
  y += 28;
  doc.text('Huella dactilar (índice derecho): ___________________', 50, y);

  doc.end();
  return new Promise(function (resolve, reject) {
    stream.on('finish', function () {
      console.log('Plantilla generada:', OUT);
      resolve();
    });
    stream.on('error', reject);
  });
}

generar().catch(function (e) {
  console.error(e);
  process.exit(1);
});
