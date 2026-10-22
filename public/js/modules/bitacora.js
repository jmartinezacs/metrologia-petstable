// =====================================================================
// Bitácora de auditoría (solo administradores). Los registros los generan
// triggers de la base de datos; no se pueden editar ni borrar.
// =====================================================================
import {
  sb, esc, icon, openModal, DataTable, paged, pill, must, fmtDateTime, dayStartTs, dayEndTs,
} from '../core.js';

const TABLAS = {
  verificaciones_calbas: 'Verificaciones (básculas)', verificaciones_equipo_calbas: 'Verificaciones (equipos)',
  basculas_calbas: 'Básculas', equipos_calbas: 'Equipos', pesas_patron_calbas: 'Pesas patrón', patrones_calbas: 'Patrones',
  calibraciones_calbas: 'Calibraciones (básculas)', calibraciones_equipo_calbas: 'Calibraciones (equipos)', tipos_equipo_calbas: 'Tipos de equipo',
};
const ACC = { insert: ['Alta', 'ok'], update: ['Cambio', 'info'], anular: ['Anulación', 'warn'], delete: ['Baja', 'bad'] };
let root, table, nombres = {};

export default {
  async render(el) {
    root = el;
    const { data: perfiles } = await sb.from('perfiles_calbas').select('id_calbas, nombre_completo_calbas');
    nombres = Object.fromEntries((perfiles || []).map((p) => [p.id_calbas, p.nombre_completo_calbas]));
    el.innerHTML = `
      <section class="page-intro">
        <div><span class="eyebrow">Auditoría</span><h1>Bitácora</h1>
          <p>Registro automático de altas, cambios y anulaciones en equipos, patrones, verificaciones y calibraciones.</p></div>
      </section>
      <div class="card">
        <div class="toolbar">
          <select id="b-tabla" aria-label="Módulo"><option value="">Todos los módulos</option>${Object.entries(TABLAS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
          <select id="b-acc" aria-label="Acción"><option value="">Todas las acciones</option>${Object.entries(ACC).map(([k, [l]]) => `<option value="${k}">${l}</option>`).join('')}</select>
          <span class="date-range"><input type="date" id="b-desde" aria-label="Desde"> a <input type="date" id="b-hasta" aria-label="Hasta"></span>
        </div>
        <div id="b-table"></div>
      </div>`;
    table = new DataTable(el.querySelector('#b-table'), {
      rowKey: 'id_calbas', sort: { key: 'fecha_calbas', asc: false },
      columns: [
        { label: 'Fecha', sort: 'fecha_calbas', render: (b) => `<span class="mono">${fmtDateTime(b.fecha_calbas)}</span>` },
        { label: 'Usuario', render: (b) => esc(nombres[b.usuario_id_calbas] || 'Sistema') },
        { label: 'Módulo', sort: 'tabla_calbas', render: (b) => esc(TABLAS[b.tabla_calbas] || b.tabla_calbas) },
        { label: 'Acción', sort: 'accion_calbas', render: (b) => pill(...(ACC[b.accion_calbas] || [b.accion_calbas, 'gray'])) },
        { label: 'Registro', render: (b) => `<span class="cell-sub">${esc(etiqueta(b))}</span>${b.motivo_calbas ? `<span class="cell-sub">Motivo: ${esc(b.motivo_calbas)}</span>` : ''}` },
        { label: '', cls: 'actions', render: (b) => `<button class="icon-btn" data-ba="${b.id_calbas}" title="Ver detalle" aria-label="Ver detalle">${icon('eye')}</button>` },
      ],
      empty: { ico: 'scroll-text', title: 'Sin registros', text: 'Los cambios en el sistema se registrarán aquí automáticamente.' },
      fetch: async ({ from, to, sort, filters: f }) => {
        let q = sb.from('bitacora_calbas').select('*', { count: 'exact' });
        if (f.tabla) q = q.eq('tabla_calbas', f.tabla);
        if (f.acc) q = q.eq('accion_calbas', f.acc);
        if (f.desde) q = q.gte('fecha_calbas', dayStartTs(f.desde));
        if (f.hasta) q = q.lt('fecha_calbas', dayEndTs(f.hasta));
        const { data, count } = must(await paged(q, { from, to, sort }));
        return { rows: data, count };
      },
    });
    const apply = () => table.setFilters({
      tabla: el.querySelector('#b-tabla').value, acc: el.querySelector('#b-acc').value,
      desde: el.querySelector('#b-desde').value, hasta: el.querySelector('#b-hasta').value,
    });
    ['#b-tabla', '#b-acc', '#b-desde', '#b-hasta'].forEach((s) => el.querySelector(s).addEventListener('change', apply));
    el.addEventListener('click', (e) => { const b = e.target.closest('[data-ba]'); if (b) detalle(table.row(b.dataset.ba)); });
    await apply();
  },
  destroy() { root = null; table = null; },
};

function etiqueta(b) {
  const d = b.datos_despues_calbas || b.datos_antes_calbas || {};
  return d.codigo_calbas || d.numero_certificado_calbas || d.nombre_calbas || (d.fecha_calbas ? `Verificación del ${d.fecha_calbas}` : b.registro_id_calbas);
}
const show = (v) => (v === null || v === undefined ? '∅' : typeof v === 'object' ? JSON.stringify(v) : String(v));

function detalle(b) {
  if (!b) return;
  const antes = b.datos_antes_calbas || {}, despues = b.datos_despues_calbas || {};
  const keys = [...new Set([...Object.keys(antes), ...Object.keys(despues)])];
  const cambios = b.datos_antes_calbas ? keys.filter((k) => show(antes[k]) !== show(despues[k])) : keys;
  const rows = b.datos_antes_calbas
    ? `<table class="diff"><thead><tr><th>Campo</th><th>Antes</th><th>Después</th></tr></thead><tbody>${cambios.map((k) => `<tr><td><b>${esc(k.replace(/_calbas$/, ''))}</b></td><td class="old">${esc(show(antes[k]))}</td><td class="new">${esc(show(despues[k]))}</td></tr>`).join('')}</tbody></table>`
    : `<table class="diff"><thead><tr><th>Campo</th><th>Valor</th></tr></thead><tbody>${cambios.map((k) => `<tr><td><b>${esc(k.replace(/_calbas$/, ''))}</b></td><td>${esc(show(despues[k]))}</td></tr>`).join('')}</tbody></table>`;
  openModal({
    title: `${TABLAS[b.tabla_calbas] || b.tabla_calbas} · ${ACC[b.accion_calbas]?.[0] || b.accion_calbas}`,
    subtitle: `${nombres[b.usuario_id_calbas] || 'Sistema'} · ${fmtDateTime(b.fecha_calbas)}${b.motivo_calbas ? ` · Motivo: ${b.motivo_calbas}` : ''}`,
    size: 'lg', body: rows,
  });
}
