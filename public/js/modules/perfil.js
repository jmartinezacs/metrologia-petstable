// =====================================================================
// Mi perfil: identidad, fotografía propia, contraseña, apariencia e
// instalación de la app (mismo esquema que Servicio Médico).
// =====================================================================
import {
  sb, state, esc, icon, refreshIcons, toast, checkForm, must, avatarHTML, fotoDe, fmtDateTime, prefs, APP_VERSION,
  prepararFoto, subirFotoPropia, ganchos, errMsg, push,
} from '../core.js';

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
  const tile = (ic, k, v) => `<div class="p-tile"><span class="ti">${icon(ic)}</span><small>${esc(k)}</small><b>${esc(v || '—')}</b></div>`;
  root.innerHTML = `
    <section class="page-intro"><div><span class="eyebrow">Cuenta</span><h1>Mi perfil</h1><p>Tus datos de acceso y preferencias.</p></div></section>
    <section class="profile-hero">
      <div class="access-photo">${avatarHTML(p.nombre_completo_calbas, fotoDe(p.correo_calbas, p.avatar_url_calbas), 'xl')}<span class="access-check">${icon('badge-check')}</span>
        ${admin ? `<label for="pf-foto" class="photo-edit" title="Cambiar fotografía" aria-label="Cambiar fotografía">${icon('camera')}</label>
        <input id="pf-foto" type="file" accept="image/jpeg,image/png,image/webp" class="sr-only">` : ''}</div>
      <div>
        <span class="access-badge">${icon(admin ? 'crown' : 'user')} ${admin ? 'Administrador' : 'Usuario'}</span>
        <h2>${esc(p.nombre_completo_calbas)}</h2>
        <p class="puesto">${esc(p.puesto_calbas || 'Puesto no registrado')}</p>
        <span class="mail">${icon('mail')} ${esc(p.correo_calbas)}</span>
      </div>
    </section>
    <div class="profile-tiles mt">
      ${tile('briefcase', 'Puesto', p.puesto_calbas || 'Sin puesto registrado')}
      ${tile('building-2', 'Departamento', p.departamento_calbas || 'Sin departamento')}
      ${tile('shield-check', 'Permisos', admin ? 'Gestión completa de equipos, calibraciones y usuarios' : 'Verificar y consultar los equipos de su departamento')}
      ${tile('clock', 'Último acceso', fmtDateTime(u?.last_sign_in_at))}
      ${tile('mail', 'Correo', p.correo_calbas)}
      ${tile('info', 'Versión del sistema', APP_VERSION)}
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
    <div class="card mt" id="avisos-card">
      <div class="card-head"><div><h3>${icon('bell-ring')} Avisos en este dispositivo</h3>
        <p>${admin ? 'Cada mañana (lunes a sábado, 8:00) te avisamos de las calibraciones por vencer o vencidas y de las verificaciones con 3 días o más de atraso. También recibes al momento cada «no cumple».'
          : 'Cada mañana (lunes a sábado, 8:00) te avisamos de los equipos que te toca verificar y de los que ya están atrasados.'}</p></div></div>
      <div id="avisos-estado" class="avisos-estado">${icon('loader')} Revisando…</div>
    </div>`;
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

// Estado de los avisos push de este dispositivo
async function pintarAvisos() {
  const box = root?.querySelector('#avisos-estado');
  if (!box) return;
  const est = await push.estado();
  const msg = {
    activo: [`${icon('bell-ring')} <b>Activados</b> en este dispositivo.`, 'ok'],
    inactivo: [`${icon('bell-off')} <b>Desactivados.</b> Actívalos para recibir los recordatorios.`, 'warn'],
    bloqueado: [`${icon('bell-off')} <b>Bloqueados por el navegador.</b> Permite las notificaciones de este sitio en la configuración del navegador y vuelve a intentarlo.`, 'bad'],
    instalar: [`${icon('smartphone')} En iPhone y iPad primero <b>instala la app</b> (Compartir → Agregar a pantalla de inicio) y ábrela desde el ícono.`, 'warn'],
    'no-soportado': [`${icon('circle-alert')} Este navegador no admite notificaciones.`, 'bad'],
  }[est];
  box.className = `avisos-estado ${msg[1]}`;
  box.innerHTML = `<span>${msg[0]}</span><div class="btns">
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
