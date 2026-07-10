/* Recursos Humanos — panel admin REGPOL Callao */
(function(global) {
  'use strict';

  var API = function() {
    return (typeof regpolApiBase === 'function') ? regpolApiBase() : (window.REGPOL_API_BASE || '');
  };
  var token = function() {
    try {
      var s = JSON.parse(localStorage.getItem('regpol_session') || 'null');
      return (s && s.token) || TOKEN || '';
    } catch (e) { return TOKEN || ''; }
  };
  var hdr = function() { return { 'x-admin-token': token(), 'Content-Type': 'application/json' }; };

  var RRHH_MODO = 'lista';
  var RRHH_PAGINA = 1;
  var RRHH_CACHE_CIP = null;
  var RRHH_DIVISIONES = [];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function qsFiltros() {
    var div = (document.getElementById('rrhh-f-div') || {}).value || '';
    var uni = (document.getElementById('rrhh-f-uni') || {}).value || '';
    var sit = (document.getElementById('rrhh-f-sit') || {}).value || '';
    var bus = (document.getElementById('rrhh-f-bus') || {}).value || '';
    var p = new URLSearchParams();
    if (div) p.set('division', div);
    if (uni) p.set('unidad', uni);
    if (sit) p.set('situacion', sit);
    if (bus) p.set('busqueda', bus);
    return p;
  }

  function puedeRRHH() {
    if (typeof esUnitic === 'function' && esUnitic()) return true;
    if (typeof tienePermiso === 'function' && tienePermiso('recursos_humanos')) return true;
    return false;
  }

  function cerrarModalRRHH(id) {
    var m = document.getElementById(id);
    if (m) m.classList.remove('open');
  }

  function abrirModalRRHH(id) {
    var m = document.getElementById(id);
    if (m) m.classList.add('open');
  }

  async function cargarFiltrosRRHH() {
    try {
      var r = await fetch(API() + '/admin/divisiones', { headers: hdr() });
      var d = await r.json();
      if (!d.ok) return;
      RRHH_DIVISIONES = d.divisiones || [];
      var selD = document.getElementById('rrhh-f-div');
      var selU = document.getElementById('rrhh-f-uni');
      if (!selD) return;
      var curD = selD.value;
      var curU = selU ? selU.value : '';
      selD.innerHTML = '<option value="">Todas las divisiones</option>';
      RRHH_DIVISIONES.forEach(function(div) {
        selD.innerHTML += '<option value="' + esc(div.nombre) + '">' + esc(div.nombre) + '</option>';
      });
      if (curD) selD.value = curD;
      llenarUnidadesFiltro(curU);
      llenarSelectUnidadModal('rrhh-m-unidad');
    } catch (e) { /* ignore */ }
  }

  function llenarUnidadesFiltro(keep) {
    var selD = document.getElementById('rrhh-f-div');
    var selU = document.getElementById('rrhh-f-uni');
    if (!selU) return;
    var divNom = selD ? selD.value : '';
    selU.innerHTML = '<option value="">Todas las unidades</option>';
    RRHH_DIVISIONES.forEach(function(div) {
      if (divNom && div.nombre !== divNom) return;
      (div.unidades || []).forEach(function(u) {
        var nom = typeof u === 'string' ? u : u.nombre;
        selU.innerHTML += '<option value="' + esc(nom) + '">' + esc(nom) + '</option>';
      });
    });
    if (keep) selU.value = keep;
  }

  function llenarSelectUnidadModal(id) {
    var sel = document.getElementById(id);
    if (!sel) return;
    var cur = sel.value;
    sel.innerHTML = '<option value="">— Seleccionar unidad —</option>';
    RRHH_DIVISIONES.forEach(function(div) {
      var og = document.createElement('optgroup');
      og.label = div.nombre;
      (div.unidades || []).forEach(function(u) {
        var nom = typeof u === 'string' ? u : u.nombre;
        var opt = document.createElement('option');
        opt.value = nom;
        opt.textContent = nom;
        opt.setAttribute('data-division', div.nombre);
        og.appendChild(opt);
      });
      sel.appendChild(og);
    });
    if (cur) sel.value = cur;
  }

  function onFiltroDivisionRRHH() {
    llenarUnidadesFiltro('');
  }

  async function cargarStatsRRHH() {
    var el = document.getElementById('rrhh-stats');
    if (!el) return;
    try {
      var r = await fetch(API() + '/admin/rrhh/stats?' + qsFiltros().toString(), { headers: hdr() });
      var d = await r.json();
      if (!d.ok) return;
      var s = d.stats || {};
      el.innerHTML =
        '<div class="stat"><div class="n">' + (s.total || 0) + '</div><div class="l">Total filtro</div></div>' +
        '<div class="stat"><div class="n">' + (s.oficiales || 0) + '</div><div class="l">Oficiales</div></div>' +
        '<div class="stat"><div class="n">' + (s.subalternos || 0) + '</div><div class="l">Subalternos</div></div>' +
        '<div class="stat" style="border-color:#c8e6e8;"><div class="n" style="color:#004d3d;">' + (s.activos || 0) + '</div><div class="l">Activos</div></div>' +
        '<div class="stat" style="border-color:#f5c6cb;"><div class="n" style="color:#c0392b;">' + (s.bajas || 0) + '</div><div class="l">Bajas</div></div>';
    } catch (e) {
      el.innerHTML = '';
    }
  }

  async function cargarNominaRRHH(pagina) {
    if (!puedeRRHH()) return;
    if (pagina) RRHH_PAGINA = pagina;
    await cargarStatsRRHH();
    var info = document.getElementById('rrhh-tabla-info');
    var body = document.getElementById('rrhh-tabla-body');
    var acc = document.getElementById('rrhh-acordeon');
    var wrapLista = document.getElementById('rrhh-wrap-lista');
    var wrapAcc = document.getElementById('rrhh-wrap-acordeon');

    if (RRHH_MODO === 'acordeon') {
      if (wrapLista) wrapLista.style.display = 'none';
      if (wrapAcc) wrapAcc.style.display = '';
      if (acc) acc.innerHTML = '<p style="color:#888;padding:16px;text-align:center;">Cargando...</p>';
      try {
        var p = qsFiltros();
        p.set('modo', 'acordeon');
        var r = await fetch(API() + '/admin/rrhh/personal?' + p.toString(), { headers: hdr() });
        var d = await r.json();
        if (!d.ok) {
          acc.innerHTML = '<p style="color:#c0392b;padding:16px;">' + esc(d.error || 'Error') + '</p>';
          return;
        }
        if (info) info.textContent = 'Total: ' + (d.total || 0) + ' efectivo(s)';
        if (!(d.acordeon || []).length) {
          acc.innerHTML = '<p style="color:#888;padding:16px;text-align:center;">Sin resultados.</p>';
          return;
        }
        var html = '';
        d.acordeon.forEach(function(g, gi) {
          html += '<div class="rrhh-acc-div">' +
            '<div class="rrhh-acc-div-h" onclick="rrhhToggleAcc(this)">' +
            '<i class="fas fa-chevron-down"></i> ' + esc(g.division) +
            ' <span class="rrhh-acc-n">' + g.total + '</span></div>' +
            '<div class="rrhh-acc-div-b">';
          (g.unidades || []).forEach(function(u) {
            html += '<div class="rrhh-acc-uni">' +
              '<div class="rrhh-acc-uni-h" onclick="rrhhToggleAcc(this)">' +
              '<i class="fas fa-chevron-down"></i> ' + esc(u.unidad) +
              ' <span class="rrhh-acc-n">' + u.total + '</span></div>' +
              '<div class="rrhh-acc-uni-b"><table class="t"><thead><tr>' +
              '<th class="col-num">N°</th><th>CIP</th><th>Grado</th><th>Apellidos y nombres</th><th>Situación</th><th class="col-acciones">Acciones</th>' +
              '</tr></thead><tbody>';
            (u.personal || []).forEach(function(row, idx) {
              html += filaBasicaHTML(row, idx + 1);
            });
            html += '</tbody></table></div></div>';
          });
          html += '</div></div>';
        });
        acc.innerHTML = html;
      } catch (e) {
        acc.innerHTML = '<p style="color:#c0392b;padding:16px;">Error de red</p>';
      }
      return;
    }

    if (wrapLista) wrapLista.style.display = '';
    if (wrapAcc) wrapAcc.style.display = 'none';
    if (body) body.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#888;padding:20px;">Cargando...</td></tr>';
    try {
      var p2 = qsFiltros();
      p2.set('pagina', String(RRHH_PAGINA));
      p2.set('por_pagina', '100');
      var r2 = await fetch(API() + '/admin/rrhh/personal?' + p2.toString(), { headers: hdr() });
      var d2 = await r2.json();
      if (!d2.ok) {
        body.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#c0392b;">' + esc(d2.error || 'Error') + '</td></tr>';
        return;
      }
      if (info) {
        info.textContent = 'Total: ' + d2.total + ' · Página ' + d2.pagina +
          ' · Mostrando ' + (d2.personal || []).length + ' · Orden: grado (General → abajo)';
      }
      if (!(d2.personal || []).length) {
        body.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#888;padding:20px;">Sin resultados.</td></tr>';
        return;
      }
      var baseNum = ((d2.pagina || 1) - 1) * (d2.por_pagina || 100);
      body.innerHTML = d2.personal.map(function(row, idx) {
        return '<tr>' +
          '<td class="col-num">' + (baseNum + idx + 1) + '</td>' +
          '<td>' + esc(row.cip) + '</td>' +
          '<td>' + esc(row.grado) + '</td>' +
          '<td>' + esc(row.apellidos_nombres) + '</td>' +
          '<td>' + esc(row.unidad_nombre) + '</td>' +
          '<td>' + esc(row.situacion) + '</td>' +
          '<td>' + esc(row.categoria) + '</td>' +
          '<td class="col-acciones">' + botonesAccion(row.cip) + '</td></tr>';
      }).join('');
      renderPaginacion(d2.total, d2.pagina, d2.por_pagina);
    } catch (e) {
      body.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#c0392b;">Error de red</td></tr>';
    }
  }

  function filaBasicaHTML(row, num) {
    return '<tr>' +
      '<td class="col-num">' + (num || '') + '</td>' +
      '<td>' + esc(row.cip) + '</td>' +
      '<td>' + esc(row.grado) + '</td>' +
      '<td>' + esc(row.apellidos_nombres) + '</td>' +
      '<td>' + esc(row.situacion) + '</td>' +
      '<td class="col-acciones">' + botonesAccion(row.cip) + '</td></tr>';
  }

  function botonesAccion(cip) {
    var c = esc(cip);
    return '<div class="btn-acciones-celda">' +
      '<button type="button" class="btn-mini" onclick="rrhhVer(\'' + c + '\')"><i class="fas fa-eye"></i> Ver</button>' +
      '<button type="button" class="btn-mini btn-mini-ok" onclick="rrhhEditar(\'' + c + '\')"><i class="fas fa-edit"></i> Editar</button>' +
      '<button type="button" class="btn-mini btn-mini-danger" onclick="rrhhEliminar(\'' + c + '\')"><i class="fas fa-trash"></i></button>' +
      '</div>';
  }

  function renderPaginacion(total, pagina, porPagina) {
    var el = document.getElementById('rrhh-paginacion');
    if (!el) return;
    var pages = Math.max(1, Math.ceil(total / porPagina));
    if (pages <= 1) { el.innerHTML = ''; return; }
    var html = '';
    if (pagina > 1) {
      html += '<button class="btn-mini" type="button" onclick="cargarNominaRRHH(' + (pagina - 1) + ')">Anterior</button>';
    }
    html += '<span style="font-size:12px;color:#666;margin:0 8px;">' + pagina + ' / ' + pages + '</span>';
    if (pagina < pages) {
      html += '<button class="btn-mini" type="button" onclick="cargarNominaRRHH(' + (pagina + 1) + ')">Siguiente</button>';
    }
    el.innerHTML = html;
  }

  function setModoRRHH(modo) {
    RRHH_MODO = modo === 'acordeon' ? 'acordeon' : 'lista';
    var b1 = document.getElementById('rrhh-btn-lista');
    var b2 = document.getElementById('rrhh-btn-acordeon');
    if (b1) b1.classList.toggle('btn-mini-solid', RRHH_MODO === 'lista');
    if (b2) b2.classList.toggle('btn-mini-solid', RRHH_MODO === 'acordeon');
    cargarNominaRRHH(1);
  }

  function rrhhToggleAcc(el) {
    if (!el) return;
    el.classList.toggle('collapsed');
    var body = el.nextElementSibling;
    if (body) body.classList.toggle('hidden');
  }

  function limpiarModalFicha() {
    RRHH_CACHE_CIP = null;
    ['rrhh-m-cip', 'rrhh-m-dni', 'rrhh-m-nombres', 'rrhh-m-grado', 'rrhh-m-cargo',
      'rrhh-m-sexo', 'rrhh-m-fnac', 'rrhh-m-tel', 'rrhh-m-correo', 'rrhh-m-domicilio',
      'rrhh-m-cip-confirm'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.value = '';
    });
    var sit = document.getElementById('rrhh-m-situacion');
    if (sit) sit.value = 'ACTIVO';
    var cat = document.getElementById('rrhh-m-categoria');
    if (cat) cat.value = 'SUBALTERNO';
    var uni = document.getElementById('rrhh-m-unidad');
    if (uni) uni.value = '';
    var aud = document.getElementById('rrhh-m-auditoria');
    if (aud) aud.innerHTML = '';
  }

  function setModalSoloLectura(solo) {
    ['rrhh-m-dni', 'rrhh-m-nombres', 'rrhh-m-grado', 'rrhh-m-cargo', 'rrhh-m-sexo',
      'rrhh-m-fnac', 'rrhh-m-tel', 'rrhh-m-correo', 'rrhh-m-domicilio',
      'rrhh-m-situacion', 'rrhh-m-categoria', 'rrhh-m-unidad'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.disabled = !!solo;
    });
    var cip = document.getElementById('rrhh-m-cip');
    if (cip) cip.disabled = true;
    var btn = document.getElementById('rrhh-m-guardar');
    if (btn) btn.style.display = solo ? 'none' : '';
  }

  function llenarModalFicha(p) {
    document.getElementById('rrhh-m-cip').value = p.cip || '';
    document.getElementById('rrhh-m-dni').value = p.dni || '';
    document.getElementById('rrhh-m-nombres').value = p.apellidos_nombres || '';
    document.getElementById('rrhh-m-grado').value = p.grado || '';
    document.getElementById('rrhh-m-cargo').value = p.cargo || '';
    document.getElementById('rrhh-m-sexo').value = p.sexo || '';
    document.getElementById('rrhh-m-fnac').value = p.fecha_nac ? String(p.fecha_nac).slice(0, 10) : '';
    document.getElementById('rrhh-m-tel').value = p.telefono || '';
    document.getElementById('rrhh-m-correo').value = p.correo || '';
    document.getElementById('rrhh-m-domicilio').value = p.domicilio || '';
    document.getElementById('rrhh-m-situacion').value = p.situacion || 'ACTIVO';
    document.getElementById('rrhh-m-categoria').value = p.categoria || 'SUBALTERNO';
    llenarSelectUnidadModal('rrhh-m-unidad');
    document.getElementById('rrhh-m-unidad').value = p.unidad_nombre || '';
  }

  async function rrhhVer(cip) {
    await abrirFicha(cip, true);
  }

  async function rrhhEditar(cip) {
    await abrirFicha(cip, false);
  }

  async function abrirFicha(cip, soloLectura) {
    try {
      var r = await fetch(API() + '/admin/rrhh/personal/' + encodeURIComponent(cip), { headers: hdr() });
      var d = await r.json();
      if (!d.ok) { alert(d.error || 'No encontrado'); return; }
      RRHH_CACHE_CIP = d.personal.cip;
      document.getElementById('rrhh-m-titulo').innerHTML =
        '<i class="fas fa-id-card"></i> ' + (soloLectura ? 'Ver efectivo' : 'Editar efectivo');
      limpiarModalFicha();
      RRHH_CACHE_CIP = d.personal.cip;
      llenarModalFicha(d.personal);
      setModalSoloLectura(soloLectura);
      var aud = document.getElementById('rrhh-m-auditoria');
      if (aud) {
        if ((d.auditoria || []).length) {
          aud.innerHTML = '<p style="font-size:11px;color:#666;margin:8px 0 4px;"><strong>Últimos cambios</strong></p>' +
            '<ul style="font-size:11px;color:#555;margin:0;padding-left:16px;">' +
            d.auditoria.map(function(a) {
              return '<li>' + esc(a.creado_en) + ' — ' + esc(a.admin_usuario) +
                ' · ' + esc(a.accion) + (a.detalle ? ': ' + esc(a.detalle) : '') + '</li>';
            }).join('') + '</ul>';
        } else aud.innerHTML = '';
      }
      var delBox = document.getElementById('rrhh-m-del-box');
      if (delBox) delBox.style.display = 'none';
      abrirModalRRHH('modal-rrhh-ficha');
    } catch (e) {
      alert('Error de red');
    }
  }

  function rrhhNuevo() {
    RRHH_CACHE_CIP = null;
    document.getElementById('rrhh-m-titulo').innerHTML = '<i class="fas fa-user-plus"></i> Nuevo efectivo';
    limpiarModalFicha();
    llenarSelectUnidadModal('rrhh-m-unidad');
    var cip = document.getElementById('rrhh-m-cip');
    if (cip) { cip.disabled = false; cip.value = ''; }
    setModalSoloLectura(false);
    if (cip) cip.disabled = false;
    var aud = document.getElementById('rrhh-m-auditoria');
    if (aud) aud.innerHTML = '';
    var delBox = document.getElementById('rrhh-m-del-box');
    if (delBox) delBox.style.display = 'none';
    abrirModalRRHH('modal-rrhh-ficha');
  }

  async function rrhhGuardar() {
    var cipEl = document.getElementById('rrhh-m-cip');
    var uniEl = document.getElementById('rrhh-m-unidad');
    var body = {
      cip: cipEl.value,
      dni: document.getElementById('rrhh-m-dni').value,
      apellidos_nombres: document.getElementById('rrhh-m-nombres').value,
      grado: document.getElementById('rrhh-m-grado').value,
      cargo: document.getElementById('rrhh-m-cargo').value,
      sexo: document.getElementById('rrhh-m-sexo').value,
      fecha_nac: document.getElementById('rrhh-m-fnac').value,
      telefono: document.getElementById('rrhh-m-tel').value,
      correo: document.getElementById('rrhh-m-correo').value,
      domicilio: document.getElementById('rrhh-m-domicilio').value,
      situacion: document.getElementById('rrhh-m-situacion').value,
      categoria: document.getElementById('rrhh-m-categoria').value,
      unidad_nombre: uniEl.value
    };
    var opt = uniEl.options[uniEl.selectedIndex];
    if (opt) body.division_nombre = opt.getAttribute('data-division') || '';

    if (!body.unidad_nombre) { alert('Seleccione la unidad'); return; }
    if (!body.apellidos_nombres) { alert('Ingrese apellidos y nombres'); return; }

    try {
      var url, method;
      if (RRHH_CACHE_CIP) {
        url = API() + '/admin/rrhh/personal/' + encodeURIComponent(RRHH_CACHE_CIP);
        method = 'PUT';
        delete body.cip;
      } else {
        if (!body.cip) { alert('Ingrese CIP'); return; }
        url = API() + '/admin/rrhh/personal';
        method = 'POST';
      }
      var r = await fetch(url, { method: method, headers: hdr(), body: JSON.stringify(body) });
      var d = await r.json();
      if (!d.ok) { alert(d.error || 'No se pudo guardar'); return; }
      cerrarModalRRHH('modal-rrhh-ficha');
      cargarNominaRRHH(RRHH_PAGINA);
    } catch (e) {
      alert('Error de red');
    }
  }

  function rrhhEliminar(cip) {
    RRHH_CACHE_CIP = cip;
    document.getElementById('rrhh-del-cip-label').textContent = cip;
    document.getElementById('rrhh-del-cip-confirm').value = '';
    abrirModalRRHH('modal-rrhh-eliminar');
  }

  async function rrhhConfirmarEliminar() {
    var conf = document.getElementById('rrhh-del-cip-confirm').value;
    if (!RRHH_CACHE_CIP) return;
    try {
      var r = await fetch(API() + '/admin/rrhh/personal/' + encodeURIComponent(RRHH_CACHE_CIP), {
        method: 'DELETE',
        headers: hdr(),
        body: JSON.stringify({ cip_confirm: conf })
      });
      var d = await r.json();
      if (!d.ok) { alert(d.error || 'No se pudo eliminar'); return; }
      cerrarModalRRHH('modal-rrhh-eliminar');
      cargarNominaRRHH(RRHH_PAGINA);
    } catch (e) {
      alert('Error de red');
    }
  }

  async function cargarCuadroRRHH() {
    var prev = document.getElementById('rrhh-cuadro-preview');
    if (prev) prev.innerHTML = '<p style="color:#888;padding:12px;">Cargando vista previa...</p>';
    try {
      var p = qsFiltrosReportes();
      var r = await fetch(API() + '/admin/rrhh/cuadro?' + p.toString(), { headers: hdr() });
      var d = await r.json();
      if (!d.ok) {
        prev.innerHTML = '<p style="color:#c0392b;">' + esc(d.error || 'Error') + '</p>';
        return;
      }
      var html = '<div style="margin-bottom:10px;font-size:12px;color:#666;">Vista previa del cuadro · Total: <strong>' +
        (d.totales && d.totales.total || 0) + '</strong> (Ofic. ' + (d.totales && d.totales.oficiales || 0) +
        ' · Subalt. ' + (d.totales && d.totales.subalternos || 0) + ')</div>';
      html += '<div style="overflow:auto;max-height:58vh;border:1px solid #e0e8e0;border-radius:8px;">';
      html += '<table class="t" style="margin:0;"><thead><tr><th>División</th><th>Unidad</th><th>Oficiales</th><th>Subalternos</th><th>Total</th></tr></thead><tbody>';
      (d.divisiones || []).forEach(function(g) {
        (g.unidades || []).forEach(function(u) {
          html += '<tr><td>' + esc(u.division_nombre) + '</td><td>' + esc(u.unidad_nombre) +
            '</td><td>' + u.oficiales + '</td><td>' + u.subalternos + '</td><td><strong>' + u.total + '</strong></td></tr>';
        });
        html += '<tr style="background:#f0f7f5;"><td colspan="2"><strong>TOTAL ' + esc(g.division) +
          '</strong></td><td><strong>' + g.oficiales + '</strong></td><td><strong>' + g.subalternos +
          '</strong></td><td><strong>' + g.total + '</strong></td></tr>';
      });
      html += '<tr style="background:#004d3d;color:#fff;"><td colspan="2"><strong>TOTAL GENERAL REGPOL-CALLAO</strong></td><td><strong>' +
        (d.totales.oficiales || 0) + '</strong></td><td><strong>' + (d.totales.subalternos || 0) +
        '</strong></td><td><strong>' + (d.totales.total || 0) + '</strong></td></tr>';
      html += '</tbody></table></div>';
      prev.innerHTML = html;
    } catch (e) {
      prev.innerHTML = '<p style="color:#c0392b;">Error de red</p>';
    }
  }

  function qsFiltrosReportes() {
    var div = (document.getElementById('rrhh-r-div') || {}).value || '';
    var p = new URLSearchParams();
    if (div) p.set('division', div);
    return p;
  }

  function exportarRRHH(tipo, formato) {
    var p = tipo === 'cuadro' ? qsFiltrosReportes() : qsFiltros();
    p.set('tipo', tipo === 'cuadro' ? 'cuadro' : 'listado');
    var url = API() + '/admin/rrhh/exportar.' + (formato === 'pdf' ? 'pdf' : 'xlsx') + '?' + p.toString() +
      '&token=' + encodeURIComponent(token());
    window.open(url, '_blank');
  }

  async function rrhhInit() {
    if (!puedeRRHH()) return;
    await cargarFiltrosRRHH();
    var selR = document.getElementById('rrhh-r-div');
    if (selR && RRHH_DIVISIONES.length) {
      var cur = selR.value;
      selR.innerHTML = '<option value="">Todas las divisiones</option>';
      RRHH_DIVISIONES.forEach(function(div) {
        selR.innerHTML += '<option value="' + esc(div.nombre) + '">' + esc(div.nombre) + '</option>';
      });
      if (cur) selR.value = cur;
    }
    if (document.getElementById('page-rrhh-nomina') &&
        document.getElementById('page-rrhh-nomina').classList.contains('on')) {
      cargarNominaRRHH(1);
    }
    if (document.getElementById('page-rrhh-reportes') &&
        document.getElementById('page-rrhh-reportes').classList.contains('on')) {
      cargarCuadroRRHH();
    }
  }

  global.rrhhInit = rrhhInit;
  global.cargarNominaRRHH = cargarNominaRRHH;
  global.cargarCuadroRRHH = cargarCuadroRRHH;
  global.onFiltroDivisionRRHH = onFiltroDivisionRRHH;
  global.setModoRRHH = setModoRRHH;
  global.rrhhToggleAcc = rrhhToggleAcc;
  global.rrhhVer = rrhhVer;
  global.rrhhEditar = rrhhEditar;
  global.rrhhNuevo = rrhhNuevo;
  global.rrhhGuardar = rrhhGuardar;
  global.rrhhEliminar = rrhhEliminar;
  global.rrhhConfirmarEliminar = rrhhConfirmarEliminar;
  global.cerrarModalRRHH = cerrarModalRRHH;
  global.exportarRRHH = exportarRRHH;
  global.puedeGestionRRHH = puedeRRHH;
})(window);
