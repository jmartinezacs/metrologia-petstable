// =====================================================================
// Equipos: inventario unificado (básculas + termómetros, potenciómetros,
// micropipetas, …), ficha técnica, alta/edición y tipos de equipo.
// Las básculas se guardan en basculas_calbas (módulo especializado OIML);
// los demás equipos en equipos_calbas.
// =====================================================================
import {
  sb, state, esc, icon, refreshIcons, toast, openModal, confirmDialog, checkForm, formValues, nullIfEmpty, must,
  DataTable, emptyState, pill, fmtDate, fmtVal, fmtSigned, calPill, verPill, dictamenPill, getDepartamentos, getTipos,
  invalidarCatalogos, tipoIcono, CLASES, CRITERIOS, ganchos, navigate, sanitizeSearch, debounce, prefs, abrirCertificado,
  U, convertirMasa,
} from '../core.js';

let root, table, todos = [];

export async function cargarEquipos() {
  const { data } = must(await sb.from('vw_equipos_calbas').select('*').order('codigo_calbas'));
  return data;
}

export default {
  async render(el, params = {}) {
    root = el;
    const tipos = await getTipos();
    const deptos = await getDepartamentos();
    el.innerHTML = `
      <section class="page-intro">
        <div><span class="eyebrow">Inventario metrológico</span><h1>Equipos</h1>
          <p>Básculas, termómetros, potenciómetros, micropipetas y demás instrumentos con su estado de verificación y calibración.</p></div>
        <div class="page-actions">
          ${state.isAdmin ? `<button class="btn teal" data-eq="tipos">${icon('shapes')} Tipos de equipo</button>
          <button class="btn primary" data-eq="nuevo">${icon('plus')} Nuevo equipo</button>` : ''}
        </div>
      </section>
      <div class="type-strip" id="eq-tipos"></div>
      <div class="card">
        <div class="toolbar">
          <div class="search">${icon('search')}<input type="search" id="eq-q" placeholder="Buscar código, ubicación, marca o serie" aria-label="Buscar"></div>
          <select id="eq-tipo" aria-label="Tipo"><option value="">Todos los tipos</option>${tipos.map((t) => `<option value="${esc(t.clave_calbas)}">${esc(t.nombre_calbas)}</option>`).join('')}</select>
          <select id="eq-depto" aria-label="Departamento"><option value="">Todos los departamentos</option>${deptos.map((d) => `<option value="${esc(d.id_calbas)}">${esc(d.nombre_calbas)}</option>`).join('')}</select>
          <select id="eq-estado" aria-label="Estado">
            <option value="">Todos los estados</option>
            <option value="cal_vencida">Calibración vencida</option><option value="cal_por_vencer">Calibración por vencer</option>
            <option value="cal_sin">Sin calibración</option><option value="ver_atrasada">Verificación atrasada</option>
            <option value="no_cumple">Último dictamen: no cumple</option><option value="inactivos">Inactivos</option>
          </select>
        </div>
        <div id="eq-table"></div>
      </div>`;
    if (params.tipo) el.querySelector('#eq-tipo').value = params.tipo;
    if (params.estado) el.querySelector('#eq-estado').value = params.estado;
    table = new DataTable(el.querySelector('#eq-table'), {
      rowKey: 'id_calbas',
      columns: [
        { label: 'Equipo', render: (e) => `<div class="eq-cell"><span class="eq-ico t-${esc(e.tipo_clave_calbas.toLowerCase())}">${icon(tipoIcono(e.tipo_clave_calbas, e.icono_calbas))}</span>
            <div><b class="cell-main">${esc(e.codigo_calbas)}</b><span class="cell-sub">${esc(e.tipo_nombre_calbas)}${e.descripcion_calbas ? ` · ${esc(e.descripcion_calbas)}` : ''}</span></div></div>` },
        { label: 'Ubicación', render: (e) => `<b class="cell-main">${esc(e.departamento_calbas || '—')}</b><span class="cell-sub">${esc(e.ubicacion_calbas || '')}</span>` },
        { label: 'Rango', render: (e) => (e.rango_max_calbas != null ? `<span class="mono">${fmtVal(e.rango_min_calbas ?? 0)}–${fmtVal(e.rango_max_calbas)} ${esc(U(e.unidad_calbas))}</span>` : `<span class="mono">${esc(U(e.unidad_calbas))}</span>`) },
        { label: 'Verificación', render: (e) => `${verPill(e.estado_verificacion_calbas)}<span class="cell-sub">${e.ultima_verificacion_calbas ? `Última ${fmtDate(e.ultima_verificacion_calbas)} · ${e.ultimo_dictamen_calbas === 'NO_CUMPLE' ? 'No cumple' : 'Cumple'}` : (e.frecuencia_verificacion_dias_calbas === 1 ? "Diaria" : `Cada ${e.frecuencia_verificacion_dias_calbas} días`)}</span>` },
        { label: 'Calibración', render: (e) => `${calPill(e.estado_calibracion_calbas)}<span class="cell-sub">${e.vencimiento_calibracion_calbas ? `Vence ${fmtDate(e.vencimiento_calibracion_calbas)}` : 'Sin certificado'}</span>` },
        { label: '', cls: 'actions', render: (e) => `<div class="row-actions">
            <button class="icon-btn" data-ficha="${e.id_calbas}" title="Ficha del equipo" aria-label="Ficha del equipo">${icon('file-text')}</button>
            ${e.activo_calbas ? `<button class="icon-btn" data-verif="${e.id_calbas}" data-origen="${e.origen_calbas}" title="Registrar verificación" aria-label="Registrar verificación">${icon('clipboard-plus')}</button>` : pill('Inactivo', 'gray')}
            ${state.isAdmin ? `<button class="icon-btn" data-editar="${e.id_calbas}" title="Editar" aria-label="Editar">${icon('pencil')}</button>` : ''}</div>` },
      ],
      empty: { ico: 'gauge', title: 'Sin equipos registrados', text: state.isAdmin ? 'Registra tu primer equipo con el botón “Nuevo equipo”.' : 'No hay equipos asignados a tus departamentos.' },
      fetch: async ({ from, to, filters: f }) => {
        let rows = todos;
        const q = sanitizeSearch(f.q).toLowerCase();
        if (q) rows = rows.filter((e) => [e.codigo_calbas, e.ubicacion_calbas, e.marca_calbas, e.modelo_calbas, e.numero_serie_calbas, e.descripcion_calbas, e.departamento_calbas]
          .some((x) => String(x || '').toLowerCase().includes(q)));
        if (f.tipo) rows = rows.filter((e) => e.tipo_clave_calbas === f.tipo);
        if (f.depto) rows = rows.filter((e) => e.departamento_id_calbas === f.depto);
        rows = rows.filter((e) => (f.estado === 'inactivos' ? !e.activo_calbas : e.activo_calbas));
        const filtros = {
          cal_vencida: (e) => e.estado_calibracion_calbas === 'vencida', cal_por_vencer: (e) => e.estado_calibracion_calbas === 'por_vencer',
          cal_sin: (e) => e.estado_calibracion_calbas === 'sin_registro', ver_atrasada: (e) => ['vencida', 'sin_registro'].includes(e.estado_verificacion_calbas),
          no_cumple: (e) => e.ultimo_dictamen_calbas === 'NO_CUMPLE',
        };
        if (filtros[f.estado]) rows = rows.filter(filtros[f.estado]);
        return { rows: rows.slice(from, to + 1), count: rows.length };
      },
    });
    const apply = () => table.setFilters({
      q: el.querySelector('#eq-q').value, tipo: el.querySelector('#eq-tipo').value,
      depto: el.querySelector('#eq-depto').value, estado: el.querySelector('#eq-estado').value,
    });
    el.querySelector('#eq-q').addEventListener('input', debounce(apply, 250));
    ['#eq-tipo', '#eq-depto', '#eq-estado'].forEach((s) => el.querySelector(s).addEventListener('change', apply));
    el.addEventListener('click', onClick);
    await recargar(apply);
    if (params.ficha) abrirFicha(params.ficha);
  },
  destroy() { root = null; table = null; },
};

async function recargar(apply) {
  todos = await cargarEquipos();
  if (!root) return;
  pintarTipos();
  await (apply ? apply() : table.load());
}

function pintarTipos() {
  const strip = root.querySelector('#eq-tipos');
  const activos = todos.filter((e) => e.activo_calbas);
  const grupos = {};
  activos.forEach((e) => { (grupos[e.tipo_clave_calbas] ||= { n: 0, alerta: 0, nombre: e.tipo_nombre_calbas, ico: tipoIcono(e.tipo_clave_calbas, e.icono_calbas) }).n++; });
  activos.forEach((e) => { if (e.estado_calibracion_calbas === 'vencida' || e.ultimo_dictamen_calbas === 'NO_CUMPLE') grupos[e.tipo_clave_calbas].alerta++; });
  const sel = root.querySelector('#eq-tipo').value;
  strip.innerHTML = `<button class="type-chip ${!sel ? 'on' : ''}" data-tipo=""><span class="tc-ico">${icon('layers')}</span><b>${activos.length}</b><span>Todos</span></button>`
    + Object.entries(grupos).map(([k, g]) => `<button class="type-chip ${sel === k ? 'on' : ''}" data-tipo="${esc(k)}"><span class="tc-ico t-${esc(k.toLowerCase())}">${icon(g.ico)}</span><b>${g.n}</b><span>${esc(g.nombre)}</span>${g.alerta ? `<em title="Con alertas">${g.alerta}</em>` : ''}</button>`).join('');
  refreshIcons();
}

async function onClick(e) {
  const t = e.target;
  const chip = t.closest('[data-tipo]');
  if (chip && chip.classList.contains('type-chip')) {
    root.querySelector('#eq-tipo').value = chip.dataset.tipo;
    root.querySelector('#eq-tipo').dispatchEvent(new Event('change'));
    pintarTipos(); return;
  }
  const b = t.closest('[data-eq],[data-ficha],[data-verif],[data-editar]');
  if (!b) return;
  if (b.dataset.eq === 'nuevo') { if (await abrirFormEquipo()) await recargar(); return; }
  if (b.dataset.eq === 'tipos') { await gestionarTipos(); return; }
  if (b.dataset.ficha) { abrirFicha(b.dataset.ficha); return; }
  if (b.dataset.verif) { navigate(`#/verificar?equipo=${b.dataset.verif}`); return; }
  if (b.dataset.editar) { const eq = todos.find((x) => x.id_calbas === b.dataset.editar); if (await abrirFormEquipo(eq)) await recargar(); }
}

// ---------------- Ficha técnica ----------------
async function abrirFicha(id) {
  let e = todos.find((x) => x.id_calbas === id);
  if (!e) { const { data } = await sb.from('vw_equipos_calbas').select('*').eq('id_calbas', id).maybeSingle(); e = data; }
  if (!e) { toast('No se encontró el equipo.', 'warning'); return; }
  const [{ data: ver }, { data: cal }, det] = await Promise.all([
    sb.from('vw_verificaciones_todas_calbas').select('*').eq('equipo_id_calbas', id).order('fecha_calbas', { ascending: false }).order('created_at_calbas', { ascending: false }).limit(8),
    sb.from('vw_calibraciones_todas_calbas').select('*').eq('equipo_id_calbas', id).order('fecha_calibracion_calbas', { ascending: false }).limit(6),
    e.origen_calbas === 'bascula' ? sb.from('basculas_calbas').select('*').eq('id_calbas', id).maybeSingle() : sb.from('equipos_calbas').select('*').eq('id_calbas', id).maybeSingle(),
  ]);
  const d = det.data || {};
  const u = U(d.unidad_calbas || e.unidad_calbas);
  const tec = e.origen_calbas === 'bascula'
    ? [['Clase de exactitud', CLASES[d.clase_exactitud_calbas]], ['Capacidad', `${fmtVal(d.capacidad_minima_calbas)} – ${fmtVal(d.capacidad_maxima_calbas)} ${u}`],
       ['División mínima (d)', `${fmtVal(d.division_minima_calbas)} ${u}`], ['División de verificación (e)', `${fmtVal(d.division_verificacion_e_calbas)} ${u}`],
       ['Criterio configurado', CRITERIOS[d.criterio_evaluacion_calbas]], ['Unidad de la báscula', u]]
    : [['Magnitud', e.magnitud_calbas], ['Rango', d.rango_max_calbas != null ? `${fmtVal(d.rango_min_calbas ?? 0)} – ${fmtVal(d.rango_max_calbas)} ${u}` : '—'],
       ['Resolución', d.resolucion_calbas ? `${fmtVal(d.resolucion_calbas)} ${u}` : '—'],
       ['Tolerancia', d.tolerancia_tipo_calbas === 'PORCENTAJE' ? `± ${fmtVal(d.tolerancia_calbas)} % de la referencia` : `± ${fmtVal(d.tolerancia_calbas)} ${u}`],
       ['CV máximo', d.cv_max_pct_calbas ? `${fmtVal(d.cv_max_pct_calbas)} %` : 'No aplica'],
       ['Calibrar cada', `${d.frecuencia_calibracion_dias_calbas} días`]];
  const gen = [['Departamento', e.departamento_calbas], ['Ubicación', e.ubicacion_calbas], ['Marca', e.marca_calbas], ['Modelo', e.modelo_calbas],
    ['Número de serie', e.numero_serie_calbas], ['Verificar cada', e.frecuencia_verificacion_dias_calbas === 1 ? 'Diario' : `${e.frecuencia_verificacion_dias_calbas} días`]];
  const tiles = (rows) => `<dl class="info-tiles">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v || '—')}</dd></div>`).join('')}</dl>`;
  // En básculas el promedio se muestra en la unidad de la pesa patrón
  const prom = (v) => (v.origen_calbas === 'bascula' ? `${fmtVal(convertirMasa(v.promedio_lecturas_calbas, v.unidad_calbas, v.unidad_referencia_calbas))} ${U(v.unidad_referencia_calbas)}` : `${fmtVal(v.promedio_lecturas_calbas)} ${U(v.unidad_calbas)}`);
  const ult = ver?.find((v) => v.estado_calbas === 'vigente');
  const stat = (cls, ico, label, value, sub) => `<div class="ficha-stat ${cls}"><span class="fs-ico">${icon(ico)}</span><div><small>${esc(label)}</small><b>${esc(value)}</b><span>${esc(sub)}</span></div></div>`;
  const dCal = e.dias_calibracion_calbas;
  await openModal({
    title: `${e.codigo_calbas} · ${e.tipo_nombre_calbas}`,
    subtitle: e.descripcion_calbas || '', size: 'lg',
    body: `<div class="ficha-hero">
        <span class="eq-ico xl t-${esc(e.tipo_clave_calbas.toLowerCase())}">${icon(tipoIcono(e.tipo_clave_calbas, e.icono_calbas))}</span>
        <div class="fh-txt"><b>${esc(e.codigo_calbas)}</b><span>${esc([e.tipo_nombre_calbas, e.departamento_calbas, e.ubicacion_calbas].filter(Boolean).join(' · '))}</span>
          <div class="ficha-status">${verPill(e.estado_verificacion_calbas)} ${calPill(e.estado_calibracion_calbas)} ${e.activo_calbas ? pill('Activo', 'info') : pill('Inactivo', 'gray')}</div></div>
        <div class="fh-actions">
          ${e.activo_calbas ? `<button type="button" class="btn orange sm" data-go="#/verificar?equipo=${e.id_calbas}">${icon('clipboard-plus')} Verificar</button>` : ''}
          <button type="button" class="btn teal sm" data-go="#/historial?equipo=${e.id_calbas}">${icon('history')} Historial</button>
        </div>
      </div>
      <div class="ficha-stats">
        ${stat(ult ? (ult.dictamen_calbas === 'CUMPLE' ? 'ok' : 'bad') : 'gray', 'clipboard-check', 'Última verificación', ult ? fmtDate(ult.fecha_calbas) : 'Nunca', ult ? (ult.dictamen_calbas === 'CUMPLE' ? 'Cumple' : 'No cumple') : 'Sin registros')}
        ${stat(e.estado_verificacion_calbas === 'vencida' ? 'bad' : 'info', 'calendar-clock', 'Próxima verificación', e.proxima_verificacion_calbas ? fmtDate(e.proxima_verificacion_calbas) : 'Pendiente', e.estado_verificacion_calbas === 'vencida' ? 'Atrasada' : 'Según frecuencia')}
        ${stat(e.estado_calibracion_calbas === 'vencida' ? 'bad' : e.estado_calibracion_calbas === 'por_vencer' ? 'warn' : e.estado_calibracion_calbas === 'vigente' ? 'ok' : 'gray', 'badge-check', 'Calibración vence', e.vencimiento_calibracion_calbas ? fmtDate(e.vencimiento_calibracion_calbas) : 'Sin certificado',
          dCal == null ? 'Registra un certificado' : dCal < 0 ? `Vencida hace ${-dCal} días` : `En ${dCal} días`)}
      </div>
      <div class="ficha-cols">
        <section class="ficha-card"><h4>${icon('info')} Datos generales</h4>${tiles(gen)}</section>
        <section class="ficha-card"><h4>${icon('ruler')} Parámetros metrológicos</h4>${tiles(tec)}</section>
      </div>
      <section class="ficha-card mt"><h4>${icon('clipboard-list')} Últimas verificaciones</h4>
      ${ver?.length ? `<div class="table-wrap"><table class="table compact"><thead><tr><th>Fecha</th><th>Patrón</th><th>Promedio</th><th>Error</th><th>Tolerancia</th><th>Dictamen</th></tr></thead><tbody>
        ${ver.map((v) => `<tr><td>${fmtDate(v.fecha_calbas)}</td><td class="mono">${fmtVal(v.valor_referencia_calbas)} ${esc(U(v.unidad_referencia_calbas))}</td><td class="mono">${esc(prom(v))}</td>
          <td class="mono">${fmtSigned(v.error_calbas)} ${esc(U(v.unidad_calculo_calbas))}</td><td class="mono">± ${fmtVal(v.tolerancia_calbas, 4)} ${esc(U(v.unidad_calculo_calbas))}</td><td>${dictamenPill(v.dictamen_calbas, v.estado_calbas)}</td></tr>`).join('')}</tbody></table></div>`
        : '<p class="hint center">Aún no hay verificaciones registradas.</p>'}</section>
      <section class="ficha-card mt"><h4>${icon('file-badge')} Calibraciones</h4>
      ${cal?.length ? `<div class="table-wrap"><table class="table compact"><thead><tr><th>Calibración</th><th>Vence</th><th>Certificado</th><th>Laboratorio</th><th>Archivo</th></tr></thead><tbody>
        ${cal.map((c) => `<tr><td>${fmtDate(c.fecha_calibracion_calbas)}</td><td>${fmtDate(c.fecha_vencimiento_calbas)}</td><td>${esc(c.numero_certificado_calbas || '—')}</td><td>${esc(c.proveedor_laboratorio_calbas || '—')}</td>
          <td>${c.archivo_url_calbas ? `<button type="button" class="btn teal sm" data-cert="${esc(c.archivo_url_calbas)}">${icon('paperclip')} Ver</button>` : '—'}</td></tr>`).join('')}</tbody></table></div>`
        : '<p class="hint center">Sin calibraciones registradas.</p>'}</section>`,
    onOpen: ({ wrap, close }) => {
      wrap.addEventListener('click', (ev) => {
        const c = ev.target.closest('[data-cert]'); if (c) abrirCertificado(c.dataset.cert);
        const g = ev.target.closest('[data-go]'); if (g) { close(); navigate(g.dataset.go); }
      });
    },
  });
}

// ---------------- Alta / edición ----------------
export async function abrirFormEquipo(eq = null) {
  const tipos = await getTipos();
  const deptos = (await getDepartamentos()).filter((d) => d.activo_calbas || d.id_calbas === eq?.departamento_id_calbas);
  let tipo = eq ? tipos.find((t) => t.clave_calbas === eq.tipo_clave_calbas) : null;
  if (!tipo) {
    tipo = await openModal({
      title: 'Nuevo equipo', subtitle: 'Selecciona el tipo de instrumento a registrar.', size: 'md', confirmDiscard: false, submitText: 'Continuar',
      body: `<div class="tipo-grid">${tipos.filter((t) => t.activo_calbas !== false).map((t, i) => `<label class="tipo-opt"><input type="radio" name="tipo" value="${esc(t.clave_calbas)}" ${i === 0 ? 'checked' : ''}>
        <span class="tipo-card"><span class="eq-ico lg t-${esc(t.clave_calbas.toLowerCase())}">${icon(tipoIcono(t.clave_calbas, t.icono_calbas))}</span>
          <span class="tipo-txt"><b>${esc(t.nombre_calbas)}</b><span>${esc(t.magnitud_calbas)} · ${esc(t.unidades_calbas.map(U).join(', '))}</span></span>
          <span class="tipo-check">${icon('check')}</span></span></label>`).join('')}</div>`,
      onSubmit: ({ form }) => tipos.find((t) => t.clave_calbas === form.elements.tipo.value),
    });
    if (!tipo) return false;
  }
  const d = eq ? (await (eq.origen_calbas === 'bascula'
    ? sb.from('basculas_calbas').select('*').eq('id_calbas', eq.id_calbas).single()
    : sb.from('equipos_calbas').select('*').eq('id_calbas', eq.id_calbas).single()).then(must)).data : {};
  return tipo.clave_calbas === 'BASCULA' ? formBascula(d, deptos) : formGenerico(d, tipo, deptos);
}

const deptoOpts = (deptos, sel) => `<option value="">Selecciona…</option>${deptos.map((x) => `<option value="${esc(x.id_calbas)}" ${x.id_calbas === sel ? 'selected' : ''}>${esc(x.nombre_calbas)}</option>`).join('')}`;
const fld = (name, label, val, attrs = '', req = false) => `<div class="field"><label for="f-${name}">${esc(label)}${req ? ' <span class="req">*</span>' : ''}</label><input id="f-${name}" name="${name}" value="${esc(val ?? '')}" ${req ? 'required' : ''} ${attrs}></div>`;
const num = (name, label, val, req = false, extra = '') => fld(name, label, val, `type="number" step="any" inputmode="decimal" ${extra}`, req);
const comunes = (d, deptos) => `
  ${fld('codigo_calbas', 'Código', d.codigo_calbas, 'maxlength="40" autocomplete="off"', true)}
  <div class="field"><label for="f-depto">Departamento <span class="req">*</span></label><select id="f-depto" name="departamento_id_calbas" required>${deptoOpts(deptos, d.departamento_id_calbas)}</select></div>
  ${fld('ubicacion_calbas', 'Ubicación', d.ubicacion_calbas, 'maxlength="120"')}
  ${fld('marca_calbas', 'Marca', d.marca_calbas, 'maxlength="80"')}
  ${fld('modelo_calbas', 'Modelo', d.modelo_calbas, 'maxlength="80"')}
  ${fld('numero_serie_calbas', 'Número de serie', d.numero_serie_calbas, 'maxlength="80"')}`;
const activoSwitch = (on) => `<label class="switch-row full"><input type="checkbox" name="activo" ${on !== false ? 'checked' : ''}> <span><b>Equipo activo</b><small>Los equipos inactivos no aparecen para verificar, pero conservan su historial.</small></span></label>`;
const n = (v) => (v === '' || v == null ? null : Number(v));

async function formBascula(d, deptos) {
  const editar = !!d.id_calbas;
  return openModal({
    title: editar ? `Editar báscula ${d.codigo_calbas}` : 'Nueva báscula / balanza',
    subtitle: 'Parámetros metrológicos usados para calcular el EMT (error máximo tolerado).', size: 'lg',
    body: `<div class="form-grid">${comunes(d, deptos)}
      <div class="field"><label for="f-unidad">Unidad <span class="req">*</span></label><select id="f-unidad" name="unidad_calbas" required>${['kg', 'g'].map((u) => `<option value="${u}" ${d.unidad_calbas === u ? 'selected' : ''}>${U(u)}</option>`).join('')}</select></div>
      <div class="field"><label for="f-clase">Clase de exactitud <span class="req">*</span></label><select id="f-clase" name="clase_exactitud_calbas" required>${Object.entries(CLASES).map(([k, v]) => `<option value="${k}" ${(d.clase_exactitud_calbas || 'CLASE_III') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      ${num('capacidad_maxima_calbas', 'Capacidad máxima', d.capacidad_maxima_calbas, true, 'min="0"')}
      ${num('capacidad_minima_calbas', 'Capacidad mínima', d.capacidad_minima_calbas, true, 'min="0"')}
      ${num('division_minima_calbas', 'División mínima d', d.division_minima_calbas, true, 'min="0"')}
      ${num('division_verificacion_e_calbas', 'División de verificación e', d.division_verificacion_e_calbas, true, 'min="0"')}
      <div class="field"><label for="f-crit">Criterio de la primera verificación</label><select id="f-crit" name="criterio_evaluacion_calbas">${Object.entries(CRITERIOS).map(([k, v]) => `<option value="${k}" ${(d.criterio_evaluacion_calbas || 'EN_SERVICIO') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      ${num('frecuencia_dias_calbas', 'Verificar cada (días)', d.frecuencia_dias_calbas ?? 7, true, 'min="1" step="1"')}
      ${activoSwitch(d.activa_calbas)}
      <p class="hint full">No confundas la capacidad mínima con la división mínima. Los valores se guardan en la unidad de la báscula; el sistema convierte a gramos para el cálculo.</p></div>`,
    onSubmit: async ({ form }) => {
      if (!checkForm(form, {
        capacidad_maxima_calbas: (v) => (Number(v) > 0 ? '' : 'Debe ser mayor que cero.'),
        capacidad_minima_calbas: (v, f) => (Number(v) > 0 && Number(v) < Number(f.capacidad_maxima_calbas.value) ? '' : 'Debe ser mayor que cero y menor que la máxima.'),
        division_minima_calbas: (v) => (Number(v) > 0 ? '' : 'Debe ser mayor que cero.'),
        division_verificacion_e_calbas: (v) => (Number(v) > 0 ? '' : 'Debe ser mayor que cero.'),
      })) return false;
      const v = formValues(form);
      const row = {
        codigo_calbas: v.codigo_calbas.toUpperCase(), departamento_id_calbas: v.departamento_id_calbas, ubicacion_calbas: nullIfEmpty(v.ubicacion_calbas),
        marca_calbas: nullIfEmpty(v.marca_calbas), modelo_calbas: nullIfEmpty(v.modelo_calbas), numero_serie_calbas: nullIfEmpty(v.numero_serie_calbas),
        unidad_calbas: v.unidad_calbas, clase_exactitud_calbas: v.clase_exactitud_calbas, capacidad_maxima_calbas: n(v.capacidad_maxima_calbas),
        capacidad_minima_calbas: n(v.capacidad_minima_calbas), division_minima_calbas: n(v.division_minima_calbas),
        division_verificacion_e_calbas: n(v.division_verificacion_e_calbas), criterio_evaluacion_calbas: v.criterio_evaluacion_calbas,
        frecuencia_dias_calbas: n(v.frecuencia_dias_calbas), activa_calbas: form.elements.activo.checked,
      };
      if (editar) must(await sb.from('basculas_calbas').update(row).eq('id_calbas', d.id_calbas));
      else must(await sb.from('basculas_calbas').insert({ ...row, created_by_calbas: state.session.user.id }));
      toast(editar ? 'Báscula actualizada.' : 'Báscula registrada.', 'success');
    },
  });
}

async function formGenerico(d, tipo, deptos) {
  const editar = !!d.id_calbas;
  const tolTipo = d.tolerancia_tipo_calbas || tipo.tolerancia_tipo_sugerida_calbas || 'ABSOLUTA';
  return openModal({
    title: editar ? `Editar ${tipo.nombre_calbas.toLowerCase()} ${d.codigo_calbas}` : `Nuevo ${tipo.nombre_calbas.toLowerCase()}`,
    subtitle: tipo.guia_calbas || '', size: 'lg',
    body: `<div class="form-grid">${comunes({ codigo_calbas: editar ? d.codigo_calbas : `${tipo.prefijo_codigo_calbas}-`, ...d }, deptos)}
      ${fld('descripcion_calbas', 'Descripción', d.descripcion_calbas, 'maxlength="140" placeholder="Ej. Termómetro de punzón para cámara fría"')}
      <div class="field"><label for="f-unidad">Unidad <span class="req">*</span></label><select id="f-unidad" name="unidad_calbas" required>${tipo.unidades_calbas.map((u) => `<option ${d.unidad_calbas === u ? 'selected' : ''}>${esc(u)}</option>`).join('')}</select></div>
      ${num('rango_min_calbas', 'Rango mínimo', d.rango_min_calbas)}
      ${num('rango_max_calbas', 'Rango máximo', d.rango_max_calbas)}
      ${num('resolucion_calbas', 'Resolución', d.resolucion_calbas, false, 'min="0"')}
      <div class="field"><label for="f-toltipo">Tipo de tolerancia</label><select id="f-toltipo" name="tolerancia_tipo_calbas"><option value="ABSOLUTA" ${tolTipo === 'ABSOLUTA' ? 'selected' : ''}>Absoluta (± en la unidad del equipo)</option><option value="PORCENTAJE" ${tolTipo === 'PORCENTAJE' ? 'selected' : ''}>Porcentaje del valor de referencia</option></select></div>
      ${num('tolerancia_calbas', 'Tolerancia (±)', d.tolerancia_calbas ?? tipo.tolerancia_sugerida_calbas, true, 'min="0"')}
      ${num('cv_max_pct_calbas', 'CV máximo % (repetibilidad, opcional)', d.cv_max_pct_calbas, false, 'min="0"')}
      ${num('frecuencia_verificacion_dias_calbas', 'Verificar cada (días)', d.frecuencia_verificacion_dias_calbas ?? 30, true, 'min="1" step="1"')}
      ${num('frecuencia_calibracion_dias_calbas', 'Calibrar cada (días)', d.frecuencia_calibracion_dias_calbas ?? 365, true, 'min="1" step="1"')}
      ${activoSwitch(d.activo_calbas)}
      <p class="hint full">La tolerancia debe provenir del procedimiento interno, la norma aplicable o la especificación del fabricante. El valor sugerido es solo un punto de partida.</p></div>`,
    onSubmit: async ({ form }) => {
      if (!checkForm(form, {
        tolerancia_calbas: (v) => (Number(v) > 0 ? '' : 'Debe ser mayor que cero.'),
        rango_max_calbas: (v, f) => (v !== '' && f.rango_min_calbas.value !== '' && Number(v) <= Number(f.rango_min_calbas.value) ? 'Debe ser mayor que el mínimo.' : ''),
      })) return false;
      const v = formValues(form);
      const row = {
        tipo_id_calbas: tipo.id_calbas, codigo_calbas: v.codigo_calbas.toUpperCase(), departamento_id_calbas: v.departamento_id_calbas,
        descripcion_calbas: nullIfEmpty(v.descripcion_calbas), ubicacion_calbas: nullIfEmpty(v.ubicacion_calbas), marca_calbas: nullIfEmpty(v.marca_calbas),
        modelo_calbas: nullIfEmpty(v.modelo_calbas), numero_serie_calbas: nullIfEmpty(v.numero_serie_calbas), unidad_calbas: v.unidad_calbas,
        rango_min_calbas: n(v.rango_min_calbas), rango_max_calbas: n(v.rango_max_calbas), resolucion_calbas: n(v.resolucion_calbas),
        tolerancia_calbas: n(v.tolerancia_calbas), tolerancia_tipo_calbas: v.tolerancia_tipo_calbas, cv_max_pct_calbas: n(v.cv_max_pct_calbas),
        frecuencia_verificacion_dias_calbas: n(v.frecuencia_verificacion_dias_calbas), frecuencia_calibracion_dias_calbas: n(v.frecuencia_calibracion_dias_calbas),
        activo_calbas: form.elements.activo.checked,
      };
      if (editar) must(await sb.from('equipos_calbas').update(row).eq('id_calbas', d.id_calbas));
      else must(await sb.from('equipos_calbas').insert(row));
      toast(editar ? 'Equipo actualizado.' : 'Equipo registrado.', 'success');
    },
  });
}

// ---------------- Tipos de equipo ----------------
async function gestionarTipos() {
  const tipos = await getTipos({ force: true, conBascula: false });
  const ICONOS = ['thermometer', 'flask-conical', 'pipette', 'droplets', 'gauge', 'timer', 'ruler', 'zap', 'wind', 'microscope', 'activity'];
  await openModal({
    title: 'Tipos de equipo', subtitle: 'Las básculas tienen su propio módulo con cálculo de EMT. Aquí puedes agregar otros instrumentos.', size: 'lg',
    body: `<div class="table-wrap"><table class="table compact"><thead><tr><th>Tipo</th><th>Magnitud</th><th>Unidades</th><th>Tolerancia sugerida</th><th>Estado</th></tr></thead><tbody>
      ${tipos.map((t) => `<tr><td><b>${esc(t.nombre_calbas)}</b><span class="cell-sub">${esc(t.clave_calbas)} · prefijo ${esc(t.prefijo_codigo_calbas)}</span></td><td>${esc(t.magnitud_calbas)}</td><td>${esc(t.unidades_calbas.join(', '))}</td>
        <td>${t.tolerancia_sugerida_calbas ? `± ${fmtVal(t.tolerancia_sugerida_calbas)}${t.tolerancia_tipo_sugerida_calbas === 'PORCENTAJE' ? ' %' : ''}` : '—'}</td><td>${t.activo_calbas ? pill('Activo', 'ok') : pill('Inactivo', 'gray')}</td></tr>`).join('')}
      </tbody></table></div>
      <details class="mt"><summary class="btn secondary sm">${icon('plus')} Agregar tipo de equipo</summary>
      <div class="form-grid mt" id="nt-form">
        ${fld('nt_nombre', 'Nombre', '', 'maxlength="80" placeholder="Ej. Cronómetro"')}
        ${fld('nt_clave', 'Clave', '', 'maxlength="40" placeholder="CRONOMETRO" pattern="[A-Z][A-Z0-9_]+" data-pattern-msg="Mayúsculas sin acentos ni espacios (use _)."')}
        ${fld('nt_magnitud', 'Magnitud', '', 'maxlength="60" placeholder="Tiempo"')}
        ${fld('nt_unidades', 'Unidades (separadas por coma)', '', 'maxlength="60" placeholder="s, min"')}
        ${fld('nt_prefijo', 'Prefijo de código', '', 'maxlength="5" placeholder="CRO" pattern="[A-Z]{2,5}" data-pattern-msg="2 a 5 letras mayúsculas."')}
        <div class="field"><label for="f-nt_icono">Ícono</label><select id="f-nt_icono" name="nt_icono">${ICONOS.map((i) => `<option>${i}</option>`).join('')}</select></div>
        ${num('nt_tol', 'Tolerancia sugerida', '')}
        <div class="field"><label for="f-nt_toltipo">Tipo de tolerancia</label><select id="f-nt_toltipo" name="nt_toltipo"><option value="ABSOLUTA">Absoluta</option><option value="PORCENTAJE">Porcentaje</option></select></div>
        <label class="switch-row"><input type="checkbox" name="nt_neg"> <span><b>Admite valores negativos</b></span></label>
      </div></details>`,
    submitText: 'Guardar tipo nuevo',
    onSubmit: async ({ form }) => {
      const f = form.elements;
      if (!f.nt_nombre.value.trim()) { toast('Para agregar un tipo captura al menos el nombre.', 'warning'); return false; }
      ['nt_nombre', 'nt_clave', 'nt_magnitud', 'nt_unidades', 'nt_prefijo'].forEach((k) => { f[k].required = true; });
      if (!checkForm(form)) return false;
      must(await sb.from('tipos_equipo_calbas').insert({
        nombre_calbas: f.nt_nombre.value.trim(), clave_calbas: f.nt_clave.value.trim().toUpperCase(), magnitud_calbas: f.nt_magnitud.value.trim(),
        unidades_calbas: f.nt_unidades.value.split(',').map((u) => u.trim()).filter(Boolean), prefijo_codigo_calbas: f.nt_prefijo.value.trim().toUpperCase(),
        icono_calbas: f.nt_icono.value, tolerancia_sugerida_calbas: n(f.nt_tol.value), tolerancia_tipo_sugerida_calbas: f.nt_toltipo.value,
        permite_negativos_calbas: f.nt_neg.checked,
      }));
      invalidarCatalogos();
      toast('Tipo de equipo agregado.', 'success');
    },
  });
  invalidarCatalogos();
}

ganchos.abrirFichaEquipo = abrirFicha;
