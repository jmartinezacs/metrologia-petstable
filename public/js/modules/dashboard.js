// =====================================================================
// Panel general: KPI del programa metrológico, estado por departamento,
// pendientes de verificación, vencimientos de calibración, alertas de
// tendencia, gráficas, accesos rápidos y tarjeta de acceso autorizado.
// =====================================================================
import {
  sb, state, esc, icon, refreshIcons, todayISO, addDays, fmtDate, fmtDateTime, fmtNum, pill, makeChart, destroyCharts,
  emptyState, errorState, navigate, monthShort, must, avatarHTML, fotoDe, calPill, verPill, tipoIcono, PALETTE, cssVar, ganchos,
} from '../core.js';
import { cargarEquipos } from './equipos.js';

let root, token = 0;

export default {
  async render(el) {
    root = el;
    const p = state.profile;
    el.innerHTML = `
      <section class="page-intro">
        <div><span class="eyebrow">Panel general</span>
          <h1 class="hello">Hola, ${esc(p.nombre_completo_calbas.split(' ')[0])} <span class="paws" aria-hidden="true">${icon('paw-print')}${icon('paw-print')}</span></h1>
          <p>Estado del programa de verificación y calibración de equipos de medición.</p></div>
      </section>
      <div id="dash-body" class="dash"></div>`;
    el.addEventListener('click', onClick);
    el.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-dash][role="link"]')) { e.preventDefault(); e.target.click(); }
    });
    await load();
  },
  destroy() { token++; root = null; },
};

function onClick(e) {
  const a = e.target.closest('[data-dash]');
  if (!a) return;
  const act = a.dataset.dash;
  if (act === 'retry') return load();
  if (act === 'ficha') return ganchos.abrirFichaEquipo?.(a.dataset.id);
  if (act.startsWith('#')) navigate(act);
}

async function load() {
  const t = ++token;
  const body = root.querySelector('#dash-body');
  body.innerHTML = `<div class="grid grid-4">${'<div class="kpi"><div class="skeleton" style="width:60%"></div><div class="skeleton" style="height:30px;width:40%"></div></div>'.repeat(4)}</div>`;
  const hoy = todayISO(), inicio = `${addDays(hoy, -180).slice(0, 7)}-01`;
  try {
    const [eqs, ver, alertas] = await Promise.all([
      cargarEquipos(),
      sb.from('vw_verificaciones_todas_calbas').select('fecha_calbas, dictamen_calbas, tipo_clave_calbas').eq('estado_calbas', 'vigente').gte('fecha_calbas', inicio).limit(5000).then(must),
      sb.from('vw_alertas_tendencia_calbas').select('*').then((r) => r).catch(() => ({ data: [] })),
    ]);
    if (t !== token || !root) return;
    const activos = eqs.filter((e) => e.activo_calbas);
    const mes = hoy.slice(0, 7);
    const verMes = ver.data.filter((v) => v.fecha_calbas.startsWith(mes));
    const ncMes = verMes.filter((v) => v.dictamen_calbas === 'NO_CUMPLE').length;
    const pendientes = activos.filter((e) => ['vencida', 'sin_registro', 'por_vencer'].includes(e.estado_verificacion_calbas));
    const calAlert = activos.filter((e) => ['vencida', 'por_vencer'].includes(e.estado_calibracion_calbas));
    const tendencia = (alertas.data || []).filter((a) => a.alerta_tendencia_calbas);
    const conformes = verMes.length ? Math.round(((verMes.length - ncMes) / verMes.length) * 100) : null;

    destroyCharts();
    body.innerHTML = `
      <div class="grid grid-4">
        ${kpi('i-blue', 'gauge', 'Equipos activos', activos.length, `${new Set(activos.map((e) => e.tipo_clave_calbas)).size} tipos de instrumento`, '#/equipos')}
        ${kpi('c2 i-amber', 'clipboard-check', 'Verificaciones del mes', verMes.length, conformes === null ? 'Sin registros este mes' : `${conformes} % conformes`, '#/historial')}
        ${kpi(`${pendientes.some((e) => e.estado_verificacion_calbas !== 'por_vencer') ? 'danger' : 'c3'} i-violet`, 'clock-alert', 'Por verificar', pendientes.length, 'Atrasadas, sin registro o próximas', '#/equipos?estado=ver_atrasada')}
        ${kpi(`${calAlert.some((e) => e.estado_calibracion_calbas === 'vencida') ? 'danger' : 'c4'} i-pink`, 'calendar-x', 'Calibraciones en riesgo', calAlert.length, 'Vencidas o por vencer en 30 días', '#/calibraciones')}
      </div>
      ${tendencia.length || ncMes ? `<div class="notice error mt">${icon('triangle-alert')}<span>${tendencia.length ? `<b>${tendencia.length} báscula(s) con alerta de tendencia</b> (3 o más “no cumple” en sus últimas 5 verificaciones). ` : ''}${ncMes ? `${ncMes} verificación(es) con dictamen “no cumple” este mes.` : ''}</span>
        <button class="btn secondary sm" data-dash="#/historial?dictamen=NO_CUMPLE">Revisar</button></div>` : ''}
      <div class="grid grid-main mt">
        <div class="card">${cardHead('Pendientes de verificación', 'Ordenados por urgencia', `<button class="btn secondary sm" data-dash="#/verificar">${icon('clipboard-plus')} Verificar</button>`)}
          ${listaPendientes(pendientes)}</div>
        <div class="card">${cardHead('Calibraciones próximas', 'Vencidas y por vencer', `<button class="btn secondary sm" data-dash="#/calibraciones">${icon('badge-check')} Ver todas</button>`)}
          ${listaCal(calAlert)}</div>
      </div>
      <div class="grid grid-2 mt">
        ${chartCard('ch-mes', 'Verificaciones por mes', 'Últimos 6 meses · cumple vs. no cumple')}
        ${chartCard('ch-tipo', 'Equipos por tipo', 'Inventario activo')}
      </div>
      <div class="card mt">${cardHead('Estado por departamento', 'Equipos activos, verificaciones al día y calibraciones vigentes')}${deptosHTML(activos)}</div>
      ${quickHTML()}
      ${accesoHTML()}`;
    refreshIcons();
    drawCharts(ver.data, activos, inicio);
  } catch (err) {
    if (t !== token) return;
    console.error(err);
    body.innerHTML = errorState(err).replace('data-action="retry"', 'data-dash="retry"');
    refreshIcons();
  }
}

const kpi = (cls, ico, label, value, desc, go = '') =>
  `<div class="kpi ${cls} ${go ? 'clickable' : ''}" ${go ? `data-dash="${go}" role="link" tabindex="0"` : ''}>
    <div class="kpi-head"><span class="kpi-ico">${icon(ico)}</span><small>${esc(label)}</small></div>
    <strong>${fmtNum(value)}</strong><span class="desc">${esc(desc)}</span></div>`;
const cardHead = (title, sub = '', btn = '') =>
  `<div class="card-head center"><div><h3>${esc(title)}</h3>${sub ? `<p>${esc(sub)}</p>` : ''}</div>${btn}</div>`;
const chartCard = (id, title, sub) =>
  `<div class="card">${cardHead(title, sub)}<div class="chart-box"><canvas id="${id}" role="img" aria-label="${esc(title)}"></canvas></div></div>`;
const eqIco = (e) => `<span class="eq-ico sm t-${esc(e.tipo_clave_calbas.toLowerCase())}">${icon(tipoIcono(e.tipo_clave_calbas, e.icono_calbas))}</span>`;

function listaPendientes(rows) {
  if (!rows.length) return emptyState({ ico: 'circle-check-big', title: 'Todo al día', text: 'Todos los equipos activos tienen su verificación vigente.' });
  const orden = { vencida: 0, sin_registro: 1, por_vencer: 2 };
  rows = [...rows].sort((a, b) => orden[a.estado_verificacion_calbas] - orden[b.estado_verificacion_calbas] || String(a.proxima_verificacion_calbas).localeCompare(String(b.proxima_verificacion_calbas)));
  return `<div class="list">${rows.slice(0, 7).map((e) => `
    <button class="list-item" data-dash="#/verificar?equipo=${e.id_calbas}" style="text-align:left;cursor:pointer;color:inherit">
      ${eqIco(e)}<div class="li-main"><b>${esc(e.codigo_calbas)} · ${esc(e.tipo_nombre_calbas)}</b>
      <span>${esc(e.departamento_calbas || '')}${e.proxima_verificacion_calbas ? ` · tocaba el ${fmtDate(e.proxima_verificacion_calbas)}` : ' · nunca verificado'}</span></div>
      ${verPill(e.estado_verificacion_calbas)}</button>`).join('')}</div>
    ${rows.length > 7 ? `<p class="hint">Y ${rows.length - 7} más en <a href="#/equipos?estado=ver_atrasada">Equipos</a>.</p>` : ''}`;
}

function listaCal(rows) {
  if (!rows.length) return emptyState({ ico: 'badge-check', title: 'Sin vencimientos próximos', text: 'Ninguna calibración vence en los próximos 30 días.' });
  rows = [...rows].sort((a, b) => (a.dias_calibracion_calbas ?? 0) - (b.dias_calibracion_calbas ?? 0));
  return `<div class="list">${rows.slice(0, 7).map((e) => `
    <button class="list-item" data-dash="ficha" data-id="${e.id_calbas}" style="text-align:left;cursor:pointer;color:inherit">
      <div class="date-chip"><small>${esc(monthShort(e.vencimiento_calibracion_calbas))}</small><b>${esc(e.vencimiento_calibracion_calbas.slice(8, 10))}</b></div>
      <div class="li-main"><b>${esc(e.codigo_calbas)} · ${esc(e.tipo_nombre_calbas)}</b><span>${esc(e.proveedor_laboratorio_calbas || 'Laboratorio no registrado')} · ${e.dias_calibracion_calbas < 0 ? `vencida hace ${-e.dias_calibracion_calbas} días` : `vence en ${e.dias_calibracion_calbas} días`}</span></div>
      ${calPill(e.estado_calibracion_calbas)}</button>`).join('')}</div>`;
}

function deptosHTML(activos) {
  const g = {};
  activos.forEach((e) => {
    const d = (g[e.departamento_calbas || 'Sin departamento'] ||= { total: 0, verOk: 0, calOk: 0, nc: 0 });
    d.total++;
    if (e.estado_verificacion_calbas === 'al_dia' || e.estado_verificacion_calbas === 'por_vencer') d.verOk++;
    if (e.estado_calibracion_calbas === 'vigente' || e.estado_calibracion_calbas === 'por_vencer') d.calOk++;
    if (e.ultimo_dictamen_calbas === 'NO_CUMPLE') d.nc++;
  });
  const ent = Object.entries(g).sort((a, b) => a[0].localeCompare(b[0]));
  if (!ent.length) return emptyState({ ico: 'building-2', title: 'Sin equipos' });
  const bar = (n, total) => { const p = total ? Math.round((n / total) * 100) : 0; return `<div class="meter"><span style="width:${p}%" class="${p === 100 ? 'ok' : p >= 70 ? 'warn' : 'bad'}"></span></div><small>${n}/${total} · ${p} %</small>`; };
  return `<div class="dept-status">${ent.map(([n, d]) => `<div class="dept-row">
      <div class="dept-name"><b>${esc(n)}</b><span>${d.total} equipo(s)${d.nc ? ` · ${pill(`${d.nc} no cumple`, 'bad')}` : ''}</span></div>
      <div class="dept-metric"><span>Verificación al día</span>${bar(d.verOk, d.total)}</div>
      <div class="dept-metric"><span>Calibración vigente</span>${bar(d.calOk, d.total)}</div></div>`).join('')}</div>`;
}

function drawCharts(ver, activos, inicio) {
  const meses = [];
  for (let d = inicio; meses.length < 7; d = addDays(`${d.slice(0, 7)}-28`, 5)) meses.push(d.slice(0, 7));
  const cuenta = (m, dic) => ver.filter((v) => v.fecha_calbas.startsWith(m) && v.dictamen_calbas === dic).length;
  const c1 = document.getElementById('ch-mes');
  if (c1) makeChart(c1, {
    type: 'bar',
    data: { labels: meses.map((m) => monthShort(`${m}-15`)), datasets: [
      { label: 'Cumple', data: meses.map((m) => cuenta(m, 'CUMPLE')), backgroundColor: cssVar('--ok') || PALETTE[3], borderRadius: 6, stack: 's' },
      { label: 'No cumple', data: meses.map((m) => cuenta(m, 'NO_CUMPLE')), backgroundColor: cssVar('--bad') || PALETTE[5], borderRadius: 6, stack: 's' },
    ] },
    options: { scales: { x: { stacked: true }, y: { stacked: true } } },
  });
  const tipos = {};
  activos.forEach((e) => { tipos[e.tipo_nombre_calbas] = (tipos[e.tipo_nombre_calbas] || 0) + 1; });
  const c2 = document.getElementById('ch-tipo');
  if (c2) makeChart(c2, {
    type: 'doughnut',
    data: { labels: Object.keys(tipos), datasets: [{ data: Object.values(tipos), backgroundColor: PALETTE, borderWidth: 0 }] },
    options: { plugins: { legend: { position: 'right' } } },
  });
}

function quickHTML() {
  const items = [
    ['#/verificar', 'clipboard-plus', 'Registrar verificación', 'Tres lecturas contra un patrón'],
    ['#/historial', 'history', 'Historial', 'Consulta y exporta registros'],
    ['#/equipos', 'gauge', 'Equipos', 'Inventario y fichas técnicas'],
    state.isAdmin ? ['#/calibraciones', 'badge-check', 'Calibraciones', 'Certificados y vencimientos'] : ['#/patrones', 'weight', 'Patrones', 'Pesas y referencias vigentes'],
  ];
  return `<section class="card mt quick-section">${cardHead('Accesos rápidos', 'Las acciones más utilizadas')}
    <div class="quick-grid">${items.map(([a, ic, t, s]) => `<button class="quick-action" data-dash="${a}"><span class="qi">${icon(ic)}</span><b>${esc(t)}</b><span>${esc(s)}</span></button>`).join('')}</div></section>`;
}

function accesoHTML() {
  const p = state.profile;
  const u = state.session?.user;
  return `<section class="access-card mt" aria-label="Acceso autorizado">
    <div class="access-photo">${avatarHTML(p.nombre_completo_calbas, fotoDe(p.correo_calbas, p.avatar_url_calbas), 'xl')}<span class="access-check">${icon('badge-check')}</span></div>
    <div class="access-info">
      <span class="access-badge">${icon('shield-check')} Acceso autorizado</span>
      <h2>${esc(p.nombre_completo_calbas)}</h2>
      <p class="access-puesto">${esc(p.puesto_calbas || 'Puesto no registrado')}</p>
      <div class="access-tags">
        <span>${icon(state.isAdmin ? 'crown' : 'user')} ${state.isAdmin ? 'Administrador' : 'Usuario'}</span>
        <span>${icon('building-2')} ${esc(p.departamento_calbas || 'Sin departamento')}</span>
        <span>${icon('mail')} ${esc(p.correo_calbas)}</span>
        <span>${icon('clock')} Último acceso: ${fmtDateTime(u?.last_sign_in_at)}</span>
      </div>
      <p class="access-foot">${icon('lock')} Sesión verificada con tu cuenta corporativa Pet's Table.</p>
    </div>
  </section>`;
}
