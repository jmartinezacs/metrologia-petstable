-- Reversión de 20261028000700_calbas_v76_avisos_push.sql
select cron.unschedule(jobid) from cron.job where jobname = 'calbas_recordatorio_pendientes';
drop function if exists public.calbas_cron_secreto();
drop table if exists calbas_private.cron_calbas;
drop function if exists public.calbas_pendientes_recordatorio();
drop table if exists public.avisos_calbas;
drop function if exists public.calbas_vapid_guardar(text, text);
drop function if exists public.calbas_vapid_claves();
drop function if exists public.calbas_vapid_publica();
drop table if exists calbas_private.config_push_calbas;
drop function if exists public.calbas_vincular_push(text, text, text, text);
drop table if exists public.push_subs_calbas;
-- La Edge Function recordatorios_calbas se elimina desde el panel de Supabase.
