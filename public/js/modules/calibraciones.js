// =====================================================================
// Calibraciones externas: vigencia por equipo, registro de certificados
// (con archivo PDF/imagen en el bucket privado certificados_calbas).
// =====================================================================
import {
  sb, state, esc, icon, refreshIcons, toast, openModal, checkForm, formValues, nullIfEmpty, must, pill, fmtDate,
  calPill, RESULTADO_CAL, tipoIcono, subirCertificado, abrirCertificado, todayISO, addDays, emptyState, errorState,
  fetchAll, toCSV, descargar, errMsg,
} from '../core.js';
import { cargarEquipos } from './equipos.js';

let root, tab = 'vigencia', equipos = [];

export default {
  async render(el, params = {}) {
    root = el;
    tab = params.tab === 'certificados' ? 'certificados' : 'vigencia';
    el.innerHTML = `
      <section class="page-intro">
        <div><span class="eyebrow">Aseguramiento metrológico</span><h1>Calibraciones</h1>
          <p>Vigencia de la calibración externa de cada equipo y sus certificados.</p></div>
        <div class="page-actions">
          <button class="btn green" data-c="csv">${icon('file-spreadsheet')} Exportar a Excel (CSV)</button>
          ${state.isAdmin ? `<button class="btn navy" data-c="nueva">${icon('plus')} Registrar calibración</button>` : ''}
        </div>
      </section>
      <div class="grid grid-4" id="c-kpis"></div>
      <div class="tabs mt" role="tablist">
        <button role="tab" data-tab="vigencia">${icon('calendar-clock')} Vigencia por equipo</button>
        <button role="tab" data-tab="certificados">${icon('file-badge')} Certificados</button>
      </div>
      <div class="card" id="c-body"></div>`;
    el.addEventListener('click', onClick);
    await load(params.estado);
  },
  destroy() { root = null; },
};

async function onClick(e) {
  const t = e.target.closest('[data-tab]');
  if (t) { tab = t.dataset.tab; history.replaceState(null, '', `#/calibraciones?tab=${tab}`); return load(); }
  const k = e.target.closest('[data-kpi]');
  if (k) { tab = 'vigencia'; return load(k.dataset.kpi); }
  const b = e.target.closest('[data-c]');
  if (!b) return;
  const act = b.dataset.c;
  if (act === 'nueva') { if (await formCalibracion(b.dataset.id ? equipos.find((x) => x.id_calbas === b.dataset.id) : null)) load(); }
  if (act === 'editar') { if (await editarCalibracion(b.dataset.id, b.dataset.origen)) load(); }
  if (act === 'cert') abrirCertificado(b.dataset.ref);
  if (act === 'csv') exportar();
  if (act === 'retry') load();
}

async function load(filtroEstado = '') {
  const body = root.querySelector('#c-body');
  root.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  body.innerHTML = '<div class="skeleton" style="height:140px"></div>';
  try {
    equipos = (await cargarEquipos()).filter((e) => e.activo_calbas);
    const cuenta = (s) => equipos.filter((e) => e.estado_calibracion_calbas === s).length;
    const kpi = (cls, ico, label, n, desc, filtro) => `<button class="kpi ${cls} clickable" data-kpi="${filtro}"><div class="kpi-head"><span class="kpi-ico">${icon(ico)}</span><small>${esc(label)}</small></div><strong>${n}</strong><span class="desc">${esc(desc)}</span></button>`;
    root.querySelector('#c-kpis').innerHTML = kpi('c3 i-green', 'badge-check', 'Vigentes', cuenta('vigente'), 'Más de 30 días de vigencia', 'vigente')
      + kpi('c2 i-amber', 'calendar-clock', 'Por vencer', cuenta('por_vencer'), 'En los próximos 30 días', 'por_vencer')
      + kpi(`${cuenta('vencida') ? 'danger' : 'c4'} i-red`, 'calendar-x', 'Vencidas', cuenta('vencida'), 'Requieren calibración', 'vencida')
      + kpi('c4 i-violet', 'file-question', 'Sin registro', cuenta('sin_registro'), 'Sin certificado capturado', 'sin_registro');
    if (tab === 'vigencia') {
      const orden = { vencida: 0, por_vencer: 1, sin_registro: 2, vigente: 3 };
      let rows = [...equipos].sort((a, b) => orden[a.estado_calibracion_calbas] - orden[b.estado_calibracion_calbas] || (a.dias_calibracion_calbas ?? 99999) - (b.dias_calibracion_calbas ?? 99999));
      if (filtroEstado) rows = rows.filter((e) => e.estado_calibracion_calbas === filtroEstado);
      body.innerHTML = rows.length ? `<div class="table-wrap responsive"><table class="table"><thead><tr><th>Equipo</th><th>Departamento</th><th>Última calibración</th><th>Vencimiento</th><th>Certificado</th><th>Estado</th>${state.isAdmin ? '<th></th>' : ''}</tr></thead><tbody>
        ${rows.map((e) => `<tr>
          <td data-label="Equipo"><div class="eq-cell"><span class="eq-ico t-${esc(e.tipo_clave_calbas.toLowerCase())}">${icon(tipoIcono(e.tipo_clave_calbas, e.icono_calbas))}</span><div><b class="cell-main">${esc(e.codigo_calbas)}</b><span class="cell-sub">${esc(e.tipo_nombre_calbas)}</span></div></div></td>
          <td data-label="Departamento">${esc(e.departamento_calbas || '—')}<span class="cell-sub">${esc(e.ubicacion_calbas || '')}</span></td>
          <td data-label="Última">${fmtDate(e.fecha_calibracion_calbas)}</td>
          <td data-label="Vencimiento">${fmtDate(e.vencimiento_calibracion_calbas)}${e.dias_calibracion_calbas != null ? `<span class="cell-sub">${e.dias_calibracion_calbas < 0 ? `Hace ${-e.dias_calibracion_calbas} días` : `En ${e.dias_calibracion_calbas} días`}</span>` : ''}</td>
          <td data-label="Certificado">${esc(e.numero_certificado_calbas || '—')}<span class="cell-sub">${esc(e.proveedor_laboratorio_calbas || '')}</span></td>
          <td data-label="Estado">${calPill(e.estado_calibracion_calbas)}</td>
          ${state.isAdmin ? `<td class="actions"><button class="btn outline sm" data-c="nueva" data-id="${e.id_calbas}">${icon('plus')} Calibración</button></td>` : ''}</tr>`).join('')}
        </tbody></table></div>` : emptyState({ ico: 'badge-check', title: 'Sin equipos en este estado' });
    } else {
      const { data } = must(await sb.from('vw_calibraciones_todas_calbas').select('*').order('fecha_calibracion_calbas', { ascending: false }).limit(500));
      body.innerHTML = data.length ? `<div class="table-wrap responsive"><table class="table"><thead><tr><th>Equipo</th><th>Calibración</th><th>Vence</th><th>Certificado</th><th>Laboratorio</th><th>Resultado</th><th></th></tr></thead><tbody>
        ${data.map((c) => `<tr>
          <td data-label="Equipo"><b class="cell-main">${esc(c.equipo_codigo_calbas)}</b><span class="cell-sub">${esc(c.tipo_nombre_calbas)} · ${esc(c.departamento_calbas || '')}</span></td>
          <td data-label="Calibración">${fmtDate(c.fecha_calibracion_calbas)}</td><td data-label="Vence">${fmtDate(c.fecha_vencimiento_calbas)}</td>
          <td data-label="Certificado">${esc(c.numero_certificado_calbas || '—')}</td><td data-label="Laboratorio">${esc(c.proveedor_laboratorio_calbas || '—')}</td>
          <td data-label="Resultado">${pill(...(RESULTADO_CAL[c.resultado_calbas] || [c.resultado_calbas, 'gray']))}</td>
          <td class="actions"><div class="row-actions">${c.archivo_url_calbas ? `<button class="icon-btn" data-c="cert" data-ref="${esc(c.archivo_url_calbas)}" title="Ver certificado" aria-label="Ver certificado">${icon('paperclip')}</button>` : ''}
            ${state.isAdmin ? `<button class="icon-btn" data-c="editar" data-id="${c.id_calbas}" data-origen="${c.origen_calbas}" title="Editar" aria-label="Editar">${icon('pencil')}</button>` : ''}</div></td></tr>`).join('')}
        </tbody></table></div>` : emptyState({ ico: 'file-badge', title: 'Sin certificados registrados' });
    }
  } catch (err) {
    body.innerHTML = errorState(err, '');
    body.querySelector('[data-action]')?.setAttribute('data-c', 'retry');
  }
  refreshIcons();
}

const fld = (name, label, val, attrs = '', req = false) => `<div class="field"><label for="c-${name}">${esc(label)}${req ? ' <span class="req">*</span>' : ''}</label><input id="c-${name}" name="${name}" value="${esc(val ?? '')}" ${req ? 'required' : ''} ${attrs}></div>`;
const resultadoSel = (sel = 'vigente') => `<div class="field"><label for="c-res">Resultado</label><select id="c-res" name="resultado_calbas">${Object.entries(RESULTADO_CAL).map(([k, [l]]) => `<option value="${k}" ${sel === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`;
const archivoFld = `<div class="field full"><label for="c-arch">Certificado (PDF o imagen, máx. 10 MB)</label><input id="c-arch" name="archivo" type="file" accept="application/pdf,image/jpeg,image/png,image/webp"></div>`;

async function formCalibracion(eq = null) {
  const lista = equipos.length ? equipos : (await cargarEquipos()).filter((e) => e.activo_calbas);
  const hoy = todayISO();
  return openModal({
    title: 'Registrar calibración', subtitle: 'Certificado emitido por un laboratorio externo.', size: 'lg',
    body: `<div class="form-grid">
      <div class="field full"><label for="c-eq">Equipo <span class="req">*</span></label><select id="c-eq" name="equipo" required><option value="">Selecciona…</option>
        ${lista.map((e) => `<option value="${e.id_calbas}" data-origen="${e.origen_calbas}" ${eq?.id_calbas === e.id_calbas ? 'selected' : ''}>${esc(e.codigo_calbas)} · ${esc(e.tipo_nombre_calbas)} · ${esc(e.departamento_calbas || '')}</option>`).join('')}</select></div>
      ${fld('fecha_calibracion_calbas', 'Fecha de calibración', hoy, `type="date" max="${hoy}"`, true)}
      ${fld('fecha_vencimiento_calbas', 'Vencimiento', addDays(hoy, 365), 'type="date"', true)}
      ${fld('numero_certificado_calbas', 'Número de certificado', '', 'maxlength="80"')}
      ${fld('proveedor_laboratorio_calbas', 'Laboratorio / proveedor', '', 'maxlength="120"')}
      ${resultadoSel()}
      <div class="field full"><label for="c-obs">Observaciones</label><textarea id="c-obs" name="observaciones_calbas" rows="2" maxlength="500"></textarea></div>
      ${archivoFld}
      <p class="hint full">En básculas, la primera verificación posterior a esta calibración se evaluará con el criterio de verificación inicial.</p></div>`,
    onSubmit: async ({ form }) => {
      if (!checkForm(form, { fecha_vencimiento_calbas: (v, f) => (v < f.fecha_calibracion_calbas.value ? 'No puede ser anterior a la calibración.' : '') })) return false;
      const v = formValues(form);
      const opt = form.elements.equipo.selectedOptions[0];
      const e = lista.find((x) => x.id_calbas === v.equipo);
      const file = form.elements.archivo.files[0];
      const archivo = file ? await subirCertificado(file, e?.codigo_calbas) : null;
      const row = { fecha_calibracion_calbas: v.fecha_calibracion_calbas, fecha_vencimiento_calbas: v.fecha_vencimiento_calbas,
        numero_certificado_calbas: nullIfEmpty(v.numero_certificado_calbas), proveedor_laboratorio_calbas: nullIfEmpty(v.proveedor_laboratorio_calbas),
        resultado_calbas: v.resultado_calbas, observaciones_calbas: nullIfEmpty(v.observaciones_calbas), archivo_url_calbas: archivo,
        created_by_calbas: state.session.user.id };
      if (opt.dataset.origen === 'bascula') must(await sb.from('calibraciones_calbas').insert({ ...row, bascula_id_calbas: v.equipo }));
      else must(await sb.from('calibraciones_equipo_calbas').insert({ ...row, equipo_id_calbas: v.equipo }));
      toast('Calibración registrada.', 'success');
    },
  });
}

async function editarCalibracion(id, origen) {
  const tabla = origen === 'bascula' ? 'calibraciones_calbas' : 'calibraciones_equipo_calbas';
  const { data: c } = must(await sb.from(tabla).select('*').eq('id_calbas', id).single());
  return openModal({
    title: 'Editar calibración', subtitle: `Certificado ${c.numero_certificado_calbas || 'sin número'}`, size: 'lg',
    body: `<div class="form-grid">
      ${fld('fecha_calibracion_calbas', 'Fecha de calibración', c.fecha_calibracion_calbas, 'type="date"', true)}
      ${fld('fecha_vencimiento_calbas', 'Vencimiento', c.fecha_vencimiento_calbas, 'type="date"', true)}
      ${fld('numero_certificado_calbas', 'Número de certificado', c.numero_certificado_calbas, 'maxlength="80"')}
      ${fld('proveedor_laboratorio_calbas', 'Laboratorio / proveedor', c.proveedor_laboratorio_calbas, 'maxlength="120"')}
      ${resultadoSel(c.resultado_calbas)}
      <div class="field full"><label for="c-obs">Observaciones</label><textarea id="c-obs" name="observaciones_calbas" rows="2" maxlength="500">${esc(c.observaciones_calbas || '')}</textarea></div>
      ${archivoFld}${c.archivo_url_calbas ? '<p class="hint full">Ya hay un certificado adjunto; si eliges otro archivo lo reemplazará.</p>' : ''}
      <p class="hint full">Para invalidar un certificado usa el resultado “Cancelada”: el registro se conserva para la trazabilidad.</p></div>`,
    onSubmit: async ({ form }) => {
      if (!checkForm(form, { fecha_vencimiento_calbas: (v, f) => (v < f.fecha_calibracion_calbas.value ? 'No puede ser anterior a la calibración.' : '') })) return false;
      const v = formValues(form);
      const file = form.elements.archivo.files[0];
      const row = { fecha_calibracion_calbas: v.fecha_calibracion_calbas, fecha_vencimiento_calbas: v.fecha_vencimiento_calbas,
        numero_certificado_calbas: nullIfEmpty(v.numero_certificado_calbas), proveedor_laboratorio_calbas: nullIfEmpty(v.proveedor_laboratorio_calbas),
        resultado_calbas: v.resultado_calbas, observaciones_calbas: nullIfEmpty(v.observaciones_calbas) };
      if (file) row.archivo_url_calbas = await subirCertificado(file, c.numero_certificado_calbas || 'certificado');
      must(await sb.from(tabla).update(row).eq('id_calbas', id));
      toast('Calibración actualizada.', 'success');
    },
  });
}

async function exportar() {
  try {
    const rows = await fetchAll(() => sb.from('vw_calibraciones_todas_calbas').select('*').order('fecha_calibracion_calbas', { ascending: false }));
    if (!rows.length) { toast('No hay registros para exportar.', 'warning'); return; }
    descargar(`calibraciones_${todayISO()}.csv`, toCSV(rows, [
      { label: 'Tipo', get: (r) => r.tipo_nombre_calbas }, { label: 'Equipo', get: (r) => r.equipo_codigo_calbas }, { label: 'Departamento', get: (r) => r.departamento_calbas },
      { label: 'Fecha de calibración', get: (r) => r.fecha_calibracion_calbas }, { label: 'Vencimiento', get: (r) => r.fecha_vencimiento_calbas },
      { label: 'Certificado', get: (r) => r.numero_certificado_calbas }, { label: 'Laboratorio', get: (r) => r.proveedor_laboratorio_calbas },
      { label: 'Resultado', get: (r) => RESULTADO_CAL[r.resultado_calbas]?.[0] || r.resultado_calbas }, { label: 'Observaciones', get: (r) => r.observaciones_calbas },
    ]));
  } catch (err) { toast(errMsg(err), 'error'); }
}
