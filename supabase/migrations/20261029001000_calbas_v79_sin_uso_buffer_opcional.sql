-- =====================================================================
-- Metrología v7.9
--   · «No se usó»: si a un equipo le tocaba verificación y no se utilizó en
--     el día, quien verifica lo registra en sin_uso_calbas. Cuenta como día
--     atendido: la próxima verificación se calcula desde esa fecha.
--   · Potenciómetros: con 3 o más buffers, el último (p. ej. pH 10.01) es
--     opcional; se aceptan las lecturas sin él.
-- Reversión: rollback/20261029001000_rollback.sql
-- =====================================================================

-- ---------- 1. Días sin uso ----------
create table if not exists public.sin_uso_calbas (
  id_calbas               uuid primary key default gen_random_uuid(),
  origen_calbas           text not null check (origen_calbas in ('bascula', 'equipo')),
  equipo_id_calbas        uuid not null,
  departamento_id_calbas  uuid references public.departamentos_calbas(id_calbas),
  fecha_calbas            date not null,
  observaciones_calbas    text check (char_length(observaciones_calbas) <= 300),
  registrado_por_calbas   uuid references public.perfiles_calbas(id_calbas) on delete set null,
  created_at_calbas       timestamptz not null default now()
);
create unique index if not exists sin_uso_calbas_dia_uk on public.sin_uso_calbas (origen_calbas, equipo_id_calbas, fecha_calbas);

create or replace function calbas_private.validar_sin_uso_calbas()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
declare e record; hoy date := (now() at time zone 'America/Mexico_City')::date;
begin
  if auth.uid() is null then raise exception 'Sesión no válida.'; end if;
  select * into e from public.vw_equipos_calbas where id_calbas = new.equipo_id_calbas and origen_calbas = new.origen_calbas;
  if not found or not e.activo_calbas then raise exception 'El equipo no existe o está inactivo.'; end if;
  if not e.requiere_verificacion_calbas then raise exception 'Este equipo no lleva verificación interna.'; end if;
  if new.fecha_calbas > hoy then raise exception 'La fecha no puede ser futura.'; end if;
  if new.fecha_calbas < hoy - 7 then raise exception 'Solo puedes registrar días sin uso de la última semana.'; end if;
  if e.ultima_verificacion_calbas is not null and new.fecha_calbas <= e.ultima_verificacion_calbas then
    raise exception 'Ya hay una verificación registrada el % o después; no hace falta marcar ese día sin uso.', to_char(e.ultima_verificacion_calbas, 'DD/MM/YYYY');
  end if;
  if e.proxima_verificacion_calbas is not null and new.fecha_calbas < e.proxima_verificacion_calbas then
    raise exception 'A este equipo no le tocaba verificación ese día (la próxima es el %).', to_char(e.proxima_verificacion_calbas, 'DD/MM/YYYY');
  end if;
  new.departamento_id_calbas := e.departamento_id_calbas;
  new.registrado_por_calbas := auth.uid();
  new.created_at_calbas := now();
  return new;
end $$;
drop trigger if exists trg_validar_sin_uso_calbas on public.sin_uso_calbas;
create trigger trg_validar_sin_uso_calbas before insert on public.sin_uso_calbas
  for each row execute function calbas_private.validar_sin_uso_calbas();
drop trigger if exists trg_bitacora_sin_uso_calbas on public.sin_uso_calbas;
create trigger trg_bitacora_sin_uso_calbas after insert or delete on public.sin_uso_calbas
  for each row execute function public.bitacora_catalogos_calbas();

alter table public.sin_uso_calbas enable row level security;
create policy sin_uso_calbas_sel on public.sin_uso_calbas for select to authenticated
  using ((select calbas_private.es_admin_calbas()) or calbas_private.tiene_departamento_calbas(departamento_id_calbas));
-- El trigger fija el departamento real del equipo; la política se evalúa con ese valor
create policy sin_uso_calbas_ins on public.sin_uso_calbas for insert to authenticated
  with check ((select calbas_private.activo_calbas()) and ((select calbas_private.es_admin_calbas()) or calbas_private.tiene_departamento_calbas(departamento_id_calbas)));
create policy sin_uso_calbas_del on public.sin_uso_calbas for delete to authenticated using ((select calbas_private.es_admin_calbas()));
revoke all on public.sin_uso_calbas from anon, public;
grant select, insert (origen_calbas, equipo_id_calbas, fecha_calbas, observaciones_calbas), delete on public.sin_uso_calbas to authenticated;

-- ---------- 2. Inventario: la próxima verificación cuenta los días sin uso ----------
create or replace view public.vw_equipos_calbas with (security_invoker = true) as
 WITH base AS (
         SELECT b.id_calbas, 'bascula'::text AS origen_calbas, 'BASCULA'::text AS tipo_clave_calbas,
            CASE b.tipo_bascula_calbas WHEN 'PLATAFORMA' THEN 'Báscula de plataforma' WHEN 'MESA' THEN 'Báscula de mesa'
                 WHEN 'ANALITICA' THEN 'Báscula analítica' ELSE 'Báscula' END AS tipo_nombre_calbas,
            'scale'::text AS icono_calbas, 'Masa'::text AS magnitud_calbas, b.codigo_calbas,
            concat_ws(' · '::text, b.marca_calbas, b.modelo_calbas) AS descripcion_calbas,
            b.departamento_id_calbas, b.ubicacion_calbas, b.marca_calbas, b.modelo_calbas, b.numero_serie_calbas, b.unidad_calbas,
            b.capacidad_minima_calbas AS rango_min_calbas, b.capacidad_maxima_calbas AS rango_max_calbas,
            b.division_minima_calbas AS resolucion_calbas, b.frecuencia_dias_calbas AS frecuencia_verificacion_dias_calbas,
            b.activa_calbas AS activo_calbas, b.created_at_calbas,
            v.fecha_calbas AS ultima_verificacion_calbas, v.dictamen_calbas AS ultimo_dictamen_calbas,
            c.fecha_calibracion_calbas, c.fecha_vencimiento_calbas AS vencimiento_calibracion_calbas,
            c.numero_certificado_calbas, c.proveedor_laboratorio_calbas,
            (SELECT max(s.fecha_calbas) FROM sin_uso_calbas s WHERE s.origen_calbas = 'bascula' AND s.equipo_id_calbas = b.id_calbas) AS ultimo_sin_uso_calbas
           FROM basculas_calbas b
             LEFT JOIN LATERAL ( SELECT v1.fecha_calbas, v1.dictamen_calbas FROM verificaciones_calbas v1
                  WHERE v1.bascula_id_calbas = b.id_calbas AND v1.estado_calbas = 'vigente'::text
                  ORDER BY v1.fecha_calbas DESC, v1.created_at_calbas DESC LIMIT 1) v ON true
             LEFT JOIN LATERAL ( SELECT c1.fecha_calibracion_calbas, c1.fecha_vencimiento_calbas, c1.numero_certificado_calbas, c1.proveedor_laboratorio_calbas
                   FROM calibraciones_calbas c1
                  WHERE c1.bascula_id_calbas = b.id_calbas AND c1.resultado_calbas <> 'cancelada'::text
                  ORDER BY c1.fecha_calibracion_calbas DESC, c1.created_at_calbas DESC LIMIT 1) c ON true
        UNION ALL
         SELECT e.id_calbas, 'equipo'::text, t.clave_calbas, t.nombre_calbas, t.icono_calbas, t.magnitud_calbas, e.codigo_calbas,
            e.descripcion_calbas, e.departamento_id_calbas, e.ubicacion_calbas, e.marca_calbas, e.modelo_calbas, e.numero_serie_calbas,
            e.unidad_calbas, e.rango_min_calbas, e.rango_max_calbas, e.resolucion_calbas, e.frecuencia_verificacion_dias_calbas,
            e.activo_calbas, e.created_at_calbas, v.fecha_calbas, COALESCE(v.dictamen_final_calbas, v.dictamen_calbas) AS "coalesce",
            c.fecha_calibracion_calbas, c.fecha_vencimiento_calbas, c.numero_certificado_calbas, c.proveedor_laboratorio_calbas,
            (SELECT max(s.fecha_calbas) FROM sin_uso_calbas s WHERE s.origen_calbas = 'equipo' AND s.equipo_id_calbas = e.id_calbas)
           FROM equipos_calbas e
             JOIN tipos_equipo_calbas t ON t.id_calbas = e.tipo_id_calbas
             LEFT JOIN LATERAL ( SELECT v1.fecha_calbas, v1.dictamen_calbas, v1.dictamen_final_calbas FROM verificaciones_equipo_calbas v1
                  WHERE v1.equipo_id_calbas = e.id_calbas AND v1.estado_calbas = 'vigente'::text
                  ORDER BY v1.fecha_calbas DESC, v1.created_at_calbas DESC LIMIT 1) v ON true
             LEFT JOIN LATERAL ( SELECT c1.fecha_calibracion_calbas, c1.fecha_vencimiento_calbas, c1.numero_certificado_calbas, c1.proveedor_laboratorio_calbas
                   FROM calibraciones_equipo_calbas c1
                  WHERE c1.equipo_id_calbas = e.id_calbas AND c1.resultado_calbas <> 'cancelada'::text
                  ORDER BY c1.fecha_calibracion_calbas DESC, c1.created_at_calbas DESC LIMIT 1) c ON true
        ), req AS (
         SELECT base.*, COALESCE(( SELECT tt.metodo_calbas <> 'SOLO_CALIBRACION'::text FROM tipos_equipo_calbas tt
                  WHERE tt.clave_calbas = base.tipo_clave_calbas), true) AS requiere,
                -- Último día atendido: verificación o día sin uso posterior
                NULLIF(GREATEST(COALESCE(base.ultima_verificacion_calbas, '-infinity'::date), COALESCE(base.ultimo_sin_uso_calbas, '-infinity'::date)), '-infinity'::date) AS atendido
           FROM base
        )
 SELECT req.id_calbas, req.origen_calbas, req.tipo_clave_calbas, req.tipo_nombre_calbas, req.icono_calbas, req.magnitud_calbas,
    req.codigo_calbas, req.descripcion_calbas, req.departamento_id_calbas, req.ubicacion_calbas, req.marca_calbas, req.modelo_calbas,
    req.numero_serie_calbas, req.unidad_calbas, req.rango_min_calbas, req.rango_max_calbas, req.resolucion_calbas,
    req.frecuencia_verificacion_dias_calbas, req.activo_calbas, req.created_at_calbas, req.ultima_verificacion_calbas,
    req.ultimo_dictamen_calbas, req.fecha_calibracion_calbas, req.vencimiento_calibracion_calbas, req.numero_certificado_calbas,
    req.proveedor_laboratorio_calbas, d.nombre_calbas AS departamento_calbas,
        CASE WHEN NOT req.requiere OR req.atendido IS NULL THEN NULL::date
             ELSE req.atendido + req.frecuencia_verificacion_dias_calbas END AS proxima_verificacion_calbas,
        CASE WHEN NOT req.requiere THEN 'no_aplica'::text
             WHEN req.atendido IS NULL THEN 'sin_registro'::text
             WHEN (req.atendido + req.frecuencia_verificacion_dias_calbas) < CURRENT_DATE THEN 'vencida'::text
             WHEN (req.atendido + req.frecuencia_verificacion_dias_calbas) <= (CURRENT_DATE + 3) THEN 'por_vencer'::text
             ELSE 'al_dia'::text END AS estado_verificacion_calbas,
        CASE WHEN req.vencimiento_calibracion_calbas IS NULL THEN 'sin_registro'::text
             WHEN req.vencimiento_calibracion_calbas < CURRENT_DATE THEN 'vencida'::text
             WHEN req.vencimiento_calibracion_calbas <= (CURRENT_DATE + 30) THEN 'por_vencer'::text
             ELSE 'vigente'::text END AS estado_calibracion_calbas,
    req.vencimiento_calibracion_calbas - CURRENT_DATE AS dias_calibracion_calbas,
    req.requiere AS requiere_verificacion_calbas,
    req.ultimo_sin_uso_calbas
   FROM req
     LEFT JOIN departamentos_calbas d ON d.id_calbas = req.departamento_id_calbas;

-- ---------- 3. Buffer opcional ----------
-- Se reemplaza solo la regla del número de puntos en validar_verificacion_equipo_calbas
do $$
declare def text := pg_get_functiondef('public.validar_verificacion_equipo_calbas'::regproc);
  viejo text := $q$    if array_length(refs, 1) <> n then
      raise exception 'Captura una lectura por cada punto de referencia (%).', array_to_string(refs, ' / ');
    end if;$q$;
  nuevo text := $q$    -- Con 3 o más puntos configurados, el último (p. ej. buffer 10.01) es opcional
    if t.puntos_referencia_calbas is not null and (array_length(refs, 1) > array_length(t.puntos_referencia_calbas, 1)
         or array_length(refs, 1) < array_length(t.puntos_referencia_calbas, 1) - (array_length(t.puntos_referencia_calbas, 1) >= 3)::int) then
      raise exception 'Captura los buffers %; el último es opcional.', array_to_string(t.puntos_referencia_calbas, ' / ');
    end if;
    if array_length(refs, 1) <> n then
      raise exception 'Captura una lectura por cada punto de referencia (%).', array_to_string(refs, ' / ');
    end if;$q$;
begin
  if position(viejo in def) = 0 then raise exception 'No se encontró la regla anterior en validar_verificacion_equipo_calbas.'; end if;
  execute replace(def, viejo, nuevo);
end $$;
