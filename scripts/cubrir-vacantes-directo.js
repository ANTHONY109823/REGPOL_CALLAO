/**
 * Pasa a ganador vacaciones pendientes y turnos con vacantes no cubiertas.
 *   railway run --service REGPOL_CALLAO -- node scripts/cubrir-vacantes-directo.js
 *   railway run --service REGPOL_CALLAO -- node scripts/cubrir-vacantes-directo.js --confirm
 */
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const promo = require('../promover_vacantes_directo');

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

const APPLY = process.argv.includes('--confirm');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

function lineaDetalle(d) {
  const tipo = d.tipo === 'vacaciones' ? 'VACACIONES' : 'VACANTE NO CUBIERTA';
  return '    - [' + tipo + '] ' + (d.slot || '—') + ': ' + d.n;
}

(async function() {
  if (!process.env.DATABASE_URL) {
    console.error('Sin DATABASE_URL');
    process.exit(1);
  }
  const mes = await pool.query(`SELECT to_char(timezone('America/Lima', NOW()), 'YYYY-MM') AS mes`);
  console.log('Mes Lima:', mes.rows[0].mes, APPLY ? 'APLICAR' : 'SOLO LECTURA');
  const r = await promo.promoverTodosConveniosMes(pool, { apply: APPLY });
  if (!r.convenios.length) {
    console.log('Nada por pasar a ganador (vacaciones pendientes o vacantes no cubiertas).');
  } else {
    r.convenios.forEach(function(c) {
      console.log('');
      console.log(c.titulo + ' → ganadores ' + c.ganadores + ' (vacaciones ' + c.vacaciones + ' + directo ' + c.directo + ')');
      (c.detalle || []).forEach(function(d) { console.log(lineaDetalle(d)); });
    });
    console.log('');
    console.log('TOTAL', r.ganadores, '| vacaciones', r.vacaciones, '| vacante no cubierta', r.directo, APPLY ? '| APLICADO' : '| dry-run');
  }
  await pool.end();
})().catch(function(e) {
  console.error(e);
  process.exit(1);
});
