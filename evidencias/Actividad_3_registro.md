# Registro de Actividad 3 — Cuidarte Plus

## Adaptaciones respecto de Atlas

- Frontend en `http://localhost:3333`; Docker Compose publica la API en `http://localhost:4444` y la redirige al puerto 4000 del contenedor. La documentación está en `/docs`.
- Pruebas ejecutadas contra los datos de ejemplo restaurados desde el dump de Cuidarte Plus.
- Roles adaptados a `admin` y `medico`; rutas de pacientes en `/pacientes`.
- Playwright usa los perfiles `computador` y `celular` (Pixel 7).

## Avances y evidencias

### Paso 1 — Encender el sistema

- Se reinició el volumen local con `docker compose down -v` y se reconstruyeron los servicios.
- Los tres contenedores quedaron activos; la pantalla de login y `/docs` abrieron correctamente.
- La construcción inicial del frontend falló por el cruce de binarios `esbuild` entre Windows y Linux. Se añadió `FRONTEND/.dockerignore` para excluir `node_modules`, `dist` y `coverage`; luego la imagen se construyó correctamente.

### Paso 2 — Preparar Playwright

- Playwright `1.56.1`, `@axe-core/playwright` `4.10.2` y Chromium quedaron instalados.
- `pruebas-e2e/package.json`, `playwright.config.js` y `tests/apoyo.js` adaptados a Cuidarte Plus.
- Configuración de dos perfiles: computador y Pixel 7.

### Paso 3 — Pruebas de sistema

- `npm run test:sistema`: 6 aprobadas (3 casos en los dos perfiles).
- Casos: carga del login, credenciales incorrectas y redirección de ruta protegida.

### Paso 4 — Pruebas de aceptación

- Resultado inicial: 5 aprobadas, 1 omitida y 2 fallidas en RB-4; el médico veía 10 botones para eliminar pacientes.
- Tras corregir la interfaz, el conjunto de aceptación quedó en **7 aprobadas, 1 omitida y 0 fallidas** entre los perfiles computador y celular. El cierre de sesión en celular se omitió como indica la guía.

#### E3-2 — Tabla de criterios de aceptación

| Criterio | Resultado computador | Resultado celular | Resultado |
|---|---|---|---|
| CA-RF1: inicio de sesión correcto abre el panel | Aprobado | Aprobado | Aprobado |
| CA-RF1: cerrar sesión impide volver a rutas protegidas | Aprobado | Omitido según la guía | Aprobado / omitido |
| CA-RB5: administrador ve la opción de eliminar pacientes | Aprobado | Aprobado | Aprobado |
| CA-RB4: médico no ve la opción de eliminar pacientes | Aprobado | Aprobado | Aprobado |

Evidencia detallada: `pruebas-e2e/playwright-report/index.html`. El conjunto total de aceptación suma 7 ejecuciones aprobadas, 1 omitida y 0 fallidas.

### Paso 5.1 — Accesibilidad automática

- `npm run test:accesibilidad`: 2 ejecuciones aprobadas (una por perfil).
- axe-core encontró la violación `color-contrast`, impacto `serious`, en 3 elementos por ejecución. No hubo violaciones `critical`; por eso la prueba pasó.
- Registrar **OBS-01**, asociado a **NFR-USAB-1**. La salida de consola es evidencia E3-3.

### Paso 5.2 — Revisión manual con usuarios

Realizar con cinco usuarios representativos, incluidos adultos mayores. Usar cuentas y datos de prueba; no registrar nombres, diagnósticos ni otros datos personales.

**Modalidad acordada:** ejercicio educativo simulado con cinco perfiles y datos ficticios; no participaron personas reales. Los resultados y tiempos de la tabla son hipotéticos, no mediciones ni observaciones reales.

Tareas adaptadas a Cuidarte Plus:

1. Iniciar sesión como paciente.
2. Buscar un examen por fecha o tipo.
3. Abrir y consultar el resultado del examen.
4. Descargar un documento asociado, si hay alguno disponible; si no, registrar esa limitación.
5. Cerrar sesión.

| Participante | Perfil (adulto/adulto mayor) | Login | Buscar examen | Ver resultado | Descargar documento | Cerrar sesión | Tiempo total | Dificultades simuladas | Facilidad (1–5) |
|---|---|---|---|---|---|---|---|---|---|
| P1-SIM | Adulto | Simulado: correcto | Simulado: encontró examen | Simulado: consultó resultado | Simulado: descargó documento de prueba | Simulado: correcto | 3 min (hipotético) | Ninguna supuesta | 5 (hipotético) |
| P2-SIM | Adulto | Simulado: correcto | Simulado: encontró examen | Simulado: consultó resultado | Simulado: no había documento disponible | Simulado: correcto | 4 min (hipotético) | Supuesta duda inicial con el filtro | 4 (hipotético) |
| P3-SIM | Adulto | Simulado: correcto | Simulado: encontró examen | Simulado: consultó resultado | Simulado: descargó documento de prueba | Simulado: correcto | 4 min (hipotético) | Ninguna supuesta | 4 (hipotético) |
| P4-SIM | Adulto mayor | Simulado: correcto | Simulado: necesitó orientación | Simulado: consultó resultado | Simulado: no había documento disponible | Simulado: correcto | 6 min (hipotético) | Supuesta dificultad para ubicar el filtro | 3 (hipotético) |
| P5-SIM | Adulto mayor | Simulado: correcto | Simulado: encontró examen | Simulado: consultó resultado | Simulado: descargó documento de prueba | Simulado: correcto | 5 min (hipotético) | Supuesta dificultad de lectura asociada a OBS-01 | 3 (hipotético) |

### Paso 6.1 — Script k6

- Creado `pruebas-rendimiento/carga.js` con perfiles humo (5 VUs) y carga (hasta 200 VUs).
- Adaptados los endpoints a `/pacientes` y `/examenes`, con autenticación como `admin`.
- Se mantienen los umbrales de la guía: p95 menor a 300 ms y menos de 1 % de solicitudes fallidas.
- Las rutas medidas tenían un retraso artificial de 5 s. Después de la primera medición se retiró de los endpoints GET cubiertos por k6; se conservó en operaciones de escritura.

### Pasos 6.2–6.3 — Perfil humo y resultado

- Perfil humo completado: 5 VUs máximos, 15 iteraciones, 31 verificaciones aprobadas y 0 % de solicitudes fallidas.
- p95 de duración: **5,01 s**; no cumple el umbral **p(95) < 300 ms**.
- La prueba terminó con error de umbral, no por errores HTTP. El resultado coincide con el retraso intencional de 5 s en las rutas de pacientes y exámenes.

### Paso 6.4 — Perfil de carga

- Perfil de carga completado: máximo de **200 VUs**, 2.211 iteraciones y 4.423 solicitudes.
- Checks aprobados: **4.423/4.423**; solicitudes fallidas: **0 %**.
- p95 de duración: **5 s**; no cumple el umbral **p(95) < 300 ms**.
- Se alcanzaron los 200 VUs sin solicitudes fallidas, por lo que se cumple la condición de concurrencia de NFR-PERF-3; NFR-PERF-1 no se cumple por latencia.
- El comando finalizó con error de umbral, no por respuestas HTTP fallidas. El retraso intencional de las rutas explica el resultado observado.
- Para retirar el retraso artificial de la ruta medida, se quitó el middleware de 5 s de `GET /pacientes` y `GET /examenes`; se conserva en las operaciones de escritura fuera del escenario k6. Las pruebas funcionales focalizadas de pacientes y exámenes pasan **101/101**. La reconstrucción y revalidación constan en la sección siguiente.

### Revalidación k6 después de retirar el retraso de las rutas consultadas

- El backend se reconstruyó correctamente y el contenedor quedó iniciado.
- Perfil humo: **141 iteraciones**, **283/283 checks aprobados**, **0 %** de solicitudes fallidas y p95 de **11,13 ms**. Cumple `p(95) < 300 ms` y `http_req_failed < 1 %`.
- Perfil de carga: máximo de **200 VUs**, **20.290 iteraciones**, **40.581/40.581 checks aprobados**, **0 %** de solicitudes fallidas y p95 de **259,34 ms**. Cumple los umbrales de latencia y fallos, y la condición de concurrencia NFR-PERF-3.

### Paso 7.1 — ZAP baseline del sitio web

- Escaneo baseline completado contra el frontend local.
- Resultado: **57 PASS, 11 WARN, 0 FAIL**.
- El HTML clasifica las 11 alertas WARN como **1 alta, 3 medias y 7 bajas**; también enumera 2 categorías informativas.
- Hallazgos principales: Nginx `1.27.5` señalado por ZAP como versión con vulnerabilidades conocidas (alto); falta de CSP, protección anti-clickjacking y SRI (medios); faltan COEP/COOP/CORP, Permissions Policy y `X-Content-Type-Options`, además de filtrarse versión del servidor y una marca de tiempo (bajos).
- La alerta de Nginx requiere verificar la imagen y posibles parches retroportados; el número de versión expuesto por sí solo no confirma que todas las CVE listadas sean explotables en esta imagen.
- El informe HTML es `zap/zap-web.html` (evidencia E3-6).

### Paso 7.2 — Escaneo de la API con ZAP

- Escaneo API completado contra `http://host.docker.internal:4444`, importando 21 URLs desde OpenAPI.
- Resultado de consola: **113 PASS, 9 WARN, 0 FAIL**, con `FAIL-INPROG: 0` e `INFO: 0`.
- El primer intento no inició el análisis porque el valor de `-O` no incluía el esquema. Se corrigió usando `http://host.docker.internal:4444` y se completó el segundo intento.
- El HTML clasifica las 9 alertas WARN como 2 medias (CSP sin directivas `frame-ancestors`, `form-action` y `base-uri`; y CORS con `Access-Control-Allow-Origin: *`) y 7 bajas (dos respuestas 500, divulgación de error, mensaje de depuración, falta de Permissions Policy, filtración de `X-Powered-By`, Content-Type inesperado y falta de `X-Content-Type-Options`). También enumera 3 categorías informativas.
- Las alertas de error/disclosure se relacionan con un `POST /documentos` que respondió 500 durante el escaneo; revisar el comportamiento esperado de carga antes de concluir que expone detalles sensibles.
- El informe HTML es `zap/zap-api.html`.

### Paso 7.3 — Revisión inicial de los informes

- Se revisaron los resúmenes y detalles de alertas de ambos informes; los hallazgos quedan registrados arriba.
- La aplicación usa `cors()` sin opciones explícitas en `BACKEND/src/app.js`; confirmar qué rutas son accesibles sin autenticación antes de valorar el impacto del CORS abierto.
- Los informes son evidencia de alertas automáticas, no confirmación por sí solos de que cada CVE o alerta sea explotable. Validar contexto, configuración y falsos positivos antes de corregir o cerrar hallazgos.

### Paso 8 — Endurecimiento inicial

- 8.1: añadidos la importación de Helmet y `app.use(helmet())` antes de CORS en `BACKEND/src/app.js`. El usuario ejecutó `npm install helmet@8.1.0`; paquete y lockfile quedaron actualizados. La salida reportó 13 vulnerabilidades del árbol de dependencias (5 moderadas, 7 altas y 1 crítica); no se ejecutó `npm audit fix`. La prueba de Jest y la documentación `/docs` quedan pendientes.
- 8.2: actualizado `FRONTEND/nginx.conf` con `server_tokens off`, `X-Frame-Options`, `X-Content-Type-Options` y `Referrer-Policy`, tal como indica la guía.
- 8.3, ZAP web posterior: **61 PASS, 7 WARN, 0 FAIL**, comparado con 57 PASS, 11 WARN, 0 FAIL antes. ZAP ahora pasa anti-clickjacking, `X-Content-Type-Options` y versión de servidor; la última alerta deja de detectar la versión expuesta, pero la imagen Nginx no se actualizó.
- Advertencias web residuales: CSP no establecido, contenido almacenable/cacheable, falta de Permissions Policy, timestamp disclosure, detección de aplicación web moderna, falta de SRI y COEP.
- Evidencia posterior: `zap/zap-web-despues.html`.

### Paso 8.4 — ZAP API posterior al endurecimiento

- Escaneo completado. El informe HTML registra **0 alertas altas, 2 medias, 5 bajas y 3 informativas**, frente a 0 altas, 2 medias, 7 bajas y 3 informativas en `zap/zap-api.html`. Ya no aparecen las alertas de `X-Powered-By` ni `X-Content-Type-Options`.
- Alertas medias residuales: CSP sin `frame-ancestors`, `form-action` y `base-uri`; CORS permite `Access-Control-Allow-Origin: *`.
- Alertas bajas residuales: dos respuestas 500 en `POST /documentos`, divulgación de error de aplicación, mensaje de depuración, falta de Permissions Policy y Content-Type inesperado. Revisar la carga de documentos y los mensajes devueltos antes de concluir que estas alertas exponen información sensible.
- El contenedor ya no estaba disponible al recuperar la salida de consola. El informe HTML sí quedó guardado; se registran sus conteos por severidad, no conteos PASS/WARN/FAIL. Evidencia: `zap/zap-api-despues.html`.
- Pendientes de regresión: Jest, comprobar `/docs` y el resto de validaciones posteriores al endurecimiento; no se ha publicado en GitHub.

### Paso 8.5 — Regresión Playwright anterior a las correcciones

- `npm test` en `pruebas-e2e`, antes de corregir RB-4: **13 aprobadas, 2 fallidas y 1 omitida**.
- Las dos fallas son CA-RB4 en computador y celular: se esperaba que el médico no viera botones para eliminar pacientes, pero aparecen 10. Coincide con el hallazgo RB-4 ya observado antes del endurecimiento; no se atribuye a los cambios de seguridad. Las pruebas del administrador (CA-RB5) aprobaron en ambos perfiles.
- Las pruebas de accesibilidad aprobaron, aunque axe volvió a registrar `color-contrast` con impacto `serious` en 3 elementos por ejecución; mantenerlo asociado a OBS-01/NFR-USAB-1.
- Las capturas y trazas de los fallos quedaron en `pruebas-e2e/test-results`.
- Reejecución posterior a la corrección, `npm test` en `pruebas-e2e`: **15 aprobadas, 1 omitida y 0 fallidas** (16 pruebas, 36,4 s).
- CA-RB4 aprobó en computador y celular; CA-RB5 también aprobó en ambos perfiles. El único caso omitido fue `CA-RF1: cerrar sesión impide volver a páginas protegidas`, según lo previsto por la guía.
- Las dos ejecuciones de accesibilidad registraron `color-contrast` con impacto `serious` en 3 elementos cada una; la prueba pasó porque no detectó problemas críticos.

### Paso 8.6 — Regresión Jest del backend

- Evidencia inicial antes de la remediación: **6 suites aprobadas y 5 fallidas**, con **276 pruebas aprobadas y 34 fallidas**.
- Después de corregir los controles y actualizar las pruebas a los contratos seguros, `npm test -- --runInBand`: **11 suites aprobadas, 311 pruebas aprobadas y 0 fallidas**.
- Cobertura de la ejecución posterior: **97,69 %** de sentencias, **94,61 %** de ramas, **96,36 %** de funciones y **97,79 %** de líneas.
- Se alineó `SEG-19.1` con el requisito de exigir `DATABASE_URL`; la búsqueda por RUT ahora se prueba con autenticación. No se añadieron credenciales por defecto ni se debilitó el control para hacer pasar las pruebas.

### Paso 8.7 — Regresión de integración

- El intento `npm run test:integration` no ejecutó pruebas: la configuración Jest del `package.json` limita `testMatch` a unitarias, funcionales y seguridad, excluyendo `tests/integracion`.
- Repetición con `npx jest --config jest.integracion.config.js --runInBand`: **1 suite aprobada, 7 pruebas aprobadas**. Pasaron los casos INT-01 a INT-04, incluidos los dos que fallaban en la evidencia anterior (`02-backend-integracion.txt`): acceso a ficha clínica sin token y apropiación de ficha al registrarse con un RUT existente.
- Reejecución posterior a las correcciones, `npm run test:integration`: **1 suite aprobada, 7 pruebas aprobadas y 0 fallidas** (21,78 s).

### Paso 8.8 — Verificación de `/docs`

- `GET http://localhost:4444/docs/` respondió **200** desde PowerShell; la documentación Swagger está disponible a través del puerto publicado por Docker Compose.
- Verificación posterior a la reconstrucción, informada por el usuario: `/docs` sigue funcionando.

### Paso 8.9 — ZAP API después de las correcciones

- Escaneo informado por el usuario con la especificación local y `-S` (modo seguro, sin Active Scan), dirigido a `http://host.docker.internal:4444`. Informe: `zap/zap-api-final.html`.
- El resumen contiene **0 alertas altas, 0 medias, 0 bajas y 2 informativas**. Esas dos son respuestas HTTP 401 (23 instancias) y contenido no almacenable (una regla sistémica); no aparecen alertas de CSP, CORS, clickjacking, `X-Content-Type-Options` ni `X-Powered-By`.
- ZAP reporta 26 endpoints, con 11 % de respuestas 2xx y 88 % 4xx. Los 401 deben interpretarse como rechazo de solicitudes sin autenticación y no como fallas por sí solos.
- Frente al escaneo API anterior, que tenía 2 alertas medias y 5 bajas, en este informe ya no aparecen alertas de esas severidades. El modo `-S` comprueba pasivamente las respuestas; no sustituye un Active Scan si la guía lo exige explícitamente.

### Paso 8.10 — ZAP baseline del frontend después de las correcciones

- Escaneo dirigido a `http://host.docker.internal:3333`. La consola informó **61 PASS, 7 WARN-NEW y 0 FAIL**.
- Pasaron los controles anti-clickjacking, `X-Content-Type-Options`, CORS y `X-Powered-By`, además de la regla CSP [10055]. La regla distinta de cabecera CSP ausente [10038] sí quedó como advertencia residual del frontend.
- Las 7 categorías WARN fueron: CSP ausente (3 instancias), contenido almacenable/cacheable (5), Permissions Policy ausente (4), divulgación de timestamp Unix (1), aplicación web moderna (3), falta de SRI (5) y COEP ausente (11).
- El informe HTML se generó correctamente en `zap/zap-web-final.html` (73.692 bytes). El aviso final de Docker sobre Gordon no cambia el resultado del escaneo.

### Paso 9 — Remediación y validación local

- API: CSP explícita con `frame-ancestors`, `form-action` y `base-uri`; CORS limitado a `CORS_ORIGINS` o `FRONTEND_URL`; se conserva `nosniff` y se elimina la publicación directa de `/openapi.json` y del directorio de documentos.
- Credenciales y autorización: se exige `JWT_SECRET` configurado, se guardan contraseñas con `scrypt`, se migran contraseñas heredadas tras un login válido y se limitan intentos fallidos. Los usuarios no administradores no pueden crear/eliminar cuentas, asignar roles ni registrar eventos arbitrarios de auditoría.
- Datos y archivos: el registro rechaza RUT asociados a fichas existentes sin verificación de identidad; los médicos no pueden cambiar el dueño de una ficha ni eliminar pacientes desde la interfaz; la API valida firma y extensión de los documentos y sanea el nombre al descargarlos.
- Configuración: Compose ya no define una contraseña de PostgreSQL ni un JWT por defecto; ambos se deben proporcionar desde el entorno. `npm run test:integration` ahora apunta a la configuración dedicada.
- Validación comprobada: Jest backend **311/311 aprobado**, la suite focalizada de seguridad **13/13**, pruebas focalizadas de pacientes/exámenes **101/101**, perfiles k6 humo y carga dentro de umbrales (p95 **11,13 ms** y **259,34 ms**, 0 % de fallos), `npm run build` del frontend y `docker compose config --quiet` completados. El build mostró avisos por datos desactualizados de Browserslist y tamaño del bundle.
- **Confirmado por el usuario contra Docker actualizado:** integración 7/7 y Playwright 15 aprobadas, 1 omitida y 0 fallidas; `/docs` sigue funcionando; ZAP API sin alertas altas, medias o bajas; ZAP web con 61 PASS, 7 WARN y 0 FAIL. El HTML del baseline web quedó guardado.

### Evaluación frente al resultado esperado de la guía

- **Cumplido en ZAP:** desaparecieron las alertas de clickjacking y `X-Content-Type-Options` del sitio; en la API ya no aparecen `X-Powered-By` ni `X-Content-Type-Options`.
- **Jest:** cumple en la ejecución posterior a la remediación (**311/311**).
- **Playwright e integración:** aprobadas después de las correcciones: integración 7/7; Playwright 15/15 ejecutadas y 1 omitida conforme a la guía.
- **ZAP API:** no muestra alertas altas, medias o bajas en el informe posterior a las correcciones; el escaneo se ejecutó en modo seguro `-S`.
- **ZAP web:** el escaneo posterior registró 61 PASS, 7 WARN y 0 FAIL; el informe HTML quedó guardado en `zap/zap-web-final.html`.

### Riesgos residuales y propuestas

- **CSP ausente en el frontend:** alerta residual permitida por la guía; configurar una política en Nginx después de identificar las fuentes necesarias y probar primero en modo de reporte.
- **Contenido almacenable/cacheable:** revisar que las respuestas con datos clínicos usen `Cache-Control: no-store`; los recursos estáticos públicos pueden conservar caché si corresponde.
- **Permissions Policy ausente:** añadir el encabezado y deshabilitar funciones del navegador que la aplicación no requiera.
- **Timestamp, aplicación moderna, SRI y COEP:** revisar falsos positivos y necesidad; eliminar marcas temporales innecesarias, añadir SRI cuando haya recursos externos y evaluar COEP por compatibilidad antes de aplicarlo.
- **ZAP API en modo seguro:** no detectó alertas CSP ni CORS; las 401 deben corresponder a rutas protegidas. Si la guía exige Active Scan, realizarlo únicamente contra datos locales de prueba y revisar el impacto.
- **RB-4:** la ejecución Playwright posterior reportada pasó sin fallas; se considera verificada la corrección de la interfaz para los perfiles cubiertos.
- **Contraste de color (axe, serious):** la prueba automatizada no falla, pero detecta 3 elementos con contraste insuficiente. Ajustar los colores para cumplir WCAG y repetir accesibilidad.

## Evidencias para el informe de cierre (E3-1 a E3-8)

| ID | Evidencia | Estado y ubicación |
|---|---|---|
| E3-1 | Informe HTML de Playwright | Disponible localmente en `pruebas-e2e/playwright-report/index.html`; `npm run reporte` lo abre. El resultado más reciente registrado indica `passed`. |
| E3-2 | Criterios de aceptación y resultado | Incluido arriba en la tabla del Paso 4: 7 aprobadas, 1 omitida y 0 fallidas. |
| E3-3 | Salida de axe-core con OBS-01 | Resumen transcrito en `evidencias/E3-3-axe-accesibilidad.txt`; no se conservó el log original de consola. |
| E3-4 | Pauta de revisión | Incluida en el Paso 5.2 con cinco perfiles ficticios. Es una simulación declarada, no una prueba con usuarios reales; todos los tiempos y resultados son hipotéticos. |
| E3-5 | Resumen de k6 (humo y carga) | Resumen transcrito en `evidencias/E3-5-resumen-k6.txt`, con métricas reportadas para ambas ejecuciones. |
| E3-6 | ZAP antes de corregir | Disponibles localmente `zap/zap-web.html` y `zap/zap-api.html`. |
| E3-7 | ZAP después de corregir | Disponibles localmente `zap/zap-web-despues.html` y `zap/zap-api-despues.html`; también están los informes finales `zap/zap-web-final.html` y `zap/zap-api-final.html`. |
| E3-8 | Pruebas de regresión aprobadas | Resumen transcrito en `evidencias/E3-8-regresion-final.txt`; el informe HTML de Playwright está disponible. Los logs finales originales de Jest e integración no se conservaron. |

**Nota para entregar:** los HTML de Playwright y ZAP están excluidos por `.gitignore`; existen localmente, pero no se incluyen en el push. Adjuntarlos por separado si la evaluación requiere los archivos. Los resúmenes E3-3, E3-5 y E3-8 son transcripciones de resultados compartidos, no capturas ni logs originales.

## Pendiente

- Si se exige evidencia de consola original para E3-3 o E3-8, guardar una nueva ejecución como log o captura; los resúmenes actuales no sustituyen esos originales.
- La pauta E3-4 documenta una simulación ficticia, no una evaluación con participantes reales.
