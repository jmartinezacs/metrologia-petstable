// =====================================================================
// Usuarios: directorio para todos; altas y cambios solo administradores
// mediante la Edge Function gestionar_usuarios_calbas_admin (crea la cuenta
// en Auth, el perfil, el departamento y la fotografía).
// =====================================================================
import {
  sb, state, esc, icon, refreshIcons, toast, openModal, checkForm, must, pill, avatarHTML, fotoDe, getDepartamentos,
  prepararFoto, blobABase64, emptyState, sanitizeSearch, debounce, errMsg, fmtDateTime,
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

// ---------------- Fotos existentes (bucket «avatares») ----------------
async function elegirFotoExistente() {
  const { data, error } = await sb.storage.from('avatares').list('', { limit: 500, sortBy: { column: 'name', order: 'asc' } });
  if (error) { toast(errMsg(error), 'error'); return null; }
  const fotos = (data || []).filter((f) => /\.(png|jpe?g|webp)$/i.test(f.name));
  if (!fotos.length) { toast('No hay fotos en la carpeta «avatares».', 'warning'); return null; }
  const url = (n) => sb.storage.from('avatares').getPublicUrl(n).data.publicUrl;
  const r = await openModal({
    title: 'Fotos existentes', subtitle: 'Carpeta «avatares» de Supabase Storage. Toca una foto para usarla.', size: 'lg', confirmDiscard: false,
    body: `<div class="toolbar"><div class="search">${icon('search')}<input type="search" id="gal-q" placeholder="Filtrar por nombre" aria-label="Filtrar fotos"></div></div>
      <div class="photo-gallery" id="gal">${fotos.map((f) => `<button type="button" data-url="${esc(url(f.name))}" data-n="${esc(f.name.toLowerCase())}">
        <img src="${esc(url(f.name))}" alt="" loading="lazy"><span>${esc(f.name.replace(/\.[^.]+$/, ''))}</span></button>`).join('')}</div>`,
    onOpen: ({ wrap, close }) => {
      wrap.querySelector('#gal').addEventListener('click', (e) => { const b = e.target.closest('[data-url]'); if (b) close(b.dataset.url); });
      wrap.querySelector('#gal-q').addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase();
        wrap.querySelectorAll('#gal [data-n]').forEach((b) => b.classList.toggle('hidden', !b.dataset.n.includes(q)));
      });
    },
  });
  return typeof r === 'string' ? r : null;
}

// Sube la foto elegida por un administrador a calbas-avatars/<uid>/ (política de administradores)
async function subirFotoDe(uid, blob) {
  const path = `${uid}/${Date.now()}.jpg`;
  must(await sb.storage.from('calbas-avatars').upload(path, blob, { contentType: 'image/jpeg', upsert: false, cacheControl: '31536000' }));
  return sb.storage.from('calbas-avatars').getPublicUrl(path).data.publicUrl;
}

const seccion = (ico, titulo, sub = '') => `<div class="form-section full"><span class="fs-ico">${icon(ico)}</span><div><b>${esc(titulo)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div></div>`;

// ---------------- Alta / edición ----------------
async function formUsuario(u = null) {
  const deptos = (await getDepartamentos({ force: true })).filter((d) => d.activo_calbas);
  const depSel = deptos.find((d) => d.nombre_calbas.toLowerCase() === String(u?.departamento_calbas || '').toLowerCase())?.id_calbas || '';
  const puesto = String(u?.puesto_calbas || '').trim();
  const estandar = !puesto || PUESTOS.includes(puesto);
  const self = u && u.id_calbas === state.session.user.id;
  let fotoBlob = null, fotoUrl = null, cuenta = null, buscaTok = 0, resultados = [];

  return openModal({
    title: u ? 'Editar usuario' : 'Agregar usuario', subtitle: u ? u.correo_calbas : 'Da acceso a Metrología a una persona de Pet\'s Table.', size: 'lg',
    submitText: u ? 'Guardar cambios' : 'Agregar usuario',
    body: `
      ${u ? '' : `<div class="acc-box">
        ${seccion('search', 'Buscar en cuentas existentes', 'Si la persona ya usa otra app de Pet\'s Table, selecciónala: se llenan sus datos y su foto y entrará con su misma contraseña.')}
        <div class="search">${icon('search')}<input type="search" id="us-busca" placeholder="Nombre o correo (mín. 2 letras)" autocomplete="off" aria-label="Buscar cuentas existentes"></div>
        <div class="acc-results" id="us-busca-res"></div>
        <div id="us-cuenta-sel"></div>
      </div>`}
      <div class="user-form-top">
        <div class="photo-pick">
          <span id="us-prev">${avatarHTML(u?.nombre_completo_calbas || '?', u ? fotoDe(u.correo_calbas, u.avatar_url_calbas) : '', 'xl')}</span>
          <div class="btns">
            <label class="btn orange sm" for="us-foto" style="cursor:pointer">${icon('camera')} Subir foto</label>
            <button type="button" class="btn teal sm" id="us-galeria">${icon('images')} Fotos existentes</button>
          </div>
          <input id="us-foto" type="file" accept="image/jpeg,image/png,image/webp" class="sr-only">
          <small class="hint">JPG, PNG o WEBP · máx. 5 MB. Se recorta en cuadrado.</small>
        </div>
        <div class="form-grid">
          ${seccion('id-card', 'Datos personales')}
          <div class="field full"><label for="us-nombre">Nombre completo <span class="req">*</span></label><input id="us-nombre" name="nombre" required maxlength="140" value="${esc(u?.nombre_completo_calbas || '')}" autocomplete="off"></div>
          <div class="field full"><label for="us-email">Correo corporativo <span class="req">*</span></label><input id="us-email" name="email" type="email" required maxlength="120" value="${esc(u?.correo_calbas || '')}" autocomplete="off" placeholder="nombre@petstable.mx" ${u ? 'disabled' : ''}></div>
          ${seccion('building-2', 'Asignación', 'Un usuario solo ve y verifica los equipos de su departamento.')}
          <div class="field"><label for="us-dep">Departamento <span class="req">*</span></label><select id="us-dep" name="departamento" required><option value="">Selecciona…</option>${deptos.map((d) => `<option value="${d.id_calbas}" ${d.id_calbas === depSel ? 'selected' : ''}>${esc(d.nombre_calbas)}</option>`).join('')}</select></div>
          <div class="field"><label for="us-puesto">Puesto</label><select id="us-puesto" name="puesto_sel"><option value="">Selecciona…</option>${PUESTOS.map((p) => `<option ${p === puesto ? 'selected' : ''}>${esc(p)}</option>`).join('')}<option value="__otro" ${estandar ? '' : 'selected'}>Otro…</option></select></div>
          <div class="field full ${estandar ? 'hidden' : ''}" id="us-otro-f"><label for="us-otro">Especifica el puesto</label><input id="us-otro" name="puesto_otro" maxlength="140" value="${esc(estandar ? '' : puesto)}"></div>
          <div class="field full"><label>Rol de acceso</label>
            <div class="rol-pick">
              <label class="rol-opt"><input type="radio" name="rol" value="usuario" ${u?.rol_calbas !== 'admin' ? 'checked' : ''} ${self ? 'disabled' : ''}><span>${icon('user')}<b>Usuario</b><small>Verifica y consulta los equipos de su departamento</small></span></label>
              <label class="rol-opt"><input type="radio" name="rol" value="admin" ${u?.rol_calbas === 'admin' ? 'checked' : ''} ${self ? 'disabled' : ''}><span>${icon('crown')}<b>Administrador</b><small>Gestión completa de equipos, calibraciones y usuarios</small></span></label>
            </div></div>
          <div id="us-acceso" class="full form-grid" style="padding:0">
            ${seccion('key-round', 'Acceso')}
            <div class="field full"><label for="us-pw">${u ? 'Nueva contraseña (opcional)' : 'Contraseña inicial'} ${u ? '' : '<span class="req">*</span>'}</label><input id="us-pw" name="password" type="password" minlength="8" maxlength="128" autocomplete="new-password" ${u ? '' : 'required'} placeholder="Mínimo 8 caracteres"></div>
            ${u ? `<label class="switch-row full"><input type="checkbox" name="activo" ${u.activo_calbas === false ? '' : 'checked'} ${self ? 'disabled' : ''}><span><b>Usuario activo</b><small>Desactivarlo solo le quita el acceso a Metrología; su cuenta sigue funcionando en las demás apps de Pet's Table.</small></span></label>` : ''}
          </div>
        </div>
      </div>`,
    onOpen: ({ form }) => {
      const prev = form.querySelector('#us-prev');
      const nombre = () => form.elements.nombre.value || '?';
      const sel = form.querySelector('#us-puesto');
      sel.addEventListener('change', () => form.querySelector('#us-otro-f').classList.toggle('hidden', sel.value !== '__otro'));
      form.querySelector('#us-foto').addEventListener('change', async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        try { fotoBlob = await prepararFoto(f); fotoUrl = null; prev.innerHTML = `<span class="avatar has-img xl"><img src="${URL.createObjectURL(fotoBlob)}" alt=""></span>`; }
        catch (err) { toast(errMsg(err), 'error'); }
        e.target.value = '';
      });
      const ponerFoto = (url) => { fotoBlob = null; fotoUrl = url; prev.innerHTML = avatarHTML(nombre(), url, 'xl'); };
      form.querySelector('#us-galeria').addEventListener('click', async () => { const url = await elegirFotoExistente(); if (url) ponerFoto(url); });
      if (u) return;
      const res = form.querySelector('#us-busca-res');
      form.querySelector('#us-busca').addEventListener('input', debounce(async (ev) => {
        const q = ev.target.value.trim();
        const t = ++buscaTok;
        if (q.length < 2) { res.innerHTML = ''; return; }
        res.innerHTML = '<span class="hint">Buscando…</span>';
        const { data, error } = await sb.rpc('calbas_buscar_cuentas', { p_q: q });
        if (t !== buscaTok) return;
        if (error) { res.innerHTML = `<span class="hint" style="color:var(--bad)">${esc(errMsg(error))}</span>`; return; }
        resultados = data || [];
        res.innerHTML = resultados.length ? resultados.map((r, i) => `<button type="button" data-cuenta="${i}" ${r.ya_registrado ? 'disabled' : ''}>
            ${avatarHTML(r.nombre, r.foto_sugerida)}<span class="acc-main"><b>${esc(r.nombre)}</b><small>${esc(r.email)}${r.ultimo_acceso ? ` · último acceso ${fmtDateTime(r.ultimo_acceso)}` : ''}</small></span>
            ${r.ya_registrado ? pill('Ya tiene acceso', 'gray') : pill('Seleccionar', 'ok')}</button>`).join('')
          : '<span class="hint">No hay cuentas con ese texto. Captura los datos abajo para crear una nueva.</span>';
        refreshIcons();
      }, 350));
      res.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-cuenta]');
        if (!b || b.disabled) return;
        cuenta = resultados[Number(b.dataset.cuenta)];
        form.elements.nombre.value = cuenta.nombre;
        form.elements.email.value = cuenta.email;
        form.elements.email.disabled = true;
        if (cuenta.foto_sugerida && !fotoBlob) ponerFoto(cuenta.foto_sugerida);
        // Una cuenta existente conserva su contraseña: no se pide
        form.querySelector('#us-acceso').classList.add('hidden');
        form.elements.password.required = false;
        form.querySelector('#us-cuenta-sel').innerHTML = `<div class="notice" style="margin:8px 0 0">${icon('check-circle-2')}<span><b>${esc(cuenta.nombre)}</b> ya tiene cuenta Pet's Table: entrará con su misma contraseña. Completa departamento, puesto y rol. <button type="button" class="link-btn" id="us-quitar-cuenta">Quitar selección</button></span></div>`;
        res.querySelectorAll('[data-cuenta]').forEach((x) => x.classList.toggle('sel', x === b));
        refreshIcons();
        form.querySelector('#us-quitar-cuenta').addEventListener('click', () => {
          cuenta = null; form.elements.email.disabled = false; form.elements.password.required = true;
          form.querySelector('#us-acceso').classList.remove('hidden');
          form.querySelector('#us-cuenta-sel').innerHTML = '';
          res.querySelectorAll('.sel').forEach((x) => x.classList.remove('sel'));
        });
        form.elements.departamento.focus();
      });
    },
    onSubmit: async ({ form }) => {
      if (!checkForm(form, { email: (v) => (/@petstable\.mx$/i.test(v) ? '' : 'Usa un correo @petstable.mx.') })) return false;
      const f = form.elements;
      const rol = form.querySelector('input[name="rol"]:checked')?.value || 'usuario';
      const puestoFinal = f.puesto_sel.value === '__otro' ? f.puesto_otro.value.trim() : f.puesto_sel.value;
      // Cuenta existente: se registra solo el acceso a Metrología (sin tocar Auth)
      if (cuenta) {
        const url = fotoBlob ? await subirFotoDe(cuenta.id, fotoBlob) : fotoUrl;
        must(await sb.rpc('calbas_agregar_cuenta', { p_id: cuenta.id, p_nombre: f.nombre.value.trim(), p_puesto: puestoFinal || null, p_rol: rol, p_departamento: f.departamento.value, p_avatar: url || null }));
        toast(`${cuenta.nombre} ya tiene acceso a Metrología.`, 'success');
        return true;
      }
      const payload = {
        action: u ? 'update' : 'create', user_id: u?.id_calbas, nombre: f.nombre.value.trim(), email: f.email.value.trim().toLowerCase(),
        departamento_id: f.departamento.value, puesto: puestoFinal, rol: self ? u.rol_calbas : rol, password: f.password.value,
        activo: u ? (self ? true : f.activo.checked) : true,
      };
      if (fotoBlob && !u) { payload.avatar_base64 = await blobABase64(fotoBlob); payload.avatar_mime = 'image/jpeg'; }
      const { data, error } = await sb.functions.invoke('gestionar_usuarios_calbas_admin', { body: payload });
      if (error) {
        let msg = error.message;
        try { msg = (await error.context?.json())?.error || msg; } catch { /* sin cuerpo */ }
        if (/already (been )?registered|already exists/i.test(msg)) msg = 'Ese correo ya tiene cuenta Pet\'s Table. Búscalo arriba en «Buscar en cuentas existentes».';
        throw new Error(msg);
      }
      if (!data?.ok) throw new Error(data?.error || 'No se pudo guardar el usuario.');
      // En edición la foto se guarda directo en el perfil (subida o elegida de las existentes)
      const uid = data.user_id || u?.id_calbas;
      const nueva = u && fotoBlob ? await subirFotoDe(uid, fotoBlob) : fotoUrl;
      if (nueva) must(await sb.from('perfiles_calbas').update({ avatar_url_calbas: nueva }).eq('id_calbas', uid));
      toast(u ? 'Usuario actualizado.' : 'Usuario creado.', 'success');
      return true;
    },
  });
}
