/*
  REGPOL Callao - Backend Node.js → PostgreSQL (Railway)
  Ing. Anthony Ccayo - UNITIC - 2026
*/

const express = require('express');
const cors    = require('cors');
const path    = require('path');
const { Pool } = require('pg');
const { generarPDFIndividual, generarPDFComisaria } = require('./pdf_gen');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── PostgreSQL (Railway inyecta DATABASE_URL automáticamente) ─────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// ── Crear tablas si no existen ────────────────────────────────────────────────
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS evaluaciones (
      id         SERIAL PRIMARY KEY,
      fecha      TIMESTAMP DEFAULT NOW(),
      comisaria  VARCHAR(100),
      unidad     VARCHAR(150),
      nombres    VARCHAR(200),
      cip        VARCHAR(20),
      dni        VARCHAR(20),
      fecha_nac  DATE,
      edad       SMALLINT,
      respuestas JSONB,
      completada BOOLEAN DEFAULT TRUE
    );
    CREATE INDEX IF NOT EXISTS idx_eval_comisaria ON evaluaciones(comisaria);
    CREATE INDEX IF NOT EXISTS idx_eval_fecha     ON evaluaciones(fecha DESC);

    CREATE TABLE IF NOT EXISTS progresos (
      id          SERIAL PRIMARY KEY,
      clave       VARCHAR(150) UNIQUE,
      cip         VARCHAR(20),
      nombres     VARCHAR(200),
      comisaria   VARCHAR(100),
      pagina      SMALLINT DEFAULT 1,
      total_resp  SMALLINT DEFAULT 0,
      respuestas  JSONB,
      actualizado TIMESTAMP DEFAULT NOW()
    );
  `);
  console.log('Tablas PostgreSQL listas.');
}

// ── Middlewares ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── POST /guardar ─────────────────────────────────────────────────────────────
app.post('/guardar', async (req, res) => {
  try {
    const { comisaria, unidad, nombres, cip, dni, fecha_nac, edad, respuestas } = req.body;
    if (!nombres || !cip) return res.json({ ok: false, error: 'Faltan datos obligatorios' });

    await pool.query(
      `INSERT INTO evaluaciones (comisaria,unidad,nombres,cip,dni,fecha_nac,edad,respuestas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [comisaria||'', unidad||'', nombres||'', cip||'', dni||'',
       fecha_nac||null, parseInt(edad)||0, respuestas||{}]
    );
    console.log(`[OK] ${nombres} | ${comisaria}`);
    res.json({ ok: true });
  } catch (e) {
    console.error('Error /guardar:', e.message);
    res.json({ ok: false, error: e.message });
  }
});

// ── POST /progreso ────────────────────────────────────────────────────────────
app.post('/progreso', async (req, res) => {
  try {
    const { email, cip, nombres, comisaria, pagina, total, respuestas } = req.body;
    const clave = (email || cip || 'anonimo').toLowerCase();

    await pool.query(
      `INSERT INTO progresos (clave,cip,nombres,comisaria,pagina,total_resp,respuestas,actualizado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
       ON CONFLICT (clave) DO UPDATE SET
         cip=$2, nombres=$3, comisaria=$4, pagina=$5,
         total_resp=$6, respuestas=$7, actualizado=NOW()`,
      [clave, cip||'', nombres||'', comisaria||'', pagina||1, total||0, respuestas||{}]
    );
    res.json({ ok: true, guardado: true });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── GET /progreso?email= ──────────────────────────────────────────────────────
app.get('/progreso', async (req, res) => {
  try {
    const clave = (req.query.email || req.query.cip || '').toLowerCase();
    if (!clave) return res.json({ ok: false, error: 'Email o CIP requerido' });

    const r = await pool.query('SELECT * FROM progresos WHERE clave=$1', [clave]);
    if (!r.rows.length) return res.json({ ok: true, encontrado: false });

    const row = r.rows[0];
    res.json({
      ok: true, encontrado: true,
      cip: row.cip, nombres: row.nombres, comisaria: row.comisaria,
      pagina: row.pagina, total: row.total_resp,
      respuestas: row.respuestas,
      ultima: row.actualizado ? new Date(row.actualizado).toLocaleString('es-PE') : ''
    });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── GET /stats ────────────────────────────────────────────────────────────────
app.get('/stats', async (req, res) => {
  try {
    const total    = await pool.query('SELECT COUNT(*) AS t FROM evaluaciones');
    const porComis = await pool.query(
      `SELECT comisaria AS nombre, COUNT(*) AS total
       FROM evaluaciones GROUP BY comisaria ORDER BY comisaria`
    );
    const ultimas  = await pool.query(
      `SELECT TO_CHAR(fecha,'DD/MM/YYYY HH24:MI') AS fecha, comisaria, unidad, nombres
       FROM evaluaciones ORDER BY fecha DESC LIMIT 10`
    );
    const progresos = await pool.query('SELECT COUNT(*) AS t FROM progresos');

    res.json({
      ok: true,
      totalCompletas:      parseInt(total.rows[0].t),
      porComisaria:        porComis.rows,
      ultimasEvaluaciones: ultimas.rows,
      progresosActivos:    parseInt(progresos.rows[0].t)
    });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── GET /listar ───────────────────────────────────────────────────────────────
app.get('/listar', async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT DISTINCT comisaria FROM evaluaciones ORDER BY comisaria'
    );
    const t = await pool.query('SELECT COUNT(*) AS t FROM evaluaciones');
    res.json({ ok: true, comisarias: r.rows.map(x => x.comisaria), total: parseInt(t.rows[0].t) });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── GET /evaluaciones ─────────────────────────────────────────────────────────
app.get('/evaluaciones', async (req, res) => {
  try {
    const pagina    = Math.max(1, parseInt(req.query.pagina) || 1);
    const porPagina = 20;
    const offset    = (pagina - 1) * porPagina;
    const comisaria = (req.query.comisaria || '').toUpperCase();
    const busqueda  = (req.query.busqueda  || '').toUpperCase();

    let where  = 'WHERE 1=1';
    const params = [];
    let pi = 1;
    if (comisaria) { where += ` AND UPPER(comisaria) LIKE $${pi++}`; params.push('%'+comisaria+'%'); }
    if (busqueda)  {
      where += ` AND (UPPER(nombres) LIKE $${pi} OR cip LIKE $${pi+1} OR dni LIKE $${pi+2})`;
      params.push('%'+busqueda+'%','%'+busqueda+'%','%'+busqueda+'%'); pi+=3;
    }

    const countQ = await pool.query(`SELECT COUNT(*) AS t FROM evaluaciones ${where}`, params);
    const total  = parseInt(countQ.rows[0].t);
    const paginas = Math.max(1, Math.ceil(total / porPagina));

    const rows = await pool.query(
      `SELECT id, TO_CHAR(fecha,'DD/MM/YYYY HH24:MI') AS fecha, comisaria, unidad,
              nombres, cip, dni, fecha_nac, edad, respuestas
       FROM evaluaciones ${where} ORDER BY fecha DESC LIMIT $${pi} OFFSET $${pi+1}`,
      [...params, porPagina, offset]
    );

    res.json({ ok: true, rows: rows.rows, total, pagina, paginas });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── GET /descargar ────────────────────────────────────────────────────────────
app.get('/descargar', async (req, res) => {
  try {
    const comisaria = (req.query.comisaria || '').toUpperCase();
    let q, params = [];
    if (comisaria) {
      q = 'SELECT * FROM evaluaciones WHERE UPPER(comisaria) LIKE $1 ORDER BY fecha DESC';
      params = ['%'+comisaria+'%'];
    } else {
      q = 'SELECT * FROM evaluaciones ORDER BY fecha DESC';
    }
    const result = await pool.query(q, params);

    const headers = ['ID','Fecha','Comisaria','Unidad','Nombres','CIP','DNI','FechaNac','Edad'];
    for (let i = 1; i <= 566; i++) headers.push('P' + i);

    const Q = '"';
    const csvRows = result.rows.map(row => {
      const resp = row.respuestas || {};
      const base = [row.id, row.fecha, row.comisaria, row.unidad,
                    row.nombres, row.cip, row.dni, row.fecha_nac || '', row.edad];
      for (let i = 1; i <= 566; i++) base.push(resp[i] || '');
      return base.map(c => Q + String(c||'').replace(/"/g,'""') + Q).join(',');
    });

    const csv = '﻿' + [headers.map(h=>Q+h+Q).join(','), ...csvRows].join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="MMPI2_REGPOL_Callao.csv"');
    res.send(csv);
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── GET /pdf/efectivo?id=N ────────────────────────────────────────────────────
app.get('/pdf/efectivo', async (req, res) => {
  try {
    const id = parseInt(req.query.id);
    if (!id) return res.status(400).json({ error: 'ID requerido' });

    const r = await pool.query('SELECT * FROM evaluaciones WHERE id=$1', [id]);
    if (!r.rows.length) return res.status(404).json({ error: 'No encontrado' });

    const ev  = r.rows[0];
    const buf = await generarPDFIndividual(ev);
    const nom = (ev.nombres||'efectivo').replace(/\s+/g,'_').replace(/[^a-zA-Z0-9_]/g,'');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${nom}_MMPI2.pdf"`);
    res.send(buf);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /pdf/comisaria?comisaria=X ────────────────────────────────────────────
app.get('/pdf/comisaria', async (req, res) => {
  try {
    const comisaria = (req.query.comisaria || '').trim().toUpperCase();
    if (!comisaria) return res.status(400).json({ error: 'Comisaría requerida' });

    const r = await pool.query(
      'SELECT * FROM evaluaciones WHERE UPPER(comisaria) LIKE $1 ORDER BY nombres',
      ['%'+comisaria+'%']
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Sin evaluaciones' });

    const buf = await generarPDFComisaria(comisaria, r.rows);
    const nom = 'MMPI2_' + comisaria.replace(/\s+/g,'_') + '.pdf';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${nom}"`);
    res.send(buf);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Iniciar ───────────────────────────────────────────────────────────────────
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`\n=== REGPOL Callao — Puerto ${PORT} ===`);
    console.log(`Stats: /stats | PDF: /pdf/efectivo?id=N | /pdf/comisaria?comisaria=X`);
  });
}).catch(e => {
  console.error('Error iniciando DB:', e.message);
  process.exit(1);
});
