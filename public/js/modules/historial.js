// =====================================================================
// Historial de verificaciones de todos los equipos: filtros, exportación,
// detalle con tendencia del error, seguimiento (acción correctiva) de los
// «no cumple» y anulación con motivo (administradores).
// Los registros nunca se borran: la anulación queda en la bitácora.
// =====================================================================
import {
  sb, state, esc, icon, toast, openModal, confirmDialog, must, DataTable, paged, sanitizeSearch, debounce,
  fmtDate, fmtDateTime, fmtVal, fmtSigned, dictamenPill, getTipos, getDepartamentos, CLASES, CRITERIOS,
  toCSV, descargar, todayISO, addDays, makeChart, PALETTE, cssVar, errMsg, refreshIcons,
  U, convertirMasa, ACCIONES, segPill, avatarHTML, fotoDe,
} from '../core.js';

let root, table, perfiles = {};
// Persona que registró la verificación (foto, nombre y correo)
function registro(v) {
  const p = perfiles[v.supervisor_id_calbas];
  const nombre = p?.nombre_completo_calbas || v.supervisor_calbas || '—';
  return `<div class="user-cell sm">${avatarHTML(nombre, p ? fotoDe(p.correo_calbas, p.avatar_url_calbas) : '')}<div class="user-txt"><b>${esc(nombre)}</b></div></div>`;
}
const VW = 'vw_verificaciones_todas_calbas';

// En básculas el promedio se guarda en la unidad de la báscula; se muestra en la unidad de la pesa patrón
const enRef = (v, x) => (v.origen_calbas === 'bascula' ? convertirMasa(x, v.unidad_calbas, v.unidad_referencia_calbas) : x);
const uLect = (v) => U(v.origen_calbas === 'bascula' ? v.unidad_referencia_calbas : v.unidad_calbas);

async function idsSeguimiento(estado) {
  let q = sb.from('vw_no_cumple_calbas').select('id_calbas');
  q = estado === 'cerrado' ? q.eq('estado_seguimiento_calbas', 'cerrado') : q.neq('estado_seguimiento_calbas', 'cerrado');
  const { data } = must(await q);
  return data.map((x) => x.id_calbas);
}

async function aplicarFiltros(q, f) {
  const s = sanitizeSearch(f.q);
  if (s) q = q.or(`equipo_codigo_calbas.ilike.*${s}*,ubicacion_calbas.ilike.*${s}*,supervisor_calbas.ilike.*${s}*`);
  if (f.tipo) q = q.eq('tipo_clave_calbas', f.tipo);
  if (f.depto) q = q.eq('departamento_id_calbas', f.depto);
  if (f.dictamen) q = q.eq('dictamen_calbas', f.dictamen);
  q = f.anuladas ? q.eq('estado_calbas', 'anulada') : q.eq('estado_calbas', 'vigente');
  if (f.desde) q = q.gte('fecha_calbas', f.desde);
  if (f.hasta) q = q.lte('fecha_calbas', f.hasta);
  if (f.equipo) q = q.eq('equipo_id_calbas', f.equipo);
  if (f.seguimiento) {
    const ids = await idsSeguimiento(f.seguimiento);
    q = q.in('id_calbas', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
  }
  // Se envuelve: una consulta de Supabase es "thenable" y un async la ejecutaría al devolverla
  return { q };
}

// Seguimientos de las filas visibles (solo «no cumple»)
async function adjuntarSeguimientos(rows) {
  const nc = rows.filter((r) => r.dictamen_calbas === 'NO_CUMPLE' && r.estado_calbas === 'vigente');
  if (!nc.length) return rows;
  const { data } = await sb.from('seguimientos_calbas').select('*').in('verificacion_id_calbas', nc.map((r) => r.id_calbas));
  const map = Object.fromEntries((data || []).map((s) => [`${s.origen_calbas}:${s.verificacion_id_calbas}`, s]));
  nc.forEach((r) => { r._seg = map[`${r.origen_calbas}:${r.id_calbas}`] || null; });
  return rows;
}
const estadoSeg = (v) => (v.dictamen_calbas !== 'NO_CUMPLE' || v.estado_calbas !== 'vigente' ? null : v._seg?.estado_calbas || 'sin_seguimiento');

export default {
  async render(el, params = {}) {
    root = el;
    const [tipos, deptos, { data: pf }] = await Promise.all([getTipos(), getDepartamentos(), sb.from('perfiles_calbas').select('id_calbas, nombre_completo_calbas, correo_calbas, avatar_url_calbas')]);
    perfiles = Object.fromEntries((pf || []).map((p) => [p.id_calbas, p]));
    el.innerHTML = `
      <section class="page-intro">
        <div><span class="eyebrow">Registros</span><h1>Historial de verificaciones</h1>
          <p>Consulta, filtra y exporta las verificaciones. Los «no cumple» requieren una acción correctiva y su cierre.</p></div>
        <div class="page-actions"><button class="btn green" data-h="csv">${icon('file-spreadsheet')} Exportar a Excel (CSV)</button></div>
      </section>
      <div class="card">
        <div class="toolbar">
          <div class="search">${icon('search')}<input type="search" id="h-q" placeholder="Equipo, ubicación o responsable" aria-label="Buscar"></div>
          <select id="h-tipo" aria-label="Tipo"><option value="">Todos los tipos</option>${tipos.map((t) => `<option value="${esc(t.clave_calbas)}">${esc(t.nombre_calbas)}</option>`).join('')}</select>
          <select id="h-depto" aria-label="Departamento"><option value="">Todos los departamentos</option>${deptos.map((d) => `<option value="${esc(d.id_calbas)}">${esc(d.nombre_calbas)}</option>`).join('')}</select>
          <select id="h-dict" aria-label="Dictamen"><option value="">Todos los dictámenes</option><option value="CUMPLE">Cumple</option><option value="NO_CUMPLE">No cumple</option></select>
          <select id="h-seg" aria-label="Seguimiento"><option value="">Cualquier seguimiento</option><option value="pendiente">«No cumple» sin cerrar</option><option value="cerrado">«No cumple» cerrados</option></select>
          <span class="date-range"><input type="date" id="h-desde" aria-label="Desde"> a <input type="date" id="h-hasta" aria-label="Hasta"></span>
          <label class="check"><input type="checkbox" id="h-anul"> Anuladas</label>
        </div>
        <div id="h-table"></div>
      </div>`;
    if (params.seguimiento) { el.querySelector('#h-seg').value = params.seguimiento; el.querySelector('#h-desde').value = ''; }
    else el.querySelector('#h-desde').value = params.desde || addDays(todayISO(), -89);
    if (params.dictamen) el.querySelector('#h-dict').value = params.dictamen;
    table = new DataTable(el.querySelector('#h-table'), {
      rowKey: 'id_calbas', sort: { key: 'fecha_calbas', asc: false },
      columns: [
        { label: 'Fecha', sort: 'fecha_calbas', render: (v) => `<b class="cell-main">${fmtDate(v.fecha_calbas)}</b><span class="cell-sub">${fmtDateTime(v.created_at_calbas).slice(-5)} h</span>` },
        { label: 'Registró', cls: 'col-user', render: (v) => registro(v) },
        { label: 'Equipo', sort: 'equipo_codigo_calbas', render: (v) => `<b class="cell-main">${esc(v.equipo_codigo_calbas)}</b><span class="cell-sub">${esc(v.tipo_nombre_calbas)} · ${esc(v.departamento_calbas || '')}</span>` },
        { label: 'Patrón', render: (v) => `<span class="mono">${fmtVal(v.valor_referencia_calbas)} ${esc(U(v.unidad_referencia_calbas))}</span><span class="cell-sub">${esc(v.patron_codigo_calbas || '')}</span>` },
        { label: 'Promedio', render: (v) => `<span class="mono">${fmtVal(enRef(v, v.promedio_lecturas_calbas))} ${esc(uLect(v))}</span>` },
        { label: 'Error / tolerancia', render: (v) => `<span class="mono">${fmtSigned(v.error_calbas)} ${esc(U(v.unidad_calculo_calbas))}</span><span class="cell-sub">± ${fmtVal(v.tolerancia_calbas, 4)} ${esc(U(v.unidad_calculo_calbas))}</span>` },
        { label: 'Dictamen', sort: 'dictamen_calbas', render: (v) => dictamenPill(v.dictamen_calbas, v.estado_calbas) },
        { label: 'Seguimiento', render: (v) => (estadoSeg(v) ? segPill(estadoSeg(v)) : '<span class="cell-sub">No aplica</span>') },
        { label: '', cls: 'actions', render: (v) => `<button class="icon-btn" data-det="${v.id_calbas}" title="Detalle" aria-label="Detalle">${icon(estadoSeg(v) && estadoSeg(v) !== 'cerrado' ? 'wrench' : 'eye')}</button>` },
      ],
      empty: { ico: 'clipboard-list', title: 'Sin verificaciones', text: 'No hay verificaciones con los filtros seleccionados.' },
      fetch: async ({ from, to, sort, filters }) => {
        const { q } = await aplicarFiltros(sb.from(VW).select('*', { count: 'exact' }), filters);
        const { data, count } = must(await paged(q, { from, to, sort }, [['created_at_calbas', false]]));
        return { rows: await adjuntarSeguimientos(data), count };
      },
    });
    const apply = () => table.setFilters(filtros());
    el.querySelector('#h-q').addEventListener('input', debounce(apply, 350));
    ['#h-tipo', '#h-depto', '#h-dict', '#h-seg', '#h-desde', '#h-hasta', '#h-anul'].forEach((s) => el.querySelector(s).addEventListener('change', apply));
    el.addEventListener('click', async (e) => {
      if (e.target.closest('[data-h="csv"]')) return exportar();
      const d = e.target.closest('[data-det]');
      if (d) { if (await detalle(table.row(d.dataset.det))) table.load(); }
    });
    await table.setFilters({ ...filtros(), equipo: params.equipo || '' });
  },
  destroy() { root = null; table = null; },
};

function filtros() {
  const v = (s) => root.querySelector(s).value;
  return { q: v('#h-q'), tipo: v('#h-tipo'), depto: v('#h-depto'), dictamen: v('#h-dict'), seguimiento: v('#h-seg'),
    desde: v('#h-desde'), hasta: v('#h-hasta'), anuladas: root.querySelector('#h-anul').checked };
}

async function exportar() {
  try {
    const f = { ...table.filters };
    const rows = [];
    for (let from = 0; from < 50000; from += 1000) {
      const { q } = await aplicarFiltros(sb.from(VW).select('*'), f);
      const { data } = must(await q.order('fecha_calbas', { ascending: false }).range(from, from + 999));
      rows.push(...data);
      if (data.length < 1000) break;
    }
    if (!rows.length) { toast('No hay registros para exportar.', 'warning'); return; }
    const csv = toCSV(rows, [
      { label: 'Fecha', get: (r) => r.fecha_calbas }, { label: 'Tipo', get: (r) => r.tipo_nombre_calbas }, { label: 'Equipo', get: (r) => r.equipo_codigo_calbas },
      { label: 'Departamento', get: (r) => r.departamento_calbas }, { label: 'Ubicación', get: (r) => r.ubicacion_calbas },
      { label: 'Patrón', get: (r) => r.patron_codigo_calbas }, { label: 'Valor de referencia', get: (r) => Number(r.valor_referencia_calbas) }, { label: 'Unidad de lectura', get: (r) => uLect(r) },
      { label: 'Lectura 1', get: (r) => enRef(r, r.lectura_1_calbas) }, { label: 'Lectura 2', get: (r) => enRef(r, r.lectura_2_calbas) }, { label: 'Lectura 3', get: (r) => enRef(r, r.lectura_3_calbas) },
      { label: 'Promedio', get: (r) => enRef(r, r.promedio_lecturas_calbas) },
      { label: 'Error', get: (r) => r.error_calbas }, { label: 'Tolerancia / EMT', get: (r) => r.tolerancia_calbas }, { label: 'Unidad de cálculo', get: (r) => U(r.unidad_calculo_calbas) },
      { label: 'CV %', get: (r) => r.cv_pct_calbas }, { label: 'Clase', get: (r) => CLASES[r.clase_exactitud_aplicada_calbas] || '' }, { label: 'Criterio', get: (r) => CRITERIOS[r.criterio_evaluacion_aplicado_calbas] || '' },
      { label: 'Dictamen', get: (r) => (r.dictamen_calbas === 'CUMPLE' ? 'Cumple' : 'No cumple') }, { label: 'Estado', get: (r) => r.estado_calbas },
      { label: 'Responsable', get: (r) => r.supervisor_calbas }, { label: 'Observaciones', get: (r) => r.observaciones_calbas }, { label: 'Motivo de anulación', get: (r) => r.motivo_anulacion_calbas },
    ]);
    descargar(`verificaciones_${todayISO()}.csv`, csv);
  } catch (err) { toast(errMsg(err), 'error'); }
}

// ---------------- Seguimiento (acción correctiva) ----------------
function seguimientoHTML(v) {
  const s = v._seg;
  if (!estadoSeg(v)) return '';
  const head = `<div class="seg-head"><div><h4>${icon('wrench')} Seguimiento del «no cumple»</h4><p>Acción correctiva y su cierre con evidencia.</p></div>${segPill(estadoSeg(v))}</div>`;
  if (!s) {
    return `<section class="seg-box bad">${head}
      <div class="form-grid">
        <div class="field"><label for="sg-acc">Acción tomada <span class="req">*</span></label><select id="sg-acc" name="sg_accion">${Object.entries(ACCIONES).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></div>
        <div class="field"><label for="sg-fc">Fecha compromiso</label><input id="sg-fc" name="sg_fc" type="date" min="${todayISO()}"></div>
        <div class="field full"><label for="sg-desc">Descripción <span class="req">*</span></label><textarea id="sg-desc" name="sg_desc" rows="2" maxlength="1000" placeholder="Ej. Se retiró la báscula de la línea y se solicitó ajuste al proveedor"></textarea></div>
      </div>
      <div class="form-actions"><button type="button" class="btn orange" data-seg="crear">${icon('save')} Registrar acción correctiva</button></div></section>`;
  }
  const info = `<dl class="info-tiles">
      <div><dt>Acción</dt><dd>${esc(ACCIONES[s.accion_calbas] || s.accion_calbas)}</dd></div>
      <div><dt>Registrada</dt><dd>${fmtDateTime(s.created_at_calbas)}</dd></div>
      <div><dt>Compromiso</dt><dd>${fmtDate(s.fecha_compromiso_calbas)}</dd></div>
      <div class="wide"><dt>Descripción</dt><dd>${esc(s.descripcion_calbas)}</dd></div>
      ${s.estado_calbas === 'cerrado' ? `<div class="wide"><dt>Cierre · ${fmtDateTime(s.cerrado_at_calbas)}</dt><dd>${esc(s.cierre_calbas)}</dd></div>` : ''}</dl>`;
  if (s.estado_calbas === 'cerrado') return `<section class="seg-box ok">${head}${info}</section>`;
  return `<section class="seg-box warn">${head}${info}
    <div class="field mt"><label for="sg-cierre">Evidencia de cierre <span class="req">*</span></label><textarea id="sg-cierre" rows="2" maxlength="1000" placeholder="Ej. Ajustada por el proveedor; re-verificada el 25/10 con dictamen cumple"></textarea></div>
    <div class="form-actions"><button type="button" class="btn green" data-seg="cerrar">${icon('circle-check-big')} Cerrar seguimiento</button></div></section>`;
}

async function detalle(v) {
  if (!v) return false;
  const { data: serie } = await sb.from(VW).select('fecha_calbas, error_calbas, tolerancia_calbas, dictamen_calbas, created_at_calbas')
    .eq('equipo_id_calbas', v.equipo_id_calbas).eq('estado_calbas', 'vigente').order('fecha_calbas', { ascending: false }).order('created_at_calbas', { ascending: false }).limit(20);
  const tile = (k, x, cls = '') => `<div class="${cls}"><dt>${esc(k)}</dt><dd>${esc(x ?? '—')}</dd></div>`;
  const lects = [v.lectura_1_calbas, v.lectura_2_calbas, v.lectura_3_calbas].map((x) => fmtVal(enRef(v, x))).join(' · ');
  let cambio = false;
  await openModal({
    title: `Verificación ${v.equipo_codigo_calbas}`, subtitle: `${fmtDate(v.fecha_calbas)} · ${v.tipo_nombre_calbas} · ${v.departamento_calbas || ''}`, size: 'lg',
    body: `<div class="ficha-status">${dictamenPill(v.dictamen_calbas, v.estado_calbas)}</div>
      <div class="result-strip ${v.dictamen_calbas === 'CUMPLE' ? 'ok' : 'bad'}">
        <div><small>Referencia</small><b class="mono">${fmtVal(v.valor_referencia_calbas)} ${esc(U(v.unidad_referencia_calbas))}</b><span>${esc(v.patron_codigo_calbas || '')}</span></div>
        <div><small>Promedio</small><b class="mono">${fmtVal(enRef(v, v.promedio_lecturas_calbas))} ${esc(uLect(v))}</b><span>${esc(lects)}</span></div>
        <div><small>Error</small><b class="mono">${fmtSigned(v.error_calbas)} ${esc(U(v.unidad_calculo_calbas))}</b></div>
        <div><small>Tolerancia / EMT</small><b class="mono">± ${fmtVal(v.tolerancia_calbas, 6)} ${esc(U(v.unidad_calculo_calbas))}</b>${v.cv_pct_calbas != null ? `<span>CV ${fmtVal(v.cv_pct_calbas, 3)} %</span>` : ''}</div>
      </div>
      <dl class="info-tiles">
        ${v.clase_exactitud_aplicada_calbas ? tile('Clase / criterio', `${CLASES[v.clase_exactitud_aplicada_calbas]} · ${CRITERIOS[v.criterio_evaluacion_aplicado_calbas] || ''}`) : ''}
        ${tile('Responsable', v.supervisor_calbas)}${tile('Registrado', fmtDateTime(v.created_at_calbas))}
        ${tile('Observaciones', v.observaciones_calbas, 'wide')}
        ${v.estado_calbas === 'anulada' ? tile('Motivo de anulación', v.motivo_anulacion_calbas, 'wide') : ''}
      </dl>
      ${seguimientoHTML(v)}
      ${serie?.length > 1 ? `<h4 class="section-label mt">Tendencia del error (últimas ${serie.length})</h4><div class="chart-box" style="height:220px"><canvas id="h-chart"></canvas></div>` : ''}
      ${state.isAdmin && v.estado_calbas !== 'anulada' ? `<div class="mt"><button type="button" class="btn danger sm" data-anular>${icon('ban')} Anular verificación</button></div>` : ''}`,
    onOpen: ({ wrap, close }) => {
      const cv = wrap.querySelector('#h-chart');
      if (cv) {
        const s = [...serie].reverse();
        makeChart(cv, {
          type: 'line',
          data: {
            labels: s.map((x) => fmtDate(x.fecha_calbas).slice(0, 5)),
            datasets: [
              { label: 'Error', data: s.map((x) => Number(x.error_calbas)), borderColor: PALETTE[0], backgroundColor: PALETTE[0], tension: 0.25, pointRadius: 4,
                pointBackgroundColor: s.map((x) => (x.dictamen_calbas === 'CUMPLE' ? cssVar('--ok') : cssVar('--bad'))) },
              { label: '+ Tolerancia', data: s.map((x) => Number(x.tolerancia_calbas)), borderColor: PALETTE[1], borderDash: [6, 4], pointRadius: 0 },
              { label: '− Tolerancia', data: s.map((x) => -Number(x.tolerancia_calbas)), borderColor: PALETTE[1], borderDash: [6, 4], pointRadius: 0 },
            ],
          },
          options: { scales: { y: { beginAtZero: false, ticks: { precision: undefined } } } },
        });
      }
      wrap.querySelector('[data-seg="crear"]')?.addEventListener('click', async (ev) => {
        const desc = wrap.querySelector('#sg-desc').value.trim();
        if (desc.length < 3) { toast('Describe la acción tomada.', 'warning'); wrap.querySelector('#sg-desc').focus(); return; }
        ev.currentTarget.disabled = true;
        try {
          must(await sb.from('seguimientos_calbas').insert({ origen_calbas: v.origen_calbas, verificacion_id_calbas: v.id_calbas,
            accion_calbas: wrap.querySelector('#sg-acc').value, descripcion_calbas: desc, fecha_compromiso_calbas: wrap.querySelector('#sg-fc').value || null }));
          toast('Acción correctiva registrada. Ciérrala cuando tengas la evidencia.', 'success'); cambio = true; close(true);
        } catch (err) { toast(errMsg(err), 'error'); ev.currentTarget.disabled = false; }
      });
      wrap.querySelector('[data-seg="cerrar"]')?.addEventListener('click', async (ev) => {
        const cierre = wrap.querySelector('#sg-cierre').value.trim();
        if (cierre.length < 3) { toast('Escribe la evidencia de cierre.', 'warning'); wrap.querySelector('#sg-cierre').focus(); return; }
        ev.currentTarget.disabled = true;
        try {
          must(await sb.from('seguimientos_calbas').update({ estado_calbas: 'cerrado', cierre_calbas: cierre }).eq('id_calbas', v._seg.id_calbas));
          toast('Seguimiento cerrado.', 'success'); cambio = true; close(true);
        } catch (err) { toast(errMsg(err), 'error'); ev.currentTarget.disabled = false; }
      });
      wrap.querySelector('[data-anular]')?.addEventListener('click', async () => {
        const r = await confirmDialog({ title: 'Anular verificación', message: 'La verificación quedará anulada (no se borra) y el cambio se registra en la bitácora. No se puede revertir.',
          confirmText: 'Anular', danger: true, input: { label: 'Motivo de la anulación', required: true, placeholder: 'Ej. Lectura capturada en la báscula equivocada' } });
        if (!r) return;
        try {
          const tabla = v.origen_calbas === 'bascula' ? 'verificaciones_calbas' : 'verificaciones_equipo_calbas';
          must(await sb.from(tabla).update({ estado_calbas: 'anulada', motivo_anulacion_calbas: r.value, motivo_cambio_calbas: r.value }).eq('id_calbas', v.id_calbas));
          toast('Verificación anulada.', 'success'); cambio = true; close(true);
        } catch (err) { toast(errMsg(err), 'error'); }
      });
      refreshIcons();
    },
  });
  return cambio;
}
