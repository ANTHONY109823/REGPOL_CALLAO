const fs = require('fs');
const path = require('path');

const SUB =
  'UNIDAD DE TECNOLOG&#205;AS DE LA INFORMACI&#211;N Y COMUNICACIONES';
const REGION = 'REGI&#211;N POLICIAL CALLAO';
const CIUDADANIA = 'AL SERVICIO DE LA CIUDADAN&#205;A';
const VASQUEZ = 'COMPLEJO POLICIAL CAP. PNP ALIPIO PONCE V&#193;SQUEZ';
const APURIMAC = 'JR. APUR&#205;MAC 647 - CALLAO';

function stripCorrupt(s) {
  return String(s)
    .replace(/\uFFFD/g, '')
    .replace(/ï¿½/g, '')
    .replace(/\u00EF\u00BF\u00BD/g, '');
}

function fixHtml(file) {
  let t = fs.readFileSync(file, 'utf8');
  const before = t;

  // Generic replacement of known corrupted / ascii-stripped institutional strings
  t = t.replace(/REGI(?:\uFFFD|ï¿½|\?|)N POLICIAL CALLAO/g, REGION);
  t = t.replace(/REGIÓN POLICIAL CALLAO/g, REGION);
  t = t.replace(/REGI&Oacute;N POLICIAL CALLAO/gi, REGION);

  t = t.replace(
    /UNIDAD DE TECNOLOG(?:\uFFFD|ï¿½|\?|)AS DE LA INFORMACI(?:\uFFFD|ï¿½|\?|)N Y COMUNICACIONES/g,
    SUB
  );
  t = t.replace(
    /UNIDAD DE TECNOLOG[IÍ]AS DE LA INFORMACI[OÓ]N Y COMUNICACIONES/gi,
    SUB
  );
  t = t.replace(
    /UNIDAD DE TECNOLOGIAS DE LA INFORMACION Y COMUNICACIONES/g,
    SUB
  );

  t = t.replace(
    /COMPLEJO POLICIAL CAP\. PNP ALIPIO PONCE V(?:\uFFFD|ï¿½|\?|)SQUEZ/g,
    VASQUEZ
  );
  t = t.replace(
    /COMPLEJO POLICIAL CAP\. PNP ALIPIO PONCE V[AÁ]SQUEZ/gi,
    VASQUEZ
  );

  t = t.replace(/JR\. APUR(?:\uFFFD|ï¿½|\?|)MAC 647 - CALLAO/g, APURIMAC);
  t = t.replace(/JR\. APUR[IÍ]MAC 647 - CALLAO/gi, APURIMAC);

  t = t.replace(/AL SERVICIO DE LA CIUDADAN(?:\uFFFD|ï¿½|\?|)A/g, CIUDADANIA);
  t = t.replace(/AL SERVICIO DE LA CIUDADAN[IÍ]A/gi, CIUDADANIA);

  t = t.replace(/Galer(?:\uFFFD|ï¿½)a institucional/g, 'Galer&#237;a institucional');
  t = t.replace(/Men(?:\uFFFD|ï¿½) principal/g, 'Men&#250; principal');
  t = t.replace(/Presentaci(?:\uFFFD|ï¿½)n institucional/g, 'Presentaci&#243;n institucional');
  t = t.replace(/Contacto y ubicaci(?:\uFFFD|ï¿½)n institucional/g, 'Contacto y ubicaci&#243;n institucional');
  t = t.replace(/Ubicaci(?:\uFFFD|ï¿½)n en Google Maps/g, 'Ubicaci&#243;n en Google Maps');
  t = t.replace(/>Ubicaci(?:\uFFFD|ï¿½)n</g, '>Ubicaci&#243;n<');
  t = t.replace(/&#218;LTIMA ACTUALIZACI(?:\uFFFD|ï¿½)N/g, '&#218;LTIMA ACTUALIZACI&#211;N');
  t = t.replace(/(?:\uFFFD|ï¿½)LTIMA ACTUALIZACI(?:\uFFFD|ï¿½)N/g, '&#218;LTIMA ACTUALIZACI&#211;N');
  t = t.replace(/PR(?:\uFFFD|ï¿½)XIMOS SORTEOS/g, 'PR&#211;XIMOS SORTEOS');
  t = t.replace(/(?:\uFFFD|ï¿½|&iquest;)Ya se inscribi(?:\uFFFD|ï¿½)o\?/g, '&#191;Ya se inscribi&#243;?');
  t = t.replace(/RELACI(?:\uFFFD|ï¿½)N DE SELECCIONADOS/g, 'RELACI&#211;N DE SELECCIONADOS');
  t = t.replace(/DESCANSOS M(?:\uFFFD|ï¿½)DICOS/g, 'DESCANSOS M&#201;DICOS');
  t = t.replace(/descansos m(?:\uFFFD|ï¿½)dicos/g, 'descansos m&#233;dicos');
  t = t.replace(/RESE(?:\uFFFD|ï¿½|&Ntilde;)A HIST(?:\uFFFD|ï¿½|&Oacute;)RICA/g, 'RESE&#209;A HIST&#211;RICA');

  // Región in footers
  t = t.replace(/Regi(?:\uFFFD|ï¿½)n Policial Callao/g, 'Regi&#243;n Policial Callao');
  t = t.replace(/Región Policial Callao/g, 'Regi&#243;n Policial Callao');

  if (t.includes('\uFFFD') || t.includes('ï¿½')) {
    // last pass: remove lone replacement leftovers in attribute/text near known words
    t = t.replace(/\uFFFD/g, '');
    t = t.replace(/ï¿½/g, '');
  }

  if (t !== before) {
    fs.writeFileSync(file, t, 'utf8');
    return true;
  }
  return false;
}

const root = path.join(__dirname, '..', 'public');
let n = 0;
for (const f of fs.readdirSync(root)) {
  if (!/\.html$/i.test(f)) continue;
  const p = path.join(root, f);
  if (fixHtml(p)) {
    n++;
    console.log('fixed', f);
  }
}
console.log('html fixed', n);

// verify no FFFD in public html/js
let bad = 0;
for (const f of fs.readdirSync(root)) {
  if (!/\.(html|js)$/i.test(f)) continue;
  const t = fs.readFileSync(path.join(root, f), 'utf8');
  if (t.includes('\uFFFD') || t.includes('ï¿½')) {
    console.log('STILL_BAD', f);
    bad++;
  }
}
console.log(bad ? 'FAIL remaining ' + bad : 'OK no replacement chars');
