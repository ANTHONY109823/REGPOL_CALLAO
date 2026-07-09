/**
 * Genera documentación técnica del proyecto REGPOL Callao en PDF.
 * Uso: node scripts/gen-documentacion-pdf.js
 */
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const OUT = path.join(__dirname, '..', 'docs', 'REGPOL_CALLAO_Documentacion_Tecnica.pdf');
const VERDE = '#004d3d';
const ORO = '#c8a94a';
const MARGEN = 50;
const ANCHO_TEXTO = 495;
const FECHA = '23 de junio de 2026';

const SECCIONES = [
  {
    titulo: '1. Resumen del proyecto',
    cuerpo: [
      'REGPOL Callao es el portal web y sistema de gestión institucional de la Región Policial del Callao (UNITIC).',
      'Incluye: portal público informativo, evaluaciones psicológicas MMPI-2, gestión de convenios y cursos, sorteos, CMS del portal y paneles administrativos por rol.',
      'Repositorio: https://github.com/ANTHONY109823/REGPOL_CALLAO',
      'Autor técnico: Ing. Anthony Ccayo — UNITIC — 2026'
    ]
  },
  {
    titulo: '2. Arquitectura',
    cuerpo: [
      'Modelo híbrido desacoplado:',
      '• Frontend estático: carpeta public/ desplegada en GitHub Pages.',
      '• Backend API: Node.js + Express en Railway.',
      '• Base de datos: PostgreSQL gestionada en Railway (variable DATABASE_URL).',
      '',
      'URLs de producción:',
      '• Portal web: GitHub Pages del repositorio (rama main).',
      '• API backend: https://regpolcallao-production.up.railway.app',
      '',
      'El archivo public/api-config.js detecta si el sitio corre en localhost o producción y apunta al backend correspondiente.',
      'Health check del servidor: GET /health (usado por Railway).'
    ]
  },
  {
    titulo: '3. Stack tecnológico',
    cuerpo: [
      'Backend: Node.js >= 18, Express 4.x, pg (PostgreSQL), cors, pdfkit.',
      'Frontend: HTML5, CSS3, JavaScript vanilla (sin framework SPA).',
      'Iconos: Font Awesome 6 (CDN).',
      'PDF evaluaciones: pdf_gen.js (PDFKit) + mmpi2_score.py (cálculo MMPI-2 opcional).',
      'CI/CD: GitHub Actions (.github/workflows/deploy-pages.yml) publica public/ en Pages al hacer push a main.',
      'Backend deploy: Railway (railway.json, comando node server.js).'
    ]
  },
  {
    titulo: '4. Base de datos — PostgreSQL',
    cuerpo: [
      'Motor: PostgreSQL. Conexión vía DATABASE_URL con SSL en producción.',
      'Inicialización automática en initDB() al arrancar server.js (CREATE TABLE IF NOT EXISTS + ALTER COLUMN IF NOT EXISTS).',
      'No hay archivos de migración separados; el esquema evoluciona inline en server.js.',
      '',
      'Tablas principales:',
      '• admins — Usuarios del panel (usuario, passhash SHA-256, rol, nombre, unidad, permisos JSONB).',
      '• preguntas — 566 ítems del cuestionario MMPI-2 (numero, texto, activa, orden).',
      '• evaluaciones — Evaluaciones enviadas o parciales (CIP, datos personales, respuestas JSONB, completada).',
      '• progresos — Borradores guardados sin enviar (clave=CIP, respuestas JSONB, bloque_max, total_resp).',
      '• divisiones — DIVOPUS 1, DIVOPUS 2, DIVOPUS 3, DIVUES.',
      '• unidades_pol — Comisarías y unidades vinculadas a divisiones.',
      '• configuracion — Clave-valor (p. ej. unidades_activas para habilitar evaluaciones).',
      '• items_portal — Convocatorias de convenios y cursos.',
      '• inscripciones — Inscripciones de personal a convocatorias.',
      '• sorteos_portal / resultados_sorteo — Sorteos y ganadores publicados.',
      '• portal_configuracion — CMS del portal (data_json con novedades, carrusel, reseña, etc.).',
      '',
      'Índices: idx_eval_comisaria, idx_eval_unidad en evaluaciones.',
      'Relaciones: inscripciones → items_portal; unidades_pol → divisiones; resultados_sorteo → sorteos_portal.'
    ]
  },
  {
    titulo: '5. Roles y autenticación',
    cuerpo: [
      'Login: POST /admin/login → token SHA-256 almacenado en localStorage (regpol_session).',
      'Cabecera de API autenticada: x-admin-token.',
      'Cache de sesión en servidor: 5 minutos (authCache).',
      '',
      'Roles:',
      '• unitic — Super Admin: acceso total, dashboard general del sistema, usuarios, divisiones.',
      '• bienestar — Acceso amplio a evaluaciones (redirige a panel-admin.html).',
      '• usuario — Admin de área según permisos JSONB.',
      '',
      'Permisos granulares: evaluaciones, descargas, cms_cursos, cms_convenios, cms_descansos, cms_inicio, cms_resena, cms_labor, cms_novedades.',
      'Rutas de panel: panel-admin.html (gestión) o panel-usuario.html (solo lectura/CMS limitado según permisos).'
    ]
  },
  {
    titulo: '6. Módulos funcionales',
    cuerpo: [
      'Portal público (index.html, portal.js): inicio, novedades, reseña histórica, nuestra labor, unidades, convenios, cursos, descansos médicos, carrusel de encabezado.',
      'Evaluación MMPI-2 (evaluacion.html, evaluacion.js): registro por CIP, guardado de progreso, envío final a evaluaciones.',
      'Descansos médicos (descansos.html): módulo independiente — registro web con PDF + código de barras, consulta pública CIP+código.',
      'Panel admin (panel-admin.html): dashboard por rol, evaluaciones, preguntas, descargas PDF/CSV, CMS, convocatorias, inscripciones, sorteos, descansos médicos, usuarios.',
      'Panel usuario (panel-usuario.html): vista modular según permisos del operador.',
      'Sorteo en vivo (sorteo-live.html): visualización pública de resultados.'
    ]
  },
  {
    titulo: '6b. Descansos médicos (detalle)',
    cuerpo: [
      'Permiso: cms_descansos. Super Admin (unitic) + oficina con ese permiso. Independiente de Psicología, Educación y Convenios.',
      'Registro web: CIP, grado, apellidos, nombres, unidad, fechas, días, CIE, diagnóstico, tipo documento, código de barras, médico, centro, PDF obligatorio.',
      'Consulta pública: CIP + N.º código de barras → solo confirma ingreso + nombres + CIP. Históricos con código ---- no consultables.',
      'Panel: listado con filtros división/unidad/grado, ver/anular, fecha de registro, dashboard imprimible por unidad, export CSV/PDF.',
      'Import Excel históricos (sin código de barras → ----) para dashboard del año. Cotejo Excel hospital por CIP (DNI respaldo).',
      'Tablas: descansos_medicos, descansos_cotejos. API: /portal/descansos/*, /admin/descansos/*.'
    ]
  },
  {
    titulo: '7. API REST — Endpoints principales',
    cuerpo: [
      'Públicos (sin token):',
      'GET /health, /config, /preguntas, /progreso, /portal/configuracion, /portal/items, /portal/sorteos, /portal/descansos/catalogos, /unidades-publico',
      'POST /guardar, /progreso, /portal/items/:id/inscribir, /portal/descansos/registrar, /portal/descansos/consultar, /admin/login',
      '',
      'Autenticados (x-admin-token):',
      'Evaluaciones: GET /evaluaciones, /stats, /listar, /descargar, /admin/avances, /admin/registro-cip',
      'DELETE /admin/evaluaciones/:id, /admin/progresos?cip=, /admin/evaluaciones-lote',
      'PDF: GET /pdf/efectivo, /pdf/grupo, /admin/preview-resultado, /admin/preview-avance',
      'Admin sistema: GET /admin/stats-sistema (solo unitic), /admin/stats-gestion',
      'Preguntas: CRUD /admin/preguntas',
      'Usuarios/estructura: CRUD /admin/usuarios, /admin/divisiones, /admin/unidades',
      'Portal gestión: /admin/configuracion, /admin/items, /admin/inscripciones, /admin/sorteos',
      'PUT /config — activar dependencias para evaluaciones'
    ]
  },
  {
    titulo: '8. Flujo de evaluaciones MMPI-2',
    cuerpo: [
      '1. El efectivo ingresa CIP en evaluacion.html; el sistema valida dependencia activa (config unidades_activas).',
      '2. Durante el test, POST /progreso guarda borrador en tabla progresos.',
      '3. Al finalizar, POST /guardar inserta/actualiza evaluaciones y elimina el progreso si completada=true.',
      '4. Un CIP tiene un único registro en evaluaciones (upsert por CIP).',
      '5. Administradores listan, filtran por división/unidad, ven resultados MMPI-2 y generan PDF.',
      '6. Eliminación: individual (por fila), por unidad (lote) o limpieza total (solo Super Admin, confirmación ELIMINAR).'
    ]
  },
  {
    titulo: '9. Estructura de archivos',
    cuerpo: [
      'server.js — Servidor Express, initDB, todos los endpoints.',
      'pdf_gen.js — Generación de PDF individual y por grupo.',
      'preguntas_data.json — Seed de 566 preguntas MMPI-2.',
      'mmpi2_score.py — Script Python para puntuación MMPI-2.',
      'public/ — Frontend estático completo.',
      'public/api-config.js — URL del backend.',
      'public/panel-admin.html — Panel principal de administración.',
      'public/panel-cms.js — Lógica CMS compartida.',
      'public/portal.js — Portal público y carrusel.',
      'scripts/ — Utilidades de mantenimiento y generación.',
      'railway.json — Configuración de despliegue Railway.',
      '.github/workflows/deploy-pages.yml — CI para GitHub Pages.'
    ]
  },
  {
    titulo: '10. Variables de entorno',
    cuerpo: [
      'PORT — Puerto del servidor (default 3000).',
      'DATABASE_URL — Cadena de conexión PostgreSQL (obligatoria en producción).',
      '',
      'Desarrollo local: npm start o INICIAR_SERVIDOR.bat; frontend en GitHub Pages local o servidor estático; api-config apunta a localhost:3000.'
    ]
  },
  {
    titulo: '11. Optimizaciones recientes',
    cuerpo: [
      'Dashboard Super Admin: resumen general (/admin/stats-sistema) en lugar de solo evaluaciones.',
      'Cache de estadísticas (/stats) 45 s; cache de configuración 120 s.',
      'Eliminación de código legacy: panel-admin.js, panel-bienestar.html, respuestas_webapp.gs.',
      'Endpoints DELETE para limpieza de evaluaciones y avances en base de datos.',
      'Migraciones inline de columnas faltantes en progresos (unidad, cargo, sexo, armamento, foto, grado).',
      'Timeouts y botón Reintentar en dashboards para reducir carga de CPU en navegador.'
    ]
  },
  {
    titulo: '12. Seguridad y consideraciones',
    cuerpo: [
      'Contraseñas de admin almacenadas como SHA-256 (no bcrypt).',
      'Tokens de sesión generados con crypto; validación por cabecera x-admin-token.',
      'Filtro por unidad asignada para operadores sin permiso global de evaluaciones.',
      'CORS habilitado para consumo desde GitHub Pages.',
      'Datos sensibles (fotos, respuestas) en JSONB/TEXT en PostgreSQL; no exponer DATABASE_URL.',
      'Recomendación: rotar contraseñas seed por defecto en producción.'
    ]
  }
];

function necesitaPagina(doc, altoNecesario) {
  const limite = doc.page.height - MARGEN;
  if (doc.y + altoNecesario > limite) {
    doc.addPage();
    return true;
  }
  return false;
}

function escribirParrafo(doc, texto, opts) {
  const fontSize = (opts && opts.fontSize) || 10;
  const bold = opts && opts.bold;
  doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize).fillColor('#222222');
  const h = doc.heightOfString(texto, { width: ANCHO_TEXTO, align: 'left' });
  necesitaPagina(doc, h + 6);
  doc.text(texto, MARGEN, doc.y, { width: ANCHO_TEXTO, align: 'left', lineGap: 2 });
  doc.moveDown(0.35);
}

function generar() {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });

  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: MARGEN, bottom: MARGEN, left: MARGEN, right: MARGEN },
    autoFirstPage: true,
    bufferPages: false
  });

  const stream = fs.createWriteStream(OUT);
  doc.pipe(stream);

  // Portada compacta (sin página extra)
  doc.rect(0, 0, doc.page.width, 100).fill(VERDE);
  doc.rect(0, 100, doc.page.width, 4).fill(ORO);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(22)
    .text('REGPOL CALLAO', MARGEN, 32, { width: ANCHO_TEXTO, align: 'center' });
  doc.fontSize(13).font('Helvetica')
    .text('Documentación Técnica del Sistema', MARGEN, 62, { width: ANCHO_TEXTO, align: 'center' });
  doc.moveDown(3);
  doc.fillColor(VERDE).font('Helvetica').fontSize(11)
    .text('Región Policial del Callao — UNITIC', { align: 'center', width: ANCHO_TEXTO });
  doc.fillColor('#666666').fontSize(10)
    .text('Versión 1.0 — ' + FECHA, { align: 'center', width: ANCHO_TEXTO });
  doc.moveDown(2);

  SECCIONES.forEach(function(sec, idx) {
    if (idx > 0) doc.moveDown(0.5);
    necesitaPagina(doc, 40);
    doc.fillColor(VERDE).font('Helvetica-Bold').fontSize(13).text(sec.titulo, MARGEN, doc.y, { width: ANCHO_TEXTO });
    doc.moveDown(0.4);
    doc.moveTo(MARGEN, doc.y).lineTo(MARGEN + ANCHO_TEXTO, doc.y).strokeColor(ORO).lineWidth(1).stroke();
    doc.moveDown(0.5);
    sec.cuerpo.forEach(function(linea) {
      if (linea === '') {
        doc.moveDown(0.25);
        return;
      }
      escribirParrafo(doc, linea, { fontSize: 9.5 });
    });
  });

  // Pie final en la misma página si cabe
  doc.moveDown(0.8);
  necesitaPagina(doc, 30);
  doc.moveTo(MARGEN, doc.y).lineTo(MARGEN + ANCHO_TEXTO, doc.y).strokeColor('#dddddd').lineWidth(0.5).stroke();
  doc.moveDown(0.4);
  doc.fillColor('#888888').font('Helvetica').fontSize(8)
    .text('Documento generado automáticamente desde el repositorio REGPOL_CALLAO — ' + FECHA, MARGEN, doc.y, { width: ANCHO_TEXTO, align: 'center' });

  doc.end();

  return new Promise(function(resolve, reject) {
    stream.on('finish', function() { resolve(OUT); });
    stream.on('error', reject);
  });
}

generar()
  .then(function(p) { console.log('PDF generado:', p); })
  .catch(function(e) { console.error(e); process.exit(1); });
