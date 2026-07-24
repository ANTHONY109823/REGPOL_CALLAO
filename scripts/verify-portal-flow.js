const fs = require('fs');
const https = require('https');

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'Cache-Control': 'no-cache' } }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: d }));
    }).on('error', reject);
  });
}

(async () => {
  const css = fs.readFileSync('public/style.css', 'utf8');
  const js = fs.readFileSync('public/portal.js', 'utf8');
  const html = fs.readFileSync('public/index.html', 'utf8');

  const local = {
    charset: /charset=["']?UTF-8/i.test(html),
    titleEntity: html.includes('RESE&#209;A HIST&#211;RICA'),
    cssV65: html.includes('style.css?v=65'),
    jsV77: html.includes('portal.js?v=77'),
    btnAbsolute: /\.resena-carrusel-btn\s*\{[^}]*position:\s*absolute/s.test(css),
    dots: css.includes('.resena-carrusel-dots'),
    sameHeight: (css.match(/height:\s*340px/g) || []).length >= 1,
    noSlidePad: /\.resena-carrusel-slide\.institucional-bloque\s*\{[^}]*padding:\s*0/s.test(css),
    imgCover: /\.resena-slide-media img\s*\{[^}]*object-fit:\s*cover/s.test(css),
    bodyScroll: /\.resena-slide-body\s*\{[^}]*overflow-y:\s*auto/s.test(css),
    utf8Guard: js.includes('corregirTitulosUtf8Portal'),
    bothRender: js.includes('renderResenaHistorica') && js.includes('renderNuestraLabor'),
    bothCarousel: js.includes("initInstitucionalCarrusel('resena-carrusel'") && js.includes("initInstitucionalCarrusel('labor-carrusel'"),
    alwaysMediaCol: js.includes('resena-slide-inner--con-img')
  };

  console.log('LOCAL', local);

  const prodHtml = await get('https://anthony109823.github.io/REGPOL_CALLAO/');
  const prod = {
    status: prodHtml.status,
    cssV: (prodHtml.body.match(/style\.css\?v=(\d+)/) || [])[1],
    jsV: (prodHtml.body.match(/portal\.js\?v=(\d+)/) || [])[1],
    titleEntity: prodHtml.body.includes('RESE&#209;A'),
    contentType: prodHtml.headers['content-type'] || ''
  };
  console.log('PROD_HTML', prod);

  const cssUrl = 'https://anthony109823.github.io/REGPOL_CALLAO/style.css?v=65';
  const prodCss = await get(cssUrl);
  const cssOk = {
    status: prodCss.status,
    btnAbsolute: /\.resena-carrusel-btn\s*\{[^}]*position:\s*absolute/s.test(prodCss.body),
    dots: prodCss.body.includes('.resena-carrusel-dots'),
    noSlidePad: prodCss.body.includes('.resena-carrusel-slide.institucional-bloque')
  };
  console.log('PROD_CSS', cssOk);

  const jsUrl = 'https://anthony109823.github.io/REGPOL_CALLAO/portal.js?v=77';
  const prodJs = await get(jsUrl);
  console.log('PROD_JS', {
    status: prodJs.status,
    utf8Guard: prodJs.body.includes('corregirTitulosUtf8Portal'),
    bothCarousel: prodJs.body.includes('labor-carrusel') && prodJs.body.includes('resena-carrusel')
  });

  let api = null;
  try {
    const apiRes = await get('https://regpolcallao-production.up.railway.app/portal/configuracion?t=' + Date.now());
    const conf = JSON.parse(apiRes.body);
    api = {
      status: apiRes.status,
      hasResena: !!(conf.resenaHistorica),
      resenaSlides: ((conf.resenaHistorica && conf.resenaHistorica.parrafos) || []).length,
      hasLabor: !!(conf.nuestraLabor),
      laborPilares: ((conf.nuestraLabor && conf.nuestraLabor.pilares) || []).length,
      charsetHeader: apiRes.headers['content-type'] || ''
    };
  } catch (e) {
    api = { error: String(e.message || e) };
  }
  console.log('API', api);

  const fails = Object.entries(local).filter(([, v]) => !v).map(([k]) => k);
  if (prod.cssV !== '65' || prod.jsV !== '77' || !prod.titleEntity) fails.push('prod_cache');
  if (!cssOk.btnAbsolute || !cssOk.dots) fails.push('prod_css_btns');
  if (api && api.error) fails.push('api_unreachable');
  console.log(fails.length ? 'RESULT FAIL ' + fails.join(',') : 'RESULT OK');
})();
