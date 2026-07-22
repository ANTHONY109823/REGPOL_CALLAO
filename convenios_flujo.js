/*
  Flujo CONVENIOS (nuevo):
  1. Preinscripción (sin PDF)
  2. Sorteo (todos los preinscritos) → ganador / reserva
  3. Aviso ganadores (WA + correo)
  4. Presentación expediente (plazo 2 días)
  5. Revisión admin → constancia u observación (+ aviso)
  6. Repechaje: registro completo con expediente (sin sorteo), según vacantes libres

  Cursos mantienen el flujo anterior (PDF al inscribir + verificado/aprobado).
*/
const PLAZO_EXPEDIENTE_DIAS = 2;

const ESTADOS_CONVENIO = {
  PREINSCRITO: 'preinscrito',
  GANADOR: 'ganador',
  EN_REVISION: 'en_revision',
  OBSERVADO: 'observado',
  EXPEDIENTE_OK: 'expediente_ok',
  RESERVA: 'reserva',
  RECHAZADO: 'rechazado',
  CADUCADO: 'caducado',
  REPECHAJE: 'repechaje'
};

/** Ocupan vacante activa (no liberada). */
const ESTADOS_OCUPAN_VACANTE = [
  ESTADOS_CONVENIO.GANADOR,
  ESTADOS_CONVENIO.EN_REVISION,
  ESTADOS_CONVENIO.OBSERVADO,
  ESTADOS_CONVENIO.EXPEDIENTE_OK,
  ESTADOS_CONVENIO.REPECHAJE
];

const CATALOGO_OBSERVACIONES = [
  { codigo: 'DOC_INCOMPLETO', label: 'Documentación incompleta' },
  { codigo: 'PDF_ILEGIBLE', label: 'PDF ilegible o de baja calidad' },
  { codigo: 'FALTA_FIRMA', label: 'Falta firma del efectivo o jefatura' },
  { codigo: 'DATOS_NO_COINCIDEN', label: 'Datos del formulario no coinciden con CIP/nómina' },
  { codigo: 'SIN_DISPONIBILIDAD', label: 'No acredita vacaciones/franco declarado' },
  { codigo: 'FUERA_PLAZO', label: 'Presentado fuera de plazo' },
  { codigo: 'FORMATO_INCORRECTO', label: 'Formato incorrecto (no es el modelo oficial)' },
  { codigo: 'OTRO', label: 'Otro (ver observaciones)' }
];

function limpio(v, max) {
  const s = String(v == null ? '' : v).trim().replace(/\s+/g, ' ');
  return max ? s.slice(0, max) : s;
}

function soloDigitos(v) {
  return String(v == null ? '' : v).replace(/\D/g, '');
}

function normalizarTelefonoPe(tel) {
  let d = soloDigitos(tel);
  if (d.indexOf('51') === 0 && d.length >= 11) d = d.slice(2);
  if (d.length === 9) return d;
  return d;
}

function etiquetaObservacion(codigo) {
  const c = CATALOGO_OBSERVACIONES.filter(function(x) { return x.codigo === codigo; })[0];
  return c ? c.label : (codigo || '');
}

function bloqueDatosConvenio(item) {
  if (!item) return '';
  const lineas = [];
  const horario = limpio(item.horario, 200);
  const fechaIni = limpio(item.fecha_inicio, 100);
  const duracion = limpio(item.duracion, 100);
  const lugar = limpio(item.lugar, 200);
  const vacantes = item.vacantes != null && item.vacantes !== '' ? String(item.vacantes) : '';
  const desc = limpio(item.descripcion, 400);
  if (horario) lineas.push('Horarios / turnos: ' + horario);
  if (fechaIni) lineas.push('Fecha de inicio: ' + fechaIni);
  if (duracion) lineas.push('Duración: ' + duracion);
  if (lugar) lineas.push('Lugar: ' + lugar);
  if (vacantes) lineas.push('Vacantes: ' + vacantes);
  if (desc) lineas.push('Detalle: ' + desc);
  if (!lineas.length) return '';
  return '\nDatos del convenio:\n' + lineas.map(function(l) { return '• ' + l; }).join('\n') + '\n';
}

function mensajeNotificacion(tipo, ins, itemTitulo, item) {
  const nombre = limpio(ins.nombres, 120) || 'efectivo';
  const conv = limpio(itemTitulo || (item && item.titulo), 120) || 'convenio';
  const num = limpio(ins.cip, 20);
  const datos = bloqueDatosConvenio(item || {});
  const nro = limpio(ins.nro_registro, 30);
  const grado = limpio(ins.grado, 60);
  const unidad = limpio(ins.unidad, 120);
  const cabeceraPersona = 'Sr(a). ' + (grado ? grado + ' ' : '') + nombre + ' (CIP ' + num + ')'
    + (nro ? (' — N° ' + nro) : '')
    + (unidad ? ('\nUnidad: ' + unidad) : '');

  if (tipo === 'ganador') {
    return 'REGPOL Callao — CONVENIOS\n\n'
      + cabeceraPersona + ':\n\n'
      + 'Ha resultado GANADOR(A) en «' + conv + '».\n'
      + datos
      + '\nDebe subir su expediente completo en un plazo de '
      + PLAZO_EXPEDIENTE_DIAS + ' días hábiles/calendario desde la notificación,\n'
      + 'ingresando a Consulta por CIP en el portal REGPOL Callao.\n'
      + 'Pasado el plazo, la vacante se libera para REPECHAJE.';
  }
  if (tipo === 'observado') {
    const motivo = etiquetaObservacion(ins.motivo_observacion) || 'Observación de expediente';
    const obs = limpio(ins.observacion, 400);
    return 'REGPOL Callao — CONVENIOS\n\n'
      + cabeceraPersona + ':\n\n'
      + 'Su expediente de «' + conv + '» ha sido OBSERVADO.\n'
      + datos
      + '\nMotivo: ' + motivo + '\n'
      + (obs ? ('Detalle: ' + obs + '\n') : '')
      + 'Subsanar a la brevedad y volver a subir el PDF corregido desde Consulta por CIP.';
  }
  if (tipo === 'rechazado') {
    const motivo = etiquetaObservacion(ins.motivo_observacion) || '';
    const obs = limpio(ins.observacion, 400);
    return 'REGPOL Callao — CONVENIOS\n\n'
      + cabeceraPersona + ':\n\n'
      + 'Su expediente de «' + conv + '» NO FUE ADMITIDO.\n'
      + datos
      + (motivo ? ('\nMotivo: ' + motivo + '\n') : '')
      + (obs ? ('Detalle: ' + obs + '\n') : '')
      + '\nSi aún está dentro del plazo de subsanación, corrija su documentación y súbala nuevamente desde Consulta por CIP '
      + '(use la plantilla Word y el modelo PDF).';
  }
  if (tipo === 'expediente_ok') {
    return 'REGPOL Callao — CONVENIOS\n\n'
      + cabeceraPersona + ':\n\n'
      + 'Su expediente de «' + conv + '» fue VERIFICADO correctamente.\n'
      + datos
      + '\nYa puede descargar su CONSTANCIA DE VACANTE en Consulta por CIP.';
  }
  if (tipo === 'caducado') {
    return 'REGPOL Callao — CONVENIOS\n\n'
      + cabeceraPersona + ':\n\n'
      + 'No presentó expediente a tiempo para «' + conv + '».\n'
      + datos
      + '\nLa vacante fue liberada para REPECHAJE.';
  }
  return 'REGPOL Callao — mensaje de convenios.';
}

function urlsNotificacion(ins, mensaje) {
  const tel = normalizarTelefonoPe(ins.telefono);
  const email = limpio(ins.email, 100);
  const wa = tel
    ? ('https://wa.me/51' + tel + '?text=' + encodeURIComponent(mensaje))
    : '';
  const mail = email
    ? ('mailto:' + encodeURIComponent(email)
      + '?subject=' + encodeURIComponent('REGPOL Callao — Convenios')
      + '&body=' + encodeURIComponent(mensaje))
    : '';
  return { whatsapp_url: wa, mailto_url: mail, telefono: tel, email: email };
}

async function enviarEmailSiConfigurado(dest, asunto, cuerpo) {
  const host = (process.env.SMTP_HOST || '').trim();
  const user = (process.env.SMTP_USER || '').trim();
  const pass = (process.env.SMTP_PASS || '').trim();
  const from = (process.env.SMTP_FROM || user || '').trim();
  if (!host || !user || !pass || !from || !dest) {
    return { ok: false, skip: true, error: 'SMTP no configurado' };
  }
  try {
    // Envío mínimo por SMTP sin dependencia extra (socket raw no es viable).
    // Si no hay nodemailer, solo dejamos URLs; intentamos require opcional.
    let nodemailer;
    try { nodemailer = require('nodemailer'); } catch (e) {
      return { ok: false, skip: true, error: 'Instale nodemailer o use los enlaces mailto/WhatsApp' };
    }
    const port = parseInt(process.env.SMTP_PORT || '587', 10) || 587;
    const transporter = nodemailer.createTransport({
      host: host,
      port: port,
      secure: port === 465,
      auth: { user: user, pass: pass }
    });
    await transporter.sendMail({
      from: from,
      to: dest,
      subject: asunto,
      text: cuerpo
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function notificarInscripcion(pool, inscripcionId, tipo) {
  const r = await pool.query(
    `SELECT n.*,
            i.titulo AS item_titulo, i.tipo AS item_tipo,
            i.horario, i.fecha_inicio, i.duracion, i.lugar, i.vacantes, i.descripcion
     FROM inscripciones n
     JOIN items_portal i ON i.id = n.item_id
     WHERE n.id=$1`,
    [inscripcionId]
  );
  if (!r.rows.length) return { ok: false, error: 'Inscripción no encontrada' };
  const ins = r.rows[0];
  if (ins.item_tipo !== 'convenio') return { ok: false, error: 'Solo aplica a convenios' };

  const itemInfo = {
    titulo: ins.item_titulo,
    horario: ins.horario,
    fecha_inicio: ins.fecha_inicio,
    duracion: ins.duracion,
    lugar: ins.lugar,
    vacantes: ins.vacantes,
    descripcion: ins.descripcion
  };
  const mensaje = mensajeNotificacion(tipo, ins, ins.item_titulo, itemInfo);
  const urls = urlsNotificacion(ins, mensaje);
  const emailRes = await enviarEmailSiConfigurado(
    urls.email,
    'REGPOL Callao — Convenios: ' + limpio(ins.item_titulo, 80),
    mensaje
  );

  const logEntry = {
    tipo: tipo,
    en: new Date().toISOString(),
    whatsapp: !!urls.whatsapp_url,
    email_intentado: !!urls.email,
    email_ok: !!(emailRes && emailRes.ok),
    email_error: (emailRes && emailRes.error) || ''
  };

  let log = [];
  try {
    log = ins.notif_log ? (typeof ins.notif_log === 'string' ? JSON.parse(ins.notif_log) : ins.notif_log) : [];
  } catch (e) { log = []; }
  if (!Array.isArray(log)) log = [];
  log.push(logEntry);
  if (log.length > 30) log = log.slice(-30);

  await pool.query(
    `UPDATE inscripciones SET notif_log=$1::jsonb, ultima_notif=NOW() WHERE id=$2`,
    [JSON.stringify(log), inscripcionId]
  );

  return {
    ok: true,
    mensaje: mensaje,
    inscripcion_id: inscripcionId,
    tipo_notif: tipo,
    telefono: urls.telefono || '',
    email: urls.email || '',
    whatsapp_url: urls.whatsapp_url,
    mailto_url: urls.mailto_url,
    email_enviado: !!(emailRes && emailRes.ok),
    email_detalle: emailRes,
    convenio: itemInfo
  };
}

const MODALIDADES_TRABAJO = [
  { codigo: '24X24', label: '24X24' },
  { codigo: 'ADMINISTRATIVO', label: 'Administrativo' },
  { codigo: 'SERVICIO_FRANCO_RETEN', label: 'Servicio / Franco / Retén' },
  { codigo: 'OTROS', label: 'Otros' }
];

/** Regiones policiales PNP (convocatoria nacional). */
const REGIONES_POLICIALES = [
  'REGIÓN POLICIAL AMAZONAS',
  'REGIÓN POLICIAL ANCASH',
  'REGIÓN POLICIAL APURÍMAC',
  'REGIÓN POLICIAL AREQUIPA',
  'REGIÓN POLICIAL AYACUCHO',
  'REGIÓN POLICIAL CAJAMARCA',
  'REGIÓN POLICIAL CALLAO',
  'REGIÓN POLICIAL CUSCO',
  'REGIÓN POLICIAL HUANCAVELICA',
  'REGIÓN POLICIAL HUÁNUCO',
  'REGIÓN POLICIAL ICA',
  'REGIÓN POLICIAL JUNÍN',
  'REGIÓN POLICIAL LA LIBERTAD',
  'REGIÓN POLICIAL LAMBAYEQUE',
  'REGIÓN POLICIAL LIMA',
  'REGIÓN POLICIAL LORETO',
  'REGIÓN POLICIAL MADRE DE DIOS',
  'REGIÓN POLICIAL MOQUEGUA',
  'REGIÓN POLICIAL PASCO',
  'REGIÓN POLICIAL PIURA',
  'REGIÓN POLICIAL PUNO',
  'REGIÓN POLICIAL SAN MARTÍN',
  'REGIÓN POLICIAL TACNA',
  'REGIÓN POLICIAL TUMBES',
  'REGIÓN POLICIAL UCAYALI',
  'DIRINCRI',
  'DIRANDRO',
  'OTRA DEPENDENCIA NACIONAL'
];

function prefijoNroRegistro(titulo, tipo) {
  const t = String(titulo || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (t.indexOf('CELADOR') !== -1) return 'C';
  if (t.indexOf('ATU') !== -1) return 'U';
  if (/\bAMP\b/.test(t) || t.indexOf('APOYO AL MANTENIMIENTO') !== -1) return 'A';
  if (tipo === 'curso' || t.indexOf('CURSO') !== -1) return 'E';
  const words = t.split(/[^A-Z0-9]+/).filter(function(w) {
    return w && ['PLAN', 'CONVENIO', 'CONVENIOS', 'CURSO', 'CURSOS', 'DE', 'DEL', 'LA', 'EL', 'LOS', 'LAS'].indexOf(w) === -1;
  });
  if (words.length && /^[A-Z]/.test(words[0])) return words[0].charAt(0);
  return tipo === 'curso' ? 'E' : 'P';
}

/** Ej: Celador → C202600003 (letra + año + correlativo, sin guiones). */
function formatearNroRegistro(id, anio, prefijo) {
  const y = anio || new Date().getFullYear();
  const n = String(parseInt(id, 10) || 0).padStart(5, '0');
  const p = String(prefijo || 'P').charAt(0).toUpperCase() || 'P';
  return p + y + n;
}

async function asegurarNroRegistro(pool, inscripcionId) {
  const r = await pool.query(
    `SELECT n.id, n.nro_registro, n.item_id,
            EXTRACT(YEAR FROM COALESCE(n.fecha, NOW()))::int AS anio,
            i.titulo, i.tipo
     FROM inscripciones n
     LEFT JOIN items_portal i ON i.id = n.item_id
     WHERE n.id=$1`,
    [inscripcionId]
  );
  if (!r.rows.length) return null;
  if (r.rows[0].nro_registro) return r.rows[0].nro_registro;
  const prefijo = prefijoNroRegistro(r.rows[0].titulo, r.rows[0].tipo);
  const nro = formatearNroRegistro(r.rows[0].id, r.rows[0].anio, prefijo);
  await pool.query(
    'UPDATE inscripciones SET nro_registro=$1 WHERE id=$2 AND COALESCE(nro_registro,\'\')=\'\'',
    [nro, inscripcionId]
  );
  return nro;
}

async function initColumnasFlujoConvenios(pool) {
  await pool.query(`
    ALTER TABLE inscripciones ADD COLUMN IF NOT EXISTS modo_ingreso VARCHAR(20) DEFAULT '';
    ALTER TABLE inscripciones ADD COLUMN IF NOT EXISTS fecha_ganador TIMESTAMPTZ;
    ALTER TABLE inscripciones ADD COLUMN IF NOT EXISTS plazo_expediente TIMESTAMPTZ;
    ALTER TABLE inscripciones ADD COLUMN IF NOT EXISTS motivo_observacion VARCHAR(80) DEFAULT '';
    ALTER TABLE inscripciones ADD COLUMN IF NOT EXISTS notif_log JSONB DEFAULT '[]'::jsonb;
    ALTER TABLE inscripciones ADD COLUMN IF NOT EXISTS ultima_notif TIMESTAMPTZ;
    ALTER TABLE inscripciones ADD COLUMN IF NOT EXISTS nro_registro VARCHAR(30) DEFAULT '';
    ALTER TABLE inscripciones ADD COLUMN IF NOT EXISTS modalidad VARCHAR(40) DEFAULT '';
    ALTER TABLE inscripciones ADD COLUMN IF NOT EXISTS modalidad_otro VARCHAR(120) DEFAULT '';
    ALTER TABLE inscripciones ADD COLUMN IF NOT EXISTS codifin VARCHAR(12) DEFAULT '';
    ALTER TABLE inscripciones ADD COLUMN IF NOT EXISTS region_policial VARCHAR(120) DEFAULT '';
    ALTER TABLE inscripciones ADD COLUMN IF NOT EXISTS comisaria_postula VARCHAR(150) DEFAULT '';
    ALTER TABLE inscripciones ADD COLUMN IF NOT EXISTS token_constancia VARCHAR(64) DEFAULT '';
    ALTER TABLE inscripciones ADD COLUMN IF NOT EXISTS aprobado_por_nombre VARCHAR(150) DEFAULT '';
    ALTER TABLE inscripciones ADD COLUMN IF NOT EXISTS aprobado_por_usuario VARCHAR(60) DEFAULT '';
    ALTER TABLE inscripciones ADD COLUMN IF NOT EXISTS fecha_aprobacion TIMESTAMPTZ;
    ALTER TABLE items_portal ADD COLUMN IF NOT EXISTS aviso_sorteo_fb TEXT DEFAULT '';
    CREATE INDEX IF NOT EXISTS idx_inscripciones_estado ON inscripciones(estado);
    CREATE INDEX IF NOT EXISTS idx_inscripciones_plazo ON inscripciones(plazo_expediente);
    CREATE INDEX IF NOT EXISTS idx_inscripciones_nro ON inscripciones(nro_registro);
    CREATE INDEX IF NOT EXISTS idx_inscripciones_codifin ON inscripciones(codifin);
    CREATE INDEX IF NOT EXISTS idx_inscripciones_region ON inscripciones(region_policial);
    CREATE INDEX IF NOT EXISTS idx_inscripciones_cia_postula ON inscripciones(comisaria_postula);
    CREATE INDEX IF NOT EXISTS idx_inscripciones_dni ON inscripciones(dni);
    CREATE INDEX IF NOT EXISTS idx_inscripciones_item_cip ON inscripciones(item_id, cip);
    CREATE INDEX IF NOT EXISTS idx_inscripciones_token ON inscripciones(token_constancia);
    CREATE INDEX IF NOT EXISTS idx_inscripciones_modo ON inscripciones(modo_ingreso);
  `);

  // Asignar N° de registro a históricos sin número (formato compacto: C202600003)
  await pool.query(`
    UPDATE inscripciones n
    SET nro_registro =
      CASE
        WHEN UPPER(COALESCE(i.titulo,'')) LIKE '%CELADOR%' THEN 'C'
        WHEN UPPER(COALESCE(i.titulo,'')) LIKE '%ATU%' THEN 'U'
        WHEN UPPER(COALESCE(i.titulo,'')) ~ '(^|[^A-Z])AMP([^A-Z]|$)' THEN 'A'
        WHEN i.tipo = 'curso' OR UPPER(COALESCE(i.titulo,'')) LIKE '%CURSO%' THEN 'E'
        ELSE 'P'
      END
      || EXTRACT(YEAR FROM COALESCE(n.fecha, NOW()))::int::text
      || LPAD(n.id::text, 5, '0')
    FROM items_portal i
    WHERE n.item_id = i.id
      AND COALESCE(n.nro_registro, '') = ''
  `);
}
async function migrarEstadosConvenios(pool) {
  // Preinscripción unificada (ya no verifican/aprueban antes del sorteo)
  await pool.query(`
    UPDATE inscripciones n
    SET estado = 'preinscrito',
        modo_ingreso = CASE WHEN COALESCE(modo_ingreso,'')='' THEN 'sorteo' ELSE modo_ingreso END
    FROM items_portal i
    WHERE n.item_id = i.id
      AND i.tipo = 'convenio'
      AND n.estado IN ('pendiente', 'verificado', 'aprobado')
  `);

  // Ganadores con PDF ya cargado → en revisión
  await pool.query(`
    UPDATE inscripciones n
    SET estado = 'en_revision',
        fecha_ganador = COALESCE(fecha_ganador, n.fecha, NOW()),
        plazo_expediente = COALESCE(plazo_expediente, NOW() + ($1 || ' days')::interval),
        modo_ingreso = CASE WHEN COALESCE(modo_ingreso,'')='' THEN 'sorteo' ELSE modo_ingreso END
    FROM items_portal i
    WHERE n.item_id = i.id
      AND i.tipo = 'convenio'
      AND n.estado = 'ganador'
      AND COALESCE(n.pdf_requisitos,'') <> ''
  `, [String(PLAZO_EXPEDIENTE_DIAS)]);

  // Ganadores sin PDF → mantienen ganador + plazo 2 días desde ahora (si no tenían)
  await pool.query(`
    UPDATE inscripciones n
    SET fecha_ganador = COALESCE(fecha_ganador, NOW()),
        plazo_expediente = COALESCE(plazo_expediente, NOW() + ($1 || ' days')::interval),
        modo_ingreso = CASE WHEN COALESCE(modo_ingreso,'')='' THEN 'sorteo' ELSE modo_ingreso END
    FROM items_portal i
    WHERE n.item_id = i.id
      AND i.tipo = 'convenio'
      AND n.estado = 'ganador'
      AND COALESCE(n.pdf_requisitos,'') = ''
  `, [String(PLAZO_EXPEDIENTE_DIAS)]);
}

async function caducarExpedientesVencidos(pool) {
  // Asegurar fecha_ganador y plazo (2 días) a ganadores que aún no lo tengan
  await pool.query(`
    UPDATE inscripciones n
    SET fecha_ganador = COALESCE(fecha_ganador, n.fecha, NOW()),
        plazo_expediente = COALESCE(
          plazo_expediente,
          COALESCE(fecha_ganador, n.fecha, NOW()) + ($1 || ' days')::interval
        )
    FROM items_portal i
    WHERE n.item_id = i.id
      AND i.tipo = 'convenio'
      AND n.estado = 'ganador'
      AND COALESCE(n.pdf_requisitos,'') = ''
      AND (n.plazo_expediente IS NULL OR n.fecha_ganador IS NULL)
  `, [String(PLAZO_EXPEDIENTE_DIAS)]);

  const r = await pool.query(`
    UPDATE inscripciones n
    SET estado = 'caducado',
        observacion = CASE
          WHEN COALESCE(observacion,'') = '' THEN 'Plazo de 2 días vencido sin presentar expediente'
          ELSE observacion
        END
    FROM items_portal i
    WHERE n.item_id = i.id
      AND i.tipo = 'convenio'
      AND n.estado = 'ganador'
      AND n.plazo_expediente IS NOT NULL
      AND n.plazo_expediente < NOW()
      AND COALESCE(n.pdf_requisitos,'') = ''
    RETURNING n.id
  `);
  return (r.rows || []).map(function(x) { return x.id; });
}

async function contarOcupadas(pool, itemId) {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS n FROM inscripciones
     WHERE item_id=$1 AND estado = ANY($2::varchar[])`,
    [itemId, ESTADOS_OCUPAN_VACANTE]
  );
  return r.rows[0].n || 0;
}

async function vacantesDisponibles(pool, itemId) {
  const item = await pool.query('SELECT vacantes, tipo FROM items_portal WHERE id=$1', [itemId]);
  if (!item.rows.length) return { ok: false, error: 'Convocatoria no encontrada' };
  if (item.rows[0].tipo !== 'convenio') {
    return { ok: true, vacantes: item.rows[0].vacantes || 0, ocupadas: 0, disponibles: item.rows[0].vacantes || 0 };
  }
  await caducarExpedientesVencidos(pool);
  const total = parseInt(item.rows[0].vacantes, 10) || 0;
  const ocupadas = await contarOcupadas(pool, itemId);
  const disponibles = Math.max(0, total - ocupadas);
  return { ok: true, vacantes: total, ocupadas: ocupadas, disponibles: disponibles };
}

function plazoDesdeAhora() {
  const d = new Date();
  d.setDate(d.getDate() + PLAZO_EXPEDIENTE_DIAS);
  return d;
}

module.exports = {
  PLAZO_EXPEDIENTE_DIAS,
  ESTADOS_CONVENIO,
  ESTADOS_OCUPAN_VACANTE,
  CATALOGO_OBSERVACIONES,
  MODALIDADES_TRABAJO,
  REGIONES_POLICIALES,
  etiquetaObservacion,
  mensajeNotificacion,
  urlsNotificacion,
  notificarInscripcion,
  initColumnasFlujoConvenios,
  migrarEstadosConvenios,
  caducarExpedientesVencidos,
  vacantesDisponibles,
  plazoDesdeAhora,
  formatearNroRegistro,
  prefijoNroRegistro,
  asegurarNroRegistro,
  limpio,
  soloDigitos,
  normalizarTelefonoPe
};
