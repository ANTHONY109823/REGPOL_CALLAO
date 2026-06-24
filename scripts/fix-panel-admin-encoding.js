const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'public', 'panel-admin.html');
let text = fs.readFileSync(file, 'utf8');

const REPLACEMENTS = [
  ['â€"', '—'],
  ['â€"', '—'],
  ['â€"', '—'],
  ['â€¢', '•'],
  ['âœ"', '✓'],
  ['âœ—', '✗'],
  ['âš•', ''],
  ['Ã³', 'ó'], ['Ã­', 'í'], ['Ã©', 'é'], ['Ã¡', 'á'], ['Ãº', 'ú'], ['Ã±', 'ñ'],
  ['Ã"', 'Ó'], ['Ãš', 'Ú'], ['Ã‰', 'É'], ['Ã', 'Á'], ['Ã\u0089', 'É'],
  ['GestiÃ³n', 'Gestión'], ['AdministraciÃ³n', 'Administración'], ['PsicologÃ­a', 'Psicología'],
  ['EvaluaciÃ³n', 'Evaluación'], ['ComisarÃ­as', 'Comisarías'], ['comisarÃ­a', 'comisaría'],
  ['divisiÃ³n', 'división'], ['DivisiÃ³n', 'División'], ['activaciÃ³n', 'activación'],
  ['nÃºmero', 'número'], ['regiÃ³n', 'región'], ['BotÃ³n', 'Botón'], ['ReseÃ±a', 'Reseña'],
  ['reseÃ±a', 'reseña'], ['mÃ¡x', 'máx'], ['IntroducciÃ³n', 'Introducción'], ['PÃ¡rrafos', 'Párrafos'],
  ['pÃ¡rrafo', 'párrafo'], ['MenÃº', 'Menú'], ['menÃº', 'menú'], ['GESTIÃ"N', 'GESTIÓN'],
  ['PublicaciÃ³n', 'Publicación'], ['PrÃ³ximo', 'Próximo'], ['TÃ­tulo', 'Título'], ['tÃ­tulo', 'título'],
  ['DescripciÃ³n', 'Descripción'], ['SubtÃ­tulo', 'subtítulo'], ['TrÃ¡nsito', 'Tránsito'],
  ['INVESTIGACIÃ"N', 'INVESTIGACIÓN'], ['MÃ©dico', 'Médico'], ['TecnologÃ­a', 'Tecnología'],
  ['DuraciÃ³n', 'Duración'], ['lÃ­nea', 'línea'], ['visualizaciÃ³n', 'visualización'],
  ['deberÃ¡n', 'deberán'], ['MÃ¡x', 'Máx'], ['inscripciÃ³n', 'inscripción'], ['revisiÃ³n', 'revisión'],
  ['invÃ¡lido', 'inválido'], ['ObservaciÃ³n', 'Observación'], ['aceptaciÃ³n', 'aceptación'],
  ['mÃ©ritos', 'méritos'], ['Ã­tem', 'ítem'], ['Ãšltimas', 'Últimas'], ['DirecciÃ³n', 'Dirección'],
  ['ConstituciÃ³n', 'Constitución'], ['TelÃ©fono', 'Teléfono'], ['NÃºmero', 'Número'],
  ['aquÃ­', 'aquí'], ['ContraseÃ±a', 'Contraseña'], ['mÃ­n', 'mín'], ['vacÃ­o', 'vacío'],
  ['PsicologÃ­a', 'Psicología'], ['SESIÃ"N', 'SESIÓN'], ['NAVEGACIÃ"N', 'NAVEGACIÓN'],
  ['â”€â”€', '──'],
];

REPLACEMENTS.forEach(function(pair) {
  text = text.split(pair[0]).join(pair[1]);
});

// Etiquetas permisos sin emojis rotos
text = text.replace(/var ETIQUETAS_PERM=\{[\s\S]*?\};/,
`var ETIQUETAS_PERM={
  evaluaciones:'Evaluaciones', descargas:'Descargas',
  cms_convenios:'Convenios', cms_cursos:'Cursos',
  cms_inicio:'Inicio', cms_resena:'Reseña Histórica',
  cms_labor:'Nuestra Labor', cms_novedades:'Novedades'
};`);

// Iconos en select sin emojis corruptos
text = text.replace(/<option value="fa-graduation-cap">[^<]*<\/option>/, '<option value="fa-graduation-cap">Graduación</option>');
text = text.replace(/<option value="fa-handshake">[^<]*<\/option>/, '<option value="fa-handshake">Convenio</option>');
text = text.replace(/<option value="fa-book">[^<]*<\/option>/, '<option value="fa-book">Libro</option>');
text = text.replace(/<option value="fa-shield-alt">[^<]*<\/option>/, '<option value="fa-shield-alt">Escudo</option>');
text = text.replace(/<option value="fa-car">[^<]*<\/option>/, '<option value="fa-car">Auto/Tránsito</option>');
text = text.replace(/<option value="fa-stethoscope">[^<]*<\/option>/, '<option value="fa-stethoscope">Médico</option>');
text = text.replace(/<option value="fa-laptop">[^<]*<\/option>/, '<option value="fa-laptop">Tecnología</option>');
text = text.replace(/<option value="fa-users">[^<]*<\/option>/, '<option value="fa-users">Personas</option>');
text = text.replace(/<option value="fa-certificate">[^<]*<\/option>/, '<option value="fa-certificate">Certificado</option>');
text = text.replace(/<option value="fa-file-contract">[^<]*<\/option>/, '<option value="fa-file-contract">Contrato</option>');

// Estados inscripción sin símbolos rotos
text = text.replace(/<option value="verificado">[^<]*<\/option>/, '<option value="verificado">Verificado (expediente OK)</option>');
text = text.replace(/<option value="ganador">[^<]*<\/option>/, '<option value="ganador">Ganador (sorteo)</option>');
text = text.replace(/<option value="aprobado">[^<]*<\/option>/, '<option value="aprobado">Aprobado (méritos)</option>');
text = text.replace(/<option value="reserva">[^<]*<\/option>/, '<option value="reserva">Reserva</option>');
text = text.replace(/<option value="rechazado">[^<]*<\/option>/, '<option value="rechazado">Rechazado</option>');

fs.writeFileSync(file, text, 'utf8');
console.log('panel-admin.html encoding fixed');
