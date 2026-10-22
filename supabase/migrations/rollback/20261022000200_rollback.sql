-- Reversión de 20261022000200_calbas_v71_seguimiento_no_cumple.sql
-- ATENCIÓN: elimina los seguimientos registrados. Exporta antes los datos.
drop view if exists public.vw_no_cumple_calbas;
drop table if exists public.seguimientos_calbas;
drop function if exists public.validar_seguimiento_calbas();
