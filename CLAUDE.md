# CLAUDE.md

Guía para Claude Code al trabajar en este repositorio.

## Proyecto

«Metrología · Pet's Table S.A. de C.V.»: verificaciones internas y calibraciones externas de equipos de medición (básculas, termómetros, potenciómetros, micropipetas y tipos configurables).

- **Idioma:** la interfaz está en español y el usuario se comunica en español; responde en español. Zona horaria: `America/Mexico_City`.
- **Arquitectura:** la misma de `serviciomedico-petstable` y `pruebasindustriales-petstable`: módulos ES en vanilla JS, sin npm ni framework, con supabase-js 2.45.4, lucide 0.453.0 y chart.js 4.4.4 desde jsdelivr a versiones fijas.
- **Repositorio:** https://github.com/jmartinezacs/metrologia-petstable. Vercel publica `main` en https://metrologia-petstable.vercel.app. Por indicación del usuario, los cambios se suben **directo a `main`** (subiendo `APP_VERSION` para que aparezca el aviso de actualización).

## Publicación

- La raíz contiene los archivos **generados** que publica Vercel: `index.html`, `sw.js`, `manifest.webmanifest`, `apple-touch-icon.png` y `version.json`. Nunca edites `index.html` a mano.
- Flujo: edita `public/` → sube `APP_VERSION` en `public/js/config.js` → `powershell -ExecutionPolicy Bypass -File tools\build-single.ps1` → commit.
- Build de pruebas (expone `window.__calbasModules`); escríbela fuera del repo: `tools\build-single.ps1 -Prueba -Out <carpeta temporal>`.
- `tools/*.ps1` deben ser **UTF-8 con BOM** (PowerShell 5.1 rompe los acentos sin él).
- Bundler: el orden de módulos está fijo en `$order` de `build-single.ps1`. Agrega ahí los módulos nuevos. Solo admite `import {a} from './x.js'`, `import X from` y `export function/const/class`; no admite `export {}` ni `import()`. Para llamar a un módulo posterior, publica la función en `ganchos` (core.js).
- `legacy/index-v6.5.html` es la versión anterior, como respaldo; no se publica.

## Base de datos (Supabase `domumnsezocubigfqwry`, compartida)

- Otros sistemas comparten el proyecto (`_med`, `_prubind`, `brom_`, auditorías, EPP). **Solo toca objetos con sufijo `_calbas`**, el esquema `calbas_private` y las funciones `*_calbas`.
- Las migraciones van en `supabase/migrations/` (archivo nuevo con fecha) y se aplican con `apply_migration`. Cada una debe tener su reversión en `supabase/migrations/rollback/`.
- **Básculas (v6.x, sin cambios):** `basculas_calbas`, `pesas_patron_calbas`, `verificaciones_calbas` y `calibraciones_calbas`. Las fórmulas de EMT viven en `validar_verificacion_calbas` y `calbas_private.factor_emt_calbas`. No las alteres sin una revisión técnica.
- **Equipos genéricos (v7):** `tipos_equipo_calbas` (con `metodo_calbas`: PUNTO_UNICO termómetros, MULTIPUNTO potenciómetros con `puntos_referencia_calbas`, SOLO_CALIBRACION micropipetas), `equipos_calbas`, `patrones_calbas`, `verificaciones_equipo_calbas` y `calibraciones_equipo_calbas`. El dictamen («como se encontró») y, si hubo ajuste o corrección, el `dictamen_final_calbas` («como se dejó») los calcula `validar_verificacion_equipo_calbas`. Un «no cumple» con `dictamen_final_calbas = CUMPLE` no queda pendiente de seguimiento. Una verificación nunca se edita: solo se anula, con motivo.
- **Vistas unificadas** (`security_invoker`): `vw_equipos_calbas` (inventario con estados), `vw_verificaciones_todas_calbas` y `vw_calibraciones_todas_calbas`. Cada una une básculas y equipos genéricos por medio de `origen_calbas` (`bascula` o `equipo`).
- **RLS:** usuario activo con departamento asignado para ver y verificar (o con `perfiles_calbas.verifica_todas_calbas`, que tienen los Inspectores de calidad: todas las áreas); administrador para todo lo demás. Por indicación de la administración, solo inspectores de calidad, la Jefa de Calidad y administradores tienen acceso activo. Funciones auxiliares: `calbas_private.activo_calbas()`, `es_admin_calbas()`, `es_usuario_calbas()` y `tiene_departamento_calbas()`.
- **Storage:** `certificados_calbas` (privado; se lee con URL firmada; solo administradores suben). `calbas-avatars/<uid>/…` guarda la foto propia. `avatares` contiene las fotos históricas (solo lectura).
- **Usuarios:** la Edge Function `gestionar_usuarios_calbas_admin` (v3, fuente en `supabase/functions/`). Nunca bloquea la cuenta de Auth (compartida con otras apps): «inactivo» solo cambia `perfiles_calbas.activo_calbas`. Las cuentas que ya existen se agregan con `calbas_agregar_cuenta`. No modifiques `gestionar_usuarios_auditoria_v4`, que pertenece a otro sistema.
- **Pruebas SQL:** `tests/sql/pruebas_equipos_v7.sql` es un bloque `DO` que simula un JWT y termina con `RAISE EXCEPTION` (se revierte). Ejecútalo con `execute_sql`. Ten en cuenta que las secuencias no se revierten: después, reinicia `calbas_private.seq_patrones_calbas` si `patrones_calbas` está vacía.

## Pruebas de interfaz sin credenciales

Sirve una build `-Prueba` con `tools\serve.ps1 -Root <carpeta>`. Luego sustituye `sb.from`/`sb.rpc` por datos simulados (inyecta un `<script src>` del mismo origen, porque la CSP bloquea `eval`) y dispara `sb.auth._notifyAllSubscribers('SIGNED_IN', session)`. No escribas contraseñas reales.

## Avisos push (v7.6)

- Mismo esquema que Pruebas industriales: `push_subs_calbas`, claves VAPID en `calbas_private.config_push_calbas` y secreto del cron en `calbas_private.cron_calbas`. `avisos_calbas` registra lo enviado (un aviso por persona, tipo y día).
- La Edge Function `recordatorios_calbas` (`verify_jwt` false; fuente en `supabase/functions/`) la llama pg_cron `calbas_recordatorio_pendientes` de lunes a sábado a las 08:00 de CDMX. Según `calbas_pendientes_recordatorio()`: equipos por verificar → quienes verifican (no administradores); verificaciones con 3 días o más de atraso y calibraciones → administradores. También atiende `init`, `prueba` y `no_cumple` (aviso inmediato a los administradores) para usuarios con sesión.
- No dispares el cron a mano en horario de producción: insertaría los avisos del día y el envío de las 08:00 los omitiría.

## Pendientes conocidos

- `alerta_inmediata_calbas` (columnas antiguas) ya no se usa: el «no cumple» avisa por push con `recordatorios_calbas`. No hay avisos por correo.
