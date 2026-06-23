/*
  REGPOL Callao — Backend Node.js + PostgreSQL (Railway)
  Ing. Anthony Ccayo — UNITIC — 2026
*/

const express  = require('express');
const cors     = require('cors');
const path     = require('path');
const crypto   = require('crypto');
const { Pool } = require('pg');
const { generarPDFIndividual, generarPDFComisaria } = require('./pdf_gen');

const app  = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

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

  // Seed divisiones y unidades (primera vez)
  const { rows: divRows } = await pool.query('SELECT COUNT(*) AS t FROM divisiones');
  if (parseInt(divRows[0].t) === 0) {
    console.log('Seed inicial: divisiones vacías.');
  }
  await sincronizarDivisionesUnidades();

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

// ── Middlewares ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '4mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Auth middleware ────────────────────────────────────────────────────────────
async function requireAuth(req, res, next) {
  try {
    const token = req.headers['x-admin-token'] || req.query.token || '';
    if (!token) return res.status(401).json({ ok: false, error: 'Sin token' });
    const decoded = Buffer.from(token, 'base64').toString();
    const colon   = decoded.indexOf(':');
    const usuario = decoded.substring(0, colon);
    const pass    = decoded.substring(colon + 1);
    const r = await pool.query('SELECT * FROM admins WHERE usuario=$1 AND passhash=$2', [usuario, sha256(pass)]);
    if (!r.rows.length) return res.status(403).json({ ok: false, error: 'Credenciales inválidas' });
    req.admin = r.rows[0];
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

app.get('/config', async (req, res) => {
  try {
    const unidadesActivas = await leerUnidadesActivas();
    const divisiones = await obtenerDivisionesAgrupadas();
    res.json({
      ok: true,
      unidadesActivas,
      comisariaActiva: unidadesActivas[0] || '',
      divisiones
    });
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
    const r = await pool.query('SELECT numero AS id, texto FROM preguntas WHERE activa=TRUE ORDER BY orden,numero');
    res.json({ ok: true, preguntas: r.rows });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── CRUD preguntas (solo unitic) ───────────────────────────────────────────────
app.get('/admin/preguntas', requireAuth, async (req, res) => {
  const r = await pool.query('SELECT * FROM preguntas ORDER BY orden,numero');
  res.json({ ok: true, preguntas: r.rows });
});

app.put('/admin/preguntas/:id', requireAuth, async (req, res) => {
  if (req.admin.rol !== 'unitic') return res.status(403).json({ ok: false, error: 'Solo UNITIC' });
  const { texto, activa } = req.body;
  await pool.query('UPDATE preguntas SET texto=$1,activa=$2 WHERE id=$3', [texto, activa, req.params.id]);
  res.json({ ok: true });
});

app.post('/admin/preguntas', requireAuth, async (req, res) => {
  if (req.admin.rol !== 'unitic') return res.status(403).json({ ok: false, error: 'Solo UNITIC' });
  const { numero, texto } = req.body;
  const r = await pool.query(
    'INSERT INTO preguntas (numero,texto,orden) VALUES ($1,$2,$3) RETURNING id',
    [numero, texto, numero]);
  res.json({ ok: true, id: r.rows[0].id });
});

app.delete('/admin/preguntas/:id', requireAuth, async (req, res) => {
  if (req.admin.rol !== 'unitic') return res.status(403).json({ ok: false, error: 'Solo UNITIC' });
  await pool.query('UPDATE preguntas SET activa=FALSE WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

// ── POST /guardar ─────────────────────────────────────────────────────────────
app.post('/guardar', async (req, res) => {
  try {
    const { comisaria, unidad, nombres, cip, dni, fecha_nac, edad, cargo, sexo, armamento, foto, respuestas, completada } = req.body;
    if (!nombres || !cip) return res.json({ ok: false, error: 'Faltan datos obligatorios' });
    const edadFinal = parseInt(edad) || calcularEdadDesdeISO(fecha_nac) || 0;
    const totalResp = Object.keys(respuestas || {}).filter(function(k) {
      const v = respuestas[k];
      return v === 'V' || v === 'F';
    }).length;
    const armamentoStr = Array.isArray(armamento) ? armamento.join(', ') : (armamento || '');

    const exist = await pool.query(
      'SELECT id, completada FROM evaluaciones WHERE UPPER(TRIM(cip))=UPPER(TRIM($1)) ORDER BY fecha DESC LIMIT 1',
      [cip]
    );

    if (exist.rows.length) {
      await pool.query(
        `UPDATE evaluaciones SET comisaria=$1, unidad=$2, nombres=$3, dni=$4, fecha_nac=$5, edad=$6,
         cargo=$7, foto=COALESCE(NULLIF($8,''), foto), respuestas=$9, completada=$10, bloque_max=$11,
         sexo=$12, armamento=$13, fecha=NOW() WHERE id=$14`,
        [comisaria || '', unidad || '', nombres || '', dni || '', fecha_nac || null,
         edadFinal, cargo || '', foto || '', respuestas || {}, !!completada, totalResp,
         sexo || '', armamentoStr, exist.rows[0].id]
      );
    } else {
      await pool.query(
        `INSERT INTO evaluaciones (comisaria,unidad,nombres,cip,dni,fecha_nac,edad,cargo,sexo,armamento,foto,respuestas,completada,bloque_max)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [comisaria || '', unidad || '', nombres || '', cip || '', dni || '',
         fecha_nac || null, edadFinal, cargo || '', sexo || '', armamentoStr,
         foto || '', respuestas || {}, !!completada, totalResp]
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
    const { cip, nombres, comisaria, unidad, cargo, sexo, armamento, foto, bloque, total, respuestas } = req.body;
    const clave = (cip || 'anonimo').toLowerCase().trim();
    const armamentoStr = Array.isArray(armamento) ? armamento.join(', ') : (armamento || '');
    // Agregar columnas cargo/sexo/armamento/foto a progresos si no existen
    await pool.query(`ALTER TABLE progresos ADD COLUMN IF NOT EXISTS cargo VARCHAR(80)`).catch(()=>{});
    await pool.query(`ALTER TABLE progresos ADD COLUMN IF NOT EXISTS sexo VARCHAR(20)`).catch(()=>{});
    await pool.query(`ALTER TABLE progresos ADD COLUMN IF NOT EXISTS armamento TEXT`).catch(()=>{});
    await pool.query(`ALTER TABLE progresos ADD COLUMN IF NOT EXISTS foto TEXT`).catch(()=>{});
    await pool.query(
      `INSERT INTO progresos (clave,cip,nombres,comisaria,unidad,bloque_max,total_resp,respuestas,actualizado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
       ON CONFLICT (clave) DO UPDATE SET
         nombres=$3, comisaria=$4, unidad=$5, bloque_max=$6,
         total_resp=$7, respuestas=$8, actualizado=NOW()`,
      [clave, cip||'', nombres||'', comisaria||'', unidad||'', bloque||0, total||0, respuestas||{}]
    );
    // Actualizar campos extra por separado para compatibilidad con esquema dinámico
    await pool.query(
      `UPDATE progresos SET cargo=$2, sexo=$3, armamento=$4, foto=COALESCE(NULLIF($5,''),foto) WHERE clave=$1`,
      [clave, cargo||'', sexo||'', armamentoStr, foto||'']
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
    res.json({
      ok: true, encontrado: true,
      cip: row.cip, nombres: row.nombres, comisaria: row.comisaria, unidad: row.unidad,
      bloque: row.bloque_max, total: row.total_resp, respuestas: row.respuestas,
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
    let where = 'WHERE total_resp > 0';
    const params = [];
    if (comisaria) {
      params.push(comisaria);
      where += ` AND (UPPER(comisaria)=UPPER($${params.length}) OR UPPER(unidad)=UPPER($${params.length}))`;
    } else if (unidad) {
      params.push(unidad);
      where += ` AND UPPER(unidad)=UPPER($${params.length})`;
    } else {
      return res.json({ ok: false, error: 'comisaria o unidad requerido' });
    }
    const r = await pool.query(
      `SELECT cip, nombres, comisaria, unidad, bloque_max AS bloque, total_resp AS total,
              TO_CHAR(actualizado,'DD/MM/YYYY HH24:MI') AS ultima
       FROM progresos ${where} ORDER BY actualizado DESC`,
      params
    );
    res.json({ ok: true, rows: r.rows });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── Helper: progresos guardados sin enviar ─────────────────────────────────────
async function consultarProgresosPendientes(admin, query) {
  let where = `WHERE (SELECT COUNT(*) FROM jsonb_object_keys(p.respuestas)) > 0
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

  const comisaria = ((query.comisaria || '') + '').toUpperCase();
  const unidad    = ((query.unidad || '') + '').toUpperCase();
  const busqueda  = ((query.busqueda || '') + '').toUpperCase();

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

  const r = await pool.query(
    `SELECT NULL::INTEGER AS id, p.cip, p.nombres, '' AS dni, p.comisaria, p.unidad,
            p.bloque_max, NULL::SMALLINT AS edad,
            (SELECT COUNT(*) FROM jsonb_object_keys(p.respuestas)) AS total_resp,
            FALSE AS completada, TRUE AS solo_progreso,
            TO_CHAR(p.actualizado,'DD/MM/YYYY HH24:MI') AS fecha
     FROM progresos p ${where}
     ORDER BY p.actualizado DESC LIMIT 200`,
    params
  );
  return r.rows;
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
              (SELECT COUNT(*) FROM jsonb_object_keys(respuestas)) AS total_resp
       FROM evaluaciones WHERE UPPER(TRIM(cip))=UPPER(TRIM($1)) ORDER BY fecha DESC`,
      [cip]
    );
    const progR = await pool.query(
      `SELECT cip, nombres, comisaria, unidad, bloque_max,
              (SELECT COUNT(*) FROM jsonb_object_keys(respuestas)) AS total_resp,
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
    let whereAdmin = '';
    const params = [];
    if (debeFiltrarPorUnidadAsignada(req.admin)) {
      whereAdmin = 'WHERE UPPER(unidad) LIKE $1';
      params.push('%' + req.admin.unidad.toUpperCase() + '%');
    }
    const total    = await pool.query(`SELECT COUNT(*) AS t FROM evaluaciones ${whereAdmin}`, params);
    const completas= await pool.query(`SELECT COUNT(*) AS t FROM evaluaciones ${whereAdmin} ${whereAdmin?'AND':'WHERE'} completada=TRUE`, params);
    const porComis = await pool.query(
      `SELECT comisaria AS nombre, COUNT(*) AS total FROM evaluaciones ${whereAdmin} GROUP BY comisaria ORDER BY comisaria`, params);
    const porUnidad= await pool.query(
      `SELECT unidad AS nombre, COUNT(*) AS total FROM evaluaciones ${whereAdmin} GROUP BY unidad ORDER BY unidad`, params);
    const ultimas  = await pool.query(
      `SELECT TO_CHAR(fecha,'DD/MM/YYYY HH24:MI') AS fecha, comisaria, unidad, nombres, completada
       FROM evaluaciones ${whereAdmin} ORDER BY fecha DESC LIMIT 10`, params);

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

    let progWhere = 'WHERE (SELECT COUNT(*) FROM jsonb_object_keys(p.respuestas)) > 0 '
      + 'AND NOT EXISTS ('
      + 'SELECT 1 FROM evaluaciones e '
      + 'WHERE UPPER(TRIM(e.cip)) = UPPER(TRIM(p.cip)) AND e.completada = TRUE'
      + ')';
    const progParams = [];
    if (debeFiltrarPorUnidadAsignada(req.admin)) {
      progWhere += ' AND (UPPER(p.unidad) LIKE $1 OR UPPER(p.comisaria) LIKE $1)';
      progParams.push('%' + req.admin.unidad.toUpperCase() + '%');
    }
    const enCursoR = await pool.query(
      `SELECT COUNT(*)::int AS t FROM progresos p ${progWhere}`, progParams
    );

    res.json({
      ok: true,
      totalEvaluaciones: parseInt(total.rows[0].t),
      totalCompletas:    parseInt(completas.rows[0].t),
      totalEnCurso:      parseInt(enCursoR.rows[0].t),
      porComisaria:      porComis.rows,
      porUnidad:         porUnidad.rows,
      porDivision:       porDivision.rows,
      ultimasEvaluaciones: ultimas.rows
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
      baseWhere += ' AND UPPER(unidad) LIKE $1';
      baseParams.push('%' + req.admin.unidad.toUpperCase() + '%');
    }
    const { where, params, pi } = await buildWhere(req.query, baseWhere, baseParams);

    const countR  = await pool.query(`SELECT COUNT(*) AS t FROM evaluaciones ${where}`, params);
    const total   = parseInt(countR.rows[0].t);
    const paginas = Math.max(1, Math.ceil(total / porPagina));

    const rows = await pool.query(
      `SELECT id, TO_CHAR(fecha,'DD/MM/YYYY HH24:MI') AS fecha, comisaria, unidad,
              nombres, cip, dni, edad, completada, bloque_max,
              (SELECT COUNT(*) FROM jsonb_object_keys(respuestas)) AS total_resp,
              FALSE AS solo_progreso
       FROM evaluaciones ${where} ORDER BY fecha DESC LIMIT $${pi} OFFSET $${pi+1}`,
      [...params, porPagina, offset]
    );

    // Incluir progresos no enviados (misma búsqueda / filtros)
    let progresosRows = [];
    if (pagina === 1 || (req.query.busqueda || '').trim()) {
      progresosRows = await consultarProgresosPendientes(req.admin, req.query);
    }

    const cipsEval = new Set(rows.rows.map(function(r) { return (r.cip || '').toUpperCase(); }));
    const merged = rows.rows.concat(
      progresosRows.filter(function(p) { return !cipsEval.has((p.cip || '').toUpperCase()); })
    );

    res.json({ ok: true, rows: merged, total: total + progresosRows.length, pagina, paginas });
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

// ── GET /descargar (CSV) ───────────────────────────────────────────────────────
app.get('/descargar', requireAuth, async (req, res) => {
  try {
    let baseWhere = 'WHERE 1=1', baseParams = [];
    if (debeFiltrarPorUnidadAsignada(req.admin)) {
      baseWhere += ' AND UPPER(unidad) LIKE $1';
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

// ── GET /pdf/efectivo?id=N ─────────────────────────────────────────────────────
app.get('/pdf/efectivo', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.query.id);
    const r  = await pool.query(`SELECT *, TO_CHAR(fecha,'DD/MM/YYYY HH24:MI') AS fecha FROM evaluaciones WHERE id=$1`, [id]);
    if (!r.rows.length) return res.status(404).json({ error: 'No encontrado' });
    const ev  = r.rows[0];
    if (debeFiltrarPorUnidadAsignada(req.admin) &&
        !ev.unidad.toUpperCase().includes(req.admin.unidad.toUpperCase()))
      return res.status(403).json({ error: 'Sin acceso' });

    // Obtener textos de preguntas desde BD
    const pregsR = await pool.query('SELECT numero AS id, texto FROM preguntas WHERE activa=TRUE ORDER BY orden,numero');
    const buf = await generarPDFIndividual(ev, pregsR.rows);
    const nom = (ev.nombres||'efectivo').replace(/\s+/g,'_').replace(/[^a-zA-Z0-9_]/g,'');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${nom}_CuestPsicologico.pdf"`);
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
    if (!r.rows.length) return res.status(404).json({ error: 'Sin evaluaciones para este filtro' });

    const pregsR = await pool.query('SELECT numero AS id, texto FROM preguntas WHERE activa=TRUE ORDER BY orden,numero');
    const label  = division || comisaria || unidad;
    const buf    = await generarPDFComisaria(label, r.rows, pregsR.rows);
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
// ── GET /unidades-publico (sin auth — para la página pública) ────────────────
app.get('/unidades-publico', async (req, res) => {
  try {
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
    res.json({ ok: true, divisiones: result });
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
    res.json({ ok: true, id: r.rows[0].id });
  } catch (e) { res.json({ ok: false, error: 'Ya existe esa división' }); }
});

app.put('/admin/divisiones/:id', requireAuth, async (req, res) => {
  if (req.admin.rol !== 'unitic') return res.status(403).json({ ok: false });
  const { nombre, orden } = req.body;
  await pool.query('UPDATE divisiones SET nombre=$1,orden=$2 WHERE id=$3', [nombre, orden||0, req.params.id]);
  res.json({ ok: true });
});

app.delete('/admin/divisiones/:id', requireAuth, async (req, res) => {
  if (req.admin.rol !== 'unitic') return res.status(403).json({ ok: false });
  await pool.query('DELETE FROM divisiones WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

app.post('/admin/unidades', requireAuth, async (req, res) => {
  if (req.admin.rol !== 'unitic') return res.status(403).json({ ok: false });
  const { nombre, division_id, tipo, orden, direccion, telefono } = req.body;
  try {
    const r = await pool.query(
      'INSERT INTO unidades_pol (nombre,division_id,tipo,orden,direccion,telefono) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
      [nombre, division_id||null, tipo||'comisaria', orden||0, direccion||'', telefono||'']);
    res.json({ ok: true, id: r.rows[0].id });
  } catch (e) { res.json({ ok: false, error: 'Unidad ya existe' }); }
});

app.put('/admin/unidades/:id', requireAuth, async (req, res) => {
  if (req.admin.rol !== 'unitic') return res.status(403).json({ ok: false });
  const { nombre, division_id, tipo, orden, direccion, telefono } = req.body;
  await pool.query(
    'UPDATE unidades_pol SET nombre=$1,division_id=$2,tipo=$3,orden=$4,direccion=$5,telefono=$6 WHERE id=$7',
    [nombre, division_id||null, tipo||'comisaria', orden||0, direccion||'', telefono||'', req.params.id]);
  res.json({ ok: true });
});

app.delete('/admin/unidades/:id', requireAuth, async (req, res) => {
  if (req.admin.rol !== 'unitic') return res.status(403).json({ ok: false });
  await pool.query('DELETE FROM unidades_pol WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
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
      'SELECT s.*, i.titulo AS item_titulo FROM sorteos_portal s LEFT JOIN items_portal i ON i.id=s.item_id ORDER BY s.orden,s.id DESC');
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
      'SELECT cip,nombres,unidad,cargo FROM inscripciones WHERE item_id=$1 AND estado=$2 ORDER BY fecha',
      [item_id, 'aceptado']);
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
    const tipo = req.query.tipo || null;
    let q = 'SELECT id,tipo,titulo,descripcion,estado,icono,color,vacantes,fecha_inicio,duracion,inscripciones_abiertas,orden FROM items_portal WHERE visible=TRUE';
    const args = [];
    if (tipo) { q += ' AND tipo=$1'; args.push(tipo); }
    q += ' ORDER BY orden,id';
    const r = await pool.query(q, args);
    res.json({ ok: true, items: r.rows });
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

// ── GET /admin/items/:id/candidatos-sorteo — verificados para la rueda ─────────
app.get('/admin/items/:id/candidatos', requireAuth, async (req, res) => {
  try {
    const cur = await pool.query('SELECT tipo,titulo,vacantes FROM items_portal WHERE id=$1', [req.params.id]);
    if (!cur.rows.length) return res.json({ ok: false, error: 'No encontrado' });
    if (!puedeGestionarItem(req.admin, cur.rows[0].tipo))
      return res.status(403).json({ ok: false, error: 'Sin permiso' });
    const r = await pool.query(
      `SELECT id,cip,dni,grado,nombres,unidad,area,cargo,disponibilidad,dia_franco,tiempo_servicio,estado
       FROM inscripciones WHERE item_id=$1 AND estado IN ('verificado','ganador','reserva')
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

// ── Iniciar ────────────────────────────────────────────────────────────────────
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`\n=== REGPOL Callao — Puerto ${PORT} ===`);
  });
}).catch(e => { console.error('DB error:', e.message); process.exit(1); });
