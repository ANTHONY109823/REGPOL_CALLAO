/* fecha-local.js — Muestra fechas/horas en la zona horaria del navegador (PC del usuario) */
(function() {
  function pad2(n) { return String(n).padStart(2, '0'); }

  function formatearDesdeDate(d) {
    return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear()
      + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  window.formatearFechaHoraLocal = function(reg, campoIso, campoTexto) {
    campoIso = campoIso || 'fecha_iso';
    campoTexto = campoTexto || 'fecha';
    if (!reg) return '—';
    var iso = reg[campoIso];
    if (iso) {
      var d = new Date(iso);
      if (!isNaN(d.getTime())) return formatearDesdeDate(d);
    }
    var txt = reg[campoTexto];
    return txt ? String(txt) : '—';
  };
})();
