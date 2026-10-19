# Roles y permisos (D-18)

> Estado al cierre de la Fase 9. Solo se afirma lo que el código hace; lo demás está en [Planeado](#planeado).

## Cómo se aplica en el código

- **Fuente única:** `MATRIZ_PERMISOS` en `backend/src/auth/roles.ts` dice qué grupos de Cognito pueden ejecutar cada acción.
- Cada ruta del personal declara su acción con `@Requiere('<permiso>')`, que aplica exactamente los grupos de la matriz.
- El guard global (`backend/src/auth/jwt.guard.ts`) **deniega por defecto**. Toda ruta exige un JWT válido de Cognito, salvo las marcadas `@Publico()`. Además verifica que el usuario exista en la tabla `usuario` y esté **activo**.
- Las rutas de la cuenta de ciudadano llevan `@Ciudadano()`: exigen un JWT del pool de ciudadanos (otro emisor y otro `client_id`) y no aceptan el del personal; las rutas del personal no aceptan el de ciudadano. `POST /reportes` lleva `@CiudadanoOpcional()`: el token solo se usa si el cuerpo trae `vincularCuenta: true`.
- La web del personal muestra el perfil y sus permisos con `GET /api/v1/auth/perfil`, que calcula los permisos con la misma matriz e incluye los municipios que la persona puede ver.
- **Alcance territorial (Fase 7, D-36):** además del permiso, cada consulta del personal se limita a sus municipios (`backend/src/auth/alcance.ts`). Administrador y Coordinador regional ven todos; el enlace municipal solo los de `asignacion_municipio`. Fuera del alcance, la respuesta es el mismo 404 que un reporte inexistente.

## Perfiles

| Perfil | Cómo se identifica hoy | Estado |
|---|---|---|
| Ciudadano anónimo | Sin sesión | **Implementado** |
| Ciudadano con cuenta (opcional, D-19) | JWT del pool de Cognito `rieti-prod-ciudadanos` (separado del personal) | **Implementado.** Solo ve sus propios reportes vinculados (estatus e historial público); no tiene ningún permiso del personal. |
| Ciudadano con contacto | — | **Planeado.** La opción aparece como "no disponible" en la web: guardar datos de contacto requiere cifrarlos primero. |
| Enlace municipal | Grupo de Cognito `PersonalSIPINNA` | **Implementado.** Solo ve los municipios que el Administrador le asigna (Fase 7). |
| Coordinador regional | Grupo de Cognito `CoordinadorRegional` | **Implementado (Fase 7).** Ve todos los municipios y gestiona casos; no administra personal, parámetros ni la bitácora de accesos. |
| Administrador | Grupo de Cognito `Administrador` | **Implementado.** Todos los municipios y la administración. |

## Matriz implementada hoy

✅ = permitido · — = no permitido

Las columnas del personal aplican **dentro de su alcance territorial**. El Coordinador regional tiene los mismos permisos que el enlace municipal (con alcance de todos los municipios) más lo indicado en la tabla de la Fase 7.

| Acción | Ruta | Ciudadano anónimo | Ciudadano con cuenta | Enlace municipal | Administrador |
|---|---|---|---|---|---|
| Ver el aviso de privacidad | `GET /avisos-privacidad/vigente` | ✅ | ✅ | ✅ | ✅ |
| Ver catálogos, municipios y actividades | `GET /catalogos`, `GET /catalogos/municipios`, `GET /catalogos/actividades` | ✅ | ✅ | ✅ | ✅ |
| Dirección sugerida y municipio de un punto | `GET /geo/reversa` | ✅ (30/min por IP; solo Estado de México) | ✅ | ✅ | ✅ |
| Teselas del mapa | `GET /geo/teselas/:z/:x/:y.png` | ✅ (600/min por IP; solo Estado de México, zoom 8–18) | ✅ | ✅ | ✅ |
| Crear un reporte anónimo | `POST /reportes` | ✅ (5 por minuto por IP) | ✅ | ✅ | ✅ |
| Consultar un reporte con folio + clave (solo estatus y fechas) | `POST /reportes/consulta` | ✅ | ✅ | ✅ | ✅ |
| Ver el directorio de la red | `GET /red-municipios` | ✅ | ✅ | ✅ | ✅ |
| Iniciar sesión | `POST /auth/login` | — (sin cuenta) | — (usa `/ciudadanos/login`) | ✅ | ✅ |
| Ver su perfil y permisos (`perfil.ver`) | `GET /auth/perfil` | — | — | ✅ | ✅ |
| Ver la bandeja (con filtros de estatus, municipio, actividad, fechas, folio, sin atender, riesgo y pendientes) y el detalle (`reportes.ver`) | `GET /reportes`, `GET /reportes/:id` | — | — | ✅ | ✅ |
| Cambiar estatus y agregar notas (`reportes.gestionar`) | `PATCH /reportes/:id/estatus`, `POST /reportes/:id/seguimientos` | — | — | ✅ | ✅ |
| Ver el panel de estadísticas, solo agregados (`estadisticas.ver`) | `GET /estadisticas/resumen`, `/distribuciones`, `/tiempos`, `/sin-atender`, `/mapa-calor` | — | — | ✅ | ✅ |
| Exportar la bandeja filtrada a CSV, sin descripciones ni coordenadas (`reportes.exportar`) | `GET /reportes/exportar.csv` | — | — | ✅ | ✅ |
| Editar los contactos de la red (`red.editar`) | `PUT /red-municipios/:municipioId` | — | — | — | ✅ |
| Adjuntar hasta 3 fotos a su reporte en las 24 h siguientes (folio + clave; Fase 8) | `POST /reportes/fotos/solicitud`, `POST /reportes/fotos/confirmar` | ✅ (10/min por IP) | ✅ | ✅ | ✅ |
| Ver las fotos de un reporte (URL de 60 s, queda en la bitácora de accesos; `reportes.ver`, Fase 8) | `GET /reportes/:id/fotos` | — | — | ✅ | ✅ |
| Vincular un reporte a su cuenta (interruptor, apagado por defecto) | `POST /reportes` con `vincularCuenta: true` | — (400 `SESION_REQUERIDA`) | ✅ | — | — |
| Registro, confirmación, reenvío de código, login, refresh, recuperación de contraseña | `POST /ciudadanos/registro`, `/confirmar`, `/reenviar-codigo`, `/login`, `/refresh`, `/olvide-contrasena`, `/restablecer-contrasena` | ✅ (5, 10, 3, 5, 20, 3 y 5 por minuto por IP; respuestas uniformes) | ✅ | ✅ (ruta pública; crea una cuenta de ciudadano aparte) | ✅ (ídem) |
| Ver su cuenta (correo desde Cognito, fecha y número de reportes) | `GET /ciudadano/cuenta` | — | ✅ (solo la propia) | — | — |
| Ver sus reportes vinculados (estatus e historial público) | `GET /ciudadano/reportes` | — | ✅ (solo los propios) | — | — |
| Cambiar contraseña / cerrar sesión en todos los dispositivos | `POST /ciudadano/cuenta/contrasena`, `POST /ciudadano/cuenta/cerrar-sesion` | — | ✅ | — | — |
| Eliminar su cuenta (los reportes se conservan sin vínculo) | `DELETE /ciudadano/cuenta` | — | ✅ (3/min) | — | — |

### Fase 7: expediente, alertas y administración

| Acción (permiso) | Ruta | Enlace municipal | Coordinador regional | Administrador |
|---|---|---|---|---|
| Editar el expediente, vincular o quitar duplicados, ver responsables (`expediente.editar`) | `PATCH /reportes/:id/expediente`, `POST`/`DELETE /reportes/:id/duplicado`, `GET /reportes/:id/responsables` | ✅ | ✅ | ✅ |
| Ver posibles duplicados y catálogos del expediente (`reportes.ver`) | `GET /reportes/:id/cercanos`, `GET /catalogos/expediente` | ✅ | ✅ | ✅ |
| Embudo de atención (`estadisticas.ver`) | `GET /estadisticas/embudo` | ✅ | ✅ | ✅ |
| Ver alertas de punto recurrente (`alertas.ver`) y atenderlas (`alertas.gestionar`) | `GET /alertas`, `PATCH /alertas/:id` | ✅ | ✅ | ✅ |
| Asignar municipios al personal (`personal.administrar`) | `GET /admin/personal`, `PUT /admin/personal/:id/municipios` | — | — | ✅ |
| Parámetros y dependencias (`configuracion.editar`) | `GET`/`PUT /admin/configuracion`, `GET`/`POST /admin/dependencias`, `PATCH /admin/dependencias/:id` | — | — | ✅ |
| Bitácora de accesos (`accesos.ver`) | `GET /admin/accesos` | — | — | ✅ |
| Mapa territorial y hallazgos (`estadisticas.ver`; Fase 9) | `GET /estadisticas/territorio`, `GET /estadisticas/hallazgos` | ✅ (sus municipios) | ✅ | ✅ |
| Registro institucional (`reportes.registrar`; Fase 9) | `POST /reportes/institucional` | ✅ (sus municipios) | ✅ | ✅ |
| Base regional anonimizada (`base.exportar`; Fase 9) | `GET /estadisticas/base-regional.csv` | — | ✅ | ✅ |

Reglas que aplican a todos los perfiles:
- Los cambios de estatus siguen la máquina de estados (D-30). Cancelar exige motivo; marcar Reincidente exige comentario; concluir exige el resultado (Fase 7).
- Consultar un detalle o exportar queda en la bitácora de accesos (append-only).
- La bitácora `seguimiento` es solo de inserción: ningún perfil puede editarla ni borrarla.
- Ningún perfil del personal ve datos personales del denunciante: no existen en la base (RIETI guarda solo el `sub` de Cognito de las cuentas, nunca el correo) y la bandeja y el detalle no muestran si un reporte está vinculado a una cuenta.
- **Alta y baja de personal y perfil:** no hay endpoint. Se hace por la CLI de AWS (grupo de Cognito), según `docs/RUNBOOK-AWS.md`. Los municipios del enlace se asignan en la web (Administración). Desactivar a una persona (`usuario.activo = false`) le bloquea el acceso en la siguiente petición.

## Cómo se verifica

| Prueba | Qué comprueba |
|---|---|
| `backend/test/rutas-protegidas.spec.ts` | La lista cerrada de rutas públicas. Cada ruta del personal tiene exactamente el permiso de la tabla de arriba y los grupos de `MATRIZ_PERMISOS`. El enlace municipal no tiene `red.editar`. |
| `backend/test/e2e/api.e2e.spec.ts` (Fase 7) | Aislamiento por municipio en detalle, cambios, expediente, bandeja, exportación, estadísticas, mapa y alertas; enlace sin asignaciones no ve nada; administración solo para el Administrador (403 para coordinador y enlace); perfil con municipios. |
| `backend/test/e2e/api.e2e.spec.ts` | Contra PostgreSQL real: token de ciudadano → 401 en rutas del personal y token del personal → 401 en `/ciudadano/*`; una cuenta no ve reportes de otra; sin token → 401; sin grupo → 403; usuario desactivado → 403; enlace municipal → 403 al editar la red; administrador → 200; el perfil del enlace no incluye `red.editar` y el del administrador sí. |

## Planeado

| Tema | Qué falta |
|---|---|
| RLS por municipio | Segunda barrera en PostgreSQL además del filtro de la aplicación. |
| Coordinador con solo agregados | Si el socio lo pide, un perfil regional de solo lectura de agregados (hoy el coordinador ve el detalle para coordinar la canalización). |
| Ciudadano con contacto | Cifrado de los datos de contacto a nivel aplicación con una llave en Secrets Manager (cambio de infraestructura). |
| Alta de personal desde la plataforma | `POST /usuarios` (solo administrador) con `AdminCreateUser`; hoy es por CLI. |
| MFA obligatorio | Hosted UI + PKCE (D-06). |
