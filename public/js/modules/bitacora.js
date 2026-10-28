// =====================================================================
// Bitácora de auditoría (solo administradores). Los registros los generan
// triggers de la base de datos; no se pueden editar ni borrar.
// =====================================================================
import {
  sb, esc, icon, openModal, DataTable, paged, pill, must, fmtDateTime, fmtDate, dayStartTs, dayEndTs, avatarHTML, fotoDe, U,
} from '../core.js';

const TABLAS = {
  verificaciones_calbas: ['Verificaciones (básculas)', 'clipboard-check'], verificaciones_equipo_calbas: ['Verificaciones (equipos)', 'clipboard-check'],
  basculas_calbas: ['Básculas', 'scale'], equipos_calbas: ['Equipos', 'gauge'], pesas_patron_calbas: ['Pesas patrón', 'weight'], patrones_calbas: ['Patrones', 'thermometer'],
  calibraciones_calbas: ['Calibraciones (básculas)', 'badge-check'], calibraciones_equipo_calbas: ['Calibraciones (equipos)', 'badge-check'],
  tipos_equipo_calbas: ['Tipos de equipo', 'shapes'], seguimientos_calbas: ['Seguimientos «no cumple»', 'wrench'],
};
const ACC = { insert: ['Alta', 'ok', 'plus-circle'], update: ['Cambio', 'info', 'pencil'], anular: ['Anulación', 'warn', 'ban'], delete: ['Baja', 'bad', 'trash-2'] };
// Nombres legibles de los campos más comunes
const CAMPOS = {
  codigo: 'Código', fecha: 'Fecha', estado: 'Estado', dictamen: 'Dictamen', cumple: 'Cumple', unidad: 'Unidad', observaciones: 'Observaciones',
  lectura_1: 'Lectura 1', lectura_2: 'Lectura 2', lectura_3: 'Lectura 3', promedio_lecturas: 'Promedio', peso_real: 'Lectura promedio',
  error_indicacion: 'Error de indicación', error: 'Error', emt_permitido: 'EMT permitido', tolerancia_aplicada: 'Tolerancia aplicada',
  factor_emt: 'Factor EMT', divisiones_carga: 'Divisiones de carga', unidad_calculo: 'Unidad de cálculo', pesa_patron_valor: 'Valor de la pesa',
  clase_exactitud_aplicada: 'Clase aplicada', criterio_evaluacion_aplicado: 'Criterio aplicado', clase_exactitud: 'Clase de exactitud',
  criterio_evaluacion: 'Criterio de evaluación', motivo_anulacion: 'Motivo de anulación', motivo_cambio: 'Motivo del cambio',
  valor_referencia: 'Valor de referencia', cv_pct: 'CV %', descripcion: 'Descripción', tipo_bascula: 'Tipo de báscula', etiqueta_danada: 'Etiqueta dañada', ubicacion: 'Ubicación', marca: 'Marca', modelo: 'Modelo',
  numero_serie: 'Número de serie', capacidad_maxima: 'Capacidad máxima', capacidad_minima: 'Capacidad mínima', division_minima: 'División mínima (d)',
  division_verificacion_e: 'División de verificación (e)', frecuencia_dias: 'Verificar cada (días)', activa: 'Activa', activo: 'Activo',
  valor_nominal: 'Valor nominal', fecha_calibracion: 'Fecha de calibración', fecha_vencimiento: 'Vencimiento', numero_certificado: 'Certificado',
  proveedor_laboratorio: 'Laboratorio', resultado: 'Resultado', archivo_url: 'Archivo', accion: 'Acción', cierre: 'Cierre',
};
// Campos técnicos que no aportan a la lectura (se muestran al final, atenuados)
const TECNICOS = /^(id|.*_id|created_at|created_by|cerrado_por|responsable_id|supervisor_id|registro_id)$/;
let root, table, perfiles = {};

export default {
  async render(el) {
    root = el;
    const { data } = await sb.from('perfiles_calbas').select('id_calbas, nombre_completo_calbas, correo_calbas, avatar_url_calbas, puesto_calbas');
    perfiles = Object.fromEntries((data || []).map((p) => [p.id_calbas, p]));
    el.innerHTML = `
      <section class="page-intro">
        <div><span class="eyebrow">Auditoría</span><h1>Bitácora</h1>
          <p>Registro automático e inalterable de altas, cambios y anulaciones en equipos, patrones, verificaciones y calibraciones.</p></div>
      </section>
      <div class="card">
        <div class="toolbar">
          <select id="b-tabla" aria-label="Módulo"><option value="">Todos los módulos</option>${Object.entries(TABLAS).map(([k, [v]]) => `<option value="${k}">${v}</option>`).join('')}</select>
          <select id="b-acc" aria-label="Acción"><option value="">Todas las acciones</option>${Object.entries(ACC).map(([k, [l]]) => `<option value="${k}">${l}</option>`).join('')}</select>
          <select id="b-user" aria-label="Usuario"><option value="">Todos los usuarios</option>${Object.values(perfiles).sort((a, b) => a.nombre_completo_calbas.localeCompare(b.nombre_completo_calbas)).map((p) => `<option value="${p.id_calbas}">${esc(p.nombre_completo_calbas)}</option>`).join('')}</select>
          <span class="date-range"><input type="date" id="b-desde" aria-label="Desde"> a <input type="date" id="b-hasta" aria-label="Hasta"></span>
        </div>
        <div id="b-table"></div>
      </div>`;
    table = new DataTable(el.querySelector('#b-table'), {
      rowKey: 'id_calbas', sort: { key: 'fecha_calbas', asc: false },
      columns: [
        { label: 'Fecha', sort: 'fecha_calbas', render: (b) => `<b class="cell-main">${fmtDate(String(b.fecha_calbas).slice(0, 10))}</b><span class="cell-sub">${fmtDateTime(b.fecha_calbas).slice(-5)} h</span>` },
        { label: 'Usuario', cls: 'col-user', render: (b) => persona(b.usuario_id_calbas) },
        { label: 'Módulo', sort: 'tabla_calbas', render: (b) => `<span class="mod-chip">${icon((TABLAS[b.tabla_calbas] || [])[1] || 'database')}${esc((TABLAS[b.tabla_calbas] || [b.tabla_calbas])[0])}</span>` },
        { label: 'Acción', sort: 'accion_calbas', render: (b) => pill(...(ACC[b.accion_calbas] || [b.accion_calbas, 'gray'])) },
        { label: 'Registro', render: (b) => `<b class="cell-main">${esc(etiqueta(b))}</b>${b.motivo_calbas ? `<span class="cell-sub">Motivo: ${esc(b.motivo_calbas)}</span>` : ''}` },
        { label: '', cls: 'actions', render: (b) => `<button class="icon-btn" data-ba="${b.id_calbas}" title="Ver detalle" aria-label="Ver detalle">${icon('eye')}</button>` },
      ],
      empty: { ico: 'scroll-text', title: 'Sin registros', text: 'Los cambios en el sistema se registrarán aquí automáticamente.' },
      fetch: async ({ from, to, sort, filters: f }) => {
        let q = sb.from('bitacora_calbas').select('*', { count: 'exact' });
        if (f.tabla) q = q.eq('tabla_calbas', f.tabla);
        if (f.acc) q = q.eq('accion_calbas', f.acc);
        if (f.user) q = q.eq('usuario_id_calbas', f.user);
        if (f.desde) q = q.gte('fecha_calbas', dayStartTs(f.desde));
        if (f.hasta) q = q.lt('fecha_calbas', dayEndTs(f.hasta));
        const { data, count } = must(await paged(q, { from, to, sort }));
        return { rows: data, count };
      },
    });
    const apply = () => table.setFilters({
      tabla: el.querySelector('#b-tabla').value, acc: el.querySelector('#b-acc').value, user: el.querySelector('#b-user').value,
      desde: el.querySelector('#b-desde').value, hasta: el.querySelector('#b-hasta').value,
    });
    ['#b-tabla', '#b-acc', '#b-user', '#b-desde', '#b-hasta'].forEach((s) => el.querySelector(s).addEventListener('change', apply));
    el.addEventListener('click', (e) => { const b = e.target.closest('[data-ba]'); if (b) detalle(table.row(b.dataset.ba)); });
    await apply();
  },
  destroy() { root = null; table = null; },
};

function persona(id, grande = false) {
  const p = perfiles[id];
  if (!p) return `<div class="user-cell"><span class="avatar">${icon('cpu')}</span><div class="user-txt"><b>Sistema</b><span>Proceso automático</span></div></div>`;
  return `<div class="user-cell">${avatarHTML(p.nombre_completo_calbas, fotoDe(p.correo_calbas, p.avatar_url_calbas), grande ? 'lg' : '')}
    <div class="user-txt"><b>${esc(p.nombre_completo_calbas)}</b><span>${esc(p.puesto_calbas || p.correo_calbas)}</span></div></div>`;
}

function etiqueta(b) {
  const d = b.datos_despues_calbas || b.datos_antes_calbas || {};
  return d.codigo_calbas || d.numero_certificado_calbas || d.nombre_calbas || (d.fecha_calbas ? `Verificación del ${fmtDate(String(d.fecha_calbas).slice(0, 10))}` : 'Registro');
}
const nombreCampo = (k) => {
  const c = k.replace(/_calbas$/, '');
  return CAMPOS[c] || c.replace(/_/g, ' ').replace(/^./, (m) => m.toUpperCase());
};
function valor(k, v) {
  if (v === null || v === undefined || v === '') return '<span class="nulo">—</span>';
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  if (typeof v === 'object') return `<code>${esc(JSON.stringify(v))}</code>`;
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return esc(fmtDateTime(s));
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return esc(fmtDate(s));
  if (/unidad/.test(k)) return esc(U(s));
  if (s === 'NO_CUMPLE') return pill('No cumple', 'bad');
  if (s === 'CUMPLE') return pill('Cumple', 'ok');
  return esc(s);
}

function detalle(b) {
  if (!b) return;
  const antes = b.datos_antes_calbas || {}, despues = b.datos_despues_calbas || {};
  const keys = [...new Set([...Object.keys(despues), ...Object.keys(antes)])];
  const esCambio = !!b.datos_antes_calbas;
  const igual = (k) => JSON.stringify(antes[k]) === JSON.stringify(despues[k]);
  const cambiados = esCambio ? keys.filter((k) => !igual(k)) : [];
  const orden = (ks) => [...ks.filter((k) => !TECNICOS.test(k.replace(/_calbas$/, ''))), ...ks.filter((k) => TECNICOS.test(k.replace(/_calbas$/, '')))];
  const fila = (k, conAntes) => {
    const tec = TECNICOS.test(k.replace(/_calbas$/, ''));
    return `<tr class="${tec ? 'tec' : ''} ${conAntes && !igual(k) ? 'chg' : ''}"><th scope="row">${esc(nombreCampo(k))}</th>
      ${conAntes ? `<td class="old">${valor(k, antes[k])}</td><td class="arrow">${icon('arrow-right')}</td>` : ''}<td class="new">${valor(k, despues[k])}</td></tr>`;
  };
  const [accL, accC, accI] = ACC[b.accion_calbas] || [b.accion_calbas, 'gray', 'circle'];
  const [modL, modI] = TABLAS[b.tabla_calbas] || [b.tabla_calbas, 'database'];
  const tablaHTML = esCambio
    ? `<h4 class="bit-sec">${icon('git-compare')} Campos modificados <span class="count">${cambiados.length}</span></h4>
       ${cambiados.length ? `<div class="table-wrap"><table class="table bit-diff"><thead><tr><th>Campo</th><th>Antes</th><th></th><th>Después</th></tr></thead><tbody>${orden(cambiados).map((k) => fila(k, true)).join('')}</tbody></table></div>`
         : '<p class="hint center">No hubo cambios en los valores.</p>'}
       <details class="bit-more"><summary>${icon('list')} Ver el registro completo</summary>
         <div class="table-wrap"><table class="table bit-diff"><thead><tr><th>Campo</th><th>Antes</th><th></th><th>Después</th></tr></thead><tbody>${orden(keys).map((k) => fila(k, true)).join('')}</tbody></table></div></details>`
    : `<h4 class="bit-sec">${icon('file-plus')} Datos registrados</h4>
       <div class="table-wrap"><table class="table bit-diff"><thead><tr><th>Campo</th><th>Valor</th></tr></thead><tbody>${orden(keys).map((k) => fila(k, false)).join('')}</tbody></table></div>`;
  openModal({
    title: `${modL} · ${accL}`, subtitle: `${etiqueta(b)} · ${fmtDateTime(b.fecha_calbas)}`, size: 'lg',
    body: `<div class="bit-head">
        <div class="bit-who">${persona(b.usuario_id_calbas, true)}</div>
        <div class="bit-meta">
          <div><small>Acción</small><span class="pill ${accC}">${icon(accI)} ${esc(accL)}</span></div>
          <div><small>Módulo</small><b>${icon(modI)} ${esc(modL)}</b></div>
          <div><small>Fecha y hora</small><b>${esc(fmtDateTime(b.fecha_calbas))}</b></div>
          ${b.motivo_calbas ? `<div class="wide"><small>Motivo</small><b>${esc(b.motivo_calbas)}</b></div>` : ''}
        </div>
      </div>${tablaHTML}`,
  });
}
