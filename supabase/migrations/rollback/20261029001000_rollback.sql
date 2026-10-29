-- Reversión de 20261029001000_calbas_v79_sin_uso_buffer_opcional.sql
-- 1. Volver a crear vw_equipos_calbas como en 20261028000900 (sin ultimo_sin_uso_calbas):
--    create or replace no permite quitar columnas, así que primero drop view ... cascade
--    y recrear vw_etiquetas_danadas_calbas (20261028000800).
-- 2. Restaurar la regla de puntos en validar_verificacion_equipo_calbas (20261027000400).
drop trigger if exists trg_validar_sin_uso_calbas on public.sin_uso_calbas;
drop trigger if exists trg_bitacora_sin_uso_calbas on public.sin_uso_calbas;
drop function if exists calbas_private.validar_sin_uso_calbas();
-- drop table public.sin_uso_calbas;  -- después de recrear la vista
