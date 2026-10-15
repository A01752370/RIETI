# Roles y permisos (D-18)

> Estado al 15-oct-2026 (Fase 4). Solo se afirma lo que el código hace; lo demás está en [Planeado](#planeado).

## Cómo se aplica en el código

- **Fuente única:** `MATRIZ_PERMISOS` en `backend/src/auth/roles.ts` dice qué grupos de Cognito pueden ejecutar cada acción.
- Cada ruta del personal declara su acción con `@Requiere('<permiso>')`, que aplica exactamente los grupos de la matriz.
- El guard global (`backend/src/auth/jwt.guard.ts`) **deniega por defecto**. Toda ruta exige un JWT válido de Cognito, salvo las marcadas `@Publico()`. Además verifica que el usuario exista en la tabla `usuario` y esté **activo**.
- Las rutas de la cuenta de ciudadano llevan `@Ciudadano()`: exigen un JWT del pool de ciudadanos (otro emisor y otro `client_id`) y no aceptan el del personal; las rutas del personal no aceptan el de ciudadano. `POST /reportes` lleva `@CiudadanoOpcional()`: el token solo se usa si el cuerpo trae `vincularCuenta: true`.
- La web del personal muestra el perfil y sus permisos con `GET /api/v1/auth/perfil`, que calcula los permisos con la misma matriz.

## Perfiles

| Perfil | Cómo se identifica hoy | Estado |
|---|---|---|
| Ciudadano anónimo | Sin sesión | **Implementado** |
| Ciudadano con cuenta (opcional, D-19) | JWT del pool de Cognito `rieti-prod-ciudadanos` (separado del personal) | **Implementado.** Solo ve sus propios reportes vinculados (estatus e historial público); no tiene ningún permiso del personal. |
| Ciudadano con contacto | — | **Planeado.** La opción aparece como "no disponible" en la web: guardar datos de contacto requiere cifrarlos primero. |
| Enlace municipal | Grupo de Cognito `PersonalSIPINNA` | **Implementado**, sin filtro por municipio (ve los reportes de todos los municipios). |
| Coordinador | — | **Planeado.** No existe grupo en Cognito; crearlo es un cambio de infraestructura. |
| Administrador | Grupo de Cognito `Administrador` | **Implementado.** |

## Matriz implementada hoy

✅ = permitido · — = no permitido

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
| Ver la bandeja y el detalle (`reportes.ver`) | `GET /reportes`, `GET /reportes/:id` | — | — | ✅ | ✅ |
| Cambiar estatus y agregar notas (`reportes.gestionar`) | `PATCH /reportes/:id/estatus`, `POST /reportes/:id/seguimientos` | — | — | ✅ | ✅ |
| Ver el panel de estadísticas, solo agregados (`estadisticas.ver`) | `GET /estadisticas/resumen`, `/distribuciones`, `/tiempos`, `/sin-atender`, `/mapa-calor` | — | — | ✅ | ✅ |
| Exportar la bandeja filtrada a CSV, sin descripciones ni coordenadas (`reportes.exportar`) | `GET /reportes/exportar.csv` | — | — | ✅ | ✅ |
| Editar los contactos de la red (`red.editar`) | `PUT /red-municipios/:municipioId` | — | — | — | ✅ |
| Vincular un reporte a su cuenta (interruptor, apagado por defecto) | `POST /reportes` con `vincularCuenta: true` | — (400 `SESION_REQUERIDA`) | ✅ | — | — |
| Registro, confirmación, reenvío de código, login, refresh, recuperación de contraseña | `POST /ciudadanos/registro`, `/confirmar`, `/reenviar-codigo`, `/login`, `/refresh`, `/olvide-contrasena`, `/restablecer-contrasena` | ✅ (5, 10, 3, 5, 20, 3 y 5 por minuto por IP; respuestas uniformes) | ✅ | ✅ (ruta pública; crea una cuenta de ciudadano aparte) | ✅ (ídem) |
| Ver su cuenta (correo desde Cognito, fecha y número de reportes) | `GET /ciudadano/cuenta` | — | ✅ (solo la propia) | — | — |
| Ver sus reportes vinculados (estatus e historial público) | `GET /ciudadano/reportes` | — | ✅ (solo los propios) | — | — |
| Cambiar contraseña / cerrar sesión en todos los dispositivos | `POST /ciudadano/cuenta/contrasena`, `POST /ciudadano/cuenta/cerrar-sesion` | — | ✅ | — | — |
| Eliminar su cuenta (los reportes se conservan sin vínculo) | `DELETE /ciudadano/cuenta` | — | ✅ (3/min) | — | — |

Reglas que aplican a todos los perfiles:
- Los cambios de estatus siguen la tabla de transiciones de la Etapa 1. Descartar exige motivo; reabrir un caso concluido exige comentario.
- La bitácora `seguimiento` es solo de inserción: ningún perfil puede editarla ni borrarla.
- Ningún perfil del personal ve datos personales del denunciante: no existen en la base (RIETI guarda solo el `sub` de Cognito de las cuentas, nunca el correo) y la bandeja y el detalle no muestran si un reporte está vinculado a una cuenta.
- **Alta y baja de personal:** no hay endpoint. Se hace por la CLI de AWS, según `docs/RUNBOOK-AWS.md`, y lo ejecuta quien administra la cuenta. Desactivar a una persona (`usuario.activo = false`) le bloquea el acceso en la siguiente petición.

## Cómo se verifica

| Prueba | Qué comprueba |
|---|---|
| `backend/test/rutas-protegidas.spec.ts` | La lista cerrada de rutas públicas. Cada ruta del personal tiene exactamente el permiso de la tabla de arriba y los grupos de `MATRIZ_PERMISOS`. El enlace municipal no tiene `red.editar`. |
| `backend/test/e2e/api.e2e.spec.ts` | Contra PostgreSQL real: token de ciudadano → 401 en rutas del personal y token del personal → 401 en `/ciudadano/*`; una cuenta no ve reportes de otra; sin token → 401; sin grupo → 403; usuario desactivado → 403; enlace municipal → 403 al editar la red; administrador → 200; el perfil del enlace no incluye `red.editar` y el del administrador sí. |

## Planeado

| Tema | Qué falta |
|---|---|
| Coordinador | Grupo en Cognito (Terraform) y permisos en la matriz; propuesta: lectura de todos los municipios y panel completo, sin editar la red. |
| Filtro por municipio del enlace | Asignar `usuario.id_municipio` a cada enlace y filtrar bandeja, detalle y panel por ese municipio (y después aplicar RLS en PostgreSQL). Hoy ningún usuario tiene municipio asignado. |
| Ciudadano con contacto | Cifrado de los datos de contacto a nivel aplicación con una llave en Secrets Manager (cambio de infraestructura). |
| Alta de personal desde la plataforma | `POST /usuarios` (solo administrador) con `AdminCreateUser`; hoy es por CLI. |
| MFA obligatorio | Hosted UI + PKCE (D-06). |
