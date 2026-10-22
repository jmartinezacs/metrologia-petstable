-- Reversión de 20261022000100_calbas_v7_equipos_genericos.sql
-- ATENCIÓN: elimina los equipos genéricos, sus verificaciones y calibraciones.
-- No toca básculas, pesas patrón, verificaciones ni calibraciones de básculas.
-- Ejecutar solo con autorización expresa y después de exportar los datos.
drop policy if exists certificados_calbas_select on storage.objects;
drop policy if exists certificados_calbas_admin_insert on storage.objects;
drop policy if exists certificados_calbas_admin_update on storage.objects;
drop policy if exists certificados_calbas_admin_delete on storage.objects;
-- El bucket certificados_calbas se conserva (puede contener certificados de básculas).

drop view if exists public.vw_calibraciones_todas_calbas;
drop view if exists public.vw_verificaciones_todas_calbas;
drop view if exists public.vw_equipos_calbas;
drop table if exists public.calibraciones_equipo_calbas;
drop table if exists public.verificaciones_equipo_calbas;
drop table if exists public.patrones_calbas;
drop table if exists public.equipos_calbas;
drop table if exists public.tipos_equipo_calbas;
drop function if exists public.validar_verificacion_equipo_calbas();
drop function if exists public.validar_cambio_verificacion_equipo_calbas();
drop function if exists public.bitacora_verificaciones_equipo_calbas();
drop function if exists calbas_private.validar_unidad_tipo_calbas();
drop function if exists calbas_private.autor_calibracion_equipo_calbas();
drop sequence if exists calbas_private.seq_patrones_calbas;
