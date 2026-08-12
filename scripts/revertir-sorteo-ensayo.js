/**
 * Revierte ganadores/reservas de un convenio a preinscrito tras un ensayo fallido
 * (si se usó sorteo REAL por error).
 *
 * Uso:
 *   node scripts/revertir-sorteo-ensayo.js <item_id>
 *   node scripts/revertir-sorteo-ensayo.js 15 --confirm
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

const itemId = parseInt(process.argv[2], 10);
const confirm = process.argv.includes('--confirm');

if (!itemId) {
  console.error('Uso: node scripts/revertir-sorteo-ensayo.js <item_id> [--confirm]');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

(async () => {
  const st = await pool.query(
    `SELECT estado, COUNT(*)::int AS n FROM inscripciones WHERE item_id=$1 GROUP BY estado ORDER BY n DESC`,
    [itemId]
  );
  console.log('Estados actuales item', itemId, st.rows);
  if (!confirm) {
    console.log('Dry-run. Agregue --confirm para revertir ganador/reserva → preinscrito.');
    await pool.end();
    return;
  }
  const r = await pool.query(
    `UPDATE inscripciones SET
       estado='preinscrito',
       observacion='',
       modo_ingreso=NULL,
       fecha_ganador=NULL,
       plazo_expediente=NULL,
       bloque_vacaciones=COALESCE(bloque_vacaciones, '')
     WHERE item_id=$1 AND estado IN ('ganador','reserva')
     RETURNING id, cip, nro_registro`,
    [itemId]
  );
  console.log('Revertidos:', r.rows.length);
  r.rows.forEach(function(row) {
    console.log(' ', row.id, row.cip, row.nro_registro);
  });
  await pool.end();
})().catch(function(e) {
  console.error(e);
  process.exit(1);
});
