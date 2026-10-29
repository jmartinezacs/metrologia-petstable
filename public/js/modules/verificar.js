// =====================================================================
// Registrar verificación según el método del tipo de equipo:
//  · Básculas: pesa patrón + 3 lecturas → EMT según clase/criterio (OIML R76).
//  · Potenciómetros (MULTIPUNTO): una lectura por buffer + ajuste opcional.
//  · Termómetros (PUNTO_UNICO): patrón vs lectura, corrección y lectura final.
//  · Micropipetas (SOLO_CALIBRACION): no se verifican.
// La vista previa es orientativa: el dictamen definitivo lo calcula la base
// de datos (validar_verificacion_calbas / validar_verificacion_equipo_calbas).
// =====================================================================
import {
  sb, esc, icon, refreshIcons, toast, errMsg, must, checkForm, pill, fmtDate, fmtVal, fmtSigned, todayISO,
  aGramos, factorEMT, estadistica, U, convertirMasa, CLASES, CRITERIOS, tipoIcono, navigate, dictamenPill, emptyState,
  avisar, openModal, addDays,
} from '../core.js';
import { cargarEquipos } from './equipos.js';

let root, equipos = [], eq = null, ctx = {};

export default {
  async render(el, params = {}) {
    root = el; eq = null; ctx = {};
    el.innerHTML = `
      <section class="page-intro">
        <div><span class="eyebrow">Control metrológico</span><h1>Registrar verificación</h1>
          <p>Registra la medición contra un patrón vigente. Si ajustas o corriges el equipo, se guarda cómo se encontró y cómo se dejó.</p></div>
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
    // Las micropipetas y otros equipos de solo calibración no se verifican
    equipos = (await cargarEquipos()).filter((e) => e.activo_calbas && e.requiere_verificacion_calbas !== false);
    const sel = el.querySelector('#v-eq');
    if (!equipos.length) {
      el.querySelector('.verif-layout').outerHTML = `<div class="card">${emptyState({ ico: 'gauge', title: 'No hay equipos disponibles', text: 'No tienes equipos activos asignados a tus departamentos. Solicítalo a un administrador.' })}</div>`;
      refreshIcons(); return;
    }
    const grupos = {};
    equipos.forEach((e) => (grupos[e.tipo_nombre_calbas] ||= []).push(e));
    sel.innerHTML = '<option value="">Selecciona un equipo…</option>' + Object.entries(grupos).map(([g, list]) => `<optgroup label="${esc(g)}">${list.map((e) =>
      `<option value="${e.id_calbas}">${esc(e.tipo_nombre_calbas.replace(/ \(pH\)$/, ''))} · ${esc(e.codigo_calbas)} · ${esc(e.ubicacion_calbas || e.departamento_calbas || '')}</option>`).join('')}</optgroup>`).join('');
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
          <option value="">${ctx.pesas.length ? 'Selecciona…' : 'No hay pesas patrón vigentes'}</option>${ctx.pesas.map((p) => `<option value="${p.id_calbas}">${esc(p.codigo_calbas)} · ${fmtVal(p.valor_nominal_calbas)} ${esc(U(p.unidad_calbas))}</option>`).join('')}</select></div>
        <p class="hint">Las lecturas se capturan en la unidad de la pesa patrón seleccionada; al guardar se convierten a la unidad de la báscula (${esc(U(ctx.b.unidad_calbas))}).</p>
        ${lecturasHTML(ctx.b.unidad_calbas, false)}`;
      campos.querySelector('#v-pat').addEventListener('change', (ev) => {
        const p = ctx.pesas.find((x) => x.id_calbas === ev.target.value);
        campos.querySelector('#v-ulect').textContent = U(p ? p.unidad_calbas : ctx.b.unidad_calbas);
      });
    } else {
      const [e, pats, tipo] = await Promise.all([
        sb.from('equipos_calbas').select('*').eq('id_calbas', id).single().then(must),
        sb.from('patrones_calbas').select('*').eq('activo_calbas', true).order('codigo_calbas').then(must),
        sb.from('tipos_equipo_calbas').select('*').eq('clave_calbas', eq.tipo_clave_calbas).single().then(must),
      ]);
      ctx = { e: e.data, tipo: tipo.data, metodo: tipo.data.metodo_calbas || 'PUNTO_UNICO',
        pats: pats.data.filter((p) => p.tipo_id_calbas === e.data.tipo_id_calbas && (!p.fecha_vencimiento_calbas || p.fecha_vencimiento_calbas >= hoy)) };
      if (ctx.metodo === 'SOLO_CALIBRACION') {
        campos.innerHTML = `<div class="notice info">${icon('info')}<span>${esc(ctx.tipo.guia_calbas || 'Este tipo de equipo no lleva verificación interna.')} <a href="#/calibraciones">Ir a Calibraciones</a></span></div>`;
      } else {
        const patronSel = `<div class="field"><label for="v-pat">${ctx.metodo === 'MULTIPUNTO' ? 'Juego de buffers / patrón' : 'Patrón de referencia'} <span class="req">*</span></label><select id="v-pat" name="patron" required>
            <option value="">${ctx.pats.length ? 'Selecciona…' : 'No hay patrones vigentes para este tipo (regístralo en Patrones)'}</option>${ctx.pats.map((p) => `<option value="${p.id_calbas}">${esc(p.codigo_calbas)} · ${esc(p.descripcion_calbas)}${p.lote_calbas ? ` · lote ${esc(p.lote_calbas)}` : ''}</option>`).join('')}</select></div>`;
        campos.innerHTML = `
          ${ctx.tipo.guia_calbas ? `<div class="notice info">${icon('info')}<span>${esc(ctx.tipo.guia_calbas)}</span></div>` : ''}
          ${ctx.metodo === 'MULTIPUNTO' ? multipuntoHTML() : puntoUnicoHTML(patronSel)}
          ${pieHTML()}`;
        campos.querySelector('#v-pat')?.addEventListener('change', (ev) => {
          const p = ctx.pats.find((x) => x.id_calbas === ev.target.value);
          if (ctx.metodo === 'PUNTO_UNICO' && p?.valor_nominal_calbas != null) { campos.querySelector('#v-ref').value = p.valor_nominal_calbas; preview(); }
        });
        // Buffers: el valor del punto toma el valor nominal del patrón elegido
        const sincronizarRef = (s) => {
          const p = ctx.pats.find((x) => x.id_calbas === s.value), ref = campos.querySelector(`[name="ref${s.dataset.pb}"]`);
          if (p?.valor_nominal_calbas != null && ref) ref.value = p.valor_nominal_calbas;
        };
        campos.querySelectorAll('[data-pb]').forEach((s) => { sincronizarRef(s); s.addEventListener('change', () => { sincronizarRef(s); preview(); }); });
        // Mostrar / ocultar la sección de ajuste o corrección
        campos.querySelector('#v-ajuste').addEventListener('change', (ev) => {
          campos.querySelector('#v-ajuste-box').classList.toggle('hidden', !ev.target.checked);
          campos.querySelectorAll('#v-ajuste-box input[data-post]').forEach((i) => { i.required = ev.target.checked; });
          if (ev.target.checked && ctx.metodo === 'PUNTO_UNICO') {
            const { f } = leerGenerico();
            if (f.correccion.value === '' && f.ref.value !== '' && f.l1.value !== '') f.correccion.value = fmtNum6(Number(f.ref.value) - Number(f.l1.value));
          }
          preview();
        });
      }
    }
    info.innerHTML = fichaCorta(eq) + sinUsoHTML(eq);
    info.querySelector("[data-sin-uso]")?.addEventListener("click", () => registrarSinUso(eq));
  } catch (err) { campos.innerHTML = `<div class="notice error">${esc(errMsg(err))}</div>`; }
  refreshIcons();
  preview();
}

function fichaCorta(e) {
  return `<div class="eq-mini"><span class="eq-ico t-${esc(e.tipo_clave_calbas.toLowerCase())}">${icon(tipoIcono(e.tipo_clave_calbas, e.icono_calbas))}</span>
    <div><b>${esc(e.codigo_calbas)} · ${esc(e.tipo_nombre_calbas)}</b><span>${esc([e.departamento_calbas, e.ubicacion_calbas].filter(Boolean).join(' · '))}</span>
    <span>Última verificación: ${e.ultima_verificacion_calbas ? `${fmtDate(e.ultima_verificacion_calbas)} (${e.ultimo_dictamen_calbas === 'NO_CUMPLE' ? 'no cumple' : 'cumple'})` : 'ninguna'}</span></div></div>`;
}

// «No se usó»: si al equipo le toca verificación y no se utilizó en el día, se registra
// el día sin uso y la próxima verificación se cuenta desde esa fecha
const leTocaVerificar = (e) => !e.proxima_verificacion_calbas || e.proxima_verificacion_calbas <= todayISO();
function sinUsoHTML(e) {
  if (!leTocaVerificar(e)) return '';
  const hoyMarcado = e.ultimo_sin_uso_calbas === todayISO();
  return `<div class="sin-uso ${hoyMarcado ? 'ok' : ''}">${icon(hoyMarcado ? 'circle-check' : 'calendar-off')}
    <span>${hoyMarcado ? '<b>Hoy está registrado como día sin uso.</b> Si se llega a usar, verifícalo normalmente.' : '<b>¿Hoy no se usó este equipo?</b> Regístralo en lugar de la verificación; no contará como atraso.'}</span>
    ${hoyMarcado ? '' : `<button type="button" class="btn outline sm" data-sin-uso>${icon('calendar-off')} No se usó</button>`}</div>`;
}
async function registrarSinUso(e) {
  const hoy = todayISO();
  const ok = await openModal({
    title: `${e.codigo_calbas} · día sin uso`, subtitle: 'El equipo no se utilizó en el día que le tocaba verificación.', size: 'sm', submitText: 'Registrar día sin uso', confirmDiscard: false,
    body: `<div class="field"><label for="su-f">Fecha <span class="req">*</span></label><input id="su-f" name="fecha" type="date" value="${hoy}" min="${addDays(hoy, -7)}" max="${hoy}" required></div>
      <div class="field"><label for="su-o">Observaciones</label><textarea id="su-o" name="obs" rows="2" maxlength="300" placeholder="Opcional, p. ej. línea detenida por mantenimiento"></textarea></div>
      <p class="hint">${icon('info')} Si el equipo se usa más tarde, regístrale su verificación normalmente.</p>`,
    onSubmit: async ({ form }) => {
      if (!checkForm(form)) return false;
      must(await sb.from('sin_uso_calbas').insert({ origen_calbas: e.origen_calbas, equipo_id_calbas: e.id_calbas, fecha_calbas: form.elements.fecha.value, observaciones_calbas: form.elements.obs.value.trim() || null }));
      return true;
    },
  });
  if (!ok) return;
  toast(`${e.codigo_calbas}: día sin uso registrado.`, 'success');
  navigate('#/verificar');
}

function lecturasHTML(unidad, negativos) {
  const at = `type="number" step="any" inputmode="decimal" required ${negativos ? '' : 'min="0"'}`;
  return `<h4 class="section-label mt">Lecturas del equipo <span class="u">(<span id="v-ulect">${esc(U(unidad))}</span>)</span></h4>
    <div class="lect-grid">
      ${[1, 2, 3].map((i) => `<div class="field"><label for="v-l${i}">Lectura ${i} <span class="req">*</span></label><input id="v-l${i}" name="l${i}" ${at}></div>`).join('')}
      <div class="field avg"><label for="v-avg">Promedio</label><output id="v-avg" class="mono">—</output></div>
    </div>${pieHTML()}`;
}
function pieHTML() {
  const hoy = todayISO();
  return `<div class="form-grid mt">
      <div class="field"><label for="v-fecha">Fecha <span class="req">*</span></label><input id="v-fecha" name="fecha" type="date" value="${hoy}" max="${hoy}" required></div>
      <div class="field full"><label for="v-obs">Observaciones</label><textarea id="v-obs" name="obs" rows="2" maxlength="500" placeholder="Sin observaciones"></textarea></div>
      <label class="switch-row full etq-switch"><span><b>${icon('tag')} Etiqueta dañada</b><small>Márcalo si la etiqueta de identificación está rota, ilegible o se desprendió. Se avisará a los administradores para reemplazarla.</small></span><input type="checkbox" name="etiqueta"></label>
    </div>
    <div class="form-actions"><button type="submit" class="btn primary lg" id="v-save">${icon('save')} Registrar verificación</button></div>`;
}
const fmtNum6 = (n) => String(Math.round(n * 1e6) / 1e6);
// Con negativos no se usa inputmode="decimal": ese teclado del celular no tiene el signo «−»
const numAt = () => `type="number" step="any" ${ctx.tipo.permite_negativos_calbas ? '' : 'inputmode="decimal" min="0"'}`;
// Con 3 o más buffers, el último (p. ej. pH 10.01) es opcional
const bufferOpcional = (i, n) => n >= 3 && i === n - 1;

// Potenciómetro: una lectura por buffer y, si hubo ajuste, la lectura después del ajuste
function multipuntoHTML() {
  const u = U(ctx.e.unidad_calbas);
  const puntos = ctx.tipo.puntos_referencia_calbas || [];
  // Un patrón (buffer certificado) por punto; se preselecciona el que tiene ese valor nominal
  const pick = (r) => ctx.pats.find((p) => p.valor_nominal_calbas != null && Math.abs(Number(p.valor_nominal_calbas) - Number(r)) < 1e-9)?.id_calbas;
  const opts = (sel) => `<option value="">${ctx.pats.length ? 'Selecciona…' : 'No hay patrones vigentes'}</option>${ctx.pats.map((p) => `<option value="${p.id_calbas}" ${p.id_calbas === sel ? 'selected' : ''}>${esc(p.codigo_calbas)} · ${esc(p.descripcion_calbas)}${p.lote_calbas ? ` · lote ${esc(p.lote_calbas)}` : ''}</option>`).join('')}`;
  return `<h4 class="section-label">Buffers certificados utilizados</h4>
    <div class="buffers-grid">
      ${puntos.map((r, i) => `<div class="field"><label for="v-pb${i}">Buffer ${esc(r)} ${bufferOpcional(i, puntos.length) ? '<span class="opc">(opcional)</span>' : '<span class="req">*</span>'}</label>
        <select id="v-pb${i}" name="pb${i}" data-pb="${i}" ${bufferOpcional(i, puntos.length) ? '' : 'required'}>${opts(bufferOpcional(i, puntos.length) ? '' : pick(r))}</select></div>`).join('')}
      <div class="field"><label for="v-temp">Temperatura de los buffers (°C)</label><input id="v-temp" name="temp" type="number" step="any" inputmode="decimal" value="25"></div>
    </div>
    <h4 class="section-label mt">Lecturas en cada buffer <span class="u">(${esc(u)})</span></h4>
    <div class="pt-table">
      <div class="pt-row pt-head"><span>Buffer</span><span>Lectura del equipo</span><span>Desviación</span><span>Estado</span></div>
      ${puntos.map((r, i) => `<div class="pt-row ${bufferOpcional(i, puntos.length) ? 'pt-opcional' : ''}" data-pt="${i}">
        <span class="pt-ref"><input name="ref${i}" ${numAt()} required value="${esc(r)}" aria-label="Valor del buffer ${i + 1}">${bufferOpcional(i, puntos.length) ? '<small class="pt-opc">Opcional</small>' : ''}</span>
        <span><input name="l${i + 1}" ${numAt()} ${bufferOpcional(i, puntos.length) ? 'placeholder="Vacío si no se usó"' : `required placeholder="${esc(r)}"`} aria-label="Lectura en el buffer ${esc(r)}"></span>
        <span class="mono" data-dev>—</span><span data-st>${pill('Pendiente', 'gray')}</span></div>`).join('')}
    </div>
    ${puntos.length >= 3 ? `<p class="hint">${icon('info')} El buffer ${esc(puntos[puntos.length - 1])} es opcional: si no lo usaste, deja su lectura vacía.</p>` : ''}
    <label class="switch-row mt"><span><b>Se realizó ajuste del potenciómetro</b><small>Márcalo si alguna lectura se desvió y ajustaste el equipo. Registra las lecturas después del ajuste.</small></span><input type="checkbox" id="v-ajuste" name="ajuste"></label>
    <div id="v-ajuste-box" class="ajuste-box hidden">
      <h4 class="section-label">Lecturas después del ajuste <span class="u">(${esc(u)})</span></h4>
      <div class="pt-table">
        ${puntos.map((r, i) => `<div class="pt-row" data-post-row="${i}"><span class="pt-ref"><b>${esc(r)}</b></span>
          <span><input name="post${i}" data-post ${numAt()} placeholder="${esc(r)}" aria-label="Lectura después del ajuste en el buffer ${esc(r)}"></span>
          <span class="mono" data-dev>—</span><span data-st>${pill('Pendiente', 'gray')}</span></div>`).join('')}
      </div>
    </div>`;
}

// Termómetro / termohigrómetro: patrón vs lectura; si hay desviación, corrección y lectura final
function puntoUnicoHTML(patronSel) {
  const u = U(ctx.e.unidad_calbas);
  return `<div class="form-grid">${patronSel}<div></div>
      <div class="field"><label for="v-ref">Medición patrón (${esc(u)}) <span class="req">*</span></label><input id="v-ref" name="ref" ${numAt()} required placeholder="Ej. 0 en punto de hielo"></div>
      <div class="field"><label for="v-l1">Medición del ${esc(ctx.tipo.nombre_calbas.toLowerCase())} (${esc(u)}) <span class="req">*</span></label><input id="v-l1" name="l1" ${numAt()} required></div>
    </div>
    <details class="rep-box"><summary>${icon('repeat')} Agregar lecturas de repetibilidad (opcional)</summary>
      <div class="form-grid"><div class="field"><label for="v-l2">Lectura 2</label><input id="v-l2" name="l2" ${numAt()}></div>
        <div class="field"><label for="v-l3">Lectura 3</label><input id="v-l3" name="l3" ${numAt()}></div></div></details>
    <div class="dev-strip" id="v-dev"><small>Desviación (medición − patrón)</small><b class="mono">—</b></div>
    <label class="switch-row mt"><span><b>Se aplicó corrección</b><small>Si hubo desviación, corrige el equipo y registra cuánto le subiste (+) o bajaste (−) y la lectura después de corregir.</small></span><input type="checkbox" id="v-ajuste" name="ajuste"></label>
    <div id="v-ajuste-box" class="ajuste-box hidden"><div class="form-grid">
      <div class="field"><label for="v-cor">Corrección aplicada (${esc(u)})</label><input id="v-cor" name="correccion" type="number" step="any" placeholder="+ sube / − baja"><small class="hint">Se sugiere el valor que lleva la desviación a cero.</small></div>
      <div class="field"><label for="v-post0">Medición después de corregir (${esc(u)}) <span class="req">*</span></label><input id="v-post0" name="post0" data-post ${numAt()}></div>
      <div class="dev-strip full" id="v-dev-fin"><small>Desviación final (debe ser 0)</small><b class="mono">—</b></div></div></div>`;
}

function leerGenerico() {
  const f = root.querySelector('#vf').elements;
  const num = (x) => (x === undefined || x === null || x === '' ? null : Number(x));
  const ajuste = !!f.ajuste?.checked;
  if (ctx.metodo === 'MULTIPUNTO') {
    const n = (ctx.tipo.puntos_referencia_calbas || []).length;
    const refs = [], lect = [], post = [], usado = [], pbs = [];
    for (let i = 0; i < n; i++) {
      refs.push(num(f[`ref${i}`]?.value)); lect.push(num(f[`l${i + 1}`]?.value)); post.push(num(f[`post${i}`]?.value));
      pbs.push(f[`pb${i}`]?.value || null);
      usado.push(!bufferOpcional(i, n) || lect[i] != null);
    }
    const sel = (a) => a.filter((_, i) => usado[i]);
    return { f, ajuste, refs, lect, post, usado, sel, pbs };
  }
  const lect = ['l1', 'l2', 'l3'].map((k) => num(f[k]?.value));
  return { f, ajuste, ref: num(f.ref?.value), lect, post: [num(f.post0?.value)], cor: num(f.correccion?.value) };
}
const tolDe = (e, ref) => (e.tolerancia_tipo_calbas === 'PORCENTAJE' ? Math.abs(ref) * e.tolerancia_calbas / 100 : Number(e.tolerancia_calbas));

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
  if (ctx.metodo === 'SOLO_CALIBRACION') return card(pill('No aplica', 'info'), [['Equipo', eq.codigo_calbas]], 'Este equipo solo lleva calibraciones externas.');
  if (!f.patron && !f.pb0) return card(pend, [['Equipo', eq.codigo_calbas]], 'Cargando datos del equipo…');
  try {
    if (eq.origen_calbas === 'bascula') {
      const { b } = ctx;
      const crit = criterioBascula(f.fecha.value || todayISO());
      const p = ctx.pesas.find((x) => x.id_calbas === f.patron.value);
      const uL = p ? p.unidad_calbas : b.unidad_calbas;
      if (avg) avg.textContent = est ? `${fmtVal(est.prom)} ${U(uL)}` : '—';
      const base = [['Clase / criterio', CLASES[b.clase_exactitud_calbas], CRITERIOS[crit]], ['Promedio', est ? `${fmtVal(est.prom)} ${U(uL)}` : '—', 'En la unidad de la pesa patrón']];
      if (!p) return card(pend, base, 'Selecciona una pesa patrón para calcular el EMT.');
      const patG = aGramos(p.valor_nominal_calbas, p.unidad_calbas), eG = aGramos(b.division_verificacion_e_calbas, b.unidad_calbas);
      const div = patG / eG, fac = factorEMT(b.clase_exactitud_calbas, crit, div), emt = eG * fac;
      base.push(['Divisiones de carga (m/e)', fmtVal(div, 2), `Factor ${fmtVal(fac)}`], ['EMT permitido', `± ${fmtVal(emt, 4)} g`]);
      if (!est) return card(pend, base, 'Captura las tres lecturas para determinar el error y el dictamen.');
      const err = aGramos(est.prom, uL) - patG, ok = Math.abs(err) <= emt;
      base.push(['Error de indicación', `${fmtSigned(err)} g`, `${fmtVal(Math.abs(err) / emt * 100, 1)} % del EMT`]);
      const bajoMin = b.capacidad_minima_calbas && patG < aGramos(b.capacidad_minima_calbas, b.unidad_calbas);
      return card(dictamenPill(ok ? 'CUMPLE' : 'NO_CUMPLE'), base, `${bajoMin ? `⚠ La pesa patrón está por debajo de la capacidad mínima de la báscula (${fmtVal(b.capacidad_minima_calbas)} ${U(b.unidad_calbas)}); usa una pesa mayor para una verificación representativa. ` : ''}Dictamen orientativo. La base de datos lo recalcula al guardar.`);
    }
    const { e } = ctx;
    const ue = U(e.unidad_calbas);
    const tolTxt = e.tolerancia_tipo_calbas === 'PORCENTAJE' ? `± ${fmtVal(e.tolerancia_calbas)} %` : `± ${fmtVal(e.tolerancia_calbas, 4)} ${ue}`;
    const g = leerGenerico();
    const estadoPt = (d, tol) => (d == null ? pill('Pendiente', 'gray') : Math.abs(d) <= tol + 1e-12 ? pill('Cumple', 'ok') : pill('Fuera', 'bad'));
    const finalTxt = (ok) => (ok == null ? '' : ok ? ' · después del ajuste: cumple' : ' · después del ajuste: no cumple');
    if (ctx.metodo === 'MULTIPUNTO') {
      let ok = true, todos = true, maxD = null, okPost = null, todosPost = g.ajuste;
      g.refs.forEach((r, i) => {
        const row = root.querySelector(`[data-pt="${i}"]`), l = g.lect[i];
        const prow0 = root.querySelector(`[data-post-row="${i}"]`);
        prow0?.classList.toggle('hidden', !g.usado[i]);
        if (!g.usado[i]) { row.querySelector('[data-dev]').textContent = '—'; row.querySelector('[data-st]').innerHTML = pill('No se usó', 'gray'); return; }
        const d = r == null || l == null ? null : l - r, tol = r == null ? 0 : tolDe(e, r);
        if (d == null) todos = false; else { if (Math.abs(d) > tol + 1e-12) ok = false; if (maxD == null || Math.abs(d) > Math.abs(maxD)) maxD = d; }
        row.querySelector('[data-dev]').textContent = d == null ? '—' : fmtSigned(d, 4);
        row.querySelector('[data-st]').innerHTML = estadoPt(d, tol);
        const prow = root.querySelector(`[data-post-row="${i}"]`), p = g.post[i];
        const dp = r == null || p == null ? null : p - r;
        if (prow) { prow.querySelector('[data-dev]').textContent = dp == null ? '—' : fmtSigned(dp, 4); prow.querySelector('[data-st]').innerHTML = estadoPt(dp, tol); }
        if (g.ajuste) { if (dp == null) todosPost = false; else okPost = (okPost ?? true) && Math.abs(dp) <= tol + 1e-12; }
      });
      const base = [['Buffers', g.sel(g.refs).map((r) => fmtVal(r)).join(' / ')], ['Tolerancia por buffer', tolTxt],
        ['Mayor desviación', maxD == null ? '—' : `${fmtSigned(maxD, 4)} ${ue}`]];
      if (g.ajuste) base.push(['Después del ajuste', todosPost ? (okPost ? 'Todos en tolerancia' : 'Aún fuera de tolerancia') : 'Captura las lecturas']);
      if (!todos) return card(pend, base, 'Captura la lectura del equipo en cada buffer.');
      return card(dictamenPill(ok ? 'CUMPLE' : 'NO_CUMPLE'), base, `Dictamen «como se encontró»${finalTxt(g.ajuste && todosPost ? okPost : null)}. La base de datos lo recalcula al guardar.`);
    }
    // PUNTO_UNICO
    const ls = g.lect.filter((x) => x != null);
    const prom = ls.length ? ls.reduce((s, x) => s + x, 0) / ls.length : null;
    const d = g.ref == null || prom == null ? null : prom - g.ref;
    const tol = g.ref == null ? null : tolDe(e, g.ref);
    root.querySelector('#v-dev b').textContent = d == null ? '—' : `${fmtSigned(d, 4)} ${ue}`;
    root.querySelector('#v-dev').className = `dev-strip ${d == null ? '' : Math.abs(d) < 1e-9 ? 'ok' : Math.abs(d) <= tol + 1e-12 ? 'warn' : 'bad'}`;
    const p = g.post[0], df = g.ref == null || p == null ? null : p - g.ref;
    const fin = root.querySelector('#v-dev-fin');
    if (fin) { fin.querySelector('b').textContent = df == null ? '—' : `${fmtSigned(df, 4)} ${ue}`; fin.className = `dev-strip full ${df == null ? '' : Math.abs(df) < 1e-9 ? 'ok' : Math.abs(df) <= tol + 1e-12 ? 'warn' : 'bad'}`; }
    const base = [['Medición patrón', g.ref == null ? '—' : `${fmtVal(g.ref)} ${ue}`], ['Medición del equipo', prom == null ? '—' : `${fmtVal(prom)} ${ue}`, ls.length > 1 ? `Promedio de ${ls.length} lecturas` : ''],
      ['Desviación', d == null ? '—' : `${fmtSigned(d, 4)} ${ue}`], ['Tolerancia', tolTxt]];
    if (g.ajuste) base.push(['Corrección aplicada', g.cor == null ? '—' : `${fmtSigned(g.cor, 4)} ${ue}`], ['Desviación final', df == null ? '—' : `${fmtSigned(df, 4)} ${ue}`]);
    if (d == null) return card(pend, base, 'Captura la medición patrón y la del equipo.');
    const ok = Math.abs(d) <= tol + 1e-12;
    const nota = !g.ajuste && Math.abs(d) > 1e-9 ? 'Hay desviación: si corriges el equipo, marca «Se aplicó corrección» y registra la lectura final. ' : '';
    return card(dictamenPill(ok ? 'CUMPLE' : 'NO_CUMPLE'), base, `${nota}Dictamen «como se encontró»${finalTxt(g.ajuste && df != null ? Math.abs(df) <= tol + 1e-12 : null)}. La base de datos lo recalcula al guardar.`);
  } catch (err) { return card(pend, [['Equipo', eq.codigo_calbas]], err.message); }
}

async function guardar(ev) {
  ev.preventDefault();
  const form = ev.currentTarget;
  if (!eq) { toast('Selecciona un equipo.', 'warning'); return; }
  if (eq.origen_calbas !== 'bascula' && ctx.metodo === 'SOLO_CALIBRACION') { toast('Este equipo no lleva verificación interna.', 'warning'); return; }
  // El buffer opcional sin lectura tampoco pide lectura después del ajuste
  if (eq.origen_calbas !== 'bascula' && ctx.metodo === 'MULTIPUNTO') {
    const g = leerGenerico();
    g.usado.forEach((u, i) => {
      const p = form.elements[`post${i}`]; if (p) p.required = g.ajuste && u;
      const pb = form.elements[`pb${i}`]; if (pb) pb.required = u;
    });
  }
  if (!checkForm(form)) return;
  const { f, est, lecturas } = leer();
  if (eq.origen_calbas === 'bascula' && !est) { toast('Captura las tres lecturas.', 'warning'); return; }
  const btn = root.querySelector('#v-save');
  btn.disabled = true; btn.innerHTML = '<span class="spinner sm"></span> Registrando…';
  try {
    let r;
    if (eq.origen_calbas === 'bascula') {
      // Las lecturas se capturan en la unidad de la pesa y se guardan en la de la báscula
      const pesa = ctx.pesas.find((p) => p.id_calbas === f.patron.value);
      const aBas = (x) => Math.round(convertirMasa(x, pesa.unidad_calbas, ctx.b.unidad_calbas) * 1e6) / 1e6;
      const l = lecturas.map(aBas), prom = Math.round(((l[0] + l[1] + l[2]) / 3) * 1e6) / 1e6;
      r = must(await sb.from('verificaciones_calbas').insert({
        bascula_id_calbas: eq.id_calbas, departamento_id_calbas: eq.departamento_id_calbas, pesa_patron_id_calbas: f.patron.value,
        pesa_patron_valor_calbas: pesa.valor_nominal_calbas,
        lectura_1_calbas: l[0], lectura_2_calbas: l[1], lectura_3_calbas: l[2], promedio_lecturas_calbas: prom, peso_real_calbas: prom,
        unidad_calbas: ctx.b.unidad_calbas, fecha_calbas: f.fecha.value, observaciones_calbas: f.obs.value.trim() || null, etiqueta_danada_calbas: f.etiqueta.checked,
      }).select('id_calbas, dictamen_calbas, error_indicacion_calbas, emt_permitido_calbas').single()).data;
      if (r.dictamen_calbas === 'NO_CUMPLE') avisar({ accion: 'no_cumple', origen: 'bascula', id: r.id_calbas });
    } else {
      const g = leerGenerico();
      const row = { equipo_id_calbas: eq.id_calbas, departamento_id_calbas: eq.departamento_id_calbas, patron_id_calbas: ctx.metodo === 'MULTIPUNTO' ? g.sel(g.pbs)[0] : f.patron.value,
        fecha_calbas: f.fecha.value, observaciones_calbas: f.obs.value.trim() || null, ajuste_realizado_calbas: g.ajuste, etiqueta_danada_calbas: f.etiqueta.checked };
      if (ctx.metodo === 'MULTIPUNTO') {
        const refs = g.sel(g.refs), lect = g.sel(g.lect);
        Object.assign(row, { referencias_calbas: refs, valor_referencia_calbas: refs[0], temperatura_calbas: f.temp.value === '' ? null : Number(f.temp.value),
          lectura_1_calbas: lect[0], lectura_2_calbas: lect[1] ?? null, lectura_3_calbas: lect[2] ?? null,
          lecturas_post_calbas: g.ajuste ? g.sel(g.post) : null, patrones_buffers_calbas: g.sel(g.pbs) });
      } else {
        Object.assign(row, { valor_referencia_calbas: g.ref, lectura_1_calbas: g.lect[0], lectura_2_calbas: g.lect[1], lectura_3_calbas: g.lect[2],
          correccion_calbas: g.ajuste ? g.cor : null, lecturas_post_calbas: g.ajuste ? g.post : null });
      }
      r = must(await sb.from('verificaciones_equipo_calbas').insert(row).select('id_calbas, dictamen_calbas, dictamen_final_calbas').single()).data;
      if (r.dictamen_calbas === 'NO_CUMPLE' && r.dictamen_final_calbas !== 'CUMPLE') avisar({ accion: 'no_cumple', origen: 'equipo', id: r.id_calbas });
    }
    if (f.etiqueta.checked) avisar({ accion: 'etiqueta', origen: eq.origen_calbas === 'bascula' ? 'bascula' : 'equipo', id: r.id_calbas });
    const ok = r.dictamen_calbas === 'CUMPLE', fin = r.dictamen_final_calbas;
    const okFinal = fin ? fin === 'CUMPLE' : ok;
    toast(okFinal ? `Verificación registrada: ${eq.codigo_calbas} ${fin && !ok ? 'cumple después del ajuste' : 'cumple'}.` : `Verificación registrada: ${eq.codigo_calbas} NO CUMPLE. Retira el equipo de uso; se avisó a los administradores.`, okFinal ? 'success' : 'error', 8000);
    resultado(okFinal, fin && !ok);
  } catch (err) {
    toast(errMsg(err), 'error');
    btn.disabled = false; btn.innerHTML = `${icon('save')} Registrar verificación`; refreshIcons();
  }
}

function resultado(ok, ajustado = false) {
  root.querySelector('.verif-layout').innerHTML = `<div class="card result-card ${ok ? 'ok' : 'bad'}">
    <div class="result-ico">${icon(ok ? (ajustado ? 'wrench' : 'circle-check-big') : 'octagon-alert')}</div>
    <h2>${ok ? (ajustado ? 'El equipo cumple después del ajuste' : 'El equipo cumple') : 'El equipo no cumple'}</h2>
    <p>${esc(eq.codigo_calbas)} · ${esc(eq.tipo_nombre_calbas)} — ${ok ? (ajustado ? 'se registró la lectura como se encontró y como se dejó; puede seguir en uso.' : 'puede seguir en uso hasta su próxima verificación.') : 'identifícalo como “fuera de uso” y solicita ajuste o calibración.'}</p>
    <div class="page-actions center">
      ${ok ? '' : `<button class="btn red" data-go="#/historial?seguimiento=pendiente">${icon('wrench')} Registrar acción correctiva</button>`}
      <button class="btn navy" data-go="#/verificar">${icon('clipboard-plus')} Registrar otra</button>
      <button class="btn secondary" data-go="#/historial">${icon('history')} Ver historial</button>
    </div></div>`;
  root.querySelector('.result-card').addEventListener('click', (e) => {
    const b = e.target.closest('[data-go]');
    if (b) navigate(b.dataset.go);
  });
  refreshIcons();
}
