// Edge Function: recordatorios_calbas
// Avisos push (Web Push) de Metrología, con el mismo esquema que Pruebas industriales.
//  · accion 'recordatorio' (pg_cron, lunes a sábado 08:00 CDMX, con el secreto de
//    calbas_private.cron_calbas): equipos por verificar → quienes verifican;
//    verificaciones con 3+ días de atraso y calibraciones → administradores.
//  · accion 'init' (usuario activo): crea las claves VAPID la primera vez.
//  · accion 'prueba' (usuario activo): aviso de prueba a sus propios dispositivos.
//  · accion 'no_cumple' (quien registró la verificación): aviso inmediato a los
//    administradores; se valida en la base que el «no cumple» sea real y reciente.
//  · accion 'etiqueta' (quien registró la verificación): etiqueta dañada → administradores.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const b64u = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const corto = (s: string, n = 110) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const pl = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
function igual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// deno-lint-ignore no-explicit-any
type Db = any;
async function asegurarClaves(admin: Db) {
  const r = await admin.rpc('calbas_vapid_claves');
  if (r.data?.[0]) return r.data[0];
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pub = b64u(await crypto.subtle.exportKey('raw', kp.publicKey));
  const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
  const g = await admin.rpc('calbas_vapid_guardar', { p_publica: pub, p_privada: jwk.d });
  if (g.error) throw g.error;
  return (await admin.rpc('calbas_vapid_claves')).data[0];
}

// Envía a todos los dispositivos de una persona; borra las suscripciones que ya no existen
async function enviar(admin: Db, usuarioId: string, aviso: { title: string; body: string; url: string; tag: string }) {
  const { data: subs } = await admin.from('push_subs_calbas').select('id_calbas, endpoint_calbas, p256dh_calbas, auth_calbas').eq('usuario_id_calbas', usuarioId);
  let n = 0;
  for (const s of subs || []) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint_calbas, keys: { p256dh: s.p256dh_calbas, auth: s.auth_calbas } },
        JSON.stringify(aviso), { TTL: 60 * 60 * 10, urgency: 'normal' },
      );
      n++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await admin.from('push_subs_calbas').delete().eq('id_calbas', s.id_calbas);
      else console.error('push', code, (e as Error).message);
    }
  }
  return n;
}

type Pendiente = { usuario_id: string; nombre: string; tipo: 'verificacion' | 'atraso' | 'calibracion'; total: number; atrasados: number; detalle: string };
function mensaje(p: Pendiente) {
  const nombre = String(p.nombre || '').split(' ')[0];
  if (p.tipo === 'verificacion') return {
    title: `Tienes ${pl(p.total, 'equipo', 'equipos')} por verificar`,
    body: corto(`Buen día, ${nombre}. ${p.atrasados ? `${pl(p.atrasados, 'ya está atrasado', 'ya están atrasados')}. ` : 'Les toca hoy. '}${p.detalle}`),
    url: '/#/verificar', tag: 'calbas-verificacion',
  };
  if (p.tipo === 'atraso') return {
    title: `${pl(p.total, 'verificación atrasada', 'verificaciones atrasadas')} 3 días o más`,
    body: corto(`Quienes verifican no las han registrado: ${p.detalle}`),
    url: '/#/equipos', tag: 'calbas-atraso',
  };
  return {
    title: `${pl(p.total, 'calibración requiere', 'calibraciones requieren')} atención`,
    body: corto(`${p.atrasados ? `${pl(p.atrasados, 'vencida o sin registro', 'vencidas o sin registro')}. ` : 'Por vencer. '}${p.detalle}`),
    url: '/#/calibraciones', tag: 'calbas-calibracion',
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Método no permitido.' });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
    const body = await req.json().catch(() => ({}));

    // ---------- Recordatorio diario (pg_cron) ----------
    const cron = req.headers.get('x-calbas-cron');
    if (cron !== null) {
      const { data: secreto } = await admin.rpc('calbas_cron_secreto');
      if (!secreto || !igual(cron, String(secreto))) return json(401, { error: 'No autorizado.' });
      const { data: pend, error } = await admin.rpc('calbas_pendientes_recordatorio');
      if (error) throw error;
      if (!pend?.length) return json(200, { ok: true, personas: 0 });
      const k = await asegurarClaves(admin);
      webpush.setVapidDetails(k.contacto, k.vapid_publica, k.vapid_privada);
      let push = 0, avisos = 0;
      for (const p of pend as Pendiente[]) {
        // Un aviso por persona, tipo y día (si el cron se repite no duplica)
        const { error: dup } = await admin.from('avisos_calbas').insert({
          usuario_id_calbas: p.usuario_id, tipo_calbas: p.tipo, total_calbas: p.total, detalle_calbas: corto(p.detalle || '', 500),
        });
        if (dup) continue;
        avisos++;
        const n = await enviar(admin, p.usuario_id, mensaje(p));
        push += n;
        if (n) await admin.from('avisos_calbas').update({ enviados_calbas: n })
          .eq('usuario_id_calbas', p.usuario_id).eq('tipo_calbas', p.tipo).eq('fecha_calbas', new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' }));
      }
      return json(200, { ok: true, avisos, push });
    }

    // ---------- Acciones de un usuario con sesión ----------
    const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: u } = await caller.auth.getUser();
    const uid = u?.user?.id;
    if (!uid) return json(401, { error: 'Inicia sesión.' });
    const { data: yo } = await admin.from('perfiles_calbas').select('id_calbas, nombre_completo_calbas, rol_calbas, activo_calbas').eq('id_calbas', uid).maybeSingle();
    if (!yo?.activo_calbas) return json(403, { error: 'Usuario no autorizado.' });

    const k = await asegurarClaves(admin);
    if (body.accion === 'init') return json(200, { publica: k.vapid_publica });
    webpush.setVapidDetails(k.contacto, k.vapid_publica, k.vapid_privada);

    if (body.accion === 'prueba') {
      const n = await enviar(admin, uid, {
        title: 'Avisos de Metrología activos', body: 'Así te avisaremos de los equipos que te toca verificar o calibrar.', url: '/#/perfil', tag: `calbas-prueba-${Date.now()}`,
      });
      await admin.from('avisos_calbas').insert({ usuario_id_calbas: uid, tipo_calbas: 'prueba', enviados_calbas: n });
      return json(200, { ok: true, push: n });
    }

    if (body.accion === 'no_cumple') {
      const origen = body.origen === 'bascula' ? 'bascula' : 'equipo';
      const { data: v } = await admin.from('vw_verificaciones_todas_calbas')
        .select('id_calbas, origen_calbas, equipo_codigo_calbas, tipo_nombre_calbas, departamento_calbas, dictamen_calbas, dictamen_final_calbas, supervisor_id_calbas, estado_calbas, created_at_calbas')
        .eq('id_calbas', String(body.id || '')).eq('origen_calbas', origen).maybeSingle();
      if (!v) return json(404, { error: 'Verificación no encontrada.' });
      const reciente = Date.now() - new Date(v.created_at_calbas).getTime() < 15 * 60 * 1000;
      if (v.supervisor_id_calbas !== uid || !reciente || v.dictamen_calbas !== 'NO_CUMPLE' || v.dictamen_final_calbas === 'CUMPLE' || v.estado_calbas === 'anulada')
        return json(200, { ok: true, push: 0, motivo: 'Sin aviso' });
      const ref = `${origen}:${v.id_calbas}`;
      const { count } = await admin.from('avisos_calbas').select('id_calbas', { count: 'exact', head: true }).eq('tipo_calbas', 'no_cumple').eq('referencia_calbas', ref);
      if (count) return json(200, { ok: true, push: 0, motivo: 'Ya avisado' });
      const { data: admins } = await admin.from('perfiles_calbas').select('id_calbas').eq('rol_calbas', 'admin').eq('activo_calbas', true);
      let push = 0;
      for (const a of admins || []) {
        const n = await enviar(admin, a.id_calbas, {
          title: `No cumple: ${v.tipo_nombre_calbas || 'Equipo'} ${v.equipo_codigo_calbas}`,
          body: corto(`${String(yo.nombre_completo_calbas).split(' ')[0]} registró una verificación fuera de tolerancia${v.departamento_calbas ? ` en ${v.departamento_calbas}` : ''}. Requiere acción correctiva.`),
          url: '/#/historial?seguimiento=pendiente', tag: `calbas-nc-${v.id_calbas}`,
        });
        push += n;
        await admin.from('avisos_calbas').insert({ usuario_id_calbas: a.id_calbas, tipo_calbas: 'no_cumple', total_calbas: 1, detalle_calbas: v.equipo_codigo_calbas, enviados_calbas: n, referencia_calbas: ref });
      }
      return json(200, { ok: true, push });
    }
    // Etiqueta dañada reportada en la verificación: aviso a los administradores
    if (body.accion === 'etiqueta') {
      const origen = body.origen === 'bascula' ? 'bascula' : 'equipo';
      const { data: x } = await admin.from('vw_etiquetas_danadas_calbas')
        .select('id_calbas, codigo_calbas, tipo_nombre_calbas, ubicacion_calbas, created_at_calbas, verificacion_id_calbas')
        .eq('origen_calbas', origen).eq('verificacion_id_calbas', String(body.id || '')).maybeSingle();
      if (!x) return json(404, { error: 'Reporte no encontrado.' });
      const { data: v } = await admin.from(origen === 'bascula' ? 'verificaciones_calbas' : 'verificaciones_equipo_calbas')
        .select('supervisor_id_calbas').eq('id_calbas', x.verificacion_id_calbas).maybeSingle();
      if (v?.supervisor_id_calbas !== uid || Date.now() - new Date(x.created_at_calbas).getTime() > 15 * 60 * 1000) return json(200, { ok: true, push: 0, motivo: 'Sin aviso' });
      const ref = `etiqueta:${x.id_calbas}`;
      const { count } = await admin.from('avisos_calbas').select('id_calbas', { count: 'exact', head: true }).eq('tipo_calbas', 'etiqueta').eq('referencia_calbas', ref);
      if (count) return json(200, { ok: true, push: 0, motivo: 'Ya avisado' });
      const { data: admins } = await admin.from('perfiles_calbas').select('id_calbas').eq('rol_calbas', 'admin').eq('activo_calbas', true);
      let push = 0;
      for (const a of admins || []) {
        const n = await enviar(admin, a.id_calbas, {
          title: `Reemplazar etiqueta: ${x.codigo_calbas}`,
          body: corto(`${String(yo.nombre_completo_calbas).split(' ')[0]} reportó dañada la etiqueta de ${x.tipo_nombre_calbas} ${x.codigo_calbas}${x.ubicacion_calbas ? ` (${x.ubicacion_calbas})` : ''}. Imprime una nueva desde el Panel.`),
          url: '/#/panel', tag: `calbas-etq-${x.id_calbas}`,
        });
        push += n;
        await admin.from('avisos_calbas').insert({ usuario_id_calbas: a.id_calbas, tipo_calbas: 'etiqueta', total_calbas: 1, detalle_calbas: x.codigo_calbas, enviados_calbas: n, referencia_calbas: ref });
      }
      return json(200, { ok: true, push });
    }
    return json(400, { error: 'Acción no válida.' });
  } catch (e) {
    console.error('recordatorios_calbas', e);
    return json(500, { error: 'No se pudieron enviar los avisos.' });
  }
});
