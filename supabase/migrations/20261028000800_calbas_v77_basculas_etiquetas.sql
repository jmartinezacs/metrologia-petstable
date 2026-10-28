-- =====================================================================
-- Metrología v7.7 — Básculas y etiquetas
--   · Se eliminan las básculas inactivas (y sus calibraciones), por
--     indicación de la administración.
--   · basculas_calbas.tipo_bascula_calbas: PLATAFORMA (0.4–200 kg),
--     MESA (0.1–15 kg) o LABORATORIO (en gramos). Se calcula si no se indica.
--   · Código automático de básculas desde BAS-001 (las activas se renumeran).
--   · «Etiqueta dañada» en las verificaciones: crea un pendiente de
--     reemplazo (etiquetas_danadas_calbas) que los administradores atienden.
-- Reversión: rollback/20261028000800_rollback.sql
-- =====================================================================

-- ---------- 1. Básculas inactivas ----------
delete from public.calibraciones_calbas c using public.basculas_calbas b
 where c.bascula_id_calbas = b.id_calbas and not b.activa_calbas
   and not exists (select 1 from public.verificaciones_calbas v where v.bascula_id_calbas = b.id_calbas);
delete from public.basculas_calbas b
 where not b.activa_calbas
   and not exists (select 1 from public.verificaciones_calbas v where v.bascula_id_calbas = b.id_calbas);

-- ---------- 2. Tipo de báscula ----------
alter table public.basculas_calbas add column if not exists tipo_bascula_calbas text
  check (tipo_bascula_calbas in ('PLATAFORMA', 'MESA', 'LABORATORIO'));
comment on column public.basculas_calbas.tipo_bascula_calbas is 'PLATAFORMA (0.4–200 kg), MESA (0.1–15 kg) o LABORATORIO (en gramos).';

-- ---------- 3. Código automático BAS-001 ----------
create sequence if not exists calbas_private.seq_basculas_calbas;

create or replace function calbas_private.preparar_bascula_calbas()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  if new.tipo_bascula_calbas is null then
    new.tipo_bascula_calbas := case
      when new.unidad_calbas = 'g' then 'LABORATORIO'
      when new.capacidad_maxima_calbas > 30 then 'PLATAFORMA'
      else 'MESA' end;
  end if;
  if tg_op = 'INSERT' and coalesce(btrim(new.codigo_calbas), '') = '' then
    new.codigo_calbas := 'BAS-' || lpad(nextval('calbas_private.seq_basculas_calbas')::text, 3, '0');
  end if;
  return new;
end $$;
drop trigger if exists trg_preparar_bascula_calbas on public.basculas_calbas;
create trigger trg_preparar_bascula_calbas before insert or update on public.basculas_calbas
  for each row execute function calbas_private.preparar_bascula_calbas();

-- Clasifica y renumera las activas (orden por código actual)
update public.basculas_calbas set tipo_bascula_calbas = null where tipo_bascula_calbas is null;
with o as (select id_calbas, row_number() over (order by codigo_calbas) n from public.basculas_calbas)
update public.basculas_calbas b set codigo_calbas = 'BAS-' || lpad(o.n::text, 3, '0') from o where o.id_calbas = b.id_calbas;
select setval('calbas_private.seq_basculas_calbas', greatest(1, (select count(*) from public.basculas_calbas)), (select count(*) > 0 from public.basculas_calbas));

-- Nombre del tipo en el inventario unificado
create or replace view public.vw_equipos_calbas with (security_invoker = true) as
 WITH base AS (
         SELECT b.id_calbas, 'bascula'::text AS origen_calbas, 'BASCULA'::text AS tipo_clave_calbas,
            CASE b.tipo_bascula_calbas WHEN 'PLATAFORMA' THEN 'Báscula de plataforma' WHEN 'MESA' THEN 'Báscula de mesa'
                 WHEN 'LABORATORIO' THEN 'Báscula de laboratorio' ELSE 'Báscula' END AS tipo_nombre_calbas,
            'scale'::text AS icono_calbas, 'Masa'::text AS magnitud_calbas, b.codigo_calbas,
            concat_ws(' · '::text, b.marca_calbas, b.modelo_calbas) AS descripcion_calbas,
            b.departamento_id_calbas, b.ubicacion_calbas, b.marca_calbas, b.modelo_calbas, b.numero_serie_calbas, b.unidad_calbas,
            b.capacidad_minima_calbas AS rango_min_calbas, b.capacidad_maxima_calbas AS rango_max_calbas,
            b.division_minima_calbas AS resolucion_calbas, b.frecuencia_dias_calbas AS frecuencia_verificacion_dias_calbas,
            b.activa_calbas AS activo_calbas, b.created_at_calbas,
            v.fecha_calbas AS ultima_verificacion_calbas, v.dictamen_calbas AS ultimo_dictamen_calbas,
            c.fecha_calibracion_calbas, c.fecha_vencimiento_calbas AS vencimiento_calibracion_calbas,
            c.numero_certificado_calbas, c.proveedor_laboratorio_calbas
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
            c.fecha_calibracion_calbas, c.fecha_vencimiento_calbas, c.numero_certificado_calbas, c.proveedor_laboratorio_calbas
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
                  WHERE tt.clave_calbas = base.tipo_clave_calbas), true) AS requiere
           FROM base
        )
 SELECT req.id_calbas, req.origen_calbas, req.tipo_clave_calbas, req.tipo_nombre_calbas, req.icono_calbas, req.magnitud_calbas,
    req.codigo_calbas, req.descripcion_calbas, req.departamento_id_calbas, req.ubicacion_calbas, req.marca_calbas, req.modelo_calbas,
    req.numero_serie_calbas, req.unidad_calbas, req.rango_min_calbas, req.rango_max_calbas, req.resolucion_calbas,
    req.frecuencia_verificacion_dias_calbas, req.activo_calbas, req.created_at_calbas, req.ultima_verificacion_calbas,
    req.ultimo_dictamen_calbas, req.fecha_calibracion_calbas, req.vencimiento_calibracion_calbas, req.numero_certificado_calbas,
    req.proveedor_laboratorio_calbas, d.nombre_calbas AS departamento_calbas,
        CASE WHEN NOT req.requiere OR req.ultima_verificacion_calbas IS NULL THEN NULL::date
             ELSE req.ultima_verificacion_calbas + req.frecuencia_verificacion_dias_calbas END AS proxima_verificacion_calbas,
        CASE WHEN NOT req.requiere THEN 'no_aplica'::text
             WHEN req.ultima_verificacion_calbas IS NULL THEN 'sin_registro'::text
             WHEN (req.ultima_verificacion_calbas + req.frecuencia_verificacion_dias_calbas) < CURRENT_DATE THEN 'vencida'::text
             WHEN (req.ultima_verificacion_calbas + req.frecuencia_verificacion_dias_calbas) <= (CURRENT_DATE + 3) THEN 'por_vencer'::text
             ELSE 'al_dia'::text END AS estado_verificacion_calbas,
        CASE WHEN req.vencimiento_calibracion_calbas IS NULL THEN 'sin_registro'::text
             WHEN req.vencimiento_calibracion_calbas < CURRENT_DATE THEN 'vencida'::text
             WHEN req.vencimiento_calibracion_calbas <= (CURRENT_DATE + 30) THEN 'por_vencer'::text
             ELSE 'vigente'::text END AS estado_calibracion_calbas,
    req.vencimiento_calibracion_calbas - CURRENT_DATE AS dias_calibracion_calbas,
    req.requiere AS requiere_verificacion_calbas
   FROM req
     LEFT JOIN departamentos_calbas d ON d.id_calbas = req.departamento_id_calbas;

-- ---------- 4. Etiqueta dañada ----------
alter table public.verificaciones_calbas add column if not exists etiqueta_danada_calbas boolean not null default false;
alter table public.verificaciones_equipo_calbas add column if not exists etiqueta_danada_calbas boolean not null default false;

create table if not exists public.etiquetas_danadas_calbas (
  id_calbas               bigint generated always as identity primary key,
  origen_calbas           text not null check (origen_calbas in ('bascula', 'equipo')),
  equipo_id_calbas        uuid not null,
  verificacion_id_calbas  uuid not null,
  reportada_por_calbas    uuid references public.perfiles_calbas(id_calbas) on delete set null,
  created_at_calbas       timestamptz not null default now(),
  reemplazada_at_calbas   timestamptz,
  reemplazada_por_calbas  uuid references public.perfiles_calbas(id_calbas) on delete set null
);
create unique index if not exists etiquetas_danadas_calbas_ver_uk on public.etiquetas_danadas_calbas (origen_calbas, verificacion_id_calbas);
create index if not exists etiquetas_danadas_calbas_abiertas_idx on public.etiquetas_danadas_calbas (equipo_id_calbas) where reemplazada_at_calbas is null;
alter table public.etiquetas_danadas_calbas enable row level security;
create policy etiquetas_danadas_calbas_sel on public.etiquetas_danadas_calbas for select to authenticated using ((select calbas_private.es_admin_calbas()));
create policy etiquetas_danadas_calbas_upd on public.etiquetas_danadas_calbas for update to authenticated
  using ((select calbas_private.es_admin_calbas())) with check ((select calbas_private.es_admin_calbas()));
revoke all on public.etiquetas_danadas_calbas from anon, public;
grant select, update (reemplazada_at_calbas, reemplazada_por_calbas) on public.etiquetas_danadas_calbas to authenticated;

create or replace function calbas_private.registrar_etiqueta_danada_calbas()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  if new.etiqueta_danada_calbas then
    insert into public.etiquetas_danadas_calbas (origen_calbas, equipo_id_calbas, verificacion_id_calbas, reportada_por_calbas)
    values (tg_argv[0], case when tg_argv[0] = 'bascula' then (to_jsonb(new) ->> 'bascula_id_calbas')::uuid else (to_jsonb(new) ->> 'equipo_id_calbas')::uuid end,
            new.id_calbas, new.supervisor_id_calbas)
    on conflict do nothing;
  end if;
  return new;
end $$;
drop trigger if exists trg_etiqueta_bascula_calbas on public.verificaciones_calbas;
create trigger trg_etiqueta_bascula_calbas after insert on public.verificaciones_calbas
  for each row execute function calbas_private.registrar_etiqueta_danada_calbas('bascula');
drop trigger if exists trg_etiqueta_equipo_calbas on public.verificaciones_equipo_calbas;
create trigger trg_etiqueta_equipo_calbas after insert on public.verificaciones_equipo_calbas
  for each row execute function calbas_private.registrar_etiqueta_danada_calbas('equipo');

-- Pendientes de reemplazo con los datos del equipo (para el panel e imprimir la etiqueta)
create or replace view public.vw_etiquetas_danadas_calbas with (security_invoker = true) as
select x.id_calbas, x.origen_calbas, x.equipo_id_calbas, x.verificacion_id_calbas, x.created_at_calbas,
       x.reemplazada_at_calbas, e.codigo_calbas, e.tipo_nombre_calbas, e.tipo_clave_calbas, e.numero_serie_calbas,
       e.ubicacion_calbas, e.departamento_calbas, p.nombre_completo_calbas as reportada_por_nombre_calbas
  from public.etiquetas_danadas_calbas x
  join public.vw_equipos_calbas e on e.id_calbas = x.equipo_id_calbas and e.origen_calbas = x.origen_calbas
  left join public.perfiles_calbas p on p.id_calbas = x.reportada_por_calbas;
grant select on public.vw_etiquetas_danadas_calbas to authenticated;

alter table public.avisos_calbas drop constraint if exists avisos_calbas_tipo_calbas_check;
alter table public.avisos_calbas add constraint avisos_calbas_tipo_calbas_check
  check (tipo_calbas in ('verificacion', 'atraso', 'calibracion', 'no_cumple', 'etiqueta', 'prueba'));
