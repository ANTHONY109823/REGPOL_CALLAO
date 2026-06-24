const fs = require('fs');
const file = 'public/panel-admin.html';
let t = fs.readFileSync(file, 'utf8');

const reps = [
  ['\u00e2\u0153\u201c', '\u2713'],
  ['\u00e2\u0153\u201d', '\u2713'],
  ['\u00e2\u0153\u2020', '\u2713'],
  ['\u00e2\u0153\u2022', '\u00d7'],
  ['\u00c2\u00ab', '\u00ab'],
  ['\u00c2\u00bb', '\u00bb'],
  ['PR\u00c1\u201cXIMO', 'PR\u00d3XIMO'],
  ['N\u00c2\u00b0', 'N\u00b0'],
  ['\u00c2\u00bf', '\u00bf'],
];

reps.forEach(function(pair) {
  const n = t.split(pair[0]).length - 1;
  if (n) {
    t = t.split(pair[0]).join(pair[1]);
    console.log('fixed', JSON.stringify(pair[0]), n);
  }
});

t = t.replace(/<div class="pb-title">[^<]*?(Bienestar \/ Psicolog[\w\u00eda]+)<\/div>/g, '<div class="pb-title">$1</div>');
t = t.replace(/<div class="pb-title">[^<]*?(Convenios)<\/div>/g, '<div class="pb-title">$1</div>');
t = t.replace(/<div class="pb-title">[^<]*?(Educaci[\w\u00f3n]+)<\/div>/g, '<div class="pb-title">$1</div>');
t = t.replace(/<div class="pb-title">[^<]*?(Imagen)<\/div>/g, '<div class="pb-title">$1</div>');

t = t.replace(/<span class="badge" style="background:#fff3cd;color:#856404;">[^<]*PRÓXIMO<\/span>/g,
  '<span class="badge" style="background:#fff3cd;color:#856404;">PRÓXIMO</span>');
t = t.replace(/<span class="badge ok">[^<]*RESULTADO<\/span>/g, '<span class="badge ok">RESULTADO</span>');
t = t.replace(/background:#d4edda;color:#1a7a3a;">[^<]*VAC<\/span>/g, 'background:#d4edda;color:#1a7a3a;">VAC</span>');
t = t.replace(/background:#cce5ff;color:#004085;">[^<]*'\+/g, "background:#cce5ff;color:#004085;\">' +");

fs.writeFileSync(file, t, 'utf8');
console.log('done');
