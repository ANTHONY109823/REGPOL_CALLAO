/*
  Módulo Descansos médicos — REGPOL Callao
  Independiente de Psicología, Educación y Convenios.
*/
const PDFDocument = require('pdfkit');
const XLSX = require('xlsx');

const GRADOS_MEDICO = ['CAPITAN S. PNP', 'MAYOR S. PNP', 'CMDTE S. PNP', 'CIVIL'];
const GRADOS_EFECTIVO = [
  'CORONEL PNP', 'COMANDANTE PNP', 'MAYOR PNP', 'CAPITAN PNP', 'TENIENTE PNP', 'ALFEREZ PNP',
  'SUPERIOR PNP', 'BRIGADIER PNP', 'TECNICO DE 1RA PNP', 'TECNICO DE 2DA PNP', 'TECNICO DE 3RA PNP',
  'SUBOFICIAL DE 1RA PNP', 'SUBOFICIAL DE 2DA PNP', 'SUBOFICIAL DE 3RA PNP'
];
const TIPOS_DOCUMENTO = [
  'Descanso médico domiciliario',
  'Exoneración de esfuerzo físico',
  'Descanso médico particular'
];
const CODIGO_BARRAS_HISTORICO = '----';

function normalizarPermisos(permisos) {
  if (Array.isArray(permisos)) return permisos;
  if (typeof permisos === 'string') {
    try { return JSON.parse(permisos); } catch (e) { return []; }
  }
  return [];
}

function puedeDescansos(admin) {
  if (!admin) return false;
  if (admin.rol === 'unitic') return true;
  return normalizarPermisos(admin.permisos).includes('cms_descansos');
}

function requireDescansos(req, res, next) {
  if (!puedeDescansos(req.admin)) {
    return res.status(403).json({ ok: false, error: 'Sin permiso de Descansos médicos' });
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

function parseFecha(v) {
  if (!v) return null;
  if (v instanceof Date && !isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    const d = m[1].padStart(2, '0');
    const mo = m[2].padStart(2, '0');
    return m[3] + '-' + mo + '-' + d;
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

function sumarDias(fechaISO, dias) {
  if (!fechaISO || !dias) return null;
  const d = new Date(fechaISO + 'T12:00:00');
  if (isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + (parseInt(dias, 10) || 0) - 1);
  return d.toISOString().slice(0, 10);
}

function nombreArchivoSeguro(label) {
  return String(label || 'informe')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 120) || 'informe';
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

async function initTablasDescansos(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS descansos_medicos (
      id                SERIAL PRIMARY KEY,
      cip               VARCHAR(20) NOT NULL,
      grado             VARCHAR(80) DEFAULT '',
      apellido_paterno  VARCHAR(100) DEFAULT '',
      apellido_materno  VARCHAR(100) DEFAULT '',
      nombres           VARCHAR(150) DEFAULT '',
      dni               VARCHAR(20) DEFAULT '',
      division          VARCHAR(120) DEFAULT '',
      unidad            VARCHAR(150) DEFAULT '',
      fecha_inicio      DATE,
      dias              INTEGER DEFAULT 0,
      fecha_termino     DATE,
      cie               VARCHAR(40) DEFAULT '',
      diagnostico       TEXT DEFAULT '',
      tipo_documento    VARCHAR(80) DEFAULT '',
      codigo_barras     VARCHAR(80) DEFAULT '',
      grado_medico      VARCHAR(60) DEFAULT '',
      nombres_medico    VARCHAR(200) DEFAULT '',
      cip_medico        VARCHAR(20) DEFAULT '',
      dni_medico        VARCHAR(20) DEFAULT '',
      cmp_cop_medico    VARCHAR(40) DEFAULT '',
      centro_asistencial VARCHAR(200) DEFAULT '',
      pdf_data          TEXT DEFAULT '',
      pdf_nombre        VARCHAR(200) DEFAULT '',
      origen            VARCHAR(20) DEFAULT 'web',
      estado            VARCHAR(20) DEFAULT 'activo',
      observacion       TEXT DEFAULT '',
      fecha_registro    TIMESTAMPTZ DEFAULT NOW(),
      creado_por        VARCHAR(60) DEFAULT '',
      actualizado       TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE descansos_medicos ADD COLUMN IF NOT EXISTS cip_medico VARCHAR(20) DEFAULT '';
    ALTER TABLE descansos_medicos ADD COLUMN IF NOT EXISTS dni_medico VARCHAR(20) DEFAULT '';
    ALTER TABLE descansos_medicos ADD COLUMN IF NOT EXISTS cmp_cop_medico VARCHAR(40) DEFAULT '';
    CREATE INDEX IF NOT EXISTS idx_dm_cip ON descansos_medicos(cip);
    CREATE INDEX IF NOT EXISTS idx_dm_codigo ON descansos_medicos(codigo_barras);
    CREATE INDEX IF NOT EXISTS idx_dm_unidad ON descansos_medicos(unidad);
    CREATE INDEX IF NOT EXISTS idx_dm_division ON descansos_medicos(division);
    CREATE INDEX IF NOT EXISTS idx_dm_fecha_inicio ON descansos_medicos(fecha_inicio);
    CREATE INDEX IF NOT EXISTS idx_dm_estado ON descansos_medicos(estado);

    CREATE TABLE IF NOT EXISTS descansos_cotejos (
      id            SERIAL PRIMARY KEY,
      titulo        VARCHAR(200) DEFAULT '',
      archivo_nombre VARCHAR(200) DEFAULT '',
      total_hospital INTEGER DEFAULT 0,
      total_coincide INTEGER DEFAULT 0,
      total_solo_regpol INTEGER DEFAULT 0,
      total_solo_hospital INTEGER DEFAULT 0,
      detalle       JSONB DEFAULT '[]',
      creado_por    VARCHAR(60) DEFAULT '',
      creado        TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}

function construirFiltros(query) {
  const where = ["estado <> 'anulado'"];
  const params = [];
  function add(sql, val) {
    params.push(val);
    where.push(sql.replace('?', '$' + params.length));
  }
  if (query.division) add('division ILIKE ?', '%' + limpio(query.division, 120) + '%');
  if (query.unidad) add('unidad ILIKE ?', '%' + limpio(query.unidad, 150) + '%');
  if (query.grado) add('grado ILIKE ?', '%' + limpio(query.grado, 80) + '%');
  if (query.cie) add('cie ILIKE ?', '%' + limpio(query.cie, 40) + '%');
  if (query.diagnostico) add('diagnostico ILIKE ?', '%' + limpio(query.diagnostico, 200) + '%');
  if (query.tipo_documento) add('tipo_documento = ?', limpio(query.tipo_documento, 80));
  if (query.cip) add('cip = ?', soloDigitos(query.cip).slice(0, 20));
  if (query.codigo_barras) add('codigo_barras = ?', limpio(query.codigo_barras, 80));
  if (query.origen) add('origen = ?', limpio(query.origen, 20));
  if (query.anio) {
    params.push(parseInt(query.anio, 10));
    where.push('EXTRACT(YEAR FROM COALESCE(fecha_inicio, fecha_registro)) = $' + params.length);
  }
  if (query.desde) {
    const d = parseFecha(query.desde);
    if (d) add('fecha_inicio >= ?::date', d);
  }
  if (query.hasta) {
    const d = parseFecha(query.hasta);
    if (d) add('fecha_inicio <= ?::date', d);
  }
  if (query.q) {
    const q = '%' + limpio(query.q, 100) + '%';
    params.push(q, q, q, q);
    const a = params.length - 3;
    where.push('(cip ILIKE $' + a + ' OR nombres ILIKE $' + (a + 1) +
      ' OR apellido_paterno ILIKE $' + (a + 2) + ' OR apellido_materno ILIKE $' + (a + 3) +
      ' OR dni ILIKE $' + a + ')');
  }
  return { where: where.join(' AND '), params };
}

function nombreCompleto(r) {
  return [r.apellido_paterno, r.apellido_materno, r.nombres].filter(Boolean).join(' ').trim();
}

function validarRegistro(body, opts) {
  opts = opts || {};
  const errores = [];
  const cip = soloDigitos(body.cip).slice(0, 20);
  if (!cip) errores.push('CIP obligatorio');
  const grado = limpio(body.grado, 80);
  const apellido_paterno = limpio(body.apellido_paterno, 100);
  const apellido_materno = limpio(body.apellido_materno, 100);
  const nombres = limpio(body.nombres, 150);
  if (!nombres && !apellido_paterno) errores.push('Nombres u apellidos obligatorios');
  const unidad = limpio(body.unidad, 150);
  if (!unidad && !opts.historico) errores.push('Unidad obligatoria');
  const fecha_inicio = parseFecha(body.fecha_inicio);
  const dias = parseInt(body.dias, 10) || 0;
  let fecha_termino = parseFecha(body.fecha_termino);
  if (!fecha_inicio && !opts.historico) errores.push('Fecha de inicio obligatoria');
  if (dias <= 0 && !opts.historico) errores.push('Días del DM obligatorios');
  if (!fecha_termino && fecha_inicio && dias > 0) fecha_termino = sumarDias(fecha_inicio, dias);
  const cie = limpio(body.cie, 40);
  const diagnostico = limpio(body.diagnostico, 2000);
  const tipo_documento = limpio(body.tipo_documento, 80);
  if (tipo_documento && TIPOS_DOCUMENTO.indexOf(tipo_documento) === -1 && !opts.historico) {
    errores.push('Tipo de documento inválido');
  }
  let codigo_barras = limpio(body.codigo_barras, 80);
  if (opts.historico) {
    codigo_barras = CODIGO_BARRAS_HISTORICO;
  } else if (!codigo_barras) {
    errores.push('N.º código de barras obligatorio');
  }
  const grado_medico = limpio(body.grado_medico, 60);
  if (grado_medico && GRADOS_MEDICO.indexOf(grado_medico) === -1 && !opts.historico) {
    errores.push('Grado del médico inválido');
  }
  const nombres_medico = limpio(body.nombres_medico, 200);
  const cip_medico = soloDigitos(body.cip_medico).slice(0, 20);
  const dni_medico = soloDigitos(body.dni_medico).slice(0, 20);
  const cmp_cop_medico = limpio(body.cmp_cop_medico, 40);
  if (!opts.historico) {
    if (!cip_medico) errores.push('N.º de CIP del médico obligatorio');
    if (!dni_medico) errores.push('N.º de DNI del médico obligatorio');
    if (!cmp_cop_medico) errores.push('N.º de CMP/COP del médico obligatorio');
  }
  const centro_asistencial = limpio(body.centro_asistencial, 200);
  const pdf_data = String(body.pdf_data || '');
  const pdf_nombre = limpio(body.pdf_nombre, 200);
  if (!opts.historico && !opts.sinPdf) {
    if (!pdf_data || pdf_data.indexOf('data:application/pdf') !== 0) {
      errores.push('PDF del descanso obligatorio');
    } else if (pdf_data.length > 7 * 1024 * 1024) {
      errores.push('PDF demasiado grande (máx. ~5 MB)');
    }
  }
  return {
    errores,
    data: {
      cip,
      grado,
      apellido_paterno,
      apellido_materno,
      nombres,
      dni: soloDigitos(body.dni).slice(0, 20),
      division: limpio(body.division, 120),
      unidad,
      fecha_inicio,
      dias,
      fecha_termino,
      cie,
      diagnostico,
      tipo_documento,
      codigo_barras,
      grado_medico,
      nombres_medico,
      cip_medico,
      dni_medico,
      cmp_cop_medico,
      centro_asistencial,
      pdf_data: pdf_data || '',
      pdf_nombre: pdf_nombre || '',
      origen: opts.historico ? 'historico' : (opts.origen || 'web'),
      observacion: limpio(body.observacion, 1000)
    }
  };
}

async function resolverDivision(pool, unidad) {
  if (!unidad) return '';
  const r = await pool.query(
    `SELECT d.nombre FROM unidades_pol u
     LEFT JOIN divisiones d ON d.id = u.division_id
     WHERE u.nombre ILIKE $1 LIMIT 1`,
    [unidad]
  );
  return r.rows[0] ? (r.rows[0].nombre || '') : '';
}

function registrarRutas(app, pool, requireAuth) {
  // Catálogos públicos
  app.get('/portal/descansos/catalogos', function(req, res) {
    res.json({
      ok: true,
      grados_medico: GRADOS_MEDICO,
      tipos_documento: TIPOS_DOCUMENTO,
      grados_efectivo: GRADOS_EFECTIVO
    });
  });

  // Registro público web
  app.post('/portal/descansos/registrar', async function(req, res) {
    try {
      const v = validarRegistro(req.body || {}, { origen: 'web' });
      if (v.errores.length) return res.json({ ok: false, error: v.errores.join('. ') });
      const d = v.data;
      if (!d.division) d.division = await resolverDivision(pool, d.unidad);

      // Evitar duplicado exacto CIP + código de barras (si no es histórico)
      if (d.codigo_barras !== CODIGO_BARRAS_HISTORICO) {
        const dup = await pool.query(
          `SELECT id FROM descansos_medicos
           WHERE cip=$1 AND codigo_barras=$2 AND estado<>'anulado' LIMIT 1`,
          [d.cip, d.codigo_barras]
        );
        if (dup.rows.length) {
          return res.json({ ok: false, error: 'Ya existe un registro con ese CIP y código de barras' });
        }
      }

      const ins = await pool.query(
        `INSERT INTO descansos_medicos (
          cip, grado, apellido_paterno, apellido_materno, nombres, dni, division, unidad,
          fecha_inicio, dias, fecha_termino, cie, diagnostico, tipo_documento, codigo_barras,
          grado_medico, nombres_medico, cip_medico, dni_medico, cmp_cop_medico, centro_asistencial,
          pdf_data, pdf_nombre, origen, estado, observacion, creado_por
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
          $21,$22,$23,$24,'activo',$25,$26
        ) RETURNING id, cip, codigo_barras, fecha_registro`,
        [
          d.cip, d.grado, d.apellido_paterno, d.apellido_materno, d.nombres, d.dni, d.division, d.unidad,
          d.fecha_inicio, d.dias, d.fecha_termino, d.cie, d.diagnostico, d.tipo_documento, d.codigo_barras,
          d.grado_medico, d.nombres_medico, d.cip_medico, d.dni_medico, d.cmp_cop_medico, d.centro_asistencial,
          d.pdf_data, d.pdf_nombre, d.origen, d.observacion, 'web'
        ]
      );
      const row = ins.rows[0];
      res.json({
        ok: true,
        id: row.id,
        mensaje: 'Descanso médico registrado correctamente',
        cip: row.cip,
        nombres: nombreCompleto(d)
      });
    } catch (e) {
      res.json({ ok: false, error: e.message });
    }
  });

  // Consulta pública: CIP + código de barras → solo nombres + CIP
  app.post('/portal/descansos/consultar', async function(req, res) {
    try {
      const cip = soloDigitos(req.body && req.body.cip).slice(0, 20);
      const codigo = limpio(req.body && req.body.codigo_barras, 80);
      if (!cip || !codigo) return res.json({ ok: false, error: 'CIP y código de barras obligatorios' });
      if (codigo === CODIGO_BARRAS_HISTORICO) {
        return res.json({ ok: false, error: 'Código de barras no válido para consulta' });
      }
      const r = await pool.query(
        `SELECT cip, apellido_paterno, apellido_materno, nombres
         FROM descansos_medicos
         WHERE cip=$1 AND codigo_barras=$2 AND estado<>'anulado'
           AND codigo_barras <> $3
         ORDER BY fecha_registro DESC LIMIT 1`,
        [cip, codigo, CODIGO_BARRAS_HISTORICO]
      );
      if (!r.rows.length) {
        return res.json({ ok: false, encontrado: false, error: 'No se encontró registro con esos datos' });
      }
      const row = r.rows[0];
      res.json({
        ok: true,
        encontrado: true,
        mensaje: 'El descanso médico ya se encuentra ingresado',
        cip: row.cip,
        nombres: nombreCompleto(row)
      });
    } catch (e) {
      res.json({ ok: false, error: e.message });
    }
  });

  // ── Admin: listado ──────────────────────────────────────────────────────────
  app.get('/admin/descansos', requireAuth, requireDescansos, async function(req, res) {
    try {
      const f = construirFiltros(req.query);
      const limit = Math.min(parseInt(req.query.limit, 10) || 200, 1000);
      const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
      const count = await pool.query(
        'SELECT COUNT(*)::int AS t FROM descansos_medicos WHERE ' + f.where,
        f.params
      );
      const params = f.params.slice();
      params.push(limit);
      params.push(offset);
      const r = await pool.query(
        `SELECT id, cip, grado, apellido_paterno, apellido_materno, nombres, dni, division, unidad,
                fecha_inicio, dias, fecha_termino, cie, diagnostico, tipo_documento, codigo_barras,
                grado_medico, nombres_medico, cip_medico, dni_medico, cmp_cop_medico, centro_asistencial,
                pdf_nombre, origen, estado, observacion, fecha_registro, creado_por,
                (pdf_data IS NOT NULL AND pdf_data <> '') AS tiene_pdf
         FROM descansos_medicos
         WHERE ${f.where}
         ORDER BY COALESCE(fecha_inicio, fecha_registro::date) DESC, id DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );
      res.json({ ok: true, total: count.rows[0].t, rows: r.rows });
    } catch (e) {
      res.json({ ok: false, error: e.message });
    }
  });

  // Rutas específicas ANTES de /:id
  app.get('/admin/descansos/meta/filtros', requireAuth, requireDescansos, async function(req, res) {
    try {
      // Catálogo completo (no solo valores ya usados en registros del año)
      const divsCat = await pool.query(
        'SELECT nombre FROM divisiones ORDER BY orden, nombre'
      );
      const unisCat = await pool.query(
        `SELECT u.nombre AS k, COALESCE(d.nombre, '') AS division
         FROM unidades_pol u
         LEFT JOIN divisiones d ON d.id = u.division_id
         ORDER BY d.orden NULLS LAST, d.nombre, u.orden, u.nombre`
      );

      // Incluir también valores históricos presentes en registros (por si difieren del catálogo)
      const divExtras = await pool.query(
        `SELECT DISTINCT division AS k FROM descansos_medicos
         WHERE estado <> 'anulado' AND division <> '' ORDER BY 1`
      );
      const extrasUni = await pool.query(
        `SELECT DISTINCT unidad AS k, division
         FROM descansos_medicos
         WHERE estado <> 'anulado' AND unidad <> ''
         ORDER BY 1`
      );
      const extrasGrado = await pool.query(
        `SELECT DISTINCT grado AS k FROM descansos_medicos
         WHERE estado <> 'anulado' AND grado <> ''
         ORDER BY 1`
      );

      const divSet = {};
      const divisiones = [];
      divsCat.rows.forEach(function(r) {
        if (!r.nombre || divSet[r.nombre]) return;
        divSet[r.nombre] = true;
        divisiones.push(r.nombre);
      });
      divExtras.rows.forEach(function(r) {
        if (!r.k || divSet[r.k]) return;
        divSet[r.k] = true;
        divisiones.push(r.k);
      });

      const uniSet = {};
      const unidades = [];
      unisCat.rows.forEach(function(r) {
        if (!r.k || uniSet[r.k]) return;
        uniSet[r.k] = true;
        unidades.push({ k: r.k, division: r.division || '' });
      });
      extrasUni.rows.forEach(function(r) {
        if (!r.k || uniSet[r.k]) return;
        uniSet[r.k] = true;
        unidades.push({ k: r.k, division: r.division || '' });
      });

      const gradoSet = {};
      const grados = [];
      GRADOS_EFECTIVO.forEach(function(g) {
        if (gradoSet[g]) return;
        gradoSet[g] = true;
        grados.push(g);
      });
      extrasGrado.rows.forEach(function(r) {
        if (!r.k || gradoSet[r.k]) return;
        gradoSet[r.k] = true;
        grados.push(r.k);
      });

      res.json({
        ok: true,
        divisiones: divisiones,
        unidades: unidades,
        grados: grados,
        tipos_documento: TIPOS_DOCUMENTO,
        grados_medico: GRADOS_MEDICO
      });
    } catch (e) {
      res.json({ ok: false, error: e.message });
    }
  });

  app.get('/admin/descansos/dashboard/stats', requireAuth, requireDescansos, async function(req, res) {
    try {
      const f = construirFiltros(req.query);
      const base = 'FROM descansos_medicos WHERE ' + f.where;
      const tot = await pool.query(
        `SELECT COUNT(*)::int AS total,
                COALESCE(SUM(dias),0)::int AS dias_total,
                COALESCE(ROUND(AVG(NULLIF(dias,0))),0)::int AS dias_promedio,
                COUNT(DISTINCT cip)::int AS efectivos
         ${base}`,
        f.params
      );
      const porUnidad = await pool.query(
        `SELECT COALESCE(NULLIF(unidad,''),'SIN UNIDAD') AS k, COUNT(*)::int AS n, COALESCE(SUM(dias),0)::int AS dias
         ${base} GROUP BY 1 ORDER BY n DESC LIMIT 40`,
        f.params
      );
      const porDivision = await pool.query(
        `SELECT COALESCE(NULLIF(division,''),'SIN DIVISIÓN') AS k, COUNT(*)::int AS n, COALESCE(SUM(dias),0)::int AS dias
         ${base} GROUP BY 1 ORDER BY n DESC LIMIT 20`,
        f.params
      );
      const porGrado = await pool.query(
        `SELECT COALESCE(NULLIF(grado,''),'SIN GRADO') AS k, COUNT(*)::int AS n
         ${base} GROUP BY 1 ORDER BY n DESC LIMIT 30`,
        f.params
      );
      const porDx = await pool.query(
        `SELECT COALESCE(NULLIF(diagnostico,''),'SIN DIAGNÓSTICO') AS k, COUNT(*)::int AS n
         ${base} GROUP BY 1 ORDER BY n DESC LIMIT 25`,
        f.params
      );
      const porCie = await pool.query(
        `SELECT COALESCE(NULLIF(cie,''),'SIN CIE') AS k, COUNT(*)::int AS n
         ${base} GROUP BY 1 ORDER BY n DESC LIMIT 25`,
        f.params
      );
      const porTipo = await pool.query(
        `SELECT COALESCE(NULLIF(tipo_documento,''),'SIN TIPO') AS k, COUNT(*)::int AS n
         ${base} GROUP BY 1 ORDER BY n DESC`,
        f.params
      );
      const topEfectivos = await pool.query(
        `SELECT cip,
                MAX(apellido_paterno) AS apellido_paterno,
                MAX(apellido_materno) AS apellido_materno,
                MAX(nombres) AS nombres,
                COUNT(*)::int AS n,
                COALESCE(SUM(dias),0)::int AS dias
         ${base}
         GROUP BY cip ORDER BY n DESC, dias DESC LIMIT 20`,
        f.params
      );
      const porOrigen = await pool.query(
        `SELECT COALESCE(origen,'web') AS k, COUNT(*)::int AS n
         ${base} GROUP BY 1 ORDER BY n DESC`,
        f.params
      );

      res.json({
        ok: true,
        resumen: tot.rows[0],
        por_unidad: porUnidad.rows,
        por_division: porDivision.rows,
        por_grado: porGrado.rows,
        por_diagnostico: porDx.rows,
        por_cie: porCie.rows,
        por_tipo: porTipo.rows,
        top_efectivos: topEfectivos.rows,
        por_origen: porOrigen.rows
      });
    } catch (e) {
      res.json({ ok: false, error: e.message });
    }
  });

  app.get('/admin/descansos/export/csv', requireAuth, requireDescansos, async function(req, res) {
    try {
      const f = construirFiltros(req.query);
      const r = await pool.query(
        `SELECT cip, grado, apellido_paterno, apellido_materno, nombres, dni, division, unidad,
                fecha_inicio, dias, fecha_termino, cie, diagnostico, tipo_documento, codigo_barras,
                grado_medico, nombres_medico, cip_medico, dni_medico, cmp_cop_medico, centro_asistencial,
                origen, fecha_registro
         FROM descansos_medicos WHERE ${f.where}
         ORDER BY COALESCE(fecha_inicio, fecha_registro::date) DESC`,
        f.params
      );
      const cols = [
        'cip', 'grado', 'apellido_paterno', 'apellido_materno', 'nombres', 'dni', 'division', 'unidad',
        'fecha_inicio', 'dias', 'fecha_termino', 'cie', 'diagnostico', 'tipo_documento', 'codigo_barras',
        'grado_medico', 'nombres_medico', 'cip_medico', 'dni_medico', 'cmp_cop_medico', 'centro_asistencial',
        'origen', 'fecha_registro'
      ];
      const lines = [cols.join(';')];
      r.rows.forEach(function(row) {
        lines.push(cols.map(function(c) {
          let v = row[c] == null ? '' : String(row[c]);
          if (c === 'fecha_inicio' || c === 'fecha_termino') v = v.slice(0, 10);
          if (c === 'fecha_registro' && row[c]) v = new Date(row[c]).toISOString();
          return '"' + v.replace(/"/g, '""') + '"';
        }).join(';'));
      });
      const csv = '\uFEFF' + lines.join('\n');
      const nom = 'descansos_' + nombreArchivoSeguro(req.query.unidad || req.query.division || 'todos') + '.csv';
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="' + nom + '"');
      res.send(csv);
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.get('/admin/descansos/export/pdf', requireAuth, requireDescansos, async function(req, res) {
    try {
      const modo = limpio(req.query.modo || 'listado', 20);
      const f = construirFiltros(req.query);
      const tituloFiltro = [
        req.query.division ? 'División: ' + req.query.division : '',
        req.query.unidad ? 'Unidad: ' + req.query.unidad : '',
        req.query.grado ? 'Grado: ' + req.query.grado : '',
        req.query.anio ? 'Año: ' + req.query.anio : ''
      ].filter(Boolean).join(' · ') || 'Todos los registros';

      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const chunks = [];
      doc.on('data', function(c) { chunks.push(c); });

      const done = new Promise(function(resolve) {
        doc.on('end', function() { resolve(Buffer.concat(chunks)); });
      });

      doc.fillColor('#004d3d').fontSize(14).font('Helvetica-Bold')
        .text('REGPOL CALLAO — DESCANSOS MÉDICOS', { align: 'center' });
      doc.moveDown(0.3);
      doc.fillColor('#333').fontSize(10).font('Helvetica')
        .text(modo === 'dashboard' ? 'DASHBOARD / RESUMEN' : 'LISTADO FILTRADO', { align: 'center' });
      doc.fontSize(9).fillColor('#666').text(tituloFiltro, { align: 'center' });
      doc.moveDown(0.8);

      if (modo === 'dashboard') {
        const statsRes = await pool.query(
          `SELECT COUNT(*)::int AS total, COALESCE(SUM(dias),0)::int AS dias_total,
                  COUNT(DISTINCT cip)::int AS efectivos
           FROM descansos_medicos WHERE ${f.where}`,
          f.params
        );
        const s = statsRes.rows[0];
        doc.fillColor('#004d3d').fontSize(11).font('Helvetica-Bold').text('Resumen');
        doc.font('Helvetica').fontSize(10).fillColor('#222')
          .text('Total DM: ' + s.total)
          .text('Efectivos: ' + s.efectivos)
          .text('Días totales: ' + s.dias_total);
        doc.moveDown(0.6);

        const porUnidad = await pool.query(
          `SELECT COALESCE(NULLIF(unidad,''),'SIN UNIDAD') AS k, COUNT(*)::int AS n, COALESCE(SUM(dias),0)::int AS dias
           FROM descansos_medicos WHERE ${f.where}
           GROUP BY 1 ORDER BY n DESC LIMIT 35`,
          f.params
        );
        doc.fillColor('#004d3d').fontSize(11).font('Helvetica-Bold').text('Por unidad');
        doc.font('Helvetica').fontSize(9).fillColor('#222');
        porUnidad.rows.forEach(function(r) {
          doc.text(r.k + ' — ' + r.n + ' DM / ' + r.dias + ' días');
        });
        doc.moveDown(0.5);

        const porDx = await pool.query(
          `SELECT COALESCE(NULLIF(diagnostico,''),'SIN DIAGNÓSTICO') AS k, COUNT(*)::int AS n
           FROM descansos_medicos WHERE ${f.where}
           GROUP BY 1 ORDER BY n DESC LIMIT 20`,
          f.params
        );
        doc.fillColor('#004d3d').fontSize(11).font('Helvetica-Bold').text('Por diagnóstico');
        doc.font('Helvetica').fontSize(9).fillColor('#222');
        porDx.rows.forEach(function(r) {
          doc.text(String(r.k).slice(0, 80) + ' — ' + r.n);
        });
      } else {
        const r = await pool.query(
          `SELECT cip, grado, apellido_paterno, apellido_materno, nombres, unidad,
                  fecha_inicio, dias, cie, diagnostico, codigo_barras, origen
           FROM descansos_medicos WHERE ${f.where}
           ORDER BY COALESCE(fecha_inicio, fecha_registro::date) DESC
           LIMIT 500`,
          f.params
        );
        doc.fontSize(8).fillColor('#004d3d').font('Helvetica-Bold');
        doc.text('CIP', 40, doc.y, { continued: true, width: 50 });
        doc.text('NOMBRE', 90, doc.y, { continued: true, width: 150 });
        doc.text('UNIDAD', 240, doc.y, { continued: true, width: 110 });
        doc.text('INICIO', 350, doc.y, { continued: true, width: 55 });
        doc.text('DÍAS', 405, doc.y, { continued: true, width: 30 });
        doc.text('CIE', 435, doc.y, { width: 50 });
        doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#c8a94a').stroke();
        doc.moveDown(0.3);
        doc.font('Helvetica').fillColor('#222');
        r.rows.forEach(function(row) {
          if (doc.y > 760) doc.addPage();
          const nom = nombreCompleto(row).slice(0, 28);
          const y = doc.y;
          doc.text(String(row.cip || ''), 40, y, { width: 50, continued: false });
          doc.text(nom, 90, y, { width: 145 });
          doc.text(String(row.unidad || '').slice(0, 22), 240, y, { width: 105 });
          doc.text(String(row.fecha_inicio || '').slice(0, 10), 350, y, { width: 55 });
          doc.text(String(row.dias || 0), 405, y, { width: 30 });
          doc.text(String(row.cie || '').slice(0, 10), 435, y, { width: 50 });
          doc.moveDown(0.15);
        });
        doc.moveDown(0.5);
        doc.fontSize(8).fillColor('#666').text('Total filas: ' + r.rows.length + (r.rows.length >= 500 ? ' (máx. 500 en PDF)' : ''));
      }

      doc.fontSize(8).fillColor('#999').text(
        'Generado: ' + new Date().toLocaleString('es-PE') + ' · ' + (req.admin.usuario || ''),
        40, 780, { align: 'left' }
      );
      doc.end();
      const buf = await done;
      const nom = 'DM_' + (modo === 'dashboard' ? 'dashboard_' : 'listado_') +
        nombreArchivoSeguro(req.query.unidad || req.query.division || 'todos') + '.pdf';
      const inline = req.query.inline === '1' || req.query.ver === '1';
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', (inline ? 'inline' : 'attachment') + '; filename="' + nom + '"');
      res.send(buf);
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.post('/admin/descansos/importar-historico', requireAuth, requireDescansos, async function(req, res) {
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
        dni: mapearColumna(headers, ['dni', 'documento']),
        grado: mapearColumna(headers, ['grado', 'grado efectivo', 'rango']),
        apellido_paterno: mapearColumna(headers, ['apellido paterno', 'ap. paterno', 'paterno']),
        apellido_materno: mapearColumna(headers, ['apellido materno', 'ap. materno', 'materno']),
        nombres: mapearColumna(headers, ['nombres', 'nombre', 'apellidos y nombres', 'nombre completo']),
        division: mapearColumna(headers, ['division', 'división']),
        unidad: mapearColumna(headers, ['unidad', 'comisaria', 'comisaría', 'dependencia']),
        fecha_inicio: mapearColumna(headers, ['fecha inicio', 'inicio', 'f. inicio', 'fecha_inicio']),
        dias: mapearColumna(headers, ['dias', 'días', 'nro dias', 'dias dm']),
        fecha_termino: mapearColumna(headers, ['fecha termino', 'fecha término', 'termino', 'término', 'fin']),
        cie: mapearColumna(headers, ['cie', 'codigo cie', 'código cie']),
        diagnostico: mapearColumna(headers, ['diagnostico', 'diagnóstico', 'dx']),
        tipo_documento: mapearColumna(headers, ['tipo documento', 'documento', 'tipo dm']),
        grado_medico: mapearColumna(headers, ['grado medico', 'grado médico', 'grado med']),
        nombres_medico: mapearColumna(headers, ['medico', 'médico', 'nombres medico', 'nombre medico']),
        cip_medico: mapearColumna(headers, ['cip medico', 'cip del medico', 'cip médico']),
        dni_medico: mapearColumna(headers, ['dni medico', 'dni del medico', 'dni médico']),
        cmp_cop: mapearColumna(headers, ['cmp', 'cop', 'cmp/cop', 'nro cmp', 'cmp cop']),
        centro: mapearColumna(headers, ['centro', 'centro asistencial', 'hospital', 'establecimiento'])
      };
      if (!col.cip && !col.nombres) {
        return res.json({ ok: false, error: 'No se detectaron columnas CIP o nombres en el Excel' });
      }

      let insertados = 0;
      let omitidos = 0;
      const errores = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        let nombres = filaValor(row, col.nombres);
        let apPat = filaValor(row, col.apellido_paterno);
        let apMat = filaValor(row, col.apellido_materno);
        if (nombres && !apPat && nombres.indexOf(',') >= 0) {
          const parts = nombres.split(',');
          const aps = parts[0].trim().split(/\s+/);
          apPat = aps[0] || '';
          apMat = aps.slice(1).join(' ');
          nombres = (parts[1] || '').trim();
        }
        const payload = {
          cip: filaValor(row, col.cip),
          dni: filaValor(row, col.dni),
          grado: filaValor(row, col.grado),
          apellido_paterno: apPat,
          apellido_materno: apMat,
          nombres: nombres,
          division: filaValor(row, col.division),
          unidad: filaValor(row, col.unidad),
          fecha_inicio: filaValor(row, col.fecha_inicio) || row[col.fecha_inicio],
          dias: filaValor(row, col.dias),
          fecha_termino: filaValor(row, col.fecha_termino) || row[col.fecha_termino],
          cie: filaValor(row, col.cie),
          diagnostico: filaValor(row, col.diagnostico),
          tipo_documento: filaValor(row, col.tipo_documento),
          grado_medico: filaValor(row, col.grado_medico),
          nombres_medico: filaValor(row, col.nombres_medico),
          cip_medico: filaValor(row, col.cip_medico),
          dni_medico: filaValor(row, col.dni_medico),
          cmp_cop_medico: filaValor(row, col.cmp_cop),
          centro_asistencial: filaValor(row, col.centro),
          codigo_barras: CODIGO_BARRAS_HISTORICO
        };
        const v = validarRegistro(payload, { historico: true, sinPdf: true });
        if (v.errores.length || !v.data.cip) {
          omitidos++;
          if (errores.length < 15) errores.push('Fila ' + (i + 2) + ': ' + (v.errores.join(', ') || 'CIP vacío'));
          continue;
        }
        const d = v.data;
        if (!d.division) d.division = await resolverDivision(pool, d.unidad);
        await pool.query(
          `INSERT INTO descansos_medicos (
            cip, grado, apellido_paterno, apellido_materno, nombres, dni, division, unidad,
            fecha_inicio, dias, fecha_termino, cie, diagnostico, tipo_documento, codigo_barras,
            grado_medico, nombres_medico, cip_medico, dni_medico, cmp_cop_medico, centro_asistencial,
            origen, estado, creado_por
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,'historico','activo',$22
          )`,
          [
            d.cip, d.grado, d.apellido_paterno, d.apellido_materno, d.nombres, d.dni, d.division, d.unidad,
            d.fecha_inicio, d.dias, d.fecha_termino, d.cie, d.diagnostico, d.tipo_documento, CODIGO_BARRAS_HISTORICO,
            d.grado_medico, d.nombres_medico, d.cip_medico, d.dni_medico, d.cmp_cop_medico, d.centro_asistencial,
            req.admin.usuario || ''
          ]
        );
        insertados++;
      }

      res.json({
        ok: true,
        insertados: insertados,
        omitidos: omitidos,
        errores: errores,
        mensaje: 'Importación histórica: ' + insertados + ' registros (código de barras = ----)'
      });
    } catch (e) {
      res.json({ ok: false, error: e.message });
    }
  });

  app.post('/admin/descansos/cotejar-hospital', requireAuth, requireDescansos, async function(req, res) {
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
      const colCip = mapearColumna(headers, ['cip', 'codigo cip']);
      const colDni = mapearColumna(headers, ['dni']);
      const colNom = mapearColumna(headers, ['nombres', 'nombre', 'apellidos y nombres', 'nombre completo']);
      if (!colCip && !colDni) {
        return res.json({ ok: false, error: 'Se requiere columna CIP o DNI en el Excel del hospital' });
      }

      const anio = parseInt(req.body.anio, 10) || new Date().getFullYear();
      const reg = await pool.query(
        `SELECT id, cip, dni, apellido_paterno, apellido_materno, nombres, unidad, fecha_inicio
         FROM descansos_medicos
         WHERE estado<>'anulado'
           AND EXTRACT(YEAR FROM COALESCE(fecha_inicio, fecha_registro)) = $1`,
        [anio]
      );

      const byCip = new Map();
      const byDni = new Map();
      reg.rows.forEach(function(r) {
        if (r.cip) byCip.set(String(r.cip), r);
        if (r.dni) byDni.set(String(r.dni), r);
      });

      const hospital = [];
      const matchedIds = new Set();
      let coincide = 0;
      let soloHospital = 0;

      rows.forEach(function(row) {
        const cip = soloDigitos(filaValor(row, colCip));
        const dni = soloDigitos(filaValor(row, colDni));
        const nombres = filaValor(row, colNom);
        let match = null;
        if (cip && byCip.has(cip)) match = byCip.get(cip);
        else if (dni && byDni.has(dni)) match = byDni.get(dni);
        if (match) {
          coincide++;
          matchedIds.add(match.id);
          hospital.push({
            estado: 'coincide',
            cip: cip || match.cip,
            dni: dni || match.dni,
            nombres_hospital: nombres,
            nombres_regpol: nombreCompleto(match),
            unidad: match.unidad,
            id_regpol: match.id
          });
        } else {
          soloHospital++;
          hospital.push({
            estado: 'solo_hospital',
            cip: cip,
            dni: dni,
            nombres_hospital: nombres
          });
        }
      });

      const soloRegpol = reg.rows.filter(function(r) { return !matchedIds.has(r.id); }).map(function(r) {
        return {
          estado: 'solo_regpol',
          cip: r.cip,
          dni: r.dni,
          nombres_regpol: nombreCompleto(r),
          unidad: r.unidad,
          id_regpol: r.id
        };
      });

      const detalle = hospital.concat(soloRegpol);
      const titulo = limpio((req.body && req.body.titulo) || ('Cotejo hospital ' + anio), 200);
      const archivo_nombre = limpio((req.body && req.body.nombre) || 'hospital.xlsx', 200);

      const ins = await pool.query(
        `INSERT INTO descansos_cotejos (
          titulo, archivo_nombre, total_hospital, total_coincide, total_solo_regpol,
          total_solo_hospital, detalle, creado_por
        ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8) RETURNING id, creado`,
        [
          titulo, archivo_nombre, rows.length, coincide, soloRegpol.length,
          soloHospital, JSON.stringify(detalle), req.admin.usuario || ''
        ]
      );

      res.json({
        ok: true,
        cotejo_id: ins.rows[0].id,
        resumen: {
          hospital: rows.length,
          coincide: coincide,
          solo_regpol: soloRegpol.length,
          solo_hospital: soloHospital
        },
        detalle: detalle
      });
    } catch (e) {
      res.json({ ok: false, error: e.message });
    }
  });

  app.post('/admin/descansos', requireAuth, requireDescansos, async function(req, res) {
    try {
      const historico = !!(req.body && req.body.historico);
      const v = validarRegistro(req.body || {}, {
        historico: historico,
        sinPdf: historico || !!(req.body && req.body.sin_pdf),
        origen: historico ? 'historico' : 'panel'
      });
      if (v.errores.length) return res.json({ ok: false, error: v.errores.join('. ') });
      const d = v.data;
      if (!d.division) d.division = await resolverDivision(pool, d.unidad);
      const ins = await pool.query(
        `INSERT INTO descansos_medicos (
          cip, grado, apellido_paterno, apellido_materno, nombres, dni, division, unidad,
          fecha_inicio, dias, fecha_termino, cie, diagnostico, tipo_documento, codigo_barras,
          grado_medico, nombres_medico, cip_medico, dni_medico, cmp_cop_medico, centro_asistencial,
          pdf_data, pdf_nombre, origen, estado, observacion, creado_por
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
          $21,$22,$23,$24,'activo',$25,$26
        ) RETURNING id`,
        [
          d.cip, d.grado, d.apellido_paterno, d.apellido_materno, d.nombres, d.dni, d.division, d.unidad,
          d.fecha_inicio, d.dias, d.fecha_termino, d.cie, d.diagnostico, d.tipo_documento, d.codigo_barras,
          d.grado_medico, d.nombres_medico, d.cip_medico, d.dni_medico, d.cmp_cop_medico, d.centro_asistencial,
          d.pdf_data, d.pdf_nombre, d.origen, d.observacion, req.admin.usuario || ''
        ]
      );
      res.json({ ok: true, id: ins.rows[0].id });
    } catch (e) {
      res.json({ ok: false, error: e.message });
    }
  });

  app.put('/admin/descansos/:id', requireAuth, requireDescansos, async function(req, res) {
    try {
      const cur = await pool.query('SELECT * FROM descansos_medicos WHERE id=$1', [req.params.id]);
      if (!cur.rows.length) return res.json({ ok: false, error: 'No encontrado' });
      const prev = cur.rows[0];
      const body = Object.assign({}, prev, req.body || {});
      const esHist = prev.origen === 'historico' || body.codigo_barras === CODIGO_BARRAS_HISTORICO;
      const v = validarRegistro(body, {
        historico: esHist,
        sinPdf: true,
        origen: prev.origen
      });
      if (v.errores.length) return res.json({ ok: false, error: v.errores.join('. ') });
      const d = v.data;
      if (!d.division) d.division = await resolverDivision(pool, d.unidad);
      const pdf_data = (req.body && req.body.pdf_data) ? d.pdf_data : prev.pdf_data;
      const pdf_nombre = (req.body && req.body.pdf_data) ? d.pdf_nombre : prev.pdf_nombre;
      await pool.query(
        `UPDATE descansos_medicos SET
          cip=$1, grado=$2, apellido_paterno=$3, apellido_materno=$4, nombres=$5, dni=$6,
          division=$7, unidad=$8, fecha_inicio=$9, dias=$10, fecha_termino=$11, cie=$12,
          diagnostico=$13, tipo_documento=$14, codigo_barras=$15, grado_medico=$16,
          nombres_medico=$17, cip_medico=$18, dni_medico=$19, cmp_cop_medico=$20,
          centro_asistencial=$21, pdf_data=$22, pdf_nombre=$23,
          observacion=$24, actualizado=NOW()
         WHERE id=$25`,
        [
          d.cip, d.grado, d.apellido_paterno, d.apellido_materno, d.nombres, d.dni,
          d.division, d.unidad, d.fecha_inicio, d.dias, d.fecha_termino, d.cie,
          d.diagnostico, d.tipo_documento, esHist ? CODIGO_BARRAS_HISTORICO : d.codigo_barras,
          d.grado_medico, d.nombres_medico, d.cip_medico, d.dni_medico, d.cmp_cop_medico,
          d.centro_asistencial, pdf_data || '', pdf_nombre || '',
          d.observacion, req.params.id
        ]
      );
      res.json({ ok: true });
    } catch (e) {
      res.json({ ok: false, error: e.message });
    }
  });

  app.delete('/admin/descansos/:id', requireAuth, requireDescansos, async function(req, res) {
    try {
      await pool.query(
        `UPDATE descansos_medicos SET estado='anulado', actualizado=NOW() WHERE id=$1`,
        [req.params.id]
      );
      res.json({ ok: true });
    } catch (e) {
      res.json({ ok: false, error: e.message });
    }
  });

  app.get('/admin/descansos/:id', requireAuth, requireDescansos, async function(req, res) {
    try {
      const r = await pool.query(
        `SELECT id, cip, grado, apellido_paterno, apellido_materno, nombres, dni, division, unidad,
                fecha_inicio, dias, fecha_termino, cie, diagnostico, tipo_documento, codigo_barras,
                grado_medico, nombres_medico, cip_medico, dni_medico, cmp_cop_medico, centro_asistencial,
                pdf_nombre, origen, estado, observacion, fecha_registro, creado_por,
                (pdf_data IS NOT NULL AND pdf_data <> '') AS tiene_pdf
         FROM descansos_medicos WHERE id=$1`,
        [req.params.id]
      );
      if (!r.rows.length) return res.json({ ok: false, error: 'No encontrado' });
      res.json({ ok: true, row: r.rows[0] });
    } catch (e) {
      res.json({ ok: false, error: e.message });
    }
  });

  app.get('/admin/descansos/:id/pdf', requireAuth, requireDescansos, async function(req, res) {
    try {
      const r = await pool.query('SELECT pdf_data, pdf_nombre, cip FROM descansos_medicos WHERE id=$1', [req.params.id]);
      if (!r.rows.length || !r.rows[0].pdf_data) return res.status(404).json({ ok: false, error: 'Sin PDF' });
      const raw = r.rows[0].pdf_data;
      const b64 = raw.indexOf('base64,') >= 0 ? raw.split('base64,')[1] : raw;
      const buf = Buffer.from(b64, 'base64');
      const nom = nombreArchivoSeguro(r.rows[0].pdf_nombre || ('DM_' + r.rows[0].cip)) + '.pdf';
      const inline = req.query.inline === '1' || req.query.ver === '1';
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', (inline ? 'inline' : 'attachment') + '; filename="' + nom + '"');
      res.send(buf);
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.get('/admin/descansos-cotejos', requireAuth, requireDescansos, async function(req, res) {
    try {
      const r = await pool.query(
        `SELECT id, titulo, archivo_nombre, total_hospital, total_coincide, total_solo_regpol,
                total_solo_hospital, creado_por, creado
         FROM descansos_cotejos ORDER BY creado DESC LIMIT 50`
      );
      res.json({ ok: true, rows: r.rows });
    } catch (e) {
      res.json({ ok: false, error: e.message });
    }
  });

  app.get('/admin/descansos-cotejos/:id', requireAuth, requireDescansos, async function(req, res) {
    try {
      const r = await pool.query('SELECT * FROM descansos_cotejos WHERE id=$1', [req.params.id]);
      if (!r.rows.length) return res.json({ ok: false, error: 'No encontrado' });
      res.json({ ok: true, row: r.rows[0] });
    } catch (e) {
      res.json({ ok: false, error: e.message });
    }
  });
}

module.exports = {
  initTablasDescansos,
  registrarRutas,
  puedeDescansos,
  GRADOS_MEDICO,
  GRADOS_EFECTIVO,
  TIPOS_DOCUMENTO,
  CODIGO_BARRAS_HISTORICO
};
