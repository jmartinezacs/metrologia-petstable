-- =====================================================================
-- Metrología v7.3 — Método de verificación por tipo de equipo y registro
-- de ajuste / corrección («como se encontró» y «como se dejó»).
--   · PUNTO_UNICO      termómetros, termohigrómetros: patrón vs lectura,
--                      corrección aplicada y lectura después de corregir.
--   · MULTIPUNTO       potenciómetros: una lectura por buffer (4.01/7.01/10.01)
--                      y, si hubo ajuste, lecturas después del ajuste.
--   · SOLO_CALIBRACION micropipetas: sin verificación interna.
-- Aditiva sobre tablas sin datos (0 verificaciones de equipos al aplicarla).
-- Reversión: rollback/20261027000400_rollback.sql
-- =====================================================================

-- 1. Tipos de equipo: método y puntos de referencia
alter table public.tipos_equipo_calbas
  add column metodo_calbas text not null default 'PUNTO_UNICO'
    check (metodo_calbas in ('PUNTO_UNICO', 'MULTIPUNTO', 'SOLO_CALIBRACION')),
  add column puntos_referencia_calbas numeric[];

update public.tipos_equipo_calbas set metodo_calbas = 'MULTIPUNTO', puntos_referencia_calbas = array[4.01, 7.01, 10.01],
  guia_calbas = 'Introduce el electrodo en cada buffer certificado (pH 4.01, 7.01 y 10.01) y registra la lectura. Si alguna se desvía, ajusta el potenciómetro y registra las lecturas después del ajuste.'
 where clave_calbas = 'POTENCIOMETRO';
update public.tipos_equipo_calbas set metodo_calbas = 'SOLO_CALIBRACION',
  guia_calbas = 'Las micropipetas no llevan verificación interna: solo se registran sus calibraciones externas.'
 where clave_calbas = 'MICROPIPETA';
update public.tipos_equipo_calbas set metodo_calbas = 'PUNTO_UNICO',
  guia_calbas = 'Compara la lectura del termómetro contra el patrón (termómetro patrón o punto de hielo a 0 °C). Si hay desviación, corrige el termómetro y registra la corrección aplicada y la lectura final.'
 where clave_calbas = 'TERMOMETRO';

-- 2. Verificaciones: puntos, ajuste y corrección
alter table public.verificaciones_equipo_calbas
  alter column lectura_2_calbas drop not null,
  alter column lectura_3_calbas drop not null,
  add column metodo_aplicado_calbas text,
  add column referencias_calbas numeric[],
  add column ajuste_realizado_calbas boolean not null default false,
  add column correccion_calbas numeric,
  add column lecturas_post_calbas numeric[],
  add column desviacion_final_calbas numeric,
  add column dictamen_final_calbas text check (dictamen_final_calbas in ('CUMPLE', 'NO_CUMPLE')),
  add column temperatura_calbas numeric;

-- 3. Cálculo autoritativo según el método del tipo de equipo
create or replace function public.validar_verificacion_equipo_calbas()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  uid uuid := auth.uid();
  e public.equipos_calbas%rowtype;
  t public.tipos_equipo_calbas%rowtype;
  p public.patrones_calbas%rowtype;
  lect numeric[]; refs numeric[]; post numeric[];
  n int; i int; imax int := 1; dmax numeric := -1; d numeric;
  prom numeric; err numeric; tol numeric; tol_i numeric; sd numeric; cv numeric; ok boolean := true;
  fin numeric; fin_ok boolean := true; fmax numeric := -1;
  pct boolean;
begin
  if uid is null then raise exception 'Sesión no válida.'; end if;
  select * into e from public.equipos_calbas where id_calbas = new.equipo_id_calbas;
  if not found or not e.activo_calbas then raise exception 'El equipo no existe o está inactivo.'; end if;
  select * into t from public.tipos_equipo_calbas where id_calbas = e.tipo_id_calbas;
  if t.metodo_calbas = 'SOLO_CALIBRACION' then
    raise exception 'Los equipos de tipo % no llevan verificación interna; registra solo sus calibraciones.', t.nombre_calbas;
  end if;
  if new.fecha_calbas > current_date then raise exception 'La fecha no puede ser futura.'; end if;
  select * into p from public.patrones_calbas where id_calbas = new.patron_id_calbas;
  if not found or not p.activo_calbas then raise exception 'El patrón de referencia no existe o está inactivo.'; end if;
  if p.tipo_id_calbas <> e.tipo_id_calbas then raise exception 'El patrón seleccionado no corresponde al tipo de equipo.'; end if;
  if p.fecha_vencimiento_calbas is not null and p.fecha_vencimiento_calbas < new.fecha_calbas then raise exception 'El patrón de referencia está vencido.'; end if;

  lect := array_remove(array[new.lectura_1_calbas, new.lectura_2_calbas, new.lectura_3_calbas], null);
  n := coalesce(array_length(lect, 1), 0);
  if n = 0 then raise exception 'Captura al menos una lectura.'; end if;
  if not t.permite_negativos_calbas and (exists (select 1 from unnest(lect) x where x < 0) or new.valor_referencia_calbas < 0) then
    raise exception 'Las lecturas y el valor de referencia no pueden ser negativos para este tipo de equipo.';
  end if;
  pct := e.tolerancia_tipo_calbas = 'PORCENTAJE';

  if t.metodo_calbas = 'MULTIPUNTO' then
    refs := coalesce(new.referencias_calbas, t.puntos_referencia_calbas);
    if refs is null or coalesce(array_length(refs, 1), 0) < 2 then raise exception 'Se requieren al menos dos puntos de referencia (buffers).'; end if;
    if array_length(refs, 1) <> n then
      raise exception 'Captura una lectura por cada punto de referencia (%).', array_to_string(refs, ' / ');
    end if;
    for i in 1..n loop
      d := lect[i] - refs[i];
      tol_i := case when pct then abs(refs[i]) * e.tolerancia_calbas / 100.0 else e.tolerancia_calbas end;
      if abs(d) > tol_i then ok := false; end if;
      if abs(d) > dmax then dmax := abs(d); imax := i; end if;
    end loop;
    new.referencias_calbas := refs;
    new.valor_referencia_calbas := refs[imax];
    prom := lect[imax];
    err := round(lect[imax] - refs[imax], 6);
    tol := case when pct then round(abs(refs[imax]) * e.tolerancia_calbas / 100.0, 6) else e.tolerancia_calbas end;
    cv := null;
  else
    new.referencias_calbas := null;
    prom := round((select avg(x) from unnest(lect) x), 6);
    err := round(prom - new.valor_referencia_calbas, 6);
    tol := case when pct then round(abs(new.valor_referencia_calbas) * e.tolerancia_calbas / 100.0, 6) else e.tolerancia_calbas end;
    if n >= 2 then
      sd := sqrt((select sum((x - prom) ^ 2) from unnest(lect) x) / (n - 1));
      cv := case when prom <> 0 then round(abs(sd / prom) * 100.0, 4) else null end;
    end if;
    ok := abs(err) <= tol and not (e.cv_max_pct_calbas is not null and coalesce(cv, 0) > e.cv_max_pct_calbas);
  end if;

  -- Ajuste / corrección: lecturas «como se dejó» el equipo
  if coalesce(new.ajuste_realizado_calbas, false) then
    post := array_remove(new.lecturas_post_calbas, null);
    if coalesce(array_length(post, 1), 0) = 0 then raise exception 'Captura las lecturas después del ajuste o corrección.'; end if;
    if t.metodo_calbas = 'MULTIPUNTO' then
      if array_length(post, 1) <> n then raise exception 'Captura una lectura después del ajuste por cada buffer.'; end if;
      for i in 1..n loop
        d := post[i] - refs[i];
        tol_i := case when pct then abs(refs[i]) * e.tolerancia_calbas / 100.0 else e.tolerancia_calbas end;
        if abs(d) > tol_i then fin_ok := false; end if;
        if abs(d) > fmax then fmax := abs(d); fin := d; end if;
      end loop;
    else
      fin := (select avg(x) from unnest(post) x) - new.valor_referencia_calbas;
      fin_ok := abs(fin) <= tol;
    end if;
    new.lecturas_post_calbas := post;
    new.desviacion_final_calbas := round(fin, 6);
    new.dictamen_final_calbas := case when fin_ok then 'CUMPLE' else 'NO_CUMPLE' end;
    if t.metodo_calbas = 'MULTIPUNTO' then new.correccion_calbas := null; end if;
  else
    new.lecturas_post_calbas := null; new.correccion_calbas := null;
    new.desviacion_final_calbas := null; new.dictamen_final_calbas := null;
  end if;

  new.metodo_aplicado_calbas := t.metodo_calbas;
  new.departamento_id_calbas := e.departamento_id_calbas;
  new.unidad_calbas := e.unidad_calbas;
  new.promedio_lecturas_calbas := prom;
  new.error_calbas := err;
  new.tolerancia_aplicada_calbas := tol;
  new.tolerancia_tipo_aplicada_calbas := e.tolerancia_tipo_calbas;
  new.cv_pct_calbas := cv;
  new.cv_max_aplicado_calbas := e.cv_max_pct_calbas;
  new.dictamen_calbas := case when ok then 'CUMPLE' else 'NO_CUMPLE' end;
  new.supervisor_id_calbas := uid;
  new.estado_calbas := 'vigente';
  new.motivo_anulacion_calbas := null;
  new.motivo_cambio_calbas := null;
  new.created_at_calbas := now();
  return new;
end $$;
revoke all on function public.validar_verificacion_equipo_calbas() from public, anon, authenticated;

-- Los datos medidos (incluido el ajuste) no se editan; solo se anulan
create or replace function public.validar_cambio_verificacion_equipo_calbas()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  if old.estado_calbas = 'anulada' then raise exception 'Una verificación anulada no puede modificarse.'; end if;
  if (new.fecha_calbas, new.equipo_id_calbas, new.departamento_id_calbas, new.patron_id_calbas, new.valor_referencia_calbas,
      new.lectura_1_calbas, new.lectura_2_calbas, new.lectura_3_calbas, new.promedio_lecturas_calbas, new.error_calbas,
      new.tolerancia_aplicada_calbas, new.dictamen_calbas, new.supervisor_id_calbas, new.created_at_calbas,
      new.referencias_calbas, new.ajuste_realizado_calbas, new.correccion_calbas, new.lecturas_post_calbas,
      new.desviacion_final_calbas, new.dictamen_final_calbas, new.temperatura_calbas)
     is distinct from
     (old.fecha_calbas, old.equipo_id_calbas, old.departamento_id_calbas, old.patron_id_calbas, old.valor_referencia_calbas,
      old.lectura_1_calbas, old.lectura_2_calbas, old.lectura_3_calbas, old.promedio_lecturas_calbas, old.error_calbas,
      old.tolerancia_aplicada_calbas, old.dictamen_calbas, old.supervisor_id_calbas, old.created_at_calbas,
      old.referencias_calbas, old.ajuste_realizado_calbas, old.correccion_calbas, old.lecturas_post_calbas,
      old.desviacion_final_calbas, old.dictamen_final_calbas, old.temperatura_calbas) then
    raise exception 'Los datos medidos no pueden editarse. Anula la verificación y registra una nueva.';
  end if;
  if nullif(trim(new.motivo_cambio_calbas), '') is null then raise exception 'Toda corrección o anulación requiere un motivo.'; end if;
  if new.estado_calbas = 'anulada' and nullif(trim(new.motivo_anulacion_calbas), '') is null then
    raise exception 'El motivo de anulación es obligatorio.';
  end if;
  return new;
end $$;
revoke all on function public.validar_cambio_verificacion_equipo_calbas() from public, anon, authenticated;

-- 4. Inventario: los equipos de solo calibración no tienen verificación pendiente
create or replace view public.vw_equipos_calbas with (security_invoker = true) as
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
         v.fecha_calbas, coalesce(v.dictamen_final_calbas, v.dictamen_calbas),
         c.fecha_calibracion_calbas, c.fecha_vencimiento_calbas, c.numero_certificado_calbas, c.proveedor_laboratorio_calbas
    from public.equipos_calbas e
    join public.tipos_equipo_calbas t on t.id_calbas = e.tipo_id_calbas
    left join lateral (select v1.fecha_calbas, v1.dictamen_calbas, v1.dictamen_final_calbas from public.verificaciones_equipo_calbas v1
                        where v1.equipo_id_calbas = e.id_calbas and v1.estado_calbas = 'vigente'
                        order by v1.fecha_calbas desc, v1.created_at_calbas desc limit 1) v on true
    left join lateral (select c1.fecha_calibracion_calbas, c1.fecha_vencimiento_calbas, c1.numero_certificado_calbas, c1.proveedor_laboratorio_calbas
                         from public.calibraciones_equipo_calbas c1
                        where c1.equipo_id_calbas = e.id_calbas and c1.resultado_calbas <> 'cancelada'
                        order by c1.fecha_calibracion_calbas desc, c1.created_at_calbas desc limit 1) c on true
), req as (
  select base.*, coalesce((select tt.metodo_calbas <> 'SOLO_CALIBRACION' from public.tipos_equipo_calbas tt where tt.clave_calbas = base.tipo_clave_calbas), true) as requiere
    from base
)
select req.id_calbas, req.origen_calbas, req.tipo_clave_calbas, req.tipo_nombre_calbas, req.icono_calbas, req.magnitud_calbas,
       req.codigo_calbas, req.descripcion_calbas, req.departamento_id_calbas, req.ubicacion_calbas, req.marca_calbas, req.modelo_calbas,
       req.numero_serie_calbas, req.unidad_calbas, req.rango_min_calbas, req.rango_max_calbas, req.resolucion_calbas,
       req.frecuencia_verificacion_dias_calbas, req.activo_calbas, req.created_at_calbas, req.ultima_verificacion_calbas,
       req.ultimo_dictamen_calbas, req.fecha_calibracion_calbas, req.vencimiento_calibracion_calbas, req.numero_certificado_calbas,
       req.proveedor_laboratorio_calbas,
       d.nombre_calbas as departamento_calbas,
       case when not req.requiere or req.ultima_verificacion_calbas is null then null
            else req.ultima_verificacion_calbas + req.frecuencia_verificacion_dias_calbas end as proxima_verificacion_calbas,
       case when not req.requiere then 'no_aplica'
            when req.ultima_verificacion_calbas is null then 'sin_registro'
            when req.ultima_verificacion_calbas + req.frecuencia_verificacion_dias_calbas < current_date then 'vencida'
            when req.ultima_verificacion_calbas + req.frecuencia_verificacion_dias_calbas <= current_date + 3 then 'por_vencer'
            else 'al_dia' end as estado_verificacion_calbas,
       case when req.vencimiento_calibracion_calbas is null then 'sin_registro'
            when req.vencimiento_calibracion_calbas < current_date then 'vencida'
            when req.vencimiento_calibracion_calbas <= current_date + 30 then 'por_vencer'
            else 'vigente' end as estado_calibracion_calbas,
       req.vencimiento_calibracion_calbas - current_date as dias_calibracion_calbas,
       req.requiere as requiere_verificacion_calbas
  from req
  left join public.departamentos_calbas d on d.id_calbas = req.departamento_id_calbas;

-- 5. Historial unificado: puntos, ajuste y corrección (columnas al final)
create or replace view public.vw_verificaciones_todas_calbas with (security_invoker = true) as
select v.id_calbas, 'bascula'::text as origen_calbas, 'BASCULA'::text as tipo_clave_calbas, 'Báscula'::text as tipo_nombre_calbas,
       v.fecha_calbas, v.bascula_id_calbas as equipo_id_calbas, b.codigo_calbas as equipo_codigo_calbas, b.ubicacion_calbas,
       v.departamento_id_calbas, d.nombre_calbas as departamento_calbas,
       pp.codigo_calbas as patron_codigo_calbas, v.pesa_patron_valor_calbas as valor_referencia_calbas, pp.unidad_calbas as unidad_referencia_calbas,
       v.lectura_1_calbas, v.lectura_2_calbas, v.lectura_3_calbas, v.promedio_lecturas_calbas, v.unidad_calbas,
       v.error_indicacion_calbas as error_calbas, v.emt_permitido_calbas as tolerancia_calbas, v.unidad_calculo_calbas,
       null::numeric as cv_pct_calbas, v.dictamen_calbas,
       v.clase_exactitud_aplicada_calbas, v.criterio_evaluacion_aplicado_calbas,
       v.observaciones_calbas, v.estado_calbas, v.motivo_anulacion_calbas,
       v.supervisor_id_calbas, p.nombre_completo_calbas as supervisor_calbas, v.created_at_calbas,
       'BASCULA'::text as metodo_aplicado_calbas, null::numeric[] as referencias_calbas, false as ajuste_realizado_calbas,
       null::numeric as correccion_calbas, null::numeric[] as lecturas_post_calbas, null::numeric as desviacion_final_calbas,
       null::text as dictamen_final_calbas, null::numeric as temperatura_calbas
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
       v.supervisor_id_calbas, p.nombre_completo_calbas, v.created_at_calbas,
       v.metodo_aplicado_calbas, v.referencias_calbas, v.ajuste_realizado_calbas,
       v.correccion_calbas, v.lecturas_post_calbas, v.desviacion_final_calbas,
       v.dictamen_final_calbas, v.temperatura_calbas
  from public.verificaciones_equipo_calbas v
  join public.equipos_calbas e on e.id_calbas = v.equipo_id_calbas
  join public.tipos_equipo_calbas t on t.id_calbas = e.tipo_id_calbas
  left join public.departamentos_calbas d on d.id_calbas = v.departamento_id_calbas
  left join public.patrones_calbas pt on pt.id_calbas = v.patron_id_calbas
  left join public.perfiles_calbas p on p.id_calbas = v.supervisor_id_calbas;

-- 6. Un «no cumple» corregido en el momento (ajuste con resultado final CUMPLE) ya no queda pendiente
create or replace view public.vw_no_cumple_calbas with (security_invoker = true) as
select v.id_calbas, v.origen_calbas, v.tipo_nombre_calbas, v.fecha_calbas, v.equipo_id_calbas, v.equipo_codigo_calbas,
       v.departamento_id_calbas, v.departamento_calbas, v.error_calbas, v.tolerancia_calbas, v.unidad_calculo_calbas, v.supervisor_calbas,
       s.id_calbas as seguimiento_id_calbas, s.accion_calbas, s.descripcion_calbas as seguimiento_descripcion_calbas,
       s.fecha_compromiso_calbas, s.cierre_calbas, s.cerrado_at_calbas,
       coalesce(s.estado_calbas, 'sin_seguimiento') as estado_seguimiento_calbas
  from public.vw_verificaciones_todas_calbas v
  left join public.seguimientos_calbas s on s.origen_calbas = v.origen_calbas and s.verificacion_id_calbas = v.id_calbas
 where v.dictamen_calbas = 'NO_CUMPLE' and v.estado_calbas = 'vigente'
   and coalesce(v.dictamen_final_calbas, '') <> 'CUMPLE';
