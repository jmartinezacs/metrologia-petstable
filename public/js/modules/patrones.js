// =====================================================================
// Patrones: pesas patrón (básculas) y patrones de referencia de los
// demás equipos (termómetro patrón, buffers de pH, balanza de referencia…).
// Un patrón vencido o inactivo no se ofrece al registrar verificaciones.
// =====================================================================
import {
  sb, state, esc, icon, toast, openModal, checkForm, formValues, nullIfEmpty, must, pill, fmtDate, fmtVal,
  todayISO, diffDays, emptyState, errorState, refreshIcons, getTipos,
} from '../core.js';

let root, tab = 'pesas';

export function vigenciaPatron(p) {
  if (!p.activo_calbas) return ['Inactivo', 'gray'];
  if (!p.fecha_vencimiento_calbas) return ['Sin vencimiento', 'info'];
  const dias = diffDays(todayISO(), p.fecha_vencimiento_calbas);
  if (dias < 0) return ['Vencido', 'bad'];
  if (dias <= 30) return [`Vence en ${dias} d`, 'warn'];
  return ['Vigente', 'ok'];
}

export default {
  async render(el, params = {}) {
    root = el;
    tab = params.tab === 'referencia' ? 'referencia' : 'pesas';
    el.innerHTML = `
      <section class="page-intro">
        <div><span class="eyebrow">Trazabilidad</span><h1>Patrones</h1>
          <p>Pesas patrón y patrones de referencia calibrados con los que se verifican los equipos.</p></div>
        <div class="page-actions">${state.isAdmin ? `<button class="btn primary" data-pt="nuevo">${icon('plus')} Nuevo patrón</button>` : ''}</div>
      </section>
      <div class="tabs" role="tablist">
        <button role="tab" data-tab="pesas">${icon('weight')} Pesas patrón</button>
        <button role="tab" data-tab="referencia">${icon('thermometer')} Patrones de referencia</button>
      </div>
      <div class="card" id="pt-body"></div>`;
    el.addEventListener('click', async (e) => {
      const t = e.target.closest('[data-tab]');
      if (t) { tab = t.dataset.tab; history.replaceState(null, '', `#/patrones?tab=${tab}`); return load(); }
      const b = e.target.closest('[data-pt]');
      if (!b) return;
      if (b.dataset.pt === 'nuevo') { if (await (tab === 'pesas' ? formPesa() : formPatron())) load(); }
      if (b.dataset.pt === 'editar') { if (await (tab === 'pesas' ? formPesa(b.dataset.id) : formPatron(b.dataset.id))) load(); }
      if (b.dataset.pt === 'retry') load();
    });
    await load();
  },
  destroy() { root = null; },
};

async function load() {
  const body = root.querySelector('#pt-body');
  root.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  body.innerHTML = '<div class="skeleton" style="height:120px"></div>';
  try {
    if (tab === 'pesas') {
      const { data } = must(await sb.from('pesas_patron_calbas').select('*').order('activa_calbas', { ascending: false }).order('codigo_calbas'));
      body.innerHTML = data.length ? `<div class="table-wrap responsive"><table class="table"><thead><tr><th>Código</th><th>Descripción</th><th>Valor nominal</th><th>Calibración</th><th>Vencimiento</th><th>Estado</th>${state.isAdmin ? '<th></th>' : ''}</tr></thead><tbody>
        ${data.map((p) => { const v = vigenciaPatron({ ...p, activo_calbas: p.activa_calbas }); return `<tr>
          <td data-label="Código"><b>${esc(p.codigo_calbas)}</b></td><td data-label="Descripción">${esc(p.descripcion_calbas)}</td>
          <td data-label="Valor" class="mono">${fmtVal(p.valor_nominal_calbas)} ${esc(p.unidad_calbas)}</td>
          <td data-label="Calibración">${fmtDate(p.fecha_calibracion_calbas)}</td><td data-label="Vencimiento">${fmtDate(p.fecha_vencimiento_calbas)}</td>
          <td data-label="Estado">${pill(...v)}</td>
          ${state.isAdmin ? `<td class="actions"><button class="icon-btn" data-pt="editar" data-id="${p.id_calbas}" aria-label="Editar">${icon('pencil')}</button></td>` : ''}</tr>`; }).join('')}
        </tbody></table></div>` : emptyState({ ico: 'weight', title: 'Sin pesas patrón', text: 'Registra las pesas patrón calibradas para verificar básculas.' });
    } else {
      const [{ data }, tipos] = await Promise.all([
        sb.from('patrones_calbas').select('*').order('activo_calbas', { ascending: false }).order('codigo_calbas').then(must),
        getTipos({ conBascula: false }),
      ]);
      const tipoDe = Object.fromEntries(tipos.map((t) => [t.id_calbas, t]));
      body.innerHTML = data.length ? `<div class="table-wrap responsive"><table class="table"><thead><tr><th>Código</th><th>Patrón</th><th>Para</th><th>Valor nominal</th><th>Incertidumbre</th><th>Certificado</th><th>Vencimiento</th><th>Estado</th>${state.isAdmin ? '<th></th>' : ''}</tr></thead><tbody>
        ${data.map((p) => `<tr>
          <td data-label="Código"><b>${esc(p.codigo_calbas)}</b></td><td data-label="Patrón">${esc(p.descripcion_calbas)}${p.lote_calbas ? `<span class="cell-sub">Lote ${esc(p.lote_calbas)}</span>` : ''}</td>
          <td data-label="Para">${esc(tipoDe[p.tipo_id_calbas]?.nombre_calbas || '—')}</td>
          <td data-label="Valor" class="mono">${p.valor_nominal_calbas != null ? `${fmtVal(p.valor_nominal_calbas)} ${esc(p.unidad_calbas)}` : '<span class="cell-sub">Variable</span>'}</td>
          <td data-label="Incertidumbre" class="mono">${p.incertidumbre_calbas != null ? `± ${fmtVal(p.incertidumbre_calbas)} ${esc(p.unidad_calbas)}` : '—'}</td>
          <td data-label="Certificado">${esc(p.numero_certificado_calbas || '—')}${p.proveedor_calbas ? `<span class="cell-sub">${esc(p.proveedor_calbas)}</span>` : ''}</td>
          <td data-label="Vencimiento">${fmtDate(p.fecha_vencimiento_calbas)}</td><td data-label="Estado">${pill(...vigenciaPatron(p))}</td>
          ${state.isAdmin ? `<td class="actions"><button class="icon-btn" data-pt="editar" data-id="${p.id_calbas}" aria-label="Editar">${icon('pencil')}</button></td>` : ''}</tr>`).join('')}
        </tbody></table></div>` : emptyState({ ico: 'thermometer', title: 'Sin patrones de referencia', text: 'Registra termómetros patrón, soluciones buffer, balanzas de referencia, etc.' });
    }
  } catch (err) { body.innerHTML = errorState(err, ''); body.querySelector('[data-action]')?.setAttribute('data-pt', 'retry'); }
  refreshIcons();
}

const fld = (name, label, val, attrs = '', req = false) => `<div class="field"><label for="p-${name}">${esc(label)}${req ? ' <span class="req">*</span>' : ''}</label><input id="p-${name}" name="${name}" value="${esc(val ?? '')}" ${req ? 'required' : ''} ${attrs}></div>`;
const activo = (on) => `<label class="switch-row full"><input type="checkbox" name="activo" ${on !== false ? 'checked' : ''}> <span><b>Patrón activo</b><small>Desactívalo en lugar de borrarlo: conserva la trazabilidad de las verificaciones hechas con él.</small></span></label>`;
const fechasOk = (v, f) => (v && f.fecha_calibracion_calbas.value && v < f.fecha_calibracion_calbas.value ? 'No puede ser anterior a la calibración.' : '');

async function formPesa(id) {
  const p = id ? (await sb.from('pesas_patron_calbas').select('*').eq('id_calbas', id).single().then(must)).data : {};
  return openModal({
    title: id ? `Editar ${p.codigo_calbas}` : 'Nueva pesa patrón', subtitle: 'El código (PP-###) y la descripción se generan automáticamente.', size: 'md',
    body: `<div class="form-grid">
      ${fld('valor_nominal_calbas', 'Valor nominal', p.valor_nominal_calbas, 'type="number" step="any" min="0" inputmode="decimal"', true)}
      <div class="field"><label for="p-unidad">Unidad <span class="req">*</span></label><select id="p-unidad" name="unidad_calbas">${['g', 'kg'].map((u) => `<option ${p.unidad_calbas === u ? 'selected' : ''}>${u}</option>`).join('')}</select></div>
      ${fld('fecha_calibracion_calbas', 'Fecha de calibración', p.fecha_calibracion_calbas, 'type="date"')}
      ${fld('fecha_vencimiento_calbas', 'Vencimiento', p.fecha_vencimiento_calbas, 'type="date"')}
      ${activo(p.activa_calbas)}</div>`,
    onSubmit: async ({ form }) => {
      if (!checkForm(form, { valor_nominal_calbas: (v) => (Number(v) > 0 ? '' : 'Debe ser mayor que cero.'), fecha_vencimiento_calbas: fechasOk })) return false;
      const v = formValues(form);
      const row = { valor_nominal_calbas: Number(v.valor_nominal_calbas), unidad_calbas: v.unidad_calbas, fecha_calibracion_calbas: nullIfEmpty(v.fecha_calibracion_calbas),
        fecha_vencimiento_calbas: nullIfEmpty(v.fecha_vencimiento_calbas), activa_calbas: form.elements.activo.checked };
      if (id) must(await sb.from('pesas_patron_calbas').update(row).eq('id_calbas', id));
      else must(await sb.from('pesas_patron_calbas').insert(row));
      toast(id ? 'Pesa patrón actualizada.' : 'Pesa patrón registrada.', 'success');
    },
  });
}

async function formPatron(id) {
  const tipos = (await getTipos({ conBascula: false })).filter((t) => t.activo_calbas);
  const p = id ? (await sb.from('patrones_calbas').select('*').eq('id_calbas', id).single().then(must)).data : {};
  const t0 = tipos.find((t) => t.id_calbas === p.tipo_id_calbas) || tipos[0];
  const unidades = (t) => t.unidades_calbas.map((u) => `<option ${p.unidad_calbas === u ? 'selected' : ''}>${esc(u)}</option>`).join('');
  return openModal({
    title: id ? `Editar ${p.codigo_calbas}` : 'Nuevo patrón de referencia', subtitle: 'El código (PAT-###) se genera automáticamente.', size: 'lg',
    body: `<div class="form-grid">
      <div class="field"><label for="p-tipo">Se usa para verificar <span class="req">*</span></label><select id="p-tipo" name="tipo_id_calbas" required ${id ? 'disabled' : ''}>${tipos.map((t) => `<option value="${t.id_calbas}" ${t.id_calbas === t0?.id_calbas ? 'selected' : ''}>${esc(t.nombre_calbas)}</option>`).join('')}</select></div>
      ${fld('descripcion_calbas', 'Descripción', p.descripcion_calbas, 'maxlength="140" placeholder="Ej. Buffer pH 7.00 certificado / Termómetro patrón digital"', true)}
      ${fld('valor_nominal_calbas', 'Valor nominal (vacío si es variable)', p.valor_nominal_calbas, 'type="number" step="any" inputmode="decimal"')}
      <div class="field"><label for="p-unidad">Unidad <span class="req">*</span></label><select id="p-unidad" name="unidad_calbas">${t0 ? unidades(t0) : ''}</select></div>
      ${fld('incertidumbre_calbas', 'Incertidumbre (±)', p.incertidumbre_calbas, 'type="number" step="any" min="0" inputmode="decimal"')}
      ${fld('numero_certificado_calbas', 'Número de certificado', p.numero_certificado_calbas, 'maxlength="80"')}
      ${fld('proveedor_calbas', 'Proveedor / laboratorio', p.proveedor_calbas, 'maxlength="120"')}
      ${fld('lote_calbas', 'Lote (soluciones / materiales)', p.lote_calbas, 'maxlength="60"')}
      ${fld('fecha_calibracion_calbas', 'Fecha de calibración o elaboración', p.fecha_calibracion_calbas, 'type="date"')}
      ${fld('fecha_vencimiento_calbas', 'Vencimiento / caducidad', p.fecha_vencimiento_calbas, 'type="date"')}
      ${activo(p.activo_calbas)}</div>`,
    onOpen: ({ form }) => {
      form.elements.tipo_id_calbas.addEventListener('change', (e) => {
        const t = tipos.find((x) => x.id_calbas === e.target.value);
        form.elements.unidad_calbas.innerHTML = unidades(t);
      });
    },
    onSubmit: async ({ form }) => {
      if (!checkForm(form, { fecha_vencimiento_calbas: fechasOk })) return false;
      const v = formValues(form);
      const num = (x) => (x === '' ? null : Number(x));
      const row = { descripcion_calbas: v.descripcion_calbas, valor_nominal_calbas: num(v.valor_nominal_calbas), unidad_calbas: v.unidad_calbas,
        incertidumbre_calbas: num(v.incertidumbre_calbas), numero_certificado_calbas: nullIfEmpty(v.numero_certificado_calbas), proveedor_calbas: nullIfEmpty(v.proveedor_calbas),
        lote_calbas: nullIfEmpty(v.lote_calbas), fecha_calibracion_calbas: nullIfEmpty(v.fecha_calibracion_calbas), fecha_vencimiento_calbas: nullIfEmpty(v.fecha_vencimiento_calbas),
        activo_calbas: form.elements.activo.checked };
      if (id) must(await sb.from('patrones_calbas').update(row).eq('id_calbas', id));
      else must(await sb.from('patrones_calbas').insert({ ...row, tipo_id_calbas: form.elements.tipo_id_calbas.value, codigo_calbas: '' }));
      toast(id ? 'Patrón actualizado.' : 'Patrón registrado.', 'success');
    },
  });
}
