/*
  Módulo Vacantes Libres del mes — REGPOL Callao
  Bolsa independiente de vacantes que se liberaron en el mes (dejó de asistir, etc.).
  - NO se vincula ni se cuenta con inscripciones / preinscritos / ganadores / repechaje.
  - Las vacantes las carga a mano el Admin de Convenios o el Super Admin.
  - El postulante envía su documento; al aprobarlo ocupa una vacante de inmediato.
  - Único cruce (solo lectura): quien ya es ganador y presentó expediente este mes no puede postular.
*/

const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO',
  'AGOSTO', 'SETIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
const ESTADOS_SOLICITUD = ['pendiente', 'aprobado', 'rechazado'];
const PDF_MAX_BYTES = 5 * 1024 * 1024;
/* Ganador que ya presentó documentos en el flujo normal de convenios */
const ESTADOS_GANADOR_CON_EXPEDIENTE = ['en_revision', 'observado', 'expediente_ok'];

function normalizarPermisos(permisos) {
  if (Array.isArray(permisos)) return permisos;
  if (typeof permisos === 'string') {
    try { return JSON.parse(permisos); } catch (e) { return []; }
  }
  return [];
}

function puedeVacantesLibres(admin) {
  if (!admin) return false;
  if (admin.rol === 'unitic') return true;
  return normalizarPermisos(admin.permisos).includes('cms_convenios');
}

function requireVacantesLibres(req, res, next) {
  if (!puedeVacantesLibres(req.admin)) {
    return res.status(403).json({ ok: false, error: 'Sin permiso de Vacantes libres' });
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

function mesActualLima() {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima', year: 'numeric', month: '2-digit'
  }).formatToParts(new Date());
  const y = p.find(function(x) { return x.type === 'year'; }).value;
  const m = p.find(function(x) { return x.type === 'month'; }).value;
  return y + '-' + m;
}

function mesValido(v) {
  const s = String(v || '').trim();
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s) ? s : '';
}

function nombreMes(mes) {
  const n = parseInt(String(mes || '').slice(5, 7), 10);
  return MESES[n - 1] || '';
}

function nombreAdmin(admin) {
  return limpio((admin && (admin.nombre || admin.usuario)) || '', 60);
}

async function initTablasVacantesLibres(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vacantes_libres_config (
      mes            VARCHAR(7) PRIMARY KEY,
      activo         BOOLEAN NOT NULL DEFAULT FALSE,
      actualizado_por VARCHAR(60) DEFAULT '',
      actualizado_en TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS vacantes_libres (
      id             SERIAL PRIMARY KEY,
      mes            VARCHAR(7) NOT NULL,
      convenio       VARCHAR(200) NOT NULL DEFAULT '',
      sede           VARCHAR(200) DEFAULT '',
      turno          VARCHAR(60) DEFAULT '',
      dia            VARCHAR(20) DEFAULT '',
      vacantes       INTEGER NOT NULL DEFAULT 0,
      orden          INTEGER DEFAULT 0,
      creado_por     VARCHAR(60) DEFAULT '',
      creado_en      TIMESTAMPTZ DEFAULT NOW(),
      actualizado_en TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_vacantes_libres_mes ON vacantes_libres(mes);
    CREATE TABLE IF NOT EXISTS vacantes_libres_solicitudes (
      id             SERIAL PRIMARY KEY,
      nro            VARCHAR(30) UNIQUE NOT NULL,
      mes            VARCHAR(7) NOT NULL,
      vacante_id     INTEGER NOT NULL REFERENCES vacantes_libres(id) ON DELETE RESTRICT,
      cip            VARCHAR(12) NOT NULL,
      dni            VARCHAR(12) DEFAULT '',
      codifin        VARCHAR(12) DEFAULT '',
      grado          VARCHAR(60) DEFAULT '',
      apellidos      VARCHAR(120) DEFAULT '',
      nombres        VARCHAR(120) DEFAULT '',
      telefono       VARCHAR(30) DEFAULT '',
      unidad         VARCHAR(150) DEFAULT '',
      pdf_data       TEXT DEFAULT '',
      pdf_nombre     VARCHAR(200) DEFAULT '',
      estado         VARCHAR(20) NOT NULL DEFAULT 'pendiente',
      motivo_rechazo TEXT DEFAULT '',
      revisado_por   VARCHAR(60) DEFAULT '',
      revisado_en    TIMESTAMPTZ,
      creado_en      TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_vl_sol_mes ON vacantes_libres_solicitudes(mes);
    CREATE INDEX IF NOT EXISTS idx_vl_sol_cip ON vacantes_libres_solicitudes(cip);
    CREATE INDEX IF NOT EXISTS idx_vl_sol_vacante ON vacantes_libres_solicitudes(vacante_id);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_vl_sol_cip_mes_activa
      ON vacantes_libres_solicitudes(mes, cip) WHERE estado IN ('pendiente','aprobado');
  `);
}

async function estaActivo(pool, mes) {
  const r = await pool.query('SELECT activo FROM vacantes_libres_config WHERE mes=$1', [mes]);
  return !!(r.rows[0] && r.rows[0].activo);
}

/** Vacantes del mes con sus contadores propios (solo solicitudes de este módulo). */
async function listarVacantesMes(pool, mes) {
  const r = await pool.query(
    `SELECT v.id, v.mes, v.convenio, v.sede, v.turno, v.dia, v.vacantes, v.orden,
            COALESCE(SUM(CASE WHEN s.estado='aprobado' THEN 1 ELSE 0 END),0)::int AS aprobadas,
            COALESCE(SUM(CASE WHEN s.estado='pendiente' THEN 1 ELSE 0 END),0)::int AS pendientes
     FROM vacantes_libres v
     LEFT JOIN vacantes_libres_solicitudes s ON s.vacante_id = v.id
     WHERE v.mes=$1
     GROUP BY v.id
     ORDER BY v.orden ASC, v.convenio ASC, v.sede ASC, v.turno ASC, v.dia ASC, v.id ASC`,
    [mes]
  );
  return r.rows.map(function(v) {
    v.libres = Math.max(0, (parseInt(v.vacantes, 10) || 0) - v.aprobadas);
    return v;
  });
}

function filaVacanteDesdeBody(b) {
  const vac = parseInt(b && b.vacantes, 10);
  return {
    convenio: limpio(b && b.convenio, 200),
    sede: limpio(b && b.sede, 200),
    turno: limpio(b && b.turno, 60).toUpperCase(),
    dia: limpio(b && b.dia, 20).toUpperCase(),
    vacantes: isNaN(vac) ? -1 : vac
  };
}

function errorFilaVacante(f) {
  if (!f.convenio) return 'Indique el convenio.';
  if (f.vacantes < 1 || f.vacantes > 999) return 'El N° de vacantes debe ser entre 1 y 999.';
  return '';
}

async function siguienteNro(client, mes) {
  const r = await client.query(
    'SELECT COUNT(*)::int AS n FROM vacantes_libres_solicitudes WHERE mes=$1', [mes]
  );
  return 'VL-' + mes.replace('-', '') + '-' + String(r.rows[0].n + 1).padStart(4, '0');
}

function solicitudPublica(s) {
  return {
    id: s.id,
    nro: s.nro,
    mes: s.mes,
    vacante_id: s.vacante_id,
    convenio: s.convenio || '',
    sede: s.sede || '',
    turno: s.turno || '',
    dia: s.dia || '',
    cip: s.cip,
    dni: s.dni,
    codifin: s.codifin,
    grado: s.grado,
    apellidos: s.apellidos,
    nombres: s.nombres,
    telefono: s.telefono,
    unidad: s.unidad,
    pdf_nombre: s.pdf_nombre || '',
    tiene_pdf: !!s.tiene_pdf,
    estado: s.estado,
    motivo_rechazo: s.motivo_rechazo || '',
    revisado_por: s.revisado_por || '',
    revisado_en: s.revisado_en,
    creado_en: s.creado_en
  };
}

function registrarRutas(app, pool, requireAuth) {
  // ── Público ────────────────────────────────────────────────────────────────
  app.get('/portal/vacantes-libres', async function(req, res) {
    try {
      const mes = mesActualLima();
      const activo = await estaActivo(pool, mes);
      const vacantes = activo ? await listarVacantesMes(pool, mes) : [];
      res.setHeader('Cache-Control', 'no-store');
      res.json({
        ok: true,
        mes: mes,
        mes_nombre: nombreMes(mes),
        activo: activo && vacantes.length > 0,
        vacantes: vacantes.map(function(v) {
          return {
            id: v.id, convenio: v.convenio, sede: v.sede, turno: v.turno, dia: v.dia,
            vacantes: v.vacantes, libres: v.libres
          };
        })
      });
    } catch (e) {
      res.json({ ok: false, error: e.message });
    }
  });

  app.get('/portal/vacantes-libres/consulta/:cip', async function(req, res) {
    try {
      const cip = soloDigitos(req.params.cip);
      if (cip.length < 6 || cip.length > 12) return res.json({ ok: false, error: 'CIP inválido.' });
      const r = await pool.query(
        `SELECT s.nro, s.estado, s.motivo_rechazo, s.creado_en, s.revisado_en,
                v.convenio, v.sede, v.turno, v.dia
         FROM vacantes_libres_solicitudes s
         JOIN vacantes_libres v ON v.id = s.vacante_id
         WHERE s.cip=$1 AND s.mes=$2
         ORDER BY s.creado_en DESC`,
        [cip, mesActualLima()]
      );
      res.json({ ok: true, solicitudes: r.rows });
    } catch (e) {
      res.json({ ok: false, error: e.message });
    }
  });

  app.post('/portal/vacantes-libres/:id/postular', async function(req, res) {
    const client = await pool.connect();
    try {
      const id = parseInt(req.params.id, 10);
      const b = req.body || {};
      const mes = mesActualLima();
      const cip = soloDigitos(b.cip);
      const dni = soloDigitos(b.dni);
      const codifin = soloDigitos(b.codifin);
      const telefono = soloDigitos(b.telefono);
      const grado = limpio(b.grado, 60).toUpperCase();
      const apellidos = limpio(b.apellidos, 120).toUpperCase();
      const nombres = limpio(b.nombres, 120).toUpperCase();
      const unidad = limpio(b.unidad, 150).toUpperCase();
      const pdfData = String(b.pdf_data || '');
      const pdfNombre = limpio(b.pdf_nombre, 200) || 'documento.pdf';

      if (!id) return res.json({ ok: false, error: 'Vacante no válida.' });
      if (cip.length < 6 || cip.length > 12) return res.json({ ok: false, error: 'CIP inválido.' });
      if (dni.length < 8) return res.json({ ok: false, error: 'DNI obligatorio (mínimo 8 dígitos).' });
      if (!/^\d{9}$/.test(codifin)) return res.json({ ok: false, error: 'CODIFIN debe tener exactamente 9 dígitos numéricos.' });
      if (telefono.length < 9) return res.json({ ok: false, error: 'Teléfono/WhatsApp obligatorio (9 dígitos).' });
      if (!grado) return res.json({ ok: false, error: 'Seleccione su grado.' });
      if (!apellidos || !nombres) return res.json({ ok: false, error: 'Apellidos y nombres son obligatorios.' });
      if (!unidad) return res.json({ ok: false, error: 'Indique su unidad / dependencia actual.' });
      if (pdfData.indexOf('data:application/pdf;base64,') !== 0) {
        return res.json({ ok: false, error: 'Adjunte su documento en PDF.' });
      }
      if (Math.floor((pdfData.length - 28) * 3 / 4) > PDF_MAX_BYTES) {
        return res.json({ ok: false, error: 'El PDF no debe superar 5 MB.' });
      }

      if (!(await estaActivo(pool, mes))) {
        return res.json({ ok: false, error: 'Las vacantes libres no están habilitadas en este momento.' });
      }

      /* Solo lectura del flujo normal: ganador que ya presentó documentos este mes */
      const gan = await pool.query(
        `SELECT 1 FROM inscripciones
         WHERE regexp_replace(COALESCE(cip,''), '\\D', '', 'g') = $1
           AND (estado = ANY($2::varchar[])
                OR (estado='ganador' AND COALESCE(pdf_requisitos,'')<>'' AND pdf_requisitos NOT LIKE 'purged%'))
           AND to_char(timezone('America/Lima', COALESCE(fecha::timestamptz, NOW())), 'YYYY-MM') = $3
         LIMIT 1`,
        [cip, ESTADOS_GANADOR_CON_EXPEDIENTE, mes]
      );
      if (gan.rows.length) {
        return res.json({
          ok: false,
          error: 'Usted ya resultó ganador de un cupo y presentó sus documentos este mes. No puede postular a vacantes libres.'
        });
      }

      await client.query('BEGIN');
      const vr = await client.query(
        'SELECT * FROM vacantes_libres WHERE id=$1 AND mes=$2 FOR UPDATE', [id, mes]
      );
      if (!vr.rows.length) {
        await client.query('ROLLBACK');
        return res.json({ ok: false, error: 'La vacante ya no está disponible.' });
      }
      const v = vr.rows[0];
      const ap = await client.query(
        `SELECT COUNT(*)::int AS n FROM vacantes_libres_solicitudes WHERE vacante_id=$1 AND estado='aprobado'`,
        [id]
      );
      if (ap.rows[0].n >= v.vacantes) {
        await client.query('ROLLBACK');
        return res.json({ ok: false, error: 'Esta vacante ya fue cubierta.' });
      }
      const dup = await client.query(
        `SELECT nro FROM vacantes_libres_solicitudes
         WHERE mes=$1 AND cip=$2 AND estado IN ('pendiente','aprobado') LIMIT 1`,
        [mes, cip]
      );
      if (dup.rows.length) {
        await client.query('ROLLBACK');
        return res.json({
          ok: false,
          error: 'Ya tiene una solicitud de vacante libre este mes (N° ' + dup.rows[0].nro + '). Solo se permite una por mes.'
        });
      }
      const nro = await siguienteNro(client, mes);
      const ins = await client.query(
        `INSERT INTO vacantes_libres_solicitudes
           (nro, mes, vacante_id, cip, dni, codifin, grado, apellidos, nombres, telefono, unidad, pdf_data, pdf_nombre)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING id, nro, creado_en`,
        [nro, mes, id, cip, dni, codifin, grado, apellidos, nombres, telefono, unidad, pdfData, pdfNombre]
      );
      await client.query('COMMIT');
      res.json({
        ok: true,
        solicitud: {
          nro: ins.rows[0].nro,
          creado_en: ins.rows[0].creado_en,
          cip: cip, grado: grado, apellidos: apellidos, nombres: nombres,
          convenio: v.convenio, sede: v.sede, turno: v.turno, dia: v.dia,
          mes_nombre: nombreMes(mes)
        }
      });
    } catch (e) {
      await client.query('ROLLBACK').catch(function() {});
      if (e && e.code === '23505') {
        return res.json({ ok: false, error: 'Ya tiene una solicitud de vacante libre este mes.' });
      }
      res.json({ ok: false, error: e.message });
    } finally {
      client.release();
    }
  });

  // ── Admin (Convenios / Super Admin) ─────────────────────────────────────────
  app.get('/admin/vacantes-libres', requireAuth, requireVacantesLibres, async function(req, res) {
    try {
      const mes = mesValido(req.query.mes) || mesActualLima();
      const [activo, vacantes, meses] = await Promise.all([
        estaActivo(pool, mes),
        listarVacantesMes(pool, mes),
        pool.query(
          `SELECT mes FROM vacantes_libres GROUP BY mes
           UNION SELECT mes FROM vacantes_libres_config
           ORDER BY 1 DESC LIMIT 24`
        )
      ]);
      res.json({
        ok: true,
        mes: mes,
        mes_nombre: nombreMes(mes),
        mes_actual: mesActualLima(),
        activo: activo,
        vacantes: vacantes,
        meses: meses.rows.map(function(r) { return r.mes; })
      });
    } catch (e) {
      res.json({ ok: false, error: e.message });
    }
  });

  app.post('/admin/vacantes-libres/estado', requireAuth, requireVacantesLibres, async function(req, res) {
    try {
      const mes = mesActualLima();
      const activo = !!(req.body && req.body.activo);
      await pool.query(
        `INSERT INTO vacantes_libres_config (mes, activo, actualizado_por, actualizado_en)
         VALUES ($1,$2,$3,NOW())
         ON CONFLICT (mes) DO UPDATE SET activo=EXCLUDED.activo,
           actualizado_por=EXCLUDED.actualizado_por, actualizado_en=NOW()`,
        [mes, activo, nombreAdmin(req.admin)]
      );
      res.json({ ok: true, mes: mes, activo: activo });
    } catch (e) {
      res.json({ ok: false, error: e.message });
    }
  });

  /* Nombres de convenios, sedes, turnos y días para precargar (sin números). */
  app.get('/admin/vacantes-libres/ayuda-carga', requireAuth, requireVacantesLibres, async function(req, res) {
    try {
      const r = await pool.query(
        `SELECT id, titulo, cupos_unidades FROM items_portal
         WHERE tipo='convenio' ORDER BY titulo ASC`
      );
      const convenios = r.rows.map(function(it) {
        const cupos = Array.isArray(it.cupos_unidades) ? it.cupos_unidades : [];
        const filas = [];
        cupos.forEach(function(c) {
          const sede = limpio(c && (c.nombre || c.unidad || c.comisaria), 200);
          const turnos = Array.isArray(c && c.turnos) ? c.turnos : [];
          if (!turnos.length) {
            if (sede) filas.push({ sede: sede, turno: '', dia: '' });
            return;
          }
          turnos.forEach(function(t) {
            filas.push({
              sede: sede,
              turno: limpio(t && t.turno, 60).toUpperCase(),
              dia: limpio(t && t.dia, 20).toUpperCase()
            });
          });
        });
        return { id: it.id, titulo: limpio(it.titulo, 200), filas: filas };
      }).filter(function(c) { return c.titulo; });
      res.json({ ok: true, convenios: convenios });
    } catch (e) {
      res.json({ ok: false, error: e.message });
    }
  });

  /* Crea una o varias filas del mes actual: { filas: [{convenio, sede, turno, dia, vacantes}] } */
  app.post('/admin/vacantes-libres', requireAuth, requireVacantesLibres, async function(req, res) {
    const client = await pool.connect();
    try {
      const mes = mesActualLima();
      const raw = Array.isArray(req.body && req.body.filas) ? req.body.filas : [req.body || {}];
      const filas = raw.map(filaVacanteDesdeBody);
      if (!filas.length) return res.json({ ok: false, error: 'No hay filas para guardar.' });
      for (let i = 0; i < filas.length; i++) {
        const err = errorFilaVacante(filas[i]);
        if (err) return res.json({ ok: false, error: (filas.length > 1 ? 'Fila ' + (i + 1) + ': ' : '') + err });
      }
      await client.query('BEGIN');
      const quien = nombreAdmin(req.admin);
      for (const f of filas) {
        await client.query(
          `INSERT INTO vacantes_libres (mes, convenio, sede, turno, dia, vacantes, creado_por)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [mes, f.convenio, f.sede, f.turno, f.dia, f.vacantes, quien]
        );
      }
      await client.query('COMMIT');
      res.json({ ok: true, creadas: filas.length });
    } catch (e) {
      await client.query('ROLLBACK').catch(function() {});
      res.json({ ok: false, error: e.message });
    } finally {
      client.release();
    }
  });

  app.put('/admin/vacantes-libres/:id', requireAuth, requireVacantesLibres, async function(req, res) {
    try {
      const id = parseInt(req.params.id, 10);
      const f = filaVacanteDesdeBody(req.body || {});
      const err = errorFilaVacante(f);
      if (err) return res.json({ ok: false, error: err });
      const ap = await pool.query(
        `SELECT COUNT(*)::int AS n FROM vacantes_libres_solicitudes WHERE vacante_id=$1 AND estado='aprobado'`,
        [id]
      );
      if (f.vacantes < ap.rows[0].n) {
        return res.json({ ok: false, error: 'Ya hay ' + ap.rows[0].n + ' aprobado(s): el N° de vacantes no puede ser menor.' });
      }
      const r = await pool.query(
        `UPDATE vacantes_libres SET convenio=$2, sede=$3, turno=$4, dia=$5, vacantes=$6, actualizado_en=NOW()
         WHERE id=$1 RETURNING id`,
        [id, f.convenio, f.sede, f.turno, f.dia, f.vacantes]
      );
      if (!r.rows.length) return res.json({ ok: false, error: 'No encontrada.' });
      res.json({ ok: true });
    } catch (e) {
      res.json({ ok: false, error: e.message });
    }
  });

  app.delete('/admin/vacantes-libres/:id', requireAuth, requireVacantesLibres, async function(req, res) {
    try {
      const id = parseInt(req.params.id, 10);
      const s = await pool.query(
        'SELECT COUNT(*)::int AS n FROM vacantes_libres_solicitudes WHERE vacante_id=$1', [id]
      );
      if (s.rows[0].n > 0) {
        return res.json({ ok: false, error: 'Esta vacante tiene ' + s.rows[0].n + ' solicitud(es). Rechácelas o ajuste el N° de vacantes en lugar de eliminarla.' });
      }
      await pool.query('DELETE FROM vacantes_libres WHERE id=$1', [id]);
      res.json({ ok: true });
    } catch (e) {
      res.json({ ok: false, error: e.message });
    }
  });

  app.get('/admin/vacantes-libres/solicitudes', requireAuth, requireVacantesLibres, async function(req, res) {
    try {
      const mes = mesValido(req.query.mes) || mesActualLima();
      const estado = ESTADOS_SOLICITUD.indexOf(req.query.estado) >= 0 ? req.query.estado : '';
      const params = [mes];
      let where = 's.mes=$1';
      if (estado) { params.push(estado); where += ' AND s.estado=$2'; }
      const r = await pool.query(
        `SELECT s.id, s.nro, s.mes, s.vacante_id, s.cip, s.dni, s.codifin, s.grado, s.apellidos, s.nombres,
                s.telefono, s.unidad, s.pdf_nombre, s.estado, s.motivo_rechazo, s.revisado_por,
                s.revisado_en, s.creado_en,
                (COALESCE(s.pdf_data,'')<>'') AS tiene_pdf,
                v.convenio, v.sede, v.turno, v.dia
         FROM vacantes_libres_solicitudes s
         JOIN vacantes_libres v ON v.id = s.vacante_id
         WHERE ${where}
         ORDER BY CASE s.estado WHEN 'pendiente' THEN 0 WHEN 'aprobado' THEN 1 ELSE 2 END, s.creado_en ASC`,
        params
      );
      res.json({ ok: true, mes: mes, solicitudes: r.rows.map(solicitudPublica) });
    } catch (e) {
      res.json({ ok: false, error: e.message });
    }
  });

  app.get('/admin/vacantes-libres/solicitudes/:id/pdf', requireAuth, requireVacantesLibres, async function(req, res) {
    try {
      const r = await pool.query(
        'SELECT pdf_data, pdf_nombre FROM vacantes_libres_solicitudes WHERE id=$1',
        [parseInt(req.params.id, 10)]
      );
      if (!r.rows.length || !r.rows[0].pdf_data) return res.json({ ok: false, error: 'No hay PDF.' });
      res.json({ ok: true, pdf_data: r.rows[0].pdf_data, pdf_nombre: r.rows[0].pdf_nombre });
    } catch (e) {
      res.json({ ok: false, error: e.message });
    }
  });

  app.post('/admin/vacantes-libres/solicitudes/:id/aprobar', requireAuth, requireVacantesLibres, async function(req, res) {
    const client = await pool.connect();
    try {
      const id = parseInt(req.params.id, 10);
      await client.query('BEGIN');
      const sr = await client.query(
        'SELECT * FROM vacantes_libres_solicitudes WHERE id=$1 FOR UPDATE', [id]
      );
      if (!sr.rows.length) { await client.query('ROLLBACK'); return res.json({ ok: false, error: 'No encontrada.' }); }
      const s = sr.rows[0];
      if (s.estado === 'aprobado') { await client.query('ROLLBACK'); return res.json({ ok: false, error: 'Ya estaba aprobada.' }); }
      const vr = await client.query('SELECT * FROM vacantes_libres WHERE id=$1 FOR UPDATE', [s.vacante_id]);
      const ap = await client.query(
        `SELECT COUNT(*)::int AS n FROM vacantes_libres_solicitudes WHERE vacante_id=$1 AND estado='aprobado'`,
        [s.vacante_id]
      );
      if (!vr.rows.length || ap.rows[0].n >= vr.rows[0].vacantes) {
        await client.query('ROLLBACK');
        return res.json({ ok: false, error: 'No quedan vacantes libres en esa fila. Aumente el N° de vacantes o rechace la solicitud.' });
      }
      const otra = await client.query(
        `SELECT nro FROM vacantes_libres_solicitudes
         WHERE mes=$1 AND cip=$2 AND id<>$3 AND estado IN ('pendiente','aprobado') LIMIT 1`,
        [s.mes, s.cip, id]
      );
      if (otra.rows.length) {
        await client.query('ROLLBACK');
        return res.json({ ok: false, error: 'Este CIP ya tiene otra solicitud activa (N° ' + otra.rows[0].nro + ').' });
      }
      await client.query(
        `UPDATE vacantes_libres_solicitudes
         SET estado='aprobado', motivo_rechazo='', revisado_por=$2, revisado_en=NOW() WHERE id=$1`,
        [id, nombreAdmin(req.admin)]
      );
      await client.query('COMMIT');
      res.json({ ok: true });
    } catch (e) {
      await client.query('ROLLBACK').catch(function() {});
      res.json({ ok: false, error: e.message });
    } finally {
      client.release();
    }
  });

  app.post('/admin/vacantes-libres/solicitudes/:id/rechazar', requireAuth, requireVacantesLibres, async function(req, res) {
    try {
      const id = parseInt(req.params.id, 10);
      const motivo = limpio(req.body && req.body.motivo, 500);
      if (!motivo) return res.json({ ok: false, error: 'Indique el motivo del rechazo.' });
      const r = await pool.query(
        `UPDATE vacantes_libres_solicitudes
         SET estado='rechazado', motivo_rechazo=$2, revisado_por=$3, revisado_en=NOW()
         WHERE id=$1 RETURNING id`,
        [id, motivo, nombreAdmin(req.admin)]
      );
      if (!r.rows.length) return res.json({ ok: false, error: 'No encontrada.' });
      res.json({ ok: true });
    } catch (e) {
      res.json({ ok: false, error: e.message });
    }
  });
}

module.exports = {
  initTablasVacantesLibres,
  registrarRutas,
  mesActualLima,
  nombreMes
};
