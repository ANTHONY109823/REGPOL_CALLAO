(function () {
  var page = (location.pathname || '').split('/').pop() || '';
  page = page.toLowerCase();
  var LEGACY = {
    'celador.html': { tipo: 'convenio', match: 'CELADOR' },
    'amp.html': { tipo: 'convenio', match: 'APM' },
    'atu.html': { tipo: 'convenio', match: 'ATU' },
    'patrullaje.html': { tipo: 'convenio', match: 'PATRULLAJE' },
    'curso_seg.html': { tipo: 'curso', match: 'SEGURIDAD CIUDADANA' },
    'curso_siat.html': { tipo: 'curso', match: 'ACCIDENTES DE TR' },
    'curso_escena.html': { tipo: 'curso', match: 'ESCENA DEL CRIMEN' }
  };
  var cfg = LEGACY[page];
  if (!cfg) {
    location.replace('index.html');
    return;
  }
  var API = (typeof regpolApiBase === 'function') ? regpolApiBase() : (window.REGPOL_API_BASE || '');
  if (!API) {
    var h = location.hostname;
    API = (h === 'localhost' || h === '127.0.0.1')
      ? 'http://localhost:3000'
      : (window.REGPOL_API_PRODUCTION || 'https://regpolcallao-production.up.railway.app');
  }
  fetch(API + '/portal/items?tipo=' + encodeURIComponent(cfg.tipo))
    .then(function (r) { return r.json(); })
    .then(function (d) {
      var items = (d && d.items) ? d.items : [];
      var found = items.find(function (i) {
        return String(i.titulo || '').toUpperCase().indexOf(cfg.match) >= 0;
      });
      if (found) {
        location.replace('detalle.html?id=' + found.id + '&tipo=' + cfg.tipo);
        return;
      }
      location.replace(cfg.tipo === 'curso' ? 'cursos.html' : 'convenios.html');
    })
    .catch(function () {
      location.replace(cfg.tipo === 'curso' ? 'cursos.html' : 'convenios.html');
    });
})();
