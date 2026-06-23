const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'public');
const site = JSON.parse(fs.readFileSync(path.join(root, 'site-data.json'), 'utf8'));
const unid = JSON.parse(fs.readFileSync(path.join(root, 'unidades-data.json'), 'utf8'));

const REGPOL_NAV = [
  { id: 'inicio',    href: 'index.html',           label: 'INICIO',             icon: 'fa-home' },
  { id: 'novedades', href: 'novedades.html',        label: 'NOVEDADES' },
  { id: 'convenios', href: 'convenios.html',        label: 'CONVENIOS' },
  { id: 'cursos',    href: 'cursos.html',           label: 'CURSOS' },
  { id: 'bienestar', href: 'evaluacion.html',       label: 'BIENESTAR',          icon: 'fa-heart' },
  { id: 'resena',    href: 'resena-historica.html', label: 'RESEÑA HISTÓRICA' },
  { id: 'labor',     href: 'nuestra-labor.html',    label: 'NUESTRA LABOR' },
  { id: 'unidades',  href: 'unidades.html',         label: 'NUESTRAS UNIDADES', icon: 'fa-map-marker-alt' }
];

const out =
  '/* portal-data.js — datos embebidos (sin red) */\n' +
  'window.REGPOL_NAV=' + JSON.stringify(REGPOL_NAV) + ';\n' +
  'window.REGPOL_SITE_DATA_BUILTIN=' + JSON.stringify(site) + ';\n' +
  'window.REGPOL_UNIDADES_BUILTIN=' + JSON.stringify(unid) + ';\n';

fs.writeFileSync(path.join(root, 'portal-data.js'), out);
console.log('portal-data.js actualizado (' + out.length + ' bytes)');
