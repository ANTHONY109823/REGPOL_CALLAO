/* ================================================================
   REGPOL Callao - Web App MMPI-2
   Endpoints: stats, listar, descargar, guardar_progreso, cargar_progreso
   Ing. Anthony Ccayo - UNITIC - 2026
================================================================ */

var FORM_ID = '19HWfPow6zMYuphsHbLir7Ro_xysD6hya528bfXl_YN0';

// ── Obtener hoja por nombre (crea si no existe) ──────────────────────────────
function getSheet(nombre) {
  var sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  var ss = SpreadsheetApp.openById(sheetId);
  var sheet = ss.getSheetByName(nombre);
  if (!sheet) {
    sheet = ss.insertSheet(nombre);
  }
  return sheet;
}

// ── GET ──────────────────────────────────────────────────────────────────────
function doGet(e) {
  var action    = (e.parameter.action    || 'descargar').toLowerCase();
  var comisaria = (e.parameter.comisaria || '').trim().toUpperCase();
  var email     = (e.parameter.email     || '').trim().toLowerCase();

  var sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!sheetId) {
    return txt('ERROR: ejecute paso1_VincularFormulario primero.');
  }

  if (action === 'stats')            return doStats();
  if (action === 'listar')           return doListar(comisaria);
  if (action === 'cargar_progreso')  return doCargarProgreso(email);
  return doDescargar(comisaria);
}

// ── POST (guardar progreso) ───────────────────────────────────────────────────
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var action = (body.action || '').toLowerCase();
    if (action === 'guardar_progreso') return doGuardarProgreso(body);
    return json({ok: false, error: 'Accion desconocida'});
  } catch(err) {
    return json({ok: false, error: err.message});
  }
}

// ── STATS (para dashboard) ────────────────────────────────────────────────────
function doStats() {
  var ss       = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID'));
  var respSheet = ss.getSheets()[0];
  var data      = respSheet.getDataRange().getValues();

  if (data.length < 2) {
    return json({ok:true, totalCompletas:0, porComisaria:[], ultimasEvaluaciones:[], progresosActivos:0});
  }

  var rows = data.slice(1);
  var porComisaria = {};

  rows.forEach(function(row) {
    var comisaria = (row[1] || '').toString().trim();
    if (!comisaria) return;
    porComisaria[comisaria] = (porComisaria[comisaria] || 0) + 1;
  });

  var listaComisarias = Object.keys(porComisaria).sort().map(function(c) {
    return {nombre: c, total: porComisaria[c]};
  });

  // Últimas 10 evaluaciones (timestamp col 0, comisaria col 1, nombres col 3)
  var ultimas = rows.slice(-10).reverse().map(function(row) {
    var ts = row[0];
    return {
      fecha:     ts instanceof Date ? Utilities.formatDate(ts,'America/Lima','dd/MM/yyyy HH:mm') : ts.toString(),
      comisaria: (row[1] || '').toString().trim(),
      unidad:    (row[2] || '').toString().trim(),
      nombres:   (row[3] || '').toString().trim()
    };
  });

  // Progresos activos (en la hoja Progreso)
  var progresosActivos = 0;
  try {
    var progSheet = getSheet('Progreso');
    var progData  = progSheet.getDataRange().getValues();
    progresosActivos = Math.max(0, progData.length - 1);
  } catch(e) {}

  return json({
    ok:               true,
    totalCompletas:   rows.length,
    porComisaria:     listaComisarias,
    ultimasEvaluaciones: ultimas,
    progresosActivos: progresosActivos
  });
}

// ── LISTAR comisarías ─────────────────────────────────────────────────────────
function doListar() {
  var ss    = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID'));
  var sheet = ss.getSheets()[0];
  var data  = sheet.getDataRange().getValues();
  if (data.length < 2) return json({ok:true, comisarias:[], total:0});

  var unicas = {};
  data.slice(1).forEach(function(row) {
    var c = (row[1] || '').toString().trim();
    if (c) unicas[c] = (unicas[c] || 0) + 1;
  });
  var lista = Object.keys(unicas).sort();
  return json({ok:true, comisarias:lista, total:data.length - 1});
}

// ── DESCARGAR CSV ─────────────────────────────────────────────────────────────
function doDescargar(comisaria) {
  var ss    = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID'));
  var sheet = ss.getSheets()[0];
  var data  = sheet.getDataRange().getValues();
  if (data.length < 2) return txt('Sin respuestas aun.');

  var headers = data[0];
  var rows    = data.slice(1);
  if (comisaria) {
    rows = rows.filter(function(row) {
      return row[1].toString().toUpperCase().indexOf(comisaria) !== -1;
    });
  }

  var todo = [headers].concat(rows);
  var Q = String.fromCharCode(34);
  var csv = todo.map(function(row) {
    return row.map(function(cell) {
      var v = cell instanceof Date
        ? Utilities.formatDate(cell,'America/Lima','dd/MM/yyyy HH:mm:ss')
        : cell.toString();
      return Q + v.replace(new RegExp(Q,'g'), Q+Q) + Q;
    }).join(',');
  }).join('\r\n');

  return ContentService.createTextOutput(csv).setMimeType(ContentService.MimeType.CSV);
}

// ── GUARDAR PROGRESO ──────────────────────────────────────────────────────────
function doGuardarProgreso(body) {
  var email     = (body.email     || '').trim().toLowerCase();
  var cip       = (body.cip       || '').trim();
  var nombres   = (body.nombres   || '').trim();
  var comisaria = (body.comisaria || '').trim();
  var pagina    = body.pagina  || 1;
  var respuestas = JSON.stringify(body.respuestas || {});
  var total     = body.totalRespondidas || 0;

  if (!email && !cip) return json({ok:false, error:'Se requiere email o CIP'});

  var sheet = getSheet('Progreso');
  var data  = sheet.getDataRange().getValues();
  var clave = email || cip;
  var ahora = new Date();

  // Buscar fila existente
  var filaExistente = -1;
  for (var i = 1; i < data.length; i++) {
    if ((data[i][0] || '').toString().toLowerCase() === clave) {
      filaExistente = i + 1;
      break;
    }
  }

  if (filaExistente > 0) {
    sheet.getRange(filaExistente, 1, 1, 8).setValues([[
      clave, cip, nombres, comisaria, pagina, total, respuestas, ahora
    ]]);
  } else {
    if (data.length <= 1 && sheet.getLastRow() === 0) {
      sheet.appendRow(['Clave','CIP','Nombres','Comisaria','Pagina','TotalRespondidas','Respuestas','UltimaActualizacion']);
    }
    sheet.appendRow([clave, cip, nombres, comisaria, pagina, total, respuestas, ahora]);
  }

  return json({ok:true, guardado:true});
}

// ── CARGAR PROGRESO ───────────────────────────────────────────────────────────
function doCargarProgreso(email) {
  if (!email) return json({ok:false, error:'Email requerido'});

  var sheet = getSheet('Progreso');
  var data  = sheet.getDataRange().getValues();
  var clave = email.toLowerCase();

  for (var i = 1; i < data.length; i++) {
    if ((data[i][0] || '').toString().toLowerCase() === clave) {
      var row = data[i];
      var respuestas = {};
      try { respuestas = JSON.parse(row[6] || '{}'); } catch(e) {}
      return json({
        ok:        true,
        encontrado: true,
        cip:        row[1],
        nombres:    row[2],
        comisaria:  row[3],
        pagina:     row[4] || 1,
        total:      row[5] || 0,
        respuestas: respuestas,
        ultima:     row[7] ? Utilities.formatDate(row[7],'America/Lima','dd/MM/yyyy HH:mm') : ''
      });
    }
  }
  return json({ok:true, encontrado:false});
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function txt(msg) {
  return ContentService.createTextOutput(msg).setMimeType(ContentService.MimeType.TEXT);
}

// ── SETUP (ejecutar una sola vez) ─────────────────────────────────────────────
function paso1_VincularFormulario() {
  var props    = PropertiesService.getScriptProperties();
  var existente = props.getProperty('SHEET_ID');
  if (existente) {
    Logger.log('Ya existe SHEET_ID: ' + existente);
    return;
  }
  var form = FormApp.openById(FORM_ID);
  var ss   = SpreadsheetApp.create('MMPI-2 REGPOL Callao Respuestas 2026');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
  props.setProperty('SHEET_ID', ss.getId());
  Logger.log('COMPLETADO - Sheet ID: ' + ss.getId());
  Logger.log('URL: ' + ss.getUrl());
}
