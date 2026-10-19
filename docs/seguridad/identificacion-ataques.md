# Identificación de ataques — RIETI

> Etapa 3 · Fecha de corte: 10-oct-2026, actualizado al cierre de la Fase 8 (A3, A7, A8 y A14 mitigados; A38–A41).
> Complemento: [métodos de protección](metodos-proteccion.md) (qué control mitiga cada ataque, dónde está en el código y cómo se probó).

RIETI recibe reportes sobre **niñas, niños y adolescentes en posible situación de trabajo infantil**. Un incidente no solo expone datos: puede poner en riesgo a un menor o a la persona que reporta. Por eso el análisis prioriza la confidencialidad del reporte y el anonimato del denunciante por encima de la disponibilidad.

## 1. Activos y actores

| Activo | Por qué importa |
|---|---|
| Contenido del reporte (lugar, descripción, edad, actividad) | Permite ubicar a un menor en situación vulnerable. |
| Identidad del denunciante | El reporte es anónimo; reidentificarlo puede exponerlo a represalias. |
| Bitácora de seguimiento | Es la evidencia de lo que hizo el SIPINNA con cada caso. |
| Cuentas del personal SIPINNA | Dan acceso a todos los reportes. |
| Credenciales de infraestructura (AWS, GitHub) | Dan control total del sistema. |

| Actor | Motivación |
|---|---|
| Explotador o red de explotación | Saber quién reportó, ubicar a los menores, borrar o alterar reportes. |
| Curioso / acosador | Leer reportes ajenos enumerando folios. |
| Atacante oportunista (bots) | Spam, fuerza bruta, inyección, abuso de recursos. |
| Usuario interno | Ver o cambiar casos fuera de su rol. |

## 2. Superficie de ataque

```
Internet ──► CloudFront + WAF ──► ALB interno ──► API NestJS (ECS) ──► PostgreSQL (RDS)
   ▲                                                   │
   │                                                   └──► Cognito (login), Secrets Manager
App Android (teléfono del ciudadano o del personal)
Repositorio público en GitHub · Pipeline de CI/CD
```

Rutas públicas del API (inventario verificado por la prueba `backend/test/rutas-protegidas.spec.ts`):
`GET /health`, `GET /health/ready`, `POST /api/v1/reportes`, `POST /api/v1/reportes/consulta`, `POST /api/v1/auth/login`, `GET /api/v1/avisos-privacidad/vigente`, `GET /api/v1/catalogos`. Todo lo demás exige JWT de personal.

## 3. Catálogo de ataques

Estado: **Mitigado (probado)** = hay control y prueba automatizada · **Mitigado (configuración)** = control en código/infraestructura verificado por revisión o consulta de solo lectura, sin prueba de ataque · **Parcial** = el control existe pero tiene huecos conocidos · **Planeado** = no implementado · **No aplica aún** = la funcionalidad atacable no existe todavía.

| # | Ataque | Vector | Impacto | Estado |
|---|---|---|---|---|
| A1 | Enumeración de folios / IDOR | Probar folios secuenciales `RIETI-2026-000001…` en la consulta pública | Leer el estatus de reportes ajenos | Mitigado (probado) |
| A2 | Acceso sin autenticación a la bandeja | Llamar `GET/PATCH /reportes` sin token | Leer y alterar todos los reportes | Mitigado (probado) |
| A3 | Escalamiento horizontal entre municipios | Un enlace del municipio A pide reportes del municipio B (por id, filtro, exportación, estadísticas, mapa o alertas) | Fuga entre municipios | Mitigado (probado; Fase 7): filtro en el servicio y 404 uniforme. RLS en PostgreSQL queda como defensa adicional planeada |
| A4 | Escalamiento vertical | Una cuenta sin rol de personal llama rutas del personal | Acceso indebido | Mitigado (probado) |
| A5 | Inyección SQL | Payloads en folio, filtros o campos de texto | Lectura/borrado de la BD | Mitigado (probado) |
| A6 | XSS almacenado | `<script>` en la descripción, visto luego por el personal | Robo de sesión del personal | Mitigado (probado): React escapa el texto, sin `dangerouslySetInnerHTML`, CSP sin `unsafe-inline` |
| A7 | Subida de archivos maliciosos | Evidencias con malware, archivos con extensión falsa, imágenes dañadas o enormes | Malware, ejecución en el visor del personal, costo | Mitigado (probado; Fase 8): tipo real por contenido (solo JPEG/PNG/WebP), re-codificación en el servidor, límite de píxeles, 5 MB y 3 fotos por reporte en 24 h, folio + clave obligatorios, zona de entrada separada que expira en 1 día |
| A8 | Fuga de metadatos EXIF | Foto con GPS del teléfono del denunciante | Reidentificación | Mitigado (probado; Fase 8): el servidor re-codifica sin EXIF/GPS/XMP/ICC y la app y la web también quitan metadatos antes de subir; la captura de la cámara se borra del teléfono al prepararla |
| A9 | Spam / reportes falsos masivos | Scripts que envían miles de reportes | Saturar al personal, costo | Mitigado (probado) |
| A10 | Fuerza bruta al login | Diccionarios contra `/auth/login` | Tomar una cuenta del personal | Parcial (límite de tasa y bloqueo de Cognito; MFA no obligatorio) |
| A11 | JWT manipulado | `alg:none`, firma inventada, token de otro pool | Suplantar al personal | Mitigado (probado) |
| A12 | Intermediario (MITM) | Wi-Fi pública, proxy malicioso | Leer o alterar reportes en tránsito | Mitigado (configuración) |
| A13 | Saltarse el WAF yendo directo al ALB | Llamar al balanceador sin pasar por CloudFront | Evadir límites y reglas | Mitigado (configuración) |
| A14 | Exposición de evidencias en S3 | Bucket público o listable, URL de lectura reenviada | Fuga masiva o de una foto | Mitigado (configuración + probado; Fase 8): bloqueo de acceso público, cifrado KMS, solo TLS, CORS solo POST desde la web, lectura con URL prefirmada de 60 s solo para el personal con alcance sobre el municipio y registrada en la bitácora |
| A15 | Fuga de datos sensibles en logs | Cuerpos de petición, contraseñas o claves en logs | Fuga silenciosa | Mitigado (configuración) |
| A16 | Reidentificación del denunciante | IP, ID de dispositivo o ID de publicidad guardados con el reporte | Exponer a quien reporta | Parcial (nada en la BD; muestras del WAF con IP por 3 h) |
| A17 | Datos en el teléfono | Respaldo en la nube, capturas, archivos de la app | Fuga desde el dispositivo | Mitigado (configuración) |
| A18 | Ingeniería inversa de la APK | Decompilar para buscar secretos | Obtener llaves | Parcial (sin secretos en la APK; R8 no activado) |
| A19 | Secretos en el repositorio público | Llaves o tokens en el historial | Control de la infraestructura | Mitigado (probado) + pendiente de rotación (D-10) |
| A20 | Cadena de suministro | Dependencias con vulnerabilidades | Ejecución de código | Parcial |
| A21 | Alterar la bitácora | `UPDATE/DELETE` sobre `seguimiento` | Borrar evidencia | Mitigado (probado) |
| A22 | Denegación de servicio | Cuerpos enormes, ráfagas, listados gigantes | Caída del servicio | Parcial (probado a nivel app; sin prueba de carga) |
| A23 | Rastreo del denunciante por ubicación | Guardar la ubicación del teléfono como dato de quien reporta | Ubicar a quien reporta | Mitigado (configuración) |
| A25 | Lectura del portapapeles | Otra app o la vista previa del sistema muestran la clave copiada | Consultar el estatus de un reporte ajeno | Mitigado (configuración): se copia solo el valor y marcado como sensible (sin vista previa en Android 13+). Riesgo residual: apps con acceso al portapapeles en versiones anteriores; la consulta solo revela estatus y fechas |
| A26 | Fuga de la ubicación a un tercero | El proveedor del mapa recibe la IP del teléfono y la zona del reporte | Reidentificar a quien reporta | Mitigado (diseño): teselas y geocodificación pasan por el backend; el proveedor solo ve la IP del servidor y coordenadas redondeadas a ≈ 11 m. Riesgo residual: OSM ve la zona aproximada de los reportes |
| A27 | Abuso del proxy de mapas | Usar `/geo/teselas` o `/geo/reversa` para descargar mapas o geocodificar masivamente a nombre de RIETI | Costo, bloqueo de RIETI por el proveedor, DoS | Mitigado (probado): solo Estado de México, zoom 8–18, límite por IP (600 y 30/min) y WAF, caché, máx. 4 descargas simultáneas y 1 req/s a Nominatim con cola corta (503 si se llena) |
| A28 | Direcciones o ubicaciones falsas | Reportar un punto o CP que no corresponde al municipio | Ruido y desgaste del personal | Parcial (probado): el punto debe caer en el municipio (±300 m, polígonos INEGI) y el CP debe ser del Estado de México; con el catálogo SEPOMEX cargado, del municipio. No elimina direcciones inventadas dentro del municipio correcto |
| A29 | Extracción masiva por exportación | Una cuenta del personal (o una sesión robada) descarga toda la bandeja en CSV | Fuga de reportes | Mitigado (probado): permiso propio `reportes.exportar`, 10 por minuto, máximo 5,000 filas y solo columnas de la bandeja (sin descripción libre, sin coordenadas, solo colonia) |
| A30 | Inyección de fórmulas en el CSV | Un ciudadano escribe `=HYPERLINK(...)` en un campo; el personal abre el CSV en Excel | Ejecución de fórmulas o fuga desde la hoja de cálculo | Mitigado (probado): toda celda que empieza con `=`, `+`, `-`, `@`, tabulador o retorno se antepone con apóstrofo |
| A31 | Reidentificación por agregados | Cruzar el mapa de calor o conteos muy pequeños (1 reporte en una zona/actividad) para ubicar un caso | Exponer a un menor o a quien reporta | Mitigado (probado): celdas y conteos menores que el umbral (3) se ocultan; el mapa usa centros de celdas de ≈ 550 m, nunca coordenadas |
| A32 | Enumeración de cuentas de ciudadano | Registrar, reenviar código o pedir "olvidé mi contraseña" con correos ajenos y comparar respuestas | Saber si una persona usa RIETI (dato sensible por sí mismo) | Mitigado (probado): las tres rutas responden lo mismo exista o no la cuenta; el login no distingue "no existe" de "contraseña incorrecta" (`prevent_user_existence_errors`) |
| A33 | Fuerza bruta o relleno de credenciales en el login de ciudadano | Probar contraseñas filtradas contra `POST /ciudadanos/login` | Tomar una cuenta y ver sus reportes vinculados | Mitigado (probado + configuración): 5 intentos/min por IP en el API, bloqueo progresivo de Cognito (→ 429), WAF 300 req/5 min por IP, contraseña ≥ 12 con mayúscula, minúscula y número. Sin MFA (ver detalle) |
| A34 | Robo del refresh token o secuestro de sesión | Extraer el token del teléfono (respaldo, root) o reutilizar uno filtrado | Acceso persistente a "Mi panel" | Mitigado (configuración): refresh token cifrado con una llave AES-GCM del Android Keystore que no sale del equipo; access token solo en memoria (60 min); sin respaldos; "Cerrar sesión en todos mis dispositivos" revoca los tokens (`GlobalSignOut`); refresh de 30 días |
| A35 | Correlación de un reporte anónimo con una cuenta | Que la app envíe el token "por si acaso" o que el personal vea quién reportó | Romper el anonimato de quien no quiso vincular | Mitigado (probado): sin el interruptor el reporte no lleva token ni `vincularCuenta`, y si llega un token se ignora; el personal nunca ve la cuenta vinculada ni el correo; RIETI no guarda el correo (solo el `sub`) |
| A36 | Abuso del registro (correo masivo, cuentas basura) | Registrar muchos correos ajenos para que reciban códigos | Molestia a terceros, agotar la cuota diaria de correo de Cognito | Parcial: 5 registros y 3 reenvíos por minuto por IP, más el WAF. Sin CAPTCHA; la cuota baja del correo por defecto de Cognito limita el daño pero también bloquearía registros legítimos (ver nota de SES en `docs/arquitectura/aws.md`) |
| A37 | Uso cruzado de tokens entre pools | Mandar un token de ciudadano a rutas del personal, o uno del personal a `/ciudadano/*` | Escalar privilegios | Mitigado (probado): dos verificadores con emisor y `client_id` distintos; cada ruta acepta un solo tipo de token (`rutas-protegidas.spec.ts` y e2e "separación estricta") |
| A38 | Consulta abusiva de expedientes por personal autorizado | Una cuenta del personal (o una sesión robada) abre expedientes o exporta sin necesidad | Fuga interna de datos de NNA | Mitigado (probado; Fase 7): alcance por municipio, bitácora de accesos append-only (`ver`, `exportar`) que solo consulta el Administrador |
| A39 | Fusión o borrado indebido por "duplicado" | Marcar como duplicado para ocultar o borrar un reporte | Pérdida de un caso real | Mitigado (probado; Fase 7): el vínculo no borra ni fusiona, es reversible, se limita al mismo municipio y queda en la bitácora de ambos reportes |
| A40 | Manipulación de parámetros de alertas y duplicados | Poner un radio enorme o un mínimo de 1 para inundar de alertas, o 0 para ocultarlas | Ruido o ceguera operativa | Mitigado (probado; Fase 7): solo el Administrador, claves cerradas y límites validados en el servidor (p. ej. radio 25–1000 m, mínimo 2–50) |
| A41 | Abuso del almacenamiento de fotos | Pedir formularios de subida en masa o subir archivos de relleno para generar costo | Costo, ruido | Mitigado (probado; Fase 8): requiere folio + clave válidos (bloqueo tras 5 fallos), 10 solicitudes/min por IP, máximo 3 fotos por reporte en 24 h, 5 MB por formulario (lo impone S3) y las subidas sin confirmar expiran en 1 día |
| A24 | Reconocimiento con la documentación pública | Leer en el repo público el ID de la cuenta de AWS, alias de llaves o la postura de IAM para preparar ataques dirigidos (phishing, *bucket squatting*, abuso de llaves filtradas) | Facilitar otros ataques | Mitigado (revisión del árbol): el ID de cuenta salió de `versions.tf` (va en `backend.hcl`, ignorado por git) y la auditoría de cuenta ya no publica alias de llaves ni detalles de IAM. El historial anterior conserva el nombre del bucket de estado |

## 4. Detalle de los ataques principales

### A1 — Enumeración de folios
**Escenario.** Los folios son secuenciales (`RIETI-2026-000001`, `…000002`). Hasta esta entrega existía `GET /reportes/folio/:folio`, pública y sin clave: cualquiera podía recorrer folios y conocer actividad, edad y estatus de todos los reportes (se verificó el 10-oct-2026 contra producción con el reporte de prueba).
**Qué se hizo.** Se retiró esa ruta. La consulta ahora es `POST /api/v1/reportes/consulta` con folio **y** una clave aleatoria de ~59 bits que solo conoce quien reportó. Respuesta idéntica si el folio no existe o la clave es incorrecta, y bloqueo del folio tras 5 fallos en 15 minutos.
**Evidencia.** `backend/test/e2e/api.e2e.spec.ts` → "A1: clave incorrecta y folio inexistente dan la misma respuesta" y "A1: tras 5 fallos el folio se bloquea aunque cambie la IP".

### A2 / A4 — Acceso sin autenticación o sin rol
**Escenario.** Llamar a la bandeja sin token, o con el token de una cuenta que no es del personal.
**Evidencia.** Pruebas e2e "A2: sin token → 401 en todas las rutas del personal", "A4: usuario sin grupo de personal → 403" y "usuario desactivado en la BD → 403". Además, `rutas-protegidas.spec.ts` falla si alguien agrega una ruta pública nueva sin declararla.

### A3 — Escalamiento horizontal entre municipios (Fase 7, D-36)
**Escenario.** Un enlace municipal con cuenta válida pide un reporte de otro municipio por id, filtra la bandeja con `municipioId` ajeno, exporta, consulta estadísticas o el mapa, o intenta atender una alerta ajena.
**Qué se hizo.** `auth/alcance.ts` calcula el alcance de cada petición (regionales: todos; enlace: `asignacion_municipio`). Bandeja, exportación, estadísticas, embudo y mapa agregan `r.id_municipio = ANY($n)` en SQL; detalle, cambios de estatus, notas, expediente, cercanos, duplicados y responsables verifican el municipio y responden el **mismo 404** que un reporte inexistente. Sin asignaciones no se ve nada.
**Evidencia.** e2e "A3: el enlace no ve reportes de otro municipio: 404 uniforme…", "A3: bandeja, exportación y estadísticas solo cuentan sus municipios…", "un enlace sin municipios asignados no ve nada", "alerta de punto recurrente… solo visible para sus municipios" (corren como usuario maestro y como `rieti_app`).
**Hueco conocido.** El filtro vive en la aplicación; Row Level Security en PostgreSQL sigue planeado como segunda barrera.

### A7 / A8 — Archivos maliciosos y metadatos en fotos (Fase 8, D-42)
**Escenario.** Quien reporta (o alguien con su folio y clave) sube un PDF o un ejecutable renombrado como `.jpg`, una imagen con código oculto al final, una "bomba" de descompresión o una foto con la ubicación GPS de su teléfono.
**Qué se hizo.** La subida va a una zona de entrada privada con un POST prefirmado que S3 limita a 5 MB y a una clave exacta. Al confirmar, el servidor revisa los primeros bytes (solo JPEG, PNG o WebP), decodifica con un límite de 50 MP y vuelve a codificar a JPEG sin metadatos; lo que no pasa se borra. El nombre final es aleatorio. La app y la web reducen y quitan metadatos antes de subir; la captura de la cámara se borra del teléfono.
**Evidencia.** `backend/test/fotos.spec.ts` (tipos por contenido, extensión falsa, EXIF y GPS eliminados, carga oculta descartada, imagen dañada, URL que caduca en 60 s, política de subida con tamaño y clave) y el bloque e2e "evidencia fotográfica (Fase 8)" (rechazos con limpieza de la entrada, JPEG guardado sin EXIF, límite de 3, 24 h, 404 para otro municipio, registro `foto` en la bitácora, nada en consulta, CSV ni estadísticas).
**Hueco conocido.** Durante la ventana de validación (segundos) el archivo original vive en la zona de entrada privada; si nadie confirma, expira en 1 día. El POST prefirmado incluye el nombre del bucket (lleva el ID de la cuenta) y solo lo recibe el cliente que reporta.

### A11 — JWT manipulado
**Evidencia.** `backend/test/jwt-falsificado.spec.ts` usa el verificador real (`aws-jwt-verify`) y comprueba que se rechazan `alg:none`, HS256 con secreto inventado, emisor de otro pool y basura.

### A16 — Reidentificación del denunciante
**Qué hay.** La base de datos no tiene columnas de IP, dispositivo ni publicidad (prueba e2e "el esquema no tiene columnas de IP ni de dispositivo"), y el API rechaza cualquier campo extra en el reporte (prueba "rechaza campos no permitidos (p. ej. un identificador de dispositivo)"). La IP solo se usa **en memoria** para el límite de tasa.
**Huecos conocidos.** El WAF conserva muestras de solicitudes (incluyen IP) durante 3 horas para diagnóstico; los logs de acceso del ALB (90 días) registran la IP de CloudFront, no la del ciudadano (por diseño de la arquitectura; **no verificado** en un log real). CloudFront no tiene logs de acceso activados.

### A19 — Secretos en el repositorio público
**Evidencia.** `gitleaks 8.28.0` sobre todo el historial (todas las ramas) el 10-oct-2026: "no leaks found". El workflow `.github/workflows/seguridad.yml` repite el escaneo en cada push y PR. Durante el desarrollo se compartieron credenciales por canales no seguros; su rotación es un pendiente del equipo (D-10). Esos detalles no se publican en el repositorio.

### A32–A37 — Cuentas de ciudadano (Fase 4, D-19)
**Qué hay.** Pool de Cognito propio para ciudadanos; el API media registro, confirmación, login, recuperación, cambio de contraseña, cierre de sesión global y eliminación. La tabla `cuentas_ciudadano` guarda solo el `sub` y fechas. En `POST /reportes`, el token de ciudadano es opcional y solo cuenta si el cuerpo trae `vincularCuenta: true`; las APK anteriores que mandan el token del personal siguen funcionando porque ese token se ignora.
**Evidencia.** `backend/test/ciudadanos.service.spec.ts` (respuestas uniformes, 401/403/429 del login, orden del borrado) y el bloque e2e "cuentas de ciudadano (Fase 4)" (separación de tokens, reporte con token pero sin vínculo sigue anónimo, otra cuenta no ve reportes ajenos, el personal no ve el vínculo, eliminar conserva el reporte, compatibilidad con el token del personal). En el emulador se comprobó que el reporte sale sin `Authorization` con el interruptor apagado y con él encendido lleva `vincularCuenta: true`.
**Huecos conocidos.** Sin MFA para ciudadanos (decisión de usabilidad: la cuenta solo da acceso a estatus de reportes propios, sin datos del menor). Sin CAPTCHA en el registro (A36). El límite por IP se comparte entre personas detrás de la misma red (NAT de operador). El correo de Cognito por defecto tiene una cuota diaria baja.

## 5. Marcos de referencia

- OWASP API Security Top 10 (2023): API1 (BOLA → A1, A3), API2 (autenticación → A2, A10, A11), API4 (consumo de recursos → A9, A22), API5 (autorización por función → A4), API8 (configuración → A12, A13, A15).
- OWASP MASVS (Android): STORAGE (A17), NETWORK (A12), RESILIENCE (A18).
- LGPDPPSO y LGDNNA: minimización de datos y protección reforzada de datos de menores (RNF-27 a RNF-29).
