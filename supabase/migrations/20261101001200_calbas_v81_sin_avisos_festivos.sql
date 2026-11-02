-- =====================================================================
-- Metrología v8.1
--   · Los recordatorios diarios ya no se envían en fin de semana ni en días
--     festivos. Festivos oficiales (Ley Federal del Trabajo, art. 74) se
--     calculan solos; los de la empresa los agregan los administradores en
--     dias_festivos_calbas.
--   · pg_cron: lunes a viernes 08:00 (Ciudad de México) y solo si es hábil.
-- Reversión: rollback/20261101001200_rollback.sql
-- =====================================================================

-- ---------- 1. Festivos de la empresa ----------
create table if not exists public.dias_festivos_calbas (
  id_calbas            uuid primary key default gen_random_uuid(),
  fecha_calbas         date not null unique,
  motivo_calbas        text not null check (char_length(btrim(motivo_calbas)) between 2 and 80),
  registrado_por_calbas uuid references public.perfiles_calbas(id_calbas) on delete set null default auth.uid(),
  created_at_calbas    timestamptz not null default now()
);
alter table public.dias_festivos_calbas enable row level security;
create policy dias_festivos_calbas_sel on public.dias_festivos_calbas for select to authenticated
  using ((select calbas_private.activo_calbas()));
create policy dias_festivos_calbas_ins on public.dias_festivos_calbas for insert to authenticated
  with check ((select calbas_private.es_admin_calbas()));
create policy dias_festivos_calbas_del on public.dias_festivos_calbas for delete to authenticated
  using ((select calbas_private.es_admin_calbas()));
revoke all on public.dias_festivos_calbas from anon, public;
grant select, insert (fecha_calbas, motivo_calbas), delete on public.dias_festivos_calbas to authenticated;
drop trigger if exists trg_bitacora_dias_festivos_calbas on public.dias_festivos_calbas;
create trigger trg_bitacora_dias_festivos_calbas after insert or delete on public.dias_festivos_calbas
  for each row execute function public.bitacora_catalogos_calbas();

-- ---------- 2. Festivos oficiales (LFT art. 74) ----------
create or replace function calbas_private.lunes_n_calbas(anio int, mes int, n int)
returns date language sql immutable set search_path = pg_catalog as $$
  -- n-ésimo lunes del mes
  select make_date(anio, mes, 1) + ((8 - extract(isodow from make_date(anio, mes, 1))::int) % 7) + 7 * (n - 1)
$$;

create or replace function public.calbas_dias_festivos(anio int)
returns table (fecha date, motivo text, oficial boolean)
language sql stable security definer set search_path = public, pg_catalog as $$
  select * from (
    values
      (make_date(anio, 1, 1), 'Año Nuevo', true),
      (calbas_private.lunes_n_calbas(anio, 2, 1), 'Día de la Constitución', true),
      (calbas_private.lunes_n_calbas(anio, 3, 3), 'Natalicio de Benito Juárez', true),
      (make_date(anio, 5, 1), 'Día del Trabajo', true),
      (make_date(anio, 9, 16), 'Día de la Independencia', true),
      (calbas_private.lunes_n_calbas(anio, 11, 3), 'Día de la Revolución', true),
      (make_date(anio, 12, 25), 'Navidad', true)
  ) o(fecha, motivo, oficial)
  union all
  select make_date(anio, 10, 1), 'Transmisión del Poder Ejecutivo Federal', true where anio >= 2024 and (anio - 2024) % 6 = 0
  union all
  select f.fecha_calbas, f.motivo_calbas, false from public.dias_festivos_calbas f
   where extract(year from f.fecha_calbas) = anio
  order by 1
$$;
revoke all on function public.calbas_dias_festivos(int) from public, anon;
grant execute on function public.calbas_dias_festivos(int) to authenticated, service_role;

-- Sábado, domingo o festivo (oficial o de la empresa)
create or replace function calbas_private.dia_sin_avisos_calbas(d date)
returns boolean language sql stable security definer set search_path = public, pg_catalog as $$
  select extract(isodow from d) in (6, 7)
      or exists (select 1 from public.calbas_dias_festivos(extract(year from d)::int) x where x.fecha = d)
$$;
revoke all on function calbas_private.dia_sin_avisos_calbas(date) from public, anon, authenticated;

-- ---------- 3. pg_cron: lunes a viernes 08:00, solo días hábiles ----------
select cron.unschedule(jobid) from cron.job where jobname = 'calbas_recordatorio_pendientes';
select cron.schedule('calbas_recordatorio_pendientes', '0 14 * * 1-5', $cron$
  select net.http_post(
    url := 'https://domumnsezocubigfqwry.supabase.co/functions/v1/recordatorios_calbas',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-calbas-cron', (select secreto from calbas_private.cron_calbas where id_calbas = 1)),
    body := jsonb_build_object('accion', 'recordatorio'),
    timeout_milliseconds := 30000)
  where not calbas_private.dia_sin_avisos_calbas((now() at time zone 'America/Mexico_City')::date);
$cron$);
