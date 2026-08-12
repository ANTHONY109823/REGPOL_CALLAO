/**
 * Anula inscripciones duplicadas del mismo mes (CIP/DNI/nombre),
 * conservando la de menor id (primera).
 *
 *   node scripts/limpiar-duplicados-mes.js
 *   node scripts/limpiar-duplicados-mes.js --confirm
 */
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

try {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach(function(line) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) return;
      let val = m[2];
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (m[1] && process.env[m[1]] == null) process.env[m[1]] = val;
    });
  }
} catch (e) {}

const CONFIRM = process.argv.includes('--confirm');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

(async () => {
  // Duplicados activos de convenios (mes actual Lima). Si fecha es antigua, igual se limpia
  // cualquier CIP/DNI/nombre repetido en convenios no anulados.
  const rows = await pool.query(
    `SELECT n.id, n.cip, n.dni, n.nombres, n.estado, n.nro_registro, n.item_id, i.titulo,
            LPAD(regexp_replace(COALESCE(n.cip,''), '[^0-9]', '', 'g'), 8, '0') AS cip_key,
            regexp_replace(COALESCE(n.dni,''), '[^0-9]', '', 'g') AS dni_key,
            regexp_replace(upper(trim(translate(n.nombres,
              'áéíóúàèìòùäëïöüñÁÉÍÓÚÀÈÌÒÙÄËÏÖÜÑ',
              'aeiouaeiouaeiouaeiouaeiounAEIOUAEIOUAEIOUAEIOUN'))), '[^A-Z0-9]+', ' ', 'g') AS nom_key
     FROM inscripciones n
     JOIN items_portal i ON i.id = n.item_id
     WHERE i.tipo = 'convenio'
       AND n.estado NOT IN ('anulado_solicitud')
     ORDER BY n.id ASC`
  );

  const keepByKey = {};
  const toAnular = [];

  function mark(key, row, motivo) {
    if (!key) return;
    if (!keepByKey[key]) {
      keepByKey[key] = row;
      return;
    }
    const first = keepByKey[key];
    if (row.id === first.id) return;
    toAnular.push({
      id: row.id,
      cip: row.cip,
      item_id: row.item_id,
      titulo: row.titulo,
      keep_id: first.id,
      keep_titulo: first.titulo,
      keep_nro: first.nro_registro,
      motivo: motivo
    });
  }

  rows.rows.forEach(function(r) {
    if (r.cip_key && r.cip_key !== '00000000') mark('cip:' + r.cip_key, r, 'cip');
    if (r.dni_key && r.dni_key.length >= 8) mark('dni:' + r.dni_key, r, 'dni');
    if (r.nom_key && r.nom_key.length >= 8) mark('nom:' + r.nom_key, r, 'nombres');
  });

  // Deduplicate toAnular by id
  const seen = {};
  const unique = [];
  toAnular.forEach(function(x) {
    if (seen[x.id]) return;
    seen[x.id] = true;
    unique.push(x);
  });

  console.log('Duplicados a anular:', unique.length, CONFIRM ? '(CONFIRM)' : '(dry-run)');
  unique.forEach(function(x) {
    console.log(
      'anular#' + x.id,
      x.cip,
      x.titulo,
      '-> conservar#' + x.keep_id,
      x.keep_titulo,
      '(' + x.motivo + ')'
    );
  });

  if (!CONFIRM) {
    console.log('Ejecute con --confirm para aplicar.');
    await pool.end();
    return;
  }

  for (const x of unique) {
    await pool.query(
      `UPDATE inscripciones SET
         estado = 'anulado_solicitud',
         observacion = LEFT($1, 500)
       WHERE id = $2 AND estado NOT IN ('anulado_solicitud')`,
      [
        'Anulado por duplicidad del mes: se conserva la primera inscripción N° '
          + (x.keep_nro || x.keep_id) + ' en «' + x.keep_titulo + '».',
        x.id
      ]
    );
  }
  console.log('Anulados:', unique.length);
  await pool.end();
})().catch(function(e) {
  console.error(e);
  process.exit(1);
});
