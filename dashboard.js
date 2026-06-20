/* ================================================================
   Dashboard MMPI-2 — REGPOL Callao
   Ing. Anthony Ccayo - UNITIC - 2026
================================================================ */

var WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzHHCUjXQVNtgVTERGx3RuiGPfSHuhCgTVddHL8ByDJUE-lLQessVsdFCFabayhCC5u/exec';
var ADMIN_PASS  = 'AdminUNITIC2026';

var chartComisarias = null;
var chartEstado     = null;
var datosGlobales   = null;

// ── AUTH ──────────────────────────────────────────────────────────────────────
function verificarDash() {
  var pass = document.getElementById('dash-pass').value;
  if (pass === ADMIN_PASS) {
    document.getElementById('dash-login').style.display    = 'none';
    document.getElementById('dash-contenido').style.display = 'block';
    document.body.classList.add('dash-autenticado');
    sessionStorage.setItem('dashAuth', '1');
    cargarDatos();
  } else {
    document.getElementById('dash-error').style.display = 'block';
    document.getElementById('dash-pass').value = '';
    document.getElementById('dash-pass').focus();
  }
}

// ── CARGA DE DATOS ────────────────────────────────────────────────────────────
function cargarDatos() {
  var ico = document.getElementById('ico-refresh');
  if (ico) ico.classList.add('fa-spin');

  fetch(WEB_APP_URL + '?action=stats')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data.ok) throw new Error('Error en respuesta');
      datosGlobales = data;
      renderKPIs(data);
      renderChartComisarias(data.porComisaria);
      renderChartEstado(data);
      renderTabla(data.ultimasEvaluaciones);
      poblarSelectComisaria(data.porComisaria);
      document.getElementById('dash-ultima-act').textContent =
        'Última actualización: ' + new Date().toLocaleTimeString('es-PE');
      if (ico) ico.classList.remove('fa-spin');
    })
    .catch(function(err) {
      console.error(err);
      if (ico) ico.classList.remove('fa-spin');
      document.getElementById('tbody-ultimas').innerHTML =
        '<tr><td colspan="4" class="tabla-error"><i class="fas fa-exclamation-triangle"></i> Error al conectar con el servidor. Verifica la Web App.</td></tr>';
    });
}

// ── KPIs ──────────────────────────────────────────────────────────────────────
function renderKPIs(data) {
  animarNumero('kpi-total',      data.totalCompletas    || 0);
  animarNumero('kpi-progreso',   data.progresosActivos  || 0);
  animarNumero('kpi-comisarias', (data.porComisaria || []).length);

  // Contar las de hoy (últimas 24h comparando fechas en el listado)
  var hoy = new Date().toLocaleDateString('es-PE');
  var hoyCount = (data.ultimasEvaluaciones || []).filter(function(e) {
    return (e.fecha || '').startsWith(hoy.split('/').reverse().join('/').substring(0,5)) ||
           (e.fecha || '').substring(0,8).split('/').join('/') === hoy.substring(0,5);
  }).length;
  animarNumero('kpi-hoy', hoyCount);
}

function animarNumero(id, fin) {
  var el = document.getElementById(id);
  if (!el) return;
  var inicio = 0, dur = 800, paso = 16;
  var incremento = fin / (dur / paso);
  var timer = setInterval(function() {
    inicio += incremento;
    if (inicio >= fin) { inicio = fin; clearInterval(timer); }
    el.textContent = Math.floor(inicio).toLocaleString('es-PE');
  }, paso);
}

// ── CHART BARRAS POR COMISARÍA ────────────────────────────────────────────────
function renderChartComisarias(porComisaria) {
  if (!porComisaria || !porComisaria.length) return;

  var labels = porComisaria.map(function(c) {
    return c.nombre.replace('COMISARIA PNP ', '').replace('COMISARIA ', '');
  });
  var valores = porComisaria.map(function(c) { return c.total; });
  var colores = generarColores(porComisaria.length);

  var ctx = document.getElementById('chart-comisarias').getContext('2d');
  if (chartComisarias) chartComisarias.destroy();

  chartComisarias = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Evaluaciones completadas',
        data: valores,
        backgroundColor: colores,
        borderColor: colores.map(function(c) { return c.replace('0.75','1'); }),
        borderWidth: 1.5,
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: function(items) { return porComisaria[items[0].dataIndex].nombre; },
            label: function(item) { return ' ' + item.raw + ' evaluaciones'; }
          }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 11 } } },
        y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,.06)' }, ticks: { stepSize: 1 } }
      }
    }
  });
}

// ── CHART DONA (estado) ───────────────────────────────────────────────────────
function renderChartEstado(data) {
  var completas  = data.totalCompletas   || 0;
  var enProgreso = data.progresosActivos || 0;

  var ctx = document.getElementById('chart-estado').getContext('2d');
  if (chartEstado) chartEstado.destroy();

  chartEstado = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Completas', 'En progreso'],
      datasets: [{
        data: [completas, enProgreso],
        backgroundColor: ['rgba(0,77,61,0.82)', 'rgba(243,156,18,0.82)'],
        borderColor:     ['#004d3d', '#f39c12'],
        borderWidth: 2,
        hoverOffset: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      plugins: {
        legend: { position: 'bottom', labels: { padding: 18, font: { size: 13 } } },
        tooltip: {
          callbacks: {
            label: function(item) {
              var total = completas + enProgreso;
              var pct   = total > 0 ? Math.round(item.raw / total * 100) : 0;
              return ' ' + item.raw + ' (' + pct + '%)';
            }
          }
        }
      }
    }
  });
}

// ── TABLA ÚLTIMAS ─────────────────────────────────────────────────────────────
function renderTabla(evaluaciones) {
  var tbody = document.getElementById('tbody-ultimas');
  if (!evaluaciones || !evaluaciones.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="tabla-vacia">Sin evaluaciones registradas aún.</td></tr>';
    return;
  }

  tbody.innerHTML = evaluaciones.map(function(e, i) {
    return '<tr data-comisaria="' + (e.comisaria||'').toLowerCase() + '" data-nombres="' + (e.nombres||'').toLowerCase() + '">' +
      '<td><span class="badge-fecha"><i class="fas fa-calendar-alt"></i> ' + (e.fecha || '--') + '</span></td>' +
      '<td><strong>' + (e.nombres || '--') + '</strong></td>' +
      '<td>' +
        '<div class="td-comisaria">' + (e.comisaria || '--') + '</div>' +
        (e.unidad ? '<div class="td-unidad">' + e.unidad + '</div>' : '') +
      '</td>' +
      '<td>' +
        '<button class="btn-mini btn-dl" onclick="descargarIndividual(\'' + encodeURIComponent(e.comisaria||'') + '\')">' +
        '<i class="fas fa-download"></i></button>' +
      '</td>' +
    '</tr>';
  }).join('');
}

function filtrarTabla() {
  var q = (document.getElementById('filtro-tabla').value || '').toLowerCase();
  var rows = document.querySelectorAll('#tbody-ultimas tr[data-comisaria]');
  rows.forEach(function(tr) {
    var match = !q ||
      tr.getAttribute('data-comisaria').includes(q) ||
      tr.getAttribute('data-nombres').includes(q);
    tr.style.display = match ? '' : 'none';
  });
}

// ── SELECT COMISARIA ─────────────────────────────────────────────────────────
function poblarSelectComisaria(porComisaria) {
  var sel = document.getElementById('dash-select-comisaria');
  sel.innerHTML = '<option value="">-- Todas las comisarías --</option>';
  (porComisaria || []).forEach(function(c) {
    var op = document.createElement('option');
    op.value = c.nombre;
    op.textContent = c.nombre + ' (' + c.total + ')';
    sel.appendChild(op);
  });
}

// ── DESCARGAS ─────────────────────────────────────────────────────────────────
function descargarComisaria() {
  var sel = document.getElementById('dash-select-comisaria').value.trim();
  var url = WEB_APP_URL + '?action=descargar' + (sel ? '&comisaria=' + encodeURIComponent(sel) : '');
  var nombre = sel ? 'MMPI2_' + sel.replace(/\s+/g,'_') + '.csv' : 'MMPI2_TODAS.csv';
  triggerDescarga(url, nombre);
}

function descargarTodas() {
  triggerDescarga(WEB_APP_URL + '?action=descargar', 'MMPI2_TODAS_LAS_COMISARIAS.csv');
}

function descargarIndividual(comisaria) {
  comisaria = decodeURIComponent(comisaria);
  triggerDescarga(WEB_APP_URL + '?action=descargar&comisaria=' + encodeURIComponent(comisaria),
    'MMPI2_' + comisaria.replace(/\s+/g,'_') + '.csv');
}

function triggerDescarga(url, nombre) {
  var a = document.createElement('a');
  a.href = url; a.download = nombre; a.target = '_blank';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  var msg = document.getElementById('msg-dash-descarga');
  msg.innerHTML = '<i class="fas fa-check-circle" style="color:#0f9d58"></i> Descargando: <strong>' + nombre + '</strong>';
  msg.style.display = 'block';
  setTimeout(function() { msg.style.display = 'none'; }, 4000);
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function generarColores(n) {
  var base = [
    'rgba(0,77,61,0.75)','rgba(243,156,18,0.75)','rgba(26,115,232,0.75)',
    'rgba(103,58,183,0.75)','rgba(0,150,136,0.75)','rgba(230,81,0,0.75)',
    'rgba(21,101,192,0.75)','rgba(46,125,50,0.75)','rgba(136,14,79,0.75)',
    'rgba(74,20,140,0.75)'
  ];
  var colores = [];
  for (var i = 0; i < n; i++) colores.push(base[i % base.length]);
  return colores;
}

// ── INIT ──────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', function() {
  if (sessionStorage.getItem('dashAuth') === '1') {
    document.body.classList.add('dash-autenticado');
    document.getElementById('dash-login').style.display    = 'none';
    document.getElementById('dash-contenido').style.display = 'block';
    cargarDatos();
  }

  // Actualizar comisaría activa en header
  var c = localStorage.getItem('comisariaActiva');
  if (c) {
    var el = document.getElementById('dash-comisaria-top');
    if (el) el.textContent = c;
  }

  // Actualizar cada 2 minutos automáticamente
  setInterval(function() {
    if (sessionStorage.getItem('dashAuth') === '1') cargarDatos();
  }, 120000);
});
