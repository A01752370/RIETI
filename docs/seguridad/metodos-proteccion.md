# Métodos de protección — RIETI

> Etapa 3 · Fecha de corte: 10-oct-2026 · Rama `integracion-final`.
> Cada control indica **dónde vive** y **cómo se verificó**. Lo que no está implementado aparece en la sección [Planeado](#planeado) y no se presenta como hecho.

## Cómo se verificó

| Verificación | Resultado (10-oct-2026) |
|---|---|
| Pruebas unitarias del backend (`npm test`) | 45 pruebas, 8 suites, todas pasan |
| Pruebas e2e del backend contra PostgreSQL 16 + PostGIS 3.6 reales (`npm run test:e2e`) | 35 pasan con el usuario maestro (1 se omite: es exclusiva del modo `rieti_app`); 36 de 36 pasan conectado como `rieti_app` |
| Pruebas JVM de Android (`./gradlew testDebugUnitTest`) | 10 pruebas, todas pasan |
| Lint de Android (`./gradlew lintDebug`) | 0 errores; 15 advertencias, todas de versiones de dependencias |
| `gitleaks` sobre todo el historial | Sin hallazgos |
| `terraform plan` (solo lectura) | Sin diferencias entre el código y AWS |
| Cabeceras de seguridad en producción (`curl -I`) | HSTS, CSP, `X-Content-Type-Options`, `X-Frame-Options` presentes |

Las pruebas e2e corrieron en una máquina de desarrollo con PostgreSQL local. **El código de esta rama todavía no está desplegado en AWS**: se despliega al fusionar el PR (ver [RUNBOOK-AWS](../RUNBOOK-AWS.md)).

## Controles implementados

### Autenticación y autorización

| Control | Dónde | Mitiga | Verificación |
|---|---|---|---|
| Guard global que **deniega por defecto**; rutas públicas marcadas con `@Publico()` | `backend/src/auth/jwt.guard.ts`, `roles.ts` | A2 | e2e A2; `rutas-protegidas.spec.ts` (inventario cerrado de rutas públicas) |
| Validación del JWT de Cognito: firma (JWKS), emisor, `client_id`, `token_use`, expiración | `jwt.guard.ts` (`aws-jwt-verify`) | A11 | `jwt-falsificado.spec.ts` |
| RBAC por grupos de Cognito (`Administrador`, `PersonalSIPINNA`) | `@Roles(...)` en `reportes.controller.ts` | A4 | e2e A4 |
| El usuario debe existir y estar activo en la tabla `usuario` en cada petición | `jwt.guard.ts` | A4 (bajas inmediatas) | e2e "usuario desactivado → 403" |
| Contraseñas solo en Cognito (política ≥12 caracteres con mayúscula, número y símbolo; alta solo por administrador) | `infra/terraform/cognito.tf` | A10 | Configuración (Terraform, sin diferencias) |
| Login con límite de 5 intentos por minuto por IP y códigos de error que no revelan si la cuenta existe | `auth.controller.ts`, `auth.service.ts` | A10 | `auth.service.spec.ts` |

### Protección de la consulta ciudadana

| Control | Dónde | Mitiga | Verificación |
|---|---|---|---|
| Clave de consulta aleatoria `XXXX-XXXX-XXXX` (31 símbolos, ~59 bits, `crypto.randomInt`) | `backend/src/reportes/clave-consulta.ts` | A1 | `clave-consulta.spec.ts` |
| Solo se guarda el hash **Argon2id** (m=19 MiB, t=2, p=1, sal aleatoria) en formato PHC | `clave-consulta.ts`, columna `reporte.clave_consulta_hash` | A1 (aun con la BD filtrada) | `clave-consulta.spec.ts`; e2e "en la BD solo queda el hash" |
| Consulta por **POST** (la clave no queda en URLs ni logs de acceso) | `reportes.controller.ts` | A1, A15 | e2e |
| Respuesta uniforme si el folio no existe o la clave es incorrecta, con hash señuelo para igualar tiempos | `reportes.service.ts` (`consultar`) | A1 | e2e "misma respuesta" |
| Bloqueo del folio tras 5 fallos en 15 min (sin guardar IP) | `limitador-intentos.ts` | A1 | `limitador-intentos.spec.ts`; e2e |
| La consulta solo devuelve estatus y fechas; nunca descripción, ubicación ni notas internas | `lineaDeTiempoPublica` en `reportes.service.ts` | Minimización (RF-38) | e2e "no ve los comentarios internos" |

### Validación de entrada y base de datos

| Control | Dónde | Mitiga | Verificación |
|---|---|---|---|
| `ValidationPipe` con `whitelist` + `forbidNonWhitelisted` + DTOs con tipos, largos y catálogos | `configurar-app.ts`, `reporte.dto.ts` | A5, A16 | e2e "rechaza campos no permitidos", "valores fuera de catálogo", "folio con inyección SQL" |
| Consultas SQL parametrizadas (TypeORM y `$1…$n`), nunca concatenadas | `reportes.service.ts` | A5 | Revisión de código; e2e |
| Máquina de estados de la Etapa 1 (transiciones válidas; Descartado exige motivo) | `backend/src/reportes/estatus.ts` | Integridad del proceso | `estatus.spec.ts`; e2e 422 |
| Bitácora `seguimiento` solo de inserción (trigger que rechaza UPDATE/DELETE) | migración `1760000000000-EsquemaInicial.ts` | A21 | e2e "A21" |
| Esquema solo por migraciones (`synchronize: false`) | `typeorm.config.ts` | Cambios no controlados | Revisión de código |
| TLS obligatorio hacia RDS con verificación del certificado (`rds.force_ssl=1`, CA de AWS en la imagen) | `typeorm.config.ts`, `rds.tf`, `Dockerfile` | A12 interno | Configuración |
| Formato único de error; los errores internos nunca devuelven detalles | `backend/src/comun/filtro-errores.ts` | A15 | `filtro-errores.spec.ts` |

### Abuso y disponibilidad

| Control | Dónde | Mitiga | Verificación |
|---|---|---|---|
| Límite de tasa por IP: 120/min general, 5/min reportes, 10/min consultas, 5/min login | `app.module.ts`, decoradores `@Throttle` | A9, A10, A22 | e2e "A9: el sexto reporte en un minuto recibe 429" |
| Cuerpo JSON máximo de 16 KB | `configurar-app.ts` | A22 | e2e "A22: rechaza cuerpos de más de 16 KB" |
| Paginación obligatoria (máximo 100 por página) | `ListarReportesDto` | A22 | e2e |
| WAF: límite de 300 solicitudes por IP cada 5 min, reglas administradas de AWS (reputación de IP, Common, Known Bad Inputs, SQLi) | `infra/terraform/cloudfront.tf` | A5, A9, A22 | Configuración |

### Web (pública y del personal)

| Control | Dónde | Mitiga | Verificación |
|---|---|---|---|
| CSP estricta: solo `'self'`, sin `unsafe-inline` ni orígenes externos; `frame-ancestors 'none'` | `backend/src/configurar-app.ts` (`DIRECTIVAS_CSP`) | A6, A12 | e2e "CSP estricta"; Chrome real con la web compilada: 16 pantallas, 0 violaciones, 0 peticiones externas (local); cabecera presente en producción (`curl -I`) |
| React escapa todo el texto; no se usa `dangerouslySetInnerHTML` ni `innerHTML` | `web/src` | A6 | `web/src/web.test.tsx` "A6": una descripción con `<script>` e `<img onerror>` se muestra como texto, sin crear elementos |
| Sin CDN, fuentes externas ni analítica; gráficas SVG propias | `web/` | A16, A20 | Recorrido en Chrome: 0 orígenes externos |
| Sesión del personal solo en memoria (no `localStorage` ni cookies) | `web/src/api.ts` | A17 | Revisión de código |
| Matriz de permisos única (`MATRIZ_PERMISOS` + `@Requiere`) | `backend/src/auth/roles.ts` | A4 | `rutas-protegidas.spec.ts` compara cada ruta con la matriz; e2e por perfil (ver `roles-y-permisos.md`) |

### Perímetro y transporte

| Control | Dónde | Mitiga | Verificación |
|---|---|---|---|
| HTTPS obligatorio en CloudFront (`https-only`), HTTP/2 y HTTP/3 | `cloudfront.tf` | A12 | Configuración |
| Cabeceras HSTS, CSP, `X-Content-Type-Options`, `X-Frame-Options` (helmet + política de CloudFront) | `configurar-app.ts`, `cloudfront.tf` | A12 | `curl -I` contra producción |
| ALB **interno** (sin IP pública); solo lo alcanza CloudFront por *VPC origin*; SG limitado a la lista de prefijos de CloudFront | `alb.tf`, `security.tf` | A13 | Configuración; `terraform plan` sin diferencias |
| Grupos de seguridad encadenados CloudFront → ALB → API → RDS; RDS sin salida ni IP pública | `security.tf`, `rds.tf` | Movimiento lateral | Configuración |

### Datos en reposo y secretos

| Control | Dónde | Mitiga | Verificación |
|---|---|---|---|
| RDS, S3, logs y secreto de BD cifrados con una CMK de KMS | `kms.tf`, `rds.tf`, `s3.tf` | Robo de discos o respaldos | Configuración |
| Contraseña de RDS generada y rotada por RDS en Secrets Manager; la API la lee en tiempo de ejecución | `rds.tf`, `db-password.ts` | A19 | Configuración |
| Bucket de evidencias privado (*Block Public Access*), cifrado, versionado | `s3.tf` | A14 | Configuración |
| CI/CD con OIDC GitHub → AWS (sin llaves estáticas en GitHub) | `github.tf`, `backend.yml` | A19 | Configuración |
| `.gitignore` de secretos (`.env`, `*.tfvars`, `*.tfstate`, llaves) y `gitleaks` en CI sobre todo el historial | `.gitignore`, `seguridad.yml` | A19 | `gitleaks`: sin hallazgos |

### Privacidad por diseño

| Control | Dónde | Mitiga | Verificación |
|---|---|---|---|
| Sin columnas de IP, dispositivo ni publicidad; el API rechaza campos extra | Esquema, DTOs | A16 | e2e |
| La ubicación GPS es opcional, se pide con un botón y se envía como **lugar de los hechos**; no se guarda en el teléfono | `FormularioReporteScreen.kt`, `FormularioReporteViewModel.kt` | A23 (RNF-28) | Revisión de código |
| Se eliminó el mapa estático de un servicio externo, que enviaba coordenadas del reporte a un tercero | `app/` (se quitó Coil) | A16, A23 | Revisión de código |
| Aviso de privacidad obligatorio; la versión aceptada se guarda con el reporte | `aviso-privacidad.ts`, `AvisoPrivacidadScreen.kt` | RF-44 | e2e "exige aceptar el aviso vigente" |
| Logs sin datos sensibles: OkHttp sin cuerpos (`BASIC` en debug, nada en release); pgAudit sin parámetros | `ServicioRemoto.kt`, `rds.tf` | A15 | Revisión de código |

### App Android

| Control | Dónde | Mitiga | Verificación |
|---|---|---|---|
| Sin tráfico HTTP en release; en debug solo hacia `10.0.2.2` | `AndroidManifest.xml`, `src/debug/res/xml/network_security_config.xml` | A12 | Manifiesto combinado de release (`usesCleartextTraffic="false"`) |
| Token de sesión solo en memoria; nunca en disco | `ServicioRemoto.kt`, `SesionRepositorio.kt` | A17 | Revisión de código |
| `allowBackup="false"` y reglas de extracción que excluyen todo (Android 12+) | `AndroidManifest.xml`, `res/xml/data_extraction_rules.xml` | A17 | Lint sin advertencia `DataExtractionRules` |
| `FLAG_SECURE` en release (sin capturas ni vista previa en "recientes") | `MainActivity.kt` | A17 | Revisión de código |
| Folio y clave no se guardan en el teléfono; la persona decide si copiarlos | `ConfirmacionScreen.kt` | A17 | Revisión de código |
| La APK no contiene secretos (solo la URL pública del API) | `app/build.gradle.kts` | A18 | Revisión de código |

## Planeado

Estos controles **no están implementados**. Están ordenados por prioridad.

| Control | Mitiga | Qué falta |
|---|---|---|
| API conectada con el rol `rieti_app` de mínimo privilegio (D-08) | A5, A21 | El script `infra/sql/01-rol-rieti-app.sql` está **preparado y probado en local** (las 36 pruebas e2e pasan conectadas con ese rol). Falta crear su credencial en Secrets Manager (o activar la autenticación IAM de RDS), cambiar la task definition y correr las migraciones con el usuario maestro (`DB_MIGRAR_AL_INICIAR=false`). |
| Row Level Security por municipio | A3 | Requiere que el reporte guarde municipio (D-14) y `SET LOCAL` del municipio del usuario en cada transacción. |
| MFA TOTP obligatorio con Cognito Hosted UI + PKCE (D-06) | A10 | Hoy el MFA es opcional y la app no soporta el reto, por lo que las cuentas se crean con contraseña permanente. |
| Ofuscación R8 en release | A18 | Requiere reglas `keep` para los modelos de Gson y una prueba de la APK minificada. |
| Logs de WAF con IP enmascarada o retención mínima | A16 | Hoy no hay logs de WAF; solo las muestras de AWS (3 h). |
| Dependabot y escaneo de la imagen (Trivy) | A20 | Hoy: `npm audit --omit=dev --audit-level=high` en CI y escaneo de ECR al subir la imagen. |
| Prueba de carga y escaneo OWASP ZAP contra producción | A22 | Requiere autorización del responsable de la cuenta AWS. |
| Dominio propio + ACM para fijar TLS 1.2+ mínimo | A12 | Con el certificado `*.cloudfront.net` no se puede endurecer la versión mínima de TLS. |
| Evidencias fotográficas con URL prefirmada, EXIF eliminado y SHA-256 | A7, A8, A14 | No hay endpoint de subida. |
