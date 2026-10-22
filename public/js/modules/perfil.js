// =====================================================================
// Mi perfil: identidad, departamento, fotografía propia y contraseña.
// =====================================================================
import {
  sb, state, esc, icon, refreshIcons, toast, openModal, checkForm, must, avatarHTML, fotoDe, pill, fmtDateTime,
  prepararFoto, subirFotoPropia, ganchos, errMsg,
} from '../core.js';

let root;

export default {
  async render(el) {
    root = el;
    pintar();
    el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-p]');
      if (!b) return;
      if (b.dataset.p === 'pw') await cambiarPw();
    });
    el.addEventListener('change', async (e) => {
      if (e.target.id !== 'pf-foto') return;
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
  },
  destroy() { root = null; },
};

function pintar() {
  if (!root) return;
  const p = state.profile, u = state.session?.user;
  const dato = (ic, k, v) => `<div class="p-tile">${icon(ic)}<div><small>${esc(k)}</small><b>${esc(v || '—')}</b></div></div>`;
  root.innerHTML = `
    <section class="page-intro"><div><span class="eyebrow">Cuenta</span><h1>Mi perfil</h1><p>Tus datos de acceso a Metrología.</p></div></section>
    <div class="card profile-card">
      <div class="profile-hero">
        ${avatarHTML(p.nombre_completo_calbas, fotoDe(p.correo_calbas, p.avatar_url_calbas), 'xl')}
        <div><h2>${esc(p.nombre_completo_calbas)}</h2><p>${esc(p.puesto_calbas || 'Puesto no registrado')}</p>
          <div class="page-actions">${pill(state.isAdmin ? 'Administrador' : 'Usuario', state.isAdmin ? 'warn' : 'gray')} ${pill(p.activo_calbas ? 'Activo' : 'Inactivo', p.activo_calbas ? 'ok' : 'bad')}</div></div>
      </div>
      <div class="profile-tiles mt">
        ${dato('mail', 'Correo', p.correo_calbas)}
        ${dato('building-2', 'Departamento', p.departamento_calbas)}
        ${dato('briefcase', 'Puesto', p.puesto_calbas)}
        ${dato('clock', 'Último acceso', fmtDateTime(u?.last_sign_in_at))}
      </div>
      <div class="page-actions mt">
        <label for="pf-foto" class="btn teal">${icon('camera')} Cambiar fotografía</label><input id="pf-foto" type="file" accept="image/jpeg,image/png,image/webp" class="sr-only">
        <button class="btn violet" data-p="pw">${icon('key-round')} Cambiar contraseña</button>
      </div>
      <p class="hint mt">Tu contraseña es la misma de tu cuenta Pet's Table en las demás aplicaciones. Para cambiar tu puesto, rol o departamento, solicítalo a un administrador.</p>
    </div>`;
  refreshIcons();
}

async function cambiarPw() {
  await openModal({
    title: 'Cambiar contraseña', size: 'sm', submitText: 'Guardar contraseña',
    body: `<div class="field"><label for="np1">Nueva contraseña <span class="req">*</span></label><input id="np1" name="p1" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></div>
      <div class="field"><label for="np2">Confirmar contraseña <span class="req">*</span></label><input id="np2" name="p2" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></div>`,
    onSubmit: async ({ form }) => {
      if (!checkForm(form, { p2: (v, f) => (v !== f.p1.value ? 'Las contraseñas no coinciden.' : '') })) return false;
      const { error } = await sb.auth.updateUser({ password: form.p1.value });
      if (error) throw error;
      toast('Contraseña actualizada.', 'success');
    },
  });
}
