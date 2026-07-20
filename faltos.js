/*
  Módulo Faltos — REGPOL Callao
  Registro estadístico de inasistencias (año 2026).
  - faltos_registrar: personal de unidad (alta diaria + cambio de situación)
  - faltos_admin: área central (consulta global, dashboard, Excel histórico una vez)
  - unitic: acceso total
*/
const XLSX = require('xlsx');

const SITUACIONES = ['FALTO', 'TARDE', 'ABANDONO'];
const ANIO_CONTROL = 2026;
const MS_24H = 24 * 60 * 60 * 1000;

function normalizarPermisos(permisos) {
  if (Array.isArray(permisos)) return permisos;
  if (typeof permisos === 'string') {
    try { return JSON.parse(permisos); } catch (e) { return []; }
  }
  return [];
}

function perms(admin) {
  return normalizarPermisos(admin && admin.permisos);
}

function esUnitic(admin) {
  return !!(admin && admin.rol === 'unitic');
}

function puedeFaltos(admin) {
  if (!admin) return false;
  if (esUnitic(admin)) return true;
  const p = perms(admin);
  return p.includes('faltos_admin') || p.includes('faltos_registrar');
}

function puedeFaltosAdmin(admin) {
  if (!admin) return false;
  if (esUnitic(admin)) return true;
  return perms(admin).includes('faltos_admin');
}

function puedeFaltosRegistrar(admin) {
  if (!admin) return false;
  if (esUnitic(admin)) return true;
  return perms(admin).includes('faltos_registrar');
}

/** Solo el de la unidad (o Super Admin) puede cambiar situación. Admin central no. */
function puedeCambiarSituacion(admin) {
  if (!admin) return false;
  if (esUnitic(admin)) return true;
  return perms(admin).includes('faltos_registrar');
}

function debeFiltrarPorUnidadFaltos(admin) {
  if (!admin || !admin.unidad) return false;
  if (esUnitic(admin) || puedeFaltosAdmin(admin)) return false;
  return puedeFaltosRegistrar(admin);
}

function requireFaltos(req, res, next) {
  if (!puedeFaltos(req.admin)) {
    return res.status(403).json({ ok: false, error: 'Sin permiso de Faltos' });
  }
  next();
}

function requireFaltosAdmin(req, res, next) {
  if (!puedeFaltosAdmin(req.admin)) {
    return res.status(403).json({ ok: false, error: 'Solo el admin del área puede realizar esta acción' });
  }
  next();
}

function limpio(v, max) {
  const s = String(v == null ? '' : v).trim().replace(/\s+/g, ' ');
  return max ? s.slice(0, max) : s;
}

function soloDigitos(v) {
  return String(v == null ? '' : v).replace(/\D/g, '');
}

function normalizarCip(v) {
  const d = soloDigitos(v);
  if (!d) return '';
  if (d.length >= 8) return d.slice(-8);
  return d.padStart(8, '0');
}

function parseFecha(v) {
  if (!v) return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
  }
  if (typeof v === 'number' && XLSX.SSF) {
    try {
      const parsed = XLSX.SSF.parse_date_code(v);
      if (parsed) {
        return parsed.y + '-' + String(parsed.m).padStart(2, '0') + '-' + String(parsed.d).padStart(2, '0');
      }
    } catch (e) { /* ignore */ }
  }
  return null;
}

function parseHora(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(v.getTime())) {
    return String(v.getHours()).padStart(2, '0') + ':' + String(v.getMinutes()).padStart(2, '0');
  }
  if (typeof v === 'number' && v >= 0 && v < 1 && XLSX.SSF) {
    try {
      const totalMin = Math.round(v * 24 * 60);
      const hh = Math.floor(totalMin / 60) % 24;
      const mm = totalMin % 60;
      return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
    } catch (e) { /* ignore */ }
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?/);
  if (m) {
    const hh = Math.min(23, parseInt(m[1], 10));
    const mm = Math.min(59, parseInt(m[2], 10));
    return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  }
  return null;
}

function construirInicioLabor(fechaISO, horaHHMM) {
  if (!fechaISO || !horaHHMM) return null;
  // Callao / Lima: UTC-5 (sin horario de verano)
  const d = new Date(fechaISO + 'T' + horaHHMM + ':00-05:00');
  if (isNaN(d.getTime())) return null;
  return d;
}

function calcularSituacion(inicioLabor, reincorporacion) {
  if (!inicioLabor || !reincorporacion) return 'FALTO';
  const a = inicioLabor instanceof Date ? inicioLabor : new Date(inicioLabor);
  const b = reincorporacion instanceof Date ? reincorporacion : new Date(reincorporacion);
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return 'FALTO';
  const diff = b.getTime() - a.getTime();
  if (diff < 0) return 'FALTO';
  if (diff <= MS_24H) return 'TARDE';
  return 'ABANDONO';
}

function mapearColumna(headers, aliases) {
  const norm = headers.map(function(h) {
    return String(h || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  });
  for (let a = 0; a < aliases.length; a++) {
    const al = aliases[a].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const idx = norm.findIndex(function(h) { return h === al || h.indexOf(al) !== -1; });
    if (idx >= 0) return headers[idx];
  }
  return null;
}

function filaValor(row, key) {
  if (!key) return '';
  const v = row[key];
  if (v == null) return '';
  return String(v).trim();
}

async function initTablasFaltos(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS faltos (
      id                  SERIAL PRIMARY KEY,
      numero_registro     VARCHAR(30) UNIQUE NOT NULL,
      cip                 VARCHAR(8) NOT NULL,
      dni                 VARCHAR(20) DEFAULT '',
      apellidos_nombres   VARCHAR(200) NOT NULL DEFAULT '',
      grado               VARCHAR(80) DEFAULT '',
      division            VARCHAR(120) DEFAULT '',
      unidad              VARCHAR(150) NOT NULL DEFAULT '',
      inicio_labor        TIMESTAMPTZ NOT NULL,
      situacion           VARCHAR(20) NOT NULL DEFAULT 'FALTO',
      reincorporacion     TIMESTAMPTZ,
      observacion         TEXT DEFAULT '',
      origen              VARCHAR(20) DEFAULT 'manual',
      anio                SMALLINT NOT NULL DEFAULT 2026,
      creado_por          VARCHAR(60) DEFAULT '',
      creado_por_unidad   VARCHAR(150) DEFAULT '',
      actualizado_por     VARCHAR(60) DEFAULT '',
      creado_en           TIMESTAMPTZ DEFAULT NOW(),
      actualizado_en      TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_faltos_cip ON faltos(cip);
    CREATE INDEX IF NOT EXISTS idx_faltos_numero ON faltos(numero_registro);
    CREATE INDEX IF NOT EXISTS idx_faltos_unidad ON faltos(unidad);
    CREATE INDEX IF NOT EXISTS idx_faltos_division ON faltos(division);
    CREATE INDEX IF NOT EXISTS idx_faltos_situacion ON faltos(situacion);
    CREATE INDEX IF NOT EXISTS idx_faltos_inicio ON faltos(inicio_labor);
    CREATE INDEX IF NOT EXISTS idx_faltos_anio ON faltos(anio);
    CREATE SEQUENCE IF NOT EXISTS faltos_numero_seq START 1;
    ALTER TABLE faltos ADD COLUMN IF NOT EXISTS cargo VARCHAR(80) DEFAULT '';
    ALTER TABLE faltos ADD COLUMN IF NOT EXISTS area VARCHAR(120) DEFAULT '';
  `);
}

async function siguienteNumeroRegistro(pool, anio) {
  const y = anio || ANIO_CONTROL;
  const r = await pool.query('SELECT nextval(\'faltos_numero_seq\')::int AS n');
  const n = r.rows[0].n;
  // Formato: F20260001, F20260002, ...
  return 'F' + y + String(n).padStart(4, '0');
}

async function buscarPersonalRrhh(pool, cipRaw) {
  const cip = normalizarCip(cipRaw);
  if (!cip || cip.length !== 8) return { error: 'CIP inválido (8 dígitos)' };
  const r = await pool.query(
    `SELECT cip, dni, apellidos_nombres, grado, unidad_nombre, division_nombre, situacion
     FROM personal_rrhh WHERE cip=$1`,
    [cip]
  );
  if (!r.rows.length) return { error: 'CIP no encontrado en nómina RR.HH.' };
  const p = r.rows[0];
  if (String(p.situacion || '').toUpperCase() === 'BAJA') {
    return { error: 'El efectivo figura como BAJA en nómina' };
  }
  return {
    personal: {
      cip: p.cip,
      dni: p.dni || '',
      apellidos_nombres: p.apellidos_nombres || '',
      grado: p.grado || '',
      unidad: p.unidad_nombre || '',
      division: p.division_nombre || '',
      situacion_rrhh: p.situacion || ''
    }
  };
}

function filaPublica(row) {
  if (!row) return null;
  return {
    id: row.id,
    numero_registro: row.numero_registro,
    cip: row.cip,
    dni: row.dni,
    apellidos_nombres: row.apellidos_nombres,
    grado: row.grado,
    division: row.division,
    unidad: row.unidad,
    cargo: row.cargo || '',
    area: row.area || '',
    inicio_labor: row.inicio_labor,
    situacion: row.situacion,
    reincorporacion: row.reincorporacion,
    observacion: row.observacion,
    origen: row.origen,
    anio: row.anio,
    creado_por: row.creado_por,
    creado_por_unidad: row.creado_por_unidad,
    actualizado_por: row.actualizado_por,
    creado_en: row.creado_en,
    actualizado_en: row.actualizado_en
  };
}

function construirFiltros(query, admin) {
  const where = ['1=1'];
  const params = [];
  let i = 1;

  const anio = parseInt(query.anio, 10);
  if (anio) {
    where.push('anio=$' + i);
    params.push(anio);
    i++;
  }

  if (query.division) {
    where.push('UPPER(TRIM(division))=UPPER(TRIM($' + i + '))');
    params.push(String(query.division).trim());
    i++;
  }
  if (query.unidad) {
    where.push('UPPER(TRIM(unidad))=UPPER(TRIM($' + i + '))');
    params.push(String(query.unidad).trim());
    i++;
  }
  if (query.situacion && SITUACIONES.indexOf(String(query.situacion).toUpperCase()) >= 0) {
    where.push('situacion=$' + i);
    params.push(String(query.situacion).toUpperCase());
    i++;
  }
  if (query.origen) {
    where.push('origen=$' + i);
    params.push(String(query.origen).trim().toLowerCase());
    i++;
  }
  if (query.cip) {
    where.push('cip=$' + i);
    params.push(normalizarCip(query.cip));
    i++;
  }
  if (query.numero_registro) {
    where.push('UPPER(numero_registro)=UPPER(TRIM($' + i + '))');
    params.push(String(query.numero_registro).trim());
    i++;
  }
  if (query.desde) {
    const d = parseFecha(query.desde);
    if (d) {
      where.push('inicio_labor::date >= $' + i + '::date');
      params.push(d);
      i++;
    }
  }
  if (query.hasta) {
    const d = parseFecha(query.hasta);
    if (d) {
      where.push('inicio_labor::date <= $' + i + '::date');
      params.push(d);
      i++;
    }
  }
  if (query.mes) {
    const m = parseInt(query.mes, 10);
    if (m >= 1 && m <= 12) {
      where.push('EXTRACT(MONTH FROM inicio_labor)=$' + i);
      params.push(m);
      i++;
    }
  }
  if (query.q) {
    const q = '%' + String(query.q).trim().toUpperCase() + '%';
    where.push('(UPPER(apellidos_nombres) LIKE $' + i + ' OR cip LIKE $' + (i + 1) + ' OR UPPER(numero_registro) LIKE $' + i + ')');
    params.push(q, normalizarCip(query.q) || '________');
    i += 2;
  }

  if (debeFiltrarPorUnidadFaltos(admin)) {
    where.push('UPPER(TRIM(unidad))=UPPER(TRIM($' + i + '))');
    params.push(String(admin.unidad).trim());
    i++;
  }

  return { where: where.join(' AND '), params };
}

async function insertarFalto(pool, data, admin, origen) {
  const numero = await siguienteNumeroRegistro(pool, data.anio || ANIO_CONTROL);
  const r = await pool.query(
    `INSERT INTO faltos (
      numero_registro, cip, dni, apellidos_nombres, grado, division, unidad,
      cargo, area,
      inicio_labor, situacion, reincorporacion, observacion, origen, anio,
      creado_por, creado_por_unidad
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
    RETURNING *`,
    [
      numero,
      data.cip,
      data.dni || '',
      data.apellidos_nombres,
      data.grado || '',
      data.division || '',
      data.unidad,
      data.cargo || '',
      data.area || '',
      data.inicio_labor,
      data.situacion || 'FALTO',
      data.reincorporacion || null,
      data.observacion || '',
      origen || 'manual',
      data.anio || ANIO_CONTROL,
      (admin && admin.usuario) || '',
      (admin && admin.unidad) || data.unidad || ''
    ]
  );
  return r.rows[0];
}

function registrarRutas(app, pool, requireAuth) {
  app.get('/admin/faltos/rrhh/:cip', requireAuth, requireFaltos, async function(req, res) {
    try {
      const found = await buscarPersonalRrhh(pool, req.params.cip);
      if (found.error) return res.json({ ok: false, error: found.error });
      if (debeFiltrarPorUnidadFaltos(req.admin)) {
        const uAdmin = String(req.admin.unidad || '').trim().toUpperCase();
        const uPers = String(found.personal.unidad || '').trim().toUpperCase();
        if (uAdmin && uPers && uAdmin !== uPers) {
          return res.json({ ok: false, error: 'El CIP pertenece a otra unidad (' + found.personal.unidad + ')' });
        }
      }
      res.json({ ok: true, personal: found.personal });
    } catch (e) {
      res.json({ ok: false, error: e.message });
    }
  });

  app.get('/admin/faltos/meta/filtros', requireAuth, requireFaltos, async function(req, res) {
    try {
      const f = construirFiltros({ anio: req.query.anio || ANIO_CONTROL }, req.admin);
      const [divs, unis, sits] = await Promise.all([
        pool.query(
          `SELECT DISTINCT division AS k FROM faltos
           WHERE ${f.where} AND TRIM(COALESCE(division,''))<>'' ORDER BY 1`,
          f.params
        ),
        pool.query(
          `SELECT DISTINCT unidad AS k, division FROM faltos
           WHERE ${f.where} AND TRIM(COALESCE(unidad,''))<>'' ORDER BY 1`,
          f.params
        ),
        pool.query(
          `SELECT situacion AS k, COUNT(*)::int AS n FROM faltos
           WHERE ${f.where} GROUP BY situacion ORDER BY 1`,
          f.params
        )
      ]);
      res.json({
        ok: true,
        anio: parseInt(req.query.anio, 10) || ANIO_CONTROL,
        divisiones: divs.rows,
        unidades: unis.rows.map(function(r) { return { k: r.k, division: r.division }; }),
        situaciones: sits.rows,
        puede_registrar: puedeFaltosRegistrar(req.admin),
        puede_admin: puedeFaltosAdmin(req.admin),
        puede_cambiar_situacion: puedeCambiarSituacion(req.admin),
        unidad_asignada: req.admin.unidad || null
      });
    } catch (e) {
      res.json({ ok: false, error: e.message });
    }
  });

  app.get('/admin/faltos', requireAuth, requireFaltos, async function(req, res) {
    try {
      const f = construirFiltros(req.query, req.admin);
      const limit = Math.min(1000, parseInt(req.query.limit, 10) || 500);
      const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
      const totalR = await pool.query('SELECT COUNT(*)::int AS t FROM faltos WHERE ' + f.where, f.params);
      const r = await pool.query(
        `SELECT * FROM faltos WHERE ${f.where}
         ORDER BY inicio_labor DESC, id DESC
         LIMIT ${limit} OFFSET ${offset}`,
        f.params
      );
      res.json({
        ok: true,
        total: totalR.rows[0].t,
        rows: r.rows.map(filaPublica),
        puede_cambiar_situacion: puedeCambiarSituacion(req.admin)
      });
    } catch (e) {
      res.json({ ok: false, error: e.message });
    }
  });

  app.get('/admin/faltos/dashboard/stats', requireAuth, requireFaltos, async function(req, res) {
    try {
      const f = construirFiltros(req.query, req.admin);
      const base = 'FROM faltos WHERE ' + f.where;
      const [tot, porSit, porUnidad, porMes, porDia] = await Promise.all([
        pool.query('SELECT COUNT(*)::int AS total ' + base, f.params),
        pool.query(
          `SELECT situacion, COUNT(*)::int AS n ${base} GROUP BY situacion ORDER BY situacion`,
          f.params
        ),
        pool.query(
          `SELECT unidad, COUNT(*)::int AS n ${base}
           GROUP BY unidad ORDER BY n DESC, unidad LIMIT 40`,
          f.params
        ),
        pool.query(
          `SELECT EXTRACT(MONTH FROM inicio_labor)::int AS mes, COUNT(*)::int AS n ${base}
           GROUP BY 1 ORDER BY 1`,
          f.params
        ),
        pool.query(
          `SELECT inicio_labor::date AS dia, COUNT(*)::int AS n ${base}
           GROUP BY 1 ORDER BY 1 DESC LIMIT 60`,
          f.params
        )
      ]);
      const resumen = { total: tot.rows[0].total, FALTO: 0, TARDE: 0, ABANDONO: 0 };
      porSit.rows.forEach(function(r) { resumen[r.situacion] = r.n; });
      res.json({
        ok: true,
        resumen: resumen,
        por_situacion: porSit.rows,
        por_unidad: porUnidad.rows,
        por_mes: porMes.rows,
        por_dia: porDia.rows
      });
    } catch (e) {
      res.json({ ok: false, error: e.message });
    }
  });

  app.get('/admin/faltos/consulta', requireAuth, requireFaltos, async function(req, res) {
    try {
      const cip = normalizarCip(req.query.cip);
      const numero = limpio(req.query.numero_registro || req.query.numero, 30).toUpperCase();
      if (!cip || !numero) {
        return res.json({ ok: false, error: 'Indique CIP y número de registro' });
      }
      const r = await pool.query(
        `SELECT * FROM faltos
         WHERE cip=$1 AND UPPER(numero_registro)=$2`,
        [cip, numero]
      );
      if (!r.rows.length) {
        return res.json({ ok: false, error: 'No se encontró el falto con ese CIP y número de registro' });
      }
      const row = r.rows[0];
      if (debeFiltrarPorUnidadFaltos(req.admin)) {
        const uAdmin = String(req.admin.unidad || '').trim().toUpperCase();
        if (uAdmin && String(row.unidad || '').trim().toUpperCase() !== uAdmin) {
          return res.status(403).json({ ok: false, error: 'Sin acceso a registros de otra unidad' });
        }
      }
      res.json({
        ok: true,
        falto: filaPublica(row),
        puede_cambiar_situacion: puedeCambiarSituacion(req.admin)
      });
    } catch (e) {
      res.json({ ok: false, error: e.message });
    }
  });

  app.get('/admin/faltos/export/csv', requireAuth, requireFaltos, async function(req, res) {
    try {
      const f = construirFiltros(req.query, req.admin);
      const r = await pool.query(
        `SELECT numero_registro, cip, apellidos_nombres, grado, division, unidad,
                inicio_labor, situacion, reincorporacion, observacion, origen, anio, creado_por, creado_en
         FROM faltos WHERE ${f.where}
         ORDER BY inicio_labor DESC, id DESC
         LIMIT 5000`,
        f.params
      );
      const sep = ';';
      const header = [
        'NUMERO', 'CIP', 'NOMBRES', 'GRADO', 'DIVISION', 'UNIDAD',
        'INICIO_LABOR', 'HORA_REGISTRO', 'SITUACION', 'REINCORPORACION', 'OBSERVACION', 'ORIGEN', 'ANIO', 'REGISTRADO_POR'
      ].join(sep);
      const lines = r.rows.map(function(row) {
        function c(v) {
          return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
        }
        return [
          c(row.numero_registro), c(row.cip), c(row.apellidos_nombres), c(row.grado),
          c(row.division), c(row.unidad), c(row.inicio_labor), c(row.creado_en),
          c(row.situacion), c(row.reincorporacion), c(row.observacion), c(row.origen),
          c(row.anio), c(row.creado_por)
        ].join(sep);
      });
      const csv = '\uFEFF' + header + '\n' + lines.join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="faltos_2026.csv"');
      res.send(csv);
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.get('/admin/faltos/:id', requireAuth, requireFaltos, async function(req, res) {
    try {
      const id = parseInt(req.params.id, 10);
      if (!id) return res.json({ ok: false, error: 'ID inválido' });
      const r = await pool.query('SELECT * FROM faltos WHERE id=$1', [id]);
      if (!r.rows.length) return res.json({ ok: false, error: 'No encontrado' });
      const row = r.rows[0];
      if (debeFiltrarPorUnidadFaltos(req.admin)) {
        const uAdmin = String(req.admin.unidad || '').trim().toUpperCase();
        if (uAdmin && String(row.unidad || '').trim().toUpperCase() !== uAdmin) {
          return res.status(403).json({ ok: false, error: 'Sin acceso a registros de otra unidad' });
        }
      }
      res.json({
        ok: true,
        falto: filaPublica(row),
        puede_cambiar_situacion: puedeCambiarSituacion(req.admin)
      });
    } catch (e) {
      res.json({ ok: false, error: e.message });
    }
  });

  app.post('/admin/faltos', requireAuth, requireFaltos, async function(req, res) {
    try {
      if (!puedeFaltosRegistrar(req.admin)) {
        return res.status(403).json({ ok: false, error: 'Solo el personal de unidad puede registrar faltos' });
      }
      const b = req.body || {};
      const found = await buscarPersonalRrhh(pool, b.cip);
      if (found.error) return res.json({ ok: false, error: found.error });
      const p = found.personal;

      if (debeFiltrarPorUnidadFaltos(req.admin)) {
        const uAdmin = String(req.admin.unidad || '').trim().toUpperCase();
        const uPers = String(p.unidad || '').trim().toUpperCase();
        if (uAdmin && uPers && uAdmin !== uPers) {
          return res.json({ ok: false, error: 'Solo puede registrar faltos de su unidad (' + req.admin.unidad + ')' });
        }
      }

      const fecha = parseFecha(b.fecha_labor || b.fecha);
      const hora = parseHora(b.hora_inicio_labor || b.hora);
      if (!fecha) return res.json({ ok: false, error: 'Fecha de inicio de labor requerida' });
      if (!hora) return res.json({ ok: false, error: 'Hora de inicio de labor requerida' });
      const anio = parseInt(fecha.slice(0, 4), 10);
      if (anio !== ANIO_CONTROL) {
        return res.json({ ok: false, error: 'Solo se registran faltos del año ' + ANIO_CONTROL });
      }
      const inicio = construirInicioLabor(fecha, hora);
      if (!inicio) return res.json({ ok: false, error: 'Fecha/hora de labor inválidas' });

      const unidadReg = p.unidad || (req.admin.unidad || '');
      if (!unidadReg) return res.json({ ok: false, error: 'El CIP no tiene unidad en nómina' });

      const dup = await pool.query(
        `SELECT id, numero_registro FROM faltos
         WHERE cip=$1 AND inicio_labor=$2 LIMIT 1`,
        [p.cip, inicio.toISOString()]
      );
      if (dup.rows.length) {
        return res.json({
          ok: false,
          error: 'Ya existe un falto para este CIP en esa fecha/hora (' + dup.rows[0].numero_registro + ')'
        });
      }

      const row = await insertarFalto(pool, {
        cip: p.cip,
        dni: p.dni,
        apellidos_nombres: p.apellidos_nombres,
        grado: p.grado,
        division: p.division,
        unidad: unidadReg,
        inicio_labor: inicio.toISOString(),
        situacion: 'FALTO',
        observacion: limpio(b.observacion, 500),
        anio: ANIO_CONTROL
      }, req.admin, 'manual');

      res.json({
        ok: true,
        mensaje: 'Falto registrado correctamente',
        falto: filaPublica(row)
      });
    } catch (e) {
      res.json({ ok: false, error: e.message });
    }
  });

  app.put('/admin/faltos/:id/situacion', requireAuth, requireFaltos, async function(req, res) {
    try {
      if (!puedeCambiarSituacion(req.admin)) {
        return res.status(403).json({
          ok: false,
          error: 'Solo el personal de la unidad puede modificar la situación. El admin del área solo consulta.'
        });
      }
      const id = parseInt(req.params.id, 10);
      if (!id) return res.json({ ok: false, error: 'ID inválido' });
      const cur = await pool.query('SELECT * FROM faltos WHERE id=$1', [id]);
      if (!cur.rows.length) return res.json({ ok: false, error: 'No encontrado' });
      const row = cur.rows[0];

      if (debeFiltrarPorUnidadFaltos(req.admin)) {
        const uAdmin = String(req.admin.unidad || '').trim().toUpperCase();
        if (uAdmin && String(row.unidad || '').trim().toUpperCase() !== uAdmin) {
          return res.status(403).json({ ok: false, error: 'Sin acceso a registros de otra unidad' });
        }
      }

      const b = req.body || {};
      let reincorp = null;
      if (b.reincorporacion) {
        reincorp = new Date(b.reincorporacion);
        if (isNaN(reincorp.getTime())) {
          const fecha = parseFecha(b.fecha_reincorporacion || b.fecha);
          const hora = parseHora(b.hora_reincorporacion || b.hora);
          if (fecha && hora) reincorp = construirInicioLabor(fecha, hora);
        }
      } else if (b.fecha_reincorporacion && b.hora_reincorporacion) {
        reincorp = construirInicioLabor(parseFecha(b.fecha_reincorporacion), parseHora(b.hora_reincorporacion));
      }

      if (!reincorp) {
        return res.json({ ok: false, error: 'Indique fecha y hora de reincorporación' });
      }
      if (reincorp.getTime() < new Date(row.inicio_labor).getTime()) {
        return res.json({ ok: false, error: 'La reincorporación no puede ser anterior al inicio de labor' });
      }

      const situacion = calcularSituacion(row.inicio_labor, reincorp);
      const obs = b.observacion != null ? limpio(b.observacion, 500) : row.observacion;

      const upd = await pool.query(
        `UPDATE faltos SET
          situacion=$1,
          reincorporacion=$2,
          observacion=$3,
          actualizado_por=$4,
          actualizado_en=NOW()
         WHERE id=$5
         RETURNING *`,
        [situacion, reincorp.toISOString(), obs, (req.admin && req.admin.usuario) || '', id]
      );

      res.json({
        ok: true,
        mensaje: 'Situación actualizada a ' + situacion,
        falto: filaPublica(upd.rows[0])
      });
    } catch (e) {
      res.json({ ok: false, error: e.message });
    }
  });

  app.post('/admin/faltos/importar-historico', requireAuth, requireFaltos, requireFaltosAdmin, async function(req, res) {
    try {
      const b64 = String((req.body && req.body.archivo) || '');
      if (!b64) return res.json({ ok: false, error: 'Archivo Excel requerido' });
      const raw = b64.indexOf('base64,') >= 0 ? b64.split('base64,')[1] : b64;
      const buf = Buffer.from(raw, 'base64');
      const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      if (!rows.length) return res.json({ ok: false, error: 'El Excel no tiene filas' });

      const headers = Object.keys(rows[0]);
      const col = {
        cip: mapearColumna(headers, ['cip', 'codigo cip', 'nro cip']),
        fecha: mapearColumna(headers, ['fecha', 'fecha labor', 'fecha inicio', 'dia']),
        hora: mapearColumna(headers, ['hora', 'hora inicio', 'hora labor', 'hora de inicio']),
        situacion: mapearColumna(headers, ['situacion', 'situación', 'estado']),
        reincorporacion_fecha: mapearColumna(headers, ['fecha reincorporacion', 'fecha reincorporación', 'f. reincorporacion']),
        reincorporacion_hora: mapearColumna(headers, ['hora reincorporacion', 'hora reincorporación']),
        observacion: mapearColumna(headers, ['observacion', 'observación', 'obs', 'nota'])
      };
      if (!col.cip || !col.fecha) {
        return res.json({ ok: false, error: 'El Excel debe tener columnas CIP y FECHA (hora recomendada)' });
      }

      let insertados = 0;
      let omitidos = 0;
      const errores = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const cipRaw = filaValor(row, col.cip);
        const found = await buscarPersonalRrhh(pool, cipRaw);
        if (found.error) {
          omitidos++;
          if (errores.length < 20) errores.push('Fila ' + (i + 2) + ': ' + found.error);
          continue;
        }
        const p = found.personal;
        const fecha = parseFecha(filaValor(row, col.fecha) || row[col.fecha]);
        let hora = parseHora(filaValor(row, col.hora) || row[col.hora]);
        if (!hora) hora = '08:00';
        if (!fecha) {
          omitidos++;
          if (errores.length < 20) errores.push('Fila ' + (i + 2) + ': fecha inválida');
          continue;
        }
        const anio = parseInt(fecha.slice(0, 4), 10);
        if (anio !== ANIO_CONTROL) {
          omitidos++;
          if (errores.length < 20) errores.push('Fila ' + (i + 2) + ': solo año ' + ANIO_CONTROL);
          continue;
        }
        const inicio = construirInicioLabor(fecha, hora);
        if (!inicio) {
          omitidos++;
          continue;
        }

        let reincorp = null;
        const rf = parseFecha(filaValor(row, col.reincorporacion_fecha) || row[col.reincorporacion_fecha]);
        const rh = parseHora(filaValor(row, col.reincorporacion_hora) || row[col.reincorporacion_hora]);
        if (rf && rh) reincorp = construirInicioLabor(rf, rh);

        let situacion = limpio(filaValor(row, col.situacion), 20).toUpperCase();
        if (SITUACIONES.indexOf(situacion) < 0) {
          situacion = reincorp ? calcularSituacion(inicio, reincorp) : 'FALTO';
        } else if (reincorp && situacion === 'FALTO') {
          situacion = calcularSituacion(inicio, reincorp);
        }

        const dup = await pool.query(
          `SELECT id FROM faltos WHERE cip=$1 AND inicio_labor=$2 LIMIT 1`,
          [p.cip, inicio.toISOString()]
        );
        if (dup.rows.length) {
          omitidos++;
          continue;
        }

        try {
          await insertarFalto(pool, {
            cip: p.cip,
            dni: p.dni,
            apellidos_nombres: p.apellidos_nombres,
            grado: p.grado,
            division: p.division,
            unidad: p.unidad,
            inicio_labor: inicio.toISOString(),
            situacion: situacion,
            reincorporacion: reincorp ? reincorp.toISOString() : null,
            observacion: limpio(filaValor(row, col.observacion), 500),
            anio: ANIO_CONTROL
          }, req.admin, 'excel');
          insertados++;
        } catch (insErr) {
          omitidos++;
          if (errores.length < 20) errores.push('Fila ' + (i + 2) + ': ' + insErr.message);
        }
      }

      res.json({
        ok: true,
        insertados: insertados,
        omitidos: omitidos,
        errores: errores,
        mensaje: 'Importación histórica 2026: ' + insertados + ' insertados, ' + omitidos + ' omitidos'
      });
    } catch (e) {
      res.json({ ok: false, error: e.message });
    }
  });

  /** Consulta pública de solo lectura (CIP + Nº de registro). */
  app.post('/portal/faltos/consultar', async function(req, res) {
    try {
      const b = req.body || {};
      const cip = normalizarCip(b.cip);
      const numero = limpio(b.numero_registro || b.numero, 30).toUpperCase();
      if (!cip || !numero) {
        return res.json({ ok: false, error: 'Indique CIP y número de registro' });
      }
      const r = await pool.query(
        `SELECT numero_registro, cip, apellidos_nombres, grado, unidad, division, cargo, area,
                inicio_labor, situacion, reincorporacion, observacion, anio
         FROM faltos WHERE cip=$1 AND UPPER(numero_registro)=$2`,
        [cip, numero]
      );
      if (!r.rows.length) {
        return res.json({ ok: false, error: 'No se encontró el registro' });
      }
      const row = r.rows[0];
      res.json({
        ok: true,
        falto: {
          numero_registro: row.numero_registro,
          cip: row.cip,
          apellidos_nombres: row.apellidos_nombres,
          grado: row.grado,
          unidad: row.unidad,
          division: row.division,
          cargo: row.cargo || '',
          area: row.area || '',
          inicio_labor: row.inicio_labor,
          situacion: row.situacion,
          reincorporacion: row.reincorporacion,
          observacion: row.observacion || '',
          anio: row.anio
        }
      });
    } catch (e) {
      res.json({ ok: false, error: e.message });
    }
  });

  /** Cruce CIP con nómina (público, datos mínimos para el formulario de unidad). */
  app.post('/portal/faltos/rrhh-lookup', async function(req, res) {
    try {
      const found = await buscarPersonalRrhh(pool, (req.body && req.body.cip) || '');
      if (found.error) return res.json({ ok: false, error: found.error });
      res.json({ ok: true, personal: found.personal });
    } catch (e) {
      res.json({ ok: false, error: e.message });
    }
  });

  /**
   * Registro público por personal de unidad (igual modelo que descansos médicos).
   * Datos del formulario; cruce RR.HH. en segundo plano (completa huecos, no bloquea si hay datos).
   */
  app.post('/portal/faltos/registrar', async function(req, res) {
    try {
      const b = req.body || {};
      const cip = normalizarCip(b.cip);
      if (!cip) return res.json({ ok: false, error: 'CIP inválido' });

      const apePat = limpio(b.apellido_paterno || b.apepat, 100);
      const apeMat = limpio(b.apellido_materno || b.apemat, 100);
      const soloNombres = limpio(b.nombres, 150);
      let nombres = limpio(b.apellidos_nombres, 200);
      if (!nombres && (apePat || soloNombres)) {
        const apes = [apePat, apeMat].filter(Boolean).join(' ');
        nombres = apes && soloNombres ? (apes + ', ' + soloNombres) : (apes || soloNombres);
      }
      const grado = limpio(b.grado, 80);
      let unidad = limpio(b.unidad, 150);
      const cargo = limpio(b.cargo, 80);
      const area = limpio(b.area, 120);
      if (!apePat && !nombres) return res.json({ ok: false, error: 'Ingrese el apellido paterno del efectivo' });
      if (!soloNombres && !nombres) return res.json({ ok: false, error: 'Ingrese los nombres del efectivo' });
      if (!nombres) return res.json({ ok: false, error: 'Ingrese apellidos y nombres del efectivo' });
      if (!unidad) return res.json({ ok: false, error: 'Indique la unidad' });
      if (!cargo) return res.json({ ok: false, error: 'Indique el cargo' });
      if (!area) return res.json({ ok: false, error: 'Indique el área' });

      // Segundo plano: enriquecer desde nómina si existe (no se muestra al usuario)
      let dni = limpio(b.dni, 20);
      let division = limpio(b.division, 120);
      const found = await buscarPersonalRrhh(pool, cip);
      if (!found.error && found.personal) {
        const p = found.personal;
        if (!dni) dni = p.dni || '';
        if (!division) division = p.division || '';
        if (!grado && p.grado) { /* form grado takes priority if filled */ }
        if (p.unidad && !unidad) unidad = p.unidad;
      }

      let fecha = parseFecha(b.fecha_labor || b.fecha);
      let hora = parseHora(b.hora_inicio_labor || b.hora);
      // datetime-local: "2026-07-20T14:30"
      const dt = limpio(b.inicio_labor_datetime || b.datetime_inicio, 30);
      if (dt && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(dt)) {
        fecha = dt.slice(0, 10);
        hora = dt.slice(11, 16);
      }
      if (!fecha) return res.json({ ok: false, error: 'Fecha y hora de inicio de labor requeridas' });
      if (!hora) return res.json({ ok: false, error: 'Fecha y hora de inicio de labor requeridas' });
      const anio = parseInt(fecha.slice(0, 4), 10);
      if (anio !== ANIO_CONTROL) {
        return res.json({ ok: false, error: 'Solo se registran faltos del año ' + ANIO_CONTROL });
      }
      const inicio = construirInicioLabor(fecha, hora);
      if (!inicio) return res.json({ ok: false, error: 'Fecha/hora de labor inválidas' });

      const dup = await pool.query(
        `SELECT id, numero_registro FROM faltos
         WHERE cip=$1 AND inicio_labor=$2 LIMIT 1`,
        [cip, inicio.toISOString()]
      );
      if (dup.rows.length) {
        return res.json({
          ok: false,
          error: 'Ya existe un falto para este CIP en esa fecha/hora (' + dup.rows[0].numero_registro + ')'
        });
      }

      const row = await insertarFalto(pool, {
        cip: cip,
        dni: dni,
        apellidos_nombres: nombres,
        grado: grado || (found.personal && found.personal.grado) || '',
        division: division,
        unidad: unidad,
        cargo: cargo,
        area: area,
        inicio_labor: inicio.toISOString(),
        situacion: 'FALTO',
        observacion: limpio(b.observacion, 500),
        anio: ANIO_CONTROL
      }, { usuario: 'portal-unidad', unidad: unidad }, 'portal');

      res.json({
        ok: true,
        mensaje: 'Falto registrado. Conserve el Nº de registro para consultar o actualizar la situación.',
        falto: filaPublica(row)
      });
    } catch (e) {
      res.json({ ok: false, error: e.message });
    }
  });

  /**
   * Actualizar situación (público) con CIP + Nº registro + reincorporación.
   * ≤24h → TARDE · >24h → ABANDONO
   */
  app.post('/portal/faltos/actualizar-situacion', async function(req, res) {
    try {
      const b = req.body || {};
      const cip = normalizarCip(b.cip);
      const numero = limpio(b.numero_registro || b.numero, 30).toUpperCase();
      if (!cip || !numero) {
        return res.json({ ok: false, error: 'Indique CIP y número de registro' });
      }
      const cur = await pool.query(
        'SELECT * FROM faltos WHERE cip=$1 AND UPPER(numero_registro)=$2',
        [cip, numero]
      );
      if (!cur.rows.length) return res.json({ ok: false, error: 'No se encontró el registro' });
      const row = cur.rows[0];

      let reincorp = null;
      const dtSit = limpio(b.reincorporacion_datetime || b.datetime_reincorporacion, 30);
      if (dtSit && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(dtSit)) {
        reincorp = construirInicioLabor(dtSit.slice(0, 10), dtSit.slice(11, 16));
      } else if (b.fecha_reincorporacion && b.hora_reincorporacion) {
        reincorp = construirInicioLabor(parseFecha(b.fecha_reincorporacion), parseHora(b.hora_reincorporacion));
      } else if (b.reincorporacion) {
        reincorp = new Date(b.reincorporacion);
        if (isNaN(reincorp.getTime())) reincorp = null;
      }
      if (!reincorp) {
        return res.json({ ok: false, error: 'Indique fecha y hora de reincorporación' });
      }
      if (reincorp.getTime() < new Date(row.inicio_labor).getTime()) {
        return res.json({ ok: false, error: 'La reincorporación no puede ser anterior al inicio de labor' });
      }

      const situacion = calcularSituacion(row.inicio_labor, reincorp);
      const obs = b.observacion != null ? limpio(b.observacion, 500) : row.observacion;
      const upd = await pool.query(
        `UPDATE faltos SET
          situacion=$1,
          reincorporacion=$2,
          observacion=$3,
          actualizado_por='portal-unidad',
          actualizado_en=NOW()
         WHERE id=$4
         RETURNING *`,
        [situacion, reincorp.toISOString(), obs, row.id]
      );
      res.json({
        ok: true,
        mensaje: 'Situación actualizada a ' + situacion,
        falto: filaPublica(upd.rows[0])
      });
    } catch (e) {
      res.json({ ok: false, error: e.message });
    }
  });
}

module.exports = {
  initTablasFaltos,
  registrarRutas,
  puedeFaltos,
  puedeFaltosAdmin,
  puedeFaltosRegistrar,
  ANIO_CONTROL,
  SITUACIONES
};
