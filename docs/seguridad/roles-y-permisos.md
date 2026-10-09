# Roles y permisos (D-18)

> Estado al 10-oct-2026, rama `feat/web-publica`. Solo se afirma lo que el código hace; lo demás está en [Planeado](#planeado).

## Cómo se aplica en el código

- **Fuente única:** `MATRIZ_PERMISOS` en `backend/src/auth/roles.ts` dice qué grupos de Cognito pueden ejecutar cada acción.
- Cada ruta del personal declara su acción con `@Requiere('<permiso>')`, que aplica exactamente los grupos de la matriz.
- El guard global (`backend/src/auth/jwt.guard.ts`) **deniega por defecto**. Toda ruta exige un JWT válido de Cognito, salvo las marcadas `@Publico()`. Además verifica que el usuario exista en la tabla `usuario` y esté **activo**.
- La web del personal muestra el perfil y sus permisos con `GET /api/v1/auth/perfil`, que calcula los permisos con la misma matriz.

## Perfiles

| Perfil | Cómo se identifica hoy | Estado |
|---|---|---|
| Ciudadano anónimo | Sin sesión | **Implementado** |
| Ciudadano con contacto | — | **Planeado.** La opción aparece como "no disponible" en la web: guardar datos de contacto requiere cifrarlos primero. |
| Enlace municipal | Grupo de Cognito `PersonalSIPINNA` | **Implementado**, sin filtro por municipio (ve los reportes de todos los municipios). |
| Coordinador | — | **Planeado.** No existe grupo en Cognito; crearlo es un cambio de infraestructura. |
| Administrador | Grupo de Cognito `Administrador` | **Implementado.** |

## Matriz implementada hoy

✅ = permitido · — = no permitido

| Acción | Ruta | Ciudadano anónimo | Enlace municipal | Administrador |
|---|---|---|---|---|
| Ver el aviso de privacidad | `GET /avisos-privacidad/vigente` | ✅ | ✅ | ✅ |
| Ver catálogos y municipios | `GET /catalogos`, `GET /catalogos/municipios` | ✅ | ✅ | ✅ |
| Crear un reporte anónimo | `POST /reportes` | ✅ (5 por minuto por IP) | ✅ | ✅ |
| Consultar un reporte con folio + clave (solo estatus y fechas) | `POST /reportes/consulta` | ✅ | ✅ | ✅ |
| Ver el directorio de la red | `GET /red-municipios` | ✅ | ✅ | ✅ |
| Iniciar sesión | `POST /auth/login` | — (sin cuenta) | ✅ | ✅ |
| Ver su perfil y permisos (`perfil.ver`) | `GET /auth/perfil` | — | ✅ | ✅ |
| Ver la bandeja y el detalle (`reportes.ver`) | `GET /reportes`, `GET /reportes/:id` | — | ✅ | ✅ |
| Cambiar estatus y agregar notas (`reportes.gestionar`) | `PATCH /reportes/:id/estatus`, `POST /reportes/:id/seguimientos` | — | ✅ | ✅ |
| Ver el panel de estadísticas, solo agregados (`estadisticas.ver`) | `GET /estadisticas/resumen` | — | ✅ | ✅ |
| Editar los contactos de la red (`red.editar`) | `PUT /red-municipios/:municipioId` | — | — | ✅ |

Reglas que aplican a todos los perfiles:
- Los cambios de estatus siguen la tabla de transiciones de la Etapa 1. Descartar exige motivo; reabrir un caso concluido exige comentario.
- La bitácora `seguimiento` es solo de inserción: ningún perfil puede editarla ni borrarla.
- Ningún perfil ve datos personales del denunciante, porque no existen.
- **Alta y baja de personal:** no hay endpoint. Se hace por la CLI de AWS, según `docs/RUNBOOK-AWS.md`, y lo ejecuta quien administra la cuenta. Desactivar a una persona (`usuario.activo = false`) le bloquea el acceso en la siguiente petición.

## Cómo se verifica

| Prueba | Qué comprueba |
|---|---|
| `backend/test/rutas-protegidas.spec.ts` | La lista cerrada de rutas públicas. Cada ruta del personal tiene exactamente el permiso de la tabla de arriba y los grupos de `MATRIZ_PERMISOS`. El enlace municipal no tiene `red.editar`. |
| `backend/test/e2e/api.e2e.spec.ts` | Contra PostgreSQL real: sin token → 401; sin grupo → 403; usuario desactivado → 403; enlace municipal → 403 al editar la red; administrador → 200; el perfil del enlace no incluye `red.editar` y el del administrador sí. |

## Planeado

| Tema | Qué falta |
|---|---|
| Coordinador | Grupo en Cognito (Terraform) y permisos en la matriz; propuesta: lectura de todos los municipios y panel completo, sin editar la red. |
| Filtro por municipio del enlace | Asignar `usuario.id_municipio` a cada enlace y filtrar bandeja, detalle y panel por ese municipio (y después aplicar RLS en PostgreSQL). Hoy ningún usuario tiene municipio asignado. |
| Ciudadano con contacto | Cifrado de los datos de contacto a nivel aplicación con una llave en Secrets Manager (cambio de infraestructura). |
| Alta de personal desde la plataforma | `POST /usuarios` (solo administrador) con `AdminCreateUser`; hoy es por CLI. |
| MFA obligatorio | Hosted UI + PKCE (D-06). |
