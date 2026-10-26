-- Reversión de 20261022000300_calbas_v72_cuentas_existentes.sql
drop function if exists public.calbas_agregar_cuenta(uuid, text, text, text, uuid, text);
drop function if exists public.calbas_buscar_cuentas(text);
