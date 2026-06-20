/* ================================================================
   evaluacion.js -- Logica del modulo MMPI-2 REGPOL Callao
   Ing. Anthony Ccayo -- UNITIC -- 2026
   Las preguntas estan en preguntas.js (566 items, V/F)

   ANTES DE PUBLICAR: reemplaza en CONFIG_FORMS los entry.XXXXXXX
   con los IDs reales de tu Google Form.
================================================================ */

/* ================================================================
   CONFIGURACION GOOGLE FORMS
   Sustituye TU_FORM_ID y cada entry.10000000XX con los valores
   reales que obtendras al ejecutar el script de Apps Script.
================================================================ */
var FORM_BASE = 'https://docs.google.com';
var FORM_PATH = '/forms/d/e/1FAIpQLSeSDjzhDeP8VHPSifAbfMOwaxFJkcOWCX9A6jEH6WD9v2ySlg/formResponse';

// Web App de Apps Script — vinculada a Google Sheets con respuestas MMPI-2
var WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzHHCUjXQVNtgVTERGx3RuiGPfSHuhCgTVddHL8ByDJUE-lLQessVsdFCFabayhCC5u/exec';

var CONFIG_FORMS = {
  get URL_ENVIO() { return FORM_BASE + FORM_PATH; },
  ENTRY_COMISARIA:        'entry.1740901374',
  ENTRY_UNIDAD:           'entry.1943504054',
  ENTRY_NOMBRES:          'entry.1378176059',
  ENTRY_CIP:              'entry.735319970',
  ENTRY_DNI:              'entry.1588933346',
  ENTRY_FECHA_NACIMIENTO: 'entry.552478882',
  ENTRY_EDAD:             'entry.1375255979',
  ENTRADAS_PREGUNTAS: {
    'ENTRY_P1':'entry.548110497','ENTRY_P2':'entry.1394176358','ENTRY_P3':'entry.1045041829','ENTRY_P4':'entry.604733623','ENTRY_P5':'entry.1921117472',
    'ENTRY_P6':'entry.1824001682','ENTRY_P7':'entry.1465738816','ENTRY_P8':'entry.697800809','ENTRY_P9':'entry.342223312','ENTRY_P10':'entry.324803798',
    'ENTRY_P11':'entry.1209903762','ENTRY_P12':'entry.1729718795','ENTRY_P13':'entry.1039457705','ENTRY_P14':'entry.57237821','ENTRY_P15':'entry.1539417002',
    'ENTRY_P16':'entry.1362775956','ENTRY_P17':'entry.192322124','ENTRY_P18':'entry.519958341','ENTRY_P19':'entry.1196958006','ENTRY_P20':'entry.60206854',
    'ENTRY_P21':'entry.772896748','ENTRY_P22':'entry.1992869578','ENTRY_P23':'entry.1299284413','ENTRY_P24':'entry.492668173','ENTRY_P25':'entry.336558646',
    'ENTRY_P26':'entry.1669721612','ENTRY_P27':'entry.1861743781','ENTRY_P28':'entry.886658948','ENTRY_P29':'entry.2077053059','ENTRY_P30':'entry.362830608',
    'ENTRY_P31':'entry.1782141289','ENTRY_P32':'entry.1537270967','ENTRY_P33':'entry.686394306','ENTRY_P34':'entry.615500335','ENTRY_P35':'entry.109001943',
    'ENTRY_P36':'entry.203776928','ENTRY_P37':'entry.611973607','ENTRY_P38':'entry.1144548237','ENTRY_P39':'entry.1539404125','ENTRY_P40':'entry.1489913284',
    'ENTRY_P41':'entry.1692290529','ENTRY_P42':'entry.1390035763','ENTRY_P43':'entry.576644907','ENTRY_P44':'entry.559045651','ENTRY_P45':'entry.1899818488',
    'ENTRY_P46':'entry.777660962','ENTRY_P47':'entry.1174709529','ENTRY_P48':'entry.1800668424','ENTRY_P49':'entry.1471502760','ENTRY_P50':'entry.1717846747',
    'ENTRY_P51':'entry.1969446368','ENTRY_P52':'entry.1807006003','ENTRY_P53':'entry.159158592','ENTRY_P54':'entry.17113283','ENTRY_P55':'entry.1208591040',
    'ENTRY_P56':'entry.2025825556','ENTRY_P57':'entry.1873172588','ENTRY_P58':'entry.1618283324','ENTRY_P59':'entry.1490312771','ENTRY_P60':'entry.2079885107',
    'ENTRY_P61':'entry.1903286826','ENTRY_P62':'entry.1923042176','ENTRY_P63':'entry.428435738','ENTRY_P64':'entry.1439928607','ENTRY_P65':'entry.175120719',
    'ENTRY_P66':'entry.1002874447','ENTRY_P67':'entry.1682423961','ENTRY_P68':'entry.588082043','ENTRY_P69':'entry.2130974412','ENTRY_P70':'entry.2066080499',
    'ENTRY_P71':'entry.1537670064','ENTRY_P72':'entry.638768401','ENTRY_P73':'entry.1925266401','ENTRY_P74':'entry.36477770','ENTRY_P75':'entry.812306105',
    'ENTRY_P76':'entry.1350303533','ENTRY_P77':'entry.814137437','ENTRY_P78':'entry.286338057','ENTRY_P79':'entry.144482605','ENTRY_P80':'entry.1045223596',
    'ENTRY_P81':'entry.87833175','ENTRY_P82':'entry.1049824069','ENTRY_P83':'entry.615954822','ENTRY_P84':'entry.11729259','ENTRY_P85':'entry.892970424',
    'ENTRY_P86':'entry.126553902','ENTRY_P87':'entry.1316814987','ENTRY_P88':'entry.1592495228','ENTRY_P89':'entry.1584882550','ENTRY_P90':'entry.943453935',
    'ENTRY_P91':'entry.1537125695','ENTRY_P92':'entry.1619546173','ENTRY_P93':'entry.529605617','ENTRY_P94':'entry.1161126286','ENTRY_P95':'entry.1807858585',
    'ENTRY_P96':'entry.1649609010','ENTRY_P97':'entry.311432968','ENTRY_P98':'entry.899341885','ENTRY_P99':'entry.222676844','ENTRY_P100':'entry.160229865',
    'ENTRY_P101':'entry.178417722','ENTRY_P102':'entry.1158894818','ENTRY_P103':'entry.1648221905','ENTRY_P104':'entry.414776214','ENTRY_P105':'entry.1378545116',
    'ENTRY_P106':'entry.1534437862','ENTRY_P107':'entry.377732842','ENTRY_P108':'entry.664762932','ENTRY_P109':'entry.728611883','ENTRY_P110':'entry.12090636',
    'ENTRY_P111':'entry.1588278049','ENTRY_P112':'entry.1796917143','ENTRY_P113':'entry.1808043952','ENTRY_P114':'entry.1501006628','ENTRY_P115':'entry.1236649100',
    'ENTRY_P116':'entry.71589576','ENTRY_P117':'entry.569694198','ENTRY_P118':'entry.977490207','ENTRY_P119':'entry.1935562715','ENTRY_P120':'entry.327336422',
    'ENTRY_P121':'entry.1857505822','ENTRY_P122':'entry.1809998065','ENTRY_P123':'entry.108605585','ENTRY_P124':'entry.1679258676','ENTRY_P125':'entry.244139156',
    'ENTRY_P126':'entry.269680868','ENTRY_P127':'entry.2091467623','ENTRY_P128':'entry.1525115149','ENTRY_P129':'entry.1490741272','ENTRY_P130':'entry.1701632560',
    'ENTRY_P131':'entry.1363154195','ENTRY_P132':'entry.532443450','ENTRY_P133':'entry.1661063545','ENTRY_P134':'entry.876918109','ENTRY_P135':'entry.1515307452',
    'ENTRY_P136':'entry.1837911636','ENTRY_P137':'entry.71111421','ENTRY_P138':'entry.321439101','ENTRY_P139':'entry.1019182709','ENTRY_P140':'entry.300684737',
    'ENTRY_P141':'entry.98229738','ENTRY_P142':'entry.1186912191','ENTRY_P143':'entry.1693795106','ENTRY_P144':'entry.1203837063','ENTRY_P145':'entry.1384598247',
    'ENTRY_P146':'entry.515225772','ENTRY_P147':'entry.213248373','ENTRY_P148':'entry.666151104','ENTRY_P149':'entry.612209484','ENTRY_P150':'entry.1080302055',
    'ENTRY_P151':'entry.1892994645','ENTRY_P152':'entry.1599276474','ENTRY_P153':'entry.1789305600','ENTRY_P154':'entry.101716976','ENTRY_P155':'entry.298593617',
    'ENTRY_P156':'entry.1606462687','ENTRY_P157':'entry.1451177487','ENTRY_P158':'entry.1027385783','ENTRY_P159':'entry.1304332484','ENTRY_P160':'entry.642887517',
    'ENTRY_P161':'entry.507144160','ENTRY_P162':'entry.1108628446','ENTRY_P163':'entry.1155261246','ENTRY_P164':'entry.477458457','ENTRY_P165':'entry.833558992',
    'ENTRY_P166':'entry.1417784466','ENTRY_P167':'entry.110530750','ENTRY_P168':'entry.1743792337','ENTRY_P169':'entry.17632115','ENTRY_P170':'entry.834991148',
    'ENTRY_P171':'entry.1534680501','ENTRY_P172':'entry.1947847575','ENTRY_P173':'entry.109333111','ENTRY_P174':'entry.554365050','ENTRY_P175':'entry.2010613344',
    'ENTRY_P176':'entry.1463076345','ENTRY_P177':'entry.42453982','ENTRY_P178':'entry.2025766991','ENTRY_P179':'entry.58314893','ENTRY_P180':'entry.645979817',
    'ENTRY_P181':'entry.1706799008','ENTRY_P182':'entry.957846744','ENTRY_P183':'entry.854292019','ENTRY_P184':'entry.1236267181','ENTRY_P185':'entry.1507108747',
    'ENTRY_P186':'entry.167703100','ENTRY_P187':'entry.737568369','ENTRY_P188':'entry.210408376','ENTRY_P189':'entry.436056636','ENTRY_P190':'entry.1680159671',
    'ENTRY_P191':'entry.389639997','ENTRY_P192':'entry.824364371','ENTRY_P193':'entry.658027614','ENTRY_P194':'entry.442781792','ENTRY_P195':'entry.996667951',
    'ENTRY_P196':'entry.813040377','ENTRY_P197':'entry.961238108','ENTRY_P198':'entry.489217687','ENTRY_P199':'entry.1027381115','ENTRY_P200':'entry.1949110370',
    'ENTRY_P201':'entry.1047205958','ENTRY_P202':'entry.214614645','ENTRY_P203':'entry.863233129','ENTRY_P204':'entry.1149860708','ENTRY_P205':'entry.1069017443',
    'ENTRY_P206':'entry.1365215219','ENTRY_P207':'entry.129665758','ENTRY_P208':'entry.523948113','ENTRY_P209':'entry.214497188','ENTRY_P210':'entry.1058755585',
    'ENTRY_P211':'entry.1426492597','ENTRY_P212':'entry.1603568509','ENTRY_P213':'entry.271364414','ENTRY_P214':'entry.86955654','ENTRY_P215':'entry.485877302',
    'ENTRY_P216':'entry.1220219724','ENTRY_P217':'entry.1072673797','ENTRY_P218':'entry.1117601161','ENTRY_P219':'entry.700898634','ENTRY_P220':'entry.252493942',
    'ENTRY_P221':'entry.1817214736','ENTRY_P222':'entry.292327402','ENTRY_P223':'entry.1494016398','ENTRY_P224':'entry.1504372745','ENTRY_P225':'entry.1891616229',
    'ENTRY_P226':'entry.1031207581','ENTRY_P227':'entry.38371618','ENTRY_P228':'entry.1540891786','ENTRY_P229':'entry.741463626','ENTRY_P230':'entry.1850221252',
    'ENTRY_P231':'entry.395980927','ENTRY_P232':'entry.2123130256','ENTRY_P233':'entry.1042285576','ENTRY_P234':'entry.1745402295','ENTRY_P235':'entry.2029850264',
    'ENTRY_P236':'entry.1405238620','ENTRY_P237':'entry.1700940358','ENTRY_P238':'entry.1897354293','ENTRY_P239':'entry.146328688','ENTRY_P240':'entry.1309641859',
    'ENTRY_P241':'entry.1409970701','ENTRY_P242':'entry.1713781843','ENTRY_P243':'entry.938692985','ENTRY_P244':'entry.579443581','ENTRY_P245':'entry.37416540',
    'ENTRY_P246':'entry.740885341','ENTRY_P247':'entry.458708531','ENTRY_P248':'entry.798839867','ENTRY_P249':'entry.2002119425','ENTRY_P250':'entry.795213855',
    'ENTRY_P251':'entry.1455054166','ENTRY_P252':'entry.572830428','ENTRY_P253':'entry.1800343517','ENTRY_P254':'entry.1056635773','ENTRY_P255':'entry.1345797815',
    'ENTRY_P256':'entry.227280625','ENTRY_P257':'entry.1968396414','ENTRY_P258':'entry.78166043','ENTRY_P259':'entry.1225541722','ENTRY_P260':'entry.2018191622',
    'ENTRY_P261':'entry.1049470890','ENTRY_P262':'entry.678115601','ENTRY_P263':'entry.795839403','ENTRY_P264':'entry.430708433','ENTRY_P265':'entry.1895053354',
    'ENTRY_P266':'entry.1973478619','ENTRY_P267':'entry.131655744','ENTRY_P268':'entry.585495225','ENTRY_P269':'entry.1818155166','ENTRY_P270':'entry.650732726',
    'ENTRY_P271':'entry.1337861700','ENTRY_P272':'entry.771928961','ENTRY_P273':'entry.739759841','ENTRY_P274':'entry.1346812193','ENTRY_P275':'entry.460969902',
    'ENTRY_P276':'entry.690293507','ENTRY_P277':'entry.1689475541','ENTRY_P278':'entry.207788644','ENTRY_P279':'entry.393694530','ENTRY_P280':'entry.1993876150',
    'ENTRY_P281':'entry.1031836339','ENTRY_P282':'entry.1675827344','ENTRY_P283':'entry.1837283161','ENTRY_P284':'entry.1435430353','ENTRY_P285':'entry.820468749',
    'ENTRY_P286':'entry.1532625765','ENTRY_P287':'entry.648648483','ENTRY_P288':'entry.2081002304','ENTRY_P289':'entry.255884473','ENTRY_P290':'entry.1232142128',
    'ENTRY_P291':'entry.1856285150','ENTRY_P292':'entry.329555672','ENTRY_P293':'entry.1810311200','ENTRY_P294':'entry.527359929','ENTRY_P295':'entry.1518464202',
    'ENTRY_P296':'entry.1424560035','ENTRY_P297':'entry.794416483','ENTRY_P298':'entry.695124989','ENTRY_P299':'entry.156977392','ENTRY_P300':'entry.338676508',
    'ENTRY_P301':'entry.2020446981','ENTRY_P302':'entry.1469018159','ENTRY_P303':'entry.1559991425','ENTRY_P304':'entry.1501635546','ENTRY_P305':'entry.1378173877',
    'ENTRY_P306':'entry.179508559','ENTRY_P307':'entry.584256377','ENTRY_P308':'entry.973001711','ENTRY_P309':'entry.425880114','ENTRY_P310':'entry.1718891100',
    'ENTRY_P311':'entry.50483878','ENTRY_P312':'entry.512672491','ENTRY_P313':'entry.2116252997','ENTRY_P314':'entry.846404666','ENTRY_P315':'entry.469614631',
    'ENTRY_P316':'entry.709782599','ENTRY_P317':'entry.984757715','ENTRY_P318':'entry.888645752','ENTRY_P319':'entry.753631237','ENTRY_P320':'entry.1044345993',
    'ENTRY_P321':'entry.311693785','ENTRY_P322':'entry.124994681','ENTRY_P323':'entry.1521603283','ENTRY_P324':'entry.145140468','ENTRY_P325':'entry.808127662',
    'ENTRY_P326':'entry.2140427177','ENTRY_P327':'entry.961447875','ENTRY_P328':'entry.858887726','ENTRY_P329':'entry.204406182','ENTRY_P330':'entry.2086703672',
    'ENTRY_P331':'entry.2145275169','ENTRY_P332':'entry.418290414','ENTRY_P333':'entry.115047758','ENTRY_P334':'entry.1580169664','ENTRY_P335':'entry.1507180655',
    'ENTRY_P336':'entry.344180866','ENTRY_P337':'entry.1295233510','ENTRY_P338':'entry.1218207166','ENTRY_P339':'entry.2117907781','ENTRY_P340':'entry.490296778',
    'ENTRY_P341':'entry.1915445622','ENTRY_P342':'entry.1130244577','ENTRY_P343':'entry.21291973','ENTRY_P344':'entry.793541779','ENTRY_P345':'entry.1339915570',
    'ENTRY_P346':'entry.160405376','ENTRY_P347':'entry.1444394098','ENTRY_P348':'entry.15480738','ENTRY_P349':'entry.1396235687','ENTRY_P350':'entry.1912799063',
    'ENTRY_P351':'entry.1298963814','ENTRY_P352':'entry.68152587','ENTRY_P353':'entry.1712074169','ENTRY_P354':'entry.1436236276','ENTRY_P355':'entry.494414073',
    'ENTRY_P356':'entry.351696512','ENTRY_P357':'entry.1200283135','ENTRY_P358':'entry.181577276','ENTRY_P359':'entry.1951514027','ENTRY_P360':'entry.1487091701',
    'ENTRY_P361':'entry.387164969','ENTRY_P362':'entry.329684162','ENTRY_P363':'entry.1837595380','ENTRY_P364':'entry.283591350','ENTRY_P365':'entry.237582768',
    'ENTRY_P366':'entry.619370666','ENTRY_P367':'entry.1099871593','ENTRY_P368':'entry.1918700500','ENTRY_P369':'entry.243943374','ENTRY_P370':'entry.1051148571',
    'ENTRY_P371':'entry.1576033144','ENTRY_P372':'entry.344623331','ENTRY_P373':'entry.1593186487','ENTRY_P374':'entry.1306024139','ENTRY_P375':'entry.343757305',
    'ENTRY_P376':'entry.545975005','ENTRY_P377':'entry.2048613373','ENTRY_P378':'entry.643103313','ENTRY_P379':'entry.1605018700','ENTRY_P380':'entry.1846328622',
    'ENTRY_P381':'entry.1336796345','ENTRY_P382':'entry.656222026','ENTRY_P383':'entry.1928979563','ENTRY_P384':'entry.1405533927','ENTRY_P385':'entry.1054602740',
    'ENTRY_P386':'entry.679021727','ENTRY_P387':'entry.555057549','ENTRY_P388':'entry.1006664354','ENTRY_P389':'entry.211300479','ENTRY_P390':'entry.1155666352',
    'ENTRY_P391':'entry.488957600','ENTRY_P392':'entry.992168072','ENTRY_P393':'entry.181348701','ENTRY_P394':'entry.356273970','ENTRY_P395':'entry.1358196838',
    'ENTRY_P396':'entry.1509792359','ENTRY_P397':'entry.1844625517','ENTRY_P398':'entry.1828993670','ENTRY_P399':'entry.66101911','ENTRY_P400':'entry.1329206019',
    'ENTRY_P401':'entry.982771046','ENTRY_P402':'entry.1418161507','ENTRY_P403':'entry.1093570961','ENTRY_P404':'entry.1841546429','ENTRY_P405':'entry.992595665',
    'ENTRY_P406':'entry.2070173406','ENTRY_P407':'entry.1342881488','ENTRY_P408':'entry.681366849','ENTRY_P409':'entry.2045497364','ENTRY_P410':'entry.751002465',
    'ENTRY_P411':'entry.521456922','ENTRY_P412':'entry.1373983317','ENTRY_P413':'entry.396794841','ENTRY_P414':'entry.1200412080','ENTRY_P415':'entry.590050131',
    'ENTRY_P416':'entry.689863873','ENTRY_P417':'entry.1797979161','ENTRY_P418':'entry.1386661925','ENTRY_P419':'entry.1461862380','ENTRY_P420':'entry.411486352',
    'ENTRY_P421':'entry.1713712749','ENTRY_P422':'entry.983867202','ENTRY_P423':'entry.1255020821','ENTRY_P424':'entry.858826997','ENTRY_P425':'entry.1173741008',
    'ENTRY_P426':'entry.861964503','ENTRY_P427':'entry.606090082','ENTRY_P428':'entry.1308232188','ENTRY_P429':'entry.1813255027','ENTRY_P430':'entry.1925383868',
    'ENTRY_P431':'entry.97532312','ENTRY_P432':'entry.1172936377','ENTRY_P433':'entry.125197902','ENTRY_P434':'entry.2140371817','ENTRY_P435':'entry.915665498',
    'ENTRY_P436':'entry.955689945','ENTRY_P437':'entry.778211804','ENTRY_P438':'entry.1024603097','ENTRY_P439':'entry.1982748596','ENTRY_P440':'entry.2019029677',
    'ENTRY_P441':'entry.732089357','ENTRY_P442':'entry.210150699','ENTRY_P443':'entry.218577753','ENTRY_P444':'entry.13478940','ENTRY_P445':'entry.309965310',
    'ENTRY_P446':'entry.1875669064','ENTRY_P447':'entry.1790523889','ENTRY_P448':'entry.1938456153','ENTRY_P449':'entry.1383467786','ENTRY_P450':'entry.1169128521',
    'ENTRY_P451':'entry.1243851130','ENTRY_P452':'entry.379396152','ENTRY_P453':'entry.2058419445','ENTRY_P454':'entry.813779619','ENTRY_P455':'entry.1262732844',
    'ENTRY_P456':'entry.1066668502','ENTRY_P457':'entry.1929065526','ENTRY_P458':'entry.1864773715','ENTRY_P459':'entry.1234808322','ENTRY_P460':'entry.1736692157',
    'ENTRY_P461':'entry.1836718147','ENTRY_P462':'entry.1348113520','ENTRY_P463':'entry.1077335273','ENTRY_P464':'entry.1777517386','ENTRY_P465':'entry.203687857',
    'ENTRY_P466':'entry.298002829','ENTRY_P467':'entry.133714392','ENTRY_P468':'entry.1689977565','ENTRY_P469':'entry.859854571','ENTRY_P470':'entry.613656931',
    'ENTRY_P471':'entry.1248623802','ENTRY_P472':'entry.2108933140','ENTRY_P473':'entry.1615551146','ENTRY_P474':'entry.1850750996','ENTRY_P475':'entry.1902898430',
    'ENTRY_P476':'entry.925010243','ENTRY_P477':'entry.995949504','ENTRY_P478':'entry.1407122435','ENTRY_P479':'entry.627976096','ENTRY_P480':'entry.992284159',
    'ENTRY_P481':'entry.1175863577','ENTRY_P482':'entry.744967673','ENTRY_P483':'entry.423801148','ENTRY_P484':'entry.1714172676','ENTRY_P485':'entry.614826330',
    'ENTRY_P486':'entry.1389572423','ENTRY_P487':'entry.191796280','ENTRY_P488':'entry.74834574','ENTRY_P489':'entry.635561973','ENTRY_P490':'entry.1766858261',
    'ENTRY_P491':'entry.335419965','ENTRY_P492':'entry.415965503','ENTRY_P493':'entry.867090418','ENTRY_P494':'entry.1592749417','ENTRY_P495':'entry.2090051888',
    'ENTRY_P496':'entry.1494079542','ENTRY_P497':'entry.1930995157','ENTRY_P498':'entry.1237369844','ENTRY_P499':'entry.438172708','ENTRY_P500':'entry.693373868',
    'ENTRY_P501':'entry.897152664','ENTRY_P502':'entry.1211973387','ENTRY_P503':'entry.1903351555','ENTRY_P504':'entry.1280168306','ENTRY_P505':'entry.657192268',
    'ENTRY_P506':'entry.2018446939','ENTRY_P507':'entry.198550087','ENTRY_P508':'entry.2120531145','ENTRY_P509':'entry.896369904','ENTRY_P510':'entry.2034226143',
    'ENTRY_P511':'entry.390477463','ENTRY_P512':'entry.711322763','ENTRY_P513':'entry.1839265987','ENTRY_P514':'entry.1802864329','ENTRY_P515':'entry.757453457',
    'ENTRY_P516':'entry.57026308','ENTRY_P517':'entry.2104181310','ENTRY_P518':'entry.1439564007','ENTRY_P519':'entry.1166791897','ENTRY_P520':'entry.628638150',
    'ENTRY_P521':'entry.2054499960','ENTRY_P522':'entry.2033638028','ENTRY_P523':'entry.1844117148','ENTRY_P524':'entry.778342376','ENTRY_P525':'entry.893491379',
    'ENTRY_P526':'entry.224776472','ENTRY_P527':'entry.536106674','ENTRY_P528':'entry.421748197','ENTRY_P529':'entry.1485674815','ENTRY_P530':'entry.641444100',
    'ENTRY_P531':'entry.284217608','ENTRY_P532':'entry.756602899','ENTRY_P533':'entry.1873225762','ENTRY_P534':'entry.469468036','ENTRY_P535':'entry.479643807',
    'ENTRY_P536':'entry.1287435103','ENTRY_P537':'entry.1973057285','ENTRY_P538':'entry.1971949935','ENTRY_P539':'entry.1997385263','ENTRY_P540':'entry.938941672',
    'ENTRY_P541':'entry.1710715973','ENTRY_P542':'entry.398217098','ENTRY_P543':'entry.1992195997','ENTRY_P544':'entry.159439180','ENTRY_P545':'entry.686795082',
    'ENTRY_P546':'entry.2051877946','ENTRY_P547':'entry.1179452203','ENTRY_P548':'entry.386012206','ENTRY_P549':'entry.981689006','ENTRY_P550':'entry.1308243038',
    'ENTRY_P551':'entry.1276024246','ENTRY_P552':'entry.1265929231','ENTRY_P553':'entry.936952727','ENTRY_P554':'entry.1350390888','ENTRY_P555':'entry.1177001022',
    'ENTRY_P556':'entry.550349153','ENTRY_P557':'entry.447879022','ENTRY_P558':'entry.1441763290','ENTRY_P559':'entry.427677725','ENTRY_P560':'entry.664408458',
    'ENTRY_P561':'entry.865572718','ENTRY_P562':'entry.147609946','ENTRY_P563':'entry.612973648','ENTRY_P564':'entry.792789982','ENTRY_P565':'entry.1798005982',
    'ENTRY_P566':'entry.1058950583'
  }
};

/* ================================================================
   ESTADO GLOBAL
   PREGUNTAS, TOTAL_PREGUNTAS y TOTAL_PAGINAS vienen de preguntas.js
================================================================ */
var ESTADO = {
  paginaActual:  1,
  pregsPorPag:   10,
  respuestas:    {},
  registroCompleto: false
};

/* ================================================================
   INICIO
================================================================ */
document.addEventListener('DOMContentLoaded', function() {
  poblarSelectComisarias('f-unidad', '-- Seleccionar comisaría --');

  var guardado = localStorage.getItem('comisariaActiva') || 'NO CONFIGURADA';
  document.getElementById('nombre-comisaria').textContent = guardado;

  if (guardado && guardado !== 'NO CONFIGURADA') {
    seleccionarComisariaEnSelect('f-unidad', guardado);
  }

  document.getElementById('texto-pagina').textContent      = 'Pagina 1 de ' + TOTAL_PAGINAS;
  document.getElementById('texto-respondidas').textContent  = '0 / ' + TOTAL_PREGUNTAS + ' respondidas';
  document.getElementById('info-pagina').textContent        = 'Pagina 1 de ' + TOTAL_PAGINAS;

  actualizarControles();
  actualizarProgreso();
  ocultarCuestionario();

  document.getElementById('f-nacimiento').addEventListener('input', formatearFechaNacimiento);
  document.getElementById('f-nacimiento').addEventListener('blur', calcularEdad);
  ['f-cip', 'f-dni'].forEach(function(id) {
    document.getElementById(id).addEventListener('input', function(e) {
      e.target.value = e.target.value.replace(/\D/g, '');
    });
  });

  // Restaurar sesión Google si estaba logueado
  var googleUser = JSON.parse(localStorage.getItem('googleUser') || 'null');
  if (googleUser) {
    mostrarUsuarioGoogle(googleUser);
    verificarProgresoGuardado(googleUser.email);
  }
});

/* ================================================================
   FECHA DE NACIMIENTO — ESCRITURA MANUAL dd/mm/aaaa
================================================================ */
function formatearFechaNacimiento(e) {
  var el = e.target;
  var digits = el.value.replace(/\D/g, '').slice(0, 8);
  var formatted = '';

  if (digits.length <= 2) {
    formatted = digits;
  } else if (digits.length <= 4) {
    formatted = digits.slice(0, 2) + '/' + digits.slice(2);
  } else {
    formatted = digits.slice(0, 2) + '/' + digits.slice(2, 4) + '/' + digits.slice(4);
  }

  el.value = formatted;
  if (formatted.length === 10) calcularEdad();
  else if (formatted.length === 0) {
    el.classList.remove('invalido', 'valido');
    document.getElementById('f-edad').value = '';
  }
}

function parsearFechaDMY(str) {
  var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((str || '').trim());
  if (!m) return null;

  var dia   = parseInt(m[1], 10);
  var mes   = parseInt(m[2], 10) - 1;
  var anio  = parseInt(m[3], 10);
  var hoy   = new Date();
  var limite = hoy.getFullYear();

  if (mes < 0 || mes > 11 || dia < 1 || dia > 31 || anio < 1920 || anio > limite) return null;

  var fecha = new Date(anio, mes, dia);
  if (fecha.getFullYear() !== anio || fecha.getMonth() !== mes || fecha.getDate() !== dia) return null;
  if (fecha > hoy) return null;

  return fecha;
}

function obtenerEdadDesdeFecha(nac) {
  var hoy  = new Date();
  var edad = hoy.getFullYear() - nac.getFullYear();
  var mes  = hoy.getMonth() - nac.getMonth();
  if (mes < 0 || (mes === 0 && hoy.getDate() < nac.getDate())) edad--;
  return edad;
}

function esFechaNacimientoValida(valor) {
  var nac = parsearFechaDMY(valor);
  if (!nac) return false;
  var edad = obtenerEdadDesdeFecha(nac);
  return edad >= 18 && edad <= 80;
}

function fechaNacimientoParaEnvio() {
  var nac = parsearFechaDMY(document.getElementById('f-nacimiento').value);
  if (!nac) return '';
  var mm = String(nac.getMonth() + 1).padStart(2, '0');
  var dd = String(nac.getDate()).padStart(2, '0');
  return nac.getFullYear() + '-' + mm + '-' + dd;
}

function marcarErrorFecha(mensaje) {
  var input = document.getElementById('f-nacimiento');
  var msg   = document.getElementById('msg-nacimiento');
  input.classList.add('invalido');
  input.classList.remove('valido');
  if (msg) msg.textContent = mensaje;
}

/* ================================================================
   CALCULO AUTOMATICO DE EDAD
================================================================ */
function calcularEdad() {
  var input = document.getElementById('f-nacimiento');
  var out   = document.getElementById('f-edad');
  var msg   = document.getElementById('msg-nacimiento');
  var valor = input.value.trim();

  if (!valor) {
    out.value = '';
    input.classList.remove('invalido', 'valido');
    if (msg) msg.textContent = 'Use formato dd/mm/aaaa (ej: 15/03/1990).';
    return;
  }

  if (valor.length < 10) {
    out.value = '';
    marcarErrorFecha('Complete la fecha en formato dd/mm/aaaa.');
    return;
  }

  var nac = parsearFechaDMY(valor);
  if (!nac) {
    out.value = '';
    marcarErrorFecha('Fecha invalida. Verifique dia, mes y anio.');
    return;
  }

  var edad = obtenerEdadDesdeFecha(nac);
  if (edad < 18 || edad > 80) {
    out.value = 'Verifique la fecha ingresada';
    marcarErrorFecha('La edad debe estar entre 18 y 80 anios.');
    return;
  }

  out.value = edad + ' anios';
  input.classList.remove('invalido');
  input.classList.add('valido');
  if (msg) msg.textContent = 'Use formato dd/mm/aaaa (ej: 15/03/1990).';
}

/* ================================================================
   REGISTRO OBLIGATORIO ANTES DEL CUESTIONARIO
================================================================ */
function validarCamposRegistro() {
  var err = false;
  var msgErr = '';
  var campos = [
    { id: 'f-unidad',     test: function(v) { return v.trim().length > 0; },      msg: 'Seleccione su comisaría.' },
    { id: 'f-nombres',    test: function(v) { return v.trim().length > 0; },      msg: 'El nombre completo es obligatorio.' },
    { id: 'f-cip',        test: function(v) { return /^\d{8}$/.test(v.trim()); }, msg: 'El CIP debe tener exactamente 8 digitos.' },
    { id: 'f-dni',        test: function(v) { return /^\d{8}$/.test(v.trim()); }, msg: 'El DNI debe tener exactamente 8 digitos.' },
    { id: 'f-nacimiento', test: esFechaNacimientoValida, msg: 'Ingrese una fecha valida en formato dd/mm/aaaa (18 a 80 anios).' }
  ];

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

  var edadEl = document.getElementById('f-edad');
  if (edadEl && edadEl.value.indexOf('Verifique') !== -1) {
    err = true;
    if (!msgErr) msgErr = 'Verifique la fecha de nacimiento y la edad calculada.';
  }

  return { ok: !err, msg: msgErr };
}

function ocultarCuestionario() {
  ESTADO.registroCompleto = false;
  var card = document.getElementById('card-cuestionario');
  if (card) card.classList.add('seccion-bloqueada');
  var reg = document.getElementById('card-registro');
  if (reg) reg.classList.remove('card-registro-bloqueado');
  sessionStorage.removeItem('bienestarRegistroOk');
}

function activarCuestionario(hacerScroll) {
  ESTADO.registroCompleto = true;
  sessionStorage.setItem('bienestarRegistroOk', '1');
  var card = document.getElementById('card-cuestionario');
  if (card) card.classList.remove('seccion-bloqueada');
  var reg = document.getElementById('card-registro');
  if (reg) reg.classList.add('card-registro-bloqueado');
  renderizarPagina(ESTADO.paginaActual || 1, !!hacerScroll);
}

function continuarAlCuestionario() {
  var val = validarCamposRegistro();
  if (!val.ok) {
    mostrarAlerta(val.msg, 'error');
    document.getElementById('card-registro').scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  ocultarAlerta();
  activarCuestionario(true);
  mostrarAlerta('Registro completado. Responda el cuestionario MMPI-2.', 'exito');
  setTimeout(ocultarAlerta, 3500);
}

/* ================================================================
   RENDERIZADO DE PAGINA (paginacion de 10 en 10)
================================================================ */
function renderizarPagina(pagina, hacerScroll) {
  if (!ESTADO.registroCompleto) return;

  ESTADO.paginaActual = pagina;
  var zona   = document.getElementById('zona-preguntas');
  var inicio = (pagina - 1) * ESTADO.pregsPorPag;
  var fin    = Math.min(inicio + ESTADO.pregsPorPag, TOTAL_PREGUNTAS);
  var subs   = PREGUNTAS.slice(inicio, fin);

  var html = '<table class="tabla-preguntas" role="grid">' +
    '<thead><tr>' +
    '<th class="col-n">#</th>' +
    '<th>Pregunta MMPI-2</th>' +
    '<th class="col-r">V &nbsp; F</th>' +
    '</tr></thead><tbody>';

  subs.forEach(function(p) {
    var r    = ESTADO.respuestas[p.id];
    var chkV = (r === 'V') ? 'checked' : '';
    var chkF = (r === 'F') ? 'checked' : '';
    var cls  = !r ? 'sin-marcar' : '';
    html += '<tr class="' + cls + '" id="fila-' + p.id + '">' +
      '<td class="td-num">' + p.id + '</td>' +
      '<td class="td-texto">' + p.texto + '</td>' +
      '<td class="td-resp">' +
        '<div class="opciones-si-no">' +
          '<label class="lbl-si">' +
            '<input type="radio" name="p' + p.id + '" value="V" ' + chkV +
            ' onchange="guardarRespuesta(' + p.id + ',\'V\')"> V' +
          '</label>' +
          '<label class="lbl-no">' +
            '<input type="radio" name="p' + p.id + '" value="F" ' + chkF +
            ' onchange="guardarRespuesta(' + p.id + ',\'F\')"> F' +
          '</label>' +
        '</div>' +
      '</td></tr>';
  });

  html += '</tbody></table>';
  zona.innerHTML = html;
  actualizarControles();
  actualizarProgreso();
  if (hacerScroll !== false) {
    document.getElementById('card-cuestionario').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/* ================================================================
   GUARDAR RESPUESTA EN MEMORIA
================================================================ */
function guardarRespuesta(id, val) {
  if (!ESTADO.registroCompleto) return;
  ESTADO.respuestas[id] = val;
  var fila = document.getElementById('fila-' + id);
  if (fila) fila.classList.remove('sin-marcar');
  actualizarProgreso();
  autoGuardarProgreso();
}

/* ================================================================
   BARRA DE PROGRESO
================================================================ */
function actualizarProgreso() {
  var resp = Object.keys(ESTADO.respuestas).length;
  var pct  = Math.round((resp / TOTAL_PREGUNTAS) * 100);
  document.getElementById('barra-progreso').style.width = pct + '%';
  document.getElementById('texto-pagina').textContent =
    'Pagina ' + ESTADO.paginaActual + ' de ' + TOTAL_PAGINAS;
  document.getElementById('texto-respondidas').textContent =
    resp + ' / ' + TOTAL_PREGUNTAS + ' respondidas';
  document.getElementById('aria-progreso').setAttribute('aria-valuenow', pct);
}

/* ================================================================
   CONTROLES DE PAGINACION
================================================================ */
function actualizarControles() {
  var pg    = ESTADO.paginaActual;
  var esUlt = (pg === TOTAL_PAGINAS);
  document.getElementById('btn-atras').disabled          = (pg === 1);
  document.getElementById('btn-siguiente').style.display = esUlt ? 'none' : 'inline-flex';
  document.getElementById('btn-finalizar').style.display = esUlt ? 'inline-flex' : 'none';
  document.getElementById('info-pagina').textContent     = 'Pagina ' + pg + ' de ' + TOTAL_PAGINAS;
}

function cambiarPagina(delta) {
  if (!ESTADO.registroCompleto) {
    mostrarAlerta('Complete primero su registro en el Paso 1.', 'error');
    return;
  }
  var nueva = ESTADO.paginaActual + delta;
  if (nueva < 1 || nueva > TOTAL_PAGINAS) return;

  if (delta > 0) {
    var inicio  = (ESTADO.paginaActual - 1) * ESTADO.pregsPorPag;
    var fin     = Math.min(inicio + ESTADO.pregsPorPag, TOTAL_PREGUNTAS);
    var sinResp = [];
    for (var i = inicio; i < fin; i++) {
      if (!ESTADO.respuestas[PREGUNTAS[i].id]) sinResp.push(PREGUNTAS[i].id);
    }
    if (sinResp.length > 0) {
      sinResp.forEach(function(id) {
        var f = document.getElementById('fila-' + id);
        if (f) f.classList.add('sin-marcar');
      });
      mostrarAlerta('Responda las ' + sinResp.length + ' pregunta(s) marcadas en rojo antes de continuar.', 'error');
      return;
    }
  }
  ocultarAlerta();
  renderizarPagina(nueva);
}

/* ================================================================
   VALIDACION FINAL Y ENVIO A GOOGLE FORMS
================================================================ */
function validarYEnviar() {
  var valReg = validarCamposRegistro();
  if (!valReg.ok) {
    mostrarAlerta(valReg.msg, 'error');
    ocultarCuestionario();
    document.getElementById('card-registro').scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  var msg     = 'Confirma el envio del MMPI-2?\n\nEfectivo: ' + nombres + '\nDNI: ' + dni + '\nComisaria: ' + comis;

  if (!confirm(msg)) return;
  enviarAGoogleForms();
}

function enviarAGoogleForms() {
  var overlay   = document.getElementById('overlay-envio');
  var spinner   = document.getElementById('spinner-overlay');
  var checkIcon = document.getElementById('check-ok-icon');
  var textoO    = document.getElementById('texto-overlay');
  var subtextoO = document.getElementById('subtexto-overlay');

  overlay.classList.add('visible');

  var datos = new FormData();
  datos.append(CONFIG_FORMS.ENTRY_COMISARIA,        document.getElementById('nombre-comisaria').textContent);
  datos.append(CONFIG_FORMS.ENTRY_UNIDAD,           document.getElementById('f-unidad').value.trim());
  datos.append(CONFIG_FORMS.ENTRY_NOMBRES,          document.getElementById('f-nombres').value.trim());
  datos.append(CONFIG_FORMS.ENTRY_CIP,              document.getElementById('f-cip').value.trim());
  datos.append(CONFIG_FORMS.ENTRY_DNI,              document.getElementById('f-dni').value.trim());
  datos.append(CONFIG_FORMS.ENTRY_FECHA_NACIMIENTO, fechaNacimientoParaEnvio());
  datos.append(CONFIG_FORMS.ENTRY_EDAD,             document.getElementById('f-edad').value);

  PREGUNTAS.forEach(function(p) {
    var entryId = CONFIG_FORMS.ENTRADAS_PREGUNTAS['ENTRY_P' + p.id];
    datos.append(entryId, ESTADO.respuestas[p.id] || '');
  });

  fetch(CONFIG_FORMS.URL_ENVIO, { method: 'POST', mode: 'no-cors', body: datos })
    .then(function() {
      spinner.style.display   = 'none';
      checkIcon.style.display = 'block';
      textoO.textContent      = 'MMPI-2 enviado correctamente!';
      subtextoO.textContent   = document.getElementById('f-nombres').value.trim() +
        ' | DNI: ' + document.getElementById('f-dni').value.trim();
      limpiarProgresoGuardado();
      setTimeout(function() { overlay.classList.remove('visible'); limpiarFormulario(); }, 5000);
    })
    .catch(function() {
      spinner.style.display = 'none';
      textoO.textContent    = 'Error de conexion. Intente nuevamente.';
      textoO.style.color    = '#ffaaaa';
      setTimeout(function() {
        overlay.classList.remove('visible');
        spinner.style.display = 'block';
        textoO.textContent    = 'Enviando evaluacion...';
        textoO.style.color    = '';
      }, 4000);
    });
}

function limpiarFormulario() {
  ['f-unidad', 'f-nombres', 'f-cip', 'f-dni', 'f-nacimiento', 'f-edad'].forEach(function(id) {
    document.getElementById(id).value = '';
  });
  ESTADO.respuestas = {};
  ESTADO.paginaActual = 1;
  ocultarCuestionario();
  actualizarControles();
  actualizarProgreso();
  document.getElementById('zona-preguntas').innerHTML = '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ================================================================
   ALERTAS
================================================================ */
function mostrarAlerta(msg, tipo) {
  var el = document.getElementById('alerta-global');
  document.getElementById('texto-alerta-global').textContent = msg;
  el.className = 'alerta alerta-' + (tipo === 'error' ? 'error' : 'exito') + ' visible';
}
function ocultarAlerta() {
  document.getElementById('alerta-global').classList.remove('visible');
}

function abrirPanelAdmin(e) {
  if (e) e.preventDefault();
  window.open('panel-admin.html', 'regpol_panel_unitic', 'noopener,noreferrer');
  return false;
}

/* ================================================================
   GOOGLE SIGN-IN + GUARDADO DE PROGRESO
================================================================ */
var GOOGLE_USER = null;
var AUTO_SAVE_COUNTER = 0;

// Callback de Google Identity Services
function onGoogleSignIn(response) {
  try {
    var payload = parseJWT(response.credential);
    var user = {
      email:  payload.email,
      nombre: payload.name,
      foto:   payload.picture
    };
    GOOGLE_USER = user;
    localStorage.setItem('googleUser', JSON.stringify(user));
    mostrarUsuarioGoogle(user);
    document.getElementById('google-signin-banner').classList.add('gsb-logueado');
    verificarProgresoGuardado(user.email);
  } catch(e) {
    console.error('Error Google Sign-In:', e);
  }
}

function mostrarUsuarioGoogle(user) {
  document.getElementById('google-btn-wrap').style.display   = 'none';
  document.getElementById('google-user-info').style.display  = 'flex';
  document.getElementById('google-user-nombre').textContent  = user.nombre || user.email;
  document.getElementById('google-user-email').textContent   = user.email;
  if (user.foto) document.getElementById('google-user-foto').src = user.foto;
  var skip = document.querySelector('.btn-gsb-skip');
  if (skip) skip.style.display = 'none';
  GOOGLE_USER = user;
}

function saltarLogin() {
  var banner = document.getElementById('google-signin-banner');
  banner.style.display = 'none';
  // Verificar si hay progreso guardado por CIP/local
  verificarProgresoLocal();
}

function cerrarSesionGoogle() {
  GOOGLE_USER = null;
  localStorage.removeItem('googleUser');
  document.getElementById('google-btn-wrap').style.display  = 'flex';
  document.getElementById('google-user-info').style.display = 'none';
  var skip = document.querySelector('.btn-gsb-skip');
  if (skip) skip.style.display = '';
  document.getElementById('google-signin-banner').classList.remove('gsb-logueado');
  document.getElementById('banner-progreso').style.display = 'none';
}

// Verificar progreso guardado en el servidor (Google Sheets)
function verificarProgresoGuardado(email) {
  if (!WEB_APP_URL || !email) { verificarProgresoLocal(); return; }

  fetch(WEB_APP_URL + '?action=cargar_progreso&email=' + encodeURIComponent(email))
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.ok && data.encontrado && data.total > 0) {
        mostrarBannerProgreso(data);
      } else {
        verificarProgresoLocal();
      }
    })
    .catch(function() { verificarProgresoLocal(); });
}

// Verificar progreso guardado localmente (por CIP)
function verificarProgresoLocal() {
  var cip = document.getElementById('f-cip') && document.getElementById('f-cip').value.trim();
  var clave = 'progreso_' + (GOOGLE_USER ? GOOGLE_USER.email : (cip || 'anonimo'));
  var saved = localStorage.getItem(clave);
  if (saved) {
    try {
      var data = JSON.parse(saved);
      if (data.total > 0) mostrarBannerProgreso(data);
    } catch(e) {}
  }
}

function mostrarBannerProgreso(data) {
  var banner = document.getElementById('banner-progreso');
  var info   = document.getElementById('banner-progreso-info');
  info.textContent = 'Página ' + (data.pagina || 1) + ' de ' + TOTAL_PAGINAS +
    ' — ' + (data.total || 0) + ' de ' + TOTAL_PREGUNTAS + ' preguntas respondidas';
  banner.style.display = 'flex';
  banner._data = data;
}

function restaurarProgreso() {
  var data = document.getElementById('banner-progreso')._data;
  if (!data) return;

  // Rellenar campos personales
  if (data.cip)       document.getElementById('f-cip').value       = data.cip;
  if (data.nombres)   document.getElementById('f-nombres').value   = data.nombres;
  if (data.comisaria) seleccionarComisariaEnSelect('f-unidad', data.comisaria);

  // Restaurar respuestas
  if (data.respuestas) {
    ESTADO.respuestas = typeof data.respuestas === 'string'
      ? JSON.parse(data.respuestas)
      : data.respuestas;
  }

  // Ir a la página guardada
  var pagina = parseInt(data.pagina) || 1;
  ESTADO.paginaActual = pagina;
  activarCuestionario(true);
  actualizarProgreso();

  document.getElementById('banner-progreso').style.display = 'none';

  mostrarAlerta('Progreso restaurado — continúa desde la página ' + pagina, 'exito');
}

function descartarProgreso() {
  document.getElementById('banner-progreso').style.display = 'none';
  // Borrar progreso guardado
  if (GOOGLE_USER) {
    localStorage.removeItem('progreso_' + GOOGLE_USER.email);
  }
  mostrarAlerta('Iniciando evaluación desde el principio.', 'exito');
}

// Auto-guardar cada 5 respuestas
function autoGuardarProgreso() {
  AUTO_SAVE_COUNTER++;
  if (AUTO_SAVE_COUNTER % 5 !== 0) return;

  var cip       = (document.getElementById('f-cip')      || {}).value || '';
  var nombres   = (document.getElementById('f-nombres')  || {}).value || '';
  var comisaria = (document.getElementById('f-unidad')   || {}).value || '';
  var total     = Object.keys(ESTADO.respuestas).length;
  var email     = GOOGLE_USER ? GOOGLE_USER.email : '';
  var clave     = 'progreso_' + (email || cip || 'anonimo');

  var payload = {
    email:     email,
    cip:       cip,
    nombres:   nombres,
    comisaria: comisaria,
    pagina:    ESTADO.paginaActual,
    total:     total,
    respuestas: ESTADO.respuestas
  };

  // Guardar siempre en localStorage (instantáneo)
  localStorage.setItem(clave, JSON.stringify(payload));

  // Guardar en Google Sheets si hay email y Web App
  if (email && WEB_APP_URL) {
    fetch(WEB_APP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ action: 'guardar_progreso' }, payload)),
      mode: 'no-cors'
    }).catch(function() {});
  }

  // Indicador visual sutil
  mostrarIndicadorGuardado();
}

function mostrarIndicadorGuardado() {
  var ind = document.getElementById('indicador-guardado');
  if (!ind) {
    ind = document.createElement('div');
    ind.id = 'indicador-guardado';
    ind.style.cssText = 'position:fixed;bottom:18px;left:50%;transform:translateX(-50%);' +
      'background:rgba(0,77,61,.92);color:#fff;padding:7px 16px;border-radius:20px;' +
      'font-size:12px;font-weight:600;z-index:9999;pointer-events:none;transition:opacity .3s;';
    ind.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Progreso guardado';
    document.body.appendChild(ind);
  }
  ind.style.opacity = '1';
  clearTimeout(ind._timer);
  ind._timer = setTimeout(function() { ind.style.opacity = '0'; }, 2000);
}

// Limpiar progreso al enviar exitosamente
function limpiarProgresoGuardado() {
  var email = GOOGLE_USER ? GOOGLE_USER.email : '';
  var cip   = (document.getElementById('f-cip') || {}).value || '';
  var clave = 'progreso_' + (email || cip || 'anonimo');
  localStorage.removeItem(clave);
}

// Decodificar JWT de Google
function parseJWT(token) {
  var base64 = token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
  return JSON.parse(decodeURIComponent(atob(base64).split('').map(function(c) {
    return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
  }).join('')));
}
