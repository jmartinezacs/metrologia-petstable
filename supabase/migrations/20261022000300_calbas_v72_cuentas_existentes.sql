-- =====================================================================
-- Metrología v7.2 — Dar acceso a cuentas que ya existen en Supabase Auth
-- (otras apps de Pet's Table) y sugerir su foto del bucket «avatares».
-- Reversión: rollback/20261022000300_rollback.sql
-- =====================================================================

-- Busca cuentas @petstable.mx por correo o nombre (solo administradores)
create or replace function public.calbas_buscar_cuentas(p_q text)
returns table (id uuid, email text, nombre text, ultimo_acceso timestamptz, ya_registrado boolean, foto_sugerida text)
language plpgsql stable security definer set search_path = '' as $$
declare v_q text := lower(btrim(coalesce(p_q, '')));
begin
  if not calbas_private.es_admin_calbas() then
    raise exception 'Solo administradores.' using errcode = '42501';
  end if;
  if char_length(v_q) < 2 then return; end if;
  return query
  with cuentas as (
    select au.id, lower(au.email)::text as email,
           coalesce(nullif(btrim(au.raw_user_meta_data ->> 'full_name'), ''), nullif(btrim(au.raw_user_meta_data ->> 'nombre'), ''),
                    nullif(btrim(au.raw_user_meta_data ->> 'name'), ''),
                    initcap(replace(split_part(split_part(au.email, '@', 1), '.', 1), '_', ' ')) || ' ' ||
                    initcap(replace(split_part(split_part(au.email, '@', 1), '.', 2), '_', ' '))) as nombre,
           au.last_sign_in_at
      from auth.users au
     where au.email ilike '%@petstable.mx'
       and (au.email ilike '%' || v_q || '%' or coalesce(au.raw_user_meta_data ->> 'full_name', '') ilike '%' || v_q || '%')
     order by au.email
     limit 12
  )
  select c.id, c.email, btrim(c.nombre), c.last_sign_in_at,
         exists (select 1 from public.perfiles_calbas p where p.id_calbas = c.id),
         (select 'https://domumnsezocubigfqwry.supabase.co/storage/v1/object/public/avatares/' || o.name
            from storage.objects o
           where o.bucket_id = 'avatares'
             and translate(lower(split_part(split_part(o.name, '.', 1), ' ', 1)), 'áéíóúñ', 'aeioun')
                 = translate(lower(split_part(split_part(c.email, '@', 1), '.', 1)), 'áéíóúñ', 'aeioun')
           order by char_length(o.name), o.name limit 1)
    from cuentas c;
end $$;
revoke all on function public.calbas_buscar_cuentas(text) from public, anon;
grant execute on function public.calbas_buscar_cuentas(text) to authenticated;

-- Da acceso a Metrología a una cuenta existente: crea su perfil y departamento.
-- No toca la contraseña ni el estado de la cuenta en Auth (la comparten otras apps).
create or replace function public.calbas_agregar_cuenta(
  p_id uuid, p_nombre text, p_puesto text, p_rol text, p_departamento uuid, p_avatar text default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_email text;
begin
  if not calbas_private.es_admin_calbas() then
    raise exception 'Solo administradores.' using errcode = '42501';
  end if;
  select lower(email) into v_email from auth.users where id = p_id;
  if v_email is null then raise exception 'La cuenta no existe en Supabase Authentication.'; end if;
  if v_email not ilike '%@petstable.mx' then raise exception 'Solo se admiten cuentas @petstable.mx.'; end if;
  if exists (select 1 from public.perfiles_calbas where id_calbas = p_id) then
    raise exception 'Esta persona ya tiene acceso a Metrología.';
  end if;
  if coalesce(btrim(p_nombre), '') = '' then raise exception 'El nombre es obligatorio.'; end if;
  if p_rol not in ('admin', 'usuario') then raise exception 'Rol no válido.'; end if;
  if not exists (select 1 from public.departamentos_calbas where id_calbas = p_departamento and activo_calbas) then
    raise exception 'El departamento no existe o está inactivo.';
  end if;
  if p_avatar is not null and p_avatar !~ '^https://domumnsezocubigfqwry\.supabase\.co/storage/v1/object/public/' then
    raise exception 'La foto debe estar en el Storage del proyecto.';
  end if;
  insert into public.perfiles_calbas (id_calbas, nombre_completo_calbas, correo_calbas, puesto_calbas, rol_calbas, avatar_url_calbas, activo_calbas)
  values (p_id, btrim(p_nombre), v_email, nullif(btrim(coalesce(p_puesto, '')), ''), p_rol, p_avatar, true);
  insert into public.usuario_departamentos_calbas (usuario_id_calbas, departamento_id_calbas) values (p_id, p_departamento);
  return p_id;
end $$;
revoke all on function public.calbas_agregar_cuenta(uuid, text, text, text, uuid, text) from public, anon;
grant execute on function public.calbas_agregar_cuenta(uuid, text, text, text, uuid, text) to authenticated;
