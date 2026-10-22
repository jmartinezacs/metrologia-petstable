// =====================================================================
// Historial de verificaciones de todos los equipos: filtros, exportación,
// detalle con tendencia del error y anulación con motivo (administradores).
// Los registros nunca se borran: la anulación queda en la bitácora.
// =====================================================================
import {
  sb, state, esc, icon, toast, openModal, confirmDialog, must, DataTable, paged, sanitizeSearch, debounce,
  fmtDate, fmtDateTime, fmtVal, fmtSigned, dictamenPill, getTipos, getDepartamentos, CLASES, CRITERIOS,
  fetchAll, toCSV, descargar, todayISO, addDays, makeChart, PALETTE, cssVar, errMsg,
} from '../core.js';

let root, table;
const VW = 'vw_verificaciones_todas_calbas';

function aplicarFiltros(q, f) {
  const s = sanitizeSearch(f.q);
  if (s) q = q.or(`equipo_codigo_calbas.ilike.*${s}*,ubicacion_calbas.ilike.*${s}*,supervisor_calbas.ilike.*${s}*`);
  if (f.tipo) q = q.eq('tipo_clave_calbas', f.tipo);
  if (f.depto) q = q.eq('departamento_id_calbas', f.depto);
  if (f.dictamen) q = q.eq('dictamen_calbas', f.dictamen);
  q = f.anuladas ? q.eq('estado_calbas', 'anulada') : q.eq('estado_calbas', 'vigente');
  if (f.desde) q = q.gte('fecha_calbas', f.desde);
  if (f.hasta) q = q.lte('fecha_calbas', f.hasta);
  if (f.equipo) q = q.eq('equipo_id_calbas', f.equipo);
  return q;
}

export default {
  async render(el, params = {}) {
    root = el;
    const [tipos, deptos] = await Promise.all([getTipos(), getDepartamentos()]);
    el.innerHTML = `
      <section class="page-intro">
        <div><span class="eyebrow">Registros</span><h1>Historial de verificaciones</h1>
          <p>Consulta, filtra y exporta las verificaciones internas de todos los equipos.</p></div>
        <div class="page-actions"><button class="btn secondary" data-h="csv">${icon('file-spreadsheet')} Exportar CSV</button></div>
      </section>
      <div class="card">
        <div class="toolbar">
          <div class="search">${icon('search')}<input type="search" id="h-q" placeholder="Equipo, ubicación o responsable" aria-label="Buscar"></div>
          <select id="h-tipo" aria-label="Tipo"><option value="">Todos los tipos</option>${tipos.map((t) => `<option value="${esc(t.clave_calbas)}">${esc(t.nombre_calbas)}</option>`).join('')}</select>
          <select id="h-depto" aria-label="Departamento"><option value="">Todos los departamentos</option>${deptos.map((d) => `<option value="${esc(d.id_calbas)}">${esc(d.nombre_calbas)}</option>`).join('')}</select>
          <select id="h-dict" aria-label="Dictamen"><option value="">Todos los dictámenes</option><option value="CUMPLE">Cumple</option><option value="NO_CUMPLE">No cumple</option></select>
          <span class="date-range"><input type="date" id="h-desde" aria-label="Desde"> a <input type="date" id="h-hasta" aria-label="Hasta"></span>
          <label class="check"><input type="checkbox" id="h-anul"> Anuladas</label>
        </div>
        <div id="h-table"></div>
      </div>`;
    el.querySelector('#h-desde').value = params.desde || addDays(todayISO(), -89);
    if (params.dictamen) el.querySelector('#h-dict').value = params.dictamen;
    table = new DataTable(el.querySelector('#h-table'), {
      rowKey: 'id_calbas', sort: { key: 'fecha_calbas', asc: false },
      columns: [
        { label: 'Fecha', sort: 'fecha_calbas', render: (v) => `<b class="cell-main">${fmtDate(v.fecha_calbas)}</b><span class="cell-sub">${esc(v.supervisor_calbas || '')}</span>` },
        { label: 'Equipo', sort: 'equipo_codigo_calbas', render: (v) => `<b class="cell-main">${esc(v.equipo_codigo_calbas)}</b><span class="cell-sub">${esc(v.tipo_nombre_calbas)} · ${esc(v.departamento_calbas || '')}</span>` },
        { label: 'Patrón', render: (v) => `<span class="mono">${fmtVal(v.valor_referencia_calbas)} ${esc(v.unidad_referencia_calbas || '')}</span><span class="cell-sub">${esc(v.patron_codigo_calbas || '')}</span>` },
        { label: 'Promedio', render: (v) => `<span class="mono">${fmtVal(v.promedio_lecturas_calbas)} ${esc(v.unidad_calbas || '')}</span>` },
        { label: 'Error / tolerancia', render: (v) => `<span class="mono">${fmtSigned(v.error_calbas)} ${esc(v.unidad_calculo_calbas || '')}</span><span class="cell-sub">± ${fmtVal(v.tolerancia_calbas, 4)} ${esc(v.unidad_calculo_calbas || '')}</span>` },
        { label: 'Dictamen', sort: 'dictamen_calbas', render: (v) => dictamenPill(v.dictamen_calbas, v.estado_calbas) },
        { label: '', cls: 'actions', render: (v) => `<button class="icon-btn" data-det="${v.id_calbas}" title="Detalle" aria-label="Detalle">${icon('eye')}</button>` },
      ],
      empty: { ico: 'clipboard-list', title: 'Sin verificaciones', text: 'Aún no hay verificaciones en el periodo seleccionado.' },
      fetch: async ({ from, to, sort, filters }) => {
        const q = aplicarFiltros(sb.from(VW).select('*', { count: 'exact' }), filters);
        const { data, count } = must(await paged(q, { from, to, sort }, [['created_at_calbas', false]]));
        return { rows: data, count };
      },
    });
    const apply = () => table.setFilters(filtros());
    el.querySelector('#h-q').addEventListener('input', debounce(apply, 350));
    ['#h-tipo', '#h-depto', '#h-dict', '#h-desde', '#h-hasta', '#h-anul'].forEach((s) => el.querySelector(s).addEventListener('change', apply));
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
  return { q: v('#h-q'), tipo: v('#h-tipo'), depto: v('#h-depto'), dictamen: v('#h-dict'), desde: v('#h-desde'), hasta: v('#h-hasta'), anuladas: root.querySelector('#h-anul').checked };
}

async function exportar() {
  try {
    const rows = await fetchAll(() => aplicarFiltros(sb.from(VW).select('*'), { ...table.filters }).order('fecha_calbas', { ascending: false }));
    if (!rows.length) { toast('No hay registros para exportar.', 'warning'); return; }
    const csv = toCSV(rows, [
      { label: 'Fecha', get: (r) => r.fecha_calbas }, { label: 'Tipo', get: (r) => r.tipo_nombre_calbas }, { label: 'Equipo', get: (r) => r.equipo_codigo_calbas },
      { label: 'Departamento', get: (r) => r.departamento_calbas }, { label: 'Ubicación', get: (r) => r.ubicacion_calbas },
      { label: 'Patrón', get: (r) => r.patron_codigo_calbas }, { label: 'Valor de referencia', get: (r) => Number(r.valor_referencia_calbas) }, { label: 'Unidad referencia', get: (r) => r.unidad_referencia_calbas },
      { label: 'Lectura 1', get: (r) => r.lectura_1_calbas }, { label: 'Lectura 2', get: (r) => r.lectura_2_calbas }, { label: 'Lectura 3', get: (r) => r.lectura_3_calbas },
      { label: 'Promedio', get: (r) => r.promedio_lecturas_calbas }, { label: 'Unidad', get: (r) => r.unidad_calbas },
      { label: 'Error', get: (r) => r.error_calbas }, { label: 'Tolerancia / EMT', get: (r) => r.tolerancia_calbas }, { label: 'Unidad de cálculo', get: (r) => r.unidad_calculo_calbas },
      { label: 'CV %', get: (r) => r.cv_pct_calbas }, { label: 'Clase', get: (r) => CLASES[r.clase_exactitud_aplicada_calbas] || '' }, { label: 'Criterio', get: (r) => CRITERIOS[r.criterio_evaluacion_aplicado_calbas] || '' },
      { label: 'Dictamen', get: (r) => (r.dictamen_calbas === 'CUMPLE' ? 'Cumple' : 'No cumple') }, { label: 'Estado', get: (r) => r.estado_calbas },
      { label: 'Responsable', get: (r) => r.supervisor_calbas }, { label: 'Observaciones', get: (r) => r.observaciones_calbas }, { label: 'Motivo de anulación', get: (r) => r.motivo_anulacion_calbas },
    ]);
    descargar(`verificaciones_${todayISO()}.csv`, csv);
  } catch (err) { toast(errMsg(err), 'error'); }
}

async function detalle(v) {
  if (!v) return false;
  const { data: serie } = await sb.from(VW).select('fecha_calbas, error_calbas, tolerancia_calbas, dictamen_calbas, created_at_calbas')
    .eq('equipo_id_calbas', v.equipo_id_calbas).eq('estado_calbas', 'vigente').order('fecha_calbas', { ascending: false }).order('created_at_calbas', { ascending: false }).limit(20);
  const filas = [
    ['Equipo', `${v.equipo_codigo_calbas} · ${v.tipo_nombre_calbas}`], ['Departamento', v.departamento_calbas], ['Fecha', fmtDate(v.fecha_calbas)],
    ['Patrón', `${v.patron_codigo_calbas || '—'} · ${fmtVal(v.valor_referencia_calbas)} ${v.unidad_referencia_calbas || ''}`],
    ['Lecturas', [v.lectura_1_calbas, v.lectura_2_calbas, v.lectura_3_calbas].map((x) => fmtVal(x)).join(' · ') + ` ${v.unidad_calbas || ''}`],
    ['Promedio', `${fmtVal(v.promedio_lecturas_calbas)} ${v.unidad_calbas || ''}`],
    ['Error', `${fmtSigned(v.error_calbas)} ${v.unidad_calculo_calbas || ''}`], ['Tolerancia / EMT', `± ${fmtVal(v.tolerancia_calbas, 6)} ${v.unidad_calculo_calbas || ''}`],
    ...(v.cv_pct_calbas != null ? [['CV', `${fmtVal(v.cv_pct_calbas, 3)} %`]] : []),
    ...(v.clase_exactitud_aplicada_calbas ? [['Clase / criterio', `${CLASES[v.clase_exactitud_aplicada_calbas]} · ${CRITERIOS[v.criterio_evaluacion_aplicado_calbas] || ''}`]] : []),
    ['Responsable', v.supervisor_calbas], ['Registrado', fmtDateTime(v.created_at_calbas)], ['Observaciones', v.observaciones_calbas],
    ...(v.estado_calbas === 'anulada' ? [['Motivo de anulación', v.motivo_anulacion_calbas]] : []),
  ];
  let anulada = false;
  await openModal({
    title: `Verificación ${v.equipo_codigo_calbas}`, subtitle: `${fmtDate(v.fecha_calbas)} · ${v.tipo_nombre_calbas}`, size: 'lg',
    body: `<div class="ficha-status">${dictamenPill(v.dictamen_calbas, v.estado_calbas)}</div>
      <dl class="detail-grid">${filas.map(([k, x]) => `<div><dt>${esc(k)}</dt><dd>${esc(x || '—')}</dd></div>`).join('')}</dl>
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
      wrap.querySelector('[data-anular]')?.addEventListener('click', async () => {
        const r = await confirmDialog({ title: 'Anular verificación', message: 'La verificación quedará anulada (no se borra) y el cambio se registra en la bitácora. No se puede revertir.',
          confirmText: 'Anular', danger: true, input: { label: 'Motivo de la anulación', required: true, placeholder: 'Ej. Lectura capturada en la báscula equivocada' } });
        if (!r) return;
        try {
          const tabla = v.origen_calbas === 'bascula' ? 'verificaciones_calbas' : 'verificaciones_equipo_calbas';
          must(await sb.from(tabla).update({ estado_calbas: 'anulada', motivo_anulacion_calbas: r.value, motivo_cambio_calbas: r.value }).eq('id_calbas', v.id_calbas));
          toast('Verificación anulada.', 'success'); anulada = true; close(true);
        } catch (err) { toast(errMsg(err), 'error'); }
      });
    },
  });
  return anulada;
}
