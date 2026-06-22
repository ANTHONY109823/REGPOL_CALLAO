/* api-config.js — URL del backend según dónde se abre el sitio */
(function() {
  var h = location.hostname;
  if (h === 'localhost' || h === '127.0.0.1') {
    window.REGPOL_API_BASE = 'http://localhost:3000';
  } else if (h.indexOf('github.io') !== -1 || h.indexOf('github.com') !== -1) {
    window.REGPOL_API_BASE = 'https://regpolcallao-production.up.railway.app';
  } else {
    window.REGPOL_API_BASE = '';
  }
})();
