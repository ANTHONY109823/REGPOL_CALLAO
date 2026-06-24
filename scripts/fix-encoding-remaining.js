const fs = require('fs');
const files = ['public/panel-admin.html', 'public/portal.js'];

files.forEach(function(rel) {
  let t = fs.readFileSync(rel, 'utf8');
  const before = t;
  t = t.replace(/GESTI\u00c1\u201cN/g, 'GESTIÓN');
  t = t.replace(/NAVEGACI\u00c1\u201cN/g, 'NAVEGACIÓN');
  t = t.replace(/INVESTIGACI\u00c1\u201cN/g, 'INVESTIGACIÓN');
  t = t.replace(/TR\u00c1\u0081NSITO/g, 'TRÁNSITO');
  t = t.replace(/SESI\u00c1\u201cN/g, 'SESIÓN');
  t = t.replace(/informaci\?n/g, 'información');
  t = t.replace(/Direcci\?n/g, 'Dirección');
  t = t.replace(/Tel\?fono/g, 'Teléfono');
  if (t !== before) {
    fs.writeFileSync(rel, t, 'utf8');
    console.log('fixed', rel);
  }
});
