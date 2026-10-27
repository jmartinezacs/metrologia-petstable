-- Reversión de 20261027000600_calbas_v75_inspectores_todas_areas.sql
create or replace function calbas_private.tiene_departamento_calbas(p_departamento_id_calbas uuid)
returns boolean language sql stable security definer set search_path = public, pg_catalog as $$
  select exists(select 1 from public.usuario_departamentos_calbas ud join public.perfiles_calbas p on p.id_calbas=ud.usuario_id_calbas
                where ud.usuario_id_calbas=(select auth.uid()) and ud.departamento_id_calbas=p_departamento_id_calbas and p.activo_calbas);
$$;
drop view if exists public.vw_mi_perfil_calbas;
drop view if exists public.vw_usuarios_calbas;
create view public.vw_usuarios_calbas with (security_invoker = true) as
select p.id_calbas, p.nombre_completo_calbas, p.correo_calbas, p.puesto_calbas, p.rol_calbas, p.avatar_url_calbas, p.activo_calbas, d.nombre_calbas as departamento_calbas
  from public.perfiles_calbas p left join public.usuario_departamentos_calbas ud on ud.usuario_id_calbas = p.id_calbas
  left join public.departamentos_calbas d on d.id_calbas = ud.departamento_id_calbas;
create view public.vw_mi_perfil_calbas with (security_invoker = true) as
select p.id_calbas, p.nombre_completo_calbas, p.correo_calbas, p.puesto_calbas, p.rol_calbas, p.avatar_url_calbas, p.activo_calbas, d.nombre_calbas as departamento_calbas
  from public.perfiles_calbas p left join public.usuario_departamentos_calbas ud on ud.usuario_id_calbas = p.id_calbas
  left join public.departamentos_calbas d on d.id_calbas = ud.departamento_id_calbas where p.id_calbas = (select auth.uid());
grant select on public.vw_usuarios_calbas, public.vw_mi_perfil_calbas to authenticated;
alter table public.perfiles_calbas drop column if exists verifica_todas_calbas;
-- Los códigos de pesas (PP-001/PP-002) y el tipo Termohigrómetro no se restauran automáticamente.
