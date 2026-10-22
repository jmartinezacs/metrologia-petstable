-- =====================================================================
-- Metrología v7.1 — Seguimiento (acción correctiva) de verificaciones
-- con dictamen NO_CUMPLE, para básculas y equipos genéricos.
-- Migración ADITIVA. Reversión: rollback/20261022000200_rollback.sql
-- =====================================================================
create table public.seguimientos_calbas (
  id_calbas            uuid primary key default gen_random_uuid(),
  origen_calbas        text not null check (origen_calbas in ('bascula','equipo')),
  verificacion_id_calbas uuid not null,
  equipo_id_calbas     uuid,
  departamento_id_calbas uuid references public.departamentos_calbas(id_calbas),
  accion_calbas        text not null check (accion_calbas in ('AJUSTE','REPARACION','CALIBRACION','FUERA_DE_USO','REVERIFICACION','BAJA','OTRO')),
  descripcion_calbas   text not null check (length(trim(descripcion_calbas)) between 3 and 1000),
  fecha_compromiso_calbas date,
  estado_calbas        text not null default 'abierto' check (estado_calbas in ('abierto','cerrado')),
  cierre_calbas        text,
  cerrado_at_calbas    timestamptz,
  cerrado_por_calbas   uuid references public.perfiles_calbas(id_calbas),
  responsable_id_calbas uuid references public.perfiles_calbas(id_calbas),
  created_at_calbas    timestamptz not null default now(),
  constraint seguimientos_calbas_verif_uk unique (origen_calbas, verificacion_id_calbas),
  constraint seguimientos_calbas_cierre_ck check (estado_calbas = 'abierto' or length(trim(coalesce(cierre_calbas, ''))) >= 3)
);
create index seguimientos_calbas_estado_idx on public.seguimientos_calbas(estado_calbas);

-- Valida que la verificación exista, sea NO_CUMPLE y esté vigente; fija equipo, departamento y responsables
create or replace function public.validar_seguimiento_calbas()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
declare d text; est text; eq uuid; dep uuid;
begin
  if auth.uid() is null then raise exception 'Sesión no válida.'; end if;
  if tg_op = 'INSERT' then
    if new.origen_calbas = 'bascula' then
      select dictamen_calbas, estado_calbas, bascula_id_calbas, departamento_id_calbas into d, est, eq, dep
        from public.verificaciones_calbas where id_calbas = new.verificacion_id_calbas;
    else
      select dictamen_calbas, estado_calbas, equipo_id_calbas, departamento_id_calbas into d, est, eq, dep
        from public.verificaciones_equipo_calbas where id_calbas = new.verificacion_id_calbas;
    end if;
    if d is null then raise exception 'La verificación no existe.'; end if;
    if d <> 'NO_CUMPLE' then raise exception 'Solo las verificaciones con dictamen «no cumple» requieren seguimiento.'; end if;
    if est <> 'vigente' then raise exception 'La verificación está anulada.'; end if;
    new.equipo_id_calbas := eq;
    new.departamento_id_calbas := dep;
    new.responsable_id_calbas := auth.uid();
    new.estado_calbas := 'abierto';
    new.cierre_calbas := null; new.cerrado_at_calbas := null; new.cerrado_por_calbas := null;
    new.created_at_calbas := now();
  else
    if old.estado_calbas = 'cerrado' then raise exception 'El seguimiento ya está cerrado.'; end if;
    if (new.origen_calbas, new.verificacion_id_calbas, new.equipo_id_calbas, new.departamento_id_calbas, new.responsable_id_calbas, new.created_at_calbas)
       is distinct from (old.origen_calbas, old.verificacion_id_calbas, old.equipo_id_calbas, old.departamento_id_calbas, old.responsable_id_calbas, old.created_at_calbas) then
      raise exception 'No se puede cambiar la verificación ni el responsable del seguimiento.';
    end if;
    if new.estado_calbas = 'cerrado' then
      new.cerrado_at_calbas := now();
      new.cerrado_por_calbas := auth.uid();
    end if;
  end if;
  return new;
end $$;
revoke all on function public.validar_seguimiento_calbas() from public, anon, authenticated;

create trigger trg_validar_seguimiento_calbas before insert or update on public.seguimientos_calbas
  for each row execute function public.validar_seguimiento_calbas();
create trigger trg_bitacora_seguimientos_calbas after insert or update on public.seguimientos_calbas
  for each row execute function public.bitacora_catalogos_calbas();

alter table public.seguimientos_calbas enable row level security;
revoke all on public.seguimientos_calbas from anon;
grant select, insert, update on public.seguimientos_calbas to authenticated;

-- Lo ven y registran administradores y usuarios del departamento del equipo
create policy seguimientos_select_calbas on public.seguimientos_calbas for select to authenticated
  using ((select calbas_private.es_admin_calbas()) or (select calbas_private.tiene_departamento_calbas(departamento_id_calbas)));
create policy seguimientos_insert_calbas on public.seguimientos_calbas for insert to authenticated
  with check ((select calbas_private.es_admin_calbas()) or (select calbas_private.tiene_departamento_calbas(departamento_id_calbas)));
create policy seguimientos_update_calbas on public.seguimientos_calbas for update to authenticated
  using ((select calbas_private.es_admin_calbas()) or (select calbas_private.tiene_departamento_calbas(departamento_id_calbas)))
  with check ((select calbas_private.es_admin_calbas()) or (select calbas_private.tiene_departamento_calbas(departamento_id_calbas)));

-- «No cumple» vigentes con su estado de seguimiento
create view public.vw_no_cumple_calbas with (security_invoker = true) as
select v.id_calbas, v.origen_calbas, v.tipo_nombre_calbas, v.fecha_calbas, v.equipo_id_calbas, v.equipo_codigo_calbas,
       v.departamento_id_calbas, v.departamento_calbas, v.error_calbas, v.tolerancia_calbas, v.unidad_calculo_calbas, v.supervisor_calbas,
       s.id_calbas as seguimiento_id_calbas, s.accion_calbas, s.descripcion_calbas as seguimiento_descripcion_calbas,
       s.fecha_compromiso_calbas, s.cierre_calbas, s.cerrado_at_calbas,
       coalesce(s.estado_calbas, 'sin_seguimiento') as estado_seguimiento_calbas
  from public.vw_verificaciones_todas_calbas v
  left join public.seguimientos_calbas s on s.origen_calbas = v.origen_calbas and s.verificacion_id_calbas = v.id_calbas
 where v.dictamen_calbas = 'NO_CUMPLE' and v.estado_calbas = 'vigente';
revoke all on public.vw_no_cumple_calbas from anon;
grant select on public.vw_no_cumple_calbas to authenticated;
