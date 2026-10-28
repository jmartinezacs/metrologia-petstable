-- =====================================================================
-- Metrología v7.6 — Avisos push (mismo esquema que Pruebas industriales)
--   · push_subs_calbas: suscripciones Web Push de cada dispositivo.
--   · Claves VAPID y secreto del cron en calbas_private (no expuesto).
--   · calbas_pendientes_recordatorio(): a quién avisar cada mañana:
--       verificacion → quienes verifican (no administradores), equipos que
--                      ya tocan o están atrasados en sus áreas.
--       atraso       → administradores, verificaciones con 3 días o más
--                      de retraso.
--       calibracion  → administradores, calibraciones vencidas, por vencer
--                      o sin registro.
--   · avisos_calbas: registro de lo enviado (y evita duplicados del día).
--   · pg_cron: lunes a sábado 08:00 (Ciudad de México) → recordatorios_calbas.
-- Reversión: rollback/20261028000700_rollback.sql
-- =====================================================================

-- ---------- Suscripciones ----------
create table if not exists public.push_subs_calbas (
  id_calbas          bigint generated always as identity primary key,
  usuario_id_calbas  uuid not null references public.perfiles_calbas(id_calbas) on delete cascade,
  endpoint_calbas    text not null,
  p256dh_calbas      text not null,
  auth_calbas        text not null,
  dispositivo_calbas text,
  created_at_calbas  timestamptz not null default now()
);
create unique index if not exists push_subs_calbas_endpoint_uk on public.push_subs_calbas (endpoint_calbas);
create index if not exists push_subs_calbas_usuario_idx on public.push_subs_calbas (usuario_id_calbas);
alter table public.push_subs_calbas enable row level security;
create policy push_subs_calbas_sel on public.push_subs_calbas for select to authenticated using (usuario_id_calbas = (select auth.uid()));
create policy push_subs_calbas_del on public.push_subs_calbas for delete to authenticated using (usuario_id_calbas = (select auth.uid()));
revoke all on public.push_subs_calbas from anon, public;
grant select, delete on public.push_subs_calbas to authenticated;

-- Vincula este dispositivo a quien tiene la sesión (aunque antes fuera de otra persona)
create or replace function public.calbas_vincular_push(p_endpoint text, p_p256dh text, p_auth text, p_dispositivo text default null)
returns void language plpgsql security definer set search_path = public, pg_catalog as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null or not calbas_private.activo_calbas() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  if coalesce(p_endpoint, '') !~ '^https://' or length(p_endpoint) > 1000 then raise exception 'Suscripción no válida.'; end if;
  delete from public.push_subs_calbas where endpoint_calbas = p_endpoint and usuario_id_calbas <> uid;
  insert into public.push_subs_calbas (usuario_id_calbas, endpoint_calbas, p256dh_calbas, auth_calbas, dispositivo_calbas)
  values (uid, p_endpoint, p_p256dh, p_auth, left(p_dispositivo, 200))
  on conflict (endpoint_calbas) do update set p256dh_calbas = excluded.p256dh_calbas, auth_calbas = excluded.auth_calbas,
                                             dispositivo_calbas = excluded.dispositivo_calbas;
end $$;
revoke all on function public.calbas_vincular_push(text, text, text, text) from public, anon;
grant execute on function public.calbas_vincular_push(text, text, text, text) to authenticated;

-- ---------- Claves VAPID (las genera la Edge Function la primera vez) ----------
create table if not exists calbas_private.config_push_calbas (
  id_calbas      smallint primary key default 1 check (id_calbas = 1),
  vapid_publica  text not null,
  vapid_privada  text not null,
  contacto       text not null default 'mailto:javier.martinez@petstable.mx'
);
revoke all on calbas_private.config_push_calbas from public, anon, authenticated;

create or replace function public.calbas_vapid_publica()
returns text language sql stable security definer set search_path = public, pg_catalog as $$
  select vapid_publica from calbas_private.config_push_calbas where id_calbas = 1 and calbas_private.activo_calbas()
$$;
revoke all on function public.calbas_vapid_publica() from public, anon;
grant execute on function public.calbas_vapid_publica() to authenticated;

create or replace function public.calbas_vapid_claves()
returns table (vapid_publica text, vapid_privada text, contacto text) language sql stable security definer set search_path = public, pg_catalog as $$
  select vapid_publica, vapid_privada, contacto from calbas_private.config_push_calbas where id_calbas = 1
$$;
revoke all on function public.calbas_vapid_claves() from public, anon, authenticated;
grant execute on function public.calbas_vapid_claves() to service_role;

create or replace function public.calbas_vapid_guardar(p_publica text, p_privada text)
returns void language sql security definer set search_path = public, pg_catalog as $$
  insert into calbas_private.config_push_calbas (id_calbas, vapid_publica, vapid_privada) values (1, p_publica, p_privada)
  on conflict (id_calbas) do nothing
$$;
revoke all on function public.calbas_vapid_guardar(text, text) from public, anon, authenticated;
grant execute on function public.calbas_vapid_guardar(text, text) to service_role;

-- ---------- Registro de avisos ----------
create table if not exists public.avisos_calbas (
  id_calbas          bigint generated always as identity primary key,
  fecha_calbas       date not null default ((now() at time zone 'America/Mexico_City')::date),
  usuario_id_calbas  uuid not null references public.perfiles_calbas(id_calbas) on delete cascade,
  tipo_calbas        text not null check (tipo_calbas in ('verificacion', 'atraso', 'calibracion', 'no_cumple', 'prueba')),
  total_calbas       integer not null default 0,
  detalle_calbas     text,
  enviados_calbas    integer not null default 0,
  referencia_calbas  text,
  created_at_calbas  timestamptz not null default now()
);
create unique index if not exists avisos_calbas_dia_uk on public.avisos_calbas (fecha_calbas, usuario_id_calbas, tipo_calbas)
  where tipo_calbas in ('verificacion', 'atraso', 'calibracion');
create index if not exists avisos_calbas_usuario_idx on public.avisos_calbas (usuario_id_calbas, created_at_calbas desc);
alter table public.avisos_calbas enable row level security;
create policy avisos_calbas_sel on public.avisos_calbas for select to authenticated
  using (usuario_id_calbas = (select auth.uid()) or (select calbas_private.es_admin_calbas()));
revoke all on public.avisos_calbas from anon, public;
grant select on public.avisos_calbas to authenticated;

-- ---------- Pendientes por persona ----------
create or replace function public.calbas_pendientes_recordatorio()
returns table (usuario_id uuid, nombre text, tipo text, total integer, atrasados integer, detalle text)
language sql stable security definer set search_path = public, pg_catalog as $$
  with hoy as (select (now() at time zone 'America/Mexico_City')::date as d),
  ver as (
    select e.id_calbas, e.codigo_calbas, e.departamento_id_calbas,
           (select d from hoy) - coalesce(e.proxima_verificacion_calbas, e.created_at_calbas::date) as dias
      from public.vw_equipos_calbas e
     where e.activo_calbas and coalesce(e.requiere_verificacion_calbas, true)
       and coalesce(e.proxima_verificacion_calbas, e.created_at_calbas::date) <= (select d from hoy)
  ),
  cal as (
    select e.codigo_calbas, e.estado_calibracion_calbas as estado, coalesce(e.dias_calibracion_calbas, -99999) as dias
      from public.vw_equipos_calbas e
     where e.activo_calbas and e.estado_calibracion_calbas in ('vencida', 'por_vencer', 'sin_registro')
  ),
  gente as (select p.id_calbas, p.nombre_completo_calbas, p.rol_calbas, p.verifica_todas_calbas
              from public.perfiles_calbas p where p.activo_calbas),
  -- Quienes verifican: sus áreas (o todas)
  v1 as (
    select g.id_calbas, g.nombre_completo_calbas, count(*)::int as total, count(*) filter (where v.dias > 0)::int as atrasados,
           string_agg(v.codigo_calbas, ', ' order by v.dias desc, v.codigo_calbas) as detalle
      from gente g join ver v on g.verifica_todas_calbas
                               or exists (select 1 from public.usuario_departamentos_calbas ud
                                           where ud.usuario_id_calbas = g.id_calbas and ud.departamento_id_calbas = v.departamento_id_calbas)
     where g.rol_calbas <> 'admin'
     group by g.id_calbas, g.nombre_completo_calbas
  ),
  -- Administradores: 3 días o más de atraso
  v2 as (
    select g.id_calbas, g.nombre_completo_calbas, count(*)::int as total, count(*)::int as atrasados,
           string_agg(v.codigo_calbas || ' (' || v.dias || ' d)', ', ' order by v.dias desc, v.codigo_calbas) as detalle
      from gente g cross join ver v
     where g.rol_calbas = 'admin' and v.dias >= 3
     group by g.id_calbas, g.nombre_completo_calbas
  ),
  -- Administradores: calibraciones
  c1 as (
    select g.id_calbas, g.nombre_completo_calbas, count(*)::int as total, count(*) filter (where c.estado <> 'por_vencer')::int as atrasados,
           string_agg(c.codigo_calbas, ', ' order by c.dias, c.codigo_calbas) as detalle
      from gente g cross join cal c
     where g.rol_calbas = 'admin'
     group by g.id_calbas, g.nombre_completo_calbas
  )
  select id_calbas, nombre_completo_calbas, 'verificacion'::text, total, atrasados, detalle from v1
  union all select id_calbas, nombre_completo_calbas, 'atraso', total, atrasados, detalle from v2
  union all select id_calbas, nombre_completo_calbas, 'calibracion', total, atrasados, detalle from c1
$$;
revoke all on function public.calbas_pendientes_recordatorio() from public, anon, authenticated;
grant execute on function public.calbas_pendientes_recordatorio() to service_role;

-- ---------- Secreto del cron ----------
create table if not exists calbas_private.cron_calbas (
  id_calbas smallint primary key default 1 check (id_calbas = 1),
  secreto   text not null default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
);
insert into calbas_private.cron_calbas (id_calbas) values (1) on conflict do nothing;
revoke all on calbas_private.cron_calbas from public, anon, authenticated;

create or replace function public.calbas_cron_secreto()
returns text language sql stable security definer set search_path = public, pg_catalog as $$
  select secreto from calbas_private.cron_calbas where id_calbas = 1
$$;
revoke all on function public.calbas_cron_secreto() from public, anon, authenticated;
grant execute on function public.calbas_cron_secreto() to service_role;

-- Lunes a sábado 08:00 en Ciudad de México (UTC-6, sin horario de verano)
select cron.unschedule(jobid) from cron.job where jobname = 'calbas_recordatorio_pendientes';
select cron.schedule('calbas_recordatorio_pendientes', '0 14 * * 1-6', $cron$
  select net.http_post(
    url := 'https://domumnsezocubigfqwry.supabase.co/functions/v1/recordatorios_calbas',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-calbas-cron', (select secreto from calbas_private.cron_calbas where id_calbas = 1)),
    body := jsonb_build_object('accion', 'recordatorio'),
    timeout_milliseconds := 30000);
$cron$);
