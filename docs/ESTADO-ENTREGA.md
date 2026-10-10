# Estado de la entrega — RIETI (Etapa 3)

**Fecha de corte:** 10-oct-2026 (congelamiento a las 12:00) · **Rama:** `main` · Estado más reciente: [sección 10](#10-estado-al-congelamiento-10-oct-2026)
**Modo de trabajo:** "24 horas": solo P0–P5 del plan de entrega; lo demás queda como hoja de ruta.

## 1. Resumen

| Prioridad | Estado |
|---|---|
| P0 Auditoría | Hecha (sección 2) |
| P1 Flujo de punta a punta | Desplegado en AWS. Flujo ciudadano verificado por `curl` contra producción. **Falta la prueba de la app en emulador** (login, bandeja y estatus) |
| P2 Seguridad mínima del backend | Hecha y probada; rol `rieti_app` preparado, no aplicado; RLS no hecha |
| P3 Pantallas Android | Hechas; compilan y pasan pruebas; **no se ejecutaron en emulador en esta sesión** |
| P4 Documentación | Hecha |
| P5 Higiene del repositorio | Hecha |
| P6 Web mínima | **No hecha** (hoja de ruta) |

## 2. Auditoría inicial (P0)

Encontrado en `main` (commit `246f497`) y en AWS el 10-oct-2026 (solo lectura):

| Tema | Hallazgo |
|---|---|
| Endpoints | `POST /reportes` (público), `GET /reportes` (JWT + grupo), `GET /reportes/folio/:folio` (**público, sin clave**), `PATCH /reportes/:id` (JWT + grupo), `POST /auth/login` (público), `/health`, `/health/ready`. Sin prefijo `/api/v1`. |
| Rutas sin autenticación que no debían serlo | `GET /reportes/folio/:folio`: con folios secuenciales permitía enumerar todos los reportes y ver cantidad, edad, actividad, riesgo y estatus (verificado contra producción con el reporte de prueba). El guard era "opcional por defecto": una ruta nueva sin decorador quedaba pública. |
| `POST /auth/login` | El API llama a Cognito con `USER_PASSWORD_AUTH`; si Cognito pide un reto (contraseña nueva o MFA) responde 401; si no, sincroniza la fila `usuario` y devuelve el access token. La contraseña nunca se guarda en el API. |
| Estatus | Catálogo `Recibido, En revisión, Canalizado, Atendido, Cerrado`, distinto del canónico de la Etapa 1 (D-11). Sin máquina de estados: se podía pasar a cualquier estatus. |
| `synchronize` | `false`; el esquema ya usaba migraciones. |
| ALB | Interno, sin IP pública; solo CloudFront lo alcanza por *VPC origin*. |
| Cognito | Pool con MFA **opcional**, grupos `Administrador` y `PersonalSIPINNA`, **0 usuarios**, sin dominio de Hosted UI. |
| RDS | Single-AZ, respaldos de 1 día, la API usa el usuario maestro `rieti_admin`. |
| ECS | Servicio con 1 tarea en ejecución. |
| Terraform | `terraform plan` sin diferencias. |
| Android | Compilaba (`assembleDebug`); las pruebas no compilaban (faltaba JUnit). El JDK que trae Android Studio en esta máquina es 25 y **no** funciona con Kotlin 1.9.24 (se compiló con `jbr-21`). |
| CI | Solo backend: build, pruebas unitarias, `npm audit` y despliegue por OIDC. |

## 3. Hecho y verificado

| Qué | Cómo se verificó |
|---|---|
| Contrato `/api/v1` con formato único de error | 36 pruebas e2e contra PostgreSQL 16.10 + PostGIS 3.6 locales |
| Guard que deniega por defecto + usuario activo en cada petición | e2e (401/403) + prueba de inventario de rutas públicas |
| Registro anónimo con folio + clave (Argon2id, solo hash en BD) | Unitarias + e2e |
| Consulta por `POST` con folio + clave, respuesta uniforme, bloqueo por folio | e2e |
| Máquina de estados de la Etapa 1, motivo obligatorio al descartar | Unitarias + e2e |
| Bandeja paginada con filtro, detalle con bitácora, notas | e2e |
| Migración del catálogo de estatus canónico | e2e (la BD queda igual que el código) |
| Límite de tasa, límite de cuerpo de 16 KB, `helmet` | e2e (429, 413) |
| Bitácora solo de inserción | e2e |
| Script de administración para borrar reportes de prueba | e2e |
| Rol `rieti_app` (mínimo privilegio) | Script SQL probado en local; las 36 e2e pasan conectadas con ese rol |
| Login con códigos de error propios | Unitarias con Cognito simulado |
| App Android: 8 pantallas, capas con repositorio y `UiState` | `assembleDebug` y `assembleRelease` compilan; 10 pruebas JVM; lint con 0 errores |
| Higiene del repositorio | `gitleaks` sin hallazgos en todo el historial; `.idea` fuera del índice; `.gitignore` de secretos |
| CI | Workflows nuevos escritos (e2e con PostGIS, Android, gitleaks). **Correrán por primera vez en el PR.** |

## 4. Hecho pero no verificado

| Qué | Falta | Dónde |
|---|---|---|
| App contra el API desplegado (login, bandeja, cambio de estatus) | Correr el guion en el emulador | [PRUEBA-APP](PRUEBA-APP.md) |
| Login del personal en producción | Primer inicio de sesión del usuario creado | [PRUEBA-APP](PRUEBA-APP.md), sección 4 |
| Borrar `RIETI-2026-000001` (y el de prueba `RIETI-2026-000002`) | Tarea única de ECS | [RUNBOOK-AWS](RUNBOOK-AWS.md), paso 3 |
| `alerta_emails` | `terraform apply` de las suscripciones | [RUNBOOK-AWS](RUNBOOK-AWS.md), paso 5 |
| Checks de CI de Android, e2e y gitleaks | No verificados por la sesión de desarrollo (sin acceso a GitHub Actions) | GitHub Actions |

## 5. No hecho (hoja de ruta)

| Tema | Notas |
|---|---|
| Web mínima (P6) | No se empezó. Requiere además hosting en S3 + comportamiento de CloudFront y CORS. |
| Reporte "con medio de contacto" | Todos los reportes son anónimos. Guardar contacto exige cifrado a nivel aplicación (RF-03, RNF-29). |
| Hosted UI + PKCE + MFA obligatorio (D-06) | El personal usa contraseña permanente. |
| Alta de usuarios desde la plataforma (`POST /usuarios`) | Hoy por CLI (runbook). |
| RLS por municipio | Requiere guardar municipio en el reporte (D-14). |
| API con `rieti_app` | Preparado; requiere secreto nuevo y cambio en la task definition. |
| Evidencias fotográficas, EXIF, URL prefirmada | Sin endpoint. |
| Modo sin conexión, estadísticas, mapa de calor, canalización, duplicados, panel web del personal, WhatsApp | Fuera del alcance de estas 24 h. |
| R8 en release, Dependabot, Trivy, ZAP, prueba de carga | Ver [métodos de protección](seguridad/metodos-proteccion.md#planeado). |
| KDoc/TypeDoc generados (Dokka/TypeDoc) | El código está documentado; falta generar el HTML. |

## 6. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Fusionar el PR despliega a producción y aplica una migración | Alto si falla | Snapshot manual antes (runbook, paso 1); rollback automático de ECS; migración con `down`. La migración se probó en local, no contra una copia de producción. |
| Las APK anteriores dejan de funcionar con el backend nuevo | Medio | Instalar la APK de esta rama (guion de prueba). |
| El reporte de prueba existente no tiene clave, así que no se puede consultar públicamente | Bajo | Se borra en el runbook, paso 3. |
| El bloqueo por folio vive en memoria de cada tarea | Bajo | Se reinicia al desplegar o al escalar; el límite por IP y el WAF siguen activos. |
| MFA opcional y contraseñas permanentes | Medio | Límite de tasa, bloqueo de Cognito y WAF; Hosted UI en la hoja de ruta. |
| Una sola AZ, respaldos de 1 día | Medio | Decisiones D-02 y D-04; snapshot manual antes de cambios. |
| Credenciales usadas durante el desarrollo | Alto si no se rotan | Rotación pendiente del equipo (D-10). |
| El aviso de privacidad es un borrador | Medio | Validarlo con el área jurídica del SIPINNA antes de publicar. |
| La app no se probó en emulador en esta sesión | Medio | Guion paso a paso en [PRUEBA-APP](PRUEBA-APP.md). |

## 7. Decisiones tomadas sin consultar

Todas son reversibles. Se tomaron por el plazo de 24 horas.

| # | Decisión | Por qué |
|---|---|---|
| 1 | Todos los reportes son **anónimos**; el inicio ofrece "Reportar", "Consultar mi reporte" y "Soy personal SIPINNA". El reporte "con medio de contacto" queda en la hoja de ruta. | Guardar contacto exige cifrado a nivel aplicación y una llave nueva en AWS; no cabía en el plazo sin riesgo. El seguimiento se hace con folio + clave (D-12, D-15). |
| 2 | Argon2id con el **Argon2 integrado de Node.js 24** (sin dependencias nativas). Clave de 12 símbolos sin caracteres ambiguos (`XXXX-XXXX-XXXX`). | Menos superficie de ataque y la misma imagen Docker; legible para dictarla o anotarla. |
| 3 | Bloqueo de un folio tras 5 fallos en 15 minutos, en memoria, sin guardar IP. Respuesta idéntica si el folio no existe o la clave es incorrecta. | Defensa contra enumeración sin guardar datos del ciudadano (RNF-29). |
| 4 | La consulta pública muestra **solo estatus y fechas**; nunca comentarios del personal. | Minimización (RF-38); los comentarios internos pueden contener datos sensibles. |
| 5 | Guard que **deniega por defecto** y verifica en cada petición que el usuario esté activo en la BD. | Una ruta nueva olvidada ya no queda pública; las bajas surten efecto de inmediato. |
| 6 | Migración del catálogo: Atendido → **En atención**, Cerrado → **Concluido**, se agrega **Descartado**. Reabrir un caso concluido exige comentario. | Catálogo canónico de la Etapa 1 (D-11), conservando las referencias de la bitácora. |
| 7 | Se **retiraron** `GET /reportes/folio/:folio` y `PATCH /reportes/:id`. | La primera permitía enumerar reportes; ambas se sustituyen por el contrato v1. |
| 8 | `/health` y `/health/ready` quedan **fuera** del prefijo `/api/v1`. | El ALB, ECS y el CI ya los usan; cambiarlos implicaba tocar infraestructura. |
| 9 | Límites: reportes 10 → **5 por minuto** por IP; consulta 10/min; login 5/min. Descripción 5000 → **2000** caracteres. Cuerpo máximo 16 KB. | RNF-23 y el límite de 8 KB del WAF. |
| 10 | El aviso de privacidad lo sirve el API (versión `2026-10-v1`) y el reporte exige esa versión. **El texto es un borrador.** | Una sola fuente de verdad para la app y la web futura. |
| 11 | Se quitó la miniatura de mapa y la librería **Coil**. | El servicio público de mapas recibía las coordenadas del reporte (fuga a un tercero) y no es confiable. |
| 12 | Token de sesión **solo en memoria** (hay que iniciar sesión cada vez que se abre la app). | Cumple "tokens solo en almacenamiento cifrado" sin agregar dependencias. |
| 13 | `FLAG_SECURE` **solo en release**. | En debug se necesitan capturas para documentar. |
| 14 | El login responde `CREDENCIALES_INVALIDAS` / `RETO_NO_SOPORTADO` en vez de `NO_AUTENTICADO`; `esAdministrador` ahora es true solo para el grupo `Administrador`. | Antes la app habría mostrado "sesión expirada" ante una contraseña incorrecta. La app ya no usa `esAdministrador`. |
| 15 | Borrar el reporte de prueba con un **script en la imagen** ejecutado como tarea única de ECS. | La BD no es accesible desde fuera de la VPC y no hay bastión; así no se abre nada. |
| 16 | `rieti_app` como script SQL probado, **no** como migración automática; RLS no se implementa. | Crear el rol con inicio de sesión requiere secretos e infraestructura nuevos; los reportes aún no tienen municipio. |
| 17 | Sin cambios en Terraform. `alerta_emails` va en `terraform.tfvars` (ignorado por git). | `terraform plan` sin diferencias; los correos no deben publicarse en el repo. |
| 18 | Dependencias nuevas solo de desarrollo: `@types/node` 24, `@nestjs/testing`, `supertest`, `@types/supertest`; JUnit en Android. | Necesarias para las pruebas; no van en la imagen de producción. |
| 19 | No se fusiona el PR desde esta sesión. | Fusionar despliega a producción; requiere aprobación explícita. |
| 20 | `.idea/` fuera del repositorio. | Configuración local de cada integrante. |
| 21 | La bandeja de la app carga la primera página (50) y muestra el total. | Suficiente para la demo; la paginación infinita queda pendiente. |

## 8. Despliegue en AWS (verificado el 9-oct-2026)

Solo se registra lo que se comprobó con comandos de lectura o con `curl` contra producción. Cuenta del proyecto confirmada con `aws sts get-caller-identity` antes de operar; solo se tocaron recursos con `Project=RIETI` y prefijo `rieti`.

| # | Qué | Evidencia |
|---|---|---|
| 1 | Snapshot manual previo al despliegue `rieti-pre-merge-2026-10-09` | Estado `available`, manual, cifrado, 20 GB, etiqueta `Project=RIETI` |
| 2 | Despliegue de `main` | Workflow Backend #8 en verde (reportado por Bowser). ECS `rieti-prod-api` en la revisión 4, con la imagen del commit `fad16aa` (= `main`), 1/1 tareas, 0 fallidas, despliegue `COMPLETED` |
| 3 | Salud | `GET /health` → 200 `{"estado":"ok"}`; `GET /health/ready` → 200 `{"estado":"ok","bd":"ok"}` |
| 4 | API `/api/v1` y formato de error | `/catalogos` y `/avisos-privacidad/vigente` → 200. Sin token: `GET /reportes`, `GET /reportes/1` y `PATCH /reportes/1/estatus` → `401 {"codigo":"NO_AUTENTICADO",…}`. Campo no permitido → `400 SOLICITUD_INVALIDA` con `detalle`. La ruta vieja `/reportes/folio/:folio` → 404 |
| 5 | Cabeceras de seguridad | HSTS, CSP, `X-Content-Type-Options` y `X-Frame-Options` presentes |
| 6 | ALB no accesible desde internet | Esquema `internal`; su DNS resuelve a una IP privada de la VPC; `curl` directo sin respuesta |
| 7 | Migración `ClaveConsultaYEstatus` aplicada | Evidencia por datos: la consulta pública lee `reporte.clave_consulta_hash` sin error y un reporte nuevo se guardó con su hash. TypeORM no escribe las migraciones en el log, así que no hay evidencia en CloudWatch |
| 8 | Reporte anónimo | `POST /api/v1/reportes` → 201 con folio `RIETI-2026-000002` y clave `XXXX-XXXX-XXXX`; respuesta solo con `folio`, `claveConsulta`, `estatus`, `fechaCreacion`. Datos ficticios marcados "PRUEBA AUTOMATIZADA" |
| 9 | Consulta por POST | Folio + clave correctos → 200, estatus `Recibido` e historial de 1 evento, sin descripción ni ubicación; en minúsculas → 200; clave incorrecta → `404 FOLIO_O_CLAVE_INCORRECTOS` |
| 10 | Límite de tasa | El sexto `POST /api/v1/reportes` en un minuto desde la misma IP → `429 DEMASIADOS_INTENTOS` |
| 11 | Usuario de personal | Creado en Cognito sin invitación, con contraseña permanente (no se imprimió ni se guardó) y solo en el grupo `PersonalSIPINNA`; estado `CONFIRMED`, sin MFA. La fila en `usuario` se crea en el primer login |
| 12 | URL de la app | `api_url` de Terraform = `API_URL` por defecto de la app = `https://d3hexe1fo0mq6l.cloudfront.net/` |

**Incidentes durante el despliegue:**
- El job de Android fallaba con `./gradlew: Permission denied`: `gradlew` (y `infra/bootstrap.sh`) estaban versionados sin permiso de ejecución. Corregido en `5083af2`.
- El primer despliegue falló con 429 de Docker Hub al bajar `node:24-alpine`. La imagen base ahora sale de ECR Public y se quitó la directiva `syntax` del Dockerfile (rama `fix/imagen-base-ecr-public`, fusionada). El job e2e sigue bajando `postgis/postgis` de Docker Hub.

**Observación menor:** para rutas inexistentes, el 404 conserva el texto de Express en inglés ("Cannot GET …"), aunque con el formato `{codigo, mensaje}`.

## 9. Web, municipios, red y permisos (verificado en local el 9-oct-2026; desplegado después, ver sección 10)

Lo de esta sección se probó en una máquina de desarrollo con PostgreSQL 16 + PostGIS 3.6 locales.

| Qué | Evidencia |
|---|---|
| Catálogo de 125 municipios (D-16) | Fuente: INEGI, servicio `wscatgeo/v2/mgem/15` (numReg 125). Pruebas: 125 claves 15001–15125 sin repetir; Atizapán de Zaragoza = 15013 (≠ Atizapán, 15012) |
| Migración `MunicipiosYRed` segura con datos | Prueba e2e sobre una base con usuario, reporte y bitácora: se aplica sin tocarlos, conserva el `id` de Atizapán, es idempotente y se revierte |
| `municipioId` opcional en `POST /reportes` | e2e: sin municipio → 201; municipio válido → se guarda; inexistente → 400 |
| Matriz de permisos (D-18) | Prueba que compara cada ruta con la matriz esperada + e2e (401/403/200 por perfil). Ver `docs/seguridad/roles-y-permisos.md` |
| Red de municipios (D-17) | e2e: solo datos `example.org` con `es_ejemplo`; el enlace no puede editar (403); el administrador sí |
| Estadísticas solo agregadas | e2e: sin folios ni textos; sumas coinciden; filtros de fecha y municipio |
| Pruebas del backend | 53 unitarias; e2e 52/52 con usuario maestro (1 omitida por modo) y 53/53 conectado como `rieti_app`; 3 de la migración con datos |
| Web | Tipos sin errores, 22 pruebas (combobox con teclado, validación, gráficas sin estilos en línea, 911/089 y logos con alt en todas las páginas públicas) |
| CSP estricta en navegador real | Chrome con la web compilada servida por el backend local: 16 pantallas (pública en móvil y personal en escritorio, gráficas incluidas), **0 violaciones de CSP, 0 errores de consola, 0 peticiones a otros orígenes** |
| Imagen Docker con la web | **No verificada en local** (no hay Docker); el job `imagen` del PR la construye |

## 10. Estado al congelamiento (10-oct-2026)

Fuente de cada dato: **[yo]** = comprobado en esta sesión con comandos o pruebas; **[Bowser]** = prueba manual reportada por Bowser; **[CI]** = resultado de GitHub Actions consultado con la API pública de GitHub.

### En producción (`main`)

| Tema | Estado | Evidencia |
|---|---|---|
| Web pública y del personal servida por el backend | En producción | [yo] `GET /` → 200 HTML con CSP `'self'`; [Bowser] web probada en producción y funcionando |
| Panel de estadísticas | En producción | [yo] Chrome real en local: tarjetas, barras, serie mensual y tablas alternativas, 0 violaciones de CSP; [Bowser] web en producción |
| 125 municipios (D-16) | En producción | [yo] `GET /api/v1/catalogos/municipios` → 125 con claves únicas; Atizapán de Zaragoza = 15013 con su `id` original |
| Red de municipios (D-17) | En producción, **solo datos de ejemplo** | [yo] `GET /api/v1/red-municipios` → 200, contactos `example.org`, `hayDatosDeEjemplo: true` |
| Roles y permisos (D-18) | En producción | [yo] matriz en código + pruebas (`docs/seguridad/roles-y-permisos.md`); [yo] `GET /api/v1/auth/perfil` sin token → 401 |
| Migración `MunicipiosYRed` | Aplicada | [yo] respuestas del API que dependen de sus columnas y tabla; prueba e2e sobre base con datos (local) |
| Android: logos, selector de municipio con búsqueda, tokens, estatus con icono | En `main` (PR #6) | [yo] emulador aparte: inicio, aviso, formulario, búsqueda y selección de municipio; [Bowser] app nueva probada |
| Android: ícono adaptativo (opción A) | En `main` | [yo] 0 píxeles fuera de la zona segura en 5 densidades; vista previa círculo/squircle/cuadrado sin cortes; launcher de emulador |
| CI | En verde | [CI] merge de la web: test, e2e (maestro y rieti_app), imagen, build (web y Android), gitleaks y **deploy** en éxito; PR #6 e ícono: build y gitleaks en éxito |

### Pendiente de fusionar

| Cambio | Estado | Evidencia |
|---|---|---|
| `municipioId` obligatorio en `POST /reportes` (rama `feat/municipio-obligatorio`) | PR por abrir/revisar | [yo] local: 53 unitarias; e2e 56/56 (maestro) y 57/57 (`rieti_app`); sin municipio → 400 "Elige el municipio donde ocurre"; 23 pruebas de web incluida A6 (XSS) |

### Limitaciones conocidas

- **Evidencias fotográficas: no implementadas.** El bucket S3 privado y cifrado existe (Terraform) y el rol de la tarea tiene permiso de escritura, pero **no hay endpoint ni código de carga** (A7, A8 y A14 sin funcionalidad que proteger).
- **Reporte con datos de contacto: no disponible** (solo anónimo); requiere cifrado a nivel aplicación.
- **Coordinador y filtro por municipio del enlace: planeados**; hoy el enlace municipal ve los reportes de todos los municipios. Sin RLS.
- **API con el usuario maestro de la BD**: el rol `rieti_app` está preparado y probado en local, **no aplicado** en AWS.
- **MFA no obligatorio**; el personal usa contraseña permanente (sin Hosted UI).
- **Red de municipios con datos de ejemplo**; los contactos oficiales los debe entregar la institución. La edición es solo por API (no hay pantalla en la web).
- **Aviso de privacidad en borrador** (falta validación jurídica).
- **Android**: TalkBack no se probó; R8 no está activado; el token del personal vive en memoria.
- **Sin prueba de carga ni escaneo OWASP ZAP**; sin Dependabot.
- **TLS mínimo no endurecible** con el dominio `*.cloudfront.net`.
- Al fusionar `municipio-obligatorio`, las APK anteriores al PR #6 ya no podrán enviar reportes.
- Reportes de prueba en producción: `RIETI-2026-000001`, `000002` y `000004` (ficticios, marcados "PRUEBA AUTOMATIZADA" los dos últimos) y `000003` (origen no verificado). Se pueden retirar con el paso 3 del runbook.

