-- Reversión de 20261029001100_calbas_v80_patron_por_buffer_foto_admin.sql
drop trigger if exists trg_proteger_foto_calbas on public.perfiles_calbas;
drop function if exists calbas_private.proteger_foto_calbas();
-- validar_verificacion_equipo_calbas: quitar el bloque «Un patrón por buffer» (ver 20261029001000).
-- vw_verificaciones_todas_calbas: volver a «pt.codigo_calbas AS patron_codigo_calbas»; después:
-- alter table public.verificaciones_equipo_calbas drop column if exists patrones_buffers_calbas;
-- Códigos de termómetros: TER-02 (Laboratorio) ↔ TER-04 (Marmitas) se intercambiaron a petición del usuario.
