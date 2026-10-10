# Identificación de ataques — RIETI

> Etapa 3 · Fecha de corte: 10-oct-2026 · `main` (incluye web pública y del personal, municipios, red y matriz de permisos).
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
| A3 | Escalamiento horizontal entre municipios | Un enlace del municipio A pide reportes del municipio B | Fuga entre municipios | Planeado (hoy hay un solo municipio y los reportes no guardan municipio) |
| A4 | Escalamiento vertical | Una cuenta sin rol de personal llama rutas del personal | Acceso indebido | Mitigado (probado) |
| A5 | Inyección SQL | Payloads en folio, filtros o campos de texto | Lectura/borrado de la BD | Mitigado (probado) |
| A6 | XSS almacenado | `<script>` en la descripción, visto luego por el personal | Robo de sesión del personal | Mitigado (probado): React escapa el texto, sin `dangerouslySetInnerHTML`, CSP sin `unsafe-inline` |
| A7 | Subida de archivos maliciosos | Evidencias con malware o archivos enormes | Malware, costo | No aplica aún (no hay subida de evidencias) |
| A8 | Fuga de metadatos EXIF | Foto con GPS del teléfono del denunciante | Reidentificación | No aplica aún (no hay fotos) |
| A9 | Spam / reportes falsos masivos | Scripts que envían miles de reportes | Saturar al personal, costo | Mitigado (probado) |
| A10 | Fuerza bruta al login | Diccionarios contra `/auth/login` | Tomar una cuenta del personal | Parcial (límite de tasa y bloqueo de Cognito; MFA no obligatorio) |
| A11 | JWT manipulado | `alg:none`, firma inventada, token de otro pool | Suplantar al personal | Mitigado (probado) |
| A12 | Intermediario (MITM) | Wi-Fi pública, proxy malicioso | Leer o alterar reportes en tránsito | Mitigado (configuración) |
| A13 | Saltarse el WAF yendo directo al ALB | Llamar al balanceador sin pasar por CloudFront | Evadir límites y reglas | Mitigado (configuración) |
| A14 | Exposición de evidencias en S3 | Bucket público o listable | Fuga masiva | Mitigado (configuración); sin evidencias aún |
| A15 | Fuga de datos sensibles en logs | Cuerpos de petición, contraseñas o claves en logs | Fuga silenciosa | Mitigado (configuración) |
| A16 | Reidentificación del denunciante | IP, ID de dispositivo o ID de publicidad guardados con el reporte | Exponer a quien reporta | Parcial (nada en la BD; muestras del WAF con IP por 3 h) |
| A17 | Datos en el teléfono | Respaldo en la nube, capturas, archivos de la app | Fuga desde el dispositivo | Mitigado (configuración) |
| A18 | Ingeniería inversa de la APK | Decompilar para buscar secretos | Obtener llaves | Parcial (sin secretos en la APK; R8 no activado) |
| A19 | Secretos en el repositorio público | Llaves o tokens en el historial | Control de la infraestructura | Mitigado (probado) + pendiente de rotación (D-10) |
| A20 | Cadena de suministro | Dependencias con vulnerabilidades | Ejecución de código | Parcial |
| A21 | Alterar la bitácora | `UPDATE/DELETE` sobre `seguimiento` | Borrar evidencia | Mitigado (probado) |
| A22 | Denegación de servicio | Cuerpos enormes, ráfagas, listados gigantes | Caída del servicio | Parcial (probado a nivel app; sin prueba de carga) |
| A23 | Rastreo del denunciante por ubicación | Guardar la ubicación del teléfono como dato de quien reporta | Ubicar a quien reporta | Mitigado (configuración) |

## 4. Detalle de los ataques principales

### A1 — Enumeración de folios
**Escenario.** Los folios son secuenciales (`RIETI-2026-000001`, `…000002`). Hasta esta entrega existía `GET /reportes/folio/:folio`, pública y sin clave: cualquiera podía recorrer folios y conocer actividad, edad y estatus de todos los reportes (se verificó el 10-oct-2026 contra producción con el reporte de prueba).
**Qué se hizo.** Se retiró esa ruta. La consulta ahora es `POST /api/v1/reportes/consulta` con folio **y** una clave aleatoria de ~59 bits que solo conoce quien reportó. Respuesta idéntica si el folio no existe o la clave es incorrecta, y bloqueo del folio tras 5 fallos en 15 minutos.
**Evidencia.** `backend/test/e2e/api.e2e.spec.ts` → "A1: clave incorrecta y folio inexistente dan la misma respuesta" y "A1: tras 5 fallos el folio se bloquea aunque cambie la IP".

### A2 / A4 — Acceso sin autenticación o sin rol
**Escenario.** Llamar a la bandeja sin token, o con el token de una cuenta que no es del personal.
**Evidencia.** Pruebas e2e "A2: sin token → 401 en todas las rutas del personal", "A4: usuario sin grupo de personal → 403" y "usuario desactivado en la BD → 403". Además, `rutas-protegidas.spec.ts` falla si alguien agrega una ruta pública nueva sin declararla.

### A3 — Escalamiento horizontal entre municipios (planeado)
Hoy solo existe Atizapán de Zaragoza y los reportes no guardan municipio (`reporte.id_municipio` siempre es NULL), así que todo el personal ve todos los reportes. Cuando haya más municipios se requiere asignar municipio al reporte (D-14) y aplicar Row Level Security. Ver hoja de ruta en [métodos de protección](metodos-proteccion.md#planeado).

### A11 — JWT manipulado
**Evidencia.** `backend/test/jwt-falsificado.spec.ts` usa el verificador real (`aws-jwt-verify`) y comprueba que se rechazan `alg:none`, HS256 con secreto inventado, emisor de otro pool y basura.

### A16 — Reidentificación del denunciante
**Qué hay.** La base de datos no tiene columnas de IP, dispositivo ni publicidad (prueba e2e "el esquema no tiene columnas de IP ni de dispositivo"), y el API rechaza cualquier campo extra en el reporte (prueba "rechaza campos no permitidos (p. ej. un identificador de dispositivo)"). La IP solo se usa **en memoria** para el límite de tasa.
**Huecos conocidos.** El WAF conserva muestras de solicitudes (incluyen IP) durante 3 horas para diagnóstico; los logs de acceso del ALB (90 días) registran la IP de CloudFront, no la del ciudadano (por diseño de la arquitectura; **no verificado** en un log real). CloudFront no tiene logs de acceso activados.

### A19 — Secretos en el repositorio público
**Evidencia.** `gitleaks 8.28.0` sobre todo el historial (todas las ramas) el 10-oct-2026: "no leaks found". El workflow `.github/workflows/seguridad.yml` repite el escaneo en cada push y PR. Durante el desarrollo se compartieron credenciales por canales no seguros; su rotación es un pendiente del equipo (D-10). Esos detalles no se publican en el repositorio.

## 5. Marcos de referencia

- OWASP API Security Top 10 (2023): API1 (BOLA → A1, A3), API2 (autenticación → A2, A10, A11), API4 (consumo de recursos → A9, A22), API5 (autorización por función → A4), API8 (configuración → A12, A13, A15).
- OWASP MASVS (Android): STORAGE (A17), NETWORK (A12), RESILIENCE (A18).
- LGPDPPSO y LGDNNA: minimización de datos y protección reforzada de datos de menores (RNF-27 a RNF-29).
