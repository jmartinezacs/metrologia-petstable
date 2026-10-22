-- =====================================================================
-- Metrología · Pet's Table — v7.0: equipos genéricos (termómetros,
-- potenciómetros, micropipetas, termohigrómetros, …).
--
-- Migración ADITIVA: no modifica ni borra objetos existentes de básculas
-- (basculas_calbas, pesas_patron_calbas, verificaciones_calbas,
-- calibraciones_calbas). Todo objeto nuevo usa el sufijo _calbas.
-- Reversión: supabase/migrations/rollback/20261022000100_rollback.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tipos de equipo (catálogo administrable)
-- ---------------------------------------------------------------------
create table public.tipos_equipo_calbas (
  id_calbas            uuid primary key default gen_random_uuid(),
  clave_calbas         text not null unique check (clave_calbas ~ '^[A-Z][A-Z0-9_]{1,39}$' and clave_calbas <> 'BASCULA'),
  nombre_calbas        text not null unique check (length(trim(nombre_calbas)) between 2 and 80),
  magnitud_calbas      text not null check (length(trim(magnitud_calbas)) between 2 and 60),
  unidades_calbas      text[] not null check (cardinality(unidades_calbas) >= 1),
  prefijo_codigo_calbas text not null check (prefijo_codigo_calbas ~ '^[A-Z]{2,5}$'),
  icono_calbas         text not null default 'gauge',
  tolerancia_sugerida_calbas numeric check (tolerancia_sugerida_calbas > 0),
  tolerancia_tipo_sugerida_calbas text not null default 'ABSOLUTA' check (tolerancia_tipo_sugerida_calbas in ('ABSOLUTA','PORCENTAJE')),
  permite_negativos_calbas boolean not null default false,
  guia_calbas          text,
  activo_calbas        boolean not null default true,
  created_at_calbas    timestamptz not null default now()
);
comment on table public.tipos_equipo_calbas is 'Metrología: tipos de equipo distintos de básculas (las básculas conservan su módulo especializado).';

insert into public.tipos_equipo_calbas
  (clave_calbas, nombre_calbas, magnitud_calbas, unidades_calbas, prefijo_codigo_calbas, icono_calbas,
   tolerancia_sugerida_calbas, tolerancia_tipo_sugerida_calbas, permite_negativos_calbas, guia_calbas)
values
  ('TERMOMETRO', 'Termómetro', 'Temperatura', array['°C'], 'TER', 'thermometer', 1.0, 'ABSOLUTA', true,
   'Compara la lectura del termómetro contra un termómetro patrón calibrado o un baño/medio de referencia en el mismo punto.'),
  ('POTENCIOMETRO', 'Potenciómetro (pH)', 'pH', array['pH'], 'POT', 'flask-conical', 0.05, 'ABSOLUTA', false,
   'Mide soluciones buffer certificadas (p. ej. pH 4.00, 7.00 y 10.00) y registra la lectura de cada buffer.'),
  ('MICROPIPETA', 'Micropipeta', 'Volumen', array['µL','mL'], 'MIC', 'pipette', 1.0, 'PORCENTAJE', false,
   'Método gravimétrico: dispensa agua sobre una balanza, convierte masa a volumen y captura los volúmenes obtenidos.'),
  ('TERMOHIGROMETRO', 'Termohigrómetro', 'Humedad relativa', array['%HR','°C'], 'THG', 'droplets', 3.0, 'ABSOLUTA', false,
   'Compara contra un termohigrómetro patrón calibrado colocado en el mismo ambiente durante al menos 15 minutos.');

-- ---------------------------------------------------------------------
-- 2. Equipos
-- ---------------------------------------------------------------------
create table public.equipos_calbas (
  id_calbas            uuid primary key default gen_random_uuid(),
  tipo_id_calbas       uuid not null references public.tipos_equipo_calbas(id_calbas),
  codigo_calbas        text not null unique check (length(trim(codigo_calbas)) between 2 and 40),
  descripcion_calbas   text,
  departamento_id_calbas uuid not null references public.departamentos_calbas(id_calbas),
  ubicacion_calbas     text,
  marca_calbas         text,
  modelo_calbas        text,
  numero_serie_calbas  text,
  unidad_calbas        text not null,
  rango_min_calbas     numeric,
  rango_max_calbas     numeric,
  resolucion_calbas    numeric check (resolucion_calbas > 0),
  tolerancia_calbas    numeric not null check (tolerancia_calbas > 0),
  tolerancia_tipo_calbas text not null default 'ABSOLUTA' check (tolerancia_tipo_calbas in ('ABSOLUTA','PORCENTAJE')),
  cv_max_pct_calbas    numeric check (cv_max_pct_calbas > 0),
  frecuencia_verificacion_dias_calbas integer not null default 30 check (frecuencia_verificacion_dias_calbas > 0),
  frecuencia_calibracion_dias_calbas  integer not null default 365 check (frecuencia_calibracion_dias_calbas > 0),
  activo_calbas        boolean not null default true,
  created_at_calbas    timestamptz not null default now(),
  created_by_calbas    uuid references public.perfiles_calbas(id_calbas),
  constraint equipos_calbas_rango_ck check (rango_min_calbas is null or rango_max_calbas is null or rango_max_calbas > rango_min_calbas)
);
create index equipos_calbas_tipo_idx on public.equipos_calbas(tipo_id_calbas);
create index equipos_calbas_depto_idx on public.equipos_calbas(departamento_id_calbas);

-- ---------------------------------------------------------------------
-- 3. Patrones de referencia (para equipos genéricos; las pesas patrón
--    de básculas siguen en pesas_patron_calbas)
-- ---------------------------------------------------------------------
create sequence calbas_private.seq_patrones_calbas;

create table public.patrones_calbas (
  id_calbas            uuid primary key default gen_random_uuid(),
  codigo_calbas        text not null unique,
  tipo_id_calbas       uuid not null references public.tipos_equipo_calbas(id_calbas),
  descripcion_calbas   text not null check (length(trim(descripcion_calbas)) between 2 and 140),
  valor_nominal_calbas numeric,
  unidad_calbas        text not null,
  incertidumbre_calbas numeric check (incertidumbre_calbas >= 0),
  numero_certificado_calbas text,
  proveedor_calbas     text,
  lote_calbas          text,
  fecha_calibracion_calbas date,
  fecha_vencimiento_calbas date,
  activo_calbas        boolean not null default true,
  created_at_calbas    timestamptz not null default now(),
  constraint patrones_calbas_fechas_ck check (fecha_vencimiento_calbas is null or fecha_calibracion_calbas is null or fecha_vencimiento_calbas >= fecha_calibracion_calbas)
);
create index patrones_calbas_tipo_idx on public.patrones_calbas(tipo_id_calbas);

-- ---------------------------------------------------------------------
-- 4. Verificaciones de equipos genéricos
-- ---------------------------------------------------------------------
create table public.verificaciones_equipo_calbas (
  id_calbas            uuid primary key default gen_random_uuid(),
  fecha_calbas         date not null default current_date,
  equipo_id_calbas     uuid not null references public.equipos_calbas(id_calbas),
  departamento_id_calbas uuid not null references public.departamentos_calbas(id_calbas),
  patron_id_calbas     uuid not null references public.patrones_calbas(id_calbas),
  valor_referencia_calbas numeric not null,
  lectura_1_calbas     numeric not null,
  lectura_2_calbas     numeric not null,
  lectura_3_calbas     numeric not null,
  promedio_lecturas_calbas numeric,
  error_calbas         numeric,
  tolerancia_aplicada_calbas numeric,
  tolerancia_tipo_aplicada_calbas text,
  cv_pct_calbas        numeric,
  cv_max_aplicado_calbas numeric,
  unidad_calbas        text,
  dictamen_calbas      text check (dictamen_calbas in ('CUMPLE','NO_CUMPLE')),
  observaciones_calbas text,
  supervisor_id_calbas uuid references public.perfiles_calbas(id_calbas),
  estado_calbas        text not null default 'vigente' check (estado_calbas in ('vigente','anulada')),
  motivo_anulacion_calbas text,
  motivo_cambio_calbas text,
  created_at_calbas    timestamptz not null default now()
);
create index verif_equipo_calbas_equipo_idx on public.verificaciones_equipo_calbas(equipo_id_calbas, fecha_calbas desc);
create index verif_equipo_calbas_depto_idx on public.verificaciones_equipo_calbas(departamento_id_calbas);

-- ---------------------------------------------------------------------
-- 5. Calibraciones externas de equipos genéricos
-- ---------------------------------------------------------------------
create table public.calibraciones_equipo_calbas (
  id_calbas            uuid primary key default gen_random_uuid(),
  equipo_id_calbas     uuid not null references public.equipos_calbas(id_calbas),
  fecha_calibracion_calbas date not null,
  fecha_vencimiento_calbas date not null,
  numero_certificado_calbas text,
  proveedor_laboratorio_calbas text,
  resultado_calbas     text not null default 'vigente' check (resultado_calbas in ('vigente','no_conforme','cancelada')),
  observaciones_calbas text,
  archivo_url_calbas   text,
  created_at_calbas    timestamptz not null default now(),
  created_by_calbas    uuid references public.perfiles_calbas(id_calbas),
  constraint calibraciones_equipo_calbas_fechas_ck check (fecha_vencimiento_calbas >= fecha_calibracion_calbas)
);
create index calib_equipo_calbas_equipo_idx on public.calibraciones_equipo_calbas(equipo_id_calbas, fecha_calibracion_calbas desc);

-- ---------------------------------------------------------------------
-- 6. Lógica de negocio (triggers)
-- ---------------------------------------------------------------------
-- Unidad del equipo/patrón debe pertenecer a su tipo
create or replace function calbas_private.validar_unidad_tipo_calbas()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
declare t public.tipos_equipo_calbas%rowtype;
begin
  select * into t from public.tipos_equipo_calbas where id_calbas = new.tipo_id_calbas;
  if not found then raise exception 'El tipo de equipo no existe.'; end if;
  if not (new.unidad_calbas = any(t.unidades_calbas)) then
    raise exception 'La unidad % no corresponde al tipo % (unidades permitidas: %).', new.unidad_calbas, t.nombre_calbas, array_to_string(t.unidades_calbas, ', ');
  end if;
  if tg_table_name = 'patrones_calbas' and tg_op = 'INSERT' and coalesce(trim(new.codigo_calbas), '') = '' then
    new.codigo_calbas := 'PAT-' || lpad(nextval('calbas_private.seq_patrones_calbas')::text, 3, '0');
  end if;
  if tg_table_name = 'equipos_calbas' and tg_op = 'INSERT' then
    new.created_by_calbas := coalesce(new.created_by_calbas, auth.uid());
    new.codigo_calbas := upper(trim(new.codigo_calbas));
  end if;
  return new;
end $$;

create trigger trg_unidad_equipos_calbas before insert or update on public.equipos_calbas
  for each row execute function calbas_private.validar_unidad_tipo_calbas();
create trigger trg_unidad_patrones_calbas before insert or update on public.patrones_calbas
  for each row execute function calbas_private.validar_unidad_tipo_calbas();

-- Cálculo autoritativo de la verificación
create or replace function public.validar_verificacion_equipo_calbas()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  uid uuid := auth.uid();
  e public.equipos_calbas%rowtype;
  t public.tipos_equipo_calbas%rowtype;
  p public.patrones_calbas%rowtype;
  prom numeric; err numeric; tol numeric; sd numeric; cv numeric;
begin
  if uid is null then raise exception 'Sesión no válida.'; end if;
  select * into e from public.equipos_calbas where id_calbas = new.equipo_id_calbas;
  if not found or not e.activo_calbas then raise exception 'El equipo no existe o está inactivo.'; end if;
  select * into t from public.tipos_equipo_calbas where id_calbas = e.tipo_id_calbas;
  if new.fecha_calbas > current_date then raise exception 'La fecha no puede ser futura.'; end if;
  select * into p from public.patrones_calbas where id_calbas = new.patron_id_calbas;
  if not found or not p.activo_calbas then raise exception 'El patrón de referencia no existe o está inactivo.'; end if;
  if p.tipo_id_calbas <> e.tipo_id_calbas then raise exception 'El patrón seleccionado no corresponde al tipo de equipo.'; end if;
  if p.fecha_vencimiento_calbas is not null and p.fecha_vencimiento_calbas < new.fecha_calbas then raise exception 'El patrón de referencia está vencido.'; end if;
  if new.lectura_1_calbas is null or new.lectura_2_calbas is null or new.lectura_3_calbas is null then
    raise exception 'Debes capturar las tres lecturas.';
  end if;
  if not t.permite_negativos_calbas and (new.lectura_1_calbas < 0 or new.lectura_2_calbas < 0 or new.lectura_3_calbas < 0 or new.valor_referencia_calbas < 0) then
    raise exception 'Las lecturas y el valor de referencia no pueden ser negativos para este tipo de equipo.';
  end if;

  prom := round((new.lectura_1_calbas + new.lectura_2_calbas + new.lectura_3_calbas) / 3.0, 6);
  err  := round(prom - new.valor_referencia_calbas, 6);
  tol  := case when e.tolerancia_tipo_calbas = 'PORCENTAJE'
               then round(abs(new.valor_referencia_calbas) * e.tolerancia_calbas / 100.0, 6)
               else e.tolerancia_calbas end;
  sd   := sqrt(((new.lectura_1_calbas - prom)^2 + (new.lectura_2_calbas - prom)^2 + (new.lectura_3_calbas - prom)^2) / 2.0);
  cv   := case when prom <> 0 then round(abs(sd / prom) * 100.0, 4) else null end;

  new.departamento_id_calbas := e.departamento_id_calbas;
  new.unidad_calbas := e.unidad_calbas;
  new.promedio_lecturas_calbas := prom;
  new.error_calbas := err;
  new.tolerancia_aplicada_calbas := tol;
  new.tolerancia_tipo_aplicada_calbas := e.tolerancia_tipo_calbas;
  new.cv_pct_calbas := cv;
  new.cv_max_aplicado_calbas := e.cv_max_pct_calbas;
  new.dictamen_calbas := case
    when abs(err) > tol then 'NO_CUMPLE'
    when e.cv_max_pct_calbas is not null and coalesce(cv, 0) > e.cv_max_pct_calbas then 'NO_CUMPLE'
    else 'CUMPLE' end;
  new.supervisor_id_calbas := uid;
  new.estado_calbas := 'vigente';
  new.motivo_anulacion_calbas := null;
  new.motivo_cambio_calbas := null;
  new.created_at_calbas := now();
  return new;
end $$;

-- Una verificación registrada solo puede anularse (con motivo); los datos medidos no se editan
create or replace function public.validar_cambio_verificacion_equipo_calbas()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  if old.estado_calbas = 'anulada' then raise exception 'Una verificación anulada no puede modificarse.'; end if;
  if (new.fecha_calbas, new.equipo_id_calbas, new.departamento_id_calbas, new.patron_id_calbas, new.valor_referencia_calbas,
      new.lectura_1_calbas, new.lectura_2_calbas, new.lectura_3_calbas, new.promedio_lecturas_calbas, new.error_calbas,
      new.tolerancia_aplicada_calbas, new.dictamen_calbas, new.supervisor_id_calbas, new.created_at_calbas)
     is distinct from
     (old.fecha_calbas, old.equipo_id_calbas, old.departamento_id_calbas, old.patron_id_calbas, old.valor_referencia_calbas,
      old.lectura_1_calbas, old.lectura_2_calbas, old.lectura_3_calbas, old.promedio_lecturas_calbas, old.error_calbas,
      old.tolerancia_aplicada_calbas, old.dictamen_calbas, old.supervisor_id_calbas, old.created_at_calbas) then
    raise exception 'Los datos medidos no pueden editarse. Anula la verificación y registra una nueva.';
  end if;
  if nullif(trim(new.motivo_cambio_calbas), '') is null then raise exception 'Toda corrección o anulación requiere un motivo.'; end if;
  if new.estado_calbas = 'anulada' and nullif(trim(new.motivo_anulacion_calbas), '') is null then
    raise exception 'El motivo de anulación es obligatorio.';
  end if;
  return new;
end $$;

create trigger trg_validar_verificacion_equipo_calbas before insert on public.verificaciones_equipo_calbas
  for each row execute function public.validar_verificacion_equipo_calbas();
create trigger trg_validar_cambio_verificacion_equipo_calbas before update on public.verificaciones_equipo_calbas
  for each row execute function public.validar_cambio_verificacion_equipo_calbas();

-- Bitácora
create or replace function public.bitacora_verificaciones_equipo_calbas()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  insert into public.bitacora_calbas
    (tabla_calbas, registro_id_calbas, accion_calbas, usuario_id_calbas, datos_antes_calbas, datos_despues_calbas, motivo_calbas)
  values
    ('verificaciones_equipo_calbas', coalesce(new.id_calbas, old.id_calbas),
     case when tg_op = 'INSERT' then 'insert'
          when new.estado_calbas = 'anulada' and old.estado_calbas <> 'anulada' then 'anular'
          else 'update' end,
     auth.uid(),
     case when tg_op = 'INSERT' then null else to_jsonb(old) end,
     to_jsonb(new),
     case when tg_op = 'INSERT' then null else coalesce(new.motivo_anulacion_calbas, new.motivo_cambio_calbas) end);
  return new;
end $$;

create trigger trg_bitacora_verificaciones_equipo_calbas after insert or update on public.verificaciones_equipo_calbas
  for each row execute function public.bitacora_verificaciones_equipo_calbas();
create trigger trg_bitacora_equipos_calbas after insert or update on public.equipos_calbas
  for each row execute function public.bitacora_catalogos_calbas();
create trigger trg_bitacora_patrones_calbas after insert or update on public.patrones_calbas
  for each row execute function public.bitacora_catalogos_calbas();
create trigger trg_bitacora_calibraciones_equipo_calbas after insert or update on public.calibraciones_equipo_calbas
  for each row execute function public.bitacora_catalogos_calbas();
create trigger trg_bitacora_tipos_equipo_calbas after insert or update on public.tipos_equipo_calbas
  for each row execute function public.bitacora_catalogos_calbas();

-- Autoría de calibraciones
create or replace function calbas_private.autor_calibracion_equipo_calbas()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  if tg_op = 'INSERT' then new.created_by_calbas := coalesce(new.created_by_calbas, auth.uid()); end if;
  return new;
end $$;
create trigger trg_autor_calibraciones_equipo_calbas before insert on public.calibraciones_equipo_calbas
  for each row execute function calbas_private.autor_calibracion_equipo_calbas();

revoke all on function public.validar_verificacion_equipo_calbas() from public, anon, authenticated;
revoke all on function public.validar_cambio_verificacion_equipo_calbas() from public, anon, authenticated;
revoke all on function public.bitacora_verificaciones_equipo_calbas() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 7. Seguridad (RLS) — mismas reglas que el módulo de básculas
-- ---------------------------------------------------------------------
alter table public.tipos_equipo_calbas enable row level security;
alter table public.equipos_calbas enable row level security;
alter table public.patrones_calbas enable row level security;
alter table public.verificaciones_equipo_calbas enable row level security;
alter table public.calibraciones_equipo_calbas enable row level security;

revoke all on public.tipos_equipo_calbas, public.equipos_calbas, public.patrones_calbas,
              public.verificaciones_equipo_calbas, public.calibraciones_equipo_calbas from anon;
grant select, insert, update on public.tipos_equipo_calbas, public.equipos_calbas, public.patrones_calbas,
              public.verificaciones_equipo_calbas, public.calibraciones_equipo_calbas to authenticated;
grant delete on public.equipos_calbas, public.patrones_calbas to authenticated;

create policy tipos_equipo_select_calbas on public.tipos_equipo_calbas for select to authenticated
  using ((select calbas_private.activo_calbas()));
create policy tipos_equipo_admin_insert_calbas on public.tipos_equipo_calbas for insert to authenticated
  with check ((select calbas_private.es_admin_calbas()));
create policy tipos_equipo_admin_update_calbas on public.tipos_equipo_calbas for update to authenticated
  using ((select calbas_private.es_admin_calbas())) with check ((select calbas_private.es_admin_calbas()));

create policy equipos_select_calbas on public.equipos_calbas for select to authenticated
  using ((select calbas_private.es_admin_calbas()) or (select calbas_private.tiene_departamento_calbas(departamento_id_calbas)));
create policy equipos_admin_insert_calbas on public.equipos_calbas for insert to authenticated
  with check ((select calbas_private.es_admin_calbas()));
create policy equipos_admin_update_calbas on public.equipos_calbas for update to authenticated
  using ((select calbas_private.es_admin_calbas())) with check ((select calbas_private.es_admin_calbas()));
create policy equipos_admin_delete_calbas on public.equipos_calbas for delete to authenticated
  using ((select calbas_private.es_admin_calbas()));

create policy patrones_select_calbas on public.patrones_calbas for select to authenticated
  using ((select calbas_private.activo_calbas()));
create policy patrones_admin_insert_calbas on public.patrones_calbas for insert to authenticated
  with check ((select calbas_private.es_admin_calbas()));
create policy patrones_admin_update_calbas on public.patrones_calbas for update to authenticated
  using ((select calbas_private.es_admin_calbas())) with check ((select calbas_private.es_admin_calbas()));
create policy patrones_admin_delete_calbas on public.patrones_calbas for delete to authenticated
  using ((select calbas_private.es_admin_calbas()));

create policy verif_equipo_select_calbas on public.verificaciones_equipo_calbas for select to authenticated
  using ((select calbas_private.es_admin_calbas()) or (select calbas_private.tiene_departamento_calbas(departamento_id_calbas)));
create policy verif_equipo_insert_calbas on public.verificaciones_equipo_calbas for insert to authenticated
  with check ((select calbas_private.es_admin_calbas())
              or ((select calbas_private.es_usuario_calbas()) and (select calbas_private.tiene_departamento_calbas(departamento_id_calbas))));
create policy verif_equipo_admin_update_calbas on public.verificaciones_equipo_calbas for update to authenticated
  using ((select calbas_private.es_admin_calbas())) with check ((select calbas_private.es_admin_calbas()));

create policy calib_equipo_select_calbas on public.calibraciones_equipo_calbas for select to authenticated
  using ((select calbas_private.activo_calbas()));
create policy calib_equipo_admin_insert_calbas on public.calibraciones_equipo_calbas for insert to authenticated
  with check ((select calbas_private.es_admin_calbas()));
create policy calib_equipo_admin_update_calbas on public.calibraciones_equipo_calbas for update to authenticated
  using ((select calbas_private.es_admin_calbas())) with check ((select calbas_private.es_admin_calbas()));

-- ---------------------------------------------------------------------
-- 8. Vistas unificadas (security_invoker: respetan RLS de cada tabla)
-- ---------------------------------------------------------------------
-- Inventario de todos los equipos (básculas + equipos genéricos) con su estado
create view public.vw_equipos_calbas with (security_invoker = true) as
with base as (
  select b.id_calbas, 'bascula'::text as origen_calbas, 'BASCULA'::text as tipo_clave_calbas, 'Báscula'::text as tipo_nombre_calbas,
         'scale'::text as icono_calbas, 'Masa'::text as magnitud_calbas,
         b.codigo_calbas, concat_ws(' · ', b.marca_calbas, b.modelo_calbas) as descripcion_calbas,
         b.departamento_id_calbas, b.ubicacion_calbas, b.marca_calbas, b.modelo_calbas, b.numero_serie_calbas, b.unidad_calbas,
         b.capacidad_minima_calbas as rango_min_calbas, b.capacidad_maxima_calbas as rango_max_calbas,
         b.division_minima_calbas as resolucion_calbas, b.frecuencia_dias_calbas as frecuencia_verificacion_dias_calbas,
         b.activa_calbas as activo_calbas, b.created_at_calbas,
         v.fecha_calbas as ultima_verificacion_calbas, v.dictamen_calbas as ultimo_dictamen_calbas,
         c.fecha_calibracion_calbas, c.fecha_vencimiento_calbas as vencimiento_calibracion_calbas,
         c.numero_certificado_calbas, c.proveedor_laboratorio_calbas
    from public.basculas_calbas b
    left join lateral (select v1.fecha_calbas, v1.dictamen_calbas from public.verificaciones_calbas v1
                        where v1.bascula_id_calbas = b.id_calbas and v1.estado_calbas = 'vigente'
                        order by v1.fecha_calbas desc, v1.created_at_calbas desc limit 1) v on true
    left join lateral (select c1.fecha_calibracion_calbas, c1.fecha_vencimiento_calbas, c1.numero_certificado_calbas, c1.proveedor_laboratorio_calbas
                         from public.calibraciones_calbas c1
                        where c1.bascula_id_calbas = b.id_calbas and c1.resultado_calbas <> 'cancelada'
                        order by c1.fecha_calibracion_calbas desc, c1.created_at_calbas desc limit 1) c on true
  union all
  select e.id_calbas, 'equipo', t.clave_calbas, t.nombre_calbas, t.icono_calbas, t.magnitud_calbas,
         e.codigo_calbas, e.descripcion_calbas,
         e.departamento_id_calbas, e.ubicacion_calbas, e.marca_calbas, e.modelo_calbas, e.numero_serie_calbas, e.unidad_calbas,
         e.rango_min_calbas, e.rango_max_calbas, e.resolucion_calbas, e.frecuencia_verificacion_dias_calbas,
         e.activo_calbas, e.created_at_calbas,
         v.fecha_calbas, v.dictamen_calbas,
         c.fecha_calibracion_calbas, c.fecha_vencimiento_calbas, c.numero_certificado_calbas, c.proveedor_laboratorio_calbas
    from public.equipos_calbas e
    join public.tipos_equipo_calbas t on t.id_calbas = e.tipo_id_calbas
    left join lateral (select v1.fecha_calbas, v1.dictamen_calbas from public.verificaciones_equipo_calbas v1
                        where v1.equipo_id_calbas = e.id_calbas and v1.estado_calbas = 'vigente'
                        order by v1.fecha_calbas desc, v1.created_at_calbas desc limit 1) v on true
    left join lateral (select c1.fecha_calibracion_calbas, c1.fecha_vencimiento_calbas, c1.numero_certificado_calbas, c1.proveedor_laboratorio_calbas
                         from public.calibraciones_equipo_calbas c1
                        where c1.equipo_id_calbas = e.id_calbas and c1.resultado_calbas <> 'cancelada'
                        order by c1.fecha_calibracion_calbas desc, c1.created_at_calbas desc limit 1) c on true
)
select base.*, d.nombre_calbas as departamento_calbas,
       case when base.ultima_verificacion_calbas is null then null
            else base.ultima_verificacion_calbas + base.frecuencia_verificacion_dias_calbas end as proxima_verificacion_calbas,
       case when base.ultima_verificacion_calbas is null then 'sin_registro'
            when base.ultima_verificacion_calbas + base.frecuencia_verificacion_dias_calbas < current_date then 'vencida'
            when base.ultima_verificacion_calbas + base.frecuencia_verificacion_dias_calbas <= current_date + 3 then 'por_vencer'
            else 'al_dia' end as estado_verificacion_calbas,
       case when base.vencimiento_calibracion_calbas is null then 'sin_registro'
            when base.vencimiento_calibracion_calbas < current_date then 'vencida'
            when base.vencimiento_calibracion_calbas <= current_date + 30 then 'por_vencer'
            else 'vigente' end as estado_calibracion_calbas,
       base.vencimiento_calibracion_calbas - current_date as dias_calibracion_calbas
  from base
  left join public.departamentos_calbas d on d.id_calbas = base.departamento_id_calbas;

-- Historial unificado de verificaciones
create view public.vw_verificaciones_todas_calbas with (security_invoker = true) as
select v.id_calbas, 'bascula'::text as origen_calbas, 'BASCULA'::text as tipo_clave_calbas, 'Báscula'::text as tipo_nombre_calbas,
       v.fecha_calbas, v.bascula_id_calbas as equipo_id_calbas, b.codigo_calbas as equipo_codigo_calbas, b.ubicacion_calbas,
       v.departamento_id_calbas, d.nombre_calbas as departamento_calbas,
       pp.codigo_calbas as patron_codigo_calbas, v.pesa_patron_valor_calbas as valor_referencia_calbas, pp.unidad_calbas as unidad_referencia_calbas,
       v.lectura_1_calbas, v.lectura_2_calbas, v.lectura_3_calbas, v.promedio_lecturas_calbas, v.unidad_calbas,
       v.error_indicacion_calbas as error_calbas, v.emt_permitido_calbas as tolerancia_calbas, v.unidad_calculo_calbas,
       null::numeric as cv_pct_calbas, v.dictamen_calbas,
       v.clase_exactitud_aplicada_calbas, v.criterio_evaluacion_aplicado_calbas,
       v.observaciones_calbas, v.estado_calbas, v.motivo_anulacion_calbas,
       v.supervisor_id_calbas, p.nombre_completo_calbas as supervisor_calbas, v.created_at_calbas
  from public.verificaciones_calbas v
  left join public.basculas_calbas b on b.id_calbas = v.bascula_id_calbas
  left join public.departamentos_calbas d on d.id_calbas = v.departamento_id_calbas
  left join public.pesas_patron_calbas pp on pp.id_calbas = v.pesa_patron_id_calbas
  left join public.perfiles_calbas p on p.id_calbas = v.supervisor_id_calbas
union all
select v.id_calbas, 'equipo', t.clave_calbas, t.nombre_calbas,
       v.fecha_calbas, v.equipo_id_calbas, e.codigo_calbas, e.ubicacion_calbas,
       v.departamento_id_calbas, d.nombre_calbas,
       pt.codigo_calbas, v.valor_referencia_calbas, v.unidad_calbas,
       v.lectura_1_calbas, v.lectura_2_calbas, v.lectura_3_calbas, v.promedio_lecturas_calbas, v.unidad_calbas,
       v.error_calbas, v.tolerancia_aplicada_calbas, v.unidad_calbas,
       v.cv_pct_calbas, v.dictamen_calbas,
       null, null,
       v.observaciones_calbas, v.estado_calbas, v.motivo_anulacion_calbas,
       v.supervisor_id_calbas, p.nombre_completo_calbas, v.created_at_calbas
  from public.verificaciones_equipo_calbas v
  join public.equipos_calbas e on e.id_calbas = v.equipo_id_calbas
  join public.tipos_equipo_calbas t on t.id_calbas = e.tipo_id_calbas
  left join public.departamentos_calbas d on d.id_calbas = v.departamento_id_calbas
  left join public.patrones_calbas pt on pt.id_calbas = v.patron_id_calbas
  left join public.perfiles_calbas p on p.id_calbas = v.supervisor_id_calbas;

-- Historial unificado de calibraciones
create view public.vw_calibraciones_todas_calbas with (security_invoker = true) as
select c.id_calbas, 'bascula'::text as origen_calbas, 'BASCULA'::text as tipo_clave_calbas, 'Báscula'::text as tipo_nombre_calbas,
       c.bascula_id_calbas as equipo_id_calbas, b.codigo_calbas as equipo_codigo_calbas, b.departamento_id_calbas, d.nombre_calbas as departamento_calbas,
       c.fecha_calibracion_calbas, c.fecha_vencimiento_calbas, c.numero_certificado_calbas, c.proveedor_laboratorio_calbas,
       c.resultado_calbas, c.observaciones_calbas, c.archivo_url_calbas, c.created_at_calbas
  from public.calibraciones_calbas c
  join public.basculas_calbas b on b.id_calbas = c.bascula_id_calbas
  left join public.departamentos_calbas d on d.id_calbas = b.departamento_id_calbas
union all
select c.id_calbas, 'equipo', t.clave_calbas, t.nombre_calbas,
       c.equipo_id_calbas, e.codigo_calbas, e.departamento_id_calbas, d.nombre_calbas,
       c.fecha_calibracion_calbas, c.fecha_vencimiento_calbas, c.numero_certificado_calbas, c.proveedor_laboratorio_calbas,
       c.resultado_calbas, c.observaciones_calbas, c.archivo_url_calbas, c.created_at_calbas
  from public.calibraciones_equipo_calbas c
  join public.equipos_calbas e on e.id_calbas = c.equipo_id_calbas
  join public.tipos_equipo_calbas t on t.id_calbas = e.tipo_id_calbas
  left join public.departamentos_calbas d on d.id_calbas = e.departamento_id_calbas;

revoke all on public.vw_equipos_calbas, public.vw_verificaciones_todas_calbas, public.vw_calibraciones_todas_calbas from anon;
grant select on public.vw_equipos_calbas, public.vw_verificaciones_todas_calbas, public.vw_calibraciones_todas_calbas to authenticated;

-- ---------------------------------------------------------------------
-- 9. Certificados de calibración (PDF/imagen) en bucket privado
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('certificados_calbas', 'certificados_calbas', false, 10485760,
        array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy certificados_calbas_select on storage.objects for select to authenticated
  using (bucket_id = 'certificados_calbas' and (select calbas_private.activo_calbas()));
create policy certificados_calbas_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'certificados_calbas' and (select calbas_private.es_admin_calbas()));
create policy certificados_calbas_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'certificados_calbas' and (select calbas_private.es_admin_calbas()));
create policy certificados_calbas_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'certificados_calbas' and (select calbas_private.es_admin_calbas()));
