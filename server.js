/*
  REGPOL Callao — Backend Node.js + PostgreSQL (Railway)
  Ing. Anthony Ccayo — UNITIC — 2026
*/

const express  = require('express');
const cors     = require('cors');
const path     = require('path');
const fs       = require('fs');
const crypto   = require('crypto');
const { Pool } = require('pg');
const { generarPDFIndividual, generarPDFComisaria, calcularMMPI2, interpretarT, contarRespuestas, formatearArmamentoLegible } = require('./pdf_gen');

const app  = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
  max: 12,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

const authCache = new Map();
const AUTH_CACHE_TTL = 5 * 60 * 1000;

// ── Helpers ────────────────────────────────────────────────────────────────────
const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');

function calcularEdadDesdeISO(fecha_nac) {
  if (!fecha_nac) return 0;
  const nac = new Date(fecha_nac);
  if (isNaN(nac.getTime())) return 0;
  const hoy = new Date();
  let edad = hoy.getFullYear() - nac.getFullYear();
  const m = hoy.getMonth() - nac.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
  return edad;
}

// ── Inicializar tablas + seed ──────────────────────────────────────────────────
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

    ALTER TABLE items_portal ADD COLUMN IF NOT EXISTS plantilla_pdf TEXT DEFAULT '';
    ALTER TABLE items_portal ADD COLUMN IF NOT EXISTS plantilla_nombre VARCHAR(200) DEFAULT '';

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

    CREATE TABLE IF NOT EXISTS portal_configuracion (
      id         INTEGER PRIMARY KEY DEFAULT 1,
      data_json  TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Admins por defecto
  const adminsDefecto = [
    ['admin_unitic',    sha256('AdminUNITIC2026'), 'unitic',   'UNITIC REGPOL Callao', null, '[]'],
    ['psicologia',      sha256('Psico2026!'),      'usuario',  'Oficina de Psicología',  null, '["evaluaciones","descargas"]'],
    ['convenios',       sha256('Convenios2026!'),  'usuario',  'Oficina de Convenios',   null, '["cms_convenios"]'],
    ['educacion',       sha256('Educacion2026!'),  'usuario',  'Oficina de Educación',   null, '["cms_cursos"]'],
    ['imagen',          sha256('Imagen2026!'),     'usuario',  'Oficina de Imagen',      null, '["cms_inicio","cms_resena","cms_labor","cms_novedades"]'],
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

  // Seed divisiones solo la primera vez (evita 40+ queries en cada reinicio)
  const { rows: divRows } = await pool.query('SELECT COUNT(*) AS t FROM divisiones');
  if (parseInt(divRows[0].t) === 0) {
    await sincronizarDivisionesUnidades();
  } else {
    console.log('Divisiones ya cargadas (' + divRows[0].t + '), sync omitido.');
  }

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
  ]}
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
  for (let d = 0; d < DIVISIONES_CANON.length; d++) {
    const div = DIVISIONES_CANON[d];
    const tipo = div.nombre === 'DIVUES' ? 'especializada' : 'comisaria';
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
  console.log('Divisiones sincronizadas: DIVOPUS 1-3 + DIVUES.');
  await seedContactoComisarias();
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
app.use(express.json({ limit: '12mb' }));
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
    const cached = authCache.get(token);
    if (cached && cached.exp > Date.now()) {
      req.admin = cached.admin;
      return next();
    }
    const decoded = Buffer.from(token, 'base64').toString();
    const colon   = decoded.indexOf(':');
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
    `INSERT INTO configuracion (clave, valor, actualizado) VALUES ($1,$2,NOW())
     ON CONFLICT (clave) DO UPDATE SET valor=$2, actualizado=NOW()`,
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
  let unidades = [];
  const raw = await getConfig('unidades_activas');
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) unidades = parsed;
    } catch (e) { /* ignorar */ }
  }
  if (!unidades.length) {
    const legacy = await getConfig('comisaria_activa');
    if (legacy) unidades = [legacy];
  }
  return unidades.map(u => String(u).trim().toUpperCase()).filter(Boolean);
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
    if (configCache && configCacheExp > Date.now()) {
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
    const { usuario, password } = req.body;
    const r = await pool.query('SELECT * FROM admins WHERE usuario=$1 AND passhash=$2',
      [usuario, sha256(password)]);
    if (!r.rows.length) return res.json({ ok: false, error: 'Credenciales incorrectas' });
    const a = r.rows[0];
    const token = Buffer.from(`${usuario}:${password}`).toString('base64');
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
    const { comisaria, unidad, nombres, cip, dni, fecha_nac, edad, cargo, grado, sexo, armamento, foto, respuestas, completada } = req.body;
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

    if (exist.rows.length) {
      await pool.query(
        `UPDATE evaluaciones SET comisaria=$1, unidad=$2, nombres=$3, dni=$4, fecha_nac=$5, edad=$6,
         cargo=$7, foto=COALESCE(NULLIF($8,''), foto), respuestas=$9, completada=$10, bloque_max=$11,
         sexo=$12, armamento=$13, grado=$14, fecha=NOW() WHERE id=$15`,
        [comisaria || '', unidad || '', nombres || '', dni || '', fecha_nac || null,
         edadFinal, cargo || '', foto || '', respuestas || {}, !!completada, totalResp,
         sexo || '', armamentoStr, grado || '', exist.rows[0].id]
      );
    } else {
      await pool.query(
        `INSERT INTO evaluaciones (comisaria,unidad,nombres,cip,dni,fecha_nac,edad,cargo,sexo,armamento,foto,grado,respuestas,completada,bloque_max)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [comisaria || '', unidad || '', nombres || '', cip || '', dni || '',
         fecha_nac || null, edadFinal, cargo || '', sexo || '', armamentoStr,
         foto || '', grado || '', respuestas || {}, !!completada, totalResp]
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
    const { cip, nombres, comisaria, unidad, cargo, grado, sexo, armamento, foto, bloque, total, respuestas, dni, fecha_nac, edad } = req.body;
    const clave = (cip || 'anonimo').toLowerCase().trim();
    const armamentoStr = Array.isArray(armamento) ? armamento.join(', ') : (armamento || '');
    const totalCalc = contarRespuestasObj(respuestas).total;
    const totalFinal = Math.max(parseInt(total, 10) || 0, totalCalc);
    const edadFinal = parseInt(edad, 10) || calcularEdadDesdeISO(fecha_nac) || null;
    const merged = await mergeRespuestasEnProgreso(clave, respuestas, bloque);
    const totalGuardar = Math.max(totalFinal, merged.total);
    const bloqueGuardar = merged.bloque_max;
    // Agregar columnas extra a progresos si no existen (BD antiguas)
    await pool.query(`ALTER TABLE progresos ADD COLUMN IF NOT EXISTS bloque_max SMALLINT DEFAULT 0`).catch(()=>{});
    await pool.query(`ALTER TABLE progresos ADD COLUMN IF NOT EXISTS total_resp SMALLINT DEFAULT 0`).catch(()=>{});
    await pool.query(`ALTER TABLE progresos ADD COLUMN IF NOT EXISTS respuestas JSONB`).catch(()=>{});
    await pool.query(`ALTER TABLE progresos ADD COLUMN IF NOT EXISTS unidad VARCHAR(150)`).catch(()=>{});
    await pool.query(`ALTER TABLE progresos ADD COLUMN IF NOT EXISTS cargo VARCHAR(80)`).catch(()=>{});
    await pool.query(`ALTER TABLE progresos ADD COLUMN IF NOT EXISTS sexo VARCHAR(20)`).catch(()=>{});
    await pool.query(`ALTER TABLE progresos ADD COLUMN IF NOT EXISTS armamento TEXT`).catch(()=>{});
    await pool.query(`ALTER TABLE progresos ADD COLUMN IF NOT EXISTS foto TEXT`).catch(()=>{});
    await pool.query(`ALTER TABLE progresos ADD COLUMN IF NOT EXISTS grado VARCHAR(80)`).catch(()=>{});
    await pool.query(`ALTER TABLE progresos ADD COLUMN IF NOT EXISTS dni VARCHAR(20)`).catch(()=>{});
    await pool.query(`ALTER TABLE progresos ADD COLUMN IF NOT EXISTS fecha_nac DATE`).catch(()=>{});
    await pool.query(`ALTER TABLE progresos ADD COLUMN IF NOT EXISTS edad SMALLINT`).catch(()=>{});
    await pool.query(
      `INSERT INTO progresos (clave,cip,nombres,comisaria,unidad,bloque_max,total_resp,respuestas,actualizado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
       ON CONFLICT (clave) DO UPDATE SET
         nombres=$3, comisaria=$4, unidad=$5, bloque_max=$6,
         total_resp=$7, respuestas=$8, actualizado=NOW()`,
      [clave, cip||'', nombres||'', comisaria||'', unidad||'', bloqueGuardar, totalGuardar, merged.respuestas]
    );
    await pool.query(
      `UPDATE progresos SET cargo=$2, sexo=$3, armamento=$4,
         foto=COALESCE(NULLIF($5,''),foto), grado=COALESCE(NULLIF($6,''),grado),
         dni=COALESCE(NULLIF($7,''),dni), fecha_nac=COALESCE($8,fecha_nac), edad=COALESCE($9,edad)
       WHERE clave=$1`,
      [clave, cargo||'', sexo||'', armamentoStr, foto||'', grado||'', dni||'', fecha_nac || null, edadFinal]
    ).catch(()=>{});
    res.json({ ok: true });
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
      grado: row.grado || '', cargo: row.cargo || '', sexo: row.sexo || '',
      dni: row.dni || '', edad: row.edad || null, fecha_nac: fechaNac,
      armamento: row.armamento || '', foto: row.foto || '',
      bloque: row.bloque_max, total: totalCalc, respuestas: row.respuestas,
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
              TO_CHAR(actualizado,'DD/MM/YYYY HH24:MI') AS ultima
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
      sexo: prog.sexo || ev.sexo,
      armamento: prog.armamento || ev.armamento,
      foto: prog.foto || ev.foto
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
      solo_progreso: true
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
    grado: p.grado || '',
    cargo: p.cargo || '',
    sexo: p.sexo || '',
    armamento: p.armamento || '',
    foto: p.foto || '',
    edad: p.edad || null,
    bloque_max: p.bloque_max || 0,
    completada: false,
    respuestas: statsMerged.respuestas,
    fecha: p.fecha || (p.actualizado
      ? new Date(p.actualizado).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '—'),
    total_resp: totalResp
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
            p.bloque_max, NULL::SMALLINT AS edad,
            GREATEST(COALESCE(p.total_resp, 0), ${sqlContarRespuestas('p.respuestas')}) AS total_resp,
            FALSE AS completada, TRUE AS solo_progreso,
            TO_CHAR(p.actualizado,'DD/MM/YYYY HH24:MI') AS fecha
     FROM progresos p ${where}
     ORDER BY p.actualizado DESC LIMIT 200`,
    params
  );
  return r.rows;
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
      `SELECT id, TO_CHAR(fecha,'DD/MM/YYYY HH24:MI') AS fecha, comisaria, unidad, nombres, cip, dni,
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
              TO_CHAR(actualizado,'DD/MM/YYYY HH24:MI') AS fecha
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
      `SELECT id, cip, TO_CHAR(fecha,'DD/MM/YYYY HH24:MI') AS fecha, comisaria, unidad, nombres, completada,
              ${sqlContarRespuestas('respuestas')} AS total_resp,
              FALSE AS solo_progreso
       FROM evaluaciones ${whereAdmin} ORDER BY fecha DESC LIMIT 10`, params);

    const ultimasProgR = await pool.query(
      `SELECT NULL::int AS id, p.cip, TO_CHAR(p.actualizado,'DD/MM/YYYY HH24:MI') AS fecha,
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
       FROM items_portal WHERE tipo='convenio'`);
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
        TO_CHAR(fecha,'DD/MM/YYYY HH24:MI') AS fecha,
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
    const porPagina = 20;
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
      `SELECT id, TO_CHAR(fecha,'DD/MM/YYYY HH24:MI') AS fecha, comisaria, unidad,
              nombres, cip, dni, edad, grado, completada, bloque_max,
              ${sqlContarRespuestas('respuestas')} AS total_resp,
              FALSE AS solo_progreso
       FROM evaluaciones ${where} ORDER BY fecha DESC LIMIT $${pi} OFFSET $${pi+1}`,
      [...params, porPagina, offset]
    );

    const rowsEnriquecidas = [];
    for (const row of rows.rows) {
      rowsEnriquecidas.push(await fusionarFilaListadoEval(row));
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
    );

    res.json({ ok: true, rows: merged, total: total + progresosRows.length, pagina, paginas });
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
      'SELECT id, cip, unidad, comisaria FROM evaluaciones WHERE id=$1',
      [req.params.id]);
    if (!cur.rows.length) return res.json({ ok: false, error: 'No encontrado' });
    const row = cur.rows[0];
    if (!adminPuedeAccederRegistro(req.admin, row.unidad, row.comisaria)) {
      return res.status(403).json({ ok: false, error: 'Sin permiso para esta dependencia' });
    }
    await pool.query('DELETE FROM evaluaciones WHERE id=$1', [row.id]);
    if (row.cip) {
      await pool.query(
        `DELETE FROM progresos WHERE UPPER(TRIM(cip))=UPPER(TRIM($1))
         OR LOWER(TRIM(clave))=LOWER(TRIM($1))`,
        [row.cip]);
    }
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
      `SELECT cip, unidad, comisaria FROM progresos
       WHERE UPPER(TRIM(cip))=UPPER(TRIM($1)) OR LOWER(TRIM(clave))=LOWER(TRIM($1))
       LIMIT 1`,
      [cip]);
    if (!cur.rows.length) return res.json({ ok: false, error: 'No encontrado' });
    const row = cur.rows[0];
    if (!adminPuedeAccederRegistro(req.admin, row.unidad, row.comisaria)) {
      return res.status(403).json({ ok: false, error: 'Sin permiso para esta dependencia' });
    }
    await pool.query(
      `DELETE FROM progresos WHERE UPPER(TRIM(cip))=UPPER(TRIM($1))
       OR LOWER(TRIM(clave))=LOWER(TRIM($1))`,
      [cip]);
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
    const mmpi = completa ? calcularMMPI2(ev) : { ok: false, escalas: [], error: 'Evaluación incompleta' };

    res.json({
      ok: true,
      completa,
      efectivo: {
        id: ev.id,
        grado: ev.grado || '',
        nombres: ev.nombres || '',
        cip: ev.cip || '',
        dni: ev.dni || '',
        edad: ev.edad || null,
        sexo: ev.sexo || '',
        cargo: ev.cargo || '',
        armamento: ev.armamento || '',
        comisaria: ev.comisaria || '',
        unidad: ev.unidad || '',
        fecha: ev.fecha || '',
        foto: ev.foto && String(ev.foto).length > 80 ? ev.foto : '',
        total_resp: stats.total,
        v: stats.v,
        f: stats.f
      },
      mmpi
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
        filas.push({ numero: p.numero, texto: p.texto, respuesta: r });
      }
    });

    res.json({
      ok: true,
      efectivo: {
        grado: ev.grado || '',
        nombres: ev.nombres || '',
        cip: ev.cip || '',
        dni: ev.dni || '',
        edad: ev.edad || null,
        sexo: ev.sexo || '',
        cargo: ev.cargo || '',
        armamento: formatearArmamentoLegible(ev.armamento || ''),
        comisaria: ev.comisaria || '',
        unidad: ev.unidad || '',
        fecha: ev.fecha || '',
        foto: ev.foto && String(ev.foto).length > 80 ? ev.foto : '',
        total_resp: stats.total,
        v: stats.v,
        f: stats.f
      },
      avance: {
        total: stats.total,
        pct: pct,
        bloque: parseInt(ev.bloque_max, 10) || Math.min(12, Math.ceil(stats.total / 50) || 1),
        bloques: 12
      },
      respuestas: filas
    });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── GET /pdf/efectivo?id=N | ?cip= (solo evaluación 100% completa) ─────────────
app.get('/pdf/efectivo', requireAuth, async (req, res) => {
  try {
    const id  = parseInt(req.query.id);
    const cip = (req.query.cip || '').trim();
    if (!id && !cip) return res.status(400).json({ error: 'id o cip requerido' });

    const ev = await cargarEvaluacionAdmin({ id: id || null, cip: cip || null }, req.admin);
    if (!ev) return res.status(404).json({ error: 'No encontrado' });
    if (!evaluacionEstaCompleta(ev)) {
      return res.status(403).json({ error: 'Solo se puede descargar evaluaciones completadas al 100% con resultado MMPI-2' });
    }

    const pregsR = await pool.query('SELECT numero AS id, texto FROM preguntas WHERE activa=TRUE ORDER BY orden,numero');
    const buf = await generarPDFIndividual(ev, pregsR.rows, { soloResultados: true });
    const nom = (ev.nombres||'efectivo').replace(/\s+/g,'_').replace(/[^a-zA-Z0-9_]/g,'');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${nom}_ResultadoMMPI2.pdf"`);
    res.send(buf);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /pdf/grupo?division=X | ?comisaria=X | ?unidad=X ─────────────────────
app.get('/pdf/grupo', requireAuth, async (req, res) => {
  try {
    const division  = (req.query.division  || '').toUpperCase();
    const comisaria = (req.query.comisaria || '').toUpperCase();
    const unidad    = (req.query.unidad    || '').toUpperCase();
    if (!division && !comisaria && !unidad) return res.status(400).json({ error: 'Parámetro requerido' });

    const { where, params } = await buildWhere(req.query, 'WHERE 1=1', []);
    const r = await pool.query(
      `SELECT *, TO_CHAR(fecha,'DD/MM/YYYY HH24:MI') AS fecha FROM evaluaciones ${where} ORDER BY comisaria,nombres`, params);

    const cipsEval = new Set(r.rows.map(function(row) { return (row.cip || '').toUpperCase(); }));
    const progresos = await consultarProgresosParaPDFGrupo(req.admin, req.query);
    const merged = r.rows.concat(
      progresos.filter(function(p) { return !cipsEval.has((p.cip || '').toUpperCase()); })
    );
    if (!merged.length) return res.status(404).json({ error: 'Sin evaluaciones para este filtro' });

    const pregsR = await pool.query('SELECT numero AS id, texto FROM preguntas WHERE activa=TRUE ORDER BY orden,numero');
    const label  = division || comisaria || unidad;
    const buf    = await generarPDFComisaria(label, merged, pregsR.rows);
    const nom    = 'Cuestionario_' + label.replace(/\s+/g,'_') + '.pdf';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${nom}"`);
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
      res.set('Content-Type', 'application/json; charset=utf-8');
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      return res.send(r.rows[0].data_json);
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

// ── POST /admin/configuracion — guardar CMS (requiere auth) ──────────────────
app.post('/admin/configuracion', requireAuth, async (req, res) => {
  try {
    const data = req.body;
    if (!data || typeof data !== 'object') return res.status(400).json({ ok: false, error: 'Datos inválidos' });
    const meses = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
    const hoy = new Date();
    data.actualizacion = data.actualizacion || (hoy.getDate() + ' DE ' + meses[hoy.getMonth()] + ' ' + hoy.getFullYear());
    data.cmsPublicadoEn = new Date().toISOString();
    const json = JSON.stringify(data);
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
    const r = await pool.query(
      'SELECT s.*, i.titulo AS item_titulo, i.tipo AS item_tipo FROM sorteos_portal s LEFT JOIN items_portal i ON i.id=s.item_id ORDER BY s.orden,s.id DESC');
    const result = [];
    for (const s of r.rows) {
      const row = { ...s };
      const resList = await pool.query('SELECT * FROM resultados_sorteo WHERE sorteo_id=$1 ORDER BY orden,id', [s.id]);
      row.resultados = resList.rows;
      result.push(row);
    }
    res.json({ ok: true, sorteos: result });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ── POST /admin/sorteos ────────────────────────────────────────────────────────
app.post('/admin/sorteos', requireAuth, async (req, res) => {
  try {
    if (req.admin.rol !== 'unitic' && !normalizarPermisos(req.admin.permisos).some(p => ['cms_cursos','cms_convenios'].includes(p)))
      return res.status(403).json({ ok: false, error: 'Sin permiso' });
    const { tipo, titulo, descripcion, fecha_sorteo, imagen, item_id, publicado, orden } = req.body;
    if (!titulo) return res.json({ ok: false, error: 'Título obligatorio' });
    if (req.admin.rol !== 'unitic' && (tipo || 'proximo') !== 'resultado')
      return res.status(403).json({ ok: false, error: 'Solo puede publicar resultados en la web.' });
    if (item_id) {
      const it = await pool.query('SELECT tipo FROM items_portal WHERE id=$1', [item_id]);
      const itemTipo = it.rows[0]?.tipo;
      if (itemTipo && !puedeGestionarItem(req.admin, itemTipo))
        return res.status(403).json({ ok: false, error: 'Sin permiso para esta convocatoria.' });
    }
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
    const { tipo, titulo, descripcion, fecha_sorteo, imagen, item_id, publicado, orden } = req.body;
    if (req.admin.rol !== 'unitic') {
      if ((tipo || 'proximo') !== 'resultado')
        return res.status(403).json({ ok: false, error: 'Solo puede publicar resultados en la web.' });
      const actual = await pool.query(
        'SELECT s.tipo, i.tipo AS item_tipo FROM sorteos_portal s LEFT JOIN items_portal i ON i.id=s.item_id WHERE s.id=$1',
        [req.params.id]
      );
      const row = actual.rows[0];
      if (!row) return res.json({ ok: false, error: 'Sorteo no encontrado' });
      const itemTipo = row.item_tipo;
      if (itemTipo && !puedeGestionarItem(req.admin, itemTipo))
        return res.status(403).json({ ok: false, error: 'Sin permiso para este resultado.' });
      if (item_id) {
        const it = await pool.query('SELECT tipo FROM items_portal WHERE id=$1', [item_id]);
        if (it.rows[0]?.tipo && !puedeGestionarItem(req.admin, it.rows[0].tipo))
          return res.status(403).json({ ok: false, error: 'Sin permiso para esta convocatoria.' });
      }
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
    await pool.query('DELETE FROM sorteos_portal WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ── POST /admin/sorteos/:id/resultados — guardar lista de resultados ───────────
app.post('/admin/sorteos/:id/resultados', requireAuth, async (req, res) => {
  try {
    const { resultados } = req.body;
    await pool.query('DELETE FROM resultados_sorteo WHERE sorteo_id=$1', [req.params.id]);
    if (Array.isArray(resultados) && resultados.length) {
      for (let i = 0; i < resultados.length; i++) {
        const r = resultados[i];
        await pool.query(
          'INSERT INTO resultados_sorteo(sorteo_id,cip,nombres,unidad,cargo,orden) VALUES($1,$2,$3,$4,$5,$6)',
          [req.params.id, r.cip||'', r.nombres||'', r.unidad||'', r.cargo||'', i]);
      }
    }
    res.json({ ok: true });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ── POST /admin/sorteos/:id/importar-inscritos — importar aceptados ───────────
app.post('/admin/sorteos/:id/importar-inscritos', requireAuth, async (req, res) => {
  try {
    const { item_id } = req.body;
    if (!item_id) return res.json({ ok: false, error: 'item_id requerido' });
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
    if (!puedeGestionarItem(req.admin, tipo))
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
  if (admin.rol === 'unitic') return true;
  const perms = normalizarPermisos(admin.permisos);
  if (tipo === 'convenio') return perms.includes('cms_convenios');
  if (tipo === 'curso')    return perms.includes('cms_cursos');
  return false;
}

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

function invalidarPortalItemsCache() {
  portalItemsCache.clear();
}

function invalidarUnidadesPublicoCache() {
  unidadesPublicoCache = null;
}

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
    if (!cip || !nombres) return res.json({ ok: false, error: 'CIP y nombres son obligatorios.' });
    const dup = await pool.query(
      'SELECT id FROM inscripciones WHERE item_id=$1 AND cip=$2', [req.params.id, cip]);
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
      [req.params.id, cip, nombres, unidad||'', cargo||'', telefono||'', email||'',
       pdfBase64, pdf_nombre||'requisitos.pdf',
       dni||'', grado||'', area||'', arma||'', disponibilidad||'', dia_franco||'',
       feNorm, tiempo_servicio||'']);
    res.json({ ok: true, mensaje: 'Inscripción registrada correctamente.' });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ── GET /admin/items ──────────────────────────────────────────────────────────
app.get('/admin/items', requireAuth, async (req, res) => {
  try {
    const { tipo } = req.query;
    if (tipo && !puedeGestionarItem(req.admin, tipo))
      return res.status(403).json({ ok: false, error: 'Sin permiso' });
    let q = 'SELECT i.*, (SELECT COUNT(*) FROM inscripciones n WHERE n.item_id=i.id) AS total_inscritos FROM items_portal i WHERE 1=1';
    const args = [];
    if (req.admin.rol !== 'unitic') {
      const perms = normalizarPermisos(req.admin.permisos);
      const tipos = [];
      if (perms.includes('cms_cursos'))     tipos.push('curso');
      if (perms.includes('cms_convenios'))  tipos.push('convenio');
      if (!tipos.length) return res.json({ ok: true, items: [] });
      q += ` AND i.tipo = ANY($${args.length+1}::text[])`;
      args.push(tipos);
    } else if (tipo) {
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
            vacantes, fecha_inicio, duracion, lugar, observaciones,
            formulario_url, inscripciones_abiertas, visible, orden } = req.body;
    if (!puedeGestionarItem(req.admin, tipo))
      return res.status(403).json({ ok: false, error: 'Sin permiso' });
    if (!titulo) return res.json({ ok: false, error: 'El título es obligatorio.' });
    const r = await pool.query(
      `INSERT INTO items_portal(tipo,titulo,descripcion,estado,icono,color,requisitos,horario,
        vacantes,fecha_inicio,duracion,lugar,observaciones,formulario_url,inscripciones_abiertas,visible,orden)
       VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
      [tipo, titulo, descripcion||'', estado||'DISPONIBLE', icono||'fa-file', color||'#004d3d',
       JSON.stringify(Array.isArray(requisitos)?requisitos:[]),
       horario||'', parseInt(vacantes)||0, fecha_inicio||'', duracion||'',
       lugar||'', observaciones||'', formulario_url||'',
       !!inscripciones_abiertas, visible!==false, parseInt(orden)||0]);
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
            vacantes, fecha_inicio, duracion, lugar, observaciones,
            formulario_url, inscripciones_abiertas, visible, orden } = req.body;
    await pool.query(
      `UPDATE items_portal SET titulo=$1,descripcion=$2,estado=$3,icono=$4,color=$5,
        requisitos=$6::jsonb,horario=$7,vacantes=$8,fecha_inicio=$9,duracion=$10,
        lugar=$11,observaciones=$12,formulario_url=$13,inscripciones_abiertas=$14,
        visible=$15,orden=$16,actualizado=NOW() WHERE id=$17`,
      [titulo, descripcion||'', estado||'DISPONIBLE', icono||'fa-file', color||'#004d3d',
       JSON.stringify(Array.isArray(requisitos)?requisitos:[]),
       horario||'', parseInt(vacantes)||0, fecha_inicio||'', duracion||'',
       lugar||'', observaciones||'', formulario_url||'',
       !!inscripciones_abiertas, visible!==false, parseInt(orden)||0, req.params.id]);
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
    if (!puedeGestionarItem(req.admin, cur.rows[0].tipo))
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
    if (!puedeGestionarItem(req.admin, cur.rows[0].tipo))
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
    if (!puedeGestionarItem(req.admin, cur.rows[0].tipo))
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
  return initDB()
    .then(function() {
      dbListo = true;
      console.log('PostgreSQL listo.');
    })
    .catch(function(e) {
      console.error('Error init DB (reintento en 15s):', e.message);
      setTimeout(iniciarDB, 15000);
    });
}

app.listen(PORT, '0.0.0.0', function() {
  console.log('\n=== REGPOL Callao — Puerto ' + PORT + ' ===');
  setImmediate(precalentarEstaticos);
  iniciarDB();
});
