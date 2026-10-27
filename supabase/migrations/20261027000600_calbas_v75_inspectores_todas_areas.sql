-- =====================================================================
-- Metrología v7.5 — Por indicación de la administración, los Inspectores
-- de calidad verifican los equipos de TODAS las áreas.
--   · perfiles_calbas.verifica_todas_calbas: el usuario ve y verifica
--     equipos de todos los departamentos (sin ser administrador).
--   · Pesas patrón renumeradas desde PP-001.
--   · Se elimina el tipo Termohigrómetro (sin equipos ni patrones).
-- Reversión: rollback/20261027000600_rollback.sql
-- =====================================================================
alter table public.perfiles_calbas add column verifica_todas_calbas boolean not null default false;
comment on column public.perfiles_calbas.verifica_todas_calbas is 'Metrología: ve y verifica equipos de todos los departamentos (inspectores de calidad).';

update public.perfiles_calbas set verifica_todas_calbas = true where puesto_calbas ilike 'Inspector de calidad';

-- Acceso por departamento, o a todos si el perfil tiene «verifica todas las áreas»
create or replace function calbas_private.tiene_departamento_calbas(p_departamento_id_calbas uuid)
returns boolean language sql stable security definer set search_path = public, pg_catalog as $$
  select exists (select 1 from public.perfiles_calbas p
                  where p.id_calbas = (select auth.uid()) and p.activo_calbas and p.verifica_todas_calbas)
      or exists (select 1 from public.usuario_departamentos_calbas ud join public.perfiles_calbas p on p.id_calbas = ud.usuario_id_calbas
                  where ud.usuario_id_calbas = (select auth.uid()) and ud.departamento_id_calbas = p_departamento_id_calbas and p.activo_calbas);
$$;

create or replace view public.vw_usuarios_calbas with (security_invoker = true) as
select p.id_calbas, p.nombre_completo_calbas, p.correo_calbas, p.puesto_calbas, p.rol_calbas, p.avatar_url_calbas, p.activo_calbas,
       d.nombre_calbas as departamento_calbas, p.verifica_todas_calbas
  from public.perfiles_calbas p
  left join public.usuario_departamentos_calbas ud on ud.usuario_id_calbas = p.id_calbas
  left join public.departamentos_calbas d on d.id_calbas = ud.departamento_id_calbas;

create or replace view public.vw_mi_perfil_calbas with (security_invoker = true) as
select p.id_calbas, p.nombre_completo_calbas, p.correo_calbas, p.puesto_calbas, p.rol_calbas, p.avatar_url_calbas, p.activo_calbas,
       d.nombre_calbas as departamento_calbas, p.verifica_todas_calbas
  from public.perfiles_calbas p
  left join public.usuario_departamentos_calbas ud on ud.usuario_id_calbas = p.id_calbas
  left join public.departamentos_calbas d on d.id_calbas = ud.departamento_id_calbas
 where p.id_calbas = (select auth.uid());

-- Pesas patrón desde PP-001 (sin verificaciones asociadas al aplicarla)
update public.pesas_patron_calbas set codigo_calbas = 'PP-001' where codigo_calbas = 'PP-003';
update public.pesas_patron_calbas set codigo_calbas = 'PP-002' where codigo_calbas = 'PP-004';
select setval('calbas_private.seq_pesas_patron_calbas',
              greatest(1, coalesce((select max(substring(codigo_calbas from 'PP-(\d+)')::int) from public.pesas_patron_calbas), 0)),
              (select count(*) > 0 from public.pesas_patron_calbas));

-- Termohigrómetros: no se usan en Pet's Table
delete from public.tipos_equipo_calbas t
 where t.clave_calbas = 'TERMOHIGROMETRO'
   and not exists (select 1 from public.equipos_calbas e where e.tipo_id_calbas = t.id_calbas)
   and not exists (select 1 from public.patrones_calbas p where p.tipo_id_calbas = t.id_calbas);
