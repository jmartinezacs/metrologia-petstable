-- Reversión de 20261028000800_calbas_v77_basculas_etiquetas.sql
-- Las básculas inactivas eliminadas y los códigos anteriores (ABS/PRD/CAL/LOG) no se restauran automáticamente.
alter table public.avisos_calbas drop constraint if exists avisos_calbas_tipo_calbas_check;
alter table public.avisos_calbas add constraint avisos_calbas_tipo_calbas_check
  check (tipo_calbas in ('verificacion', 'atraso', 'calibracion', 'no_cumple', 'prueba'));
drop view if exists public.vw_etiquetas_danadas_calbas;
drop trigger if exists trg_etiqueta_bascula_calbas on public.verificaciones_calbas;
drop trigger if exists trg_etiqueta_equipo_calbas on public.verificaciones_equipo_calbas;
drop function if exists calbas_private.registrar_etiqueta_danada_calbas();
drop table if exists public.etiquetas_danadas_calbas;
alter table public.verificaciones_calbas drop column if exists etiqueta_danada_calbas;
alter table public.verificaciones_equipo_calbas drop column if exists etiqueta_danada_calbas;
drop trigger if exists trg_preparar_bascula_calbas on public.basculas_calbas;
drop function if exists calbas_private.preparar_bascula_calbas();
drop sequence if exists calbas_private.seq_basculas_calbas;
-- vw_equipos_calbas: volver a crearla con 'Báscula'::text como tipo_nombre_calbas (ver 20261027000400) antes de borrar la columna.
-- alter table public.basculas_calbas drop column if exists tipo_bascula_calbas;
