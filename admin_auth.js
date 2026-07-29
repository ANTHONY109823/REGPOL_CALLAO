/**
 * Autenticación de panel: CIP + nómina, bcrypt, caducidad 45 días, auditoría.
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const PASSWORD_MAX_AGE_DAYS = 45;
const BCRYPT_ROUNDS = 10;
const PASSWORD_MIN_LEN = 10;

function sha256(s) {
  return crypto.createHash('sha256').update(String(s || '')).digest('hex');
}

function normalizarCipLogin(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.length < 6 || d.length > 12) return '';
  return d;
}

function esUsuarioTipoCip(usuario) {
  return /^\d{6,12}$/.test(String(usuario || '').trim());
}

function validarPoliticaPassword(password) {
  const p = String(password || '');
  if (p.length < PASSWORD_MIN_LEN) {
    return { ok: false, error: 'La contraseña debe tener al menos ' + PASSWORD_MIN_LEN + ' caracteres.' };
  }
  if (!/[A-Za-z]/.test(p) || !/[0-9]/.test(p)) {
    return { ok: false, error: 'La contraseña debe ser alfanumérica (letras y números).' };
  }
  return { ok: true };
}

async function hashPassword(password) {
  return bcrypt.hash(String(password), BCRYPT_ROUNDS);
}

async function verifyPassword(password, passhash) {
  const hash = String(passhash || '');
  const plain = String(password || '');
  if (!hash) return false;
  if (hash.indexOf('$2') === 0) {
    try { return await bcrypt.compare(plain, hash); } catch (e) { return false; }
  }
  // Compatibilidad temporal con hashes SHA-256 antiguos
  return hash === sha256(plain);
}

function passwordVencida(admin) {
  if (admin && admin.debe_cambiar_password) return true;
  const raw = admin && admin.password_changed_at;
  if (!raw) return true;
  const t = new Date(raw).getTime();
  if (isNaN(t)) return true;
  const dias = (Date.now() - t) / (24 * 60 * 60 * 1000);
  return dias >= PASSWORD_MAX_AGE_DAYS;
}

async function initAuthTablas(pool) {
  await pool.query(`
    ALTER TABLE admins ADD COLUMN IF NOT EXISTS cip VARCHAR(20) DEFAULT '';
    ALTER TABLE admins ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT TRUE;
    ALTER TABLE admins ADD COLUMN IF NOT EXISTS debe_cambiar_password BOOLEAN DEFAULT FALSE;
    ALTER TABLE admins ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;
    ALTER TABLE admins ALTER COLUMN passhash TYPE VARCHAR(200);

    CREATE TABLE IF NOT EXISTS admin_auditoria (
      id          SERIAL PRIMARY KEY,
      fecha       TIMESTAMPTZ DEFAULT NOW(),
      admin_id    INTEGER,
      cip         VARCHAR(20) DEFAULT '',
      usuario     VARCHAR(60) DEFAULT '',
      nombre      VARCHAR(200) DEFAULT '',
      accion      VARCHAR(80) NOT NULL,
      modulo      VARCHAR(40) DEFAULT '',
      entidad     VARCHAR(40) DEFAULT '',
      entidad_id  VARCHAR(60) DEFAULT '',
      detalle     TEXT DEFAULT '',
      ip          VARCHAR(80) DEFAULT '',
      ok          BOOLEAN DEFAULT TRUE
    );
    ALTER TABLE admin_auditoria ADD COLUMN IF NOT EXISTS nombre VARCHAR(200) DEFAULT '';
    CREATE INDEX IF NOT EXISTS idx_admin_aud_fecha ON admin_auditoria(fecha DESC);
    CREATE INDEX IF NOT EXISTS idx_admin_aud_cip ON admin_auditoria(cip);
    CREATE INDEX IF NOT EXISTS idx_admin_aud_accion ON admin_auditoria(accion);
  `);

  // Completar CIP desde usuario numérico si falta
  await pool.query(`
    UPDATE admins
       SET cip = usuario
     WHERE (cip IS NULL OR TRIM(cip) = '')
       AND usuario ~ '^[0-9]{6,12}$'
  `).catch(function() {});

  // password_changed_at nulo → forzar cambio en el próximo login
  await pool.query(`
    UPDATE admins
       SET debe_cambiar_password = TRUE
     WHERE password_changed_at IS NULL
       AND COALESCE(debe_cambiar_password, FALSE) = FALSE
  `).catch(function() {});
}

/**
 * Bootstrap / vinculación Super Admin por variables de entorno Railway:
 *   BOOTSTRAP_ADMIN_CIP
 *   BOOTSTRAP_ADMIN_PASSWORD  (alfanumérica, mín. 10)
 *
 * - Si no hay Super Admin: lo crea con ese CIP.
 * - Si ya existe (ej. admin_unitic) y se definen las variables: vincula CIP y
 *   actualiza la contraseña (solo cuando BOOTSTRAP_ADMIN_APPLY=1 para no
 *   pisar claves en cada reinicio).
 */
async function bootstrapSuperAdminSiFalta(pool) {
  const cip = normalizarCipLogin(process.env.BOOTSTRAP_ADMIN_CIP || '');
  const pass = String(process.env.BOOTSTRAP_ADMIN_PASSWORD || '').trim();
  const aplicar = String(process.env.BOOTSTRAP_ADMIN_APPLY || '').trim() === '1';

  const r = await pool.query(
    `SELECT id, usuario, cip, rol FROM admins
     WHERE rol='unitic' AND COALESCE(activo,TRUE)=TRUE
     ORDER BY id ASC LIMIT 1`
  );
  const existing = r.rows[0] || null;

  if (!existing) {
    if (!cip || !pass) {
      console.warn('AVISO SEGURIDAD: no hay Super Admin. Configure BOOTSTRAP_ADMIN_CIP y BOOTSTRAP_ADMIN_PASSWORD en Railway.');
      return { creado: false, aviso: true };
    }
    const pol = validarPoliticaPassword(pass);
    if (!pol.ok) {
      console.warn('AVISO SEGURIDAD: BOOTSTRAP_ADMIN_PASSWORD no cumple política: ' + pol.error);
      return { creado: false, aviso: true };
    }
    const hash = await hashPassword(pass);
    await pool.query(
      `INSERT INTO admins (usuario, passhash, rol, nombre, unidad, permisos, cip, activo, debe_cambiar_password, password_changed_at)
       VALUES ($1,$2,'unitic',$3,NULL,'[]'::jsonb,$1,TRUE,TRUE,NOW())
       ON CONFLICT (usuario) DO UPDATE SET
         passhash = EXCLUDED.passhash,
         rol = 'unitic',
         cip = EXCLUDED.cip,
         activo = TRUE,
         debe_cambiar_password = TRUE,
         password_changed_at = NOW()`,
      [cip, hash, 'Super Admin UNITIC']
    );
    console.log('Super Admin bootstrap creado para CIP ' + cip + ' (debe cambiar contraseña).');
    return { creado: true };
  }

  // Ya hay Super Admin: vincular CIP / reset solo si APPLY=1
  if (!aplicar) {
    return { creado: false, existente: existing.usuario };
  }
  if (!cip || !pass) {
    console.warn('AVISO: BOOTSTRAP_ADMIN_APPLY=1 pero faltan CIP o PASSWORD.');
    return { creado: false, aviso: true };
  }
  const pol = validarPoliticaPassword(pass);
  if (!pol.ok) {
    console.warn('AVISO SEGURIDAD: BOOTSTRAP_ADMIN_PASSWORD no cumple política: ' + pol.error);
    return { creado: false, aviso: true };
  }
  const hash = await hashPassword(pass);
  // Evitar choque UNIQUE si otro usuario ya tiene ese CIP/usuario
  const choc = await pool.query(
    `SELECT id FROM admins WHERE id<>$1 AND (usuario=$2 OR cip=$2) LIMIT 1`,
    [existing.id, cip]
  );
  if (choc.rows.length) {
    console.warn('AVISO: el CIP ' + cip + ' ya está usado por otro admin. No se aplicó bootstrap.');
    return { creado: false, aviso: true };
  }
  await pool.query(
    `UPDATE admins
        SET usuario=$1,
            cip=$1,
            passhash=$2,
            activo=TRUE,
            debe_cambiar_password=TRUE,
            password_changed_at=NOW()
      WHERE id=$3`,
    [cip, hash, existing.id]
  );
  console.log('Super Admin vinculado a CIP ' + cip + ' (BOOTSTRAP_ADMIN_APPLY=1). Debe cambiar contraseña.');
  return { creado: false, actualizado: true, cip: cip };
}

async function registrarAuditoria(pool, opts) {
  try {
    const o = opts || {};
    let nombre = String(o.nombre || '').trim();
    if (!nombre && o.adminId) {
      const rn = await pool.query('SELECT nombre FROM admins WHERE id=$1', [o.adminId]);
      if (rn.rows[0] && rn.rows[0].nombre) nombre = String(rn.rows[0].nombre).trim();
    }
    await pool.query(
      `INSERT INTO admin_auditoria
        (admin_id, cip, usuario, nombre, accion, modulo, entidad, entidad_id, detalle, ip, ok)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        o.adminId || null,
        String(o.cip || '').slice(0, 20),
        String(o.usuario || '').slice(0, 60),
        nombre.slice(0, 200),
        String(o.accion || 'evento').slice(0, 80),
        String(o.modulo || '').slice(0, 40),
        String(o.entidad || '').slice(0, 40),
        String(o.entidadId || '').slice(0, 60),
        String(o.detalle || '').slice(0, 2000),
        String(o.ip || '').slice(0, 80),
        o.ok !== false
      ]
    );
  } catch (e) {
    console.warn('auditoria:', e.message);
  }
}

/** Sincroniza nombre/unidad del admin desde nómina (para login y panel). */
async function sincronizarAdminDesdeNomina(pool, admin) {
  if (!admin || !admin.id) return admin;
  const cip = normalizarCipLogin(admin.cip || admin.usuario);
  if (!cip) return admin;
  const nomina = await buscarNominaParaAcceso(pool, cip);
  if (!nomina) return admin;
  const nombre = String(nomina.apellidos_nombres || '').trim();
  const unidad = String(nomina.unidad_nombre || '').trim();
  if (nombre && nombre !== String(admin.nombre || '').trim()) {
    admin.nombre = nombre;
    await pool.query('UPDATE admins SET nombre=$1 WHERE id=$2', [nombre.slice(0, 120), admin.id]).catch(function() {});
  }
  if (unidad && !String(admin.unidad || '').trim()) {
    admin.unidad = unidad;
    await pool.query('UPDATE admins SET unidad=$1 WHERE id=$2', [unidad.slice(0, 150), admin.id]).catch(function() {});
  }
  admin._nomina = nomina;
  return admin;
}

async function buscarNominaParaAcceso(pool, cip) {
  const cipNorm = normalizarCipLogin(cip);
  if (!cipNorm) return null;
  const r = await pool.query(
    `SELECT cip, apellidos_nombres, unidad_nombre, division_nombre, situacion, grado
     FROM personal_rrhh
     WHERE regexp_replace(COALESCE(cip,''), '\\D', '', 'g') = $1
     LIMIT 1`,
    [cipNorm]
  );
  return r.rows[0] || null;
}

function nominaPermiteAcceso(row) {
  if (!row) return { ok: false, error: 'CIP no encontrado en nómina. No autorizado.' };
  const sit = String(row.situacion || '').trim().toUpperCase();
  if (sit === 'BAJA') return { ok: false, error: 'CIP en situación de baja. Acceso denegado.' };
  if (sit && sit !== 'ACTIVO' && sit !== 'VACACIONES' && sit !== 'CURSO') {
    // SUSPENSION / OTRO: denegar por defecto
    if (sit === 'SUSPENSION') return { ok: false, error: 'CIP en suspensión. Acceso denegado.' };
  }
  return { ok: true, nomina: row };
}

/**
 * Autentica admin. Exige cuenta activa en admins.
 * Si el usuario es CIP (o tiene cip), valida nómina.
 */
async function autenticarAdmin(pool, usuarioRaw, password) {
  const usuarioIn = String(usuarioRaw || '').trim();
  const cipIn = normalizarCipLogin(usuarioIn);
  let admin = null;

  if (cipIn) {
    const r = await pool.query(
      `SELECT * FROM admins
       WHERE COALESCE(activo, TRUE) = TRUE
         AND (
           regexp_replace(COALESCE(cip,''), '\\D', '', 'g') = $1
           OR regexp_replace(COALESCE(usuario,''), '\\D', '', 'g') = $1
         )
       LIMIT 1`,
      [cipIn]
    );
    admin = r.rows[0] || null;
  } else {
    // Cuentas legadas (nombre de oficina): solo si siguen activas
    const r = await pool.query(
      `SELECT * FROM admins WHERE usuario=$1 AND COALESCE(activo,TRUE)=TRUE LIMIT 1`,
      [usuarioIn]
    );
    admin = r.rows[0] || null;
  }

  if (!admin) {
    return { ok: false, error: 'Credenciales incorrectas o usuario no autorizado.' };
  }

  const passOk = await verifyPassword(password, admin.passhash);
  if (!passOk) {
    return { ok: false, error: 'Credenciales incorrectas o usuario no autorizado.' };
  }

  const cipAdmin = normalizarCipLogin(admin.cip || admin.usuario) || cipIn;
  if (cipAdmin) {
    const nomina = await buscarNominaParaAcceso(pool, cipAdmin);
    const check = nominaPermiteAcceso(nomina);
    if (!check.ok) {
      // Super Admin: solo si aún no existe en nómina (arranque); si está de baja, denegar
      if (!(admin.rol === 'unitic' && !nomina)) {
        return { ok: false, error: check.error, admin: admin };
      }
    } else {
      if (!admin.nombre && check.nomina.apellidos_nombres) {
        admin.nombre = check.nomina.apellidos_nombres;
      }
      if (!admin.unidad && check.nomina.unidad_nombre) {
        admin.unidad = check.nomina.unidad_nombre;
      }
      admin._nomina = check.nomina;
    }
  } else if (process.env.ADMIN_ALLOW_LEGACY === '0') {
    // Sin CIP y legado desactivado: bloquear
    return {
      ok: false,
      error: 'Esta cuenta no tiene CIP vinculado. Solicite alta con CIP al Super Admin.'
    };
  }

  const debeCambiar = passwordVencida(admin);
  return {
    ok: true,
    admin: admin,
    debe_cambiar_password: debeCambiar,
    password_vencida: !admin.debe_cambiar_password && debeCambiar
  };
}

async function cambiarPasswordAdmin(pool, adminId, passwordActual, passwordNueva) {
  const r = await pool.query('SELECT * FROM admins WHERE id=$1 AND COALESCE(activo,TRUE)=TRUE', [adminId]);
  if (!r.rows.length) return { ok: false, error: 'Usuario no encontrado.' };
  const admin = r.rows[0];
  const okActual = await verifyPassword(passwordActual, admin.passhash);
  if (!okActual) return { ok: false, error: 'Contraseña actual incorrecta.' };
  const pol = validarPoliticaPassword(passwordNueva);
  if (!pol.ok) return pol;
  if (passwordNueva === passwordActual) {
    return { ok: false, error: 'La nueva contraseña debe ser distinta a la actual.' };
  }
  const hash = await hashPassword(passwordNueva);
  await pool.query(
    `UPDATE admins
        SET passhash=$1,
            debe_cambiar_password=FALSE,
            password_changed_at=NOW()
      WHERE id=$2`,
    [hash, adminId]
  );
  return { ok: true, admin: admin };
}

function publicAdmin(admin) {
  if (!admin) return null;
  return {
    id: admin.id,
    usuario: admin.usuario,
    cip: admin.cip || (esUsuarioTipoCip(admin.usuario) ? admin.usuario : ''),
    rol: admin.rol,
    nombre: admin.nombre || '',
    unidad: admin.unidad || '',
    permisos: admin.permisos,
    activo: admin.activo !== false,
    debe_cambiar_password: !!admin.debe_cambiar_password,
    password_changed_at: admin.password_changed_at || null
  };
}

module.exports = {
  PASSWORD_MAX_AGE_DAYS,
  PASSWORD_MIN_LEN,
  sha256,
  normalizarCipLogin,
  esUsuarioTipoCip,
  validarPoliticaPassword,
  hashPassword,
  verifyPassword,
  passwordVencida,
  initAuthTablas,
  bootstrapSuperAdminSiFalta,
  registrarAuditoria,
  buscarNominaParaAcceso,
  nominaPermiteAcceso,
  autenticarAdmin,
  cambiarPasswordAdmin,
  sincronizarAdminDesdeNomina,
  publicAdmin
};
