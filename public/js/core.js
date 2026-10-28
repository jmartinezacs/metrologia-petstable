// =====================================================================
// Núcleo compartido: cliente Supabase, estado de sesión, utilidades UI
// y reglas de presentación metrológica.
// =====================================================================
const cfg = window.CALBAS_CONFIG || {};
export const TZ = 'America/Mexico_City';
export const APP_VERSION = cfg.APP_VERSION || '7.0.0';

// ---------- Almacenamiento de sesión ("Mantener sesión") ----------
function safe(fn, fallback) { try { return fn(); } catch { return fallback; } }
export const prefs = {
  get: (k) => safe(() => localStorage.getItem(k), null),
  set: (k, v) => safe(() => localStorage.setItem(k, v)),
  del: (k) => safe(() => localStorage.removeItem(k)),
};
const memory = new Map();
function activeStore() {
  const remember = prefs.get('calbas.remember') !== '0';
  return safe(() => (remember ? window.localStorage : window.sessionStorage), null);
}
const authStorage = {
  getItem: (k) => safe(() => activeStore()?.getItem(k), null) ?? memory.get(k) ?? null,
  setItem: (k, v) => { if (safe(() => (activeStore()?.setItem(k, v), true), false) !== true) memory.set(k, v); },
  removeItem: (k) => { memory.delete(k); safe(() => localStorage.removeItem(k)); safe(() => sessionStorage.removeItem(k)); },
};

if (!window.supabase || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
  throw new Error('Configuración de Supabase no disponible.');
}
export const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: authStorage, storageKey: 'calbas-auth' },
});
// Limpia los tokens de la versión 6.x (ya no se usan)
['calbas_access_token', 'calbas_refresh_token', 'calbas_remember_session'].forEach((k) => {
  safe(() => localStorage.removeItem(k)); safe(() => sessionStorage.removeItem(k));
});

// profile: fila de vw_mi_perfil_calbas · deptos: ids de departamentos del usuario
export const state = { session: null, profile: null, isAdmin: false, deptos: [] };
// Funciones que un módulo publica para otro sin importarlo (evita dependencias circulares)
export const ganchos = {};

// ---------- Formato y fechas ----------
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function todayISO() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
export function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
export const diffDays = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 86400000);
export const fmtDate = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
export function fmtDateTime(ts) {
  if (!ts) return '—';
  return new Intl.DateTimeFormat('es-MX', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ts));
}
export function monthShort(iso) {
  return new Intl.DateTimeFormat('es-MX', { timeZone: 'UTC', month: 'short' }).format(new Date(iso + 'T12:00:00Z')).replace('.', '');
}
export const fmtNum = (n) => new Intl.NumberFormat('es-MX').format(Number(n || 0));
// Valor de medición: hasta 6 decimales, sin ceros sobrantes
export function fmtVal(n, digits = 6) {
  if (n === null || n === undefined || n === '' || Number.isNaN(Number(n))) return '—';
  return Number(n).toLocaleString('es-MX', { maximumFractionDigits: digits });
}
export const fmtSigned = (n, digits = 4) => (n === null || n === undefined ? '—' : `${Number(n) > 0 ? '+' : ''}${fmtVal(n, digits)}`);
export function initials(name) {
  return String(name || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
}
// Inicio del día (MX, UTC-6 sin horario de verano desde 2022) en ISO para filtrar timestamps
export const dayStartTs = (iso) => `${iso}T00:00:00-06:00`;
export const dayEndTs = (iso) => `${addDays(iso, 1)}T00:00:00-06:00`;

export const pill = (text, cls = 'gray') => `<span class="pill ${cls}">${esc(text)}</span>`;
export const icon = (name, cls = '') => `<i data-lucide="${name}"${cls ? ` class="${cls}"` : ''}></i>`;
export function refreshIcons() { try { window.lucide?.createIcons(); } catch { /* sin íconos */ } }

export function sanitizeSearch(q) { return String(q || '').replace(/[%,()*\\"'`;:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60); }
export function debounce(fn, ms = 300) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

// ---------- Errores ----------
const CONSTRAINT_MSG = {
  basculas_calbas_codigo_calbas_key: 'Ya existe una báscula con ese código.',
  equipos_calbas_codigo_calbas_key: 'Ya existe un equipo con ese código.',
  tipos_equipo_calbas_clave_calbas_key: 'Ya existe un tipo de equipo con esa clave.',
  tipos_equipo_calbas_nombre_calbas_key: 'Ya existe un tipo de equipo con ese nombre.',
  equipos_calbas_rango_ck: 'El rango máximo debe ser mayor que el mínimo.',
  patrones_calbas_fechas_ck: 'El vencimiento no puede ser anterior a la calibración.',
  calibraciones_equipo_calbas_fechas_ck: 'El vencimiento no puede ser anterior a la calibración.',
};
export function errMsg(err) {
  if (!err) return 'Ocurrió un error inesperado.';
  const msg = err.message || String(err);
  for (const [k, v] of Object.entries(CONSTRAINT_MSG)) if (msg.includes(k) || err.details?.includes?.(k)) return v;
  if (err.code === '23505') return 'El registro ya existe (dato duplicado).';
  if (err.code === '23503') return 'No se puede eliminar porque tiene registros relacionados. Puede desactivarlo en su lugar.';
  if (err.code === '23514') return 'Algún dato no cumple las reglas de validación.';
  if (err.code === '42501') return msg.includes('permission denied') || msg.includes('row-level security') ? 'No tiene permiso para realizar esta acción.' : msg;
  if (err.code === 'P0001') return msg;
  if (/row-level security|permission denied|Unauthorized/i.test(msg)) return 'No tiene permiso para realizar esta acción.';
  if (/exceeded the maximum allowed size|Payload too large/i.test(msg)) return 'El archivo es demasiado grande.';
  if (err.code === 'PGRST301' || /JWT expired|invalid JWT/i.test(msg)) return 'Su sesión expiró. Vuelva a iniciar sesión.';
  if (/Failed to fetch|NetworkError|Load failed|network/i.test(msg)) return 'No hay conexión con el servidor. Verifique su red e intente de nuevo.';
  return msg;
}
// Lanza el error de una respuesta de Supabase
export function must(res) { if (res.error) throw res.error; return res; }

// ---------- Toasts ----------
export function toast(message, type = 'info', ms = 4200) {
  const root = document.getElementById('toasts');
  const el = document.createElement('div');
  const ic = { success: 'check-circle-2', error: 'alert-octagon', warning: 'alert-triangle', info: 'info' }[type] || 'info';
  el.className = `toast ${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.innerHTML = `${icon(ic)}<div class="t-body">${esc(message)}</div><button type="button" aria-label="Cerrar">${icon('x')}</button>`;
  el.querySelector('button').addEventListener('click', () => el.remove());
  root.appendChild(el); refreshIcons();
  setTimeout(() => el.remove(), type === 'error' ? Math.max(ms, 7000) : ms);
}

// ---------- Modales ----------
let modalDepth = 0;
export function openModal({ title, subtitle = '', body = '', submitText = 'Guardar', onSubmit = null, size = '', danger = false, onOpen = null, confirmDiscard = true }) {
  return new Promise((resolve) => {
    const root = document.getElementById('modal-root');
    const wrap = document.createElement('div');
    wrap.className = 'modal';
    wrap.innerHTML = `
      <form class="modal-box ${size}" role="dialog" aria-modal="true" aria-labelledby="mt-${modalDepth}" novalidate>
        <header class="modal-head">
          <div><h3 id="mt-${modalDepth}">${esc(title)}</h3>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div>
          <button type="button" class="icon-btn" data-close aria-label="Cerrar">${icon('x')}</button>
        </header>
        <div class="modal-body">${body}</div>
        <footer class="modal-foot">
          ${onSubmit
            ? `<div class="form-error" role="alert"></div>
               <button type="button" class="btn secondary" data-close>Cancelar</button>
               <button type="submit" class="btn ${danger ? 'danger' : 'navy'}" data-submit>${esc(submitText)}</button>`
            : `<button type="button" class="btn secondary" data-close>Cerrar</button>`}
        </footer>
      </form>`;
    modalDepth++;
    root.appendChild(wrap);
    document.body.classList.add('modal-open');
    const form = wrap.querySelector('form');
    const errBox = wrap.querySelector('.form-error');
    let dirty = false, busy = false, result;
    form.addEventListener('input', () => { dirty = true; });

    const finish = () => {
      wrap.remove(); modalDepth--;
      document.removeEventListener('keydown', onKey);
      if (!root.children.length) document.body.classList.remove('modal-open');
      resolve(result);
    };
    const close = async (force = false) => {
      if (busy) return;
      if (!force && dirty && onSubmit && confirmDiscard) {
        const ok = await confirmDialog({ title: '¿Descartar cambios?', message: 'Hay información capturada que no se ha guardado.', confirmText: 'Descartar', danger: true });
        if (!ok) return;
      }
      finish();
    };
    const onKey = (e) => { if (e.key === 'Escape' && root.lastElementChild === wrap) { e.preventDefault(); close(); } };
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });

    const ctx = {
      form, wrap,
      setError: (m) => { if (errBox) errBox.textContent = m || ''; },
      close: (value) => { result = value; finish(); },
    };
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!onSubmit || busy) return;
      ctx.setError('');
      const btn = form.querySelector('[data-submit]');
      busy = true; btn.disabled = true;
      const label = btn.innerHTML; btn.innerHTML = `<span class="spinner sm"></span> Guardando…`;
      try {
        const r = await onSubmit(ctx);
        if (r !== false) { result = r === undefined ? true : r; busy = false; finish(); return; }
      } catch (err) {
        console.error(err);
        ctx.setError(errMsg(err));
      }
      busy = false; btn.disabled = false; btn.innerHTML = label; refreshIcons();
    });
    refreshIcons();
    onOpen?.(ctx);
    setTimeout(() => form.querySelector('input:not([type=hidden]):not([disabled]), select, textarea')?.focus({ preventScroll: true }), 30);
  });
}

// Confirmación (opcionalmente con texto obligatorio, p. ej. motivo de cancelación)
export function confirmDialog({ title, message = '', confirmText = 'Confirmar', danger = false, input = null }) {
  const body = `<p style="margin:0 0 6px">${esc(message)}</p>
    ${input ? `<div class="field"><label for="cd-input">${esc(input.label)} ${input.required ? '<span class="req">*</span>' : ''}</label>
      <textarea id="cd-input" name="value" maxlength="${input.maxlength || 300}" ${input.required ? 'required' : ''} placeholder="${esc(input.placeholder || '')}"></textarea></div>` : ''}`;
  return openModal({
    title, body, submitText: confirmText, danger, size: 'sm', confirmDiscard: false,
    onSubmit: ({ form }) => {
      if (input) {
        if (!checkForm(form)) return false;
        return { value: form.elements.value.value.trim() };
      }
      return true;
    },
  }).then((r) => r || false);
}

// ---------- Validación de formularios ----------
function validityMessage(el) {
  const v = el.validity;
  if (v.valueMissing) return 'Campo obligatorio.';
  if (v.typeMismatch) return el.type === 'email' ? 'Correo electrónico inválido.' : 'Formato inválido.';
  if (v.patternMismatch) return el.dataset.patternMsg || 'Formato inválido.';
  if (v.tooShort) return `Mínimo ${el.minLength} caracteres.`;
  if (v.tooLong) return `Máximo ${el.maxLength} caracteres.`;
  if (v.rangeUnderflow) return `El valor mínimo es ${el.min}.`;
  if (v.rangeOverflow) return `El valor máximo es ${el.max}.`;
  if (v.stepMismatch) return 'Use un número entero.';
  if (v.badInput) return 'Valor inválido.';
  return 'Valor inválido.';
}
export function fieldError(el, msg) {
  const field = el.closest('.field') || el.parentElement;
  field.classList.add('invalid');
  const s = document.createElement('small'); s.className = 'field-error'; s.textContent = msg;
  field.appendChild(s);
}
export function clearErrors(form) {
  form.querySelectorAll('.field-error').forEach((e) => e.remove());
  form.querySelectorAll('.invalid').forEach((e) => e.classList.remove('invalid'));
}
export function checkForm(form, custom = {}) {
  clearErrors(form);
  let first = null;
  for (const el of form.elements) {
    if (!el.name || el.disabled || el.type === 'button' || el.type === 'submit') continue;
    let msg = '';
    if (el.required && typeof el.value === 'string' && el.type !== 'radio' && !el.value.trim()) msg = 'Campo obligatorio.';
    else if (el.willValidate && !el.checkValidity()) msg = validityMessage(el);
    if (!msg && custom[el.name]) msg = custom[el.name](el.value, form) || '';
    if (msg && !el.closest('.field')?.classList.contains('invalid')) { fieldError(el, msg); first ??= el; }
  }
  if (first) (first._cs?.btn || first).focus();
  return !first;
}
export function formValues(form) {
  const o = {};
  for (const [k, v] of new FormData(form).entries()) o[k] = typeof v === 'string' ? v.trim() : v;
  return o;
}
export const nullIfEmpty = (v) => (v === '' || v === undefined ? null : v);

// Contadores de caracteres en textareas con data-counter
export function bindCounters(root) {
  root.querySelectorAll('textarea[maxlength][data-counter]').forEach((ta) => {
    const lab = root.querySelector(`label[for="${ta.id}"]`);
    if (!lab) return;
    const c = document.createElement('span'); c.className = 'counter'; lab.appendChild(c);
    const upd = () => { c.textContent = `${ta.value.length}/${ta.maxLength}`; };
    ta.addEventListener('input', upd); upd();
  });
}

// ---------- Estados vacíos ----------
export function emptyState({ ico = 'inbox', title, text = '', action = '' }) {
  return `<div class="empty"><div class="empty-ico">${icon(ico)}</div><b>${esc(title)}</b>${text ? `<p>${esc(text)}</p>` : ''}${action}</div>`;
}
export function errorState(err, retryAction = 'retry') {
  return `<div class="empty error"><div class="empty-ico">${icon('wifi-off')}</div><b>No se pudo cargar la información</b><p>${esc(errMsg(err))}</p>
    <button class="btn secondary" data-action="${retryAction}">${icon('refresh-cw')} Reintentar</button></div>`;
}

// ---------- Tabla con paginación y orden en servidor ----------
export class DataTable {
  /**
   * @param {HTMLElement} el contenedor
   * @param {{columns: Array, fetch: Function, pageSize?: number, sort?: {key:string, asc:boolean}, empty?: object, rowKey?: string}} opts
   * columns: [{ key, label, sort?: 'columna', cls?, render(row) }]
   * fetch({ from, to, sort, filters }) => Promise<{ rows, count }>
   */
  constructor(el, opts) {
    this.el = el; this.o = opts;
    this.page = 1; this.size = opts.pageSize || prefsNum('calbas.pagesize', 10);
    this.sort = opts.sort || null; this.filters = {};
    this.rows = []; this.count = 0; this.token = 0;
    el.addEventListener('click', (e) => this.onClick(e));
    el.addEventListener('change', (e) => {
      if (e.target.matches('[data-pagesize]')) { this.size = Number(e.target.value); prefs.set('calbas.pagesize', String(this.size)); this.page = 1; this.load(); }
    });
  }
  setFilters(f) { this.filters = { ...this.filters, ...f }; this.page = 1; return this.load(); }
  row(id) { return this.rows.find((r) => String(r[this.o.rowKey || 'id']) === String(id)); }
  onClick(e) {
    const th = e.target.closest('th[data-sort]');
    if (th) {
      const key = th.dataset.sort;
      this.sort = this.sort?.key === key ? { key, asc: !this.sort.asc } : { key, asc: true };
      this.page = 1; this.load(); return;
    }
    const pg = e.target.closest('[data-page]');
    if (pg && !pg.disabled) { this.page = Number(pg.dataset.page); this.load(); return; }
    if (e.target.closest('[data-action="retry"]')) this.load();
  }
  async load() {
    const t = ++this.token;
    const from = (this.page - 1) * this.size, to = from + this.size - 1;
    if (!this.rendered) this.el.innerHTML = this.skeleton();
    else this.el.querySelector('.table-wrap')?.classList.add('table-loading');
    try {
      const { rows, count } = await this.o.fetch({ from, to, sort: this.sort, filters: this.filters });
      if (t !== this.token) return;
      this.rows = rows || []; this.count = count ?? this.rows.length;
      const pages = Math.max(1, Math.ceil(this.count / this.size));
      if (this.page > pages && this.count > 0) { this.page = pages; return this.load(); }
      this.render();
    } catch (err) {
      if (t !== this.token) return;
      console.error(err);
      this.rendered = false;
      this.el.innerHTML = errorState(err);
      refreshIcons();
    }
  }
  skeleton() {
    return `<div class="table-wrap"><table class="table"><tbody>${Array.from({ length: 5 }, () => `<tr>${this.o.columns.map(() => '<td><div class="skeleton"></div></td>').join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  render() {
    const { columns, empty } = this.o;
    if (!this.rows.length) {
      const filtered = Object.values(this.filters).some((v) => v !== '' && v != null && v !== false);
      this.el.innerHTML = emptyState(filtered
        ? { ico: 'search-x', title: 'Sin resultados', text: 'No hay registros que coincidan con los filtros aplicados.' }
        : (empty || { title: 'Sin registros' }));
      this.rendered = false; refreshIcons(); return;
    }
    const head = columns.map((c) => {
      const sorted = c.sort && this.sort?.key === c.sort;
      const ind = c.sort ? `<span class="sort-ind">${sorted ? (this.sort.asc ? '▲' : '▼') : '↕'}</span>` : '';
      return `<th class="${c.cls || ''} ${c.sort ? 'sortable' : ''} ${sorted ? 'sorted' : ''}" ${c.sort ? `data-sort="${c.sort}" aria-sort="${sorted ? (this.sort.asc ? 'ascending' : 'descending') : 'none'}"` : ''}>${esc(c.label)}${ind}</th>`;
    }).join('');
    const body = this.rows.map((r) => `<tr data-id="${esc(r[this.o.rowKey || 'id'])}">${columns.map((c) =>
      `<td class="${c.cls || ''}" data-label="${esc(c.label)}"><div class="td-in">${c.render ? c.render(r) : esc(r[c.key])}</div></td>`).join('')}</tr>`).join('');
    const pages = Math.max(1, Math.ceil(this.count / this.size));
    const from = (this.page - 1) * this.size + 1, to = Math.min(this.count, this.page * this.size);
    this.el.innerHTML = `
      <div class="table-wrap responsive"><table class="table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>
      <div class="pager">
        <span>Mostrando <b>${fmtNum(from)}–${fmtNum(to)}</b> de <b>${fmtNum(this.count)}</b></span>
        <div class="pager-ctrl">
          <label class="sr-only" for="ps-${this.token}">Registros por página</label>
          <select id="ps-${this.token}" data-pagesize>${[10, 25, 50].map((n) => `<option value="${n}" ${n === this.size ? 'selected' : ''}>${n} por página</option>`).join('')}</select>
          <button class="icon-btn" data-page="1" ${this.page <= 1 ? 'disabled' : ''} aria-label="Primera página">${icon('chevrons-left')}</button>
          <button class="icon-btn" data-page="${this.page - 1}" ${this.page <= 1 ? 'disabled' : ''} aria-label="Página anterior">${icon('chevron-left')}</button>
          <span>Pág. ${this.page} / ${pages}</span>
          <button class="icon-btn" data-page="${this.page + 1}" ${this.page >= pages ? 'disabled' : ''} aria-label="Página siguiente">${icon('chevron-right')}</button>
          <button class="icon-btn" data-page="${pages}" ${this.page >= pages ? 'disabled' : ''} aria-label="Última página">${icon('chevrons-right')}</button>
        </div>
      </div>`;
    this.rendered = true;
    refreshIcons();
  }
}
function prefsNum(k, d) { const n = Number(prefs.get(k)); return [10, 25, 50].includes(n) ? n : d; }

// Aplica orden y rango a una consulta de Supabase
export function paged(q, { from, to, sort }, extraOrder = []) {
  if (sort) q = q.order(sort.key, { ascending: sort.asc, nullsFirst: false });
  for (const [k, asc] of extraOrder) q = q.order(k, { ascending: asc });
  return q.range(from, to);
}


// ---------- Gráficas ----------
const charts = new Set();
export function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
export const PALETTE = ['#F58020', '#1BC7C7', '#0B2235', '#1BB56F', '#7A5BE6', '#E0464E', '#FFB020', '#5B8DEF'];
// Etiqueta de datos: el valor centrado dentro de cada barra o segmento de pastel
// (se dibuja en el canvas, así que también aparece al copiar la gráfica)
const etiquetasDatos = {
  id: 'calbasEtiquetas',
  afterDatasetsDraw(chart) {
    const tipo = chart.config.type;
    if (!['bar', 'doughnut', 'pie'].includes(tipo)) return;
    const { ctx } = chart;
    const horiz = chart.options.indexAxis === 'y';
    ctx.save();
    ctx.font = '800 11px Inter, Segoe UI, system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    chart.data.datasets.forEach((ds, di) => {
      const meta = chart.getDatasetMeta(di);
      if (meta.hidden || meta.type === 'line') return;
      meta.data.forEach((el, i) => {
        const v = Number(ds.data[i]);
        if (!v || el.hidden) return;
        const label = new Intl.NumberFormat('es-MX').format(v);
        let x, y, dentro = true;
        if (tipo === 'bar') {
          const p = el.getProps(['x', 'y', 'base'], true);
          const largo = horiz ? Math.abs(p.x - p.base) : Math.abs(p.base - p.y);
          const ancho = ctx.measureText(label).width + 6;
          dentro = largo >= (horiz ? ancho : 16);
          if (dentro) { x = horiz ? (p.x + p.base) / 2 : p.x; y = horiz ? p.y : (p.y + p.base) / 2; }
          else { x = horiz ? p.x + ancho / 2 + 2 : p.x; y = horiz ? p.y : p.y - 9; }
        } else {
          if (el.circumference < 0.12) return;
          ({ x, y } = el.tooltipPosition(true));
        }
        if (dentro) {
          ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(9, 13, 18, .45)'; ctx.lineJoin = 'round';
          ctx.strokeText(label, x, y);
          ctx.fillStyle = '#FFFFFF';
        } else ctx.fillStyle = cssVar('--text') || '#172431';
        ctx.fillText(label, x, y);
      });
    });
    ctx.restore();
  },
};
export function makeChart(canvas, config) {
  if (!window.Chart || !canvas) return null;
  const muted = cssVar('--muted') || '#687B8C', line = cssVar('--line') || '#E3EAEF', text = cssVar('--text') || '#172431';
  window.Chart.defaults.font.family = 'Inter, Segoe UI, system-ui, sans-serif';
  window.Chart.defaults.color = muted;
  const c = new window.Chart(canvas, {
    ...config,
    plugins: [...(config.plugins || []), etiquetasDatos],
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 350 },
      plugins: {
        legend: { labels: { color: text, boxWidth: 12, boxHeight: 12, usePointStyle: true }, ...(config.options?.plugins?.legend || {}) },
        tooltip: { backgroundColor: '#102536', padding: 10, cornerRadius: 10 },
      },
      scales: config.type === 'doughnut' ? {} : {
        x: { grid: { color: line, drawTicks: false }, ticks: { color: muted, precision: 0 }, border: { display: false }, ...(config.options?.scales?.x || {}) },
        y: { grid: { color: line, drawTicks: false }, ticks: { color: muted, precision: 0 }, border: { display: false }, beginAtZero: true, ...(config.options?.scales?.y || {}) },
      },
      ...(config.options?.indexAxis ? { indexAxis: config.options.indexAxis } : {}),
      ...(config.type === 'doughnut' ? { cutout: '64%' } : {}),
    },
  });
  charts.add(c);
  return c;
}
// Cambio de tema inmediato: re-colorea las gráficas sin volver a consultar datos
export function restyleCharts() {
  const muted = cssVar('--muted'), line = cssVar('--line'), text = cssVar('--text');
  charts.forEach((c) => {
    try {
      const o = c.options;
      if (o.plugins?.legend?.labels) o.plugins.legend.labels.color = text;
      for (const s of Object.values(o.scales || {})) {
        if (s.ticks) s.ticks.color = muted;
        if (s.grid) s.grid.color = line;
      }
      c.update('none');
    } catch { /* gráfica ya destruida */ }
  });
}
export function destroyCharts() { charts.forEach((c) => { try { c.destroy(); } catch { /* ya destruida */ } }); charts.clear(); }

// ---------- Exportación de archivos ----------
// Lee todas las filas de una consulta en páginas de 1,000 (límite del servidor)
export async function fetchAll(build, max = 50000) {
  const out = [];
  for (let from = 0; from < max; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}
// CSV compatible con Excel (UTF-8 con BOM, separado por comas)
export function toCSV(rows, cols) {
  const cell = (v) => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return String(v);
    // Evita que Excel interprete texto como fórmula
    const s = /^[=+\-@\t\r]/.test(String(v)) ? `'${v}` : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + [cols.map((c) => cell(c.label)).join(','), ...rows.map((r) => cols.map((c) => cell(c.get(r))).join(','))].join('\r\n');
}
export function descargar(nombre, contenido, tipo = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ---------- Menús desplegables con el estilo del sistema ----------
// Reemplaza visualmente <select> y <input list> por un menú propio. El control
// original se conserva (oculto) para validación, FormData y eventos "change".
const CHEVRON = '<svg class="cs-chev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
const CHECK = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
let csAbierto = null;
function csCerrar(enfocar = false) {
  if (!csAbierto) return;
  const { panel, anchor } = csAbierto;
  panel.remove(); anchor.setAttribute('aria-expanded', 'false');
  csAbierto = null;
  if (enfocar) anchor.focus();
}
function csUbicar(panel, anchor) {
  const r = anchor.getBoundingClientRect();
  const alto = Math.min(panel.scrollHeight, 300);
  const abajo = innerHeight - r.bottom;
  panel.style.width = `${Math.max(r.width, 200)}px`;
  panel.style.left = `${Math.max(8, Math.min(r.left, innerWidth - 8 - Math.max(r.width, 200)))}px`;
  if (abajo < alto + 12 && r.top > abajo) { panel.style.top = ''; panel.style.bottom = `${innerHeight - r.top + 6}px`; }
  else { panel.style.bottom = ''; panel.style.top = `${r.bottom + 6}px`; }
}
// items: [{ value, label, disabled, selected }]; onPick(value)
function csAbrir(anchor, items, onPick) {
  csCerrar();
  if (!items.length) return;
  const panel = document.createElement('div');
  panel.className = 'cs-panel'; panel.setAttribute('role', 'listbox');
  panel.innerHTML = items.map((it, i) => `<div class="cs-opt ${it.selected ? 'sel' : ''} ${it.disabled ? 'dis' : ''} ${it.ph ? 'ph' : ''}" role="option" data-i="${i}" aria-selected="${it.selected ? 'true' : 'false'}" ${it.disabled ? 'aria-disabled="true"' : ''}>
      <span>${esc(it.label)}</span>${it.selected ? CHECK : ''}</div>`).join('');
  document.body.appendChild(panel);
  csUbicar(panel, anchor);
  anchor.setAttribute('aria-expanded', 'true');
  let hl = Math.max(0, items.findIndex((x) => x.selected));
  const pintar = () => {
    panel.querySelectorAll('.cs-opt').forEach((o, i) => o.classList.toggle('hl', i === hl));
    panel.querySelector('.cs-opt.hl')?.scrollIntoView({ block: 'nearest' });
  };
  pintar();
  const elegir = (i) => { const it = items[i]; if (!it || it.disabled) return; csCerrar(true); onPick(it.value); };
  panel.addEventListener('mousedown', (e) => e.preventDefault());
  panel.addEventListener('click', (e) => { const o = e.target.closest('.cs-opt'); if (o) elegir(Number(o.dataset.i)); });
  csAbierto = {
    panel, anchor,
    key: (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); do { hl = Math.min(items.length - 1, hl + 1); } while (items[hl]?.disabled && hl < items.length - 1); pintar(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); do { hl = Math.max(0, hl - 1); } while (items[hl]?.disabled && hl > 0); pintar(); }
      else if (e.key === 'Enter') { e.preventDefault(); elegir(hl); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); csCerrar(true); }
      else if (e.key === 'Tab') csCerrar();
      else if (e.key.length === 1 && /\S/.test(e.key) && anchor.tagName !== 'INPUT') {
        const k = e.key.toLowerCase();
        const j = items.findIndex((it, i) => i > hl && !it.disabled && it.label.toLowerCase().startsWith(k));
        const j2 = j >= 0 ? j : items.findIndex((it) => !it.disabled && it.label.toLowerCase().startsWith(k));
        if (j2 >= 0) { hl = j2; pintar(); }
      }
    },
  };
}
document.addEventListener('mousedown', (e) => {
  if (csAbierto && !csAbierto.panel.contains(e.target) && !csAbierto.anchor.contains(e.target)) csCerrar();
}, true);
document.addEventListener('scroll', (e) => { if (csAbierto && !csAbierto.panel.contains(e.target)) csCerrar(); }, true);
window.addEventListener('resize', () => csCerrar());
document.addEventListener('keydown', (e) => { if (csAbierto && (e.target === csAbierto.anchor)) csAbierto.key(e); }, true);

const valueDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
const indexDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'selectedIndex');
function mejorarSelect(sel) {
  if (sel._cs || sel.multiple || sel.size > 1 || 'native' in sel.dataset) return;
  const wrap = document.createElement('div');
  wrap.className = 'cs';
  if (sel.style.cssText) { wrap.style.cssText = sel.style.cssText; sel.style.cssText = ''; }
  sel.parentNode.insertBefore(wrap, sel);
  wrap.appendChild(sel);
  // Unidades (g, µL, °C…): sin mayúscula inicial automática
  if ('unidad' in sel.dataset) wrap.classList.add('no-cap');
  sel.classList.add('cs-native'); sel.tabIndex = -1; sel.setAttribute('aria-hidden', 'true');
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'cs-btn';
  btn.setAttribute('aria-haspopup', 'listbox'); btn.setAttribute('aria-expanded', 'false');
  const lab = sel.id ? document.querySelector(`label[for="${CSS.escape(sel.id)}"]`) : null;
  btn.setAttribute('aria-label', sel.getAttribute('aria-label') || lab?.textContent.replace('*', '').trim() || 'Seleccionar');
  wrap.appendChild(btn);
  const sync = () => {
    const o = sel.options[sel.selectedIndex];
    btn.innerHTML = `<span class="cs-val ${!sel.value ? 'ph' : ''}">${esc(o ? o.textContent : '—')}</span>${CHEVRON}`;
    btn.disabled = sel.disabled;
  };
  // Reflejar cambios hechos por código (value / selectedIndex / opciones / disabled)
  Object.defineProperty(sel, 'value', { configurable: true, get() { return valueDesc.get.call(this); }, set(v) { valueDesc.set.call(this, v); sync(); } });
  Object.defineProperty(sel, 'selectedIndex', { configurable: true, get() { return indexDesc.get.call(this); }, set(v) { indexDesc.set.call(this, v); sync(); } });
  new MutationObserver(sync).observe(sel, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'selected'] });
  sel.addEventListener('change', sync);
  btn.addEventListener('click', () => {
    if (csAbierto?.anchor === btn) { csCerrar(); return; }
    const items = [...sel.options].filter((o) => !o.hidden).map((o) => ({
      value: o.value, label: o.textContent, disabled: o.disabled, selected: o.index === sel.selectedIndex, ph: o.value === '',
    }));
    csAbrir(btn, items, (v) => {
      valueDesc.set.call(sel, v); sync();
      sel.dispatchEvent(new Event('input', { bubbles: true }));
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    if (wrap.classList.contains('no-cap')) csAbierto?.panel.classList.add('no-cap');
  });
  btn.addEventListener('keydown', (e) => {
    if (!csAbierto && ['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); btn.click(); }
  });
  sel._cs = { btn, sync };
  sync();
}
function mejorarDatalist(inp) {
  if (inp._cs) return;
  const dl = document.getElementById(inp.getAttribute('list'));
  if (!dl) return;
  inp.removeAttribute('list');
  inp.setAttribute('autocomplete', 'off');
  inp.setAttribute('aria-autocomplete', 'list'); inp.setAttribute('aria-expanded', 'false');
  inp.parentElement.classList.add('cs-dl');
  const mostrar = () => {
    const q = inp.value.trim().toLowerCase();
    const items = [...dl.options].map((o) => ({ value: o.value, label: o.label && o.label !== o.value ? `${o.value} · ${o.label}` : o.value }))
      .filter((it) => !q || it.label.toLowerCase().includes(q));
    if (!items.length || (items.length === 1 && items[0].value.toLowerCase() === q)) { if (csAbierto?.anchor === inp) csCerrar(); return; }
    csAbrir(inp, items.slice(0, 50), (v) => {
      inp.value = v;
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
      setTimeout(() => csCerrar(), 0);
    });
  };
  inp.addEventListener('focus', mostrar);
  inp.addEventListener('input', (e) => { if (e.isTrusted) mostrar(); });
  inp.addEventListener('keydown', (e) => { if (!csAbierto && e.key === 'ArrowDown') { e.preventDefault(); mostrar(); } });
  inp._cs = { mostrar };
}
export function mejorarControles(root = document) {
  root.querySelectorAll?.('select').forEach(mejorarSelect);
  root.querySelectorAll?.('input[list]').forEach(mejorarDatalist);
}
new MutationObserver((muts) => {
  for (const m of muts) for (const n of m.addedNodes) {
    if (n.nodeType !== 1) continue;
    if (n.tagName === 'SELECT') mejorarSelect(n);
    else if (n.tagName === 'INPUT' && n.hasAttribute('list')) mejorarDatalist(n);
    else mejorarControles(n);
  }
}).observe(document.documentElement, { childList: true, subtree: true });
// Un clic en la etiqueta de un select mejorado enfoca su botón
document.addEventListener('click', (e) => {
  const lab = e.target.closest('label[for]');
  const c = lab && document.getElementById(lab.htmlFor);
  if (c?._cs?.btn) { e.preventDefault(); c._cs.btn.focus(); }
});

// ---------- Fotos de usuario ----------
// Fotos históricas del bucket "avatares" (v6.x) cuando el perfil no tiene una propia
const AVATAR_BASE = `${cfg.SUPABASE_URL}/storage/v1/object/public/avatares/`;
const AVATARES = {
  'abigail.ordaz@petstable.mx': 'Abigail.png', 'abraham.juarez@petstable.mx': 'Abraham.png',
  'arizbeth.eguiarte@petstable.mx': 'Arizbeth.png', 'camila.delrio@petstable.mx': 'Camila del Rio.png',
  'daniela.ramirez@petstable.mx': 'Daniela.png', 'eduardo.gonzalez@petstable.mx': 'Eduardo Gonzalez.png',
  'guillermo.martinez@petstable.mx': 'Guillermo.png', 'helder.quiroga@petstable.mx': 'Helder.png',
  'javier.martinez@petstable.mx': 'Javier.png', 'jose.cabrera@petstable.mx': 'Jose.png',
  'julian.pacheco@petstable.mx': 'Julian.png', 'kevin.hernandez@petstable.mx': 'Kevin.png',
  'lidia.bautista@petstable.mx': 'Lidia.png', 'luis.garcia@petstable.mx': 'Luis Garcia.png',
  'miguel.luna@petstable.mx': 'Miguel.png', 'nelisa.ramirez@petstable.mx': 'Nelisa.png',
  'tania.hernandez@petstable.mx': 'Tania.png', 'uriel.sanchez@petstable.mx': 'Uriel.png',
  'yamileth.cabrera@petstable.mx': 'Yamileth.png', 'eduardo@petstable.mx': 'Eduardo.png',
};
export function fotoDe(correo, url) {
  if (url && /^https:\/\//.test(url)) return url;
  const f = AVATARES[String(correo || '').toLowerCase().trim()];
  return f ? AVATAR_BASE + encodeURIComponent(f) : '';
}
// Avatar con foto (si existe) y respaldo de iniciales cuando la imagen no carga
export function avatarHTML(nombre, fotoUrl, cls = '') {
  const ini = esc(initials(nombre));
  if (fotoUrl && /^https:\/\//.test(fotoUrl)) {
    return `<span class="avatar has-img ${cls}" data-ini="${ini}"><img src="${esc(fotoUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer"></span>`;
  }
  return `<span class="avatar ${cls}">${ini}</span>`;
}
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img?.tagName === 'IMG' && img.parentElement?.classList.contains('avatar')) {
    const span = img.parentElement; span.classList.remove('has-img'); span.textContent = span.dataset.ini || '?';
  }
}, true);

export const FOTO_MAX_MB = 5;
// Recorta al centro, reduce a 320×320 y convierte a JPEG antes de subir (fotos ligeras)
export async function prepararFoto(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('La foto debe ser JPG, PNG o WEBP.');
  if (file.size > FOTO_MAX_MB * 1024 * 1024) throw new Error(`La foto no debe superar ${FOTO_MAX_MB} MB.`);
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('No se pudo leer la imagen.')); i.src = url; });
    const s = Math.min(img.naturalWidth, img.naturalHeight), size = 320;
    const c = document.createElement('canvas'); c.width = size; c.height = size;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size);
    return await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('No se pudo procesar la imagen.'))), 'image/jpeg', 0.86));
  } finally { URL.revokeObjectURL(url); }
}
export function blobABase64(blob) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(new Error('No se pudo leer la foto.')); r.readAsDataURL(blob); });
}
// Foto propia: carpeta del usuario en "calbas-avatars" (la política solo permite su propio uid)
export async function subirFotoPropia(blob) {
  const uid = state.session?.user?.id;
  const path = `${uid}/${Date.now()}.jpg`;
  must(await sb.storage.from('calbas-avatars').upload(path, blob, { contentType: 'image/jpeg', upsert: false, cacheControl: '31536000' }));
  return sb.storage.from('calbas-avatars').getPublicUrl(path).data.publicUrl;
}

// ---------- Certificados de calibración (bucket privado) ----------
export const CERT_MAX_MB = 10;
export async function subirCertificado(file, codigo) {
  if (!/^(application\/pdf|image\/(jpeg|png|webp))$/.test(file.type)) throw new Error('El certificado debe ser PDF, JPG, PNG o WEBP.');
  if (file.size > CERT_MAX_MB * 1024 * 1024) throw new Error(`El certificado no debe superar ${CERT_MAX_MB} MB.`);
  const ext = file.type === 'application/pdf' ? 'pdf' : file.type.split('/')[1].replace('jpeg', 'jpg');
  const limpio = String(codigo || 'equipo').replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 40);
  const path = `${limpio}/${todayISO()}-${Date.now()}.${ext}`;
  must(await sb.storage.from('certificados_calbas').upload(path, file, { contentType: file.type, upsert: false }));
  return path;
}
export async function abrirCertificado(ref) {
  if (!ref) return;
  if (/^https?:\/\//.test(ref)) { window.open(ref, '_blank', 'noopener'); return; }
  const w = window.open('', '_blank');
  try {
    const { data } = must(await sb.storage.from('certificados_calbas').createSignedUrl(ref, 300));
    if (w) w.location = data.signedUrl; else window.open(data.signedUrl, '_blank', 'noopener');
  } catch (err) { w?.close(); toast(errMsg(err), 'error'); }
}

// ---------- Catálogos en caché ligera ----------
let deptosCache = null, tiposCache = null;
export async function getDepartamentos({ force = false } = {}) {
  if (!deptosCache || force) {
    const { data } = must(await sb.from('departamentos_calbas').select('id_calbas, nombre_calbas, activo_calbas').order('nombre_calbas'));
    deptosCache = data;
  }
  return deptosCache;
}
// Tipos de equipo genéricos (las básculas se agregan como tipo especial BASCULA)
export const TIPO_BASCULA = { id_calbas: 'BASCULA', clave_calbas: 'BASCULA', nombre_calbas: 'Báscula', magnitud_calbas: 'Masa', unidades_calbas: ['kg', 'g'], icono_calbas: 'scale', prefijo_codigo_calbas: 'BAS' };
// Clase de báscula (basculas_calbas.tipo_bascula_calbas): plataforma 0.4–200 kg, mesa 0.1–15 kg, analítica en gramos
export const TIPOS_BASCULA = { PLATAFORMA: 'Báscula de plataforma', MESA: 'Báscula de mesa', ANALITICA: 'Báscula analítica' };
export const tipoBasculaSugerido = (unidad, max) => (unidad === 'g' ? 'ANALITICA' : Number(max) > 30 ? 'PLATAFORMA' : 'MESA');
export async function getTipos({ force = false, conBascula = true } = {}) {
  if (!tiposCache || force) {
    const { data } = must(await sb.from('tipos_equipo_calbas').select('*').order('nombre_calbas'));
    tiposCache = data;
  }
  return conBascula ? [TIPO_BASCULA, ...tiposCache] : tiposCache;
}
export function invalidarCatalogos() { deptosCache = null; tiposCache = null; }

// ---------- Presentación metrológica ----------
export const ESTADO_CAL = {
  vigente: ['Vigente', 'ok'], por_vencer: ['Por vencer', 'warn'], vencida: ['Vencida', 'bad'], sin_registro: ['Sin registro', 'gray'],
};
export const ESTADO_VER = {
  al_dia: ['Al día', 'ok'], por_vencer: ['Próxima', 'warn'], vencida: ['Atrasada', 'bad'], sin_registro: ['Sin verificar', 'gray'], no_aplica: ['Solo calibración', 'info'],
};
export const RESULTADO_CAL = { vigente: ['Conforme', 'ok'], no_conforme: ['No conforme', 'bad'], cancelada: ['Cancelada', 'gray'] };
export const calPill = (e) => pill(...(ESTADO_CAL[e] || [e || '—', 'gray']));
export const verPill = (e) => pill(...(ESTADO_VER[e] || [e || '—', 'gray']));
export function dictamenPill(d, estado) {
  if (estado === 'anulada') return pill('Anulada', 'gray');
  if (d === 'CUMPLE') return pill('Cumple', 'ok');
  if (d === 'NO_CUMPLE') return pill('No cumple', 'bad');
  return pill('Pendiente', 'gray');
}
export const CLASES = { CLASE_I: 'Clase I', CLASE_II: 'Clase II', CLASE_III: 'Clase III', CLASE_IIII: 'Clase IIII' };
export const CRITERIOS = { VERIFICACION_INICIAL: 'Verificación inicial', EN_SERVICIO: 'En servicio' };
export const tipoIcono = (clave, ic) => (clave === 'BASCULA' ? 'scale' : ic || 'gauge');
// Unidad tal como se muestra en pantalla (en la base se guarda "kg")
export const U = (u) => (String(u ?? '').toLowerCase() === 'kg' ? 'Kg' : String(u ?? ''));
// Convierte un valor de masa entre g y kg (otras unidades se devuelven igual)
export function convertirMasa(v, de, a) {
  if (v === null || v === undefined || v === '') return v;
  const d = String(de).toLowerCase(), h = String(a).toLowerCase();
  if (d === h || !['g', 'kg'].includes(d) || !['g', 'kg'].includes(h)) return Number(v);
  return d === 'kg' ? Number(v) * 1000 : Number(v) / 1000;
}
// Seguimiento de verificaciones «no cumple»
export const ACCIONES = {
  AJUSTE: 'Ajuste', REPARACION: 'Reparación', CALIBRACION: 'Calibración externa', FUERA_DE_USO: 'Retiro / fuera de uso',
  REVERIFICACION: 'Re-verificación', BAJA: 'Baja definitiva', OTRO: 'Otra acción',
};
export const SEGUIMIENTO = { sin_seguimiento: ['Sin seguimiento', 'bad'], abierto: ['En seguimiento', 'warn'], cerrado: ['Cerrado', 'ok'] };
export const segPill = (e) => pill(...(SEGUIMIENTO[e] || [e || '—', 'gray']));

// Vista previa del cálculo de básculas. La base de datos recalcula el dictamen
// definitivo (validar_verificacion_calbas); estas reglas reflejan esa función.
export const aGramos = (v, u) => (String(u).toLowerCase() === 'kg' ? Number(v) * 1000 : Number(v));
export function factorEMT(clase, criterio, divisiones) {
  const x = Number(divisiones); let f;
  if (clase === 'CLASE_I') f = x <= 50000 ? 0.5 : x <= 200000 ? 1 : 1.5;
  else if (clase === 'CLASE_II') f = x <= 5000 ? 0.5 : x <= 20000 ? 1 : 1.5;
  else if (clase === 'CLASE_IIII') f = x <= 50 ? 0.5 : x <= 200 ? 1 : x <= 1000 ? 1.5 : NaN;
  else f = x <= 500 ? 0.5 : x <= 2000 ? 1 : x <= 10000 ? 1.5 : NaN;
  if (!Number.isFinite(f)) throw new Error('La carga excede el rango definido para la clase de exactitud.');
  return criterio === 'EN_SERVICIO' ? f * 2 : f;
}
// Promedio y coeficiente de variación de tres lecturas
export function estadistica(lecturas) {
  const v = lecturas.map(Number);
  if (v.some((x) => !Number.isFinite(x))) return null;
  const prom = Math.round(((v[0] + v[1] + v[2]) / 3) * 1e6) / 1e6;
  const sd = Math.sqrt(v.reduce((s, x) => s + (x - prom) ** 2, 0) / 2);
  return { prom, cv: prom !== 0 ? Math.abs(sd / prom) * 100 : null };
}

export function navigate(hash) { if (location.hash !== hash) location.hash = hash; else window.dispatchEvent(new HashChangeEvent('hashchange')); }

// Dictamen con el resultado después del ajuste o corrección (equipos genéricos)
export function dictamenConAjuste(v) {
  if (v.estado_calbas === 'anulada' || !v.ajuste_realizado_calbas || !v.dictamen_final_calbas) return dictamenPill(v.dictamen_calbas, v.estado_calbas);
  return `${dictamenPill(v.dictamen_calbas, v.estado_calbas)}<span class="cell-sub">${v.dictamen_final_calbas === 'CUMPLE' ? '✓ Cumple tras ajuste' : '✗ No cumple tras ajuste'}</span>`;
}
export const METODOS = {
  PUNTO_UNICO: ['Un punto con corrección', 'Patrón vs lectura del equipo; si hay desviación se registra la corrección y la lectura final (termómetros).'],
  MULTIPUNTO: ['Varios puntos (buffers)', 'Una lectura por punto de referencia y, si hay ajuste, las lecturas después del ajuste (potenciómetros).'],
  SOLO_CALIBRACION: ['Solo calibración', 'Sin verificación interna; únicamente calibraciones externas (micropipetas).'],
};

// ---------------- Avisos push (mismo esquema que Pruebas industriales) ----------------
// La Edge Function recordatorios_calbas envía cada mañana los equipos por verificar
// (a quienes verifican) y las calibraciones y verificaciones atrasadas (a los administradores).
function b64uToUint8(s) {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
export function avisar(body) {
  try { sb.functions.invoke('recordatorios_calbas', { body }).catch(() => {}); } catch { /* sin conexión */ }
}
export const push = {
  soportado: () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext,
  esIOS: () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
  instalada: () => window.matchMedia('(display-mode: standalone), (display-mode: fullscreen), (display-mode: window-controls-overlay)').matches || window.navigator.standalone === true,
  async suscripcion() {
    if (!push.soportado()) return null;
    const reg = await navigator.serviceWorker.getRegistration('/');
    return reg ? reg.pushManager.getSubscription() : null;
  },
  // 'no-soportado' | 'instalar' (iOS sin instalar) | 'bloqueado' | 'activo' | 'inactivo'
  async estado() {
    if (push.esIOS() && !push.instalada()) return 'instalar';
    if (!push.soportado()) return 'no-soportado';
    if (Notification.permission === 'denied') return 'bloqueado';
    return (await push.suscripcion()) && Notification.permission === 'granted' ? 'activo' : 'inactivo';
  },
  async guardar(sub) {
    const j = sub.toJSON();
    const { error } = await sb.rpc('calbas_vincular_push', {
      p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_dispositivo: navigator.userAgent.slice(0, 200),
    });
    if (error) throw error;
  },
  async activar() {
    if (!push.soportado()) throw new Error('Este navegador no admite notificaciones.');
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error('No se concedió el permiso de notificaciones.');
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
    let { data: pub } = await sb.rpc('calbas_vapid_publica');
    if (!pub) pub = (await sb.functions.invoke('recordatorios_calbas', { body: { accion: 'init' } })).data?.publica;
    if (!pub) throw new Error('No se pudo obtener la clave de notificaciones. Intenta más tarde.');
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToUint8(pub) });
    await push.guardar(sub);
  },
  async desactivar() {
    const sub = await push.suscripcion();
    if (sub) {
      await sb.from('push_subs_calbas').delete().eq('endpoint_calbas', sub.endpoint);
      await sub.unsubscribe().catch(() => {});
    }
  },
  // Al cerrar sesión el dispositivo deja de recibir avisos de esa persona (conserva el permiso)
  async desvincular() {
    try { const sub = await push.suscripcion(); if (sub) await sb.from('push_subs_calbas').delete().eq('endpoint_calbas', sub.endpoint); } catch { /* silencioso */ }
  },
  // Al iniciar sesión: si el dispositivo ya dio permiso, vincula la suscripción sin preguntar
  async sincronizar() {
    try {
      if (!push.soportado() || Notification.permission !== 'granted') return;
      const sub = await push.suscripcion();
      if (sub) await push.guardar(sub); else await push.activar();
    } catch { /* silencioso */ }
  },
};
