// =====================================================================
// Usuarios: directorio para todos; altas y cambios solo administradores
// mediante la Edge Function gestionar_usuarios_calbas_admin (crea la cuenta
// en Auth, el perfil, el departamento y la fotografía).
// =====================================================================
import {
  sb, state, esc, icon, refreshIcons, toast, openModal, checkForm, must, pill, avatarHTML, fotoDe, getDepartamentos,
  prepararFoto, blobABase64, emptyState, sanitizeSearch, debounce,
} from '../core.js';

const PUESTOS = [
  'Auxiliar de Seguridad', 'Capturista de almacén', 'Coordinador de almacén de materia prima', 'Coordinador de logística',
  'Director de operaciones', 'Fundador', 'CEO', 'Gerente de logística', 'Gerente de producción', 'Gerente de procesos y mejora continua',
  'Ingeniero de procesos y mejora continua', 'Inspector de calidad', 'Jefe de calidad', 'Supervisor de logística',
  'Supervisor de producción', 'Supervisor de seguridad, salud y ambiente',
];
let root, rows = [];

export default {
  async render(el) {
    root = el;
    el.innerHTML = `
      <section class="page-intro">
        <div><span class="eyebrow">Accesos</span><h1>Usuarios</h1>
          <p>${state.isAdmin ? 'Administra cuentas, fotografías, roles, departamentos y acceso al sistema.' : 'Directorio de personas autorizadas para utilizar el sistema.'}</p></div>
        <div class="page-actions">${state.isAdmin ? `<button class="btn primary" data-u="nuevo">${icon('user-plus')} Agregar usuario</button>` : ''}</div>
      </section>
      <div class="card">
        <div class="toolbar"><div class="search">${icon('search')}<input type="search" id="u-q" placeholder="Buscar nombre, correo, departamento o puesto" aria-label="Buscar"></div>
          <span class="total-badge" id="u-total"></span></div>
        <div id="u-list"></div>
      </div>`;
    el.querySelector('#u-q').addEventListener('input', debounce(pintar, 200));
    el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-u]');
      if (!b) return;
      if (b.dataset.u === 'nuevo' && await formUsuario()) await load();
      if (b.dataset.u === 'editar' && await formUsuario(rows.find((r) => r.id_calbas === b.dataset.id))) await load();
    });
    await load();
  },
  destroy() { root = null; },
};

async function load() {
  const { data } = must(await sb.from('vw_usuarios_calbas').select('*').order('nombre_completo_calbas'));
  rows = data;
  if (root) pintar();
}

function pintar() {
  const q = sanitizeSearch(root.querySelector('#u-q').value).toLowerCase();
  const list = rows.filter((x) => !q || [x.nombre_completo_calbas, x.correo_calbas, x.departamento_calbas, x.puesto_calbas].some((v) => String(v || '').toLowerCase().includes(q)));
  root.querySelector('#u-total').innerHTML = `<b>${rows.filter((x) => x.activo_calbas).length}</b> activos · ${rows.length} perfiles`;
  root.querySelector('#u-list').innerHTML = list.length ? `<div class="table-wrap responsive"><table class="table"><thead><tr><th>Usuario</th><th>Rol</th><th>Departamento</th><th>Puesto</th><th>Estatus</th>${state.isAdmin ? '<th></th>' : ''}</tr></thead><tbody>
    ${list.map((x) => `<tr>
      <td data-label="Usuario"><div class="user-cell">${avatarHTML(x.nombre_completo_calbas, fotoDe(x.correo_calbas, x.avatar_url_calbas))}<div class="user-txt"><b>${esc(x.nombre_completo_calbas)}</b><span>${esc(x.correo_calbas)}</span></div></div></td>
      <td data-label="Rol">${x.rol_calbas === 'admin' ? pill('Administrador', 'warn') : pill('Usuario', 'gray')}</td>
      <td data-label="Departamento">${esc(x.departamento_calbas || '—')}</td><td data-label="Puesto">${esc(x.puesto_calbas || '—')}</td>
      <td data-label="Estatus">${x.activo_calbas ? pill('Activo', 'ok') : pill('Inactivo', 'bad')}</td>
      ${state.isAdmin ? `<td class="actions"><button class="icon-btn" data-u="editar" data-id="${x.id_calbas}" title="Editar" aria-label="Editar">${icon('pencil')}</button></td>` : ''}</tr>`).join('')}
    </tbody></table></div>` : emptyState({ ico: 'search-x', title: 'Sin resultados', text: 'No hay usuarios que coincidan con la búsqueda.' });
  refreshIcons();
}

async function formUsuario(u = null) {
  const deptos = (await getDepartamentos({ force: true })).filter((d) => d.activo_calbas);
  const depSel = deptos.find((d) => d.nombre_calbas.toLowerCase() === String(u?.departamento_calbas || '').toLowerCase())?.id_calbas || '';
  const puesto = String(u?.puesto_calbas || '').trim();
  const estandar = !puesto || PUESTOS.includes(puesto);
  let foto = null;
  return openModal({
    title: u ? 'Editar usuario' : 'Agregar usuario', subtitle: 'Los cambios se guardan en la cuenta Pet\'s Table, el perfil y la fotografía.', size: 'lg',
    body: `<div class="form-grid">
      <div class="field full photo-pick"><span id="u-prev">${avatarHTML(u?.nombre_completo_calbas || '?', u ? fotoDe(u.correo_calbas, u.avatar_url_calbas) : '', 'xl')}</span>
        <div><label for="u-foto" class="btn secondary sm">${icon('camera')} ${u ? 'Cambiar fotografía' : 'Agregar fotografía'}</label><input id="u-foto" type="file" accept="image/jpeg,image/png,image/webp" class="sr-only"><small class="hint">JPG, PNG o WEBP · máx. 5 MB</small></div></div>
      <div class="field full"><label for="u-nombre">Nombre completo <span class="req">*</span></label><input id="u-nombre" name="nombre" required maxlength="140" value="${esc(u?.nombre_completo_calbas || '')}"></div>
      <div class="field"><label for="u-email">Correo corporativo <span class="req">*</span></label><input id="u-email" name="email" type="email" required maxlength="120" value="${esc(u?.correo_calbas || '')}" autocomplete="off" placeholder="nombre@petstable.mx"></div>
      <div class="field"><label for="u-dep">Departamento <span class="req">*</span></label><select id="u-dep" name="departamento" required><option value="">Selecciona…</option>${deptos.map((d) => `<option value="${d.id_calbas}" ${d.id_calbas === depSel ? 'selected' : ''}>${esc(d.nombre_calbas)}</option>`).join('')}</select></div>
      <div class="field"><label for="u-puesto">Puesto</label><select id="u-puesto" name="puesto_sel"><option value="">Selecciona…</option>${PUESTOS.map((p) => `<option ${p === puesto ? 'selected' : ''}>${esc(p)}</option>`).join('')}<option value="__otro" ${estandar ? '' : 'selected'}>Otro…</option></select></div>
      <div class="field ${estandar ? 'hidden' : ''}" id="u-otro-f"><label for="u-otro">Especifica el puesto</label><input id="u-otro" name="puesto_otro" maxlength="140" value="${esc(estandar ? '' : puesto)}"></div>
      <div class="field"><label for="u-rol">Rol de acceso</label><select id="u-rol" name="rol"><option value="usuario">Usuario</option><option value="admin" ${u?.rol_calbas === 'admin' ? 'selected' : ''}>Administrador</option></select></div>
      <div class="field"><label for="u-pw">${u ? 'Nueva contraseña (opcional)' : 'Contraseña inicial'} ${u ? '' : '<span class="req">*</span>'}</label><input id="u-pw" name="password" type="password" minlength="8" maxlength="128" autocomplete="new-password" ${u ? '' : 'required'} placeholder="Mínimo 8 caracteres"></div>
      <label class="switch-row full"><input type="checkbox" name="activo" ${u?.activo_calbas === false ? '' : 'checked'}> <span><b>Usuario activo</b><small>Los usuarios inactivos no pueden iniciar sesión en Metrología.</small></span></label>
      <p class="hint full">Un usuario solo ve y verifica los equipos de su departamento. Los administradores ven todo.</p></div>`,
    onOpen: ({ form }) => {
      const sel = form.querySelector('#u-puesto');
      sel.addEventListener('change', () => form.querySelector('#u-otro-f').classList.toggle('hidden', sel.value !== '__otro'));
      form.querySelector('#u-foto').addEventListener('change', async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        try { foto = await prepararFoto(f); form.querySelector('#u-prev').innerHTML = `<span class="avatar has-img xl"><img src="${URL.createObjectURL(foto)}" alt=""></span>`; }
        catch (err) { toast(err.message, 'error'); }
      });
    },
    onSubmit: async ({ form }) => {
      if (!checkForm(form, { email: (v) => (/@petstable\.mx$/i.test(v) ? '' : 'Usa un correo @petstable.mx.') })) return false;
      const f = form.elements;
      const payload = {
        action: u ? 'update' : 'create', user_id: u?.id_calbas, nombre: f.nombre.value.trim(), email: f.email.value.trim().toLowerCase(),
        departamento_id: f.departamento.value, puesto: f.puesto_sel.value === '__otro' ? f.puesto_otro.value.trim() : f.puesto_sel.value,
        rol: f.rol.value, password: f.password.value, activo: f.activo.checked,
      };
      if (foto) { payload.avatar_base64 = await blobABase64(foto); payload.avatar_mime = 'image/jpeg'; }
      const { data, error } = await sb.functions.invoke('gestionar_usuarios_calbas_admin', { body: payload });
      if (error) {
        let msg = error.message;
        try { msg = (await error.context?.json())?.error || msg; } catch { /* sin cuerpo */ }
        throw new Error(msg);
      }
      if (!data?.ok) throw new Error(data?.error || 'No se pudo guardar el usuario.');
      toast(u ? 'Usuario actualizado.' : 'Usuario creado.', 'success');
    },
  });
}
