/*
  Módulo Recursos Humanos — REGPOL Callao
  Nómina interna (no visible en web pública).
*/
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const PDFDocument = require('pdfkit');

const SITUACIONES = ['ACTIVO', 'BAJA', 'VACACIONES', 'CURSO', 'SUSPENSION', 'OTRO'];

const CATALOGO_RRHH = [
  {
    nombre: 'DIVOPUS 1', orden: 1, tipo: 'comisaria',
    unidades: [
      'CIA CALLAO', 'CIA LA PUNTA', 'CIA BELLAVISTA', 'CIA CIUDADELA CHALACA',
      'CIA CIUDAD DEL PESCADOR', 'CIA RAMON CASTILLA', 'CIA LA LEGUA', 'CIA LA PERLA',
      'OD CALLAO'
    ]
  },
  {
    nombre: 'DIVOPUS 2', orden: 2, tipo: 'comisaria',
    unidades: [
      'CIA JUAN INGUNZA', 'CIA SARITA COLONIA', 'CIA BOCANEGRA',
      'CIA MANUEL DULANTO', 'CIA PLAYA RIMAC', 'CIA CARMEN DE LA LEGUA',
      'OD VIPOL'
    ]
  },
  {
    nombre: 'DIVOPUS 3', orden: 3, tipo: 'comisaria',
    unidades: [
      'CIA VENTANILLA', 'CIA OQUENDO', 'CIA MI PERU',
      'CIA PACHACUTEC', 'CIA VILLA LOS REYES', 'CIA MARQUEZ',
      'OD VENTANILLA'
    ]
  },
  {
    nombre: 'DIVUES', orden: 4, tipo: 'especializada',
    unidades: [
      'ESCVER CALLAO', 'ESCVER VENTANILLA', 'UNIEME CALLAO', 'UNIEME VENTANILLA',
      'UNIDIR CALLAO', 'UNIPAPIE', 'USEG CALLAO', 'UNISEINT CALLAO',
      'UNIPIAT CALLAO', 'USE CALLAO', 'USE VENTANILLA', 'UNIPIRV CALLAO',
      'UTSEVI CALLAO', 'SECTSV VENTANILLA', 'SECTSV CALLAO', 'UNISEEST', 'DIVUES JEFATURA'
    ]
  },
  {
    nombre: 'DIVPOCOM', orden: 5, tipo: 'especializada',
    unidades: ['DIVPOCOM']
  },
  {
    nombre: 'DIVREINT', orden: 6, tipo: 'especializada',
    unidades: ['DIVREINT CALLAO']
  },
  {
    nombre: 'UNICOPE 105', orden: 7, tipo: 'especializada',
    unidades: ['UNICOPE 105']
  },
  {
    nombre: 'UNIDADES ADM. RPC', orden: 8, tipo: 'administrativa',
    unidades: [
      'UNIDADES ADM. RPC', 'REGPOL CALLAO', 'AYUDANTIA', 'ESTADO MAYOR', 'UNITIC',
      'UNIPLEDU', 'UNIASJUR', 'UNITRDOC', 'OFIMA', 'OFAD', 'OFAD AREABA',
      'OFAD AREBAP', 'OFAD ARELOG', 'OFAD AREREHUM', 'OFAD AREARMUN',
      'OFICINA DE DISCIPLINA REGIONAL'
    ]
  }
];

function normalizarPermisos(permisos) {
  if (Array.isArray(permisos)) return permisos;
  if (typeof permisos === 'string') {
    try { return JSON.parse(permisos); } catch (e) { return []; }
  }
  return [];
}

function puedeRRHH(admin) {
  if (!admin) return false;
  if (admin.rol === 'unitic') return true;
  return normalizarPermisos(admin.permisos).includes('recursos_humanos');
}

function requireRRHH(req, res, next) {
  if (!puedeRRHH(req.admin)) {
    return res.status(403).json({ ok: false, error: 'Sin permiso de Recursos Humanos' });
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
  let d = soloDigitos(v);
  if (!d) return '';
  if (d.length < 8) d = d.padStart(8, '0');
  if (d.length > 8) d = d.slice(-8);
  return d;
}

function parseFecha(v) {
  if (!v) return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
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

function mapSexo(v) {
  const s = String(v == null ? '' : v).trim();
  if (s === '1' || /^m/i.test(s)) return 'M';
  if (s === '2' || /^f/i.test(s)) return 'F';
  return limpio(s, 10);
}

function mapSituacionDesdeEstado(estadoCip) {
  const e = String(estadoCip == null ? '' : estadoCip).trim();
  if (e === '11' || e === '') return 'ACTIVO';
  return 'OTRO';
}

function esOficialPorGradoOCip(grado, cipOriginalLen) {
  if (cipOriginalLen > 0 && cipOriginalLen <= 6) return true;
  const g = String(grado || '').toUpperCase().replace(/\./g, '');
  if (/SUBOF|SO[1-3]|TEC(?:NICO)?|BRIG|SUPERIOR/.test(g)) return false;
  return /GRAL|CRNL|CORONEL|CMDTE|COMANDANTE|^MAY$|MAYOR|^CAP$|CAPITAN|TNTE|TENIENTE|ALFZ|ALFEREZ/.test(g);
}

function limpiarUnidadExcel(raw) {
  return limpio(raw, 200)
    .replace(/\s+/g, ' ')
    .replace(/\s*\(CHOFER\)\s*/gi, '')
    .replace(/\s*CHOFER\s*/gi, '')
    .replace(/\s*\(ABA\)\s*/gi, '')
    .replace(/\s*-\s*ABA\s*/gi, '')
    .replace(/\s*\(COD\.?\s*2\)\s*/gi, '')
    .replace(/\s*\(DEPCRI PESAJE\)\s*/gi, '')
    .replace(/\s*AREA DE INV\.DELITOS C\/ESTADO\s*/gi, '')
    .replace(/\s*TERNA\s*/gi, '')
    .trim();
}

/** @returns {{ division: string, unidad: string }} */
function mapearUnidadExcel(rawUnidad) {
  const u = limpiarUnidadExcel(rawUnidad).toUpperCase();
  if (!u) return { division: 'UNIDADES ADM. RPC', unidad: 'UNIDADES ADM. RPC' };

  if (/UNICOPE|CENEME\s*105/.test(u)) {
    return { division: 'UNICOPE 105', unidad: 'UNICOPE 105' };
  }
  if (/DIVISION DE POLICIA COMUNITARIA|DIVPOCOM/.test(u)) {
    return { division: 'DIVPOCOM', unidad: 'DIVPOCOM' };
  }
  if (/DIVREINT/.test(u)) {
    return { division: 'DIVREINT', unidad: 'DIVREINT CALLAO' };
  }

  // Oficinas de Disciplina
  if (/OFICINA DE DISCIPLINA/.test(u) || /^OD\b/.test(u)) {
    if (/VENTANILLA/.test(u)) return { division: 'DIVOPUS 3', unidad: 'OD VENTANILLA' };
    if (/INGUNZA|VIPOL/.test(u)) return { division: 'DIVOPUS 2', unidad: 'OD VIPOL' };
    if (/CALLAO/.test(u) && !/REGION/.test(u)) return { division: 'DIVOPUS 1', unidad: 'OD CALLAO' };
    if (/IG DIRINV.*DIVOPUS CALLAO/.test(u)) return { division: 'DIVOPUS 1', unidad: 'OD CALLAO' };
    if (/IG DIRINV.*INGUNZA/.test(u)) return { division: 'DIVOPUS 2', unidad: 'OD VIPOL' };
    if (/IG DIRINV.*VENTANILLA/.test(u)) return { division: 'DIVOPUS 3', unidad: 'OD VENTANILLA' };
    return { division: 'DIVOPUS 1', unidad: 'OD CALLAO' };
  }

  // Comisarías → CIA
  const comisarias = [
    [/COM\.?\s*CALLAO/, 'CIA CALLAO', 'DIVOPUS 1'],
    [/COM\.?\s*LA PUNTA/, 'CIA LA PUNTA', 'DIVOPUS 1'],
    [/COM\.?\s*BELLAVISTA/, 'CIA BELLAVISTA', 'DIVOPUS 1'],
    [/COM\.?\s*CIUDADELA CHALACA/, 'CIA CIUDADELA CHALACA', 'DIVOPUS 1'],
    [/COM\.?\s*CIUDAD DEL PESCADOR/, 'CIA CIUDAD DEL PESCADOR', 'DIVOPUS 1'],
    [/COM\.?\s*RAMON CASTILLA/, 'CIA RAMON CASTILLA', 'DIVOPUS 1'],
    [/COM\.?\s*LA LEGUA/, 'CIA LA LEGUA', 'DIVOPUS 1'],
    [/COM\.?\s*LA PERLA/, 'CIA LA PERLA', 'DIVOPUS 1'],
    [/COM\.?\s*JUAN INGUNZA/, 'CIA JUAN INGUNZA', 'DIVOPUS 2'],
    [/COM\.?\s*SARITA COLONIA/, 'CIA SARITA COLONIA', 'DIVOPUS 2'],
    [/COM\.?\s*BOCANEGRA/, 'CIA BOCANEGRA', 'DIVOPUS 2'],
    [/COM\.?\s*(MANUEL\s*)?DULANTO/, 'CIA MANUEL DULANTO', 'DIVOPUS 2'],
    [/COM\.?\s*PLAYA RIMAC/, 'CIA PLAYA RIMAC', 'DIVOPUS 2'],
    [/COM\.?\s*CARMEN DE LA LEGUA/, 'CIA CARMEN DE LA LEGUA', 'DIVOPUS 2'],
    [/COM\.?\s*VENTANILLA/, 'CIA VENTANILLA', 'DIVOPUS 3'],
    [/COM\.?\s*OQUENDO/, 'CIA OQUENDO', 'DIVOPUS 3'],
    [/COM\.?\s*MI PERU/, 'CIA MI PERU', 'DIVOPUS 3'],
    [/COM\.?\s*PACHACUTEC/, 'CIA PACHACUTEC', 'DIVOPUS 3'],
    [/COM\.?\s*VILLA LOS REYES/, 'CIA VILLA LOS REYES', 'DIVOPUS 3'],
    [/COM\.?\s*MARQUEZ/, 'CIA MARQUEZ', 'DIVOPUS 3']
  ];
  for (let i = 0; i < comisarias.length; i++) {
    if (comisarias[i][0].test(u)) {
      return { division: comisarias[i][2], unidad: comisarias[i][1] };
    }
  }

  // DIVUES
  if (/ESCVER CALLAO|UNOPES ESCVER CALLAO/.test(u)) return { division: 'DIVUES', unidad: 'ESCVER CALLAO' };
  if (/ESCVER VENTANILLA|UNOPES ESCVER VENTANILLA/.test(u)) return { division: 'DIVUES', unidad: 'ESCVER VENTANILLA' };
  if (/UNEME CALLAO|UNIEME CALLAO/.test(u)) return { division: 'DIVUES', unidad: 'UNIEME CALLAO' };
  if (/UNEME VENTANILLA|UNIEME VENTANILLA/.test(u)) return { division: 'DIVUES', unidad: 'UNIEME VENTANILLA' };
  if (/UNIDIR/.test(u)) return { division: 'DIVUES', unidad: 'UNIDIR CALLAO' };
  if (/UNIPAPIE|PATRULLAJE A PIE/.test(u)) return { division: 'DIVUES', unidad: 'UNIPAPIE' };
  if (/UPIAT|UNIPIAT/.test(u)) return { division: 'DIVUES', unidad: 'UNIPIAT CALLAO' };
  if (/USE CALLAO/.test(u) && !/VENTANILLA/.test(u)) return { division: 'DIVUES', unidad: 'USE CALLAO' };
  if (/USE VENTANILLA/.test(u)) return { division: 'DIVUES', unidad: 'USE VENTANILLA' };
  if (/DEPPIRV|UNIPIRV/.test(u)) return { division: 'DIVUES', unidad: 'UNIPIRV CALLAO' };
  if (/SECTSV.*VENTANILLA|UTSEVI VENTANILLA/.test(u)) return { division: 'DIVUES', unidad: 'SECTSV VENTANILLA' };
  if (/SECTSV|UTSEVI CALLAO/.test(u)) return { division: 'DIVUES', unidad: 'SECTSV CALLAO' };
  if (/UNISEEST/.test(u)) return { division: 'DIVUES', unidad: 'UNISEEST' };
  if (/^DIVUES$/.test(u) || /DIVUES_JEFATURA|DIVUES JEFATURA/.test(u)) {
    return { division: 'DIVUES', unidad: 'DIVUES JEFATURA' };
  }

  // Jefaturas DIVOPUS sin comisaría → ADM
  if (u === 'DIVOPUS CALLAO') {
    return { division: 'UNIDADES ADM. RPC', unidad: 'UNIDADES ADM. RPC' };
  }
  if (u === 'DIVOPUS INGUNZA VALDIVIA' || /DIVOPUS INGUNZA.*(JEF|OFIADM)/.test(u)) {
    return { division: 'UNIDADES ADM. RPC', unidad: 'UNIDADES ADM. RPC' };
  }
  if (u === 'DIVOPUS VENTANILLA') {
    return { division: 'UNIDADES ADM. RPC', unidad: 'UNIDADES ADM. RPC' };
  }

  // Oficinas administrativas
  if (/^AYU$|AYUDANTIA/.test(u)) return { division: 'UNIDADES ADM. RPC', unidad: 'AYUDANTIA' };
  if (/ESTADO MAYOR/.test(u)) return { division: 'UNIDADES ADM. RPC', unidad: 'ESTADO MAYOR' };
  if (/UNITIC/.test(u)) return { division: 'UNIDADES ADM. RPC', unidad: 'UNITIC' };
  if (/UNIPLEDU|OFIEDP|OFIEST|OFIPLOPE|EM UNIPLEDU/.test(u)) {
    return { division: 'UNIDADES ADM. RPC', unidad: 'UNIPLEDU' };
  }
  if (/UNIASJUR|ASESORIA JURIDICA/.test(u)) return { division: 'UNIDADES ADM. RPC', unidad: 'UNIASJUR' };
  if (/UNITRDOC|MESPAR|TRAMITE DOCUMENTARIO/.test(u)) {
    return { division: 'UNIDADES ADM. RPC', unidad: 'UNITRDOC' };
  }
  if (/OFIMA|IMAGEN/.test(u)) return { division: 'UNIDADES ADM. RPC', unidad: 'OFIMA' };
  if (/AREARMUN|ARMAMENTO/.test(u)) return { division: 'UNIDADES ADM. RPC', unidad: 'OFAD AREARMUN' };
  if (/AREABA|BIENESTAR|SUBSISTENCIAS/.test(u)) return { division: 'UNIDADES ADM. RPC', unidad: 'OFAD AREABA' };
  if (/AREBAP/.test(u)) return { division: 'UNIDADES ADM. RPC', unidad: 'OFAD AREBAP' };
  if (/ARELOG|LOGISTICA/.test(u)) return { division: 'UNIDADES ADM. RPC', unidad: 'OFAD ARELOG' };
  if (/AREREHUM|UNIREHUM|RECURSOS HUMANOS/.test(u)) return { division: 'UNIDADES ADM. RPC', unidad: 'OFAD AREREHUM' };
  if (/^OFAD$|EM OFAD|OFICINA DE ADMINISTRACION/.test(u)) {
    return { division: 'UNIDADES ADM. RPC', unidad: 'OFAD' };
  }
  if (/REGPOL CALLAO/.test(u)) return { division: 'UNIDADES ADM. RPC', unidad: 'REGPOL CALLAO' };
  if (/IG DIRINV/.test(u)) return { division: 'UNIDADES ADM. RPC', unidad: 'UNIDADES ADM. RPC' };

  return { division: 'UNIDADES ADM. RPC', unidad: 'UNIDADES ADM. RPC' };
}

async function asegurarCatalogoRRHH(pool) {
  for (let d = 0; d < CATALOGO_RRHH.length; d++) {
    const div = CATALOGO_RRHH[d];
    let dr = await pool.query(
      'SELECT id FROM divisiones WHERE UPPER(TRIM(nombre))=UPPER(TRIM($1))',
      [div.nombre]
    );
    let divId;
    if (!dr.rows.length) {
      const ins = await pool.query(
        'INSERT INTO divisiones (nombre, orden) VALUES ($1,$2) RETURNING id',
        [div.nombre, div.orden]
      );
      divId = ins.rows[0].id;
    } else {
      divId = dr.rows[0].id;
      await pool.query('UPDATE divisiones SET orden=$1 WHERE id=$2', [div.orden, divId]);
    }
    for (let u = 0; u < div.unidades.length; u++) {
      const nombre = div.unidades[u];
      await pool.query(
        `INSERT INTO unidades_pol (nombre, division_id, tipo, orden) VALUES ($1,$2,$3,$4)
         ON CONFLICT (nombre) DO UPDATE SET division_id=EXCLUDED.division_id, tipo=EXCLUDED.tipo, orden=EXCLUDED.orden`,
        [nombre, divId, div.tipo, u + 1]
      );
    }
  }
}

async function initTablasRRHH(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS personal_rrhh (
      id SERIAL PRIMARY KEY,
      cip VARCHAR(8) UNIQUE NOT NULL,
      dni VARCHAR(20) DEFAULT '',
      apellidos_nombres VARCHAR(200) NOT NULL DEFAULT '',
      grado VARCHAR(80) DEFAULT '',
      cod_grado VARCHAR(20) DEFAULT '',
      espec VARCHAR(40) DEFAULT '',
      cargo VARCHAR(120) DEFAULT '',
      sexo VARCHAR(10) DEFAULT '',
      fecha_nac DATE,
      unidad_id INTEGER REFERENCES unidades_pol(id) ON DELETE SET NULL,
      unidad_nombre VARCHAR(150) DEFAULT '',
      division_nombre VARCHAR(120) DEFAULT '',
      cod_unidad VARCHAR(20) DEFAULT '',
      situacion VARCHAR(40) DEFAULT 'ACTIVO',
      estado_cip VARCHAR(10) DEFAULT '',
      categoria VARCHAR(20) DEFAULT 'SUBALTERNO',
      telefono VARCHAR(40) DEFAULT '',
      correo VARCHAR(120) DEFAULT '',
      domicilio TEXT DEFAULT '',
      fec_alta DATE,
      fec_asc DATE,
      fec_inc DATE,
      fec_uni DATE,
      documentos TEXT DEFAULT '',
      escalafon VARCHAR(80) DEFAULT '',
      creado_en TIMESTAMPTZ DEFAULT NOW(),
      actualizado_en TIMESTAMPTZ DEFAULT NOW(),
      actualizado_por VARCHAR(60) DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_rrhh_unidad ON personal_rrhh(unidad_nombre);
    CREATE INDEX IF NOT EXISTS idx_rrhh_division ON personal_rrhh(division_nombre);
    CREATE INDEX IF NOT EXISTS idx_rrhh_situacion ON personal_rrhh(situacion);
    CREATE INDEX IF NOT EXISTS idx_rrhh_nombres ON personal_rrhh(apellidos_nombres);

    CREATE TABLE IF NOT EXISTS personal_rrhh_auditoria (
      id SERIAL PRIMARY KEY,
      cip VARCHAR(8),
      accion VARCHAR(30) NOT NULL,
      admin_usuario VARCHAR(60) NOT NULL,
      detalle TEXT DEFAULT '',
      creado_en TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_rrhh_aud_cip ON personal_rrhh_auditoria(cip);
  `);

  await asegurarCatalogoRRHH(pool);
  await importarNominaSiVacia(pool);
}

async function resolverUnidadId(pool, divisionNombre, unidadNombre) {
  const r = await pool.query(
    `SELECT u.id, u.nombre AS unidad, d.nombre AS division
     FROM unidades_pol u
     LEFT JOIN divisiones d ON d.id = u.division_id
     WHERE UPPER(TRIM(u.nombre)) = UPPER(TRIM($1))`,
    [unidadNombre]
  );
  if (r.rows.length) {
    return {
      id: r.rows[0].id,
      unidad: r.rows[0].unidad,
      division: r.rows[0].division || divisionNombre
    };
  }
  // fallback ADM
  const fb = await pool.query(
    `SELECT u.id, u.nombre AS unidad, d.nombre AS division
     FROM unidades_pol u
     LEFT JOIN divisiones d ON d.id = u.division_id
     WHERE UPPER(TRIM(u.nombre)) = 'UNIDADES ADM. RPC'
     LIMIT 1`
  );
  if (fb.rows.length) {
    return { id: fb.rows[0].id, unidad: fb.rows[0].unidad, division: fb.rows[0].division };
  }
  return { id: null, unidad: unidadNombre, division: divisionNombre };
}

async function registrarAuditoria(pool, cip, accion, adminUsuario, detalle) {
  await pool.query(
    `INSERT INTO personal_rrhh_auditoria (cip, accion, admin_usuario, detalle)
     VALUES ($1,$2,$3,$4)`,
    [cip || '', accion, adminUsuario || '', limpio(detalle, 2000)]
  );
}

function rutaNominaExcel() {
  return path.join(__dirname, 'data', 'nomina-rrhh-callao.xlsx');
}

async function importarNominaSiVacia(pool) {
  const cnt = await pool.query('SELECT COUNT(*)::int AS n FROM personal_rrhh');
  if (cnt.rows[0].n > 0) {
    console.log('RRHH: nómina ya cargada (' + cnt.rows[0].n + ' registros).');
    return { ok: true, skipped: true, total: cnt.rows[0].n };
  }
  const file = rutaNominaExcel();
  if (!fs.existsSync(file)) {
    console.warn('RRHH: no se encontró data/nomina-rrhh-callao.xlsx — sin carga inicial.');
    return { ok: false, error: 'Archivo de nómina no encontrado' };
  }
  return importarNominaDesdeArchivo(pool, file, 'sistema');
}

async function importarNominaDesdeArchivo(pool, filePath, adminUsuario) {
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const sheetName = wb.SheetNames.find(function(n) {
    return /^hoja1$/i.test(n);
  }) || wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });

  let creados = 0;
  let errores = 0;
  const detalleErrores = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const carneRaw = row['CARNE'] != null ? row['CARNE'] : row['CIP'];
    const cipOrig = soloDigitos(carneRaw);
    if (!cipOrig || cipOrig === '0') {
      errores++;
      if (detalleErrores.length < 20) detalleErrores.push('Fila ' + (i + 2) + ': CIP vacío');
      continue;
    }
    const cip = normalizarCip(cipOrig);
    const nombres = limpio(row['APELLIDOS Y NOMBRES'] || row['NOMBRES'], 200);
    if (!nombres || /^APELLIDOS/i.test(nombres)) {
      errores++;
      continue;
    }
    const grado = limpio(row['GRADO'], 80);
    const mapped = mapearUnidadExcel(row['UNIDAD']);
    const uni = await resolverUnidadId(pool, mapped.division, mapped.unidad);
    const categoria = esOficialPorGradoOCip(grado, cipOrig.length) ? 'OFICIAL' : 'SUBALTERNO';
    const estadoCip = limpio(row['ESTADO CIP'], 10);
    const situacion = mapSituacionDesdeEstado(estadoCip);

    try {
      await pool.query(
        `INSERT INTO personal_rrhh (
          cip, dni, apellidos_nombres, grado, cod_grado, espec, cargo, sexo, fecha_nac,
          unidad_id, unidad_nombre, division_nombre, cod_unidad, situacion, estado_cip, categoria,
          telefono, correo, domicilio, fec_alta, fec_asc, fec_inc, fec_uni, documentos, escalafon,
          actualizado_por
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,
          $10,$11,$12,$13,$14,$15,$16,
          $17,$18,$19,$20,$21,$22,$23,$24,$25,
          $26
        )
        ON CONFLICT (cip) DO UPDATE SET
          dni=EXCLUDED.dni,
          apellidos_nombres=EXCLUDED.apellidos_nombres,
          grado=EXCLUDED.grado,
          cod_grado=EXCLUDED.cod_grado,
          espec=EXCLUDED.espec,
          cargo=EXCLUDED.cargo,
          sexo=EXCLUDED.sexo,
          fecha_nac=EXCLUDED.fecha_nac,
          unidad_id=EXCLUDED.unidad_id,
          unidad_nombre=EXCLUDED.unidad_nombre,
          division_nombre=EXCLUDED.division_nombre,
          cod_unidad=EXCLUDED.cod_unidad,
          situacion=EXCLUDED.situacion,
          estado_cip=EXCLUDED.estado_cip,
          categoria=EXCLUDED.categoria,
          telefono=EXCLUDED.telefono,
          correo=EXCLUDED.correo,
          domicilio=EXCLUDED.domicilio,
          fec_alta=EXCLUDED.fec_alta,
          fec_asc=EXCLUDED.fec_asc,
          fec_inc=EXCLUDED.fec_inc,
          fec_uni=EXCLUDED.fec_uni,
          documentos=EXCLUDED.documentos,
          escalafon=EXCLUDED.escalafon,
          actualizado_en=NOW(),
          actualizado_por=EXCLUDED.actualizado_por`,
        [
          cip,
          limpio(soloDigitos(row['DNI']), 20),
          nombres.toUpperCase(),
          grado,
          limpio(row['COD.GRADO'], 20),
          limpio(row['ESPEC'], 40),
          limpio(row['CARGO'], 120),
          mapSexo(row['SEXO']),
          parseFecha(row['FEC.NAC']),
          uni.id,
          uni.unidad,
          uni.division,
          limpio(row['COD.UNIDAD'], 20),
          situacion,
          estadoCip,
          categoria,
          limpio(row['TELEFONO'] || row['TELEFONO_1'], 40),
          limpio(row['CORREO'], 120),
          limpio(row['DOMICILIO'] || row['NUEVA DIRECCION DOMICILIARIA'], 500),
          parseFecha(row['FEC.ALTA']),
          parseFecha(row['FEC.ASC']),
          parseFecha(row['FEC.INC']),
          parseFecha(row['FEC.UNI']),
          limpio(row['DOCUMENTOS'], 500),
          limpio(row['ESCALAFON'], 80),
          adminUsuario || 'sistema'
        ]
      );
      creados++;
    } catch (e) {
      errores++;
      if (detalleErrores.length < 20) detalleErrores.push('CIP ' + cip + ': ' + e.message);
    }
  }

  await registrarAuditoria(
    pool, '', 'CARGA_INICIAL', adminUsuario || 'sistema',
    'Importados ' + creados + ' · errores ' + errores
  );
  console.log('RRHH: carga inicial — ' + creados + ' registros, ' + errores + ' errores.');
  return { ok: true, creados: creados, errores: errores, detalleErrores: detalleErrores };
}

function buildWhereRRHH(q) {
  const where = ['1=1'];
  const params = [];
  let i = 1;
  if (q.division) {
    where.push('division_nombre = $' + i++);
    params.push(limpio(q.division, 120));
  }
  if (q.unidad) {
    where.push('unidad_nombre = $' + i++);
    params.push(limpio(q.unidad, 150));
  }
  if (q.situacion) {
    where.push('situacion = $' + i++);
    params.push(limpio(q.situacion, 40));
  }
  if (q.categoria) {
    where.push('categoria = $' + i++);
    params.push(limpio(q.categoria, 20));
  }
  if (q.busqueda) {
    const b = limpio(q.busqueda, 100).toUpperCase();
    const dig = soloDigitos(b);
    where.push('(UPPER(apellidos_nombres) LIKE $' + i + ' OR cip LIKE $' + (i + 1) + ' OR dni LIKE $' + (i + 1) + ')');
    params.push('%' + b + '%');
    params.push(dig ? '%' + dig + '%' : '%' + b + '%');
    i += 2;
  }
  return { sql: where.join(' AND '), params: params };
}

function filaPublica(r) {
  return {
    id: r.id,
    cip: r.cip,
    dni: r.dni,
    apellidos_nombres: r.apellidos_nombres,
    grado: r.grado,
    cod_grado: r.cod_grado,
    espec: r.espec,
    cargo: r.cargo,
    sexo: r.sexo,
    fecha_nac: r.fecha_nac,
    unidad_id: r.unidad_id,
    unidad_nombre: r.unidad_nombre,
    division_nombre: r.division_nombre,
    cod_unidad: r.cod_unidad,
    situacion: r.situacion,
    estado_cip: r.estado_cip,
    categoria: r.categoria,
    telefono: r.telefono,
    correo: r.correo,
    domicilio: r.domicilio,
    fec_alta: r.fec_alta,
    fec_asc: r.fec_asc,
    fec_inc: r.fec_inc,
    fec_uni: r.fec_uni,
    documentos: r.documentos,
    escalafon: r.escalafon,
    actualizado_en: r.actualizado_en,
    actualizado_por: r.actualizado_por
  };
}

function registrarRutas(app, pool, requireAuth) {
  app.get('/admin/rrhh/situaciones', requireAuth, requireRRHH, function(req, res) {
    res.json({ ok: true, situaciones: SITUACIONES });
  });

  app.get('/admin/rrhh/stats', requireAuth, requireRRHH, async function(req, res) {
    try {
      const { sql, params } = buildWhereRRHH(req.query);
      const r = await pool.query(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE categoria='OFICIAL')::int AS oficiales,
           COUNT(*) FILTER (WHERE categoria='SUBALTERNO')::int AS subalternos,
           COUNT(*) FILTER (WHERE situacion='ACTIVO')::int AS activos,
           COUNT(*) FILTER (WHERE situacion='BAJA')::int AS bajas
         FROM personal_rrhh WHERE ${sql}`,
        params
      );
      res.json({ ok: true, stats: r.rows[0] });
    } catch (e) {
      res.json({ ok: false, error: e.message });
    }
  });

  app.get('/admin/rrhh/personal', requireAuth, requireRRHH, async function(req, res) {
    try {
      const { sql, params } = buildWhereRRHH(req.query);
      const modo = limpio(req.query.modo || 'lista', 20);
      const pagina = Math.max(1, parseInt(req.query.pagina, 10) || 1);
      const porPagina = Math.min(500, Math.max(20, parseInt(req.query.por_pagina, 10) || 100));
      const offset = (pagina - 1) * porPagina;

      const totalR = await pool.query(
        `SELECT COUNT(*)::int AS n FROM personal_rrhh WHERE ${sql}`,
        params
      );
      const total = totalR.rows[0].n;

      if (modo === 'acordeon') {
        const r = await pool.query(
          `SELECT * FROM personal_rrhh WHERE ${sql}
           ORDER BY division_nombre, unidad_nombre, apellidos_nombres`,
          params
        );
        const grupos = {};
        r.rows.forEach(function(row) {
          const div = row.division_nombre || 'SIN DIVISIÓN';
          const uni = row.unidad_nombre || 'SIN UNIDAD';
          if (!grupos[div]) grupos[div] = {};
          if (!grupos[div][uni]) grupos[div][uni] = [];
          grupos[div][uni].push({
            id: row.id,
            cip: row.cip,
            grado: row.grado,
            apellidos_nombres: row.apellidos_nombres,
            situacion: row.situacion,
            categoria: row.categoria,
            dni: row.dni
          });
        });
        const acordeon = Object.keys(grupos).sort().map(function(div) {
          return {
            division: div,
            unidades: Object.keys(grupos[div]).sort().map(function(uni) {
              return { unidad: uni, personal: grupos[div][uni], total: grupos[div][uni].length };
            }),
            total: Object.keys(grupos[div]).reduce(function(a, u) {
              return a + grupos[div][u].length;
            }, 0)
          };
        });
        return res.json({ ok: true, total: total, acordeon: acordeon });
      }

      const r = await pool.query(
        `SELECT id, cip, dni, apellidos_nombres, grado, unidad_nombre, division_nombre,
                situacion, categoria, actualizado_en
         FROM personal_rrhh WHERE ${sql}
         ORDER BY division_nombre, unidad_nombre, apellidos_nombres
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        params.concat([porPagina, offset])
      );
      res.json({
        ok: true,
        total: total,
        pagina: pagina,
        por_pagina: porPagina,
        personal: r.rows
      });
    } catch (e) {
      res.json({ ok: false, error: e.message });
    }
  });

  app.get('/admin/rrhh/personal/:cip', requireAuth, requireRRHH, async function(req, res) {
    try {
      const cip = normalizarCip(req.params.cip);
      const r = await pool.query('SELECT * FROM personal_rrhh WHERE cip=$1', [cip]);
      if (!r.rows.length) return res.json({ ok: false, error: 'No encontrado' });
      const aud = await pool.query(
        `SELECT accion, admin_usuario, detalle, creado_en
         FROM personal_rrhh_auditoria WHERE cip=$1
         ORDER BY creado_en DESC LIMIT 20`,
        [cip]
      );
      res.json({ ok: true, personal: filaPublica(r.rows[0]), auditoria: aud.rows });
    } catch (e) {
      res.json({ ok: false, error: e.message });
    }
  });

  app.post('/admin/rrhh/personal', requireAuth, requireRRHH, async function(req, res) {
    try {
      const b = req.body || {};
      const cip = normalizarCip(b.cip);
      if (!cip || cip.length !== 8) {
        return res.json({ ok: false, error: 'CIP inválido (se requieren dígitos; se normaliza a 8)' });
      }
      const nombres = limpio(b.apellidos_nombres, 200).toUpperCase();
      if (!nombres) return res.json({ ok: false, error: 'Apellidos y nombres obligatorios' });
      const unidadNombre = limpio(b.unidad_nombre, 150);
      if (!unidadNombre) return res.json({ ok: false, error: 'Seleccione unidad' });
      const uni = await resolverUnidadId(pool, b.division_nombre, unidadNombre);
      const grado = limpio(b.grado, 80);
      const cipOrigLen = soloDigitos(b.cip).length;
      const categoria = b.categoria === 'OFICIAL' || b.categoria === 'SUBALTERNO'
        ? b.categoria
        : (esOficialPorGradoOCip(grado, cipOrigLen) ? 'OFICIAL' : 'SUBALTERNO');
      const situacion = SITUACIONES.indexOf(limpio(b.situacion, 40)) >= 0
        ? limpio(b.situacion, 40) : 'ACTIVO';
      const adminUser = (req.admin && req.admin.usuario) || '';

      await pool.query(
        `INSERT INTO personal_rrhh (
          cip, dni, apellidos_nombres, grado, cargo, sexo, fecha_nac,
          unidad_id, unidad_nombre, division_nombre, situacion, categoria,
          telefono, correo, domicilio, actualizado_por
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [
          cip, limpio(soloDigitos(b.dni), 20), nombres, grado, limpio(b.cargo, 120),
          mapSexo(b.sexo), parseFecha(b.fecha_nac),
          uni.id, uni.unidad, uni.division, situacion, categoria,
          limpio(b.telefono, 40), limpio(b.correo, 120), limpio(b.domicilio, 500),
          adminUser
        ]
      );
      await registrarAuditoria(pool, cip, 'ALTA', adminUser, 'Alta en ' + uni.unidad);
      res.json({ ok: true, cip: cip });
    } catch (e) {
      if (e.code === '23505') return res.json({ ok: false, error: 'Ya existe un efectivo con ese CIP' });
      res.json({ ok: false, error: e.message });
    }
  });

  app.put('/admin/rrhh/personal/:cip', requireAuth, requireRRHH, async function(req, res) {
    try {
      const cip = normalizarCip(req.params.cip);
      const cur = await pool.query('SELECT * FROM personal_rrhh WHERE cip=$1', [cip]);
      if (!cur.rows.length) return res.json({ ok: false, error: 'No encontrado' });
      const prev = cur.rows[0];
      const b = req.body || {};
      const unidadNombre = limpio(b.unidad_nombre || prev.unidad_nombre, 150);
      const uni = await resolverUnidadId(pool, b.division_nombre, unidadNombre);
      const situacion = SITUACIONES.indexOf(limpio(b.situacion, 40)) >= 0
        ? limpio(b.situacion, 40)
        : prev.situacion;
      const categoria = (b.categoria === 'OFICIAL' || b.categoria === 'SUBALTERNO')
        ? b.categoria
        : prev.categoria;
      const adminUser = (req.admin && req.admin.usuario) || '';
      const movio = prev.unidad_nombre !== uni.unidad;

      await pool.query(
        `UPDATE personal_rrhh SET
          dni=$1, apellidos_nombres=$2, grado=$3, cargo=$4, sexo=$5, fecha_nac=$6,
          unidad_id=$7, unidad_nombre=$8, division_nombre=$9, situacion=$10, categoria=$11,
          telefono=$12, correo=$13, domicilio=$14,
          actualizado_en=NOW(), actualizado_por=$15
         WHERE cip=$16`,
        [
          limpio(soloDigitos(b.dni != null ? b.dni : prev.dni), 20),
          limpio(b.apellidos_nombres != null ? b.apellidos_nombres : prev.apellidos_nombres, 200).toUpperCase(),
          limpio(b.grado != null ? b.grado : prev.grado, 80),
          limpio(b.cargo != null ? b.cargo : prev.cargo, 120),
          mapSexo(b.sexo != null ? b.sexo : prev.sexo),
          parseFecha(b.fecha_nac != null ? b.fecha_nac : prev.fecha_nac),
          uni.id, uni.unidad, uni.division, situacion, categoria,
          limpio(b.telefono != null ? b.telefono : prev.telefono, 40),
          limpio(b.correo != null ? b.correo : prev.correo, 120),
          limpio(b.domicilio != null ? b.domicilio : prev.domicilio, 500),
          adminUser, cip
        ]
      );

      if (movio) {
        await registrarAuditoria(
          pool, cip, 'MOVIMIENTO', adminUser,
          prev.unidad_nombre + ' → ' + uni.unidad
        );
      } else {
        await registrarAuditoria(pool, cip, 'EDICION', adminUser, 'Datos personales actualizados');
      }
      res.json({ ok: true });
    } catch (e) {
      res.json({ ok: false, error: e.message });
    }
  });

  app.delete('/admin/rrhh/personal/:cip', requireAuth, requireRRHH, async function(req, res) {
    try {
      const cip = normalizarCip(req.params.cip);
      const cipConfirm = normalizarCip(req.body && req.body.cip_confirm);
      if (!cipConfirm || cipConfirm !== cip) {
        return res.json({ ok: false, error: 'Debe confirmar el CIP exacto del efectivo a eliminar' });
      }
      const cur = await pool.query(
        'SELECT cip, apellidos_nombres, unidad_nombre FROM personal_rrhh WHERE cip=$1',
        [cip]
      );
      if (!cur.rows.length) return res.json({ ok: false, error: 'No encontrado' });
      const adminUser = (req.admin && req.admin.usuario) || '';
      // Solo borra nómina RRHH — no toca evaluaciones ni descansos médicos
      await pool.query('DELETE FROM personal_rrhh WHERE cip=$1', [cip]);
      await registrarAuditoria(
        pool, cip, 'ELIMINACION', adminUser,
        'Eliminado de nómina RRHH: ' + cur.rows[0].apellidos_nombres +
        ' (' + cur.rows[0].unidad_nombre + '). Evaluaciones y descansos médicos conservados.'
      );
      res.json({ ok: true });
    } catch (e) {
      res.json({ ok: false, error: e.message });
    }
  });

  app.get('/admin/rrhh/cuadro', requireAuth, requireRRHH, async function(req, res) {
    try {
      const { sql, params } = buildWhereRRHH(req.query);
      const r = await pool.query(
        `SELECT division_nombre, unidad_nombre,
                COUNT(*) FILTER (WHERE categoria='OFICIAL')::int AS oficiales,
                COUNT(*) FILTER (WHERE categoria='SUBALTERNO')::int AS subalternos,
                COUNT(*)::int AS total
         FROM personal_rrhh
         WHERE ${sql} AND situacion <> 'BAJA'
         GROUP BY division_nombre, unidad_nombre
         ORDER BY division_nombre, unidad_nombre`,
        params
      );
      const porDivision = {};
      let totOf = 0;
      let totSub = 0;
      r.rows.forEach(function(row) {
        const d = row.division_nombre || 'SIN DIVISIÓN';
        if (!porDivision[d]) porDivision[d] = { division: d, unidades: [], oficiales: 0, subalternos: 0, total: 0 };
        porDivision[d].unidades.push(row);
        porDivision[d].oficiales += row.oficiales;
        porDivision[d].subalternos += row.subalternos;
        porDivision[d].total += row.total;
        totOf += row.oficiales;
        totSub += row.subalternos;
      });
      res.json({
        ok: true,
        generado: new Date().toISOString(),
        divisiones: Object.keys(porDivision).sort().map(function(k) { return porDivision[k]; }),
        totales: { oficiales: totOf, subalternos: totSub, total: totOf + totSub }
      });
    } catch (e) {
      res.json({ ok: false, error: e.message });
    }
  });

  app.get('/admin/rrhh/exportar.xlsx', requireAuth, requireRRHH, async function(req, res) {
    try {
      const tipo = limpio(req.query.tipo || 'listado', 20);
      let aoa;
      let filename;

      if (tipo === 'cuadro') {
        const { sql, params } = buildWhereRRHH(req.query);
        const r = await pool.query(
          `SELECT division_nombre, unidad_nombre,
                  COUNT(*) FILTER (WHERE categoria='OFICIAL')::int AS oficiales,
                  COUNT(*) FILTER (WHERE categoria='SUBALTERNO')::int AS subalternos,
                  COUNT(*)::int AS total
           FROM personal_rrhh
           WHERE ${sql} AND situacion <> 'BAJA'
           GROUP BY division_nombre, unidad_nombre
           ORDER BY division_nombre, unidad_nombre`,
          params
        );
        aoa = [['REGION POLICIAL CALLAO'], ['CUADRO NUMERICO DE PERSONAL POR UNIDAD'], []];
        aoa.push(['División', 'Unidad', 'Oficiales', 'Subalternos', 'Total']);
        r.rows.forEach(function(row) {
          aoa.push([row.division_nombre, row.unidad_nombre, row.oficiales, row.subalternos, row.total]);
        });
        filename = 'CUADRO_RRHH_REGPOL_CALLAO.xlsx';
      } else {
        const { sql, params } = buildWhereRRHH(req.query);
        const r = await pool.query(
          `SELECT cip, dni, apellidos_nombres, grado, cargo, categoria, situacion,
                  division_nombre, unidad_nombre, sexo, telefono, correo
           FROM personal_rrhh WHERE ${sql}
           ORDER BY division_nombre, unidad_nombre, apellidos_nombres`,
          params
        );
        aoa = [['CIP', 'DNI', 'Apellidos y Nombres', 'Grado', 'Cargo', 'Categoría', 'Situación', 'División', 'Unidad', 'Sexo', 'Teléfono', 'Correo']];
        r.rows.forEach(function(row) {
          aoa.push([
            row.cip, row.dni, row.apellidos_nombres, row.grado, row.cargo, row.categoria,
            row.situacion, row.division_nombre, row.unidad_nombre, row.sexo, row.telefono, row.correo
          ]);
        });
        filename = 'NOMINA_RRHH_REGPOL_CALLAO.xlsx';
      }

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      XLSX.utils.book_append_sheet(wb, ws, 'RRHH');
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
      res.send(buf);
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.get('/admin/rrhh/exportar.pdf', requireAuth, requireRRHH, async function(req, res) {
    try {
      const { sql, params } = buildWhereRRHH(req.query);
      const r = await pool.query(
        `SELECT division_nombre, unidad_nombre,
                COUNT(*) FILTER (WHERE categoria='OFICIAL')::int AS oficiales,
                COUNT(*) FILTER (WHERE categoria='SUBALTERNO')::int AS subalternos,
                COUNT(*)::int AS total
         FROM personal_rrhh
         WHERE ${sql} AND situacion <> 'BAJA'
         GROUP BY division_nombre, unidad_nombre
         ORDER BY division_nombre, unidad_nombre`,
        params
      );

      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="CUADRO_RRHH_REGPOL_CALLAO.pdf"');
      doc.pipe(res);

      doc.fillColor('#004d3d').fontSize(14).text('REGIÓN POLICIAL CALLAO', { align: 'center' });
      doc.fillColor('#333').fontSize(11).text('CUADRO NUMÉRICO DE PERSONAL POR UNIDAD', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(9).fillColor('#666').text('Generado: ' + new Date().toLocaleString('es-PE'), { align: 'center' });
      doc.moveDown();

      let y = doc.y;
      const cols = [40, 160, 320, 380, 450];
      doc.fontSize(8).fillColor('#004d3d');
      doc.text('División', cols[0], y);
      doc.text('Unidad', cols[1], y);
      doc.text('Ofic.', cols[2], y);
      doc.text('Subalt.', cols[3], y);
      doc.text('Total', cols[4], y);
      y += 14;
      doc.moveTo(40, y).lineTo(555, y).strokeColor('#c8a94a').stroke();
      y += 6;

      let totO = 0;
      let totS = 0;
      doc.fillColor('#222');
      r.rows.forEach(function(row) {
        if (y > 760) {
          doc.addPage();
          y = 40;
        }
        doc.text(String(row.division_nombre || '').slice(0, 22), cols[0], y, { width: 115 });
        doc.text(String(row.unidad_nombre || '').slice(0, 28), cols[1], y, { width: 150 });
        doc.text(String(row.oficiales), cols[2], y);
        doc.text(String(row.subalternos), cols[3], y);
        doc.text(String(row.total), cols[4], y);
        totO += row.oficiales;
        totS += row.subalternos;
        y += 12;
      });

      y += 8;
      doc.fontSize(9).fillColor('#004d3d').text(
        'TOTAL GENERAL — Oficiales: ' + totO + '  Subalternos: ' + totS + '  Total: ' + (totO + totS),
        40, y
      );
      doc.end();
    } catch (e) {
      if (!res.headersSent) res.status(500).json({ ok: false, error: e.message });
    }
  });
}

module.exports = {
  initTablasRRHH: initTablasRRHH,
  registrarRutas: registrarRutas,
  puedeRRHH: puedeRRHH,
  normalizarCip: normalizarCip,
  mapearUnidadExcel: mapearUnidadExcel,
  SITUACIONES: SITUACIONES,
  CATALOGO_RRHH: CATALOGO_RRHH
};
