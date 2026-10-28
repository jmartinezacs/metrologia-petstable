-- =====================================================================
-- Metrología v7.7.1 — Las básculas en gramos se llaman «Báscula analítica»
-- (antes LABORATORIO / «Báscula de laboratorio»).
-- Reversión: rollback/20261028000900_rollback.sql
-- =====================================================================
alter table public.basculas_calbas drop constraint if exists basculas_calbas_tipo_bascula_calbas_check;
update public.basculas_calbas set tipo_bascula_calbas = 'ANALITICA' where tipo_bascula_calbas = 'LABORATORIO';
alter table public.basculas_calbas add constraint basculas_calbas_tipo_bascula_calbas_check
  check (tipo_bascula_calbas in ('PLATAFORMA', 'MESA', 'ANALITICA'));
comment on column public.basculas_calbas.tipo_bascula_calbas is 'PLATAFORMA (0.4–200 kg), MESA (0.1–15 kg) o ANALITICA (en gramos).';

create or replace function calbas_private.preparar_bascula_calbas()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  if new.tipo_bascula_calbas is null then
    new.tipo_bascula_calbas := case
      when new.unidad_calbas = 'g' then 'ANALITICA'
      when new.capacidad_maxima_calbas > 30 then 'PLATAFORMA'
      else 'MESA' end;
  end if;
  if tg_op = 'INSERT' and coalesce(btrim(new.codigo_calbas), '') = '' then
    new.codigo_calbas := 'BAS-' || lpad(nextval('calbas_private.seq_basculas_calbas')::text, 3, '0');
  end if;
  return new;
end $$;

-- Solo cambia el nombre mostrado en vw_equipos_calbas
do $$
declare def text := pg_get_viewdef('public.vw_equipos_calbas'::regclass, true);
begin
  def := replace(def, $q$WHEN 'LABORATORIO'::text THEN 'Báscula de laboratorio'::text$q$, $q$WHEN 'ANALITICA'::text THEN 'Báscula analítica'::text$q$);
  if position('Báscula analítica' in def) = 0 then raise exception 'No se encontró el nombre anterior en vw_equipos_calbas.'; end if;
  execute 'create or replace view public.vw_equipos_calbas with (security_invoker = true) as ' || def;
end $$;
