/* ================================================================
   evaluacion.js — Cuestionario Psicológico REGPOL Callao
   Ing. Anthony Ccayo — UNITIC — 2026
   Preguntas se cargan desde la API (PostgreSQL)
================================================================ */

var LOCAL_API = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? 'http://localhost:3000' : '';

var PREGUNTAS       = [];   // se llena desde /preguntas
var TOTAL_PREGUNTAS = 0;
var TOTAL_BLOQUES   = 0;
var PREG_POR_BLOQUE = 50;   // 566 / 50 = ~12 bloques

var ESTADO = {
  bloqueActual:    1,
  pregsPorBloque:  PREG_POR_BLOQUE,
  respuestas:      {},
  registroCompleto: false
};

/* ================================================================
   INICIO — cargar preguntas desde API
================================================================ */
document.addEventListener('DOMContentLoaded', function() {
  cargarConfigUnidad();

  document.getElementById('f-nacimiento').addEventListener('input', formatearFechaNacimiento);
  document.getElementById('f-nacimiento').addEventListener('blur',  calcularEdad);
  ['f-cip','f-dni'].forEach(function(id) {
    document.getElementById(id).addEventListener('input', function(e) {
      e.target.value = e.target.value.replace(/\D/g,'');
    });
  });

  ocultarCuestionario();
  cargarPreguntas();
});

function cargarConfigUnidad() {
  var sel = document.getElementById('f-unidad');
  if (!sel) return;

  fetch(LOCAL_API + '/config')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var activas = [];
      if (data.ok && data.unidadesActivas && data.unidadesActivas.length) {
        activas = data.unidadesActivas;
      } else if (data.ok && data.comisariaActiva) {
        activas = [data.comisariaActiva];
      }

      sel.innerHTML = '<option value="">-- Seleccionar comisaría --</option>';
      if (!activas.length) {
        sel.disabled = true;
        mostrarAlerta('El cuestionario no está habilitado para su dependencia en este momento. Contacte a la Oficina de Psicología.', 'error');
        return;
      }

      activas.forEach(function(nombre) {
        var opt = document.createElement('option');
        opt.value = nombre;
        opt.textContent = nombre;
        sel.appendChild(opt);
      });

      if (activas.length === 1) {
        sel.value = activas[0];
        sel.disabled = true;
      } else {
        sel.disabled = false;
      }
      ocultarAlerta();
    })
    .catch(function() {
      if (sel) sel.disabled = false;
    });
}

function obtenerComisariaEvaluacion() {
  var sel = document.getElementById('f-unidad');
  return sel ? sel.value.trim() : '';
}

function cargarPreguntas() {
  mostrarAlerta('Cargando cuestionario...', 'info');
  fetch(LOCAL_API + '/preguntas')
    .then(function(r){ return r.json(); })
    .then(function(data) {
      if (!data.ok || !data.preguntas.length) throw new Error('Sin preguntas');
      PREGUNTAS       = data.preguntas;
      TOTAL_PREGUNTAS = PREGUNTAS.length;
      TOTAL_BLOQUES   = Math.ceil(TOTAL_PREGUNTAS / PREG_POR_BLOQUE);
      ocultarAlerta();
      actualizarInfoBloque();
    })
    .catch(function() {
      // Fallback: usar preguntas del archivo local si la API falla
      if (typeof PREGUNTAS_LOCAL !== 'undefined' && PREGUNTAS_LOCAL.length) {
        PREGUNTAS       = PREGUNTAS_LOCAL;
        TOTAL_PREGUNTAS = PREGUNTAS.length;
        TOTAL_BLOQUES   = Math.ceil(TOTAL_PREGUNTAS / PREG_POR_BLOQUE);
        ocultarAlerta();
        actualizarInfoBloque();
      } else {
        mostrarAlerta('Error cargando cuestionario. Recargue la página.', 'error');
      }
    });
}

/* ================================================================
   FECHA Y EDAD
================================================================ */
function formatearFechaNacimiento(e) {
  var el = e.target;
  var digits = el.value.replace(/\D/g,'').slice(0,8);
  var f = '';
  if (digits.length <= 2)      f = digits;
  else if (digits.length <= 4) f = digits.slice(0,2)+'/'+digits.slice(2);
  else                          f = digits.slice(0,2)+'/'+digits.slice(2,4)+'/'+digits.slice(4);
  el.value = f;
  if (f.length === 10) calcularEdad();
}

function parsearFechaDMY(str) {
  var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((str||'').trim());
  if (!m) return null;
  var d = parseInt(m[1]), mo = parseInt(m[2])-1, y = parseInt(m[3]);
  if (mo<0||mo>11||d<1||d>31||y<1920||y>new Date().getFullYear()) return null;
  var f = new Date(y,mo,d);
  if (f.getFullYear()!==y||f.getMonth()!==mo||f.getDate()!==d||f>new Date()) return null;
  return f;
}

function obtenerEdad(nac) {
  var hoy = new Date(), e = hoy.getFullYear()-nac.getFullYear();
  if (hoy.getMonth()-nac.getMonth()<0||(hoy.getMonth()===nac.getMonth()&&hoy.getDate()<nac.getDate())) e--;
  return e;
}

function esFechaValida(v) { var n=parsearFechaDMY(v); if(!n) return false; var e=obtenerEdad(n); return e>=18&&e<=80; }

function calcularEdad() {
  var input = document.getElementById('f-nacimiento');
  var out   = document.getElementById('f-edad');
  var msg   = document.getElementById('msg-nacimiento');
  var v     = input.value.trim();
  if (!v) { out.value=''; input.className=''; if(msg) msg.textContent='Formato dd/mm/aaaa'; return; }
  var nac = parsearFechaDMY(v);
  if (!nac) { out.value=''; input.classList.add('invalido'); if(msg) msg.textContent='Fecha inválida.'; return; }
  var e = obtenerEdad(nac);
  if (e<18||e>80) { out.value='Verifique'; input.classList.add('invalido'); if(msg) msg.textContent='Edad debe ser 18-80.'; return; }
  out.value = e+' años';
  input.classList.remove('invalido'); input.classList.add('valido');
  if (msg) msg.textContent='';
}

function fechaNacParaEnvio() {
  var nac = parsearFechaDMY(document.getElementById('f-nacimiento').value);
  if (!nac) return '';
  return nac.getFullYear()+'-'+String(nac.getMonth()+1).padStart(2,'0')+'-'+String(nac.getDate()).padStart(2,'0');
}

/* ================================================================
   REGISTRO Y CUESTIONARIO
================================================================ */
function validarRegistro() {
  var err='', campos=[
    {id:'f-unidad',  test:function(v){return v.trim().length>0;},      msg:'Seleccione su comisaría.'},
    {id:'f-nombres', test:function(v){return v.trim().length>2;},      msg:'Ingrese su nombre completo.'},
    {id:'f-cip',     test:function(v){return /^\d{8}$/.test(v.trim());}, msg:'CIP: 8 dígitos.'},
    {id:'f-dni',     test:function(v){return /^\d{8}$/.test(v.trim());}, msg:'DNI: 8 dígitos.'},
    {id:'f-nacimiento',test:esFechaValida, msg:'Fecha de nacimiento inválida (18-80 años).'}
  ];
  campos.forEach(function(c){
    var el=document.getElementById(c.id);
    el.classList.remove('invalido','valido');
    if (!c.test(el.value)){el.classList.add('invalido'); if(!err) err=c.msg;}
    else el.classList.add('valido');
  });
  return err;
}

function ocultarCuestionario() {
  ESTADO.registroCompleto=false;
  var c=document.getElementById('card-cuestionario');
  if(c) c.classList.add('seccion-bloqueada');
  var r=document.getElementById('card-registro');
  if(r) r.classList.remove('card-registro-bloqueado');
}

function activarCuestionario(scroll) {
  ESTADO.registroCompleto=true;
  var c=document.getElementById('card-cuestionario');
  if(c) c.classList.remove('seccion-bloqueada');
  var r=document.getElementById('card-registro');
  if(r) r.classList.add('card-registro-bloqueado');
  renderizarBloque(ESTADO.bloqueActual, !!scroll);
}

function continuarAlCuestionario() {
  if (!PREGUNTAS.length) { mostrarAlerta('Espere a que cargue el cuestionario.','error'); return; }
  var err = validarRegistro();
  if (err) { mostrarAlerta(err,'error'); document.getElementById('card-registro').scrollIntoView({behavior:'smooth'}); return; }
  ocultarAlerta();

  // Verificar progreso guardado
  var cip = document.getElementById('f-cip').value.trim();
  verificarProgresoGuardado(cip, function(data) {
    if (data && data.encontrado && data.total > 0) {
      mostrarBannerProgreso(data);
    } else {
      activarCuestionario(true);
      mostrarAlerta('Cuestionario iniciado. Puede guardar y continuar en otra sesión.','exito');
      setTimeout(ocultarAlerta, 3500);
    }
  });
}

/* ================================================================
   BLOQUES — renderizado por bloques de 50 preguntas
================================================================ */
function actualizarInfoBloque() {
  var el = document.getElementById('texto-pagina');
  if (el) el.textContent = 'Bloque '+ESTADO.bloqueActual+' de '+TOTAL_BLOQUES;
  var er = document.getElementById('texto-respondidas');
  var resp = Object.keys(ESTADO.respuestas).length;
  if (er) er.textContent = resp+' / '+TOTAL_PREGUNTAS+' respondidas';
  var pct = TOTAL_PREGUNTAS>0 ? Math.round(resp/TOTAL_PREGUNTAS*100) : 0;
  var bar = document.getElementById('barra-progreso');
  if (bar) bar.style.width = pct+'%';
  var ip = document.getElementById('info-pagina');
  if (ip) ip.textContent = 'Bloque '+ESTADO.bloqueActual+' de '+TOTAL_BLOQUES+
    ' — '+pct+'% completado';
}

function renderizarBloque(bloque, scroll) {
  if (!ESTADO.registroCompleto) return;
  ESTADO.bloqueActual = bloque;
  var zona   = document.getElementById('zona-preguntas');
  var inicio = (bloque-1)*ESTADO.pregsPorBloque;
  var fin    = Math.min(inicio+ESTADO.pregsPorBloque, TOTAL_PREGUNTAS);
  var subs   = PREGUNTAS.slice(inicio, fin);
  var desde  = inicio+1, hasta = fin;

  var html = '<div class="bloque-header" style="background:#004d3d;color:#fff;padding:8px 14px;border-radius:6px 6px 0 0;font-weight:700;font-size:13px;">'
    +'📋 BLOQUE '+bloque+' / '+TOTAL_BLOQUES+' — Preguntas '+desde+' a '+hasta
    +'</div>'
    +'<table class="tabla-preguntas" role="grid">'
    +'<thead><tr>'
    +'<th class="col-n">#</th>'
    +'<th>Pregunta</th>'
    +'<th class="col-r">V &nbsp; F</th>'
    +'</tr></thead><tbody>';

  subs.forEach(function(p) {
    var r=ESTADO.respuestas[p.id], chkV=r==='V'?'checked':'', chkF=r==='F'?'checked':'', cls=!r?'sin-marcar':'';
    html+='<tr class="'+cls+'" id="fila-'+p.id+'">'
      +'<td class="td-num">'+p.id+'</td>'
      +'<td class="td-texto">'+p.texto+'</td>'
      +'<td class="td-resp"><div class="opciones-si-no">'
        +'<label class="lbl-si"><input type="radio" name="p'+p.id+'" value="V" '+chkV
          +' onchange="guardarRespuesta('+p.id+',\'V\')"> V</label>'
        +'<label class="lbl-no"><input type="radio" name="p'+p.id+'" value="F" '+chkF
          +' onchange="guardarRespuesta('+p.id+',\'F\')"> F</label>'
      +'</div></td></tr>';
  });
  html+='</tbody></table>';
  zona.innerHTML = html;
  actualizarControles();
  actualizarInfoBloque();
  if (scroll!==false) document.getElementById('card-cuestionario').scrollIntoView({behavior:'smooth',block:'start'});
}

function guardarRespuesta(id, val) {
  if (!ESTADO.registroCompleto) return;
  ESTADO.respuestas[id]=val;
  var f=document.getElementById('fila-'+id);
  if(f) f.classList.remove('sin-marcar');
  actualizarInfoBloque();
  autoGuardarProgreso();
}

/* ================================================================
   CONTROLES DE NAVEGACIÓN ENTRE BLOQUES
================================================================ */
function actualizarControles() {
  var b=ESTADO.bloqueActual, esUlt=(b===TOTAL_BLOQUES);
  var btnA=document.getElementById('btn-atras');
  var btnS=document.getElementById('btn-siguiente');
  var btnF=document.getElementById('btn-finalizar');
  var btnG=document.getElementById('btn-guardar-bloque');
  if(btnA) btnA.disabled=(b===1);
  if(btnS) btnS.style.display=esUlt?'none':'inline-flex';
  if(btnF) btnF.style.display=esUlt?'inline-flex':'none';
  if(btnG) btnG.style.display='inline-flex'; // siempre visible
  var ip=document.getElementById('info-pagina');
  if(ip) ip.textContent='Bloque '+b+' de '+TOTAL_BLOQUES;
}

function cambiarBloque(delta) {
  if (!ESTADO.registroCompleto) { mostrarAlerta('Complete primero el Paso 1.','error'); return; }
  var nuevo = ESTADO.bloqueActual + delta;
  if (nuevo<1||nuevo>TOTAL_BLOQUES) return;

  if (delta>0) {
    // Validar que el bloque actual esté completo
    var inicio=(ESTADO.bloqueActual-1)*ESTADO.pregsPorBloque;
    var fin=Math.min(inicio+ESTADO.pregsPorBloque, TOTAL_PREGUNTAS);
    var sinResp=[];
    for(var i=inicio;i<fin;i++) if(!ESTADO.respuestas[PREGUNTAS[i].id]) sinResp.push(PREGUNTAS[i].id);
    if(sinResp.length>0){
      sinResp.forEach(function(id){var f=document.getElementById('fila-'+id);if(f)f.classList.add('sin-marcar');});
      mostrarAlerta('Responda las '+sinResp.length+' pregunta(s) marcadas antes de continuar.','error');
      return;
    }
    // Guardar bloque completado
    guardarBloqueEnServidor();
  }
  ocultarAlerta();
  renderizarBloque(nuevo);
}

/* ================================================================
   GUARDADO POR BLOQUES EN SERVIDOR
================================================================ */
function guardarBloqueEnServidor(callback) {
  var cip       = document.getElementById('f-cip').value.trim();
  var nombres   = document.getElementById('f-nombres').value.trim();
  var comisaria = obtenerComisariaEvaluacion();
  var unidad    = document.getElementById('f-unidad').value.trim();
  var total     = Object.keys(ESTADO.respuestas).length;

  var payload = {
    cip:cip, nombres:nombres, comisaria:comisaria, unidad:unidad,
    bloque:ESTADO.bloqueActual, total:total, respuestas:ESTADO.respuestas
  };

  // Guardar local siempre
  localStorage.setItem('progreso_'+cip, JSON.stringify(payload));

  fetch(LOCAL_API+'/progreso',{
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)
  }).then(function(r){return r.json();})
    .then(function(){
      mostrarIndicadorGuardado('Bloque '+ESTADO.bloqueActual+' guardado ✓');
      if(callback) callback();
    })
    .catch(function(){
      mostrarIndicadorGuardado('Guardado local ✓');
      if(callback) callback();
    });
}

// Botón "Guardar y salir" — guarda y muestra mensaje
function guardarYSalir() {
  guardarBloqueEnServidor(function(){
    mostrarAlerta('✅ Progreso guardado. Puede cerrar y retomar después con su CIP.','exito');
  });
}

// Auto-guardar cada 5 respuestas (silencioso)
var AUTO_SAVE_COUNTER = 0;
function autoGuardarProgreso() {
  AUTO_SAVE_COUNTER++;
  if (AUTO_SAVE_COUNTER % 5 !== 0) return;
  var cip = document.getElementById('f-cip') ? document.getElementById('f-cip').value.trim() : '';
  if (!cip) return;
  var payload = {
    cip:cip,
    nombres:   (document.getElementById('f-nombres')||{}).value||'',
    comisaria: obtenerComisariaEvaluacion(),
    unidad:    (document.getElementById('f-unidad')||{}).value||'',
    bloque:ESTADO.bloqueActual, total:Object.keys(ESTADO.respuestas).length,
    respuestas:ESTADO.respuestas
  };
  localStorage.setItem('progreso_'+cip, JSON.stringify(payload));
  fetch(LOCAL_API+'/progreso',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}).catch(function(){});
  mostrarIndicadorGuardado();
}

/* ================================================================
   VERIFICAR Y RESTAURAR PROGRESO POR CIP
================================================================ */
function verificarProgresoGuardado(cip, callback) {
  if (!cip) { if(callback) callback(null); return; }

  // Primero buscar en servidor
  fetch(LOCAL_API+'/progreso?cip='+encodeURIComponent(cip))
    .then(function(r){return r.json();})
    .then(function(data){
      if(data.ok && data.encontrado && data.total>0) { if(callback) callback(data); }
      else {
        // Buscar en localStorage
        var local = localStorage.getItem('progreso_'+cip);
        if(local){try{var d=JSON.parse(local);if(d.total>0){if(callback)callback(d);}else if(callback)callback(null);}catch(e){if(callback)callback(null);}}
        else if(callback) callback(null);
      }
    })
    .catch(function(){
      var local=localStorage.getItem('progreso_'+cip);
      if(local){try{var d=JSON.parse(local);if(callback)callback(d.total>0?d:null);}catch(e){if(callback)callback(null);}}
      else if(callback) callback(null);
    });
}

function mostrarBannerProgreso(data) {
  var banner=document.getElementById('banner-progreso');
  var info=document.getElementById('banner-progreso-info');
  var total=data.total||0, bloque=data.bloque||1;
  var pct=TOTAL_PREGUNTAS>0?Math.round(total/TOTAL_PREGUNTAS*100):0;
  info.textContent='Bloque '+bloque+' de '+TOTAL_BLOQUES+' — '+total+' / '+TOTAL_PREGUNTAS+' preguntas ('+pct+'%)';
  banner.style.display='flex';
  banner._data=data;
}

function restaurarProgreso() {
  var data=document.getElementById('banner-progreso')._data;
  if(!data) return;
  if(data.cip)     document.getElementById('f-cip').value    =data.cip;
  if(data.nombres) document.getElementById('f-nombres').value=data.nombres;
  if(data.comisaria) seleccionarComisariaEnSelect('f-unidad',data.comisaria);
  ESTADO.respuestas   = typeof data.respuestas==='string'?JSON.parse(data.respuestas):(data.respuestas||{});
  ESTADO.bloqueActual = parseInt(data.bloque)||1;
  document.getElementById('banner-progreso').style.display='none';
  activarCuestionario(true);
  mostrarAlerta('✅ Progreso restaurado — continúa desde el bloque '+ESTADO.bloqueActual,'exito');
  setTimeout(ocultarAlerta,4000);
}

function descartarProgreso() {
  document.getElementById('banner-progreso').style.display='none';
  ESTADO.respuestas={};
  ESTADO.bloqueActual=1;
  activarCuestionario(true);
}

/* ================================================================
   ENVÍO FINAL
================================================================ */
function validarYEnviar() {
  var err=validarRegistro();
  if(err){mostrarAlerta(err,'error'); ocultarCuestionario(); document.getElementById('card-registro').scrollIntoView({behavior:'smooth'}); return;}

  var sinRes=PREGUNTAS.filter(function(p){return !ESTADO.respuestas[p.id];});
  if(sinRes.length>0){
    mostrarAlerta('Faltan '+sinRes.length+' preguntas sin responder. Revise todos los bloques.','error');
    return;
  }

  var nombres=document.getElementById('f-nombres').value.trim();
  var dni=document.getElementById('f-dni').value.trim();
  var comis = obtenerComisariaEvaluacion();
  if(!confirm('¿Confirmar envío del cuestionario?\n\n'+nombres+'\nDNI: '+dni+'\nComisaría: '+comis)) return;
  enviarEvaluacion();
}

function enviarEvaluacion() {
  var overlay=document.getElementById('overlay-envio');
  var spinner=document.getElementById('spinner-overlay');
  var checkIcon=document.getElementById('check-ok-icon');
  var textoO=document.getElementById('texto-overlay');
  var subtextoO=document.getElementById('subtexto-overlay');

  overlay.classList.add('visible');

  var respObj={};
  PREGUNTAS.forEach(function(p){ respObj[p.id]=ESTADO.respuestas[p.id]||''; });

  var payload={
    comisaria: obtenerComisariaEvaluacion(),
    unidad:    document.getElementById('f-unidad').value.trim(),
    nombres:   document.getElementById('f-nombres').value.trim(),
    cip:       document.getElementById('f-cip').value.trim(),
    dni:       document.getElementById('f-dni').value.trim(),
    fecha_nac: fechaNacParaEnvio(),
    edad:      parseInt(document.getElementById('f-edad').value)||0,
    respuestas:respObj,
    completada:true
  };

  fetch(LOCAL_API+'/guardar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
    .then(function(r){return r.json();})
    .then(function(data){
      if(!data.ok) throw new Error(data.error||'Error del servidor');
      spinner.style.display='none';
      checkIcon.style.display='block';
      textoO.textContent='¡Cuestionario enviado correctamente!';
      subtextoO.textContent=payload.nombres+' | CIP: '+payload.cip;
      // Limpiar progreso guardado
      localStorage.removeItem('progreso_'+payload.cip);
      setTimeout(function(){overlay.classList.remove('visible'); limpiarFormulario();},5000);
    })
    .catch(function(err){
      spinner.style.display='none';
      textoO.textContent='Error: '+(err.message||'Verifique conexión.');
      textoO.style.color='#ffaaaa';
      setTimeout(function(){overlay.classList.remove('visible');spinner.style.display='block';textoO.textContent='Enviando...';textoO.style.color='';},5000);
    });
}

function limpiarFormulario() {
  ['f-unidad','f-nombres','f-cip','f-dni','f-nacimiento','f-edad'].forEach(function(id){document.getElementById(id).value='';});
  ESTADO.respuestas={}; ESTADO.bloqueActual=1;
  ocultarCuestionario(); actualizarControles(); actualizarInfoBloque();
  document.getElementById('zona-preguntas').innerHTML='';
  window.scrollTo({top:0,behavior:'smooth'});
}

/* ================================================================
   UI HELPERS
================================================================ */
function mostrarAlerta(msg, tipo) {
  var el=document.getElementById('alerta-global');
  document.getElementById('texto-alerta-global').textContent=msg;
  el.className='alerta alerta-'+(tipo==='error'?'error':tipo==='info'?'info':'exito')+' visible';
}
function ocultarAlerta() {
  var el=document.getElementById('alerta-global');
  if(el) el.classList.remove('visible');
}

function mostrarIndicadorGuardado(msg) {
  var ind=document.getElementById('indicador-guardado');
  if(!ind){
    ind=document.createElement('div'); ind.id='indicador-guardado';
    ind.style.cssText='position:fixed;bottom:18px;left:50%;transform:translateX(-50%);background:rgba(0,77,61,.92);color:#fff;padding:7px 18px;border-radius:20px;font-size:12px;font-weight:600;z-index:9999;pointer-events:none;transition:opacity .4s;';
    document.body.appendChild(ind);
  }
  ind.innerHTML='<i class="fas fa-cloud-upload-alt"></i> '+(msg||'Guardando...');
  ind.style.opacity='1';
  clearTimeout(ind._t);
  ind._t=setTimeout(function(){ind.style.opacity='0';},2500);
}

function abrirPanelAdmin(e) {
  if(e) e.preventDefault();
  window.open('panel-admin.html','regpol_panel','noopener,noreferrer');
  return false;
}

