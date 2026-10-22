// =====================================================================
// Registrar verificación. Un solo flujo para todos los equipos:
//  · Básculas: pesa patrón + 3 lecturas → EMT según clase/criterio (OIML R76).
//  · Otros equipos: patrón de referencia + 3 lecturas → error vs tolerancia y CV.
// La vista previa es orientativa: el dictamen definitivo lo calcula la base
// de datos (validar_verificacion_calbas / validar_verificacion_equipo_calbas).
// =====================================================================
import {
  sb, esc, icon, refreshIcons, toast, errMsg, must, checkForm, pill, fmtDate, fmtVal, fmtSigned, todayISO,
  aGramos, factorEMT, estadistica, CLASES, CRITERIOS, tipoIcono, navigate, dictamenPill, emptyState,
} from '../core.js';
import { cargarEquipos } from './equipos.js';

let root, equipos = [], eq = null, ctx = {};

export default {
  async render(el, params = {}) {
    root = el; eq = null; ctx = {};
    el.innerHTML = `
      <section class="page-intro">
        <div><span class="eyebrow">Control metrológico</span><h1>Registrar verificación</h1>
          <p>Captura tres lecturas contra un patrón vigente; el promedio es la base del cálculo y el sistema emite el dictamen.</p></div>
      </section>
      <div class="verif-layout">
        <form class="card" id="vf" novalidate>
          <div class="card-head"><div><h3>${icon('crosshair')} Equipo a verificar</h3><p>Solo aparecen equipos activos de tus departamentos.</p></div></div>
          <div class="field"><label for="v-eq">Equipo <span class="req">*</span></label><select id="v-eq" name="equipo" required><option value="">Cargando…</option></select></div>
          <div id="v-eq-info"></div>
          <div id="v-campos"></div>
        </form>
        <aside class="card verif-preview" id="v-prev" aria-live="polite"></aside>
      </div>`;
    equipos = (await cargarEquipos()).filter((e) => e.activo_calbas);
    const sel = el.querySelector('#v-eq');
    if (!equipos.length) {
      el.querySelector('.verif-layout').outerHTML = `<div class="card">${emptyState({ ico: 'gauge', title: 'No hay equipos disponibles', text: 'No tienes equipos activos asignados a tus departamentos. Solicítalo a un administrador.' })}</div>`;
      refreshIcons(); return;
    }
    const grupos = {};
    equipos.forEach((e) => (grupos[e.tipo_nombre_calbas] ||= []).push(e));
    sel.innerHTML = '<option value="">Selecciona un equipo…</option>' + Object.entries(grupos).map(([g, list]) => `<optgroup label="${esc(g)}">${list.map((e) =>
      `<option value="${e.id_calbas}">${esc(e.codigo_calbas)} · ${esc(e.ubicacion_calbas || e.departamento_calbas || '')}</option>`).join('')}</optgroup>`).join('');
    sel.addEventListener('change', () => elegir(sel.value));
    el.querySelector('#vf').addEventListener('submit', guardar);
    el.querySelector('#vf').addEventListener('input', (e) => { if (e.target.name !== 'equipo') preview(); });
    if (params.equipo && equipos.some((e) => e.id_calbas === params.equipo)) { sel.value = params.equipo; await elegir(params.equipo); }
    else preview();
  },
  destroy() { root = null; },
};

async function elegir(id) {
  eq = equipos.find((e) => e.id_calbas === id) || null;
  const info = root.querySelector('#v-eq-info'), campos = root.querySelector('#v-campos');
  if (!eq) { info.innerHTML = ''; campos.innerHTML = ''; preview(); return; }
  campos.innerHTML = '<div class="skeleton" style="height:180px"></div>';
  const hoy = todayISO();
  try {
    if (eq.origen_calbas === 'bascula') {
      const [b, pesas, ver, cal] = await Promise.all([
        sb.from('basculas_calbas').select('*').eq('id_calbas', id).single().then(must),
        sb.from('pesas_patron_calbas').select('*').eq('activa_calbas', true).order('valor_nominal_calbas').then(must),
        sb.from('verificaciones_calbas').select('id_calbas, fecha_calbas, estado_calbas, created_at_calbas').eq('bascula_id_calbas', id).neq('estado_calbas', 'anulada').then(must),
        sb.from('calibraciones_calbas').select('fecha_calibracion_calbas, created_at_calbas').eq('bascula_id_calbas', id).then(must),
      ]);
      ctx = { b: b.data, ver: ver.data, cal: cal.data, pesas: pesas.data.filter((p) => !p.fecha_vencimiento_calbas || p.fecha_vencimiento_calbas >= hoy) };
      campos.innerHTML = `
        <div class="field"><label for="v-pat">Pesa patrón <span class="req">*</span></label><select id="v-pat" name="patron" required>
          <option value="">${ctx.pesas.length ? 'Selecciona…' : 'No hay pesas patrón vigentes'}</option>${ctx.pesas.map((p) => `<option value="${p.id_calbas}">${esc(p.codigo_calbas)} · ${fmtVal(p.valor_nominal_calbas)} ${esc(p.unidad_calbas)}</option>`).join('')}</select></div>
        ${lecturasHTML(ctx.b.unidad_calbas, false)}`;
    } else {
      const [e, pats, tipo] = await Promise.all([
        sb.from('equipos_calbas').select('*').eq('id_calbas', id).single().then(must),
        sb.from('patrones_calbas').select('*').eq('activo_calbas', true).order('codigo_calbas').then(must),
        sb.from('tipos_equipo_calbas').select('*').eq('clave_calbas', eq.tipo_clave_calbas).single().then(must),
      ]);
      ctx = { e: e.data, tipo: tipo.data, pats: pats.data.filter((p) => p.tipo_id_calbas === e.data.tipo_id_calbas && (!p.fecha_vencimiento_calbas || p.fecha_vencimiento_calbas >= hoy)) };
      campos.innerHTML = `
        ${ctx.tipo.guia_calbas ? `<div class="notice info">${icon('info')}<span>${esc(ctx.tipo.guia_calbas)}</span></div>` : ''}
        <div class="form-grid">
          <div class="field"><label for="v-pat">Patrón de referencia <span class="req">*</span></label><select id="v-pat" name="patron" required>
            <option value="">${ctx.pats.length ? 'Selecciona…' : 'No hay patrones vigentes para este tipo'}</option>${ctx.pats.map((p) => `<option value="${p.id_calbas}">${esc(p.codigo_calbas)} · ${esc(p.descripcion_calbas)}</option>`).join('')}</select></div>
          <div class="field"><label for="v-ref">Valor de referencia (${esc(ctx.e.unidad_calbas)}) <span class="req">*</span></label>
            <input id="v-ref" name="ref" type="number" step="any" inputmode="decimal" required ${ctx.tipo.permite_negativos_calbas ? '' : 'min="0"'}></div>
        </div>
        ${lecturasHTML(ctx.e.unidad_calbas, ctx.tipo.permite_negativos_calbas)}`;
      campos.querySelector('#v-pat').addEventListener('change', (ev) => {
        const p = ctx.pats.find((x) => x.id_calbas === ev.target.value);
        if (p?.valor_nominal_calbas != null) { campos.querySelector('#v-ref').value = p.valor_nominal_calbas; preview(); }
      });
    }
    info.innerHTML = fichaCorta(eq);
  } catch (err) { campos.innerHTML = `<div class="notice error">${esc(errMsg(err))}</div>`; }
  refreshIcons();
  preview();
}

function fichaCorta(e) {
  return `<div class="eq-mini"><span class="eq-ico t-${esc(e.tipo_clave_calbas.toLowerCase())}">${icon(tipoIcono(e.tipo_clave_calbas, e.icono_calbas))}</span>
    <div><b>${esc(e.codigo_calbas)} · ${esc(e.tipo_nombre_calbas)}</b><span>${esc([e.departamento_calbas, e.ubicacion_calbas].filter(Boolean).join(' · '))}</span>
    <span>Última verificación: ${e.ultima_verificacion_calbas ? `${fmtDate(e.ultima_verificacion_calbas)} (${e.ultimo_dictamen_calbas === 'NO_CUMPLE' ? 'no cumple' : 'cumple'})` : 'ninguna'}</span></div></div>`;
}

function lecturasHTML(unidad, negativos) {
  const hoy = todayISO();
  const at = `type="number" step="any" inputmode="decimal" required ${negativos ? '' : 'min="0"'}`;
  return `<h4 class="section-label mt">Lecturas del equipo (${esc(unidad)})</h4>
    <div class="lect-grid">
      ${[1, 2, 3].map((i) => `<div class="field"><label for="v-l${i}">Lectura ${i} <span class="req">*</span></label><input id="v-l${i}" name="l${i}" ${at}></div>`).join('')}
      <div class="field avg"><label for="v-avg">Promedio</label><output id="v-avg" class="mono">—</output></div>
    </div>
    <div class="form-grid">
      <div class="field"><label for="v-fecha">Fecha <span class="req">*</span></label><input id="v-fecha" name="fecha" type="date" value="${hoy}" max="${hoy}" required></div>
      <div class="field full"><label for="v-obs">Observaciones</label><textarea id="v-obs" name="obs" rows="2" maxlength="500" placeholder="Opcional"></textarea></div>
    </div>
    <div class="form-actions"><button type="submit" class="btn primary lg" id="v-save">${icon('save')} Registrar verificación</button></div>`;
}

// Criterio aplicable a una báscula (refleja validar_verificacion_calbas)
function criterioBascula(fecha) {
  const { b, ver, cal } = ctx;
  const now = Date.now();
  const cals = cal.filter((c) => c.fecha_calibracion_calbas <= fecha && Date.parse(c.created_at_calbas) <= now)
    .sort((x, y) => x.fecha_calibracion_calbas.localeCompare(y.fecha_calibracion_calbas) || x.created_at_calbas.localeCompare(y.created_at_calbas));
  const ult = cals[cals.length - 1];
  const previas = ver.filter((v) => v.fecha_calbas <= fecha && (!ult || (v.fecha_calbas >= ult.fecha_calibracion_calbas && Date.parse(v.created_at_calbas) > Date.parse(ult.created_at_calbas))));
  if (previas.length) return 'EN_SERVICIO';
  if (ult) return 'VERIFICACION_INICIAL';
  return b.criterio_evaluacion_calbas === 'EN_SERVICIO' ? 'EN_SERVICIO' : 'VERIFICACION_INICIAL';
}

function leer() {
  const f = root.querySelector('#vf').elements;
  const raw = ['l1', 'l2', 'l3'].map((k) => f[k]?.value ?? '');
  const est = raw.every((x) => x !== '') ? estadistica(raw) : null;
  return { f, est, lecturas: raw.map(Number) };
}

function preview() {
  const box = root?.querySelector('#v-prev');
  if (!box) return;
  const card = (estado, items, nota) => {
    box.innerHTML = `<div class="prev-head"><div><span class="eyebrow">Vista previa</span><h3>Resultado metrológico</h3></div>${estado}</div>
      <div class="prev-grid">${items.map(([k, v, s]) => `<div class="prev-item"><small>${esc(k)}</small><b class="mono">${esc(v)}</b>${s ? `<span>${esc(s)}</span>` : ''}</div>`).join('')}</div>
      <p class="hint">${esc(nota)}</p>`;
    refreshIcons();
  };
  const pend = pill('Pendiente', 'gray');
  if (!eq) return card(pend, [['Equipo', '—'], ['Promedio', '—'], ['Error', '—'], ['Tolerancia', '—']], 'Selecciona un equipo para comenzar.');
  const { f, est } = leer();
  const avg = root.querySelector('#v-avg');
  if (!f.patron) return card(pend, [['Equipo', eq.codigo_calbas]], 'Cargando datos del equipo…');
  try {
    if (eq.origen_calbas === 'bascula') {
      const { b } = ctx;
      const crit = criterioBascula(f.fecha.value || todayISO());
      const p = ctx.pesas.find((x) => x.id_calbas === f.patron.value);
      if (avg) avg.textContent = est ? `${fmtVal(est.prom)} ${b.unidad_calbas}` : '—';
      const base = [['Clase / criterio', CLASES[b.clase_exactitud_calbas], CRITERIOS[crit]], ['Promedio', est ? `${fmtVal(est.prom)} ${b.unidad_calbas}` : '—', 'Unidad de la báscula']];
      if (!p) return card(pend, base, 'Selecciona una pesa patrón para calcular el EMT.');
      const patG = aGramos(p.valor_nominal_calbas, p.unidad_calbas), eG = aGramos(b.division_verificacion_e_calbas, b.unidad_calbas);
      const div = patG / eG, fac = factorEMT(b.clase_exactitud_calbas, crit, div), emt = eG * fac;
      base.push(['Divisiones de carga (m/e)', fmtVal(div, 2), `Factor ${fmtVal(fac)}`], ['EMT permitido', `± ${fmtVal(emt, 4)} g`]);
      if (!est) return card(pend, base, 'Captura las tres lecturas para determinar el error y el dictamen.');
      const err = aGramos(est.prom, b.unidad_calbas) - patG, ok = Math.abs(err) <= emt;
      base.push(['Error de indicación', `${fmtSigned(err)} g`, `${fmtVal(Math.abs(err) / emt * 100, 1)} % del EMT`]);
      return card(dictamenPill(ok ? 'CUMPLE' : 'NO_CUMPLE'), base, 'Dictamen orientativo. La base de datos lo recalcula al guardar.');
    }
    const { e } = ctx;
    const ref = f.ref.value === '' ? null : Number(f.ref.value);
    if (avg) avg.textContent = est ? `${fmtVal(est.prom)} ${e.unidad_calbas}` : '—';
    const tol = ref == null ? null : (e.tolerancia_tipo_calbas === 'PORCENTAJE' ? Math.abs(ref) * e.tolerancia_calbas / 100 : Number(e.tolerancia_calbas));
    const base = [['Valor de referencia', ref == null ? '—' : `${fmtVal(ref)} ${e.unidad_calbas}`],
      ['Tolerancia', tol == null ? '—' : `± ${fmtVal(tol, 4)} ${e.unidad_calbas}`, e.tolerancia_tipo_calbas === 'PORCENTAJE' ? `${fmtVal(e.tolerancia_calbas)} % de la referencia` : 'Absoluta'],
      ['Promedio', est ? `${fmtVal(est.prom)} ${e.unidad_calbas}` : '—']];
    if (ref == null || !est) return card(pend, base, 'Captura el valor de referencia y las tres lecturas.');
    const err = est.prom - ref;
    const okErr = Math.abs(err) <= tol + 1e-12;
    const okCv = !e.cv_max_pct_calbas || (est.cv ?? 0) <= e.cv_max_pct_calbas;
    base.push(['Error', `${fmtSigned(err)} ${e.unidad_calbas}`, okErr ? 'Dentro de tolerancia' : 'Fuera de tolerancia']);
    if (e.cv_max_pct_calbas) base.push(['CV (repetibilidad)', `${fmtVal(est.cv, 3)} %`, `Máximo ${fmtVal(e.cv_max_pct_calbas)} %`]);
    return card(dictamenPill(okErr && okCv ? 'CUMPLE' : 'NO_CUMPLE'), base, 'Dictamen orientativo. La base de datos lo recalcula al guardar.');
  } catch (err) { return card(pend, [['Equipo', eq.codigo_calbas]], err.message); }
}

async function guardar(ev) {
  ev.preventDefault();
  const form = ev.currentTarget;
  if (!eq) { toast('Selecciona un equipo.', 'warning'); return; }
  if (!checkForm(form)) return;
  const { f, est, lecturas } = leer();
  if (!est) { toast('Captura las tres lecturas.', 'warning'); return; }
  const btn = root.querySelector('#v-save');
  btn.disabled = true; btn.innerHTML = '<span class="spinner sm"></span> Registrando…';
  try {
    let r;
    if (eq.origen_calbas === 'bascula') {
      r = must(await sb.from('verificaciones_calbas').insert({
        bascula_id_calbas: eq.id_calbas, departamento_id_calbas: eq.departamento_id_calbas, pesa_patron_id_calbas: f.patron.value,
        pesa_patron_valor_calbas: ctx.pesas.find((p) => p.id_calbas === f.patron.value)?.valor_nominal_calbas,
        lectura_1_calbas: lecturas[0], lectura_2_calbas: lecturas[1], lectura_3_calbas: lecturas[2], promedio_lecturas_calbas: est.prom, peso_real_calbas: est.prom,
        unidad_calbas: ctx.b.unidad_calbas, fecha_calbas: f.fecha.value, observaciones_calbas: f.obs.value.trim() || null,
      }).select('id_calbas, dictamen_calbas, error_indicacion_calbas, emt_permitido_calbas').single()).data;
      if (r.dictamen_calbas === 'NO_CUMPLE') sb.functions.invoke('alerta_inmediata_calbas', { body: { verification_id_calbas: r.id_calbas } }).catch(() => {});
    } else {
      r = must(await sb.from('verificaciones_equipo_calbas').insert({
        equipo_id_calbas: eq.id_calbas, departamento_id_calbas: eq.departamento_id_calbas, patron_id_calbas: f.patron.value,
        valor_referencia_calbas: Number(f.ref.value), lectura_1_calbas: lecturas[0], lectura_2_calbas: lecturas[1], lectura_3_calbas: lecturas[2],
        fecha_calbas: f.fecha.value, observaciones_calbas: f.obs.value.trim() || null,
      }).select('id_calbas, dictamen_calbas').single()).data;
    }
    const ok = r.dictamen_calbas === 'CUMPLE';
    toast(ok ? `Verificación registrada: ${eq.codigo_calbas} CUMPLE.` : `Verificación registrada: ${eq.codigo_calbas} NO CUMPLE. Retira el equipo de uso y notifica a Calidad.`, ok ? 'success' : 'error', 8000);
    resultado(ok);
  } catch (err) {
    toast(errMsg(err), 'error');
    btn.disabled = false; btn.innerHTML = `${icon('save')} Registrar verificación`; refreshIcons();
  }
}

function resultado(ok) {
  root.querySelector('.verif-layout').innerHTML = `<div class="card result-card ${ok ? 'ok' : 'bad'}">
    <div class="result-ico">${icon(ok ? 'circle-check-big' : 'octagon-alert')}</div>
    <h2>${ok ? 'El equipo cumple' : 'El equipo no cumple'}</h2>
    <p>${esc(eq.codigo_calbas)} · ${esc(eq.tipo_nombre_calbas)} — ${ok ? 'puede seguir en uso hasta su próxima verificación.' : 'identifícalo como “fuera de uso” y solicita ajuste o calibración.'}</p>
    <div class="page-actions center">
      <button class="btn primary" data-go="#/verificar">${icon('clipboard-plus')} Registrar otra</button>
      <button class="btn secondary" data-go="#/historial">${icon('history')} Ver historial</button>
    </div></div>`;
  root.querySelector('.result-card').addEventListener('click', (e) => {
    const b = e.target.closest('[data-go]');
    if (b) navigate(b.dataset.go);
  });
  refreshIcons();
}
