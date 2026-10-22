# Metrología · Pet's Table

Sistema web para el **control metrológico** de Pet's Table S.A. de C.V.: verificaciones internas y calibraciones externas de básculas, balanzas, termómetros, potenciómetros, micropipetas, termohigrómetros y cualquier otro instrumento de medición.

Versión 7.0 — reconstrucción de la v6.4 «Verificación de básculas» con la misma arquitectura que Servicio Médico y Pruebas Industriales.

## Qué hace

| Sección | Para qué sirve |
|---|---|
| **Panel** | Indicadores del programa: equipos activos, verificaciones del mes y % de conformidad, equipos por verificar, calibraciones en riesgo, alertas de tendencia, estado por departamento, gráficas y accesos rápidos. |
| **Registrar verificación** | Un solo flujo para cualquier equipo. Tres lecturas contra un patrón vigente y vista previa del dictamen en vivo. |
| **Historial** | Todas las verificaciones con filtros (tipo, departamento, dictamen, fechas), exportación a CSV, detalle con gráfica de tendencia del error y anulación con motivo (administradores). |
| **Equipos** | Inventario unificado con filtros rápidos por tipo, ficha técnica, alta y edición. Los administradores pueden crear **tipos de equipo** nuevos. |
| **Calibraciones** | Vigencia por equipo (vigente, por vencer, vencida o sin registro), certificados con archivo PDF o imagen adjunto y exportación. |
| **Patrones** | Pesas patrón (básculas) y patrones de referencia (termómetro patrón, buffers de pH, balanza de referencia…) con su vigencia. |
| **Usuarios** | Directorio. Los administradores crean y editan cuentas, roles, departamentos, puestos y fotografías. |
| **Bitácora** | Auditoría automática de altas, cambios y anulaciones (solo administradores). |
| **Mi perfil** | Datos propios, fotografía y cambio de contraseña. |

### Cómo se evalúa cada equipo

- **Básculas y balanzas**: sin cambios respecto a la v6.4. El EMT (error máximo tolerado) se calcula según la clase de exactitud (I a IIII), las divisiones de carga *m/e* y el criterio (verificación inicial o en servicio ×2). El dictamen lo calcula la base de datos (`validar_verificacion_calbas`).
- **Demás equipos**: el error es `promedio de 3 lecturas − valor de referencia` y se compara contra la **tolerancia del equipo**, que puede ser:
  - **absoluta** (± en la unidad del equipo, p. ej. ±0.5 °C, ±0.05 pH), o
  - **porcentual** (± % del valor de referencia, p. ej. ±0.8 % en micropipetas).
  
  Opcionalmente se exige un **CV máximo** (repetibilidad) para el equipo, útil en micropipetas. El dictamen lo calcula la base de datos (`validar_verificacion_equipo_calbas`).

> ⚠️ Las tolerancias sugeridas al dar de alta un equipo (±1 °C para termómetros, ±0.05 pH, ±1 % en micropipetas, ±3 %HR) son solo un punto de partida. Ajústalas a tu procedimiento interno, a la norma aplicable o a la especificación del fabricante.

### Permisos

- **Usuario**: ve y verifica solo los equipos de su departamento; consulta patrones, calibraciones y el directorio.
- **Administrador**: todo lo anterior para todos los departamentos, además de altas y cambios de equipos, patrones, calibraciones y usuarios, anulación de verificaciones y la bitácora.

Las reglas se aplican en la base de datos (RLS y triggers), no solo en la interfaz.

## Estructura del repositorio

```
index.html, sw.js, manifest.webmanifest, apple-touch-icon.png, version.json   ← lo que publica Vercel (generado)
public/            Código fuente (HTML, CSS, módulos JS)
  js/core.js       Cliente Supabase, utilidades y reglas de presentación metrológica
  js/app.js        Sesión, menú y rutas
  js/modules/      dashboard, verificar, historial, equipos, calibraciones, patrones, usuarios, bitacora, perfil
supabase/migrations/  Migraciones SQL (+ rollback/)
tests/sql/         Pruebas de reglas de negocio (se revierten solas)
tools/             build-single.ps1 (genera index.html) y serve.ps1 (servidor local)
legacy/            Versión 6.5 anterior, como respaldo para revertir
```

## Publicar una nueva versión

1. Edita los archivos de `public/`.
2. Sube el número `APP_VERSION` en `public/js/config.js`.
3. Genera el sitio (PowerShell, desde la raíz del repositorio):
   ```bash
   powershell -ExecutionPolicy Bypass -File tools\build-single.ps1
   ```
4. Haz commit y push. Vercel publica `index.html`. Los usuarios con la app abierta verán el aviso «Hay una nueva versión disponible».

Para probar en local: `powershell -ExecutionPolicy Bypass -File tools\serve.ps1 -Port 5173 -Root .` y abre http://localhost:5173 (usa la base de datos real).

## Revertir a la versión 6.5

La base de datos sigue siendo compatible con la v6.5, porque la migración v7 solo **agregó** tablas. Para regresar, copia `legacy/index-v6.5.html` como `index.html` en la raíz y publícalo.
