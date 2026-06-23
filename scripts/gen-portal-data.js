const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'public');
const site = JSON.parse(fs.readFileSync(path.join(root, 'site-data.json'), 'utf8'));
const unid = JSON.parse(fs.readFileSync(path.join(root, 'unidades-data.json'), 'utf8'));
const out =
  '/* portal-data.js — datos embebidos (sin red) */\n' +
  'window.REGPOL_SITE_DATA_BUILTIN=' + JSON.stringify(site) + ';\n' +
  'window.REGPOL_UNIDADES_BUILTIN=' + JSON.stringify(unid) + ';\n';
fs.writeFileSync(path.join(root, 'portal-data.js'), out);
console.log('portal-data.js actualizado (' + out.length + ' bytes)');
