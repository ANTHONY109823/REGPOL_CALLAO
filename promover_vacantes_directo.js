/**
 * Pasa a ganador: vacaciones pendientes + preinscritos de turnos
 * donde hay igual o menos postulantes que vacantes libres (sin sorteo).
 */
const conveniosFlujo = require('./convenios_flujo');

function sumaVacantesTurnos(turnos) {
  return normalizarTurnos(turnos).reduce(function(a, t) {
    return a + (parseInt(t.vacantes, 10) || 0);
  }, 0);
}

function esTurnoSedapalAtencion(turno) {
  var n = String(turno || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
  return n === 'ATENCION AL CLIENTE';
}

function etiquetaTurnoHorario(turno) {
  if (esTurnoSedapalAtencion(turno)) return 'ATENCIÓN AL CLIENTE (09:00 a 17:00 hrs)';
  return String(turno || '').trim();
}

function canonNombreTurno(turno) {
  var s = String(turno || '').trim().toUpperCase();
  if (esTurnoSedapalAtencion(s)) return 'ATENCION AL CLIENTE';
  return s;
}

function normalizarTurnos(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(function(t) {
    if (!t || typeof t !== 'object') return null;
    var turno = canonNombreTurno(t.turno || t.nombre || '');
    if (!turno) return null;
    var dia = String(t.dia || t.dias || 'PAR/IMPAR').trim().toUpperCase() || 'PAR/IMPAR';
    var vacantes = parseInt(t.vacantes, 10);
    if (isNaN(vacantes) || vacantes < 0) vacantes = 0;
    return { turno: turno, dia: dia, vacantes: vacantes };
  }).filter(Boolean);
}

function normalizarCuposUnidades(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(function(c) {
    if (!c || typeof c !== 'object') return null;
    var nombre = String(c.nombre || c.unidad || c.comisaria || '').trim();
    if (!nombre) return null;
    var turnosLugar = normalizarTurnos(c.turnos);
    var vacantes = parseInt(c.vacantes, 10);
    if (isNaN(vacantes) || vacantes < 0) vacantes = 0;
    if (turnosLugar.length) vacantes = sumaVacantesTurnos(turnosLugar);
    var inscritos = parseInt(c.inscritos, 10) || 0;
    var disponibles = parseInt(c.disponibles, 10);
    if (isNaN(disponibles) || disponibles < 0) disponibles = Math.max(0, vacantes - inscritos);
    var out = { nombre: nombre, vacantes: vacantes, inscritos: inscritos, disponibles: disponibles };
    if (turnosLugar.length) out.turnos = turnosLugar;
    return out;
  }).filter(Boolean);
}

const CELADOR_TURNOS_SLOTS = [
  { turno: 'MAÑANA', dia: 'PAR' },
  { turno: 'TARDE', dia: 'PAR' },
  { turno: 'NOCHE', dia: 'PAR' },
  { turno: 'MAÑANA', dia: 'IMPAR' },
  { turno: 'TARDE', dia: 'IMPAR' },
  { turno: 'NOCHE', dia: 'IMPAR' }
];

function cuposCeladorTienenMatrizTurnos(cupos) {
  var list = Array.isArray(cupos) ? cupos : [];
  if (!list.length) return false;
  return list.every(function(c) {
    var slots = normalizarTurnos(c && c.turnos);
    if (slots.length !== CELADOR_TURNOS_SLOTS.length) return false;
    return CELADOR_TURNOS_SLOTS.every(function(s, i) {
      return slots[i].turno === s.turno && slots[i].dia === s.dia;
    });
  });
}

function cuposTienenTurnosPorLugar(cupos) {
  var list = Array.isArray(cupos) ? cupos : [];
  return list.some(function(c) {
    return c && Array.isArray(c.turnos) && c.turnos.length;
  });
}

function construirSlotsSorteoItem(item) {
  var cupos = normalizarCuposUnidades(item && item.cupos_unidades);
  var slots = [];
  if (cuposCeladorTienenMatrizTurnos(cupos) || cuposTienenTurnosPorLugar(cupos)) {
    cupos.forEach(function(c) {
      normalizarTurnos(c.turnos).forEach(function(t) {
        var vac = parseInt(t.vacantes, 10) || 0;
        if (vac <= 0) return;
        slots.push({
          key: String(c.nombre).toUpperCase() + '|' + t.turno + '|' + t.dia,
          lugar: c.nombre,
          turno: t.turno,
          dia: t.dia,
          vacantes: vac,
          label: c.nombre + ' — ' + etiquetaTurnoHorario(t.turno) + ' / ' + t.dia
        });
      });
    });
    if (slots.length) return slots;
  }
  var turnos = normalizarTurnos(item && item.turnos);
  turnos.forEach(function(t) {
    var vac = parseInt(t.vacantes, 10) || 0;
    if (vac <= 0) return;
    slots.push({
      key: t.turno + '|' + t.dia,
      lugar: '',
      turno: t.turno,
      dia: t.dia,
      vacantes: vac,
      label: etiquetaTurnoHorario(t.turno) + ' — ' + t.dia
    });
  });
  if (!slots.length) {
    var total = parseInt(item && item.vacantes, 10) || 0;
    if (total > 0) {
      slots.push({
        key: 'GENERAL|PAR/IMPAR',
        lugar: '',
        turno: 'GENERAL',
        dia: 'PAR/IMPAR',
        vacantes: total,
        label: 'Cupo general'
      });
    }
  }
  return slots;
}

function diaCompatibleSorteo(diaSlot, diaCand) {
  var a = String(diaSlot || '').toUpperCase();
  var b = String(diaCand || '').toUpperCase();
  if (!a || a === 'PAR/IMPAR' || a === 'TODOS') return true;
  if (!b || b === 'PAR/IMPAR' || b === 'TODOS') return true;
  return a === b;
}

function canonLugarSlot(texto) {
  return String(texto || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/^COMISARIA(\s+DE)?\s+/, '')
    .replace(/^COM\.?\s+/, '')
    .replace(/^CIA\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function candidatoEnCupoPostula(cand, slot) {
  if (!cand || !slot) return false;
  var list = conveniosFlujo.parsePostulacionSlots(cand.comisaria_postula, cand.postula_slots);
  if (!list.length) {
    list = [conveniosFlujo.parsePostulacionSlot(cand.comisaria_postula)];
  }
  return list.some(function(p) {
    if (slot.lugar) {
      if (canonLugarSlot(p.lugar || cand.comisaria_postula) !== canonLugarSlot(slot.lugar)) {
        return false;
      }
    }
    if (slot.turno && slot.turno !== 'GENERAL') {
      if (p.turno && p.turno !== slot.turno) return false;
    }
    return diaCompatibleSorteo(slot.dia, p.dia || cand.dia_franco);
  });
}

function sqlMesActualLima(campoFecha) {
  return `to_char(timezone('America/Lima', COALESCE(${campoFecha}::timestamptz, NOW())), 'YYYY-MM')
    = to_char(timezone('America/Lima', NOW()), 'YYYY-MM')`;
}

function esVacaciones(row) {
  return String(row && row.disponibilidad || '').toUpperCase() === 'VACACIONES';
}

function labelDeCandidato(row) {
  return String(row && (row.comisaria_postula || '') || '').trim() || 'Sin turno';
}

function ocupadasInicialesPorSlot(slots, rows) {
  const ocupan = conveniosFlujo.ESTADOS_OCUPAN_VACANTE || [];
  const map = {};
  (slots || []).forEach(function(slot) {
    map[slot.key] = (rows || []).filter(function(c) {
      return ocupan.indexOf(c.estado) >= 0 && candidatoEnCupoPostula(c, slot);
    }).length;
  });
  return map;
}

function slotPreferidoVacaciones(c, slots, ocupadasMap) {
  if (!slots || !slots.length) return null;
  var conCupo = [];
  var match = [];
  slots.forEach(function(s) {
    if (!candidatoEnCupoPostula(c, s)) return;
    match.push(s);
    var vac = parseInt(s.vacantes, 10) || 0;
    var occ = ocupadasMap[s.key] || 0;
    if (vac - occ > 0) conCupo.push(s);
  });
  if (conCupo.length) return conCupo[0];
  if (match.length) return match[0];
  var cualquierCupo = slots.filter(function(s) {
    return (parseInt(s.vacantes, 10) || 0) - (ocupadasMap[s.key] || 0) > 0;
  });
  return cualquierCupo[0] || slots[0] || null;
}

function planificarPromocion(slots, rows) {
  const pendientesEst = ['reserva', 'preinscrito', 'pendiente', 'aprobado', 'verificado'];
  const ya = {};
  const vacaciones = [];
  const directo = [];
  const detalle = [];
  const ocupadasMap = ocupadasInicialesPorSlot(slots, rows);

  (rows || []).forEach(function(c) {
    if (pendientesEst.indexOf(c.estado) < 0) return;
    if (!esVacaciones(c)) return;
    vacaciones.push(c);
    ya[c.id] = true;
    const slot = slotPreferidoVacaciones(c, slots, ocupadasMap);
    if (slot) ocupadasMap[slot.key] = (ocupadasMap[slot.key] || 0) + 1;
    detalle.push({
      tipo: 'vacaciones',
      slot: (slot && slot.label) || labelDeCandidato(c),
      lugar: (slot && slot.lugar) || '',
      turno: (slot && slot.turno) || '',
      dia: (slot && slot.dia) || '',
      n: 1
    });
  });

  (slots || []).forEach(function(slot) {
    const vac = parseInt(slot.vacantes, 10) || 0;
    if (vac < 1) return;
    const ocupadas = ocupadasMap[slot.key] || 0;
    const libres = Math.max(0, vac - ocupadas);
    if (libres < 1) return;
    const pend = (rows || []).filter(function(c) {
      return pendientesEst.indexOf(c.estado) >= 0
        && !ya[c.id]
        && candidatoEnCupoPostula(c, slot);
    });
    if (!pend.length || pend.length > libres) return;
    pend.forEach(function(c) { ya[c.id] = true; });
    ocupadasMap[slot.key] = ocupadas + pend.length;
    directo.push({ slot: slot, rows: pend });
    detalle.push({
      tipo: 'vacante_no_cubierta',
      slot: slot.label || slot.key,
      lugar: slot.lugar || '',
      turno: slot.turno || '',
      dia: slot.dia || '',
      n: pend.length,
      libres: libres
    });
  });

  return {
    vacaciones: vacaciones,
    directo: directo,
    detalle: detalle,
    nVacaciones: vacaciones.length,
    nDirecto: directo.reduce(function(a, x) { return a + x.rows.length; }, 0)
  };
}

async function promover(pool, itemId, opts) {
  opts = opts || {};
  const cur = await pool.query(
    'SELECT id, tipo, titulo, vacantes, cupos_unidades, turnos FROM items_portal WHERE id=$1',
    [itemId]
  );
  if (!cur.rows.length || cur.rows[0].tipo !== 'convenio') {
    return { ok: false, ganadores: 0, titulo: '' };
  }
  const item = cur.rows[0];
  item.cupos_unidades = normalizarCuposUnidades(item.cupos_unidades);
  item.turnos = normalizarTurnos(item.turnos);
  const slots = construirSlotsSorteoItem(item);
  if (!slots.length) {
    return { ok: true, ganadores: 0, titulo: item.titulo, vacaciones: 0, directo: 0, detalle: [] };
  }
  const ins = await pool.query(
    `SELECT id, estado, comisaria_postula, postula_slots, disponibilidad, dia_franco
     FROM inscripciones WHERE item_id=$1 AND ${sqlMesActualLima('fecha')}`,
    [itemId]
  );
  const plan = planificarPromocion(slots, ins.rows);
  const nPlan = plan.nVacaciones + plan.nDirecto;
  if (!opts.apply) {
    return {
      ok: true,
      ganadores: nPlan,
      titulo: item.titulo,
      vacaciones: plan.nVacaciones,
      directo: plan.nDirecto,
      detalle: compactarDetalle(plan.detalle),
      aplicado: false
    };
  }
  if (!nPlan) {
    return {
      ok: true,
      ganadores: 0,
      titulo: item.titulo,
      vacaciones: 0,
      directo: 0,
      detalle: [],
      aplicado: true
    };
  }

  const pendientesEst = ['reserva', 'preinscrito', 'pendiente', 'aprobado', 'verificado'];
  const plazo = conveniosFlujo.plazoDesdeAhora();
  const obsVac = 'Asignado por vacaciones (sin sorteo)';
  const obsDir = 'Asignado por vacante no cubierta (turno sin sorteo)';
  let nVac = 0;
  let nDir = 0;

  for (let i = 0; i < plan.vacaciones.length; i++) {
    const row = plan.vacaciones[i];
    const r = await pool.query(
      `UPDATE inscripciones SET
         estado='ganador', observacion=$1, modo_ingreso=COALESCE(NULLIF(modo_ingreso,''),'sorteo'),
         fecha_ganador=COALESCE(fecha_ganador, NOW()), plazo_expediente=COALESCE(plazo_expediente, $2)
       WHERE id=$3 AND item_id=$4 AND estado = ANY($5::varchar[])`,
      [obsVac, plazo.toISOString(), row.id, itemId, pendientesEst]
    );
    if (r.rowCount) nVac++;
  }
  for (let i = 0; i < plan.directo.length; i++) {
    const grp = plan.directo[i];
    for (let j = 0; j < grp.rows.length; j++) {
      const row = grp.rows[j];
      const r = await pool.query(
        `UPDATE inscripciones SET
           estado='ganador', observacion=$1, modo_ingreso=COALESCE(NULLIF(modo_ingreso,''),'sorteo'),
           fecha_ganador=COALESCE(fecha_ganador, NOW()), plazo_expediente=COALESCE(plazo_expediente, $2)
         WHERE id=$3 AND item_id=$4 AND estado = ANY($5::varchar[])`,
        [obsDir, plazo.toISOString(), row.id, itemId, pendientesEst]
      );
      if (r.rowCount) nDir++;
    }
  }

  return {
    ok: true,
    ganadores: nVac + nDir,
    titulo: item.titulo,
    vacaciones: nVac,
    directo: nDir,
    detalle: compactarDetalle(plan.detalle),
    aplicado: true
  };
}

function compactarDetalle(detalle) {
  const map = {};
  (detalle || []).forEach(function(d) {
    const k = (d.tipo || '') + '|' + (d.slot || '');
    if (!map[k]) {
      map[k] = {
        tipo: d.tipo,
        slot: d.slot,
        lugar: d.lugar || '',
        turno: d.turno || '',
        dia: d.dia || '',
        n: 0
      };
    }
    map[k].n += d.n || 0;
  });
  return Object.keys(map).map(function(k) { return map[k]; })
    .sort(function(a, b) {
      if (a.tipo !== b.tipo) return a.tipo < b.tipo ? -1 : 1;
      return String(a.slot).localeCompare(String(b.slot), 'es');
    });
}

async function promoverTodosConveniosMes(pool, opts) {
  opts = opts || {};
  const apply = !!opts.apply;
  const items = await pool.query(
    `SELECT id, titulo FROM items_portal WHERE tipo='convenio' ORDER BY titulo`
  );
  const convenios = [];
  let totalVac = 0;
  let totalDir = 0;
  for (let i = 0; i < items.rows.length; i++) {
    const r = await promover(pool, items.rows[i].id, { apply: apply });
    if (!r.ok || !r.ganadores) continue;
    convenios.push(r);
    totalVac += r.vacaciones || 0;
    totalDir += r.directo || 0;
  }
  return {
    ok: true,
    aplicado: apply,
    convenios: convenios,
    vacaciones: totalVac,
    directo: totalDir,
    ganadores: totalVac + totalDir
  };
}

module.exports = {
  promover,
  promoverTodosConveniosMes,
  planificarPromocion,
  construirSlotsSorteoItem,
  candidatoEnCupoPostula,
  compactarDetalle
};
