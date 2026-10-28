-- Reversión de 20261028000900_calbas_v771_bascula_analitica.sql
alter table public.basculas_calbas drop constraint if exists basculas_calbas_tipo_bascula_calbas_check;
update public.basculas_calbas set tipo_bascula_calbas = 'LABORATORIO' where tipo_bascula_calbas = 'ANALITICA';
alter table public.basculas_calbas add constraint basculas_calbas_tipo_bascula_calbas_check
  check (tipo_bascula_calbas in ('PLATAFORMA', 'MESA', 'LABORATORIO'));
-- En calbas_private.preparar_bascula_calbas() y vw_equipos_calbas, volver a 'LABORATORIO' / 'Báscula de laboratorio'
-- (ver 20261028000800).
