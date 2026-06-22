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

    CREATE TABLE IF NOT EXISTS configuracion (
      clave       VARCHAR(60) PRIMARY KEY,
      valor       TEXT,
      actualizado TIMESTAMP DEFAULT NOW()
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
    const { comisaria, unidad, nombres, cip, dni, fecha_nac, edad, cargo, foto, respuestas, completada } = req.body;
    if (!nombres || !cip) return res.json({ ok: false, error: 'Faltan datos obligatorios' });
    const edadFinal = parseInt(edad) || calcularEdadDesdeISO(fecha_nac) || 0;
    const totalResp = Object.keys(respuestas || {}).filter(function(k) {
      const v = respuestas[k];
      return v === 'V' || v === 'F';
    }).length;

    const exist = await pool.query(
      'SELECT id, completada FROM evaluaciones WHERE UPPER(TRIM(cip))=UPPER(TRIM($1)) ORDER BY fecha DESC LIMIT 1',
      [cip]
    );

    if (exist.rows.length) {
      await pool.query(
        `UPDATE evaluaciones SET comisaria=$1, unidad=$2, nombres=$3, dni=$4, fecha_nac=$5, edad=$6,
         cargo=$7, foto=COALESCE(NULLIF($8,''), foto), respuestas=$9, completada=$10, bloque_max=$11, fecha=NOW() WHERE id=$12`,
        [comisaria || '', unidad || '', nombres || '', dni || '', fecha_nac || null,
         edadFinal, cargo || '', foto || '', respuestas || {}, !!completada, totalResp, exist.rows[0].id]
      );
    } else {
      await pool.query(
        `INSERT INTO evaluaciones (comisaria,unidad,nombres,cip,dni,fecha_nac,edad,cargo,foto,respuestas,completada,bloque_max)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [comisaria || '', unidad || '', nombres || '', cip || '', dni || '',
         fecha_nac || null, edadFinal, cargo || '', foto || '', respuestas || {}, !!completada, totalResp]
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
    const { cip, nombres, comisaria, unidad, bloque, total, respuestas } = req.body;
    const clave = (cip || 'anonimo').toLowerCase().trim();
    await pool.query(
      `INSERT INTO progresos (clave,cip,nombres,comisaria,unidad,bloque_max,total_resp,respuestas,actualizado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
       ON CONFLICT (clave) DO UPDATE SET
         nombres=$3, comisaria=$4, unidad=$5, bloque_max=$6,
         total_resp=$7, respuestas=$8, actualizado=NOW()`,
      [clave, cip||'', nombres||'', comisaria||'', unidad||'', bloque||0, total||0, respuestas||{}]
    );
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
app.get('/admin/divisiones', requireAuth, async (req, res) => {
  try {
    const divs  = await pool.query('SELECT id,nombre,orden FROM divisiones ORDER BY orden,nombre');
    const upols = await pool.query('SELECT id,nombre,division_id,tipo,orden FROM unidades_pol ORDER BY division_id,orden,nombre');
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
  const { nombre, division_id, tipo, orden } = req.body;
  try {
    const r = await pool.query(
      'INSERT INTO unidades_pol (nombre,division_id,tipo,orden) VALUES ($1,$2,$3,$4) RETURNING id',
      [nombre, division_id||null, tipo||'comisaria', orden||0]);
    res.json({ ok: true, id: r.rows[0].id });
  } catch (e) { res.json({ ok: false, error: 'Unidad ya existe' }); }
});

app.put('/admin/unidades/:id', requireAuth, async (req, res) => {
  if (req.admin.rol !== 'unitic') return res.status(403).json({ ok: false });
  const { nombre, division_id, tipo, orden } = req.body;
  await pool.query('UPDATE unidades_pol SET nombre=$1,division_id=$2,tipo=$3,orden=$4 WHERE id=$5',
    [nombre, division_id||null, tipo||'comisaria', orden||0, req.params.id]);
  res.json({ ok: true });
});

app.delete('/admin/unidades/:id', requireAuth, async (req, res) => {
  if (req.admin.rol !== 'unitic') return res.status(403).json({ ok: false });
  await pool.query('DELETE FROM unidades_pol WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

// ── Iniciar ────────────────────────────────────────────────────────────────────
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`\n=== REGPOL Callao — Puerto ${PORT} ===`);
  });
}).catch(e => { console.error('DB error:', e.message); process.exit(1); });
