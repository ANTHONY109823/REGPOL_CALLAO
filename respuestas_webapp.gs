/* ================================================================
   REGPOL Callao - Web App: Descarga de respuestas MMPI-2
   Ing. Anthony Ccayo - UNITIC - 2026

   PASOS DE CONFIGURACION:
   1. Ejecutar paso1_VincularFormulario() UNA SOLA VEZ
   2. Desplegar como Web App:
      - Implementar > Nueva implementacion
      - Tipo: Aplicacion web
      - Ejecutar como: Yo (tu cuenta de Google)
      - Quienes tienen acceso: Cualquier usuario
      - Copiar la URL de implementacion en el panel admin
================================================================ */

var FORM_ID = '19HWfPow6zMYuphsHbLir7Ro_xysD6hya528bfXl_YN0';

// ── PASO 1: Ejecutar UNA sola vez para crear y vincular la hoja ──────────────
function paso1_VincularFormulario() {
  var props = PropertiesService.getScriptProperties();
  var existente = props.getProperty('SHEET_ID');
  if (existente) {
    Logger.log('Ya existe Sheet ID: ' + existente);
    Logger.log('URL: https://docs.google.com/spreadsheets/d/' + existente);
    return;
  }

  var form = FormApp.openById(FORM_ID);

  // Crear hoja de calculo en Google Drive
  var ss = SpreadsheetApp.create('MMPI-2 REGPOL Callao — Respuestas 2026');

  // Vincular formulario → hoja
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  props.setProperty('SHEET_ID', ss.getId());

  Logger.log('=== VINCULACION COMPLETADA ===');
  Logger.log('Sheet ID: ' + ss.getId());
  Logger.log('URL Hoja: ' + ss.getUrl());
  Logger.log('');
  Logger.log('Ahora: Implementar > Nueva implementacion > Aplicacion web');
}

// ── WEB APP: recibe peticiones GET ──────────────────────────────────────────
function doGet(e) {
  var action    = (e.parameter.action    || 'descargar').toLowerCase();
  var comisaria = (e.parameter.comisaria || '').trim().toUpperCase();

  var sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!sheetId) {
    return resp('ERROR: Ejecute paso1_VincularFormulario() primero.');
  }

  var ss    = SpreadsheetApp.openById(sheetId);
  var sheet = ss.getSheets()[0];
  var data  = sheet.getDataRange().getValues();

  if (data.length < 2) {
    return resp('Sin respuestas registradas aún.');
  }

  var headers = data[0];
  var rows    = data.slice(1);

  // Columna 1 = Timestamp, Columna 2 = Comisaria (índice 1)
  // Filtrar por comisaria si se especifica
  if (comisaria) {
    rows = rows.filter(function(row) {
      return row[1].toString().toUpperCase().indexOf(comisaria) !== -1;
    });
  }

  if (action === 'listar') {
    // Devolver lista JSON de comisarías únicas
    var unicas = {};
    data.slice(1).forEach(function(row) {
      var c = (row[1] || '').toString().trim();
      if (c) unicas[c] = true;
    });
    var lista = Object.keys(unicas).sort();
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, comisarias: lista, total: rows.length }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Acción por defecto: descargar CSV
  var todo = [headers].concat(rows);
  var csv  = todo.map(function(row) {
    return row.map(function(cell) {
      var v = cell instanceof Date
        ? Utilities.formatDate(cell, 'America/Lima', 'dd/MM/yyyy HH:mm:ss')
        : cell.toString();
      return '"' + v.replace(/"/g, '""') + '"';
    }).join(',');
  }).join('\r\n');

  return ContentService
    .createTextOutput(csv)
    .setMimeType(ContentService.MimeType.CSV);
}

function resp(msg) {
  return ContentService.createTextOutput(msg).setMimeType(ContentService.MimeType.TEXT);
}
