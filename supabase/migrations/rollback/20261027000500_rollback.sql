-- Reversión de 20261027000500_calbas_v74_codigo_automatico.sql:
-- vuelve a la función de 20261022000100 (sección 6), que exige capturar el código.
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
