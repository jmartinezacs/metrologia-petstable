// =====================================================================
// Preguntas frecuentes: guía de uso para todos los perfiles, buscador,
// tutorial ilustrado de instalación (Android, iPhone/iPad y computadora)
// y descarga de la guía completa en PDF tamaño carta.
// Las ilustraciones son SVG propios; el PDF las convierte a PNG.
// =====================================================================
import { state, esc, icon, refreshIcons, toast, errMsg, APP_VERSION } from '../core.js';
import { LOGO, cargarJsPDF } from './etiquetas.js';

// ---------------- Contenido ----------------
// Formato de las respuestas: párrafos separados por \n, viñetas con «- » y **negritas**.
const TEMAS = [
  { id: 'inicio', ico: 'rocket', titulo: 'Primeros pasos', preguntas: [
    ['¿Qué es Metrología y para qué sirve?',
      'Es la aplicación de **Calidad de proceso de Pet\'s Table** para controlar los equipos de medición: básculas, termómetros, potenciómetros y micropipetas.\nEn ella se registran las **verificaciones internas** (contra un patrón), se consultan las **calibraciones externas** con su certificado y se da seguimiento a los resultados «no cumple», para asegurar que cada medición que se hace en planta sea confiable.'],
    ['¿Cómo entro a la aplicación?',
      'Abre **metrologia-petstable.vercel.app** e inicia sesión con tu **correo de Pet\'s Table y tu contraseña**. Es la misma cuenta que usas en las demás aplicaciones de la empresa (por ejemplo, Servicio Médico o Pruebas industriales).\nPara tenerla siempre a la mano, instálala en tu celular o computadora (consulta la sección **Instalar la aplicación**).'],
    ['Olvidé mi contraseña, ¿qué hago?',
      'En la pantalla de inicio de sesión escribe tu correo y toca **¿Olvidaste tu contraseña?**. Recibirás un correo con un enlace para crear una nueva.\nSi no te llega, revisa la carpeta de correo no deseado o pide ayuda a un administrador.'],
    ['¿Quién tiene acceso?',
      'Por indicación de la administración tienen acceso:\n- **Inspectores de calidad y Jefa de Calidad:** verifican los equipos de todas las áreas.\n- **Administradores:** además gestionan equipos, patrones, calibraciones, usuarios y etiquetas.\nSi tu cuenta muestra «no tiene acceso a Metrología», solicita el alta a un administrador.'],
    ['¿Qué muestra el Panel?',
      'Es la pantalla de inicio. Reúne en un vistazo:\n- **Indicadores:** equipos activos, verificaciones del mes, calibraciones vigentes y vencidas (toca cada uno para ver el detalle).\n- **Pendientes de verificación**, ordenados por urgencia y con los días de atraso.\n- **Calibraciones próximas** a vencer o vencidas.\n- Avisos de verificaciones «no cumple» sin cerrar y, para administradores, las **etiquetas por reemplazar**.'],
    ['Apareció «Hay una nueva versión disponible», ¿qué hago?',
      'Toca **Actualizar**. La aplicación se recarga con las mejoras más recientes sin perder tu sesión. Si estás a la mitad de un registro, termínalo primero y actualiza después.'],
  ] },
  { id: 'verificar', ico: 'clipboard-check', titulo: 'Verificaciones', preguntas: [
    ['¿Cuál es la diferencia entre una verificación y una calibración?',
      '- **Verificación:** prueba interna y frecuente que hace el inspector comparando el equipo contra un **patrón** (pesa, termómetro patrón o solución buffer). Confirma que el equipo sigue midiendo bien entre calibraciones.\n- **Calibración:** servicio externo que realiza un **laboratorio acreditado** y que se respalda con un certificado. Tiene vigencia (normalmente un año).'],
    ['¿Cómo registro una verificación?',
      '- Entra a **Registrar verificación** (o toca **Verificar** en la ficha del equipo o en los pendientes del Panel).\n- Elige el **equipo**; la lista indica tipo, código y ubicación.\n- Selecciona el **patrón** vigente que vas a usar.\n- Captura las **lecturas** que muestra el equipo. La vista previa te indica el resultado antes de guardar.\n- Revisa la fecha, agrega observaciones si las hay y toca **Registrar verificación**.\nEl dictamen definitivo (cumple o no cumple) lo calcula el sistema; no depende de la persona que registra.'],
    ['¿Cómo se verifica una báscula?',
      'Coloca la **pesa patrón** y registra **tres lecturas** en la misma unidad de la pesa (g o Kg); la aplicación hace la conversión a la unidad de la báscula.\nEl resultado se compara contra el **error máximo tolerado (EMT)**, que depende de la clase de exactitud de la báscula y del valor de la pesa. Si la pesa está por debajo de la capacidad mínima de la báscula, verás un aviso para usar una pesa mayor.'],
    ['¿Cómo se verifica un termómetro?',
      'Compara el termómetro contra el **termómetro patrón** en el mismo punto y registra las lecturas.\nSi hay desviación y la corriges, marca que hubo corrección, captura el valor corregido y la **lectura final**. El sistema guarda el resultado «como se encontró» y «como se dejó».'],
    ['¿Cómo se verifica un potenciómetro (pH)?',
      'Mide los **tres buffers** de referencia (por ejemplo pH 4.00, 7.00 y 10.00) y registra una lectura por cada uno; la temperatura es opcional.\nSi el equipo requirió **ajuste**, márcalo y captura las lecturas después del ajuste. Así queda registrado cómo se encontró y cómo se dejó.'],
    ['¿Por qué no aparecen las micropipetas para verificar?',
      'Las micropipetas **no llevan verificación interna**: solo se controlan con su **calibración externa**. Por eso no aparecen en Registrar verificación, pero sí en Equipos y en Calibraciones.'],
    ['¿Cada cuándo se verifica cada equipo y qué significan los estados?',
      'Cada equipo tiene su propia frecuencia (por ejemplo, diaria o semanal). Los estados son:\n- **Al día:** la verificación está vigente.\n- **Próxima:** vence en los próximos 3 días.\n- **Atrasada:** ya pasó la fecha en que tocaba.\n- **Sin verificar:** aún no tiene ninguna verificación.\n- **Solo calibración:** el equipo no requiere verificación interna.'],
    ['Me equivoqué al capturar una verificación, ¿puedo editarla?',
      'No. Para conservar la trazabilidad, **una verificación nunca se edita ni se borra**. Avisa a un administrador para que la **anule indicando el motivo** y registra de nuevo la verificación correcta. La anulación queda en la bitácora.'],
    ['¿Para qué sirve la casilla «Etiqueta dañada»?',
      'Márcala al verificar si la etiqueta de identificación del equipo está **rota, ilegible o se desprendió**. Los administradores reciben un aviso y el equipo aparece en su Panel en **Etiquetas por reemplazar** para imprimir una nueva.'],
  ] },
  { id: 'nocumple', ico: 'triangle-alert', titulo: 'Resultados «no cumple»', preguntas: [
    ['¿Qué hago si una verificación sale «no cumple»?',
      '- **Retira el equipo de uso** e identifícalo para que nadie lo utilice.\n- Los administradores reciben un **aviso inmediato**.\n- Registra la **acción correctiva** desde Historial (ajuste, reparación, calibración externa, retiro, re-verificación o baja).\n- Cuando la acción esté terminada, **cierra el seguimiento** con su evidencia. El aviso del Panel desaparece al cerrarlo.'],
    ['¿Cómo registro la acción correctiva?',
      'Entra a **Historial**, filtra por **Seguimiento: pendiente** y abre la verificación. En el cuadro de seguimiento elige la acción, describe lo que se hizo, indica una fecha compromiso y toca **Registrar acción correctiva**. Al concluir, usa **Cerrar seguimiento**.'],
    ['¿Qué significa «cumple después del ajuste»?',
      'El equipo **no cumplía como se encontró**, pero se ajustó o corrigió en el momento y **como se dejó sí cumple**. En ese caso no queda pendiente de seguimiento, aunque el registro conserva ambos resultados.'],
    ['¿Qué es la alerta de tendencia?',
      'Aparece cuando una báscula acumula **3 o más «no cumple» en sus últimas 5 verificaciones**. Indica que el problema es recurrente y conviene programar una revisión o calibración externa.'],
  ] },
  { id: 'equipos', ico: 'gauge', titulo: 'Equipos, patrones y etiquetas', preguntas: [
    ['¿Cómo consulto la información de un equipo?',
      'En **Equipos** toca el ícono de ficha. Verás sus datos generales, parámetros metrológicos, próxima verificación, vigencia de la calibración, sus últimas verificaciones y los certificados. Puedes filtrar por tipo, departamento o estado y buscar por código, marca o serie.'],
    ['¿Qué tipos de báscula hay?',
      '- **Báscula de plataforma:** rango de 0.4 a 200 Kg.\n- **Báscula de mesa:** rango de 0.1 a 15 Kg.\n- **Báscula analítica:** trabaja en gramos (laboratorio).'],
    ['¿Cómo se asignan los códigos de los equipos?',
      'Son **automáticos** y consecutivos por tipo: **BAS-001** para básculas, **TER-01** termómetros, **POT-01** potenciómetros y **MIC-01** micropipetas. Las pesas patrón usan **PP-001**. El código no cambia después del alta y es el que aparece en la etiqueta física.'],
    ['¿Qué son los patrones y por qué no aparece uno al verificar?',
      'Son las referencias contra las que se verifica: **pesas patrón**, termómetros patrón y soluciones buffer. Solo aparecen los patrones **activos y con certificado vigente** del tipo de equipo. Si falta alguno, pide a un administrador que lo registre o actualice en **Patrones**.'],
    ['¿Cómo se imprimen las etiquetas? (administradores)',
      'En **Equipos** toca **Etiquetas** para generar las de todos los equipos o solo de los tipos que elijas; también puedes imprimir la de un solo equipo desde su fila o su ficha. Se descarga un **PDF tamaño carta**.\nAl imprimir elige **tamaño real / 100 %** para respetar las medidas: 72.6 × 22.2 mm en básculas y 39.7 × 22.2 mm en los demás instrumentos.'],
    ['¿Qué pasa si inactivo un equipo? (administradores)',
      'Deja de aparecer para verificar y en los avisos, pero **conserva todo su historial**. Puedes activarlo de nuevo en cualquier momento desde el botón de encendido de la tabla o desde su ficha. Usa el filtro de estado **Inactivos** para encontrarlo.'],
  ] },
  { id: 'calibraciones', ico: 'badge-check', titulo: 'Calibraciones', preguntas: [
    ['¿Quién registra las calibraciones?',
      'Los **administradores**, con la fecha, el vencimiento, el laboratorio y el **certificado en PDF**. Todos los usuarios pueden consultarlas y abrir el certificado.'],
    ['¿Qué significan los estados de calibración?',
      '- **Vigente:** el certificado está en vigor.\n- **Por vencer:** vence en los próximos 30 días; conviene programar el servicio.\n- **Vencida:** el equipo requiere calibración externa.\n- **Sin registro:** no hay certificado capturado.'],
    ['¿Puedo exportar la información?',
      'Sí. En **Historial** y en **Calibraciones** usa **Exportar a Excel (CSV)** para descargar los registros con los filtros que tengas aplicados.'],
  ] },
  { id: 'avisos', ico: 'bell-ring', titulo: 'Avisos y notificaciones', preguntas: [
    ['¿Qué avisos envía la aplicación?',
      'De lunes a sábado a las **8:00 a. m.**:\n- **Quienes verifican:** los equipos que ya toca verificar y los atrasados.\n- **Administradores:** calibraciones por vencer o vencidas y verificaciones con **3 días o más de atraso**.\nAdemás, al momento: cada **«no cumple»** y cada **etiqueta dañada** se avisa a los administradores.'],
    ['¿Cómo activo los avisos?',
      'Entra a **Mi perfil → Avisos en este dispositivo** y toca **Activar avisos**; acepta el permiso del navegador. Hazlo **en cada dispositivo** donde quieras recibirlos. Con **Enviar aviso de prueba** confirmas que llegan.'],
    ['No me llegan los avisos, ¿qué reviso?',
      '- En **iPhone o iPad**, primero instala la aplicación en la pantalla de inicio y ábrela desde el ícono.\n- Si dice **Bloqueados**, permite las notificaciones del sitio en la configuración del navegador o del teléfono.\n- Revisa que el modo **No molestar** o el ahorro de batería no estén silenciando la aplicación.\n- Desactiva y vuelve a activar los avisos, y envía un aviso de prueba.'],
  ] },
  { id: 'cuenta', ico: 'circle-user', titulo: 'Mi cuenta', preguntas: [
    ['¿Cómo cambio mi foto o mi contraseña?',
      'En **Mi perfil** toca el ícono de cámara sobre tu foto para cambiarla. En **Cambiar contraseña** escribe la nueva dos veces (mínimo 8 caracteres). La contraseña **aplica a todas las aplicaciones** de Pet\'s Table que usan tu cuenta.'],
    ['¿Puedo usar el modo oscuro o la pantalla completa?',
      'Sí. En **Mi perfil → Apariencia** elige Claro, Oscuro o Sistema (también con el botón de sol y luna de la barra superior). En la aplicación instalada en computadora puedes usar el botón de **pantalla completa**.'],
    ['¿Cómo doy acceso a una persona? (administradores)',
      'En **Usuarios** toca **Agregar usuario**, busca la cuenta de Pet\'s Table de la persona, asígnale puesto, rol y departamento, y guarda. Al desactivar a alguien solo pierde el acceso a Metrología; sus demás aplicaciones no se afectan.'],
    ['¿Cerrar sesión afecta mis otras aplicaciones?',
      'No. **Salir** cierra la sesión solo en este dispositivo y en Metrología; el dispositivo deja de recibir tus avisos hasta que vuelvas a entrar.'],
  ] },
];

// ---------------- Instalación ----------------
const C = { navy: '#0B1E2D', navy2: '#1D4260', orange: '#F58020', orangeSoft: '#FFE7D1', turq: '#0FA3A6', bg: '#F4F7FA', line: '#D5DEE6', muted: '#8A99A8', txt: '#1F2D3A', white: '#FFFFFF' };
const URL_APP = 'metrologia-petstable.vercel.app';
const appIcon = () => document.querySelector('img.app-icon')?.src || '';

const T = (x, y, s, size = 9, fill = C.txt, weight = 400, anchor = 'start') =>
  `<text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${esc(s)}</text>`;
const anillo = (cx, cy, r = 13) => `<circle cx="${cx}" cy="${cy}" r="${r + 7}" fill="${C.orange}" opacity=".16"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${C.orange}" stroke-width="3"/>`;
const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 240 300" width="240" height="300">${body}</svg>`;
// Teléfono con pantalla (x 51–189, y 16–284)
const telefono = (pantalla) => svg(`<rect x="44" y="6" width="152" height="288" rx="26" fill="${C.navy}"/><rect x="51" y="16" width="138" height="268" rx="18" fill="${C.bg}"/>
  <rect x="100" y="21" width="40" height="7" rx="3.5" fill="${C.navy}"/>${pantalla}`);
// Página de Metrología simulada dentro de la pantalla
const paginaApp = (y0 = 50, y1 = 244) => `<rect x="58" y="${y0}" width="124" height="22" rx="6" fill="${C.white}"/>
  <rect x="64" y="${y0 + 5}" width="12" height="12" rx="3" fill="${C.orange}"/>${T(81, y0 + 14.5, 'Metrología', 8, C.navy, 700)}
  ${[0, 1, 2].map((i) => `<rect x="58" y="${y0 + 30 + i * 34}" width="124" height="27" rx="6" fill="${C.white}"/><rect x="64" y="${y0 + 37 + i * 34}" width="13" height="13" rx="4" fill="${[C.turq, C.orange, '#15985C'][i]}" opacity=".85"/>
    <rect x="82" y="${y0 + 38 + i * 34}" width="${70 - i * 12}" height="4" rx="2" fill="${C.line}"/><rect x="82" y="${y0 + 46 + i * 34}" width="${44 + i * 8}" height="4" rx="2" fill="${C.line}"/>`).join('')}
  <rect x="58" y="${y0 + 134}" width="124" height="${Math.max(0, y1 - y0 - 140)}" rx="6" fill="${C.white}"/>`;
const pantallaInicio = (resaltar = true) => `${[0, 1, 2, 3].map((r) => [0, 1, 2, 3].map((c) => (r === 1 && c === 2 ? '' : `<rect x="${62 + c * 31}" y="${46 + r * 42}" width="22" height="22" rx="6" fill="${['#C9D6E2', '#B9E5E5', '#F8D8BC', '#D4D1F0'][(r + c) % 4]}"/>`)).join('')).join('')}
  <image x="124" y="88" width="22" height="22" href="${appIcon()}" xlink:href="${appIcon()}" preserveAspectRatio="xMidYMid slice"/>
  ${T(135, 119, 'Metrología', 6.5, C.txt, 700, 'middle')}${resaltar ? anillo(135, 99, 16) : ''}
  <rect x="64" y="252" width="112" height="22" rx="11" fill="${C.white}" opacity=".85"/>`;
const hojaMenu = (y, filas, marcada, titulo = '') => `<rect x="51" y="16" width="138" height="268" rx="18" fill="${C.navy}" opacity=".35"/>
  <rect x="55" y="${y}" width="130" height="${284 - y - 6}" rx="12" fill="${C.white}"/>${titulo ? T(120, y + 16, titulo, 8, C.muted, 700, 'middle') : ''}
  ${filas.map((f, i) => {
    const yy = y + (titulo ? 26 : 10) + i * 24, on = i === marcada;
    return `${on ? `<rect x="59" y="${yy - 2}" width="122" height="22" rx="6" fill="${C.orangeSoft}" stroke="${C.orange}" stroke-width="1.6"/>` : `<line x1="63" y1="${yy + 21}" x2="177" y2="${yy + 21}" stroke="${C.line}"/>`}
      ${T(66, yy + 13, f, 7.4, on ? C.navy : C.txt, on ? 700 : 400)}<rect x="164" y="${yy + 4}" width="11" height="11" rx="3" fill="none" stroke="${on ? C.orange : C.muted}" stroke-width="1.4"/>`;
  }).join('')}`;
// Monitor con navegador (pantalla x 16–224, y 56–192)
const monitor = (contenido) => svg(`<rect x="10" y="48" width="220" height="152" rx="9" fill="${C.navy}"/><rect x="16" y="54" width="208" height="138" rx="4" fill="${C.bg}"/>
  <rect x="106" y="200" width="28" height="26" fill="${C.navy2}"/><rect x="78" y="226" width="84" height="7" rx="3.5" fill="${C.navy}"/>${contenido}`);
const barraNavegador = (instalar = false) => `<rect x="16" y="54" width="208" height="13" fill="#E3E9EF"/><rect x="22" y="57" width="46" height="10" rx="3" fill="${C.white}"/>${T(27, 64.5, 'Metrología', 5.5, C.txt, 700)}
  <rect x="16" y="67" width="208" height="15" fill="${C.white}"/><rect x="40" y="70" width="160" height="10" rx="5" fill="${C.bg}"/>${T(48, 77.4, URL_APP, 5.6, C.muted)}
  <g transform="translate(184 70.5)"><rect x="0" y="0" width="11" height="8" rx="1.5" fill="none" stroke="${C.navy}" stroke-width="1.1"/><path d="M5.5 1.6v4M3.7 4l1.8 1.8L7.3 4" stroke="${C.navy}" stroke-width="1.1" fill="none"/></g>
  ${T(208, 77.6, '⋮', 8, C.txt, 700)}${instalar ? anillo(189.5, 74.5, 9) : ''}`;
const paginaPC = (y0 = 86) => `<rect x="22" y="${y0}" width="38" height="${188 - y0}" rx="3" fill="${C.navy}"/><rect x="27" y="${y0 + 6}" width="10" height="10" rx="2.5" fill="${C.orange}"/>
  ${[0, 1, 2, 3].map((i) => `<rect x="27" y="${y0 + 24 + i * 11}" width="26" height="4" rx="2" fill="#2E4A63"/>`).join('')}
  ${[0, 1, 2, 3].map((i) => `<rect x="${66 + i * 38}" y="${y0 + 4}" width="34" height="22" rx="3" fill="${C.white}"/><rect x="${70 + i * 38}" y="${y0 + 9}" width="9" height="9" rx="2.5" fill="${[C.turq, C.orange, '#15985C', '#C42F37'][i]}" opacity=".85"/>`).join('')}
  <rect x="66" y="${y0 + 32}" width="148" height="${188 - y0 - 36}" rx="3" fill="${C.white}"/>`;

const INSTALAR = [
  { id: 'android', ico: 'smartphone', titulo: 'Celular Android', sub: 'Google Chrome', pasos: [
    ['Abre el menú', 'Entra a la aplicación desde **Chrome** y toca el botón de menú **⋮** en la esquina superior derecha.',
      () => telefono(`<rect x="51" y="30" width="138" height="16" fill="${C.white}"/><rect x="58" y="33" width="104" height="10" rx="5" fill="${C.bg}"/>${T(64, 40.5, URL_APP, 5.4, C.muted)}${T(176, 41.5, '⋮', 11, C.txt, 700, 'middle')}${anillo(176, 38, 9)}${paginaApp(52)}`)],
    ['Elige «Instalar aplicación»', 'En el menú toca **Instalar aplicación** (en algunos teléfonos dice **Agregar a pantalla principal**).',
      () => telefono(`${paginaApp(52)}<rect x="96" y="30" width="90" height="150" rx="8" fill="${C.white}" stroke="${C.line}"/>
        ${['Nueva pestaña', 'Historial', 'Descargas', 'Instalar aplicación', 'Compartir…', 'Configuración'].map((f, i) => (i === 3
          ? `<rect x="99" y="${36 + i * 23}" width="84" height="19" rx="5" fill="${C.orangeSoft}" stroke="${C.orange}" stroke-width="1.5"/>${T(104, 49 + i * 23, f, 7.4, C.navy, 700)}`
          : T(104, 49 + i * 23, f, 7.4))).join('')}`)],
    ['Confirma', 'Toca **Instalar** en la ventana de confirmación. El teléfono crea el ícono de **Metrología**.',
      () => telefono(`${paginaApp(52)}<rect x="51" y="16" width="138" height="268" rx="18" fill="${C.navy}" opacity=".45"/>
        <rect x="60" y="104" width="120" height="92" rx="12" fill="${C.white}"/>${T(70, 122, '¿Instalar la app?', 9, C.navy, 700)}
        <image x="70" y="132" width="22" height="22" href="${appIcon()}" xlink:href="${appIcon()}"/>${T(98, 141, 'Metrología', 8, C.txt, 700)}${T(98, 151, URL_APP.slice(0, 22) + '…', 5.4, C.muted)}
        ${T(110, 184, 'Cancelar', 8, C.turq, 700, 'middle')}<rect x="132" y="173" width="40" height="17" rx="8.5" fill="${C.turq}"/>${T(152, 184.5, 'Instalar', 8, C.white, 700, 'middle')}${anillo(152, 181.5, 12)}`)],
    ['¡Listo!', 'Abre **Metrología** desde el ícono de tu pantalla de inicio, como cualquier otra aplicación.',
      () => telefono(pantallaInicio())],
  ] },
  { id: 'ios', ico: 'tablet-smartphone', titulo: 'iPhone o iPad', sub: 'Safari', pasos: [
    ['Toca «Compartir»', 'Abre la aplicación en **Safari** y toca el botón **Compartir** (el cuadro con la flecha hacia arriba) en la barra inferior.',
      () => telefono(`${paginaApp(36, 238)}<rect x="51" y="244" width="138" height="40" rx="0" fill="${C.white}"/><rect x="62" y="248" width="116" height="10" rx="5" fill="${C.bg}"/>${T(120, 255.5, URL_APP, 5.2, C.muted, 400, 'middle')}
        ${[72, 96, 144, 168].map((x) => `<rect x="${x - 4}" y="265" width="8" height="8" rx="2" fill="none" stroke="${C.turq}" stroke-width="1.3"/>`).join('')}
        <g transform="translate(114 262)"><rect x="0" y="4" width="12" height="11" rx="2" fill="none" stroke="#1A73E8" stroke-width="1.5"/><path d="M6 0v9M3 3l3-3 3 3" fill="none" stroke="#1A73E8" stroke-width="1.5"/></g>${anillo(120, 270, 11)}`)],
    ['«Agregar a pantalla de inicio»', 'Desliza las opciones hacia arriba y toca **Agregar a pantalla de inicio**.',
      () => telefono(`${paginaApp(36)}${hojaMenu(110, ['Copiar', 'Agregar a favoritos', 'Agregar a pantalla de inicio', 'Buscar en la página', 'Imprimir'], 2, 'metrologia-petstable')}`)],
    ['Toca «Agregar»', 'Confirma el nombre **Metrología** y toca **Agregar** en la esquina superior derecha.',
      () => telefono(`<rect x="51" y="30" width="138" height="22" fill="${C.white}"/>${T(60, 44.5, 'Cancelar', 7.5, '#1A73E8')}${T(120, 44.5, 'Agregar a inicio', 7.5, C.navy, 700, 'middle')}${T(181, 44.5, 'Agregar', 7.5, '#1A73E8', 700, 'end')}${anillo(168, 41.5, 11)}
        <rect x="58" y="62" width="124" height="44" rx="8" fill="${C.white}"/><image x="66" y="70" width="28" height="28" href="${appIcon()}" xlink:href="${appIcon()}"/>
        ${T(102, 82, 'Metrología', 9, C.txt, 700)}<line x1="102" y1="86" x2="174" y2="86" stroke="${C.line}"/>${T(102, 97, URL_APP.slice(0, 21) + '…', 5.4, C.muted)}
        ${T(60, 122, 'Se agregará un ícono a tu pantalla de inicio', 6.4, C.muted)}${T(60, 131, 'para abrir rápidamente este sitio.', 6.4, C.muted)}`)],
    ['¡Listo!', 'Abre **Metrología** desde el nuevo ícono. Así funcionan también los **avisos** en iPhone y iPad.',
      () => telefono(pantallaInicio())],
  ] },
  { id: 'pc', ico: 'monitor', titulo: 'Computadora', sub: 'Chrome o Microsoft Edge', pasos: [
    ['Busca el ícono de instalar', 'Abre la aplicación en **Chrome** o **Edge** y haz clic en el ícono de **Instalar** de la barra de direcciones (una pantalla con una flecha).',
      () => monitor(`${barraNavegador(true)}${paginaPC()}`)],
    ['Confirma la instalación', 'Haz clic en **Instalar**. En Edge también puedes usar el menú **⋯ → Aplicaciones → Instalar este sitio como aplicación**.',
      () => monitor(`${barraNavegador()}${paginaPC()}<rect x="112" y="84" width="104" height="58" rx="7" fill="${C.white}" stroke="${C.line}"/>
        ${T(120, 98, '¿Instalar la aplicación?', 7, C.navy, 700)}<image x="120" y="104" width="14" height="14" href="${appIcon()}" xlink:href="${appIcon()}"/>${T(139, 114, 'Metrología', 6.5, C.txt, 700)}
        <rect x="146" y="124" width="30" height="12" rx="6" fill="${C.white}" stroke="${C.line}"/>${T(161, 132.4, 'Cancelar', 5.5, C.txt, 400, 'middle')}
        <rect x="180" y="124" width="30" height="12" rx="6" fill="#1A73E8"/>${T(195, 132.4, 'Instalar', 5.5, C.white, 700, 'middle')}${anillo(195, 130, 10)}`)],
    ['Se abre en su propia ventana', 'Metrología se abre como aplicación, sin barra de direcciones. Usa el botón de **pantalla completa** si lo prefieres.',
      () => monitor(`<rect x="16" y="54" width="208" height="14" fill="${C.navy}"/><image x="20" y="56" width="10" height="10" href="${appIcon()}" xlink:href="${appIcon()}"/>${T(34, 63.8, 'Metrología', 6, C.white, 700)}
        ${T(214, 64, '— ▢ ✕', 6, C.white, 400, 'end')}${paginaPC(72)}`)],
    ['Ánclala para tenerla a la mano', 'Haz clic derecho en el ícono de la barra de tareas y elige **Anclar a la barra de tareas**. También aparece en el menú Inicio.',
      () => monitor(`${paginaPC(60)}<rect x="16" y="178" width="208" height="14" fill="${C.navy2}"/>
        ${[0, 1, 2, 4].map((i) => `<rect x="${78 + i * 18}" y="181" width="9" height="9" rx="2" fill="#7F96AA"/>`).join('')}
        <image x="148" y="180" width="11" height="11" href="${appIcon()}" xlink:href="${appIcon()}"/>${anillo(153.5, 185.5, 9)}
        <rect x="120" y="140" width="96" height="34" rx="5" fill="${C.white}" stroke="${C.line}"/>${T(127, 153, 'Metrología', 6.5, C.txt, 700)}
        <rect x="123" y="157" width="90" height="13" rx="3" fill="${C.orangeSoft}"/>${T(127, 166, 'Anclar a la barra de tareas', 6, C.navy, 700)}`)],
  ] },
];

// ---------------- Vista ----------------
let root;
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const plano = (s) => s.replace(/\*\*/g, '');
function htmlRespuesta(txt) {
  const fmt = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  let html = '', lista = [];
  const cerrar = () => { if (lista.length) { html += `<ul>${lista.map((l) => `<li>${fmt(l)}</li>`).join('')}</ul>`; lista = []; } };
  txt.split('\n').forEach((l) => { if (l.startsWith('- ')) lista.push(l.slice(2)); else { cerrar(); html += `<p>${fmt(l)}</p>`; } });
  cerrar();
  return html;
}
const totalPreguntas = TEMAS.reduce((s, t) => s + t.preguntas.length, 0);

export default {
  async render(el) {
    root = el;
    el.innerHTML = `
      <section class="faq-hero">
        <div class="faq-hero-txt">
          <span class="eyebrow">Centro de ayuda</span>
          <h1>Preguntas frecuentes</h1>
          <p>Todo lo que necesitas para verificar equipos, atender resultados, recibir avisos e instalar la aplicación.</p>
          <div class="faq-search">${icon('search')}<input type="search" id="faq-q" placeholder="Escribe tu duda, por ejemplo: «no cumple» o «instalar»" aria-label="Buscar en preguntas frecuentes" autocomplete="off"></div>
          <div class="faq-meta"><span>${icon('message-circle-question')} ${totalPreguntas} respuestas</span><span>${icon('layers')} ${TEMAS.length + 1} temas</span><span>${icon('info')} Versión ${esc(APP_VERSION)}</span></div>
        </div>
        <div class="faq-guia">
          <span class="faq-guia-ico">${icon('book-open-text')}</span>
          <b>Guía de usuario en PDF</b>
          <span>Preguntas frecuentes y tutorial ilustrado de instalación, listo para imprimir o compartir.</span>
          <button class="btn primary" id="faq-pdf">${icon('download')} Descargar guía</button>
        </div>
      </section>
      <nav class="faq-chips" aria-label="Temas">
        ${TEMAS.map((t) => `<a href="#faq-${t.id}" class="faq-chip" data-sec="${t.id}">${icon(t.ico)} ${esc(t.titulo)}</a>`).join('')}
        <a href="#faq-instalar" class="faq-chip" data-sec="instalar">${icon('download')} Instalar la aplicación</a>
      </nav>
      <div class="faq-body">
        ${TEMAS.map((t) => `<section class="faq-sec" id="faq-${t.id}">
          <h2><span class="faq-sec-ico">${icon(t.ico)}</span>${esc(t.titulo)}<small>${t.preguntas.length} preguntas</small></h2>
          <div class="faq-list">${t.preguntas.map(([q, a]) => `<details class="faq-item" data-texto="${esc(norm(`${q} ${plano(a)}`))}">
            <summary><span>${esc(q)}</span>${icon('chevron-down')}</summary><div class="faq-a">${htmlRespuesta(a)}</div></details>`).join('')}</div>
        </section>`).join('')}
        <p class="faq-vacio hidden" id="faq-vacio">${icon('search-x')} No encontramos preguntas con esa búsqueda. Prueba con otras palabras o consulta a un administrador.</p>
        <section class="faq-sec faq-instalar" id="faq-instalar" data-texto="${esc(norm('instalar aplicacion celular android iphone ipad computadora chrome safari edge pantalla de inicio'))}">
          <h2><span class="faq-sec-ico">${icon('download')}</span>Instalar la aplicación<small>Paso a paso</small></h2>
          <p class="faq-intro">Instalada, Metrología se abre desde su propio ícono, en pantalla completa y con avisos. No ocupa espacio como una app de tienda y se actualiza sola.</p>
          <div class="faq-tabs" role="tablist">${INSTALAR.map((p, i) => `<button role="tab" class="faq-tab ${i === 0 ? 'on' : ''}" data-plat="${p.id}" aria-selected="${i === 0}">${icon(p.ico)}<span><b>${esc(p.titulo)}</b><small>${esc(p.sub)}</small></span></button>`).join('')}</div>
          ${INSTALAR.map((p, i) => `<div class="faq-pasos ${i === 0 ? '' : 'hidden'}" data-pasos="${p.id}">${p.pasos.map(([tit, txt, dib], k) => `
            <article class="faq-paso"><div class="faq-ilus">${dib()}</div>
              <div class="faq-paso-txt"><span class="faq-num">${k + 1}</span><b>${esc(tit)}</b>${htmlRespuesta(txt)}</div></article>`).join('')}</div>`).join('')}
        </section>
        <section class="faq-ayuda">${icon('life-buoy')}<div><b>¿No encontraste tu respuesta?</b><span>Comunícate con un administrador de Metrología (Calidad de proceso). Si es un problema con un equipo, regístralo en las observaciones de la verificación.</span></div></section>
      </div>`;
    refreshIcons();
    const q = el.querySelector('#faq-q');
    q.addEventListener('input', () => filtrar(q.value));
    el.querySelectorAll('.faq-tab').forEach((b) => b.addEventListener('click', () => {
      el.querySelectorAll('.faq-tab').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', String(x === b)); });
      el.querySelectorAll('[data-pasos]').forEach((x) => x.classList.toggle('hidden', x.dataset.pasos !== b.dataset.plat));
    }));
    el.querySelectorAll('.faq-chip').forEach((a) => a.addEventListener('click', (e) => {
      e.preventDefault();
      el.querySelector(`#faq-${a.dataset.sec}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
    // Pestaña según el dispositivo actual
    const ua = navigator.userAgent;
    const plat = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ? 'ios' : /android/i.test(ua) ? 'android' : 'pc';
    el.querySelector(`.faq-tab[data-plat="${plat}"]`)?.click();
    el.querySelector('#faq-pdf').addEventListener('click', async (e) => {
      const b = e.currentTarget;
      b.disabled = true; b.innerHTML = `${icon('loader')} Generando…`; refreshIcons();
      try { await generarGuia(); } catch (err) { console.error(err); toast(errMsg(err), 'error'); }
      if (root) { b.disabled = false; b.innerHTML = `${icon('download')} Descargar guía`; refreshIcons(); }
    });
  },
  destroy() { root = null; },
};

function filtrar(texto) {
  const t = norm(texto.trim());
  let visibles = 0;
  root.querySelectorAll('.faq-sec').forEach((sec) => {
    if (sec.classList.contains('faq-instalar')) { const ok = !t || sec.dataset.texto.includes(t); sec.classList.toggle('hidden', !ok); visibles += ok; return; }
    let n = 0;
    sec.querySelectorAll('.faq-item').forEach((it) => {
      const ok = !t || it.dataset.texto.includes(t);
      it.classList.toggle('hidden', !ok);
      it.open = !!t && ok;
      n += ok;
    });
    sec.classList.toggle('hidden', !n);
    visibles += n;
  });
  root.querySelector('#faq-vacio').classList.toggle('hidden', visibles > 0);
}

// ---------------- Guía en PDF ----------------
async function svgAPng(svgTxt, escala = 3) {
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgTxt)}`;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = 240 * escala; c.height = 300 * escala;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}
async function imagenAPng(src) {
  if (!src) return null;
  const img = new Image(); img.src = src; await img.decode();
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  c.getContext('2d').drawImage(img, 0, 0);
  return c.toDataURL('image/png');
}

// Las fuentes estándar del PDF solo tienen Latin-1: se sustituyen los símbolos que no existen
const pdfTxt = (s) => s.replace(/→/g, '>').replace(/⋮/g, '(tres puntos)').replace(/⋯/g, '(...)').replace(/…/g, '...').replace(/[–—]/g, '-');
const RGB = { navy: [11, 30, 45], navy2: [29, 66, 96], orange: [245, 128, 32], orangeSoft: [255, 240, 226], turq: [15, 163, 166], turqSoft: [225, 246, 246], txt: [38, 50, 62], muted: [110, 125, 140], line: [218, 226, 233], bg: [246, 248, 250] };

async function generarGuia() {
  const jsPDF = await cargarJsPDF();
  const doc = new jsPDF({ unit: 'mm', format: 'letter', orientation: 'portrait' });
  const W = 215.9, H = 279.4, M = 20, CW = W - 2 * M;
  const icono = await imagenAPng(appIcon()).catch(() => null);
  const ilus = await Promise.all(INSTALAR.map((p) => Promise.all(p.pasos.map(([, , dib]) => svgAPng(dib())))));
  const hoy = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Mexico_City' });
  const color = (k, tipo = 'text') => { const c = RGB[k]; if (tipo === 'text') doc.setTextColor(...c); else if (tipo === 'fill') doc.setFillColor(...c); else doc.setDrawColor(...c); };
  const fuente = (estilo, size) => { doc.setFont('helvetica', estilo); doc.setFontSize(size); };

  // ---- Portada ----
  color('navy', 'fill'); doc.rect(0, 0, W, H, 'F');
  color('navy2', 'fill'); doc.circle(W + 10, -10, 95, 'F');
  color('orange', 'fill'); doc.rect(0, H - 14, W, 14, 'F'); doc.rect(M, 112, 34, 2.2, 'F');
  doc.addImage(LOGO, 'PNG', M, 26, 34, 27, 'logo', 'FAST');
  if (icono) doc.addImage(icono, 'PNG', W - M - 26, 27, 26, 26, 'icono', 'FAST');
  fuente('bold', 11); doc.setTextColor(255, 186, 120); doc.text('CALIDAD DE PROCESO', M, 96, { charSpace: 0.8 });
  fuente('bold', 34); doc.setTextColor(255, 255, 255); doc.text('Metrología', M, 108);
  fuente('bold', 20); doc.text('Guía de usuario', M, 128);
  fuente('normal', 12); doc.setTextColor(200, 214, 226);
  doc.text(doc.splitTextToSize('Preguntas frecuentes y tutorial ilustrado para instalar la aplicación en celular y computadora.', 120), M, 140);
  const resumen = [['Temas', String(TEMAS.length + 1)], ['Preguntas', String(totalPreguntas)], ['Plataformas', '3']];
  resumen.forEach(([k, v], i) => {
    const x = M + i * 44;
    doc.setDrawColor(60, 90, 115); doc.setLineWidth(0.3); doc.roundedRect(x, 168, 38, 24, 3, 3, 'S');
    fuente('bold', 18); doc.setTextColor(255, 255, 255); doc.text(v, x + 5, 181);
    fuente('normal', 8.5); doc.setTextColor(170, 190, 206); doc.text(k, x + 5, 188);
  });
  fuente('normal', 9); doc.setTextColor(170, 190, 206);
  doc.text([`Versión de la aplicación ${APP_VERSION}`, `Actualizada el ${hoy}`, URL_APP], M, 236);
  fuente('bold', 9); doc.setTextColor(255, 255, 255); doc.text("Pet's Table S.A. de C.V.", M, H - 5.5);
  fuente('normal', 9); doc.text('Uso interno', W - M, H - 5.5, { align: 'right' });

  // ---- Índice (se llena al final) ----
  doc.addPage(); const pagIndice = 2;
  const indice = [];

  // ---- Utilidades de página ----
  let y = 0;
  const nuevaPagina = () => { doc.addPage(); y = 30; };
  const espacio = (h) => { if (y + h > H - 22) nuevaPagina(); };
  const encabezadoSeccion = (titulo, sub) => {
    espacio(30);
    if (y > 40) y += 4;
    indice.push([titulo, doc.getNumberOfPages()]);
    color('orange', 'fill'); doc.roundedRect(M, y, 3, 13, 1, 1, 'F');
    fuente('bold', 17); color('navy'); doc.text(titulo, M + 7, y + 6.5);
    fuente('normal', 9); color('muted'); doc.text(sub, M + 7, y + 12.2);
    y += 20;
  };
  // Párrafo con **negritas** en línea
  const parrafo = (txt, x, ancho, size = 9.6, sangria = 0) => {
    fuente('normal', size);
    const piezas = pdfTxt(txt).split(/(\*\*.+?\*\*)/).filter(Boolean).flatMap((p) => {
      const b = p.startsWith('**'); return (b ? p.slice(2, -2) : p).split(/(\s+)/).filter((w) => w !== '').map((w) => ({ w, b }));
    });
    const lh = size * 0.47;
    let cx = x + sangria;
    const lineas = [[]];
    piezas.forEach((p) => {
      fuente(p.b ? 'bold' : 'normal', size);
      const w = doc.getTextWidth(p.w);
      if (cx + w > x + ancho && p.w.trim() && lineas[lineas.length - 1].length) { lineas.push([]); cx = x + sangria; }
      if (!lineas[lineas.length - 1].length && !p.w.trim()) return;
      lineas[lineas.length - 1].push({ ...p, x: cx }); cx += w;
    });
    lineas.forEach((l) => {
      espacio(lh + 1);
      l.forEach((p) => { fuente(p.b ? 'bold' : 'normal', size); color(p.b ? 'navy' : 'txt'); doc.text(p.w, p.x, y); });
      y += lh;
    });
  };
  const respuesta = (txt, x, ancho) => {
    txt.split('\n').forEach((l) => {
      if (l.startsWith('- ')) {
        espacio(6);
        color('orange', 'fill'); doc.circle(x + 1.6, y - 1.15, 0.85, 'F');
        parrafo(l.slice(2), x + 5, ancho - 5);
      } else parrafo(l, x, ancho);
      y += 1.6;
    });
  };

  // ---- Preguntas frecuentes ----
  nuevaPagina();
  let n = 0;
  TEMAS.forEach((t) => {
    encabezadoSeccion(t.titulo, `${t.preguntas.length} preguntas frecuentes`);
    t.preguntas.forEach(([q, a]) => {
      n++;
      fuente('bold', 10.8);
      const lq = doc.splitTextToSize(pdfTxt(q), CW - 12);
      espacio(lq.length * 5.2 + 14);
      color('orangeSoft', 'fill'); doc.roundedRect(M, y - 4.6, 9, 6.6, 1.4, 1.4, 'F');
      fuente('bold', 8); color('orange'); doc.text(String(n).padStart(2, '0'), M + 4.5, y - 0.15, { align: 'center' });
      fuente('bold', 10.8); color('navy'); doc.text(lq, M + 12, y);
      y += lq.length * 5.2 + 0.8;
      respuesta(a, M + 12, CW - 12);
      y += 2.5;
      color('line', 'draw'); doc.setLineWidth(0.2); doc.line(M + 12, y - 1.5, W - M, y - 1.5);
      y += 3.5;
    });
  });

  // ---- Tutorial de instalación ----
  INSTALAR.forEach((p, ip) => {
    nuevaPagina();
    encabezadoSeccion({ android: 'Instalar en celular Android', ios: 'Instalar en iPhone o iPad', pc: 'Instalar en computadora' }[p.id],
      `Paso a paso con ${p.sub} · se abre desde su propio ícono y con avisos`);
    const colW = (CW - 8) / 2, imgH = 66, imgW = imgH * 0.8;
    p.pasos.forEach(([tit, txt], k) => {
      const col = k % 2, fila = Math.floor(k / 2);
      const x = M + col * (colW + 8), y0 = y + fila * 104;
      color('bg', 'fill'); color('line', 'draw'); doc.setLineWidth(0.25); doc.roundedRect(x, y0, colW, 100, 3, 3, 'FD');
      doc.addImage(ilus[ip][k], 'PNG', x + (colW - imgW) / 2, y0 + 4, imgW, imgH, `ilus-${ip}-${k}`, 'FAST');
      color('orange', 'fill'); doc.circle(x + 8, y0 + imgH + 11, 4, 'F');
      fuente('bold', 9.5); doc.setTextColor(255, 255, 255); doc.text(String(k + 1), x + 8, y0 + imgH + 12.4, { align: 'center' });
      fuente('bold', 10.5); color('navy'); doc.text(pdfTxt(tit), x + 15, y0 + imgH + 12.4);
      const yy = y; y = y0 + imgH + 19;
      parrafo(txt, x + 5, colW - 10, 8.6);
      y = yy;
    });
  });

  // ---- Índice ----
  doc.setPage(pagIndice);
  y = 30;
  fuente('bold', 22); color('navy'); doc.text('Contenido', M, y + 4);
  color('orange', 'fill'); doc.rect(M, y + 8, 22, 1.6, 'F');
  y += 22;
  indice.forEach(([titulo, pag], i) => {
    color(i % 2 ? 'bg' : 'turqSoft', 'fill'); doc.roundedRect(M, y - 5.5, CW, 10, 2, 2, 'F');
    fuente('bold', 10.5); color('navy'); doc.text(`${String(i + 1).padStart(2, '0')}   ${titulo}`, M + 4, y + 1);
    fuente('bold', 10.5); color('orange'); doc.text(String(pag), W - M - 4, y + 1, { align: 'right' });
    y += 12.5;
  });
  y += 6;
  color('orangeSoft', 'fill'); doc.roundedRect(M, y, CW, 30, 3, 3, 'F');
  y += 8; fuente('bold', 10.5); color('navy'); doc.text('Cómo usar esta guía', M + 6, y); y += 6;
  parrafo('Consulta el tema que necesites en el índice. Las preguntas están numeradas para ubicarlas rápido y las palabras en **negritas** corresponden a botones o secciones de la aplicación. También puedes consultar estas respuestas en la aplicación, en **Preguntas frecuentes**.', M + 6, CW - 12, 9.2);

  // ---- Encabezado y pie en cada página (excepto la portada) ----
  const total = doc.getNumberOfPages();
  for (let i = 2; i <= total; i++) {
    doc.setPage(i);
    color('navy', 'fill'); doc.rect(0, 0, W, 12, 'F');
    color('orange', 'fill'); doc.rect(0, 12, W, 0.9, 'F');
    doc.addImage(LOGO, 'PNG', M, 2.4, 9, 7.2, 'logo', 'FAST');
    fuente('bold', 9); doc.setTextColor(255, 255, 255); doc.text('Metrología · Guía de usuario', M + 12, 7.8);
    fuente('normal', 8); doc.setTextColor(170, 190, 206); doc.text('Calidad de proceso', W - M, 7.8, { align: 'right' });
    color('line', 'draw'); doc.setLineWidth(0.2); doc.line(M, H - 14, W - M, H - 14);
    fuente('normal', 8); color('muted'); doc.text(`Pet's Table S.A. de C.V. · Versión ${APP_VERSION}`, M, H - 9);
    doc.text(`Página ${i} de ${total}`, W - M, H - 9, { align: 'right' });
  }
  doc.setProperties({ title: 'Metrología · Guía de usuario', subject: 'Preguntas frecuentes e instalación', author: "Pet's Table S.A. de C.V.", creator: 'Metrología' });
  doc.save(`Guia-Metrologia-v${APP_VERSION}.pdf`);
  toast('Guía descargada.', 'success');
}
