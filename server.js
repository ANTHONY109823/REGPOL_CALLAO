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

// ── POST /admin/login ──────────────────────────────────────────────────────────
app.post('/admin/login', async (req, res) => {
  try {
    const { usuario, password } = req.body;
    const r = await pool.query('SELECT * FROM admins WHERE usuario=$1 AND passhash=$2',
      [usuario, sha256(password)]);
    if (!r.rows.length) return res.json({ ok: false, error: 'Credenciales incorrectas' });
    const a = r.rows[0];
    const token = Buffer.from(`${usuario}:${password}`).toString('base64');
    res.json({ ok: true, token, rol: a.rol, nombre: a.nombre, unidad: a.unidad, permisos: a.permisos || [] });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
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
    const { comisaria, unidad, nombres, cip, dni, fecha_nac, edad, respuestas, completada } = req.body;
    if (!nombres || !cip) return res.json({ ok: false, error: 'Faltan datos obligatorios' });
    const totalResp = Object.keys(respuestas || {}).length;

    // Si ya existe registro del mismo CIP y NO está completo, actualizar
    const exist = await pool.query('SELECT id,completada FROM evaluaciones WHERE cip=$1 ORDER BY fecha DESC LIMIT 1', [cip]);
    if (exist.rows.length && !exist.rows[0].completada) {
      await pool.query(
        `UPDATE evaluaciones SET comisaria=$1,unidad=$2,nombres=$3,dni=$4,fecha_nac=$5,edad=$6,
         respuestas=$7,completada=$8,bloque_max=$9 WHERE id=$10`,
        [comisaria||'', unidad||'', nombres||'', dni||'', fecha_nac||null,
         parseInt(edad)||0, respuestas||{}, !!completada, totalResp, exist.rows[0].id]
      );
      return res.json({ ok: true, actualizado: true });
    }

    await pool.query(
      `INSERT INTO evaluaciones (comisaria,unidad,nombres,cip,dni,fecha_nac,edad,respuestas,completada,bloque_max)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [comisaria||'', unidad||'', nombres||'', cip||'', dni||'',
       fecha_nac||null, parseInt(edad)||0, respuestas||{}, !!completada, totalResp]
    );
    res.json({ ok: true });
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

// ── GET /stats ─────────────────────────────────────────────────────────────────
app.get('/stats', requireAuth, async (req, res) => {
  try {
    let whereAdmin = '';
    const params = [];
    if (req.admin.rol === 'bienestar' && req.admin.unidad) {
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
    res.json({
      ok: true,
      totalEvaluaciones: parseInt(total.rows[0].t),
      totalCompletas:    parseInt(completas.rows[0].t),
      porComisaria:      porComis.rows,
      porUnidad:         porUnidad.rows,
      ultimasEvaluaciones: ultimas.rows
    });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── GET /listar ────────────────────────────────────────────────────────────────
app.get('/listar', requireAuth, async (req, res) => {
  try {
    const comis  = await pool.query('SELECT DISTINCT comisaria FROM evaluaciones WHERE comisaria!=\'\' ORDER BY comisaria');
    const unids  = await pool.query('SELECT DISTINCT unidad FROM evaluaciones WHERE unidad!=\'\' ORDER BY unidad');
    const total  = await pool.query('SELECT COUNT(*) AS t FROM evaluaciones');
    res.json({
      ok: true,
      comisarias: comis.rows.map(x => x.comisaria),
      unidades:   unids.rows.map(x => x.unidad),
      total:      parseInt(total.rows[0].t)
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

    const params = [];
    let pi = 1;
    let where = 'WHERE 1=1';

    // Bienestar solo ve su unidad
    if (req.admin.rol === 'bienestar' && req.admin.unidad) {
      where += ` AND UPPER(unidad) LIKE $${pi++}`;
      params.push('%' + req.admin.unidad.toUpperCase() + '%');
    }

    const comisaria = (req.query.comisaria || '').toUpperCase();
    const unidad    = (req.query.unidad    || '').toUpperCase();
    const busqueda  = (req.query.busqueda  || '').toUpperCase();

    if (comisaria) { where += ` AND UPPER(comisaria) LIKE $${pi++}`; params.push('%'+comisaria+'%'); }
    if (unidad)    { where += ` AND UPPER(unidad) LIKE $${pi++}`;    params.push('%'+unidad+'%'); }
    if (busqueda)  {
      where += ` AND (UPPER(nombres) LIKE $${pi} OR cip LIKE $${pi+1} OR dni LIKE $${pi+2})`;
      params.push('%'+busqueda+'%','%'+busqueda+'%','%'+busqueda+'%'); pi += 3;
    }

    const countR  = await pool.query(`SELECT COUNT(*) AS t FROM evaluaciones ${where}`, params);
    const total   = parseInt(countR.rows[0].t);
    const paginas = Math.max(1, Math.ceil(total / porPagina));

    const rows = await pool.query(
      `SELECT id, TO_CHAR(fecha,'DD/MM/YYYY HH24:MI') AS fecha, comisaria, unidad,
              nombres, cip, dni, edad, completada,
              (SELECT COUNT(*) FROM jsonb_object_keys(respuestas)) AS total_resp
       FROM evaluaciones ${where} ORDER BY fecha DESC LIMIT $${pi} OFFSET $${pi+1}`,
      [...params, porPagina, offset]
    );

    res.json({ ok: true, rows: rows.rows, total, pagina, paginas });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── GET /descargar (CSV) ───────────────────────────────────────────────────────
app.get('/descargar', requireAuth, async (req, res) => {
  try {
    const params = [];
    let pi = 1;
    let where = 'WHERE 1=1';

    if (req.admin.rol === 'bienestar' && req.admin.unidad) {
      where += ` AND UPPER(unidad) LIKE $${pi++}`;
      params.push('%' + req.admin.unidad.toUpperCase() + '%');
    }
    const comisaria = (req.query.comisaria || '').toUpperCase();
    const unidad    = (req.query.unidad    || '').toUpperCase();
    if (comisaria) { where += ` AND UPPER(comisaria) LIKE $${pi++}`; params.push('%'+comisaria+'%'); }
    if (unidad)    { where += ` AND UPPER(unidad) LIKE $${pi++}`;    params.push('%'+unidad+'%'); }

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
    const fname = unidad ? `Cuestionario_${unidad.replace(/\s+/g,'_')}.csv`
                : comisaria ? `Cuestionario_${comisaria.replace(/\s+/g,'_')}.csv`
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
    const r  = await pool.query('SELECT * FROM evaluaciones WHERE id=$1', [id]);
    if (!r.rows.length) return res.status(404).json({ error: 'No encontrado' });
    const ev  = r.rows[0];
    if (req.admin.rol === 'bienestar' && req.admin.unidad &&
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

// ── GET /pdf/grupo?comisaria=X ó ?unidad=X ────────────────────────────────────
app.get('/pdf/grupo', requireAuth, async (req, res) => {
  try {
    const comisaria = (req.query.comisaria || '').toUpperCase();
    const unidad    = (req.query.unidad    || '').toUpperCase();
    if (!comisaria && !unidad) return res.status(400).json({ error: 'Parámetro requerido' });

    let where = comisaria ? 'UPPER(comisaria) LIKE $1' : 'UPPER(unidad) LIKE $1';
    const val = comisaria ? '%'+comisaria+'%' : '%'+unidad+'%';
    const r   = await pool.query(`SELECT * FROM evaluaciones WHERE ${where} ORDER BY nombres`, [val]);
    if (!r.rows.length) return res.status(404).json({ error: 'Sin evaluaciones' });

    const pregsR = await pool.query('SELECT numero AS id, texto FROM preguntas WHERE activa=TRUE ORDER BY orden,numero');
    const label  = comisaria || unidad;
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

// ── Iniciar ────────────────────────────────────────────────────────────────────
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`\n=== REGPOL Callao — Puerto ${PORT} ===`);
  });
}).catch(e => { console.error('DB error:', e.message); process.exit(1); });
