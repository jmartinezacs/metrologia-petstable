-- Reversión de 20261027000400_calbas_v73_metodos_ajuste.sql
-- 1) Vuelve a crear las vistas sin las columnas nuevas: drop de
--    vw_no_cumple_calbas, vw_verificaciones_todas_calbas y vw_equipos_calbas, y
--    re-ejecuta la sección 8 de 20261022000100 y la vista de 20261022000200.
-- 2) Restaura las funciones validar_verificacion_equipo_calbas y
--    validar_cambio_verificacion_equipo_calbas de 20261022000100 (sección 6).
-- 3) Quita las columnas (se pierden los datos de ajuste registrados):
alter table public.verificaciones_equipo_calbas
  drop column if exists metodo_aplicado_calbas, drop column if exists referencias_calbas,
  drop column if exists ajuste_realizado_calbas, drop column if exists correccion_calbas,
  drop column if exists lecturas_post_calbas, drop column if exists desviacion_final_calbas,
  drop column if exists dictamen_final_calbas, drop column if exists temperatura_calbas;
alter table public.tipos_equipo_calbas drop column if exists metodo_calbas, drop column if exists puntos_referencia_calbas;
-- lectura_2/3 vuelven a NOT NULL solo si no hay filas con nulos.
