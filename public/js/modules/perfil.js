// =====================================================================
// Mi perfil: identidad, fotografía propia, contraseña, apariencia e
// instalación de la app (mismo esquema que Servicio Médico).
// =====================================================================
import {
  sb, state, esc, icon, refreshIcons, toast, checkForm, must, avatarHTML, fotoDe, fmtDateTime, prefs, APP_VERSION,
  prepararFoto, subirFotoPropia, ganchos, errMsg, push, openModal, confirmDialog, fmtDate, todayISO, pill, emoji,
} from '../core.js';

// Créditos de la plataforma
const AUTOR = { nombre: 'Javier Martínez González', correo: 'javier.martinez@petstable.mx' };
// Mosaico de información con ilustración (v8.2)
const fila = (ilus, label, valor) => `<div class="pf-t"><span class="pf-ico">${emoji(ilus)}</span><div><small>${esc(label)}</small><b>${esc(valor || '—')}</b></div></div>`;

let root;
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; });
const instalada = () => window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || window.navigator.standalone === true;

export default {
  async render(el) {
    root = el;
    pintar();
  },
  destroy() { root = null; },
};

function pintar() {
  if (!root) return;
  const p = state.profile, u = state.session?.user;
  const admin = state.isAdmin;
  const theme = prefs.get('calbas.theme') || 'system';
  root.innerHTML = `
    <section class="page-intro"><div><span class="eyebrow">Cuenta</span><h1>Mi perfil</h1><p>Tus datos de acceso y preferencias.</p></div></section>
    <div class="pf">
      <section class="pf-id">
        <div class="pf-foto">${avatarHTML(p.nombre_completo_calbas, fotoDe(p.correo_calbas, p.avatar_url_calbas), 'xl')}</div>
        <span class="pf-rol ${admin ? 'admin' : ''}">${icon(admin ? 'crown' : 'user-round')} ${admin ? 'Administrador' : 'Usuario'}</span>
        <h2>${esc(p.nombre_completo_calbas)}</h2>
        <p class="pf-puesto">${esc(p.puesto_calbas || 'Puesto no registrado')}</p>
        <span class="pf-mail">${icon('mail')} ${esc(p.correo_calbas)}</span>
        ${admin ? `<label class="btn pf-cambiar" for="pf-foto">${icon('camera')} Cambiar fotografía</label>
        <input id="pf-foto" type="file" accept="image/jpeg,image/png,image/webp" class="sr-only">` : ''}
      </section>
      <div class="pf-info">
        <section class="pf-bloque"><h3 class="pf-sec">${icon('briefcase')} Información laboral</h3>
          <div class="pf-tiles t2">${fila('gafete', 'Puesto', p.puesto_calbas || 'Sin puesto registrado')}${fila('n_equipos', 'Departamento', p.departamento_calbas || 'Sin departamento')}</div></section>
        <section class="pf-bloque"><h3 class="pf-sec">${icon('shield-check')} Acceso</h3>
          <div class="pf-tiles t2">${fila('llave', 'Permisos', admin ? 'Gestión completa de equipos, calibraciones y usuarios' : 'Verificar y consultar los equipos de su departamento')}${fila('reloj', 'Último acceso', fmtDateTime(u?.last_sign_in_at))}</div></section>
        <section class="pf-bloque" id="avisos-card"><h3 class="pf-sec">${icon('bell')} Avisos en este dispositivo</h3>
          <div id="avisos-estado" class="avisos">${icon('loader')} Revisando…</div>
          ${admin ? `<div class="pf-festivos"><span class="pf-ico">${emoji('festivos')}</span><div><b>Días festivos</b><small>Esos días, igual que sábados y domingos, no se envían recordatorios.</small></div>
            <button type="button" class="btn secondary sm" id="festivos-btn">${icon('calendar-x')} Administrar</button></div>` : ''}</section>
        <section class="pf-sistema"><span class="brand-logo pf-logo" aria-hidden="true"></span>
          <div><small>Metrología</small><b>Verificación y calibración de equipos <i aria-hidden="true">|</i> <span>Pet's Table</span></b></div>
          <span class="pf-ver"><small>Versión</small><b>${esc(APP_VERSION)}</b></span></section>
      </div>
    </div>
    <div class="grid grid-2 mt">
      <div class="card">
        <div class="card-head"><div><h3>Cambiar contraseña</h3><p>Aplica a todas las aplicaciones de Pet's Table que usan esta cuenta.</p></div></div>
        <form id="pw-form" novalidate>
          <div class="field"><label for="pw1">Nueva contraseña <span class="req">*</span></label>
            <div class="pw-wrap"><input id="pw1" name="p1" type="password" autocomplete="new-password" minlength="8" maxlength="128" required>
            <button type="button" class="pw-toggle" data-action="toggle-pw" aria-label="Mostrar contraseña">${icon('eye')}</button></div></div>
          <div class="field"><label for="pw2">Confirmar contraseña <span class="req">*</span></label>
            <input id="pw2" name="p2" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></div>
          <p class="hint">Mínimo 8 caracteres. Combina mayúsculas, minúsculas, números y símbolos.</p>
          <button type="submit" class="btn violet">${icon('key-round')} Actualizar contraseña</button>
        </form>
      </div>
      <div class="card">
        <div class="card-head"><div><h3>Apariencia</h3><p>Se guarda en este dispositivo.</p></div></div>
        <div class="seg" role="radiogroup" aria-label="Tema">
          <button data-theme-opt="light" class="${theme === 'light' ? 'active' : ''}">${icon('sun')} Claro</button>
          <button data-theme-opt="dark" class="${theme === 'dark' ? 'active' : ''}">${icon('moon')} Oscuro</button>
          <button data-theme-opt="system" class="${theme === 'system' ? 'active' : ''}">${icon('monitor-smartphone')} Sistema</button>
        </div>
        <div class="section-title" style="margin-top:22px">${icon('smartphone')} Instalar en la pantalla de inicio</div>
        ${instalada() ? `<p class="hint">${icon('check-circle-2')} Ya estás usando la aplicación instalada.</p>` : `
        <button class="btn teal ${deferredPrompt ? '' : 'hidden'}" id="install-btn">${icon('download')} Instalar aplicación</button>
        <p class="hint" style="margin:10px 0 6px"><b>iPhone / iPad (Safari):</b></p>
        <ol class="steps"><li>Toca el botón <b>Compartir</b>.</li><li>Elige <b>Agregar a pantalla de inicio</b>.</li><li>Confirma el nombre “Metrología” y toca <b>Agregar</b>.</li></ol>
        <p class="hint" style="margin:10px 0 6px"><b>Android (Chrome):</b></p>
        <ol class="steps"><li>Abre el menú <b>⋮</b>.</li><li>Elige <b>Instalar aplicación</b> o <b>Agregar a pantalla principal</b>.</li></ol>`}
        <p class="hint mt">Para cambiar tu puesto, rol o departamento, solicítalo a un administrador.</p>
      </div>
    </div>
    <section class="cr mt" aria-labelledby="cr-t">
      <div class="cr-foto">${avatarHTML(AUTOR.nombre, fotoDe(AUTOR.correo, p.correo_calbas === AUTOR.correo ? p.avatar_url_calbas : null), 'xl')}</div>
      <div class="cr-cuerpo">
        <span class="cr-eyebrow">${icon('sparkles')} Desarrollado por</span>
        <h3 id="cr-t">${esc(AUTOR.nombre)}</h3>
        <p class="cr-rol">Creador y desarrollador de la plataforma</p>
        <p class="cr-txt">Concibió, diseñó, desarrolló e implementó Metrología: las verificaciones internas y calibraciones externas, la base de datos y sus permisos, las etiquetas, los avisos y la experiencia en escritorio y móvil.</p>
        <ul class="cr-etapas" aria-label="Participación"><li>Conceptualización</li><li>Diseño</li><li>Desarrollo</li><li>Implementación</li></ul>
      </div>
      <figure class="cr-firma"><span class="cr-firma-img" role="img" aria-label="Firma de ${esc(AUTOR.nombre)}"></span>
        <figcaption><b>${esc(AUTOR.nombre)}</b><small>Autor de la plataforma</small></figcaption></figure>
    </section>`;
  refreshIcons();
  pintarAvisos();

  root.querySelectorAll('[data-theme-opt]').forEach((b) => b.addEventListener('click', () => {
    window.__calbasSetTheme?.(b.dataset.themeOpt);
    root.querySelectorAll('[data-theme-opt]').forEach((x) => x.classList.toggle('active', x === b));
  }));
  root.querySelector('#install-btn')?.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice.catch(() => null);
    deferredPrompt = null;
    root?.querySelector('#install-btn')?.classList.add('hidden');
  });
  root.querySelector('#festivos-btn')?.addEventListener('click', dialogoFestivos);
  root.querySelector('#pf-foto')?.addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const blob = await prepararFoto(f);
      const url = await subirFotoPropia(blob);
      must(await sb.from('perfiles_calbas').update({ avatar_url_calbas: url }).eq('id_calbas', state.session.user.id));
      await ganchos.recargarPerfil?.();
      toast('Fotografía actualizada.', 'success');
      pintar();
    } catch (err) { toast(errMsg(err), 'error'); }
  });
  root.querySelector('#pw-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    if (!checkForm(form, { p2: (v, f) => (v !== f.p1.value ? 'Las contraseñas no coinciden.' : '') })) return;
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    const { error } = await sb.auth.updateUser({ password: form.p1.value });
    btn.disabled = false;
    if (error) { toast(errMsg(error), 'error'); return; }
    form.reset();
    toast('Contraseña actualizada.', 'success');
  });
}

// Días festivos (administradores): sin recordatorios esos días. Los oficiales
// (LFT art. 74) los calcula la base de datos; aquí se agregan los de la empresa.
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
async function dialogoFestivos() {
  let anio = Number(todayISO().slice(0, 4));
  await openModal({
    title: 'Días festivos', subtitle: 'Esos días, igual que sábados y domingos, no se envían recordatorios.', size: 'md',
    body: `<div class="fest-anio"><button type="button" class="icon-btn" data-anio="-1" aria-label="Año anterior">${icon('chevron-left')}</button>
        <b id="fest-anio"></b><button type="button" class="icon-btn" data-anio="1" aria-label="Año siguiente">${icon('chevron-right')}</button></div>
      <ul class="fest-lista" id="fest-lista"></ul>
      <div class="section-title" style="margin-top:16px">${icon('calendar-plus')} Agregar día de la empresa</div>
      <div class="fest-nuevo">
        <div class="field"><label for="fest-fecha">Fecha</label><input id="fest-fecha" type="date"></div>
        <div class="field"><label for="fest-motivo">Motivo</label><input id="fest-motivo" type="text" maxlength="80" placeholder="Ej. Viernes Santo"></div>
        <button type="button" class="btn navy" id="fest-agregar">${icon('plus')} Agregar</button>
      </div>`,
    onOpen: ({ form }) => {
      const lista = form.querySelector('#fest-lista');
      const cargar = async () => {
        form.querySelector('#fest-anio').textContent = anio;
        lista.innerHTML = `<li class="hint">${icon('loader')} Cargando…</li>`; refreshIcons();
        const { data, error } = await sb.rpc('calbas_dias_festivos', { anio });
        if (error) { lista.innerHTML = `<li class="hint">${esc(errMsg(error))}</li>`; return; }
        const { data: propios } = await sb.from('dias_festivos_calbas').select('id_calbas, fecha_calbas')
          .gte('fecha_calbas', `${anio}-01-01`).lte('fecha_calbas', `${anio}-12-31`);
        const ids = Object.fromEntries((propios || []).map((p) => [p.fecha_calbas, p.id_calbas]));
        lista.innerHTML = (data || []).map((d) => `<li>
            <span class="fest-fecha">${fmtDate(d.fecha)}<small>${DIAS[new Date(`${d.fecha}T12:00:00Z`).getUTCDay()]}</small></span>
            <span class="fest-motivo">${esc(d.motivo)}</span>
            ${d.oficial ? pill('Oficial', 'gray') : `${pill('Empresa', 'info')}<button type="button" class="icon-btn" data-borrar="${ids[d.fecha] || ''}" data-motivo="${esc(d.motivo)}" title="Quitar" aria-label="Quitar">${icon('trash-2')}</button>`}
          </li>`).join('') || `<li class="hint">Sin días festivos.</li>`;
        refreshIcons();
      };
      form.querySelectorAll('[data-anio]').forEach((b) => b.addEventListener('click', () => { anio += Number(b.dataset.anio); cargar(); }));
      lista.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-borrar]');
        if (!b?.dataset.borrar) return;
        if (!await confirmDialog({ title: 'Quitar día festivo', message: `¿Quitar «${b.dataset.motivo}»? Ese día sí se enviarán recordatorios.`, confirmText: 'Quitar', danger: true })) return;
        try { must(await sb.from('dias_festivos_calbas').delete().eq('id_calbas', b.dataset.borrar)); toast('Día festivo quitado.', 'success'); cargar(); }
        catch (err) { toast(errMsg(err), 'error'); }
      });
      form.querySelector('#fest-agregar').addEventListener('click', async () => {
        const fecha = form.querySelector('#fest-fecha').value, motivo = form.querySelector('#fest-motivo').value.trim();
        if (!fecha || motivo.length < 2) { toast('Indica la fecha y el motivo.', 'warning'); return; }
        try {
          must(await sb.from('dias_festivos_calbas').insert({ fecha_calbas: fecha, motivo_calbas: motivo }));
          toast('Día festivo agregado.', 'success');
          form.querySelector('#fest-fecha').value = ''; form.querySelector('#fest-motivo').value = '';
          anio = Number(fecha.slice(0, 4)); cargar();
        } catch (err) { toast(/duplicate|unique/i.test(err?.message || '') ? 'Esa fecha ya está registrada.' : errMsg(err), 'error'); }
      });
      cargar();
    },
  });
}

// Estado de los avisos push de este dispositivo
async function pintarAvisos() {
  const box = root?.querySelector('#avisos-estado');
  if (!box) return;
  const est = await push.estado();
  if (!root?.contains(box)) return;
  const horario = state.isAdmin
    ? 'Cada mañana de lunes a viernes (8:00, excepto días festivos) te avisamos de las calibraciones por vencer o vencidas y de las verificaciones con 3 días o más de atraso. También recibes al momento cada «no cumple».'
    : 'Cada mañana de lunes a viernes (8:00, excepto días festivos) te avisamos de los equipos que te toca verificar y de los que ya están atrasados.';
  // [ilustración, estado visual (on · off · pend · info), título, texto]
  const msg = {
    activo: ['n_avisos', 'on', 'Avisos activados', horario],
    inactivo: ['n_avisos', 'pend', 'Avisos desactivados', `Actívalos para recibir los recordatorios. ${horario}`],
    bloqueado: ['n_alerta', 'off', 'Bloqueados por el navegador', 'Permite las notificaciones de este sitio en la configuración del navegador y vuelve a intentarlo.'],
    instalar: ['celular', 'info', 'Instala la app primero', 'En iPhone y iPad, toca Compartir → Agregar a pantalla de inicio y abre Metrología desde el ícono (iOS 16.4 o posterior).'],
    'no-soportado': ['n_alerta', 'off', 'Sin notificaciones', 'Este navegador no admite notificaciones.'],
  }[est];
  box.className = `avisos ${msg[1]}`;
  box.innerHTML = `<span class="avisos-ico">${emoji(msg[0])}</span><div class="avisos-txt"><b>${esc(msg[2])}</b><p>${esc(msg[3])}</p></div>
    <div class="avisos-acc">
    ${est === 'inactivo' ? `<button type="button" class="btn navy" data-av="on">${icon('bell-ring')} Activar avisos</button>` : ''}
    ${est === 'activo' ? `<button type="button" class="btn teal" data-av="test">${icon('send')} Enviar aviso de prueba</button>
      <button type="button" class="btn secondary" data-av="off">${icon('bell-off')} Desactivar</button>` : ''}</div>`;
  refreshIcons();
  box.querySelectorAll('[data-av]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    try {
      if (b.dataset.av === 'on') { await push.activar(); toast('Avisos activados en este dispositivo.', 'success'); }
      if (b.dataset.av === 'off') { await push.desactivar(); toast('Avisos desactivados en este dispositivo.', 'success'); }
      if (b.dataset.av === 'test') {
        const { data, error } = await sb.functions.invoke('recordatorios_calbas', { body: { accion: 'prueba' } });
        if (error) throw error;
        toast(data?.push ? 'Aviso de prueba enviado. Debe llegar en unos segundos.' : 'No se encontró este dispositivo; desactiva y vuelve a activar los avisos.', data?.push ? 'success' : 'warning');
      }
    } catch (err) { toast(errMsg(err), 'error'); }
    pintarAvisos();
  }));
}
