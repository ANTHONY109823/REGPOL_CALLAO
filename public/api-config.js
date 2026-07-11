
(function() {
  var PRODUCCION = 'https://regpolcallao-production.up.railway.app';
  var h = location.hostname;
  var esLocal = h === 'localhost' || h === '127.0.0.1';

  window.REGPOL_API_PRODUCTION = PRODUCCION;
  window.REGPOL_API_BASE = esLocal ? 'http://localhost:3000' : PRODUCCION;

  window.regpolApiBase = function() {
    return window.REGPOL_API_BASE || PRODUCCION;
  };
})();
