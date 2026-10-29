-- =====================================================================
-- Metrología v8.0
--   · Potenciómetros: un patrón (buffer certificado) por cada punto.
--     verificaciones_equipo_calbas.patrones_buffers_calbas va alineado con
--     referencias_calbas; patron_id_calbas queda con el primero.
--   · Solo los administradores cambian la fotografía de un perfil.
-- (El intercambio de códigos TER-02 / TER-04 se hizo como corrección de datos.)
-- Reversión: rollback/20261029001100_rollback.sql
-- =====================================================================
alter table public.verificaciones_equipo_calbas add column if not exists patrones_buffers_calbas uuid[];
comment on column public.verificaciones_equipo_calbas.patrones_buffers_calbas is 'Patrón usado en cada buffer, en el mismo orden que referencias_calbas.';

-- Validación de los patrones por buffer (antes de evaluar las lecturas)
do $$
declare def text := pg_get_functiondef('public.validar_verificacion_equipo_calbas'::regproc);
  ancla text := $q$    for i in 1..n loop
      d := lect[i] - refs[i];$q$;
  nuevo text := $q$    -- Un patrón por buffer (opcional; si se envía debe cubrir todos los puntos capturados)
    if new.patrones_buffers_calbas is not null then
      if coalesce(array_length(new.patrones_buffers_calbas, 1), 0) <> n then raise exception 'Selecciona el patrón de cada buffer capturado.'; end if;
      if exists (select 1 from unnest(new.patrones_buffers_calbas) pid left join public.patrones_calbas pp on pp.id_calbas = pid
                  where pp.id_calbas is null or not pp.activo_calbas or pp.tipo_id_calbas <> e.tipo_id_calbas
                     or (pp.fecha_vencimiento_calbas is not null and pp.fecha_vencimiento_calbas < new.fecha_calbas)) then
        raise exception 'Algún patrón de buffer no existe, está inactivo, vencido o no corresponde al tipo de equipo.';
      end if;
      new.patron_id_calbas := new.patrones_buffers_calbas[1];
    end if;
$q$;
begin
  if position(ancla in def) = 0 then raise exception 'No se encontró el punto de inserción en validar_verificacion_equipo_calbas.'; end if;
  execute replace(def, ancla, nuevo || ancla);
end $$;

-- Historial: muestra todos los patrones usados (PAT-001 / PAT-002 …)
do $$
declare def text := pg_get_viewdef('public.vw_verificaciones_todas_calbas'::regclass, true);
  viejo text := 'pt.codigo_calbas AS patron_codigo_calbas';
begin
  if position(viejo in def) = 0 then raise exception 'No se encontró patron_codigo_calbas en vw_verificaciones_todas_calbas.'; end if;
  def := replace(def, viejo, $q$COALESCE(( SELECT string_agg(x.codigo_calbas, ' / '::text ORDER BY a.ord) FROM unnest(v.patrones_buffers_calbas) WITH ORDINALITY a(pid, ord)
             JOIN patrones_calbas x ON x.id_calbas = a.pid), pt.codigo_calbas) AS patron_codigo_calbas$q$);
  execute 'create or replace view public.vw_verificaciones_todas_calbas with (security_invoker = true) as ' || def;
end $$;

-- Fotografía: solo administradores (la Edge Function usa service_role, sin auth.uid())
create or replace function calbas_private.proteger_foto_calbas()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  if new.avatar_url_calbas is distinct from old.avatar_url_calbas and auth.uid() is not null and not calbas_private.es_admin_calbas() then
    raise exception 'Solo los administradores pueden cambiar la fotografía.' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists trg_proteger_foto_calbas on public.perfiles_calbas;
create trigger trg_proteger_foto_calbas before update of avatar_url_calbas on public.perfiles_calbas
  for each row execute function calbas_private.proteger_foto_calbas();
