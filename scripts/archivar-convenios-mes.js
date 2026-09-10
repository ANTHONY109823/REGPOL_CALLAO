/**
 * Empaqueta convenios de meses anteriores en Auditoría CIP
 * y vacía preinscritos / ganadores / repechaje. Conserva la carpeta web.
 *
 *   node scripts/archivar-convenios-mes.js
 */
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const conveniosFlujo = require('../convenios_flujo');

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

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

(async () => {
  if (!process.env.DATABASE_URL) {
    console.error('Sin DATABASE_URL');
    process.exit(1);
  }
  const antes = await pool.query(
    `SELECT to_char(timezone('America/Lima', COALESCE(n.fecha::timestamptz, NOW())), 'YYYY-MM') AS mes,
            COUNT(*)::int AS n
     FROM inscripciones n
     JOIN items_portal i ON i.id = n.item_id
     WHERE i.tipo = 'convenio'
     GROUP BY 1
     ORDER BY 1`
  );
  console.log('Antes (inscripciones convenio por mes):', JSON.stringify(antes.rows));

  await conveniosFlujo.initTablasAuditoriaConvenios(pool);
  const r = await conveniosFlujo.archivarMesesAnteriores(pool);
  console.log('Resultado archivo:', JSON.stringify({
    ok: r.ok,
    mes_actual: r.mes_actual,
    meses: r.meses,
    total_registros: r.total_registros,
    sorteos: r.sorteos,
    resultados_pdf: r.resultados_pdf
  }));

  const despues = await pool.query(
    `SELECT COUNT(*)::int AS n FROM inscripciones n
     JOIN items_portal i ON i.id = n.item_id
     WHERE i.tipo = 'convenio'`
  );
  const web = await pool.query(
    `SELECT COUNT(*)::int AS n FROM items_portal WHERE tipo='convenio' AND visible=TRUE`
  );
  const packs = await pool.query(
    `SELECT mes, titulo, total_registros FROM convenios_auditoria_paquetes ORDER BY mes`
  );
  console.log('Inscripciones convenio vivas:', despues.rows[0].n);
  console.log('Convenios web visibles:', web.rows[0].n);
  console.log('Paquetes auditoría:', JSON.stringify(packs.rows));
  await pool.end();
})().catch(function(e) {
  console.error(e);
  process.exit(1);
});
