/*
  REGPOL Callao — Backend Node.js + PostgreSQL (Railway)
  Ing. Anthony Ccayo — UNITIC — 2026
*/

const express  = require('express');
const cors     = require('cors');
const compression = require('compression');
const path     = require('path');
const fs       = require('fs');
const os       = require('os');
const crypto   = require('crypto');
const { Pool } = require('pg');
const { Worker } = require('worker_threads');
const { calcularMMPI2, normalizarResultadoMMPI, interpretarT, contarRespuestas, formatearArmamentoLegible, maxItemRespondido, significadoEscalaMMPI, diagnosticoFinalMMPI, calcularDiagnosticoFila } = require('./pdf_gen');

const app  = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
  max: 12,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

// ── Pool de workers para generación de PDF (PDFKit es síncrono/CPU-bound) ──────
// Evita que un PDF grande bloquee el event loop principal para el resto de usuarios.
const PDF_POOL_SIZE = Math.max(1, Math.min(3, os.cpus().length - 1));
const pdfPool = [];
const pdfQueue = [];
let pdfJobSeq = 1;

function crearPdfWorker() {
  const w = new Worker(path.join(__dirname, 'pdf_worker.js'));
  w.busy = false;
  w.pending = new Map();
  w.on('message', function(msg) {
    const job = w.pending.get(msg.id);
    w.pending.delete(msg.id);
    w.busy = false;
    if (job) {
      if (msg.ok) job.resolve(Buffer.from(msg.buffer));
      else job.reject(new Error(msg.error || 'Error generando PDF'));
    }
    despacharPdfQueue();
  });
  w.on('error', function(err) {
    w.pending.forEach(function(job) { job.reject(err); });
    w.pending.clear();
    w.busy = false;
    despacharPdfQueue();
  });
  w.on('exit', function() {
    const idx = pdfPool.indexOf(w);
    if (idx !== -1) pdfPool.splice(idx, 1);
    pdfPool.push(crearPdfWorker());
  });
  return w;
}

for (let i = 0; i < PDF_POOL_SIZE; i++) pdfPool.push(crearPdfWorker());

function despacharPdfQueue() {
  if (!pdfQueue.length) return;
  const libre = pdfPool.find(function(w) { return !w.busy; });
  if (!libre) return;
  const job = pdfQueue.shift();
  libre.busy = true;
  libre.pending.set(job.id, job);
  libre.postMessage({ id: job.id, fn: job.fn, args: job.args });
}

// Genera un PDF en un worker aparte para no bloquear el hilo principal.
// fn: nombre exportado por pdf_gen.js ('generarPDFIndividual', 'generarPDFComisaria', 'generarPDFConstanciaVacante')
function generarPDFAsync(fn, args) {
  return new Promise(function(resolve, reject) {
    const id = pdfJobSeq++;
    pdfQueue.push({ id: id, fn: fn, args: args, resolve: resolve, reject: reject });
    despacharPdfQueue();
  });
}

const authCache = new Map();
const AUTH_CACHE_TTL = 5 * 60 * 1000;

// ── Sesiones de panel: token aleatorio → admin (la contraseña ya no viaja ni ────
// se guarda en el navegador; el token es opaco y expira con inactividad)
const sesiones = new Map();
const SESION_TTL = 12 * 60 * 60 * 1000;

// ── Límite de intentos de login por IP (freno a fuerza bruta) ──────────────────
const loginIntentos = new Map();
const LOGIN_MAX_FALLOS = 10;
const LOGIN_VENTANA_MS = 10 * 60 * 1000;

function loginBloqueado(ip) {
  const reg = loginIntentos.get(ip);
  if (!reg) return false;
  if (Date.now() - reg.desde > LOGIN_VENTANA_MS) { loginIntentos.delete(ip); return false; }
  return reg.fallos >= LOGIN_MAX_FALLOS;
}

function registrarFalloLogin(ip) {
  const reg = loginIntentos.get(ip);
  if (!reg || Date.now() - reg.desde > LOGIN_VENTANA_MS) {
    loginIntentos.set(ip, { fallos: 1, desde: Date.now() });
  } else {
    reg.fallos += 1;
  }
}

async function persistirSesionDb(token, adminId, expMs) {
  await pool.query(
    `INSERT INTO admin_sesiones (token, admin_id, expira)
     VALUES ($1, $2, to_timestamp($3 / 1000.0))
     ON CONFLICT (token) DO UPDATE SET admin_id = EXCLUDED.admin_id, expira = EXCLUDED.expira`,
    [token, adminId, expMs]
  );
}

async function cargarSesionDesdeDb(token) {
  const r = await pool.query(
    `SELECT a.id, a.usuario, a.passhash, a.rol, a.nombre, a.unidad, a.permisos,
            EXTRACT(EPOCH FROM s.expira) * 1000 AS exp_ms
     FROM admin_sesiones s
     INNER JOIN admins a ON a.id = s.admin_id
     WHERE s.token = $1 AND s.expira > NOW()`,
    [token]
  );
  if (!r.rows.length) return null;
  const row = r.rows[0];
  return {
    admin: {
      id: row.id,
      usuario: row.usuario,
      passhash: row.passhash,
      rol: row.rol,
      nombre: row.nombre,
      unidad: row.unidad,
      permisos: row.permisos
    },
    exp: parseFloat(row.exp_ms)
  };
}

async function limpiarSesionesDbExpiradas() {
  await pool.query('DELETE FROM admin_sesiones WHERE expira <= NOW()');
}

setInterval(function() {
  const ahora = Date.now();
  sesiones.forEach(function(s, t) { if (s.exp <= ahora) sesiones.delete(t); });
  loginIntentos.forEach(function(r, ip) { if (ahora - r.desde > LOGIN_VENTANA_MS) loginIntentos.delete(ip); });
  authCache.forEach(function(c, t) { if (c.exp <= ahora) authCache.delete(t); });
  limpiarSesionesDbExpiradas().catch(function() {});
}, 60 * 60 * 1000).unref();

// ── Helpers ────────────────────────────────────────────────────────────────────
const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');

// Timestamps en BD (TIMESTAMP sin tz, servidor UTC). fecha_iso permite hora local en el navegador.
function sqlFechaTxt(col) { return `TO_CHAR(${col},'DD/MM/YYYY HH24:MI')`; }
function sqlFechaIso(col) { return `(${col} AT TIME ZONE 'UTC')`; }

function calcularEdadDesdeISO(fecha_nac) {
  if (!fecha_nac) return 0;
  let y, mo, d;
  if (fecha_nac instanceof Date) {
    if (isNaN(fecha_nac.getTime())) return 0;
    y = fecha_nac.getFullYear();
    mo = fecha_nac.getMonth();
    d = fecha_nac.getDate();
  } else {
    const s = String(fecha_nac);
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) {
      y = parseInt(iso[1], 10);
      mo = parseInt(iso[2], 10) - 1;
      d = parseInt(iso[3], 10);
    } else {
      const nac = new Date(s);
      if (isNaN(nac.getTime())) return 0;
      y = nac.getFullYear();
      mo = nac.getMonth();
      d = nac.getDate();
    }
  }
  const hoy = new Date();
  let edad = hoy.getFullYear() - y;
  if (hoy.getMonth() - mo < 0 || (hoy.getMonth() === mo && hoy.getDate() < d)) edad--;
  return edad > 0 ? edad : 0;
}

function resolverEdadFila(row) {
  if (!row) return null;
  const e = parseInt(row.edad, 10);
  if (e > 0) return e;
  const calc = calcularEdadDesdeISO(row.fecha_nac);
  return calc > 0 ? calc : null;
}

function enriquecerFilaEdad(row) {
  if (!row) return row;
  const edad = resolverEdadFila(row);
  return edad ? Object.assign({}, row, { edad: edad }) : row;
}

function deduplicarFilasPorCip(rows) {
  const seen = new Set();
  const out = [];
  (rows || []).forEach(function(row) {
    const cip = (row.cip || '').toUpperCase().trim();
    if (cip) {
      if (seen.has(cip)) return;
      seen.add(cip);
    }
    out.push(row);
  });
  return out;
}

function normalizarNombreComparar(nombres) {
  return String(nombres || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function sqlNombreNormalizado(campo) {
  return `regexp_replace(upper(trim(translate(${campo}, 'áéíóúàèìòùäëïöüñÁÉÍÓÚÀÈÌÒÙÄËÏÖÜÑ', 'aeiouaeiouaeiouaeiouaeiounAEIOUAEIOUAEIOUAEIOUN'))), '\\s+', ' ', 'g')`;
}

async function buscarRegistroDuplicadoPorNombre(nombres, cipActual) {
  const nombreNorm = normalizarNombreComparar(nombres);
  if (nombreNorm.length < 3) return null;
  const cipTrim = String(cipActual || '').trim();
  const sqlNom = sqlNombreNormalizado('nombres');
  const sqlCipDistinto = `UPPER(TRIM(cip)) <> UPPER(TRIM($2))`;

  const progR = await pool.query(
    `SELECT cip, nombres, 'progreso' AS fuente FROM progresos
     WHERE ${sqlNom} = $1 AND ${sqlCipDistinto}
     ORDER BY actualizado DESC LIMIT 1`,
    [nombreNorm, cipTrim]
  );
  if (progR.rows.length) return progR.rows[0];

  const evR = await pool.query(
    `SELECT cip, nombres, 'evaluacion' AS fuente FROM evaluaciones
     WHERE ${sqlNom} = $1 AND ${sqlCipDistinto}
     ORDER BY fecha DESC LIMIT 1`,
    [nombreNorm, cipTrim]
  );
  if (evR.rows.length) return evR.rows[0];

  return null;
}

async function buscarRegistroDuplicadoPorDni(dni, cipActual) {
  const dniT = String(dni || '').trim();
  if (dniT.length < 8) return null;
  const cipTrim = String(cipActual || '').trim();
  const sqlCipDistinto = `UPPER(TRIM(cip)) <> UPPER(TRIM($2))`;

  const progR = await pool.query(
    `SELECT cip, nombres, 'progreso' AS fuente FROM progresos
     WHERE TRIM(dni)=TRIM($1) AND ${sqlCipDistinto}
     ORDER BY actualizado DESC LIMIT 1`,
    [dniT, cipTrim]
  );
  if (progR.rows.length) return progR.rows[0];

  const evR = await pool.query(
    `SELECT cip, nombres, 'evaluacion' AS fuente FROM evaluaciones
     WHERE TRIM(dni)=TRIM($1) AND ${sqlCipDistinto}
     ORDER BY fecha DESC LIMIT 1`,
    [dniT, cipTrim]
  );
  if (evR.rows.length) return evR.rows[0];

  return null;
}

/** Elimina evaluaciones y progresos por CIP y/o DNI (evita huérfanos tras borrar en admin). */
async function purgarRegistrosPersona(cip, dni) {
  const cipT = String(cip || '').trim();
  const dniT = String(dni || '').trim();
  if (!cipT && !dniT) return;
  const conds = [];
  const params = [];
  let pi = 1;
  if (cipT) {
    conds.push(`(UPPER(TRIM(cip))=UPPER(TRIM($${pi})) OR LOWER(TRIM(clave))=LOWER(TRIM($${pi})))`);
    params.push(cipT);
    pi++;
  }
  if (dniT) {
    conds.push(`TRIM(dni)=TRIM($${pi})`);
    params.push(dniT);
    pi++;
  }
  const where = conds.join(' OR ');
  await pool.query(`DELETE FROM progresos WHERE ${where}`, params);
  await pool.query(`DELETE FROM evaluaciones WHERE ${where}`, params);
}

function normalizarFilasPDFGrupo(rows) {
  return deduplicarFilasPorCip(rows).map(function(row) {
    let base;
    if (row.id) {
      base = Object.assign({}, row);
    } else if (row.clave != null || row.actualizado != null) {
      base = mapearProgresoParaPDF(row);
    } else {
      base = Object.assign({}, row);
    }
    base.edad = resolverEdadFila(base);
    return base;
  });
}

// ── Inicializar tablas + seed ──────────────────────────────────────────────────
async function migrarColumnasPortal() {
  await pool.query(`
    ALTER TABLE items_portal ADD COLUMN IF NOT EXISTS uniforme VARCHAR(300) DEFAULT '';
    ALTER TABLE items_portal ADD COLUMN IF NOT EXISTS contactos_responsables TEXT DEFAULT '';
  `);
}

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admins (
      id       SERIAL PRIMARY KEY,
      usuario  VARCHAR(60) UNIQUE NOT NULL,
      passhash VARCHAR(64) NOT NULL,
      rol      VARCHAR(20) NOT NULL DEFAULT 'usuario',
      nombre   VARCHAR(120),
      unidad   VARCHAR(150),
      permisos JSONB DEFAULT '[]'
    );
    ALTER TABLE admins ADD COLUMN IF NOT EXISTS permisos JSONB DEFAULT '[]';

    CREATE TABLE IF NOT EXISTS preguntas (
      id      SERIAL PRIMARY KEY,
      numero  INTEGER UNIQUE NOT NULL,
      texto   TEXT NOT NULL,
      activa  BOOLEAN DEFAULT TRUE,
      orden   INTEGER
    );

    CREATE TABLE IF NOT EXISTS evaluaciones (
      id         SERIAL PRIMARY KEY,
      fecha      TIMESTAMP DEFAULT NOW(),
      comisaria  VARCHAR(120),
      unidad     VARCHAR(150),
      nombres    VARCHAR(200),
      cip        VARCHAR(20),
      dni        VARCHAR(20),
      fecha_nac  DATE,
      edad       SMALLINT,
      respuestas JSONB,
      completada BOOLEAN DEFAULT FALSE,
      bloque_max SMALLINT DEFAULT 0
    );
    ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS bloque_max SMALLINT DEFAULT 0;
    ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS cargo VARCHAR(80);
    ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS foto TEXT;
    ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS sexo VARCHAR(20);
    ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS armamento TEXT;
    ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS grado VARCHAR(80);
    ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS area VARCHAR(120);
    ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS tiempo_segundos INTEGER DEFAULT 0;
    CREATE INDEX IF NOT EXISTS idx_eval_comisaria ON evaluaciones(comisaria);
    CREATE INDEX IF NOT EXISTS idx_eval_unidad    ON evaluaciones(unidad);

    CREATE TABLE IF NOT EXISTS progresos (
      id          SERIAL PRIMARY KEY,
      clave       VARCHAR(150) UNIQUE,
      cip         VARCHAR(20),
      nombres     VARCHAR(200),
      comisaria   VARCHAR(120),
      unidad      VARCHAR(150),
      bloque_max  SMALLINT DEFAULT 0,
      total_resp  SMALLINT DEFAULT 0,
      respuestas  JSONB,
      actualizado TIMESTAMP DEFAULT NOW()
    );
    ALTER TABLE progresos ADD COLUMN IF NOT EXISTS unidad VARCHAR(150);
    ALTER TABLE progresos ADD COLUMN IF NOT EXISTS bloque_max SMALLINT DEFAULT 0;
    ALTER TABLE progresos ADD COLUMN IF NOT EXISTS total_resp SMALLINT DEFAULT 0;
    ALTER TABLE progresos ADD COLUMN IF NOT EXISTS respuestas JSONB;
    ALTER TABLE progresos ADD COLUMN IF NOT EXISTS actualizado TIMESTAMP DEFAULT NOW();
    ALTER TABLE progresos ADD COLUMN IF NOT EXISTS cargo VARCHAR(80);
    ALTER TABLE progresos ADD COLUMN IF NOT EXISTS sexo VARCHAR(20);
    ALTER TABLE progresos ADD COLUMN IF NOT EXISTS armamento TEXT;
    ALTER TABLE progresos ADD COLUMN IF NOT EXISTS foto TEXT;
    ALTER TABLE progresos ADD COLUMN IF NOT EXISTS grado VARCHAR(80);
    ALTER TABLE progresos ADD COLUMN IF NOT EXISTS dni VARCHAR(20);
    ALTER TABLE progresos ADD COLUMN IF NOT EXISTS fecha_nac DATE;
    ALTER TABLE progresos ADD COLUMN IF NOT EXISTS edad SMALLINT;
    ALTER TABLE progresos ADD COLUMN IF NOT EXISTS area VARCHAR(120);
    ALTER TABLE progresos ADD COLUMN IF NOT EXISTS tiempo_segundos INTEGER DEFAULT 0;

    CREATE TABLE IF NOT EXISTS divisiones (
      id     SERIAL PRIMARY KEY,
      nombre VARCHAR(120) UNIQUE NOT NULL,
      orden  SMALLINT DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS unidades_pol (
      id          SERIAL PRIMARY KEY,
      nombre      VARCHAR(150) UNIQUE NOT NULL,
      division_id INTEGER REFERENCES divisiones(id) ON DELETE SET NULL,
      tipo        VARCHAR(30) DEFAULT 'comisaria',
      orden       SMALLINT DEFAULT 0
    );
    ALTER TABLE unidades_pol ADD COLUMN IF NOT EXISTS direccion TEXT;
    ALTER TABLE unidades_pol ADD COLUMN IF NOT EXISTS telefono VARCHAR(60);

    CREATE TABLE IF NOT EXISTS configuracion (
      clave       VARCHAR(60) PRIMARY KEY,
      valor       TEXT,
      actualizado TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS items_portal (
      id              SERIAL PRIMARY KEY,
      tipo            VARCHAR(20) NOT NULL,
      titulo          VARCHAR(200) NOT NULL,
      descripcion     TEXT DEFAULT '',
      estado          VARCHAR(30) DEFAULT 'DISPONIBLE',
      icono           VARCHAR(60) DEFAULT 'fa-file',
      color           VARCHAR(20) DEFAULT '#004d3d',
      requisitos      JSONB DEFAULT '[]',
      horario         VARCHAR(200) DEFAULT '',
      vacantes        INTEGER DEFAULT 0,
      fecha_inicio    VARCHAR(100) DEFAULT '',
      duracion        VARCHAR(100) DEFAULT '',
      lugar           VARCHAR(200) DEFAULT '',
      observaciones   TEXT DEFAULT '',
      formulario_url  VARCHAR(500) DEFAULT '',
      inscripciones_abiertas BOOLEAN DEFAULT FALSE,
      visible         BOOLEAN DEFAULT TRUE,
      orden           INTEGER DEFAULT 0,
      creado          TIMESTAMP DEFAULT NOW(),
      actualizado     TIMESTAMP DEFAULT NOW()
    );
    ALTER TABLE items_portal ADD COLUMN IF NOT EXISTS formulario_url VARCHAR(500) DEFAULT '';
    ALTER TABLE items_portal ADD COLUMN IF NOT EXISTS inscripciones_abiertas BOOLEAN DEFAULT FALSE;
    ALTER TABLE items_portal ADD COLUMN IF NOT EXISTS uniforme VARCHAR(300) DEFAULT '';
    ALTER TABLE items_portal ADD COLUMN IF NOT EXISTS contactos_responsables TEXT DEFAULT '';

    CREATE TABLE IF NOT EXISTS inscripciones (
      id          SERIAL PRIMARY KEY,
      item_id     INTEGER REFERENCES items_portal(id) ON DELETE CASCADE,
      cip         VARCHAR(20),
      nombres     VARCHAR(200),
      unidad      VARCHAR(150),
      cargo       VARCHAR(80),
      telefono    VARCHAR(30),
      email       VARCHAR(100),
      estado      VARCHAR(20) DEFAULT 'pendiente',
      observacion TEXT DEFAULT '',
      fecha       TIMESTAMP DEFAULT NOW()
    );
    ALTER TABLE inscripciones ADD COLUMN IF NOT EXISTS observacion TEXT DEFAULT '';
    ALTER TABLE inscripciones ADD COLUMN IF NOT EXISTS pdf_requisitos TEXT DEFAULT '';
    ALTER TABLE inscripciones ADD COLUMN IF NOT EXISTS pdf_nombre VARCHAR(200) DEFAULT '';
    ALTER TABLE inscripciones ADD COLUMN IF NOT EXISTS dni VARCHAR(20) DEFAULT '';
    ALTER TABLE inscripciones ADD COLUMN IF NOT EXISTS grado VARCHAR(60) DEFAULT '';
    ALTER TABLE inscripciones ADD COLUMN IF NOT EXISTS area VARCHAR(100) DEFAULT '';
    ALTER TABLE inscripciones ADD COLUMN IF NOT EXISTS arma VARCHAR(30) DEFAULT '';
    ALTER TABLE inscripciones ADD COLUMN IF NOT EXISTS disponibilidad VARCHAR(20) DEFAULT '';
    ALTER TABLE inscripciones ADD COLUMN IF NOT EXISTS dia_franco VARCHAR(10) DEFAULT '';
    ALTER TABLE inscripciones ADD COLUMN IF NOT EXISTS fecha_egreso DATE;
    ALTER TABLE inscripciones ADD COLUMN IF NOT EXISTS tiempo_servicio VARCHAR(50) DEFAULT '';
    CREATE INDEX IF NOT EXISTS idx_inscripciones_cip ON inscripciones(cip);

    ALTER TABLE items_portal ADD COLUMN IF NOT EXISTS plantilla_pdf TEXT DEFAULT '';
    ALTER TABLE items_portal ADD COLUMN IF NOT EXISTS plantilla_nombre VARCHAR(200) DEFAULT '';
    ALTER TABLE items_portal ADD COLUMN IF NOT EXISTS ventana_inscripcion VARCHAR(300) DEFAULT '';

    CREATE TABLE IF NOT EXISTS sorteos_portal (
      id           SERIAL PRIMARY KEY,
      tipo         VARCHAR(20) NOT NULL DEFAULT 'proximo',
      titulo       VARCHAR(200) NOT NULL,
      descripcion  TEXT DEFAULT '',
      fecha_sorteo VARCHAR(100) DEFAULT '',
      imagen       TEXT DEFAULT '',
      item_id      INTEGER REFERENCES items_portal(id) ON DELETE SET NULL,
      publicado    BOOLEAN DEFAULT TRUE,
      orden        INTEGER DEFAULT 0,
      creado       TIMESTAMP DEFAULT NOW()
    );
    ALTER TABLE sorteos_portal ADD COLUMN IF NOT EXISTS orden INTEGER DEFAULT 0;

    CREATE TABLE IF NOT EXISTS resultados_sorteo (
      id        SERIAL PRIMARY KEY,
      sorteo_id INTEGER REFERENCES sorteos_portal(id) ON DELETE CASCADE,
      cip       VARCHAR(20) DEFAULT '',
      nombres   VARCHAR(200) NOT NULL,
      unidad    VARCHAR(150) DEFAULT '',
      cargo     VARCHAR(80) DEFAULT '',
      orden     SMALLINT DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS resultados_pdf_portal (
      id          SERIAL PRIMARY KEY,
      tipo        VARCHAR(20) NOT NULL DEFAULT 'convenio',
      item_id     INTEGER REFERENCES items_portal(id) ON DELETE SET NULL,
      titulo      VARCHAR(200) NOT NULL,
      pdf_data    TEXT DEFAULT '',
      pdf_nombre  VARCHAR(200) DEFAULT '',
      publicado   BOOLEAN DEFAULT TRUE,
      orden       INTEGER DEFAULT 0,
      creado      TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS portal_configuracion (
      id         INTEGER PRIMARY KEY DEFAULT 1,
      data_json  TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS portal_archivos (
      clave       VARCHAR(64) PRIMARY KEY,
      mime        VARCHAR(100) NOT NULL DEFAULT 'video/mp4',
      nombre      VARCHAR(255) DEFAULT '',
      data        BYTEA NOT NULL,
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS admin_sesiones (
      token     VARCHAR(64) PRIMARY KEY,
      admin_id  INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
      expira    TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_admin_sesiones_expira ON admin_sesiones(expira);
  `);

  // Admins por defecto — la contraseña inicial se toma de variables de entorno.
  // Solo se insertan si el usuario no existe (ON CONFLICT DO NOTHING); las cuentas
  // ya creadas conservan su contraseña y se cambian desde el panel de usuarios.
  const seedPass = (envVar, fallback) => {
    const v = (process.env[envVar] || '').trim();
    if (v) return v;
    console.warn('AVISO: usando contraseña semilla por defecto para ' + envVar + '. Defina la variable de entorno y cambie la contraseña desde el panel.');
    return fallback;
  };
  const adminsDefecto = [
    ['admin_unitic', sha256(seedPass('SEED_PASS_UNITIC',     'AdminUNITIC2026')), 'unitic',  'UNITIC REGPOL Callao',   null, '[]'],
    ['psicologia',   sha256(seedPass('SEED_PASS_PSICOLOGIA', 'Psico2026!')),      'usuario', 'Oficina de Psicología',  null, '["evaluaciones","descargas"]'],
    ['convenios',    sha256(seedPass('SEED_PASS_CONVENIOS',  'Convenios2026!')),  'usuario', 'Oficina de Convenios',   null, '["cms_convenios"]'],
    ['educacion',    sha256(seedPass('SEED_PASS_EDUCACION',  'Educacion2026!')),  'usuario', 'Oficina de Educación',   null, '["cms_cursos"]'],
    ['imagen',       sha256(seedPass('SEED_PASS_IMAGEN',     'Imagen2026!')),     'usuario', 'Oficina de Imagen',      null, '["cms_inicio","cms_resena","cms_labor","cms_novedades"]'],
  ];
  for (const [u,h,r,n,un,p] of adminsDefecto) {
    await pool.query(
      `INSERT INTO admins (usuario,passhash,rol,nombre,unidad,permisos) VALUES ($1,$2,$3,$4,$5,$6::jsonb)
       ON CONFLICT (usuario) DO NOTHING`,
      [u,h,r,n,un,p]
    );
  }

  // Seed portal CMS desde site-data.json si la BD está vacía
  const { rows: cfgRows } = await pool.query('SELECT COUNT(*) AS t FROM portal_configuracion');
  if (parseInt(cfgRows[0].t, 10) === 0) {
    const sitePath = path.join(__dirname, 'public', 'site-data.json');
    if (fs.existsSync(sitePath)) {
      const siteJson = fs.readFileSync(sitePath, 'utf8');
      await pool.query(
        'INSERT INTO portal_configuracion(id, data_json, updated_at) VALUES(1, $1, NOW())',
        [siteJson]
      );
      console.log('portal_configuracion inicializada desde site-data.json');
    }
  }

  // Seed convocatorias (convenios/cursos) si la tabla está vacía
  const { rows: itemRows } = await pool.query('SELECT COUNT(*) AS t FROM items_portal');
  if (parseInt(itemRows[0].t, 10) === 0) {
    const reqsBase = [
      'Pertenecer a la REGPOL Callao.',
      'Encontrarse en situación de Actividad.',
      'No tener sanciones vigentes.'
    ];
    const reqsCurso = reqsBase.concat(['Haber pasado FEMA del año en curso.']);
    const seeds = [
      ['curso', 'CURSO SEGURIDAD CIUDADANA', 'DETALLES DEL CURSO', 'fa-graduation-cap', JSON.stringify(reqsCurso),
        '08:00 hrs a 13:00 hrs', 45, '15 DE JUNIO 2025', 'SEIS (06) SEMANAS',
        'Sujeta a modificación por necesidad de servicio', 'Las inscripciones se habilitan del 20 al 25 de abril', 1],
      ['curso', 'CURSO ACCIDENTES DE TRÁNSITO', 'DETALLES DEL CURSO', 'fa-car', JSON.stringify(reqsCurso),
        '08:00 hrs a 13:00 hrs', 45, '15 DE JUNIO 2025', 'SEIS (06) SEMANAS',
        'Sujeta a modificación por necesidad de servicio', 'Las inscripciones se habilitan del 20 al 25 de abril', 2],
      ['curso', 'XI CURSO DE INVESTIGACIÓN EN ESCENA DEL CRIMEN', 'DETALLES DEL CURSO', 'fa-book', JSON.stringify(reqsCurso),
        '08:00 hrs a 13:00 hrs', 45, '15 DE JUNIO 2025', 'SEIS (06) SEMANAS',
        'Sujeta a modificación por necesidad de servicio', 'Las inscripciones se habilitan del 20 al 25 de abril', 3]
    ];
    for (const s of seeds) {
      await pool.query(
        `INSERT INTO items_portal(tipo,titulo,descripcion,icono,requisitos,horario,vacantes,
          fecha_inicio,duracion,observaciones,ventana_inscripcion,orden,visible)
         VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,TRUE)`,
        s
      );
    }
    console.log('Seed: ' + seeds.length + ' cursos insertados en items_portal.');
  }

  await sincronizarConveniosOficiales(pool, true);

  // Seed divisiones solo la primera vez (evita 40+ queries en cada reinicio)
  const { rows: divRows } = await pool.query('SELECT COUNT(*) AS t FROM divisiones');
  if (parseInt(divRows[0].t) === 0) {
    await sincronizarDivisionesUnidades();
  } else {
    console.log('Divisiones ya cargadas (' + divRows[0].t + '), sync omitido.');
  }

  await sincronizarUnidadAdministrativa();
  await corregirFotosEncabezadoPortal();

  // Seed preguntas en lotes de 100 para no superar límite de parámetros
  const { rows } = await pool.query('SELECT COUNT(*) AS t FROM preguntas');
  if (parseInt(rows[0].t) === 0) {
    const pregs  = require('./preguntas_data.json');
    const LOTE   = 100;
    for (let i = 0; i < pregs.length; i += LOTE) {
      const lote  = pregs.slice(i, i + LOTE);
      const vals  = lote.map((p, j) => `($${j*3+1},$${j*3+2},$${j*3+3})`).join(',');
      const args  = lote.flatMap(p => [p.id, p.texto, p.id]);
      await pool.query(`INSERT INTO preguntas (numero,texto,orden) VALUES ${vals} ON CONFLICT (numero) DO NOTHING`, args);
    }
    console.log(`Seed: ${pregs.length} preguntas insertadas.`);
  }

  console.log('PostgreSQL listo.');
}

const DIVISIONES_CANON = [
  { nombre: 'DIVOPUS 1', orden: 1, unidades: [
    'CIA CALLAO', 'CIA LA PUNTA', 'CIA BELLAVISTA', 'CIA CIUDADELA CHALACA',
    'CIA CIUDAD DEL PESCADOR', 'CIA RAMON CASTILLA', 'CIA LA LEGUA', 'CIA LA PERLA'
  ]},
  { nombre: 'DIVOPUS 2', orden: 2, unidades: [
    'CIA JUAN INGUNZA', 'CIA SARITA COLONIA', 'CIA BOCANEGRA',
    'CIA MANUEL DULANTO', 'CIA PLAYA RIMAC', 'CIA CARMEN DE LA LEGUA'
  ]},
  { nombre: 'DIVOPUS 3', orden: 3, unidades: [
    'CIA VENTANILLA', 'CIA OQUENDO', 'CIA MI PERU',
    'CIA PACHACUTEC', 'CIA VILLA LOS REYES', 'CIA MARQUEZ'
  ]},
  { nombre: 'DIVUES', orden: 4, unidades: [
    'ESCVER CALLAO', 'ESCVER VENTANILLA', 'UNIEME CALLAO', 'UNIEME VENTANILLA',
    'UNIDIR CALLAO', 'UNIPAPIE', 'USEG CALLAO', 'UNISEINT CALLAO',
    'UNIPIAT CALLAO', 'USE CALLAO', 'USE VENTANILLA', 'UNIPIRV CALLAO',
    'UTSEVI CALLAO', 'SECTSV VENTANILLA'
  ]},
  { nombre: 'UNIDADES ADM. RPC', orden: 5, unidades: ['UNIDADES ADM. RPC'] }
];

async function obtenerDivisionesAgrupadas() {
  const divs = await pool.query('SELECT id, nombre, orden FROM divisiones ORDER BY orden, nombre');
  const upols = await pool.query(
    'SELECT nombre, division_id, tipo, orden FROM unidades_pol ORDER BY division_id, orden, nombre'
  );
  return divs.rows.map(function(d) {
    return {
      id: d.id,
      nombre: d.nombre,
      unidades: upols.rows
        .filter(function(u) { return u.division_id === d.id; })
        .map(function(u) { return { nombre: u.nombre, tipo: u.tipo }; })
    };
  });
}

async function sincronizarDivisionesUnidades() {
  function tipoUnidadDivision(nombreDiv) {
    if (nombreDiv === 'DIVUES') return 'especializada';
    if (nombreDiv === 'UNIDADES ADM. RPC') return 'administrativa';
    return 'comisaria';
  }
  for (let d = 0; d < DIVISIONES_CANON.length; d++) {
    const div = DIVISIONES_CANON[d];
    const tipo = tipoUnidadDivision(div.nombre);
    let dr = await pool.query('SELECT id FROM divisiones WHERE UPPER(TRIM(nombre))=UPPER(TRIM($1))', [div.nombre]);
    let divId;
    if (!dr.rows.length) {
      const ins = await pool.query(
        'INSERT INTO divisiones (nombre, orden) VALUES ($1, $2) RETURNING id',
        [div.nombre, div.orden]
      );
      divId = ins.rows[0].id;
    } else {
      divId = dr.rows[0].id;
      await pool.query('UPDATE divisiones SET orden=$1, nombre=$2 WHERE id=$3', [div.orden, div.nombre, divId]);
    }
    for (let u = 0; u < div.unidades.length; u++) {
      const nombre = div.unidades[u];
      await pool.query(
        `INSERT INTO unidades_pol (nombre, division_id, tipo, orden) VALUES ($1,$2,$3,$4)
         ON CONFLICT (nombre) DO UPDATE SET division_id=$2, tipo=$3, orden=$4`,
        [nombre, divId, tipo, u + 1]
      );
    }
  }
  console.log('Divisiones sincronizadas: DIVOPUS 1-3, DIVUES y UNIDADES ADM. RPC.');
  await seedContactoComisarias();
}

const DIV_ADM_RPC = 'UNIDADES ADM. RPC';
const UNIDAD_ADM_RPC = 'UNIDADES ADM. RPC';
const UNIDAD_ADM_LEGACY = 'UNIDADES ADM.';

const SQL_FILTRO_USUARIOS_ADM_RPC = `
  UPPER(COALESCE(nombres, '')) LIKE '%SALAZAR MONTANO%'
  OR UPPER(COALESCE(nombres, '')) LIKE '%ANTHONY%CCAYO%'
`;

async function moverUsuariosRegistroAdmRpc() {
  const adm = UNIDAD_ADM_RPC;
  const rProg = await pool.query(
    `UPDATE progresos SET unidad = $1::varchar(150), comisaria = $2::varchar(120)
     WHERE (${SQL_FILTRO_USUARIOS_ADM_RPC})
       AND (
         UPPER(TRIM(COALESCE(unidad, ''))) <> UPPER(TRIM($3::text))
         OR UPPER(TRIM(COALESCE(comisaria, ''))) <> UPPER(TRIM($3::text))
       )`,
    [adm, adm, adm]
  );
  const rEval = await pool.query(
    `UPDATE evaluaciones SET unidad = $1::varchar(150), comisaria = $2::varchar(120)
     WHERE (${SQL_FILTRO_USUARIOS_ADM_RPC})
       AND (
         UPPER(TRIM(COALESCE(unidad, ''))) <> UPPER(TRIM($3::text))
         OR UPPER(TRIM(COALESCE(comisaria, ''))) <> UPPER(TRIM($3::text))
       )`,
    [adm, adm, adm]
  );
  const n = (rProg.rowCount || 0) + (rEval.rowCount || 0);
  if (n) console.log('Usuarios admin. movidos a UNIDADES ADM. RPC: ' + n + ' registro(s).');
  return n;
}

async function sincronizarUnidadAdministrativa() {
  const adm = UNIDAD_ADM_RPC;
  const leg = UNIDAD_ADM_LEGACY;

  let dr = await pool.query(
    'SELECT id FROM divisiones WHERE UPPER(TRIM(nombre)) = UPPER(TRIM($1::text))',
    [adm]
  );
  let divId;
  if (!dr.rows.length) {
    const ins = await pool.query(
      'INSERT INTO divisiones (nombre, orden) VALUES ($1::varchar, $2::smallint) RETURNING id',
      [adm, 5]
    );
    divId = ins.rows[0].id;
  } else {
    divId = dr.rows[0].id;
    await pool.query(
      'UPDATE divisiones SET orden = $1::smallint, nombre = $2::varchar WHERE id = $3::integer',
      [5, adm, divId]
    );
  }

  const existRpc = await pool.query(
    'SELECT id FROM unidades_pol WHERE UPPER(TRIM(nombre)) = UPPER(TRIM($1::text))',
    [adm]
  );
  const existLeg = await pool.query(
    'SELECT id FROM unidades_pol WHERE UPPER(TRIM(nombre)) = UPPER(TRIM($1::text))',
    [leg]
  );
  if (existRpc.rows.length) {
    await pool.query(
      `UPDATE unidades_pol SET division_id = $1::integer, tipo = 'administrativa', orden = 1 WHERE id = $2::integer`,
      [divId, existRpc.rows[0].id]
    );
    if (existLeg.rows.length && existLeg.rows[0].id !== existRpc.rows[0].id) {
      await pool.query('DELETE FROM unidades_pol WHERE id = $1::integer', [existLeg.rows[0].id]);
    }
  } else if (existLeg.rows.length) {
    await pool.query(
      `UPDATE unidades_pol SET nombre = $1::varchar, division_id = $2::integer, tipo = 'administrativa', orden = 1 WHERE id = $3::integer`,
      [adm, divId, existLeg.rows[0].id]
    );
  } else {
    await pool.query(
      `INSERT INTO unidades_pol (nombre, division_id, tipo, orden) VALUES ($1::varchar, $2::integer, 'administrativa', 1)
       ON CONFLICT (nombre) DO UPDATE SET division_id = EXCLUDED.division_id, tipo = 'administrativa', orden = 1`,
      [adm, divId]
    );
  }

  const rProg1 = await pool.query(
    `UPDATE progresos SET unidad = $1::varchar(150), comisaria = $2::varchar(120)
     WHERE TRIM(COALESCE(unidad, '')) = ''`,
    [adm, adm]
  );
  const rProg2 = await pool.query(
    `UPDATE progresos SET unidad = $1::varchar(150), comisaria = $2::varchar(120)
     WHERE UPPER(TRIM(COALESCE(unidad, ''))) = UPPER(TRIM($3::text))
        OR UPPER(TRIM(COALESCE(comisaria, ''))) = UPPER(TRIM($3::text))`,
    [adm, adm, leg]
  );
  const rEval1 = await pool.query(
    `UPDATE evaluaciones SET unidad = $1::varchar(150), comisaria = $2::varchar(120)
     WHERE TRIM(COALESCE(unidad, '')) = ''`,
    [adm, adm]
  );
  const rEval2 = await pool.query(
    `UPDATE evaluaciones SET unidad = $1::varchar(150), comisaria = $2::varchar(120)
     WHERE UPPER(TRIM(COALESCE(unidad, ''))) = UPPER(TRIM($3::text))
        OR UPPER(TRIM(COALESCE(comisaria, ''))) = UPPER(TRIM($3::text))`,
    [adm, adm, leg]
  );

  const migrHecha = await getConfig('migracion_unidades_adm_rpc_v1');
  let rCiaProg = { rowCount: 0 };
  let rCiaEval = { rowCount: 0 };
  if (!migrHecha) {
    rCiaProg = await pool.query(
      `UPDATE progresos SET unidad = $1::varchar(150), comisaria = $2::varchar(120)
       WHERE UPPER(TRIM(COALESCE(unidad, ''))) = 'CIA CALLAO'
         AND UPPER(TRIM(COALESCE(comisaria, ''))) = 'CIA CALLAO'`,
      [adm, adm]
    );
    rCiaEval = await pool.query(
      `UPDATE evaluaciones SET unidad = $1::varchar(150), comisaria = $2::varchar(120)
       WHERE UPPER(TRIM(COALESCE(unidad, ''))) = 'CIA CALLAO'
         AND UPPER(TRIM(COALESCE(comisaria, ''))) = 'CIA CALLAO'
         AND (completada IS NOT TRUE OR completada IS NULL)`,
      [adm, adm]
    );
    await setConfig('migracion_unidades_adm_rpc_v1', '1');
  }

  const migrActivas = await getConfig('migracion_activas_adm_rpc_v1');
  if (!migrActivas) {
    let activas = await leerUnidadesActivas();
    let cambio = false;
    activas = activas.map(function(a) {
      if (String(a).trim().toUpperCase() === leg.toUpperCase()) {
        cambio = true;
        return adm.toUpperCase();
      }
      return a;
    });
    if (cambio) {
      await setConfig('unidades_activas', JSON.stringify(activas));
      configCache = null;
      configCacheExp = 0;
    }
    await setConfig('migracion_activas_adm_rpc_v1', '1');
  }

  const total = (rProg1.rowCount || 0) + (rProg2.rowCount || 0) + (rEval1.rowCount || 0) + (rEval2.rowCount || 0)
    + (rCiaProg.rowCount || 0) + (rCiaEval.rowCount || 0);
  const movidos = await moverUsuariosRegistroAdmRpc();
  if (total || movidos) {
    console.log('UNIDADES ADM. RPC: ' + (total + movidos) + ' registro(s) de evaluación/progreso actualizados.');
  }
}

const FOTOS_ENCABEZADO_DEFAULT = ['img/Imagen1.jpg', 'img/saludo.jpg', 'img/lunespatriotico.jpg'];

function esUrlImagenHotlinkRota(url) {
  const u = String(url || '').toLowerCase();
  return /fbcdn\.net|facebook\.com|instagram\.com|cdninstagram\.com|tiktokcdn\.com|tiktok\.com/.test(u);
}

function esImagenEncabezadoValida(url) {
  const f = String(url || '').trim();
  if (!f) return false;
  if (/^data:image\/(jpeg|png|webp);base64,/i.test(f)) return true;
  if (f.indexOf('/portal/header-foto/') === 0 || f.indexOf('/portal/carrusel-imagen/') === 0) return true;
  return !esUrlImagenHotlinkRota(f);
}

function sanitizarFotosEncabezadoList(fotos) {
  const arr = Array.isArray(fotos) ? fotos : [];
  const limpias = arr.map(f => String(f || '').trim()).filter(esImagenEncabezadoValida);
  return limpias;
}

function parseDataImageUrl(dataUrl) {
  const s = String(dataUrl || '').trim();
  const m = s.match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i);
  if (!m) return null;
  try {
    const buffer = Buffer.from(m[2].replace(/\s/g, ''), 'base64');
    if (!buffer.length) return null;
    return { mime: m[1].toLowerCase(), buffer };
  } catch (e) {
    return null;
  }
}

async function guardarPortalArchivoDesdeDataUrl(clave, dataUrl) {
  const parsed = parseDataImageUrl(dataUrl);
  if (!parsed) return false;
  await pool.query(
    `INSERT INTO portal_archivos (clave, mime, nombre, data, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (clave) DO UPDATE SET
       mime = EXCLUDED.mime, data = EXCLUDED.data, updated_at = NOW()`,
    [clave, parsed.mime, clave + '.img', parsed.buffer]
  );
  return true;
}

async function normalizarImagenesPortalEnConfig(data) {
  if (!data || typeof data !== 'object') return { data: data, changed: false };
  let changed = false;

  if (Array.isArray(data.carrusel)) {
    for (let i = 0; i < data.carrusel.length; i++) {
      const sl = data.carrusel[i];
      if (!sl) continue;
      const img = String(sl.imagen || '').trim();
      if (img.indexOf('data:image/') === 0) {
        const clave = 'carrusel_' + i;
        if (await guardarPortalArchivoDesdeDataUrl(clave, img)) {
          sl.imagen = '/portal/carrusel-imagen/' + i;
          changed = true;
        }
      }
    }
  }

  if (Array.isArray(data.fotosEncabezado)) {
    const nuevas = [];
    for (let i = 0; i < data.fotosEncabezado.length; i++) {
      const img = String(data.fotosEncabezado[i] || '').trim();
      if (img.indexOf('data:image/') === 0) {
        const clave = 'header_foto_' + i;
        if (await guardarPortalArchivoDesdeDataUrl(clave, img)) {
          nuevas.push('/portal/header-foto/' + i);
          changed = true;
        }
      } else if (img) {
        nuevas.push(img);
      }
    }
    if (changed) data.fotosEncabezado = nuevas;
  }

  return { data: data, changed: changed };
}

async function corregirFotosEncabezadoPortal() {
  const r = await pool.query('SELECT data_json FROM portal_configuracion WHERE id=1');
  if (!r.rows.length || !r.rows[0].data_json) return;
  const data = typeof r.rows[0].data_json === 'string'
    ? JSON.parse(r.rows[0].data_json) : r.rows[0].data_json;
  const orig = JSON.stringify(data.fotosEncabezado || []);
  data.fotosEncabezado = sanitizarFotosEncabezadoList(data.fotosEncabezado);
  if (JSON.stringify(data.fotosEncabezado) !== orig) {
    await pool.query(
      'UPDATE portal_configuracion SET data_json=$1, updated_at=NOW() WHERE id=1',
      [JSON.stringify(data)]
    );
    console.log('fotosEncabezado: URLs de redes sociales reemplazadas por imágenes locales.');
  }
}

const CONTACTO_COMISARIAS = [
  { nombre: 'CIA CALLAO',            direccion: 'AV FERNANDINI / JR SUPE',                                                                  telefono: '980 121 440' },
  { nombre: 'CIA BELLAVISTA',        direccion: 'AV. GUARDIA CHALACA 1800',                                                                  telefono: '980121172'  },
  { nombre: 'CIA CIUDADELA CHALACA', direccion: 'CALLE 12 DE MAYO MZ. J LOTE 27 – AA. HH CIUDADELA CHALACA',                                telefono: '920 370 886' },
  { nombre: 'CIA CIUDAD DEL PESCADOR', direccion: 'AV. JUAN VELASCO ALVARADO N°1299',                                                       telefono: '959 042 602' },
  { nombre: 'CIA RAMON CASTILLA',    direccion: 'JR TALARA 200 - URB RAMON CASTILLA',                                                        telefono: '980 121 417' },
  { nombre: 'CIA LA LEGUA',          direccion: 'AV MANUEL VIDAURRE S/N URB LA COLONIAL',                                                    telefono: '980121623'  },
  { nombre: 'CIA LA PERLA',          direccion: 'JR. BRASIL Nº 664 - LA PERLA',                                                              telefono: '958 892 952' },
  { nombre: 'CIA LA PUNTA',          direccion: 'AV. GRAU, CUADRA 10 S/N - LA PUNTA',                                                       telefono: '945336 049'  },
  { nombre: 'CIA JUAN INGUNZA',      direccion: 'TOMAS VALLE CUADRA 34',                                                                     telefono: '980121618'  },
  { nombre: 'CIA BOCANEGRA',         direccion: 'CALLE GAMMMA S/N MZ A30. LT1 A.H BOCANEGRA SECTOR 1',                                      telefono: '980121629'  },
  { nombre: 'CIA MANUEL DULANTO',    direccion: 'JR HUANCAYO CON JR AREQUIPA S/N',                                                           telefono: '980121621'  },
  { nombre: 'CIA PLAYA RIMAC',       direccion: 'JR MIGUEL GRAU S/N',                                                                        telefono: '980 121 622' },
  { nombre: 'CIA CARMEN DE LA LEGUA', direccion: 'AV PRIMERO DE MAYO 1108',                                                                  telefono: '980122525'  },
  { nombre: 'CIA SARITA COLONIA',    direccion: 'AV. VÍCTOR ANDRÉS BELAUNDE S/N. MZ. G2 LTE. 6 1ER SECTOR - ASENT. H. SARITA COLONIA - CALLAO', telefono: '980121362' },
  { nombre: 'CIA VENTANILLA',        direccion: 'AV. PEDRO BELTRAN N° 138',                                                                  telefono: '966834361'  },
  { nombre: 'CIA MI PERU',           direccion: 'CALLE MI PERU S/N MZ.G LOTE1',                                                              telefono: '942896563'  },
  { nombre: 'CIA PACHACUTEC',        direccion: 'AV. 225 MZ-W, LT-13 AA.HH. HIROSHIMA PACHACUTEC',                                          telefono: '957832427'  },
  { nombre: 'CIA VILLA LOS REYES',   direccion: 'AH VILLA LOS REYES III SECTOR MZ C LT 03',                                                  telefono: '980122543'  },
  { nombre: 'CIA MARQUEZ',           direccion: 'JR UCAYALI S/N Y AV. VENCEDOR AAHH MARQUEZ CALLAO',                                        telefono: '920019019'  },
  { nombre: 'CIA OQUENDO',           direccion: 'CALLE BOLIVIA CON CALLE BUENOS AIRES - CPV OQUENDO',                                        telefono: '980121592'  },
];

async function seedContactoComisarias() {
  for (const c of CONTACTO_COMISARIAS) {
    await pool.query(
      `UPDATE unidades_pol SET direccion=$1, telefono=$2
       WHERE UPPER(TRIM(nombre))=UPPER(TRIM($3))
         AND (direccion IS NULL OR direccion = '' OR telefono IS NULL OR telefono = '')`,
      [c.direccion, c.telefono, c.nombre]
    );
  }
  console.log('Contacto de comisarías actualizado.');
}

// ── Estáticos en memoria (rápido + sin ERR_HTTP2 en Railway) ───────────────────
const PUBLIC_DIR = path.join(__dirname, 'public');
const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css':  'text/css; charset=UTF-8',
  '.js':   'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png':  'image/png',
  '.webp': 'image/webp',
  '.gif':  'image/gif',
  '.ico':  'image/x-icon',
  '.svg':  'image/svg+xml',
  '.woff2':'font/woff2',
};

const staticCache = new Map();
const pendingStaticReads = new Map();
const STATIC_WARM_FILES = [
  'index.html', 'style.css', 'portal.js', 'portal-data.js', 'site-data.json', 'api-config.js',
  'cursos.html', 'convenios.html', 'unidades.html', 'unidades-data.json',
  'evaluacion.html', 'detalle.html', 'img/regpol-callao.jpg'
];

function cacheStaticEntry(rel, data) {
  const entry = { data, ext: path.extname(rel).toLowerCase() };
  staticCache.set(rel, entry);
  staticCache.set(rel.toLowerCase(), entry);
  return entry;
}

function leerEstaticoAsync(rel, cb) {
  const key = rel.toLowerCase();
  const cached = staticCache.get(rel) || staticCache.get(key);
  if (cached) return cb(null, cached);
  if (pendingStaticReads.has(key)) {
    pendingStaticReads.get(key).push(cb);
    return;
  }
  const full = path.join(PUBLIC_DIR, rel);
  pendingStaticReads.set(key, [cb]);
  fs.readFile(full, function(err, data) {
    const waiters = pendingStaticReads.get(key) || [];
    pendingStaticReads.delete(key);
    if (err) {
      waiters.forEach(function(fn) { fn(err); });
      return;
    }
    const entry = cacheStaticEntry(rel, data);
    waiters.forEach(function(fn) { fn(null, entry); });
  });
}

function precalentarEstaticos() {
  STATIC_WARM_FILES.forEach(function(rel) {
    leerEstaticoAsync(rel, function() {});
  });
}

function enviarEstatico(res, entry, method) {
  res.status(200);
  res.setHeader('Content-Type', MIME_TYPES[entry.ext] || 'application/octet-stream');
  res.setHeader('Content-Length', String(entry.data.length));
  res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
  if (method === 'HEAD') return res.end();
  res.end(entry.data);
}

function staticBufferado(req, res, next) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  var urlPath = (req.path || '/').split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';
  var rel = urlPath.replace(/^\//, '').replace(/\.\./g, '');
  var entry = staticCache.get(rel) || staticCache.get(rel.toLowerCase());
  if (entry) return enviarEstatico(res, entry, req.method);
  leerEstaticoAsync(rel, function(err, loaded) {
    if (err || !loaded) return next();
    enviarEstatico(res, loaded, req.method);
  });
}

// ── Middlewares ────────────────────────────────────────────────────────────────
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.get('/health', function(req, res) {
  res.status(200).type('text/plain').send('ok');
});

app.use(cors());
app.use(compression()); // gzip para HTML/JS/JSON — acelera panel y formulario
app.use(function(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});
app.use(express.json({ limit: '32mb' }));
app.use(staticBufferado);
app.use(express.static(PUBLIC_DIR, {
  maxAge: 0, etag: false, fallthrough: true,
  setHeaders: function(res, filePath) {
    if (/\.(js|json)$/.test(filePath)) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
    if (/\.json$/.test(filePath)) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    }
  }
}));

app.get('/img/regpol%20callao.jpg', function(req, res) {
  res.redirect(301, '/img/regpol-callao.jpg');
});

// ── Auth middleware ────────────────────────────────────────────────────────────
async function requireAuth(req, res, next) {
  try {
    const token = req.headers['x-admin-token'] || req.query.token || '';
    if (!token) return res.status(401).json({ ok: false, error: 'Sin token' });

    // 1) Token opaco de sesión (esquema actual)
    const ses = sesiones.get(token);
    if (ses && ses.exp > Date.now()) {
      if (ses.dbExp <= Date.now()) {
        // Refresca rol/permisos desde BD; si el usuario fue eliminado, cierra sesión
        const rs = await pool.query('SELECT * FROM admins WHERE id=$1', [ses.adminId]);
        if (!rs.rows.length) {
          sesiones.delete(token);
          await pool.query('DELETE FROM admin_sesiones WHERE token=$1', [token]).catch(function() {});
          return res.status(403).json({ ok: false, error: 'Sesión finalizada' });
        }
        ses.admin = rs.rows[0];
        ses.dbExp = Date.now() + AUTH_CACHE_TTL;
      }
      ses.exp = Date.now() + SESION_TTL;
      await persistirSesionDb(token, ses.adminId, ses.exp);
      req.admin = ses.admin;
      return next();
    }

    // 2) Sesión persistida en PostgreSQL (sobrevive reinicios de Railway)
    const dbSes = await cargarSesionDesdeDb(token);
    if (dbSes) {
      const nuevaExp = Date.now() + SESION_TTL;
      sesiones.set(token, {
        adminId: dbSes.admin.id,
        admin: dbSes.admin,
        exp: nuevaExp,
        dbExp: Date.now() + AUTH_CACHE_TTL
      });
      await persistirSesionDb(token, dbSes.admin.id, nuevaExp);
      req.admin = dbSes.admin;
      return next();
    }

    // 3) Compatibilidad con tokens antiguos (sesiones abiertas antes del cambio)
    const cached = authCache.get(token);
    if (cached && cached.exp > Date.now()) {
      req.admin = cached.admin;
      return next();
    }
    const decoded = Buffer.from(token, 'base64').toString();
    const colon   = decoded.indexOf(':');
    if (colon < 1) return res.status(403).json({ ok: false, error: 'Sesión expirada' });
    const usuario = decoded.substring(0, colon);
    const pass    = decoded.substring(colon + 1);
    const r = await pool.query('SELECT * FROM admins WHERE usuario=$1 AND passhash=$2', [usuario, sha256(pass)]);
    if (!r.rows.length) return res.status(403).json({ ok: false, error: 'Credenciales inválidas' });
    req.admin = r.rows[0];
    authCache.set(token, { admin: r.rows[0], exp: Date.now() + AUTH_CACHE_TTL });
    next();
  } catch(e) {
    res.status(401).json({ ok: false, error: 'Token inválido' });
  }
}

// ── Configuración global (dependencia activa para evaluaciones) ───────────────
async function getConfig(clave) {
  const r = await pool.query('SELECT valor FROM configuracion WHERE clave=$1', [clave]);
  return r.rows.length ? (r.rows[0].valor || '') : '';
}

async function setConfig(clave, valor) {
  await pool.query(
    `INSERT INTO configuracion (clave, valor, actualizado) VALUES ($1::varchar, $2::text, NOW())
     ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado = NOW()`,
    [clave, valor]
  );
}

function puedeConfigurarUnidad(admin) {
  if (admin.rol === 'unitic' || admin.rol === 'bienestar') return true;
  const permisos = normalizarPermisos(admin.permisos);
  return permisos.includes('evaluaciones');
}

function normalizarPermisos(permisos) {
  if (Array.isArray(permisos)) return permisos;
  if (typeof permisos === 'string') {
    try { return JSON.parse(permisos); } catch (e) { return []; }
  }
  return [];
}

function debeFiltrarPorUnidadAsignada(admin) {
  if (!admin.unidad) return false;
  if (admin.rol === 'unitic' || admin.rol === 'bienestar') return false;
  return !normalizarPermisos(admin.permisos).includes('evaluaciones');
}

function puedeGestionarEvaluaciones(admin) {
  if (!admin) return false;
  if (admin.rol === 'unitic' || admin.rol === 'bienestar') return true;
  return normalizarPermisos(admin.permisos).includes('evaluaciones');
}

function puedePublicarConfiguracionPortal(admin) {
  if (!admin) return false;
  if (admin.rol === 'unitic') return true;
  return normalizarPermisos(admin.permisos).some(function(p) {
    return String(p || '').indexOf('cms_') === 0;
  });
}

function limpiarClavesLegacyPortalConfig(data) {
  if (!data || typeof data !== 'object') return data;
  delete data.convenios;
  delete data.cursos;
  delete data.conveniosPdf;
  delete data.cursosPdf;
  return data;
}

function adminPuedeAccederRegistro(admin, unidad, comisaria) {
  if (!debeFiltrarPorUnidadAsignada(admin)) return true;
  const u = (admin.unidad || '').toUpperCase();
  const uni = (unidad || '').toUpperCase();
  const com = (comisaria || '').toUpperCase();
  return uni.includes(u) || com.includes(u);
}

function invalidarStatsCache() {
  statsCache = null;
  statsCacheKey = '';
  statsCacheExp = 0;
}

// Conteo seguro de respuestas JSONB (evita error si el valor no es objeto)
function sqlContarRespuestas(col) {
  return `(CASE WHEN ${col} IS NOT NULL AND jsonb_typeof(${col}) = 'object'
    THEN (SELECT COUNT(*)::int FROM jsonb_object_keys(${col})) ELSE 0 END)`;
}

function sqlProgresoConRespuestas(alias) {
  const a = alias || 'p';
  return `COALESCE(${a}.total_resp, 0) > 0`;
}

let statsCache = null;
let statsCacheKey = '';
let statsCacheExp = 0;
const STATS_CACHE_MS = 45000;

async function leerUnidadesActivas() {
  const raw = await getConfig('unidades_activas');
  if (raw !== null && raw !== undefined && String(raw).trim() !== '') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map(u => String(u).trim().toUpperCase()).filter(Boolean);
      }
    } catch (e) { /* ignorar */ }
  }
  const legacy = await getConfig('comisaria_activa');
  if (legacy) return [String(legacy).trim().toUpperCase()];
  return [];
}

let configCache = null;
let configCacheExp = 0;
const CONFIG_CACHE_MS = 120000;

let preguntasCache = null;
let preguntasCacheExp = 0;
const PREGUNTAS_CACHE_MS = 300000;

const portalItemsCache = new Map();
const PORTAL_ITEMS_CACHE_MS = 120000;

app.get('/config', async (req, res) => {
  try {
    const sinCache = req.query._ != null || req.query.nocache === '1';
    if (!sinCache && configCache && configCacheExp > Date.now()) {
      return res.json(configCache);
    }
    const unidadesActivas = await leerUnidadesActivas();
    const divisiones = await obtenerDivisionesAgrupadas();
    configCache = {
      ok: true,
      unidadesActivas,
      comisariaActiva: unidadesActivas[0] || '',
      divisiones
    };
    configCacheExp = Date.now() + CONFIG_CACHE_MS;
    res.json(configCache);
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

app.put('/config', requireAuth, async (req, res) => {
  try {
    if (!puedeConfigurarUnidad(req.admin)) {
      return res.status(403).json({ ok: false, error: 'Sin permiso para activar dependencia' });
    }
    let unidades = req.body.unidadesActivas;
    if (!Array.isArray(unidades) && req.body.comisariaActiva) {
      unidades = [req.body.comisariaActiva];
    }
    if (!Array.isArray(unidades)) {
      return res.json({ ok: false, error: 'Seleccione al menos una dependencia' });
    }
    unidades = unidades.map(u => String(u).trim().toUpperCase()).filter(Boolean);
    if (!unidades.length) {
      return res.json({ ok: false, error: 'Seleccione al menos una dependencia' });
    }
    await setConfig('unidades_activas', JSON.stringify(unidades));
    await setConfig('comisaria_activa', unidades[0]);
    configCache = null;
    res.json({ ok: true, unidadesActivas: unidades, comisariaActiva: unidades[0] });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── POST /admin/login ──────────────────────────────────────────────────────────
app.post('/admin/login', async (req, res) => {
  try {
    const ip = req.ip || req.socket.remoteAddress || '';
    if (loginBloqueado(ip)) {
      return res.status(429).json({ ok: false, error: 'Demasiados intentos. Espere unos minutos y vuelva a intentar.' });
    }
    const { usuario, password } = req.body;
    const r = await pool.query('SELECT * FROM admins WHERE usuario=$1 AND passhash=$2',
      [usuario, sha256(password)]);
    if (!r.rows.length) {
      registrarFalloLogin(ip);
      return res.json({ ok: false, error: 'Credenciales incorrectas' });
    }
    loginIntentos.delete(ip);
    const a = r.rows[0];
    // Token opaco de sesión: no contiene ni permite recuperar la contraseña
    const token = crypto.randomBytes(24).toString('hex');
    const exp = Date.now() + SESION_TTL;
    sesiones.set(token, { adminId: a.id, admin: a, exp, dbExp: Date.now() + AUTH_CACHE_TTL });
    await persistirSesionDb(token, a.id, exp);
    res.json({ ok: true, token, rol: a.rol, nombre: a.nombre, unidad: a.unidad, permisos: normalizarPermisos(a.permisos) });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── GET /admin/perfil (refrescar sesión del panel) ────────────────────────────
app.get('/admin/perfil', requireAuth, async (req, res) => {
  const a = req.admin;
  res.json({
    ok: true,
    usuario: a.usuario,
    rol: a.rol,
    nombre: a.nombre,
    unidad: a.unidad || '',
    permisos: normalizarPermisos(a.permisos)
  });
});

// ── GET /preguntas (público — para el formulario) ─────────────────────────────
app.get('/preguntas', async (req, res) => {
  try {
    if (preguntasCache && preguntasCacheExp > Date.now()) {
      return res.json(preguntasCache);
    }
    const r = await pool.query('SELECT numero AS id, texto FROM preguntas WHERE activa=TRUE ORDER BY orden,numero');
    preguntasCache = { ok: true, preguntas: r.rows };
    preguntasCacheExp = Date.now() + PREGUNTAS_CACHE_MS;
    res.json(preguntasCache);
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

function puedeGestionarPreguntas(admin) {
  return admin.rol === 'unitic' || normalizarPermisos(admin.permisos).includes('evaluaciones');
}

// ── CRUD preguntas (Super Admin o Psicología con permiso evaluaciones) ─────────
app.get('/admin/preguntas', requireAuth, async (req, res) => {
  if (!puedeGestionarPreguntas(req.admin))
    return res.status(403).json({ ok: false, error: 'Sin acceso' });
  const r = await pool.query('SELECT * FROM preguntas ORDER BY orden,numero');
  res.json({ ok: true, preguntas: r.rows });
});

app.put('/admin/preguntas/:id', requireAuth, async (req, res) => {
  if (!puedeGestionarPreguntas(req.admin)) return res.status(403).json({ ok: false, error: 'Sin acceso' });
  const { texto, activa } = req.body;
  await pool.query('UPDATE preguntas SET texto=$1,activa=$2 WHERE id=$3', [texto, activa, req.params.id]);
  preguntasCache = null;
  res.json({ ok: true });
});

app.post('/admin/preguntas', requireAuth, async (req, res) => {
  if (!puedeGestionarPreguntas(req.admin)) return res.status(403).json({ ok: false, error: 'Sin acceso' });
  const { numero, texto } = req.body;
  const r = await pool.query(
    'INSERT INTO preguntas (numero,texto,orden) VALUES ($1,$2,$3) RETURNING id',
    [numero, texto, numero]);
  preguntasCache = null;
  res.json({ ok: true, id: r.rows[0].id });
});

app.delete('/admin/preguntas/:id', requireAuth, async (req, res) => {
  if (!puedeGestionarPreguntas(req.admin)) return res.status(403).json({ ok: false, error: 'Sin acceso' });
  await pool.query('UPDATE preguntas SET activa=FALSE WHERE id=$1', [req.params.id]);
  preguntasCache = null;
  res.json({ ok: true });
});

// ── POST /guardar ─────────────────────────────────────────────────────────────
app.post('/guardar', async (req, res) => {
  try {
    const { comisaria, unidad, nombres, cip, dni, fecha_nac, edad, cargo, area, grado, sexo, armamento, foto, respuestas, completada, tiempo_segundos } = req.body;
    if (!nombres || !cip) return res.json({ ok: false, error: 'Faltan datos obligatorios' });
    const edadFinal = parseInt(edad) || calcularEdadDesdeISO(fecha_nac) || 0;
    const totalResp = contarRespuestasObj(respuestas).total;

    // No crear fila vacía en evaluaciones: el avance vive en progresos hasta Finalizar y Enviar
    if (!completada && totalResp === 0) {
      return res.json({ ok: true, totalResp: 0, soloProgreso: true });
    }

    const armamentoStr = Array.isArray(armamento) ? armamento.join(', ') : (armamento || '');

    const exist = await pool.query(
      'SELECT id, completada FROM evaluaciones WHERE UPPER(TRIM(cip))=UPPER(TRIM($1)) ORDER BY fecha DESC LIMIT 1',
      [cip]
    );

    if (!exist.rows.length) {
      const sesionProgreso = await pool.query(
        `SELECT 1 FROM progresos
         WHERE LOWER(TRIM(clave))=LOWER(TRIM($1)) OR UPPER(TRIM(cip))=UPPER(TRIM($1))
         LIMIT 1`,
        [cip]
      );
      if (!sesionProgreso.rows.length) {
        const dupDni = await buscarRegistroDuplicadoPorDni(dni, cip);
        if (dupDni) {
          return res.json({
            ok: false,
            error: 'duplicado_dni',
            cip_existente: dupDni.cip,
            nombres_existente: dupDni.nombres
          });
        }
        const dupNombre = await buscarRegistroDuplicadoPorNombre(nombres, cip);
        if (dupNombre) {
          return res.json({
            ok: false,
            error: 'duplicado_nombre',
            cip_existente: dupNombre.cip,
            nombres_existente: dupNombre.nombres
          });
        }
      }
    }

    const tiempoFinal = Math.max(0, parseInt(tiempo_segundos, 10) || 0);

    if (exist.rows.length) {
      await pool.query(
        `UPDATE evaluaciones SET comisaria=$1, unidad=$2, nombres=$3, dni=$4, fecha_nac=$5, edad=$6,
         cargo=$7, foto=COALESCE(NULLIF($8,''), foto), respuestas=$9, completada=$10, bloque_max=$11,
         sexo=$12, armamento=$13, grado=$14, area=$15, tiempo_segundos=$16, fecha=NOW() WHERE id=$17`,
        [comisaria || '', unidad || '', nombres || '', dni || '', fecha_nac || null,
         edadFinal, cargo || '', foto || '', respuestas || {}, !!completada, totalResp,
         sexo || '', armamentoStr, grado || '', area || '', tiempoFinal, exist.rows[0].id]
      );
    } else {
      await pool.query(
        `INSERT INTO evaluaciones (comisaria,unidad,nombres,cip,dni,fecha_nac,edad,cargo,sexo,armamento,foto,grado,area,respuestas,completada,bloque_max,tiempo_segundos)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [comisaria || '', unidad || '', nombres || '', cip || '', dni || '',
         fecha_nac || null, edadFinal, cargo || '', sexo || '', armamentoStr,
         foto || '', grado || '', area || '', respuestas || {}, !!completada, totalResp, tiempoFinal]
      );
    }

    if (completada) {
      await pool.query(
        'DELETE FROM progresos WHERE LOWER(TRIM(clave))=LOWER(TRIM($1)) OR UPPER(TRIM(cip))=UPPER(TRIM($1))',
        [cip]
      );
    }

    res.json({ ok: true, totalResp });
  } catch (e) {
    console.error('Error /guardar:', e.message);
    res.json({ ok: false, error: e.message });
  }
});

// ── POST /progreso (guardar bloque parcial) ────────────────────────────────────
app.post('/progreso', async (req, res) => {
  try {
    const { cip, nombres, comisaria, unidad, cargo, area, grado, sexo, armamento, foto, bloque, total, respuestas, dni, fecha_nac, edad, tiempo_segundos } = req.body;
    const clave = (cip || 'anonimo').toLowerCase().trim();
    const cipTrim = String(cip || '').trim();
    // Solo validar nombre en registro nuevo; quien ya tiene sesión con su CIP sigue igual
    const sesionCip = await pool.query(
      `SELECT 1 FROM progresos
       WHERE LOWER(TRIM(clave))=LOWER(TRIM($1)) OR UPPER(TRIM(cip))=UPPER(TRIM($1))
       UNION ALL
       SELECT 1 FROM evaluaciones WHERE UPPER(TRIM(cip))=UPPER(TRIM($1))
       LIMIT 1`,
      [cipTrim]
    );
    if (!sesionCip.rows.length) {
      const dupDni = await buscarRegistroDuplicadoPorDni(dni, cipTrim);
      if (dupDni) {
        return res.json({
          ok: false,
          error: 'duplicado_dni',
          cip_existente: dupDni.cip,
          nombres_existente: dupDni.nombres
        });
      }
      const dupNombre = await buscarRegistroDuplicadoPorNombre(nombres, cip);
      if (dupNombre) {
        return res.json({
          ok: false,
          error: 'duplicado_nombre',
          cip_existente: dupNombre.cip,
          nombres_existente: dupNombre.nombres
        });
      }
    }
    const armamentoStr = Array.isArray(armamento) ? armamento.join(', ') : (armamento || '');
    const totalCalc = contarRespuestasObj(respuestas).total;
    const tiempoFinal = Math.max(0, parseInt(tiempo_segundos, 10) || 0);
    const totalFinal = Math.max(parseInt(total, 10) || 0, totalCalc);
    const edadFinal = parseInt(edad, 10) || calcularEdadDesdeISO(fecha_nac) || null;
    const merged = await mergeRespuestasEnProgreso(clave, respuestas, bloque);
    const totalGuardar = Math.max(totalFinal, merged.total);
    const bloqueGuardar = merged.bloque_max;
    await pool.query(
      `INSERT INTO progresos (clave,cip,nombres,comisaria,unidad,bloque_max,total_resp,respuestas,tiempo_segundos,actualizado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
       ON CONFLICT (clave) DO UPDATE SET
         nombres=$3, comisaria=$4, unidad=$5, bloque_max=$6,
         total_resp=$7, respuestas=$8, tiempo_segundos=$9, actualizado=NOW()`,
      [clave, cip||'', nombres||'', comisaria||'', unidad||'', bloqueGuardar, totalGuardar, merged.respuestas, tiempoFinal]
    );
    await pool.query(
      `UPDATE progresos SET cargo=$2, sexo=$3, armamento=$4,
         foto=COALESCE(NULLIF($5,''),foto), grado=COALESCE(NULLIF($6,''),grado),
         dni=COALESCE(NULLIF($7,''),dni), fecha_nac=COALESCE($8,fecha_nac), edad=COALESCE($9,edad),
         area=COALESCE(NULLIF($10,''),area), tiempo_segundos=$11
       WHERE clave=$1`,
      [clave, cargo||'', sexo||'', armamentoStr, foto||'', grado||'', dni||'', fecha_nac || null, edadFinal, area||'', tiempoFinal]
    ).catch(()=>{});
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── GET /verificar-registro?cip=&dni= — sesión ya iniciada (público) ─────────
app.get('/verificar-registro', async (req, res) => {
  try {
    const cip = (req.query.cip || '').trim();
    const dni = (req.query.dni || '').trim();
    const nombres = (req.query.nombres || '').trim();
    if (!cip && !dni) return res.json({ ok: false, error: 'CIP requerido' });

    function filaVerificacion(row, fuente, completada) {
      const total = Math.max(
        parseInt(row.total_resp, 10) || 0,
        contarRespuestasObj(row.respuestas).total
      );
      const cipRow = (row.cip || '').trim();
      const conflictoDni = !!(dni && row.dni && String(row.dni).trim() === String(dni).trim()
        && cip && cipRow && cipRow.toUpperCase() !== cip.toUpperCase());
      return {
        ok: true,
        registrado: true,
        fuente: fuente,
        cip: row.cip,
        nombres: row.nombres || '',
        dni: row.dni || '',
        total: total,
        completada: !!completada,
        conflicto_dni: conflictoDni
      };
    }

    if (cip) {
      const progCip = await pool.query(
        `SELECT cip, nombres, dni, bloque_max, COALESCE(total_resp, 0) AS total_resp, respuestas
         FROM progresos
         WHERE UPPER(TRIM(cip)) = UPPER(TRIM($1)) OR LOWER(TRIM(clave)) = LOWER(TRIM($1))
         ORDER BY actualizado DESC LIMIT 1`,
        [cip]
      );
      if (progCip.rows.length) {
        return res.json(filaVerificacion(progCip.rows[0], 'progreso', false));
      }

      const evCip = await pool.query(
        `SELECT id, cip, nombres, dni, completada, respuestas,
                ${sqlContarRespuestas('respuestas')} AS total_resp
         FROM evaluaciones
         WHERE UPPER(TRIM(cip)) = UPPER(TRIM($1))
         ORDER BY fecha DESC LIMIT 1`,
        [cip]
      );
      if (evCip.rows.length) {
        const row = evCip.rows[0];
        return res.json(filaVerificacion(row, 'evaluacion', row.completada));
      }
    }

    if (dni) {
      const progDni = await pool.query(
        `SELECT cip, nombres, dni, bloque_max, COALESCE(total_resp, 0) AS total_resp, respuestas
         FROM progresos
         WHERE TRIM(dni) = TRIM($1)
         ORDER BY actualizado DESC LIMIT 1`,
        [dni]
      );
      if (progDni.rows.length) {
        const out = filaVerificacion(progDni.rows[0], 'progreso', false);
        out.conflicto_dni = true;
        return res.json(out);
      }

      const evDni = await pool.query(
        `SELECT id, cip, nombres, dni, completada, respuestas,
                ${sqlContarRespuestas('respuestas')} AS total_resp
         FROM evaluaciones
         WHERE TRIM(dni) = TRIM($1)
         ORDER BY fecha DESC LIMIT 1`,
        [dni]
      );
      if (evDni.rows.length) {
        const row = evDni.rows[0];
        const out = filaVerificacion(row, 'evaluacion', row.completada);
        out.conflicto_dni = true;
        return res.json(out);
      }
    }

    if (nombres) {
      const dupNombre = await buscarRegistroDuplicadoPorNombre(nombres, cip);
      if (dupNombre) {
        return res.json({
          ok: true,
          registrado: true,
          duplicado_por_nombre: true,
          fuente: dupNombre.fuente,
          cip: dupNombre.cip,
          nombres: dupNombre.nombres || '',
          completada: dupNombre.fuente === 'evaluacion'
        });
      }
    }

    res.json({ ok: true, registrado: false });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── GET /progreso?cip= ────────────────────────────────────────────────────────
app.get('/progreso', async (req, res) => {
  try {
    const clave = (req.query.cip || req.query.email || '').toLowerCase().trim();
    if (!clave) return res.json({ ok: false, error: 'CIP requerido' });
    const r = await pool.query('SELECT * FROM progresos WHERE clave=$1', [clave]);
    if (!r.rows.length) return res.json({ ok: true, encontrado: false });
    const row = r.rows[0];
    const totalCalc = Math.max(
      parseInt(row.total_resp, 10) || 0,
      contarRespuestasObj(row.respuestas).total
    );
    let fechaNac = '';
    if (row.fecha_nac) {
      const f = new Date(row.fecha_nac);
      if (!isNaN(f.getTime())) {
        fechaNac = f.getFullYear() + '-' + String(f.getMonth() + 1).padStart(2, '0') + '-' + String(f.getDate()).padStart(2, '0');
      }
    }
    res.json({
      ok: true, encontrado: true,
      cip: row.cip, nombres: row.nombres, comisaria: row.comisaria, unidad: row.unidad,
      grado: row.grado || '', cargo: row.cargo || '', area: row.area || '', sexo: row.sexo || '',
      dni: row.dni || '', edad: resolverEdadFila(row), fecha_nac: fechaNac,
      armamento: row.armamento || '', foto: row.foto || '',
      bloque: row.bloque_max, total: totalCalc, respuestas: row.respuestas,
      tiempo_segundos: Math.max(0, parseInt(row.tiempo_segundos, 10) || 0),
      ultima: new Date(row.actualizado).toLocaleString('es-PE')
    });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── GET /admin/avances (progresos parciales en curso) ───────────────────────────
app.get('/admin/avances', requireAuth, async (req, res) => {
  try {
    const { comisaria, unidad } = req.query;
    if (!comisaria && !unidad) {
      return res.json({ ok: false, error: 'comisaria o unidad requerido' });
    }
    let where = `WHERE COALESCE(total_resp, 0) > 0
      AND NOT EXISTS (
        SELECT 1 FROM evaluaciones e
        WHERE UPPER(TRIM(e.cip)) = UPPER(TRIM(progresos.cip)) AND e.completada = TRUE
      )`;
    const params = [];
    if (comisaria) {
      params.push('%' + String(comisaria).toUpperCase() + '%');
      where += ` AND (UPPER(comisaria) LIKE $${params.length} OR UPPER(unidad) LIKE $${params.length})`;
    } else {
      params.push('%' + String(unidad).toUpperCase() + '%');
      where += ` AND (UPPER(unidad) LIKE $${params.length} OR UPPER(comisaria) LIKE $${params.length})`;
    }
    const r = await pool.query(
      `SELECT cip, nombres, comisaria, unidad, bloque_max AS bloque,
              COALESCE(total_resp, 0) AS total,
              ${sqlFechaTxt('actualizado')} AS ultima,
              ${sqlFechaIso('actualizado')} AS ultima_iso
       FROM progresos ${where} ORDER BY actualizado DESC`,
      params
    );
    res.json({ ok: true, rows: r.rows });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

function contarRespuestasObj(respuestas) {
  let r = respuestas || {};
  if (typeof r === 'string') {
    try { r = JSON.parse(r); } catch (e) { r = {}; }
  }
  if (!r || typeof r !== 'object' || Array.isArray(r)) r = {};
  const vals = Object.keys(r).filter(function(k) { return r[k] === 'V' || r[k] === 'F'; });
  return {
    total: vals.length,
    v: vals.filter(function(k) { return r[k] === 'V'; }).length,
    f: vals.filter(function(k) { return r[k] === 'F'; }).length,
    respuestas: r
  };
}

async function mergeRespuestasEnProgreso(clave, nuevas, bloque) {
  const cur = await pool.query(
    'SELECT respuestas, bloque_max FROM progresos WHERE clave=$1', [clave]
  );
  let exist = {};
  let bloquePrev = 0;
  if (cur.rows.length) {
    exist = contarRespuestasObj(cur.rows[0].respuestas).respuestas;
    bloquePrev = parseInt(cur.rows[0].bloque_max, 10) || 0;
  }
  const nuevasNorm = contarRespuestasObj(nuevas).respuestas;
  const merged = Object.assign({}, exist, nuevasNorm);
  const stats = contarRespuestasObj(merged);
  return {
    respuestas: stats.respuestas,
    total: stats.total,
    bloque_max: Math.max(bloquePrev, parseInt(bloque, 10) || 0)
  };
}

async function cargarAvancePorCip(cip, admin) {
  const prog = await obtenerProgresoParaPDF(cip, admin);
  let evEval = null;
  try {
    evEval = await cargarEvaluacionAdmin({ cip }, admin);
  } catch (e) { /* ignorar */ }
  if (evEval && evaluacionEstaCompleta(evEval)) return null;
  const totalP = prog ? contarRespuestas(prog).total : 0;
  const totalE = evEval ? contarRespuestas(evEval).total : 0;
  if (totalP >= totalE && prog) return prog;
  if (evEval) return evEval;
  return prog;
}

async function obtenerProgresoPorCip(cip) {
  if (!cip) return null;
  const r = await pool.query(
    `SELECT * FROM progresos
     WHERE UPPER(TRIM(cip))=UPPER(TRIM($1)) OR LOWER(TRIM(clave))=LOWER(TRIM($1))
     LIMIT 1`,
    [cip]
  );
  return r.rows[0] || null;
}

async function fusionarProgresoEnEvaluacion(ev) {
  if (!ev || ev.completada) return ev;
  const prog = await obtenerProgresoPorCip(ev.cip);
  if (!prog) return ev;
  const statsE = contarRespuestasObj(ev.respuestas);
  const statsP = contarRespuestasObj(prog.respuestas);
  const totalP = parseInt(prog.total_resp, 10) || statsP.total;
  const totalE = statsE.total;
  if (totalP > totalE) {
    return Object.assign({}, ev, {
      respuestas: prog.respuestas || statsP.respuestas,
      bloque_max: prog.bloque_max || ev.bloque_max,
      total_resp: totalP,
      grado: prog.grado || ev.grado,
      cargo: prog.cargo || ev.cargo,
      area: prog.area || ev.area,
      sexo: prog.sexo || ev.sexo,
      armamento: prog.armamento || ev.armamento,
      foto: prog.foto || ev.foto,
      tiempo_segundos: prog.tiempo_segundos != null ? prog.tiempo_segundos : ev.tiempo_segundos
    });
  }
  return ev;
}

async function fusionarFilaListadoEval(row) {
  if (row.completada) return row;
  const prog = await obtenerProgresoPorCip(row.cip);
  if (!prog) return row;
  const totalP = parseInt(prog.total_resp, 10) || contarRespuestasObj(prog.respuestas).total;
  const totalE = parseInt(row.total_resp, 10) || contarRespuestasObj(row.respuestas).total;
  if (totalP > totalE) {
    return Object.assign({}, row, {
      total_resp: totalP,
      solo_progreso: true,
      edad: resolverEdadFila(prog) || resolverEdadFila(row),
      fecha_nac: prog.fecha_nac || row.fecha_nac
    });
  }
  return row;
}

// ── Helper: formato evaluación desde progreso (PDF / listados) ────────────────
function mapearProgresoParaPDF(p) {
  let resp = p.respuestas || {};
  if (typeof resp === 'string') {
    try { resp = JSON.parse(resp); } catch (e) { resp = {}; }
  }
  const statsMerged = contarRespuestasObj(p.respuestas);
  const totalDb = p.total_resp != null ? parseInt(p.total_resp, 10) : 0;
  const totalResp = Math.max(totalDb || 0, statsMerged.total);
  return {
    id: null,
    cip: p.cip || '',
    nombres: p.nombres || '',
    dni: p.dni || '',
    comisaria: p.comisaria || '',
    unidad: p.unidad || '',
    area: p.area || '',
    grado: p.grado || '',
    cargo: p.cargo || '',
    sexo: p.sexo || '',
    armamento: p.armamento || '',
    foto: p.foto || '',
    edad: resolverEdadFila(p),
    bloque_max: p.bloque_max || 0,
    completada: false,
    respuestas: statsMerged.respuestas,
    fecha: p.fecha || (p.actualizado
      ? new Date(p.actualizado).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '—'),
    total_resp: totalResp,
    tiempo_segundos: Math.max(0, parseInt(p.tiempo_segundos, 10) || 0)
  };
}

async function obtenerProgresoParaPDF(cip, admin) {
  const r = await pool.query(
    `SELECT p.*, TO_CHAR(p.actualizado,'DD/MM/YYYY HH24:MI') AS fecha,
            COALESCE(p.total_resp, 0) AS total_resp
     FROM progresos p
     WHERE UPPER(TRIM(p.cip))=UPPER(TRIM($1)) OR LOWER(TRIM(p.clave))=LOWER(TRIM($1))
     LIMIT 1`,
    [cip]
  );
  if (!r.rows.length) return null;
  const ev = mapearProgresoParaPDF(r.rows[0]);
  if (!ev || (!ev.total_resp && !ev.nombres)) return null;
  if (debeFiltrarPorUnidadAsignada(admin)) {
    const u = (admin.unidad || '').toUpperCase();
    const uni = (ev.unidad || '').toUpperCase();
    const com = (ev.comisaria || '').toUpperCase();
    if (!uni.includes(u) && !com.includes(u)) return null;
  }
  return ev;
}

async function consultarProgresosFiltrados(admin, query) {
  let where = `WHERE ${sqlProgresoConRespuestas('p')}
    AND NOT EXISTS (
      SELECT 1 FROM evaluaciones e
      WHERE UPPER(TRIM(e.cip)) = UPPER(TRIM(p.cip)) AND e.completada = TRUE
    )`;
  const params = [];
  let pi = 1;

  if (debeFiltrarPorUnidadAsignada(admin)) {
    where += ` AND (UPPER(p.unidad) LIKE $${pi} OR UPPER(p.comisaria) LIKE $${pi})`;
    params.push('%' + admin.unidad.toUpperCase() + '%');
    pi++;
  }

  const division  = ((query.division  || '') + '').toUpperCase();
  const comisaria = ((query.comisaria || '') + '').toUpperCase();
  const unidad    = ((query.unidad    || '') + '').toUpperCase();
  const busqueda  = ((query.busqueda  || '') + '').toUpperCase();

  if (division && division !== 'TODAS') {
    const du = await pool.query(
      `SELECT UPPER(u.nombre) AS nombre FROM unidades_pol u JOIN divisiones d ON d.id=u.division_id WHERE UPPER(d.nombre)=$1`,
      [division]
    );
    if (du.rows.length) {
      const arr = du.rows.map(function(row) { return row.nombre; });
      where += ` AND (UPPER(p.comisaria) = ANY($${pi}::text[]) OR UPPER(p.unidad) = ANY($${pi}::text[]))`;
      params.push(arr); pi++;
    } else {
      where += ' AND 1=0';
    }
  }
  if (comisaria) {
    where += ` AND (UPPER(p.comisaria) LIKE $${pi} OR UPPER(p.unidad) LIKE $${pi})`;
    params.push('%' + comisaria + '%'); pi++;
  }
  if (unidad) {
    where += ` AND (UPPER(p.unidad) LIKE $${pi} OR UPPER(p.comisaria) LIKE $${pi})`;
    params.push('%' + unidad + '%'); pi++;
  }
  if (busqueda) {
    where += ` AND (UPPER(p.nombres) LIKE $${pi} OR UPPER(p.cip) LIKE $${pi + 1})`;
    params.push('%' + busqueda + '%', '%' + busqueda + '%');
  }

  return { where, params };
}

// ── Helper: progresos guardados sin enviar ─────────────────────────────────────
async function consultarProgresosPendientes(admin, query) {
  const { where, params } = await consultarProgresosFiltrados(admin, query);
  const r = await pool.query(
    `SELECT NULL::INTEGER AS id, p.cip, p.nombres, COALESCE(p.dni,'') AS dni, p.comisaria, p.unidad,
            p.bloque_max, p.fecha_nac, p.edad,
            GREATEST(COALESCE(p.total_resp, 0), ${sqlContarRespuestas('p.respuestas')}) AS total_resp,
            FALSE AS completada, TRUE AS solo_progreso,
            ${sqlFechaTxt('p.actualizado')} AS fecha,
            ${sqlFechaIso('p.actualizado')} AS fecha_iso
     FROM progresos p ${where}
     ORDER BY p.actualizado DESC LIMIT 200`,
    params
  );
  return r.rows.map(enriquecerFilaEdad);
}

async function consultarProgresosParaPDFGrupo(admin, query) {
  const { where, params } = await consultarProgresosFiltrados(admin, query);
  const r = await pool.query(
    `SELECT p.*, TO_CHAR(p.actualizado,'DD/MM/YYYY HH24:MI') AS fecha,
            COALESCE(p.total_resp, 0) AS total_resp
     FROM progresos p ${where}
     ORDER BY p.comisaria, p.nombres`,
    params
  );
  return r.rows.map(mapearProgresoParaPDF);
}

// ── GET /admin/progresos-pendientes (guardados pero no enviados) ────────────────
app.get('/admin/progresos-pendientes', requireAuth, async (req, res) => {
  try {
    const rows = await consultarProgresosPendientes(req.admin, req.query);
    res.json({ ok: true, rows });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── GET /admin/registro-cip?cip= — diagnóstico por CIP ────────────────────────
app.get('/admin/registro-cip', requireAuth, async (req, res) => {
  try {
    const cip = (req.query.cip || '').trim();
    if (!cip) return res.json({ ok: false, error: 'CIP requerido' });

    const evalR = await pool.query(
      `SELECT id, ${sqlFechaTxt('fecha')} AS fecha, ${sqlFechaIso('fecha')} AS fecha_iso,
              comisaria, unidad, nombres, cip, dni,
              completada, bloque_max,
              ${sqlContarRespuestas('respuestas')} AS total_resp
       FROM evaluaciones
       WHERE UPPER(TRIM(cip))=UPPER(TRIM($1)) OR TRIM(dni)=TRIM($1)
       ORDER BY evaluaciones.fecha DESC`,
      [cip]
    );
    const progR = await pool.query(
      `SELECT cip, nombres, comisaria, unidad, bloque_max,
              ${sqlContarRespuestas('respuestas')} AS total_resp,
              ${sqlFechaTxt('actualizado')} AS fecha,
              ${sqlFechaIso('actualizado')} AS fecha_iso
       FROM progresos WHERE UPPER(TRIM(cip))=UPPER(TRIM($1)) OR LOWER(TRIM(clave))=LOWER(TRIM($1))`,
      [cip]
    );

    const prog = progR.rows[0] || null;
    const evals = evalR.rows;
    let diagnostico = '';
    if (!evals.length && !prog) {
      diagnostico = 'No hay ningún registro con este CIP.';
    } else if (prog && !evals.some(function(e) { return e.completada; })) {
      diagnostico = 'El efectivo guardó ' + prog.total_resp + '/566 respuestas pero NO pulsó "Finalizar y Enviar". Los datos están en progreso guardado.';
    } else if (evals.length && evals[0].completada) {
      diagnostico = 'Evaluación enviada correctamente (' + evals[0].total_resp + '/566).';
    } else if (evals.length) {
      diagnostico = 'Hay registro parcial en evaluaciones (' + evals[0].total_resp + '/566), sin marcar como completo.';
    }

    res.json({ ok: true, cip, evaluaciones: evals, progreso: prog, diagnostico });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── GET /stats ─────────────────────────────────────────────────────────────────
app.get('/stats', requireAuth, async (req, res) => {
  try {
    const cacheKey = (req.admin.rol || '') + '|' + (req.admin.unidad || '');
    if (statsCache && statsCacheKey === cacheKey && statsCacheExp > Date.now()) {
      return res.json(statsCache);
    }

    let whereAdmin = '';
    const params = [];
    if (debeFiltrarPorUnidadAsignada(req.admin)) {
      whereAdmin = 'WHERE (UPPER(unidad) LIKE $1 OR UPPER(comisaria) LIKE $1)';
      params.push('%' + req.admin.unidad.toUpperCase() + '%');
    }
    const total    = await pool.query(`SELECT COUNT(*) AS t FROM evaluaciones ${whereAdmin}`, params);
    const completas= await pool.query(`SELECT COUNT(*) AS t FROM evaluaciones ${whereAdmin} ${whereAdmin?'AND':'WHERE'} completada=TRUE`, params);
    const porComis = await pool.query(
      `SELECT comisaria AS nombre, COUNT(*) AS total FROM evaluaciones ${whereAdmin} GROUP BY comisaria ORDER BY comisaria`, params);
    const porUnidad= await pool.query(
      `SELECT unidad AS nombre, COUNT(*) AS total FROM evaluaciones ${whereAdmin} GROUP BY unidad ORDER BY unidad`, params);

    let progWhere = `WHERE ${sqlProgresoConRespuestas('p')} `
      + 'AND NOT EXISTS ('
      + 'SELECT 1 FROM evaluaciones e '
      + 'WHERE UPPER(TRIM(e.cip)) = UPPER(TRIM(p.cip)) AND e.completada = TRUE'
      + ')';
    const progParams = [];
    if (debeFiltrarPorUnidadAsignada(req.admin)) {
      progWhere += ' AND (UPPER(p.unidad) LIKE $1 OR UPPER(p.comisaria) LIKE $1)';
      progParams.push('%' + req.admin.unidad.toUpperCase() + '%');
    }

    const ultimas  = await pool.query(
      `SELECT id, cip, ${sqlFechaTxt('fecha')} AS fecha, ${sqlFechaIso('fecha')} AS fecha_iso,
              comisaria, unidad, nombres, completada,
              ${sqlContarRespuestas('respuestas')} AS total_resp,
              FALSE AS solo_progreso
       FROM evaluaciones ${whereAdmin} ORDER BY fecha DESC LIMIT 10`, params);

    const ultimasProgR = await pool.query(
      `SELECT NULL::int AS id, p.cip, ${sqlFechaTxt('p.actualizado')} AS fecha,
              ${sqlFechaIso('p.actualizado')} AS fecha_iso,
              p.comisaria, p.unidad, p.nombres, FALSE AS completada, TRUE AS solo_progreso,
              COALESCE(p.total_resp, 0) AS total_resp
       FROM progresos p ${progWhere}
       ORDER BY p.actualizado DESC LIMIT 10`,
      progParams
    );

    const ultimasMerged = ultimas.rows.concat(ultimasProgR.rows)
      .sort(function(a, b) {
        const fa = (a.fecha || '').split(/[/ :]/).reverse().join('');
        const fb = (b.fecha || '').split(/[/ :]/).reverse().join('');
        return fb.localeCompare(fa);
      })
      .slice(0, 10);

    const porDivision = await pool.query(
      `SELECT d.nombre, d.orden, COUNT(e.id)::int AS total
       FROM divisiones d
       LEFT JOIN unidades_pol u ON u.division_id = d.id
       LEFT JOIN evaluaciones e ON (
         UPPER(TRIM(e.unidad)) = UPPER(TRIM(u.nombre))
         OR UPPER(TRIM(e.comisaria)) = UPPER(TRIM(u.nombre))
       )
       GROUP BY d.id, d.nombre, d.orden
       ORDER BY d.orden`, params.length ? [] : []);

    const enCursoR = await pool.query(
      `SELECT COUNT(*)::int AS t FROM progresos p ${progWhere}`, progParams
    );

    const payload = {
      ok: true,
      totalEvaluaciones: parseInt(total.rows[0].t),
      totalCompletas:    parseInt(completas.rows[0].t),
      totalEnCurso:      parseInt(enCursoR.rows[0].t),
      porComisaria:      porComis.rows,
      porUnidad:         porUnidad.rows,
      porDivision:       porDivision.rows,
      ultimasEvaluaciones: ultimasMerged
    };
    statsCache = payload;
    statsCacheKey = cacheKey;
    statsCacheExp = Date.now() + STATS_CACHE_MS;
    res.json(payload);
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── GET /admin/stats-sistema — resumen general (solo Super Admin) ───────────────
app.get('/admin/stats-sistema', requireAuth, async (req, res) => {
  try {
    if (req.admin.rol !== 'unitic') {
      return res.status(403).json({ ok: false, error: 'Solo Super Admin' });
    }

    const adminsR = await pool.query('SELECT COUNT(*)::int AS t FROM admins');
    const divsR   = await pool.query('SELECT COUNT(*)::int AS t FROM divisiones');
    const unisR   = await pool.query('SELECT COUNT(*)::int AS t FROM unidades_pol');
    const evalTot = await pool.query('SELECT COUNT(*)::int AS t FROM evaluaciones');
    const evalComp = await pool.query('SELECT COUNT(*)::int AS t FROM evaluaciones WHERE completada=TRUE');
    const progWhere = `WHERE ${sqlProgresoConRespuestas('p')} AND NOT EXISTS (
      SELECT 1 FROM evaluaciones e WHERE UPPER(TRIM(e.cip))=UPPER(TRIM(p.cip)) AND e.completada=TRUE)`;
    const progR   = await pool.query(`SELECT COUNT(*)::int AS t FROM progresos p ${progWhere}`);

    const convItems = await pool.query(
      `SELECT COUNT(*)::int AS convocatorias,
        SUM(CASE WHEN inscripciones_abiertas THEN 1 ELSE 0 END)::int AS abiertas
       FROM items_portal WHERE tipo='convenio' AND visible=TRUE`);
    const cursoItems = await pool.query(
      `SELECT COUNT(*)::int AS convocatorias,
        SUM(CASE WHEN inscripciones_abiertas THEN 1 ELSE 0 END)::int AS abiertas
       FROM items_portal WHERE tipo='curso'`);
    const inscConv = await pool.query(
      `SELECT COUNT(n.id)::int AS total,
        SUM(CASE WHEN n.estado='pendiente' THEN 1 ELSE 0 END)::int AS pendientes,
        SUM(CASE WHEN n.estado='ganador' THEN 1 ELSE 0 END)::int AS ganadores
       FROM inscripciones n JOIN items_portal i ON i.id=n.item_id WHERE i.tipo='convenio'`);
    const inscCurso = await pool.query(
      `SELECT COUNT(n.id)::int AS total,
        SUM(CASE WHEN n.estado='pendiente' THEN 1 ELSE 0 END)::int AS pendientes,
        SUM(CASE WHEN n.estado='ganador' THEN 1 ELSE 0 END)::int AS ganadores
       FROM inscripciones n JOIN items_portal i ON i.id=n.item_id WHERE i.tipo='curso'`);
    const sorteosR = await pool.query(
      `SELECT COUNT(*)::int AS publicados FROM sorteos_portal WHERE publicado=TRUE`);
    const cmsR = await pool.query(
      'SELECT updated_at, data_json FROM portal_configuracion WHERE id=1');

    let portalActualizacion = '—';
    let novedadesCount = 0;
    if (cmsR.rows.length && cmsR.rows[0].data_json) {
      try {
        const cms = typeof cmsR.rows[0].data_json === 'string'
          ? JSON.parse(cmsR.rows[0].data_json) : cmsR.rows[0].data_json;
        portalActualizacion = cms.actualizacion || new Date(cmsR.rows[0].updated_at).toLocaleDateString('es-PE');
        novedadesCount = (cms.novedades || []).length;
      } catch (e) { /* ignorar */ }
    }

    const ultEvalR = await pool.query(
      `SELECT 'evaluacion' AS tipo, nombres AS titulo,
        COALESCE(unidad, comisaria, '') AS detalle,
        ${sqlFechaTxt('fecha')} AS fecha,
        ${sqlFechaIso('fecha')} AS fecha_iso,
        completada::text AS estado
       FROM evaluaciones ORDER BY fecha DESC LIMIT 6`);
    const ultInscR = await pool.query(
      `SELECT 'inscripcion' AS tipo, n.nombres AS titulo, i.titulo AS detalle,
        TO_CHAR(n.fecha,'DD/MM/YYYY HH24:MI') AS fecha, n.estado
       FROM inscripciones n JOIN items_portal i ON i.id=n.item_id
       ORDER BY n.fecha DESC LIMIT 6`);

    const actividad = ultEvalR.rows.concat(ultInscR.rows)
      .sort(function(a, b) {
        const fa = (a.fecha || '').split(/[/ :]/).reverse().join('');
        const fb = (b.fecha || '').split(/[/ :]/).reverse().join('');
        return fb.localeCompare(fa);
      })
      .slice(0, 10);

    res.json({
      ok: true,
      resumen: {
        admins: adminsR.rows[0].t,
        divisiones: divsR.rows[0].t,
        unidades: unisR.rows[0].t,
        evaluaciones_total: evalTot.rows[0].t,
        evaluaciones_completas: evalComp.rows[0].t,
        evaluaciones_en_curso: progR.rows[0].t,
        convenios_convocatorias: convItems.rows[0].convocatorias || 0,
        convenios_inscripciones_abiertas: convItems.rows[0].abiertas || 0,
        convenios_inscritos: inscConv.rows[0].total || 0,
        convenios_pendientes: inscConv.rows[0].pendientes || 0,
        convenios_ganadores: inscConv.rows[0].ganadores || 0,
        cursos_convocatorias: cursoItems.rows[0].convocatorias || 0,
        cursos_inscripciones_abiertas: cursoItems.rows[0].abiertas || 0,
        cursos_inscritos: inscCurso.rows[0].total || 0,
        cursos_pendientes: inscCurso.rows[0].pendientes || 0,
        cursos_ganadores: inscCurso.rows[0].ganadores || 0,
        sorteos_publicados: sorteosR.rows[0].publicados || 0,
        portal_actualizacion: portalActualizacion,
        portal_novedades: novedadesCount,
        inscripciones_total: (inscConv.rows[0].total || 0) + (inscCurso.rows[0].total || 0)
      },
      actividad
    });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── GET /listar ────────────────────────────────────────────────────────────────
app.get('/listar', requireAuth, async (req, res) => {
  try {
    const comisEval = await pool.query('SELECT DISTINCT comisaria FROM evaluaciones WHERE comisaria!=\'\' ORDER BY comisaria');
    const comisPol  = await pool.query("SELECT nombre FROM unidades_pol WHERE tipo='comisaria' ORDER BY orden,nombre");
    const comisSet  = new Set([
      ...comisPol.rows.map(x => x.nombre),
      ...comisEval.rows.map(x => x.comisaria)
    ]);
    const unidsEval = await pool.query('SELECT DISTINCT unidad FROM evaluaciones WHERE unidad!=\'\' ORDER BY unidad');
    const unidsPol  = await pool.query("SELECT nombre FROM unidades_pol ORDER BY orden,nombre");
    const unidsSet  = new Set([
      ...unidsPol.rows.map(x => x.nombre),
      ...unidsEval.rows.map(x => x.unidad)
    ]);
    const total  = await pool.query('SELECT COUNT(*) AS t FROM evaluaciones');
    // Divisiones con sus unidades para los filtros
    const divsConUnidades = await obtenerDivisionesAgrupadas();
    const todasUnidades = [];
    divsConUnidades.forEach(function(div) {
      (div.unidades || []).forEach(function(u) { todasUnidades.push(u.nombre); });
    });
    res.json({
      ok: true,
      comisarias: [...todasUnidades].sort(),
      unidades:   [...todasUnidades].sort(),
      todasUnidades: todasUnidades,
      total:      parseInt(total.rows[0].t),
      divisiones: divsConUnidades
    });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── GET /evaluaciones (paginado) ───────────────────────────────────────────────
app.get('/evaluaciones', requireAuth, async (req, res) => {
  try {
    const pagina    = Math.max(1, parseInt(req.query.pagina) || 1);
    const porPagina = Math.min(1000, Math.max(1, parseInt(req.query.por_pagina, 10) || 20));
    const offset    = (pagina - 1) * porPagina;

    let baseWhere = 'WHERE 1=1', baseParams = [];
    if (debeFiltrarPorUnidadAsignada(req.admin)) {
      baseWhere += ' AND (UPPER(unidad) LIKE $1 OR UPPER(comisaria) LIKE $1)';
      baseParams.push('%' + req.admin.unidad.toUpperCase() + '%');
    }
    const { where, params, pi } = await buildWhere(req.query, baseWhere, baseParams);

    const countR  = await pool.query(`SELECT COUNT(*) AS t FROM evaluaciones ${where}`, params);
    const total   = parseInt(countR.rows[0].t);
    const paginas = Math.max(1, Math.ceil(total / porPagina));

    const rows = await pool.query(
      `SELECT id, ${sqlFechaTxt('fecha')} AS fecha, ${sqlFechaIso('fecha')} AS fecha_iso,
              comisaria, unidad,
              nombres, cip, dni, fecha_nac, edad, grado, completada, bloque_max,
              ${sqlContarRespuestas('respuestas')} AS total_resp,
              FALSE AS solo_progreso
       FROM evaluaciones ${where} ORDER BY fecha DESC LIMIT $${pi} OFFSET $${pi+1}`,
      [...params, porPagina, offset]
    );

    const rowsEnriquecidas = [];
    for (const row of rows.rows) {
      rowsEnriquecidas.push(enriquecerFilaEdad(await fusionarFilaListadoEval(row)));
    }

    // Incluir progresos no enviados (misma búsqueda / filtros)
    let progresosRows = [];
    if (pagina === 1 || (req.query.busqueda || '').trim()) {
      try {
        progresosRows = await consultarProgresosPendientes(req.admin, req.query);
      } catch (progErr) {
        console.error('Error consultando progresos:', progErr.message);
      }
    }

    const cipsEval = new Set(rowsEnriquecidas.map(function(r) { return (r.cip || '').toUpperCase(); }));
    const merged = rowsEnriquecidas.concat(
      progresosRows.filter(function(p) { return !cipsEval.has((p.cip || '').toUpperCase()); })
        .map(enriquecerFilaEdad)
    );

    res.json({ ok: true, rows: merged, total: total + progresosRows.length, pagina, paginas });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── PUT /admin/registro-datos — editar apellidos, nombres, DNI y unidad (Admin/Super Admin)
app.put('/admin/registro-datos', requireAuth, async (req, res) => {
  try {
    if (!puedeGestionarEvaluaciones(req.admin)) {
      return res.status(403).json({ ok: false, error: 'Sin permiso. Solo Admin o Super Admin.' });
    }

    const idParsed = req.body.id != null && req.body.id !== '' ? parseInt(req.body.id, 10) : null;
    const id = Number.isFinite(idParsed) ? idParsed : null;
    const cip = String(req.body.cip || '').trim();
    const soloProgreso = !!req.body.solo_progreso;
    const apellidos = String(req.body.apellidos || '').trim().toUpperCase();
    const nombresSolo = String(req.body.nombres || '').trim().toUpperCase();
    const dni = String(req.body.dni || '').trim();
    const unidad = String(req.body.unidad || req.body.comisaria || '').trim().toUpperCase();

    if (!apellidos) return res.json({ ok: false, error: 'Ingrese los apellidos' });
    if (!nombresSolo) return res.json({ ok: false, error: 'Ingrese los nombres' });
    if (!/^\d{8}$/.test(dni)) return res.json({ ok: false, error: 'El DNI debe tener 8 dígitos' });
    if (!unidad) return res.json({ ok: false, error: 'Seleccione la dependencia' });
    if (!id && !cip) return res.json({ ok: false, error: 'Registro no identificado' });

    const nombres = apellidos + ', ' + nombresSolo;

    let row = null;
    if (soloProgreso || !id) {
      if (!cip) return res.json({ ok: false, error: 'CIP requerido' });
      const cur = await pool.query(
        `SELECT cip, dni, nombres, unidad, comisaria FROM progresos
         WHERE UPPER(TRIM(cip))=UPPER(TRIM($1)) OR LOWER(TRIM(clave))=LOWER(TRIM($1))
         LIMIT 1`,
        [cip]
      );
      if (!cur.rows.length) return res.json({ ok: false, error: 'Avance no encontrado' });
      row = cur.rows[0];
    } else {
      const cur = await pool.query(
        'SELECT id, cip, dni, nombres, unidad, comisaria FROM evaluaciones WHERE id=$1',
        [id]
      );
      if (!cur.rows.length) return res.json({ ok: false, error: 'Evaluación no encontrada' });
      row = cur.rows[0];
    }

    if (!adminPuedeAccederRegistro(req.admin, row.unidad, row.comisaria)) {
      return res.status(403).json({ ok: false, error: 'Sin permiso para esta dependencia' });
    }
    if (!adminPuedeAccederRegistro(req.admin, unidad, unidad)) {
      return res.status(403).json({ ok: false, error: 'Sin permiso para asignar esa dependencia' });
    }

    const cipRef = String(row.cip || cip || '').trim();
    const dupDni = await buscarRegistroDuplicadoPorDni(dni, cipRef);
    if (dupDni) {
      return res.json({
        ok: false,
        error: 'El DNI ya está registrado en otro CIP (' + (dupDni.cip || '—') + ')'
      });
    }
    const dupNom = await buscarRegistroDuplicadoPorNombre(nombres, cipRef);
    if (dupNom) {
      return res.json({
        ok: false,
        error: 'Ese nombre ya está registrado en otro CIP (' + (dupNom.cip || '—') + ')'
      });
    }

    // Misma lógica que el cuestionario: comisaria y unidad reciben el mismo valor
    if (id && !soloProgreso) {
      await pool.query(
        `UPDATE evaluaciones SET nombres=$1, dni=$2, comisaria=$3, unidad=$4
         WHERE id=$5`,
        [nombres, dni, unidad, unidad, id]
      );
    }
    if (cipRef) {
      await pool.query(
        `UPDATE progresos SET nombres=$1, dni=$2, comisaria=$3, unidad=$4, actualizado=NOW()
         WHERE UPPER(TRIM(cip))=UPPER(TRIM($5)) OR LOWER(TRIM(clave))=LOWER(TRIM($5))`,
        [nombres, dni, unidad, unidad, cipRef]
      );
      // Si hay evaluación del mismo CIP (p. ej. se editó desde progreso), sincronizar también
      if (soloProgreso || !id) {
        await pool.query(
          `UPDATE evaluaciones SET nombres=$1, dni=$2, comisaria=$3, unidad=$4
           WHERE UPPER(TRIM(cip))=UPPER(TRIM($5))`,
          [nombres, dni, unidad, unidad, cipRef]
        );
      }
    }

    invalidarStatsCache();
    res.json({ ok: true, nombres, dni, unidad, comisaria: unidad });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── DELETE /admin/evaluaciones/:id — eliminar evaluación individual ─────────────
app.delete('/admin/evaluaciones/:id', requireAuth, async (req, res) => {
  try {
    if (!puedeGestionarEvaluaciones(req.admin)) {
      return res.status(403).json({ ok: false, error: 'Sin permiso' });
    }
    const cur = await pool.query(
      'SELECT id, cip, dni, unidad, comisaria FROM evaluaciones WHERE id=$1',
      [req.params.id]);
    if (!cur.rows.length) return res.json({ ok: false, error: 'No encontrado' });
    const row = cur.rows[0];
    if (!adminPuedeAccederRegistro(req.admin, row.unidad, row.comisaria)) {
      return res.status(403).json({ ok: false, error: 'Sin permiso para esta dependencia' });
    }
    await purgarRegistrosPersona(row.cip, row.dni);
    invalidarStatsCache();
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── DELETE /admin/progresos?cip= — eliminar avance guardado (sin enviar) ───────
app.delete('/admin/progresos', requireAuth, async (req, res) => {
  try {
    if (!puedeGestionarEvaluaciones(req.admin)) {
      return res.status(403).json({ ok: false, error: 'Sin permiso' });
    }
    const cip = (req.query.cip || '').trim();
    if (!cip) return res.json({ ok: false, error: 'CIP requerido' });
    const cur = await pool.query(
      `SELECT cip, dni, unidad, comisaria FROM progresos
       WHERE UPPER(TRIM(cip))=UPPER(TRIM($1)) OR LOWER(TRIM(clave))=LOWER(TRIM($1))
       LIMIT 1`,
      [cip]);
    if (!cur.rows.length) return res.json({ ok: false, error: 'No encontrado' });
    const row = cur.rows[0];
    if (!adminPuedeAccederRegistro(req.admin, row.unidad, row.comisaria)) {
      return res.status(403).json({ ok: false, error: 'Sin permiso para esta dependencia' });
    }
    await purgarRegistrosPersona(row.cip, row.dni);
    invalidarStatsCache();
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── DELETE /admin/evaluaciones-lote — por unidad/división o todos (Super Admin) ─
app.delete('/admin/evaluaciones-lote', requireAuth, async (req, res) => {
  try {
    if (!puedeGestionarEvaluaciones(req.admin)) {
      return res.status(403).json({ ok: false, error: 'Sin permiso' });
    }

    const todos = req.query.todos === 'true' || req.query.todos === '1';
    if (todos) {
      if (req.admin.rol !== 'unitic') {
        return res.status(403).json({ ok: false, error: 'Solo Super Admin' });
      }
      if ((req.query.confirmar || '') !== 'ELIMINAR') {
        return res.json({ ok: false, error: 'Confirme escribiendo ELIMINAR' });
      }
      const evR = await pool.query('DELETE FROM evaluaciones RETURNING id');
      const prR = await pool.query('DELETE FROM progresos RETURNING clave');
      invalidarStatsCache();
      return res.json({
        ok: true,
        eliminados_eval: evR.rowCount,
        eliminados_prog: prR.rowCount
      });
    }

    const unidad = (req.query.unidad || '').trim();
    const division = (req.query.division || '').trim();
    const comisaria = (req.query.comisaria || '').trim();
    if (!unidad && !division && !comisaria) {
      return res.json({ ok: false, error: 'Seleccione división, comisaría o unidad' });
    }

    let baseWhere = 'WHERE 1=1';
    const baseParams = [];
    if (debeFiltrarPorUnidadAsignada(req.admin)) {
      baseWhere += ' AND (UPPER(unidad) LIKE $1 OR UPPER(comisaria) LIKE $1)';
      baseParams.push('%' + req.admin.unidad.toUpperCase() + '%');
    }
    const { where, params } = await buildWhere(req.query, baseWhere, baseParams);
    const evR = await pool.query(`DELETE FROM evaluaciones ${where} RETURNING id`, params);

    let pBase = 'WHERE 1=1';
    const pParams = [];
    if (debeFiltrarPorUnidadAsignada(req.admin)) {
      pBase += ' AND (UPPER(p.unidad) LIKE $1 OR UPPER(p.comisaria) LIKE $1)';
      pParams.push('%' + req.admin.unidad.toUpperCase() + '%');
    }
    const { where: pWhere, params: pPrms } = await buildWhereProgresos(req.query, pBase, pParams);
    const prR = await pool.query(`DELETE FROM progresos p ${pWhere} RETURNING clave`, pPrms);

    invalidarStatsCache();
    res.json({
      ok: true,
      eliminados_eval: evR.rowCount,
      eliminados_prog: prR.rowCount
    });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── Helper: construir WHERE por division/comisaria/unidad ─────────────────────
async function buildWhere(query, baseWhere, baseParams) {
  let where = baseWhere || 'WHERE 1=1';
  const params = [...(baseParams || [])];
  let pi = params.length + 1;

  const division  = (query.division  || '').toUpperCase();
  const comisaria = (query.comisaria || '').toUpperCase();
  const unidad    = (query.unidad    || '').toUpperCase();
  const busqueda  = (query.busqueda  || '').toUpperCase();

  if (division) {
    const du = await pool.query(
      `SELECT UPPER(u.nombre) AS nombre FROM unidades_pol u JOIN divisiones d ON d.id=u.division_id WHERE UPPER(d.nombre)=$1`, [division]);
    if (du.rows.length) {
      const arr = du.rows.map(r => r.nombre);
      where += ` AND (UPPER(comisaria) = ANY($${pi}::text[]) OR UPPER(unidad) = ANY($${pi}::text[]))`;
      params.push(arr); pi++;
    } else { where += ' AND 1=0'; }
  }
  if (comisaria) {
    where += ` AND (UPPER(comisaria) LIKE $${pi} OR UPPER(unidad) LIKE $${pi})`;
    params.push('%' + comisaria + '%'); pi++;
  }
  if (unidad) {
    where += ` AND (UPPER(unidad) LIKE $${pi} OR UPPER(comisaria) LIKE $${pi})`;
    params.push('%' + unidad + '%'); pi++;
  }
  if (busqueda)  {
    where += ` AND (UPPER(nombres) LIKE $${pi} OR cip LIKE $${pi+1} OR dni LIKE $${pi+2})`;
    params.push('%'+busqueda+'%','%'+busqueda+'%','%'+busqueda+'%'); pi += 3;
  }
  return { where, params, pi };
}

async function buildWhereProgresos(query, baseWhere, baseParams) {
  let where = baseWhere || 'WHERE 1=1';
  const params = [...(baseParams || [])];
  let pi = params.length + 1;

  const division  = (query.division  || '').toUpperCase();
  const comisaria = (query.comisaria || '').toUpperCase();
  const unidad    = (query.unidad    || '').toUpperCase();
  const busqueda  = (query.busqueda  || '').toUpperCase();

  if (division) {
    const du = await pool.query(
      `SELECT UPPER(u.nombre) AS nombre FROM unidades_pol u JOIN divisiones d ON d.id=u.division_id WHERE UPPER(d.nombre)=$1`, [division]);
    if (du.rows.length) {
      const arr = du.rows.map(r => r.nombre);
      where += ` AND (UPPER(p.comisaria) = ANY($${pi}::text[]) OR UPPER(p.unidad) = ANY($${pi}::text[]))`;
      params.push(arr); pi++;
    } else { where += ' AND 1=0'; }
  }
  if (comisaria) {
    where += ` AND (UPPER(p.comisaria) LIKE $${pi} OR UPPER(p.unidad) LIKE $${pi})`;
    params.push('%' + comisaria + '%'); pi++;
  }
  if (unidad) {
    where += ` AND (UPPER(p.unidad) LIKE $${pi} OR UPPER(p.comisaria) LIKE $${pi})`;
    params.push('%' + unidad + '%'); pi++;
  }
  if (busqueda) {
    where += ` AND (UPPER(p.nombres) LIKE $${pi} OR p.cip LIKE $${pi + 1})`;
    params.push('%' + busqueda + '%', '%' + busqueda + '%'); pi += 2;
  }
  return { where, params, pi };
}

// ── GET /descargar (CSV) ───────────────────────────────────────────────────────
app.get('/descargar', requireAuth, async (req, res) => {
  try {
    let baseWhere = 'WHERE 1=1', baseParams = [];
    if (debeFiltrarPorUnidadAsignada(req.admin)) {
      baseWhere += ' AND (UPPER(unidad) LIKE $1 OR UPPER(comisaria) LIKE $1)';
      baseParams.push('%' + req.admin.unidad.toUpperCase() + '%');
    }
    const { where, params } = await buildWhere(req.query, baseWhere, baseParams);

    const result = await pool.query(
      `SELECT * FROM evaluaciones ${where} ORDER BY comisaria,unidad,nombres`, params);

    // Obtener preguntas activas para cabecera
    const pregsR = await pool.query('SELECT numero,texto FROM preguntas WHERE activa=TRUE ORDER BY orden,numero');
    const pregs  = pregsR.rows;

    const Q = '"';
    const headers = ['ID','Fecha','Comisaría','Unidad','Nombres','CIP','DNI','Edad','Completa',
      ...pregs.map(p => `P${p.numero}`)];

    const csvRows = result.rows.map(row => {
      const resp = row.respuestas || {};
      const base = [row.id, row.fecha, row.comisaria, row.unidad, row.nombres,
                    row.cip, row.dni, row.edad, row.completada ? 'Sí' : 'No'];
      pregs.forEach(p => base.push(resp[p.numero] || ''));
      return base.map(c => Q + String(c||'').replace(/"/g,'""') + Q).join(',');
    });

    const csv = '﻿' + [headers.map(h=>Q+h+Q).join(','), ...csvRows].join('\r\n');
    const division  = (req.query.division  || '').replace(/\s+/g,'_');
    const unidad    = (req.query.unidad    || '').replace(/\s+/g,'_');
    const comisaria = (req.query.comisaria || '').replace(/\s+/g,'_');
    const fname = division ? `Cuestionario_${division}.csv`
                : unidad   ? `Cuestionario_${unidad}.csv`
                : comisaria? `Cuestionario_${comisaria}.csv`
                : 'Cuestionario_REGPOL_Callao.csv';

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    res.send(csv);
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

function parseRespuestasSafe(respuestas) {
  try {
    return typeof respuestas === 'string' ? JSON.parse(respuestas || '{}') : (respuestas || {});
  } catch (e) {
    return {};
  }
}

function evaluacionEstaCompleta(ev) {
  if (!ev) return false;
  const stats = contarRespuestas(ev);
  return !!ev.completada && stats.total >= 566;
}

async function cargarEvaluacionAdmin({ id, cip }, admin) {
  let ev = null;
  if (id) {
    const r = await pool.query(
      `SELECT e.*, TO_CHAR(e.fecha,'DD/MM/YYYY HH24:MI') AS fecha_txt
       FROM evaluaciones e WHERE e.id=$1`, [id]
    );
    if (!r.rows.length) return null;
    ev = r.rows[0];
    ev.fecha = ev.fecha_txt || ev.fecha;
  } else if (cip) {
    const r = await pool.query(
      `SELECT e.*, TO_CHAR(e.fecha,'DD/MM/YYYY HH24:MI') AS fecha_txt
       FROM evaluaciones e
       WHERE UPPER(TRIM(e.cip))=UPPER(TRIM($1)) OR TRIM(e.dni)=TRIM($1)
       ORDER BY e.fecha DESC LIMIT 1`,
      [cip]
    );
    if (!r.rows.length) return null;
    ev = r.rows[0];
    ev.fecha = ev.fecha_txt || ev.fecha;
  }
  if (!ev) return null;
  if (debeFiltrarPorUnidadAsignada(admin)) {
    const u = (admin.unidad || '').toUpperCase();
    const uni = (ev.unidad || '').toUpperCase();
    const com = (ev.comisaria || '').toUpperCase();
    if (!uni.includes(u) && !com.includes(u)) return null;
  }
  return await fusionarProgresoEnEvaluacion(ev);
}

// ── GET /admin/preview-resultado?id= | ?cip= — vista previa MMPI-2 ─────────────
app.get('/admin/preview-resultado', requireAuth, async (req, res) => {
  try {
    const id  = parseInt(req.query.id);
    const cip = (req.query.cip || '').trim();
    if (!id && !cip) return res.json({ ok: false, error: 'id o cip requerido' });

    const ev = await cargarEvaluacionAdmin({ id: id || null, cip: cip || null }, req.admin);
    if (!ev) return res.json({ ok: false, error: 'No encontrado' });

    const stats = contarRespuestas(ev);
    const completa = evaluacionEstaCompleta(ev);
    const mmpiRaw = calcularMMPI2(ev);
    const mmpi = normalizarResultadoMMPI(mmpiRaw, ev, completa, stats);
    if (!completa) {
      mmpi.max_item = maxItemRespondido(parseRespuestasSafe(ev.respuestas));
    }

    let diagnostico = null;
    if (completa && !mmpi.no_calificable && mmpi.escalas && mmpi.escalas.length) {
      const esMujer = mmpi.sexo === 'Mujer';
      mmpi.escalas.forEach(function(esc) {
        esc.significado = esc.t > 0 ? significadoEscalaMMPI(esc, esMujer) : null;
      });
      diagnostico = diagnosticoFinalMMPI(mmpi.escalas);
    }

    res.json({
      ok: true,
      completa,
      diagnostico,
      efectivo: {
        id: ev.id,
        grado: ev.grado || '',
        nombres: ev.nombres || '',
        cip: ev.cip || '',
        dni: ev.dni || '',
        edad: resolverEdadFila(ev) || null,
        sexo: ev.sexo || '',
        cargo: ev.cargo || '',
        armamento: ev.armamento || '',
        comisaria: ev.comisaria || '',
        unidad: ev.unidad || '',
        fecha: ev.fecha || '',
        foto: ev.foto && String(ev.foto).length > 80 ? ev.foto : '',
        total_resp: stats.total,
        v: stats.v,
        f: stats.f,
        tiempo_segundos: Math.max(0, parseInt(ev.tiempo_segundos, 10) || 0)
      },
      mmpi,
      resp_map: parseRespuestasSafe(ev.respuestas)
    });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── GET /admin/preview-avance?cip= — vista previa de progreso parcial ───────────
app.get('/admin/preview-avance', requireAuth, async (req, res) => {
  try {
    const cip = (req.query.cip || '').trim();
    if (!cip) return res.json({ ok: false, error: 'CIP requerido' });

    let ev = await cargarAvancePorCip(cip, req.admin);
    if (!ev) return res.json({ ok: false, error: 'No hay avance guardado para este CIP' });
    if (evaluacionEstaCompleta(ev)) {
      return res.json({ ok: false, error: 'Evaluación ya completada. Use Ver resultado.' });
    }

    const stats = contarRespuestas(ev);
    const pct = Math.min(100, Math.round((stats.total / 566) * 100));
    const pregsR = await pool.query(
      'SELECT numero, texto FROM preguntas WHERE activa=TRUE ORDER BY orden,numero'
    );
    let resp = ev.respuestas || {};
    if (typeof resp === 'string') {
      try { resp = JSON.parse(resp); } catch (e) { resp = {}; }
    }
    const filas = [];
    pregsR.rows.forEach(function(p) {
      const r = resp[p.numero] || resp[String(p.numero)];
      if (r === 'V' || r === 'F') {
        filas.push({ numero: p.numero, respuesta: r });
      }
    });

    const mmpiRaw = calcularMMPI2(ev);
    const mmpi = normalizarResultadoMMPI(mmpiRaw, ev, false, stats);
    mmpi.max_item = maxItemRespondido(parseRespuestasSafe(ev.respuestas));

    res.json({
      ok: true,
      efectivo: {
        grado: ev.grado || '',
        nombres: ev.nombres || '',
        cip: ev.cip || '',
        dni: ev.dni || '',
        edad: resolverEdadFila(ev) || null,
        sexo: ev.sexo || '',
        cargo: ev.cargo || '',
        armamento: formatearArmamentoLegible(ev.armamento || ''),
        comisaria: ev.comisaria || '',
        unidad: ev.unidad || '',
        fecha: ev.fecha || '',
        foto: ev.foto && String(ev.foto).length > 80 ? ev.foto : '',
        total_resp: stats.total,
        v: stats.v,
        f: stats.f,
        tiempo_segundos: Math.max(0, parseInt(ev.tiempo_segundos, 10) || 0)
      },
      avance: {
        total: stats.total,
        pct: pct,
        bloque: parseInt(ev.bloque_max, 10) || Math.min(12, Math.ceil(stats.total / 50) || 1),
        bloques: 12
      },
      respuestas: filas,
      resp_map: resp,
      mmpi
    });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── GET /pdf/efectivo?id=N | ?cip= — PDF individual (completo o avance parcial) ─
app.get('/pdf/efectivo', requireAuth, async (req, res) => {
  try {
    const id  = parseInt(req.query.id);
    const cip = (req.query.cip || '').trim();
    if (!id && !cip) return res.status(400).json({ error: 'id o cip requerido' });

    let ev = null;
    if (id) {
      ev = await cargarEvaluacionAdmin({ id: id || null, cip: null }, req.admin);
    } else {
      ev = await cargarAvancePorCip(cip, req.admin);
      if (!ev) {
        ev = await cargarEvaluacionAdmin({ cip }, req.admin);
      }
    }
    if (!ev) return res.status(404).json({ error: 'No encontrado' });

    const stats = contarRespuestas(ev);
    if (stats.total < 1) {
      return res.status(403).json({ error: 'No hay respuestas registradas para generar el PDF' });
    }

    const completa = evaluacionEstaCompleta(ev);
    const pregsR = await pool.query('SELECT numero AS id, texto FROM preguntas WHERE activa=TRUE ORDER BY orden,numero');
    const buf = await generarPDFAsync('generarPDFIndividual', [ev, pregsR.rows, { completa }]);
    const nom = (ev.nombres||'efectivo').replace(/\s+/g,'_').replace(/[^a-zA-Z0-9_]/g,'');
    const suf = completa ? 'ResultadoMMPI2' : 'AvanceEvaluacion';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${nom}_${suf}.pdf"`);
    res.send(buf);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function filtrarFilasInformeGrupo(rows, filtros) {
  filtros = filtros || {};
  let out = rows || [];

  const area = String(filtros.area || '').trim();
  if (area) {
    const sinArea = area === '__SIN__' || /^(\( )?SIN[_\s-]?Á?REA\)?$/i.test(area);
    if (sinArea) {
      out = out.filter(function(r) { return !String(r.area || '').trim(); });
    } else {
      const a = area.toUpperCase();
      out = out.filter(function(r) {
        return String(r.area || '').trim().toUpperCase() === a;
      });
    }
  }

  const grado = String(filtros.grado || '').trim();
  if (grado) {
    if (grado === '__SIN__') {
      out = out.filter(function(r) { return !String(r.grado || '').trim(); });
    } else {
      const g = grado.toUpperCase();
      out = out.filter(function(r) {
        return String(r.grado || '').trim().toUpperCase() === g;
      });
    }
  }

  const sexo = String(filtros.sexo || '').trim();
  if (sexo) {
    const s = sexo.toUpperCase();
    out = out.filter(function(r) {
      return String(r.sexo || '').trim().toUpperCase() === s;
    });
  }

  const estado = String(filtros.estado || '').trim().toUpperCase();
  if (estado === 'COMPLETO' || estado === 'COMPLETOS') {
    out = out.filter(function(r) {
      if (typeof r.completa === 'boolean') return r.completa;
      const total = parseInt(r.total_resp, 10) || 0;
      return !!r.completada || total >= 566;
    });
  } else if (estado === 'AVANCE' || estado === 'INCOMPLETO' || estado === 'EN_AVANCE') {
    out = out.filter(function(r) {
      if (typeof r.completa === 'boolean') return !r.completa;
      const total = parseInt(r.total_resp, 10) || 0;
      return !(!!r.completada || total >= 566);
    });
  }

  return out;
}

function etiquetaFiltroInforme(valor, sinLabel) {
  const v = String(valor || '').trim();
  if (!v) return '';
  if (v === '__SIN__') return sinLabel || 'SIN DATO';
  return v.toUpperCase();
}

// ── Datos compartidos del informe por unidad (PDF de grupo y vista previa web) ─
async function obtenerFilasInformeGrupo(req) {
  const division  = (req.query.division  || '').toUpperCase();
  const comisaria = (req.query.comisaria || '').toUpperCase();
  const unidad    = (req.query.unidad    || '').toUpperCase();
  const filtros = {
    area: String(req.query.area || '').trim(),
    grado: String(req.query.grado || '').trim(),
    sexo: String(req.query.sexo || '').trim(),
    estado: String(req.query.estado || '').trim(),
    riesgo: String(req.query.riesgo || '').trim()
  };
  if (!division && !comisaria && !unidad) return { error: 'Parámetro requerido', status: 400 };

  const { where, params } = await buildWhere(req.query, 'WHERE 1=1', []);
  const r = await pool.query(
    `SELECT *, TO_CHAR(fecha,'DD/MM/YYYY HH24:MI') AS fecha FROM evaluaciones ${where} ORDER BY comisaria,nombres`, params);

  const cipsEval = new Set(r.rows.map(function(row) { return (row.cip || '').toUpperCase(); }));
  const progresos = await consultarProgresosParaPDFGrupo(req.admin, req.query);
  let merged = normalizarFilasPDFGrupo(
    r.rows.concat(
      progresos.filter(function(p) { return !cipsEval.has((p.cip || '').toUpperCase()); })
    )
  );
  // área / grado / sexo / estado
  merged = filtrarFilasInformeGrupo(merged, {
    area: filtros.area,
    grado: filtros.grado,
    sexo: filtros.sexo,
    estado: filtros.estado
  });

  // Riesgo requiere diagnóstico MMPI (solo evaluaciones completas)
  const riesgoFiltro = String(filtros.riesgo || '').trim().toUpperCase();
  if (riesgoFiltro === 'BAJO' || riesgoFiltro === 'MODERADO' || riesgoFiltro === 'ALTO') {
    merged = merged.filter(function(ev) {
      const d = calcularDiagnosticoFila(ev);
      return !!(d.completa && d.diag && String(d.diag.nivel || '').toUpperCase() === riesgoFiltro);
    });
  }

  if (!merged.length) return { error: 'Sin evaluaciones para este filtro', status: 404 };

  let label = division || comisaria || unidad;
  const extras = [];
  if (filtros.area) extras.push(etiquetaFiltroInforme(filtros.area, 'SIN ÁREA'));
  if (filtros.estado) {
    const e = filtros.estado.toUpperCase();
    extras.push(e === 'AVANCE' || e === 'EN_AVANCE' || e === 'INCOMPLETO' ? 'EN AVANCE' : 'COMPLETOS');
  }
  if (filtros.riesgo) extras.push('RIESGO ' + filtros.riesgo.toUpperCase());
  if (filtros.grado) extras.push(etiquetaFiltroInforme(filtros.grado, 'SIN GRADO'));
  if (filtros.sexo) extras.push(filtros.sexo.toUpperCase());
  if (extras.length) label += ' — ' + extras.join(' · ');

  return { label: label, merged: merged, filtros: filtros };
}

// ── GET /admin/preview-grupo — dashboard interactivo del informe por unidad ───
app.get('/admin/preview-grupo', requireAuth, async (req, res) => {
  try {
    const datos = await obtenerFilasInformeGrupo(req);
    if (datos.error) return res.status(datos.status).json({ ok: false, error: datos.error });

    const riesgo = { BAJO: 0, MODERADO: 0, ALTO: 0 };
    const alertasEscala = {};
    let completos = 0;
    const rows = datos.merged.map(function(ev) {
      const d = calcularDiagnosticoFila(ev);
      const stats = d.stats || { total: 0, v: 0, f: 0 };
      let nivel = '';
      let alertas = [];
      if (d.completa) {
        completos++;
        if (d.diag) {
          nivel = d.diag.nivel;
          riesgo[nivel] = (riesgo[nivel] || 0) + 1;
        }
        alertas = d.alertCodes || [];
        alertas.forEach(function(c) { alertasEscala[c] = (alertasEscala[c] || 0) + 1; });
      }
      return {
        nombres: ev.nombres || '',
        cip: ev.cip || '',
        dni: ev.dni || '',
        area: ev.area || '',
        grado: ev.grado || '',
        sexo: ev.sexo || '',
        fecha: String(ev.fecha || '').substring(0, 10),
        edad: resolverEdadFila(ev),
        v: stats.v,
        f: stats.f,
        total: stats.total,
        pct: Math.min(100, Math.round((stats.total / 566) * 100)),
        completa: d.completa,
        nivel: nivel,
        alertas: alertas
      };
    });

    const areasSet = {};
    const gradosSet = {};
    const sexosSet = {};
    rows.forEach(function(r) {
      const a = String(r.area || '').trim();
      if (a) areasSet[a.toUpperCase()] = a;
      const g = String(r.grado || '').trim();
      if (g) gradosSet[g.toUpperCase()] = g;
      const s = String(r.sexo || '').trim();
      if (s) sexosSet[s.toUpperCase()] = s;
    });

    res.json({
      ok: true,
      label: datos.label,
      total: rows.length,
      completos: completos,
      incompletos: rows.length - completos,
      riesgo: riesgo,
      alertas_escala: alertasEscala,
      areas: Object.keys(areasSet).sort().map(function(k) { return areasSet[k]; }),
      grados: Object.keys(gradosSet).sort().map(function(k) { return gradosSet[k]; }),
      sexos: Object.keys(sexosSet).sort().map(function(k) { return sexosSet[k]; }),
      rows: rows
    });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── GET /pdf/grupo?division=X | ?comisaria=X | ?unidad=X ─────────────────────
app.get('/pdf/grupo', requireAuth, async (req, res) => {
  try {
    const datos = await obtenerFilasInformeGrupo(req);
    if (datos.error) return res.status(datos.status).json({ error: datos.error });

    const label  = datos.label;
    const buf    = await generarPDFAsync('generarPDFComisaria', [label, datos.merged]);
    const nom    = 'Cuestionario_' + label.replace(/\s+/g,'_') + '.pdf';
    const inline = req.query.inline === '1' || req.query.ver === '1';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', (inline ? 'inline' : 'attachment') + `; filename="${nom}"`);
    res.send(buf);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Gestión de admins (solo unitic) ───────────────────────────────────────────
app.get('/admin/usuarios', requireAuth, async (req, res) => {
  if (req.admin.rol !== 'unitic') return res.status(403).json({ ok: false });
  const r = await pool.query('SELECT id,usuario,rol,nombre,unidad,permisos FROM admins ORDER BY rol,usuario');
  res.json({ ok: true, usuarios: r.rows });
});

app.post('/admin/usuarios', requireAuth, async (req, res) => {
  if (req.admin.rol !== 'unitic') return res.status(403).json({ ok: false });
  const { usuario, password, rol, nombre, unidad, permisos } = req.body;
  try {
    await pool.query(
      'INSERT INTO admins (usuario,passhash,rol,nombre,unidad,permisos) VALUES ($1,$2,$3,$4,$5,$6::jsonb)',
      [usuario, sha256(password), rol||'usuario', nombre||'', unidad||'', JSON.stringify(permisos||[])]
    );
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, error: 'Usuario ya existe' });
  }
});

app.put('/admin/usuarios/:id', requireAuth, async (req, res) => {
  if (req.admin.rol !== 'unitic') return res.status(403).json({ ok: false });
  const { nombre, unidad, permisos, password } = req.body;
  if (password && password.length >= 6) {
    await pool.query('UPDATE admins SET nombre=$1,unidad=$2,permisos=$3::jsonb,passhash=$4 WHERE id=$5',
      [nombre||'', unidad||'', JSON.stringify(permisos||[]), sha256(password), req.params.id]);
  } else {
    await pool.query('UPDATE admins SET nombre=$1,unidad=$2,permisos=$3::jsonb WHERE id=$4',
      [nombre||'', unidad||'', JSON.stringify(permisos||[]), req.params.id]);
  }
  res.json({ ok: true });
});

app.delete('/admin/usuarios/:id', requireAuth, async (req, res) => {
  if (req.admin.rol !== 'unitic') return res.status(403).json({ ok: false });
  await pool.query('DELETE FROM admins WHERE id=$1 AND rol!=\'unitic\'', [req.params.id]);
  res.json({ ok: true });
});

// ── GET /admin/divisiones ─────────────────────────────────────────────────────
let unidadesPublicoCache = null;
let unidadesPublicoCacheExp = 0;
const UNIDADES_PUBLICO_CACHE_MS = 600000;

// ── GET /unidades-publico (sin auth — para la página pública) ────────────────
app.get('/unidades-publico', async (req, res) => {
  try {
    if (unidadesPublicoCache && unidadesPublicoCacheExp > Date.now()) {
      return res.json(unidadesPublicoCache);
    }
    const divs  = await pool.query('SELECT id,nombre,orden FROM divisiones ORDER BY orden,nombre');
    const upols = await pool.query(
      "SELECT id,nombre,division_id,tipo,orden,direccion,telefono FROM unidades_pol WHERE tipo='comisaria' ORDER BY division_id,orden,nombre"
    );
    const result = divs.rows
      .filter(d => upols.rows.some(u => u.division_id === d.id))
      .map(d => ({
        id: d.id, nombre: d.nombre,
        unidades: upols.rows.filter(u => u.division_id === d.id)
          .map(u => ({ id: u.id, nombre: u.nombre, direccion: u.direccion||'', telefono: u.telefono||'' }))
      }));
    unidadesPublicoCache = { ok: true, divisiones: result };
    unidadesPublicoCacheExp = Date.now() + UNIDADES_PUBLICO_CACHE_MS;
    res.json(unidadesPublicoCache);
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

app.get('/admin/divisiones', requireAuth, async (req, res) => {
  try {
    const divs  = await pool.query('SELECT id,nombre,orden FROM divisiones ORDER BY orden,nombre');
    const upols = await pool.query('SELECT id,nombre,division_id,tipo,orden,direccion,telefono FROM unidades_pol ORDER BY division_id,orden,nombre');
    const result = divs.rows.map(d => ({
      id: d.id, nombre: d.nombre, orden: d.orden,
      unidades: upols.rows.filter(u => u.division_id === d.id)
    }));
    res.json({ ok: true, divisiones: result });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

app.post('/admin/divisiones', requireAuth, async (req, res) => {
  if (req.admin.rol !== 'unitic') return res.status(403).json({ ok: false });
  const { nombre, orden } = req.body;
  try {
    const r = await pool.query('INSERT INTO divisiones (nombre,orden) VALUES ($1,$2) RETURNING id', [nombre, orden||0]);
    invalidarUnidadesPublicoCache();
    configCache = null;
    res.json({ ok: true, id: r.rows[0].id });
  } catch (e) { res.json({ ok: false, error: 'Ya existe esa división' }); }
});

app.put('/admin/divisiones/:id', requireAuth, async (req, res) => {
  if (req.admin.rol !== 'unitic') return res.status(403).json({ ok: false });
  const { nombre, orden } = req.body;
  await pool.query('UPDATE divisiones SET nombre=$1,orden=$2 WHERE id=$3', [nombre, orden||0, req.params.id]);
  invalidarUnidadesPublicoCache();
  configCache = null;
  res.json({ ok: true });
});

app.delete('/admin/divisiones/:id', requireAuth, async (req, res) => {
  if (req.admin.rol !== 'unitic') return res.status(403).json({ ok: false });
  await pool.query('DELETE FROM divisiones WHERE id=$1', [req.params.id]);
  invalidarUnidadesPublicoCache();
  configCache = null;
  res.json({ ok: true });
});

app.post('/admin/unidades', requireAuth, async (req, res) => {
  if (req.admin.rol !== 'unitic') return res.status(403).json({ ok: false });
  const { nombre, division_id, tipo, orden, direccion, telefono } = req.body;
  try {
    const r = await pool.query(
      'INSERT INTO unidades_pol (nombre,division_id,tipo,orden,direccion,telefono) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
      [nombre, division_id||null, tipo||'comisaria', orden||0, direccion||'', telefono||'']);
    invalidarUnidadesPublicoCache();
    configCache = null;
    res.json({ ok: true, id: r.rows[0].id });
  } catch (e) { res.json({ ok: false, error: 'Unidad ya existe' }); }
});

app.put('/admin/unidades/:id', requireAuth, async (req, res) => {
  if (req.admin.rol !== 'unitic') return res.status(403).json({ ok: false });
  const { nombre, division_id, tipo, orden, direccion, telefono } = req.body;
  await pool.query(
    'UPDATE unidades_pol SET nombre=$1,division_id=$2,tipo=$3,orden=$4,direccion=$5,telefono=$6 WHERE id=$7',
    [nombre, division_id||null, tipo||'comisaria', orden||0, direccion||'', telefono||'', req.params.id]);
  invalidarUnidadesPublicoCache();
  configCache = null;
  res.json({ ok: true });
});

app.delete('/admin/unidades/:id', requireAuth, async (req, res) => {
  if (req.admin.rol !== 'unitic') return res.status(403).json({ ok: false });
  await pool.query('DELETE FROM unidades_pol WHERE id=$1', [req.params.id]);
  invalidarUnidadesPublicoCache();
  configCache = null;
  res.json({ ok: true });
});

// ── GET /portal/configuracion — datos CMS del portal ─────────────────────────
app.get('/portal/configuracion', async (req, res) => {
  try {
    const r = await pool.query('SELECT data_json FROM portal_configuracion WHERE id=1');
    if (r.rows.length && r.rows[0].data_json) {
      let data = typeof r.rows[0].data_json === 'string'
        ? JSON.parse(r.rows[0].data_json) : r.rows[0].data_json;
      const norm = await normalizarImagenesPortalEnConfig(data);
      data = norm.data;
      if (norm.changed) {
        await pool.query(
          'UPDATE portal_configuracion SET data_json=$1, updated_at=NOW() WHERE id=1',
          [JSON.stringify(data)]
        );
      }
      if (data.fotosEncabezado) data.fotosEncabezado = sanitizarFotosEncabezadoList(data.fotosEncabezado);
      res.set('Content-Type', 'application/json; charset=utf-8');
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      return res.send(JSON.stringify(data));
    }
    const sitePath = path.join(__dirname, 'public', 'site-data.json');
    if (fs.existsSync(sitePath)) {
      res.set('Content-Type', 'application/json; charset=utf-8');
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      return res.sendFile(sitePath);
    }
    res.status(404).json({ ok: false, error: 'Sin datos' });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'Error al leer configuración' });
  }
});

const RESENA_IMG_MAX_BYTES = 3 * 1024 * 1024;

function resenaImgClave(idx) {
  const s = String(idx || '').trim().toLowerCase();
  if (s === 'intro') return 'resena_intro';
  if (/^\d+$/.test(s)) return 'resena_slide_' + s;
  return null;
}

function mimeImagenResenaValido(mime) {
  return /^image\/(jpeg|png|webp)$/i.test(String(mime || ''));
}

// ── GET /portal/carrusel-imagen/:idx — banner principal ─────────────────────
app.get('/portal/carrusel-imagen/:idx', async (req, res) => {
  try {
    const idx = parseInt(req.params.idx, 10);
    if (isNaN(idx) || idx < 0) return res.status(404).end();
    const clave = 'carrusel_' + idx;
    const r = await pool.query(
      'SELECT mime, data FROM portal_archivos WHERE clave=$1',
      [clave]
    );
    if (!r.rows.length || !r.rows[0].data) return res.status(404).end();
    res.set('Content-Type', r.rows[0].mime || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(r.rows[0].data);
  } catch (e) {
    res.status(500).end();
  }
});

// ── GET /portal/header-foto/:idx — galería del encabezado ───────────────────
app.get('/portal/header-foto/:idx', async (req, res) => {
  try {
    const idx = parseInt(req.params.idx, 10);
    if (isNaN(idx) || idx < 0) return res.status(404).end();
    const clave = 'header_foto_' + idx;
    const r = await pool.query(
      'SELECT mime, data FROM portal_archivos WHERE clave=$1',
      [clave]
    );
    if (!r.rows.length || !r.rows[0].data) return res.status(404).end();
    res.set('Content-Type', r.rows[0].mime || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(r.rows[0].data);
  } catch (e) {
    res.status(500).end();
  }
});

// ── GET /portal/resena-imagen/:idx — fotos del carrusel de reseña ───────────
app.get('/portal/resena-imagen/:idx', async (req, res) => {
  try {
    const clave = resenaImgClave(req.params.idx);
    if (!clave) return res.status(404).end();
    const r = await pool.query(
      'SELECT mime, data FROM portal_archivos WHERE clave=$1',
      [clave]
    );
    if (!r.rows.length || !r.rows[0].data) return res.status(404).end();
    res.set('Content-Type', r.rows[0].mime || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(r.rows[0].data);
  } catch (e) {
    res.status(500).end();
  }
});

// ── POST /admin/resena-imagen/:idx — subir foto de reseña (intro o párrafo) ───
app.post('/admin/resena-imagen/:idx', requireAuth,
  express.raw({ limit: RESENA_IMG_MAX_BYTES, type: function() { return true; } }),
  async (req, res) => {
    try {
      if (!puedePublicarConfiguracionPortal(req.admin)) {
        return res.status(403).json({ ok: false, error: 'Sin permiso para subir imágenes del portal' });
      }
      const idxParam = String(req.params.idx || '').trim().toLowerCase();
      const clave = resenaImgClave(idxParam);
      if (!clave) return res.status(400).json({ ok: false, error: 'Índice inválido.' });
      const buf = req.body;
      if (!buf || !Buffer.isBuffer(buf) || !buf.length) {
        return res.status(400).json({ ok: false, error: 'Archivo vacío o no recibido.' });
      }
      if (buf.length > RESENA_IMG_MAX_BYTES) {
        return res.status(400).json({ ok: false, error: 'La imagen supera el máximo de 3 MB.' });
      }
      let mime = String(req.headers['content-type'] || 'image/jpeg').split(';')[0].trim();
      const nombre = String(req.headers['x-filename'] || 'foto.jpg').trim();
      if (!mimeImagenResenaValido(mime)) {
        if (/\.png$/i.test(nombre)) mime = 'image/png';
        else if (/\.webp$/i.test(nombre)) mime = 'image/webp';
        else mime = 'image/jpeg';
      }
      await pool.query(
        `INSERT INTO portal_archivos (clave, mime, nombre, data, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (clave) DO UPDATE SET
           mime = EXCLUDED.mime,
           nombre = EXCLUDED.nombre,
           data = EXCLUDED.data,
           updated_at = NOW()`,
        [clave, mime, nombre.slice(0, 255), buf]
      );
      res.json({ ok: true, url: '/portal/resena-imagen/' + idxParam, bytes: buf.length });
    } catch (e) {
      res.status(500).json({ ok: false, error: 'Error al guardar la imagen.' });
    }
  }
);

// ── DELETE /admin/resena-imagen/:idx — quitar foto de reseña ─────────────────
app.delete('/admin/resena-imagen/:idx', requireAuth, async (req, res) => {
  try {
    if (!puedePublicarConfiguracionPortal(req.admin)) {
      return res.status(403).json({ ok: false, error: 'Sin permiso para eliminar imágenes del portal' });
    }
    const clave = resenaImgClave(req.params.idx);
    if (!clave) return res.status(400).json({ ok: false, error: 'Índice inválido.' });
    await pool.query('DELETE FROM portal_archivos WHERE clave=$1', [clave]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'Error al eliminar la imagen.' });
  }
});

const BIENESTAR_VIDEO_MAX_BYTES = 60 * 1024 * 1024;
const BIENESTAR_VIDEO_CLAVE = 'bienestar_tutorial';

function mimeVideoBienestarValido(mime) {
  return /^video\/(mp4|webm|quicktime)$/i.test(String(mime || ''));
}

async function obtenerMetaVideoBienestar() {
  const r = await pool.query(
    'SELECT mime, octet_length(data) AS size FROM portal_archivos WHERE clave=$1',
    [BIENESTAR_VIDEO_CLAVE]
  );
  if (!r.rows.length || !r.rows[0].size) return null;
  return {
    mime: r.rows[0].mime || 'video/mp4',
    size: parseInt(r.rows[0].size, 10) || 0
  };
}

async function leerRangoVideoBienestar(inicioPg, cantidad) {
  const r = await pool.query(
    'SELECT substring(data FROM $2 FOR $3) AS chunk FROM portal_archivos WHERE clave=$1',
    [BIENESTAR_VIDEO_CLAVE, inicioPg, cantidad]
  );
  return r.rows.length ? r.rows[0].chunk : null;
}

function enviarCabecerasVideoBienestar(res, mime, size) {
  res.setHeader('Content-Type', mime || 'video/mp4');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.setHeader('Content-Length', String(size));
}

function enviarVideoBienestar(req, res, buf, mime) {
  if (!buf || !buf.length) return res.status(404).end();
  const size = buf.length;
  enviarCabecerasVideoBienestar(res, mime, size);
  const range = req.headers.range;
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/i.exec(String(range));
    if (m) {
      let start = m[1] !== '' ? parseInt(m[1], 10) : 0;
      let end = m[2] !== '' ? parseInt(m[2], 10) : size - 1;
      if (isNaN(start) || start < 0) start = 0;
      if (isNaN(end) || end >= size) end = size - 1;
      if (start <= end) {
        res.status(206);
        res.setHeader('Content-Range', 'bytes ' + start + '-' + end + '/' + size);
        res.setHeader('Content-Length', String(end - start + 1));
        if (req.method === 'HEAD') return res.end();
        return res.end(buf.subarray(start, end + 1));
      }
    }
  }
  if (req.method === 'HEAD') return res.end();
  res.end(buf);
}

// ── GET /portal/bienestar-video — video tutorial público ─────────────────────
app.get('/portal/bienestar-video', async (req, res) => {
  try {
    const meta = await obtenerMetaVideoBienestar();
    if (!meta || !meta.size) return res.status(404).end();

    const range = req.headers.range;
    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/i.exec(String(range));
      if (m) {
        let start = m[1] !== '' ? parseInt(m[1], 10) : 0;
        let end = m[2] !== '' ? parseInt(m[2], 10) : meta.size - 1;
        if (isNaN(start) || start < 0) start = 0;
        if (isNaN(end) || end >= meta.size) end = meta.size - 1;
        if (start > end) return res.status(416).end();
        const chunk = await leerRangoVideoBienestar(start + 1, end - start + 1);
        if (!chunk) return res.status(404).end();
        res.status(206);
        res.setHeader('Content-Type', meta.mime);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.setHeader('Content-Range', 'bytes ' + start + '-' + end + '/' + meta.size);
        res.setHeader('Content-Length', String(end - start + 1));
        if (req.method === 'HEAD') return res.end();
        return res.end(chunk);
      }
    }

    if (req.method === 'HEAD') {
      enviarCabecerasVideoBienestar(res, meta.mime, meta.size);
      return res.end();
    }

    const r = await pool.query(
      'SELECT mime, data FROM portal_archivos WHERE clave=$1',
      [BIENESTAR_VIDEO_CLAVE]
    );
    if (!r.rows.length || !r.rows[0].data) return res.status(404).end();
    enviarVideoBienestar(req, res, r.rows[0].data, r.rows[0].mime || meta.mime);
  } catch (e) {
    res.status(500).end();
  }
});

// ── POST /admin/bienestar-video — subir tutorial (máx. 60 MB) ────────────────
app.post('/admin/bienestar-video', requireAuth,
  express.raw({ limit: BIENESTAR_VIDEO_MAX_BYTES, type: function() { return true; } }),
  async (req, res) => {
    try {
      const buf = req.body;
      if (!buf || !Buffer.isBuffer(buf) || !buf.length) {
        return res.status(400).json({ ok: false, error: 'Archivo vacío o no recibido.' });
      }
      if (buf.length > BIENESTAR_VIDEO_MAX_BYTES) {
        return res.status(400).json({ ok: false, error: 'El video supera el máximo de 60 MB.' });
      }
      let mime = String(req.headers['content-type'] || 'video/mp4').split(';')[0].trim();
      const nombre = String(req.headers['x-filename'] || 'tutorial.mp4').trim();
      if (!mimeVideoBienestarValido(mime)) {
        if (/\.webm$/i.test(nombre)) mime = 'video/webm';
        else if (/\.mov$/i.test(nombre)) mime = 'video/quicktime';
        else mime = 'video/mp4';
      }
      await pool.query(
        `INSERT INTO portal_archivos (clave, mime, nombre, data, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (clave) DO UPDATE SET
           mime = EXCLUDED.mime,
           nombre = EXCLUDED.nombre,
           data = EXCLUDED.data,
           updated_at = NOW()`,
        [BIENESTAR_VIDEO_CLAVE, mime, nombre.slice(0, 255), buf]
      );
      res.json({ ok: true, url: '/portal/bienestar-video', bytes: buf.length });
    } catch (e) {
      res.status(500).json({ ok: false, error: 'Error al guardar el video.' });
    }
  }
);

// ── DELETE /admin/bienestar-video — quitar tutorial ──────────────────────────
app.delete('/admin/bienestar-video', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM portal_archivos WHERE clave=$1', [BIENESTAR_VIDEO_CLAVE]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'Error al eliminar el video.' });
  }
});

// ── GET /admin/bienestar-video/info — estado del tutorial (panel CMS) ────────
app.get('/admin/bienestar-video/info', requireAuth, async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT mime, nombre, octet_length(data) AS bytes, updated_at FROM portal_archivos WHERE clave=$1',
      [BIENESTAR_VIDEO_CLAVE]
    );
    if (!r.rows.length) return res.json({ ok: true, disponible: false });
    const row = r.rows[0];
    res.json({
      ok: true,
      disponible: true,
      mime: row.mime,
      nombre: row.nombre,
      bytes: parseInt(row.bytes, 10) || 0,
      updated_at: row.updated_at
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'Error al consultar el video.' });
  }
});

// ── POST /admin/configuracion — guardar CMS (requiere auth) ──────────────────
app.post('/admin/configuracion', requireAuth, async (req, res) => {
  try {
    if (!puedePublicarConfiguracionPortal(req.admin)) {
      return res.status(403).json({ ok: false, error: 'Sin permiso para publicar el portal' });
    }
    const data = req.body;
    if (!data || typeof data !== 'object') return res.status(400).json({ ok: false, error: 'Datos inválidos' });
    const meses = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
    const hoy = new Date();
    data.actualizacion = data.actualizacion || (hoy.getDate() + ' DE ' + meses[hoy.getMonth()] + ' ' + hoy.getFullYear());
    data.cmsPublicadoEn = new Date().toISOString();
    if (data.fotosEncabezado) data.fotosEncabezado = sanitizarFotosEncabezadoList(data.fotosEncabezado);
    limpiarClavesLegacyPortalConfig(data);
    const norm = await normalizarImagenesPortalEnConfig(data);
    const dataFinal = norm.data;
    const json = JSON.stringify(dataFinal);
    await pool.query(
      `INSERT INTO portal_configuracion(id, data_json, updated_at) VALUES(1, $1, NOW())
       ON CONFLICT(id) DO UPDATE SET data_json = EXCLUDED.data_json, updated_at = NOW()`,
      [json]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'Error al guardar configuración' });
  }
});

// ── GET /portal/sorteos — público ─────────────────────────────────────────────
app.get('/portal/sorteos', async (req, res) => {
  try {
    const tipo = req.query.tipo || null;
    let q = 'SELECT s.*, i.titulo AS item_titulo FROM sorteos_portal s LEFT JOIN items_portal i ON i.id=s.item_id WHERE s.publicado=TRUE';
    const args = [];
    if (tipo) { q += ' AND s.tipo=$1'; args.push(tipo); }
    q += ' ORDER BY s.orden, s.id DESC';
    const sorteos = await pool.query(q, args);
    const result  = [];
    for (const s of sorteos.rows) {
      const row = { ...s };
      if (s.tipo === 'resultado') {
        const r = await pool.query('SELECT * FROM resultados_sorteo WHERE sorteo_id=$1 ORDER BY orden,id', [s.id]);
        row.resultados = r.rows;
      }
      result.push(row);
    }
    res.json({ ok: true, sorteos: result });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ── GET /portal/items/:id/plantilla — público ─────────────────────────────────
app.get('/portal/items/:id/plantilla', async (req, res) => {
  try {
    const r = await pool.query('SELECT plantilla_pdf,plantilla_nombre FROM items_portal WHERE id=$1 AND visible=TRUE', [req.params.id]);
    if (!r.rows.length || !r.rows[0].plantilla_pdf)
      return res.status(404).json({ ok: false, error: 'Sin plantilla' });
    res.json({ ok: true, pdf: r.rows[0].plantilla_pdf, nombre: r.rows[0].plantilla_nombre || 'plantilla.pdf' });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ── GET /admin/sorteos ─────────────────────────────────────────────────────────
app.get('/admin/sorteos', requireAuth, async (req, res) => {
  try {
    const perms = normalizarPermisos(req.admin.permisos);
    const esU = req.admin.rol === 'unitic';
    if (!esU && !perms.includes('cms_convenios') && !perms.includes('cms_cursos'))
      return res.status(403).json({ ok: false, error: 'Sin permiso' });
    const r = await pool.query(
      'SELECT s.*, i.titulo AS item_titulo, i.tipo AS item_tipo FROM sorteos_portal s LEFT JOIN items_portal i ON i.id=s.item_id ORDER BY s.orden,s.id DESC');
    const result = [];
    for (const s of r.rows) {
      const row = { ...s };
      const resList = await pool.query('SELECT * FROM resultados_sorteo WHERE sorteo_id=$1 ORDER BY orden,id', [s.id]);
      row.resultados = resList.rows;
      if (esU || puedeGestionarSorteos(req.admin, row.item_tipo || 'convenio')) result.push(row);
    }
    res.json({ ok: true, sorteos: result });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ── POST /admin/sorteos ────────────────────────────────────────────────────────
app.post('/admin/sorteos', requireAuth, async (req, res) => {
  try {
    const { tipo, titulo, descripcion, fecha_sorteo, imagen, item_id, publicado, orden } = req.body;
    const itemTipo = item_id ? await tipoItemPortal(item_id) : 'convenio';
    if (!puedeGestionarSorteos(req.admin, itemTipo))
      return res.status(403).json({ ok: false, error: 'Sin permiso para gestionar sorteos de esta área.' });
    if (!titulo) return res.json({ ok: false, error: 'Título obligatorio' });
    const r = await pool.query(
      `INSERT INTO sorteos_portal(tipo,titulo,descripcion,fecha_sorteo,imagen,item_id,publicado,orden)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [tipo||'proximo', titulo, descripcion||'', fecha_sorteo||'', imagen||'',
       item_id||null, publicado!==false, parseInt(orden)||0]);
    res.json({ ok: true, id: r.rows[0].id });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ── PUT /admin/sorteos/:id ─────────────────────────────────────────────────────
app.put('/admin/sorteos/:id', requireAuth, async (req, res) => {
  try {
    const itemTipo = await tipoSorteoItem(req.params.id);
    if (!puedeGestionarSorteos(req.admin, itemTipo || 'convenio'))
      return res.status(403).json({ ok: false, error: 'Sin permiso para gestionar este sorteo.' });
    const { tipo, titulo, descripcion, fecha_sorteo, imagen, item_id, publicado, orden } = req.body;
    if (item_id) {
      const nuevoTipo = await tipoItemPortal(item_id);
      if (!puedeGestionarSorteos(req.admin, nuevoTipo))
        return res.status(403).json({ ok: false, error: 'Sin permiso para esta convocatoria.' });
    }
    await pool.query(
      `UPDATE sorteos_portal SET tipo=$1,titulo=$2,descripcion=$3,fecha_sorteo=$4,
        imagen=CASE WHEN $5='' THEN imagen ELSE $5 END,
        item_id=$6,publicado=$7,orden=$8 WHERE id=$9`,
      [tipo||'proximo', titulo, descripcion||'', fecha_sorteo||'', imagen||'',
       item_id||null, publicado!==false, parseInt(orden)||0, req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ── DELETE /admin/sorteos/:id ──────────────────────────────────────────────────
app.delete('/admin/sorteos/:id', requireAuth, async (req, res) => {
  try {
    const itemTipo = await tipoSorteoItem(req.params.id);
    if (!puedeGestionarSorteos(req.admin, itemTipo || 'convenio'))
      return res.status(403).json({ ok: false, error: 'Sin permiso para eliminar este sorteo.' });
    await pool.query('DELETE FROM sorteos_portal WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ── POST /admin/sorteos/:id/resultados — guardar lista de resultados ───────────
app.post('/admin/sorteos/:id/resultados', requireAuth, async (req, res) => {
  try {
    const itemTipo = await tipoSorteoItem(req.params.id);
    if (!puedeGestionarSorteos(req.admin, itemTipo || 'convenio'))
      return res.status(403).json({ ok: false, error: 'Sin permiso' });
    const { resultados } = req.body;
    await pool.query('DELETE FROM resultados_sorteo WHERE sorteo_id=$1', [req.params.id]);
    if (Array.isArray(resultados) && resultados.length) {
      for (let i = 0; i < resultados.length; i++) {
        const r = resultados[i];
        await pool.query(
          'INSERT INTO resultados_sorteo(sorteo_id,cip,nombres,unidad,cargo,orden) VALUES($1,$2,$3,$4,$5,$6)',
          [req.params.id, r.cip||'', r.nombres||'', r.unidad||'', r.cargo||'', i]);
      }
      const sorteoRow = await pool.query('SELECT item_id FROM sorteos_portal WHERE id=$1', [req.params.id]);
      const itemId = sorteoRow.rows[0]?.item_id;
      if (itemId) await sincronizarGanadoresSorteoEnItem(itemId, resultados);
    }
    res.json({ ok: true });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ── POST /admin/sorteos/:id/importar-inscritos — importar aceptados ───────────
app.post('/admin/sorteos/:id/importar-inscritos', requireAuth, async (req, res) => {
  try {
    const { item_id } = req.body;
    if (!item_id) return res.json({ ok: false, error: 'item_id requerido' });
    const itemTipo = await tipoItemPortal(item_id);
    if (!puedeGestionarSorteos(req.admin, itemTipo))
      return res.status(403).json({ ok: false, error: 'Sin permiso' });
    const insc = await pool.query(
      `SELECT cip,nombres,unidad,cargo FROM inscripciones
       WHERE item_id=$1 AND estado IN ('aprobado','ganador')
       ORDER BY fecha`,
      [item_id]);
    await pool.query('DELETE FROM resultados_sorteo WHERE sorteo_id=$1', [req.params.id]);
    for (let i = 0; i < insc.rows.length; i++) {
      const r = insc.rows[i];
      await pool.query(
        'INSERT INTO resultados_sorteo(sorteo_id,cip,nombres,unidad,cargo,orden) VALUES($1,$2,$3,$4,$5,$6)',
        [req.params.id, r.cip, r.nombres, r.unidad, r.cargo, i]);
    }
    res.json({ ok: true, importados: insc.rows.length });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ── PUT /admin/items/:id/plantilla — subir plantilla PDF ───────────────────────
app.put('/admin/items/:id/plantilla', requireAuth, async (req, res) => {
  try {
    const cur = await pool.query('SELECT tipo FROM items_portal WHERE id=$1', [req.params.id]);
    if (!cur.rows.length) return res.json({ ok: false, error: 'No encontrado' });
    if (!puedeGestionarItem(req.admin, cur.rows[0].tipo))
      return res.status(403).json({ ok: false, error: 'Sin permiso' });
    const { plantilla_pdf, plantilla_nombre } = req.body;
    await pool.query(
      'UPDATE items_portal SET plantilla_pdf=$1,plantilla_nombre=$2 WHERE id=$3',
      [plantilla_pdf||'', plantilla_nombre||'plantilla.pdf', req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ── GET /admin/inscripciones/:id/pdf — ver PDF de inscrito (admin) ─────────────
app.get('/admin/inscripciones/:id/pdf', requireAuth, async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT n.pdf_requisitos, n.pdf_nombre, i.tipo FROM inscripciones n JOIN items_portal i ON i.id=n.item_id WHERE n.id=$1',
      [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ ok: false, error: 'No encontrado' });
    if (!puedeGestionarItem(req.admin, r.rows[0].tipo))
      return res.status(403).json({ ok: false, error: 'Sin permiso' });
    if (!r.rows[0].pdf_requisitos)
      return res.json({ ok: false, error: 'Este inscrito no adjuntó PDF' });
    res.json({ ok: true, pdf: r.rows[0].pdf_requisitos, nombre: r.rows[0].pdf_nombre || 'requisitos.pdf' });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ── GET /admin/stats-gestion — resumen convocatorias / cursos ─────────────────
app.get('/admin/stats-gestion', requireAuth, async (req, res) => {
  try {
    const tipo = req.query.tipo || '';
    if (!['convenio', 'curso'].includes(tipo))
      return res.json({ ok: false, error: 'tipo inválido' });
    if (!puedeGestionarItem(req.admin, tipo) && !puedePublicarResultadosPdf(req.admin, tipo))
      return res.status(403).json({ ok: false, error: 'Sin permiso' });

    const itemsR = await pool.query(
      `SELECT COUNT(*)::int AS convocatorias,
        SUM(CASE WHEN estado='DISPONIBLE' THEN 1 ELSE 0 END)::int AS disponibles,
        SUM(CASE WHEN inscripciones_abiertas THEN 1 ELSE 0 END)::int AS inscripciones_abiertas
       FROM items_portal WHERE tipo=$1`, [tipo]);
    const inscR = await pool.query(
      `SELECT COUNT(n.id)::int AS total_inscritos,
        SUM(CASE WHEN n.estado='pendiente' THEN 1 ELSE 0 END)::int AS pendientes,
        SUM(CASE WHEN n.estado='verificado' THEN 1 ELSE 0 END)::int AS verificados,
        SUM(CASE WHEN n.estado='aprobado' THEN 1 ELSE 0 END)::int AS aprobados,
        SUM(CASE WHEN n.estado='ganador' THEN 1 ELSE 0 END)::int AS ganadores
       FROM inscripciones n JOIN items_portal i ON i.id=n.item_id WHERE i.tipo=$1`, [tipo]);
    const pubR = await pool.query(
      `SELECT COUNT(*)::int AS resultados_publicados FROM sorteos_portal s
       JOIN items_portal i ON i.id=s.item_id
       WHERE s.tipo='resultado' AND s.publicado=TRUE AND i.tipo=$1`, [tipo]);
    const ultimasR = await pool.query(
      `SELECT TO_CHAR(n.fecha,'DD/MM/YYYY HH24:MI') AS fecha, n.nombres, n.estado, i.titulo AS convocatoria
       FROM inscripciones n JOIN items_portal i ON i.id=n.item_id
       WHERE i.tipo=$1 ORDER BY n.fecha DESC LIMIT 8`, [tipo]);
    const activasR = await pool.query(
      `SELECT i.id, i.titulo, i.estado,
        (SELECT COUNT(*)::int FROM inscripciones n WHERE n.item_id=i.id) AS inscritos
       FROM items_portal i WHERE i.tipo=$1 ORDER BY i.orden, i.id DESC LIMIT 6`, [tipo]);

    res.json({
      ok: true,
      tipo,
      resumen: Object.assign({}, itemsR.rows[0] || {}, inscR.rows[0] || {}, pubR.rows[0] || {}),
      ultimasInscripciones: ultimasR.rows,
      convocatorias: activasR.rows
    });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ── Helpers de permisos para items ────────────────────────────────────────────
function puedeGestionarItem(admin, tipo) {
  return admin.rol === 'unitic';
}

function puedePublicarResultadosPdf(admin, tipo) {
  if (admin.rol === 'unitic') return true;
  const perms = normalizarPermisos(admin.permisos);
  if (tipo === 'convenio') return perms.includes('cms_convenios');
  if (tipo === 'curso') return perms.includes('cms_cursos');
  return false;
}

function puedeOperarInscritos(admin, tipo) {
  if (admin.rol === 'unitic') return true;
  return puedePublicarResultadosPdf(admin, tipo);
}

function puedeGestionarSorteos(admin, itemTipo) {
  if (admin.rol === 'unitic') return true;
  const perms = normalizarPermisos(admin.permisos);
  if (itemTipo === 'curso') return perms.includes('cms_cursos');
  return perms.includes('cms_convenios');
}

async function tipoItemPortal(itemId) {
  if (!itemId) return null;
  const r = await pool.query('SELECT tipo FROM items_portal WHERE id=$1', [itemId]);
  return r.rows[0]?.tipo || null;
}

async function tipoSorteoItem(sorteoId) {
  const r = await pool.query(
    'SELECT i.tipo FROM sorteos_portal s LEFT JOIN items_portal i ON i.id=s.item_id WHERE s.id=$1',
    [sorteoId]);
  return r.rows[0]?.tipo || null;
}

function normalizarCipDigits(cip) {
  const d = String(cip || '').replace(/\D/g, '');
  if (d.length < 6 || d.length > 12) return null;
  return d;
}

function normalizarCipConsulta(cip) {
  return normalizarCipDigits(cip);
}

function sqlCipIgual(campo) {
  return `regexp_replace(${campo}, '[^0-9]', '', 'g')`;
}

async function cipEnResultadosSorteoItem(itemId, cipDigits) {
  const r = await pool.query(
    `SELECT 1 FROM resultados_sorteo rs
     JOIN sorteos_portal s ON s.id = rs.sorteo_id
     WHERE s.item_id = $1 AND ${sqlCipIgual('rs.cip')} = $2
     LIMIT 1`,
    [itemId, cipDigits]);
  return r.rows.length > 0;
}

async function marcarInscripcionGanadorPorCip(itemId, cipDigits, observacion) {
  const obs = observacion || 'Seleccionado en sorteo público';
  const r = await pool.query(
    `UPDATE inscripciones SET estado='ganador', observacion=$1
     WHERE item_id=$2 AND ${sqlCipIgual('cip')}=$3
       AND estado IN ('aprobado','verificado','ganador','reserva')`,
    [obs, itemId, cipDigits]);
  return r.rowCount;
}

async function sincronizarGanadoresSorteoEnItem(itemId, resultados) {
  if (!itemId || !Array.isArray(resultados)) return 0;
  let n = 0;
  for (const res of resultados) {
    const cipNorm = normalizarCipDigits(res.cip);
    if (!cipNorm) continue;
    n += await marcarInscripcionGanadorPorCip(itemId, cipNorm);
  }
  return n;
}

function oficinaGestoraInscripcion(tipo) {
  if (tipo === 'curso') return 'Oficina de Educación Policial — REGPOL Callao';
  return 'Oficina de Convenios — REGPOL Callao';
}

function etiquetaEstadoPublico(estado, tipo) {
  const esConv = tipo === 'convenio';
  const mapa = {
    pendiente: esConv
      ? 'Expediente recibido — en revisión por Convenios'
      : 'Inscripción recibida — en revisión por Educación Policial',
    verificado: 'Expediente verificado — pendiente de aprobación final',
    aprobado: esConv
      ? 'Aprobado — habilitado para sorteo o lista de méritos'
      : 'Aprobado — en lista de selección',
    ganador: esConv
      ? 'VACANTE OCUPADA — seleccionado en convocatoria'
      : 'SELECCIONADO — vacante asignada en curso',
    reserva: 'Lista de reserva — no ocupó vacante en esta convocatoria',
    rechazado: 'Expediente no admitido — revise observaciones'
  };
  return mapa[estado] || estado;
}

function ubicacionTramitePublico(estado) {
  const mapa = {
    pendiente: 'Bandeja de recepción del área gestora',
    verificado: 'Revisión técnica del expediente',
    aprobado: 'Lista de habilitados / proceso de sorteo o selección',
    ganador: 'Proceso concluido — constancia de vacante disponible',
    reserva: 'Archivo de lista de reserva',
    rechazado: 'Expediente cerrado — no procede'
  };
  return mapa[estado] || 'En proceso';
}

// ── GET /portal/consulta-inscripcion?cip= — consulta pública por CIP ─────────
app.get('/portal/consulta-inscripcion', async (req, res) => {
  try {
    const cip = normalizarCipConsulta(req.query.cip);
    if (!cip) return res.json({ ok: false, error: 'Ingrese un CIP válido (solo números, 6 a 12 dígitos).' });
    const r = await pool.query(
      `SELECT n.id, n.cip, n.nombres, n.unidad, n.cargo, n.grado, n.estado, n.observacion,
              TO_CHAR(n.fecha, 'DD/MM/YYYY HH24:MI') AS fecha,
              n.area AS area_postulante, n.disponibilidad, n.dia_franco,
              i.id AS item_id, i.tipo, i.titulo, i.horario, i.lugar, i.fecha_inicio, i.duracion,
              i.descripcion, i.observaciones AS item_observaciones, i.vacantes,
              i.uniforme, i.contactos_responsables, i.requisitos
       FROM inscripciones n
       JOIN items_portal i ON i.id = n.item_id
       WHERE ${sqlCipIgual('n.cip')} = $1 AND i.visible = TRUE
       ORDER BY n.fecha DESC`,
      [cip]);
    const inscripciones = [];
    for (const row of r.rows) {
      let estado = row.estado;
      if (estado !== 'ganador') {
        const enSorteo = await cipEnResultadosSorteoItem(row.item_id, cip);
        if (enSorteo) {
          await marcarInscripcionGanadorPorCip(row.item_id, cip);
          estado = 'ganador';
        }
      }
      inscripciones.push({
        id: row.id,
        cip: row.cip,
        nombres: row.nombres,
        unidad: row.unidad,
        cargo: row.cargo,
        grado: row.grado,
        estado: estado,
        estado_legible: etiquetaEstadoPublico(estado, row.tipo),
        ubicacion_tramite: ubicacionTramitePublico(estado),
        oficina_gestora: oficinaGestoraInscripcion(row.tipo),
        observacion: row.observacion || '',
        fecha: row.fecha,
        area_postulante: row.area_postulante || '',
        disponibilidad: row.disponibilidad || '',
        dia_franco: row.dia_franco || '',
        item_id: row.item_id,
        tipo: row.tipo,
        convocatoria: row.titulo,
        horario: row.horario || '',
        lugar: row.lugar || '',
        fecha_inicio: row.fecha_inicio || '',
        duracion: row.duracion || '',
        vacantes: row.vacantes,
        uniforme: row.uniforme || '',
        contactos_responsables: row.contactos_responsables || '',
        es_ganador: estado === 'ganador',
        puede_descargar_constancia: estado === 'ganador'
      });
    }
    res.json({ ok: true, cip, total: inscripciones.length, inscripciones });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ── GET /portal/inscripciones/:id/constancia-vacante?cip= — PDF ganador ───────
app.get('/portal/inscripciones/:id/constancia-vacante', async (req, res) => {
  try {
    const cip = normalizarCipConsulta(req.query.cip);
    if (!cip) return res.json({ ok: false, error: 'CIP inválido.' });
    const id = parseInt(req.params.id, 10);
    if (!id) return res.json({ ok: false, error: 'Inscripción no válida.' });
    const r = await pool.query(
      `SELECT n.*, i.tipo, i.titulo, i.descripcion, i.requisitos, i.horario, i.lugar,
              i.fecha_inicio, i.duracion, i.observaciones, i.vacantes,
              i.uniforme, i.contactos_responsables
       FROM inscripciones n
       JOIN items_portal i ON i.id = n.item_id
       WHERE n.id = $1 AND ${sqlCipIgual('n.cip')} = $2 AND i.visible = TRUE`,
      [id, cip]);
    if (!r.rows.length) {
      return res.json({ ok: false, error: 'No se encontró inscripción para este CIP.' });
    }
    if (r.rows[0].estado !== 'ganador') {
      const enSorteo = await cipEnResultadosSorteoItem(r.rows[0].item_id, cip);
      if (enSorteo) {
        await marcarInscripcionGanadorPorCip(r.rows[0].item_id, cip);
        r.rows[0].estado = 'ganador';
      } else {
        return res.json({ ok: false, error: 'No se encontró constancia de vacante para este CIP.' });
      }
    }
    const row = r.rows[0];
    const buf = await generarPDFAsync('generarPDFConstanciaVacante', [row, row]);
    const titulo = 'Constancia — ' + (row.titulo || 'Vacante');
    const nombre = 'Constancia_' + row.cip + '.pdf';
    if (req.query.download === '1') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="' + nombre + '"');
      return res.send(buf);
    }
    res.json({
      ok: true,
      pdf: 'data:application/pdf;base64,' + buf.toString('base64'),
      nombre,
      titulo
    });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ── POST /admin/items/:id/aplicar-sorteo — persistir ganadores y reservas ─────
app.post('/admin/items/:id/aplicar-sorteo', requireAuth, async (req, res) => {
  try {
    const itemId = parseInt(req.params.id, 10);
    const cur = await pool.query('SELECT tipo FROM items_portal WHERE id=$1', [itemId]);
    if (!cur.rows.length) return res.json({ ok: false, error: 'Convocatoria no encontrada' });
    if (!puedeOperarInscritos(req.admin, cur.rows[0].tipo))
      return res.status(403).json({ ok: false, error: 'Sin permiso' });
    const ganadores = Array.isArray(req.body.ganadores) ? req.body.ganadores : [];
    const reservas = Array.isArray(req.body.reservas) ? req.body.reservas : [];
    let nGan = 0;
    let nRes = 0;
    for (const g of ganadores) {
      const insId = parseInt(g.id, 10);
      if (!insId) continue;
      const obs = g.tipo === 'vacaciones'
        ? 'Vacante automática por vacaciones'
        : 'Seleccionado en sorteo público';
      const r = await pool.query(
        `UPDATE inscripciones SET estado='ganador', observacion=$1
         WHERE id=$2 AND item_id=$3 AND estado IN ('aprobado','ganador','verificado')`,
        [obs, insId, itemId]);
      if (r.rowCount) nGan++;
    }
    if (ganadores.length && nGan === 0) {
      return res.json({
        ok: false,
        error: 'No se pudo marcar ningún ganador. Verifique que los inscritos sigan en estado aprobado.'
      });
    }
    for (const rid of reservas) {
      const insId = parseInt(rid, 10);
      if (!insId) continue;
      const r = await pool.query(
        `UPDATE inscripciones SET estado='reserva', observacion='No seleccionado en el sorteo'
         WHERE id=$1 AND item_id=$2 AND estado='aprobado'`,
        [insId, itemId]);
      if (r.rowCount) nRes++;
    }
    res.json({ ok: true, ganadores: nGan, reservas: nRes });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ── GET /portal/items — público ───────────────────────────────────────────────
app.get('/portal/items', async (req, res) => {
  try {
    const tipo = req.query.tipo || '';
    const cacheKey = tipo || '__all__';
    const cached = portalItemsCache.get(cacheKey);
    if (cached && cached.exp > Date.now()) {
      return res.json(cached.data);
    }
    let q = 'SELECT id,tipo,titulo,descripcion,estado,icono,color,vacantes,fecha_inicio,duracion,inscripciones_abiertas,orden FROM items_portal WHERE visible=TRUE';
    const args = [];
    if (tipo) { q += ' AND tipo=$1'; args.push(tipo); }
    q += ' ORDER BY orden,id';
    const r = await pool.query(q, args);
    const payload = { ok: true, items: r.rows };
    portalItemsCache.set(cacheKey, { data: payload, exp: Date.now() + PORTAL_ITEMS_CACHE_MS });
    res.json(payload);
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

const resultadosPdfCache = new Map();
const RESULTADOS_PDF_CACHE_MS = 120000;

function invalidarPortalItemsCache() {
  portalItemsCache.clear();
  resultadosPdfCache.clear();
}

const CONVENIOS_OFICIALES = [
  ['ATU (METRO 2 LIMA - CALLAO)', 'Control de transporte público — Metro Línea 2 Lima-Callao', 'fa-bus', 1],
  ['FELMO', 'Fiscalización y control de transporte', 'fa-gavel', 2],
  ['PLAN CELADOR', 'Apoyo a las comisarías', 'fa-shield-alt', 3],
  ['MUNICIPALIDAD PROV. CALLAO', 'Apoyo a la Municipalidad Provincial del Callao', 'fa-landmark', 4],
  ['MUNICIPALIDAD DISTRITAL VENTANILLA', 'Apoyo a la Municipalidad de Ventanilla', 'fa-building', 5],
  ['PLUZ ENERGIA (EX ENEL)', 'Seguridad en instalaciones de energía', 'fa-bolt', 6],
  ['APM-MTC', 'Seguridad del terminal portuario', 'fa-anchor', 7],
  ['SEDAPAL', 'Apoyo a servicios de agua potable', 'fa-tint', 8],
  ['ATU FISCALIZACION', 'Fiscalización de transporte urbano', 'fa-car', 9],
  ['MUNI. DISTR. CARMEN DE LEGUA Y REYNOSO', 'Apoyo a la Municipalidad de Carmen de la Legua', 'fa-building', 10],
  ['NUEVO INGRESO AEROPUERTO (BY PAS)', 'Seguridad en nuevo ingreso aeroportuario', 'fa-plane', 11]
];
const REQS_CONV_OFICIAL = JSON.stringify([
  'Pertenecer a la REGPOL Callao.',
  'Encontrarse en situación de Actividad.',
  'No tener sanciones vigentes.'
]);

async function sincronizarConveniosOficiales(db, invalidarCache = true) {
  const titulosUpper = CONVENIOS_OFICIALES.map(c => c[0].toUpperCase());
  for (const [titulo, desc, icono, orden] of CONVENIOS_OFICIALES) {
    await db.query(
      `INSERT INTO items_portal(tipo,titulo,descripcion,icono,requisitos,estado,visible,orden,ventana_inscripcion)
       SELECT 'convenio',$1::varchar,$2::text,$3::varchar,$4::jsonb,'DISPONIBLE',TRUE,$5::integer,'Las inscripciones se habilitan del 20 al 25 de cada mes.'
       WHERE NOT EXISTS (SELECT 1 FROM items_portal WHERE tipo='convenio' AND UPPER(TRIM(titulo))=UPPER(TRIM($6::text)))`,
      [titulo, desc, icono, REQS_CONV_OFICIAL, orden, titulo]
    );
    await db.query(
      `UPDATE items_portal SET orden=$1, visible=TRUE,
        descripcion=CASE WHEN TRIM(COALESCE(descripcion,''))='' THEN $2 ELSE descripcion END,
        icono=CASE WHEN TRIM(COALESCE(icono,'')) IN ('','fa-file') THEN $3 ELSE icono END
       WHERE tipo='convenio' AND UPPER(TRIM(titulo))=UPPER(TRIM($4))`,
      [orden, desc, icono, titulo]
    );
  }
  await db.query(
    `UPDATE items_portal SET visible=FALSE
     WHERE tipo='convenio' AND UPPER(TRIM(titulo)) NOT IN (${titulosUpper.map((_, i) => `$${i + 1}`).join(',')})`,
    titulosUpper
  );
  if (invalidarCache) invalidarPortalItemsCache();
  return CONVENIOS_OFICIALES.length;
}

function invalidarResultadosPdfCache() {
  resultadosPdfCache.clear();
}

function invalidarUnidadesPublicoCache() {
  unidadesPublicoCache = null;
}

// ── GET /portal/resultados-pdf — público (lista sin PDF) ─────────────────────
app.get('/portal/resultados-pdf', async (req, res) => {
  try {
    const tipo = req.query.tipo || 'convenio';
    const cacheKey = 'pdf_' + tipo;
    const cached = resultadosPdfCache.get(cacheKey);
    if (cached && cached.exp > Date.now()) return res.json(cached.data);
    const r = await pool.query(
      `SELECT r.id, r.titulo, r.pdf_nombre, r.orden, r.item_id, i.titulo AS item_titulo
       FROM resultados_pdf_portal r
       LEFT JOIN items_portal i ON i.id = r.item_id
       WHERE r.publicado=TRUE AND r.tipo=$1 AND r.pdf_data IS NOT NULL AND r.pdf_data<>''
       ORDER BY r.orden, r.id DESC`,
      [tipo]);
    const payload = { ok: true, resultados: r.rows };
    resultadosPdfCache.set(cacheKey, { data: payload, exp: Date.now() + RESULTADOS_PDF_CACHE_MS });
    res.json(payload);
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ── GET /portal/resultados-pdf/:id — público (PDF para ver/descargar) ─────────
app.get('/portal/resultados-pdf/:id', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, titulo, pdf_data, pdf_nombre FROM resultados_pdf_portal
       WHERE id=$1 AND publicado=TRUE AND pdf_data IS NOT NULL AND pdf_data<>''`,
      [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ ok: false, error: 'No encontrado' });
    res.json({ ok: true, resultado: r.rows[0] });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ── GET /admin/resultados-pdf ─────────────────────────────────────────────────
app.get('/admin/resultados-pdf', requireAuth, async (req, res) => {
  try {
    const tipo = req.query.tipo || 'convenio';
    if (!puedePublicarResultadosPdf(req.admin, tipo))
      return res.status(403).json({ ok: false, error: 'Sin permiso' });
    const r = await pool.query(
      `SELECT r.id, r.tipo, r.titulo, r.pdf_nombre, r.publicado, r.orden, r.item_id, r.creado,
              i.titulo AS item_titulo,
              CASE WHEN r.pdf_data IS NOT NULL AND r.pdf_data<>'' THEN true ELSE false END AS tiene_pdf
       FROM resultados_pdf_portal r
       LEFT JOIN items_portal i ON i.id = r.item_id
       WHERE r.tipo=$1
       ORDER BY r.orden, r.id DESC`,
      [tipo]);
    res.json({ ok: true, resultados: r.rows });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ── POST /admin/resultados-pdf ────────────────────────────────────────────────
app.post('/admin/resultados-pdf', requireAuth, async (req, res) => {
  try {
    const { tipo, item_id, titulo, pdf_data, pdf_nombre, publicado, orden } = req.body;
    const t = tipo || 'convenio';
    if (!puedePublicarResultadosPdf(req.admin, t))
      return res.status(403).json({ ok: false, error: 'Sin permiso' });
    if (!titulo || !titulo.trim()) return res.json({ ok: false, error: 'El título es obligatorio.' });
    if (!pdf_data) return res.json({ ok: false, error: 'Debe adjuntar un archivo PDF.' });
    if (pdf_data.length > 12 * 1024 * 1024)
      return res.json({ ok: false, error: 'El PDF no debe superar 10 MB.' });
    const r = await pool.query(
      `INSERT INTO resultados_pdf_portal(tipo,item_id,titulo,pdf_data,pdf_nombre,publicado,orden)
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [t, item_id || null, titulo.trim().toUpperCase(), pdf_data, pdf_nombre || 'resultado.pdf',
       publicado !== false, parseInt(orden) || 0]);
    invalidarResultadosPdfCache();
    res.json({ ok: true, id: r.rows[0].id });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ── PUT /admin/resultados-pdf/:id ─────────────────────────────────────────────
app.put('/admin/resultados-pdf/:id', requireAuth, async (req, res) => {
  try {
    const cur = await pool.query('SELECT tipo FROM resultados_pdf_portal WHERE id=$1', [req.params.id]);
    if (!cur.rows.length) return res.json({ ok: false, error: 'No encontrado' });
    if (!puedePublicarResultadosPdf(req.admin, cur.rows[0].tipo))
      return res.status(403).json({ ok: false, error: 'Sin permiso' });
    const { item_id, titulo, pdf_data, pdf_nombre, publicado, orden } = req.body;
    if (!titulo || !titulo.trim()) return res.json({ ok: false, error: 'El título es obligatorio.' });
    if (pdf_data && pdf_data.length > 12 * 1024 * 1024)
      return res.json({ ok: false, error: 'El PDF no debe superar 10 MB.' });
    const curPdf = await pool.query('SELECT pdf_data, pdf_nombre FROM resultados_pdf_portal WHERE id=$1', [req.params.id]);
    const pdfFinal = pdf_data || curPdf.rows[0].pdf_data;
    const nomFinal = pdf_nombre || curPdf.rows[0].pdf_nombre;
    if (!pdfFinal) return res.json({ ok: false, error: 'Debe adjuntar un archivo PDF.' });
    await pool.query(
      `UPDATE resultados_pdf_portal SET item_id=$1,titulo=$2,pdf_data=$3,pdf_nombre=$4,publicado=$5,orden=$6
       WHERE id=$7`,
      [item_id || null, titulo.trim().toUpperCase(), pdfFinal, nomFinal,
       publicado !== false, parseInt(orden) || 0, req.params.id]);
    invalidarResultadosPdfCache();
    res.json({ ok: true });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ── DELETE /admin/resultados-pdf/:id — solo Super Admin ───────────────────────
app.delete('/admin/resultados-pdf/:id', requireAuth, async (req, res) => {
  try {
    const cur = await pool.query('SELECT tipo FROM resultados_pdf_portal WHERE id=$1', [req.params.id]);
    if (!cur.rows.length) return res.json({ ok: false, error: 'No encontrado' });
    if (!puedePublicarResultadosPdf(req.admin, cur.rows[0].tipo))
      return res.status(403).json({ ok: false, error: 'Sin permiso para eliminar este resultado.' });
    await pool.query('DELETE FROM resultados_pdf_portal WHERE id=$1', [req.params.id]);
    invalidarResultadosPdfCache();
    res.json({ ok: true });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ── GET /admin/resultados-pdf/:id/pdf — vista previa admin ────────────────────
app.get('/admin/resultados-pdf/:id/pdf', requireAuth, async (req, res) => {
  try {
    const r = await pool.query('SELECT tipo, titulo, pdf_data, pdf_nombre FROM resultados_pdf_portal WHERE id=$1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ ok: false, error: 'No encontrado' });
    if (!puedePublicarResultadosPdf(req.admin, r.rows[0].tipo))
      return res.status(403).json({ ok: false, error: 'Sin permiso' });
    res.json({ ok: true, resultado: r.rows[0] });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ── GET /portal/items/:id — público (detalle completo) ────────────────────────
app.get('/portal/items/:id', async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT * FROM items_portal WHERE id=$1 AND visible=TRUE', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ ok: false, error: 'No encontrado' });
    res.json({ ok: true, item: r.rows[0] });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ── POST /portal/items/:id/inscribir — público ────────────────────────────────
app.post('/portal/items/:id/inscribir', async (req, res) => {
  try {
    const item = await pool.query(
      'SELECT id,titulo,inscripciones_abiertas,vacantes FROM items_portal WHERE id=$1 AND visible=TRUE',
      [req.params.id]);
    if (!item.rows.length) return res.json({ ok: false, error: 'Item no encontrado' });
    if (!item.rows[0].inscripciones_abiertas)
      return res.json({ ok: false, error: 'Las inscripciones no están abiertas para esta convocatoria.' });
    const {
      cip, nombres, unidad, cargo, telefono, email,
      pdf_requisitos, pdf_nombre,
      dni, grado, area, arma, disponibilidad, dia_franco,
      fecha_egreso, tiempo_servicio
    } = req.body;
    const cipNorm = normalizarCipDigits(cip);
    if (!cipNorm) return res.json({ ok: false, error: 'CIP inválido.' });
    if (!nombres) return res.json({ ok: false, error: 'CIP y nombres son obligatorios.' });
    if (!area || !String(area).trim()) return res.json({ ok: false, error: 'El área es obligatoria.' });
    if (!cargo || !String(cargo).trim()) return res.json({ ok: false, error: 'El cargo es obligatorio.' });
    const dup = await pool.query(
      `SELECT id FROM inscripciones WHERE item_id=$1 AND ${sqlCipIgual('cip')}=$2`,
      [req.params.id, cipNorm]);
    if (dup.rows.length)
      return res.json({ ok: false, error: 'Ya existe una inscripción con ese CIP para esta convocatoria.' });
    const pdfBase64 = pdf_requisitos || '';
    if (pdfBase64 && pdfBase64.length > 7 * 1024 * 1024)
      return res.json({ ok: false, error: 'El PDF no debe superar 5 MB.' });
    const feNorm = fecha_egreso && fecha_egreso.match(/^\d{4}-\d{2}-\d{2}$/) ? fecha_egreso : null;
    await pool.query(
      `INSERT INTO inscripciones
         (item_id,cip,nombres,unidad,cargo,telefono,email,pdf_requisitos,pdf_nombre,
          dni,grado,area,arma,disponibilidad,dia_franco,fecha_egreso,tiempo_servicio)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [req.params.id, cipNorm, nombres, unidad||'', cargo||'', telefono||'', email||'',
       pdfBase64, pdf_nombre||'requisitos.pdf',
       dni||'', grado||'', area||'', arma||'', disponibilidad||'', dia_franco||'',
       feNorm, tiempo_servicio||'']);
    res.json({ ok: true, mensaje: 'Inscripción registrada correctamente.' });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ── POST /admin/sync-convenios — asegurar los 11 convenios oficiales ───────────
app.post('/admin/sync-convenios', requireAuth, async (req, res) => {
  try {
    if (req.admin.rol !== 'unitic')
      return res.status(403).json({ ok: false, error: 'Sin permiso' });
    const total = await sincronizarConveniosOficiales(pool, true);
    res.json({ ok: true, total });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ── GET /admin/items ──────────────────────────────────────────────────────────
app.get('/admin/items', requireAuth, async (req, res) => {
  try {
    const { tipo } = req.query;
    const esU = req.admin.rol === 'unitic';
    if (!esU) {
      if (!tipo || !puedePublicarResultadosPdf(req.admin, tipo))
        return res.status(403).json({ ok: false, error: 'Sin permiso' });
      const r = await pool.query(
        'SELECT id, tipo, titulo, estado FROM items_portal WHERE tipo=$1 AND visible=TRUE ORDER BY orden, id',
        [tipo]);
      return res.json({ ok: true, items: r.rows });
    }
    let q = 'SELECT i.*, (SELECT COUNT(*) FROM inscripciones n WHERE n.item_id=i.id) AS total_inscritos FROM items_portal i WHERE 1=1';
    const args = [];
    if (tipo) {
      q += ` AND i.tipo=$${args.length+1}`;
      args.push(tipo);
    }
    q += ' ORDER BY i.tipo,i.orden,i.id';
    const r = await pool.query(q, args);
    res.json({ ok: true, items: r.rows });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ── POST /admin/items ──────────────────────────────────────────────────────────
app.post('/admin/items', requireAuth, async (req, res) => {
  try {
    const { tipo, titulo, descripcion, estado, icono, color, requisitos, horario,
            vacantes, fecha_inicio, duracion, lugar, observaciones, ventana_inscripcion,
            formulario_url, inscripciones_abiertas, visible, orden, uniforme, contactos_responsables } = req.body;
    if (!puedeGestionarItem(req.admin, tipo))
      return res.status(403).json({ ok: false, error: 'Sin permiso' });
    if (!titulo) return res.json({ ok: false, error: 'El título es obligatorio.' });
    const r = await pool.query(
      `INSERT INTO items_portal(tipo,titulo,descripcion,estado,icono,color,requisitos,horario,
        vacantes,fecha_inicio,duracion,lugar,observaciones,ventana_inscripcion,formulario_url,inscripciones_abiertas,visible,orden,uniforme,contactos_responsables)
       VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING id`,
      [tipo, titulo, descripcion||'', estado||'DISPONIBLE', icono||'fa-file', color||'#004d3d',
       JSON.stringify(Array.isArray(requisitos)?requisitos:[]),
       horario||'', parseInt(vacantes)||0, fecha_inicio||'', duracion||'',
       lugar||'', observaciones||'', ventana_inscripcion||'', formulario_url||'',
       !!inscripciones_abiertas, visible!==false, parseInt(orden)||0,
       uniforme||'', contactos_responsables||'']);
    invalidarPortalItemsCache();
    res.json({ ok: true, id: r.rows[0].id });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ── PUT /admin/items/:id ───────────────────────────────────────────────────────
app.put('/admin/items/:id', requireAuth, async (req, res) => {
  try {
    const cur = await pool.query('SELECT tipo FROM items_portal WHERE id=$1', [req.params.id]);
    if (!cur.rows.length) return res.json({ ok: false, error: 'No encontrado' });
    if (!puedeGestionarItem(req.admin, cur.rows[0].tipo))
      return res.status(403).json({ ok: false, error: 'Sin permiso' });
    const { titulo, descripcion, estado, icono, color, requisitos, horario,
            vacantes, fecha_inicio, duracion, lugar, observaciones, ventana_inscripcion,
            formulario_url, inscripciones_abiertas, visible, orden, uniforme, contactos_responsables } = req.body;
    await pool.query(
      `UPDATE items_portal SET titulo=$1,descripcion=$2,estado=$3,icono=$4,color=$5,
        requisitos=$6::jsonb,horario=$7,vacantes=$8,fecha_inicio=$9,duracion=$10,
        lugar=$11,observaciones=$12,ventana_inscripcion=$13,formulario_url=$14,inscripciones_abiertas=$15,
        visible=$16,orden=$17,uniforme=$18,contactos_responsables=$19,actualizado=NOW() WHERE id=$20`,
      [titulo, descripcion||'', estado||'DISPONIBLE', icono||'fa-file', color||'#004d3d',
       JSON.stringify(Array.isArray(requisitos)?requisitos:[]),
       horario||'', parseInt(vacantes)||0, fecha_inicio||'', duracion||'',
       lugar||'', observaciones||'', ventana_inscripcion||'', formulario_url||'',
       !!inscripciones_abiertas, visible!==false, parseInt(orden)||0,
       uniforme||'', contactos_responsables||'', req.params.id]);
    invalidarPortalItemsCache();
    res.json({ ok: true });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ── DELETE /admin/items/:id ────────────────────────────────────────────────────
app.delete('/admin/items/:id', requireAuth, async (req, res) => {
  try {
    const cur = await pool.query('SELECT tipo FROM items_portal WHERE id=$1', [req.params.id]);
    if (!cur.rows.length) return res.json({ ok: false, error: 'No encontrado' });
    if (!puedeGestionarItem(req.admin, cur.rows[0].tipo))
      return res.status(403).json({ ok: false, error: 'Sin permiso' });
    await pool.query('DELETE FROM items_portal WHERE id=$1', [req.params.id]);
    invalidarPortalItemsCache();
    res.json({ ok: true });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ── GET /admin/items/:id/inscritos ─────────────────────────────────────────────
app.get('/admin/items/:id/inscritos', requireAuth, async (req, res) => {
  try {
    const cur = await pool.query('SELECT tipo FROM items_portal WHERE id=$1', [req.params.id]);
    if (!cur.rows.length) return res.json({ ok: false, error: 'No encontrado' });
    if (!puedeOperarInscritos(req.admin, cur.rows[0].tipo))
      return res.status(403).json({ ok: false, error: 'Sin permiso' });
    const r = await pool.query(
      `SELECT id,item_id,cip,dni,grado,nombres,unidad,area,cargo,telefono,email,
              arma,disponibilidad,dia_franco,fecha_egreso,tiempo_servicio,
              estado,observacion,fecha,
              CASE WHEN pdf_requisitos IS NOT NULL AND pdf_requisitos<>'' THEN true ELSE false END AS tiene_pdf,
              pdf_nombre
       FROM inscripciones WHERE item_id=$1 ORDER BY fecha ASC`, [req.params.id]);
    res.json({ ok: true, inscritos: r.rows, tipo: cur.rows[0].tipo });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ── GET /admin/items/:id/candidatos — aprobados para la rueda de sorteo ────────
app.get('/admin/items/:id/candidatos', requireAuth, async (req, res) => {
  try {
    const cur = await pool.query(
      'SELECT tipo,titulo,vacantes,horario,duracion,lugar,fecha_inicio,descripcion FROM items_portal WHERE id=$1',
      [req.params.id]);
    if (!cur.rows.length) return res.json({ ok: false, error: 'No encontrado' });
    if (!puedeOperarInscritos(req.admin, cur.rows[0].tipo))
      return res.status(403).json({ ok: false, error: 'Sin permiso' });
    const r = await pool.query(
      `SELECT id,cip,dni,grado,nombres,unidad,area,cargo,disponibilidad,dia_franco,tiempo_servicio,estado
       FROM inscripciones WHERE item_id=$1 AND estado IN ('verificado','aprobado','ganador','reserva')
       ORDER BY fecha ASC`, [req.params.id]);
    res.json({ ok: true, candidatos: r.rows, item: cur.rows[0] });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ── PUT /admin/inscripciones/:id ───────────────────────────────────────────────
app.put('/admin/inscripciones/:id', requireAuth, async (req, res) => {
  try {
    const cur = await pool.query(
      'SELECT n.item_id, i.tipo FROM inscripciones n JOIN items_portal i ON i.id=n.item_id WHERE n.id=$1',
      [req.params.id]);
    if (!cur.rows.length) return res.json({ ok: false, error: 'No encontrado' });
    if (!puedeOperarInscritos(req.admin, cur.rows[0].tipo))
      return res.status(403).json({ ok: false, error: 'Sin permiso' });
    const { estado, observacion } = req.body;
    await pool.query(
      'UPDATE inscripciones SET estado=$1,observacion=$2 WHERE id=$3',
      [estado||'pendiente', observacion||'', req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ── DELETE /admin/inscripciones/:id ───────────────────────────────────────────
app.delete('/admin/inscripciones/:id', requireAuth, async (req, res) => {
  try {
    const cur = await pool.query(
      'SELECT n.item_id, i.tipo FROM inscripciones n JOIN items_portal i ON i.id=n.item_id WHERE n.id=$1',
      [req.params.id]);
    if (!cur.rows.length) return res.json({ ok: false, error: 'No encontrado' });
    if (!puedeGestionarItem(req.admin, cur.rows[0].tipo))
      return res.status(403).json({ ok: false, error: 'Sin permiso' });
    await pool.query('DELETE FROM inscripciones WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ── Iniciar (servidor primero, BD en segundo plano — evita HTTP/2 timeout en Railway) ─
let dbListo = false;

function iniciarDB() {
  return migrarColumnasPortal()
    .then(function() { return initDB(); })
    .then(function() {
      dbListo = true;
      console.log('PostgreSQL listo.');
    })
    .catch(function(e) {
      console.error('Error init DB (reintento en 15s):', e.message);
      if (e.stack) console.error(e.stack.split('\n').slice(0, 4).join('\n'));
      setTimeout(iniciarDB, 15000);
    });
}

app.listen(PORT, '0.0.0.0', function() {
  console.log('\n=== REGPOL Callao — Puerto ' + PORT + ' ===');
  setImmediate(precalentarEstaticos);
  iniciarDB();
});
