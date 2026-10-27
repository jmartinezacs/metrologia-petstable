-- Pruebas de reglas de negocio v7 (equipos genéricos).
-- Simula la sesión de un administrador; al final lanza RAISE EXCEPTION con el
-- reporte, lo que revierte TODO (no deja datos). Ejecutar con execute_sql.
do $$
declare
  admin uuid := (select id_calbas from public.perfiles_calbas where rol_calbas = 'admin' and activo_calbas limit 1);
  depto uuid := (select id_calbas from public.departamentos_calbas order by nombre_calbas limit 1);
  t_ter uuid := (select id_calbas from public.tipos_equipo_calbas where clave_calbas = 'TERMOMETRO');
  t_mic uuid := (select id_calbas from public.tipos_equipo_calbas where clave_calbas = 'MICROPIPETA');
  eq uuid; eq2 uuid; pat uuid; pat2 uuid; v uuid; r record; out text := '';
begin
  perform set_config('request.jwt.claims', json_build_object('sub', admin, 'role', 'authenticated')::text, true);
  set local role authenticated;

  insert into public.equipos_calbas (tipo_id_calbas, codigo_calbas, departamento_id_calbas, unidad_calbas, tolerancia_calbas)
  values (t_ter, 'ter-prueba-01', depto, '°C', 0.5) returning id_calbas into eq;
  insert into public.patrones_calbas (codigo_calbas, tipo_id_calbas, descripcion_calbas, unidad_calbas, fecha_vencimiento_calbas)
  values ('', t_ter, 'Termómetro patrón prueba', '°C', current_date + 100) returning id_calbas into pat;
  out := out || format('[1] código patrón auto=%s; código equipo=%s', (select codigo_calbas from public.patrones_calbas where id_calbas = pat),
                       (select codigo_calbas from public.equipos_calbas where id_calbas = eq)) || E'\n';

  -- Cumple: promedio 25.2 vs 25.0 (tol 0.5)
  insert into public.verificaciones_equipo_calbas (equipo_id_calbas, departamento_id_calbas, patron_id_calbas, valor_referencia_calbas, lectura_1_calbas, lectura_2_calbas, lectura_3_calbas)
  values (eq, depto, pat, 25.0, 25.1, 25.2, 25.3) returning id_calbas into v;
  select * into r from public.verificaciones_equipo_calbas where id_calbas = v;
  out := out || format('[2] prom=%s err=%s tol=%s dictamen=%s (esperado CUMPLE)', r.promedio_lecturas_calbas, r.error_calbas, r.tolerancia_aplicada_calbas, r.dictamen_calbas) || E'\n';

  -- No cumple con negativos (termómetro admite negativos): -18.0 vs -18.8
  insert into public.verificaciones_equipo_calbas (equipo_id_calbas, departamento_id_calbas, patron_id_calbas, valor_referencia_calbas, lectura_1_calbas, lectura_2_calbas, lectura_3_calbas)
  values (eq, depto, pat, -18.0, -18.8, -18.8, -18.8) returning id_calbas into v;
  select * into r from public.verificaciones_equipo_calbas where id_calbas = v;
  out := out || format('[3] err=%s dictamen=%s (esperado NO_CUMPLE)', r.error_calbas, r.dictamen_calbas) || E'\n';

  -- Unidad inválida
  begin
    insert into public.equipos_calbas (tipo_id_calbas, codigo_calbas, departamento_id_calbas, unidad_calbas, tolerancia_calbas)
    values (t_ter, 'TER-MAL', depto, 'kg', 1);
    out := out || '[4] FALLA: aceptó unidad kg' || E'\n';
  exception when others then out := out || '[4] OK unidad rechazada: ' || sqlerrm || E'\n'; end;

  -- Micropipeta % + CV
  insert into public.equipos_calbas (tipo_id_calbas, codigo_calbas, departamento_id_calbas, unidad_calbas, tolerancia_calbas, tolerancia_tipo_calbas, cv_max_pct_calbas)
  values (t_mic, 'MIC-PRUEBA', depto, 'µL', 1.0, 'PORCENTAJE', 0.5) returning id_calbas into eq2;
  insert into public.patrones_calbas (codigo_calbas, tipo_id_calbas, descripcion_calbas, unidad_calbas, valor_nominal_calbas)
  values ('', t_mic, 'Balanza + agua', 'µL', 100) returning id_calbas into pat2;
  insert into public.verificaciones_equipo_calbas (equipo_id_calbas, departamento_id_calbas, patron_id_calbas, valor_referencia_calbas, lectura_1_calbas, lectura_2_calbas, lectura_3_calbas)
  values (eq2, depto, pat2, 100, 99.0, 101.0, 100.0) returning id_calbas into v;
  select * into r from public.verificaciones_equipo_calbas where id_calbas = v;
  out := out || format('[5] err=%s tol=%s cv=%s dictamen=%s (esperado NO_CUMPLE por CV 1%%)', r.error_calbas, r.tolerancia_aplicada_calbas, r.cv_pct_calbas, r.dictamen_calbas) || E'\n';

  -- Patrón de otro tipo
  begin
    insert into public.verificaciones_equipo_calbas (equipo_id_calbas, departamento_id_calbas, patron_id_calbas, valor_referencia_calbas, lectura_1_calbas, lectura_2_calbas, lectura_3_calbas)
    values (eq, depto, pat2, 25, 25, 25, 25);
    out := out || '[6] FALLA: aceptó patrón de otro tipo' || E'\n';
  exception when others then out := out || '[6] OK: ' || sqlerrm || E'\n'; end;

  -- Edición de datos medidos prohibida; anulación con motivo
  begin
    update public.verificaciones_equipo_calbas set lectura_1_calbas = 1, motivo_cambio_calbas = 'x' where id_calbas = v;
    out := out || '[7] FALLA: permitió editar lecturas' || E'\n';
  exception when others then out := out || '[7] OK: ' || sqlerrm || E'\n'; end;
  update public.verificaciones_equipo_calbas set estado_calbas = 'anulada', motivo_anulacion_calbas = 'Prueba', motivo_cambio_calbas = 'Prueba' where id_calbas = v;
  out := out || format('[8] anulada=%s; bitácora=%s', (select estado_calbas from public.verificaciones_equipo_calbas where id_calbas = v),
    (select count(*) from public.bitacora_calbas where registro_id_calbas = v)) || E'\n';

  -- Vistas
  out := out || format('[9] vw_equipos: %s filas (%s genéricas); estado TER=%s', (select count(*) from public.vw_equipos_calbas),
    (select count(*) from public.vw_equipos_calbas where origen_calbas = 'equipo'),
    (select ultimo_dictamen_calbas || '/' || estado_verificacion_calbas from public.vw_equipos_calbas where id_calbas = eq)) || E'\n';
  out := out || format('[10] vw_verificaciones_todas: %s; vw_calibraciones_todas: %s', (select count(*) from public.vw_verificaciones_todas_calbas),
    (select count(*) from public.vw_calibraciones_todas_calbas)) || E'\n';

  -- Usuario anónimo no ve nada
  reset role;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  begin
    perform count(*) from public.equipos_calbas;
    out := out || '[11] FALLA: anon puede leer' || E'\n';
  exception when others then out := out || '[11] OK anon bloqueado: ' || sqlerrm || E'\n'; end;

  raise exception E'REPORTE (revertido)\n%', out;
end $$;

-- v7.1 · Seguimiento de «no cumple» (requiere al menos una verificación NO_CUMPLE vigente)
do $$
declare admin uuid := (select id_calbas from perfiles_calbas where rol_calbas='admin' and activo_calbas limit 1);
 v uuid := (select id_calbas from verificaciones_calbas where dictamen_calbas='NO_CUMPLE' and estado_calbas='vigente' limit 1);
 s uuid; o text := '';
begin
  perform set_config('request.jwt.claims', json_build_object('sub', admin, 'role','authenticated')::text, true);
  set local role authenticated;
  o := o || format('[1] no cumple pendientes: %s', (select count(*) from vw_no_cumple_calbas where estado_seguimiento_calbas <> 'cerrado')) || E'\n';
  insert into seguimientos_calbas(origen_calbas, verificacion_id_calbas, accion_calbas, descripcion_calbas) values ('bascula', v, 'AJUSTE', 'Ajuste de cero') returning id_calbas into s;
  begin update seguimientos_calbas set estado_calbas='cerrado' where id_calbas=s; o := o || '[2] FALLA cerró sin evidencia'||E'\n';
  exception when others then o := o || '[2] OK sin evidencia rechazado'||E'\n'; end;
  update seguimientos_calbas set estado_calbas='cerrado', cierre_calbas='Re-verificada, cumple' where id_calbas=s;
  o := o || format('[3] pendientes tras cierre: %s', (select count(*) from vw_no_cumple_calbas where estado_seguimiento_calbas <> 'cerrado')) || E'\n';
  begin update seguimientos_calbas set descripcion_calbas='x2' where id_calbas=s; o := o || '[4] FALLA editó cerrado'||E'\n';
  exception when others then o := o || '[4] OK cerrado inmutable'||E'\n'; end;
  raise exception E'REPORTE (revertido)\n%', o;
end $$;

-- v7.3 · Métodos por tipo (MULTIPUNTO / PUNTO_UNICO / SOLO_CALIBRACION) y ajuste.
-- Después de ejecutarlo: select setval('calbas_private.seq_patrones_calbas', 1, false) si patrones_calbas está vacía.
do $$
declare
  admin uuid := (select id_calbas from perfiles_calbas where rol_calbas='admin' and activo_calbas limit 1);
  dep uuid := (select id_calbas from departamentos_calbas order by nombre_calbas limit 1);
  tp uuid := (select id_calbas from tipos_equipo_calbas where clave_calbas='POTENCIOMETRO');
  tt uuid := (select id_calbas from tipos_equipo_calbas where clave_calbas='TERMOMETRO');
  tm uuid := (select id_calbas from tipos_equipo_calbas where clave_calbas='MICROPIPETA');
  pot uuid; ter uuid; mic uuid; pb uuid; pt uuid; pm uuid; v uuid; r record; o text := '';
begin
  perform set_config('request.jwt.claims', json_build_object('sub', admin, 'role','authenticated')::text, true);
  set local role authenticated;
  insert into equipos_calbas(tipo_id_calbas, codigo_calbas, departamento_id_calbas, unidad_calbas, tolerancia_calbas) values (tp,'POT-T',dep,'pH',0.05) returning id_calbas into pot;
  insert into equipos_calbas(tipo_id_calbas, codigo_calbas, departamento_id_calbas, unidad_calbas, tolerancia_calbas) values (tt,'TER-T',dep,'°C',0.5) returning id_calbas into ter;
  insert into equipos_calbas(tipo_id_calbas, codigo_calbas, departamento_id_calbas, unidad_calbas, tolerancia_calbas, tolerancia_tipo_calbas) values (tm,'MIC-T',dep,'µL',1,'PORCENTAJE') returning id_calbas into mic;
  insert into patrones_calbas(codigo_calbas,tipo_id_calbas,descripcion_calbas,unidad_calbas) values ('',tp,'Buffers','pH') returning id_calbas into pb;
  insert into patrones_calbas(codigo_calbas,tipo_id_calbas,descripcion_calbas,unidad_calbas) values ('',tt,'Punto de hielo','°C') returning id_calbas into pt;
  insert into patrones_calbas(codigo_calbas,tipo_id_calbas,descripcion_calbas,unidad_calbas) values ('',tm,'Balanza','µL') returning id_calbas into pm;
  insert into verificaciones_equipo_calbas(equipo_id_calbas,departamento_id_calbas,patron_id_calbas,valor_referencia_calbas,lectura_1_calbas,lectura_2_calbas,lectura_3_calbas,ajuste_realizado_calbas,lecturas_post_calbas)
  values (pot,dep,pb,4.01,4.01,4.01,10.01,true,array[4.01,7.01,10.01]) returning id_calbas into v;
  select * into r from verificaciones_equipo_calbas where id_calbas=v;
  o := o || format('[1] dict=%s final=%s (esperado NO_CUMPLE / CUMPLE)', r.dictamen_calbas, r.dictamen_final_calbas) || E'\n';
  insert into verificaciones_equipo_calbas(equipo_id_calbas,departamento_id_calbas,patron_id_calbas,valor_referencia_calbas,lectura_1_calbas,ajuste_realizado_calbas,correccion_calbas,lecturas_post_calbas)
  values (ter,dep,pt,0,0.8,true,-0.8,array[0]) returning id_calbas into v;
  select * into r from verificaciones_equipo_calbas where id_calbas=v;
  o := o || format('[2] termómetro err=%s final=%s desv_final=%s', r.error_calbas, r.dictamen_final_calbas, r.desviacion_final_calbas) || E'\n';
  begin insert into verificaciones_equipo_calbas(equipo_id_calbas,departamento_id_calbas,patron_id_calbas,valor_referencia_calbas,lectura_1_calbas) values (mic,dep,pm,100,100);
    o := o || '[3] FALLA aceptó micropipeta'||E'\n';
  exception when others then o := o || '[3] OK micropipeta rechazada'||E'\n'; end;
  raise exception E'REPORTE (revertido)\n%', o;
end $$;
