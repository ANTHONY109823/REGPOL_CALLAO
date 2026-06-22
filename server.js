/*
  REGPOL Callao - Backend Node.js → SQLite (archivo local)
  Ing. Anthony Ccayo - UNITIC - 2026

  Ejecutar:  node server.js
  Portal:    http://localhost:3000/index.html
  Eval:      http://localhost:3000/evaluacion.html
  Stats:     http://localhost:3000/stats
  Descargar: http://localhost:3000/descargar
*/

const express  = require('express');
const cors     = require('cors');
const path     = require('path');
const Database = require('better-sqlite3');
const { generarPDFIndividual, generarPDFComisaria } = require('./pdf_gen');

const app  = express();
const PORT = 3000;

// ── Base de datos SQLite ──────────────────────────────────────────────────────
const db = new Database(path.join(__dirname, 'regpol_callao.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS evaluaciones (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha      TEXT DEFAULT (datetime('now','localtime')),
    comisaria  TEXT,
    unidad     TEXT,
    nombres    TEXT,
    cip        TEXT,
    dni        TEXT,
    fecha_nac  TEXT,
    edad       INTEGER,
    respuestas TEXT,
    completada INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS progresos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    clave       TEXT UNIQUE,
    cip         TEXT,
    nombres     TEXT,
    comisaria   TEXT,
    pagina      INTEGER DEFAULT 1,
    total_resp  INTEGER DEFAULT 0,
    respuestas  TEXT,
    actualizado TEXT DEFAULT (datetime('now','localtime'))
  );
`);

console.log('Base de datos SQLite lista: regpol_callao.db');

// ── Middlewares ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(__dirname));

// ── POST /guardar ─ Guardar evaluación completa ───────────────────────────────
app.post('/guardar', (req, res) => {
  try {
    const { comisaria, unidad, nombres, cip, dni, fecha_nac, edad, respuestas } = req.body;
    if (!nombres || !cip) return res.json({ ok: false, error: 'Faltan datos obligatorios' });

    const stmt = db.prepare(`
      INSERT INTO evaluaciones (comisaria, unidad, nombres, cip, dni, fecha_nac, edad, respuestas)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      comisaria || '', unidad || '', nombres || '',
      cip || '', dni || '', fecha_nac || '',
      parseInt(edad) || 0,
      JSON.stringify(respuestas || {})
    );

    console.log(`[OK] Evaluacion guardada: ${nombres} | ${comisaria}`);
    res.json({ ok: true });
  } catch (e) {
    console.error('Error /guardar:', e.message);
    res.json({ ok: false, error: e.message });
  }
});

// ── POST /progreso ─ Guardar progreso parcial ─────────────────────────────────
app.post('/progreso', (req, res) => {
  try {
    const { email, cip, nombres, comisaria, pagina, total, respuestas } = req.body;
    const clave = (email || cip || 'anonimo').toLowerCase();

    db.prepare(`
      INSERT INTO progresos (clave, cip, nombres, comisaria, pagina, total_resp, respuestas, actualizado)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))
      ON CONFLICT(clave) DO UPDATE SET
        cip=excluded.cip, nombres=excluded.nombres, comisaria=excluded.comisaria,
        pagina=excluded.pagina, total_resp=excluded.total_resp,
        respuestas=excluded.respuestas, actualizado=datetime('now','localtime')
    `).run(clave, cip || '', nombres || '', comisaria || '', pagina || 1, total || 0, JSON.stringify(respuestas || {}));

    res.json({ ok: true, guardado: true });
  } catch (e) {
    console.error('Error /progreso:', e.message);
    res.json({ ok: false, error: e.message });
  }
});

// ── GET /progreso?email= ─ Cargar progreso ────────────────────────────────────
app.get('/progreso', (req, res) => {
  try {
    const clave = (req.query.email || req.query.cip || '').toLowerCase();
    if (!clave) return res.json({ ok: false, error: 'Email o CIP requerido' });

    const row = db.prepare('SELECT * FROM progresos WHERE clave = ?').get(clave);
    if (!row) return res.json({ ok: true, encontrado: false });

    let respuestas = {};
    try { respuestas = JSON.parse(row.respuestas || '{}'); } catch(e) {}

    res.json({
      ok: true, encontrado: true,
      cip: row.cip, nombres: row.nombres, comisaria: row.comisaria,
      pagina: row.pagina, total: row.total_resp,
      respuestas,
      ultima: row.actualizado || ''
    });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── GET /stats ─ Estadísticas para panel admin ────────────────────────────────
app.get('/stats', (req, res) => {
  try {
    const totalCompletas = db.prepare('SELECT COUNT(*) AS t FROM evaluaciones').get().t;
    const porComisaria   = db.prepare(
      'SELECT comisaria AS nombre, COUNT(*) AS total FROM evaluaciones GROUP BY comisaria ORDER BY comisaria'
    ).all();
    const ultimasEvaluaciones = db.prepare(
      'SELECT fecha, comisaria, unidad, nombres FROM evaluaciones ORDER BY fecha DESC LIMIT 10'
    ).all();
    const progresosActivos = db.prepare('SELECT COUNT(*) AS t FROM progresos').get().t;

    res.json({ ok: true, totalCompletas, porComisaria, ultimasEvaluaciones, progresosActivos });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── GET /listar ─ Lista de comisarías ─────────────────────────────────────────
app.get('/listar', (req, res) => {
  try {
    const rows  = db.prepare('SELECT DISTINCT comisaria FROM evaluaciones ORDER BY comisaria').all();
    const total = db.prepare('SELECT COUNT(*) AS t FROM evaluaciones').get().t;
    res.json({ ok: true, comisarias: rows.map(r => r.comisaria), total });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── GET /evaluaciones ─ Tabla paginada para el panel admin ───────────────────
app.get('/evaluaciones', (req, res) => {
  try {
    const pagina    = Math.max(1, parseInt(req.query.pagina) || 1);
    const porPagina = 20;
    const offset    = (pagina - 1) * porPagina;
    const comisaria = (req.query.comisaria || '').toUpperCase();
    const busqueda  = (req.query.busqueda  || '').toUpperCase();

    let where = 'WHERE 1=1';
    const params = [];
    if (comisaria) { where += ' AND UPPER(comisaria) LIKE ?'; params.push('%' + comisaria + '%'); }
    if (busqueda)  { where += ' AND (UPPER(nombres) LIKE ? OR UPPER(cip) LIKE ? OR UPPER(dni) LIKE ?)'; params.push('%'+busqueda+'%','%'+busqueda+'%','%'+busqueda+'%'); }

    const total   = db.prepare('SELECT COUNT(*) AS t FROM evaluaciones ' + where).get(...params).t;
    const paginas = Math.max(1, Math.ceil(total / porPagina));
    const rows    = db.prepare('SELECT id,fecha,comisaria,unidad,nombres,cip,dni,fecha_nac,edad,respuestas FROM evaluaciones ' + where + ' ORDER BY fecha DESC LIMIT ? OFFSET ?').all(...params, porPagina, offset);

    res.json({ ok: true, rows, total, pagina, paginas });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── GET /descargar ─ CSV completo con las 566 respuestas ──────────────────────
app.get('/descargar', (req, res) => {
  try {
    const comisaria = (req.query.comisaria || '').toUpperCase();
    let rows;
    if (comisaria) {
      rows = db.prepare(
        'SELECT * FROM evaluaciones WHERE UPPER(comisaria) LIKE ? ORDER BY fecha DESC'
      ).all('%' + comisaria + '%');
    } else {
      rows = db.prepare('SELECT * FROM evaluaciones ORDER BY fecha DESC').all();
    }

    const headers = ['ID','Fecha','Comisaria','Unidad','Nombres','CIP','DNI','FechaNac','Edad'];
    for (let i = 1; i <= 566; i++) headers.push('P' + i);

    const Q = '"';
    const csvRows = rows.map(row => {
      let resp = {};
      try { resp = JSON.parse(row.respuestas || '{}'); } catch(e) {}
      const base = [row.id, row.fecha, row.comisaria, row.unidad,
                    row.nombres, row.cip, row.dni, row.fecha_nac, row.edad];
      for (let i = 1; i <= 566; i++) base.push(resp[i] || '');
      return base.map(c => Q + String(c || '').replace(/"/g, '""') + Q).join(',');
    });

    const csv = '﻿' + [headers.map(h => Q+h+Q).join(','), ...csvRows].join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="MMPI2_REGPOL_Callao.csv"');
    res.send(csv);
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── GET /pdf/efectivo?id=N ─ PDF individual ───────────────────────────────────
app.get('/pdf/efectivo', async (req, res) => {
  try {
    const id = parseInt(req.query.id);
    if (!id) return res.status(400).json({ error: 'ID requerido' });

    const ev = db.prepare('SELECT * FROM evaluaciones WHERE id = ?').get(id);
    if (!ev) return res.status(404).json({ error: 'Evaluación no encontrada' });

    const buf      = await generarPDFIndividual(ev);
    const nombreFile = (ev.nombres || 'efectivo').replace(/\s+/g,'_').replace(/[^a-zA-Z0-9_]/g,'') + '_MMPI2.pdf';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="' + nombreFile + '"');
    res.send(buf);
  } catch (e) {
    console.error('Error /pdf/efectivo:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── GET /pdf/comisaria?comisaria=X ─ PDF de toda la comisaría ─────────────────
app.get('/pdf/comisaria', async (req, res) => {
  try {
    const comisaria = (req.query.comisaria || '').trim().toUpperCase();
    if (!comisaria) return res.status(400).json({ error: 'Comisaría requerida' });

    const rows = db.prepare(
      'SELECT * FROM evaluaciones WHERE UPPER(comisaria) LIKE ? ORDER BY nombres'
    ).all('%' + comisaria + '%');

    if (!rows.length) return res.status(404).json({ error: 'Sin evaluaciones para esa comisaría' });

    const buf      = await generarPDFComisaria(comisaria, rows);
    const nombreFile = 'MMPI2_' + comisaria.replace(/\s+/g,'_') + '.pdf';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="' + nombreFile + '"');
    res.send(buf);
  } catch (e) {
    console.error('Error /pdf/comisaria:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Iniciar servidor ──────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║   REGPOL Callao - Servidor Activo    ║');
  console.log('╠══════════════════════════════════════╣');
  console.log(`║  Portal:     http://localhost:${PORT}/    ║`);
  console.log(`║  Evaluacion: http://localhost:${PORT}/evaluacion.html  ║`);
  console.log(`║  Stats:      http://localhost:${PORT}/stats  ║`);
  console.log(`║  CSV:        http://localhost:${PORT}/descargar  ║`);
  console.log('╚══════════════════════════════════════╝\n');
});
