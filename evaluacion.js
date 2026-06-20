/* ================================================================
   evaluacion.js - Modulo Evaluacion Institucional REGPOL Callao
   Ing. Anthony Ccayo - UNITIC - 2026

   INSTRUCCION PARA EL INGENIERO:
   Reemplaza todos los entry.XXXXXXXXXX con los IDs reales de tu
   Google Form. Para obtenerlos:
     1. Abre tu formulario en Google Forms
     2. F12 -> Network -> filtra por "formResponse"
     3. Envia el formulario de prueba manualmente
     4. Inspecciona la request POST y copia cada entry.XXXXXXXXXX
================================================================ */

/* ================================================================
   SECCION 1 -- CONFIGURACION GOOGLE FORMS
================================================================ */
const CONFIG_FORMS = {

  /* URL de envio: reemplaza TU_FORM_ID con el ID real */
  URL_ENVIO: 'https://docs.google.com/forms/d/e/TU_FORM_ID/formResponse',

  /* Campos de datos personales -- reemplaza cada entry */
  ENTRY_COMISARIA:        'entry.1000000001',
  ENTRY_UNIDAD:           'entry.1000000002',
  ENTRY_NOMBRES:          'entry.1000000003',
  ENTRY_CIP:              'entry.1000000004',
  ENTRY_DNI:              'entry.1000000005',
  ENTRY_FECHA_NACIMIENTO: 'entry.1000000006',
  ENTRY_EDAD:             'entry.1000000007',

  /* Preguntas 1 a 500 -- reemplaza cada entry.20000000XX */
  ENTRADAS_PREGUNTAS: (function() {
    var m = {};
    for (var i = 1; i <= 500; i++) {
      m['ENTRY_P' + i] = 'entry.' + (2000000000 + i);
    }
    return m;
  })()
};

/* ================================================================
   SECCION 2 -- BANCO DE 500 PREGUNTAS
   Organizado en 13 categorias tematicas.
   Reemplaza los textos con las preguntas oficiales de la REGPOL.
================================================================ */
var PREGUNTAS = (function() {
  var cats = [
    { c: 'Etica y Conducta Profesional', q: [
      'Conoce y aplica el Codigo de Etica de la Funcion Publica en su labor diaria?',
      'Ha recibido capacitacion en etica policial en los ultimos 12 meses?',
      'Cumple con el horario de trabajo establecido por su unidad?',
      'Mantiene una conducta proba dentro y fuera de servicio?',
      'Ha sido objeto de alguna sancion disciplinaria en los ultimos 2 anos?',
      'Conoce el procedimiento para reportar un acto de corrupcion interna?',
      'Evita recibir dadivas, regalos o beneficios de ciudadanos durante el servicio?',
      'Conoce el concepto de conflicto de intereses en el ambito policial?',
      'Utiliza los bienes institucionales exclusivamente para fines del servicio?',
      'Ha denunciado alguna irregularidad que haya observado en su unidad?',
      'Conoce la Ley del Codigo de Etica de la Funcion Publica (Ley N 27815)?',
      'Trata con respeto a todos los ciudadanos sin distincion alguna?',
      'Se identifica correctamente ante el ciudadano al inicio de cada intervencion?',
      'Porta su credencial policial de forma visible durante el servicio?',
      'Evita el uso de lenguaje ofensivo o discriminatorio en el desempeno de sus funciones?',
      'Conoce las sanciones administrativas por inconducta funcional?',
      'Contribuye a mantener un clima laboral respetuoso en su unidad?',
      'Ha participado en talleres o charlas sobre integridad policial?',
      'Reporta a su superior inmediato cualquier situacion que comprometa la imagen institucional?',
      'Cumple con las disposiciones del Reglamento Interno de la PNP?',
      'Conoce el sistema de quejas y sugerencias ciudadanas de la PNP?',
      'Actua con imparcialidad ante situaciones de presion externa?',
      'Conoce el protocolo de atencion al ciudadano en mesa de partes?',
      'Evita comentar informacion reservada de la institucion en redes sociales?',
      'Conoce las normas sobre el uso de redes sociales para el personal PNP?'
    ]},
    { c: 'Derechos Humanos', q: [
      'Conoce la Declaracion Universal de los Derechos Humanos?',
      'Ha recibido capacitacion en derechos humanos en los ultimos 12 meses?',
      'Conoce el uso diferenciado de la fuerza establecido en la normativa PNP?',
      'Aplica los principios de legalidad, necesidad y proporcionalidad en sus intervenciones?',
      'Conoce el protocolo de intervencion a personas en situacion de vulnerabilidad?',
      'Trata con dignidad a las personas detenidas durante los procedimientos policiales?',
      'Informa a los detenidos sobre sus derechos al momento de la detencion?',
      'Conoce el Decreto Legislativo N 1186 sobre uso de la fuerza por la PNP?',
      'Ha participado en ejercicios de simulacion con enfoque de derechos humanos?',
      'Conoce el procedimiento para atender denuncias por violacion de derechos humanos?',
      'Evita aplicar tratos degradantes o inhumanos durante las intervenciones?',
      'Conoce las normas sobre detencion preventiva y sus plazos legales?',
      'Facilita el acceso a defensa legal de las personas detenidas?',
      'Conoce el protocolo de atencion a ninas, ninos y adolescentes en conflicto con la ley?',
      'Respeta la privacidad y confidencialidad de los datos de las personas intervenidas?',
      'Conoce las disposiciones sobre no discriminacion en el servicio policial?',
      'Actua con imparcialidad frente a personas de distintas culturas, etnias o religiones?',
      'Conoce el Mecanismo Nacional de Prevencion de la Tortura?',
      'Ha reportado algun caso de presunta tortura o malos tratos del que haya tenido conocimiento?',
      'Conoce la definicion legal de detencion arbitraria?',
      'Conoce el contenido de la Convencion Americana sobre Derechos Humanos?',
      'Sabe como actuar ante una persona que solicita asilo o refugio?',
      'Conoce el protocolo de atencion a personas con discapacidad durante intervenciones?',
      'Conoce las disposiciones sobre el uso de esposas y medidas de restriccion?',
      'Conoce el procedimiento para el traslado seguro de personas detenidas?'
    ]},
    { c: 'Atencion a Victimas', q: [
      'Conoce el protocolo de atencion a victimas de violencia familiar?',
      'Ha recibido capacitacion en atencion a victimas de trata de personas?',
      'Conoce la Ley N 30364 de prevencion y sancion de la violencia contra la mujer?',
      'Aplica la ficha de valoracion de riesgo en casos de violencia familiar?',
      'Conoce el procedimiento para obtener medidas de proteccion para victimas?',
      'Sabe como derivar a una victima a los Centros de Emergencia Mujer (CEM)?',
      'Conoce el protocolo de intervencion en casos de violencia sexual?',
      'Trata a las victimas de violencia con empatia y sin revictimizacion?',
      'Conoce el procedimiento para atender denuncias de violencia psicologica?',
      'Conoce el protocolo de atencion a victimas de feminicidio y tentativa?',
      'Ha participado en capacitaciones sobre enfoque de genero en la funcion policial?',
      'Conoce el procedimiento para la inmediata detencion del agresor en flagrancia?',
      'Elabora correctamente el parte policial en casos de violencia familiar?',
      'Conoce la ruta de derivacion para victimas de trata de personas?',
      'Sabe identificar los indicadores de riesgo en una victima de violencia?',
      'Conoce los derechos especificos de las victimas de delitos en el proceso penal?',
      'Preserva adecuadamente la escena del crimen en casos de feminicidio?',
      'Conoce el procedimiento para atender denuncias de acoso sexual?',
      'Coordina con el Ministerio Publico ante casos de violencia sexual?',
      'Conoce el Decreto Supremo sobre el protocolo intersectorial de atencion a victimas de trata?',
      'Conoce el protocolo de atencion a victimas de accidentes de transito?',
      'Sabe como orientar a una victima para acceder al auxilio judicial gratuito?',
      'Conoce el sistema de seguimiento de medidas de proteccion AURORA?',
      'Sabe como registrar un caso de violencia familiar en el sistema SI SEREM?',
      'Conoce el protocolo de acompanamiento a victimas durante el reconocimiento medico legal?'
    ]},
    { c: 'Normativa y Procedimientos', q: [
      'Conoce el Decreto Legislativo N 1267 que regula la Ley de la PNP?',
      'Conoce el Reglamento Interno de la PNP y sus principales disposiciones?',
      'Conoce el Codigo Procesal Penal y su aplicacion en las diligencias policiales?',
      'Elabora correctamente un parte policial de ocurrencias?',
      'Conoce el procedimiento de cadena de custodia de evidencias?',
      'Sabe como registrar correctamente una detencion en el sistema SIRDP?',
      'Conoce el procedimiento para el levantamiento del cadaver en escena del crimen?',
      'Conoce el protocolo de alerta AMBER para la busqueda de menores desaparecidos?',
      'Sabe elaborar un informe policial de acuerdo a los formatos institucionales?',
      'Conoce el procedimiento para la ejecucion de ordenes de allanamiento?',
      'Conoce los plazos de la detencion policial en delitos comunes y graves?',
      'Sabe comunicar una detencion al Ministerio Publico dentro del plazo legal?',
      'Conoce el procedimiento para la remision de detenidos a la fiscalia?',
      'Conoce las disposiciones sobre el uso de arma de fuego en la PNP?',
      'Mantiene actualizado el registro de su arma de reglamento?',
      'Conoce el procedimiento ante la perdida o hurto de arma de reglamento?',
      'Conoce las normas sobre patrullaje motorizado en zonas urbanas?',
      'Sabe aplicar el procedimiento de control de identidad en lugares publicos?',
      'Conoce el Marco Legal del Sistema de Justicia Juvenil y del Adolescente Infractor?',
      'Conoce el procedimiento para la recepcion de denuncias sin discriminacion de delito?',
      'Conoce el proceso de devolucion de bienes incautados al propietario legitimo?',
      'Sabe como elaborar un acta de incautacion correctamente?',
      'Conoce el proceso de registro de bienes incautados en el almacen de la PNP?',
      'Conoce el procedimiento de aseguramiento del lugar de comision del delito?',
      'Sabe como tomar la declaracion de un testigo conforme al CPP?'
    ]},
    { c: 'Seguridad Ciudadana', q: [
      'Conoce el Plan Anual de Seguridad Ciudadana de su sector?',
      'Participa activamente en las juntas vecinales de su jurisdiccion?',
      'Conoce el mapa del delito actualizado de su sector?',
      'Coordina con el serenazgo de la municipalidad para el patrullaje integrado?',
      'Conoce el protocolo de atencion ante robos al paso en la via publica?',
      'Conoce el procedimiento para la prevencion del pandillaje pernicioso?',
      'Conoce las rutas de escape o puntos criticos de su jurisdiccion?',
      'Sabe elaborar el croquis del sector de patrullaje a su cargo?',
      'Conoce el sistema SISCOP de seguridad ciudadana y sabe utilizarlo?',
      'Participa en operaciones conjuntas de patrullaje con el gobierno local?',
      'Conoce el procedimiento ante el hallazgo de explosivos o artefactos sospechosos?',
      'Conoce el protocolo de intervencion en rias tumultuarias?',
      'Sabe gestionar un puesto de control vehicular preventivo?',
      'Conoce las disposiciones sobre el resguardo de instituciones bancarias?',
      'Conoce el procedimiento de notificacion a vecinos sobre actividades sospechosas?',
      'Conoce el protocolo ante amenazas de bomba en instalaciones publicas?',
      'Sabe como activar el sistema de videovigilancia en situaciones de emergencia?',
      'Conoce el procedimiento para la detencion de microcomercializadores de drogas?',
      'Participa en campanas de prevencion del delito con la comunidad?',
      'Conoce el protocolo de intervencion ante robos a mano armada?',
      'Conoce las estadisticas delictivas mensuales de su comisaria?',
      'Participa en el CODISEC de su distrito?',
      'Conoce el Plan Estrategico Sectorial Multianual del Ministerio del Interior?',
      'Conoce las acciones del programa Barrio Seguro en su jurisdiccion?',
      'Sabe como gestionar la instalacion de nuevas camaras de videovigilancia en su sector?'
    ]},
    { c: 'Investigacion Criminal', q: [
      'Conoce las tecnicas basicas de investigacion criminal?',
      'Sabe como preservar adecuadamente la escena de un crimen?',
      'Conoce el procedimiento de recoleccion de indicios en la escena del delito?',
      'Sabe elaborar un croquis de la escena del crimen?',
      'Conoce el Manual de Criminalistica de la PNP?',
      'Sabe como interrogar a testigos siguiendo el protocolo institucional?',
      'Conoce el procedimiento de identificacion mediante rueda de reconocimiento?',
      'Conoce el sistema de registro de huellas dactilares (AFIS) de la PNP?',
      'Sabe como ingresar correctamente un caso al sistema SIRDP?',
      'Conoce los tipos de prueba admisibles en el proceso penal acusatorio?',
      'Sabe como redactar un acta de incautacion conforme a la normativa?',
      'Conoce el procedimiento de intervencion en delitos flagrantes de drogas?',
      'Sabe como aplicar la tecnica de observacion y seguimiento?',
      'Conoce las tecnicas de entrevista a victimas de delitos graves?',
      'Conoce el procedimiento de allanamiento y registro domiciliario?',
      'Sabe como elaborar un cuadro cronologico de hechos en una investigacion?',
      'Conoce el protocolo de manejo de informantes y fuentes reservadas?',
      'Sabe como identificar y documentar indicios de lavado de activos?',
      'Conoce el procedimiento de coordinacion con la Fiscalia en la etapa de investigacion?',
      'Sabe elaborar un informe policial conforme al nuevo Codigo Procesal Penal?',
      'Conoce el procedimiento de gestion de evidencia digital?',
      'Sabe como solicitar geolocalizacion de un telefono a traves de la Fiscalia?',
      'Conoce los delitos informaticos tipificados en la Ley N 30096?',
      'Sabe como elaborar el plan de investigacion de un caso complejo?',
      'Conoce el procedimiento de intercambio de informacion con INTERPOL?'
    ]},
    { c: 'Salud y Bienestar', q: [
      'Conoce los servicios de salud a los que tiene derecho como efectivo PNP?',
      'Ha realizado un chequeo medico preventivo en los ultimos 12 meses?',
      'Conoce los programas de bienestar y salud mental que ofrece la PNP?',
      'Ha participado en alguna actividad deportiva organizada por su unidad?',
      'Conoce el procedimiento para acceder a apoyo psicologico en la PNP?',
      'Conoce los beneficios del seguro de salud PNP (SALUDPOL)?',
      'Sabe como gestionar una licencia medica por incapacidad temporal?',
      'Ha recibido orientacion sobre prevencion de estres laboral?',
      'Conoce el procedimiento ante un accidente de trabajo en acto de servicio?',
      'Conoce los beneficios de la Caja de Pensiones Militar-Policial?',
      'Ha accedido a algun programa de capacitacion o educacion continua de la PNP?',
      'Conoce las prestaciones sociales disponibles para el personal PNP?',
      'Ha participado en talleres de gestion del estres o inteligencia emocional?',
      'Conoce el procedimiento para solicitar permisos y licencias especiales?',
      'Ha recibido equipos de proteccion personal adecuados para el servicio?',
      'Conoce el protocolo de exposicion a riesgo biologico durante el servicio?',
      'Sabe como reportar un riesgo o peligro en su puesto de trabajo?',
      'Conoce sus derechos en caso de ser herido o incapacitado en acto de servicio?',
      'Ha recibido vacunas o tratamientos preventivos ofrecidos por la institucion?',
      'Conoce el sistema de descuentos y beneficios del FOSPOLI?',
      'Conoce el programa de vivienda para el personal PNP?',
      'Sabe como acceder al servicio odontologico de SALUDPOL?',
      'Conoce el procedimiento de referencia y contrarreferencia de SALUDPOL?',
      'Conoce las modalidades de retiro y jubilacion del personal PNP?',
      'Conoce el regimen de pensiones del personal policial fallecido en acto de servicio?'
    ]},
    { c: 'Tecnologia e Informatica', q: [
      'Sabe utilizar el sistema informatico SIRDP de la PNP?',
      'Sabe acceder al portal institucional de la PNP para tramites internos?',
      'Conoce las politicas de seguridad informatica de la institucion?',
      'Sabe utilizar el correo electronico institucional de la PNP?',
      'Conoce el sistema de videovigilancia instalado en su jurisdiccion?',
      'Sabe como utilizar la radio de comunicaciones asignada a su unidad?',
      'Conoce el protocolo de comunicacion por radio en la PNP?',
      'Sabe como acceder al sistema de consulta de requisitorias en linea?',
      'Conoce el sistema RENADESPPLE de busqueda de personas desaparecidas?',
      'Sabe utilizar el sistema de consulta de brevetes (SUTRAN) o placas (MTC)?',
      'Conoce las normas sobre el uso de dispositivos moviles durante el servicio?',
      'Conoce el uso del sistema de reconocimiento facial de la PNP?',
      'Sabe como operar la camara corporal (bodycam) asignada a su unidad?',
      'Conoce el procedimiento para reportar fallos en el sistema informatico?',
      'Sabe utilizar las aplicaciones moviles de consulta policial autorizadas?',
      'Conoce el sistema de digitalizacion de denuncias en linea?',
      'Sabe como utilizar el equipo de georeferenciacion GPS de su patrulla?',
      'Conoce el protocolo de manejo de evidencias digitales?',
      'Conoce las medidas de ciberseguridad para proteger la informacion institucional?',
      'Sabe como usar el sistema SIV para verificacion de identidades?',
      'Conoce el sistema de control de ingreso biometrico a instalaciones PNP?',
      'Sabe como utilizar el sistema de gestion documental SGDP?',
      'Conoce el sistema de consulta de antecedentes policiales en linea?',
      'Sabe como elaborar un informe digital usando los formatos PNP en Word o PDF?',
      'Conoce el sistema de informacion SIVICC del Ministerio del Interior?'
    ]},
    { c: 'Liderazgo y Trabajo en Equipo', q: [
      'Considera que trabaja bien en equipo con sus companeros de unidad?',
      'Comunica de manera clara y oportuna las novedades a su superior?',
      'Apoya a sus companeros en situaciones de alta demanda operacional?',
      'Cumple con las ordenes impartidas por su superior jerarquico?',
      'Propone mejoras en los procedimientos de su unidad?',
      'Participa activamente en las reuniones de coordinacion de su unidad?',
      'Sabe como resolver conflictos interpersonales en el trabajo?',
      'Asesora a los efectivos de menor experiencia en su unidad?',
      'Toma decisiones oportunas ante situaciones de emergencia en campo?',
      'Contribuye a mantener la moral y motivacion del equipo?',
      'Comparte informacion relevante del servicio con sus companeros de turno?',
      'Cumple con las metas y objetivos operacionales de su unidad?',
      'Elabora planes de trabajo para las actividades de su sector?',
      'Conoce los indicadores de gestion operacional de su unidad?',
      'Conoce la estructura organica y funciones de la comisaria a la que pertenece?',
      'Ha recibido capacitacion en liderazgo policial?',
      'Sabe como delegar tareas de forma efectiva?',
      'Conoce el plan de continuidad operacional de su unidad ante emergencias?',
      'Conoce el procedimiento de relevo de guardia y transmision de novedades?',
      'Conoce el sistema de evaluacion del desempeno policial?',
      'Ha liderado operativos o acciones coordinadas de seguridad?',
      'Conoce el procedimiento de elaboracion de un plan de operaciones?',
      'Sabe como redactar una orden de operaciones?',
      'Conoce el manual de organizacion y funciones (MOF) de su unidad?',
      'Ha participado en ejercicios de toma de decisiones bajo presion?'
    ]},
    { c: 'Emergencias y Desastres', q: [
      'Conoce el Plan de Contingencia de su unidad ante desastres naturales?',
      'Ha participado en simulacros de evacuacion en su unidad?',
      'Conoce el rol de la PNP en el Sistema Nacional de Gestion del Riesgo de Desastres?',
      'Conoce el procedimiento de coordinacion con el INDECI en situaciones de emergencia?',
      'Sabe como actuar ante un sismo de gran magnitud durante el servicio?',
      'Sabe prestar primeros auxilios basicos?',
      'Cuenta con certificacion vigente en primeros auxilios?',
      'Conoce el procedimiento de evacuacion de heridos en la escena de un accidente?',
      'Sabe como actuar ante una emergencia quimica o derrame de sustancias peligrosas?',
      'Conoce el protocolo de actuacion ante incendios en edificaciones?',
      'Sabe como gestionar el transito vehicular en zonas afectadas por desastres?',
      'Conoce las zonas de seguridad y rutas de evacuacion de su unidad?',
      'Ha recibido capacitacion en rescate y extricacion vehicular basica?',
      'Conoce el procedimiento de resguardo de zonas afectadas por desastres?',
      'Conoce el protocolo de comunicacion con el Centro de Operaciones de Emergencia?',
      'Sabe como solicitar apoyo de los Bomberos o SAMU durante una emergencia?',
      'Conoce el procedimiento de restriccion y control de acceso en zonas de desastre?',
      'Ha participado en operaciones de apoyo a la poblacion en situaciones de emergencia?',
      'Conoce las normas ambientales relacionadas con la actividad policial?',
      'Sabe como manejar residuos biologicos o peligrosos generados durante el servicio?',
      'Conoce el sistema de alerta temprana por tsunamis del COEN?',
      'Sabe como actuar si se detecta una fuga de gas en instalaciones publicas?',
      'Conoce el protocolo de actuacion en caso de lluvias intensas o huaicos?',
      'Conoce el procedimiento de evacuacion de establecimientos ante emergencias?',
      'Sabe como coordinar con la Marina de Guerra en emergencias costeras?'
    ]},
    { c: 'Anticorrupcion y Transparencia', q: [
      'Conoce la Politica Nacional de Integridad y Lucha contra la Corrupcion?',
      'Conoce el Plan de Integridad Institucional de la PNP?',
      'Conoce el procedimiento para denunciar actos de corrupcion en la PNP?',
      'Conoce el sistema de proteccion de denunciantes en la institucion?',
      'Evita solicitar o aceptar ventajas indebidas durante el ejercicio de su cargo?',
      'Conoce la Convencion de las Naciones Unidas contra la Corrupcion?',
      'Conoce el tipo penal de cohecho pasivo propio e impropio?',
      'Ha recibido capacitacion en etica publica y anticorrupcion?',
      'Conoce el procedimiento de declaracion jurada de bienes y rentas?',
      'Sabe cuales son las conductas que constituyen conflicto de interes?',
      'Conoce las sanciones penales por enriquecimiento ilicito?',
      'Conoce el concepto de nepotismo y sus implicancias legales?',
      'Conoce los canales de denuncia anonima disponibles en la PNP?',
      'Conoce el portal de transparencia institucional de la PNP?',
      'Conoce la Ley de Transparencia y Acceso a la Informacion Publica?',
      'Sabe como responder a una solicitud de acceso a la informacion publica?',
      'Conoce las normas sobre publicidad de los actos administrativos de la PNP?',
      'Conoce el procedimiento de auditoria interna en la PNP?',
      'Conoce el rol de la Inspectoria General en el control de la conducta policial?',
      'Conoce el sistema de seguimiento de sanciones disciplinarias de la PNP?',
      'Conoce el Decreto Supremo sobre el Plan Nacional de Integridad?',
      'Ha completado el curso virtual de etica publica del Ministerio de Justicia?',
      'Conoce las medidas de simplificacion administrativa para eliminar la corrupcion?',
      'Sabe a que entidad puede denunciar actos de corrupcion de funcionarios del MININTER?',
      'Conoce el protocolo de intervencion ante ofertas de soborno durante el servicio?'
    ]},
    { c: 'Transito y Seguridad Vial', q: [
      'Conoce el Reglamento Nacional de Transito (D.S. N 016-2009-MTC)?',
      'Sabe como dirigir el transito vehicular en intersecciones sin semaforo?',
      'Conoce las senales de transito establecidas en el reglamento nacional?',
      'Sabe como actuar ante un accidente de transito con victimas?',
      'Conoce el procedimiento de atencion en la escena de un accidente de transito?',
      'Sabe como elaborar un croquis de accidente de transito?',
      'Conoce las infracciones graves y muy graves del Reglamento de Transito?',
      'Conoce el procedimiento de papeleteo o acta de control de transito?',
      'Sabe como verificar la autenticidad de una licencia de conducir?',
      'Conoce el procedimiento de internamiento de vehiculos en el deposito municipal?',
      'Conoce las normas sobre transporte de sustancias peligrosas por via terrestre?',
      'Sabe como realizar una prueba de dosaje etilico en campo?',
      'Conoce el procedimiento ante conductor en estado de ebriedad?',
      'Conoce las normas sobre velocidad maxima en zonas urbanas y rurales?',
      'Sabe como coordinar con el MTC ante accidentes en carreteras nacionales?',
      'Conoce el procedimiento de atencion a victimas de accidentes de transito multiple?',
      'Sabe como gestionar el transito en zonas de obras viales?',
      'Conoce el protocolo de operacion de puestos de control en carreteras?',
      'Conoce las normas sobre uso obligatorio del cinturon de seguridad?',
      'Conoce las estadisticas de accidentalidad vial de su jurisdiccion?',
      'Conoce el procedimiento de coordinacion con el CRED del MTC?',
      'Sabe como actuar ante un vehiculo de carga con exceso de peso?',
      'Conoce las sanciones para vehiculos sin SOAT vigente?',
      'Sabe como verificar si un vehiculo tiene orden de captura o es robado?',
      'Conoce el procedimiento para el retiro de vehiculos abandonados en la via publica?'
    ]},
    { c: 'Conocimiento General Institucional', q: [
      'Conoce la historia y mision de la Region Policial Callao?',
      'Conoce el organigrama de la REGPOL Callao?',
      'Sabe cuantas comisarias conforman la jurisdiccion de la REGPOL Callao?',
      'Conoce los servicios especializados disponibles en la REGPOL Callao?',
      'Conoce el Plan Operativo Institucional de su unidad?',
      'Ha participado en actividades de proyeccion social organizadas por la PNP?',
      'Conoce el convenio marco entre la PNP y el Gobierno Regional del Callao?',
      'Conoce los numeros de emergencia de la PNP y sus funciones (105, 116, etc.)?',
      'Sabe como utilizar el sistema de Mesa de Partes Digital de la PNP?',
      'Conoce el procedimiento para tramitar constancias policiales en linea?',
      'Conoce los programas sociales de la PNP dirigidos a jovenes en riesgo?',
      'Conoce el sistema de turnos y servicios de su comisaria?',
      'Sabe cual es el numero de personal organico autorizado de su unidad?',
      'Conoce el inventario de bienes y equipos asignados a su unidad?',
      'Conoce los procedimientos de mantenimiento preventivo del parque automotor?',
      'Sabe como solicitar municion o implementos de seguridad a su unidad?',
      'Conoce el protocolo de recepcion de turno y libro de guardia?',
      'Sabe como coordinar el apoyo de unidades especializadas (DIROES, DIRANDRO)?',
      'Conoce el sistema de premiacion y reconocimiento institucional de la PNP?',
      'Ha recibido la Guia del Efectivo Policial actualizada?',
      'Conoce el procedimiento de notificacion ante un diagnostico epidemiologico?',
      'Conoce el sistema de evaluacion academica de la Escuela PNP?',
      'Ha participado en concursos de capacitacion o ascenso policial?',
      'Conoce el Decreto Supremo del Reglamento del Regimen de Personal de la PNP?',
      'Conoce el procedimiento para solicitar traslado o cambio de colocacion?'
    ]}
  ];

  var resultado = [];
  var n = 1;
  cats.forEach(function(cat) {
    cat.q.forEach(function(texto) {
      if (n <= 500) {
        resultado.push({ id: n, categoria: cat.c, texto: texto });
        n++;
      }
    });
  });
  while (resultado.length < 500) {
    resultado.push({ id: n, categoria: 'Conocimiento General PNP', texto: 'Pregunta N ' + n + ' -- Pendiente de actualizacion por UNITIC.' });
    n++;
  }
  return resultado;
})();

/* ================================================================
   SECCION 3 -- ESTADO GLOBAL
================================================================ */
var ESTADO = {
  paginaActual:  1,
  pregsPorPag:   10,
  totalPaginas:  50,
  respuestas:    {},
  adminLogueado: false,
  panelAbierto:  false
};

/* ================================================================
   SECCION 4 -- INICIO
================================================================ */
document.addEventListener('DOMContentLoaded', function() {
  var guardado = localStorage.getItem('comisariaActiva') || 'NO CONFIGURADA -- VER PANEL ADMIN';
  document.getElementById('nombre-comisaria').textContent = guardado;
  var adminInput = document.getElementById('admin-comisaria');
  if (guardado !== 'NO CONFIGURADA -- VER PANEL ADMIN') adminInput.value = guardado;

  renderizarPagina(1);

  document.getElementById('f-nacimiento').addEventListener('change', calcularEdad);

  ['f-cip', 'f-dni'].forEach(function(id) {
    document.getElementById(id).addEventListener('input', function(e) {
      e.target.value = e.target.value.replace(/\D/g, '');
    });
  });
});

/* ================================================================
   SECCION 5 -- CALCULO AUTOMATICO DE EDAD
================================================================ */
function calcularEdad() {
  var input = document.getElementById('f-nacimiento');
  var out   = document.getElementById('f-edad');
  if (!input.value) { out.value = ''; return; }
  var hoy  = new Date();
  var nac  = new Date(input.value);
  var edad = hoy.getFullYear() - nac.getFullYear();
  var mes  = hoy.getMonth() - nac.getMonth();
  if (mes < 0 || (mes === 0 && hoy.getDate() < nac.getDate())) edad--;
  if (edad < 18 || edad > 80) {
    out.value = 'Verifique la fecha';
    input.classList.add('invalido');
  } else {
    out.value = edad + ' anios';
    input.classList.remove('invalido');
    input.classList.add('valido');
  }
}

/* ================================================================
   SECCION 6 -- RENDERIZADO DE PAGINA (PAGINACION)
================================================================ */
function renderizarPagina(pagina) {
  ESTADO.paginaActual = pagina;
  var zona   = document.getElementById('zona-preguntas');
  var inicio = (pagina - 1) * ESTADO.pregsPorPag;
  var fin    = inicio + ESTADO.pregsPorPag;
  var subs   = PREGUNTAS.slice(inicio, fin);

  var html = '<table class="tabla-preguntas" role="grid"><thead><tr>' +
    '<th class="col-n">#</th><th>Pregunta</th><th class="col-r">Respuesta</th>' +
    '</tr></thead><tbody>';

  subs.forEach(function(p) {
    var r    = ESTADO.respuestas[p.id];
    var chkS = r === 'SI'  ? 'checked' : '';
    var chkN = r === 'NO'  ? 'checked' : '';
    var cls  = !r ? 'sin-marcar' : '';
    html += '<tr class="' + cls + '" id="fila-' + p.id + '">' +
      '<td class="td-num">' + p.id + '</td>' +
      '<td class="td-texto">' + p.texto + '</td>' +
      '<td class="td-resp">' +
        '<div class="opciones-si-no">' +
          '<label class="lbl-si"><input type="radio" name="p' + p.id + '" value="SI" ' + chkS +
            ' onchange="guardarRespuesta(' + p.id + ',\'SI\')"> SI</label>' +
          '<label class="lbl-no"><input type="radio" name="p' + p.id + '" value="NO" ' + chkN +
            ' onchange="guardarRespuesta(' + p.id + ',\'NO\')"> NO</label>' +
        '</div>' +
      '</td></tr>';
  });

  html += '</tbody></table>';
  zona.innerHTML = html;
  actualizarControles();
  actualizarProgreso();
  document.getElementById('card-cuestionario').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function guardarRespuesta(id, val) {
  ESTADO.respuestas[id] = val;
  var fila = document.getElementById('fila-' + id);
  if (fila) fila.classList.remove('sin-marcar');
  actualizarProgreso();
}

function actualizarProgreso() {
  var resp = Object.keys(ESTADO.respuestas).length;
  var pct  = Math.round((resp / 500) * 100);
  document.getElementById('barra-progreso').style.width = pct + '%';
  document.getElementById('texto-pagina').textContent = 'Pagina ' + ESTADO.paginaActual + ' de 50';
  document.getElementById('texto-respondidas').textContent = resp + ' / 500 respondidas';
  document.getElementById('aria-progreso').setAttribute('aria-valuenow', pct);
}

function actualizarControles() {
  var pg    = ESTADO.paginaActual;
  var esUlt = (pg === ESTADO.totalPaginas);
  document.getElementById('btn-atras').disabled = (pg === 1);
  document.getElementById('btn-siguiente').style.display  = esUlt ? 'none' : 'inline-flex';
  document.getElementById('btn-finalizar').style.display  = esUlt ? 'inline-flex' : 'none';
  document.getElementById('info-pagina').textContent = 'Pagina ' + pg + ' de 50';
}

function cambiarPagina(delta) {
  var nueva = ESTADO.paginaActual + delta;
  if (nueva < 1 || nueva > ESTADO.totalPaginas) return;

  if (delta > 0) {
    var inicio  = (ESTADO.paginaActual - 1) * ESTADO.pregsPorPag;
    var fin     = inicio + ESTADO.pregsPorPag;
    var sinResp = [];
    for (var i = inicio; i < fin; i++) {
      if (!ESTADO.respuestas[PREGUNTAS[i].id]) sinResp.push(PREGUNTAS[i].id);
    }
    if (sinResp.length > 0) {
      sinResp.forEach(function(id) {
        var f = document.getElementById('fila-' + id);
        if (f) f.classList.add('sin-marcar');
      });
      mostrarAlerta('Responda las ' + sinResp.length + ' pregunta(s) pendiente(s) en esta pagina antes de continuar.', 'error');
      return;
    }
  }
  ocultarAlerta();
  renderizarPagina(nueva);
}

/* ================================================================
   SECCION 7 -- VALIDACION Y ENVIO
================================================================ */
function validarYEnviar() {
  var err = false;
  var campos = [
    { id: 'f-unidad',     test: function(v) { return v.trim().length > 0; },        msg: 'La unidad es obligatoria.' },
    { id: 'f-nombres',    test: function(v) { return v.trim().length > 0; },        msg: 'El nombre completo es obligatorio.' },
    { id: 'f-cip',        test: function(v) { return /^\d{6}$/.test(v.trim()); },   msg: 'CIP: debe tener exactamente 6 digitos.' },
    { id: 'f-dni',        test: function(v) { return /^\d{8}$/.test(v.trim()); },   msg: 'DNI: debe tener exactamente 8 digitos.' },
    { id: 'f-nacimiento', test: function(v) { return v.length > 0; },               msg: 'La fecha de nacimiento es obligatoria.' }
  ];

  var msgErr = '';
  campos.forEach(function(c) {
    var el = document.getElementById(c.id);
    el.classList.remove('invalido', 'valido');
    if (!c.test(el.value)) {
      el.classList.add('invalido');
      if (!err) msgErr = c.msg;
      err = true;
    } else {
      el.classList.add('valido');
    }
  });

  if (err) {
    mostrarAlerta(msgErr, 'error');
    document.getElementById('f-unidad').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  var sinRes = PREGUNTAS.filter(function(p) { return !ESTADO.respuestas[p.id]; });
  if (sinRes.length > 0) {
    mostrarAlerta('Faltan ' + sinRes.length + ' pregunta(s) sin responder. Revise todas las paginas.', 'error');
    return;
  }

  var nombres = document.getElementById('f-nombres').value.trim();
  var dni     = document.getElementById('f-dni').value.trim();
  var comis   = document.getElementById('nombre-comisaria').textContent;

  if (!confirm('Confirma el envio de su evaluacion?\n\nEfectivo: ' + nombres + '\nDNI: ' + dni + '\nComisaria: ' + comis + '\n\nUna vez enviada no podra modificar sus respuestas.')) return;

  enviarAGoogleForms();
}

function enviarAGoogleForms() {
  var overlay    = document.getElementById('overlay-envio');
  var spinner    = document.getElementById('spinner-overlay');
  var checkIcon  = document.getElementById('check-ok-icon');
  var textoO     = document.getElementById('texto-overlay');
  var subtextoO  = document.getElementById('subtexto-overlay');

  overlay.classList.add('visible');

  var datos = new FormData();
  datos.append(CONFIG_FORMS.ENTRY_COMISARIA,        document.getElementById('nombre-comisaria').textContent);
  datos.append(CONFIG_FORMS.ENTRY_UNIDAD,           document.getElementById('f-unidad').value.trim());
  datos.append(CONFIG_FORMS.ENTRY_NOMBRES,          document.getElementById('f-nombres').value.trim());
  datos.append(CONFIG_FORMS.ENTRY_CIP,              document.getElementById('f-cip').value.trim());
  datos.append(CONFIG_FORMS.ENTRY_DNI,              document.getElementById('f-dni').value.trim());
  datos.append(CONFIG_FORMS.ENTRY_FECHA_NACIMIENTO, document.getElementById('f-nacimiento').value);
  datos.append(CONFIG_FORMS.ENTRY_EDAD,             document.getElementById('f-edad').value);

  PREGUNTAS.forEach(function(p) {
    datos.append(CONFIG_FORMS.ENTRADAS_PREGUNTAS['ENTRY_P' + p.id], ESTADO.respuestas[p.id] || '');
  });

  fetch(CONFIG_FORMS.URL_ENVIO, { method: 'POST', mode: 'no-cors', body: datos })
    .then(function() {
      spinner.style.display   = 'none';
      checkIcon.style.display = 'block';
      textoO.textContent      = 'Evaluacion enviada correctamente!';
      subtextoO.textContent   = document.getElementById('f-nombres').value.trim() + ' | DNI: ' + document.getElementById('f-dni').value.trim();
      setTimeout(function() {
        overlay.classList.remove('visible');
        limpiarFormulario();
      }, 5000);
    })
    .catch(function() {
      spinner.style.display = 'none';
      textoO.textContent    = 'Error de red. Verifique su conexion e intente nuevamente.';
      textoO.style.color    = '#ffaaaa';
      setTimeout(function() {
        overlay.classList.remove('visible');
        spinner.style.display = 'block';
        textoO.textContent    = 'Enviando su evaluacion...';
        textoO.style.color    = '';
      }, 4000);
    });
}

function limpiarFormulario() {
  ['f-unidad', 'f-nombres', 'f-cip', 'f-dni', 'f-nacimiento', 'f-edad'].forEach(function(id) {
    document.getElementById(id).value = '';
  });
  ESTADO.respuestas = {};
  renderizarPagina(1);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ================================================================
   SECCION 8 -- ALERTAS
================================================================ */
function mostrarAlerta(msg, tipo) {
  var el = document.getElementById('alerta-global');
  document.getElementById('texto-alerta-global').textContent = msg;
  el.className = 'alerta alerta-' + (tipo === 'error' ? 'error' : 'exito') + ' visible';
}
function ocultarAlerta() {
  document.getElementById('alerta-global').classList.remove('visible');
}

/* ================================================================
   SECCION 9 -- PANEL DE ADMINISTRACION
================================================================ */
function togglePanelAdmin() {
  ESTADO.panelAbierto = !ESTADO.panelAbierto;
  document.getElementById('panel-admin').style.display = ESTADO.panelAbierto ? 'block' : 'none';
  if (ESTADO.panelAbierto) {
    document.getElementById('panel-admin').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function verificarPassword() {
  var input  = document.getElementById('input-password');
  var alerta = document.getElementById('alerta-login');
  /* Contrasena de administrador -- cambiar aqui si se requiere */
  if (input.value === 'AdminUNITIC2026') {
    ESTADO.adminLogueado = true;
    document.getElementById('login-admin').style.display    = 'none';
    document.getElementById('admin-contenido').style.display = 'block';
    alerta.classList.remove('visible');
    input.value = '';
  } else {
    alerta.classList.add('visible');
    input.value = '';
    input.focus();
  }
}

function guardarComisaria() {
  var input  = document.getElementById('admin-comisaria');
  var nombre = input.value.trim().toUpperCase();
  var alerta = document.getElementById('alerta-guardado');
  if (!nombre) { input.style.borderColor = '#c0392b'; return; }
  input.style.borderColor = '';
  /* Guardar en localStorage para persistencia entre sesiones */
  localStorage.setItem('comisariaActiva', nombre);
  /* Actualizar el encabezado publico inmediatamente */
  document.getElementById('nombre-comisaria').textContent = nombre;
  alerta.classList.add('visible');
  setTimeout(function() { alerta.classList.remove('visible'); }, 3000);
}

function cerrarSesionAdmin() {
  ESTADO.adminLogueado = false;
  document.getElementById('login-admin').style.display    = 'block';
  document.getElementById('admin-contenido').style.display = 'none';
  document.getElementById('input-password').value         = '';
  document.getElementById('alerta-login').classList.remove('visible');
}
