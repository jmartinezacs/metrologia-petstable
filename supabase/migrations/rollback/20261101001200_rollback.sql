-- Reversión de 20261101001200_calbas_v81_sin_avisos_festivos.sql
select cron.unschedule(jobid) from cron.job where jobname = 'calbas_recordatorio_pendientes';
select cron.schedule('calbas_recordatorio_pendientes', '0 14 * * 1-6', $cron$
  select net.http_post(
    url := 'https://domumnsezocubigfqwry.supabase.co/functions/v1/recordatorios_calbas',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-calbas-cron', (select secreto from calbas_private.cron_calbas where id_calbas = 1)),
    body := jsonb_build_object('accion', 'recordatorio'),
    timeout_milliseconds := 30000);
$cron$);

drop function if exists calbas_private.dia_sin_avisos_calbas(date);
drop function if exists public.calbas_dias_festivos(int);
drop function if exists calbas_private.lunes_n_calbas(int, int, int);
drop table if exists public.dias_festivos_calbas;
