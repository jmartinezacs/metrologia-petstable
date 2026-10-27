-- =====================================================================
-- Metrología v7.4 — Código automático de equipos genéricos:
-- <prefijo del tipo>-<consecutivo de 2 dígitos>, p. ej. TER-01, POT-01, MIC-01.
-- El consecutivo es el mayor número existente con ese prefijo + 1.
-- Reversión: rollback/20261027000500_rollback.sql (restaura la versión de v7.0)
-- =====================================================================
create or replace function calbas_private.validar_unidad_tipo_calbas()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
declare t public.tipos_equipo_calbas%rowtype; v_sig int;
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
    if coalesce(trim(new.codigo_calbas), '') in ('', t.prefijo_codigo_calbas || '-') then
      -- Se bloquea por prefijo para que dos altas simultáneas no tomen el mismo número
      perform pg_advisory_xact_lock(hashtext('equipos_calbas:' || t.prefijo_codigo_calbas));
      select coalesce(max(substring(codigo_calbas from '^' || t.prefijo_codigo_calbas || '-(\d+)$')::int), 0) + 1 into v_sig
        from public.equipos_calbas where codigo_calbas ~ ('^' || t.prefijo_codigo_calbas || '-\d+$');
      new.codigo_calbas := t.prefijo_codigo_calbas || '-' || lpad(v_sig::text, 2, '0');
    else
      new.codigo_calbas := upper(trim(new.codigo_calbas));
    end if;
  end if;
  return new;
end $$;
