/**
 * Asigna turno a preinscritos que solo tienen el lugar (sin turno/día parseable).
 * Uso:
 *   node scripts/asignar-turnos-faltantes.js          # dry-run
 *   node scripts/asignar-turnos-faltantes.js --confirm
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

function parsePostulacionSlot(texto) {
  var s = String(texto || '').trim();
  if (!s) return { lugar: '', turno: '', dia: '' };
  if (s.indexOf('|') >= 0) {
    var p = s.split('|').map(function(x) { return String(x || '').trim(); });
    return { lugar: p[0] || '', turno: String(p[1] || '').toUpperCase(), dia: String(p[2] || '').toUpperCase() };
  }
  var m = s.match(/^(.+?)\s*[—\-]\s*([A-ZÁÉÍÓÚÑÜ]+)\s*\/\s*([A-ZÁÉÍÓÚÑÜ\/]+)\s*$/i);
  if (m) {
    return {
      lugar: String(m[1] || '').trim(),
      turno: String(m[2] || '').toUpperCase(),
      dia: String(m[3] || '').toUpperCase()
    };
  }
  return { lugar: s, turno: '', dia: '' };
}

function fmtLugarTurnoDia(lugar, turno, dia) {
  return String(lugar || '').trim() + ' — ' + turno + ' / ' + dia;
}

function fmtCelador(lugar, turno, dia) {
  return String(lugar || '').trim() + '|' + turno + '|' + dia;
}

function diaDe(row) {
  var d = String(row.dia_franco || '').trim().toUpperCase();
  if (d === 'PAR' || d === 'IMPAR') return d;
  if (String(row.disponibilidad || '').toUpperCase() === 'VACACIONES') return 'PAR/IMPAR';
  return 'PAR/IMPAR';
}

/** Alterna MAÑANA/TARDE por convenio+día para repartir cupos en la prueba. */
var contadores = {};
function turnoAlternado(itemId, dia) {
  var key = itemId + '|' + dia;
  contadores[key] = (contadores[key] || 0) + 1;
  return contadores[key] % 2 === 1 ? 'MAÑANA' : 'TARDE';
}

function decidirAsignacion(row) {
  var p = parsePostulacionSlot(row.comisaria_postula);
  if (p.turno) return null;

  var lugar = p.lugar || String(row.comisaria_postula || '').trim();
  var dia = diaDe(row);
  var itemId = row.item_id;

  // Celador: formato CIA|turno|día
  if (itemId === 1) {
    if (!/^CIA\s+/i.test(lugar)) {
      // Lugar inválido (p.ej. DIVOPUS 01): asignar CIA CALLAO para la prueba
      lugar = 'CIA CALLAO';
    }
    var turnoC = turnoAlternado(itemId, dia === 'PAR/IMPAR' ? 'VAC' : dia);
    if (dia === 'PAR/IMPAR') dia = 'PAR'; // celador slots son PAR o IMPAR
    return {
      nuevo: fmtCelador(lugar, turnoC, dia),
      motivo: 'celador'
    };
  }

  // APM-MTC: cupo publicado TARDE/IMPAR; PAR también recibe TARDE/PAR (honestidad de franco)
  if (itemId === 13) {
    var lugarApm = lugar || 'APM-MTC';
    if (dia === 'PAR/IMPAR') {
      return { nuevo: fmtLugarTurnoDia(lugarApm, 'TARDE', 'PAR/IMPAR'), motivo: 'apm-vac' };
    }
    return { nuevo: fmtLugarTurnoDia(lugarApm, 'TARDE', dia), motivo: 'apm' };
  }

  // Aeropuerto: único slot TARDE PAR/IMPAR
  if (itemId === 17) {
    var lugarAir = lugar || 'NUEVO INGRESO AEROPUERTO (BY PAS)';
    return { nuevo: fmtLugarTurnoDia(lugarAir, 'TARDE', 'PAR/IMPAR'), motivo: 'aeropuerto' };
  }

  // ATU y demás: alternar MAÑANA/TARDE según franco
  if (itemId === 15) {
    var lugarAtu = lugar || 'ATU FISCALIZACION';
    var turnoAtu = turnoAlternado(itemId, dia === 'PAR/IMPAR' ? 'VAC' : dia);
    if (dia === 'PAR/IMPAR') {
      // Vacaciones: asignar al día que toque por id par/impar para no dejar vacío
      dia = (row.id % 2 === 0) ? 'PAR' : 'IMPAR';
    }
    return { nuevo: fmtLugarTurnoDia(lugarAtu, turnoAtu, dia), motivo: 'atu' };
  }

  // Genérico
  if (!lugar) return null;
  return {
    nuevo: fmtLugarTurnoDia(lugar, 'TARDE', dia === 'PAR/IMPAR' ? 'PAR/IMPAR' : dia),
    motivo: 'generico'
  };
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

(async () => {
  if (!process.env.DATABASE_URL) {
    console.error('Sin DATABASE_URL');
    process.exit(1);
  }

  const r = await pool.query(
    `SELECT id, item_id, cip, nombres, disponibilidad, dia_franco, comisaria_postula
     FROM inscripciones
     WHERE estado = 'preinscrito'
       AND item_id = ANY($1::int[])
     ORDER BY item_id, id`,
    [[1, 13, 15, 17]]
  );

  const cambios = [];
  for (const row of r.rows) {
    const a = decidirAsignacion(row);
    if (!a) continue;
    cambios.push({
      id: row.id,
      item_id: row.item_id,
      cip: row.cip,
      nombres: row.nombres,
      antes: row.comisaria_postula,
      despues: a.nuevo,
      motivo: a.motivo,
      franco: row.disponibilidad + ' ' + (row.dia_franco || '')
    });
  }

  console.log('A asignar:', cambios.length, CONFIRM ? '(CONFIRMADO)' : '(dry-run)');
  cambios.forEach(function(c) {
    console.log(
      '#' + c.id,
      'item=' + c.item_id,
      c.cip,
      '|',
      c.franco,
      '|',
      JSON.stringify(c.antes),
      '=>',
      JSON.stringify(c.despues)
    );
  });

  if (!CONFIRM) {
    console.log('\nEjecute con --confirm para aplicar.');
    await pool.end();
    return;
  }

  let n = 0;
  for (const c of cambios) {
    await pool.query(
      `UPDATE inscripciones
       SET comisaria_postula = $1,
           observacion = CASE
             WHEN observacion IS NULL OR TRIM(observacion) = '' THEN $2
             WHEN observacion LIKE '%turno asignado admin prueba%' THEN observacion
             ELSE LEFT(observacion || ' · ' || $2, 500)
           END
       WHERE id = $3 AND estado = 'preinscrito'`,
      [c.despues, 'turno asignado admin prueba', c.id]
    );
    n++;
  }
  console.log('Actualizados:', n);
  await pool.end();
})().catch(function(e) {
  console.error(e);
  process.exit(1);
});
